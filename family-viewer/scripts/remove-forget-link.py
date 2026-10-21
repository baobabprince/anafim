#!/usr/bin/env python3
from pathlib import Path
import re

def main():
    p = Path('family-viewer/src/App.jsx')
    t = p.read_text()
    old = '''          {bundle.remembered && (
            <button type="button" className="text-button danger-text" onClick={() => onForget(bundle.id)}>
              מחיקת העותק השמור מהמכשיר<X size={14} />
            </button>
          )}
'''
    if old in t:
        t = t.replace(old, '', 1)
        print('removed block')
    else:
        t2, n = re.subn(
            r"\s*\{bundle\.remembered && \([\s\S]*?מחיקת העותק השמור מהמכשיר[\s\S]*?\)\}\s*",
            '\n',
            t,
            count=1,
        )
        if not n:
            raise SystemExit('not found')
        t = t2
        print('removed via regex')
    p.write_text(t)

if __name__ == '__main__':
    main()
