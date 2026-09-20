#!/usr/bin/env node
/* 拼好镜 · QA 独立复验 v7.18（不采信工程师自述；本脚本自带 headless 浏览器 + 真机 CDP）
   ---------------------------------------------------------------------------
   覆盖「自测工装未覆盖 / 只做浅验」的点：
     Q1  解链专项（★本轮最可能真缺陷点）：项目 A 里**真·点删按钮**删块 → 切走 → 切回 A
         → 断言被删块**不复活**、其余块完好；并断言 state.blocks === projects[active].blocks
     Q1b 解链「证伪」：手工把 state.blocks 换成新数组（不 saveNow）→ 断言镜像**确实能**断开
         （证明 Q1 的引用一致性断言有能力见红）；再 saveNow → 断言幂等重连
     Q2  切项目不串数据（强）：pan / zoom / splice 逐项隔离，切回后逐字还原
     Q3  导出含全部项目：sanitizeState()（= exportJSON 的载荷）真含 projects[] 全量
     Q4  导入/往返：v17 双项目文档种子 → 真 reload → 2 个项目、逐字一致（含 collapsed）
     Q5a 危险操作·唯一项目禁删：deleteProject() 被拒、不弹确认框、toast 文案正确
     Q5b 危险操作·删活动项目：确认 → 先切走再删；点 toast「撤销」→ **真读**槽被原位恢复
     Q6  migrate v16→v17 零丢失（逐字段真比对）：order / pan / zoom / splice(条目+单元) /
         templates(单元) / cmpl.use / title / collapsed；并验「projects-only 文档」幂等
     Q7  需求②：3 个不同高度块 →「整」→ 记录 y 与间距 → 反复切视图（写作↔画布 ×3）→ 间距/块高稳定
         → 真实 reload + 切画布 → 间距仍与「整」后一致、块高不塌陷

   用法：node dev/_qa/verify/verify_qa_v718.mjs
        （可选 PHJ_BROWSER=<exe>；起始端口 PHJ_BROWSER_PORT，缺省 9222）
   ------------------------------------------------------------------------- */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_BUILD = buildTestArtifact();
const TARGET = pathToFileURL(TEST_BUILD.path).href;

/* ---- 选空闲端口 ---- */
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    srv.once('error', () => finish(false));
    srv.once('listening', () => srv.close(() => finish(true)));
    try { srv.listen(port, '127.0.0.1'); } catch { finish(false); }
  });
}
async function findFreePort(base, span = 50) {
  for (let p = base; p < base + span && p <= 65535; p++) { if (await isPortFree(p)) return p; }
  return null;
}
async function waitForCDP(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); } catch { /* retry */ }
    await sleep(250);
  }
  return null;
}
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch { /* fall */ } }
  try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}

const det = detectBrowser();
if (!det.exe) { console.error('未找到可用 headless 浏览器（可设 PHJ_BROWSER）'); process.exit(3); }
const basePort = Number.parseInt(process.env.PHJ_BROWSER_PORT || '9222', 10) || 9222;
const port = await findFreePort(basePort);
if (!port) { console.error('未找到空闲端口'); process.exit(3); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_qa718_'));
const proc = spawn(det.exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore', detached: false });
const ver = await waitForCDP(port, 25000);
if (!ver) { console.error('CDP 就绪超时'); killTree(proc.pid); process.exit(3); }
console.log('浏览器：' + det.exe + '  端口 ' + port + '  ' + (ver['Browser'] || ''));

/* ---- 附加页面 + CDP 桥 ---- */
const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 700));
  return r.result && r.result.value;
}
async function ready() { for (let i = 0; i < 60; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); } await sleep(300); }

await send('Page.enable'); await send('Runtime.enable');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET }); await ready();
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload'); await ready(); await send('Page.bringToFront').catch(() => {}); await sleep(350);

/* ---- 真机交互助手 ---- */
const clickSel = (sel) => evalJS(`(function(){ var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; el.click(); return true; })()`);
const clickMenuByText = (txt) => evalJS(`(function(){
  var it=[].slice.call(document.querySelectorAll('#ctxMenu .ctx-item')).filter(function(e){return e.textContent.indexOf(${JSON.stringify(txt)})>=0;});
  if(!it.length) return null; it[0].click(); return it[0].textContent; })()`);
const modalOpen = () => evalJS(`!document.getElementById('modalMask').classList.contains('hide')`);
const modalFill = (val) => evalJS(`(function(){ var i=document.querySelector('#modalBody .modal-input'); if(!i) return null; i.value=${JSON.stringify(val)}; return i.value; })()`);
const toastText = () => evalJS(`(document.getElementById('toast')||{}).textContent || ''`);
async function menuSwitch(title) {
  await clickSel('#btnProj'); await sleep(180);
  return await clickMenuByText(title);
}
async function newProjectNamed(name) {
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('新建项目'); await sleep(180);
  const opened = await modalOpen();
  await modalFill(name); await clickSel('#modalOk'); await sleep(280);
  return opened;
}
const refLinked = () => evalJS('state.blocks === projectAt(state.activeProject).blocks');
const seedBlocks = (arr) => evalJS(`(function(){
  state.blocks = ${JSON.stringify(arr)}.map(function(b,i){ return { id:b.id, text:b.text, x:(b.x==null?20+i*40:b.x), y:(b.y==null?20+i*150:b.y), order:i }; });
  saveNow(); return state.blocks.map(function(b){return b.id;}); })()`);
const activeIds = () => evalJS('state.blocks.map(function(b){return b.id;})');
const projectsSnapshot = () => evalJS('state.projects.map(function(p){return { id:p.id, title:p.title, ids:p.blocks.map(function(b){return b.id;}) };})');

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });

/* ══════════════════ Q5a · 唯一项目禁删（pristine 单项目） ══════════════════ */
{
  const before = await evalJS('state.projects.length');
  await evalJS('deleteProject()'); await sleep(200);
  const after = await evalJS('state.projects.length');
  const mOpen = await modalOpen();
  const tt = await toastText();
  t('Q5a 危险操作·唯一项目禁删：deleteProject() 被拒（不弹确认框 + 项目数不变 + toast 文案）',
    before === 1 && after === 1 && mOpen === false && tt.indexOf('至少保留一个项目') >= 0,
    `deleteProject 前 projects=${before} → 后=${after}；确认框开=${mOpen}；toast=「${tt}」`);
}

/* ══════════════════ Q1 · 解链专项：真删块 → 切走 → 切回 ══════════════════ */
try {
  await evalJS("setView('canvas')"); await sleep(300);
  await seedBlocks([{ id: 'A', text: 'AAA_CONTENT' }, { id: 'B', text: 'BBB_CONTENT' }, { id: 'C', text: 'CCC_CONTENT' }]);
  await evalJS('render()'); await sleep(200);   /* seedBlocks 只改 state.blocks → 需 render() 让 DOM 跟上（否则找不到删按钮） */
  const link0 = await refLinked();
  const cardExists = await evalJS("!!document.querySelector('.block[data-id=\"B\"] .op-btn[data-act=\"del\"]')");
  /* 真·点卡片上的「删」按钮（走 bulkAction('del')：reassign state.blocks.filter → 解链点） */
  await clickSel('.block[data-id="B"] .op-btn[data-act="del"]');
  await sleep(500);   /* 删除动画 130ms + render + saveNow */
  const afterDelIds = await activeIds();
  const link1 = await refLinked();
  const delToast = await toastText();
  /* 新建项目 P2（零块）→ 在 P2 建 D → 切回 P1 → 再看 P1 */
  const opened = await newProjectNamed('QA_P2');
  const inP2 = await activeIds();
  await seedBlocks([{ id: 'D', text: 'DDD_CONTENT' }]);
  /* 菜单里找到 P1（原「未命名分镜」）并切回 */
  const p1title = await evalJS("state.projects.filter(function(p){return p.title!=='QA_P2';})[0].title");
  await menuSwitch(p1title); await sleep(300);
  const backIds = await activeIds();
  const backTexts = await evalJS('state.blocks.map(function(b){return b.text;})');
  const backTitle = await evalJS('state.title');
  const link2 = await refLinked();
  const slotP1 = await evalJS("(function(){var s=state.projects.filter(function(p){return p.title!==" + JSON.stringify('QA_P2') + ";})[0]; return s?s.blocks.map(function(b){return b.id;}):null;})()");
  /* 再切回 P2 → D 还在 */
  await menuSwitch('QA_P2'); await sleep(300);
  const p2Ids = await activeIds();
  const link3 = await refLinked();

  const pass = link0 === true && cardExists === true
    && JSON.stringify(afterDelIds) === JSON.stringify(['A', 'C']) && link1 === true
    && opened === true && inP2.length === 0
    && backTitle === p1title && link2 === true
    && JSON.stringify(backIds) === JSON.stringify(['A', 'C'])      /* ★B 不得复活 */
    && JSON.stringify(backTexts) === JSON.stringify(['AAA_CONTENT', 'CCC_CONTENT'])
    && JSON.stringify(slotP1) === JSON.stringify(['A', 'C'])
    && JSON.stringify(p2Ids) === JSON.stringify(['D']) && link3 === true;
  t('Q1 ★解链专项：A 内真·点删块 B → 切 P2 → 切回 A（B 不复活/余块完好/镜像同引用）→ 再切 P2（D 在）',
    pass,
    `seed 后同引用=${link0}；删按钮存在=${cardExists}；删后 ids=${JSON.stringify(afterDelIds)} 同引用=${link1} toast=「${delToast}」｜新 P2 弹框=${opened} P2 初始 ids=${JSON.stringify(inP2)}｜切回「${p1title}」ids=${JSON.stringify(backIds)} texts=${JSON.stringify(backTexts)} 同引用=${link2} A 槽 ids=${JSON.stringify(slotP1)}｜再切 P2 ids=${JSON.stringify(p2Ids)} 同引用=${link3}`);
} catch (e) {
  t('Q1 ★解链专项', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q1b · 解链「证伪」：镜像确实能断开，且 saveNow 幂等重连 ══════════════════ */
try {
  await evalJS("setView('canvas')"); await sleep(200);
  await seedBlocks([{ id: 'X', text: 'X1' }, { id: 'Y', text: 'Y1' }]);
  const linkedBefore = await refLinked();
  /* 手工模拟 bulkAction('del') 的 reassign（不调 saveNow / syncActiveProject） */
  const brokeLink = await evalJS('(function(){ state.blocks = state.blocks.filter(function(b){ return b.id !== "X"; }); return state.blocks === projectAt(state.activeProject).blocks; })()');
  const slotStaleIds = await evalJS('projectAt(state.activeProject).blocks.map(function(b){return b.id;})');
  /* 调 saveNow（= 落盘路径）→ 期望幂等重连 */
  const reLinked = await evalJS('(function(){ saveNow(); return state.blocks === projectAt(state.activeProject).blocks; })()');
  const slotAfterIds = await evalJS('projectAt(state.activeProject).blocks.map(function(b){return b.id;})');
  /* 证伪成立条件：断开确实可被观测（brokeLink===false）且 saveNow 后重连（reLinked===true） */
  const pass = linkedBefore === true && brokeLink === false && reLinked === true
    && JSON.stringify(slotAfterIds) === JSON.stringify(['Y']);
  t('Q1b 解链「证伪」：手工 reassign 使镜像断开（可观测）→ saveNow 幂等重连；断言有能力见红',
    pass,
    `seed 后同引用=${linkedBefore}；手工 filter 后同引用=${brokeLink}（false=确实断开）槽残留 ids=${JSON.stringify(slotStaleIds)}；saveNow 后同引用=${reLinked} 槽 ids=${JSON.stringify(slotAfterIds)}`);
} catch (e) {
  t('Q1b 解链证伪', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q2 · 切项目不串数据（pan/zoom/splice 逐项隔离） ══════════════════ */
try {
  await evalJS("setView('canvas')"); await sleep(200);
  const projs = await evalJS('state.projects.map(function(p){return {id:p.id,title:p.title,ids:p.blocks.map(function(b){return b.id;})};})');
  const P = projs[0], Q = projs[1];
  /* 保证活动 = P */
  if ((await evalJS('state.activeProject')) !== P.id) { await menuSwitch(P.title); await sleep(250); }
  /* 在 P 写入可辨识视角/拼接（splice 引用 P 自己的首块） */
  const pBlk = await evalJS('state.blocks[0] && state.blocks[0].id');
  await evalJS(`(function(){ state.pan={x:11,y:22}; state.zoom=1.5; state.splice.items=[{type:'block',id:${JSON.stringify(pBlk)}}]; state.splice.activeUnitId=null; saveNow(); return 1; })()`);
  /* 切到 Q → 其视角/拼接应是它自己的（不得串成 P 的 11/22） */
  await menuSwitch(Q.title); await sleep(250);
  const qBefore = await evalJS('({pan:state.pan,zoom:state.zoom,spliceN:state.splice.items.length,ids:state.blocks.map(function(b){return b.id;})})');
  const leaked = (qBefore.pan.x === 11 && qBefore.pan.y === 22);
  /* 在 Q 写入另一组值 */
  await evalJS(`(function(){ state.pan={x:-50,y:60}; state.zoom=2; state.splice.items=[]; state.splice.activeUnitId=null; saveNow(); return 1; })()`);
  /* 回 P → 应逐字还原 P 的值 */
  await menuSwitch(P.title); await sleep(250);
  const a1 = await evalJS('({pan:state.pan,zoom:state.zoom,spliceN:state.splice.items.length,spliceIds:state.splice.items.map(function(it){return it.id;}),ids:state.blocks.map(function(b){return b.id;})})');
  const linkA = await refLinked();
  /* 再切 Q → 应逐字还原 Q 的值 */
  await menuSwitch(Q.title); await sleep(250);
  const b1 = await evalJS('({pan:state.pan,zoom:state.zoom,spliceN:state.splice.items.length,ids:state.blocks.map(function(b){return b.id;})})');
  const linkB = await refLinked();

  const pass = !leaked
    && a1.pan.x === 11 && a1.pan.y === 22 && a1.zoom === 1.5 && a1.spliceN === 1 && JSON.stringify(a1.spliceIds) === JSON.stringify([pBlk])
    && JSON.stringify(a1.ids) === JSON.stringify(P.ids)
    && b1.pan.x === -50 && b1.pan.y === 60 && b1.zoom === 2 && b1.spliceN === 0 && JSON.stringify(b1.ids) === JSON.stringify(Q.ids)
    && linkA === true && linkB === true;
  t('Q2 切项目不串数据（强）：pan/zoom/splice 逐项按项目隔离；来回切换各自逐字还原，镜像同引用',
    pass,
    `P=「${P.title}」ids=${JSON.stringify(P.ids)} Q=「${Q.title}」ids=${JSON.stringify(Q.ids)}｜切到 Q 未串 P 视角=${!leaked}（Q 载入值=${JSON.stringify(qBefore)}）｜切回 P(a1)=${JSON.stringify(a1)} 同引用=${linkA}｜再切 Q(b1)=${JSON.stringify(b1)} 同引用=${linkB}`);
} catch (e) {
  t('Q2 切项目隔离', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q3 · 导出含全部项目 ══════════════════ */
try {
  const doc = await evalJS('(function(){ var c = sanitizeState(); return { n:c.projects.length, titles:c.projects.map(function(p){return p.title;}), active:c.activeProject, projIds:c.projects.map(function(p){return p.id;}), hasActive: c.projects.some(function(p){return p.id===c.activeProject;}), topIds:(c.blocks||[]).map(function(b){return b.id;}), v:c.version }; })()');
  const slotIds = await evalJS('state.projects.map(function(p){return p.blocks.map(function(b){return b.id;});})');
  const docIds = await evalJS('(function(){ var c=sanitizeState(); return c.projects.map(function(p){return p.blocks.map(function(b){return b.id;});}); })()');
  const pass = doc.n === 2 && doc.hasActive === true && doc.v === 17
    && JSON.stringify(docIds) === JSON.stringify(slotIds)
    && doc.titles.indexOf('QA_P2') >= 0;
  t('Q3 导出（sanitizeState = exportJSON 载荷）含全部项目：projects 全量 + activeProject 命中 + 各槽块一致',
    pass,
    `导出 projects=${doc.n} titles=${JSON.stringify(doc.titles)} active 命中=${doc.hasActive} version=${doc.v}｜各槽块(导出)=${JSON.stringify(docIds)} ==(内存)=${JSON.stringify(slotIds)}`);
} catch (e) {
  t('Q3 导出含全部项目', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q6 · migrate v16→v17 零丢失（逐字段真比对） ══════════════════ */
try {
  const V16 = {
    app: 'storyboard-prompt-panel', version: 16, title: '老档X', zoom: 1.5, pan: { x: 33, y: -44 },
    blocks: [
      { id: 'q0', text: 'q0文本', x: 100, y: 50, order: 1 },
      { id: 'q1', text: 'q1文本', x: 20, y: 220, order: 0 }
    ],
    splice: { items: [{ type: 'unit', id: 'u1', name: 'U', prefixes: ['p'], suffixes: ['s'], blockIds: ['q0', 'ZZZ'] }, { type: 'block', id: 'q1' }, { type: 'block', id: 'GONE' }], activeUnitId: 'u1' },
    templates: [{ id: 't1', units: [{ id: 'tu1', prefixes: ['a'], suffixes: ['b'] }] }],
    cmpl: { v: 1, items: null, gorder: null, use: { k1: { n: 2, t: 99 } } },
    collapsed: true
  };
  const m = await evalJS(`(function(){
    var d = migrate(${JSON.stringify(V16)});
    return {
      v: d.version, nProj: d.projects.length, pTitle: d.projects[0].title,
      order: d.projects[0].blocks.map(function(b){return [b.id,b.order];}),
      pan: d.projects[0].pan, zoom: d.projects[0].zoom, collapsed: d.projects[0].collapsed,
      splice: d.projects[0].splice,
      tpl: d.templates.map(function(t){return t.units.length;}),
      use: d.cmpl.use.k1 && d.cmpl.use.k1.n,
      sameRef: d.blocks === d.projects[0].blocks,
      mirrorIds: d.blocks.map(function(b){return b.id;})
    };
  })()`);
  /* 幂等：再 migrate 结果稳定 */
  const m2 = await evalJS(`(function(){ var a = migrate(${JSON.stringify(V16)}); var b = migrate(a); return { proj: b.projects.length, ids: b.projects[0].blocks.map(function(x){return x.id;}), use: b.cmpl.use.k1 && b.cmpl.use.k1.n }; })()`);
  /* projects-only 文档（无顶层 blocks）也应被 migrate 正确接受 */
  const po = await evalJS(`(function(){ var src = migrate(${JSON.stringify(V16)}); var only = { app:'storyboard-prompt-panel', version:17, templates: src.templates, cmpl: src.cmpl, activeProject: src.activeProject, projects: src.projects }; var d = migrate(only); return { n:d.projects.length, ids:d.projects[0].blocks.map(function(b){return b.id;}), use:d.cmpl.use.k1 && d.cmpl.use.k1.n }; })()`);

  const expectOrder = JSON.stringify([['q1', 0], ['q0', 1]]);   /* order=0 者(q1)排前，续号 0..N-1 */
  const pass = m.v === 17 && m.nProj === 1 && m.pTitle === '老档X'
    && JSON.stringify(m.order) === expectOrder
    && m.pan.x === 33 && m.pan.y === -44 && m.zoom === 1.5 && m.collapsed === true
    && m.splice.items.length === 2                              /* ZZZ / GONE 失效引用被剔除 */
    && JSON.stringify(m.splice.items.map(function(it){ return it.type === 'unit' ? it.blockIds : it.id; })) === JSON.stringify([['q0'], 'q1'])
    && m.splice.activeUnitId === 'u1'
    && JSON.stringify(m.tpl) === JSON.stringify([1]) && m.use === 2
    && m.sameRef === true && JSON.stringify(m.mirrorIds) === JSON.stringify(['q1', 'q0'])
    && m2.proj === 1 && JSON.stringify(m2.ids) === JSON.stringify(['q1', 'q0']) && m2.use === 2
    && po.n === 1 && JSON.stringify(po.ids) === JSON.stringify(['q1', 'q0']) && po.use === 2;
  t('Q6 迁移 v16→v17 零丢失（逐字段真比对）：order/pan/zoom/splice(剔失效引用)/templates/cmpl.use/title/collapsed + 幂等 + projects-only 文档',
    pass,
    `v=${m.v} projects=${m.nProj} title=「${m.pTitle}」 order=${JSON.stringify(m.order)} pan=(${m.pan.x},${m.pan.y}) zoom=${m.zoom} collapsed=${m.collapsed} splice=${JSON.stringify(m.splice)} tpl=${JSON.stringify(m.tpl)} use=${m.use} 同引用=${m.sameRef}｜幂等 proj=${m2.proj} ids=${JSON.stringify(m2.ids)} use=${m2.use}｜projects-only proj=${po.n} ids=${JSON.stringify(po.ids)}`);
} catch (e) {
  t('Q6 迁移零丢失', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q5b · 删活动项目：先切走 + 确认 + 撤销真恢复 ══════════════════ */
try {
  /* 当前活动应为 A（两块）。记录它 */
  const p1 = await evalJS("(function(){ var s=projectAt(state.activeProject); return { id:s.id, title:s.title, ids:s.blocks.map(function(b){return b.id;}), pan:s.pan, zoom:s.zoom }; })()");
  const others = await evalJS('state.projects.length');
  await evalJS('deleteProject()'); await sleep(200);
  const confirmOpen = await modalOpen();
  await clickSel('#modalOk'); await sleep(320);   /* 确认删除 */
  const afterDel = await evalJS('({ n:state.projects.length, active:state.activeProject, title:state.title, ids:state.blocks.map(function(b){return b.id;}), tt:(document.getElementById("toast")||{}).textContent||"" })');
  /* 点 toast「撤销」——真机路径恢复 */
  const hadUndoBtn = await evalJS('!!document.querySelector("#toast button")');
  await clickSel('#toast button'); await sleep(300);
  const afterUndo = await evalJS(`(function(){
    var s = state.projects.filter(function(p){return p.id===${JSON.stringify(p1.id)};})[0];
    return { n:state.projects.length, restored: !!s, rTitle: s && s.title, rIds: s && s.blocks.map(function(b){return b.id;}), activeIsRestored: state.activeProject === ${JSON.stringify(p1.id)} };
  })()`);

  const pass = others >= 2 && confirmOpen === true
    && afterDel.n === others - 1 && afterDel.active !== p1.id && afterDel.title !== p1.title
    && hadUndoBtn === true
    && afterUndo.n === others && afterUndo.restored === true && afterUndo.rTitle === p1.title
    && JSON.stringify(afterUndo.rIds) === JSON.stringify(p1.ids)
    && afterUndo.activeIsRestored === false;   /* 撤销不自动激活（防视图跳变） */
  t('Q5b 危险操作·删活动项目：确认框 → 先切走（活动项变邻居）→ 删除；点 toast「撤销」→ 槽原位真恢复且不自动激活',
    pass,
    `删前 ${others} 个项目（活动=「${p1.title}」id=${p1.id} ids=${JSON.stringify(p1.ids)}）｜确认框=${confirmOpen}｜删后 n=${afterDel.n} active=${afterDel.active} title=「${afterDel.title}」当前 ids=${JSON.stringify(afterDel.ids)} toast=「${afterDel.tt}」｜撤销按钮=${hadUndoBtn}｜撤销后 n=${afterUndo.n} 槽恢复=${afterUndo.restored} title=「${afterUndo.rTitle}」ids=${JSON.stringify(afterUndo.rIds)} 自动激活=${afterUndo.activeIsRestored}`);
} catch (e) {
  t('Q5b 删活动项目+撤销', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q4 · 导入/往返：v17 双项目文档 → 真 reload → 逐字一致 ══════════════════ */
try {
  const DOC = {
    app: 'storyboard-prompt-panel', version: 17,
    templates: [], cmpl: { v: 1, items: null, gorder: null, use: {} },
    activeProject: 'pB',
    projects: [
      { id: 'pA', title: '甲项目', blocks: [{ id: 'a1', text: 'AAA', x: 10, y: 10, order: 0 }], pan: { x: 5, y: 6 }, zoom: 1.2, splice: { items: [{ type: 'block', id: 'a1' }], activeUnitId: null }, collapsed: false },
      { id: 'pB', title: '乙项目', blocks: [{ id: 'b1', text: 'BBB', x: 0, y: 0, order: 0 }, { id: 'b2', text: 'BB2', x: 0, y: 130, order: 1 }], pan: { x: -7, y: 8 }, zoom: 1.5, splice: { items: [], activeUnitId: null }, collapsed: true }
    ],
    blocks: [{ id: 'b1', text: 'BBB', x: 0, y: 0, order: 0 }, { id: 'b2', text: 'BB2', x: 0, y: 130, order: 1 }],
    pan: { x: -7, y: 8 }, zoom: 1.5, splice: { items: [], activeUnitId: null }, collapsed: true, title: '乙项目'
  };
  const seedId = (await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{ localStorage.setItem('storyboard-prompt-panel:v1', " + JSON.stringify(JSON.stringify(DOC)) + "); }catch(e){}",
  })).identifier;
  await send('Page.reload'); await ready(); await sleep(250);
  const after = await evalJS(`(function(){
    var raw = localStorage.getItem('storyboard-prompt-panel:v1') || '';
    return { n: state.projects.length, active: state.activeProject, title: state.title,
      pan: state.pan, zoom: state.zoom, collapsed: state.collapsed,
      ids: state.blocks.map(function(b){return b.id;}),
      titles: state.projects.map(function(p){return p.title;}),
      pA_ids: (state.projects.filter(function(p){return p.id==='pA';})[0]||{}).blocks ? state.projects.filter(function(p){return p.id==='pA';})[0].blocks.map(function(b){return b.id;}) : null,
      pA_splice: state.projects.filter(function(p){return p.id==='pA';})[0].splice.items.length,
      lsHas: raw.indexOf('甲项目') >= 0 && raw.indexOf('乙项目') >= 0,
      sameRef: state.blocks === projectAt(state.activeProject).blocks,
      v: state.version };
  })()`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedId });
  const pass = after.v === 17 && after.n === 2 && after.active === 'pB' && after.title === '乙项目'
    && after.pan.x === -7 && after.pan.y === 8 && after.zoom === 1.5 && after.collapsed === true
    && JSON.stringify(after.ids) === JSON.stringify(['b1', 'b2'])
    && JSON.stringify(after.titles) === JSON.stringify(['甲项目', '乙项目'])
    && JSON.stringify(after.pA_ids) === JSON.stringify(['a1']) && after.pA_splice === 1
    && after.lsHas === true && after.sameRef === true;
  t('Q4 导入/往返：v17 双项目文档真 reload → 2 个项目、活动项/视角/折叠/各槽块/拼接逐字一致、镜像同引用',
    pass,
    `v=${after.v} projects=${after.n} active=${after.active} title=「${after.title}」 pan=(${after.pan.x},${after.pan.y}) zoom=${after.zoom} collapsed=${after.collapsed} 活动 ids=${JSON.stringify(after.ids)} titles=${JSON.stringify(after.titles)} pA ids=${JSON.stringify(after.pA_ids)} pA splice=${after.pA_splice} LS含双项目=${after.lsHas} 同引用=${after.sameRef}`);
} catch (e) {
  t('Q4 导入/往返', false, '异常：' + (e && e.message));
}

/* ══════════════════ Q7 · 需求②：反复切视图 + reload 后间距/块高稳定 ══════════════════ */
try {
  const MEASURE = `window.__qaM=function(){
    var cs=[].slice.call(document.querySelectorAll('.block')); var byId={};
    cs.forEach(function(c){ byId[c.dataset.id]=c; });
    var hs=state.blocks.map(function(b){ return byId[b.id]?byId[b.id].offsetHeight:0; });
    var taH=state.blocks.map(function(b){ var c=byId[b.id]; var ta=c&&c.querySelector('.block-text'); return ta?ta.offsetHeight:0; });
    var inlineH=state.blocks.map(function(b){ var c=byId[b.id]; var ta=c&&c.querySelector('.block-text'); return ta?ta.style.height:null; });
    var ys=state.blocks.slice().sort(function(a,b){return a.order-b.order;}).map(function(b){return b.y;});
    var gaps=[]; for(var i=1;i<ys.length;i++) gaps.push(ys[i]-ys[i-1]);
    return { hs:hs, taH:taH, inlineH:inlineH, ys:ys, gaps:gaps };
  };`;
  await evalJS(MEASURE);
  await evalJS("setView('canvas')"); await sleep(300);
  await evalJS(`(function(){
    state.blocks = [
      { id:'LA', text:'甲\\n乙', x:20, y:20,  order:0 },
      { id:'LB', text:'一\\n二\\n三\\n四\\n五\\n六\\n七\\n八', x:20, y:170, order:1 },
      { id:'LC', text:'a\\nb\\nc\\nd\\ne\\nf\\ng\\nh\\ni\\nj\\nk\\nl\\nm\\nn\\no\\np', x:20, y:320, order:2 }
    ];
    setView('canvas'); arrangeAll(); saveNow(); return 1;
  })()`);
  await sleep(600);
  const arranged = await evalJS('window.__qaM()');
  /* 反复切视图（写作↔画布 ×3）后测量 */
  const seq = [];
  for (let i = 0; i < 3; i++) {
    await evalJS("setView('write')"); await sleep(220);
    await evalJS("setView('canvas')"); await sleep(300);
    seq.push(await evalJS('window.__qaM()'));
  }
  /* 真实 reload → 点画布（默认落写作台）
     ★先摘除「每次新文档即清 LS」脚本，否则 reload 会把刚 arrange 的状态清掉 */
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MEASURE });
  await send('Page.reload'); await ready(); await sleep(300);
  /* 注入脚本已在「新文档即运行」定义了 window.__qaM → reload 后可直接用 */
  await evalJS("if(typeof setView==='function') setView('canvas');"); await sleep(500);
  const reopened = await evalJS('window.__qaM()');

  const gapsOk = (g) => Array.isArray(g) && g.length === 2 && g.every((x) => x > 0);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const inc = (a) => a[0] <= a[1] && a[1] <= a[2] && a[2] > a[0];
  const nonzero = (a) => a.every((h) => h > 0);
  const allStable = seq.every((s) => eq(s.gaps, arranged.gaps) && eq(s.hs, arranged.hs) && nonzero(s.hs));
  const reloadOk = eq(reopened.gaps, arranged.gaps) && eq(reopened.hs, arranged.hs) && nonzero(reopened.hs) && inc(reopened.hs);
  const pass = gapsOk(arranged.gaps) && nonzero(arranged.hs) && inc(arranged.hs) && allStable && reloadOk;
  t('Q7 需求②：3 块「整」后间距/块高在反复切视图 ×3 与真实 reload+切画布后逐值稳定、块高不塌陷且随行数递增',
    pass,
    `整理后：卡高=${JSON.stringify(arranged.hs)} inline=${JSON.stringify(arranged.inlineH)} 间距=${JSON.stringify(arranged.gaps)} y=${JSON.stringify(arranged.ys)}｜反复切换各次卡高=${JSON.stringify(seq.map((s) => s.hs))} 各次间距=${JSON.stringify(seq.map((s) => s.gaps))}｜reload 后：卡高=${JSON.stringify(reopened.hs)} inline=${JSON.stringify(reopened.inlineH)} 间距=${JSON.stringify(reopened.gaps)} y=${JSON.stringify(reopened.ys)}`);
} catch (e) {
  t('Q7 需求②稳定', false, '异常：' + (e && e.message));
}

/* ---- 收尾 ---- */
const passN = R.filter((r) => r.pass).length;
console.log('\n=== QA 独立复验 v7.18 结果 ===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n       ${r.detail}`);
console.log(`\n合计 ${passN}/${R.length}`);
ws.close();
try { killTree(proc.pid); } catch { /* ignore */ }
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(passN === R.length ? 0 : 1);
