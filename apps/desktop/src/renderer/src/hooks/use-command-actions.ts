import { useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { create } from 'zustand'

export interface CommandAction {
  id: string
  label: string
  icon?: LucideIcon
  disabled?: boolean
  run: () => void | Promise<void>
}

interface CommandActionState {
  scopes: Map<string, CommandAction[]>
  setScope: (scope: string, actions: CommandAction[]) => void
  clearScope: (scope: string) => void
}

export const useCommandActionStore = create<CommandActionState>((set) => ({
  scopes: new Map(),
  setScope: (scope, actions) =>
    set((state) => {
      const scopes = new Map(state.scopes)
      scopes.set(scope, actions)
      return { scopes }
    }),
  clearScope: (scope) =>
    set((state) => {
      const scopes = new Map(state.scopes)
      scopes.delete(scope)
      return { scopes }
    })
}))

/** Register commands owned by the currently mounted page/component. */
export function useCommandActions(scope: string, actions: CommandAction[]): void {
  const setScope = useCommandActionStore((state) => state.setScope)
  const clearScope = useCommandActionStore((state) => state.clearScope)
  useEffect(() => {
    setScope(scope, actions)
    return () => clearScope(scope)
  }, [actions, clearScope, scope, setScope])
}
