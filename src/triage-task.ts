import * as github from "github";
import * as probot from "probot";

export const CONFIG_FILE = 'triage.yml';

export class TriageTask {
  constructor(private robot: probot.Robot) {
    ['pull_request.opened', 'issues.opened', 'issues.edited']
      .forEach(event => this.robot.on(event, (context: probot.Context) => this.autoLabel(context)));

    this.robot.on('schedule.repository', (context: probot.Context) => this.sweep.bind(context));
  }

  async sweep(context: probot.Context) {
    const config: TriageTaskConfig = await context.config(CONFIG_FILE);
    const {owner, repo} = context.repo();
    this.robot.log('Starting sweep');

    const issues = await this.searchNoLabelIssues(context);
    this.robot.log(`Found ${issues.length} issues with no label`);
    issues.forEach(issue => {
      this.robot.log(`Adding labels ${config.initLabels} to issue ${issue.number}`);
      context.github.issues.addLabels({
        owner,
        repo,
        number: issue.number,
        labels: config.initLabels
      });
    });
  }

  async autoLabel(context: probot.Context): Promise<void> {
    const config = await context.config<TriageTaskConfig>(CONFIG_FILE);

    if(config.initLabels.length > 0) {
      this.robot.log('Adding labels', config.initLabels);
      return context.github.issues.addLabels(context.issue({
        labels: config.initLabels
      }));
    }
  }

  async searchNoLabelIssues(context: probot.Context): Promise<probot.IssueParams> {
    const {owner, repo} = context.repo();
    const q = `repo:${owner}/${repo} is:open no:label`;
    const search: github.SearchRequest<probot.IssueParams> = await context.github.search.issues({
      q,
      sort: 'updated',
      order: 'desc',
      per_page: 30
    });
    return search.data.items;
  }
}

export interface TriageTaskConfig {
  initLabels: string[];
}
