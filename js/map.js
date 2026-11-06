// 天梯分层地图：每层 10 个天梯名次 + 若干 @! 填充节点，组成一张随机有向图。
// 规则：
//  - 天梯节点按名次向上排列（100 → 99 → … → 该层最好的名次），终点的名次最好；
//  - 只能往前走（深度只增），每个节点的入边与出边合计最多 4 条；
//  - 节点均匀分布并保留随机偏移，只连接相邻深度且保持左右顺序；
//  - 连线避让节点圆形边界及 8 像素余量，共用节点处的夹角至少 25°；
//  - 所有节点可达，所有路径最终汇聚到终点。
export const LAYER_COUNT = 10;
export const DEPTHS = 12;          // 默认战斗层深度；实际深度随玩家选择的节点数扩展。
export const MIN_NODES = 20;
export const MAX_NODES = 80;
export const DEFAULT_NODES = 40;
// 总连接数上限；保留 MAX_OUT 供已有调用使用。
export const MAX_CONNECTIONS = 4;
export const MAX_OUT = MAX_CONNECTIONS;
export const MAX_PER_DEPTH = 4;
// 生成与绘制共用尺寸；间距包含描边及悬停放大的余量。
export const MAP_LAYOUT = { width: 980, row: 150, pad: 80, inset: 60 };
export const NODE_CLEARANCE = 8;
export const MIN_EDGE_ANGLE = 25;
// 节点数是包含起点与层末 Boss 的可见总数，统一归一化旧存档与外部调用。
export function normalizeNodeCount(value) {
  const rounded = Math.round((Number(value) || DEFAULT_NODES) / 10) * 10;
  return Math.max(MIN_NODES, Math.min(MAX_NODES, rounded));
}
export function mapNodeRadius(node) {
  return node.kind === 'start' || node.kind === 'end' ? 30 : (node.kind === 'elite' ? 32 : 24);
}

function mapPoint(node) {
  return { x: MAP_LAYOUT.inset + node.px * (MAP_LAYOUT.width - 2 * MAP_LAYOUT.inset),
    y: -node.depth * MAP_LAYOUT.row + (node.py || 0) };
}

// 投影到有限线段，检测连线是否侵入其他节点的圆形范围。
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function angleOk(origin, a, b) {
  const ax = a.x - origin.x, ay = a.y - origin.y;
  const bx = b.x - origin.x, by = b.y - origin.y;
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return lengths > 0 && (ax * bx + ay * by) / lengths <= Math.cos(MIN_EDGE_ANGLE * Math.PI / 180) + 1e-9;
}

// 同时校验入边和出边的端点切向；旧地图的折线路径也参与检查。
function geometryRules(nodes, byId) {
  const ports = new Map(nodes.map((n) => [n.id, []]));
  let nodeClearanceOk = true;
  for (const from of nodes) for (const id of from.next) {
    const to = byId.get(id);
    if (!to) continue;
    const points = [mapPoint(from), ...(from.via?.[id] || []).map((p) => ({
      x: MAP_LAYOUT.inset + p.x * (MAP_LAYOUT.width - 2 * MAP_LAYOUT.inset), y: -p.y * MAP_LAYOUT.row,
    })), mapPoint(to)];
    ports.get(from.id).push(points[1]);
    ports.get(to.id).push(points[points.length - 2]);
    for (const node of nodes) {
      if (node.id === from.id || node.id === to.id) continue;
      for (let i = 1; i < points.length; i++) {
        if (segmentDistance(mapPoint(node), points[i - 1], points[i]) < mapNodeRadius(node) + NODE_CLEARANCE) nodeClearanceOk = false;
      }
    }
  }
  const minAngleOk = nodes.every((node) => {
    const directions = ports.get(node.id);
    return directions.every((p, i) => directions.slice(i + 1).every((q) => angleOk(mapPoint(node), p, q)));
  });
  return { nodeClearanceOk, minAngleOk };
}

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
export function buildLayerGraph({ entries, layer, teamSize, rng, makeFiller, makeElite, makeCpu, eliteCount = 2, bossRush = false, nodeCount = DEFAULT_NODES }) {
  const targetNodes = normalizeNodeCount(nodeCount);
  // 每行最多四点，按目标节点数延长地图，而不是把 80 个节点硬塞进旧的 12 行。
  const depths = Math.max(5, Math.ceil((targetNodes - 2) / MAX_PER_DEPTH));
  const ranks = layerRanks(layer);
  const byRank = new Map(entries.map((e) => [e.rank, e]));
  const ladderNodes = ranks.map((r) => byRank.get(r)).filter(Boolean);
  const endRank = layerEndRank(layer);
  const endEntry = ladderNodes.find((e) => e.rank === endRank) || ladderNodes[0];

  // 天梯节点按名次从差到好排序；最好的名次留作终点
  const ladderSorted = [...ladderNodes].sort((a, b) => b.rank - a.rank);
  const endLadder = ladderSorted.find((e) => e === endEntry) || ladderSorted[ladderSorted.length - 1];
  const ladderRest = ladderSorted.filter((e) => e !== endLadder);

  // 以旧版约 50 节点地图的平均数量为比例缩放；节点总数确定后不再掷“是否出现”。
  const scaleCount = (count, atLeastOne = true) => Math.max(atLeastOne ? 1 : 0, Math.round(targetNodes * count / 50));
  const campCount = scaleCount(3.5);
  const baseEliteCount = scaleCount(2);
  // A1 的精英增量即使在 20 节点小地图也至少保留一格，避免词条被整数舍入吞掉。
  const wantedEliteCount = makeElite ? Math.max(baseEliteCount + (eliteCount > 2 ? 1 : 0), scaleCount(eliteCount)) : 0;
  const shopCount = scaleCount(2);
  const cpuCount = makeCpu ? scaleCount(1) : 0;
  const chestCount = scaleCount(1.5);
  const eventCount = scaleCount(2.5);
  const baseSpecialCount = campCount + wantedEliteCount + shopCount + cpuCount + chestCount + eventCount;
  const merchantCount = Math.min(3, Math.max(0, Math.min(scaleCount(1, false), targetNodes - 1 - ladderNodes.length - baseSpecialCount)));
  // 商人数量固定，种类仅改变落点，不改变节点总量或出现占比。
  const activeMerchants = shuffle(['weaponMerchant', 'curseMerchant', 'constructMerchant'], rng).slice(0, merchantCount);
  // battleCount 含层末 Boss；起点单独计数，避免总节点预算少算 Boss 一格。
  const battleCount = targetNodes - 1 - baseSpecialCount - merchantCount;
  const fillerCount = Math.max(0, battleCount - ladderNodes.length);

  let seq = 0;
  const mk = (kind, payload, rank) => ({
    id: `${kind}-${rank ?? 'x'}-${seq++}`,
    kind,
    rank: rank ?? null,
    payload,
    depth: 0,
    order: 0,
    next: [],
  });

  const groups = Array.from({ length: depths + 2 }, () => []);
  const start = mk('start', null, null);
  const runnerUp = bossRush ? ladderSorted.find((entry) => entry.rank === endRank + 1) : null;
  const end = mk('end', bossRush && runnerUp ? { ...endLadder, cards: [...(runnerUp.cards || []), ...(endLadder.cards || [])], rank: endRank, score: endLadder.score, name: '天梯 #2/#1 连战' } : endLadder, endRank);
  groups[0] = [start];
  groups[depths + 1] = [end];

  // 天梯节点：按名次从差到好，均匀铺到各深度（每层 1~2 个，保证顺序）
  const perDepthLadder = Array(depths).fill(0);
  ladderRest.forEach((_, i) => { perDepthLadder[i % depths] += 1; });
  let li = 0;
  for (let d = 1; d <= depths; d++) {
    for (let k = 0; k < perDepthLadder[d - 1]; k++) {
      const e = ladderRest[li++];
      if (e) groups[d].push(mk('ladder', e, e.rank));
    }
  }
  // 优先补到节点最少的深度，同样稀疏的行随机选择，避免节点聚集。
  const sparseDepths = () => {
    const sizes = groups.slice(1, depths + 1).map((list) => list.length);
    const min = Math.min(...sizes);
    return sizes.flatMap((size, i) => size === min && size < MAX_PER_DEPTH ? [i + 1] : []);
  };
  const pickSparseDepth = () => {
    const open = sparseDepths();
    return open[Math.floor(rng() * open.length)];
  };
  for (let i = 0; i < fillerCount; i++) {
    const d = pickSparseDepth();
    if (d === undefined) break;
    groups[d].push(mk('filler', makeFiller(teamSize, rng), null));
  }
  // 同层内交替摆放（天梯/试炼交错），让每条路径都能遇到两种节点
  for (let d = 1; d <= depths; d++) {
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
  }
  // 篝火节点：休息或锻造，数量按玩家选择的节点数缩放。
  for (let i = 0; i < campCount; i++) {
    const open = sparseDepths();
    if (!open.length) break;
    const d = open[Math.floor(rng() * open.length)];
    groups[d].push(mk('camp', null, null));
  }
  // 精英试炼：更强、奖励更厚，A1 仍会额外增加一个。
  {
    for (let rep = 0; rep < wantedEliteCount; rep++) {
      // 每次插入后重算容量，避免新增节点把同一行挤到五个。
      const d = pickSparseDepth();
      if (d === undefined) break;
      groups[d].push(mk('elite', makeElite(teamSize, rng), null));
    }
  }
  // 商人配额固定，随机仅决定是哪几种商人，低节点数不会挤掉天梯节点。
  for (const kind of activeMerchants) {
    const d = pickSparseDepth();
    if (d !== undefined) groups[d].push(mk(kind, null, null));
  }
  // 商店与电脑按地图规模增加，所有插入都遵守四点一行的几何上限。
  for (let i = 0; i < shopCount; i++) {
    const d = pickSparseDepth();
    if (d !== undefined) groups[d].push(mk('shop', null, null));
  }
  for (let i = 0; i < cpuCount; i++) {
    const d = pickSparseDepth();
    if (d !== undefined) groups[d].push(mk('cpu', makeCpu(rng), null));
  }
  // 宝箱不战斗，领取物品及额外天梯分数。
  for (let i = 0; i < chestCount; i++) {
    const d = pickSparseDepth();
    if (d === undefined) break;
    groups[d].push(mk('chest', null, null));
  }
  // 补给节点：进入不战斗，从完整奖池随机领取一项奖励。
  for (let i = 0; i < eventCount; i++) {
    const open = sparseDepths();
    if (!open.length) break;
    const d = open[Math.floor(rng() * open.length)];
    const node = mk('event', null, null);
    const at = Math.floor(rng() * (groups[d].length + 1));
    groups[d].splice(at, 0, node);
  }
  // 目标已预留到每行容量内；一节点行也可形成合法的单路线。
  // 随机布局失败时重排；最后使用经过相同几何检查的均匀布局。
  const placeNodes = (randomize) => {
    for (let d = 0; d < groups.length; d++) {
      const list = groups[d];
      const rowOffset = randomize && d > 0 && d <= depths ? (rng() - 0.5) * 32 : 0;
      list.forEach((node, i) => {
        node.depth = d;
        node.order = i;
        node.px = list.length === 1 ? 0.5 : (i + 0.5 + (randomize ? (rng() - 0.5) * 0.36 : 0)) / list.length;
        node.py = rowOffset;
      });
    }
  };
  const nodes = groups.flat();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map(nodes.map((n) => [n.id, []]));
  const degree = new Map(groups.flat().map((node) => [node.id, 0]));
  const connect = (from, to) => {
    from.next.push(to.id);
    neighbors.get(from.id).push(to);
    neighbors.get(to.id).push(from);
    degree.set(from.id, degree.get(from.id) + 1);
    degree.set(to.id, degree.get(to.id) + 1);
  };
  // 按等宽区间的重叠关系构建骨架：每个节点都有前后通路，边的次序不会反转。
  // 中间行各有 2~4 个节点，因此骨架的每侧至多两条边，总度数不会超过 4。
  for (let d = 0; d <= depths; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    from.forEach((node, i) => {
      to.forEach((target, j) => {
        if (i * to.length < (j + 1) * from.length && j * from.length < (i + 1) * to.length) {
          connect(node, target);
        }
      });
    });
  }
  let placed = false;
  for (let attempt = 0; attempt <= 64; attempt++) {
    placeNodes(attempt < 64);
    const geometry = geometryRules(nodes, byId);
    if (geometry.nodeClearanceOk && geometry.minAngleOk) { placed = true; break; }
  }
  if (!placed) throw new Error('地图布局无法满足节点避让及最小夹角要求');
  // 加边时检查两端夹角及沿途节点，不通过则保留已有连通骨架。
  const edgeFits = (from, to) => {
    const a = mapPoint(from), b = mapPoint(to);
    return nodes.every((n) => n === from || n === to
      || segmentDistance(mapPoint(n), a, b) >= mapNodeRadius(n) + NODE_CLEARANCE)
      && neighbors.get(from.id).every((n) => angleOk(a, b, mapPoint(n)))
      && neighbors.get(to.id).every((n) => angleOk(b, a, mapPoint(n)));
  };
  // 所有骨架边完成后再随机加分支，为下一行保留的连接数也计入限制。
  for (let d = 1; d < depths; d++) {
    const from = groups[d];
    const to = groups[d + 1];
    const candidates = shuffle(from.flatMap((node) => to.map((target) => [node, target])), rng);
    for (const [node, target] of candidates) {
      if (node.next.includes(target.id) || rng() >= 0.4) continue;
      if (degree.get(node.id) >= MAX_CONNECTIONS || degree.get(target.id) >= MAX_CONNECTIONS) continue;
      const crosses = from.some((source) => source.next.some((id) => {
        const dest = to.find((candidate) => candidate.id === id);
        return (source.order - node.order) * (dest.order - target.order) < 0;
      }));
      if (!crosses && edgeFits(node, target)) connect(node, target);
    }
  }

  return {
    layer,
    nodes,
    byId,
    startId: start.id,
    endId: end.id,
    teamSize,
    depths,
    totalNodes: nodes.length,
    battleCount,
    nodeCount: targetNodes,
  };
}

export function nextNodes(graph, nodeId) {
  const node = graph.byId.get(nodeId);
  if (!node) return [];
  return node.next.map((id) => graph.byId.get(id)).filter(Boolean);
}

// 校验：全可达、全汇聚、只向前、总连接数 ≤4、无交叉及战斗节点数量。
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
  const degree = new Map(nodes.map((n) => [n.id, n.next.length]));
  const edges = [];
  for (const n of nodes) {
    maxOut = Math.max(maxOut, n.next.length);
    for (const id of n.next) {
      const t = byId.get(id);
      if (!t || t.depth <= n.depth) monotonic = false;
      if (t) {
        degree.set(id, degree.get(id) + 1);
        edges.push([n, t]);
      }
    }
  }
  // 使用与 SVG 一致的坐标检查线段，包括旧地图保存的折线路径。
  const point = mapPoint;
  const segments = edges.flatMap(([a, b]) => {
    const points = [point(a), ...(a.via?.[b.id] || []).map((p) => ({ x: MAP_LAYOUT.inset + p.x * (MAP_LAYOUT.width - 2 * MAP_LAYOUT.inset), y: -p.y * MAP_LAYOUT.row })), point(b)];
    return points.slice(1).map((p, i) => ({ a, b, p: points[i], q: p }));
  });
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a, b, p) => Math.abs(orient(a, b, p)) < 1e-9
    && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  const noCrossings = segments.every((edge, i) => segments.slice(i + 1).every((other) => {
    if ([edge.a.id, edge.b.id].some((id) => id === other.a.id || id === other.b.id)) return true;
    const { p: a, q: b } = edge;
    const { p: c, q: d } = other;
    return !(orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0)
      && !onSegment(a, b, c) && !onSegment(a, b, d) && !onSegment(c, d, a) && !onSegment(c, d, b);
  }));
  return {
    allReachable: seen.size === nodes.length,
    allConverge: canReachEnd.size === nodes.length,
    monotonic,
    maxOutOk: maxOut <= MAX_OUT,
    maxDegreeOk: [...degree.values()].every((count) => count <= MAX_CONNECTIONS),
    noCrossings,
    ...geometryRules(nodes, byId),
    nonEmpty: graph.totalNodes === normalizeNodeCount(graph.nodeCount) && graph.totalNodes >= MIN_NODES && graph.totalNodes <= MAX_NODES,
  };
}
