/**
 * Device-local persistence for keeping the E2EE vault unlocked on a trusted personal device.
 *
 * Security model:
 * - Stores the AES-GCM CryptoKey object directly in IndexedDB via structured cloning
 *   (never serialized to localStorage or sessionStorage, never sent to any server).
 * - Optionally caches the latest snapshot encrypted with that same AES-GCM CryptoKey
 *   for instant and offline mobile startup.
 * - Explicitly locking, logging out, erasing the vault, or disabling the setting
 *   immediately deletes all stored device keys and encrypted caches.
 */

const DB_NAME = 'anafim-vault-device-v1';
const KEY_STORE = 'keys';
const CACHE_STORE = 'cache';
const REMEMBER_PREF_KEY = 'anafim-vault-remember-pref-v1';
const HAS_KEY_FLAG = 'anafim-vault-has-device-key-v1';

const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });

let dbPromise = null;

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function loadRememberDevicePref() {
  try {
    return safeStorage()?.getItem(REMEMBER_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveRememberDevicePref(enabled) {
  try {
    safeStorage()?.setItem(REMEMBER_PREF_KEY, enabled ? '1' : '0');
  } catch {}
}

/** Fast synchronous check on initial render so returning vault users are not shown UploadDialog. */
export function hasRememberedVaultSync() {
  try {
    return safeStorage()?.getItem(HAS_KEY_FLAG) === '1';
  } catch {
    return false;
  }
}

function setHasKeyFlag(present) {
  try {
    const store = safeStorage();
    if (!store) return;
    if (present) store.setItem(HAS_KEY_FLAG, '1');
    else store.removeItem(HAS_KEY_FLAG);
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
        if (!db.objectStoreNames.contains(KEY_STORE)) {
          db.createObjectStore(KEY_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error || new Error('Failed to open vault device DB'));
    }).catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

const recordId = (userId, vaultId) => `${userId}:${vaultId}`;

function withStore(storeName, mode, fn) {
  return openDb().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        let req;
        try {
          req = fn(tx.objectStore(storeName));
        } catch (err) {
          reject(err);
          return;
        }
        let value;
        if (req && typeof req === 'object' && 'onsuccess' in req) {
          req.onsuccess = () => {
            value = req.result;
          };
        }
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      })
  );
}

/** Save an unlocked CryptoKey in IndexedDB for this user+vault. */
export async function saveDeviceVaultKey(userId, vaultId, key) {
  if (!userId || !vaultId || !key) return false;
  try {
    await withStore(KEY_STORE, 'readwrite', store =>
      store.put({
        id: recordId(userId, vaultId),
        userId,
        vaultId,
        key,
        savedAt: new Date().toISOString(),
      })
    );
    setHasKeyFlag(true);
    return true;
  } catch {
    return false;
  }
}

/** Load a previously saved CryptoKey for this user+vault (or null). */
export async function loadDeviceVaultKey(userId, vaultId) {
  if (!userId || !vaultId) return null;
  try {
    const rec = await withStore(KEY_STORE, 'readonly', store => store.get(recordId(userId, vaultId)));
    return rec?.key || null;
  } catch {
    return null;
  }
}

/** Save an encrypted copy of the latest vault snapshot for instant / offline startup. */
export async function saveDeviceVaultCache(userId, head, payload, key) {
  if (!userId || !head?.vault_id || !head?.revision_id || !payload || !key || !globalThis.crypto?.subtle) {
    return false;
  }
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = te.encode(JSON.stringify(['anafim-device-cache', 1, userId, head.vault_id, head.revision_id]));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
        key,
        te.encode(JSON.stringify(payload))
      )
    );
    await withStore(CACHE_STORE, 'readwrite', store =>
      store.put({
        id: recordId(userId, head.vault_id),
        userId,
        vaultId: head.vault_id,
        head,
        iv,
        ciphertext,
        savedAt: new Date().toISOString(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** Load and decrypt the device-cached vault snapshot for a given userId (optionally matching vaultId). */
export async function loadDeviceVaultCache(userId, vaultId, key) {
  if (!userId || !key || !globalThis.crypto?.subtle) return null;
  try {
    const rec = vaultId
      ? await withStore(CACHE_STORE, 'readonly', store => store.get(recordId(userId, vaultId)))
      : (await withStore(CACHE_STORE, 'readonly', store => store.getAll()))?.find(r => r.userId === userId);
    if (!rec?.head?.revision_id || !rec.iv || !rec.ciphertext) return null;
    const aad = te.encode(JSON.stringify(['anafim-device-cache', 1, userId, rec.vaultId, rec.head.revision_id]));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(rec.iv), additionalData: aad, tagLength: 128 },
      key,
      new Uint8Array(rec.ciphertext)
    );
    const payload = JSON.parse(td.decode(new Uint8Array(plain)));
    if (payload?.format !== 'anafim-snapshot' || payload.version !== 1) return null;
    return { head: rec.head, payload };
  } catch {
    return null;
  }
}

/** Load any stored key+cache pair for a user (used when offline and head() cannot be reached). */
export async function loadAnyDeviceVaultForUser(userId) {
  if (!userId) return null;
  try {
    const keys = await withStore(KEY_STORE, 'readonly', store => store.getAll());
    const rec = Array.isArray(keys) ? keys.find(r => r.userId === userId && r.key) : null;
    if (!rec) return null;
    const cached = await loadDeviceVaultCache(userId, rec.vaultId, rec.key);
    if (!cached) return null;
    return { key: rec.key, head: cached.head, payload: cached.payload };
  } catch {
    return null;
  }
}

/** Delete stored device keys and encrypted caches (for a specific user/vault or all). */
export async function clearDeviceVaultState(userId = null, vaultId = null) {
  if (!userId) setHasKeyFlag(false);
  try {
    if (userId && vaultId) {
      const id = recordId(userId, vaultId);
      await withStore(KEY_STORE, 'readwrite', store => store.delete(id));
      await withStore(CACHE_STORE, 'readwrite', store => store.delete(id));
      const remaining = await withStore(KEY_STORE, 'readonly', store => store.getAll());
      if (!Array.isArray(remaining) || remaining.length === 0) setHasKeyFlag(false);
      return;
    }
    await withStore(KEY_STORE, 'readwrite', store => store.clear());
    await withStore(CACHE_STORE, 'readwrite', store => store.clear());
    setHasKeyFlag(false);
  } catch {
    setHasKeyFlag(false);
  }
}
