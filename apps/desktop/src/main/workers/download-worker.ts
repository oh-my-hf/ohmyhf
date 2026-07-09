/**
 * Downloads one file into the standard HF cache layout. Runs in a worker_thread so
 * hashing and disk IO never block the main process.
 *
 * Protocol (parentPort messages):
 *   in : { type: 'abort' }
 *   out: { type: 'meta', commit, etag, size, isLfs }
 *        { type: 'progress', received, size }
 *        { type: 'done', received, verified, snapshotPath }
 *        { type: 'error', message }
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

export interface DownloadJob {
  /** resolve URL, e.g. https://huggingface.co/org/name/resolve/main/file.bin */
  url: string
  /** "models--org--name" repo directory inside the cache. */
  repoDir: string
  /** Repo-relative file path. */
  path: string
  revision: string
  authToken?: string
  speedLimitBps?: number | null
  userAgent: string
}

const job = workerData as DownloadJob
const port = parentPort!

let aborted = false
let abortController = new AbortController()
port.on('message', (msg: { type?: string }) => {
  if (msg?.type === 'abort') {
    aborted = true
    abortController.abort()
  }
})

function baseHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': job.userAgent }
  if (job.authToken) h.Authorization = `Bearer ${job.authToken}`
  return h
}

interface FileMetadata {
  commit: string
  etag: string
  size: number
  isLfs: boolean
  downloadUrl: string
}

/**
 * HF puts LFS metadata on the *redirect* response, so redirects are handled manually
 * (mirrors huggingface_hub's hf_hub_download).
 */
async function fetchMetadata(): Promise<FileMetadata> {
  const res = await fetch(job.url, {
    method: 'HEAD',
    headers: { ...baseHeaders(), 'Accept-Encoding': 'identity' },
    redirect: 'manual',
    signal: abortController.signal
  })
  if (res.status >= 400) {
    throw new Error(`HEAD ${job.url} failed: ${res.status} ${res.statusText}`)
  }
  const linkedEtag = res.headers.get('x-linked-etag')
  const rawEtag = linkedEtag ?? res.headers.get('etag') ?? ''
  const etag = rawEtag.replace(/^W\//, '').replace(/"/g, '')
  if (!etag) throw new Error('No ETag on resolve response')
  const commit = res.headers.get('x-repo-commit') ?? ''
  if (!commit) throw new Error('No x-repo-commit header on resolve response')
  const size = Number(res.headers.get('x-linked-size') ?? res.headers.get('content-length') ?? 0)
  const location = res.headers.get('location')
  const downloadUrl = location ? new URL(location, job.url).toString() : job.url
  return { commit, etag, size, isLfs: Boolean(linkedEtag), downloadUrl }
}

function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/** Simple token bucket; sleeps when the rolling send rate exceeds the limit. */
class Throttle {
  private windowStart = Date.now()
  private windowBytes = 0

  constructor(private readonly limitBps: number) {}

  async take(bytes: number): Promise<void> {
    this.windowBytes += bytes
    const elapsed = (Date.now() - this.windowStart) / 1000
    const expected = this.windowBytes / this.limitBps
    if (expected > elapsed) {
      await new Promise((r) => setTimeout(r, (expected - elapsed) * 1000))
    }
    if (elapsed > 2) {
      this.windowStart = Date.now()
      this.windowBytes = 0
    }
  }
}

function linkSnapshot(snapshotFile: string, blobPath: string): void {
  mkdirSync(dirname(snapshotFile), { recursive: true })
  rmSync(snapshotFile, { force: true })
  const target = relative(dirname(snapshotFile), blobPath)
  try {
    symlinkSync(target, snapshotFile)
  } catch {
    // Windows without developer mode: fall back to a copy, like huggingface_hub.
    copyFileSync(blobPath, snapshotFile)
  }
}

async function downloadToBlob(meta: FileMetadata, blobPath: string): Promise<number> {
  const incomplete = `${blobPath}.incomplete`
  mkdirSync(dirname(blobPath), { recursive: true })

  let offset = 0
  if (existsSync(incomplete)) {
    offset = statSync(incomplete).size
    if (offset > meta.size) {
      rmSync(incomplete, { force: true })
      offset = 0
    }
  }

  if (offset < meta.size || meta.size === 0) {
    abortController = new AbortController()
    if (aborted) throw new Error('aborted')
    const headers: Record<string, string> = { ...baseHeaders() }
    if (offset > 0) headers.Range = `bytes=${offset}-`
    const res = await fetch(meta.downloadUrl, { headers, signal: abortController.signal })
    if (res.status === 200 && offset > 0) {
      // Server ignored the Range; start over.
      rmSync(incomplete, { force: true })
      offset = 0
    } else if (!res.ok && res.status !== 206) {
      throw new Error(`GET failed: ${res.status} ${res.statusText}`)
    }
    if (!res.body) throw new Error('Response has no body')

    const throttle = job.speedLimitBps ? new Throttle(job.speedLimitBps) : null
    const out = createWriteStream(incomplete, { flags: offset > 0 ? 'a' : 'w' })
    let received = offset
    let lastReport = 0
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (aborted) throw new Error('aborted')
        received += value.byteLength
        await new Promise<void>((resolve, reject) =>
          out.write(value, (err) => (err ? reject(err) : resolve()))
        )
        if (throttle) await throttle.take(value.byteLength)
        const now = Date.now()
        if (now - lastReport > 200) {
          lastReport = now
          port.postMessage({ type: 'progress', received, size: meta.size })
        }
      }
    } finally {
      await new Promise((r) => out.end(r))
    }
    if (meta.size > 0 && received !== meta.size) {
      throw new Error(`Incomplete download: got ${received} of ${meta.size} bytes`)
    }
  }

  // LFS etags are the sha256 of the content; verify before promoting the blob.
  let verified = false
  if (meta.isLfs && /^[0-9a-f]{64}$/.test(meta.etag)) {
    const digest = await sha256OfFile(incomplete)
    if (digest !== meta.etag) {
      rmSync(incomplete, { force: true })
      throw new Error('Checksum mismatch (sha256); the partial file was discarded')
    }
    verified = true
  }
  renameSync(incomplete, blobPath)
  return verified ? 1 : 0
}

async function run(): Promise<void> {
  const meta = await fetchMetadata()
  port.postMessage({ type: 'meta', commit: meta.commit, etag: meta.etag, size: meta.size, isLfs: meta.isLfs })

  const blobPath = join(job.repoDir, 'blobs', meta.etag)
  const snapshotFile = join(job.repoDir, 'snapshots', meta.commit, ...job.path.split('/'))

  let verified: boolean
  if (existsSync(blobPath) && (meta.size === 0 || statSync(blobPath).size === meta.size)) {
    verified = meta.isLfs
  } else {
    verified = (await downloadToBlob(meta, blobPath)) === 1
  }
  linkSnapshot(snapshotFile, blobPath)

  // Record the ref so transformers/CLI resolve this revision without a network call.
  const refsDir = join(job.repoDir, 'refs')
  mkdirSync(refsDir, { recursive: true })
  if (!/^[0-9a-f]{40}$/.test(job.revision)) {
    writeFileSync(join(refsDir, job.revision.replace(/\//g, '_')), meta.commit)
  }

  port.postMessage({
    type: 'done',
    received: meta.size,
    verified,
    snapshotPath: snapshotFile
  })
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  port.postMessage({ type: aborted ? 'error' : 'error', message: aborted ? 'aborted' : message })
})
