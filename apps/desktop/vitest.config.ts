import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Playwright owns e2e/; vitest must not pick those specs up.
    exclude: ['e2e/**', 'node_modules/**']
  }
})
