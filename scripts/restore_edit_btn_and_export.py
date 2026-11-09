#!/usr/bin/env python3
"""Restore compact AI edit button look and enrich FileView export actions."""
from pathlib import Path
import re

# --- family.css: compact edit button (previous look) ---
css_path = Path('family-viewer/src/family.css')
css = css_path.read_text(encoding='utf-8')

old_edit_block = '''.fx-focus-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  min-height: 26px;
  background: #eef5e7;
  border: 1px solid #c9dcc1;
  border-radius: 6px;
  color: #2c5423;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
}
.fx-focus-edit-btn:hover,
.fx-focus-edit-btn:active {
  background: #dfedd3;
  border-color: #b5cca9;
  color: #1f4218;
}
.fx-focus-undo-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  min-height: 26px;
  background: #fdf0e6;
  border: 1px solid #ebd0c2;
  border-radius: 6px;
  color: #8d4d33;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
}
.fx-focus-undo-btn:hover,
.fx-focus-undo-btn:active {
  background: #fae4d5;
}
.fx-inspector-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  min-height: 26px;
  background: #eef5e7;
  border: 1px solid #c9dcc1;
  border-radius: 6px;
  color: #2c5423;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
}
.fx-inspector-edit-btn:hover,
.fx-inspector-edit-btn:active {
  background: #dfedd3;
}'''

new_edit_block = '''.fx-focus-edit-btn {
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
}
.fx-focus-edit-btn:hover,
.fx-focus-edit-btn:active {
  background: #dce6d2;
  color: #2d4528;
}
.fx-focus-undo-btn {
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
}
.fx-focus-undo-btn:hover,
.fx-focus-undo-btn:active {
  background: #f5dfd0;
}
.fx-inspector-edit-btn {
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
}
.fx-inspector-edit-btn:hover,
.fx-inspector-edit-btn:active {
  background: #e4ecd9;
}'''

if old_edit_block in css:
    css = css.replace(old_edit_block, new_edit_block, 1)
    print('Updated edit button CSS (compact)')
elif 'background: #e8eedf' in css and '.fx-focus-edit-btn' in css:
    print('Edit button CSS already compact-ish')
else:
    print('WARN: edit CSS block not matched exactly; trying softer replace')
    css = re.sub(
        r'\.fx-focus-edit-btn \{[^}]+\}',
        '''.fx-focus-edit-btn {
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
}''',
        css,
        count=1,
    )

# Soften mobile override that makes the button huge
css = css.replace(
    '''  .fx-focus-edit-btn {
    padding: 5px 12px;
    min-height: 32px;
    font-size: 12px;
  }
  .fx-focus-undo-btn {
    padding: 5px 10px;
    min-height: 32px;
    font-size: 12px;
  }''',
    '''  .fx-focus-edit-btn {
    padding: 2px 7px;
    min-height: 0;
    font-size: 11px;
  }
  .fx-focus-undo-btn {
    padding: 2px 7px;
    min-height: 0;
    font-size: 11px;
  }''',
)

css_path.write_text(css, encoding='utf-8')

# --- FamilyExperience: pencil size 11 ---
fx_path = Path('family-viewer/src/FamilyExperience.jsx')
fx = fx_path.read_text(encoding='utf-8')
fx2 = fx.replace('<Pencil size={12} />', '<Pencil size={11} />')
fx2 = fx2.replace('<Pencil size={12}/>', '<Pencil size={11}/>')
if fx2 != fx:
    fx_path.write_text(fx2, encoding='utf-8')
    print('Pencil size -> 11')
else:
    print('Pencil size already 11 or pattern missing')

# --- App.jsx: Share icon import + FileView export actions ---
app_path = Path('family-viewer/src/App.jsx')
app = app_path.read_text(encoding='utf-8')

if 'Share2' not in app:
    app = app.replace(
        'Download, Check, AlertTriangle',
        'Download, Share2, Mail, Check, AlertTriangle',
        1,
    )
    print('Added Share2, Mail icons')

# Helper functions near downloadGedcom usage - inject share helpers inside FileView
old_actions = '''        <div className="file-actions">
          <button type="button" className="button button-primary" onClick={onUpload}>
            <Upload size={16} />פתיחת קובץ
          </button>
          {!bundle.isDemo && (
            <button type="button" className="button button-white" onClick={onDownload}>
              <Download size={16} />הורדה
            </button>
          )}
        </div>'''

new_actions = '''        <div className="file-actions">
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
                    else if (/^0 HEAD\\s*$/m.test(raw)) raw = raw.replace(/^0 HEAD\\s*$/m, '0 HEAD\\n1 CHAR UTF-8');
                    let name = (bundle.filename || 'family.ged').replace(/\\.(gedcom|txt)$/i, '.ged');
                    if (!/\\.ged$/i.test(name)) name += '.ged';
                    const file = new File([raw], name, { type: 'text/plain;charset=utf-8' });
                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                      await navigator.share({
                        files: [file],
                        title: name,
                        text: 'קובץ GEDCOM מתוך ענפים',
                      });
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

if old_actions in app:
    app = app.replace(old_actions, new_actions, 1)
    print('Updated FileView export actions')
elif 'שמירה במכשיר' in app:
    print('FileView export already updated')
else:
    raise SystemExit('file-actions block not found')

app_path.write_text(app, encoding='utf-8')
print('Done')
