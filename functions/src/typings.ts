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
