/* 拼好镜 v7.7 · 独立编辑器「左右空白」实测（只读探针）
   用法：先起 headless Edge --remote-headless --remote-debugging-port=9222，再 node recon_editor_space.mjs
   ※ 调试端口：优先读 PHJ_BROWSER_PORT，缺省 9222（与 run-gate / verify_* 同款口径）。
   目的：量出 .blk-win 在 1920x1080 下的真实几何 + 左右可布置面积 + 出截图 */
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const TMP = 'D:/Hermes_Store/_小汐临时/';
const PRODUCT = pathToFileURL('D:/Hermes_Store/AA-Dev/拼好镜/PHJ.html').href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://'));
if (!page) throw new Error('no page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); });
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
}
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.navigate', { url: PRODUCT });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const corpus = JSON.parse(readFileSync(TMP + 'corpus.json', 'utf8'));
const sample = corpus.find(x => x.title === '视频 23') || corpus[0];

const geo = await evalJS(`(() => {
  const text = ${JSON.stringify(sample.prompt)};
  state.blocks = [{ id:'bX', text: text, x:40, y:40 }];
  state.order = []; state.templates = []; state.unitSeq = 0;
  render();
  openBlockEditor(text, null);
  const r = el => { const b = el.getBoundingClientRect(); return { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), right:Math.round(b.right), bottom:Math.round(b.bottom) }; };
  const win = document.querySelector('.blk-win');
  const mask = document.getElementById('blkMask');
  const ta = document.getElementById('blkInput');
  const inner = { vw: innerWidth, vh: innerHeight };
  const w = r(win);
  return {
    viewport: inner,
    mask: r(mask),
    win: w,
    winStyle: { width: getComputedStyle(win).width, maxHeight: getComputedStyle(win).maxHeight, padding: getComputedStyle(win).padding },
    textarea: r(ta),
    freeLeft: w.x, freeRight: inner.vw - w.right, freeTop: w.y, freeBottom: inner.vh - w.bottom,
    lines: text.split('\\n').length,
    chars: text.length,
    winScrollable: win.scrollHeight > win.clientHeight,
    winScrollH: win.scrollHeight, winClientH: win.clientHeight,
    hlLineCount: document.querySelectorAll('.blk-hl .hl-line').length,
    status: document.querySelector('.blk-status').innerText.replace(/\\s+/g,' '),
  };
})()`);
console.log(JSON.stringify(geo, null, 1));
writeFileSync(TMP + 'editor_geo.json', JSON.stringify(geo, null, 1));

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot && shot.data) { writeFileSync(TMP + 'editor_space.png', Buffer.from(shot.data, 'base64')); console.log('shot saved', TMP + 'editor_space.png'); }
else console.log('shot failed', JSON.stringify(shot).slice(0, 200));
ws.close();
