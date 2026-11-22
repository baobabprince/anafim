/**
 * IndexedDB storage for saved GEDCOM files, with automatic migration from legacy
 * localStorage keys and graceful fallback when IndexedDB is unavailable.
 *
 * Moving multi-megabyte GEDCOM text out of localStorage avoids 5MB QuotaExceededError
 * and prevents synchronous JSON.stringify/parse freezes on mobile devices.
 */
const DB_NAME = 'anafim-files-v1';
const STORE_NAME = 'files';
const LEGACY_FILES_KEY = 'anafim-saved-files-v1';
const LEGACY_SINGLE_KEY = 'anafim-gedcom-v1';
const ACTIVE_ID_KEY = 'anafim-active-file-id-v1';
const META_LIST_KEY = 'anafim-saved-files-meta-v1';

let dbPromise = null;
let migrationPromise = null;

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function getActiveStoredFileId() {
  try {
    return safeStorage()?.getItem(ACTIVE_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveStoredFileId(fileId) {
  try {
    const store = safeStorage();
    if (!store) return;
    if (fileId) store.setItem(ACTIVE_ID_KEY, fileId);
    else store.removeItem(ACTIVE_ID_KEY);
  } catch {}
}

/** Fast synchronous check on initial render to know whether the user already has saved trees. */
export function hasSavedFilesSync() {
  try {
    const store = safeStorage();
    if (!store) return false;
    const metaRaw = store.getItem(META_LIST_KEY);
    if (metaRaw) {
      const parsed = JSON.parse(metaRaw);
      if (Array.isArray(parsed) && parsed.length > 0) return true;
    }
    const legacyList = store.getItem(LEGACY_FILES_KEY);
    if (legacyList) {
      const parsed = JSON.parse(legacyList);
      if (Array.isArray(parsed) && parsed.length > 0) return true;
    }
    if (store.getItem(LEGACY_SINGLE_KEY)) return true;
  } catch {}
  return false;
}

function writeMetaCache(files) {
  try {
    const store = safeStorage();
    if (!store) return;
    const meta = files.map(f => ({
      id: f.id,
      filename: f.filename,
      encoding: f.encoding || 'utf-8',
      importedAt: f.importedAt || '',
      peopleCount: f.peopleCount ?? null,
    }));
    store.setItem(META_LIST_KEY, JSON.stringify(meta));
  } catch {}
}

function openDb() {
  if (typeof globalThis.indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error || new Error('Failed to open file storage DB'));
    }).catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function withFilesStore(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let result;
    try {
      result = fn(tx.objectStore(STORE_NAME));
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

function readLegacyLocalStorageFiles() {
  const store = safeStorage();
  if (!store) return [];
  try {
    const rawList = store.getItem(LEGACY_FILES_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) return parsed.filter(f => f && typeof f.raw === 'string');
    }
    const singleRaw = store.getItem(LEGACY_SINGLE_KEY);
    if (singleRaw) {
      const parsed = JSON.parse(singleRaw);
      if (parsed?.raw) {
        return [{
          id: 'file-' + (parsed.importedAt ? new Date(parsed.importedAt).getTime() : Date.now()),
          filename: parsed.filename || 'קובץ שמור.ged',
          raw: parsed.raw,
          encoding: parsed.encoding || 'utf-8',
          encodingInfo: parsed.encodingInfo,
          importedAt: parsed.importedAt || new Date().toISOString(),
        }];
      }
    }
  } catch {}
  return [];
}

async function ensureMigrated() {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const legacy = readLegacyLocalStorageFiles();
    if (!legacy.length) return;
    try {
      await withFilesStore('readwrite', store => {
        for (const item of legacy) {
          store.put({
            id: item.id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            filename: item.filename || 'קובץ שמור.ged',
            raw: item.raw,
            encoding: item.encoding || 'utf-8',
            encodingInfo: item.encodingInfo || null,
            importedAt: item.importedAt || new Date().toISOString(),
            peopleCount: item.peopleCount ?? null,
          });
        }
      });
      const ls = safeStorage();
      if (ls) {
        if (!ls.getItem(ACTIVE_ID_KEY) && legacy[0]?.id) {
          ls.setItem(ACTIVE_ID_KEY, legacy[0].id);
        }
        ls.removeItem(LEGACY_FILES_KEY);
        ls.removeItem(LEGACY_SINGLE_KEY);
      }
      writeMetaCache(legacy);
    } catch {
      // Keep legacy localStorage intact if IndexedDB is unavailable.
    }
  })();
  return migrationPromise;
}

export async function listSavedFiles() {
  try {
    await ensureMigrated();
    const files = await openDb().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    }));
    files.sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
    writeMetaCache(files);
    return files;
  } catch {
    return readLegacyLocalStorageFiles();
  }
}

export async function getActiveSavedFile() {
  const files = await listSavedFiles();
  if (!files.length) return null;
  const activeId = getActiveStoredFileId();
  return files.find(f => f.id === activeId) || files[0];
}

export async function saveStoredFile(fileItem) {
  const record = {
    id: fileItem.id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: fileItem.filename || 'family.ged',
    raw: fileItem.raw,
    encoding: fileItem.encoding || 'utf-8',
    encodingInfo: fileItem.encodingInfo || null,
    importedAt: fileItem.importedAt || new Date().toISOString(),
    peopleCount: fileItem.peopleCount ?? fileItem.data?.stats?.people ?? null,
  };

  try {
    await ensureMigrated();
    const existing = await listSavedFiles();
    const match = existing.find(f => f.id === record.id || (f.filename === record.filename && f.raw === record.raw));
    if (match) record.id = match.id;
    await withFilesStore('readwrite', store => {
      store.put(record);
    });
    setActiveStoredFileId(record.id);
    const updatedList = [...existing.filter(f => f.id !== record.id), record];
    writeMetaCache(updatedList);
    return record;
  } catch {
    // Fallback to localStorage if IndexedDB fails
    try {
      const store = safeStorage();
      if (!store) return null;
      const list = readLegacyLocalStorageFiles();
      const idx = list.findIndex(f => f.id === record.id || (f.filename === record.filename && f.raw === record.raw));
      if (idx >= 0) {
        record.id = list[idx].id;
        list[idx] = record;
      } else {
        list.push(record);
      }
      store.setItem(LEGACY_FILES_KEY, JSON.stringify(list));
      setActiveStoredFileId(record.id);
      writeMetaCache(list);
      return record;
    } catch {
      return null;
    }
  }
}

export async function deleteStoredFile(fileId) {
  try {
    await ensureMigrated();
    await withFilesStore('readwrite', store => {
      store.delete(fileId);
    });
    const remaining = await listSavedFiles();
    if (getActiveStoredFileId() === fileId) {
      setActiveStoredFileId(remaining[0]?.id || null);
    }
    writeMetaCache(remaining);
    return remaining;
  } catch {
    const store = safeStorage();
    const remaining = readLegacyLocalStorageFiles().filter(f => f.id !== fileId);
    try {
      if (store) store.setItem(LEGACY_FILES_KEY, JSON.stringify(remaining));
      if (getActiveStoredFileId() === fileId) {
        setActiveStoredFileId(remaining[0]?.id || null);
      }
      writeMetaCache(remaining);
    } catch {}
    return remaining;
  }
}
