import type { RendererApi } from '@oh-my-huggingface/shared'

declare global {
  interface Window {
    omh: RendererApi
  }
}

export {}
