/**
 * this is the default config that will be used if you don't set the options in your own angular-robot.yml file
 */
export const appConfig: AppConfig = {
  size: {
    disabled: false,
    maxSizeIncrease: 1000,
    circleCiStatusName: 'ci/circleci: build',
    status: {
      disabled: false,
      context: "ci/angular: size",
    },
  },

  merge: {
    // the status will be added to your pull requests
    status: {
      // set to true to disable
      disabled: false,
      // the name of the status
      context: "ci/angular: merge status",
      // text to show when all checks pass
      successText: "All checks passed!",
      // text to show when some checks are failing
      failureText: "The following checks are failing:"
    },

    g3Status: {
      disabled: false,
      context: "google3",
      pendingDesc: "Googler: run g3sync presubmit {{PRNumber}}",
      successDesc: "Does not affect google3",
      url: "http://go/angular-g3sync",
      include: [
        "LICENSE",
        "modules/**",
        "packages/**",
      ],
      exclude: [
        "packages/language-service/**",
        "**/.gitignore",
        "**/.gitkeep",
        "**/tsconfig-build.json",
        "**/tsconfig.json",
        "**/rollup.config.js",
        "**/BUILD.bazel",
        "packages/**/test/**",
      ]
    },

    // comment that will be added to a PR when there is a conflict, leave empty or set to false to disable
    // {{PRAuthor}} will be replaced by the value of the PR author name
    mergeConflictComment: `Hi @{{PRAuthor}}! This PR has merge conflicts due to recent upstream merges.
Please help to unblock it by resolving these conflicts. Thanks!`,

    // label to monitor
    mergeLabel: "PR action: merge",

    // list of checks that will determine if the merge label can be added
    checks: {
      // whether the PR shouldn't have a conflict with the base branch
      noConflict: true,
      // whether the PR should have all reviews completed.
      requireReviews: true,
      // list of labels that a PR needs to have, checked with a regexp (e.g. "PR target:" will work for the label "PR target: master")
      requiredLabels: ["cla: yes"],
      // list of labels that a PR needs to have, checked only AFTER the merge label has been applied
      requiredLabelsWhenMergeReady: ["PR target: *"],
      // list of labels that a PR shouldn't have, checked after the required labels with a regexp
      forbiddenLabels: ["PR target: TBD", "PR action: cleanup", "PR action: review", "PR state: blocked", "cla: no"],
      // list of PR statuses that need to be successful
      requiredStatuses: ["continuous-integration/travis-ci/pr", "code-review/pullapprove", "ci/circleci: build", "ci/circleci: lint"],
    },

    // the comment that will be added when the merge label is removed, leave empty or set to false to disable
    // {{MERGE_LABEL}} will be replaced by the value of the mergeLabel option
    // {{PLACEHOLDER}} will be replaced by the list of failing checks
    mergeRemovedComment: `I see that you just added the \`{{MERGE_LABEL}}\` label, but the following checks are still failing:
{{PLACEHOLDER}}

**If you want your PR to be merged, it has to pass all the CI checks.**

If you can't get the PR to a green state due to flakes or broken master, please try rebasing to master and/or restarting the CI job. If that fails and you believe that the issue is not due to your change, please contact the caretaker and ask for help.`
  },

  triage: {    
    // set to true to disable
    disabled: true,
    // number of the milestone to apply when the issue has not been triaged yet
    needsTriageMilestone: 83,
    // number of the milestone to apply when the issue is triaged
    defaultMilestone: 82,
    // arrays of labels that determine if an issue has been triaged by the caretaker
    l1TriageLabels: [["comp: *"]],
    // arrays of labels that determine if an issue has been fully triaged
    l2TriageLabels: [["type: bug/fix", "severity*", "freq*", "comp: *"], ["type: feature", "comp: *"], ["type: refactor", "comp: *"], ["type: RFC / Discussion / question", "comp: *"]]
  }
};

export interface AppConfig {
  merge: MergeConfig;
  triage: TriageConfig;
  size: SizeConfig;
}

export interface MergeConfig {
  status: {
    disabled: boolean;
    context: string;
    successText: string;
    failureText: string;
  };
  g3Status?: {
    disabled: boolean;
    context: string;
    pendingDesc: string;
    successDesc: string;
    url: string;
    include: string[];
    exclude: string[];
  };
  mergeConflictComment: string;
  mergeLabel: string;
  checks: {
    noConflict: boolean;
    requireReviews: boolean;
    requiredLabels: string[];
    requiredLabelsWhenMergeReady: string[];
    forbiddenLabels: string[];
    requiredStatuses: string[];
  };
  mergeRemovedComment: string;
}

export interface TriageConfig {
  disabled: boolean;
  needsTriageMilestone: number;
  defaultMilestone: number;
  l1TriageLabels: string[][];
  l2TriageLabels: string[][];
  /** @deprecated use l2TriageLabels instead */
  triagedLabels?: string[][];
}

export interface SizeConfig {
  disabled: boolean;
  maxSizeIncrease: number;
  circleCiStatusName: string;
  status: {
    disabled: boolean;
    context: string;
  };
}

export interface AdminConfig {
  allowInit: boolean;
}
