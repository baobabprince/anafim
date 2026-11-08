/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 * Prefer self-hosted weights under public/models/ when present.
 * Remote Hub is attempted only if explicitly useful; many networks block it.
 *
 * Note: GitHub Pages cannot host the ONNX weights (file >100MB). Until the
 * model is hosted elsewhere (Release/CDN), this path will usually fail and
 * callers should rely on window.ai when available.
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';

const REMOTE_MODEL_IDS = [
  'onnx-community/SmolLM2-360M-Instruct-ONNX',
  'HuggingFaceTB/SmolLM2-360M-Instruct',
];

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  // Soft availability: we can try; actual load may still fail without weights.
  return true;
}

function modelsBaseUrl() {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return `${base}models/`;
}

async function hasSelfHostedModel() {
  try {
    const url = `${modelsBaseUrl()}${LOCAL_MODEL_NAME}/config.json`;
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return false;
    // Also require an ONNX weight; config alone is not enough
    const onnxUrl = `${modelsBaseUrl()}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`;
    const onnx = await fetch(onnxUrl, { method: 'HEAD', cache: 'no-cache' });
    return onnx.ok;
  } catch {
    return false;
  }
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

async function configureEnv(env, { useLocal }) {
  env.useBrowserCache = true;
  if (useLocal) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = modelsBaseUrl();
    console.log('[AI Editor] Using self-hosted models from', env.localModelPath);
  } else {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    console.log('[AI Editor] No self-hosted ONNX on this origin');
  }
  try {
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }
  } catch {
    // ignore
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

  const generator = await pipeline('text-generation', modelId, {
    device,
    dtype: 'q4f16',
    progress_callback: progressCb(device, onProgress),
  });

  lastProgress = { status: 'ready', progress: 100, device, model: modelId };
  if (onProgress) onProgress(lastProgress);
  return generator;
}

function friendlyFetchError(err) {
  const msg = String(err?.message || err || '');
  return (
    'עריכת AI מקומית אינה זמינה כרגע.\n\n' +
    '• ב-Chrome (עם window.ai / Gemini Nano) — העריכה אמורה לעבוד.\n' +
    '• מודל ONNX מקומי לא ניתן לארח ב-GitHub Pages (מגבלת 100MB; הקובץ ~112MB).\n' +
    '• הורדה מ-Hugging Face נחסמה או נכשלה ברשת שלך.\n\n' +
    `פרטים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    const useLocal = await hasSelfHostedModel();
    await configureEnv(env, { useLocal });

    if (!useLocal) {
      // Do not burn time on HF Hub when it repeatedly fails for this deployment.
      throw new Error(
        'אין מודל ONNX בשרת האתר (GitHub Pages מוגבל ל-100MB). ' +
          'השתמש ב-Chrome עם window.ai, או ארח את המודל ב-Release/CDN.',
      );
    }

    const preferGpu = await canUseWebGpu();
    const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];

    let lastError = null;
    for (const device of devices) {
      try {
        console.log(`[AI Editor] Loading ${LOCAL_MODEL_NAME} on device=${device}`);
        return await loadPipeline(pipeline, LOCAL_MODEL_NAME, device, onProgress);
      } catch (err) {
        lastError = err;
        console.warn(`[AI Editor] ${device} failed:`, err?.message || err);
      }
    }

    throw new Error(friendlyFetchError(lastError));
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
