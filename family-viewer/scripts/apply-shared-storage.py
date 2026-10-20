#!/usr/bin/env python3
from pathlib import Path

def main():
    p = Path('family-viewer/src/App.jsx')
    t = p.read_text()

    if 'baobab-shared-storage' not in t:
        t = t.replace(
            "import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';",
            "import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';\nimport { saveSharedExport, loadSharedExport, hasSharedExport, formatSharedSummary } from './baobab-shared-storage.js';",
            1,
        )

    if 'pushToBaobabShared' not in t:
        helper = '''
function pushToBaobabShared(bundle) {
  if (!bundle || bundle.isDemo || !bundle.raw) return;
  try {
    saveSharedExport({
      source: 'anafim',
      filename: bundle.filename || 'family.ged',
      gedcom: bundle.raw,
      encoding: bundle.encoding || 'utf-8',
      meta: {
        personCount: bundle.data?.stats?.people,
        familyCount: bundle.data?.stats?.families,
        title: bundle.filename,
      },
    });
  } catch (err) {
    console.warn('baobab shared save skipped', err);
  }
}

function loadFromBaobabShared(onImport) {
  const shared = loadSharedExport();
  if (!shared?.gedcom) return null;
  try {
    const data = parseGedcom(shared.gedcom);
    const bundle = {
      id: 'shared-' + Date.now(),
      data,
      raw: shared.gedcom,
      filename: shared.filename || 'shared.ged',
      encoding: shared.encoding || 'utf-8',
      isDemo: false,
      remembered: false,
      importedAt: shared.exportedAt || new Date().toISOString(),
    };
    if (typeof onImport === 'function') onImport(bundle);
    return bundle;
  } catch (err) {
    console.error('baobab shared parse failed', err);
    return null;
  }
}
'''
        # insert after imports block — after STORAGE constants is safer
        marker = "const STORAGE_ACTIVE_ID_KEY = 'anafim-active-file-id-v1';"
        if marker in t:
            t = t.replace(marker, marker + '\n' + helper, 1)
        else:
            t = t.replace(
                "import { saveSharedExport, loadSharedExport, hasSharedExport, formatSharedSummary } from './baobab-shared-storage.js';\n",
                "import { saveSharedExport, loadSharedExport, hasSharedExport, formatSharedSummary } from './baobab-shared-storage.js';\n" + helper,
                1,
            )

    # push after successful import in UploadDialog
    old = 'if (!controller.signal.aborted) onImport({ ...result, filename:file.name, isDemo:false, remembered:remember, importedAt:new Date().toISOString() });'
    new = '''if (!controller.signal.aborted) {
        const imported = { ...result, filename:file.name, isDemo:false, remembered:remember, importedAt:new Date().toISOString() };
        onImport(imported);
        pushToBaobabShared(imported);
      }'''
    if old in t and 'pushToBaobabShared(imported)' not in t:
        t = t.replace(old, new, 1)

    # push when saving to local list
    old2 = 'const savedItem = saveFileToLocalStorage(next);'
    if old2 in t and 'pushToBaobabShared(next)' not in t:
        t = t.replace(old2, old2 + '\n      pushToBaobabShared(next);', 1)

    # push on welcome toast for non-demo
    old3 = "setToast(result.isDemo ? 'נעים להכיר את משפחת לוין. כל הפרטים בדויים.' : `ברוכים הבאים! ${number(result.data.stats.people)} אנשים מחכים לכם באילן.`);"
    if old3 in t and 'pushToBaobabShared(result)' not in t:
        t = t.replace(old3, "if (!result.isDemo) pushToBaobabShared(result);\n    " + old3, 1)

    # UI: load from shared near open button in UploadDialog
    if 'טען מהשיתוף' not in t:
        old_btn = '<button className="button button-primary button-full" onClick={importFile} disabled={!file || busy}>'
        if old_btn in t:
            extra = '''<div className="baobab-shared-box" style={{margin:'12px 0',padding:'12px',border:'1px solid #e7e8e0',borderRadius:'12px',background:'#fefefb'}}>
      <div style={{fontSize:'12px',fontWeight:600,color:'#456352',marginBottom:6}}>שיתוף בין אפליקציות</div>
      <div style={{fontSize:11,color:'#82877e',marginBottom:8}}>{formatSharedSummary(loadSharedExport()) || 'אין נתונים משותפים עדיין'}</div>
      <button type="button" className="button button-small button-full" style={{marginBottom:8}} disabled={!hasSharedExport() || busy} onClick={() => { const b = loadFromBaobabShared(onImport); if (b) { try { onClose(); } catch (_) {} } }}>
        טען מהשיתוף
      </button>
    </div>
    ''' + old_btn
            t = t.replace(old_btn, extra, 1)

    p.write_text(t)
    print('App.jsx', p.stat().st_size)
    print('shared import', 'baobab-shared-storage' in t)
    print('push helper', 'pushToBaobabShared' in t)
    print('load button', 'טען מהשיתוף' in t)

if __name__ == '__main__':
    main()
