import {Context, Application} from "probot";
import {GitHubAPI, ProbotOctokit} from "probot/lib/github";
import {TriageTask} from "../functions/src/plugins/triage";
import {appConfig} from "../functions/src/default";
import {mockGithub} from "./mocks/github";
// @ts-ignore
import MockFirestore from 'mock-cloud-firestore';

describe('triage', () => {
  let robot: Application;
  let github: GitHubAPI;
  let triageTask: TriageTask;
  let store: FirebaseFirestore.Firestore;

  beforeEach(() => {
    mockGithub('repos');

    // create the mock Firebase Firestore
    const firebase = new MockFirestore();
    store = firebase.firestore();

    // Create a new Robot to run our plugin
    robot = new Application();

    // Mock out the GitHub API
    github = GitHubAPI({
      debug: true,
      logger: robot.log,
      Octokit: ProbotOctokit
    });

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);

    // create plugin
    triageTask = new TriageTask(robot, store);
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issues.opened.json');
      const context = new Context(event, github, robot.log);
      const config = await triageTask.getConfig(context);
      expect(config).toEqual(appConfig.triage);
    });
  });

  describe('isTriaged', () => {
    it('should return the triage status', async () => {
      const event = require('./fixtures/issues.labeled.json');
      const context = new Context(event, github, robot.log);
      const config = await triageTask.getConfig(context);

      let isTriaged = triageTask.isTriaged(config.l2TriageLabels, ['comp: aio']);
      expect(isTriaged).toBeFalsy();

      isTriaged = triageTask.isTriaged(config.l2TriageLabels, ['comp: aio', 'type: feature']);
      expect(isTriaged).toBeTruthy();

      isTriaged = triageTask.isTriaged(config.l2TriageLabels, ['comp: common', 'type: bug']);
      expect(isTriaged).toBeFalsy();

      isTriaged = triageTask.isTriaged(config.l2TriageLabels, ['comp: common/http', 'type: bug/fix', 'freq1: low', 'severity3: broken']);
      expect(isTriaged).toBeTruthy();
    });
  });
});
