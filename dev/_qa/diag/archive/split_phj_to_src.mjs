#!/usr/bin/env node
/* 拼好镜 · 切分执行器：PHJ.html（单文件基线）→ src/ 源树
   用法：node _build/diag/split_phj_to_src.mjs [--js]
        默认只切 CSS（7 片）；加 --js 再切 JS（16 片）并把 index.html 的内联 <script> 换成 16 条外链。
   依据：《09_重构施工指导书》第 5/6/7 节的行段与替换规则（行段已由 verify_split_spec.mjs 自检可无损回拼）。
   纪律：只做剪切-粘贴，不改一个字符；行尾按 LF 写入（build.mjs 内联时统一，产物写出时转回 CRLF）。
   自检：逐片断言「片内容 === 基线对应行段」，并打印行数对账。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');          // 项目根
const WITH_JS = process.argv.includes('--js');
const BASELINE = process.argv.find(a => a.endsWith('.html')) || path.join(ROOT, 'dev', '_build/snapshots/PHJ_v7.7_baseline.html');
/* 默认从「施工前基线快照」切，而不是当前 PHJ.html —— 分支上 PHJ.html 已是构建产物（带 banner、样式已内联） */

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

const raw = fs.readFileSync(BASELINE);
const T = raw.toString('utf8').replace(/\r\n/g, '\n');
const L = T.split('\n');
const seg = (a, b) => L.slice(a - 1, b).join('\n');

if (L[6] !== '<style>' || L[323] !== '</style>') throw new Error('基线 <style> 位置不是第 7/324 行，行段口径不匹配');
if (WITH_JS && (L[417] !== '<script>' || L[2703] !== '</script>')) throw new Error('基线 <script> 位置不是第 418/2704 行');

function dump(split, kindMax) {
  let total = 0;
  for (const [name, a, b] of split) {
    const body = seg(a, b);
    const p = path.join(ROOT, 'dev', 'src', name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body + '\n');
    const back = fs.readFileSync(p, 'utf8').replace(/\n$/, '');
    if (back !== body) throw new Error(name + ' 写入后发现内容与基线行段不一致');
    total += b - a + 1;
    console.log('  ' + name.padEnd(26) + a + '–' + b + '  ' + String(b - a + 1).padStart(4) + ' 行  ✓ 与基线逐字一致');
  }
  console.log('  ' + '合计'.padEnd(24) + '       ' + String(total).padStart(4) + ' 行  （期望 ' + kindMax + (total === kindMax ? ' ✓）' : ' ✗）'));
  return total;
}

console.log('基线 ' + path.relative(ROOT, BASELINE) + '  ' + raw.length + ' B');
console.log('\n[CSS] 切出 ' + CSS_SPLIT.length + ' 片 → src/styles/');
const cssTotal = dump(CSS_SPLIT, 316);

let jsTotal = 0, jsNames = [];
if (WITH_JS) {
  console.log('\n[JS] 切出 ' + JS_SPLIT.length + ' 片 → src/js/');
  jsTotal = dump(JS_SPLIT, 2285);
  jsNames = JS_SPLIT.map(([n]) => n);
}

/* src/index.html：复制基线，只做两处机械替换（第 7 节） */
const links = CSS_SPLIT.map(([n]) => '<link rel="stylesheet" href="./' + n + '">').join('\n');
const scripts = jsNames.map(n => '<script src="./' + n + '"></script>').join('\n');
const head = L.slice(0, 6);                       // 1–6 行
if (WITH_JS) {
  var idx = head.concat([links], L.slice(324, 417), [scripts], L.slice(2704));
  var note = 'CSS 7 片外链 + JS 16 片外链（已全部外置）';
} else {
  var idx = head.concat([links], L.slice(324));   // 第 324 行起原样保留（此时 <script> 仍内联）
  var note = 'CSS 7 片外链 + <script> 暂时内联（--js 才外置）';
}
const idxText = idx.join('\n');
fs.writeFileSync(path.join(ROOT, 'dev', 'src', 'index.html'), idxText);
console.log('\n[HTML] src/index.html 已生成：' + idxText.split('\n').length + ' 行（' + note + '）');
console.log('合计：CSS ' + cssTotal + ' 行' + (WITH_JS ? ' / JS ' + jsTotal + ' 行' : '') + '  —— 下一步 node build.mjs');
