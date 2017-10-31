import * as github from "github";
import * as probot from "probot";
import * as createScheduler from "probot-scheduler";

const CONFIG_FILE = 'triage.yml';

class TriageTask {
  constructor(private robot: probot.Robot) {
    ['pull_request.opened', 'issues.opened']
      .forEach(event => this.robot.on(event, this.autoLabel.bind(this)));

    // Visit all repositories to sweep issues/PRs with no labels
    createScheduler(robot, {
      delay: false
    });
    this.robot.on('schedule.repository', this.sweep.bind(this))
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
      }))
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

export = function(robot: any): void {
  robot.log('Triage bot loaded & ready for action!');

  new TriageTask(robot);
};

interface TriageTaskConfig {
  initLabels: string[];
}
