/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Weights live in the repo under models/smollm2-360m/ with *.onnx in Git LFS.
 * GitHub Pages cannot serve LFS blobs, so we load from media.githubusercontent.com.
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';

/** Public LFS media base (public repo). */
const LFS_MEDIA_BASE =
  'https://media.githubusercontent.com/media/baobabprince/anafim/master/models/';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };
let resolvedModelBase = null;

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  return true;
}

function pagesModelsBaseUrl() {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return `${base}models/`;
}

async function urlOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache', mode: 'cors' });
    if (res.ok) return true;
    // Some CDNs reject HEAD — try a tiny ranged GET
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

/**
 * Prefer same-origin Pages copy if complete; otherwise Git LFS media URL.
 * @returns {Promise<string|null>} base URL ending with models/
 */
async function resolveModelBase() {
  if (resolvedModelBase) return resolvedModelBase;

  const candidates = [
    pagesModelsBaseUrl(),
    LFS_MEDIA_BASE,
  ];

  for (const base of candidates) {
    const configUrl = `${base}${LOCAL_MODEL_NAME}/config.json`;
    const onnxUrl = `${base}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`;
    const configOk = await urlOk(configUrl);
    if (!configOk) {
      console.log('[AI Editor] no config at', configUrl);
      continue;
    }
    const onnxOk = await urlOk(onnxUrl);
    if (!onnxOk) {
      console.log('[AI Editor] config ok but no onnx at', onnxUrl);
      continue;
    }
    resolvedModelBase = base;
    console.log('[AI Editor] model base resolved:', base);
    return base;
  }
  return null;
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
    '• ודא ש-workflow "Publish AI model (Git LFS)" רץ בהצלחה.\n' +
    '• קבצי LFS נטענים מ-media.githubusercontent.com (לא מ-Pages).\n\n' +
    `פרטים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    const modelBase = await resolveModelBase();
    if (!modelBase) {
      throw new Error(
        'לא נמצא מודל ONNX (לא ב-Pages ולא ב-Git LFS media). ' +
          'הרץ את workflow Publish AI model (Git LFS), או השתמש ב-Chrome עם window.ai.',
      );
    }

    env.useBrowserCache = true;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = modelBase;

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
        console.log(`[AI Editor] Loading ${LOCAL_MODEL_NAME} on ${device} from ${modelBase}`);
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
