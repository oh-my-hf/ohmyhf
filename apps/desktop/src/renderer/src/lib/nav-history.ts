import { useEffect, useSyncExternalStore } from 'react'
import { useLocation, useNavigationType } from 'react-router'

interface NavHistoryState {
  canGoBack: boolean
  canGoForward: boolean
}

// react-router keeps its history index in window.history.state.idx. The
// high-water mark of that index lives outside React (mutated only from
// effects); consumers re-render through the external-store subscription.
let maxIdx = 0
let snapshot: NavHistoryState = { canGoBack: false, canGoForward: false }
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function record(navType: string): void {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  // A PUSH truncates the forward stack; anything else only raises the mark.
  maxIdx = navType === 'PUSH' ? idx : Math.max(maxIdx, idx)
  const next = { canGoBack: idx > 0, canGoForward: idx < maxIdx }
  if (next.canGoBack !== snapshot.canGoBack || next.canGoForward !== snapshot.canGoForward) {
    snapshot = next
    for (const listener of listeners) listener()
  }
}

/** Best-effort back/forward enablement for the TopBar history buttons. */
export function useNavHistory(): NavHistoryState {
  const location = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    record(navType)
  }, [location.key, navType])
  return useSyncExternalStore(subscribe, () => snapshot)
}
