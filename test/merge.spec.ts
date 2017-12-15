import {createRobot, Context, paginate} from '../libs/probot';
import * as probot from 'probot';
import {MergeTask} from "../functions/src/plugins/merge";
import {appConfig} from "../functions/src/default";
import {MockFirestore} from './mocks/firestore';
import * as Github from 'github';
import {mockGithub} from "./mocks/github";

describe('triage', () => {
  let robot: probot;
  let github: probot.github;
  let mergeTask: MergeTask;
  let store: FirebaseFirestore.Firestore;

  beforeAll(() => {
    mockGithub('repos');
    mockGithub('get-installations');
    mockGithub('get-installation-repositories');
    mockGithub('repo-pull-requests');
    mockGithub('repo-pull-request');
  });

  beforeEach(() => {
    // create the mock Firebase Firestore
    store = new MockFirestore();

    // Mock out the GitHub API
    github = new Github();
    github.paginate = paginate;

    // Create a new Robot to run our plugin
    robot = createRobot();

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);

    // create plugin
    mergeTask = new MergeTask(robot, store);

    // patching mock firestore collections
    // issue https://github.com/soumak77/firebase-mock/issues/41
    mergeTask.repositories.where = () => mergeTask.repositories;
    mergeTask.pullRequests.where = () => mergeTask.pullRequests;
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issue.opened.json');
      const context = new Context(event, github);
      const config = await mergeTask.getConfig(context);
      expect(config).toEqual(appConfig.merge);
    });
  });

  describe('init', () => {
    it('should try to get existing PRs', async () => {
      await mergeTask.init();
      const storeData = await mergeTask.pullRequests.get();
      expect(storeData.docs.length).toBeGreaterThan(0);
      // our data set in mocks/scenarii/api.github.com/repo-pull-request.json returns a PR whose number value is 1
      expect(storeData.docs[0]['number']).toEqual(1);
    });
  });
});
