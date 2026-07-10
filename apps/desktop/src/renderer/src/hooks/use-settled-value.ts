import { useEffect, useRef, useState } from 'react'

/**
 * Trailing debounce that skips the delay for isolated changes: a value whose
 * previous change was more than `delayMs` ago propagates on the next tick
 * (a deliberate click feels instant), while rapid bursts (j/k navigation)
 * settle once, `delayMs` after the last change.
 */
export function useSettledValue<T>(value: T, delayMs = 200): T {
  const [settled, setSettled] = useState(value)
  const lastChangeAt = useRef(0)

  useEffect(() => {
    if (Object.is(settled, value)) return undefined
    const now = Date.now()
    const inBurst = now - lastChangeAt.current < delayMs
    lastChangeAt.current = now
    const timer = setTimeout(() => setSettled(value), inBurst ? delayMs : 0)
    return () => clearTimeout(timer)
  }, [value, settled, delayMs])

  return settled
}
