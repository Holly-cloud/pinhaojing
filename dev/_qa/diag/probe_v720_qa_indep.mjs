#!/usr/bin/env node
/* 拼好镜 · v7.20 QA 独立复验探针（Edward · 不接闸门 · 自起自收浏览器）
   ---------------------------------------------------------------------------
   与 probe_v720_selftest（工程师自测）的差异 = 本探针补独立口径：
     · 节切换用**真 CDP 鼠标点击**定位光标（不用 setSelectionRange+合成 click），
       并验「anchor→style→anchor 往返」集合复原；
     · 点击写回补「切条往返不丢 + reload 落盘仍在」；
     · 「换一批」验**末页循环**（pages+1 次点击回到首批）；
     · 验「与 # 补全并存」（工程师探针未覆盖）；
     · G6 隔离三态计量：仅隐 hl（气泡漏入）/ 双隐（隔离生效）/ 注入 visibility:visible
       缺陷后双隐（缺陷复现 → G6 必红）——证明 G6 非空转；
     · 项目身份行补「删除当前项目先切走」与「长名 truncate + 全名 title」与画布视图。
   用法：node dev/_qa/diag/probe_v720_qa_indep.mjs   （自起 headless Edge，退出自回收）
   --------------------------------------------------------------------------- */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { detectBrowser } from '../lib/browser-detect.mjs';
import { decodePng, countPixels } from '../lib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TARGET = 'file:///' + encodeURI(TEST_BUILD.path.replace(/\\/g, '/'));
const PORT = process.env.PHJ_BROWSER_PORT || '9223';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 自起自收 headless 浏览器 ---- */
const det = detectBrowser();
if (!det.exe) { console.error('未找到浏览器'); process.exit(21); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj-qa-v720-'));
const proc = spawn(det.exe, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let ok = false;
for (let i = 0; i < 50; i++) {
  try { await fetch('http://127.0.0.1:' + PORT + '/json/version'); ok = true; break; } catch { await sleep(200); }
}
if (!ok) { console.error('CDP 未就绪'); process.exit(22); }

const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page');
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await send('Page.enable'); await send('Runtime.enable');
const LS_CLEAR = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
const LS_CLEAR_ID = LS_CLEAR.identifier;
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
async function typeText(text) { await send('Input.insertText', { text }); await sleep(160); }
async function pressKey(key, code, vk, modifiers) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: modifiers || 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: modifiers || 0 });
  await sleep(90);
}
async function shot(clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.w), height: Math.round(clip.h), scale: 1 } });
  return decodePng(Buffer.from(r.data, 'base64'));
}
const inkCount = (img) => countPixels(img.data, (r, g, b) => r < 100 && g < 100 && b < 100);

/* ---- 页内助手 ---- */
const HELPERS = `
window.__err = 0;
window.addEventListener('error', function(){ window.__err++; });
window.__fixture = [
  '镜头1·@首帧画面。',   /* ★不含「事件发生在…」——保证 Q11 插入断言可证伪 */
  '',
  '风格：',
  '【光影逻辑】测试用风格段落。',
  '',
  '画面开始：',
  '镜头1 摇镜测试。',
  '画面结束。',
  '',
  '硬性要求：无BMG。'
].join('\\n');
window.__deskPrep = function(txt){
  setView('write');
  state.blocks = [{ id: 'd1', text: txt, x: 0, y: 0 }];
  wdSelId = 'd1';
  renderWrite();
  return 1;
};
window.__taMetrics = function(){
  var ta = document.querySelector('#wdInput'); var r = ta.getBoundingClientRect();
  var cs = getComputedStyle(ta);
  return { left: r.left, top: r.top, w: r.width, h: r.height, lh: parseFloat(cs.lineHeight) || 20 };
};
/* 真鼠标点击定位第 idx 行由宿主侧 clickLine 完成 */
window.__caretInfo = function(){
  var ta = document.querySelector('#wdInput');
  var lines = ta.value.slice(0, ta.selectionStart).split('\\n');
  return { line: lines.length - 1, st: structAt(ta.value, ta.selectionStart) };
};
window.__bubbleLabels = function(){
  var box = document.getElementById('wdBubbles');
  if (!box) return null;
  var bs = box.querySelectorAll('.wdb-bubble'); var out = [];
  for (var i = 0; i < bs.length; i++) out.push(bs[i].dataset.wdbLabel);
  return out;
};
window.__bubbleVis = function(){
  var box = document.getElementById('wdBubbles');
  if (!box) return null;
  var cl = box.querySelector('.wdb-cluster'); var cs = cl ? getComputedStyle(cl) : null;
  return { hideCls: box.classList.contains('hide'), disp: getComputedStyle(box).display,
           vis: getComputedStyle(box).visibility, clusterVis: cs ? cs.visibility : null,
           folded: box.classList.contains('wdb-folded') };
};
window.__identity = function(){
  var wn = document.getElementById('wdProjName'), bn = document.getElementById('btnProjName');
  var wp = document.getElementById('wdProj'), bb = document.getElementById('btnProj');
  var bnS = bn ? getComputedStyle(bn) : null;
  return { left: wn ? wn.textContent : null, top: bn ? bn.textContent : null, title: state.title,
           leftTitle: wp ? wp.title : null, topTitle: bb ? bb.title : null,
           truncated: bnS ? (bnS.textOverflow === 'ellipsis' && bn.scrollWidth > bn.clientWidth) : null,
           overflowCss: bnS ? bnS.textOverflow : null };
};
window.__lsSnapshot = function(){
  var raw = localStorage.getItem('storyboard-prompt-panel:v1');
  var j = JSON.parse(raw);
  var keys = Object.keys(j);
  var flat = JSON.stringify(j).toLowerCase();
  return { version: j.version, topKeys: keys.join(','),
           bubbleLeak: flat.indexOf('wdb') >= 0 || flat.indexOf('bubble') >= 0 || flat.indexOf('fold') >= 0 };
};
1`;
async function installHelpers() {
  await evalJS(HELPERS);
  const probe = await evalJS('typeof window.__deskPrep + "|" + typeof structAt + "|" + typeof wdBubblePool');
  if (probe.indexOf('function') < 0) { console.error('页内助手未就绪：' + probe); process.exit(23); }
}
await installHelpers();

/* 真鼠标点击 textarea 第 idx 行定位光标（Q8 起使用） */
async function clickLine(idx) {
  const m = await evalJS('__taMetrics()');
  await clickAt(m.left + 60, m.top + 11 + idx * m.lh + m.lh / 2);
  const ci = await evalJS('__caretInfo()');
  return ci;
}
/* 真鼠标点击某选择器元素中心 */
async function clickSel(sel) {
  const r = await evalJS('(function(){ var e = document.querySelector(' + JSON.stringify(sel) + '); if(!e) return null; var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()');
  if (!r) return false;
  await clickAt(r.x, r.y);
  return true;
}

/* ══════ ① 项目身份行 ══════ */

/* Q1 三处真读一致 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(200);
  const id = await evalJS('__identity()');
  t('Q1 身份三处一致：#wdProjName = #btnProjName = state.title',
    id.left === id.title && id.top === id.title && id.left.length > 0, JSON.stringify(id));
}

/* Q2 真点击身份行 → 项目菜单弹出 */
{
  const ok = await clickSel('#wdProj');
  await sleep(200);
  const menu = await evalJS('(function(){ var m = document.getElementById("ctxMenu"); var items = m.querySelectorAll(".ctx-item"); return { open: m.classList.contains("open"), n: items.length }; })()');
  await evalJS('closeCtxMenu(); 1');
  t('Q2 真点击身份行 → 项目菜单弹出（open + 菜单项>0）', ok && menu.open && menu.n > 0, JSON.stringify(menu));
}

/* Q3 新建（真 modal 链）→ 两处立即刷新 */
{
  await evalJS('(function(){ newProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = "独立复验项目A"; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(250);
  const id = await evalJS('__identity()');
  t('Q3 新建项目 → 两处立即=新名', id.title === '独立复验项目A' && id.left === id.title && id.top === id.title, JSON.stringify(id));
}

/* Q4 切回（真 switchProject）→ 立即刷新 */
{
  const firstId = await evalJS('state.projects[0].id');
  const title = await evalJS('switchProject(' + JSON.stringify(firstId) + '), state.title');
  await sleep(250);
  const id = await evalJS('__identity()');
  t('Q4 切换项目 → 两处立即=旧名', title === '未命名分镜' && id.left === title && id.top === title, JSON.stringify(id));
}

/* Q5 重命名（真 modal 链，唯一不走 applyView 的操作）→ 立即刷新 */
{
  await evalJS('(function(){ renameActiveProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = "改名的项目X"; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(250);
  const id = await evalJS('__identity()');
  t('Q5 重命名 → 两处立即=新名（applyView 补调生效）', id.title === '改名的项目X' && id.left === id.title && id.top === id.title, JSON.stringify(id));
}

/* Q6 删除当前项目（真链：newProject 建 B → deleteProject() 只删活动项目 + 确认弹窗）→ 先切走语义 + 两处立即刷新 */
{
  await evalJS('(function(){ newProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = "待删项目B"; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(250);
  const before = await evalJS('(function(){ return { n: state.projects.length, title: state.title }; })()');
  await evalJS('(function(){ deleteProject(); return 1; })()');
  await sleep(200);
  const modalUp = await evalJS('!document.getElementById("modalMask").classList.contains("hide")');
  await evalJS('(function(){ var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(300);
  const after = await evalJS('(function(){ return { n: state.projects.length, title: state.title }; })()');
  const id = await evalJS('__identity()');
  t('Q6 删除当前项目：确认弹窗出现 → 确认后先切走（title≠被删名）+ 数量-1 + 两处立即刷新',
    before.n === 3 && before.title === '待删项目B' && modalUp
    && after.n === 2 && after.title !== '待删项目B' && id.title === after.title && id.left === id.title && id.top === id.title,
    'before=' + JSON.stringify(before) + ' modal=' + modalUp + ' after=' + JSON.stringify(after) + ' id=' + JSON.stringify(id));
  await evalJS('(function(){ renameActiveProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = "未命名分镜"; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(200);
}

/* Q7 长项目名：顶栏按钮 truncate（CSS ellipsis 生效）+ title 全名；画布视图同样常显 */
{
  const longName = '这是一个特别特别特别长的项目名称用于验证截断效果是否正常工作';
  await evalJS('(function(){ renameActiveProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = ' + JSON.stringify(longName) + '; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(250);
  const idWrite = await evalJS('__identity()');
  await evalJS("setView('canvas'); 1");
  await sleep(300);
  const idCanvas = await evalJS('__identity()');
  const visible = await evalJS('(function(){ var b = document.getElementById("btnProj"); var r = b.getBoundingClientRect(); var cs = getComputedStyle(b); return { inVp: r.width > 0 && r.height > 0, disp: cs.display, text: document.getElementById("btnProjName").textContent }; })()');
  t('Q7 长名：ellipsis 截断生效 + 身份行 title 含全名 + 画布视图顶栏常显项目名',
    idWrite.truncated === true && idWrite.leftTitle.indexOf(longName) >= 0
    && idCanvas.top === longName && visible.inVp && visible.disp !== 'none',
    'write=' + JSON.stringify(idWrite) + ' canvas.top=' + idCanvas.top + ' vis=' + JSON.stringify(visible));
  /* 恢复短名，供后续用 */
  await evalJS("setView('write'); 1");
  await evalJS('(function(){ renameActiveProject(); var i = document.querySelector("#modalBody .modal-input"); if(i) i.value = "未命名分镜"; var ok = document.getElementById("modalOk"); if(ok) ok.click(); return 1; })()');
  await sleep(200);
}

/* ══════ ② 气泡群 ══════ */

/* Q8 真鼠标点击第 0 行（起手式）→ 气泡 label 全属「起手式」组 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(250);
  const ci = await clickLine(0);
  await sleep(450);
  const labels = await evalJS('__bubbleLabels()');
  const anchorLabels = await evalJS('(function(){ return wdBubblePool(structAt(document.querySelector("#wdInput").value, 0).region).map(function(x){ return x.label; }); })()');
  const anchorOnly = await evalJS('(function(){ var its = cmplBuildGroupItems("起手式").map(function(x){ return x.label; }); var ls = __bubbleLabels(); return ls.length > 0 && ls.every(function(l){ return its.indexOf(l) >= 0; }); })()');
  t('Q8 真点击起手式行：光标落第0行 + 气泡出现且 label 全属起手式组',
    ci.line === 0 && ci.st.region === 'anchor' && labels && labels.length > 0 && anchorOnly,
    'caret=' + JSON.stringify(ci) + ' labels=' + JSON.stringify(labels) + ' poolHead=' + JSON.stringify(anchorLabels.slice(0, 8)));
  await evalJS('window.__setA = ' + JSON.stringify(labels));
}

/* Q9 真点击风格包行 → 集合真的变且属风格包组 */
{
  const prev = await evalJS('window.__setA');
  const ci = await clickLine(3);
  await sleep(500);
  const labels = await evalJS('__bubbleLabels()');
  const styleOnly = await evalJS('(function(){ var its = cmplBuildGroupItems("风格包").map(function(x){ return x.label; }); var ls = __bubbleLabels(); return ls.length > 0 && ls.every(function(l){ return its.indexOf(l) >= 0; }); })()');
  t('Q9 真点击风格包行：集合真的变（≠起手式集）且 label 全属风格包组',
    ci.st.region === 'style' && labels && labels.length > 0 && styleOnly && !eq(labels, prev),
    'prev=' + JSON.stringify(prev) + ' now=' + JSON.stringify(labels));
  await evalJS('window.__setB = ' + JSON.stringify(labels));
}

/* Q10 真点击回第 0 行 → 集合复原（往返） */
{
  const prev = await evalJS('window.__setB');
  const setA = await evalJS('window.__setA');
  const ci = await clickLine(0);
  await sleep(500);
  const labels = await evalJS('__bubbleLabels()');
  t('Q10 移回起手式行：气泡集合复原为首批（往返一致）', ci.st.region === 'anchor' && eq(labels, setA) && !eq(labels, prev),
    'now=' + JSON.stringify(labels) + ' expectA=' + JSON.stringify(setA));
}

/* Q11 点击气泡 → 插入 + 写回 + 焦点回 textarea + 气泡按新节刷新 */
{
  const target = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); for (var i=0;i<bs.length;i++){ if (bs[i].dataset.wdbBody === "事件发生在@室内。") { var b = bs[i].getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, body: bs[i].dataset.wdbBody }; } } return null; })()');
  let okQ11 = false, detail = '未找到目标气泡';
  if (target) {
    await clickAt(target.x, target.y);
    await sleep(350);
    const after = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return { ta: ta.value, block: state.blocks[0].text, focus: document.activeElement === ta }; })()');
    okQ11 = after.ta.indexOf('事件发生在@室内。') >= 0 && after.block === after.ta && after.focus;
    detail = 'body=' + target.body + ' focus=' + after.focus + ' block===ta:' + (after.block === after.ta);
  }
  t('Q11 真点击气泡：body 真插入 + state.blocks 写回（block===ta）+ 焦点回 textarea', okQ11, detail);
}

/* Q12 切条往返不丢 + reload 落盘仍在 */
{
  await evalJS('state.blocks.push({ id: "d2", text: "第二条占位。", x: 0, y: 0 }); renderWrite(); 1');
  await sleep(250);
  const rowB = await clickSel('.wd-item[data-id="d2"]');
  await sleep(250);
  const inB = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.value; })()');
  const rowA = await clickSel('.wd-item[data-id="d1"]');
  await sleep(250);
  const backA = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return { ta: ta.value, block: state.blocks[0].text }; })()');
  const kept = backA.ta.indexOf('事件发生在@室内。') >= 0 && backA.block === backA.ta;
  await evalJS('(function(){ scheduleSave(); flush(); return 1; })()');
  const lsRaw = await evalJS('localStorage.getItem("storyboard-prompt-panel:v1")');
  const lsKept = lsRaw && lsRaw.indexOf('事件发生在@室内。') >= 0;
  /* 摘除「清 LS」引导脚本：否则 reload 后应用加载前落盘数据即被夹具清掉（测试夹具问题，非产品问题）；验完恢复 */
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: LS_CLEAR_ID });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  await installHelpers();
  const afterReload = await evalJS('(function(){ setView("write"); var b = state.blocks.filter(function(x){ return x.id === "d1"; })[0] || state.blocks[0]; return b.text; })()');
  t('Q12 切条往返：内容不丢（block===ta）+ flush 后 LS 含插入内容 + reload 后落盘仍在',
    rowB && rowA && inB === '第二条占位。' && kept && lsKept && String(afterReload).indexOf('事件发生在@室内。') >= 0,
    'inB=' + JSON.stringify(inB) + ' kept=' + kept + ' lsKept=' + lsKept + ' afterReload=' + JSON.stringify(String(afterReload).slice(0, 60)));
  await evalJS('__deskPrep(window.__fixture)');
  await sleep(250);
}

/* Q13 换一批：翻页换批 + 末页循环回首批（实际行为报告） */
{
  await clickLine(6);
  await sleep(500);
  const poolLen = await evalJS('wdBubblePool("body").length');
  const batch1 = await evalJS('__bubbleLabels()');
  const hasMore = await evalJS('!!document.querySelector("#wdBubbles .wdb-more")');
  await clickSel('#wdBubbles .wdb-more');
  await sleep(350);
  const batch2 = await evalJS('__bubbleLabels()');
  /* 连点到超过末页 → 应循环回首批 */
  const pages = Math.max(1, Math.ceil(poolLen / 8));
  for (let i = 1; i < pages; i++) { await clickSel('#wdBubbles .wdb-more'); await sleep(300); }
  const batchWrap = await evalJS('__bubbleLabels()');
  t('Q13 换一批：池 ' + poolLen + ' 条 / ' + pages + ' 页；点击换批（新≠旧）；末页再点循环回首批',
    poolLen > 8 && hasMore && !eq(batch1, batch2) && eq(batchWrap, batch1),
    'b1=' + JSON.stringify(batch1) + ' b2=' + JSON.stringify(batch2) + ' wrap=' + JSON.stringify(batchWrap));
}

/* Q14 空态隐藏 + 有候选显示（反面对照） */
{
  await evalJS('state.blocks = []; renderWrite(); 1');
  await sleep(350);
  const empty = await evalJS('__bubbleVis()');
  await evalJS('__deskPrep(window.__fixture)');
  await clickLine(0);
  await sleep(450);
  const filled = await evalJS('__bubbleVis()');
  t('Q14 空态（无块/编辑器 disabled）：整体隐藏 display:none；有候选：显示（反面对照）',
    empty && empty.hideCls && empty.disp === 'none' && filled && !filled.hideCls && filled.disp !== 'none',
    'empty=' + JSON.stringify(empty) + ' filled=' + JSON.stringify(filled));
}

/* Q15 折叠/展开 + 落盘无气泡字段 */
{
  await clickLine(0);
  await sleep(450);
  await clickSel('#wdBubbles .wdb-fold');
  await sleep(350);
  const folded = await evalJS('__bubbleVis()');
  const fab = await evalJS('(function(){ var f = document.querySelector("#wdBubbles .wdb-fab"); if(!f) return null; var b = f.getBoundingClientRect(); return { has: true, w: b.width }; })()');
  const saved = await evalJS('__lsSnapshot()');
  await clickSel('#wdBubbles .wdb-fab');
  await sleep(350);
  const expanded = await evalJS('__bubbleVis()');
  t('Q15 折叠：群消失只剩 ✦ 圆钮；落盘 JSON version=17 且无气泡字段；展开恢复',
    folded.folded && folded.clusterVis === 'hidden' && fab && fab.w > 0
    && saved.version === 17 && !saved.bubbleLeak
    && !expanded.folded && expanded.clusterVis !== 'hidden',
    'folded=' + JSON.stringify(folded) + ' saved=' + JSON.stringify(saved) + ' expanded=' + JSON.stringify(expanded));
}

/* Q16 不挡正文：容器 pe=none / 气泡 pe=auto / 正文滚动 + 真划选可用 */
{
  const pe = await evalJS('(function(){ var box = document.getElementById("wdBubbles"); var b = box.querySelector(".wdb-bubble"); return { box: getComputedStyle(box).pointerEvents, bubble: b ? getComputedStyle(b).pointerEvents : null }; })()');
  await evalJS('__deskPrep(window.__fixture.replace("画面结束。", "画面结束。\\n" + Array(30).fill("填充行用于滚动测试的内容句子。").join("\\n")))');
  await clickLine(0);
  await sleep(400);
  const sc0 = await evalJS('document.querySelector("#wdInput").scrollTop');
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); ta.scrollTop = ta.scrollHeight; return 1; })()');
  await sleep(200);
  const sc1 = await evalJS('document.querySelector("#wdInput").scrollTop');
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); ta.scrollTop = 0; ta.focus(); return 1; })()');
  await sleep(200);
  /* 真划选（点击 + Shift+点选，本机 headless 限制下的同路径替代） */
  const m = await evalJS('__taMetrics()');
  await clickAt(m.left + 60, m.top + 12 + m.lh / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + m.lh / 2) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + m.lh / 2), button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(m.left + 220), y: Math.round(m.top + 12 + m.lh / 2), button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(180);
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.selectionEnd - ta.selectionStart; })()');
  t('Q16 不挡正文：pe none/auto；textarea 真滚动（' + sc0 + '→' + sc1 + '）；正文真划选 selLen>0',
    pe.box === 'none' && pe.bubble === 'auto' && sc1 > sc0 && selLen > 0,
    'pe=' + JSON.stringify(pe) + ' selLen=' + selLen);
}

/* Q17 与 # 补全并存：气泡开着 → 真 # 触发候选 → Esc 关闭 → 气泡群仍正常、点击仍可插 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await clickLine(0);
  await sleep(450);
  const before = await evalJS('__bubbleLabels()');
  /* 光标定位到首行行尾再输 #（真实 insertText） */
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); var lines = ta.value.split("\\n"); var pos = lines[0].length; ta.focus(); ta.setSelectionRange(pos, pos); ta.dispatchEvent(new Event("click")); return 1; })()');
  await sleep(200);
  await typeText('#');
  await sleep(350);
  const pop = await evalJS('(function(){ var p = document.querySelector("#wdPop"); return { open: cmplOpen, hidden: p.classList.contains("hide"), items: cmplItems.length }; })()');
  await pressKey('Escape', 'Escape', 27, 0);
  await sleep(250);
  const after = await evalJS('(function(){ return { open: cmplOpen, labels: __bubbleLabels(), vis: __bubbleVis() }; })()');
  const target = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); if(!bs.length) return null; var b = bs[0].getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, body: bs[0].dataset.wdbBody }; })()');
  let still = false;
  if (target) { await clickAt(target.x, target.y); await sleep(350); still = await evalJS('state.blocks[0].text.indexOf(' + JSON.stringify(target.body) + ') >= 0'); }
  const taVal = await evalJS('document.querySelector("#wdInput").value');
  const hashGone = !/#[^#]*$/.test(taVal) || true;   /* # 仍在文本中属正常（上屏与否不在此验），只验并存 */
  t('Q17 与#并存：# 触发候选正常 → Esc 关闭 → 气泡集合不变且点击插入仍工作',
    pop.open && !pop.hidden && pop.items > 0 && !after.open && eq(after.labels, before) && after.vis.clusterVis !== 'hidden' && still,
    'pop=' + JSON.stringify(pop) + ' labelsSame=' + eq(after.labels, before) + ' insertAfterEsc=' + still);
}

/* Q18 reduced-motion：动画直切 + 插入功能不降级 */
{
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  await installHelpers();
  await evalJS('__deskPrep(window.__fixture)');
  await clickLine(0);
  await sleep(450);
  const s = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); var cs = bs.length ? getComputedStyle(bs[0]) : null; var cl = document.querySelector("#wdBubbles .wdb-cluster"); return { anim: cs ? cs.animationName : null, dur: cs ? cs.animationDuration : null, labels: __bubbleLabels(), clusterTrans: cl ? getComputedStyle(cl).transitionDuration : null }; })()');
  const target = await evalJS('(function(){ var bs = document.querySelectorAll("#wdBubbles .wdb-bubble"); if(!bs.length) return null; var b = bs[0].getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2, body: bs[0].dataset.wdbBody }; })()');
  let ins = false;
  if (target) { await clickAt(target.x, target.y); await sleep(350); ins = await evalJS('state.blocks[0].text.indexOf(' + JSON.stringify(target.body) + ') >= 0'); }
  t('Q18 reduced-motion：animationName=none（直切）且点击插入功能正常',
    s.anim === 'none' && s.labels && s.labels.length > 0 && ins,
    'anim=' + s.anim + ' dur=' + s.dur + ' labels=' + JSON.stringify(s.labels) + ' insert=' + ins);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(400);
  await installHelpers();
}

/* ══════ ③ G6 隔离计量（正 / 反 / 缺陷注入） ══════ */
{
  await evalJS('__deskPrep("写作台划选测试文本一句。")');
  await sleep(200);
  const m = await evalJS('__taMetrics()');
  const taRect = await evalJS('(function(){ var e = document.querySelector("#wdInput"); var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()');
  /* 真划选（与 G6 同路径） */
  await clickAt(m.left + 60, m.top + 12 + m.lh / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(m.left + 200), y: Math.round(m.top + 12 + m.lh / 2) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(m.left + 200), y: Math.round(m.top + 12 + m.lh / 2), button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(m.left + 200), y: Math.round(m.top + 12 + m.lh / 2), button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(180);
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.selectionEnd - ta.selectionStart; })()');

  /* 正对照：仅隐彩色层（气泡漏入截图）→ ink 应 >0，证明气泡确实落在矩形内、隔离有必要 */
  await evalJS('(function(){ if(!window.__setLayerVis) window.__setLayerVis = function(sel, vis){ var e = document.querySelector(sel); if(!e) return 0; e.style.visibility = vis ? "visible" : "hidden"; return 1; }; return 1; })()');
  await evalJS('__setLayerVis(".wd-hl", false)');
  const imgA = await shot(taRect);
  const inkBubbles = inkCount(imgA);
  /* 隔离生效：双隐 → ink = 0（G6 期望） */
  await evalJS('__setLayerVis("#wdBubbles", false)');
  const imgB = await shot(taRect);
  const inkIsolated = inkCount(imgB);
  /* 缺陷注入：恢复 .wdb-cluster{visibility:visible}（运行时注入，不落盘）→ 隔离被短路 → ink > 0 → G6 必红 */
  await evalJS('(function(){ var s = document.createElement("style"); s.id = "qaDefect"; s.textContent = ".wdb-cluster{visibility:visible!important}"; document.head.appendChild(s); return 1; })()');
  const imgC = await shot(taRect);
  const inkDefect = inkCount(imgC);
  await evalJS('(function(){ var s = document.getElementById("qaDefect"); if(s) s.remove(); return 1; })()');
  await evalJS('__setLayerVis("#wdBubbles", true)');
  await evalJS('__setLayerVis(".wd-hl", true)');
  await sleep(150);
  /* 恢复检查：隔离后正常时刻气泡可用（无恢复失败残留） */
  const restored = await evalJS('(function(){ var box = document.getElementById("wdBubbles"); var cs = getComputedStyle(box); var labels = __bubbleLabels(); return { vis: cs.visibility, labels: labels }; })()');
  t('Q19 G6 隔离计量：气泡墨迹=' + inkBubbles + '>0（隔离有必要）／双隐=' + inkIsolated + '=0（隔离生效）／注入 visibility:visible 缺陷后=' + inkDefect + '>0（G6 必红·非空转）／恢复后气泡正常',
    selLen > 0 && inkBubbles > 0 && inkIsolated === 0 && inkDefect > 0 && restored.vis === 'visible' && restored.labels && restored.labels.length > 0,
    'selLen=' + selLen + ' inkBubbles=' + inkBubbles + ' inkIsolated=' + inkIsolated + ' inkDefect=' + inkDefect + ' restored=' + JSON.stringify(restored.labels));
}

/* 收尾：零未捕获错误 */
{
  await evalJS('__deskPrep(window.__fixture)');
  await clickLine(0);
  await sleep(300);
  const err = await evalJS('window.__err');
  t('Q20 全程零未捕获错误', err === 0, 'err=' + err);
}

/* ══════ 汇总 ══════ */
const PASS = R.filter((x) => x.pass).length;
const FAIL = R.length - PASS;
for (const x of R) console.log((x.pass ? '✅ ' : '❌ ') + x.name + (x.detail ? '   〔' + x.detail + '〕' : ''));
console.log('v7.20 独立复验 ' + PASS + '/' + R.length);
fs.writeFileSync(path.join(HERE, 'probe_v720_qa_indep.result.json'), JSON.stringify(R, null, 2));
process.exit(FAIL === 0 ? 0 : 24);
