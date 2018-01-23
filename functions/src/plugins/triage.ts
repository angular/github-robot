import * as probot from "probot-ts";
import {Task} from "./task";
import {CONFIG_FILE} from "./merge";
import {AdminConfig, appConfig, TriageConfig} from "../default";
import {getGhLabels} from "./common";
import * as Context from "probot-ts/lib/context";
import * as Github from "github";

export class TriageTask extends Task {
  constructor(robot: probot.Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    // TODO(ocombe): add a debounce for labeled events per issue
    this.robot.on([
      'issues.labeled',
    ], (context: probot.Context) => this.onLabeled(context));
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
            milestone: 'none',
            per_page: 100
          }), page => page.data);

          issues.forEach(async (issue: Github.Issue) => {
            if(!issue.pull_request) { // PRs are issues for github, but we don't want them here
              const isTriaged = this.isTriaged(config.triagedLabels, issue.labels.map((label: Github.Label) => label.name));
              if(isTriaged) {
                await this.setMilestone(config, context.github, owner, repo, issue);
              }
            }
          });
        }));
      }));
    } else {
      this.robot.log.error(`Manual init is disabled: the value of allowInit is set to false in the admin config database`);
    }
  }

  async onLabeled(context: probot.Context): Promise<any> {
    const issue = context.payload.issue;
    const hasMilestone = issue.milestone !== null;
    if(hasMilestone) {
      this.robot.log(`Ignoring issue ${issue.html_url} because it already has a milestone`);
      return;
    }
    const {owner, repo} = context.repo();
    const config = await this.getConfig(context);
    // getting labels from Github because we might be adding multiple labels at once
    const labels = await getGhLabels(context.github, owner, repo, issue.number);
    const isTriaged = this.isTriaged(config.triagedLabels, labels);
    if(isTriaged) {
      await this.setMilestone(config, context.github, owner, repo, issue);
    } else {
      this.robot.log(`Ignoring issue ${issue.html_url} because it has not been triaged yet`);
    }
  }

  setMilestone(config: TriageConfig, github: probot.EnhancedGitHubClient, owner: string, repo: string, issue: Github.Issue): Promise<any> {
    const milestoneNumber = parseInt(config.defaultMilestone, 10);
    this.robot.log(`Adding milestone ${milestoneNumber} to issue ${issue.html_url}`);
    return github.issues.edit({owner, repo, number: issue.number, milestone: milestoneNumber}).catch(err => {
      throw err;
    });
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
