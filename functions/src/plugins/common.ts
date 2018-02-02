import * as probot from "probot-ts";
import * as Github from "github";
import * as minimatch from "minimatch";
import {AdminConfig} from "../default";
import {Task} from "./task";

export class CommonTask extends Task {
  constructor(robot: probot.Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);
    // App installations on a new repository
    this.robot.on([
      'installation.created',
      'installation_repositories.added'
    ], (context: probot.Context) => this.installInit(context));
  }

  /**
   * Init all existing repositories
   * Manual call
   */
  async manualInit(): Promise<void> {
    const adminConfig = await this.admin.doc('config').get();
    if(adminConfig.exists && (<AdminConfig>adminConfig.data()).allowInit) {
      const github = await this.robot.auth();
      const installations = await github.paginate(github.apps.getInstallations({}), pages => pages.data);
      await Promise.all(installations.map(async installation => {
        const authGithub = await this.robot.auth(installation.id);
        const repositories = await authGithub.apps.getInstallationRepositories({});
        await Promise.all(repositories.data.repositories.map(async (repository: Github.Repository) => {
          await this.repositories.doc(repository.id.toString()).set({
            id: repository.id,
            name: repository.name,
            full_name: repository.full_name,
            installationId: installation.id
          }).catch(err => {
            this.robot.log.error(err);
            throw err;
          });
        }));
      }));
    } else {
      this.robot.log.error(`Manual init is disabled: the value of allowInit is set to false in the admin config database`);
    }
  }

  /**
   * Init a single repository
   * Triggered by Firebase when there is an insertion into the Firebase collection "repositories"
   */
  async triggeredInit(repository: Repository & { installationId: number }): Promise<void> {
    const authGithub = await this.robot.auth(repository.installationId);
    return this.init(authGithub, [repository]);
  }

  /**
   * Updates the database with existing PRs when the bot is installed on a new server
   * Triggered by event
   */
  async installInit(context: probot.Context): Promise<void> {
    let repositories: Repository[];
    switch(context.event) {
      case 'installation':
        repositories = context.payload.repositories;
        break;
      case 'installation_repositories':
        repositories = context.payload.repositories_added;
        break;
    }

    await Promise.all(repositories.map(async repository => {
      await this.repositories.doc(repository.id.toString()).set({
        ...repository,
        installationId: context.payload.installation.id
      }).catch(err => {
        this.robot.log.error(err);
        throw err;
      });
    }));
  }

  /**
   * Updates the PRs in Firebase for a list of repositories
   */
  async init(github: probot.EnhancedGitHubClient, repositories: Repository[]): Promise<void> {
    await Promise.all(repositories.map(async repository => {
      this.robot.log(`Starting init for repository "${repository.full_name}"`);
      const [owner, repo] = repository.full_name.split('/');

      const dbPRSnapshots = await this.pullRequests
        .where('repository', '==', repository.id)
        .where('state', '==', 'open')
        .get();

      // list of existing opened PRs in the db
      const dbPRs = dbPRSnapshots.docs.map(doc => doc.id);

      const ghPRs = await github.paginate(github.pullRequests.getAll({
        owner,
        repo,
        state: 'open',
        per_page: 100
      }), pages => pages.data);

      ghPRs.forEach(async pr => {
        const index = dbPRs.indexOf(pr.id);
        if(index !== -1) {
          dbPRs.splice(index, 1);
        }
      });

      // update the state of all PRs that are no longer opened
      if(dbPRs.length > 0) {
        const batch = this.db.batch();
        dbPRs.forEach(async id => {
          batch.set(this.pullRequests.doc(id.toString()), {state: 'closed'}, {merge: true});
        });
        batch.commit().catch(err => {
          this.robot.log.error(err);
          throw err;
        });
      }

      // add/update opened PRs
      return Promise.all(ghPRs.map(pr => github.pullRequests.get({number: pr.number, owner, repo})
        .then(res => this.updateDbPR(github, owner, repo, pr.number, repository.id, res.data))));
    }));
  }
}

/**
 * Tests if a string matches a label
 */
export function matchLabel(existingLabel: string, partialLabelsList: string[] = []): boolean {
  return partialLabelsList.some(l => !!existingLabel.match(new RegExp(l)));
}

/**
 * Gets the PR labels from Github
 */
export async function getGhLabels(github: probot.EnhancedGitHubClient, owner: string, repo: string, number: number): Promise<string[]> {
  return (await github.issues.get({
    owner,
    repo,
    number
  })).data.labels.map((label: Github.Label) => label.name);
}


/**
 * Adds a comment on a PR
 */
export async function addComment(github: probot.EnhancedGitHubClient, owner: string, repo: string, number: number, body: string): Promise<void> {
  return github.issues.createComment({
    owner,
    repo,
    number,
    body
  });
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
}

export function match(names: string[], patterns: (string | RegExp)[], negPatterns: (string | RegExp)[] = []): boolean {
  return names.some(name =>
    patterns.some(pattern =>
      minimatch(name, pattern) && !negPatterns.some(negPattern =>
        minimatch(name, negPattern)
      )
    )
  );
}
