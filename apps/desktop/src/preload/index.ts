import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
  RendererApi
} from '@oh-my-huggingface/shared'
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS } from '@oh-my-huggingface/shared'

const invokeChannels = new Set<string>(IPC_INVOKE_CHANNELS)
const eventChannels = new Set<string>(IPC_EVENT_CHANNELS)

/**
 * The minimal, typed bridge. Only channels defined in the shared contract can be
 * invoked or subscribed to; everything else throws before touching IPC.
 */
const api: RendererApi = {
  invoke<C extends IpcInvokeChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>> {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, req) as Promise<IpcResponse<C>>
  },
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void
  ): () => void {
    if (!eventChannels.has(channel)) {
      throw new Error(`Unknown IPC event channel: ${channel}`)
    }
    const wrapped = (_event: unknown, payload: IpcEventPayload<C>): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('omh', api)
