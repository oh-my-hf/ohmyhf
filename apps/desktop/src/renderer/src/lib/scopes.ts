import type { AuthState } from '@oh-my-huggingface/shared'

/** OAuth scopes gating specific UI areas. */
export const MANAGE_REPOS_SCOPE = 'manage-repos'
export const WRITE_DISCUSSIONS_SCOPE = 'write-discussions'
export const WRITE_COLLECTIONS_SCOPE = 'write-collections'
export const READ_BILLING_SCOPE = 'read-billing'

/**
 * Mirrors DEFAULT_SCOPES in packages/hub-api/src/oauth.ts. The hub-api barrel
 * re-exports node-only helpers (cache-layout imports node:os/node:path), so
 * the renderer cannot import the package; keep this list in sync manually.
 */
export const HUB_DEFAULT_SCOPES = [
  'openid',
  'profile',
  'read-repos',
  'write-repos',
  'write-discussions',
  'inference-api',
  'read-collections',
  'write-collections',
  'manage-repos',
  'read-billing'
]

/** Localized labels for known scopes; unknown scopes render as raw tokens. */
export const SCOPE_LABEL_KEYS: Record<string, string> = {
  openid: 'settings:account.scopeLabels.openid',
  profile: 'settings:account.scopeLabels.profile',
  'read-repos': 'settings:account.scopeLabels.read-repos',
  'write-repos': 'settings:account.scopeLabels.write-repos',
  'write-discussions': 'settings:account.scopeLabels.write-discussions',
  'inference-api': 'settings:account.scopeLabels.inference-api',
  'read-collections': 'settings:account.scopeLabels.read-collections',
  'write-collections': 'settings:account.scopeLabels.write-collections',
  'manage-repos': 'settings:account.scopeLabels.manage-repos',
  'read-billing': 'settings:account.scopeLabels.read-billing',
  webhooks: 'settings:account.scopeLabels.webhooks',
  jobs: 'settings:account.scopeLabels.jobs'
}

/**
 * True only when the signed-in session definitively lacks the scope.
 * Sessions created before scope tracking carry no scopes array; those are
 * unknown — allow the attempt and let the API be the referee.
 */
export function scopeMissing(auth: AuthState, scope: string): boolean {
  return auth.status === 'signedIn' && Array.isArray(auth.scopes) && !auth.scopes.includes(scope)
}
