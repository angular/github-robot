(function(e, a) { for(var i in a) e[i] = a[i]; }(exports, /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 6);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


/**
 * A logger backed by [bunyan](https://github.com/trentm/node-bunyan)
 *
 * The default log level is `info`, but you can change it by setting the
 * `LOG_LEVEL` environment variable to `trace`, `debug`, `info`, `warn`,
 * `error`, or `fatal`.
 *
 * By default, logs are formatted for readability in development. If you intend
 * to drain logs to a logging service, set `LOG_FORMAT=json`.
 *
 * **Note**: All execptions reported with `logger.error` will be forwarded to
 * [sentry](https://github.com/getsentry/sentry) if the `SENTRY_DSN` environment
 * variable is set.
 *
 * @typedef logger
 *
 * @example
 *
 * robot.log("This is an info message");
 * robot.log.debug("…so is this");
 * robot.log.trace("Now we're talking");
 * robot.log.info("I thought you should know…");
 * robot.log.warn("Woah there");
 * robot.log.error("ETOOMANYLOGS");
 * robot.log.fatal("Goodbye, cruel world!");
 */

const Logger = __webpack_require__(4);
const bunyanFormat = __webpack_require__(15);
const serializers = __webpack_require__(16);

// Return a function that defaults to "info" level, and has properties for
// other levels:
//
//     robot.log("info")
//     robot.log.trace("verbose details");
//
Logger.prototype.wrap = function () {
  const fn = this.info.bind(this);

  // Add level methods on the logger
  ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(level => {
    fn[level] = this[level].bind(this);
  });

  // Expose `child` method for creating new wrapped loggers
  fn.child = attrs => this.child(attrs, true).wrap();

  // Expose target logger
  fn.target = logger;

  return fn;
};

const logger = new Logger({
  name: 'probot',
  level: process.env.LOG_LEVEL || 'info',
  stream: bunyanFormat({ outputMode: process.env.LOG_FORMAT || 'short' }),
  serializers
});

module.exports = logger;

/***/ }),
/* 2 */
/***/ (function(module, exports) {

module.exports = require("express");

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const path = __webpack_require__(0);
const yaml = __webpack_require__(14);

/**
 * Helpers for extracting information from the webhook event, which can be
 * passed to GitHub API calls.
 *
 * @property {github} github - An authenticated GitHub API client
 * @property {payload} payload - The webhook event payload
 * @property {logger} log - A logger
 */
class Context {
  constructor(event, github, log) {
    Object.assign(this, event);
    this.github = github;
    this.log = log;
  }

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
  repo(object) {
    const repo = this.payload.repository;

    return Object.assign({
      owner: repo.owner.login || repo.owner.name,
      repo: repo.name
    }, object);
  }

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
  issue(object) {
    const payload = this.payload;
    return Object.assign({
      number: (payload.issue || payload.pull_request || payload).number
    }, this.repo(), object);
  }

  /**
   * Returns a boolean if the actor on the event was a bot.
   * @type {boolean}
   */
  get isBot() {
    return this.payload.sender.type === 'Bot';
  }

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
  config(fileName, defaultConfig) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const params = _this.repo({ path: path.posix.join('.github', fileName) });

      try {
        const res = yield _this.github.repos.getContent(params);
        const config = yaml.safeLoad(Buffer.from(res.data.content, 'base64').toString()) || {};
        return Object.assign({}, defaultConfig, config);
      } catch (err) {
        if (err.code === 404) {
          if (defaultConfig) {
            return defaultConfig;
          }
          return null;
        } else {
          throw err;
        }
      }
    })();
  }
}

module.exports = Context;

/***/ }),
/* 4 */
/***/ (function(module, exports) {

module.exports = require("bunyan");

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const Bottleneck = __webpack_require__(17);
const GitHubApi = __webpack_require__(18);

/**
 * the [github Node.js module](https://github.com/octokit/node-github),
 * which wraps the [GitHub API](https://developer.github.com/v3/) and allows
 * you to do almost anything programmatically that you can do through a web
 * browser.
 * @typedef github
 * @see {@link https://github.com/octokit/node-github}
 */

// Default callback should just return the response passed to it.
const defaultCallback = response => response;

class EnhancedGitHubClient extends GitHubApi {
  constructor(options) {
    super(options);
    this.limiter = new Bottleneck(1, 1000);
    this.logger = options.logger;
  }

  handler(params, block, callback) {
    // Only allow one request at a time with a 1s delay
    // https://github.com/octokit/node-github/issues/526
    this.limiter.submit(super.handler.bind(this), params, block, (err, res) => {
      let msg = `GitHub request: ${block.method} ${block.url}`;
      if (res) {
        msg += ` - ${res.meta.status}`;
      } else if (err) {
        msg += ` - ${err.code} ${err.status}`;
      }
      this.logger.debug({ params }, msg);

      if (res) {
        this.logger.trace(res, 'GitHub response:');
      }

      callback(err, res);
    });
  }

  paginate(responsePromise, callback = defaultCallback) {
    var _this = this;

    return _asyncToGenerator(function* () {
      let collection = [];
      let response = yield responsePromise;
      collection = collection.concat((yield callback(response)));
      while (_this.hasNextPage(response)) {
        response = yield _this.getNextPage(response);
        collection = collection.concat((yield callback(response)));
      }
      return collection;
    })();
  }
}

module.exports = EnhancedGitHubClient;

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
const probot_1 = __webpack_require__(7);
exports.createProbot = probot_1.default;
exports.createRobot = probot_1.createRobot;
const Context = __webpack_require__(3);
exports.Context = Context;
const EnhancedGitHubClient = __webpack_require__(5);
exports.EnhancedGitHubClient = EnhancedGitHubClient;
const logger = __webpack_require__(1);
exports.logger = logger;


/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const cacheManager = __webpack_require__(8);
const createWebhook = __webpack_require__(9);
const createApp = __webpack_require__(10);
const createRobot = __webpack_require__(12);
const createServer = __webpack_require__(19);
const createWebhookProxy = __webpack_require__(22);
const resolve = __webpack_require__(24);
const logger = __webpack_require__(1);

const cache = cacheManager.caching({
  store: 'memory',
  ttl: 60 * 60 // 1 hour
});

const defaultApps = [__webpack_require__(27), __webpack_require__(30), __webpack_require__(31)];

module.exports = (options = {}) => {
  const webhook = createWebhook({ path: options.webhookPath || '/', secret: options.secret || 'development' });
  const app = createApp({
    id: options.id,
    cert: options.cert
  });
  const server = createServer({ webhook, logger });

  // Log all received webhooks
  webhook.on('*', event => {
    logger.info({ event }, 'Webhook received');
    receive(event);
  });

  // Log all webhook errors
  webhook.on('error', logger.error.bind(logger));

  const robots = [];

  function receive(event) {
    return Promise.all(robots.map(robot => robot.receive(event)));
  }

  function load(plugin) {
    if (typeof plugin === 'string') {
      plugin = resolve(plugin);
    }

    const robot = createRobot({ app, cache, logger, catchErrors: true });

    // Connect the router from the robot to the server
    server.use(robot.router);

    // Initialize the plugin
    plugin(robot);
    robots.push(robot);

    return robot;
  }

  function setup(apps) {
    // Log all unhandled rejections
    process.on('unhandledRejection', logger.error.bind(logger));

    // Load the given apps along with the default apps
    apps.concat(defaultApps).forEach(app => load(app));
  }

  return {
    server,
    webhook,
    receive,
    logger,
    load,
    setup,

    start() {
      if (options.webhookProxy) {
        createWebhookProxy({ url: options.webhookProxy, webhook, logger });
      }

      server.listen(options.port);
      logger.trace('Listening on http://localhost:' + options.port);
    }
  };
};

module.exports.createRobot = createRobot;

/***/ }),
/* 8 */
/***/ (function(module, exports) {

module.exports = require("cache-manager");

/***/ }),
/* 9 */
/***/ (function(module, exports) {

module.exports = require("github-webhook-handler");

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const jwt = __webpack_require__(11);

module.exports = function ({ id, cert }) {
  return function () {
    const payload = {
      iat: Math.floor(new Date() / 1000), // Issued at time
      exp: Math.floor(new Date() / 1000) + 60, // JWT expiration time
      iss: id // GitHub App ID


      // Sign with RSA SHA256
    };return jwt.sign(payload, cert, { algorithm: 'RS256' });
  };
};

/***/ }),
/* 11 */
/***/ (function(module, exports) {

module.exports = require("jsonwebtoken");

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const { EventEmitter } = __webpack_require__(13);
const express = __webpack_require__(2);
const Context = __webpack_require__(3);
const logger = __webpack_require__(1);
const GitHubApi = __webpack_require__(5);

/**
 * The `robot` parameter available to apps
 *
 * @property {logger} log - A logger
 */
class Robot {
  constructor({ app, cache, router, catchErrors } = {}) {
    this.events = new EventEmitter();
    this.app = app;
    this.cache = cache;
    this.router = router || new express.Router();
    this.log = logger.wrap();
    this.catchErrors = catchErrors;
  }

  receive(event) {
    var _this = this;

    return _asyncToGenerator(function* () {
      return _this.events.emit('*', event).then(function () {
        return _this.events.emit(event.event, event);
      });
    })();
  }

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
  route(path) {
    if (path) {
      const router = new express.Router();
      this.router.use(path, router);
      return router;
    } else {
      return this.router;
    }
  }

  /**
   * Listen for [GitHub webhooks](https://developer.github.com/webhooks/),
   * which are fired for almost every significant action that users take on
   * GitHub.
   *
   * @param {string} event - the name of the [GitHub webhook
   * event](https://developer.github.com/webhooks/#events). Most events also
   * include an "action". For example, the * [`issues`](
   * https://developer.github.com/v3/activity/events/types/#issuesevent)
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
  on(event, callback) {
    var _this2 = this;

    if (event.constructor === Array) {
      event.forEach(e => this.on(e, callback));
      return;
    }

    const [name, action] = event.split('.');

    return this.events.on(name, (() => {
      var _ref = _asyncToGenerator(function* (event) {
        if (!action || action === event.payload.action) {
          const log = _this2.log.child({ id: event.id });

          try {
            const github = yield _this2.auth(event.payload.installation.id, log);
            const context = new Context(event, github, log);

            yield callback(context);
          } catch (err) {
            log.error({ err, event });
            if (!_this2.catchErrors) {
              throw err;
            }
          }
        }
      });

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    })());
  }

  /**
   * Authenticate and get a GitHub client that can be used to make API calls.
   *
   * You'll probably want to use `context.github` instead.
   *
   * **Note**: `robot.auth` is asynchronous, so it needs to be prefixed with a
   * [`await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
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
   * client wil authenticate [as the app](https://developer.github.com/apps/building-integrations/setting-up-and-registering-github-apps/about-authentication-options-for-github-apps/#authenticating-as-a-github-app)
   * instead of as a specific installation, which means it can only be used for
   * [app APIs](https://developer.github.com/v3/apps/).
   *
   * @returns {Promise<github>} - An authenticated GitHub API client
   * @private
   */
  auth(id, log = this.log) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const github = new GitHubApi({
        debug: process.env.LOG_LEVEL === 'trace',
        host: process.env.GHE_HOST || 'api.github.com',
        pathPrefix: process.env.GHE_HOST ? '/api/v3' : '',
        logger: log.child({ installation: id })
      });

      if (id) {
        const res = yield _this3.cache.wrap(`app:${id}:token`, function () {
          log.trace(`creating token for installation`);
          github.authenticate({ type: 'integration', token: _this3.app() });

          return github.apps.createInstallationToken({ installation_id: id });
        }, { ttl: 60 * 59 }); // Cache for 1 minute less than GitHub expiry

        github.authenticate({ type: 'token', token: res.data.token });
      } else {
        github.authenticate({ type: 'integration', token: _this3.app() });
      }

      return github;
    })();
  }
}

module.exports = (...args) => new Robot(...args);

/**
 * Do the thing
 * @callback Robot~webhookCallback
 * @param {Context} context - the context of the event that was triggered,
 *   including `context.payload`, and helpers for extracting information from
 *   the payload, which can be passed to GitHub API calls.
 *
 *  ```js
 *  module.exports = robot => {
 *    robot.on('push', context => {
 *      // Code was pushed to the repo, what should we do with it?
 *      robot.log(context);
 *    });
 *  };
 *  ```
 */

/**
 * A [GitHub webhook event](https://developer.github.com/webhooks/#events) payload
 *
 * @typedef payload
 */

/***/ }),
/* 13 */
/***/ (function(module, exports) {

module.exports = require("promise-events");

/***/ }),
/* 14 */
/***/ (function(module, exports) {

module.exports = require("js-yaml");

/***/ }),
/* 15 */
/***/ (function(module, exports) {

module.exports = require("bunyan-format");

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const bunyan = __webpack_require__(4);

module.exports = {
  repository: repository => repository.full_name,
  event: event => {
    if (typeof event !== 'object' || !event.payload) {
      return event;
    } else {
      let name = event.event;
      if (event.payload && event.payload.action) {
        name = `${name}.${event.payload.action}`;
      }

      return {
        id: event.id,
        event: name,
        repository: event.payload.repository && event.payload.repository.full_name,
        installation: event.payload.installation && event.payload.installation.id
      };
    }
  },
  installation: installation => {
    if (installation.account) {
      return installation.account.login;
    } else {
      return installation;
    }
  },

  err: bunyan.stdSerializers.err,

  req: bunyan.stdSerializers.req,

  // Same as buyan's standard serializers, but gets headers as an object
  // instead of a string.
  // https://github.com/trentm/node-bunyan/blob/fe31b83e42d9c7f784e83fdcc528a7c76e0dacae/lib/bunyan.js#L1105-L1113
  res(res) {
    if (!res || !res.statusCode) {
      return res;
    } else {
      return {
        duration: res.duration,
        statusCode: res.statusCode,
        headers: res.getHeaders()
      };
    }
  }
};

/***/ }),
/* 17 */
/***/ (function(module, exports) {

module.exports = require("bottleneck");

/***/ }),
/* 18 */
/***/ (function(module, exports) {

module.exports = require("github");

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(__dirname) {

const express = __webpack_require__(2);
const path = __webpack_require__(0);
const logging = __webpack_require__(20);

module.exports = function ({ webhook, logger }) {
  const app = express();

  app.use(logging({ logger }));
  app.use('/probot/static/', express.static(path.join(__dirname, '..', 'static')));
  app.use(webhook);
  app.set('view engine', 'hbs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.get('/ping', (req, res) => res.end('PONG'));

  return app;
};
/* WEBPACK VAR INJECTION */}.call(exports, "/"))

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// Borrowed from https://github.com/vvo/bunyan-request
// Copyright (c) Christian Tellnes <christian@tellnes.no>
var uuid = __webpack_require__(21);

module.exports = function logRequest({ logger }) {
  return function (req, res, next) {
    // Use X-Request-ID from request if it is set, otherwise generate a uuid
    req.id = req.headers['x-request-id'] || req.headers['x-github-delivery'] || uuid.v4();
    res.setHeader('x-request-id', req.id);

    // Make a logger available on the request
    req.log = logger.wrap().child({ id: req.id });

    // Request started
    req.log.trace({ req }, `${req.method} ${req.url}`);

    // Start the request timer
    const time = process.hrtime();

    res.on('finish', () => {
      // Calculate how long the request took
      const [seconds, nanoseconds] = process.hrtime(time);
      res.duration = (seconds * 1e3 + nanoseconds * 1e-6).toFixed(2);

      const message = `${req.method} ${req.url} ${res.statusCode} - ${res.duration} ms`;

      req.log.info(message);
      req.log.trace({ res });
    });

    next();
  };
};

/***/ }),
/* 21 */
/***/ (function(module, exports) {

module.exports = require("uuid");

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const EventSource = __webpack_require__(23);

module.exports = ({ url, logger, webhook }) => {
  logger.trace({ url }, 'Setting up webhook proxy');
  const events = new EventSource(url);

  events.addEventListener('message', msg => {
    logger.trace(msg, 'Message from webhook proxy');

    const data = JSON.parse(msg.data);
    const sig = data['x-hub-signature'];

    if (sig && webhook.verify(sig, JSON.stringify(data.body))) {
      const event = {
        event: data['x-github-event'],
        id: data['x-github-delivery'],
        payload: data['body'],
        protocol: data['x-forwarded-proto'],
        host: data['host']
      };

      webhook.emit(event.event, event);
      webhook.emit('*', event);
    } else {
      const err = new Error('X-Hub-Signature does not match blob signature');
      webhook.emit('error', err, msg.data);
    }
  });

  // Reconnect immediately
  events.reconnectInterval = 0;

  events.addEventListener('error', err => {
    if (!err.status) {
      // Errors are randomly re-emitted for no reason
      // See https://github.com/EventSource/eventsource/pull/85
    } else if (err.status >= 400 && err.status < 500) {
      // Nothing we can do about it
      logger.error({ url, err }, 'Webhook proxy error');
    } else if (events.readyState === EventSource.CONNECTING) {
      logger.trace({ url, err }, 'Reconnecting to webhook proxy');
    } else {
      logger.error({ url, err }, 'Webhook proxy error');
    }
  });

  return events;
};

/***/ }),
/* 23 */
/***/ (function(module, exports) {

module.exports = require("eventsource");

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = resolver;

function resolver(app, opts = {}) {
  // These are mostly to ease testing
  const basedir = opts.basedir || process.cwd();
  const resolve = opts.resolver || __webpack_require__(25).sync;
  return !(function webpackMissingModule() { var e = new Error("Cannot find module \".\""); e.code = 'MODULE_NOT_FOUND'; throw e; }());
}

/***/ }),
/* 25 */
/***/ (function(module, exports) {

module.exports = require("resolve");

/***/ }),
/* 26 */
/***/ (function(module, exports) {

function webpackEmptyContext(req) {
	throw new Error("Cannot find module '" + req + "'.");
}
webpackEmptyContext.keys = function() { return []; };
webpackEmptyContext.resolve = webpackEmptyContext;
module.exports = webpackEmptyContext;
webpackEmptyContext.id = 26;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const sentryStream = __webpack_require__(28);
const Raven = __webpack_require__(29);

module.exports = robot => {
  // If sentry is configured, report all logged errors
  if (process.env.SENTRY_DSN) {
    robot.log.debug(process.env.SENTRY_DSN, 'Errors will be reported to Sentry');
    Raven.disableConsoleAlerts();
    Raven.config(process.env.SENTRY_DSN, {
      autoBreadcrumbs: true
    }).install({});

    robot.log.target.addStream(sentryStream(Raven));
  }
};

/***/ }),
/* 28 */
/***/ (function(module, exports) {

module.exports = require("bunyan-sentry-stream");

/***/ }),
/* 29 */
/***/ (function(module, exports) {

module.exports = require("raven");

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Built-in plugin to expose stats about the deployment
module.exports = (() => {
  var _ref = _asyncToGenerator(function* (robot) {
    let refresh = (() => {
      var _ref3 = _asyncToGenerator(function* () {
        const installations = yield getInstallations();

        stats.installations = installations.length;
        stats.popular = yield popularInstallations(installations);
      });

      return function refresh() {
        return _ref3.apply(this, arguments);
      };
    })();

    let getInstallations = (() => {
      var _ref4 = _asyncToGenerator(function* () {
        const github = yield robot.auth();
        const req = github.apps.getInstallations({ per_page: 100 });
        return github.paginate(req, function (res) {
          return res.data;
        });
      });

      return function getInstallations() {
        return _ref4.apply(this, arguments);
      };
    })();

    let popularInstallations = (() => {
      var _ref5 = _asyncToGenerator(function* (installations) {
        let popular = yield Promise.all(installations.map((() => {
          var _ref6 = _asyncToGenerator(function* (installation) {
            const github = yield robot.auth(installation.id);

            const req = github.apps.getInstallationRepositories({ per_page: 100 });
            const repositories = yield github.paginate(req, function (res) {
              return res.data.repositories.filter(function (repository) {
                return !repository.private;
              });
            });
            const account = installation.account;

            account.stars = repositories.reduce(function (stars, repository) {
              return stars + repository.stargazers_count;
            }, 0);

            return account;
          });

          return function (_x5) {
            return _ref6.apply(this, arguments);
          };
        })()));

        popular = popular.filter(function (installation) {
          return installation.stars > 0;
        });
        return popular.sort(function (a, b) {
          return b.stars - a.stars;
        }).slice(0, 10);
      });

      return function popularInstallations(_x4) {
        return _ref5.apply(this, arguments);
      };
    })();

    const REFRESH_INTERVAL = 60 * 60 * 1000;

    // Cache of stats that get reported
    const stats = { installations: 0, popular: []

      // Refresh the stats when the plugin is loaded
    };const initializing = refresh();

    // Refresh the stats on an interval
    setInterval(refresh, REFRESH_INTERVAL);

    // Setup /probot/stats endpoint to return cached stats
    robot.router.get('/probot/stats', (() => {
      var _ref2 = _asyncToGenerator(function* (req, res) {
        // ensure stats are loaded
        yield initializing;
        res.json(stats);
      });

      return function (_x2, _x3) {
        return _ref2.apply(this, arguments);
      };
    })());
  });

  return function (_x) {
    return _ref.apply(this, arguments);
  };
})();

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);

module.exports = robot => {
  const app = robot.route();

  app.get('/probot', (req, res) => {
    let pkg;
    try {
      pkg = !(function webpackMissingModule() { var e = new Error("Cannot find module \".\""); e.code = 'MODULE_NOT_FOUND'; throw e; }());
    } catch (e) {
      pkg = {};
    }

    res.render('probot.hbs', pkg);
  });
  app.get('/', (req, res, next) => res.redirect('/probot'));
};

/***/ }),
/* 32 */
/***/ (function(module, exports) {

function webpackEmptyContext(req) {
	throw new Error("Cannot find module '" + req + "'.");
}
webpackEmptyContext.keys = function() { return []; };
webpackEmptyContext.resolve = webpackEmptyContext;
module.exports = webpackEmptyContext;
webpackEmptyContext.id = 32;

/***/ })
/******/ ])));