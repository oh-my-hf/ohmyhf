import { describe, expect, it } from 'vitest'
import { toOnnxPreviewData } from './onnx'

describe('toOnnxPreviewData', () => {
  it('extracts graph IO and node summary', () => {
    const out = toOnnxPreviewData({
      producerName: 'pytorch',
      producerVersion: '2.0',
      irVersion: 8,
      opsetImport: [{ domain: '', version: 17 }],
      graph: {
        name: 'main_graph',
        input: [{ name: 'input', type: { tensorType: { elemType: 1 } } }],
        output: [{ name: 'output', type: { tensorType: { elemType: 1 } } }],
        node: [
          { name: 'conv1', opType: 'Conv' },
          { name: '', opType: 'Relu' }
        ]
      }
    })
    expect(out.producerName).toBe('pytorch')
    expect(out.opsets).toEqual(['ai.onnx @ 17'])
    expect(out.graphName).toBe('main_graph')
    expect(out.inputs).toEqual([{ name: 'input', type: 'float32' }])
    expect(out.outputs).toEqual([{ name: 'output', type: 'float32' }])
    expect(out.nodeCount).toBe(2)
    expect(out.nodes).toEqual([
      { name: 'conv1', opType: 'Conv' },
      { name: 'Relu', opType: 'Relu' }
    ])
  })
})
