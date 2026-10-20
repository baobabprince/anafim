#!/usr/bin/env python3
"""Add 'ניתוח מתקדם' modal in anafim that opens other baobab tools with shared GEDCOM."""
from pathlib import Path

TOOLS_DIALOG = r'''
function ToolsDialog({ onClose, bundle, onToast }) {
  const openTool = (url, label) => {
    if (!bundle?.raw) {
      onToast?.('אין קובץ GEDCOM פתוח להעברה');
      return;
    }
    try {
      pushToBaobabShared(bundle);
    } catch (err) {
      onToast?.('לא ניתן לשמור לשיתוף (זיכרון מלא?)');
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'baobab=shared', '_blank', 'noopener,noreferrer');
    onToast?.('נפתח: ' + label + ' · הנתונים הועברו');
    onClose?.();
  };

  const tools = [
    {
      id: 'genea-net',
      title: 'ניתוח רשת (genea-net)',
      desc: 'גרף קשרים, קהילות וסטטיסטיקות על האילן',
      url: 'https://baobabprince.github.io/genea-net/',
      icon: 'Network',
    },
    {
      id: 'map',
      title: 'מפת מקומות (GEDCOM-map)',
      desc: 'מיפוי גיאוגרפי של מקומות לידה, נישואין ופטירה',
      url: 'https://baobabprince.github.io/GEDCOM-map/',
      icon: 'MapPin',
    },
    {
      id: 'diff',
      title: 'השוואת קבצים (ged-diff)',
      desc: 'השוואה בין שני קבצי GEDCOM · נטען כקובץ A',
      url: 'https://baobabprince.github.io/gedcom-diff-tool/',
      icon: 'GitFork',
    },
    {
      id: 'shield',
      title: 'פרטיות (GedShield)',
      desc: 'בדיקות פרטיות והגנה על נתונים רגישים בקובץ',
      url: 'https://baobabprince.github.io/GedShield/',
      icon: 'ShieldCheck',
    },
  ];

  return (
    <Dialog
      title="ניתוח מתקדם"
      subtitle="העברת האילן הנוכחי לכלים אחרים בלחיצה · הנתונים נשארים במכשיר"
      onClose={onClose}
      className="tools-dialog"
    >
      <div className="tools-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tools.map(tool => (
          <button
            key={tool.id}
            type="button"
            className="button button-full"
            style={{
              justifyContent: 'flex-start',
              textAlign: 'right',
              gap: 12,
              padding: '14px 16px',
              background: '#fefefb',
              border: '1px solid #e7e8e0',
              borderRadius: 12,
              color: '#29392f',
            }}
            onClick={() => openTool(tool.url, tool.title)}
            disabled={!bundle?.raw}
          >
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>{tool.title}</strong>
              <span style={{ fontSize: 12, color: '#82877e', fontWeight: 400 }}>{tool.desc}</span>
            </span>
            <ArrowLeft size={16} style={{ opacity: 0.45, flexShrink: 0 }} />
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: '#82877e', marginTop: 14, lineHeight: 1.5 }}>
        הלחיצה שומרת את ה־GEDCOM ב־localStorage המשותף ופותחת את הכלי בחלון חדש.
        אם הכלי לא טוען אוטומטית — לחצו שם על «טען מהשיתוף».
      </p>
    </Dialog>
  );
}
'''

def main():
    p = Path('family-viewer/src/App.jsx')
    t = p.read_text()

    if 'function ToolsDialog' not in t:
        # insert before HelpDialog
        if 'function HelpDialog' in t:
            t = t.replace('function HelpDialog', TOOLS_DIALOG + '\nfunction HelpDialog', 1)
        else:
            raise SystemExit('HelpDialog not found')

    # modal render
    if "modal === 'tools'" not in t:
        t = t.replace(
            "{modal === 'help' && <HelpDialog",
            "{modal === 'tools' && <ToolsDialog onClose={() => setModal(null)} bundle={bundle} onToast={setToast} />} {modal === 'help' && <HelpDialog",
            1,
        )

    # Button on FileView — extend FileView usage to pass onTools
    if 'onTools' not in t:
        t = t.replace(
            '<FileView bundle={bundle} onUpload={() => setModal(\'upload\')} onDownload={downloadGedcom} onDemo={() => loadBundle(demoBundle())} onForget={forget} onLoadSaved={loadSavedFile}/>',
            '<FileView bundle={bundle} onUpload={() => setModal(\'upload\')} onDownload={downloadGedcom} onDemo={() => loadBundle(demoBundle())} onForget={forget} onLoadSaved={loadSavedFile} onTools={() => setModal(\'tools\')}/>',
            1,
        )

    # FileView signature + button
    if 'function FileView({ bundle, onUpload, onDownload, onDemo, onForget, onLoadSaved })' in t:
        t = t.replace(
            'function FileView({ bundle, onUpload, onDownload, onDemo, onForget, onLoadSaved })',
            'function FileView({ bundle, onUpload, onDownload, onDemo, onForget, onLoadSaved, onTools })',
            1,
        )

    # inject tools button in FileView near download if possible
    if 'ניתוח מתקדם' not in t:
        # try common download button patterns
        patterns = [
            ('onClick={onDownload}', True),
            ('onDownload}', True),
        ]
        # Add a dedicated card after file-stats block
        marker = "[[data.stats.people,'אנשים',UsersRound]"
        # simpler: after file-main-card opening content — insert before closing of section
        # Look for file-view section actions
        if 'className="file-view"' in t and 'onTools' in t:
            # Add button after the stats mapping closes - hard
            # Instead append a tools strip via replace on a unique string in FileView return
            unique = 'נטען בהצלחה · המידע מעובד רק במכשיר שלכם'
            if unique in t:
                inject = unique + '''</p></div></div>
      <div className="baobab-tools-strip" style={{marginTop:16,display:'flex',flexWrap:'wrap',gap:8}}>
        <button type="button" className="button button-primary button-small" onClick={onTools} disabled={bundle?.isDemo}>
          ניתוח מתקדם · כלים נוספים
        </button>
      </div><div style={{display:'none'}}>'''
                # This breaks HTML structure - avoid
                pass

            # Safer: replace onDownload button area by adding sibling after a known download button
            old_dl = '<button className="button button-small" onClick={onDownload}'
            if old_dl in t:
                # find full button is hard; insert tools button before download
                t = t.replace(
                    old_dl,
                    '<button type="button" className="button button-primary button-small" onClick={onTools} disabled={bundle?.isDemo}>ניתוח מתקדם</button><button className="button button-small" onClick={onDownload}',
                    1,
                )
            else:
                # inject at start of FileView section after h2 workspace
                old_h = '<section className="file-view"><div className="workspace-heading"><div className="view-heading"><h2>הקובץ שמחבר הכול</h2></div></div>'
                if old_h in t:
                    t = t.replace(
                        old_h,
                        old_h + '<div style={{marginBottom:12}}><button type="button" className="button button-primary button-small" onClick={onTools} disabled={bundle?.isDemo}>ניתוח מתקדם · כלים נוספים</button></div>',
                        1,
                    )

    # Also expose from mobile menu / header if present
    if "setModal('tools')" not in t or t.count("setModal('tools')") < 2:
        # add next to help in family view help button pattern - onHelp={() => setModal('help')}
        if "onHelp={() => setModal('help')}" in t and "setModal('tools')" not in t.split("onHelp={() => setModal('help')}")[0][-200:]:
            pass  # FileView is enough

    # Header desktop: add tools button near menu if Menu exists
    if 'ניתוח מתקדם · כלים נוספים' not in t and "setModal('tools')" in t:
        # already has button from FileView path
        pass

    # Floating access: add to mobile bottom nav as long-press alternative - skip

    # Ensure at least one entry point: if still no UI text, force under file-view h2
    if 'ניתוח מתקדם' not in t:
        raise SystemExit('Failed to inject tools UI button')

    p.write_text(t)
    print('size', p.stat().st_size)
    print('ToolsDialog', 'function ToolsDialog' in t)
    print('modal tools', "modal === 'tools'" in t)
    print('button text', 'ניתוח מתקדם' in t)

if __name__ == '__main__':
    main()
