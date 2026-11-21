import test from 'node:test';
import assert from 'node:assert/strict';

function createMockDom() {
  const listeners = new Map();
  const makeClassList = () => {
    const set = new Set();
    return {
      add: (...names) => names.forEach(n => set.add(n)),
      remove: (...names) => names.forEach(n => set.delete(n)),
      contains: name => set.has(name),
    };
  };
  let overlays = [];
  const docEl = {
    style: {},
    classList: makeClassList(),
  };
  const body = {
    style: {},
    dataset: {},
    classList: makeClassList(),
    offsetHeight: 900,
  };
  const doc = {
    documentElement: docEl,
    body,
    visibilityState: 'visible',
    activeElement: body,
    querySelectorAll: () => overlays,
    addEventListener: (type, fn) => {
      listeners.set(`doc:${type}`, [...(listeners.get(`doc:${type}`) || []), fn]);
    },
  };
  const win = {
    addEventListener: (type, fn) => {
      listeners.set(`win:${type}`, [...(listeners.get(`win:${type}`) || []), fn]);
    },
    getComputedStyle: el => el._style || { display: 'block', visibility: 'visible', pointerEvents: 'auto' },
    requestAnimationFrame: fn => setTimeout(fn, 0),
  };
  return {
    doc,
    win,
    setOverlays: next => { overlays = next; },
    dispatchWindow: type => {
      for (const fn of listeners.get(`win:${type}`) || []) fn();
    },
  };
}

test('acquireBodyScrollLock handles nested overlays and idempotent release', async () => {
  const env = createMockDom();
  globalThis.document = env.doc;
  globalThis.window = env.win;

  const mod = await import(`../src/scroll-lock.js?t=${Date.now()}-1`);
  const releaseMenu = mod.acquireBodyScrollLock();
  assert.equal(env.doc.body.style.overflow, 'hidden');
  assert.equal(env.doc.body.classList.contains('anafim-scroll-locked'), true);
  assert.equal(env.doc.documentElement.classList.contains('anafim-scroll-locked'), true);

  const releaseDialog = mod.acquireBodyScrollLock();
  // Calling releaseMenu twice must not unlock while dialog is still held.
  releaseMenu();
  releaseMenu();
  assert.equal(env.doc.body.style.overflow, 'hidden');

  releaseDialog();
  assert.equal(env.doc.body.style.overflow, '');
  assert.equal(env.doc.body.classList.contains('anafim-scroll-locked'), false);
  assert.equal(env.doc.documentElement.classList.contains('anafim-scroll-locked'), false);
});

test('self-heals stuck scroll lock on touchstart when no overlay is open', async () => {
  const env = createMockDom();
  globalThis.document = env.doc;
  globalThis.window = env.win;

  const mod = await import(`../src/scroll-lock.js?t=${Date.now()}-2`);
  mod.acquireBodyScrollLock();
  assert.equal(env.doc.body.style.overflow, 'hidden');

  // Overlay is visible -> touchstart must NOT unlock.
  env.setOverlays([{ isConnected: true }]);
  env.dispatchWindow('touchstart');
  assert.equal(env.doc.body.style.overflow, 'hidden');

  // Overlay removed from DOM -> touchstart MUST self-heal and unlock immediately.
  env.setOverlays([]);
  env.dispatchWindow('touchstart');
  assert.equal(env.doc.body.style.overflow, '');
  assert.equal(env.doc.body.classList.contains('anafim-scroll-locked'), false);
  assert.equal(env.doc.documentElement.classList.contains('anafim-scroll-locked'), false);
});

test('forceUnlockBodyScroll blurs stale file inputs and syncBodyScrollLock clears leaked locks', async () => {
  const env = createMockDom();
  globalThis.document = env.doc;
  globalThis.window = env.win;

  let blurred = false;
  env.doc.activeElement = {
    tagName: 'INPUT',
    type: 'file',
    isConnected: true,
    blur: () => { blurred = true; },
  };

  const mod = await import(`../src/scroll-lock.js?t=${Date.now()}-3`);
  mod.lockBodyScroll();
  mod.forceUnlockBodyScroll();
  assert.equal(blurred, true);
  assert.equal(env.doc.body.style.overflow, '');

  // Simulate an external stale overflow:hidden with no overlays open
  env.doc.body.style.overflow = 'hidden';
  mod.syncBodyScrollLock();
  assert.equal(env.doc.body.style.overflow, '');
});

test('restoreFocusSafely uses preventScroll and skips closed sidebar buttons', async () => {
  const env = createMockDom();
  globalThis.document = env.doc;
  globalThis.window = env.win;

  const mod = await import(`../src/scroll-lock.js?t=${Date.now()}-4`);

  let focusedOpts = null;
  mod.restoreFocusSafely({
    isConnected: true,
    closest: () => null,
    focus: opts => { focusedOpts = opts; },
  });
  assert.deepEqual(focusedOpts, { preventScroll: true });

  let hiddenFocused = false;
  mod.restoreFocusSafely({
    isConnected: true,
    closest: sel => (sel.includes('.sidebar:not(.sidebar-open)') ? {} : null),
    focus: () => { hiddenFocused = true; },
  });
  assert.equal(hiddenFocused, false);
});
