/**
 * Central GEDCOM 5.5 / 5.5.1 / 7.0 tag registry and family-relationship helpers.
 * Single source of truth for parsing, AI prompting, validation, writing, and UI labels.
 */

export const INDI_EVENT_TAGS = {
  BIRT: { label: 'לידה', fieldPrefix: 'birth', singleton: true },
  CHR: { label: 'הטבלה בילדות', fieldPrefix: 'christening' },
  DEAT: { label: 'פטירה', fieldPrefix: 'death', hasCause: true, singleton: true },
  BURI: { label: 'קבורה', fieldPrefix: 'burial', singleton: true },
  CREM: { label: 'שריפת גופה', fieldPrefix: 'cremation', singleton: true },
  ADOP: { label: 'אימוץ', fieldPrefix: 'adoption' },
  BAPM: { label: 'טבילה', fieldPrefix: 'baptism' },
  BARM: { label: 'בר מצווה', fieldPrefix: 'barMitzvah', singleton: true },
  BASM: { label: 'בת מצווה', fieldPrefix: 'batMitzvah', singleton: true },
  BLES: { label: 'ברכה', fieldPrefix: 'blessing' },
  CHRA: { label: 'הטבלה בבגרות', fieldPrefix: 'adultChristening' },
  CONF: { label: 'אישור אמונה / קונפירמציה', fieldPrefix: 'confirmation' },
  FCOM: { label: 'לחם הקודש הראשון', fieldPrefix: 'firstCommunion' },
  ORDN: { label: 'הסמכה לרבנות / כמורה', fieldPrefix: 'ordination' },
  NATU: { label: 'התאזרחות', fieldPrefix: 'naturalization' },
  EMIG: { label: 'הגירה', fieldPrefix: 'emigration' },
  IMMI: { label: 'עלייה / הגירה', fieldPrefix: 'immigration' },
  CENS: { label: 'מפקד אוכלוסין', fieldPrefix: 'census' },
  PROB: { label: 'אישור צוואה', fieldPrefix: 'probate' },
  WILL: { label: 'צוואה', fieldPrefix: 'will' },
  GRAD: { label: 'סיום לימודים', fieldPrefix: 'graduation' },
  RETI: { label: 'פרישה', fieldPrefix: 'retirement' },
  EVEN: { label: 'אירוע', supportsType: true },
  BAPL: { label: 'טבילת LDS' },
  CONL: { label: 'אישור LDS' },
  ENDL: { label: 'הענקת LDS' },
  INIL: { label: 'חניכת LDS' },
  SLGC: { label: 'חיתום להורים LDS' },
  _MILT: { label: 'שירות צבאי', fieldPrefix: 'military' },
  CIRC: { label: 'ברית מילה', fieldPrefix: 'circumcision' },
};

export const INDI_ATTRIBUTE_TAGS = {
  CAST: { label: 'מעמד / קאסטה', fieldKey: 'caste' },
  DSCR: { label: 'תיאור', fieldKey: 'description' },
  EDUC: { label: 'השכלה / לימודים', fieldKey: 'education' },
  IDNO: { label: 'מזהה נוסף', fieldKey: 'idNumber' },
  NATI: { label: 'לאום כפי שתועד', fieldKey: 'nationality' },
  NCHI: { label: 'מספר ילדים כפי שתועד', fieldKey: 'childrenCount' },
  NMR: { label: 'מספר נישואים כפי שתועד', fieldKey: 'marriageCount' },
  OCCU: { label: 'עיסוק', fieldKey: 'occupation' },
  PROP: { label: 'רכוש / נכסים', fieldKey: 'property' },
  RELI: { label: 'דת כפי שתועדה', fieldKey: 'religion' },
  RESI: { label: 'מגורים', fieldPrefix: 'residence' },
  SSN: { label: 'מספר ביטוח לאומי', fieldKey: 'ssn' },
  TITL: { label: 'תואר', fieldKey: 'title' },
  FACT: { label: 'עובדה', supportsType: true },
};

export const INDI_CONTACT_AND_META_TAGS = {
  PHON: { label: 'טלפון', fieldKey: 'phone' },
  EMAIL: { label: 'דוא״ל', fieldKey: 'email' },
  WWW: { label: 'אתר אינטרנט', fieldKey: 'website' },
  FAX: { label: 'פקס', fieldKey: 'fax' },
  ADDR: { label: 'כתובת', fieldKey: 'address', multiline: true },
  REFN: { label: 'מספר סימוכין', fieldKey: 'referenceNumber' },
  RIN: { label: 'מזהה מערכת', fieldKey: 'rin' },
  UID: { label: 'מזהה ייחודי', fieldKey: 'uid' },
  EXID: { label: 'מזהה חיצוני', fieldKey: 'externalId' },
  AFN: { label: 'מספר קובץ אבות', fieldKey: 'afn' },
  RFN: { label: 'מזהה רשומה קבוע', fieldKey: 'rfn' },
  RESN: { label: 'הגבלת פרטיות', fieldKey: 'restriction' },
  ALIA: { label: 'כינוי / הפניה', fieldKey: 'alias' },
  ASSO: { label: 'קשר / עמית' },
  NO: { label: 'שלילת אירוע', supportsType: true },
};

export const NAME_SUBTAGS = [
  'NPFX',
  'GIVN',
  'NICK',
  'SPFX',
  'SURN',
  'NSFX',
  'TYPE',
  'TRAN',
  'ROMN',
  'FONE',
];

export const FAM_EVENT_TAGS = {
  MARR: { label: 'נישואים', singleton: true },
  DIV: { label: 'גירושים', singleton: true },
  DIVF: { label: 'הגשת בקשת גירושים', singleton: true },
  ENGA: { label: 'אירוסים', singleton: true },
  ANUL: { label: 'ביטול נישואים', singleton: true },
  MARB: { label: 'הכרזת נישואים' },
  MARC: { label: 'כתובה / הסכם נישואים' },
  MARL: { label: 'רישיון נישואים' },
  MARS: { label: 'הסדר נישואים' },
  RESI: { label: 'מגורים משותפים' },
  CENS: { label: 'מפקד אוכלוסין משפחתי' },
  EVEN: { label: 'אירוע משפחתי', supportsType: true },
  FACT: { label: 'עובדה משפחתית', supportsType: true },
  NCHI: { label: 'מספר ילדים במשפחה' },
  SLGS: { label: 'חיתום זוגי LDS' },
  NO: { label: 'שלילת אירוע משפחתי', supportsType: true },
};

export const SINGLETON_FAM_EVENT_TAGS = new Set(
  Object.entries(FAM_EVENT_TAGS)
    .filter(([, meta]) => meta.singleton)
    .map(([tag]) => tag),
);

export const SINGLETON_EVENT_TAGS = new Set(
  Object.entries(INDI_EVENT_TAGS)
    .filter(([, meta]) => meta.singleton)
    .map(([tag]) => tag),
);

export const FORBIDDEN_GENERIC_TAGS = new Set([
  'HEAD',
  'TRLR',
  'INDI',
  'FAM',
  'FAMC',
  'FAMS',
  'HUSB',
  'WIFE',
  'CHIL',
  'SUBM',
  'SUBN',
  'REPO',
  'OBJE',
  'SOUR',
  'NOTE',
  'SNOTE',
  'CONT',
  'CONC',
  'GEDC',
  'CHAR',
  'VERS',
  'NAME',
  'SEX',
]);

export const EVENT_NAMES = {
  ...Object.fromEntries(Object.entries(INDI_EVENT_TAGS).map(([tag, meta]) => [tag, meta.label])),
  ...Object.fromEntries(Object.entries(FAM_EVENT_TAGS).map(([tag, meta]) => [tag, meta.label])),
  RESI: 'מגורים',
  OCCU: 'עיסוק',
  EDUC: 'לימודים',
  PROP: 'רכוש / נכסים',
  FACT: 'עובדה',
  NO: 'שלילת אירוע',
  CHIL_BIRT: 'הולדת ילד/ה',
};

export const ATTRIBUTE_NAMES = {
  ...Object.fromEntries(Object.entries(INDI_ATTRIBUTE_TAGS).map(([tag, meta]) => [tag, meta.label])),
  ...Object.fromEntries(Object.entries(INDI_CONTACT_AND_META_TAGS).map(([tag, meta]) => [tag, meta.label])),
  NPFX: 'קידומת שם',
  SPFX: 'קידומת שם משפחה',
  NSFX: 'סיומת שם',
  NICK: 'כינוי',
};

export function isValidGedcomTagName(tag) {
  const normalized = String(tag ?? '').trim().toUpperCase();
  return /^[A-Z0-9_]{2,31}$/.test(normalized) && !FORBIDDEN_GENERIC_TAGS.has(normalized);
}

/** Event tag -> { prefix, hasCause } mapping used by validator & GEDCOM writer. */
export const SCALAR_EVENT_DEFINITIONS = [
  ...Object.entries(INDI_EVENT_TAGS)
    .filter(([, meta]) => Boolean(meta.fieldPrefix))
    .map(([tag, meta]) => ({
      tag,
      prefix: meta.fieldPrefix,
      hasCause: Boolean(meta.hasCause),
      label: meta.label,
    })),
  { tag: 'RESI', prefix: 'residence', hasCause: false, label: INDI_ATTRIBUTE_TAGS.RESI.label },
];

/** Attribute/contact/meta tag -> fieldKey mapping used by validator & GEDCOM writer. */
export const SCALAR_ATTRIBUTE_DEFINITIONS = [
  ...Object.entries(INDI_ATTRIBUTE_TAGS)
    .filter(([, meta]) => Boolean(meta.fieldKey))
    .map(([tag, meta]) => ({ tag, fieldKey: meta.fieldKey, label: meta.label, multiline: false })),
  ...Object.entries(INDI_CONTACT_AND_META_TAGS)
    .filter(([, meta]) => Boolean(meta.fieldKey))
    .map(([tag, meta]) => ({
      tag,
      fieldKey: meta.fieldKey,
      label: meta.label,
      multiline: Boolean(meta.multiline),
    })),
];

export const PEDIGREE_TYPES = ['birth', 'adopted', 'foster', 'sealing'];

export const RELATION_CANONICAL_SET = new Set([
  'father',
  'mother',
  'parent',
  'husband',
  'wife',
  'spouse',
  'son',
  'daughter',
  'child',
  'brother',
  'sister',
  'sibling',
]);

export const RELATION_LABELS_HE = {
  father: 'אבא',
  mother: 'אמא',
  parent: 'הורה',
  husband: 'בעל',
  wife: 'אישה',
  spouse: 'בן/בת זוג',
  son: 'בן',
  daughter: 'בת',
  child: 'ילד/ה',
  brother: 'אח',
  sister: 'אחות',
  sibling: 'אח/ות',
};

const RELATION_ALIASES = {
  father: 'father',
  dad: 'father',
  papa: 'father',
  אבא: 'father',
  אב: 'father',
  אביו: 'father',
  אביה: 'father',
  mother: 'mother',
  mom: 'mother',
  mama: 'mother',
  אמא: 'mother',
  אם: 'mother',
  אמו: 'mother',
  אמה: 'mother',
  parent: 'parent',
  הורה: 'parent',
  husband: 'husband',
  בעל: 'husband',
  בעלה: 'husband',
  wife: 'wife',
  אישה: 'wife',
  אשה: 'wife',
  אשתו: 'wife',
  spouse: 'spouse',
  partner: 'spouse',
  'בן זוג': 'spouse',
  'בת זוג': 'spouse',
  'בן/בת זוג': 'spouse',
  'בני זוג': 'spouse',
  זוג: 'spouse',
  son: 'son',
  בן: 'son',
  בנו: 'son',
  בנה: 'son',
  daughter: 'daughter',
  בת: 'daughter',
  בתו: 'daughter',
  בתה: 'daughter',
  child: 'child',
  ילד: 'child',
  ילדה: 'child',
  'ילד/ה': 'child',
  brother: 'brother',
  אח: 'brother',
  אחיו: 'brother',
  אחיה: 'brother',
  sister: 'sister',
  אחות: 'sister',
  אחותו: 'sister',
  אחותה: 'sister',
  sibling: 'sibling',
  'אח/ות': 'sibling',
};

export function normalizeRelationType(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return RELATION_ALIASES[key] || null;
}

export function inferSexFromRelation(relation) {
  const canonical = normalizeRelationType(relation) || relation;
  if (['father', 'husband', 'son', 'brother'].includes(canonical)) return 'M';
  if (['mother', 'wife', 'daughter', 'sister'].includes(canonical)) return 'F';
  return 'U';
}

export function relationCategory(relation) {
  const canonical = normalizeRelationType(relation) || relation;
  if (['father', 'mother', 'parent'].includes(canonical)) return 'parent';
  if (['husband', 'wife', 'spouse'].includes(canonical)) return 'spouse';
  if (['son', 'daughter', 'child'].includes(canonical)) return 'child';
  if (['brother', 'sister', 'sibling'].includes(canonical)) return 'sibling';
  return null;
}

export const MANUAL_TAG_GROUPS = [
  {
    id: 'events',
    label: 'אירועי חיים (Events)',
    options: [
      { key: 'EVENT:BURI', tag: 'BURI', kind: 'event', label: 'קבורה (BURI)' },
      { key: 'EVENT:CREM', tag: 'CREM', kind: 'event', label: 'שריפת גופה (CREM)' },
      { key: 'EVENT:IMMI', tag: 'IMMI', kind: 'event', label: 'עלייה / הגירה (IMMI)' },
      { key: 'EVENT:EMIG', tag: 'EMIG', kind: 'event', label: 'הגירה החוצה (EMIG)' },
      { key: 'EVENT:NATU', tag: 'NATU', kind: 'event', label: 'התאזרחות (NATU)' },
      { key: 'EVENT:BARM', tag: 'BARM', kind: 'event', label: 'בר מצווה (BARM)' },
      { key: 'EVENT:BASM', tag: 'BASM', kind: 'event', label: 'בת מצווה (BASM)' },
      { key: 'EVENT:CIRC', tag: 'CIRC', kind: 'event', label: 'ברית מילה (CIRC)' },
      { key: 'EVENT:ADOP', tag: 'ADOP', kind: 'event', label: 'אימוץ (ADOP)' },
      { key: 'EVENT:BAPM', tag: 'BAPM', kind: 'event', label: 'טבילה (BAPM)' },
      { key: 'EVENT:CHR', tag: 'CHR', kind: 'event', label: 'הטבלה בילדות (CHR)' },
      { key: 'EVENT:CHRA', tag: 'CHRA', kind: 'event', label: 'הטבלה בבגרות (CHRA)' },
      { key: 'EVENT:BLES', tag: 'BLES', kind: 'event', label: 'ברכה (BLES)' },
      { key: 'EVENT:CONF', tag: 'CONF', kind: 'event', label: 'קונפירמציה (CONF)' },
      { key: 'EVENT:FCOM', tag: 'FCOM', kind: 'event', label: 'לחם הקודש הראשון (FCOM)' },
      { key: 'EVENT:ORDN', tag: 'ORDN', kind: 'event', label: 'הסמכה לרבנות / כמורה (ORDN)' },
      { key: 'EVENT:GRAD', tag: 'GRAD', kind: 'event', label: 'סיום לימודים (GRAD)' },
      { key: 'EVENT:RETI', tag: 'RETI', kind: 'event', label: 'פרישה (RETI)' },
      { key: 'EVENT:CENS', tag: 'CENS', kind: 'event', label: 'מפקד אוכלוסין (CENS)' },
      { key: 'EVENT:PROB', tag: 'PROB', kind: 'event', label: 'אישור צוואה (PROB)' },
      { key: 'EVENT:WILL', tag: 'WILL', kind: 'event', label: 'צוואה (WILL)' },
      { key: 'EVENT:_MILT', tag: '_MILT', kind: 'event', label: 'שירות צבאי (_MILT)' },
      { key: 'EVENT:BAPL', tag: 'BAPL', kind: 'event', label: 'טבילת LDS (BAPL)' },
      { key: 'EVENT:CONL', tag: 'CONL', kind: 'event', label: 'אישור LDS (CONL)' },
      { key: 'EVENT:ENDL', tag: 'ENDL', kind: 'event', label: 'הענקת LDS (ENDL)' },
      { key: 'EVENT:INIL', tag: 'INIL', kind: 'event', label: 'חניכת LDS (INIL)' },
      { key: 'EVENT:SLGC', tag: 'SLGC', kind: 'event', label: 'חיתום להורים LDS (SLGC)' },
      { key: 'EVENT:EVEN', tag: 'EVEN', kind: 'event', supportsType: true, label: 'אירוע מותאם (EVEN)' },
      { key: 'EVENT:NO', tag: 'NO', kind: 'event', supportsType: true, label: 'שלילת אירוע (NO)' },
    ],
  },
  {
    id: 'attributes',
    label: 'מאפיינים ועובדות (Attributes)',
    options: [
      { key: 'ATTR:EDUC', tag: 'EDUC', kind: 'attribute', label: 'השכלה (EDUC)' },
      { key: 'ATTR:RELI', tag: 'RELI', kind: 'attribute', label: 'דת (RELI)' },
      { key: 'ATTR:NATI', tag: 'NATI', kind: 'attribute', label: 'לאום / אזרחות (NATI)' },
      { key: 'ATTR:DSCR', tag: 'DSCR', kind: 'attribute', label: 'תיאור פיזי (DSCR)' },
      { key: 'ATTR:IDNO', tag: 'IDNO', kind: 'attribute', label: 'מספר זיהוי / ת״ז (IDNO)' },
      { key: 'ATTR:SSN', tag: 'SSN', kind: 'attribute', label: 'מספר ביטוח לאומי (SSN)' },
      { key: 'ATTR:CAST', tag: 'CAST', kind: 'attribute', label: 'מעמד / קאסטה (CAST)' },
      { key: 'ATTR:PROP', tag: 'PROP', kind: 'attribute', label: 'רכוש / נכסים (PROP)' },
      { key: 'ATTR:NCHI', tag: 'NCHI', kind: 'attribute', label: 'מספר ילדים (NCHI)' },
      { key: 'ATTR:NMR', tag: 'NMR', kind: 'attribute', label: 'מספר נישואים (NMR)' },
      { key: 'ATTR:FACT', tag: 'FACT', kind: 'attribute', supportsType: true, label: 'עובדה (FACT)' },
    ],
  },
  {
    id: 'names',
    label: 'חלקי שם ושמות נוספים (Name)',
    options: [
      { key: 'SCALAR:nickname', tag: 'NICK', kind: 'scalar', fieldKey: 'nickname', label: 'כינוי (NICK)' },
      { key: 'SCALAR:namePrefix', tag: 'NPFX', kind: 'scalar', fieldKey: 'namePrefix', label: 'קידומת שם (NPFX)' },
      { key: 'SCALAR:surnamePrefix', tag: 'SPFX', kind: 'scalar', fieldKey: 'surnamePrefix', label: 'קידומת שם משפחה (SPFX)' },
      { key: 'SCALAR:nameSuffix', tag: 'NSFX', kind: 'scalar', fieldKey: 'nameSuffix', label: 'סיומת שם (NSFX)' },
      { key: 'SCALAR:birthSurname', tag: 'NAME_BIRTH', kind: 'scalar', fieldKey: 'birthSurname', label: 'שם נעורים / לידה' },
      { key: 'SCALAR:marriedSurname', tag: 'NAME_MARRIED', kind: 'scalar', fieldKey: 'marriedSurname', label: 'שם נישואים' },
      { key: 'SCALAR:alternateName', tag: 'NAME_AKA', kind: 'scalar', fieldKey: 'alternateName', label: 'שם נוסף / חלופי (AKA)' },
    ],
  },
  {
    id: 'contact',
    label: 'קשר, סימוכין ופרטיות (Contact & Meta)',
    options: [
      { key: 'ATTR:ADDR', tag: 'ADDR', kind: 'attribute', label: 'כתובת (ADDR)' },
      { key: 'ATTR:PHON', tag: 'PHON', kind: 'attribute', label: 'טלפון (PHON)' },
      { key: 'ATTR:EMAIL', tag: 'EMAIL', kind: 'attribute', label: 'דוא״ל (EMAIL)' },
      { key: 'ATTR:WWW', tag: 'WWW', kind: 'attribute', label: 'אתר אינטרנט (WWW)' },
      { key: 'ATTR:FAX', tag: 'FAX', kind: 'attribute', label: 'פקס (FAX)' },
      { key: 'ATTR:REFN', tag: 'REFN', kind: 'attribute', label: 'מספר סימוכין (REFN)' },
      { key: 'ATTR:UID', tag: 'UID', kind: 'attribute', label: 'מזהה ייחודי (UID)' },
      { key: 'ATTR:EXID', tag: 'EXID', kind: 'attribute', label: 'מזהה חיצוני (EXID)' },
      { key: 'ATTR:RIN', tag: 'RIN', kind: 'attribute', label: 'מזהה מערכת (RIN)' },
      { key: 'ATTR:AFN', tag: 'AFN', kind: 'attribute', label: 'מספר קובץ אבות (AFN)' },
      { key: 'ATTR:RFN', tag: 'RFN', kind: 'attribute', label: 'מזהה רשומה קבוע (RFN)' },
      { key: 'ATTR:RESN', tag: 'RESN', kind: 'attribute', label: 'הגבלת פרטיות (RESN)' },
      { key: 'ATTR:ALIA', tag: 'ALIA', kind: 'attribute', label: 'כינוי / הפניה (ALIA)' },
    ],
  },
  {
    id: 'familyEvents',
    label: 'אירועי משפחה (FAM)',
    options: [
      { key: 'FAM:MARR', tag: 'MARR', kind: 'familyEvent', label: 'נישואים (MARR)' },
      { key: 'FAM:DIV', tag: 'DIV', kind: 'familyEvent', label: 'גירושים (DIV)' },
      { key: 'FAM:ENGA', tag: 'ENGA', kind: 'familyEvent', label: 'אירוסים (ENGA)' },
      { key: 'FAM:DIVF', tag: 'DIVF', kind: 'familyEvent', label: 'בקשת גירושים (DIVF)' },
      { key: 'FAM:ANUL', tag: 'ANUL', kind: 'familyEvent', label: 'ביטול נישואים (ANUL)' },
      { key: 'FAM:MARB', tag: 'MARB', kind: 'familyEvent', label: 'הכרזת נישואים (MARB)' },
      { key: 'FAM:MARC', tag: 'MARC', kind: 'familyEvent', label: 'כתובה / הסכם נישואים (MARC)' },
      { key: 'FAM:MARL', tag: 'MARL', kind: 'familyEvent', label: 'רישיון נישואים (MARL)' },
      { key: 'FAM:MARS', tag: 'MARS', kind: 'familyEvent', label: 'הסדר נישואים (MARS)' },
      { key: 'FAM:RESI', tag: 'RESI', kind: 'familyEvent', label: 'מגורים משותפים (FAM RESI)' },
      { key: 'FAM:CENS', tag: 'CENS', kind: 'familyEvent', label: 'מפקד משפחתי (FAM CENS)' },
      { key: 'FAM:EVEN', tag: 'EVEN', kind: 'familyEvent', supportsType: true, label: 'אירוע משפחתי (FAM EVEN)' },
      { key: 'FAM:FACT', tag: 'FACT', kind: 'familyEvent', supportsType: true, label: 'עובדה משפחתית (FAM FACT)' },
      { key: 'FAM:SLGS', tag: 'SLGS', kind: 'familyEvent', label: 'חיתום זוגי LDS (SLGS)' },
    ],
  },
  {
    id: 'custom',
    label: 'תגית מותאמת אישית',
    options: [
      { key: 'CUSTOM', tag: 'CUSTOM', kind: 'custom', label: 'תגית GEDCOM מותאמת אישית (_TAG)' },
    ],
  },
];
