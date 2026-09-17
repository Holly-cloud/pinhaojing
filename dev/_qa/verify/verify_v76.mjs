import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_ARTIFACT = buildTestArtifact().path;   /* A+：测试产物（= 产物 + 1 行访问器），4 套件对它执行；真实产物仅用于体积/P1-A/C/D 断言 */
/* v7.6 验收 · F 组：coding 编辑器（着色/行号/状态栏/配对/错误标红）+ 画布块「放大」入口
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_v76.mjs [截图输出.png]
   真机口径：全部走真实 DOM 事件与真实鼠标点击（Input.dispatchMouseEvent），不做内部函数直调取巧。 */
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';   /* 调试端口：run-gate.mjs 经此环境变量传入，缺省 9222 */
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
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
const TARGET = 'file:///' + encodeURI(TEST_ARTIFACT.replace(/\\/g, '/'));   /* A+：对测试产物执行 */
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });

/* ---------- 准备：一个含各类符号 + 错误逗号的块 ---------- */
const TEXT = '第一行【字幕】与<音效>文本\n第二行，中文逗号与半角,逗号\n第三行{括注}与「引号」\n未闭合演示【到行尾';
const setup = await evalJS(`(() => {
  state.blocks = [{ id:'k1', text:${JSON.stringify(TEXT)}, x:120, y:120 }];
  state.splice = { items: [], activeUnitId: null };
  state.pan = { x:0, y:0 }; state.zoom = 1; render();
  const b = board.querySelector('.block[data-id="k1"]');
  const acts = [...b.querySelectorAll('.drag-handle .op-btn')].map(e => e.dataset.act);
  const z = b.querySelector('[data-act="zoom"]');
  return { acts: acts, hasZoom: !!z, zoomText: z ? z.textContent : null, title: z ? z.title : '',
           order: acts.join(',') };
})()`);
t('F1 画布块拖手列新增「⤢」放大按钮（与「拼」「删」同列）',
  setup.hasZoom && setup.zoomText === '⤢' && /放大/.test(setup.title) && setup.order === 'splice,zoom,del',
  `acts=${setup.order} text=${setup.zoomText} title=${setup.title}`);

/* ---------- 点「放大」→ 打开 coding 编辑器 ---------- */
await click('.block[data-id="k1"] [data-act="zoom"]');
const opened = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  const errEl = document.querySelector('#blkHl .hl-err');
  return {
    maskShown: !document.getElementById('blkMask').classList.contains('hide'),
    sameText: ta.value === ${JSON.stringify(TEXT)},
    lines: document.querySelectorAll('#blkHl .hl-line').length,
    lnNums: [...document.querySelectorAll('#blkHl .hl-line .ln')].map(e => e.textContent).join(','),
    spans: document.querySelectorAll('#blkHl span').length,
    hasBrace: !!document.querySelector('#blkHl .hl-brace'),
    hasLent: !!document.querySelector('#blkHl .hl-lent'),
    hasAngle: !!document.querySelector('#blkHl .hl-angle'),
    hasQuote: !!document.querySelector('#blkHl .hl-quote'),
    errs: document.querySelectorAll('#blkHl .hl-err').length,
    errLineNos: [...document.querySelectorAll('#blkHl .hl-line.has-err .ln')].map(e => e.textContent).join(','),
    errColor: errEl ? getComputedStyle(errEl).color : null,
    errDeco: errEl ? (getComputedStyle(errEl).textDecorationLine + '/' + (getComputedStyle(errEl).textDecorationStyle || '')) : null,
    stErr: document.getElementById('stErr').textContent,
    stLen: document.getElementById('stLen').textContent,
    baseColor: getComputedStyle(document.querySelector('.blk-hl')).color,
    padLeft: getComputedStyle(ta).paddingLeft,
    font: getComputedStyle(ta).fontFamily.slice(0, 30)
  };
})()`);
t('F2 「放大」打开独立编辑器（窗口可见 + 文本一致 + 状态栏/行号就位）',
  opened.maskShown && opened.sameText && opened.lines === 4 && opened.lnNums === '1,2,3,4' && opened.padLeft === '52px' && /mono/i.test(opened.font),
  `lines=${opened.lines} 行号=${opened.lnNums} padding-left=${opened.padLeft} 基线色=${opened.baseColor} font=${opened.font}`);
t('F3 符号族着色落地（花括号/方头括号/尖括号/引号族）',
  opened.hasBrace && opened.hasLent && opened.hasAngle && opened.hasQuote && opened.spans > 5, `spans=${opened.spans}`);
t('F4 逗号错误标红（中文 + 半角：红字 + 波浪下划线 + 行号标红）',
  opened.errs === 2 && opened.errColor === 'rgb(198, 40, 40)' && /wavy/.test(opened.errDeco) && opened.errLineNos === '2',
  `errs=${opened.errs} color=${opened.errColor} deco=${opened.errDeco} 错误行号=${opened.errLineNos}`);
t('F5 状态栏 字符/错误数 与文本一致', Number(opened.stLen) === TEXT.length && opened.stErr === '2',
  `字符=${opened.stLen}/${TEXT.length} 错误=${opened.stErr}`);

/* ---------- 排版一致性（叠层命门） ---------- */
const typo = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  const keys = ['fontFamily','fontSize','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft',
                'borderTopWidth','borderLeftWidth','boxSizing','whiteSpace','overflowWrap','wordBreak','tabSize'];
  const ca = getComputedStyle(ta), cb = getComputedStyle(pre), bad = [];
  for (const k of keys) if (ca[k] !== cb[k]) bad.push(k);
  const a = ta.getBoundingClientRect(), b = pre.getBoundingClientRect();
  return { bad, boxEq: JSON.stringify([a.x,a.y,a.width,a.height]) === JSON.stringify([b.x,b.y,b.width,b.height]) };
})()`);
t('F6 两层排版 15 项等值 + 盒子一致', typo.bad.length === 0 && typo.boxEq, typo.bad.length ? '不一致: ' + typo.bad.join(',') : '全部等值');

/* ---------- 输入即时重渲染 ---------- */
const typing = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  ta.value = '新文本{括号}';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  return { lines: document.querySelectorAll('#blkHl .hl-line').length,
           brace: !!document.querySelector('#blkHl .hl-brace'),
           errs: document.getElementById('stErr').textContent,
           len: document.getElementById('stLen').textContent };
})()`);
t('F7 输入即时重渲染（行号/着色/状态栏同步）',
  typing.lines === 1 && typing.brace && typing.errs === '0' && typing.len === '7', JSON.stringify(typing));

/* ---------- 配对高亮（真实光标位置） ---------- */
const match = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  ta.value = '甲{括号}乙（圆）';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  const i = ta.value.indexOf('{') + 1;
  ta.focus(); ta.setSelectionRange(i, i);
  ta.dispatchEvent(new Event('keyup'));
  const hits = [...document.querySelectorAll('#blkHl .hl-match')].map(e => e.textContent);
  ta.setSelectionRange(0, 0); ta.dispatchEvent(new Event('keyup'));
  const none = document.querySelectorAll('#blkHl .hl-match').length;
  const st = { line: document.getElementById('stLine').textContent, col: document.getElementById('stCol').textContent };
  return { hits, none, st };
})()`);
t('F8 光标处括号配对高亮（且光标位置状态栏正确、文首不误报）',
  match.hits.join('') === '{}' && match.none === 0 && match.st.line === '1' && match.st.col === '1',
  `配对=${match.hits.join('')} 文首误报=${match.none} 光标=${match.st.line}行${match.st.col}列`);

/* ---------- 未闭合至行尾 + 转义安全 ---------- */
const edge = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  ta.value = '开口【未闭合到行尾\\n下一行普通文本';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  const lines = [...document.querySelectorAll('#blkHl .hl-line')];
  const l1 = lines[0].querySelectorAll('.hl-lent').length;
  const l2 = lines[1].querySelectorAll('span:not(.ln)').length;   /* 排除行号 span */
  ta.value = '<b>x</b>';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  const bTags = document.querySelectorAll('#blkHl b').length;
  const html = document.getElementById('blkHl').innerHTML;
  return { l1, l2, bTags, escaped: html.indexOf('&lt;b&gt;') >= 0 };
})()`);
t('F9 未闭合着色至行尾/换行重置 + 尖括号转义安全',
  edge.l1 === 1 && edge.l2 === 0 && edge.bTags === 0 && edge.escaped,
  `第一行 lent 段=${edge.l1} 第二行 span=${edge.l2} b 标签=${edge.bTags}`);

/* ---------- 滚动 / 改高同步 ---------- */
const sync = await evalJS(`(async () => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  ta.value = Array.from({length: 200}, (_, i) => '第' + (i+1) + '行，含错误逗号【字幕】').join('\\n');
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  ta.scrollTop = 400;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const scrolled = { taTop: ta.scrollTop, preTop: pre.scrollTop, ok: ta.scrollTop === pre.scrollTop, scrollable: ta.scrollHeight > ta.clientHeight };
  const keepH = ta.style.height;
  ta.style.height = '320px';
  await new Promise(r => setTimeout(r, 150));
  const resized = { taH: ta.offsetHeight, preH: pre.offsetHeight, ok: ta.offsetHeight === pre.offsetHeight };
  ta.style.height = keepH;
  await new Promise(r => setTimeout(r, 150));
  return { scrolled, resized, errs: document.getElementById('stErr').textContent };
})()`);
t('F10 滚动同步（200 行）+ 改高（resize:vertical）同步',
  sync.scrolled.scrollable && sync.scrolled.ok && sync.scrolled.taTop > 0 && sync.resized.ok,
  `滚动 ${sync.scrolled.taTop}/${sync.scrolled.preTop} 改高 ${sync.resized.taH}/${sync.resized.preH}`);

/* ---------- 「移除空行」后重渲染 ---------- */
const strip = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  ta.value = '甲，\\n\\n\\n乙【字幕】';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  const before = document.querySelectorAll('#blkHl .hl-line').length;
  document.getElementById('blkStrip').click();
  return { before, after: document.querySelectorAll('#blkHl .hl-line').length,
           lines: ta.value.split('\\n').length, errs: document.getElementById('stErr').textContent };
})()`);
t('F11「移除空行」后行号/着色/状态栏同步刷新',
  strip.before === 4 && strip.after === 2 && strip.lines === 2 && strip.errs === '1',
  `行号 ${strip.before}→${strip.after}，文本 ${strip.lines} 行，错误 ${strip.errs}`);

/* ---------- 写回：确定 → 画布块 + 拼接栏 + 不 trim ---------- */
const write = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  state.splice.items = [{ type:'block', id:'k1' }]; renderSplice();
  ta.value = '  改后的文本【字幕】，尾随空格保留  ';
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  document.getElementById('blkOk').click();
  const card = board.querySelector('.block[data-id="k1"]');
  const spEl = document.querySelector('.sp-item[data-id="k1"] .sp-text');
  return {
    maskHidden: document.getElementById('blkMask').classList.contains('hide'),
    stateText: state.blocks[0].text,
    taText: card.querySelector('.block-text').value,
    spText: spEl ? spEl.textContent : null,
    keptSpaces: state.blocks[0].text === '  改后的文本【字幕】，尾随空格保留  ',
    widthChanged: /px/.test(card.style.width)
  };
})()`);
t('F12 确定写回：画布块文本 + 拼接栏条目同步 + 不 trim（首尾空格保留）',
  write.maskHidden && write.keptSpaces && write.spText === write.stateText && write.widthChanged,
  `state=${JSON.stringify(write.stateText)} 拼接栏=${JSON.stringify(write.spText)} 空格保留=${write.keptSpaces}`);
t('F13 写回后画布块文本与 state 一致', write.taText === write.stateText, JSON.stringify(write.taText));

/* ---------- 单块语义（多选态下点放大不批量） ---------- */
const single = await evalJS(`(() => {
  state.blocks = [{ id:'k1', text:'AAA', x:120, y:120 }, { id:'k2', text:'BBB', x:420, y:120 }];
  render();
  selected.length = 0; selected.push('k1', 'k2'); render();
  return { sel: selected.length };
})()`);
await click('.block[data-id="k1"] [data-act="zoom"]');
const single2 = await evalJS(`(() => {
  const v = document.getElementById('blkInput').value;
  document.getElementById('blkOk').click();
  return { openedWith: v, k2: state.blocks[1].text, k1: state.blocks[0].text };
})()`);
t('F14 多选态下「放大」仍为单块语义（只打开该块、不影响其他块）',
  single.sel === 2 && single2.openedWith === 'AAA' && single2.k2 === 'BBB',
  `选中=${single.sel} 打开内容=${single2.openedWith} 其他块=${single2.k2}`);

/* ---------- 图片块无「放大」（仅文本块） ---------- */
const imgCase = await evalJS(`(() => {
  state.blocks = [{ id:'i1', type:'image', img:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', iw:80, ih:60, x:600, y:300 }];
  render();
  const all = [...board.querySelectorAll('.block')];
  const b = board.querySelector('.block[data-id="i1"]');
  return { zoom: b ? b.querySelectorAll('[data-act="zoom"]').length : -1,
           kind: b ? b.className : 'NOT_FOUND',
           handle: b ? b.querySelectorAll('.drag-handle').length : -1,
           cards: all.map(c => c.dataset.id + ':' + c.className).join(' | '),
           hasImg: !!(b && b.querySelector('img')) };
})()`);
t('F15 图片块不受影响（无放大按钮，仍为纯图片块）',
  imgCase.zoom === 0 && /block-img/.test(imgCase.kind) && imgCase.handle === 0,
  `zoom 数=${imgCase.zoom} class=${imgCase.kind} 拖手数=${imgCase.handle} 卡片=${imgCase.cards}`);

/* ---------- 「拼」按钮语义未受影响（回归探针） ---------- */
const still = await evalJS(`(() => {
  state.blocks = [{ id:'k1', text:'回归探针', x:100, y:100 }];
  state.splice = { items: [], activeUnitId: null }; render(); renderSplice();
  const b = board.querySelector('.block[data-id="k1"]');
  return { acts: [...b.querySelectorAll('.op-btn')].map(e => e.dataset.act).join(','), spliceColor: getComputedStyle(b.querySelector('[data-act="splice"]')).color };
})()`);
t('F16 既有块按钮语义不变（拼/复制等入口仍在，拼仍为红色主操作）',
  still.acts === 'splice,zoom,del' && /rgb\(214, 69, 69\)/.test(still.spliceColor), `acts=${still.acts} 拼色=${still.spliceColor}`);

/* ---------- 行号栏几何（落点 + 与行对齐） ---------- */
const gutter = await evalJS(`(() => {
  openBlockEditor('甲【一】\\n乙（二）\\n丙{三}', null);
  const lines = [...document.querySelectorAll('#blkHl .hl-line')];
  const ta = document.getElementById('blkInput');
  const taBox = ta.getBoundingClientRect();
  const textLeft = taBox.left + parseFloat(getComputedStyle(ta).paddingLeft);
  const info = lines.map((l, i) => {
    const r = l.querySelector('.ln').getBoundingClientRect();
    const lr = l.getBoundingClientRect();
    return { no: l.querySelector('.ln').textContent, right: +r.right.toFixed(1), lineTop: +lr.top.toFixed(1) };
  });
  return { n: lines.length, textLeft: +textLeft.toFixed(1), nums: info.map(i => i.no).join(','),
           allRight: info.every(i => i.right < textLeft - 4), topsAsc: info.every((i, k) => k === 0 || i.lineTop > info[k-1].lineTop) };
})()`);
t('F17 行号栏几何：序号连续、右缘在文本左缘左侧、行号行序递增（不占文本流）',
  gutter.n === 3 && gutter.nums === '1,2,3' && gutter.allRight && gutter.topsAsc,
  `行数=${gutter.n} 序号=${gutter.nums} 文本左缘=${gutter.textLeft} 行号均在左侧=${gutter.allRight}`);

/* ---------- F18 打开编辑器不再全选（v7.6.1 修复）+ 彩色层跟随 ---------- */
const openSel = await evalJS(`(() => {
  const t = Array.from({length: 60}, (_, i) => '第' + (i + 1) + '行【字幕】').join('\\n');
  openBlockEditor(t, null);
  const ta = document.getElementById('blkInput');
  return { len: ta.value.length, selStart: ta.selectionStart, selEnd: ta.selectionEnd, scrolled: ta.scrollTop };
})()`);
await sleep(120);
await send('Input.insertText', { text: '尾巴' });      /* 真实键盘输入（若仍全选，整段会被替换成「尾巴」） */
await sleep(120);
const openSel2 = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  return { len: ta.value.length, tail: ta.value.slice(-2), selLen: ta.selectionEnd - ta.selectionStart,
           taTop: ta.scrollTop, preTop: pre.scrollTop, synced: Math.abs(ta.scrollTop - pre.scrollTop) <= 1 };
})()`);
t('F18 打开编辑器不再全选（光标落文末、打字为追加；彩色层跟随滚动）',
  openSel.selStart === openSel.len && openSel.selEnd === openSel.len
  && openSel2.len === openSel.len + 2 && openSel2.tail === '尾巴' && openSel2.selLen === 0
  && openSel2.taTop > 0 && openSel2.synced,
  `开窗光标=${openSel.selStart}/${openSel.len}（无选区）；打字后长度 ${openSel.len}→${openSel2.len}、尾部「${openSel2.tail}」、滚动 ${openSel2.taTop}/${openSel2.preTop}`);

/* ---------- 截图 + 像素级对齐举证（与 06 小样同一判据） ---------- */
const SHOT = process.argv[2] || '';
if (SHOT) {
  await evalJS(`(() => {
    state.blocks = [{ id:'k1', text:${JSON.stringify(TEXT)}, x:140, y:140 }];
    state.splice = { items: [], activeUnitId: null }; state.pan = { x:0, y:0 }; state.zoom = 1; render();
    openBlockEditor(state.blocks[0].text, null);
    return 1;
  })()`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  /* 裁到正文区：剔除左侧行号留白与自身边框（边框/滚动条像素会造成误判） */
  const clip = await evalJS(`(() => { const r = document.querySelector('.blk-edit').getBoundingClientRect();
    return { x: r.x + 46, y: r.y + 2, width: r.width - 50, height: 396, scale: 1 }; })()`);
  /* v7.7 取证加固：截图前把编辑层 caret 设为透明 —— 否则 1px 插字符会残留在「彩色层」截图里
     （插字符位于文末、颜色 var(--text)），把该行墨迹右缘拉出几十像素；且光标闪烁使结果随机，
     会造成 diag_hl_align 的「右缘偏差」假失败（2026-09-13 A/B 复现确认，与产品改动无关）。 */
  await evalJS(`(() => { const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
    pre.style.visibility = 'hidden'; ta.style.color = '#1d1d1f'; ta.style.webkitTextFillColor = '#1d1d1f';
    ta.style.caretColor = 'transparent'; return 1; })()`);
  await sleep(200);
  let s2 = await send('Page.captureScreenshot', { format: 'png', clip });
  fs.writeFileSync(SHOT.replace(/\.png$/, '_ta.png'), Buffer.from(s2.data, 'base64'));
  await evalJS(`(() => { const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
    pre.style.visibility = ''; ta.style.color = ''; ta.style.webkitTextFillColor = ''; return 1; })()`);
  await sleep(200);
  s2 = await send('Page.captureScreenshot', { format: 'png', clip });
  fs.writeFileSync(SHOT.replace(/\.png$/, '_pre.png'), Buffer.from(s2.data, 'base64'));
  await evalJS(`(() => { document.getElementById('blkInput').style.caretColor = ''; return 1; })()`);
  console.log('截图:', SHOT, '｜ 对齐举证图: *_ta.png / *_pre.png');
}

const pass = R.filter(r => r.pass).length;
console.log('=== v7.6 F 组验收（真机 headless Edge + CDP）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nF 组合计 ${pass}/${R.length}`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
