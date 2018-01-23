import * as probot from "probot-ts";
import * as Context from "probot-ts/lib/context";
import * as EnhancedGitHubClient from "probot-ts/lib/github";
import * as logger from "probot-ts/lib/logger";
import {MergeTask} from "../functions/src/plugins/merge";
import {appConfig} from "../functions/src/default";
import {MockFirestore} from './mocks/firestore';
import {mockGithub} from "./mocks/github";
import {CommonTask} from "../functions/src/plugins/common";

describe('triage', () => {
  let robot: probot;
  let github: probot.github;
  let commonTask: CommonTask;
  let mergeTask: MergeTask;
  let store: FirebaseFirestore.Firestore;

  beforeEach(() => {
    mockGithub('repos');
    mockGithub('get-installations');
    mockGithub('get-installation-repositories');
    mockGithub('repo-pull-requests');
    mockGithub('repo-pull-request');

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
    mergeTask = new MergeTask(robot, store);
    commonTask = new CommonTask(robot, store);
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issues.opened.json');
      const context = new Context(event, github);
      const config = await mergeTask.getConfig(context);
      expect(config).toEqual(appConfig.merge);
    });
  });

  describe('init', () => {
    it('should work with a manual init', async () => {
      await commonTask.manualInit();
      let storeData = await commonTask.repositories.get();
      // shouldn't work if allowInit is false
      expect(storeData.docs.length).toEqual(0);

      await commonTask.admin.doc('config').set({allowInit: true});
      await commonTask.manualInit();
      storeData = await commonTask.repositories.get();
      expect(storeData.docs.length).toBeGreaterThan(0);
      // our data set in mocks/scenarii/api.github.com/get-installation-repositories.json returns a repository whose name is "test"
      expect(storeData.docs[0].data()['name']).toEqual('test');
    });

    it('should work on repository added', async () => {
      const event = require('./fixtures/installation_repositories.added.json');
      const context = new Context(event, github);
      await commonTask.installInit(context);
      const storeData = await commonTask.repositories.get();
      expect(storeData.docs.length).toBeGreaterThan(0);
      // our data set in mocks/scenarii/api.github.com/get-installation-repositories.json returns a repository whose name is "test"
      expect(storeData.docs[0].data()['name']).toEqual('test');
    });

    it('should work on app installation', async () => {
      const event = require('./fixtures/installation.created.json');
      await commonTask.init(github, event.payload.repositories);
      const storeData = await commonTask.pullRequests.get();
      expect(storeData.docs.length).toBeGreaterThan(0);
      // our data set in mocks/scenarii/api.github.com/repo-pull-request.json returns a PR whose number value is 1
      expect(storeData.docs[0].data()['number']).toEqual(1);
    });
  });
});
