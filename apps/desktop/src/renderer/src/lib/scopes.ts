import type { AuthState } from '@oh-my-huggingface/shared'

/** Capability strings used to gate specific UI areas for legacy OAuth sessions. */
export const MANAGE_REPOS_SCOPE = 'manage-repos'
export const WRITE_DISCUSSIONS_SCOPE = 'write-discussions'
export const WRITE_COLLECTIONS_SCOPE = 'write-collections'
export const READ_BILLING_SCOPE = 'read-billing'

/**
 * True only when the signed-in session definitively lacks the scope.
 * Access-token sessions carry no scopes array — allow the attempt and let the
 * API be the referee (token role / fine-grained permissions decide).
 */
export function scopeMissing(auth: AuthState, scope: string): boolean {
  return auth.status === 'signedIn' && Array.isArray(auth.scopes) && !auth.scopes.includes(scope)
}
