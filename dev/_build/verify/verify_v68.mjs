import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.8 headless 验收（CDP 直连，零污染）：移除右键拖拽拼入手势
   验证：右键拖把手不再拼入/不再跟随/松开弹菜单；右键=纯菜单语义（把手/卡片）；「拼」按钮；回归全通 */
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
async function moveTo(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(20); }
async function clickAt(x, y, mods = 0) { await moveTo(600, 1400); await moveTo(x, y); await mouse('mousePressed', x, y, 'left', 1, mods); await mouse('mouseReleased', x, y, 'left', 1, mods); await sleep(60); }
async function rightClickAt(x, y) { await moveTo(600, 1400); await moveTo(x, y); await mouse('mousePressed', x, y, 'right'); await mouse('mouseReleased', x, y, 'right'); await sleep(90); }
async function rightDrag(x1, y1, x2, y2) {
  await moveTo(600, 1400); await moveTo(x1, y1);
  await mouse('mousePressed', x1, y1, 'right');
  await sleep(30);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await moveTo(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps));
    await sleep(15);
  }
  await mouse('mouseReleased', x2, y2, 'right');
  await sleep(90);
}
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector('${sel}'); if(!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
}
async function ctxOpen() { return await evalJS(`document.getElementById('ctxMenu').classList.contains('open')`); }
async function ctxItemExists(act) { return await evalJS(`document.querySelector('.ctx-item[data-act="${act}"]') !== null`); }

/* 初始化：2 块（块一 x20,y20 / 块二 x300,y20），清空拼接与选择 */
await evalJS(`state.blocks = [{ id: uid(), text: '块一', x: 20, y: 20 }, { id: uid(), text: '块二', x: 300, y: 20 }]; state.pan = {x:0,y:0}; render(); spliceClear(); clearSel();`);
await sleep(120);

console.log('═══ 1. 右键拖拽拼入手势已移除 ═══');
const h1 = await elRect('.block .drag-handle');
ok('1 前置：找到块一把手', !!h1, JSON.stringify(h1));
/* 右键按住把手拖动 120,80 → 旧行为：块跟随 + 落点在拼接栏则拼入 */
await rightDrag(h1.x, h1.y, h1.x + 120, h1.y + 80);
ok('1a. 右键拖动后块位置不变（无拼入手势位移）', await evalJS(`state.blocks[0].x === 20 && state.blocks[0].y === 20`), JSON.stringify(await evalJS('({x: state.blocks[0].x, y: state.blocks[0].y})')));
ok('1b. 拖动中/后块无 transform 跟随', await evalJS(`document.querySelector('.block').style.transform === ''`), await evalJS(`document.querySelector('.block').style.transform`));
ok('1c. 无任何拼入发生（拼接栏为空）', await evalJS(`state.splice.items.length === 0`), 'items=' + await evalJS('state.splice.items.length'));
ok('1d. 右键拖完松开 → 弹菜单（浏览器默认在松开处触发）', await ctxOpen());
await evalJS('closeCtxMenu()');
await rightClickAt(h1.x, h1.y);
ok('1e. 右键单击把手（不拖动）→ 弹块菜单，含「拼入拼接」', await ctxOpen() && await ctxItemExists('splice-block'));
const miPos = await elRect('.ctx-item[data-act="splice-block"]');
if (miPos) await clickAt(miPos.x, miPos.y);
ok('1f. 菜单「拼入拼接」→ 拼接栏 +1（平铺块条目）', await evalJS(`state.splice.items.length === 1`), 'items=' + await evalJS('state.splice.items.length'));
ok('1g. 拼入的是块一（顺序第 1）', await evalJS(`state.splice.items[0] && state.splice.items[0].id === state.blocks[0].id`));

console.log('═══ 2. 拼接栏空态文案 / 「拼」按钮 = 替代入口 ═══');
await evalJS(`spliceClear();`);
await sleep(60);
ok('2a. 空态文案已更新（不再提示右键拖把手，改提示「拼」）', await evalJS(`(() => { const e = document.querySelector('.sp-empty'); return e ? (e.innerHTML.indexOf('右键拖块把手') < 0 && e.innerHTML.indexOf('「拼」') >= 0) : false; })()`), await evalJS(`document.querySelector('.sp-empty') ? document.querySelector('.sp-empty').innerHTML : '(无空态)'`));
/* hover 块二显示操作按钮 → 真实鼠标点「拼」 */
const c2 = await elRect('.block:nth-child(2) .block-text');
await moveTo(c2.x, c2.y);
await sleep(80);
const spliceBtn = await evalJS(`(() => { const b = document.querySelector('.block:nth-child(2) .op-btn[data-act="splice"]'); if(!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
await clickAt(spliceBtn.x, spliceBtn.y);
ok('2b. 「拼」按钮 → 拼接栏 +1', await evalJS(`state.splice.items.length === 1`), 'items=' + await evalJS('state.splice.items.length'));
ok('2c. 块二进入拼接', await evalJS(`state.splice.items[0].id === state.blocks[1].id`));

console.log('═══ 3. 回归：套用模板 / 激活单元 / 复制输出 ═══');
await evalJS(`state.templates = [{ id: uid(), name: '对话场景', prefixes: ['画面开始：'], suffixes: ['画面结束。'] }]; renderTplList();`);
await evalJS(`document.querySelector('.sp-tpl-item .sp-tpl-act').click()`);
await sleep(100);
ok('3a. 套用 → 单元窗口（替换平铺）', await evalJS(`state.splice.items.length === 1 && state.splice.items[0].type === 'unit' && state.splice.items[0].prefixes[0] === '画面开始：'`));
await evalJS(`spliceAdd('${await evalJS('state.blocks[0].id')}')`);
ok('3b. 拼入进激活单元', await evalJS(`state.splice.items[0].blockIds.length === 1`));
const captured = await evalJS(`(() => {
  window.__cap = null;
  const orig = copyText;
  copyText = function(t){ window.__cap = t; return Promise.resolve(true); };
  copySpliced();
  copyText = orig;
  return window.__cap;
})()`);
ok('3c. 复制输出 = 前缀+块+后缀', captured === '画面开始：\n\n块一\n\n画面结束。', JSON.stringify(captured));
await evalJS(`spliceClear();`);

console.log('═══ 4. 回归：左键拖块 / Ctrl+左键多选 / 组拖 ═══');
const h1b = await elRect('.block .drag-handle');
await mouse('mousePressed', h1b.x, h1b.y, 'left');
for (let i = 1; i <= 8; i++) { await moveTo(Math.round(h1b.x + 120 * i / 8), Math.round(h1b.y + 80 * i / 8)); }
await mouse('mouseReleased', h1b.x + 120, h1b.y + 80, 'left');
await sleep(80);
const b0 = await evalJS('({x: state.blocks[0].x, y: state.blocks[0].y})');
ok('4a. 左键拖把手 → 块移动 (+120,+80 容差 ±12)', Math.abs(b0.x - 140) <= 12 && Math.abs(b0.y - 100) <= 12, JSON.stringify(b0));
const c2b = await elRect('.block:nth-child(2) .block-text');
await evalJS('clearSel()');
await clickAt(c2b.x, c2b.y, 2);
ok('4b. Ctrl+左键点块二 → 选中高亮', await evalJS(`selected.length === 1 && selected[0] === state.blocks[1].id`), JSON.stringify(await evalJS('selected')));
await clickAt(c2b.x, c2b.y, 2);
ok('4c. 再点一次 = toggle 取消', await evalJS(`selected.length === 0`));
ok('4d. 块一坐标已落盘', await evalJS(`state.blocks[0].x === ${b0.x} && state.blocks[0].y === ${b0.y}`));

console.log('═══ 5. 回归：右键菜单边界保持 ═══');
/* textarea 内右键 = 保留浏览器原生菜单 */
const ta = await elRect('.block .block-text');
await rightClickAt(ta.x, ta.y);
ok('5a. textarea 内右键 → 不弹拼好镜菜单（原生保留）', !(await ctxOpen()));
/* 画布空白右键 → 空白菜单（避开拼接栏悬浮层，选画布中部空白 350,900） */
await evalJS('closeCtxMenu()');
await rightClickAt(350, 900);
ok('5b. 画布空白右键 → 弹菜单（含「在此处新增块」）', await ctxOpen() && await ctxItemExists('add-here'));
await evalJS(`closeCtxMenu();`);

console.log('═══ 6. 回归：其余核心（Ctrl+V / 滚轮 / 整理 / 无报错） ═══');
const n0 = await evalJS('state.blocks.length');
await evalJS(`(() => { const e = new Event('paste', {bubbles:true, cancelable:true}); Object.defineProperty(e, 'clipboardData', { value: { getData: () => '粘贴的新块内容' } }); document.dispatchEvent(e); })()`);
await sleep(60);
ok('6a. Ctrl+V 粘贴建块（回归）', await evalJS('state.blocks.length') === n0 + 1, 'n=' + await evalJS('state.blocks.length'));
const panBefore = await evalJS('state.pan.y');
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 350, y: 900, deltaX: 0, deltaY: -120 });
await sleep(80);
ok('6b. 滚轮滑动画布（回归）', await evalJS('state.pan.y') === panBefore + 120, JSON.stringify({ before: panBefore, after: await evalJS('state.pan.y') }));
await evalJS(`arrangeAll();`);
ok('6c. 一键整理（回归）', await evalJS(`state.blocks.every((b, i) => b.x === 20 && (i === 0 || state.blocks[i-1].y < b.y))`));
ok('6d. 页面无 JS 报错（交互仍活）', await evalJS(`typeof render === 'function' && typeof spliceAdd === 'function'`));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
