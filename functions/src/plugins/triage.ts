import * as probot from "probot-ts";
import {Task} from "./task";
import {CONFIG_FILE} from "./merge";
import {appConfig, TriageConfig} from "../default";
import {getGhLabels} from "./common";

export class TriageTask extends Task {
  constructor(robot: probot.Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // TODO(ocombe): add a debounce for labeled events per issue
    this.robot.on([
      'issues.labeled',
    ], (context: probot.Context) => this.onLabeled(context));
  }

  async onLabeled(context: probot.Context): Promise<any> {
    const issue = context.payload.issue;
    const hasMilestone = issue.milestone !== null;
    if(hasMilestone) {
      this.robot.log(`Ignoring this issue because it already has a milestone`);
      return;
    }
    const {owner, repo} = context.repo();
    const config = await this.getConfig(context);
    const labels = await getGhLabels(context.github, owner, repo, issue.number);
    const isTriaged = await this.isTriaged(config.triagedLabels, labels);
    if(isTriaged) {
      this.robot.log(`Adding milestone ${config.defaultMilestone} to issue ${issue.html_url}`);
      return context.github.issues.edit({owner, repo, number: issue.number, milestone: Number(config.defaultMilestone)});
    } else {
      this.robot.log(`Ignoring this issue because it has not been triaged yet`);
    }
  }

  isTriaged(triagedLabels: string[][], currentLabels: string[]): boolean {
    return triagedLabels
    // is one of the triaged labels array 100% present
      .some((labels: string[]) => labels
        // for this array of labels, are they all matching one of the current labels?
          .map(triagedLabel => currentLabels
            // is this triage label matching one of the current label
              .some(currentLabel => !!currentLabel.match(new RegExp(triagedLabel)))
          )
          // are they all matching or is at least one of them not a match
          .reduce((previous: boolean, current: boolean) => previous && current)
      );
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context: probot.Context): Promise<TriageConfig> {
    let repositoryConfig = await context.config(CONFIG_FILE);
    if(!repositoryConfig || !repositoryConfig.triage) {
      repositoryConfig = {triage: {}};
    }
    return {...appConfig.triage, ...repositoryConfig.triage};
  }
}
