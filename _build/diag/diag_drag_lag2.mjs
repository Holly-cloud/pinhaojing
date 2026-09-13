import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THE_PRODUCT = pathToFileURL(path.resolve(HERE, '../../PHJ.html')).href;
/* v7.2 拖拽跟手性多场景量化：每场景测「鼠标位移后立即读块位置的滞后 px」 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result && r.result.value;
}
const results = [];
const check = (name, lag, expect) => {
  const okFlag = Math.abs(lag) <= 5;
  results.push({ name, lag, ok: okFlag });
  console.log(`  ${okFlag ? '✅' : '❌'} ${name}: 滞后 ${lag}px（期望 ≈0，允差 5px）`);
};

/* 复位：两个不重叠块（供单块/组拖），zoom=1 */
const reset = (zoom) => evalJS(`state.blocks = [
  { id: 'a1', text: '跟手场景块 A', x: 40, y: 40 },
  { id: 'a2', text: '跟手场景块 B', x: 40, y: 300 }
]; state.splice = { items: [], activeUnitId: null }; state.pan = { x: 0, y: 0 }; state.zoom = ${zoom}; clearSel(); selected = []; render();`);
const blockLeft = (sel) => evalJS(`Math.round(board.querySelector('${sel}').getBoundingClientRect().left)`);
const gripOf = (sel) => evalJS(`(() => { const g = board.querySelector('${sel}').querySelector('.handle-grip').getBoundingClientRect(); return { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) }; })()`);

await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: THE_PRODUCT });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);

console.log('【v7.2 跟手性多场景量化】');

/* 场景 1：单块慢速拖（10 帧 × 20px） */
await reset(1); await sleep(300);
let base = await blockLeft('[data-id="a1"]');
let g = await gripOf('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await sleep(60);
let lags = [];
for (let s = 1; s <= 10; s++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + s * 20, y: g.y, button: 'left' });
  await sleep(20);
  lags.push((base + s * 20) - await blockLeft('[data-id="a1"]'));
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x + 200, y: g.y, button: 'left', clickCount: 1 });
check('单块慢速拖（10 帧 × 20px）最大滞后', Math.max(...lags.map(Math.abs)), 0);

/* 场景 2：快速甩动（3 帧 × 120px） */
await reset(1); await sleep(300);
base = await blockLeft('[data-id="a1"]');
g = await gripOf('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 120, y: g.y, button: 'left' });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 240, y: g.y, button: 'left' });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 360, y: g.y, button: 'left' });
await sleep(20);
let lag2 = (base + 360) - await blockLeft('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x + 360, y: g.y, button: 'left', clickCount: 1 });
check('快速甩动（3 帧 × 120px）滞后', lag2, 0);

/* 场景 3：组拖（选中 2 块，拖 150px） */
await reset(1); await sleep(300);
await evalJS(`selected = ['a1', 'a2']; refreshSel();`);
base = await blockLeft('[data-id="a1"]');
const base2 = await blockLeft('[data-id="a2"]');
g = await gripOf('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 75, y: g.y + 30, button: 'left' });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 150, y: g.y + 60, button: 'left' });
await sleep(20);
const lagA = (base + 150) - await blockLeft('[data-id="a1"]');
const lagB = (base2 + 150) - await blockLeft('[data-id="a2"]');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x + 150, y: g.y + 60, button: 'left', clickCount: 1 });
check('组拖主块滞后', lagA, 0);
check('组拖成员块滞后（v7.2 一并覆盖）', lagB, 0);

/* 场景 4：缩放下拖拽（zoom=2，鼠标移 150px → 视觉位移应同为 150px） */
await reset(2); await sleep(300);
await evalJS(`fixTextBlur();`);
base = await blockLeft('[data-id="a1"]');
g = await gripOf('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x + 150, y: g.y, button: 'left' });
await sleep(20);
const lagZ = (base + 150) - await blockLeft('[data-id="a1"]');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x + 150, y: g.y, button: 'left', clickCount: 1 });
check('缩放 200% 下拖拽（视觉位移 1:1）滞后', lagZ, 0);

await evalJS(`state.zoom = 1; state.pan = { x: 0, y: 0 }; render();`);
const bad = results.filter(r => !r.ok).length;
console.log(`\n══════ 跟手量化结果：${results.length - bad}/${results.length} 达标（允差 5px）══════`);
process.exit(bad ? 1 : 0);
