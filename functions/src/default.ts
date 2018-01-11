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
    mergeConflictComment: `Hello? Don't want to hassle you. Sure you're busy. But--this PR has some conflicts that you probably ought to resolve.
That is... if you want it to be merged someday...`,

    // label to monitor, it will be removed if one of the checks doesn't pass
    mergeLabel: "merge",
    // label to override the checks, if present then the merge label will not be removed even if a check fails, leave empty or set to false to disable
    overrideLabel: "override",

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
    // {{OVERRIDE_LABEL}} will be replaced by the value of the overrideLabel option
    // {{PLACEHOLDER}} will be replaced by the list of failing checks
    mergeRemovedComment: `I don't like to brag, but I just saved you from a horrible, slow and painful death by removing the \`{{MERGE_LABEL}}\` label. Probably. Maybe...
Anyway, here is why I did that:
{{PLACEHOLDER}}

But if you think that you know better than me, then please, go ahead, add the \`{{OVERRIDE_LABEL}}\` label and add an override justification comment for the caretaker. You'll be free to do whatever you want. Don't say that I didn't warn you.`
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
  overrideLabel: string;
  checks: {
    noConflict: boolean;
    requiredLabels: string[];
    forbiddenLabels: string[];
    requiredStatuses: string[];
  };
  mergeRemovedComment: string;
}
