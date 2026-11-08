#!/usr/bin/env python3
"""Fix local-ai-provider: try WebGPU, then explicitly fall back to WASM/CPU."""
from pathlib import Path

path = Path("family-viewer/src/local-ai-provider.js")
text = path.read_text(encoding="utf-8")

new_content = r'''/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 * Used as fallback when window.ai / Prompt API is unavailable.
 */

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  return true;
}

/** True only if WebGPU adapter can actually be acquired. */
async function canUseWebGpu() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function loadPipeline(pipeline, device, onProgress) {
  lastProgress = { status: 'loading', progress: 0, device };
  if (onProgress) onProgress(lastProgress);

  const opts = {
    device,
    progress_callback: (info) => {
      lastProgress = {
        status: info.status || 'loading',
        progress: typeof info.progress === 'number' ? info.progress : lastProgress.progress,
        file: info.file,
        device,
      };
      if (onProgress) onProgress(lastProgress);
    },
  };

  // Quantization: prefer q4 on GPU, q8 on CPU/WASM for broader compatibility
  if (device === 'webgpu') {
    opts.dtype = 'q4';
  } else {
    opts.dtype = 'q8';
  }

  const generator = await pipeline('text-generation', MODEL_ID, opts);
  lastProgress = { status: 'ready', progress: 100, device };
  if (onProgress) onProgress(lastProgress);
  return generator;
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline } = await import('@huggingface/transformers');

    const preferGpu = await canUseWebGpu();
    const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];

    let lastError = null;
    for (const device of devices) {
      try {
        console.log(`[AI Editor] Loading local model on device=${device}`);
        return await loadPipeline(pipeline, device, onProgress);
      } catch (err) {
        lastError = err;
        console.warn(`[AI Editor] device=${device} failed:`, err?.message || err);
        // continue to next device
      }
    }

    // Last resort: try without explicit device (library default)
    try {
      console.log('[AI Editor] Retrying local model with library default device');
      lastProgress = { status: 'loading', progress: 0, device: 'auto' };
      if (onProgress) onProgress(lastProgress);
      const generator = await pipeline('text-generation', MODEL_ID, {
        progress_callback: (info) => {
          lastProgress = {
            status: info.status || 'loading',
            progress: typeof info.progress === 'number' ? info.progress : lastProgress.progress,
            file: info.file,
            device: 'auto',
          };
          if (onProgress) onProgress(lastProgress);
        },
      });
      lastProgress = { status: 'ready', progress: 100, device: 'auto' };
      if (onProgress) onProgress(lastProgress);
      return generator;
    } catch (err) {
      lastError = err;
    }

    throw lastError || new Error('לא ניתן לטעון מודל מקומי (WebGPU ו-WASM נכשלו).');
  })().catch((err) => {
    generatorPromise = null;
    lastProgress = { status: 'error', progress: 0, error: String(err?.message || err) };
    throw err;
  });

  return generatorPromise;
}

/**
 * Run the same genealogy prompt against the local HF model.
 * Returns raw text (expected to be JSON).
 */
export async function promptLocalAi(prompt, { onProgress } = {}) {
  const generator = await getGenerator(onProgress);

  const messages = [
    {
      role: 'system',
      content: 'You are an expert genealogy assistant that outputs only valid JSON conforming strictly to the requested schema. No markdown, no explanation.',
    },
    { role: 'user', content: prompt },
  ];

  const result = await generator(messages, {
    max_new_tokens: 400,
    temperature: 0.1,
    do_sample: false,
    return_full_text: false,
  });

  const text = Array.isArray(result)
    ? (result[0]?.generated_text ?? result[0]?.text ?? String(result[0] ?? ''))
    : String(result?.generated_text ?? result ?? '');

  return text.trim();
}
'''

path.write_text(new_content, encoding="utf-8")
print("Updated local-ai-provider.js with WebGPU->WASM fallback")
