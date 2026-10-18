from pathlib import Path

def patch_gedcom_hebrew():
    path = Path('family-viewer/src/gedcom.js')
    text = path.read_text()
    if 'hebrewDateLabel' in text:
        print('hebrew already present')
        return
    old = """export function getYear(date = '') {
  return Number(String(date).match(/\\b(\\d{3,4})\\b/)?.[1]) || null;
}
const months = { JAN:'ינואר', FEB:'פברואר', MAR:'מרץ', APR:'אפריל', MAY:'מאי', JUN:'יוני', JUL:'יולי', AUG:'אוגוסט', SEP:'ספטמבר', OCT:'אוקטובר', NOV:'נובמבר', DEC:'דצמבר' };
export function formatDate(date = '') {
  if (!date) return 'לא צוין';
  let d = date.trim();
  d = d.replace(/^ABT\\s+/i,'בערך ב־').replace(/^CAL\\s+/i,'מחושב: ').replace(/^EST\\s+/i,'משוער: ').replace(/^BEF\\s+/i,'לפני ').replace(/^AFT\\s+/i,'אחרי ').replace(/^BET\\s+/i,'בין ').replace(/\\s+AND\\s+/i,' ל־').replace(/^FROM\\s+/i,'מ־').replace(/\\s+TO\\s+/i,' עד ');
  d = d.replace(/\\b(\\d{1,2})\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/gi, (_, day, mon, year) => `${Number(day)} ב${months[mon.toUpperCase()]} ${year}`);
  d = d.replace(/\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\b/gi, m => months[m.toUpperCase()]);
  return d;
}"""
    new = """export function getYear(date = '') {
  return Number(String(date).match(/\\b(\\d{3,4})\\b/)?.[1]) || null;
}
const months = { JAN:'ינואר', FEB:'פברואר', MAR:'מרץ', APR:'אפריל', MAY:'מאי', JUN:'יוני', JUL:'יולי', AUG:'אוגוסט', SEP:'ספטמבר', OCT:'אוקטובר', NOV:'נובמבר', DEC:'דצמבר' };
const MONTH_INDEX = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function parseGedcomDateParts(date = '') {
  const raw = String(date || '').trim();
  if (!raw) return null;
  const full = raw.match(/\\b(\\d{1,2})\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/i);
  if (full) {
    return { day: Number(full[1]), month: MONTH_INDEX.indexOf(full[2].toUpperCase()), year: Number(full[3]), precision: 'day' };
  }
  const monthYear = raw.match(/\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/i);
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
  const hebrew = hebrewDateLabel(d);
  d = d.replace(/^ABT\\s+/i,'בערך ב־').replace(/^CAL\\s+/i,'מחושב: ').replace(/^EST\\s+/i,'משוער: ').replace(/^BEF\\s+/i,'לפני ').replace(/^AFT\\s+/i,'אחרי ').replace(/^BET\\s+/i,'בין ').replace(/\\s+AND\\s+/i,' ל־').replace(/^FROM\\s+/i,'מ־').replace(/\\s+TO\\s+/i,' עד ');
  d = d.replace(/\\b(\\d{1,2})\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/gi, (_, day, mon, year) => `${Number(day)} ב${months[mon.toUpperCase()]} ${year}`);
  d = d.replace(/\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\b/gi, m => months[m.toUpperCase()]);
  if (hebrew) return `${d} · ${hebrew}`;
  return d;
}"""
    if old not in text:
        raise SystemExit('formatDate block missing')
    path.write_text(text.replace(old, new, 1))
    print('gedcom hebrew dates ok')


def patch_child_births():
    path = Path('family-viewer/src/person-info.js')
    text = path.read_text()
    if 'CHIL_BIRT' in text:
        print('child births already present')
        return
    text = text.replace(
        "CENS:'מפקד אוכלוסין', MARR:'נישואים', DIV:'גירושים', ENGA:'אירוסים',\n};",
        "CENS:'מפקד אוכלוסין', MARR:'נישואים', DIV:'גירושים', ENGA:'אירוסים', CHIL_BIRT:'הולדת ילד/ה',\n};",
    )
    old = """  const familyEvents = families.flatMap(family => {
    const partners = family.partners.filter(id => id !== person.id).map(id => data.people[id]).filter(Boolean);
    return [family.marriage, family.divorce, ...(family.events || [])]
      .filter(Boolean)
      .filter((event,index,array) => array.findIndex(other => other.type === event.type && other.date === event.date && other.place === event.place) === index)
      .map(event => ({...event, familyId:family.id, partners}));
  });
  const events = [...(person.events || []), ...familyEvents]"""
    new = """  const familyEvents = families.flatMap(family => {
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
  const events = [...(person.events || []), ...familyEvents, ...childBirths]"""
    if old not in text:
        raise SystemExit('familyEvents block missing')
    path.write_text(text.replace(old, new, 1))
    print('child births ok')


def patch_remember_default():
    path = Path('family-viewer/src/App.jsx')
    text = path.read_text()
    old = "const [file, setFile] = useState(null), [encoding, setEncoding] = useState('auto'), [remember, setRemember] = useState(false),"
    new = "const [file, setFile] = useState(null), [encoding, setEncoding] = useState('auto'), [remember, setRemember] = useState(true),"
    if old not in text:
        if '[remember, setRemember] = useState(true)' in text:
            print('remember default already true')
            return
        raise SystemExit('remember state missing')
    text = text.replace(old, new, 1)
    text = text.replace(
        'לזכור עותק לא מוצפן בדפדפן הזה<span className="field-hint">אופציונלי. במכשיר משותף מומלץ להשאיר כבוי. אפשר למחוק מפרטי הקובץ.</span>',
        'לזכור עותק לא מוצפן בדפדפן הזה<span className="field-hint">ברירת מחדל: שמירה במכשיר זה. במכשיר משותף מומלץ לכבות. אפשר למחוק מפרטי הקובץ.</span>',
    )
    path.write_text(text)
    print('remember default ok')


def patch_grandparents_default():
    path = Path('family-viewer/src/FamilyExperience.jsx')
    text = path.read_text()
    if 'preferGrandparentsOpen' in text:
        print('grandparents prefer already present')
        return
    old = """  const [showGrandparents,setShowGrandparents] = useState(true),[groups,setGroups] = useState(new Set()),[tab,setTab] = useState('overview'),[grandparentFamilies,setGrandparentFamilies] = useState({});
  useEffect(()=>{setGroups(new Set());setTab('overview');setShowGrandparents(true);setGrandparentFamilies({});},[person.id,data]);"""
    new = """  const preferGrandparentsOpen = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  const [showGrandparents,setShowGrandparents] = useState(preferGrandparentsOpen),[groups,setGroups] = useState(new Set()),[tab,setTab] = useState('overview'),[grandparentFamilies,setGrandparentFamilies] = useState({});
  useEffect(()=>{setGroups(new Set());setTab('overview');setShowGrandparents(preferGrandparentsOpen());setGrandparentFamilies({});},[person.id,data]);"""
    if old not in text:
        raise SystemExit('grandparents state missing')
    path.write_text(text.replace(old, new, 1))
    print('grandparents default ok')


def patch_timeline_child_display():
    path = Path('family-viewer/src/FamilyExperience.jsx')
    text = path.read_text()
    if "event.type === 'CHIL_BIRT'" in text and "event.type !== 'CHIL_BIRT'" in text:
        print('timeline child already handled')
        return
    marker = "{event.partners?.length > 0 && <span className=\"fx-event-partner\">"
    if marker in text:
        inject = "{event.type === 'CHIL_BIRT' && event.detail && <span className=\"fx-event-partner\" dir=\"auto\">{event.detail}</span>}{event.partners?.length > 0 && event.type !== 'CHIL_BIRT' && <span className=\"fx-event-partner\">"
        text = text.replace(marker, inject, 1)
        text = text.replace("{event.detail && <p dir=\"auto\">{event.detail}</p>}", "{event.detail && event.type !== 'CHIL_BIRT' && <p dir=\"auto\">{event.detail}</p>}", 1)
        path.write_text(text)
        print('timeline child detail ok')
        return
    print('timeline child display skipped')


if __name__ == '__main__':
    patch_gedcom_hebrew()
    patch_child_births()
    patch_remember_default()
    patch_grandparents_default()
    patch_timeline_child_display()
