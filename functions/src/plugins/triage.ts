import {Context, Robot} from "probot";
import {Task} from "./task";
import {CONFIG_FILE} from "./merge";
import {AdminConfig, AppConfig, appConfig, TriageConfig} from "../default";
import {getGhLabels, getLabelsNames, matchAllOfAny} from "./common";
import * as Github from '@octokit/rest';
import {GitHubApi} from "../typings";

export class TriageTask extends Task {
  constructor(robot: Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // TODO(ocombe): add a debounce for labeled events per issue
    this.dispatch([
      'issues.labeled',
      'issues.unlabeled',
      'issues.milestoned',
      'issues.opened'
    ], this.checkTriage.bind(this));
  }

  async manualInit(): Promise<any> {
    const adminConfig = await this.admin.doc('config').get();
    if(adminConfig.exists && (<AdminConfig>adminConfig.data()).allowInit) {
      const github = await this.robot.auth();
      const installations = await github.paginate(github.apps.getInstallations({}), pages => pages.data);
      await Promise.all(installations.map(async installation => {
        const authGithub = await this.robot.auth(installation.id) as GitHubApi;
        const repositories = await authGithub.apps.getInstallationRepositories({});
        await Promise.all(repositories.data.repositories.map(async (repository: Github.Repository) => {
          const context = new Context({payload: {repository}}, authGithub, this.robot.log);
          const config = await this.getConfig(context);
          const {owner, repo} = context.repo();
          const issues = await authGithub.paginate(authGithub.issues.getForRepo({
            owner,
            repo,
            state: 'open',
            per_page: 100
          }), page => page.data) as any as any[];

          issues.forEach(async (issue: Github.Issue) => {
            // PRs are issues for github, but we don't want them here
            if(!issue.pull_request) {
              const isL1Triaged = this.isTriaged(config.l1TriageLabels, issue.labels.map((label: Github.Label) => label.name));
              if(!isL1Triaged) {
                if(issue.milestone) {
                  await this.setMilestone(null, context.github, owner, repo, issue);
                }
              } else if(!issue.milestone || issue.milestone.number === config.defaultMilestone || issue.milestone.number === config.needsTriageMilestone) {
                const isL2Triaged = this.isTriaged(config.l2TriageLabels || config.triagedLabels, issue.labels.map((label: Github.Label) => label.name));
                if(isL2Triaged) {
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
          });
        }));
      }));
    } else {
      this.logError(`Manual init is disabled: the value of allowInit is set to false in the admin config database`);
    }
  }

  async checkTriage(context: Context): Promise<any> {
    const issue: any = context.payload.issue;
    const config = await this.getConfig(context);
    const {owner, repo} = context.repo();
    // getting labels from Github because we might be adding multiple labels at once
    const labels = await getGhLabels(context.github, owner, repo, issue.number);
    const isL1Triaged = this.isTriaged(config.l1TriageLabels, getLabelsNames(labels));
    if(!isL1Triaged) {
      if(issue.milestone) {
        await this.setMilestone(null, context.github, owner, repo, issue);
      }
    } else if(!issue.milestone || issue.milestone.number === config.defaultMilestone || issue.milestone.number === config.needsTriageMilestone) {
      const isL2Triaged = this.isTriaged(config.l2TriageLabels || config.triagedLabels, getLabelsNames(labels));
      if(isL2Triaged) {
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

  setMilestone(milestoneNumber: number | null, github: Github, owner: string, repo: string, issue: Github.Issue): Promise<any> {
    if(milestoneNumber) {
      this.log(`Adding milestone ${milestoneNumber} to issue ${issue.html_url}`);
    } else {
      this.log(`Removing milestone from issue ${issue.html_url}`);
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
  async getConfig(context: Context): Promise<TriageConfig> {
    const repositoryConfig = await context.config<AppConfig>(CONFIG_FILE, appConfig);
    const config = repositoryConfig.triage;
    config.defaultMilestone = parseInt(<any>config.defaultMilestone, 10);
    config.needsTriageMilestone = parseInt(<any>config.needsTriageMilestone, 10);
    return config;
  }
}
