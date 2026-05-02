import dagre from "dagre";

const NODE_W = 200;
const NODE_H = 52;

/**
 * Один підграф «підстанція → …», розкладка LR через dagre.
 * Повертає nodes/edges для React Flow та висоту блоку для вертикального стикування.
 */
export function layoutSubstationSubtree(sub) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 72, marginx: 20, marginy: 20 });

  const rfNodes = [];
  const rfEdges = [];

  function addNode(id, label, kind, payload) {
    rfNodes.push({
      id,
      type: "topoNode",
      position: { x: 0, y: 0 },
      data: { label, kind, payload }
    });
    g.setNode(id, { width: NODE_W, height: NODE_H });
  }

  function addEdge(a, b) {
    rfEdges.push({ id: `e-${a}-${b}`, source: a, target: b });
    g.setEdge(a, b);
  }

  const root = `sub-${sub.id}`;
  addNode(root, `${sub.code}\n${sub.name}`, "substation", sub);

  for (const tr of sub.transformers || []) {
    const tid = `tr-${tr.id}`;
    addNode(tid, `${tr.code}\n${tr.name}`, "transformer", tr);
    addEdge(root, tid);

    for (const line of tr.lines || []) {
      const lid = `line-${line.id}`;
      addNode(lid, `${line.code}\n${line.name}`, "line", line);
      addEdge(tid, lid);

      for (const site of line.sites || []) {
        const siteId = `site-${site.id}`;
        const siteLabel = site.enterprise_name ? `${site.name}\n(${site.enterprise_name})` : site.name;
        addNode(siteId, siteLabel || `Об'єкт ${site.id}`, "site", site);
        addEdge(lid, siteId);

        for (const meter of site.meters || []) {
          const mid = `meter-${meter.id}`;
          addNode(mid, `${meter.serial_number}\n${meter.zone_name}`, "meter", meter);
          addEdge(siteId, mid);
        }
      }
    }
  }

  if (rfNodes.length === 0) {
    return { nodes: [], edges: [], blockHeight: 0 };
  }

  dagre.layout(g);

  rfNodes.forEach((n) => {
    const p = g.node(n.id);
    if (p) {
      n.position = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
    }
  });

  return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Усі підстанції: окремі LR-графи один під одним (не з'єднані між собою).
 */
export function buildTopologyFlowGraph(substations) {
  const list = substations || [];
  if (list.length === 0) {
    return { nodes: [], edges: [] };
  }

  const allNodes = [];
  const allEdges = [];
  let yCursor = 0;
  const gap = 56;

  for (const sub of list) {
    const { nodes, edges } = layoutSubstationSubtree(sub);
    if (nodes.length === 0) continue;

    const minY = Math.min(...nodes.map((n) => n.position.y));
    const dy = yCursor - minY;
    nodes.forEach((n) => {
      n.position = { x: n.position.x, y: n.position.y + dy };
    });

    allNodes.push(...nodes);
    allEdges.push(...edges);

    let maxBottom = 0;
    nodes.forEach((n) => {
      maxBottom = Math.max(maxBottom, n.position.y + NODE_H);
    });
    yCursor = maxBottom + gap;
  }

  return { nodes: allNodes, edges: allEdges };
}
