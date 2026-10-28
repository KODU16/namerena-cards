// 单账号多存档：优先存到 shenjack 账号（/api/cards/saves），
// 后端不可用（本地 / GitHub Pages / 接口没上线）时自动退回 localStorage 的 10 个槽位。

const API = '/api/cards/saves';
const LOCAL_KEY = 'namerena-cards/saves';
export const MAX_SLOTS = 10;

let csrf = '';
let serverOk = null; // null=未知, true/false

function sameOrigin() {
  return /(^|\.)shenjack\.top$/i.test(location.hostname);
}

async function refreshCsrf() {
  try {
    const res = await fetch('/api/cards/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (data && data.csrf_token) csrf = data.csrf_token;
    return data;
  } catch { return null; }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-CSRFToken'] = csrf;
  const res = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (data && data.csrf_token) csrf = data.csrf_token;
  return { res, data };
}

function localAll() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
}

function localWrite(all) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch { /* 配额满 */ }
}

function localSlots() {
  const all = localAll();
  return Object.keys(all)
    .map((k) => ({ slot: Number(k), summary: all[k].summary || '', updated_at: all[k].updated_at || '' }))
    .filter((s) => Number.isFinite(s.slot))
    .sort((a, b) => a.slot - b.slot);
}

export function localHasSlot(slot) {
  return !!localAll()[slot];
}

export async function list() {
  if (sameOrigin()) {
    try {
      const { res, data } = await request('GET', '');
      if (res.ok && data && data.ok) {
        serverOk = true;
        csrf = data.csrf_token || csrf;
        return { source: 'server', slots: data.slots || [], maxSlots: data.max_slots || MAX_SLOTS, loggedIn: !!data.logged_in };
      }
      if (res.status === 404) serverOk = false;
    } catch { /* 网络失败，走本地 */ }
  }
  return { source: 'local', slots: localSlots(), maxSlots: MAX_SLOTS, loggedIn: false };
}

export async function save(slot, payload, summary) {
  if (sameOrigin() && serverOk !== false) {
    let out = await request('PUT', '/' + slot, { payload, summary });
    if (out.res.status === 400 && out.data && out.data.error && out.data.error.code === 'csrf_failed') {
      await refreshCsrf();
      out = await request('PUT', '/' + slot, { payload, summary });
    }
    if (out.res.ok && out.data && out.data.ok) {
      serverOk = true;
      return { source: 'server', slot };
    }
    if (out.res.status === 401 || out.res.status === 404) serverOk = false;
    else return { source: 'error', message: (out.data && out.data.error && out.data.error.message) || '存档失败' };
  }
  const all = localAll();
  all[slot] = { summary, updated_at: new Date().toISOString(), payload };
  localWrite(all);
  return { source: 'local', slot };
}

export async function load(slot) {
  if (sameOrigin() && serverOk !== false) {
    const { res, data } = await request('GET', '/' + slot);
    if (res.ok && data && data.ok) {
      serverOk = true;
      return { source: 'server', payload: data.payload, summary: data.summary, updatedAt: data.updated_at };
    }
    if (res.status === 404 && data && data.error && data.error.code === 'slot_not_found') return null;
    if (res.status === 404 || res.status === 401) serverOk = false;
  }
  const entry = localAll()[slot];
  if (!entry) return null;
  return { source: 'local', payload: entry.payload, summary: entry.summary, updatedAt: entry.updated_at };
}

export async function remove(slot) {
  if (sameOrigin() && serverOk !== false) {
    const { res, data } = await request('DELETE', '/' + slot);
    if (res.ok && data && data.ok) {
      serverOk = true;
      return true;
    }
    if (res.status === 404 || res.status === 401) serverOk = false;
  }
  const all = localAll();
  delete all[slot];
  localWrite(all);
  return true;
}

export function state() {
  return { sameOrigin: sameOrigin(), serverOk, hasCsrf: !!csrf };
}
