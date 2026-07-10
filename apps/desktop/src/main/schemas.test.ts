import { describe, expect, it } from 'vitest'
import { ipcRequestSchemas } from '@oh-my-huggingface/shared'

/**
 * The IPC request schemas are the input-validation boundary for the main
 * process. These guard the security-relevant refinements: destructive
 * confirmations must match, and slugs/repo ids that are interpolated raw into
 * Hub API paths must not carry traversal segments.
 */
describe('ipcRequestSchemas', () => {
  it('rejects a collection slug with a dot-only owner segment (path traversal)', () => {
    const schema = ipcRequestSchemas['hub:collection']!
    // A well-formed slug parses.
    expect(schema.safeParse({ slug: 'nvidia/cosmos-69ab2f273c55ae147e43c342' }).success).toBe(true)
    // "../victim-<24hex>" would resolve to /api/victim under /api/collections/.
    expect(schema.safeParse({ slug: '../deadbeefdeadbeefdeadbeef' }).success).toBe(false)
    expect(
      schema.safeParse({ slug: '../secret-69ab2f273c55ae147e43c342' }).success
    ).toBe(false)
  })

  it('requires the delete confirmation to match the target', () => {
    const collection = ipcRequestSchemas['hub:collectionDelete']!
    const slug = 'me/keep-69ab2f273c55ae147e43c342'
    expect(collection.safeParse({ slug, confirmSlug: slug }).success).toBe(true)
    expect(collection.safeParse({ slug, confirmSlug: 'wrong' }).success).toBe(false)

    const repo = ipcRequestSchemas['hub:repoDelete']!
    expect(
      repo.safeParse({ kind: 'model', repoId: 'me/x', confirmName: 'me/x' }).success
    ).toBe(true)
    expect(
      repo.safeParse({ kind: 'model', repoId: 'me/x', confirmName: 'me/y' }).success
    ).toBe(false)
  })

  it('accepts non-hex notification ids for mark-as-read (post/paper ids are plain strings)', () => {
    const schema = ipcRequestSchemas['hub:notificationsMarkRead']!
    expect(schema.safeParse({ discussionIds: [], read: true }).success).toBe(true)
    expect(
      schema.safeParse({ discussionIds: ['post-abc_123', 'paper.2301'], read: true }).success
    ).toBe(true)
  })

  it('accepts privacy:clearLocalData with optional signOut', () => {
    const schema = ipcRequestSchemas['privacy:clearLocalData']!
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ signOut: true }).success).toBe(true)
    expect(schema.safeParse({ signOut: 'yes' }).success).toBe(false)
  })
})
