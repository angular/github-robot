import {Context, Robot} from "probot";
import {Task} from "./task";
import {AppConfig, appConfig, SizeConfig} from "../default";
import * as Github from '@octokit/rest';
import {STATUS_STATE} from "../typings";
import {HttpClient} from "../http";
import {Response} from "request";
import {database} from "firebase-admin";
import { firebasePathDecode, firebasePathEncode} from "../util";

export const CONFIG_FILE = "angular-robot.yml";

export interface CircleCiArtifact {
  path: string;
  pretty_path: string;
  node_index: number;
  url: string;
}

export interface BuildArtifact {
  sizeBytes: number;
  fullPath: string;
  contextPath: string[];
  projectName: string;
}

export interface BuildArtifactDiff {
  artifact: BuildArtifact;
  increase: number;
}

export class SizeTask extends Task {
  constructor(robot: Robot, firestore: FirebaseFirestore.Firestore, private readonly http: HttpClient, private readonly accessToken: string, private readonly databaseUrl: string) {
    super(robot, firestore);
    this.dispatch([
      'status',
    ], this.checkSize.bind(this));
  }

  async checkSize(context: Context): Promise<any> {
    const config = await this.getConfig(context);

    if(config.disabled) {
      return;
    }

    // only check on PRs the status has that artifacts
    if((context.payload.state !== STATUS_STATE.Success) || context.payload.context !== config.circleCiStatusName) {
      // do nothing since we only want succeeded circleci events
      return;
    }

    const pr = await this.findPrBySha(context.payload.sha, context.payload.repository.id);

    if(!pr) {
      // this status doesn't have a PR therefore it's probably a commit to a branch
      // so we want to store any changes from that commit
      return this.storeArtifacts(context);
    }
    this.logDebug(`[size] Processing PR: ${pr.title}`);

    // set to pending since we are going to do a full run through
    // TODO: can we set pending sooner? like at the start of the PR
    await this.setStatus(STATUS_STATE.Pending, 'Calculating artifact sizes', config.status.context, context);

    const {owner, repo} = context.repo();
    const buildNumber = this.getBuildNumberFromCircleCIUrl(context.payload.target_url);
    const newArtifacts = await this.getCircleCIArtifacts(owner, repo, buildNumber);
    const targetBranchArtifacts = await this.getTargetBranchArtifacts(pr);
    const largestIncrease = await this.findLargestIncrease(targetBranchArtifacts, newArtifacts);
    const failure = this.isFailure(config, largestIncrease.increase);

    if(failure) {
      const desc = `${largestIncrease.artifact.fullPath} increased by ${largestIncrease.increase} bytes`; // TODO pretty up bytes 
      return await this.setStatus(STATUS_STATE.Failure, desc, config.status.context, context);
    } else {
      if(largestIncrease.increase === 0) {
        const desc = `no size change`;
        return await this.setStatus(STATUS_STATE.Success, desc, config.status.context, context);
      } else if(largestIncrease.increase < 0) {
        const desc = `${largestIncrease.artifact.fullPath} decreased by ${largestIncrease.increase} bytes`; // TODO pretty up bytes 
        return await this.setStatus(STATUS_STATE.Success, desc, config.status.context, context);
      } else if(largestIncrease.increase > 0) {
        const desc = `${largestIncrease.artifact.fullPath} increased by ${largestIncrease.increase} bytes`; // TODO pretty up bytes 
        return await this.setStatus(STATUS_STATE.Success, desc, config.status.context, context);
      }
    }
  }


  /**
   *
   * Retrieves the artifacts from circleci of the context passed in, then saves them into firebase
   *
   * @param context Must be from a "Status" github event
   */
  async storeArtifacts(context: Context): Promise<void> {
    this.logDebug(`[size] Storing artifacts for: ${context.payload.commit.sha}`);
    
    const {owner, repo} = context.repo();

    const buildNumber = await this.getBuildNumberFromCircleCIUrl(context.payload.target_url);
    const newArtifacts = await this.getCircleCIArtifacts(owner, repo, buildNumber);
    return this.upsertNewArtifacts(context, newArtifacts);
  }

  /**
   *
   * Insert or updates the artifacts for a status event
   *
   * @param context Must be from a "Status" github event
   * @param artifacts
   */
  async upsertNewArtifacts(context: Context, artifacts: BuildArtifact[]): Promise<void> {
    this.logDebug(`[size] Storing artifacts for: ${context.payload.commit.sha}, on branches [${context.payload.branches.map(b => b.commit.url).join(', ')}]`);
    
    // eg: aio/gzip7/inline
    // eg: ivy/gzip7/inline
    // projects within this repo
    const projects = new Set(artifacts.map(a => a.projectName));
    
    for(const project of projects) {
      for(const branch of context.payload.branches) {
        const artifactsOutput = {
          change: 'application',
          message: context.payload.commit.commit.message,
          timestamp: new Date().getTime(),
        };
        
        // only use the artifacts from this project
        artifacts.filter(a => a.projectName === project)
        .forEach(a => {
          // hold a ref to where we are in our tree walk
          let lastNestedItemRef: object | number = artifactsOutput;
          // first item is the project name which we've used already 
          a.contextPath.forEach((path, i) => {
            const encodedPath = firebasePathEncode(path);
            // last item so assign it the bytes size
            if(i === a.contextPath.length - 1) {
              lastNestedItemRef[encodedPath] = a.sizeBytes;
              return;
            }
            if(!lastNestedItemRef[encodedPath]) {
              lastNestedItemRef[encodedPath] = {};
            }
            
            lastNestedItemRef = lastNestedItemRef[encodedPath];
          });
          lastNestedItemRef = a.sizeBytes;
        });
        
        await this.http.patch<{}>(this.makeFirebaseDbUrl(`/payload/${project}/${firebasePathEncode(branch.name)}/${context.payload.commit.sha}`), artifactsOutput);
      }
    }
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

  /**
   * finds the largest increase of the new artifacts from old ones
   */
  findLargestIncrease(oldArtifacts: BuildArtifact[], newArtifacts: BuildArtifact[]): BuildArtifactDiff {
    let largestIncrease: BuildArtifact = null;
    let largestIncreaseSize = 0;

    for(const newArtifact of newArtifacts) {
      const targetArtifact = oldArtifacts.find(a => a.fullPath === newArtifact.fullPath);
      let increase = 0;

      if(!targetArtifact) {
        increase = newArtifact.sizeBytes;
      } else {
        increase = newArtifact.sizeBytes - targetArtifact.sizeBytes;
      }

      if(increase > largestIncreaseSize || largestIncrease === null) {
        largestIncreaseSize = increase;
        largestIncrease = newArtifact;
      }
    }

    return {
      artifact: largestIncrease,
      increase: largestIncreaseSize
    };
  }

  /**
   * Finds the target branch of a PR then retrieves the artifacts at the for the HEAD of that branch
   */
  async getTargetBranchArtifacts(prPayload: Github.PullRequest): Promise<BuildArtifact[]> {
    const targetBranch = prPayload.base;
    this.logDebug(`[size] Fetching target branch artifacts for ${targetBranch.ref}/${targetBranch.sha}`);

    
    const payloadValue = await this.http.get(this.makeFirebaseDbUrl('/payload'));
    const projects = Object.keys(payloadValue);
    const artifacts: BuildArtifact[] = [];

    for(const projectName of projects) {
      const value = await this.http.get<any>(this.makeFirebaseDbUrl(`/payload/${projectName}/${firebasePathEncode(targetBranch.ref)}/${targetBranch.sha}`));

      if(value) {
        delete value.change;
        delete value.message;
        delete value.timestamp;

        // reconstruct the paths into artifacts
        const reconstructArtifacts = (object: any, path: string) => {
          Object.keys(object).forEach(k => {
            if(typeof object[k] === 'object') {
              reconstructArtifacts(object[k], path + '/' + firebasePathDecode(k));
            } else {
              path = path + '/' + firebasePathDecode(k);
              const pathParts = path.split('/').slice(1);
              artifacts.push({
                sizeBytes: object[k],
                fullPath: path,
                projectName: projectName,
                contextPath: pathParts,
              });
            }
          });
        };
        reconstructArtifacts(value, projectName);
      }
    }

    return artifacts;
  }

  /**
   * Retrieves the build artifacts from circleci
   */
  async getCircleCIArtifacts(username: string, project: string, buildNumber: number): Promise<BuildArtifact[]> {
    const artifactUrl = `https://circleci.com/api/v1.1/project/github/${username}/${project}/${buildNumber}/artifacts`;
    this.logDebug(`[size] Fetching artifacts for ${artifactUrl}`);

    const artifacts = await this.http.get<CircleCiArtifact[]>(artifactUrl) as CircleCiArtifact[];

    return Promise.all(artifacts.map(async artifact => {
      const content = await this.http.get<string>(artifact.url, {responseType: 'response'} as any) as Response;
      const pathParts = artifact.path.split('/');


      return {
        fullPath: artifact.path,
        projectName: pathParts[0],
        contextPath: pathParts.slice(1),
        sizeBytes: Number(content.headers["content-length"]),
      };
    }));

  }

  makeFirebaseDbUrl(url: string): string {
    const finalUrl = `${this.databaseUrl}${url}.json?access_token=${this.accessToken}`;
    this.logInfo(`[size] making Firebase url: ${finalUrl}`);
    return finalUrl;
  }

  /**
   * Gets the config for the merge plugin from Github or uses default if necessary
   */
  async getConfig(context: Context): Promise<SizeConfig> {
    const repositoryConfig = await context.config<AppConfig>(CONFIG_FILE, appConfig);
    return repositoryConfig.size;
  }
}
