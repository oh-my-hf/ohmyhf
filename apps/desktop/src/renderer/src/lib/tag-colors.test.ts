import { describe, expect, it } from 'vitest'
import { TASKS } from './catalog'
import { TAG_HUE_VAR, taskHue, taskIcon } from './tag-colors'

describe('tag-colors', () => {
  it('assigns every curated task an explicit hue (no orange fallback leaks)', () => {
    for (const task of TASKS) {
      const hue = taskHue(task)
      expect(TAG_HUE_VAR[hue]).toBeDefined()
      // The fallback hue is reserved for unknown tags; curated tasks must be mapped.
      if (hue === 'orange') {
        throw new Error(`curated task "${task}" fell through to the orange fallback`)
      }
    }
  })

  it('assigns every curated task an icon', () => {
    for (const task of TASKS) {
      expect(taskIcon(task)).toBeTypeOf('object')
    }
  })

  it('falls back to orange + generic tag icon for unknown tags', () => {
    expect(taskHue('definitely-not-a-task')).toBe('orange')
    expect(taskIcon('definitely-not-a-task')).toBeTypeOf('object')
  })

  it('keeps the HF signature mapping', () => {
    expect(taskHue('text-generation')).toBe('red')
    expect(taskHue('translation')).toBe('indigo')
    expect(taskHue('image-classification')).toBe('yellow')
    expect(taskHue('automatic-speech-recognition')).toBe('green')
    expect(taskHue('reinforcement-learning')).toBe('purple')
  })
})
