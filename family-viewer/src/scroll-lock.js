/**
 * Token-based, self-healing body scroll lock for mobile and desktop overlays.
 * Prevents nested dialogs, sidebars, and mobile file-picker flows from leaving
 * document scrolling stuck in Family or People views.
 */
const activeLocks = new Set();
const legacyStack = [];
const LOCK_CLASS = 'anafim-scroll-locked';
const OVERLAY_SELECTOR = '.modal-backdrop, .fx-gallery-backdrop, .fx-path-backdrop, .sidebar.sidebar-open';
let listenersInstalled = false;
let verifyTimer = null;

function isVisibleOverlay(el) {
  if (!el || !el.isConnected) return false;
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
}

export function hasActiveScrollOverlay() {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false;
  const nodes = document.querySelectorAll(OVERLAY_SELECTOR);
  for (const node of nodes) {
    if (isVisibleOverlay(node)) return true;
  }
  return false;
}

function blurStaleOverlayFocus() {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return;
  const isFileInput = active.tagName === 'INPUT' && active.type === 'file';
  const inClosedSidebar = typeof active.closest === 'function' && Boolean(active.closest('.sidebar:not(.sidebar-open)'));
  if (!active.isConnected || isFileInput || inClosedSidebar) {
    active.blur?.();
  }
}

function applyUnlockedStyles() {
  if (typeof document === 'undefined') return;
  const { body, documentElement } = document;
  documentElement?.classList?.remove(LOCK_CLASS);
  body?.classList?.remove(LOCK_CLASS);
  if (body?.style) {
    body.style.overflow = '';
    body.style.overflowY = '';
    body.style.position = '';
    body.style.top = '';
    body.style.width = '';
    body.style.touchAction = '';
  }
  if (documentElement?.style) {
    documentElement.style.overflow = '';
    documentElement.style.overflowY = '';
    documentElement.style.touchAction = '';
  }
  if (body?.dataset) {
    delete body.dataset.anafimPrevOverflow;
  }
}

function applyLockedStyles() {
  if (typeof document === 'undefined') return;
  const { body, documentElement } = document;
  documentElement?.classList?.add(LOCK_CLASS);
  body?.classList?.add(LOCK_CLASS);
  if (body?.style) {
    body.style.overflow = 'hidden';
  }
}

function schedulePostUnlockVerify() {
  if (typeof window === 'undefined') return;
  if (verifyTimer !== null) {
    clearTimeout(verifyTimer);
    verifyTimer = null;
  }
  const verify = () => {
    if (activeLocks.size === 0 || !hasActiveScrollOverlay()) {
      activeLocks.clear();
      legacyStack.length = 0;
      applyUnlockedStyles();
      blurStaleOverlayFocus();
      // Trigger a lightweight layout read so mobile compositors refresh scrollability.
      void document.body?.offsetHeight;
    }
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(verify);
  }
  verifyTimer = setTimeout(() => {
    verifyTimer = null;
    verify();
  }, 80);
}

function ensureSelfHealListeners() {
  if (listenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  listenersInstalled = true;
  const healIfNoOverlay = () => {
    const locked =
      activeLocks.size > 0 ||
      document.body?.classList?.contains(LOCK_CLASS) ||
      document.documentElement?.classList?.contains(LOCK_CLASS) ||
      document.body?.style?.overflow === 'hidden' ||
      document.documentElement?.style?.overflow === 'hidden';
    if (!locked) return;
    if (!hasActiveScrollOverlay()) {
      activeLocks.clear();
      legacyStack.length = 0;
      applyUnlockedStyles();
      blurStaleOverlayFocus();
    }
  };
  window.addEventListener('touchstart', healIfNoOverlay, { passive: true, capture: true });
  window.addEventListener('wheel', healIfNoOverlay, { passive: true, capture: true });
  window.addEventListener('focus', healIfNoOverlay);
  window.addEventListener('pageshow', healIfNoOverlay);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') healIfNoOverlay();
  });
}

/** Acquire a body scroll lock and return an idempotent release function. */
export function acquireBodyScrollLock() {
  if (typeof document === 'undefined') return () => {};
  ensureSelfHealListeners();
  if (verifyTimer !== null) {
    clearTimeout(verifyTimer);
    verifyTimer = null;
  }
  const token = Symbol('scroll-lock');
  if (activeLocks.size === 0) {
    applyLockedStyles();
  }
  activeLocks.add(token);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks.delete(token);
    if (activeLocks.size === 0) {
      applyUnlockedStyles();
      schedulePostUnlockVerify();
    }
  };
}

export function lockBodyScroll() {
  const release = acquireBodyScrollLock();
  legacyStack.push(release);
}

export function unlockBodyScroll() {
  const release = legacyStack.pop();
  if (release) {
    release();
  } else if (activeLocks.size === 0) {
    applyUnlockedStyles();
  }
}

/** Synchronize body scroll lock with actual visible overlays in the DOM. */
export function syncBodyScrollLock() {
  if (typeof document === 'undefined') return;
  if (!hasActiveScrollOverlay()) {
    activeLocks.clear();
    legacyStack.length = 0;
    applyUnlockedStyles();
    blurStaleOverlayFocus();
  }
}

/** Hard reset after import / navigation when lock state may be inconsistent. */
export function forceUnlockBodyScroll() {
  if (typeof document === 'undefined') return;
  activeLocks.clear();
  legacyStack.length = 0;
  applyUnlockedStyles();
  blurStaleOverlayFocus();
  schedulePostUnlockVerify();
}

/** Restore focus without yanking scroll position or focusing hidden off-screen elements. */
export function restoreFocusSafely(element) {
  if (!element || typeof element.focus !== 'function' || !element.isConnected) return;
  if (typeof document !== 'undefined' && (element === document.body || element === document.documentElement)) return;
  if (typeof element.closest === 'function' && element.closest('.sidebar:not(.sidebar-open)')) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}
