import { describe, expect, it } from 'vitest'
import { delimiterOf, parseCsvPreview, splitDelimitedLine, splitDelimitedRecords } from './csv'

describe('delimiterOf', () => {
  it('picks tab for .tsv and comma otherwise', () => {
    expect(delimiterOf('data.tsv')).toBe('\t')
    expect(delimiterOf('data.CSV')).toBe(',')
    expect(delimiterOf('data.txt')).toBe(',')
  })
})

describe('splitDelimitedLine', () => {
  it('splits plain and quoted fields', () => {
    expect(splitDelimitedLine('a,b,c', ',')).toEqual(['a', 'b', 'c'])
    expect(splitDelimitedLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd'])
    expect(splitDelimitedLine('a,"b""c",d', ',')).toEqual(['a', 'b"c', 'd'])
    expect(splitDelimitedLine('a\tb\tc', '\t')).toEqual(['a', 'b', 'c'])
  })
})

describe('splitDelimitedRecords', () => {
  it('splits on newlines outside quotes', () => {
    expect(splitDelimitedRecords('a,b\nc,d')).toEqual(['a,b', 'c,d'])
    expect(splitDelimitedRecords('a,"b\nc",d\ne,f')).toEqual(['a,"b\nc",d', 'e,f'])
  })
})

describe('parseCsvPreview', () => {
  it('builds columns and rectangular rows', () => {
    expect(parseCsvPreview('name,age\nalice,30\nbob', ',')).toEqual({
      columns: ['name', 'age'],
      rows: [
        ['alice', '30'],
        ['bob', '']
      ]
    })
  })

  it('returns an empty table for blank input', () => {
    expect(parseCsvPreview('', ',')).toEqual({ columns: [], rows: [] })
  })
})
