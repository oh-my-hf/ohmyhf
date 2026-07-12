import { describe, expect, it } from 'vitest'
import { mimeForOmhfFile } from './preview-mime'

describe('mimeForOmhfFile', () => {
  it('keeps a concrete Hub Content-Type', () => {
    expect(mimeForOmhfFile('x.wav', 'audio/wav; charset=binary')).toBe('audio/wav')
  })

  it('falls back by extension for missing or generic types', () => {
    expect(mimeForOmhfFile('clip.mp3', null)).toBe('audio/mpeg')
    expect(mimeForOmhfFile('demo.mp4', 'application/octet-stream')).toBe('video/mp4')
    expect(mimeForOmhfFile('paper.pdf', 'binary/octet-stream')).toBe('application/pdf')
    expect(mimeForOmhfFile('unknown.xyz', null)).toBeNull()
  })
})
