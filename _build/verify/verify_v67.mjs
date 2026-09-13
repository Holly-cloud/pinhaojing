import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.7 headless 验收（CDP 直连，零污染）：模板定制窗口单模板工作模式 */
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
async function btnPos(id) {
  return await evalJS(`(() => { const b = document.getElementById('${id}'); if(!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}

await evalJS(`state.blocks = [{ id: uid(), text: '块一', x: 20, y: 20 }]; state.pan = {x:0,y:0}; render(); spliceClear(); clearSel();`);

console.log('═══ 1. 单模板工作模式：窗口结构 ═══');
/* 预置 2 个模板 */
await evalJS(`state.templates = [
  { id: uid(), name: '对话场景', prefixes: ['画面开始：'], suffixes: ['画面结束。'] },
  { id: uid(), name: '音效模板', prefixes: ['音效：'], suffixes: [] }
]; renderTplList();`);
const customBtn = await btnPos('spTplCustom');
await clickAt(customBtn.x, customBtn.y);
await sleep(120);
ok('1a. 窗口打开', await evalJS(`!document.getElementById('tplMask').classList.contains('hide')`));
ok('1b. 模板选择器存在且 2 个选项', await evalJS(`document.getElementById('tplSelect').options.length === 2`), 'n=' + await evalJS(`document.getElementById('tplSelect').options.length`));
ok('1c. 选择器当前值 = 模板0', await evalJS(`document.getElementById('tplSelect').selectedIndex === 0`));
ok('1d. 窗口仅渲染 1 张卡片（单模板）', await evalJS(`document.querySelectorAll('#tplBody .tpl-card').length === 1`), 'n=' + await evalJS(`document.querySelectorAll('#tplBody .tpl-card').length`));
ok('1e. 卡片为当前模板（对话场景）', await evalJS(`document.querySelector('#tplBody .tpl-name-input').value === '对话场景'`), await evalJS(`document.querySelector('#tplBody .tpl-name-input').value`));
ok('1f. 卡片含其前缀/后缀组成部分', await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length === 2`), 'chips=' + await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length`));

console.log('═══ 2. 创建的组成部分属于当前模板 ═══');
/* 给模板0 添加第 2 个前缀 */
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[0].click(); const inp = cards[0].querySelector('.tpl-add-input'); inp.value = '现场情况说明：'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
ok('2a. 前缀加到模板0（当前模板）', await evalJS(`state.templates[0].prefixes.length === 2 && state.templates[0].prefixes[1] === '现场情况说明：'`), JSON.stringify(await evalJS('state.templates[0].prefixes')));
ok('2b. 模板1 不受影响', await evalJS(`state.templates[1].prefixes.length === 1`), JSON.stringify(await evalJS('state.templates[1].prefixes')));
/* 改名称 */
await evalJS(`(() => { const i = document.querySelector('#tplBody .tpl-name-input'); i.value = '对话场景V2'; i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(80);
ok('2c. 改名同步到模板0 与选择器', await evalJS(`state.templates[0].name === '对话场景V2' && document.getElementById('tplSelect').options[0].textContent === '对话场景V2'`));

console.log('═══ 3. 选择器切换编辑对象 ═══');
await evalJS(`document.getElementById('tplSelect').value = '1'; document.getElementById('tplSelect').dispatchEvent(new Event('change', {bubbles:true}));`);
await sleep(80);
ok('3a. 切换到模板1（音效模板）', await evalJS(`document.querySelector('#tplBody .tpl-name-input').value === '音效模板'`), await evalJS(`document.querySelector('#tplBody .tpl-name-input').value`));
ok('3b. 卡片显示模板1 的组成部分（1 前缀）', await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length === 1`), 'chips=' + await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length`));
/* 给模板1 加后缀 */
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const adds = cards[0].querySelectorAll('.tpl-add'); adds[1].click(); const inp = cards[0].querySelector('.tpl-add-input'); inp.value = '（音效渐弱）'; inp.dispatchEvent(new Event('blur', {bubbles:true})); })()`);
await sleep(80);
ok('3c. 后缀加到模板1（当前模板）', await evalJS(`state.templates[1].suffixes.length === 1 && state.templates[1].suffixes[0] === '（音效渐弱）'`), JSON.stringify(await evalJS('state.templates[1].suffixes')));
ok('3d. 模板0 未被动过', await evalJS(`state.templates[0].prefixes.length === 2 && state.templates[0].suffixes.length === 1`));

console.log('═══ 4. 新建模板 / 空态 ═══');
const newBtn = await btnPos('tplNew');
await clickAt(newBtn.x, newBtn.y);
await sleep(80);
ok('4a. 「＋ 新建模板」→ 模板数 3', await evalJS('state.templates.length') === 3, 'n=' + await evalJS('state.templates.length'));
ok('4b. 自动切换到新模板（空组成部分）', await evalJS(`document.getElementById('tplSelect').selectedIndex === 2 && document.querySelector('#tplBody .tpl-name-input').value === '模板 1' && document.querySelectorAll('#tplBody .tpl-chip').length === 0`), JSON.stringify({ sel: await evalJS(`document.getElementById('tplSelect').selectedIndex`), name: await evalJS(`document.querySelector('#tplBody .tpl-name-input').value`) }));
await evalJS(`document.getElementById('tplDone').click()`);
await sleep(60);
ok('4c. 完成关闭', await evalJS(`document.getElementById('tplMask').classList.contains('hide')`));
/* 空模板态 */
await evalJS(`state.templates = []; renderTplList(); openTplWin();`);
ok('4d. 无模板时窗口空态提示', await evalJS(`document.getElementById('tplBody').textContent.indexOf('新建模板') >= 0`), await evalJS(`document.getElementById('tplBody').textContent`));
await evalJS(`closeTplWin();`);

console.log('═══ 5. 回归：套用/拼入/复制输出 ═══');
await evalJS(`state.templates = [{ id: uid(), name: '对话场景', prefixes: ['画面开始：'], suffixes: ['画面结束。'] }]; renderTplList();`);
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(80);
ok('5a. 套用 → 单元窗口（拼接栏）', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].type === 'unit' && state.splice.items[0].prefixes[0] === '画面开始：'`));
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
ok('5b. 拼入进激活单元', await evalJS(`state.splice.items[0].blockIds.length === 1`));
const captured = await evalJS(`(() => {
  window.__cap = null;
  const orig = copyText;
  copyText = function(t){ window.__cap = t; return Promise.resolve(true); };
  copySpliced();
  copyText = orig;
  return window.__cap;
})()`);
ok('5c. 复制输出 = 前缀+块+后缀', captured === '画面开始：\n\n块一\n\n画面结束。', JSON.stringify(captured));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
