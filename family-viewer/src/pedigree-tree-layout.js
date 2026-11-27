// Lay out tree-shaped descendant graphs in contiguous family blocks. A person
// with multiple displayed parents, a shared partner, or a cycle cannot safely
// be assigned to one block without hiding links or duplicating people; callers
// must fall back to the general graph layout in those cases.
export function layoutDescendantTree(
  graph,
  model,
  focusId,
  {
    clusters,
    familyClusters,
    personKey,
    familyKey,
    boxWidth = 150,
    spouseWidth = 136,
    spouseContent,
    unionEnds,
    marriageYears,
    showMarriageYears = false,
    rtl = true,
  }
) {
  const depth = model.descendantDepth;
  if (!depth?.has(focusId)) return false;
  const ownFamilies = new Map(), partnerOwner = new Map(), parentFamily = new Map();
  for (const [fid, family] of model.families) {
    const owners = [...family.partners].filter(id => depth.has(id));
    if (owners.length !== 1 || family.partners.size > 2) return false;
    const owner = owners[0];
    if (!ownFamilies.has(owner)) ownFamilies.set(owner, []);
    ownFamilies.get(owner).push(fid);
    if (ownFamilies.get(owner).length > 2) return false;
    for (const partner of family.partners) if (partner !== owner) {
      if (partnerOwner.has(partner)) return false;
      partnerOwner.set(partner, owner);
    }
    for (const child of family.children) {
      if (!depth.has(child) || depth.get(child) !== depth.get(owner) + 1 || parentFamily.has(child)) return false;
      parentFamily.set(child, fid);
    }
  }
  if (parentFamily.has(focusId)) return false;
  for (const id of depth.keys()) if (id !== focusId && !parentFamily.has(id)) return false;
  for (const id of model.people.keys()) if (!depth.has(id) && !partnerOwner.has(id)) return false;

  const clusterByChild = new Map();
  for (const [key, cluster] of clusters) for (const position of cluster.positions) {
    if (clusterByChild.has(position.id)) return false;
    clusterByChild.set(position.id, key);
  }

  const gap = 35, partnerDistance = 185, margin = 28, indent = 22;
  const coupleWidth = spouseWidth + indent;
  const dir = rtl ? 1 : -1;

  const familyLabelWidth = fid => {
    let w = unionEnds?.has(fid) ? graph.node(familyKey(fid)).width : 0;
    if (showMarriageYears && marriageYears?.has(fid)) {
      w = Math.max(w, marriageYears.get(fid).length * 7.5 + 16);
    }
    return w;
  };

  const visited = new Set();
  const build = id => {
    if (visited.has(id)) return null;
    visited.add(id);
    const rawFamilies = ownFamilies.get(id) || [];
    const orderedFids = rtl && rawFamilies.length === 2 ? [...rawFamilies].reverse() : rawFamilies;
    const families = [];
    for (const fid of orderedFids) {
      const family = model.families.get(fid), units = [], seenClusters = new Set();
      for (const child of family.children) {
        const key = clusterByChild.get(child);
        if (key) {
          if (!familyClusters.get(fid)?.includes(key)) return null;
          if (!seenClusters.has(key)) {
            const cluster = clusters.get(key);
            units.push({ kind: 'cluster', key, width: cluster.width });
            seenClusters.add(key);
            for (const item of cluster.positions) visited.add(item.id);
          }
        } else {
          const tree = build(child);
          if (!tree) return null;
          units.push({ kind: 'person', tree, width: tree.width });
        }
      }
      // Order sibling branches RTL in Hebrew (oldest on right) and place
      // compact sibling circles near the middle of their siblings.
      const ordinary = units.filter(unit => unit.kind === 'person');
      if (rtl && ordinary.length > 1) ordinary.reverse();
      const circles = units.filter(unit => unit.kind === 'cluster');
      if (ordinary.length && circles.length) {
        const middle = Math.ceil(ordinary.length / 2);
        units.splice(0, units.length, ...ordinary.slice(0, middle), ...circles, ...ordinary.slice(middle));
      } else {
        units.splice(0, units.length, ...ordinary, ...circles);
      }
      const childrenWidth = units.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, units.length - 1) * gap;
      const partner = [...family.partners].find(other => other !== id);
      families.push({ fid, partner, units, childrenWidth });
    }
    if (families.length === 0) return { id, width: graph.node(personKey(id)).width, rootX: graph.node(personKey(id)).width / 2, families };
    const isRoot = depth.get(id) === 0;
    if (families.length === 1) {
      const family = families[0];
      if (isRoot) {
        const width = Math.max(family.childrenWidth, family.partner ? partnerDistance + boxWidth : boxWidth, familyLabelWidth(family.fid));
        family.width = width; family.left = 0;
        const rootOffset = dir * (partnerDistance / 2);
        return { id, width, rootX: width / 2 + (family.partner ? rootOffset : 0), families };
      }
      const statusW = familyLabelWidth(family.fid);
      const width = Math.max(family.childrenWidth, family.partner ? coupleWidth : boxWidth, statusW);
      family.width = width; family.left = 0;
      const cx = width / 2;
      const ownerOffset = dir * ((coupleWidth - boxWidth) / 2);
      return { id, width, rootX: family.partner ? cx + ownerOffset : cx, families };
    }
    if (isRoot) {
      for (const family of families) family.width = Math.max(family.childrenWidth, 260, familyLabelWidth(family.fid) + 40);
    } else {
      for (const family of families) {
        const statusW = familyLabelWidth(family.fid);
        const minW = family.partner ? spouseWidth + 44 + statusW : Math.max(boxWidth, statusW);
        family.width = Math.max(family.childrenWidth, minW);
      }
    }
    families[0].left = 0;
    families[1].left = families[0].width + gap;
    return { id, width: families[0].width + gap + families[1].width, rootX: families[0].width + gap / 2, families };
  };
  const tree = build(focusId);
  if (!tree || visited.size !== depth.size) return false;

  // Verify every required graph node exists before mutating any partner node dimensions.
  const familyLevels = new Map();
  for (const [id] of depth) if (!clusterByChild.has(id) && !graph.node(personKey(id))) return false;
  for (const [partner] of partnerOwner) if (!graph.node(personKey(partner))) return false;
  for (const [key, cluster] of clusters) {
    const level = depth.get(cluster.positions[0].id);
    if (level === undefined || cluster.positions.some(item => depth.get(item.id) !== level) || !graph.node(key)) return false;
  }
  for (const [owner, familyIds] of ownFamilies) for (const fid of familyIds) familyLevels.set(fid, depth.get(owner));

  // Validation is complete. Resize staggered descendant partners before measuring bands.
  for (const [partner, owner] of partnerOwner) {
    if (depth.get(owner) > 0) {
      const pNode = graph.node(personKey(partner));
      pNode.width = spouseWidth;
      if (spouseContent?.has(partner)) pNode.height = spouseContent.get(partner).height;
      pNode.staggeredSpouse = true;
    }
  }

  const rowTops = new Map(), levelBusY = new Map();
  let top = 20, rootCenterY = 0, rootFamilyY = 0;
  const maxRootH = Math.max(
    graph.node(personKey(focusId)).height,
    ...(ownFamilies.get(focusId) || []).map(fid => {
      const partner = [...model.families.get(fid).partners].find(p => p !== focusId);
      return partner ? graph.node(personKey(partner)).height : 0;
    })
  );
  rowTops.set(0, top);
  rootCenterY = top + maxRootH / 2;
  if (ownFamilies.get(focusId)?.length) {
    rootFamilyY = top + maxRootH + 45;
    levelBusY.set(0, top + maxRootH + 67.5);
    top += maxRootH + 90;
  } else {
    top += maxRootH;
  }

  const hasAnn = fid => Boolean(unionEnds?.has(fid) || (showMarriageYears && marriageYears?.has(fid)));
  const hasBothAnn = fid => Boolean(unionEnds?.has(fid) && showMarriageYears && marriageYears?.has(fid));

  for (let level = 1; level <= model.lastDescendantDepth; level++) {
    rowTops.set(level, top);
    let maxBandH = 0;
    for (const [id, d] of depth) {
      if (d !== level || clusterByChild.has(id)) continue;
      const ownerH = graph.node(personKey(id)).height;
      const fids = ownFamilies.get(id) || [];
      let bandH = ownerH;
      if (fids.length === 1) {
        const fid = fids[0];
        const partner = [...model.families.get(fid).partners].find(p => p !== id);
        if (partner) {
          const spouseGap = hasBothAnn(fid) ? 34 : hasAnn(fid) ? 24 : 12;
          bandH = ownerH + spouseGap + graph.node(personKey(partner)).height;
        } else {
          bandH = ownerH + (hasBothAnn(fid) ? 36 : 26);
        }
      } else if (fids.length === 2) {
        const partnerHeights = fids.map(fid => {
          const partner = [...model.families.get(fid).partners].find(p => p !== id);
          return partner ? graph.node(personKey(partner)).height : 0;
        });
        const maxSpouseH = Math.max(...partnerHeights);
        bandH = maxSpouseH > 0 ? ownerH + 14 + maxSpouseH : ownerH + 28;
      }
      maxBandH = Math.max(maxBandH, bandH);
    }
    for (const [, cluster] of clusters) {
      if (depth.get(cluster.positions[0].id) === level) maxBandH = Math.max(maxBandH, cluster.height);
    }
    if (!maxBandH) return false;
    const bandBottom = top + maxBandH;
    if (level < model.lastDescendantDepth) {
      levelBusY.set(level, bandBottom + 20);
      top = bandBottom + 44;
    } else {
      top = bandBottom;
    }
  }

  // Place nodes in contiguous family blocks; root stays side-by-side while
  // descendant partners sit half a row below and indented inward.
  const familyVisualSide = new Map();
  const place = (item, left) => {
    const level = depth.get(item.id);
    const owner = graph.node(personKey(item.id));
    owner.x = margin + left + item.rootX;
    owner.y = level === 0 ? rootCenterY : rowTops.get(level) + owner.height / 2;
    const ownerBottom = owner.y + owner.height / 2;
    const two = item.families.length === 2;

    item.families.forEach((family, index) => {
      const partner = family.partner && graph.node(personKey(family.partner));
      const junction = graph.node(familyKey(family.fid));
      const hasUnion = Boolean(unionEnds?.has(family.fid));
      const hasMarr = Boolean(showMarriageYears && marriageYears?.has(family.fid));
      familyVisualSide.set(family.fid, index === 0 ? 'left' : 'right');

      if (level === 0) {
        const sign = two ? (index === 0 ? -1 : 1) : -dir;
        if (partner) { partner.x = owner.x + sign * partnerDistance; partner.y = owner.y; }
        junction.x = partner ? (owner.x + partner.x) / 2 : owner.x + (two ? sign * 40 : 0);
        junction.y = rootFamilyY;
        if (hasUnion) {
          junction.labelX = junction.x;
          junction.labelY = junction.y - 10;
        }
        if (hasMarr) {
          junction.marriageX = junction.x;
          junction.marriageY = junction.y - (hasUnion ? 23 : 10);
        }
      } else if (!two) {
        const cx = margin + left + family.width / 2;
        if (partner) {
          const spouseGap = hasUnion && hasMarr ? 34 : (hasUnion || hasMarr) ? 24 : 12;
          partner.x = cx - dir * (indent / 2);
          partner.y = ownerBottom + spouseGap + partner.height / 2;
          const gutterX = cx + dir * (coupleWidth / 2 - indent / 2);
          junction.x = gutterX;
          junction.y = partner.y;
          if (hasUnion) {
            junction.labelX = cx;
            junction.labelY = ownerBottom + 15;
          }
          if (hasMarr) {
            junction.marriageX = cx;
            junction.marriageY = ownerBottom + (hasUnion ? 28 : 16);
          }
        } else {
          junction.x = owner.x;
          junction.y = ownerBottom + (hasUnion && hasMarr ? 30 : 20);
          if (hasUnion) {
            junction.labelX = junction.x;
            junction.labelY = junction.y - 10;
          }
          if (hasMarr) {
            junction.marriageX = junction.x;
            junction.marriageY = junction.y - (hasUnion ? 22 : 10);
          }
        }
      } else {
        const blockCx = margin + left + family.left + family.width / 2;
        const isLeft = index === 0;
        if (partner) {
          partner.x = blockCx;
          partner.y = ownerBottom + 14 + partner.height / 2;
          const gutterX = isLeft ? partner.x + spouseWidth / 2 + 11 : partner.x - spouseWidth / 2 - 11;
          junction.x = gutterX;
          junction.y = partner.y;
          if (hasUnion) {
            const labelHalf = Math.max(20, (graph.node(familyKey(family.fid)).width - 16) * 0.45);
            junction.labelX = isLeft ? gutterX + labelHalf + 5 : gutterX - labelHalf - 5;
            junction.labelY = junction.y + 4;
          }
          if (hasMarr) {
            const mHalf = Math.max(20, marriageYears.get(family.fid).length * 3.5);
            junction.marriageX = isLeft ? gutterX + mHalf + 5 : gutterX - mHalf - 5;
            junction.marriageY = hasUnion ? junction.y + 17 : junction.y + 4;
          }
        } else {
          junction.x = blockCx;
          junction.y = ownerBottom + 22;
          if (hasUnion) {
            junction.labelX = junction.x;
            junction.labelY = junction.y - 10;
          }
          if (hasMarr) {
            junction.marriageX = junction.x;
            junction.marriageY = junction.y - (hasUnion ? 22 : 10);
          }
        }
      }

      let childLeft = left + family.left + (family.width - family.childrenWidth) / 2;
      for (const unit of family.units) {
        if (unit.kind === 'person') place(unit.tree, childLeft);
        else {
          const node = graph.node(unit.key);
          node.x = margin + childLeft + unit.width / 2;
          node.y = rowTops.get(level + 1) + node.height / 2;
        }
        childLeft += unit.width + gap;
      }
    });
  };
  place(tree, 0);

  const generations = [];
  for (let level = 0; level <= model.lastDescendantDepth; level++) {
    generations.push({
      depth: level,
      labelIndex: level + 1,
      axis: 'y',
      pos: level === 0 ? rootCenterY : rowTops.get(level) + 27,
    });
  }

  graph.graph().width = tree.width + margin * 2;
  graph.graph().height = top + 20;
  graph.graph().generations = generations;
  graph.graph().horizontal = false;

  for (const edge of graph.edges()) {
    const info = graph.edge(edge), source = graph.node(edge.v), target = graph.node(edge.w);
    if (info.kind === 'partner') {
      const personId = info.personId;
      if (depth.has(personId)) {
        const ownerLevel = depth.get(personId);
        const ownerBottom = source.y + source.height / 2;
        if (ownerLevel === 0) {
          const start = { x: source.x, y: ownerBottom };
          const midY = (start.y + target.y) / 2;
          info.points = [start, { x: start.x, y: midY }, { x: target.x, y: midY }, { x: target.x, y: target.y }];
        } else {
          const fids = ownFamilies.get(personId) || [];
          if (fids.length === 2) {
            const isLeft = familyVisualSide.get(info.familyId) === 'left';
            const startX = source.x + (isLeft ? -24 : 24);
            const turnY = ownerBottom + 7;
            info.points = [{ x: startX, y: ownerBottom }, { x: startX, y: turnY }, { x: target.x, y: turnY }, { x: target.x, y: target.y }];
          } else if (model.families.get(info.familyId).partners.size > 1) {
            info.points = [{ x: target.x, y: ownerBottom }, { x: target.x, y: target.y }];
          } else {
            info.points = [{ x: source.x, y: ownerBottom }, { x: target.x, y: target.y }];
          }
        }
      } else {
        const owner = partnerOwner.get(personId);
        if (depth.get(owner) === 0) {
          const start = { x: source.x, y: source.y + source.height / 2 };
          const midY = (start.y + target.y) / 2;
          info.points = [start, { x: start.x, y: midY }, { x: target.x, y: midY }, { x: target.x, y: target.y }];
        } else {
          const goRight = target.x > source.x;
          const startX = source.x + (goRight ? source.width / 2 : -source.width / 2);
          info.points = [{ x: startX, y: source.y }, { x: target.x, y: target.y }];
        }
      }
    } else {
      const level = familyLevels.get(info.familyId);
      const busY = levelBusY.get(level);
      info.points = [{ x: source.x, y: source.y }, { x: source.x, y: busY }, { x: target.x, y: busY }, { x: target.x, y: target.y - target.height / 2 }];
    }
  }
  return true;
}
