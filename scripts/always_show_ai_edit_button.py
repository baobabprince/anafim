#!/usr/bin/env python3
"""Make the AI person-edit button always visible (remove aiSupported || devMode gate)."""
from pathlib import Path

path = Path("family-viewer/src/FamilyExperience.jsx")
text = path.read_text(encoding="utf-8")

if "aiSupported || devMode" not in text:
    print("Already applied – no (aiSupported || devMode) left")
    raise SystemExit(0)

# 1. FocusCard multi-line button
old1 = """        {(aiSupported || devMode) && (
          <button
            onClick={onEditAi}
            title=\"עריכת פרטים באמצעות AI\"
            aria-label=\"עריכת פרטים באמצעות AI\"
            className=\"fx-focus-edit-btn\"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: '#e8eedf', borderRadius: 4, color: '#385434', fontWeight: 500 }}
          >
            <Pencil size={11} />
            <span>עריכה</span>
          </button>
        )}"""

new1 = """        <button
          onClick={onEditAi}
          title=\"עריכת פרטים באמצעות AI\"
          aria-label=\"עריכת פרטים באמצעות AI\"
          className=\"fx-focus-edit-btn\"
          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: '#e8eedf', borderRadius: 4, color: '#385434', fontWeight: 500 }}
        >
          <Pencil size={11} />
          <span>עריכה</span>
        </button>"""

if old1 not in text:
    raise SystemExit("ERROR: FocusCard pattern not found")
text = text.replace(old1, new1)
print("Patched FocusCard button")

# 2. PersonInspector inline button
old2 = "{(aiSupported || devMode) && (<button onClick={onEditAi} title=\"עריכת פרטים באמצעות AI\" aria-label=\"עריכת פרטים באמצעות AI\" className=\"fx-inspector-edit-btn\" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#eef4e7', border: '1px solid #d4dfca', borderRadius: 6, color: '#32522e', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}><Pencil size={12}/><span>עריכה</span></button>)}"
new2 = "<button onClick={onEditAi} title=\"עריכת פרטים באמצעות AI\" aria-label=\"עריכת פרטים באמצעות AI\" className=\"fx-inspector-edit-btn\" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#eef4e7', border: '1px solid #d4dfca', borderRadius: 6, color: '#32522e', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}><Pencil size={12}/><span>עריכה</span></button>"

if old2 not in text:
    raise SystemExit("ERROR: PersonInspector pattern not found")
text = text.replace(old2, new2)
print("Patched PersonInspector button")

path.write_text(text, encoding="utf-8")
print("Done. Remaining gates:", text.count("aiSupported || devMode"))
