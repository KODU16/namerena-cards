// 天梯分层地图：每层 10 个天梯名次 + 若干 @! 填充节点，组成一张随机有向图。
// 规则：
//  - 天梯节点按名次向上排列（100 → 99 → … → 该层最好的名次），终点的名次最好；
//  - 只能往前走（深度只增），每个节点最多 4 条出边；
//  - 同层节点按从左到右排序，出边在下一层取连续区间，保证线与线不交叉；
//  - 所有节点可达，所有路径最终汇聚到终点。
export const LAYER_COUNT = 10;
export const DEPTHS = 6;          // 战斗层深度（1..DEPTHS），终点在 DEPTHS+1（每层最多 4 个节点）
export const MIN_NODES = 20;
export const MAX_NODES = 25;
export const MAX_OUT = 4;
export const MAX_PER_DEPTH = 4;

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

// 构造一层地图。makeFiller(teamSize) 返回若干张 @! 卡
export function buildLayerGraph({ entries, layer, teamSize, rng, makeFiller }) {
  const ranks = layerRanks(layer);
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const ladderNodes = ranks.map((r) => byRank.get(r)).filter(Boolean);
  const endRank = layerEndRank(layer);
  const endEntry = ladderNodes.find((e) => e.rank === endRank) || ladderNodes[0];

  // 天梯节点按名次从差到好排序；最好的名次留作终点
  const ladderSorted = [...ladderNodes].sort((a, b) => b.rank - a.rank);
  const endLadder = ladderSorted.find((e) => e === endEntry) || ladderSorted[ladderSorted.length - 1];
  const ladderRest = ladderSorted.filter((e) => e !== endLadder);

  const battleCount = MIN_NODES + Math.floor(rng() * (MAX_NODES - MIN_NODES + 1));
  const fillerCount = Math.max(0, battleCount - ladderNodes.length);

  let seq = 0;
  const mk = (kind, payload, rank) => ({
    id: `${kind}-${rank ?? 'x'}-${seq++}`,
    kind,
    rank: rank ?? null,
    payload,
    depth: 0,
    order: 0,
    jitter: (rng() - 0.5) * 26,
    next: [],
  });

  const groups = Array.from({ length: DEPTHS + 2 }, () => []);
  const start = mk('start', null, null);
  const end = mk('end', endLadder, endRank);
  groups[0] = [start];
  groups[DEPTHS + 1] = [end];

  // 天梯节点按名次顺序铺到 1..DEPTHS：越靠上的层名次越好
  ladderRest.forEach((e, i) => {
    const depth = 1 + Math.floor((i * DEPTHS) / Math.max(1, ladderRest.length));
    groups[Math.min(DEPTHS, depth)].push(mk('ladder', e, e.rank));
  });
  // 试炼节点随机撒在各层
  for (let i = 0; i < fillerCount; i++) {
    const depth = 1 + Math.floor(rng() * DEPTHS);
    groups[depth].push(mk('filler', makeFiller(teamSize, rng), null));
  }
  // 每层最多 4 个节点：超出时把试炼节点挪到有空位的层（天梯节点保持名次顺序不动）
  for (let d = 1; d <= DEPTHS; d++) {
    while (groups[d].length > MAX_PER_DEPTH) {
      const idx = groups[d].map((n) => n.kind).lastIndexOf('filler');
      if (idx < 0) break;
      const [moved] = groups[d].splice(idx, 1);
      const target = [1, 2, 3, 4, 5, 6]
        .filter((k) => k !== d && groups[k].length < MAX_PER_DEPTH)
        .sort((a, b) => Math.abs(a - d) - Math.abs(b - d))[0];
      if (!target) { groups[d].push(moved); break; }
      groups[target].push(moved);
    }
  }
  for (let d = 1; d <= DEPTHS; d++) {
    if (groups[d].length) continue;
    groups[d].push(mk('filler', makeFiller(teamSize, rng), null));
  }
  // 同一层里：天梯节点保持名次顺序在前，试炼节点打散在后
  for (let d = 1; d <= DEPTHS; d++) {
    const ladders = groups[d].filter((n) => n.kind === 'ladder').sort((a, b) => b.rank - a.rank);
    const fillers = shuffle(groups[d].filter((n) => n.kind !== 'ladder'), rng);
    groups[d] = [...ladders, ...fillers];
    groups[d].forEach((n, i) => { n.depth = d; n.order = i; });
  }
  start.depth = 0; start.order = 0;
  end.depth = DEPTHS + 1; end.order = 0;

  // 连边：上一层按顺序切分下一层为「连续区间」，区间单调不减 → 线不会交叉
  for (let d = 0; d <= DEPTHS; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    if (!from.length || !to.length) continue;
    const m = from.length;
    const n = to.length;
    from.forEach((node, i) => {
      const lo = Math.min(n - 1, Math.floor((i * n) / m));
      let hi = Math.max(lo + 1, Math.floor(((i + 1) * n) / m));
      hi = Math.min(n, Math.min(hi, lo + MAX_OUT));
      node.next = to.slice(lo, hi).map((t) => t.id);
    });
  }
  // 终点汇聚：最后一层全部连到终点
  for (const node of groups[DEPTHS]) {
    if (!node.next.includes(end.id)) node.next.push(end.id);
  }

  const nodes = groups.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    layer,
    nodes,
    byId,
    startId: start.id,
    endId: end.id,
    teamSize,
    depths: DEPTHS,
    totalNodes: nodes.length,
    battleCount,
  };
}

export function nextNodes(graph, nodeId) {
  const node = graph.byId.get(nodeId);
  if (!node) return [];
  return node.next.map((id) => graph.byId.get(id)).filter(Boolean);
}

// 校验：全可达、全汇聚、只向前、出边 ≤4、战斗节点 20~25
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
  const canReachEnd = new Set([endId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (canReachEnd.has(n.id)) continue;
      if (n.next.some((id) => canReachEnd.has(id))) { canReachEnd.add(n.id); changed = true; }
    }
  }
  let monotonic = true;
  let maxOut = 0;
  for (const n of nodes) {
    maxOut = Math.max(maxOut, n.next.length);
    for (const id of n.next) {
      const t = byId.get(id);
      if (!t || t.depth <= n.depth) monotonic = false;
    }
  }
  return {
    allReachable: seen.size === nodes.length,
    allConverge: canReachEnd.size === nodes.length,
    monotonic,
    maxOutOk: maxOut <= MAX_OUT,
    nonEmpty: graph.battleCount >= MIN_NODES && graph.battleCount <= MAX_NODES,
  };
}
