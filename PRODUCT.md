# Product

## Register

product

## Users

ML engineers, researchers, and local-AI hobbyists who live on the Hugging Face Hub: they browse
models/datasets/spaces daily, download large model weights to run locally (llama.cpp, Ollama,
ComfyUI, transformers), and follow orgs/papers to keep up. They are keyboard-fluent, tool-savvy
(Linear, Raycast, VS Code), and often on flaky or metered connections where resumable, rate-limited
downloads matter. They value privacy: everything stays on their machine.

## Product Purpose

Oh My HuggingFace is an unofficial, open-source, cross-platform desktop client for the Hugging Face
Hub. It does what the website cannot: a resumable, parallel, checksummed download manager that
writes into the standard HF cache (interoperable with transformers/CLI), local cache visualization
and cleanup, system notifications for follows and daily papers, and export into the local AI
toolchain (Ollama, LM Studio, ComfyUI). Success: a user manages their entire Hub workflow — browse,
auth, download, clean, follow — without opening a browser, and trusts the app with their token.

It is NOT affiliated with or endorsed by Hugging Face, Inc. "Hugging Face" appears only as a
referential nod to the service it connects to. No 🤗 emoji, no HF logos, nothing that implies
official status.

## Brand Personality

Precise, fast, trustworthy. A precision instrument for model hunters: clinical neutral surfaces,
one crimson signal for what matters. The tool disappears into the task; density and keyboard-first
flow over decoration.

## Anti-references

- Anything that looks like huggingface.co itself (yellow/orange palette, 🤗 iconography, rounded
  playful branding) — legally and ethically off-limits.
- Electron-app slop: web page in a frame, spinner-centric loading, mouse-only interaction.
- SaaS dashboard clichés: hero metrics, gradient accents, identical card grids.

## Design Principles

1. **Keyboard-first, always.** Every browse/filter/download action reachable via Cmd+K or a
   shortcut; mouse is the fallback, not the default.
2. **The list is the app.** Virtualized, instant, dense lists with a live preview pane; no
   navigation dead-ends, no full-page reloads.
3. **Trust through visibility.** Downloads show bytes, hashes, and cache paths; auth shows exactly
   what is stored and where; nothing hidden, nothing phoned home.
4. **Native citizen.** System notifications, native menus, OS conventions per platform, localized
   everywhere (en, zh-CN at launch).
5. **Interoperate, don't silo.** Standard HF cache layout, exports into local tools; the app is an
   entry point to the local AI toolchain, not a walled garden.

## Accessibility & Inclusion

WCAG 2.1 AA. Radix-based components for focus management and ARIA. Full keyboard operability.
Body text ≥ 4.5:1 contrast in both themes. `prefers-reduced-motion` honored (state changes become
instant/crossfade). i18n as a first-class constraint: no hardcoded strings, CJK line-length and
font fallbacks considered from day one.
