/**
 * Local browser AI via Hugging Face Transformers.js (ONNX + WebGPU/WASM).
 *
 * Full model tree is stored in Git LFS under models/smollm2-360m/.
 * Load from media.githubusercontent.com so ONNX is real binary bytes,
 * not the LFS pointer text (which causes protobuf parsing failed).
 */

const LOCAL_MODEL_NAME = 'smollm2-360m';

/** LFS media CDN — serves actual file bytes for LFS-tracked paths. */
const GITHUB_LFS_MEDIA_BASE =
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

async function urlLooksLikeOnnxBinary(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-63' },
      cache: 'no-cache',
      mode: 'cors',
    });
    if (!(res.ok || res.status === 206)) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    const asText = new TextDecoder().decode(buf);
    // LFS pointer starts with: version https://git-lfs.github.com/spec/v1
    if (asText.startsWith('version https://git-lfs')) return false;
    // ONNX / protobuf is binary — not pure printable ASCII of a pointer
    return buf.length > 0;
  } catch {
    return false;
  }
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

async function resolveModelBase() {
  if (resolvedModelBase) return resolvedModelBase;

  // Prefer LFS media (real ONNX bytes). Pages almost never has the full model.
  const candidates = [GITHUB_LFS_MEDIA_BASE, pagesModelsBaseUrl()];

  for (const base of candidates) {
    const configUrl = `${base}${LOCAL_MODEL_NAME}/config.json`;
    const onnxUrl = `${base}${LOCAL_MODEL_NAME}/onnx/model_q4f16.onnx`;
    const configOk = await urlOk(configUrl);
    if (!configOk) {
      console.log('[AI Editor] no config at', configUrl);
      continue;
    }
    const onnxBinary = await urlLooksLikeOnnxBinary(onnxUrl);
    if (!onnxBinary) {
      console.log('[AI Editor] onnx missing or LFS pointer at', onnxUrl);
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
    '• המודל נטען מ-media.githubusercontent.com (Git LFS).\n\n' +
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
        'לא נמצא מודל ONNX תקין (בינארי). הרץ Publish AI model (Git LFS) או השתמש ב-Chrome עם window.ai.',
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
