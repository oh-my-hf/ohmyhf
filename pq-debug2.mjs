import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

const url = 'https://huggingface.co/Hoga2/Parquetggg/resolve/main/images.parquet'
const byteLength = 18605480

// Mimic MY main-process fetchFileRange: Range bytes=start-end inclusive, 206 -> arrayBuffer
async function fetchFileRange(start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' } })
  if (res.status !== 206 && res.status !== 200) throw new Error('status ' + res.status)
  const ab = await res.arrayBuffer()
  const u8 = new Uint8Array(ab)
  return { status: res.status, u8 }
}

// Mimic MY renderer makeAsyncBuffer.slice (exclusive end)
const calls = []
const myFile = {
  byteLength,
  async slice(start, end) {
    const s = Math.max(0, start < 0 ? byteLength + start : start)
    const e = Math.min(byteLength, end === undefined ? byteLength : end < 0 ? byteLength + end : end)
    if (e <= s) return new ArrayBuffer(0)
    const { status, u8 } = await fetchFileRange(s, e - 1)
    calls.push({ reqStart: start, reqEnd: end, s, e, want: e - s, got: u8.byteLength, status })
    const out = new ArrayBuffer(u8.byteLength)
    new Uint8Array(out).set(u8)
    return out
  }
}

const metadata = await parquetMetadataAsync(myFile)
console.log('metadata OK, num_rows', Number(metadata.num_rows))
try {
  const rows = await parquetReadObjects({ file: myFile, metadata, compressors, rowStart: 0, rowEnd: 3 })
  console.log('ROWS OK via my slice:', rows.length)
} catch (e) {
  console.log('ROWS FAILED via my slice:', e.constructor.name, '-', e.message)
}
console.log('\n--- slice calls (want vs got, status) ---')
for (const c of calls) {
  const bad = c.want !== c.got ? '  <<< LENGTH MISMATCH' : (c.status === 200 ? '  <<< 200!' : '')
  console.log(`slice(${c.reqStart}, ${c.reqEnd}) -> bytes=${c.s}-${c.e-1} want=${c.want} got=${c.got} [${c.status}]${bad}`)
}
