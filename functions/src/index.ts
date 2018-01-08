import {https, config, firestore as database} from 'firebase-functions';
import {Request, Response} from "express";
import {createProbot} from "probot";
import {consoleStream} from "./util";
import {MergeTask} from "./plugins/merge";
import {initializeApp, firestore, credential} from "firebase-admin";

let bot;
let mergeTask: MergeTask;
let probotConfig = config().probot;

if(probotConfig) {
  // init database
  initializeApp(config().firebase);
} else {
  probotConfig = require('../private/env.json');
  const serviceAccount = require("../private/firebase-key.json");
  initializeApp({
    credential: credential.cert(serviceAccount)
  });
}

const store: FirebaseFirestore.Firestore = firestore();
// create the bot using Firebase's probot config (see Readme.md)
bot = createProbot(probotConfig);
// use node console as the output stream
bot.logger.addStream(consoleStream);
// load the merge task to monitor PRs
bot.load(robot => {
  mergeTask = new MergeTask(robot, store);
});

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

// todo change this function to be triggered by firestore update, when a new repository is added
// add new event on install that will add the repository to firestore
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

exports.initRepoPRs = database.document('repositories/{id}').onCreate(event => {
  const data = event.data.data();
  return mergeTask.triggeredInit(data).catch(err => {
    console.error(err);
  });
});
