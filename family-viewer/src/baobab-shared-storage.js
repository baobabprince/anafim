/**
 * baobab-shared-storage.js
 * Shared localStorage between baobabprince GitHub Pages apps
 * (same origin: https://baobabprince.github.io)
 *
 * Key: baobab:shared:export:v1
 * Shape:
 * {
 *   version: 1,
 *   source: 'anafim' | 'genea-net' | ...
 *   exportedAt: ISO string,
 *   filename: string,
 *   encoding: string,
 *   gedcom: string,
 *   meta?: { personCount?, familyCount?, title? }
 * }
 */

export const SHARED_KEY = 'baobab:shared:export:v1';
export const SHARED_VERSION = 1;

/**
 * @param {{ source: string, filename?: string, gedcom: string, encoding?: string, meta?: object }} opts
 */
export function saveSharedExport(opts) {
  if (!opts || typeof opts.gedcom !== 'string' || !opts.gedcom.trim()) {
    throw new Error('gedcom text is required');
  }
  const payload = {
    version: SHARED_VERSION,
    source: opts.source || 'unknown',
    exportedAt: new Date().toISOString(),
    filename: opts.filename || 'family.ged',
    encoding: opts.encoding || 'utf-8',
    gedcom: opts.gedcom,
    meta: opts.meta || {},
  };
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('baobab shared save failed:', err);
    throw err;
  }
  return payload;
}

/** @returns {null | { version: number, source: string, exportedAt: string, filename: string, encoding: string, gedcom: string, meta: object }} */
export function loadSharedExport() {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SHARED_VERSION || typeof data.gedcom !== 'string') return null;
    return data;
  } catch (err) {
    console.error('baobab shared load failed:', err);
    return null;
  }
}

export function clearSharedExport() {
  try {
    localStorage.removeItem(SHARED_KEY);
  } catch (_) {}
}

export function hasSharedExport() {
  return !!loadSharedExport();
}

export function formatSharedSummary(data) {
  if (!data) return '';
  const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('he-IL') : '';
  const people = data.meta && data.meta.personCount != null ? `${data.meta.personCount} אנשים` : '';
  return [data.filename, data.source, when, people].filter(Boolean).join(' · ');
}
