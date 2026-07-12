import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
const url = 'https://huggingface.co/Hoga2/Parquetggg/resolve/main/images.parquet'
const byteLength = 18605480
let n = 0
const myFile = {
  byteLength,
  async slice(start, end) {
    const s = Math.max(0, start < 0 ? byteLength + start : start)
    const e = Math.min(byteLength, end === undefined ? byteLength : end < 0 ? byteLength + end : end)
    if (e <= s) return new ArrayBuffer(0)
    const t0 = Date.now()
    const res = await fetch(url, { headers: { Range: `bytes=${s}-${e-1}`, 'Accept-Encoding': 'identity' } })
    const ab = await res.arrayBuffer()
    const u8 = new Uint8Array(ab)
    n++
    console.log(`#${n} slice(${start},${end}) bytes=${s}-${e-1} want=${e-s} got=${u8.byteLength} [${res.status}] ${Date.now()-t0}ms${e-s!==u8.byteLength?' MISMATCH':''}`)
    const out = new ArrayBuffer(u8.byteLength); new Uint8Array(out).set(u8); return out
  }
}
const metadata = await parquetMetadataAsync(myFile)
console.log('meta done, rows', Number(metadata.num_rows), '- now reading 1 row')
try {
  const rows = await parquetReadObjects({ file: myFile, metadata, compressors, rowStart: 0, rowEnd: 1 })
  console.log('ROWS OK:', rows.length, 'total slices:', n)
} catch (e) {
  console.log('ROWS FAILED:', e.constructor.name, '-', e.message, '| total slices:', n)
}
