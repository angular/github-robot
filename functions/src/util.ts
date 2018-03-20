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
  constructor(private store: FirebaseFirestore.Firestore) {}

  write(data: any) {
    let log = console.log;
    let level = 'info';
    switch(data.level) {
      case 60: // fatal
        log = console.error;
        level = 'fatal';
        break;
      case 50: // error
        log = console.error;
        level = 'error';
        break;
      case 40: // warn
        log = console.warn;
        level = 'warn';
        break;
      case 30: // info
        level = 'info';
        log = console.info;
        break;
      case 20: // debug
        level = 'debug';
        log = console.log;
        break;
      case 10: // trace
        level = 'trace';
        log = console.log;
        break;
    }

    let event = '';
    let extraData = '';
    const context: probot.Context = data.context;
    if(context) {
      event = context.event;
      const payload = data.context.payload;

      let path = '';
      switch(event) {
        case 'pull_request':
          path = payload.pull_request.html_url;
          break;
        case 'pull_request_review':
          path = payload.review.html_url;
          break;
        case 'issues':
          path = payload.issue.html_url;
          break;
        case 'push':
          path = payload.compare;
          break;
        case 'status':
          path = payload.commit.html_url;
          break;
        case 'installation':
          path = payload.installation.html_url;
          break;
        case 'installation_repositories':
          path = payload.installation.html_url;
          break;
      }

      if(payload.action) {
        event += `.${payload.action}`;
      }
      event = `[${event}]`;

      extraData = ` [${context.id}|${path}]`;
      if(context.id) {
        this.store.collection('events').doc(context.id).set(context.payload).catch(err => {
          throw err;
        });
      }
    }

    log(`[${level}]${event} ${typeof data === 'object' ? data.msg : data}${extraData}`);
  }
}

/**
 * Stream Probot logs to console for Firebase
 */
export const consoleStream = (store) => ({
  type: "raw",
  level: "debug",
  stream: new Stream(store)
});

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
