# Releasing

Releases are driven by a commit on `main`, not by pushing a tag by hand. The
release CI (`.github/workflows/release.yml`) watches every push to `main` and
acts only when the head commit's subject matches:

```
[RELEASE] Vx.y.z
```

(The `V` is optional and case-insensitive; a trailing note is allowed, e.g.
`[RELEASE] V0.2.0 account management`.)

## Cutting a release

1. **Bump the version.** Set the new `version` in `apps/desktop/package.json`.
   It must equal the `x.y.z` in the release commit — CI fails the release if they
   disagree. (electron-builder derives artifact names and the update feed from
   this version.)

2. **Land the release commit.** Commit that version bump — together with whatever
   else ships in the release — with the subject `[RELEASE] Vx.y.z`, and land it so
   that it is the **head commit of `main`**: push directly, fast-forward, or
   **squash-merge** a PR using that subject as the squash title. A standard merge
   commit (`Merge pull request …`) will not trigger the release, because CI reads
   the head commit's subject.

3. **CI does the rest**, in three stages:
   - **prepare** — validates the version against `package.json`, refuses a tag
     that already exists, generates the changelog (every non-merge commit since
     the previous `v*` tag, minus the `[RELEASE]` commit itself), creates the
     `vx.y.z` tag, and drafts a GitHub Release with those notes.
   - **build** — a 3-OS matrix (`macos-latest` → dmg + zip, `windows-latest` →
     nsis, `ubuntu-latest` → AppImage + deb) builds and uploads its artifacts
     (plus the `latest*.yml` update manifests — the macOS `zip` is what lets
     electron-updater apply updates via Squirrel.Mac) to the draft.
     `fail-fast: false`, so one platform failing leaves the others' assets in
     place for inspection.
   - **publish** — only after all three platforms succeed, flips the release from
     draft to published and marks it "latest". A partial build leaves the release
     as a draft; fix and re-run rather than shipping a half-populated release.

## In-app updater contract

Packaged builds check the latest published GitHub Release at startup and expose the same check in
**Settings → About**. Discovery does not download anything: downloading and restart-installing are
separate user actions, and the main process asks for native confirmation before quitting to install.
Development builds do not load the updater.

The app uses the `electron-builder` generated `app-update.yml` and the release's `latest.yml`,
`latest-mac.yml`, or `latest-linux.yml`; it does not call an arbitrary feed URL or compare version
strings in the renderer. Keep each manifest and its artifacts from the same build together so the
SHA-512 metadata remains valid.

macOS automatic installation requires a signed and notarized app. Until the signing work in
[signing.md](signing.md) is complete, the updater provides GitHub Releases as the manual fallback.

## Notes

- The changelog is commit-subject driven, so write clear, releasable commit
  subjects (Conventional Commits `feat:` / `fix:` read well in the notes).
- Re-running: if a release needs to be redone, delete the draft/release and its
  `vx.y.z` tag, then land a new `[RELEASE]` commit (bump the patch version — the
  CI refuses to reuse an existing tag).
- Signing/notarization is still a documented follow-up; see
  [signing.md](signing.md). macOS artifacts are currently unsigned.
- The publish target (`owner`/`repo` in `apps/desktop/electron-builder.yml`) must
  be the repository the workflow runs in — `GITHUB_TOKEN` can only publish there,
  and electron-updater reads the same config to find updates.
