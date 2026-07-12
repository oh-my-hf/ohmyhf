import { describe, expect, it, vi } from 'vitest'

// The component import graph touches window.matchMedia at module scope
// (lib/theme.ts); stub just enough of it for this node-environment suite.
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
})
const { exportToolsFor } = await import('./FileTreeView')

describe('exportToolsFor', () => {
  it('offers all targets for GGUF files', () => {
    expect(exportToolsFor('model-Q4_K_M.gguf')).toEqual(['ollama', 'lmstudio', 'comfyui'])
    expect(exportToolsFor('MODEL.GGUF')).toEqual(['ollama', 'lmstudio', 'comfyui'])
  })

  it('offers only ComfyUI for diffusion weight formats', () => {
    expect(exportToolsFor('sd_xl_base_1.0.safetensors')).toEqual(['comfyui'])
    expect(exportToolsFor('v1-5-pruned.ckpt')).toEqual(['comfyui'])
    expect(exportToolsFor('control_lora.pt')).toEqual(['comfyui'])
    expect(exportToolsFor('vae.pth')).toEqual(['comfyui'])
    expect(exportToolsFor('pytorch_model.bin')).toEqual(['comfyui'])
  })

  it('offers nothing for non-exportable files', () => {
    expect(exportToolsFor('README.md')).toEqual([])
    expect(exportToolsFor('config.json')).toEqual([])
    expect(exportToolsFor('gguf')).toEqual([])
  })
})
