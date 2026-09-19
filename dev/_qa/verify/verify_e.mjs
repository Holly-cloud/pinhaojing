#!/usr/bin/env node
/* 拼好镜 · E 组验收 · 「放大编辑」文本工具「逗号转空格（台词除外）」（v7.17）
   ---------------------------------------------------------------------------
   对象：v7.17 增量需求（口径由主理人与 Holly 逐条锁定）——在「放大编辑」弹窗（#blkMask）底部动作区
        新增按钮 #blkComma：把编辑器内**全文**的**中文逗号 `，`（U+FF0C）**替换为**半角空格 ` `（U+0020）**；
        **一行内成对中文双引号 “ ” 包住的台词区内的逗号保持不动**（复用 v7.7 hlDialogueMask 口径）。
   上游：dev/CHANGELOG.md 的 v7.17 一节；dev/_qa/snapshots/BASELINE_v7.17.md
   实现落点：editor/highlight.js 的纯函数 hlCommaToSpace（+ 导出 PHJ.highlight.hlCommaToSpace）；
            shell/wiring.js 的 #blkComma click 接线；src/index.html 的 <button id="blkComma">。

   为什么独立成套（沿用 v7.15「W 组」/ v7.16「C 组」的做法）：
     本需求走**快速模式**（工程师仅临时探针自测，探针已删），新按钮此前**无任何常驻自动化保护**；
     v7.15 就吃过教训（写作台被既有套件绕开）。故另立一套 `verify_e.mjs`（E = Editor tools），
     在 run-gate.mjs 挂为**第 10 道闸门**（既有 9 道判定式与条数**零改动**）。

   工装铁律（本项目曾多次同类事故，本套件强制遵守）：
     ① 每条断言**真读被测对象**（#blkInput.value / write 后的 state.blocks / 画布 .block-text.value /
        #toast 文本与撤销按钮 / DOM 存在性），不许只判「元素存在 / 函数被调用」；
     ② 每条断言都可**证伪**（改到必然失败 → 必红 → 还原；见测试报告逐条证伪记录）；
     ③ 凡「存在性/计数」断言必追问「内容变空/缩水时会不会照样通过」，并补内容断言 / 反方向对照；
     ④ ★ 豁免类断言（台词区）必配**反方向对照**（E2a 有引号 vs E2c 去引号），否则「机制根本没跑」也会假绿；
     ⑤ 断言条数变动已报 Holly 核准（本组 = 16 条）。

   ★ 本轮独立核实发现一处**产品缺陷（非本套件可绕）**：toast 反馈（含「撤销」按钮）在「放大编辑」弹窗打开时
     被弹窗完全遮挡（`.toast` z-index 99 < `.modal-mask` z-index 11000；弹窗高约 94vh，底心 toast 落于其内）——
     在视口高 < ~1440px 时，真实鼠标**点不到** toast 的「撤销」（`elementFromPoint` 命中 `.blk-win`）。
     E6a 据此用**真实鼠标**点击 toast「撤销」（faithful）；详情见测试报告与 `_tmp_shot_toast` 截图。

   真机口径：点击走 Input.dispatchMouseEvent（真实鼠标事件）；编辑器打开走 openBlockEditor（真实接线，
        弹窗宿主 hostPopup）；写回走真实 #blkOk 点击 → 既有回调。
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_e.mjs
   ※ 调试端口：优先读 PHJ_BROWSER_PORT（run-gate.mjs 传入），缺省 9222。
   ※ 证伪钩子（仅 QA 用）：PHJ_E_ARTIFACT 指向一份**故意改坏**的测试产物副本——产品源码 dev/src/** 与
      交付产物 PHJ.html 一字不动；不设该变量时行为完全不变（每次现建测试产物）。
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = process.env.PHJ_E_ARTIFACT ? { path: process.env.PHJ_E_ARTIFACT } : buildTestArtifact();
const TARGET = 'file:///' + encodeURI(TEST_BUILD.path.replace(/\\/g, '/'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(3); }
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
async function click(sel) {
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
  if (!r) throw new Error('click target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(150);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine → 切画布视图 ---- */
await send('Page.enable'); await send('Runtime.enable');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);
await evalJS("if (typeof setView === 'function') setView('canvas');"); await sleep(200);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

/* ---- 页内助手 ---- */
await evalJS(`window.__open=function(txt){ openBlockEditor(String(txt==null?'':txt), null); return document.getElementById('blkInput').value; };`);
await evalJS(`window.__val=function(){ return document.getElementById('blkInput').value; };`);
await evalJS(`window.__toast=function(){ var e=document.getElementById('toast'); var sp=e.querySelector('span'); var b=e.querySelector('button'); return { hidden:e.classList.contains('hide'), text: sp?sp.textContent:'', btn: b?b.textContent:null }; };`);
await evalJS(`window.__maskShown=function(){ return !document.getElementById('blkMask').classList.contains('hide'); };`);
await evalJS(`window.__blockset=function(id,txt){ if(typeof setView==='function') setView('canvas'); state.blocks=[{ id:id, text:txt, x:120, y:120 }]; state.splice={ items:[], activeUnitId:null }; state.pan={x:0,y:0}; state.zoom=1; render(); return state.blocks.length; };`);
await evalJS(`window.__stateText=function(id){ var b=null; state.blocks.forEach(function(x){ if(x.id===id) b=x; }); return b?b.text:null; };`);
await evalJS(`window.__canvasVal=function(id){ var t=document.querySelector('.block[data-id="'+id+'"] .block-text'); return t?t.value:null; };`);

const openBlk = async (txt) => { await evalJS('__open(' + JSON.stringify(txt == null ? '' : txt) + ')'); await sleep(80); };
const blkVal = () => evalJS('__val()');
const toastInfo = () => evalJS('__toast()');
const setupBlock = async (id, txt) => { await evalJS('__blockset(' + JSON.stringify(id) + ',' + JSON.stringify(txt) + ')'); await sleep(120); };
/* 关掉弹窗 + 收起 toast（避免上一例残留的遮罩/提示干扰下一例的点击） */
const reset = async () => { await evalJS("try{ closeBlockEditor(); }catch(e){} try{ document.getElementById('toast').classList.add('hide'); }catch(e){} 1"); await sleep(60); };

/* ══════════════════════════ E1 · 基本转换（真读 textarea.value）══════════════════════════
   两个中文逗号 → 两个**半角空格**（U+0020，非全角 U+3000、非删除）；长度不变（防「删掉逗号」蒙混）。 */
{
  const SRC = '角色停步回望，眼神警惕，雨水沿帽沿滑落。';
  const EXP = '角色停步回望 眼神警惕 雨水沿帽沿滑落。';
  await openBlk(SRC);
  await click('#blkComma');
  const v = await blkVal();
  const tst = await toastInfo();
  const first = SRC.indexOf('，'), second = SRC.indexOf('，', first + 1);
  t('E1 基本转换：`角色停步回望，眼神警惕，雨水沿帽沿滑落。` 点 #blkComma → #blkInput.value 逐字 = `角色停步回望 眼神警惕 雨水沿帽沿滑落。`；两处替换字符 = 半角空格 U+0020（真读 value + 字符码，长度不变防删除）',
    v === EXP && v.length === SRC.length
    && v.charCodeAt(first) === 32 && v.charCodeAt(second) === 32
    && v.indexOf('，') === -1 && tst.text === '已转换 2 处逗号' && tst.btn === '撤销',
    `value=${JSON.stringify(v)}（len ${SRC.length}→${v.length}）；替换位码=${v.charCodeAt(first)}/${v.charCodeAt(second)}；toast=${JSON.stringify(tst.text)} btn=${JSON.stringify(tst.btn)}`);
}

/* ══════════════════════════ E2 · 台词区豁免（核心）+ 反方向对照 ══════════════════════════ */

/* E2a 整句台词：引号内两逗号原样；无引号外逗号 → 无变化提示、不给撤销 */
{
  const SRC = '小满说道【@音色】：“老陈，你来了，别走。”';
  await openBlk(SRC);
  await click('#blkComma');
  const v = await blkVal();
  const tst = await toastInfo();
  t('E2a 台词区豁免（全台词）：`…：“老陈，你来了，别走。”` 点 #blkComma → 引号内两个逗号**原样不动**、整体无变化；toast「没有可转换的逗号」且**不含撤销按钮**（真读 value + toast）',
    v === SRC && tst.text === '没有可转换的逗号' && tst.btn === null,
    `value=${JSON.stringify(v)}（原样=${v === SRC}）；toast=${JSON.stringify(tst.text)} btn=${JSON.stringify(tst.btn)}`);
}

/* E2b 引号内外混合：引号内 1 逗号不动，引号外 3 逗号转 */
{
  const SRC = '他停步，说：“别走，留下”，然后转身，走了。';
  const EXP = '他停步 说：“别走，留下” 然后转身 走了。';
  await openBlk(SRC);
  await click('#blkComma');
  const v = await blkVal();
  const tst = await toastInfo();
  t('E2b 台词区豁免（混合）：`他停步，说：“别走，留下”，然后转身，走了。` → 引号内 1 个逗号保留、引号外 3 个转空格 = `他停步 说：“别走，留下” 然后转身 走了。`（真读 value + toast 计数 3）',
    v === EXP && tst.text === '已转换 3 处逗号',
    `value=${JSON.stringify(v)}（期望 ${JSON.stringify(EXP)}）；toast=${JSON.stringify(tst.text)}`);
}

/* E2c ★反方向对照：与 E2a **同一句**但**去掉引号** → 那些逗号必须被转（证明豁免来自引号，而非「整句没处理」） */
{
  const SRC = '小满说道【@音色】：老陈，你来了，别走。';
  const EXP = '小满说道【@音色】：老陈 你来了 别走。';
  await openBlk(SRC);
  await click('#blkComma');
  const v = await blkVal();
  const tst = await toastInfo();
  t('E2c ★反方向对照：把 E2a 同句的引号去掉 → 两个逗号**必被转**（`…：老陈 你来了 别走。`）；证明台词区豁免确由「成对中文双引号」产生，而非「整句没处理」',
    v === EXP && tst.text === '已转换 2 处逗号' && v !== SRC,
    `value=${JSON.stringify(v)}（期望 ${JSON.stringify(EXP)}）；toast=${JSON.stringify(tst.text)}`);
}

/* E2d ★同源核实（独立验证「是否真复用 v7.7 机制、有无重复实现」）：
   对一组文本，逐字符比较「hlCommaToSpace 实际转换的中文逗号位」与「着色层 hlClassify（不传掩码）判为 err 的中文逗号位」
   —— 两者必须**逐个索引相等**。若新工具另写了一套台词判定而与着色层脱钩，此断言必红。 */
{
  const e2d = await evalJS(`(function(){
    var f = PHJ.highlight.hlCommaToSpace;
    var cases = [
      '甲，乙：“丙，丁”，戊。',
      '“整句台词，不动。”',
      '未闭合“引号，这里',
      '上半行“开，\\n下半行，闭”末尾，',
      '，，“双开”，',
      'a,b、c，d',
      '嵌套“外{内，层}层，尾”，尾'
    ];
    function convIdx(s){ var out = f(s).text, idx = []; for(var i=0;i<s.length;i++){ if(s.charAt(i)==='\uFF0C' && out.charAt(i)!=='\uFF0C') idx.push(i); } return idx; }
    function errIdx(s){ var fam = hlClassify(s), idx = []; for(var i=0;i<s.length;i++){ if(s.charAt(i)==='\uFF0C' && fam[i]==='err') idx.push(i); } return idx; }
    var rows = cases.map(function(s){ return { src: s, conv: convIdx(s), err: errIdx(s) }; });
    var totalConv = rows.reduce(function(a, r){ return a + r.conv.length; }, 0);
    var allMatch = rows.every(function(r){ return JSON.stringify(r.conv) === JSON.stringify(r.err); });
    return { allMatch: allMatch, totalConv: totalConv, rows: rows };
  })()`);
  t('E2d ★同源核实：对 7 组文本，hlCommaToSpace 转换的中文逗号位 ≡ 着色层 hlClassify 判为 err 的中文逗号位（逐索引相等，且总转换数 > 0 非真空）——证明台词口径与 v7.7 着色层同源、未另写判定',
    e2d.allMatch === true && e2d.totalConv > 0,
    `逐索引全相等=${e2d.allMatch}；总转换=${e2d.totalConv}；样本=${JSON.stringify(e2d.rows.map(function(r){ return [r.conv, r.err]; }))}`);
}

/* ══════════════════════════ E3 · 不误伤：半角 `,` 与顿号 `、` 逐字不变 ══════════════════════════ */
{
  const SRC = 'a,b、c，d';
  await openBlk(SRC);
  await click('#blkComma');
  const v = await blkVal();
  t('E3 不误伤：`a,b、c，d` → 仅 1 个中文逗号转空格 = `a,b、c d`；半角 `,`（U+002C）与顿号 `、`（U+3001）逐字不变（真读 value）',
    v === 'a,b、c d' && v.indexOf(',') === 1 && v.indexOf('、') === 3,
    `value=${JSON.stringify(v)}；半角逗号位=${v.indexOf(',')} 顿号位=${v.indexOf('、')}`);
}

/* ══════════════════════════ E4 · 边界 ══════════════════════════ */

/* E4a 跨行引号 → 不成台词区 → 照转（随 v7.7 hlDialogueMask 口径：换行重置）
   ① 开引号后**无闭合**；② 引号**跨行成对**（开在上一行、闭在下一行）——两者都不得构成台词区。 */
{
  const SRC1 = '“未闭合，逗号\n下一行，逗号';
  const EXP1 = '“未闭合 逗号\n下一行 逗号';
  await reset();
  await openBlk(SRC1);
  await click('#blkComma');
  const v1 = await blkVal();
  const ts1 = await toastInfo();
  const SRC2 = '“上行，开\n下行，闭”尾，';           /* 一对引号分处两行 → 换行重置 → 不成台词区 */
  const EXP2 = '“上行 开\n下行 闭”尾 ';
  await reset();
  await openBlk(SRC2);
  await click('#blkComma');
  const v2 = await blkVal();
  const ts2 = await toastInfo();
  t('E4a 边界（跨行引号不成台词区）：① 开引号至下一行仍未闭合（`“未闭合，逗号\\n下一行，逗号`）→ 两逗号照转；② 引号**跨行成对**（`“上行，开\\n下行，闭”尾，`）→ 换行重置使该对**不生效**、3 逗号全转（真读 value + toast 计数）',
    v1 === EXP1 && ts1.text === '已转换 2 处逗号' && v2 === EXP2 && ts2.text === '已转换 3 处逗号',
    `① value=${JSON.stringify(v1)} toast=${JSON.stringify(ts1.text)}（期望 ${JSON.stringify(EXP1)}）；② value=${JSON.stringify(v2)} toast=${JSON.stringify(ts2.text)}（期望 ${JSON.stringify(EXP2)}）`);
}

/* E4b 空文本 + 纯标记文本 → 无逗号 → 无变化提示、值不变、不给撤销 */
{
  await openBlk('');
  await click('#blkComma');
  const vEmpty = await blkVal();
  const tsEmpty = await toastInfo();
  const MARK = '画面开始：';
  await openBlk(MARK);
  await click('#blkComma');
  const vMark = await blkVal();
  const tsMark = await toastInfo();
  t('E4b 边界（空 / 纯标记）：空文本 → value 仍 `""` + toast「没有可转换的逗号」不给撤销；`画面开始：` → value 原样 + 同提示（真读 value + toast）',
    vEmpty === '' && tsEmpty.text === '没有可转换的逗号' && tsEmpty.btn === null
    && vMark === MARK && tsMark.text === '没有可转换的逗号' && tsMark.btn === null,
    `空：value=${JSON.stringify(vEmpty)} toast=${JSON.stringify(tsEmpty.text)} btn=${JSON.stringify(tsEmpty.btn)}；纯标记：value=${JSON.stringify(vMark)} toast=${JSON.stringify(tsMark.text)} btn=${JSON.stringify(tsMark.btn)}`);
}

/* ══════════════════════════ E5 · ★取消语义：只改 textarea，不写回 state ══════════════════════════
   真机路径：画布块「⤢ 放大」→ openBlockEditor(text, cb)；点 #blkComma 只应改 textarea；
   点「取消」后 state.blocks 对应块文本 与 画布 .block-text.value 必须**仍是原值**。 */
{
  const SRC = '甲，乙，丙';
  const EXP = '甲 乙 丙';
  await reset();
  await setupBlock('cb1', SRC);
  await click('.block[data-id="cb1"] [data-act="zoom"]');
  const opened = await evalJS('__val()');
  await click('#blkComma');
  const afterComma = await evalJS("({ ta: __val(), state: __stateText('cb1'), dom: __canvasVal('cb1'), shown: __maskShown() })");
  await click('#blkCancel');
  const afterCancel = await evalJS("({ state: __stateText('cb1'), dom: __canvasVal('cb1'), shown: __maskShown() })");
  t('E5 ★取消语义：放大打开块（原 `甲，乙，丙`）→ 点 #blkComma 仅改 textarea（`甲 乙 丙`）、state.blocks 与画布 .block-text 仍原值；再点「取消」→ state/画布**仍原值**、弹窗关闭（真读三处）',
    opened === SRC && afterComma.ta === EXP && afterComma.state === SRC && afterComma.dom === SRC && afterComma.shown === true
    && afterCancel.state === SRC && afterCancel.dom === SRC && afterCancel.shown === false,
    `打开 value=${JSON.stringify(opened)}；点逗号后 ta=${JSON.stringify(afterComma.ta)} state=${JSON.stringify(afterComma.state)} dom=${JSON.stringify(afterComma.dom)}；取消后 state=${JSON.stringify(afterCancel.state)} dom=${JSON.stringify(afterCancel.dom)} shown=${afterCancel.shown}`);
}

/* ══════════════════════════ E6 · 撤销 ══════════════════════════ */

/* E6a ★真实鼠标点击 toast「撤销」→ #blkInput.value 完整复原（真读 value 前后；并记录点击处命中的元素以备诊断） */
{
  const SRC = '丁，戊，己';
  const EXP = '丁 戊 己';
  await reset();
  await openBlk(SRC);
  await click('#blkComma');
  const mid = await evalJS("({ ta: __val(), toast: __toast() })");
  const hit = await evalJS("(function(){ var b=document.querySelector('#toast button'); if(!b) return null; var r=b.getBoundingClientRect(); var el=document.elementFromPoint(Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)); return { rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, hit: el?(el.id||el.className||el.tagName):null }; })()");
  if (hit) await click('#toast button');   /* 真实鼠标点击 toast「撤销」（无按钮则跳过 → 断言失败） */
  const back = await blkVal();
  t('E6a ★撤销（真实鼠标点 toast「撤销」）：`丁，戊，己`→`丁 戊 己` 后，真实点击 toast「撤销」→ #blkInput.value **完整复原**为 `丁，戊，己`（真读 value 前后；失败时附 elementFromPoint 诊断）',
    mid.ta === EXP && mid.toast.btn === '撤销' && back === SRC,
    `点逗号后 ta=${JSON.stringify(mid.ta)} toast btn=${JSON.stringify(mid.toast.btn)}；点击前 elementFromPoint(#toast button)=${hit ? JSON.stringify(hit.hit) + '@' + JSON.stringify(hit.rect) : 'null'}；真实点击后 ta=${JSON.stringify(back)}`);
}

/* E6b n===0（无变化）→ toast 不含撤销按钮（真读 #toast 内 button 是否存在） */
{
  await reset();
  await openBlk('没有任何逗号的句子');
  await click('#blkComma');
  const tst = await evalJS("({ toast: __toast(), hasBtn: !!document.querySelector('#toast button') })");
  t('E6b 无变化不给撤销：对 n===0 的文本点 #blkComma → toast「没有可转换的逗号」且 #toast 内**不存在** button（真查 DOM）',
    tst.toast.text === '没有可转换的逗号' && tst.toast.btn === null && tst.hasBtn === false,
    `toast=${JSON.stringify(tst.toast.text)} btn=${JSON.stringify(tst.toast.btn)} #toast button 存在=${tst.hasBtn}`);
}

/* ══════════════════════════ E7 · 写回链路：点「确定」→ state.blocks / 画布 / 重开一致 ══════════════════════════ */
{
  const SRC = '庚，辛';
  const EXP = '庚 辛';
  await reset();
  await setupBlock('wb1', SRC);
  await click('.block[data-id="wb1"] [data-act="zoom"]');
  await click('#blkComma');
  await click('#blkOk');
  const wrote = await evalJS("({ state: __stateText('wb1'), dom: __canvasVal('wb1'), shown: __maskShown() })");
  await click('.block[data-id="wb1"] [data-act="zoom"]');
  const reopened = await evalJS("({ ta: __val(), shown: __maskShown() })");
  await click('#blkCancel');
  t('E7 写回链路：放大块 `庚，辛` → #blkComma → 点「确定」→ state.blocks 该块文本 = `庚 辛`、画布 .block-text.value = `庚 辛`；**再次放大**读回编辑器 value = `庚 辛`（真读 state + 画布 DOM + 重开）',
    wrote.state === EXP && wrote.dom === EXP && wrote.shown === false
    && reopened.ta === EXP && reopened.shown === true,
    `确定后 state=${JSON.stringify(wrote.state)} dom=${JSON.stringify(wrote.dom)} shown=${wrote.shown}；重开 value=${JSON.stringify(reopened.ta)}`);
}

/* ══════════════════════════ E8 · 纯函数层 hlCommaToSpace ══════════════════════════ */
{
  const IN1 = 'abc';                                 /* ① 无逗号 */
  const IN2 = '“老陈，你来了，别走。”';                 /* ② 全在台词区 */
  const IN3 = '镜头${1}，推进，速度${2}';              /* ③ 含 ${n} 槽位，2 个逗号在槽位外 */
  const LONG = '甲，'.repeat(200);                    /* ④ 超长文本：200 个逗号 */
  const r = await evalJS(`(function(){
    var f = PHJ.highlight.hlCommaToSpace;
    var cnt = function(s){ var n=0; for(var i=0;i<s.length;i++){ if(s.charAt(i)==='\\uFF0C') n++; } return n; };
    var src = ${JSON.stringify(LONG)};
    var r1 = f(${JSON.stringify(IN1)});
    var r2 = f(${JSON.stringify(IN2)});
    var r3 = f(${JSON.stringify(IN3)});
    var r4 = f(src);
    return { isFn: typeof f === 'function', r1: r1, r2: r2, r3: r3,
             r4: { text: r4.text, n: r4.n, srcComma: cnt(src), outComma: cnt(r4.text), srcLen: src.length, outLen: r4.text.length } };
  })()`);
  t('E8 纯函数 hlCommaToSpace：① 无逗号 `abc`→原样 n=0；② 全台词 `“老陈，你来了，别走。”`→原样 n=0；③ 含 ${1}/${2} 槽位 → 槽位外 2 逗号转、槽位符逐字不变；④ 超长 200 逗号 → n=200 且输出 0 逗号、长度不变（真读返回 + 独立复算逗号数）',
    r.isFn === true
    && eq(r.r1, { text: IN1, n: 0 })
    && eq(r.r2, { text: IN2, n: 0 })
    && eq(r.r3, { text: '镜头${1} 推进 速度${2}', n: 2 })
    && r.r4.n === 200 && r.r4.srcComma === 200 && r.r4.outComma === 0 && r.r4.outLen === r.r4.srcLen,
    `isFn=${r.isFn}；① ${JSON.stringify(r.r1)}；② ${JSON.stringify(r.r2)}；③ ${JSON.stringify(r.r3)}；④ n=${r.r4.n} srcComma=${r.r4.srcComma} outComma=${r.r4.outComma} len ${r.r4.srcLen}→${r.r4.outLen}`);
}

/* E8e ★纯函数无副作用：调用不触碰 state / DOM / textarea / 全局；null / undefined / 数字输入鲁棒 */
{
  const r = await evalJS(`(function(){
    var f = PHJ.highlight.hlCommaToSpace;
    var snap = function(){ return JSON.stringify(state) + '|' + state.version + '|' + state.blocks.length + '|' + state.zoom + '|' + JSON.stringify(state.pan); };
    var taBefore = document.getElementById('blkInput').value;
    var boardBefore = document.getElementById('board').innerHTML.length;
    var s0 = snap();
    var r = f('甲，乙：“丙，丁”');
    var s1 = snap();
    return { stateSame: s0 === s1, taSame: taBefore === document.getElementById('blkInput').value, boardSame: boardBefore === document.getElementById('board').innerHTML.length,
             rText: r.text, rN: r.n, nullR: f(null), undefR: f(undefined), numR: f(12345) };
  })()`);
  t('E8e ★纯函数无副作用：调用 hlCommaToSpace 前后 state（JSON 快照）/ #blkInput.value / 画布 innerHTML **完全一致**；null/undefined → `{text:"",n:0}`、数字 12345 → `{text:"12345",n:0}`（真读前后对比）',
    r.stateSame === true && r.taSame === true && r.boardSame === true
    && r.rText === '甲 乙：“丙，丁”' && r.rN === 1
    && eq(r.nullR, { text: '', n: 0 }) && eq(r.undefR, { text: '', n: 0 }) && eq(r.numR, { text: '12345', n: 0 }),
    `state 不变=${r.stateSame} ta 不变=${r.taSame} board 不变=${r.boardSame}；r=${JSON.stringify(r.rText)} n=${r.rN}；null=${JSON.stringify(r.nullR)} undef=${JSON.stringify(r.undefR)} num=${JSON.stringify(r.numR)}`);
}

/* ══════════════════════════ E9 · 与「移除空行」互不干扰 ══════════════════════════ */
{
  const SRC = '甲\n\n乙，丙';
  const EXP = '甲\n乙 丙';
  /* A：先逗号后空行 */
  await openBlk(SRC);
  await click('#blkComma');
  const a1 = await blkVal();
  await click('#blkStrip');
  const a2 = await blkVal();
  /* B：先空行后逗号 */
  await openBlk(SRC);
  await click('#blkStrip');
  const b1 = await blkVal();
  await click('#blkComma');
  const b2 = await blkVal();
  t('E9 与「移除空行」互不干扰：`甲\\n\\n乙，丙` 两按钮先后点 → 两种顺序均得 `甲\\n乙 丙`（先逗号：中间 `甲\\n\\n乙 丙`；先空行：中间 `甲\\n乙，丙`）——各自动作正确、互不破坏（真读 value）',
    a1 === '甲\n\n乙 丙' && a2 === EXP && b1 === '甲\n乙，丙' && b2 === EXP,
    `先逗号：中间=${JSON.stringify(a1)} 终=${JSON.stringify(a2)}；先空行：中间=${JSON.stringify(b1)} 终=${JSON.stringify(b2)}`);
}

/* ══════════════════════════ E10 · 范围界定：写作台右栏**没有**此工具 ══════════════════════════ */
{
  await reset();
  const s = await evalJS(`(function(){
    var commaInMask = document.querySelectorAll('#blkMask #blkComma').length;
    var commaTotal = document.querySelectorAll('#blkComma').length;
    var commaInDeskCanvas = document.querySelectorAll('#writeDesk #blkComma').length;
    setView('write');
    var commaInDeskWrite = document.querySelectorAll('#writeDesk #blkComma').length;
    var deskStrip = !!document.querySelector('#writeDesk #wdStrip');
    var deskCopy = !!document.querySelector('#writeDesk #wdCopy');
    setView('canvas');
    return { commaInMask: commaInMask, commaTotal: commaTotal, commaInDeskCanvas: commaInDeskCanvas, commaInDeskWrite: commaInDeskWrite, deskStrip: deskStrip, deskCopy: deskCopy };
  })()`);
  t('E10 范围界定（Holly 口径）：全 DOM 中 #blkComma **恰 1 个**且 ∈ #blkMask；#writeDesk 内**不存在** #blkComma（画布态与写作态各查一次），而写作台确有 #wdStrip / #wdCopy（反方向对照，防「查询写错恒为空」）（真查 DOM）',
    s.commaInMask === 1 && s.commaTotal === 1 && s.commaInDeskCanvas === 0 && s.commaInDeskWrite === 0 && s.deskStrip === true && s.deskCopy === true,
    `#blkMask 内=${s.commaInMask} 总数=${s.commaTotal}；#writeDesk 内 画布态=${s.commaInDeskCanvas} 写作态=${s.commaInDeskWrite}；写作台有 #wdStrip=${s.deskStrip} #wdCopy=${s.deskCopy}`);
}

const pass = R.filter((r) => r.pass).length;
console.log('=== E 组验收（真机 headless Edge + CDP）：放大编辑「逗号转空格（台词除外）」（v7.17）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nE 组合计 ${pass}/${R.length}（基本转换/台词豁免×2+对照/同源核实/不误伤/边界×2/取消语义/撤销×2/写回链路/纯函数×2/互不干扰/范围界定）`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
