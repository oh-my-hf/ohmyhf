# Security Policy

## Supported versions

Security fixes are provided for the latest published version of Oh My HuggingFace. Please update to
the newest release before reporting an issue that may already be resolved.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting feature on this repository's **Security** tab. Include the affected version, operating
system, reproduction steps, impact, and any suggested mitigation.

We aim to acknowledge a report within five business days. We will coordinate validation, a fix, and
disclosure timing with the reporter. Please avoid accessing data that is not yours, disrupting Hub
services, or publishing details before a fix is available.

## Release security controls

CI audits production dependencies for high and critical advisories and runs CodeQL. Release jobs
build all platforms with publishing disabled, smoke-test packaged applications, and verify updater
manifests and SHA-512 hashes before the only write-enabled job can create a tag or GitHub Release.
