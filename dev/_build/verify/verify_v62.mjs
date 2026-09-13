import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.2 headless 验收（CDP 直连，零污染） */
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
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
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(25); }
async function clickAt(x, y) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1); await mouse('mouseReleased', x, y, 'left', 1); }
async function rclickAt(x, y, mods = 0) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'right', 1, mods); await mouse('mouseReleased', x, y, 'right', 1, mods); await sleep(100); }
async function rpressMoveRel(x, y, dx, dy, mods = 0) {   /* 右键按住后移动再松开（模拟微拖） */
  await moveTo(600, 1200); await moveTo(x, y);
  await mouse('mousePressed', x, y, 'right', 1, mods);
  for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', x + dx * i / 5, y + dy * i / 5); await sleep(20); }
  await mouse('mouseReleased', x + dx, y + dy, 'right', 1, mods);
  await sleep(120);
}
async function drag(x1, y1, x2, y2, steps = 8, stepMs = 20) {
  await moveTo(600, 1200); await moveTo(x1, y1);
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await sleep(stepMs); }
}
async function dragEnd(x, y) { await mouse('mouseReleased', x, y); await sleep(120); }
async function wheelAt(x, y, dy) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(60); }
async function handlePos(id) {
  return await evalJS(`(() => { const h = document.querySelector('.block[data-id="${id}"] .drag-handle'); if(!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function blockRect(id) {
  return await evalJS(`(() => { const c = document.querySelector('.block[data-id="${id}"]'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
}
async function textareaPos(id) {
  return await evalJS(`(() => { const t = document.querySelector('.block[data-id="${id}"] .block-text'); const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
const CTL = 2;

/* 固定布局：2 块不重叠，pan 归零 */
await evalJS(`state.blocks = [
  { id: uid(), text: '镜头A：雨夜小巷，霓虹倒映（短行）', x: 20, y: 20 },
  { id: uid(), text: '镜头B：角色停步回望', x: 414, y: 94 }
]; state.pan = {x:0,y:0}; state.order = []; render(); clearSel();`);
const b0 = await evalJS('state.blocks[0].id');
const b1 = await evalJS('state.blocks[1].id');
const h0 = await handlePos(b0);
const h1 = await handlePos(b1);
const t1 = await textareaPos(b1);
console.log('  h0:', JSON.stringify(h0), 'h1:', JSON.stringify(h1), 't1:', JSON.stringify(t1));

console.log('═══ 1. Ctrl+右键多选可靠性（v6.1 三个失败场景） ═══');
/* 场景A：Ctrl+右键在把手上按住并轻移（v6.1 会被拼入手势吞掉） */
await rpressMoveRel(h0.x, h0.y, 20, 15, CTL);
ok('A. 把手 Ctrl+右键+轻移 → 已选中块0', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b0, JSON.stringify(await evalJS('selected')));
ok('A. 菜单正常弹出（未被抑制吞掉）', await evalJS(`document.getElementById('ctxMenu').classList.contains('open')`));
ok('A. 未误触发拼入手势（order 不变）', await evalJS('state.order.length') === 0);
/* 场景B：右键拖拽拼入手势后立刻 Ctrl+右键（v6.1 会被 suppress 吞掉） */
await moveTo(600, 1200); await moveTo(h0.x, h0.y);
await mouse('mousePressed', h0.x, h0.y, 'right', 1);
for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', h0.x + 40 * i / 5, h0.y + 30 * i / 5); await sleep(20); }
await mouse('mouseReleased', h0.x + 40, h0.y + 30, 'right', 1);
await sleep(120);   /* 拼入手势完成，__suppressCtx 已置位 */
await rclickAt(h1.x, h1.y, CTL);
ok('B. 拼入手势后立即 Ctrl+右键 → 仍能多选块1', await evalJS(`selected.indexOf('${b1}') >= 0`), JSON.stringify(await evalJS('selected')));
/* 场景C：textarea 上 Ctrl+右键（任意位置可用） */
await rclickAt(t1.x, t1.y, CTL);
ok('C. textarea 上 Ctrl+右键 → 多选生效（选中集不变）', await evalJS(`selected.indexOf('${b1}') >= 0`), JSON.stringify(await evalJS('selected')));
ok('C. 两块均高亮', await evalJS('document.querySelectorAll(".block.selected").length') === 2);
/* 普通右键单选重置（行为保持） */
await rclickAt(h0.x, h0.y);
ok('普通右键 → 单选重置为块0', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b0, JSON.stringify(await evalJS('selected')));
await rclickAt(200, 900);
ok('空白右键 → 清空选择', await evalJS('selected.length') === 0);

console.log('═══ 2. 拖块中滚轮：画布滚动 + 块跟随鼠标 ═══');
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const origY0 = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);
const py0 = await evalJS('state.pan.y');
/* 拖块0：press → 移到 +50,+50（不松手） */
const h0s = await handlePos(b0);
await moveTo(600, 1200); await moveTo(h0s.x, h0s.y);
await mouse('mousePressed', h0s.x, h0s.y);
for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', h0s.x + 50 * i / 5, h0s.y + 50 * i / 5); await sleep(20); }
const mx = h0s.x + 50, my = h0s.y + 50;
const rectBefore = await blockRect(b0);
/* 拖拽中滚轮向下 120 */
await wheelAt(mx, my, 120);
ok('2a. 滚轮生效：pan.y 减少 120', Math.round(await evalJS('state.pan.y')) === py0 - 120, 'pan.y=' + await evalJS('state.pan.y'));
const rectAfter = await blockRect(b0);
ok('2a. 块视觉位置保持（跟随鼠标不脱离）', Math.abs(rectAfter.y - rectBefore.y) < 2, JSON.stringify({ before: rectBefore.y, after: rectAfter.y }));
/* 再滚轮向上 60（反向补偿） */
await wheelAt(mx, my, -60);
const rectAfter2 = await blockRect(b0);
ok('2b. 反向滚轮补偿同样保持块位置', Math.abs(rectAfter2.y - rectBefore.y) < 2, JSON.stringify({ before: rectBefore.y, after: rectAfter2.y }));
ok('2b. pan.y 累计 = -120+60', Math.round(await evalJS('state.pan.y')) === py0 - 60);
/* 松手：落点应含滚轮补偿（60px 净补偿） */
await dragEnd(mx, my);
const y0After = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);
ok('2c. 松手落点含滚轮补偿（原 +50 鼠标位移 +60 净滚轮）', Math.abs(y0After - (origY0 + 50 + 60)) < 3, 'y=' + y0After + ' expect≈' + (origY0 + 50 + 60));
ok('2c. 滚轮补偿后 pan 已落盘', Math.round(await evalJS('JSON.parse(localStorage.getItem("storyboard-prompt-panel:v1")).pan.y')) === py0 - 60);

console.log('═══ 3. 组拖中滚轮 ═══');
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const h0c = await handlePos(b0);
const h1c = await handlePos(b1);
await rclickAt(h0c.x, h0c.y, CTL);
await rclickAt(h1c.x, h1c.y, CTL);
const rel0 = await evalJS(`(() => {
  const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}');
  return { x: c.x - a.x, y: c.y - a.y };
})()`);
const h0d = await handlePos(b0);
const gY0 = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);   /* 动态基准：拖动前 y */
await moveTo(600, 1200); await moveTo(h0d.x, h0d.y);
await mouse('mousePressed', h0d.x, h0d.y);
for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', h0d.x + 30 * i / 5, h0d.y + 30 * i / 5); await sleep(20); }
await wheelAt(h0d.x + 30, h0d.y + 30, 90);
await dragEnd(h0d.x + 30, h0d.y + 30);
const rel1 = await evalJS(`(() => {
  const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}');
  return { x: c.x - a.x, y: c.y - a.y };
})()`);
ok('3. 组拖+滚轮：组内相对位置保持', rel1.x === rel0.x && rel1.y === rel0.y, JSON.stringify({ before: rel0, after: rel1 }));
ok('3. 组拖+滚轮：块0 落点含补偿（+30 位移 +90 滚轮）', Math.abs(await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) - (gY0 + 30 + 90)) < 3, 'y=' + await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) + ' expect≈' + (gY0 + 30 + 90));

console.log('═══ 4. 回归：无拖拽滚轮 / 拖拽基本 ═══');
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const py1 = await evalJS('state.pan.y');
await wheelAt(100, 900, 100);
ok('无拖拽滚轮 → pan.y -100', Math.round(await evalJS('state.pan.y')) === py1 - 100);
const h0e = await handlePos(b0);
const dY0 = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);   /* 动态基准 */
await drag(h0e.x, h0e.y, h0e.x + 60, h0e.y + 60);
await dragEnd(h0e.x + 60, h0e.y + 60);
ok('普通拖拽（无滚轮）落点 = +60（无多余补偿）', Math.abs(await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) - (dY0 + 60)) < 3, 'y=' + await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) + ' expect≈' + (dY0 + 60));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
