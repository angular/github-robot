import {Robot} from "probot";
import {createRobot} from "probot/lib/robot";
import {EnhancedGitHubClient, OctokitWithPagination} from "probot/lib/github";
import {MockFirestore} from './mocks/firestore';
import {mockGithub} from "./mocks/github";
import {SizeTask} from "../functions/src/plugins/size";
import {MockHttpHost} from "./mocks/http";
import {MockDatabaseHost} from "./mocks/database";

describe('size', () => {
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
    sizeTask = new SizeTask(robot, store);
  });

  // TODO
});
