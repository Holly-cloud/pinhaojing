import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.21 headless 验收：
   ① 底部说明小字移除 ② 复制拼接新空行规则（块不参与、前缀上方一个空行、后缀不参与、平铺块间无空行） ③ 回归 */
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };
const grab = () => evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return cap; })()`);

console.log('═══ 1. 底部说明小字移除 ═══');
ok('1a. 无 .hint 元素', await evalJS(`!document.querySelector('.hint')`));
ok('1b. 底部无说明文字残留', await evalJS(`!document.body.textContent.includes('拖块圆点/图片摆放')`));

console.log('═══ 2. 复制拼接：新空行规则 ═══');
await evalJS(`state.blocks = [
  { id: uid(), text: '块一', x: 20, y: 20 },
  { id: uid(), text: '块二', x: 20, y: 80 },
  { id: uid(), text: '平铺块', x: 300, y: 20 }
]; render();`);
/* 2a. 单元：前缀2 + 块2 + 后缀2 → 只有开头一个空行，其余 \n 紧挨 */
await evalJS(`state.splice = { items: [{ type: 'unit', id: 'u1', prefixes: ['前缀甲', '前缀乙'], suffixes: ['后缀甲', '后缀乙'], blockIds: [state.blocks[0].id, state.blocks[1].id] }], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o1 = await grab();
ok('2a. 单元输出 = 开头空行 + 前缀值间无空行 + 块间无空行 + 后缀值间无空行', o1 === '\n前缀甲\n前缀乙\n块一\n块二\n后缀甲\n后缀乙', JSON.stringify(o1));
/* 2b. 平铺块之间无空行（块不参与空行——无前缀无开头空行） */
await evalJS(`state.splice = { items: [{ type: 'block', id: state.blocks[0].id }, { type: 'block', id: state.blocks[1].id }], activeUnitId: null }; render();`);
await sleep(80);
const o2 = await grab();
ok('2b. 平铺块输出 = 块间无空行、无开头空行', o2 === '块一\n块二', JSON.stringify(o2));
/* 2c. 混合：单元（前缀+块）+ 平铺块 → 全部 \n 紧挨 */
await evalJS(`state.splice = { items: [
  { type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: ['后缀甲'], blockIds: [state.blocks[0].id] },
  { type: 'block', id: state.blocks[2].id }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o3 = await grab();
ok('2c. 混合输出全紧挨（无段间空行）', o3 === '\n前缀甲\n块一\n后缀甲\n平铺块', JSON.stringify(o3));
/* 2d. 只有前缀的单元 */
await evalJS(`state.splice = { items: [{ type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: [], blockIds: [] }], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o4 = await grab();
ok('2d. 仅前缀输出 = 开头空行 + 前缀', o4 === '\n前缀甲', JSON.stringify(o4));
/* 2e. 多单元：每个前缀段上方都有空行 */
await evalJS(`state.splice = { items: [
  { type: 'unit', id: 'u1', prefixes: ['P1'], suffixes: [], blockIds: [state.blocks[0].id] },
  { type: 'unit', id: 'u2', prefixes: ['P2'], suffixes: [], blockIds: [state.blocks[1].id] }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o5 = await grab();
ok('2e. 多单元输出 = 每个前缀上方空行', o5 === '\nP1\n块一\n\nP2\n块二', JSON.stringify(o5));
/* 2f. 平铺块在前 + 单元（前缀）在后 → 前缀上方仍有空行（用户反馈核心场景） */
await evalJS(`state.splice = { items: [
  { type: 'block', id: state.blocks[2].id },
  { type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: [], blockIds: [state.blocks[0].id] }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o6 = await grab();
ok('2f. 平铺在前+前缀在后 → 前缀上方空行保留', o6 === '平铺块\n\n前缀甲\n块一', JSON.stringify(o6));
/* 2g. 空拼接 → toast 提示（不复制） */
await evalJS(`state.splice = { items: [], activeUnitId: null }; render();`);
await sleep(80);
const o7 = await grab();
ok('2g. 空拼接不复制（null）', o7 === null);

console.log('═══ 3. 回归：单块复制（多选）不受影响 ═══');
await evalJS(`state.splice = { items: [], activeUnitId: null }; clearSel(); selected = [state.blocks[0].id, state.blocks[1].id];`);
const o8 = await evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; bulkAction('copy', selected.slice()); copyText = orig; return cap; })()`);
ok('3a. 多选复制块仍为块间空行分隔（\\n\\n）', o8 === '块一\n\n块二', JSON.stringify(o8));

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
