import { getRelations, getYear } from './gedcom.js';

// Generate a self-contained SVG, without embedding GEDCOM markup or external assets.
const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const clean = value => [...String(value ?? '')].map(char => {
  const n = char.codePointAt(0);
  return (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff) ? char : ' ';
}).join('');

export function createPedigreeSvg(data, focusId, { generations = 3, parentFamily, lang = 'he', date = new Date() } = {}) {
  const focus = data?.people?.[focusId];
  if (!focus) throw new Error('Focus person not found');
  generations = generations === 4 ? 4 : 3;
  const en = lang === 'en';
  const pick = (he, english) => en ? english : he;
  const relations = getRelations(data, focusId, parentFamily);
  const selectedFamily = data.families[relations.activeParentFamily];
  // Only siblings in the selected parent family share its connector.
  const siblings = [...new Set(selectedFamily?.children || [])].filter(id => id !== focusId && data.people[id]).map(id => data.people[id]);
  const families = [...new Set(focus.spouseFamilies || [])].map(id => data.families[id]).filter(Boolean).map(f => ({
    partners: [...new Set(f.partners)].filter(id => id !== focusId && data.people[id]).map(id => data.people[id]),
    children: [...new Set(f.children)].filter(id => id !== focusId && data.people[id]).map(id => data.people[id]),
  }));
  const maxFamily = families.reduce((max, f) => Math.max(max, f.partners.length + 1, f.children.length), 0);
  const width = Math.max(1100, (2 ** (generations - 1)) * 155 + 60, (siblings.length * 2 + 1) * 155 + 60, maxFamily * 155 + 60);
  const focusY = 105 + (generations - 1) * 110;
  const familyStart = focusY + 105;
  const height = Math.max(720, familyStart + families.length * 190 + 65);
  const boxWidth = 135, boxHeight = 52;
  const paths = [], boxes = [], annotations = [];
  const direction = value => /[\u0590-\u08ff]/.test(String(value).match(/[A-Za-z\u0590-\u08ff]/)?.[0] || '') ? 'rtl' : 'ltr';
  const label = (x, y, content, cls = 'label') => `<text class="${cls}" x="${x}" y="${y}" direction="${cls === 'years' ? 'ltr' : direction(content)}">${escapeXml(clean(content))}</text>`;
  const personBox = (p, x, y, kind = '') => {
    const name = clean(p.name || '—');
    const birth = getYear(p.birth?.date), death = getYear(p.death?.date);
    const years = birth || death ? `${birth || '?'} – ${death || ''}` : '';
    const fit = [...name].length > 17 ? ` textLength="${boxWidth - 14}" lengthAdjust="spacingAndGlyphs"` : '';
    boxes.push(`<g><rect class="box ${kind}" x="${x-boxWidth/2}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6"/><text class="name" x="${x}" y="${y+22}" direction="${direction(name)}"${fit}>${escapeXml(name)}</text>${label(x, y+40, years, 'years')}</g>`);
  };
  const line = d => paths.push(`<path class="line" d="${d}"/>`);
  // Positions follow the family records, not sex; unknown or single parents are not invented.
  const walk = (person, level, index, seen) => {
    const x = width * (index + 0.5) / (2 ** level);
    const y = focusY - level * 110;
    personBox(person, x, y, level === 0 ? 'focus' : '');
    if (level >= generations - 1) return;
    const r = getRelations(data, person.id, level === 0 ? parentFamily : undefined);
    const parents = r.parents.filter(p => !seen.has(p.id)).slice(0, 2);
    if (!parents.length) return;
    const positions = parents.map((p, i) => ({ p, i, x: width * (index * 2 + i + 0.5) / (2 ** (level + 1)) }));
    const junction = y - 28;
    for (const pos of positions) line(`M${pos.x} ${y-110+boxHeight} V${junction} H${x}`);
    line(`M${x} ${junction} V${y}`);
    const type = r.parentFamilies.find(f => f.id === r.activeParentFamily)?.type;
    if (type && type.toLowerCase() !== 'birth') {
      const names = { adopted: pick('אימוץ', 'adopted'), foster: pick('אומנה', 'foster'), sealing: pick('שיוך', 'sealing') };
      annotations.push(label(x, junction - 4, names[type.toLowerCase()] || type, 'type'));
    }
    for (const pos of positions) walk(pos.p, level + 1, index * 2 + pos.i, new Set([...seen, pos.p.id]));
  };
  walk(focus, 0, 0, new Set([focusId]));
  // The bus touches only children explicitly listed in the selected family.
  const siblingXs = siblings.map((_, i) => width/2 + (i % 2 ? -1 : 1) * Math.ceil((i+1)/2) * 155);
  if (siblings.length) {
    const junction = focusY - 28;
    line(`M${width/2} ${junction} V${focusY}`);
    const left = width/2 - Math.floor(siblings.length/2) * 155;
    const right = width/2 + Math.ceil(siblings.length/2) * 155;
    line(`M${left} ${junction} H${right}`);
    siblings.forEach((s, i) => { personBox(s, siblingXs[i], focusY); line(`M${siblingXs[i]} ${junction} V${focusY}`); });
  }
  families.forEach((family, groupIndex) => {
    const y = familyStart + groupIndex * 190;
    annotations.push(label(width/2, y - 12, pick(`משפחה ${groupIndex+1} של האדם הנבחר`, `Family ${groupIndex+1} of the selected person`)));
    const adults = [focus, ...family.partners];
    const adultXs = adults.map((_, i) => width/2 + (i - (adults.length-1)/2) * 155);
    adults.forEach((p, i) => personBox(p, adultXs[i], y, i === 0 ? 'focus' : 'spouse'));
    const junction = y + 72;
    if (adultXs.length > 1) line(`M${adultXs[0]} ${y+boxHeight} V${junction} H${adultXs.at(-1)} V${y+boxHeight}`);
    const childXs = family.children.map((_, i) => width/2 + (i - (family.children.length-1)/2) * 155);
    if (childXs.length) {
      line(`M${width/2} ${adultXs.length > 1 ? junction : y+boxHeight} V${y+105}`);
      if (childXs.length > 1) line(`M${childXs[0]} ${y+105} H${childXs.at(-1)}`);
      family.children.forEach((p, i) => { line(`M${childXs[i]} ${y+105} V${y+120}`); personBox(p, childXs[i], y+120); });
    }
  });
  const title = pick(`אילן משפחתי של ${focus.name}`, `Family chart of ${focus.name}`);
  const subtitle = pick(`${generations} דורות של אבות ואימהות · ענפים`, `${generations} generations of ancestors · Anafim`);
  const dateLabel = new Intl.DateTimeFormat(en ? 'en-GB' : 'he-IL', {timeZone:'UTC'}).format(date);
  const footer = pick(`ענפים · נוצר במכשיר · ${dateLabel}`, `Anafim · created on this device · ${dateLabel}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pedigree-svg" width="297mm" height="210mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(clean(title))}"><style>.pedigree-svg .box{fill:#faf8f4;stroke:#5c6b4a;stroke-width:1.5}.pedigree-svg .focus{fill:#e8f0e0;stroke:#3d4f2f;stroke-width:2.2}.pedigree-svg .spouse{fill:#f5efe6;stroke:#6b5a3e}.pedigree-svg .name,.pedigree-svg .years,.pedigree-svg .label,.pedigree-svg .title,.pedigree-svg .subtitle,.pedigree-svg .type{font-family:Arial,sans-serif;text-anchor:middle;fill:#1a1a1a}.pedigree-svg .name{font-size:13px;font-weight:600;unicode-bidi:plaintext}.pedigree-svg .years{font-size:11px;fill:#555;direction:ltr}.pedigree-svg .label,.pedigree-svg .type{font-size:11px;fill:#6e7a5c}.pedigree-svg .title{font-size:20px;font-weight:bold;unicode-bidi:plaintext}.pedigree-svg .subtitle{font-size:12px;fill:#666}.pedigree-svg .line{stroke:#7a8a6a;stroke-width:1.4;fill:none}</style><rect width="100%" height="100%" fill="#fffef9"/>${label(width/2, 34, title, 'title')}${label(width/2, 55, subtitle, 'subtitle')}${paths.join('')}${boxes.join('')}${annotations.join('')}${label(width/2, height-20, footer, 'subtitle')}</svg>`;
}
