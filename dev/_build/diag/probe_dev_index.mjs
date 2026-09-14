import path from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 开发态检查（指导书第 10 节 P3）：src/index.html 直接双击（file://）能否正常跑
   用法：headless Edge --remote-debugging-port=9222 起好后： node _build/diag/probe_dev_index.mjs
   断言：① 无 Console/页面报错；② 切片完好性（两步，取代旧的写死条数）——
         ②a 片数下限：实际加载的 JS/CSS 片数 ≥ 基线（抓「文件与标签一起删」的一致删除）；
         ②b 目录↔页面一致：src/ 目录计数 == 页面 <script src>/<link> 条数（抓「加了片但忘接线」）；
        ③ 骨架渲染出块、拼接栏与顶栏在位、样式真生效；④ 跨片全局函数可用（证明加载顺序正确）；
        ⑤ 编辑器能开（真实鼠标点「⤢ 放大」）、带入块文本、能打字、着色层与状态栏随之更新；
        ⑥ localStorage 正常写入。
   已知差异（指导书第 7 节）：只有第 1 片带 'use strict'，开发态第 2 片起跑在非严格模式 —— 属预期。
*/
const SRC_DIR = path.resolve(HERE, '../../src');
/* 目录实况（供「目录↔页面一致」断言） */
const EXPECT_JS  = readdirSync(path.join(SRC_DIR, 'js')).filter(f => f.endsWith('.js')).length;
const EXPECT_CSS = readdirSync(path.join(SRC_DIR, 'styles')).filter(f => f.endsWith('.css')).length;
/* 片数「下限」基线（golden 下限，抓一致删除）——沿革：v7.7 = 16/7 → v7.8 = 19/9。
   只作下限：以后加片无需改这里（加片不会触发下限）；减片（哪怕文件与 <script> 标签一起删）会红。
   之所以同时保留「下限」与「目录↔页面一致」两步，是为了既不假红（加片）、又不丢保护（减片）：
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
const domJsNow  = await evalJS('document.querySelectorAll("script[src]").length');
const domCssNow = await evalJS('document.querySelectorAll("link[rel=stylesheet]").length');
t('切片数下限：实际加载 JS ≥ ' + BASE_JS_MIN + ' / CSS ≥ ' + BASE_CSS_MIN + '（v7.8 基线，抓一致删除）',
  domJsNow >= BASE_JS_MIN && domCssNow >= BASE_CSS_MIN, 'dom=' + domJsNow + '/' + domCssNow);
t('切片目录↔页面一致：readdir 计数 == 外链条数（抓加片漏接线）',
  domJsNow === EXPECT_JS && domCssNow === EXPECT_CSS, 'dir=' + EXPECT_JS + '/' + EXPECT_CSS + ' dom=' + domJsNow + '/' + domCssNow);
t('骨架渲染出块', (await evalJS('document.querySelectorAll(".block").length')) > 0, 'blocks=' + await evalJS('document.querySelectorAll(".block").length'));
t('拼接栏在位', await evalJS('!!document.getElementById("spSplice") || !!document.querySelector(".splice-panel")'));
t('样式真生效（.block 有背景色）', (await evalJS('getComputedStyle(document.querySelector(".block")).backgroundColor')) !== 'rgba(0, 0, 0, 0)', await evalJS('getComputedStyle(document.querySelector(".block")).backgroundColor'));
const missing = JSON.parse(await evalJS('JSON.stringify(["render","renderSplice","applyTemplate","hlToHTML","panStep","openCtxMenu","openBlockEditor"].filter(f => typeof window[f] !== "function"))'));
t('跨片全局函数全部可用（加载顺序正确）', missing.length === 0, 'missing=' + JSON.stringify(missing));

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
      await evalJS('closeBlockEditor && closeBlockEditor()');
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
