#!/usr/bin/env python3
from pathlib import Path

p = Path('family-viewer/src/EditPersonAiModal.jsx')
text = p.read_text(encoding='utf-8')

old = '''            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showKeyText ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="הדבק מפתח כאן: AIzaSy..."
                  dir="ltr"
                  disabled={busy || testingKey}
                  style={{
                    width: '100%',
                    padding: '7px 32px 7px 10px',
                    borderRadius: 6,
                    border: '1px solid #cfc2b2',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />'''

new = '''            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTestKey();
              }}
              autoComplete="off"
              style={{ display: 'flex', gap: 6, marginBottom: 8 }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showKeyText ? 'text' : 'password'}
                  name="gemini-api-key"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="הדבק מפתח כאן: AIzaSy..."
                  dir="ltr"
                  disabled={busy || testingKey}
                  style={{
                    width: '100%',
                    padding: '7px 32px 7px 10px',
                    borderRadius: 6,
                    border: '1px solid #cfc2b2',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />'''

if old not in text:
    if 'name="gemini-api-key"' in text:
        print('already patched')
    else:
        raise SystemExit('pattern not found')
else:
    text = text.replace(old, new, 1)
    # close form instead of outer div for that row
    # Find the block after remove button that ends with </div> for the flex row
    marker = '''              {apiKey && (
                <button
                  type="button"
                  className="button button-white button-small"
                  onClick={handleRemoveKey}
                  disabled={busy || testingKey}
                  title="מחק מפתח"
                  style={{ padding: '4px 8px', fontSize: 11, color: '#973d2a' }}
                >
                  הסר
                </button>
              )}
            </div>'''
    replacement = '''              {apiKey && (
                <button
                  type="button"
                  className="button button-white button-small"
                  onClick={handleRemoveKey}
                  disabled={busy || testingKey}
                  title="מחק מפתח"
                  style={{ padding: '4px 8px', fontSize: 11, color: '#973d2a' }}
                >
                  הסר
                </button>
              )}
            </form>'''
    if marker not in text:
        raise SystemExit('closing marker not found')
    text = text.replace(marker, replacement, 1)
    p.write_text(text, encoding='utf-8')
    print('patched EditPersonAiModal.jsx')
