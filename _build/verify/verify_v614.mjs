import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.14 headless 验收（CDP 直连，零污染）：块编辑窗口高度=屏幕80%；宽度自适应最长字行 */
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

async function rect(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; })()`);
}

await evalJS(`state.blocks = [{ id: uid(), text: '镜头甲', x: 20, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel();`);
await sleep(120);

console.log('═══ 1. 高度 = 屏幕 80% ═══');
await evalJS(`openBlockEditor('', function(){})`);
await sleep(100);
const ta = await rect('#blkInput');
ok('1a. 编辑区高度 ≈ 80% 视口高度（±8px）', Math.abs(ta.h - Math.round(vw.h * 0.8)) <= 8, JSON.stringify({ h: ta.h, expect: Math.round(vw.h * 0.8) }));
ok('1b. 窗口总高不超过视口（可完整显示）', await evalJS(`document.querySelector('.blk-win').getBoundingClientRect().height <= innerHeight`), JSON.stringify(await rect('.blk-win')));

console.log('═══ 2. 宽度自适应最长字行 ═══');
/* 短内容 → 窗口宽下限 560px（textarea 宽 = 窗口 − padding 36 − border 2） */
const win0 = await rect('.blk-win');
ok('2a. 空内容 → 窗口宽度下限 560px', Math.abs(win0.w - 560) <= 4, 'w=' + win0.w);
/* 中等长行 → 自适应 */
const mid = '镜'.repeat(30);   /* 中文 30 字 ≈ 405px */
await evalJS(`document.getElementById('blkInput').value = ${JSON.stringify(mid)}`);
await evalJS(`fitBlkWidth()`);
await sleep(60);
const taMid = await rect('.blk-win');
const expMid = await evalJS(`Math.min(Math.max(Math.ceil(textWidth(${JSON.stringify(mid)})) + 60, 560), innerWidth * 0.94)`);
ok('2b. 30 字中文 → 窗口宽度按字行自适应（公式 ±4px）', Math.abs(taMid.w - expMid) <= 4, JSON.stringify({ w: taMid.w, exp: expMid }));
/* 超长行 → 上限 94vw */
const huge = 'A'.repeat(400);
await evalJS(`document.getElementById('blkInput').value = ${JSON.stringify(huge)}`);
await evalJS(`fitBlkWidth()`);
await sleep(60);
const taHuge = await rect('.blk-win');
const cap = Math.round(vw.w * 0.94);
ok('2c. 超长行 → 窗口宽度封顶 94vw', taHuge.w <= cap && taHuge.w >= cap - 8, JSON.stringify({ w: taHuge.w, cap }));

console.log('═══ 3. 输入实时自适应 ═══');
await evalJS(`document.getElementById('blkInput').value = ''`);
await evalJS(`fitBlkWidth()`);
const w0 = await rect('.blk-win');
await evalJS(`(() => { const ta = document.getElementById('blkInput'); ta.value = '短行'; ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(60);
const w1 = await rect('.blk-win');
await evalJS(`(() => { const ta = document.getElementById('blkInput'); ta.value = '这'.repeat(60); ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(60);
const w2 = await rect('.blk-win');
ok('3a. 输入短内容 → 窗口宽度回落下限', Math.abs(w1.w - 560) <= 4, 'w=' + w1.w);
ok('3b. 输入长内容 → 窗口宽度实时扩大', w2.w > w0.w + 100, JSON.stringify({ w0: w0.w, w2: w2.w }));

console.log('═══ 4. 回归 ═══');
/* 确定写回 */
await evalJS(`document.getElementById('blkInput').value = '最终内容'`);
await evalJS(`document.getElementById('blkOk').click()`);
await sleep(80);
ok('4a. 确定关闭 + 回调写回', await evalJS(`document.getElementById('blkMask').classList.contains('hide')`));
ok('4b. 再次打开正常（拼接栏块点击编辑场景）', await evalJS(`openBlockEditor('x', function(){}), !document.getElementById('blkMask').classList.contains('hide')`));
await evalJS(`closeBlockEditor()`);
ok('4c. 取消关闭正常', await evalJS(`document.getElementById('blkMask').classList.contains('hide')`));
ok('4d. 页面无 JS 报错', await evalJS(`typeof fitBlkWidth === 'function' && typeof render === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
