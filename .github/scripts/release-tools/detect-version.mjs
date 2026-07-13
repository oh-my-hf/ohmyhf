#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MANIFESTS = [
  'package.json',
  'apps/desktop/package.json',
  'packages/shared/package.json',
  'packages/hub-api/package.json'
]
const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/

function readVersion(path) {
  const manifest = JSON.parse(readFileSync(resolve(path), 'utf8'))
  if (typeof manifest.version !== 'string' || !PLAIN_SEMVER.test(manifest.version)) {
    throw new Error(`${path} must contain a plain x.y.z version`)
  }
  return manifest.version
}

const versions = MANIFESTS.map((path) => ({ path, version: readVersion(path) }))
const version = versions[0].version
const mismatch = versions.find((entry) => entry.version !== version)

if (mismatch) {
  throw new Error(
    `Workspace manifest versions must match: ${versions
      .map((entry) => `${entry.path}=${entry.version}`)
      .join(', ')}`
  )
}

const subjectFlag = process.argv.indexOf('--subject')
let release = true

if (subjectFlag !== -1) {
  const subject = process.argv[subjectFlag + 1] ?? ''
  const match = /^\[RELEASE\]\s+[vV]?(\d+\.\d+\.\d+)(?:\s+.*)?$/.exec(subject)

  if (!match) {
    if (subject.startsWith('[RELEASE]')) {
      throw new Error(
        `Release commit subject must be "[RELEASE] Vx.y.z" with a plain version; got: ${subject}`
      )
    }
    release = false
  } else if (match[1] !== version) {
    throw new Error(
      `Release commit version ${match[1]} does not match workspace manifest version ${version}`
    )
  }
}

process.stdout.write(`${JSON.stringify({ release, version, manifests: versions })}\n`)
