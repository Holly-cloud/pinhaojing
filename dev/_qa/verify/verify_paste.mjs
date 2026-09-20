#!/usr/bin/env node
/* 拼好镜 · 临时自检：paste.js「编辑器内 Ctrl+V 被画布抢占」修复（v7.18 中间态）
   ---------------------------------------------------------------------------
   4 场景（含 1 条反面对照）：
     ① 放大编辑弹窗 #blkInput（<textarea class="blk-input">）内 Ctrl+V → 文本进框、块数不变
     ② 写作台右栏 #wdInput（同为 .blk-input）内 Ctrl+V → 文本进框、块数不变
     ③ 画布块内联编辑框 .block-text（<textarea>）内 Ctrl+V → 既有豁免不坏（文本进框、块数不变）
     ④ ★反面对照：焦点不在任何输入元素（画布视图、body）时 Ctrl+V → 仍新建块（原功能未弄丢）

   真机口径：headless Edge + CDP。剪贴板经 navigator.clipboard.writeText 写入（Browser.grantPermissions 授权），
        Ctrl+V 用 Input.dispatchKeyEvent 真实派发；另挂一个 document 冒泡监听记录 e.defaultPrevented，
        直接取证「产品 handler 是否抢了默认行为」。

   用法：先把 headless 浏览器起好（参数同 run-gate.mjs），再 node dev/_qa/verify/verify_paste.mjs
        ※ 端口读 PHJ_BROWSER_PORT，缺省 9222。
   ------------------------------------------------------------------------- */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TARGET = pathToFileURL(TEST_BUILD.path).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 浏览器：外部已起则直接附加；否则自起（一条命令可复现） ---- */
async function listPages(port) { try { return await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch { return null; } }
let PORT = process.env.PHJ_BROWSER_PORT || '9222';
let launchedProc = null, launchedProf = null;
let list = await listPages(PORT);
if (!list) {
  const det = detectBrowser();
  if (!det.exe) { console.error('❌ 未找到可用 headless 浏览器（可设 PHJ_BROWSER）'); process.exit(3); }
  const base = Number.parseInt(process.env.PHJ_BROWSER_PORT || '9222', 10) || 9222;
  const isFree = (p) => new Promise((res) => { const s = net.createServer(); let d = false; const f = (v) => { if (!d) { d = true; res(v); } }; s.once('error', () => f(false)); s.once('listening', () => s.close(() => f(true))); try { s.listen(p, '127.0.0.1'); } catch { f(false); } });
  let port = null;
  for (let p = base; p < base + 50 && p <= 65535; p++) { if (await isFree(p)) { port = p; break; } }
  if (!port) { console.error('❌ 未找到空闲端口'); process.exit(3); }
  PORT = String(port);
  launchedProf = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_paste_'));
  launchedProc = spawn(det.exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + launchedProf, 'about:blank'], { stdio: 'ignore', detached: false });
  const deadline = Date.now() + 25000; let ok = false;
  while (Date.now() < deadline) { const r = await listPages(PORT); if (r) { ok = true; break; } await sleep(250); }
  if (!ok) { console.error('❌ CDP 就绪超时'); process.exit(3); }
  list = await listPages(PORT);
  console.log('▶ 自起浏览器 ' + det.exe + '  端口 ' + PORT);
}
function cleanupBrowser() {
  if (launchedProc) { try { if (process.platform === 'win32') { spawnSync('taskkill', ['/PID', String(launchedProc.pid), '/T', '/F'], { stdio: 'ignore' }); } else { process.kill(launchedProc.pid, 'SIGKILL'); } } catch { /* gone */ } }
  if (launchedProf) { try { fs.rmSync(launchedProf, { recursive: true, force: true }); } catch { /* locked */ } }
}
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); cleanupBrowser(); process.exit(3); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result && r.result.value;
}

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
const perm = await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => 'n/a');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Page.bringToFront').catch(() => {});
await sleep(400);

/* ---- 剪贴板 + 真实 Ctrl+V ---- */
async function setClip(txt) {
  return await evalJS(`(async()=>{ try{ await navigator.clipboard.writeText(${JSON.stringify(txt)}); return 'ok'; }catch(e){ return 'ERR:'+(e&&e.message); } })()`);
}
async function readClip() {
  return await evalJS(`(async()=>{ try{ return await navigator.clipboard.readText(); }catch(e){ return 'ERR:'+(e&&e.message); } })()`);
}
async function pressCtrlV() {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 0 });
  await sleep(280);
}

/* ---- 取证探针：document 冒泡监听记录 paste 事件（在产品 handler 之后注册 → 可读 defaultPrevented） ---- */
await evalJS(`window.__pasteLog=[]; document.addEventListener('paste', function(e){ window.__pasteLog.push({ tag:(e.target&&e.target.tagName)||'', id:(e.target&&e.target.id)||'', prevented:e.defaultPrevented }); }); true`);
const resetLog = () => evalJS('window.__pasteLog=[]; true');
const getLog = () => evalJS('window.__pasteLog');

/* ---- 受控状态设置 ---- */
const DEF = `window.__pset=function(bs){ state.blocks=bs.map(function(b,i){ return { id:b.id||('t'+i), text:(b.text==null?'':b.text), x:(b.x==null?40+i*40:b.x), y:(b.y==null?40+i*40:b.y), order:i }; }); return state.blocks.length; };`;
async function setup(blocks) { await evalJS(DEF); return await evalJS('__pset(' + JSON.stringify(blocks) + ')'); }
const nBlocks = () => evalJS('state.blocks.length');

const R = [];
const t = (scenario, pass, detail) => R.push({ scenario, pass: !!pass, detail });

console.log('=== paste 修复自检（真机 headless Edge + CDP）===');
console.log('剪贴板授权 Browser.grantPermissions →', JSON.stringify(perm));

/* ══════════════════ 场景 1：放大编辑弹窗 #blkInput ══════════════════ */
{
  await setup([{ id: 'A', text: 'AAA' }, { id: 'B', text: 'BBB' }]);
  await evalJS("(()=>{ try{ closeBlockEditor(); }catch(e){} setView('canvas'); return true; })()"); await sleep(220);
  await evalJS("openBlockEditor('SEED1', null)"); await sleep(220);
  await evalJS("(()=>{ var t=document.getElementById('blkInput'); t.focus(); t.selectionStart=t.selectionEnd=t.value.length; return true; })()");
  const w = await setClip('PASTE_ONE_MARK');
  const rb = await readClip();
  await resetLog();
  const n0 = await nBlocks();
  await pressCtrlV();
  const res = await evalJS("({ v: document.getElementById('blkInput').value, n: state.blocks.length, ae: document.activeElement && document.activeElement.id })");
  const log = await getLog();
  const hitPaste = log.length > 0 && log[0].tag === 'TEXTAREA';
  t('S1 放大编辑弹窗 #blkInput 内 Ctrl+V：文本进框 + 块数不变（native paste 未被抢）',
    res.v === 'SEED1PASTE_ONE_MARK' && res.n === n0 && hitPaste && log[0].prevented === false,
    `写剪贴板=${w}/读回=${rb}；paste 事件=${JSON.stringify(log)}；value=${JSON.stringify(res.v)}；blocks ${n0}→${res.n}；activeElement=${res.ae}`);
}

/* ══════════════════ 场景 2：写作台右栏 #wdInput ══════════════════ */
{
  await setup([{ id: 'A', text: 'AAA' }, { id: 'B', text: 'BBB' }]);
  await evalJS("(()=>{ try{ closeBlockEditor(); }catch(e){} setView('write'); return true; })()"); await sleep(240);
  await evalJS('wdSelect(0)');
  await evalJS('focusDeskEditor()'); await sleep(160);
  const w = await setClip('PASTE_TWO_MARK');
  await resetLog();
  const n0 = await nBlocks();
  await pressCtrlV();
  const res = await evalJS("({ v: hostDesk.el('ta').value, n: state.blocks.length, ae: document.activeElement && document.activeElement.id })");
  const log = await getLog();
  const hitPaste = log.length > 0 && log[0].tag === 'TEXTAREA';
  t('S2 写作台右栏 #wdInput 内 Ctrl+V：文本进框 + 块数不变（native paste 未被抢）',
    res.v === 'AAAPASTE_TWO_MARK' && res.n === n0 && hitPaste && log[0].prevented === false,
    `写剪贴板=${w}；paste 事件=${JSON.stringify(log)}；value=${JSON.stringify(res.v)}；blocks ${n0}→${res.n}；activeElement=${res.ae}`);
}

/* ══════════════════ 场景 3：画布块内联编辑框 .block-text（既有豁免不能坏） ══════════════════ */
{
  await setup([{ id: 'A', text: 'AAA' }]);
  await evalJS("(()=>{ try{ closeBlockEditor(); }catch(e){} setView('canvas'); return true; })()"); await sleep(260);
  const focusOk = await evalJS("(()=>{ var t=document.querySelector('.block[data-id=\"A\"] .block-text'); if(!t) return null; t.focus(); t.selectionStart=t.selectionEnd=t.value.length; return t.value; })()");
  const w = await setClip('PASTE_THREE_MARK');
  await resetLog();
  const n0 = await nBlocks();
  await pressCtrlV();
  const res = await evalJS("(()=>{ var t=document.querySelector('.block[data-id=\"A\"] .block-text'); return { v: t ? t.value : null, n: state.blocks.length }; })()");
  const log = await getLog();
  const hitPaste = log.length > 0 && log[0].tag === 'TEXTAREA';
  t('S3 画布内联编辑框 .block-text 内 Ctrl+V：既有豁免不坏（文本进框 + 块数不变）',
    res.v === 'AAAPASTE_THREE_MARK' && res.n === n0 && hitPaste && log[0].prevented === false,
    `聚焦时 value=${JSON.stringify(focusOk)}；写剪贴板=${w}；paste 事件=${JSON.stringify(log)}；value=${JSON.stringify(res.v)}；blocks ${n0}→${res.n}`);
}

/* ══════════════════ 场景 4：★反面对照 —— 非输入态仍应新建块 ══════════════════ */
{
  await setup([{ id: 'A', text: 'AAA' }]);
  await evalJS("(()=>{ try{ closeBlockEditor(); }catch(e){} setView('canvas'); return true; })()"); await sleep(260);
  await evalJS("(()=>{ try{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); }catch(e){} return { ae:(document.activeElement&&document.activeElement.tagName)||'' }; })()");
  const w = await setClip('PASTE_FOUR_MARK');
  await resetLog();
  const n0 = await nBlocks();
  const aeBefore = await evalJS("(document.activeElement && document.activeElement.tagName) || ''");
  await pressCtrlV();
  const res = await evalJS("({ n: state.blocks.length, last: state.blocks[state.blocks.length-1] && state.blocks[state.blocks.length-1].text })");
  const log = await getLog();
  const hijacked = log.length > 0 && log[0].prevented === true;
  t('S4 ★反面对照 焦点不在输入元素时 Ctrl+V：仍新建块（原功能未弄丢）',
    res.n === n0 + 1 && res.last === 'PASTE_FOUR_MARK' && hijacked,
    `聚焦元素(前)=${aeBefore}；写剪贴板=${w}；paste 事件=${JSON.stringify(log)}；blocks ${n0}→${res.n}；末块文本=${JSON.stringify(res.last)}`);
}

const pass = R.filter((r) => r.pass).length;
console.log('\n--- 结果 ---');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.scenario}\n       ${r.detail}`);
console.log(`\n合计 ${pass}/${R.length}（S1 放大编辑 / S2 写作台 / S3 内联框 / S4 反面对照建块）`);
ws.close();
cleanupBrowser();
process.exit(pass === R.length ? 0 : 1);
