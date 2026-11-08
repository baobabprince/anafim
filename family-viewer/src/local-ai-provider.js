/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Model tree is in Git LFS under models/smollm2-360m/ (~112MB ONNX).
 * Served from media.githubusercontent.com using a commit SHA.
 *
 * On phones this download is unreliable (timeouts / network error), so we
 * skip the local model on mobile and ask users to use Chrome + window.ai
 * or a desktop browser.
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';
const REPO = 'baobabprince/anafim';

/** Commit that contains the full LFS model tree (config + onnx). */
const MODEL_SHA = '481eb7fcffb56fa9ceed4ded60268a3147e9c0bc';

let generatorPromise = null;
let lastProgress = { status: 'idle', progress: 0 };

export function getLocalAiProgress() {
  return { ...lastProgress };
}

export function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac; treat coarse pointer + no hover as mobile-ish
  try {
    if (navigator.maxTouchPoints > 1 && /Mac/i.test(ua)) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function isLocalAiAvailable() {
  if (typeof window === 'undefined') return false;
  // Available as a capability flag; getGenerator may still refuse on mobile.
  return true;
}

function mediaModelsBase(sha = MODEL_SHA) {
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

function mobileSkipMessage() {
  return (
    'עריכת AI במכשיר זה דורשת הורדת מודל של כ־120MB, וזה בדרך כלל נכשל במובייל (network error / timeout).\n\n' +
    'מה אפשר לעשות:\n' +
    '• Chrome במחשב עם AI מובנה (window.ai) — הדרך המומלצת\n' +
    '• או Wi‑Fi יציב במחשב / טאבלט חזק, לא בסלולר\n\n' +
    'במובייל כרגע המודל המקומי כבוי בכוונה.'
  );
}

function friendlyFetchError(err) {
  const msg = String(err?.message || err || '');
  if (/network|Failed to fetch|Load failed|timeout/i.test(msg)) {
    return (
      'הורדת המודל המקומי נכשלה (שגיאת רשת).\n' +
      'הקובץ כ־120MB משרתי GitHub. נסה Wi‑Fi יציב במחשב, או Chrome עם window.ai.\n\n' +
      `פרטים: ${msg}`
    );
  }
  return (
    'עריכת AI מקומית נכשלה בטעינת המודל.\n' +
    'מומלץ Chrome במחשב עם window.ai.\n\n' +
    `פרטים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    if (isLikelyMobileDevice()) {
      throw new Error(mobileSkipMessage());
    }

    const modelBase = mediaModelsBase();
    const configOk = await urlOk(`${modelBase}${LOCAL_MODEL_NAME}/config.json`);
    const onnxOk = await urlOk(`${modelBase}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`);
    console.log('[AI Editor] model check', { modelBase, configOk, onnxOk });

    if (!configOk || !onnxOk) {
      throw new Error(
        'לא ניתן לגשת לקבצי המודל ב-GitHub (LFS). ' +
          'נסה שוב מאוחר יותר או השתמש ב-Chrome עם window.ai.',
      );
    }

    const { pipeline, env } = await import('@huggingface/transformers');

    // Avoid stale LFS-pointer cache from earlier experiments
    env.useBrowserCache = false;
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
