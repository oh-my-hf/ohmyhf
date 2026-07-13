import type { HistoryItem, RepoKind } from '@oh-my-huggingface/shared'

export type KindFilter = 'all' | RepoKind

export function filterHistoryItems(
  items: HistoryItem[],
  query: string,
  kind: KindFilter
): HistoryItem[] {
  const needle = query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (needle === '' || item.repoId.toLowerCase().includes(needle))
  )
}
