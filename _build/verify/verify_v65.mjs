import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.5 headless 验收（CDP 直连，零污染） */
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

/* 固定布局：2 块不重叠，pan 归零 */
await evalJS(`state.blocks = [
  { id: uid(), text: '块一：现场情况', x: 20, y: 20 },
  { id: uid(), text: '块二：画面内容', x: 414, y: 94 }
]; state.pan = {x:0,y:0}; state.order = []; render(); clearSel();`);

console.log('═══ 1. 「存为模板」移除 / 「模板定制」入口 ═══');
ok('1a. spTplSave 按钮已移除', await evalJS(`!document.getElementById('spTplSave')`));
ok('1b. 「模板定制」按钮存在', !!await evalJS(`document.getElementById('spTplCustom')`));
ok('1c. 模板列表空态文案已更新', await evalJS(`document.getElementById('spTplList').textContent.indexOf('模板定制') >= 0`), await evalJS(`document.getElementById('spTplList').textContent`));

console.log('═══ 2. 模板定制窗口 ═══');
const customBtn = await btnPos('spTplCustom');
await clickAt(customBtn.x, customBtn.y);
await sleep(120);
ok('2a. 窗口打开（居中弹窗）', await evalJS(`!document.getElementById('tplMask').classList.contains('hide')`));
ok('2b. 空态提示', await evalJS(`document.getElementById('tplBody').textContent.indexOf('新建模板单元') >= 0`));
/* 新建 2 个单元 */
const newBtn = await btnPos('tplNew');
await clickAt(newBtn.x, newBtn.y);
await clickAt(newBtn.x, newBtn.y);   /* 窗口高度固定，按钮位置稳定，二次点击同坐标有效 */
await sleep(100);
ok('2c. 新建 2 个模板单元', await evalJS('state.templates.length') === 2, 'n=' + await evalJS('state.templates.length'));
ok('2d. 窗口渲染 2 张卡片', await evalJS(`document.querySelectorAll('#tplBody .tpl-card').length`) === 2);
/* 单元 0：名称 + 2 前缀 + 1 后缀 + 内容 2 段 */
await evalJS(`(() => {
  const cards = document.querySelectorAll('#tplBody .tpl-card');
  const name = cards[0].querySelector('.tpl-name-input');
  name.value = '对话场景'; name.dispatchEvent(new Event('input', {bubbles:true}));
})()`);
await evalJS(`(() => {
  const cards = document.querySelectorAll('#tplBody .tpl-card');
  const adds = cards[0].querySelectorAll('.tpl-add');
  adds[0].click();   /* + 添加前缀 */
  const inp = cards[0].querySelector('.tpl-add-input');
  inp.value = '现场情况说明：'; inp.dispatchEvent(new Event('blur', {bubbles:true}));
})()`);
await sleep(80);
ok('2e. 添加第 1 个前缀值', await evalJS(`state.templates[0].prefixes.length`) === 1 && await evalJS(`state.templates[0].prefixes[0]`) === '现场情况说明：', JSON.stringify(await evalJS('state.templates[0].prefixes')));
await evalJS(`(() => {
  const cards = document.querySelectorAll('#tplBody .tpl-card');
  const adds = cards[0].querySelectorAll('.tpl-add');
  adds[0].click();
  const inp = cards[0].querySelector('.tpl-add-input');
  inp.value = '画面开始：'; inp.dispatchEvent(new Event('blur', {bubbles:true}));
})()`);
await sleep(80);
ok('2f. 添加第 2 个前缀值（任意数量）', await evalJS(`state.templates[0].prefixes.length`) === 2, JSON.stringify(await evalJS('state.templates[0].prefixes')));
await evalJS(`(() => {
  const cards = document.querySelectorAll('#tplBody .tpl-card');
  const adds = cards[0].querySelectorAll('.tpl-add');
  adds[1].click();   /* + 添加后缀 */
  const inp = cards[0].querySelector('.tpl-add-input');
  inp.value = '画面结束。'; inp.dispatchEvent(new Event('blur', {bubbles:true}));
})()`);
await sleep(80);
ok('2g. 添加后缀值', await evalJS(`state.templates[0].suffixes.length`) === 1 && await evalJS(`state.templates[0].suffixes[0]`) === '画面结束。');
ok('2h. 前缀/后缀以标签显示', await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length`) === 3, 'chips=' + await evalJS(`document.querySelectorAll('#tplBody .tpl-chip').length`));
/* 内容块：多行文本区 2 段（用 JSON.stringify 保证 \n 转义安全） */
const itemsVal = JSON.stringify('镜头1：小云特写。小云转头看向小山，语气冷淡的说："该出发了。"\n\n镜头2：小山近景。小山伸个懒腰说："行吧..."');
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); const ta = cards[0].querySelector('.tpl-items'); ta.value = ${itemsVal}; ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(80);
ok('2i. 内容块空行分隔 = 2 块', await evalJS(`state.templates[0].items.length`) === 2, JSON.stringify(await evalJS('state.templates[0].items')));
/* 删除一个前缀 chip */
await evalJS(`(() => { document.querySelectorAll('#tplBody .tpl-card')[0].querySelectorAll('.tpl-chip-x')[0].click(); })()`);
await sleep(80);
ok('2j. 标签 × 删除前缀值（剩 1 个）', await evalJS(`state.templates[0].prefixes.length`) === 1 && await evalJS(`state.templates[0].prefixes[0]`) === '画面开始：', JSON.stringify(await evalJS('state.templates[0].prefixes')));
/* 载入当前拼接（先拼 2 块） */
await evalJS(`state.order = [state.blocks[0].id, state.blocks[1].id]; spliceAdd(state.blocks[0].id); spliceAdd(state.blocks[1].id);`);
await evalJS(`(() => { const cards = document.querySelectorAll('#tplBody .tpl-card'); cards[1].querySelector('.tpl-load').click(); })()`);
await sleep(80);
ok('2k. 「载入当前拼接」→ 单元2 items = 当前拼接 2 块', (await evalJS(`state.templates[1].items.length`)) === 2 && (await evalJS(`state.templates[1].items[0]`)).indexOf('块一') >= 0, JSON.stringify(await evalJS('state.templates[1].items')));
ok('2l. 单元2 名称默认「模板 N」', /^模板 \d+$/.test(await evalJS('state.templates[1].name')), await evalJS('state.templates[1].name'));
/* 完成关闭 */
const doneBtn = await btnPos('tplDone');
await clickAt(doneBtn.x, doneBtn.y);
await sleep(100);
ok('2m. 「完成」关闭窗口', await evalJS(`document.getElementById('tplMask').classList.contains('hide')`));
ok('2n. 模板列表显示 2 项', await evalJS(`document.querySelectorAll('.sp-tpl-item').length`) === 2);

console.log('═══ 3. 套用（多前缀+内容+后缀按序输出） ═══');
await evalJS(`document.querySelector('.sp-tpl-fold').click()`);
await sleep(60);
/* 单元0：前缀×1（画面开始：）+ 内容×2 + 后缀×1 = 4 项 */
const nb0 = await evalJS('state.blocks.length');
await evalJS(`document.querySelectorAll('.sp-tpl-item')[0].querySelector('.sp-tpl-act').click()`);
await sleep(120);
ok('3a. 套用 order = 前缀+2内容+后缀（4 项）', await evalJS('state.order.length') === 4, JSON.stringify(await evalJS('state.order')));
ok('3b. 块数 +4', await evalJS('state.blocks.length') === nb0 + 4);
ok('3c. 顺序：前缀 → 内容1 → 内容2 → 后缀', await evalJS(`(() => {
  const g = id => state.blocks.find(b => b.id === id).text;
  return g(state.order[0]) === '画面开始：' && g(state.order[1]).indexOf('镜头1') >= 0 && g(state.order[2]).indexOf('镜头2') >= 0 && g(state.order[3]) === '画面结束。';
})()`));
ok('3d. toast 含前后缀提示', await evalJS(`document.getElementById('toast').textContent.indexOf('含前后缀') >= 0`));

console.log('═══ 4. 迁移与回归 ═══');
const mig = await evalJS(`(() => {
  const old = { app:'storyboard-prompt-panel', version:6, title:'旧', pan:{x:0,y:0}, order:[], collapsed:false, blocks:[{id:'x1',text:'a',x:0,y:0}], templates:[{ id:'t1', name:'旧模板', prefix:'画面开始：', suffix:'画面结束。', items:['a'] }] };
  const m = migrate(old);
  return { version: m.version, t: m.templates[0] };
})()`);
ok('4a. v6 旧模板迁移：单值 → 数组 + version 7', mig.version === 7 && mig.t.prefixes.length === 1 && mig.t.prefixes[0] === '画面开始：' && mig.t.suffixes.length === 1 && mig.t.suffixes[0] === '画面结束。', JSON.stringify(mig));
/* 删除单元（窗口内） */
const customBtn2 = await btnPos('spTplCustom');
await clickAt(customBtn2.x, customBtn2.y);
await sleep(80);
await evalJS(`document.querySelectorAll('#tplBody .tpl-card')[1].querySelector('.tpl-del').click()`);
await sleep(80);
ok('4b. 窗口内删除单元', await evalJS('state.templates.length') === 1);
await clickAt((await btnPos('tplDone')).x, (await btnPos('tplDone')).y);
/* 列表删除 + 撤销（回归） */
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act.danger').click()`);
await sleep(80);
ok('4c. 列表删除模板', await evalJS('state.templates.length') === 0);
await evalJS(`document.getElementById('toast').querySelector('button').click()`);
await sleep(80);
ok('4d. 撤销恢复', await evalJS('state.templates.length') === 1);
/* Ctrl+V / 多选回归（快速） */
await evalJS(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', '粘贴回归测试'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(ev); })()`);
ok('4e. Ctrl+V 粘贴建块回归', await evalJS(`state.blocks.some(b => b.text === '粘贴回归测试')`));
console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
