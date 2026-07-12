# Code signing & notarization

macOS releases are signed with a **stable self-signed certificate** (CN `OhMyHF-Release`) so
Squirrel.Mac accepts auto-updates; local macOS builds stay **ad-hoc** (`identity: '-'`).
Windows and Linux remain unsigned. This document explains the current scheme and tracks what
is needed for real Developer ID signing + notarization.

Until Developer ID signing is configured, in-app installation trusts the GitHub repository and
release credentials as the update root: the downloaded artifact must match the SHA-512 value in
the release manifest, but that manifest is not an independent publisher signature. On macOS,
Squirrel.Mac additionally requires updates to embed the same `OhMyHF-Release` certificate as the
installed app, which pins updates to holders of the CI signing secrets. Installation still
requires both the renderer action and a native main-process confirmation.

## macOS

### Current: self-signed releases, ad-hoc local builds

Squirrel.Mac does **not** literally require Developer ID: before installing an update it checks
that the downloaded app satisfies the *designated requirement* (DR) of the running app. What kind
of DR you get depends on the signature:

- **ad-hoc** (`identity: '-'`) → DR is `cdhash H"…"`, unique per build → validation can never
  pass, so ad-hoc apps cannot auto-update.
- **any real certificate** → DR is `identifier "dev.oh-my-huggingface.desktop" and
  certificate root = H"<hash of the certificate>"` → stable across versions as long as every
  release is signed with the **same certificate**. Evaluating this DR on the user's machine
  hashes the embedded certificate; it does not require the certificate to be trusted there.

So releases are signed with a self-signed code-signing certificate (CN `OhMyHF-Release`,
generated once, valid until 2036). Release N validates release N+1 because both embed the same
certificate. The private key lives in `~/.ohmyhf-signing/` on the maintainer machine (**keep a
backup** — losing it means one manual-update transition for every user) and as the repo secrets
`MAC_CSC_LINK` (base64 `.p12`) / `MAC_CSC_KEY_PASSWORD`.

How the pieces fit:

- `apps/desktop/package.json` → `build:mac:release` overrides the identity with
  `-c.mac.identity=OhMyHF-Release`; plain `build:mac` keeps ad-hoc for local builds.
- `.github/workflows/release.yml` imports the `.p12` into a throwaway keychain and runs
  `sudo security add-trusted-cert -d` — electron-builder only accepts identities that
  `security find-identity -v -p codesigning` lists as *valid*, which requires trust on the
  **build machine** (runners have passwordless sudo). End users never need this.
- `mac.forceCodeSigning: true` in `electron-builder.yml` fails the release build instead of
  silently shipping an unsigned (broken-seal) app if the secrets are missing.
- `macAutoInstallEnabled` in `apps/desktop/src/main/index.ts` is `true`: macOS downloads and
  installs updates in-app like the other platforms.

Constraints of this scheme:

- **Certificate rotation is a breaking change.** A new certificate has a new hash, so the DR of
  installed apps no longer matches — every user must install the next release manually once.
  The same applies to the upgrade to Developer ID later, and to users on releases from before
  the first self-signed build (they see the manual-install fallback for one version).
- The self-signed certificate is **not** notarized and **not** trusted by Gatekeeper. First
  launch after a browser download may still need:

  ```sh
  xattr -dr com.apple.quarantine "/Applications/Oh My HuggingFace.app"
  ```

  or right-click the app → **Open** → **Open**. Auto-updates are unaffected: Squirrel.Mac
  installs without re-triggering quarantine.

### Follow-up: Developer ID + notarization

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Export the certificate as `.p12` and add repository secrets `CSC_LINK` (base64) and
   `CSC_KEY_PASSWORD`.
3. Create an App Store Connect API key for notarization; add `APPLE_API_KEY`,
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` secrets.
4. In `apps/desktop/package.json` replace the `build:mac:release` identity override with the
   Developer ID name (or rely on `CSC_LINK`), keep `hardenedRuntime` / entitlements, and add
   `notarize: true`.
5. Replace the "Import macOS signing certificate" step in `.github/workflows/release.yml` with
   the standard `CSC_LINK` / `CSC_KEY_PASSWORD` flow (Developer ID certificates are Apple-trusted,
   so the manual keychain + `add-trusted-cert` dance is unnecessary).
6. Ship one transition release: apps signed with the self-signed certificate cannot validate a
   Developer ID–signed update, so that hop is a one-time manual install for existing users.

## Windows

Unsigned installers show a SmartScreen warning. Options: an OV/EV code-signing certificate
(set `CSC_LINK`/`CSC_KEY_PASSWORD` for the Windows job) or Azure Trusted Signing
(`azureSignOptions` in electron-builder).

## Linux

AppImage/deb do not require signatures. Optionally publish a GPG-signed checksum file alongside
releases.
