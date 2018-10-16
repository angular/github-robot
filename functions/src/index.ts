import {config, firestore, https} from 'firebase-functions';
import {Request, Response} from "express";
import {createProbot, Options} from "probot";
import {consoleStream, registerTasks, Tasks} from "./util";
import {firestore as firestoreAdmin, initializeApp} from "firebase-admin";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {EventContext} from "firebase-functions/lib/cloud-functions";

let tasks: Tasks;
let probotConfig: Options = config().probot;

// Check if we are in Firebase or in development
if(!probotConfig) {
  // Use dev config
  probotConfig = require('../private/env.json');
}

// Init Firebase
initializeApp();

const store: FirebaseFirestore.Firestore = firestoreAdmin();
// Create the bot using Firebase's probot config (see Readme.md)
const bot = createProbot(probotConfig);
// disable probot logging
bot.logger.streams.splice(0, 1);
// Use node console as the output stream
bot.logger.addStream(consoleStream(store));
// Load the merge task to monitor PRs
bot.load(robot => {
  tasks = registerTasks(robot, store);
});

/**
 * Relay Github events to the bot
 */
exports.bot = https.onRequest(async (request: Request, response: Response) => {
  const name = request.get('x-github-event') || request.get('X-GitHub-Event');
  const id = request.get('x-github-delivery') || request.get('X-GitHub-Delivery');
  if(name) {
    try {
      await bot.receive({
        name,
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
 * Manually trigger init to triage issues, you shouldn't need to use that unless you clean the database
 */
exports.initTriage = https.onRequest(async (request: Request, response: Response) => {
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
 * Manually trigger init to triage PR, you shouldn't need to use that unless you clean the database
 */
exports.initTriagePR = https.onRequest(async (request: Request, response: Response) => {
  try {
    await tasks.triagePRTask.manualInit().catch(err => {
      console.error(err);
    });
    response.send({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Init triage PRs function started'
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
