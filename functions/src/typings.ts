// Type definitions for probot v3.0.0 (WIP)
// Project: github.com/probot/probot
// Definitions by: sirMerr <github.com/sirMerr>
// Definitions: DefinitelyTyped/DefinitelyTyped
/// <reference types="express" />

import {Application} from "express";
import {WebhookEvent} from "probot-ts/lib/robot";
import {Logger, Robot} from "probot-ts";
import {Plugin} from "probot-ts/lib";

declare module "@octokit/rest" {
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

  export interface PullRequest extends Issue {
    head: {
      label: string;
      ref: string;
      sha: string;
      user: User;
    };
    base: {
      label: string;
      ref: string;
      sha: string;
      user: User;
    };
    requested_reviewers: User[];
    requested_teams: any[]; // need to check how the "team" json structure is
    mergeable: boolean|null;
  }

  export interface File {
    sha: string;
    filename: string;
    status: FILE_STATUS;
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  }

  export interface Status {
    url: string;
    id: number;
    state: STATUS_STATE;
    description: string | null;
    target_url: string | null;
    context: string;
    created_at: string;
    updated_at: string;
  }

  export interface Review {
    id: number;
    user: User;
    body: string;
    state: REVIEW_STATE;
    submitted_at: string;
  }
}

export const enum FILE_STATUS {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted'
}

export const enum STATUS_STATE {
  Pending = 'pending',
  Success = 'success',
  Failure = 'failure',
  Error = 'error'
}

export const enum REVIEW_STATE {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  ChangesRequest = 'CHANGES_REQUESTED',
  Commented = 'COMMENTED',
  Dismissed = 'DISMISSED'
}

export interface Probot {
  server: Application;
  webhook: any;
  receive: (event: WebhookEvent) => Promise<any[]>;
  logger: Logger;
  load: (plugin: string | Plugin) => Robot;
  setup: (apps: Array<string | Plugin>) => void;
  start: () => void;
}
