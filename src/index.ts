import {TriageTask} from "./triage-task";
import * as createScheduler from "probot-scheduler";

export = function(robot: any): void {
  robot.log('Triage bot loaded & ready for action!');

  new TriageTask(robot);

  // Visit all repositories to sweep issues/PRs with no labels
  createScheduler(robot, {
    delay: false
  });
};
