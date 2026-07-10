# Code signing & notarization (follow-up)

macOS releases use an **ad-hoc** signature (`identity: '-'`). Windows and Linux remain unsigned.
This document tracks what is needed for real Developer ID signing + notarization.

Until Developer ID signing is configured, Windows and Linux in-app installation trusts the GitHub
repository and release credentials as the update root: the downloaded artifact must match the
SHA-512 value in the release manifest, but that manifest is not an independent publisher
signature. Installation still requires both the renderer action and a native main-process
confirmation.

## macOS

### Current: ad-hoc signing

`electron-builder.yml` sets `mac.identity: '-'` with Hardened Runtime entitlements under
`apps/desktop/build/entitlements.mac.plist`. That re-signs the app and nested Electron frameworks
so Gatekeeper no longer reports a **damaged** (invalid) signature.

Ad-hoc is **not** notarized and is **not** trusted for distribution. First launch after a browser
download may still need:

```sh
xattr -dr com.apple.quarantine "/Applications/Oh My HuggingFace.app"
```

or right-click the app → **Open** → **Open**.

Squirrel.Mac also requires Developer ID–signed current and replacement apps for automatic updates.
The in-app updater can check GitHub Releases before notarization is configured, but automatic
macOS installation must stay unavailable and the user should install the release manually.

### Follow-up: Developer ID + notarization

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Export the certificate as `.p12` and add repository secrets `CSC_LINK` (base64) and
   `CSC_KEY_PASSWORD`.
3. Create an App Store Connect API key for notarization; add `APPLE_API_KEY`,
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` secrets.
4. In `apps/desktop/electron-builder.yml` replace `identity: '-'` with the Developer ID name (or
   rely on `CSC_LINK`), keep `hardenedRuntime` / entitlements, and add `notarize: true`.
5. Remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from `.github/workflows/release.yml`.
6. After a signed update has been verified end to end, set `macAutoInstallEnabled` to `true` in
   `apps/desktop/src/main/index.ts`; until then macOS intentionally stays on the manual fallback.

## Windows

Unsigned installers show a SmartScreen warning. Options: an OV/EV code-signing certificate
(set `CSC_LINK`/`CSC_KEY_PASSWORD` for the Windows job) or Azure Trusted Signing
(`azureSignOptions` in electron-builder).

## Linux

AppImage/deb do not require signatures. Optionally publish a GPG-signed checksum file alongside
releases.
