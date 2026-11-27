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

test('GEDCOM AI editor blocks tag/record injection across relatives, events, attributes, familyEvents, and customTags', () => {
  const sampleGed = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
0 TRLR`;

  // Forbidden structural tags must be rejected
  for (const forbidden of ['INDI', 'FAM', 'FAMC', 'FAMS', 'HUSB', 'WIFE', 'CHIL', 'HEAD', 'TRLR', 'BAD TAG!']) {
    const resEv = validatePersonUpdates({ events: [{ tag: forbidden, date: '2000' }] }, {});
    assert.equal(resEv.valid, false, `Forbidden event tag ${forbidden} must be rejected`);
    const resAttr = validatePersonUpdates({ attributes: [{ tag: forbidden, value: 'x' }] }, {});
    assert.equal(resAttr.valid, false, `Forbidden attribute tag ${forbidden} must be rejected`);
    const resCustom = validatePersonUpdates({ customTags: [{ tag: forbidden, value: 'x' }] }, {});
    assert.equal(resCustom.valid, false, `Forbidden custom tag ${forbidden} must be rejected`);
  }

  // Newlines inside relative / event / attribute / familyEvent strings must never inject top-level 0 records
  const validated = validatePersonUpdates({
    relatives: [{
      relation: 'son',
      givenName: 'דוד\n0 @I999@ INDI\n1 NAME פורץ',
      surname: 'כהן/לוי\r\n1 FAMC @F99@',
      birthPlace: 'ירושלים\n1 DEAT\n2 DATE 1900',
    }],
    events: [{
      tag: 'EVEN',
      type: 'כנס\n0 @I888@ INDI',
      place: 'חיפה\n1 SEX F',
    }],
    attributes: [{
      tag: 'FACT',
      value: 'ערך\n0 @I777@ INDI',
    }],
    familyEvents: [{
      tag: 'MARR',
      place: 'תל אביב\n0 @F999@ FAM',
    }],
    customTags: [{
      tag: '_TEST',
      value: 'בטוח\n0 @I666@ INDI',
    }],
  }, {}, { rawGedcom: sampleGed, personId: '@I1@' });

  assert.equal(validated.valid, true);
  const updated = applyPersonUpdatesToGedcom(sampleGed, '@I1@', validated.sanitized);
  assert.ok(!/^0 @I999@/m.test(updated));
  assert.ok(!/^0 @I888@/m.test(updated));
  assert.ok(!/^0 @I777@/m.test(updated));
  assert.ok(!/^0 @I666@/m.test(updated));
  assert.ok(!/^0 @F999@/m.test(updated));
  assert.ok(!/^1 FAMC @F99@/m.test(updated));
  assert.ok(!/^1 DEAT/m.test(updated));

  const parsed = parseGedcom(updated);
  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.stats.people, 2);
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
  assert.ok(viteConfig.includes('https://openrouter.ai'), 'Production CSP must allow OpenRouter API');
  assert.ok(viteConfig.includes('https://*.hf.co'), 'Production CSP must allow Hugging Face CDN/Xet subdomains (*.hf.co)');

  const headersFile = fs.readFileSync(path.join(rootDir, 'public', '_headers'), 'utf8');
  assert.ok(headersFile.includes('https://openrouter.ai'), 'public/_headers CSP must allow OpenRouter API');
  assert.ok(headersFile.includes('https://*.hf.co'), 'public/_headers CSP must allow Hugging Face CDN/Xet subdomains (*.hf.co)');

  const cloudAccess = fs.readFileSync(path.join(rootDir, 'src', 'CloudAccess.jsx'), 'utf8');
  assert.ok(!cloudAccess.includes("ענפים — {t('cloud.recovery')}"), 'CloudAccess should interpolate ${t(...)}');
  assert.ok(cloudAccess.includes('anafim-cloud-autosync-v1'), 'CloudAccess should persist auto-sync preference');
  assert.ok(cloudAccess.includes('PasswordField'), 'CloudAccess should provide password show/hide toggle');
  assert.ok(cloudAccess.includes('handleCopyRecovery'), 'CloudAccess should provide one-click recovery key copy');
  assert.ok(!cloudAccess.includes('recoveryTail'), 'CloudAccess should not require typing the last 8 recovery characters');

  const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert.ok(!appJsx.includes('aria-label="{t('), 'App.jsx should not have quoted {t(...)} aria-labels');
  assert.ok(appJsx.includes('file-cloud-card'), 'FileView should expose quick Cloud Sync entry card');
  assert.ok(appJsx.includes('topbar-cloud-btn'), 'Topbar should expose direct mobile Vault access button');
  assert.ok(appJsx.includes('upload-cloud-banner'), 'UploadDialog should offer a shortcut to open the Cloud Vault');
  assert.ok(appJsx.includes('mobile-vault-banner'), 'Main view should surface a quick unlock banner when Vault is locked');

  assert.ok(cloudAccess.includes('anafim-cloud-oauth-pending-v1'), 'CloudAccess should auto-open Vault after OAuth redirect');
  assert.ok(cloudAccess.includes('cloud-modal-backdrop'), 'CloudAccess dialog should use mobile bottom-sheet backdrop');
  assert.ok(cloudAccess.includes("phase === 'loading'"), 'CloudAccess should render an explicit loading state');
  assert.ok(cloudAccess.includes('autoCapitalize="none"'), 'PasswordField should disable mobile auto-capitalization');
  assert.ok(!cloudAccess.includes('window.confirm('), 'CloudAccess should use inline confirmations instead of blocking window.confirm on mobile');
  assert.ok(cloudAccess.includes('saveDeviceVaultKey'), 'CloudAccess should persist unlocked key on trusted device');
  assert.ok(cloudAccess.includes('clearDeviceVaultState'), 'CloudAccess should wipe device key on explicit lock/logout/erase');
  assert.ok(appJsx.includes('hasRememberedVaultSync'), 'App should suppress initial UploadDialog when device vault is remembered');

  const cloudCss = fs.readFileSync(path.join(rootDir, 'src', 'cloud.css'), 'utf8');
  assert.ok(cloudCss.includes('cloudSheetUp'), 'cloud.css should animate the mobile bottom sheet');
  assert.ok(cloudCss.includes('env(safe-area-inset-bottom)'), 'cloud.css should respect mobile safe-area-inset-bottom');
});
