import {config as firebaseConfig} from 'firebase-functions';
import {Application, Context} from "probot";
import {Task} from "./task";
import {RerunCircleCIConfig} from "../default";
import Github from '@octokit/rest';
import fetch from "node-fetch";

let circleCIConfig = firebaseConfig().circleCI;

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
    const circleCiUrl = `https://circleci.com/api/v1.1/project/github/${owner}/${repo}/build?circle-token=${CIRCLE_CI_TOKEN}`;
    try {
      await fetch(circleCiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revision: pullRequest.head.sha,
          branch: `pull/${pullRequest.number}`,
        })
      });
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
