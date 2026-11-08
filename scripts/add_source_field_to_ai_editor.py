#!/usr/bin/env python3
"""Add 'source' (מקור) field support to the AI GEDCOM person editor."""
from pathlib import Path

# --- ai-service.js: add source to prompt ---
ai_path = Path("family-viewer/src/ai-service.js")
ai = ai_path.read_text(encoding="utf-8")

if '"source": string' in ai or "'source'" in ai and "מקור" in ai:
    print("ai-service.js: source already present in prompt")
else:
    old_fields = '''   - "notes": array of strings (e.g. ["עלה לארץ ב-1948"])

Current person data in tree:'''
    new_fields = '''   - "notes": array of strings (e.g. ["עלה לארץ ב-1948"])
   - "source": string (מקור המידע, e.g. "ספר זיכרון משפחתי" or "עדות של דוד משה")

Current person data in tree:'''
    if old_fields not in ai:
        raise SystemExit("ERROR: could not find notes field block in ai-service.js")
    ai = ai.replace(old_fields, new_fields)
    ai_path.write_text(ai, encoding="utf-8")
    print("ai-service.js: added source to prompt")

# --- gedcom-ai-editor.js: validation + apply ---
ed_path = Path("family-viewer/src/gedcom-ai-editor.js")
ed = ed_path.read_text(encoding="utf-8")

# 1. allowedKeys
if "'source'" in ed and "allowedKeys" in ed:
    # check if already in the set
    if "'source'" in ed[ed.find("allowedKeys"):ed.find("allowedKeys")+400]:
        print("gedcom-ai-editor.js: source already in allowedKeys")
    else:
        old_keys = "'''    'education'\n  ]);'''"
        # safer replace
        old_keys = "    'education'\n  ]);"
        new_keys = "    'education',\n    'source'\n  ]);"
        if old_keys not in ed:
            raise SystemExit("ERROR: could not find allowedKeys education entry")
        ed = ed.replace(old_keys, new_keys, 1)
        print("gedcom-ai-editor.js: added source to allowedKeys")
else:
    old_keys = "    'education'\n  ]);"
    new_keys = "    'education',\n    'source'\n  ]);"
    if old_keys not in ed:
        raise SystemExit("ERROR: could not find allowedKeys education entry")
    ed = ed.replace(old_keys, new_keys, 1)
    print("gedcom-ai-editor.js: added source to allowedKeys")

# 2. stringFields
old_sf = "'occupation', 'residencePlace', 'education'\n  ];"
new_sf = "'occupation', 'residencePlace', 'education', 'source'\n  ];"
if "'source'" in ed[ed.find("stringFields"):ed.find("stringFields")+200] if "stringFields" in ed else False:
    print("gedcom-ai-editor.js: source already in stringFields")
else:
    if old_sf not in ed:
        raise SystemExit("ERROR: could not find stringFields list")
    ed = ed.replace(old_sf, new_sf, 1)
    print("gedcom-ai-editor.js: added source to stringFields")

# 3. Apply source as NOTE in updatePersonRecord (before rebuild lines)
if "updates.source" in ed and "מקור:" in ed:
    print("gedcom-ai-editor.js: source apply logic already present")
else:
    old_note_block = """  // Update NOTE
  if (updates.notes !== undefined && Array.isArray(updates.notes)) {
    // Keep non-NOTE subNodes and add new NOTE nodes
    // First remove top-level NOTEs that are inline
    for (const noteText of updates.notes) {
      if (!noteText) continue;
      // Check if already exists to avoid exact duplication
      const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === noteText);
      if (!exists) {
        subNodes.push({ tag: 'NOTE', val: noteText, raw: `1 NOTE ${noteText}`, children: [] });
      }
    }
  }

  // Rebuild lines"""
    new_note_block = """  // Update NOTE
  if (updates.notes !== undefined && Array.isArray(updates.notes)) {
    // Keep non-NOTE subNodes and add new NOTE nodes
    // First remove top-level NOTEs that are inline
    for (const noteText of updates.notes) {
      if (!noteText) continue;
      // Check if already exists to avoid exact duplication
      const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === noteText);
      if (!exists) {
        subNodes.push({ tag: 'NOTE', val: noteText, raw: `1 NOTE ${noteText}`, children: [] });
      }
    }
  }

  // Update source as a dedicated NOTE (מקור)
  if (updates.source !== undefined && updates.source) {
    const sourceNote = updates.source.startsWith('מקור:') || updates.source.startsWith('מקור :')
      ? updates.source
      : `מקור: ${updates.source}`;
    const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === sourceNote);
    if (!exists) {
      subNodes.push({ tag: 'NOTE', val: sourceNote, raw: `1 NOTE ${sourceNote}`, children: [] });
    }
  }

  // Rebuild lines"""
    if old_note_block not in ed:
        raise SystemExit("ERROR: could not find NOTE update block in updatePersonRecord")
    ed = ed.replace(old_note_block, new_note_block, 1)
    print("gedcom-ai-editor.js: added source -> NOTE apply logic")

ed_path.write_text(ed, encoding="utf-8")
print("Done.")
