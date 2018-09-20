import {createProbot, Options} from "probot";
import {credential, firestore, initializeApp} from "firebase-admin";
import {consoleStream, loadFirebaseConfig, registerTasks} from "./util";

console.warn(`Starting dev mode`);

const config: Options = require('../private/env.json');
const appConfig = loadFirebaseConfig("../private/firebase-key.json");

initializeApp({
  credential: credential.cert(appConfig),
  databaseURL: `https://${appConfig.projectId}.firebaseio.com`,
});
const store: FirebaseFirestore.Firestore = firestore();

// Probot setup
const bot = createProbot(config);

// disable probot logging
bot.logger.streams.splice(0, 1);
// Use node console as the output stream
bot.logger.addStream(consoleStream(store));

// Load plugins
bot.setup([robot => {
  registerTasks(robot, store);
}]);

// Start the bot
bot.start();
