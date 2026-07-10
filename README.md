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

![Three-pane browse view: model list with a live detail pane](docs/screenshots/browse.png)

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
- **Export** _(in progress)_ — push GGUFs to Ollama / LM Studio, models to ComfyUI.
- **i18n** — English and 简体中文 built in; adding a language is a single JSON folder.
- **Dark & light themes**, native menus, and OS conventions on every platform.
- **In-app updates** — installed builds compare their version with the latest published GitHub
  Release, then download and restart-install only after explicit confirmation.

## Install

Grab the latest release for your platform from
[GitHub Releases](https://github.com/oh-my-hf/ohmyhf/releases):

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

The app can discover new GitHub Releases from **Settings → About**. macOS requires a signed and
notarized release for automatic installation; while releases remain unsigned, use the GitHub
Releases link in the updater as the fallback.

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

### OAuth

"Sign in with Hugging Face" uses a single, hard-pinned OAuth client ID — the registered
**Oh My HuggingFace** app. It is **not** configurable at runtime: dev and packaged builds all
authenticate against the same app, so the consent screen and the loopback redirect always
match. Contributors do not register their own app; the pinned public ID works for local dev
because the redirect is loopback. (Maintainer only: rotating the app means editing the
`CLIENT_ID` constant in `apps/desktop/src/main/auth.ts`.)

The app requests these scopes: `openid profile read-repos write-repos write-discussions
inference-api read-collections write-collections manage-repos read-billing`. Users who signed
in before a scope was added pick it up by signing out and back in (the UI gates the affected
features until then).

### Security

- **The token** is encrypted with the OS keychain (Electron `safeStorage`) and stored at
  `~/.oh_my_hf/credentials.json` (`0600`), **never plaintext and never in localStorage**. The
  file lives outside the per-profile `userData` directory so every session — packaged app,
  `pnpm dev`, extra profiles — shares one login. `OMH_CREDENTIALS_DIR` relocates it (tests use
  this for isolation). Deleting the file signs you out everywhere.
- **The OAuth client ID is public, not a secret.** With PKCE there is no client secret, and the
  ID necessarily appears in the authorize URL, so it cannot be hidden in a distributed app —
  hiding it would buy no security. The controls that actually matter live on the Hugging Face
  side: keep the OAuth app's **redirect-URI allowlist limited to** `http://127.0.0.1:51789/callback`
  (no wildcards, no extra URIs). That stops a **remote** attacker from redirecting authorization
  codes to an off-host server, and the **consent screen shows the registered app name** so a
  copied ID cannot be rebranded. This is why obscuring the ID is pointless and a tight allowlist
  is not.
- **One residual risk is inherent and cannot be closed client-side.** Because the redirect is a
  loopback URI (RFC 8252), any _other_ app already running on the same machine can reuse the
  public ID, bind its own server to `127.0.0.1:51789`, and open the authorize URL — the user
  then sees the legitimate "Oh My HuggingFace" consent screen and may hand a token to the
  impostor. PKCE does not help (the impostor mints its own verifier). No pinning, obfuscation, or
  allowlist prevents this local-impersonation case; it is the accepted trade-off of a public
  native OAuth client, and the real defense is the user not running untrusted software. The
  allowlist prevents _remote_ exfiltration, not _local_ reuse.
- **No network calls forward the token cross-host**: the `Authorization` header is only sent to
  `huggingface.co` API hosts, never to the CDN/`resolve` redirect targets.

### Releasing

Releases are cut from `main` by a commit whose subject is `[RELEASE] Vx.y.z`. See
[docs/releasing.md](docs/releasing.md) for the full flow; in short: bump the version in
`apps/desktop/package.json`, then land a commit titled e.g. `[RELEASE] V0.2.0`. CI validates
the version, tags `v0.2.0`, drafts a GitHub Release whose notes are the commits since the last
tag, builds macOS/Windows/Linux, uploads the artifacts, and publishes.

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
