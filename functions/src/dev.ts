import {createProbot} from "../libs/probot";
import {MergeTask} from './plugins/merge';
import {initializeApp, firestore, credential} from "firebase-admin";

console.warn(`Starting dev mode`);

const config = require('../private/env.json');
const serviceAccount = require("../private/firebase-key.json");
initializeApp({
  credential: credential.cert(serviceAccount)
});

// Probot setup
const bot = createProbot(config);

// Load plugins
let mergeTask: MergeTask;
const store = firestore();
bot.setup([robot => {
  mergeTask = new MergeTask(robot, store);
}]);

process.on('uncaughtException', function(err: any) {
  if(err.errno === 'EADDRINUSE') {
    console.error(`${err.message}`);
  } else {
    console.error(err);
    process.exit(1);
  }
});

// Start the bot
bot.start();

export {bot, mergeTask};
