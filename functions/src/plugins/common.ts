import {Context, Robot} from "probot";
import * as Github from '@octokit/rest';
import * as minimatch from "minimatch";
import {AdminConfig} from "../default";
import {Task} from "./task";
import {OctokitWithPagination} from "probot/lib/github";
import {firestore} from "firebase-admin";

export class CommonTask extends Task {
  constructor(robot: Robot, db: FirebaseFirestore.Firestore) {
    super(robot, db);
    // App installations on a new repository
    this.dispatch([
      'installation.created',
      'installation_repositories.added'
    ], this.installInit.bind(this));
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
  async triggeredInit(data: firestore.DocumentData): Promise<void> {
    const repository = data as Repository & { installationId: number };
    const authGithub = await this.robot.auth(repository.installationId);
    return this.init(authGithub, [repository]);
  }

  /**
   * Updates the database with existing PRs when the bot is installed on a new server
   * Triggered by event
   */
  async installInit(context: Context): Promise<void> {
    let repositories: Repository[];
    switch(context['event']) {
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
  async init(github: OctokitWithPagination, repositories: Repository[]): Promise<void> {
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
      }), pages => pages.data) as any as any[];

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
 * Gets the PR labels from Github
 */
export async function getGhLabels(github: OctokitWithPagination, owner: string, repo: string, number: number): Promise<Github.Label[]> {
  return (await github.issues.get({
    owner,
    repo,
    number
  })).data.labels;
}

export function getLabelsNames(labels: Github.Label[] | string[]): string[] {
  if(typeof labels[0] !== 'string') {
    labels = (labels as any as Github.Label[]).map(label => label.name);
  }
  return labels as string[];
}

/**
 * Adds a comment on a PR
 */
export async function addComment(github: OctokitWithPagination, owner: string, repo: string, number: number, body: string): Promise<Github.AnyResponse> {
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

/**
 * Returns true if any of the names match any of the patterns
 * It ignores any pattern match that is also matching a negPattern
 */
export function matchAny(names: string[], patterns: (string | RegExp)[], negPatterns: (string | RegExp)[] = []): boolean {
  return names.some(name =>
    patterns.some(pattern =>
      !!name.match(new RegExp(pattern)) && !negPatterns.some(negPattern =>
        !!name.match(new RegExp(negPattern))
      )
    )
  );
}


/**
 * Same as matchAny, but for files, takes paths into account
 * Returns true if any of the names match any of the patterns
 * It ignores any pattern match that is also matching a negPattern
 */
export function matchAnyFile(names: string[], patterns: string[], negPatterns: string[] = []): boolean {
  return names.some(name =>
    patterns.some(pattern =>
      minimatch(name, pattern) && !negPatterns.some(negPattern =>
        minimatch(name, negPattern)
      )
    )
  );
}

/**
 * Returns true if some of the names match all of one of the patterns array
 * e.g.: [a, b, c] match the first pattern of [[a, b], [a, d]], but [a, b, c] doesn't match [[a, d], [b, e]]
 */
export function matchAllOfAny(names: string[], patternsArray: string[][]): boolean {
  return patternsArray
  // is one of the patterns array 100% present?
    .some((patterns: string[]) => patterns
      // for this array of patterns, are they all matching one of the current names?
        .map(pattern => names
          // is this name matching one of the current label
          // we replace "/" by "*" because we are matching labels not files
            .some(name => !!name.match(new RegExp(pattern)))
        )
        // are they all matching or is at least one of them not a match
        .reduce((previous: boolean, current: boolean) => previous && current)
    );
}
