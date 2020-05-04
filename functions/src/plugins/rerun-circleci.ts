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
    const circleCiUrl = `https://circleci.com/api/v2/project/gh/${owner}/${repo}/pipeline?circle-token=${CIRCLE_CI_TOKEN}`;
    try {
      const response = await fetch(circleCiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch: `pull/${pullRequest.number}/head`,
        })
      });
      // Properly handled failures in the CircleCI requests are returned with an HTTP response code
      // of 200 and json response with a `:message` key mapping to the failure message.  If
      // `:message` is not defined, the API request was successful.
      const errMessage = (await response.json())[':message'];
      if (errMessage) {
        throw Error(errMessage);
      }
    } catch (err) {
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
}
