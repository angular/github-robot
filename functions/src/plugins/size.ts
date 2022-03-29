import fetch, {HeadersInit} from 'node-fetch';
import {Application, Context} from "probot";
import {Task} from "./task";
import {SizeConfig, appConfig as defaultAppConfig} from "../default";
import {STATUS_STATE} from "../typings";
import Github from '@octokit/rest';
import {config as firebaseFunctionConfig} from 'firebase-functions';

export interface CircleCiArtifact {
  path: string;
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
    const appConfig = await this.getAppConfig(context);

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
      newArtifacts = await this.getCircleCIArtifacts(owner, repo, buildNumber, config.exclude, config.include);
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
              await context.github.issues.updateComment({
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

            await prDoc.ref.update({ sizeCheckComment: response.data.id });
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
    this.logDebug(`[size] Storing artifacts for: ${context.payload.sha}, on branches [${context.payload.branches.map((b: Github.ReposListBranchesResponseItem) => b.commit.url).join(', ')}]`);

    const updatedAt = context.payload.updated_at;
    const branch = context.payload.branches
      .find((b: Github.ReposListBranchesResponseItem) => b.commit.sha === context.payload.commit.sha);
    const sizeArtifacts = this.repositories
      .doc(context.payload.repository.id.toString())
      .collection('sizeArtifacts');

    // Generate Document IDs from sha and artifact path
    const artifactDocs = artifacts.map(a => sizeArtifacts.doc(
      Buffer.from(context.payload.sha + a.path).toString('base64'),
    ));

    return sizeArtifacts.firestore.runTransaction(async transaction => {
      const results = await transaction.getAll(...artifactDocs as [any]);

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

  parseBytes(input: number | string): [number, boolean] {
    if (typeof input === 'number') {
      return [input, false];
    }

    const matches = input.match(/^\s*(\d+(?:\.\d+)?)\s*(%|(?:[mM]|[kK]|[gG])?[bB])?\s*$/);
    if (!matches) {
      return [NaN, false];
    }
  
    let value = Number(matches[1]);
    switch (matches[2] && matches[2].toLowerCase()) {
      case '%':
        return [value / 100, true];
      case 'kb':
        value *= 1024;
        break;
      case 'mb':
        value *= 1024 ** 2;
        break;
      case 'gb':
        value *= 1024 ** 3;
        break;
    }
  
    return [value, false];
  }

  generateArtifactComparisons(oldArtifacts: BuildArtifact[], newArtifacts: BuildArtifact[], config: SizeConfig) {
    const baselines = new Map(oldArtifacts.map<[string, BuildArtifact]>(a => [a.path, a]));
    const [threshold, percentage] = this.parseBytes(config.maxSizeIncrease);

    if (threshold === NaN) {
      this.logError('Invalid size configuration');
      return [];
    }

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
        failed: delta > (percentage ? threshold * baseline.size : threshold),
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
  async getCircleCIArtifacts(username: string, project: string, buildNumber: number, exclude?: string[], include?: string[]): Promise<BuildArtifact[]> {
    const artifactUrl = `https://circleci.com/api/v2/project/gh/${username}/${project}/${buildNumber}/artifacts`;
    this.logDebug(`[size] Fetching artifacts for ${artifactUrl}`);

    const headers: HeadersInit = {};
    const token = firebaseFunctionConfig().circleci.token;
    if (token !== undefined) {
      headers['Circle-Token'] = token;
    }

    const artifactsResponse = await fetch(artifactUrl, {headers, follow: 100});

    let {items: artifacts} = (await artifactsResponse.json() as {items: CircleCiArtifact[]});
    if (include) {
      artifacts = artifacts.filter(ca => include.some(path => ca.path.startsWith(path)));
    }
    if (exclude && exclude.length > 0) {
      artifacts = artifacts.filter(ca => !exclude.some(path => ca.path.startsWith(path)));
    }

    const buildArtifacts = [];

    for (const artifact of artifacts) {
      let response = await fetch(artifact.url);
      if (response.status >= 500) {
        response = await fetch(artifact.url);
      }

      if (!response.ok) {
        throw new Error(`fetch for ${artifact.url} returned status [${response.status}]: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();
      const size = data.byteLength;
      const pathParts = artifact.path.split('/');

      this.logDebug(`[size] Fetched artifact '${artifact.path}' with size ${size}`);

      buildArtifacts.push({
        path: artifact.path,
        url: artifact.url,
        size,
        projectName: pathParts.length > 1 ? pathParts[0] : undefined,
        context: pathParts.length > 2 ? pathParts.slice(1, -1).join('/') : undefined,
        filename: pathParts[pathParts.length - 1],
      });
    }

    return buildArtifacts;
  }
}
