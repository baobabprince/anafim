family-viewer/src/local-ai-provider.js <<'EOF'
/**
 * Local browser AI via Transformers.js (ONNX + WebGPU/WASM).
 *
 * The model is loaded straight from the Hugging Face Hub and cached by the
 * browser (first load downloads it once, later loads are offline-fast).
 * No GitHub LFS, no commit lookups, no self-hosted weights.
 *
 * To try another model without a rebuild, run in the browser console:
 *   localStorage.setItem('anafim_local_model', 'onnx-community/<repo>')
 */

// Tried in order; the first one that loads wins. Both are ~0.5B-parameter models.
const DEFAULT_MODELS = [
  'onnx-community/Qwen3-0.6B-ONNX',
  'onnx-community/Qwen2.5-0.5B-Instruct',
];

let generatorPromise = null;
let activeModel = null;
let lastProgress = { status: 'idle', progress: 0 };

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
  return typeof window !== 'undefined';
}

function modelCandidates() {
  let custom = null;
  try {
    custom = localStorage.getItem('anafim_local_model');
  } catch {
    // ignore
  }
  return custom ? [custom, ...DEFAULT_MODELS] : DEFAULT_MODELS;
}

async function getGpuInfo() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    return { hasF16: Boolean(adapter.features?.has('shader-f16')) };
  } catch {
    return null;
  }
}

function emit(onProgress, patch) {
  lastProgress = { ...lastProgress, ...patch };
  if (onProgress) onProgress(lastProgress);
}

async function getGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    try {
      if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
    } catch {
      // ignore
    }

    const gpu = await getGpuInfo();
    const devices = [];
    if (gpu) devices.push({ device: 'webgpu', dtype: gpu.hasF16 ? 'q4f16' : 'q4' });
    devices.push({ device: 'wasm', dtype: 'q4' });

    const errors = [];
    for (const modelId of modelCandidates()) {
      for (const { device, dtype } of devices) {
        try {
          console.log(`[AI Editor] Loading ${modelId} (${device}, ${dtype})`);
          emit(onProgress, { status: 'loading', progress: 0, model: modelId, device, dtype });

          const generator = await pipeline('text-generation', modelId, {
            device,
            dtype,
            progress_callback: (info) =>
              emit(onProgress, {
                status: info.status || 'loading',
                progress: typeof info.progress === 'number' ? Math.round(info.progress) : lastProgress.progress,
                file: info.file,
                device,
              }),
          });

          activeModel = modelId;
          emit(onProgress, { status: 'ready', progress: 100, model: modelId, device, dtype });
          return generator;
        } catch (err) {
          const msg = String(err?.message || err);
          console.warn(`[AI Editor] ${modelId} on ${device} failed:`, msg);
          errors.push(`${modelId} (${device}): ${msg}`);
        }
      }
    }

    throw new Error(
      'טעינת המודל המקומי נכשלה. בדוק חיבור לאינטרנט ונסה שוב.\n\n' +
        `פרטים טכניים:\n${errors.join('\n')}`,
    );
  })().catch((err) => {
    generatorPromise = null; // allow retry
    lastProgress = { status: 'error', progress: 0, error: String(err?.message || err) };
    throw err;
  });

  return generatorPromise;
}

function extractGeneratedText(result) {
  const first = Array.isArray(result) ? result[0] : result;
  if (first == null) return '';
  if (typeof first === 'string') return first;
  const text = first.generated_text ?? first.text;
  if (typeof text === 'string') return text;
  // chat-style output: [{role, content}, ...] — take the last assistant message
  if (Array.isArray(text)) return String(text[text.length - 1]?.content ?? '');
  return String(first);
}

/** Removes <think>…</think> blocks that Qwen3-style models may emit. */
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function promptLocalAi(prompt, { onProgress } = {}) {
  const generator = await getGenerator(onProgress);

  // Qwen3 reasons by default; "/no_think" switches that off (faster, we only extract).
  const userContent = /qwen3/i.test(activeModel || '') ? `${prompt}\n/no_think` : prompt;

  const messages = [
    {
      role: 'system',
      content:
        'You are a genealogy assistant. Output only a single valid JSON object. Use only facts stated in the user text. No markdown, no explanation.',
    },
    { role: 'user', content: userContent },
  ];

  const result = await generator(messages, {
    max_new_tokens: 500,
    do_sample: false,
    return_full_text: false,
  });

  return stripThinking(extractGeneratedText(result));
}
