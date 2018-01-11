import * as probot from "probot-ts";
import {MergeTask} from './plugins/merge';
import {initializeApp, firestore, credential} from "firebase-admin";

console.warn(`Starting dev mode`);

const config = require('../private/env.json');
const serviceAccount = require("../private/firebase-key.json");
initializeApp({
  credential: credential.cert(serviceAccount)
});

// Probot setup
const bot = probot(config);

// Load plugins
let mergeTask: MergeTask;
const store = firestore();
bot.setup([robot => {
  mergeTask = new MergeTask(robot, store);
}]);

// Start the bot
bot.start();

export {bot, mergeTask};
