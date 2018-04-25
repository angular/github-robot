import {createProbot} from "probot";
import {credential, firestore, initializeApp, database} from "firebase-admin";
import {consoleStream, registerTasks} from "./util";
import { HttpClient } from "./http";

console.warn(`Starting dev mode`);

const config = require('../private/env.json');

const serviceAccount = require("../private/firebase-key.json");
// default firebase app
initializeApp({
  credential: credential.cert(serviceAccount)
});

const store: FirebaseFirestore.Firestore = firestore();

const sizeApp = initializeApp({
  credential: credential.cert(serviceAccount),
  databaseURL: config.sizeDatabaseUrl,
}, 'sizeApp');
const sizeStore = sizeApp.database();

const httpClient = new HttpClient();

// Probot setup
const bot = createProbot(config);

// disable probot logging
bot.logger.streams.splice(0, 1);
// Use node console as the output stream
bot.logger.addStream(consoleStream(store));


// Load plugins
bot.setup([robot => {
  registerTasks(robot, store, sizeStore, httpClient);
}]);

// Start the bot
bot.start();
