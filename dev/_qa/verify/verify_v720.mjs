#!/usr/bin/env node
/* 拼好镜 · v7.20 组常驻断言（verify_v720）—— run-gate 第 15 道（退出码 18）
   ---------------------------------------------------------------------------
   覆盖（Holly 已核准 17-18 条；最终 18 条 = A×5 + B×9 + C×4）：
     A×5  项目名常显 + 快速切换：左栏 .wd-proj 身份行与顶栏 #btnProjName 常显当前项目名；
          点击身份行弹项目菜单；新建/切换/重命名后两处立即刷新。
     B×9  写作灵感气泡群（#wdBubbles）：跟随光标所在节实时更换；点击直接插入并走 v7.19
          写回链路；「换一批」翻页；无候选整体隐藏；折叠/展开（会话态不持久）；
          reduced-motion 直切降级；容器 pointer-events:none 不挡正文；全程零报错。
     C×4  补强（源自 QA 独立复验 probe_v720_qa_indep 口径）：与 # 补全并存 / 节往返 /
          切条往返 + 落盘 / 「换一批」末页循环。
   ★夹具红线（QA 抓出的恒真教训）：__fixture 首行**不得含**任何将被插入的气泡 body，
     否则「插入后包含该内容」恒真——改坏插入逻辑也不会红。
   工装口径：真机 CDP（Input.dispatchMouseEvent / Input.insertText），被测对象全部真读。
   由 run-gate 传入 PHJ_BROWSER_PORT 附加共享浏览器会话（与 [11]-[14] 同形态）。
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TARGET = 'file:///' + encodeURI(TEST_BUILD.path.replace(/\\/g, '/'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(19); }
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

/* ---- 导航：清 LS（★捕获 identifier 供 C3 摘除）→ 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
const LS_CLEAR = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
const LS_CLEAR_ID = LS_CLEAR && LS_CLEAR.identifier;
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
async function typeText(text) { await send('Input.insertText', { text }); await sleep(160); }
async function pressKey(key, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(90);
}
/* 真鼠标点击 textarea 第 idx 行定位光标（比 setSelectionRange 更接近真实用户路径） */
async function clickLine(idx) {
  const m = await evalJS('__taMetrics()');
  await clickAt(m.left + 60, m.top + 11 + idx * m.lh + m.lh / 2);
  return await evalJS('__caretInfo()');
}

/* ---- 页内助手（B8/C3 的 reload 后需重注 —— 见 installHelpers） ---- */
const HELPERS = `
window.__err = 0;
window.addEventListener('error', function(){ window.__err++; });
window.__fixture = [
  '镜头1·@首帧画面。',
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
window.__taMetrics = function(){
  var ta = document.querySelector('#wdInput');
  var r = ta.getBoundingClientRect();
  var lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
  return { left: r.left, top: r.top, lh: lh };
};
window.__caretInfo = function(){
  var ta = document.querySelector('#wdInput');
  return { pos: ta.selectionStart, st: structAt(ta.value, ta.selectionStart) };
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
window.__bubbleLabels = function(){
  var box = document.getElementById('wdBubbles');
  if (!box) return [];
  var bs = box.querySelectorAll('.wdb-bubble'); var out = [];
  for (var i = 0; i < bs.length; i++) out.push(bs[i].dataset.wdbLabel);
  return out;
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
  const probe = await evalJS('typeof window.__deskPrep + "|" + typeof window.__taMetrics + "|" + typeof cmplBuildGroupItems');
  if (probe.indexOf('function') < 0) { console.error('页内助手未就绪：' + probe); process.exit(21); }
}
await installHelpers();

/* ══════════ A×5：项目名常显化 + 快速切换 ══════════ */

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

/* ══════════ B×9：写作灵感气泡群 ══════════ */

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

/* B3 点击气泡 → 直接插入 body 到光标处 + input 写回 state.blocks + 焦点回 textarea
   ★夹具已修：首行不含「事件发生在@室内。」→ 本断言可证伪（插入逻辑改坏必红） */
{
  await evalJS('__caretLine(0)');
  await sleep(350);
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

/* B4 「换一批」翻页：body 节池 >8 条 → 按钮存在且点击后换批 */
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
  /* 首行起点真鼠标按下 + Shift+点选延展（本机 CDP 拖选不派发选区，与 verify_v719 同口径） */
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
  await installHelpers();   /* 重注页内助手（含 __err 计数器） */
}

/* ══════════ C×4：补强（QA 独立复验口径） ══════════ */

/* C1 与 # 补全并存：气泡开着 → 真 # 触发候选 → Esc 关闭 → 气泡集合不变、点击插入仍工作 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await evalJS('__caretLine(0)');
  await sleep(400);
  const before = await evalJS('__bubbleLabels()');
  /* 光标定位到首行行尾再输 #（真实 insertText） */
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); var lines = ta.value.split("\\n"); var pos = lines[0].length; ta.focus(); ta.setSelectionRange(pos, pos); ta.dispatchEvent(new Event("click")); return 1; })()');
  await sleep(200);
  await typeText('#');
  await sleep(350);
  const pop = await evalJS('(function(){ return { open: cmplOpen, items: cmplItems ? cmplItems.length : 0 }; })()');
  await pressKey('Escape', 'Escape', 27);
  await sleep(250);
  const after = await evalJS('(function(){ return { open: cmplOpen, labels: __bubbleLabels() }; })()');
  /* 点一个不含槽位占位的气泡（槽位上屏会改写文本，插入断言只对无槽位 body 有意义） */
  const target = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); for (var i=0;i<bs.length;i++){ var b = bs[i].dataset.wdbBody; if (b.indexOf("${") < 0) { var r = bs[i].getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, body: b }; } } return null; })()');
  let still = false, c1body = null;
  if (target) {
    await clickAt(target.x, target.y);
    await sleep(350);
    c1body = target.body;
    still = await evalJS('state.blocks[0].text.indexOf(' + JSON.stringify(target.body) + ') >= 0');
  }
  await evalJS('window.__c1body = ' + JSON.stringify(c1body));
  t('C1 与#并存：# 触发候选正常 → Esc 关闭 → 气泡集合不变且点击插入仍工作',
    pop.open && pop.items > 0 && !after.open && eq(after.labels, before) && still,
    'pop=' + JSON.stringify(pop) + ' labelsSame=' + eq(after.labels, before) + ' insertAfterEsc=' + still);
}

/* C2 节往返（真鼠标点击行定位）：起手式 → 风格包 → 移回 → 集合逐条复原 */
{
  const ci0 = await clickLine(0);
  await sleep(450);
  const setA = await evalJS('__bubbleLabels()');
  const ci2 = await clickLine(2);
  await sleep(500);
  const setB = await evalJS('__bubbleLabels()');
  const ciBack = await clickLine(0);
  await sleep(500);
  const setBack = await evalJS('__bubbleLabels()');
  t('C2 节往返（真鼠标）：起手式→风格包→移回，气泡集合逐条复原',
    ci0.st.region === 'anchor' && ci2.st.region !== 'anchor' && ciBack.st.region === 'anchor' &&
    !eq(setA, setB) && eq(setBack, setA),
    'setA=' + JSON.stringify(setA) + ' setB=' + JSON.stringify(setB) + ' back=' + JSON.stringify(setBack));
}

/* C3 切条往返不丢 + 落盘（flush 后 LS 含 C1 插入内容；摘除清 LS 引导脚本后 reload 仍在） */
{
  const c1body = await evalJS('window.__c1body');
  await evalJS('state.blocks.push({ id: "d2", text: "第二条占位。", x: 0, y: 0 }); renderWrite(); 1');
  await sleep(250);
  const rowB = await clickSel('.wd-item[data-id="d2"]');
  await sleep(250);
  const inB = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.value; })()');
  const rowA = await clickSel('.wd-item[data-id="d1"]');
  await sleep(250);
  const backA = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return { ta: ta.value, block: state.blocks[0].text }; })()');
  const kept = c1body && backA.ta.indexOf(c1body) >= 0 && backA.block === backA.ta;
  await evalJS('(function(){ scheduleSave(); flush(); return 1; })()');
  const lsRaw = await evalJS('localStorage.getItem("storyboard-prompt-panel:v1")');
  const lsKept = !!(lsRaw && c1body && lsRaw.indexOf(c1body) >= 0);
  /* 摘除「清 LS」引导脚本：否则 reload 后应用加载前落盘数据即被夹具清掉（测试夹具问题，非产品问题） */
  if (LS_CLEAR_ID) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: LS_CLEAR_ID });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  await installHelpers();
  const afterReload = await evalJS('(function(){ setView("write"); var b = state.blocks.filter(function(x){ return x.id === "d1"; })[0] || state.blocks[0]; return b.text; })()');
  t('C3 切条往返：内容不丢（block===ta）+ flush 后 LS 含插入内容 + reload 后落盘仍在',
    rowB && rowA && inB === '第二条占位。' && kept && lsKept && c1body && String(afterReload).indexOf(c1body) >= 0,
    'inB=' + JSON.stringify(inB) + ' kept=' + kept + ' lsKept=' + lsKept + ' afterReload=' + JSON.stringify(String(afterReload).slice(0, 60)));
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(250);
}

/* C4 「换一批」循环性：连点 pages 次回到出发批（对任意出发页成立，不依赖页码重置） */
{
  await clickLine(4);
  await sleep(500);
  const poolLen = await evalJS('wdBubblePool("body").length');
  const batch0 = await evalJS('__bubbleLabels()');
  const hasMore = await evalJS('!!document.querySelector("#wdBubbles .wdb-more")');
  const pages = Math.max(1, Math.ceil(poolLen / 8));
  for (let i = 0; i < pages; i++) { await clickSel('#wdBubbles .wdb-more'); await sleep(300); }
  const batchWrap = await evalJS('__bubbleLabels()');
  const midDiff = poolLen > 8;
  t('C4 换一批循环：池 ' + poolLen + ' 条 / ' + pages + ' 页；连点 pages 次回到出发批',
    poolLen > 8 && hasMore && midDiff && eq(batchWrap, batch0),
    'b0=' + JSON.stringify(batch0) + ' wrap=' + JSON.stringify(batchWrap));
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
console.log('v7.20 组合计 ' + PASS + '/' + R.length + '（身份 A×5 + 气泡 B×9 + 补强 C×4）');
process.exit(FAIL === 0 ? 0 : 18);
