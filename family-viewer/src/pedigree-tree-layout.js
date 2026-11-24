// Lay out tree-shaped descendant graphs in contiguous family blocks. A person
// with multiple displayed parents, a shared partner, or a cycle cannot safely
// be assigned to one block without hiding links or duplicating people; callers
// must fall back to the general graph layout in those cases.
export function layoutDescendantTree(graph, model, focusId, { clusters, familyClusters, personKey, familyKey }) {
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
  const gap = 35, partnerDistance = 185, margin = 28;
  const visited = new Set();
  const build = id => {
    if (visited.has(id)) return null;
    visited.add(id);
    const families = [];
    for (const fid of ownFamilies.get(id) || []) {
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
      // Place circles among their siblings rather than at the far end of a
      // branch, while retaining the relative order within each group.
      const ordinary = units.filter(unit => unit.kind === 'person');
      const circles = units.filter(unit => unit.kind === 'cluster');
      if (ordinary.length && circles.length) {
        const middle = Math.ceil(ordinary.length / 2);
        units.splice(0, units.length, ...ordinary.slice(0, middle), ...circles, ...ordinary.slice(middle));
      }
      const childrenWidth = units.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, units.length - 1) * gap;
      const partner = [...family.partners].find(other => other !== id);
      families.push({ fid, partner, units, childrenWidth });
    }
    if (families.length === 0) return { id, width: graph.node(personKey(id)).width, rootX: graph.node(personKey(id)).width / 2, families };
    if (families.length === 1) {
      const family = families[0];
      const width = Math.max(family.childrenWidth, family.partner ? partnerDistance + 150 : 150, graph.node(familyKey(family.fid)).width);
      family.width = width; family.left = 0;
      return { id, width, rootX: width / 2 - (family.partner ? partnerDistance / 2 : 0), families };
    }
    for (const family of families) family.width = Math.max(family.childrenWidth, 260, graph.node(familyKey(family.fid)).width + 40);
    families[0].left = 0;
    families[1].left = families[0].width + gap;
    return { id, width: families[0].width + gap + families[1].width, rootX: families[0].width + gap / 2, families };
  };
  const tree = build(focusId);
  if (!tree || visited.size !== depth.size) return false;

  const rows = new Map(), familyLevels = new Map(), nodeLevels = new Map();
  const rowNode = (key, level) => {
    const node = graph.node(key);
    if (!node) return false;
    nodeLevels.set(key, level);
    rows.set(level, Math.max(rows.get(level) || 0, node.height));
    return true;
  };
  for (const [id, level] of depth) if (!clusterByChild.has(id) && !rowNode(personKey(id), level)) return false;
  for (const [partner, owner] of partnerOwner) if (!rowNode(personKey(partner), depth.get(owner))) return false;
  for (const [key, cluster] of clusters) {
    const level = depth.get(cluster.positions[0].id);
    if (level === undefined || cluster.positions.some(item => depth.get(item.id) !== level) || !rowNode(key, level)) return false;
  }
  for (const [owner, familyIds] of ownFamilies) for (const fid of familyIds) familyLevels.set(fid, depth.get(owner));
  const rowCenters = new Map(), rowTops = new Map(), familyY = new Map();
  let top = 20;
  for (let level = 0; level <= model.lastDescendantDepth; level++) {
    const height = rows.get(level);
    if (!height) return false;
    rowTops.set(level, top);
    rowCenters.set(level, top + height / 2);
    const hasFamilies = [...familyLevels.values()].includes(level);
    if (hasFamilies) familyY.set(level, top + height + 45);
    top += height + (hasFamilies || level < model.lastDescendantDepth ? 90 : 0);
  }
  // All validation is complete. Set positions and orthogonal routes; family
  // buses may share segments within one family but do not cross other blocks.
  const place = (item, left) => {
    const owner = graph.node(personKey(item.id));
    owner.x = margin + left + item.rootX;
    owner.y = rowCenters.get(depth.get(item.id));
    item.families.forEach((family, index) => {
      const two = item.families.length === 2;
      const sign = two && index === 0 ? -1 : 1;
      const partner = family.partner && graph.node(personKey(family.partner));
      if (partner) { partner.x = owner.x + sign * partnerDistance; partner.y = owner.y; }
      const junction = graph.node(familyKey(family.fid));
      junction.x = partner ? (owner.x + partner.x) / 2 : owner.x + (two ? sign * 40 : 0);
      junction.y = familyY.get(depth.get(item.id));
      let childLeft = left + family.left + (family.width - family.childrenWidth) / 2;
      for (const unit of family.units) {
        if (unit.kind === 'person') place(unit.tree, childLeft);
        else {
          const node = graph.node(unit.key);
          node.x = margin + childLeft + unit.width / 2;
          node.y = rowCenters.get(nodeLevels.get(unit.key));
        }
        childLeft += unit.width + gap;
      }
    });
  };
  place(tree, 0);
  graph.graph().width = tree.width + margin * 2;
  graph.graph().height = top + 20;
  for (const edge of graph.edges()) {
    const info = graph.edge(edge), source = graph.node(edge.v), target = graph.node(edge.w);
    if (info.kind === 'partner') {
      const start = { x: source.x, y: source.y + source.height / 2 };
      const midY = (start.y + target.y) / 2;
      info.points = [start, {x:start.x, y:midY}, {x:target.x, y:midY}, {x:target.x, y:target.y}];
    } else {
      const level = familyLevels.get(info.familyId);
      const busY = (source.y + rowTops.get(level + 1)) / 2;
      info.points = [{x:source.x, y:source.y}, {x:source.x, y:busY}, {x:target.x, y:busY}, {x:target.x, y:target.y - target.height / 2}];
    }
  }
  return true;
}
