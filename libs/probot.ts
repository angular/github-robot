import * as createProbot from "probot";
import * as Context from "probot/lib/context";
import * as EnhancedGitHubClient from "probot/lib/github";
import * as logger from "probot/lib/logger";

const createRobot = createProbot.createRobot;

export {createProbot, createRobot, Context, EnhancedGitHubClient, logger};
