/* 拼好镜 v6.20 headless 验收：
   ① 块编辑窗口单行文本换行显示（pre-wrap + 固定宽度 640）② 复制拼接输出：前缀/后缀值间空行分隔 ③ 回归 */
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
const vw = await evalJS('({w: innerWidth, h: innerHeight})');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };

console.log('═══ 1. 块编辑窗口：单行文本换行显示 ═══');
await evalJS(`state.blocks = [{ id: uid(), text: '块甲', x: 20, y: 20 }]; render(); spliceClear(); clearSel();`);
await sleep(120);
await evalJS(`openBlockEditor('超长单行' + '很长的文本'.repeat(40), function(){})`);
await sleep(100);
const wsInfo = await evalJS(`(() => { const s = getComputedStyle(document.getElementById('blkInput')); const r = document.querySelector('.blk-win').getBoundingClientRect(); return { whiteSpace: s.whiteSpace, overflowWrap: s.overflowWrap, winW: Math.round(r.width), expectW: Math.min(640, innerWidth * 0.94) }; })()`);
ok('1a. 编辑区 white-space = pre-wrap（允许折行）', wsInfo.whiteSpace === 'pre-wrap', wsInfo.whiteSpace);
ok('1b. overflow-wrap = break-word（断词折行）', wsInfo.overflowWrap === 'break-word', wsInfo.overflowWrap);
ok('1c. 窗口宽度固定 640（不再按最长行撑宽）', Math.abs(wsInfo.winW - wsInfo.expectW) <= 4, JSON.stringify(wsInfo));
/* 超长行折行验证：编辑区 scrollWidth 不应远超 clientWidth（文本折行在窗口内） */
const fold = await evalJS(`(() => { const ta = document.getElementById('blkInput'); return { clientW: ta.clientWidth, scrollW: ta.scrollWidth, scrollH: ta.scrollHeight }; })()`);
ok('1d. 超长行在窗口内折行（scrollWidth ≤ clientWidth）', fold.scrollW <= fold.clientW + 2, JSON.stringify(fold));
/* 输入实时宽度不变（fitBlkWidth 固定） */
await evalJS(`(() => { const ta = document.getElementById('blkInput'); ta.value = '短'; ta.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(60);
const w2 = await evalJS(`Math.round(document.querySelector('.blk-win').getBoundingClientRect().width)`);
ok('1e. 输入内容变化宽度保持固定 640', Math.abs(w2 - 640) <= 4, 'w=' + w2);
await evalJS('closeBlockEditor()');
await sleep(80);

console.log('═══ 2. 复制拼接输出：前缀/后缀值间空行分隔 ═══');
await evalJS(`state.blocks = [
  { id: uid(), text: '块一', x: 20, y: 20 },
  { id: uid(), text: '块二', x: 20, y: 80 }
]; state.splice = { items: [{ type: 'unit', id: 'u1', prefixes: ['前缀甲', '前缀乙'], suffixes: ['后缀甲', '后缀乙'], blockIds: [state.blocks[0].id, state.blocks[1].id] }], activeUnitId: 'u1' };
render();`);
await sleep(120);
const out = await evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return cap; })()`);
ok('2a. 复制输出成功', typeof out === 'string' && out.length > 0, String(out));
const expect = '前缀甲\n\n前缀乙\n\n块一\n\n块二\n\n后缀甲\n\n后缀乙';
ok('2b. 输出 = 前缀值间空行 + 块间空行 + 后缀值间空行', out === expect, JSON.stringify(out));
/* 单值前缀/后缀回归：无额外空行 */
await evalJS(`state.splice.items[0].prefixes = ['单前缀']; state.splice.items[0].suffixes = ['单后缀']; render();`);
await sleep(80);
const out2 = await evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return cap; })()`);
ok('2c. 单值前缀/后缀无多余空行', out2 === '单前缀\n\n块一\n\n块二\n\n单后缀', JSON.stringify(out2));
/* 平铺块条目输出回归（无单元时） */
await evalJS(`state.splice = { items: [{ type: 'block', id: state.blocks[0].id }, { type: 'block', id: state.blocks[1].id }], activeUnitId: null }; render();`);
await sleep(80);
const out3 = await evalJS(`(() => { let cap = null; const orig = copyText; copyText = function(t){ cap = t; return Promise.resolve(true); }; copySpliced(); copyText = orig; return cap; })()`);
ok('2d. 平铺块条目输出回归（块间空行）', out3 === '块一\n\n块二', JSON.stringify(out3));

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
