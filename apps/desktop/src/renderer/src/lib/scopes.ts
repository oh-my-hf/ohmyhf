import type { AuthState } from '@oh-my-huggingface/shared'

/** OAuth scopes gating specific UI areas. */
export const MANAGE_REPOS_SCOPE = 'manage-repos'
export const WRITE_DISCUSSIONS_SCOPE = 'write-discussions'
export const WRITE_COLLECTIONS_SCOPE = 'write-collections'
export const READ_BILLING_SCOPE = 'read-billing'

/**
 * True only when the signed-in session definitively lacks the scope.
 * Sessions created before scope tracking carry no scopes array; those are
 * unknown — allow the attempt and let the API be the referee.
 */
export function scopeMissing(auth: AuthState, scope: string): boolean {
  return auth.status === 'signedIn' && Array.isArray(auth.scopes) && !auth.scopes.includes(scope)
}
