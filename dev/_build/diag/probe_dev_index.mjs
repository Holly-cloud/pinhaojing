import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 开发态检查（指导书第 10 节 P3）：src/index.html 直接双击（file://）能否正常跑
   用法：headless Edge --remote-debugging-port=9222 起好后： node _build/diag/probe_dev_index.mjs
   断言：① 无 Console/页面报错；② 切片完好性（两步，取代旧的写死条数）——
         ②a 片数下限：dev/src/js、dev/src/styles **目录实况** ≥ 基线（抓「文件与标签一起删」的一致删除）；
         ②b 目录 == manifest：dev/src/js 片数 == manifest.SLICES 条数、styles == manifest.CSS 条数（抓「加了片但漏接线」）；
        ③ 骨架渲染出块、拼接栏与顶栏在位、样式真生效；
        ④ 开发态≡产物的作用域：index.html 的 JS 链**恰为** ./dev-bundle.js（且该文件存在）、
           内部符号**不再泄漏到全局**（P1 起产物与开发态跑同一个 IIFE）；
        ⑤ 编辑器能开（真实鼠标点「⤢ 放大」）、带入块文本、能打字、着色层与状态栏随之更新；
        ⑥ localStorage 正常写入。
   —— P1（2026-09-16）：dev/src/index.html 不再手写 19 个 <script src>，改引**由同一份代码生成**的
      dev/src/dev-bundle.js（= 产物内联 JS 段逐字）→ 开发态与产物**同作用域 / 同顺序 / 同字节**；
      故旧断言「跨片全局函数在 window 上可用」按其**反面**重写为「内部符号不泄漏全局」（断言数不变）。
*/
const SRC_DIR = path.resolve(HERE, '../../src');
/* manifest = 唯一顺序源（P1）；用其条数校验「目录实况 == manifest」，抓加片漏接线。 */
const MANIFEST = (await import(pathToFileURL(path.resolve(HERE, '../../manifest.mjs')).href)).default;
const SLICES_N = MANIFEST.SLICES.length;
const CSS_N    = MANIFEST.CSS.length;
const BUNDLE   = path.resolve(SRC_DIR, 'dev-bundle.js');
/* 目录实况（供「目录 == manifest」断言） */
const EXPECT_JS  = readdirSync(path.join(SRC_DIR, 'js')).filter(f => f.endsWith('.js')).length;
const EXPECT_CSS = readdirSync(path.join(SRC_DIR, 'styles')).filter(f => f.endsWith('.css')).length;
/* 片数「下限」基线（golden 下限，抓一致删除）——沿革：v7.7 = 16/7 → v7.8 = 19/9（P1 未改片数）。
   只作下限：以后加片无需改这里（加片不会触发下限）；减片（哪怕文件与 <script> 标签一起删）会红。
   之所以同时保留「下限」与「目录==manifest」两步，是为了既不假红（加片）、又不丢保护（减片）：
   仅用目录实况做等值断言会产生自指——删一片则期望值同降、断言反而通过（QA 反例 A）。 */
const BASE_JS_MIN = 19, BASE_CSS_MIN = 9;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';   /* 调试端口：run-gate.mjs 经此环境变量传入，缺省 9222 */
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
const events = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    events.push('[console.' + m.params.type + '] ' + (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
  if (m.method === 'Runtime.exceptionThrown') events.push('[exception] ' + JSON.stringify(m.params.exceptionDetails).slice(0, 240));
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
    events.push('[log.' + m.params.entry.level + '] ' + m.params.entry.text.slice(0, 200));
  }
};
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return Promise.reject(new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)));
  return r.result && r.result.value;
}
const rect = async sel => JSON.parse(await evalJS('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return "null";var r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height})})()') || 'null');
async function realClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

const HERE_URL = pathToFileURL(path.resolve(HERE, '../../src/index.html')).href;
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: HERE_URL });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = []; const t = (name, cond, info) => { R.push([name, !!cond]); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (info ? '  ' + info : '')); };

console.log('=== 开发态检查：' + HERE_URL + ' ===');
t('页面标题正常', (await evalJS('document.title')) === '拼好镜', 'title=' + await evalJS('document.title'));
t('URL 确为 src/index.html', (await evalJS('location.pathname')).endsWith('/src/index.html'));
/* P1 起 index.html 只引 1 个 JS bundle（不再列 19 个 ./js/*），故「实际加载片数」改看**目录实况**。 */
t('切片文件完整：dev/src/js ≥ ' + BASE_JS_MIN + ' / dev/src/styles ≥ ' + BASE_CSS_MIN + '（抓一致删除）',
  EXPECT_JS >= BASE_JS_MIN && EXPECT_CSS >= BASE_CSS_MIN, 'dir=' + EXPECT_JS + '/' + EXPECT_CSS);
t('切片目录 == manifest：js == SLICES(' + SLICES_N + ') / styles == CSS(' + CSS_N + ')（抓加片漏接线）',
  EXPECT_JS === SLICES_N && EXPECT_CSS === CSS_N, 'dir=' + EXPECT_JS + '/' + EXPECT_CSS + ' manifest=' + SLICES_N + '/' + CSS_N);
t('骨架渲染出块', (await evalJS('document.querySelectorAll(".block").length')) > 0, 'blocks=' + await evalJS('document.querySelectorAll(".block").length'));
t('拼接栏在位', await evalJS('!!document.getElementById("spSplice") || !!document.querySelector(".splice-panel")'));
t('样式真生效（.block 有背景色）', (await evalJS('getComputedStyle(document.querySelector(".block")).backgroundColor')) !== 'rgba(0, 0, 0, 0)', await evalJS('getComputedStyle(document.querySelector(".block")).backgroundColor'));

/* ---- P1：开发态≡产物的作用域（单 bundle 链 + 内部符号不泄漏全局） ----
   P1 起开发态与产物跑**同一个 IIFE**（dev/src/dev-bundle.js = 产物内联 JS 段逐字），
   故：① index.html 的 JS 链**恰为** ['./dev-bundle.js'] 且该文件存在；
       ② 顶层声明（render/state/…）已收进 IIFE 私有作用域 → **不再**在 window 上可见。 */
const devChain = JSON.parse(await evalJS('JSON.stringify([...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src")))'));
const leaked = JSON.parse(await evalJS('JSON.stringify(["render","renderSplice","hlToHTML","openBlockEditor","applyTemplate","saveNow"].filter(f => f in window))'));
t('开发态≡产物作用域：JS 链恰为 ./dev-bundle.js（文件存在）+ 内部符号不泄漏全局',
  devChain.length === 1 && devChain[0] === './dev-bundle.js' && existsSync(BUNDLE) && leaked.length === 0,
  'chain=' + JSON.stringify(devChain) + ' bundle存在=' + existsSync(BUNDLE) + ' leaked=' + JSON.stringify(leaked));

/* ---- 编辑器：真实鼠标点块内「⤢ 放大」 ---- */
const blocker = await evalJS('(function(){var bs=[...document.querySelectorAll(".block")];for(var i=0;i<bs.length;i++){var tx=bs[i].querySelector(".block-text");if(tx&&tx.value.trim()){var r=bs[i].getBoundingClientRect();return JSON.stringify({id:bs[i].dataset.id,x:r.left+40,y:r.top+30,len:tx.value.length})}}return "null"})()');
if (!blocker || blocker === 'null') {
  t('找到带文本的块', false);
} else {
  const bk = JSON.parse(blocker);
  t('找到带文本的块', true, 'id=' + bk.id.slice(0, 8) + ' 文本长度=' + bk.len);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bk.x, y: bk.y, button: 'none', clickCount: 0 });
  await sleep(200);
  const btn = await rect('.block[data-id="' + bk.id + '"] .handle-btn[data-act="zoom"]');
  if (!btn || btn === null) { t('放大按钮可定位', false); }
  else {
    const hit = await evalJS('(function(){var e=document.elementFromPoint(' + btn.x + ',' + btn.y + ');return e?e.className+"|"+(e.dataset?e.dataset.act:""):"null"})()');
    t('放大按钮命中校验', String(hit).includes('zoom'), 'hit=' + hit);
    await realClick(btn.x, btn.y);
    await sleep(450);
    const open = await evalJS('!document.getElementById("blkMask").classList.contains("hide")');
    t('编辑器窗口打开（#blkMask 去掉 hide）', open);
    if (open) {
      const v0 = await evalJS('document.getElementById("blkInput").value.length');
      t('带入该块文本', v0 === bk.len, 'textarea=' + v0 + ' / 块=' + bk.len);
      await evalJS('document.getElementById("blkInput").focus()');
      const len0 = await evalJS('document.getElementById("blkInput").value.length');
      await send('Input.insertText', { text: '，' });
      await sleep(250);
      const len1 = await evalJS('document.getElementById("blkInput").value.length');
      t('可打字（长度增长）', len1 > len0, len0 + '→' + len1);
      t('着色层已渲染', (await evalJS('document.querySelectorAll("#blkHl span").length')) > 0, 'spans=' + await evalJS('document.querySelectorAll("#blkHl span").length'));
      t('状态栏错误数随之更新', (await evalJS('parseInt(document.getElementById("stErr").textContent,10)')) > 0, '错误=' + await evalJS('document.getElementById("stErr").textContent'));
      /* P1：closeBlockEditor 已收进 IIFE（非全局），改走真实 UI：点「取消」按钮关闭。 */
      await evalJS('document.getElementById("blkCancel").click()');
      await sleep(200);
      t('关闭后 mask 复位', await evalJS('document.getElementById("blkMask").classList.contains("hide")'));
    }
  }
}
t('localStorage 正常写入', !!(await evalJS('(function(){try{return !!localStorage.getItem("storyboard-prompt-panel:v1")}catch(e){return false}})()')));
t('无 Console 报错 / 页面异常', events.length === 0, events.length ? '\n     ' + events.slice(0, 6).join('\n     ') : '');

const pass = R.filter(r => r[1]).length;
console.log('\n开发态合计 ' + pass + '/' + R.length);
process.exit(pass === R.length ? 0 : 1);
