# Code signing & notarization (follow-up)

Current releases are **unsigned** on every platform. This document tracks what is needed to sign
them properly.

## macOS

Unsigned apps trigger Gatekeeper ("app is damaged / unidentified developer"). Users can bypass it:

```sh
xattr -dr com.apple.quarantine "/Applications/Oh My HuggingFace.app"
```

or right-click the app → **Open** → **Open**.

To sign + notarize for real:

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Export the certificate as `.p12` and add repository secrets `CSC_LINK` (base64) and
   `CSC_KEY_PASSWORD`.
3. Create an App Store Connect API key for notarization; add `APPLE_API_KEY`,
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` secrets.
4. In `apps/desktop/electron-builder.yml` remove `identity: null`, add
   `hardenedRuntime: true`, `gatekeeperAssess: false`, and a `notarize: true` block.
5. Remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from `.github/workflows/release.yml`.

## Windows

Unsigned installers show a SmartScreen warning. Options: an OV/EV code-signing certificate
(set `CSC_LINK`/`CSC_KEY_PASSWORD` for the Windows job) or Azure Trusted Signing
(`azureSignOptions` in electron-builder).

## Linux

AppImage/deb do not require signatures. Optionally publish a GPG-signed checksum file alongside
releases.
