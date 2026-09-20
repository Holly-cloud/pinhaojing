import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_ARTIFACT = buildTestArtifact().path;   /* A+：测试产物（= 产物 + 1 行访问器），各在用套件对它执行；真实产物仅用于体积/P1-A/C/D 断言 */
/* v7.7 验收 · G 组：文本编辑器「台词区」豁免（一行内成对中文双引号“ ”内的错误符号无视）
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_v77.mjs [截图输出.png]
   真机口径：交互走真实鼠标点击 / 真实键盘输入（Input.dispatch*），不做仅内部函数直调取巧。
   拍板口径（2026-09-13，5 问）：边界＝仅中文双引号“ ”｜未闭合不算台词区｜完全无视（族色+不计状态栏+行号不标红）｜嵌套里层也豁免 */
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
const TARGET = pathToFileURL(TEST_ARTIFACT).href;   /* A+：对测试产物执行 */
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);
/* v7.15：默认视图已从「画布」改为「写作」——本套件针对画布，进断言前先切回 canvas（幂等）。 */
await evalJS("if (typeof setView === 'function') setView('canvas');");
await sleep(300);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });

/* ---------- 准备：含台词区 / 半角对照 / 嵌套 / 未闭合 / 引号外对照 ---------- */
const L1 = '红衣女子说：“这一剑，我等了很久”然后拔剑。';            /* 台词区内 1 个逗号 → 豁免；行内无其它逗号 → 该行无错 */
const L2 = '他说"hi, there"，半角引号不算台词区。';                 /* 半角引号内的 , + 引号外的 ，→ 2 处错误 */
const L3 = '“外{内，层}层，尾”';                                  /* 里层（brace 族）+ 外层尾（quote 族）各 1 个逗号 → 均豁免 */
const L4 = '未闭合：“这一行没有闭合，照旧标红';                     /* 未闭合 → 1 处错误（照旧标红） */
const L5 = '普通叙述，外面逗号照旧标红。';                          /* 引号外 → 1 处错误 */
const TEXT = [L1, L2, L3, L4, L5].join('\n');
const TOTAL_ERR = 4;

const setup = await evalJS(`(() => {
  state.blocks = [{ id:'k1', text:${JSON.stringify(TEXT)}, x:120, y:120 }];
  state.splice = { items: [], activeUnitId: null };
  state.pan = { x:0, y:0 }; state.zoom = 1; render();
  return { ok: !!board.querySelector('.block[data-id="k1"]') };
})()`);
await click('.block[data-id="k1"] [data-act="zoom"]');

const G = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  const lines = [...document.querySelectorAll('#blkHl .hl-line')];
  const errOf = li => lines[li] ? lines[li].querySelectorAll('.hl-err').length : -1;
  /* L3：里层逗号与外层尾逗号各自所属 span 的族类 */
  const famText = li => ({
    brace: [...(lines[li] ? lines[li].querySelectorAll('.hl-brace') : [])].map(e => e.textContent).join(''),
    quote: [...(lines[li] ? lines[li].querySelectorAll('.hl-quote') : [])].map(e => e.textContent).join(''),
    err: [...(lines[li] ? lines[li].querySelectorAll('.hl-err') : [])].map(e => e.textContent).join('')
  });
  const l3 = famText(2);
  const taSpan = document.getElementById('blkHl').innerHTML;
  return {
    maskShown: !document.getElementById('blkMask').classList.contains('hide'),
    sameText: ta.value === ${JSON.stringify(TEXT)},
    lineCount: lines.length,
    lnNums: lines.map(l => l.querySelector('.ln').textContent).join(','),
    errPerLine: lines.map((_, i) => errOf(i)),
    errSpans: document.querySelectorAll('#blkHl .hl-err').length,
    errLineNos: [...document.querySelectorAll('#blkHl .hl-line.has-err .ln')].map(e => e.textContent).join(','),
    stErr: document.getElementById('stErr').textContent,
    stLen: document.getElementById('stLen').textContent,
    errColor: (() => { const e = document.querySelector('#blkHl .hl-err'); return e ? getComputedStyle(e).color : null; })(),
    errDeco: (() => { const e = document.querySelector('#blkHl .hl-err'); return e ? getComputedStyle(e).textDecorationStyle : null; })(),
    l1QuoteSpan: (() => { const s = lines[0] ? [...lines[0].querySelectorAll('.hl-quote')].map(e => e.textContent).join('') : ''; return s; })(),
    l1QuoteColor: (() => { const s = lines[0] ? [...lines[0].querySelectorAll('.hl-quote')].find(e => e.textContent.indexOf('，') >= 0) : null;
                           return s ? getComputedStyle(s).color : null; })(),
    l1BodySpans: lines[0] ? lines[0].querySelectorAll('span:not(.ln)').length : -1,
    l3, html: taSpan.length
  };
})()`);
t('G1 「放大」打开 coding 编辑器：文本一致、5 行行号就位', 
  G.maskShown && G.sameText && G.lineCount === 5 && G.lnNums === '1,2,3,4,5',
  `行数=${G.lineCount} 行号=${G.lnNums} 文本一致=${G.sameText}`);
t('G2 台词区豁免：台词区内的逗号不再标红（第 1 行 0 处错误）',
  G.errPerLine[0] === 0,
  `逐行错误数=${G.errPerLine.join(',')}`);
t('G3 豁免的逗号随层级族色正常显示（引号族色 rgb(11,100,184)，非红字/无波浪线）',
  /“这一剑，我等了很久”/.test(G.l1QuoteSpan) && G.l1QuoteColor === 'rgb(11, 100, 184)',
  `第 1 行引号族段=${G.l1QuoteSpan} 色=${G.l1QuoteColor} 该行 span 数=${G.l1BodySpans}`);
t('G4 错误总数与着色同源：状态栏 4 处 = DOM 标红 span 4 个',
  G.stErr === String(TOTAL_ERR) && G.errSpans === TOTAL_ERR,
  `状态栏=${G.stErr} span=${G.errSpans}`);
t('G5 行号标红只落在真有错误的行（2 / 4 / 5 行；台词区行不标红）',
  G.errLineNos === '2,4,5',
  `标红行号=${G.errLineNos}`);
t('G6 半角双引号不算台词区（"hi, there" 内的 , 照旧标红）',
  G.errPerLine[1] === 2, `第 2 行错误数=${G.errPerLine[1]}`);
t('G7 引号内嵌套成对符号时里层也豁免（且各自随所在层级族色：brace / quote）',
  G.errPerLine[2] === 0 && G.l3.brace.indexOf('，') >= 0 && G.l3.quote.indexOf('，') >= 0 && G.l3.err === '',
  `第 3 行 花括号族段=${JSON.stringify(G.l3.brace)} 引号族段=${JSON.stringify(G.l3.quote)} 错误段=${JSON.stringify(G.l3.err)}`);
t('G8 未闭合的中文双引号不算台词区（照旧标红，宁缺勿滥）',
  G.errPerLine[3] === 1, `第 4 行错误数=${G.errPerLine[3]}`);
t('G9 双引号外的错误符号不受影响（仍红字 + 波浪线）',
  G.errPerLine[4] === 1 && G.errColor === 'rgb(198, 40, 40)' && /wavy/.test(G.errDeco || ''),
  `第 5 行错误数=${G.errPerLine[4]} color=${G.errColor} deco=${G.errDeco}`);

/* ---------- 真实键盘路径：清空后逐字输入整段文本，断言结果一致 ---------- */
await evalJS(`(() => { const ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(0, ta.value.length); return 1; })()`);
await send('Input.insertText', { text: '清空占位' });
await evalJS(`(() => { const ta = document.getElementById('blkInput'); ta.setSelectionRange(0, ta.value.length); return 1; })()`);
await send('Input.insertText', { text: TEXT });
await sleep(200);
const typed = await evalJS(`(() => ({
  same: document.getElementById('blkInput').value === ${JSON.stringify(TEXT)},
  errSpans: document.querySelectorAll('#blkHl .hl-err').length,
  stErr: document.getElementById('stErr').textContent,
  errLineNos: [...document.querySelectorAll('#blkHl .hl-line.has-err .ln')].map(e => e.textContent).join(',')
}))()`);
t('G10 真实键盘输入整段文本后行为一致（不是只有注入 .value 才生效）',
  typed.same && typed.errSpans === TOTAL_ERR && typed.stErr === String(TOTAL_ERR) && typed.errLineNos === '2,4,5',
  `一致=${typed.same} span=${typed.errSpans} 状态栏=${typed.stErr} 标红行=${typed.errLineNos}`);

/* ---------- 真实 Backspace 删掉闭合引号 → 台词区立即失效 ---------- */
const caret = await evalJS(`(() => { const ta = document.getElementById('blkInput');
  const i = ta.value.indexOf('”'); ta.focus(); ta.setSelectionRange(i + 1, i + 1);
  return { i, qBefore: (ta.value.match(/”/g) || []).length }; })()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' });
await sleep(220);
const afterDel = await evalJS(`(() => ({
  qAfter: (document.getElementById('blkInput').value.match(/”/g) || []).length,
  l1Err: document.querySelectorAll('#blkHl .hl-line')[0].querySelectorAll('.hl-err').length,
  stErr: document.getElementById('stErr').textContent
}))()`);
t('G11 删掉闭合引号（真实 Backspace）→ 未闭合即失豁免，该逗号立刻回到标红',
  caret.i >= 0 && afterDel.qAfter === caret.qBefore - 1 && afterDel.l1Err === 1 && afterDel.stErr === String(TOTAL_ERR + 1),
  `删引号位置=${caret.i} 闭引号数 ${caret.qBefore}→${afterDel.qAfter} 第 1 行错误数=${afterDel.l1Err} 状态栏=${afterDel.stErr}`);

/* ---------- 括号配对 / 「移除空行」不受影响 ---------- */
const rest = await evalJS(`(() => {
  const ta = document.getElementById('blkInput');
  ta.value = ${JSON.stringify(L3 + '\n\n' + L2)};
  ta.dispatchEvent(new Event('input', {bubbles:true}));
  const i = ta.value.indexOf('{') + 1;
  ta.focus(); ta.setSelectionRange(i, i); ta.dispatchEvent(new Event('keyup'));
  const hits = [...document.querySelectorAll('#blkHl .hl-match')].map(e => e.textContent).join('');
  const c = ta.value.indexOf('，') + 1;                       /* 逗号之后（左右都不是括号）→ 不应有配对高亮 */
  ta.setSelectionRange(c, c); ta.dispatchEvent(new Event('keyup'));
  const none = document.querySelectorAll('#blkHl .hl-match').length;
  const before = document.querySelectorAll('#blkHl .hl-line').length;
  document.getElementById('blkStrip').click();
  return { hits, none, before, after: document.querySelectorAll('#blkHl .hl-line').length,
           lines: ta.value.split('\\n').length, stErr: document.getElementById('stErr').textContent,
           l1Err: document.querySelectorAll('#blkHl .hl-line')[0].querySelectorAll('.hl-err').length };
})()`);
t('G12 括号配对高亮不受影响（台词区内的 {} 仍能配对；非括号处不误报）',
  rest.hits === '{}' && rest.none === 0, `配对=${rest.hits} 非括号处误报=${rest.none}`);
t('G13「移除空行」后按同一口径重算（去掉空行 → 2 行、错误数 = 2）',
  rest.before === 3 && rest.after === 2 && rest.lines === 2 && rest.stErr === '2' && rest.l1Err === 0,
  `行号 ${rest.before}→${rest.after}，文本 ${rest.lines} 行，错误=${rest.stErr}，首行错误=${rest.l1Err}`);

/* ---------- 回归：打开不全选 / 画布内联编辑无着色层 / 大文本性能 ---------- */
const reg = await evalJS(`(() => {
  openBlockEditor(${JSON.stringify(TEXT)}, null);
  const ta = document.getElementById('blkInput');
  const sel = { start: ta.selectionStart, end: ta.selectionEnd, len: ta.value.length };
  const t0 = performance.now();
  const long = Array.from({length: 200}, (_, i) => '第' + (i + 1) + '行：“台词，区{嵌套，层}”普通叙述，尾巴。').join('\\n');
  const fam = hlClassify(long);
  const ms = performance.now() - t0;
  let errs = 0; for (const f of fam) if (f === 'err') errs++;
  const inline = document.querySelector('.block[data-id="k1"] .block-text');
  return { sel, ms: +ms.toFixed(1), chars: long.length, errs,
           inlineHl: !!(inline && inline.closest('.block').querySelector('.blk-hl')) };
})()`);
t('G14 打开编辑器仍不默认全选（v7.6.1 行为保持）',
  reg.sel.start === reg.sel.len && reg.sel.end === reg.sel.len,
  `光标=${reg.sel.start}/${reg.sel.len}，选区长度=${reg.sel.end - reg.sel.start}`);
t('G15 画布块内联编辑仍无着色层（着色只在独立编辑器窗口）',
  reg.inlineHl === false, `内联层着色=${reg.inlineHl}`);
t('G16 大文本（200 行）分类为线性耗时（掩码无 O(n²) 退化）',
  reg.ms < 100 && reg.errs === 200,
  `分类耗时=${reg.ms}ms（${reg.chars} 字符）｜ 其中 200 行尾逗号在引号外 → 错误=${reg.errs}`);

/* ---------- 截图留档 ---------- */
const SHOT = process.argv[2] || '';
if (SHOT) {
  await evalJS(`(() => { openBlockEditor(${JSON.stringify(TEXT)}, null); return 1; })()`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', SHOT);
}

const pass = R.filter(r => r.pass).length;
console.log('=== v7.7 G 组验收（真机 headless Edge + CDP）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nG 组合计 ${pass}/${R.length}`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
