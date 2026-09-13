import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.4 headless 验收（CDP 直连，零污染） */
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
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(25); }
async function clickAt(x, y, mods = 0) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function handlePos(id) {
  return await evalJS(`(() => { const h = document.querySelector('.block[data-id="${id}"] .drag-handle'); if(!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function cardPos(id) {
  return await evalJS(`(() => { const c = document.querySelector('.block[data-id="${id}"]'); const r = c.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
const CTL = 2;

await evalJS(`state.blocks = [
  { id: uid(), text: '块一：现场情况', x: 20, y: 20 },
  { id: uid(), text: '块二：画面内容', x: 414, y: 94 }
]; state.pan = {x:0,y:0}; state.order = []; render(); clearSel();`);
const b0 = await evalJS('state.blocks[0].id');
const b1 = await evalJS('state.blocks[1].id');

console.log('═══ 1. Ctrl+V 粘贴建块 ═══');
const n0 = await evalJS('state.blocks.length');
const p0 = await evalJS('state.pan');
const pasteR = await evalJS(`(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', '小云站在桌子前面向桌面，小山坐在小云的右臂侧的凳子上。');
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return state.blocks.length;
})()`);
ok('1a. Ctrl+V（焦点非输入区）→ 新块创建', pasteR === n0 + 1, 'n=' + pasteR);
ok('1b. 新块文本 = 剪贴板全文（整段单块）', await evalJS(`state.blocks[state.blocks.length-1].text`) === '小云站在桌子前面向桌面，小山坐在小云的右臂侧的凳子上。', await evalJS(`state.blocks[state.blocks.length-1].text`));
const pb = await evalJS(`state.blocks[state.blocks.length-1]`);
ok('1c. 新块位于视口中心附近', Math.abs(pb.x - (-p0.x + 580 - 70)) < 40 && Math.abs(pb.y - (-p0.y + 720 - 60)) < 40, JSON.stringify({ x: pb.x, y: pb.y }));
ok('1d. toast 提示', await evalJS(`document.getElementById('toast').textContent.indexOf('已粘贴为块') >= 0`), await evalJS(`document.getElementById('toast').textContent`));
/* 连续粘贴错位 */
const p1 = await evalJS('state.blocks[state.blocks.length-1]');
await evalJS(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', '第二段粘贴'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(ev); })()`);
const p2 = await evalJS('state.blocks[state.blocks.length-1]');
ok('1e. 连续粘贴 → 位置错位（不重叠）', Math.abs(p2.x - p1.x) > 10, JSON.stringify({ p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } }));
/* 空剪贴板 */
const nBefore = await evalJS('state.blocks.length');
await evalJS(`(() => { const dt = new DataTransfer(); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(ev); })()`);
ok('1f. 空剪贴板 → 不建块', await evalJS('state.blocks.length') === nBefore);
/* textarea 焦点时粘贴 → 原生保留（不建块） */
const ta = await evalJS(`(() => { const t = document.querySelector('.block-text'); t.focus(); return true; })()`);
const nT = await evalJS('state.blocks.length');
await evalJS(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', '输入区内粘贴'); const t = document.querySelector('.block-text'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); t.dispatchEvent(ev); })()`);
ok('1g. textarea 焦点内粘贴 → 不建块（原生编辑保留）', await evalJS('state.blocks.length') === nT);

console.log('═══ 2. 模板系统重构（前缀/后缀） ═══');
/* 拼接 2 块 → 存为模板（3 字段模态框） */
await evalJS('document.activeElement.blur && document.activeElement.blur(); spliceAdd(state.blocks[0].id); spliceAdd(state.blocks[1].id);');
ok('2a. 拼接 2 块就绪', await evalJS('state.order.length') === 2);
const saveBtn = await evalJS('(() => { const r = document.getElementById("spTplSave").getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()');
await clickAt(saveBtn.x, saveBtn.y);
await sleep(120);
ok('2b. 模态框弹出（3 字段）', await evalJS(`!document.getElementById('modalMask').classList.contains('hide') && document.querySelectorAll('#modalBody .modal-input').length === 3`), 'n=' + await evalJS(`document.querySelectorAll('#modalBody .modal-input').length`));
await evalJS(`(() => { const ins = document.querySelectorAll('#modalBody .modal-input'); ins[0].value = '分镜模板'; ins[1].value = '画面开始：'; ins[2].value = '画面结束。'; })()`);
const okBtn = await evalJS('(() => { const r = document.getElementById("modalOk").getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()');
await clickAt(okBtn.x, okBtn.y);
await sleep(120);
ok('2c. 模板保存：名称/前缀/后缀/2 块', await evalJS(`(() => { const t = state.templates[0]; return t && t.name === '分镜模板' && t.prefix === '画面开始：' && t.suffix === '画面结束。' && t.items.length === 2; })()`), JSON.stringify(await evalJS('state.templates[0]')));
ok('2d. 版本 6 落盘', await evalJS('state.version') === 6);
/* 套用 → 前缀+2块+后缀 = 4 项 */
const nb0 = await evalJS('state.blocks.length');
await evalJS(`(() => { const b = document.querySelector('.sp-tpl-item .sp-tpl-act'); b.click(); })()`);
await sleep(120);
ok('2e. 套用：order = 前缀+2块+后缀（4 项）', await evalJS('state.order.length') === 4, JSON.stringify(await evalJS('state.order')));
ok('2f. 块数 +4', await evalJS('state.blocks.length') === nb0 + 4, 'n=' + await evalJS('state.blocks.length'));
ok('2g. 前缀块文本正确', await evalJS(`state.blocks.find(b => b.id === state.order[0]).text`) === '画面开始：');
ok('2h. 内容块顺序保持', await evalJS(`state.blocks.find(b => b.id === state.order[1]).text`) === '块一：现场情况' && await evalJS(`state.blocks.find(b => b.id === state.order[2]).text`) === '块二：画面内容');
ok('2i. 后缀块文本正确', await evalJS(`state.blocks.find(b => b.id === state.order[3]).text`) === '画面结束。');
ok('2j. toast 含前后缀提示', await evalJS(`document.getElementById('toast').textContent.indexOf('含前后缀') >= 0`), await evalJS(`document.getElementById('toast').textContent`));
/* 改名（3 字段可编辑） */
await evalJS(`document.querySelector('.sp-tpl-fold').click()`);
await sleep(80);
await evalJS(`(() => { const r = document.querySelectorAll('.sp-tpl-item .sp-tpl-act')[1]; r.click(); })()`);
await sleep(100);
await evalJS(`(() => { const ins = document.querySelectorAll('#modalBody .modal-input'); ins[0].value = '分镜模板v2'; ins[1].value = '画面开始V2：'; ins[2].value = ''; })()`);
await clickAt(okBtn.x, okBtn.y);
await sleep(100);
ok('2k. 改名+改前后缀生效', await evalJS(`state.templates[0].name === '分镜模板v2' && state.templates[0].prefix === '画面开始V2：' && state.templates[0].suffix === ''`), JSON.stringify(await evalJS('state.templates[0]')));
/* 删除 + 撤销 */
await evalJS(`(() => { const r = document.querySelector('.sp-tpl-item .sp-tpl-act.danger'); r.click(); })()`);
await sleep(80);
ok('2l. 删除模板', await evalJS('state.templates.length') === 0);
await evalJS(`document.getElementById('toast').querySelector('button').click()`);
await sleep(80);
ok('2m. 撤销恢复', await evalJS('state.templates.length') === 1);
/* 旧数据迁移（纯函数） */
const mig = await evalJS(`(() => {
  const old = { app:'storyboard-prompt-panel', version:5, title:'旧', pan:{x:0,y:0}, order:[], collapsed:false, blocks:[{id:'x1', text:'a', x:0, y:0}], templates:[{ id:'t1', name:'旧模板', items:['a','b'] }] };
  const m = migrate(old);
  return { version: m.version, t: m.templates[0] };
})()`);
ok('2n. v5 旧模板迁移：补空前后缀 + version 6', mig.version === 6 && mig.t.prefix === '' && mig.t.suffix === '' && mig.t.items.length === 2, JSON.stringify(mig));

console.log('═══ 3. 回归：无前后缀模板 / 多选组拖 ═══');
await evalJS(`state.templates = [{ id: uid(), name: '纯块模板', prefix: '', suffix: '', items: ['内容一', '内容二'] }]; renderTplList();`);
const nC0 = await evalJS('state.blocks.length');
await evalJS(`(() => { const b = document.querySelector('.sp-tpl-item .sp-tpl-act'); b.click(); })()`);
await sleep(100);
ok('3a. 无前后缀套用 = 纯 2 块（v6.0 行为保持）', await evalJS('state.order.length') === 2 && await evalJS('state.blocks.length') === nC0 + 2);
/* Ctrl+左键多选 + 组拖（回归） */
await evalJS('state.pan = {x:0,y:0}; render(); clearSel();');
const c0 = await cardPos(b0);
const h1 = await handlePos(b1);
await clickAt(c0.x, c0.y, CTL);
await clickAt(h1.x, h1.y, CTL);
ok('3b. Ctrl+左键多选（2 块）', await evalJS('selected.length') === 2);
const h0d = await handlePos(b0);
const rel0 = await evalJS(`(() => { const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}'); return { x: c.x - a.x, y: c.y - a.y }; })()`);
await clickAt(h0d.x, h0d.y);
await mouse('mousePressed', h0d.x, h0d.y);
for (let i = 1; i <= 5; i++) { await mouse('mouseMoved', h0d.x + 50 * i / 5, h0d.y + 50 * i / 5); await sleep(20); }
await mouse('mouseReleased', h0d.x + 50, h0d.y + 50);
await sleep(120);
const rel1 = await evalJS(`(() => { const a = state.blocks.find(b => b.id === '${b0}'); const c = state.blocks.find(b => b.id === '${b1}'); return { x: c.x - a.x, y: c.y - a.y }; })()`);
ok('3c. 组拖相对位置保持', rel1.x === rel0.x && rel1.y === rel0.y, JSON.stringify({ before: rel0, after: rel1 }));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
