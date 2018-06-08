import {config, firestore, https, database} from 'firebase-functions';
import {Request, Response} from "express";
import {createProbot, Options} from "probot";
import {consoleStream, loadFirebaseConfig, registerTasks, Tasks} from "./util";
import {app, credential, firestore as firestoreAdmin, initializeApp, ServiceAccount} from "firebase-admin";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {EventContext} from "firebase-functions/lib/cloud-functions";
import {HttpClient} from './http';

let tasks: Tasks;
let probotConfig: Options = config().probot;
let sizeAppConfig: ServiceAccount = loadFirebaseConfig(config().sizeapp);
let sizeAppStore;

// Check if we are in Firebase or in development
if(probotConfig) {
  // Init Firebase
  initializeApp();
} else {
  // Use dev config
  probotConfig = require('../private/env.json');
  sizeAppConfig = loadFirebaseConfig("../private/firebase-key.json");

  const sizeApp = initializeApp({
    credential: credential.cert(sizeAppConfig),
    databaseURL: `https://${sizeAppConfig.projectId}.firebaseio.com`,
  });
  sizeAppStore = sizeApp.database();
}

const store: FirebaseFirestore.Firestore = firestoreAdmin();
const httpClient = new HttpClient();
// Create the bot using Firebase's probot config (see Readme.md)
const bot = createProbot(probotConfig);
// disable probot logging
bot.logger.streams.splice(0, 1);
// Use node console as the output stream
bot.logger.addStream(consoleStream(store));
// Load the merge task to monitor PRs
bot.load(robot => {
  tasks = registerTasks(robot, store, sizeAppStore, httpClient);
});

/**
 * Relay Github events to the bot
 */
exports.bot = https.onRequest(async (request: Request, response: Response) => {
  const event = request.get('x-github-event') || request.get('X-GitHub-Event');
  const id: any = request.get('x-github-delivery') || request.get('X-GitHub-Delivery');
  if(event) {
    try {
      await bot.receive({
        event,
        id,
        payload: request.body,
        protocol: 'https',
        host: request.hostname,
        url: request.url
      });
      response.send({
        statusCode: 200,
        body: JSON.stringify({
          message: 'Executed'
        })
      });
    } catch(err) {
      console.error(err);
      response.sendStatus(500);
    }
  } else {
    console.error(request);
    response.sendStatus(400);
  }
});

/**
 * Manually trigger init for all repositories, you shouldn't need to use that unless you clean the database
 */
exports.init = https.onRequest(async (request: Request, response: Response) => {
  try {
    await tasks.commonTask.manualInit().catch(err => {
      console.error(err);
    });
    response.send({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Common init function started'
      })
    });
  } catch(err) {
    console.error(err);
    response.sendStatus(500);
  }
});

/**
 * Manually trigger init for triage issues, you shouldn't need to use that unless you clean the database
 */
exports.initIssues = https.onRequest(async (request: Request, response: Response) => {
  try {
    await tasks.triageTask.manualInit().catch(err => {
      console.error(err);
    });
    response.send({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Init triage issues function started'
      })
    });
  } catch(err) {
    console.error(err);
    response.sendStatus(500);
  }
});

/**
 * Init the PRs of a repository, triggered by an insertion in the "repositories" table
 */
exports.initRepoPRs = firestore.document('repositories/{id}').onCreate((snapshot: DocumentSnapshot, context: EventContext) => {
  const data = snapshot.data();
  return tasks.commonTask.triggeredInit(data).catch(err => {
    console.error(err);
  });
});
