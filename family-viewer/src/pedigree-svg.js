import dagre from '@dagrejs/dagre';
import { getRelations, getYear } from './gedcom.js';

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const clean = value => [...String(value ?? '')].map(char => {
  const n = char.codePointAt(0);
  return (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff) ? char : ' ';
}).join('');
const direction = value => /[\u0590-\u08ff]/.test(String(value).match(/[A-Za-z\u0590-\u08ff]/)?.[0] || '') ? 'rtl' : 'ltr';

export const CHART_PAPERS = Object.freeze({
  A4: Object.freeze({ width: 297, height: 210 }),
  A3: Object.freeze({ width: 420, height: 297 }),
  A2: Object.freeze({ width: 594, height: 420 }),
});

/** Approximate name size on the printable page, in points (10 mm margins). */
export function chartPrintNameSize(svg, paper = 'A4') {
  const page = CHART_PAPERS[paper] || CHART_PAPERS.A4;
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) return null;
  const w = Number(viewBox[1]), h = Number(viewBox[2]);
  if (!w || !h) return null;
  return 13 * Math.min((page.width - 20) / w, (page.height - 20) / h) * 72 / 25.4;
}

const graphemeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

// Wrap without stretching glyphs or discarding text. Break on words when
// possible, then on grapheme clusters for an unusually long single word.
export function wrapChartText(value, maxWidth, fontSize = 13) {
  const text = clean(value).replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const graphemes = graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map(part => part.segment)
    : Array.from(text);
  const width = char => {
    if (/\s/u.test(char)) return fontSize * 0.35;
    if (/[MW@%]/u.test(char)) return fontSize * 0.95;
    if (/[\u0590-\u08ff]/u.test(char)) return fontSize * 0.75;
    if (/[^\u0000-\u08ff]/u.test(char)) return fontSize;
    return fontSize * 0.7;
  };
  const lines = [];
  let line = [], used = 0, lastSpace = -1;
  const emit = items => { const str = items.join('').trim(); if (str) lines.push(str); };
  for (const char of graphemes) {
    const w = width(char);
    while (line.length && used + w > maxWidth) {
      if (lastSpace > 0) {
        emit(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1);
        used = line.reduce((sum, item) => sum + width(item), 0);
      } else { emit(line); line = []; used = 0; }
      lastSpace = line.lastIndexOf(' ');
    }
    if (char === ' ' && !line.length) continue;
    line.push(char); used += w;
    if (char === ' ') lastSpace = line.length - 1;
  }
  emit(line);
  return lines;
}

/** Select people and documented family edges before layout. IDs, not names, are identities. */
export function buildPedigreeGraph(data, focusId, { generations = 3, parentFamily, includeBranches = false, branchGenerations = 1, mode = 'ancestors' } = {}) {
  if (!data?.people?.[focusId]) throw new Error('Focus person not found');
  mode = mode === 'descendants' ? 'descendants' : 'ancestors';
  const minGenerations = mode === 'descendants' ? 2 : 3;
  generations = Number.isInteger(generations) && generations >= minGenerations && generations <= 6 ? generations : 3;
  branchGenerations = Number.isInteger(branchGenerations) && branchGenerations >= 1 && branchGenerations <= 3 ? branchGenerations : 1;
  const people = new Map();
  const families = new Map();
  const branchDescendants = new Set();
  const corePeople = new Set([focusId]);
  const addPerson = id => { if (data.people[id]) people.set(id, data.people[id]); };
  const familyEntry = id => {
    if (!data.families[id]) return null;
    if (!families.has(id)) families.set(id, { id, partners: new Set(), children: new Set() });
    return families.get(id);
  };
  const addPartner = (entry, id) => { if (data.people[id]) { addPerson(id); entry.partners.add(id); } };
  const addChild = (entry, id) => { if (data.people[id]) { addPerson(id); entry.children.add(id); } };
  addPerson(focusId);

  if (mode === 'descendants') {
    // The selected person is generation 1. Breadth-first traversal finds the
    // shortest path to each descendant, bounds cycles, and expands each union
    // separately. Partners are displayed but never traversed as descendants.
    const depth = new Map([[focusId, 0]]);
    const queue = [focusId];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index], level = depth.get(id);
      for (const fid of new Set(data.people[id].spouseFamilies || [])) {
        const family = data.families[fid];
        if (!family || !family.partners.includes(id)) continue;
        const entry = familyEntry(fid);
        for (const partner of new Set(family.partners)) addPartner(entry, partner);
        if (level < generations - 1) for (const child of new Set(family.children)) {
          if (!data.people[child]) continue;
          addChild(entry, child);
          if (!depth.has(child)) { depth.set(child, level + 1); queue.push(child); }
        }
      }
    }
    // Preserve all recorded child links among already visible people, even
    // when an individual was reached by another, shorter descendant path.
    for (const [fid, entry] of families) {
      for (const child of new Set(data.families[fid].children)) if (people.has(child)) addChild(entry, child);
      if (entry.partners.size < 2 && !entry.children.size) families.delete(fid);
    }
    let lastDescendantDepth = 0;
    for (const level of depth.values()) lastDescendantDepth = Math.max(lastDescendantDepth, level);
    return { people, families, generations, mode, branchDescendants, corePeople, descendantDepth: depth, lastDescendantDepth };
  }

  // Include each individual's documented unions, and at most the requested
  // generations of descendants. Multiple unions remain separate family nodes.
  const expanded = new Map();
  const expandDescendants = (id, remaining, path = new Set(), isBranch = false) => {
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
        if (isBranch && data.people[child]) branchDescendants.add(child);
        if (remaining > 1) expandDescendants(child, remaining - 1, nextPath, isBranch);
      }
    }
  };
  expandDescendants(focusId, 1);
  for (const id of people.keys()) corePeople.add(id);

  const visitAncestor = (id, level, path) => {
    if (path.has(id)) return;
    const person = data.people[id];
    if (!person) return;
    addPerson(id);
    corePeople.add(id);
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
      corePeople.add(sibling);
      if (includeBranches) expandDescendants(sibling, branchGenerations, new Set(), true);
    }
    if (level < generations - 1) {
      const nextPath = new Set([...path, id]);
      for (const parent of new Set(family.partners)) {
        if (!data.people[parent]) continue;
        addPartner(entry, parent);
        corePeople.add(parent);
        // Additional families of a selected parent can contain half siblings.
        // Show only families with documented children, never infer a second parent.
        if (showSiblings) for (const otherId of new Set(data.people[parent].spouseFamilies || [])) {
          if (otherId === r.activeParentFamily) continue;
          const other = data.families[otherId];
          if (!other || !other.partners.includes(parent)) continue;
          const otherChildren = [...new Set(other.children)].filter(child => child !== id && !family.partners.includes(child) && data.people[child]);
          if (!otherChildren.length) continue;
          const otherEntry = familyEntry(otherId);
          for (const partner of new Set(other.partners)) { addPartner(otherEntry, partner); if (data.people[partner]) corePeople.add(partner); }
          for (const sibling of otherChildren) {
            addChild(otherEntry, sibling);
            corePeople.add(sibling);
            if (includeBranches) expandDescendants(sibling, branchGenerations, new Set(), true);
          }
        }
        visitAncestor(parent, level + 1, nextPath);
      }
    }
  };
  visitAncestor(focusId, 0, new Set());
  // A single child with no visible parents conveys no relationship.
  for (const [id, family] of families) if (!family.partners.size && family.children.size < 2) families.delete(id);
  return { people, families, generations, mode, branchDescendants, corePeople };
}

export function createPedigreeSvg(data, focusId, { generations = 3, parentFamily, includeBranches = false, branchGenerations = 1, compactBranches = true, compactDescendants = false, showPlaces = false, paper = 'A4', fonts = {}, lang = 'he', mode = 'ancestors' } = {}) {
  const model = buildPedigreeGraph(data, focusId, { generations, parentFamily, includeBranches, branchGenerations, mode });
  const en = lang === 'en';
  const page = CHART_PAPERS[paper] || CHART_PAPERS.A4;
  const pick = (he, english) => en ? english : he;
  const graph = new dagre.graphlib.Graph().setGraph({ rankdir: 'TB', nodesep: 35, ranksep: 50, edgesep: 15, marginx: 28, marginy: 20 }).setDefaultEdgeLabel(() => ({}));
  const personKey = id => `p:${id}`;
  const familyKey = id => `f:${id}`;
  const clusterKey = (id, index) => JSON.stringify(['cluster', id, index]);
  const boxWidth = 150, boxHeight = 54;
  const compactWidth = 126, compactHeight = 44;
  const contentFor = (person, compact) => {
    const bw = compact ? compactWidth : boxWidth;
    const name = wrapChartText(person.name || '—', bw - 16, 13).map(text => ({ text, cls: 'name', height: 15 }));
    const birth = getYear(person.birth?.date), death = getYear(person.death?.date);
    const years = birth || death ? [{ text: `${birth || '?'} – ${death || ''}`, cls: 'years', height: 13 }] : [];
    const places = [];
    if (showPlaces) for (const [place, heading] of [
      [person.birth?.place, pick('לידה', 'Birth')],
      [person.death?.place, pick('פטירה', 'Death')],
    ]) {
      if (!place?.trim()) continue;
      for (const text of wrapChartText(`${heading}: ${place}`, bw - 16, 10)) places.push({ text, cls: 'place', height: 12 });
    }
    const lines = [...name, ...years, ...places];
    const height = Math.max(compact ? compactHeight : boxHeight, 12 + lines.reduce((sum, line) => sum + line.height, 0));
    return { lines, height };
  };
  const normalContent = new Map(), compactContent = new Map();
  for (const [id, person] of model.people) {
    normalContent.set(id, contentFor(person, false));
    compactContent.set(id, contentFor(person, true));
  }
  const childCounts = new Map(), partnerIds = new Set();
  for (const family of model.families.values()) {
    for (const id of family.children) childCounts.set(id, (childCounts.get(id) || 0) + 1);
    for (const id of family.partners) partnerIds.add(id);
  }
  // Group only terminal people with a single displayed parent family. Extra
  // links, partners and non-birth relationships retain their ordinary nodes.
  // In descendant mode use the deepest generation actually present, even
  // when the selected limit extends beyond the recorded descendants.
  const clusters = new Map(), familyClusters = new Map(), clusteredPeople = new Set();
  const useRings = model.mode === 'ancestors' ? compactBranches && includeBranches : compactDescendants;
  if (useRings) for (const [fid, family] of model.families) {
    const children = [...family.children].filter(id => {
      const type = model.people.get(id)?.parentFamilies?.find(p => p.id === fid)?.type?.toLowerCase();
      const eligibleGeneration = model.mode === 'ancestors'
        ? model.branchDescendants.has(id) && !model.corePeople.has(id)
        : model.lastDescendantDepth > 0 && model.descendantDepth.get(id) === model.lastDescendantDepth;
      return eligibleGeneration && childCounts.get(id) === 1 && !partnerIds.has(id) && (!type || type === 'birth');
    });
    if (children.length < 3) continue;
    // Split very large families into balanced rings to bound layout work and
    // keep all names visible. Each ring remains linked to the same family.
    const count = Math.ceil(children.length / 12);
    let start = 0;
    for (let group = 0; group < count; group++) {
      const size = Math.floor(children.length / count) + (group < children.length % count ? 1 : 0);
      const members = children.slice(start, start + size);
      start += size;
      const maxHeight = Math.max(...members.map(id => compactContent.get(id).height));
      let rx = 100, ry = 85, positions;
      for (let attempt = 0; attempt < 100; attempt++) {
        positions = members.map((id, i) => {
          const angle = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / members.length;
          return { id, x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
        });
        let overlap = positions.some(pos => Math.abs(pos.x) < compactWidth / 2 + 5 && Math.abs(pos.y) < maxHeight / 2 + 5);
        for (let i = 0; i < positions.length; i++) for (let j = 0; j < i; j++) {
          if (Math.abs(positions[i].x - positions[j].x) < compactWidth + 10 && Math.abs(positions[i].y - positions[j].y) < maxHeight + 10) overlap = true;
        }
        if (!overlap) break;
        rx *= 1.12; ry *= 1.12;
      }
      const key = clusterKey(fid, group);
      clusters.set(key, { fid, positions, rx, ry, maxHeight, width: 2 * rx + compactWidth + 30, height: 2 * ry + maxHeight + 30 });
      if (!familyClusters.has(fid)) familyClusters.set(fid, []);
      familyClusters.get(fid).push(key);
      members.forEach(id => clusteredPeople.add(id));
    }
  }
  for (const [id] of model.people) if (!clusteredPeople.has(id)) graph.setNode(personKey(id), { width: boxWidth, height: normalContent.get(id).height });
  for (const [id, family] of model.families) {
    graph.setNode(familyKey(id), { width: 16, height: 16 });
    for (const personId of family.partners) graph.setEdge(personKey(personId), familyKey(id), { kind: 'partner', familyId: id, personId });
    for (const personId of family.children) if (!clusteredPeople.has(personId)) graph.setEdge(familyKey(id), personKey(personId), { kind: 'child', familyId: id, personId });
    for (const key of familyClusters.get(id) || []) {
      const cluster = clusters.get(key);
      graph.setNode(key, { width: cluster.width, height: cluster.height });
      graph.setEdge(familyKey(id), key, { kind: 'cluster', familyId: id });
    }
  }
  dagre.layout(graph);
  const width = Math.max(800, graph.graph().width + 40);
  const title = pick(`אילן משפחתי של ${data.people[focusId].name}`, `Family chart of ${data.people[focusId].name}`);
  const subtitle = model.mode === 'descendants'
    ? pick(`${model.generations} דורות של צאצאים (כולל האדם הנבחר) · ענפים`, `${model.generations} generations of descendants (including selected person) · Anafim`)
    : pick(`${model.generations} דורות אחורה · ענפים`, `${model.generations} generations of ancestors · Anafim`);
  const legend = pick('נקודה: משפחה · חץ: ילד/ה · חציית קווים אינה קשר', 'Dot: family · arrow: child · crossings: no link')
    + (clusters.size ? pick(' · מעגל מקווקו: ילדי אותה משפחה', ' · dashed ring: children of one family') : '');
  const titleLines = wrapChartText(title, width - 70, 20);
  const sexLegend = pick('מין מתועד: פינות חדות — זכר · עגולות — נקבה · מסגרת מקווקוות — אחר/לא צוין', 'Recorded sex: square corners — male · rounded — female · dashed box — other/unspecified');
  const legendLines = [...wrapChartText(legend, width - 70, 12), ...wrapChartText(sexLegend, width - 70, 12)];
  const offsetX = (width - graph.graph().width) / 2;
  const offsetY = Math.max(85, 65 + titleLines.length * 24);
  const height = Math.max(450, graph.graph().height + offsetY + 39 + legendLines.length * 15);
  const label = (x, y, content, cls = 'label', extra = '') => `<text class="${cls}" x="${x}" y="${y}" direction="${cls === 'years' ? 'ltr' : direction(content)}"${extra}>${escapeXml(clean(content))}</text>`;
  const edges = graph.edges().map(edge => {
    const info = graph.edge(edge);
    const routed = info.points.map(p => ({ ...p }));
    const junction = graph.node(familyKey(info.familyId));
    if (info.kind === 'child' || info.kind === 'cluster') routed[0] = { x: junction.x, y: junction.y };
    else routed[routed.length - 1] = { x: junction.x, y: junction.y };
    const points = routed.map(p => `${(p.x + offsetX).toFixed(1)},${(p.y + offsetY).toFixed(1)}`).join(' ');
    const type = info.kind === 'child' ? model.people.get(info.personId)?.parentFamilies?.find(p => p.id === info.familyId)?.type?.toLowerCase() : '';
    const nonBirth = type && type !== 'birth';
    const typeName = { adopted: pick('אימוץ', 'adopted'), foster: pick('אומנה', 'foster'), sealing: pick('שיוך', 'sealing') }[type] || type;
    const middle = info.points[Math.floor(info.points.length / 2)];
    const annotation = nonBirth ? label(middle.x + offsetX + 8, middle.y + offsetY - 5, typeName, 'type') : '';
    const identity = info.kind === 'cluster' ? '' : ` data-person-id="${escapeXml(clean(info.personId))}"`;
    return `<g data-family-id="${escapeXml(clean(info.familyId))}"${identity} data-relation="${info.kind}"><polyline class="line${nonBirth ? ' nonbirth' : ''}" points="${points}"${info.kind === 'child' ? ' marker-end="url(#child-arrow)"' : ''}/>${annotation}</g>`;
  }).join('');
  const personBox = (id, x, y, compact = false) => {
    const bw = compact ? compactWidth : boxWidth;
    const content = (compact ? compactContent : normalContent).get(id);
    const person = model.people.get(id);
    const fullName = person.name || '—';
    // Only explicit GEDCOM M/F values get binary styling; never infer from a name or family role.
    const sex = String(person.sex || '').trim().toUpperCase();
    const sexStyle = sex === 'M' || sex === 'F' ? sex : 'other';
    const sexLabel = sexStyle === 'M' ? pick('זכר', 'male') : sexStyle === 'F' ? pick('נקבה', 'female') : pick('אחר או לא צוין', 'other or not recorded');
    const radius = sexStyle === 'M' ? 2 : sexStyle === 'F' ? 15 : 6;
    const bh = content.height;
    const total = content.lines.reduce((sum, line) => sum + line.height, 0);
    let baseline = y - total / 2;
    const text = content.lines.map(line => {
      baseline += line.height;
      return label(x, baseline - 3, line.text, line.cls);
    }).join('');
    return `<g class="person" data-person-id="${escapeXml(clean(id))}"${compact ? ' data-compact="true"' : ''}><rect class="box${id === focusId ? ' focus' : ''}${compact ? ' compact-box' : ''}" x="${x-bw/2}" y="${y-bh/2}" width="${bw}" height="${bh}" rx="${radius}" data-sex="${sexStyle}"/><title>${escapeXml(clean(`${fullName} — ${sexLabel}`))}</title>${text}</g>`;
  };
  const boxes = [...model.people].filter(([id]) => !clusteredPeople.has(id)).map(([id]) => {
    const node = graph.node(personKey(id));
    return personBox(id, node.x + offsetX, node.y + offsetY);
  }).join('');
  const rings = [...clusters].map(([key, cluster]) => {
    const fid = cluster.fid;
    const node = graph.node(key);
    const cx = node.x + offsetX, cy = node.y + offsetY;
    const entrance = graph.edge(familyKey(fid), key).points.at(-1);
    const lines = cluster.positions.map(pos => {
      const childHeight = compactContent.get(pos.id).height;
      const ratio = Math.min(pos.x ? compactWidth / 2 / Math.abs(pos.x) : Infinity, pos.y ? childHeight / 2 / Math.abs(pos.y) : Infinity);
      const x = cx + pos.x * (1 - ratio), y = cy + pos.y * (1 - ratio);
      return `<g data-family-id="${escapeXml(clean(fid))}" data-person-id="${escapeXml(clean(pos.id))}" data-relation="child"><line class="line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" marker-end="url(#child-arrow)"/></g>`;
    }).join('');
    const children = cluster.positions.map(pos => personBox(pos.id, cx + pos.x, cy + pos.y, true)).join('');
    return `<g class="branch-ring" data-family-id="${escapeXml(clean(fid))}"><ellipse class="ring-outline" cx="${cx}" cy="${cy}" rx="${cluster.rx + compactWidth/2 + 8}" ry="${cluster.ry + cluster.maxHeight/2 + 8}"/><line class="line" x1="${entrance.x + offsetX}" y1="${entrance.y + offsetY}" x2="${cx}" y2="${cy}"/>${lines}${children}</g>`;
  }).join('');
  const familyNodes = [...model.families].map(([id]) => {
    const node = graph.node(familyKey(id));
    return `<circle class="family-node" data-family-id="${escapeXml(clean(id))}" cx="${node.x + offsetX}" cy="${node.y + offsetY}" r="5"/>`;
  }).join('');
  // Font data is supplied by the app build and must never be an external URL.
  const validFont = value => typeof value === 'string' && /^data:font\/ttf;base64,[A-Za-z0-9+/=]+$/.test(value);
  const embedded = validFont(fonts.regular) && validFont(fonts.bold);
  const fontCss = embedded ? `@font-face{font-family:AnafimChart;src:url('${fonts.regular}') format('truetype');font-weight:400}@font-face{font-family:AnafimChart;src:url('${fonts.bold}') format('truetype');font-weight:600}` : '';
  const fontMetadata = embedded && fonts.license ? `<metadata>${escapeXml(clean(fonts.license))}</metadata>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pedigree-svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(clean(title))}"><defs><marker id="child-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#7a8a6a"/></marker></defs><style>${fontCss}.pedigree-svg .box{fill:#faf8f4;stroke:#5c6b4a;stroke-width:1.5}.pedigree-svg .box[data-sex="M"]{fill:#edf3f8}.pedigree-svg .box[data-sex="F"]{fill:#f8eef4}.pedigree-svg .box[data-sex="other"]{stroke-dasharray:4 2}.pedigree-svg .box.focus{fill:#e8f0e0;stroke:#3d4f2f;stroke-width:2.2}.pedigree-svg .name,.pedigree-svg .years,.pedigree-svg .place,.pedigree-svg .title,.pedigree-svg .subtitle,.pedigree-svg .type{font-family:AnafimChart,Arial,sans-serif;text-anchor:middle;fill:#1a1a1a}.pedigree-svg .name{font-size:13px;font-weight:600;unicode-bidi:plaintext}.pedigree-svg .years{font-size:11px;fill:#555;direction:ltr}.pedigree-svg .place{font-size:10px;fill:#555;unicode-bidi:plaintext}.pedigree-svg .type{font-size:10px;fill:#6e7a5c;paint-order:stroke;stroke:#fffef9;stroke-width:3px}.pedigree-svg .title{font-size:20px;font-weight:600;unicode-bidi:plaintext}.pedigree-svg .subtitle{font-size:12px;fill:#666}.pedigree-svg .line{stroke:#7a8a6a;stroke-width:1.5;fill:none}.pedigree-svg .nonbirth{stroke-dasharray:5 3}.pedigree-svg .ring-outline{fill:#f5f8f0;stroke:#b3c1ac;stroke-width:1;stroke-dasharray:5 4}.pedigree-svg .family-node{fill:#7a8a6a;stroke:#fffef9;stroke-width:1.5}</style>${fontMetadata}<rect width="100%" height="100%" fill="#fffef9"/>${titleLines.map((line, i) => label(width/2, 30 + i*24, line, 'title')).join('')}${label(width/2, 50 + (titleLines.length-1)*24, subtitle, 'subtitle')}${edges}${rings}${boxes}${familyNodes}${legendLines.map((line, i) => label(width/2, height-10-(legendLines.length-1-i)*15, line, 'subtitle')).join('')}</svg>`;
}
