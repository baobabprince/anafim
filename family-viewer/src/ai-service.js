/**
 * AI Service for GEDCOM editing using window.ai / window.ai.languageModel / ai.languageModel
 */

import { validatePersonUpdates, formatToGedcomDate } from './gedcom-ai-editor.js';

/**
 * Checks if window.ai or equivalent browser AI interface is available.
 */
export async function isWindowAiAvailable() {
  if (typeof window === 'undefined') return false;

  try {
    // Check for Chrome Built-in Prompt API: global ai or window.ai
    const aiObj = window.ai || globalThis.ai;
    if (aiObj?.languageModel) {
      if (typeof aiObj.languageModel.capabilities === 'function') {
        const capabilities = await aiObj.languageModel.capabilities();
        return capabilities?.available !== 'no';
      }
      return true;
    }
    if (window.model) return true;
    if (typeof aiObj?.createTextSession === 'function') return true;
    if (typeof aiObj?.prompt === 'function') return true;
    if (aiObj) return true;
  } catch (err) {
    console.warn('Error checking window.ai capabilities:', err);
  }
  return false;
}

/**
 * Fallback parser used in devMode when window.ai is unavailable.
 */
export function simulateAiParsing(text) {
  const result = {};

  // Extract occupation
  const occuMatch = text.match(/(?:עבד כ|עבדה כ|מקצוע|עיסוק[:\s]+|היה |הייתה )([א-תA-Za-z\s]+?)(?:[,\.]|\s+ו|\s+שנפטר|\s+שנפטרה|$)/);
  if (occuMatch) result.occupation = occuMatch[1].trim();

  // Extract birth place & date
  const birthMatch = text.match(/(?:נולד|נולדה)\s+(?:ב-?([0-9\.\/-]+|[א-ת\s\d]+?))?(?:\s+ב-?([א-תA-Za-z\s,]+?))?(?:[,\.]|\s+ו|\s+נפטר|$)/);
  if (birthMatch) {
    if (birthMatch[1] && /\d/.test(birthMatch[1])) result.birthDate = formatToGedcomDate(birthMatch[1]);
    if (birthMatch[2] && !/\d{4}/.test(birthMatch[2])) result.birthPlace = birthMatch[2].trim();
  }

  // Extract death place & date
  const deathMatch = text.match(/(?:נפטר|נפטרה)\s+(?:ב-?שנת\s+|בשנת\s+|ב-?|שנת\s+)?([0-9\.\/-]+|[א-ת\s\d]+?)(?:\s+ב-?([א-תA-Za-z\s,]+?))?(?:[,\.]|$)/);
  if (deathMatch) {
    if (deathMatch[1] && /\d/.test(deathMatch[1])) result.deathDate = formatToGedcomDate(deathMatch[1]);
    if (deathMatch[2] && !/\d{4}/.test(deathMatch[2])) result.deathPlace = deathMatch[2].trim();
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Builds the genealogy-expert prompt instructing the AI to output only valid JSON.
 */
export function buildPrompt(person, freeText) {
  const currentInfo = {
    id: person.id,
    givenName: person.given || '',
    surname: person.surname || '',
    name: person.name || '',
    sex: person.sex || 'U',
    birthDate: person.birth?.date || '',
    birthPlace: person.birth?.place || '',
    deathDate: person.death?.date || '',
    deathPlace: person.death?.place || '',
    deathCause: person.death?.cause || '',
    occupation: person.occupation || '',
    notes: person.notes || []
  };

  return `You are a genealogy data assistant specializing in the GEDCOM 5.5 / 5.5.1 / 7 standard.
Your task is to analyze user-provided free-text (which may be in Hebrew, English, or mixed) describing updates or new information for a SPECIFIC individual person in the family tree.

CRITICAL RULES:
1. You must ONLY update or add information for this specific person.
2. Output MUST be ONLY a single valid JSON object, with NO surrounding explanation, NO markdown formatting (or within a single \`\`\`json codeblock).
3. Dates should be standardized if possible (e.g., "15 MAY 1920", "1985", "OCT 1944", "ABT 1930").
4. Allowed JSON fields (ONLY include fields that the user explicitly provided or updated):
   - "givenName": string (e.g. "אברהם")
   - "surname": string (e.g. "כהן")
   - "nickname": string (e.g. "אבי")
   - "sex": "M" or "F" or "U"
   - "birthDate": string (e.g. "12 JAN 1910")
   - "birthPlace": string (e.g. "ירושלים, ישראל" or "Warsaw, Poland")
   - "deathDate": string (e.g. "1980")
   - "deathPlace": string
   - "deathCause": string
   - "occupation": string (e.g. "נגר")
   - "education": string
   - "residencePlace": string
   - "residenceDate": string
   - "notes": array of strings (e.g. ["עלה לארץ ב-1948"])

Current person data in tree:
${JSON.stringify(currentInfo, null, 2)}

User's input text to apply:
"${freeText.trim()}"

Return ONLY the JSON object with the updated fields.`;
}

/**
 * Calls window.ai to analyze free text and returns { valid, sanitized, diff, rawResponse, errors }
 */
export async function analyzePersonTextWithAi(person, freeText, { devMode = false } = {}) {
  const prompt = buildPrompt(person, freeText);

  let rawResponse = '';
  let session = null;

  try {
    const aiObj = window.ai || globalThis.ai;
    if (aiObj?.languageModel?.create) {
      session = await aiObj.languageModel.create({
        systemPrompt: 'You are an expert genealogy assistant that outputs only valid JSON conforming strictly to the requested schema.'
      });
      rawResponse = await session.prompt(prompt);
    } else if (typeof aiObj?.createTextSession === 'function') {
      session = await aiObj.createTextSession();
      rawResponse = await session.prompt(prompt);
    } else if (typeof aiObj?.prompt === 'function') {
      rawResponse = await aiObj.prompt(prompt);
    } else if (typeof window.model?.prompt === 'function') {
      rawResponse = await window.model.prompt(prompt);
    } else if (devMode) {
      // In devMode, if browser lacks built-in AI, provide simulated heuristic parsing
      rawResponse = simulateAiParsing(freeText);
    } else {
      throw new Error('ממשק window.ai אינו זמין בדפדפן זה. בכרום ניתן להפעיל את Prompt API בדגלים chrome://flags, או להפעיל "מצב מפתח" בתיבת העריכה.');
    }
  } catch (err) {
    console.error('[AI Editor] Call to window.ai failed:', err);
    throw err;
  } finally {
    if (session && typeof session.destroy === 'function') {
      try { session.destroy(); } catch (_) {}
    }
  }

  // Log raw AI response to console
  console.log('[AI Editor] Raw response received from window.ai:\n', rawResponse);

  // Extract JSON from response
  let jsonString = rawResponse.trim();
  const jsonBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    // If there's leading/trailing text, extract from first { to last }
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
    console.warn('[AI Editor] JSON parse failure:', parseError, 'Raw text:', jsonString);
    return {
      valid: false,
      errors: [errorMsg],
      sanitized: null,
      diff: {},
      rawResponse,
      parsedJson: null
    };
  }

  console.log('[AI Editor] Parsed JSON from AI:', parsedJson);

  // Validate according to strict schema
  const validation = validatePersonUpdates(parsedJson, {
    givenName: person.given,
    surname: person.surname,
    sex: person.sex,
    birthDate: person.birth?.date,
    birthPlace: person.birth?.place,
    deathDate: person.death?.date,
    deathPlace: person.death?.place,
    deathCause: person.death?.cause,
    occupation: person.occupation,
    notes: person.notes
  });

  // Log validation result & diff
  console.log('[AI Editor] Validation result:', validation.valid ? 'VALID' : 'INVALID');
  if (!validation.valid) {
    console.warn('[AI Editor] Validation errors:', validation.errors);
    console.warn('[AI Editor] Diff with errors:', validation.diff);
  } else {
    console.log('[AI Editor] Calculated diff:', validation.diff);
  }

  return {
    ...validation,
    rawResponse,
    parsedJson
  };
}
