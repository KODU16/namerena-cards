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
    const gap = 0.17;
    let xs = Array.from({ length: n }, () => rng()).sort((a, b) => a - b);
    for (let i = 1; i < n; i++) if (xs[i] - xs[i - 1] < gap) xs[i] = xs[i - 1] + gap;
    if (xs[n - 1] > 1) { const shift = xs[n - 1] - 1; xs = xs.map((v) => v - shift); }
    if (xs[0] < 0) { const shift = -xs[0]; xs = xs.map((v) => v + shift); }
    list.forEach((node, i) => {
      node.px = xs[i];
      node.py = (rng() - 0.5) * 110;
    });
  }  start.px = 0.5; end.px = 0.5;
  start.depth = 0; start.order = 0;
  end.depth = DEPTHS + 1; end.order = 0;

  // 保证首尾两层各有 2~4 个节点
  for (const d of [1, DEPTHS]) {
    while (groups[d].length < 2) groups[d].push(mk('filler', makeFiller(teamSize, rng), null));
  }
  // 连边：每层按顺序把下一层切成连续区间，但每段长度随机（1~4）→ 出边数量不一、仍然不交叉
  for (let d = 0; d <= DEPTHS; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    if (!from.length || !to.length) continue;
    const m = from.length;
    const n = to.length;
    // 一半的层用「滑窗」连边：相邻节点共享目标，形成密集的交汇
    if (rng() < 0.5 && m >= 2 && n >= 2) {
      from.forEach((node, i) => {
        const lo = Math.floor((i * (n - 1)) / Math.max(1, m - 1));
        const width = 2 + Math.floor(rng() * 2);
        const hi = Math.min(n - 1, lo + width - 1);
        node.next = to.slice(lo, hi + 1).map((t) => t.id);
      });
      from.forEach((node) => { if (!node.next.length) node.next = [to[n - 1].id]; });
      to.forEach((t) => { if (!from.some((f) => f.next.includes(t.id))) from[from.length - 1].next.push(t.id); });
      for (const node of [...from]) node.next = [...new Set(node.next)].slice(0, MAX_OUT);
      continue;
    }
    let cursor = 0;
    from.forEach((node, i) => {
      if (cursor >= n) {
        // 目标已经分完：后来者共享最后一格，保证每个节点都有出边
        node.next = [to[n - 1].id];
        return;
      }
      const leftSources = m - i - 1;
      const leftTargets = n - cursor;
      const maxTake = Math.max(1, Math.min(MAX_OUT, leftTargets - leftSources));
      const take = Math.max(1, Math.min(maxTake, 1 + Math.floor(rng() * Math.min(MAX_OUT, leftTargets))));
      node.next = to.slice(cursor, cursor + take).map((t) => t.id);
      cursor += take;
    });
    // 交汇：把一部分边延伸到下一个节点的区间，制造多条路线汇入同一个节点
    for (let i = 0; i + 1 < m; i++) {
      const a = from[i];
      const b = from[i + 1];
      if (!a.next.length || b.next.length < 2) continue;
      if (rng() < 0.8) {
        const extra = rng() < 0.4 ? 2 : 1;
        for (let k = 0; k < extra && k < b.next.length; k++) {
          if (a.next.length >= MAX_OUT) break;
          const t = b.next[k];
          if (!a.next.includes(t)) a.next.push(t);
        }
      }
    }
    // 剩下的目标补到最后一个有出边的节点
    if (cursor < n) {
      const holder = [...from].reverse().find((x) => x.next.length);
      if (holder) {
        for (let k = cursor; k < n; k++) {
          if (holder.next.length >= MAX_OUT) break;
          holder.next.push(to[k].id);
        }
      }
    }
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
