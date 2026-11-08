/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Model tree is in Git LFS under models/smollm2-360m/.
 * media.githubusercontent.com serves real bytes only when the URL uses a
 * *commit SHA* — the `master` ref 404s some files (e.g. config.json) and
 * raw.githubusercontent.com returns LFS pointer text (breaks ONNX protobuf).
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';
const REPO = 'baobabprince/anafim';

/** Fallback if GitHub API is rate-limited; updated when Publish AI model runs. */
const FALLBACK_MODEL_SHA = '481eb7fcffb56fa9ceed4ded60268a3147e9c0bc';

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

  // Last resort: hardcoded fallback SHA
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
    '• המודל נטען מ-media.githubusercontent.com לפי commit SHA (Git LFS).\n\n' +
    `פרטים: ${msg}`
  );
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const modelBase = await resolveModelBase();
    if (!modelBase) {
      throw new Error(
        'לא נמצא מודל ONNX תקין ב-Git LFS media. ' +
          'הרץ Publish AI model (Git LFS) או השתמש ב-Chrome עם window.ai.',
      );
    }

    const { pipeline, env } = await import('@huggingface/transformers');

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
