const DATABASE = 'anafim-photos-v1';
const STORE = 'photos';
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
let databasePromise;
const bundlePhotoIdsCache = new Map();

function invalidateBundlePhotoCache(fileId) {
  if (fileId) bundlePhotoIdsCache.delete(fileId);
}

const IMAGE_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/x-ms-bmp',
]);
const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('האחסון המקומי של תמונות אינו זמין בדפדפן הזה.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('fileId', 'fileId', { unique: false });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          databasePromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('לא ניתן לפתוח את אחסון התמונות המקומי.'));
      request.onblocked = () => reject(new Error('אחסון התמונות המקומי עסוק. יש לסגור לשוניות נוספות של ענפים ולנסות שוב.'));
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function withStore(mode, operation) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let result;
    try {
      result = operation(transaction.objectStore(STORE));
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('פעולת אחסון התמונות נכשלה.'));
    transaction.onabort = () => reject(transaction.error || new Error('פעולת אחסון התמונות בוטלה.'));
  }));
}

export function validatePhotoFile(file) {
  if (!file || !isImageFile(file)) throw new Error('יש לבחור קובץ תמונה מסוג JPEG, PNG, GIF, WebP, AVIF או BMP.');
  if (!file.size) throw new Error('קובץ התמונה ריק.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('התמונה גדולה מ־15MB. יש לבחור תמונה קטנה יותר.');
  return file;
}

export function isImageFile(file) {
  if (!file || !IMAGE_EXTENSIONS.test(file.name || '')) return false;
  return !file.type || IMAGE_TYPES.has(file.type.toLowerCase());
}

function mediaBasename(path) {
  const clean = String(path || '').trim().replace(/^["']|["']$/g, '').replace(/[?#].*$/, '');
  return clean.split(/[\\/]/).at(-1)?.normalize('NFKC').toLocaleLowerCase() || '';
}

export function resolveGedcomPhotos(data, files = []) {
  const byName = new Map();
  for (const file of files) {
    if (!isImageFile(file)) continue;
    validatePhotoFile(file);
    const name = mediaBasename(file.name);
    if (name) byName.set(name, [...(byName.get(name) || []), file]);
  }
  const photos = {};
  let matched = 0;
  let unmatched = 0;
  for (const id of data.order) {
    const paths = data.people[id].images || [];
    if (!paths.length) continue;
    const matchedFiles = paths.map(mediaBasename).map(name => {
      const matches = byName.get(name);
      return matches?.length === 1 ? matches[0] : null;
    }).filter(Boolean);
    if (matchedFiles.length) {
      photos[id] = matchedFiles;
      matched++;
    } else {
      unmatched++;
    }
  }
  return { photos, matched, unmatched };
}

function photoKey(fileId, personId) {
  return `${fileId}\u0000${personId}`;
}

export function savePersonPhotos(fileId, personId, blobs) {
  if (!fileId || !personId || !Array.isArray(blobs) || !blobs.length || blobs.some(blob => !(blob instanceof Blob))) {
    return Promise.reject(new Error('פרטי התמונה לשמירה אינם תקינים.'));
  }
  invalidateBundlePhotoCache(fileId);
  return withStore('readwrite', store => {
    store.put({ key: photoKey(fileId, personId), fileId, personId, photos:blobs });
  });
}

export function addPersonPhotos(fileId, personId, blobs) {
  if (!fileId || !personId || !Array.isArray(blobs) || !blobs.length || blobs.some(blob => !(blob instanceof Blob))) {
    return Promise.reject(new Error('פרטי התמונות לשמירה אינם תקינים.'));
  }
  invalidateBundlePhotoCache(fileId);
  return withStore('readwrite', store => {
    const key = photoKey(fileId, personId);
    const request = store.get(key);
    request.onsuccess = () => {
      const current = request.result?.photos || (request.result?.blob ? [request.result.blob] : []);
      store.put({ key, fileId, personId, photos:[...current, ...blobs] });
    };
  });
}

/** Return the set of person IDs in a bundle that have stored photos (cached per fileId). */
export function getBundlePhotoPersonIds(fileId) {
  if (!fileId) return Promise.resolve(new Set());
  if (!bundlePhotoIdsCache.has(fileId)) {
    const prefix = `${fileId}\u0000`;
    const promise = openDatabase().then(db => new Promise((resolve, reject) => {
      let request;
      try {
        request = db.transaction(STORE, 'readonly').objectStore(STORE).index('fileId').getAllKeys(IDBKeyRange.only(fileId));
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => {
        const ids = new Set();
        for (const key of request.result || []) {
          if (typeof key === 'string' && key.startsWith(prefix)) {
            ids.add(key.slice(prefix.length));
          }
        }
        resolve(ids);
      };
      request.onerror = () => reject(request.error || new Error('לא ניתן לקרוא את רשימת התמונות מהאחסון המקומי.'));
    })).catch(error => {
      bundlePhotoIdsCache.delete(fileId);
      throw error;
    });
    bundlePhotoIdsCache.set(fileId, promise);
  }
  return bundlePhotoIdsCache.get(fileId);
}

export function getPersonPhotos(fileId, personId) {
  if (!fileId || !personId) return Promise.resolve([]);
  return openDatabase().then(db => new Promise((resolve, reject) => {
    let request;
    try {
      request = db.transaction(STORE, 'readonly').objectStore(STORE).get(photoKey(fileId, personId));
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result?.photos || (request.result?.blob ? [request.result.blob] : []));
    request.onerror = () => reject(request.error || new Error('לא ניתן לקרוא את התמונה מהאחסון המקומי.'));
  }));
}

export function deletePersonPhoto(fileId, personId, photoIndex) {
  if (!fileId || !personId) return Promise.resolve();
  invalidateBundlePhotoCache(fileId);
  return withStore('readwrite', store => {
    const key = photoKey(fileId, personId);
    if (!Number.isInteger(photoIndex)) {
      store.delete(key);
      return;
    }
    const request = store.get(key);
    request.onsuccess = () => {
      if (!request.result) return;
      const photos = request.result.photos || (request.result.blob ? [request.result.blob] : []);
      photos.splice(photoIndex, 1);
      if (photos.length) store.put({ key, fileId, personId, photos });
      else store.delete(key);
    };
  });
}

export function deleteBundlePhotos(fileId) {
  if (!fileId) return Promise.resolve();
  invalidateBundlePhotoCache(fileId);
  return withStore('readwrite', store => {
    const request = store.index('fileId').openKeyCursor(IDBKeyRange.only(fileId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}
