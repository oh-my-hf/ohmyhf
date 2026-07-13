import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { clearTimeout, setTimeout } from 'node:timers'

const TIMEOUT_MS = 60_000
const vitest = resolve('node_modules/.bin', process.platform === 'win32' ? 'vitest.cmd' : 'vitest')
let activeChild
let timedOut = false

const timer = setTimeout(() => {
  timedOut = true
  console.error(`Unit tests exceeded ${TIMEOUT_MS / 1000}s; terminating the test process.`)
  activeChild?.kill('SIGTERM')
  setTimeout(() => activeChild?.kill('SIGKILL'), 2_000).unref()
}, TIMEOUT_MS)
timer.unref()

function run(cwd) {
  return new Promise((resolveRun, rejectRun) => {
    activeChild = spawn(vitest, ['run'], { cwd, stdio: 'inherit', env: process.env })
    activeChild.once('error', rejectRun)
    activeChild.once('exit', (code, signal) => {
      activeChild = undefined
      if (timedOut) return rejectRun(new Error('Unit test timeout'))
      if (signal) return rejectRun(new Error(`Unit tests terminated by ${signal}`))
      if (code !== 0) return rejectRun(new Error(`Unit tests exited with code ${code ?? 1}`))
      resolveRun()
    })
  })
}

try {
  await run(resolve('packages/hub-api'))
  await run(resolve('apps/desktop'))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  clearTimeout(timer)
}
