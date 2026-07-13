#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'

const directory = resolve(process.argv[2] ?? '')
const expectedVersion = process.argv[3]
const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/
const ALLOWED_ASSET = /(?:\.AppImage|\.deb|\.dmg|\.zip|\.exe|\.blockmap|\.yml)$/i
const REQUIRED_FORMATS = [
  ['Linux AppImage', /\.AppImage$/i],
  ['Linux deb', /\.deb$/i],
  ['macOS dmg', /\.dmg$/i],
  ['macOS update zip', /\.zip$/i],
  ['Windows installer', /\.exe$/i]
]
const REQUIRED_MANIFESTS = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']

if (!PLAIN_SEMVER.test(expectedVersion ?? '')) {
  throw new Error('Usage: preflight.mjs <asset-directory> <x.y.z>')
}

function scalar(raw) {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value)
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'")
  }
  return value
}

function sha512(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64')
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}

function isSafeFileName(name) {
  const segments = name.split(/[\\/]/)
  return (
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !isAbsolute(name) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !segments.some((segment) => segment === '.' || segment === '..') &&
    basename(name) === name &&
    !hasControlCharacters(name)
  )
}

function safeReferencedName(raw) {
  const withoutQuery = scalar(raw).split(/[?#]/, 1)[0]
  let decoded
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    throw new Error(`Updater manifest contains an invalid URL-encoded path: ${raw}`)
  }
  if (!isSafeFileName(decoded)) {
    throw new Error(`Updater manifest reference must be a file name: ${raw}`)
  }
  return decoded
}

function parseUpdaterManifest(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let version
  let topPath
  let topSha512
  let currentFile
  let inFiles = false
  const references = []

  for (const line of lines) {
    const versionMatch = /^version:\s*(.+)\s*$/.exec(line)
    if (versionMatch) version = scalar(versionMatch[1])

    if (/^files:\s*$/.test(line)) {
      inFiles = true
      continue
    }

    const fileMatch = /^\s+-\s+url:\s*(.+)\s*$/.exec(line)
    if (fileMatch) {
      inFiles = true
      currentFile = { name: safeReferencedName(fileMatch[1]) }
      references.push(currentFile)
      continue
    }

    const indentedHashMatch = /^\s+sha512:\s*(.+)\s*$/.exec(line)
    if (inFiles && currentFile && indentedHashMatch) {
      currentFile.sha512 = scalar(indentedHashMatch[1])
      continue
    }

    if (!/^\s/.test(line)) inFiles = false

    const pathMatch = /^path:\s*(.+)\s*$/.exec(line)
    if (pathMatch) topPath = safeReferencedName(pathMatch[1])
    const hashMatch = /^sha512:\s*(.+)\s*$/.exec(line)
    if (hashMatch) topSha512 = scalar(hashMatch[1])
  }

  if (topPath || topSha512) {
    if (!topPath || !topSha512)
      throw new Error(`${basename(path)} has an incomplete path/sha512 pair`)
    const existing = references.find((entry) => entry.name === topPath)
    if (existing && existing.sha512 && existing.sha512 !== topSha512) {
      throw new Error(`${basename(path)} contains conflicting hashes for ${topPath}`)
    }
    if (!existing) references.push({ name: topPath, sha512: topSha512 })
  }

  if (version !== expectedVersion) {
    throw new Error(
      `${basename(path)} version ${version ?? '<missing>'} does not match ${expectedVersion}`
    )
  }
  if (references.length === 0)
    throw new Error(`${basename(path)} does not reference an update artifact`)
  if (references.some((entry) => !entry.sha512)) {
    throw new Error(`${basename(path)} contains an update artifact without sha512`)
  }

  return references
}

const names = readdirSync(directory).sort((left, right) => left.localeCompare(right))
if (names.length === 0) throw new Error('No release assets were downloaded')

for (const name of names) {
  const path = resolve(directory, name)
  if (!isSafeFileName(name) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
    throw new Error(`Release output must contain only regular files: ${name}`)
  }
  if (name !== 'release-assets.json' && !ALLOWED_ASSET.test(name)) {
    throw new Error(`Unexpected release output: ${name}`)
  }
  if (statSync(path).size === 0) throw new Error(`Release asset is empty: ${name}`)
}

for (const [label, pattern] of REQUIRED_FORMATS) {
  if (!names.some((name) => pattern.test(name))) throw new Error(`Missing ${label} artifact`)
}
for (const manifest of REQUIRED_MANIFESTS) {
  if (!names.includes(manifest)) throw new Error(`Missing updater manifest: ${manifest}`)
}

for (const manifest of REQUIRED_MANIFESTS) {
  for (const reference of parseUpdaterManifest(resolve(directory, manifest))) {
    if (!names.includes(reference.name)) {
      throw new Error(`${manifest} references missing artifact ${reference.name}`)
    }
    const actual = sha512(resolve(directory, reference.name))
    if (actual !== reference.sha512) {
      throw new Error(`${manifest} sha512 mismatch for ${reference.name}`)
    }
  }
}

const assets = names
  .filter((name) => name !== 'release-assets.json')
  .map((name) => {
    const path = resolve(directory, name)
    return { name, size: statSync(path).size, sha512: sha512(path) }
  })

writeFileSync(
  resolve(directory, 'release-assets.json'),
  `${JSON.stringify({ schemaVersion: 1, version: expectedVersion, assets }, null, 2)}\n`,
  'utf8'
)
process.stdout.write(`Verified ${assets.length} release assets for v${expectedVersion}.\n`)
