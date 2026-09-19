#!/usr/bin/env node
/* 拼好镜 · QA 独立复验（补充）：老数据 v16 在 **v7.17 快照** 与 **v7.18 产物** 下的「观感不变」
   ---------------------------------------------------------------------------
   方法：同一份 v16 老数据分别注入两个版本的 localStorage → 真 reload → **真机点击「画布」分段**
        → 真读每块 getBoundingClientRect / offsetWidth / offsetHeight + board transform(pan/zoom)
        → 逐块比对（容差 ±2px）。这是「升级零打扰」最直接的证据（不依赖任何内部符号）。
   只读两个 HTML；不写产品/源码；临时 profile 用后清理。
   ------------------------------------------------------------------------- */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const build = buildTestArtifact();
const URL_718 = 'file:///' + encodeURI(build.path.replace(/\\/g, '/'));
const SNAP_717 = path.join(ROOT, 'dev', '_qa', 'snapshots', 'PHJ_v7.17_20260918.html');
const URL_717 = 'file:///' + encodeURI(SNAP_717.replace(/\\/g, '/'));

const V16 = {
  app: 'storyboard-prompt-panel', version: 16, title: '老档观感', zoom: 1.5, pan: { x: 33, y: -44 },
  blocks: [
    { id: 'q0', text: '第一块\n两行文本', x: 100, y: 50, order: 0 },
    { id: 'q1', text: '第二块单行', x: 20, y: 220, order: 1 }
  ],
  splice: { items: [{ type: 'block', id: 'q0' }], activeUnitId: null },
  templates: [{ id: 't1', units: [{ id: 'tu1', prefixes: ['a'], suffixes: ['b'] }] }],
  cmpl: { v: 1, items: null, gorder: null, use: { k1: { n: 2, t: 99 } } },
  collapsed: false
};

/* ---- 端口/浏览器 ---- */
function isPortFree(port) {
  return new Promise((resolve) => { const srv = net.createServer(); let d = false; const f = (v) => { if (!d) { d = true; resolve(v); } };
    srv.once('error', () => f(false)); srv.once('listening', () => srv.close(() => f(true))); try { srv.listen(port, '127.0.0.1'); } catch { f(false); } });
}
async function findFreePort(base, span = 50) { for (let p = base; p < base + span && p <= 65535; p++) { if (await isPortFree(p)) return p; } return null; }
async function waitForCDP(port, t) { const dl = Date.now() + t; while (Date.now() < dl) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); } catch { /* retry */ } await sleep(250); } return null; }
function killTree(pid) { if (!pid) return; if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch { /* f */ } } try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }

if (!fs.existsSync(SNAP_717)) { console.error('缺 v7.17 快照：' + SNAP_717); process.exit(3); }
const det = detectBrowser();
if (!det.exe) { console.error('未找到可用 headless 浏览器'); process.exit(3); }
const basePort = Number.parseInt(process.env.PHJ_BROWSER_PORT || '9222', 10) || 9222;
const port = await findFreePort(basePort);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_qa_mv_'));
const proc = spawn(det.exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore', detached: false });
const ver = await waitForCDP(port, 25000);
if (!ver) { console.error('CDP 就绪超时'); killTree(proc.pid); process.exit(3); }

const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result && r.result.value; }
async function ready() { for (let i = 0; i < 60; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); } await sleep(300); }

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });

async function measureAt(url) {
  const clear = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
  const seed = (await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{ localStorage.setItem('storyboard-prompt-panel:v1', " + JSON.stringify(JSON.stringify(V16)) + "); }catch(e){}" })).identifier;
  await send('Page.navigate', { url }); await ready();
  await send('Page.reload'); await ready(); await sleep(350);
  /* 真机点「画布」分段（不依赖任何内部符号） */
  const segHit = await evalJS(`(function(){ var s=document.querySelector('.vs-seg[data-view="canvas"]'); if(!s) return null; s.click(); return true; })()`);
  await sleep(600);
  const m = await evalJS(`(function(){
    var cards=[].slice.call(document.querySelectorAll('.block')); var byId={};
    cards.forEach(function(c){ var r=c.getBoundingClientRect(); byId[c.dataset.id]={ l:Math.round(r.left), t:Math.round(r.top), w:c.offsetWidth, h:c.offsetHeight }; });
    var b=document.getElementById('board'); var bs=b?getComputedStyle(b).transform:'';
    var cv=document.getElementById('canvas'); var cr=cv?cv.getBoundingClientRect():null;
    return { n:cards.length, ids:Object.keys(byId).sort(), byId:byId, transform:bs, canvasRect: cr?{l:Math.round(cr.left),t:Math.round(cr.top),w:Math.round(cr.width),h:Math.round(cr.height)}:null };
  })()`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clear });
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed });
  return { segHit, m };
}

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });

let a, b;
try { a = await measureAt(URL_717); } catch (e) { t('M0 v7.17 快照测量', false, '异常：' + e.message); }
try { b = await measureAt(URL_718); } catch (e) { t('M0 v7.18 产物测量', false, '异常：' + e.message); }

if (a && b) {
  t('M0 两版本均成功渲染并切到画布（分段点击命中 + 块数一致）',
    a.segHit === true && b.segHit === true && a.m.n === 2 && b.m.n === 2,
    `v7.17 命中=${a.segHit} 块数=${a.m.n} ids=${JSON.stringify(a.m.ids)}；v7.18 命中=${b.segHit} 块数=${b.m.n} ids=${JSON.stringify(b.m.ids)}`);

  const idsSame = JSON.stringify(a.m.ids) === JSON.stringify(b.m.ids);
  t('M1 块 id 集合一致', idsSame, `v7.17=${JSON.stringify(a.m.ids)} v7.18=${JSON.stringify(b.m.ids)}`);

  const near = (x, y, tol = 2) => Math.abs(x - y) <= tol;
  let worst = 0, allOk = true, rows = [];
  for (const id of a.m.ids) {
    const A = a.m.byId[id], B = b.m.byId[id];
    if (!B) { allOk = false; rows.push(id + ':v7.18 缺'); continue; }
    const d = Math.max(Math.abs(A.l - B.l), Math.abs(A.t - B.t), Math.abs(A.w - B.w), Math.abs(A.h - B.h));
    if (d > worst) worst = d;
    const ok = near(A.l, B.l) && near(A.t, B.t) && near(A.w, B.w) && near(A.h, B.h);
    if (!ok) allOk = false;
    rows.push(`${id}: 717(${A.l},${A.t},${A.w}x${A.h}) 718(${B.l},${B.t},${B.w}x${B.h}) Δmax=${d}`);
  }
  t('M2 逐块位置/尺寸逐值一致（容差 ±2px）—— 观感不变（真读 rect）', allOk && idsSame,
    rows.join(' ｜ ') + `｜最大偏差=${worst}px`);

  t('M3 视角（pan/zoom 合成矩阵）逐字一致', a.m.transform === b.m.transform,
    `v7.17 board.transform=${a.m.transform}｜v7.18=${b.m.transform}`);
}

const passN = R.filter((x) => x.pass).length;
console.log('\n=== 老数据观感不变（v7.17 vs v7.18）===');
for (const x of R) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.name}\n       ${x.detail}`);
console.log(`\n合计 ${passN}/${R.length}`);
ws.close();
try { killTree(proc.pid); } catch { /* ignore */ }
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(passN === R.length ? 0 : 1);
