import { normalizeHubEndpoint } from '@oh-my-huggingface/shared'
import { useAppStore } from '@/stores/app'

/** Canonical endpoint suffix for every React Query entry backed by the Hub. */
export function useHubEndpointKey(): string {
  return normalizeHubEndpoint(useAppStore((state) => state.settings.hubEndpoint))
}
