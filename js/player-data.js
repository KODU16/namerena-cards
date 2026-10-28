// 与主站 /api/cards 的对接适配器。
// 只在同源（shenjack.top 下，任意子域/端口）启用；GitHub Pages、localhost 下完全静默，
// 既不发请求也不显示徽标，因此公开演示版不受影响。

const BASE = '/api/cards';

const ctx = {
  enabled: false,
  loggedIn: false,
  csrf: '',
  teamname: '',
  stats: null,
  runId: null,
  badge: null,
};

function sameOrigin() {
  // 部署在 https://shenjack.top/cards/ 或 https://cards.shenjack.top/ 都算同源可用
  return /(^|\.)shenjack\.top$/i.test(location.hostname);
}

async function call(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (ctx.csrf) headers['X-CSRFToken'] = ctx.csrf;
  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (data && data.csrf_token) ctx.csrf = data.csrf_token;
  return { res, data };
}

function failure(data) {
  return data && data.error ? data.error.code || '' : '';
}

// 带一次 CSRF 刷新重试的写请求
async function write(path, body) {
  let out = await call(path, { method: 'POST', body: JSON.stringify(body) });
  if (out.res.status === 400 && failure(out.data) === 'csrf_failed') {
    await call('/session');
    out = await call(path, { method: 'POST', body: JSON.stringify(body) });
  }
  return out;
}

function paintBadge() {
  if (!ctx.enabled) return;
  if (!ctx.badge) {
    const node = document.createElement('div');
    node.className = 'tracking-badge';
    node.style.cssText = 'position:fixed;left:16px;bottom:14px;z-index:40;font-size:11px;'
      + 'padding:4px 10px;border-radius:999px;border:1px solid #cfe0ea;background:#f7fbfe;'
      + 'color:#4a6a7c;font-family:var(--mono,monospace);pointer-events:none;';
    document.body.appendChild(node);
    ctx.badge = node;
  }
  const s = ctx.stats;
  ctx.badge.textContent = ctx.loggedIn
    ? `已登录 ${ctx.teamname}` + (s ? ` · ${s.runs} 局 / 胜 ${s.wins} / 最佳 ${s.best_wins}` : '')
    : '未登录 · 成绩不记录';
}

export async function init() {
  if (!sameOrigin()) return;
  ctx.enabled = true;
  try {
    const { data } = await call('/session');
    if (data && data.ok) {
      ctx.loggedIn = !!data.logged_in;
      ctx.teamname = data.teamname || '';
      ctx.stats = data.stats || null;
    }
  } catch { /* 静默降级 */ }
  paintBadge();
}

export async function startRun(gameState) {
  if (!ctx.enabled || !ctx.loggedIn) return;
  const run = gameState?.run;
  if (!run) return;
  const team = (gameState.collection || [])
    .filter((c) => (run.teamIds || []).includes(c.id))
    .slice(0, 5)
    .map((c) => ({ name: c.name, clan: c.clan }));
  try {
    const { data } = await write('/runs', {
      lane: run.lane || '1A',
      clan: run.clan || '',
      team_size: run.teamSize || 1,
      seed: run.seed || 0,
      ladder_source: String(run.ladderSource || 'snapshot').slice(0, 16),
      team,
    });
    if (data && data.ok) {
      if (run && !run.startedAt) run.startedAt = Date.now();
      ctx.runId = data.run_id;
      run.serverId = data.run_id;
      ctx.stats = data.stats || ctx.stats;
      paintBadge();
    }
  } catch { /* 静默降级 */ }
}

export async function finishRun(gameState, won) {
  if (!ctx.enabled || !ctx.loggedIn) return;
  const run = gameState?.run;
  const runId = ctx.runId || run?.serverId;
  if (!runId) return;
  const started = run.startedAt || (run.serverId ? run.createdAt : null);
  const duration = Math.max(0, Math.round((Date.now() - (started || Date.now())) / 1000));
  const layers = won ? 10 : Math.max(0, (run.layer || 1) - 1);
  try {
    const { data } = await write(`/runs/${runId}/finish`, {
      won: !!won,
      wins: Math.min(10000, Math.max(0, run.wins || 0)),
      layers: Math.min(10, layers),
      duration_seconds: duration,
    });
    if (data && data.ok) {
      ctx.stats = data.stats || ctx.stats;
      ctx.runId = null;
      if (run) run.serverId = null;
      paintBadge();
    }
  } catch { /* 静默降级 */ }
}

export function status() {
  return { ...ctx, badge: undefined };
}
