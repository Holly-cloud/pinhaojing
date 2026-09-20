#!/usr/bin/env node
/* 拼好镜 · v7.19 验收 · 「划选重影修复 + 写作台补全可用」（10 断言 · 闸门 [14] · 退出码 17）
   ---------------------------------------------------------------------------
   对象（v7.19 两缺陷 + Holly 重裁方案②）：
     A. 需求① 划选「重影 / 双重叠」修复 —— `.blk-input::selection` 不再覆盖文字颜色，
        选中时只见蓝底，文字由底层彩色层唯一显示（逐像素证据）。
     B. 需求② + A'（方案②）写作台补全**可用** —— 撤销封存（CMPL_TRIGGER_OFF 已删），
        真实 `#` 可触发；根因修复 = cmplBind 的 scroll 监听 `cmplClose` → `cmplPlace`
        （长文本在文末输入触发符 → textarea 自动滚动 → 旧写法刚弹即关；新写法气泡跟随光标）。
   上游：dev/CHANGELOG.md v7.19；dev/_qa/snapshots/BASELINE_v7.19.md。

   断言清单（10 条，两组）：
     重影组 G1..G7：
       G1 产物 CSS 根因：`.blk-input::selection` 规则无 `-webkit-text-fill-color` / `color` 文字色覆盖
       G2 未选中对照：隐藏彩色层后编辑层墨迹 = 0（编辑层本来不显字——证明墨迹统计口径有效）
       G3 弹窗宿主划选后：隐藏彩色层 → 编辑层墨迹 = 0（旧实现 ≈6184 px，重影即第二份字）
       G4 蓝底保留：同一选区正常截图 → 选区蓝底像素 > 2000（选中反馈未被删掉；无蓝底时仅 ~32 噪声）
       G5 变更 confinement：划选前后整编辑区截图的差异像素全部落在首行选区带内
       G6 写作台宿主划选后：同 G3（第二宿主同修，共用一条规则）
       G7 select 节流：Shift+→ ×12 后 hlRefresh 重建次数 ∈ [12,18]
          （若回退成 select→hlRefresh 则 ≈25 必红）
     补全组 K8..K10（「补全可用」形态，真实 `#` / 真实按键 / 真实滚动）：
       K8 真实 `#` 触发弹泡：弹窗 + 写作台两宿主（Input.insertText，非程序化 cmplOnInput）
       K9 根因修复（滚动三态）：长文本末输入 `#` → 自动滚动发生且气泡 open 且在视口内；
          用户滚动 → 气泡仍 open 且位置跟随；气泡关闭后滚动 → 不弹泡
       K10 上屏写回 + 弹窗取消语义：写作台 Enter 进组、Enter 上屏后 state.blocks 实时写回；
          弹窗宿主 Esc 只关气泡，取消关闭后块文本不变

   工装铁律（同 verify_c / verify_w 等，全部沿用）：
     ① 每条断言真读被测对象（CSSOM 规则 / 截图像素 / cmplOpen / state.blocks / DOM 可见性）；
     ② 每条断言可证伪（回退 CSS / 回退 scroll→cmplClose / 回退 select→hlRefresh 任一即红）；
     ③ 真机口径：点击/拖选走 Input.dispatchMouseEvent，打字走 Input.insertText，
        按键走 Input.dispatchKeyEvent，滚动走真实 scrollTop 变更（原生 scroll 事件）。
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_v719.mjs
   ※ 调试端口：优先读 PHJ_BROWSER_PORT（run-gate.mjs 传入），缺省 9222。
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { decodePng, countPixels } from '../lib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* ★ 证伪测试钩子（与 verify_c 同款）：PHJ_V719_ARTIFACT 可指向一份故意改坏的测试产物副本，
   仅用于 QA 证伪；产品源码与交付产物一字不动。不设该变量时行为完全不变。 */
const TEST_BUILD = process.env.PHJ_V719_ARTIFACT ? { path: process.env.PHJ_V719_ARTIFACT } : buildTestArtifact();
const TARGET = 'file:///' + encodeURI(TEST_BUILD.path.replace(/\\/g, '/'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(17); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result && r.result.value;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

/* ---- 真机原语 ---- */
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await sleep(120);
}
/* 真实划选：点击起点 + Shift+点选延展（真实鼠标输入，走原生选区 / select 事件 / ::selection 路径）。
   ※ 本机 headless Edge 的 CDP 鼠标拖选不派发选区（about:blank 纯 textarea 对照实验证实为环境限制，非产品问题）；
   Shift+click 与拖选产生完全相同的 DOM 选区与事件序列，故以此替代。 */
async function clickShiftSelect(x0, y0, x1, y1) {
  await clickAt(x0, y0);                                   /* 定位起点（光标落在起点） */
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x1), y: Math.round(y1) });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x1), y: Math.round(y1), button: 'left', buttons: 1, clickCount: 1, modifiers: 8 /* Shift */ });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x1), y: Math.round(y1), button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(150);
}
async function typeText(text) { await send('Input.insertText', { text }); await sleep(160); }
async function pressKey(key, code, vk, modifiers) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: modifiers || 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: modifiers || 0 });
  await sleep(90);
}

/* ---- 截图与像素统计 ---- */
async function shot(clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.w), height: Math.round(clip.h), scale: 1 } });
  return decodePng(Buffer.from(r.data, 'base64'));
}
const inkCount = (img) => countPixels(img.data, (r, g, b) => r < 100 && g < 100 && b < 100);
const blueCount = (img) => countPixels(img.data, (r, g, b) => (b - r) > 40 && b > 220 && r < 210 && g < 235);
function diffPixels(a, b) {
  const out = [];
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > 8 || Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) {
      const px = i / 4;
      out.push({ x: px % a.width, y: Math.floor(px / a.width) });
    }
  }
  return out;
}

/* ---- 页内助手（受控状态 / 宿主操作 / 计量） ---- */
await evalJS(`
window.__err = 0;
window.addEventListener('error', function(){ window.__err++; });
window.__rect = function(sel){ var e = document.querySelector(sel); if(!e) return null; var r = e.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; };
window.__setLayerVis = function(sel, vis){ var e = document.querySelector(sel); if(!e) return 0; e.style.visibility = vis ? 'visible' : 'hidden'; return 1; };
window.__mkLines = function(n){ var a = []; for(var i=0;i<n;i++) a.push('第' + i + '行分镜内容。'); return a.join('\\n'); };
window.__deskPrep = function(){ setView('write'); state.blocks = [{ id:'d1', text:'', x:0, y:0 }]; renderWrite(); return 1; };
window.__deskText = function(txt){ state.blocks[0].text = txt; renderWrite(); var ta = document.querySelector('#wdInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return ta.scrollTop; };
window.__deskCaretEnd = function(){ var ta = document.querySelector('#wdInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return 1; };
window.__deskState = function(){
  var ta = document.querySelector('#wdInput'); var pop = document.querySelector('#wdPop'); var r = pop.getBoundingClientRect();
  return { open: cmplOpen, hidden: pop.classList.contains('hide'), scrollTop: ta.scrollTop,
           scrollable: ta.scrollHeight > ta.clientHeight,
           inVp: r.top >= 0 && r.top < window.innerHeight && r.left >= 0 && r.left < window.innerWidth,
           popTop: Math.round(r.top), err: window.__err };
};
window.__popupOpen = function(txt){ setView('canvas'); state.blocks = [{ id:'p1', text: txt, x:0, y:0 }]; render(); openBlockEditor(txt, null); return 1; };
window.__popupCaretEnd = function(){ var ta = document.querySelector('#blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return 1; };
window.__popupCancelClose = function(){ var b = document.querySelector('#blkCancel'); if(b){ b.click(); return 'cancel-btn'; } closeBlockEditor(); return 'fallback'; };
window.__lineMetrics = function(sel){
  var ta = document.querySelector(sel); var r = ta.getBoundingClientRect(); var cs = getComputedStyle(ta);
  return { left:r.left, top:r.top, w:r.width, h:r.height, lh: parseFloat(cs.lineHeight) || 20 };
};
1`);

/* ══════════ A 组：划选重影（G1..G7） ══════════ */

/* G1 产物 CSS 根因断言：::selection 规则不得再覆盖文字颜色 */
{
  const css = await evalJS(`(function(){
    var out = null;
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules; try { rules = document.styleSheets[s].cssRules; } catch(e) { continue; }
      for (var i = 0; i < rules.length; i++) {
        if (rules[i].selectorText && rules[i].selectorText.indexOf('.blk-input') >= 0 && rules[i].selectorText.indexOf('::selection') >= 0) out = rules[i].cssText;
      }
    }
    return out;
  })()`);
  const noTextFill = css && !/-webkit-text-fill-color/i.test(css);
  const noColor = css && !/(^|[^-a-z])color\s*:/i.test(css);
  const hasBg = css && /background/i.test(css);
  t('G1 产物CSS根因：.blk-input::selection 无文字色覆盖、保留蓝底', !!(css && noTextFill && noColor && hasBg),
    'rule=' + css + ' noTextFill=' + noTextFill + ' noColor=' + noColor + ' hasBg=' + hasBg);
}

/* G2..G5：弹窗宿主划选逐像素 */
{
  const TXT = '分镜文本用于划选测试共十八字整。';
  await evalJS('__popupOpen(' + JSON.stringify(TXT) + ')');
  await sleep(150);
  const m = await evalJS('__lineMetrics("#blkInput")');
  const x0 = m.left + 54, y0 = m.top + 12 + m.lh / 2;     /* padding-left 52 + 边框 1；padding-top 10 + 边框 1 */
  const x1 = m.left + 200, y1 = y0;
  const taRect = await evalJS('__rect("#blkInput")');

  /* G2 未选中对照：无选区（先 blur 掉插入符）+ 隐藏彩色层 → 墨迹 = 0 */
  await evalJS('(function(){ var ta = document.querySelector("#blkInput"); ta.setSelectionRange(0,0); ta.blur(); return 1; })()');
  await evalJS('__setLayerVis(".blk-hl", false)');
  const imgG2 = await shot(taRect);
  const inkG2 = inkCount(imgG2);
  await evalJS('__setLayerVis(".blk-hl", true)');

  /* 真实划选首行前若干字 */
  await clickShiftSelect(x0, y0, x1, y1);
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#blkInput"); return ta.selectionEnd - ta.selectionStart; })()');

  /* G3 选中后：隐藏彩色层 → 编辑层墨迹 = 0（重影 = 第二份字，旧实现此处 ≈6184px） */
  await evalJS('__setLayerVis(".blk-hl", false)');
  const imgG3 = await shot(taRect);
  const inkG3 = inkCount(imgG3);
  await evalJS('__setLayerVis(".blk-hl", true)');

  /* G4 蓝底保留：正常层叠下同一选区的蓝底像素 */
  const imgG4 = await shot(taRect);
  const blueG4 = blueCount(imgG4);

  /* G5 变更 confinement：划选前（同视口状态、无选区、光标在带内）vs 划选后整区 diff 全落首行带 */
  await evalJS('(function(){ var ta = document.querySelector("#blkInput"); ta.setSelectionRange(0,0); return 1; })()');
  await sleep(120);
  const imgBefore = await shot(taRect);
  await clickShiftSelect(x0, y0, x1, y1);
  await sleep(120);
  const imgAfter = await shot(taRect);
  const diffs = diffPixels(imgBefore, imgAfter);
  const bandTop = 8, bandBottom = 12 + 2 * m.lh + 4;   /* 首行带（含边框/padding 余量） */
  const outOfBand = diffs.filter((p) => p.y < bandTop || p.y > bandBottom);
  t('G2 未选中对照：隐藏彩色层后编辑层墨迹=0', inkG2 === 0, 'inkPx=' + inkG2);
  t('G3 弹窗划选后：编辑层墨迹=0（重影第二份字消失）', selLen > 0 && inkG3 === 0, 'selLen=' + selLen + ' inkPx=' + inkG3);
  t('G4 选中蓝底保留（反馈仍在）', blueG4 > 2000, 'bluePx=' + blueG4 + '（阈值 2000：11 字选区 ≈3300 px² 内的实测稳态；无蓝底时仅 ~32 噪声，回退即红）');
  t('G5 划选差异全部落在首行选区带内', diffs.length > 100 && outOfBand.length === 0,
    'diffPx=' + diffs.length + ' outOfBand=' + outOfBand.length + ' band=[' + bandTop + ',' + Math.round(bandBottom) + ']');
  await evalJS('closeBlockEditor(); 1');
  await sleep(120);
}

/* G6 写作台宿主：同口径划选 → 编辑层墨迹 = 0 */
{
  await evalJS('__deskPrep()');
  await evalJS('__deskText("写作台划选测试文本一句。")');
  await sleep(150);
  const m = await evalJS('__lineMetrics("#wdInput")');
  const taRect = await evalJS('__rect("#wdInput")');
  await clickShiftSelect(m.left + 54, m.top + 12 + m.lh / 2, m.left + 200, m.top + 12 + m.lh / 2);
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return ta.selectionEnd - ta.selectionStart; })()');
  await evalJS('__setLayerVis(".wd-hl", false)');
  const img = await shot(taRect);
  const ink = inkCount(img);
  await evalJS('__setLayerVis(".wd-hl", true)');
  t('G6 写作台划选后：编辑层墨迹=0（第二宿主同修）', selLen > 0 && ink === 0, 'selLen=' + selLen + ' inkPx=' + ink);
}

/* G7 select 事件节流：包装 hlToHTML 计数 → Shift+→ ×12 → 次数 ∈ [12,18]
   （※不能包 hlRefresh：keyup/select 监听体在绑定时就持有原函数引用，事后改绑定不重定向；
   而 hlRefresh 体内按标识符调 hlToHTML —— 运行期解析，包它 = 计「真实整层重建执行次数」。
   回退成 select→hlRefresh 则每次 select 都整层重建 → 次数 ≈25 必红） */
{
  await evalJS('__popupOpen("计数用分镜文本，需要足够长的字符串供方向键延展选区。")');
  await sleep(150);
  await evalJS('(function(){ var ta = document.querySelector("#blkInput"); ta.focus(); ta.setSelectionRange(0,0); return 1; })()');
  await evalJS('window.__hlCount = 0; (function(){ var orig = hlToHTML; hlToHTML = function(){ window.__hlCount++; return orig.apply(this, arguments); }; return 1; })()');
  await sleep(200);
  for (let i = 0; i < 12; i++) await pressKey('ArrowRight', 'ArrowRight', 39, 2 /* Shift */);
  await sleep(250);
  const n = await evalJS('window.__hlCount');
  const selLen = await evalJS('(function(){ var ta = document.querySelector("#blkInput"); return ta.selectionEnd; })()');
  t('G7 select节流：Shift+→×12 后整层重建 ∈[12,18]', n >= 12 && n <= 18, 'rebuilds=' + n + ' selEnd=' + selLen + '（select 路径已改 hlStatus，重建只剩 keyup 必要次数）');
  await evalJS('(function(){ var b = document.querySelector("#blkCancel"); if(b) b.click(); else closeBlockEditor(); return 1; })()');
  await sleep(120);
}

/* ══════════ B 组：写作台补全可用（K8..K10，真实 `#`/按键/滚动） ══════════ */

/* K8 真实 `#` 触发弹泡（两宿主，Input.insertText 非程序化入口） */
{
  /* 弹窗宿主 */
  await evalJS('__popupOpen("弹窗触发测试")');
  await sleep(120);
  await evalJS('__popupCaretEnd()');
  await typeText('#');
  await sleep(250);
  const p1 = await evalJS('(function(){ var pop = document.querySelector("#cmplPop"); return { open: cmplOpen, hidden: pop.classList.contains("hide"), items: cmplItems.length }; })()');
  await evalJS('(function(){ cmplClose(hostPopup); var b = document.querySelector("#blkCancel"); if(b) b.click(); else closeBlockEditor(); return 1; })()');
  await sleep(120);
  /* 写作台宿主 */
  await evalJS('__deskPrep()');
  await evalJS('__deskText("写作台触发测试")');
  await sleep(120);
  await evalJS('__deskCaretEnd()');
  await typeText('#');
  await sleep(250);
  const p2 = await evalJS('(function(){ var pop = document.querySelector("#wdPop"); return { open: cmplOpen, hidden: pop.classList.contains("hide"), items: cmplItems.length }; })()');
  await evalJS('cmplClose(hostDesk); 1');
  t('K8 真实#触发弹泡（弹窗+写作台两宿主）', p1.open && !p1.hidden && p1.items > 0 && p2.open && !p2.hidden && p2.items > 0,
    'popup=' + JSON.stringify(p1) + ' desk=' + JSON.stringify(p2));
}

/* K9 根因修复（滚动三态）：长文本末 # 自动滚动不关泡 / 用户滚动跟随 / 关闭后滚动不弹泡 */
{
  await evalJS('__deskPrep()');
  await evalJS('__deskText(window.__mkLines(80))');
  await evalJS('__deskCaretEnd()');
  await typeText('#');
  await sleep(300);
  const s1 = await evalJS('__deskState()');
  /* 用户主动滚动（真实 scrollTop 变更 → 原生 scroll 事件） */
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); ta.scrollTop = Math.max(0, ta.scrollTop - 60); return ta.scrollTop; })()');
  await sleep(250);
  const s2 = await evalJS('__deskState()');
  /* 关闭后滚动 → 不弹泡 */
  await evalJS('cmplClose(hostDesk); 1');
  await sleep(120);
  await evalJS('(function(){ var ta = document.querySelector("#wdInput"); ta.scrollTop = Math.max(0, ta.scrollTop + 90); return 1; })()');
  await sleep(250);
  const s3 = await evalJS('__deskState()');
  const okK9 = s1.scrollable && s1.open && !s1.hidden && s1.inVp
    && s2.open && !s2.hidden && s2.popTop !== s1.popTop
    && !s3.open && s3.hidden && s3.err === 0;
  t('K9 根因修复：自动滚动/用户滚动/关闭后滚动 三态', okK9,
    'S1=' + JSON.stringify(s1) + ' S2=' + JSON.stringify(s2) + ' S3=' + JSON.stringify(s3));
}

/* K10 上屏写回 + 弹窗取消语义 */
{
  /* 写作台：# → Enter（进组）→ Enter（上屏）→ state.blocks 实时写回 */
  await evalJS('__deskPrep()');
  await evalJS('__deskText("写回测试")');
  await sleep(120);
  await evalJS('__deskCaretEnd()');
  await typeText('#');
  await sleep(250);
  await pressKey('Enter', 'Enter', 13, 0);            /* 组视图 → 进第一组 */
  await sleep(150);
  const committed = await evalJS('(function(){ return cmplItems[cmplSel] ? cmplItems[cmplSel].body : "__NOITEM__"; })()');
  await pressKey('Enter', 'Enter', 13, 0);            /* 条目视图 → 上屏（cmplCommit 补派 input → wdOnInput 写回） */
  await sleep(300);
  const k10a = await evalJS('(function(){ var ta = document.querySelector("#wdInput"); return { ta: ta.value, block: state.blocks[0].text, open: cmplOpen }; })()');
  const wroteBack = committed !== '__NOITEM__'
    && k10a.ta.indexOf(committed) >= 0
    && k10a.block === k10a.ta;                        /* ★写回：块文本与 textarea 一致（含左栏摘要同源） */
  await evalJS('(function(){ state.blocks[0].text = document.querySelector("#wdInput").value; scheduleSave(); return 1; })()');
  await evalJS("setView('canvas'); 1");

  /* 弹窗宿主：# → Esc 只关气泡；再取消关闭 → 块文本保持打开时原值 */
  await evalJS('__popupOpen("取消语义原文")');
  await sleep(120);
  await evalJS('__popupCaretEnd()');
  await typeText('#');
  await sleep(250);
  await pressKey('Escape', 'Escape', 27, 0);          /* 第一击：只关气泡（cmplKeydown 拦截 + stopPropagation） */
  await sleep(150);
  const k10b = await evalJS('(function(){ var ta = document.querySelector("#blkInput"); var m = document.getElementById("blkMask"); return { open: cmplOpen, editorOpen: !m.classList.contains("hide"), ta: ta.value }; })()');
  await evalJS('__popupCancelClose()');
  await sleep(150);
  const k10c = await evalJS('(function(){ return { block: state.blocks[0].text }; })()');
  const cancelOk = !k10b.open && k10b.editorOpen && k10b.ta.indexOf('#') >= 0 && k10c.block === '取消语义原文';
  t('K10 上屏写回（写作台）+ 弹窗取消语义', wroteBack && cancelOk,
    'committed=' + String(committed).slice(0, 24) + '… writeback=' + wroteBack + ' (ta===' + (k10a.block === k10a.ta) + ') esc=' + JSON.stringify(k10b) + ' afterCancel=' + JSON.stringify(k10c));
}

/* ---- 全程零报错：并入 K9 的 s3.err 判定（不另立条目，保证口径 = 10 条） ---- */

/* ═══════════════════ 汇总 ═══════════════════ */
const PASS = R.filter((x) => x.pass).length;
const FAIL = R.length - PASS;
for (const x of R) {
  console.log((x.pass ? '✅ ' : '❌ ') + x.name + (x.detail ? '   〔' + x.detail + '〕' : ''));
}
console.log('v7.19 组合计 ' + PASS + '/' + R.length + '（重影 G×7 + 补全可用 K×3；' + (R.length === 10 ? '口径 = 10 条' : '★条数异常：' + R.length + '≠10，须核查') + '）');
process.exit(FAIL === 0 && R.length === 10 ? 0 : 17);
