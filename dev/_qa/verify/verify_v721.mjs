#!/usr/bin/env node
/* 拼好镜 · v7.21 组常驻断言（verify_v721）—— run-gate 第 16 道（退出码 19）
   ---------------------------------------------------------------------------
   覆盖（Holly 已核准 11 条；最终 11 条 = A×6 + B×5）：
     A×6  需求一「写作台块标签 初/补 + 大纲分组排列」：
           迁移零丢失 / ★tag 持久化往返（专防 migrateBlocks 投影剥离）/ 标签钮循环真写回
           / 分组渲染 + 组头不计入 .wd-item / ★order 语义不变（反面对照）
           / 跨组拖动被拒 + 组内正常（反面对照）。
     B×5  需求三「项目总览面板」：
           入口开合（含 Esc 走 keys.js 单点归口）/ 面板真渲染 /
           ★数据交叉校验（面板声明 vs run-gate 实际，防漂移）/ Esc 只关一层 + 未新增全局按键监听
           / reduced-motion 直切（用 .wd-lab 的 transition 做有齿断言，非真空）。
   工装口径：真机 CDP（Input.dispatchMouseEvent / dispatchKeyEvent），被测对象全部**真读**
             （state / localStorage / DOM 真值 / getComputedStyle）。
   ★夹具红线（T8）：夹具**不得预含**被断言的内容——A5 同时断言「分组确实重排了 DOM」与
             「order 未变」，故分组若整体失效必红（不会恒真）。
   由 run-gate 传入 PHJ_BROWSER_PORT 附加共享浏览器会话（与 [11]-[15] 同形态）。
   --------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact, ROOT, PRODUCT } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TARGET = pathToFileURL(TEST_BUILD.path).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到可附加的页面（headless 浏览器未就绪？）'); process.exit(20); }
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

/* ---- 导航：清 LS（★捕获 identifier —— A2 的持久化 reload 前必须摘除，否则 tag 会被清掉）---- */
await send('Page.enable'); await send('Runtime.enable');
const LS_CLEAR = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
const LS_CLEAR_ID = LS_CLEAR && LS_CLEAR.identifier;
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
  await sleep(150);
}
async function clickSel(sel) {
  const r = await evalJS('(function(){ var e = document.querySelector(' + JSON.stringify(sel) + '); if(!e) return null; var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()');
  if (!r) return false;
  await clickAt(r.x, r.y);
  return true;
}
async function pressKey(key, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(120);
}

/* ---- 页内助手（reload 后需重注）---- */
const HELPERS = `
window.__mapErr = 0;
window.addEventListener('error', function(){ window.__mapErr++; });
window.__labSetup = function(list){
  setView('write');
  state.blocks = list.map(function(x, i){ return { id: x.id, text: x.text || ('T' + i), x: 0, y: i * 10, order: i, tag: x.tag }; });
  renderWrite();
  return state.blocks.length;
};
window.__orderSeq = function(){
  return state.blocks.slice().sort(function(a, b){ return a.order - b.order; })
    .map(function(b){ return b.id + ':' + b.order + ':' + (b.tag === undefined ? '<undef>' : b.tag); });
};
window.__rawSeq = function(){ return state.blocks.map(function(b){ return b.id; }); };
window.__rowInfo = function(){
  var rows = [].slice.call(document.querySelectorAll('#wdList .wd-item'));
  var gs = [].slice.call(document.querySelectorAll('#wdList .wd-group'));
  /* ★空值防护：产品被改坏时**必须报红而非抛异常**（否则套件退出 1、run-gate 取不到汇总，
     失去「哪条断言失败」的诊断力 —— 证伪 R2 实测踩中） */
  return { itemCount: rows.length,
           domSeq: rows.map(function(r){ return r.dataset.id; }),
           domNo: rows.map(function(r){ var n = r.querySelector('.wd-no'); return n ? n.textContent : '<no-no>'; }),
           labText: rows.map(function(r){ var l = r.querySelector('.wd-lab'); return l ? l.textContent : '<no-lab>'; }),
           groupCount: gs.length,
           groupKeys: gs.map(function(g){ return g.dataset.group; }) };
};
window.__migrateProbe = function(src){
  var m = migrate(JSON.parse(JSON.stringify(src)));
  return { version: m.version,
           blocks: m.blocks.map(function(b){ return { id: b.id, text: b.text, tag: b.tag, x: b.x, y: b.y, order: b.order }; }),
           hasOwnTag: m.blocks.every(function(b){ return Object.prototype.hasOwnProperty.call(b, 'tag'); }),
           panX: m.pan.x, zoom: m.zoom, spliceLen: m.splice.items.length, title: m.title };
};
window.__mapState = function(){
  var m = document.getElementById('mapMask');
  /* v7.21b 两栏：左栏条目 = .map-list 内 .map-row；分组标题 = .map-group；待验收 = 右栏外的 pending/plan 行数 */
  return { exists: !!m, hidden: m ? m.classList.contains('hide') : null,
           rows: document.querySelectorAll('#mapBody .map-list .map-row').length,
           todo: document.querySelectorAll('#mapBody .map-row[data-state="pending"], #mapBody .map-row[data-state="plan"]').length,
           heads: document.querySelectorAll('#mapBody .map-list .map-group').length };
};
window.__mapData = function(){
  /* ★gateTotal / assertTotal 语义**不许改**（B3 依赖）；todoN 随新 state 值域同步（pending/plan）；
     groups = 去重后的用途分组数（数据驱动，替代判定式里硬编码的 3 —— 分组数将来会变） */
  var seen = {}, groups = 0;
  for (var i = 0; i < MAP_FEATURES.length; i++) {
    var g = MAP_FEATURES[i].group;
    if (!seen[g]) { seen[g] = 1; groups++; }
  }
  return { gateTotal: MAP_GATE_TOTAL, assertTotal: MAP_ASSERT_TOTAL, n: MAP_FEATURES.length,
           names: MAP_FEATURES.map(function(f){ return f.name; }),
           groups: groups,
           todoN: MAP_FEATURES.filter(function(f){ return f.state === 'pending' || f.state === 'plan'; }).length };
};
window.__mapCellsOk = function(){
  /* 左栏：每项须有非空 .map-name 与 .map-dot（★空值防护：产品被改坏时报红而非抛异常） */
  var rs = document.querySelectorAll('#mapBody .map-list .map-row');
  if (!rs.length) return false;
  for (var i = 0; i < rs.length; i++) {
    var a = rs[i].querySelector('.map-name'), d = rs[i].querySelector('.map-dot');
    if (!a || !a.textContent || !d) return false;
  }
  /* 右栏：详情四要素（名称 / 说明 / 状态徽章 / 版本徽章）均须非空 */
  var dn = document.querySelector('#mapBody .map-detail .map-dname');
  var ds = document.querySelector('#mapBody .map-detail .map-desc');
  var st = document.querySelector('#mapBody .map-detail .map-state');
  var vv = document.querySelector('#mapBody .map-detail .map-ver');
  return !!(dn && dn.textContent && ds && ds.textContent && st && st.textContent && vv && vv.textContent);
};
window.__mapDetail = function(){
  /* 右栏当前显示的 { name, state }（★空值防护：以 <no-…> 兜底，不抛异常） */
  var n = document.querySelector('#mapBody .map-detail .map-dname');
  var s = document.querySelector('#mapBody .map-detail .map-state');
  return { name: n ? n.textContent : '<no-name>', state: s ? s.textContent : '<no-state>' };
};
window.__mapOnIdx = function(){
  /* 左栏当前选中项下标（无选中 → -1） */
  var r = document.querySelector('#mapBody .map-list .map-row.on');
  return r ? Number(r.dataset.idx) : -1;
};
window.__lsProbe = function(){
  try { var r = JSON.parse(localStorage.getItem(LS_KEY)); var b = r.blocks[0];
        return { t: b.tag, has: Object.prototype.hasOwnProperty.call(b, 'tag'), v: r.version }; }
  catch (e) { return { err: String(e) }; }
};
window.__oneBlock = function(id){
  var b = state.blocks.filter(function(x){ return x.id === id; })[0];
  return b ? { t: b.tag, has: Object.prototype.hasOwnProperty.call(b, 'tag') } : null;
};
`;
async function installHelpers() {
  await evalJS(HELPERS);
  const probe = await evalJS('String(typeof __mapState)');
  if (probe.indexOf('function') < 0) { console.error('页内助手未就绪：' + probe); process.exit(21); }
}
await installHelpers();

/* ═══════════════════ A 组 · 需求一（标签 + 分组）═══════════════════ */

/* A1 迁移零丢失：v17 数据（无 tag 字段）→ tag 一律补 ''，其余字段逐字不变 */
{
  const V17 = { app: 'storyboard-prompt-panel', version: 17, templates: [], cmpl: { v: 13, items: null, gorder: null, use: {} },
    activeProject: 'p1',
    projects: [{ id: 'p1', title: 'T1', pan: { x: 5, y: 6 }, zoom: 1.5, collapsed: false,
      splice: { items: [{ type: 'block', id: 'a' }], activeUnitId: null },
      blocks: [{ id: 'a', text: 'AA', x: 11, y: 22, order: 0 }, { id: 'b', text: 'BB', x: 33, y: 44, order: 1 }] }] };
  const m = await evalJS('__migrateProbe(' + JSON.stringify(V17) + ')');
  t('A1 v17（无 tag）迁移零丢失：tag 一律补 ""、id/text/x/y/order 逐字不变、pan/zoom/splice/title 承接；version 仍 17',
    m.version === 17 && m.hasOwnTag === true && m.panX === 5 && m.zoom === 1.5 && m.spliceLen === 1 && m.title === 'T1'
    && eq(m.blocks, [{ id: 'a', text: 'AA', tag: '', x: 11, y: 22, order: 0 }, { id: 'b', text: 'BB', tag: '', x: 33, y: 44, order: 1 }]),
    JSON.stringify(m));
}

/* A2 ★tag 持久化往返（专防 migrateBlocks 的固定投影把新字段静默剥离）
      先摘除「清 LS」脚本（否则 reload 会把刚存的 tag 清掉），再做真实 reload */
{
  await evalJS('(function(){ setView("write"); state.blocks=[{ id:"p1", text:"P", x:0, y:0, order:0, tag:"补" }]; saveNow(); return 1; })()');
  const ls = await evalJS('__lsProbe()');
  if (LS_CLEAR_ID) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: LS_CLEAR_ID });
  await send('Page.reload');
  for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
  await sleep(500);
  await installHelpers();
  const after = await evalJS('__oneBlock("p1")');
  t('A2 ★tag 持久化往返：saveNow 后 localStorage 含 tag → **真实 reload** 后 tag 仍在（改坏 migrateBlocks 投影必红）',
    ls.has === true && ls.t === '补' && ls.v === 17 && !!after && after.has === true && after.t === '补',
    'LS=' + JSON.stringify(ls) + ' reload后=' + JSON.stringify(after));
}

/* A3 标签钮循环：初 → 补 → 无 → 初，且真写回 state.blocks */
{
  await evalJS('__labSetup([{ id:"k1", text:"X", tag:"初" }, { id:"k2", text:"Y", tag:"" }])');
  const seq = [];
  for (let i = 0; i < 3; i++) {
    await clickSel('#wdList .wd-item[data-id="k1"] .wd-lab');
    const one = await evalJS('__oneBlock("k1")');
    seq.push(one ? one.t : '<null>');
  }
  await clickSel('#wdList .wd-item[data-id="k1"] .wd-lab');
  const back = await evalJS('__oneBlock("k1")');
  t('A3 标签钮循环 初→补→无→初，且真写回 state.blocks（真读 state，非读 DOM 文本）',
    eq(seq, ['补', '', '初']) && !!back && back.t === '补',
    '循环=' + JSON.stringify(seq) + ' 第四击=' + JSON.stringify(back));
}

/* A4 分组渲染 + ★组头不计入 .wd-item；单一标签不出组头（反面对照） */
{
  await evalJS('__labSetup([{ id:"g1", text:"1", tag:"初" }, { id:"g2", text:"2", tag:"补" }, { id:"g3", text:"3", tag:"" }])');
  const gi = await evalJS('__rowInfo()');
  await evalJS('__labSetup([{ id:"s1", text:"1", tag:"初" }, { id:"s2", text:"2", tag:"初" }])');
  const si = await evalJS('__rowInfo()');
  t('A4 分组：≥2 种标签 → 3 个 .wd-group（组序 初→补→无）且**组头不计入 .wd-item**（仍 3 行）；单一标签 → 不出组头（反面对照）',
    gi.groupCount === 3 && eq(gi.groupKeys, ['初', '补', 'none']) && gi.itemCount === 3
    && si.groupCount === 0 && si.itemCount === 2,
    '多标签=' + JSON.stringify(gi) + ' 单标签=' + JSON.stringify(si));
}

/* A5 ★order 语义不变（反面对照：标签序刻意与 order 序不同）
      —— 同时断言「分组确实重排了 DOM」与「order / state.blocks 数组未动」，故分组整体失效必红（非恒真） */
{
  await evalJS('__labSetup([{ id:"o0", text:"0", tag:"补" }, { id:"o1", text:"1", tag:"初" }, { id:"o2", text:"2", tag:"" }])');
  const seq = await evalJS('__orderSeq()');
  const raw = await evalJS('__rawSeq()');
  const ri = await evalJS('__rowInfo()');
  t('A5 ★order 语义不变：标签序与 order 序刻意相反时，order/id 序列与 state.blocks 数组顺序**逐字不变**、DOM 按分组重排、.wd-no 仍为全局连续编号',
    eq(seq, ['o0:0:补', 'o1:1:初', 'o2:2:']) && eq(raw, ['o0', 'o1', 'o2'])
    && eq(ri.domSeq, ['o1', 'o0', 'o2']) && eq(ri.domNo, ['2', '1', '3']),
    'orderSeq=' + JSON.stringify(seq) + ' raw=' + JSON.stringify(raw) + ' DOM序=' + JSON.stringify(ri.domSeq) + ' 编号=' + JSON.stringify(ri.domNo));
}

/* A6 跨组拖动被拒 + 组内拖动正常（反面对照，防真空） */
{
  await evalJS('__labSetup([{ id:"c0", text:"0", tag:"初" }, { id:"c1", text:"1", tag:"初" }, { id:"c2", text:"2", tag:"补" }])');
  await evalJS('wdMove(2, 0)');                 /* 补 → 初 位置：跨组，应被拒 */
  const cross = await evalJS('__orderSeq()');
  await evalJS('wdMove(1, 0)');                 /* 初 → 初：组内，应生效 */
  const inner = await evalJS('__orderSeq()');
  t('A6 跨组拖动被拒（order 逐字不变）＋组内拖动正常生效（order 改变）—— 反面对照防真空',
    eq(cross, ['c0:0:初', 'c1:1:初', 'c2:2:补']) && eq(inner, ['c1:0:初', 'c0:1:初', 'c2:2:补']),
    '跨组后=' + JSON.stringify(cross) + ' 组内后=' + JSON.stringify(inner));
}

/* ═══════════════════ B 组 · 需求三（项目总览面板）═══════════════════ */

/* B1 入口与开合：三种路径（按钮开 / 按钮关 / Esc 关） */
{
  const initHidden = await evalJS('__mapState().hidden');
  await clickSel('#btnMap');
  const opened = await evalJS('__mapState().hidden');
  await clickSel('#mapClose');
  const closed = await evalJS('__mapState().hidden');
  await clickSel('#btnMap');
  await pressKey('Escape', 'Escape', 27);
  const escClosed = await evalJS('__mapState().hidden');
  t('B1 入口开合：#btnMap 打开 → #mapClose 关闭 → 再开 + Esc 关闭（Esc 走 keys.js 单点归口）',
    initHidden === true && opened === false && closed === true && escClosed === true,
    '初始hidden=' + initHidden + ' 开后=' + opened + ' 按钮关=' + closed + ' Esc关=' + escClosed);
}

/* B2 面板真渲染（v7.21b 两栏）：左栏条目数 / 待验收一致性 / 分组标题（数据驱动）/ 右栏详情 /
   ★左→右联动 / 每项状态点与名称非空。
   ★T11：分两栏后判定式**适配**（非放宽）—— 相比旧版保留「DOM 待验收行数 == 数据待验收项数」一致性，
      新增「右栏默认显示第一项」与「点击第 2 项右栏随之切换、选中态迁移」两条，断言强度只增不减。 */
{
  await clickSel('#btnMap');
  const st = await evalJS('__mapState()');
  const md = await evalJS('__mapData()');
  const cells = await evalJS('__mapCellsOk()');
  const d0 = await evalJS('__mapDetail()');
  /* ★联动检查：真机点左栏第 2 项 → 右栏 .map-dname 文本变为第 2 项 name，且左栏选中态从第 1 项迁到第 2 项 */
  const clicked = await clickSel('#mapBody .map-list .map-row[data-idx="1"]');
  const d1 = await evalJS('__mapDetail()');
  const onIdx = await evalJS('__mapOnIdx()');
  const err = await evalJS('window.__mapErr');
  t('B2 面板真渲染（两栏）：左栏 .map-row 数 == MAP_FEATURES 数、待验收行数一致、分组标题 == 分组数（数据驱动）、右栏详情非空且默认显示第一项、★点击第 2 项右栏随之切换且选中态迁移、每项状态点与名称非空',
    st.exists === true && st.rows === md.n && st.todo === md.todoN && st.heads === md.groups && cells === true
    && !!d0 && d0.name === md.names[0] && !!d0.state
    && clicked === true && !!d1 && d1.name === md.names[1] && onIdx === 1 && err === 0,
    'state=' + JSON.stringify(st) + ' data=' + JSON.stringify(md) + ' cellsOk=' + cells
    + ' 默认详情=' + JSON.stringify(d0) + ' 点击后详情=' + JSON.stringify(d1) + ' 选中idx=' + onIdx + ' err=' + err);
  await clickSel('#mapClose');
}

/* B3 ★数据交叉校验（防漂移）：面板声明 vs run-gate 实际
      —— 解析失败/对不上即红，故「加了闸门却忘更面板」会被立刻发现 */
{
  const gateSrc = fs.readFileSync(path.join(ROOT, 'dev', '_qa', 'run-gate.mjs'), 'utf8');
  const metas = [...gateSrc.matchAll(/^\s+(\w+):\s*\{\s*no:\s*(\d+),\s*label:\s*'([^']+)'/gm)];
  const expNums = [...gateSrc.matchAll(/期望[^（\n]*?(\d+)\/(\d+)/g)].map((m) => Number(m[1]));
  const sumExp = expNums.reduce((a, b) => a + b, 0);
  const md = await evalJS('__mapData()');
  t('B3 ★数据交叉校验（防漂移）：面板声明的闸门道数 == run-gate 的 GATE_META 条数、常驻断言合计 == 各套件期望之和（解析条数亦须达标，格式变了也红）',
    md.gateTotal === metas.length && md.assertTotal === sumExp && expNums.length >= 14,
    '面板道数=' + md.gateTotal + ' 实测=' + metas.length + '；面板断言=' + md.assertTotal + ' run-gate期望和=' + sumExp + '（解析到 ' + expNums.length + ' 条）');
}

/* B4 Esc 只关一层（走单点归口）+ 产物未新增任何 document/window 级按键监听（静态冻结契约） */
{
  await clickSel('#btnMap');
  const r1 = await evalJS('closeTopLayer()');
  const r2 = await evalJS('closeTopLayer()');
  const prod = fs.readFileSync(PRODUCT, 'utf8');
  const lis = [...prod.matchAll(/(document|window)\.addEventListener\('(keydown|keyup|blur)'/g)].map((m) => m[1] + ':' + m[2]);
  const CONTRACT = ['document:keydown', 'document:keyup', 'window:blur', 'window:blur', 'document:keydown', 'document:keydown', 'document:keyup', 'window:blur'];
  t('B4 Esc 走单点归口且**只关一层**（返回 mapPanel → 再调返回 null）；且产物**未新增**任何 document/window 级 keydown/keyup/blur 监听（8 条冻结契约逐条一致）',
    r1 === 'mapPanel' && r2 === null && eq(lis, CONTRACT),
    'esc1=' + r1 + ' esc2=' + r2 + ' 监听=' + JSON.stringify(lis));
}

/* B5 reduced-motion：新样式必须遵守 R4（用 .wd-lab 的 transition 做**有齿**断言，非真空）
      ★headless 默认即 reduce（项目已知坑）→ 必须**先显式钉住 no-preference** 再取「动效态」基线；
      ★结束必须显式钉回 no-preference（清空 features 会回落系统默认 reduce，连带影响后续断言）。 */
{
  await evalJS('__labSetup([{ id:"r1", text:"1", tag:"初" }])');
  const tdSel = '(function(){ var l = document.querySelector("#wdList .wd-item .wd-lab"); return l ? getComputedStyle(l).transitionDuration : "<no-lab>"; })()';
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await sleep(200);
  const normalTd = await evalJS(tdSel);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(200);
  const rmTd = await evalJS(tdSel);
  await clickSel('#btnMap');
  const rm = await evalJS('__mapState()');
  const rmCells = await evalJS('__mapCellsOk()');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await sleep(150);
  const backTd = await evalJS(tdSel);
  const err = await evalJS('window.__mapErr');
  await clickSel('#mapClose');
  t('B5 reduced-motion（★双向钉住）：no-preference 下 .wd-lab 有过渡（非 0s）→ reduce 下**直切归 0s**，且面板开合与渲染功能正常；随后显式钉回 no-preference',
    normalTd !== '0s' && rmTd === '0s' && backTd !== '0s' && rm.hidden === false && rm.rows > 0 && rmCells === true && err === 0,
    'no-preference=' + normalTd + ' reduce=' + rmTd + ' 钉回=' + backTd + ' 面板=' + JSON.stringify(rm) + ' err=' + err);
}

/* ═══════════════════ 汇总 ═══════════════════ */
const PASS = R.filter((x) => x.pass).length;
const FAIL = R.length - PASS;
for (const x of R) {
  console.log((x.pass ? '✅ ' : '❌ ') + x.name + (x.detail ? '   〔' + x.detail + '〕' : ''));
}
console.log('v7.21 组合计 ' + PASS + '/' + R.length + '（标签 初/补 与分组 A×6 + 项目总览面板 B×5）');
process.exit(FAIL === 0 ? 0 : 19);
