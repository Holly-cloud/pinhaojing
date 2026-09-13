import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.17 headless 验收（CDP 直连，零污染）：
   ① 方向键 LOL 式平滑 + 镜头语义方向修正 ② 图片块无拖手/按图拖动 ③ 中键任意位置拖动画布
   ④ 遮挡关系：操作记录置顶（active）+ 层级判定 */
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
  return await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return { cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; })()`);
}
async function clickXY(x, y, opts = {}) {
  const mods = opts.modifiers || 0;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: mods });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opts.button || 'left', buttons: opts.buttons || 1, clickCount: 1, modifiers: mods });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opts.button || 'left', buttons: opts.buttons || 1, clickCount: 1, modifiers: mods });
  await sleep(90);
}
async function dragXY(x1, y1, x2, y2) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= 12; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x1 + (x2 - x1) * i / 12), y: Math.round(y1 + (y2 - y1) * i / 12), buttons: 1 });
    await sleep(20);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
  await sleep(120);
}
const key = async (k, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vk });
  await sleep(30);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk });
  await sleep(60);
};

/* ---------- 初始状态：块甲(20,20)、块乙(20,80)重叠；块丙(300,20)独立 ---------- */
await evalJS(`state.blocks = [
  { id: uid(), text: '块甲内容', x: 20, y: 20 },
  { id: uid(), text: '块乙内容较长一些', x: 20, y: 80 },
  { id: uid(), text: '块丙', x: 300, y: 20 }
]; state.pan = {x:0,y:0}; state.zoom = 1; state.collapsed = false; render(); spliceClear(); clearSel(); saveNow();`);
await sleep(200);
const idA = await evalJS('state.blocks[0].id');
const idB = await evalJS('state.blocks[1].id');
const idC = await evalJS('state.blocks[2].id');

console.log('═══ 1. 方向键：镜头语义方向修正 + LOL 式平滑 ═══');
await evalJS(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
const p0 = await evalJS('state.pan.x');
await key('ArrowRight', 39);
const p1 = await evalJS('state.pan.x');
ok('1a. 按 → pan.x 减小（镜头右移，内容左移——方向修正）', p1 < p0, JSON.stringify({ p0, p1, d: (p1 - p0).toFixed(1) }));
/* 按住 300ms：平滑连续移动 + 加速曲线（后段位移 > 前段） */
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(120);
const q1 = await evalJS('state.pan.x');
await sleep(120);
const q2 = await evalJS('state.pan.x');
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(100);
const q3 = await evalJS('state.pan.x');
ok('1b. 按住 ← 连续平滑移动（两段都有位移）', Math.abs(q1 - p1) > 0.5 && Math.abs(q2 - q1) > 0.5, JSON.stringify({ d1: (q1-p1).toFixed(1), d2: (q2-q1).toFixed(1) }));
ok('1c. 加速曲线：后段位移 > 前段（起步缓→加速）', Math.abs(q2 - q1) > Math.abs(q1 - p1), JSON.stringify({ d1: Math.abs(q1-p1).toFixed(1), d2: Math.abs(q2-q1).toFixed(1) }));
ok('1d. 松手即停（允许 1-2 帧残留 <45px，headless 低帧率下 rAF 停止延迟）', Math.abs(q3 - q2) < 45, 'q3-q2=' + (q3 - q2).toFixed(2));
/* 方向正确性：按住 ← 时 pan.x 增大（镜头左移） */
ok('1e. 按住 ← pan.x 增大（镜头左移）', q2 > p1, JSON.stringify({ p1, q2 }));
/* 对角线 */
const d0 = await evalJS('({x: state.pan.x, y: state.pan.y})');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await sleep(150);
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await sleep(80);
const d1p = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('1f. 同时按 →↓ 对角线移动（x 减小 + y 减小）', d1p.x < d0.x && d1p.y < d0.y, JSON.stringify(d1p));
/* textarea 焦点豁免 */
await evalJS(`board.querySelector('.block[data-id="${idA}"] .block-text').focus()`);
const t0 = await evalJS('state.pan.x');
await key('ArrowRight', 39);
ok('1g. textarea 焦点中方向键不动画布', (await evalJS('state.pan.x')) === t0);

console.log('═══ 2. 图片块：无拖手 + 按图拖动 ═══');
await evalJS(`(() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const cx = c.getContext('2d'); cx.fillStyle = '#d33'; cx.fillRect(0, 0, 128, 80);
  state.blocks.push({ id: uid(), type: 'image', img: c.toDataURL('image/png'), iw: 128, ih: 80, x: 300, y: 300 });
  render();
})()`);
await sleep(150);
const imgId = await evalJS(`state.blocks.find(b => b.type === 'image').id`);
ok('2a. 图片块无拖手（无 .drag-handle）', await evalJS(`!document.querySelector('.block[data-id="${imgId}"] .drag-handle')`));
ok('2b. 图片块无边框', await evalJS(`getComputedStyle(document.querySelector('.block[data-id="${imgId}"]')).borderTopWidth === '0px'`));
const imgR = await elRect(`.block[data-id="${imgId}"]`);
const ix0 = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(imgId)}).x`);
await dragXY(imgR.cx, imgR.cy, imgR.cx + 100, imgR.cy + 50);
const ix1 = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(imgId)}).x`);
ok('2c. 直接按住图片拖动 → 图片块移动（+100/+50）', Math.abs(ix1 - ix0 - 100) <= 6, 'dx=' + (ix1 - ix0));
/* 删按钮位置左下角（left:8 已回位，且 hover 浮现可用）——拖动后重新取图片位置 */
const imgR2 = await elRect(`.block[data-id="${imgId}"]`);
const delR = await elRect(`.block[data-id="${imgId}"] .op-btn.block-img-del`);
ok('2d. 删按钮在图片左下角（left:8 内）', delR && imgR2 && delR.x >= imgR2.x && delR.x - imgR2.x <= 12, delR && imgR2 ? 'dx=' + (delR.x - imgR2.x) : '');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
const imgR3 = await elRect(`.block[data-id="${imgId}"]`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: imgR3.cx, y: imgR3.cy });
await sleep(150);
ok('2e. hover 图片 → 删按钮浮现', (await evalJS(`getComputedStyle(document.querySelector('.block[data-id="${imgId}"] .op-btn.block-img-del')).visibility`)) === 'visible');

console.log('═══ 3. 中键拖动 = 全局平移（不论鼠标在哪里）═══');
/* 中键在块上按下拖动 */
await evalJS(`clearSel(); state.pan = {x:0,y:0}; applyPan();`);
await sleep(80);
const midBtn = await elRect(`.block[data-id="${idC}"] .drag-handle`);
const m0 = await evalJS('({x: state.pan.x, y: state.pan.y})');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: midBtn.cx, y: midBtn.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: midBtn.cx, y: midBtn.cy, button: 'middle', buttons: 4, clickCount: 1 });
await sleep(40);
for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(midBtn.cx + 60 * i / 10), y: Math.round(midBtn.cy + 30 * i / 10), buttons: 4 }); await sleep(18); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: midBtn.cx + 60, y: midBtn.cy + 30, button: 'middle', buttons: 4, clickCount: 1 });
await sleep(150);
const m1 = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('3a. 中键在块上拖动 → 画布平移（pan +60/+30 ±8）', Math.abs(m1.x - m0.x - 60) <= 8 && Math.abs(m1.y - m0.y - 30) <= 8, JSON.stringify({ dx: m1.x - m0.x, dy: m1.y - m0.y }));
ok('3b. 中键平移不动块位置', (await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(idC)}).x`)) === 300);
/* 中键在空白拖动（多步小位移，避免阻尼循环未收敛） */
const m2 = await evalJS('({x: state.pan.x, y: state.pan.y})');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 300, button: 'middle', buttons: 4, clickCount: 1 });
await sleep(40);
for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(200 + 60 * i / 10), y: 300, buttons: 4 }); await sleep(18); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 260, y: 300, button: 'middle', buttons: 4, clickCount: 1 });
await sleep(200);
const m3 = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('3c. 中键在空白拖动 → 画布平移', Math.abs(m3.x - m2.x - 60) <= 8, 'dx=' + (m3.x - m2.x));

console.log('═══ 4. 遮挡关系：操作记录置顶（active）═══');
await evalJS(`clearSel(); state.pan = {x:0,y:0}; applyPan(); render();`);
await sleep(150);
/* 无 active 时：块甲拖手被块乙（DOM 靠后）盖 → 甲光点；乙无光点 */
let dots = await evalJS(`Array.from(document.querySelectorAll('#peekLayer .peek-dot')).map(d => d.dataset.id)`);
ok('4a. 初始：甲被乙遮挡 → 甲有光点', dots.includes(idA), JSON.stringify(dots));
ok('4b. 初始：乙拖手可见 → 乙无光点', !dots.includes(idB), JSON.stringify(dots));
ok('4c. 初始：丙独立 → 丙无光点', !dots.includes(idC), JSON.stringify(dots));
/* 左键点击块乙 → 乙置顶（active）→ 乙不被甲遮挡（甲拖手露出？甲 eff0 < 乙 eff1 → 乙不显示光点，甲仍被乙盖 → 甲光点仍在） */
const bCard = await elRect(`.block[data-id="${idB}"]`);
await clickXY(bCard.cx, bCard.cy);
ok('4d. 点击块乙 → 乙 .active', await evalJS(`document.querySelector('.block[data-id="${idB}"]').classList.contains('active')`));
ok('4e. active 乙不被遮挡 → 无光点', await evalJS(`!document.querySelector('#peekLayer .peek-dot[data-id="${idB}"]')`));
ok('4f. 甲仍被乙（active）盖住 → 甲光点仍在', await evalJS(`!!document.querySelector('#peekLayer .peek-dot[data-id="${idA}"]')`));
/* 点击块丙 → active 转移 */
const cCard = await elRect(`.block[data-id="${idC}"]`);
await clickXY(cCard.cx, cCard.cy);
ok('4g. 点击丙 → active 转移（乙恢复）', await evalJS(`document.querySelector('.block[data-id="${idC}"]').classList.contains('active') && !document.querySelector('.block[data-id="${idB}"]').classList.contains('active')`));
/* render 重建后 active 保持：对丙执行移除空行（render 触发） */
await evalJS(`(() => { const b = state.blocks.find(x => x.id === ${JSON.stringify(idC)}); b.text = '丙行\\n\\n丙行二'; render(); })()`);
await sleep(100);
ok('4h. render 重建后 active 恢复（丙仍置顶）', await evalJS(`document.querySelector('.block[data-id="${idC}"]').classList.contains('active')`));
/* 光点 hover 置顶链路仍正常（peek > active） */
await evalJS(`(() => { const d = document.querySelector('#peekLayer .peek-dot[data-id="${idA}"]'); if(d) d.dispatchEvent(new MouseEvent('mouseenter')); })()`);
ok('4i. 光点 hover → 甲 .peek 临时置顶（即使丙 active）', await evalJS(`document.querySelector('.block[data-id="${idA}"]').classList.contains('peek')`));
await evalJS(`(() => { const c = document.querySelector('.block[data-id="${idA}"] .block-text'); if(c) c.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); })()`);
ok('4j. 鼠标离开 → 甲恢复（peek 移除）', await evalJS(`!document.querySelector('.block[data-id="${idA}"]').classList.contains('peek')`));
/* 文本编辑触发置顶 */
await evalJS(`(() => { const ta = board.querySelector('.block[data-id="${idA}"] .block-text'); ta.value = '甲·编辑'; ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
ok('4k. 编辑块甲 → 甲置顶', await evalJS(`document.querySelector('.block[data-id="${idA}"]').classList.contains('active')`));

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
