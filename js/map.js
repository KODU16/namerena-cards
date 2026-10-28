// 天梯分层地图：每层 10 个天梯名次 + 若干 @! 填充节点，组成一张随机有向图。
// 规则：只能往前（深度只增），所有节点可达，所有路径最终汇聚到「该层名次最高的天梯选手」。
export const LAYER_COUNT = 10;
export const DEPTHS = 5;          // 每层地图的深度（起点 0，终点 DEPTHS）
export const MIN_NODES = 20;
export const MAX_NODES = 25;

// 第 layer 层（1..10）对应的 10 个天梯名次：第 1 层是 91~100，第 10 层是 1~10
export function layerRanks(layer) {
  const low = 101 - layer * 10;
  return Array.from({ length: 10 }, (_, i) => low + i);
}

export function layerEndRank(layer) {
  return Math.min(...layerRanks(layer));
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 构造一层地图。entries 是整条天梯（含 rank），makeFiller(teamSize) 返回 [{name,clan}] 若干张卡
export function buildLayerGraph({ entries, layer, teamSize, rng, makeFiller }) {
  const ranks = layerRanks(layer);
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const ladderNodes = ranks.map((r) => byRank.get(r)).filter(Boolean);
  const endRank = layerEndRank(layer);
  const endEntry = ladderNodes.find((e) => e.rank === endRank) || ladderNodes[0];
  const rest = ladderNodes.filter((e) => e !== endEntry);

  // 战斗节点 20~25 个（不含起点/终点），其中 10 个是天梯名次，其余用 @! 填充
  const battleNodes = MIN_NODES + Math.floor(rng() * (MAX_NODES - MIN_NODES + 1));
  const fillerCount = Math.max(0, battleNodes - ladderNodes.length);
  const fillers = Array.from({ length: fillerCount }, () => makeFiller(teamSize, rng));

  const mk = (kind, payload, rank) => ({
    id: `${kind}-${rank ?? Math.floor(rng() * 1e9)}-${Math.floor(rng() * 1e6)}`,
    kind,
    rank: rank ?? null,
    payload,
    depth: 0,
    next: [],
  });

  const nodes = [
    mk('start', null, null),
    ...rest.map((e) => mk('ladder', e, e.rank)),
    ...fillers.map((f) => mk('filler', f, null)),
    mk('end', endEntry, endRank),
  ];
  const start = nodes[0];
  const end = nodes[nodes.length - 1];
  start.depth = 0;
  end.depth = DEPTHS;

  // 把中间节点分到 1..DEPTHS-1 各层，终点独占 DEPTHS
  const middle = shuffle(nodes.slice(1, -1), rng);
  const groups = Array.from({ length: DEPTHS + 1 }, () => []);
  groups[0] = [start];
  groups[DEPTHS] = [end];
  middle.forEach((n, i) => {
    const depth = 1 + (i % (DEPTHS - 1));
    groups[depth].push(n);
    n.depth = depth;
  });

  // 连边：每个节点连向下一深度 1~2 个节点；再补齐没有入边的节点
  for (let d = 0; d < DEPTHS; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    for (const node of from) {
      const picks = shuffle(to, rng).slice(0, Math.min(to.length, 1 + Math.floor(rng() * 2)));
      node.next = [...new Set([...node.next, ...picks.map((p) => p.id)])];
    }
    for (const target of to) {
      const hasIn = from.some((f) => f.next.includes(target.id));
      if (!hasIn) {
        const pick = from[Math.floor(rng() * from.length)];
        pick.next.push(target.id);
      }
    }
  }
  // 终点汇聚：最后一层所有节点都连到终点（上面已保证至少一条，这里补满）
  const lastDepth = groups[DEPTHS - 1];
  for (const node of lastDepth) {
    if (!node.next.includes(end.id)) node.next.push(end.id);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    layer,
    nodes,
    byId,
    startId: start.id,
    endId: end.id,
    teamSize,
    totalNodes: nodes.length,
  };
}

// 从某个节点出发能去的下一批节点
export function nextNodes(graph, nodeId) {
  const node = graph.byId.get(nodeId);
  if (!node) return [];
  return node.next.map((id) => graph.byId.get(id)).filter(Boolean);
}

// 校验：起点可达所有节点、所有节点都能走到终点、没有回边
export function validateGraph(graph) {
  const { nodes, startId, endId, byId } = graph;
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const n of byId.get(id)?.next || []) stack.push(n);
  }
  const allReachable = seen.size === nodes.length;

  const canReachEnd = new Set([endId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (canReachEnd.has(n.id)) continue;
      if (n.next.some((id) => canReachEnd.has(id))) { canReachEnd.add(n.id); changed = true; }
    }
  }
  const allConverge = canReachEnd.size === nodes.length;

  let monotonic = true;
  for (const n of nodes) {
    for (const id of n.next) {
      const t = byId.get(id);
      if (!t || t.depth <= n.depth) monotonic = false;
    }
  }
  return { allReachable, allConverge, monotonic, nonEmpty: nodes.length >= MIN_NODES };
}
