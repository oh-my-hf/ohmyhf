#!/usr/bin/env bash

set -euo pipefail

VERSION="${1:-}"
COMMIT_SHA="${2:-}"
ASSET_DIR="${3:-}"
ASSET_MANIFEST="${4:-}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release version: $VERSION" >&2
  exit 1
fi
if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid release commit: $COMMIT_SHA" >&2
  exit 1
fi
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

TAG="v$VERSION"
node .github/scripts/release-tools/verify-assets.mjs "$ASSET_MANIFEST" "$ASSET_DIR"

# Parse and validate the complete upload list before creating any remote state.
ASSET_LIST_FILE="$RUNNER_TEMP/ohmyhf-release-assets-$GITHUB_RUN_ID.txt"
node -e '
  const { readFileSync } = require("node:fs")
  const { resolve } = require("node:path")
  const manifest = JSON.parse(readFileSync(resolve(process.argv[1]), "utf8"))
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error("Release asset manifest contains no assets")
  }
  process.stdout.write(`${manifest.assets.map((asset) => asset.name).join("\n")}\n`)
' "$ASSET_MANIFEST" >"$ASSET_LIST_FILE"
mapfile -t ASSET_NAMES <"$ASSET_LIST_FILE"
UPLOAD_PATHS=()
for NAME in "${ASSET_NAMES[@]}"; do
  UPLOAD_PATHS+=("$ASSET_DIR/$NAME")
done

set +e
git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1
TAG_LOOKUP_STATUS=$?
set -e

if [[ "$TAG_LOOKUP_STATUS" -eq 0 ]]; then
  git fetch --force origin "refs/tags/$TAG:refs/tags/$TAG"
  EXISTING_SHA="$(git rev-list -n 1 "$TAG")"
  if [[ "$EXISTING_SHA" != "$COMMIT_SHA" ]]; then
    echo "Tag $TAG already points to $EXISTING_SHA, not $COMMIT_SHA" >&2
    exit 1
  fi
elif [[ "$TAG_LOOKUP_STATUS" -ne 2 ]]; then
  echo "Unable to verify whether tag $TAG already exists" >&2
  exit "$TAG_LOOKUP_STATUS"
fi

REMOTE_DIR="$RUNNER_TEMP/ohmyhf-release-remote-$GITHUB_RUN_ID"
mkdir -p "$REMOTE_DIR"

if RELEASE_JSON="$(gh release view "$TAG" --json isDraft,targetCommitish,url,databaseId 2>/dev/null)"; then
  IS_DRAFT="$(jq -r .isDraft <<<"$RELEASE_JSON")"
  TARGET_COMMITISH="$(jq -r .targetCommitish <<<"$RELEASE_JSON")"
  RELEASE_ID="$(jq -r .databaseId <<<"$RELEASE_JSON")"
  if [[ "$TARGET_COMMITISH" != "$COMMIT_SHA" ]]; then
    echo "Release $TAG targets $TARGET_COMMITISH, not $COMMIT_SHA" >&2
    exit 1
  fi
  if [[ "$IS_DRAFT" != "true" ]]; then
    gh release download "$TAG" --dir "$REMOTE_DIR" --pattern '*'
    node .github/scripts/release-tools/verify-assets.mjs "$ASSET_MANIFEST" "$REMOTE_DIR"
    echo "Release $TAG is already published with the verified asset set."
    exit 0
  fi
else
  PREVIOUS_TAG="$(git describe --tags --abbrev=0 --match 'v*' "$COMMIT_SHA^" 2>/dev/null || true)"
  NOTES_FILE="$RUNNER_TEMP/ohmyhf-release-notes.md"
  {
    echo "## What's changed"
    echo
    if [[ -n "$PREVIOUS_TAG" ]]; then
      RANGE="$PREVIOUS_TAG..$COMMIT_SHA"
    else
      RANGE="$COMMIT_SHA"
    fi
    NOTES="$(git log --no-merges --pretty='- %s (%h)' "$RANGE" | grep -v '^- \[RELEASE\]' || true)"
    if [[ -n "$NOTES" ]]; then
      echo "$NOTES"
    else
      echo "- Maintenance release."
    fi
    if [[ -n "$PREVIOUS_TAG" ]]; then
      echo
      echo "**Full changelog**: https://github.com/$GITHUB_REPOSITORY/compare/$PREVIOUS_TAG...$TAG"
    fi
  } >"$NOTES_FILE"

  gh release create "$TAG" \
    --target "$COMMIT_SHA" \
    --draft \
    --title "$TAG" \
    --notes-file "$NOTES_FILE"
  # A fresh draft's tag is not a resolvable git ref yet (that only happens at
  # publish time below), so it must be looked up by name here — the
  # tag-scoped REST endpoint used for asset listing further down 404s until
  # the ref exists, but `gh release view` resolves drafts by release name.
  RELEASE_ID="$(gh release view "$TAG" --json databaseId | jq -r .databaseId)"
fi

# A failed prior run may have left a draft with stale or partial assets. Replace
# the entire draft asset set so reruns converge on the preflight manifest.
# Addressed by numeric release id, not by tag name: a draft's tag is not a
# resolvable git ref yet, and repos/.../releases/tags/{tag} 404s until it is.
EXISTING_ASSET_IDS_FILE="$RUNNER_TEMP/ohmyhf-release-asset-ids-$GITHUB_RUN_ID.txt"
gh api "repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID/assets" --jq '.[].id' >"$EXISTING_ASSET_IDS_FILE"
while IFS= read -r ASSET_ID; do
  [[ -z "$ASSET_ID" ]] && continue
  if [[ ! "$ASSET_ID" =~ ^[0-9]+$ ]]; then
    echo "GitHub returned an invalid release asset id: $ASSET_ID" >&2
    exit 1
  fi
  gh api --method DELETE "repos/$GITHUB_REPOSITORY/releases/assets/$ASSET_ID"
done <"$EXISTING_ASSET_IDS_FILE"

gh release upload "$TAG" "${UPLOAD_PATHS[@]}"
gh release download "$TAG" --dir "$REMOTE_DIR" --pattern '*'
node .github/scripts/release-tools/verify-assets.mjs "$ASSET_MANIFEST" "$REMOTE_DIR"
if [[ "$TAG_LOOKUP_STATUS" -eq 2 ]]; then
  # Draft releases do not guarantee that the Git ref already exists. Create it
  # only after every local and remote asset check has passed. A concurrent tag
  # creation makes the push fail; the fetch-and-compare below then decides safely.
  set +e
  git push origin "$COMMIT_SHA:refs/tags/$TAG" >/dev/null 2>&1
  TAG_PUSH_STATUS=$?
  set -e
  if [[ "$TAG_PUSH_STATUS" -ne 0 ]]; then
    echo "Tag creation raced or failed; verifying the remote ref before publish."
  fi
fi
git fetch --force origin "refs/tags/$TAG:refs/tags/$TAG"
PUBLISH_SHA="$(git rev-list -n 1 "$TAG")"
if [[ "$PUBLISH_SHA" != "$COMMIT_SHA" ]]; then
  echo "Refusing to publish: tag $TAG moved to $PUBLISH_SHA" >&2
  exit 1
fi
gh release edit "$TAG" --draft=false --latest
echo "Published $TAG after remote asset verification."
