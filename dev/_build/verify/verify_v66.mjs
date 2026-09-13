import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.6 headless 验收（CDP 直连，零污染） */
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
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(25); }
async function clickAt(x, y, mods = 0) { await moveTo(600, 1200); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function handlePos(id) {
  return await evalJS(`(() => { const h = document.querySelector('.block[data-id="${id}"] .drag-handle'); if(!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}

await evalJS(`state.blocks = [
  { id: uid(), text: '镜头一：小云特写，转头看向小山', x: 20, y: 20 },
  { id: uid(), text: '镜头二：小山近景，伸个懒腰', x: 414, y: 94 },
  { id: uid(), text: '镜头三：全景，两人对峙', x: 30, y: 260 }
]; state.pan = {x:0,y:0}; render(); spliceClear(); clearSel();`);
const b0 = await evalJS('state.blocks[0].id');
const b1 = await evalJS('state.blocks[1].id');
const b2 = await evalJS('state.blocks[2].id');

console.log('═══ 1. 结构：宽度 / 定制窗口仅前后缀 ═══');
const pw = await evalJS(`document.getElementById('splicePanel').getBoundingClientRect().width`);
ok('1a. 拼接栏宽度加倍（560px）', Math.round(pw) === 560, 'w=' + pw);
await evalJS(`openTplWin();`);
ok('1b. 定制窗口无内容块区（仅前后缀）', await evalJS(`!document.querySelector('#tplBody .tpl-items') && !document.querySelector('#tplBody .tpl-load')`));
await evalJS(`closeTplWin();`);

console.log('═══ 2. 套用模板 → 套用进拼接栏（不建画布块） ═══');
await evalJS(`state.templates = [{ id: uid(), name: '对话场景', prefixes: ['现场情况说明：', '画面开始：'], suffixes: ['画面结束。'] }]; renderTplList();`);
const nBlocks0 = await evalJS('state.blocks.length');
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(120);
ok('2a. splice.items = 1 个单元窗口', await evalJS('state.splice.items.length') === 1 && await evalJS(`state.splice.items[0].type === 'unit'`), JSON.stringify(await evalJS('state.splice.items')));
ok('2b. 单元前后缀正确', await evalJS(`state.splice.items[0].prefixes.length === 2 && state.splice.items[0].suffixes.length === 1 && state.splice.items[0].blockIds.length === 0`), JSON.stringify(await evalJS('state.splice.items[0]')));
ok('2c. 画布块数不变（不建块）', await evalJS('state.blocks.length') === nBlocks0, 'n=' + await evalJS('state.blocks.length'));
ok('2d. 单元窗口渲染：前缀标签×2 + 后缀标签×1 + 空态', await evalJS(`document.querySelectorAll('.sp-unit-prefix').length === 2 && document.querySelectorAll('.sp-unit-suffix').length === 1 && !!document.querySelector('.sp-unit-empty')`), JSON.stringify({ p: await evalJS(`document.querySelectorAll('.sp-unit-prefix').length`), s: await evalJS(`document.querySelectorAll('.sp-unit-suffix').length`) }));
ok('2e. 新单元为激活单元（拼入到此）', await evalJS(`document.querySelector('.sp-unit.active') !== null && document.querySelector('.sp-unit-tag').style.display !== 'none'`));
ok('2f. 拼接计数 = 0', await evalJS(`document.getElementById('spCount').textContent === '0'`));

console.log('═══ 3. 拼入进激活单元（内部 prompt 块圆角小窗） ═══');
await evalJS(`spliceAdd('${b0}'); spliceAdd('${b1}');`);
await sleep(80);
ok('3a. 单元 blockIds = [b0, b1]', await evalJS(`state.splice.items[0].blockIds.length === 2 && state.splice.items[0].blockIds[0] === '${b0}'`), JSON.stringify(await evalJS('state.splice.items[0].blockIds')));
ok('3b. 渲染 2 个块小窗', await evalJS(`document.querySelectorAll('.sp-ublock').length === 2`));
ok('3c. 小窗文本正确', await evalJS(`document.querySelector('.sp-ub-text').textContent.indexOf('镜头一') >= 0`), await evalJS(`document.querySelector('.sp-ub-text').textContent`));
ok('3d. 拼接计数 = 2', await evalJS(`document.getElementById('spCount').textContent === '2'`));
ok('3e. 空态提示已消失', await evalJS(`!document.querySelector('.sp-unit-empty')`));
/* 单元内块 × 移出 */
await evalJS(`document.querySelector('.sp-ub-x').click()`);
await sleep(80);
ok('3f. 小窗 × 移出该块', await evalJS(`state.splice.items[0].blockIds.length === 1 && state.splice.items[0].blockIds[0] === '${b1}'`), JSON.stringify(await evalJS('state.splice.items[0].blockIds')));
await evalJS(`spliceAdd('${b0}')`);

console.log('═══ 4. 套用另一模板 = 替换 ═══');
await evalJS(`state.templates.push({ id: uid(), name: '音效模板', prefixes: ['音效：'], suffixes: [] }); renderTplList();`);
await evalJS(`document.querySelectorAll('.sp-tpl-item')[1].querySelector('.sp-tpl-act').click()`);
await sleep(100);
ok('4a. 替换：items = 1 个新单元（旧单元清空）', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].name === '音效模板' && state.splice.items[0].blockIds.length === 0`), JSON.stringify(await evalJS('state.splice.items.map(u=>u.name)')));
ok('4b. 激活切到新单元', await evalJS(`document.querySelector('.sp-unit.active .sp-unit-name').textContent === '音效模板'`));
await evalJS(`spliceAdd('${b2}')`);
ok('4c. 拼入进新单元', await evalJS(`state.splice.items[0].blockIds.length === 1 && state.splice.items[0].blockIds[0] === '${b2}'`));

console.log('═══ 5. 复制拼接输出格式 ═══');
const captured = await evalJS(`(() => {
  window.__cap = null;
  const orig = copyText;
  copyText = function(t){ window.__cap = t; return Promise.resolve(true); };
  copySpliced();
  copyText = orig;
  return window.__cap;
})()`);
ok('5a. 单元输出 = 前缀们+块+后缀们（值独立行、块间空行）', captured === '音效：\n\n镜头三：全景，两人对峙', JSON.stringify(captured));
/* 双单元 + 平铺块混合输出 */
await evalJS(`state.splice.items.push({ type: 'block', id: '${b0}' }); state.splice.items.push({ type: 'unit', id: uid(), name: 'U2', prefixes: ['开场'], suffixes: ['收尾'], blockIds: ['${b1}'] });`);
const captured2 = await evalJS(`(() => {
  window.__cap = null;
  const orig = copyText;
  copyText = function(t){ window.__cap = t; return Promise.resolve(true); };
  copySpliced();
  copyText = orig;
  return window.__cap;
})()`);
ok('5b. 混合输出：单元1 → 平铺块 → 单元2（条目间空行）', captured2 === '音效：\n\n镜头三：全景，两人对峙\n\n镜头一：小云特写，转头看向小山\n\n开场\n\n镜头二：小山近景，伸个懒腰\n\n收尾', JSON.stringify(captured2));

console.log('═══ 6. 平铺块（无单元时拼入）与迁移 ═══');
await evalJS(`spliceClear(); spliceAdd('${b0}'); spliceAdd('${b1}');`);
ok('6a. 无单元时拼入 = 平铺块条目（依旧平铺）', await evalJS(`state.splice.items.length === 2 && state.splice.items.every(it => it.type === 'block')`), JSON.stringify(await evalJS('state.splice.items')));
ok('6b. 平铺条目渲染为 sp-item', await evalJS(`document.querySelectorAll('.sp-item').length === 2`));
const mig = await evalJS(`(() => {
  const old = { app:'storyboard-prompt-panel', version:7, title:'旧', pan:{x:0,y:0}, order:['${b0}','${b1}'], collapsed:false, blocks: state.blocks.map(b=>({id:b.id,text:b.text,x:b.x,y:b.y})), templates:[{ id:'t1', name:'旧模板', prefixes:['前'], suffixes:['后'] }] };
  const m = migrate(old);
  return { version: m.version, items: m.splice.items, templates: m.templates[0] };
})()`);
ok('6c. v7 旧数据迁移：order 平铺 → 块条目（依旧平铺）', mig.version === 8 && mig.items.length === 2 && mig.items.every(it => it.type === 'block'), JSON.stringify(mig.items));
ok('6d. 旧模板保留前后缀（items 已弃用）', mig.templates.prefixes.length === 1 && mig.templates.suffixes.length === 1 && !mig.templates.items, JSON.stringify(mig.templates));

console.log('═══ 7. 回归：右键拼入手势进激活单元 / 画布删块同步移除 / Ctrl+V ═══');
await evalJS(`state.splice.items = [{ type: 'unit', id: uid(), name: '回归单元', prefixes: ['开场'], suffixes: [], blockIds: [] }]; state.splice.activeUnitId = state.splice.items[0].id; renderSplice();`);
const h0 = await handlePos(b0);
await moveTo(600, 1200); await moveTo(h0.x, h0.y);
await mouse('mousePressed', h0.x, h0.y, 'right', 1);
for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', h0.x + (1000 - h0.x) * i / 8, h0.y + (700 - h0.y) * i / 8); await sleep(20); }
await mouse('mouseReleased', 1000, 700, 'right', 1);
await sleep(150);
ok('7a. 右键拖把手拼入 → 进激活单元', await evalJS(`state.splice.items[0].blockIds.length === 1 && state.splice.items[0].blockIds[0] === '${b0}'`), JSON.stringify(await evalJS('state.splice.items[0].blockIds')));
await evalJS(`spliceAdd('${b1}'); spliceClear(); state.splice.items = [{ type: 'unit', id: uid(), name: 'U', prefixes: [], suffixes: [], blockIds: ['${b0}','${b1}'] }]; state.splice.activeUnitId = state.splice.items[0].id;`);
await evalJS(`spliceRemoveIds(['${b0}']);`);
ok('7b. 画布删块同步从单元移除', await evalJS(`state.splice.items[0].blockIds.length === 1 && state.splice.items[0].blockIds[0] === '${b1}'`), JSON.stringify(await evalJS('state.splice.items[0].blockIds')));
await evalJS(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', '粘贴回归'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.dispatchEvent(ev); })()`);
ok('7c. Ctrl+V 粘贴建块回归', await evalJS(`state.blocks.some(b => b.text === '粘贴回归')`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
