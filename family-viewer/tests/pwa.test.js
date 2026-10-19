import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

test('PWA manifest exists and contains valid JSON with Hebrew app info', () => {
  const manifestPath = path.join(rootDir, 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist in public directory');
  const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(content.short_name, 'ענפים');
  assert.ok(content.name.includes('ענפים'));
  assert.equal(content.display, 'standalone');
  assert.equal(content.dir, 'rtl');
  assert.equal(content.lang, 'he');

  assert.ok(Array.isArray(content.icons) && content.icons.length >= 2, 'manifest should include icon definitions');
  for (const icon of content.icons) {
    const iconFile = path.join(rootDir, 'public', icon.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(iconFile), `manifest icon file ${icon.src} should exist`);
  }
});

test('index.html links manifest.json and includes mobile web app meta tags', () => {
  const indexPath = path.join(rootDir, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  assert.ok(indexContent.includes('<link rel="manifest" href="/manifest.json" />'), 'index.html should link to manifest.json');
  assert.ok(indexContent.includes('name="mobile-web-app-capable" content="yes"'), 'index.html should include mobile-web-app-capable meta tag');
});

test('App.jsx includes Android home screen save instructions in HelpDialog and beforeinstallprompt handler', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(appContent.includes('שמירת העמוד בדף הבית באנדרואיד'), 'HelpDialog should include Android save instructions title');
  assert.ok(appContent.includes('beforeinstallprompt'), 'App component should listen for beforeinstallprompt event');
  assert.ok(appContent.includes('installPrompt'), 'App component should maintain installPrompt state');
});
