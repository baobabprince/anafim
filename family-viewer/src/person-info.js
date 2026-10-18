import { getYear } from './gedcom.js';

export const EVENT_NAMES = {
  BIRT:'לידה', DEAT:'פטירה', BURI:'קבורה', CREM:'שריפה', BAPM:'טבילה', CHR:'טבילה',
  ADOP:'אימוץ', RESI:'מגורים', IMMI:'עלייה / הגירה', EMIG:'הגירה', NATU:'התאזרחות',
  GRAD:'סיום לימודים', RETI:'פרישה', OCCU:'עיסוק', EDUC:'לימודים', EVEN:'אירוע',
  CENS:'מפקד אוכלוסין', MARR:'נישואים', DIV:'גירושים', ENGA:'אירוסים', CHIL_BIRT:'הולדת ילד/ה',
};
export const ATTRIBUTE_NAMES = { NATI:'לאום כפי שתועד', RELI:'דת כפי שתועדה', TITL:'תואר', DSCR:'תיאור', IDNO:'מזהה נוסף', NCHI:'מספר ילדים כפי שתועד', NMR:'מספר נישואים כפי שתועד' };
export const eventTitle = event => event.label || EVENT_NAMES[event.type] || 'אירוע מתועד';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function dateSort(date = '') {
  const year = getYear(date);
  if (!year) return Infinity;
  const month = MONTHS.findIndex(m => new RegExp(`\\b${m}\\b`,'i').test(date));
  const day = date.match(/\b(\d{1,2})\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i)?.[1];
  return year * 10000 + (month + 1) * 100 + Number(day || 0);
}

export function personInformation(data, person) {
  const families = (person.spouseFamilies || []).map(id => data.families[id]).filter(Boolean);
  const familyEvents = families.flatMap(family => {
    const partners = family.partners.filter(id => id !== person.id).map(id => data.people[id]).filter(Boolean);
    return [family.marriage, family.divorce, ...(family.events || [])]
      .filter(Boolean)
      .filter((event,index,array) => array.findIndex(other => other.type === event.type && other.date === event.date && other.place === event.place) === index)
      .map(event => ({...event, familyId:family.id, partners}));
  });
  const childBirths = families.flatMap(family => {
    const partners = family.partners.filter(id => id !== person.id).map(id => data.people[id]).filter(Boolean);
    return (family.children || []).map(childId => {
      const child = data.people[childId];
      if (!child || childId === person.id) return null;
      const birth = child.birth;
      if (!(birth?.date || birth?.place)) return null;
      const label = child.sex === 'F' ? 'הולדת בת' : child.sex === 'M' ? 'הולדת בן' : 'הולדת ילד/ה';
      return {
        type: 'CHIL_BIRT',
        label,
        date: birth?.date || '',
        place: birth?.place || '',
        detail: child.given || child.name,
        childId: child.id,
        familyId: family.id,
        partners,
        notes: [],
        sources: birth?.sources || [],
      };
    }).filter(Boolean);
  });
  const events = [...(person.events || []), ...familyEvents, ...childBirths]
    .filter(e => e.date || e.place || e.detail || e.label || e.address || e.cause || e.age || e.notes?.length || e.sources?.length || e.type === 'DEAT')
    .sort((a,b) => dateSort(a.date) - dateSort(b.date));
  const seenNotes = new Set();
  const notes = [];
  const addNote = (text, context) => {
    if (!text?.trim() || seenNotes.has(text)) return;
    seenNotes.add(text);
    notes.push({text, context});
  };
  for (const note of person.notes || []) addNote(note,'הערה אישית');
  for (const event of events) for (const note of event.notes || []) addNote(note,eventTitle(event));
  for (const family of families) for (const note of family.notes || []) addNote(note,'מתיעוד המשפחה');
  const seenSources = new Set();
  const citations = [];
  const addCitation = (citation, context) => {
    const key = `${citation.id}|${citation.page || ''}|${citation.text || ''}`;
    if (seenSources.has(key)) return;
    seenSources.add(key);
    citations.push({...citation, source:data.sources?.[citation.id], context});
  };
  for (const citation of person.sources || []) addCitation(citation,'רשומת האדם');
  for (const event of events) for (const citation of event.sources || []) addCitation(citation,eventTitle(event));
  for (const family of families) for (const citation of family.sources || []) addCitation(citation,'רשומת המשפחה');
  const residence = [...(person.events || [])].reverse().find(e => e.type === 'RESI' && (e.place || e.detail));
  const places = [...new Set(events.map(e => e.place?.trim()).filter(Boolean))];
  return {events, notes, citations, sourceCount:new Set(citations.map(c=>c.id)).size, residence, places, families, ageAtDeath:ageAtDeath(person)};
}

// Iterative and cycle-safe. Shared ancestors are counted once, never once per path.
export function branchPeople(data, id, direction) {
  const seen = new Set([id]);
  const queue = [{id, depth:0}];
  const people = [];
  let depth = 0;
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index], person = data.people[item.id];
    if (!person) continue;
    const linked = direction === 'ancestors'
      ? (person.parentFamilies || []).flatMap(f => data.families[f.id]?.partners || [])
      : (person.spouseFamilies || []).flatMap(fid => data.families[fid]?.children || []);
    for (const nextId of linked) {
      if (seen.has(nextId) || !data.people[nextId]) continue;
      seen.add(nextId);
      const nextDepth = item.depth + 1;
      depth = Math.max(depth,nextDepth);
      queue.push({id:nextId,depth:nextDepth});
      people.push({person:data.people[nextId],depth:nextDepth});
    }
  }
  people.sort((a,b) => a.depth - b.depth || a.person.name.localeCompare(b.person.name,'he'));
  return {people, count:people.length, depth};
}

export function personRecord(raw, id) {
  const lines = raw.split(/\r\n|\r|\n/);
  const start = lines.findIndex(line => line.match(/^\s*0\s+(@[^@]+@)\s+INDI(?:\s|$)/i)?.[1] === id);
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && !/^\s*0\s+/.test(lines[end])) end++;
  return lines.slice(start,end).join('\n');
}

// Only compute an age from complete, unqualified Gregorian dates. No living
// status or age is inferred merely because a death record is absent.
export function ageAtDeath(person) {
  const parse = value => {
    const m = value?.trim().match(/^(\d{1,2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{3,4})$/i);
    if (!m) return null;
    const day=Number(m[1]),month=MONTHS.indexOf(m[2].toUpperCase()),year=Number(m[3]);
    const date=new Date(Date.UTC(year,month,day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? {date,year,month,day} : null;
  };
  const birth=parse(person.birth?.date),death=parse(person.death?.date);
  if (!birth || !death || death.date < birth.date) return null;
  return death.year-birth.year-Number(death.month < birth.month || (death.month === birth.month && death.day < birth.day));
}
