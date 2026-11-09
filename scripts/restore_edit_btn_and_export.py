#!/usr/bin/env python3
from pathlib import Path
import re

css_path = Path('family-viewer/src/family.css')
css = css_path.read_text(encoding='utf-8')

new_focus = '''.fx-focus-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  min-height: 0;
  background: #e8eedf;
  border: none;
  border-radius: 4px;
  color: #385434;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.12s ease;
  touch-action: manipulation;
}'''

css2, n1 = re.subn(r'\.fx-focus-edit-btn \{[^}]*\}', new_focus, css, count=1)
print('focus-edit css replacements', n1)

# hover block for focus-edit: keep simple
css2 = re.sub(
    r'\.fx-focus-edit-btn:hover,\s*\.fx-focus-edit-btn:active \{[^}]*\}',
    '''.fx-focus-edit-btn:hover,
.fx-focus-edit-btn:active {
  background: #dce6d2;
  color: #2d4528;
}''',
    css2,
    count=1,
)

new_undo = '''.fx-focus-undo-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  min-height: 0;
  background: #faeade;
  border: none;
  border-radius: 4px;
  color: #8d4d33;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.12s ease;
  touch-action: manipulation;
}'''
css2, n2 = re.subn(r'\.fx-focus-undo-btn \{[^}]*\}', new_undo, css2, count=1)
print('focus-undo css replacements', n2)

css2 = re.sub(
    r'\.fx-focus-undo-btn:hover,\s*\.fx-focus-undo-btn:active \{[^}]*\}',
    '''.fx-focus-undo-btn:hover,
.fx-focus-undo-btn:active {
  background: #f5dfd0;
}''',
    css2,
    count=1,
)

new_insp = '''.fx-inspector-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  min-height: 0;
  background: #eef4e7;
  border: 1px solid #d4dfca;
  border-radius: 6px;
  color: #32522e;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease;
  touch-action: manipulation;
}'''
css2, n3 = re.subn(r'\.fx-inspector-edit-btn \{[^}]*\}', new_insp, css2, count=1)
print('inspector-edit css replacements', n3)

# mobile overrides
css2 = re.sub(
    r'(@media \(max-width: 600px\) \{[\s\S]*?)\.fx-focus-edit-btn \{[^}]*\}',
    r'''\1.fx-focus-edit-btn {
    padding: 2px 7px;
    min-height: 0;
    font-size: 11px;
  }''',
    css2,
    count=1,
)
css2 = re.sub(
    r'(@media \(max-width: 600px\) \{[\s\S]*?)\.fx-focus-undo-btn \{[^}]*\}',
    r'''\1.fx-focus-undo-btn {
    padding: 2px 7px;
    min-height: 0;
    font-size: 11px;
  }''',
    css2,
    count=1,
)

css_path.write_text(css2, encoding='utf-8')
print('family.css written', len(css2))

fx_path = Path('family-viewer/src/FamilyExperience.jsx')
fx = fx_path.read_text(encoding='utf-8')
fx2 = fx.replace('<Pencil size={12} />', '<Pencil size={11} />').replace('<Pencil size={12}/>', '<Pencil size={11}/>')
fx_path.write_text(fx2, encoding='utf-8')
print('FamilyExperience pencil updates', fx != fx2)

app_path = Path('family-viewer/src/App.jsx')
app = app_path.read_text(encoding='utf-8')

if 'Share2' not in app:
    if 'Download, Check, AlertTriangle' in app:
        app = app.replace('Download, Check, AlertTriangle', 'Download, Share2, Check, AlertTriangle', 1)
    elif 'Download,' in app:
        app = app.replace('Download,', 'Download, Share2,', 1)
    print('Share2 import added')

old = '''        <div className="file-actions">
          <button type="button" className="button button-primary" onClick={onUpload}>
            <Upload size={16} />פתיחת קובץ
          </button>
          {!bundle.isDemo && (
            <button type="button" className="button button-white" onClick={onDownload}>
              <Download size={16} />הורדה
            </button>
          )}
        </div>'''

new = '''        <div className="file-actions">
          <button type="button" className="button button-primary" onClick={onUpload}>
            <Upload size={16} />פתיחת קובץ
          </button>
          {!bundle.isDemo && (
            <>
              <button type="button" className="button button-white" onClick={onDownload} title="שמירה כקובץ GEDCOM במכשיר">
                <Download size={16} />שמירה במכשיר
              </button>
              <button
                type="button"
                className="button button-white"
                title="שיתוף הקובץ (מייל, WhatsApp וכו׳ לפי המכשיר)"
                onClick={async () => {
                  try {
                    let raw = bundle.raw || '';
                    if (/^1 CHAR .*$/m.test(raw)) raw = raw.replace(/^1 CHAR .*$/m, '1 CHAR UTF-8');
                    else if (/^0 HEAD\s*$/m.test(raw)) raw = raw.replace(/^0 HEAD\s*$/m, '0 HEAD\n1 CHAR UTF-8');
                    let name = (bundle.filename || 'family.ged').replace(/\.(gedcom|txt)$/i, '.ged');
                    if (!/\.ged$/i.test(name)) name += '.ged';
                    const file = new File([raw], name, { type: 'text/plain;charset=utf-8' });
                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                      await navigator.share({ files: [file], title: name, text: 'קובץ GEDCOM מתוך ענפים' });
                      onToast?.('הקובץ נשלח לשיתוף');
                      return;
                    }
                    if (navigator.share) {
                      await navigator.share({
                        title: name,
                        text: 'ייצוא GEDCOM מתוך ענפים — השתמשו ב«שמירה במכשיר» כדי לצרף את הקובץ למייל.',
                      });
                      onToast?.('נפתח שיתוף (לצירוף קובץ — «שמירה במכשיר»)');
                      return;
                    }
                    onDownload();
                    onToast?.('הקובץ הורד. אפשר לצרף אותו למייל ידנית.');
                  } catch (err) {
                    if (err && err.name === 'AbortError') return;
                    console.warn('share failed', err);
                    onDownload();
                    onToast?.('השיתוף לא זמין — הקובץ הורד למכשיר');
                  }
                }}
              >
                <Share2 size={16} />שיתוף
              </button>
            </>
          )}
        </div>
        {!bundle.isDemo && (
          <p className="file-export-hint" style={{ margin: '8px 0 0', fontSize: 11, color: '#6a7a62', lineHeight: 1.45 }}>
            שמירה מקומית מורידה קובץ <span dir="ltr">.ged</span>. שיתוף פותח את תפריט המכשיר (מייל, WhatsApp וכו׳) כשהדפדפן תומך.
          </p>
        )}'''

if old in app:
    app = app.replace(old, new, 1)
    print('FileView actions replaced')
elif 'שמירה במכשיר' in app and 'Share2 size' in app:
    print('FileView actions already present')
else:
    # try looser match
    m = re.search(r'<div className="file-actions">[\s\S]*?</div>\s*(?=\s*</div>\s*\n\s*<div className="file-tools-section">)', app)
    if not m:
        raise SystemExit('file-actions block not found')
    app = app[: m.start()] + new + app[m.end() :]
    print('FileView actions replaced via regex')

app_path.write_text(app, encoding='utf-8')
print('App.jsx written', len(app))
