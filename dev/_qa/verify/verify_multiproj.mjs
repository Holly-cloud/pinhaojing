#!/usr/bin/env node
/* 拼好镜 · 临时自检：v7.18 多项目容器 + 需求②「间距不均」渲染时机修复（真机 headless Edge + CDP）
   ---------------------------------------------------------------------------
   自起浏览器（无需外部先起），一条命令复现 3 个真机场景：

     T1 多项目切换保数据：两个项目各写各的块 → 来回切换，各自内容逐字保留、互不串味
        （新建项目 = 零块 + 名称「项目 N」；当前项在菜单里标 ●）
     T2 迁移 v16→v17 零丢失 + 观感不变：把 v16 老结构写进 localStorage → 真实 reload →
        恰合成 1 个项目、块/pan/zoom/splice/title 逐字保留、切画布后块仍在且有非零高度
     T3 需求②「间距不均」：3 个不同行数块整理后量高度/间距 → 真实 reload → 再切画布 →
        高度仍非零、随行数递增、间距与整理当时一致（不塌陷）

   用法：node dev/_qa/verify/verify_multiproj.mjs
        （端口固定自动选；如需指定浏览器 PHJ_BROWSER=<exe>，起始端口 PHJ_BROWSER_PORT）
   ------------------------------------------------------------------------- */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact } from '../lib/test-artifact.mjs';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_BUILD = buildTestArtifact();
const TARGET = 'file:///' + encodeURI(TEST_BUILD.path.replace(/\\/g, '/'));

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
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch { /* fallthrough */ } }
  try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}

/* ---- 起浏览器 ---- */
const det = detectBrowser();
if (!det.exe) { console.error('❌ 未找到可用 headless 浏览器（可设 PHJ_BROWSER）'); process.exit(3); }
const basePort = Number.parseInt(process.env.PHJ_BROWSER_PORT || '9222', 10) || 9222;
const port = await findFreePort(basePort);
if (!port) { console.error('❌ 未找到空闲端口'); process.exit(3); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_mp_'));
const proc = spawn(det.exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore', detached: false });
const ver = await waitForCDP(port, 25000);
if (!ver) { console.error('❌ CDP 就绪超时'); killTree(proc.pid); process.exit(3); }
console.log('▶ 浏览器：' + det.exe + '  端口 ' + port + '  ' + (ver['Browser'] || ''));

/* ---- 附加页面 ---- */
const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
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
async function ready() { for (let i = 0; i < 50; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); } await sleep(300); }

await send('Page.enable'); await send('Runtime.enable');
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;

/* 首次导航（清 LS）→ 固定视口 → reload 到 pristine */
await send('Page.navigate', { url: TARGET }); await ready();
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload'); await ready(); await send('Page.bringToFront').catch(() => {}); await sleep(300);

/* ---- 真机交互助手 ---- */
const clickSel = (sel) => evalJS(`(function(){ var el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; el.click(); return true; })()`);
const clickMenuByText = (txt) => evalJS(`(function(){
  var it=[].slice.call(document.querySelectorAll('#ctxMenu .ctx-item')).filter(function(e){return e.textContent.indexOf(${JSON.stringify(txt)})>=0;});
  if(!it.length) return null; it[0].click(); return it[0].textContent; })()`);
const modalFill = (val) => evalJS(`(function(){ var i=document.querySelector('#modalBody .modal-input'); if(!i) return null; i.value=${JSON.stringify(val)}; return i.value; })()`);
const modalOpen = () => evalJS(`!document.getElementById('modalMask').classList.contains('hide')`);
const ctxOpen = () => evalJS(`document.getElementById('ctxMenu').classList.contains('open')`);

const R = [];
const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail });

/* ══════════════════ T1 · 多项目切换保数据 ══════════════════ */
{
  const p1id = await evalJS('state.activeProject');
  const p1title = await evalJS('state.title');
  /* 项目 1 写入可辨识内容 */
  await evalJS("(function(){ state.blocks=[{id:'A1',text:'ALPHA_CONTENT',x:20,y:20,order:0}]; saveNow(); return state.blocks.length; })()");
  /* 真实点击顶栏「项目」→ 菜单应列出 1 个项目（● 当前 + 新建/重命名/删除） */
  await clickSel('#btnProj'); await sleep(200);
  const menu1 = await ctxOpen();
  const menuText = await evalJS("[].slice.call(document.querySelectorAll('#ctxMenu .ctx-item')).map(function(e){return e.textContent;})");
  /* 点「＋ 新建项目」→ 填名 → 确定 */
  await clickMenuByText('新建项目'); await sleep(200);
  const nmOpen = await modalOpen();
  await modalFill('项目 Beta'); await clickSel('#modalOk'); await sleep(250);
  const afterNew = await evalJS("({ n: state.projects.length, title: state.title, blocks: state.blocks.length, active: state.activeProject })");
  /* 项目 Beta 写入可辨识内容 */
  await evalJS("(function(){ state.blocks=[{id:'B1',text:'BETA_CONTENT',x:20,y:20,order:0}]; saveNow(); return 1; })()");
  /* 切回项目 1（真实点击菜单里那一项） */
  await clickSel('#btnProj'); await sleep(180);
  const switchLabel = await clickMenuByText(p1title); await sleep(250);
  const backToP1 = await evalJS("({ title: state.title, txt: state.blocks[0] && state.blocks[0].text, active: state.activeProject })");
  /* 校验 Beta 槽内容仍在 */
  const betaSlot = await evalJS("(function(){ var s=state.projects.filter(function(p){return p.title==='项目 Beta';})[0]; return s && s.blocks[0] ? s.blocks[0].text : null; })()");
  /* 再切到 Beta */
  await clickSel('#btnProj'); await sleep(180);
  await clickMenuByText('项目 Beta'); await sleep(250);
  const backToBeta = await evalJS("({ title: state.title, txt: state.blocks[0] && state.blocks[0].text })");

  const pass = menu1 && nmOpen && afterNew.n === 2 && afterNew.title === '项目 Beta' && afterNew.blocks === 0
    && backToP1.active === p1id && backToP1.title === p1title && backToP1.txt === 'ALPHA_CONTENT'
    && betaSlot === 'BETA_CONTENT' && backToBeta.title === '项目 Beta' && backToBeta.txt === 'BETA_CONTENT';
  t('T1 多项目切换保数据：新建【项目 Beta】= 零块；来回切换各自内容逐字保留、互不串味',
    pass,
    `菜单开=${menu1}${JSON.stringify(menuText)}｜新建弹框=${nmOpen}→projects=${afterNew.n}@「${afterNew.title}」blocks=${afterNew.blocks}｜切回「${p1title}」→title=${backToP1.title} txt=${JSON.stringify(backToP1.txt)}｜Beta 槽=${JSON.stringify(betaSlot)}｜再切 Beta→title=${backToBeta.title} txt=${JSON.stringify(backToBeta.txt)}`);
}

/* ══════════════════ T2 · 迁移 v16→v17 零丢失 + 观感不变 ══════════════════ */
{
  const V16 = {
    app: 'storyboard-prompt-panel', version: 16, title: '老档·单项目', zoom: 1.5,
    pan: { x: 33, y: -44 },
    blocks: [
      { id: 'q0', text: '第一块\n两行', x: 100, y: 50, order: 0 },
      { id: 'q1', text: '第二块', x: 20, y: 220, order: 1 }
    ],
    splice: { items: [{ type: 'block', id: 'q1' }], activeUnitId: null },
    templates: [{ id: 't1', units: [{ id: 'tu1', prefixes: ['a'], suffixes: ['b'] }] }],
    cmpl: { v: 1, items: null, gorder: null, use: { k1: { n: 2, t: 99 } } },
    collapsed: false
  };
  /* ① 纯 migrate（同进程）→ 恰 1 个项目 + 逐字保留 */
  const mig = await evalJS(`(function(){
    var m = migrate(${JSON.stringify(V16)});
    return { v:m.version, proj:m.projects && m.projects.length,
      pBlocks: m.projects[0].blocks.map(function(b){return [b.id,b.text];}),
      pPan: m.projects[0].pan, pZoom: m.projects[0].zoom, pTitle: m.projects[0].title,
      pSplice: m.projects[0].splice.items.length,
      mirrorBlocks: m.blocks.length, sameRef: m.blocks === m.projects[0].blocks,
      use: m.cmpl.use.k1 && m.cmpl.use.k1.n };
  })()`);
  /* ② 真实 reload 观感：把 V16 作为「新文档读 LS 之前」的种子注入，再 reload。
     ★不能在当前页 setItem 后就 reload —— wiring.js 挂了 window beforeunload→flush()，
       旧页卸载时会把「当前状态（T1 的 Beta）」盖回 LS。故用 addScriptToEvaluateOnNewDocument
       在新文档「读 LS 之前」写 V16（clear 脚本先注册 → 先清、再种，顺序确定）。 */
  const seedId = (await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{ localStorage.setItem('storyboard-prompt-panel:v1', " + JSON.stringify(JSON.stringify(V16)) + "); }catch(e){}",
  })).identifier;
  await send('Page.reload'); await ready();
  await evalJS("if (typeof setView === 'function') setView('canvas');"); await sleep(400);
  const after = await evalJS(`(function(){
    var cards = [].slice.call(document.querySelectorAll('.block'));
    var raw = localStorage.getItem('storyboard-prompt-panel:v1') || '';
    return { v: state.version, proj: state.projects.length, title: state.title,
      blocks: state.blocks.map(function(b){return [b.id,b.text];}),
      pan: state.pan, zoom: state.zoom, cardCount: cards.length,
      lsHasOld: raw.indexOf('老档·单项目') >= 0,
      cardH: cards.map(function(c){return c.offsetHeight;}) };
  })()`);
  /* 摘除「清 LS」与「种 V16」两个新文档脚本，供 T3 干净起点 */
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedId });
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });
  const pass = mig.v === 17 && mig.proj === 1 && mig.sameRef === true
    && JSON.stringify(mig.pBlocks) === JSON.stringify([['q0', '第一块\n两行'], ['q1', '第二块']])
    && mig.pPan.x === 33 && mig.pPan.y === -44 && mig.pZoom === 1.5 && mig.pTitle === '老档·单项目' && mig.pSplice === 1 && mig.use === 2
    && after.v === 17 && after.proj === 1 && after.title === '老档·单项目' && after.lsHasOld === true
    && JSON.stringify(after.blocks) === JSON.stringify(mig.pBlocks) && after.pan.x === 33 && after.zoom === 1.5
    && after.cardCount === 2 && after.cardH.every(function(h){ return h > 0; });
  t('T2 迁移 v16→v17 零丢失 + 观感不变：恰合成 1 个项目；块/pan/zoom/splice/title/use 逐字保留；reload 后切画布块仍在且高度非零',
    pass,
    `migrate：v=${mig.v} projects=${mig.proj} 同引用=${mig.sameRef} 块=${JSON.stringify(mig.pBlocks)} pan=(${mig.pPan.x},${mig.pPan.y}) zoom=${mig.pZoom} title=「${mig.pTitle}」 splice=${mig.pSplice} use.k1.n=${mig.use}｜reload 后：v=${after.v} projects=${after.proj} title=「${after.title}」 块=${JSON.stringify(after.blocks)} pan=(${after.pan.x},${after.pan.y}) zoom=${after.zoom} 卡片=${after.cardCount} 高度=${JSON.stringify(after.cardH)} LS 含老档=${after.lsHasOld}`);
  /* 复位：清 LS，供 T3 干净起点（清 LS 脚本已摘除，就地清即可） */
  await evalJS("(function(){ try{ localStorage.clear(); }catch(e){} return 1; })()");
}

/* ══════════════════ T3 · 需求②「间距不均」：重开 + 切画布后间距一致 ══════════════════ */
{
  /* 测量器注入到「新文档即运行」→ reload 后仍可用 */
  const MEASURE_SRC = `window.__mpMeasure=function(){
    var cs=[].slice.call(document.querySelectorAll('.block')); var byId={};
    cs.forEach(function(c){ byId[c.dataset.id]=c; });
    var hs=state.blocks.map(function(b){ return byId[b.id]?byId[b.id].offsetHeight:0; });
    var taH=state.blocks.map(function(b){ var c=byId[b.id]; var ta=c&&c.querySelector('.block-text'); return ta?ta.offsetHeight:0; });
    var lines=state.blocks.map(function(b){ return (b.text||'').split('\\n').length; });
    var ys=state.blocks.slice().sort(function(a,b){return a.order-b.order;}).map(function(b){return b.y;});
    var gaps=[]; for(var i=1;i<ys.length;i++) gaps.push(ys[i]-ys[i-1]);
    return { hs:hs, taH:taH, lines:lines, ys:ys, gaps:gaps };
  };`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MEASURE_SRC });
  await evalJS(MEASURE_SRC);   /* 注入脚本只对新文档生效 → 当前页就地定义一次 */

  /* 3 个不同行数块（2 / 8 / 16 行，均超过 .block-text 的 84px 下限），固定 y 间距 150 */
  await evalJS(`(function(){
    state.blocks = [
      { id:'LA', text:'甲\\n乙', x:20, y:20,  order:0 },
      { id:'LB', text:'一\\n二\\n三\\n四\\n五\\n六\\n七\\n八', x:20, y:170, order:1 },
      { id:'LC', text:'a\\nb\\nc\\nd\\ne\\nf\\ng\\nh\\ni\\nj\\nk\\nl\\nm\\nn\\no\\np', x:20, y:320, order:2 }
    ];
    setView('canvas'); arrangeAll(); saveNow(); return window.__mpMeasure();
  })()`);
  const setup = await evalJS('window.__mpMeasure()');

  /* 真实 reload（模拟「重开后」），再切回画布 */
  await send('Page.reload'); await ready();
  await evalJS("if (typeof setView === 'function') setView('canvas');"); await sleep(450);
  const reopened = await evalJS('window.__mpMeasure()');

  const inc = (a) => a[0] <= a[1] && a[1] <= a[2] && a[2] > a[0];   /* 非递减 + 首尾严格递增（防下限全压平） */
  const nonzero = (a) => a.every(function(h){ return h > 0; });
  const gapsOk = (g) => g.every(function(x){ return x > 0; });
  /* 真不变量：reopen 后间距与「整理当时」逐值一致（不塌陷），且每段间距为正。
     （arrangeAll 会按当前卡高重排 y，故间距不是固定 150 —— 关键是「重开前后一致」。） */
  const sameGaps = JSON.stringify(setup.gaps) === JSON.stringify(reopened.gaps) && gapsOk(reopened.gaps);
  const pass = nonzero(setup.hs) && nonzero(reopened.hs) && inc(setup.hs) && inc(reopened.hs) && sameGaps;
  t('T3 需求②「间距不均」：整理后块高随行数非递减且首尾严格递增、全非零；真实 reopen + 切画布后仍非零、间距与整理当时一致（不塌陷）',
    pass,
    `整理时：行数=${JSON.stringify(setup.lines)} 卡高=${JSON.stringify(setup.hs)} 编辑框=${JSON.stringify(setup.taH)} 间距=${JSON.stringify(setup.gaps)}｜reopen 后：卡高=${JSON.stringify(reopened.hs)} 编辑框=${JSON.stringify(reopened.taH)} 间距=${JSON.stringify(reopened.gaps)}｜看板 y=${JSON.stringify(reopened.ys)}`);
}

/* ══════════════════ T4 · 新建项目默认名（nextProjectName：不跳号 / 删后不重名）══════════════════ */
{
  /* 干净起点：用「新文档即清 LS」脚本确保 reload 后为默认单项目（「未命名分镜」）——
     避免旧页 beforeunload→flush 把上一场景的状态写回 LS。 */
  const t4clear = (await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{ localStorage.clear(); }catch(e){}" })).identifier;
  await send('Page.reload'); await ready();
  const titles0 = await evalJS("state.projects.map(function(p){return p.title;})");
  const readDef = () => evalJS("(function(){ var i=document.querySelector('#modalBody .modal-input'); return i?i.value:null; })()");
  const typeName = (name) => evalJS("(function(){ var i=document.querySelector('#modalBody .modal-input'); if(!i) return null; i.value=" + JSON.stringify(name) + "; return i.value; })()");

  /* ① 首建 → 期望「项目 1」 */
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('新建项目'); await sleep(160);
  const def1 = await readDef();
  await clickSel('#modalOk'); await sleep(200);
  const titles1 = await evalJS("state.projects.map(function(p){return p.title;})");

  /* ② 再建 → 期望「项目 2」 */
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('新建项目'); await sleep(160);
  const def2 = await readDef();
  await clickSel('#modalOk'); await sleep(200);
  const titles2 = await evalJS("state.projects.map(function(p){return p.title;})");

  /* ③ 删「项目 1」后再建 → 期望「项目 3」，且**不与现存任何项目重名** */
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('项目 1'); await sleep(220);            /* 切到「项目 1」（删前须先切到它） */
  const nowActive = await evalJS('state.title');
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('删除当前项目'); await sleep(200);
  const delModal = await modalOpen();
  await clickSel('#modalOk'); await sleep(240);                 /* 确认删除 */
  const titles3 = await evalJS("state.projects.map(function(p){return p.title;})");
  await clickSel('#btnProj'); await sleep(160);
  await clickMenuByText('新建项目'); await sleep(160);
  const def3 = await readDef();
  const titlesAfter = await evalJS("state.projects.map(function(p){return p.title;})");
  await clickSel('#modalCancel'); await sleep(160);             /* 只读默认名 → 取消，不真建 */
  const noDup = titlesAfter.indexOf(def3) < 0;

  const pass = def1 === '项目 1' && def2 === '项目 2'
    && titles1.indexOf('项目 1') >= 0 && titles2.indexOf('项目 1') >= 0 && titles2.indexOf('项目 2') >= 0
    && nowActive === '项目 1' && delModal === true && titles3.indexOf('项目 1') < 0 && titles3.indexOf('项目 2') >= 0
    && def3 === '项目 3' && noDup === true;
  t('T4 新建项目默认名：首建「项目 1」→ 再建「项目 2」→ 删「项目 1」后再建「项目 3」（不与现存重名）',
    pass,
    `初始=${JSON.stringify(titles0)}｜①def=${def1}→${JSON.stringify(titles1)}｜②def=${def2}→${JSON.stringify(titles2)}｜③切到「${nowActive}」删(弹框=${delModal})→${JSON.stringify(titles3)}；再建 def=${def3}（现存=${JSON.stringify(titlesAfter)}，不重名=${noDup}）`);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: t4clear });
}

/* ---- 收尾 ---- */
const pass = R.filter((r) => r.pass).length;
console.log('\n--- 结果 ---');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n       ${r.detail}`);
console.log(`\n合计 ${pass}/${R.length}`);
ws.close();
try { killTree(proc.pid); } catch { /* ignore */ }
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(pass === R.length ? 0 : 1);
