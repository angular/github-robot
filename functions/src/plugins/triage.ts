import * as probot from "probot-ts";
import {Task} from "./task";
import {CONFIG_FILE} from "./merge";
import {AdminConfig, appConfig, TriageConfig} from "../default";
import {getGhLabels, getLabelsNames, matchAllOfAny} from "./common";
import * as Context from "probot-ts/lib/context";
import * as Github from "github";

export class TriageTask extends Task {
  constructor(robot: probot.Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // TODO(ocombe): add a debounce for labeled events per issue
    this.robot.on([
      'issues.labeled',
      'issues.unlabeled',
      'issues.milestoned'
    ], (context: probot.Context) => this.checkTriage(context));
  }

  async manualInit(): Promise<any> {
    const adminConfig = await this.admin.doc('config').get();
    if(adminConfig.exists && (<AdminConfig>adminConfig.data()).allowInit) {
      const github = await this.robot.auth();
      const installations = await github.paginate(github.apps.getInstallations({}), pages => pages.data);
      await Promise.all(installations.map(async installation => {
        const authGithub: probot.EnhancedGitHubClient = await this.robot.auth(installation.id);
        const repositories = await authGithub.apps.getInstallationRepositories({});
        await Promise.all(repositories.data.repositories.map(async (repository: Github.Repository) => {
          const context: probot.Context = new Context({payload: {repository}}, authGithub);
          const config = await this.getConfig(context);
          const {owner, repo} = context.repo();
          const issues = await authGithub.paginate(authGithub.issues.getForRepo({
            owner,
            repo,
            state: 'open',
            per_page: 100
          }), page => page.data);

          issues.forEach(async (issue: Github.Issue) => {
            // PRs are issues for github, but we don't want them here
            if(!issue.pull_request && (!issue.milestone || issue.milestone.number === config.defaultMilestone || issue.milestone.number === config.needsTriageMilestone)) {
              const isTriaged = this.isTriaged(config.triagedLabels, issue.labels.map((label: Github.Label) => label.name));
              if(isTriaged) {
                if(!issue.milestone || issue.milestone.number !== config.defaultMilestone) {
                  await this.setMilestone(config.defaultMilestone, context.github, owner, repo, issue);
                }
              } else {
                // if it's not triaged, set the "needsTriage" milestone
                if(!issue.milestone || issue.milestone.number !== config.needsTriageMilestone) {
                  await this.setMilestone(config.needsTriageMilestone, context.github, owner, repo, issue);
                }
              }
            }
          });
        }));
      }));
    } else {
      this.robot.log.error(`Manual init is disabled: the value of allowInit is set to false in the admin config database`);
    }
  }

  async checkTriage(context: probot.Context): Promise<any> {
    const issue = context.payload.issue;
    const config = await this.getConfig(context);
    if(!issue.milestone || issue.milestone.number === config.defaultMilestone || issue.milestone.number === config.needsTriageMilestone) {
      const {owner, repo} = context.repo();
      // getting labels from Github because we might be adding multiple labels at once
      const labels = await getGhLabels(context.github, owner, repo, issue.number);
      const isTriaged = this.isTriaged(config.triagedLabels, getLabelsNames(labels));
      if(isTriaged) {
        if(!issue.milestone || issue.milestone.number !== config.defaultMilestone) {
          await this.setMilestone(config.defaultMilestone, context.github, owner, repo, issue);
        }
      } else {
        // if it's not triaged, set the "needsTriage" milestone
        if(!issue.milestone || issue.milestone.number !== config.needsTriageMilestone) {
          await this.setMilestone(config.needsTriageMilestone, context.github, owner, repo, issue);
        }
      }
    }
  }

  setMilestone(milestoneNumber: number|null, github: probot.EnhancedGitHubClient, owner: string, repo: string, issue: Github.Issue): Promise<any> {
    if(milestoneNumber) {
      this.robot.log(`Adding milestone ${milestoneNumber} to issue ${issue.html_url}`);
    } else {
      this.robot.log(`Removing milestone from issue ${issue.html_url}`);
    }
    return github.issues.edit({owner, repo, number: issue.number, milestone: milestoneNumber}).catch(err => {
      throw err;
    });
  }

  isTriaged(triagedLabels: string[][], currentLabels: string[]): boolean {
    return matchAllOfAny(currentLabels, triagedLabels);
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context: probot.Context): Promise<TriageConfig> {
    let repositoryConfig = await context.config(CONFIG_FILE);
    if(!repositoryConfig || !repositoryConfig.triage) {
      repositoryConfig = {triage: {}};
    }
    const config = {...appConfig.triage, ...repositoryConfig.triage};
    config.defaultMilestone = parseInt(config.defaultMilestone, 10);
    config.needsTriageMilestone = parseInt(config.needsTriageMilestone, 10);
    return config;
  }
}
