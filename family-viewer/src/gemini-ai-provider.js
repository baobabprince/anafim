/**
 * Gemini AI Provider for in-browser GEDCOM editing.
 * Works across Mobile (iOS/Android), Safari, Firefox, and Chrome.
 *
 * Security notes:
 * - API key is sent via x-goog-api-key header (not in the URL query string).
 * - Console logs never print full keys (only masked prefix…suffix).
 */

const STORAGE_KEY = 'anafim_gemini_api_key';

/** Current models (as of late 2026). Older 1.5 / 2.x flash ids return 404. */
const MODEL_CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
];

const DEFAULT_MODEL = MODEL_CANDIDATES[0];

/** Mask secrets for logs: show only ends. */
export function maskSecret(value, head = 4, tail = 4) {
  const s = String(value ?? '').trim();
  if (!s) return '(empty)';
  if (s.length <= head + tail + 1) return '***';
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

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

export function getGeminiApiKey() {
  try {
    const storage = getStorage();
    if (!storage) return '';
    return (storage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key) {
  try {
    const storage = getStorage();
    if (!storage) return;
    const clean = (key || '').trim();
    if (clean) {
      storage.setItem(STORAGE_KEY, clean);
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[Gemini AI] Failed to save API key to localStorage:', err);
  }
}

export function removeGeminiApiKey() {
  setGeminiApiKey('');
}

export function isGeminiAvailable() {
  return Boolean(getGeminiApiKey());
}

/**
 * Tests if the given API key is valid by sending a minimal test prompt.
 */
export async function testGeminiApiKey(apiKey) {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    return { ok: false, error: 'לא הוזן מפתח API.' };
  }

  try {
    const text = await promptGemini('Return a JSON object: {"status": "ok"}', {
      apiKey: key,
    });
    if (text && String(text).includes('ok')) {
      return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'שגיאה באימות המפתח.' };
  }
}

async function callGeminiOnce(key, model, prompt) {
  // Key in header only — avoids full secret in Network panel request URL
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    throw new Error('שגיאת רשת בהתחברות לשירות Gemini. אנא בדוק את החיבור לאינטרנט.');
  }

  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson?.error?.message || '';
    } catch {
      // ignore
    }

    const err = new Error(
      `שגיאה משירות Gemini (${response.status}): ${errDetail || response.statusText}`,
    );
    err.status = response.status;
    err.detail = errDetail;
    throw err;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text == null || text === '') {
    throw new Error('התקבלה תשובה ריקה משירות Gemini.');
  }
  return String(text).trim();
}

/**
 * Calls Google Gemini REST API from the browser with structured JSON output.
 * Tries several current model ids when the preferred one is missing (404/503).
 */
export async function promptGemini(prompt, { apiKey, model } = {}) {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('לא הוגדר מפתח Gemini API. הזן מפתח כדי להשתמש ב-AI.');
  }

  console.log('[Gemini AI] Using key', maskSecret(key));

  const models = model
    ? [model, ...MODEL_CANDIDATES.filter((m) => m !== model)]
    : [...MODEL_CANDIDATES];

  let lastError = null;

  for (const candidate of models) {
    try {
      console.log('[Gemini AI] Trying model', candidate);
      return await callGeminiOnce(key, candidate, prompt);
    } catch (err) {
      lastError = err;
      const detail = String(err?.detail || err?.message || '');
      const tryNext =
        err?.status === 404 ||
        err?.status === 503 ||
        /not found|no longer available|is not supported for generateContent|overloaded|unavailable/i.test(
          detail,
        );

      if (tryNext) {
        console.warn('[Gemini AI] model unavailable, trying next:', candidate, detail);
        continue;
      }

      if (err?.status === 400 || err?.status === 403) {
        throw new Error(
          `מפתח ה-Gemini API אינו תקין או חסר הרשאות (${err.status})${detail ? ': ' + detail : ''}. אנא בדוק את המפתח ב-Google AI Studio.`,
        );
      }
      if (err?.status === 429) {
        throw new Error('חרגת ממגבלת הבקשות החינמית של Gemini. אנא המתן מספר שניות ונסה שוב.');
      }
      throw err;
    }
  }

  throw lastError || new Error('לא נמצא מודל Gemini זמין עבור המפתח הזה.');
}
