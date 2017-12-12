import * as probot from "../libs/probot";
import * as admin from 'firebase-admin';
import {MergeTask} from './plugins/merge';

console.warn(`Starting dev mode`);

const config = require('../private/env.json');
const serviceAccount = require("../private/firebase-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Probot setup
const bot = probot.createProbot(config);

// Load plugins
let mergeTask: MergeTask;
bot.setup([robot => {
  mergeTask = new MergeTask(robot);
}]);

// Start the bot
bot.start();

export {bot, mergeTask};
