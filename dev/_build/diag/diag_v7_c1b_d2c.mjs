import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 根因诊断：v7 回归里 C1b（按钮 :active 未生效）与 D2c（源块 1px 位移）到底是什么
   用法：headless Edge :9222 起好后 → node diag_v7_c1b_d2c.mjs */
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
console.log('视口:', await evalJS('innerWidth + "x" + innerHeight'));

/* ---- C1b：真实按下 #spFold，检查命中元素 / :hover / :active / transform ---- */
const fold = await evalJS(`(() => { const b = document.getElementById('spFold'); const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [r.x, r.y, r.width, r.height].map(n => +n.toFixed(1)),
           box: getComputedStyle(b).transform }; })()`);
console.log('C1b #spFold 中心:', fold.x, fold.y, 'rect=', fold.rect, '初态 transform=', fold.box);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fold.x, y: fold.y });
await sleep(60);
const hoverState = await evalJS(`(() => { const b = document.getElementById('spFold');
  const e = document.elementFromPoint(${fold.x}, ${fold.y});
  return { hover: b.matches(':hover'), active: b.matches(':active'),
           hit: e ? (e.id || e.className || e.tagName) : null,
           hitIsFold: e === b, transform: getComputedStyle(b).transform }; })()`);
console.log('C1b 悬停后:', JSON.stringify(hoverState));
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fold.x, y: fold.y, button: 'left', clickCount: 1 });
await sleep(140);
const pressState = await evalJS(`(() => { const b = document.getElementById('spFold');
  return { hover: b.matches(':hover'), active: b.matches(':active'), transform: getComputedStyle(b).transform,
           activeEl: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null }; })()`);
console.log('C1b 按下后:', JSON.stringify(pressState));
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fold.x, y: fold.y, button: 'left', clickCount: 1 });
await sleep(150);

/* ---- D2c：块 hover 位移（1px）来源 ---- */
const d2 = await evalJS(`(() => {
  state.blocks = [{ id: 'k1', text: '源块', x: 120, y: 120 }, { id: 'k2', text: '目标块', x: 120, y: 320 }];
  state.splice = { items: [], activeUnitId: null }; state.pan = { x: 0, y: 0 }; state.zoom = 1; render();
  const c = board.querySelector('.block[data-id="k1"]');
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x + 60), y: Math.round(r.y + 60), before: { x: +r.x.toFixed(1), y: +r.y.toFixed(1) },
           cssHoverRule: (() => { for (const ss of document.styleSheets) { try { for (const r2 of ss.cssRules) {
             if (r2.selectorText && /\.block:hover/.test(r2.selectorText)) return r2.style.cssText; } } catch(e){} } return null; })() };
})()`);
console.log('D2c 块初始 rect:', JSON.stringify(d2.before), '｜ .block:hover 规则:', d2.cssHoverRule);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 900 });
await sleep(120);
const far = await evalJS(`(() => { const r = board.querySelector('.block[data-id="k1"]').getBoundingClientRect();
  return { y: +r.y.toFixed(1), hover: board.querySelector('.block[data-id="k1"]').matches(':hover') }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2.x, y: d2.y });
await sleep(220);
const near = await evalJS(`(() => { const c = board.querySelector('.block[data-id="k1"]');
  const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
  return { y: +r.y.toFixed(1), hover: c.matches(':hover'), transform: cs.transform, transition: cs.transition }; })()`);
console.log('D2c 鼠标远离:', JSON.stringify(far), '｜ 鼠标悬停块上:', JSON.stringify(near));
console.log(near.y !== far.y ? `→ 结论：hover 浮起使块 y 位移 ${(far.y - near.y).toFixed(1)}px（v7.1 设计行为）` : '→ 结论：hover 不产生位移');
ws.close();
