import {config as firebaseConfig} from 'firebase-functions';
import {Application, Context} from "probot";
import {Task} from "./task";
import {RerunCircleCIConfig} from "../default";
import Github from '@octokit/rest';
import fetch from "node-fetch";

let circleCIConfig = firebaseConfig().circleci;

// Check if we are in Firebase or in development
if(!circleCIConfig) {
  // Use dev config
  circleCIConfig = require('../../private/circle-ci.json');
}

const CIRCLE_CI_TOKEN = circleCIConfig.token;

export class RerunCircleCITask extends Task {
  constructor(robot: Application, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // Dispatch when a label is added to a pull request.
    this.dispatch([
      'pull_request.labeled',
    ], this.checkRerunCircleCI.bind(this));
  }

  /** Determines if a circle rerun should occur. */
  async checkRerunCircleCI(context: Context): Promise<void> {
    const config = await this.getConfig(context);
    if (config.disabled) {
      return;
    }

    if (context.payload.label) {
      const label: Github.IssuesGetLabelResponse = context.payload.label;
      if (label.name === config.triggerRerunLabel) {
        await this.triggerCircleCIRerun(context);
      }
    }
  }

  /** Triggers a rerun of the default CircleCI workflow and then removed the triggering label. */
  async triggerCircleCIRerun(context: Context) {
    const config = await this.getConfig(context);
    if (config.disabled) {
      return;
    }

    const pullRequest: Github.PullRequestsGetResponse = context.payload.pull_request;
    const sender: Github.PullRequestsGetResponseUser = context.payload.sender;
    const {owner, repo} = context.repo();
    const id = this.getCircleCiWorkflowIdForPullRequest(context);
    const url = `https://circleci.com/api/v2/workflow/${id}/rerun?circle-token=${CIRCLE_CI_TOKEN}`;
    try {
      const response = await (await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Always rerun only the steps which failed.
          from_failed: true
        })
      })).json();

      assertNoErrorsInCircleCiResponse(response);

    } catch (err) {
      this.logError(err);
      const error: TypeError = err;
      context.github.issues.createComment({
        body: `@${sender.login} the CircleCI rerun you requested failed.  See details below:

\`\`\`
${error.message}
\`\`\``,
        number: pullRequest.number,
        owner: owner,
        repo: repo,
      }).catch(err => {
        throw err;
      });
    }
    await context.github.issues.removeLabel({
      name: config.triggerRerunLabel,
      number: pullRequest.number,
      owner: owner,
      repo: repo
    });
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context: Context): Promise<RerunCircleCIConfig> {
    const repositoryConfig = await this.getAppConfig(context);
    return repositoryConfig.rerunCircleCI;
  }

  /**
   * Get the CircleCI workflow id of the first discovered CircleCI status in the statuses.  Since
   * only one workflow is run on each PR, all CircleCI statuses will track back to the same
   * workflow id.
   */
  private async getCircleCiWorkflowIdForPullRequest(context: Context) {
    /** The target url of the discovered CircleCI status. */
    let targetUrl: string;
    /** The pull request which triggered the bot action. */
    const pullRequest: Github.PullRequestsGetResponse = context.payload.pull_request;
    /** The owner and repository name. */
    const {owner, repo} = context.repo();
    /** The list of statuses for the latest ref of the PR. */
    const {statuses} = (await context.github.repos.getCombinedStatusForRef({
      owner, repo, ref: pullRequest.head.ref
    })).data;

    for (const status of statuses) {
      if (status.context.startsWith('ci/circleci:')) {
        targetUrl = status.target_url;
        break;
      }
    }

    if (targetUrl === undefined) {
      throw Error('No status for a CircleCI workflow was found on the pull request to be rerun.');
    }

    /**
     * The matcher results of the regex to select the job ID of the job which the status represents.
     */
    const jobIdMatcher = targetUrl.match(`https://circleci.com/gh/${owner}/${repo}/(\d+)\?`);

    if (jobIdMatcher === null) {
      throw Error('Unable to determine the job ID for the CircleCI job creating the status');
    }

    /** The job ID. */
    const job = jobIdMatcher[0];
    /** The full url of the API request to CircleCI. */
    const url = `https://circleci.com/api/v2/project/gh/${owner}/${repo}/job/${job}?circle-token=${CIRCLE_CI_TOKEN}`;
    /** The API response from the CircleCI request. */
    const response = (await (await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })).json());

    assertNoErrorsInCircleCiResponse(response);

    return response.latest_workflow.id;
  }
}



/**
 * Checks the provided response from CircleCI's API to determine if it is an error message.
 *
 * Properly handled failures in the CircleCI requests are returned with an HTTP response code of 200
 * and json response with a `:message` key mapping to the failure message.  If `:message` is not
 * defined, the API request was successful.
 */
function assertNoErrorsInCircleCiResponse(response: any) {
  if (response[':message'] !== undefined) {
    throw Error(response[':message']);
  }
}
