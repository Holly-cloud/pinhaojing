/* 可行性冒烟：CDP Emulation.setEmulatedMedia 能否把 prefers-reduced-motion 钉成 no-preference
   自起 Edge → 连接 → 设模拟 → 断言 matchMedia 翻转 → 收工
   —— 保留为「防退化用例」：verify_v7 / run-gate 的一键闸门依赖此能力（钉桩 no-preference 与还原 reduce）；
      若浏览器升级后 CDP 行为有变，先跑本冒烟确认该能力是否仍在。
      （本冒烟自带浏览器、用独立端口 9333，可脱离 run-gate 单独跑。）
*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectBrowser } from '../lib/browser-detect.mjs';

/* 复用共享探测（不再硬编码浏览器绝对路径）；PHJ_BROWSER 为硬覆盖语义。 */
const det = detectBrowser();
if (!det.exe) {
  console.error(det.pinned
    ? '❌ PHJ_BROWSER 指向的浏览器不可用：' + det.pinnedPath
    : '❌ 未找到可用的浏览器（Edge / Chrome）；可设置 PHJ_BROWSER 指向 exe。');
  process.exit(1);
}
const BROWSER = det.exe;
const PORT = 9333;
const PROF = path.join(os.tmpdir(), 'phj_spike_' + Date.now());

const proc = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROF,
  'about:blank'
], { stdio: 'ignore', detached: false });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitUp = async () => {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return true; } catch { await sleep(250); }
  }
  return false;
};
if (!await waitUp()) { console.error('❌ 浏览器未就绪（CDP 未监听 ' + PORT + '）'); proc.kill(); process.exit(1); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let i = 0; const q = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && q.has(m.id)) { q.get(m.id)(m); q.delete(m.id); } });
await new Promise(r => ws.addEventListener('open', r));
const send = (m, p = {}) => new Promise(r => { const n = ++i; q.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
await send('Runtime.enable');
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;

console.log('① 模拟前 reduce =', await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"));

const r = await send('Emulation.setEmulatedMedia', {
  media: '',
  features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
});
console.log('② setEmulatedMedia 调用 =', r.error ? JSON.stringify(r.error) : 'OK');
console.log('③ 模拟后 reduce =', await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"));
console.log('④ 模拟后 no-preference =', await ev("matchMedia('(prefers-reduced-motion: no-preference)').matches"));

/* 反向验证：能否钉回 reduce（B9/C7 组需要） */
await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
console.log('⑤ 钉回 reduce =', await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"));

ws.close();
proc.kill();
await sleep(500);
try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
console.log('=== 冒烟结束 ===');
