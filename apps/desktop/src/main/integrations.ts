/**
 * Phase E: local-toolchain integrations (export to Ollama / LM Studio / ComfyUI),
 * upload workflow, and the inference playground backend.
 *
 * Export/upload are wired end-to-end through IPC + validation + this module, with
 * honest runnable stubs where the heavy lifting is still TODO.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  ExportResult,
  ExportTarget,
  ExportTool,
  InferenceRequest,
  InferenceResult,
  UploadRequest,
  UploadResult
} from '@oh-my-huggingface/shared'

export function detectExportTargets(): ExportTarget[] {
  const home = homedir()
  const candidates: Record<ExportTool, string[]> = {
    ollama: [join(home, '.ollama')],
    lmstudio: [join(home, '.lmstudio'), join(home, '.cache', 'lm-studio')],
    comfyui: [
      process.env.COMFYUI_PATH ?? '',
      join(home, 'ComfyUI'),
      join(home, 'comfyui')
    ].filter(Boolean)
  }
  return (Object.keys(candidates) as ExportTool[]).map((tool) => {
    const path = candidates[tool].find((p) => existsSync(p))
    return { tool, detected: Boolean(path), path }
  })
}

export async function runExport(
  tool: ExportTool,
  repoId: string,
  filePath: string
): Promise<ExportResult> {
  // TODO(phase-e): implement real exports.
  //  - ollama: write a Modelfile pointing at the cached GGUF blob and run
  //    `ollama create <name> -f Modelfile` via child_process, streaming progress.
  //  - lmstudio: hard-link the GGUF into ~/.lmstudio/models/<org>/<repo>/.
  //  - comfyui: copy/link checkpoints into <ComfyUI>/models/checkpoints (pick the
  //    subfolder from the file type: loras, vae, controlnet…).
  // The IPC surface, validation, and UI are already wired; only the copy step remains.
  return {
    ok: false,
    message: `Export of ${repoId}/${filePath} to ${tool} is not implemented yet`
  }
}

export async function createRepoAndUpload(request: UploadRequest): Promise<UploadResult> {
  // TODO(phase-e): implement the upload workflow with @huggingface/hub:
  //   1. createRepo({ repo: { type: request.kind, name: request.name }, private: … })
  //   2. walk request.folderPath and uploadFiles() in batches with progress events
  //   3. surface per-file progress through a dedicated evt: channel (mirror downloads)
  // Requires the `write-repos` OAuth scope — request it during sign-in before enabling.
  return {
    ok: false,
    message: `Upload workflow is not implemented yet (repo "${request.name}" was not created)`
  }
}

export async function runInference(
  request: InferenceRequest,
  accessToken: string | undefined
): Promise<InferenceResult> {
  if (!accessToken) {
    return { ok: false, error: 'auth-required' }
  }
  try {
    // Lazy import keeps startup fast; @huggingface/inference is only needed here.
    const { InferenceClient } = await import('@huggingface/inference')
    const client = new InferenceClient(accessToken)
    const res = await client.chatCompletion({
      model: request.model,
      messages: [{ role: 'user', content: request.input }],
      max_tokens: 512
    })
    const output = res.choices?.[0]?.message?.content ?? ''
    return { ok: true, output }
    // TODO(phase-e): stream tokens over a push channel and support text-generation
    // and image tasks based on the model's pipeline tag.
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
