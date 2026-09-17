#!/usr/bin/env node
/* 拼好镜 · 一键验收闸门 runner（自包含 / 零依赖 / 只用 node 内建模块）
   ---------------------------------------------------------------------------
   用法：  node dev/_qa/run-gate.mjs
   作用：  自动定位浏览器 → 自动选空闲调试端口 → 起 headless 浏览器 → 依次跑全部闸门
          → 无论成败回收浏览器与临时 profile → 汇总各闸门通过数 → 语义化退出码。

   闸门顺序（与 README「改完必过的闸门」一致）：
     [1] 构建           dev/build.mjs                       期望 230494 B（v7.14）
     [2] 等价性校验     verify/verify_build_equivalence.mjs 期望 PASS（构建可复现：对 snapshots/PHJ_v7.14_20260917.html 含 banner 逐字节一致）
     [3] 回归 verify_v7 verify/verify_v7.mjs                期望 83/83（**体积限制已解除** → B10a/B10b/C8a/C8b 四条体积断言已删除）
     [4] F 组 verify_v76 verify/verify_v76.mjs              期望 18/18
     [5] G 组 verify_v77 verify/verify_v77.mjs              期望 16/16
     [6] v7.8 verify_v78 verify/verify_v78.mjs              期望 H+I+X+P1+P2+P3+R1+R3+R4 53/53（v7.8.2 的 40 + P1 构建器 4 + P2 收口 2 + P3 1 + R0 导出面内容契约 1 + R1 皮肤边界/语料归属 2 + **R3-A/R3-B 皮肤棘轮/零泄漏 2** + **R4 皮肤可摘除 1**）；标签仍沿用「H+I」以兼容本脚本的汇总解析
     [7] 开发态         diag/probe_dev_index.mjs             期望 18/18

   环境变量：
     PHJ_BROWSER      浏览器 exe 绝对路径（**硬覆盖**：设置后即以其为准；不可用则报错退出 10，绝不静默回落到自动探测）
     PHJ_BROWSER_PORT 起始调试端口，默认 9222；若被占用则自动顺延（+1…+49）

   退出码（语义化）：
     0  = 全绿
     1  = 构建失败         2 = 等价性失败      3 = verify_v7 失败
     4  = verify_v76 失败  5 = verify_v77 失败 6 = verify_v78 失败
     7  = probe_dev_index 失败
     10 = 未找到浏览器     11 = 未找到空闲端口 12 = CDP 就绪超时

   为什么本 runner 必须自己「起浏览器 → 跑断言 → 杀进程」：
     本仓库的验收脚本（verify_ / probe_ 系列）经 http://127.0.0.1:<port>/json/ 连 headless 浏览器，
     此前依赖人工先起浏览器。本 runner 把「起—跑—收」封在一次进程内完成，任何环境一条命令即可复现；
     它同时是「端口不再硬编码」的执行侧——把选中的端口经 PHJ_BROWSER_PORT 传给各闸门脚本。
*/
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserCandidates, detectBrowser } from './lib/browser-detect.mjs';

/* ── 路径：一律相对本文件解析，不硬编码任何机器绝对路径 ── */
const HERE = path.dirname(fileURLToPath(import.meta.url));      // dev/_qa
const ROOT = path.resolve(HERE, '..', '..');                    // 项目根（PHJ.html 所在层）
const NODE = process.execPath;                                  // 当前 node，避免写死安装路径

const SCRIPTS = {
  build:  path.join(ROOT, 'dev', 'build.mjs'),
  equiv:  path.join(HERE, 'verify', 'verify_build_equivalence.mjs'),
  v7:     path.join(HERE, 'verify', 'verify_v7.mjs'),
  v76:    path.join(HERE, 'verify', 'verify_v76.mjs'),
  v77:    path.join(HERE, 'verify', 'verify_v77.mjs'),
  v78:    path.join(HERE, 'verify', 'verify_v78.mjs'),
  devidx: path.join(HERE, 'diag', 'probe_dev_index.mjs'),
};

const GATE_META = {
  build:  { no: 1, label: '构建 build.mjs',        code: 1 },
  equiv:  { no: 2, label: '等价性校验',             code: 2 },
  v7:     { no: 3, label: '回归 verify_v7',         code: 3 },
  v76:    { no: 4, label: 'F 组 verify_v76',        code: 4 },
  v77:    { no: 5, label: 'G 组 verify_v77',        code: 5 },
  v78:    { no: 6, label: 'v7.8 verify_v78',        code: 6 },
  devidx: { no: 7, label: '开发态 probe_dev_index', code: 7 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. 自动定位浏览器 ──
   探测逻辑抽到共享模块 lib/browser-detect.mjs（run-gate.mjs 与 diag/spike_emulate_media.mjs 复用，
   不再各自硬编码浏览器路径）。此处仅保留「如何呈现结果」的分支。 */

/* ── 2. 自动选空闲端口 ── */
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
  for (let p = base; p < base + span && p <= 65535; p++) {
    if (await isPortFree(p)) return p;
  }
  return null;
}

/* ── 3. 等 CDP 就绪 ── */
async function waitForCDP(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* 尚未监听，继续轮询 */ }
    await sleep(250);
  }
  return null;
}

/* ── 4. 回收：杀进程树 + 清理临时 profile（Windows 下文件常被锁，重试后降级忽略） ── */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch { /* 落到下面 */ }
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* 已退出 */ }
}

async function rmProfile(dir) {
  for (let i = 0; i < 6; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      if (!fs.existsSync(dir)) return true;
    } catch { /* 文件被锁，稍后重试 */ }
    await sleep(250 * (i + 1));
  }
  return !fs.existsSync(dir);
}

async function cleanup(browserProc, prof) {
  try { if (browserProc) killTree(browserProc.pid); } catch { /* 忽略 */ }
  await sleep(400);
  try {
    const removed = await rmProfile(prof);
    if (!removed) console.warn('\n⚠️  临时 profile 未能完全删除（Windows 文件锁），已降级忽略：' + prof);
  } catch { /* 忽略 */ }
}

/* ── 5. 跑一个闸门（子进程 = 当前 node；stdout/stderr 原样透出） ── */
function runNode(scriptPath, port) {
  if (!fs.existsSync(scriptPath)) return { status: 127, stdout: '', stderr: '闸门脚本缺失：' + scriptPath };
  const r = spawnSync(NODE, [scriptPath], {
    cwd: ROOT,
    env: { ...process.env, PHJ_BROWSER_PORT: String(port) },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status == null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function emit(r) {
  if (r.stdout) process.stdout.write(r.stdout.endsWith('\n') ? r.stdout : r.stdout + '\n');
  if (r.stderr) process.stderr.write(r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n');
}

function num(out, re) {
  const m = out.match(re);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/* ═══════════════════════════ 主流程 ═══════════════════════════ */
async function main() {
  const t0 = Date.now();
  console.log('╔══════════════ 拼好镜 · 一键验收闸门 ══════════════╗');
  console.log('║ 根目录：' + ROOT);
  console.log('║ node  ：' + NODE + '  (' + process.version + ')');
  console.log('╚═══════════════════════════════════════════════════╝');

  /* ---- 定位浏览器 ---- */
  const det = detectBrowser();
  const browser = det.exe;
  if (!browser) {
    if (det.pinned) {
      console.error('\n❌ PHJ_BROWSER 指向的浏览器不可用：' + det.pinnedPath);
      console.error('   PHJ_BROWSER 为「硬覆盖」语义——显式钉住即以其为准，绝不会静默回落到自动探测。');
      console.error('   请把路径改成一个真实存在的浏览器 exe，或取消 PHJ_BROWSER 让 runner 自动探测。');
    } else {
      console.error('\n❌ 未找到可用的 headless 浏览器（Edge / Chrome）。');
      console.error('   已探测以下候选路径：');
      for (const c of browserCandidates()) console.error('     - ' + c);
      console.error('\n   解决方式（任选其一）：');
      console.error('     A. 安装 Microsoft Edge（本仓验收默认浏览器）；或');
      console.error('     B. 设置环境变量 PHJ_BROWSER 指向浏览器 exe（硬覆盖），例如：');
      console.error('          set PHJ_BROWSER=C:\\path\\to\\msedge.exe        (cmd)');
      console.error('          $env:PHJ_BROWSER="C:\\path\\to\\msedge.exe"   (PowerShell)');
      console.error('   另可用 PHJ_BROWSER_PORT 指定起始调试端口（默认 9222）。');
    }
    return 10;
  }
  console.log('\n▶ 浏览器：' + browser + (det.pinned ? '（PHJ_BROWSER 硬覆盖）' : '（自动探测）'));

  /* ---- 选端口 ---- */
  const basePort = Number.parseInt(process.env.PHJ_BROWSER_PORT || '9222', 10) || 9222;
  const port = await findFreePort(basePort);
  if (!port) {
    console.error('\n❌ 未找到空闲调试端口（已从 ' + basePort + ' 起扫描 50 个）。');
    console.error('   请释放端口或设置 PHJ_BROWSER_PORT 指定其它起始端口。');
    return 11;
  }
  console.log('▶ 调试端口：' + port + (port === basePort ? '' : '（' + basePort + ' 被占用，已自动顺延）'));

  /* ---- 起 headless 浏览器 ---- */
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phj_gate_'));
  let spawnErr = null;
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + prof,
    'about:blank',
  ], { stdio: 'ignore', detached: false });
  proc.on('error', (e) => { spawnErr = e; });

  const results = [];
  let exitCode = 0;

  try {
    const ver = await waitForCDP(port, 25000);
    if (!ver) {
      console.error('\n❌ CDP 就绪超时：25s 内未在 http://127.0.0.1:' + port + '/json/version 得到响应。');
      console.error('   可能原因：浏览器被安全策略拦截 / 启动参数不兼容 / 机器负载过高。');
      if (spawnErr) console.error('   浏览器启动错误：' + spawnErr.message);
      console.error('   手动验证："' + browser + '" --headless=new --remote-debugging-port=' + port + ' about:blank');
      exitCode = 12;
      return exitCode;
    }
    console.log('▶ CDP 就绪：' + (ver['Browser'] || 'headless') + '\n');

    /* ---- [1] 构建 ---- */
    console.log('\n━━━ [1/7] 构建：dev/build.mjs ━━━');
    {
      const r = runNode(SCRIPTS.build, port); emit(r);
      let size = null;
      try { size = fs.statSync(path.join(ROOT, 'PHJ.html')).size; } catch { /* 未产出 */ }
      const ok = r.status === 0;
      results.push({ key: 'build', ok, detail: ok ? String(size != null ? size : '?') + ' B' : '构建失败（exit ' + r.status + '）' });
      if (!ok) { exitCode = 1; return exitCode; }
    }

    /* ---- [2] 等价性 ---- */
    console.log('\n━━━ [2/7] 等价性：verify_build_equivalence.mjs ━━━');
    {
      const r = runNode(SCRIPTS.equiv, port); emit(r);
      const detail = r.status === 0 ? 'PASS（构建可复现）' : r.status === 2 ? '历史语义/仅格式差异（非严格）' : 'FAIL';
      const ok = r.status === 0;
      results.push({ key: 'equiv', ok, detail });
      if (!ok) { exitCode = 2; return exitCode; }
    }

    /* ---- [3] verify_v7 ---- */
    console.log('\n━━━ [3/7] 回归：verify_v7.mjs ━━━');
    {
      const r = runNode(SCRIPTS.v7, port); emit(r);
      const n = num(r.stdout, /结果：(\d+)\s*通过\s*\/\s*(\d+)\s*失败/);
      const ok = r.status === 0;
      results.push({ key: 'v7', ok, detail: n ? n[0] + '/' + (n[0] + n[1]) : '未取到汇总（exit ' + r.status + '）' });
      if (!ok) { exitCode = 3; return exitCode; }
    }

    /* ---- [4] verify_v76 ---- */
    console.log('\n━━━ [4/7] F 组：verify_v76.mjs ━━━');
    {
      const r = runNode(SCRIPTS.v76, port); emit(r);
      const n = num(r.stdout, /F 组合计\s*(\d+)\/(\d+)/);
      const ok = r.status === 0;
      results.push({ key: 'v76', ok, detail: n ? 'F ' + n[0] + '/' + n[1] : '未取到汇总（exit ' + r.status + '）' });
      if (!ok) { exitCode = 4; return exitCode; }
    }

    /* ---- [5] verify_v77 ---- */
    console.log('\n━━━ [5/7] G 组：verify_v77.mjs ━━━');
    {
      const r = runNode(SCRIPTS.v77, port); emit(r);
      const n = num(r.stdout, /G 组合计\s*(\d+)\/(\d+)/);
      const ok = r.status === 0;
      results.push({ key: 'v77', ok, detail: n ? 'G ' + n[0] + '/' + n[1] : '未取到汇总（exit ' + r.status + '）' });
      if (!ok) { exitCode = 5; return exitCode; }
    }

    /* ---- [6] verify_v78 ---- */
    console.log('\n━━━ [6/7] v7.8：verify_v78.mjs ━━━');
    {
      const r = runNode(SCRIPTS.v78, port); emit(r);
      const n = num(r.stdout, /H\+I 组合计\s*(\d+)\/(\d+)/);
      const ok = r.status === 0;
      results.push({ key: 'v78', ok, detail: n ? 'H+I ' + n[0] + '/' + n[1] : '未取到汇总（exit ' + r.status + '）' });
      if (!ok) { exitCode = 6; return exitCode; }
    }

    /* ---- [7] probe_dev_index ---- */
    console.log('\n━━━ [7/7] 开发态：probe_dev_index.mjs ━━━');
    {
      const r = runNode(SCRIPTS.devidx, port); emit(r);
      const n = num(r.stdout, /开发态合计\s*(\d+)\/(\d+)/);
      const ok = r.status === 0;
      results.push({ key: 'devidx', ok, detail: n ? n[0] + '/' + n[1] : '未取到汇总（exit ' + r.status + '）' });
      if (!ok) { exitCode = 7; return exitCode; }
    }

    exitCode = 0;
    return exitCode;
  } catch (e) {
    console.error('\n❌ runner 异常：' + (e && e.stack ? e.stack : e));
    exitCode = 99;
    return exitCode;
  } finally {
    renderSummary(results, exitCode, Date.now() - t0);
    await cleanup(proc, prof);
  }
}

/* ── 汇总渲染 ── */
/* 显示宽度：CJK 全角字符按 2 列计，避免汇总表错位 */
const dispWidth = (s) => [...s].reduce(
  (w, ch) => w + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0);
const padW = (s, n) => s + ' '.repeat(Math.max(0, n - dispWidth(s)));

function renderSummary(results, exitCode, elapsedMs) {
  const by = new Map(results.map((r) => [r.key, r]));
  console.log('\n╔════════════════════ 闸门汇总 ════════════════════╗');
  for (const key of ['build', 'equiv', 'v7', 'v76', 'v77', 'v78', 'devidx']) {
    const meta = GATE_META[key];
    const r = by.get(key);
    const mark = r && r.ok ? '✅' : (r ? '❌' : '⏭️');
    const detail = r ? r.detail : '未执行（前置闸门失败）';
    console.log('  ' + mark + ' [' + meta.no + '] ' + padW(meta.label, 24) + ' → ' + detail);
  }
  const ran = results.length;
  const passed = results.filter((r) => r.ok).length;
  console.log('╚══════════════════════════════════════════════════╝');
  if (exitCode === 0) {
    console.log('  结果：7/7 全绿 ✅   （耗时 ' + (elapsedMs / 1000).toFixed(1) + 's）');
  } else {
    const failed = GATE_META[results.find((r) => !r.ok)?.key];
    console.log('  结果：' + passed + '/' + ran + ' 通过 ❌ —— ' +
      (failed ? '失败闸门 = [' + failed.no + '] ' + failed.label + '（退出码 ' + exitCode + '）' : '退出码 ' + exitCode) +
      '   （耗时 ' + (elapsedMs / 1000).toFixed(1) + 's）');
  }
}

/* ═══════════════════════════ 入口 ═══════════════════════════ */
let code = 99;
try {
  code = await main();
} catch (e) {
  console.error('fatal: ' + (e && e.stack ? e.stack : e));
  code = 99;
}
process.exit(code);
