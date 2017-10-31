"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const createScheduler = require("probot-scheduler");
const CONFIG_FILE = 'triage.yml';
class TriageTask {
    constructor(robot) {
        this.robot = robot;
        ['pull_request.opened', 'issues.opened']
            .forEach(event => this.robot.on(event, this.autoLabel.bind(this)));
        // Visit all repositories to sweep issues/PRs with no labels
        createScheduler(robot, {
            delay: false
        });
        this.robot.on('schedule.repository', this.sweep.bind(this));
    }
    sweep(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield context.config(CONFIG_FILE);
            const { owner, repo } = context.repo();
            this.robot.log('Starting sweep');
            const issues = yield this.searchNoLabelIssues(context);
            this.robot.log(`Found ${issues.length} issues with no label`);
            issues.forEach(issue => {
                this.robot.log(`Adding labels ${config.initLabels} to issue ${issue.number}`);
                context.github.issues.addLabels({
                    owner,
                    repo,
                    number: issue.number,
                    labels: config.initLabels
                });
            });
        });
    }
    autoLabel(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield context.config(CONFIG_FILE);
            if (config.initLabels.length > 0) {
                this.robot.log('Adding labels', config.initLabels);
                return context.github.issues.addLabels(context.issue({
                    labels: config.initLabels
                }));
            }
        });
    }
    searchNoLabelIssues(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const { owner, repo } = context.repo();
            const q = `repo:${owner}/${repo} is:open no:label`;
            const search = yield context.github.search.issues({
                q,
                sort: 'updated',
                order: 'desc',
                per_page: 30
            });
            return search.data.items;
        });
    }
}
module.exports = function (robot) {
    robot.log('Triage bot loaded & ready for action!');
    new TriageTask(robot);
};
