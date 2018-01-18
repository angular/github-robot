/**
 * this is the default config that will be used if you don't set the options in your own angular-robot.yml file
 */
export const appConfig: AppConfig = {
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

    // comment that will be added to a PR when there is a conflict, leave empty or set to false to disable
    // {{PRAuthor}} will be replaced by the value of the PR author name
    mergeConflictComment: `Automated Notification: Due to recent upstream merges, this PR now has merge conflicts. @{{PRAuthor}}, please help to unblock this PR by resolving these conflicts. Thanks!`,

    // label to monitor
    mergeLabel: "PR action: merge",

    // list of checks that will determine if the merge label can be added
    checks: {
      // whether the PR shouldn't have a conflict with the base branch
      noConflict: true,
      // list of labels that a PR needs to have, checked with a regexp (e.g. "PR target:" will work for the label "PR target: master")
      requiredLabels: ["PR target:", "cla: yes"],
      // list of labels that a PR shouldn't have, checked after the required labels with a regexp
      forbiddenLabels: ["PR target: TBD", "cla: no"],
      // list of PR statuses that need to be successful
      requiredStatuses: ["continuous-integration/travis-ci/pr", "code-review/pullapprove", "ci/circleci: build", "ci/circleci: lint"],
    },

    // the comment that will be added when the merge label is removed, leave empty or set to false to disable
    // {{MERGE_LABEL}} will be replaced by the value of the mergeLabel option
    // {{PLACEHOLDER}} will be replaced by the list of failing checks
    mergeRemovedComment: `I see that you just added the \`{{MERGE_LABEL}}\` label. It won't do anything good though, because the following checks are still failing:
{{PLACEHOLDER}}

If you want your PR to be merged, it has to pass all the checks. But if you have a good reason to want to merge this, please contact the caretaker to let them know.`
  }
};

export interface AppConfig {
  merge: MergeConfig;
}

export interface MergeConfig {
  status: {
    disabled: boolean;
    context: string;
    successText: string;
    failureText: string;
  };
  mergeConflictComment: string;
  mergeLabel: string;
  checks: {
    noConflict: boolean;
    requiredLabels: string[];
    forbiddenLabels: string[];
    requiredStatuses: string[];
  };
  mergeRemovedComment: string;
}

export interface AdminConfig {
  allowInit: boolean;
}
