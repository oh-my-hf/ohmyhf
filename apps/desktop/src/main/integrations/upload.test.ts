import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRepoUrl, createRepoAndUpload, resolveHubUrl, type UploadManifest } from './upload'

const mocks = vi.hoisted(() => ({
  createRepo: vi.fn(),
  commitIter: vi.fn(),
  fetch: vi.fn()
}))

// upload.ts pulls in ../hub for the proxied fetch, and hub.ts imports electron's
// `app` at module scope; vitest runs on plain Node, so stub the electron surface.
vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0-test' } }))
vi.mock('../hub', () => ({
  createProxiedFetch: () => mocks.fetch,
  getHubNetworkOptions: () => ({ endpoint: null, proxyUrl: null })
}))
vi.mock('@huggingface/hub', () => ({
  createRepo: mocks.createRepo,
  commitIter: mocks.commitIter,
  HubApiError: class HubApiError extends Error {
    constructor(readonly statusCode: number) {
      super(`Hub API ${statusCode}`)
    }
  }
}))

const roots: string[] = []

async function manifestWithFile(content = 'original content'): Promise<{
  manifest: UploadManifest
  filePath: string
}> {
  const rootPath = await mkdtemp(join(tmpdir(), 'omh-upload-pipeline-'))
  roots.push(rootPath)
  const selectedPath = join(rootPath, 'model.txt')
  await writeFile(selectedPath, content)
  const [rootRealPath, filePath, rootStats] = await Promise.all([
    realpath(rootPath),
    realpath(selectedPath),
    stat(rootPath)
  ])
  const fileStats = await stat(filePath)
  return {
    filePath,
    manifest: {
      rootPath,
      rootRealPath,
      rootDev: rootStats.dev,
      rootIno: rootStats.ino,
      files: [
        {
          relativePath: 'model.txt',
          absolutePath: filePath,
          size: fileStats.size,
          mtimeMs: fileStats.mtimeMs,
          dev: fileStats.dev,
          ino: fileStats.ino
        }
      ]
    }
  }
}

async function manifestWithFiles(count: number): Promise<UploadManifest> {
  const rootPath = await mkdtemp(join(tmpdir(), 'omh-upload-many-'))
  roots.push(rootPath)
  const rootRealPath = await realpath(rootPath)
  const rootStats = await stat(rootRealPath)
  const files = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const relativePath = `file-${index}.txt`
      const absolutePath = join(rootRealPath, relativePath)
      await writeFile(absolutePath, `content-${index}`)
      const fileStats = await stat(absolutePath)
      return {
        relativePath,
        absolutePath,
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs,
        dev: fileStats.dev,
        ino: fileStats.ino
      }
    })
  )
  return {
    rootPath,
    rootRealPath,
    rootDev: rootStats.dev,
    rootIno: rootStats.ino,
    files
  }
}

function successfulCommit(readContent?: (value: string) => void): void {
  mocks.commitIter.mockImplementation((params: unknown) => {
    const request = params as { operations: Array<{ content: Blob }> }
    return (async function* () {
      readContent?.(await request.operations[0]!.content.text())
      yield { event: 'phase', phase: 'committing' }
    })()
  })
}

beforeEach(() => {
  mocks.createRepo.mockReset().mockResolvedValue(undefined)
  mocks.commitIter.mockReset()
  mocks.fetch.mockReset()
  successfulCommit()
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('resolveHubUrl', () => {
  it('falls back to the default endpoint when none is configured', () => {
    expect(resolveHubUrl(null)).toBe('https://huggingface.co')
  })

  it('uses the configured endpoint and strips a trailing slash', () => {
    expect(resolveHubUrl('https://hub.example.com/')).toBe('https://hub.example.com')
    expect(resolveHubUrl('https://hub.example.com')).toBe('https://hub.example.com')
  })
})

describe('buildRepoUrl', () => {
  it('links the repo on the active endpoint with the kind prefix', () => {
    expect(buildRepoUrl('https://huggingface.co', 'model', 'me/repo')).toBe(
      'https://huggingface.co/me/repo'
    )
    expect(buildRepoUrl('https://hub.example.com', 'dataset', 'me/repo')).toBe(
      'https://hub.example.com/datasets/me/repo'
    )
    expect(buildRepoUrl('https://hub.example.com', 'space', 'me/repo')).toBe(
      'https://hub.example.com/spaces/me/repo'
    )
  })
})

describe('createRepoAndUpload immutable manifest', () => {
  it('uploads through an open file descriptor and completes unchanged files', async () => {
    const { manifest } = await manifestWithFile('stable bytes')
    let uploaded = ''
    successfulCommit((value) => {
      uploaded = value
    })

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(result).toMatchObject({ ok: true, repoId: 'alice/demo' })
    expect(uploaded).toBe('stable bytes')
    expect(mocks.commitIter).toHaveBeenCalledOnce()
  })

  it('refuses a replaced path before reading replacement bytes', async () => {
    const { manifest, filePath } = await manifestWithFile('selected bytes')
    mocks.createRepo.mockImplementation(async () => {
      await rm(filePath)
      await writeFile(filePath, 'replacement bytes')
    })
    let uploaded = ''
    successfulCommit((value) => {
      uploaded = value
    })

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(uploaded).toBe('')
    expect(result).toMatchObject({ ok: false, messageKey: 'upload.selectionStale' })
  })

  it('maps a removed manifest file to selection-stale', async () => {
    const { manifest, filePath } = await manifestWithFile('selected bytes')
    await rm(filePath)

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(result).toMatchObject({ ok: false, messageKey: 'upload.selectionStale' })
    expect(mocks.createRepo).not.toHaveBeenCalled()
  })

  it('streams selections larger than the descriptor window without opening all files at once', async () => {
    const manifest = await manifestWithFiles(40)
    let uploadedFiles = 0
    mocks.commitIter.mockImplementation((params: unknown) => {
      const request = params as { operations: Array<{ content: Blob }> }
      return (async function* () {
        const contents = await Promise.all(request.operations.map(({ content }) => content.text()))
        uploadedFiles = contents.length
        yield { event: 'phase', phase: 'committing' }
      })()
    })

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(result).toMatchObject({ ok: true })
    expect(uploadedFiles).toBe(40)
  })

  it('closes an abandoned Blob reader when the SDK fails without canceling it', async () => {
    const { manifest } = await manifestWithFile('x'.repeat(1024 * 1024))
    let abandonedReader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined
    mocks.commitIter.mockImplementation((params: unknown) => {
      const request = params as { operations: Array<{ content: Blob }> }
      return (async function* () {
        abandonedReader = request.operations[0]!.content.stream().getReader()
        const first = await abandonedReader.read()
        expect(first.done).toBe(false)
        yield { event: 'phase', phase: 'preuploading' }
        throw new Error('simulated network failure')
      })()
    })

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(result).toMatchObject({ ok: false, messageKey: 'upload.failed' })
    await expect(
      (async () => {
        for (;;) {
          const next = await abandonedReader!.read()
          if (next.done) throw new Error('reader unexpectedly completed')
        }
      })()
    ).rejects.toThrow(/file closed|selection-stale/)
  })

  it('does not misreport a completed remote commit when the local file changes afterward', async () => {
    const { manifest, filePath } = await manifestWithFile('committed bytes')
    mocks.commitIter.mockImplementation((params: unknown) => {
      const request = params as { operations: Array<{ content: Blob }> }
      return (async function* () {
        await request.operations[0]!.content.text()
        yield { event: 'phase', phase: 'committing' }
        await writeFile(filePath, 'changed after commit')
      })()
    })

    const result = await createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: new AbortController().signal,
        onProgress: vi.fn()
      }
    )

    expect(result).toMatchObject({ ok: true, repoId: 'alice/demo' })
  })

  it('aborts createRepo through the shared fetch signal', async () => {
    const { manifest } = await manifestWithFile()
    const controller = new AbortController()
    let started!: (signal: AbortSignal) => void
    const fetchStarted = new Promise<AbortSignal>((resolve) => {
      started = resolve
    })
    mocks.fetch.mockImplementation((_input: unknown, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      started(signal)
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    mocks.createRepo.mockImplementation((params: unknown) => {
      const request = params as { fetch: typeof fetch }
      return request.fetch('https://hub.example.test/api/repos/create').then(() => undefined)
    })

    const operation = createRepoAndUpload(
      { kind: 'model', name: 'demo', private: false, manifest },
      {
        accessToken: 'hf_test',
        username: 'alice',
        signal: controller.signal,
        onProgress: vi.fn()
      }
    )
    const requestSignal = await fetchStarted
    controller.abort()

    expect(requestSignal.aborted).toBe(true)
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each(['hashing', 'uploading', 'committing'] as const)(
    'cancels while the SDK reports the %s phase',
    async (phase) => {
      const { manifest } = await manifestWithFile()
      const controller = new AbortController()
      let entered!: () => void
      const phaseEntered = new Promise<void>((resolve) => {
        entered = resolve
      })
      mocks.commitIter.mockImplementation((params: unknown) => {
        const { abortSignal } = params as { abortSignal: AbortSignal }
        return (async function* () {
          if (phase === 'committing') yield { event: 'phase', phase: 'committing' }
          else yield { event: 'fileProgress', state: phase, path: 'model.txt', progress: 0.5 }
          entered()
          await new Promise((_resolve, reject) => {
            abortSignal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
        })()
      })

      const operation = createRepoAndUpload(
        { kind: 'model', name: 'demo', private: false, manifest },
        {
          accessToken: 'hf_test',
          username: 'alice',
          signal: controller.signal,
          onProgress: vi.fn()
        }
      )
      await phaseEntered
      controller.abort()

      await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    }
  )
})
