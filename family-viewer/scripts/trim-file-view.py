#!/usr/bin/env python3
from pathlib import Path

def main():
    p = Path('family-viewer/src/App.jsx')
    t = p.read_text()

    # Hide SearchBar on file details view
    old_search = '<SearchBar data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson} onDirectory={() => changeView(\'people\')}/>'
    new_search = "{view !== 'file' && <SearchBar data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson} onDirectory={() => changeView('people')}/>}"
    if old_search not in t:
        if "view !== 'file' && <SearchBar" in t:
            print('search already conditional')
        else:
            raise SystemExit('SearchBar markup not found')
    else:
        t = t.replace(old_search, new_search, 1)
        print('SearchBar hidden on file view')

    # Remove "מעבר למשפחת ההדגמה" block
    demo_block = '''      {!bundle.isDemo && (
        <button type="button" className="text-button file-demo-link" onClick={onDemo}>
          <RotateCcw size={14} />מעבר למשפחת ההדגמה
        </button>
      )}
'''
    if demo_block in t:
        t = t.replace(demo_block, '', 1)
        print('demo link removed')
    elif 'file-demo-link' in t:
        # compact one-liner variants
        import re
        t2, n = re.subn(
            r"\s*\{!bundle\.isDemo && \(\s*<button[^>]*file-demo-link[\s\S]*?</button>\s*\)\}\s*",
            '\n',
            t,
            count=1,
        )
        if n:
            t = t2
            print('demo link removed via regex')
        else:
            print('demo link pattern not matched')
    else:
        print('demo link already gone')

    p.write_text(t)
    print('done', p.stat().st_size)

if __name__ == '__main__':
    main()
