import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeGedcomInline,
  validatePersonUpdates,
  applyPersonUpdatesToGedcom,
} from '../src/gedcom-ai-editor.js';
import { parseGedcom } from '../src/gedcom.js';
import { validateOllamaUrl } from '../src/ollama-ai-provider.js';

const rootDir = path.resolve(import.meta.dirname, '..');

test('GEDCOM AI editor blocks newline and tag injection across inline and note fields', () => {
  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
2 GIVN משה
2 SURN כהן
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
0 TRLR`;

  const malicious = {
    givenName: 'משה\n0 @I999@ INDI\n1 NAME פורץ /רע/',
    surname: 'כהן/לוי\r\n1 FAMC @F99@',
    birthPlace: 'ירושלים\n1 DEAT\n2 DATE 1900',
    occupation: 'נגר\r\n0 @I888@ INDI',
    source: 'ארכיון\n1 NOTE שורה מוזרקת',
    notes: ['שורה ראשונה\n0 @I777@ INDI\n1 NAME זיוף'],
  };

  const validated = validatePersonUpdates(malicious, {});
  assert.equal(validated.valid, true);
  assert.ok(!validated.sanitized.givenName.includes('\n'));
  assert.ok(!validated.sanitized.surname.includes('/'));
  assert.ok(!validated.sanitized.birthPlace.includes('\n'));

  const updated = applyPersonUpdatesToGedcom(sampleGed, '@I1@', validated.sanitized);

  // Must never inject new top-level 0 records or fake family links
  assert.ok(!/^0 @I999@/m.test(updated));
  assert.ok(!/^0 @I888@/m.test(updated));
  assert.ok(!/^0 @I777@/m.test(updated));
  assert.ok(!/^1 FAMC @F99@/m.test(updated));
  assert.ok(!/^1 DEAT/m.test(updated));

  // Multi-line note must be encoded via 2 CONT lines and parse back into @I1@ only
  assert.ok(updated.includes('1 NOTE שורה ראשונה\n2 CONT 0 @I777@ INDI\n2 CONT 1 NAME זיוף'));
  const parsed = parseGedcom(updated);
  assert.deepEqual(parsed.order, ['@I1@']);
  assert.equal(parsed.people['@I1@'].death, null);
  assert.ok(parsed.people['@I1@'].notes.some(n => n.includes('שורה ראשונה') && n.includes('1 NAME זיוף')));
});

test('sanitizeGedcomInline strips control characters and newlines', () => {
  assert.equal(sanitizeGedcomInline('  א\u0000ב\r\nג\tד  '), 'אב ג ד');
});

test('validateOllamaUrl allows only loopback origins and rejects remote hosts', () => {
  assert.equal(validateOllamaUrl('http://localhost:11434/'), 'http://localhost:11434');
  assert.equal(validateOllamaUrl('http://127.0.0.1:11434/api'), 'http://127.0.0.1:11434');
  assert.equal(validateOllamaUrl('http://[::1]:11434'), 'http://[::1]:11434');
  assert.equal(validateOllamaUrl('https://evil.example.com'), 'http://localhost:11434');
  assert.equal(validateOllamaUrl('javascript:alert(1)'), 'http://localhost:11434');
  assert.equal(validateOllamaUrl('http://localhost.evil.com:11434'), 'http://localhost:11434');
});

test('production CSP, referrer policy, and template interpolation guards stay intact', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('name="referrer" content="no-referrer"'));

  const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.js'), 'utf8');
  assert.ok(viteConfig.includes('Content-Security-Policy'));
  assert.ok(viteConfig.includes('generativelanguage.googleapis.com'));

  const cloudAccess = fs.readFileSync(path.join(rootDir, 'src', 'CloudAccess.jsx'), 'utf8');
  assert.ok(!cloudAccess.includes("ענפים — {t('cloud.recovery')}"), 'CloudAccess should interpolate ${t(...)}');
  assert.ok(cloudAccess.includes('anafim-cloud-autosync-v1'), 'CloudAccess should persist auto-sync preference');
  assert.ok(cloudAccess.includes('PasswordField'), 'CloudAccess should provide password show/hide toggle');
  assert.ok(cloudAccess.includes('handleCopyRecovery'), 'CloudAccess should provide one-click recovery key copy');
  assert.ok(!cloudAccess.includes('recoveryTail'), 'CloudAccess should not require typing the last 8 recovery characters');

  const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert.ok(!appJsx.includes('aria-label="{t('), 'App.jsx should not have quoted {t(...)} aria-labels');
  assert.ok(appJsx.includes('file-cloud-card'), 'FileView should expose quick Cloud Sync entry card');
});
