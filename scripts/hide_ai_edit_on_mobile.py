#!/usr/bin/env python3
"""Hide AI edit controls on mobile viewports and coarse-pointer devices."""
from pathlib import Path

css_path = Path("family-viewer/src/family.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* AI edit: hidden on mobile until cloud/window.ai works there */"
if marker not in css:
    css += """

""" + marker + """
@media (max-width: 768px), (hover: none) and (pointer: coarse) {
  .fx-focus-edit-btn,
  .fx-inspector-edit-btn {
    display: none !important;
  }
}
"""
    css_path.write_text(css, encoding="utf-8")
    print("Updated family.css")
else:
    print("family.css already has mobile hide rules")

jsx_path = Path("family-viewer/src/FamilyExperience.jsx")
jsx = jsx_path.read_text(encoding="utf-8")

if "isLikelyMobileDevice" not in jsx:
    old_import = "import { EditPersonAiModal } from './EditPersonAiModal.jsx';"
    new_import = (
        "import { EditPersonAiModal } from './EditPersonAiModal.jsx';\n"
        "import { isLikelyMobileDevice } from './local-ai-provider.js';"
    )
    if old_import not in jsx:
        raise SystemExit("import line not found")
    jsx = jsx.replace(old_import, new_import, 1)

# FocusCard: wrap edit button
old_focus = """        <button
          onClick={onEditAi}
          title="עריכת פרטים באמצעות AI"
          aria-label="עריכת פרטים באמצעות AI"
          className="fx-focus-edit-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: '#e8eedf', borderRadius: 4, color: '#385434', fontWeight: 500 }}
        >
          <Pencil size={11} />
          <span>עריכה</span>
        </button>"""

new_focus = """        {!isLikelyMobileDevice() && (
          <button
            onClick={onEditAi}
            title="עריכת פרטים באמצעות AI"
            aria-label="עריכת פרטים באמצעות AI"
            className="fx-focus-edit-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: '#e8eedf', borderRadius: 4, color: '#385434', fontWeight: 500 }}
          >
            <Pencil size={11} />
            <span>עריכה</span>
          </button>
        )}"""

if old_focus in jsx and new_focus not in jsx:
    jsx = jsx.replace(old_focus, new_focus, 1)
    print("Patched FocusCard edit button")
elif new_focus in jsx or "{!isLikelyMobileDevice() && (" in jsx:
    print("FocusCard already patched or variant present")
else:
    print("WARN: FocusCard edit button pattern not found exact match")

# PersonInspector inline button - more fragile; CSS covers it.
# Also prevent modal open if somehow triggered on mobile.
old_modal_open = "onEditAi={()=>setEditModalOpen(true)}"
new_modal_open = "onEditAi={()=>{ if (!isLikelyMobileDevice()) setEditModalOpen(true); }}"
if old_modal_open in jsx:
    jsx = jsx.replace(old_modal_open, new_modal_open)
    print("Patched onEditAi handlers")

jsx_path.write_text(jsx, encoding="utf-8")
print("Done")
