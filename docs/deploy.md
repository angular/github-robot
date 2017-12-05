# Deploying

If you would like to run your own instance of this app, see the [docs for deployment](https://probot.github.io/docs/deployment/).

This app requires these **Permissions & events** for the GitHub App:

- Commit statuses - **Read & Write**
  - [x] Check the box for **Status** events
- Issues - **Read & Write**
  - [x] Check the box for **Issue comment** events
  - [x] Check the box for **Issues** events
- Pull requests - **Read & Write**
  - [x] Check the box for **Pull request** events
  - [x] Check the box for **Pull request review** events
  - [x] Check the box for **Pull request review comment** events
- Repository contents - **Read-only**
  - [x] Check the box for **Push** events

If you want to deploy on Firebase, you'll need to setup the app id, secret and cert as environment parameters:
```sh
firebase functions:config:set probot.id="[APP_ID]" probot.secret="[SECRET]" probot.cert="[CERT]"
```
