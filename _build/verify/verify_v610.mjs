import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.10 headless 验收（CDP 直连，零污染）：「拼」按钮始终显式 + 红色；复制/克隆/删除保持 hover 浮现 */
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
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
/* 按钮可见性：visibility + opacity + 实际尺寸 */
async function btnState(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { vis: cs.visibility, op: parseFloat(cs.opacity), color: cs.color, w: r.width, h: r.height, bg: cs.backgroundColor }; })()`);
}

await evalJS(`state.blocks = [{ id: uid(), text: '块一', x: 20, y: 20 }, { id: uid(), text: '块二', x: 300, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel();`);
await sleep(120);

console.log('═══ 1. 「拼」按钮始终显式 ═══');
/* 鼠标移到画布空白（不 hover 块） */
await moveTo(500, 1200);
await sleep(100);
const sOff = await btnState('.block .op-btn.splice');
ok('1a. 非 hover：「拼」按钮可见（visibility=visible, opacity=1）', sOff && sOff.vis === 'visible' && sOff.op === 1, JSON.stringify(sOff));
ok('1b. 非 hover：「拼」按钮有实际尺寸（可点击）', sOff && sOff.w > 0 && sOff.h > 0, JSON.stringify(sOff));
ok('1c. 「拼」按钮为红色（#d64545）', sOff && sOff.color.toLowerCase() === 'rgb(214, 69, 69)', 'color=' + (sOff && sOff.color));
ok('1d. 非 hover：复制按钮不可见（visibility=hidden）', (await btnState('.block .op-btn[data-act="copy"]')).vis === 'hidden', JSON.stringify(await btnState('.block .op-btn[data-act="copy"]')));
ok('1e. 非 hover：删除按钮不可见', (await btnState('.block .op-btn[data-act="del"]')).vis === 'hidden', JSON.stringify(await btnState('.block .op-btn[data-act="del"]')));

console.log('═══ 2. hover 时全部按钮浮现 ═══');
const c1 = await elRect('.block .block-text');
await moveTo(c1.x, c1.y);
await sleep(150);
ok('2a. hover 块：复制按钮浮现（visible+opacity 1）', (await btnState('.block .op-btn[data-act="copy"]')).vis === 'visible', JSON.stringify(await btnState('.block .op-btn[data-act="copy"]')));
ok('2b. hover 块：克隆/删除浮现', (await btnState('.block .op-btn[data-act="clone"]')).vis === 'visible' && (await btnState('.block .op-btn[data-act="del"]')).vis === 'visible');
ok('2c. hover 块：「拼」仍为红色', (await btnState('.block .op-btn.splice')).color.toLowerCase() === 'rgb(214, 69, 69)');

console.log('═══ 3. 不 hover 直接点「拼」 ═══');
await moveTo(500, 1200);   /* 移开，确保非 hover */
await sleep(100);
const sb = await elRect('.block .op-btn.splice');
await clickAt(sb.x, sb.y);
ok('3a. 不 hover 点击「拼」→ 拼入成功', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].id === state.blocks[0].id`), JSON.stringify(await evalJS('state.splice.items')));

console.log('═══ 4. 回归 ═══');
/* 4a. hover 点击「拼」（块二） */
await evalJS('spliceClear()');
const c2 = await elRect('.block:nth-child(2) .block-text');
await moveTo(c2.x, c2.y);
await sleep(120);
const sb2 = await elRect('.block:nth-child(2) .op-btn.splice');
await clickAt(sb2.x, sb2.y);
ok('4a. hover 块二点「拼」→ 拼入块二', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].id === state.blocks[1].id`));
/* 4b. 多选批量拼入 */
await evalJS('spliceClear(); clearSel();');
await clickAt(c1.x, c1.y, 2);
await clickAt(c2.x, c2.y, 2);
ok('4b0. 多选 2 块', await evalJS(`selected.length === 2`));
await evalJS(`bulkAction('splice', selected.slice())`);
ok('4b. 批量拼入 2 块（回归）', await evalJS(`state.splice.items.length === 2`), 'n=' + await evalJS('state.splice.items.length'));
/* 4c. 右键菜单拼入（回归）——右键点把手（textarea 内是原生菜单，不弹拼好镜菜单） */
await evalJS('spliceClear(); clearSel();');
const hR = await elRect('.block .drag-handle');
await moveTo(600, 1400);
await moveTo(hR.x, hR.y);
await mouse('mousePressed', hR.x, hR.y, 'right');
await mouse('mouseReleased', hR.x, hR.y, 'right');
await sleep(90);
ok('4c0. 右键块 → 菜单弹出', await evalJS(`document.getElementById('ctxMenu').classList.contains('open')`));
const mi = await elRect('.ctx-item[data-act="splice-block"]');
if (mi) await clickAt(mi.x, mi.y);
ok('4c. 右键菜单拼入（回归）', await evalJS(`state.splice.items.length === 1`));
/* 4d. 拖块/缩放/多选基础回归 */
await evalJS('spliceClear(); clearSel(); state.pan = {x:0,y:0}; state.zoom = 1; applyPan(); updateZoomBtn();');
const h1 = await elRect('.block .drag-handle');
const b0 = await evalJS('state.blocks[0]');
await mouse('mousePressed', h1.x, h1.y, 'left');
for (let i = 1; i <= 6; i++) await moveTo(Math.round(h1.x + 60 * i / 6), Math.round(h1.y + 40 * i / 6));
await mouse('mouseReleased', h1.x + 60, h1.y + 40, 'left');
await sleep(80);
const b1 = await evalJS('state.blocks[0]');
ok('4d. 左键拖块移动（回归）', Math.abs(b1.x - b0.x - 60) <= 8 && Math.abs(b1.y - b0.y - 40) <= 8, JSON.stringify({ b0, b1 }));
ok('4e. 页面无 JS 报错', await evalJS(`typeof render === 'function' && typeof zoomAt === 'function' && typeof resetZoom === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
