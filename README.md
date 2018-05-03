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
2. [Configure the Github App](https://github.com/apps/ngbot)
3. It will start scanning for opened issues and pull requests to monitor

A [`.github/angular-robot.yml`](test/fixtures/angular-robot.yml) file is required to enable the plugin. The file can be empty, or it can override any of these default settings.

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


### Size plugin: 
The size plugin will monitor build artifacts from circleci and determine if large chages have occured. It Will
- retrieve artifacts from circleci and save them into the database
- compare artfacts from PRs agasint ones stored in the database based on the artifact name to determine size increases
- mark a PR as failed if the increase is larger than the amount configured (1000 bytes by default)
- report the size of the largest increase or smallest decrease
