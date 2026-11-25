import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRememberDevicePref,
  saveRememberDevicePref,
  hasRememberedVaultSync,
  saveDeviceVaultKey,
  loadDeviceVaultKey,
  saveDeviceVaultCache,
  loadDeviceVaultCache,
  loadAnyDeviceVaultForUser,
  clearDeviceVaultState,
} from '../src/vault-device-key.js';

function makeMemoryLocalStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    clear: () => map.clear(),
  };
}

function makeFakeIndexedDB() {
  const stores = new Map();
  const makeReq = exec => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      try {
        req.result = exec();
        req.onsuccess?.();
      } catch (err) {
        req.error = err;
        req.onerror?.();
      }
    });
    return req;
  };
  return {
    open(_name, _version) {
      const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      const db = {
        objectStoreNames: { contains: name => stores.has(name) },
        createObjectStore: name => {
          stores.set(name, new Map());
        },
        close() {},
        transaction(storeName) {
          const map = stores.get(storeName);
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const finish = () => queueMicrotask(() => tx.oncomplete?.());
          tx.objectStore = () => ({
            put: rec => {
              const r = makeReq(() => {
                map.set(rec.id, rec);
                return rec.id;
              });
              finish();
              return r;
            },
            get: id => {
              const r = makeReq(() => map.get(id));
              finish();
              return r;
            },
            getAll: () => {
              const r = makeReq(() => [...map.values()]);
              finish();
              return r;
            },
            delete: id => {
              const r = makeReq(() => {
                map.delete(id);
              });
              finish();
              return r;
            },
            clear: () => {
              const r = makeReq(() => {
                map.clear();
              });
              finish();
              return r;
            },
          });
          return tx;
        },
      };
      req.result = db;
      queueMicrotask(() => {
        if (!stores.size) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

test('vault device persistence stores CryptoKey and encrypted cache in IndexedDB and wipes cleanly on lock', async () => {
  const prevStorage = globalThis.localStorage;
  const prevIdb = globalThis.indexedDB;
  const ls = makeMemoryLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(globalThis, 'indexedDB', { value: makeFakeIndexedDB(), configurable: true });

  try {
    assert.equal(loadRememberDevicePref(), true);
    assert.equal(hasRememberedVaultSync(), false);

    saveRememberDevicePref(false);
    assert.equal(loadRememberDevicePref(), false);
    saveRememberDevicePref(true);
    assert.equal(loadRememberDevicePref(), true);

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const userId = '11111111-2222-4333-8444-555555555555';
    const vaultId = '12345678-1111-4222-8333-123456789012';
    const head = {
      user_id: userId,
      vault_id: vaultId,
      revision_id: '12345678-1111-4222-8333-123456789001',
      generation: 1,
      envelope: { vaultId },
    };
    const payload = {
      format: 'anafim-snapshot',
      version: 1,
      raw: '0 HEAD\n0 @I1@ INDI\n1 NAME סוד משפחתי /פרטי/\n0 TRLR',
      filename: 'family.ged',
      encoding: 'utf-8',
      selectedId: '@I1@',
    };

    const savedKey = await saveDeviceVaultKey(userId, vaultId, key);
    assert.equal(savedKey, true);
    assert.equal(hasRememberedVaultSync(), true);

    const restoredKey = await loadDeviceVaultKey(userId, vaultId);
    assert.equal(restoredKey, key);

    const savedCache = await saveDeviceVaultCache(userId, head, payload, key);
    assert.equal(savedCache, true);

    const restoredCache = await loadDeviceVaultCache(userId, vaultId, restoredKey);
    assert.deepEqual(restoredCache.payload, payload);
    assert.equal(restoredCache.head.revision_id, head.revision_id);

    const offline = await loadAnyDeviceVaultForUser(userId);
    assert.equal(offline.key, key);
    assert.deepEqual(offline.payload, payload);

    // Wrong key must fail closed when reading encrypted cache
    const wrongKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    assert.equal(await loadDeviceVaultCache(userId, vaultId, wrongKey), null);

    // Clear on manual lock/logout removes both key and encrypted cache
    await clearDeviceVaultState(userId, vaultId);
    assert.equal(hasRememberedVaultSync(), false);
    assert.equal(await loadDeviceVaultKey(userId, vaultId), null);
    assert.equal(await loadAnyDeviceVaultForUser(userId), null);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: prevStorage, configurable: true });
    Object.defineProperty(globalThis, 'indexedDB', { value: prevIdb, configurable: true });
  }
});
