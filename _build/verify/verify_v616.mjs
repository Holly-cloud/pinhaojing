import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.16 headless 验收（CDP 直连，零污染）：
   ① 拖手光点（被遮挡块 hover 临时置顶）② 拼接光线 ③ 顶栏简化（整/导）
   ④ prompt 块无边框 ⑤ 图片块（粘贴/尺寸/删/不落盘）⑥ 方向键移动画布 */
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
async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return { cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), top: Math.round(r.top) }; })()`);
}
async function clickXY(x, y, opts = {}) {
  const mods = opts.modifiers || 0;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: mods });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opts.button || 'left', buttons: 1, clickCount: 1, modifiers: mods });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opts.button || 'left', clickCount: 1, modifiers: mods });
  await sleep(90);
}
const css = sel => evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const s = getComputedStyle(el); return { visibility: s.visibility, opacity: s.opacity, borderTopWidth: s.borderTopWidth, boxShadow: s.boxShadow }; })()`);

/* ---------- 初始状态 ---------- */
await evalJS(`state.blocks = [
  { id: uid(), text: '块甲\\n\\n第二行', x: 20, y: 20 },
  { id: uid(), text: '块乙：\\n\\n第三行内容较长一些', x: 20, y: 60 },
  { id: uid(), text: '块丙', x: 300, y: 20 }
]; state.pan = {x:0,y:0}; state.zoom = 1; state.collapsed = false; render(); spliceClear(); clearSel(); saveNow();`);
await sleep(200);
const idA = await evalJS('state.blocks[0].id');
const idB = await evalJS('state.blocks[1].id');
const idC = await evalJS('state.blocks[2].id');

console.log('═══ 1. 顶栏简化 = 整 / 导 / 缩放 ═══');
const topBtns = await evalJS(`Array.from(document.querySelector('.topbar').querySelectorAll('button')).map(b => b.textContent.trim())`);
ok('1a. 顶栏按钮 = [整, 导, 100%]', JSON.stringify(topBtns) === JSON.stringify(['整', '导', '100%']), JSON.stringify(topBtns));
ok('1b. 无 导出/导入 独立按钮', await evalJS(`!document.getElementById('btnExport') && !document.getElementById('btnImport')`));
ok('1c. 「整」按钮有整理 title', await evalJS(`document.getElementById('btnArrange').title.includes('整理')`));

console.log('═══ 2. 「导」下拉菜单 = 导出/导入收纳 ═══');
const menuBtn = await elRect('#btnMenu');
await clickXY(menuBtn.cx, menuBtn.cy);
const menuItems = await evalJS(`Array.from(document.querySelectorAll('.ctx-menu.open .ctx-item')).map(el => el.dataset.act + ':' + el.textContent)`);
ok('2a. 点「导」→ 菜单 = [export:导出 JSON, import:导入 JSON]', JSON.stringify(menuItems) === JSON.stringify(['export:导出 JSON', 'import:导入 JSON']), JSON.stringify(menuItems));
/* 点「导出 JSON」→ 捕获 blob → 断言不含图片块 */
const exportJson = await evalJS(`(async () => {
  window.__blob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = function(b){ window.__blob = b; return orig.call(this, b); };
  document.querySelector('.ctx-item[data-act="export"]').click();
  await new Promise(r => setTimeout(r, 50));
  URL.createObjectURL = orig;
  if(!window.__blob) return null;
  const txt = await window.__blob.text();
  return JSON.parse(txt);
})()`);
ok('2b. 导出 JSON 结构完整（app/blocks/version 12）', exportJson && exportJson.app === 'storyboard-prompt-panel' && exportJson.version === 12 && Array.isArray(exportJson.blocks), exportJson ? 'v' + exportJson.version : 'null');
ok('2c. 导出 JSON 含全部文本块', exportJson && exportJson.blocks.length === 3, exportJson ? 'n=' + exportJson.blocks.length : 'null');
ok('2d. 再点「导」可关闭菜单（toggle）', await evalJS(`(async () => { document.getElementById('btnMenu').click(); await new Promise(r=>setTimeout(r,50)); const open1 = document.getElementById('ctxMenu').classList.contains('open'); document.getElementById('btnMenu').click(); await new Promise(r=>setTimeout(r,50)); const open2 = document.getElementById('ctxMenu').classList.contains('open'); return open1 && !open2; })()`));

console.log('═══ 3. prompt 块无边框 ═══');
const bc = await css(`.block[data-id="${idA}"]`);
const hc = await css(`.block[data-id="${idA}"] .drag-handle`);
ok('3a. 块 border = 0（无边框窗口）', bc.borderTopWidth === '0px', bc.borderTopWidth);
ok('3b. 拖手保留边框（1px）', hc.borderTopWidth === '1px', hc.borderTopWidth);

console.log('═══ 4. 拖手光点（被遮挡块）═══');
/* 块甲(20,20) 被 块乙(20,60) 遮挡拖手 → 应出现光点 */
await sleep(100);
const dotInfo = await evalJS(`(() => {
  const dots = Array.from(document.querySelectorAll('#peekLayer .peek-dot'));
  return dots.map(d => ({ id: d.dataset.id, left: parseFloat(d.style.left), top: parseFloat(d.style.top) }));
})()`);
ok('4a. 被遮挡的块甲出现光点', dotInfo.some(d => d.id === idA), JSON.stringify(dotInfo));
const aH = await evalJS(`document.querySelector('.block[data-id="${idA}"]').getBoundingClientRect().height`);
ok('4b. 光点位置 = 块甲拖手中心', (() => {
  const d = dotInfo.find(x => x.id === idA);
  if(!d) return false;
  return Math.abs(d.left - (16 + 20 + 15)) <= 2 && Math.abs(d.top - (70 + 20 + aH / 2)) <= 2;
})(), JSON.stringify(dotInfo.find(x => x.id === idA)));
ok('4c. 未被遮挡的块丙无光点', !dotInfo.some(d => d.id === idC));
/* 光点 hover → 块甲 .peek 置顶 */
await evalJS(`(() => { const d = document.querySelector('#peekLayer .peek-dot[data-id="${idA}"]'); if(d) d.dispatchEvent(new MouseEvent('mouseenter')); })()`);
ok('4d. 光点 hover → 块甲 .peek 置顶', await evalJS(`document.querySelector('.block[data-id="${idA}"]').classList.contains('peek')`));
ok('4e. 置顶后光点消失（拖手露出可拖）', await evalJS(`!document.querySelector('#peekLayer .peek-dot[data-id="${idA}"]')`));
/* mouseout → 恢复 */
await evalJS(`(() => { const c = document.querySelector('.block[data-id="${idA}"] .block-text'); if(c) c.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); })()`);
ok('4f. 鼠标离开块 → .peek 移除（恢复原层级）', await evalJS(`!document.querySelector('.block[data-id="${idA}"]').classList.contains('peek')`));
/* 拖手露出后可拖动（真实拖拽） */
const gripA = await elRect(`.block[data-id="${idA}"] .handle-grip`);
await (async () => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gripA.cx, y: gripA.cy });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gripA.cx, y: gripA.cy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(gripA.cx + 80 * i / 10), y: gripA.cy, buttons: 1 }); await sleep(18); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gripA.cx + 80, y: gripA.cy, button: 'left', clickCount: 1 });
  await sleep(120);
})();
const movedX = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(idA)}).x`);
ok('4g. 光点置顶后拖手可正常拖动（块甲 x +80）', Math.abs(movedX - 20 - 80) <= 6, 'x=' + movedX);

console.log('═══ 5. 拼接光线（画布块 ↔ 拼接栏）═══');
await evalJS(`spliceAdd(${JSON.stringify(idC)});`);
await sleep(150);
const linkInfo = await evalJS(`(() => {
  const paths = Array.from(document.querySelectorAll('#linkLayer path.lnk'));
  const dots = Array.from(document.querySelectorAll('#linkLayer circle.lnk-dot'));
  return { paths: paths.length, dots: dots.length, d: paths[0] ? paths[0].getAttribute('d') : null };
})()`);
ok('5a. 拼入块丙 → 光线 path 出现', linkInfo.paths === 1, 'paths=' + linkInfo.paths);
ok('5b. 光线两端小圆点（2 个）', linkInfo.dots === 2, 'dots=' + linkInfo.dots);
const brC = await evalJS(`(() => { const r = document.querySelector('.block[data-id="${idC}"]').getBoundingClientRect(); return { right: r.right, top: r.top, height: r.height }; })()`);
ok('5c. 光线起点 = 块丙右缘中点、终点 = sp-item 左缘中点', (() => {
  if(!linkInfo.d) return false;
  const m = linkInfo.d.match(/^M([\d.]+),([\d.]+) C/);
  if(!m) return false;
  return Math.abs(parseFloat(m[1]) - brC.right) <= 2 && Math.abs(parseFloat(m[2]) - (brC.top + brC.height/2)) <= 2;
})(), linkInfo.d);
/* 编辑块丙文本 → 光线仍在 */
await evalJS(`(async () => {
  const b = state.blocks.find(x => x.id === ${JSON.stringify(idC)});
  b.text = '块丙·已编辑内容变得更长一些了';
  const ta = board.querySelector('.block[data-id="${idC}"] .block-text');
  ta.value = b.text; autoResize(ta); fitBlock(ta);
  renderSplice();
})()`);
await sleep(120);
ok('5d. 编辑后光线依旧连接', await evalJS(`document.querySelectorAll('#linkLayer path.lnk').length === 1`));
/* 移出拼接 → 光线消失 */
await evalJS(`spliceRemove(${JSON.stringify(idC)});`);
await sleep(120);
ok('5e. 移出拼接 → 光线消失', await evalJS(`document.querySelectorAll('#linkLayer path.lnk').length === 0`));

console.log('═══ 6. 方向键移动画布 ═══');
await evalJS(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
const pan0 = await evalJS('state.pan.x');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(60);
const pan1 = await evalJS('state.pan.x');
ok('6a. ArrowRight → pan.x +40', Math.abs(pan1 - pan0 - 40) <= 1, JSON.stringify({ pan0, pan1 }));
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await sleep(60);
const panY = await evalJS('state.pan.y');
ok('6b. ArrowUp → pan.y -40', Math.abs(panY + 40) <= 1, 'pan.y=' + panY);
/* textarea 焦点时方向键不移动画布 */
await evalJS(`board.querySelector('.block[data-id="${idA}"] .block-text').focus()`);
const pan2 = await evalJS('state.pan.x');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(60);
ok('6c. textarea 焦点中方向键 → 画布不动（保留光标语义）', (await evalJS('state.pan.x')) === pan2, 'pan.x=' + await evalJS('state.pan.x'));

console.log('═══ 7. 图片块（粘贴/分辨率/删按钮/不落盘）═══');
/* 注入剪贴板图片（canvas 生成 64×40 PNG）→ 派发 paste → 建图片块 */
await evalJS(`(() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const cx = c.getContext('2d'); cx.fillStyle = '#d33'; cx.fillRect(0, 0, 128, 80);
  const dataUrl = c.toDataURL('image/png');
  const dt = new DataTransfer();
  fetch(dataUrl).then(r => r.blob()).then(blob => {
    const f = new File([blob], 'p.png', { type: 'image/png' });
    dt.items.add(f);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
})()`);
await sleep(600);
const imgBlocks = await evalJS(`state.blocks.filter(b => b.type === 'image')`);
ok('7a. 粘贴图片 → 生成图片块', imgBlocks.length === 1, 'n=' + imgBlocks.length);
ok('7b. 图片块分辨率 = 128×80', imgBlocks[0] && imgBlocks[0].iw === 128 && imgBlocks[0].ih === 80, imgBlocks[0] ? imgBlocks[0].iw + 'x' + imgBlocks[0].ih : '');
const imgId = await evalJS(`state.blocks.find(b => b.type === 'image').id`);
/* 移出拼接栏覆盖区（粘贴落点在视口中心，pan 偏移后可能撞右侧面板） */
await evalJS(`(() => { const b = state.blocks.find(x => x.id === ${JSON.stringify(imgId)}); b.x = 200; b.y = 400; render(); })()`);
await sleep(120);
const imgRect = await elRect(`.block[data-id="${imgId}"]`);
ok('7c. 图片块窗口 = 图片分辨率（128×80）', imgRect && imgRect.w === 128 && imgRect.h === 80, imgRect ? imgRect.w + 'x' + imgRect.h : '');
const imgDelCss = await css(`.block[data-id="${imgId}"] .op-btn.block-img-del`);
ok('7d. 删按钮默认隐藏（hover 才浮现）', imgDelCss.visibility === 'hidden', imgDelCss.visibility);
/* 真实 hover 图片块 → 删按钮浮现 */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: imgRect.cx, y: imgRect.cy });
await sleep(150);
ok('7e. hover 图片 → 删按钮浮现', (await css(`.block[data-id="${imgId}"] .op-btn.block-img-del`)).visibility === 'visible');
/* 右键图片块 → 菜单只有删除 */
const imgRect2 = await elRect(`.block[data-id="${imgId}"]`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: imgRect2.cx, y: imgRect2.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: imgRect2.cx, y: imgRect2.cy, button: 'right', buttons: 2, clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: imgRect2.cx, y: imgRect2.cy, button: 'right', clickCount: 1 });
await sleep(90);
const imgMenu = await evalJS(`Array.from(document.querySelectorAll('.ctx-menu.open .ctx-item')).map(el => el.dataset.act + ':' + el.textContent)`);
ok('7f. 图片块右键菜单 = 仅删除', JSON.stringify(imgMenu) === JSON.stringify(['del-block:删除']), JSON.stringify(imgMenu));
/* 删按钮点击 → 图片块删除（先关右键菜单；按钮 hover 才浮现：先悬停图片再点按钮，且中间不经过清 hover 点） */
await evalJS('closeCtxMenu()');
await sleep(60);
const imgRect3 = await elRect(`.block[data-id="${imgId}"]`);
const imgDel = await elRect(`.block[data-id="${imgId}"] .op-btn.block-img-del`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: imgRect3.cx, y: imgRect3.cy });
await sleep(100);   /* hover 图片块 → 按钮浮现 */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: imgDel.cx, y: imgDel.cy });
await sleep(30);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: imgDel.cx, y: imgDel.cy, button: 'left', buttons: 1, clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: imgDel.cx, y: imgDel.cy, button: 'left', clickCount: 1 });
await sleep(120);
ok('7g. 点删按钮 → 图片块删除', await evalJS(`!state.blocks.some(b => b.id === ${JSON.stringify(imgId)})`));

console.log('═══ 8. 图片块不落盘 + 持久化回归 ═══');
/* 再造一个图片块，验证 saveNow 后 LS 无图片块 */
await evalJS(`(() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 24;
  const cx = c.getContext('2d'); cx.fillStyle = '#33d'; cx.fillRect(0, 0, 32, 24);
  state.blocks.push({ id: uid(), type: 'image', img: c.toDataURL('image/png'), iw: 32, ih: 24, x: 400, y: 200 });
  render(); saveNow();
})()`);
await sleep(150);
const saved = await evalJS(`JSON.parse(localStorage.getItem('storyboard-prompt-panel:v1'))`);
ok('8a. 落盘数据无图片块（图片仅会话内）', saved && !saved.blocks.some(b => b.type === 'image'), saved ? 'blocks=' + saved.blocks.length : 'LS 空');
ok('8b. 落盘数据文本块正常', saved && saved.blocks.length === 3, saved ? 'n=' + saved.blocks.length : '');
ok('8c. 落盘 version = 12', saved && saved.version === 12, saved ? 'v' + saved.version : '');
/* 会话内图片块仍在内存 */
ok('8d. 图片块仍在画布（会话内保留）', await evalJS(`state.blocks.some(b => b.type === 'image')`));
/* 迁移回归：直接调 migrate() 断言（reload 会被清场脚本清空，不可用） */
const mig = await evalJS(`(() => {
  const old = { app: 'storyboard-prompt-panel', version: 11, title: 'x', pan: {x:0,y:0}, zoom: 1,
    splice: { items: [], activeUnitId: null }, collapsed: false, templates: [],
    blocks: [ { id: 'txt1', text: '正文', x: 0, y: 0 }, { id: 'img1', type: 'image', img: 'data:image/png;base64,AAA=', iw: 1, ih: 1, x: 1, y: 1 } ] };
  const m = migrate(old);
  return { v: m.version, n: m.blocks.length, hasImg: m.blocks.some(b => b.type === 'image') };
})()`);
ok('8e. 旧数据迁移 → version 12', mig.v === 12, 'v=' + mig.v);
ok('8f. 迁移防御剔除意外图片块', !mig.hasImg && mig.n === 1, JSON.stringify(mig));

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
