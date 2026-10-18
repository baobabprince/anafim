from pathlib import Path

def patch_gedcom():
    path = Path('family-viewer/src/gedcom.js')
    text = path.read_text()
    if 'marriedSurname' in text:
        print('gedcom already patched')
        return
    old = """      const nameNodes = children(n, 'NAME');
      const nn = nameNodes.find(x => !['married', 'aka'].includes(value(x, 'TYPE').toLowerCase())) || nameNodes[0];
      const rawName = text(nn);
      const split = rawName.match(/^(.*?)\\/(.*?)\\/(.*)$/s);
      const given = value(nn, 'GIVN') || split?.[1]?.trim() || (split ? '' : rawName);
      const surname = value(nn, 'SURN') || split?.[2]?.trim() || '';
      const name = rawName.replace(/\\//g, '').replace(/\\s+/g, ' ').trim() || [given, surname].filter(Boolean).join(' ') || 'שם לא ידוע';
      const eventTags = ['BIRT','DEAT','BURI','CREM','BAPM','CHR','ADOP','RESI','IMMI','EMIG','NATU','GRAD','RETI','OCCU','EDUC','EVEN','CENS'];
      const events = n.children.filter(c => eventTags.includes(c.tag)).map(eventFromNode);
      const p = { id: n.xref, name, given, surname, sex: value(n, 'SEX'), alternateNames: nameNodes.filter(x => x !== nn).map(x => text(x).replace(/\\//g, '').trim()), birth: events.find(e => e.type === 'BIRT') || null, death: events.find(e => e.type === 'DEAT') || null, events, parentFamilies: children(n, 'FAMC').map(c => ({ id: c.value, type: value(c, 'PEDI') || 'birth' })), spouseFamilies: children(n, 'FAMS').map(c => c.value), notes: [...children(n, 'NOTE'), ...children(n, 'SNOTE')].map(text), sources: citationsFromNode(n), occupation: text(child(n, 'OCCU')), attributes:n.children.filter(c=>['NATI','RELI','TITL','DSCR','IDNO','NCHI','NMR'].includes(c.tag)).map(c=>({type:c.tag,value:text(c)})) };"""
    new = """      const nameNodes = children(n, 'NAME');
      const parseNameNode = nn => {
        if (!nn) return null;
        const type = value(nn, 'TYPE').toLowerCase();
        const rawName = text(nn);
        const split = rawName.match(/^(.*?)\\/(.*?)\\/(.*)$/s);
        const given = value(nn, 'GIVN') || split?.[1]?.trim() || (split ? '' : rawName);
        const surname = value(nn, 'SURN') || split?.[2]?.trim() || '';
        const full = rawName.replace(/\\//g, '').replace(/\\s+/g, ' ').trim() || [given, surname].filter(Boolean).join(' ') || '';
        return { type, given, surname, full, raw: rawName };
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
        const bits = birthEntry.full.split(/\\s+/);
        if (bits.length > 1) birthSurname = bits.at(-1);
      }
      const eventTags = ['BIRT','DEAT','BURI','CREM','BAPM','CHR','ADOP','RESI','IMMI','EMIG','NATU','GRAD','RETI','OCCU','EDUC','EVEN','CENS'];
      const events = n.children.filter(c => eventTags.includes(c.tag)).map(eventFromNode);
      const alternateNames = nameEntries.filter(e => e !== primaryEntry).map(e => e.full).filter(Boolean);
      const p = { id: n.xref, name, given, surname, sex: value(n, 'SEX'), alternateNames, marriedSurname, birthSurname, birth: events.find(e => e.type === 'BIRT') || null, death: events.find(e => e.type === 'DEAT') || null, events, parentFamilies: children(n, 'FAMC').map(c => ({ id: c.value, type: value(c, 'PEDI') || 'birth' })), spouseFamilies: children(n, 'FAMS').map(c => c.value), notes: [...children(n, 'NOTE'), ...children(n, 'SNOTE')].map(text), sources: citationsFromNode(n), occupation: text(child(n, 'OCCU')), attributes:n.children.filter(c=>['NATI','RELI','TITL','DSCR','IDNO','NCHI','NMR'].includes(c.tag)).map(c=>({type:c.tag,value:text(c)})) };"""
    if old not in text:
        raise SystemExit('gedcom name block missing')
    text = text.replace(old, new, 1)
    old_search = "p.search = normalize([p.name, ...p.alternateNames, p.birth?.date, p.birth?.place, p.death?.date, p.death?.place, p.id].filter(Boolean).join(' '));"
    new_search = """if (p.sex === 'F' && !p.marriedSurname && p.spouseFamilies.length) {
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
    p.search = normalize([p.name, p.marriedSurname, p.birthSurname, ...p.alternateNames, p.birth?.date, p.birth?.place, p.death?.date, p.death?.place, p.id].filter(Boolean).join(' '));"""
    if old_search not in text:
        raise SystemExit('search line missing')
    path.write_text(text.replace(old_search, new_search, 1))
    print('gedcom.js patched')

def patch_focus():
    path = Path('family-viewer/src/FamilyExperience.jsx')
    text = path.read_text()
    if 'focusIdentity' in text:
        print('FamilyExperience already patched')
        return
    helper = """
function focusIdentity(person, relations) {
  const given = (person.given || person.name?.split(/\\s+/)[0] || '').trim();
  const hasMarriage = Boolean(relations?.partners?.length || (person.spouseFamilies || []).length);
  let marriedSurname = (person.marriedSurname || '').trim();
  if (!marriedSurname && person.sex === 'F' && hasMarriage) {
    const partnerSurnames = [...new Set((relations?.partners || []).map(p => (p.surname || '').trim()).filter(Boolean))];
    if (partnerSurnames.length === 1) marriedSurname = partnerSurnames[0];
    else if (person.surname && person.birthSurname && person.surname !== person.birthSurname) marriedSurname = person.surname;
  }
  const birthSurname = (person.birthSurname || '').trim();
  const showMarried = person.sex === 'F' && hasMarriage && marriedSurname;
  const title = showMarried ? [given, marriedSurname].filter(Boolean).join(' ') : person.name;
  const maiden = showMarried && birthSurname && birthSurname !== marriedSurname ? birthSurname : '';
  return { title, given, marriedSurname: showMarried ? marriedSurname : '', maiden };
}

"""
    text = text.replace('function FocusCard({ person, info, relations, onOpenGroup, onSources }) {', helper + 'function FocusCard({ person, info, relations, onOpenGroup, onSources }) {')
    text = text.replace(
        'const SecondIcon = person.death ? Flower2 : marriage ? Heart : House;\n  return <article className="focus-card fx-focus" key={person.id}>',
        'const SecondIcon = person.death ? Flower2 : marriage ? Heart : House;\n  const identity = focusIdentity(person, relations);\n  return <article className="focus-card fx-focus" key={person.id}>'
    )
    old_h2 = '<span className="fx-profile-type">{person.sex === \'F\' ? \'הסיפור שלה\' : person.sex === \'M\' ? \'הסיפור שלו\' : \'הסיפור האישי\'}</span><h2 dir="auto">{person.name}</h2><span className="fx-focus-years">'
    new_h2 = '<span className="fx-profile-type">{person.sex === \'F\' ? \'הסיפור שלה\' : person.sex === \'M\' ? \'הסיפור שלו\' : \'הסיפור האישי\'}</span><h2 dir="auto">{identity.marriedSurname ? <>{identity.given} <span className="fx-focus-married-surname">{identity.marriedSurname}</span></> : identity.title}</h2>{identity.maiden ? <span className="fx-focus-maiden">לבית {identity.maiden}</span> : null}<span className="fx-focus-years">'
    if old_h2 not in text:
        raise SystemExit('h2 block missing')
    path.write_text(text.replace(old_h2, new_h2, 1))
    print('FamilyExperience.jsx patched')

def patch_css():
    path = Path('family-viewer/src/family.css')
    text = path.read_text()
    if 'fx-focus-married-surname' in text:
        print('css already patched')
        return
    anchor = ".family-experience .fx-focus h2{font-family:'Noto Serif Hebrew',Georgia,serif;font-size:27px;line-height:1.45;letter-spacing:-.5px;color:#3a4934;font-weight:600;overflow-wrap:anywhere}"
    extra = anchor + ".fx-focus-married-surname{display:inline;font-weight:700;color:#6b4a2e;letter-spacing:-.3px;border-bottom:2px solid #d4b896;padding-bottom:1px}.fx-focus-maiden{display:block;font-size:12px;color:#8a7358;margin-top:2px;font-weight:500}"
    if anchor not in text:
        raise SystemExit('css anchor missing')
    path.write_text(text.replace(anchor, extra, 1))
    print('family.css patched')

if __name__ == '__main__':
    patch_gedcom()
    patch_focus()
    patch_css()
