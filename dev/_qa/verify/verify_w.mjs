#!/usr/bin/env node
/* 拼好镜 · W 组验收 · 「界面切换 + 写作台」（v7.15）
   ---------------------------------------------------------------------------
   对象：本增量需求（顶栏胶囊切换 / 启动默认写作台 / 左大纲+右大编辑器 / 同源同步 /
        order 承载顺序 / 写作台内禁用画布专属交互 / 空态 / 图片块不入大纲 / 迁移 v14→v17）。
   上游：dev/docs/decisions/增量需求_界面切换与写作台_2026-09-18.md（P0-1…P0-15）
        dev/docs/design/界面切换与写作台_设计_2026-09-18.md（§4 数据结构 / §6 门控 / §10 冲击）

   为什么独立成套：W 组断言若塞进 v7/v76/v77/v78 会搅动既有计数；主理人已拍板「独立成套」
   并在 run-gate.mjs 挂为**第 8 道闸门**（既有 7 道判定式与条数**零改动**）。

   工装铁律（本项目曾 4 次同类事故，本套件强制遵守）：
     ① 每条断言**真读被测对象**（文本 / 坐标 / state.pan / state.zoom / state.blocks / localStorage），
        不许只看「元素存在 / 函数被调用」；
     ② 每条断言都可**证伪**（改到必然失败 → 必红 → 还原；见测试报告逐条证伪记录）；
     ③ 「存在性断言」必须防真空：凡「不动画布」类断言，均配**画布视图对照组**（同键确实会动），
        否则「监听没跑」也会假绿；
     ④ 断言数变动已报 Holly 核准（本组 = 21 条）。

   真机口径：点击走 Input.dispatchMouseEvent / 按键走 Input.dispatchKeyEvent（含 Alt/Shift 修饰位）/
        文本走 Input.insertText / 滚动走 Input.dispatchMouseEvent(mouseWheel)。
        画布在写作视图内 display:none（无法接收真实指针）→ 门控断言以**直接在画布元素上派发事件**
        来**正面触发**对应监听（否则只剩「CSS 隐藏」这一薄弱证据），并配画布视图对照组。

   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_w.mjs
   ※ 调试端口：优先读 PHJ_BROWSER_PORT（run-gate.mjs 传入），缺省 9222。
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();                       /* A+：对测试产物执行（含顶层名访问器） */
const TARGET = pathToFileURL(TEST_BUILD.path).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(3); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result && r.result.value;
}
async function click(sel) {
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2), w: Math.round(b.width), h: Math.round(b.height) }; })()`);
  if (!r) throw new Error('click target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(150);
}
async function dblclick(x, y) {   /* 真实双击：press/release ×2（clickCount 1→2） */
  for (const cc of [1, 2]) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: cc });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: cc });
  }
  await sleep(150);
}
const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Backspace: 8, ' ': 32, Escape: 27 };
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
function keyParams(name, mods) {
  const vk = VK[name] != null ? VK[name] : 0;
  return { key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods };
}
async function keyPress(name, mods = 0, holdMs = 0) {
  const p = keyParams(name, mods);
  await send('Input.dispatchKeyEvent', { ...p, type: 'keyDown' });
  if (holdMs) await sleep(holdMs);
  await send('Input.dispatchKeyEvent', { ...p, type: 'keyUp' });
  await sleep(100);
}
async function type(text) { await send('Input.insertText', { text }); await sleep(160); }
async function blur() { await evalJS('try{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); }catch(e){} true'); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

/* ---- 受控状态设置：直接把 state.blocks 换成指定块并渲染（写作视图）---- */
const DEF = `window.__wset=function(bs){ state.blocks=bs.map(function(b,i){ var o={ id:b.id||('t'+i), text:(b.text==null?'':b.text), x:(b.x==null?i*40:b.x), y:(b.y==null?i*40:b.y) }; if(b.order!=null) o.order=b.order; if(b.type) o.type=b.type; return o; }); activeView='write'; applyView(); renderWrite(); return state.blocks.length; };`;
async function setup(blocks) { await evalJS(DEF); return evalJS('__wset(' + JSON.stringify(blocks) + ')'); }
const pan = () => evalJS('({ x: state.pan.x, y: state.pan.y })');

/* ══════════════════════════ W1 · 启动默认进写作台（P0-2）══════════════════════════
   真读：body 类 + #writeDesk / .canvas 的 **computedDisplay + 几何**（不是只看 class 存在）。 */
{
  const w1 = await evalJS(`(() => {
    var desk = document.getElementById('writeDesk');
    var cv = document.querySelector('.canvas');
    var ta = document.getElementById('wdInput');
    var dr = desk ? desk.getBoundingClientRect() : { width: 0, height: 0 };
    var cr = cv ? cv.getBoundingClientRect() : { width: 0, height: 0 };
    var seg = document.querySelector('.vs-seg.active');
    return {
      activeView: (typeof activeView === 'string') ? activeView : null,
      bodyWrite: document.body.classList.contains('view-write'),
      bodyCanvas: document.body.classList.contains('view-canvas'),
      deskDisplay: desk ? getComputedStyle(desk).display : null,
      deskH: Math.round(dr.height),
      canvasDisplay: cv ? getComputedStyle(cv).display : null,
      canvasH: Math.round(cr.height),
      taPresent: !!ta, taDisabled: ta ? ta.disabled : null,
      segActive: seg ? seg.dataset.view : null
    };
  })()`);
  t('W1 启动默认进写作台：body.view-write / #writeDesk 可见（computed display≠none 且几何>0）/ .canvas 隐藏（display:none 且几何=0）/ 胶囊高亮=写作 / 默认 activeView=write',
    w1.activeView === 'write' && w1.bodyWrite && !w1.bodyCanvas
    && w1.deskDisplay !== 'none' && w1.deskH > 100
    && w1.canvasDisplay === 'none' && w1.canvasH === 0
    && w1.taPresent && w1.taDisabled === false && w1.segActive === 'write',
    `activeView=${w1.activeView}；body=write:${w1.bodyWrite}/canvas:${w1.bodyCanvas}；#writeDesk display=${w1.deskDisplay} h=${w1.deskH}；.canvas display=${w1.canvasDisplay} h=${w1.canvasH}；胶囊高亮=${w1.segActive}；#wdInput present=${w1.taPresent} disabled=${w1.taDisabled}`);
}

/* ══════════════════════════ W2 · 胶囊切换可用（P0-1）══════════════════════════
   真点击（真实鼠标事件）→ 读 body 类 + 两视图 computedDisplay + 画布专属按钮几何可见性。 */
{
  await evalJS("setView('write')"); await sleep(200);
  await click('.vs-seg[data-view="canvas"]');
  const c = await evalJS(`(() => {
    var vis = function(id){ var e = document.getElementById(id); if(!e) return false; var r = e.getBoundingClientRect(); return !!(e.offsetParent !== null || r.height > 0) && r.height > 0; };
    return {
      bodyCanvas: document.body.classList.contains('view-canvas'),
      deskDisplay: getComputedStyle(document.getElementById('writeDesk')).display,
      canvasDisplay: getComputedStyle(document.querySelector('.canvas')).display,
      btnArrange: vis('btnArrange'), btnZoom: vis('btnZoom'),
      segCanvas: document.querySelector('.vs-seg[data-view="canvas"]').classList.contains('active'),
      segWrite: document.querySelector('.vs-seg[data-view="write"]').classList.contains('active')
    };
  })()`);
  await click('.vs-seg[data-view="write"]');
  const w = await evalJS(`(() => {
    var vis = function(id){ var e = document.getElementById(id); if(!e) return false; var r = e.getBoundingClientRect(); return !!(e.offsetParent !== null || r.height > 0) && r.height > 0; };
    return {
      bodyWrite: document.body.classList.contains('view-write'),
      deskDisplay: getComputedStyle(document.getElementById('writeDesk')).display,
      canvasDisplay: getComputedStyle(document.querySelector('.canvas')).display,
      btnArrange: vis('btnArrange'), btnZoom: vis('btnZoom'),
      segWrite: document.querySelector('.vs-seg[data-view="write"]').classList.contains('active')
    };
  })()`);
  t('W2 胶囊切换可用：点「画布」→ body.view-canvas / #writeDesk display:none / .canvas 显示 / 「整」「100%」可见；再点「写作」→ 回写作台（computedStyle + 几何真读）',
    c.bodyCanvas && c.deskDisplay === 'none' && c.canvasDisplay !== 'none' && c.btnArrange && c.btnZoom && c.segCanvas && !c.segWrite
    && w.bodyWrite && w.deskDisplay !== 'none' && w.canvasDisplay === 'none' && !w.btnArrange && !w.btnZoom && w.segWrite,
    `画布态：bodyCan=${c.bodyCanvas} deskDisp=${c.deskDisplay} canvasDisp=${c.canvasDisplay} 整=${c.btnArrange} 100%=${c.btnZoom} 高亮canvas=${c.segCanvas}/write=${c.segWrite}；写作态：bodyWrite=${w.bodyWrite} deskDisp=${w.deskDisplay} canvasDisp=${w.canvasDisplay} 整=${w.btnArrange} 100%=${w.btnZoom} 高亮write=${w.segWrite}`);
}

/* ══════════════════════════ W3 · 同源实时同步（P0-4，双向）══════════════════════════
   写作台真输入唯一标记 → 切画布读该块 DOM '.block-text'.value；画布真输入 → 切写作台读左栏摘要。 */
{
  await setup([{ id: 'A', text: 'AAA' }, { id: 'B', text: 'BBB' }, { id: 'C', text: 'CCC' }]);
  const MK1 = 'WD_MARK_1';
  await evalJS('wdSelect(1)');                       /* 选第 2 条（B） */
  await evalJS('focusDeskEditor()');
  await type(MK1);
  const afterWd = await evalJS("(()=>{ var b=null; state.blocks.forEach(function(x){ if(x.id==='B') b=x; }); return { stateText: b?b.text:null, taValue: hostDesk.el('ta').value }; })()");
  await click('.vs-seg[data-view="canvas"]');
  const afterSwipeCanvas = await evalJS("(()=>{ var t=document.querySelector('.block[data-id=\"B\"] .block-text'); return { domValue: t?t.value:null }; })()");
  /* 反向：画布内真输入 → 切写作台读摘要 */
  const MK2 = 'CV_MARK_2';
  await evalJS("(()=>{ var t=document.querySelector('.block[data-id=\"A\"] .block-text'); if(t){ t.focus(); t.selectionStart=t.selectionEnd=t.value.length; } return t?t.value:null; })()");
  await type(MK2);
  const afterCv = await evalJS("(()=>{ var b=null; state.blocks.forEach(function(x){ if(x.id==='A') b=x; }); return { stateText: b?b.text:null }; })()");
  await click('.vs-seg[data-view="write"]');
  const writeSum = await evalJS("(()=>{ var r=document.querySelector('.wd-item[data-id=\"A\"] .wd-sum'); return { sum: r?r.textContent:null }; })()");
  t('W3 同源实时同步（双向）：写作台输入标记 → 画布对应块 .block-text.value 一致；画布输入标记 → 切回写作台左栏该条摘要一致（真读 DOM 值与 state）',
    afterWd.stateText === 'BBB' + MK1 && afterWd.taValue === 'BBB' + MK1
    && afterSwipeCanvas.domValue === 'BBB' + MK1
    && afterCv.stateText === 'AAA' + MK2
    && writeSum.sum === 'AAA' + MK2,
    `写作台输入后 state=${JSON.stringify(afterWd.stateText)} / ta=${JSON.stringify(afterWd.taValue)}；切画布后 DOM= ${JSON.stringify(afterSwipeCanvas.domValue)}；画布输入后 state=${JSON.stringify(afterCv.stateText)}；切回写作台摘要=${JSON.stringify(writeSum.sum)}`);
}

/* ══════════════════════════ W4 · 拖序真改 order（P0-6）══════════════════════════
   wdMove(from,to)（= drop 处理器调用的同一 wdReorder）→ 真读 state.blocks 的 order + 左栏 DOM 条目序 + localStorage。 */
{
  await setup([{ id: 'A', text: 'AA', order: 0 }, { id: 'B', text: 'BB', order: 1 }, { id: 'C', text: 'CC', order: 2 }, { id: 'D', text: 'DD', order: 3 }]);
  const before = await evalJS("(()=>{ var m={}; state.blocks.forEach(function(b){m[b.id]=b.order;}); return m; })()");
  await evalJS('wdMove(3, 1)');                      /* 把第 4 条 D 移到第 2 位 */
  const w4 = await evalJS(`(() => {
    var m = {}; state.blocks.forEach(function(b){ m[b.id] = b.order; });
    var rows = [].slice.call(document.querySelectorAll('#wdList .wd-item'));
    var domSeq = rows.map(function(r){ return r.dataset.id; });
    var domNo = rows.map(function(r){ return r.querySelector('.wd-no').textContent; });
    var raw = null; try { raw = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) {}
    var pm = {}; if (raw && raw.blocks) raw.blocks.forEach(function(b){ pm[b.id] = b.order; });
    return { orderMap: m, domSeq: domSeq, domNo: domNo, persisted: pm };
  })()`);
  const orderSeq = Object.keys(w4.orderMap).sort((a, b) => w4.orderMap[a] - w4.orderMap[b]);
  t('W4 拖序真改 order：wdMove(3,1) 后 state.blocks 的 order 重排且归一 0..N-1 / 左栏 DOM 条目序与序号重排 / localStorage 已落盘（真读三处）',
    eq(w4.orderMap, { A: 0, B: 2, C: 3, D: 1 })
    && eq(orderSeq, ['A', 'D', 'B', 'C'])
    && eq(w4.domSeq, ['A', 'D', 'B', 'C'])
    && eq(w4.domNo, ['1', '2', '3', '4'])
    && eq(w4.persisted, { A: 0, B: 2, C: 3, D: 1 }),
    `初始=${JSON.stringify(before)} → order=${JSON.stringify(w4.orderMap)}（按序=${JSON.stringify(orderSeq)}）；DOM序=${JSON.stringify(w4.domSeq)} 序号=${JSON.stringify(w4.domNo)}；localStorage order=${JSON.stringify(w4.persisted)}`);
}

/* ══════════════════════════ W5 · 写作台内门控（P0-11，4 项 + 画布对照组）══════════════════════════ */

/* W5a 方向键：写作台内按 → pan 不变；画布视图内同键 pan 确实移动（对照组，防真空） */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
  await blur();
  const pw0 = await pan();
  await keyPress('ArrowRight', 0, 350);
  await sleep(220);
  const pw1 = await pan();
  const writeStill = pw0.x === pw1.x && pw0.y === pw1.y;
  await evalJS("setView('canvas')"); await sleep(260); await blur();
  const pc0 = await pan();
  await keyPress('ArrowRight', 0, 350);
  await sleep(260);
  const pc1 = await pan();
  const canvasMoved = Math.abs(pc1.x - pc0.x) > 1 || Math.abs(pc1.y - pc0.y) > 1;
  await evalJS("setView('write')"); await sleep(200);
  t('W5a 方向键门控（P0-11）：写作台内按 → state.pan 前后不变；画布视图内同键 pan 确实移动（对照组）',
    writeStill && canvasMoved,
    `写作台 pan ${JSON.stringify(pw0)}→${JSON.stringify(pw1)}（不变=${writeStill}）；画布对照 ${JSON.stringify(pc0)}→${JSON.stringify(pc1)}（移动=${canvasMoved}）`);
}

/* W5b 空格：写作台内按住 Space → pan 不变 且 spacePan 恒 false；画布视图内 Space 会置 spacePan=true（对照组） */
{
  await setup([{ id: 'a', text: 'A' }]);
  await blur();
  const pw0 = await pan();
  await send('Input.dispatchKeyEvent', { ...keyParams(' ', 0), type: 'keyDown' });
  await sleep(180);
  const wSpace = await evalJS("({ spacePan: spacePan, cls: document.body.classList.contains('space-pan') })");
  const pw1 = await pan();
  await send('Input.dispatchKeyEvent', { ...keyParams(' ', 0), type: 'keyUp' });
  await sleep(120);
  const writeOff = wSpace.spacePan === false && wSpace.cls === false && pw0.x === pw1.x && pw0.y === pw1.y;
  await evalJS("setView('canvas')"); await sleep(260); await blur();
  await send('Input.dispatchKeyEvent', { ...keyParams(' ', 0), type: 'keyDown' });
  await sleep(180);
  const cSpace = await evalJS("({ spacePan: spacePan, cls: document.body.classList.contains('space-pan') })");
  await send('Input.dispatchKeyEvent', { ...keyParams(' ', 0), type: 'keyUp' });
  await sleep(120);
  const canvasOn = cSpace.spacePan === true && cSpace.cls === true;
  await evalJS("setView('write')"); await sleep(200);
  t('W5b 空格门控（P0-11）：写作台内按住 Space → state.pan 不变且 spacePan=false / body 无 space-pan；画布视图内 Space 会置 spacePan=true（对照组）',
    writeOff && canvasOn,
    `写作台 spacePan=${wSpace.spacePan} cls=${wSpace.cls}；pan ${JSON.stringify(pw0)}→${JSON.stringify(pw1)}；画布对照 spacePan=${cSpace.spacePan} cls=${cSpace.cls}`);
}

/* W5c Ctrl+滚轮：写作台内（直接对画布元素派发 ctrl+wheel + 真实 CDP 滚轮）→ zoom 不变；画布视图内同事件 → zoom 变（对照组） */
{
  await setup([{ id: 'a', text: 'A' }]);
  const zW0 = await evalJS('state.zoom');
  const zWr = await evalJS("(()=>{ var c=document.getElementById('canvas'); if(!c) return null; c.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,clientX:800,clientY:500,bubbles:true,cancelable:true})); return state.zoom; })()");
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 960, y: 540, deltaX: 0, deltaY: -120, modifiers: MOD.ctrl });
  await sleep(160);
  const zW1 = await evalJS('state.zoom');
  const writeStill = zWr === zW0 && zW1 === zW0;
  await evalJS("setView('canvas')"); await sleep(260);
  const zC0 = await evalJS('state.zoom');
  const zCr = await evalJS("(()=>{ var c=document.getElementById('canvas'); c.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,clientX:800,clientY:500,bubbles:true,cancelable:true})); return state.zoom; })()");
  await sleep(140);
  const canvasChanged = zCr !== zC0;
  await evalJS("setView('write')"); await sleep(200);
  t('W5c Ctrl+滚轮门控（P0-11）：写作台内对画布派发 ctrl+wheel 及真实 CDP 滚轮 → state.zoom 不变；画布视图内同事件 → zoom 确实改变（对照组）',
    writeStill && canvasChanged,
    `写作台 zoom ${zW0}→(${zWr},${zW1})（不变=${writeStill}）；画布对照 zoom ${zC0}→${zCr}（改变=${canvasChanged}）`);
}

/* W5d 双击空白：写作台内（直接对画布派发 dblclick + 真实双击）→ state.blocks.length 不变；画布视图内同事件 → +1（对照组） */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
  const nW0 = await evalJS('state.blocks.length');
  const nWr = await evalJS("(()=>{ var c=document.getElementById('canvas'); c.dispatchEvent(new MouseEvent('dblclick',{clientX:1500,clientY:850,bubbles:true,cancelable:true})); return state.blocks.length; })()");
  await dblclick(960, 540);
  const nW1 = await evalJS('state.blocks.length');
  const writeStill = nWr === nW0 && nW1 === nW0;
  await evalJS("setView('canvas')"); await sleep(260);
  const nC0 = await evalJS('state.blocks.length');
  await evalJS("(()=>{ var c=document.getElementById('canvas'); c.dispatchEvent(new MouseEvent('dblclick',{clientX:1500,clientY:850,bubbles:true,cancelable:true})); })()");
  await sleep(160);
  const nC1 = await evalJS('state.blocks.length');
  await evalJS("setView('write')"); await sleep(200);
  const canvasAdded = nC1 === nC0 + 1;
  t('W5d 双击空白门控（P0-11）：写作台内对画布派发 dblclick 及真实双击 → state.blocks.length 不变；画布视图内同事件 → 块数 +1（对照组）',
    writeStill && canvasAdded,
    `写作台 blocks ${nW0}→(${nWr},${nW1})（不变=${writeStill}）；画布对照 ${nC0}→${nC1}（+1=${canvasAdded}）`);
}

/* ══════════════════════════ W6 · 空态（P0-12）══════════════════════════
   真读：左栏空态文案 + 右栏编辑器 disabled / placeholder / value；并验证「空→新建→删空→再新建」自洽。 */
{
  await setup([]);
  const empty = await evalJS(`(() => {
    var em = document.querySelector('#wdList .wd-empty');
    var ta = hostDesk.el('ta');
    return {
      emptyText: em ? em.textContent : null,
      pos: (document.getElementById('wdPos') || {}).textContent,
      wdCount: (document.getElementById('wdCount') || {}).textContent,
      viewCount: (document.getElementById('viewCount') || {}).textContent,
      taDisabled: ta ? ta.disabled : null,
      taValue: ta ? ta.value : null,
      taPlaceholder: ta ? ta.placeholder : null
    };
  })()`);
  await evalJS('wdNew()');
  const afterNew = await evalJS("({ len: state.blocks.length, taDisabled: hostDesk.el('ta').disabled, pos: document.getElementById('wdPos').textContent })");
  await evalJS('wdDel(0)');
  const afterDel = await evalJS("({ len: state.blocks.length, emptyAgain: !!document.querySelector('#wdList .wd-empty'), taDisabled: hostDesk.el('ta').disabled })");
  await evalJS('wdNew()');
  const afterNew2 = await evalJS("({ len: state.blocks.length, taDisabled: hostDesk.el('ta').disabled })");
  t('W6 空态（P0-12）：无块时左栏出现空态引导文案、右栏编辑器不可编辑（disabled=true 真读）+ placeholder 提示；「空→新建→删空→再新建」状态自洽',
    !!empty.emptyText && empty.emptyText.indexOf('还没有分镜') >= 0 && empty.emptyText.indexOf('新建分镜') >= 0
    && empty.taDisabled === true && empty.taValue === '' && !!empty.taPlaceholder
    && empty.wdCount === '0' && empty.viewCount === '分镜 0 条'
    && afterNew.len === 1 && afterNew.taDisabled === false
    && afterDel.len === 0 && afterDel.emptyAgain && afterDel.taDisabled === true
    && afterNew2.len === 1 && afterNew2.taDisabled === false,
    `空态文案=${JSON.stringify(empty.emptyText)}；pos=${JSON.stringify(empty.pos)}；wdCount=${empty.wdCount}；viewCount=${empty.viewCount}；ta disabled=${empty.taDisabled} value=${JSON.stringify(empty.taValue)} placeholder=${JSON.stringify(empty.taPlaceholder)}；新建→len=${afterNew.len}/disabled=${afterNew.taDisabled}；删空→len=${afterDel.len}/empty=${afterDel.emptyAgain}/disabled=${afterDel.taDisabled}；再新建→len=${afterNew2.len}/disabled=${afterNew2.taDisabled}`);
}

/* ══════════════════════════ W7 · 图片块不入大纲（P0-13）══════════════════════════
   真读：左栏条目数 = 文本块数（不含图片）、计数文案不含图片；选中失效 → 兜底落第一条文本块（右栏有字可编辑）。 */
{
  await setup([
    { id: 'T1', text: 'X1' },
    { id: 'IMG', type: 'image', text: '' },
    { id: 'T2', text: 'X2' },
    { id: 'T3', text: 'X3' }
  ]);
  const before = await evalJS(`(() => {
    var rows = [].slice.call(document.querySelectorAll('#wdList .wd-item'));
    return { itemCount: rows.length, ids: rows.map(function(r){ return r.dataset.id; }),
             wdCount: (document.getElementById('wdCount') || {}).textContent,
             viewCount: (document.getElementById('viewCount') || {}).textContent };
  })()`);
  await evalJS("wdSelId = 'IMG'; renderWrite();");
  const after = await evalJS("(() => { var ta = hostDesk.el('ta'); return { selId: wdSelId, taValue: ta.value, taDisabled: ta.disabled }; })()");
  t('W7 图片块不入大纲（P0-13）：注入 type:image 后左栏条目数 = 文本块数（=3，不含图片）、计数文案不含图片；把选中项置为图片块 → 兜底落到第一条文本块且右栏有字可编辑',
    before.itemCount === 3 && eq(before.ids, ['T1', 'T2', 'T3'])
    && before.wdCount === '3' && before.viewCount === '分镜 3 条'
    && after.selId === 'T1' && after.taValue === 'X1' && after.taDisabled === false,
    `左栏条目=${before.itemCount} ids=${JSON.stringify(before.ids)}；wdCount=${before.wdCount}；viewCount=${before.viewCount}；选中图片块后 selId=${after.selId} taValue=${JSON.stringify(after.taValue)} disabled=${after.taDisabled}`);
}

/* ══════════════════════════ W8 · 迁移 v14→v17 零丢失 + order 兜底（P0-14）══════════════════════════
   直接对 migrate() 喂 v14 老数据（≥3 块；含同 y 同 x 的块以验全序稳定；含 splice/templates/cmpl）→ 真读返回对象。 */
{
  const V14 = {
    app: 'storyboard-prompt-panel', version: 14, zoom: 1.5, title: '老档',
    pan: { x: 33, y: -44 },
    blocks: [
      { id: 'p0', text: '零', x: 100, y: 50 },
      { id: 'p1', text: '一', x: 20, y: 20 },
      { id: 'p2', text: '二', x: 200, y: 20 },
      { id: 'p3', text: '三', x: 20, y: 20 }        /* 与 p1 同 y 同 x → 全序须由数组下标兜底 */
    ],
    splice: { items: [{ type: 'block', id: 'p1' }, { type: 'unit', id: 'u1', name: 'U', prefixes: ['pf'], suffixes: ['sf'], blockIds: ['p2'] }], activeUnitId: 'u1' },
    templates: [{ id: 't1', units: [{ id: 'tu1', prefixes: ['a'], suffixes: ['b'] }] }],
    cmpl: { v: 1, items: [{ key: 'k1', group: 'g', label: 'L', note: '', body: 'B', block: false, src: 'user' }], gorder: ['g'] },
    collapsed: false
  };
  const w8 = await evalJS(`(() => {
    var m = migrate(${JSON.stringify(V14)});
    return {
      version: m.version,
      orderMap: m.blocks.map(function(b){ return [b.id, b.order]; }),
      texts: m.blocks.map(function(b){ return [b.id, b.text]; }),
      orders: m.blocks.map(function(b){ return b.order; }),
      spliceLen: m.splice.items.length,
      splice0: m.splice.items[0],
      spliceUnit: m.splice.items[1],
      tplLen: m.templates.length,
      tplU0: (m.templates[0] && m.templates[0].units[0]) || null,
      cmplLen: m.cmpl.items ? m.cmpl.items.length : null,
      cmpl0: m.cmpl.items ? m.cmpl.items[0] : null,
      pan: m.pan, zoom: m.zoom, title: m.title
    };
  })()`);
  t('W8 迁移 v14→v17 零丢失 + order 兜底（P0-14）：version=17；块/拼接/模板/片段库逐条仍在；order=原画布 y→x 序（含同 y 同 x 由下标兜底）且为连续 0..N-1 无重复',
    w8.version === 17
    && eq(w8.orderMap, [['p1', 0], ['p3', 1], ['p2', 2], ['p0', 3]])
    && eq(w8.texts, [['p1', '一'], ['p3', '三'], ['p2', '二'], ['p0', '零']])
    && eq(w8.orders, [0, 1, 2, 3])
    && w8.spliceLen === 2 && w8.splice0 && w8.splice0.type === 'block' && w8.splice0.id === 'p1'
    && w8.spliceUnit && w8.spliceUnit.type === 'unit' && w8.spliceUnit.name === 'U'
    && eq(w8.spliceUnit.prefixes, ['pf']) && eq(w8.spliceUnit.suffixes, ['sf']) && eq(w8.spliceUnit.blockIds, ['p2'])
    && w8.tplLen === 1 && w8.tplU0 && eq(w8.tplU0.prefixes, ['a']) && eq(w8.tplU0.suffixes, ['b'])
    && w8.cmplLen === 1 && w8.cmpl0 && w8.cmpl0.key === 'k1' && w8.cmpl0.body === 'B' && w8.cmpl0.src === 'user'
    && eq(w8.pan, { x: 33, y: -44 }) && w8.zoom === 1.5 && w8.title === '老档',
    `version=${w8.version}；order序=${JSON.stringify(w8.orderMap)}；文本=${JSON.stringify(w8.texts)}；splice=${w8.spliceLen}（[0]=${JSON.stringify(w8.splice0)}，[1]=${JSON.stringify(w8.spliceUnit)}）；templates=${w8.tplLen}（u0=${JSON.stringify(w8.tplU0)}）；cmpl=${w8.cmplLen}（${JSON.stringify(w8.cmpl0)}）；pan=${JSON.stringify(w8.pan)} zoom=${w8.zoom} title=${w8.title}`);
}

/* ══════════════════════════ W9 · 实时写回不丢字（P0-9）══════════════════════════
   改字后**不点任何按钮**立即 flush() → 读 localStorage + migrate 回读；再**真实 reload**（暂时摘除清 LS 脚本）→ 读回内容仍在。 */
{
  await setup([{ id: 'e1', text: '' }]);
  await evalJS('wdSelect(0)');
  await evalJS('focusDeskEditor()');
  await type('PERSIST_MARK_9');
  const flushed = await evalJS("(() => { flush(); var raw = localStorage.getItem(LS_KEY); var m = migrate(JSON.parse(raw)); return { rawText: m.blocks[0] ? m.blocks[0].text : null, version: m.version }; })()");
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  const after = await evalJS("({ text: state.blocks[0] ? state.blocks[0].text : null, taValue: (hostDesk.el('ta') || {}).value, version: state.version, view: activeView })");
  t('W9 实时写回不丢字（P0-9）：输入后不点任何按钮 → flush() 后 localStorage/migrate 回读含标记；真实 reload 后内容仍在（无「未提交」态）',
    flushed.rawText === 'PERSIST_MARK_9' && flushed.version === 17
    && after.text === 'PERSIST_MARK_9' && after.taValue === 'PERSIST_MARK_9' && after.version === 17,
    `flush 后 localStorage.migrate 文本=${JSON.stringify(flushed.rawText)}（version=${flushed.version}）；reload 后 state 文本=${JSON.stringify(after.text)} / #wdInput=${JSON.stringify(after.taValue)}（version=${after.version}, view=${after.view}）`);
}

/* ══════════════════════════ W10 · 写作台快捷键入口（P0-7 / P0-10）══════════════════════════ */

/* W10a Alt+Enter 新建（在当前条之后） */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]);
  await blur();
  const len0 = await evalJS('state.blocks.length');
  await keyPress('Enter', MOD.alt);
  const w10a = await evalJS("(() => { var seq = state.blocks.slice().sort(function(x,y){ return x.order - y.order; }).map(function(b){ return b.id; }); var sel = null; state.blocks.forEach(function(b){ if(b.id === wdSelId) sel = b; }); return { len: state.blocks.length, seq: seq, selId: wdSelId, selText: sel ? sel.text : null }; })()");
  t('W10a Alt+Enter 新建（P0-7/P0-10）：块数 +1，新块插在当前条（第 1 条 a）之后且为当前选中、可直接开写（真读 order 序 + wdSelId）',
    w10a.len === len0 + 1 && w10a.seq[0] === 'a' && w10a.seq[1] === w10a.selId && w10a.selText === '' && w10a.selId !== 'a',
    `len ${len0}→${w10a.len}；order 序=${JSON.stringify(w10a.seq)}；selId=${w10a.selId} selText=${JSON.stringify(w10a.selText)}`);
}

/* W10b Alt+Backspace 删除（当前条） */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]);
  await evalJS('wdSelect(1)');
  await blur();
  const len0 = await evalJS('state.blocks.length');
  await keyPress('Backspace', MOD.alt);
  const w10b = await evalJS("(() => { var seq = state.blocks.slice().sort(function(x,y){ return x.order - y.order; }).map(function(b){ return b.id; }); return { len: state.blocks.length, seq: seq, selId: wdSelId }; })()");
  t('W10b Alt+Backspace 删除（P0-7/P0-10）：块数 -1，被删当前条（第 2 条 b）消失、选中落到其后一条（c）（真读 order 序 + wdSelId）',
    w10b.len === len0 - 1 && eq(w10b.seq, ['a', 'c']) && w10b.selId === 'c',
    `len ${len0}→${w10b.len}；order 序=${JSON.stringify(w10b.seq)}；selId=${w10b.selId}`);
}

/* W10c Alt+↑/↓ 切换当前条 */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]);
  await evalJS('wdSelect(0)');
  await blur();
  await keyPress('ArrowDown', MOD.alt);
  const s1 = await evalJS('wdSelId');
  await keyPress('ArrowUp', MOD.alt);
  const s2 = await evalJS('wdSelId');
  t('W10c Alt+↑/↓ 切换当前条（P0-10）：Alt+↓ 选中由 a→b，Alt+↑ 由 b→a（真读 wdSelId）',
    s1 === 'b' && s2 === 'a',
    `Alt+↓ 后 selId=${s1}；Alt+↑ 后 selId=${s2}`);
}

/* W10d Alt+Shift+↑/↓ 移序（改 order，不动画布坐标） */
{
  await setup([{ id: 'a', text: 'A', order: 0 }, { id: 'b', text: 'B', order: 1 }, { id: 'c', text: 'C', order: 2 }]);
  await evalJS('wdSelect(0)');
  await blur();
  const xyBefore = await evalJS("(() => { var b=null; state.blocks.forEach(function(x){ if(x.id==='a') b=x; }); return { x: b.x, y: b.y }; })()");
  await keyPress('ArrowDown', MOD.alt | MOD.shift);
  const w10d = await evalJS("(() => { var m={}, xy={}; state.blocks.forEach(function(b){ m[b.id]=b.order; if(b.id==='a') xy={x:b.x,y:b.y}; }); return { orderMap: m, xy: xy }; })()");
  t('W10d Alt+Shift+↓ 移序（P0-7/P0-10）：a 下移一位（order a=1,b=0），且画布 x/y 完全不变（顺序/位置解耦）',
    w10d.orderMap.a === 1 && w10d.orderMap.b === 0 && w10d.orderMap.c === 2
    && w10d.xy.x === xyBefore.x && w10d.xy.y === xyBefore.y,
    `order=${JSON.stringify(w10d.orderMap)}；a 的 x/y ${JSON.stringify(xyBefore)}→${JSON.stringify(w10d.xy)}`);
}

/* ══════════════════════════ W11 · 锁定「隐式契约」：全局单值查询须命中弹窗宿主（处置建议 A）══════════════════════════
   背景：写作台复用 .blk-edit/.blk-hl 等排版类；既有套件存在全局单值查询 document.querySelector('.blk-hl')。
   若写作台排在 #blkMask **之前**，该查询会命中隐藏的写作台（rect 全 0）→ 坐标类断言假红。
   本断言把「#writeDesk 必须位于 #blkMask 之后」这一**实现顺序约定**显式锁定，防未来静默破约。 */
{
  const w11 = await evalJS(`(() => {
    var firstHl = document.querySelector('.blk-hl');
    var firstEdit = document.querySelector('.blk-edit');
    var blkMask = document.getElementById('blkMask');
    var writeDesk = document.getElementById('writeDesk');
    var hp = hostPopup.el('pre'), hd = hostDesk.el('pre');
    var before = (blkMask && writeDesk) ? ((blkMask.compareDocumentPosition(writeDesk) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) : null;
    return {
      firstHlInMask: !!(firstHl && firstHl.closest && firstHl.closest('#blkMask')),
      firstEditInMask: !!(firstEdit && firstEdit.closest && firstEdit.closest('#blkMask')),
      hostPopupPreIsFirst: firstHl === hp,
      deskPreDistinct: !!(hd && hd !== hp),
      deskPreInDesk: !!(hd && hd.closest && hd.closest('#writeDesk')),
      popupPreInMask: !!(hp && hp.closest && hp.closest('#blkMask')),
      maskBeforeDesk: before
    };
  })()`);
  t('W11 隐式契约锁定（处置建议 A）：document.querySelector(".blk-hl")/.blk-edit 必须解析到 #blkMask 内（弹窗宿主），hostPopup.el("pre") 即该元素，hostDesk.el("pre") 为 #writeDesk 内另一份；#blkMask 在 #writeDesk 之前',
    w11.firstHlInMask && w11.firstEditInMask && w11.hostPopupPreIsFirst
    && w11.deskPreDistinct && w11.deskPreInDesk && w11.popupPreInMask && w11.maskBeforeDesk === true,
    `querySelector('.blk-hl')∈#blkMask=${w11.firstHlInMask}；.blk-edit∈#blkMask=${w11.firstEditInMask}；== hostPopup.pre=${w11.hostPopupPreIsFirst}；hostDesk.pre 独立=${w11.deskPreDistinct} 且∈#writeDesk=${w11.deskPreInDesk}；hostPopup.pre∈#blkMask=${w11.popupPreInMask}；#blkMask 先于 #writeDesk=${w11.maskBeforeDesk}`);
}

/* ══════════════════════════ W12 · order 边界：normalizeOrder() 收敛（设计 §4.3）══════════════════════════
   真读 normalizeOrder() 的返回值 + 收敛后的 order 数组（缺 / 重复 / 非连续 / 负数 / 非整数 / 已紧致）。 */
{
  const w12 = await evalJS(`(() => {
    function run(orders){
      state.blocks = orders.map(function(o, i){ var b = { id: 'b' + i, text: '', x: i * 10, y: i * 10 }; if(o !== undefined) b.order = o; return b; });
      var changed = normalizeOrder();
      return { changed: changed, orders: state.blocks.map(function(b){ return b.order; }) };
    }
    return {
      missing: run([undefined, undefined, undefined]),
      dup: run([1, 1, 1]),
      gap: run([5, 9, 100]),
      neg: run([-3, 2]),
      frac: run([0.5, 1]),
      sorted: run([0, 1, 2])
    };
  })()`);
  t('W12 order 边界收敛（设计 §4.3）：缺/重复/非连续/负数/非整数 order 经 normalizeOrder() 一律收敛为连续 0..N-1（返回 changed=true）；已紧致返回 false',
    w12.missing.changed === true && eq(w12.missing.orders, [0, 1, 2])
    && w12.dup.changed === true && eq(w12.dup.orders, [0, 1, 2])
    && w12.gap.changed === true && eq(w12.gap.orders, [0, 1, 2])
    && w12.neg.changed === true && eq(w12.neg.orders, [1, 0])
    && w12.frac.changed === true && eq(w12.frac.orders, [1, 0])
    && w12.sorted.changed === false && eq(w12.sorted.orders, [0, 1, 2]),
    `缺=${JSON.stringify(w12.missing)}；重复=${JSON.stringify(w12.dup)}；非连续=${JSON.stringify(w12.gap)}；负数=${JSON.stringify(w12.neg)}；非整数=${JSON.stringify(w12.frac)}；已紧致=${JSON.stringify(w12.sorted)}`);
}

/* ══════════════════════════ W13 · 同 y 同 x 全序稳定（设计 §4.2 保证 3）══════════════════════════
   3 块同 y 同 x：normalizeOrder 两次 / migrate 两次 → 结果序列一致且由数组下标定序。 */
{
  const w13 = await evalJS(`(() => {
    function mk(){ state.blocks = [{ id: 'a', text: '', x: 10, y: 10 }, { id: 'b', text: '', x: 10, y: 10 }, { id: 'c', text: '', x: 10, y: 10 }]; }
    function orderOf(){ return state.blocks.slice().sort(function(A, B){ return A.order - B.order; }).map(function(b){ return b.id; }); }
    mk(); normalizeOrder(); var s1 = orderOf();
    mk(); normalizeOrder(); var s2 = orderOf();
    mk(); normalizeOrder(); normalizeOrder(); var s3 = orderOf();
    var v = { app: 'storyboard-prompt-panel', version: 14, blocks: [{ id: 'x', text: '', x: 10, y: 10 }, { id: 'y', text: '', x: 10, y: 10 }, { id: 'z', text: '', x: 10, y: 10 }] };
    var m1 = migrate(v).blocks.map(function(b){ return b.id; });
    var m2 = migrate(v).blocks.map(function(b){ return b.id; });
    var mOrders = migrate(v).blocks.map(function(b){ return b.order; });
    return { s1: s1, s2: s2, s3: s3, m1: m1, m2: m2, mOrders: mOrders };
  })()`);
  t('W13 同 y 同 x 全序稳定（设计 §4.2 保证 3）：3 块同 y 同 x 时 normalizeOrder/migrate 多次运行结果**一致**且由数组下标定序；order 无重复',
    eq(w13.s1, ['a', 'b', 'c']) && eq(w13.s2, ['a', 'b', 'c']) && eq(w13.s3, ['a', 'b', 'c'])
    && eq(w13.m1, ['x', 'y', 'z']) && eq(w13.m2, ['x', 'y', 'z']) && eq(w13.mOrders, [0, 1, 2]),
    `normalizeOrder 三次=${JSON.stringify([w13.s1, w13.s2, w13.s3])}；migrate 两次=${JSON.stringify([w13.m1, w13.m2])} orders=${JSON.stringify(w13.mOrders)}`);
}

/* ══════════════════════════ W14 · 切换视图保留 pan/zoom（§4.3）══════════════════════════
   真读 state.pan/zoom（并读 board.style.transform 反证视角已应用）跨多次切换不变。 */
{
  await setup([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
  const pz0 = await evalJS("(() => { state.pan = { x: 123, y: -77 }; state.zoom = 1.7; applyPan(); return { px: state.pan.x, py: state.pan.y, z: state.zoom }; })()");
  await evalJS("setView('canvas')"); await sleep(260);
  const pz1 = await evalJS("({ px: state.pan.x, py: state.pan.y, z: state.zoom, transform: (document.getElementById('board') || {}).style ? document.getElementById('board').style.transform : null })");
  await evalJS("setView('write')"); await sleep(200);
  const pz2 = await evalJS("({ px: state.pan.x, py: state.pan.y, z: state.zoom })");
  await evalJS("setView('canvas')"); await sleep(220);
  const pz3 = await evalJS("({ px: state.pan.x, py: state.pan.y, z: state.zoom })");
  await evalJS("setView('write')"); await sleep(200);
  const ok = (o) => o.px === 123 && o.py === -77 && o.z === 1.7;
  t('W14 切换视图保留 pan/zoom（§4.3）：写作↔画布多次切换后 state.pan={123,-77} / state.zoom=1.7 原样保留（不归零），board transform 反映该视角',
    ok(pz0) && ok(pz1) && ok(pz2) && ok(pz3) && typeof pz1.transform === 'string' && pz1.transform.indexOf('123') >= 0 && pz1.transform.indexOf('-77') >= 0,
    `初始=${JSON.stringify(pz0)}；→画布=${JSON.stringify(pz1)}；→写作=${JSON.stringify(pz2)}；→画布=${JSON.stringify(pz3)}`);
}

/* ══════════════════════════ W15 · 超长文本摘要单行截断 + 字数完整（§5.2）══════════════════════════
   真读左栏 .wd-sum 文本长度/结尾 与 .wd-cnt 字数；空块显示「（空分镜）」灰字。 */
{
  const LONG = 'L'.repeat(100);
  await setup([{ id: 'L1', text: LONG }, { id: 'E1', text: '' }]);
  const w15 = await evalJS(`(() => {
    var sumL = document.querySelector('.wd-item[data-id="L1"] .wd-sum');
    var cntL = document.querySelector('.wd-item[data-id="L1"] .wd-cnt');
    var sumE = document.querySelector('.wd-item[data-id="E1"] .wd-sum');
    var cntE = document.querySelector('.wd-item[data-id="E1"] .wd-cnt');
    return {
      longSum: sumL ? sumL.textContent : null, longSumLen: sumL ? sumL.textContent.length : -1,
      longCnt: cntL ? cntL.textContent : null,
      emptySum: sumE ? sumE.textContent : null, emptyMuted: sumE ? sumE.classList.contains('wd-muted') : null,
      emptyCnt: cntE ? cntE.textContent : null
    };
  })()`);
  t('W15 超长文本摘要单行截断 + 字数完整（§5.2）：100 字条目摘要截断为 40 字 + …（长度 41），字数显示完整 100；空条目显示「（空分镜）」灰字、字数 0',
    w15.longSumLen === 41 && typeof w15.longSum === 'string' && w15.longSum.slice(-1) === '…' && w15.longSum.slice(0, 40) === LONG.slice(0, 40)
    && w15.longCnt === '100'
    && w15.emptySum === '（空分镜）' && w15.emptyMuted === true && w15.emptyCnt === '0',
    `长条目摘要=${JSON.stringify(w15.longSum)}（len=${w15.longSumLen}）字数=${w15.longCnt}；空条目摘要=${JSON.stringify(w15.emptySum)} muted=${w15.emptyMuted} 字数=${w15.emptyCnt}`);
}

const pass = R.filter((r) => r.pass).length;
console.log('=== W 组验收（真机 headless Edge + CDP）：界面切换 + 写作台（v7.15）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nW 组合计 ${pass}/${R.length}（默认视图/胶囊切换/同源同步/拖序 order/门控 ×4/空态/图片块/迁移 v14→v17/实时写回/快捷键 ×4/隐式契约锁定/order 边界/全序稳定/pan-zoom 保留/超长文本）`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
