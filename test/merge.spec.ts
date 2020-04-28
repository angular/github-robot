import {Context, Application} from "probot";
import {MergeTask} from "../functions/src/plugins/merge";
import {appConfig} from "../functions/src/default";
import {MockFirestore} from './mocks/firestore';
import {mockGithub, mockGraphQL} from "./mocks/github";
import {CommonTask} from "../functions/src/plugins/common";
import {GitHubAPI} from "probot/lib/github";

describe('merge', () => {
  let robot: Application;
  let github: GitHubAPI;
  let commonTask: CommonTask;
  let mergeTask: MergeTask;
  let store: FirebaseFirestore.Firestore;

  beforeEach(() => {
    mockGithub('repos');
    mockGithub('get-installations');
    mockGithub('get-installation-repositories');
    mockGithub('repo-pull-requests');
    mockGithub('repo-pull-request');
    mockGithub('repo-pull-request-reviews');
    mockGithub('repo-pull-request-requested-reviewers');

    // create the mock Firebase Firestore
    store = new MockFirestore();

    // Create a new Robot to run our plugin
    robot = new Application();

    // Mock out the GitHub API
    github = GitHubAPI({
      debug: true,
      logger: robot.log
    });

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);

    // create plugin
    mergeTask = new MergeTask(robot, store);
    commonTask = new CommonTask(robot, store);
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issues.opened.json');
      const context = new Context(event, github, robot.log);
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
      const context = new Context(event, github, robot.log);
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

  describe('reviews', () => {
    it('should be able to get the accurate number of pending reviews', async () => {
      mockGraphQL({
        "repository": {
          "pullRequest": {
            "number": 19,
            "state": "OPEN",
            "reviews": {
              "nodes": [
                {
                  "authorAssociation": "COLLABORATOR",
                  "author": {
                    "userId": "MDQ6VXNlcjM3MTc1ODEz"
                  },
                  "state": "APPROVED",
                  "createdAt": "2018-03-20T16:12:02Z"
                },
                {
                  "authorAssociation": "COLLABORATOR",
                  "author": {
                    "userId": "MDQ6VXNlcjM3MTc1ODEz"
                  },
                  "state": "APPROVED",
                  "createdAt": "2018-03-26T12:42:49Z"
                },
                {
                  "authorAssociation": "COLLABORATOR",
                  "author": {
                    "userId": "MDQ6VXNlcjM3MTc1ODEz"
                  },
                  "state": "APPROVED",
                  "createdAt": "2018-03-26T14:02:37Z"
                }
              ]
            },
            "reviewRequests": {
              "nodes": []
            }
          }
        }
      });
      // const event = require('./fixtures/pr-comments.json');
      const event = require('./fixtures/pull_request_review.submitted.json');
      const context = new Context(event, github, robot.log) as any;
      const pendingReviews = await mergeTask.getPendingReviews(context, context.payload.pull_request);
      expect(pendingReviews).toEqual(0);
    });
  });
});
