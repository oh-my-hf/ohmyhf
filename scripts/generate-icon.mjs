#!/usr/bin/env node
/**
 * Generates the placeholder app icon (512×512 PNG): a crimson rounded square with a
 * white download-arrow glyph. Pure Node (zlib + manual PNG encoding) so contributors
 * need no image tooling. Replace build/icon.png with real artwork any time.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 512
// Primary brand color oklch(0.578 0.226 22) ≈ rgb(219, 55, 66)
const BG = [219, 55, 66]
const FG = [255, 250, 250]

function inRoundedSquare(x, y) {
  const margin = 32
  const r = 96
  const min = margin
  const max = SIZE - margin
  if (x < min || x >= max || y < min || y >= max) return false
  const cx = x < min + r ? min + r : x >= max - r ? max - r - 1 : x
  const cy = y < min + r ? min + r : y >= max - r ? max - r - 1 : y
  if (cx === x || cy === y) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function inArrow(x, y) {
  const cx = SIZE / 2
  // Stem
  if (Math.abs(x - cx) <= 34 && y >= 140 && y <= 280) return true
  // Head (triangle)
  if (y >= 280 && y <= 380) {
    const half = 92 * (1 - (y - 280) / 100)
    if (Math.abs(x - cx) <= half) return true
  }
  // Tray
  if (y >= 396 && y <= 420 && Math.abs(x - cx) <= 120) return true
  return false
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1)
  raw[row] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const i = row + 1 + x * 4
    if (!inRoundedSquare(x, y)) {
      raw.writeUInt32BE(0, i) // transparent
    } else {
      const [r, g, b] = inArrow(x, y) ? FG : BG
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = 255
    }
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([len, body, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'apps/desktop/build/icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`icon written: ${out} (${png.length} bytes)`)
