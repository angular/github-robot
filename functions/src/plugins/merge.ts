import * as Github from "github";
import * as probot from "probot-ts";
import {getAllResults} from "../util";
import {appConfig, MergeConfig} from "../default";

export const CONFIG_FILE = "angular-robot.yml";

// TODO(ocombe): create Typescript interfaces for each payload & DB data
export class MergeTask {
  repositories: FirebaseFirestore.CollectionReference;
  pullRequests: FirebaseFirestore.CollectionReference;

  constructor(private robot: probot.Robot, public db: FirebaseFirestore.Firestore) {
    // App installations on a new repository
    this.robot.on([
      'installation.created',
      'installation_repositories.added'
    ], (context: probot.Context) => this.installInit(context));
    // Pushs to the repository to check for merge conflicts
    this.robot.on('push', (context: probot.Context) => this.onPush(context));
    // PR receives a new label
    this.robot.on('pull_request.labeled', (context: probot.Context) => this.onLabeled(context));
    // PR looses a label
    this.robot.on('pull_request.unlabeled', (context: probot.Context) => this.onUnlabeled(context));
    // PR updated or received a new status update from another app
    this.robot.on([
      'status',
      'pull_request.synchronize',
      // not tracking PR reviews for now, we can use pullapprove status for that
      // 'pull_request.review_requested',
      // 'pull_request_review.submitted',
      // 'pull_request_review.dismissed'
    ], (context: probot.Context) => this.updateStatus(context));
    // PR created or updated
    this.robot.on([
      'pull_request.synchronize',
      'pull_request.opened'
    ], (context: probot.Context) => this.onSynchronize(context));
    // PR closed or reopened (but content not changed)
    this.robot.on([
      'pull_request.closed',
      'pull_request.reopened'
    ], (context: probot.Context) => this.onUpdate(context));

    this.repositories = this.db.collection('repositories');
    this.pullRequests = this.db.collection('pullRequests');
  }

  /**
   * Init all existing repositories
   * Manual call
   */
  async manualInit(): Promise<void> {
    const github = await this.robot.auth();
    const installations = await getAllResults(github, github.apps.getInstallations({}));
    await Promise.all(installations.map(async installation => {
      const authGithub = await this.robot.auth(installation.id);
      const repositories = await authGithub.apps.getInstallationRepositories({});
      await Promise.all(repositories.data.repositories.map(async repository => {
        await this.repositories.doc(repository.id.toString()).set({
          id: repository.id,
          name: repository.name,
          full_name: repository.full_name,
          installationId: installation.id
        }).catch(err => {
          this.robot.log.error(err);
          throw err;
        });
      }));
    }));
  }

  /**
   * Init a single repository
   * Triggered by Firebase when there is an insertion into the Firebase collection "repositories"
   */
  async triggeredInit(repository: Repository & { installationId: number }): Promise<void> {
    const authGithub = await this.robot.auth(repository.installationId);
    return this.init(authGithub, [repository]);
  }

  /**
   * Updates the database with existing PRs when the bot is installed on a new server
   * Triggered by event
   */
  async installInit(context: probot.Context): Promise<void> {
    let repositories: Repository[];
    switch(context.event) {
      case 'installation':
        repositories = context.payload.repositories;
        break;
      case 'installation_repositories':
        repositories = context.payload.repositories_added;
        break;
    }

    await Promise.all(repositories.map(async repository => {
      await this.repositories.doc(repository.id.toString()).set({
        ...repository,
        installationId: context.payload.installation.id
      }).catch(err => {
        this.robot.log.error(err);
        throw err;
      });
    }));
  }

  /**
   * Updates the PRs in Firebase for a list of repositories
   */
  async init(github: probot.Context.github, repositories: Repository[]): Promise<void> {
    await Promise.all(repositories.map(async repository => {
      this.robot.log(`Starting init for repository "${repository.full_name}"`);
      const [owner, repo] = repository.full_name.split('/');

      const [repoPRs, dbPRSnapshots] = await Promise.all([
        this.getGhPRs(github, {owner, repo, state: 'open'}),
        this.pullRequests
          .where('repository', '==', repository.id)
          .where('state', '==', 'open')
          .get()
      ]);

      // list of existing opened PRs in the db
      const dbPRs = [];
      dbPRSnapshots.forEach(doc => {
        dbPRs.push(doc.id);
      });

      // add or update all existing opened PRs
      await Promise.all(repoPRs.map(async pr => {
        await this.updateDbPR(github, owner, repo, pr.number, repository.id, pr).catch(err => {
          this.robot.log.error(err);
          throw err;
        });
        const index = dbPRs.indexOf(pr.id);
        if(index !== -1) {
          dbPRs.splice(index, 1);
        }
      }));

      // update the state of all PRs that are no longer opened
      if(dbPRs.length > 0) {
        const batch = this.db.batch();
        dbPRs.forEach(async id => {
          // should we update all of the other data as well? we ignore them for now
          batch.set(this.pullRequests.doc(id.toString()), {state: 'closed'}, {merge: true});
        });
        batch.commit().catch(err => {
          this.robot.log.error(err);
          throw err;
        });
      }
    }));
  }

  /**
   * Checks whether the label can be added or not, and removes it if necessary. It also updates Firebase.
   * Triggered by event
   */
  async onLabeled(context: probot.Context): Promise<void> {
    const newLabel = context.payload.label.name;
    const pr = context.payload.pull_request;
    const config = await this.getConfig(context);
    const doc = this.pullRequests.doc(pr.id.toString());
    let labels: string[] = [];

    if(newLabel === config.mergeLabel) {
      const {owner, repo} = context.repo();
      // we need the list of labels from Github because we might be adding multiple labels at once
      labels = await this.getGhLabels(context.github, owner, repo, pr.number);

      this.robot.log(`Checking merge label for the PR ${pr.html_url}`);

      // Check if the PR has an override label, in which case we just update Firebase
      /*if(config.overrideLabel && labels.includes(config.overrideLabel)) {
        doc.set({labels}, {merge: true}).catch(err => {
          throw err;
        });
        return;
      }*/

      const failedChecks = await this.getFailedChecks(context, pr, config, labels);

      if(failedChecks.length > 0) {
        const reasons = `- ${failedChecks.join('\n- ')}`;
        /*this.robot.log(`Removing "${config.mergeLabel}" label on PR #${pr.number} (id: ${pr.id}) for the following reasons:\n${reasons}`);

        try {
          await this.removeLabel(context.github, owner, repo, pr.number, config.mergeLabel);
        } catch(e) {
          // the label has already been removed
          this.robot.log.error(e);
          return;
        }*/

        let body = config.mergeRemovedComment;
        if(body) {
          body = body.replace("{{MERGE_LABEL}}", config.mergeLabel).replace("{{PLACEHOLDER}}", reasons);
          /*if(config.overrideLabel) {
            body = body.replace("{{OVERRIDE_LABEL}}", config.overrideLabel);
          }*/
          this.addComment(context.github, owner, repo, pr.number, body).catch(err => {
            throw err;
          });
        }
        // return now, we don't want to add the new label to Firebase
        // return;
      }
    } else {
      labels = await this.getLabels(context);
      if(!labels.includes(newLabel)) {
        labels.push(newLabel);
      }
      if(this.matchLabel(newLabel, config.checks.requiredLabels) || this.matchLabel(newLabel, config.checks.forbiddenLabels)) {
        this.updateStatus(context).catch(err => {
          throw err;
        });
      }
    }

    doc.set({labels}, {merge: true}).catch(err => {
      throw err;
    });
  }

  /**
   * Tests if a string matches a label
   */
  private matchLabel(str: string, labelsList: string[] = []): boolean {
    return labelsList.some(l => !!str.match(new RegExp(l)));
  }

  /**
   * Checks what label was removed and updates the PR status if necessary. It also updates Firebase.
   * Triggered by event
   */
  async onUnlabeled(context: probot.Context): Promise<void> {
    const config = await this.getConfig(context);
    const removedLabel = context.payload.label.name;

    if(this.matchLabel(removedLabel, config.checks.requiredLabels) || this.matchLabel(removedLabel, config.checks.forbiddenLabels)) {
      this.updateStatus(context).catch(err => {
        throw err;
      });
    }

    const pr = context.payload.pull_request;
    const doc = this.pullRequests.doc(pr.id.toString());
    const labels = await this.getLabels(context);
    const index = labels.indexOf(removedLabel);
    if(index !== -1) {
      labels.splice(labels.indexOf(removedLabel), 1);
    }
    await doc.set({labels}, {merge: true});
  }

  /**
   * Gets the PR labels from Github
   */
  private async getGhLabels(github: probot.Context.github, owner: string, repo: string, number: number): Promise<string[]> {
    return (await github.issues.get({
      owner,
      repo,
      number
    })).data.labels.map((label: Github.Label) => label.name);
  }

  /**
   * Gets the list of labels from a PR
   */
  private async getLabels(context: probot.Context, pr?: any): Promise<string[]> {
    const {owner, repo} = context.repo();
    pr = pr || context.payload.pull_request;
    const doc = this.pullRequests.doc(pr.id.toString());
    const dbPR = await doc.get();
    let labels: string[];

    // if the PR is already in Firebase
    if(dbPR.exists) {
      labels = dbPR.data().labels;

      // if we have the labels listed in the PR
      if(labels) {
        return labels;
      }
    }

    // otherwise get the labels from Github and update Firebase
    labels = await this.getGhLabels(context.github, owner, repo, pr.number);
    doc.set({...pr, repository: context.payload.repository.id, labels}, {merge: true}).catch(err => {
      throw err;
    });
    return labels;
  }

  /**
   * Based on the repo config, returns the list of checks that failed for this PR
   */
  private async getFailedChecks(context: probot.Context, pr: any, config: MergeConfig, labels: string[] = []): Promise<string[]> {
    const failedChecks = [];

    // Check if there is any merge conflict
    if(config.checks.noConflict) {
      // if mergeable is null, we need to get the updated status
      if(pr.mergeable === null) {
        const {owner, repo} = context.repo();
        pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);
      }
      // Check if there is a conflict with the base branch
      if(!pr.mergeable) {
        failedChecks.push(`conflicts with base branch "${pr.base.ref}"`);
      }
    }

    // Check if all required labels are present
    if(config.checks.requiredLabels) {
      const missingLabels = [];
      config.checks.requiredLabels.forEach(reqLabel => {
        if(!labels.some(label => !!label.match(new RegExp(reqLabel)))) {
          missingLabels.push(reqLabel);
        }
      });

      if(missingLabels.length > 0) {
        failedChecks.push(`missing required label${missingLabels.length > 1 ? 's' : ''}: "${missingLabels.join('", "')}"`);
      }
    }

    // Check if any forbidden label is present
    if(config.checks.forbiddenLabels) {
      const fbdLabels = [];
      config.checks.forbiddenLabels.forEach(fbdLabel => {
        if(labels.some(label => !!label.match(new RegExp(fbdLabel)))) {
          fbdLabels.push(fbdLabel);
        }
      });

      if(fbdLabels.length > 0) {
        failedChecks.push(`forbidden label${fbdLabels.length > 1 ? 's' : ''} detected: ${fbdLabels.join(', ')}`);
      }
    }

    // Check if we have any failed/pending external status
    const statuses = await this.getStatuses(context, pr.head.sha);
    const failedStatuses = statuses.filter(status => status.state !== 'success');
    if(failedStatuses.length > 0) {
      failedChecks.push(`status${failedStatuses.length > 1 ? 'es' : ''} failing/pending (${failedStatuses.map(status => status.context).join(', ')})`);
    }

    // Check if all required status are present
    if(config.checks.requiredStatuses) {
      const missingStatuses = [];
      config.checks.requiredStatuses.forEach(reqCheck => {
        if(!statuses.some(status => !!status.context.match(new RegExp(reqCheck)))) {
          missingStatuses.push(reqCheck);
        }
      });

      if(missingStatuses.length > 0) {
        failedChecks.push(`missing required status${missingStatuses.length > 1 ? 'es' : ''}: "${missingStatuses.join('", "')}"`);
      }
    }

    return failedChecks;
  }

  /**
   * Removes a label from a PR
   */
  /*private async removeLabel(github: probot.Context.github, owner: string, repo: string, number: string, name: string): Promise<void> {
    return github.issues.removeLabel({
      owner,
      repo,
      number,
      name
    });
  }*/

  /**
   * Adds a comment on a PR
   */
  private async addComment(github: probot.Context.github, owner: string, repo: string, number: string, body: string): Promise<void> {
    return github.issues.createComment({
      owner,
      repo,
      number,
      body
    });
  }

  /**
   * Updates the database when the PR is synchronized (new commit or commit force pushed)
   * Triggered by event
   */
  async onSynchronize(context: probot.Context): Promise<void> {
    const pr = context.payload.pull_request;

    await this.pullRequests.doc(pr.id.toString()).set({
      ...pr,
      repository: context.payload.repository.id,
      synchronized_at: new Date()
    }, {merge: true});
    this.robot.log(`Updated synchronized date for the PR ${pr.id} (${pr.html_url})`);
  }

  /**
   * Updates Firebase data when the PR is updated
   * Triggered by event
   */
  async onUpdate(context: probot.Context): Promise<void> {
    const pr = context.payload.pull_request;

    await this.pullRequests.doc(pr.id.toString()).set(pr, {merge: true});
    this.robot.log(`Updated the PR ${pr.id} (${pr.html_url})`);
  }

  /**
   * Checks/updates the status of all opened PRs when the main repository gets a push update
   * Triggered by event
   */
  // todo(OCOMBE): change it to use database trigger
  async onPush(context: probot.Context): Promise<void> {
    const config = await this.getConfig(context);
    if(!config.checks.noConflict) {
      return;
    }
    const {owner, repo} = context.repo();
    let ref = context.payload.ref.split('/');
    ref = ref[ref.length - 1];

    const pullRequests = await this.pullRequests.where('state', '==', 'open')
      .where('base.ref', '==', ref)
      .get();
    return await pullRequests.forEach(async doc => {
      let pr = doc.data();

      // We need to get the updated mergeable status
      // TODO(ocombe): we might need to setTimeout this until we get a mergeable value !== null (or use probot scheduler)
      pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);

      if(pr.mergeable === false) {
        // get the comments since the last time the PR was synchronized
        if(pr.conflict_comment_at && pr.synchronized_at && pr.conflict_comment_at >= pr.synchronized_at) {
          this.robot.log(`The PR ${pr.html_url} already contains a merge conflict comment since the last synchronized date, skipping it`);
          return;
        }

        if(config.mergeConflictComment) {
          await context.github.issues.createComment({
            owner,
            repo,
            number: pr.number,
            body: config.mergeConflictComment
          });
          this.pullRequests.doc(pr.id.toString()).set({conflict_comment_at: new Date()}, {merge: true}).catch(err => {
            throw err;
          });
          this.robot.log(`Added comment to the PR ${pr.html_url}: conflict with the base branch "${pr.base.ref}"`);
        }
      }
    });
  }

  /**
   * Updates the status of a PR
   */
  private async updateStatus(context: probot.Context): Promise<void> {
    const config = await this.getConfig(context);
    if(config.status.disabled) {
      return;
    }
    let sha, url, pr, labels = [];
    const {owner, repo} = context.repo();

    switch(context.event) {
      case 'pull_request':
      case 'pull_request_review':
        sha = context.payload.pull_request.head.sha;
        url = context.payload.pull_request.html_url;
        pr = context.payload.pull_request;
        labels = await this.getLabels(context);
        break;
      case 'status':
        // ignore status update events that are coming from this bot
        if(context.payload.context === config.status.context) {
          return;
        }
        // ignore status events for commits coming directly from the default branch (most likely using github edit)
        // because they are not coming from a PR (e.g. travis runs for all commits and triggers a status update)
        if(context.payload.branches.name === context.payload.repository.default_branch) {
          return;
        }
        sha = context.payload.sha;
        const matches = (await this.pullRequests.where('head.sha', '==', sha)
          .where('repository', '==', context.payload.repository.id)
          .get());
        await matches.forEach(async doc => {
          pr = doc.data();
          labels = pr.labels || await this.getGhLabels(context.github, owner, repo, pr.number);
        });
        // either init has not finished yet and we don't have this PR in the DB, or it's a status update for a commit
        // made directly on a branch without a PR (e.g. travis runs for all commits and triggers a status update)
        if(!pr) {
          return;
        }
        url = pr.html_url;
        break;
      default:
        throw new Error(`Unhandled event ${context.event} in updateStatus`);
    }

    const statusParams: Github.ReposCreateStatusParams = {
      owner,
      repo,
      sha: sha,
      context: config.status.context,
      state: 'success'
    };

    const failedChecks = await this.getFailedChecks(context, pr, config, labels);

    if(failedChecks.length === 0) {
      statusParams.state = 'success';
      statusParams.description = config.status.successText;
    } else {
      statusParams.state = 'failure';
      statusParams.description = `The following checks are failing: ${failedChecks.join(', ')}`;
    }

    // TODO(ocombe): add a link to a dynamic page with the complete status & some description of what's required
    if(statusParams.description.length > 140) {
      statusParams.description = statusParams.description.substring(0, 137) + '...';
    }

    await context.github.repos.createStatus(statusParams);
    this.robot.log(`Updated status to "${statusParams.state}" for the PR ${url}`);
  }

  /**
   * Get all external statuses except for the one added by this bot
   */
  // TODO(ocombe): use Firebase instead
  private async getStatuses(context: probot.Context, ref: string): Promise<GithubStatus[]> {
    const {owner, repo} = context.repo();
    const config = await this.getConfig(context);

    const res = await context.github.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref
    });

    return res.data.statuses.filter((status: GithubStatus) => status.context !== config.status.context);
  }

  /**
   * Gets the PR data from Github (or parameter) and adds/updates it in Firebase
   */
  private async updateDbPR(github: probot.Context.github, owner: string, repo: string, number: number, repositoryId: number, pr?: any): Promise<any> {
    pr = pr || (await github.pullRequests.get({owner, repo, number})).data;
    const data = {...pr, repository: {owner, name: repo, id: repositoryId}};
    await this.pullRequests.doc(pr.id.toString()).set(data, {merge: true}).catch(err => {
      this.robot.log.error(err);
      throw err;
    });
    return data;
  }

  /**
   * Gets the list of PRs from Github (/!\ expensive, be careful)
   */
  private async getGhPRs(github: probot.Context.github, params: Github.PullRequestsGetAllParams): Promise<any[]> {
    // get the opened PRs against the branch that received a push
    const PRs = await getAllResults(github, github.pullRequests.getAll(params));

    const res = await PRs.map(async (pr: any) => {
      if(pr.state === 'open') {
        return (await github.pullRequests.get({number: pr.number, owner: params.owner, repo: params.repo})).data;
      }
    });

    return Promise.all(res);
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context): Promise<MergeConfig> {
    let repositoryConfig = await context.config(CONFIG_FILE);
    if(!repositoryConfig || !repositoryConfig.merge) {
      repositoryConfig = {merge: {}};
    }
    return {...appConfig.merge, ...repositoryConfig.merge};
  }
}

interface GithubStatus {
  url: string;
  id: number;
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string | null;
  target_url: string | null;
  context: string;
  created_at: string;
  updated_at: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
}
