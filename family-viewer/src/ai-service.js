/**
 * AI Service for GEDCOM editing.
 * Supports Google Gemini API (optimal for Mobile/Safari/Firefox),
 * Chrome Prompt API (window.ai), and local browser model (Transformers.js ONNX/WASM).
 */

import { validatePersonUpdates, formatToGedcomDate, cleanAiUpdates } from './gedcom-ai-editor.js';
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

/**
 * Builds the genealogy-expert prompt instructing the AI to output only valid JSON.
 */
export function buildPrompt(person, freeText) {
  const currentInfo = {
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
   - "description": string (תיאור פיזי, DSCR)
   - "idNumber": string (מספר תעודת זהות / זיהוי רשמי, IDNO)
   - "notes": array of strings (e.g. ["עלה לארץ ב-1948"])
   - "source": string (מקור המידע, e.g. "ספר זיכרון משפחתי" or "עדות של דוד משה")

Current person data in tree:
${JSON.stringify(currentInfo, null, 2)}

User's input text to apply:
"${String(freeText || '').trim()}"

Return ONLY the JSON object with the updated fields.`;
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
  console.log(`[AI Editor] Raw response received (${usedProvider}):\n`, rawResponse);

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
    console.warn('[AI Editor] JSON parse failure:', parseError, 'Raw text:', jsonString);
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

  console.log('[AI Editor] Parsed JSON from AI:', parsedJson);

  const { cleaned, dropped } = cleanAiUpdates(parsedJson);
  if (dropped.length) console.warn('[AI Editor] Ignored empty/unknown fields:', dropped);
  parsedJson = cleaned;

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
    notes: person.notes,
  });

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
    parsedJson,
    provider: usedProvider,
  };
}
