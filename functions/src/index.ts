import {https, config} from 'firebase-functions';
import {Request, Response} from "express";
import {createProbot} from "probot";
import {consoleStream} from "./util";
import {MergeTask} from "./plugins/merge";
import {initializeApp, firestore} from "firebase-admin";

let bot;
let mergeTask: MergeTask;
let store: FirebaseFirestore.Firestore;
const probotConfig = config().probot;
if(probotConfig) {
  // init database
  initializeApp(config().firebase);
  // create the bot using Firebase's probot config (see Readme.md)
  bot = createProbot(probotConfig);
  // use node console as the output stream
  bot.logger.addStream(consoleStream);
  // create the Firebase store
  store = firestore();
  // load the merge task to monitor PRs
  bot.load(robot => {
    mergeTask = new MergeTask(robot, store);
  });
} else {
  // in dev mode you'll get an error EADDRINUSE because we start the bot for each function, just ignore it
  const dev = require('./dev');
  bot = dev.bot;
  mergeTask = dev.mergeTask;
}

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

exports.init = https.onRequest(async (request: Request, response: Response) => {
  try {
    // don't wait for init, it will run in the background and can take a long time
    mergeTask.init().catch(err => {
      console.log(err);
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
