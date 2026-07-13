import { createHighlighterCore, type HighlighterCore, type LanguageInput } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import type { ShikiLanguage } from './file-kinds'

type LanguageLoader = () => Promise<LanguageInput>

/**
 * Fine-grained grammar imports keep the renderer bundle deterministic and,
 * unlike the top-level `shiki` bundle, never pull in the Oniguruma WASM engine.
 * `satisfies` makes additions to ShikiLanguage fail type-checking until a real
 * grammar loader is added here.
 */
const LANGUAGE_LOADERS = {
  astro: () => import('@shikijs/langs/astro').then((module) => module.default),
  bash: () => import('@shikijs/langs/bash').then((module) => module.default),
  batch: () => import('@shikijs/langs/batch').then((module) => module.default),
  bibtex: () => import('@shikijs/langs/bibtex').then((module) => module.default),
  c: () => import('@shikijs/langs/c').then((module) => module.default),
  clojure: () => import('@shikijs/langs/clojure').then((module) => module.default),
  cmake: () => import('@shikijs/langs/cmake').then((module) => module.default),
  cpp: () => import('@shikijs/langs/cpp').then((module) => module.default),
  csharp: () => import('@shikijs/langs/csharp').then((module) => module.default),
  css: () => import('@shikijs/langs/css').then((module) => module.default),
  dart: () => import('@shikijs/langs/dart').then((module) => module.default),
  diff: () => import('@shikijs/langs/diff').then((module) => module.default),
  docker: () => import('@shikijs/langs/docker').then((module) => module.default),
  dotenv: () => import('@shikijs/langs/dotenv').then((module) => module.default),
  elixir: () => import('@shikijs/langs/elixir').then((module) => module.default),
  fish: () => import('@shikijs/langs/fish').then((module) => module.default),
  fsharp: () => import('@shikijs/langs/fsharp').then((module) => module.default),
  go: () => import('@shikijs/langs/go').then((module) => module.default),
  graphql: () => import('@shikijs/langs/graphql').then((module) => module.default),
  groovy: () => import('@shikijs/langs/groovy').then((module) => module.default),
  handlebars: () => import('@shikijs/langs/handlebars').then((module) => module.default),
  haskell: () => import('@shikijs/langs/haskell').then((module) => module.default),
  hcl: () => import('@shikijs/langs/hcl').then((module) => module.default),
  html: () => import('@shikijs/langs/html').then((module) => module.default),
  ini: () => import('@shikijs/langs/ini').then((module) => module.default),
  java: () => import('@shikijs/langs/java').then((module) => module.default),
  javascript: () => import('@shikijs/langs/javascript').then((module) => module.default),
  jinja: () => import('@shikijs/langs/jinja').then((module) => module.default),
  json: () => import('@shikijs/langs/json').then((module) => module.default),
  jsx: () => import('@shikijs/langs/jsx').then((module) => module.default),
  julia: () => import('@shikijs/langs/julia').then((module) => module.default),
  kotlin: () => import('@shikijs/langs/kotlin').then((module) => module.default),
  latex: () => import('@shikijs/langs/latex').then((module) => module.default),
  log: () => import('@shikijs/langs/log').then((module) => module.default),
  lua: () => import('@shikijs/langs/lua').then((module) => module.default),
  make: () => import('@shikijs/langs/make').then((module) => module.default),
  markdown: () => import('@shikijs/langs/markdown').then((module) => module.default),
  nim: () => import('@shikijs/langs/nim').then((module) => module.default),
  nix: () => import('@shikijs/langs/nix').then((module) => module.default),
  nushell: () => import('@shikijs/langs/nushell').then((module) => module.default),
  'objective-c': () => import('@shikijs/langs/objective-c').then((module) => module.default),
  ocaml: () => import('@shikijs/langs/ocaml').then((module) => module.default),
  perl: () => import('@shikijs/langs/perl').then((module) => module.default),
  php: () => import('@shikijs/langs/php').then((module) => module.default),
  powershell: () => import('@shikijs/langs/powershell').then((module) => module.default),
  properties: () => import('@shikijs/langs/properties').then((module) => module.default),
  proto: () => import('@shikijs/langs/proto').then((module) => module.default),
  python: () => import('@shikijs/langs/python').then((module) => module.default),
  r: () => import('@shikijs/langs/r').then((module) => module.default),
  rst: () => import('@shikijs/langs/rst').then((module) => module.default),
  ruby: () => import('@shikijs/langs/ruby').then((module) => module.default),
  rust: () => import('@shikijs/langs/rust').then((module) => module.default),
  scala: () => import('@shikijs/langs/scala').then((module) => module.default),
  shellsession: () => import('@shikijs/langs/shellsession').then((module) => module.default),
  sql: () => import('@shikijs/langs/sql').then((module) => module.default),
  svelte: () => import('@shikijs/langs/svelte').then((module) => module.default),
  swift: () => import('@shikijs/langs/swift').then((module) => module.default),
  toml: () => import('@shikijs/langs/toml').then((module) => module.default),
  tsx: () => import('@shikijs/langs/tsx').then((module) => module.default),
  typescript: () => import('@shikijs/langs/typescript').then((module) => module.default),
  vue: () => import('@shikijs/langs/vue').then((module) => module.default),
  xml: () => import('@shikijs/langs/xml').then((module) => module.default),
  yaml: () => import('@shikijs/langs/yaml').then((module) => module.default),
  zig: () => import('@shikijs/langs/zig').then((module) => module.default)
} satisfies Record<ShikiLanguage, LanguageLoader>

let highlighterPromise: Promise<HighlighterCore> | undefined
let languageLoadQueue: Promise<void> = Promise.resolve()
const languageLoads = new Map<ShikiLanguage, Promise<void>>()

async function createJavaScriptHighlighter(): Promise<HighlighterCore> {
  const [light, dark] = await Promise.all([
    import('@shikijs/themes/github-light').then((module) => module.default),
    import('@shikijs/themes/github-dark-dimmed').then((module) => module.default)
  ])
  return createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [],
    themes: [light, dark]
  })
}

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createJavaScriptHighlighter().catch((error: unknown) => {
      // A transient chunk-load failure must not poison every future retry.
      highlighterPromise = undefined
      throw error
    })
  }
  return highlighterPromise
}

/** Load one grammar once. The queue avoids concurrent embedded-grammar writes. */
export function loadHighlightLanguage(language: ShikiLanguage): Promise<void> {
  const existing = languageLoads.get(language)
  if (existing) return existing

  const load = languageLoadQueue
    .then(async () => {
      const highlighter = await getHighlighter()
      if (highlighter.getLoadedLanguages().includes(language)) return
      await highlighter.loadLanguage(await LANGUAGE_LOADERS[language]())
    })
    .catch((error: unknown) => {
      languageLoads.delete(language)
      throw error
    })

  languageLoads.set(language, load)
  languageLoadQueue = load.catch(() => undefined)
  return load
}

/** Generate one token tree with both themes; theme switches are CSS-only. */
export async function highlightCode(code: string, language: ShikiLanguage): Promise<string> {
  await loadHighlightLanguage(language)
  const highlighter = await getHighlighter()
  return highlighter.codeToHtml(code, {
    lang: language,
    themes: {
      light: 'github-light',
      dark: 'github-dark-dimmed'
    },
    defaultColor: 'light'
  })
}
