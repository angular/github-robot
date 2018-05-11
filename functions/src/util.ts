import {Robot} from "probot";
import {CommonTask} from "./plugins/common";
import {MergeTask} from "./plugins/merge";
import {TriageTask} from "./plugins/triage";
import {OctokitWithPagination} from "probot/lib/github";
import { SizeTask } from "./plugins/size";
import { HttpClient } from "./http";
import { database } from "firebase-admin";

/**
 * Get all results in case of paginated Github request
 */
export function getAllResults(github: OctokitWithPagination, request): Promise<any[]> {
  return github.paginate(request, page => page.data) as any as Promise<any[]>;
}

class Stream {
  constructor(private store: FirebaseFirestore.Firestore) {
  }

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
    const context = data.context;
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

    log(`[${level}]${event} ${typeof data === 'object' ? (data.err && data.err.stack ? data.err.stack : data.msg) : data}${extraData}`);
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
  sizeTask: SizeTask;
}

export function registerTasks(robot: Robot, store: FirebaseFirestore.Firestore, sizeStore: database.Database, http: HttpClient): Tasks {
  return {
    commonTask: new CommonTask(robot, store),
    mergeTask: new MergeTask(robot, store),
    triageTask: new TriageTask(robot, store),
    sizeTask: new SizeTask(robot, store, sizeStore, http),
  };
}

// copied from https://github.com/firebase/firebase-admin-node/blob/master/src/auth/credential.ts#L61
function copyAttr(to: object, from: object, key: string, alt: string) {
  const tmp = from[key] || from[alt];
  if (typeof tmp !== 'undefined') {
    to[key] = tmp;
  }
}

export function loadFirebaseConfig(params?: string|object) {
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

/**
 * Encode paths for Firebase Database
 * "." must be encoded for firebase or else it will throw when being saved into the DB
 */
export function firebasePathEncode(s: string) {
  return s.replace(/\./g, '_');
}

export function firebasePathDecode(s: string) {
  return s.replace(/_/g, '.');
}
