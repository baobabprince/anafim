#!/usr/bin/env python3
"""Apply mobile scroll-lock fix to App.jsx and FamilyExperience.jsx."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "family-viewer" / "src" / "App.jsx"
FX = ROOT / "family-viewer" / "src" / "FamilyExperience.jsx"

def patch_app(text: str) -> str:
    if "forceUnlockBodyScroll" in text and "from './scroll-lock.js'" in text:
        print("App.jsx already patched")
        return text
    old_imp = "import { addPersonPhotos, deleteBundlePhotos, deletePersonPhoto, getPersonPhotos, resolveGedcomPhotos, savePersonPhotos, validatePhotoFile } from './photo-storage.js';"
    new_imp = old_imp + "\nimport { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from './scroll-lock.js';"
    if old_imp not in text:
        raise SystemExit("App.jsx: photo-storage import not found")
    text = text.replace(old_imp, new_imp, 1)

    text = text.replace(
        "    const previous = document.activeElement;\n    const overflow = document.body.style.overflow;\n    document.body.style.overflow = 'hidden';",
        "    const previous = document.activeElement;\n    lockBodyScroll();",
        1,
    )
    text = text.replace(
        "    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previous?.focus?.(); };",
        "    return () => { unlockBodyScroll(); document.removeEventListener('keydown', handleKey); previous?.focus?.(); };",
        1,
    )
    text = text.replace(
        "    const previous = document.activeElement, overflow = document.body.style.overflow;\n    document.body.style.overflow = 'hidden';",
        "    const previous = document.activeElement;\n    lockBodyScroll();",
        1,
    )
    text = text.replace(
        "    return () => { document.removeEventListener('keydown',key); document.body.style.overflow = overflow; previous?.focus?.(); };",
        "    return () => { document.removeEventListener('keydown',key); unlockBodyScroll(); previous?.focus?.(); };",
        1,
    )
    text = text.replace(
        "setBundle(result); setHistory({ ids:[result.isDemo ? DEMO_ROOT : result.data.order[0]], cursor:0 }); setQuery(''); setParentFamily(''); setView('family'); setModal(null); setMobileMenu(false); window.scrollTo({top:0,behavior:'instant'});",
        "setBundle(result); setHistory({ ids:[result.isDemo ? DEMO_ROOT : result.data.order[0]], cursor:0 }); setQuery(''); setParentFamily(''); setView('family'); setModal(null); setMobileMenu(false); forceUnlockBodyScroll(); window.scrollTo({top:0,behavior:'instant'});",
        1,
    )
    if "forceUnlockBodyScroll()" not in text:
        raise SystemExit("App.jsx: forceUnlock not applied")
    if "lockBodyScroll()" not in text:
        raise SystemExit("App.jsx: lockBodyScroll not applied")
    return text

def patch_fx(text: str) -> str:
    if "from './scroll-lock.js'" in text:
        print("FamilyExperience.jsx already patched")
        return text
    old = "import { usePersonPhoto, usePersonPhotos } from './PersonPhotoContext.jsx';"
    new = old + "\nimport { lockBodyScroll, unlockBodyScroll } from './scroll-lock.js';"
    if old not in text:
        raise SystemExit("FamilyExperience: import not found")
    text = text.replace(old, new, 1)
    text = text.replace(
        "    const previousOverflow = document.body.style.overflow;\n    const previousFocus = document.activeElement;\n    document.body.style.overflow = 'hidden';\n    closeButton.current?.focus();\n    return () => {\n      document.body.style.overflow = previousOverflow;\n      previousFocus?.focus?.();\n    };",
        "    const previousFocus = document.activeElement;\n    lockBodyScroll();\n    closeButton.current?.focus();\n    return () => {\n      unlockBodyScroll();\n      previousFocus?.focus?.();\n    };",
        1,
    )
    text = text.replace(
        "    const previousOverflow = document.body.style.overflow;\n    const previousFocus = document.activeElement;\n    document.body.style.overflow = 'hidden';\n    closeButton.current?.focus();\n    const handleKeyDown = event => {\n      if (event.key === 'Escape') onClose();\n    };\n    window.addEventListener('keydown', handleKeyDown);\n    return () => {\n      document.body.style.overflow = previousOverflow;\n      previousFocus?.focus?.();\n      window.removeEventListener('keydown', handleKeyDown);\n    };",
        "    const previousFocus = document.activeElement;\n    lockBodyScroll();\n    closeButton.current?.focus();\n    const handleKeyDown = event => {\n      if (event.key === 'Escape') onClose();\n    };\n    window.addEventListener('keydown', handleKeyDown);\n    return () => {\n      unlockBodyScroll();\n      previousFocus?.focus?.();\n      window.removeEventListener('keydown', handleKeyDown);\n    };",
        1,
    )
    if "lockBodyScroll()" not in text:
        raise SystemExit("FamilyExperience: lock not applied")
    return text

def main():
    app = APP.read_text(encoding="utf-8")
    if len(app) < 1000:
        raise SystemExit(f"App.jsx looks corrupted (len={len(app)}); restore from master first")
    APP.write_text(patch_app(app), encoding="utf-8")
    print("patched", APP)
    fx = FX.read_text(encoding="utf-8")
    FX.write_text(patch_fx(fx), encoding="utf-8")
    print("patched", FX)

if __name__ == "__main__":
    main()
