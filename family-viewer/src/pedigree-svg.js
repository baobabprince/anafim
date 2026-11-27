import dagre from '@dagrejs/dagre';
import { getRelations, getYear } from './gedcom.js';
import { layoutDescendantTree } from './pedigree-tree-layout.js';
import { layoutAncestorTree } from './pedigree-ancestor-layout.js';

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const clean = value => [...String(value ?? '')].map(char => {
  const n = char.codePointAt(0);
  return (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff) ? char : ' ';
}).join('');
const direction = value => /[\u0590-\u08ff]/.test(String(value).match(/[A-Za-z\u0590-\u08ff]/)?.[0] || '') ? 'rtl' : 'ltr';
const validPhoto = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);

export const CHART_PAPERS = Object.freeze({
  A4: Object.freeze({ width: 297, height: 210 }),
  A3: Object.freeze({ width: 420, height: 297 }),
  A2: Object.freeze({ width: 594, height: 420 }),
});

/** Resolve physical page dimensions (mm) and orientation ('landscape' | 'portrait'). */
export function resolveChartPage(svg, paper = 'A4', orientation = 'landscape') {
  const base = CHART_PAPERS[paper] || CHART_PAPERS.A4;
  let resolved = orientation === 'portrait' ? 'portrait' : 'landscape';
  if (orientation === 'auto') {
    const viewBox = String(svg || '').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const w = viewBox ? Number(viewBox[1]) : 0;
    const h = viewBox ? Number(viewBox[2]) : 0;
    resolved = w && h && h > w * 1.05 ? 'portrait' : 'landscape';
  }
  return resolved === 'portrait'
    ? { width: base.height, height: base.width, orientation: 'portrait' }
    : { width: base.width, height: base.height, orientation: 'landscape' };
}

/** Approximate name size on the printable page, in points (10 mm margins). */
export function chartPrintNameSize(svg, paper = 'A4', { orientation = 'landscape', posterPages = '1x1' } = {}) {
  const page = resolveChartPage(svg, paper, orientation);
  const viewBox = String(svg || '').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) return null;
  const w = Number(viewBox[1]), h = Number(viewBox[2]);
  if (!w || !h) return null;
  const [cols, rows] = String(posterPages || '1x1').split('x').map(n => Math.max(1, Number(n) || 1));
  return 13 * Math.min(((page.width - 20) * cols) / w, ((page.height - 20) * rows) / h) * 72 / 25.4;
}

/** Slice a chart SVG into tiled poster pages with overlap and corner page numbers. */
export function createPosterTileSvgs(svg, { cols = 1, rows = 1, overlap = 0.03 } = {}) {
  const safeCols = Math.max(1, Number(cols) || 1);
  const safeRows = Math.max(1, Number(rows) || 1);
  if (safeCols === 1 && safeRows === 1) return [{ index: 1, total: 1, row: 0, col: 0, svg }];
  const viewBox = String(svg || '').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) return [{ index: 1, total: 1, row: 0, col: 0, svg }];
  const W = Number(viewBox[1]), H = Number(viewBox[2]);
  if (!W || !H) return [{ index: 1, total: 1, row: 0, col: 0, svg }];

  const total = safeCols * safeRows;
  const tileW = W / safeCols, tileH = H / safeRows;
  const padX = tileW * overlap, padY = tileH * overlap;
  const tiles = [];

  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      const index = r * safeCols + c + 1;
      const vx = Math.max(0, c * tileW - (c > 0 ? padX : 0));
      const vy = Math.max(0, r * tileH - (r > 0 ? padY : 0));
      const vw = tileW + (c > 0 ? padX : 0) + (c < safeCols - 1 ? padX : 0);
      const vh = tileH + (r > 0 ? padY : 0) + (r < safeRows - 1 ? padY : 0);
      const vb = `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
      const bgRect = `<rect x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${vw.toFixed(1)}" height="${vh.toFixed(1)}" fill="#fffef9"/>`;
      const tileLabel = `<text class="subtitle" x="${(vx + vw - 12).toFixed(1)}" y="${(vy + 18).toFixed(1)}" style="font-size:11px;fill:#888;text-anchor:end">${index}/${total}</text>`;
      const tileSvg = svg
        .replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="${vb}"`)
        .replace('<rect width="100%" height="100%" fill="#fffef9"/>', bgRect)
        .replace('</svg>', `${tileLabel}</svg>`);
      tiles.push({ index, total, row: r, col: c, svg: tileSvg });
    }
  }
  return tiles;
}

/** Collect displayed ancestors, descendants, direct partners, and connecting families for a person. */
export function connectedLineage(model, personId) {
  const people = new Set();
  const families = new Set();
  if (!model?.people?.has(personId)) return { people, families };

  const parentFamiliesOf = new Map();
  const spouseFamiliesOf = new Map();
  for (const [fid, fam] of model.families) {
    for (const c of fam.children) {
      if (!parentFamiliesOf.has(c)) parentFamiliesOf.set(c, []);
      parentFamiliesOf.get(c).push(fid);
    }
    for (const p of fam.partners) {
      if (!spouseFamiliesOf.has(p)) spouseFamiliesOf.set(p, []);
      spouseFamiliesOf.get(p).push(fid);
    }
  }

  people.add(personId);
  const ancQueue = [personId], seenAnc = new Set([personId]);
  for (let i = 0; i < ancQueue.length; i++) {
    const id = ancQueue[i];
    for (const fid of parentFamiliesOf.get(id) || []) {
      families.add(fid);
      for (const p of model.families.get(fid).partners) {
        people.add(p);
        if (!seenAnc.has(p)) { seenAnc.add(p); ancQueue.push(p); }
      }
    }
  }

  const descQueue = [personId], seenDesc = new Set([personId]);
  for (let i = 0; i < descQueue.length; i++) {
    const id = descQueue[i];
    for (const fid of spouseFamiliesOf.get(id) || []) {
      families.add(fid);
      const fam = model.families.get(fid);
      for (const p of fam.partners) people.add(p);
      for (const c of fam.children) {
        people.add(c);
        if (!seenDesc.has(c)) { seenDesc.add(c); descQueue.push(c); }
      }
    }
  }

  return { people, families };
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

// Only family-specific, explicitly recorded evidence is used. A person's death
// or an individual marital status alone cannot establish which union ended.
export function documentedUnionEnd(family) {
  if (!family) return [];
  const divorceTerms = new Set(['divorce', 'divorced', 'גירושין', 'גירושים', 'גרוש', 'גרושה', 'גרושים', 'גרושות']);
  const widowTerms = new Set(['widow', 'widowed', 'widowhood', 'התאלמנות', 'אלמן', 'אלמנה', 'אלמנים', 'אלמנות']);
  const affirmative = event => !['N', 'NO'].includes(String(event?.detail || '').trim().toUpperCase());
  const tags = [family.relationshipStatus, ...(family.events || []).filter(event => event.type === 'EVEN' && affirmative(event)).map(event => event.label)]
    .map(value => String(value || '').trim().toLocaleLowerCase());
  const results = [];
  if ((family.divorce && affirmative(family.divorce)) || tags.some(tag => divorceTerms.has(tag))) results.push('divorce');
  if (tags.some(tag => widowTerms.has(tag))) results.push('widowhood');
  return results;
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

export function createPedigreeSvg(
  data,
  focusId,
  {
    generations = 3,
    parentFamily,
    includeBranches = false,
    branchGenerations = 1,
    compactBranches = true,
    showPlaces = false,
    paper = 'A4',
    fonts = {},
    lang = 'he',
    mode = 'ancestors',
    siblingLayout = 'ring',
    ancestorOrientation = 'vertical',
    showMarriageYears = false,
    showGenerationLabels = false,
    showPhotos = false,
    photos = {},
  } = {}
) {
  const model = buildPedigreeGraph(data, focusId, { generations, parentFamily, includeBranches, branchGenerations, mode });
  const en = lang === 'en';
  const page = CHART_PAPERS[paper] || CHART_PAPERS.A4;
  const pick = (he, english) => en ? english : he;
  const rankdir = model.mode === 'ancestors' && ancestorOrientation === 'horizontal' ? (en ? 'RL' : 'LR') : 'TB';
  const graph = new dagre.graphlib.Graph().setGraph({ rankdir, nodesep: 35, ranksep: 50, edgesep: 15, marginx: 28, marginy: 20 }).setDefaultEdgeLabel(() => ({}));

  const unionEnds = new Map();
  const marriageYears = new Map();
  for (const [id, family] of model.families) {
    const status = documentedUnionEnd(data.families[id]);
    if (family.partners.size && status.length) unionEnds.set(id, status);
    if (showMarriageYears) {
      const mYear = getYear(data.families[id]?.marriage?.date);
      if (mYear) marriageYears.set(id, pick(`נ׳ ${mYear}`, `m. ${mYear}`));
    }
  }
  const unionLabel = status => status.map(item => item === 'divorce' ? pick('גירושין', 'divorce') : pick('התאלמנות', 'widowhood')).join(' / ');
  const personKey = id => `p:${id}`;
  const familyKey = id => `f:${id}`;
  const clusterKey = (id, index) => JSON.stringify(['cluster', id, index]);
  const boxWidth = 150, boxHeight = 54;
  const spouseWidth = 136, spouseHeight = 46;
  const compactWidth = 126, compactHeight = 44;
  const hasAvatar = id => Boolean(showPhotos && validPhoto(photos?.[id]));

  const contentFor = (person, width, minHeight, avatar = false) => {
    const textWidth = avatar ? width - 50 : width - 16;
    const name = wrapChartText(person.name || '—', textWidth, 13).map(text => ({ text, cls: 'name', height: 15 }));
    const birth = getYear(person.birth?.date), death = getYear(person.death?.date);
    const years = birth || death ? [{ text: `${birth || '?'} – ${death || ''}`, cls: 'years', height: 13 }] : [];
    const places = [];
    if (showPlaces) for (const [place, heading] of [
      [person.birth?.place, pick('לידה', 'Birth')],
      [person.death?.place, pick('פטירה', 'Death')],
    ]) {
      if (!place?.trim()) continue;
      for (const text of wrapChartText(`${heading}: ${place}`, textWidth, 10)) places.push({ text, cls: 'place', height: 12 });
    }
    const lines = [...name, ...years, ...places];
    const height = Math.max(minHeight, avatar ? 46 : 0, 12 + lines.reduce((sum, line) => sum + line.height, 0));
    return { lines, height };
  };

  const normalContent = new Map(), spouseContent = new Map(), compactContent = new Map();
  for (const [id, person] of model.people) {
    const avatar = hasAvatar(id);
    normalContent.set(id, contentFor(person, boxWidth, boxHeight, avatar));
    spouseContent.set(id, contentFor(person, spouseWidth, spouseHeight, avatar));
    compactContent.set(id, contentFor(person, compactWidth, compactHeight, false));
  }

  const childCounts = new Map(), partnerIds = new Set();
  for (const family of model.families.values()) {
    for (const id of family.children) childCounts.set(id, (childCounts.get(id) || 0) + 1);
    for (const id of family.partners) partnerIds.add(id);
  }

  // Group terminal sibling sets (>= 3) into compact rings or grids.
  const clusters = new Map(), familyClusters = new Map(), clusteredPeople = new Set();
  const useRings = model.mode === 'ancestors' ? compactBranches && includeBranches : true;
  const gridMode = siblingLayout === 'grid';
  if (useRings) for (const [fid, family] of model.families) {
    const children = [...family.children].filter(id => {
      const type = model.people.get(id)?.parentFamilies?.find(p => p.id === fid)?.type?.toLowerCase();
      const eligibleGeneration = model.mode === 'ancestors'
        ? model.branchDescendants.has(id) && !model.corePeople.has(id)
        : model.descendantDepth.has(id);
      return eligibleGeneration && childCounts.get(id) === 1 && !partnerIds.has(id) && (!type || type === 'birth');
    });
    if (children.length < 3) continue;
    const count = Math.ceil(children.length / 12);
    let start = 0;
    for (let group = 0; group < count; group++) {
      const size = Math.floor(children.length / count) + (group < children.length % count ? 1 : 0);
      const members = children.slice(start, start + size);
      start += size;
      const key = clusterKey(fid, group);

      if (gridMode) {
        const dir = en ? -1 : 1;
        if (members.length <= 4) {
          const vSpacing = 10, topPad = 14, botPad = 14;
          const heights = members.map(id => compactContent.get(id).height);
          const totalH = heights.reduce((s, h) => s + h, 0) + (members.length - 1) * vSpacing;
          const gridH = totalH + topPad + botPad;
          const gridW = compactWidth + 34; // 160px
          const boxCenterX = -dir * 10;
          const spineX = dir * 67;
          let curY = 0;
          const positions = members.map((id, i) => {
            const mh = heights[i];
            const pos = { id, x: boxCenterX, y: -gridH / 2 + topPad + curY + mh / 2, innerX: boxCenterX + dir * (compactWidth / 2) };
            curY += mh + vSpacing;
            return pos;
          });
          clusters.set(key, {
            kind: 'grid', fid, positions, spineX, spineTop: -gridH / 2 + 7, spineBottom: positions.at(-1).y,
            hasJog: true, width: gridW, height: gridH,
          });
        } else {
          const colGap = 28, topPad = 14, botPad = 14, vSpacing = 10;
          const colOffset = compactWidth / 2 + colGap / 2; // 77
          const rows = Math.ceil(members.length / 2);
          const rowHeights = [];
          for (let r = 0; r < rows; r++) {
            const h1 = compactContent.get(members[2 * r]).height;
            const h2 = members[2 * r + 1] ? compactContent.get(members[2 * r + 1]).height : 0;
            rowHeights.push(Math.max(h1, h2));
          }
          const totalH = rowHeights.reduce((s, h) => s + h, 0) + (rows - 1) * vSpacing;
          const gridH = totalH + topPad + botPad;
          const gridW = 2 * compactWidth + 52; // 304px
          const positions = [];
          let curY = 0;
          for (let r = 0; r < rows; r++) {
            const rowH = rowHeights[r];
            const cyRow = -gridH / 2 + topPad + curY + rowH / 2;
            const first = members[2 * r];
            const second = members[2 * r + 1];
            if (second) {
              const firstSide = en ? -1 : 1;
              positions.push({ id: first, x: firstSide * colOffset, y: cyRow, innerX: firstSide * (colGap / 2) });
              positions.push({ id: second, x: -firstSide * colOffset, y: cyRow, innerX: -firstSide * (colGap / 2) });
            } else {
              const firstSide = en ? -1 : 1;
              positions.push({ id: first, x: firstSide * colOffset, y: cyRow, innerX: firstSide * (colGap / 2) });
            }
            curY += rowH + vSpacing;
          }
          clusters.set(key, {
            kind: 'grid', fid, positions, spineX: 0, spineTop: -gridH / 2, spineBottom: positions.at(-1).y,
            hasJog: false, width: gridW, height: gridH,
          });
        }
      } else {
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
        clusters.set(key, { kind: 'ring', fid, positions, rx, ry, maxHeight, width: 2 * rx + compactWidth + 30, height: 2 * ry + maxHeight + 30 });
      }
      if (!familyClusters.has(fid)) familyClusters.set(fid, []);
      familyClusters.get(fid).push(key);
      members.forEach(id => clusteredPeople.add(id));
    }
  }

  for (const [id] of model.people) if (!clusteredPeople.has(id)) graph.setNode(personKey(id), { width: boxWidth, height: normalContent.get(id).height });
  for (const [id, family] of model.families) {
    const status = unionEnds.get(id);
    const mLabel = marriageYears.get(id);
    const w = Math.max(16, status ? unionLabel(status).length * 8 + 16 : 16, mLabel ? mLabel.length * 7.5 + 16 : 16);
    graph.setNode(familyKey(id), { width: w, height: 16 });
    for (const personId of family.partners) graph.setEdge(personKey(personId), familyKey(id), { kind: 'partner', familyId: id, personId });
    for (const personId of family.children) if (!clusteredPeople.has(personId)) graph.setEdge(familyKey(id), personKey(personId), { kind: 'child', familyId: id, personId });
    for (const key of familyClusters.get(id) || []) {
      const cluster = clusters.get(key);
      graph.setNode(key, { width: cluster.width, height: cluster.height });
      graph.setEdge(familyKey(id), key, { kind: 'cluster', familyId: id });
    }
  }

  const treeLayout = model.mode === 'descendants' && layoutDescendantTree(graph, model, focusId, {
    clusters, familyClusters, personKey, familyKey,
    boxWidth, spouseWidth, spouseContent, unionEnds, marriageYears, showMarriageYears, rtl: !en,
  });
  const ancestorLayout = !treeLayout && model.mode === 'ancestors' && !clusters.size && layoutAncestorTree(graph, model, focusId, {
    personKey, familyKey, boxWidth, unionEnds, marriageYears, showMarriageYears, rtl: !en, orientation: ancestorOrientation,
  });
  if (!treeLayout && !ancestorLayout) dagre.layout(graph);

  const layoutKind = treeLayout ? 'family-tree' : ancestorLayout ? 'ancestor-tree' : 'graph';
  const genGuides = showGenerationLabels && graph.graph().generations?.length ? graph.graph().generations : null;
  const isHoriz = Boolean(graph.graph().horizontal);
  const genGuideSideW = genGuides && !isHoriz ? 68 : 0;
  const genGuideTopH = genGuides && isHoriz ? 28 : 0;

  const width = Math.max(800, graph.graph().width + 40 + genGuideSideW);
  const title = pick(`אילן משפחתי של ${data.people[focusId].name}`, `Family chart of ${data.people[focusId].name}`);
  const rawSubtitle = model.mode === 'descendants'
    ? pick(`${model.generations} דורות של צאצאים (כולל האדם הנבחר) · ענפים`, `${model.generations} generations of descendants (including selected person) · Anafim`)
    : pick(`${model.generations} דורות אחורה · ענפים`, `${model.generations} generations of ancestors · Anafim`);
  const subtitle = en ? rawSubtitle : `\u200f${rawSubtitle}`;
  const clusterLegend = gridMode
    ? pick(' · מסגרת מקווקוות: ילדי אותה משפחה', ' · dashed box: children of one family')
    : pick(' · מעגל מקווקו: ילדי אותה משפחה', ' · dashed ring: children of one family');
  const legend = pick('נקודה: משפחה · חץ: ילד/ה · חציית קווים אינה קשר', 'Dot: family · arrow: child · crossings: no link')
    + (clusters.size ? clusterLegend : '');
  const titleLines = wrapChartText(title, width - 70, 20);
  const sexLegend = pick('מין מתועד: פינות חדות — זכר · עגולות — נקבה · מסגרת מקווקוות — אחר/לא צוין', 'Recorded sex: square corners — male · rounded — female · dashed box — other/unspecified');
  const unionLegend = pick('קו זוגיות מקווקו: גירושין או התאלמנות מתועדים', 'Dashed partner line: recorded divorce or widowhood');
  const legendLines = [...wrapChartText(legend, width - 70, 12), ...wrapChartText(sexLegend, width - 70, 12), ...(unionEnds.size ? wrapChartText(unionLegend, width - 70, 12) : [])];

  const basePadX = (width - graph.graph().width - genGuideSideW) / 2;
  const offsetX = genGuideSideW ? (en ? basePadX + genGuideSideW : basePadX) : (width - graph.graph().width) / 2;
  const offsetY = Math.max(85, 65 + titleLines.length * 24) + genGuideTopH;
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
    const endedUnion = info.kind === 'partner' && unionEnds.has(info.familyId);
    const identity = info.kind === 'cluster' ? '' : ` data-person-id="${escapeXml(clean(info.personId))}"`;
    return `<g data-family-id="${escapeXml(clean(info.familyId))}"${identity} data-relation="${info.kind}"><polyline class="line${nonBirth ? ' nonbirth' : ''}${endedUnion ? ' union-ended' : ''}" points="${points}"${info.kind === 'child' ? ' marker-end="url(#child-arrow)"' : ''}/>${annotation}</g>`;
  }).join('');

  const avatarClips = [];
  let clipIndex = 0;
  const personBox = (id, x, y, boxMode = 'normal') => {
    const compact = boxMode === 'compact';
    const spouse = boxMode === 'spouse';
    const bw = compact ? compactWidth : spouse ? spouseWidth : boxWidth;
    const content = (compact ? compactContent : spouse ? spouseContent : normalContent).get(id);
    const person = model.people.get(id);
    const fullName = person.name || '—';
    // Only explicit GEDCOM M/F values get binary styling; never infer from a name or family role.
    const sex = String(person.sex || '').trim().toUpperCase();
    const sexStyle = sex === 'M' || sex === 'F' ? sex : 'other';
    const sexLabel = sexStyle === 'M' ? pick('זכר', 'male') : sexStyle === 'F' ? pick('נקבה', 'female') : pick('אחר או לא צוין', 'other or not recorded');
    const radius = sexStyle === 'M' ? 2 : sexStyle === 'F' ? 15 : 6;
    const bh = content.height;
    const avatar = !compact && hasAvatar(id);
    const textX = avatar ? (en ? x + 17 : x - 17) : x;
    const total = content.lines.reduce((sum, line) => sum + line.height, 0);
    let baseline = y - total / 2;
    const text = content.lines.map(line => {
      baseline += line.height;
      return label(textX, baseline - 3, line.text, line.cls);
    }).join('');
    let avatarMarkup = '';
    if (avatar) {
      const clipId = `avatar-clip-${clipIndex++}`;
      const avatarX = en ? x - bw / 2 + 21 : x + bw / 2 - 21;
      avatarClips.push(`<clipPath id="${clipId}"><circle cx="${avatarX.toFixed(1)}" cy="${y.toFixed(1)}" r="15"/></clipPath>`);
      avatarMarkup = `<image href="${photos[id]}" x="${(avatarX - 15).toFixed(1)}" y="${(y - 15).toFixed(1)}" width="30" height="30" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/><circle class="avatar-ring" cx="${avatarX.toFixed(1)}" cy="${y.toFixed(1)}" r="15"/>`;
    }
    return `<g class="person" data-person-id="${escapeXml(clean(id))}"${compact ? ' data-compact="true"' : ''}${spouse ? ' data-spouse="true"' : ''}><rect class="box${id === focusId ? ' focus' : ''}${compact ? ' compact-box' : ''}${spouse ? ' spouse-box' : ''}" x="${x-bw/2}" y="${y-bh/2}" width="${bw}" height="${bh}" rx="${radius}" data-sex="${sexStyle}"/><title>${escapeXml(clean(`${fullName} — ${sexLabel}`))}</title>${avatarMarkup}${text}</g>`;
  };

  const boxes = [...model.people].filter(([id]) => !clusteredPeople.has(id)).map(([id]) => {
    const node = graph.node(personKey(id));
    return personBox(id, node.x + offsetX, node.y + offsetY, node.staggeredSpouse ? 'spouse' : 'normal');
  }).join('');

  const rings = [...clusters].map(([key, cluster]) => {
    const fid = cluster.fid;
    const node = graph.node(key);
    const cx = node.x + offsetX, cy = node.y + offsetY;
    const entrance = graph.edge(familyKey(fid), key).points.at(-1);
    const ex = entrance.x + offsetX, ey = entrance.y + offsetY;
    if (cluster.kind === 'grid') {
      const sx = cx + cluster.spineX;
      const topY = cy + cluster.spineTop;
      const botY = cy + cluster.spineBottom;
      const spinePoints = cluster.hasJog
        ? `${ex.toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${topY.toFixed(1)} ${sx.toFixed(1)},${topY.toFixed(1)} ${sx.toFixed(1)},${botY.toFixed(1)}`
        : `${ex.toFixed(1)},${ey.toFixed(1)} ${sx.toFixed(1)},${topY.toFixed(1)} ${sx.toFixed(1)},${botY.toFixed(1)}`;
      const childLines = cluster.positions.map(pos =>
        `<g data-family-id="${escapeXml(clean(fid))}" data-person-id="${escapeXml(clean(pos.id))}" data-relation="child"><line class="line" x1="${sx.toFixed(1)}" y1="${(cy + pos.y).toFixed(1)}" x2="${(cx + pos.innerX).toFixed(1)}" y2="${(cy + pos.y).toFixed(1)}" marker-end="url(#child-arrow)"/></g>`
      ).join('');
      const children = cluster.positions.map(pos => personBox(pos.id, cx + pos.x, cy + pos.y, 'compact')).join('');
      return `<g class="branch-ring branch-grid" data-family-id="${escapeXml(clean(fid))}"><rect class="ring-outline" x="${(cx - cluster.width / 2 + 2).toFixed(1)}" y="${(cy - cluster.height / 2).toFixed(1)}" width="${(cluster.width - 4).toFixed(1)}" height="${cluster.height.toFixed(1)}" rx="12"/><polyline class="line" points="${spinePoints}"/>${childLines}${children}</g>`;
    }
    const lines = cluster.positions.map(pos => {
      const childHeight = compactContent.get(pos.id).height;
      const ratio = Math.min(pos.x ? compactWidth / 2 / Math.abs(pos.x) : Infinity, pos.y ? childHeight / 2 / Math.abs(pos.y) : Infinity);
      const x = cx + pos.x * (1 - ratio), y = cy + pos.y * (1 - ratio);
      return `<g data-family-id="${escapeXml(clean(fid))}" data-person-id="${escapeXml(clean(pos.id))}" data-relation="child"><line class="line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" marker-end="url(#child-arrow)"/></g>`;
    }).join('');
    const children = cluster.positions.map(pos => personBox(pos.id, cx + pos.x, cy + pos.y, 'compact')).join('');
    return `<g class="branch-ring" data-family-id="${escapeXml(clean(fid))}"><ellipse class="ring-outline" cx="${cx}" cy="${cy}" rx="${cluster.rx + compactWidth/2 + 8}" ry="${cluster.ry + cluster.maxHeight/2 + 8}"/><line class="line" x1="${ex}" y1="${ey}" x2="${cx}" y2="${cy}"/>${lines}${children}</g>`;
  }).join('');

  const familyNodes = [...model.families].map(([id]) => {
    const node = graph.node(familyKey(id));
    const status = unionEnds.get(id);
    const lx = node.labelX ?? node.x;
    const ly = node.labelY ?? (node.y - 10);
    const annotation = status ? label(lx + offsetX, ly + offsetY, unionLabel(status), 'union-status') : '';
    const mYear = marriageYears.get(id);
    const mx = node.marriageX ?? node.x;
    const my = node.marriageY ?? (node.y - (status ? 23 : 10));
    const marrMarkup = mYear ? label(mx + offsetX, my + offsetY, mYear, 'marriage-year') : '';
    return `<circle class="family-node" data-family-id="${escapeXml(clean(id))}" cx="${node.x + offsetX}" cy="${node.y + offsetY}" r="5"/>${annotation}${marrMarkup}`;
  }).join('');

  const generationGuidesMarkup = genGuides ? `<g class="generation-guides">${genGuides.map(g => {
    const text = g.depth === -1 ? pick('ילדים', 'Children') : pick(`דור ${g.labelIndex}`, `Gen ${g.labelIndex}`);
    const gx = g.axis === 'y' ? (en ? 36 : width - 36) : g.pos + offsetX;
    const gy = g.axis === 'y' ? g.pos + offsetY : offsetY - 14;
    return `<g class="gen-guide"><rect class="gen-pill" x="${(gx - 24).toFixed(1)}" y="${(gy - 10).toFixed(1)}" width="48" height="19" rx="9.5"/><text class="gen-label" x="${gx.toFixed(1)}" y="${(gy + 3.5).toFixed(1)}" direction="${en ? 'ltr' : 'rtl'}">${escapeXml(text)}</text></g>`;
  }).join('')}</g>` : '';

  // Font data is supplied by the app build and must never be an external URL.
  const validFont = value => typeof value === 'string' && /^data:font\/ttf;base64,[A-Za-z0-9+/=]+$/.test(value);
  const embedded = validFont(fonts.regular) && validFont(fonts.bold);
  const fontCss = embedded ? `@font-face{font-family:AnafimChart;src:url('${fonts.regular}') format('truetype');font-weight:400}@font-face{font-family:AnafimChart;src:url('${fonts.bold}') format('truetype');font-weight:600}` : '';
  const fontMetadata = embedded && fonts.license ? `<metadata>${escapeXml(clean(fonts.license))}</metadata>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" data-layout="${layoutKind}" class="pedigree-svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(clean(title))}"><defs><marker id="child-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#7a8a6a"/></marker>${avatarClips.join('')}</defs><style>${fontCss}.pedigree-svg .box{fill:#faf8f4;stroke:#5c6b4a;stroke-width:1.5}.pedigree-svg .box[data-sex="M"]{fill:#edf3f8}.pedigree-svg .box[data-sex="F"]{fill:#f8eef4}.pedigree-svg .box[data-sex="other"]{stroke-dasharray:4 2}.pedigree-svg .box.focus{fill:#e8f0e0;stroke:#3d4f2f;stroke-width:2.2}.pedigree-svg .box.spouse-box{stroke-opacity:0.88}.pedigree-svg .avatar-ring{fill:none;stroke:#7a8a6a;stroke-width:1}.pedigree-svg .name,.pedigree-svg .years,.pedigree-svg .place,.pedigree-svg .title,.pedigree-svg .subtitle,.pedigree-svg .type,.pedigree-svg .union-status,.pedigree-svg .marriage-year,.pedigree-svg .gen-label{font-family:AnafimChart,Arial,sans-serif;text-anchor:middle;fill:#1a1a1a}.pedigree-svg .name{font-size:13px;font-weight:600;unicode-bidi:embed}.pedigree-svg .years{font-size:11px;fill:#555;direction:ltr}.pedigree-svg .place{font-size:10px;fill:#555;unicode-bidi:embed}.pedigree-svg .type{font-size:10px;fill:#6e7a5c;paint-order:stroke;stroke:#fffef9;stroke-width:3px}.pedigree-svg .union-status{font-size:11px;font-weight:600;fill:#37462e;paint-order:stroke;stroke:#fffef9;stroke-width:3px}.pedigree-svg .marriage-year{font-size:10px;font-weight:500;fill:#5c6b4a;paint-order:stroke;stroke:#fffef9;stroke-width:3px}.pedigree-svg .gen-pill{fill:#f1f4ed;stroke:#ccd5c4;stroke-width:1}.pedigree-svg .gen-label{font-size:10px;font-weight:600;fill:#4d5c45}.pedigree-svg .title{font-size:20px;font-weight:600;unicode-bidi:embed}.pedigree-svg .subtitle{font-size:12px;fill:#666;unicode-bidi:embed}.pedigree-svg .line{stroke:#7a8a6a;stroke-width:1.5;fill:none}.pedigree-svg .nonbirth{stroke-dasharray:5 3}.pedigree-svg .union-ended{stroke-dasharray:8 3 2 3}.pedigree-svg .ring-outline{fill:#f5f8f0;stroke:#b3c1ac;stroke-width:1;stroke-dasharray:5 4}.pedigree-svg .family-node{fill:#7a8a6a;stroke:#fffef9;stroke-width:1.5}</style>${fontMetadata}<rect width="100%" height="100%" fill="#fffef9"/>${titleLines.map((line, i) => label(width/2, 30 + i*24, line, 'title')).join('')}${label(width/2, 50 + (titleLines.length-1)*24, subtitle, 'subtitle')}${generationGuidesMarkup}${edges}${rings}${boxes}${familyNodes}${legendLines.map((line, i) => label(width/2, height-10-(legendLines.length-1-i)*15, line, 'subtitle')).join('')}</svg>`;
}
