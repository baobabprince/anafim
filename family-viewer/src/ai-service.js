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
  repairTruncatedJson,
} from './gedcom-ai-editor.js';
import { getRelations } from './gedcom.js';
import { SCALAR_EVENT_DEFINITIONS, SCALAR_ATTRIBUTE_DEFINITIONS } from './gedcom-tags.js';
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
import {
  OPENROUTER_PRESET_MODELS,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  removeOpenRouterApiKey,
  isOpenRouterAvailable,
  getOpenRouterModel,
  setOpenRouterModel,
  testOpenRouterApiKey,
  promptOpenRouter,
} from './openrouter-ai-provider.js';

const PREFERRED_CLOUD_KEY = 'anafim_preferred_ai_provider';
const AI_CONFIGURED_KEY = 'anafim_ai_configured';

function getStorage() {
  try {
    return (
      (typeof window !== 'undefined' && window.localStorage) ||
      (typeof globalThis !== 'undefined' && globalThis.window?.localStorage) ||
      (typeof localStorage !== 'undefined' && localStorage) ||
      null
    );
  } catch {
    return null;
  }
}

export function hasConfiguredAi() {
  try {
    if (isOpenRouterAvailable() || isGeminiAvailable()) return true;
    const storage = getStorage();
    if (!storage) return false;
    const flag = (storage.getItem(AI_CONFIGURED_KEY) || '').trim();
    if (flag === '1' || flag === 'cloud' || flag === 'local') return true;
    if (storage.getItem('anafim_ollama_enabled') === '1' || Boolean((storage.getItem('anafim_ollama_url') || '').trim())) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function markAiConfigured(mode = 'cloud') {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (!mode) {
      storage.removeItem(AI_CONFIGURED_KEY);
      return;
    }
    const val = mode === true ? '1' : String(mode).trim();
    storage.setItem(AI_CONFIGURED_KEY, val || '1');
  } catch {}
}

export function clearAiConfiguration() {
  try {
    getStorage()?.removeItem(AI_CONFIGURED_KEY);
  } catch {}
}

export function getDefaultEditMode() {
  return hasConfiguredAi() ? 'ai' : 'manual';
}

export function shouldShowAiSettingsByDefault() {
  return !hasConfiguredAi();
}

export function getPreferredCloudProvider() {
  try {
    const storage = getStorage();
    const val = (storage?.getItem(PREFERRED_CLOUD_KEY) || '').trim();
    return val === 'openrouter' || val === 'gemini' ? val : '';
  } catch {
    return '';
  }
}

export function setPreferredCloudProvider(providerId) {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (providerId === 'openrouter' || providerId === 'gemini') {
      storage.setItem(PREFERRED_CLOUD_KEY, providerId);
    } else {
      storage.removeItem(PREFERRED_CLOUD_KEY);
    }
  } catch {}
}

function resolveConfiguredCloudProvider() {
  const hasOpenRouter = isOpenRouterAvailable();
  const hasGemini = isGeminiAvailable();
  if (hasOpenRouter && hasGemini) {
    return getPreferredCloudProvider() === 'gemini' ? 'gemini' : 'openrouter';
  }
  if (hasOpenRouter) return 'openrouter';
  if (hasGemini) return 'gemini';
  return null;
}

export {
  getLocalAiProgress,
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  isGeminiAvailable,
  testGeminiApiKey,
  promptGemini,
  OPENROUTER_PRESET_MODELS,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  removeOpenRouterApiKey,
  isOpenRouterAvailable,
  getOpenRouterModel,
  setOpenRouterModel,
  testOpenRouterApiKey,
  promptOpenRouter,
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

  const cloudProvider = resolveConfiguredCloudProvider();
  const hasWindowAi = await isWindowAiAvailable();
  await isLocalAiAvailable();

  if (cloudProvider === 'openrouter') {
    return {
      id: 'openrouter',
      label: `OpenRouter (${getOpenRouterModel()})`,
      badge: 'ענן · OpenRouter',
      isCloud: true,
      hasKey: true,
    };
  }

  if (cloudProvider === 'gemini') {
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

export function extractCurrentPersonFields(person = {}) {
  const findEvent = tag => [...(person.events || [])].reverse().find(e => e.type === tag);
  const findAttr = tag => (person.attributes || []).find(a => a.type === tag)?.value || '';

  const fields = {
    id: person.id,
    givenName: person.given || '',
    surname: person.surname || '',
    name: person.name || '',
    nickname: person.nickname || '',
    namePrefix: person.namePrefix || '',
    surnamePrefix: person.surnamePrefix || '',
    nameSuffix: person.nameSuffix || '',
    birthSurname: person.birthSurname || '',
    marriedSurname: person.marriedSurname || '',
    alternateNames: person.alternateNames || [],
    sex: person.sex || 'U',
    deathCause: person.death?.cause || '',
    occupation: person.occupation || '',
    notes: person.notes || [],
  };

  for (const def of SCALAR_EVENT_DEFINITIONS) {
    const ev = findEvent(def.tag);
    fields[`${def.prefix}Date`] = ev?.date || '';
    fields[`${def.prefix}Place`] = ev?.place || (def.tag === 'RESI' ? ev?.detail || '' : '');
  }

  for (const def of SCALAR_ATTRIBUTE_DEFINITIONS) {
    if (def.fieldKey === 'occupation') continue;
    fields[def.fieldKey] = findAttr(def.tag);
  }

  return fields;
}

/**
 * Builds the genealogy-expert prompt instructing the AI to output only valid JSON.
 */
export function buildPrompt(person, freeText, { data = null } = {}) {
  const fullInfo = extractCurrentPersonFields(person);
  // Keep prompt compact for small models: omit empty optional fields while always including core identity
  const coreKeys = new Set(['id', 'givenName', 'surname', 'name', 'sex', 'birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'occupation', 'notes']);
  const currentInfo = {};
  for (const [k, v] of Object.entries(fullInfo)) {
    const nonEmpty = Array.isArray(v) ? v.length > 0 : Boolean(v);
    if (coreKeys.has(k) || nonEmpty) currentInfo[k] = v;
  }

  let familyBlock = '';
  if (data && person?.id && data.people?.[person.id]) {
    const rels = getRelations(data, person.id);
    const immediateFamily = {
      parents: rels.parents.map(p => ({ id: p.id, name: p.name, sex: p.sex || 'U' })),
      spouses: rels.partners.map(p => ({
        id: p.id,
        name: p.name,
        sex: p.sex || 'U',
        familyId: p.family?.id || '',
        marriageDate: p.family?.marriage?.date || '',
      })),
      children: rels.children.map(p => ({ id: p.id, name: p.name, sex: p.sex || 'U' })),
      siblings: rels.siblings.map(p => ({ id: p.id, name: p.name, sex: p.sex || 'U', half: Boolean(p.half) })),
    };
    familyBlock = `\nCurrent immediate family in tree:\n${JSON.stringify(immediateFamily, null, 2)}\n`;
  }

  const hebrewHints = extractHebrewDateHints(String(freeText || ''));
  const hebrewHintBlock = hebrewHints.length
    ? `\nHebrew calendar conversions for dates in the user text (use these EXACT Gregorian GEDCOM dates, do NOT guess):\n${hebrewHints.map(h => `- "${h.phrase}" => "${h.gedcom}"`).join('\n')}\n`
    : '';

  return `You are a genealogy data assistant specializing in the GEDCOM 5.5 / 5.5.1 / 7 standard.
Your task is to analyze user-provided free-text (which may be in Hebrew, English, or mixed) describing updates to a SPECIFIC individual person in the family tree AND/OR new family members (parents, spouses, children, siblings) or family events mentioned in relation to this person.

CRITICAL RULES:
1. Update the focal person's own details AND extract any newly mentioned relatives into "relatives" and marriage/divorce/family events into "familyEvents".
2. Output MUST be ONLY a single valid JSON object, with NO surrounding explanation, NO markdown formatting.
3. ONLY include fields that are NEW or CHANGED by the user's text. NEVER repeat unchanged fields from Current person data (do NOT echo givenName, surname, or sex unless explicitly asked to change them). Never duplicate relatives already listed in Current immediate family in tree unless linking them explicitly with existingPersonId or adding new facts.
4. NEVER copy the user's sentence into "description" (which is ONLY for physical appearance like height or eye color) and do NOT duplicate structured facts into "notes".
5. Dates should be standardized GEDCOM dates (e.g., "15 MAY 1920", "1985", "OCT 1944", "ABT 1930"). If Hebrew calendar conversions are listed below, use those exact Gregorian dates.
6. Allowed JSON fields (ONLY include fields explicitly stated in the user's text):
   - Person identity & names: "givenName", "surname", "nickname", "namePrefix", "surnamePrefix", "nameSuffix", "birthSurname", "marriedSurname", "alternateNames" (string[]), "sex" ("M"|"F"|"U")
   - Core events (Date & Place pairs): "birthDate", "birthPlace", "deathDate", "deathPlace", "deathCause", "burialDate", "burialPlace", "cremationDate", "cremationPlace", "residenceDate", "residencePlace", "immigrationDate", "immigrationPlace", "emigrationDate", "emigrationPlace", "naturalizationDate", "naturalizationPlace", "barMitzvahDate", "barMitzvahPlace", "batMitzvahDate", "batMitzvahPlace", "baptismDate", "baptismPlace", "christeningDate", "christeningPlace", "adultChristeningDate", "adultChristeningPlace", "adoptionDate", "adoptionPlace", "blessingDate", "blessingPlace", "confirmationDate", "confirmationPlace", "firstCommunionDate", "firstCommunionPlace", "ordinationDate", "ordinationPlace", "censusDate", "censusPlace", "probateDate", "probatePlace", "willDate", "willPlace", "graduationDate", "graduationPlace", "retirementDate", "retirementPlace", "militaryDate", "militaryPlace", "circumcisionDate", "circumcisionPlace"
   - Attributes, contact & metadata: "occupation", "education", "title" (TITL), "religion" (RELI), "nationality" (NATI), "description" (physical DSCR only), "idNumber" (IDNO), "caste" (CAST), "property" (PROP), "ssn" (SSN), "childrenCount" (NCHI), "marriageCount" (NMR), "phone" (PHON), "email" (EMAIL), "website" (WWW), "fax" (FAX), "address" (ADDR), "referenceNumber" (REFN), "uid" (UID), "externalId" (EXID), "afn" (AFN), "rfn" (RFN), "restriction" (RESN), "alias" (ALIA)
   - Notes & source: "notes" (string[]), "source" (string, מקור המידע)
   - "events": array of { "tag": GEDCOM_TAG (e.g. "RESI", "EVEN", "CENS", "ORDN", "PROB", "WILL", "_MILT", "NO"), "type"?: string, "date"?: string, "place"?: string, "detail"?: string, "cause"?: string, "address"?: string, "agency"?: string, "age"?: string, "religion"?: string, "note"?: string }
   - "attributes": array of { "tag": GEDCOM_TAG (e.g. "FACT", "PROP", "CAST", "EDUC", "PHON", "EMAIL", "WWW", "ADDR", "RESN"), "type"?: string, "value": string, "date"?: string, "place"?: string, "note"?: string }
   - "familyEvents": array of { "tag": "MARR"|"DIV"|"DIVF"|"ENGA"|"ANUL"|"MARB"|"MARC"|"MARL"|"MARS"|"RESI"|"CENS"|"EVEN"|"FACT"|"NCHI"|"SLGS"|"NO", "partnerName"?: string, "familyId"?: string, "type"?: string, "date"?: string, "place"?: string, "detail"?: string, "note"?: string }
   - "relatives": array of family members to ADD or LINK:
     { "relation": "father"|"mother"|"parent"|"husband"|"wife"|"spouse"|"son"|"daughter"|"child"|"brother"|"sister"|"sibling", "givenName": string, "surname"?: string, "sex"?: "M"|"F"|"U", "birthDate"?: string, "birthPlace"?: string, "deathDate"?: string, "deathPlace"?: string, "occupation"?: string, "notes"?: string[], "marriageDate"?: string, "marriagePlace"?: string, "divorceDate"?: string, "divorcePlace"?: string, "engagementDate"?: string, "engagementPlace"?: string, "otherParentName"?: string, "pedigree"?: "birth"|"adopted"|"foster"|"sealing", "existingPersonId"?: string }

Examples:
1) Input: "נולד ב-1920 בוורשה, היה נגר ונפטר בתש\"ח בירושלים"
   Output: {"birthDate":"1920","birthPlace":"וורשה","occupation":"נגר","deathDate":"1948","deathPlace":"ירושלים"}
2) Input: "התחתן עם שרה לוי ב-1950 בחיפה, ונולדו להם בן דני ב-1952 ובת רותי ב-1955"
   Output: {"relatives":[{"relation":"wife","givenName":"שרה","surname":"לוי","marriageDate":"1950","marriagePlace":"חיפה"},{"relation":"son","givenName":"דני","birthDate":"1952","otherParentName":"שרה לוי"},{"relation":"daughter","givenName":"רותי","birthDate":"1955","otherParentName":"שרה לוי"}]}

Current person data in tree:
${JSON.stringify(currentInfo, null, 2)}
${familyBlock}${hebrewHintBlock}
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
  { devMode = false, onProgress, provider, data = null } = {}
) {
  const prompt = buildPrompt(person, freeText, { data });

  let rawResponse = '';
  let session = null;
  let usedProvider = provider || null;

  try {
    const cloudProvider = resolveConfiguredCloudProvider();
    // 0. Ollama on this machine — preferred whenever it is running
    if (provider === 'ollama' || (!provider && (await isOllamaAvailable()))) {
      usedProvider = 'ollama';
      console.log('[AI Editor] Using local Ollama');
      rawResponse = await promptOllama(prompt);
    }
    // 1. Explicit or configured OpenRouter API
    else if (provider === 'openrouter' || (!provider && cloudProvider === 'openrouter')) {
      usedProvider = 'openrouter';
      console.log('[AI Editor] Using OpenRouter API provider');
      rawResponse = await promptOpenRouter(prompt);
    }
    // 2. Explicit or configured Gemini API
    else if (provider === 'gemini' || (!provider && cloudProvider === 'gemini')) {
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
  let jsonRepaired = false;
  const warnings = [];
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (parseError) {
    // AI responses are sometimes cut off mid-generation (unterminated string / array).
    // Salvage the fully received fields instead of failing the whole extraction.
    const repaired = repairTruncatedJson(jsonString);
    if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) {
      parsedJson = repaired;
      jsonRepaired = true;
      warnings.push(
        'תשובת ה-AI פוצלה באמצע — ה-JSON נותקן ומדווח רק לפי השטחים המלאים שהתקבלו (ערות/ערכים חותכים נוקו).',
      );
      if (devMode) {
        console.warn(
          '[AI Editor] JSON parse failed; repaired truncated response:',
          parseError.message,
          '→',
          repaired,
        );
      }
    } else {
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
        warnings,
        repaired: false,
      };
    }
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
  // replace that guessed date with the exact deterministic Hebrew conversion across focal fields,
  // structured events, familyEvents, and relatives.
  const hebrewHints = extractHebrewDateHints(String(freeText || ''));
  if (hebrewHints.length && parsedJson && typeof parsedJson === 'object') {
    const dateTargets = [];
    for (const k of Object.keys(parsedJson)) {
      if (k.endsWith('Date') && typeof parsedJson[k] === 'string') {
        dateTargets.push({ obj: parsedJson, key: k });
      }
    }
    for (const arrKey of ['events', 'familyEvents']) {
      if (Array.isArray(parsedJson[arrKey])) {
        for (const ev of parsedJson[arrKey]) {
          if (ev && typeof ev === 'object' && typeof ev.date === 'string') {
            dateTargets.push({ obj: ev, key: 'date' });
          }
        }
      }
    }
    if (Array.isArray(parsedJson.relatives)) {
      for (const rel of parsedJson.relatives) {
        if (!rel || typeof rel !== 'object') continue;
        for (const k of Object.keys(rel)) {
          if (k.endsWith('Date') && typeof rel[k] === 'string') {
            dateTargets.push({ obj: rel, key: k });
          }
        }
        if (Array.isArray(rel.events)) {
          for (const ev of rel.events) {
            if (ev && typeof ev === 'object' && typeof ev.date === 'string') {
              dateTargets.push({ obj: ev, key: 'date' });
            }
          }
        }
      }
    }

    const explicitYearsInText = new Set([...String(freeText).matchAll(/\b(\d{3,4})\b/g)].map(m => m[1]));
    const formattedDates = dateTargets.map(t => formatToGedcomDate(t.obj[t.key]));
    const usedHints = new Set();
    for (const val of formattedDates) {
      for (const h of hebrewHints) {
        if (val === h.gedcom) usedHints.add(h.gedcom);
      }
    }
    const unusedHints = hebrewHints.filter(h => !usedHints.has(h.gedcom));
    if (unusedHints.length) {
      let hintIdx = 0;
      for (let i = 0; i < dateTargets.length && hintIdx < unusedHints.length; i++) {
        const formatted = formattedDates[i] || '';
        const yearMatch = formatted.match(/\b(\d{3,4})\b/);
        const year = yearMatch ? yearMatch[1] : '';
        if (year && !explicitYearsInText.has(year) && !usedHints.has(formatted)) {
          dateTargets[i].obj[dateTargets[i].key] = unusedHints[hintIdx++].gedcom;
        }
      }
    }
  }

  const validation = validatePersonUpdates(parsedJson, currentPerson, {
    data,
    personId: person?.id || null,
  });

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
    warnings,
    repaired: jsonRepaired,
  };
}
