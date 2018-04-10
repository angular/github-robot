import * as Github from '@octokit/rest';
import {Context, Robot} from "probot";
import {AppConfig, appConfig, MergeConfig} from "../default";
import {addComment, getGhLabels, getLabelsNames, matchAny, matchAnyFile} from "./common";
import {Task} from "./task";
import {REVIEW_STATE, STATUS_STATE} from "../typings";

export const CONFIG_FILE = "angular-robot.yml";

// TODO(ocombe): create Typescript interfaces for each payload & DB data
export class MergeTask extends Task {
  constructor(robot: Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // Pushs to the repository to check for merge conflicts
    this.dispatch('push', this.onPush.bind(this));
    // PR receives a new label
    this.dispatch('pull_request.labeled', this.onLabeled.bind(this));
    // PR looses a label
    this.dispatch('pull_request.unlabeled', this.onUnlabeled.bind(this));
    // PR updated or received a new status update from another app
    this.dispatch([
      'status',
      'pull_request.synchronize',
      'pull_request.review_requested',
      'pull_request.review_request_removed',
      'pull_request_review.submitted',
      'pull_request_review.dismissed',
      'pull_request.edited' // editing a PR can change the base branch (not just text content)
    ], this.updateStatus.bind(this));
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
   * Triggered by event
   */
  async onLabeled(context: Context): Promise<void> {
    const newLabel = context.payload.label.name;
    const pr = context.payload.pull_request;
    const config = await this.getConfig(context);
    const {owner, repo} = context.repo();
    // we need the list of labels from Github because we might be adding multiple labels at once
    // and we could overwrite some labels because of a race condition
    const labels = await getGhLabels(context.github, owner, repo, pr.number);
    pr.labels = labels;
    this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
      throw err;
    });

    let updateStatus = false;
    let updateG3Status = false;

    if(newLabel === config.mergeLabel) {
      this.logDebug({context}, `Checking merge label`);

      const checks = await this.getChecksStatus(context, pr, config, labels);

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
    }

    if(matchAny([newLabel], config.checks.requiredLabels) || matchAny([newLabel], config.checks.forbiddenLabels)) {
      updateStatus = true;
    }

    this.updateStatus(context, updateStatus, updateG3Status, labels).catch(err => {
      throw err;
    });
  }

  /**
   * Checks what label was removed and updates the PR status if necessary. It also updates Firebase.
   * Triggered by event
   */
  async onUnlabeled(context: Context): Promise<void> {
    const config = await this.getConfig(context);
    const {owner, repo} = context.repo();
    const removedLabel = context.payload.label.name;
    const pr = context.payload.pull_request;
    // we need the list of labels from Github because we might be adding multiple labels at once
    // and we could overwrite some labels because of a race condition
    const labels = await getGhLabels(context.github, owner, repo, pr.number);
    pr.labels = labels;
    this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
      throw err;
    });

    if(matchAny([removedLabel], config.checks.requiredLabels) || matchAny([removedLabel], config.checks.forbiddenLabels)) {
      this.updateStatus(context, true, false, labels).catch(err => {
        throw err;
      });
    }
  }

  /**
   * Gets the list of labels from a PR
   */
  private async getLabels(context: Context, pr?: any): Promise<Github.Label[]> {
    const {owner, repo} = context.repo();
    pr = pr || context.payload.pull_request;
    const doc = this.pullRequests.doc(pr.id.toString());
    const dbPR = await doc.get();
    let labels: Github.Label[];

    // if the PR is already in Firebase
    if(dbPR.exists) {
      labels = dbPR.data().labels;

      // if we have the labels listed in the PR
      if(labels) {
        return labels;
      }
    }

    // otherwise get the labels from Github and update Firebase
    labels = await getGhLabels(context.github, owner, repo, pr.number);
    await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, {...pr, labels});
    return labels;
  }

  /**
   * Based on the repo config, returns the list of checks that failed for this PR
   */
  private async getChecksStatus(context: Context, pr: Github.PullRequest, config: MergeConfig, labels: Github.Label[] = [], statuses?: Github.Status[]): Promise<ChecksStatus> {
    const checksStatus: ChecksStatus = {
      pending: [],
      failure: []
    };
    const labelsNames = getLabelsNames(labels);

    // Check if there is any merge conflict
    if(config.checks.noConflict) {
      // if mergeable is null, we need to get the updated status
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
      const missingLabels = [];
      config.checks.requiredLabels.forEach(reqLabel => {
        if(!labelsNames.some(label => !!label.match(new RegExp(reqLabel)))) {
          missingLabels.push(reqLabel);
        }
      });

      if(missingLabels.length > 0) {
        checksStatus.failure.push(`missing required label${missingLabels.length > 1 ? 's' : ''}: "${missingLabels.join('", "')}"`);
      }
    }

    // Check if any forbidden label is present
    if(config.checks.forbiddenLabels) {
      const fbdLabels = [];
      config.checks.forbiddenLabels.forEach(fbdLabel => {
        if(labelsNames.some(label => !!label.match(new RegExp(fbdLabel)))) {
          fbdLabels.push(fbdLabel);
        }
      });

      if(fbdLabels.length > 0) {
        checksStatus.failure.push(`forbidden label${fbdLabels.length > 1 ? 's' : ''} detected: ${fbdLabels.join(', ')}`);
      }
    }

    // Check if we have any failed/pending external status
    statuses = statuses || await this.getStatuses(context, pr.head.sha);
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
          checksStatus.failure.push(`missing required status "${reqCheck}"`);
        }
      });
    }

    // check if there is any review pending or that requested changes
    // pr.requested_reviewers == users that have been requested but haven't reviewed yet
    const nbPendingReviews = await this.getPendingReviews(context, pr);
    if(nbPendingReviews > 0) {
      checksStatus.pending.push(`${nbPendingReviews} pending code review${nbPendingReviews > 1 ? 's' : ''}`);
    }

    return checksStatus;
  }

  /**
   * Returns the number of "non approved" reviews (requested, pending or changes requested)
   * (we only take into account the final review for each user)
   */
  async getPendingReviews(context: Context, pr: Github.PullRequest): Promise<number> {
    const {owner, repo} = context.repo();
    // we only want reviews with state: PENDING, APPROVED, CHANGES_REQUESTED, DISMISSED
    // we ignore comments because they can be done after a review was approved / refused
    // also anyone can add comments, it doesn't mean that it's someone who is actually reviewing the PR
    const query = `
      reviews(last: 50, states: [PENDING, APPROVED, CHANGES_REQUESTED, DISMISSED]) {
        nodes {
          authorAssociation
          author {
            ... on User {
              userId: id
            }
          }
          state
          createdAt
        }
      }
      reviewRequests(last: 10) {
        nodes {
          requestedReviewer {
            ... on User {
              userId: id
            }
            ... on Team {
              teamId: id
            }
          }
        }
      }
    `;

    const prData = await this.queryPR<ReviewQuery>(context, query, {
      owner,
      repo,
      number: pr.number
    });

    const reviews = prData.reviews.nodes
      // order by latest review first
      .sort((review1, review2) => new Date(review2.createdAt).getTime() - new Date(review1.createdAt).getTime());

    // the list of requested reviewers only contains people that have been requested for review but have not
    // given the review yet. Once he does, he disappears from this list, and we need to check the reviews
    const reviewRequests = prData.reviewRequests.nodes.length;
    const usersReviews = [];
    // for each user that reviewed this PR, we get the latest review
    const finalReviews = [];

    // for each user that reviewed this PR, we get the latest review
    reviews.forEach(review => {
      const reviewUser = review.author.userId;
      if(!usersReviews.includes(reviewUser)) {
        usersReviews.push(reviewUser);
        finalReviews.push(review);
      }
    });

    // we only keep the reviews that are pending / requested changes
    const nonApprovedReviews = finalReviews.filter(review => review.state === REVIEW_STATE.Pending || review.state === REVIEW_STATE.ChangesRequest);

    return reviewRequests + nonApprovedReviews.length;
  }

  /**
   * Updates the database when the PR is synchronized (new commit or commit force pushed)
   * Triggered by event
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
   * Updates Firebase data when the PR is updated
   * Triggered by event
   */
  async onUpdate(context: Context): Promise<void> {
    const pr = context.payload.pull_request;
    const {owner, repo} = context.repo();

    await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr);
    this.logDebug({context}, `Updated PR data`);
  }

  /**
   * Checks/updates the status of all opened PRs when the main repository gets a push update
   * Triggered by event
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
        // get the comments since the last time the PR was synchronized
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

  /**
   * Updates the status of a PR
   */
  private async updateStatus(context: Context, updateStatus = true, updateG3Status = false, labels?: Github.Label[]): Promise<void> {
    if(context.payload.action === "synchronize") {
      updateG3Status = true;
    }
    if(!updateStatus && !updateG3Status) {
      return;
    }
    const config = await this.getConfig(context);
    if(config.status.disabled) {
      return;
    }
    let sha, pr;
    const {owner, repo} = context.repo();

    switch(context.event) {
      case 'pull_request':
      case 'pull_request_review':
        sha = context.payload.pull_request.head.sha;
        pr = context.payload.pull_request;
        this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id, pr).catch(err => {
          throw err;
        });
        if(!labels) {
          labels = await this.getLabels(context);
        }
        break;
      case 'status':
        // ignore status update events that are coming from this bot
        if(context.payload.context === config.status.context) {
          this.logDebug({context}, `Update status coming from this bot, ignored`);
          return;
        }
        // ignore status events for commits coming directly from the default branch (most likely using github edit)
        // because they are not coming from a PR (e.g. travis runs for all commits and triggers a status update)
        if(context.payload.branches.name === context.payload.repository.default_branch) {
          this.logDebug({context}, `Update status coming directly from the default branch (${context.payload.branches.name}), ignored`);
          return;
        }
        sha = context.payload.sha;
        let matches = (await this.pullRequests.where('head.sha', '==', sha)
          .where('repository.id', '==', context.payload.repository.id)
          .get());
        matches.forEach(async doc => {
          pr = doc.data();
        });
        if(!pr) {
          // the repository data was previously stored as a simple id, checking if this PR still has old data
          matches = (await this.pullRequests.where('head.sha', '==', sha)
            .where('repository', '==', context.payload.repository.id)
            .get());
          matches.forEach(async doc => {
            pr = doc.data();
          });
        }
        // either init has not finished yet and we don't have this PR in the DB, or it's a status update for a commit
        // made directly on a branch without a PR (e.g. travis runs for all commits and triggers a status update)
        if(!pr) {
          this.logWarn({context}, `Update status for unknown PR, ignored. Head sha == ${sha}, repository == ${context.payload.repository.id}`);
          return;
        } else {
          // make sure that we have updated data
          pr = await this.updateDbPR(context.github, owner, repo, pr.number, context.payload.repository.id);
        }
        if(!labels) {
          labels = pr.labels || await getGhLabels(context.github, owner, repo, pr.number);
        }
        break;
      default:
        throw new Error(`Unhandled event ${context.event} in updateStatus`);
    }

    const statuses = await this.getStatuses(context, sha);

    if(updateG3Status) {
      // checking if we need to add g3 status
      const files: Github.File[] = (await context.github.pullRequests.getFiles({owner, repo, number: pr.number})).data;
      if(matchAnyFile(files.map(file => file.filename), config.g3Status.include, config.g3Status.exclude)) {
        // only update g3 status if a commit was just pushed, or there was no g3 status
        if(context.payload.action === "synchronize" || !statuses.some(status => status.context === config.g3Status.context)) {
          const status = (await context.github.repos.createStatus({
            owner,
            repo,
            sha: sha,
            context: config.g3Status.context,
            state: STATUS_STATE.Pending,
            description: config.g3Status.pendingDesc.replace("{{PRNumber}}", pr.number),
            target_url: config.g3Status.url
          })).data;
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
        })).data;
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
  // TODO(ocombe): use Firebase instead
  private async getStatuses(context: Context, ref: string): Promise<Github.Status[]> {
    const {owner, repo} = context.repo();
    const config = await this.getConfig(context);

    const res = await context.github.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref
    });

    return res.data.statuses.filter((status: Github.Status) => status.context !== config.status.context);
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

interface ReviewQuery {
  reviews: {
    nodes: {
      authorAssociation: string;
      author: {
        userId: string;
      }
      state: REVIEW_STATE
      createdAt: string;
    }[];
  };

  reviewRequests: {
    nodes: {
      requestedReviewer: {
        userId: string;
        teamId?: undefined;
      } | {
        userId?: undefined;
        teamId: string;
      }
    }[];
  };
}
