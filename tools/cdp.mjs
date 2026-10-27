// 极简 CDP 工具：无头 Chrome 打开页面、收集 console/异常、截图、执行脚本。
// 用法：node tools/cdp.mjs <url> <out.png> [waitMs] [jsToEval]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:8123/';
const out = process.argv[3] || path.join(tmpdir(), 'cdp-shot.png');
const waitMs = Number(process.argv[4] || 4000);
const evalJs = process.argv[5] || '';

const profile = mkdtempSync(path.join(tmpdir(), 'cdp-'));
const port = 9333 + Math.floor(Math.random() * 200);
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitEndpoint() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('chrome 没起来');
}
await waitEndpoint();
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const errors = [];
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params?.exceptionDetails;
    errors.push(`EXCEPTION ${d?.text} ${d?.exception?.description || ''} @${d?.url || ''}:${d?.lineNumber}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const p = msg.params;
    logs.push(`${p.type}: ` + p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    if (p.type === 'error') errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') errors.push(`LOG ${e.source}: ${e.text} ${e.url || ''}`);
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(waitMs);

if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
  console.log('EVAL', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null).slice(0, 2000));
  await sleep(600);
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (shot.result?.data) { writeFileSync(out, Buffer.from(shot.result.data, 'base64')); console.log('SHOT', out); }
console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : '(none)');
if (logs.length) { console.log('--- console ---'); console.log(logs.slice(-25).join('\n')); }

ws.close();
proc.kill();
process.exit(0);
