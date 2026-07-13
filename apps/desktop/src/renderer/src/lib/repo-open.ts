import { hubRepoUrl, type RepoKind, type RepoOpenTarget } from '@oh-my-huggingface/shared'
import { openExternal } from '@/lib/ipc'

const KIND_PATH: Record<RepoKind, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces'
}

export function repoAppPath(kind: RepoKind, repoId: string): string {
  return `/${KIND_PATH[kind]}/${repoId}`
}

export function repoHubUrl(
  kind: RepoKind,
  repoId: string,
  hubEndpoint: string | null = null
): string {
  return hubRepoUrl(kind, repoId, hubEndpoint)
}

/** Open a repo in-app or in the system browser per settings. */
export function openRepo(
  kind: RepoKind,
  repoId: string,
  target: RepoOpenTarget,
  navigate: (path: string) => void,
  hubEndpoint: string | null = null
): void {
  if (target === 'browser') {
    openExternal(repoHubUrl(kind, repoId, hubEndpoint))
    return
  }
  void navigate(repoAppPath(kind, repoId))
}
