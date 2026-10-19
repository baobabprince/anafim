import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  clear() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
}

global.localStorage = new LocalStorageMock();

const STORAGE_FILES_KEY = 'anafim-saved-files-v1';
const STORAGE_ACTIVE_ID_KEY = 'anafim-active-file-id-v1';
const OLD_CACHE_KEY = 'anafim-gedcom-v1';

function getSavedFilesList() {
  try {
    const rawList = localStorage.getItem(STORAGE_FILES_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) return parsed;
    }
    const oldSaved = localStorage.getItem(OLD_CACHE_KEY);
    if (oldSaved) {
      const parsedOld = JSON.parse(oldSaved);
      if (parsedOld?.raw) {
        const migratedItem = {
          id: 'file-' + (parsedOld.importedAt ? new Date(parsedOld.importedAt).getTime() : Date.now()),
          filename: parsedOld.filename || 'קובץ שמור.ged',
          raw: parsedOld.raw,
          encoding: parsedOld.encoding || 'utf-8',
          encodingInfo: parsedOld.encodingInfo,
          importedAt: parsedOld.importedAt || new Date().toISOString()
        };
        const newList = [migratedItem];
        localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(newList));
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, migratedItem.id);
        localStorage.removeItem(OLD_CACHE_KEY);
        return newList;
      }
    }
  } catch {}
  return [];
}

function saveFileToLocalStorage(fileItem) {
  try {
    const list = getSavedFilesList();
    const existingIndex = list.findIndex(f => f.id === fileItem.id || (f.filename === fileItem.filename && f.raw === fileItem.raw));
    const newItem = {
      id: fileItem.id || ('file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
      filename: fileItem.filename,
      raw: fileItem.raw,
      encoding: fileItem.encoding || 'utf-8',
      encodingInfo: fileItem.encodingInfo,
      importedAt: fileItem.importedAt || new Date().toISOString()
    };
    if (existingIndex >= 0) {
      list[existingIndex] = newItem;
    } else {
      list.push(newItem);
    }
    localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(list));
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newItem.id);
    return newItem;
  } catch (err) {
    return null;
  }
}

function removeFileFromLocalStorage(fileId) {
  try {
    const list = getSavedFilesList().filter(f => f.id !== fileId);
    localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(list));
    const activeId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
    if (activeId === fileId) {
      if (list.length > 0) {
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, list[0].id);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_ID_KEY);
      }
    }
    return list;
  } catch (err) {
    return [];
  }
}

test('multi-file storage: empty storage returns empty list', () => {
  localStorage.clear();
  const list = getSavedFilesList();
  assert.deepEqual(list, []);
});

test('multi-file storage: saves new file and retrieves it', () => {
  localStorage.clear();
  const fileData = {
    filename: 'test.ged',
    raw: '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME John /Doe/\n0 TLR',
    encoding: 'utf-8',
    importedAt: '2025-01-01T00:00:00.000Z'
  };
  const saved = saveFileToLocalStorage(fileData);
  assert.ok(saved.id);
  assert.equal(saved.filename, 'test.ged');

  const list = getSavedFilesList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, saved.id);
  assert.equal(list[0].filename, 'test.ged');
});

test('multi-file storage: saves multiple files and removes a file', () => {
  localStorage.clear();
  const f1 = saveFileToLocalStorage({ filename: 'file1.ged', raw: 'file1 content' });
  const f2 = saveFileToLocalStorage({ filename: 'file2.ged', raw: 'file2 content' });

  let list = getSavedFilesList();
  assert.equal(list.length, 2);

  removeFileFromLocalStorage(f1.id);
  list = getSavedFilesList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, f2.id);
});

test('multi-file storage: migrates old single-file storage format', () => {
  localStorage.clear();
  localStorage.setItem('anafim-gedcom-v1', JSON.stringify({
    raw: '0 HEAD\n0 TLR',
    filename: 'old.ged',
    encoding: 'utf-8',
    importedAt: '2024-05-01T00:00:00.000Z'
  }));

  const list = getSavedFilesList();
  assert.equal(list.length, 1);
  assert.equal(list[0].filename, 'old.ged');
  assert.equal(localStorage.getItem('anafim-gedcom-v1'), null);
});
