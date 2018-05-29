import {createProbot, Options} from "probot";
import {credential, firestore, initializeApp, ServiceAccount} from "firebase-admin";
import {consoleStream, loadFirebaseConfig, registerTasks} from "./util";
import {HttpClient} from "./http";

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


// Load plugins
bot.setup([robot => {
  registerTasks(robot, store, httpClient, sizeAppConfig);
}]);

// Start the bot
bot.start();

