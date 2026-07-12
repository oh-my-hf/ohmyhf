import type { RepoKind } from '@oh-my-huggingface/shared'

/** How a repo file should be previewed in the renderer. */
export type FileKind =
  'markdown' | 'text' | 'image' | 'safetensors' | 'notebook' | 'parquet' | 'binary'

/** Hub URL path prefix per repo kind (models live at the root). */
export const RESOLVE_PREFIX: Record<RepoKind, string> = {
  model: '',
  dataset: 'datasets/',
  space: 'spaces/'
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico', 'bmp'])

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
  'csv',
  'tsv',
  'cfg',
  'ini',
  'conf',
  'toml',
  'sh',
  'bash',
  'zsh',
  'bat',
  'ps1',
  'rs',
  'go',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
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
  'env'
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
  '.gitignore'
])

function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function fileKindOf(path: string): FileKind {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  const ext = extensionOf(path)
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ext === 'safetensors') return 'safetensors'
  if (ext === 'ipynb') return 'notebook'
  if (ext === 'parquet') return 'parquet'
  if (TEXT_EXTENSIONS.has(ext) || TEXT_BASENAMES.has(name)) return 'text'
  return 'binary'
}

/** Shiki language id for syntax highlighting; undefined renders as plain text. */
const CODE_LANGUAGES: Record<string, string> = {
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
  java: 'java',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  lua: 'lua',
  diff: 'diff',
  patch: 'diff',
  proto: 'proto'
}

export function codeLanguageOf(path: string): string | undefined {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  if (name === 'dockerfile') return 'docker'
  if (name === 'makefile') return 'make'
  return CODE_LANGUAGES[extensionOf(path)]
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** Direct https URL to the raw file contents. */
export function resolveUrl(
  kind: RepoKind,
  repoId: string,
  path: string,
  revision = 'main'
): string {
  return `https://huggingface.co/${RESOLVE_PREFIX[kind]}${repoId}/resolve/${revision}/${encodePath(path)}`
}

/** Hub web page for the file (the "blob" view). */
export function hubBlobUrl(
  kind: RepoKind,
  repoId: string,
  path: string,
  revision = 'main'
): string {
  return `https://huggingface.co/${RESOLVE_PREFIX[kind]}${repoId}/blob/${revision}/${encodePath(path)}`
}
