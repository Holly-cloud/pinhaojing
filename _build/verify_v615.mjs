/* 拼好镜 v6.15 headless 验收（CDP 直连，零污染）：
   ① 拖手重构 = 顶部「拼」+ 中部拖点 + 底部「删」，右侧按钮列移除
   ② 一键移除空行（右键菜单 / 编辑窗口，支持多选批量） */
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
const vw = await evalJS('({w: innerWidth, h: innerHeight})');
if (vw.w < 1100) throw new Error('viewport too small: ' + JSON.stringify(vw));
console.log('viewport:', JSON.stringify(vw));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };

async function elRect(sel) {
  return await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return { cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.y), left: Math.round(r.x) }; })()`);
}
async function clickXY(x, y, opts = {}) {
  const mods = opts.modifiers || 0;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });   /* 清旧 hover */
  await sleep(20);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: mods });
  await sleep(25);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opts.button || 'left', buttons: 1, clickCount: 1, modifiers: mods });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opts.button || 'left', clickCount: 1, modifiers: mods });
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
const css = sel => evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const s = getComputedStyle(el); return { visibility: s.visibility, opacity: s.opacity, color: s.color, cursor: s.cursor, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }; })()`);

/* ---------- 初始状态：2 块固定文本（含空行），pan 归零 ---------- */
await evalJS(`state.blocks = [
  { id: uid(), text: '第一行\\n\\n第三行\\n\\n第五行', x: 20, y: 20 },
  { id: uid(), text: 'A行\\n\\n\\nB行', x: 260, y: 20 }
]; state.pan = {x:0,y:0}; state.zoom = 1; state.collapsed = false; render(); spliceClear(); clearSel(); saveNow();`);
await sleep(200);
const id1 = await evalJS('state.blocks[0].id');
const id2 = await evalJS('state.blocks[1].id');

console.log('═══ 1. 拖手结构 = 顶部「拼」+ 中部拖点 + 底部「删」═══');
const selSplice = `.block[data-id="${id1}"] .op-btn.handle-btn.splice`;
const selGrip = `.block[data-id="${id1}"] .handle-grip`;
const selDel = `.block[data-id="${id1}"] .op-btn.handle-btn.danger`;
const sb = await elRect(selSplice), gp = await elRect(selGrip), db = await elRect(selDel);
ok('1a. 拖手含「拼」按钮', !!sb && sb.w > 0);
ok('1b. 拖手含中部拖点（6 圆点）', await evalJS(`document.querySelector(${JSON.stringify(`.block[data-id="${id1}"] .handle-grip`)}).querySelectorAll('i').length === 6`));
ok('1c. 拖手含「删」按钮', !!db && db.w > 0);
ok('1d. 纵向顺序：拼 在 拖点 上、拖点 在 删 上', sb && gp && db && sb.top < gp.top && gp.top < db.top, JSON.stringify({ sb: sb.top, gp: gp.top, db: db.top }));
ok('1e. 拖点 cursor=grab（拖拽启动区）', (await css(selGrip)).cursor === 'grab');
const handleW = await css('.block[data-id="' + id1 + '"] .drag-handle');
ok('1f. 拖手加宽至 30px（容纳按钮）', handleW.w >= 28 && handleW.w <= 34, 'w=' + handleW.w);
const sc = await css(selSplice), dc = await css(selDel);
ok('1g. 「拼」非 hover 常显（visibility visible + opacity 1）', sc.visibility === 'visible' && parseFloat(sc.opacity) === 1, JSON.stringify(sc));
ok('1h. 「拼」常显红色 rgb(214,69,69)', sc.color === 'rgb(214, 69, 69)', sc.color);
ok('1i. 「删」常显但弱化（非红）', dc.visibility === 'visible' && parseFloat(dc.opacity) === 1 && dc.color !== 'rgb(214, 69, 69)', JSON.stringify(dc));
ok('1j. 右侧按钮列已移除（无 block-side/block-ops）', await evalJS(`!document.querySelector('.block-side') && !document.querySelector('.block-ops')`));
ok('1k. 拖手上除拼/删外无其余按钮', await evalJS(`Array.from(document.querySelector('.block[data-id="${id1}"]').querySelectorAll('button')).length === 2`));

console.log('═══ 2. 中部拖点拖拽移动块 ═══');
const x0 = await evalJS('state.blocks[0].x'), y0 = await evalJS('state.blocks[0].y');
await dragXY(gp.cx, gp.cy, gp.cx + 120, gp.cy + 60);
const x1v = await evalJS('state.blocks[0].x'), y1v = await evalJS('state.blocks[0].y');
ok('2a. 拖点拖动 → 块坐标变化（+120/+60 ±6）', Math.abs(x1v - x0 - 120) <= 6 && Math.abs(y1v - y0 - 60) <= 6, JSON.stringify({ dx: x1v - x0, dy: y1v - y0 }));

console.log('═══ 3. 按钮按下拖动不启动拖拽 ═══');
const xa = await evalJS('state.blocks[0].x'), ya = await evalJS('state.blocks[0].y');
const cnt0 = await evalJS('countSpliced()');
/* 按下「拼」按钮 → 拖 60px → 释放（释放点不在按钮上，click 不触发） */
await dragXY(sb.cx, sb.cy, sb.cx + 60, sb.cy + 40);
const xb = await evalJS('state.blocks[0].x'), yb = await evalJS('state.blocks[0].y');
ok('3a. 按「拼」拖动 → 块位置不变', Math.abs(xb - xa) <= 1 && Math.abs(yb - ya) <= 1, JSON.stringify({ dx: xb - xa, dy: yb - ya }));
ok('3b. 按「拼」拖动 → 未误触发拼入（拼接数不变）', (await evalJS('countSpliced()')) === cnt0);

console.log('═══ 4. 「拼」按钮真实点击 = 拼入拼接 ═══');
const sb2 = await elRect(selSplice);   /* 块已拖走，动态重取 */
await clickXY(sb2.cx, sb2.cy);
ok('4a. 点「拼」→ 拼接栏 +1', (await evalJS('countSpliced()')) === 1, 'count=' + await evalJS('countSpliced()'));
await evalJS('spliceClear(); clearSel();');

console.log('═══ 5. 「删」按钮真实点击 = 删除块 ═══');
const n0 = await evalJS('state.blocks.length');
const db2 = await elRect(`.block[data-id="${id2}"] .op-btn.handle-btn.danger`);
await clickXY(db2.cx, db2.cy);
ok('5a. 点「删」→ 块被删除', (await evalJS('state.blocks.length')) === n0 - 1, 'n=' + await evalJS('state.blocks.length'));
ok('5b. 删除的是块2', await evalJS(`!state.blocks.some(b => b.id === ${JSON.stringify(id2)})`));
ok('5c. 删除后 toast「已删除」', await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('hide') ? '' : t.textContent; })()`) === '已删除');
ok('5d. 块1 未被误删', await evalJS(`state.blocks.some(b => b.id === ${JSON.stringify(id1)})`));
/* 重建块2（含空行文本），供后续测试 */
await evalJS(`state.blocks.push({ id: ${JSON.stringify(id2)}, text: 'A行\\n\\n\\nB行', x: 260, y: 20 }); render(); clearSel();`);
await sleep(120);

console.log('═══ 6. 右键菜单 = 移除空行（单块）═══');
const gp1 = await elRect(selGrip);   /* 拖点已随块移动，重新定位 */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gp1.cx, y: gp1.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gp1.cx, y: gp1.cy, button: 'right', buttons: 2, clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gp1.cx, y: gp1.cy, button: 'right', clickCount: 1 });
await sleep(90);
const menuActs = await evalJS(`Array.from(document.querySelectorAll('.ctx-menu.open .ctx-item')).map(el => el.dataset.act + ':' + el.textContent)`);
ok('6a. 右键拖点 → 菜单含 拼入/复制/克隆/移除空行/删除（此顺序）', JSON.stringify(menuActs) === JSON.stringify(['splice-block:拼入拼接', 'copy-block:复制', 'clone-block:克隆', 'strip-blank:移除空行', 'del-block:删除']), JSON.stringify(menuActs));
const stripItem = await elRect('.ctx-item[data-act="strip-blank"]');
await clickXY(stripItem.cx, stripItem.cy);
const t1 = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(id1)}).text`);
ok('6b. 移除空行 → 块1 文本空行全部去除', t1 === '第一行\n第三行\n第五行', JSON.stringify(t1));
const toastTxt = await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('hide') ? '' : t.textContent; })()`);
ok('6c. toast 提示「已移除空行」', toastTxt === '已移除空行', toastTxt);

console.log('═══ 7. 多选批量移除空行 ═══');
await evalJS(`clearSel(); const b1o = state.blocks.find(b => b.id === ${JSON.stringify(id1)}); b1o.text = '第一行\\n\\n第三行\\n\\n第五行'; render();`);
await sleep(120);
const b1 = await elRect(`.block[data-id="${id1}"] .drag-handle`);
const b2 = await elRect(`.block[data-id="${id2}"] .drag-handle`);
await clickXY(b1.cx, b1.cy, { modifiers: 2 });   /* Ctrl+左键 选块1 */
await sleep(80);
await clickXY(b2.cx, b2.cy, { modifiers: 2 });   /* Ctrl+左键 选块2 */
const selN = await evalJS('selected.length');
ok('7a. Ctrl+左键两块 → 选中集 = 2', selN === 2, 'selected=' + selN);
/* 右键块1 拖点（在选中集内 → 批量菜单） */
const gp1b = await elRect(selGrip);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gp1b.cx, y: gp1b.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gp1b.cx, y: gp1b.cy, button: 'right', buttons: 2, clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gp1b.cx, y: gp1b.cy, button: 'right', clickCount: 1 });
await sleep(90);
const multiLabel = await evalJS(`document.querySelector('.ctx-item[data-act="strip-blank"]').textContent`);
ok('7b. 多选时菜单项 = 移除空行（2 块）', multiLabel === '移除空行（2 块）', multiLabel);
const stripItem2 = await elRect('.ctx-item[data-act="strip-blank"]');
await clickXY(stripItem2.cx, stripItem2.cy);
const t1b = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(id1)}).text`);
const t2b = await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(id2)}).text`);
ok('7c. 批量移除 → 两块文本均无空行', t1b === '第一行\n第三行\n第五行' && t2b === 'A行\nB行', JSON.stringify({ t1b, t2b }));
ok('7d. 批量 toast「已移除空行（2 块）」', await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('hide') ? '' : t.textContent; })()`) === '已移除空行（2 块）');

console.log('═══ 8. 无空行时移除空行 = 提示且不改文本 ═══');
await evalJS('clearSel();');
const gp1c = await elRect(selGrip);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 6, y: 6 });
await sleep(20);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gp1c.cx, y: gp1c.cy });
await sleep(25);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gp1c.cx, y: gp1c.cy, button: 'right', buttons: 2, clickCount: 1 });
await sleep(40);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gp1c.cx, y: gp1c.cy, button: 'right', clickCount: 1 });
await sleep(90);
const stripItem3 = await elRect('.ctx-item[data-act="strip-blank"]');
await clickXY(stripItem3.cx, stripItem3.cy);
ok('8a. 无空行 → toast「所选块没有空行」', await evalJS(`(() => { const t = document.getElementById('toast'); return t.classList.contains('hide') ? '' : t.textContent; })()`) === '所选块没有空行');
ok('8b. 文本保持不变', (await evalJS(`state.blocks.find(b => b.id === ${JSON.stringify(id1)}).text`)) === '第一行\n第三行\n第五行');

console.log('═══ 9. 块编辑窗口内「移除空行」═══');
await evalJS(`window.__cap = null; openBlockEditor('X行\\n\\nY行\\n\\n\\nZ行', function(v){ window.__cap = v; });`);
await sleep(100);
const stripBtn = await elRect('#blkStrip');
ok('9a. 编辑窗口出现「移除空行」按钮', !!stripBtn && stripBtn.w > 0);
await clickXY(stripBtn.cx, stripBtn.cy);
ok('9b. 编辑区内空行移除', (await evalJS(`document.getElementById('blkInput').value`)) === 'X行\nY行\nZ行', await evalJS(`JSON.stringify(document.getElementById('blkInput').value)`));
const okBtn = await elRect('#blkOk');
await clickXY(okBtn.cx, okBtn.cy);
ok('9c. 确定 → 回调收到移除空行后的文本', (await evalJS('window.__cap')) === 'X行\nY行\nZ行', await evalJS('JSON.stringify(window.__cap)'));

console.log('═══ 10. 持久化回归（自动保存落盘）═══');
await sleep(600);   /* 防抖保存 400ms */
const saved = await evalJS(`JSON.parse(localStorage.getItem('storyboard-prompt-panel:v1'))`);
ok('10a. 自动保存：LS 中块数 = 2', saved && saved.blocks.length === 2, saved ? 'n=' + saved.blocks.length : 'LS 空');
ok('10b. 块1 文本（无空行）已落盘', saved && saved.blocks.find(b => b.id === id1).text === '第一行\n第三行\n第五行', saved ? JSON.stringify(saved.blocks.find(b => b.id === id1).text) : '');
ok('10c. 块1 位置（拖拽后）已落盘', saved && Math.abs(saved.blocks.find(b => b.id === id1).x - x0 - 120) <= 6, saved ? 'x1=' + saved.blocks.find(b => b.id === id1).x : '');

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
