import { describe, expect, it } from 'vitest'
import {
  codeLanguageOf,
  fileKindOf,
  mimeForPreview,
  normalizeShikiLanguage,
  SHIKI_LANGUAGE_IDS
} from './file-kinds'

describe('fileKindOf', () => {
  it('classifies markdown, images, and special formats', () => {
    expect(fileKindOf('README.md')).toBe('markdown')
    expect(fileKindOf('card.mdx')).toBe('markdown')
    expect(fileKindOf('logo.png')).toBe('image')
    expect(fileKindOf('model.safetensors')).toBe('safetensors')
    expect(fileKindOf('demo.ipynb')).toBe('notebook')
    expect(fileKindOf('train.parquet')).toBe('parquet')
  })

  it('classifies new media and document kinds', () => {
    expect(fileKindOf('clip.wav')).toBe('audio')
    expect(fileKindOf('talk.mp3')).toBe('audio')
    expect(fileKindOf('demo.mp4')).toBe('video')
    expect(fileKindOf('paper.pdf')).toBe('pdf')
    expect(fileKindOf('data.csv')).toBe('csv')
    expect(fileKindOf('data.tsv')).toBe('csv')
    expect(fileKindOf('batch.arrow')).toBe('arrow')
    expect(fileKindOf('table.feather')).toBe('arrow')
    expect(fileKindOf('model.gguf')).toBe('gguf')
    expect(fileKindOf('graph.onnx')).toBe('onnx')
  })

  it('treats expanded text extensions and basenames as text', () => {
    expect(fileKindOf('script.r')).toBe('text')
    expect(fileKindOf('main.jl')).toBe('text')
    expect(fileKindOf('App.vue')).toBe('text')
    expect(fileKindOf('schema.graphql')).toBe('text')
    expect(fileKindOf('main.tf')).toBe('text')
    expect(fileKindOf('COPYING')).toBe('text')
    expect(fileKindOf('Gemfile')).toBe('text')
    expect(fileKindOf('CMakeLists.txt')).toBe('text')
    expect(fileKindOf('src/utils.py')).toBe('text')
    expect(fileKindOf('.env.local')).toBe('text')
    expect(fileKindOf('build.ps1')).toBe('text')
    expect(fileKindOf('Program.cs')).toBe('text')
  })

  it('falls back to binary for unknown extensions', () => {
    expect(fileKindOf('weights.bin')).toBe('binary')
    expect(fileKindOf('model.pt')).toBe('binary')
  })
})

describe('codeLanguageOf', () => {
  it('maps common and expanded extensions to Shiki ids', () => {
    expect(codeLanguageOf('a.py')).toBe('python')
    expect(codeLanguageOf('a.r')).toBe('r')
    expect(codeLanguageOf('a.jl')).toBe('julia')
    expect(codeLanguageOf('a.vue')).toBe('vue')
    expect(codeLanguageOf('a.graphql')).toBe('graphql')
    expect(codeLanguageOf('a.tf')).toBe('hcl')
    expect(codeLanguageOf('a.ex')).toBe('elixir')
    expect(codeLanguageOf('Dockerfile')).toBe('docker')
    expect(codeLanguageOf('Gemfile')).toBe('ruby')
    expect(codeLanguageOf('CMakeLists.txt')).toBe('cmake')
    expect(codeLanguageOf('build.bat')).toBe('batch')
    expect(codeLanguageOf('build.ps1')).toBe('powershell')
    expect(codeLanguageOf('service.log')).toBe('log')
    expect(codeLanguageOf('.env.production')).toBe('dotenv')
    expect(codeLanguageOf('shell.nu')).toBe('nushell')
    expect(codeLanguageOf('Program.cs')).toBe('csharp')
    expect(codeLanguageOf('AppDelegate.m')).toBe('objective-c')
  })

  it('returns undefined for plain text without a language', () => {
    expect(codeLanguageOf('notes.txt')).toBeUndefined()
    expect(codeLanguageOf('LICENSE')).toBeUndefined()
    expect(codeLanguageOf('.dockerignore')).toBeUndefined()
  })
})

describe('normalizeShikiLanguage', () => {
  it('normalizes Markdown and notebook aliases with punctuation', () => {
    expect(normalizeShikiLanguage('python3')).toBe('python')
    expect(normalizeShikiLanguage('IPython')).toBe('python')
    expect(normalizeShikiLanguage('C++')).toBe('cpp')
    expect(normalizeShikiLanguage('c#')).toBe('csharp')
    expect(normalizeShikiLanguage('objective-c')).toBe('objective-c')
    expect(normalizeShikiLanguage('shell-session')).toBe('shellsession')
    expect(normalizeShikiLanguage('language-TS')).toBe('typescript')
  })

  it('rejects unknown and explicit plain-text languages', () => {
    expect(normalizeShikiLanguage('brainfuck-custom')).toBeUndefined()
    expect(normalizeShikiLanguage('text')).toBeUndefined()
    expect(normalizeShikiLanguage(undefined)).toBeUndefined()
  })

  it('keeps every declared language unique', () => {
    expect(new Set(SHIKI_LANGUAGE_IDS).size).toBe(SHIKI_LANGUAGE_IDS.length)
  })
})

describe('mimeForPreview', () => {
  it('prefers a concrete Content-Type from the Hub', () => {
    expect(mimeForPreview('x.wav', 'audio/wav; charset=binary')).toBe('audio/wav')
    expect(mimeForPreview('x.bin', 'application/pdf')).toBe('application/pdf')
  })

  it('falls back by extension when Content-Type is missing or generic', () => {
    expect(mimeForPreview('clip.mp3', null)).toBe('audio/mpeg')
    expect(mimeForPreview('demo.mp4', 'application/octet-stream')).toBe('video/mp4')
    expect(mimeForPreview('paper.pdf', 'binary/octet-stream')).toBe('application/pdf')
    expect(mimeForPreview('unknown.xyz', 'application/octet-stream')).toBeNull()
  })
})
