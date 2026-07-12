import { describe, expect, it } from 'vitest'
import { ggmlTypeName, toGgufPreviewData } from './gguf'

describe('ggmlTypeName', () => {
  it('maps known ids and falls back for unknowns', () => {
    expect(ggmlTypeName(0)).toBe('F32')
    expect(ggmlTypeName(12)).toBe('Q4_K')
    expect(ggmlTypeName(999)).toBe('type_999')
  })
})

describe('toGgufPreviewData', () => {
  it('stringifies metadata and maps tensor shapes', () => {
    const out = toGgufPreviewData({
      metadata: {
        'general.architecture': 'llama',
        'general.file_type': 15,
        'llama.context_length': 4096n
      },
      tensorInfos: [
        { name: 'token_embd.weight', shape: [32000n, 4096n], type: 12 }
      ]
    })
    expect(out.metadata['general.architecture']).toBe('llama')
    expect(out.metadata['general.file_type']).toBe('15')
    expect(out.metadata['llama.context_length']).toBe('4096')
    expect(out.tensors).toEqual([
      { name: 'token_embd.weight', dtype: 'Q4_K', shape: [32000, 4096] }
    ])
  })
})
