// GEDCOM 5.5 / 5.5.1 / 7 reader. The same parser works synchronously, in a worker, or in cooperative browser tasks.
import { INDI_EVENT_TAGS, FAM_EVENT_TAGS } from './gedcom-tags.js';

const child = (n, tag) => n?.children?.find(c => c.tag === tag);
const children = (n, tag) => n?.children?.filter(c => c.tag === tag) || [];
const value = (n, tag) => child(n, tag)?.value || '';
const unique = xs => [...new Set(xs.filter(Boolean))];
const ref = s => /^@[^@]+@$/.test((s || '').trim()) ? s.trim() : null;

const INDI_EVENT_TAG_SET = new Set([...Object.keys(INDI_EVENT_TAGS), 'RESI', 'OCCU', 'EDUC', 'PROP', 'FACT']);
const INDI_ATTR_TAG_SET = new Set([
  'NATI', 'RELI', 'TITL', 'DSCR', 'IDNO', 'SSN', 'CAST', 'PROP', 'EDUC', 'FACT',
  'NCHI', 'NMR', 'PHON', 'EMAIL', 'WWW', 'FAX', 'ADDR', 'REFN', 'RESN', 'UID',
  'EXID', 'AFN', 'RFN', 'RIN', 'ALIA', 'NO',
]);
const INDI_STRUCTURAL_HANDLED = new Set([
  'NAME', 'SEX', 'FAMC', 'FAMS', 'OBJE', 'NOTE', 'SNOTE', 'SOUR',
  'CHAN', 'CREA', 'SUBM', 'ANCI', 'DESI', 'OCCU', 'ASSO',
]);
const FAM_EXTRA_EVENT_TAGS = new Set(Object.keys(FAM_EVENT_TAGS).filter(t => t !== 'MARR' && t !== 'DIV'));

function text(n) {
  if (!n) return '';
  const join = node => {
    let result = node.value || '';
    for (const c of node.children || []) {
      if (c.tag === 'CONT') result += '\n' + join(c);
      if (c.tag === 'CONC') result += join(c);
    }
    return result;
  };
  return join(n).trim();
}

function formatAddressNode(addrNode) {
  if (!addrNode) return '';
  const baseText = text(addrNode);
  const subParts = ['ADR1', 'ADR2', 'ADR3', 'CITY', 'STAE', 'POST', 'CTRY']
    .map(tag => text(child(addrNode, tag)))
    .filter(Boolean);
  if (!subParts.length) return baseText;
  if (!baseText) return subParts.join(', ');
  const missing = subParts.filter(part => !baseText.includes(part));
  return missing.length ? `${baseText}\n${missing.join(', ')}` : baseText;
}

export function normalize(s = '') {
  return String(s).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[\u200e\u200f]/g, '').toLocaleLowerCase().replace(/[\/"׳״'.,־–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export { decodeGedcom } from './gedcom-encoding.js';

function citationsFromNode(n) {
  return children(n, 'SOUR').map(source => ({ id:source.value.trim(), page:text(child(source,'PAGE')), text:text(child(child(source,'DATA'),'TEXT')) || text(child(source,'TEXT')) }));
}

function eventFromNode(n) {
  const placNode = child(n, 'PLAC');
  const mapNode = child(placNode, 'MAP');
  const lati = value(mapNode, 'LATI');
  const long = value(mapNode, 'LONG');
  const coordinates = (lati || long) ? { lat: lati, lng: long } : null;
  return {
    type: n.tag,
    label: value(n, 'TYPE'),
    date: value(n, 'DATE'),
    time: value(child(n, 'DATE'), 'TIME'),
    place: text(placNode),
    address: formatAddressNode(child(n, 'ADDR')),
    cause: text(child(n, 'CAUS')),
    age: value(n, 'AGE'),
    agency: text(child(n, 'AGNC')),
    religion: text(child(n, 'RELI')),
    phone: value(n, 'PHON'),
    email: value(n, 'EMAIL'),
    www: value(n, 'WWW'),
    coordinates,
    detail: n.value === 'Y' ? '' : n.value,
    notes: [...children(n, 'NOTE'), ...children(n, 'SNOTE')].map(text),
    sources: citationsFromNode(n),
  };
}

function* parseGedcomSteps(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('הקובץ ריק. בחרו קובץ GEDCOM המכיל אנשים ומשפחות.');
  if (raw.startsWith('%PDF')) throw new Error('זהו קובץ PDF. כדי להציג את המשפחה, יש להעלות קובץ GEDCOM בסיומת ‎.ged.');
  const people = {}, families = {}, notes = {}, sources = {}, mediaObjects = {}, warnings = [], order = [];
  let metadata = { version: '', source: '', charset: '', file: '', date: '' };
  let root = null, stack = [], malformed = 0;
  const warn = message => { if (warnings.length < 100 && !warnings.includes(message)) warnings.push(message); };
  const addRecord = n => {
    if (!n) return;
    if (n.tag === 'HEAD') {
      metadata = { version: value(child(n, 'GEDC'), 'VERS'), source: value(n, 'SOUR'), charset: value(n, 'CHAR'), file: value(n, 'FILE'), date: value(n, 'DATE') };
    } else if (n.tag === 'INDI' && n.xref) {
      if (people[n.xref]) { warn(`מזהה אדם כפול: ${n.xref}. נשמר הרישום הראשון.`); return; }
      const nameNodes = children(n, 'NAME');
      const parseNameNode = nn => {
        if (!nn) return null;
        const type = value(nn, 'TYPE').toLowerCase();
        const rawName = text(nn);
        const split = rawName.match(/^(.*?)\/(.*?)\/(.*)$/s);
        const npfx = value(nn, 'NPFX');
        const spfx = value(nn, 'SPFX');
        const nsfx = value(nn, 'NSFX');
        const nick = value(nn, 'NICK');
        const given = value(nn, 'GIVN') || split?.[1]?.trim() || (split ? '' : rawName);
        const surname = value(nn, 'SURN') || split?.[2]?.trim() || '';
        const full = rawName.replace(/\//g, '').replace(/\s+/g, ' ').trim() || [npfx, given, spfx, surname, nsfx].filter(Boolean).join(' ') || '';
        const transliterations = [...children(nn, 'TRAN'), ...children(nn, 'ROMN'), ...children(nn, 'FONE')].map(text).filter(Boolean);
        return { type, given, surname, full, raw: rawName, npfx, nick, spfx, nsfx, transliterations };
      };
      const nameEntries = nameNodes.map(parseNameNode).filter(Boolean);
      const primaryEntry = nameEntries.find(e => !['married', 'married name', 'marriedname', 'aka', 'nick', 'nickname'].includes(e.type)) || nameEntries[0];
      const marriedEntry = nameEntries.find(e => ['married', 'married name', 'marriedname'].includes(e.type));
      const birthEntry = nameEntries.find(e => ['birth', 'maiden', 'birth name', 'birthname'].includes(e.type));
      const given = primaryEntry?.given || '';
      const surname = primaryEntry?.surname || '';
      const name = primaryEntry?.full || [given, surname].filter(Boolean).join(' ') || 'שם לא ידוע';
      let marriedSurname = marriedEntry?.surname || '';
      let birthSurname = birthEntry?.surname || '';
      if (!marriedSurname && birthSurname && surname && normalize(surname) !== normalize(birthSurname)) marriedSurname = surname;
      if (!birthSurname && marriedSurname && surname && normalize(surname) !== normalize(marriedSurname)) birthSurname = surname;
      if (!birthSurname && birthEntry?.full) {
        const bits = birthEntry.full.split(/\s+/);
        if (bits.length > 1) birthSurname = bits.at(-1);
      }
      const isCustomEvent = c => !INDI_EVENT_TAG_SET.has(c.tag) && !INDI_ATTR_TAG_SET.has(c.tag) && !INDI_STRUCTURAL_HANDLED.has(c.tag) && (child(c, 'DATE') || child(c, 'PLAC'));
      const events = n.children.filter(c => INDI_EVENT_TAG_SET.has(c.tag) || isCustomEvent(c)).map(eventFromNode);
      const alternateNames = nameEntries.filter(e => e !== primaryEntry).map(e => e.full).filter(Boolean);
      const nickname = nameEntries.map(e => e.nick).find(Boolean) || '';
      const namePrefix = primaryEntry?.npfx || '';
      const surnamePrefix = primaryEntry?.spfx || '';
      const nameSuffix = primaryEntry?.nsfx || '';
      const transliterations = unique(nameEntries.flatMap(e => e.transliterations || []));
      const attributes = n.children
        .filter(c => INDI_ATTR_TAG_SET.has(c.tag))
        .map(c => ({
          type: c.tag,
          label: value(c, 'TYPE'),
          value: c.tag === 'ADDR' ? formatAddressNode(c) : text(c),
          date: value(c, 'DATE'),
          place: text(child(c, 'PLAC')),
        }));
      const associations = children(n, 'ASSO').map(c => ({
        id: c.value.trim(),
        role: value(c, 'RELA') || value(c, 'ROLE'),
        notes: [...children(c, 'NOTE'), ...children(c, 'SNOTE')].map(text),
      }));
      const customTags = n.children
        .filter(c => !INDI_EVENT_TAG_SET.has(c.tag) && !INDI_ATTR_TAG_SET.has(c.tag) && !INDI_STRUCTURAL_HANDLED.has(c.tag) && !isCustomEvent(c))
        .map(c => ({
          tag: c.tag,
          label: value(c, 'TYPE'),
          value: text(c),
          date: value(c, 'DATE'),
          place: text(child(c, 'PLAC')),
        }));
      const p = {
        id: n.xref,
        name,
        given,
        surname,
        nickname,
        namePrefix,
        surnamePrefix,
        nameSuffix,
        transliterations,
        sex: value(n, 'SEX'),
        alternateNames,
        marriedSurname,
        birthSurname,
        birth: events.find(e => e.type === 'BIRT') || null,
        death: events.find(e => e.type === 'DEAT') || null,
        events,
        images: children(n, 'OBJE').map(object => object.value.trim() || children(object, 'FILE').map(text)).flat(),
        parentFamilies: children(n, 'FAMC').map(c => ({ id: c.value, type: value(c, 'PEDI') || 'birth' })),
        spouseFamilies: children(n, 'FAMS').map(c => c.value),
        notes: [...children(n, 'NOTE'), ...children(n, 'SNOTE')].map(text),
        sources: citationsFromNode(n),
        occupation: text(child(n, 'OCCU')),
        attributes,
        associations,
        customTags,
      };
      people[p.id] = p;
      order.push(p.id);
    } else if (n.tag === 'FAM' && n.xref) {
      if (families[n.xref]) { warn(`מזהה משפחה כפול: ${n.xref}. נשמר הרישום הראשון.`); return; }
      families[n.xref] = {
        id: n.xref,
        partners: unique([...children(n, 'HUSB'), ...children(n, 'WIFE'), ...children(n, '_PART')].map(c => c.value)),
        children: unique(children(n, 'CHIL').map(c => c.value)),
        marriage: child(n, 'MARR') ? eventFromNode(child(n, 'MARR')) : null,
        divorce: child(n, 'DIV') ? eventFromNode(child(n, 'DIV')) : null,
        relationshipStatus: text(child(n, '_STAT')) || text(child(n, '_MSTAT')),
        events: n.children.filter(c => FAM_EXTRA_EVENT_TAGS.has(c.tag) || (c.tag.startsWith('_') && !['_STAT', '_MSTAT'].includes(c.tag) && (child(c, 'DATE') || child(c, 'PLAC')))).map(eventFromNode),
        sources: citationsFromNode(n),
        notes: [...children(n, 'NOTE'), ...children(n, 'SNOTE')].map(text),
      };
    } else if (n.tag === 'OBJE' && n.xref) mediaObjects[n.xref] = children(n, 'FILE').map(text);
    else if (['NOTE','SNOTE'].includes(n.tag) && n.xref) notes[n.xref] = text(n);
    else if (n.tag === 'SOUR' && n.xref) sources[n.xref] = { id: n.xref, title: text(child(n, 'TITL')) || n.value, author: text(child(n, 'AUTH')), publication: text(child(n, 'PUBL')) };
  };
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  yield 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const match = lines[i].match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!match) { malformed++; continue; }
    const level = Number(match[1]);
    if (level > 99) { malformed++; continue; }
    const n = { tag: match[3].toUpperCase(), xref: match[2] || '', value: (match[4] || '').trimEnd(), children: [] };
    if (level === 0) { addRecord(root); root = n; stack = [n]; }
    else if (stack[level - 1]) { stack[level - 1].children.push(n); stack[level] = n; stack.length = level + 1; }
    else malformed++;
    if (i % 1000 === 0) yield Math.round(i / lines.length * 84);
  }
  addRecord(root);
  if (!order.length) throw new Error('לא נמצאו אנשים בקובץ. ודאו שזהו קובץ GEDCOM תקין, ולא PDF או קובץ ששמו שונה ל־‎.ged.');
  for (const p of Object.values(people)) {
    p.images = unique(p.images.flatMap(image => ref(image) ? mediaObjects[ref(image)] || [] : [image]));
  }
  if (malformed) warn(`${malformed.toLocaleString('he-IL')} שורות שלא זוהו דולגו. יתר המידע נטען.`);
  if (!metadata.version) warn('גרסת GEDCOM לא צוינה בכותרת הקובץ. המידע הזמין הוצג בכל זאת.');
  // Reconcile both directions: many genealogy programs omit one side of a link.
  yield 85;
  let reconciled = 0;
  for (const p of Object.values(people)) {
    if (++reconciled % 1000 === 0) yield 87;
    for (const pf of p.parentFamilies) {
      if (families[pf.id]) families[pf.id].children = unique([...families[pf.id].children, p.id]);
      else warn(`קישור למשפחה חסרה בקובץ: ${pf.id}`);
    }
    for (const fid of p.spouseFamilies) {
      if (families[fid]) families[fid].partners = unique([...families[fid].partners, p.id]);
      else warn(`קישור למשפחה חסרה בקובץ: ${fid}`);
    }
  }
  yield 89;
  reconciled = 0;
  for (const f of Object.values(families)) {
    if (++reconciled % 1000 === 0) yield 91;
    for (const id of [...f.partners, ...f.children]) if (!people[id]) warn(`קישור לאדם חסר בקובץ: ${id}`);
    f.partners = f.partners.filter(id => people[id]);
    f.children = f.children.filter(id => people[id] && !f.partners.includes(id));
    for (const id of f.partners) people[id].spouseFamilies = unique([...people[id].spouseFamilies, f.id]);
    for (const id of f.children) if (!people[id].parentFamilies.some(pf => pf.id === f.id)) people[id].parentFamilies.push({ id: f.id, type: 'birth' });
  }
  yield 93;
  const resolveNotes = list => list.map(n => ref(n) ? (notes[n] || 'הפניה להערה שאינה כלולה בקובץ') : n).filter(Boolean);
  reconciled = 0;
  for (const p of Object.values(people)) {
    if (++reconciled % 1000 === 0) yield 95;
    p.parentFamilies = p.parentFamilies.filter(pf => families[pf.id]);
    p.spouseFamilies = p.spouseFamilies.filter(id => families[id]);
    p.notes = resolveNotes(p.notes);
    p.events.forEach(e => { e.notes = resolveNotes(e.notes); });
    p.associations.forEach(a => { a.notes = resolveNotes(a.notes); });
    if (p.sex === 'F' && !p.marriedSurname && p.spouseFamilies.length) {
      const partnerSurnames = [];
      for (const fid of p.spouseFamilies) {
        const family = families[fid];
        if (!family) continue;
        for (const pid of family.partners) {
          if (pid === p.id) continue;
          const partner = people[pid];
          if (partner?.surname) partnerSurnames.push(partner.surname);
        }
      }
      const uniqueSurnames = [...new Set(partnerSurnames.map(s => s.trim()).filter(Boolean))];
      if (uniqueSurnames.length === 1) {
        const candidate = uniqueSurnames[0];
        if (!p.birthSurname || normalize(candidate) !== normalize(p.birthSurname)) p.marriedSurname = candidate;
      }
    }
    if (p.sex === 'F' && p.marriedSurname && !p.birthSurname && p.surname && normalize(p.surname) !== normalize(p.marriedSurname)) {
      p.birthSurname = p.surname;
    }
    p.search = normalize([
      p.name,
      p.nickname,
      p.namePrefix,
      p.surnamePrefix,
      p.nameSuffix,
      ...(p.transliterations || []),
      p.marriedSurname,
      p.birthSurname,
      ...p.alternateNames,
      p.birth?.date,
      p.birth?.place,
      p.death?.date,
      p.death?.place,
      p.id,
    ].filter(Boolean).join(' '));
  }
  for (const f of Object.values(families)) {
    f.notes = resolveNotes(f.notes);
    for (const event of [f.marriage,f.divorce,...(f.events || [])].filter(Boolean)) event.notes = resolveNotes(event.notes);
  }
  yield 97;
  const stats = calculateStats(people, families);
  yield 100;
  return { people, families, sources, order, metadata, warnings, stats };
}

export function parseGedcom(raw, onProgress = () => {}) {
  const steps = parseGedcomSteps(raw);
  while (true) {
    const step = steps.next();
    if (step.done) return step.value;
    onProgress(step.value);
  }
}

export async function parseGedcomAsync(raw, { onProgress = () => {}, signal, timeBudgetMs = 12 } = {}) {
  const abort = () => {
    if (signal?.aborted) {
      const error = new Error('טעינת הקובץ בוטלה.');
      error.name = 'AbortError';
      throw error;
    }
  };
  const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
  abort();
  await yieldToBrowser();
  const steps = parseGedcomSteps(raw);
  let lastYield = performance.now();
  while (true) {
    abort();
    const step = steps.next();
    if (step.done) return step.value;
    onProgress(step.value);
    if (performance.now() - lastYield >= timeBudgetMs) {
      await yieldToBrowser();
      lastYield = performance.now();
    }
  }
}

export function calculateStats(people, families) {
  // Kahn's algorithm is iterative, handles large trees, and does not recurse on cycles.
  const ids = Object.keys(people), depths = {}, indegrees = {}, descendants = {};
  ids.forEach(id => { depths[id] = 1; indegrees[id] = 0; descendants[id] = new Set(); });
  for (const f of Object.values(families)) for (const parent of f.partners) for (const kid of f.children) {
    if (parent !== kid && people[parent] && people[kid] && !descendants[parent].has(kid)) { descendants[parent].add(kid); indegrees[kid]++; }
  }
  const queue = ids.filter(id => !indegrees[id]);
  let max = 1, cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    for (const kid of descendants[id]) {
      depths[kid] = Math.max(depths[kid], depths[id] + 1);
      max = Math.max(max, depths[kid]);
      if (--indegrees[kid] === 0) queue.push(kid);
    }
  }
  return { people: ids.length, families: Object.keys(families).length, generations: max, cycles: cursor < ids.length, women: ids.filter(id => people[id].sex === 'F').length, men: ids.filter(id => people[id].sex === 'M').length };
}

export function getRelations(data, id, parentFamilyId) {
  const p = data.people[id];
  if (!p) return { parents: [], siblings: [], partners: [], children: [], parentFamilies: [] };
  const parentFamilies = p.parentFamilies.map(pf => ({ ...pf, family: data.families[pf.id] })).filter(pf => pf.family);
  const pf = parentFamilies.find(f => f.id === parentFamilyId) || parentFamilies.find(f => f.type === 'birth') || parentFamilies[0];
  const parentIds = pf?.family.partners.filter(pid => pid !== id) || [];
  const siblingIds = new Set(pf?.family.children.filter(pid => pid !== id) || []);
  for (const pid of parentIds) for (const fid of data.people[pid]?.spouseFamilies || []) for (const sid of data.families[fid]?.children || []) if (sid !== id && !parentIds.includes(sid)) siblingIds.add(sid);
  const siblings = [...siblingIds].filter(sid => data.people[sid]).map(sid => {
    const sp = data.people[sid];
    const theirParents = new Set(sp.parentFamilies.flatMap(f => data.families[f.id]?.partners || []));
    const shared = parentIds.filter(pid => theirParents.has(pid)).length;
    return { ...sp, half: parentIds.length > 1 && shared === 1 };
  });
  const partnerMap = new Map(), childMap = new Map();
  for (const fid of p.spouseFamilies) {
    const f = data.families[fid];
    if (!f) continue;
    const otherIds = f.partners.filter(pid => pid !== id);
    for (const pid of otherIds) if (data.people[pid]) partnerMap.set(pid, { ...data.people[pid], family: f });
    for (const cid of f.children) if (cid !== id && data.people[cid]) childMap.set(cid, { ...data.people[cid], otherParent: otherIds.map(pid => data.people[pid]?.given || data.people[pid]?.name).filter(Boolean).join(' ו') });
  }
  const byBirth = (a, b) => (getYear(a.birth?.date) || 9999) - (getYear(b.birth?.date) || 9999) || a.name.localeCompare(b.name, 'he');
  return { parents: parentIds.filter(pid => data.people[pid]).map(pid => data.people[pid]), siblings: siblings.sort(byBirth), partners: [...partnerMap.values()], children: [...childMap.values()].sort(byBirth), parentFamilies, activeParentFamily: pf?.id };
}

/**
 * Translation key describing how the earlier person in a path step relates to the next one.
 * `relationship` is the step value from findRelationshipPath (how the next person relates to the
 * earlier one); `sex` is the earlier person's GEDCOM SEX. Unknown sex falls back to neutral terms.
 */
export function relationshipPathLabelKey(relationship, sex) {
  const role = relationship === 'child' ? 'Parent' : relationship === 'parent' ? 'Child' : 'Partner';
  const gender = sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : '';
  return `fx.path${role}${gender}Of`;
}

export function findRelationshipPath(data, startId, endId) {
  if (!data?.people?.[startId] || !data.people[endId]) return null;
  if (startId === endId) return [{ id: startId, relationship: null }];

  const graph = new Map(Object.keys(data.people).map(id => [id, []]));
  const connect = (from, to, relationship, reverseRelationship = relationship) => {
    if (!graph.has(from) || !graph.has(to)) return;
    graph.get(from).push({ id: to, relationship });
    graph.get(to).push({ id: from, relationship: reverseRelationship });
  };
  for (const family of Object.values(data.families)) {
    for (let i = 0; i < family.partners.length; i++) {
      for (let j = i + 1; j < family.partners.length; j++) {
        connect(family.partners[i], family.partners[j], 'partner');
      }
    }
    for (const parentId of family.partners) {
      for (const childId of family.children) {
        connect(parentId, childId, 'child', 'parent');
      }
    }
  }

  const previous = new Map([[startId, null]]);
  const queue = [startId];
  for (let cursor = 0; cursor < queue.length && !previous.has(endId); cursor++) {
    const id = queue[cursor];
    for (const edge of graph.get(id)) {
      if (previous.has(edge.id)) continue;
      previous.set(edge.id, { id, relationship: edge.relationship });
      queue.push(edge.id);
    }
  }
  if (!previous.has(endId)) return null;

  const path = [];
  for (let id = endId; id !== null;) {
    const step = previous.get(id);
    path.push({ id, relationship: step?.relationship ?? null });
    id = step?.id ?? null;
  }
  return path.reverse();
}

export function getYear(date = '') {
  return Number(String(date).match(/\b(\d{3,4})\b/)?.[1]) || null;
}
const months = { JAN:'ינואר', FEB:'פברואר', MAR:'מרץ', APR:'אפריל', MAY:'מאי', JUN:'יוני', JUL:'יולי', AUG:'אוגוסט', SEP:'ספטמבר', OCT:'אוקטובר', NOV:'נובמבר', DEC:'דצמבר' };
const MONTH_INDEX = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function parseGedcomDateParts(date = '') {
  const raw = String(date || '').trim();
  if (!raw) return null;
  const full = raw.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{3,4})\b/i);
  if (full) {
    return { day: Number(full[1]), month: MONTH_INDEX.indexOf(full[2].toUpperCase()), year: Number(full[3]), precision: 'day' };
  }
  const monthYear = raw.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{3,4})\b/i);
  if (monthYear) {
    return { day: 1, month: MONTH_INDEX.indexOf(monthYear[1].toUpperCase()), year: Number(monthYear[2]), precision: 'month' };
  }
  const year = getYear(raw);
  if (year) return { day: 1, month: 0, year, precision: 'year' };
  return null;
}

export function hebrewDateLabel(date = '') {
  const parts = parseGedcomDateParts(date);
  if (!parts || parts.year < 1 || parts.year > 9999) return '';
  try {
    const utc = new Date(Date.UTC(parts.year, parts.month, parts.day));
    if (Number.isNaN(utc.getTime())) return '';
    if (parts.precision === 'year') {
      return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric', timeZone: 'UTC' }).format(utc);
    }
    if (parts.precision === 'month') {
      return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc);
    }
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(utc);
  } catch {
    return '';
  }
}

export function formatDate(date = '') {
  if (!date) return 'לא צוין';
  let d = date.trim();
  d = d.replace(/^ABT\s+/i,'בערך ב־').replace(/^CAL\s+/i,'מחושב: ').replace(/^EST\s+/i,'משוער: ').replace(/^BEF\s+/i,'לפני ').replace(/^AFT\s+/i,'אחרי ').replace(/^BET\s+/i,'בין ').replace(/\s+AND\s+/i,' ל־').replace(/^FROM\s+/i,'מ־').replace(/\s+TO\s+/i,' עד ');
  d = d.replace(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{3,4})\b/gi, (_, day, mon, year) => `${Number(day)} ב${months[mon.toUpperCase()]} ${year}`);
  d = d.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/gi, m => months[m.toUpperCase()]);
  return d;
}

/** Gregorian + Hebrew — only for the central person display. */
export function formatDateCentral(date = '') {
  if (!date) return 'לא צוין';
  const gregorian = formatDate(date);
  const hebrew = hebrewDateLabel(date);
  if (hebrew && hebrew !== gregorian) return `${gregorian} · ${hebrew}`;
  return gregorian;
}
export function lifeLabel(p) {
  if (!p) return '';
  const birth = getYear(p.birth?.date), death = getYear(p.death?.date);
  const approx = /\b(ABT|CAL|EST|BEF|AFT|BET|FROM)\b/i.test(p.birth?.date || '');
  if (birth && death) return `${approx ? 'כ־' : ''}${birth} – ${death}`;
  if (birth) return `${p.sex === 'F' ? 'נולדה' : p.sex === 'M' ? 'נולד' : 'לידה'} ${approx ? 'בסביבות ' : 'ב־'}${birth}${p.death ? ' · נפטר/ה' : ''}`;
  if (death) return `${p.sex === 'F' ? 'נפטרה' : 'נפטר/ה'} ב־${death}`;
  return 'תאריכים לא צוינו';
}
export function initials(p) {
  if (!p) return '?';
  return [p.given || p.name.split(' ')[0], p.surname || p.name.split(' ').at(-1)].filter(Boolean).map(s => [...s.trim()][0]).filter(Boolean).join('').slice(0, 2);
}
export function pedigreeLabel(type) {
  return ({ birth:'משפחת לידה', adopted:'משפחה מאמצת', foster:'משפחת אומנה', sealing:'משפחה מקושרת' })[type?.toLowerCase()] || 'משפחה נוספת';
}
