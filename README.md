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
  mergeConflictComment: "Automated Notification: Due to recent upstream merges, this PR now has merge conflicts. @{{PRAuthor}}, please help to unblock this PR by resolving these conflicts. Thanks!"

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
    mergeRemovedComment: "I see that you just added the `{{MERGE_LABEL}}` label. It won't do anything good though, because the following checks are still failing:
  \n{{PLACEHOLDER}}
  \n
  \nIf you want your PR to be merged, it has to pass all the checks. But if you have a good reason to want to merge this, please contact the caretaker to let them know."
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
