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
const DIGIT_VK = { '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57 };
async function digit(d) {   /* v7.8：数字键跳位（输入法式） */
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: d, code: 'Digit' + d, windowsVirtualKeyCode: DIGIT_VK[d], nativeVirtualKeyCode: DIGIT_VK[d] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: 'Digit' + d, windowsVirtualKeyCode: DIGIT_VK[d], nativeVirtualKeyCode: DIGIT_VK[d] });
  await sleep(90);
}

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

/* ---------- H3 `#` 触发气泡 + 结构置顶（叙事区 → 镜头句组在前） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh(); return 1; })()`);
await type('#');
const h3 = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  var labels = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; });
  var idxs = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-idx'), function(e){ return e.textContent; }).join('');
  var rectE = document.querySelector('.blk-edit').getBoundingClientRect(), rectP = pop.getBoundingClientRect();
  return { open: !pop.classList.contains('hide'), rows: pop.querySelectorAll('.cmpl-item').length,
           groupRows: pop.querySelectorAll('.cmpl-item.cmpl-grp').length, labels: labels, idxs: idxs,
           inEdit: rectP.left >= rectE.left - 1 && rectP.right <= rectE.right + 1, w: Math.round(rectP.width), h: Math.round(rectP.height) };
})()`);
t('H3 输入 `#` 弹候选气泡：第一层是**组视图**（一行一组、带序号 1..9），气泡落在编辑区内',
  h3.open && h3.rows > 0 && h3.inEdit && h3.groupRows === h3.rows && h3.idxs.slice(0, 3) === '123' && h3.idxs.length === h3.rows,
  `组行 ${h3.groupRows}/${h3.rows} 尺寸=${h3.w}×${h3.h} 序号=${h3.idxs} 组序=${JSON.stringify(h3.labels)}`);
t('H4 结构感知置顶：光标在「硬性要求」节（风格区）触发时，风格包组排第一',
  (h3.labels[0] || '') === '风格包', `实际首组＝${h3.labels[0]}｜完整组序=${JSON.stringify(h3.labels)}`);

/* ---------- H5 过滤：`#光影` → 名称命中优先于正文命中（542 字整套只靠正文命中，必须排在后面） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await type('光影');
const h5 = await evalJS(`(() => { var pop = document.getElementById('cmplPop');
  return { rows: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; }) }; })()`);
t('H5 触发符后接查询词即过滤，且名称命中排前（`#光影` → 「光影逻辑」第一；只有正文含该词的「风格包·全套」退到后面）',
  h5.rows[0] === '光影逻辑' && h5.rows.indexOf('风格包 · 全套') > 0, `候选=${JSON.stringify(h5.rows)}`);

/* ---------- H6 键盘上屏（↑↓ 切换回第一项 + Enter 提交），触发符被吃掉 ---------- */
const h6first = await evalJS(`(() => { var it = cmplItems[0]; return { label: it.label, len: it.body.length, tail: it.body.slice(-24) }; })()`);
await key('ArrowDown');
await key('ArrowUp');
await key('Enter');
const h6 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); var v = ta.value; var pop = document.getElementById('cmplPop');
  return { len: v.length, tail: v.slice(-24), triggerLeft: v.slice(-400).indexOf('#光影') >= 0, popHidden: pop.classList.contains('hide') }; })()`);
t('H6 键盘 ↑↓ + Enter 上屏（↑↓ 转一圈回到当前第一项并落盘、触发符与查询词被吃掉、气泡关闭）',
  h6.popHidden && !h6.triggerLeft && h6.tail === h6first.tail, `第一项=「${h6first.label}」→ 尾部=「${h6.tail}」（期望「${h6first.tail}」）`);

/* ---------- H6b 键盘层级导航：Enter 进组 → Esc 退回组视图 → Esc 关气泡 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await key('Enter');                                   /* 进组视图第一行 */
const h6b1 = await evalJS(`({ group: cmplGroup, first: cmplItems[0] ? cmplItems[0].label : null, kind: cmplItems[0] ? cmplItems[0].kind : null })`);
await key('Escape');                                  /* 退组 */
const h6b2 = await evalJS(`({ group: cmplGroup, kind: cmplItems[0] ? cmplItems[0].kind : null, popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
await key('Escape');                                  /* 关气泡（编辑器仍在） */
const h6b3 = await evalJS(`({ popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
t('H6b 层级导航：Enter 进组 → Esc 退回组视图 → 再 Esc 关气泡（编辑器不关）',
  h6b1.group === '风格包' && h6b1.kind === 'item' && h6b2.group === null && h6b2.kind === 'group' && !h6b2.popHidden
  && h6b3.popHidden && h6b3.editorOpen,
  `进组=${h6b1.group}｜退组后 kind=${h6b2.kind}｜两次 Esc 后 气泡藏=${h6b3.popHidden} 编辑器开=${h6b3.editorOpen}`);

/* ---------- H7 鼠标点选上屏（mousedown + preventDefault 保焦点） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
const h7a = await evalJS(`(() => { var p = document.getElementById('cmplPop'); if(p.classList.contains('hide')) return null;
  var lab = p.querySelector('.cmpl-item .cmpl-label'); return lab ? lab.textContent : null; })()`);
await mousedown('#cmplPop .cmpl-item');                 /* 第一下：点组 → 进组 */
const h7mid = await evalJS(`({ group: cmplGroup, first: (document.querySelector('#cmplPop .cmpl-item .cmpl-label') || {}).textContent })`);
await mousedown('#cmplPop .cmpl-item');                 /* 第二下：点组内第一条 → 上屏 */
const h7 = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-46), popHidden: pop.classList.contains('hide'), focused: document.activeElement === ta, triggerLeft: ta.value.slice(-30).indexOf('#') >= 0 }; })()`);
t('H7 鼠标点选（两级）：第一下点组 = 进组，第二下点条目 = 上屏（焦点仍在输入框、触发符被吃掉）',
  h7mid.group === h7a && h7.popHidden && h7.focused && !h7.triggerLeft && h7.tail.indexOf('禁止自行新增或删减台词') >= 0,
  `点组「${h7a}」→ 进组后首条「${h7mid.first}」→ 尾部=「${h7.tail}」 焦点=${h7.focused}`);

/* ---------- H8 Esc 顺序：第一次关候选、第二次才关编辑器 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
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
await type('#台词');
await key('Enter');
const h9a = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null, marker: /\\$\\{/.test(ta.value) }; })()`);
await type('干嘛呢');
const h9b = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
await key('Tab');
const h9c = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
t('H9 槽位：${n} 标记上屏即被吃掉（文档里不留标记）、光标落第一个槽位（引号内台词位）',
  !h9a.marker && h9a.v === '说【@音色】：“”' && h9a.caret === h9a.v.indexOf('“') + 1,
  `上屏=「${h9a.v}」 光标=${h9a.caret}（期望 ${h9a.v.indexOf('“') + 1}） 槽位=${JSON.stringify(h9a.slots)}`);
t('H10 槽位跟踪：槽位内打字后续槽位同步位移；多槽位片段（角色+说+音色）Tab 跳到下一个槽位',
  h9b.v === '说【@音色】：“干嘛呢”' && h9c.slots === null && h9c.caret === h9b.caret,
  `打字后=「${h9b.v}」；末槽位后 Tab → 槽位模式结束（slots=${JSON.stringify(h9c.slots)}）`);

/* ---------- H10b 多槽位：角色槽 → Tab → 台词槽（检查位移同步） ---------- */
await evalJS(`(() => { openBlockEditor('', null); return 1; })()`);
await sleep(150);
await type('#角色');
await key('Enter');
const h10b0 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
await type('周夫子');
await key('Tab');
const h10b1 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
t('H10b 两槽位片段：角色槽打字后 Tab 跳到台词槽（槽位位置随输入右移）',
  h10b0.v === '说【@音色】：“”' && h10b1.v === '周夫子说【@音色】：“”' && h10b1.caret === h10b1.v.indexOf('“') + 1 && h10b1.slots && h10b1.slots.length === 2,
  `上屏=「${h10b0.v}」→ 打字+Tab 后=「${h10b1.v}」光标=${h10b1.caret}（期望 ${h10b1.v.indexOf('“') + 1}）槽位=${JSON.stringify(h10b1.slots)}`);

/* ---------- H10c 候选表里不出现 `{{node:…}}`（素材绑定位一律用 @） ---------- */
const h10c = await evalJS(`(() => {
  var bad = [], all = 0;
  for(var gi = 0; gi < CMPL_GROUPS.length; gi++) for(var ii = 0; ii < CMPL_GROUPS[gi].items.length; ii++){
    all++;
    if(CMPL_GROUPS[gi].items[ii].body.indexOf('{{node:') >= 0) bad.push(CMPL_GROUPS[gi].label + '/' + CMPL_GROUPS[gi].items[ii].label);
  }
  return { all: all, bad: bad, hasAt: CMPL_GROUPS[1].items[0].body.indexOf('@') >= 0 };
})()`);
t('H10c 候选片段里不写 `{{node:…}}`（那是画布自动生成的引用；素材绑定位统一用 `@`）',
  h10c.bad.length === 0 && h10c.hasAt, `候选 ${h10c.all} 条，违规 ${h10c.bad.length} 条${h10c.bad.length ? '：' + h10c.bad.join('、') : ''}`);

/* ---------- H16 数字键分级：组视图下数字 = 按组切换；组内数字 = 直取该条上屏 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
const h16a = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  return { first: (pop.querySelector('.cmpl-item .cmpl-label') || {}).textContent,
           idxs: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-idx'), function(e){ return e.textContent; }).join('') };
})()`);
await digit('1');                                    /* 数字 = 按组切换 → 进第 1 组 */
const h16b = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  return { group: cmplGroup,
           labels: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; }),
           fifth: cmplItems[4] ? cmplPrepare(cmplItems[4].body).text.slice(-20) : null,
           fifthLabel: cmplItems[4] ? cmplItems[4].label : null };
})()`);
await digit('5');                                    /* 组内数字 = 直取该条上屏 */
const h16c = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-20), popHidden: pop.classList.contains('hide'), triggerLeft: ta.value.slice(-400).indexOf('#') >= 0 }; })()`);
t('H16 数字键分级：组视图下数字 = 按组切换（1 → 进第 1 组「风格包」）；组内数字 = 直取该条上屏',
  h16a.idxs === '1234567' && h16a.first === '风格包' && h16b.group === '风格包' && h16b.labels.length >= 5
  && h16c.popHidden && !h16c.triggerLeft && h16c.tail.indexOf(h16b.fifth) >= 0,
  `组视图首行=「${h16a.first}」→ 按 1 进组「${h16b.group}」（${h16b.labels.length} 条）→ 按 5 取「${h16b.fifthLabel}」→ 尾部=「${h16c.tail}」`);

/* ---------- H17 Tab = 一键补全（两级：先按 Tab 进组，再按 Tab 落组内第一条） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await key('Tab');                                     /* 第一下：进组视图第一行 */
const h17a = await evalJS(`({ group: cmplGroup, first: cmplItems[0] ? cmplItems[0].label : null })`);
const h17first = await evalJS(`(() => { var it = cmplItems[0]; return { label: it.label, tail: it.body.slice(-20) }; })()`);
await key('Tab');                                     /* 第二下：落组内第一条 */
const h17 = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-20), popHidden: pop.classList.contains('hide'), focused: document.activeElement === ta }; })()`);
t('H17 Tab 一键补全（两级）：`#` → Tab 进组 → Tab 落组内第一条（气泡关闭、焦点留在输入框）',
  h17a.group === '风格包' && h17.popHidden && h17.focused && h17.tail === h17first.tail,
  `进组「${h17a.group}」→ 第一条「${h17first.label}」→ 尾部=「${h17.tail}」 焦点=${h17.focused}`);

/* ---------- H18 无候选时 Tab 不逃逸焦点（否则接着打的字会丢到窗口外） ---------- */
const h18 = await evalJS(`(() => { openBlockEditor('画面结束。', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset();
  return { before: document.activeElement === ta, len: ta.value.length }; })()`);
await key('Tab');
const h18b = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { focused: document.activeElement === ta, len: ta.value.length, hasTab: ta.value.indexOf('\\t') >= 0 }; })()`);
t('H18 无候选/无槽位时按 Tab：焦点不逃出编辑器、也不往文本里插 Tab 字符',
  h18.before && h18b.focused && h18b.len === h18.len && !h18b.hasTab,
  `焦点 ${h18.before} → ${h18b.focused}；长度 ${h18.len} → ${h18b.len}`);

/* ---------- H11 风格包·全套：逐字等于定型件，且自动补足前置空行 ---------- */
await evalJS(`(() => { openBlockEditor('画面结束。', null); return 1; })()`);
await sleep(150);
await type('#全套');
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
  ta.value = '#'; ta.setSelectionRange(1, 1);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  var composing = { pop: !document.getElementById('cmplPop').classList.contains('hide') };
  ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '#' }));
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

/* ========== I 组（v7.8 补全配置窗口：浏览 / 修改 / 新增） ========== */
/* 前置：把上一组留下的编辑器窗口关掉（否则顶栏按钮被遮罩盖住，点不到）；并把片段库复位成「未物化」 */
await evalJS(`(() => { closeBlockEditor(); closeCmplCfg(); state.cmpl = { v: CMPL_SEED_V, items: null }; cmplInvalidate(); return 1; })()`);

/* ---------- I1 顶栏入口 + 首开物化 + 全量列出 ---------- */
const i0 = await evalJS(`({ hasBtn: !!document.getElementById('btnCmpl'), hiddenBefore: document.getElementById('cmplCfgMask').classList.contains('hide'), seedLen: cmplSeedItems().length, materialized: Array.isArray(state.cmpl && state.cmpl.items) })`);
await click('#btnCmpl');
const i1 = await evalJS(`(() => {
  var cards = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card').length;
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  return { open: !document.getElementById('cmplCfgMask').classList.contains('hide'), cards: cards,
           items: state.cmpl && Array.isArray(state.cmpl.items) ? state.cmpl.items.length : -1,
           persisted: !!(ls && ls.cmpl && Array.isArray(ls.cmpl.items)),
           title: (document.querySelector('#cmplCfgMask .tpl-title') || {}).textContent };
})()`);
t('I1 顶栏「补」入口打开补全配置窗口；首次打开即把内置表物化成用户表并落盘（条目数一致）',
  i0.hasBtn && i0.hiddenBefore && !i0.materialized && i1.open && i1.cards === i1.items && i1.items === i0.seedLen && i1.persisted,
  `内置 ${i0.seedLen} 条 → 窗口列出 ${i1.cards} 张卡 / 用户表 ${i1.items} 条；已落盘=${i1.persisted}；标题=「${i1.title}」`);

/* ---------- I2 按组归并 + 搜索框可用 ---------- */
const i2 = await evalJS(`(() => ({
  groups: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group').length,
  distinct: (function(){ var s = {}, n = 0; cmplActive().forEach(function(x){ var g = x.group || '未分组'; if(!s[g]){ s[g] = 1; n++; } }); return n; })(),
  hasSearch: !!document.getElementById('cmplCfgSearch'), listOpts: document.querySelectorAll('#cmplCfgGroupList option').length
}))()`);
t('I2 片段按组归并展示（组标题数 = 生效表里去重后的组数）+ 搜索框与分组候选就位',
  i2.groups === i2.distinct && i2.hasSearch && i2.listOpts === i2.distinct,
  `组标题 ${i2.groups} / 去重组数 ${i2.distinct}；分组候选 ${i2.listOpts} 项`);

/* ---------- I3 修改内置片段：表单预填 → 保存 → 生效表与候选气泡同步 ---------- */
const i3before = await evalJS(`(() => { var f = cmplActive()[0]; return { key: f.key, label: f.label, len: f.body.length }; })()`);
await click('#cmplCfgBody .cmpl-cfg-card [data-act="edit"]');
const i3form = await evalJS(`(() => ({
  editing: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card.editing').length,
  label: (document.getElementById('cmplCfgLabelIn') || {}).value,
  group: (document.getElementById('cmplCfgGroupIn') || {}).value,
  len: ((document.getElementById('cmplCfgBodyIn') || {}).value || '').length
}))()`);
await evalJS(`(() => {
  var li = document.getElementById('cmplCfgLabelIn'), bi = document.getElementById('cmplCfgBodyIn');
  li.value = '光影逻辑（我的改版）'; bi.value = '【光影逻辑】 这是我改过的版本，专门用来验收配置窗口。';
  return 1;
})()`);
await click('#cmplCfgSave');
const i3after = await evalJS(`(() => {
  var f = cmplActive()[0];
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(0, 0);
  ta.value = '#'; ta.setSelectionRange(1, 1); cmplOnInput();
  var pop = document.getElementById('cmplPop');
  var rows = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item'), function(e){ return e.textContent; });
  cmplClose(); closeBlockEditor();
  return { label: f.label, body: f.body, lsBody: ls && ls.cmpl.items[0].body, editorStillOpen: false, rows: rows.slice(0, 3) };
})()`);
t('I3 改内置片段：点「编辑」表单预填原值 → 保存后生效表/localStorage 同步更新，候选气泡里立刻是改后的内容',
  i3form.editing === 1 && i3form.label === i3before.label && i1.cards === i0.seedLen
  && i3after.label === '光影逻辑（我的改版）' && i3after.body.length !== i3before.len && i3after.lsBody === i3after.body,
  `表单预填「${i3form.label}」(${i3form.len} 字符) → 保存后「${i3after.label}」(${i3after.body.length} 字符)；落盘一致=${i3after.lsBody === i3after.body}`);

/* ---------- I4 新增自定义片段（带槽位）→ 候选命中并正确上屏 ---------- */
await evalJS(`(() => { if(document.getElementById('cmplCfgMask').classList.contains('hide')) openCmplCfg(); return 1; })()`);
await click('#cmplCfgNew');
await evalJS(`(() => {
  document.getElementById('cmplCfgGroupIn').value = '我的常用';
  document.getElementById('cmplCfgLabelIn').value = '环绕半圈句';
  document.getElementById('cmplCfgNoteIn').value = '自建';
  document.getElementById('cmplCfgBodyIn').value = '然后 镜头环绕@\${1}半圈，速度\${2}。';
  return 1;
})()`);
await click('#cmplCfgSave');
const i4 = await evalJS(`(() => {
  var found = null; cmplActive().forEach(function(x){ if(x.label === '环绕半圈句') found = x; });
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.value = '#环绕半圈'; ta.setSelectionRange(5, 5); cmplOnInput();
  var hit = cmplItems.length ? cmplItems[0].label : null;
  return { exists: !!found, group: found && found.group, note: found && found.note, len: cmplActive().length, hit: hit };
})()`);
await key('Enter');
const i4b = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { v: ta.value, slots: cmplSlots ? cmplSlots.slice() : null, caret: ta.selectionStart }; })()`);
t('I4 新增自建片段（含 ${n} 槽位）：保存后进生效表、按标签搜索命中、上屏后槽位就位',
  i4.exists && i4.group === '我的常用' && i4.note === '自建' && i4.hit === '环绕半圈句'
  && i4b.v === '然后 镜头环绕@半圈，速度。' && i4b.slots && i4b.slots.length === 2,
  `新片段在表=${i4.exists}（组「${i4.group}」）；候选首条=「${i4.hit}」；上屏=「${i4b.v}」槽位=${JSON.stringify(i4b.slots)}`);

/* ---------- I5 删除 + 撤销 ---------- */
await evalJS(`closeBlockEditor()`);
const i5before = await evalJS(`cmplActive().length`);
await evalJS(`(() => { var k = null; cmplActive().forEach(function(x){ if(x.label === '环绕半圈句') k = x.key; }); cmplCfgDel(k); return 1; })()`);
const i5mid = await evalJS(`(() => ({ len: cmplActive().length, toast: document.getElementById('toast').innerText.replace(/\s+/g,' ').trim(), hasUndo: !!document.querySelector('#toast button') }))()`);
await evalJS(`(() => { var b = document.querySelector('#toast button'); if(b) b.click(); return 1; })()`);
const i5after = await evalJS(`cmplActive().length`);
t('I5 删除片段：生效表立即减一，toast 带「撤销」，撤销后恢复原状',
  i5mid.len === i5before - 1 && i5mid.hasUndo && i5after === i5before,
  `删除 ${i5before} → ${i5mid.len} → 撤销后 ${i5after}；toast=「${i5mid.toast}」`);

/* ---------- I6 恢复内置默认 ---------- */
await click('#cmplCfgReset');
const i6 = await evalJS(`({ items: state.cmpl.items, len: cmplActive().length, seed: cmplSeedItems().length, cards: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card').length })`);
t('I6 「恢复内置默认」清空用户表（items=null）并回落内置片段库',
  i6.items === null && i6.len === i6.seed && i6.cards === i6.seed,
  `items=${JSON.stringify(i6.items)}；生效 ${i6.len} 条 = 内置 ${i6.seed} 条；窗口列出 ${i6.cards} 张`);

/* ---------- I7 存储往返 + 旧数据迁移（无 cmpl 的 v12 文件） ---------- */
const i7 = await evalJS(`(() => {
  cmplCfgMaterialize();
  var arr = cmplActive().slice();
  arr[0] = { key: arr[0].key, group: arr[0].group, label: '往返测试', note: '', body: '往返测试内容', block: false };
  cmplSetItems(arr); saveNow();
  var back = migrate(JSON.parse(localStorage.getItem(LS_KEY)));
  var old = migrate({ app: 'storyboard-prompt-panel', version: 12, blocks: [] });
  return { roundTrip: back.cmpl.items[0].label, version: back.version, oldHidden: old.cmpl.items, oldV: old.version, oldBlocks: old.blocks.length };
})()`);
t('I7 存储往返（state → localStorage → migrate 后仍在）+ 旧版数据（无 cmpl）迁移后回落内置、版本升到 13',
  i7.roundTrip === '往返测试' && i7.version === 13 && i7.oldHidden === null && i7.oldV === 13 && i7.oldBlocks === 0,
  `往返=${i7.roundTrip}｜version=${i7.version}｜旧数据 cmpl.items=${JSON.stringify(i7.oldHidden)}（null=用内置）`);

/* ---------- I8 Esc 关窗 + 回到干净状态 ---------- */
await evalJS(`(() => { cmplCfgReset(); closeCmplCfg(); openCmplCfg(); return 1; })()`);
await key('Escape');
const i8 = await evalJS(`({ open: !document.getElementById('cmplCfgMask').classList.contains('hide'), items: state.cmpl.items, seed: cmplSeedItems().length })`);
await evalJS(`(() => { cmplCfgReset(); return 1; })()`);
t('I8 配置窗口内按 Esc 关窗（关窗后片段库保持已物化状态；末尾已复位）',
  !i8.open && Array.isArray(i8.items) && i8.items.length === i8.seed,
  `窗口开=${i8.open}；用户表 ${i8.items ? i8.items.length : 'null'} 条`);

/* ---------- I9 拖拽排序：条目（拖到第 3 条之前 → 插到它前面） ---------- */
const i9 = await evalJS(`(() => {
  cmplCfgMaterialize(); renderCmplCfg();
  var cards = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card');
  var dt = new DataTransfer();
  var a = cards[0], c = cards[2];
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  c.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overCls = c.classList.contains('drag-over');
  c.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  var arr = cmplActive();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  return { overCls: overCls, order: arr.slice(0, 3).map(function(x){ return x.label; }),
           persisted: !!(ls && ls.cmpl && ls.cmpl.items && ls.cmpl.items[1].label === '风格包 · 全套'),
           toast: document.getElementById('toast').innerText.replace(/\s+/g,' ').trim() };
})()`);
t('I9 条目拖拽排序：把第 1 条拖到第 3 条之前 → 生效表顺序改变、落盘、dragover 有高亮反馈',
  i9.overCls && i9.order[0] === '光影逻辑' && i9.order[1] === '风格包 · 全套' && i9.persisted,
  `dragover 高亮=${i9.overCls}；新序前三条=${JSON.stringify(i9.order)}；已落盘=${i9.persisted}；toast=「${i9.toast}」`);

/* ---------- I10 拖拽排序：分组（把第 1 组拖到第 3 组之前） ---------- */
const i10 = await evalJS(`(() => {
  var before = cmplGroupOrder().slice();
  var heads = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group');
  var dt = new DataTransfer();
  var a = heads[0], b = heads[2];
  var fromG = a.dataset.group, toG = b.dataset.group;
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  var after = cmplGroupOrder();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  var headOrder = Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group'), function(e){ return e.dataset.group; });
  var bubbleFirst = null;
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.value = '#'; ta.setSelectionRange(1, 1); cmplOnInput();
  var pop = document.getElementById('cmplPop');
  bubbleFirst = (pop.querySelector('.cmpl-item .cmpl-label') || {}).textContent;
  cmplClose(); closeBlockEditor();
  return { before: before, after: after, fromG: fromG, toG: toG, headOrder: headOrder, bubbleFirst: bubbleFirst,
           gorder: (ls && ls.cmpl && ls.cmpl.gorder) || null };
})()`);
t('I10 分组拖拽排序：整组换位 → 组顺序变化、写进 state.cmpl.gorder 落盘、配置窗口与候选气泡同步跟随',
  i10.after.indexOf(i10.fromG) === i10.after.indexOf(i10.toG) - 1
  && JSON.stringify(i10.gorder) === JSON.stringify(i10.after)
  && i10.headOrder[0] === i10.after[0] && i10.bubbleFirst === i10.after[0],
  `组序 ${JSON.stringify(i10.before)} → ${JSON.stringify(i10.after)}（把「${i10.fromG}」拖到「${i10.toG}」前）；gorder=${JSON.stringify(i10.gorder)}；headOrder=${JSON.stringify(i10.headOrder)}；气泡首组=「${i10.bubbleFirst}」；子句=${[i10.after.indexOf(i10.fromG) === i10.after.indexOf(i10.toG) - 1, JSON.stringify(i10.gorder) === JSON.stringify(i10.after), i10.headOrder[0] === i10.after[0], i10.bubbleFirst === i10.after[0]].join(',')}`);

/* ---------- I11 拖分组时左侧浮现「顺序小窗」 ---------- */
const i11 = await evalJS(`(() => {
  cmplCfgMaterialize(); renderCmplCfg();
  var heads = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group');
  var dt = new DataTransfer();
  var a = heads[0], g0 = a.dataset.group;
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var pop = document.getElementById('cmplOrderPop');
  var rows = Array.prototype.map.call(pop.querySelectorAll('.cmpl-order-row'), function(e){ return e.dataset.group; });
  var rectW = document.querySelector('#cmplCfgMask .tpl-win').getBoundingClientRect();
  var rectP = pop.getBoundingClientRect();
  return { open: !pop.classList.contains('hide'), rows: rows, active: pop.querySelectorAll('.cmpl-order-row.active').length,
           nums: Array.prototype.map.call(pop.querySelectorAll('.cmpl-order-row .cmpl-order-no'), function(e){ return e.textContent; }).join(''),
           g0: g0, leftOfWin: rectP.right <= rectW.left + 1, cap: (pop.querySelector('.cmpl-order-cap') || {}).textContent };
})()`);
t('I11 拖动分组时：窗口左侧浮现顺序小窗（一行一组、带序号、被拖那行标「拖动中」，且整块落在窗口左侧）',
  i11.open && i11.rows.length >= 7 && i11.rows[0] === i11.g0 && i11.active === 1 && i11.leftOfWin
  && i11.nums.slice(0, 7) === '1234567',
  `小窗开=${i11.open} 行数=${i11.rows.length} 序号=${i11.nums} 被拖=${i11.g0} 左侧=${i11.leftOfWin} 标题=「${i11.cap}」`);

/* ---------- I12 拖到小窗第 3 行 → 该组落到第 3 位 ---------- */
const i12 = await evalJS(`(() => {
  var pop = document.getElementById('cmplOrderPop');
  var rows = pop.querySelectorAll('.cmpl-order-row');
  var fromG = pop.querySelector('.cmpl-order-row.active').dataset.group;
  var target = rows[2];
  var dt = new DataTransfer();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overCls = target.classList.contains('over');
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cmplOrderHide();
  var after = cmplGroupOrder();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  var headOrder = Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group'), function(e){ return e.dataset.group; });
  return { overCls: overCls, fromG: fromG, after: after, idx: after.indexOf(fromG),
           gorder: (ls && ls.cmpl && ls.cmpl.gorder) || null, popHidden: document.getElementById('cmplOrderPop').classList.contains('hide'),
           headOk: headOrder[0] === after[0] };
})()`);
t('I12 拖到小窗第 3 行：该组落到第 3 位（高亮反馈 + 落盘 + 主列表同步；小窗收起）',
  i12.overCls && i12.idx === 2 && JSON.stringify(i12.gorder) === JSON.stringify(i12.after) && i12.popHidden && i12.headOk,
  `把「${i12.fromG}」拖到第 3 行 → 组序=${JSON.stringify(i12.after)}（现在第 ${i12.idx + 1} 位）；gorder 落盘=${JSON.stringify(i12.gorder) === JSON.stringify(i12.after)}；小窗收起=${i12.popHidden}`);

/* ---------- 截图 ---------- */
const SHOT = process.argv[2] || '';
if (SHOT) {
  await evalJS(`(() => { state.blocks = [{ id:'s1', text:${JSON.stringify(FIX)}, x:80, y:60 }]; render(); openBlockEditor(state.blocks[0].text, null);
    var ta = document.getElementById('blkInput'); ta.value += '\\n\\n\\n'; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh();
    ta.value += '#'; ta.setSelectionRange(ta.value.length, ta.value.length); cmplOnInput(); return 1; })()`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', SHOT);
  const SHOT2 = process.argv[3] || '';
  if (SHOT2) {
    await evalJS(`(() => { state.blocks = [{ id:'s1', text:${JSON.stringify(FIX)}, x:80, y:60 }]; render(); closeBlockEditor(); openCmplCfg();
      var h = document.querySelector('#cmplCfgBody .cmpl-cfg-group');
      window.__dt = new DataTransfer();
      h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
      var rows = document.querySelectorAll('#cmplOrderPop .cmpl-order-row');
      if(rows[2]) rows[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
      return 1; })()`);
    await sleep(400);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT2, Buffer.from(shot2.data, 'base64'));
    console.log('截图:', SHOT2);
  }
}

const pass = R.filter(r => r.pass).length;
console.log('=== v7.8 验收（真机 headless Edge + CDP）：H 组 候选/槽位/复制 + I 组 补全配置 ===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nH+I 组合计 ${pass}/${R.length}`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
