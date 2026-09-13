/* 拼好镜 v6.19 headless 验收（CDP 直连）：独立窗口焦点管理——打开窗口时焦点从画布抢到窗口内，方向键/打字不再作用于背景画布 */
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

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : '')); } };
const activeInfo = () => evalJS(`(() => { const ae = document.activeElement; return { tag: ae ? ae.tagName : 'NULL', id: ae && ae.id ? ae.id : '', cls: ae && ae.className ? (typeof ae.className === 'string' ? ae.className.slice(0, 40) : '') : '' }; })()`);
const key = async (k, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vk });
  await sleep(40);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk });
  await sleep(60);
};

/* ---------- 初始状态 ---------- */
await evalJS(`state.blocks = [{ id: uid(), text: '块甲', x: 20, y: 20 }]; state.pan = {x:0,y:0}; state.zoom = 1;
state.templates = [{ id: uid(), units: [{ id: uid(), prefixes: ['前缀A'], suffixes: [] }] }];
render(); spliceClear(); clearSel(); saveNow();`);
await sleep(200);

console.log('═══ 1. 模板定制窗口：焦点抢到窗口 ═══');
/* 先把焦点放在画布 textarea（模拟用户在画布编辑中打开窗口） */
await evalJS(`board.querySelector('.block .block-text').focus()`);
ok('1a. 前置：焦点在画布 textarea', (await activeInfo()).tag === 'TEXTAREA');
await evalJS(`openTplWin()`);
await sleep(100);
const a1 = await activeInfo();
ok('1b. 打开模板窗口 → 焦点在窗口容器（tpl-win）', a1.cls.includes('tpl-win'), JSON.stringify(a1));
ok('1c. 画布 textarea 已失焦', a1.tag !== 'TEXTAREA');
/* 窗口打开时方向键不动画布 */
const p0 = await evalJS('state.pan.x');
await key('ArrowRight', 39);
ok('1d. 窗口打开时方向键不动画布', (await evalJS('state.pan.x')) === p0);
/* 打字不进入背景块 */
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'x' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 });
await sleep(60);
ok('1e. 打字不进入背景画布块', (await evalJS(`state.blocks[0].text`)) === '块甲');
await evalJS(`closeTplWin()`);
await sleep(80);

console.log('═══ 2. 模板预览窗口：只读也抢焦点 ═══');
await evalJS(`document.getElementById('spTplFold').click()`);
await sleep(120);
await evalJS(`previewTemplate(0)`);
await sleep(100);
const a2 = await activeInfo();
ok('2a. 预览窗口打开 → 焦点在窗口容器', a2.cls.includes('tpl-win'), JSON.stringify(a2));
const p1 = await evalJS('state.pan.x');
await key('ArrowDown', 40);
ok('2b. 预览窗口打开时方向键不动画布', (await evalJS('state.pan.x')) === p1);
await evalJS(`document.getElementById('tplPrevMask').classList.add('hide')`);
await sleep(80);

console.log('═══ 3. 块编辑窗口（回归）═══');
await evalJS(`openBlockEditor('内容', function(){})`);
await sleep(100);
const a3 = await activeInfo();
ok('3a. 块编辑窗口 → 焦点在 blkInput', a3.id === 'blkInput', JSON.stringify(a3));
const p2 = await evalJS('state.pan.x');
await key('ArrowLeft', 37);
ok('3b. 编辑窗口内方向键不动画布（text 光标语义保留）', (await evalJS('state.pan.x')) === p2);
await evalJS(`closeBlockEditor()`);
await sleep(80);

console.log('═══ 4. 命名模态框（回归）═══');
await evalJS(`openModal('测试', [{ label: '名称', value: '' }], function(){})`);
await sleep(100);
ok('4a. 命名模态框 → 焦点在 modal-input', (await activeInfo()).cls.includes('modal-input'));
await evalJS(`closeModal()`);
await sleep(80);

console.log('═══ 5. 窗口关闭后方向键恢复 ═══');
const p3 = await evalJS('state.pan.x');
await key('ArrowRight', 39);
ok('5a. 全部窗口关闭后方向键恢复移动画布', (await evalJS('state.pan.x')) !== p3);

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
