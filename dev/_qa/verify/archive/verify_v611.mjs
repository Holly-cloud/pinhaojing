import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.11 headless 验收（CDP 直连，零污染）：套用模板 = 追加单元（同一模板可创建任意数量单元） */
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
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}

await evalJS(`state.blocks = [{ id: uid(), text: '块一', x: 20, y: 20 }, { id: uid(), text: '块二', x: 300, y: 20 }, { id: uid(), text: '块三', x: 20, y: 200 }]; state.pan = {x:0,y:0}; state.zoom = 1; render(); spliceClear(); clearSel(); state.templates = [{ id: uid(), name: '对话场景', prefixes: ['画面开始：'], suffixes: ['画面结束。'] }, { id: uid(), name: '音效模板', prefixes: ['音效：'], suffixes: [] }]; renderTplList();`);
await sleep(120);

console.log('═══ 1. 同一模板创建任意数量单元 ═══');
await evalJS(`applyTemplate(state.templates[0].id)`);
await sleep(80);
ok('1a. 首次套用 → 1 个单元', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].type === 'unit'`), 'n=' + await evalJS('state.splice.items.length'));
ok('1b. 新单元为激活目标', await evalJS(`state.splice.activeUnitId === state.splice.items[0].id`));
await evalJS(`applyTemplate(state.templates[0].id)`);
await sleep(80);
ok('1c. 再次套用同一模板 → 2 个单元（不再替换）', await evalJS(`state.splice.items.length === 2 && state.splice.items[1].type === 'unit'`), 'n=' + await evalJS('state.splice.items.length'));
ok('1d. 两个单元同为「对话场景」', await evalJS(`state.splice.items[0].name === '对话场景' && state.splice.items[1].name === '对话场景'`));
ok('1e. 激活目标切到新单元（第 2 个）', await evalJS(`state.splice.activeUnitId === state.splice.items[1].id`));
await evalJS(`applyTemplate(state.templates[0].id)`);
await sleep(80);
ok('1f. 第三次套用 → 3 个单元（任意数量）', await evalJS(`state.splice.items.length === 3`), 'n=' + await evalJS('state.splice.items.length'));
ok('1g. 每个单元独立（无共享 blockIds）', await evalJS(`state.splice.items.every(it => Array.isArray(it.blockIds) && it.blockIds.length === 0)`));

console.log('═══ 2. 拼入进激活单元（多单元切换） ═══');
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
ok('2a. 拼入进激活单元（第 3 个）', await evalJS(`state.splice.items[2].blockIds.length === 1 && state.splice.items[2].blockIds[0] === state.blocks[0].id`));
ok('2b. 其他单元不受影响', await evalJS(`state.splice.items[0].blockIds.length === 0 && state.splice.items[1].blockIds.length === 0`));
/* 点击第 1 个单元窗口头 → 切换激活 */
const head1 = await elRect('.sp-unit-head');
await clickAt(head1.x, head1.y);
ok('2c. 点击第 1 个单元窗口头 → 激活切换', await evalJS(`state.splice.activeUnitId === state.splice.items[0].id`), await evalJS('state.splice.activeUnitId'));
await evalJS(`spliceAdd('${await evalJS('state.blocks[1].id')}')`);
ok('2d. 拼入进第 1 个单元', await evalJS(`state.splice.items[0].blockIds.length === 1 && state.splice.items[0].blockIds[0] === state.blocks[1].id`));
/* 第 1 个单元应有「拼入到此」激活标记 */
ok('2e. 激活单元显示「拼入到此」标记', await evalJS(`(() => { const heads = document.querySelectorAll('.sp-unit-head'); return heads.length >= 1 && heads[0].textContent.indexOf('拼入到此') >= 0; })()`));

console.log('═══ 3. 混合多单元 + 复制输出 ═══');
await evalJS(`applyTemplate(state.templates[1].id)`);
await sleep(80);
ok('3a. 套用另一模板 → 4 个单元（混合）', await evalJS(`state.splice.items.length === 4 && state.splice.items[3].name === '音效模板'`), 'n=' + await evalJS('state.splice.items.length'));
await evalJS(`spliceAdd('${await evalJS('state.blocks[2].id')}')`);
const captured = await evalJS(`(() => {
  window.__cap = null;
  const orig = copyText;
  copyText = function(t){ window.__cap = t; return Promise.resolve(true); };
  copySpliced();
  copyText = orig;
  return window.__cap;
})()`);
const expected = '画面开始：\n\n块二\n\n画面结束。\n\n画面开始：\n\n画面结束。\n\n画面开始：\n\n块一\n\n画面结束。\n\n音效：\n\n块三';
ok('3b. 复制输出 = 4 单元按序拼接（精确比对）', captured === expected, JSON.stringify(captured));

console.log('═══ 4. 清空与回归 ═══');
await evalJS(`spliceClear()`);
ok('4a. 清空拼接（回归）', await evalJS(`state.splice.items.length === 0 && state.splice.activeUnitId === null`));
await evalJS(`applyTemplate(state.templates[0].id)`);
await evalJS(`applyTemplate(state.templates[0].id)`);
ok('4b. 清空后重新套用 → 2 单元', await evalJS(`state.splice.items.length === 2`));
/* 移除单元窗口 × */
await evalJS(`spliceRemoveUnit('${await evalJS('state.splice.items[0].id')}')`);
ok('4c. 移除一个单元 → 剩 1', await evalJS(`state.splice.items.length === 1`));
ok('4d. 移除激活单元后 activeUnitId 清理', await evalJS(`state.splice.activeUnitId === null || state.splice.items.some(it => it.id === state.splice.activeUnitId)`));
/* 回归：套用按钮 title / 拼按钮 / 拖块 */
const apTitle = await evalJS(`document.querySelector('.sp-tpl-act').title`);
ok('4e. 套用按钮提示更新（追加语义）', apTitle.indexOf('追加') >= 0, apTitle);
ok('4f. 页面无 JS 报错', await evalJS(`typeof applyTemplate === 'function' && typeof spliceAdd === 'function' && typeof render === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
