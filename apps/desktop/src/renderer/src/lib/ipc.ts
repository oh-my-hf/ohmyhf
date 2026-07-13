import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse
} from '@oh-my-huggingface/shared'

/** Typed access to the preload bridge. The renderer's only doorway to the world. */
export function invoke<C extends IpcInvokeChannel>(
  channel: C,
  req: IpcRequest<C>
): Promise<IpcResponse<C>> {
  return window.omh.invoke(channel, req)
}

export function onIpcEvent<C extends IpcEventChannel>(
  channel: C,
  listener: (payload: IpcEventPayload<C>) => void
): () => void {
  return window.omh.on(channel, listener)
}

export function openExternal(url: string): void {
  // The main process owns the allow-list (all HTTPS, plus the configured
  // HTTP Hub origin/path). Keeping policy there avoids renderer drift when the
  // endpoint changes and still treats untrusted Markdown links as untrusted.
  void invoke('system:openExternal', { url }).catch(() => undefined)
}
