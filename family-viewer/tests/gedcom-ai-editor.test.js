import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatToGedcomDate,
  validatePersonUpdates,
  findPersonRecordRange,
  updatePersonRecord,
  applyPersonUpdatesToGedcom,
  repairTruncatedJson
} from '../src/gedcom-ai-editor.js';
import {
  buildPrompt,
  analyzePersonTextWithAi,
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  isGeminiAvailable,
  getActiveAiProvider,
  promptGemini
} from '../src/ai-service.js';
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
  assert.ok(prompt.includes('"alternateNames"'));
  assert.ok(prompt.includes('"burialDate"'));
  assert.ok(prompt.includes('"immigrationDate"'));
  assert.ok(prompt.includes('"title"'));
});


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

test('Gemini API key management in localStorage', () => {
  const store = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };

  assert.equal(isGeminiAvailable(), false);
  setGeminiApiKey('AIzaSyTest123');
  assert.equal(isGeminiAvailable(), true);
  assert.equal(getGeminiApiKey(), 'AIzaSyTest123');

  removeGeminiApiKey();
  assert.equal(isGeminiAvailable(), false);
  assert.equal(getGeminiApiKey(), '');
});

test('promptGemini successfully calls Gemini API and returns text', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedBody = null;

  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: '{"occupation": "נגר", "birthPlace": "תל אביב"}' }
              ]
            }
          }
        ]
      })
    };
  };

  let requestedHeaders = null;

  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: '{"occupation": "נגר", "birthPlace": "תל אביב"}' }
              ]
            }
          }
        ]
      })
    };
  };

  try {
    const response = await promptGemini('Test prompt', { apiKey: 'AIzaFakeKey' });
    assert.equal(requestedHeaders['x-goog-api-key'], 'AIzaFakeKey');
    assert.ok(requestedUrl.includes('gemini-3.5-flash-lite'));
    assert.equal(requestedBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(response, '{"occupation": "נגר", "birthPlace": "תל אביב"}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('validatePersonUpdates and applyPersonUpdatesToGedcom support alternateNames, events and attributes', () => {
  const current = {
    given: 'יעקב',
    surname: 'כהן',
    sex: 'M',
    alternateNames: ['יענקל כהן']
  };

  const updates = {
    alternateNames: ['יענקל כהן', 'Jack Cohen'],
    burialDate: '10 MAY 2000',
    burialPlace: 'הר הזיתים, ירושלים',
    immigrationDate: '1948',
    immigrationPlace: 'ישראל',
    title: 'הרב',
    religion: 'יהדות',
    nationality: 'ישראלי',
    idNumber: '123456789',
    description: 'גבוה עם עיניים כחולות'
  };

  const valRes = validatePersonUpdates(updates, current);
  assert.equal(valRes.valid, true);
  assert.deepEqual(valRes.sanitized.alternateNames, ['יענקל כהן', 'Jack Cohen']);
  assert.equal(valRes.sanitized.burialDate, '10 MAY 2000');
  assert.equal(valRes.sanitized.burialPlace, 'הר הזיתים, ירושלים');
  assert.equal(valRes.sanitized.immigrationDate, '1948');
  assert.equal(valRes.sanitized.immigrationPlace, 'ישראל');
  assert.equal(valRes.sanitized.title, 'הרב');
  assert.equal(valRes.sanitized.religion, 'יהדות');
  assert.equal(valRes.sanitized.nationality, 'ישראלי');
  assert.equal(valRes.sanitized.idNumber, '123456789');
  assert.equal(valRes.sanitized.description, 'גבוה עם עיניים כחולות');

  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME יעקב /כהן/
2 GIVN יעקב
2 SURN כהן
1 NAME יענקל כהן
2 TYPE aka
1 SEX M
0 TRLR`;

  const updatedGed = applyPersonUpdatesToGedcom(sampleGed, '@I1@', valRes.sanitized);

  // Check new alternate name added without duplicating existing one
  assert.ok(updatedGed.includes('1 NAME Jack Cohen\n2 TYPE aka'));
  const occ1 = (updatedGed.match(/NAME יענקל כהן/g) || []).length;
  assert.equal(occ1, 1);

  // Check event tags BURI and IMMI
  assert.ok(updatedGed.includes('1 BURI\n2 DATE 10 MAY 2000\n2 PLAC הר הזיתים, ירושלים'));
  assert.ok(updatedGed.includes('1 IMMI\n2 DATE 1948\n2 PLAC ישראל'));

  // Check attributes
  assert.ok(updatedGed.includes('1 TITL הרב'));
  assert.ok(updatedGed.includes('1 RELI יהדות'));
  assert.ok(updatedGed.includes('1 NATI ישראלי'));
  assert.ok(updatedGed.includes('1 IDNO 123456789'));
  assert.ok(updatedGed.includes('1 DSCR גבוה עם עיניים כחולות'));
});

test('analyzePersonTextWithAi prioritizes Gemini API when key is configured', async () => {
  const store = { anafim_gemini_api_key: 'AIzaGeminiKey' };
  globalThis.window = {
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };

  const originalFetch = globalThis.fetch;
  let calledGemini = false;

  globalThis.fetch = async (url) => {
    calledGemini = true;
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({ occupation: 'נגר', birthPlace: 'חיפה' }) }
              ]
            }
          }
        ]
      })
    };
  };

  try {
    const person = {
      id: '@I2@',
      given: 'משה',
      surname: 'לוי',
      sex: 'M',
      birth: { date: '1920' }
    };

    const providerInfo = await getActiveAiProvider();
    assert.equal(providerInfo.id, 'gemini');

    const result = await analyzePersonTextWithAi(person, 'היה נגר ונולד בחיפה');
    assert.equal(calledGemini, true);
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.occupation, 'נגר');
    assert.equal(result.sanitized.birthPlace, 'חיפה');
    assert.equal(result.provider, 'gemini');
  } finally {
    globalThis.fetch = originalFetch;
    delete store.anafim_gemini_api_key;
  }
});

test('cleanAiUpdates drops empty values and unknown keys but keeps real data', async () => {
  const { cleanAiUpdates, validatePersonUpdates } = await import('../src/gedcom-ai-editor.js');
  const { cleaned, dropped } = cleanAiUpdates({
    givenName: 'צבי', surname: 'בן זמרה', name: 'צבי בן זמרה', sex: 'M',
    birthDate: '', birthPlace: '  ', notes: [], occupation: 'נגר',
  });
  assert.deepEqual(cleaned, { givenName: 'צבי', surname: 'בן זמרה', sex: 'M', occupation: 'נגר' });
  assert.deepEqual(dropped.sort(), ['birthDate', 'birthPlace', 'name', 'notes']);
  assert.equal(validatePersonUpdates(cleaned, {}).valid, true);
});

test('updating only givenName or nickname preserves surname when GIVN/SURN subtags are absent', () => {
  const sampleGed = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
1 SEX M
0 TRLR`;

  const updatedGiven = applyPersonUpdatesToGedcom(sampleGed, '@I1@', { givenName: 'משה דוד' });
  assert.ok(updatedGiven.includes('1 NAME משה דוד /כהן/'));
  assert.ok(updatedGiven.includes('2 GIVN משה דוד'));
  assert.ok(updatedGiven.includes('2 SURN כהן'));

  const updatedNick = applyPersonUpdatesToGedcom(sampleGed, '@I1@', { nickname: 'מוישי' });
  assert.ok(updatedNick.includes('1 NAME משה /כהן/'));
  assert.ok(updatedNick.includes('2 NICK מוישי'));
});

test('Hebrew calendar years and dates convert deterministically to GEDCOM Gregorian dates', async () => {
  const { parseHebrewDateToGedcom, extractHebrewDateHints } = await import('../src/gedcom-ai-editor.js');

  assert.equal(formatToGedcomDate('תשי"ב'), '1952');
  assert.equal(formatToGedcomDate('בתשי"ב'), '1952');
  assert.equal(formatToGedcomDate("ה'תשי\"ב"), '1952');
  assert.equal(formatToGedcomDate('תש"ח'), '1948');
  assert.equal(formatToGedcomDate('תרצ"ט'), '1939');
  assert.equal(formatToGedcomDate('ת"ש'), '1940');
  assert.equal(parseHebrewDateToGedcom("ה' באייר תש\"ח"), '14 MAY 1948');
  assert.equal(parseHebrewDateToGedcom('י"ז בתמוז תשי"ב'), '10 JUL 1952');
  assert.equal(parseHebrewDateToGedcom('תשרי תשי"ב'), 'OCT 1951');

  // Must NOT mistake common Hebrew acronyms for years
  assert.equal(parseHebrewDateToGedcom('ת"א'), '');
  assert.equal(parseHebrewDateToGedcom('צה"ל'), '');
  assert.equal(parseHebrewDateToGedcom('ד"ר'), '');

  const hints = extractHebrewDateHints('נולד בלבנון ב-1919 ונפטר במצרים בתשי"ב');
  assert.deepEqual(hints, [{ phrase: 'בתשי"ב', gedcom: '1952' }]);
});

test('analyzePersonTextWithAi drops unchanged fields, echoed description, and corrects hallucinated Hebrew year', async () => {
  const person = {
    id: '@I7@',
    name: 'צבי בן זמרה',
    given: 'צבי',
    surname: 'בן זמרה',
    sex: 'M',
  };

  // Simulate exact messy Qwen3-0.6B output from real mobile/desktop test
  globalThis.window = {
    location: { hostname: 'baobabprince.github.io' },
    ai: {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async () => JSON.stringify({
            givenName: 'צבי',
            surname: 'בן זמרה',
            sex: 'M',
            birthDate: '1919',
            birthPlace: 'לבנון',
            deathDate: '1944',
            deathPlace: 'מצרים',
            description: 'נולד בלבנון ב-1919 ונפטר במצרים בתשי"ב',
          }),
          destroy: () => {},
        }),
      },
    },
  };

  const result = await analyzePersonTextWithAi(person, 'נולד בלבנון ב-1919 ונפטר במצרים בתשי"ב');
  assert.equal(result.valid, true);
  assert.deepEqual(result.sanitized, {
    birthPlace: 'לבנון',
    deathPlace: 'מצרים',
    birthDate: '1919',
    deathDate: '1952',
  });
  assert.equal('givenName' in result.diff, false);
  assert.equal('surname' in result.diff, false);
  assert.equal('sex' in result.diff, false);
  assert.equal('description' in result.diff, false);
});

test('isOllamaAvailable does not probe localhost on public HTTPS hosts unless explicitly configured', async () => {
  const { isOllamaAvailable } = await import('../src/ollama-ai-provider.js');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: false };
  };
  globalThis.window = {
    location: { hostname: 'baobabprince.github.io' },
  };
  try {
    const ok = await isOllamaAvailable();
    assert.equal(ok, false);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter API key, model storage, request contract, and provider selection work cleanly', async () => {
  const {
    getOpenRouterApiKey,
    setOpenRouterApiKey,
    removeOpenRouterApiKey,
    isOpenRouterAvailable,
    getOpenRouterModel,
    setOpenRouterModel,
    promptOpenRouter,
    setPreferredCloudProvider,
  } = await import('../src/ai-service.js');

  const store = {};
  globalThis.window = {
    location: { hostname: 'baobabprince.github.io' },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };

  assert.equal(isOpenRouterAvailable(), false);
  assert.equal(getOpenRouterModel(), 'openrouter/free');
  setOpenRouterApiKey('sk-or-v1-test-key');
  setOpenRouterModel('openai/gpt-4o-mini');
  setPreferredCloudProvider('openrouter');
  assert.equal(isOpenRouterAvailable(), true);
  assert.equal(getOpenRouterApiKey(), 'sk-or-v1-test-key');
  assert.equal(getOpenRouterModel(), 'openai/gpt-4o-mini');

  const active = await getActiveAiProvider();
  assert.equal(active.id, 'openrouter');
  assert.ok(active.label.includes('openai/gpt-4o-mini'));

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    // First call simulates a model rejecting response_format: json_object -> must retry without it
    if (calls.length === 1) {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'response_format json_object is not supported' } }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '<think>reasoning</think>{"birthPlace": "חיפה", "occupation": "מהנדס"}',
            },
          },
        ],
      }),
    };
  };

  try {
    const person = { id: '@I3@', given: 'דני', surname: 'כהן', sex: 'M' };
    const result = await analyzePersonTextWithAi(person, 'נולד בחיפה והיה מהנדס');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(calls[0].headers.Authorization, 'Bearer sk-or-v1-test-key');
    assert.equal(calls[0].body.model, 'openai/gpt-4o-mini');
    assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
    assert.equal(calls[1].body.response_format, undefined);
    assert.equal(result.valid, true);
    assert.equal(result.provider, 'openrouter');
    assert.deepEqual(result.sanitized, { birthPlace: 'חיפה', occupation: 'מהנדס' });

    // Direct promptOpenRouter 402 surfaces friendly credit message
    globalThis.fetch = async () => ({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      json: async () => ({ error: { message: 'Insufficient credits' } }),
    });
    await assert.rejects(() => promptOpenRouter('test'), /402/);

    // Free model timeout during response.json() fails over ONLY to free models (never paid models)
    const freeAttemptedModels = [];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      freeAttemptedModels.push(body.model);
      if (body.model === 'openrouter/free') {
        return {
          ok: true,
          json: async () => {
            const err = new Error('signal timed out');
            err.name = 'TimeoutError';
            throw err;
          },
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"occupation":"סופר"}' } }],
        }),
      };
    };
    const freeRes = await promptOpenRouter('test', { model: 'openrouter/free' });
    assert.equal(freeRes, '{"occupation":"סופר"}');
    assert.deepEqual(freeAttemptedModels, ['openrouter/free', 'google/gemma-4-26b-a4b-it:free']);

    // When all free attempts time out during body read, throw localized Hebrew timeout error (not raw TimeoutError)
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => {
        const err = new Error('signal timed out');
        err.name = 'TimeoutError';
        throw err;
      },
    });
    await assert.rejects(() => promptOpenRouter('test', { model: 'openrouter/free' }), /ארכה יותר מדי זמן/);

    // HTTP 200 payload with embedded upstream error (common on OpenRouter) triggers failover to next free model
    let embeddedErrAttempt = 0;
    globalThis.fetch = async () => {
      embeddedErrAttempt++;
      if (embeddedErrAttempt === 1) {
        return {
          ok: true,
          json: async () => ({ error: { code: 502, message: 'Provider returned error' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"birthPlace":"צפת"}' } }] }),
      };
    };
    const embeddedRes = await promptOpenRouter('test', { model: 'openrouter/free' });
    assert.equal(embeddedRes, '{"birthPlace":"צפת"}');
    assert.equal(embeddedErrAttempt, 2);
  } finally {
    globalThis.fetch = originalFetch;
    removeOpenRouterApiKey();
    assert.equal(isOpenRouterAvailable(), false);
  }
});

test('repairTruncatedJson salvages AI responses cut off mid-generation', () => {
  // Cut off inside a notes array element (the real-world failure case)
  const cutInArray = `{
  "birthPlace": "שכונת רחביה, ירושלים",
  "residencePlace": "אלון שבות",
  "occupation": "עורך הדין",
  "religion": "יהדות",
  "notes": [
    "תושב אלון שבות, נשוי ואב לארבעה",
    "למד בישיבה התיכונית נתיב מאיר שבירושלים, ובשנת תשמ`;
  const repaired = repairTruncatedJson(cutInArray);
  assert.ok(repaired);
  assert.equal(repaired.birthPlace, 'שכונת רחביה, ירושלים');
  assert.equal(repaired.residencePlace, 'אלון שבות');
  assert.equal(repaired.occupation, 'עורך הדין');
  assert.equal(repaired.religion, 'יהדות');
  assert.deepEqual(repaired.notes, ['תושב אלון שבות, נשוי ואב לארבעה']);

  // Cut off mid string of an object value: the incomplete field is dropped
  assert.deepEqual(repairTruncatedJson('{"birthPlace":"ירושלים","occupation":"נ'), {
    birthPlace: 'ירושלים',
  });

  // Cut off right after a comma: last complete element kept
  assert.deepEqual(repairTruncatedJson('{"birthDate":"1920","birthPlace":'), { birthDate: '1920' });

  // Cut off right after a complete value with no separator
  assert.deepEqual(repairTruncatedJson('{"birthDate":"1920"'), { birthDate: '1920' });

  // Cut off inside nested structures: complete nested elements are kept
  assert.deepEqual(repairTruncatedJson('{"notes":["a",["b","c'), { notes: ['a', ['b']] });

  // Cut off inside the very first value: container closes empty
  assert.deepEqual(repairTruncatedJson('{"occupation":"עור'), {});

  // Escaped quotes inside strings must not break string tracking
  assert.deepEqual(repairTruncatedJson('{"description":"قال \\"שלום\\", ועוד'), {});

  // Complete text or unrepairable garbage: no repair attempted
  assert.equal(repairTruncatedJson('{"a":1}'), null);
  assert.equal(repairTruncatedJson('{"a":}'), null);
  assert.equal(repairTruncatedJson('just plain text'), null);
  assert.equal(repairTruncatedJson(''), null);
});

test('OpenRouter retries a truncated response with a larger output budget before failover', async () => {
  const { promptOpenRouter, setOpenRouterApiKey, removeOpenRouterApiKey } = await import(
    '../src/ai-service.js'
  );

  const store = {};
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = {
    location: { hostname: 'baobabprince.github.io' },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
  setOpenRouterApiKey('sk-or-v1-test-key');

  const attempts = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    attempts.push(body.max_tokens);
    if (attempts.length === 1) {
      // Model hit its output token limit mid-generation
      return {
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'length', message: { content: '{"occupation":"נ' } }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: '{"occupation":"נגר"}' } }],
      }),
    };
  };

  try {
    const res = await promptOpenRouter('test', { model: 'openai/gpt-4o-mini' });
    assert.equal(res, '{"occupation":"נגר"}');
    assert.equal(attempts.length, 2, 'should retry the same model once');
    assert.equal(attempts[0], 1400, 'first attempt uses default budget');
    assert.equal(attempts[1], 3200, 'retry uses the larger output budget');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    removeOpenRouterApiKey();
  }
});
