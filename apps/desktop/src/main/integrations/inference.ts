/**
 * Inference playground backend: one-shot chat completion plus a streaming variant that
 * pushes deltas through `evt:inference`, correlated by caller-provided id.
 */
import type { InferenceRequest, InferenceResult } from '@oh-my-huggingface/shared'
import type { InferenceDeps } from './types'

/** Batching window for streamed deltas so tiny tokens don't each cost an IPC round-trip. */
const FLUSH_INTERVAL_MS = 50

const activeStreams = new Map<string, AbortController>()

export async function runInference(
  request: InferenceRequest,
  accessToken: string | undefined
): Promise<InferenceResult> {
  if (!accessToken) {
    return { ok: false, error: 'auth-required' }
  }
  try {
    const { InferenceClient } = await import('@huggingface/inference')
    const client = new InferenceClient(accessToken)
    const res = await client.chatCompletion({
      model: request.model,
      messages: [{ role: 'user', content: request.input }],
      max_tokens: 512
    })
    const output = res.choices?.[0]?.message?.content ?? ''
    return { ok: true, output }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function runInferenceStream(
  id: string,
  request: InferenceRequest,
  deps: InferenceDeps
): Promise<void> {
  const { accessToken, broadcast } = deps
  if (!accessToken) {
    broadcast('evt:inference', { id, error: 'auth-required', done: true })
    return
  }

  // A new stream with the same id supersedes the old one.
  activeStreams.get(id)?.abort()
  const controller = new AbortController()
  activeStreams.set(id, controller)

  let buffer = ''
  let timer: ReturnType<typeof setInterval> | undefined
  const flush = (): void => {
    if (!buffer) return
    broadcast('evt:inference', { id, delta: buffer })
    buffer = ''
  }

  try {
    const { InferenceClient } = await import('@huggingface/inference')
    const client = new InferenceClient(accessToken)
    const stream = client.chatCompletionStream(
      {
        model: request.model,
        messages: [{ role: 'user', content: request.input }],
        max_tokens: 512
      },
      { signal: controller.signal }
    )
    timer = setInterval(flush, FLUSH_INTERVAL_MS)
    for await (const chunk of stream) {
      if (controller.signal.aborted) break
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) buffer += delta
    }
    flush()
    broadcast('evt:inference', { id, done: true })
  } catch (err) {
    if (controller.signal.aborted) {
      broadcast('evt:inference', { id, done: true })
    } else {
      broadcast('evt:inference', {
        id,
        error: err instanceof Error ? err.message : String(err),
        done: true
      })
    }
  } finally {
    if (timer) clearInterval(timer)
    if (activeStreams.get(id) === controller) activeStreams.delete(id)
  }
}

export function cancelInference(id: string): void {
  const controller = activeStreams.get(id)
  if (controller) {
    controller.abort()
    activeStreams.delete(id)
  }
}
