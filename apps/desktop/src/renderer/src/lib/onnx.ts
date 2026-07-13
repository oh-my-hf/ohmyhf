export interface OnnxValueInfo {
  name: string
  type?: string
}

export interface OnnxNodeInfo {
  name: string
  opType: string
}

export interface OnnxPreviewData {
  producerName?: string
  producerVersion?: string
  domain?: string
  irVersion?: string
  opsets: string[]
  graphName?: string
  inputs: OnnxValueInfo[]
  outputs: OnnxValueInfo[]
  nodeCount: number
  nodes: OnnxNodeInfo[]
}

function longToString(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return String((value as { toString: () => string }).toString())
  }
  return undefined
}

function tensorElemTypeName(elemType: number | null | undefined): string | undefined {
  if (elemType == null) return undefined
  const names: Record<number, string> = {
    1: 'float32',
    2: 'uint8',
    3: 'int8',
    4: 'uint16',
    5: 'int16',
    6: 'int32',
    7: 'int64',
    8: 'string',
    9: 'bool',
    10: 'float16',
    11: 'float64',
    12: 'uint32',
    13: 'uint64',
    14: 'complex64',
    15: 'complex128',
    16: 'bfloat16'
  }
  return names[elemType] ?? `elem_${elemType}`
}

function valueTypeLabel(
  type:
    | {
        tensorType?: { elemType?: number | null } | null
      }
    | null
    | undefined
): string | undefined {
  return tensorElemTypeName(type?.tensorType?.elemType ?? undefined)
}

/** Max node rows shown in the preview table. */
export const ONNX_PREVIEW_NODE_LIMIT = 200

/**
 * Normalize a decoded onnx.ModelProto into a small preview model.
 * Accepts a loose shape so tests don't need the full protobuf types.
 */
export function toOnnxPreviewData(model: {
  producerName?: string | null
  producerVersion?: string | null
  domain?: string | null
  irVersion?: unknown
  opsetImport?: { domain?: string | null; version?: unknown }[] | null
  graph?: {
    name?: string | null
    input?:
      | {
          name?: string | null
          type?: { tensorType?: { elemType?: number | null } | null } | null
        }[]
      | null
    output?:
      | {
          name?: string | null
          type?: { tensorType?: { elemType?: number | null } | null } | null
        }[]
      | null
    node?: { name?: string | null; opType?: string | null }[] | null
  } | null
}): OnnxPreviewData {
  const opsets = (model.opsetImport ?? []).map((o) => {
    const domain = o.domain && o.domain.length > 0 ? o.domain : 'ai.onnx'
    const version = longToString(o.version) ?? '?'
    return `${domain} @ ${version}`
  })
  const inputs = (model.graph?.input ?? []).map((v) => ({
    name: v.name ?? '',
    type: valueTypeLabel(v.type)
  }))
  const outputs = (model.graph?.output ?? []).map((v) => ({
    name: v.name ?? '',
    type: valueTypeLabel(v.type)
  }))
  const allNodes = model.graph?.node ?? []
  const nodes = allNodes.slice(0, ONNX_PREVIEW_NODE_LIMIT).map((n) => ({
    name: n.name && n.name.length > 0 ? n.name : (n.opType ?? ''),
    opType: n.opType ?? ''
  }))
  return {
    producerName: model.producerName || undefined,
    producerVersion: model.producerVersion || undefined,
    domain: model.domain || undefined,
    irVersion: longToString(model.irVersion),
    opsets,
    graphName: model.graph?.name || undefined,
    inputs,
    outputs,
    nodeCount: allNodes.length,
    nodes
  }
}

/** Decode ONNX ModelProto bytes; returns null when the buffer is not a model. */
export async function parseOnnxBytes(bytes: Uint8Array): Promise<OnnxPreviewData | null> {
  try {
    const mod = (await import('onnx-proto')) as {
      onnx?: { ModelProto: { decode: (b: Uint8Array) => Parameters<typeof toOnnxPreviewData>[0] } }
      default?: {
        onnx?: {
          ModelProto: { decode: (b: Uint8Array) => Parameters<typeof toOnnxPreviewData>[0] }
        }
        ModelProto?: { decode: (b: Uint8Array) => Parameters<typeof toOnnxPreviewData>[0] }
      }
    }
    const onnxNs = mod.onnx ?? mod.default?.onnx ?? mod.default
    const decode = onnxNs && 'ModelProto' in onnxNs ? onnxNs.ModelProto?.decode : undefined
    if (!decode) return null
    const model = decode(bytes)
    if (!model.graph) return null
    return toOnnxPreviewData(model)
  } catch {
    return null
  }
}
