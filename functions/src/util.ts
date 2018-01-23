import * as probot from "probot-ts";
import {CommonTask} from "./plugins/common";
import {MergeTask} from "./plugins/merge";
import {TriageTask} from "./plugins/triage";

/**
 * Get all results in case of paginated Github request
 */
export function getAllResults(github: probot.EnhancedGitHubClient, request): Promise<any[]> {
  return github.paginate(request, page => page.data);
}

class Stream {
  write(data: any) {
    let log = console.log;
    try {
      data = JSON.parse(data);
      switch(data.level) {
        case 60: // fatal
        case 50: // error
          log = console.error;
          break;
        case 40: // warn
          log = console.warn;
          break;
        case 30: // info
        case 20: // debug
        case 10: // trace
          log = console.info;
          break;
      }
    } catch(e) {
    }
    log(typeof data === 'object' ? `${data.name}: ${data.msg}` : data);
  }
}

/**
 * Stream Probot logs to console for Firebase
 */
export const consoleStream = {
  level: "debug",
  stream: new Stream()
};

export interface Tasks {
  commonTask: CommonTask;
  mergeTask: MergeTask;
  triageTask: TriageTask;
}

export function registerTasks(robot: probot.Robot, store: FirebaseFirestore.Firestore): Tasks {
  return {
    commonTask: new CommonTask(robot, store),
    mergeTask: new MergeTask(robot, store),
    triageTask: new TriageTask(robot, store)
  };
}
