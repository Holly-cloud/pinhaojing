#!/usr/bin/env node
/* 交接包《09_重构施工指导书》工具链自检 —— 小汐复核 2026-09-13
   跑法：node _build/_recon_20260913/diag_handoff_spec_check.mjs
   做什么（全程只读产品文件，只在系统临时目录里铺工作副本）：
     ① 按指导书第 5/6 节行段切出 7 片 CSS + 16 片 JS，校验行数对账与「无损回拼」；
     ② 按第 7 节生成 src/index.html（只做两处标签替换）；
     ③ 跑两版构建：A = 第 8 节参考实现逐字；B = A 上把 /\\n+$/ 改成 /\\n$/（一处字符）；
     ④ 用「剥离 banner 后逐字节相等」判定各自是否与基线等价，并复算指导书声称的 155315 B。
   结论用法：A 失败 + B 通过 ⇒ 指导书第 8 节参考实现有 bug（吞掉段尾空行），不是施工方切错。
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');            // 项目根（拼好镜/）
const BASELINE = path.join(ROOT, 'PHJ.html');           // 施工前基线（只读）
const WORK = path.join(os.tmpdir(), 'phj_spec_check');  // 工作副本（可随时删）

const CSS_SPLIT = [
  ['styles/00-base.css', 8, 27], ['styles/10-canvas.css', 28, 70], ['styles/20-menu.css', 71, 79],
  ['styles/30-splice.css', 80, 140], ['styles/40-window.css', 141, 191],
  ['styles/50-editor.css', 192, 218], ['styles/90-effects.css', 219, 323]
];
const JS_SPLIT = [
  ['js/00-header.js', 419, 455], ['js/10-state.js', 456, 585], ['js/15-clipboard.js', 586, 630],
  ['js/20-render.js', 631, 660], ['js/25-overlay.js', 661, 824], ['js/30-selection.js', 825, 931],
  ['js/35-splice.js', 932, 1168], ['js/40-template.js', 1169, 1490], ['js/50-editor.js', 1491, 1673],
  ['js/55-menu.js', 1674, 1815], ['js/60-keyboard.js', 1816, 1861], ['js/62-block-size.js', 1862, 2005],
  ['js/64-zoom.js', 2006, 2068], ['js/66-pan.js', 2069, 2123], ['js/68-drag.js', 2124, 2420],
  ['js/90-boot.js', 2421, 2703]
];

const rawBuf = fs.readFileSync(BASELINE);
const rawBase = rawBuf.toString('utf8');
const LF = rawBase.replace(/\r\n/g, '\n');
const L = LF.split('\n');
const BANNER = '<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->';

console.log('=== 0. 基线指纹 ===');
console.log('  PHJ.html  bytes=' + rawBuf.length + '  sha256=' + crypto.createHash('sha256').update(rawBuf).digest('hex') +
  '  CRLF=' + (rawBase.match(/\r\n/g) || []).length +
  '  纯LF=' + (rawBase.split('\n').length - 1 - (rawBase.match(/\r\n/g) || []).length));
console.log('  banner  ' + Buffer.byteLength(BANNER, 'utf8') + ' B ｜ 指导书声称产物 = 155315 B');

console.log('\n=== 1. 行段对账 ===');
let ok = true;
const check = (split, blockA, blockB, expect) => {
  let total = 0, prev = null;
  for (const [, a, b] of split) {
    if (prev !== null && a !== prev + 1) { console.log('  ✗ 不连续：' + a + ' 接 ' + prev); ok = false; }
    prev = b; total += b - a + 1;
  }
  const joined = split.map(([, a, b]) => L.slice(a - 1, b).join('\n')).join('\n');
  const orig = L.slice(blockA - 1, blockB).join('\n');
  const lossless = joined === orig;
  console.log('  ' + (lossless ? '✓' : '✗') + ' 片数=' + split.length + ' 合计=' + total +
    '（期望 ' + expect + (total === expect ? ' ✓' : ' ✗') + '）无损回拼=' + (lossless ? '✓' : '✗'));
  ok = ok && lossless && total === expect;
  return split.map(([name, a, b]) => {
    const p = path.join(WORK, 'src', name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, L.slice(a - 1, b).join('\n') + '\n');
  });
};
console.log('  CSS：'); check(CSS_SPLIT, 8, 323, 316);
console.log('  JS ：'); check(JS_SPLIT, 419, 2703, 2285);
if (!ok) { console.error('\n❌ 行段本身有误，后续构建不必跑'); process.exit(1); }

console.log('\n=== 2. src/index.html（第 7 节：仅两处标签替换）===');
const links = CSS_SPLIT.map(([n]) => '<link rel="stylesheet" href="./' + n + '">').join('\n');
const scripts = JS_SPLIT.map(([n]) => '<script src="./' + n + '"></script>').join('\n');
const idx = L.slice(0, 6).concat([links], L.slice(324, 417), [scripts], L.slice(2704)).join('\n');
fs.writeFileSync(path.join(WORK, 'src', 'index.html'), idx);
console.log('  src/index.html 行数=' + (idx.split('\n').length));

/* --- 构建：doc=true 用指导书参考实现；doc=false 只改一处 /\\n+$/ → /\\n$/ --- */
function build(doc) {
  let html = fs.readFileSync(path.join(WORK, 'src', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const read = n => fs.readFileSync(path.join(WORK, 'src', n), 'utf8').replace(/\r\n/g, '\n');
  const CSS_RE = /^[ \t]*<link[^>]*rel="stylesheet"[^>]*href="\.\/(styles\/[^"]+)"[^>]*>[ \t]*\n?/gm;
  const JS_RE = /^[ \t]*<script[^>]*src="\.\/(js\/[^"]+)"[^>]*><\/script>[ \t]*\n?/gm;
  const collect = (re, names) => {
    let all = '';
    for (const n of names) {
      const body = read(n);
      all += (doc ? body.replace(/\n+$/, '') : body.replace(/\n$/, '')) + '\n';
    }
    return all.replace(/\n$/, '');
  };
  const cssAll = collect(CSS_RE, [...html.matchAll(CSS_RE)].map(m => m[1]));
  const jsAll = collect(JS_RE, [...html.matchAll(JS_RE)].map(m => m[1]));
  let cd = false, jd = false;
  html = html.replace(CSS_RE, () => (cd ? '' : (cd = true, '<style>\n' + cssAll + '\n</style>\n')));
  html = html.replace(JS_RE, () => (jd ? '' : (jd = true, '<script>\n' + jsAll + '\n</script>\n')));
  html = html.replace(/^(<!DOCTYPE html>\n)/i, '$1' + BANNER + '\n');
  const out = html.replace(/\n/g, '\r\n');
  const p = path.join(WORK, doc ? 'PHJ_doc.html' : 'PHJ_fixed.html');
  fs.writeFileSync(p, out, 'utf8');
  return { path: p, text: out };
}

const strictSame = (prodText) => prodText.replace(/^<!--\s*构建生成[\s\S]*?-->\r?\n/m, '') === rawBase;
const docStrip = (prodText) => prodText.replace(/^<!--\s*构建生成[\s\S]*?-->\r?\n/, '') === rawBase;

console.log('\n=== 3. 构建 A：指导书第 8 节参考实现（逐字）===');
const A = build(true);
console.log('  产物 ' + fs.statSync(A.path).size + ' B ｜ 严格等价（banner 用 /m 剥离）=' + strictSame(A.text));
console.log('  第 9 节校验脚本按原文（stripBanner 无 /m）判定 = ' + (docStrip(A.text) ? 'PASS' : 'FAIL'));

console.log('\n=== 4. 构建 B：同一实现，仅把 /\\n+$/ 改成 /\\n$/ ===');
const B = build(false);
const sizeB = fs.statSync(B.path).size;
console.log('  产物 ' + sizeB + ' B ｜ 指导书声称 155315 B → ' + (sizeB === 155315 ? '✓ 一致' : '✗ 不一致'));
console.log('  严格等价（banner 用 /m 剥离）=' + strictSame(B.text));

if (!strictSame(B.text)) { firstDiff(B.text.replace(/^<!--[\s\S]*?-->\r?\n/m, ''), rawBase); }

console.log('\n=== 结论 ===');
console.log('  行段切分：' + (ok ? '✓ 可用（照切即能回拼）' : '✗ 有误'));
console.log('  第 8 节参考实现：' + (strictSame(A.text) ? '✓ 可用' : '✗ 会吞掉段尾空行 → 等价性闸门必然 FAIL（施工方会误判为「切错了」）'));
console.log('  第 9 节 stripBanner：' + (docStrip(A.text) ? '✓ 可用' : '✗ 缺 /m 标志，banner 在第 2 行时剥不掉 → 即使产物完美也报 FAIL'));
console.log('  两处各改一个字符后：' + (strictSame(B.text) && sizeB === 155315 ? '✓ 严格等价 PASS 且 155315 B，与指导书预期一致' : '✗ 仍不等价'));
console.log('  工作副本：' + WORK);

function firstDiff(prod, base) {
  const A2 = prod.split('\n'), B2 = base.split('\n');
  for (let i = 0; i < Math.max(A2.length, B2.length); i++) {
    if (A2[i] !== B2[i]) {
      console.log('  首次差异第 ' + (i + 1) + ' 行：产物=' + JSON.stringify(A2[i]) + ' 基线=' + JSON.stringify(B2[i]));
      console.log('  行数 产物=' + A2.length + ' 基线=' + B2.length);
      return;
    }
  }
  console.log('  行数 产物=' + A2.length + ' 基线=' + B2.length + '（内容相同但长度不同？）');
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
