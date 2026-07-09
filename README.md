# Oh My HuggingFace

> [!IMPORTANT]
> **UNOFFICIAL.** Oh My HuggingFace is an independent, community-built desktop client for the
> Hugging Face Hub. It is **not affiliated with, endorsed by, or sponsored by Hugging Face, Inc.**
> "Hugging Face" is a trademark of Hugging Face, Inc. and is used here only to refer to the
> service this application connects to.

An open-source, cross-platform (macOS / Windows / Linux) desktop client for browsing the Hugging
Face Hub, managing large model downloads, and plugging models into your local AI toolchain.

**Privacy-first: everything stays on your machine.** No telemetry, no analytics, no external
services beyond the Hugging Face API itself. Your access token is encrypted with your OS keychain
(Electron `safeStorage`) and stored in a local SQLite database.

![Screenshot placeholder — three-pane browse view](docs/screenshots/browse.png)

## Features

- **Browse** — Models / Datasets / Spaces / Daily Papers in a three-pane, keyboard-first UI with
  virtualized lists, instant model-card rendering (sanitized Markdown), file trees, and metadata.
- **Search everything** — `Cmd/Ctrl+K` command palette: search, filter (task, library, license),
  and sort (trending / likes / downloads).
- **Sign in with Hugging Face** — OAuth 2.0 + PKCE through your system browser; tokens are
  encrypted at rest, never stored in plaintext, never in `localStorage`.
- **Download manager** — resumable, parallel, queued downloads with speed limiting, SHA-256
  verification, and system notifications. Files land in the **standard HF cache layout**, fully
  interoperable with `transformers`, `huggingface-cli`, and friends.
- **Cache visualizer** — scan your HF cache, see disk usage per repo, and clean stale revisions
  with one click.
- **Follow & inbox** — follow users/orgs/repos and Daily Papers; get system notifications.
- **Compare** — 2–4 models side by side (params, license, downloads, likes).
- **Export** *(in progress)* — push GGUFs to Ollama / LM Studio, models to ComfyUI.
- **i18n** — English and 简体中文 built in; adding a language is a single JSON folder.
- **Dark & light themes**, native menus, and OS conventions on every platform.

## Install

Grab the latest release for your platform from
[GitHub Releases](https://github.com/MoraxCheng/oh-my-huggingface/releases):

- **macOS** — `.dmg`
- **Windows** — `.exe` (NSIS installer)
- **Linux** — `.AppImage` or `.deb`

### macOS: "app is damaged / unidentified developer"

Releases are currently **unsigned** (signing & notarization is a documented follow-up, see
[docs/signing.md](docs/signing.md)). To open an unsigned build:

```sh
xattr -dr com.apple.quarantine "/Applications/Oh My HuggingFace.app"
```

or right-click the app → **Open** → **Open** on first launch.

## Development

Prerequisites: **Node.js ≥ 22**, **pnpm ≥ 11** (`corepack enable`), and a C++ toolchain for
native modules (Xcode CLT on macOS, `build-essential` on Linux, VS Build Tools on Windows).

```sh
pnpm install        # installs deps and rebuilds better-sqlite3 for Electron
pnpm dev            # launches the app with hot reload
pnpm test           # unit tests (vitest)
pnpm typecheck      # strict TS across the workspace
pnpm lint           # ESLint (includes hardcoded-string checks for i18n)
pnpm build          # production build of every package
```

Platform packaging (from `apps/desktop`):

```sh
pnpm --filter oh-my-huggingface-desktop build:linux   # AppImage + deb
pnpm --filter oh-my-huggingface-desktop build:mac     # dmg (unsigned)
pnpm --filter oh-my-huggingface-desktop build:win     # nsis
```

### OAuth client ID

"Sign in with Hugging Face" needs an OAuth app client ID
(create one at *huggingface.co → Settings → Connected Apps → Developer applications* with redirect
URL `http://127.0.0.1:51789/callback`). The build reads it from the `HF_OAUTH_CLIENT_ID`
environment variable and falls back to the project's shared development client ID.

```sh
HF_OAUTH_CLIENT_ID=your-client-id pnpm dev
```

## Architecture

```
packages/shared     @oh-my-huggingface/shared    shared types + typed IPC contract
packages/hub-api    @oh-my-huggingface/hub-api   pure-TS Hub API client (zero Electron deps)
apps/desktop        oh-my-huggingface-desktop    electron-vite app (main / preload / renderer)
```

- The **main process** owns all network, downloads, cache scanning, and polling (via `hub-api`);
  heavy work runs in `worker_threads` off the main thread.
- The **renderer** is view-only React (React Router, Zustand, TanStack Query/Virtual, Tailwind,
  Radix). `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP.
- The whole IPC surface is a **typed contract** in `packages/shared` — no magic strings; every
  handler validates its input.
- Local SQLite (better-sqlite3) stores favorites, history, download tasks, follows, settings, and
  the safeStorage-encrypted token.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Translations are especially welcome — locales live in
`apps/desktop/src/renderer/src/i18n/locales/<lang>/` (renderer) and
`apps/desktop/src/main/i18n/locales/` (native menus & notifications).

## License

[Apache-2.0](LICENSE). Not affiliated with Hugging Face, Inc.
