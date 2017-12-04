// todo
/*import * as createRobot from 'probot';
import {CONFIG_FILE, TriageTask, TriageTaskConfig} from "../functions/private/triage/triage-task";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

describe('triage', () => {
  let robot;
  let github;
  let triage;
  let config: TriageTaskConfig;

  beforeEach(() => {
    // Create a new Robot to run our plugin
    robot = createRobot();

    // Load the plugin
    triage = new TriageTask(robot);
    spyOn(triage, 'autoLabel').and.callThrough();

    const configContent = fs.readFileSync(path.resolve(__dirname, `fixtures/${CONFIG_FILE}`), "utf8");
    config = yaml.safeLoad(configContent);

    // Mock out the GitHub API
    github = {
      repos: {
        // Response for getting content from '.github/ISSUE_REPLY_TEMPLATE.md'
        getContent: jasmine.createSpy('getContent').and.returnValue(Promise.resolve({
          data: {
            content: Buffer.from(configContent).toString('base64')
          }
        }))
      },

      pullRequests: {
        getFiles: jasmine.createSpy('getFiles').and.returnValue({
          data: [
            {filename: 'test.txt'},
            {filename: `.github/${CONFIG_FILE}`}
          ]
        })
      },

      issues: {
        addLabels: jasmine.createSpy('addLabels')
      }
    };

    // Mock out GitHub App authentication and return our mock client
    robot.auth = () => Promise.resolve(github);
  });

  describe('issue.opened event', () => {
    const event = require('./fixtures/issue.opened.json');

    it('adds label', async () => {
      await robot.receive(event);

      expect(triage.autoLabel).toHaveBeenCalledTimes(1);

      expect(github.issues.addLabels).toHaveBeenCalledWith({
        owner: event.payload.repository.owner.login,
        repo: event.payload.repository.name,
        number: event.payload.issue.number,
        labels: config.initLabels
      });
    });
  });
});
*/
