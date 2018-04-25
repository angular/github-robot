import {Context, Robot} from "probot";
import {createRobot} from "probot/lib/robot";
import {EnhancedGitHubClient, OctokitWithPagination} from "probot/lib/github";
import {appConfig} from "../functions/src/default";
import {MockFirestore} from './mocks/firestore';
import {mockGithub} from "./mocks/github";
import {GitHubApi} from "../functions/src/typings";
import { SizeTask, BuildArtifact, CircleCiArtifact } from "../functions/src/plugins/size";
import { MockHttpHost } from "./mocks/http";
import { MockDatabaseHost } from "./mocks/database";

describe('triage', () => {
  let robot: Robot;
  let github: OctokitWithPagination;
  let sizeTask: SizeTask;
  let store: FirebaseFirestore.Firestore;
  let mockHttp: MockHttpHost;
  let database: MockDatabaseHost;

  beforeEach(() => {
    mockGithub('repos');

    // create the mock Firebase Firestore
    store = new MockFirestore();
    database = new MockDatabaseHost();

    // Create a new Robot to run our plugin
    robot = createRobot(undefined);

    // Mock out the GitHub API
    github = EnhancedGitHubClient({
      debug: true,
      logger: robot.log
    });

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);

    mockHttp = new MockHttpHost();

    // create plugin
    sizeTask = new SizeTask(robot, store, database.database() as any, mockHttp.httpClient());
  });

  describe('getConfig', () => {
    it('should return the default merge config', async () => {
      const event = require('./fixtures/issues.opened.json');
      const context = new Context(event, github as GitHubApi, robot.log);
      const config = await sizeTask.getConfig(context);
      expect(config).toEqual(appConfig.size);
    });
  });

  describe('findLagestIncrease', () => {
    it('when the same name exists in both', () => {
      const olds: BuildArtifact[] = [
        {fullPath: 'one', size_bytes: 10},
        {fullPath: 'two', size_bytes: 10},
      ];
      const news: BuildArtifact[] = [
        {fullPath: 'one', size_bytes: 20},
        {fullPath: 'two', size_bytes: 30},
      ];
      const largest = sizeTask.findLagestIncrease(olds, news);
      expect(largest.artifact.fullPath).toEqual('two');
      expect(largest.increase).toEqual(20);
    });

    it('when a new artifact is added', () => {
      const olds: BuildArtifact[] = [
        {fullPath: 'one', size_bytes: 10},
        {fullPath: 'two', size_bytes: 10},
      ];
      const news: BuildArtifact[] = [
        {fullPath: 'one', size_bytes: 20},
        {fullPath: 'two', size_bytes: 30},
        {fullPath: 'three', size_bytes: 30},
      ];
      const largest = sizeTask.findLagestIncrease(olds, news);
      expect(largest.artifact.fullPath).toEqual('three');
      expect(largest.increase).toEqual(30);
    });
  });

  describe('getCircleCIArtifacts', () => {

    it('when the same name exists in both', async () => {
      const username = 'testusername';
      const project = 'testprojetc';
      const buildNumber = 56;

      const artifactsEndpoint = `https://circleci.com/api/v1.1/project/github/${username}/${project}/${buildNumber}/artifacts`;
      const artifactUrl = 'someurl.js';

      mockHttp.registerEndpoint(artifactsEndpoint, [{  path: 'onepath',
        pretty_path: 'twopath',
        node_index: 3,
        url: artifactUrl
      }] as CircleCiArtifact[]);

      mockHttp.registerEndpoint(artifactUrl, 'I am a js file, shhhh');

      const artifacts = await sizeTask.getCircleCIArtifacts(username, project, buildNumber);
      expect(artifacts[0]).toBeTruthy();
      expect(artifacts[0].size_bytes).toEqual(21);
      expect(mockHttp.getHits(artifactsEndpoint)).toEqual(1);
      expect(mockHttp.getHits(artifactUrl)).toEqual(1);
    });

  });


  describe('upsertNewArtifacts', () => {
    const context = {
      payload: {
        sha: '123',
        branch: 'master',
        commit_message: 'commitmsg'
      }
    };
    beforeEach(() => {
      database.values.clear();
    });

    it('should insert the value', async () => {
      const artifacts: BuildArtifact[] = [
        {fullPath: 'aio/gzip7/inline.js', size_bytes: 1001}
      ];
      await sizeTask.upsertNewArtifacts(context as any, artifacts);
      expect(database.values.get('/payload/aio/master/123').gzip7.inline).toEqual(1001);
    });

    it('should insert the value', async() => {
      const artifacts: BuildArtifact[] = [
        {fullPath: 'aio/gzip7/inline.js', size_bytes: 1001},
        {fullPath: 'aio/gzip7/main.js', size_bytes: 1003}
      ];
      await sizeTask.upsertNewArtifacts(context as any, artifacts);
      expect(database.values.get('/payload/aio/master/123').gzip7.inline).toEqual(1001);
      expect(database.values.get('/payload/aio/master/123').gzip7.main).toEqual(1003);
    });

    it('should replace prior values the value', async () => {
      let artifacts: BuildArtifact[] = [
        {fullPath: 'aio/gzip7/inline.js', size_bytes: 1001},
        {fullPath: 'aio/gzip7/main.js', size_bytes: 1003}
      ];
      await sizeTask.upsertNewArtifacts(context as any, artifacts);

      expect(database.values.get('/payload/aio/master/123').gzip7.inline).toEqual(1001);
      expect(database.values.get('/payload/aio/master/123').gzip7.main).toEqual(1003);

      artifacts = [
        {fullPath: 'aio/gzip7/inline.js', size_bytes: 1010},
        {fullPath: 'aio/gzip7/main.js', size_bytes: 1020}
      ];
      await sizeTask.upsertNewArtifacts(context as any, artifacts);

      expect(database.values.get('/payload/aio/master/123').gzip7.inline).toEqual(1010);
      expect(database.values.get('/payload/aio/master/123').gzip7.main).toEqual(1020);
    });
  });

});
