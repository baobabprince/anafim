#!/usr/bin/env python3
"""Redesign FileView: cleaner hierarchy, integrated analysis tools, less technical noise."""
from pathlib import Path

NEW_FILE_VIEW = r'''
function FileView({ bundle, onUpload, onDownload, onDemo, onForget, onLoadSaved, onToast }) {
  const { data } = bundle;
  const canShare = !!(bundle?.raw) && !bundle?.isDemo;

  const analysisTools = [
    {
      id: 'genea-net',
      title: 'ניתוח רשת',
      desc: 'גרף קשרים, קהילות וסטטיסטיקות',
      url: 'https://baobabprince.github.io/genea-net/',
      Icon: Network,
    },
    {
      id: 'map',
      title: 'מפת מקומות',
      desc: 'מיפוי גיאוגרפי של אירועים',
      url: 'https://baobabprince.github.io/GEDCOM-map/',
      Icon: MapPin,
    },
    {
      id: 'diff',
      title: 'השוואת קבצים',
      desc: 'השוואה בין שני קבצי GEDCOM',
      url: 'https://baobabprince.github.io/gedcom-diff-tool/',
      Icon: GitFork,
    },
    {
      id: 'shield',
      title: 'פרטיות',
      desc: 'סימון, אנונימיזציה והגנה',
      url: 'https://baobabprince.github.io/GedShield/',
      Icon: ShieldCheck,
    },
  ];

  const openTool = (url, label) => {
    if (!canShare) {
      onToast?.(bundle?.isDemo ? 'במשפחת ההדגמה אין קובץ לייצוא' : 'אין קובץ GEDCOM פתוח');
      return;
    }
    try {
      pushToBaobabShared(bundle);
    } catch (err) {
      onToast?.('לא ניתן לשמור לשיתוף');
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'baobab=shared', '_blank', 'noopener,noreferrer');
    onToast?.('נפתח: ' + label);
  };

  const encodingLabel = (() => {
    if (!bundle.encodingInfo) return null;
    if (bundle.encodingInfo.mode === 'manual') return 'בחירה ידנית';
    if (bundle.encodingInfo.reason === 'bom') return 'אוטומטי · BOM';
    if (bundle.encodingInfo.reason === 'declaration') return 'אוטומטי · CHAR';
    if (bundle.encodingInfo.reason === 'legacy-heuristic') return 'אוטומטי · הערכה';
    return 'אוטומטי';
  })();

  return (
    <section className="file-view">
      <div className="workspace-heading">
        <div className="view-heading">
          <h2>פרטי הקובץ</h2>
        </div>
      </div>

      <div className="file-main-card">
        <div className="file-summary">
          <span className="file-large-icon"><FileText size={28} /></span>
          <div>
            <span className="eyebrow">
              {bundle.isDemo ? 'משפחת הדגמה' : 'קובץ GEDCOM'}
            </span>
            <h3 dir="auto">{bundle.filename}</h3>
            <p>
              <span className="status-dot" />
              {bundle.isDemo
                ? 'נתונים בדויים · לעיון בלבד'
                : 'נטען במכשיר · ללא העלאה לשרת'}
            </p>
          </div>
        </div>

        <div className="file-stats">
          {[
            [data.stats.people, 'אנשים', UsersRound],
            [data.stats.families, 'משפחות', Network],
            [data.stats.generations, 'דורות', Layers3],
          ].map(([n, label, Icon]) => (
            <div key={label}>
              <Icon size={18} />
              <strong>{number(n)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="file-actions">
          <button type="button" className="button button-primary" onClick={onUpload}>
            <Upload size={16} />פתיחת קובץ
          </button>
          {!bundle.isDemo && (
            <button type="button" className="button button-white" onClick={onDownload}>
              <Download size={16} />הורדה
            </button>
          )}
        </div>
      </div>

      <div className="file-tools-section">
        <div className="file-tools-heading">
          <h3>ניתוח מתקדם</h3>
          <p>פתיחה בכלים אחרים עם אותו אילן · הנתונים נשארים במכשיר</p>
        </div>
        <div className="file-tools-grid">
          {analysisTools.map(({ id, title, desc, url, Icon }) => (
            <button
              key={id}
              type="button"
              className="file-tool-card"
              disabled={!canShare}
              onClick={() => openTool(url, title)}
            >
              <span className="file-tool-icon"><Icon size={20} /></span>
              <span className="file-tool-text">
                <strong>{title}</strong>
                <span>{desc}</span>
              </span>
              <ArrowLeft size={15} className="file-tool-arrow" />
            </button>
          ))}
        </div>
        {!canShare && (
          <p className="file-tools-hint">
            {bundle.isDemo
              ? 'במשפחת ההדגמה הכלים אינם זמינים. פתחו קובץ GEDCOM אמיתי.'
              : 'פתחו קובץ GEDCOM כדי להשתמש בכלים.'}
          </p>
        )}
      </div>

      <details className="file-tech-details">
        <summary>פרטים טכניים</summary>
        <dl className="metadata-list">
          <div><dt>גרסת GEDCOM</dt><dd dir="ltr">{data.metadata.version || '—'}</dd></div>
          <div><dt>תוכנת מקור</dt><dd dir="auto">{data.metadata.source || '—'}</dd></div>
          <div><dt>קידוד</dt><dd dir="ltr">{bundle.encoding?.toUpperCase?.() || '—'}</dd></div>
          {encodingLabel && <div><dt>זיהוי קידוד</dt><dd>{encodingLabel}</dd></div>}
          <div><dt>שמירה במכשיר</dt><dd>{bundle.isDemo ? 'הדגמה' : bundle.remembered ? 'שמור בדפדפן' : 'מפגש נוכחי בלבד'}</dd></div>
          {bundle.importedAt && (
            <div><dt>נפתח</dt><dd>{new Date(bundle.importedAt).toLocaleString('he-IL')}</dd></div>
          )}
          <div><dt>גרסת ענפים</dt><dd dir="ltr">{APP_VERSION}</dd></div>
        </dl>
      </details>

      <SavedFilesList
        currentBundle={bundle}
        onLoadSavedFile={onLoadSaved}
        onRemoveSavedFile={onForget}
        onUploadNew={onUpload}
        onSelectDemo={onDemo}
      />

      {!!data.warnings?.length && (
        <div className="warnings-card">
          <h3><AlertTriangle size={18} />הערות על הקובץ</h3>
          <ul>{data.warnings.map((w, i) => <li dir="auto" key={i}>{w}</li>)}</ul>
        </div>
      )}

      {data.stats.cycles && (
        <div className="warnings-card">
          <h3><AlertTriangle size={18} />קשר מעגלי באילן</h3>
          <p>ייתכן קישור שגוי בין הורה לילד. מספר הדורות עשוי להיות חלקי.</p>
        </div>
      )}

      <div className="privacy-card privacy-card-compact">
        <ShieldCheck size={22} />
        <div>
          <h3>פרטיות</h3>
          <p>הפענוח מתבצע בדפדפן. במצב מקומי הקובץ לא נשלח לשרת.</p>
          {bundle.remembered && (
            <button type="button" className="text-button danger-text" onClick={() => onForget(bundle.id)}>
              מחיקת העותק השמור מהמכשיר<X size={14} />
            </button>
          )}
        </div>
      </div>

      {!bundle.isDemo && (
        <button type="button" className="text-button file-demo-link" onClick={onDemo}>
          <RotateCcw size={14} />מעבר למשפחת ההדגמה
        </button>
      )}
    </section>
  );
}
'''

CSS_ADD = r'''
/* File view redesign — analysis tools + compact layout */
.file-tools-section{margin:18px 0 8px}
.file-tools-heading{margin-bottom:12px}
.file-tools-heading h3{margin:0 0 4px;font-size:15px;font-weight:700;color:#456352}
.file-tools-heading p{margin:0;font-size:12px;color:#82877e;line-height:1.45}
.file-tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:520px){.file-tools-grid{grid-template-columns:1fr}}
.file-tool-card{
  display:flex;align-items:center;gap:12px;text-align:right;
  padding:14px 14px;border-radius:14px;border:1px solid #e7e8e0;
  background:#fefefb;color:#29392f;cursor:pointer;
  transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;
  font:inherit;
}
.file-tool-card:hover:not(:disabled){
  border-color:#c5d0c0;background:#f8faf6;
  box-shadow:0 4px 14px rgba(69,99,82,.08);
}
.file-tool-card:disabled{opacity:.48;cursor:not-allowed}
.file-tool-icon{
  flex-shrink:0;width:40px;height:40px;border-radius:12px;
  display:flex;align-items:center;justify-content:center;
  background:#edf1e9;color:#456352;
}
.file-tool-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.file-tool-text strong{font-size:13px;font-weight:700;color:#29392f}
.file-tool-text span{font-size:11px;color:#82877e;line-height:1.35}
.file-tool-arrow{flex-shrink:0;opacity:.35;color:#456352}
.file-tools-hint{margin:10px 0 0;font-size:12px;color:#82877e;line-height:1.45}
.file-tech-details{
  margin:16px 0;border:1px solid #e7e8e0;border-radius:14px;
  background:#fefefb;overflow:hidden;
}
.file-tech-details > summary{
  list-style:none;cursor:pointer;padding:12px 16px;
  font-size:13px;font-weight:600;color:#456352;
  user-select:none;
}
.file-tech-details > summary::-webkit-details-marker{display:none}
.file-tech-details > summary::after{content:' ›';opacity:.5}
.file-tech-details[open] > summary::after{content:' ˅'}
.file-tech-details .metadata-list{padding:0 16px 14px;margin:0}
.privacy-card-compact{padding:14px 16px;gap:12px}
.privacy-card-compact h3{font-size:13px;margin:0 0 4px}
.privacy-card-compact p{font-size:12px;margin:0;line-height:1.45}
'''


def main():
    app = Path('family-viewer/src/App.jsx')
    t = app.read_text()

    start = t.find('function FileView')
    if start < 0:
        raise SystemExit('FileView not found')
    # end at next top-level function after FileView (ToolsDialog or similar)
    end = t.find('\nfunction ToolsDialog', start)
    if end < 0:
        end = t.find('\nfunction ', start + 10)
    if end < 0:
        raise SystemExit('end of FileView not found')

    t = t[:start] + NEW_FILE_VIEW.strip() + '\n\n' + t[end:].lstrip('\n')

    # Wire onToast instead of onTools for FileView usage
    t = t.replace(
        'onTools={() => setModal(\'tools\')}',
        'onToast={setToast}',
    )
    # Keep ToolsDialog available if modal set elsewhere, but file page no longer opens it

    app.write_text(t)
    print('App.jsx FileView replaced', app.stat().st_size)

    css = Path('family-viewer/src/styles.css')
    c = css.read_text()
    if 'file-tools-grid' not in c:
        css.write_text(c.rstrip() + '\n' + CSS_ADD)
        print('styles.css updated')
    else:
        print('styles already have tools grid')


if __name__ == '__main__':
    main()
