import type { IpcEventChannel, IpcEventPayload } from '@oh-my-huggingface/shared'

export type Broadcast = <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => void

export interface ExportDeps {
  cacheDir: string
}

export interface UploadDeps {
  accessToken: string | undefined
  username: string | undefined
  broadcast: Broadcast
}

export interface InferenceDeps {
  accessToken: string | undefined
  broadcast: Broadcast
}
