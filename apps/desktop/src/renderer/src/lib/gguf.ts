/** GGML type ids used in GGUF tensor headers (llama.cpp). */
const GGML_TYPE_NAMES: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  6: 'Q5_0',
  7: 'Q5_1',
  8: 'Q8_0',
  9: 'Q8_1',
  10: 'Q2_K',
  11: 'Q3_K',
  12: 'Q4_K',
  13: 'Q5_K',
  14: 'Q6_K',
  15: 'Q8_K',
  16: 'IQ2_XXS',
  17: 'IQ2_XS',
  18: 'IQ3_XXS',
  19: 'IQ1_S',
  20: 'IQ4_NL',
  21: 'IQ3_S',
  22: 'IQ2_S',
  23: 'IQ4_XS',
  24: 'I8',
  25: 'I16',
  26: 'I32',
  27: 'I64',
  28: 'F64',
  29: 'IQ1_M',
  30: 'BF16'
}

export function ggmlTypeName(type: number): string {
  return GGML_TYPE_NAMES[type] ?? `type_${type}`
}

export interface GgufTensorInfo {
  name: string
  dtype: string
  shape: number[]
}

export interface GgufPreviewData {
  metadata: Record<string, string>
  tensors: GgufTensorInfo[]
}

function stringifyMeta(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(stringifyMeta).join(', ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Normalize hyllama output into a renderer-friendly preview model. */
export function toGgufPreviewData(raw: {
  metadata: Record<string, unknown>
  tensorInfos: {
    name: string
    shape: bigint[] | number[]
    type: number
  }[]
}): GgufPreviewData {
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw.metadata)) {
    metadata[key] = stringifyMeta(value)
  }
  const tensors = raw.tensorInfos.map((t) => ({
    name: t.name,
    dtype: ggmlTypeName(t.type),
    shape: t.shape.map((d) => Number(d))
  }))
  return { metadata, tensors }
}
