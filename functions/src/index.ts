import {https, config, firestore as database} from 'firebase-functions';
import {Request, Response} from "express";
import * as probot from "probot-ts";
import {consoleStream} from "./util";
import {MergeTask} from "./plugins/merge";
import {initializeApp, firestore, credential} from "firebase-admin";

let bot;
let mergeTask: MergeTask;
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
// Use node console as the output stream
bot.logger.addStream(consoleStream);
// Load the merge task to monitor PRs
bot.load(robot => {
  mergeTask = new MergeTask(robot, store);
});

/**
 * Relay Github events to the bot
 */
exports.bot = https.onRequest(async (request: Request, response: Response) => {
  const event = request.get('x-github-event') || request.get('X-GitHub-Event');

  if(event) {
    try {
      await bot.receive({
        event: event,
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
    await mergeTask.manualInit().catch(err => {
      console.error(err);
    });
    response.send({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Init function started'
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
  return mergeTask.triggeredInit(data).catch(err => {
    console.error(err);
  });
});
