import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* v7.8 验收 · H 组：编辑器结构层 + 结构感知候选气泡 + 槽位 + 复制全文
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_v78.mjs [截图输出.png]
   真机口径：文本输入走 Input.insertText / 按键走 Input.dispatchKeyEvent / 点击走 Input.dispatchMouseEvent；
   仅「中文输入法组合态门控」一项用页面内合成 CompositionEvent（无头环境无法真起 IME），该条已在断言名标注。 */
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
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
async function click(sel) {
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
    const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
  if (!r) throw new Error('click target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(120);
}
async function mousedown(sel) {   /* 只按下不抬起：候选是 mousedown 上屏语义 */
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
    const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
  if (!r) throw new Error('mousedown target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(80);
}
const KEY = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 };
async function key(name) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: KEY[name], nativeVirtualKeyCode: KEY[name] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: KEY[name], nativeVirtualKeyCode: KEY[name] });
  await sleep(90);
}
async function type(text) { await send('Input.insertText', { text }); await sleep(120); }

const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
function t(name, pass, detail) { R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

/* 夹具：按语料真实结构拼的短提示词（起手式 → 画面开始 → 叙事 → 画面结束 → 风格包 → 硬性要求） */
const FIX = [
  '事件发生在{{node:node_4ytg0d23am}}室内·周夫子坐在图片最右侧的椅子。',
  '',
  '画面开始：',
  '然后 摄像机往画面右方向摇 拍摄周大伯。周大伯看着镜头方向说【{{node:node_ctz905bh1a}}音色】：“你好。”',
  '画面结束。',
  '',
  '风格：',
  '【光影逻辑】 遵循「暖主体、冷环境、柔面光、轻轮廓」；侧前低位暖柔光铺脸。',
  '【镜头构图】 电影级 CG 镜头，等效 50-85mm 中焦为主。',
  '',
  '硬性要求：无BMG，无字幕，禁止自行新增或删减台词。'
].join('\n');

/* ---------- H1 结构层：逐行节判定无歧义 ---------- */
const h1 = await evalJS(`(() => {
  var txt = ${JSON.stringify(FIX)};
  var map = structMap(txt);
  var pick = function(i){ return map[i].label; };
  return { n: map.length, labels: map.map(function(m){ return m.label; }), l0: pick(0), l2: pick(2), l3: pick(3), l4: pick(4), l6: pick(6), l7: pick(7), l8: pick(8), l10: pick(10),
           shot: structMap('画面开始：\\n镜头2·{{node:x}}首帧画面·画面左侧是甲。')[1].label,
           anchorShot: structMap('镜头1·{{node:x}}首帧画面·画面左侧是甲。')[0].label };
})()`);
t('H1 结构层逐行判定（起手式/画面开始/叙事正文/画面结束/风格包·属性/硬性要求 + 起手式区的镜头N 不误判为分镜）',
  h1.l0 === '起手式' && h1.l2 === '画面开始' && h1.l3 === '叙事正文' && h1.l4 === '画面结束'
  && h1.l6 === '风格包' && h1.l7 === '风格包 · 光影逻辑' && h1.l8 === '风格包 · 镜头构图' && h1.l10 === '硬性要求'
  && h1.shot === '分镜 镜头2' && h1.anchorShot === '起手式',
  `实测 ${JSON.stringify(h1.labels)}`);

/* ---------- H2 状态栏「节」随光标走 ---------- */
await evalJS(`(() => { state.blocks = [{ id:'h1', text:${JSON.stringify(FIX)}, x:40, y:40 }]; state.splice = { items: [], activeUnitId: null }; render(); openBlockEditor(state.blocks[0].text, null); return 1; })()`);
await sleep(150);
const h2 = await evalJS(`(() => {
  var ta = document.getElementById('blkInput'), v = ta.value, out = {};
  var lineStart = function(n){ var p = 0; for(var i=0;i<n;i++) p = v.indexOf('\\n', p) + 1; return p; };
  ta.focus(); ta.setSelectionRange(lineStart(7) + 3, lineStart(7) + 3); hlRefresh(); out.style = document.getElementById('stStruct').textContent;
  ta.setSelectionRange(lineStart(3) + 5, lineStart(3) + 5); hlRefresh(); out.body = document.getElementById('stStruct').textContent;
  ta.setSelectionRange(lineStart(10) + 2, lineStart(10) + 2); hlRefresh(); out.tail = document.getElementById('stStruct').textContent;
  return out;
})()`);
t('H2 状态栏「节」随光标显示当前结构', h2.style === '风格包 · 光影逻辑' && h2.body === '叙事正文' && h2.tail === '硬性要求',
  `风格行=${h2.style} 叙事行=${h2.body} 硬性行=${h2.tail}`);

/* ---------- H3 `\` 触发气泡 + 结构置顶（叙事区 → 镜头句组在前） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh(); return 1; })()`);
await type('\\');
const h3 = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  var groups = Array.prototype.map.call(pop.querySelectorAll('.cmpl-group'), function(e){ return e.textContent; });
  var rectE = document.querySelector('.blk-edit').getBoundingClientRect(), rectP = pop.getBoundingClientRect();
  return { open: !pop.classList.contains('hide'), rows: pop.querySelectorAll('.cmpl-item').length, groups: groups,
           inEdit: rectP.left >= rectE.left - 1 && rectP.right <= rectE.right + 1, w: Math.round(rectP.width), h: Math.round(rectP.height) };
})()`);
t('H3 输入 `\\` 弹候选气泡（且候选行非空、气泡落在编辑区内）',
  h3.open && h3.rows > 0 && h3.inEdit, `行数=${h3.rows} 尺寸=${h3.w}×${h3.h} 组序=${JSON.stringify(h3.groups)}`);
t('H4 结构感知置顶：光标在「硬性要求」节（风格区）触发时，风格包组排第一',
  (h3.groups[0] || '') === '风格包', `实际首组＝${h3.groups[0]}｜完整组序=${JSON.stringify(h3.groups)}`);

/* ---------- H5 过滤：`\光影` → 名称命中优先于正文命中（542 字整套只靠正文命中，必须排在后面） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('\\');
await type('光影');
const h5 = await evalJS(`(() => { var pop = document.getElementById('cmplPop');
  return { rows: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; }) }; })()`);
t('H5 触发符后接查询词即过滤，且名称命中排前（`\\光影` → 「光影逻辑」第一；只有正文含该词的「风格包·全套」退到后面）',
  h5.rows[0] === '光影逻辑' && h5.rows.indexOf('风格包 · 全套') > 0, `候选=${JSON.stringify(h5.rows)}`);

/* ---------- H6 键盘上屏（↑↓ 切换回第一项 + Enter 提交），触发符被吃掉 ---------- */
const h6first = await evalJS(`(() => { var it = cmplItems[0]; return { label: it.label, len: it.body.length, tail: it.body.slice(-24) }; })()`);
await key('ArrowDown');
await key('ArrowUp');
await key('Enter');
const h6 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); var v = ta.value; var pop = document.getElementById('cmplPop');
  return { len: v.length, tail: v.slice(-24), triggerLeft: v.slice(-400).indexOf('\\\\光影') >= 0, popHidden: pop.classList.contains('hide') }; })()`);
t('H6 键盘 ↑↓ + Enter 上屏（↑↓ 转一圈回到当前第一项并落盘、触发符与查询词被吃掉、气泡关闭）',
  h6.popHidden && !h6.triggerLeft && h6.tail === h6first.tail, `第一项=「${h6first.label}」→ 尾部=「${h6.tail}」（期望「${h6first.tail}」）`);

/* ---------- H7 鼠标点选上屏（mousedown + preventDefault 保焦点） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('\\');
const h7a = await evalJS(`(() => { var p = document.getElementById('cmplPop'); if(p.classList.contains('hide')) return null;
  var lab = p.querySelector('.cmpl-item .cmpl-label'); return lab ? lab.textContent : null; })()`);
await mousedown('#cmplPop .cmpl-item');
const h7 = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-46), popHidden: pop.classList.contains('hide'), focused: document.activeElement === ta, triggerLeft: ta.value.slice(-30).indexOf('\\\\') >= 0 }; })()`);
t('H7 鼠标点选候选上屏（焦点仍在输入框、触发符被吃掉）',
  h7.popHidden && h7.focused && !h7.triggerLeft && h7.tail.indexOf('：') >= 0, `选中条「${h7a}」→ 尾部=「${h7.tail}」 焦点=${h7.focused}`);

/* ---------- H8 Esc 顺序：第一次关候选、第二次才关编辑器 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('\\');
await key('Escape');
const h8a = await evalJS(`({ popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
await key('Escape');
const h8b = await evalJS(`({ editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
t('H8 Esc 顺序：候选打开时 Esc 只关候选，再按一次才关编辑器',
  h8a.popHidden && h8a.editorOpen && !h8b.editorOpen, `第一次 Esc → 气泡藏=${h8a.popHidden}/编辑器开=${h8a.editorOpen}；第二次 → 编辑器开=${h8b.editorOpen}`);

/* ---------- H9 槽位：`${n}` 上屏后吃掉标记、Tab 逐位跳并跟住输入位移 ---------- */
await evalJS(`(() => { state.blocks = [{ id:'h9', text:'', x:40, y:40 }]; render();
  openBlockEditor('', function(v){ window.__cb9 = v; }); return 1; })()`);
await sleep(150);
await type('\\台词');
await key('Enter');
const h9a = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null, marker: /\\$\\{/.test(ta.value) }; })()`);
await type('周夫子');
const h9b = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
await key('Tab');
const h9c = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
t('H9 槽位：${n} 标记上屏即被吃掉（文档里不留标记）、光标落第一个槽位（{{node:|}} 的 id 位）',
  !h9a.marker && h9a.v.indexOf('说【{{node:}}音色】：“”') >= 0 && h9a.caret === h9a.v.indexOf('}}'),
  `上屏=「${h9a.v}」 光标=${h9a.caret}（期望 ${h9a.v.indexOf('}}')}） 槽位=${JSON.stringify(h9a.slots)}`);
t('H10 槽位跟踪：槽位内打字后续槽位同步位移；Tab 跳到下一个槽位（引号内）',
  h9b.v === '说【{{node:周夫子}}音色】：“”' && h9c.caret === h9b.v.indexOf('“') + 1 && h9c.slots && h9c.slots.length === 2,
  `打字后=「${h9b.v}」；Tab 后光标=${h9c.caret}（期望 ${h9b.v.indexOf('“') + 1}）；槽位=${JSON.stringify(h9c.slots)}`);

/* ---------- H11 风格包·全套：逐字等于定型件，且自动补足前置空行 ---------- */
await evalJS(`(() => { openBlockEditor('画面结束。', null); return 1; })()`);
await sleep(150);
await type('\\全套');
await key('Enter');
const h11 = await evalJS(`(() => { var v = document.getElementById('blkInput').value;
  return { head: v.slice(0, 16), exact: v === ('画面结束。\\n\\n' + cmplFullStyle()), len: v.length, styleLen: cmplFullStyle().length, tail: v.slice(-30) }; })()`);
t('H11 「风格包·全套」逐字等于你的定型件（542 字 5 段 + 硬性要求），且自动补前置空行',
  h11.exact, `产物 ${h11.len} 字符（含前段）；定型件 ${h11.styleLen} 字符；开头=「${h11.head}」尾部=「${h11.tail}」`);

/* ---------- H12 复制全文：剪贴板内容 = textarea.value 原样（不带渲染层 span） ---------- */
const h12 = await evalJS(`(async () => {
  var cap = [];
  var orig = window.copyText;
  window.copyText = function(s){ cap.push(s); return Promise.resolve(true); };
  var btn = document.getElementById('blkCopy');
  btn.click();
  await new Promise(function(r){ setTimeout(r, 60); });
  window.copyText = orig;
  var v = document.getElementById('blkInput').value;
  return { got: cap.length === 1 && cap[0] === v, len: cap[0] ? cap[0].length : -1, hasSpan: /<span/i.test(cap[0] || ''), toast: document.getElementById('toast').innerText.trim() };
})()`);
t('H12 「⧉ 复制全文」送出的就是 textarea 原文（不含着色 span）+ toast 回执',
  h12.got && !h12.hasSpan && h12.toast.indexOf('已复制全文') === 0, `${h12.len} 字符 ｜ toast=「${h12.toast}」`);

/* ---------- H13 中文输入法组合态门控（无头环境用合成 CompositionEvent 验证门闩本身） ---------- */
const h13 = await evalJS(`(() => {
  var ta = document.getElementById('blkInput');
  openBlockEditor('', null);
  ta.focus();
  ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  ta.value = '\\\\'; ta.setSelectionRange(1, 1);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  var composing = { pop: !document.getElementById('cmplPop').classList.contains('hide') };
  ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '\\\\' }));
  var after = { pop: !document.getElementById('cmplPop').classList.contains('hide'), rows: document.getElementById('cmplPop').querySelectorAll('.cmpl-item').length };
  return { composing: composing.pop, after: after.pop, rows: after.rows };
})()`);
t('H13 输入法组合态门控（合成事件）：组合中不弹候选，组合结束才评估',
  h13.composing === false && h13.after === true && h13.rows > 0, `组合中弹=${h13.composing}；组合结束后弹=${h13.after}（${h13.rows} 条）`);

/* ---------- H14 气泡不扰动编辑层（着色层与编辑层排版仍逐字一致：气泡在浮动层） ---------- */
const h14 = await evalJS(`(() => {
  openBlockEditor(${JSON.stringify(FIX)}, null);
  var ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh();
  cmplClose();
  var a = { taW: ta.getBoundingClientRect().width, preW: pre.getBoundingClientRect().width, lines: document.querySelectorAll('.blk-hl .hl-line').length, taH: ta.getBoundingClientRect().height };
  cmplOnInput();
  cmplRender();
  var open = !document.getElementById('cmplPop').classList.contains('hide');
  var b = { taW: ta.getBoundingClientRect().width, preW: pre.getBoundingClientRect().width, lines: document.querySelectorAll('.blk-hl .hl-line').length, taH: ta.getBoundingClientRect().height };
  cmplClose();
  return { a: a, b: b, open: open };
})()`);
t('H14 候选气泡为独立浮层（弹出前后彩色层/编辑层宽度、高度、行数逐项不变）',
  h14.open && h14.a.taW === h14.b.taW && h14.a.preW === h14.b.preW && h14.a.lines === h14.b.lines && h14.a.taH === h14.b.taH,
  `宽 ${h14.a.taW}/${h14.a.preW} → ${h14.b.taW}/${h14.b.preW}；高 ${h14.a.taH} → ${h14.b.taH}；行数 ${h14.a.lines} → ${h14.b.lines}`);

/* ---------- H15 结构层零副作用：着色/错误计数口径未变（对照 v7.7 语义） ---------- */
const h15 = await evalJS(`(() => {
  var txt = '然后 摄像机往画面右方向摇 拍摄某人，然后 他说：“这里有，逗号。”';
  var fam = hlClassify(txt);
  var errs = 0; for(var i=0;i<fam.length;i++) if(fam[i] === 'err') errs++;
  return { errs: errs, expect: 1 };   /* 台词区豁免后：引号内的「，」不计，只剩引号外那一个半角/中文逗号 */
})()`);
t('H15 结构层未改动着色引擎（v7.7 台词区豁免语义保持：引号内逗号不计错误）',
  h15.errs === h15.expect, `错误数=${h15.errs}（期望 ${h15.expect}）`);

/* ---------- 截图 ---------- */
const SHOT = process.argv[2] || '';
if (SHOT) {
  await evalJS(`(() => { state.blocks = [{ id:'s1', text:${JSON.stringify(FIX)}, x:80, y:60 }]; render(); openBlockEditor(state.blocks[0].text, null);
    var ta = document.getElementById('blkInput'); ta.value += '\\n\\n\\n'; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh();
    ta.value += '\\\\'; ta.setSelectionRange(ta.value.length, ta.value.length); cmplOnInput(); return 1; })()`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', SHOT);
}

const pass = R.filter(r => r.pass).length;
console.log('=== v7.8 H 组验收（真机 headless Edge + CDP）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nH 组合计 ${pass}/${R.length}`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
