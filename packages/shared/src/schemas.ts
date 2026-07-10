/**
 * zod schemas used by main-process IPC handlers to validate every request payload
 * before acting on it. One schema per channel that accepts input.
 */
import { z } from 'zod'
import type { IpcInvokeChannel } from './ipc'
import { SUPPORTED_LOCALES } from './types'

const repoKind = z.enum(['model', 'dataset', 'space'])

/** "owner/name" or single-segment names; dot-only segments (".", "..") are rejected. */
const repoId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w.-]+(\/[\w.-]+)?$/, 'invalid repo id')
  .refine((v) => v.split('/').every((segment) => !/^\.+$/.test(segment)), 'invalid repo id')

const revision = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w./-]+$/, 'invalid revision')

const relPath = z
  .string()
  .max(1024)
  .regex(/^(?!\/)(?!.*\.\.)[^\0]*$/, 'invalid path')

const searchQuery = z.object({
  kind: repoKind,
  search: z.string().max(256).optional(),
  author: z.string().max(128).optional(),
  // Generous cap: the dataset filter panel can legitimately stack many tag chips.
  tags: z.array(z.string().max(128)).max(48).optional(),
  pipelineTag: z.string().max(128).optional(),
  library: z.string().max(128).optional(),
  license: z.string().max(128).optional(),
  sort: z.enum(['trending', 'downloads', 'likes', 'updated', 'created']),
  inferenceProvider: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(4096).optional()
})

const repoSummary = z.object({
  id: repoId,
  kind: repoKind,
  author: z.string().max(128),
  name: z.string().max(256),
  likes: z.number(),
  downloads: z.number(),
  updatedAt: z.string().optional(),
  createdAt: z.string().optional(),
  private: z.boolean(),
  gated: z.union([z.string(), z.boolean()]),
  tags: z.array(z.string()).max(200),
  pipelineTag: z.string().optional(),
  libraryName: z.string().optional(),
  license: z.string().optional(),
  paramCount: z.number().optional(),
  sdk: z.string().optional(),
  trendingScore: z.number().optional()
})

const settingsPatch = z
  .object({
    locale: z.enum(['system', ...SUPPORTED_LOCALES]),
    theme: z.enum(['system', 'light', 'dark']),
    downloadConcurrency: z.number().int().min(1).max(8),
    speedLimitBps: z.number().int().min(1024).nullable(),
    hfCacheDir: z.string().max(1024).nullable(),
    notificationsEnabled: z.boolean(),
    pollIntervalMinutes: z.number().int().min(5).max(24 * 60),
    uiScale: z.number().int().min(80).max(140)
  })
  .partial()

const absolutePath = z.string().min(1).max(4096)

const username = z.string().min(1).max(128).regex(/^[\w.-]+$/, 'invalid username')

/** Collection API path segment: "owner/title-slug-<24hex>". */
const collectionSlug = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w.-]+\/[\w.-]*[0-9a-f]{24}$/, 'invalid collection slug')
  // The slug is interpolated raw into the API path; a dot-only owner segment
  // ("..") would traverse out of /api/collections/. Reject it like repo ids do.
  .refine((v) => v.split('/').every((segment) => !/^\.+$/.test(segment)), 'invalid collection slug')

/** 24-hex Mongo-style object id (collection items, watch targets, comment ids). */
const hexId = z.string().regex(/^[0-9a-f]{24}$/, 'invalid id')

const collectionNote = z.string().max(500)

const discussionNum = z.number().int().min(1)

/** Env-var style key for Space secrets and variables. */
const spaceEnvKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][_a-zA-Z0-9]*$/, 'invalid key')

/** Gated access requests only exist for models and datasets. */
const gatedRepoKind = z.enum(['model', 'dataset'])

const watchTargets = z
  .array(z.object({ id: hexId, type: z.enum(['user', 'org']) }))
  .min(1)
  .max(100)

/**
 * Validators for every channel that takes a payload. Channels with `req: void`
 * are validated by asserting the payload is undefined/null.
 */
export const ipcRequestSchemas: Partial<Record<IpcInvokeChannel, z.ZodTypeAny>> = {
  'system:openExternal': z.object({ url: z.url({ protocol: /^https$/ }) }),
  'system:showItemInFolder': z.object({ path: absolutePath }),
  'settings:set': z.object({ patch: settingsPatch }),
  'hub:search': z.object({ query: searchQuery }),
  'hub:papers': z.object({ cursor: z.string().max(4096).optional() }).optional(),
  'hub:paper': z.object({ paperId: z.string().min(1).max(128) }),
  'hub:repoDetail': z.object({ kind: repoKind, repoId }),
  'hub:readme': z.object({ kind: repoKind, repoId, revision: revision.optional() }),
  'hub:fileTree': z.object({
    kind: repoKind,
    repoId,
    revision: revision.optional(),
    path: relPath.optional()
  }),
  'hub:discussions': z.object({
    kind: repoKind,
    repoId,
    type: z.enum(['discussion', 'pull_request']).optional(),
    status: z.enum(['open', 'closed']).optional()
  }),
  'hub:discussionDiff': z.object({ kind: repoKind, repoId, num: z.number().int().min(1) }),
  'hub:posts': z.object({ cursor: z.string().max(4096).optional() }).optional(),
  'hub:recentActivity': z.object({ cursor: z.string().max(4096).optional() }).optional(),
  'hub:postDetail': z.object({
    author: z.string().min(1).max(128),
    slug: z.string().min(1).max(128).regex(/^[\w-]+$/)
  }),
  'hub:userOverview': z.object({ username: z.string().min(1).max(128).regex(/^[\w.-]+$/) }),
  'hub:userFollowing': z.object({ username: z.string().min(1).max(128).regex(/^[\w.-]+$/) }),
  'hub:orgMembers': z.object({
    org: z.string().min(1).max(128).regex(/^[\w.-]+$/),
    limit: z.number().int().min(1).max(100).optional()
  }),
  'hub:discussionDetail': z.object({ kind: repoKind, repoId, num: z.number().int().min(1) }),
  'hub:discussionComment': z.object({
    kind: repoKind,
    repoId,
    num: z.number().int().min(1),
    comment: z.string().min(1).max(65536)
  }),
  'hub:fileText': z.object({
    kind: repoKind,
    repoId,
    path: relPath,
    revision: revision.optional(),
    maxBytes: z.number().int().min(1).max(8 * 1024 * 1024).optional()
  }),
  'hub:safetensorsHeader': z.object({
    kind: repoKind,
    repoId,
    path: relPath,
    revision: revision.optional()
  }),
  'hub:notifications': z.object({ page: z.number().int().min(0).max(10_000).optional() }).optional(),
  'hub:notificationsMarkRead': z.object({
    // Empty array = mark all notifications. Repo discussion ids are 24-hex but
    // post/blog/paper notification ids are plain strings, so stay permissive.
    discussionIds: z.array(z.string().min(1).max(64)).max(1000),
    read: z.boolean()
  }),
  'hub:watchUpdate': z.object({
    add: watchTargets.optional(),
    delete: watchTargets.optional()
  }),
  'hub:datasetSplits': z.object({ repoId }),
  'hub:searchUsers': z.object({ query: z.string().min(1).max(64) }),
  'hub:inferenceAvailable': z.object({ repoId }),
  'hub:collections': z.object({ owner: username }),
  'hub:collection': z.object({ slug: collectionSlug }),
  'hub:collectionCreate': z.object({
    namespace: username,
    title: z.string().min(1).max(60),
    description: z.string().max(150).optional(),
    private: z.boolean()
  }),
  'hub:collectionUpdate': z.object({
    slug: collectionSlug,
    patch: z.object({
      title: z.string().min(1).max(60).optional(),
      description: z.string().max(150).optional(),
      private: z.boolean().optional(),
      position: z.number().int().min(0).optional(),
      theme: z.string().max(64).optional()
    })
  }),
  'hub:collectionDelete': z
    .object({ slug: collectionSlug, confirmSlug: z.string().max(256) })
    .refine((v) => v.confirmSlug === v.slug, 'confirmation does not match'),
  'hub:collectionAddItem': z.object({
    slug: collectionSlug,
    item: z.object({
      type: z.enum(['model', 'dataset', 'space', 'paper']),
      id: z.string().min(1).max(256)
    }),
    note: collectionNote.optional()
  }),
  'hub:collectionUpdateItem': z.object({
    slug: collectionSlug,
    itemId: hexId,
    note: collectionNote.optional(),
    position: z.number().int().min(0).optional()
  }),
  'hub:collectionRemoveItem': z.object({ slug: collectionSlug, itemId: hexId }),
  'hub:repoSettingsUpdate': z.object({
    kind: repoKind,
    repoId,
    patch: z.object({
      private: z.boolean().optional(),
      gated: z.union([z.literal(false), z.enum(['auto', 'manual'])]).optional(),
      discussionsDisabled: z.boolean().optional()
    })
  }),
  'hub:repoMove': z.object({ kind: repoKind, fromRepo: repoId, toRepo: repoId }),
  'hub:repoDelete': z
    .object({ kind: repoKind, repoId, confirmName: z.string().max(256) })
    .refine((v) => v.confirmName === v.repoId, 'confirmation does not match'),
  'hub:repoDuplicate': z.object({
    repoId,
    toRepo: repoId,
    private: z.boolean().optional()
  }),
  'hub:branchCreate': z.object({
    kind: repoKind,
    repoId,
    branch: revision,
    startingPoint: revision.optional()
  }),
  'hub:branchDelete': z.object({ kind: repoKind, repoId, branch: revision }),
  'hub:tagCreate': z.object({
    kind: repoKind,
    repoId,
    tag: revision,
    revision: revision.optional(),
    message: z.string().max(500).optional()
  }),
  'hub:tagDelete': z.object({ kind: repoKind, repoId, tag: revision }),
  'hub:accessRequests': z.object({
    kind: gatedRepoKind,
    repoId,
    status: z.enum(['pending', 'accepted', 'rejected'])
  }),
  'hub:accessRequestHandle': z.object({
    kind: gatedRepoKind,
    repoId,
    user: username,
    status: z.enum(['accepted', 'rejected', 'pending']),
    rejectionReason: z.string().max(200).optional()
  }),
  'hub:accessRequestGrant': z.object({ kind: gatedRepoKind, repoId, user: username }),
  'hub:spaceSecrets': z.object({ repoId }),
  'hub:spaceSecretSet': z.object({
    repoId,
    key: spaceEnvKey,
    value: z.string().max(65536),
    description: z.string().max(500).optional()
  }),
  'hub:spaceSecretDelete': z.object({ repoId, key: spaceEnvKey }),
  'hub:spaceVariables': z.object({ repoId }),
  'hub:spaceVariableSet': z.object({
    repoId,
    key: spaceEnvKey,
    value: z.string().max(65536),
    description: z.string().max(500).optional()
  }),
  'hub:spaceVariableDelete': z.object({ repoId, key: spaceEnvKey }),
  'hub:spaceLogs': z.object({ repoId, logType: z.enum(['build', 'run']) }),
  'hub:spaceRestart': z.object({ repoId, factory: z.boolean().optional() }),
  'hub:likeSet': z.object({ kind: repoKind, repoId, liked: z.boolean() }),
  'hub:userLikes': z.object({ username }),
  'hub:postComment': z.object({
    author: username,
    slug: z.string().min(1).max(128).regex(/^[\w-]+$/),
    comment: z.string().min(1).max(65536),
    replyToCommentId: hexId.optional()
  }),
  'hub:paperComment': z.object({
    paperId: z.string().min(1).max(64).regex(/^[\w.-]+$/, 'invalid paper id'),
    comment: z.string().min(1).max(65536),
    replyToCommentId: hexId.optional()
  }),
  'hub:prMerge': z.object({
    kind: repoKind,
    repoId,
    num: discussionNum,
    comment: z.string().max(65536).optional()
  }),
  'hub:discussionStatusSet': z.object({
    kind: repoKind,
    repoId,
    num: discussionNum,
    status: z.enum(['open', 'closed']),
    comment: z.string().max(65536).optional()
  }),
  'hub:discussionTitleSet': z.object({
    kind: repoKind,
    repoId,
    num: discussionNum,
    title: z.string().min(3).max(200)
  }),
  'hub:datasetRows': z.object({
    repoId,
    config: z.string().min(1).max(256),
    split: z.string().min(1).max(256),
    offset: z.number().int().min(0).max(1_000_000).optional(),
    length: z.number().int().min(1).max(100).optional()
  }),
  'favorites:add': z.object({ summary: repoSummary }),
  'favorites:remove': z.object({ kind: repoKind, repoId }),
  'history:record': z.object({ summary: repoSummary }),
  'downloads:start': z.object({
    request: z.object({
      repoId,
      kind: repoKind,
      revision: revision.optional(),
      files: z.array(relPath).max(10000).optional()
    })
  }),
  'downloads:pause': z.object({ id: z.uuid() }),
  'downloads:resume': z.object({ id: z.uuid() }),
  'downloads:cancel': z.object({ id: z.uuid() }),
  'downloads:remove': z.object({ id: z.uuid() }),
  'cache:deleteRevisions': z.object({
    repoPath: absolutePath,
    commitHashes: z.array(z.string().regex(/^[0-9a-f]{40}$/)).min(1).max(100)
  }),
  'follows:add': z.object({
    type: z.enum(['user', 'org', 'repo', 'papers']),
    target: z.string().max(300)
  }),
  'follows:remove': z.object({ id: z.uuid() }),
  'inbox:markRead': z.object({ ids: z.array(z.string()).min(1).max(1000) }),
  'export:run': z.object({
    tool: z.enum(['ollama', 'lmstudio', 'comfyui']),
    kind: repoKind,
    repoId,
    filePath: relPath
  }),
  'upload:createRepo': z.object({
    request: z.object({
      kind: repoKind,
      name: z.string().min(1).max(200),
      private: z.boolean(),
      folderPath: absolutePath
    })
  }),
  'inference:run': z.object({
    request: z.object({ model: repoId, input: z.string().max(65536) })
  }),
  'inference:stream': z.object({
    id: z.uuid(),
    request: z.object({ model: repoId, input: z.string().max(65536) })
  }),
  'inference:cancel': z.object({ id: z.uuid() })
}
