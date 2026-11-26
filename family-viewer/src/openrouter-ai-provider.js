/**
 * OpenRouter AI Provider for in-browser GEDCOM editing.
 * Uses OpenRouter's OpenAI-compatible Chat Completions API so users can plug in
 * a single API key and run Gemini, GPT, Claude, Llama, or free-tier models.
 *
 * Security notes:
 * - API key is sent only in the Authorization Bearer header (never in URL).
 * - Console logs never print full keys (only masked prefix…suffix).
 */

import { maskSecret } from './gemini-ai-provider.js';

const API_KEY_STORAGE = 'anafim_openrouter_api_key';
const MODEL_STORAGE = 'anafim_openrouter_model';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_PRESET_MODELS = [
  { id: 'openrouter/free', label: 'OpenRouter Free (מומלץ · מודל חינמי אוטומטי)' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (מהיר וחסכוני)' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (מאוזן לעברית)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
  { id: 'openrouter/auto', label: 'OpenRouter Auto' },
];

const DEFAULT_MODEL = OPENROUTER_PRESET_MODELS[0].id;
const FALLBACK_MODELS = [
  'openrouter/free',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'openrouter/auto',
];

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.window?.localStorage) {
      return globalThis.window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getOpenRouterApiKey() {
  try {
    const storage = getStorage();
    if (!storage) return '';
    return (storage.getItem(API_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function setOpenRouterApiKey(key) {
  try {
    const storage = getStorage();
    if (!storage) return;
    const clean = (key || '').trim();
    if (clean) {
      storage.setItem(API_KEY_STORAGE, clean);
    } else {
      storage.removeItem(API_KEY_STORAGE);
    }
  } catch (err) {
    console.warn('[OpenRouter AI] Failed to save API key to localStorage:', err);
  }
}

export function removeOpenRouterApiKey() {
  setOpenRouterApiKey('');
}

export function isOpenRouterAvailable() {
  return Boolean(getOpenRouterApiKey());
}

export function getOpenRouterModel() {
  try {
    const storage = getStorage();
    const saved = (storage?.getItem(MODEL_STORAGE) || '').trim();
    return saved || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setOpenRouterModel(model) {
  try {
    const storage = getStorage();
    if (!storage) return;
    const clean = (model || '').trim();
    if (clean) {
      storage.setItem(MODEL_STORAGE, clean);
    } else {
      storage.removeItem(MODEL_STORAGE);
    }
  } catch {
    // ignore
  }
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function extractMessageText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

async function callOpenRouterOnce(key, model, prompt, { useJsonFormat = true } = {}) {
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a genealogy data assistant. Output ONLY a single valid JSON object conforming to the requested schema. No markdown, no extra text.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
  };
  if (useJsonFormat) {
    body.response_format = { type: 'json_object' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'X-Title': 'Anafim Family Viewer',
  };

  let response;
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30000) : undefined;
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (netErr) {
    if (netErr?.name === 'TimeoutError' || netErr?.name === 'AbortError') {
      throw new Error('הבקשה ל-OpenRouter ארכה יותר מדי זמן. נסה שוב בעוד רגע.');
    }
    throw new Error('שגיאת רשת בהתחברות ל-OpenRouter. אנא בדוק את החיבור לאינטרנט.');
  }

  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson?.error?.message || errJson?.message || '';
    } catch {
      // ignore
    }

    // Some models on OpenRouter reject response_format: json_object — retry once without it.
    if (
      useJsonFormat &&
      response.status === 400 &&
      /response_format|json_object|json mode|structured/i.test(errDetail)
    ) {
      return callOpenRouterOnce(key, model, prompt, { useJsonFormat: false });
    }

    const err = new Error(
      `שגיאה משירות OpenRouter (${response.status}): ${errDetail || response.statusText}`,
    );
    err.status = response.status;
    err.detail = errDetail;
    throw err;
  }

  const data = await response.json();
  const text = stripThinking(extractMessageText(data));
  if (!text) {
    throw new Error('התקבלה תשובה ריקה משירות OpenRouter.');
  }
  return text;
}

/**
 * Tests if the given OpenRouter API key (and optional model) works.
 */
export async function testOpenRouterApiKey(apiKey, { model } = {}) {
  const key = (apiKey || getOpenRouterApiKey()).trim();
  if (!key) {
    return { ok: false, error: 'לא הוזן מפתח API.' };
  }

  try {
    await promptOpenRouter('Return a JSON object: {"status": "ok"}', {
      apiKey: key,
      model: model || getOpenRouterModel(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'שגיאה באימות המפתח.' };
  }
}

/**
 * Calls OpenRouter Chat Completions API from the browser.
 * Tries the configured/selected model first, falling back only when a model is unavailable (404/503).
 */
export async function promptOpenRouter(prompt, { apiKey, model } = {}) {
  const key = (apiKey || getOpenRouterApiKey()).trim();
  if (!key) {
    throw new Error('לא הוגדר מפתח OpenRouter API. הזן מפתח כדי להשתמש ב-AI.');
  }

  console.log('[OpenRouter AI] Using key', maskSecret(key));

  const preferred = (model || getOpenRouterModel()).trim() || DEFAULT_MODEL;
  const models = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];

  let lastError = null;

  for (const candidate of models) {
    try {
      console.log('[OpenRouter AI] Trying model', candidate);
      return await callOpenRouterOnce(key, candidate, prompt);
    } catch (err) {
      lastError = err;
      const detail = String(err?.detail || err?.message || '');

      if (err?.status === 401 || err?.status === 403) {
        throw new Error(
          `מפתח ה-OpenRouter API אינו תקין או חסר הרשאות (${err.status})${detail ? ': ' + detail : ''}. אנא בדוק את המפתח ב-openrouter.ai.`,
        );
      }
      if (err?.status === 402) {
        throw new Error(
          'אין מספיק יתרה בחשבון ה-OpenRouter למודל שנבחר (402). אפשר להטעין יתרה או לבחור במודל החינמי (openrouter/free).',
        );
      }
      if (err?.status === 429) {
        throw new Error('חרגת ממגבלת הבקשות של OpenRouter (429). המתן מספר שניות ונסה שוב.');
      }

      const tryNext =
        err?.status === 404 ||
        err?.status === 503 ||
        /no endpoints found|not found|unavailable|overloaded|provider returned error/i.test(detail);

      if (tryNext) {
        console.warn('[OpenRouter AI] model unavailable, trying next:', candidate, detail);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('לא נמצא מודל OpenRouter זמין עבור המפתח הזה.');
}
