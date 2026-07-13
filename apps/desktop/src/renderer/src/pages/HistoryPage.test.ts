import { describe, expect, it } from 'vitest'
import type { HistoryItem, RepoKind } from '@oh-my-huggingface/shared'
import { filterHistoryItems } from '@/lib/history'

function historyItem(repoId: string, kind: RepoKind): HistoryItem {
  const [author = repoId] = repoId.split('/')
  return {
    repoId,
    kind,
    viewedAt: '2026-07-13T00:00:00.000Z',
    summary: {
      id: repoId,
      kind,
      author,
      name: repoId.split('/').at(-1) ?? repoId,
      likes: 0,
      downloads: 0,
      private: false,
      gated: false,
      tags: []
    }
  }
}

const ITEMS = [
  historyItem('openai/gpt-oss-20b', 'model'),
  historyItem('OpenDataLab/PDFTable', 'dataset'),
  historyItem('acme/python-demo', 'space')
]

describe('filterHistoryItems', () => {
  it('matches repository ids without case sensitivity', () => {
    expect(filterHistoryItems(ITEMS, 'pdfTABLE', 'all').map((item) => item.repoId)).toEqual([
      'OpenDataLab/PDFTable'
    ])
  })

  it('combines repository-id search and kind filters', () => {
    expect(filterHistoryItems(ITEMS, 'pdf', 'dataset').map((item) => item.repoId)).toEqual([
      'OpenDataLab/PDFTable'
    ])
    expect(filterHistoryItems(ITEMS, 'pdf', 'model')).toEqual([])
  })

  it('returns all entries when both filters are empty', () => {
    expect(filterHistoryItems(ITEMS, '  ', 'all')).toEqual(ITEMS)
  })
})
