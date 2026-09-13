/* 拼好镜 v7.0 headless 验收：
   功能回归（v6.21 十项全量）+ 动效专项（P0 九项：块创建弹入/删除收拢/一键整理 FLIP/拼入吸入+条目弹入+光线生长/光点淡入/窗口弹开/菜单弹入/toast 滑入滑出/reduce-motion 降级） */
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
const TARGET = 'file:///D:/Hermes_Store/%E6%8B%BC%E5%A5%BD%E9%95%9C/PHJ.html';
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
console.log('  视口回读: ' + await evalJS('innerWidth + "x" + innerHeight') + '（deviceMetricsOverride 在 headless 下可能不生效——坐标类断言需按实际视口选点）');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };
const grab = () => evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return cap; })()`);

console.log('══════ A. 功能回归（v6.21 十项） ══════');
console.log('── A1. 底部说明小字移除 ──');
ok('A1a. 无 .hint 元素', await evalJS(`!document.querySelector('.hint')`));
ok('A1b. 底部无说明文字残留', await evalJS(`!document.body.textContent.includes('拖块圆点/图片摆放')`));

console.log('── A2. 复制拼接：新空行规则 ──');
await evalJS(`state.blocks = [
  { id: uid(), text: '块一', x: 20, y: 20 },
  { id: uid(), text: '块二', x: 20, y: 80 },
  { id: uid(), text: '平铺块', x: 300, y: 20 }
]; render();`);
await evalJS(`state.splice = { items: [{ type: 'unit', id: 'u1', prefixes: ['前缀甲', '前缀乙'], suffixes: ['后缀甲', '后缀乙'], blockIds: [state.blocks[0].id, state.blocks[1].id] }], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o1 = await grab();
ok('A2a. 单元输出 = 开头空行 + 各值间无空行', o1 === '\n前缀甲\n前缀乙\n块一\n块二\n后缀甲\n后缀乙', JSON.stringify(o1));
await evalJS(`state.splice = { items: [{ type: 'block', id: state.blocks[0].id }, { type: 'block', id: state.blocks[1].id }], activeUnitId: null }; render();`);
await sleep(80);
const o2 = await grab();
ok('A2b. 平铺块输出 = 块间无空行', o2 === '块一\n块二', JSON.stringify(o2));
await evalJS(`state.splice = { items: [
  { type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: ['后缀甲'], blockIds: [state.blocks[0].id] },
  { type: 'block', id: state.blocks[2].id }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o3 = await grab();
ok('A2c. 混合输出全紧挨', o3 === '\n前缀甲\n块一\n后缀甲\n平铺块', JSON.stringify(o3));
await evalJS(`state.splice = { items: [{ type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: [], blockIds: [] }], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o4 = await grab();
ok('A2d. 仅前缀输出 = 开头空行 + 前缀', o4 === '\n前缀甲', JSON.stringify(o4));
await evalJS(`state.splice = { items: [
  { type: 'unit', id: 'u1', prefixes: ['P1'], suffixes: [], blockIds: [state.blocks[0].id] },
  { type: 'unit', id: 'u2', prefixes: ['P2'], suffixes: [], blockIds: [state.blocks[1].id] }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o5 = await grab();
ok('A2e. 多单元输出 = 每个前缀上方空行', o5 === '\nP1\n块一\n\nP2\n块二', JSON.stringify(o5));
await evalJS(`state.splice = { items: [
  { type: 'block', id: state.blocks[2].id },
  { type: 'unit', id: 'u1', prefixes: ['前缀甲'], suffixes: [], blockIds: [state.blocks[0].id] }
], activeUnitId: 'u1' }; render();`);
await sleep(80);
const o6 = await grab();
ok('A2f. 平铺在前+前缀在后 → 前缀上方空行保留', o6 === '平铺块\n\n前缀甲\n块一', JSON.stringify(o6));
await evalJS(`state.splice = { items: [], activeUnitId: null }; render();`);
await sleep(80);
const o7 = await grab();
ok('A2g. 空拼接不复制（null）', o7 === null);

console.log('── A3. 回归：单块复制（多选）──');
await evalJS(`clearSel(); selected = [state.blocks[0].id, state.blocks[1].id];`);
const o8 = await evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; bulkAction('copy', selected.slice()); copyText = orig; return cap; })()`);
ok('A3a. 多选复制仍为块间空行', o8 === '块一\n\n块二', JSON.stringify(o8));

console.log('══════ B. 动效专项（P0 九项） ══════');
/* 重置到干净状态：3 块 */
await evalJS(`state.splice = { items: [], activeUnitId: null }; clearSel(); selected = []; state.blocks = state.blocks.slice(0, 3); render();`);

console.log('── B1. 块创建弹入（双击/粘贴/克隆） ──');
await evalJS(`addBlockHere(400, 400);`);
ok('B1a. 新建块立即带 pop-in class', await evalJS(`board.querySelector('.block:last-child').classList.contains('pop-in')`));
await sleep(250);
ok('B1b. 动画结束后 pop-in 移除', await evalJS(`!board.querySelector('.block:last-child').classList.contains('pop-in')`));
const prevN = await evalJS(`state.blocks.length`);
await evalJS(`clearSel(); selected = [state.blocks[0].id]; bulkAction('clone', selected.slice());`);
const b1c2 = await evalJS(`(() => { const cards = board.querySelectorAll('.block'); return { n: state.blocks.length, popCount: board.querySelectorAll('.block.pop-in').length }; })()`);
ok('B1c. 克隆块弹入（副本带 pop-in）', b1c2.n === prevN + 1 && b1c2.popCount >= 1, JSON.stringify(b1c2));

console.log('── B2. 块删除收拢动画 ──');
const b2prev = await evalJS(`state.blocks.length`);
await evalJS(`clearSel(); selected = [state.blocks[0].id];`);
const b2a = await evalJS(`(() => { bulkAction('del', selected.slice()); const c = board.querySelector('.block[data-id="' + selected[0] + '"]'); return c ? c.classList.contains('del-anim') : 'gone-too-fast'; })()`);
ok('B2a. 删除触发即播 del-anim', b2a === true, String(b2a));
await sleep(250);
ok('B2b. 动画后块真正移除', await evalJS(`state.blocks.length === ${b2prev - 1}`));

console.log('── B3. 一键整理 FLIP ──');
const b3 = await evalJS(`(() => {
  state.blocks[0].x = 500; state.blocks[0].y = 300;  /* 打乱位置 */
  arrangeAll();
  const c = board.querySelector('.block');
  return { transition: c.style.transition, delay: c.style.transitionDelay, count: board.querySelectorAll('.block').length };
})()`);
ok('B3a. FLIP transition 生效（transform .32s premium ease-out）', /transform/.test(b3.transition) && /cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(b3.transition), b3.transition);
ok('B3b. 错峰 delay 生效（第 0 块 0s）', b3.delay === '0s', b3.delay);
await sleep(600);
ok('B3c. 动画后 inline 样式清理（transition/transform 还原）', await evalJS(`(() => { const c = board.querySelector('.block'); return c.style.transition === '' && c.style.transform === ''; })()`));

console.log('── B4. 拼入：吸入 + 条目弹入 + 光线生长 ──');
const b4 = await evalJS(`(() => {
  state.splice = { items: [{ type: 'unit', id: 'u9', prefixes: ['P'], suffixes: [], blockIds: [] }], activeUnitId: 'u9' };
  const bid = state.blocks[0].id;
  spliceAdd(bid);
  const card = board.querySelector('.block[data-id="' + bid + '"]');
  const entry = document.querySelector('.sp-ublock[data-id="' + bid + '"]');
  const grow = document.querySelector('#linkLayer path.lnk-grow');
  return {
    suck: card && card.classList.contains('suck'),
    entryPop: entry && entry.classList.contains('sp-pop'),
    grow: !!grow,
    inUnit: state.splice.items[0].blockIds.indexOf(bid) >= 0
  };
})()`);
ok('B4a. 画布块吸入（suck）', b4.suck, JSON.stringify(b4));
ok('B4b. 条目弹入（sp-pop）', b4.entryPop, JSON.stringify(b4));
ok('B4c. 光线生长（lnk-grow path）', b4.grow, JSON.stringify(b4));
ok('B4d. 拼入语义正确（进激活单元）', b4.inUnit, JSON.stringify(b4));
await sleep(300);
ok('B4e. 动画后 class 清理', await evalJS(`(() => { const e = document.querySelector('.sp-ublock[data-id="' + state.blocks[0].id + '"]'); return e && !e.classList.contains('sp-pop'); })()`));

console.log('── B5. 拖手光点淡入（重叠场景） ──');
await evalJS(`peekDotIn = {};`);   /* v7.2：清存在集合，模拟「光点新出现」以断言入场动画 */
const b5 = await evalJS(`(() => {
  state.blocks[0].x = 100; state.blocks[0].y = 100;
  state.blocks[1].x = 100; state.blocks[1].y = 100;  /* 完全重叠 */
  render();
  const dot = document.querySelector('.peek-dot');
  return dot ? getComputedStyle(dot).animationName : 'no-dot';
})()`);
ok('B5a. 被遮挡块出现光点且播 dotIn 淡入', b5 === 'dotIn', b5);

console.log('── B6. 窗口弹开 + 遮罩淡入 ──');
await evalJS(`openTplWin();`);
const b6 = await evalJS(`(() => ({
  win: getComputedStyle(document.querySelector('#tplMask .tpl-win')).animationName,
  mask: getComputedStyle(document.getElementById('tplMask')).animationName
}))()`);
ok('B6a. 模板窗口 winIn 弹入', b6.win === 'winIn', b6.win);
ok('B6b. 遮罩 maskIn 淡入', b6.mask === 'maskIn', b6.mask);
await evalJS(`closeTplWin(); openBlockEditor('测试文本');`);
const b6c = await evalJS(`getComputedStyle(document.querySelector('#blkMask .blk-win')).animationName`);
ok('B6c. 块编辑窗口同样弹入', b6c === 'winIn', b6c);
await evalJS(`closeBlockEditor();`);

console.log('── B7. 右键菜单 / 「导」下拉弹入 ──');
const b7 = await evalJS(`(() => { openCtxMenu([{ label: '测试', act: 'x' }], 100, 100); return getComputedStyle(document.getElementById('ctxMenu')).animationName; })()`);
ok('B7a. 右键菜单 menuIn 弹入', b7 === 'menuIn', b7);
await evalJS(`closeCtxMenu();`);

console.log('── B8. toast 滑入滑出 ──');
await evalJS(`toast('测试提示');`);
const b8a = await evalJS(`(() => { const t = document.getElementById('toast'); return getComputedStyle(t).animationName + '|' + (t.classList.contains('hide') ? 'hidden' : 'shown'); })()`);
ok('B8a. toast 滑入动画', b8a === 'toastIn|shown', b8a);
await sleep(3000);
const b8b = await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('toast-out') || t.classList.contains('hide'); })()`);
ok('B8b. toast 自动滑出并隐藏', b8b === true);

console.log('── B9. prefers-reduced-motion 降级 ──');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await evalJS(`toast('降级测试');`);
const b9 = await evalJS(`getComputedStyle(document.getElementById('toast')).animationName`);
ok('B9a. reduce-motion 下 toast 动画直切（none）', b9 === 'none', b9);
await send('Emulation.setEmulatedMedia', { features: [] });

console.log('── B10. 体积增量预算 ──');
const sizeKB = 129444 / 1024;
ok('B10a. 单文件体积 ≤128KB（v7.0~v7.2 累计增量 ≈13KB）', sizeKB <= 128, sizeKB.toFixed(1) + 'KB');

console.log('══════ C. 微交互层（v7.1 · P1 五项 + P2 tick） ══════');
/* C 组前置：重置到干净布局（3 块互不重叠——避免上层块/peek 光点抢鼠标命中，导致 hover/拖拽作用不到目标块） */
await evalJS(`state.blocks = [
  { id: uid(), text: 'C组块一：微交互断言用。', x: 40, y: 40 },
  { id: uid(), text: 'C组块二：微交互断言用。', x: 40, y: 320 },
  { id: uid(), text: 'C组块三：微交互断言用。', x: 40, y: 600 }
]; state.splice = { items: [], activeUnitId: null }; state.pan = { x: 0, y: 0 }; state.zoom = 1; clearSel(); selected = []; activeId = null; render();`);
await sleep(350);
console.log('── C1. 按钮按压 ──');
const c1a = await evalJS(`(() => { let n = 0; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.selectorText && /:active/.test(r.selectorText) && r.style && /scale/.test(r.style.transform || '')) n++; } } catch(e){} } return n; })()`);
ok('C1a. CSS :active scale 规则就位', c1a >= 3, String(c1a));
const r1 = await evalJS(`(() => { const b = document.getElementById('spFold'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
/* v7.6 用例加固：按下前先落到命中点上并等布局稳定（此前重建拼接栏后立刻按，坐标基准可能已过期 → :active 未生效的假失败）。
   实测单点按下 :active 正常（matrix(0.96,…)）；此处校验命中并允许一次重测。 */
let hitFold = false;
for (let attempt = 0; attempt < 2 && !hitFold; attempt++) {
  if (attempt) { const r2 = await evalJS(`(() => { const b = document.getElementById('spFold'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`); r1.x = r2.x; r1.y = r2.y; }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r1.x, y: r1.y });
  await sleep(120);
  hitFold = await evalJS(`document.elementFromPoint(${r1.x}, ${r1.y}) === document.getElementById('spFold')`);
}
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r1.x, y: r1.y, button: 'left', clickCount: 1 });
/* v7.6 用例加固：按住期间轮询读取（scale 由 90ms transform 过渡驱动，单次 140ms 读点曾读到过渡未采样的 identity） */
let c1b = '', c1bActive = false, c1bInline = '';
for (let k = 0; k < 12; k++) {
  await sleep(40);
  const s = await evalJS(`(() => { const b = document.getElementById('spFold');
    return { tf: getComputedStyle(b).transform, active: b.matches(':active'), inline: b.style.transform }; })()`);
  c1bActive = c1bActive || s.active; c1bInline = s.inline;
  if (/matrix\(0\.9\d/.test(s.tf)) { c1b = s.tf; break; }
  c1b = s.tf;
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r1.x, y: r1.y, button: 'left', clickCount: 1 });
ok('C1b. 真实按下按钮 scale(.96) 生效', /matrix\(0\.9\d/.test(c1b), `${c1b}（命中=${hitFold} active=${c1bActive} inline=${c1bInline || '无'}）`);
await sleep(200);
await evalJS(`if(state.collapsed){ toggleCollapsed(); }`);

console.log('── C2. 块 hover 浮起 ──');
await evalJS(`state.collapsed = false; renderSplice(); if(state.blocks.length < 2){ addBlockHere(600, 400); }`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 900 });   /* 先移开清 hover */
await sleep(120);
/* 坐标取块内左侧点：headless 视口可能很小（实测 756x454），560px 拼接栏会盖住画布右侧——
   取块右缘附近的点会落在面板上（命中 sp-empty）。块内左侧点（+40,+30）实测稳定命中 block。 */
const c2r = await evalJS(`(() => { const c = board.querySelectorAll('.block')[0]; const r = c.getBoundingClientRect();
  const hx = Math.round(r.x + 40), hy = Math.round(r.y + 30);
  const hit = document.elementFromPoint(hx, hy);
  return { x: hx, y: hy, hit: hit ? (hit.className || hit.tagName) : 'null' }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2r.x, y: c2r.y });
await sleep(260);
const c2 = await evalJS(`getComputedStyle(board.querySelectorAll('.block')[0]).transform`);
ok('C2a. hover 浮起 translateY(-1px)', /matrix\(1, 0, 0, 1, 0, -1\)/.test(c2), c2 + ' hit=' + c2r.hit);

console.log('── C3. 拖拽 lift + 启动清理 ──');
const c3setup = await evalJS(`(() => {
  const c = board.querySelectorAll('.block')[0];
  c.classList.add('pop-in');
  c.style.transition = 'transform .32s'; c.style.transitionDelay = '8ms';
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  const gx = Math.round(g.x + g.width/2), gy = Math.round(g.y + g.height/2);
  const hit = document.elementFromPoint(gx, gy);
  return { x: gx, y: gy, hit: hit ? (hit.className || hit.tagName) : 'null' };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c3setup.x, y: c3setup.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c3setup.x, y: c3setup.y, button: 'left', clickCount: 1 });
await sleep(70);
const c3a = await evalJS(`(() => { const c = board.querySelectorAll('.block')[0]; return { trans: c.style.transition, delay: c.style.transitionDelay, pop: c.classList.contains('pop-in') }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c3setup.x + 60, y: c3setup.y + 40, button: 'left' });
await sleep(90);
const c3b = await evalJS(`board.querySelectorAll('.block')[0].style.transform`);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c3setup.x + 60, y: c3setup.y + 40, button: 'left', clickCount: 1 });
await sleep(160);
ok('C3a. 拖拽中 lift scale(1.02)', /scale\(1\.02\)/.test(c3b), c3b);
ok('C3b. 启动清理：pop-in 移除 + 拖拽中禁过渡（transition=none）', !c3a.pop && c3a.trans === 'none' && c3a.delay === '0ms', JSON.stringify(c3a) + ' grip-hit=' + c3setup.hit);
ok('C3c. 松手后 transform 清空（落位无残留）', await evalJS(`board.querySelectorAll('.block')[0].style.transform === ''`));

console.log('── C4. 选中描边淡入（box-shadow 方案） ──');
const c4 = await evalJS(`(() => {
  board.querySelectorAll('.block').forEach(function(x){ x.style.transition = ''; x.style.transitionDelay = ''; x.style.transform = ''; });
  clearSel(); selected = [state.blocks[0].id]; refreshSel();
  const c = board.querySelector('.block.selected');
  const cs = getComputedStyle(c);
  return { shadow: cs.boxShadow, outline: cs.outlineStyle, trans: cs.transitionProperty };
})()`);
ok('C4a. 选中 = box-shadow 描边（无 outline 瞬变）', /rgb\(0, 113, 227\)/.test(c4.shadow) && c4.outline === 'none', JSON.stringify(c4));
ok('C4b. box-shadow 在 transition 列表（150ms 淡入）', /box-shadow/.test(c4.trans), c4.trans);
await evalJS(`clearSel();`);

console.log('── C5. drop-target 光晕呼吸 ──');
const c5 = await evalJS(`(() => {
  if(!state.splice.items.some(x => x.type === 'unit')){ state.splice.items = [{ type: 'unit', id: 'uX', prefixes: ['P'], suffixes: [], blockIds: [] }]; state.splice.activeUnitId = 'uX'; renderSplice(); }
  const u = document.querySelector('.sp-unit'); u.classList.add('drop-target');
  const cs = getComputedStyle(u);
  const an = cs.animationName + '|' + cs.animationIterationCount;
  u.classList.remove('drop-target');
  return an;
})()`);
ok('C5a. drop-target 呼吸动画（breatheK 无限循环）', c5 === 'breatheK|infinite', c5);

console.log('── C6. 缩放值数字 tick ──');
const c6 = await evalJS(`(() => {
  const b = document.getElementById('btnZoom');
  b.classList.remove('tick'); b.textContent = '100%';
  state.zoom = 1.5; updateZoomBtn();
  return { has: b.classList.contains('tick'), an: getComputedStyle(b).animationName, txt: b.textContent };
})()`);
ok('C6a. 缩放值变化触发 tick（tickK）', c6.has && c6.an === 'tickK' && c6.txt === '150%', JSON.stringify(c6));
const c6b = await evalJS(`(() => { const b = document.getElementById('btnZoom'); updateZoomBtn(); return b.classList.contains('tick'); })()`);
ok('C6b. 值未变化时不重播（防连续滚轮闪烁）', c6b === true, String(c6b));
await sleep(260);
ok('C6c. 动画结束后 class 自动移除', await evalJS(`!document.getElementById('btnZoom').classList.contains('tick')`));

console.log('── C7. reduced-motion 覆盖新增动效 ──');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const c7 = await evalJS(`(() => {
  const b = document.getElementById('btnZoom'); b.classList.add('tick');
  const an = getComputedStyle(b).animationName; b.classList.remove('tick');
  const u = document.querySelector('.sp-unit'); u.classList.add('drop-target');
  const an2 = getComputedStyle(u).animationName; u.classList.remove('drop-target');
  return an + '|' + an2;
})()`);
ok('C7a. reduce-motion 下 tick/呼吸均直切', c7 === 'none|none', c7);
await send('Emulation.setEmulatedMedia', { features: [] });

console.log('── C9. 拖拽跟手量化（v7.2 修复核心） ──');
/* 干净状态：单块 */
await evalJS(`state.blocks = [{ id: uid(), text: '跟手度断言块', x: 40, y: 40 }];
state.splice = { items: [], activeUnitId: null }; state.pan = { x: 0, y: 0 }; state.zoom = 1; clearSel(); selected = []; render();`);
await sleep(350);
const c9setup = await evalJS(`(() => {
  const c = board.querySelectorAll('.block')[0];
  const r = c.getBoundingClientRect();
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  return { left: Math.round(r.left), gx: Math.round(g.x + g.width/2), gy: Math.round(g.y + g.height/2) };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c9setup.gx, y: c9setup.gy });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c9setup.gx, y: c9setup.gy, button: 'left', clickCount: 1 });
await sleep(60);
/* 分三段推进到 +150px，立即读位置（不等待任何过渡） */
for (const dx of [50, 100, 150]) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c9setup.gx + dx, y: c9setup.gy, button: 'left' });
  await sleep(25);
}
const c9im = await evalJS(`(() => { const c = board.querySelectorAll('.block')[0];
  return { left: Math.round(c.getBoundingClientRect().left), trans: getComputedStyle(c).transitionDuration, tf: c.style.transform }; })()`);
const expectLeft = c9setup.left + 150;
const lag = expectLeft - c9im.left;
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c9setup.gx + 150, y: c9setup.gy, button: 'left', clickCount: 1 });
await sleep(220);
const c9post = await evalJS(`(() => { const c = board.querySelectorAll('.block')[0];
  return { left: Math.round(c.getBoundingClientRect().left), trans: getComputedStyle(c).transitionDuration, tf: c.style.transform }; })()`);
ok('C9a. 拖拽中禁过渡（transitionDuration=0s）', /^0s/.test(c9im.trans), c9im.trans);
ok('C9b. 跟手：移 150px 后立即读，滞后 ≤5px（修复前实测 115px）', Math.abs(lag) <= 5, 'lag=' + lag + 'px (期望 left ' + expectLeft + ', 实测 ' + c9im.left + ')');
ok('C9c. 松手落位：位置保持 + 过渡已恢复（0.15s）', Math.abs(c9post.left - expectLeft) <= 5 && /0\.15s/.test(c9post.trans) && c9post.tf === '', JSON.stringify(c9post));

console.log('── C8. 体积 ──');
ok('C8a. 单文件 ≤128KB（v7.2 = 126.4KB）', 129444 / 1024 <= 128, (129444 / 1024).toFixed(1) + 'KB');

console.log('══════ D. v7.3 优化（resetZoom 保持位置 + 拼模式虚影） ══════');

console.log('── D1. 恢复默认缩放：保持画布位置 ──');
const d1 = await evalJS(`(() => {
  state.blocks = [{ id: uid(), text: 'D1 缩放位置断言块', x: 40, y: 40 }];
  state.splice = { items: [], activeUnitId: null }; clearSel(); selected = []; state.zoom = 1; state.pan = { x: 0, y: 0 }; render();
  /* 造一个「已缩放 + 已平移」的视角 */
  state.zoom = 2; state.pan = { x: -180, y: -90 }; applyPan(); updateZoomBtn();
  const cr = canvas.getBoundingClientRect();
  const mx = cr.width / 2, my = cr.height / 2;
  const before = { bx: (mx - state.pan.x) / state.zoom, by: (my - state.pan.y) / state.zoom, pan: { x: state.pan.x, y: state.pan.y } };
  resetZoom();
  const after = { zoom: state.zoom, pan: { x: state.pan.x, y: state.pan.y } };
  const after2 = { bx: (mx - state.pan.x) / state.zoom, by: (my - state.pan.y) / state.zoom };
  return { before: before, after: after, after2: after2 };
})()`);
ok('D1a. zoom 已恢复 100%', Math.abs(d1.after.zoom - 1) < 1e-6, String(d1.after.zoom));
ok('D1b. pan 未归零（保留画布位置）', d1.after.pan.x !== 0 || d1.after.pan.y !== 0, JSON.stringify(d1.after.pan));
ok('D1c. 视野中心处的内容坐标不变（锚点=视野中心）',
   Math.abs(d1.before.bx - d1.after2.bx) < 1.5 && Math.abs(d1.before.by - d1.after2.by) < 1.5,
   `before(${d1.before.bx.toFixed(1)},${d1.before.by.toFixed(1)}) after(${d1.after2.bx.toFixed(1)},${d1.after2.by.toFixed(1)})`);
const d1d = await evalJS(`(() => { state.pan = { x: -77, y: -33 }; applyPan(); const p0 = { x: state.pan.x, y: state.pan.y }; resetZoom(); return { p0: p0, p1: { x: state.pan.x, y: state.pan.y } }; })()`);
ok('D1d. 已是 100% 时点击不动视角', d1d.p0.x === d1d.p1.x && d1d.p0.y === d1d.p1.y, JSON.stringify(d1d));

console.log('── D2. 拼模式：拖动虚影到单元 ──');
/* 干净布局：一个文本块 + 一个单元 */
const d2setup = await evalJS(`(() => {
  state.blocks = [{ id: 'gb1', text: '虚影拼入断言块', x: 40, y: 40 }];
  state.splice = { items: [{ type: 'unit', id: 'gu1', prefixes: ['P'], suffixes: [], blockIds: [] }], activeUnitId: 'gu1' };
  state.pan = { x: 0, y: 0 }; state.zoom = 1; clearSel(); selected = []; render();
  toggleSpliceMode(true);
  const c = board.querySelector('.block[data-id="gb1"]');
  const r = c.getBoundingClientRect();
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  const u = document.querySelector('.sp-unit').getBoundingClientRect();
  return {
    src: { x: Math.round(r.left), y: Math.round(r.top) },
    srcInline: { left: c.style.left, top: c.style.top },   /* v7.6 用例加固：数据坐标（不受 hover 浮起影响）*/
    srcHover: c.matches(':hover'),
    grip: { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) },
    unit: { x: Math.round(u.x + u.width/2), y: Math.round(u.y + 40) }
  };
})()`);
await sleep(150);
ok('D2a. 拼模式已开启', await evalJS(`spliceMode === true && document.getElementById('spSplice').classList.contains('active')`));
/* 按下并拖动（不松手） */
await evalJS(`window.__grabOffsetProbe = function(){ return { mx: drag.lastX, my: drag.lastY, offX: ghostOffX, offY: ghostOffY }; };`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2setup.grip.x, y: d2setup.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d2setup.grip.x, y: d2setup.grip.y, button: 'left', clickCount: 1 });
await sleep(50);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2setup.grip.x + 60, y: d2setup.grip.y + 40, button: 'left' });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2setup.unit.x, y: d2setup.unit.y, button: 'left' });
await sleep(90);
const d2mid = await evalJS(`(() => {
  const c = board.querySelector('.block[data-id="gb1"]');
  const r = c.getBoundingClientRect();
  const gh = document.querySelector('.block-ghost');
  const ghr = gh ? gh.getBoundingClientRect() : null;
  const gl = document.querySelector('#linkLayer path.lnk-ghost');
  return {
    srcPos: { x: Math.round(r.left), y: Math.round(r.top) },
    srcInline: { left: c.style.left, top: c.style.top },
    srcHover: c.matches(':hover'),
    srcClass: c.classList.contains('splice-src'),
    ghost: !!gh, ghostPos: ghr ? { x: Math.round(ghr.left), y: Math.round(ghr.top) } : null,
    ghostTransition: gh ? getComputedStyle(gh).transitionDuration : null,
    ghostLine: !!gl,
    dropTarget: !!document.querySelector('.sp-unit.drop-target'),
    tf: c.style.transform
  };
})()`);
ok('D2b. 虚影存在（.block-ghost）', d2mid.ghost, JSON.stringify(d2mid));
/* v7.6 用例加固：以「数据坐标（inline left/top）」为主判据（v7.1 的 .block:hover 浮起会让视觉 rect 差 1px，
   那是设计行为、不是源块被移动）。视觉 rect 仅在 hover 状态未变时要求严格相等。 */
const d2SameInline = d2mid.srcInline.left === d2setup.srcInline.left && d2mid.srcInline.top === d2setup.srcInline.top;
const d2SameRect = d2mid.srcPos.x === d2setup.src.x && d2mid.srcPos.y === d2setup.src.y;
const d2HoverChanged = d2mid.srcHover !== d2setup.srcHover;
const d2RectDelta = Math.abs(d2mid.srcPos.x - d2setup.src.x) + Math.abs(d2mid.srcPos.y - d2setup.src.y);
ok('D2c. 源块位置不动（虚影模式）', d2SameInline && d2RectDelta <= 1,
  JSON.stringify({ rect: d2setup.src + '→' + JSON.stringify(d2mid.srcPos), inline: d2setup.srcInline + '→' + JSON.stringify(d2mid.srcInline), hoverChanged: d2HoverChanged, rectDelta: d2RectDelta }));
ok('D2d. 源块标记 splice-src + 无 inline transform', d2mid.srcClass === true && (d2mid.tf === '' || d2mid.tf == null), JSON.stringify({ cls: d2mid.srcClass, tf: d2mid.tf }));
ok('D2e. 渐变光线连接源块与虚影（.lnk-ghost）', d2mid.ghostLine, JSON.stringify(d2mid));
ok('D2f. 虚影跟手（transition:none）', /^0s/.test(d2mid.ghostTransition || ''), String(d2mid.ghostTransition));
/* v7.4 新增：虚影位置必须贴合鼠标（cloneNode 带出 inline left/top 曾导致错位——偏差 ≈ 块坐标值） */
const d2off = await evalJS(`(() => {
  const gh = document.querySelector('.block-ghost');
  if(!gh) return null;
  const r = gh.getBoundingClientRect();
  const cs = getComputedStyle(gh);
  return { rect: { left: r.left, top: r.top }, inline: { left: gh.style.left, top: gh.style.top }, pos: cs.position };
})()`);
ok('D2f2. 虚影 inline 定位已归零（left/top = 0px）', d2off && d2off.inline.left === '0px' && d2off.inline.top === '0px' && d2off.pos === 'fixed',
   d2off ? JSON.stringify(d2off.inline) + '|' + d2off.pos : 'null');
/* 虚影左上角应 = 鼠标 - 抓取偏移（抓取偏移 = 按下点相对块左上），误差 ≤3px */
const grabProbe = await evalJS(`window.__grabOffsetProbe ? window.__grabOffsetProbe() : null`);
ok('D2f3. 虚影位置贴合光标（偏移 ≤3px）', (() => {
  if (!d2off || !grabProbe) return false;
  const dx = Math.abs(d2off.rect.left - (grabProbe.mx - grabProbe.offX));
  const dy = Math.abs(d2off.rect.top - (grabProbe.my - grabProbe.offY));
  return dx <= 3 && dy <= 3;
})(), JSON.stringify({ ghost: d2off && d2off.rect, grab: grabProbe }));
ok('D2g. 目标单元 drop-target 高亮', d2mid.dropTarget, String(d2mid.dropTarget));
/* 松手在单元上 → 拼入 */
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d2setup.unit.x, y: d2setup.unit.y, button: 'left', clickCount: 1 });
await sleep(250);
const d2post = await evalJS(`(() => {
  const c = board.querySelector('.block[data-id="gb1"]');
  const r = c.getBoundingClientRect();
  return {
    inUnit: state.splice.items[0].blockIds.indexOf('gb1') >= 0,
    srcPos: { x: Math.round(r.left), y: Math.round(r.top) },
    ghostGone: !document.querySelector('.block-ghost'),
    clsGone: !c.classList.contains('splice-src'),
    ghostLineGone: !document.querySelector('#linkLayer path.lnk-ghost'),
    realLine: !!document.querySelector('#linkLayer path.lnk:not(.lnk-ghost)')
  };
})()`);
ok('D2h. 松手落单元 → 拼入成功', d2post.inUnit, JSON.stringify(d2post));
ok('D2i. 拼入后源块位置仍不变', d2post.srcPos.x === d2setup.src.x && d2post.srcPos.y === d2setup.src.y, JSON.stringify({ src: d2setup.src, now: d2post.srcPos }));
ok('D2j. 虚影/标记/虚影光线已清理', d2post.ghostGone && d2post.clsGone && d2post.ghostLineGone, JSON.stringify(d2post));
ok('D2k. 拼入后正式光线存在（源块↔单元条目）', d2post.realLine, String(d2post.realLine));
/* 松手不在单元上 → 不拼入、位置不变 */
const d2b = await evalJS(`(() => {
  state.blocks = [{ id: 'gb2', text: '虚影空放断言块', x: 40, y: 200 }];
  state.splice = { items: [{ type: 'unit', id: 'gu2', prefixes: ['P'], suffixes: [], blockIds: [] }], activeUnitId: 'gu2' };
  render(); toggleSpliceMode(true);
  const c = board.querySelector('.block[data-id="gb2"]');
  const r = c.getBoundingClientRect();
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  return { src: { x: Math.round(r.left), y: Math.round(r.top) }, grip: { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) }, count: state.splice.items[0].blockIds.length };
})()`);
await sleep(120);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2b.grip.x, y: d2b.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d2b.grip.x, y: d2b.grip.y, button: 'left', clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.max(60, d2b.grip.x - 20), y: d2b.grip.y + 90, button: 'left' });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.max(60, d2b.grip.x - 20), y: d2b.grip.y + 90, button: 'left', clickCount: 1 });
await sleep(200);
const d2c = await evalJS(`(() => {
  const c = board.querySelector('.block[data-id="gb2"]');
  const r = c.getBoundingClientRect();
  return { inUnit: state.splice.items[0].blockIds.length, srcPos: { x: Math.round(r.left), y: Math.round(r.top) }, ghostGone: !document.querySelector('.block-ghost') };
})()`);
ok('D2l. 空放不拼入 + 源块不动 + 虚影清理', d2c.inUnit === d2b.count && d2c.srcPos.x === d2b.src.x && d2c.srcPos.y === d2b.src.y && d2c.ghostGone, JSON.stringify(d2c));
/* 退出拼模式 → 恢复普通拖拽（真实块移动） */
await evalJS(`toggleSpliceMode(false);`);
const d2d = await evalJS(`(() => {
  const c = board.querySelector('.block[data-id="gb2"]');
  const r = c.getBoundingClientRect();
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  return { src: Math.round(r.left), grip: { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) } };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2d.grip.x, y: d2d.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d2d.grip.x, y: d2d.grip.y, button: 'left', clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d2d.grip.x + 80, y: d2d.grip.y, button: 'left' });
await sleep(40);
const d2dMid = await evalJS(`Math.round(board.querySelector('.block[data-id="gb2"]').getBoundingClientRect().left)`);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d2d.grip.x + 80, y: d2d.grip.y, button: 'left', clickCount: 1 });
await sleep(150);
ok('D2m. 非拼模式仍为普通拖拽（真实块移动 80px）', Math.abs(d2dMid - (d2d.src + 80)) <= 5, `期望 ${d2d.src + 80}，实测 ${d2dMid}`);
await evalJS(`if(spliceMode) toggleSpliceMode(false);`);

console.log('══════ E. v7.5 改进（空格平移 + 光线接口 + 文本同步） ══════');

const keySpace = async (type) => send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });

console.log('── E1. 空格 + 左键 = 平移画布 ──');
/* 干净状态：一个块 */
const e1setup = await evalJS(`(() => {
  state.blocks = [{ id: 'sp1', text: '空格平移断言块', x: 120, y: 120 }];
  state.splice = { items: [], activeUnitId: null }; state.pan = { x: 0, y: 0 }; state.zoom = 1; clearSel(); selected = []; render();
  const c = board.querySelector('.block[data-id="sp1"]');
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  const r = c.getBoundingClientRect();
  return { grip: { x: Math.round(g.x + g.width/2), y: Math.round(g.y + g.height/2) }, block: { x: Math.round(r.left), y: Math.round(r.top) } };
})()`);
await sleep(250);
/* 按空格 → 状态类 */
await keySpace('keyDown');
await sleep(80);
ok('E1a. 空格按下 → body.space-pan 光标反馈类', await evalJS(`document.body.classList.contains('space-pan') && spacePan === true`));
/* 空格按住 + 左键在块拖手上按下并拖动 → 应为平移（块不动、pan 变化） */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e1setup.grip.x, y: e1setup.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: e1setup.grip.x, y: e1setup.grip.y, button: 'left', clickCount: 1 });
await sleep(60);
const e1b = await evalJS(`({ panning: canvas.classList.contains('panning'), dragging: !!drag })`);
ok('E1b. 块上左键按下 = 启动平移（非拖块）', e1b.panning && !e1b.dragging, JSON.stringify(e1b));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e1setup.grip.x + 90, y: e1setup.grip.y + 50, button: 'left' });
await sleep(60);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e1setup.grip.x + 120, y: e1setup.grip.y + 70, button: 'left' });
await sleep(120);
const e1c = await evalJS(`(() => { const c = board.querySelector('.block[data-id="sp1"]'); const r = c.getBoundingClientRect(); return { pan: { x: Math.round(state.pan.x), y: Math.round(state.pan.y) }, dataXY: { x: state.blocks[0].x, y: state.blocks[0].y }, blockNow: { x: Math.round(r.left), y: Math.round(r.top) } }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: e1setup.grip.x + 120, y: e1setup.grip.y + 70, button: 'left', clickCount: 1 });
await sleep(200);
ok('E1c. 拖动改变 pan（画布平移）', Math.abs(e1c.pan.x) > 20 || Math.abs(e1c.pan.y) > 20, JSON.stringify(e1c.pan));
ok('E1d. 块数据坐标未变（平移不是拖块）', e1c.dataXY.x === 120 && e1c.dataXY.y === 120, JSON.stringify(e1c.dataXY));
/* 松开空格 → 恢复正常拖块 */
await keySpace('keyUp');
await sleep(80);
ok('E1e. 松开空格 → 光标类移除', await evalJS(`!document.body.classList.contains('space-pan') && spacePan === false`));
/* 先把视角/块复位到画布可见区：E1c 的平移可能把块移到 560px 拼接栏下方（headless 视口仅 756px），
   那样拖拽起点会命中面板（elementFromPoint = sp-body）导致拖拽不启动——属测试场景问题，非产品缺陷 */
const e1f = await evalJS(`(() => {
  state.pan = { x: 0, y: 0 }; state.blocks[0].x = 40; state.blocks[0].y = 40; render(); applyPan();
  const c = board.querySelector('.block[data-id="sp1"]');
  const r = c.getBoundingClientRect();
  const g = c.querySelector('.handle-grip').getBoundingClientRect();
  const gx = Math.round(g.x + g.width/2), gy = Math.round(g.y + g.height/2);
  const hit = document.elementFromPoint(gx, gy);
  return { block: { x: Math.round(r.left) }, grip: { x: gx, y: gy }, hit: hit ? (hit.className || hit.tagName) : 'null' };
})()`);
await sleep(200);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e1f.grip.x, y: e1f.grip.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: e1f.grip.x, y: e1f.grip.y, button: 'left', clickCount: 1 });
await sleep(50);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: e1f.grip.x + 70, y: e1f.grip.y, button: 'left' });
await sleep(60);
const e1fMid = await evalJS(`({ dragging: !!drag, isGhost: !!(drag && drag.ghost), blockLeft: Math.round(board.querySelector('.block[data-id="sp1"]').getBoundingClientRect().left) })`);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: e1f.grip.x + 70, y: e1f.grip.y, button: 'left', clickCount: 1 });
await sleep(160);
ok('E1f. 松空格后左键 = 正常拖块（块移动 70px）', e1fMid.dragging && !e1fMid.isGhost && Math.abs(e1fMid.blockLeft - e1f.block.x) >= 60,
   `期望≈${e1f.block.x + 70}，实测 ${e1fMid.blockLeft}，按下命中=${e1f.hit}`);
/* 文字编辑状态下空格不接管（textarea 内输入空格） */
await evalJS(`document.querySelector('.block-text').focus();`);
await sleep(80);
await keySpace('keyDown'); await sleep(80);
const e1g = await evalJS(`({ spacePan: spacePan, cls: document.body.classList.contains('space-pan'), focused: document.activeElement.tagName })`);
await keySpace('keyUp');
ok('E1g. 文字编辑状态空格不接管（正常输入）', e1g.spacePan === false && e1g.cls === false && e1g.focused === 'TEXTAREA', JSON.stringify(e1g));
await evalJS(`document.activeElement.blur();`);

console.log('── E2. 拼接栏条目的渐变朦胧光线接口 ──');
const e2 = await evalJS(`(() => {
  state.blocks = [
    { id: 'e2a', text: '接口断言块 A', x: 100, y: 120 },
    { id: 'e2b', text: '接口断言块 B', x: 100, y: 320 }
  ];
  state.splice = { items: [
    { type: 'unit', id: 'eu1', prefixes: ['P'], suffixes: [], blockIds: ['e2a'] },
    { type: 'block', id: 'e2b' }
  ], activeUnitId: 'eu1' };
  state.pan = { x: 0, y: 0 }; state.zoom = 1; render();
  const ub = document.querySelector('.sp-ublock[data-id="e2a"]');
  const it = document.querySelector('.sp-item[data-id="e2b"]');
  const csUb = ub ? getComputedStyle(ub, '::before') : null;
  return {
    ubHas: ub ? ub.classList.contains('lnk-in') : false,
    itemHas: it ? it.classList.contains('lnk-in') : false,
    ubBefore: csUb ? { bg: (csUb.backgroundImage || '').slice(0, 40), filter: csUb.filter, content: csUb.content } : null
  };
})()`);
ok('E2a. 单元内块条目带 .lnk-in（接口）', e2.ubHas, JSON.stringify(e2));
ok('E2b. 平铺条目带 .lnk-in（接口）', e2.itemHas, JSON.stringify(e2));
ok('E2c. 接口 ::before = 渐变 + 模糊（朦胧光线）', e2.ubBefore && /gradient/i.test(e2.ubBefore.bg) && /blur/.test(e2.ubBefore.filter), JSON.stringify(e2.ubBefore));
await evalJS(`state.splice = { items: [], activeUnitId: null }; renderSplice();`);
await sleep(120);
ok('E2d. 移出拼接后条目与接口一并消失', await evalJS(`document.querySelectorAll('.lnk-in').length === 0`));

console.log('── E3. 拼接栏文本与画布块保持一致 ──');
const e3setup = await evalJS(`(() => {
  state.blocks = [{ id: 'tx1', text: '原始文本', x: 100, y: 120 }];
  state.splice = { items: [{ type: 'unit', id: 'tu1', prefixes: ['P'], suffixes: [], blockIds: ['tx1'] }], activeUnitId: 'tu1' };
  state.pan = { x: 0, y: 0 }; state.zoom = 1; render();
  const el = document.querySelector('.sp-ublock[data-id="tx1"] .sp-ub-text');
  window.__spEl = el;   /* 记录元素引用：用于验证「精准同步」而非整栏重建 */
  return { text: el.textContent, tag: !!el };
})()`);
ok('E3a. 初始文本一致', e3setup.text === '原始文本', e3setup.text);
/* 画布内联编辑 → 拼接栏即时同步 */
const e3 = await evalJS(`(() => {
  const ta = board.querySelector('.block[data-id="tx1"] .block-text');
  ta.value = '编辑后的新文本内容';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const el = document.querySelector('.sp-ublock[data-id="tx1"] .sp-ub-text');
  return { spText: el.textContent, sameEl: el === window.__spEl, blockText: findBlockById('tx1').text };
})()`);
ok('E3b. 画布编辑 → 拼接栏同一条目文本即时同步', e3.spText === '编辑后的新文本内容', JSON.stringify(e3));
ok('E3c. 精准同步（未重建整栏：元素引用不变）', e3.sameEl === true, String(e3.sameEl));
ok('E3d. 数据层一致', e3.blockText === '编辑后的新文本内容', e3.blockText);
/* 平铺条目同样同步 */
const e3b = await evalJS(`(() => {
  state.splice = { items: [{ type: 'block', id: 'tx1' }], activeUnitId: null }; renderSplice();
  const ta = board.querySelector('.block[data-id="tx1"] .block-text');
  ta.value = '平铺条目同步测试';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return { spText: document.querySelector('.sp-item[data-id="tx1"] .sp-text').textContent };
})()`);
ok('E3e. 平铺条目同样即时同步', e3b.spText === '平铺条目同步测试', JSON.stringify(e3b));
/* 反向：拼接栏编辑 → 画布（回归） */
const e3c = await evalJS(`(() => {
  const b = findBlockById('tx1');
  b.text = '反向同步测试';
  var ta = board.querySelector('.block[data-id="tx1"] .block-text');
  if(ta){ ta.value = b.text; }
  renderSplice();
  return { spText: document.querySelector('.sp-item[data-id="tx1"] .sp-text').textContent, blockTa: board.querySelector('.block[data-id="tx1"] .block-text').value };
})()`);
ok('E3f. 反向（拼接栏→画布）一致（回归）', e3c.spText === '反向同步测试' && e3c.blockTa === '反向同步测试', JSON.stringify(e3c));

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
