import Github from '@octokit/rest';

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

export interface CachedPullRequest extends Github.PullRequestsGetResponse {
  pendingReviews?: number;
}

declare namespace GithubGQL {
  export interface PullRequest {
    labels: Labels;
    commits: Commits;
  }

  export interface Labels {
    nodes: Github.PullRequestsGetResponseLabelsItem[];
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
    state: STATUS_STATE;
    description: string;
    // name of the status, e.g. "ci/angular: merge status"
    context: string;
    // e.g. "2019-01-30T13:56:48Z"
    createdAt: string;
  }
}

export default GithubGQL;
