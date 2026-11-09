/**
 * Gemini AI Provider for in-browser GEDCOM editing.
 * Works across Mobile (iOS/Android), Safari, Firefox, and Chrome.
 */

const STORAGE_KEY = 'anafim_gemini_api_key';

/** Prefer current free-tier flash models; 1.5-flash is no longer available on v1beta. */
const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
];

const DEFAULT_MODEL = MODEL_CANDIDATES[0];

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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

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
 * Tries several current model ids when the preferred one is missing (404).
 */
export async function promptGemini(prompt, { apiKey, model } = {}) {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('לא הוגדר מפתח Gemini API. הזן מפתח כדי להשתמש ב-AI.');
  }

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
      const notFound =
        err?.status === 404 || /not found|is not supported for generateContent/i.test(detail);
      if (notFound) {
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
