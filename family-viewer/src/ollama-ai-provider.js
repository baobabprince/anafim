/**
 * Local AI via Ollama (http://localhost:11434) — runs on the user's own machine,
 * no API key, no cloud. Used automatically when Ollama is reachable.
 *
 * Settings (localStorage, optional):
 *   anafim_ollama_url    default http://localhost:11434
 *   anafim_ollama_model  default qwen3:4b
 *
 * For the deployed site, Ollama must allow its origin, e.g.:
 *   OLLAMA_ORIGINS=https://baobabprince.github.io ollama serve
 */

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3:4b';

function setting(key, fallback) {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export const getOllamaUrl = () => setting('anafim_ollama_url', DEFAULT_URL).replace(/\/+$/, '');
export const getOllamaModel = () => setting('anafim_ollama_model', DEFAULT_MODEL);

let availability = { checkedAt: 0, ok: false };

/** True if Ollama answers and the configured model is installed. Cached for 10s. */
export async function isOllamaAvailable() {
  if (typeof fetch === 'undefined') return false;
  if (Date.now() - availability.checkedAt < 10_000) return availability.ok;

  let ok = false;
  try {
    const res = await fetch(`${getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const { models = [] } = await res.json();
      const want = getOllamaModel();
      ok = models.some((m) => m.name === want || m.name === `${want}:latest`);
      if (!ok) console.warn(`[AI Editor] Ollama is running but model "${want}" is not installed. Run: ollama pull ${want}`);
    }
  } catch {
    // not running / blocked by CORS — fall through to the next provider
  }
  availability = { checkedAt: Date.now(), ok };
  return ok;
}

/** Removes <think>…</think> blocks that reasoning models may emit. */
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function promptOllama(prompt) {
  const res = await fetch(`${getOllamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getOllamaModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a genealogy assistant. Output only a single valid JSON object. Use only facts stated in the user text.',
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      think: false,      // skip reasoning phase: faster, and we only need extraction
      format: 'json',    // constrained JSON output
      options: { temperature: 0, num_predict: 700 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return stripThinking(data?.message?.content);
}
