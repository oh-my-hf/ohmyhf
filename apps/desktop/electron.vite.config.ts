import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The production CSP in index.html is strict. The Vite dev server needs inline
 * scripts (react-refresh preamble) and a websocket for HMR, so we relax those two
 * directives during `serve` only — packaged builds keep the strict policy.
 */
function devCsp(): Plugin {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Pure-JS deps (workspace packages, @huggingface/*, zod) are bundled;
        // only the runtime, native modules, and electron-updater stay external.
        external: ['electron', 'better-sqlite3', 'electron-updater'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'download-worker': resolve(__dirname, 'src/main/workers/download-worker.ts'),
          'cache-worker': resolve(__dirname, 'src/main/workers/cache-worker.ts')
        }
      }
    }
  },
  preload: {
    // Sandboxed preloads cannot require() anything at runtime: bundle all but electron.
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss(), devCsp()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
