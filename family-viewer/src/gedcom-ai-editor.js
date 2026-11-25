/**
 * GEDCOM Person Editor & Schema Validator
 * Safely parses, validates, and updates an individual's record (INDI) within a raw GEDCOM string.
 */

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

/** Build a GEDCOM NOTE node using 2 CONT lines for any embedded newlines. */
function createNoteNode(noteText) {
  const lines = String(noteText ?? '')
    .replace(CONTROL_CHARS, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trimEnd());
  const first = (lines[0] || '').trim();
  const rest = lines.slice(1);
  return {
    tag: 'NOTE',
    val: lines.join('\n').trim(),
    raw: first ? `1 NOTE ${first}` : '1 NOTE',
    children: rest.map(line => ({
      level: 2,
      tag: 'CONT',
      val: line,
      raw: line ? `2 CONT ${line}` : '2 CONT',
    })),
  };
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

/** Fields the AI is allowed to return. */
export const AI_ALLOWED_KEYS = new Set([
  'givenName',
  'surname',
  'nickname',
  'alternateNames',
  'alternateName',
  'sex',
  'birthDate',
  'birthPlace',
  'deathDate',
  'deathPlace',
  'deathCause',
  'burialDate',
  'burialPlace',
  'cremationDate',
  'cremationPlace',
  'immigrationDate',
  'immigrationPlace',
  'emigrationDate',
  'emigrationPlace',
  'naturalizationDate',
  'naturalizationPlace',
  'barMitzvahDate',
  'barMitzvahPlace',
  'batMitzvahDate',
  'batMitzvahPlace',
  'baptismDate',
  'baptismPlace',
  'graduationDate',
  'graduationPlace',
  'retirementDate',
  'retirementPlace',
  'occupation',
  'education',
  'residencePlace',
  'residenceDate',
  'title',
  'religion',
  'nationality',
  'description',
  'idNumber',
  'notes',
  'source'
  ]);

const DATE_FIELDS_SET = new Set([
  'birthDate', 'deathDate', 'residenceDate',
  'burialDate', 'cremationDate',
  'immigrationDate', 'emigrationDate', 'naturalizationDate',
  'barMitzvahDate', 'batMitzvahDate', 'baptismDate',
  'graduationDate', 'retirementDate',
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

/**
 * Cleans raw AI output before validation:
 * - Drops empty values and unknown keys (small models often emit empty strings or "name").
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
    const empty =
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.every((v) => !String(v ?? '').trim()));
    if (!AI_ALLOWED_KEYS.has(key) || empty) {
      dropped.push(key);
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

/**
 * Validates the schema of updates returned by window.ai.
 * Returns { valid: boolean, errors: string[], sanitized: object, diff: object }
 */
export function validatePersonUpdates(updates, currentPerson = {}) {
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

  const sanitized = {};
  const diff = {};

  // Validate Alternate Names
  if (updates.alternateNames !== undefined && updates.alternateNames !== null) {
    if (typeof updates.alternateNames === 'string') {
      const alt = sanitizeGedcomInline(updates.alternateNames);
      sanitized.alternateNames = alt ? [alt] : [];
      diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
    } else if (Array.isArray(updates.alternateNames)) {
      const valid = updates.alternateNames.every(a => typeof a === 'string');
      if (!valid) {
        errors.push('מערך alternateNames חייב להכיל מחרוזות בלבד.');
      } else {
        sanitized.alternateNames = updates.alternateNames.map(sanitizeGedcomInline).filter(Boolean);
        diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
      }
    } else {
      errors.push('השדה alternateNames חייב להיות מחרוזת או מערך מחרוזות.');
    }
  } else if (updates.alternateName !== undefined && updates.alternateName !== null) {
    if (typeof updates.alternateName === 'string') {
      const alt = sanitizeGedcomInline(updates.alternateName);
      sanitized.alternateNames = alt ? [alt] : [];
      diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
    } else {
      errors.push('השדה alternateName חייב להיות מחרוזת.');
    }
  }

  // Validate String fields
  const stringFields = [
    'givenName', 'surname', 'nickname',
    'birthPlace', 'deathPlace', 'deathCause',
    'burialPlace', 'cremationPlace',
    'immigrationPlace', 'emigrationPlace', 'naturalizationPlace',
    'barMitzvahPlace', 'batMitzvahPlace', 'baptismPlace',
    'graduationPlace', 'retirementPlace',
    'occupation', 'education', 'residencePlace',
    'title', 'religion', 'nationality', 'description', 'idNumber',
    'source'
  ];

  for (const field of stringFields) {
    if (updates[field] !== undefined && updates[field] !== null) {
      if (typeof updates[field] !== 'string') {
        errors.push(`השדה ${field} חייב להיות מחרוזת.`);
      } else {
        let val = sanitizeGedcomInline(updates[field]);
        if (field === 'givenName' || field === 'surname') {
          val = val.replace(/\//g, '').trim();
        }
        sanitized[field] = val;
        diff[field] = { old: currentPerson[field] || '', new: val };
      }
    }
  }

  // Validate Sex
  if (updates.sex !== undefined && updates.sex !== null) {
    const s = String(updates.sex).trim().toUpperCase();
    if (!['M', 'F', 'U'].includes(s)) {
      errors.push(`השדה sex חייב להיות M (זכר), F (נקבה) או U (לא ידוע). התקבל: "${updates.sex}"`);
    } else {
      sanitized.sex = s;
      diff.sex = { old: currentPerson.sex || 'U', new: s };
    }
  }

  // Validate & format Date fields
  const dateFields = [
    'birthDate', 'deathDate', 'residenceDate',
    'burialDate', 'cremationDate',
    'immigrationDate', 'emigrationDate', 'naturalizationDate',
    'barMitzvahDate', 'batMitzvahDate', 'baptismDate',
    'graduationDate', 'retirementDate'
  ];
  for (const field of dateFields) {
    if (updates[field] !== undefined && updates[field] !== null) {
      if (typeof updates[field] !== 'string') {
        errors.push(`השדה ${field} חייב להיות מחרוזת תאריך.`);
      } else {
        const formatted = sanitizeGedcomInline(formatToGedcomDate(updates[field]));
        sanitized[field] = formatted;
        diff[field] = { old: currentPerson[field] || '', new: formatted };
      }
    }
  }

  // Validate Notes (can be string or array of strings)
  if (updates.notes !== undefined && updates.notes !== null) {
    if (typeof updates.notes === 'string') {
      const note = updates.notes.trim();
      sanitized.notes = note ? [note] : [];
      diff.notes = { old: currentPerson.notes || [], new: sanitized.notes };
    } else if (Array.isArray(updates.notes)) {
      const validStrings = updates.notes.every(n => typeof n === 'string');
      if (!validStrings) {
        errors.push('מערך הערות (notes) חייב להכיל מחרוזות בלבד.');
      } else {
        sanitized.notes = updates.notes.map(n => n.trim()).filter(Boolean);
        diff.notes = { old: currentPerson.notes || [], new: sanitized.notes };
      }
    } else {
      errors.push('השדה notes חייב להיות מחרוזת או מערך מחרוזות.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null,
    diff
  };
}

/**
 * Extracts the start and end character indexes of an INDI record block in a raw GEDCOM string.
 */
export function findPersonRecordRange(rawGedcom, personId) {
  const trimmedId = personId.trim();
  const regex = new RegExp(`(^|\\r?\\n)(0\\s+${trimmedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+INDI(?:\\s+[^\r\n]*)?(?:\\r?\\n|$))`, 'i');
  const match = rawGedcom.match(regex);
  if (!match) return null;

  const startIndex = match.index + match[1].length;
  const afterMatch = startIndex + match[2].length;

  // Find next 0-level tag or EOF
  const nextZeroMatch = rawGedcom.slice(afterMatch).match(/(^|\r?\n)0\s+([A-Za-z0-9_@]+)/);
  let endIndex;
  if (nextZeroMatch) {
    endIndex = afterMatch + nextZeroMatch.index + (nextZeroMatch[1] ? nextZeroMatch[1].length : 0);
  } else {
    endIndex = rawGedcom.length;
  }

  return {
    startIndex,
    endIndex,
    rawBlock: rawGedcom.slice(startIndex, endIndex)
  };
}

/**
 * Updates a person's INDI block with validated changes while preserving family links (FAMS, FAMC),
 * existing citations, and other unaffected tags.
 */
export function updatePersonRecord(rawBlock, updates, personId) {
  const lines = rawBlock.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return rawBlock;

  // Root line: e.g. "0 @I1@ INDI"
  const rootLine = lines[0];

  // Parse lines into a tag structure
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

  // Update NAME / GIVN / SURN
  if (updates.givenName !== undefined || updates.surname !== undefined || updates.nickname !== undefined) {
    let nameNode = subNodes.find(n => n.tag === 'NAME');
    const parsedName = (nameNode?.val || '').match(/^([^/]*)\/([^/]*)\//);
    const fallbackGiven = parsedName ? parsedName[1].trim() : (nameNode?.val || '').replace(/\//g, '').trim();
    const fallbackSurn = parsedName ? parsedName[2].trim() : '';
    const existingGiven = nameNode?.children.find(c => c.tag === 'GIVN')?.val || fallbackGiven;
    const existingSurn = nameNode?.children.find(c => c.tag === 'SURN')?.val || fallbackSurn;
    const existingNick = nameNode?.children.find(c => c.tag === 'NICK')?.val || '';

    const newGiven = (updates.givenName !== undefined ? sanitizeGedcomInline(updates.givenName) : existingGiven).replace(/\//g, '').trim();
    const newSurn = (updates.surname !== undefined ? sanitizeGedcomInline(updates.surname) : existingSurn).replace(/\//g, '').trim();
    const newNick = updates.nickname !== undefined ? sanitizeGedcomInline(updates.nickname) : existingNick;

    const fullGedName = `${newGiven} /${newSurn}/`.trim();

    if (!nameNode) {
      nameNode = { tag: 'NAME', val: fullGedName, raw: `1 NAME ${fullGedName}`, children: [] };
      subNodes.unshift(nameNode);
    } else {
      nameNode.val = fullGedName;
      nameNode.raw = `1 NAME ${fullGedName}`;
    }

    // Update GIVN
    if (newGiven) {
      let givnNode = nameNode.children.find(c => c.tag === 'GIVN');
      if (givnNode) {
        givnNode.val = newGiven;
        givnNode.raw = `2 GIVN ${newGiven}`;
      } else {
        nameNode.children.push({ level: 2, tag: 'GIVN', val: newGiven, raw: `2 GIVN ${newGiven}` });
      }
    }

    // Update SURN
    if (newSurn) {
      let surnNode = nameNode.children.find(c => c.tag === 'SURN');
      if (surnNode) {
        surnNode.val = newSurn;
        surnNode.raw = `2 SURN ${newSurn}`;
      } else {
        nameNode.children.push({ level: 2, tag: 'SURN', val: newSurn, raw: `2 SURN ${newSurn}` });
      }
    }

    // Update NICK
    if (newNick) {
      let nickNode = nameNode.children.find(c => c.tag === 'NICK');
      if (nickNode) {
        nickNode.val = newNick;
        nickNode.raw = `2 NICK ${newNick}`;
      } else {
        nameNode.children.push({ level: 2, tag: 'NICK', val: newNick, raw: `2 NICK ${newNick}` });
      }
    }
  }

  // Update alternateNames (1 NAME ... / 2 TYPE aka)
  if (updates.alternateNames !== undefined && Array.isArray(updates.alternateNames)) {
    for (const alt of updates.alternateNames) {
      if (!alt) continue;
      const cleanAlt = sanitizeGedcomInline(alt);
      if (!cleanAlt) continue;

      // Check if already exists in subNodes NAME nodes
      const altNameGed = cleanAlt.includes('/') ? cleanAlt : `${cleanAlt}`;
      const existingNameNode = subNodes.find(n => n.tag === 'NAME' && (n.val === altNameGed || n.val?.replace(/\//g, '').trim() === cleanAlt.replace(/\//g, '').trim()));
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

  // Update OCCU
  if (updates.occupation !== undefined) {
    const cleanOccu = sanitizeGedcomInline(updates.occupation);
    let occuNode = subNodes.find(n => n.tag === 'OCCU');
    if (cleanOccu) {
      if (!occuNode) {
        occuNode = { tag: 'OCCU', val: cleanOccu, raw: `1 OCCU ${cleanOccu}`, children: [] };
        subNodes.push(occuNode);
      } else {
        occuNode.val = cleanOccu;
        occuNode.raw = `1 OCCU ${cleanOccu}`;
      }
    } else if (occuNode) {
      const idx = subNodes.indexOf(occuNode);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  }

  // Update EDUC
  if (updates.education !== undefined) {
    const cleanEduc = sanitizeGedcomInline(updates.education);
    let educNode = subNodes.find(n => n.tag === 'EDUC');
    if (cleanEduc) {
      if (!educNode) {
        educNode = { tag: 'EDUC', val: cleanEduc, raw: `1 EDUC ${cleanEduc}`, children: [] };
        subNodes.push(educNode);
      } else {
        educNode.val = cleanEduc;
        educNode.raw = `1 EDUC ${cleanEduc}`;
      }
    } else if (educNode) {
      const idx = subNodes.indexOf(educNode);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  }

  // Helper to update Event node (BIRT, DEAT, RESI)
  const updateEventNode = (tag, dateVal, placeVal, extraTag, extraVal) => {
    const cleanDate = dateVal !== undefined ? sanitizeGedcomInline(dateVal) : undefined;
    const cleanPlace = placeVal !== undefined ? sanitizeGedcomInline(placeVal) : undefined;
    const cleanExtra = extraVal !== undefined ? sanitizeGedcomInline(extraVal) : undefined;
    let node = subNodes.find(n => n.tag === tag);
    const hasInfo = Boolean(cleanDate || cleanPlace || cleanExtra);
    if (!hasInfo) return;

    if (!node) {
      node = { tag, val: '', raw: `1 ${tag}`, children: [] };
      subNodes.push(node);
    }

    if (cleanDate !== undefined) {
      let dNode = node.children.find(c => c.tag === 'DATE');
      if (cleanDate) {
        if (!dNode) {
          node.children.push({ level: 2, tag: 'DATE', val: cleanDate, raw: `2 DATE ${cleanDate}` });
        } else {
          dNode.val = cleanDate;
          dNode.raw = `2 DATE ${cleanDate}`;
        }
      } else if (dNode) {
        node.children = node.children.filter(c => c.tag !== 'DATE');
      }
    }

    if (cleanPlace !== undefined) {
      let pNode = node.children.find(c => c.tag === 'PLAC');
      if (cleanPlace) {
        if (!pNode) {
          node.children.push({ level: 2, tag: 'PLAC', val: cleanPlace, raw: `2 PLAC ${cleanPlace}` });
        } else {
          pNode.val = cleanPlace;
          pNode.raw = `2 PLAC ${cleanPlace}`;
        }
      } else if (pNode) {
        node.children = node.children.filter(c => c.tag !== 'PLAC');
      }
    }

    if (extraTag && cleanExtra !== undefined) {
      let xNode = node.children.find(c => c.tag === extraTag);
      if (cleanExtra) {
        if (!xNode) {
          node.children.push({ level: 2, tag: extraTag, val: cleanExtra, raw: `2 ${extraTag} ${cleanExtra}` });
        } else {
          xNode.val = cleanExtra;
          xNode.raw = `2 ${extraTag} ${cleanExtra}`;
        }
      } else if (xNode) {
        node.children = node.children.filter(c => c.tag !== extraTag);
      }
    }
  };

  // Update BIRT
  if (updates.birthDate !== undefined || updates.birthPlace !== undefined) {
    updateEventNode('BIRT', updates.birthDate, updates.birthPlace);
  }

  // Update DEAT
  if (updates.deathDate !== undefined || updates.deathPlace !== undefined || updates.deathCause !== undefined) {
    updateEventNode('DEAT', updates.deathDate, updates.deathPlace, 'CAUS', updates.deathCause);
  }

  // Update RESI
  if (updates.residenceDate !== undefined || updates.residencePlace !== undefined) {
    updateEventNode('RESI', updates.residenceDate, updates.residencePlace);
  }

  // Update BURI (קבורה)
  if (updates.burialDate !== undefined || updates.burialPlace !== undefined) {
    updateEventNode('BURI', updates.burialDate, updates.burialPlace);
  }

  // Update CREM (שריפת גופה)
  if (updates.cremationDate !== undefined || updates.cremationPlace !== undefined) {
    updateEventNode('CREM', updates.cremationDate, updates.cremationPlace);
  }

  // Update IMMI (עלייה / הגירה לארץ)
  if (updates.immigrationDate !== undefined || updates.immigrationPlace !== undefined) {
    updateEventNode('IMMI', updates.immigrationDate, updates.immigrationPlace);
  }

  // Update EMIG (הגירה)
  if (updates.emigrationDate !== undefined || updates.emigrationPlace !== undefined) {
    updateEventNode('EMIG', updates.emigrationDate, updates.emigrationPlace);
  }

  // Update NATU (התאזרחות)
  if (updates.naturalizationDate !== undefined || updates.naturalizationPlace !== undefined) {
    updateEventNode('NATU', updates.naturalizationDate, updates.naturalizationPlace);
  }

  // Update BARM (בר מצווה)
  if (updates.barMitzvahDate !== undefined || updates.barMitzvahPlace !== undefined) {
    updateEventNode('BARM', updates.barMitzvahDate, updates.barMitzvahPlace);
  }

  // Update BASM (בת מצווה)
  if (updates.batMitzvahDate !== undefined || updates.batMitzvahPlace !== undefined) {
    updateEventNode('BASM', updates.batMitzvahDate, updates.batMitzvahPlace);
  }

  // Update BAPM (טבילה)
  if (updates.baptismDate !== undefined || updates.baptismPlace !== undefined) {
    updateEventNode('BAPM', updates.baptismDate, updates.baptismPlace);
  }

  // Update GRAD (סיום לימודים)
  if (updates.graduationDate !== undefined || updates.graduationPlace !== undefined) {
    updateEventNode('GRAD', updates.graduationDate, updates.graduationPlace);
  }

  // Update RETI (פרישה לגמלאות)
  if (updates.retirementDate !== undefined || updates.retirementPlace !== undefined) {
    updateEventNode('RETI', updates.retirementDate, updates.retirementPlace);
  }

  // Helper for single text attribute (TITL, RELI, NATI, DSCR, IDNO)
  const updateAttributeNode = (tag, val) => {
    const cleanVal = sanitizeGedcomInline(val);
    let node = subNodes.find(n => n.tag === tag);
    if (cleanVal) {
      if (!node) {
        node = { tag, val: cleanVal, raw: `1 ${tag} ${cleanVal}`, children: [] };
        subNodes.push(node);
      } else {
        node.val = cleanVal;
        node.raw = `1 ${tag} ${cleanVal}`;
      }
    } else if (node) {
      const idx = subNodes.indexOf(node);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  };

  // Update TITL (תואר)
  if (updates.title !== undefined) {
    updateAttributeNode('TITL', updates.title);
  }

  // Update RELI (דת)
  if (updates.religion !== undefined) {
    updateAttributeNode('RELI', updates.religion);
  }

  // Update NATI (לאום / אזרחות)
  if (updates.nationality !== undefined) {
    updateAttributeNode('NATI', updates.nationality);
  }

  // Update DSCR (תיאור פיזי)
  if (updates.description !== undefined) {
    updateAttributeNode('DSCR', updates.description);
  }

  // Update IDNO (מספר זיהוי)
  if (updates.idNumber !== undefined) {
    updateAttributeNode('IDNO', updates.idNumber);
  }

  // Update NOTE
  if (updates.notes !== undefined && Array.isArray(updates.notes)) {
    for (const noteText of updates.notes) {
      if (!noteText) continue;
      const noteNode = createNoteNode(noteText);
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
        subNodes.push(createNoteNode(sourceNote));
      }
    }
  }

  // Rebuild lines
  const outputLines = [rootLine];
  for (const node of subNodes) {
    outputLines.push(node.raw);
    for (const child of node.children) {
      outputLines.push(child.raw);
    }
  }

  return outputLines.join('\n');
}

/**
 * Applies updates to the target person inside the raw GEDCOM string safely.
 * Returns the updated raw GEDCOM string.
 */
export function applyPersonUpdatesToGedcom(rawGedcom, personId, updates) {
  const range = findPersonRecordRange(rawGedcom, personId);
  if (!range) {
    throw new Error(`רשומת האדם עם המזהה ${personId} לא נמצאה בקובץ ה-GEDCOM.`);
  }

  const updatedBlock = updatePersonRecord(range.rawBlock, updates, personId);
  return rawGedcom.slice(0, range.startIndex) + updatedBlock + (rawGedcom.slice(range.endIndex).startsWith('\n') ? '' : '\n') + rawGedcom.slice(range.endIndex);
}
