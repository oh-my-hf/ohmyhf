import { describe, expect, it } from 'vitest'
import {
  DIFF_TRUNCATED_MARKER,
  diffTotals,
  displayPath,
  isDiffTruncated,
  parseUnifiedDiff
} from './diff'

const MODIFY = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@ function main()
 const a = 1
-const b = 2
+const b = 3
+const c = 4
 export {}`

const ADDED = `diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world`

const DELETED = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index e69de29..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-hello
-world`

const RENAME_ONLY = `diff --git a/old-name.txt b/new-name.txt
similarity index 100%
rename from old-name.txt
rename to new-name.txt`

const BINARY = `diff --git a/img.png b/img.png
index 1111111..2222222 100644
Binary files a/img.png and b/img.png differ`

describe('parseUnifiedDiff', () => {
  it('returns no files for empty or blank input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('  \n\n')).toEqual([])
  })

  it('parses a single modified file with counts, paths and line kinds', () => {
    const files = parseUnifiedDiff(MODIFY)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.oldPath).toBe('src/app.ts')
    expect(file.newPath).toBe('src/app.ts')
    expect(file.additions).toBe(2)
    expect(file.deletions).toBe(1)
    expect(file.isBinary).toBe(false)
    expect(file.isRename).toBe(false)
    expect(file.hunks).toHaveLength(1)
    const hunk = file.hunks[0]!
    expect(hunk.header).toBe('@@ -1,3 +1,4 @@ function main()')
    expect(hunk.lines.map((l) => l.kind)).toEqual(['context', 'del', 'add', 'add', 'context'])
    expect(hunk.lines.map((l) => l.text)).toEqual([
      'const a = 1',
      'const b = 2',
      'const b = 3',
      'const c = 4',
      'export {}'
    ])
  })

  it('splits multi-file diffs at "diff --git" boundaries', () => {
    const files = parseUnifiedDiff(`${MODIFY}\n${ADDED}\n${DELETED}`)
    expect(files).toHaveLength(3)
    expect(files.map((f) => [f.additions, f.deletions])).toEqual([
      [2, 1],
      [2, 0],
      [0, 2]
    ])
    // Lines from the second file must not leak into the first.
    expect(files[0]!.hunks[0]!.lines).toHaveLength(5)
  })

  it('maps /dev/null to added and deleted files', () => {
    const added = parseUnifiedDiff(ADDED)[0]!
    expect(added.oldPath).toBe('/dev/null')
    expect(added.newPath).toBe('new.txt')
    expect(displayPath(added)).toBe('new.txt')

    const deleted = parseUnifiedDiff(DELETED)[0]!
    expect(deleted.oldPath).toBe('gone.txt')
    expect(deleted.newPath).toBe('/dev/null')
    expect(displayPath(deleted)).toBe('gone.txt')
  })

  it('parses a pure rename with no hunks', () => {
    const files = parseUnifiedDiff(RENAME_ONLY)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.isRename).toBe(true)
    expect(file.oldPath).toBe('old-name.txt')
    expect(file.newPath).toBe('new-name.txt')
    expect(file.hunks).toEqual([])
    expect(file.additions).toBe(0)
    expect(file.deletions).toBe(0)
  })

  it('parses a rename with edits', () => {
    const diff = `diff --git a/lib/a.ts b/lib/b.ts
similarity index 90%
rename from lib/a.ts
rename to lib/b.ts
index 1111111..2222222 100644
--- a/lib/a.ts
+++ b/lib/b.ts
@@ -1,2 +1,2 @@
-export const name = 'a'
+export const name = 'b'
 export {}`
    const file = parseUnifiedDiff(diff)[0]!
    expect(file.isRename).toBe(true)
    expect(file.oldPath).toBe('lib/a.ts')
    expect(file.newPath).toBe('lib/b.ts')
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
  })

  it('flags binary files and keeps their paths', () => {
    const files = parseUnifiedDiff(BINARY)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.isBinary).toBe(true)
    expect(file.oldPath).toBe('img.png')
    expect(file.newPath).toBe('img.png')
    expect(file.hunks).toEqual([])
  })

  it('keeps no-newline markers as meta lines without counting them', () => {
    const diff = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file`
    const file = parseUnifiedDiff(diff)[0]!
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
    expect(file.hunks[0]!.lines.map((l) => l.kind)).toEqual(['del', 'meta', 'add', 'meta'])
    expect(file.hunks[0]!.lines[1]!.text).toBe('\\ No newline at end of file')
  })

  it('handles hunk headers without an explicit count', () => {
    const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new`
    const file = parseUnifiedDiff(diff)[0]!
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
    expect(file.hunks[0]!.lines.map((l) => l.kind)).toEqual(['del', 'add'])
  })

  it('does not misread deleted lines starting with dashes as file headers', () => {
    const diff = `diff --git a/a.md b/a.md
--- a/a.md
+++ b/a.md
@@ -1,2 +1,1 @@
--- not a header
 keep`
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    const lines = files[0]!.hunks[0]!.lines
    expect(lines[0]).toEqual({ kind: 'del', text: '-- not a header' })
    expect(files[0]!.deletions).toBe(1)
  })

  it('survives a truncated tail mid-hunk and ignores the notice line', () => {
    const diff = `diff --git a/big.txt b/big.txt
--- a/big.txt
+++ b/big.txt
@@ -1,10 +1,10 @@
 line1
-line2
+line2 changed
${DIFF_TRUNCATED_MARKER}`
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    const file = files[0]!
    expect(file.hunks[0]!.lines).toHaveLength(3)
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
  })

  it('parses git headers with spaces in the path', () => {
    const diff = `diff --git a/my file.txt b/my file.txt
--- a/my file.txt
+++ b/my file.txt
@@ -1 +1 @@
-x
+y`
    const file = parseUnifiedDiff(diff)[0]!
    expect(file.oldPath).toBe('my file.txt')
    expect(file.newPath).toBe('my file.txt')
  })

  it('treats blank lines inside a hunk as empty context', () => {
    const diff = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 top

-x
+y`
    const lines = parseUnifiedDiff(diff)[0]!.hunks[0]!.lines
    expect(lines.map((l) => l.kind)).toEqual(['context', 'context', 'del', 'add'])
    expect(lines[1]!.text).toBe('')
  })
})

describe('diffTotals', () => {
  it('sums additions and deletions across files', () => {
    const files = parseUnifiedDiff(`${MODIFY}\n${ADDED}\n${DELETED}`)
    expect(diffTotals(files)).toEqual({ additions: 4, deletions: 3 })
  })

  it('returns zeros for no files', () => {
    expect(diffTotals([])).toEqual({ additions: 0, deletions: 0 })
  })
})

describe('isDiffTruncated', () => {
  it('detects the marker with or without trailing whitespace', () => {
    expect(isDiffTruncated(`${MODIFY}\n${DIFF_TRUNCATED_MARKER}`)).toBe(true)
    expect(isDiffTruncated(`${MODIFY}\n${DIFF_TRUNCATED_MARKER}\n`)).toBe(true)
    expect(isDiffTruncated(MODIFY)).toBe(false)
    expect(isDiffTruncated('')).toBe(false)
  })
})
