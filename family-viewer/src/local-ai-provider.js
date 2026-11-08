/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 * Prefer self-hosted weights under public/models/ when present;
 * otherwise fall back to Hugging Face Hub.
 */

/** Folder name under public/models/ (and pipeline model id for local load). */
const LOCAL_MODEL_NAME = 'smollm2-360m';

/** Remote Hub ids if self-hosted copy is missing. */
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
  return true;
}

function modelsBaseUrl() {
  // Vite base is /anafim/ in production; ends with /
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return `${base}models/`;
}

/** True if self-hosted model files are published under public/models/<name>/. */
async function hasSelfHostedModel() {
  try {
    const url = `${modelsBaseUrl()}${LOCAL_MODEL_NAME}/config.json`;
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    return res.ok;
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
    console.log('[AI Editor] Self-hosted model not found – using Hugging Face Hub');
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
      'נכשל בהורדת המודל (Failed to fetch).\n' +
      'אם שמת עותק תחת public/models/smollm2-360m — ודא ש-config.json זמין אחרי build.\n' +
      'אחרת: בדוק חיבור / חוסם פרסומות / VPN מול Hugging Face.\n' +
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

    const useLocal = await hasSelfHostedModel();
    await configureEnv(env, { useLocal });

    const preferGpu = await canUseWebGpu();
    const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];
    const models = useLocal ? [LOCAL_MODEL_NAME] : REMOTE_MODEL_IDS;

    let lastError = null;

    for (const modelId of models) {
      for (const device of devices) {
        try {
          console.log(`[AI Editor] Loading ${modelId} on device=${device} (local=${useLocal})`);
          return await loadPipeline(pipeline, modelId, device, onProgress);
        } catch (err) {
          lastError = err;
          console.warn(`[AI Editor] ${modelId} / ${device} failed:`, err?.message || err);
        }
      }
    }

    // Last resort for remote only
    if (!useLocal) {
      try {
        console.log('[AI Editor] Retry default device with', REMOTE_MODEL_IDS[0]);
        lastProgress = { status: 'loading', progress: 0, device: 'auto' };
        if (onProgress) onProgress(lastProgress);
        const generator = await pipeline('text-generation', REMOTE_MODEL_IDS[0], {
          progress_callback: progressCb('auto', onProgress),
        });
        lastProgress = { status: 'ready', progress: 100, device: 'auto' };
        if (onProgress) onProgress(lastProgress);
        return generator;
      } catch (err) {
        lastError = err;
      }
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
