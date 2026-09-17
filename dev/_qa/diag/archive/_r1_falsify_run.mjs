#!/usr/bin/env node
/* 一次性证伪跑手：跳过等价性闸门，直接起 headless 浏览器 + 跑 verify_v78.mjs
   —— 用途：R1 断言的证伪测试（等价性闸门会在 [2] 就拦住，跑不到 [6]）。
   与项目惯例一致：浏览器「起—跑—收」必须封在同一次进程内（工具调用会回收子进程）。
   用完即弃，不进验收链。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const NODE = process.execPath;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isPortFree = (port) => new Promise((res) => {
  const srv = net.createServer();
  let done = false;
  const fin = (v) => { if (!done) { done = true; res(v); } };
  srv.once('error', () => fin(false));
  srv.once('listening', () => srv.close(() => fin(true)));
  try { srv.listen(port, '127.0.0.1'); } catch { fin(false); }
});

const det = detectBrowser();
const exe = process.env.PHJ_BROWSER || det.exe;
if (!exe) { console.error('未找到浏览器'); process.exit(10); }
console.log('浏览器：' + exe + (det.pinned ? '（PHJ_BROWSER 硬覆盖）' : ''));

let port = 9222;
while (port < 9272 && !(await isPortFree(port))) port++;
console.log('调试端口：' + port);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'phj-falsify-'));
const child = spawn(exe, [
  '--headless=new', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

/* 等 CDP 就绪 */
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/json/version');
    if (r.ok) { ready = true; break; }
  } catch { /* 未就绪 */ }
  await sleep(250);
}

let code = 99;
if (ready) {
  code = await new Promise((res) => {
    const p = spawn(NODE, [path.join(HERE, '..', 'verify', 'verify_v78.mjs')], {
      env: { ...process.env, PHJ_BROWSER_PORT: String(port) }, stdio: 'inherit',
    });
    p.on('exit', res);
  });
} else {
  console.error('CDP 就绪超时');
}

try { child.kill(); } catch { /* 忽略 */ }
await sleep(300);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
console.log('\n[falsify-runner] verify_v78 退出码 = ' + code + (code === 1 ? '（有断言变红 ✅ 证伪成功）' : ''));
process.exit(code === 99 ? 12 : code);
