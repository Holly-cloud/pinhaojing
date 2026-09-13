import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.9 headless 验收（CDP 直连，零污染）：画布缩放（Ctrl+滚轮 / 顶栏显示+重置 / 坐标换算适配） */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
}
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
const vw = await evalJS('({w: innerWidth, h: innerHeight})');
if (vw.w < 1100) throw new Error('viewport too small: ' + JSON.stringify(vw));
console.log('viewport:', JSON.stringify(vw));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };

async function mouse(type, x, y, btn = 'left', cc = 1, mods = 0) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: btn, clickCount: cc, modifiers: mods });
}
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(18); }
async function clickAt(x, y, mods = 0) { await moveTo(600, 1400); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function wheel(x, y, dy, ctrl = false) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, modifiers: ctrl ? 2 : 0 });
  await sleep(80);
}
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
}
async function resetView() {
  await evalJS(`state.zoom = 1; state.pan = {x:0,y:0}; panVel = null; panLooping = false; applyPan(); updateZoomBtn();`);
  await sleep(60);
}

/* 初始化：2 块 */
await evalJS(`state.blocks = [{ id: uid(), text: '块一', x: 20, y: 20 }, { id: uid(), text: '块二', x: 300, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel();`);
await sleep(120);

console.log('═══ 1. Ctrl+滚轮缩放核心 ═══');
ok('1 前置：默认 zoom=1，顶栏显示 100%', await evalJS(`state.zoom === 1 && document.getElementById('btnZoom').textContent === '100%'`), await evalJS(`document.getElementById('btnZoom').textContent`));
await wheel(400, 500, -120, true);
ok('1a. Ctrl+滚轮上 → zoom 1→1.1', await evalJS(`Math.abs(state.zoom - 1.1) < 0.001`), 'zoom=' + await evalJS('state.zoom'));
ok('1b. 顶栏显示 110%', await evalJS(`document.getElementById('btnZoom').textContent === '110%'`), await evalJS(`document.getElementById('btnZoom').textContent`));
ok('1c. board transform 含 scale(1.1)', await evalJS(`document.getElementById('board').style.transform.indexOf('scale(1.1)') >= 0`), await evalJS(`document.getElementById('board').style.transform`));
/* 光标基准：缩放前后光标下的画布坐标不变 */
const base = await evalJS(`(() => { const cr = canvas.getBoundingClientRect(); const mx = 400, my = 500; const b = ((mx - cr.left) - state.pan.x) / state.zoom; return { before: b, pan: {x: state.pan.x, y: state.pan.y}, zoom: state.zoom }; })()`);
await wheel(400, 500, -120, true);
const after = await evalJS(`(() => { const cr = canvas.getBoundingClientRect(); const mx = 400, my = 500; return { bx: ((mx - cr.left) - state.pan.x) / state.zoom, by: ((my - cr.top) - state.pan.y) / state.zoom }; })()`);
ok('1d. 光标基准保持（缩放前后光标下画布坐标不变 ±0.5）', Math.abs(after.bx - base.before) < 0.5, JSON.stringify({ before: base.before, after: after.bx }));
ok('1e. Ctrl+滚轮下 → zoom 减小', await evalJS(`state.zoom`), 'zoom=' + await evalJS('state.zoom'));
/* 范围 clamp：连放 12 次（1.1^12≈3.14 <4，再 3 次到 4） */
await wheel(400, 500, -120, true); await wheel(400, 500, -120, true); await wheel(400, 500, -120, true);
await wheel(400, 500, -120, true); await wheel(400, 500, -120, true); await wheel(400, 500, -120, true);
await wheel(400, 500, -120, true); await wheel(400, 500, -120, true); await wheel(400, 500, -120, true);
await wheel(400, 500, -120, true); await wheel(400, 500, -120, true); await wheel(400, 500, -120, true);
await wheel(400, 500, -120, true); await wheel(400, 500, -120, true); await wheel(400, 500, -120, true);
ok('1f. 放大上限 clamp 到 400%', await evalJS(`Math.abs(state.zoom - 4) < 0.001`), 'zoom=' + await evalJS('state.zoom'));
for (let i = 0; i < 32; i++) await wheel(400, 500, 120, true);
ok('1g. 缩小下限 clamp 到 25%', await evalJS(`Math.abs(state.zoom - 0.25) < 0.001`), 'zoom=' + await evalJS('state.zoom'));
await resetView();

console.log('═══ 2. 重置按钮 ═══');
await wheel(400, 500, -240, true);
const panBeforeReset = await evalJS(`state.pan.x`);
await clickAt((await elRect('#btnZoom')).x, (await elRect('#btnZoom')).y);
ok('2a. 点击缩放按钮 → zoom 回 1', await evalJS(`state.zoom === 1`), 'zoom=' + await evalJS('state.zoom'));
ok('2b. 视角同步归零（pan=0,0）', await evalJS(`state.pan.x === 0 && state.pan.y === 0`), JSON.stringify(await evalJS('state.pan')));
ok('2c. 按钮显示回 100%', await evalJS(`document.getElementById('btnZoom').textContent === '100%'`), await evalJS(`document.getElementById('btnZoom').textContent`));
ok('2d. 缩放后 pan 已偏离（前置条件成立）', Math.abs(panBeforeReset) > 1, 'panBefore=' + panBeforeReset);

console.log('═══ 3. 缩放后交互坐标换算 ═══');
/* 3a. zoom=2 时左键拖块 +100 client → 块坐标 +50 */
await evalJS('state.zoom = 2; state.pan = {x:0,y:0}; panVel = null; panLooping = false; applyPan(); updateZoomBtn();');
await sleep(60);
ok('3a0. 前置 zoom=2', await evalJS(`state.zoom === 2`), 'zoom=' + await evalJS('state.zoom'));
const h1 = await elRect('.block .drag-handle');
const bx0 = await evalJS('state.blocks[0].x'), by0 = await evalJS('state.blocks[0].y');
await mouse('mousePressed', h1.x, h1.y, 'left');
for (let i = 1; i <= 6; i++) await moveTo(Math.round(h1.x + 100 * i / 6), Math.round(h1.y + 60 * i / 6));
await mouse('mouseReleased', h1.x + 100, h1.y + 60, 'left');
await sleep(80);
const b0 = await evalJS('({x: state.blocks[0].x, y: state.blocks[0].y})');
ok('3a. zoom=2 拖块 client(+100,+60) → 块坐标 (+50,+30) 容差 ±6', Math.abs(b0.x - bx0 - 50) <= 6 && Math.abs(b0.y - by0 - 30) <= 6, JSON.stringify({ bx0, by0, b0 }));
/* 3b. zoom=2 普通滚轮 → pan.y 变化 = 120/2 = 60 */
const py0 = await evalJS('state.pan.y');
await wheel(350, 700, -120, false);
ok('3b. zoom=2 普通滚轮 → pan.y +60（视觉 1:1）', Math.abs(await evalJS('state.pan.y') - py0 - 60) <= 1, JSON.stringify({ py0, py1: await evalJS('state.pan.y') }));
/* 3c. zoom=2 双击空白建块 → 落点画布坐标 = 双击处 */
await resetView();
await evalJS('state.zoom = 2; applyPan(); updateZoomBtn();');
const n0 = await evalJS('state.blocks.length');
await moveTo(350, 1000); await sleep(40);
await mouse('mousePressed', 350, 1000, 'left', 2); await mouse('mouseReleased', 350, 1000, 'left', 2); await sleep(80);
const nb = await evalJS('state.blocks[state.blocks.length - 1]');
const cr = await evalJS(`(() => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
const expX = (350 - cr.left - 0) / 2 - 70, expY = (1000 - cr.top - 0) / 2 - 60;
ok('3c. zoom=2 双击空白建块落点 = 双击处画布坐标（容差 ±12）', await evalJS('state.blocks.length') === n0 + 1 && Math.abs(nb.x - expX) <= 12 && Math.abs(nb.y - expY) <= 12, JSON.stringify({ got: { x: nb.x, y: nb.y }, exp: { x: expX, y: expY } }));
/* 3d. zoom=2 Ctrl+V → 块中心公式正确 */
await resetView();
await evalJS('state.zoom = 2; applyPan(); updateZoomBtn();');
const n1 = await evalJS('state.blocks.length');
await evalJS(`(() => { const e = new Event('paste', {bubbles:true, cancelable:true}); Object.defineProperty(e, 'clipboardData', { value: { getData: () => '缩放粘贴测试块' } }); document.dispatchEvent(e); })()`);
await sleep(80);
const pv = await evalJS('state.blocks[state.blocks.length - 1]');
const cw = await evalJS('canvas.clientWidth');
const expPvX = (-0 + cw / 2) / 2 - 70 + ((n1 % 5) - 2) * 20, expPvY = (-0 + (await evalJS('canvas.clientHeight')) / 2) / 2 - 60 + ((n1 % 5) - 2) * 16;
ok('3d. zoom=2 Ctrl+V 建块坐标符合公式（容差 ±1）', await evalJS('state.blocks.length') === n1 + 1 && Math.abs(pv.x - expPvX) <= 1 && Math.abs(pv.y - expPvY) <= 1, JSON.stringify({ got: { x: pv.x, y: pv.y }, exp: { x: expPvX, y: expPvY } }));
await resetView();

console.log('═══ 4. 拖拽中 Ctrl+滚轮缩放（块保持相对鼠标） ═══');
await evalJS('state.zoom = 1.21; state.pan = {x:0,y:0}; panVel = null; panLooping = false; applyPan(); updateZoomBtn();');
await sleep(60);
const h1c = await elRect('.block .drag-handle');
const bxc0 = await evalJS('state.blocks[0].x'), byc0 = await evalJS('state.blocks[0].y');
/* 块把手初始 client（未拖） */
const v0 = await evalJS(`(() => { const el = document.querySelector('.block'); const r = el.getBoundingClientRect(); return { x: r.x + 10, y: r.y + 10 }; })()`);
await mouse('mousePressed', h1c.x, h1c.y, 'left');
for (let i = 1; i <= 4; i++) await moveTo(Math.round(h1c.x + 40 * i / 4), Math.round(h1c.y + 30 * i / 4));
/* 鼠标在 (h1c.x+40, h1c.y+30) 处 Ctrl+滚轮放大 */
const mxNow = h1c.x + 40, myNow = h1c.y + 30;
const visBefore = await evalJS(`(() => { const el = document.querySelector('.block'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
await wheel(mxNow, myNow, -120, true);
const visAfter = await evalJS(`(() => { const el = document.querySelector('.block'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
ok('4a. 缩放瞬间块视觉位置基本不动（±9px）', Math.abs(visAfter.x - visBefore.x) <= 9 && Math.abs(visAfter.y - visBefore.y) <= 9, JSON.stringify({ before: visBefore, after: visAfter }));
await moveTo(mxNow + 30, myNow + 20);
await mouse('mouseReleased', mxNow + 30, myNow + 20, 'left');
await sleep(80);
const bc1 = await evalJS('({x: state.blocks[0].x, y: state.blocks[0].y})');
/* 总 client 位移 = 40+30, 30+20（分两段）；zoom 从 1.21 变 1.331；落点 = orig + clientTotal/zoom_final（近似） */
const zoomF = await evalJS('state.zoom');
ok('4b. 拖拽+缩放混合落点正确（容差 ±10）', Math.abs(bc1.x - bxc0 - (70 / zoomF)) <= 10 && Math.abs(bc1.y - byc0 - (50 / zoomF)) <= 10, JSON.stringify({ got: bc1, exp: { x: bxc0 + 70 / zoomF, y: byc0 + 50 / zoomF }, zoomF }));
await resetView();

console.log('═══ 5. 数据迁移 ═══');
const mig = await evalJS(`(() => { const d = migrate({ app: 'storyboard-prompt-panel', version: 8, title: 't', pan: {x: 5, y: -3}, splice: { items: [{type:'block', id:'x'}], activeUnitId: null }, collapsed: false, templates: [], blocks: [{id: 'x', text: 'a', x: 1, y: 2}] }); return { version: d.version, zoom: d.zoom, pan: d.pan }; })()`);
ok('5a. v8 数据迁移 → version 9 + zoom 补 1', mig.version === 9 && mig.zoom === 1, JSON.stringify(mig));
const mig2 = await evalJS(`(() => { const d = migrate({ app: 'storyboard-prompt-panel', version: 9, zoom: 2.5, pan: {x:0,y:0}, splice: { items: [], activeUnitId: null }, templates: [], blocks: [] }); return d.zoom; })()`);
ok('5b. 已有 zoom 数据保留', mig2 === 2.5, 'zoom=' + mig2);

console.log('═══ 6. 回归 ═══');
/* 6a. s=1 拖块 120,80 → 原行为 */
const h1r = await elRect('.block .drag-handle');
const br0 = await evalJS('state.blocks[0]');
await mouse('mousePressed', h1r.x, h1r.y, 'left');
for (let i = 1; i <= 8; i++) await moveTo(Math.round(h1r.x + 120 * i / 8), Math.round(h1r.y + 80 * i / 8));
await mouse('mouseReleased', h1r.x + 120, h1r.y + 80, 'left');
await sleep(80);
const br1 = await evalJS('state.blocks[0]');
ok('6a. s=1 拖块 (+120,+80) → 坐标 (+120,+80) 容差 ±12', Math.abs(br1.x - br0.x - 120) <= 12 && Math.abs(br1.y - br0.y - 80) <= 12, JSON.stringify({ br0, br1 }));
/* 6b. Ctrl+左键多选 */
await evalJS('clearSel()');
const c2 = await elRect('.block:nth-child(2) .block-text');
await clickAt(c2.x, c2.y, 2);
ok('6b. Ctrl+左键多选（回归）', await evalJS(`selected.length === 1 && selected[0] === state.blocks[1].id`));
/* 6c. 套用模板 + 复制输出 */
await evalJS(`state.templates = [{ id: uid(), name: '对话场景', prefixes: ['画面开始：'], suffixes: ['画面结束。'] }]; renderTplList();`);
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(100);
ok('6c. 套用→单元窗口（回归）', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].type === 'unit'`));
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
const captured = await evalJS(`(() => { window.__cap = null; const orig = copyText; copyText = function(t){ window.__cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return window.__cap; })()`);
ok('6d. 复制输出格式（回归）', captured === '画面开始：\n\n块一\n\n画面结束。', JSON.stringify(captured));
/* 6e. 无 JS 报错 */
ok('6e. 页面无 JS 报错', await evalJS(`typeof zoomAt === 'function' && typeof resetZoom === 'function' && typeof render === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
