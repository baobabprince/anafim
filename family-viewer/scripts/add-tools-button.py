#!/usr/bin/env python3
from pathlib import Path

def main():
    p = Path('family-viewer/src/App.jsx')
    t = p.read_text()
    if 'onClick={onTools}' in t:
        print('already has button')
        return
    old = '<section className="file-view"><div className="workspace-heading"><div className="view-heading"><h2>הקובץ שמחבר הכול</h2></div></div>'
    new = old + '<div style={{marginBottom:14}}><button type="button" className="button button-primary button-small" onClick={onTools} disabled={bundle?.isDemo || !bundle?.raw}>ניתוח מתקדם · כלים נוספים</button></div>'
    if old not in t:
        raise SystemExit('FileView heading not found')
    t = t.replace(old, new, 1)
    p.write_text(t)
    print('injected', 'onClick={onTools}' in t)

if __name__ == '__main__':
    main()
