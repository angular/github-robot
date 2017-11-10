import * as github from "github";
import * as probot from "probot";

export const CONFIG_FILE = 'triage.yml';

export class TriageTask {
  constructor(private robot: probot.Robot) {
    ['pull_request.opened', 'issues.opened', 'issues.edited']
      .forEach(event => this.robot.on(event, (context: probot.Context) => this.autoLabel(context)));

    this.robot.on('schedule.repository', (context: probot.Context) => this.sweep(context));
  }

  async sweep(context: probot.Context) {
    const config: TriageTaskConfig = await context.config(CONFIG_FILE);
    const {owner, repo} = context.repo();
    this.robot.log('Starting sweep');

    const issues = await this.searchNoLabel(context, config.initLabels);
    this.robot.log(`Found ${issues.length} issues with no label`);
    issues.forEach(issue => {
      // only apply the labels that are missing
      const labels = this.diffLabels(config.initLabels, issue.labels);
      this.addLabels(context, {owner, repo, labels, number: issue.number});
    });
  }

  async autoLabel(context: probot.Context): Promise<void> {
    const config = await context.config<TriageTaskConfig>(CONFIG_FILE);
    // only apply the labels that are missing
    const labels = this.diffLabels(config.initLabels, context.payload.issue.labels);
    return this.addLabels(context, context.issue({labels}));
  }

  diffLabels(labels: string[], currentLabels: GithubLabel[]): string[] {
    const filteredLabels = [];
    const currentList = currentLabels.map(label => label.name);
    labels.forEach(label => {
      if(!currentList.includes(label)) {
        filteredLabels.push(label);
      }
    });
    return filteredLabels;
  }

  async addLabels(context: probot.Context, params: probot.github.IssuesGetParams & { labels: string }): Promise<void> {
    if(params.labels.length > 0) {
      this.robot.log(`Adding labels ${params.labels} to issue ${params.number}`);
      return context.github.issues.addLabels(params);
    }
  }

  /**
   * Search for issues/PRs that don't have any of the labels passed as parameter
   * if "labels" is undefined, it will search for issues/PRs without any label
   *
   * @param {probot.Context} context
   * @param {string[]} labels
   * @returns {Promise<probot.IssueParams>}
   */
  async searchNoLabel(context: probot.Context, labels?: string[]): Promise<probot.IssueParams> {
    const {owner, repo} = context.repo();
    const labelsQ = labels ? labels.map(label => `-label:${label}`).join(' ') : 'no:label';
    const q = `repo:${owner}/${repo} is:open ${labelsQ}`;
    // todo handle pagination
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

export interface GithubLabel {
  id: number;
  url: string;
  name: string;
  color: string;
  default: boolean; // if this is a default label from Github
}
