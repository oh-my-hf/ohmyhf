import { describe, expect, it } from 'vitest'
import type { ParsedNotebook } from './notebook'
import { parseNotebook } from './notebook'

const nb = (extra: object): string =>
  JSON.stringify({ nbformat: 4, metadata: { language_info: { name: 'python' } }, ...extra })

/** Parse and assert success, so tests can index cells without null noise. */
function parse(json: string): ParsedNotebook {
  const parsed = parseNotebook(json)
  if (!parsed) throw new Error('expected a notebook')
  return parsed
}

describe('parseNotebook', () => {
  it('returns null for non-JSON and non-notebook JSON', () => {
    expect(parseNotebook('not json')).toBeNull()
    expect(parseNotebook('123')).toBeNull()
    expect(parseNotebook('{"foo":1}')).toBeNull()
    expect(parseNotebook('[]')).toBeNull()
  })

  it('detects the kernel language, falling back to kernelspec', () => {
    expect(parseNotebook(nb({ cells: [] }))?.language).toBe('python')
    const viaKernel = JSON.stringify({ metadata: { kernelspec: { language: 'julia' } }, cells: [] })
    expect(parseNotebook(viaKernel)?.language).toBe('julia')
    expect(parseNotebook('{"cells":[]}')?.language).toBeUndefined()
  })

  it('joins string[] source into one string for markdown and code cells', () => {
    const parsed = parse(
      nb({
        cells: [
          { cell_type: 'markdown', source: ['# Title\n', 'body'] },
          { cell_type: 'code', source: 'print(1)', execution_count: 3, outputs: [] }
        ]
      })
    )
    expect(parsed.cells[0]).toEqual({ type: 'markdown', source: '# Title\nbody' })
    expect(parsed.cells[1]).toMatchObject({ type: 'code', source: 'print(1)', executionCount: 3 })
  })

  it('never-executed code cells carry a null execution count', () => {
    const parsed = parse(nb({ cells: [{ cell_type: 'code', source: 'x=1' }] }))
    expect(parsed.cells[0]?.executionCount).toBeNull()
  })

  it('parses stream outputs and flags stderr', () => {
    const parsed = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [
              { output_type: 'stream', name: 'stdout', text: ['a\n', 'b'] },
              { output_type: 'stream', name: 'stderr', text: 'warn' }
            ]
          }
        ]
      })
    )
    expect(parsed.cells[0]?.outputs).toEqual([
      { kind: 'stream', stream: 'stdout', text: 'a\nb' },
      { kind: 'stream', stream: 'stderr', text: 'warn' }
    ])
  })

  it('prefers an image over the text/plain fallback in a rich output', () => {
    const parsed = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [
              {
                output_type: 'display_data',
                data: { 'text/plain': '<Figure>', 'image/png': 'iVBOR\nw0KG' }
              }
            ]
          }
        ]
      })
    )
    expect(parsed.cells[0]?.outputs?.[0]).toEqual({
      kind: 'image',
      image: { mime: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KG' }
    })
  })

  it('falls back to text/plain then html when no image is present', () => {
    const textOut = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [{ output_type: 'execute_result', data: { 'text/plain': '42' } }]
          }
        ]
      })
    )
    expect(textOut.cells[0]?.outputs?.[0]).toEqual({ kind: 'text', text: '42' })

    const htmlOut = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [{ output_type: 'display_data', data: { 'text/html': '<table></table>' } }]
          }
        ]
      })
    )
    expect(htmlOut.cells[0]?.outputs?.[0]).toEqual({ kind: 'html', html: '<table></table>' })
  })

  it('inlines svg outputs as a utf-8 data uri', () => {
    const parsed = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [{ output_type: 'display_data', data: { 'image/svg+xml': '<svg/>' } }]
          }
        ]
      })
    )
    const out = parsed?.cells[0]?.outputs?.[0]
    expect(out?.kind).toBe('image')
    expect(out?.kind === 'image' && out.image.dataUri).toBe('data:image/svg+xml;utf8,%3Csvg%2F%3E')
  })

  it('strips ANSI codes from error tracebacks', () => {
    const parsed = parse(
      nb({
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [
              {
                output_type: 'error',
                ename: 'ValueError',
                evalue: 'bad',
                traceback: ['[0;31mValueError[0m', 'line two']
              }
            ]
          }
        ]
      })
    )
    expect(parsed.cells[0]?.outputs?.[0]).toEqual({
      kind: 'error',
      errorName: 'ValueError',
      text: 'ValueError\nline two'
    })
  })

  it('drops unknown cell and output types without failing', () => {
    const parsed = parse(
      nb({
        cells: [
          { cell_type: 'heading', source: 'old' },
          {
            cell_type: 'code',
            source: '',
            outputs: [{ output_type: 'update_display_data', data: {} }]
          }
        ]
      })
    )
    expect(parsed.cells).toHaveLength(1)
    expect(parsed.cells[0]?.outputs).toEqual([])
  })
})
