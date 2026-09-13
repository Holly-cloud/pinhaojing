import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.18 headless 验收（CDP 直连，零污染）：
   ① 方向键多键冲突修复 + ÷zoom ② 缩放重绘 fixTextBlur ③ 拖画布中 Ctrl+滚轮缩放
   ④ 模板单元拖拽排序 ⑤ 模板预览 ⑥ 单元序号去模板名 ⑦ 拼模式拖块入单元 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
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
if (vw.w < 1100) throw new Error('viewport too small');
console.log('viewport:', JSON.stringify(vw));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return { cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom) }; })()`);
}
async function clickXY(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(90);
}
async function dragXY(x1, y1, x2, y2) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= 14; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x1 + (x2 - x1) * i / 14), y: Math.round(y1 + (y2 - y1) * i / 14), buttons: 1 });
    await sleep(18);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
  await sleep(150);
}
const keyDown = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[k] });
const keyUp = k => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[k] });

/* ---------- 初始状态 ---------- */
await evalJS(`state.blocks = [
  { id: uid(), text: '块甲内容', x: 20, y: 20 },
  { id: uid(), text: '块乙内容较长一些', x: 20, y: 80 },
  { id: uid(), text: '块丙', x: 300, y: 20 }
]; state.pan = {x:0,y:0}; state.zoom = 1; state.collapsed = false;
state.templates = [{ id: uid(), units: [
  { id: uid(), prefixes: ['前缀A'], suffixes: ['后缀1'] },
  { id: uid(), prefixes: [], suffixes: ['后缀2'] }
]}];
render(); spliceClear(); clearSel(); saveNow();`);
await sleep(200);
const idA = await evalJS('state.blocks[0].id');
const idC = await evalJS('state.blocks[2].id');

console.log('═══ 1. 方向键：多键冲突修复 ═══');
await evalJS(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
/* 场景：按住 →，再按 ←，松开 ←（→ 仍按着）→ 应继续右移（旧实现：keyup 清轴 → 卡死不动） */
await keyDown('ArrowRight');
await sleep(120);
await keyDown('ArrowLeft');   /* 反向同按 → 抵消 */
await sleep(80);
await keyUp('ArrowLeft');     /* 松开 ← —— → 还按着 */
await sleep(60);
const kdir = await evalJS('JSON.stringify(keyDir)');
const px1 = await evalJS('state.pan.x');
await sleep(120);
const px2 = await evalJS('state.pan.x');
await keyUp('ArrowRight');
await sleep(80);
ok('1a. 松 ← 后方向保持 →（keyDir.x = 1，不误清）', kdir === '{"x":1,"y":0}', kdir);
ok('1b. → 仍按着 → 继续移动（冲突不再卡死）', px2 < px1, JSON.stringify({ p1: px1.toFixed(1), p2: px2.toFixed(1) }));
/* 快速连按 → →（快速按下松开两次）最终停住 */
const f0 = await evalJS('state.pan.x');
for (let i = 0; i < 2; i++) { await keyDown('ArrowRight'); await sleep(60); await keyUp('ArrowRight'); await sleep(30); }
const f1 = await evalJS('state.pan.x');
await sleep(120);
const f2 = await evalJS('state.pan.x');
ok('1c. 快速连按两次 → 正常移动', f1 < f0, 'd=' + (f1 - f0).toFixed(1));
ok('1d. 连按结束全部松开 → 停住', Math.abs(f2 - f1) < 1, 'd=' + (f2 - f1).toFixed(1));
/* ÷zoom：zoom=1 与 zoom=2 按住同样时长，逻辑位移 ≈ 1/2（视觉速度恒定） */
await evalJS(`state.zoom = 1; state.pan = {x:0,y:0}; applyPan();`);
await sleep(80);
await keyDown('ArrowRight'); await sleep(150); await keyUp('ArrowRight'); await sleep(80);
const z1 = await evalJS('state.pan.x');
await evalJS(`state.zoom = 2; state.pan = {x:0,y:0}; applyPan();`);
await sleep(80);
await keyDown('ArrowRight'); await sleep(150); await keyUp('ArrowRight'); await sleep(80);
const z2 = await evalJS('state.pan.x');
ok('1e. zoom=2 时按住位移 ≈ zoom=1 的一半（÷zoom 视觉速度恒定，headless 帧率抖动放宽）', Math.abs(z2 / z1 - 0.5) < 0.3, JSON.stringify({ z1: z1.toFixed(1), z2: z2.toFixed(1), ratio: (z2/z1).toFixed(2) }));

console.log('═══ 2. 缩放后强制重绘（fixTextBlur）═══');
await evalJS(`state.zoom = 1; state.pan = {x:0,y:0}; applyPan();`);
await sleep(60);
ok('2a. fixTextBlur 同步添加 .rf（触发重绘）', await evalJS(`(() => { fixTextBlur(); return document.querySelectorAll('.block.rf').length; })()`) === 3);
await sleep(120);
ok('2b. rAF 后 .rf 移除（恢复常态）', await evalJS(`document.querySelectorAll('.block.rf').length`) === 0);
ok('2c. resetZoom 也触发重绘', await evalJS(`(() => { state.zoom = 2; applyPan(); resetZoom(); return document.querySelectorAll('.block.rf').length; })()`) === 3);
await sleep(120);
ok('2d. resetZoom 后 .rf 移除', await evalJS(`document.querySelectorAll('.block.rf').length`) === 0);

console.log('═══ 3. 左键拖动画布中 Ctrl+滚轮缩放 ═══');
await evalJS(`state.zoom = 1; state.pan = {x:0,y:0}; applyPan(); clearSel();`);
await sleep(80);
/* 左键拖画布（panning）中途 Ctrl+滚轮 */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 300, button: 'left', buttons: 1, clickCount: 1 });
await sleep(40);
const zBefore = await evalJS('state.zoom');
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 320, deltaX: 0, deltaY: -120, modifiers: 2 });   /* Ctrl+滚轮上 */
await sleep(80);
const zAfter = await evalJS('state.zoom');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 260, y: 320, buttons: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 260, y: 320, button: 'left', clickCount: 1 });
await sleep(120);
ok('3a. 拖画布中 Ctrl+滚轮 → 缩放生效（zoom 1 → 1.1）', Math.abs(zAfter / zBefore - 1.1) < 0.01, JSON.stringify({ zBefore, zAfter }));
ok('3b. 拖画布+缩放后松手无 JS 报错（继续可用）', await evalJS(`typeof state.zoom === 'number' && state.zoom > 1`));

console.log('═══ 4. 模板定制：单元拖拽排序 ═══');
await evalJS(`openTplWin()`);
await sleep(150);
const order0 = await evalJS(`state.templates[0].units.map(u => u.suffixes.join(','))`);
ok('4a. 模板窗口打开，2 单元顺序 = [后缀1, 后缀2]', JSON.stringify(order0) === JSON.stringify(['后缀1', '后缀2']), JSON.stringify(order0));
/* 模拟 HTML5 DnD：卡片 0 → 卡片 1 */
const dnd = await evalJS(`(() => {
  const cards = document.querySelectorAll('.tpl-card');
  if(cards.length < 2) return 'NO_CARDS';
  const dt = new DataTransfer();
  cards[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cards[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const over = cards[1].classList.contains('drag-over');
  cards[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cards[0].dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return over ? 'DROPPED' : 'NO_OVER';
})()`);
await sleep(100);
const order1 = await evalJS(`state.templates[0].units.map(u => u.suffixes.join(','))`);
ok('4b. 拖拽排序：dragover 高亮生效', dnd === 'DROPPED', dnd);
ok('4c. 单元 0 拖到单元 1 → 顺序 = [后缀2, 后缀1]', JSON.stringify(order1) === JSON.stringify(['后缀2', '后缀1']), JSON.stringify(order1));
/* 再拖回 */
await evalJS(`(() => {
  const cards = document.querySelectorAll('.tpl-card');
  const dt = new DataTransfer();
  cards[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cards[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cards[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
})()`);
await sleep(80);
ok('4d. 拖回后顺序复原 [后缀1, 后缀2]', JSON.stringify(await evalJS(`state.templates[0].units.map(u => u.suffixes.join(','))`)) === JSON.stringify(['后缀1', '后缀2']));
await evalJS(`closeTplWin()`);
await sleep(100);

console.log('═══ 5. 模板预览（只读）═══');
await evalJS(`document.getElementById('spTplFold').click()`);   /* 展开模板列表 */
await sleep(120);
const hasPrev = await evalJS(`!!document.querySelector('.sp-tpl-item .sp-tpl-act:not(.primary):not(.danger)')`);
ok('5a. 模板条目含「预览」按钮', hasPrev);
const pvBtn = await elRect(`.sp-tpl-item .sp-tpl-act:not(.primary):not(.danger)`);
await clickXY(pvBtn.cx, pvBtn.cy);
await sleep(120);
const prevInfo = await evalJS(`(() => {
  const m = document.getElementById('tplPrevMask');
  if(m.classList.contains('hide')) return null;
  return {
    title: document.getElementById('tplPrevTitle').textContent,
    cards: document.querySelectorAll('#tplPrevBody .tpl-prev-card').length,
    prefixes: Array.from(document.querySelectorAll('#tplPrevBody .tpl-chip')).map(c => c.textContent),
    hasEmpty: !!document.querySelector('#tplPrevBody .tpl-prev-empty')
  };
})()`);
ok('5b. 预览窗口打开：标题含模板序号', prevInfo && prevInfo.title.includes('模板 1'), prevInfo ? prevInfo.title : 'null');
ok('5c. 预览显示 2 个单元卡片', prevInfo && prevInfo.cards === 2, prevInfo ? 'cards=' + prevInfo.cards : '');
ok('5d. 预览显示前缀/后缀值与空块区提示', prevInfo && prevInfo.prefixes.includes('前缀A') && prevInfo.prefixes.includes('后缀1') && prevInfo.hasEmpty, prevInfo ? JSON.stringify(prevInfo.prefixes) : '');
const prevClose = await elRect('#tplPrevClose');
await clickXY(prevClose.cx, prevClose.cy);
ok('5e. 「完成」关闭预览', await evalJS(`document.getElementById('tplPrevMask').classList.contains('hide')`));

console.log('═══ 6. 套用模板 → 单元按序号显示（去模板名）═══');
await evalJS(`applyTemplate(state.templates[0].id)`);
await sleep(150);
const unitNames = await evalJS(`Array.from(document.querySelectorAll('.sp-unit-name')).map(n => n.textContent)`);
ok('6a. 拼接栏单元标题 = [单元 1, 单元 2]（无「模板 N」）', JSON.stringify(unitNames) === JSON.stringify(['单元 1', '单元 2']), JSON.stringify(unitNames));

console.log('═══ 7. 拼模式：拖块到单元 ═══');
const spliceBtn = await elRect('#spSplice');
await clickXY(spliceBtn.cx, spliceBtn.cy);
ok('7a. 点「拼」→ 拼模式开启（按钮 active）', await evalJS(`document.getElementById('spSplice').classList.contains('active') && spliceMode`));
/* 拖块丙到单元 2 */
const gripC = await elRect(`.block[data-id="${idC}"] .handle-grip`);
const unit2 = await elRect(`.sp-unit:nth-of-type(2)`);
await dragXY(gripC.cx, gripC.cy, unit2.cx, unit2.cy);
const blockIds2 = await evalJS(`state.splice.items[1].blockIds`);
ok('7b. 拖块到单元 2 → 拼入该单元', blockIds2.includes(idC), JSON.stringify(blockIds2));
ok('7c. 拼入 toast', await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('hide') ? '' : t.textContent; })()`).then(t => t.includes('单元 2')));
/* 再点「拼」退出 */
await clickXY(spliceBtn.cx, spliceBtn.cy);
ok('7d. 再点「拼」→ 退出拼模式', !(await evalJS(`spliceMode`)) && !(await evalJS(`document.getElementById('spSplice').classList.contains('active')`)));
/* Esc 退出 */
await clickXY(spliceBtn.cx, spliceBtn.cy);
ok('7e. 再次进入拼模式', await evalJS(`spliceMode`));
await keyDown('Escape'); await keyUp('Escape');
await sleep(60);
ok('7f. Esc → 退出拼模式', !(await evalJS(`spliceMode`)));
/* 非拼模式拖块到单元 → 不拼入 */
const idA2 = idA;
const gripA = await elRect(`.block[data-id="${idA2}"] .handle-grip`);
const unit1 = await elRect(`.sp-unit:nth-of-type(1)`);
const beforeN = await evalJS(`state.splice.items[0].blockIds.length`);
await dragXY(gripA.cx, gripA.cy, unit1.cx, unit1.cy);
ok('7g. 非拼模式拖到单元 → 不拼入', (await evalJS(`state.splice.items[0].blockIds.length`)) === beforeN);
/* 块甲被拖到拼接栏底下（面板盖住）——重置回画布安全区供后续测试 */
await evalJS(`(() => { const b = state.blocks.find(x => x.id === ${JSON.stringify(idA2)}); b.x = 420; b.y = 320; render(); })()`);
await sleep(120);
/* 拼模式中拖拽高亮单元 */
await clickXY(spliceBtn.cx, spliceBtn.cy);
const gripA2 = await elRect(`.block[data-id="${idA2}"] .handle-grip`);
const unit1b = await elRect(`.sp-unit:nth-of-type(1)`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gripA2.cx, y: gripA2.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gripA2.cx, y: gripA2.cy, button: 'left', buttons: 1, clickCount: 1 });
await sleep(40);
for (let i = 1; i <= 14; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(gripA2.cx + (unit1b.cx - gripA2.cx) * i / 14), y: Math.round(gripA2.cy + (unit1b.cy - gripA2.cy) * i / 14), buttons: 1 }); await sleep(18); }
await sleep(60);
ok('7h. 拖拽经过单元 → drop-target 高亮', await evalJS(`!!document.querySelector('.sp-unit.drop-target')`));
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: unit1b.cx, y: unit1b.cy, button: 'left', clickCount: 1 });
await sleep(150);
ok('7i. 高亮后松手 → 块拼入单元 1', await evalJS(`state.splice.items[0].blockIds.includes(${JSON.stringify(idA2)})`));
await keyDown('Escape'); await keyUp('Escape');
await sleep(60);

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
