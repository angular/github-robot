import * as probot from "probot-ts";
import {credential, firestore, initializeApp} from "firebase-admin";
import {registerTasks} from "./util";

console.warn(`Starting dev mode`);

const config = require('../private/env.json');
const serviceAccount = require("../private/firebase-key.json");
initializeApp({
  credential: credential.cert(serviceAccount)
});

// Probot setup
const bot = probot(config);

// Load plugins
const store = firestore();
bot.setup([robot => {
  registerTasks(robot, store);
}]);

// Start the bot
bot.start();
