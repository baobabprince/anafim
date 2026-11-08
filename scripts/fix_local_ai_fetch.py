#!/usr/bin/env python3
"""Fix Failed to fetch: configure transformers.js env, smaller model, clearer errors."""
from pathlib import Path

path = Path("family-viewer/src/local-ai-provider.js")

new_content = r'''/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 * Used as fallback when window.ai / Prompt API is unavailable.
 */

// Smaller instruct model – fewer/lighter files than Qwen2.5-0.5B for first download
const MODEL_ID = 'onnx-community/SmolLM2-360M-Instruct-ONNX';
// Fallback if primary model id is unavailable
const FALLBACK_MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  return true;
}

async function canUseWebGpu() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function configureEnv(env) {
  // Always allow downloading models from the Hub in the browser
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  // Browser cache (IndexedDB) speeds up second load
  env.useBrowserCache = true;

  // Helpful defaults for WASM on some hosts (GitHub Pages / mobile)
  try {
    if (env.backends?.onnx?.wasm) {
      // Single thread is more reliable on mobile / Safari
      env.backends.onnx.wasm.numThreads = 1;
      // proxy worker can fail on some hosts; leave default unless needed
    }
  } catch {
    // ignore env shape differences across versions
  }
}

function progressCb(device, onProgress) {
  return (info) => {
    lastProgress = {
      status: info.status || 'loading',
      progress: typeof info.progress === 'number' ? info.progress : lastProgress.progress,
      file: info.file,
      device,
    };
    if (onProgress) onProgress(lastProgress);
  };
}

async function loadPipeline(pipeline, modelId, device, onProgress) {
  lastProgress = { status: 'loading', progress: 0, device, model: modelId };
  if (onProgress) onProgress(lastProgress);

  const opts = {
    device,
    progress_callback: progressCb(device, onProgress),
  };
  if (device === 'webgpu') {
    opts.dtype = 'q4';
  } else {
    opts.dtype = 'q8';
  }

  const generator = await pipeline('text-generation', modelId, opts);
  lastProgress = { status: 'ready', progress: 100, device, model: modelId };
  if (onProgress) onProgress(lastProgress);
  return generator;
}

function friendlyFetchError(err) {
  const msg = String(err?.message || err || '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
    return (
      'נכשל בהורדת המודל מ-Hugging Face (Failed to fetch).\n' +
      'בדוק חיבור לאינטרנט, חוסם פרסומות/VPN, או נסה בדפדפן אחר.\n' +
      'טיפ: ב-Chrome עם window.ai אין צורך במודל מקומי.\n' +
      `פרטים: ${msg}`
    );
  }
  return msg;
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    await configureEnv(env);

    const preferGpu = await canUseWebGpu();
    const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];
    const models = [MODEL_ID, FALLBACK_MODEL_ID];

    let lastError = null;

    for (const modelId of models) {
      for (const device of devices) {
        try {
          console.log(`[AI Editor] Loading ${modelId} on device=${device}`);
          return await loadPipeline(pipeline, modelId, device, onProgress);
        } catch (err) {
          lastError = err;
          console.warn(`[AI Editor] ${modelId} / ${device} failed:`, err?.message || err);
        }
      }
    }

    // Last resort: no device/dtype
    try {
      console.log('[AI Editor] Retry default device with', MODEL_ID);
      lastProgress = { status: 'loading', progress: 0, device: 'auto' };
      if (onProgress) onProgress(lastProgress);
      const generator = await pipeline('text-generation', MODEL_ID, {
        progress_callback: progressCb('auto', onProgress),
      });
      lastProgress = { status: 'ready', progress: 100, device: 'auto' };
      if (onProgress) onProgress(lastProgress);
      return generator;
    } catch (err) {
      lastError = err;
    }

    throw new Error(friendlyFetchError(lastError) || 'לא ניתן לטעון מודל מקומי.');
  })().catch((err) => {
    generatorPromise = null;
    lastProgress = { status: 'error', progress: 0, error: String(err?.message || err) };
    throw err;
  });

  return generatorPromise;
}

export async function promptLocalAi(prompt, { onProgress } = {}) {
  const generator = await getGenerator(onProgress);

  const messages = [
    {
      role: 'system',
      content:
        'You are an expert genealogy assistant that outputs only valid JSON conforming strictly to the requested schema. No markdown, no explanation.',
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
print("Updated local-ai-provider.js")
