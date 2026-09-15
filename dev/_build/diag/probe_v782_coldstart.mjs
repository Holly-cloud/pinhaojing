/* v7.8.2 自检 · 冷启动「零动作」取证 + 内置风格包逐字活断言（真机 headless Edge + CDP）
   ---------------------------------------------------------------------------
   用法：node dev/_build/diag/probe_v782_coldstart.mjs
   自包含：自己起 headless Edge（临时 profile + 自动选空闲端口）→ 跑断言 → 自收浏览器。
   检查项：
     C1 冷启动（state.cmpl.items === null，未物化）时打开「补」窗 → 「风格包」组**直接就是真实风格包**
        （7 条：全套 + 5 段 + 硬性要求），且不含任何「示例（请替换）」标记。
     C2 **逐字活断言**：内置 cmplSeedItems() 的「风格包」组 body 与 v7.8 原文（运行时从
        dev/_build/snapshots/PHJ_v7.8_20260913.html 提取的夹具）**逐字相同**（5 段 + 硬性要求）。
   期望结果：在 v7.8.2 交付产物上 C0/C1/C2 全 PASS（合计 3/3），退出码 0。
   退出码：0 = 全绿；1 = 存在失败（证伪用：故意改字后应退出 1）。 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowser } from '../lib/browser-detect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 夹具：从 v7.8 快照运行时提取（与 verify_v78.mjs 同口径） ── */
const SNAP = path.join(ROOT, 'dev', '_build', 'snapshots', 'PHJ_v7.8_20260913.html');
if (!fs.existsSync(SNAP)) { console.error('夹具快照缺失：' + SNAP); process.exit(3); }
const SNAP_TXT = fs.readFileSync(SNAP, 'utf8');
const STYLE_BLOCK = (SNAP_TXT.match(/var CMPL_STYLE = \[([\s\S]*?)\];/) || [])[1] || '';
const FIX_LABELS = [...STYLE_BLOCK.matchAll(/label:\s*'([^']*)'/g)].map((m) => m[1]);
const FIX_PARTS = [...STYLE_BLOCK.matchAll(/body:\s*'([^']*)'/g)].map((m) => m[1]);
const FIX_TAIL = ((SNAP_TXT.match(/var CMPL_TAIL = '([^']*)';/) || [])[1]) || '';
if (FIX_PARTS.length !== 5 || FIX_LABELS.length !== 5 || !FIX_TAIL) { console.error('夹具提取失败'); process.exit(3); }
const FIX_FULL = '风格：\n' + FIX_PARTS.join('\n') + '\n\n' + FIX_TAIL;

/* ── 起浏览器 ── */
const browser = detectBrowser().exe;
if (!browser) { console.error('未找到浏览器'); process.exit(10); }
function isPortFree(p) { return new Promise((res) => { const s = net.createServer(); let d = false; const f = (v) => { if (!d) { d = true; res(v); } }; s.once('error', () => f(false)); s.once('listening', () => s.close(() => f(true))); try { s.listen(p, '127.0.0.1'); } catch { f(false); } }); }
async function freePort(base) { for (let p = base; p < base + 50; p++) if (await isPortFree(p)) return p; return null; }
async function waitCDP(port, ms) { const end = Date.now() + ms; while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); } catch { /* poll */ } await sleep(250); } return null; }
function killTree(pid) { if (!pid) return; try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }

const port = await freePort(9300);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_cold_'));
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });

let code = 99;
try {
  const ver = await waitCDP(port, 25000);
  if (!ver) { console.error('CDP 就绪超时'); code = 12; }
  else {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === 'page' && !t.url.startsWith('edge://'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, (r) => res(r.result || r.error)); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result && r.result.value; };

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
    const TARGET = 'file:///' + encodeURI(path.join(ROOT, 'PHJ.html').replace(/\\/g, '/'));
    await send('Page.navigate', { url: TARGET });
    for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
    await send('Page.reload');
    for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
    await sleep(500);

    const R = [];
    const t = (name, pass, detail) => R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

    /* 冷启动前置：确认未物化 */
    const pre = await evalJS('({ hasCmpl: !!(state && state.cmpl), items: (state && state.cmpl) ? state.cmpl.items : "NO_STATE" })');
    t('C0 冷启动前置：state.cmpl.items === null（内置表未物化）', pre && pre.hasCmpl && pre.items === null, 'items=' + JSON.stringify(pre && pre.items));

    /* 打开「补」窗（应把真实风格包内置物化出来） */
    const cold = await evalJS(`(() => {
      openCmplCfg();
      var bodyText = (document.getElementById('cmplCfgBody') || {}).textContent || '';
      var act = cmplActive();
      var style = act.filter(function(x){ return (x.group || '') === '风格包'; });
      var full = null; act.forEach(function(x){ if(x.label === '风格包 · 全套') full = x; });
      return {
        materialized: Array.isArray(state.cmpl && state.cmpl.items),
        styleLabels: style.map(function(x){ return x.label; }),
        styleBodies: style.map(function(x){ return x.body; }),
        fullBody: full ? full.body : null,
        hasExampleMark: bodyText.indexOf('示例（请替换）') >= 0 || bodyText.indexOf('【示例·') >= 0
      };
    })()`);
    const wantLabels = ['风格包 · 全套', '光影逻辑', 'CG 风格', '镜头构图', '渲染质感', '负面提示词', '硬性要求'];
    const labelsOk = JSON.stringify(cold.styleLabels) === JSON.stringify(wantLabels);
    t('C1 冷启动「补」窗：风格包组直接呈现真实风格包（7 条 = 全套 + 5 段 + 硬性要求，零「示例（请替换）」）',
      cold.materialized && labelsOk && !cold.hasExampleMark,
      '组内=' + JSON.stringify(cold.styleLabels) + '；含示例标记=' + cold.hasExampleMark);

    /* C2 逐字活断言：内置 seed 的「风格包」组 body 与 v7.8 原文夹具逐字相同 */
    const seedStyle = await evalJS(`(() => { var s = cmplSeedItems().filter(function(x){ return (x.group||'')==='风格包'; }); return s.map(function(x){ return x.body; }); })()`);
    const expect = [FIX_FULL, FIX_PARTS[0], FIX_PARTS[1], FIX_PARTS[2], FIX_PARTS[3], FIX_PARTS[4], FIX_TAIL];
    let verbDiff = 0;
    for (let i = 0; i < expect.length; i++) if (seedStyle[i] !== expect[i]) verbDiff++;
    t('C2 逐字活断言：内置 seed「风格包」组 7 条 body == v7.8 原文（运行时夹具）',
      seedStyle.length === 7 && verbDiff === 0 && cold.fullBody === FIX_FULL,
      '条数=' + seedStyle.length + '；逐字不一致=' + verbDiff + '；全套逐字=' + (cold.fullBody === FIX_FULL));

    const pass = R.filter((r) => r.pass).length;
    console.log('=== v7.8.2 冷启动 / 内置逐字 取证（真机 headless Edge + CDP）===');
    for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
    console.log(`\n合计 ${pass}/${R.length}`);
    ws.close();
    code = pass === R.length ? 0 : 1;
  }
} catch (e) {
  console.error('probe 异常：' + (e && e.stack ? e.stack : e));
  code = 99;
} finally {
  killTree(proc.pid);
  await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* 文件锁降级 */ }
}
process.exit(code);
