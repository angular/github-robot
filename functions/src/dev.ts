import {createProbot, Options} from "probot";
import {credential, firestore, initializeApp, ServiceAccount} from "firebase-admin";
import {consoleStream, loadFirebaseConfig, registerTasks, getJwtToken} from "./util";
import {HttpClient} from "./http";
import * as google from 'googleapis';

console.warn(`Starting dev mode`);

const config: Options = require('../private/env.json');
const sizeAppConfig: ServiceAccount = loadFirebaseConfig("../private/firebase-key.json");

initializeApp({
  credential: credential.cert(sizeAppConfig),
});


const store: FirebaseFirestore.Firestore = firestore();
const httpClient = new HttpClient();

// Probot setup
const bot = createProbot(config);

// disable probot logging
bot.logger.streams.splice(0, 1);
// Use node console as the output stream
bot.logger.addStream(consoleStream(store));

async function start() {
  const accessToken = await getJwtToken(sizeAppConfig.clientEmail, sizeAppConfig.privateKey);

  // Load plugins
  bot.setup([robot => {
    registerTasks(robot, store, httpClient, accessToken, `https://${sizeAppConfig.projectId}.firebaseio.com`);
  }]);

  // Start the bot
  bot.start();
}

start();
