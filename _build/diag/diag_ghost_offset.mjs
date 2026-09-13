import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* v7.3 ghost 错位诊断：测量虚影位置与鼠标位置的偏差，并核对 inline left/top 来源 */
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
console.log('视口:', await evalJS('innerWidth + "x" + innerHeight'));

/* 块放在明显坐标处（x=200,y=150），便于识别偏差来源 */
const setup = await evalJS(`(() => {
  state.blocks = [{ id: 'k1', text: '错位诊断块', x: 200, y: 150 }];
  state.splice = { items: [{ type: 'unit', id: 'ku1', prefixes: ['P'], suffixes: [], blockIds: [] }], activeUnitId: 'ku1' };
  state.pan = { x: 0, y: 0 }; state.zoom = 1; render(); toggleSpliceMode(true);
  const c = board.querySelector('.block[data-id="k1"]');
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  return { grip: { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) }, blockInline: { left: c.style.left, top: c.style.top } };
})()`);
await sleep(200);
console.log('块 inline 坐标:', JSON.stringify(setup.blockInline), ' 拖手中心:', JSON.stringify(setup.grip));

const MX = 700, MY = 400;   /* 鼠标目标位置 */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: setup.grip.x, y: setup.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: setup.grip.x, y: setup.grip.y, button: 'left', clickCount: 1 });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: MX, y: MY, button: 'left' });
await sleep(120);

const diag = await evalJS(`(() => {
  const gh = document.querySelector('.block-ghost');
  if(!gh) return { err: 'no ghost' };
  const r = gh.getBoundingClientRect();
  const cs = getComputedStyle(gh);
  return {
    ghostInline: { left: gh.style.left, top: gh.style.top, transform: gh.style.transform },
    ghostComputedPos: { position: cs.position, left: cs.left, top: cs.top },
    ghostRect: { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    cursor: { x: ${MX}, y: ${MY} }
  };
})()`);
console.log('\n【虚影诊断】');
console.log('  ghost inline style :', JSON.stringify(diag.ghostInline));
console.log('  ghost computed     : position=' + diag.ghostComputedPos.position + ' left=' + diag.ghostComputedPos.left + ' top=' + diag.ghostComputedPos.top);
console.log('  ghost 实际左上角   : (' + diag.ghostRect.left + ',' + diag.ghostRect.top + ')  尺寸 ' + diag.ghostRect.w + 'x' + diag.ghostRect.h);
console.log('  鼠标位置           : (' + diag.cursor.x + ',' + diag.cursor.y + ')');
console.log('\n  偏差(ghost左上 - 鼠标) = (' + (diag.ghostRect.left - diag.cursor.x) + ',' + (diag.ghostRect.top - diag.cursor.y) + ')');
console.log('  参考：抓取偏移(鼠标-块左上) ≈ (' + (setup.grip.x - diag.ghostRect.left) + ' 附近)  块数据坐标 = (200,150)');
console.log('\n判据：若 ghost computed left/top = 200px/150px（原块 inline 值）→ 证实「克隆带出 inline left/top、覆盖了 CSS 的 left:0」');
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: MX, y: MY, button: 'left', clickCount: 1 });
await evalJS(`if(spliceMode) toggleSpliceMode(false);`);
process.exit(0);
