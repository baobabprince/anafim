/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Supports WebGPU (with fp16 or q4) and WASM fallback for Safari, Firefox, and Mobile.
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';
const REMOTE_FALLBACK_MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const REPO = 'baobabprince/anafim';

/** Fallback if GitHub API is rate-limited; updated when Publish AI model runs. */
const FALLBACK_MODEL_SHA = '481eb7fcffb56fa9ceed4ded60268a3147e9c0bc';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };
let resolvedModelBase = null;

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const touch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches;
  return Boolean(mobileUa || (touch && coarse));
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  return true;
}

async function resolveCommitSha() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/master`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`commits API ${res.status}`);
    const data = await res.json();
    if (data?.sha) return data.sha;
  } catch (err) {
    console.warn('[AI Editor] commit SHA lookup failed, using fallback', err);
  }
  return FALLBACK_MODEL_SHA;
}

function mediaModelsBase(sha) {
  return `https://media.githubusercontent.com/media/${REPO}/${sha}/models/`;
}

async function urlOk(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-63' },
      cache: 'no-cache',
      mode: 'cors',
    });
    if (!(res.ok || res.status === 206)) return false;
    const text = new TextDecoder().decode(await res.arrayBuffer());
    if (text.startsWith('version https://git-lfs')) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveModelBase() {
  if (resolvedModelBase) return resolvedModelBase;

  const sha = await resolveCommitSha();
  const base = mediaModelsBase(sha);
  const configUrl = `${base}${LOCAL_MODEL_NAME}/config.json`;
  const onnxUrl = `${base}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`;

  const configOk = await urlOk(configUrl);
  const onnxOk = await urlOk(onnxUrl);
  console.log('[AI Editor] media base', base, { configOk, onnxOk, sha });

  if (configOk && onnxOk) {
    resolvedModelBase = base;
    return base;
  }

  if (sha !== FALLBACK_MODEL_SHA) {
    const fb = mediaModelsBase(FALLBACK_MODEL_SHA);
    if (
      (await urlOk(`${fb}${LOCAL_MODEL_NAME}/config.json`)) &&
      (await urlOk(`${fb}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`))
    ) {
      resolvedModelBase = fb;
      return fb;
    }
  }

  return null;
}

async function hasLocalModelFile(base, filename) {
  if (!base) return false;
  return await urlOk(`${base}${LOCAL_MODEL_NAME}/onnx/${filename}`);
}

async function getGpuInfo() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    return {
      adapter,
      hasF16: Boolean(adapter.features?.has('shader-f16')),
    };
  } catch {
    return null;
  }
}

function progressCb(device, onProgress) {
  return (info) => {
    lastProgress = {
      status: info.status || 'loading',
      progress: typeof info.progress === 'number' ? Math.round(info.progress) : lastProgress.progress,
      file: info.file,
      loaded: info.loaded,
      total: info.total,
      device,
    };
    if (onProgress) onProgress(lastProgress);
  };
}

async function loadPipeline(pipeline, modelId, { device, dtype, onProgress }) {
  lastProgress = { status: 'loading', progress: 0, device, model: modelId, dtype };
  if (onProgress) onProgress(lastProgress);

  const generator = await pipeline('text-generation', modelId, {
    device,
    dtype,
    progress_callback: progressCb(device, onProgress),
  });

  lastProgress = { status: 'ready', progress: 100, device, model: modelId, dtype };
  if (onProgress) onProgress(lastProgress);
  return generator;
}

function friendlyFetchError(err) {
  const msg = String(err?.message || err || '');
  if (/network|Failed to fetch|Load failed|timeout/i.test(msg)) {
    return (
      'הורדת המודל המקומי נכשלה (שגיאת רשת).\n\n' +
      '• מומלץ: הזן מפתח Google Gemini חינמי בחלון העריכה.\n' +
      '• ב-Chrome שולחני: ניתן להשתמש ב-window.ai המובנה.\n\n' +
      `פרטים: ${msg}`
    );
  }
  return (
    'עריכת AI מקומית בדפדפן נכשלה.\n\n' +
    '• מומלץ: הזן מפתח Google Gemini חינמי בחלון העריכה.\n' +
    '• ב-Chrome שולחני: ניתן להשתמש ב-window.ai המובנה.\n\n' +
    `פרטים טכניים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    env.useBrowserCache = true;

    try {
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
    } catch {
      // ignore
    }

    const modelBase = await resolveModelBase();
    const gpuInfo = await getGpuInfo();
    const attempts = [];

    // Prefer local q4f16 when present (this is what CI publishes)
    if (gpuInfo && modelBase) {
      attempts.push({
        device: 'webgpu',
        dtype: 'q4f16',
        modelId: LOCAL_MODEL_NAME,
        localPath: modelBase,
      });
    }

    // WASM + local q4 only if that file exists (often missing; we only ship q4f16)
    const localHasQ4 = modelBase ? await hasLocalModelFile(modelBase, 'model_q4.onnx') : false;
    if (localHasQ4) {
      attempts.push({
        device: 'wasm',
        dtype: 'q4',
        modelId: LOCAL_MODEL_NAME,
        localPath: modelBase,
      });
    }

    // Remote Hugging Face Hub fallback
    if (gpuInfo) {
      attempts.push({
        device: 'webgpu',
        dtype: 'q4',
        modelId: REMOTE_FALLBACK_MODEL,
        localPath: null,
      });
    }
    attempts.push({
      device: 'wasm',
      dtype: 'q4',
      modelId: REMOTE_FALLBACK_MODEL,
      localPath: null,
    });

    let lastError = null;
    for (const attempt of attempts) {
      try {
        console.log(
          `[AI Editor] Attempting local model ${attempt.modelId} on ${attempt.device} (dtype=${attempt.dtype})`,
        );

        if (attempt.localPath) {
          env.allowLocalModels = true;
          env.allowRemoteModels = false;
          env.localModelPath = attempt.localPath;
        } else {
          env.allowLocalModels = false;
          env.allowRemoteModels = true;
        }

        return await loadPipeline(pipeline, attempt.modelId, {
          device: attempt.device,
          dtype: attempt.dtype,
          onProgress,
        });
      } catch (err) {
        lastError = err;
        console.warn(`[AI Editor] ${attempt.device} (${attempt.dtype}) failed:`, err?.message || err);
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

function extractGeneratedText(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    const first = result[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.generated_text === 'string') return first.generated_text;
    if (first && typeof first.text === 'string') return first.text;
    if (first != null) return String(first);
    return '';
  }
  if (typeof result.generated_text === 'string') return result.generated_text;
  if (typeof result.text === 'string') return result.text;
  return String(result);
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

  return extractGeneratedText(result).trim();
}
