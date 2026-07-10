// Pure unified-diff parser: no DOM, no dependencies, unit-testable under node.

export type DiffLineKind = 'add' | 'del' | 'context' | 'meta'

export interface DiffLine {
  kind: DiffLineKind
  /** Line content without its leading marker; meta lines keep the full text. */
  text: string
}

export interface DiffHunk {
  /** The full "@@ -a,b +c,d @@ trailing context" line as it appeared. */
  header: string
  lines: DiffLine[]
}

export interface DiffFile {
  /** "/dev/null" for added files; "a/" prefix stripped. */
  oldPath: string
  /** "/dev/null" for deleted files; "b/" prefix stripped. */
  newPath: string
  additions: number
  deletions: number
  isBinary: boolean
  isRename: boolean
  hunks: DiffHunk[]
}

export const NULL_PATH = '/dev/null'

/** Marker the diff endpoint appends when the payload was cut short. */
export const DIFF_TRUNCATED_MARKER = '(diff truncated)'

export function isDiffTruncated(diff: string): boolean {
  return diff.trimEnd().endsWith(DIFF_TRUNCATED_MARKER)
}

/** Path to show for a file: prefers the post-change side, falls back for deletions. */
export function displayPath(file: DiffFile): string {
  if (file.newPath !== '' && file.newPath !== NULL_PATH) return file.newPath
  if (file.oldPath !== '' && file.oldPath !== NULL_PATH) return file.oldPath
  return file.newPath !== '' ? file.newPath : file.oldPath
}

export function diffTotals(files: DiffFile[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    additions += file.additions
    deletions += file.deletions
  }
  return { additions, deletions }
}

function stripPathPrefix(raw: string): string {
  let path = raw
  // "diff -u" style headers may carry a tab-separated timestamp.
  const tab = path.indexOf('\t')
  if (tab !== -1) path = path.slice(0, tab)
  if (path.startsWith('"') && path.endsWith('"') && path.length >= 2) path = path.slice(1, -1)
  if (path === NULL_PATH) return path
  if (path.startsWith('a/') || path.startsWith('b/')) return path.slice(2)
  return path
}

function parseGitHeaderPaths(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.slice('diff --git '.length)
  const quoted = /^"(a\/.+)" "(b\/.+)"$/.exec(rest)
  const quotedOld = quoted?.[1]
  const quotedNew = quoted?.[2]
  if (quotedOld !== undefined && quotedNew !== undefined) {
    return { oldPath: stripPathPrefix(quotedOld), newPath: stripPathPrefix(quotedNew) }
  }
  // Unquoted form: split on the last " b/" so paths containing spaces still parse.
  const split = rest.lastIndexOf(' b/')
  if (split === -1) return null
  return {
    oldPath: stripPathPrefix(rest.slice(0, split)),
    newPath: stripPathPrefix(rest.slice(split + 1))
  }
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  if (diff.trim() === '') return files

  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  // Remaining line budget from the current @@ header; keeps "--- " content
  // lines inside a hunk from being misread as a new file header.
  let oldLeft = 0
  let newLeft = 0
  // Whether the current file already consumed a "--- " header line.
  let minusSeen = false

  const startFile = (oldPath: string, newPath: string): DiffFile => {
    const next: DiffFile = {
      oldPath,
      newPath,
      additions: 0,
      deletions: 0,
      isBinary: false,
      isRename: false,
      hunks: []
    }
    files.push(next)
    hunk = null
    oldLeft = 0
    newLeft = 0
    minusSeen = false
    return next
  }

  for (const rawLine of diff.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    if (hunk !== null && file !== null) {
      if (oldLeft > 0 || newLeft > 0) {
        const marker = line.charAt(0)
        if (marker === '\\') {
          hunk.lines.push({ kind: 'meta', text: line })
          continue
        }
        if (marker === '+') {
          hunk.lines.push({ kind: 'add', text: line.slice(1) })
          file.additions += 1
          newLeft -= 1
          continue
        }
        if (marker === '-') {
          hunk.lines.push({ kind: 'del', text: line.slice(1) })
          file.deletions += 1
          oldLeft -= 1
          continue
        }
        if (marker === ' ' || line === '') {
          hunk.lines.push({ kind: 'context', text: line === '' ? '' : line.slice(1) })
          oldLeft -= 1
          newLeft -= 1
          continue
        }
        // Anything else inside an unfinished hunk (e.g. a truncation notice)
        // closes the hunk; the line is re-examined at the top level below.
        hunk = null
        oldLeft = 0
        newLeft = 0
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" may follow the hunk's last counted line.
        hunk.lines.push({ kind: 'meta', text: line })
        continue
      } else {
        hunk = null
      }
    }

    if (line.startsWith('diff --git ')) {
      const paths = parseGitHeaderPaths(line)
      file = startFile(paths?.oldPath ?? '', paths?.newPath ?? '')
      continue
    }

    if (line.startsWith('--- ')) {
      const path = stripPathPrefix(line.slice(4))
      if (file === null || minusSeen || file.isBinary || file.hunks.length > 0) {
        // A bare "--- " after a completed file starts the next one (headerless diffs).
        file = startFile(path, '')
      } else {
        // More authoritative than the "diff --git" guess: catches /dev/null.
        file.oldPath = path
      }
      minusSeen = true
      continue
    }

    if (file !== null && line.startsWith('+++ ')) {
      file.newPath = stripPathPrefix(line.slice(4))
      continue
    }

    const hunkMatch = HUNK_RE.exec(line)
    if (hunkMatch !== null) {
      if (file === null) file = startFile('', '')
      const oldCount = hunkMatch[2]
      const newCount = hunkMatch[4]
      oldLeft = oldCount !== undefined ? Number(oldCount) : 1
      newLeft = newCount !== undefined ? Number(newCount) : 1
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      continue
    }

    if (file !== null && line.startsWith('rename from ')) {
      file.isRename = true
      file.oldPath = line.slice('rename from '.length)
      continue
    }
    if (file !== null && line.startsWith('rename to ')) {
      file.isRename = true
      file.newPath = line.slice('rename to '.length)
      continue
    }

    if (line.startsWith('Binary files ') && line.endsWith(' differ')) {
      const body = line.slice('Binary files '.length, -' differ'.length)
      const split = body.lastIndexOf(' and ')
      const oldPath = split === -1 ? '' : stripPathPrefix(body.slice(0, split))
      const newPath = split === -1 ? '' : stripPathPrefix(body.slice(split + ' and '.length))
      if (file === null) {
        file = startFile(oldPath, newPath)
      } else {
        if (file.oldPath === '' && oldPath !== '') file.oldPath = oldPath
        if (file.newPath === '' && newPath !== '') file.newPath = newPath
      }
      file.isBinary = true
      continue
    }
    if (file !== null && line === 'GIT binary patch') {
      file.isBinary = true
      continue
    }

    // "index ...", mode lines, "similarity index", truncation notices, etc.: ignored.
  }

  return files
}
