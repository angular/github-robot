import fetch from 'node-fetch';
import {Application, Context} from "probot";
import {Task} from "./task";
import {SizeConfig, appConfig as defaultAppConfig } from "../default";
import {STATUS_STATE} from "../typings";
import Github from '@octokit/rest';

export const CONFIG_FILE = "angular-robot.yml";

export interface CircleCiArtifact {
  path: string;
  pretty_path: string;
  node_index: number;
  url: string;
}

export interface BuildArtifact {
  path: string;
  url: string;
  size: number;
  projectName: string;
  context: string;
  filename: string;
}

export interface BuildArtifactDiff {
  current: BuildArtifact;
  baseline: BuildArtifact;
  delta: number;
  failed: boolean;
}

const byteUnits = 'KMGT';
const byteBase = 1024;

function formatBytes(value: number): string {
  const i = Math.min(Math.trunc(Math.log(Math.abs(value)) / Math.log(byteBase)), byteUnits.length);
  if(i === 0) {
    return value + ' bytes';
  }

  return (value / byteBase ** i).toFixed(2) + byteUnits[i - 1] + 'B';
}

export class SizeTask extends Task {
  constructor(robot: Application, db: FirebaseFirestore.Firestore) {
    super(robot, db);

    this.dispatch('status', (context) => this.checkSize(context));
  }

  async checkSize(context: Context): Promise<void> {
    const appConfig = await context.config(CONFIG_FILE);

    if(!appConfig.size || appConfig.size.disabled) {
      return;
    }

    const config: SizeConfig = {
      ...defaultAppConfig.size,
      ...appConfig.size,
      status: { ...defaultAppConfig.size.status, ...appConfig.size.status },
    };

    const statusEvent = context.payload;

    // only check on PRs the status has that artifacts
    if(statusEvent.context !== config.circleCiStatusName) {
      return;
    }

    if(statusEvent.state === STATUS_STATE.Pending) {
      await this.setStatus(
        STATUS_STATE.Pending,
        `Waiting for "${config.circleCiStatusName}"...`,
        config.status.context,
        context,
      );

      return;
    } else if(statusEvent.state === STATUS_STATE.Failure) {
      await this.setStatus(
        STATUS_STATE.Error,
        `Unable to calculate sizes. Failure: "${config.circleCiStatusName}"`,
        config.status.context,
        context,
      );

      return;
    }

    const {owner, repo} = context.repo();
    const buildNumber = this.getBuildNumberFromCircleCIUrl(statusEvent.target_url);

    let newArtifacts;
    try {
      newArtifacts = await this.getCircleCIArtifacts(owner, repo, buildNumber);
    } catch(e) {
      this.logError('CircleCI Artifact retrieval error: ' + e.message);
      await this.setStatus(
        STATUS_STATE.Error,
        `Unable to retrieve artifacts from "${config.circleCiStatusName}".`,
        config.status.context,
        context,
      );

      return;
    }

    const pr = await this.findPrBySha(statusEvent.sha, statusEvent.repository.id);
    if(!pr) {
      // this status doesn't have a PR therefore it's probably a commit to a branch
      // so we want to store any changes from that commit
      await this.upsertNewArtifacts(context, newArtifacts);

      await this.setStatus(
        STATUS_STATE.Success,
        `Baseline saved for ${statusEvent.sha}`,
        config.status.context,
        context,
      );

      return;
    }

    this.logDebug(`[size] Processing PR: ${pr.title}`);

    // set to pending since we are going to do a full run through
    await this.setStatus(
      STATUS_STATE.Pending,
      'Calculating artifact sizes...',
      config.status.context,
      context,
    );

    const targetBranchArtifacts = await this.getTargetBranchArtifacts(pr);

    if(targetBranchArtifacts.length === 0) {
      await this.setStatus(
        STATUS_STATE.Success,
        `No baseline available for ${pr.base.ref} / ${pr.base.sha}`,
        config.status.context,
        context,
      );

      return;
    }

    const comparisons = this.generateArtifactComparisons(targetBranchArtifacts, newArtifacts, config);
    const largestIncrease = comparisons.length > 0 ? comparisons[0] : null;
    const failure = largestIncrease && largestIncrease.failed;

    let description;
    if(!largestIncrease) {
      description = 'No matching artifacts to compare.';
    } else if(largestIncrease.delta === 0) {
      description = 'No size change against base branch.';
    } else {
      const direction = largestIncrease.delta > 0 ? 'increased' : 'decreased';
      const formattedBytes = formatBytes(Math.abs(largestIncrease.delta));
      description = `${largestIncrease.current.path} ${direction} by ${formattedBytes}.`;


      // Add comment if enabled
      if (config.comment) {
        let body = '|| Artifact | Baseline | Current | Change |\n|-|-|-|-|-|\n';

        for (const comparison of comparisons) {
          const emoji = comparison.delta <= 0 ? ':white_check_mark:' : ':grey_exclamation:';
          body += `| ${comparison.failed ? ':x:' : emoji}|${comparison.baseline.path}`;
          body += `|[${formatBytes(comparison.baseline.size)}](${comparison.baseline.url})`;
          body += `|[${formatBytes(comparison.current.size)}](${comparison.current.url})`;
          body += `|${comparison.delta > 0 ? '+' : ''}${formatBytes(comparison.delta)}|`;
        }

        try {
          const prDoc = await this.pullRequests.doc(pr.id.toString()).get();
          let commentId = prDoc.exists ? prDoc.data().sizeCheckComment : undefined;

          if (commentId !== undefined) {
            try {
              await context.github.issues.editComment({
                owner,
                repo,
                comment_id: commentId,
                body, 
              });
            } catch {
              // Comment may have been deleted
              commentId = undefined;
            }
          }

          if (commentId === undefined) {
            const response = await context.github.issues.createComment({
              owner,
              repo,
              number: pr.number,
              body,
            });

            prDoc.ref.update({ sizeCheckComment: response.data.id }).catch(err => {
              throw err;
            });
          }
        } catch (e) {
          this.logError(`Unable to add size comment [${e.message}]`);
        }
      }
    }

    return this.setStatus(
      failure ? STATUS_STATE.Failure : STATUS_STATE.Success,
      description,
      config.status.context,
      context,
    );
  }

  /**
   *
   * Insert or updates the artifacts for a status event
   *
   * @param context Must be from a "Status" github event
   * @param artifacts
   */
  async upsertNewArtifacts(context: Context, artifacts: BuildArtifact[]): Promise<void> {
    this.logDebug(`[size] Storing artifacts for: ${context.payload.sha}, on branches [${context.payload.branches.map((b: Github.ReposGetBranchesResponseItem) => b.commit.url).join(', ')}]`);

    const updatedAt = context.payload.updated_at;
    const branch = context.payload.branches
      .find((b: Github.ReposGetBranchesResponseItem) => b.commit.sha === context.payload.commit.sha);
    const sizeArtifacts = this.repositories
      .doc(context.payload.repository.id.toString())
      .collection('sizeArtifacts');

    // Generate Document IDs from sha and artifact path
    const artifactDocs = artifacts.map(a => sizeArtifacts.doc(
      Buffer.from(context.payload.sha + a.path).toString('base64'),
    ));

    return sizeArtifacts.firestore.runTransaction(async transaction => {
      const results = await transaction.getAll(...artifactDocs);

      for(let i = 0; i < results.length; ++i) {
        if(results[i].exists) {
          if(results[i].data().updatedAt < updatedAt) {
            transaction.update(results[i].ref, {
              ...artifacts[i],
              sha: context.payload.commit.sha,
              updatedAt: context.payload.updated_at,
              ...(branch ? {branch: branch.name} : {}),
            });
          }
        } else {
          transaction.create(results[i].ref, {
            ...artifacts[i],
            sha: context.payload.commit.sha,
            updatedAt: context.payload.updated_at,
            ...(branch ? {branch: branch.name} : {}),
          });
        }
      }
    });
  }

  /**
   *
   * Parses a circleci build url for the build number
   *
   * @param url circleci build url, retrieved from target_event in a github "Status" event context
   */
  getBuildNumberFromCircleCIUrl(url: string): number {
    const parts = url.split('/');

    if(parts[2] === 'circleci.com' && parts[3] === 'gh') {
      return Number(parts[6].split('?')[0]);
    } else {
      throw new Error('incorrect circleci path');
    }
  }

  /**
   * determines if the increase is a failure based off the config values
   */
  isFailure(config: SizeConfig, increase: number): boolean {
    return increase > config.maxSizeIncrease;
  }

  generateArtifactComparisons(oldArtifacts: BuildArtifact[], newArtifacts: BuildArtifact[], config: SizeConfig) {
    const baselines = new Map(oldArtifacts.map<[string, BuildArtifact]>(a => [a.path, a]));

    const comparisons: BuildArtifactDiff[] = [];
    for (const current of newArtifacts) {
      const baseline = baselines.get(current.path);

      if (!baseline) {
        continue;
      }

      const delta = current.size - baseline.size;
      comparisons.push({
        current,
        baseline,
        delta,
        failed: this.isFailure(config, delta),
      });
    }

    comparisons.sort((a, b) => b.delta - a.delta);

    return comparisons;
  }

  /**
   * Finds the target branch of a PR then retrieves the artifacts at the for the HEAD of that branch
   */
  async getTargetBranchArtifacts(prPayload: Github.PullRequestsGetResponse): Promise<BuildArtifact[]> {
    const targetBranch = prPayload.base;
    this.logDebug(`[size] Fetching target branch artifacts for ${targetBranch.ref}/${targetBranch.sha}`);

    const artifactsSnaphot = await this.repositories
      .doc((prPayload as any).repository.id.toString())
      .collection('sizeArtifacts')
      .where('sha', '==', targetBranch.sha)
      .get();

    if(artifactsSnaphot.empty) {
      return [];
    }

    return artifactsSnaphot.docs.map(doc => doc.data() as BuildArtifact);
  }

  /**
   * Retrieves the build artifacts from circleci
   */
  async getCircleCIArtifacts(username: string, project: string, buildNumber: number): Promise<BuildArtifact[]> {
    const artifactUrl = `https://circleci.com/api/v1.1/project/github/${username}/${project}/${buildNumber}/artifacts`;
    this.logDebug(`[size] Fetching artifacts for ${artifactUrl}`);

    const artifactsResponse = await fetch(artifactUrl);

    const artifacts = await artifactsResponse.json() as CircleCiArtifact[];

    return Promise.all(artifacts.map(async artifact => {
      const contentResponse = await fetch(
        artifact.url,
        {
          // NOTE: CircleCI doesn't provide the length with a HEAD so a GET is required.
          //       This means that the full content is sent
          // method: 'HEAD',
          // compress: false,
        },
      );

      const data = await contentResponse.arrayBuffer();
      const size = data.byteLength;
      const pathParts = artifact.path.split('/');

      return {
        path: artifact.path,
        url: artifact.url,
        size,
        projectName: pathParts.length > 1 ? pathParts[0] : undefined,
        context: pathParts.length > 2 ? pathParts.slice(1, -1).join('/') : undefined,
        filename: pathParts[pathParts.length - 1],
      };
    }));
  }
}
