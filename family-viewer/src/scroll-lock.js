/** Ref-counted body scroll lock so nested dialogs/menus cannot leave overflow stuck. */
let scrollLockCount = 0;

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) {
    document.body.dataset.anafimPrevOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (scrollLockCount <= 0) {
    scrollLockCount = 0;
    return;
  }
  scrollLockCount -= 1;
  if (scrollLockCount === 0) {
    document.body.style.overflow = document.body.dataset.anafimPrevOverflow || '';
    delete document.body.dataset.anafimPrevOverflow;
  }
}

/** Hard reset after import / navigation when lock state may be inconsistent. */
export function forceUnlockBodyScroll() {
  if (typeof document === 'undefined') return;
  scrollLockCount = 0;
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  delete document.body.dataset.anafimPrevOverflow;
}
