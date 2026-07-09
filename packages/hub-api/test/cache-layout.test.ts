import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultCacheDir, parseRepoFolderName, repoCachePaths, repoFolderName } from '../src'

describe('repoFolderName', () => {
  it('matches the huggingface_hub layout', () => {
    expect(repoFolderName('model', 'meta-llama/Llama-3-8B')).toBe('models--meta-llama--Llama-3-8B')
    expect(repoFolderName('dataset', 'squad')).toBe('datasets--squad')
    expect(repoFolderName('space', 'org/app')).toBe('spaces--org--app')
  })

  it('round-trips through parseRepoFolderName', () => {
    const parsed = parseRepoFolderName('models--meta-llama--Llama-3-8B')
    expect(parsed).toEqual({ kind: 'model', repoId: 'meta-llama/Llama-3-8B' })
    expect(parseRepoFolderName('junk')).toBeNull()
    expect(parseRepoFolderName('weird--thing')).toBeNull()
  })
})

describe('defaultCacheDir', () => {
  it('honors HF_HUB_CACHE, then HF_HOME, then XDG_CACHE_HOME', () => {
    expect(defaultCacheDir({ HF_HUB_CACHE: '/x/hub' })).toBe('/x/hub')
    expect(defaultCacheDir({ HF_HOME: '/x/hf' })).toBe(join('/x/hf', 'hub'))
    expect(defaultCacheDir({ XDG_CACHE_HOME: '/x/cache' })).toBe(
      join('/x/cache', 'huggingface', 'hub')
    )
    expect(defaultCacheDir({})).toContain(join('.cache', 'huggingface', 'hub'))
  })
})

describe('repoCachePaths', () => {
  it('derives blobs/snapshots/refs under the repo dir', () => {
    const p = repoCachePaths('/cache', 'model', 'a/b')
    expect(p.repoDir).toBe(join('/cache', 'models--a--b'))
    expect(p.blobsDir).toBe(join(p.repoDir, 'blobs'))
    expect(p.snapshotsDir).toBe(join(p.repoDir, 'snapshots'))
    expect(p.refsDir).toBe(join(p.repoDir, 'refs'))
  })
})
