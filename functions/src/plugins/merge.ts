import Github from '@octokit/rest';
import {Application, Context} from "probot";
import {AppConfig, appConfig, MergeConfig} from "../default";
import {addComment, addLabels, getGhPRLabels, getLabelsNames, matchAny, matchAnyFile, queryPR} from "./common";
import {Task} from "./task";
import {default as GithubGQL, AUTHOR_ASSOCIATION, REVIEW_STATE, STATUS_STATE, CachedPullRequest} from "../typings";

export const CONFIG_FILE = "angular-robot.yml";

// TODO(ocombe): create Typescript interfaces for each payload & DB data
export class MergeTask extends Task {
  constructor(robot: Application, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // Pushes to the repository to check for merge conflicts
    this.dispatch('push', this.onPush.bind(this));
    // PR receives a new label
    this.dispatch('pull_request.labeled', this.onPRLabeled.bind(this));
    // PR looses a label
    this.dispatch('pull_request.unlabeled', this.onPRUnlabeled.bind(this));
    // PR updated or received a new status update from another app
    this.dispatch([
      'status',
      'pull_request.synchronize',
      'pull_request.edited' // Editing a PR can change the base branch (not just text content)
    ], this.updateStatus.bind(this));

    // PR review updated or received
    this.dispatch([
      'pull_request.review_requested',
      'pull_request.review_request_removed',
      'pull_request_review.submitted',
      'pull_request_review.dismissed',
    ], this.updateReview.bind(this));
    // PR created or updated
    this.dispatch([
      'pull_request.synchronize',
      'pull_request.opened'
    ], this.onSynchronize.bind(this));
    // PR closed or reopened (but content not changed)
    this.dispatch([
      'pull_request.closed',
      'pull_request.reopened'
    ], this.onUpdate.bind(this));
  }

  /**
   * Checks whether the label can be added or not, and removes it if necessary. It also updates Firebase.
   * Triggered by event.
   */
  async onPRLabeled(context: Context): Promise<void> {
    const newLabel = context.payload.label.name;
    let pr: Github.PullRequestsGetResponse = context.payload.pull_request;
    const config = await this.getConfig(context);
    const {owner, repo} = context.repo();
    pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
      throw err;
    });

    let updateStatus = false;
    let updateG3Status = false;

    if(newLabel === config.mergeLabel) {
      this.logDebug({context}, `Checking merge label`);

      const checks = await this.getChecksStatus(context, pr, config, pr.labels);

      if(checks.failure.length > 0) {
        const failures = checks.failure.map(check => `&nbsp;&nbsp;&nbsp;&nbsp;![failure](https://raw.githubusercontent.com/angular/github-robot/master/assets/failing.png) ${check}`);
        const pendings = checks.pending.map(check => `&nbsp;&nbsp;&nbsp;&nbsp;![pending](https://raw.githubusercontent.com/angular/github-robot/master/assets/pending.png) ${check}`);
        const reasons = `${failures.concat(pendings).join('\n')}`;

        let body = config.mergeRemovedComment;
        if(body) {
          body = body.replace("{{MERGE_LABEL}}", config.mergeLabel).replace("{{PLACEHOLDER}}", reasons);
          addComment(context.github, owner, repo, pr.number, body).catch(err => {
            throw err;
          });
        }
      }

      updateG3Status = true;
    } else if(config.mergeLinkedLabels && config.mergeLinkedLabels.includes(newLabel) && !getLabelsNames(pr.labels).includes(config.mergeLabel)) {
      // Add the merge label when we add a linked label
      addLabels(context.github, owner, repo, pr.number, [config.mergeLabel])
        .catch(); // If it fails it's because we're trying to add a label that already exists
    }

    if(this.matchLabel(newLabel, pr.labels, config)) {
      updateStatus = true;
    }

    this.updateStatus(context, config, updateStatus, updateG3Status, pr.labels).catch(err => {
      throw err;
    });
  }

  /**
   * Checks which label was removed and updates the PR status if necessary. It also updates Firebase.
   * Triggered by event.
   */
  async onPRUnlabeled(context: Context): Promise<void> {
    const config = await this.getConfig(context);
    const {owner, repo} = context.repo();
    const removedLabel = context.payload.label.name;
    let pr = context.payload.pull_request;
    // we need the list of labels from Github because we might be adding multiple labels at once
    // and we could overwrite some labels because of a race condition
    pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
      throw err;
    });

    if(this.matchLabel(removedLabel, pr.labels, config)) {
      this.updateStatus(context, config, true, false, pr.labels).catch(err => {
        throw err;
      });
    }
  }

  private matchLabel(label: string, labels: GithubGQL.Labels['nodes'], config: MergeConfig): boolean {
    return matchAny([label], config.checks.requiredLabels)
      || matchAny([label], config.checks.forbiddenLabels)
      || (getLabelsNames(labels).includes(config.mergeLabel) && matchAny([label], config.checks.requiredLabelsWhenMergeReady || []));
  }

  /**
   * Gets the list of labels from a PR.
   */
  private async getPRLabels(context: Context, pr?: Github.PullRequestsGetResponse): Promise<GithubGQL.Labels['nodes']> {
    const {owner, repo} = context.repo();
    pr = pr || context.payload.pull_request;
    const doc = this.pullRequests.doc(pr.id.toString());
    const dbPR = await doc.get();
    let labels: GithubGQL.Labels['nodes'];

    // if the PR is already in Firebase
    if(dbPR.exists) {
      labels = dbPR.data().labels;

      // if we have the labels listed in the PR
      if(labels) {
        return labels;
      }
    }

    // otherwise get the labels from Github and update Firebase
    labels = await getGhPRLabels(context.github, owner, repo, pr.number);
    await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, {...pr, labels});
    return labels;
  }

  /**
   * Based on the repository config, returns the list of checks that failed for this PR.
   */
  private async getChecksStatus(context: Context, pr: CachedPullRequest, config: MergeConfig, labels: Github.PullRequestsGetResponseLabelsItem[] = [], statuses?: GithubGQL.StatusContext[]): Promise<ChecksStatus> {
    const checksStatus: ChecksStatus = {
      pending: [],
      failure: []
    };
    const labelsNames = getLabelsNames(labels);

    // Check if there is any merge conflict
    if(config.checks.noConflict) {
      // If mergeable is null, we need to get the updated status
      if(pr.mergeable === null) {
        const {owner, repo} = context.repo();
        pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);
      }
      // Check if there is a conflict with the base branch
      if(pr.mergeable === false) {
        checksStatus.failure.push(`conflicts with base branch "${pr.base.ref}"`);
      }
    }

    // Check if all required labels are present
    if(config.checks.requiredLabels) {
      const missingLabels: string[] = [];
      config.checks.requiredLabels.forEach(reqLabel => {
        if(!labelsNames.some(label => !!label.match(new RegExp(reqLabel)))) {
          missingLabels.push(reqLabel);
        }
      });

      if(missingLabels.length > 0) {
        checksStatus.pending.push(`missing required labels: ${missingLabels.join(', ')}`);
      }
    }

    // Check if all required labels when merge ready are present
    if(labelsNames.includes(config.mergeLabel) && config.checks.requiredLabelsWhenMergeReady) {
      const missingLabels: string[] = [];
      config.checks.requiredLabelsWhenMergeReady.forEach(reqLabel => {
        if(!labelsNames.some(label => !!label.match(new RegExp(reqLabel)))) {
          missingLabels.push(reqLabel);
        }
      });

      if(missingLabels.length > 0) {
        checksStatus.pending.push(`missing required labels: ${missingLabels.join(', ')}`);
      }
    }

    // Check if any forbidden label is present
    if(config.checks.forbiddenLabels) {
      const fbdLabels: string[] = [];
      config.checks.forbiddenLabels.forEach(fbdLabel => {
        if(labelsNames.some(label => !!label.match(new RegExp(fbdLabel)))) {
          fbdLabels.push(fbdLabel);
        }
      });

      if(fbdLabels.length > 0) {
        checksStatus.pending.push(`forbidden labels detected: ${fbdLabels.join(', ')}`);
      }
    }

    // Check if we have any failed/pending external status
    statuses = statuses || await this.getStatuses(context, pr.number, config);
    statuses.forEach(status => {
      switch(status.state) {
        case STATUS_STATE.Failure:
        case STATUS_STATE.Error:
          checksStatus.failure.push(`status "${status.context}" is failing`);
          break;
        case STATUS_STATE.Pending:
          checksStatus.pending.push(`status "${status.context}" is pending`);
          break;
      }
    });

    // Check if all required statuses are present
    if(config.checks.requiredStatuses) {
      config.checks.requiredStatuses.forEach(reqCheck => {
        if(!statuses.some(status => !!status.context.match(new RegExp(reqCheck)))) {
          checksStatus.pending.push(`missing required status "${reqCheck}"`);
        }
      });
    }

    // Check if there is any review pending or that requested changes
    if(config.checks.requireReviews) {
      let nbPendingReviews = pr.pendingReviews;
      // Because we're adding cache for this value progressively, ensure that we have the data available
      // TODO(ocombe): remove this when all DB PRs have been updated
      if(typeof nbPendingReviews !== 'number') {
        nbPendingReviews = await this.getPendingReviews(context, pr);
        pr.pendingReviews = nbPendingReviews;
        const {owner, repo} = context.repo();
        await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
          throw err;
        });
      }

      if(nbPendingReviews > 0) {
        checksStatus.pending.push(`${nbPendingReviews} pending code review${nbPendingReviews > 1 ? 's' : ''}`);
      }
    }

    return checksStatus;
  }

  /**
   * Returns the number of "non approved" reviews (requested, pending or changes requested).
   * We only take into account the final review for each user.
   * We ignore team reviews and reviews by individuals who are not members of the repository.
   */
  async getPendingReviews(context: Context, pr: CachedPullRequest): Promise<number> {
    const {owner, repo} = context.repo();
    // We can have a lot of reviews on a PR, we need to paginate to get all of them
    const reviews = (await context.github.paginate(context.github.pullRequests.listReviews({
      owner,
      repo,
      number: pr.number,
      per_page: 100
    }), pages => (pages as any).data) as Review[])
      // We only want reviews with state: PENDING, APPROVED, CHANGES_REQUESTED, DISMISSED.
      // We ignore comments because they can be done after a review was approved / refused, and also because
      // anyone can add comments, it doesn't mean that it's someone who is actually reviewing the PR
      .filter(review => review.state !== REVIEW_STATE.Commented)
      // We ignore reviews from individuals who aren't members of the repository
      .filter(review => review.author_association !== AUTHOR_ASSOCIATION.None)
      // Order by latest review first
      .sort((review1, review2) => new Date(review2.submitted_at).getTime() - new Date(review1.submitted_at).getTime());

    // The list of requested reviewers only contains people that have been requested for review but have not
    // given the review yet. Once they do, they disappear from this list, and we need to check the reviews.
    // We only take the reviews from users and ignore team reviews so that we don't conflict with Github code owners
    // that automatically add team to the reviewers list
    const reviewRequests =(await context.github.pullRequests.listReviewRequests({owner, repo, number: pr.number})).data.users;

    const usersReviews: number[] = [];
    const finalReviews: any[] = [];

    // For each individual that reviewed this PR, we only keep the latest review (it can either be pending, approved,
    // changes_requested or dismissed)
    reviews.forEach(review => {
      const reviewUser = review.user.id;
      if(!usersReviews.includes(reviewUser)) {
        usersReviews.push(reviewUser);
        finalReviews.push(review);
      }
    });

    // We want the list of "non-approved" reviews, so we only keep the reviews that are pending / requested changes
    const nonApprovedReviews = finalReviews.filter(review => review.state === REVIEW_STATE.Pending || review.state === REVIEW_STATE.ChangesRequest);

    return reviewRequests.length + nonApprovedReviews.length;
  }

  /**
   * Updates the database when the PR is synchronized (new commit or commit force pushed).
   * Triggered by event.
   */
  async onSynchronize(context: Context): Promise<void> {
    const pr = context.payload.pull_request;
    const {owner, repo} = context.repo();

    await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, {
      ...pr,
      synchronized_at: new Date()
    });
    this.logDebug({context}, `Updated synchronized date`);
  }

  /**
   * Updates Firebase data when the PR is updated.
   * Triggered by event.
   */
  async onUpdate(context: Context): Promise<void> {
    const pr = context.payload.pull_request;
    const {owner, repo} = context.repo();

    await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr);
    this.logDebug({context}, `Updated PR data`);
  }

  /**
   * Checks/updates the status of all opened PRs when the main repository gets a push update.
   * Triggered by event.
   */
  // todo(OCOMBE): change it to use database trigger
  async onPush(context: Context): Promise<void> {
    const config = await this.getConfig(context);
    if(!config.checks.noConflict) {
      return;
    }
    const {owner, repo} = context.repo();
    const repoId = context.payload.repository.id;
    let ref = context.payload.ref.split('/');
    ref = ref[ref.length - 1];

    const pullRequests = await this.pullRequests.where('state', '==', 'open')
      .where('base.ref', '==', ref)
      .where('repository.id', '==', repoId)
      .get();
    return await pullRequests.forEach(async doc => {
      let pr = doc.data();

      // We need to get the updated mergeable status
      // TODO(ocombe): we might need to setTimeout this until we get a mergeable value !== null (or use probot scheduler)
      pr = await this.updateDbPR(context.github, owner, repo, pr.number, repoId);

      if(pr.mergeable === false) {
        // Get the comments since the last time the PR was synchronized
        if((pr.conflict_comment_at && pr.synchronized_at && pr.conflict_comment_at >= pr.synchronized_at) || (!pr.synchronized_at && pr.conflict_comment_at)) {
          this.logDebug({context}, `This PR already contains a merge conflict comment since the last synchronized date, skipping it`);
          return;
        }

        if(config.mergeConflictComment) {
          await context.github.issues.createComment({
            owner,
            repo,
            number: pr.number,
            body: config.mergeConflictComment.replace("{{PRAuthor}}", pr.user.login)
          });
          this.pullRequests.doc(pr.id.toString()).set({conflict_comment_at: new Date()}, {merge: true}).catch(err => {
            throw err;
          });
          this.log({context}, `Added comment: conflict with the base branch "${pr.base.ref}"`);
        }
      }
    });
  }

  private async updateReview(context: Context): Promise<void> {
    const config = await this.getConfig(context);
    if(config.status.disabled || !config.checks.requireReviews) {
      return;
    }
    const pr: Github.PullRequestsGetResponse = context.payload.pull_request;
    // Get the number of pending reviews and update the context, it will be cached in `updateStatus`
    context.payload.pull_request.pendingReviews = await this.getPendingReviews(context, pr);

    this.updateStatus(context, config).catch(err => {
      throw err;
    });
  }

  /**
   * Updates the status of a PR.
   */
  private async updateStatus(context: Context, config?: MergeConfig, updateStatus = true, updateG3Status = false, labels?: Github.PullRequestsGetResponseLabelsItem[]): Promise<void> {
    if(context.payload.action === "synchronize") {
      updateG3Status = true;
    }
    if(!updateStatus && !updateG3Status) {
      return;
    }
    config = config || await this.getConfig(context);
    if(config.status.disabled) {
      return;
    }
    let sha, pr;
    const {owner, repo} = context.repo();

    switch(context.name) {
      case 'pull_request':
      case 'pull_request_review':
        sha = context.payload.pull_request.head.sha;
        pr = context.payload.pull_request;
        pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
          throw err;
        });
        if(!labels) {
          labels = pr.labels || await this.getPRLabels(context);
        }
        break;
      case 'status':
        // Ignore status update events that are coming from this bot
        if(context.payload.context === config.status.context) {
          this.logDebug({context}, `Update status coming from this bot, ignored`);
          return;
        }
        // Ignore status events for commits coming directly from the default branch (most likely using github edit)
        // because they are not coming from a PR (e.g. travis runs for all commits and triggers a status update)
        if(context.payload.branches.name === context.payload.repository.default_branch) {
          this.logDebug({context}, `Update status coming directly from the default branch (${context.payload.branches.name}), ignored`);
          return;
        }
        sha = context.payload.sha;
        pr = await this.findPrBySha(sha, context.payload.repository.id);

        if(!pr) {
          // The repository data was previously stored as a simple id, checking if this PR still has old data
          const matches = (await this.pullRequests.where('head.sha', '==', sha)
            .where('repository', '==', context.payload.repository.id)
            .get());
          matches.forEach(async doc => {
            pr = doc.data();
          });
        }
        // Either init has not finished yet and we don't have this PR in the DB, or it's a status update for a commit
        // made directly on a branch without a PR (e.g. travis runs for all commits and triggers a status update)
        if(!pr) {
          this.logWarn({context}, `Update status for unknown PR, ignored. Head sha == ${sha}, repository == ${context.payload.repository.id}`);
          return;
        } else {
          // make sure that we have updated data
          pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);
        }
        if(!labels) {
          labels = pr.labels || await getGhPRLabels(context.github, owner, repo, pr.number);
        }
        break;
      default:
        throw new Error(`Unhandled event ${context.name} in updateStatus`);
    }

    const statuses = await this.getStatuses(context, pr.number, config);

    if(updateG3Status && config.g3Status && !config.g3Status.disabled) {
      // Checking if we need to add g3 status
      const files: Github.PullRequestsListFilesResponse = (await context.github.pullRequests.listFiles({owner, repo, number: pr.number})).data;
      if(matchAnyFile(files.map(file => file.filename), config.g3Status.include, config.g3Status.exclude)) {
        // Only update g3 status if a commit was just pushed, or there was no g3 status
        if(context.payload.action === "synchronize" || !statuses.some(status => status.context === config.g3Status.context)) {
          const status = (await context.github.repos.createStatus({
            owner,
            repo,
            sha: sha,
            context: config.g3Status.context,
            state: STATUS_STATE.Pending,
            description: config.g3Status.pendingDesc.replace("{{PRNumber}}", pr.number),
            target_url: config.g3Status.url
          })).data as any as GithubGQL.StatusContext;
          statuses.push(status);
          this.log({context}, `Updated g3 status to pending`);
        }
      } else {
        const status = (await context.github.repos.createStatus({
          owner,
          repo,
          sha: pr.head.sha,
          context: config.g3Status.context,
          state: STATUS_STATE.Success,
          description: config.g3Status.successDesc
        })).data as any as GithubGQL.StatusContext;
        statuses.push(status);
        this.log({context}, `Updated g3 status to success`);
      }
    }

    if(updateStatus) {
      const statusParams: Github.ReposCreateStatusParams = {
        owner,
        repo,
        sha: sha,
        context: config.status.context,
        state: STATUS_STATE.Success
      };

      const failedChecks = await this.getChecksStatus(context, pr, config, labels, statuses);

      if(failedChecks.failure.length > 0) {
        statusParams.state = STATUS_STATE.Failure;
        statusParams.description = failedChecks.failure.concat(failedChecks.pending).join(', ');
      } else if(failedChecks.pending.length > 0) {
        statusParams.state = STATUS_STATE.Pending;
        statusParams.description = failedChecks.pending.join(', ');
      } else {
        statusParams.state = STATUS_STATE.Success;
        statusParams.description = config.status.successText;
      }

      // Capitalize first letter
      statusParams.description = statusParams.description.replace(statusParams.description[0], statusParams.description[0].toUpperCase());
      const desc = statusParams.description;

      // TODO(ocombe): add a link to a dynamic page with the complete status & some description of what's required
      if(statusParams.description.length > 140) {
        statusParams.description = statusParams.description.substring(0, 137) + '...';
      }

      await context.github.repos.createStatus(statusParams);
      this.log({context}, `Updated status to "${statusParams.state}": ${desc}`);
    }
  }

  /**
   * Get all external statuses except for the one added by this bot
   */
  private async getStatuses(context: Context, number: number, config?: MergeConfig): Promise<GithubGQL.StatusContext[]> {
    const {owner, repo} = context.repo();
    config = config || await this.getConfig(context);

    const status = (await queryPR<GithubGQL.PullRequest>(context.github, `
      commits(last: 1) {
        nodes {
          commit {
            status {
              contexts {
                targetUrl,
                id,
                state,
                description,
                context,
                createdAt
              }
            }
          }
        }
      }
    `, {owner, repo, number})).commits.nodes[0].commit.status;

    if(status) {
      return status.contexts.filter((statusContext: GithubGQL.StatusContext) => statusContext.context !== config.status.context);
    }
    return [];
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context: Context): Promise<MergeConfig> {
    const repositoryConfig = await context.config<AppConfig>(CONFIG_FILE, appConfig);
    return repositoryConfig.merge;
  }
}

interface ChecksStatus {
  pending: string[];
  failure: string[];
}

interface Review {
  id: number;
  node_id: string;
  user: Github.PullRequestsListReviewsResponseItemUser;
  body: string;
  commit_id: string;
  state: REVIEW_STATE;
  html_url: string;
  pull_request_url: string;
  author_association: AUTHOR_ASSOCIATION;
  submitted_at: string;
}
