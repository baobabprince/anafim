import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatToGedcomDate,
  validatePersonUpdates,
  findPersonRecordRange,
  updatePersonRecord,
  applyPersonUpdatesToGedcom
} from '../src/gedcom-ai-editor.js';
import { buildPrompt, analyzePersonTextWithAi } from '../src/ai-service.js';
import { parseGedcom } from '../src/gedcom.js';

test('formatToGedcomDate correctly parses various date formats', () => {
  // Standard GEDCOM dates
  assert.equal(formatToGedcomDate('15 MAY 1920'), '15 MAY 1920');
  assert.equal(formatToGedcomDate('1985'), '1985');
  assert.equal(formatToGedcomDate('ABT 1940'), 'ABT 1940');

  // DD/MM/YYYY
  assert.equal(formatToGedcomDate('15/05/1920'), '15 MAY 1920');
  assert.equal(formatToGedcomDate('01.01.2000'), '1 JAN 2000');

  // ISO YYYY-MM-DD
  assert.equal(formatToGedcomDate('1920-05-15'), '15 MAY 1920');

  // Hebrew month names
  assert.equal(formatToGedcomDate('15 במאי 1920'), '15 MAY 1920');
  assert.equal(formatToGedcomDate('אוקטובר 1944'), 'OCT 1944');

  // English month names
  assert.equal(formatToGedcomDate('12 October 1910'), '12 OCT 1910');
});

test('validatePersonUpdates validates allowed fields and rejects invalid ones', () => {
  const current = { givenName: 'יוסף', surname: 'לוין', sex: 'M' };

  // Valid update
  const validRes = validatePersonUpdates({
    givenName: 'יוסף חיים',
    birthDate: '15/05/1920',
    birthPlace: 'וורשה, פולין',
    sex: 'M',
    notes: ['הערה חדשה']
  }, current);

  assert.equal(validRes.valid, true);
  assert.equal(validRes.errors.length, 0);
  assert.equal(validRes.sanitized.givenName, 'יוסף חיים');
  assert.equal(validRes.sanitized.birthDate, '15 MAY 1920');
  assert.equal(validRes.sanitized.birthPlace, 'וורשה, פולין');
  assert.deepEqual(validRes.sanitized.notes, ['הערה חדשה']);

  // Unknown fields rejected
  const invalidRes1 = validatePersonUpdates({
    unknownField: 'bad',
    unauthorized: 123
  }, current);
  assert.equal(invalidRes1.valid, false);
  assert.ok(invalidRes1.errors.some(e => e.includes('unknownField')));

  // Invalid sex rejected
  const invalidRes2 = validatePersonUpdates({
    sex: 'INVALID'
  }, current);
  assert.equal(invalidRes2.valid, false);
  assert.ok(invalidRes2.errors.some(e => e.includes('sex')));

  // Non-object rejected
  const invalidRes3 = validatePersonUpdates(null, current);
  assert.equal(invalidRes3.valid, false);
});

test('findPersonRecordRange and applyPersonUpdatesToGedcom update target person only and preserve tree structure', () => {
  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
2 GIVN משה
2 SURN כהן
1 SEX M
1 BIRT
2 DATE 10 JAN 1900
2 PLAC ירושלים
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
0 TRLR`;

  // Verify finding range
  const range = findPersonRecordRange(sampleGed, '@I1@');
  assert.ok(range);
  assert.ok(range.rawBlock.includes('@I1@ INDI'));
  assert.ok(!range.rawBlock.includes('@I2@ INDI'));

  // Apply updates to @I1@: death, occupation, notes
  const updatedGed = applyPersonUpdatesToGedcom(sampleGed, '@I1@', {
    givenName: 'משה אהרון',
    deathDate: '15 MAY 1980',
    deathPlace: 'תל אביב',
    deathCause: 'שיבה טובה',
    occupation: 'סופר סת"ם',
    notes: ['איש חסד וצדקה']
  });

  // Verify that @I1@ is updated
  assert.ok(updatedGed.includes('1 NAME משה אהרון /כהן/'));
  assert.ok(updatedGed.includes('2 GIVN משה אהרון'));
  assert.ok(updatedGed.includes('1 DEAT'));
  assert.ok(updatedGed.includes('2 DATE 15 MAY 1980'));
  assert.ok(updatedGed.includes('2 PLAC תל אביב'));
  assert.ok(updatedGed.includes('2 CAUS שיבה טובה'));
  assert.ok(updatedGed.includes('1 OCCU סופר סת"ם'));
  assert.ok(updatedGed.includes('1 NOTE איש חסד וצדקה'));
  assert.ok(updatedGed.includes('1 FAMS @F1@')); // Family links preserved!

  // Verify @I2@ and @F1@ are completely unchanged
  assert.ok(updatedGed.includes('0 @I2@ INDI\n1 NAME שרה /כהן/'));
  assert.ok(updatedGed.includes('0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@'));

  // Parse updated GEDCOM to ensure parseGedcom succeeds without warnings
  const parsed = parseGedcom(updatedGed);
  assert.ok(parsed.people['@I1@']);
  assert.equal(parsed.people['@I1@'].given, 'משה אהרון');
  assert.equal(parsed.people['@I1@'].death?.date, '15 MAY 1980');
  assert.equal(parsed.people['@I1@'].death?.place, 'תל אביב');
  assert.equal(parsed.people['@I1@'].death?.cause, 'שיבה טובה');
  assert.equal(parsed.people['@I1@'].occupation, 'סופר סת"ם');
  assert.ok(parsed.people['@I1@'].notes.includes('איש חסד וצדקה'));
  assert.deepEqual(parsed.people['@I1@'].spouseFamilies, ['@F1@']);
});

test('buildPrompt includes all necessary GEDCOM and schema context', () => {
  const person = {
    id: '@I5@',
    name: 'דוד לוי',
    given: 'דוד',
    surname: 'לוי',
    sex: 'M',
    birth: { date: '1930', place: 'חיפה' },
    notes: []
  };

  const prompt = buildPrompt(person, 'נפטר ב-2010 בתל אביב');
  assert.ok(prompt.includes('GEDCOM'));
  assert.ok(prompt.includes('@I5@'));
  assert.ok(prompt.includes('דוד'));
  assert.ok(prompt.includes('חיפה'));
  assert.ok(prompt.includes('נפטר ב-2010 בתל אביב'));
  assert.ok(prompt.includes('"givenName"'));
  assert.ok(prompt.includes('"deathDate"'));
});

test('analyzePersonTextWithAi works with mock window.ai and logs diff', async () => {
  const person = {
    id: '@I1@',
    given: 'אברהם',
    surname: 'שלום',
    sex: 'M',
    birth: { date: '1900' }
  };

  // Mock global window.ai
  globalThis.window = {
    ai: {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async () => JSON.stringify({
            deathDate: '1985',
            deathPlace: 'ירושלים',
            occupation: 'רופא'
          }),
          destroy: () => {}
        })
      }
    }
  };

  const result = await analyzePersonTextWithAi(person, 'נפטר בשנת 1985 בירושלים והיה רופא');
  assert.equal(result.valid, true);
  assert.equal(result.sanitized.deathDate, '1985');
  assert.equal(result.sanitized.deathPlace, 'ירושלים');
  assert.equal(result.sanitized.occupation, 'רופא');
  assert.equal(result.diff.deathDate.new, '1985');
});
