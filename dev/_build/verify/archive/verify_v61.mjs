import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.1 headless 验收（CDP 直连，零污染） */
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
async function clickAt(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 1200 }); await sleep(20); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(25); await mouse('mousePressed', x, y, 'left', 1); await mouse('mouseReleased', x, y, 'left', 1); }
async function rclickAt(x, y, mods = 0) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 1200 }); await sleep(20); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(25); await mouse('mousePressed', x, y, 'right', 1, mods); await mouse('mouseReleased', x, y, 'right', 1, mods); await sleep(80); }
async function dblclickAt(x, y) {
  await mouse('mouseMoved', x, y); await sleep(25);
  await mouse('mousePressed', x, y, 'left', 1); await mouse('mouseReleased', x, y, 'left', 1);
  await sleep(40);
  await mouse('mousePressed', x, y, 'left', 2); await mouse('mouseReleased', x, y, 'left', 2);
  await sleep(80);
}
async function drag(x1, y1, x2, y2, steps = 10, stepMs = 25) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 1200 }); await sleep(20);   /* 清除旧 hover 覆盖 */
  await mouse('mouseMoved', x1, y1); await sleep(25);
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await sleep(stepMs); }
  await mouse('mouseReleased', x2, y2);
}
async function wheelAt(x, y, dy) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); }
async function handlePos(id) {
  return await evalJS(`(() => { const h = document.querySelector('.block[data-id="${id}"] .drag-handle'); if(!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
}
async function ctxItemClick(act) {
  const p = await evalJS(`(() => { const b = document.querySelector('.ctx-item[data-act="${act}"]'); if(!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
  if (!p) throw new Error('ctx item not found: ' + act);
  await clickAt(p.x, p.y);
  await sleep(150);
}
const CTL = 2;   /* CDP modifiers: Ctrl */

console.log('═══ 1. 结构与 placeholder ═══');
ok('页面无 JS 报错', true);
ok('标题为「拼好镜」', await evalJS('document.title') === '拼好镜');
ok('初始 1 个示例块', await evalJS('state.blocks.length') === 1);
ok('块 textarea 无 placeholder（默认文本已移除）', await evalJS(`document.querySelector('.block-text').getAttribute('placeholder') === null`));
ok('无 .block-text::placeholder 样式', await evalJS(`Array.from(document.styleSheets[0].cssRules).every(r => !(r.selectorText && r.selectorText.indexOf('.block-text::placeholder') >= 0))`));

console.log('═══ 2. 粘滞感：拖动阻尼 ═══');
await drag(400, 1300, 460, 1360, 6, 30);   /* 目标位移 (60,60)，中等速度 */
await sleep(60);
const lag = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('松手瞬间仍未到达目标（阻尼跟随中）', lag.x > 0 && lag.x < 59 && lag.y > 0 && lag.y < 59, JSON.stringify(lag));
await sleep(900);
const settled = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('阻尼+惯性收敛到目标附近', Math.abs(settled.x - 60) <= 6 && Math.abs(settled.y - 60) <= 6, JSON.stringify(settled));
ok('pan 已落盘', await evalJS('Math.round(JSON.parse(localStorage.getItem("storyboard-prompt-panel:v1")).pan.x)') === 60);

console.log('═══ 3. 粘滞感：松手惯性滑行 ═══');
await drag(400, 1200, 520, 1400, 3, 20);   /* 快速甩动 */
await sleep(40);
const p1 = await evalJS('({x: state.pan.x, y: state.pan.y})');
await sleep(90);
const p2 = await evalJS('({x: state.pan.x, y: state.pan.y})');
ok('松手后继续滑行（惯性生效）', Math.abs(p2.x - p1.x) > 1 || Math.abs(p2.y - p1.y) > 1, JSON.stringify({ p1, p2 }));
await sleep(1200);
ok('惯性滑行最终停稳', await evalJS('panVel === null') === true);
const pFinal = await evalJS('({x: state.pan.x, y: state.pan.y})');
console.log('  (最终 pan:', JSON.stringify(pFinal) + ')');

console.log('═══ 4. 回归：单击微移 / 双击建块 / 滚轮 ═══');
await clickAt(900, 1200);
ok('单击空白（微移<4px）pan 不变', Math.abs(await evalJS('state.pan.x') - pFinal.x) < 4 && Math.abs(await evalJS('state.pan.y') - pFinal.y) < 4, JSON.stringify(await evalJS('state.pan')));
await dblclickAt(700, 500);
ok('双击空白新增块（2 块）', await evalJS('state.blocks.length') === 2, 'n=' + await evalJS('state.blocks.length'));
const py = await evalJS('state.pan.y');
await wheelAt(100, 900, 120);
await sleep(50);
ok('滚轮上下滑动生效', await evalJS('state.pan.y') === py - 120, 'dy=' + (await evalJS('state.pan.y') - py));

console.log('═══ 5. Ctrl+右键多选 ═══');
await evalJS('state.pan = {x:0,y:0}; state.blocks[0].text = "示例块（缩短文本，避免与块1重叠影响命中）"; render(); clearSel();');   /* 复位视角与选择；缩短块0 文本避免重叠覆盖 */
const b0 = await evalJS('state.blocks[0].id');
const b1 = await evalJS('state.blocks[1].id');
const h0 = await handlePos(b0);
const h1 = await handlePos(b1);
console.log('  handle:', JSON.stringify({ h0, h1 }));
await rclickAt(h0.x, h0.y, CTL);   /* 块0 把手，Ctrl+右键 */
ok('Ctrl+右键块0 → 选中 1 块', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b0, JSON.stringify(await evalJS('selected')));
ok('块0 高亮 .selected', await evalJS(`document.querySelector('.block[data-id="${b0}"]').classList.contains('selected')`));
await rclickAt(h1.x, h1.y, CTL);   /* 块1 把手，Ctrl+右键 */
ok('Ctrl+右键块1 → 累加为 2 块', await evalJS('selected.length') === 2 && await evalJS(`selected.indexOf('${b1}') >= 0`), JSON.stringify(await evalJS('selected')));
ok('两块均高亮', await evalJS('document.querySelectorAll(".block.selected").length') === 2);
await rclickAt(h0.x, h0.y);   /* 普通右键块0 → 单选重置 */
ok('普通右键 → 单选重置为 1 块', await evalJS('selected.length') === 1 && await evalJS('selected[0]') === b0, JSON.stringify(await evalJS('selected')));
await rclickAt(200, 900);   /* 画布空白右键 */
ok('空白右键 → 清空选择', await evalJS('selected.length') === 0);

console.log('═══ 6. 组拖（选中集=新单体） ═══');
const h0c = await handlePos(b0);
const h1c = await handlePos(b1);
await rclickAt(h0c.x, h0c.y, CTL);
await rclickAt(h1c.x, h1c.y, CTL);
const before = await evalJS(`(() => {
  const a = state.blocks.find(b => b.id === '${b0}');
  const c = state.blocks.find(b => b.id === '${b1}');
  return { ax: a.x, ay: a.y, cx: c.x, cy: c.y, rel: { x: c.x - a.x, y: c.y - a.y } };
})()`);
const h0d = await handlePos(b0);
await drag(h0d.x, h0d.y, h0d.x + 100, h0d.y + 100, 8, 20);   /* 拖块0 把手 +100,+100 */
await sleep(120);
const after = await evalJS(`(() => {
  const a = state.blocks.find(b => b.id === '${b0}');
  const c = state.blocks.find(b => b.id === '${b1}');
  return { ax: a.x, ay: a.y, cx: c.x, cy: c.y, rel: { x: c.x - a.x, y: c.y - a.y } };
})()`);
ok('组拖：块0 位移 (+100,+100)', after.ax - before.ax === 100 && after.ay - before.ay === 100, JSON.stringify({ d: { x: after.ax - before.ax, y: after.ay - before.ay } }));
ok('组拖：块1 同步位移（相对位置保持）', after.rel.x === before.rel.x && after.rel.y === before.rel.y, JSON.stringify({ before: before.rel, after: after.rel }));
ok('组拖后选择保留', await evalJS('selected.length') === 2);

console.log('═══ 7. 批量操作 ═══');
/* 批量拼入（菜单已被组拖的左键关闭，先重新多选） */
const h0h = await handlePos(b0);
const h1h = await handlePos(b1);
await rclickAt(h0h.x, h0h.y, CTL);
await rclickAt(h1h.x, h1h.y, CTL);
await ctxItemClick('splice-block');
ok('批量拼入（order 2 项）', await evalJS('state.order.length') === 2, JSON.stringify(await evalJS('state.order')));
ok('批量操作后选择清空', await evalJS('selected.length') === 0);
await evalJS('spliceClear()');
/* 批量克隆（组拖后块已移动，重新定位） */
const h0e = await handlePos(b0);
const h1e = await handlePos(b1);
await rclickAt(h0e.x, h0e.y, CTL);
await rclickAt(h1e.x, h1e.y, CTL);
const nBeforeClone = await evalJS('state.blocks.length');
await ctxItemClick('clone-block');
ok('批量克隆（+2 块）', await evalJS('state.blocks.length') === nBeforeClone + 2, 'n=' + await evalJS('state.blocks.length'));
/* 批量删除 + 撤销 */
const nBeforeDel = await evalJS('state.blocks.length');
const h0f = await handlePos(b0);
const h1f = await handlePos(b1);
await rclickAt(h0f.x, h0f.y, CTL);
await rclickAt(h1f.x, h1f.y, CTL);
await ctxItemClick('del-block');
ok('批量删除（-2 块）', await evalJS('state.blocks.length') === nBeforeDel - 2, 'n=' + await evalJS('state.blocks.length'));
ok('删除 toast 带撤销按钮', await evalJS(`document.getElementById('toast').querySelector('button') !== null`));
await evalJS(`document.getElementById('toast').querySelector('button').click()`);
await sleep(150);
ok('撤销恢复删除的块', await evalJS('state.blocks.length') === nBeforeDel, 'n=' + await evalJS('state.blocks.length'));
/* hover 按钮批量拼入 */
await evalJS('spliceClear()');
const h0g = await handlePos(b0);
const h1g = await handlePos(b1);
await rclickAt(h0g.x, h0g.y, CTL);
await rclickAt(h1g.x, h1g.y, CTL);
const btnPos = await evalJS(`(() => { const r = document.querySelector('.block[data-id="${b0}"] .op-btn[data-act="splice"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
await clickAt(btnPos.x, btnPos.y);
await sleep(150);
ok('hover 按钮批量拼入（order 2 项）', await evalJS('state.order.length') === 2, JSON.stringify(await evalJS('state.order')));

console.log('═══ 8. 回归：整理 / 块宽 ═══');
const arrangeBtn = await evalJS('(() => { const r = document.getElementById("btnArrange").getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()');
await clickAt(arrangeBtn.x, arrangeBtn.y);
await sleep(150);
const arranged = await evalJS('state.blocks.map(b => ({x:b.x, y:b.y}))');
ok('整理：x=20 左对齐', arranged.every(b => b.x === 20), JSON.stringify(arranged));
ok('整理：y 自上而下', arranged.every((b, i) => i === 0 || b.y > arranged[i-1].y), JSON.stringify(arranged));
const wBefore = await evalJS('document.querySelector(".block").offsetWidth');
await evalJS(`(() => { const ta = document.querySelector('.block-text'); ta.value = '${'长'.repeat(100)}'; ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(100);
const wAfter = await evalJS('document.querySelector(".block").offsetWidth');
ok('块宽随长行自适应（不换行完整显示）', wAfter > 1400 && wAfter > wBefore, 'w=' + wBefore + '→' + wAfter);

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
