import { describe, expect, it } from 'vitest'
import { applyFormat, continueLine, mentionAtCaret } from './editor'

describe('mentionAtCaret', () => {
  it('detects @ at line start, after whitespace, and after quote markers', () => {
    expect(mentionAtCaret('@jul', 4)).toEqual({ start: 0, query: 'jul' })
    expect(mentionAtCaret('hi @jul', 7)).toEqual({ start: 3, query: 'jul' })
    expect(mentionAtCaret('> @a', 4)).toEqual({ start: 2, query: 'a' })
    expect(mentionAtCaret('cc (@team', 9)).toEqual({ start: 4, query: 'team' })
  })

  it('supports a bare @ (empty query) and stops at the caret', () => {
    expect(mentionAtCaret('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionAtCaret('@julien rocks', 4)).toEqual({ start: 0, query: 'jul' })
  })

  it('rejects email-like text and mid-word @', () => {
    expect(mentionAtCaret('mail me a@b', 11)).toBeNull()
    expect(mentionAtCaret('foo@bar', 7)).toBeNull()
  })

  it('closes once the mention is finished with a space', () => {
    expect(mentionAtCaret('@julien ', 8)).toBeNull()
  })
})

describe('continueLine', () => {
  it('continues bullets and quotes', () => {
    expect(continueLine('- item', 6)).toEqual({ next: '- item\n- ', selectStart: 9 })
    expect(continueLine('* item', 6)).toEqual({ next: '* item\n* ', selectStart: 9 })
    expect(continueLine('> quoted', 8)).toEqual({ next: '> quoted\n> ', selectStart: 11 })
  })

  it('increments ordered lists', () => {
    expect(continueLine('1. one', 6)).toEqual({ next: '1. one\n2. ', selectStart: 10 })
    expect(continueLine('9. nine', 7)).toEqual({ next: '9. nine\n10. ', selectStart: 12 })
  })

  it('preserves indentation', () => {
    expect(continueLine('  - nested', 10)).toEqual({ next: '  - nested\n  - ', selectStart: 15 })
  })

  it('exits the list when the item is empty', () => {
    expect(continueLine('- one\n- ', 8)).toEqual({ next: '- one\n', selectStart: 6 })
    expect(continueLine('> ', 2)).toEqual({ next: '', selectStart: 0 })
  })

  it('splits mid-line content onto the next item', () => {
    // caret between "ab" and "cd" of "- abcd"
    expect(continueLine('- abcd', 4)).toEqual({ next: '- ab\n- cd', selectStart: 7 })
  })

  it('returns null on plain lines and after a leading newline edge case', () => {
    expect(continueLine('hello', 5)).toBeNull()
    expect(continueLine('\nplain', 6)).toBeNull()
  })
})

describe('applyFormat quote/list on drafts starting with a newline', () => {
  it('does not duplicate the leading newline when caret is at 0', () => {
    const result = applyFormat('\nhello', 0, 0, 'quote')
    expect(result.next).toBe('> \nhello')
  })
})
