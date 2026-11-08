/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Model files live under models/smollm2-360m/ (ONNX in Git LFS).
 * - JSON/tokenizer: raw.githubusercontent.com
 * - ONNX binary: media.githubusercontent.com (raw serves LFS *pointers*, which
 *   break ONNX Runtime with "protobuf parsing failed")
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';

const GITHUB_RAW_MODELS_BASE =
  'https://raw.githubusercontent.com/baobabprince/anafim/master/models/';

const GITHUB_LFS_MEDIA_PREFIX =
  'https://media.githubusercontent.com/media/baobabprince/anafim/master/';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };
let fetchPatched = false;

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  return true;
}

/** Map raw.githubusercontent.com/.../file.onnx → media.githubusercontent.com/.../file.onnx */
function installOnnxFetchRewrite() {
  if (fetchPatched || typeof window === 'undefined' || !window.fetch) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (
        typeof url === 'string' &&
        url.includes('raw.githubusercontent.com/baobabprince/anafim/') &&
        /\.onnx(_data)?(\?|$)/i.test(url)
      ) {
        const mediaUrl = url.replace(
          'https://raw.githubusercontent.com/baobabprince/anafim/master/',
          GITHUB_LFS_MEDIA_PREFIX,
        );
        console.log('[AI Editor] ONNX fetch rewrite →', mediaUrl);
        return originalFetch(mediaUrl, init);
      }
    } catch {
      // fall through
    }
    return originalFetch(input, init);
  };

  fetchPatched = true;
}

async function urlOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache', mode: 'cors' });
    if (res.ok) return true;
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-cache',
      mode: 'cors',
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

async function onnxMediaOk() {
  const url = `${GITHUB_LFS_MEDIA_PREFIX}models/${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-31' },
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

async function canUseWebGpu() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
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
    'עריכת AI מקומית נכשלה בטעינת המודל.\n\n' +
    '• ב-Chrome עם window.ai — נסה שם (בלי מודל מקומי).\n' +
    '• ONNX נטען מ-media.githubusercontent.com (Git LFS).\n\n' +
    `פרטים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    installOnnxFetchRewrite();

    const configUrl = `${GITHUB_RAW_MODELS_BASE}${LOCAL_MODEL_NAME}/config.json`;
    const configOk = await urlOk(configUrl);
    const onnxOk = await onnxMediaOk();
    if (!configOk || !onnxOk) {
      throw new Error(
        'לא נמצא מודל מלא (config ב-raw / ONNX ב-LFS media). ' +
          'הרץ Publish AI model (Git LFS) או השתמש ב-Chrome עם window.ai.',
      );
    }

    const { pipeline, env } = await import('@huggingface/transformers');

    env.useBrowserCache = true;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    // JSON comes from raw; fetch rewrite sends .onnx to media CDN
    env.localModelPath = GITHUB_RAW_MODELS_BASE;

    try {
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
    } catch {
      // ignore
    }

    const preferGpu = await canUseWebGpu();
    const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];

    let lastError = null;
    for (const device of devices) {
      try {
        console.log(
          `[AI Editor] Loading ${LOCAL_MODEL_NAME} on ${device} (raw JSON + LFS media ONNX)`,
        );
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
