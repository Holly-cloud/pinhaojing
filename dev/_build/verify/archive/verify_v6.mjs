import path from 'node:path';
/* ⚠️ 历史脚本（v6.0 时代，已被 verify_v61~v621 / verify_v7 取代）：断言口径停在 v6.0，
   在 v7.7 上跑必然有失败项，**不要**把它当作当前回归基线；保留仅作考古与对照。
   P5 归位时它的 TARGET 已从「旧项目名目录（分镜提示词管理面板）」改为相对解析当前产物。 */
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 拼好镜 v6.0 headless 验收（CDP 直连，零污染） */
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1600, mobile: false });
/* 每次文档加载前清空 localStorage：保证初始 defaultState，且不被 beforeunload flush 覆盖 */
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
const vw = await evalJS('({w: innerWidth, h: innerHeight})');
if (vw.w < 1100) throw new Error('viewport too small: ' + JSON.stringify(vw));
console.log('viewport:', JSON.stringify(vw));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };

/* 真实鼠标助手 */
async function mouse(type, x, y, btn = 'left', cc = 1) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: btn, clickCount: cc });
}
async function clickAt(x, y) { await mouse('mousePressed', x, y, 'left', 1); await mouse('mouseReleased', x, y, 'left', 1); }
async function dblclickAt(x, y) {
  await mouse('mousePressed', x, y, 'left', 1);
  await mouse('mouseReleased', x, y, 'left', 1);
  await sleep(40);
  await mouse('mousePressed', x, y, 'left', 2);   /* clickCount:2 才会被判定为双击 */
  await mouse('mouseReleased', x, y, 'left', 2);
  await sleep(60);
}
async function drag(x1, y1, x2, y2, steps = 10) {
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await sleep(25); }
  await mouse('mouseReleased', x2, y2);
}
async function wheel(x, y, deltaY) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }); }

console.log('═══ 1. 加载与静态结构 ═══');
ok('页面无 JS 报错', await evalJS('window.__err === undefined') !== false && true, '—');
ok('标题为「拼好镜」', await evalJS('document.title') === '拼好镜');
ok('「新增块」按钮已移除', await evalJS('!document.getElementById("btnAdd")'));
ok('「整理」按钮存在', !!await evalJS('document.getElementById("btnArrange")'));
ok('初始 1 个示例块', await evalJS('state.blocks.length') === 1);
const initW = await evalJS('document.querySelector(".block").offsetWidth');
ok('块宽自适应最长行（>400px，文本不换行）', initW > 400, 'w=' + initW);
const initH = await evalJS('document.querySelector(".block").offsetHeight');
ok('块高随内容展开', initH > 84, 'h=' + initH);

console.log('═══ 2. 双击空白新增块 ═══');
await dblclickAt(700, 500);
const nAfterDbl = await evalJS('state.blocks.length');
ok('双击后块数 2', nAfterDbl === 2, 'n=' + nAfterDbl);
ok('新块落点在双击处附近', nAfterDbl >= 2 && await evalJS('Math.abs(state.blocks[1].x - (700-16-70)) < 60'), JSON.stringify(await evalJS('({x:state.blocks[1].x, y:state.blocks[1].y})')));

console.log('═══ 3. 单击空白微移不落盘 / 拖空白平移 ═══');
await clickAt(900, 1200);
ok('单击空白（微移<4px）pan 不变', await evalJS('state.pan.x===0 && state.pan.y===0'), JSON.stringify(await evalJS('state.pan')));
await drag(400, 1300, 460, 1360);
ok('拖空白平移生效（pan 变化）', await evalJS('state.pan.x===60 && state.pan.y===60'), JSON.stringify(await evalJS('state.pan')));

console.log('═══ 4. 滚轮上下滑动 ═══');
await wheel(100, 900, 120);
await sleep(50);
ok('滚轮向下 → pan.y 减小', await evalJS('state.pan.y === -60'), 'pan.y=' + await evalJS('state.pan.y'));
await wheel(100, 900, -240);
await sleep(50);
ok('滚轮向上 → pan.y 增大', await evalJS('state.pan.y === 180'), 'pan.y=' + await evalJS('state.pan.y'));

console.log('═══ 5. 一键整理 ═══');
await evalJS('state.blocks[1].y = 900; state.blocks[1].x = 500;');   /* 打乱布局 */
const arrangeBtn = await evalJS('(() => { const r = document.getElementById("btnArrange").getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()');
await clickAt(arrangeBtn.x, arrangeBtn.y);
await sleep(100);
const arranged = await evalJS('state.blocks.map(b => ({x:b.x, y:b.y}))');
ok('所有块 x=20 左对齐', arranged.every(b => b.x === 20), JSON.stringify(arranged));
ok('块按 y 从上到下排列', arranged.every((b, i) => i === 0 || b.y > arranged[i-1].y), JSON.stringify(arranged));
ok('整理后 pan 归零', await evalJS('state.pan.x===0 && state.pan.y===0'), JSON.stringify(await evalJS('state.pan')));

console.log('═══ 6. 块宽随输入实时自适应 ═══');
const longLine = '长'.repeat(100);
const wBefore = await evalJS('document.querySelector(".block").offsetWidth');
await evalJS(`(() => { const ta = document.querySelector('.block-text'); ta.value = '${longLine}'; ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(80);
const wAfter = await evalJS('document.querySelector(".block").offsetWidth');
ok('输入超长行后块宽增大（>1400px 且无换行）', wAfter > 1400 && wAfter > wBefore, 'w=' + wBefore + '→' + wAfter);
ok('文本区无内部滚动（全文展开）', await evalJS(`(() => { const ta = document.querySelector('.block-text'); return ta.scrollHeight <= ta.clientHeight + 2; })()`));

console.log('═══ 7. 拼接栏模板 ═══');
await evalJS('spliceAdd(state.blocks[0].id); spliceAdd(state.blocks[1].id);');
ok('拼接 2 块就绪', await evalJS('state.order.length') === 2);
/* 存为模板：真实点击 → 命名模态框 → 输入名称 → 确定 */
const saveBtn = await evalJS('(() => { const r = document.getElementById("spTplSave").getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()');
await clickAt(saveBtn.x, saveBtn.y);
await sleep(200);
ok('弹出命名模态框', await evalJS(`!document.getElementById('modalMask').classList.contains('hide')`));
await evalJS(`document.getElementById('modalInput').value = '开场模板'`);
const okBtn = await evalJS('(() => { const r = document.getElementById("modalOk").getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()');
await clickAt(okBtn.x, okBtn.y);
await sleep(200);
ok('模态框已关闭', await evalJS(`document.getElementById('modalMask').classList.contains('hide')`));
ok('模板已保存（templates=1）', await evalJS('state.templates.length') === 1, JSON.stringify(await evalJS('state.templates')));
ok('模板名正确', await evalJS('state.templates[0].name') === '开场模板');
ok('模板容纳 2 个 prompt 块', await evalJS('state.templates[0].items.length') === 2);
/* 展开模板列表 */
const foldBtn = await evalJS('(() => { const r = document.getElementById("spTplFold").getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()');
await clickAt(foldBtn.x, foldBtn.y);
await sleep(100);
ok('模板列表展开且有 1 项', await evalJS(`document.querySelectorAll('.sp-tpl-item').length`) === 1);
/* 套用：清空当前拼接，替换为模板内容 */
const oldIds = await evalJS('state.order.slice()');
const oldBlockIds = await evalJS('state.blocks.map(b => b.id)');
await evalJS(`(() => { const b = document.querySelector('.sp-tpl-item .sp-tpl-act'); b.click(); })()`);
await sleep(150);
const orderAfter = await evalJS('state.order.slice()');
ok('套用后拼接内容被替换（原内容清空）', orderAfter.length === 2 && !orderAfter.some(id => oldIds.includes(id)), JSON.stringify({ old: oldIds, now: orderAfter }));
ok('套用新建了模板对应的画布块', orderAfter.every(id => !oldBlockIds.includes(id)));
ok('块总数 +2', await evalJS('state.blocks.length') === 4, 'n=' + await evalJS('state.blocks.length'));
ok('toast 提示套用成功', await evalJS(`document.getElementById('toast').textContent.includes('已套用模板')`), await evalJS(`document.getElementById('toast').textContent`));
/* 删除 + 撤销 */
await evalJS(`(() => { const b = document.querySelector('.sp-tpl-item .sp-tpl-act.danger'); b.click(); })()`);
await sleep(100);
ok('删除模板成功', await evalJS('state.templates.length') === 0);
ok('toast 带撤销按钮', await evalJS(`document.getElementById('toast').querySelector('button') !== null`));
await evalJS(`document.getElementById('toast').querySelector('button').click()`);
await sleep(100);
ok('撤销恢复模板', await evalJS('state.templates.length') === 1 && await evalJS('state.templates[0].name') === '开场模板');

console.log('═══ 8. 持久化 / 迁移 ═══');
ok('localStorage 已落盘 version 5', await evalJS(`JSON.parse(localStorage.getItem('storyboard-prompt-panel:v1')).version`) === 5);
ok('落盘含 templates', await evalJS(`Array.isArray(JSON.parse(localStorage.getItem('storyboard-prompt-panel:v1')).templates)`));
/* v4 旧数据迁移（纯函数验证，规避 reload 时 beforeunload flush 覆盖注入） */
const mig = await evalJS(`(() => {
  const old = { app:'storyboard-prompt-panel', version:4, title:'旧分镜', pan:{x:10,y:20}, order:['b_old1'], collapsed:false,
    blocks:[{id:'b_old1', text:'旧块一', x:100, y:100}, {id:'b_old2', text:'旧块二'}] };
  const m = migrate(old);
  return { version: m.version, blocks: m.blocks.map(b=>({id:b.id,x:b.x,y:b.y})), templates: m.templates, order: m.order };
})()`);
ok('v4 迁移：version 升至 5', mig.version === 5);
ok('v4 迁移：块保留 + 缺坐标补齐', mig.blocks.length === 2 && typeof mig.blocks.find(b => b.id === 'b_old2').x === 'number', JSON.stringify(mig.blocks));
ok('v4 迁移：templates 补空数组', Array.isArray(mig.templates) && mig.templates.length === 0);
ok('v4 迁移：order 过滤失效块 id', mig.order.length === 1 && mig.order[0] === 'b_old1', JSON.stringify(mig.order));

console.log(`\n════ 验收结果：${pass} 通过 / ${fail} 失败 ════`);
ws.close();
process.exit(fail ? 1 : 0);
