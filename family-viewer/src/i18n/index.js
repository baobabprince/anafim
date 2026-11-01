import he from './he.js';
import en from './en.js';

const DICTS = { he, en };
const STORAGE_KEY = 'anafim-lang-v1';
const listeners = new Set();

function detectInitial() {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get('lang') || '').toLowerCase();
    if (q === 'en' || q === 'he') return q;
  } catch {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'he') return stored;
  } catch {}
  return 'he';
}

let current = typeof window !== 'undefined' ? detectInitial() : 'he';

export function getLang() {
  return current;
}

export function applyDocumentLang(lang) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'he' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export function setLang(lang) {
  if (lang !== 'he' && lang !== 'en') return current;
  if (lang === current) return current;
  current = lang;
  applyDocumentLang(lang);
  listeners.forEach((fn) => {
    try { fn(lang); } catch {}
  });
  return current;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate key; supports {name} placeholders via params object. */
export function t(key, params) {
  const dict = DICTS[current] || DICTS.he;
  let text = dict[key] ?? DICTS.he[key] ?? key;
  if (params && typeof text === 'string') {
    text = text.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] != null ? String(params[name]) : `{${name}}`
    );
  }
  return text;
}

/** Call once at startup so <html> matches stored/URL lang before paint. */
export function initI18n() {
  applyDocumentLang(current);
  return current;
}

export const supportedLangs = ['he', 'en'];
