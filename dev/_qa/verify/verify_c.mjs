#!/usr/bin/env node
/* 拼好镜 · C 组验收 · 「写作补全四项增强 A/B/D/H」（v7.16）
   ---------------------------------------------------------------------------
   对象：写作补全四项增强（设计 §3 A / §4 B / §5 D / §6 H）
        dev/docs/design/写作补全四项增强_设计_2026-09-18.md
        需求 dev/docs/design/写作补全_初衷复盘与改进建议_2026-09-18.md §3
   上游：dev/CHANGELOG.md v7.16 一节；dev/_qa/snapshots/BASELINE_v7.16.md

   为什么独立成套（沿用 v7.15「W 组独立成套」的做法）：
     A/B/D/H 的行为断言若塞进 v7/v76/v77/v78 会搅动既有计数（项目铁律：条数变动须先报 Holly 核准）。
     故另立一套 `verify_c.mjs`（C = 补全），在 run-gate.mjs 挂为**第 9 道闸门**（既有 8 道判定式与条数零改动）。

   工装铁律（本项目曾多次同类事故，本套件强制遵守）：
     ① 每条断言**真读被测对象**（state.cmpl.use / localStorage / #stErr / DOM 文本 / span class / 渲染顺序），
        不许只判「元素存在 / 函数被调用」；
     ② 每条断言都可**证伪**（改到必然失败 → 必红 → 还原；见测试报告逐条证伪记录）；
     ③ 凡「存在性/计数」断言必追问「内容变空/缩水时会不会照样通过」，并补**内容断言**；
     ④ ★ 门控/豁免类断言必配**反方向对照**（A2/A3/A4 对照、B3 对照、D3 对照），否则「机制根本没跑」也会假绿；
     ⑤ 断言条数变动已报 Holly 核准（本组 = 31 条）。

   真机口径：点击走 Input.dispatchMouseEvent / 文本走 Input.insertText / 事件走既有监听体内的真实派发。
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_c.mjs
   ※ 调试端口：优先读 PHJ_BROWSER_PORT（run-gate.mjs 传入），缺省 9222。
   --------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* A+：对测试产物执行（含顶层名访问器）。
   ★ 证伪测试钩子：允许用环境变量 PHJ_C_ARTIFACT 指向一份**故意改坏**的测试产物副本（仅用于 QA 证伪，
     产品源码 dev/src/** 与交付产物 PHJ.html 一字不动）；不设该变量时行为完全不变（每次现建测试产物）。 */
const TEST_BUILD = process.env.PHJ_C_ARTIFACT ? { path: process.env.PHJ_C_ARTIFACT } : buildTestArtifact();
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
  await clickAt(r.x, r.y);
}
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(150);
}
async function type(text) { await send('Input.insertText', { text }); await sleep(160); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 导航：清 LS → 载入测试产物 → 固定视口 → reload 到 pristine ---- */
await send('Page.enable'); await send('Runtime.enable');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

/* ---- 页内助手：受控状态 / 打开编辑器 / 触发候选 / 读徽章 / 体检 ----
   ★ 注意：D5 会做一次真实 reload（页面内注入的助手会随文档销毁）→ 全部助手集中在此，
     初始与 reload 后各安装一次（installHelpers）。 */
async function installHelpers() {
  /* 受控状态 */
  await evalJS(`window.__cset=function(bs){ state.blocks=bs.map(function(b,i){ var o={ id:b.id||('t'+i), text:(b.text==null?'':b.text), x:(b.x==null?i*40:b.x), y:(b.y==null?i*40:b.y) }; if(b.order!=null) o.order=b.order; if(b.type) o.type=b.type; return o; }); return state.blocks.length; };`);
  await evalJS(`window.__resetCmpl=function(){ state.cmpl={ v:CMPL_SEED_V, items:null, gorder:null, use:{} }; cmplInvalidate(); cmplUseInvalidate(); return 1; };`);
  await evalJS(`window.__setTruth=function(txt){ state.blocks=[{ id:'t', text:txt, x:0, y:0 }]; cmplUseInvalidate(); return 1; };`);
  /* 触发 `#`（组视图）——真实走 cmplOnInput（含 cmplUseInvalidate 每键失效） */
  await evalJS(`window.__trig=function(q){ var ta=hostPopup.el('ta'); cmplReset(); ta.value='#'+String(q||''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplOnInput(); return cmplItems.length; };`);
  await evalJS(`window.__enter=function(g){ cmplEnterGroup(g); return cmplItems.length; };`);
  /* 按 label 真读某候选行的 .cmpl-note 文本（无徽章 → null；找不到行 → '__MISSING__'） */
  await evalJS(`window.__badge=function(label){ var rows=document.querySelectorAll('#cmplPop .cmpl-item'); for(var i=0;i<rows.length;i++){ var lb=rows[i].querySelector('.cmpl-label'); if(lb && lb.textContent===label){ var nt=rows[i].querySelector('.cmpl-note'); return nt?nt.textContent:null; } } return '__MISSING__'; };`);
  /* 真读候选标签顺序 */
  await evalJS(`window.__labels=function(){ var rows=document.querySelectorAll('#cmplPop .cmpl-item'); return Array.prototype.map.call(rows, function(r){ var lb=r.querySelector('.cmpl-label'); return lb?lb.textContent:null; }); };`);
  /* 真实「上屏」：触发 → 进组 → 选中某条 → cmplCommit（真实走插入文本 + cmplUseTouch + scheduleSave） */
  await evalJS(`window.__commit=function(group, body){ __trig(''); __enter(group); var idx=-1; for(var i=0;i<cmplItems.length;i++){ if(cmplItems[i].body===body) idx=i; } if(idx<0) return '__NOITEM__'; cmplSel=idx; cmplCommit(); return idx; };`);
  await evalJS(`window.__it=function(group, body){ return cmplActive().filter(function(x){ return x.group===group && x.body===body; })[0] || null; };`);
  await evalJS(`window.__useOf=function(group, body){ var it=__it(group,body); if(!it) return null; var k=cmplUseKey(it); var u=state.cmpl.use[k]; return { key:k, n: u?u.n:null, t: u?u.t:null }; };`);
  await evalJS(`window.__styleBody=function(label){ return cmplActive().filter(function(x){ return x.group==='风格包' && x.label===label; })[0].body; };`);
  /* 自定义片段表 */
  await evalJS(`window.__noteItems=function(){ cmplSetItems([
    { key:'u_x', group:'G', label:'甲条', note:'项目级定型件', body:'特别标记甲乙丙丁', block:false, src:'user' },
    { key:'u_y', group:'G', label:'乙条', note:'141 句的语法槽位', body:'另一句标记戊己庚', block:false, src:'user' }
  ]); return 1; };`);
  await evalJS(`window.__asciiItem=function(){ cmplSetItems([
    { key:'u_a', group:'G2', label:'ASCII条', note:'未用过', body:'push-in shot 100%', block:false, src:'user' }
  ]); return 1; };`);
  await evalJS(`window.__mkPair=function(){ cmplSetItems([
    { key:'u_p', group:'GP', label:'甲候选', note:'', body:'aaa甲内容', block:false, src:'user' },
    { key:'u_q', group:'GP', label:'乙候选', note:'', body:'aaa乙内容', block:false, src:'user' }
  ]); state.cmpl.use = {}; cmplInvalidate(); cmplUseInvalidate(); return cmplActive().length; };`);
  /* 体检入口 */
  await evalJS(`window.__openCheck=function(){ openCmplCfg(); cmplCfgView='check'; renderCmplCfg(); return cmplCfgView; };`);
  await evalJS(`window.__openLib=function(){ openCmplCfg(); return cmplCfgView; };`);
  await evalJS(`window.__checkTexts=function(){ return Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-check-card .cmpl-check-tx'), function(e){ return e.textContent; }); };`);
  await evalJS(`window.__checkDupCounts=function(){ var out={}; var cards=document.querySelectorAll('#cmplCfgBody .cmpl-check-card'); for(var i=0;i<cards.length;i++){ var tx=cards[i].querySelector('.cmpl-check-tx'), cn=cards[i].querySelector('.cmpl-check-cnt'); if(tx&&cn) out[tx.textContent]=cn.textContent; } return out; };`);
  await evalJS(`window.__dupCardRect=function(text, group){ var cards=document.querySelectorAll('#cmplCfgBody .cmpl-check-card'); for(var i=0;i<cards.length;i++){ var tx=cards[i].querySelector('.cmpl-check-tx'); if(tx && tx.textContent===text){ var sel=cards[i].querySelector('.cmpl-check-sel'); sel.value=group; var btn=cards[i].querySelector('button'); var r=btn.getBoundingClientRect(); return { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), selVal: sel.value }; } } return null; };`);
}
await installHelpers();

async function cset(blocks) { return evalJS('__cset(' + JSON.stringify(blocks) + ')'); }
async function openEditor(text) { await evalJS('openBlockEditor(' + JSON.stringify(text == null ? '' : text) + ', null); 1'); await sleep(70); }

/* ════════════════════════════ A 组 · 状态栏「假错误」豁免（+ 对照组）════════════════════════════ */

/* A 组共用文本：风格区 5 段属性各 1 个中文逗号 + 硬性要求 1 个（= N，全豁免）；起手式 1 + 正文 2（= M，照旧计数） */
const A_TXT = [
  '起手式一句，先记着',        /* 0 anchor：， 计入 */
  '画面开始：',                /* 1 body 起点 */
  '正文第一句，有逗号',        /* 2 body：， 计入 */
  '正文第二句，也有逗号',      /* 3 body：， 计入 */
  '风格：',                    /* 4 style 起点 */
  '【光影逻辑】遵循暖主体，冷环境',   /* 5 style：， 豁免 */
  '【CG 风格】低饱和，木棕土黄',      /* 6 style：， 豁免 */
  '【镜头构图】中焦为主，浅景深',     /* 7 style：， 豁免 */
  '【渲染质感】柔亮中间调，暗部留细节', /* 8 style：， 豁免 */
  '【负面提示词】不要塑料，感低多边形', /* 9 style：， 豁免 */
  '硬性要求：无BMG，无字幕'           /* 10 tail：， 豁免 */
].join('\n');
const A_M = 3, A_N = 6;   /* M = 计入（anchor 1 + body 2）；N = 豁免（style 5 + tail 1） */

/* A1 风格/硬性要求区豁免：掩码后错误数 = 仅正文+起手式（= M）；且 #stErr 同为 M */
{
  await openEditor(A_TXT);
  const a1 = await evalJS(`(() => {
    var v = ${JSON.stringify(A_TXT)};
    var fam = hlClassify(v, structExemptMask(v));
    var errs = 0; for(var i=0;i<fam.length;i++) if(fam[i]==='err') errs++;
    return { maskErrs: errs, stErr: document.getElementById('stErr').textContent, taLen: hostPopup.el('ta').value.length };
  })()`);
  t('A1 风格区/硬性要求区的中文逗号不再计入错误数：`hlClassify(v, structExemptMask(v))` 错误数 = 仅起手式+正文的逗号数（=3）；状态栏 #stErr 同为 3（真读两处）',
    a1.maskErrs === A_M && a1.stErr === String(A_M) && a1.taLen === A_TXT.length,
    `掩码后错误=${a1.maskErrs}（期望 ${A_M}）；#stErr=${a1.stErr}；编辑器长度=${a1.taLen}/${A_TXT.length}`);
}

/* A2 ★对照（证明掩码真生效）：同一文本不传掩码 → 错误数 = M + N（全部逗号） */
{
  const a2 = await evalJS(`(() => {
    var v = ${JSON.stringify(A_TXT)};
    var fam = hlClassify(v);
    var errs = 0; for(var i=0;i<fam.length;i++) if(fam[i]==='err') errs++;
    var m = structExemptMask(v), ones = 0;
    for(var j=0;j<m.length;j++) if(m[j]) ones++;
    return { noMaskErrs: errs, maskOnes: ones, maskLen: m.length, txtLen: v.length };
  })()`);
  t('A2 ★对照（掩码真生效）：同一文本 `hlClassify(v)`（不传掩码）错误数 = 全部逗号 = M+N = 9；掩码长度 = 文本长度（等长）且确有置 1 字符',
    a2.noMaskErrs === A_M + A_N && a2.maskLen === a2.txtLen && a2.maskOnes > 0,
    `不传掩码错误=${a2.noMaskErrs}（期望 ${A_M + A_N}）；掩码长度=${a2.maskLen}=文本长${a2.txtLen}；掩码置1字符=${a2.maskOnes}`);
}

/* A3 ★对照（正文仍计数）：纯正文文本（无 风格：）→ 掩码全 0，行为与改动前一致 */
{
  const T = '纯正文一句，再来一句，还有一句，结尾';   /* 恰 3 个逗号 */
  const a3 = await evalJS(`(() => {
    var v = ${JSON.stringify(T)};
    var famNo = hlClassify(v), famMask = hlClassify(v, structExemptMask(v));
    var c = function(f){ var n=0; for(var i=0;i<f.length;i++) if(f[i]==='err') n++; return n; };
    var m = structExemptMask(v), ones = 0; for(var j=0;j<m.length;j++) if(m[j]) ones++;
    return { noMask: c(famNo), mask: c(famMask), ones: ones };
  })()`);
  t('A3 ★对照（正文仍计数）：纯正文文本（无「风格：」标记）→ 掩码全 0、错误数 = 逗号总数（=3），传/不传掩码结果一致（旧行为不变）',
    a3.noMask === 3 && a3.mask === 3 && a3.ones === 0,
    `不传掩码=${a3.noMask} / 传掩码=${a3.mask}（期望 3）；掩码置1字符=${a3.ones}（期望 0）`);
}

/* A4 DOM 证据：风格区逗号**无 .hl-err / 行号不标红**，且随层级族色（【…】内的逗号呈 hl-lent）；配正文对照组 */
{
  const T_STYLE = '风格：\n【光影，逻辑】';       /* 逗号在【】内 → 族色 lent，且被掩码豁免 */
  const T_BODY = '画面开始：\n正文「有，逗号」'; /* 逗号在正文（body）→ 照旧 hl-err */
  await openEditor(T_STYLE);
  const s = await evalJS(`(() => {
    var code = hostPopup.el('code');
    var err = code.querySelectorAll('.hl-err').length;
    var hasErr = code.querySelectorAll('.hl-line.has-err').length;
    var lents = Array.prototype.map.call(code.querySelectorAll('.hl-lent'), function(e){ return e.textContent; });
    return { err: err, hasErr: hasErr, lentHasComma: lents.some(function(x){ return x.indexOf('，') >= 0; }) };
  })()`);
  await openEditor(T_BODY);
  const b = await evalJS(`(() => {
    var code = hostPopup.el('code');
    return { err: code.querySelectorAll('.hl-err').length, hasErr: code.querySelectorAll('.hl-line.has-err').length };
  })()`);
  t('A4 DOM 证据：风格区（style）的「，」无 .hl-err span、所在行无 has-err，且随层级族色（【…】内的逗号呈 hl-lent）；对照：正文（body）的同形逗号照旧 .hl-err + 行标红',
    s.err === 0 && s.hasErr === 0 && s.lentHasComma === true && b.err === 1 && b.hasErr === 1,
    `风格区：.hl-err=${s.err}/has-err行=${s.hasErr}/hl-lent含逗号=${s.lentHasComma}；正文对照：.hl-err=${b.err}/has-err行=${b.hasErr}`);
}

/* A5 同源：状态栏 #stErr 数值 与 DOM .hl-err span 数一致（不得一处豁免一处不豁免） */
{
  await openEditor(A_TXT);
  const a5 = await evalJS(`(() => {
    var code = hostPopup.el('code');
    return { stErr: parseInt(document.getElementById('stErr').textContent, 10),
             domErr: code.querySelectorAll('.hl-err').length,
             domErrText: Array.prototype.map.call(code.querySelectorAll('.hl-err'), function(e){ return e.textContent; }) };
  })()`);
  t('A5 计数与着色同源：#stErr 数值 === DOM `.hl-err` span 数（=3），且这些 span 文本都是「，」/「,」（无一处豁免、另一处仍标红）',
    a5.stErr === A_M && a5.domErr === A_M && a5.domErrText.length === A_M && a5.domErrText.every(function(x){ return x === '，' || x === ','; }),
    `#stErr=${a5.stErr} / DOM .hl-err=${a5.domErr}；span 文本=${JSON.stringify(a5.domErrText)}`);
}

/* A6 ★边界：硬性要求区（tail）的逗号也豁免；anchor（起手式，画面开始之前）照旧计数 */
{
  const T = ['起手，式', '画面开始：', '正文，甲', '硬性要求：尾，部'].join('\n');
  const a6 = await evalJS(`(() => {
    var v = ${JSON.stringify(T)};
    var map = structMap(v);
    var fam = hlClassify(v, structExemptMask(v));
    var c = 0; for(var i=0;i<fam.length;i++) if(fam[i]==='err') c++;
    var fn = hlClassify(v), cn = 0; for(var j=0;j<fn.length;j++) if(fn[j]==='err') cn++;
    return { regions: map.map(function(m){ return m.region; }), mask: c, noMask: cn };
  })()`);
  t('A6 ★边界：硬性要求区（tail）的「，」豁免、起手式（anchor）的「，」照旧计数；掩码后错误=2（anchor 1 + body 1）、不传掩码=3（含 tail 1）；structMap 区判定 = anchor/body/body/tail',
    eq(a6.regions, ['anchor', 'body', 'body', 'tail']) && a6.mask === 2 && a6.noMask === 3,
    `区=${JSON.stringify(a6.regions)}；掩码后=${a6.mask}（期望 2）/ 不传=${a6.noMask}（期望 3）`);
}

/* A7 ★边界：只有「风格：」无「硬性要求：」→ 风格区延到块尾（全豁免）；「风格：」出现**行中间**（非行首）不被误判 */
{
  const T_ONLY = '风格：\n【甲】内容，甲\n【乙】内容，乙';       /* 无 硬性要求 → style 延到块尾 */
  const T_MID = '这是风格：在行中间，逗号';                     /* 行首非「风格：」→ 不误判（anchor） */
  const a7 = await evalJS(`(() => {
    var t1 = ${JSON.stringify(T_ONLY)}, t2 = ${JSON.stringify(T_MID)};
    var c = function(v, mk){ var f = mk ? hlClassify(v, structExemptMask(v)) : hlClassify(v); var n=0; for(var i=0;i<f.length;i++) if(f[i]==='err') n++; return n; };
    return {
      onlyMask: c(t1, true), onlyNoMask: c(t1, false),
      midMask: c(t2, true), midNoMask: c(t2, false),
      midRegion: structMap(t2)[0].region, onlyRegions: structMap(t1).map(function(m){ return m.region; })
    };
  })()`);
  t('A7 ★边界：只有「风格：」（无「硬性要求：」）→ 风格区延至块尾全豁免（掩码后 0 / 不传 2）；「风格：」出现在行中间（非行首）不被误判为风格区（region=anchor，逗号照旧计数 掩码后 1=不传 1）',
    a7.onlyMask === 0 && a7.onlyNoMask === 2 && eq(a7.onlyRegions, ['style', 'style', 'style'])
    && a7.midRegion === 'anchor' && a7.midMask === 1 && a7.midNoMask === 1,
    `仅风格：区=${JSON.stringify(a7.onlyRegions)} 掩码后=${a7.onlyMask}/不传=${a7.onlyNoMask}；行中间风格：region=${a7.midRegion} 掩码后=${a7.midMask}/不传=${a7.midNoMask}`);
}

/* A8 ★边界：空文本、纯空行 → 掩码长度 0、错误 0、不崩；超长文本掩码长度**精确等长**（无越界）；
   「风格：，」（冒号与逗号同行）整行豁免 */
{
  const LONG = '风格：\n' + new Array(41).join('内容，甲\n');   /* 40 行风格续行 */
  const a8 = await evalJS(`(() => {
    var c = function(v){ var f = hlClassify(v, structExemptMask(v)); var n=0; for(var i=0;i<f.length;i++) if(f[i]==='err') n++; return n; };
    var m0 = structExemptMask('');
    var longTxt = ${JSON.stringify(LONG)};
    var mL = structExemptMask(longTxt);
    var sameLine = '风格：，';
    return {
      emptyLen: m0.length, emptyErrs: c(''), blankErrs: c('\\n\\n\\n'),
      longMaskLen: mL.length, longTxtLen: longTxt.length, longErrs: c(longTxt),
      sameLineErrs: c(sameLine), sameLineUnmasked: (function(){ var f=hlClassify(sameLine); var n=0; for(var i=0;i<f.length;i++) if(f[i]==='err') n++; return n; })()
    };
  })()`);
  t('A8 ★边界：空文本/纯空行 → 掩码长度 0、错误 0（不崩）；超长文本掩码长度精确等长（40 行风格续行全部豁免 → 掩码后 0）；「风格：，」整行豁免（掩码后 0 / 不传 1）',
    a8.emptyLen === 0 && a8.emptyErrs === 0 && a8.blankErrs === 0
    && a8.longMaskLen === a8.longTxtLen && a8.longErrs === 0
    && a8.sameLineErrs === 0 && a8.sameLineUnmasked === 1,
    `空=${a8.emptyLen}/${a8.emptyErrs}；纯空行错误=${a8.blankErrs}；长文本掩码长=${a8.longMaskLen}=文本长${a8.longTxtLen}，掩码后错误=${a8.longErrs}；风格：，掩码后=${a8.sameLineErrs}/不传=${a8.sameLineUnmasked}`);
}

/* ════════════════════════════ B 组 · 「未用过」动态徽章 ════════════════════════════ */

const UNUSED = '未用过';
const L_PUSH = '推镜（你没用过）', L_ORBIT = '环绕（你没用过）', L_FOLLOW = '跟拍（你没用过）';

/* B1 初始（用户文本无相关词）→ 镜头句组「推镜」条目徽章 = 未用过（真读 .cmpl-note） */
{
  await cset([{ id: 'b1', text: '' }]);
  await evalJS('__resetCmpl()');
  await openEditor('');
  await evalJS('__trig("")');
  await evalJS('__enter("镜头句")');
  const b1 = await evalJS(`({ push: __badge(${JSON.stringify(L_PUSH)}), orbit: __badge(${JSON.stringify(L_ORBIT)}), follow: __badge(${JSON.stringify(L_FOLLOW)}), group: cmplGroup, n: cmplItems.length })`);
  t('B1 初始（用户文本无相关词）：镜头句组「推镜」条目徽章文本 =「未用过」（真读渲染后 .cmpl-note）；同组「环绕」「跟拍」同为「未用过」',
    b1.push === UNUSED && b1.orbit === UNUSED && b1.follow === UNUSED && b1.group === '镜头句',
    `推镜=${JSON.stringify(b1.push)} 环绕=${JSON.stringify(b1.orbit)} 跟拍=${JSON.stringify(b1.follow)}；组=${b1.group} 条数=${b1.n}`);
}

/* B2 写入 needle（用户文本出现「镜头缓慢推进」）→ 重新触发候选 → 「推镜」徽章消失 */
{
  await evalJS('__setTruth("镜头缓慢推进")');
  await evalJS('__trig("")');
  await evalJS('__enter("镜头句")');
  const b2 = await evalJS(`({ push: __badge(${JSON.stringify(L_PUSH)}) })`);
  t('B2 写入 needle（用户文本含「镜头缓慢推进」）→ 重新触发候选 → 「推镜」条目徽章消失（.cmpl-note 不存在 → 读回 null）',
    b2.push === null,
    `推镜徽章=${JSON.stringify(b2.push)}（期望 null = 无 .cmpl-note）`);
}

/* B3 ★反面对照：同期「环绕」「跟拍」的「未用过」徽章仍在（防「一刀切全隐藏」） */
{
  await evalJS('__trig("")');
  await evalJS('__enter("镜头句")');
  const b3 = await evalJS(`({ orbit: __badge(${JSON.stringify(L_ORBIT)}), follow: __badge(${JSON.stringify(L_FOLLOW)}), push: __badge(${JSON.stringify(L_PUSH)}) })`);
  t('B3 ★反面对照：「镜头缓慢推进」只让「推镜」徽章消失；同组「环绕」「跟拍」的「未用过」徽章仍在（证明不是一刀切全隐藏）',
    b3.orbit === UNUSED && b3.follow === UNUSED && b3.push === null,
    `环绕=${JSON.stringify(b3.orbit)} 跟拍=${JSON.stringify(b3.follow)} 推镜=${JSON.stringify(b3.push)}`);
}

/* B4 其它 note 值永远静态：自定义 note「项目级定型件」「141 句的语法槽位」不受 needle 影响（真读文本）
   ※ 说明：语料里这两个是**组级** note（cmplSeedItems 只搬运 item.note，UI 只渲染 item.note）；
     故此处用带相同 note 的**自建条目**验证「非『未用过』的 note 绝不走动态」。 */
{
  await evalJS('__noteItems()');
  await evalJS('__setTruth("特别标记甲乙丙丁 与 另一句标记戊己庚 都在文本里")');   /* 两条 needle 都出现 */
  await evalJS('__trig("")');
  await evalJS('__enter("G")');
  const b4 = await evalJS(`({ a: __badge('甲条'), b: __badge('乙条') })`);
  t('B4 其它 note 值不受影响（永远静态）：自建条目 note=「项目级定型件」/「141 句的语法槽位」，即便其 body（needle）已出现在用户文本 → 徽章仍原样显示（只有 note===「未用过」才走动态）',
    b4.a === '项目级定型件' && b4.b === '141 句的语法槽位',
    `甲条 note=${JSON.stringify(b4.a)} 乙条 note=${JSON.stringify(b4.b)}`);
}

/* B5 ★失效链路：写入 needle（经**写作台真实输入路径** wdOnInput 失效）→ 切视图 → 回来徽章为「最新」；
   再清除文本 → 徽章**复原**（证明失效真的接通，不是只有首次对） */
{
  await cset([{ id: 'b5', text: '' }]);
  await evalJS('__resetCmpl()');
  await evalJS("setView('write'); renderWrite(); wdSelect(0); focusDeskEditor(); 1");
  await type('镜头缓慢推进');                                    /* 真实输入 → wdOnInput → cmplUseInvalidate */
  await sleep(140);
  const truthAfterType = await evalJS('state.blocks[0].text');
  await evalJS("setView('canvas'); 1"); await sleep(200);         /* 切视图（也会失效） */
  await openEditor('');
  await evalJS('__trig("")');
  await evalJS('__enter("镜头句")');
  const afterAdd = await evalJS(`({ push: __badge(${JSON.stringify(L_PUSH)}), orbit: __badge(${JSON.stringify(L_ORBIT)}) })`);
  /* 反向：清空写作台文本（真实 input 事件）→ 徽章应复原 */
  await evalJS("setView('write'); renderWrite(); wdSelect(0); 1");
  await evalJS("(() => { var ta=hostDesk.el('ta'); ta.focus(); ta.value=''; ta.setSelectionRange(0,0); ta.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
  await sleep(140);
  const truthAfterClear = await evalJS('state.blocks[0].text');
  await evalJS("setView('canvas'); 1"); await sleep(200);
  await openEditor('');
  await evalJS('__trig("")');
  await evalJS('__enter("镜头句")');
  const afterClear = await evalJS(`({ push: __badge(${JSON.stringify(L_PUSH)}), orbit: __badge(${JSON.stringify(L_ORBIT)}) })`);
  t('B5 ★失效链路：写作台真实输入「镜头缓慢推进」（走 wdOnInput→cmplUseInvalidate）→ 切视图 → 回候选「推镜」徽章消失；再清空文本（真实 input 事件）→ 切视图 → 徽章**复原**（徽章始终反映最新用户文本，非只首次对）',
    truthAfterType === '镜头缓慢推进' && afterAdd.push === null && afterAdd.orbit === UNUSED
    && truthAfterClear === '' && afterClear.push === UNUSED && afterClear.orbit === UNUSED,
    `输入后 blocks[0]=${JSON.stringify(truthAfterType)} → 推镜=${JSON.stringify(afterAdd.push)}/环绕=${JSON.stringify(afterAdd.orbit)}；清空后 blocks[0]=${JSON.stringify(truthAfterClear)} → 推镜=${JSON.stringify(afterClear.push)}/环绕=${JSON.stringify(afterClear.orbit)}`);
}

/* B6 note 字段永不被改写：动态只影响渲染，cmplActive() 里该条目 note 仍严格 === '未用过' */
{
  await cset([{ id: 'b6', text: '' }]);
  await evalJS('__resetCmpl()');
  const b6a = await evalJS(`(() => { var it=cmplActive().filter(function(x){ return x.label===${JSON.stringify(L_PUSH)}; })[0]; return { note: it?it.note:null, body: it?it.body:null }; })()`);
  await evalJS('__setTruth("镜头缓慢推进")');                    /* 让渲染走「消失」分支 */
  await openEditor('');
  await evalJS('__trig("")'); await evalJS('__enter("镜头句")');
  const b6b = await evalJS(`(() => {
    var it=cmplActive().filter(function(x){ return x.label===${JSON.stringify(L_PUSH)}; })[0];
    return { note: it?it.note:null, rendered: __badge(${JSON.stringify(L_PUSH)}), noteFor: cmplNoteFor(it) };
  })()`);
  t('B6 note 字段永不被改写：写入 needle 后（渲染徽章消失）→ cmplActive() 里「推镜」条目 note 仍严格 ===「未用过」（动态只影响渲染出的 cmplNoteFor，不改数据）',
    b6a.note === UNUSED && b6b.note === UNUSED && b6b.rendered === null && b6b.noteFor === '',
    `初始 note=${JSON.stringify(b6a.note)}；写 needle 后 note=${JSON.stringify(b6b.note)}（数据不变）/ 渲染徽章=${JSON.stringify(b6b.rendered)} / cmplNoteFor=${JSON.stringify(b6b.noteFor)}`);
}

/* B7 边界：needle 为空（条目 body 全是 ASCII/符号）→ 保守（永不「用过」，徽章保留） */
{
  await evalJS('__asciiItem()');
  const needleVal = await evalJS(`cmplNeedle('push-in shot 100%')`);
  await evalJS('__setTruth("push-in shot 100% 原样出现在用户文本里")');   /* 用户文本含整条 body，但 needle 为空 → 不应判「用过」 */
  await evalJS('__trig("")'); await evalJS('__enter("G2")');
  const b7 = await evalJS(`({ badge: __badge('ASCII条') })`);
  t('B7 边界：body 全 ASCII/符号 → needle 抽为空串 → 保守视为「从未用过」（永不命中），即便整条 body 原样出现在用户文本 → 徽章仍保留「未用过」',
    needleVal === '' && b7.badge === UNUSED,
    `needle=${JSON.stringify(needleVal)}（期望空串）；徽章=${JSON.stringify(b7.badge)}`);
}

/* B8 边界：图片块（type:'image'）**不计入**「用户文本」→ 其中的 needle 不使徽章消失 */
{
  await evalJS('__resetCmpl()');
  await cset([{ id: 'img', type: 'image', text: '镜头缓慢推进' }, { id: 'txt', text: '' }]);
  const truthHasNeedle = await evalJS(`(cmplUsedText().indexOf('镜头缓慢推进') >= 0)`);
  await openEditor('');
  await evalJS('__trig("")'); await evalJS('__enter("镜头句")');
  const b8 = await evalJS(`({ push: __badge(${JSON.stringify(L_PUSH)}) })`);
  t('B8 边界：图片块（type:image）不计入「用户文本」→ 图片块 text 里的 needle 不进入判定，徽章不被误消失（真读 cmplUsedText 与渲染徽章）',
    truthHasNeedle === false && b8.push === UNUSED,
    `用户文本含 needle=${truthHasNeedle}（期望 false）；推镜徽章=${JSON.stringify(b8.push)}`);
}

/* ════════════════════════════ D 组 · 「最近使用」加权（仅查询视图）════════════════════════════ */

/* D1 上屏某条目 2 次 → 真读 state.cmpl.use：存在对应 hkey 且 n===2、t 为合理时间戳 */
{
  await evalJS('__resetCmpl()');
  await openEditor('');
  /* ★ flake 修复（2026-09-19）：时间基准必须与 d1.t **同源**——
     d1.t 由**浏览器进程**内 cmplUseTouch 写 `Date.now()`；此前 before/after 却取自 **node 进程** `Date.now()`，
     两进程时钟 1ms 级偏差即越界（区间容差 = 0）→ 实测约 1/5 概率 D1 假红（越界恰好 +1ms）。
     改为在**浏览器侧**取 before/after（与 d1.t 同进程、同源、单调）→ `before ≤ d1.t ≤ after` 必然成立，flake 消失。
     ★ 不放大容差（那会弱化语义）；判定式与条数保持不变。 */
  const before = await evalJS('Date.now()');
  await evalJS('__commit("运镜","摇")');
  await evalJS('__commit("运镜","摇")');
  const after = await evalJS('Date.now()');
  const d1 = await evalJS(`__useOf("运镜","摇")`);
  t('D1 只在真正上屏时记录：同一「运镜/摇」条目经真实 cmplCommit 上屏 2 次 → state.cmpl.use[内容hkey].n === 2、t 为合理毫秒时间戳（介于测试起止之间）',
    d1 && d1.n === 2 && typeof d1.t === 'number' && d1.t >= before && d1.t <= after && /^h[0-9a-f]{8}$/.test(d1.key),
    `hkey=${d1 && d1.key} n=${d1 && d1.n}（期望 2） t=${d1 && d1.t}（区间 ${before}~${after}）`);
}

/* D2 ★hkey 是内容派生（不是位置 key）：同条目两次 key 相同；且 hkey !== it.key（'b:gi:ii' 位置 key） */
{
  const d2 = await evalJS(`(() => {
    var it = __it('运镜','摇');
    var k1 = cmplUseKey(it), k2 = cmplUseKey(cmplActive().filter(function(x){ return x.group==='运镜' && x.body==='摇'; })[0]);
    var it2 = __it('运镜','切镜');
    var k3 = cmplUseKey(it2);
    var same = cmplUseKey({ group:'运镜', label: it.label, body:'摇' });
    return { k1:k1, k2:k2, posKey: it.key, k3:k3, same: same, isH: /^h[0-9a-f]{8}$/.test(k1) };
  })()`);
  t('D2 ★hkey 内容派生：同一条目两次取 key 相同；hkey（h+8位hex）与 it.key（b:gi:ii **位置** key）不同；不同内容条目 key 不同；同内容（group/label/body）派生同 key',
    d2.k1 === d2.k2 && d2.k1 === d2.same && d2.isH && d2.posKey !== d2.k1 && /^b:\d+:\d+$/.test(d2.posKey) && d2.k3 !== d2.k1,
    `hkey(同条两次)=${d2.k1}/${d2.k2}；位置 key=${JSON.stringify(d2.posKey)}；另条 hkey=${d2.k3}；同内容=${d2.same}`);
}

/* D3 ★对照组（组内视图不许被改）：进 风格包 组 → 首条仍是「风格包 · 全套」；再上屏某风格段多次 → 组内首条不得变化 */
{
  await evalJS('__resetCmpl()');
  await openEditor('');
  await evalJS('__trig("")'); await evalJS('__enter("风格包")');
  const domFirstBefore = await evalJS(`(() => { var r=document.querySelector('#cmplPop .cmpl-item .cmpl-label'); return r?r.textContent:null; })()`);
  const buildFirstBefore = await evalJS(`cmplBuildGroupItems('风格包')[0].label`);
  const styleBody = await evalJS(`__styleBody('光影逻辑')`);
  /* 上屏「光影逻辑」风格段 5 次（制造 use 加权） */
  for (let i = 0; i < 5; i++) await evalJS('__commit("风格包",' + JSON.stringify(styleBody) + ')');
  await evalJS('__trig("")'); await evalJS('__enter("风格包")');
  const domFirstAfter = await evalJS(`(() => { var r=document.querySelector('#cmplPop .cmpl-item .cmpl-label'); return r?r.textContent:null; })()`);
  const buildFirstAfter = await evalJS(`cmplBuildGroupItems('风格包')[0].label`);
  const usedStyle = await evalJS(`__useOf('风格包', ${JSON.stringify(styleBody)})`);
  t('D3 ★对照组（组内视图不许被改，守 H7 语义）：进「风格包」组首条 = 「风格包 · 全套」；再把「光影逻辑」段上屏 5 次（已记 use）→ 组内首条**仍**为「风格包 · 全套」（DOM + cmplBuildGroupItems 两处真读）',
    domFirstBefore === '风格包 · 全套' && buildFirstBefore === '风格包 · 全套'
    && domFirstAfter === '风格包 · 全套' && buildFirstAfter === '风格包 · 全套'
    && usedStyle && usedStyle.n === 5,
    `上屏前 首条=${JSON.stringify(domFirstBefore)}/${JSON.stringify(buildFirstBefore)}；上屏 5 次后 首条=${JSON.stringify(domFirstAfter)}/${JSON.stringify(buildFirstAfter)}；该风格段 use.n=${usedStyle && usedStyle.n}`);
}

/* D4 查询视图：两条 score 相同的候选 → 对其中一条 cmplUseTouch 若干次 → 重新查询 → 该条排前（真读渲染 DOM 顺序） */
{
  await evalJS('__mkPair()');
  await openEditor('');
  await evalJS('__trig("aaa")');                                    /* 查询 'aaa' → 两条 score 均 = 2（正文命中） */
  const beforeDom = await evalJS(`__labels()`);
  const scoresBefore = await evalJS(`cmplBuild('aaa','anchor').map(function(x){ return [x.label, x.score, x.useW]; })`);
  /* 对「乙候选」cmplUseTouch 3 次 */
  const touched = await evalJS(`(() => { var it=__it('GP','aaa乙内容'); cmplUseTouch(it); cmplUseTouch(it); cmplUseTouch(it); return cmplUseW(it); })()`);
  await evalJS('__trig("aaa")');                                    /* 重新查询（会 cmplUseInvalidate + 重算 useW） */
  const afterDom = await evalJS(`__labels()`);
  const scoresAfter = await evalJS(`cmplBuild('aaa','anchor').map(function(x){ return [x.label, x.score, x.useW]; })`);
  t('D4 查询视图加权（score 相等时次级键）：构造两条 score 相同的候选（同为正文命中）；对「乙候选」记使用 3 次 → 重新查询 → 「乙候选」排到第一（真读渲染 DOM 顺序 + score/useW）',
    eq(beforeDom, ['甲候选', '乙候选'])
    && afterDom[0] === '乙候选'
    && scoresBefore.length === 2 && scoresBefore.every(function(x){ return x[1] === 2; })
    && scoresAfter.length === 2 && scoresAfter[0][1] === scoresAfter[1][1] && scoresAfter[0][2] > scoresAfter[1][2] && touched > 0,
    `查询前顺序=${JSON.stringify(beforeDom)}（score/useW=${JSON.stringify(scoresBefore)}）；touch 后顺序=${JSON.stringify(afterDom)}（score/useW=${JSON.stringify(scoresAfter)}）；touch useW=${touched}`);
}

/* D5 持久化零丢失：上屏后落盘 → migrate 回读 n 仍在；再**真实 reload** → state.cmpl.use 仍在（version 17 + migrate 保留 use） */
{
  await evalJS('__resetCmpl()');
  await openEditor('');
  await evalJS('__commit("运镜","摇")');
  await evalJS('__commit("运镜","摇")');
  const d5m = await evalJS(`(() => {
    var it=__it('运镜','摇'); var k=cmplUseKey(it);
    saveNow();
    var raw = JSON.parse(localStorage.getItem(LS_KEY));
    var m = migrate(raw);
    return { hkey:k, memN: state.cmpl.use[k] ? state.cmpl.use[k].n : null, migN: m.cmpl.use[k] ? m.cmpl.use[k].n : null, version: m.version, lsHas: !!(raw.cmpl && raw.cmpl.use && raw.cmpl.use[k]) };
  })()`);
  /* 真实 reload（暂时摘除清 LS 脚本 → 数据须仍在） */
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  const d5reload = await evalJS(`(() => { var u=state.cmpl && state.cmpl.use; var k=Object.keys(u||{})[0]; return { n: k?u[k].n:null, keyCount: Object.keys(u||{}).length, version: state.version }; })()`);
  t('D5 持久化零丢失：上屏 2 次 → 内存 n=2、localStorage 含 hkey、migrate 回读 n=2、version=17；**真实 reload** 后 state.cmpl.use 仍在（n=2）且 version=17',
    d5m.memN === 2 && d5m.migN === 2 && d5m.version === 17 && d5m.lsHas
    && d5reload.n === 2 && d5reload.version === 17,
    `内存 n=${d5m.memN} / localStorage 含键=${d5m.lsHas} / migrate n=${d5m.migN}（version=${d5m.version}）；reload 后 use.n=${d5reload.n}（键数=${d5reload.keyCount}，version=${d5reload.version}）`);
  /* reload 会摧毁页内注入的助手 → 重新安装（后续 D6/D7/D8 与 H 组依赖） */
  await installHelpers();
}

/* D6 不计噪声：仅进组 / 仅查询输入 / 仅上下移动选择（未上屏）→ use 不变 */
{
  await evalJS('__resetCmpl()');
  await openEditor('');
  await evalJS('__trig("")'); await evalJS('__enter("运镜")');       /* 仅进组 */
  await evalJS('cmplMoveSel(1); cmplMoveSel(1); cmplMoveSel(-1);');   /* 仅移动选择 */
  await evalJS('__trig("摇")');                                       /* 仅查询输入 */
  const keysAfterNoise = await evalJS(`Object.keys(state.cmpl.use || {}).length`);
  await evalJS('cmplMoveSel(1)');
  const keysAfterMove = await evalJS(`Object.keys(state.cmpl.use || {}).length`);
  t('D6 不计噪声：仅进组 / 仅查询输入 / 仅上下移动选择（均未上屏）→ state.cmpl.use 不新增任何键（进组、查询、浏览都不算「重复劳动」）',
    keysAfterNoise === 0 && keysAfterMove === 0,
    `噪声操作后 use 键数=${keysAfterNoise}；再移动选择后=${keysAfterMove}（期望 0）`);
}

/* D7 边界：use 脏数据（n 负数/0/字符串、t 缺失/非法、__proto__）→ migrate 正确清洗且不崩 */
{
  const d7 = await evalJS(`(() => {
    var dirty = {
      app:'storyboard-prompt-panel', version:15, blocks:[{ id:'z', text:'x' }],
      cmpl: { v:1, items:null, gorder:null, use: {
        neg:{ n:-3, t:1 }, zero:{ n:0, t:1 }, str:{ n:'5', t:1 }, noT:{ n:2 }, badT:{ n:3, t:'oops' }, ok:{ n:4, t:99 }, __proto__:{ n:9 }
      } }
    };
    var m = migrate(dirty);
    return { version: m.version, keys: Object.keys(m.cmpl.use).sort(), noT: m.cmpl.use.noT, badT: m.cmpl.use.badT, ok: m.cmpl.use.ok, protoPolluted: ({}).n ? true : false };
  })()`);
  t('D7 ★边界（脏数据清洗）：use 里 n<=0 / n 为字符串 → 丢弃；t 缺失或非数字 → 回落 0；合法项保留；跳过 __proto__（原型未被污染）；version=17、不崩',
    d7.version === 17 && eq(d7.keys, ['badT', 'noT', 'ok'])
    && eq(d7.noT, { n: 2, t: 0 }) && eq(d7.badT, { n: 3, t: 0 }) && eq(d7.ok, { n: 4, t: 99 }) && d7.protoPolluted === false,
    `version=${d7.version}；保留键=${JSON.stringify(d7.keys)}；noT=${JSON.stringify(d7.noT)} badT=${JSON.stringify(d7.badT)} ok=${JSON.stringify(d7.ok)}；原型污染=${d7.protoPolluted}`);
}

/* D8 边界：未物化片段库（items===null）时 use 仍能记、且落盘经 migrate 保留 */
{
  const d8 = await evalJS(`(() => {
    state.cmpl = { v: CMPL_SEED_V, items: null, gorder: null, use: {} };
    cmplInvalidate();
    var it = __it('运镜','摇');            /* items=null → cmplActive() 回落内置 seed */
    cmplUseTouch(it); cmplUseTouch(it);
    var k = cmplUseKey(it);
    saveNow();
    var m = migrate(JSON.parse(localStorage.getItem(LS_KEY)));
    return { itemsNull: state.cmpl.items === null, activeLen: cmplActive().length, memN: state.cmpl.use[k] ? state.cmpl.use[k].n : null, migN: m.cmpl.use[k] ? m.cmpl.use[k].n : null, migItemsNull: m.cmpl.items === null };
  })()`);
  t('D8 ★边界：片段库未物化（items===null）时，use 仍能正常记录（cmplActive 回落内置 seed）→ 内存 n=2；落盘经 migrate 后 n=2 仍在（items 仍 null、use 保留 → 不丢「未物化就用」的会话数据）',
    d8.itemsNull && d8.memN === 2 && d8.migN === 2 && d8.migItemsNull,
    `items=null=${d8.itemsNull}（cmplActive=${d8.activeLen}）；内存 n=${d8.memN}；migrate n=${d8.migN}（items 仍 null=${d8.migItemsNull}）`);
}

/* ════════════════════════════ H 组 · 语料体检（MVP）════════════════════════════ */

const DUP_SENT = '这是一句反复手打的重复句内容。';   /* len 16，跨块 2 次 */
const SHORT7 = '恰好七个字的行';                      /* len 7 < 8 → 排除 */
const DUP8 = '恰好八个字的句子';                      /* len 8，跨块 2 次 → 入选 */
const ONCE9 = '只出现一次的句子呀';                   /* len 9，仅 1 次 → 排除 */

/* H1 注入已知重复句 → 打开体检 → 列表含该句且频次正确 */
{
  await evalJS('__resetCmpl()');
  await cset([
    { id: 'd1', text: DUP_SENT + '\n' + SHORT7 + '\n' + DUP8 + '\n' + ONCE9 },
    { id: 'd2', text: DUP_SENT + '\n' + SHORT7 + '\n' + DUP8 }
  ]);
  await evalJS('__openCheck()');
  /* H1 用真实点击入口按钮也验一遍 UI 可观察性 */
  await evalJS('openCmplCfg(); 1');                     /* 复位到 lib */
  await click('#cmplCfgCheck');
  const viewAfterClick = await evalJS('cmplCfgView');
  const dups = await evalJS('cmplCheckDup()');
  const domTexts = await evalJS('__checkTexts()');
  const domCounts = await evalJS('__checkDupCounts()');
  const hit = dups.filter(function(x){ return x.text === DUP_SENT; })[0];
  const hit8 = dups.filter(function(x){ return x.text === DUP8; })[0];
  t('H1 重复句发现：注入跨块出现 2 次的长句（len≥8）→ 点「语料体检」入口 → cmplCfgView=check、列表含该句且频次 =×2（DOM 真读 + cmplCheckDup 双证）',
    viewAfterClick === 'check' && !!hit && hit.count === 2 && !!hit8 && hit8.count === 2
    && domTexts.indexOf(DUP_SENT) >= 0 && domCounts[DUP_SENT] === '×2',
    `视图=${viewAfterClick}；cmplCheckDup=${JSON.stringify(dups)}；DOM 文案=${JSON.stringify(domTexts)}；DOM 频次=${JSON.stringify(domCounts)}`);
}

/* H2 已在片段库中的句子（风格段）不得出现在重复句列表 */
{
  const styleBody = await evalJS(`__styleBody('光影逻辑')`);
  await cset([
    { id: 's1', text: styleBody },
    { id: 's2', text: styleBody }
  ]);
  const dups = await evalJS('cmplCheckDup()');
  const inList = dups.some(function(x){ return x.text === styleBody; });
  t('H2 已在片段库中的句子不得出现：把「风格包·光影逻辑」段（已在生效表）跨块放 2 次 → 重复句列表**不含**它（按 cmplActive body 集合排除；真读列表文本）',
    !inList && !!styleBody && styleBody.length >= 8 && dups.length === 0,
    `风格段已在库=${!!styleBody}（len=${styleBody ? styleBody.length : -1}）；入列=${inList}；列表=${JSON.stringify(dups.map(function(x){ return x.text.slice(0, 10); }))}`);
}

/* H3 缺陷对照：len<8 的短行、只出现 1 次的行 → 不得出现（★自带夹具，防「空列表真空通过」） */
{
  await cset([
    { id: 'k1', text: SHORT7 + '\n' + DUP8 + '\n' + ONCE9 },
    { id: 'k2', text: SHORT7 + '\n' + DUP8 }
  ]);
  const dups = await evalJS('cmplCheckDup()');
  const hasShort = dups.some(function(x){ return x.text === SHORT7; });
  const hasOnce = dups.some(function(x){ return x.text === ONCE9; });
  const hit8 = dups.filter(function(x){ return x.text === DUP8; })[0];
  t('H3 缺陷对照（判据边界）：自带夹具（短行 len7 出现 2 次 / len8 出现 2 次 / 单次行 len9）→ len<8 的短行与仅出现 1 次的行**都不入列**，而 len=8 的「恰好八个字的句子」入列（证明边界恰在 8，且列表非空 → 非真空通过）',
    !hasShort && !hasOnce && !!hit8 && hit8.count === 2,
    `短行(len7)入列=${hasShort}；单次行(len9)入列=${hasOnce}；len8 入列=${!!hit8}(${hit8 ? '×' + hit8.count : '-'})；列表=${JSON.stringify(dups.map(function(x){ return [x.text, x.count]; }))}`);
}

/* H4 风格包漂移：与定型件不一致的块计 M；完全一致的块不计入；报告计数正确 */
{
  const built = await evalJS(`(() => {
    var ref = cmplFullStyle();                     /* = cmplStyleRef() */
    var lines = ref.split('\\n');
    var bad = lines.slice(0, 3).concat(lines.slice(4)).join('\\n');   /* 删掉一条风格段 → 不一致 */
    state.blocks = [
      { id:'ok', text: ref, x:0, y:0 },
      { id:'bad', text: bad, x:0, y:100 },
      { id:'none', text: '没有风格包的一段正文', x:0, y:200 }
    ];
    return { refLen: ref.length, badLen: bad.length, sameAsRef: cmplStyleSame(cmplStyleSegment(ref), ref) };
  })()`);
  await evalJS('__openCheck()');
  const drift = await evalJS('cmplCheckStyleDrift()');
  const capText = await evalJS(`(document.querySelector('#cmplCfgBody .cmpl-check-cap')||{}).textContent`);
  /* 只数「漂移卡」（含 .cmpl-check-diff 的卡），不与重复句卡混计 */
  const driftCards = await evalJS(`document.querySelectorAll('#cmplCfgBody .cmpl-check-diff').length`);
  const diffText = await evalJS(`(document.querySelector('#cmplCfgBody .cmpl-check-diff')||{}).textContent`);
  t('H4 风格包漂移：构造「含 风格： 但缺 1 段」的块 + 「逐字一致」的块 → cmplCheckStyleDrift: total=2 / bad=1；DOM 报告「共 2 条含风格包，1 条与定型件不一致」+ 差异摘要「缺 1 段」（完全一致的块不计入）',
    drift.total === 2 && drift.bad === 1 && drift.items.length === 1 && built.sameAsRef === true
    && typeof capText === 'string' && capText.indexOf('共 2 条含风格包') >= 0 && capText.indexOf('1 条与定型件不一致') >= 0
    && driftCards === 1 && typeof diffText === 'string' && diffText.indexOf('缺 1 段') >= 0,
    `total=${drift.total} bad=${drift.bad}（items=${drift.items.length}，一致块自比=${built.sameAsRef}）；cap=「${capText}」；漂移卡=${driftCards}；差异=「${diffText}」`);
}

/* H5 「收进片段库」→ 真读 state.cmpl.items：真加了一条（body=该句、group=所选组）且落盘 */
{
  await evalJS('__resetCmpl()');
  await cset([{ id: 'r1', text: DUP_SENT }, { id: 'r2', text: DUP_SENT }]);
  await evalJS('__openCheck()');
  const itemsBefore = await evalJS('cmplActive().length');
  /* 选组 = 镜头句，然后点该行的「收进片段库」按钮（真机鼠标点击） */
  const rect = await evalJS(`__dupCardRect(${JSON.stringify(DUP_SENT)}, '镜头句')`);
  if (rect) await clickAt(rect.x, rect.y);
  const after = await evalJS(`(() => {
    var items = cmplActive();
    var added = items.filter(function(x){ return x.body === ${JSON.stringify(DUP_SENT)} && (x.group||'') === '镜头句'; })[0];
    var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
    var lsHas = !!(ls && ls.cmpl && Array.isArray(ls.cmpl.items) && ls.cmpl.items.some(function(x){ return x.body === ${JSON.stringify(DUP_SENT)} && x.group === '镜头句'; }));
    return { n: items.length, has: !!added, added: added || null, lsHas: lsHas };
  })()`);
  t('H5 唯一动作「收进片段库」：在体检视图点该重复句的按钮（组=镜头句）→ state.cmpl.items 真加一条（body=该句、group=镜头句、src=user）且 localStorage 已落盘',
    thenOk(rect, after, itemsBefore, DUP_SENT),
    `按钮命中=${!!rect}${rect ? '(sel=' + rect.selVal + ')' : ''}；items ${itemsBefore}→${after.n}；新增=${JSON.stringify(after.added && { body: after.added.body.slice(0, 12), group: after.added.group, src: after.added.src, label: after.added.label })}；落盘=${after.lsHas}`);
}

function thenOk(rect, after, itemsBefore, body) {
  return !!rect && rect.selVal === '镜头句' && after.n === itemsBefore + 1 && after.has
    && !!after.added && after.added.body === body && after.added.group === '镜头句' && after.added.src === 'user' && after.lsHas;
}

/* H6 ★入口复位：配置窗每次打开默认仍是**片段库**视图（守既有 I1/I2 口径） */
{
  await evalJS("cmplCfgView='check'; 1");                    /* 故意留在体检视图 */
  const view1 = await evalJS('__openLib()');
  const dom1 = await evalJS(`({ checkCards: document.querySelectorAll('#cmplCfgBody .cmpl-check-card').length, cfgCards: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card').length, btnText: (document.getElementById('cmplCfgCheck')||{}).textContent, hint: !!document.querySelector('#cmplCfgBody .cmpl-cfg-hint'), search: !!document.getElementById('cmplCfgSearch') })`);
  await evalJS("cmplCfgView='check'; closeCmplCfg(); 1");
  const view2 = await evalJS('__openLib()');
  t('H6 ★入口复位：把 cmplCfgView 置为 "check" 后重新 openCmplCfg()（两次）→ 每次都复位回 "lib"（DOM 无体检卡、有片段库卡与提示、按钮文案回落「语料体检」）——守住既有 I1/I2 看到的仍是库视图',
    view1 === 'lib' && view2 === 'lib' && dom1.checkCards === 0 && dom1.cfgCards > 0 && dom1.btnText === '语料体检' && dom1.hint && dom1.search,
    `两次打开 view=${view1}/${view2}；DOM check卡=${dom1.checkCards} cfg卡=${dom1.cfgCards} 按钮=「${dom1.btnText}」 hint=${dom1.hint} search=${dom1.search}`);
}

/* H7 体检视图只读性：进入体检不得改变 state.blocks 或 state.cmpl（除非用户点「收进片段库」） */
{
  await evalJS('__openLib()');                                /* 先物化（items: null → seed） */
  const before = await evalJS(`JSON.stringify({ blocks: state.blocks, cmpl: state.cmpl })`);
  await evalJS("cmplCfgView='check'; renderCmplCfg(); 1");
  await sleep(60);
  const after = await evalJS(`JSON.stringify({ blocks: state.blocks, cmpl: state.cmpl })`);
  t('H7 体检视图只读性：进入体检（renderCmplCfg 走 cmplCheckRender）前后，state.blocks 与 state.cmpl（含 use）**逐字不变**（体检本身不写状态，只有「收进片段库」才写）',
    before === after,
    `前后一致=${before === after}；blocks 长度前=${JSON.parse(before).blocks.length} 后=${JSON.parse(after).blocks.length}`);
}

const pass = R.filter((r) => r.pass).length;
console.log('=== C 组验收（真机 headless Edge + CDP）：写作补全四项增强 A/B/D/H（v7.16）===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nC 组合计 ${pass}/${R.length}（A 状态栏豁免+对照 ×8 / B 动态徽章 ×8 / D 使用加权 ×8 / H 语料体检 ×7）`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
