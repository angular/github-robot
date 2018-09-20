import {Application} from "probot";
import {CommonTask} from "./plugins/common";
import {MergeTask} from "./plugins/merge";
import {TriageTask} from "./plugins/triage";
import {SizeTask} from "./plugins/size";

class Stream {
  constructor(private store: FirebaseFirestore.Firestore) {
  }

  write(data: any) {
    let log = console.log;
    let level = 'info';
    if(data.level === 60) {// fatal
      log = console.error;
      level = 'fatal';
    } else if(data.level === 50) {// error
      log = console.error;
      level = 'error';
    } else if(data.level === 40) {// warn
      log = console.warn;
      level = 'warn';
    } else if(data.level === 30) {// info
      level = 'info';
      log = console.info;
    } else if(data.level === 20) {// debug
      level = 'debug';
      log = console.log;
    } else if(data.level === 10) {// trace
      level = 'trace';
      log = console.log;
    }

    let event = '';
    let extraData = '';
    const context = data.context;
    if(context) {
      event = context.name;
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

    log(`[${level}]${event} ${typeof data === 'object' ? (data.err && data.err.stack ? data.err.stack : data.msg) : data}${extraData}`);
  }
}

/**
 * Stream Probot logs to console for Firebase
 */
export const consoleStream = (store: FirebaseFirestore.Firestore) => ({
  type: "raw",
  level: "debug",
  stream: new Stream(store)
});

export interface Tasks {
  commonTask: CommonTask;
  mergeTask: MergeTask;
  triageTask: TriageTask;
  sizeTask: SizeTask;
}

export function registerTasks(robot: Application, store: FirebaseFirestore.Firestore): Tasks {
  store.settings({timestampsInSnapshots: true});
  return {
    commonTask: new CommonTask(robot, store),
    mergeTask: new MergeTask(robot, store),
    triageTask: new TriageTask(robot, store),
    sizeTask: new SizeTask(robot, store),
  };
}

// copied from https://github.com/firebase/firebase-admin-node/blob/master/src/auth/credential.ts#L61
function copyAttr(to: any, from: any, key: string, alt: string) {
  const tmp = from[key] || from[alt];
  if(typeof tmp !== 'undefined') {
    to[key] = tmp;
  }
}

export function loadFirebaseConfig(params?: string | object) {
  let config;
  if(!params) {
    return;
  } else if(typeof params === 'string') {
    config = require(params);
  } else {
    config = params;
  }
  copyAttr(config, config, 'projectId', 'project_id');
  copyAttr(config, config, 'privateKey', 'private_key');
  copyAttr(config, config, 'clientId', 'client_id');
  copyAttr(config, config, 'clientSecret', 'client_secret');
  copyAttr(config, config, 'clientEmail', 'client_email');
  copyAttr(config, config, 'refreshToken', 'refresh_token');
  return config;
}
