// Live OpenRouter tests for free-text family member addition.
//
// These tests call the real OpenRouter API using the OPENROUTER_API_KEY secret
// (CI) / environment variable. They are skipped when no key is configured, so
// the regular unit-test suite stays green without credentials.
//
// The assertions are intentionally tolerant: they verify that the model
// understands the proposed relatives JSON structure and that the deterministic
// pipeline (parse → clean → link → validate → apply) produces a coherent tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom, getRelations, normalize } from '../src/gedcom.js';
import { applyPersonUpdatesWithReport } from '../src/gedcom-ai-editor.js';
import { analyzePersonTextWithAi } from '../src/ai-service.js';

const API_KEY = (globalThis.process?.env?.OPENROUTER_API_KEY || '').trim();
const MODEL = (globalThis.process?.env?.OPENROUTER_TEST_MODEL || 'openrouter/free').trim();

// Route the provider through a minimal localStorage shim.
const storage = new Map();
storage.set('anafim_openrouter_api_key', API_KEY);
storage.set('anafim_openrouter_model', MODEL);
globalThis.window = {
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  },
};

const wrap = body =>
  `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${body}\n0 TRLR`;

const focalGed = () =>
  wrap(`0 @I1@ INDI\n1 NAME פלוני /בדיקה/\n1 SEX M`);

const focalWithWomanGed = () =>
  wrap(
    `0 @I1@ INDI\n1 NAME פלוני /בדיקה/\n1 SEX M\n` +
      `0 @I2@ INDI\n1 NAME פלמונית /כהן/\n1 SEX F`
  );

test(
  'live: focal facts (born 1985 in Haifa) are parsed from free text',
  { skip: !API_KEY, timeout: 300000 },
  async () => {
    const data = parseGedcom(focalGed());
    const result = await analyzePersonTextWithAi(
      data.people['@I1@'],
      'נולד ב-1985 בחיפה',
      { provider: 'openrouter', data }
    );
    assert.equal(result.valid, true, (result.errors || []).join(' | '));
    const json = JSON.stringify(result.sanitized);
    assert.match(json, /1985/, 'birth year missing from sanitized update: ' + json);
    assert.match(json, /חיפה/, 'birth place missing from sanitized update: ' + json);
  }
);

test(
  'live: "wife פלמונית, son אלמוני born 2022" adds both relatives and creates one family',
  { skip: !API_KEY, timeout: 300000 },
  async () => {
    const raw = focalGed();
    const data = parseGedcom(raw);
    const result = await analyzePersonTextWithAi(
      data.people['@I1@'],
      'אשתו של פלוני שמה פלמונית, ובנו אלמוני נולד ב-2022',
      { provider: 'openrouter', data }
    );
    assert.equal(result.valid, true, (result.errors || []).join(' | '));
    const rels = result.sanitized.relatives || [];
    assert.ok(rels.length >= 2, 'expected at least wife+son, got: ' + JSON.stringify(rels));
    const spouse = rels.find(r => ['wife', 'husband', 'spouse'].includes(r.relation));
    const child = rels.find(r => ['son', 'daughter', 'child'].includes(r.relation));
    assert.ok(spouse, 'no spouse relative in: ' + JSON.stringify(rels));
    assert.ok(child, 'no child relative in: ' + JSON.stringify(rels));
    assert.match(JSON.stringify(spouse), /פלמונית/, 'spouse name missing');
    assert.match(String(child.birthDate || ''), /2022/, 'child birth year missing');

    const report = applyPersonUpdatesWithReport(raw, '@I1@', result.sanitized);
    const d = parseGedcom(report.raw);
    assert.deepEqual(d.warnings, []);
    assert.equal(d.stats.people, 3, 'expected focal + wife + son');
    assert.equal(d.stats.families, 1, 'expected exactly one family');
    const relsAfter = getRelations(d, '@I1@');
    assert.equal(relsAfter.partners.length, 1);
    assert.match(relsAfter.partners[0].name, /פלמונית/);
    assert.equal(relsAfter.children.length, 1);
    assert.match(String(relsAfter.children[0].birth?.date || ''), /2022/);
  }
);

test(
  'live: a relative that already exists in the tree is linked, not duplicated',
  { skip: !API_KEY, timeout: 300000 },
  async () => {
    const raw = focalWithWomanGed(); // tree already has an unrelated פלמונית כהן @I2@
    const data = parseGedcom(raw);
    const result = await analyzePersonTextWithAi(
      data.people['@I1@'],
      'אשתו של פלוני שמה פלמונית, ובנו אלמוני נולד ב-2022',
      { provider: 'openrouter', data }
    );
    assert.equal(result.valid, true, (result.errors || []).join(' | '));
    const wife = (result.sanitized.relatives || []).find(r => r.relation === 'wife');
    assert.ok(wife, 'no wife relative in: ' + JSON.stringify(result.sanitized.relatives));
    assert.equal(
      wife.existingPersonId,
      '@I2@',
      'wife must be linked to the existing פלמונית כהן, got: ' + JSON.stringify(wife)
    );

    const report = applyPersonUpdatesWithReport(raw, '@I1@', result.sanitized);
    const d = parseGedcom(report.raw);
    assert.deepEqual(d.warnings, []);
    assert.equal(d.stats.people, 3, 'wife must be linked, not duplicated');
    const plmonit = Object.values(d.people).filter(p => normalize(p.name).includes('פלמונית'));
    assert.equal(plmonit.length, 1, 'exactly one פלמונית expected in the tree');
    assert.deepEqual(getRelations(d, '@I1@').partners.map(p => p.id), ['@I2@']);
    const child = getRelations(d, '@I1@').children[0];
    assert.match(String(child.birth?.date || ''), /2022/);
  }
);
