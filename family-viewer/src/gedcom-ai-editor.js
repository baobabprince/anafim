/**
 * GEDCOM Person Editor & Schema Validator
 * Safely parses, validates, and updates an individual's record (INDI) within a raw GEDCOM string.
 */

export const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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

  // Fallback: if there's a 4-digit year, return it
  const justYear = str.match(/\b(\d{3,4})\b/);
  if (justYear) return justYear[1];

  return str;
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

  const allowedKeys = new Set([
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

  const unknownKeys = Object.keys(updates).filter(k => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    errors.push(`התקבלו שדות לא מוכרים: ${unknownKeys.join(', ')}`);
  }

  const sanitized = {};
  const diff = {};

  // Validate Alternate Names
  if (updates.alternateNames !== undefined && updates.alternateNames !== null) {
    if (typeof updates.alternateNames === 'string') {
      const alt = updates.alternateNames.trim();
      sanitized.alternateNames = alt ? [alt] : [];
      diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
    } else if (Array.isArray(updates.alternateNames)) {
      const valid = updates.alternateNames.every(a => typeof a === 'string');
      if (!valid) {
        errors.push('מערך alternateNames חייב להכיל מחרוזות בלבד.');
      } else {
        sanitized.alternateNames = updates.alternateNames.map(a => a.trim()).filter(Boolean);
        diff.alternateNames = { old: currentPerson.alternateNames || [], new: sanitized.alternateNames };
      }
    } else {
      errors.push('השדה alternateNames חייב להיות מחרוזת או מערך מחרוזות.');
    }
  } else if (updates.alternateName !== undefined && updates.alternateName !== null) {
    if (typeof updates.alternateName === 'string') {
      const alt = updates.alternateName.trim();
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
        const val = updates[field].trim();
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
        const formatted = formatToGedcomDate(updates[field]);
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
    const existingGiven = nameNode?.children.find(c => c.tag === 'GIVN')?.val || '';
    const existingSurn = nameNode?.children.find(c => c.tag === 'SURN')?.val || '';
    const existingNick = nameNode?.children.find(c => c.tag === 'NICK')?.val || '';

    const newGiven = updates.givenName !== undefined ? updates.givenName : existingGiven;
    const newSurn = updates.surname !== undefined ? updates.surname : existingSurn;
    const newNick = updates.nickname !== undefined ? updates.nickname : existingNick;

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
      const cleanAlt = alt.trim();
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
    let occuNode = subNodes.find(n => n.tag === 'OCCU');
    if (updates.occupation) {
      if (!occuNode) {
        occuNode = { tag: 'OCCU', val: updates.occupation, raw: `1 OCCU ${updates.occupation}`, children: [] };
        subNodes.push(occuNode);
      } else {
        occuNode.val = updates.occupation;
        occuNode.raw = `1 OCCU ${updates.occupation}`;
      }
    } else if (occuNode) {
      const idx = subNodes.indexOf(occuNode);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  }

  // Update EDUC
  if (updates.education !== undefined) {
    let educNode = subNodes.find(n => n.tag === 'EDUC');
    if (updates.education) {
      if (!educNode) {
        educNode = { tag: 'EDUC', val: updates.education, raw: `1 EDUC ${updates.education}`, children: [] };
        subNodes.push(educNode);
      } else {
        educNode.val = updates.education;
        educNode.raw = `1 EDUC ${updates.education}`;
      }
    } else if (educNode) {
      const idx = subNodes.indexOf(educNode);
      if (idx >= 0) subNodes.splice(idx, 1);
    }
  }

  // Helper to update Event node (BIRT, DEAT, RESI)
  const updateEventNode = (tag, dateVal, placeVal, extraTag, extraVal) => {
    let node = subNodes.find(n => n.tag === tag);
    const hasInfo = Boolean(dateVal || placeVal || extraVal);
    if (!hasInfo) return;

    if (!node) {
      node = { tag, val: '', raw: `1 ${tag}`, children: [] };
      subNodes.push(node);
    }

    if (dateVal !== undefined) {
      let dNode = node.children.find(c => c.tag === 'DATE');
      if (dateVal) {
        if (!dNode) {
          node.children.push({ level: 2, tag: 'DATE', val: dateVal, raw: `2 DATE ${dateVal}` });
        } else {
          dNode.val = dateVal;
          dNode.raw = `2 DATE ${dateVal}`;
        }
      } else if (dNode) {
        node.children = node.children.filter(c => c.tag !== 'DATE');
      }
    }

    if (placeVal !== undefined) {
      let pNode = node.children.find(c => c.tag === 'PLAC');
      if (placeVal) {
        if (!pNode) {
          node.children.push({ level: 2, tag: 'PLAC', val: placeVal, raw: `2 PLAC ${placeVal}` });
        } else {
          pNode.val = placeVal;
          pNode.raw = `2 PLAC ${placeVal}`;
        }
      } else if (pNode) {
        node.children = node.children.filter(c => c.tag !== 'PLAC');
      }
    }

    if (extraTag && extraVal !== undefined) {
      let xNode = node.children.find(c => c.tag === extraTag);
      if (extraVal) {
        if (!xNode) {
          node.children.push({ level: 2, tag: extraTag, val: extraVal, raw: `2 ${extraTag} ${extraVal}` });
        } else {
          xNode.val = extraVal;
          xNode.raw = `2 ${extraTag} ${extraVal}`;
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
    let node = subNodes.find(n => n.tag === tag);
    if (val) {
      if (!node) {
        node = { tag, val, raw: `1 ${tag} ${val}`, children: [] };
        subNodes.push(node);
      } else {
        node.val = val;
        node.raw = `1 ${tag} ${val}`;
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
    // Keep non-NOTE subNodes and add new NOTE nodes
    // First remove top-level NOTEs that are inline
    for (const noteText of updates.notes) {
      if (!noteText) continue;
      // Check if already exists to avoid exact duplication
      const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === noteText);
      if (!exists) {
        subNodes.push({ tag: 'NOTE', val: noteText, raw: `1 NOTE ${noteText}`, children: [] });
      }
    }
  }

  // Update source as a dedicated NOTE (מקור)
  if (updates.source !== undefined && updates.source) {
    const sourceNote = updates.source.startsWith('מקור:') || updates.source.startsWith('מקור :')
      ? updates.source
      : `מקור: ${updates.source}`;
    const exists = subNodes.some(n => n.tag === 'NOTE' && n.val === sourceNote);
    if (!exists) {
      subNodes.push({ tag: 'NOTE', val: sourceNote, raw: `1 NOTE ${sourceNote}`, children: [] });
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
