/**
 * AI Service for GEDCOM editing.
 * Supports Google Gemini API (optimal for Mobile/Safari/Firefox),
 * Chrome Prompt API (window.ai), and local browser model (Transformers.js ONNX/WASM).
 */

import {
  validatePersonUpdates,
  formatToGedcomDate,
  cleanAiUpdates,
  extractHebrewDateHints,
} from './gedcom-ai-editor.js';
import { isLocalAiAvailable, promptLocalAi, getLocalAiProgress } from './local-ai-provider.js';
import { isOllamaAvailable, promptOllama, getOllamaModel } from './ollama-ai-provider.js';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  isGeminiAvailable,
  testGeminiApiKey,
  promptGemini,
} from './gemini-ai-provider.js';

export {
  getLocalAiProgress,
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  isGeminiAvailable,
  testGeminiApiKey,
  promptGemini,
};

/**
 * Checks if window.ai or equivalent Chrome Built-in AI interface is available.
 */
export async function isWindowAiAvailable() {
  if (typeof window === 'undefined') return false;

  try {
    if (window.ai?.languageModel) {
      if (typeof window.ai.languageModel.capabilities === 'function') {
        const capabilities = await window.ai.languageModel.capabilities();
        return capabilities?.available !== 'no';
      }
      return true;
    }
    if (window.model) return true;
    if (typeof window.ai?.createTextSession === 'function') return true;
    if (typeof window.ai?.prompt === 'function') return true;
    if (window.ai) return true;
  } catch (err) {
    console.warn('Error checking window.ai capabilities:', err);
  }
  return false;
}

/**
 * Returns info on the currently active AI provider and available alternatives.
 */
export async function getActiveAiProvider() {
  if (await isOllamaAvailable()) {
    return {
      id: 'ollama',
      label: `Ollama (${getOllamaModel()})`,
      badge: 'מקומי במחשב שלך',
      isCloud: false,
      hasKey: false,
    };
  }

  const hasGemini = isGeminiAvailable();
  const hasWindowAi = await isWindowAiAvailable();
  const hasLocal = await isLocalAiAvailable();

  if (hasGemini) {
    return {
      id: 'gemini',
      label: 'Google Gemini',
      badge: 'ענן מהיר וחינמי',
      isCloud: true,
      hasKey: true,
    };
  }

  if (hasWindowAi) {
    return {
      id: 'window.ai',
      label: 'Chrome Built-in AI',
      badge: 'מקומי בדפדפן',
      isCloud: false,
      hasKey: false,
    };
  }

  return {
    id: 'local',
    label: 'מודל מקומי (Transformers.js)',
    badge: 'מקומי (WASM/WebGPU)',
    isCloud: false,
    hasKey: false,
  };
}

function extractCurrentPersonFields(person = {}) {
  const findEvent = tag => [...(person.events || [])].reverse().find(e => e.type === tag);
  const findAttr = tag => (person.attributes || []).find(a => a.type === tag)?.value || '';
  const resi = findEvent('RESI');
  const buri = findEvent('BURI');
  const immi = findEvent('IMMI');
  const emig = findEvent('EMIG');
  const natu = findEvent('NATU');
  const barm = findEvent('BARM');
  const basm = findEvent('BASM');
  const bapm = findEvent('BAPM');
  const grad = findEvent('GRAD');
  const reti = findEvent('RETI');
  const crem = findEvent('CREM');
  return {
    id: person.id,
    givenName: person.given || '',
    surname: person.surname || '',
    name: person.name || '',
    alternateNames: person.alternateNames || [],
    sex: person.sex || 'U',
    birthDate: person.birth?.date || '',
    birthPlace: person.birth?.place || '',
    deathDate: person.death?.date || '',
    deathPlace: person.death?.place || '',
    deathCause: person.death?.cause || '',
    burialDate: buri?.date || '',
    burialPlace: buri?.place || '',
    cremationDate: crem?.date || '',
    cremationPlace: crem?.place || '',
    immigrationDate: immi?.date || '',
    immigrationPlace: immi?.place || '',
    emigrationDate: emig?.date || '',
    emigrationPlace: emig?.place || '',
    naturalizationDate: natu?.date || '',
    naturalizationPlace: natu?.place || '',
    barMitzvahDate: barm?.date || '',
    barMitzvahPlace: barm?.place || '',
    batMitzvahDate: basm?.date || '',
    batMitzvahPlace: basm?.place || '',
    baptismDate: bapm?.date || '',
    baptismPlace: bapm?.place || '',
    graduationDate: grad?.date || '',
    graduationPlace: grad?.place || '',
    retirementDate: reti?.date || '',
    retirementPlace: reti?.place || '',
    residenceDate: resi?.date || '',
    residencePlace: resi?.place || resi?.detail || '',
    occupation: person.occupation || '',
    education: findAttr('EDUC'),
    title: findAttr('TITL'),
    religion: findAttr('RELI'),
    nationality: findAttr('NATI'),
    description: findAttr('DSCR'),
    idNumber: findAttr('IDNO'),
    notes: person.notes || [],
  };
}

/**
 * Builds the genealogy-expert prompt instructing the AI to output only valid JSON.
 */
export function buildPrompt(person, freeText) {
  const fullInfo = extractCurrentPersonFields(person);
  // Keep prompt compact for small models: omit empty optional fields while always including core identity
  const coreKeys = new Set(['id', 'givenName', 'surname', 'name', 'sex', 'birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'occupation', 'notes']);
  const currentInfo = {};
  for (const [k, v] of Object.entries(fullInfo)) {
    const nonEmpty = Array.isArray(v) ? v.length > 0 : Boolean(v);
    if (coreKeys.has(k) || nonEmpty) currentInfo[k] = v;
  }

  const hebrewHints = extractHebrewDateHints(String(freeText || ''));
  const hebrewHintBlock = hebrewHints.length
    ? `\nHebrew calendar conversions for dates in the user text (use these EXACT Gregorian GEDCOM dates, do NOT guess):\n${hebrewHints.map(h => `- "${h.phrase}" => "${h.gedcom}"`).join('\n')}\n`
    : '';

  return `You are a genealogy data assistant specializing in the GEDCOM 5.5 / 5.5.1 / 7 standard.
Your task is to analyze user-provided free-text (which may be in Hebrew, English, or mixed) describing updates or new information for a SPECIFIC individual person in the family tree.

CRITICAL RULES:
1. You must ONLY update or add information for this specific person.
2. Output MUST be ONLY a single valid JSON object, with NO surrounding explanation, NO markdown formatting.
3. ONLY include fields that are NEW or CHANGED by the user's text. NEVER repeat unchanged fields from Current person data (do NOT echo givenName, surname, or sex unless the user explicitly asked to change them).
4. NEVER copy the user's sentence into "description" (which is ONLY for physical appearance like height or eye color) and do NOT duplicate structured facts into "notes".
5. Dates should be standardized GEDCOM dates (e.g., "15 MAY 1920", "1985", "OCT 1944", "ABT 1930"). If Hebrew calendar conversions are listed below, use those exact Gregorian dates.
6. Allowed JSON fields (ONLY include fields explicitly stated in the user's text):
   - "givenName": string (e.g. "אברהם")
   - "surname": string (e.g. "כהן")
   - "nickname": string (e.g. "אבי")
   - "alternateNames": array of strings (שמות חלופיים/נוספים, e.g. ["אברהם יוסף כהן", "Abe Cohen"])
   - "sex": "M" or "F" or "U"
   - "birthDate": string (e.g. "12 JAN 1910")
   - "birthPlace": string (e.g. "ירושלים, ישראל" or "Warsaw, Poland")
   - "deathDate": string (e.g. "1980")
   - "deathPlace": string
   - "deathCause": string
   - "burialDate": string (קבורה, BURI)
   - "burialPlace": string (מקום קבורה / בית עלמין)
   - "cremationDate": string (שריפת גופה, CREM)
   - "cremationPlace": string
   - "immigrationDate": string (עלייה / הגירה, IMMI)
   - "immigrationPlace": string (יעד עלייה)
   - "emigrationDate": string (הגירה החוצה, EMIG)
   - "emigrationPlace": string
   - "naturalizationDate": string (התאזרחות, NATU)
   - "naturalizationPlace": string
   - "barMitzvahDate": string (בר מצווה, BARM)
   - "barMitzvahPlace": string
   - "batMitzvahDate": string (בת מצווה, BASM)
   - "batMitzvahPlace": string
   - "baptismDate": string (טבילה, BAPM)
   - "baptismPlace": string
   - "graduationDate": string (סיום לימודים, GRAD)
   - "graduationPlace": string
   - "retirementDate": string (פרישה, RETI)
   - "retirementPlace": string
   - "occupation": string (מקצוע / עיסוק, e.g. "נגר")
   - "education": string (השכלה)
   - "residencePlace": string (מקום מגורים)
   - "residenceDate": string (תאריך מגורים)
   - "title": string (תואר, TITL, e.g. "הרב", "ד״ר", "פרופ'")
   - "religion": string (דת, RELI, e.g. "יהדות")
   - "nationality": string (לאום / אזרחות, NATI, e.g. "ישראלי")
   - "description": string (תיאור פיזי בלבד — גובה/עיניים/שיער, DSCR)
   - "idNumber": string (מספר תעודת זהות / זיהוי רשמי, IDNO)
   - "notes": array of strings (only extra biographical facts not covered above)
   - "source": string (מקור המידע, e.g. "ספר זיכרון משפחתי" or "עדות של דוד משה")

Example:
User's input text: "נולד ב-1920 בוורשה, היה נגר ונפטר בתש\"ח בירושלים"
Output: {"birthDate":"1920","birthPlace":"וורשה","occupation":"נגר","deathDate":"1948","deathPlace":"ירושלים"}

Current person data in tree:
${JSON.stringify(currentInfo, null, 2)}
${hebrewHintBlock}
User's input text to apply:
"${String(freeText || '').trim()}"

Return ONLY the minimal JSON object with the new or changed fields.`;
}

function normalizeAiText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => normalizeAiText(v)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.generated_text === 'string') return value.generated_text;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Analyzes free text using the best available AI provider and returns validated updates.
 */
export async function analyzePersonTextWithAi(
  person,
  freeText,
  { devMode = false, onProgress, provider } = {}
) {
  const prompt = buildPrompt(person, freeText);

  let rawResponse = '';
  let session = null;
  let usedProvider = provider || null;

  try {
    // 0. Ollama on this machine — preferred whenever it is running
    if (provider === 'ollama' || (!provider && (await isOllamaAvailable()))) {
      usedProvider = 'ollama';
      console.log('[AI Editor] Using local Ollama');
      rawResponse = await promptOllama(prompt);
    }
    // 1. Explicit or configured Gemini API
    else if (provider === 'gemini' || (!provider && isGeminiAvailable())) {
      usedProvider = 'gemini';
      console.log('[AI Editor] Using Gemini API provider');
      rawResponse = await promptGemini(prompt);
    }
    // 2. Explicit or available Chrome window.ai
    else if (provider === 'window.ai' || (!provider && (await isWindowAiAvailable()))) {
      usedProvider = 'window.ai';
      console.log('[AI Editor] Using Chrome window.ai Prompt API');

      if (window.ai?.languageModel?.create) {
        session = await window.ai.languageModel.create({
          systemPrompt:
            'You are an expert genealogy assistant that outputs only valid JSON conforming strictly to the requested schema.',
        });
        rawResponse = await session.prompt(prompt);
      } else if (typeof window.ai?.createTextSession === 'function') {
        session = await window.ai.createTextSession();
        rawResponse = await session.prompt(prompt);
      } else if (typeof window.ai?.prompt === 'function') {
        rawResponse = await window.ai.prompt(prompt);
      } else if (typeof window.model?.prompt === 'function') {
        rawResponse = await window.model.prompt(prompt);
      }
    }
    // 3. In-browser local model (Transformers.js ONNX WebGPU/WASM)
    else if (await isLocalAiAvailable()) {
      usedProvider = 'local';
      console.log('[AI Editor] Using local in-browser model (Transformers.js)');
      rawResponse = await promptLocalAi(prompt, { onProgress });
    } else {
      throw new Error(
        'לא נמצא ספק AI פעיל בדפדפן זה. מומלץ להזין מפתח Gemini חינמי בחלון העריכה.',
      );
    }
  } catch (err) {
    console.error(`[AI Editor] Call to ${usedProvider || 'AI'} failed:`, err);
    throw err;
  } finally {
    if (session && typeof session.destroy === 'function') {
      try {
        session.destroy();
      } catch (_) {}
    }
  }

  rawResponse = normalizeAiText(rawResponse);
  if (devMode) {
    console.log(`[AI Editor] Raw response received (${usedProvider}):\n`, rawResponse);
  }

  // Extract JSON from response
  let jsonString = rawResponse.trim();
  const jsonBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }
  }

  let parsedJson = null;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (parseError) {
    const errorMsg = 'שגיאה בפענוח JSON מתשובת ה-AI: ' + parseError.message;
    if (devMode) {
      console.warn('[AI Editor] JSON parse failure:', parseError, 'Raw text:', jsonString);
    }
    return {
      valid: false,
      errors: [errorMsg],
      sanitized: null,
      diff: {},
      rawResponse,
      parsedJson: null,
      provider: usedProvider,
    };
  }

  if (devMode) {
    console.log('[AI Editor] Parsed JSON from AI:', parsedJson);
  }

  const currentPerson = extractCurrentPersonFields(person);
  const { cleaned, dropped } = cleanAiUpdates(parsedJson, { currentPerson, freeText });
  if (devMode && dropped.length) console.warn('[AI Editor] Ignored empty/unchanged/unknown fields:', dropped);
  parsedJson = cleaned;

  // Deterministic safeguard: if the user wrote a Hebrew calendar date/year (e.g. תשי"ב -> 1952)
  // and a small model still guessed a wrong Gregorian year (e.g. 1944) not present in freeText,
  // replace that guessed date with the exact deterministic Hebrew conversion.
  const hebrewHints = extractHebrewDateHints(String(freeText || ''));
  if (hebrewHints.length && parsedJson && typeof parsedJson === 'object') {
    const dateKeys = Object.keys(parsedJson).filter(k => k.endsWith('Date') && typeof parsedJson[k] === 'string');
    const explicitYearsInText = new Set([...String(freeText).matchAll(/\b(\d{3,4})\b/g)].map(m => m[1]));
    const formattedDates = new Map(dateKeys.map(k => [k, formatToGedcomDate(parsedJson[k])]));
    const usedHints = new Set();
    for (const val of formattedDates.values()) {
      for (const h of hebrewHints) {
        if (val === h.gedcom) usedHints.add(h.gedcom);
      }
    }
    const unusedHints = hebrewHints.filter(h => !usedHints.has(h.gedcom));
    if (unusedHints.length) {
      let hintIdx = 0;
      for (const key of dateKeys) {
        if (hintIdx >= unusedHints.length) break;
        const formatted = formattedDates.get(key) || '';
        const yearMatch = formatted.match(/\b(\d{3,4})\b/);
        const year = yearMatch ? yearMatch[1] : '';
        // If this date's year was NOT explicitly typed in freeText and doesn't match any valid Hebrew hint,
        // it is almost certainly a hallucinated Hebrew->Gregorian conversion.
        if (year && !explicitYearsInText.has(year) && !usedHints.has(formatted)) {
          parsedJson[key] = unusedHints[hintIdx++].gedcom;
        }
      }
    }
  }

  const validation = validatePersonUpdates(parsedJson, currentPerson);

  if (devMode) {
    console.log('[AI Editor] Validation result:', validation.valid ? 'VALID' : 'INVALID');
    if (!validation.valid) {
      console.warn('[AI Editor] Validation errors:', validation.errors);
      console.warn('[AI Editor] Diff with errors:', validation.diff);
    } else {
      console.log('[AI Editor] Calculated diff:', validation.diff);
    }
  }

  return {
    ...validation,
    rawResponse,
    parsedJson,
    provider: usedProvider,
  };
}
