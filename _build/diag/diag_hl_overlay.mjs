import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* v7.6 coding 编辑器小样 v2 验收（可复跑）：着色 / 错误标记 / 行号 / 状态栏 / 配对 / 对齐 / 同步
   用法：先起 headless Edge（--remote-debugging-port=9224），再 node diag_hl_overlay.mjs <截图输出路径> */
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9224;
const SHOT = process.argv[2] || '';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
const TARGET = pathToFileURL(path.resolve(HERE, '../../06_高亮小样_2026-09-13.html')).href;  /* P5 归位：本脚本验收对象是小样页，不是产品 */
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1700, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 30; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });
const keep = `const ta=document.getElementById('blkInput'); const keepVal=ta.value, keepPos=ta.selectionStart;`;

/* A. 结构 */
const box = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  const a = ta.getBoundingClientRect(), b = pre.getBoundingClientRect();
  return { ta:[a.x,a.y,a.width,a.height].map(n=>+n.toFixed(2)), pre:[b.x,b.y,b.width,b.height].map(n=>+n.toFixed(2)),
           off:[ta.offsetWidth,ta.offsetHeight,pre.offsetWidth,pre.offsetHeight],
           spans: document.querySelectorAll('#blkHl span').length, lines: document.querySelectorAll('#blkHl .hl-line').length,
           baseColor: getComputedStyle(pre).color };
})()`);
t('A1 彩色层存在（span / 逻辑行）', box.spans > 10 && box.lines > 3, `spans=${box.spans} lines=${box.lines}`);
t('A2 两层盒子一致（位置/尺寸）', JSON.stringify(box.ta) === JSON.stringify(box.pre) && box.off[0] === box.off[2] && box.off[1] === box.off[3],
  `ta=${JSON.stringify(box.ta)} pre=${JSON.stringify(box.pre)}`);
t('A3 叙述基线色 = #2f3640', box.baseColor === 'rgb(47, 54, 64)', box.baseColor);

/* B. 排版逐项一致（含 coding 化的等宽字体 + 行号留白） */
const typo = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  const keys = ['fontFamily','fontSize','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft',
                'borderTopWidth','borderLeftWidth','boxSizing','whiteSpace','overflowWrap','wordBreak','tabSize'];
  const ca = getComputedStyle(ta), cb = getComputedStyle(pre), bad = [];
  for (const k of keys) if (ca[k] !== cb[k]) bad.push(k + ': ' + ca[k] + ' ≠ ' + cb[k]);
  return { bad, font: ca.fontFamily.slice(0, 40), padL: ca.paddingLeft, size: ca.fontSize };
})()`);
t('B1 两层排版逐项一致（15 项）', typo.bad.length === 0, typo.bad.length ? typo.bad.join(' | ') : `font=${typo.font}… padding-left=${typo.padL} font-size=${typo.size}`);

/* C. 符号族分类（逐字符） */
const cls = await evalJS(`(() => {
  const T = '甲{台词}乙<音效>丙（音乐）丁【字幕】戊「引用」己《书名》庚[括注]辛，壬';
  const f = window.__HL.classify(T);
  const seg = s => { const i = T.indexOf(s); return i < 0 ? 'NOT_FOUND' : f.slice(i, i + s.length).join('|'); };
  return { brace: seg('{台词}'), angle: seg('<音效>'), paren: seg('（音乐）'), lent: seg('【字幕】'),
           quote: seg('「引用」'), title: seg('《书名》'), square: seg('[括注]'),
           err: f[T.indexOf('，')], tail: f[T.length - 1], head: f[0] };
})()`);
const okC = ['brace','angle','paren','lent','quote','title','square'].every(k => cls[k] === new Array(4).fill(k).join('|'))
  && cls.err === 'err' && cls.tail === 'body' && cls.head === 'body';
t('C1 七族分类 + 错误符号 + 正文（逐字符）', okC, JSON.stringify(cls));
const half = await evalJS(`(() => { const T = 'a,b'; const f = window.__HL.classify(T); return { comma: f[1], letter: f[0] }; })()`);
t('C1b 错误符号：中文逗号 + 半角逗号均优先于句读（且不参与配对）',
  cls.err === 'err' && half.comma === 'err' && half.letter === 'body', `中文=${cls.err} 半角=${half.comma}`);

/* D. 嵌套取内层 + 区域内句读随族色 */
const nest = await evalJS(`(() => {
  const T = '【序幕：她低声说{别回头}】', f = window.__HL.classify(T);
  const at = ch => f[T.indexOf(ch)];
  return { open: at('【'), colon: at('：'), inner: at('{'), innerText: f[T.indexOf('别')], close: f[T.length-1] };
})()`);
t('D1 嵌套内层覆盖外层；区域内句读随族色',
  nest.open === 'lent' && nest.colon === 'lent' && nest.inner === 'brace' && nest.innerText === 'brace' && nest.close === 'lent',
  JSON.stringify(nest));

/* E. 未闭合 → 至行尾，换行重置 */
const unc = await evalJS(`(() => {
  const T = '开口【未闭合到行尾\\n下一行甲', f = window.__HL.classify(T);
  return { open: f[T.indexOf('【')], tail: f[T.indexOf('尾')], nextLine: f[T.indexOf('下')] };
})()`);
t('E1 未闭合开符号着至行尾且换行重置', unc.open === 'lent' && unc.tail === 'lent' && unc.nextLine === 'body', JSON.stringify(unc));

/* F. 直引号交替开闭 */
const q = await evalJS(`(() => {
  const T = '他说"你好"吧', f = window.__HL.classify(T);
  const i = T.indexOf('"');
  return { q1: f[i], inner: f[i+1], q2: f[T.lastIndexOf('"')], tail: f[T.length-1] };
})()`);
t('F1 直引号成对（toggle）', q.q1 === 'quote' && q.inner === 'quote' && q.q2 === 'quote' && q.tail === 'body', JSON.stringify(q));

/* G. 转义安全 */
const esc = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'); const keepVal = ta.value;
  ta.value = '<b>x</b>'; ta.dispatchEvent(new Event('input', {bubbles:true}));
  const out = { bTags: document.querySelectorAll('#blkHl b').length, html: document.getElementById('blkHl').innerHTML.slice(0, 80) };
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true}));
  return out;
})()`);
t('G1 HTML 转义安全', esc.bTags === 0 && esc.html.indexOf('&lt;b&gt;') >= 0, `b 标签=${esc.bTags} html=${esc.html.slice(0,50)}`);

/* H. 滚动同步 */
const sc = await evalJS(`(async () => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  const keepVal = ta.value;
  ta.value = Array.from({length: 200}, (_, i) => '第' + (i+1) + '行【字幕】内容与，错误').join('\\n');
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  ta.scrollTop = 320;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = { taTop: ta.scrollTop, preTop: pre.scrollTop, synced: ta.scrollTop === pre.scrollTop, scrollable: ta.scrollHeight > ta.clientHeight };
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true})); ta.scrollTop = 0;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return out;
})()`);
t('H1 滚动同步（200 行文本）', sc.scrollable && sc.taTop > 0 && sc.synced, JSON.stringify(sc));

/* I. resize:vertical 改高同步 */
const rs = await evalJS(`(async () => {
  const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  const keepH = ta.style.height; ta.style.height = '300px';
  await new Promise(r => setTimeout(r, 120));
  const out = { taH: ta.offsetHeight, preH: pre.offsetHeight, ok: ta.offsetHeight === pre.offsetHeight };
  ta.style.height = keepH; await new Promise(r => setTimeout(r, 120));
  return out;
})()`);
t('I1 改高（resize:vertical）后彩色层跟随', rs.ok, JSON.stringify(rs));

/* J. 选中态可读 */
const sel = await evalJS(`(() => {
  let ok = false, hit = '';
  for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) {
    if (r.selectorText && /::selection/.test(r.selectorText) && /blk-input/.test(r.selectorText)) {
      hit = r.style.cssText || ''; ok = /-webkit-text-fill-color/.test(hit);
    } } } catch(e){} }
  return { ok, hit: hit.slice(0, 120) };
})()`);
t('J1 选中文字可读规则齐全', sel.ok, sel.hit);

/* K. 九族色落地且互不相同 */
const colors = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'); const keepVal = ta.value;
  ta.value = '{a}（b）<c>【d】「e」《f》[g]，h。'; ta.dispatchEvent(new Event('input', {bubbles:true}));
  const out = {};
  for (const c of ['brace','paren','angle','lent','quote','title','square','punct','err']) {
    const el = document.querySelector('#blkHl .hl-' + c);
    out[c] = el ? getComputedStyle(el).color : null;
  }
  out.body = getComputedStyle(document.querySelector('.blk-hl')).color;
  out.uniq = new Set(Object.values(out).filter(v => v && /rgb/.test(v))).size;
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true}));
  return out;
})()`);
t('K1 九族 + 正文色全部落地且互不相同', Object.values(colors).every(v => v && (/rgb/.test(v) || typeof v === 'number')) && colors.uniq >= 9,
  `unique=${colors.uniq} err=${colors.err}`);

/* M1. 行号栏 */
const gut = await evalJS(`(() => {
  const lines = [...document.querySelectorAll('#blkHl .hl-line')];
  const nums = lines.map(l => l.querySelector('.ln').textContent);
  const expect = lines.map((_, i) => String(i + 1));
  const pos = lines.map(l => { const r = l.querySelector('.ln').getBoundingClientRect(); const lr = l.getBoundingClientRect(); return [Math.round(r.right - lr.left), Math.round(r.top - lr.top)]; });
  const ta = document.getElementById('blkInput');
  return { n: lines.length, ok: JSON.stringify(nums) === JSON.stringify(expect), padL: getComputedStyle(ta).paddingLeft, firstPos: pos[0], secondPos: pos[1] };
})()`);
t('M1 行号栏连续且位于文本左侧留白内', gut.ok && gut.n > 5 && gut.padL === '52px' && gut.firstPos[0] < 0,
  `行数=${gut.n} padding-left=${gut.padL} 行号相对行右缘=${gut.firstPos[0]}px`);

/* M2. 错误标记（中文逗号 → 红 + 波浪线 + 行号标红 + 不破坏族色） */
const errMark = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'); const keepVal = ta.value, keepPos = ta.selectionStart;
  ta.value = '一行正常文本。\\n{括号里有，错误逗号}与半角,逗号'; ta.dispatchEvent(new Event('input', {bubbles:true}));
  const err = document.querySelector('#blkHl .hl-err');
  const lineEls = [...document.querySelectorAll('#blkHl .hl-line')];
  const errLine = lineEls.find(l => l.classList.contains('has-err'));
  const normalLine = lineEls.find(l => !l.classList.contains('has-err'));
  const out = {
    errCount: document.querySelectorAll('#blkHl .hl-err').length,
    errTexts: [...document.querySelectorAll('#blkHl .hl-err')].map(e => e.textContent),
    text: err ? err.textContent : null,
    color: err ? getComputedStyle(err).color : null,
    deco: err ? (getComputedStyle(err).textDecorationLine + ' ' + (getComputedStyle(err).textDecorationStyle || '')) : null,
    errLineNo: errLine ? errLine.querySelector('.ln').textContent : null,
    errLnColor: errLine ? getComputedStyle(errLine.querySelector('.ln')).color : null,
    normalLnColor: normalLine ? getComputedStyle(normalLine.querySelector('.ln')).color : null,
    braceInErrLine: [...document.querySelectorAll('#blkHl .hl-brace')].map(e => e.textContent).join('')
  };
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true})); ta.setSelectionRange(keepPos, keepPos);
  return out;
})()`);
t('M2 逗号标红（中/半角：红字+波浪线+行号标红，且不破坏同族色）',
  errMark.errCount === 2 && errMark.errTexts.join('') === '，,' && errMark.color === 'rgb(198, 40, 40)' && /wavy/.test(errMark.deco)
  && errMark.errLineNo === '2' && errMark.errLnColor === 'rgb(198, 40, 40)' && errMark.normalLnColor !== 'rgb(198, 40, 40)'
  && errMark.braceInErrLine === '{括号里有错误逗号}',
  JSON.stringify(errMark));

/* M3. 状态栏数值 */
const st = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'); const keepVal = ta.value, keepPos = ta.selectionStart;
  ta.value = '第一行。\\n第二行，有，两处。\\n第三行'; ta.dispatchEvent(new Event('input', {bubbles:true}));
  const p = ta.value.indexOf('三');           /* 第 3 行第 1 列 */
  ta.setSelectionRange(p, p); ta.dispatchEvent(new Event('select'));
  const a = { line: document.getElementById('stLine').textContent, col: document.getElementById('stCol').textContent,
              len: document.getElementById('stLen').textContent, err: document.getElementById('stErr').textContent };
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true})); ta.setSelectionRange(keepPos, keepPos);
  return a;
})()`);
t('M3 状态栏 行/列/字符/错误数 正确', st.line === '3' && st.col === '2' && st.err === '2' && Number(st.len) > 10, JSON.stringify(st));

/* M4. 括号配对高亮 */
const mt = await evalJS(`(() => {
  const ta = document.getElementById('blkInput'); const keepVal = ta.value, keepPos = ta.selectionStart;
  ta.value = '甲{台词}乙（音乐）'; ta.dispatchEvent(new Event('input', {bubbles:true}));
  const i = ta.value.indexOf('{') + 1;        /* 光标贴左括号 */
  ta.setSelectionRange(i, i); ta.dispatchEvent(new Event('keyup'));
  const hits = [...document.querySelectorAll('#blkHl .hl-match')].map(e => ({ ch: e.textContent, cls: e.className, bg: getComputedStyle(e).backgroundColor }));
  const none = (() => { ta.setSelectionRange(0, 0); ta.dispatchEvent(new Event('keyup')); return document.querySelectorAll('#blkHl .hl-match').length; })();
  ta.value = keepVal; ta.dispatchEvent(new Event('input', {bubbles:true})); ta.setSelectionRange(keepPos, keepPos);
  return { hits, noneAtStart: none };
})()`);
t('M4 光标处括号配对高亮（含不误报）',
  mt.hits.length === 2 && mt.hits[0].ch === '{' && mt.hits[1].ch === '}' && mt.noneAtStart === 0,
  JSON.stringify(mt));

/* L. 版式 */
const lay = await evalJS(`(() => {
  const mask = document.querySelector('.modal-mask'), win = document.querySelector('.blk-win'), lg = document.querySelector('.legend');
  const w = win.getBoundingClientRect(), l = lg.getBoundingClientRect();
  return { noOverlap: l.top >= w.bottom - 0.5, maskScrollable: getComputedStyle(mask).overflowY,
           winBottom: +w.bottom.toFixed(1), legendTop: +l.top.toFixed(1), overflowPx: mask.scrollHeight - mask.clientHeight, vh: innerHeight };
})()`);
t('L1 图例不与窗口重叠且矮屏可滚', lay.noOverlap && lay.maskScrollable === 'auto', JSON.stringify(lay));

if (SHOT) { const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64')); console.log('截图:', SHOT);

  /* 对齐举证：分别「只渲染编辑层文字」与「只渲染彩色层文字」 */
  /* 裁到正文区：剔除左侧行号留白（行号只存在于彩色层，纳入比对会误报） */
  const clip = await evalJS(`(() => { const r = document.querySelector('.blk-edit').getBoundingClientRect();
    return { x: r.x + 44, y: r.y, width: r.width - 44, height: 400, scale: 1 }; })()`);
  await evalJS(`(() => { const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
    pre.style.visibility = 'hidden'; ta.style.color = '#1d1d1f'; ta.style.webkitTextFillColor = '#1d1d1f'; return 1; })()`);
  await sleep(150);
  let s2 = await send('Page.captureScreenshot', { format: 'png', clip });
  fs.writeFileSync(SHOT.replace(/\.png$/, '_ta.png'), Buffer.from(s2.data, 'base64'));
  await evalJS(`(() => { const ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
    pre.style.visibility = ''; ta.style.color = ''; ta.style.webkitTextFillColor = ''; return 1; })()`);
  await sleep(150);
  s2 = await send('Page.captureScreenshot', { format: 'png', clip });
  fs.writeFileSync(SHOT.replace(/\.png$/, '_pre.png'), Buffer.from(s2.data, 'base64'));
  console.log('对齐举证图:', SHOT.replace(/\.png$/, '_ta.png'), '/', SHOT.replace(/\.png$/, '_pre.png'));
}

const pass = R.filter(r => r.pass).length;
console.log('\n=== v7.6 coding 编辑器小样 v2 验收 ===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\n合计 ${pass}/${R.length}`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
