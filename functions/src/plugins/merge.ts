import * as Github from "github";
import * as probot from "probot";
import {firestore} from "firebase-admin";
import {getAllResults} from "../util";

const CONFIG_FILE = "merge.yml";

// TODO(ocombe): create Typescript interfaces for each payload & DB data
export class MergeTask {
  db = firestore();
  repositories: FirebaseFirestore.CollectionReference;
  pullRequests: FirebaseFirestore.CollectionReference;

  constructor(private robot: probot.Robot) {
    this.robot.on('push', (context: probot.Context) => this.onPush(context));
    this.robot.on('pull_request.labeled', (context: probot.Context) => this.onLabeled(context));
    this.robot.on('pull_request.unlabeled', (context: probot.Context) => this.onUnlabeled(context));
    this.robot.on([
      'status',
      'pull_request.synchronize',
      // not tracking PR reviews for now, we can use pullapprove status for that
      // 'pull_request.review_requested',
      // 'pull_request_review.submitted',
      // 'pull_request_review.dismissed'
    ], (context: probot.Context) => this.updateStatus(context));
    this.robot.on([
      'pull_request.synchronize',
      'pull_request.opened'
    ], (context: probot.Context) => this.onSynchronize(context));
    this.robot.on([
      'pull_request.closed',
      'pull_request.reopened'
    ], (context: probot.Context) => this.onUpdate(context));

    this.repositories = this.db.collection('repositories');
    this.pullRequests = this.db.collection('pullRequests');
  }

  /**
   * Updates the database with existing PRs when the bot is installed on a new server
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    this.robot.log('Starting init...');
    const github = await this.robot.auth();
    const installations = await getAllResults(github, github.apps.getInstallations({}));
    installations.forEach(async installation => {
      const authGithub = await this.robot.auth(installation.id);
      const repositories = await authGithub.apps.getInstallationRepositories({});
      repositories.data.repositories.forEach(async repository => {
        this.repositories.doc(repository.id.toString()).set(repository);

        const [repoPRs, dbPRSnapshots] = await Promise.all([
          this.getPRs(authGithub, {owner: repository.owner.login, repo: repository.name, state: 'open'}),
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
        repoPRs.forEach(pr => {
          this.updateDbPR(authGithub, repository.owner.login, repository.name, pr.number, repository.id, pr);
          const index = dbPRs.indexOf(pr.id);
          if(index !== -1) {
            dbPRs.splice(index, 1);
          }
        });

        // update the state of all PRs that are no longer opened
        if(dbPRs.length > 0) {
          const batch = this.db.batch();
          dbPRs.forEach(async id => {
            // should we update all of the other data as well? we ignore them for now
            batch.set(this.pullRequests.doc(id.toString()), {state: 'closed'}, {merge: true});
          });
          batch.commit();
        }
      });
    });
  }

  /**
   * Checks whether the label can be added or not, and removes it if necessary
   * @param {probot.Context} context
   * @returns {Promise<void>}
   */
  async onLabeled(context: probot.Context): Promise<void> {
    const newLabel = context.payload.label.name;
    const pr = context.payload.pull_request;
    const config: MergeConfig = await context.config(CONFIG_FILE);
    const doc = this.pullRequests.doc(pr.id.toString());
    let labels: string[] = [];

    if(newLabel === config.mergeLabel) {
      const {owner, repo} = context.repo();
      // we need the list of labels from Github because we might be adding multiple labels at once
      labels = await this.getGhLabels(context.github, owner, repo, pr.number);

      this.robot.log.debug(`Checking merge label for the PR ${pr.html_url}`);

      // Check if the PR has an override label, in which case we just update Firebase
      if(config.overrideLabel && labels.includes(config.overrideLabel)) {
        doc.set({labels}, {merge: true});
        return;
      }

      const failedChecks = await this.getFailedChecks(context, pr, config, labels);

      if(failedChecks.length > 0) {
        const reasons = `- ${failedChecks.join('\n- ')}`;
        this.robot.log(`Removing "${config.mergeLabel}" label on PR #${pr.number} (id: ${pr.id}) for the following reasons:\n${reasons}`);

        try {
          await this.removeLabel(context.github, owner, repo, pr.number, config.mergeLabel);
        } catch(e) {
          // error if the label has already been removed
          this.robot.log.error(e);
          return;
        }

        let body = config.mergeRemovedComment;
        body = body.replace("{{MERGE_LABEL}}", config.mergeLabel).replace("{{PLACEHOLDER}}", reasons);
        if(config.overrideLabel) {
          body = body.replace("{{OVERRIDE_LABEL}}", config.overrideLabel);
        }
        return this.addComment(context.github, owner, repo, pr.number, body);
      }
    } else {
      labels = await this.getLabels(context);
      if(!labels.includes(newLabel)) {
        labels.push(newLabel);
      }
      if(this.matchLabel(newLabel, config.requiredLabels) || this.matchLabel(newLabel, config.forbiddenLabels)) {
        this.updateStatus(context);
      }
    }

    doc.set({labels}, {merge: true});
  }

  matchLabel(label: string, labelsList: string[] = []): boolean {
    return labelsList.some(l => !!label.match(new RegExp(l)));
  }

  async onUnlabeled(context: probot.Context): Promise<void> {
    const config: MergeConfig = await context.config(CONFIG_FILE);
    const removedLabel = context.payload.label.name;

    if(this.matchLabel(removedLabel, config.requiredLabels) || this.matchLabel(removedLabel, config.forbiddenLabels)) {
      this.updateStatus(context);
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
   * @param {probot.Context.github} github
   * @param {string} owner
   * @param {string} repo
   * @param {number} number
   * @returns {Promise<string[]>}
   */
  async getGhLabels(github: probot.Context.github, owner: string, repo: string, number: number): Promise<string[]> {
    return (await github.issues.get({
      owner,
      repo,
      number
    })).data.labels.map((label: Github.Label) => label.name);
  }

  async getLabels(context: probot.Context, pr?: any): Promise<string[]> {
    const {owner, repo} = context.repo();
    pr = pr || context.payload.pull_request;
    const doc = this.pullRequests.doc(pr.id.toString());
    const dbPR = await doc.get();
    let labels: string[];

    if(dbPR.exists) {
      labels = dbPR.data().labels;
      if(labels) {
        return labels;
      }
    }

    labels = await this.getGhLabels(context.github, owner, repo, pr.number);
    doc.set({...pr, repository: context.payload.repository.id, labels}, {merge: true});
    return labels;
  }

  async getFailedChecks(context: probot.Context, pr: any, config: MergeConfig, labels: string[] = []): Promise<string[]> {
    const failedChecks = [];

    // if mergeable is null, we need to get the updated status
    if(pr.mergeable === null) {
      const {owner, repo} = context.repo();
      pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);
    }
    // Check if there is a conflict with the base branch
    if(!pr.mergeable) {
      failedChecks.push(`conflicts with base branch "${pr.base.ref}"`);
    }

    // Check if all required labels are present
    if(config.requiredLabels) {
      const missingLabels = [];
      config.requiredLabels.forEach(reqLabel => {
        if(!labels.some(label => !!label.match(new RegExp(reqLabel)))) {
          missingLabels.push(reqLabel);
        }
      });

      if(missingLabels.length > 0) {
        failedChecks.push(`missing required label${missingLabels.length > 1 ? 's' : ''}: "${missingLabels.join('", "')}"`);
      }
    }

    // Check if any forbidden label is present
    if(config.forbiddenLabels) {
      const fbdLabels = [];
      config.forbiddenLabels.forEach(fbdLabel => {
        if(labels.some(label => !!label.match(new RegExp(fbdLabel)))) {
          fbdLabels.push(fbdLabel);
        }
      });

      if(fbdLabels.length > 0) {
        failedChecks.push(`forbidden label${fbdLabels.length > 1 ? 's' : ''} detected: ${fbdLabels.join(', ')}`);
      }
    }

    // Check if we have any failed/pending status
    const statuses = await this.getStatuses(context, pr.head.sha);
    const failedStatuses = statuses.filter(status => status.state !== 'success');
    if(failedStatuses.length > 0) {
      failedChecks.push(`status${failedStatuses.length > 1 ? 'es' : ''} failing/pending (${failedStatuses.map(status => status.context).join(', ')})`);
    }

    // Check if all required status are present
    if(config.requiredStatuses) {
      const missingChecks = [];
      config.requiredStatuses.forEach(reqCheck => {
        if(!statuses.some(status => !!status.context.match(new RegExp(reqCheck)))) {
          missingChecks.push(reqCheck);
        }
      });

      if(missingChecks.length > 0) {
        failedChecks.push(`missing required status${missingChecks.length > 1 ? 'es' : ''}: "${missingChecks.join('", "')}"`);
      }
    }

    return failedChecks;
  }

  /**
   * Removes a label from a PR
   * @param {probot.Context.github} github
   * @param {string} owner
   * @param {string} repo
   * @param {string} number
   * @param {string} name
   * @returns {Promise<void>}
   */
  async removeLabel(github: probot.Context.github, owner: string, repo: string, number: string, name: string): Promise<void> {
    return github.issues.removeLabel({
      owner,
      repo,
      number,
      name
    });
  }

  /**
   * Adds a comment on a PR
   * @param {probot.Context.github} github
   * @param {string} owner
   * @param {string} repo
   * @param {string} number
   * @param {string} body
   * @returns {Promise<void>}
   */
  async addComment(github: probot.Context.github, owner: string, repo: string, number: string, body: string): Promise<void> {
    return github.issues.createComment({
      owner,
      repo,
      number,
      body
    });
  }

  /**
   * Updates the database when the PR is synchronized (new commit or commit force pushed)
   * @param {probot.Context} context
   * @returns {Promise<void>}
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
   * Updates the database when the PR is updated
   * @param {probot.Context} context
   * @returns {Promise<void>}
   */
  async onUpdate(context: probot.Context): Promise<void> {
    const pr = context.payload.pull_request;

    await this.pullRequests.doc(pr.id.toString()).set(pr, {merge: true});
    this.robot.log(`Updated the PR ${pr.id} (${pr.html_url})`);
  }

  /**
   * Checks the PRs status when the main repository gets a push update
   * @param {probot.Context} context
   * @returns {Promise<void>}
   */
  async onPush(context: probot.Context): Promise<void> {
    const {owner, repo} = context.repo();
    const config: MergeConfig = await context.config(CONFIG_FILE);
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
          this.robot.log(`The PR ${pr.html_url} already contains a merge conflict comment since synchronized date, skipping it`);
          return;
        }

        await context.github.issues.createComment({
          owner,
          repo,
          number: pr.number,
          body: config.mergeConflictComment
        });
        this.pullRequests.doc(pr.id.toString()).set({conflict_comment_at: new Date()}, {merge: true});
        this.robot.log(`Added comment to the PR ${pr.html_url}: conflict with the base branch "${pr.base.ref}"`);
      }
    });
  }

  /**
   * Updates the status of a PR
   * @param {probot.Context} context
   * @returns {Promise<void>}
   */
  async updateStatus(context: probot.Context): Promise<void> {
    let sha, url;
    const config: MergeConfig = await context.config(CONFIG_FILE);
    const {owner, repo} = context.repo();
    let pr;
    let labels = [];

    switch(context.event) {
      case 'pull_request':
      case 'pull_request_review':
        sha = context.payload.pull_request.head.sha;
        url = context.payload.pull_request.html_url;
        pr = context.payload.pull_request;
        labels = await this.getLabels(context);
        break;
      case 'status':
        // ignore events generated by this bot
        if(context.payload.context === config.status.name) {
          return;
        }
        sha = context.payload.sha;
        const matches = (await this.pullRequests.where('head.sha', '==', sha)
          .where('repository', '==', context.payload.repository.id)
          .get());
        await matches.forEach(async d => {
          pr = d.data();
          labels = pr.labels || await this.getGhLabels(context.github, owner, repo, pr.number);
        });
        url = pr.html_url;
        if(!pr) {
          // TODO(ocombe): run a light 'init' on a repository on installed event instead of the manual init
          this.robot.log.warn(`Getting a status update on a PR that is not in the database yet, ignoring it. Please run init()`);
          return;
        }
        break;
      default:
        throw new Error(`Unhandled event ${context.event} in updateStatus`);
    }

    const statusParams: Github.ReposCreateStatusParams = {
      owner,
      repo,
      sha: sha,
      context: config.status.name,
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
   * Get all statuses except for the one added by this bot
   * @param {probot.Context} context
   * @param {string} ref
   * @returns {Promise<GithubStatus[]>}
   */
  // TODO(ocombe): use Firebase instead
  async getStatuses(context: probot.Context, ref: string): Promise<GithubStatus[]> {
    const {owner, repo} = context.repo();
    const config: MergeConfig = await context.config(CONFIG_FILE);

    const res = await context.github.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref
    });

    return res.data.statuses.filter((status: GithubStatus) => status.context !== config.status.name);
  }

  /**
   * Adds a PR to Firebase
   * @param {probot.Context.github} github
   * @param {string} owner
   * @param {string} repo
   * @param {number} number
   * @param repository
   * @param pr
   * @returns {Promise<any>}
   */
  async updateDbPR(github: probot.Context.github, owner: string, repo: string, number: number, repository: number, pr?: any): Promise<any> {
    pr = pr || (await github.pullRequests.get({owner, repo, number})).data;
    const data = {...pr, repository};
    this.pullRequests.doc(pr.id.toString()).set(data, {merge: true});
    return data;
  }

  /**
   * Gets the list of PRs from Github (expensive, be careful)
   * @param {probot.Context.github} github
   * @param {Github.PullRequestsGetAllParams} params
   * @returns {Promise<any[]>}
   */
  async getPRs(github: probot.Context.github, params: Github.PullRequestsGetAllParams): Promise<any[]> {
    // get the opened PRs against the branch that received a push
    const PRs = await getAllResults(github, github.pullRequests.getAll(params));

    const res = await PRs.map(async pr => {
      return (await github.pullRequests.get({number: pr.number, owner: params.owner, repo: params.repo})).data;
    });

    return Promise.all(res);
  }
}

interface MergeConfig {
  status: {
    name: string;
    successText: string;
    failureText: string;
  };
  mergeConflictComment: string;
  mergeLabel: string;
  overrideLabel?: string;
  requiredLabels?: string[];
  forbiddenLabels?: string[];
  requiredStatuses?: string[];
  mergeRemovedComment: string;
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
