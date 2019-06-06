import Octokit from '@octokit/rest';

export const enum FILE_STATUS {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted'
}

export const enum STATUS_STATE {
  Pending = 'pending',
  Success = 'success',
  Failure = 'failure',
  Error = 'error'
}

export const enum GQL_STATUS_STATE {
  Pending = 'PENDING',
  Success = 'SUCCESS',
  Failure = 'FAILURE',
  Error = 'ERROR'
}

export const enum REVIEW_STATE {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  ChangesRequest = 'CHANGES_REQUESTED',
  Commented = 'COMMENTED',
  Dismissed = 'DISMISSED'
}

export const enum AUTHOR_ASSOCIATION {
  // Author has been invited to collaborate on the repository.
  Collaborator = 'COLLABORATOR',
  // Author has previously committed to the repository.
  Contributor = 'CONTRIBUTOR',
  // Author has not previously committed to GitHub.
  FirstTimer = 'FIRST_TIMER',
  // Author has not previously committed to the repository.
  FirstTimeContributor = 'FIRST_TIME_CONTRIBUTOR',
  // Author is a member of the organization that owns the repository.
  Member = 'MEMBER',
  // Author has no association with the repository.
  None = 'NONE',
  // Author is the owner of the repository.
  Owner = 'OWNER'
}

export interface CachedPullRequest extends Octokit.PullsGetResponse {
  pendingReviews?: number;
}

declare namespace GithubGQL {
  export interface PullRequest {
    labels: Labels;
    commits: Commits;
  }

  export interface Labels {
    nodes: Octokit.PullsGetResponseLabelsItem[];
  }

  export interface Commits {
    nodes: {
      id: string;
      commit: Commit;
      pullRequest: PullRequest;
      resourcePath: string;
      url: string;
    }[];
  }

  export interface Commit {
    status: Status|null;
  }

  export interface Status {
    contexts: StatusContext[];
  }

  interface StatusContext {
    // node id
    id: string;
    state: GQL_STATUS_STATE | STATUS_STATE;
    description: string;
    // name of the status, e.g. "ci/angular: merge status"
    context: string;
    // e.g. "2019-01-30T13:56:48Z"
    createdAt: string;
  }
}

export interface Commit {
  id: string;
  tree_id: string;
  distinct: boolean;
  message: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
    username: string;
  };
  committer: {
    name: string;
    email: string;
    username: string;
  };
  added: string[];
  removed: string[];
  modified: string[];
}

export default GithubGQL;
