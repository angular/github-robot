# angular-robot

> A Github Bot built with [probot](https://github.com/probot/probot) to triage issues and PRs 

## Setup

```
# Install dependencies
npm install

# Run the bot
npm start
```

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this app.

Set Firebase environment parameters:
```sh
firebase functions:config:set probot.id="[APP_ID]" probot.secret="[SECRET]" probot.cert="[CERT]"
```
