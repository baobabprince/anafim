// Tests for AI-driven free-text family member addition:
// - buildPrompt ships a tree people index, dedup rules and a wife+son example;
// - cleanAiUpdates hardens relative parsing (object→array, aliases, unknown keys);
// - linkRelativesToExistingPeople links unambiguous names, drops hallucinated ids,
//   and refuses self/cycle/conflicting-role links;
// - analyzePersonTextWithAi (mocked model) + applyPersonUpdatesWithReport add or
//   update wife/son without duplicating existing people.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom, getRelations, normalize } from '../src/gedcom.js';
import {
  cleanAiUpdates,
  linkRelativesToExistingPeople,
  applyPersonUpdatesWithReport,
} from '../src/gedcom-ai-editor.js';
import { buildPrompt, analyzePersonTextWithAi } from '../src/ai-service.js';

const wrap = body =>
  `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${body}\n0 TRLR`;

const singlePersonGed = () =>
  wrap(`0 @I1@ INDI\n1 NAME פלוני /בדיקה/\n1 SEX M`);

const focalWithWomanGed = () =>
  wrap(
    `0 @I1@ INDI\n1 NAME פלוני /בדיקה/\n1 SEX M\n` +
      `0 @I2@ INDI\n1 NAME פלמונית /כהן/\n1 SEX F`
  );

// Focal @I1@ already married to @I2@ פלמונית כהן, child @I3@ אלמוני כהן,
// two unrelated strangers both named דוד כהן (@I4@, @I5@), one unrelated
// stranger שירה לוי (@I6@).
const dedupFixtureGed = () =>
  wrap(
    `0 @I1@ INDI\n1 NAME פלוני /בדיקה/\n1 SEX M\n1 FAMS @F1@\n` +
      `0 @I2@ INDI\n1 NAME פלמונית /כהן/\n1 SEX F\n1 FAMS @F1@\n` +
      `0 @I3@ INDI\n1 NAME אלמוני /כהן/\n1 SEX M\n1 FAMC @F1@\n` +
      `0 @I4@ INDI\n1 NAME דוד /כהן/\n1 SEX M\n` +
      `0 @I5@ INDI\n1 NAME דוד /כהן/\n1 SEX M\n` +
      `0 @I6@ INDI\n1 NAME שירה /לוי/\n1 SEX F\n` +
      `0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@`
  );

const coupleGed = () =>
  wrap(
    `0 @I1@ INDI\n1 NAME דוד /כהן/\n1 SEX M\n1 FAMS @F1@\n` +
      `0 @I2@ INDI\n1 NAME שרה /כהן/\n1 SEX F\n1 FAMS @F1@\n` +
      `0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@`
  );

const SCENARIO_TEXT = 'אשתו של פלוני שמה פלמונית, ובנו אלמוני נולד ב-2022';

function mockWindowAi(promptTextOrQueue) {
  let call = 0;
  return {
    ai: {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async () => {
            const item = Array.isArray(promptTextOrQueue)
              ? promptTextOrQueue[Math.min(call++, promptTextOrQueue.length - 1)]
              : promptTextOrQueue;
            return item;
          },
          destroy: () => {},
        }),
      },
    },
  };
}

test('buildPrompt ships a tree people index, dedup rules and a wife+son-2022 example', () => {
  const d = parseGedcom(focalWithWomanGed());
  const prompt = buildPrompt(d.people['@I1@'], SCENARIO_TEXT, { data: d });

  // Whole-tree dedup index
  assert.ok(prompt.includes('People already in the tree'), 'people index block missing');
  assert.ok(prompt.includes('@I1@: פלוני בדיקה (M)'), 'focal missing from index');
  assert.ok(prompt.includes('@I2@: פלמונית כהן (F)'), 'existing woman missing from index');

  // Deduplication rule + relatives schema mention of existingPersonId
  assert.ok(prompt.includes('DEDUPLICATION'), 'dedup rule missing');
  assert.ok(prompt.includes('Never invent an existingPersonId'), 'hallucination guard missing');
  assert.ok(prompt.includes('"existingPersonId"'), 'relatives schema must expose existingPersonId');
  assert.ok(prompt.includes('id from the people index'), 'schema note for id field missing');

  // Example covering exactly the requested scenario (wife + son born 2022)
  assert.ok(prompt.includes('"relation":"wife"'), 'wife example missing');
  assert.ok(prompt.includes('"relation":"son"'), 'son example missing');
  assert.ok(prompt.includes('2022'), '2022 birth-year example missing');
  assert.ok(prompt.includes('@I7@'), 'link-existing example id missing');

  // Existing prompt contract must stay intact
  assert.ok(prompt.includes('"relatives"'));
  assert.ok(prompt.includes('"familyEvents"'));
  assert.ok(prompt.includes('"events"'));
  assert.ok(prompt.includes('"attributes"'));
});

test('cleanAiUpdates hardens relative parsing: object→array, alias mapping, unknown-key filtering', () => {
  // Single object instead of a one-element array + model aliases + unknown key
  const r1 = cleanAiUpdates({
    relatives: { relationship: 'son', fullName: 'דני לוי', age: '7', birthDate: '2022' },
  });
  assert.deepEqual(r1.cleaned.relatives, [
    { relation: 'son', name: 'דני לוי', birthDate: '2022' },
  ]);
  assert.deepEqual(r1.dropped, []);

  // Aliases and unknown keys inside array items
  const r2 = cleanAiUpdates({
    relatives: [
      { relationship: 'wife', givenName: 'פלמונית', occupationLevel: 'high', notes: [] },
    ],
  });
  assert.deepEqual(r2.cleaned.relatives, [{ relation: 'wife', givenName: 'פלמונית' }]);

  // Non-object structured values are still dropped (original contract)
  const r3 = cleanAiUpdates({ events: 'oops' });
  assert.deepEqual(r3.cleaned, {});
  assert.ok(r3.dropped.includes('events'));
});

test('linkRelativesToExistingPeople links unique names and refuses bad ids, ambiguity and cycles', () => {
  const d = parseGedcom(dedupFixtureGed());

  // 1) Unique full-name match links (already the same role — idempotent)
  const rel1 = { relation: 'wife', givenName: 'פלמונית', surname: 'כהן' };
  let res = linkRelativesToExistingPeople([rel1], d, '@I1@');
  assert.equal(rel1.existingPersonId, '@I2@');
  assert.deepEqual(res.linked, [{ id: '@I2@', name: 'פלמונית כהן', relation: 'wife', via: 'name' }]);

  // 2) Unique full-name match for the child
  const rel2 = { relation: 'son', givenName: 'אלמוני', surname: 'כהן' };
  linkRelativesToExistingPeople([rel2], d, '@I1@');
  assert.equal(rel2.existingPersonId, '@I3@');

  // 3) Valid model-provided id is kept as-is
  const rel3 = { relation: 'wife', existingPersonId: '@I2@' };
  res = linkRelativesToExistingPeople([rel3], d, '@I1@');
  assert.equal(rel3.existingPersonId, '@I2@');
  assert.equal(res.linked[0].via, 'model');

  // 4) Ambiguous name (two דוד כהן) → no link; the bogus id is dropped first
  const rel4 = { relation: 'brother', existingPersonId: '@I999@', givenName: 'דוד', surname: 'כהן' };
  linkRelativesToExistingPeople([rel4], d, '@I1@');
  assert.ok(!('existingPersonId' in rel4), 'bogus id must be dropped and the name stays ambiguous');
  const ambiguousAgain = { relation: 'brother', givenName: 'דוד', surname: 'כהן' };
  linkRelativesToExistingPeople([ambiguousAgain], d, '@I1@');
  assert.ok(!('existingPersonId' in ambiguousAgain));

  // 5) Cycle guard: father named like the focal's child is refused
  const rel5 = { relation: 'father', givenName: 'אלמוני', surname: 'כהן' };
  linkRelativesToExistingPeople([rel5], d, '@I1@');
  assert.ok(!('existingPersonId' in rel5), 'descendant as parent must be refused');

  // 6) Cycle guard: wife id pointing at the focal's child is refused, name fallback too
  const rel6 = { relation: 'wife', existingPersonId: '@I3@' };
  linkRelativesToExistingPeople([rel6], d, '@I1@');
  assert.ok(!('existingPersonId' in rel6), 'descendant as spouse must be refused');

  // 7) Self-link is dropped
  const rel7 = { relation: 'son', existingPersonId: '@I1@' };
  linkRelativesToExistingPeople([rel7], d, '@I1@');
  assert.ok(!('existingPersonId' in rel7), 'self-link must be dropped');

  // 8) Hallucinated id falls back to a unique name match
  const rel8 = { relation: 'wife', existingPersonId: '@I999@', givenName: 'שירה', surname: 'לוי' };
  res = linkRelativesToExistingPeople([rel8], d, '@I1@');
  assert.equal(rel8.existingPersonId, '@I6@', 'name match must recover after bogus id is dropped');
  assert.equal(res.linked[0].via, 'name');

  // 9) Role conflict: the existing wife cannot become the father
  const rel9 = { relation: 'father', givenName: 'פלמונית', surname: 'כהן' };
  linkRelativesToExistingPeople([rel9], d, '@I1@');
  assert.ok(!('existingPersonId' in rel9), 'spouse→parent role conflict must be refused');

  // 10) Unresolvable person/family references are dropped; valid ones kept
  const rel10 = {
    relation: 'son',
    givenName: 'משה',
    otherParentId: '@I999@',
    halfParentId: '@I5@',
    targetFamilyId: '@F999@',
  };
  const rel11 = { relation: 'son', givenName: 'יעל', targetFamilyId: '@F1@' };
  linkRelativesToExistingPeople([rel10, rel11], d, '@I1@');
  assert.ok(!('otherParentId' in rel10), 'nonexistent otherParentId must be dropped');
  assert.equal(rel10.halfParentId, '@I5@');
  assert.ok(!('targetFamilyId' in rel10), 'nonexistent targetFamilyId must be dropped');
  assert.equal(rel11.targetFamilyId, '@F1@');

  // 11) Two relatives may never link the same person in one batch
  const relA = { relation: 'wife', givenName: 'פלמונית', surname: 'כהן' };
  const relB = { relation: 'mother', givenName: 'פלמונית', surname: 'כהן' };
  res = linkRelativesToExistingPeople([relA, relB], d, '@I1@');
  assert.equal(relA.existingPersonId, '@I2@');
  assert.ok(!('existingPersonId' in relB), 'same person must not be linked twice');
  assert.equal(res.linked.length, 1);
});

test('free text adds a new wife and a son born 2022 through analyze+apply (mocked AI)', async () => {
  const raw = singlePersonGed();
  const data = parseGedcom(raw);
  const origWindow = globalThis.window;
  globalThis.window = mockWindowAi(
    JSON.stringify({
      relatives: [
        { relationship: 'wife', fullName: 'פלמונית' },
        { relation: 'son', givenName: 'אלמוני', birthDate: '2022', otherParentName: 'פלמונית' },
      ],
    })
  );
  try {
    const result = await analyzePersonTextWithAi(data.people['@I1@'], SCENARIO_TEXT, { data });
    assert.equal(result.valid, true, (result.errors || []).join(' | '));
    assert.deepEqual(result.warnings, []);
    const wife = result.sanitized.relatives.find(r => r.relation === 'wife');
    const son = result.sanitized.relatives.find(r => r.relation === 'son');
    assert.ok(wife, JSON.stringify(result.sanitized.relatives));
    assert.ok(son, JSON.stringify(result.sanitized.relatives));
    assert.equal(wife.givenName, 'פלמונית'); // fullName alias mapped onto the schema
    assert.equal(son.givenName, 'אלמוני');
    assert.equal(son.birthDate, '2022');

    const report = applyPersonUpdatesWithReport(raw, '@I1@', result.sanitized);
    const d = parseGedcom(report.raw);
    assert.deepEqual(d.warnings, []);
    assert.equal(d.stats.people, 3);
    assert.equal(d.stats.families, 1);
    const rels = getRelations(d, '@I1@');
    assert.equal(rels.partners.length, 1);
    assert.equal(rels.partners[0].name, 'פלמונית');
    assert.equal(rels.children.length, 1);
    assert.equal(rels.children[0].name, 'אלמוני');
    assert.match(String(rels.children[0].birth?.date || ''), /2022/);
  } finally {
    globalThis.window = origWindow;
  }
});

test('an existing relative is linked and updated, not duplicated (mocked AI)', async () => {
  const raw = focalWithWomanGed(); // tree already has an unrelated פלמונית כהן @I2@
  const data = parseGedcom(raw);
  const origWindow = globalThis.window;
  globalThis.window = mockWindowAi(
    JSON.stringify({
      relatives: [
        { relation: 'wife', givenName: 'פלמונית', surname: 'כהן', marriageDate: '2010' },
        { relation: 'son', givenName: 'אלמוני', birthDate: '2022', otherParentName: 'פלמונית כהן' },
      ],
    })
  );
  try {
    const result = await analyzePersonTextWithAi(data.people['@I1@'], SCENARIO_TEXT, { data });
    assert.equal(result.valid, true, (result.errors || []).join(' | '));
    const wife = result.sanitized.relatives.find(r => r.relation === 'wife');
    assert.equal(wife.existingPersonId, '@I2@', 'name-based dedup link missing');
    assert.equal(result.linkedRelatives.length, 1);
    assert.equal(result.linkedRelatives[0].id, '@I2@');
    assert.equal(result.linkedRelatives[0].via, 'name');

    const report = applyPersonUpdatesWithReport(raw, '@I1@', result.sanitized);
    const d = parseGedcom(report.raw);
    assert.deepEqual(d.warnings, []);
    assert.equal(d.stats.people, 3, 'wife must not be duplicated');
    assert.equal(d.stats.families, 1);
    const plmonit = Object.values(d.people).filter(p => normalize(p.name).includes('פלמונית'));
    assert.equal(plmonit.length, 1, 'exactly one פלמונית in the tree');
    assert.deepEqual(getRelations(d, '@I1@').partners.map(p => p.id), ['@I2@']);
    const child = getRelations(d, '@I1@').children[0];
    assert.match(String(child.birth?.date || ''), /2022/);
  } finally {
    globalThis.window = origWindow;
  }
});

test('AI-provided existingPersonId is honored; hallucinated ids fall back to name matching', async () => {
  const raw = focalWithWomanGed();
  const data = parseGedcom(raw);
  const origWindow = globalThis.window;
  globalThis.window = mockWindowAi([
    // run 1: the model followed the people index
    JSON.stringify({ relatives: [{ relation: 'wife', existingPersonId: '@I2@', occupation: 'מחנכת' }] }),
    // run 2: the model invented @I999@ but returned the right name
    JSON.stringify({
      relatives: [{ relation: 'wife', existingPersonId: '@I999@', givenName: 'פלמונית', surname: 'כהן' }],
    }),
  ]);
  try {
    // run 1 — valid id kept, marked as model-provided
    const r1 = await analyzePersonTextWithAi(data.people['@I1@'], 'אשתו פלמונית כהן', { data });
    assert.equal(r1.valid, true, (r1.errors || []).join(' | '));
    const wife1 = r1.sanitized.relatives[0];
    assert.equal(wife1.existingPersonId, '@I2@');
    assert.equal(r1.linkedRelatives[0].via, 'model');
    const report1 = applyPersonUpdatesWithReport(raw, '@I1@', r1.sanitized);
    const d1 = parseGedcom(report1.raw);
    assert.equal(d1.stats.people, 2, 'no new person for a linked wife');
    assert.equal(d1.people['@I2@'].name, 'פלמונית כהן');
    assert.equal(d1.people['@I2@'].occupation, 'מחנכת', 'new fact must be merged in');
    assert.deepEqual(d1.warnings, []);

    // run 2 — hallucinated id dropped, recovered via unique name match
    const r2 = await analyzePersonTextWithAi(data.people['@I1@'], 'אשתו פלמונית כהן', { data });
    assert.equal(r2.valid, true, 'hallucinated id must not fail validation after sanitization: ' + (r2.errors || []).join(' | '));
    assert.equal(r2.sanitized.relatives[0].existingPersonId, '@I2@');
    assert.equal(r2.linkedRelatives[0].via, 'name');
    const report2 = applyPersonUpdatesWithReport(raw, '@I1@', r2.sanitized);
    const d2 = parseGedcom(report2.raw);
    assert.equal(d2.stats.people, 2);
    assert.deepEqual(d2.warnings, []);
  } finally {
    globalThis.window = origWindow;
  }
});

test('linking an existing relative updates facts without renaming or recoloring them', () => {
  const raw = coupleGed();
  const updates = {
    relatives: [
      {
        relation: 'wife',
        existingPersonId: '@I2@',
        givenName: 'שונה לחלוטין',
        surname: 'אחרת',
        sex: 'M',
        occupation: 'מחנכת',
        birthDate: '1950',
      },
    ],
  };
  const report = applyPersonUpdatesWithReport(raw, '@I1@', updates);
  const d = parseGedcom(report.raw);
  assert.deepEqual(d.warnings, []);
  assert.equal(d.stats.people, 2, 'no new person created');
  assert.deepEqual(report.createdPeople, []);
  assert.equal(d.people['@I2@'].name, 'שרה כהן', 'linked person must keep their NAME line');
  assert.equal(d.people['@I2@'].sex, 'F', 'linked person must keep their SEX line');
  assert.equal(d.people['@I2@'].occupation, 'מחנכת', 'new fact must still be applied');
  assert.match(String(d.people['@I2@'].birth?.date || ''), /1950/);
});
