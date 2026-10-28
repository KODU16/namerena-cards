// 天梯分层地图：每层 10 个天梯名次 + 若干 @! 填充节点，组成一张随机有向图。
// 规则：
//  - 天梯节点按名次向上排列（100 → 99 → … → 该层最好的名次），终点的名次最好；
//  - 只能往前走（深度只增），每个节点最多 4 条出边；
//  - 同层节点按从左到右排序，出边在下一层取连续区间，保证线与线不交叉；
//  - 所有节点可达，所有路径最终汇聚到终点。
export const LAYER_COUNT = 10;
export const DEPTHS = 9;          // 战斗层深度（1..DEPTHS），终点在 DEPTHS+1（每层最多 4 个节点）
export const MIN_NODES = 30;
export const MAX_NODES = 35;
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
export function buildLayerGraph({ entries, layer, teamSize, rng, makeFiller, makeElite }) {
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

  // 天梯节点：按名次从差到好，均匀铺到各深度（每层 1~2 个，保证顺序）
  const perDepthLadder = Array(DEPTHS).fill(0);
  ladderRest.forEach((_, i) => { perDepthLadder[i % DEPTHS] += 1; });
  let li = 0;
  for (let d = 1; d <= DEPTHS; d++) {
    for (let k = 0; k < perDepthLadder[d - 1]; k++) {
      const e = ladderRest[li++];
      if (e) groups[d].push(mk('ladder', e, e.rank));
    }
  }
  // 试炼节点：先给每层补 1 个，再把剩下的随机撒（每层最多 4 个）
  const fillersPool = Array.from({ length: fillerCount }, () => makeFiller(teamSize, rng));
  const capOf = (d) => (d === 1 ? 3 : MAX_PER_DEPTH);
  const spaceLeft = (d) => capOf(d) - groups[d].length;
  for (let d = 1; d <= DEPTHS && fillersPool.length; d++) {
    if (spaceLeft(d) > 0) groups[d].push(mk('filler', fillersPool.pop(), null));
  }
  let guard = 0;
  while (fillersPool.length && guard++ < 200) {
    const d = 1 + Math.floor(rng() * DEPTHS);
    if (spaceLeft(d) <= 0) continue;
    groups[d].push(mk('filler', fillersPool.pop(), null));
  }
  // 同层内交替摆放（天梯/试炼交错），让每条路径都能遇到两种节点
  for (let d = 1; d <= DEPTHS; d++) {
    const ladders = groups[d].filter((n) => n.kind === 'ladder').sort((a, b) => b.rank - a.rank);
    const fillers = shuffle(groups[d].filter((n) => n.kind !== 'ladder'), rng);
    const mixed = [];
    const startWithLadder = rng() < 0.5;
    while (ladders.length || fillers.length) {
      const pickLadder = (mixed.length % 2 === 0) === startWithLadder;
      if (pickLadder && ladders.length) mixed.push(ladders.shift());
      else if (fillers.length) mixed.push(fillers.shift());
      else if (ladders.length) mixed.push(ladders.shift());
      else break;
    }
    groups[d] = mixed;
    groups[d].forEach((n, i) => { n.depth = d; n.order = i; });
  }  // 篝火节点：休息或锻造，每层 1~2 个
  const campCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < campCount; i++) {
    const open = [];
    for (let d = 1; d <= DEPTHS; d++) if (groups[d].length < MAX_PER_DEPTH) open.push(d);
    if (!open.length) break;
    const d = open[Math.floor(rng() * open.length)];
    groups[d].push(mk('camp', null, null));
  }
  // 精英试炼：更强、奖励更厚，每层 1 个
  {
    const open = [];
    for (let d = 1; d <= DEPTHS; d++) if (groups[d].length < MAX_PER_DEPTH) open.push(d);
    if (open.length && makeElite) {
      const d = open[Math.floor(rng() * open.length)];
      groups[d].push(mk('elite', makeElite(teamSize, rng), null));
    }
  }
  // 事件节点（?）：进入不战斗，随机给一张战术/名字/技能卡，1~2 个
  const eventCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < eventCount; i++) {
    const open = [];
    for (let d = 1; d <= DEPTHS; d++) if (groups[d].length < MAX_PER_DEPTH) open.push(d);
    if (!open.length) break;
    const d = open[Math.floor(rng() * open.length)];
    const node = mk('event', null, null);
    const at = Math.floor(rng() * (groups[d].length + 1));
    groups[d].splice(at, 0, node);
  }
  for (let d = 1; d <= DEPTHS; d++) groups[d].forEach((n, i) => { n.depth = d; n.order = i; });
  // 同层位置：随机散布，保持左右顺序与最小间距（避免节点重叠、连线交叉）
  for (let d = 1; d <= DEPTHS; d++) {
    const list = groups[d];
    const n = list.length;
    if (!n) continue;
    const gap = 0.10;
    let xs = Array.from({ length: n }, () => rng()).sort((a, b) => a - b);
    for (let i = 1; i < n; i++) if (xs[i] - xs[i - 1] < gap) xs[i] = xs[i - 1] + gap;
    if (xs[n - 1] > 1) { const shift = xs[n - 1] - 1; xs = xs.map((v) => v - shift); }
    if (xs[0] < 0) { const shift = -xs[0]; xs = xs.map((v) => v + shift); }
    list.forEach((node, i) => {
      node.px = xs[i];
      node.py = (rng() - 0.5) * 40;
    });
  }  start.px = 0.5; end.px = 0.5;
  start.depth = 0; start.order = 0;
  end.depth = DEPTHS + 1; end.order = 0;

  // 保证首尾两层各有 2~4 个节点
  for (const d of [1, DEPTHS]) {
    while (groups[d].length < 2) groups[d].push(mk('filler', makeFiller(teamSize, rng), null));
  }
  // 连边：每条边都满足「源顺序 ≤ 目标顺序」的单调关系，天然不交叉；再加交汇
  for (let d = 0; d <= DEPTHS; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    if (!from.length || !to.length) continue;
    const m = from.length;
    const n = to.length;
    const base = from.map((_, i) => Math.min(n - 1, Math.floor((i * n) / m)));
    // 先把源按顺序映射到目标，保证每个源都有出边
    for (let i = m - 1; i > 0; i--) if (base[i] < base[i - 1]) base[i] = base[i - 1];
    for (let i = 1; i < m; i++) if (base[i] < base[i - 1]) base[i] = base[i - 1];
    const edges = from.map((_, i) => new Set([base[i]]));
    // 交汇：目标再拉一个更靠前的源
    for (let j = 0; j < n; j++) {
      if (rng() > 0.55) continue;
      const owner = base.findIndex((b) => b === j);
      if (owner > 0 && edges[owner - 1].size < MAX_OUT) edges[owner - 1].add(j);
    }
    // 分叉：源再连一个更靠后的目标
    for (let i = 0; i < m; i++) {
      if (rng() > 0.45) continue;
      const t = base[i] + 1;
      if (t < n && edges[i].size < MAX_OUT) edges[i].add(t);
    }
    from.forEach((node, i) => {
      node.next = [...edges[i]].sort((a, b) => a - b).slice(0, MAX_OUT).map((j) => to[j].id);
    });
    // 兜底：确保每个目标至少有一条入边
    to.forEach((t, j) => {
      if (from.some((f) => f.next.includes(t.id))) return;
      const src = from.find((_, i) => i === Math.min(m - 1, Math.floor((j * m) / n)));
      const target = src.next;
      if (target.length < MAX_OUT) target.push(t.id);
    });
  }  // 跨层连线：给长边加一个中间通道点（depth+1，x 取两端中点），
  // 只有两段都不与已有线段相交时才添加 → 可以绕开节点形成编织感
  {
    const xy = (n) => ({ x: n.px, y: n.depth + (n.py || 0) / 120 });
    const segCross = (a, b, c, d) => {
      const ccw = (p, q, r) => (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
      return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
    };
    const allNodes = groups.flat();
    const byId2 = new Map(allNodes.map((n) => [n.id, n]));
    const segs = [];   // {a:{x,y}, b:{x,y}, from, to}
    const addSeg = (a, b, from, to) => segs.push({ a, b, from, to });
    for (const n of allNodes) for (const id of n.next) addSeg(xy(n), xy(byId2.get(id)), n.id, id);
    const hits = (a, b, fromId, toId) => segs.some((s2) => {
      if (s2.from === fromId && s2.to === toId) return false;
      if (s2.from === fromId || s2.to === toId || s2.from === toId || s2.to === fromId) return false;
      return segCross(a, b, s2.a, s2.b);
    });
    for (let d = 0; d <= DEPTHS - 1; d++) {
      for (const node of groups[d]) {
        if (node.next.length >= MAX_OUT) continue;
        const far = groups[d + 2] || [];
        for (const t of far) {
          if (node.next.includes(t.id)) continue;
          const mid = { x: (node.px + t.px) / 2, y: d + 1 + (rng() - 0.5) * 0.1 };
          if (hits(xy(node), mid, node.id, t.id) || hits(mid, xy(t), node.id, t.id)) continue;
          node.next.push(t.id);
          node.via = node.via || {};
          node.via[t.id] = [mid];
          addSeg(xy(node), mid, node.id, t.id);
          addSeg(mid, xy(t), node.id, t.id);
          break;
        }
      }
    }
  }  // 终点汇聚：最后一层全部连到终点
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
