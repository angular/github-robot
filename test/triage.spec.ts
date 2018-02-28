import * as probot from "probot-ts";
import * as Context from "probot-ts/lib/context";
import * as EnhancedGitHubClient from "probot-ts/lib/github";
import * as logger from "probot-ts/lib/logger";
import {TriageTask} from "../functions/src/plugins/triage";
import {appConfig} from "../functions/src/default";
import {MockFirestore} from './mocks/firestore';
import {mockGithub} from "./mocks/github";

describe('triage', () => {
  let robot: probot;
  let github: probot.github;
  let triageTask: TriageTask;
  let store: FirebaseFirestore.Firestore;

  beforeEach(() => {
    mockGithub('repos');

    // create the mock Firebase Firestore
    store = new MockFirestore();

    // Mock out the GitHub API
    github = new EnhancedGitHubClient({
      logger: logger
    });

    // Create a new Robot to run our plugin
    robot = probot.createRobot();

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);

    // create plugin
    triageTask = new TriageTask(robot, store);
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issues.opened.json');
      const context = new Context(event, github);
      const config = await triageTask.getConfig(context);
      expect(config).toEqual(appConfig.triage);
    });
  });

  describe('isTriaged', () => {
    it('should return the triage status', async () => {
      const event = require('./fixtures/issues.labeled.json');
      const context = new Context(event, github);
      const config = await triageTask.getConfig(context);

      let isTriaged = triageTask.isTriaged(config.triagedLabels, ['comp: aio']);
      expect(isTriaged).toBeFalsy();

      isTriaged = triageTask.isTriaged(config.triagedLabels, ['comp: aio', 'type: feature']);
      expect(isTriaged).toBeTruthy();

      isTriaged = triageTask.isTriaged(config.triagedLabels, ['comp: common', 'type: bug']);
      expect(isTriaged).toBeFalsy();

      isTriaged = triageTask.isTriaged(config.triagedLabels, ['comp: common/http', 'type: bug/fix', 'freq1: low', 'severity3: broken']);
      expect(isTriaged).toBeTruthy();
    });
  });
});
