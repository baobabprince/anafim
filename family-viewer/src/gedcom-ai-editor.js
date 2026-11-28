/**
 * GEDCOM Person & Family Editor & Schema Validator
 * Safely parses, validates, and updates individual (INDI) and family (FAM) records within a raw GEDCOM string.
 */

import { parseGedcom, normalize, getRelations } from './gedcom.js';
import {
  FAM_EVENT_TAGS,
  SINGLETON_EVENT_TAGS,
  SINGLETON_FAM_EVENT_TAGS,
  SCALAR_EVENT_DEFINITIONS,
  SCALAR_ATTRIBUTE_DEFINITIONS,
  PEDIGREE_TYPES,
  isValidGedcomTagName,
  normalizeRelationType,
  inferSexFromRelation,
  relationCategory,
} from './gedcom-tags.js';

export const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Sanitize a single-line GEDCOM value so line breaks or control chars cannot inject new tags/records. */
export function sanitizeGedcomInline(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeGedcomMultiline(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/** Build a multi-line GEDCOM node (e.g. NOTE or ADDR) using CONT lines at baseLevel + 1. */
function createMultilineNode(tag, textValue, baseLevel = 1) {
  const lines = String(textValue ?? '')
    .replace(CONTROL_CHARS, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trimEnd());
  const first = (lines[0] || '').trim();
  const rest = lines.slice(1);
  return {
    level: baseLevel,
    tag,
    val: lines.join('\n').trim(),
    raw: first ? `${baseLevel} ${tag} ${first}` : `${baseLevel} ${tag}`,
    children: rest.map(line => ({
      level: baseLevel + 1,
      tag: 'CONT',
      val: line,
      raw: line ? `${baseLevel + 1} CONT ${line}` : `${baseLevel + 1} CONT`,
    })),
  };
}

/** Build a GEDCOM NOTE node using CONT lines for any embedded newlines. */
function createNoteNode(noteText, baseLevel = 1) {
  return createMultilineNode('NOTE', noteText, baseLevel);
}

const HEBREW_MONTHS = {
  'ינואר': 'JAN', 'פאברואר': 'FEB', 'פברואר': 'FEB', 'מרץ': 'MAR', 'אפריל': 'APR',
  'מאי': 'MAY', 'יוני': 'JUN', 'יולי': 'JUL', 'אוגוסט': 'AUG', 'ספטמבר': 'SEP',
  'אוקטובר': 'OCT', 'נובמבר': 'NOV', 'דצמבר': 'DEC'
};

const ENGLISH_MONTHS = {
  'jan': 'JAN', 'january': 'JAN',
  'feb': 'FEB', 'february': 'FEB',
  'mar': 'MAR', 'march': 'MAR',
  'apr': 'APR', 'april': 'APR',
  'may': 'MAY',
  'jun': 'JUN', 'june': 'JUN',
  'jul': 'JUL', 'july': 'JUL',
  'aug': 'AUG', 'august': 'AUG',
  'sep': 'SEP', 'sept': 'SEP', 'september': 'SEP',
  'oct': 'OCT', 'october': 'OCT',
  'nov': 'NOV', 'november': 'NOV',
  'dec': 'DEC', 'december': 'DEC'
};

const GEMATRIA_VALUES = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90,
  'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
};

const HEBREW_CALENDAR_MONTHS = [
  ['אדר ב', 'adar ii'],
  ['אדר שני', 'adar ii'],
  ['אדר א', 'adar i'],
  ['אדר ראשון', 'adar i'],
  ['תשרי', 'tishri'],
  ['מרחשוון', 'heshvan'],
  ['מרחשון', 'heshvan'],
  ['חשוון', 'heshvan'],
  ['חשון', 'heshvan'],
  ['כסלו', 'kislev'],
  ['כסליו', 'kislev'],
  ['טבת', 'tevet'],
  ['שבט', 'shevat'],
  ['אדר', 'adar'],
  ['ניסן', 'nisan'],
  ['אייר', 'iyar'],
  ['איר', 'iyar'],
  ['סיון', 'sivan'],
  ['סיוון', 'sivan'],
  ['תמוז', 'tamuz'],
  ['מנחם אב', 'av'],
  ['אב', 'av'],
  ['אלול', 'elul'],
];

function gematriaSum(letters) {
  let sum = 0;
  for (const ch of letters) {
    const val = GEMATRIA_VALUES[ch];
    if (!val) return 0;
    sum += val;
  }
  return sum;
}

/**
 * Parse a Hebrew calendar year token (e.g. "תשי\"ב", "בתשי\"ב", "ה'תש\"ח", "תרצ\"ט", "ת\"ש")
 * into its 4-digit Hebrew year (e.g. 5712). Returns null for non-years like "ת\"א" or "צה\"ל".
 */
export function parseHebrewYearToken(token) {
  if (!token || typeof token !== 'string') return null;
  let raw = token.trim().replace(/[.,;:!?()[\]]+$/g, '');
  if (!raw) return null;

  // Allow optional leading preposition ב/ב-/ב־/ל/ל- before a Hebrew year
  raw = raw.replace(/^(?:ב|ל)[-־]?/, (m, offset, str) => {
    const rest = str.slice(m.length);
    return /^(?:ה['׳])?ת["״']?[קרשת]/.test(rest) ? '' : m;
  });

  // Optional 5000 prefix: ה' / ה׳
  let hasThousands = false;
  if (/^ה['׳]/.test(raw)) {
    hasThousands = true;
    raw = raw.slice(2);
  }

  // Must start with ת + century letter (ק/ר/ש/ת => 5500..5899 = 1740..2139 CE)
  // This avoids false positives on acronyms like ת"א (Tel Aviv) or צה"ל.
  const hasPunct = /["״'׳]/.test(raw);
  const letters = raw.replace(/["״'׳]/g, '');
  if (!/^ת[קרשת][א-ת]{0,3}$/.test(letters)) return null;
  if (!hasPunct && !hasThousands && letters.length < 3) return null;

  const value = gematriaSum(letters);
  if (value < 500 || value > 999) return null;
  return 5000 + value;
}

function parseHebrewDayToken(token) {
  if (!token) return null;
  const trimmed = String(token).trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n >= 1 && n <= 30 ? n : null;
  }
  const letters = trimmed.replace(/["״'׳]/g, '');
  if (!/^[א-ל]{1,2}$/.test(letters)) return null;
  const n = gematriaSum(letters);
  return n >= 1 && n <= 30 ? n : null;
}

let cachedHebrewFmt = null;
function getHebrewCalendarFormatter() {
  if (!cachedHebrewFmt) {
    cachedHebrewFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return cachedHebrewFmt;
}

function normalizeIntlHebrewMonth(name) {
  const s = String(name || '').toLowerCase().trim();
  if (s === 'tishrei') return 'tishri';
  if (s === 'cheshvan') return 'heshvan';
  if (s === 'tammuz') return 'tamuz';
  if (s === 'shvat') return 'shevat';
  return s;
}

function convertHebrewYmdToGedcom(hebrewYear, canonicalMonth = null, hebrewDay = null) {
  if (!hebrewYear || hebrewYear < 5000 || hebrewYear > 6200) return '';
  if (!canonicalMonth) {
    return String(hebrewYear - 3760);
  }
  try {
    const fmt = getHebrewCalendarFormatter();
    const approxGreg = hebrewYear - 3760;
    const startUtc = Date.UTC(approxGreg - 1, 7, 15); // Aug 15 of previous year
    const targetDay = hebrewDay || 15;
    let firstMonthHit = null;

    for (let offset = 0; offset < 430; offset++) {
      const dt = new Date(startUtc + offset * 86400000);
      const parts = fmt.formatToParts(dt);
      const y = Number(parts.find(p => p.type === 'year')?.value);
      if (y !== hebrewYear) continue;
      const m = normalizeIntlHebrewMonth(parts.find(p => p.type === 'month')?.value);
      const monthMatches = m === canonicalMonth || (canonicalMonth === 'adar' && (m === 'adar' || m === 'adar ii'));
      if (!monthMatches) continue;
      const d = Number(parts.find(p => p.type === 'day')?.value);
      if (!firstMonthHit) firstMonthHit = dt;
      if (d === targetDay) {
        const gYear = dt.getUTCFullYear();
        const gMon = GEDCOM_MONTHS[dt.getUTCMonth()];
        const gDay = dt.getUTCDate();
        return hebrewDay ? `${gDay} ${gMon} ${gYear}` : `${gMon} ${gYear}`;
      }
    }
    if (firstMonthHit) {
      const gYear = firstMonthHit.getUTCFullYear();
      const gMon = GEDCOM_MONTHS[firstMonthHit.getUTCMonth()];
      return `${gMon} ${gYear}`;
    }
  } catch {
    // Fallback below if Intl Hebrew calendar is unavailable
  }
  return String(hebrewYear - 3760);
}

/**
 * Parse a Hebrew calendar date string (e.g. "תשי\"ב", "בתשי\"ב", "ה' באייר תש\"ח", "כ\"ה כסלו תשי\"ב")
 * into a standard Gregorian GEDCOM date ("1952", "14 MAY 1948", "DEC 1951").
 */
export function parseHebrewDateToGedcom(input) {
  if (!input || typeof input !== 'string') return '';
  const str = input.trim();
  if (!str) return '';

  // Find a Hebrew calendar year token in the string
  const tokens = str.split(/\s+/);
  let yearIdx = -1;
  let hebrewYear = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const parsed = parseHebrewYearToken(tokens[i]);
    if (parsed) {
      hebrewYear = parsed;
      yearIdx = i;
      break;
    }
  }
  if (!hebrewYear) return '';

  const beforeYear = tokens.slice(0, yearIdx).join(' ');
  let matchedMonth = null;
  let monthPos = -1;
  for (const [hebName, canonical] of HEBREW_CALENDAR_MONTHS) {
    const re = new RegExp(`(?:^|[\\s\\-־])(?:ב[-־]?)?${hebName}(?=$|[\\s\\-־'׳"״,])`);
    const m = beforeYear.match(re);
    if (m) {
      matchedMonth = canonical;
      monthPos = m.index;
      break;
    }
  }

  let day = null;
  if (matchedMonth && monthPos >= 0) {
    const beforeMonth = beforeYear.slice(0, monthPos).trim();
    const dayToken = beforeMonth.split(/\s+/).at(-1);
    day = parseHebrewDayToken(dayToken);
  }

  return convertHebrewYmdToGedcom(hebrewYear, matchedMonth, day);
}

/**
 * Extract deterministic Hebrew date conversions from free-form Hebrew text
 * so small AI models don't guess Hebrew gematria years.
 */
export function extractHebrewDateHints(freeText) {
  if (!freeText || typeof freeText !== 'string') return [];
  const hints = [];
  const seen = new Set();
  const monthAlternation = HEBREW_CALENDAR_MONTHS.map(([heb]) => heb).join('|');
  const fullRe = new RegExp(
    `(?:(?:(?:\\d{1,2}|[א-ל]["״'׳]?[א-ט]?["״'׳]?)\\s+)?(?:ב[-־]?)?(?:${monthAlternation})\\s+)?(?:ב[-־]?|ל[-־]?)?(?:ה['׳])?ת["״']?[קרשת][א-ת"״'׳]*`,
    'g'
  );

  for (const m of freeText.matchAll(fullRe)) {
    const phrase = m[0].trim();
    const gedcom = parseHebrewDateToGedcom(phrase);
    if (!gedcom) continue;
    const key = `${phrase}=>${gedcom}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ phrase, gedcom });
  }
  return hints;
}

/**
 * Standardize dates to standard GEDCOM format (e.g. "15 MAY 1920" or "1985" or "ABT 1940")
 */
export function formatToGedcomDate(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim();
  if (!str) return '';

  // Already standard GEDCOM date format? (e.g. "15 MAY 1920", "MAY 1920", "1920", "ABT 1920")
  if (/^(\d{1,2}\s+)?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{3,4}$/i.test(str)) {
    return str.toUpperCase();
  }
  if (/^(ABT|CAL|EST|BEF|AFT|BET)\s+/i.test(str)) {
    const prefix = str.match(/^(ABT|CAL|EST|BEF|AFT|BET)\s+/i)[1].toUpperCase();
    const rest = str.slice(prefix.length).trim();
    const formattedRest = formatToGedcomDate(rest);
    return formattedRest ? `${prefix} ${formattedRest}` : str;
  }
  if (/^\d{3,4}$/.test(str)) {
    return str;
  }

  // Check DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{3,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthNum = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];
    if (monthNum >= 1 && monthNum <= 12 && day >= 1 && day <= 31) {
      return `${day} ${GEDCOM_MONTHS[monthNum - 1]} ${year}`;
    }
  }

  // Check YYYY-MM-DD (ISO)
  const isoMatch = str.match(/^(\d{3,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthNum = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (monthNum >= 1 && monthNum <= 12 && day >= 1 && day <= 31) {
      return `${day} ${GEDCOM_MONTHS[monthNum - 1]} ${year}`;
    }
  }

  // Check Hebrew month names (e.g., "15 במאי 1920" or "מאי 1920")
  for (const [heb, mon] of Object.entries(HEBREW_MONTHS)) {
    if (str.includes(heb)) {
      const dayMatch = str.match(new RegExp(`\\b(\\d{1,2})\\s*(?:ב-?|ל-?)?${heb}`, 'i')) || str.match(new RegExp(`(?:ב-?|ל-?)?${heb}\\s*(\\d{1,2})\\b`, 'i'));
      const day = dayMatch ? dayMatch[1] : null;
      const yearMatch = str.match(/\b(\d{3,4})\b/);
      const year = yearMatch ? yearMatch[1] : '';
      if (day && year && day !== year.slice(0, 2)) return `${parseInt(day, 10)} ${mon} ${year}`;
      if (year) return `${mon} ${year}`;
      if (day) return `${parseInt(day, 10)} ${mon}`;
      return mon;
    }
  }

  // Check English month names (e.g., "15 May 1920" or "May 1920")
  for (const [eng, mon] of Object.entries(ENGLISH_MONTHS)) {
    const pattern = new RegExp(`(?:(\\d{1,2})\\s+)?\\b${eng}\\b(?:\\s+(\\d{3,4}))?`, 'i');
    const m = str.match(pattern);
    if (m) {
      const day = m[1];
      const yearMatch = str.match(/\b(\d{3,4})\b/);
      const year = m[2] || (yearMatch ? yearMatch[1] : '');
      if (day && year) return `${parseInt(day, 10)} ${mon} ${year}`;
      if (year) return `${mon} ${year}`;
    }
  }

  // Check Hebrew calendar dates & gematria years (e.g., "תשי\"ב", "בתשי\"ב", "ה' באייר תש\"ח")
  const hebrewConverted = parseHebrewDateToGedcom(str);
  if (hebrewConverted) return hebrewConverted;

  // Fallback: if there's a 4-digit year, return it
  const justYear = str.match(/\b(\d{3,4})\b/);
  if (justYear) return justYear[1];

  return str;
}

const SCALAR_DATE_KEYS = SCALAR_EVENT_DEFINITIONS.map(def => `${def.prefix}Date`);
const SCALAR_PLACE_KEYS = SCALAR_EVENT_DEFINITIONS.map(def => `${def.prefix}Place`);
const SCALAR_ATTR_KEYS = SCALAR_ATTRIBUTE_DEFINITIONS.map(def => def.fieldKey);
const NAME_PART_KEYS = [
  'givenName',
  'surname',
  'nickname',
  'namePrefix',
  'surnamePrefix',
  'nameSuffix',
  'birthSurname',
  'maidenName',
  'marriedSurname',
  'alternateNames',
  'alternateName',
];
const STRUCTURED_ARRAY_KEYS = new Set([
  'events',
  'attributes',
  'facts',
  'familyEvents',
  'customTags',
  'relatives',
  'addRelatives',
]);
const RELATIVE_EXTRA_KEYS = [
  'relation',
  'name',
  'existingPersonId',
  'pedigree',
  'targetFamilyId',
  'otherParentId',
  'otherParentName',
  'halfParentId',
  'createNewFamily',
  'marriageDate',
  'marriagePlace',
  'divorceDate',
  'divorcePlace',
  'engagementDate',
  'engagementPlace',
  'relationshipStatus',
  'familyEvents',
];

/** Fields the AI is allowed to return. */
export const AI_ALLOWED_KEYS = new Set([
  ...NAME_PART_KEYS,
  'sex',
  'deathCause',
  ...SCALAR_DATE_KEYS,
  ...SCALAR_PLACE_KEYS,
  ...SCALAR_ATTR_KEYS,
  'notes',
  'source',
  ...STRUCTURED_ARRAY_KEYS,
]);

const RELATIVE_ALLOWED_KEYS = new Set([
  ...NAME_PART_KEYS,
  'sex',
  'deathCause',
  ...SCALAR_DATE_KEYS,
  ...SCALAR_PLACE_KEYS,
  ...SCALAR_ATTR_KEYS,
  'notes',
  'source',
  'events',
  'attributes',
  'facts',
  'customTags',
  ...RELATIVE_EXTRA_KEYS,
]);

const DATE_FIELDS_SET = new Set([
  ...SCALAR_DATE_KEYS,
  'marriageDate',
  'divorceDate',
  'engagementDate',
]);

function normalizeCompare(val) {
  return sanitizeGedcomInline(val).toLowerCase();
}

function looksLikeEchoedInput(description, freeText) {
  if (!description || !freeText) return false;
  const normDesc = normalizeCompare(description);
  const normText = normalizeCompare(freeText);
  if (!normDesc || !normText) return false;
  if (normDesc === normText || normText.includes(normDesc) || normDesc.includes(normText)) {
    // Only keep if it explicitly looks like a physical trait description
    const physicalHints = /(גובה|גבוה|נמוך|עיניים|שיער|זקן|משקפיים|רזה|מלא|tall|short|eyes|hair|beard|glasses)/i;
    if (!physicalHints.test(normDesc)) return true;
  }
  return false;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  if (Array.isArray(value)) return value.some(isNonEmptyValue);
  if (isPlainObject(value)) return Object.values(value).some(isNonEmptyValue);
  return false;
}

function cleanStructuredObject(item) {
  if (!isPlainObject(item)) return null;
  const cleanedItem = {};
  for (const [k, v] of Object.entries(item)) {
    if (!isNonEmptyValue(v)) continue;
    if (Array.isArray(v)) {
      const cleanedArr = v
        .map(el => (isPlainObject(el) ? cleanStructuredObject(el) : typeof el === 'string' ? el.trim() : el))
        .filter(isNonEmptyValue);
      if (cleanedArr.length) cleanedItem[k] = cleanedArr;
    } else {
      cleanedItem[k] = v;
    }
  }
  return Object.keys(cleanedItem).length ? cleanedItem : null;
}

/** Common model aliases mapped onto canonical relative keys. */
const RELATIVE_KEY_ALIASES = { relationship: 'relation', fullName: 'name' };

/**
 * Cleans one AI-produced relative entry: drops empty values, maps common model
 * aliases (`relationship` -> `relation`, `fullName` -> `name`) and removes keys
 * that are not part of the relatives schema — a single unknown key would fail
 * validation and invalidate the whole batch.
 */
function cleanRelativeItem(item) {
  const base = cleanStructuredObject(item);
  if (!base) return null;
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    let key = k;
    if (
      !RELATIVE_ALLOWED_KEYS.has(key) &&
      RELATIVE_KEY_ALIASES[k] &&
      base[RELATIVE_KEY_ALIASES[k]] === undefined &&
      out[RELATIVE_KEY_ALIASES[k]] === undefined
    ) {
      key = RELATIVE_KEY_ALIASES[k];
    }
    if (!RELATIVE_ALLOWED_KEYS.has(key)) continue;
    if (out[key] === undefined) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Cleans raw AI output before validation:
 * - Drops empty values and unknown keys (small models often emit empty strings or "name").
 * - Normalizes `facts` -> `attributes` and `addRelatives` -> `relatives`.
 * - Coerces a single structured object into a one-element array (small models often
 *   return `relatives: {...}` instead of `relatives: [...]`).
 * - When `currentPerson` is provided, drops unchanged no-op fields (e.g. echoing existing givenName/surname/sex).
 * - When `freeText` is provided, drops `description` (DSCR) if it merely echoes the user's biographical sentence.
 */
export function cleanAiUpdates(updates, { currentPerson = null, freeText = '' } = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { cleaned: updates, dropped: [] };
  }
  const cleaned = {};
  const dropped = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!AI_ALLOWED_KEYS.has(key) || !isNonEmptyValue(value)) {
      dropped.push(key);
      continue;
    }

    if (STRUCTURED_ARRAY_KEYS.has(key)) {
      let rawItems = value;
      if (!Array.isArray(value)) {
        // Small models often emit a single object instead of a one-element array.
        if (isPlainObject(value)) {
          rawItems = [value];
        } else {
          dropped.push(key);
          continue;
        }
      }
      const isRelatives = key === 'relatives' || key === 'addRelatives';
      const cleanedItems = rawItems
        .map(item => (isRelatives ? cleanRelativeItem(item) : cleanStructuredObject(item)))
        .filter(Boolean);
      if (!cleanedItems.length) {
        dropped.push(key);
        continue;
      }
      const targetKey = key === 'facts' ? 'attributes' : key === 'addRelatives' ? 'relatives' : key;
      cleaned[targetKey] = [...(cleaned[targetKey] || []), ...cleanedItems];
      continue;
    }

    // Small models frequently dump the entire user input into `description` (GEDCOM DSCR = physical description).
    if (key === 'description' && typeof value === 'string' && freeText && looksLikeEchoedInput(value, freeText)) {
      dropped.push(key);
      continue;
    }

    // Drop unchanged scalar fields that merely echo currentPerson data.
    if (currentPerson && typeof value === 'string' && key !== 'notes' && key !== 'source' && key !== 'alternateNames' && key !== 'alternateName') {
      const existing = currentPerson[key];
      if (existing != null && String(existing).trim() !== '') {
        const nextNorm = DATE_FIELDS_SET.has(key)
          ? normalizeCompare(formatToGedcomDate(value))
          : key === 'sex'
            ? String(value).trim().toUpperCase()
            : normalizeCompare(value);
        const curNorm = DATE_FIELDS_SET.has(key)
          ? normalizeCompare(formatToGedcomDate(String(existing)))
          : key === 'sex'
            ? String(existing).trim().toUpperCase()
            : normalizeCompare(existing);
        if (nextNorm === curNorm) {
          dropped.push(key);
          continue;
        }
      }
    }

    cleaned[key] = value;
  }
  return { cleaned, dropped };
}

const XREF_PATTERN = /^@[^@\s]+@$/;

/**
 * Deterministically links AI-proposed relatives to people that already exist in
 * the tree so free-text updates extend an existing person instead of creating a
 * duplicate. For every relative:
 *  - drops hallucinated / self / unknown `existingPersonId` values the model invented;
 *  - matches the relative's name against the tree (unique normalized match, focal
 *    person excluded) and sets `existingPersonId` when the match is unambiguous;
 *  - refuses links that would create ancestor/descendant/sibling/spouse cycles or
 *    attach a tree individual to the focal person in a conflicting role;
 *  - drops `otherParentId` / `halfParentId` / `targetFamilyId` references that do
 *    not resolve against the tree.
 *
 * Name fields are intentionally KEPT on the relative so UI previews can still
 * show them and the user can switch to "create new person"; identity fields are
 * stripped later, at apply time (see applyRelativeAddition).
 *
 * Returns `{ relatives, linked }` where `linked` lists
 * `{ id, name, relation, via: 'model' | 'name' }`.
 */
export function linkRelativesToExistingPeople(relatives, data, focalPersonId = '') {
  const out = { relatives: Array.isArray(relatives) ? relatives : [], linked: [] };
  if (!data?.people || !out.relatives.length) return out;

  const focal = String(focalPersonId || '').trim();
  const focalInTree = Boolean(focal && data.people[focal]);

  // Roles tree individuals already hold relative to the focal person.
  const relatedRoles = new Map(); // personId -> Set(category)
  if (focalInTree) {
    const rels = getRelations(data, focal);
    const add = (arr, cat) => {
      for (const p of arr || []) {
        if (!p?.id) continue;
        if (!relatedRoles.has(p.id)) relatedRoles.set(p.id, new Set());
        relatedRoles.get(p.id).add(cat);
      }
    };
    add(rels.parents, 'parent');
    add(rels.partners, 'spouse');
    add(rels.children, 'child');
    add(rels.siblings, 'sibling');
  }

  const usedIds = new Set();
  const canLinkAs = (pid, cat) => {
    if (!focalInTree || pid === focal) return false;
    if (cat === 'parent' && isDescendantInData(data, focal, pid)) return false;
    if (cat === 'child' && isAncestorInData(data, focal, pid)) return false;
    if (cat === 'sibling' && (isAncestorInData(data, focal, pid) || isDescendantInData(data, focal, pid))) return false;
    if (cat === 'spouse' && (isAncestorInData(data, focal, pid) || isDescendantInData(data, focal, pid))) return false;
    const roles = relatedRoles.get(pid);
    if (cat && roles && [...roles].some(r => r !== cat)) return false; // already related in a different role
    return true;
  };

  for (const rel of out.relatives) {
    if (!rel || typeof rel !== 'object') continue;
    const cat = relationCategory(rel.relation);

    // 1) Keep a usable id supplied by the model; drop invented ones.
    if (rel.existingPersonId) {
      const id = sanitizeGedcomInline(rel.existingPersonId);
      const exists = XREF_PATTERN.test(id) && Boolean(data.people[id]);
      const usable = exists && id !== focal && !usedIds.has(id) && (focalInTree ? canLinkAs(id, cat) : true);
      if (usable) {
        rel.existingPersonId = id;
        usedIds.add(id);
        out.linked.push({ id, name: data.people[id].name || '', relation: rel.relation, via: 'model' });
        continue;
      }
      delete rel.existingPersonId; // fall through to name matching
    }

    // 2) Unique name match against the tree.
    if (!cat || !focalInTree) continue;
    let relGiven = normalize(rel.givenName || '');
    let relSurn = normalize(rel.surname || '');
    if (!relGiven && !relSurn && typeof rel.name === 'string') {
      const split = splitNameString(rel.name);
      relGiven = normalize(split.givenName);
      relSurn = normalize(split.surname);
    }
    const target = [relGiven, relSurn].filter(Boolean).join(' ');
    if (!target) continue;

    const matches = [];
    for (const [pid, p] of Object.entries(data.people)) {
      if (!p || pid === focal || usedIds.has(pid)) continue;
      const pGiven = normalize(p.given || '');
      const pSurn = normalize(p.surname || '');
      const pFull = normalize(p.name || [p.given, p.surname].filter(Boolean).join(' '));
      let hit = false;
      if (pFull === target) hit = true;
      // Model returned only a first name — match a unique tree given name.
      else if (relGiven && !relSurn && pGiven && pGiven === relGiven) hit = true;
      // Parts match although the stored full name carries an extra prefix/suffix.
      else if (relGiven && relSurn && pGiven === relGiven && pSurn && pSurn === relSurn) hit = true;
      if (hit) matches.push(pid);
    }
    if (matches.length !== 1) continue; // none or ambiguous — leave for the user
    const pid = matches[0];
    if (!canLinkAs(pid, cat)) continue;
    rel.existingPersonId = pid;
    usedIds.add(pid);
    out.linked.push({ id: pid, name: data.people[pid].name || '', relation: rel.relation, via: 'name' });
  }

  // 3) Drop family/person references that do not resolve against the tree.
  for (const rel of out.relatives) {
    if (!rel || typeof rel !== 'object') continue;
    for (const key of ['otherParentId', 'halfParentId']) {
      if (!rel[key]) continue;
      const id = sanitizeGedcomInline(rel[key]);
      if (!XREF_PATTERN.test(id) || !data.people[id] || id === focal) delete rel[key];
      else rel[key] = id;
    }
    if (rel.targetFamilyId) {
      const id = sanitizeGedcomInline(rel.targetFamilyId);
      if (!XREF_PATTERN.test(id) || !data.families?.[id]) delete rel.targetFamilyId;
      else rel.targetFamilyId = id;
    }
  }

  return out;
}

/**
 * Attempts to repair a JSON string that was cut off mid-generation by an AI model.
 * Drops the incomplete trailing element (a partial string value or a dangling key),
 * closes any unterminated arrays/objects, and returns the parsed object.
 * Returns null when the text cannot be repaired — callers then keep the original parse error.
 */
export function repairTruncatedJson(text) {
  if (typeof text !== 'string' || !text) return null;

  // Single scan: track string state, open-container stack, and the last positions
  // where the text could be cut safely (after a comma, closing bracket, or complete string).
  let inString = false;
  let escaped = false;
  const stack = [];
  let lastSafeIndex = -1;
  let lastStringStart = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        lastSafeIndex = i + 1;
      }
    } else if (ch === '"') {
      inString = true;
      lastStringStart = i;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
    } else if (ch === '}' || ch === ']') {
      if (stack.length) stack.pop();
      lastSafeIndex = i + 1;
    } else if (ch === ',') {
      lastSafeIndex = i + 1;
    }
  }

  // Nothing structurally incomplete — a plain JSON.parse failure of complete text has no repair.
  if (!inString && stack.length === 0) return null;

  const stripTail = (str) => str.replace(/[\s,;:]+$/, '');
  const tryParse = (candidate) => {
    if (!candidate) return null;
    let inStr = false;
    let esc = false;
    const open = [];
    for (const ch of candidate) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') open.push(ch === '{' ? '}' : ']');
      else if (ch === '}' || ch === ']') {
        if (open.length) open.pop();
      }
    }
    if (inStr) return null; // candidate itself still has an unterminated string
    try {
      // Close containers in reverse open order (innermost first).
      return JSON.parse(candidate + open.reverse().join(''));
    } catch {
      return null;
    }
  };

  // Attempt A: cut at the last completed separator, keeping every fully received element.
  const cutA = stripTail(text.slice(0, lastSafeIndex >= 0 ? lastSafeIndex : text.length));
  let parsed = tryParse(cutA);
  if (!parsed) {
    // Attempt A2: the last key's value was cut off entirely — drop the dangling "key": pair.
    parsed = tryParse(cutA.replace(/,\s*"[^"]*"\s*$/, ''));
  }
  if (parsed) return parsed;

  // Attempt B: the incomplete string is the very first value (no separator before it).
  // Cut back to its opening quote and drop the dangling key so the container can close.
  if (inString && lastStringStart > 0) {
    const cutB = stripTail(text.slice(0, lastStringStart))
      .replace(/,\s*"[^"]*"\s*$/, '')
      .replace(/^\s*\{\s*"[^"]*"\s*$/, '{');
    parsed = tryParse(cutB);
    if (parsed) return parsed;
  }

  return null;
}

function isDescendantInData(data, startId, targetId) {
  if (!data?.people?.[startId] || !data?.people?.[targetId]) return false;
  const visited = new Set([startId]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i++) {
    const pid = queue[i];
    const person = data.people[pid];
    if (!person) continue;
    for (const fid of person.spouseFamilies || []) {
      const fam = data.families?.[fid];
      if (!fam) continue;
      for (const cid of fam.children || []) {
        if (cid === targetId) return true;
        if (!visited.has(cid)) {
          visited.add(cid);
          queue.push(cid);
        }
      }
    }
  }
  return false;
}

function isAncestorInData(data, startId, targetId) {
  if (!data?.people?.[startId] || !data?.people?.[targetId]) return false;
  const visited = new Set([startId]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i++) {
    const pid = queue[i];
    const person = data.people[pid];
    if (!person) continue;
    for (const pf of person.parentFamilies || []) {
      const fam = data.families?.[pf.id];
      if (!fam) continue;
      for (const parentId of fam.partners || []) {
        if (parentId === targetId) return true;
        if (!visited.has(parentId)) {
          visited.add(parentId);
          queue.push(parentId);
        }
      }
    }
  }
  return false;
}

const PERSON_STRING_FIELDS = [
  'givenName',
  'surname',
  'nickname',
  'namePrefix',
  'surnamePrefix',
  'nameSuffix',
  'birthSurname',
  'maidenName',
  'marriedSurname',
  'deathCause',
  ...SCALAR_PLACE_KEYS,
  ...SCALAR_ATTRIBUTE_DEFINITIONS.filter(d => !d.multiline).map(d => d.fieldKey),
  'source',
];

const SLASH_STRIP_FIELDS = new Set([
  'givenName',
  'surname',
  'birthSurname',
  'maidenName',
  'marriedSurname',
]);

function splitNameString(fullName) {
  const cleaned = sanitizeGedcomInline(fullName);
  if (!cleaned) return { givenName: '', surname: '' };
  const slashMatch = cleaned.match(/^([^/]*)\/([^/]*)\//);
  if (slashMatch) {
    return {
      givenName: slashMatch[1].trim(),
      surname: slashMatch[2].trim(),
    };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { givenName: parts[0] || '', surname: '' };
  }
  return {
    givenName: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1],
  };
}

function validateStructuredEvents(rawEvents, errors, { familyMode = false, resolvedData = null, label = 'events' } = {}) {
  if (!Array.isArray(rawEvents)) {
    errors.push(`השדה ${label} חייב להיות מערך.`);
    return [];
  }
  const out = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const ev = rawEvents[i];
    if (!isPlainObject(ev)) {
      errors.push(`פריט #${i + 1} ב-${label} חייב להיות אובייקט.`);
      continue;
    }
    const rawTag = sanitizeGedcomInline(ev.tag || '').toUpperCase();
    const validTag = familyMode
      ? Boolean(FAM_EVENT_TAGS[rawTag]) || (rawTag.startsWith('_') && isValidGedcomTagName(rawTag))
      : isValidGedcomTagName(rawTag);
    if (!validTag) {
      errors.push(`תגית GEDCOM לא תקינה ב-${label}: "${ev.tag || ''}"`);
      continue;
    }
    const item = { tag: rawTag };
    const inlineKeys = familyMode
      ? ['familyId', 'partnerId', 'partnerName', 'type', 'place', 'detail', 'cause', 'agency']
      : ['type', 'place', 'detail', 'cause', 'agency', 'age', 'religion', 'phone', 'email', 'www'];
    for (const k of inlineKeys) {
      if (ev[k] !== undefined && ev[k] !== null) {
        if (typeof ev[k] !== 'string') {
          errors.push(`השדה ${k} בתגית ${rawTag} חייב להיות מחרוזת.`);
        } else {
          const val = sanitizeGedcomInline(ev[k]);
          if (val) item[k] = val;
        }
      }
    }
    if (familyMode && item.familyId) {
      if (!/^@[^@\s]+@$/.test(item.familyId)) {
        errors.push(`מזהה משפחה לא תקין ב-${label}: "${item.familyId}"`);
      } else if (resolvedData && !resolvedData.families?.[item.familyId]) {
        errors.push(`משפחה ${item.familyId} אינה קיימת בקובץ.`);
      }
    }
    if (familyMode && item.partnerId) {
      if (!/^@[^@\s]+@$/.test(item.partnerId)) {
        errors.push(`מזהה בן/בת זוג לא תקין ב-${label}: "${item.partnerId}"`);
      } else if (resolvedData && !resolvedData.people?.[item.partnerId]) {
        errors.push(`בן/בת זוג ${item.partnerId} אינו קיים בקובץ.`);
      }
    }
    if (ev.date !== undefined && ev.date !== null) {
      if (typeof ev.date !== 'string') {
        errors.push(`תאריך בתגית ${rawTag} חייב להיות מחרוזת.`);
      } else {
        const formatted = sanitizeGedcomInline(formatToGedcomDate(ev.date));
        if (formatted) item.date = formatted;
      }
    }
    if (ev.address !== undefined && ev.address !== null) {
      if (typeof ev.address !== 'string') {
        errors.push(`כתובת בתגית ${rawTag} חייבת להיות מחרוזת.`);
      } else {
        const addr = sanitizeGedcomMultiline(ev.address);
        if (addr) item.address = addr;
      }
    }
    if (ev.note !== undefined && ev.note !== null) {
      if (typeof ev.note !== 'string') {
        errors.push(`הערה בתגית ${rawTag} חייבת להיות מחרוזת.`);
      } else {
        const note = sanitizeGedcomMultiline(ev.note);
        if (note) item.note = note;
      }
    }
    const hasContent = Boolean(
      item.type || item.date || item.place || item.detail || item.cause ||
      item.address || item.agency || item.age || item.religion ||
      item.phone || item.email || item.www || item.note,
    );
    if (!hasContent) {
      errors.push(`אירוע ${rawTag} חייב לכלול לפחות ערך, תאריך, מקום או הערה.`);
      continue;
    }
    out.push(item);
  }
  return out;
}

function validateStructuredAttributes(rawAttrs, errors, { label = 'attributes' } = {}) {
  if (!Array.isArray(rawAttrs)) {
    errors.push(`השדה ${label} חייב להיות מערך.`);
    return [];
  }
  const out = [];
  for (let i = 0; i < rawAttrs.length; i++) {
    const attr = rawAttrs[i];
    if (!isPlainObject(attr)) {
      errors.push(`פריט #${i + 1} ב-${label} חייב להיות אובייקט.`);
      continue;
    }
    const rawTag = sanitizeGedcomInline(attr.tag || '').toUpperCase();
    if (!isValidGedcomTagName(rawTag)) {
      errors.push(`תגית GEDCOM לא תקינה ב-${label}: "${attr.tag || ''}"`);
      continue;
    }
    const item = { tag: rawTag };
    if (attr.value !== undefined && attr.value !== null) {
      if (typeof attr.value !== 'string') {
        errors.push(`השדה value בתגית ${rawTag} חייב להיות מחרוזת.`);
      } else {
        const v = rawTag === 'ADDR'
          ? sanitizeGedcomMultiline(attr.value)
          : sanitizeGedcomInline(attr.value);
        if (v) item.value = v;
      }
    }
    for (const k of ['type', 'place']) {
      if (attr[k] !== undefined && attr[k] !== null) {
        if (typeof attr[k] !== 'string') {
          errors.push(`השדה ${k} בתגית ${rawTag} חייב להיות מחרוזת.`);
        } else {
          const val = sanitizeGedcomInline(attr[k]);
          if (val) item[k] = val;
        }
      }
    }
    if (attr.date !== undefined && attr.date !== null) {
      if (typeof attr.date !== 'string') {
        errors.push(`תאריך בתגית ${rawTag} חייב להיות מחרוזת.`);
      } else {
        const formatted = sanitizeGedcomInline(formatToGedcomDate(attr.date));
        if (formatted) item.date = formatted;
      }
    }
    if (attr.note !== undefined && attr.note !== null) {
      if (typeof attr.note !== 'string') {
        errors.push(`הערה בתגית ${rawTag} חייבת להיות מחרוזת.`);
      } else {
        const note = sanitizeGedcomMultiline(attr.note);
        if (note) item.note = note;
      }
    }
    if (!item.value && !item.type && !item.date && !item.place && !item.note) {
      errors.push(`תגית ${rawTag} חייבת לכלול לפחות ערך, סוג, תאריך או מקום.`);
      continue;
    }
    out.push(item);
  }
  return out;
}

function validatePersonFieldBlock(input, currentPerson, errors, diff, { isRelative = false, resolvedData = null } = {}) {
  const sanitized = {};

  // Alternate Names
  if (input.alternateNames !== undefined && input.alternateNames !== null) {
    if (typeof input.alternateNames === 'string') {
      const alt = sanitizeGedcomInline(input.alternateNames);
      sanitized.alternateNames = alt ? [alt] : [];
      if (diff) diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
    } else if (Array.isArray(input.alternateNames)) {
      const valid = input.alternateNames.every(a => typeof a === 'string');
      if (!valid) {
        errors.push('מערך alternateNames חייב להכיל מחרוזות בלבד.');
      } else {
        sanitized.alternateNames = input.alternateNames.map(sanitizeGedcomInline).filter(Boolean);
        if (diff) diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
      }
    } else {
      errors.push('השדה alternateNames חייב להיות מחרוזת או מערך מחרוזות.');
    }
  } else if (input.alternateName !== undefined && input.alternateName !== null) {
    if (typeof input.alternateName === 'string') {
      const alt = sanitizeGedcomInline(input.alternateName);
      sanitized.alternateNames = alt ? [alt] : [];
      if (diff) diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
    } else {
      errors.push('השדה alternateName חייב להיות מחרוזת.');
    }
  }

  // Inline string fields
  for (const field of PERSON_STRING_FIELDS) {
    if (input[field] !== undefined && input[field] !== null) {
      if (typeof input[field] !== 'string') {
        errors.push(`השדה ${field} חייב להיות מחרוזת.`);
      } else {
        let val = sanitizeGedcomInline(input[field]);
        if (SLASH_STRIP_FIELDS.has(field)) {
          val = val.replace(/\//g, '').trim();
        }
        sanitized[field] = val;
        if (diff) diff[field] = { old: currentPerson[field] || '', new: val };
      }
    }
  }

  // Multiline address
  if (input.address !== undefined && input.address !== null) {
    if (typeof input.address !== 'string') {
      errors.push('השדה address חייב להיות מחרוזת.');
    } else {
      const addr = sanitizeGedcomMultiline(input.address);
      sanitized.address = addr;
      if (diff) diff.address = { old: currentPerson.address || '', new: addr };
    }
  }

  // Sex
  if (input.sex !== undefined && input.sex !== null && input.sex !== '') {
    const s = String(input.sex).trim().toUpperCase();
    if (!['M', 'F', 'U'].includes(s)) {
      errors.push(`השדה sex חייב להיות M (זכר), F (נקבה) או U (לא ידוע). התקבל: "${input.sex}"`);
    } else {
      sanitized.sex = s;
      if (diff) diff.sex = { old: currentPerson.sex || 'U', new: s };
    }
  }

  // Dates
  const dateFields = isRelative
    ? [...SCALAR_DATE_KEYS, 'marriageDate', 'divorceDate', 'engagementDate']
    : SCALAR_DATE_KEYS;
  for (const field of dateFields) {
    if (input[field] !== undefined && input[field] !== null) {
      if (typeof input[field] !== 'string') {
        errors.push(`השדה ${field} חייב להיות מחרוזת תאריך.`);
      } else {
        const formatted = sanitizeGedcomInline(formatToGedcomDate(input[field]));
        sanitized[field] = formatted;
        if (diff) diff[field] = { old: currentPerson[field] || '', new: formatted };
      }
    }
  }

  // Relative union inline places/status
  if (isRelative) {
    for (const field of ['marriagePlace', 'divorcePlace', 'engagementPlace', 'relationshipStatus']) {
      if (input[field] !== undefined && input[field] !== null) {
        if (typeof input[field] !== 'string') {
          errors.push(`השדה ${field} חייב להיות מחרוזת.`);
        } else {
          sanitized[field] = sanitizeGedcomInline(input[field]);
        }
      }
    }
  }

  // Notes
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes === 'string') {
      const note = sanitizeGedcomMultiline(input.notes);
      sanitized.notes = note ? [note] : [];
      if (diff) diff.notes = { old: currentPerson.notes || [], new: sanitized.notes };
    } else if (Array.isArray(input.notes)) {
      const validStrings = input.notes.every(n => typeof n === 'string');
      if (!validStrings) {
        errors.push('מערך הערות (notes) חייב להכיל מחרוזות בלבד.');
      } else {
        sanitized.notes = input.notes.map(sanitizeGedcomMultiline).filter(Boolean);
        if (diff) diff.notes = { old: currentPerson.notes || [], new: sanitized.notes };
      }
    } else {
      errors.push('השדה notes חייב להיות מחרוזת או מערך מחרוזות.');
    }
  }

  // Structured events
  if (input.events !== undefined && input.events !== null) {
    const validatedEvents = validateStructuredEvents(input.events, errors, { familyMode: false, resolvedData });
    if (validatedEvents.length) {
      sanitized.events = validatedEvents;
      if (diff) diff.events = { old: [], new: validatedEvents };
    }
  }

  // Structured attributes (+ facts alias)
  const rawAttributes = [
    ...(Array.isArray(input.attributes) ? input.attributes : input.attributes !== undefined && input.attributes !== null ? [input.attributes] : []),
    ...(Array.isArray(input.facts) ? input.facts : input.facts !== undefined && input.facts !== null ? [input.facts] : []),
  ];
  if (input.attributes !== undefined && input.attributes !== null && !Array.isArray(input.attributes)) {
    errors.push('השדה attributes חייב להיות מערך.');
  } else if (input.facts !== undefined && input.facts !== null && !Array.isArray(input.facts)) {
    errors.push('השדה facts חייב להיות מערך.');
  } else if (rawAttributes.length > 0) {
    const validatedAttrs = validateStructuredAttributes(rawAttributes, errors, { label: 'attributes' });
    if (validatedAttrs.length) {
      sanitized.attributes = validatedAttrs;
      if (diff) diff.attributes = { old: [], new: validatedAttrs };
    }
  }

  // Structured customTags
  if (input.customTags !== undefined && input.customTags !== null) {
    const validatedCustom = validateStructuredAttributes(input.customTags, errors, { label: 'customTags' });
    if (validatedCustom.length) {
      sanitized.customTags = validatedCustom;
      if (diff) diff.customTags = { old: [], new: validatedCustom };
    }
  }

  return sanitized;
}

/**
 * Validates the schema of updates returned by AI or entered manually.
 * Returns { valid: boolean, errors: string[], sanitized: object, diff: object }
 */
export function validatePersonUpdates(updates, currentPerson = {}, { data = null, personId = null, rawGedcom = null } = {}) {
  const errors = [];
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return {
      valid: false,
      errors: ['התגובה שהתקבלה מה-AI אינה אובייקט JSON תקין.'],
      sanitized: null,
      diff: {}
    };
  }

  const allowedKeys = AI_ALLOWED_KEYS;
  const unknownKeys = Object.keys(updates).filter(k => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    errors.push(`התקבלו שדות לא מוכרים: ${unknownKeys.join(', ')}`);
  }

  let resolvedData = data;
  if (!resolvedData && rawGedcom) {
    try {
      resolvedData = parseGedcom(rawGedcom);
    } catch {
      resolvedData = null;
    }
  }

  const diff = {};
  const sanitized = validatePersonFieldBlock(updates, currentPerson, errors, diff, {
    isRelative: false,
    resolvedData,
  });

  // Validate standalone familyEvents
  if (updates.familyEvents !== undefined && updates.familyEvents !== null) {
    const validatedFamEvents = validateStructuredEvents(updates.familyEvents, errors, {
      familyMode: true,
      resolvedData,
      label: 'familyEvents',
    });
    if (validatedFamEvents.length) {
      sanitized.familyEvents = validatedFamEvents;
      diff.familyEvents = { old: [], new: validatedFamEvents };
    }
  }

  // Validate relatives (+ addRelatives alias)
  const hasRelatives = updates.relatives !== undefined && updates.relatives !== null;
  const hasAddRelatives = updates.addRelatives !== undefined && updates.addRelatives !== null;
  if (hasRelatives && !Array.isArray(updates.relatives)) {
    errors.push('השדה relatives חייב להיות מערך.');
  }
  if (hasAddRelatives && !Array.isArray(updates.addRelatives)) {
    errors.push('השדה addRelatives חייב להיות מערך.');
  }
  const combinedRelatives = [
    ...(Array.isArray(updates.relatives) ? updates.relatives : []),
    ...(Array.isArray(updates.addRelatives) ? updates.addRelatives : []),
  ];

  if (combinedRelatives.length > 0) {
    const validatedRelatives = [];
    for (let i = 0; i < combinedRelatives.length; i++) {
      const rel = combinedRelatives[i];
      if (!isPlainObject(rel)) {
        errors.push(`בן משפחה #${i + 1} חייב להיות אובייקט.`);
        continue;
      }
      const relUnknown = Object.keys(rel).filter(k => !RELATIVE_ALLOWED_KEYS.has(k));
      if (relUnknown.length > 0) {
        errors.push(`שדות לא מוכרים בבן משפחה #${i + 1}: ${relUnknown.join(', ')}`);
      }

      const canonicalRelation = normalizeRelationType(rel.relation);
      if (!canonicalRelation) {
        errors.push(`סוג קרבה לא מוכר עבור בן משפחה #${i + 1}: "${rel.relation || ''}"`);
        continue;
      }

      const sanRel = validatePersonFieldBlock(rel, {}, errors, null, {
        isRelative: true,
        resolvedData,
      });
      sanRel.relation = canonicalRelation;

      if (rel.pedigree !== undefined && rel.pedigree !== null && String(rel.pedigree).trim() !== '') {
        const ped = sanitizeGedcomInline(rel.pedigree).toLowerCase();
        if (!PEDIGREE_TYPES.includes(ped)) {
          errors.push(`סוג שיוך הורי (pedigree) לא תקין: "${rel.pedigree}"`);
        } else {
          sanRel.pedigree = ped;
        }
      }

      const existingId = rel.existingPersonId != null ? sanitizeGedcomInline(rel.existingPersonId) : '';
      if (existingId) {
        if (!/^@[^@\s]+@$/.test(existingId)) {
          errors.push(`מזהה אדם קיים לא תקין: "${existingId}"`);
        } else if (personId && existingId === personId.trim()) {
          errors.push('לא ניתן לקשר אדם אל עצמו כבן משפחה.');
        } else if (resolvedData && !resolvedData.people?.[existingId]) {
          errors.push(`האדם הקיים ${existingId} אינו נמצא בקובץ.`);
        } else if (resolvedData && personId) {
          const cat = relationCategory(canonicalRelation);
          if (cat === 'parent' && isDescendantInData(resolvedData, personId, existingId)) {
            errors.push('לא ניתן לקשר צאצא כהורה (יוצר קשר מעגלי באילן).');
          } else if (cat === 'child' && isAncestorInData(resolvedData, personId, existingId)) {
            errors.push('לא ניתן לקשר הורה או אב קדמון כילד (יוצר קשר מעגלי באילן).');
          } else if (cat === 'sibling' && (isAncestorInData(resolvedData, personId, existingId) || isDescendantInData(resolvedData, personId, existingId))) {
            errors.push('לא ניתן לקשר הורה, אב קדמון או צאצא כאח/ות (יוצר קשר מעגלי באילן).');
          }
        }
        sanRel.existingPersonId = existingId;
      } else {
        if (!sanRel.givenName && !sanRel.surname && typeof rel.name === 'string' && rel.name.trim()) {
          const split = splitNameString(rel.name);
          if (split.givenName) sanRel.givenName = split.givenName.replace(/\//g, '').trim();
          if (split.surname) sanRel.surname = split.surname.replace(/\//g, '').trim();
        }
        if (!sanRel.givenName && !sanRel.surname) {
          errors.push('יש להזין לפחות שם פרטי או שם משפחה עבור בן המשפחה.');
        }
        if (!sanRel.sex) {
          sanRel.sex = inferSexFromRelation(canonicalRelation);
        }
      }

      for (const idField of ['targetFamilyId', 'otherParentId', 'halfParentId']) {
        if (rel[idField] !== undefined && rel[idField] !== null && String(rel[idField]).trim() !== '') {
          const refId = sanitizeGedcomInline(rel[idField]);
          if (!/^@[^@\s]+@$/.test(refId)) {
            errors.push(`מזהה לא תקין בשדה ${idField}: "${refId}"`);
          } else if (resolvedData) {
            if (idField === 'targetFamilyId' && !resolvedData.families?.[refId]) {
              errors.push(`המשפחה ${refId} אינה קיימת בקובץ.`);
            } else if (idField !== 'targetFamilyId' && !resolvedData.people?.[refId]) {
              errors.push(`האדם ${refId} בשדה ${idField} אינו קיים בקובץ.`);
            }
          }
          sanRel[idField] = refId;
        }
      }

      if (rel.otherParentName !== undefined && rel.otherParentName !== null) {
        const opn = sanitizeGedcomInline(rel.otherParentName);
        if (opn) sanRel.otherParentName = opn;
      }
      if (rel.createNewFamily !== undefined) {
        sanRel.createNewFamily = Boolean(rel.createNewFamily);
      }

      if (rel.familyEvents !== undefined && rel.familyEvents !== null) {
        const validatedRelFamEvents = validateStructuredEvents(rel.familyEvents, errors, {
          familyMode: true,
          resolvedData,
          label: `relatives[${i}].familyEvents`,
        });
        if (validatedRelFamEvents.length) sanRel.familyEvents = validatedRelFamEvents;
      }

      validatedRelatives.push(sanRel);
    }

    if (validatedRelatives.length > 0) {
      sanitized.relatives = validatedRelatives;
      diff.relatives = { old: [], new: validatedRelatives };
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null,
    diff
  };
}

function findRecordRangeByTag(rawGedcom, recordId, recordTag) {
  const trimmedId = String(recordId || '').trim();
  if (!trimmedId) return null;
  const escapedId = trimmedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\r?\\n)(0\\s+${escapedId}\\s+${recordTag}(?:\\s+[^\\r\\n]*)?(?:\\r?\\n|$))`, 'i');
  const match = rawGedcom.match(regex);
  if (!match) return null;

  const startIndex = match.index + match[1].length;
  const afterMatch = startIndex + match[2].length;

  const nextZeroMatch = rawGedcom.slice(afterMatch).match(/(^|\r?\n)0\s+([A-Za-z0-9_@]+)/);
  const endIndex = nextZeroMatch
    ? afterMatch + nextZeroMatch.index + (nextZeroMatch[1] ? nextZeroMatch[1].length : 0)
    : rawGedcom.length;

  return {
    startIndex,
    endIndex,
    rawBlock: rawGedcom.slice(startIndex, endIndex),
  };
}

/**
 * Extracts the start and end character indexes of an INDI record block in a raw GEDCOM string.
 */
export function findPersonRecordRange(rawGedcom, personId) {
  return findRecordRangeByTag(rawGedcom, personId, 'INDI');
}

/**
 * Extracts the start and end character indexes of a FAM record block in a raw GEDCOM string.
 */
export function findFamilyRecordRange(rawGedcom, familyId) {
  return findRecordRangeByTag(rawGedcom, familyId, 'FAM');
}

function serializeChildren(children, out) {
  for (const child of children || []) {
    out.push(child.raw);
    if (child.children?.length) serializeChildren(child.children, out);
  }
}

function parseTopNodes(lines) {
  const subNodes = [];
  let currentTop = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\d+)\s+([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) continue;
    const level = parseInt(match[1], 10);
    const tag = match[2].toUpperCase();
    const val = match[3] || '';

    if (level === 1) {
      currentTop = { tag, val, raw: line, children: [] };
      subNodes.push(currentTop);
    } else if (level > 1 && currentTop) {
      currentTop.children.push({ level, tag, val, raw: line });
    }
  }
  return subNodes;
}

function removeLevel2Child(children, targetTag) {
  const out = [];
  let skipping = false;
  for (const child of children) {
    if (child.level === 2) {
      skipping = child.tag === targetTag;
      if (!skipping) out.push(child);
    } else if (!skipping) {
      out.push(child);
    }
  }
  return out;
}

function setLevel2Child(node, childTag, value, { multiline = false } = {}) {
  const cleanVal = multiline ? sanitizeGedcomMultiline(value) : sanitizeGedcomInline(value);
  if (multiline) {
    node.children = removeLevel2Child(node.children, childTag);
    if (cleanVal) {
      node.children.push(createMultilineNode(childTag, cleanVal, 2));
    }
    return;
  }
  let existing = node.children.find(c => c.level === 2 && c.tag === childTag);
  if (cleanVal) {
    if (!existing) {
      node.children.push({ level: 2, tag: childTag, val: cleanVal, raw: `2 ${childTag} ${cleanVal}` });
    } else {
      existing.val = cleanVal;
      existing.raw = `2 ${childTag} ${cleanVal}`;
    }
  } else if (existing) {
    node.children = removeLevel2Child(node.children, childTag);
  }
}

function upsertNameSubtag(nameNode, tag, val) {
  if (!val) return;
  const existing = nameNode.children.find(c => c.level === 2 && c.tag === tag);
  if (existing) {
    existing.val = val;
    existing.raw = `2 ${tag} ${val}`;
  } else {
    nameNode.children.push({ level: 2, tag, val, raw: `2 ${tag} ${val}` });
  }
}

function buildTypedEventNode(ev) {
  const detail = ev.detail ? sanitizeGedcomInline(ev.detail) : '';
  const node = {
    tag: ev.tag,
    val: detail,
    raw: detail ? `1 ${ev.tag} ${detail}` : `1 ${ev.tag}`,
    children: [],
  };
  if (ev.type) setLevel2Child(node, 'TYPE', ev.type);
  if (ev.date) setLevel2Child(node, 'DATE', ev.date);
  if (ev.place) setLevel2Child(node, 'PLAC', ev.place);
  if (ev.cause) setLevel2Child(node, 'CAUS', ev.cause);
  if (ev.address) setLevel2Child(node, 'ADDR', ev.address, { multiline: true });
  if (ev.agency) setLevel2Child(node, 'AGNC', ev.agency);
  if (ev.age) setLevel2Child(node, 'AGE', ev.age);
  if (ev.religion) setLevel2Child(node, 'RELI', ev.religion);
  if (ev.phone) setLevel2Child(node, 'PHON', ev.phone);
  if (ev.email) setLevel2Child(node, 'EMAIL', ev.email);
  if (ev.www) setLevel2Child(node, 'WWW', ev.www);
  if (ev.note) node.children.push(createNoteNode(ev.note, 2));
  return node;
}

function eventNodeMatches(node, ev) {
  if (node.tag !== ev.tag) return false;
  const getSub = t => node.children.find(c => c.level === 2 && c.tag === t)?.val || '';
  return (
    (node.val || '') === (ev.detail || '') &&
    getSub('TYPE') === (ev.type || '') &&
    getSub('DATE') === (ev.date || '') &&
    getSub('PLAC') === (ev.place || '') &&
    getSub('CAUS') === (ev.cause || '')
  );
}

function applyStructuredEventToNodes(subNodes, ev, singletonSet) {
  let target = singletonSet.has(ev.tag) ? subNodes.find(n => n.tag === ev.tag) : null;
  if (target) {
    if (ev.detail !== undefined) {
      const cleanDetail = sanitizeGedcomInline(ev.detail);
      target.val = cleanDetail;
      target.raw = cleanDetail ? `1 ${ev.tag} ${cleanDetail}` : `1 ${ev.tag}`;
    }
    if (ev.type !== undefined) setLevel2Child(target, 'TYPE', ev.type);
    if (ev.date !== undefined) setLevel2Child(target, 'DATE', ev.date);
    if (ev.place !== undefined) setLevel2Child(target, 'PLAC', ev.place);
    if (ev.cause !== undefined) setLevel2Child(target, 'CAUS', ev.cause);
    if (ev.address !== undefined) setLevel2Child(target, 'ADDR', ev.address, { multiline: true });
    if (ev.agency !== undefined) setLevel2Child(target, 'AGNC', ev.agency);
    if (ev.age !== undefined) setLevel2Child(target, 'AGE', ev.age);
    if (ev.religion !== undefined) setLevel2Child(target, 'RELI', ev.religion);
    if (ev.phone !== undefined) setLevel2Child(target, 'PHON', ev.phone);
    if (ev.email !== undefined) setLevel2Child(target, 'EMAIL', ev.email);
    if (ev.www !== undefined) setLevel2Child(target, 'WWW', ev.www);
    if (ev.note) {
      const noteNode = createNoteNode(ev.note, 2);
      if (noteNode.val && !target.children.some(c => c.level === 2 && c.tag === 'NOTE' && c.val === noteNode.val)) {
        target.children.push(noteNode);
      }
    }
    return;
  }

  if (!subNodes.some(n => eventNodeMatches(n, ev))) {
    subNodes.push(buildTypedEventNode(ev));
  }
}

const SECONDARY_NAME_TYPES = ['aka', 'birth', 'maiden', 'married', 'married name', 'marriedname', 'nick', 'nickname'];

function findPrimaryNameNode(subNodes) {
  return subNodes.find(
    n => n.tag === 'NAME' && !SECONDARY_NAME_TYPES.includes(
      (n.children.find(c => c.level === 2 && c.tag === 'TYPE')?.val || '').toLowerCase(),
    ),
  ) || subNodes.find(n => n.tag === 'NAME');
}

/**
 * Updates a person's INDI block with validated changes while preserving family links (FAMS, FAMC),
 * existing citations, and other unaffected tags.
 */
export function updatePersonRecord(rawBlock, updates, personId) {
  const lines = rawBlock.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return rawBlock;

  const rootLine = lines[0];
  const subNodes = parseTopNodes(lines);

  // Update primary NAME / GIVN / SURN / NICK / NPFX / SPFX / NSFX
  const hasPrimaryNameEdit =
    updates.givenName !== undefined ||
    updates.surname !== undefined ||
    updates.nickname !== undefined ||
    updates.namePrefix !== undefined ||
    updates.surnamePrefix !== undefined ||
    updates.nameSuffix !== undefined;

  if (hasPrimaryNameEdit) {
    let nameNode = findPrimaryNameNode(subNodes);
    const parsedName = (nameNode?.val || '').match(/^([^/]*)\/([^/]*)\//);
    const fallbackGiven = parsedName ? parsedName[1].trim() : (nameNode?.val || '').replace(/\//g, '').trim();
    const fallbackSurn = parsedName ? parsedName[2].trim() : '';
    const existingGiven = nameNode?.children.find(c => c.level === 2 && c.tag === 'GIVN')?.val || fallbackGiven;
    const existingSurn = nameNode?.children.find(c => c.level === 2 && c.tag === 'SURN')?.val || fallbackSurn;
    const existingNick = nameNode?.children.find(c => c.level === 2 && c.tag === 'NICK')?.val || '';
    const existingNpfx = nameNode?.children.find(c => c.level === 2 && c.tag === 'NPFX')?.val || '';
    const existingSpfx = nameNode?.children.find(c => c.level === 2 && c.tag === 'SPFX')?.val || '';
    const existingNsfx = nameNode?.children.find(c => c.level === 2 && c.tag === 'NSFX')?.val || '';

    const newGiven = (updates.givenName !== undefined ? sanitizeGedcomInline(updates.givenName) : existingGiven).replace(/\//g, '').trim();
    const newSurn = (updates.surname !== undefined ? sanitizeGedcomInline(updates.surname) : existingSurn).replace(/\//g, '').trim();
    const newNick = updates.nickname !== undefined ? sanitizeGedcomInline(updates.nickname) : existingNick;
    const newNpfx = updates.namePrefix !== undefined ? sanitizeGedcomInline(updates.namePrefix) : existingNpfx;
    const newSpfx = updates.surnamePrefix !== undefined ? sanitizeGedcomInline(updates.surnamePrefix) : existingSpfx;
    const newNsfx = updates.nameSuffix !== undefined ? sanitizeGedcomInline(updates.nameSuffix) : existingNsfx;

    const fullGedName = (newNpfx || newSpfx || newNsfx)
      ? [newNpfx, newGiven, newSpfx, `/${newSurn}/`, newNsfx].filter(Boolean).join(' ').trim()
      : `${newGiven} /${newSurn}/`.trim();

    if (!nameNode) {
      nameNode = { tag: 'NAME', val: fullGedName, raw: `1 NAME ${fullGedName}`, children: [] };
      subNodes.unshift(nameNode);
    } else {
      nameNode.val = fullGedName;
      nameNode.raw = `1 NAME ${fullGedName}`;
    }

    upsertNameSubtag(nameNode, 'GIVN', newGiven);
    upsertNameSubtag(nameNode, 'SURN', newSurn);
    upsertNameSubtag(nameNode, 'NICK', newNick);
    upsertNameSubtag(nameNode, 'NPFX', newNpfx);
    upsertNameSubtag(nameNode, 'SPFX', newSpfx);
    upsertNameSubtag(nameNode, 'NSFX', newNsfx);
  }

  // Birth / Maiden surname (1 NAME ... / 2 TYPE birth)
  const birthSurnameVal = updates.birthSurname ?? updates.maidenName;
  if (birthSurnameVal !== undefined) {
    const cleanBirthSurn = sanitizeGedcomInline(birthSurnameVal).replace(/\//g, '').trim();
    if (cleanBirthSurn) {
      const primaryName = findPrimaryNameNode(subNodes);
      const primaryGiven = primaryName?.children.find(c => c.level === 2 && c.tag === 'GIVN')?.val ||
        (primaryName?.val || '').match(/^([^/]*)\//)?.[1]?.trim() || '';
      const val = primaryGiven ? `${primaryGiven} /${cleanBirthSurn}/` : `/${cleanBirthSurn}/`;
      let birthNameNode = subNodes.find(n => n.tag === 'NAME' && ['birth', 'maiden', 'birth name', 'birthname'].includes(
        (n.children.find(c => c.level === 2 && c.tag === 'TYPE')?.val || '').toLowerCase(),
      ));
      if (!birthNameNode) {
        birthNameNode = {
          tag: 'NAME',
          val,
          raw: `1 NAME ${val}`,
          children: [{ level: 2, tag: 'TYPE', val: 'birth', raw: '2 TYPE birth' }],
        };
        if (primaryGiven) birthNameNode.children.push({ level: 2, tag: 'GIVN', val: primaryGiven, raw: `2 GIVN ${primaryGiven}` });
        birthNameNode.children.push({ level: 2, tag: 'SURN', val: cleanBirthSurn, raw: `2 SURN ${cleanBirthSurn}` });
        subNodes.push(birthNameNode);
      } else {
        birthNameNode.val = val;
        birthNameNode.raw = `1 NAME ${val}`;
        upsertNameSubtag(birthNameNode, 'SURN', cleanBirthSurn);
      }
    }
  }

  // Married surname (1 NAME ... / 2 TYPE married)
  if (updates.marriedSurname !== undefined) {
    const cleanMarriedSurn = sanitizeGedcomInline(updates.marriedSurname).replace(/\//g, '').trim();
    if (cleanMarriedSurn) {
      const primaryName = findPrimaryNameNode(subNodes);
      const primaryGiven = primaryName?.children.find(c => c.level === 2 && c.tag === 'GIVN')?.val ||
        (primaryName?.val || '').match(/^([^/]*)\//)?.[1]?.trim() || '';
      const val = primaryGiven ? `${primaryGiven} /${cleanMarriedSurn}/` : `/${cleanMarriedSurn}/`;
      let marriedNameNode = subNodes.find(n => n.tag === 'NAME' && ['married', 'married name', 'marriedname'].includes(
        (n.children.find(c => c.level === 2 && c.tag === 'TYPE')?.val || '').toLowerCase(),
      ));
      if (!marriedNameNode) {
        marriedNameNode = {
          tag: 'NAME',
          val,
          raw: `1 NAME ${val}`,
          children: [{ level: 2, tag: 'TYPE', val: 'married', raw: '2 TYPE married' }],
        };
        if (primaryGiven) marriedNameNode.children.push({ level: 2, tag: 'GIVN', val: primaryGiven, raw: `2 GIVN ${primaryGiven}` });
        marriedNameNode.children.push({ level: 2, tag: 'SURN', val: cleanMarriedSurn, raw: `2 SURN ${cleanMarriedSurn}` });
        subNodes.push(marriedNameNode);
      } else {
        marriedNameNode.val = val;
        marriedNameNode.raw = `1 NAME ${val}`;
        upsertNameSubtag(marriedNameNode, 'SURN', cleanMarriedSurn);
      }
    }
  }

  // Update alternateNames (1 NAME ... / 2 TYPE aka)
  if (updates.alternateNames !== undefined && Array.isArray(updates.alternateNames)) {
    for (const alt of updates.alternateNames) {
      if (!alt) continue;
      const cleanAlt = sanitizeGedcomInline(alt);
      if (!cleanAlt) continue;

      const altNameGed = cleanAlt.includes('/') ? cleanAlt : `${cleanAlt}`;
      const existingNameNode = subNodes.find(
        n => n.tag === 'NAME' && (n.val === altNameGed || n.val?.replace(/\//g, '').trim() === cleanAlt.replace(/\//g, '').trim()),
      );
      if (!existingNameNode) {
        subNodes.push({
          tag: 'NAME',
          val: altNameGed,
          raw: `1 NAME ${altNameGed}`,
          children: [{ level: 2, tag: 'TYPE', val: 'aka', raw: '2 TYPE aka' }]
        });
      }
    }
  }

  // Update SEX
  if (updates.sex !== undefined) {
    let sexNode = subNodes.find(n => n.tag === 'SEX');
    if (!sexNode) {
      sexNode = { tag: 'SEX', val: updates.sex, raw: `1 SEX ${updates.sex}`, children: [] };
      subNodes.push(sexNode);
    } else {
      sexNode.val = updates.sex;
      sexNode.raw = `1 SEX ${updates.sex}`;
    }
  }

  // Helper for single text / multiline attribute tags (OCCU, EDUC, TITL, RELI, NATI, DSCR, IDNO, CAST, PROP, SSN, NCHI, NMR, PHON, EMAIL, WWW, FAX, ADDR, REFN, RIN, UID, EXID, AFN, RFN, RESN, ALIA)
  const updateAttributeNode = (tag, val, { multiline = false } = {}) => {
    const cleanVal = multiline ? sanitizeGedcomMultiline(val) : sanitizeGedcomInline(val);
    let node = subNodes.find(n => n.tag === tag);
    if (cleanVal) {
      if (multiline && cleanVal.includes('\n')) {
        const multiNode = createMultilineNode(tag, cleanVal, 1);
        if (!node) {
          subNodes.push(multiNode);
        } else {
          node.val = multiNode.val;
          node.raw = multiNode.raw;
          const preserved = node.children.filter(c => c.tag !== 'CONT');
          node.children = [...multiNode.children, ...preserved];
        }
      } else if (!node) {
        subNodes.push({ tag, val: cleanVal, raw: `1 ${tag} ${cleanVal}`, children: [] });
      } else {
        node.val = cleanVal;
        node.raw = `1 ${tag} ${cleanVal}`;
        if (multiline) node.children = node.children.filter(c => c.tag !== 'CONT');
      }
    } else if (node) {
      const idx = subNodes.indexOf(node);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  };

  for (const def of SCALAR_ATTRIBUTE_DEFINITIONS) {
    if (updates[def.fieldKey] !== undefined) {
      updateAttributeNode(def.tag, updates[def.fieldKey], { multiline: def.multiline });
    }
  }

  // Helper to update scalar Event node (matches ONLY level-2 DATE/PLAC/CAUS so 2 SOUR / 3 DATE citations remain intact)
  const updateEventNode = (tag, dateVal, placeVal, extraTag, extraVal) => {
    const cleanDate = dateVal !== undefined ? sanitizeGedcomInline(dateVal) : undefined;
    const cleanPlace = placeVal !== undefined ? sanitizeGedcomInline(placeVal) : undefined;
    const cleanExtra = extraVal !== undefined ? sanitizeGedcomInline(extraVal) : undefined;
    let node = subNodes.find(n => n.tag === tag);
    const hasInfo = Boolean(cleanDate || cleanPlace || cleanExtra);
    if (!node && !hasInfo) return;

    if (!node) {
      node = { tag, val: '', raw: `1 ${tag}`, children: [] };
      subNodes.push(node);
    }

    if (cleanDate !== undefined) setLevel2Child(node, 'DATE', cleanDate);
    if (cleanPlace !== undefined) setLevel2Child(node, 'PLAC', cleanPlace);
    if (extraTag && cleanExtra !== undefined) setLevel2Child(node, extraTag, cleanExtra);

    if (!node.val && node.children.length === 0) {
      const idx = subNodes.indexOf(node);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  };

  for (const def of SCALAR_EVENT_DEFINITIONS) {
    const d = updates[`${def.prefix}Date`];
    const p = updates[`${def.prefix}Place`];
    const extra = def.hasCause ? updates.deathCause : undefined;
    if (d !== undefined || p !== undefined || extra !== undefined) {
      updateEventNode(def.tag, d, p, def.hasCause ? 'CAUS' : null, extra);
    }
  }

  // Structured events[] (supports ALL GEDCOM event tags + multiple occurrences + custom events)
  if (Array.isArray(updates.events)) {
    for (const ev of updates.events) {
      applyStructuredEventToNodes(subNodes, ev, SINGLETON_EVENT_TAGS);
    }
  }

  // Structured attributes[] and customTags[]
  for (const list of [updates.attributes, updates.customTags]) {
    if (!Array.isArray(list)) continue;
    for (const attr of list) {
      const cleanVal = attr.tag === 'ADDR' && attr.value
        ? sanitizeGedcomMultiline(attr.value)
        : attr.value ? sanitizeGedcomInline(attr.value) : '';
      const baseNode = (attr.tag === 'ADDR' && cleanVal.includes('\n'))
        ? createMultilineNode(attr.tag, cleanVal, 1)
        : {
            tag: attr.tag,
            val: cleanVal,
            raw: cleanVal ? `1 ${attr.tag} ${cleanVal}` : `1 ${attr.tag}`,
            children: [],
          };
      if (attr.type) setLevel2Child(baseNode, 'TYPE', attr.type);
      if (attr.date) setLevel2Child(baseNode, 'DATE', attr.date);
      if (attr.place) setLevel2Child(baseNode, 'PLAC', attr.place);
      if (attr.note) baseNode.children.push(createNoteNode(attr.note, 2));

      const exists = subNodes.some(n => {
        if (n.tag !== baseNode.tag || (n.val || '') !== (baseNode.val || '')) return false;
        const getSub = t => n.children.find(c => c.level === 2 && c.tag === t)?.val || '';
        return (
          getSub('TYPE') === (attr.type || '') &&
          getSub('DATE') === (attr.date || '') &&
          getSub('PLAC') === (attr.place || '')
        );
      });
      if (!exists) subNodes.push(baseNode);
    }
  }

  // Update NOTE
  if (updates.notes !== undefined && Array.isArray(updates.notes)) {
    for (const noteText of updates.notes) {
      if (!noteText) continue;
      const noteNode = createNoteNode(noteText, 1);
      if (!noteNode.val) continue;
      const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === noteNode.val);
      if (!exists) {
        subNodes.push(noteNode);
      }
    }
  }

  // Update source as a dedicated NOTE (מקור)
  if (updates.source !== undefined && updates.source) {
    const cleanSource = sanitizeGedcomInline(updates.source);
    if (cleanSource) {
      const sourceNote = cleanSource.startsWith('מקור:') || cleanSource.startsWith('מקור :')
        ? cleanSource
        : `מקור: ${cleanSource}`;
      const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === sourceNote);
      if (!exists) {
        subNodes.push(createNoteNode(sourceNote, 1));
      }
    }
  }

  // Rebuild lines
  const outputLines = [rootLine];
  for (const node of subNodes) {
    outputLines.push(node.raw);
    serializeChildren(node.children, outputLines);
  }

  return outputLines.join('\n');
}

function detectEol(rawGedcom) {
  return rawGedcom.includes('\r\n') ? '\r\n' : '\n';
}

function replaceRecordRange(rawGedcom, range, updatedBlock) {
  const eol = detectEol(rawGedcom);
  const normalizedBlock = updatedBlock.replace(/\r?\n/g, eol);
  const after = rawGedcom.slice(range.endIndex);
  const needsLeadingEol = after.length > 0 && !/^\r?\n/.test(after);
  return rawGedcom.slice(0, range.startIndex) + normalizedBlock + (needsLeadingEol ? eol : '') + after;
}

export function allocateNextXref(rawGedcom, prefix) {
  const used = new Set();
  for (const m of rawGedcom.matchAll(/(?:^|\r?\n)0\s+(@[^@]+@)\s+[A-Za-z0-9_]+/g)) {
    used.add(m[1].toUpperCase());
  }
  const numRegex = new RegExp(`^@${prefix}(\\d+)@$`, 'i');
  let maxNum = 0;
  for (const xref of used) {
    const m = xref.match(numRegex);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  let candidateNum = maxNum + 1;
  while (used.has(`@${prefix}${candidateNum}@`.toUpperCase())) {
    candidateNum++;
  }
  return `@${prefix}${candidateNum}@`;
}

function insertRecordsBeforeTrailer(rawGedcom, blocks) {
  const validBlocks = blocks.filter(Boolean);
  if (!validBlocks.length) return rawGedcom;
  const eol = detectEol(rawGedcom);
  const joined = validBlocks.map(b => b.replace(/\r?\n/g, eol)).join(eol);
  const trlrMatch = rawGedcom.match(/(^|\r?\n)(0\s+TRLR(?:\s+[^\r\n]*)?\s*)$/i);
  if (trlrMatch) {
    const trlrStart = trlrMatch.index + trlrMatch[1].length;
    const prefix = rawGedcom.slice(0, trlrStart).replace(/(?:\r?\n)+$/, '');
    const suffix = rawGedcom.slice(trlrStart);
    return (prefix ? prefix + eol : '') + joined + eol + suffix;
  }
  const trimmed = rawGedcom.replace(/(?:\r?\n)+$/, '');
  return (trimmed ? trimmed + eol : '') + joined;
}

function listAllFamilyRecordsFromRaw(rawGedcom) {
  const fams = [];
  for (const m of rawGedcom.matchAll(/(?:^|\r?\n)0\s+(@[^@]+@)\s+FAM(?:\s+[^\r\n]*)?(?:\r?\n|$)/gi)) {
    const id = m[1];
    const range = findFamilyRecordRange(rawGedcom, id);
    if (!range) continue;
    const lines = range.rawBlock.split(/\r?\n/).filter(Boolean);
    const subNodes = parseTopNodes(lines);
    const partners = [];
    const children = [];
    let isDivorced = false;
    for (const node of subNodes) {
      if (['HUSB', 'WIFE', '_PART'].includes(node.tag) && node.val) partners.push(node.val.trim());
      else if (node.tag === 'CHIL' && node.val) children.push(node.val.trim());
      else if (node.tag === 'DIV') isDivorced = true;
    }
    fams.push({ id, range, subNodes, partners, children, isDivorced });
  }
  return fams;
}

function getPersonSexFromRaw(rawGedcom, personId) {
  const range = findPersonRecordRange(rawGedcom, personId);
  if (!range) return 'U';
  const match = range.rawBlock.match(/(?:^|\r?\n)1\s+SEX\s+([MFU])/i);
  return match ? match[1].toUpperCase() : 'U';
}

function getPersonNameFromRaw(rawGedcom, personId) {
  const range = findPersonRecordRange(rawGedcom, personId);
  if (!range) return '';
  const match = range.rawBlock.match(/(?:^|\r?\n)1\s+NAME\s+([^\r\n]+)/i);
  return match ? match[1].replace(/\//g, '').replace(/\s+/g, ' ').trim() : '';
}

function getPersonLinksFromRaw(rawGedcom, personId) {
  const range = findPersonRecordRange(rawGedcom, personId);
  const parentFamilies = [];
  const spouseFamilies = [];
  if (range) {
    const subNodes = parseTopNodes(range.rawBlock.split(/\r?\n/).filter(Boolean));
    for (const node of subNodes) {
      if (node.tag === 'FAMC' && node.val) {
        const pedi = (node.children.find(c => c.level === 2 && c.tag === 'PEDI')?.val || 'birth').toLowerCase();
        if (!parentFamilies.some(pf => pf.id === node.val.trim())) {
          parentFamilies.push({ id: node.val.trim(), type: pedi });
        }
      } else if (node.tag === 'FAMS' && node.val) {
        const fid = node.val.trim();
        if (!spouseFamilies.includes(fid)) spouseFamilies.push(fid);
      }
    }
  }
  // Also reconcile family-only links (HUSB/WIFE/_PART/CHIL inside FAM records)
  for (const fam of listAllFamilyRecordsFromRaw(rawGedcom)) {
    if (fam.partners.includes(personId) && !spouseFamilies.includes(fam.id)) {
      spouseFamilies.push(fam.id);
    }
    if (fam.children.includes(personId) && !parentFamilies.some(pf => pf.id === fam.id)) {
      parentFamilies.push({ id: fam.id, type: 'birth' });
    }
  }
  return { parentFamilies, spouseFamilies };
}

function choosePartnerTagForFamily(famBlock, sex) {
  const normSex = String(sex || 'U').toUpperCase();
  if (normSex === 'M') return 'HUSB';
  if (normSex === 'F') return 'WIFE';
  const hasHusb = /(?:^|\r?\n)1\s+HUSB\s+@/i.test(famBlock);
  if (!hasHusb) return 'HUSB';
  const hasWife = /(?:^|\r?\n)1\s+WIFE\s+@/i.test(famBlock);
  if (!hasWife) return 'WIFE';
  return '_PART';
}

function addLinkToPersonRecord(rawGedcom, personId, tag, familyId, pedigree = '') {
  const range = findPersonRecordRange(rawGedcom, personId);
  if (!range) {
    throw new Error(`רשומת האדם עם המזהה ${personId} לא נמצאה בקובץ ה-GEDCOM.`);
  }
  const lines = range.rawBlock.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rootLine = lines[0];
  const subNodes = parseTopNodes(lines);
  const existing = subNodes.find(n => n.tag === tag && n.val.trim() === familyId.trim());
  if (existing) {
    if (tag === 'FAMC' && pedigree && pedigree !== 'birth') {
      const hasPedi = existing.children.some(c => c.level === 2 && c.tag === 'PEDI');
      if (!hasPedi) {
        existing.children.push({ level: 2, tag: 'PEDI', val: pedigree, raw: `2 PEDI ${pedigree}` });
        const out = [rootLine];
        for (const node of subNodes) {
          out.push(node.raw);
          serializeChildren(node.children, out);
        }
        return replaceRecordRange(rawGedcom, range, out.join('\n'));
      }
    }
    return rawGedcom;
  }

  const newNode = {
    tag,
    val: familyId,
    raw: `1 ${tag} ${familyId}`,
    children: (tag === 'FAMC' && pedigree && pedigree !== 'birth')
      ? [{ level: 2, tag: 'PEDI', val: pedigree, raw: `2 PEDI ${pedigree}` }]
      : [],
  };
  subNodes.push(newNode);
  const outputLines = [rootLine];
  for (const node of subNodes) {
    outputLines.push(node.raw);
    serializeChildren(node.children, outputLines);
  }
  return replaceRecordRange(rawGedcom, range, outputLines.join('\n'));
}

export function updateFamilyRecord(rawBlock, { addPartners = [], addChildren = [], events = [], status = '' } = {}) {
  const lines = rawBlock.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return rawBlock;
  const rootLine = lines[0];
  const subNodes = parseTopNodes(lines);

  const memberExistsInFam = memberId =>
    subNodes.some(n => ['HUSB', 'WIFE', '_PART', 'CHIL'].includes(n.tag) && n.val.trim() === memberId.trim());

  for (const partner of addPartners) {
    const pid = typeof partner === 'string' ? partner : partner.id;
    const sex = typeof partner === 'string' ? 'U' : (partner.sex || 'U');
    if (!pid || memberExistsInFam(pid)) continue;
    const currentText = [rootLine, ...subNodes.map(n => n.raw)].join('\n');
    const tag = choosePartnerTagForFamily(currentText, sex);
    subNodes.push({ tag, val: pid, raw: `1 ${tag} ${pid}`, children: [] });
  }

  for (const childId of addChildren) {
    if (!childId || memberExistsInFam(childId)) continue;
    subNodes.push({ tag: 'CHIL', val: childId, raw: `1 CHIL ${childId}`, children: [] });
  }

  if (status) {
    const cleanStatus = sanitizeGedcomInline(status);
    if (cleanStatus) {
      const existingStat = subNodes.find(n => n.tag === '_STAT');
      if (existingStat) {
        existingStat.val = cleanStatus;
        existingStat.raw = `1 _STAT ${cleanStatus}`;
      } else {
        subNodes.push({ tag: '_STAT', val: cleanStatus, raw: `1 _STAT ${cleanStatus}`, children: [] });
      }
    }
  }

  for (const ev of events || []) {
    applyStructuredEventToNodes(subNodes, ev, SINGLETON_FAM_EVENT_TAGS);
  }

  const outputLines = [rootLine];
  for (const node of subNodes) {
    outputLines.push(node.raw);
    serializeChildren(node.children, outputLines);
  }
  return outputLines.join('\n');
}

function createPersonRecord(newId, relativeData) {
  return updatePersonRecord(`0 ${newId} INDI`, relativeData, newId);
}

function collectUnionEventsFromRelative(rel) {
  const events = [];
  if (rel.engagementDate || rel.engagementPlace) {
    events.push({
      tag: 'ENGA',
      ...(rel.engagementDate ? { date: rel.engagementDate } : {}),
      ...(rel.engagementPlace ? { place: rel.engagementPlace } : {}),
    });
  }
  if (rel.marriageDate || rel.marriagePlace) {
    events.push({
      tag: 'MARR',
      ...(rel.marriageDate ? { date: rel.marriageDate } : {}),
      ...(rel.marriagePlace ? { place: rel.marriagePlace } : {}),
    });
  }
  if (rel.divorceDate || rel.divorcePlace) {
    events.push({
      tag: 'DIV',
      ...(rel.divorceDate ? { date: rel.divorceDate } : {}),
      ...(rel.divorcePlace ? { place: rel.divorcePlace } : {}),
    });
  }
  if (Array.isArray(rel.familyEvents)) {
    events.push(...rel.familyEvents);
  }
  return events;
}

function extractRelativePersonUpdates(rel) {
  const excluded = new Set([
    'relation',
    'name',
    'existingPersonId',
    'pedigree',
    'targetFamilyId',
    'otherParentId',
    'otherParentName',
    'halfParentId',
    'createNewFamily',
    'marriageDate',
    'marriagePlace',
    'divorceDate',
    'divorcePlace',
    'engagementDate',
    'engagementPlace',
    'relationshipStatus',
    'familyEvents',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(rel)) {
    if (!excluded.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

function applyRelativeAddition(rawGedcom, focalPersonId, rel, report) {
  let nextRaw = rawGedcom;
  const canonicalRelation = normalizeRelationType(rel.relation) || rel.relation;
  const category = relationCategory(canonicalRelation);
  if (!category) {
    throw new Error(`סוג קרבה לא מוכר: "${rel.relation}"`);
  }
  const pedigree = (rel.pedigree || 'birth').toLowerCase();

  let memberId = rel.existingPersonId ? rel.existingPersonId.trim() : '';
  if (memberId) {
    if (memberId === focalPersonId.trim()) {
      throw new Error('לא ניתן לקשר אדם אל עצמו כבן משפחה.');
    }
    const existingRange = findPersonRecordRange(nextRaw, memberId);
    if (!existingRange) {
      throw new Error(`האדם הקיים ${memberId} אינו נמצא בקובץ ה-GEDCOM.`);
    }
    // Enforce cycle checks even if applyPersonUpdatesWithReport is invoked directly
    const parsedForCycle = parseGedcom(nextRaw);
    if (category === 'parent' && isDescendantInData(parsedForCycle, focalPersonId, memberId)) {
      throw new Error('לא ניתן לקשר צאצא כהורה (יוצר קשר מעגלי באילן).');
    }
    if (category === 'child' && isAncestorInData(parsedForCycle, focalPersonId, memberId)) {
      throw new Error('לא ניתן לקשר הורה או אב קדמון כילד (יוצר קשר מעגלי באילן).');
    }
    if (category === 'sibling' && (isAncestorInData(parsedForCycle, focalPersonId, memberId) || isDescendantInData(parsedForCycle, focalPersonId, memberId))) {
      throw new Error('לא ניתן לקשר הורה, אב קדמון או צאצא כאח/ות (יוצר קשר מעגלי באילן).');
    }
    const personUpdates = extractRelativePersonUpdates(rel);
    // Linking to an existing person must never rewrite their identity —
    // keep only new facts. Primary name parts are stripped so a rebuild of the
    // NAME line cannot drop prefixes/suffixes, and sex stays untouched when the
    // tree already records it (M/F), so an inferred value cannot corrupt it.
    delete personUpdates.givenName;
    delete personUpdates.surname;
    const existingSex = getPersonSexFromRaw(nextRaw, memberId);
    if (existingSex === 'M' || existingSex === 'F') delete personUpdates.sex;
    if (Object.keys(personUpdates).length > 0) {
      const updatedExisting = updatePersonRecord(existingRange.rawBlock, personUpdates, memberId);
      nextRaw = replaceRecordRange(nextRaw, existingRange, updatedExisting);
    }
  } else {
    memberId = allocateNextXref(nextRaw, 'I');
    const personUpdates = extractRelativePersonUpdates(rel);
    if (!personUpdates.sex) personUpdates.sex = inferSexFromRelation(canonicalRelation);
    if (!personUpdates.givenName && !personUpdates.surname && rel.name) {
      const split = splitNameString(rel.name);
      if (split.givenName) personUpdates.givenName = split.givenName;
      if (split.surname) personUpdates.surname = split.surname;
    }
    const newIndiBlock = createPersonRecord(memberId, personUpdates);
    nextRaw = insertRecordsBeforeTrailer(nextRaw, [newIndiBlock]);
    report.createdPeople.push(memberId);
  }

  const memberSex = getPersonSexFromRaw(nextRaw, memberId);
  const focalSex = getPersonSexFromRaw(nextRaw, focalPersonId);
  const focalLinks = getPersonLinksFromRaw(nextRaw, focalPersonId);
  const allFamilies = listAllFamilyRecordsFromRaw(nextRaw);
  const famById = new Map(allFamilies.map(f => [f.id, f]));

  const ensureFamilyExistsAndUpdate = (famId, mutation) => {
    const range = findFamilyRecordRange(nextRaw, famId);
    if (!range) throw new Error(`משפחה ${famId} אינה קיימת בקובץ.`);
    const updatedFam = updateFamilyRecord(range.rawBlock, mutation);
    nextRaw = replaceRecordRange(nextRaw, range, updatedFam);
    if (!report.createdFamilies.includes(famId) && !report.updatedFamilies.includes(famId)) {
      report.updatedFamilies.push(famId);
    }
  };

  const createFamilyAndInsert = (mutation) => {
    const newFamId = allocateNextXref(nextRaw, 'F');
    const famBlock = updateFamilyRecord(`0 ${newFamId} FAM`, mutation);
    nextRaw = insertRecordsBeforeTrailer(nextRaw, [famBlock]);
    report.createdFamilies.push(newFamId);
    return newFamId;
  };

  if (category === 'parent') {
    let targetFamId = '';
    if (rel.targetFamilyId) {
      if (!famById.has(rel.targetFamilyId)) {
        throw new Error(`משפחת היעד ${rel.targetFamilyId} אינה קיימת בקובץ.`);
      }
      targetFamId = rel.targetFamilyId;
    } else if (!rel.createNewFamily) {
      const matchingPf = focalLinks.parentFamilies.find(pf => {
        if ((pf.type || 'birth').toLowerCase() !== pedigree) return false;
        const fam = famById.get(pf.id);
        return fam && fam.partners.length < 2;
      });
      if (matchingPf) targetFamId = matchingPf.id;
    }

    if (targetFamId) {
      ensureFamilyExistsAndUpdate(targetFamId, {
        addPartners: [{ id: memberId, sex: memberSex }],
        addChildren: [focalPersonId],
      });
    } else {
      targetFamId = createFamilyAndInsert({
        addPartners: [{ id: memberId, sex: memberSex }],
        addChildren: [focalPersonId],
      });
    }

    nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMC', targetFamId, pedigree);
    nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMS', targetFamId);
  } else if (category === 'spouse') {
    const unionEvents = collectUnionEventsFromRelative(rel);
    const unionStatus = rel.relationshipStatus || '';
    const existingShared = allFamilies.find(
      f => f.partners.includes(focalPersonId) && f.partners.includes(memberId),
    );
    let targetFamId = existingShared?.id || '';

    if (!targetFamId && rel.targetFamilyId) {
      if (!famById.has(rel.targetFamilyId)) {
        throw new Error(`משפחת היעד ${rel.targetFamilyId} אינה קיימת בקובץ.`);
      }
      targetFamId = rel.targetFamilyId;
    }

    if (targetFamId) {
      ensureFamilyExistsAndUpdate(targetFamId, {
        addPartners: [
          { id: focalPersonId, sex: focalSex },
          { id: memberId, sex: memberSex },
        ],
        events: unionEvents,
        status: unionStatus,
      });
    } else {
      targetFamId = createFamilyAndInsert({
        addPartners: [
          { id: focalPersonId, sex: focalSex },
          { id: memberId, sex: memberSex },
        ],
        events: unionEvents,
        status: unionStatus,
      });
    }

    nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMS', targetFamId);
    nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMS', targetFamId);
  } else if (category === 'child') {
    let targetFamId = '';
    if (rel.targetFamilyId) {
      if (!famById.has(rel.targetFamilyId)) {
        throw new Error(`משפחת היעד ${rel.targetFamilyId} אינה קיימת בקובץ.`);
      }
      targetFamId = rel.targetFamilyId;
    } else if (rel.otherParentId) {
      if (!findPersonRecordRange(nextRaw, rel.otherParentId)) {
        throw new Error(`ההורה הנוסף ${rel.otherParentId} אינו קיים בקובץ.`);
      }
      const matching = allFamilies.find(
        f => f.partners.includes(focalPersonId) && f.partners.includes(rel.otherParentId),
      );
      if (matching) {
        targetFamId = matching.id;
      } else {
        const otherSex = getPersonSexFromRaw(nextRaw, rel.otherParentId);
        targetFamId = createFamilyAndInsert({
          addPartners: [
            { id: focalPersonId, sex: focalSex },
            { id: rel.otherParentId, sex: otherSex },
          ],
          addChildren: [memberId],
        });
        nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMS', targetFamId);
        nextRaw = addLinkToPersonRecord(nextRaw, rel.otherParentId, 'FAMS', targetFamId);
        nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMC', targetFamId, pedigree);
        return nextRaw;
      }
    } else if (rel.otherParentName) {
      const targetNorm = normalize(rel.otherParentName);
      for (const fid of focalLinks.spouseFamilies) {
        const fam = famById.get(fid);
        if (!fam) continue;
        for (const pid of fam.partners) {
          if (pid === focalPersonId) continue;
          const pName = normalize(getPersonNameFromRaw(nextRaw, pid));
          if (pName && (pName === targetNorm || pName.includes(targetNorm) || targetNorm.includes(pName))) {
            targetFamId = fid;
            break;
          }
        }
        if (targetFamId) break;
      }
    }

    if (!targetFamId && !rel.createNewFamily && focalLinks.spouseFamilies.length > 0) {
      if (focalLinks.spouseFamilies.length === 1) {
        targetFamId = focalLinks.spouseFamilies[0];
      } else {
        const nonDivorced = focalLinks.spouseFamilies.filter(fid => !famById.get(fid)?.isDivorced);
        if (nonDivorced.length === 1) {
          targetFamId = nonDivorced[0];
        } else {
          targetFamId = focalLinks.spouseFamilies[focalLinks.spouseFamilies.length - 1];
        }
      }
    }

    if (targetFamId) {
      ensureFamilyExistsAndUpdate(targetFamId, {
        addPartners: [{ id: focalPersonId, sex: focalSex }],
        addChildren: [memberId],
      });
    } else {
      targetFamId = createFamilyAndInsert({
        addPartners: [{ id: focalPersonId, sex: focalSex }],
        addChildren: [memberId],
      });
    }

    nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMS', targetFamId);
    nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMC', targetFamId, pedigree);
  } else if (category === 'sibling') {
    let targetFamId = '';
    if (rel.halfParentId) {
      if (!findPersonRecordRange(nextRaw, rel.halfParentId)) {
        throw new Error(`ההורה המשותף ${rel.halfParentId} אינו קיים בקובץ.`);
      }
      const primaryPf = focalLinks.parentFamilies.find(pf => pf.type === 'birth') || focalLinks.parentFamilies[0];
      const focalBirthPartners = primaryPf ? (famById.get(primaryPf.id)?.partners || []) : [];
      const halfParentLinks = getPersonLinksFromRaw(nextRaw, rel.halfParentId);
      const otherSpouseFamId = halfParentLinks.spouseFamilies.find(fid => {
        const fam = famById.get(fid);
        if (!fam) return false;
        return !fam.partners.some(pid => pid !== rel.halfParentId && focalBirthPartners.includes(pid));
      });
      if (otherSpouseFamId) {
        targetFamId = otherSpouseFamId;
        ensureFamilyExistsAndUpdate(targetFamId, { addChildren: [memberId] });
      } else {
        const hpSex = getPersonSexFromRaw(nextRaw, rel.halfParentId);
        targetFamId = createFamilyAndInsert({
          addPartners: [{ id: rel.halfParentId, sex: hpSex }],
          addChildren: [memberId],
        });
      }
      nextRaw = addLinkToPersonRecord(nextRaw, rel.halfParentId, 'FAMS', targetFamId);
      nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMC', targetFamId, pedigree);
      return nextRaw;
    }

    if (rel.targetFamilyId) {
      if (!famById.has(rel.targetFamilyId)) {
        throw new Error(`משפחת היעד ${rel.targetFamilyId} אינה קיימת בקובץ.`);
      }
      targetFamId = rel.targetFamilyId;
    } else {
      const pf = focalLinks.parentFamilies.find(f => f.type === 'birth') || focalLinks.parentFamilies[0];
      if (pf) targetFamId = pf.id;
    }

    if (targetFamId) {
      ensureFamilyExistsAndUpdate(targetFamId, {
        addChildren: [focalPersonId, memberId],
      });
    } else {
      targetFamId = createFamilyAndInsert({
        addChildren: [focalPersonId, memberId],
      });
    }

    nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMC', targetFamId);
    nextRaw = addLinkToPersonRecord(nextRaw, memberId, 'FAMC', targetFamId, pedigree);
  }

  return nextRaw;
}

function applyFamilyEventToGedcom(rawGedcom, focalPersonId, famEvent, report) {
  let nextRaw = rawGedcom;
  const focalLinks = getPersonLinksFromRaw(nextRaw, focalPersonId);
  const allFamilies = listAllFamilyRecordsFromRaw(nextRaw);
  const famById = new Map(allFamilies.map(f => [f.id, f]));

  let targetFamId = '';
  if (famEvent.familyId) {
    if (!famById.has(famEvent.familyId)) {
      throw new Error(`משפחה ${famEvent.familyId} אינה קיימת בקובץ.`);
    }
    targetFamId = famEvent.familyId;
  } else if (famEvent.partnerId) {
    const match = allFamilies.find(
      f => f.partners.includes(focalPersonId) && f.partners.includes(famEvent.partnerId),
    );
    targetFamId = match?.id || '';
  } else if (famEvent.partnerName) {
    const normTarget = normalize(famEvent.partnerName);
    for (const fid of focalLinks.spouseFamilies) {
      const fam = famById.get(fid);
      if (!fam) continue;
      for (const pid of fam.partners) {
        if (pid === focalPersonId) continue;
        const pName = normalize(getPersonNameFromRaw(nextRaw, pid));
        if (pName && (pName === normTarget || pName.includes(normTarget) || normTarget.includes(pName))) {
          targetFamId = fid;
          break;
        }
      }
      if (targetFamId) break;
    }
  }

  if (!targetFamId && focalLinks.spouseFamilies.length > 0) {
    if (focalLinks.spouseFamilies.length === 1) {
      targetFamId = focalLinks.spouseFamilies[0];
    } else {
      const nonDivorced = focalLinks.spouseFamilies.filter(fid => !famById.get(fid)?.isDivorced);
      targetFamId = nonDivorced.length === 1
        ? nonDivorced[0]
        : focalLinks.spouseFamilies[focalLinks.spouseFamilies.length - 1];
    }
  }

  if (targetFamId) {
    const range = findFamilyRecordRange(nextRaw, targetFamId);
    const updatedFam = updateFamilyRecord(range.rawBlock, { events: [famEvent] });
    nextRaw = replaceRecordRange(nextRaw, range, updatedFam);
    if (!report.createdFamilies.includes(targetFamId) && !report.updatedFamilies.includes(targetFamId)) {
      report.updatedFamilies.push(targetFamId);
    }
  } else {
    const focalSex = getPersonSexFromRaw(nextRaw, focalPersonId);
    const newFamId = allocateNextXref(nextRaw, 'F');
    const famBlock = updateFamilyRecord(`0 ${newFamId} FAM`, {
      addPartners: [{ id: focalPersonId, sex: focalSex }],
      events: [famEvent],
    });
    nextRaw = insertRecordsBeforeTrailer(nextRaw, [famBlock]);
    report.createdFamilies.push(newFamId);
    nextRaw = addLinkToPersonRecord(nextRaw, focalPersonId, 'FAMS', newFamId);
  }
  return nextRaw;
}

const RELATIVE_CATEGORY_ORDER = {
  parent: 0,
  sibling: 1,
  spouse: 2,
  child: 3,
};

/**
 * Applies person updates, family member additions, and family events to raw GEDCOM.
 * Returns { raw, createdPeople, createdFamilies, updatedFamilies }.
 */
export function applyPersonUpdatesWithReport(rawGedcom, personId, updates) {
  const initialRange = findPersonRecordRange(rawGedcom, personId);
  if (!initialRange) {
    throw new Error(`רשומת האדם עם המזהה ${personId} לא נמצאה בקובץ ה-GEDCOM.`);
  }

  const report = {
    raw: rawGedcom,
    createdPeople: [],
    createdFamilies: [],
    updatedFamilies: [],
  };

  if (!updates || typeof updates !== 'object') {
    return report;
  }

  // Stage 1: Update focal person's own fields, events, attributes, and custom tags
  const focalOnlyUpdates = { ...updates };
  delete focalOnlyUpdates.relatives;
  delete focalOnlyUpdates.addRelatives;
  delete focalOnlyUpdates.familyEvents;

  if (Object.keys(focalOnlyUpdates).length > 0) {
    const updatedBlock = updatePersonRecord(initialRange.rawBlock, focalOnlyUpdates, personId);
    report.raw = replaceRecordRange(report.raw, initialRange, updatedBlock);
  }

  // Stage 2: Apply relative additions in deterministic order: parent -> sibling -> spouse -> child
  const rawRelatives = [
    ...(Array.isArray(updates.relatives) ? updates.relatives : []),
    ...(Array.isArray(updates.addRelatives) ? updates.addRelatives : []),
  ];
  if (rawRelatives.length > 0) {
    const ordered = rawRelatives
      .map((rel, idx) => ({
        rel,
        idx,
        rank: RELATIVE_CATEGORY_ORDER[relationCategory(rel.relation)] ?? 99,
      }))
      .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
      .map(entry => entry.rel);

    for (const rel of ordered) {
      report.raw = applyRelativeAddition(report.raw, personId, rel, report);
    }
  }

  // Stage 3: Apply standalone family events
  if (Array.isArray(updates.familyEvents)) {
    for (const famEvent of updates.familyEvents) {
      report.raw = applyFamilyEventToGedcom(report.raw, personId, famEvent, report);
    }
  }

  return report;
}

/**
 * Applies updates to the target person inside the raw GEDCOM string safely.
 * Returns the updated raw GEDCOM string.
 */
export function applyPersonUpdatesToGedcom(rawGedcom, personId, updates) {
  return applyPersonUpdatesWithReport(rawGedcom, personId, updates).raw;
}
