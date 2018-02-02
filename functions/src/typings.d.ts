// Type definitions for probot v3.0.0 (WIP)
// Project: github.com/probot/probot
// Definitions by: sirMerr <github.com/sirMerr>
// Definitions: DefinitelyTyped/DefinitelyTyped
/// <reference types="express" />

import * as Github from "github";
import * as express from "express";

declare namespace probot {
  const cache: any;
  const logger: any;
  const defaultApps: Array<any>;

  export function server(webhook: any): express.Application;

  export function resolver(app: express.Application, opts: Object | {}): any;

  export function initiate(options: {}): {
    server: (webhook: any) => express.Application,
    webhook: any,
    receive: (event: any) => Promise<any>,
    logger: any,
    load: (plugin: any) => Robot,
    setup: (apps: any) => void
  };

  export class EnhancedGitHubClient extends Github {
    constructor(options: Github.Options);

    handler(params, block, callback): void;

    paginate<T>(responsePromise: Promise<T>, callback?: (response: T) => any): Promise<any>;
  }


  /**
   * Helpers for extracting information from the webhook event, which can be
   * passed to GitHub API calls.
   *
   * @property {github} github - An authenticated GitHub API client
   * @property {payload} payload - The webhook event payload
   * @property {string} event - The webhook event name
   */
  export class Context {
    constructor(properties: probot.ContextProperties);
    github: EnhancedGitHubClient;

    /**
     * Return the `owner` and `repo` params for making API requests against a
     * repository.
     *
     * @param {object} [object] - Params to be merged with the repo params.
     *
     * @example
     *
     * const params = context.repo({path: '.github/stale.yml'})
     * // Returns: {owner: 'username', repo: 'reponame', path: '.github/stale.yml'}
     *
     */
    repo(params: Github.ReposCreateCommitCommentParams): probot.RepoParams;

    /**
     * Return the `owner`, `repo`, and `number` params for making API requests
     * against an issue or pull request. The object passed in will be merged with
     * the repo params.
     *
     * @example
     *
     * const params = context.issue({body: 'Hello World!'})
     * // Returns: {owner: 'username', repo: 'reponame', number: 123, body: 'Hello World!'}
     *
     * @param {object} [object] - Params to be merged with the issue params.
     */
    issue(params: probot.IssueParams): Github.IssuesGetParams;

    /**
     * Returns a boolean if the actor on the event was a bot.
     * @type {boolean}
     */
    isBot(): boolean;


    /**
     * Reads the app configuration from the given YAML file in the `.github`
     * directory of the repository.
     *
     * @example <caption>Contents of <code>.github/myapp.yml</code>.</caption>
     *
     * close: true
     * comment: Check the specs on the rotary girder.
     *
     * @example <caption>App that reads from <code>.github/myapp.yml</code>.</caption>
     *
     * // Load config from .github/myapp.yml in the repository
     * const config = await context.config('myapp.yml')
     *
     * if (config.close) {
         *   context.github.issues.comment(context.issue({body: config.comment}))
         *   context.github.issues.edit(context.issue({state: 'closed'}))
         * }
     *
     * @example <caption>Using a <code>defaultConfig</code> object.</caption>
     *
     * // Load config from .github/myapp.yml in the repository and combine with default config
     * const config = await context.config('myapp.yml', {comment: 'Make sure to check all the specs.'})
     *
     * if (config.close) {
         *   context.github.issues.comment(context.issue({body: config.comment}));
         *   context.github.issues.edit(context.issue({state: 'closed'}))
         * }
     *
     * @param {string} fileName - Name of the YAML file in the `.github` directory
     * @param {object} [defaultConfig] - An object of default config options
     * @return {Promise<Object>} - Configuration object read from the file
     */
    config<T>(fileName: string, defaultConfig: object): Promise<T>;
  }

  /**
   * The `robot` parameter available to apps
   *
   * @property {logger} log - A logger
   */
  export class Robot {
    constructor(properties: probot.RobotProperties | {});

    receive(event: string): Promise<any>;

    /**
     * Get an {@link http://expressjs.com|express} router that can be used to
     * expose HTTP endpoints
     *
     * @example
     * module.exports = robot => {
         *   // Get an express router to expose new HTTP endpoints
         *   const app = robot.route('/my-app');
         *
         *   // Use any middleware
         *   app.use(require('express').static(__dirname + '/public'));
         *
         *   // Add a new route
         *   app.get('/hello-world', (req, res) => {
         *     res.end('Hello World');
         *   });
         * };
     *
     * @param {string} path - the prefix for the routes
     * @returns {@link http://expressjs.com/en/4x/api.html#router|express.Router}
     */
    route(path: string): express.Router;

    /**
     * Authenticate and get a GitHub client that can be used to make API calls.
     *
     * You'll probably want to use `context.github` instead.
     *
     * **Note**: `robot.auth` is asynchronous, so it needs to be prefixed with a
     * [`await`](developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
     * to wait for the magic to happen.
     *
     * @example
     *
     *  module.exports = function(robot) {
         *    robot.on('issues.opened', async context => {
         *      const github = await robot.auth();
         *    });
         *  };
     *
     * @param {number} [id] - ID of the installation, which can be extracted from
     * `context.payload.installation.id`. If called without this parameter, the
     * client wil authenticate [as the app](developer.github.com/apps/building-integrations/setting-up-and-registering-github-apps/about-authentication-options-for-github-apps/#authenticating-as-a-github-app)
     * instead of as a specific installation, which means it can only be used for
     * [app APIs](developer.github.com/v3/apps).
     *
     * @returns {Promise<github>} - An authenticated GitHub API client
     * @private
     */
    auth(id: number): Promise<number>;

    /**
     * Listen for [GitHub webhooks](developer.github.com/webhooks),
     * which are fired for almost every significant action that users take on
     * GitHub.
     *
     * @param {string} event - the name of the [GitHub webhook
     * event](developer.github.com/webhooks/#events). Most events also
     * include an "action". For example, the * [`issues`](
     * developer.github.com/v3/activity/events/types/#issuesevent)
     * event has actions of `assigned`, `unassigned`, `labeled`, `unlabeled`,
     * `opened`, `edited`, `milestoned`, `demilestoned`, `closed`, and `reopened`.
     * Often, your bot will only care about one type of action, so you can append
     * it to the event name with a `.`, like `issues.closed`.
     *
     * @param {Robot~webhookCallback} callback - a function to call when the
     * webhook is received.
     *
     * @example
     *
     * robot.on('push', context => {
         *   // Code was just pushed.
         * });
     *
     * robot.on('issues.opened', context => {
         *   // An issue was just opened.
         * });
     */
    on(event: string, callback: (context: Context) => any): any;

    log(...args: any[]): void;
  }

  function probotEnhancedClient(github: Github): Github;

  // Hack client to only allow one request at a time with a 1s delay
  // mikedeboer/node-github/issues/526
  function rateLimitedClient(github: Github): Github;

  // Return a function that defaults to "debug" level, and has properties for
  // other levels:
  //
  //     robot.log("debug")
  //     robot.log.trace("verbose details");
  //
  function wrapLogger(logger: any): (any) => any;

  export interface ContextProperties {
    event: string;
    github: Github;
  }

  export type IssueParams =
    Github.Assignees
    &
    {
      title?: string;
      body?: string;
      assignee?: string;
      state?: "open" | "closed";
      milestone?: number;
      labels?: string[];
    };

  export type RepoParams =
    & Github.Sha
    & Github.Body
    & {
    path?: string;
    position?: number;
    line?: number;
  };

  export interface RobotProperties {
    events: any; // EventEmitter from promise-events. No declaration file
    app: any;
    cache: any;
    logger: any;
    router: express.Router;
    catchErrors: any;
  }
}

// export = probot;
export {probot};

declare module "github" {
  export interface SearchRequest<T> {
    data: {
      total_count: number;
      incomplete_results: boolean;
      items: T[];
    };
    meta: {
      'x-ratelimit-limit': string,
      'x-ratelimit-remaining': string,
      'x-ratelimit-reset': string,
      'x-github-request-id': string,
      'x-github-media-type': string,
      status: string
    };
  }

  export interface Label {
    id: number;
    url: string;
    name: string;
    color: string;
    default: boolean; // if this is a default label from Github
  }

  export interface User {
    login: string;
    id: number;
    url: string;
    html_url: string;
    type: string;
    site_admin: boolean;
  }

  export interface License {
    key: string;
    name: string;
    spdx_id: string;
    url: string;
  }

  export interface Repository {
    id: number;
    name: string;
    full_name: string;
    owner: User;
    private: boolean;
    url: string;
    html_url: string;
    description: string;
    stargazers_count: number;
    watchers_count: number;
    forks_count: number;
    has_issues: boolean;
    has_projects: boolean;
    has_downloads: boolean;
    has_wiki: boolean;
    has_pages: boolean;
    open_issues_count: number;
    license: License;
    forks: number;
    open_issues: number;
    watchers: number;
    default_branch: string;
  }

  export interface Milestone {
    url: string;
    html_url: string;
    id: number;
    number: number;
    title: string;
    description: string;
    creator: User;
    open_issues: number;
    closed_issues: number;
    state: string;
    created_at: string;
    updated_at: string;
    due_on: string | null;
    closed_at: string | null;
  }

  export interface Issue {
    url: string;
    repository_url: string;
    html_url: string;
    id: number;
    number: number;
    title: string;
    user: User;
    labels: Label[];
    pull_request?: {
      url: string;
      html_url: string;
    };
    milestone: Milestone | null;
  }
}
