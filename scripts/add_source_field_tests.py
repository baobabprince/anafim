#!/usr/bin/env python3
"""Add tests for the source (מקור) field in gedcom-ai-editor.test.js"""
from pathlib import Path

path = Path("family-viewer/tests/gedcom-ai-editor.test.js")
text = path.read_text(encoding="utf-8")

if "source field is accepted" in text or "מקור:" in text and "validatePersonUpdates" in text and "source" in text:
    # rough check if already added
    if "source field is accepted and applied as NOTE" in text:
        print("Tests for source already present")
        raise SystemExit(0)

marker = "test('analyzePersonTextWithAi works with mock window.ai and logs diff', async () => {"
if marker not in text:
    raise SystemExit("ERROR: could not find analyzePersonTextWithAi test marker")

new_tests = r'''
test('source field is accepted and applied as NOTE on the target person only', () => {
  const current = { givenName: 'יוסף', surname: 'לוין', sex: 'M' };

  // Validation accepts source
  const validRes = validatePersonUpdates({
    source: 'ספר זיכרון משפחת לוין',
    birthPlace: 'וורשה'
  }, current);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.sanitized.source, 'ספר זיכרון משפחת לוין');
  assert.equal(validRes.sanitized.birthPlace, 'וורשה');

  // source alone is enough for a valid update
  const sourceOnly = validatePersonUpdates({ source: 'עדות משפחתית' }, current);
  assert.equal(sourceOnly.valid, true);
  assert.equal(sourceOnly.sanitized.source, 'עדות משפחתית');

  // Apply to GEDCOM – only the target INDI gets the NOTE
  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
2 GIVN משה
2 SURN כהן
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME שרה /כהן/
2 GIVN שרה
2 SURN כהן
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`;

  const updated = applyPersonUpdatesToGedcom(sampleGed, '@I1@', {
    source: 'ספר זיכרון משפחת כהן'
  });

  assert.ok(updated.includes('1 NOTE מקור: ספר זיכרון משפחת כהן'));
  // Person 2 unchanged – no source note on I2
  const i2Block = updated.slice(updated.indexOf('0 @I2@ INDI'), updated.indexOf('0 @F1@ FAM'));
  assert.ok(!i2Block.includes('מקור:'));
  // Family link preserved
  assert.ok(updated.includes('1 FAMS @F1@'));
});

test('source that already starts with מקור is not double-prefixed', () => {
  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
1 SEX M
0 TRLR`;

  const updated = applyPersonUpdatesToGedcom(sampleGed, '@I1@', {
    source: 'מקור: רשומת בית כנסת'
  });
  assert.ok(updated.includes('1 NOTE מקור: רשומת בית כנסת'));
  assert.ok(!updated.includes('מקור: מקור:'));
});

test('buildPrompt mentions the source field', () => {
  const person = {
    id: '@I5@',
    name: 'דוד לוי',
    given: 'דוד',
    surname: 'לוי',
    sex: 'M',
    birth: { date: '1930', place: 'חיפה' },
    notes: []
  };
  const prompt = buildPrompt(person, 'מקור המידע: ארכיון העיר');
  assert.ok(prompt.includes('"source"') || prompt.includes('source'));
  assert.ok(prompt.includes('מקור') || prompt.includes('source'));
});

'''

# Insert new tests before the last analyzePersonTextWithAi test (append before end of file is fine too)
# Append before the final analyze test by replacing the marker with new_tests + marker
text = text.replace(marker, new_tests + marker, 1)
path.write_text(text, encoding="utf-8")
print("Added source field tests")
