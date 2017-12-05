export const appConfig: AppConfig = {
  merge: {
    status: {
      disabled: false,
      context: "ci/angular: merge status",
      successText: "All checks passed!",
      failureText: "The following checks are failing:"
    },
    mergeConflictComment: `Hello? Don't want to hassle you. Sure you're busy. But--this PR has some conflicts that you probably ought to resolve.
That is... if you want it to be merged someday...`,
    mergeLabel: "merge",
    overrideLabel: "override",
    checks: {
      noConflict: true,
      requiredLabels: ["PR target:", "cla: yes"],
      forbiddenLabels: ["PR target: TBD", "cla: no"],
      requiredStatuses: ["continuous-integration/travis-ci/pr", "code-review/pullapprove", "ci/circleci: build", "ci/circleci: lint"],
    },
    mergeRemovedComment: `I don't like to brag, but I just saved you from a horrible, slow and painful death by removing the \`{{MERGE_LABEL}}\` label. Probably. Maybe...
Anyway, here is why I did that:
{{PLACEHOLDER}}

But if you think that you know better than me, then please, go ahead and add the \`{{OVERRIDE_LABEL}}\` label. You'll be free to do whatever you want. Don't say that I didn't warn you.`
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
