#!/usr/bin/env python3
"""Add local Hugging Face (Transformers.js) AI provider as fallback for person editing."""
from pathlib import Path
import json

# ---------------------------------------------------------------------------
# 1. package.json – add @huggingface/transformers
# ---------------------------------------------------------------------------
pkg_path = Path("family-viewer/package.json")
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
deps = pkg.setdefault("dependencies", {})
if "@huggingface/transformers" not in deps:
    deps["@huggingface/transformers"] = "^3.5.0"
    pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("package.json: added @huggingface/transformers")
else:
    print("package.json: @huggingface/transformers already present")

# ---------------------------------------------------------------------------
# 2. New file: local-ai-provider.js
# ---------------------------------------------------------------------------
local_ai = r'''/**
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
'''

Path("family-viewer/src/local-ai-provider.js").write_text(local_ai, encoding="utf-8")
print("Wrote family-viewer/src/local-ai-provider.js")

# ---------------------------------------------------------------------------
# 3. Patch ai-service.js – try window.ai first, then local HF model
# ---------------------------------------------------------------------------
ai_path = Path("family-viewer/src/ai-service.js")
ai = ai_path.read_text(encoding="utf-8")

if "promptLocalAi" in ai:
    print("ai-service.js: local provider already wired")
else:
    # Add import
    old_import = "import { validatePersonUpdates, formatToGedcomDate } from './gedcom-ai-editor.js';"
    new_import = """import { validatePersonUpdates, formatToGedcomDate } from './gedcom-ai-editor.js';
import { isLocalAiAvailable, promptLocalAi, getLocalAiProgress } from './local-ai-provider.js';"""
    if old_import not in ai:
        raise SystemExit("ERROR: import line not found in ai-service.js")
    ai = ai.replace(old_import, new_import, 1)

    # Export progress helper
    if "export { getLocalAiProgress" not in ai:
        ai = ai.replace(
            "export async function isWindowAiAvailable()", 
            "export { getLocalAiProgress };\n\nexport async function isWindowAiAvailable()",
            1,
        )

    # Replace the throw when no window.ai with local fallback
    old_throw = """    } else {
      throw new Error('ממשק window.ai אינו זמין בדפדפן זה.');
    }"""
    new_throw = """    } else if (await isLocalAiAvailable()) {
      console.log('[AI Editor] window.ai unavailable – using local Hugging Face model');
      rawResponse = await promptLocalAi(prompt);
    } else {
      throw new Error('ממשק window.ai אינו זמין בדפדפן זה, וגם מודל מקומי לא זמין.');
    }"""
    if old_throw not in ai:
        raise SystemExit("ERROR: window.ai fallback throw block not found")
    ai = ai.replace(old_throw, new_throw, 1)

    ai_path.write_text(ai, encoding="utf-8")
    print("ai-service.js: wired local HF fallback")

print("Done.")
