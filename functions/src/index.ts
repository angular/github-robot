import {https, config} from 'firebase-functions';
import {Request, Response} from "express";
import * as probot from "../libs/probot";
import {consoleStream} from "./util";
import {MergeTask} from "./plugins/merge";
import {initializeApp} from "firebase-admin";

let bot;
let mergeTask: MergeTask;

const probotConfig = config().probot;
if(probotConfig) {
  // init database
  initializeApp(config().firebase);
  // create the bot using Firebase's probot config (see Readme.md)
  bot = probot.createProbot(probotConfig);
  // use node console as the output stream
  bot.logger.addStream(consoleStream);
  // load the merge task to monitor PRs
  bot.load(robot => {
    mergeTask = new MergeTask(robot);
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
    await mergeTask.init();
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
});
