/**
 * Gemini AI Provider for in-browser GEDCOM editing.
 * Works seamlessly across Mobile (iOS/Android), Safari, Firefox, and Chrome.
 */

const STORAGE_KEY = 'anafim_gemini_api_key';
const DEFAULT_MODEL = 'gemini-1.5-flash';

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
      model: DEFAULT_MODEL,
    });
    if (text && text.includes('ok')) {
      return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'שגיאה באימות המפתח.' };
  }
}

/**
 * Calls Google Gemini REST API directly from the browser with structured JSON output.
 */
export async function promptGemini(prompt, { apiKey, model = DEFAULT_MODEL } = {}) {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('לא הוגדר מפתח Gemini API. הזן מפתח כדי להשתמש ב-AI.');
  }

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
    } catch {}

    if (response.status === 400 || response.status === 403) {
      throw new Error(
        `מפתח ה-Gemini API אינו תקין או חסר הרשאות (${response.status})${errDetail ? ': ' + errDetail : ''}. אנא בדוק את המפתח ב-Google AI Studio.`,
      );
    }
    if (response.status === 429) {
      throw new Error('חרגת ממגבלת הבקשות החינמית של Gemini. אנא המתן מספר שניות ונסה שוב.');
    }
    throw new Error(`שגיאה משירות Gemini (${response.status}): ${errDetail || response.statusText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('התקבלה תשובה ריקה משירות Gemini.');
  }
  return text.trim();
}
