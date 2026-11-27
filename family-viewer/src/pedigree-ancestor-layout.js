// Dedicated symmetric layout for pure ancestor charts (vertical or horizontal).
// Handles a binary ancestor tree plus focus person's siblings, single partner,
// and children; falls back to the general dagre layout for pedigree collapse,
// side branches, or multiple spouse families of focus/ancestors.

const SAFE_GAP = 35;
const PARTNER_DIST = 185;
const MARGIN = 28;
const V_GAP = 18;

function orderCouple(partners, people, rtl) {
  if (partners.length < 2) return partners;
  const [a, b] = partners;
  const sexA = String(people.get(a)?.sex || '').trim().toUpperCase();
  const sexB = String(people.get(b)?.sex || '').trim().toUpperCase();
  let primary = a, secondary = b;
  if (sexB === 'M' && sexA !== 'M') {
    primary = b; secondary = a;
  } else if (sexA === 'F' && sexB !== 'F' && sexB !== 'M') {
    primary = b; secondary = a;
  }
  return [primary, secondary];
}

export function layoutAncestorTree(
  graph,
  model,
  focusId,
  { personKey, familyKey, boxWidth = 150, unionEnds, marriageYears, showMarriageYears = false, rtl = true, orientation = 'vertical' }
) {
  if (model.mode !== 'ancestors' || model.branchDescendants?.size) return false;

  const childToFamilies = new Map();
  const partnerToFamilies = new Map();
  for (const [fid, family] of model.families) {
    if (family.partners.size > 2) return false;
    for (const p of family.partners) {
      if (!partnerToFamilies.has(p)) partnerToFamilies.set(p, []);
      partnerToFamilies.get(p).push(fid);
    }
    for (const c of family.children) {
      if (!childToFamilies.has(c)) childToFamilies.set(c, []);
      childToFamilies.get(c).push(fid);
    }
  }

  // Focus may have at most one displayed parent family and one spouse family.
  if ((childToFamilies.get(focusId)?.length || 0) > 1) return false;
  const focusSpouseFids = partnerToFamilies.get(focusId) || [];
  if (focusSpouseFids.length > 1) return false;

  const visitedAncestors = new Set([focusId]);
  const usedFamilies = new Set();

  const buildAncNode = (id, gen) => {
    const parentFids = childToFamilies.get(id) || [];
    if (parentFids.length > 1) return null;
    const parentFid = parentFids[0] || null;
    if (!parentFid) return { id, gen, parentFid: null, parents: [] };
    if (usedFamilies.has(parentFid)) return null;
    const fam = model.families.get(parentFid);
    if (id !== focusId && fam.children.size > 1) return null;
    if (id !== focusId && (partnerToFamilies.get(id)?.length || 0) > 1) return null;
    usedFamilies.add(parentFid);

    const ordered = orderCouple([...fam.partners], model.people, rtl);
    const parents = [];
    for (const p of ordered) {
      if (visitedAncestors.has(p)) return null;
      if (id !== focusId && (partnerToFamilies.get(p)?.length || 0) > 1) return null;
      visitedAncestors.add(p);
      const sub = buildAncNode(p, gen + 1);
      if (!sub) return null;
      parents.push(sub);
    }
    return { id, gen, parentFid, parents };
  };

  const ancRoot = buildAncNode(focusId, 0);
  if (!ancRoot) return false;

  const accountedPeople = new Set(visitedAncestors);
  const focusParentFid = ancRoot.parentFid;
  let focusSiblings = [];
  if (focusParentFid) {
    focusSiblings = [...model.families.get(focusParentFid).children].filter(id => id !== focusId);
    for (const sib of focusSiblings) {
      if (accountedPeople.has(sib)) return false;
      if ((partnerToFamilies.get(sib)?.length || 0) > 0) return false;
      if ((childToFamilies.get(sib)?.length || 0) !== 1) return false;
      accountedPeople.add(sib);
    }
  }

  const focusSpouseFid = focusSpouseFids[0] || null;
  let focusPartner = null;
  let focusChildren = [];
  if (focusSpouseFid) {
    if (usedFamilies.has(focusSpouseFid)) return false;
    usedFamilies.add(focusSpouseFid);
    const sf = model.families.get(focusSpouseFid);
    focusPartner = [...sf.partners].find(p => p !== focusId) || null;
    if (focusPartner) {
      if (accountedPeople.has(focusPartner)) return false;
      if ((partnerToFamilies.get(focusPartner)?.length || 0) > 1) return false;
      if ((childToFamilies.get(focusPartner)?.length || 0) > 0) return false;
      accountedPeople.add(focusPartner);
    }
    focusChildren = [...sf.children];
    for (const child of focusChildren) {
      if (accountedPeople.has(child)) return false;
      if ((partnerToFamilies.get(child)?.length || 0) > 0) return false;
      if ((childToFamilies.get(child)?.length || 0) !== 1) return false;
      accountedPeople.add(child);
    }
  }

  if (usedFamilies.size !== model.families.size || accountedPeople.size !== model.people.size) return false;
  for (const id of model.people.keys()) if (!graph.node(personKey(id))) return false;
  for (const fid of model.families.keys()) if (!graph.node(familyKey(fid))) return false;

  const hasLabelWidth = fid => {
    let w = 16;
    if (unionEnds?.has(fid)) w = Math.max(w, graph.node(familyKey(fid)).width);
    if (showMarriageYears && marriageYears?.has(fid)) w = Math.max(w, marriageYears.get(fid).length * 7.5 + 16);
    return w;
  };

  if (orientation === 'horizontal') {
    return layoutHorizontal({
      graph, model, focusId, ancRoot, focusParentFid, focusSiblings,
      focusSpouseFid, focusPartner, focusChildren, personKey, familyKey,
      boxWidth, unionEnds, marriageYears, showMarriageYears, rtl, hasLabelWidth,
    });
  }

  return layoutVertical({
    graph, model, focusId, ancRoot, focusParentFid, focusSiblings,
    focusSpouseFid, focusPartner, focusChildren, personKey, familyKey,
    boxWidth, unionEnds, marriageYears, showMarriageYears, rtl, hasLabelWidth,
  });
}

function setFamilyAnnotationCoords(junction, x, y, fid, unionEnds, marriageYears, showMarriageYears) {
  const hasUnion = Boolean(unionEnds?.has(fid));
  const hasMarr = Boolean(showMarriageYears && marriageYears?.has(fid));
  if (hasUnion) {
    junction.labelX = x;
    junction.labelY = y - 10;
  }
  if (hasMarr) {
    junction.marriageX = x;
    junction.marriageY = y - (hasUnion ? 23 : 10);
  }
}

function layoutVertical({
  graph, focusId, ancRoot, focusParentFid, focusSiblings,
  focusSpouseFid, focusPartner, focusChildren, personKey, familyKey,
  boxWidth, unionEnds, marriageYears, showMarriageYears, rtl, hasLabelWidth,
}) {
  // Measure ancestor subtrees bottom-up (from focus up to oldest generation)
  let maxGen = 0;
  const measureAnc = node => {
    maxGen = Math.max(maxGen, node.gen);
    if (!node.parents.length) {
      node.width = boxWidth;
      node.centerOffset = boxWidth / 2;
      return;
    }
    if (node.parents.length === 1) {
      const p = node.parents[0];
      measureAnc(p);
      node.leftChild = p;
      node.rightChild = null;
      node.width = Math.max(p.width, boxWidth, hasLabelWidth(node.parentFid));
      node.centerOffset = node.width / 2;
      return;
    }
    const [p1, p2] = node.parents;
    measureAnc(p1);
    measureAnc(p2);
    // In RTL, primary parent (father) sits on the right; in LTR, on the left.
    const leftTree = rtl ? p2 : p1;
    const rightTree = rtl ? p1 : p2;
    node.leftChild = leftTree;
    node.rightChild = rightTree;
    const labelW = hasLabelWidth(node.parentFid);
    const rawW = leftTree.width + SAFE_GAP + rightTree.width;
    node.width = Math.max(rawW, labelW);
    const pad = (node.width - rawW) / 2;
    node.leftStart = pad;
    node.rightStart = pad + leftTree.width + SAFE_GAP;
    const leftCenter = node.leftStart + leftTree.centerOffset;
    const rightCenter = node.rightStart + rightTree.centerOffset;
    node.centerOffset = (leftCenter + rightCenter) / 2;
  };
  measureAnc(ancRoot);

  // Measure focus's own row (siblings + focus + partner + children below focus)
  const orderedSibs = rtl ? [...focusSiblings].reverse() : [...focusSiblings];
  const childrenW = focusChildren.length
    ? focusChildren.length * boxWidth + (focusChildren.length - 1) * SAFE_GAP
    : 0;
  const orderedChildren = rtl ? [...focusChildren].reverse() : [...focusChildren];
  const spouseLabelW = focusSpouseFid ? hasLabelWidth(focusSpouseFid) : 0;
  const focusCoupleW = focusPartner ? PARTNER_DIST + boxWidth : boxWidth;
  const focusUnitW = Math.max(focusCoupleW, childrenW, spouseLabelW);

  // Place focus+partner unit on the left side of siblings in RTL (right in LTR)
  // so sibling bus lines from parents never cross focus's partner line.
  const sibsW = orderedSibs.length ? orderedSibs.length * boxWidth + (orderedSibs.length - 1) * SAFE_GAP : 0;
  const focusCenterInUnit = focusPartner
    ? (rtl ? focusUnitW / 2 + PARTNER_DIST / 2 : focusUnitW / 2 - PARTNER_DIST / 2)
    : focusUnitW / 2;
  const partnerCenterInUnit = focusPartner
    ? (rtl ? focusUnitW / 2 - PARTNER_DIST / 2 : focusUnitW / 2 + PARTNER_DIST / 2)
    : null;

  let focusRowW = focusUnitW;
  let unitStartInRow = 0;
  let sibStartsInRow = [];
  if (orderedSibs.length) {
    focusRowW = focusUnitW + SAFE_GAP + sibsW;
    if (rtl) {
      unitStartInRow = 0;
      let sx = focusUnitW + SAFE_GAP;
      for (let i = 0; i < orderedSibs.length; i++) {
        sibStartsInRow.push(sx);
        sx += boxWidth + SAFE_GAP;
      }
    } else {
      let sx = 0;
      for (let i = 0; i < orderedSibs.length; i++) {
        sibStartsInRow.push(sx);
        sx += boxWidth + SAFE_GAP;
      }
      unitStartInRow = sibsW + SAFE_GAP;
    }
  }
  const focusXInRow = unitStartInRow + focusCenterInUnit;

  // Align ancRoot's focus attachment point with focusRow's focus attachment point
  // (or midpoint of focus + siblings when siblings exist).
  const rowAttachX = orderedSibs.length
    ? (() => {
        const firstSibX = sibStartsInRow[0] + boxWidth / 2;
        const lastSibX = sibStartsInRow.at(-1) + boxWidth / 2;
        const minX = Math.min(focusXInRow, firstSibX);
        const maxX = Math.max(focusXInRow, lastSibX);
        return (minX + maxX) / 2;
      })()
    : focusXInRow;

  const leftExtent = Math.max(ancRoot.centerOffset, rowAttachX);
  const rightExtent = Math.max(ancRoot.width - ancRoot.centerOffset, focusRowW - rowAttachX);
  const totalWidth = leftExtent + rightExtent;
  const ancLeft = leftExtent - ancRoot.centerOffset;
  const rowLeft = leftExtent - rowAttachX;

  // Measure row heights per generation (oldest gen = row 0, focus = row maxGen, children = row maxGen + 1)
  const rowHeights = new Map();
  const collectAncRow = node => {
    const row = maxGen - node.gen;
    rowHeights.set(row, Math.max(rowHeights.get(row) || 0, graph.node(personKey(node.id)).height));
    for (const p of node.parents) collectAncRow(p);
  };
  collectAncRow(ancRoot);
  for (const sib of focusSiblings) {
    rowHeights.set(maxGen, Math.max(rowHeights.get(maxGen) || 0, graph.node(personKey(sib)).height));
  }
  if (focusPartner) {
    rowHeights.set(maxGen, Math.max(rowHeights.get(maxGen) || 0, graph.node(personKey(focusPartner)).height));
  }
  const hasChildrenRow = focusChildren.length > 0;
  if (hasChildrenRow) {
    let maxChildH = 0;
    for (const c of focusChildren) maxChildH = Math.max(maxChildH, graph.node(personKey(c)).height);
    rowHeights.set(maxGen + 1, maxChildH);
  }

  const rowTops = new Map(), rowCenters = new Map(), rowFamilyY = new Map(), rowBusY = new Map();
  let top = 20;
  const lastRow = hasChildrenRow ? maxGen + 1 : maxGen;
  for (let r = 0; r <= lastRow; r++) {
    const h = rowHeights.get(r);
    rowTops.set(r, top);
    rowCenters.set(r, top + h / 2);
    const hasSpouseOnlyRow = r === maxGen && !hasChildrenRow && focusSpouseFid;
    const hasFamiliesBelow = r < maxGen || hasChildrenRow || hasSpouseOnlyRow;
    if (hasFamiliesBelow) {
      rowFamilyY.set(r, top + h + 45);
      rowBusY.set(r, top + h + 67.5);
    }
    top += h + (hasFamiliesBelow ? 90 : 0);
  }

  // Place ancestor nodes recursively (row for node.gen is maxGen - node.gen)
  const placeAnc = (node, left) => {
    const r = maxGen - node.gen;
    const pNode = graph.node(personKey(node.id));
    if (node.gen > 0) {
      pNode.x = MARGIN + left + node.centerOffset;
      pNode.y = rowCenters.get(r);
    }
    if (!node.parents.length) return;
    const parentRow = maxGen - (node.gen + 1);
    if (node.parents.length === 1) {
      const p = node.leftChild;
      const childLeft = left + (node.width - p.width) / 2;
      placeAnc(p, childLeft);
      const j = graph.node(familyKey(node.parentFid));
      j.x = graph.node(personKey(p.id)).x;
      j.y = rowFamilyY.get(parentRow);
      setFamilyAnnotationCoords(j, j.x, j.y, node.parentFid, unionEnds, marriageYears, showMarriageYears);
    } else {
      placeAnc(node.leftChild, left + node.leftStart);
      placeAnc(node.rightChild, left + node.rightStart);
      const lx = graph.node(personKey(node.leftChild.id)).x;
      const rx = graph.node(personKey(node.rightChild.id)).x;
      const j = graph.node(familyKey(node.parentFid));
      j.x = (lx + rx) / 2;
      j.y = rowFamilyY.get(parentRow);
      setFamilyAnnotationCoords(j, j.x, j.y, node.parentFid, unionEnds, marriageYears, showMarriageYears);
    }
  };
  placeAnc(ancRoot, ancLeft);

  // Place focus, siblings, partner, and children
  const focusNode = graph.node(personKey(focusId));
  focusNode.x = MARGIN + rowLeft + focusXInRow;
  focusNode.y = rowCenters.get(maxGen);

  orderedSibs.forEach((sib, idx) => {
    const sNode = graph.node(personKey(sib));
    sNode.x = MARGIN + rowLeft + sibStartsInRow[idx] + boxWidth / 2;
    sNode.y = rowCenters.get(maxGen);
  });

  if (focusPartner) {
    const fpNode = graph.node(personKey(focusPartner));
    fpNode.x = MARGIN + rowLeft + unitStartInRow + partnerCenterInUnit;
    fpNode.y = rowCenters.get(maxGen);
  }

  if (focusSpouseFid) {
    const j = graph.node(familyKey(focusSpouseFid));
    j.x = focusPartner
      ? (focusNode.x + graph.node(personKey(focusPartner)).x) / 2
      : focusNode.x;
    j.y = rowFamilyY.get(maxGen);
    setFamilyAnnotationCoords(j, j.x, j.y, focusSpouseFid, unionEnds, marriageYears, showMarriageYears);
  }

  if (hasChildrenRow) {
    let cx = MARGIN + rowLeft + unitStartInRow + (focusUnitW - childrenW) / 2;
    for (const child of orderedChildren) {
      const cNode = graph.node(personKey(child));
      cNode.x = cx + boxWidth / 2;
      cNode.y = rowCenters.get(maxGen + 1);
      cx += boxWidth + SAFE_GAP;
    }
  }

  // Record generation guides (1 = focus gen, 2 = parents, ..., plus 0/Children if present)
  const generations = [];
  for (let g = maxGen; g >= 0; g--) {
    generations.push({ depth: g, labelIndex: g + 1, axis: 'y', pos: rowCenters.get(maxGen - g) });
  }
  if (hasChildrenRow) {
    generations.push({ depth: -1, labelIndex: 0, axis: 'y', pos: rowCenters.get(maxGen + 1) });
  }

  graph.graph().width = totalWidth + MARGIN * 2;
  graph.graph().height = top + 20;
  graph.graph().generations = generations;
  graph.graph().horizontal = false;

  // Orthogonal routes
  const familyRow = new Map();
  const markAncFam = node => {
    if (node.parentFid) familyRow.set(node.parentFid, maxGen - (node.gen + 1));
    for (const p of node.parents) markAncFam(p);
  };
  markAncFam(ancRoot);
  if (focusSpouseFid) familyRow.set(focusSpouseFid, maxGen);

  for (const edge of graph.edges()) {
    const info = graph.edge(edge), source = graph.node(edge.v), target = graph.node(edge.w);
    if (info.kind === 'partner') {
      const start = { x: source.x, y: source.y + source.height / 2 };
      const midY = (start.y + target.y) / 2;
      info.points = [start, { x: start.x, y: midY }, { x: target.x, y: midY }, { x: target.x, y: target.y }];
    } else {
      const r = familyRow.get(info.familyId);
      const busY = rowBusY.get(r);
      info.points = [{ x: source.x, y: source.y }, { x: source.x, y: busY }, { x: target.x, y: busY }, { x: target.x, y: target.y - target.height / 2 }];
    }
  }
  return true;
}

function layoutHorizontal({
  graph, focusId, ancRoot, focusParentFid, focusSiblings,
  focusSpouseFid, focusPartner, focusChildren, personKey, familyKey,
  boxWidth, unionEnds, marriageYears, showMarriageYears, rtl, hasLabelWidth,
}) {
  const colGap = 86;
  const colStep = boxWidth + colGap; // 236px
  let maxGen = 0;

  const measureAncH = node => {
    maxGen = Math.max(maxGen, node.gen);
    const h = graph.node(personKey(node.id)).height;
    if (!node.parents.length) {
      node.spanH = h;
      node.centerOffsetY = h / 2;
      return;
    }
    if (node.parents.length === 1) {
      const p = node.parents[0];
      measureAncH(p);
      node.topChild = p;
      node.botChild = null;
      node.spanH = Math.max(h, p.spanH);
      node.centerOffsetY = node.spanH / 2;
      return;
    }
    const [p1, p2] = node.parents;
    measureAncH(p1);
    measureAncH(p2);
    node.topChild = p1;
    node.botChild = p2;
    const rawH = p1.spanH + V_GAP + p2.spanH;
    node.spanH = Math.max(h, rawH);
    const pad = (node.spanH - rawH) / 2;
    node.topStart = pad;
    node.botStart = pad + p1.spanH + V_GAP;
    const topC = node.topStart + p1.centerOffsetY;
    const botC = node.botStart + p2.centerOffsetY;
    node.centerOffsetY = (topC + botC) / 2;
  };
  measureAncH(ancRoot);

  // Column 0 vertical stack: [...focusSiblings, focusId, ...(focusPartner ? [focusPartner] : [])]
  const col0Items = [...focusSiblings, focusId, ...(focusPartner ? [focusPartner] : [])];
  const col0H = col0Items.reduce((sum, id) => sum + graph.node(personKey(id)).height, 0) + Math.max(0, col0Items.length - 1) * V_GAP;
  let focusYInCol0 = 0;
  {
    let y = 0;
    for (const id of col0Items) {
      const h = graph.node(personKey(id)).height;
      if (id === focusId) focusYInCol0 = y + h / 2;
      y += h + V_GAP;
    }
  }

  const hasChildrenCol = focusChildren.length > 0;
  const childrenH = hasChildrenCol
    ? focusChildren.reduce((sum, id) => sum + graph.node(personKey(id)).height, 0) + (focusChildren.length - 1) * V_GAP
    : 0;
  const focusCoupleMidInCol0 = focusPartner
    ? focusYInCol0 + (graph.node(personKey(focusId)).height / 2 + V_GAP + graph.node(personKey(focusPartner)).height / 2) / 2
    : focusYInCol0;

  // Align ancestor center with focus (or midpoint of focus + siblings when siblings exist)
  let col0AttachY = focusYInCol0;
  if (focusSiblings.length) {
    let minY = Infinity, maxY = -Infinity, y = 0;
    for (const id of [...focusSiblings, focusId]) {
      const h = graph.node(personKey(id)).height;
      minY = Math.min(minY, y + h / 2);
      maxY = Math.max(maxY, y + h / 2);
      y += h + V_GAP;
    }
    col0AttachY = (minY + maxY) / 2;
  }

  const childrenAttachY = childrenH / 2;
  const topExtent = Math.max(ancRoot.centerOffsetY, col0AttachY, hasChildrenCol ? col0AttachY - focusCoupleMidInCol0 + childrenAttachY : 0);
  const botExtent = Math.max(ancRoot.spanH - ancRoot.centerOffsetY, col0H - col0AttachY, hasChildrenCol ? (focusCoupleMidInCol0 - col0AttachY) + (childrenH - childrenAttachY) : 0);
  const totalHeight = topExtent + botExtent;
  const ancTop = 20 + (topExtent - ancRoot.centerOffsetY);
  const col0Top = 20 + (topExtent - col0AttachY);

  // Horizontal column positions:
  // RTL: oldest ancestors on left (col 0), focus on right (col maxGen), children on far right (col maxGen + 1).
  // LTR: children on far left (col 0 if present), focus on left, oldest ancestors on right.
  const minGen = hasChildrenCol ? -1 : 0;
  const extraOuterPad = focusSpouseFid && !hasChildrenCol ? 65 : 0;
  const leftPad = rtl ? MARGIN : MARGIN + extraOuterPad;
  const rightPad = rtl ? MARGIN + extraOuterPad : MARGIN;
  const colCenterX = g => {
    const idx = rtl ? maxGen - g : g - minGen;
    return leftPad + boxWidth / 2 + idx * colStep;
  };
  const numCols = maxGen - minGen + 1;
  const totalWidth = (numCols - 1) * colStep + boxWidth;

  // Direction from parent column toward child column (+1 RTL, -1 LTR)
  const dirToChild = rtl ? 1 : -1;

  const setHorizontalFamAnnotation = (j, fid) => {
    const hasUnion = Boolean(unionEnds?.has(fid));
    const hasMarr = Boolean(showMarriageYears && marriageYears?.has(fid));
    if (hasUnion) {
      j.labelX = j.x;
      j.labelY = j.y - 10;
    }
    if (hasMarr) {
      j.marriageX = j.x;
      j.marriageY = hasUnion ? j.y + 18 : j.y - 10;
    }
  };

  const placeAncH = (node, topY) => {
    const pNode = graph.node(personKey(node.id));
    if (node.gen > 0) {
      pNode.x = colCenterX(node.gen);
      pNode.y = topY + node.centerOffsetY;
    }
    if (!node.parents.length) return;
    const parentX = colCenterX(node.gen + 1);
    const parentEdge = parentX + dirToChild * (boxWidth / 2);
    const jx = parentEdge + dirToChild * 28;
    if (node.parents.length === 1) {
      const p = node.topChild;
      placeAncH(p, topY + (node.spanH - p.spanH) / 2);
      const j = graph.node(familyKey(node.parentFid));
      j.x = jx;
      j.y = graph.node(personKey(p.id)).y;
      setHorizontalFamAnnotation(j, node.parentFid);
    } else {
      placeAncH(node.topChild, topY + node.topStart);
      placeAncH(node.botChild, topY + node.botStart);
      const ty = graph.node(personKey(node.topChild.id)).y;
      const by = graph.node(personKey(node.botChild.id)).y;
      const j = graph.node(familyKey(node.parentFid));
      j.x = jx;
      j.y = (ty + by) / 2;
      setHorizontalFamAnnotation(j, node.parentFid);
    }
  };
  placeAncH(ancRoot, ancTop);

  // Place column 0 items
  {
    let y = col0Top;
    for (const id of col0Items) {
      const node = graph.node(personKey(id));
      node.x = colCenterX(0);
      node.y = y + node.height / 2;
      y += node.height + V_GAP;
    }
  }

  // Place focus spouse family dot on the child-facing side of column 0
  if (focusSpouseFid) {
    const fNode = graph.node(personKey(focusId));
    const fpNode = focusPartner ? graph.node(personKey(focusPartner)) : null;
    const j = graph.node(familyKey(focusSpouseFid));
    const childFacingEdge = colCenterX(0) + dirToChild * (boxWidth / 2);
    j.x = childFacingEdge + dirToChild * 28;
    j.y = fpNode ? (fNode.y + fpNode.y) / 2 : fNode.y;
    setHorizontalFamAnnotation(j, focusSpouseFid);
  }

  if (hasChildrenCol) {
    const fNode = graph.node(personKey(focusId));
    const fpNode = focusPartner ? graph.node(personKey(focusPartner)) : null;
    const coupleMidY = fpNode ? (fNode.y + fpNode.y) / 2 : fNode.y;
    let y = coupleMidY - childrenH / 2;
    for (const child of focusChildren) {
      const cNode = graph.node(personKey(child));
      cNode.x = colCenterX(-1);
      cNode.y = y + cNode.height / 2;
      y += cNode.height + V_GAP;
    }
  }

  const generations = [];
  for (let g = 0; g <= maxGen; g++) {
    generations.push({ depth: g, labelIndex: g + 1, axis: 'x', pos: colCenterX(g) });
  }
  if (hasChildrenCol) {
    generations.push({ depth: -1, labelIndex: 0, axis: 'x', pos: colCenterX(-1) });
  }

  graph.graph().width = totalWidth + leftPad + rightPad;
  graph.graph().height = totalHeight + 40;
  graph.graph().generations = generations;
  graph.graph().horizontal = true;

  // Orthogonal horizontal routes
  for (const edge of graph.edges()) {
    const info = graph.edge(edge), source = graph.node(edge.v), target = graph.node(edge.w);
    if (info.kind === 'partner') {
      const startX = source.x + dirToChild * (source.width / 2);
      const midX = (startX + target.x) / 2;
      info.points = [
        { x: startX, y: source.y },
        { x: midX, y: source.y },
        { x: midX, y: target.y },
        { x: target.x, y: target.y },
      ];
    } else {
      const targetEdgeX = target.x - dirToChild * (target.width / 2);
      const busX = targetEdgeX - dirToChild * 20;
      info.points = [
        { x: source.x, y: source.y },
        { x: busX, y: source.y },
        { x: busX, y: target.y },
        { x: targetEdgeX, y: target.y },
      ];
    }
  }
  return true;
}
