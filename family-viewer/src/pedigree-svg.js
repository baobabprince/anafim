import dagre from '@dagrejs/dagre';
import { getRelations, getYear } from './gedcom.js';

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const clean = value => [...String(value ?? '')].map(char => {
  const n = char.codePointAt(0);
  return (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff) ? char : ' ';
}).join('');
const direction = value => /[\u0590-\u08ff]/.test(String(value).match(/[A-Za-z\u0590-\u08ff]/)?.[0] || '') ? 'rtl' : 'ltr';

/** Select people and documented family edges before layout. IDs, not names, are identities. */
export function buildPedigreeGraph(data, focusId, { generations = 3, parentFamily, includeBranches = false, branchGenerations = 1 } = {}) {
  if (!data?.people?.[focusId]) throw new Error('Focus person not found');
  generations = Number.isInteger(generations) && generations >= 3 && generations <= 6 ? generations : 3;
  branchGenerations = Number.isInteger(branchGenerations) && branchGenerations >= 1 && branchGenerations <= 3 ? branchGenerations : 1;
  const people = new Map();
  const families = new Map();
  const addPerson = id => { if (data.people[id]) people.set(id, data.people[id]); };
  const familyEntry = id => {
    if (!data.families[id]) return null;
    if (!families.has(id)) families.set(id, { id, partners: new Set(), children: new Set() });
    return families.get(id);
  };
  const addPartner = (entry, id) => { if (data.people[id]) { addPerson(id); entry.partners.add(id); } };
  const addChild = (entry, id) => { if (data.people[id]) { addPerson(id); entry.children.add(id); } };
  addPerson(focusId);

  // Include each individual's documented unions, and at most the requested
  // generations of descendants. Multiple unions remain separate family nodes.
  const expanded = new Map();
  const expandDescendants = (id, remaining, path = new Set()) => {
    if (remaining <= 0 || path.has(id) || (expanded.get(id) || 0) >= remaining) return;
    expanded.set(id, remaining);
    const person = data.people[id];
    if (!person) return;
    const nextPath = new Set([...path, id]);
    for (const fid of new Set(person.spouseFamilies || [])) {
      const family = data.families[fid];
      if (!family) continue;
      const entry = familyEntry(fid);
      for (const partner of new Set(family.partners)) addPartner(entry, partner);
      for (const child of new Set(family.children)) {
        addChild(entry, child);
        if (remaining > 1) expandDescendants(child, remaining - 1, nextPath);
      }
    }
  };
  expandDescendants(focusId, 1);

  const visitAncestor = (id, level, path) => {
    if (path.has(id)) return;
    const person = data.people[id];
    if (!person) return;
    addPerson(id);
    const r = getRelations(data, id, level === 0 ? parentFamily : undefined);
    const family = data.families[r.activeParentFamily];
    // At the cutoff, include siblings only if side branches were requested;
    // the parents beyond the cutoff must not appear.
    if (!family || (level >= generations - 1 && !includeBranches)) return;
    const entry = familyEntry(r.activeParentFamily);
    addChild(entry, id);
    const showSiblings = level === 0 || includeBranches;
    if (showSiblings) for (const sibling of new Set(family.children)) {
      if (sibling === id || !data.people[sibling]) continue;
      addChild(entry, sibling);
      if (includeBranches) expandDescendants(sibling, branchGenerations);
    }
    if (level < generations - 1) {
      const nextPath = new Set([...path, id]);
      for (const parent of new Set(family.partners)) {
        if (!data.people[parent]) continue;
        addPartner(entry, parent);
        visitAncestor(parent, level + 1, nextPath);
      }
    }
  };
  visitAncestor(focusId, 0, new Set());
  // A single child with no visible parents conveys no relationship.
  for (const [id, family] of families) if (!family.partners.size && family.children.size < 2) families.delete(id);
  return { people, families, generations };
}

export function createPedigreeSvg(data, focusId, { generations = 3, parentFamily, includeBranches = false, branchGenerations = 1, lang = 'he', date = new Date() } = {}) {
  const model = buildPedigreeGraph(data, focusId, { generations, parentFamily, includeBranches, branchGenerations });
  const en = lang === 'en';
  const pick = (he, english) => en ? english : he;
  const graph = new dagre.graphlib.Graph().setGraph({ rankdir: 'TB', nodesep: 35, ranksep: 50, edgesep: 15, marginx: 28, marginy: 20 }).setDefaultEdgeLabel(() => ({}));
  const personKey = id => `p:${id}`;
  const familyKey = id => `f:${id}`;
  const boxWidth = 150, boxHeight = 54;
  for (const [id] of model.people) graph.setNode(personKey(id), { width: boxWidth, height: boxHeight });
  for (const [id, family] of model.families) {
    graph.setNode(familyKey(id), { width: 16, height: 16 });
    for (const personId of family.partners) graph.setEdge(personKey(personId), familyKey(id), { kind: 'partner', familyId: id, personId });
    for (const personId of family.children) graph.setEdge(familyKey(id), personKey(personId), { kind: 'child', familyId: id, personId });
  }
  dagre.layout(graph);
  const width = Math.max(800, graph.graph().width + 40);
  const height = Math.max(450, graph.graph().height + 150);
  const offsetX = (width - graph.graph().width) / 2;
  const offsetY = 85;
  const label = (x, y, content, cls = 'label', extra = '') => `<text class="${cls}" x="${x}" y="${y}" direction="${cls === 'years' ? 'ltr' : direction(content)}"${extra}>${escapeXml(clean(content))}</text>`;
  const edges = graph.edges().map(edge => {
    const info = graph.edge(edge);
    const routed = info.points.map(p => ({ ...p }));
    const junction = graph.node(familyKey(info.familyId));
    if (info.kind === 'child') routed[0] = { x: junction.x, y: junction.y };
    else routed[routed.length - 1] = { x: junction.x, y: junction.y };
    const points = routed.map(p => `${(p.x + offsetX).toFixed(1)},${(p.y + offsetY).toFixed(1)}`).join(' ');
    const type = info.kind === 'child' ? model.people.get(info.personId)?.parentFamilies?.find(p => p.id === info.familyId)?.type?.toLowerCase() : '';
    const nonBirth = type && type !== 'birth';
    const typeName = { adopted: pick('אימוץ', 'adopted'), foster: pick('אומנה', 'foster'), sealing: pick('שיוך', 'sealing') }[type] || type;
    const middle = info.points[Math.floor(info.points.length / 2)];
    const annotation = nonBirth ? label(middle.x + offsetX + 8, middle.y + offsetY - 5, typeName, 'type') : '';
    return `<g data-family-id="${escapeXml(clean(info.familyId))}" data-person-id="${escapeXml(clean(info.personId))}" data-relation="${info.kind}"><polyline class="line${nonBirth ? ' nonbirth' : ''}" points="${points}"${info.kind === 'child' ? ' marker-end="url(#child-arrow)"' : ''}/>${annotation}</g>`;
  }).join('');
  const boxes = [...model.people].map(([id, person]) => {
    const node = graph.node(personKey(id));
    const x = node.x + offsetX, y = node.y + offsetY;
    const name = clean(person.name || '—');
    const birth = getYear(person.birth?.date), death = getYear(person.death?.date);
    const years = birth || death ? `${birth || '?'} – ${death || ''}` : '';
    const fit = [...name].length > 19 ? ` textLength="${boxWidth - 14}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<g class="person" data-person-id="${escapeXml(clean(id))}"><rect class="box${id === focusId ? ' focus' : ''}" x="${x-boxWidth/2}" y="${y-boxHeight/2}" width="${boxWidth}" height="${boxHeight}" rx="6"/>${label(x, y - 4, name, 'name', fit)}${label(x, y + 15, years, 'years')}</g>`;
  }).join('');
  const familyNodes = [...model.families].map(([id]) => {
    const node = graph.node(familyKey(id));
    return `<circle class="family-node" data-family-id="${escapeXml(clean(id))}" cx="${node.x + offsetX}" cy="${node.y + offsetY}" r="5"/>`;
  }).join('');
  const title = pick(`אילן משפחתי של ${data.people[focusId].name}`, `Family chart of ${data.people[focusId].name}`);
  const subtitle = pick(`${model.generations} דורות אחורה · ענפים`, `${model.generations} generations of ancestors · Anafim`);
  const legend = pick('עיגול מסמן משפחה · חץ מצביע על ילד/ה · מפגש קווים ללא עיגול אינו קשר', 'Circle: family · arrow: child · lines crossing without a circle are not connected');
  const dateLabel = new Intl.DateTimeFormat(en ? 'en-GB' : 'he-IL').format(date);
  const footer = pick(`ענפים · נוצר במכשיר · ${dateLabel}`, `Anafim · created on this device · ${dateLabel}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pedigree-svg" width="297mm" height="210mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(clean(title))}"><defs><marker id="child-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#7a8a6a"/></marker></defs><style>.pedigree-svg .box{fill:#faf8f4;stroke:#5c6b4a;stroke-width:1.5}.pedigree-svg .focus{fill:#e8f0e0;stroke:#3d4f2f;stroke-width:2.2}.pedigree-svg .name,.pedigree-svg .years,.pedigree-svg .title,.pedigree-svg .subtitle,.pedigree-svg .type{font-family:Arial,sans-serif;text-anchor:middle;fill:#1a1a1a}.pedigree-svg .name{font-size:13px;font-weight:600;unicode-bidi:plaintext}.pedigree-svg .years{font-size:11px;fill:#555;direction:ltr}.pedigree-svg .type{font-size:10px;fill:#6e7a5c;paint-order:stroke;stroke:#fffef9;stroke-width:3px}.pedigree-svg .title{font-size:20px;font-weight:bold;unicode-bidi:plaintext}.pedigree-svg .subtitle{font-size:12px;fill:#666}.pedigree-svg .line{stroke:#7a8a6a;stroke-width:1.5;fill:none}.pedigree-svg .nonbirth{stroke-dasharray:5 3}.pedigree-svg .family-node{fill:#7a8a6a;stroke:#fffef9;stroke-width:1.5}</style><rect width="100%" height="100%" fill="#fffef9"/>${label(width/2, 30, title, 'title')}${label(width/2, 50, subtitle, 'subtitle')}${edges}${boxes}${familyNodes}${label(width/2, height-36, legend, 'subtitle')}${label(width/2, height-16, footer, 'subtitle')}</svg>`;
}
