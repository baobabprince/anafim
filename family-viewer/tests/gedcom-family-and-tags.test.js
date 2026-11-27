import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parseGedcom,
  getRelations,
  findRelationshipPath,
  decodeGedcom,
} from '../src/gedcom.js';
import { personInformation, eventTitle } from '../src/person-info.js';
import {
  INDI_EVENT_TAGS,
  INDI_ATTRIBUTE_TAGS,
  INDI_CONTACT_AND_META_TAGS,
  FAM_EVENT_TAGS,
  normalizeRelationType,
  inferSexFromRelation,
  relationCategory,
  isValidGedcomTagName,
} from '../src/gedcom-tags.js';
import {
  validatePersonUpdates,
  cleanAiUpdates,
  applyPersonUpdatesToGedcom,
  applyPersonUpdatesWithReport,
  allocateNextXref,
} from '../src/gedcom-ai-editor.js';
import {
  hasConfiguredAi,
  markAiConfigured,
  clearAiConfiguration,
  getDefaultEditMode,
  shouldShowAiSettingsByDefault,
  setGeminiApiKey,
  removeGeminiApiKey,
  setOpenRouterApiKey,
  removeOpenRouterApiKey,
  buildPrompt,
  analyzePersonTextWithAi,
} from '../src/ai-service.js';

const wrap = (body) => `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${body}\n0 TRLR`;

function baseSinglePersonGed() {
  return wrap(`0 @I1@ INDI
1 NAME דוד /כהן/
2 GIVN דוד
2 SURN כהן
1 SEX M
1 BIRT
2 DATE 10 MAY 1950
2 PLAC תל אביב`);
}

function coupleGed() {
  return wrap(`0 @I1@ INDI
1 NAME דוד /כהן/
2 GIVN דוד
2 SURN כהן
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME שרה /כהן/
2 GIVN שרה
2 SURN כהן
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1975`);
}

// ============================================================================
// 1. PARENTS ADDITION TESTS
// ============================================================================

test('parents: add father to person without parents, then add mother into same FAM', () => {
  const step1 = applyPersonUpdatesWithReport(baseSinglePersonGed(), '@I1@', {
    relatives: [{ relation: 'father', givenName: 'יצחק', surname: 'כהן', birthDate: '1920' }],
  });
  assert.equal(step1.createdPeople.length, 1);
  assert.equal(step1.createdFamilies.length, 1);
  const d1 = parseGedcom(step1.raw);
  assert.equal(d1.stats.people, 2);
  assert.equal(d1.stats.families, 1);
  assert.equal(d1.warnings.length, 0);
  assert.deepEqual(getRelations(d1, '@I1@').parents.map(p => p.name), ['יצחק כהן']);

  const step2 = applyPersonUpdatesWithReport(step1.raw, '@I1@', {
    relatives: [{ relation: 'mother', givenName: 'רבקה', surname: 'כהן', birthDate: '1924' }],
  });
  assert.equal(step2.createdPeople.length, 1);
  assert.equal(step2.createdFamilies.length, 0);
  assert.deepEqual(step2.updatedFamilies, step1.createdFamilies);
  const d2 = parseGedcom(step2.raw);
  assert.equal(d2.stats.people, 3);
  assert.equal(d2.stats.families, 1);
  assert.equal(d2.warnings.length, 0);
  assert.deepEqual(getRelations(d2, '@I1@').parents.map(p => p.name), ['יצחק כהן', 'רבקה כהן']);
});

test('parents: adding both father and mother in one batch shares one FAM', () => {
  const report = applyPersonUpdatesWithReport(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'mother', givenName: 'מרים', surname: 'לוי' },
      { relation: 'father', givenName: 'משה', surname: 'כהן' },
    ],
  });
  assert.equal(report.createdPeople.length, 2);
  assert.equal(report.createdFamilies.length, 1);
  const d = parseGedcom(report.raw);
  assert.equal(d.stats.families, 1);
  assert.equal(d.warnings.length, 0);
  assert.equal(getRelations(d, '@I1@').parents.length, 2);
});

test('parents: adoptive, foster, and sealing parents create separate PEDI families', () => {
  const withBirthParents = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'father', givenName: 'יעקב', surname: 'כהן' },
      { relation: 'mother', givenName: 'לאה', surname: 'כהן' },
    ],
  });
  const withAdoptive = applyPersonUpdatesToGedcom(withBirthParents, '@I1@', {
    relatives: [
      { relation: 'mother', givenName: 'חנה', surname: 'ברק', pedigree: 'adopted' },
      { relation: 'father', givenName: 'דן', surname: 'דרור', pedigree: 'foster' },
      { relation: 'mother', givenName: 'אסתר', surname: 'שלם', pedigree: 'sealing' },
    ],
  });
  const d = parseGedcom(withAdoptive);
  assert.equal(d.warnings.length, 0);
  assert.equal(d.people['@I1@'].parentFamilies.length, 4);
  assert.deepEqual(getRelations(d, '@I1@').parents.map(p => p.name), ['יעקב כהן', 'לאה כהן']);
  const adoptFam = d.people['@I1@'].parentFamilies.find(pf => pf.type === 'adopted');
  const fosterFam = d.people['@I1@'].parentFamilies.find(pf => pf.type === 'foster');
  const sealingFam = d.people['@I1@'].parentFamilies.find(pf => pf.type === 'sealing');
  assert.ok(adoptFam && fosterFam && sealingFam);
  assert.deepEqual(getRelations(d, '@I1@', adoptFam.id).parents.map(p => p.name), ['חנה ברק']);
  assert.deepEqual(getRelations(d, '@I1@', fosterFam.id).parents.map(p => p.name), ['דן דרור']);
  assert.deepEqual(getRelations(d, '@I1@', sealingFam.id).parents.map(p => p.name), ['אסתר שלם']);
});

test('parents: adding 3rd birth parent when 2 birth parents exist creates separate family', () => {
  const withTwo = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'father', givenName: 'יעקב', surname: 'כהן' },
      { relation: 'mother', givenName: 'לאה', surname: 'כהן' },
    ],
  });
  const withThird = applyPersonUpdatesToGedcom(withTwo, '@I1@', {
    relatives: [{ relation: 'parent', givenName: 'הורה', surname: 'נוסף', sex: 'U' }],
  });
  const d = parseGedcom(withThird);
  assert.equal(d.stats.families, 2);
  assert.equal(d.people['@I1@'].parentFamilies.length, 2);
});

test('parents: reconciles family-only FAM > CHIL link when adding second parent and supports same-sex parents', () => {
  const famOnlyGed = wrap(`0 @I1@ INDI
1 NAME ילד /בדיקה/
1 SEX M
0 @I2@ INDI
1 NAME אלון /בדיקה/
1 SEX M
0 @F1@ FAM
1 HUSB @I2@
1 CHIL @I1@`);

  const updated = applyPersonUpdatesToGedcom(famOnlyGed, '@I1@', {
    relatives: [{ relation: 'father', givenName: 'איתי', surname: 'בדיקה', sex: 'M' }],
  });
  const d = parseGedcom(updated);
  assert.equal(d.stats.families, 1);
  assert.equal(d.warnings.length, 0);
  assert.deepEqual(getRelations(d, '@I1@').parents.map(p => p.name), ['אלון בדיקה', 'איתי בדיקה']);
});

test('parents: linking existing person as parent', () => {
  const twoPeople = wrap(`0 @I1@ INDI
1 NAME דני /לוי/
1 SEX M
0 @I2@ INDI
1 NAME אברהם /לוי/
1 SEX M`);
  const updated = applyPersonUpdatesToGedcom(twoPeople, '@I1@', {
    relatives: [{ relation: 'father', existingPersonId: '@I2@' }],
  });
  const d = parseGedcom(updated);
  assert.equal(d.stats.people, 2);
  assert.equal(d.stats.families, 1);
  assert.deepEqual(getRelations(d, '@I1@').parents.map(p => p.id), ['@I2@']);
  assert.deepEqual(getRelations(d, '@I2@').children.map(p => p.id), ['@I1@']);
});

// ============================================================================
// 2. SPOUSES ADDITION TESTS
// ============================================================================

test('spouses: add spouse with MARR, ENGA, DIV, MARC, ANUL events', () => {
  const updated = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [{
      relation: 'wife',
      givenName: 'רונית',
      surname: 'אברהמי',
      engagementDate: '1973',
      engagementPlace: 'חיפה',
      marriageDate: '10 JUN 1974',
      marriagePlace: 'תל אביב',
      divorceDate: '1988',
      divorcePlace: 'ירושלים',
      familyEvents: [
        { tag: 'MARC', date: '9 JUN 1974', place: 'תל אביב', detail: 'כתובה' },
        { tag: 'ANUL', date: '1990', note: 'ביטול רישום' },
      ],
    }],
  });
  const d = parseGedcom(updated);
  assert.equal(d.stats.people, 2);
  assert.equal(d.stats.families, 1);
  assert.equal(d.warnings.length, 0);
  const fam = Object.values(d.families)[0];
  assert.equal(fam.marriage?.date, '10 JUN 1974');
  assert.equal(fam.marriage?.place, 'תל אביב');
  assert.equal(fam.divorce?.date, '1988');
  assert.equal(fam.events.find(e => e.type === 'ENGA')?.date, '1973');
  assert.equal(fam.events.find(e => e.type === 'MARC')?.detail, 'כתובה');
  assert.equal(fam.events.find(e => e.type === 'ANUL')?.date, '1990');
});

test('spouses: remarriage creates separate FAM while preserving first family and children', () => {
  const withFirstChild = applyPersonUpdatesToGedcom(coupleGed(), '@I1@', {
    relatives: [{ relation: 'son', givenName: 'איתי', surname: 'כהן' }],
  });
  const withSecondWife = applyPersonUpdatesToGedcom(withFirstChild, '@I1@', {
    relatives: [{ relation: 'wife', givenName: 'מיכל', surname: 'אורן', marriageDate: '2001' }],
  });
  const d = parseGedcom(withSecondWife);
  assert.equal(d.stats.families, 2);
  const rels = getRelations(d, '@I1@');
  assert.deepEqual(rels.partners.map(p => p.name), ['שרה כהן', 'מיכל אורן']);
  assert.deepEqual(rels.children.map(c => c.otherParent), ['שרה']);
});

test('spouses: same-sex, unknown-sex partners, idempotent existing link, and attach to existing single-parent family', () => {
  const withSameSex = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'husband', givenName: 'תומר', surname: 'אדלר', marriageDate: '2015' },
      { relation: 'spouse', givenName: 'אלכס', surname: 'בן ארי', sex: 'U' },
    ],
  });
  const d1 = parseGedcom(withSameSex);
  assert.equal(d1.stats.families, 2);
  assert.equal(getRelations(d1, '@I1@').partners.length, 2);

  // Idempotent existing link on coupleGed() updates existing @F1@ without duplicating
  const idempotent = applyPersonUpdatesWithReport(coupleGed(), '@I1@', {
    relatives: [{ relation: 'wife', existingPersonId: '@I2@', marriagePlace: 'חיפה' }],
  });
  assert.equal(idempotent.createdFamilies.length, 0);
  assert.deepEqual(idempotent.updatedFamilies, ['@F1@']);
  const d2 = parseGedcom(idempotent.raw);
  assert.equal(d2.stats.families, 1);
  assert.equal(d2.families['@F1@'].partners.length, 2);
  assert.equal(d2.families['@F1@'].marriage?.place, 'חיפה');
  assert.equal(d2.families['@F1@'].marriage?.date, '1975');

  // Attach spouse to existing single-parent family with children
  const singleParent = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [{ relation: 'daughter', givenName: 'נועה', surname: 'כהן' }],
  });
  const dSingle = parseGedcom(singleParent);
  const singleFamId = dSingle.people['@I1@'].spouseFamilies[0];
  const attached = applyPersonUpdatesToGedcom(singleParent, '@I1@', {
    relatives: [{ relation: 'wife', givenName: 'ענת', surname: 'כהן', targetFamilyId: singleFamId }],
  });
  const dAttached = parseGedcom(attached);
  assert.equal(dAttached.stats.families, 1);
  assert.deepEqual(getRelations(dAttached, '@I1@').children.map(c => c.otherParent), ['ענת']);
});

// ============================================================================
// 3. CHILDREN ADDITION TESTS
// ============================================================================

test('children: single parent, couple reuse, targetFamilyId, otherParentId, otherParentName, createNewFamily, PEDI, reverse order batch', () => {
  // Single parent child
  const single = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [{ relation: 'son', givenName: 'טל', surname: 'כהן' }],
  });
  assert.equal(parseGedcom(single).stats.families, 1);

  // Multiple marriages targeting by otherParentId, otherParentName, targetFamilyId, and createNewFamily
  const twoSpouses = applyPersonUpdatesToGedcom(coupleGed(), '@I1@', {
    relatives: [{ relation: 'wife', givenName: 'נורית', surname: 'לוי', marriageDate: '1992' }],
  });
  const dTwo = parseGedcom(twoSpouses);
  const fam2Id = dTwo.people['@I1@'].spouseFamilies[1];
  const nuritId = dTwo.families[fam2Id].partners.find(id => id !== '@I1@');

  const multiChildren = applyPersonUpdatesToGedcom(twoSpouses, '@I1@', {
    relatives: [
      { relation: 'daughter', givenName: 'מאיה', surname: 'כהן', otherParentId: '@I2@' },
      { relation: 'son', givenName: 'רון', surname: 'כהן', otherParentName: 'נורית' },
      { relation: 'daughter', givenName: 'גיל', surname: 'כהן', targetFamilyId: fam2Id, pedigree: 'adopted' },
      { relation: 'son', givenName: 'אור', surname: 'כהן', createNewFamily: true, pedigree: 'foster' },
    ],
  });
  const dMulti = parseGedcom(multiChildren);
  assert.equal(dMulti.stats.families, 3);
  const children = getRelations(dMulti, '@I1@').children;
  assert.equal(children.find(c => c.given === 'מאיה')?.otherParent, 'שרה');
  assert.equal(children.find(c => c.given === 'רון')?.otherParent, 'נורית');
  assert.equal(children.find(c => c.given === 'גיל')?.otherParent, 'נורית');
  assert.equal(children.find(c => c.given === 'גיל')?.parentFamilies[0].type, 'adopted');
  assert.equal(children.find(c => c.given === 'אור')?.otherParent, '');
  assert.equal(children.find(c => c.given === 'אור')?.parentFamilies[0].type, 'foster');
  assert.ok(nuritId);

  // Batch children BEFORE spouse in input array -> deterministic ordering merges all into ONE family!
  const reverseOrder = applyPersonUpdatesWithReport(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'son', givenName: 'יואב', surname: 'כהן' },
      { relation: 'daughter', givenName: 'ליאור', surname: 'כהן' },
      { relation: 'wife', givenName: 'תמר', surname: 'כהן', marriageDate: '1980' },
    ],
  });
  assert.equal(reverseOrder.createdFamilies.length, 1);
  const dRev = parseGedcom(reverseOrder.raw);
  assert.equal(dRev.stats.families, 1);
  assert.equal(getRelations(dRev, '@I1@').children.length, 2);
  assert.deepEqual(getRelations(dRev, '@I1@').children.map(c => c.otherParent), ['תמר', 'תמר']);
});

test('children: link existing person as child', () => {
  const twoPeople = wrap(`0 @I1@ INDI
1 NAME משה /לוי/
1 SEX M
0 @I2@ INDI
1 NAME רועי /לוי/
1 SEX M`);
  const updated = applyPersonUpdatesToGedcom(twoPeople, '@I1@', {
    relatives: [{ relation: 'son', existingPersonId: '@I2@' }],
  });
  const d = parseGedcom(updated);
  assert.deepEqual(getRelations(d, '@I1@').children.map(c => c.id), ['@I2@']);
});

// ============================================================================
// 4. SIBLINGS ADDITION TESTS
// ============================================================================

test('siblings: full sibling, sibling with no parents + parent added later, reverse batch order, half-sibling, existing sibling', () => {
  // Full sibling to existing parent family
  const withParents = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'father', givenName: 'משה', surname: 'כהן' },
      { relation: 'mother', givenName: 'לאה', surname: 'כהן' },
    ],
  });
  const withFullSib = applyPersonUpdatesToGedcom(withParents, '@I1@', {
    relatives: [{ relation: 'sister', givenName: 'עדי', surname: 'כהן' }],
  });
  const dFull = parseGedcom(withFullSib);
  assert.equal(dFull.stats.families, 1);
  const fullSibs = getRelations(dFull, '@I1@').siblings;
  assert.equal(fullSibs.length, 1);
  assert.equal(fullSibs[0].half, false);

  // Sibling when focal person has NO parents -> creates parentless FAM -> then adding parent reuses same FAM
  const sibFirst = applyPersonUpdatesWithReport(baseSinglePersonGed(), '@I1@', {
    relatives: [{ relation: 'brother', givenName: 'אבי', surname: 'כהן' }],
  });
  assert.equal(sibFirst.createdFamilies.length, 1);
  const dSibFirst = parseGedcom(sibFirst.raw);
  assert.deepEqual(getRelations(dSibFirst, '@I1@').siblings.map(s => s.given), ['אבי']);

  const parentAfterSib = applyPersonUpdatesWithReport(sibFirst.raw, '@I1@', {
    relatives: [{ relation: 'father', givenName: 'יעקב', surname: 'כהן' }],
  });
  assert.equal(parentAfterSib.createdFamilies.length, 0);
  const dParentAfter = parseGedcom(parentAfterSib.raw);
  assert.equal(dParentAfter.stats.families, 1);
  assert.deepEqual(getRelations(dParentAfter, '@I1@').siblings.map(s => s.given), ['אבי']);
  assert.deepEqual(getRelations(dParentAfter, '@I1@').parents.map(p => p.given), ['יעקב']);
  const fatherId = getRelations(dParentAfter, '@I1@').parents[0].id;
  assert.equal(getRelations(dParentAfter, fatherId).children.length, 2);

  // Reverse order batch: [sibling, mother, father] -> 1 FAM
  const revBatch = applyPersonUpdatesWithReport(baseSinglePersonGed(), '@I1@', {
    relatives: [
      { relation: 'sister', givenName: 'דנה', surname: 'כהן' },
      { relation: 'mother', givenName: 'רחל', surname: 'כהן' },
      { relation: 'father', givenName: 'יוסף', surname: 'כהן' },
    ],
  });
  assert.equal(revBatch.createdFamilies.length, 1);
  const dRevBatch = parseGedcom(revBatch.raw);
  assert.equal(dRevBatch.stats.families, 1);
  assert.equal(getRelations(dRevBatch, '@I1@').parents.length, 2);
  assert.equal(getRelations(dRevBatch, '@I1@').siblings.length, 1);

  // Half-sibling via halfParentId -> half: true
  const parentIds = getRelations(dRevBatch, '@I1@').parents.map(p => p.id);
  const withHalfSib = applyPersonUpdatesToGedcom(revBatch.raw, '@I1@', {
    relatives: [{ relation: 'brother', givenName: 'עומר', surname: 'כהן', halfParentId: parentIds[0] }],
  });
  const dHalf = parseGedcom(withHalfSib);
  assert.equal(dHalf.stats.families, 2);
  const sibList = getRelations(dHalf, '@I1@').siblings;
  const omer = sibList.find(s => s.given === 'עומר');
  const dana = sibList.find(s => s.given === 'דנה');
  assert.equal(omer?.half, true);
  assert.equal(dana?.half, false);
});

// ============================================================================
// 5. COMPLEX REAL-WORLD, EDGE FORMATS, ALIASES & NAME SPLITTING
// ============================================================================

test('complex multi-generation combined AI update + findRelationshipPath + zero warnings', async () => {
  const store = { anafim_gemini_api_key: 'AIzaTestKey' };
  const origWindow = globalThis.window;
  const origFetch = globalThis.fetch;
  globalThis.window = {
    localStorage: {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              occupation: 'שעון',
              relatives: [
                { relation: 'אבא', givenName: 'שמואל', surname: 'כהן', birthDate: '1920' },
                { relation: 'אמא', givenName: 'חיה', surname: 'כהן', birthDate: '1923' },
                { relation: 'אחות', givenName: 'בלהה', surname: 'כהן', birthDate: '1954' },
                { relation: 'אישה', givenName: 'טובה', surname: 'לוי', marriageDate: 'תשל"ה', marriagePlace: 'חיפה' },
                { relation: 'בן', givenName: 'ארז', surname: 'כהן', birthDate: 'תשל"ו', otherParentName: 'טובה' },
                { relation: 'בת', givenName: 'תמר', surname: 'כהן', birthDate: '1980', otherParentName: 'טובה' },
              ],
            }),
          }],
        },
      }],
    }),
  });

  try {
    const startData = parseGedcom(baseSinglePersonGed());
    const result = await analyzePersonTextWithAi(
      startData.people['@I1@'],
      'היה שעון, אביו שמואל ואמו חיה, אחותו בלהה, התחתן עם טובה לוי בתשל"ה בחיפה ונולד בנו ארז בתשל"ו',
      { data: startData },
    );
    assert.equal(result.valid, true);
    const updated = applyPersonUpdatesToGedcom(baseSinglePersonGed(), '@I1@', result.sanitized);
    const d = parseGedcom(updated);
    assert.equal(d.warnings.length, 0);
    assert.equal(d.stats.people, 7);
    assert.equal(d.stats.families, 2);
    assert.equal(d.stats.generations, 3);
    assert.equal(d.people['@I1@'].occupation, 'שעון');
    const rels = getRelations(d, '@I1@');
    assert.equal(rels.parents.length, 2);
    assert.equal(rels.siblings.length, 1);
    assert.equal(rels.partners.length, 1);
    assert.equal(rels.children.length, 2);
    assert.equal(rels.partners[0].family.marriage?.date, '1975');
    const path = findRelationshipPath(d, rels.parents[0].id, rels.children[0].id);
    assert.equal(path.length, 3);
  } finally {
    globalThis.fetch = origFetch;
    globalThis.window = origWindow;
  }
});

test('non-contiguous xrefs, non-numeric xrefs, CRLF preservation, missing TRLR, Hebrew/English aliases, name splitting', () => {
  const crlfGed = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '1 CHAR UTF-8',
    '0 @I99@ INDI',
    '1 NAME משה /רז/',
    '1 SEX M',
    '0 @A@ INDI',
    '1 NAME שרה /רז/',
    '1 SEX F',
    '0 @F10@ FAM',
    '1 HUSB @I99@',
    '1 WIFE @A@',
  ].join('\r\n'); // Also missing 0 TRLR!

  assert.equal(allocateNextXref(crlfGed, 'I'), '@I100@');
  assert.equal(allocateNextXref(crlfGed, 'F'), '@F11@');

  const val = validatePersonUpdates({
    relatives: [
      { relation: 'בת', name: 'נועה /רז/', birthDate: '2001', occupation: 'רופאה', notes: ['הערה ראשונה'] },
      { relation: 'mother', name: 'גילה רז' },
    ],
  }, {}, { rawGedcom: crlfGed, personId: '@I99@' });
  assert.equal(val.valid, true);
  assert.equal(val.sanitized.relatives[0].relation, 'daughter');
  assert.equal(val.sanitized.relatives[0].givenName, 'נועה');
  assert.equal(val.sanitized.relatives[0].surname, 'רז');
  assert.equal(val.sanitized.relatives[1].givenName, 'גילה');
  assert.equal(val.sanitized.relatives[1].surname, 'רז');

  const updated = applyPersonUpdatesToGedcom(crlfGed, '@I99@', val.sanitized);
  assert.ok(updated.includes('\r\n'));
  assert.ok(!updated.includes('\r\n\r\n'));
  assert.ok(updated.includes('@I100@'));
  assert.ok(updated.includes('@F11@'));
  const d = parseGedcom(updated);
  assert.equal(d.warnings.length, 0);
  assert.equal(d.stats.people, 4);

  // Relation alias helpers
  assert.equal(normalizeRelationType('אבא'), 'father');
  assert.equal(normalizeRelationType('אישה'), 'wife');
  assert.equal(normalizeRelationType('בן זוג'), 'spouse');
  assert.equal(normalizeRelationType('אח/ות'), 'sibling');
  assert.equal(inferSexFromRelation('mother'), 'F');
  assert.equal(inferSexFromRelation('son'), 'M');
  assert.equal(inferSexFromRelation('spouse'), 'U');
  assert.equal(relationCategory('daughter'), 'child');
});

// ============================================================================
// 6. VALIDATION & SAFETY TESTS
// ============================================================================

test('validation rejects self-links, ancestor/descendant cycles, non-existent refs, invalid enum values, and empty names', () => {
  const familyTreeGed = wrap(`0 @I1@ INDI
1 NAME סבא /כהן/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME אבא /כהן/
1 SEX M
1 FAMC @F1@
1 FAMS @F2@
0 @I3@ INDI
1 NAME נכד /כהן/
1 SEX M
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I3@`);
  const data = parseGedcom(familyTreeGed);

  // Self-link across all 4 categories
  for (const rel of ['father', 'wife', 'son', 'brother']) {
    const r = validatePersonUpdates({ relatives: [{ relation: rel, existingPersonId: '@I2@' }] }, {}, { data, personId: '@I2@' });
    assert.equal(r.valid, false, `Self-link as ${rel} must fail`);
  }

  // Ancestor/descendant cycles (direct and multi-hop)
  const parentCycle = validatePersonUpdates({ relatives: [{ relation: 'father', existingPersonId: '@I3@' }] }, {}, { data, personId: '@I1@' });
  assert.equal(parentCycle.valid, false);
  assert.ok(parentCycle.errors.some(e => e.includes('מעגלי')));

  const childCycle = validatePersonUpdates({ relatives: [{ relation: 'son', existingPersonId: '@I1@' }] }, {}, { data, personId: '@I3@' });
  assert.equal(childCycle.valid, false);
  assert.ok(childCycle.errors.some(e => e.includes('מעגלי')));

  // Non-existent references
  for (const field of ['existingPersonId', 'otherParentId', 'halfParentId']) {
    const res = validatePersonUpdates({
      relatives: [{ relation: 'child', givenName: 'טסט', [field]: '@I999@' }],
    }, {}, { data, personId: '@I2@' });
    assert.equal(res.valid, false, `Missing ${field} must fail`);
  }
  const missingFam = validatePersonUpdates({
    relatives: [{ relation: 'child', givenName: 'טסט', targetFamilyId: '@F999@' }],
  }, {}, { data, personId: '@I2@' });
  assert.equal(missingFam.valid, false);

  // Invalid relation, pedigree, sex, empty name
  assert.equal(validatePersonUpdates({ relatives: [{ relation: 'cousin', givenName: 'א' }] }).valid, false);
  assert.equal(validatePersonUpdates({ relatives: [{ relation: 'child', givenName: 'א', pedigree: 'magic' }] }).valid, false);
  assert.equal(validatePersonUpdates({ relatives: [{ relation: 'child', givenName: 'א', sex: 'X' }] }).valid, false);
  assert.equal(validatePersonUpdates({ relatives: [{ relation: 'child' }] }).valid, false);
});

// ============================================================================
// 7. ALL GEDCOM TAGS ROUND-TRIP PARSING & WRITING TESTS
// ============================================================================

test('all GEDCOM 5.5 / 5.5.1 / 7.0 INDI events, attributes, name parts, contacts, associations, and FAM events parse cleanly', () => {
  const indiEventLines = Object.keys(INDI_EVENT_TAGS)
    .filter(t => t !== 'EVEN')
    .map((tag, i) => `1 ${tag}\n2 DATE ${1900 + i}\n2 PLAC עיר ${tag}\n2 AGNC סוכנות ${tag}\n2 RELI דת ${tag}${tag === 'DEAT' ? '\n2 CAUS סיבה' : ''}`)
    .join('\n');

  const indiAttrLines = Object.keys(INDI_ATTRIBUTE_TAGS)
    .filter(t => !['RESI', 'FACT', 'OCCU'].includes(t))
    .map(tag => `1 ${tag} ערך-${tag}`)
    .join('\n');

  const indiContactLines = Object.keys(INDI_CONTACT_AND_META_TAGS)
    .filter(t => !['ADDR', 'ASSO', 'NO'].includes(t))
    .map(tag => `1 ${tag} מידע-${tag}`)
    .join('\n');

  const famEventLines = Object.keys(FAM_EVENT_TAGS)
    .filter(t => !['EVEN', 'FACT', 'NO'].includes(t))
    .map((tag, i) => `1 ${tag}\n2 DATE ${1970 + i}\n2 PLAC מקום-${tag}`)
    .join('\n');

  const fullGed = wrap(`0 @I1@ INDI
1 NAME ד״ר יצחק ואן /לוי/ ג׳וניור
2 NPFX ד״ר
2 GIVN יצחק
2 NICK איציק
2 SPFX ואן
2 SURN לוי
2 NSFX ג׳וניור
2 ROMN Yitzhak van Levi
${indiEventLines}
1 EVEN אירוע מיוחד
2 TYPE כנס
2 DATE 15 MAY 1985
3 TIME 14:30
2 PLAC ירושלים
3 MAP
4 LATI N31.7683
4 LONG E35.2137
2 AGNC מוסד
${indiAttrLines}
1 FACT עובדה חשובה
2 TYPE תרומה
1 RESI
2 DATE 1990
2 PLAC חיפה
2 ADDR רחוב הרצל 1
3 CITY חיפה
3 CTRY ישראל
1 OCCU מהנדס
1 ADDR
2 ADR1 סמטת השקד 5
2 CITY תל אביב
2 POST 61000
2 CTRY ישראל
${indiContactLines}
1 ASSO @I2@
2 RELA סנדק
1 NO CHR
1 _YART כ׳ באייר
1 _MILT_CUSTOM
2 DATE 1973
2 PLAC רמת הגולן
1 FAMS @F1@
0 @I2@ INDI
1 NAME אברהם /לוי/
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
${famEventLines}
1 EVEN חגיגה משפחתית
2 TYPE איחוד משפחתי
2 DATE 2000
1 FACT פרט משפחתי
2 TYPE מסורת
1 NO DIV`);

  const d = parseGedcom(fullGed);
  assert.equal(d.warnings.length, 0);
  const p = d.people['@I1@'];
  assert.equal(p.nickname, 'איציק');
  assert.equal(p.namePrefix, 'ד״ר');
  assert.equal(p.surnamePrefix, 'ואן');
  assert.equal(p.nameSuffix, 'ג׳וניור');
  assert.ok(p.transliterations.includes('Yitzhak van Levi'));
  assert.ok(p.search.includes('איציק'));

  for (const tag of Object.keys(INDI_EVENT_TAGS)) {
    assert.ok(p.events.some(e => e.type === tag), `Missing parsed INDI event ${tag}`);
  }
  const customTimed = p.events.find(e => e.type === '_MILT_CUSTOM');
  assert.equal(customTimed?.date, '1973');
  const even = p.events.find(e => e.type === 'EVEN');
  assert.equal(even?.time, '14:30');
  assert.deepEqual(even?.coordinates, { lat: 'N31.7683', lng: 'E35.2137' });
  assert.equal(even?.agency, 'מוסד');

  for (const tag of Object.keys(INDI_ATTRIBUTE_TAGS)) {
    if (['RESI', 'OCCU'].includes(tag)) continue;
    assert.ok(p.attributes.some(a => a.type === tag), `Missing parsed INDI attribute ${tag}`);
  }
  for (const tag of Object.keys(INDI_CONTACT_AND_META_TAGS)) {
    if (tag === 'ASSO') continue;
    assert.ok(p.attributes.some(a => a.type === tag), `Missing parsed INDI contact/meta ${tag}`);
  }
  const addrAttr = p.attributes.find(a => a.type === 'ADDR');
  assert.ok(addrAttr?.value.includes('סמטת השקד 5'));
  assert.ok(addrAttr?.value.includes('תל אביב'));
  assert.equal(p.associations[0].id, '@I2@');
  assert.equal(p.associations[0].role, 'סנדק');
  assert.ok(p.customTags.some(ct => ct.tag === '_YART' && ct.value === 'כ׳ באייר'));

  const fam = d.families['@F1@'];
  assert.ok(fam.marriage);
  assert.ok(fam.divorce);
  for (const tag of Object.keys(FAM_EVENT_TAGS)) {
    if (['MARR', 'DIV'].includes(tag)) continue;
    assert.ok(fam.events.some(e => e.type === tag), `Missing parsed FAM event ${tag}`);
  }
  const info = personInformation(d, p);
  assert.ok(info.events.length > 35);
  assert.ok(eventTitle({ type: 'PROB' }).includes('צוואה'));
  assert.ok(eventTitle({ type: '_CUSTOM' }) === 'CUSTOM');
});

test('public fixture TGC55CLF.ged parses BARM, BASM, PROB, WILL, CAST, NCHI cleanly', async () => {
  const bytes = await fs.readFile(new URL('./fixtures/public/TGC55CLF.ged', import.meta.url));
  const decoded = decodeGedcom(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const d = parseGedcom(decoded.text);
  const allEventTypes = new Set(Object.values(d.people).flatMap(p => p.events.map(e => e.type)));
  const allAttrTypes = new Set(Object.values(d.people).flatMap(p => p.attributes.map(a => a.type)));
  for (const tag of ['BARM', 'BASM', 'PROB', 'WILL']) {
    assert.ok(allEventTypes.has(tag), `Expected ${tag} in TGC55CLF.ged`);
  }
  for (const tag of ['CAST', 'NCHI']) {
    assert.ok(allAttrTypes.has(tag), `Expected ${tag} in TGC55CLF.ged`);
  }
});

test('editor writes all scalar GEDCOM fields, structured events/attributes/familyEvents/customTags, and preserves 2 SOUR / 3 DATE', () => {
  const withCitation = wrap(`0 @I1@ INDI
1 NAME דוד /כהן/
1 SEX M
1 BIRT
2 DATE 1950
2 SOUR @S1@
3 DATE 2022
3 PAGE עמוד 5
1 FAMS @F1@
0 @I2@ INDI
1 NAME שרה /כהן/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`.replace(/\n0 TRLR$/, ''));

  const payload = {
    namePrefix: 'הרב',
    surnamePrefix: 'בר',
    nameSuffix: 'שליט״א',
    birthSurname: 'לוי',
    marriedSurname: 'כהן',
    christeningDate: '1950',
    christeningPlace: 'לונדון',
    militaryDate: '1968',
    militaryPlace: 'צה״ל',
    circumcisionDate: '18 MAY 1950',
    circumcisionPlace: 'תל אביב',
    caste: 'כהן',
    property: 'בית ברחוב הרצל',
    ssn: '123-45-6789',
    childrenCount: '4',
    marriageCount: '1',
    phone: '050-1234567',
    email: 'david@example.com',
    website: 'https://example.com',
    fax: '03-7654321',
    address: 'רחוב הרצל 10\nתל אביב',
    referenceNumber: 'REF-42',
    uid: 'uuid-1234',
    externalId: 'EX-99',
    afn: 'AFN-7',
    rfn: 'RFN-8',
    restriction: 'privacy',
    alias: 'דודי',
    birthDate: '10 MAY 1950',
    events: [
      { tag: 'RESI', date: '1970', place: 'ירושלים' },
      { tag: 'RESI', date: '1985', place: 'חיפה' },
      { tag: 'ORDN', date: '1975', place: 'ירושלים', agency: 'הרבנות הראשית' },
      { tag: 'EVEN', type: 'עלייה לתורה', date: '1963', place: 'תל אביב', note: 'אירוע מרגש' },
    ],
    attributes: [
      { tag: 'FACT', type: 'שפות', value: 'עברית, אנגלית', date: '1990' },
    ],
    familyEvents: [
      { tag: 'ENGA', date: '1974', place: 'חיפה' },
      { tag: 'MARR', date: '1975', place: 'תל אביב' },
    ],
    customTags: [
      { tag: '_HEB_NOTE', value: 'תיעוד פנימי' },
    ],
  };

  const val = validatePersonUpdates(payload, {}, { rawGedcom: withCitation, personId: '@I1@' });
  assert.equal(val.valid, true);
  const updated = applyPersonUpdatesToGedcom(withCitation, '@I1@', val.sanitized);

  // Level-3 citation date under 2 SOUR must stay intact!
  assert.ok(updated.includes('2 DATE 10 MAY 1950'));
  assert.ok(updated.includes('2 SOUR @S1@\n3 DATE 2022\n3 PAGE עמוד 5'));
  assert.equal(isValidGedcomTagName('_CUSTOM_1'), true);
  assert.equal(isValidGedcomTagName('INDI'), false);

  const d = parseGedcom(updated);
  assert.equal(d.warnings.length, 0);
  const p = d.people['@I1@'];
  assert.equal(p.namePrefix, 'הרב');
  assert.equal(p.surnamePrefix, 'בר');
  assert.equal(p.nameSuffix, 'שליט״א');
  assert.equal(p.birthSurname, 'לוי');
  assert.equal(p.marriedSurname, 'כהן');
  assert.equal(p.events.filter(e => e.type === 'RESI').length, 2);
  assert.equal(p.events.find(e => e.type === '_MILT')?.date, '1968');
  assert.equal(p.events.find(e => e.type === 'CIRC')?.date, '18 MAY 1950');
  assert.equal(p.events.find(e => e.type === 'ORDN')?.agency, 'הרבנות הראשית');
  assert.equal(p.attributes.find(a => a.type === 'EMAIL')?.value, 'david@example.com');
  assert.ok(p.attributes.find(a => a.type === 'ADDR')?.value.includes('רחוב הרצל 10\nתל אביב'));
  assert.equal(p.attributes.find(a => a.type === 'FACT')?.label, 'שפות');
  assert.equal(p.customTags.find(c => c.tag === '_HEB_NOTE')?.value, 'תיעוד פנימי');
  assert.equal(d.families['@F1@'].marriage?.date, '1975');
  assert.equal(d.families['@F1@'].events.find(e => e.type === 'ENGA')?.date, '1974');
});

// ============================================================================
// 8. AI CONFIGURATION PERSISTENCE & DEFAULT BEHAVIOR TESTS
// ============================================================================

test('AI configured state makes AI editing the default and hides settings after first setup', () => {
  const store = {};
  const origWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
  };

  try {
    // 1. Fresh state (unconfigured)
    assert.equal(hasConfiguredAi(), false);
    assert.equal(getDefaultEditMode(), 'manual');
    assert.equal(shouldShowAiSettingsByDefault(), true);

    // 2. Configuring OpenRouter API key
    setOpenRouterApiKey('sk-or-v1-abc');
    assert.equal(hasConfiguredAi(), true);
    assert.equal(getDefaultEditMode(), 'ai');
    assert.equal(shouldShowAiSettingsByDefault(), false);

    // 3. Adding Gemini key, then removing OpenRouter while Gemini remains -> stays configured
    setGeminiApiKey('AIza123');
    removeOpenRouterApiKey();
    assert.equal(hasConfiguredAi(), true);
    assert.equal(getDefaultEditMode(), 'ai');
    assert.equal(shouldShowAiSettingsByDefault(), false);

    // 4. Removing last cloud key resets to unconfigured
    removeGeminiApiKey();
    assert.equal(hasConfiguredAi(), false);
    assert.equal(getDefaultEditMode(), 'manual');
    assert.equal(shouldShowAiSettingsByDefault(), true);

    // 5. Confirming local AI persists default AI mode & hidden settings
    markAiConfigured('local');
    assert.equal(hasConfiguredAi(), true);
    assert.equal(getDefaultEditMode(), 'ai');
    assert.equal(shouldShowAiSettingsByDefault(), false);

    clearAiConfiguration();
    assert.equal(hasConfiguredAi(), false);
  } finally {
    globalThis.window = origWindow;
  }
});

test('buildPrompt includes immediate family context and cleanAiUpdates handles structured arrays safely', () => {
  const d = parseGedcom(coupleGed());
  const prompt = buildPrompt(d.people['@I1@'], 'נולד להם בן בשם רון', { data: d });
  assert.ok(prompt.includes('שרה כהן'));
  assert.ok(prompt.includes('"relatives"'));
  assert.ok(prompt.includes('"familyEvents"'));
  assert.ok(prompt.includes('"events"'));
  assert.ok(prompt.includes('"attributes"'));

  const { cleaned, dropped } = cleanAiUpdates({
    name: 'should drop on root',
    occupation: '',
    facts: [{ tag: 'FACT', value: 'דובר עברית' }, { tag: '', value: '' }],
    addRelatives: [{ relation: 'son', givenName: 'רון', birthPlace: '' }],
  });
  assert.ok(!('name' in cleaned));
  assert.ok(dropped.includes('name'));
  assert.deepEqual(cleaned.attributes, [{ tag: 'FACT', value: 'דובר עברית' }]);
  assert.deepEqual(cleaned.relatives, [{ relation: 'son', givenName: 'רון' }]);
});

// ============================================================================
// 9. REGRESSION TESTS (EVENT CLEARING & SIBLING / BATCH CYCLES)
// ============================================================================

test('clearing scalar event subtags removes PLAC cleanly, drops citation-free DEAT, and preserves SOUR events', () => {
  const gedWithEvents = wrap(`0 @I1@ INDI
1 NAME משה /כהן/
1 SEX M
1 BIRT
2 DATE 10 MAY 1950
2 PLAC תל אביב
2 SOUR @S1@
3 DATE 2020
1 DEAT
2 DATE 1995
2 PLAC חיפה`);

  // 1. Clear only birthPlace: keeps DATE and SOUR on BIRT
  const clearedPlace = applyPersonUpdatesToGedcom(gedWithEvents, '@I1@', {
    birthPlace: '',
  });
  const d1 = parseGedcom(clearedPlace);
  assert.equal(d1.warnings.length, 0);
  assert.equal(d1.people['@I1@'].birth?.date, '10 MAY 1950');
  assert.equal(d1.people['@I1@'].birth?.place, '');
  assert.ok(clearedPlace.includes('2 SOUR @S1@\n3 DATE 2020'));

  // 2. Clear all subtags of citation-free DEAT -> removes 1 DEAT node completely; clearing BIRT subtags keeps 1 BIRT because of 2 SOUR
  const clearedEvents = applyPersonUpdatesToGedcom(clearedPlace, '@I1@', {
    birthDate: '',
    deathDate: '',
    deathPlace: '',
  });
  assert.ok(!/(?:^|\n)1 DEAT\b/.test(clearedEvents), 'Empty citation-free DEAT should be removed');
  assert.ok(clearedEvents.includes('1 BIRT\n2 SOUR @S1@'), 'BIRT with citation must remain intact');
});

test('sibling cycle guard rejects linking ancestor/descendant and batch parent+child cycle fails', () => {
  const lineageGed = wrap(`0 @I1@ INDI
1 NAME סבא /כהן/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME אבא /כהן/
1 SEX M
1 FAMC @F1@
1 FAMS @F2@
0 @I3@ INDI
1 NAME נכד /כהן/
1 SEX M
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I3@`);
  const data = parseGedcom(lineageGed);

  // Ancestor (@I1@) cannot be linked as sibling of @I3@
  const ancAsSib = validatePersonUpdates(
    { relatives: [{ relation: 'brother', existingPersonId: '@I1@' }] },
    {},
    { data, personId: '@I3@' },
  );
  assert.equal(ancAsSib.valid, false);
  assert.ok(ancAsSib.errors.some(e => e.includes('מעגלי')));
  assert.throws(
    () => applyPersonUpdatesWithReport(lineageGed, '@I3@', {
      relatives: [{ relation: 'brother', existingPersonId: '@I1@' }],
    }),
    /מעגלי/,
  );

  // Descendant (@I3@) cannot be linked as sibling of @I1@
  const descAsSib = validatePersonUpdates(
    { relatives: [{ relation: 'brother', existingPersonId: '@I3@' }] },
    {},
    { data, personId: '@I1@' },
  );
  assert.equal(descAsSib.valid, false);
  assert.ok(descAsSib.errors.some(e => e.includes('מעגלי')));
  assert.throws(
    () => applyPersonUpdatesWithReport(lineageGed, '@I1@', {
      relatives: [{ relation: 'brother', existingPersonId: '@I3@' }],
    }),
    /מעגלי/,
  );

  // Same existing person added as both parent and child in one batch fails
  const twoUnrelated = wrap(`0 @I1@ INDI
1 NAME ראובן /לוי/
1 SEX M
0 @I2@ INDI
1 NAME שמעון /לוי/
1 SEX M`);
  assert.throws(
    () => applyPersonUpdatesWithReport(twoUnrelated, '@I1@', {
      relatives: [
        { relation: 'father', existingPersonId: '@I2@' },
        { relation: 'son', existingPersonId: '@I2@' },
      ],
    }),
    /מעגלי/,
  );
});
