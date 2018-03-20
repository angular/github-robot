import {config, firestore as database, https} from 'firebase-functions';
import {Request, Response} from "express";
import * as probot from "probot-ts";
import {consoleStream, registerTasks, Tasks} from "./util";
import {credential, firestore, initializeApp} from "firebase-admin";

let bot;
let tasks: Tasks;
let probotConfig = config().probot;

// Check if we are in Firebase or in development
if(probotConfig) {
  // Init Firebase
  initializeApp(config().firebase);
} else {
  // Use dev config
  probotConfig = require('../private/env.json');
  const serviceAccount = require("../private/firebase-key.json");
  initializeApp({
    credential: credential.cert(serviceAccount)
  });
}

const store: FirebaseFirestore.Firestore = firestore();
// Create the bot using Firebase's probot config (see Readme.md)
bot = probot(probotConfig);
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
  const event = request.get('x-github-event') || request.get('X-GitHub-Event');
  const id = request.get('x-github-delivery') || request.get('X-GitHub-Delivery');
  if(event) {
    try {
      await bot.receive({
        event,
        id,
        payload: request.body
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
exports.initRepoPRs = database.document('repositories/{id}').onCreate(event => {
  const data = event.data.data();
  return tasks.commonTask.triggeredInit(data).catch(err => {
    console.error(err);
  });
});
