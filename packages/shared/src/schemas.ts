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
  'hub:postDetail': z.object({
    author: z.string().min(1).max(128),
    slug: z.string().min(1).max(128).regex(/^[\w-]+$/)
  }),
  'hub:userOverview': z.object({ username: z.string().min(1).max(128).regex(/^[\w.-]+$/) }),
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
  'hub:datasetSplits': z.object({ repoId }),
  'hub:searchUsers': z.object({ query: z.string().min(1).max(64) }),
  'hub:inferenceAvailable': z.object({ repoId }),
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
