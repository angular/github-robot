import {createProbot, Options} from "probot";
import {credential, firestore, initializeApp, ServiceAccount} from "firebase-admin";
import {consoleStream, loadFirebaseConfig, registerTasks} from "./util";
import {HttpClient} from "./http";

console.warn(`Starting dev mode`);

const config: Options = require('../private/env.json');
const sizeAppConfig: ServiceAccount = loadFirebaseConfig("../private/firebase-key.json");

const sizeApp = initializeApp({
  credential: credential.cert(sizeAppConfig),
  databaseURL: `https://${sizeAppConfig.projectId}.firebaseio.com`,
});

const store: FirebaseFirestore.Firestore = firestore();
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
