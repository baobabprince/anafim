/**
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
  // Transformers.js works with WebGPU or WASM fallback in modern browsers
  return true;
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    // Prefer WebGPU when available; WASM otherwise
    const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';

    lastProgress = { status: 'loading', progress: 0, device };
    if (onProgress) onProgress(lastProgress);

    const generator = await pipeline('text-generation', MODEL_ID, {
      device,
      dtype: device === 'webgpu' ? 'q4' : 'q8',
      progress_callback: (info) => {
        lastProgress = {
          status: info.status || 'loading',
          progress: typeof info.progress === 'number' ? info.progress : lastProgress.progress,
          file: info.file,
          device,
        };
        if (onProgress) onProgress(lastProgress);
      },
    });

    lastProgress = { status: 'ready', progress: 100, device };
    if (onProgress) onProgress(lastProgress);
    return generator;
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

  // Qwen2.5 chat template is applied by the tokenizer when using the pipeline with messages
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
