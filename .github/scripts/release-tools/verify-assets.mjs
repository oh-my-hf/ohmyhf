#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'

const manifestPath = resolve(process.argv[2] ?? '')
const directory = resolve(process.argv[3] ?? '')

if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Usage: verify-assets.mjs <release-assets.json> <asset-directory>')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
  throw new Error('Unsupported release asset manifest')
}

const expected = new Map()
const hasControlCharacters = (value) =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })

for (const asset of manifest.assets) {
  const segments = typeof asset?.name === 'string' ? asset.name.split(/[\\/]/) : []
  if (
    !asset ||
    typeof asset.name !== 'string' ||
    isAbsolute(asset.name) ||
    asset.name.includes('/') ||
    asset.name.includes('\\') ||
    segments.some((segment) => segment === '.' || segment === '..') ||
    basename(asset.name) !== asset.name ||
    hasControlCharacters(asset.name) ||
    asset.name === '.' ||
    asset.name === '..' ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    typeof asset.sha512 !== 'string' ||
    expected.has(asset.name)
  ) {
    throw new Error('Release asset manifest contains an invalid entry')
  }
  expected.set(asset.name, asset)
}

const actualNames = readdirSync(directory)
  .filter((name) => resolve(directory, name) !== manifestPath)
  .sort((left, right) => left.localeCompare(right))
const expectedNames = [...expected.keys()].sort((left, right) => left.localeCompare(right))

if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(
    `Remote asset list mismatch: expected [${expectedNames.join(', ')}], got [${actualNames.join(', ')}]`
  )
}

for (const name of actualNames) {
  const path = resolve(directory, name)
  const info = lstatSync(path)
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error(`Asset is not a regular file: ${name}`)

  const asset = expected.get(name)
  const hash = createHash('sha512').update(readFileSync(path)).digest('base64')
  if (info.size !== asset.size || hash !== asset.sha512) {
    throw new Error(`Asset does not match preflight output: ${name}`)
  }
}

process.stdout.write(`Verified ${actualNames.length} assets against the preflight manifest.\n`)
