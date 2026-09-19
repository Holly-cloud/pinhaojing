#!/usr/bin/env node
/* 临时诊断（用后即删）：需求②「重新打开工具后块间距不均」根因排查
   —— 自起自收 headless 浏览器 + CDP，真机复现。
   只读探查：不改 dev/src/**、不改产物、不改断言。 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowser } from '../lib/browser-detect.mjs';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    srv.once('error', () => fin(false));
    srv.once('listening', () => srv.close(() => fin(true)));
    try { srv.listen(port, '127.0.0.1'); } catch { fin(false); }
  });
}
async function waitForCDP(port, timeoutMs) {
  const dl = Date.now() + timeoutMs;
  while (Date.now() < dl) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  return null;
}
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch {} }
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

const det = detectBrowser();
if (!det.exe) { console.error('未找到浏览器'); process.exit(10); }
const browser = det.exe;

let port = 9277;
while (!(await isPortFree(port))) port++;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_diag_'));
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'],
  { stdio: 'ignore', detached: false });

let out = [];
const log = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); out.push(s); console.log(s); };

try {
  const ver = await waitForCDP(port, 25000);
  if (!ver) { console.error('CDP 超时'); process.exit(12); }
  const TEST = buildTestArtifact();
  const TARGET = 'file:///' + encodeURI(TEST.path.replace(/\\/g, '/'));

  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result && r.result.value;
  }
  async function clickSel(sel) {
    const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
    if (!r) throw new Error('missing ' + sel);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(120);
  }
  async function realDbl(x, y) {
    for (const cc of [1, 2]) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: cc });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: cc });
    }
    await sleep(200);
  }
  async function type(text) { await send('Input.insertText', { text }); await sleep(160); }
  async function waitReady() { for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) return; await sleep(200); } }
  async function reloadNoClear(clearScriptId) {
    if (clearScriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });
    await send('Page.reload'); await waitReady(); await sleep(600);
  }

  await send('Page.enable'); await send('Runtime.enable');
  const clearId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
  await send('Page.navigate', { url: TARGET }); await waitReady();
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
  await send('Page.reload'); await waitReady(); await sleep(500);

  /* 采集：state.blocks（数组序）+ 每块的 DOM 顶/高 + 计算出的 y 间距 */
  const SNAP = `(() => {
    var bs = state.blocks.map(function(b, i){
      var el = document.querySelector('.block[data-id="' + b.id + '"]');
      var r = el ? el.getBoundingClientRect() : null;
      var ta = el ? el.querySelector('.block-text') : null;
      return { i: i, id: b.id, x: b.x, y: b.y, order: b.order, type: b.type || 'text',
               txtLen: (b.text||'').length,
               rectTop: r ? Math.round(r.top) : null, rectH: r ? Math.round(r.height) : null,
               scrollH: ta ? ta.scrollHeight : null, offH: el ? el.offsetHeight : null };
    });
    var ys = bs.filter(function(b){return b.type!=='text'?true:true;}).map(function(b){ return b.y; });
    var gaps = [];
    for (var i=1;i<bs.length;i++){ if(bs[i].type==='text' && bs[i-1].type==='text') gaps.push(Math.round((bs[i].y - bs[i-1].y)*1000)/1000); }
    return { view: activeView, blocks: bs, yGaps: gaps, pan: {x:state.pan.x,y:state.pan.y}, zoom: state.zoom, version: state.version };
  })()`;

  log('==== 诊断开始，目标 = ' + TARGET);

  /* ---------- 场景 1：写作台新建 3 个不同高度块 → 落盘 → reload ---------- */
  await evalJS("setView('write')"); await sleep(300);
  // 清成空
  await evalJS("state.blocks=[]; renderWrite(); saveNow();");
  await evalJS("wdNew()"); await evalJS("focusDeskEditor()");
  await type('第一块'); await sleep(100);
  await evalJS("wdNew()"); await evalJS("focusDeskEditor()");
  await type('第二块\n第二块第二行\n第二块第三行'); await sleep(100);
  await evalJS("wdNew()"); await evalJS("focusDeskEditor()");
  await type('第三块'); await sleep(100);
  await evalJS("flush()"); await sleep(400);
  const s1a = await evalJS(SNAP);
  log('\n[场景1 · 新建后] ' + JSON.stringify(s1a, null, 0));
  const s1persisted = await evalJS("JSON.parse(localStorage.getItem(LS_KEY)).blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  log('[场景1 · LS 落盘] ' + JSON.stringify(s1persisted));
  const s1mig = await evalJS("migrate(JSON.parse(localStorage.getItem(LS_KEY))).blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  log('[场景1 · migrate 后] ' + JSON.stringify(s1mig));

  await reloadNoClear(clearId);
  const s1b = await evalJS(SNAP);
  log('\n[场景1 · reload 后] ' + JSON.stringify(s1b, null, 0));
  log('[场景1 · reload 后 view] ' + s1b.view + '（注意：刷新回默认写作台；画布 DOM rect 需切到画布视图才能量）');

  /* ---------- 场景 2：画布双击新建（不同落点）→ 落盘 → reload ---------- */
  await evalJS("setView('canvas')"); await sleep(300);
  await evalJS("state.blocks=[]; state.pan={x:0,y:0}; state.zoom=1; render(); saveNow();"); await sleep(150);
  const pts = [[400, 200], [400, 220], [400, 620], [1000, 200]];
  for (const [x, y] of pts) { await realDbl(x, y); }
  await evalJS("flush()"); await sleep(400);
  const s2a = await evalJS(SNAP);
  log('\n[场景2 · 画布双击 4 处后] yGaps=' + JSON.stringify(s2a.yGaps) + ' blocks=' + JSON.stringify(s2a.blocks.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), order: b.order }))));
  const s2mig = await evalJS("migrate(JSON.parse(localStorage.getItem(LS_KEY))).blocks.map(function(b){return {x:Math.round(b.x),y:Math.round(b.y),order:b.order};})");
  log('[场景2 · migrate 后] ' + JSON.stringify(s2mig));

  await reloadNoClear(null);
  const s2b = await evalJS(SNAP);
  log('[场景2 · reload 后] yGaps=' + JSON.stringify(s2b.yGaps) + ' blocks=' + JSON.stringify(s2b.blocks.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), order: b.order }))));

  /* ---------- 场景 3：migrate 纯函数逐例 · 坐标兜底判据 ---------- */
  log('\n==== 场景3 · migrate 坐标兜底判据 ====');
  const M3 = await evalJS(`(() => {
    function blocksOf(bs, extra){ var d = Object.assign({ app:'storyboard-prompt-panel', version:16, blocks: bs }, extra||{}); return migrate(d).blocks.map(function(b){ return {x:b.x,y:b.y,order:b.order,text:b.text}; }); }
    return {
      normal: blocksOf([{id:'a',text:'A',x:100,y:50},{id:'b',text:'B',x:20,y:20}]),
      missingXY: blocksOf([{id:'a',text:'A'},{id:'b',text:'B'}]),
      nullXY: blocksOf([{id:'a',text:'A',x:null,y:null},{id:'b',text:'B',x:20,y:20}]),
      stringXY: blocksOf([{id:'a',text:'A',x:'100',y:'50'},{id:'b',text:'B',x:20,y:20}]),
      nanLike: blocksOf([{id:'a',text:'A',x:NaN,y:NaN},{id:'b',text:'B',x:20,y:20}]),
      oneMissing: blocksOf([{id:'a',text:'A',x:100,y:50},{id:'b',text:'B',x:20},{id:'c',text:'C',x:300,y:300}]),
      withImage: blocksOf([{id:'a',text:'A',x:100,y:50,type:'image'},{id:'b',text:'B',x:20,y:20}])
    };
  })()`);
  log(JSON.stringify(M3, null, 1));

  /* ---------- 场景 4：order 与 y 是否互相污染（写作台重排 → reload）---------- */
  log('\n==== 场景4 · 写作台重排 order 后 x/y 是否被污染 ====');
  await evalJS("setView('canvas')"); await sleep(200);
  await evalJS("state.blocks=[{id:'k1',text:'K1',x:20,y:20,order:0},{id:'k2',text:'K2',x:20,y:170,order:1},{id:'k3',text:'K3',x:20,y:320,order:2}]; state.pan={x:0,y:0}; state.zoom=1; render(); saveNow();"); await sleep(150);
  const before4 = await evalJS("state.blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  await evalJS("setView('write')"); await sleep(250);
  await evalJS("wdMove(2,0)"); await sleep(200);   // 把第3条移到第1位
  await evalJS("flush()"); await sleep(300);
  const after4 = await evalJS("state.blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  log('[重排前] ' + JSON.stringify(before4));
  log('[重排后(写盘)] ' + JSON.stringify(after4));
  await reloadNoClear(null);
  const reload4 = await evalJS("({blocks: state.blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};}), view: activeView})");
  log('[reload 后] ' + JSON.stringify(reload4));

  /* ---------- 场景 5：autoSizeAll / 高度 在首次 vs reload 是否一致 ---------- */
  log('\n==== 场景5 · 块高度（scrollHeight/rectH）稳定性 ====');
  await evalJS("setView('canvas')"); await sleep(250);
  await evalJS("state.blocks=[{id:'t1',text:'一行',x:20,y:20,order:0},{id:'t2',text:'第一行\\n第二行\\n第三行\\n第四行',x:20,y:170,order:1}]; state.pan={x:0,y:0}; state.zoom=1; render(); saveNow();"); await sleep(300);
  const h5a = await evalJS("state.blocks.map(function(b){ var el=document.querySelector('.block[data-id=\"'+b.id+'\"]'); var ta=el?el.querySelector('.block-text'):null; var r=el?el.getBoundingClientRect():null; return {id:b.id, rectH: r?Math.round(r.height):null, scrollH: ta?ta.scrollHeight:null, y:b.y}; })");
  log('[首建] ' + JSON.stringify(h5a));
  await reloadNoClear(null);
  await evalJS("setView('canvas')"); await sleep(300);
  const h5b = await evalJS("state.blocks.map(function(b){ var el=document.querySelector('.block[data-id=\"'+b.id+'\"]'); var ta=el?el.querySelector('.block-text'):null; var r=el?el.getBoundingClientRect():null; return {id:b.id, rectH: r?Math.round(r.height):null, scrollH: ta?ta.scrollHeight:null, y:b.y}; })");
  log('[reload 后] ' + JSON.stringify(h5b));

  /* ---------- 场景 6：写作台新建（默认视图）时，连续新建的 y 间距 ---------- */
  log('\n==== 场景6 · 写作台连续新建 5 条的 y 间距 ====');
  await evalJS("setView('write')"); await sleep(250);
  await evalJS("state.blocks=[]; renderWrite(); saveNow();");
  for (let i = 0; i < 5; i++) { await evalJS("wdNew()"); }
  await sleep(200);
  const s6 = await evalJS("state.blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  log('[连续 wdNew x5] ' + JSON.stringify(s6));

  ws.close();
  fs.writeFileSync(path.join(HERE, '_diag_gap.out.txt'), out.join('\n'), 'utf8');
} catch (e) {
  console.error('诊断异常：' + (e && e.stack ? e.stack : e));
} finally {
  killTree(proc.pid);
  await sleep(400);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
}
