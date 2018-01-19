# Angular Robot

A Bot built with [probot](https://github.com/probot/probot) to handle multiple tasks on Github

## Dev setup

```
# Install dependencies
yarn install

# Run the bot
npm start
```


# Usage
This bot is only available for repositories of the [Angular organization](http://github.com/angular/).
See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance.

### Adding the bot:
1. Create `.github/angular-robot.yml` based on the following template
2. [Configure the Github App](https://github.com/apps/wheatley)
3. It will start scanning for opened issues and pull requests to monitor

A `.github/angular-robot.yml` file is required to enable the plugin. The file can be empty, or it can override any of these default settings:
```yaml
# Configuration for angular-robot

# options for the merge plugin
merge:
  # the status will be added to your pull requests
  status:
    # set to true to disable
    disabled: false
    # the name of the status
    context: "ci/angular: merge status"
    # text to show when all checks pass
    successText: "All checks passed!"
    # text to show when some checks are failing
    failureText: "The following checks are failing:"

  # comment that will be added to a PR when there is a conflict, leave empty or set to false to disable
  # {{PRAuthor}} will be replaced by the value of the PR author name
  mergeConflictComment: "Hi @{{PRAuthor}}! This PR has merge conflicts due to recent upstream merges.
\nPlease help to unblock it by resolving these conflicts. Thanks!"

  # label to monitor
  mergeLabel: "PR action: merge"

  # list of checks that will determine if the merge label can be added
  checks:
    # whether the PR shouldn't have a conflict with the base branch
    noConflict: true
    # list of labels that a PR needs to have, checked with a regexp (e.g. "PR target:" will work for the label "PR target: master")
    requiredLabels:
      - "PR target:"
      - "cla: yes"

    # list of labels that a PR shouldn't have, checked after the required labels with a regexp
    forbiddenLabels:
      - "PR target: TBD"
      - "cla: no"

    # list of PR statuses that need to be successful
    requiredStatuses:
      - "continuous-integration/travis-ci/pr"
      - "code-review/pullapprove"
      - "ci/circleci: build"
      - "ci/circleci: lint"

    # the comment that will be added when the merge label is added despite failing checks, leave empty or set to false to disable
    # {{MERGE_LABEL}} will be replaced by the value of the mergeLabel option
    # {{PLACEHOLDER}} will be replaced by the list of failing checks
    mergeRemovedComment: "I see that you just added the `{{MERGE_LABEL}}` label, but the following checks are still failing:
\n{{PLACEHOLDER}}
\n
\n**If you want your PR to be merged, it has to pass all the CI checks.**
\n
\nIf you can't get the PR to a green state due to flakes or broken master, please try rebasing to master and/or restarting the CI job. If that fails and you believe that the issue is not due to your change, please contact the caretaker and ask for help."

# options for the triage plugin
triage:
  # number of the milestone to apply when the issue is triaged
  defaultMilestone: 82,
  # arrays of labels that determine if an issue is triaged
  triagedLabels:
    -
      - "type: bug"
      - "severity"
      - "freq"
      - "comp:"
    -
      - "type: feature"
      - "comp:"
```

### Manual installation
By default the bot will automatically trigger its installation routines when you install it on a new repository.
If for some reason you need to trigger the init manually, you need to change the value `allowInit` to true in the admin / config database and then you can call the "init" function from Firebase functions. Don't forget to set `allowInit` to false after that.

# Plugins
The bot is designed to run multiple plugins.

### Merge plugin:
The merge plugin will monitor pull requests to check whether they are mergeable or not. It will:
- check for conflicts with the base branch and add a comment when it happens
- check for required labels using regexps
- check for forbidden labels using regexps
- check that required statuses are successful
- add a status that is successful when all the checks pass
- monitor the `PR action: merge` label (the name is configurable). If any of the checks is failing it will add a comment to list the reasons

When you install the bot on a new repository, it will start scanning for opened PRs and monitor them.

It will **not**:
- add a comment for existing merge labels
- add a comment for conflicts until you push a new commit to the base branch
- add the new merge status until the PR is synchronized (new commit pushed), labeled, unlabeled, or receives another status update

### Triage plugin:
The triage plugin will triage issues. It will:
- apply the default milestone when all required labels have been applied (= issue has been triaged)
