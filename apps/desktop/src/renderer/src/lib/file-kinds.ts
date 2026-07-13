import {
  hubBlobUrl as buildHubBlobUrl,
  hubResolveUrl,
  type RepoKind
} from '@oh-my-huggingface/shared'

/** How a repo file should be previewed in the renderer. */
export type FileKind =
  | 'markdown'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'csv'
  | 'arrow'
  | 'gguf'
  | 'onnx'
  | 'safetensors'
  | 'notebook'
  | 'parquet'
  | 'binary'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico', 'bmp'])

const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac', 'opus'])

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov'])

const CSV_EXTENSIONS = new Set(['csv', 'tsv'])

const ARROW_EXTENSIONS = new Set(['arrow', 'feather'])

const TEXT_EXTENSIONS = new Set([
  'json',
  'jsonl',
  'yaml',
  'yml',
  'txt',
  'text',
  'py',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'cfg',
  'ini',
  'conf',
  'toml',
  'sh',
  'bash',
  'zsh',
  'bat',
  'cmd',
  'ps1',
  'rs',
  'go',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'm',
  'mm',
  'java',
  'rb',
  'swift',
  'kt',
  'lua',
  'sql',
  'xml',
  'html',
  'css',
  'diff',
  'patch',
  'log',
  'proto',
  'gitignore',
  'gitattributes',
  'env',
  'r',
  'rmd',
  'jl',
  'scala',
  'sc',
  'sbt',
  'php',
  'pl',
  'pm',
  'dart',
  'vue',
  'svelte',
  'astro',
  'graphql',
  'gql',
  'tf',
  'hcl',
  'nix',
  'zig',
  'nim',
  'ex',
  'exs',
  'hs',
  'ml',
  'fs',
  'clj',
  'edn',
  'rst',
  'tex',
  'bib',
  'jinja',
  'j2',
  'mustache',
  'hbs',
  'cmake',
  'gradle',
  'properties',
  'plist',
  'lock',
  'editorconfig',
  'dockerignore',
  'npmrc',
  'fish',
  'nu'
])

/** Extensionless files that are conventionally plain text on the Hub. */
const TEXT_BASENAMES = new Set([
  'license',
  'licence',
  'notice',
  'readme',
  'changelog',
  'authors',
  'contributing',
  'makefile',
  'dockerfile',
  'modelcard',
  '.gitattributes',
  '.gitignore',
  'copying',
  'patent',
  'gemfile',
  'procfile',
  'cmakelists.txt'
])

/** MIME fallback when Hub returns missing / generic Content-Type for omhf-file. */
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp'
}

export function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function fileKindOf(path: string): FileKind {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  const ext = extensionOf(path)
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  if (CSV_EXTENSIONS.has(ext)) return 'csv'
  if (ARROW_EXTENSIONS.has(ext)) return 'arrow'
  if (ext === 'gguf') return 'gguf'
  if (ext === 'onnx') return 'onnx'
  if (ext === 'safetensors') return 'safetensors'
  if (ext === 'ipynb') return 'notebook'
  if (ext === 'parquet') return 'parquet'
  if (TEXT_EXTENSIONS.has(ext) || TEXT_BASENAMES.has(name) || name.startsWith('.env.'))
    return 'text'
  return 'binary'
}

/**
 * Best-effort MIME for streaming previews. Prefer a concrete Hub Content-Type;
 * fall back by extension when it is missing or generic.
 */
export function mimeForPreview(
  path: string,
  contentType: string | null | undefined
): string | null {
  const raw = contentType?.split(';')[0]?.trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream' && raw !== 'binary/octet-stream') {
    return raw
  }
  return MIME_BY_EXTENSION[extensionOf(path)] ?? null
}

/**
 * The complete grammar set bundled by the renderer. Keep this list in sync
 * with the explicit dynamic imports in `syntax-highlighting.ts`; the shared
 * union makes a missing loader a type error instead of a runtime fallback.
 */
export const SHIKI_LANGUAGE_IDS = [
  'astro',
  'bash',
  'batch',
  'bibtex',
  'c',
  'clojure',
  'cmake',
  'cpp',
  'csharp',
  'css',
  'dart',
  'diff',
  'docker',
  'dotenv',
  'elixir',
  'fish',
  'fsharp',
  'go',
  'graphql',
  'groovy',
  'handlebars',
  'haskell',
  'hcl',
  'html',
  'ini',
  'java',
  'javascript',
  'jinja',
  'json',
  'jsx',
  'julia',
  'kotlin',
  'latex',
  'log',
  'lua',
  'make',
  'markdown',
  'nim',
  'nix',
  'nushell',
  'objective-c',
  'ocaml',
  'perl',
  'php',
  'powershell',
  'properties',
  'proto',
  'python',
  'r',
  'rst',
  'ruby',
  'rust',
  'scala',
  'shellsession',
  'sql',
  'svelte',
  'swift',
  'toml',
  'tsx',
  'typescript',
  'vue',
  'xml',
  'yaml',
  'zig'
] as const

export type ShikiLanguage = (typeof SHIKI_LANGUAGE_IDS)[number]

const SHIKI_LANGUAGE_SET = new Set<string>(SHIKI_LANGUAGE_IDS)

/** User-, Markdown-, and notebook-facing aliases normalized to bundled IDs. */
const SHIKI_LANGUAGE_ALIASES: Record<string, ShikiLanguage> = {
  'c#': 'csharp',
  'c++': 'cpp',
  'objective-c': 'objective-c',
  'objective-c++': 'objective-c',
  'shell-session': 'shellsession',
  bat: 'batch',
  cplusplus: 'cpp',
  cs: 'csharp',
  cmd: 'batch',
  console: 'shellsession',
  dockerfile: 'docker',
  env: 'dotenv',
  gql: 'graphql',
  ipython: 'python',
  ipython3: 'python',
  js: 'javascript',
  jsonl: 'json',
  jl: 'julia',
  kt: 'kotlin',
  makefile: 'make',
  md: 'markdown',
  node: 'javascript',
  nodejs: 'javascript',
  nu: 'nushell',
  objc: 'objective-c',
  objectivec: 'objective-c',
  ps1: 'powershell',
  py: 'python',
  python3: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash'
}

/**
 * Normalize a file extension, Markdown fence, or notebook kernel language.
 * Unknown and explicit plain-text names return undefined by design.
 */
export function normalizeShikiLanguage(
  language: string | null | undefined
): ShikiLanguage | undefined {
  const raw = language?.trim().toLowerCase()
  if (!raw) return undefined
  const normalized = raw.replace(/^language-/, '')
  if (SHIKI_LANGUAGE_SET.has(normalized)) return normalized as ShikiLanguage
  return SHIKI_LANGUAGE_ALIASES[normalized]
}

/** Shiki language id for syntax highlighting; undefined renders as plain text. */
const CODE_LANGUAGES: Record<string, ShikiLanguage> = {
  json: 'json',
  jsonl: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  nu: 'nushell',
  bat: 'batch',
  cmd: 'batch',
  ps1: 'powershell',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  xml: 'xml',
  html: 'html',
  css: 'css',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  m: 'objective-c',
  mm: 'objective-c',
  java: 'java',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  lua: 'lua',
  diff: 'diff',
  patch: 'diff',
  log: 'log',
  env: 'dotenv',
  proto: 'proto',
  r: 'r',
  rmd: 'markdown',
  jl: 'julia',
  scala: 'scala',
  sc: 'scala',
  sbt: 'scala',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'hcl',
  hcl: 'hcl',
  nix: 'nix',
  zig: 'zig',
  nim: 'nim',
  ex: 'elixir',
  exs: 'elixir',
  hs: 'haskell',
  ml: 'ocaml',
  fs: 'fsharp',
  clj: 'clojure',
  edn: 'clojure',
  rst: 'rst',
  tex: 'latex',
  bib: 'bibtex',
  jinja: 'jinja',
  j2: 'jinja',
  mustache: 'handlebars',
  hbs: 'handlebars',
  cmake: 'cmake',
  gradle: 'groovy',
  properties: 'properties',
  plist: 'xml',
  lock: 'json',
  editorconfig: 'ini',
  npmrc: 'ini'
}

export function codeLanguageOf(path: string): ShikiLanguage | undefined {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  if (name === 'dockerfile') return normalizeShikiLanguage('dockerfile')
  if (name === 'makefile') return normalizeShikiLanguage('makefile')
  if (name === 'gemfile') return normalizeShikiLanguage('ruby')
  if (name === 'cmakelists.txt') return normalizeShikiLanguage('cmake')
  if (name === '.env' || name.startsWith('.env.')) return normalizeShikiLanguage('dotenv')
  return normalizeShikiLanguage(CODE_LANGUAGES[extensionOf(path)])
}

/** Direct https URL to the raw file contents. */
export function resolveUrl(
  kind: RepoKind,
  repoId: string,
  path: string,
  revision = 'main',
  endpoint?: string | null
): string {
  return hubResolveUrl(kind, repoId, revision, path, endpoint)
}

/** Hub web page for the file (the "blob" view). */
export function hubBlobUrl(
  kind: RepoKind,
  repoId: string,
  path: string,
  revision = 'main',
  endpoint?: string | null
): string {
  return buildHubBlobUrl(kind, repoId, revision, path, endpoint)
}
