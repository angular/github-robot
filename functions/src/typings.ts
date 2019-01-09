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
