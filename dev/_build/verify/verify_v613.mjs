import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.13 headless 验收（CDP 直连，零污染）：移除模板名称（序号区分）+ 移除模板定制窗口提示词块配置（块为拼入容器） */
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

await evalJS(`state.blocks = [{ id: uid(), text: '镜头甲', x: 20, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel(); state.templates = []; tplCur = 0;`);
await sleep(120);

console.log('═══ 1. 数据迁移 v10 → v11 ═══');
const mig = await evalJS(`(() => {
  const d = migrate({ app: 'storyboard-prompt-panel', version: 10, title: 't', pan: {x:0,y:0}, splice: { items: [{type:'unit', id:'u1', name:'旧模板', prefixes:['P'], suffixes:['S'], blockIds:[], blockTexts:['旧内嵌块']}], activeUnitId: null }, collapsed: false, templates: [{ id: 't1', name: '旧名字', units: [{ id: 'x1', prefixes: ['画面开始：'], blocks: ['不该保留的块'], suffixes: ['画面结束。'] }] }], blocks: [] });
  return { version: d.version, tpl: d.templates[0], unit: d.splice.items[0] };
})()`);
ok('1a. version 10 → 11', mig.version === 11);
ok('1b. 模板 name 丢弃', !('name' in mig.tpl), JSON.stringify(mig.tpl));
ok('1c. 模板单元 blocks 丢弃（块不是模板的一部分）', !('blocks' in mig.tpl.units[0]), JSON.stringify(mig.tpl.units[0]));
ok('1d. 单元前后缀保留', mig.tpl.units[0].prefixes[0] === '画面开始：' && mig.tpl.units[0].suffixes[0] === '画面结束。');
ok('1e. 拼接栏单元 blockTexts 丢弃', !('blockTexts' in mig.unit));

console.log('═══ 2. 模板定制窗口：无名称、无块配置 ═══');
await evalJS(`document.getElementById('spTplCustom').click()`);
await sleep(100);
ok('2a. 打开自动新建模板（1 空单元）', await evalJS(`state.templates.length === 1 && state.templates[0].units.length === 1`));
ok('2b. 窗口无「模板名称」输入框', await evalJS(`document.querySelectorAll('#tplBody .tpl-name-input').length === 0 && document.getElementById('tplBody').textContent.indexOf('模板名称') < 0`), await evalJS(`document.getElementById('tplBody').textContent.slice(0, 80)`));
ok('2c. 单元卡片无提示词块配置区', await evalJS(`document.getElementById('tplBody').textContent.indexOf('提示词块') < 0 && document.querySelectorAll('#tplBody .tpl-blocks').length === 0`));
ok('2d. 单元卡片含前缀/后缀配置 + 删除本单元', await evalJS(`(() => { const t = document.getElementById('tplBody').textContent; return t.indexOf('前缀值') >= 0 && t.indexOf('后缀值') >= 0 && t.indexOf('删除本单元') >= 0; })()`), await evalJS(`document.getElementById('tplBody').textContent.slice(0, 150)`));
ok('2e. 单元卡片序号「单元 1」', await evalJS(`document.querySelector('#tplBody .tpl-unit-no').textContent === '单元 1'`));
/* 给单元加前缀后缀 */
await evalJS(`(() => { const card = document.querySelector('#tplBody .tpl-card'); const adds = card.querySelectorAll('.tpl-add'); adds[0].click(); const inp = card.querySelector('.tpl-add-input'); inp.value = '画面开始：'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
await evalJS(`(() => { const card = document.querySelector('#tplBody .tpl-card'); const adds = card.querySelectorAll('.tpl-add'); adds[1].click(); const inp = card.querySelector('.tpl-add-input'); inp.value = '画面结束。'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
ok('2f. 前缀/后缀添加成功', await evalJS(`state.templates[0].units[0].prefixes[0] === '画面开始：' && state.templates[0].units[0].suffixes[0] === '画面结束。'`));
/* 新建单元 */
const newBtn = await elRect('#tplNew');
await clickAt(newBtn.x, newBtn.y);
await sleep(80);
ok('2g. 「＋ 新建单元」→ 2 张卡片', await evalJS(`state.templates[0].units.length === 2 && document.querySelectorAll('#tplBody .tpl-card').length === 2`));

console.log('═══ 3. 序号化（模板列表/选择器/单元名） ═══');
ok('3a. 选择器显示「模板 1」', await evalJS(`document.getElementById('tplSelect').options[0].textContent === '模板 1'`), await evalJS(`document.getElementById('tplSelect').options[0].textContent`));
await evalJS(`document.getElementById('tplSelect').value = '-1'; document.getElementById('tplSelect').dispatchEvent(new Event('change', {bubbles:true}));`);
await sleep(80);
ok('3b. 新建模板 → 模板 2（选择器序号）', await evalJS(`state.templates.length === 2 && document.getElementById('tplSelect').options[1].textContent === '模板 2'`));
await evalJS(`closeTplWin();`);
ok('3c. 模板列表显示「模板 1」「模板 2」', await evalJS(`(() => { const names = Array.prototype.map.call(document.querySelectorAll('.sp-tpl-name'), el => el.textContent); return names[0] === '模板 1' && names[1] === '模板 2'; })()`), JSON.stringify(await evalJS(`Array.prototype.map.call(document.querySelectorAll('.sp-tpl-name'), el => el.textContent)`)));

console.log('═══ 4. 套用：单元 = 前缀+空块区+后缀 ═══');
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(100);
ok('4a. 套用 → 单元窗口（name=模板 1）', await evalJS(`state.splice.items.length === 2 && state.splice.items[0].name === '模板 1'`), JSON.stringify(await evalJS('state.splice.items.map(it => ({name: it.name, bIds: it.blockIds.length}))')));
ok('4b. 单元无 blockTexts（块由拼入填充）', await evalJS(`!('blockTexts' in state.splice.items[0])`));
ok('4c. 块区空态提示', await evalJS(`document.querySelector('.sp-unit-body .sp-unit-empty') !== null && document.querySelector('.sp-unit-body .sp-unit-empty').textContent.indexOf('拼入') >= 0`), await evalJS(`document.querySelector('.sp-unit-body .sp-unit-empty') ? document.querySelector('.sp-unit-body .sp-unit-empty').textContent : '(无空态)'`));
/* 拼入画布块 */
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
ok('4d. 拼入块进单元 1', await evalJS(`state.splice.items[0].blockIds.length === 1`));
/* 点击拼接栏引用块 → 编辑窗口（保留功能） */
await evalJS(`document.querySelector('.sp-ublock').click()`);
await sleep(60);
ok('4e. 点击拼接栏块 → 弹编辑窗口（保留）', await evalJS(`!document.getElementById('blkMask').classList.contains('hide')`));
await setBlk('镜头甲（改）：雨夜小巷，慢推');
await okBlk();
ok('4f. 编辑同步画布块', await evalJS(`state.blocks[0].text === '镜头甲（改）：雨夜小巷，慢推'`), await evalJS('state.blocks[0].text'));
/* 复制输出 */
const captured = await evalJS(`(() => { window.__cap = null; const orig = copyText; copyText = function(t){ window.__cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return window.__cap; })()`);
ok('4g. 复制输出 = 前缀+块+后缀（单元按序）', captured === '画面开始：\n\n镜头甲（改）：雨夜小巷，慢推\n\n画面结束。', JSON.stringify(captured));

console.log('═══ 5. 回归 ═══');
ok('5a. 模板列表统计徽章（单元数）', await evalJS(`(() => { const nums = Array.prototype.map.call(document.querySelectorAll('.sp-tpl-num'), el => el.textContent); return nums.some(n => n.indexOf('单') >= 0); })()`));
ok('5b. 页面无 JS 报错', await evalJS(`typeof render === 'function' && typeof applyTemplate === 'function' && typeof deleteTemplate === 'function' && typeof tplChipsRow === 'function' && typeof openBlockEditor === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
