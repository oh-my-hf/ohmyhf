#!/usr/bin/env node
/**
 * Rebuild native modules (better-sqlite3) against the workspace's Electron version.
 * Runs as the root postinstall; exits quietly when deps aren't installed yet
 * (e.g. partial/lockfile-only installs) so bootstrap never hard-fails.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const has = (p) => existsSync(join(root, 'node_modules', p))

if (!has('electron/package.json') || !has('better-sqlite3/package.json')) {
  console.log('[rebuild-native] electron or better-sqlite3 not installed yet; skipping')
  process.exit(0)
}

// Run through a shell: Node 22+ refuses to spawn a `.cmd`/`.bat` directly on
// Windows (CVE-2024-27980), so invoking `npx.cmd` without a shell fails
// instantly with no output. `shell: true` + bare `npx` works on every OS; the
// fixed args have no whitespace/metacharacters, so shell quoting is safe.
const result = spawnSync('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], {
  cwd: root,
  stdio: 'inherit',
  shell: true
})
process.exit(result.status ?? 1)
