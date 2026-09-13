/* 拼好镜 v6.3 headless 验收（CDP 直连，零污染） */
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
const TARGET = 'file:///D:/Hermes_Store/%E6%8B%BC%E5%A5%BD%E9%95%9C/PHJ.html';
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
async function clickAt(x, y, mods = 0) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function rclickAt(x, y, mods = 0) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'right', 1, mods); await mouse('mouseReleased', x, y, 'right', 1, mods); await sleep(100); }
async function drag(x1, y1, x2, y2, steps = 8, stepMs = 20) {
  await moveTo(600, 1200); await moveTo(x1, y1);
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await sleep(stepMs); }
  await mouse('mouseReleased', x2, y2);
  await sleep(120);
}
async function dragHold(x1, y1, x2, y2) {   /* 拖拽中不松手 */
  await moveTo(600, 1200); await moveTo(x1, y1);
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', x1 + (x2 - x1) * i / 5, y1 + (y2 - y1) * i / 5); await sleep(20); }
}
async function wheelAt(x, y, dy) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(60); }
async function handlePos(id) {
  return await evalJS(`(() => { const h = document.querySelector('.block[data-id="${id}"] .drag-handle'); if(!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function textareaPos(id) {
  return await evalJS(`(() => { const t = document.querySelector('.block[data-id="${id}"] .block-text'); const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function ctxItemClick(act) {
  const p = await evalJS(`(() => { const b = document.querySelector('.ctx-item[data-act="${act}"]'); if(!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!p) throw new Error('ctx item not found: ' + act);
  await clickAt(p.x, p.y);
  await sleep(120);
}
const CTL = 2;

await evalJS(`state.blocks = [
  { id: uid(), text: '镜头A：雨夜小巷，霓虹倒映（短行）', x: 20, y: 20 },
  { id: uid(), text: '镜头B：角色停步回望', x: 414, y: 94 }
]; state.pan = {x:0,y:0}; state.order = []; render(); clearSel();`);
const b0 = await evalJS('state.blocks[0].id');
const b1 = await evalJS('state.blocks[1].id');
const h0 = await handlePos(b0);
const h1 = await handlePos(b1);
const t1 = await textareaPos(b1);
const c0 = await evalJS(`(() => { const r = document.querySelector('.block[data-id="${b0}"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);

console.log('═══ 1. Ctrl+左键点选多选（toggle） ═══');
await clickAt(c0.x, c0.y, CTL);
ok('Ctrl+左键点块0 → 选中 1 块', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b0, JSON.stringify(await evalJS('selected')));
ok('块0 高亮', await evalJS(`document.querySelector('.block[data-id="${b0}"]').classList.contains('selected')`));
await clickAt(h1.x, h1.y, CTL);
ok('Ctrl+左键点块1 把手 → 累加 2 块', await evalJS('selected.length') === 2, JSON.stringify(await evalJS('selected')));
ok('两块均高亮', await evalJS('document.querySelectorAll(".block.selected").length') === 2);
await clickAt(c0.x, c0.y, CTL);
ok('Ctrl+左键再点块0 → toggle 取消（剩块1）', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b1, JSON.stringify(await evalJS('selected')));
ok('块0 高亮已移除', !(await evalJS(`document.querySelector('.block[data-id="${b0}"]').classList.contains('selected')`)));
await clickAt(t1.x, t1.y, CTL);
ok('Ctrl+左键点 textarea 内 → toggle 生效（取消已选的块1）', await evalJS('selected.length') === 0, JSON.stringify(await evalJS('selected')));
ok('textarea 未获得焦点', await evalJS(`document.activeElement.tagName !== 'TEXTAREA'`));
await clickAt(c0.x, c0.y, CTL);
await clickAt(h1.x, h1.y, CTL);
ok('重新多选两块（为下段准备）', await evalJS('selected.length') === 2);
await clickAt(200, 900);
ok('点空白 → 清空选择', await evalJS('selected.length') === 0);

console.log('═══ 2. Ctrl+右键已放弃（右键不修改选择集，恢复菜单语义） ═══');
await rclickAt(h0.x, h0.y, CTL);
ok('Ctrl+右键 → 不修改选择集（仍空，无多选副作用）', await evalJS('selected.length') === 0, JSON.stringify(await evalJS('selected')));
ok('Ctrl+右键 → 菜单为单选标签', await evalJS(`document.querySelector('.ctx-item[data-act="splice-block"]').textContent.indexOf('（') < 0`));
await rclickAt(h1.x, h1.y, CTL);
ok('Ctrl+右键另一块 → 同样不修改选择集', await evalJS('selected.length') === 0, JSON.stringify(await evalJS('selected')));
await rclickAt(200, 900);
ok('空白右键 → 清空（无变化）', await evalJS('selected.length') === 0);
/* 右键拖把手拼入手势回归（松手须落在拼接栏内） */
await moveTo(600, 1200); await moveTo(h0.x, h0.y);
await mouse('mousePressed', h0.x, h0.y, 'right', 1);
for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', h0.x + (1000 - h0.x) * i / 8, h0.y + (800 - h0.y) * i / 8); await sleep(20); }
await mouse('mouseReleased', 1000, 800, 'right', 1);
await sleep(150);
ok('右键拖把手 → 拼入手势仍正常（松手在拼接栏内）', await evalJS('state.order.length') === 1 && await evalJS('state.order[0]') === b0, JSON.stringify(await evalJS('state.order')));
await evalJS('spliceClear()');

console.log('═══ 3. 选中集批量操作 + 组拖 ═══');
await clickAt(c0.x, c0.y, CTL);
await clickAt(h1.x, h1.y, CTL);
const rel0 = await evalJS(`(() => { const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}'); return { x: c.x - a.x, y: c.y - a.y }; })()`);
const h0d = await handlePos(b0);
await drag(h0d.x, h0d.y, h0d.x + 100, h0d.y + 100);
const rel1 = await evalJS(`(() => { const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}'); return { x: c.x - a.x, y: c.y - a.y }; })()`);
ok('组拖（Ctrl+左键选中后拖任意一块）→ 相对位置保持', rel1.x === rel0.x && rel1.y === rel0.y, JSON.stringify({ before: rel0, after: rel1 }));
ok('组拖后选择保留', await evalJS('selected.length') === 2);
/* 批量删除 + 撤销：组拖后 selected=[b0,b1] 保留，右键其中一块 → 菜单批量（不重置选择） */
const n0 = await evalJS('state.blocks.length');
const hb = await handlePos(b0);
await rclickAt(hb.x, hb.y);
ok('多选后右键（右键块在选中集）→ 菜单保留批量标签', await evalJS(`document.querySelector('.ctx-item[data-act="del-block"]').textContent.indexOf('（2 块）') >= 0`), await evalJS(`document.querySelector('.ctx-item[data-act="del-block"]') ? document.querySelector('.ctx-item[data-act="del-block"]').textContent : 'null'`));
ok('右键不重置选择集', await evalJS('selected.length') === 2, JSON.stringify(await evalJS('selected')));
await ctxItemClick('del-block');
ok('批量删除（-2 块）', await evalJS('state.blocks.length') === n0 - 2, 'n=' + await evalJS('state.blocks.length'));
ok('删除 toast 带撤销', await evalJS(`document.getElementById('toast').querySelector('button') !== null`));
await evalJS(`document.getElementById('toast').querySelector('button').click()`);
await sleep(150);
ok('撤销恢复', await evalJS('state.blocks.length') === n0);
/* 未多选时右键 → 单块操作（菜单单选标签） */
await clickAt(200, 900);
const hbs = await handlePos(b0);
await rclickAt(hbs.x, hbs.y);
ok('未多选时右键 → 菜单单选标签', await evalJS(`document.querySelector('.ctx-item[data-act="del-block"]').textContent === '删除'`), await evalJS(`document.querySelector('.ctx-item[data-act="del-block"]').textContent`));
await rclickAt(200, 900);

console.log('═══ 4. 回归：拖块中滚轮 / 普通拖拽 ═══');
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const h0e = await handlePos(b0);
const dY0 = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);
await dragHold(h0e.x, h0e.y, h0e.x + 30, h0e.y + 30);
const rectBefore = await evalJS(`document.querySelector('.block[data-id="${b0}"]').getBoundingClientRect().y`);
await wheelAt(h0e.x + 30, h0e.y + 30, 90);
const rectAfter = await evalJS(`document.querySelector('.block[data-id="${b0}"]').getBoundingClientRect().y`);
ok('拖块中滚轮：块视觉位置保持（跟随鼠标）', Math.abs(rectAfter - rectBefore) < 2, JSON.stringify({ before: rectBefore, after: rectAfter }));
await mouse('mouseReleased', h0e.x + 30, h0e.y + 30);
await sleep(120);
ok('松手落点含滚轮补偿（+30 位移 +90 滚轮）', Math.abs(await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) - (dY0 + 30 + 90)) < 3, 'y=' + await evalJS(`state.blocks.find(b => b.id === '${b0}').y`));
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const h0f = await handlePos(b0);
const dY1 = await evalJS(`state.blocks.find(b => b.id === '${b0}').y`);
await drag(h0f.x, h0f.y, h0f.x + 60, h0f.y + 60);
ok('普通左键拖把手（无 Ctrl）→ 移动正常', Math.abs(await evalJS(`state.blocks.find(b => b.id === '${b0}').y`) - (dY1 + 60)) < 3, 'y=' + await evalJS(`state.blocks.find(b => b.id === '${b0}').y`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
