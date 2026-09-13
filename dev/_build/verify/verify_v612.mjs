import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.12 headless 验收（CDP 直连，零污染）：模板 = 任意数量单元（前缀+提示词块+后缀）；打开即建模板；新建单元；块点击弹编辑窗口；套用=替换+全部单元 */
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
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(18); }
async function clickAt(x, y, mods = 0) { await moveTo(600, 1400); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function elRect(sel, idx = 0) {
  return await evalJS(`(() => { const els = document.querySelectorAll('${sel}'); if(!els.length || els.length <= ${idx}) return null; const r = els[${idx}].getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function setBlk(v) { await evalJS(`document.getElementById('blkInput').value = ${JSON.stringify(v)}`); }
async function okBlk() { await evalJS(`document.getElementById('blkOk').click()`); await sleep(80); }

await evalJS(`state.blocks = [{ id: uid(), text: '镜头甲', x: 20, y: 20 }, { id: uid(), text: '镜头乙', x: 300, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel(); state.templates = []; tplCur = 0;`);
await sleep(120);

console.log('═══ 1. 数据迁移 v9 → v10 ═══');
const mig = await evalJS(`(() => {
  const d = migrate({ app: 'storyboard-prompt-panel', version: 9, title: 't', pan: {x:0,y:0}, splice: { items: [{type:'unit', id:'u1', name:'旧模板', prefixes:['P'], suffixes:['S'], blockIds:[]}], activeUnitId: null }, collapsed: false, templates: [{ id: 't1', name: '旧模板', prefixes: ['画面开始：'], suffixes: ['画面结束。'] }], blocks: [] });
  return { version: d.version, tpl: d.templates[0], unit: d.splice.items[0] };
})()`);
ok('1a. version 9 → 10', mig.version === 10);
ok('1b. 旧模板迁移为 1 个单元（保留前后缀，无块）', mig.tpl.units.length === 1 && mig.tpl.units[0].prefixes[0] === '画面开始：' && mig.tpl.units[0].suffixes[0] === '画面结束。' && mig.tpl.units[0].blocks.length === 0, JSON.stringify(mig.tpl));
ok('1c. 旧拼接栏单元补 blockTexts', Array.isArray(mig.unit.blockTexts) && mig.unit.blockTexts.length === 0);

console.log('═══ 2. 打开定制窗口 = 立刻新建模板 ═══');
await evalJS(`document.getElementById('spTplCustom').click()`);
await sleep(100);
ok('2a. 无模板时打开 → 自动新建 1 个模板', await evalJS(`state.templates.length === 1`), 'n=' + await evalJS('state.templates.length'));
ok('2b. 新模板自动带 1 个空单元', await evalJS(`state.templates[0].units.length === 1`));
ok('2c. 窗口渲染 1 张单元卡片（「单元 1」）', await evalJS(`document.querySelectorAll('#tplBody .tpl-card').length === 1 && document.querySelector('#tplBody .tpl-unit-no').textContent === '单元 1'`));
ok('2d. 「＋ 新建模板」按钮已移除（改为新建单元）', await evalJS(`document.getElementById('tplNew').textContent === '＋ 新建单元'`), await evalJS(`document.getElementById('tplNew').textContent`));

console.log('═══ 3. 新建单元 / 单元编辑 ═══');
const newBtn = await elRect('#tplNew');
await clickAt(newBtn.x, newBtn.y);
await sleep(80);
ok('3a. 「＋ 新建单元」→ 单元 2 张卡片', await evalJS(`state.templates[0].units.length === 2 && document.querySelectorAll('#tplBody .tpl-card').length === 2`));
ok('3b. 卡片序号「单元 1」「单元 2」', await evalJS(`document.querySelectorAll('#tplBody .tpl-unit-no')[1].textContent === '单元 2'`));
/* 给单元 1 加前缀 */
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[0].click(); const inp = cards[0].querySelector('.tpl-add-input'); inp.value = '画面开始：'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
ok('3c. 单元 1 添加前缀', await evalJS(`state.templates[0].units[0].prefixes[0] === '画面开始：'`));
/* 添加块（弹编辑窗口） */
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[1].click(); })()`);
await sleep(80);
ok('3d. 点「+ 添加块」→ 弹出编辑窗口', await evalJS(`!document.getElementById('blkMask').classList.contains('hide')`));
await setBlk('第一个镜头：雨夜小巷');
await okBlk();
ok('3e. 确定后块进入单元 1', await evalJS(`state.templates[0].units[0].blocks.length === 1 && state.templates[0].units[0].blocks[0] === '第一个镜头：雨夜小巷'`));
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[1].click(); })()`);
await setBlk('第二个镜头：霓虹倒映');
await okBlk();
ok('3f. 添加第 2 块', await evalJS(`state.templates[0].units[0].blocks.length === 2`));
ok('3g. 块列表从上到下显示', await evalJS(`document.querySelectorAll('#tplBody .tpl-card')[0].querySelectorAll('.tpl-block-item').length === 2 && document.querySelectorAll('#tplBody .tpl-block-text')[0].textContent === '第一个镜头：雨夜小巷'`));
/* 点击块弹编辑窗口 → 修改 */
await clickAt((await elRect('#tplBody .tpl-block-item', 0)).x, (await elRect('#tplBody .tpl-block-item', 0)).y);
await sleep(60);
ok('3h. 点击块 → 弹编辑窗口（含原内容）', await evalJS(`!document.getElementById('blkMask').classList.contains('hide') && document.getElementById('blkInput').value === '第一个镜头：雨夜小巷'`));
await setBlk('第一个镜头（改）：雨夜小巷，慢推');
await okBlk();
ok('3i. 修改写回', await evalJS(`state.templates[0].units[0].blocks[0] === '第一个镜头（改）：雨夜小巷，慢推'`));
/* 块排序 ↑：点第二个块的 ↑（第一块上移本身是 no-op） */
await evalJS(`(() => { const items = document.querySelectorAll('#tplBody .tpl-block-item'); const ops = items[1].querySelectorAll('.tpl-block-op'); ops[0].click(); })()`);
await sleep(60);
ok('3j. ↑ 上移后顺序交换', await evalJS(`state.templates[0].units[0].blocks[0] === '第二个镜头：霓虹倒映'`), JSON.stringify(await evalJS('state.templates[0].units[0].blocks')));
/* 块删除 ×（第 1 个块的 × = ops 第 3 个按钮） */
await evalJS(`(() => { const items = document.querySelectorAll('#tplBody .tpl-block-item'); const ops = items[0].querySelectorAll('.tpl-block-op'); ops[2].click(); })()`);
await sleep(60);
ok('3k. × 删除块', await evalJS(`state.templates[0].units[0].blocks.length === 1`));
/* 后缀 */
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[2].click(); const inp = cards[0].querySelector('.tpl-add-input'); inp.value = '画面结束。'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
ok('3l. 单元 1 添加后缀', await evalJS(`state.templates[0].units[0].suffixes[0] === '画面结束。'`));

console.log('═══ 4. 选择器新建模板 / 切换 ═══');
const sel = await evalJS(`(() => { const s = document.getElementById('tplSelect'); return { opts: s.options.length, last: s.options[s.options.length-1].textContent, value: s.value }; })()`);
ok('4a. 选择器含「＋ 新建模板…」选项', sel.last === '＋ 新建模板…', JSON.stringify(sel));
await evalJS(`document.getElementById('tplSelect').value = '-1'; document.getElementById('tplSelect').dispatchEvent(new Event('change', {bubbles:true}));`);
await sleep(80);
ok('4b. 选「＋ 新建模板…」→ 新模板 + 自动 1 单元', await evalJS(`state.templates.length === 2 && state.templates[1].units.length === 1`));
ok('4c. 新模板成为当前编辑对象', await evalJS(`document.querySelectorAll('#tplBody .tpl-unit-no').length === 1`));
await evalJS(`document.getElementById('tplSelect').value = '0'; document.getElementById('tplSelect').dispatchEvent(new Event('change', {bubbles:true}));`);
await sleep(80);
ok('4d. 切回模板 0 → 2 张单元卡片', await evalJS(`document.querySelectorAll('#tplBody .tpl-card').length === 2`));

console.log('═══ 5. 套用 = 替换 + 全部单元生成 ═══');
await evalJS(`closeTplWin();`);
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(100);
ok('5a. 套用 → 拼接栏替换为 2 个单元（模板全部单元）', await evalJS(`state.splice.items.length === 2 && state.splice.items.every(it => it.type === 'unit')`), 'n=' + await evalJS('state.splice.items.length'));
ok('5b. 内嵌块文本进 blockTexts', await evalJS(`state.splice.items[0].blockTexts.length === 1 && state.splice.items[0].blockTexts[0] === '第一个镜头（改）：雨夜小巷，慢推'`));
ok('5c. 画布块数不变（不建画布块）', await evalJS(`state.blocks.length === 2`));
ok('5d. 激活目标 = 第一个单元', await evalJS(`state.splice.activeUnitId === state.splice.items[0].id`));
/* 拼入画布块进第一个单元 */
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
ok('5e. 拼入进第一个单元（blockIds）', await evalJS(`state.splice.items[0].blockIds.length === 1`));
ok('5f. 单元内嵌块 + 引用块都显示', await evalJS(`document.querySelectorAll('.sp-ublock').length === 2`));
/* 拼接栏内嵌块点击编辑 */
await evalJS(`document.querySelector('.sp-ublock .sp-ub-text').click()`);
await sleep(60);
ok('5g. 点击拼接栏内嵌块 → 弹编辑窗口', await evalJS(`!document.getElementById('blkMask').classList.contains('hide')`));
await setBlk('第一个镜头（改）·改：雨夜小巷，急推');
await okBlk();
ok('5h. 拼接栏内嵌块修改写回（不影响模板）', await evalJS(`state.splice.items[0].blockTexts[0] === '第一个镜头（改）·改：雨夜小巷，急推' && state.templates[0].units[0].blocks[0] === '第一个镜头（改）：雨夜小巷，慢推'`));
/* 复制输出 */
const captured = await evalJS(`(() => { window.__cap = null; const orig = copyText; copyText = function(t){ window.__cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return window.__cap; })()`);
const expected = '画面开始：\n\n第一个镜头（改）·改：雨夜小巷，急推\n\n镜头甲\n\n画面结束。';   /* 单元 2 为空单元（无前后缀无块），不参与输出 */
ok('5i. 复制输出 = 前缀+内嵌+引用+后缀（单元按序）', captured === expected, JSON.stringify(captured));

console.log('═══ 6. 回归 ═══');
ok('6a. 画布块点击编辑窗口可编辑引用块（画布同步）', await evalJS(`typeof openBlockEditor === 'function'`));
ok('6b. 删除本单元（模板窗口）', await evalJS(`(() => { const t = state.templates[0]; const n0 = t.units.length; document.querySelector('#tplBody .tpl-card > .tpl-block-op.danger').click(); return t.units.length === n0 - 1; })()`));
ok('6c. 套用空模板提示', await evalJS(`(() => { const t = { id: uid(), name: '空模板', units: [] }; state.templates.push(t); return true; })()`));
ok('6d. 页面无 JS 报错', await evalJS(`typeof render === 'function' && typeof zoomAt === 'function' && typeof spliceAdd === 'function' && typeof newUnit === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
