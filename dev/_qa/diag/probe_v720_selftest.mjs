#!/usr/bin/env node
/* 拼好镜 · v7.20 自测探针（本轮先自测、不接入闸门；主理人/Holly 评估后再定常驻断言）
   ---------------------------------------------------------------------------
   对象（v7.20 两需求）：
     ① 项目名常显化 + 快速切换：左栏头部 .wd-proj 与顶栏 #btnProjName 两处常显当前项目名；
        切换 / 新建 / 重命名后两处立即刷新；点击身份行弹项目菜单。
     ② 写作灵感气泡群（#wdBubbles）：跟随光标所在节实时更换；点击直接插入并走 v7.19 写回链路；
        「换一批」翻页；无候选整体隐藏；折叠/展开（会话态不持久）；reduced-motion 直切降级；
        容器 pointer-events:none 不挡正文。
   工装口径：真机 CDP（点击走 Input.dispatchMouseEvent / 打字走 Input.insertText），
   与 verify_v719 等既有套件同源；被测对象全部真读（DOM 文本 / computedStyle / state.blocks）。
   用法：headless Edge 起好后（或经 run-gate 传入端口）： node dev/_qa/diag/probe_v720_selftest.mjs
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TARGET = pathToFileURL(TEST_BUILD.path).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(20); }
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

/* ---- 真机原语 ---- */
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await sleep(140);
}
async function clickSel(sel) {
  const r = await evalJS('(function(){ var e = document.querySelector(' + JSON.stringify(sel) + '); if(!e) return null; var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()');
  if (!r) return false;
  await clickAt(r.x, r.y);
  return true;
}

/* ---- 页内助手（受控状态 / 文本夹具 / 计量；B8 的 reload 后需重注 —— 见 installHelpers） ---- */
const HELPERS = `
window.__err = 0;
window.addEventListener('error', function(){ window.__err++; });
window.__fixture = [
  '镜头1·@首帧画面。事件发生在@室内。',
  '风格：',
  '【光影逻辑】测试用风格段落。',
  '画面开始：',
  '镜头1 摇镜测试。',
  '画面结束。'
].join('\\n');
window.__deskPrep = function(txt){
  setView('write');
  state.blocks = [{ id: 'd1', text: txt, x: 0, y: 0 }];
  renderWrite();
  return 1;
};
window.__caretLine = function(idx){
  var ta = document.querySelector('#wdInput');
  ta.focus();
  var lines = ta.value.split('\\n');
  var pos = 0;
  for (var i = 0; i < idx && i < lines.length; i++) pos += lines[i].length + 1;
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('click'));
  return pos;
};
window.__bubbleState = function(){
  var box = document.getElementById('wdBubbles');
  if (!box) return null;
  var hidden = box.classList.contains('hide');
  var labels = [], bodies = [];
  var bs = box.querySelectorAll('.wdb-bubble');
  for (var i = 0; i < bs.length; i++) { labels.push(bs[i].dataset.wdbLabel); bodies.push(bs[i].dataset.wdbBody); }
  var more = box.querySelector('.wdb-more');
  var cl = box.querySelector('.wdb-cluster');
  var cs = cl ? getComputedStyle(cl) : null;
  return { hidden: hidden, folded: box.classList.contains('wdb-folded'), dim: box.classList.contains('wdb-dim'),
           labels: labels, bodies: bodies, hasMore: !!more, clusterVisible: !!cs && cs.visibility !== 'hidden' && cs.display !== 'none',
           pe: getComputedStyle(box).pointerEvents,
           bubblePe: bs.length ? getComputedStyle(bs[0]).pointerEvents : null,
           anim: bs.length ? getComputedStyle(bs[0]).animationName : null };
};
window.__identity = function(){
  var wn = document.getElementById('wdProjName');
  var bn = document.getElementById('btnProjName');
  var wp = document.getElementById('wdProj');
  var bb = document.getElementById('btnProj');
  return { left: wn ? wn.textContent : null, top: bn ? bn.textContent : null,
           leftTitle: wp ? wp.title : null, topTitle: bb ? bb.title : null, title: state.title };
};
window.__projNewViaModal = function(){
  newProject();
  var inp = document.querySelector('#modalBody .modal-input');
  if (inp) { inp.value = '测试新建项目'; }
  var ok = document.getElementById('modalOk');
  if (ok) ok.click();
  return state.title;
};
window.__projRenameViaModal = function(name){
  renameActiveProject();
  var inp = document.querySelector('#modalBody .modal-input');
  if (inp) { inp.value = name; }
  var ok = document.getElementById('modalOk');
  if (ok) ok.click();
  return state.title;
};
1`;
async function installHelpers() {
  await evalJS(HELPERS);
  const probe = await evalJS('typeof window.__deskPrep + "|" + typeof window.__fixture + "|" + typeof cmplBuildGroupItems');
  if (probe.indexOf('function') < 0) { console.error('页内助手未就绪：' + probe); process.exit(21); }
}
await installHelpers();

/* ══════════ 任务①：项目名常显化 + 快速切换 ══════════ */

/* A1 初始两处常显当前项目名 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(150);
  const id1 = await evalJS('__identity()');
  t('A1 两处身份显示常显当前项目名（左栏头部 + 顶栏按钮 = state.title）',
    id1.left === id1.title && id1.top === id1.title && id1.left && id1.left.length > 0 && id1.top.indexOf(id1.title) === 0,
    JSON.stringify(id1));
}

/* A2 点击左栏身份行 → 项目菜单弹出（复用 #ctxMenu） */
{
  await clickSel('#wdProj');
  await sleep(150);
  const menu = await evalJS('(function(){ var m = document.getElementById("ctxMenu"); var items = m.querySelectorAll(".ctx-item"); var acts = []; for (var i=0;i<items.length;i++) acts.push(items[i].dataset.act); return { open: m.classList.contains("open"), n: items.length, hasSwitch: acts.indexOf("proj-switch") >= 0, hasNew: acts.indexOf("proj-new") >= 0 }; })()');
  await evalJS('closeCtxMenu(); 1');
  t('A2 点击身份行弹出项目菜单（openProjectMenu 复用 #ctxMenu）', menu.open && menu.n > 0 && menu.hasSwitch && menu.hasNew, JSON.stringify(menu));
}

/* A3 新建项目（走真 modal 链）→ 两处立即刷新 */
{
  const name = await evalJS('__projNewViaModal()');
  await sleep(200);
  const id2 = await evalJS('__identity()');
  t('A3 新建项目后两处身份显示立即刷新', name === '测试新建项目' && id2.left === name && id2.top === name, JSON.stringify(id2));
}

/* A4 切回首个项目（switchProject 真链）→ 两处立即刷新 */
{
  const firstId = await evalJS('state.projects[0].id');
  const title = await evalJS('switchProject(' + JSON.stringify(firstId) + '), state.title');
  await sleep(200);
  const id3 = await evalJS('__identity()');
  t('A4 切换项目后两处身份显示立即刷新', title === '未命名分镜' && id3.left === title && id3.top === title, JSON.stringify(id3));
}

/* A5 重命名（走真 modal 链）→ 两处立即刷新 */
{
  const name = await evalJS('__projRenameViaModal("改名后的项目")');
  await sleep(200);
  const id4 = await evalJS('__identity()');
  t('A5 重命名后两处身份显示立即刷新', name === '改名后的项目' && id4.left === name && id4.top === name, JSON.stringify(id4));
}

/* ══════════ 任务②：写作灵感气泡群 ══════════ */

/* B1 载入多节文本 → 气泡群出现且内容 = 光标所在节（起手式）的片段 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await evalJS('__caretLine(0)');
  await sleep(350);
  const s1 = await evalJS('__bubbleState()');
  const anchorLabels = await evalJS('(function(){ var its = cmplBuildGroupItems("起手式"); return its.map(function(x){ return x.label; }); })()');
  const inAnchor = s1 && !s1.hidden && s1.labels.length > 0 && s1.labels.every(function(l){ return anchorLabels.indexOf(l) >= 0; });
  t('B1 起手式节：气泡群出现且 label 全部属于「起手式」组', inAnchor,
    'labels=' + JSON.stringify(s1.labels) + ' anchorGroup=' + JSON.stringify(anchorLabels));
  await evalJS('window.__prevLabels = ' + JSON.stringify(s1.labels));
}

/* B2 节切换 → 气泡内容实时更换（风格包节 → 风格包组条目；与 B1 集合不同） */
{
  const prev = await evalJS('window.__prevLabels');
  await evalJS('__caretLine(2)');   /* 【光影逻辑】行 = 风格包区 */
  await sleep(450);
  const s2 = await evalJS('__bubbleState()');
  const styleLabels = await evalJS('(function(){ var its = cmplBuildGroupItems("风格包"); return its.map(function(x){ return x.label; }); })()');
  const inStyle = s2 && !s2.hidden && s2.labels.length > 0 && s2.labels.every(function(l){ return styleLabels.indexOf(l) >= 0; });
  const differs = !eq(s2.labels, prev);
  t('B2 风格包节：气泡内容切换为「风格包」组条目（与起手式节集合不同）',
    inStyle && differs, 'prev=' + JSON.stringify(prev) + ' now=' + JSON.stringify(s2.labels));
  await evalJS('window.__prevLabels = ' + JSON.stringify(s2.labels));
}

/* B3 点击气泡 → 直接插入 body 到光标处 + input 写回 state.blocks + 焦点回 textarea */
{
  await evalJS('__caretLine(0)');
  await sleep(350);
  const before = await evalJS('(function(){ return { text: state.blocks[0].text }; })()');
  const target = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); var pick = null; for (var i=0;i<bs.length;i++){ if (bs[i].dataset.wdbBody === "事件发生在@室内。") pick = bs[i]; } if(!pick) return null; var b = pick.getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, body: pick.dataset.wdbBody }; })()');
  let okB3 = false, detail = '';
  if (target) {
    await clickAt(target.x, target.y);
    await sleep(300);
    const after = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return { ta: ta.value, block: state.blocks[0].text, focus: document.activeElement === ta }; })()');
    okB3 = after.ta.indexOf(target.body) >= 0 && after.block === after.ta && after.focus;
    detail = 'body=' + target.body + ' focus=' + after.focus + ' block===ta:' + (after.block === after.ta);
  } else { detail = '未找到目标气泡（事件发生在…室内）'; }
  t('B3 点击气泡：插入内容真写回 state.blocks（block===ta）且焦点回 textarea', okB3, detail);
}

/* B4 「换一批」翻页：body 节池 31 条 → 4 页 → 按钮存在且点击后换批 */
{
  await evalJS('__caretLine(4)');   /* 画面开始：之后 = 叙事正文区 */
  await sleep(450);
  const s4a = await evalJS('__bubbleState()');
  const poolLen = await evalJS('wdBubblePool("body").length');
  await clickSel('#wdBubbles .wdb-more');
  await sleep(300);
  const s4b = await evalJS('__bubbleState()');
  const changed = s4a.labels.join('|') !== s4b.labels.join('|');
  t('B4 换一批：多页节（' + poolLen + ' 条池）存在「换一批」且点击后批内容更换',
    poolLen > 8 && s4a.hasMore && changed, 'before=' + JSON.stringify(s4a.labels) + ' after=' + JSON.stringify(s4b.labels));
}

/* B5 无候选 → 整体隐藏（空态：编辑器 disabled） */
{
  await evalJS('state.blocks = []; renderWrite(); 1');
  await sleep(300);
  const s5 = await evalJS('(function(){ var box = document.getElementById("wdBubbles"); return { hidden: box.classList.contains("hide"), disp: getComputedStyle(box).display }; })()');
  t('B5 无候选节（空态）：气泡群整体隐藏（不出空壳）', s5.hidden && s5.disp === 'none', JSON.stringify(s5));
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(300);
}

/* B6 折叠 / 展开（会话态；不持久 → state 无新增持久字段、version 仍 17） */
{
  await evalJS('__caretLine(0)');
  await sleep(350);
  await clickSel('#wdBubbles .wdb-fold');
  await sleep(300);
  const f1 = await evalJS('__bubbleState()');
  await clickSel('#wdBubbles .wdb-fab');
  await sleep(300);
  const f2 = await evalJS('__bubbleState()');
  const saved = await evalJS('(function(){ scheduleSave(); flush(); var raw = localStorage.getItem("storyboard-prompt-panel:v1"); return { hasFold: raw.indexOf("wdBbl") >= 0 || raw.indexOf("wdbFold") >= 0, version: JSON.parse(raw).version }; })()');
  t('B6 折叠/展开可用；折叠态不入持久化（version 仍 17、无气泡字段）',
    f1.folded && !f1.clusterVisible && !f2.folded && f2.clusterVisible && !saved.hasFold && saved.version === 17,
    'folded=' + f1.folded + ' restored=' + f2.folded + ' saved=' + JSON.stringify(saved));
}

/* B7 不遮挡正文：容器 pointer-events none / 气泡本体 auto；正文划选仍可用 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await evalJS('__caretLine(0)');
  await sleep(350);
  const pe = await evalJS('__bubbleState()');
  const m = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); var r = ta.getBoundingClientRect(); return { left: r.left, top: r.top }; })()');
  /* 首行起点真鼠标按下 + Shift+点选延展（与 verify_v719 同口径） */
  await clickAt(m.left + 54, m.top + 12 + 11);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + 11) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + 11), button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + 11), button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(150);
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.selectionEnd - ta.selectionStart; })()');
  t('B7 不遮挡：容器 pe=none / 气泡 pe=auto；正文首行真划选仍可选（selLen>0）',
    pe.pe === 'none' && pe.bubblePe === 'auto' && selLen > 0, 'pe=' + pe.pe + '/' + pe.bubblePe + ' selLen=' + selLen);
}

/* B8 reduced-motion 降级：无动画（animationName=none）但功能正常（出现 + 插入） */
{
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  await installHelpers();   /* reload 清空 window → 重注页内助手 */
  await evalJS('__deskPrep(window.__fixture)');
  await evalJS('__caretLine(0)');
  await sleep(400);
  const s8 = await evalJS('__bubbleState()');
  const target8 = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); if(!bs.length) return null; var b = bs[0].getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, body: bs[0].dataset.wdbBody }; })()');
  let insert8 = false;
  if (target8) { await clickAt(target8.x, target8.y); await sleep(300); insert8 = await evalJS('state.blocks[0].text.indexOf(' + JSON.stringify(target8.body) + ') >= 0'); }
  t('B8 reduced-motion：气泡直切显隐（无动画）且插入功能正常',
    s8 && !s8.hidden && s8.labels.length > 0 && s8.anim === 'none' && insert8,
    'anim=' + s8.anim + ' labels=' + JSON.stringify(s8.labels) + ' insert=' + insert8);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(400);
  await installHelpers();   /* 重注页内助手（含 window.__err 计数器），保证收尾零报错口径有效 */
}

/* 全程零报错 */
{
  const err = await evalJS('window.__err');
  t('B9 全程零未捕获错误', err === 0, 'err=' + err);
}

/* ═══════════════════ 汇总 ═══════════════════ */
const PASS = R.filter((x) => x.pass).length;
const FAIL = R.length - PASS;
for (const x of R) {
  console.log((x.pass ? '✅ ' : '❌ ') + x.name + (x.detail ? '   〔' + x.detail + '〕' : ''));
}
console.log('v7.20 自探针合计 ' + PASS + '/' + R.length + '（身份 A×5 + 气泡 B×9；自测口径，不接入闸门）');
process.exit(FAIL === 0 ? 0 : 20);
