#!/usr/bin/env node
/* R1 校验 v2：比对「数据定义」本身（CMPL_STYLE 数组 / CMPL_TAIL / cmplFullStyle / CMPL_GROUPS 数组）
   排除注释差异 —— 因为新文件刻意加了皮肤层说明注释。 */
import fs from 'node:fs';
const norm = (s) => s.replace(/\r\n/g, '\n');
const oldSrc = norm(fs.readFileSync('dev/src/editor/complete.js', 'utf8'));
const newSrc = norm(fs.readFileSync('dev/src/skin/corpus.js', 'utf8'));

/* 提取单个顶层数据块：从 `var NAME = ` 起，到配对的 `];` 或 `;` 止 */
function grab(src, name) {
  const L = src.split('\n');
  const s = L.findIndex((l) => l.startsWith('var ' + name + ' = '));
  if (s < 0) return null;
  const isArr = /\[\s*$/.test(L[s]);
  let j = s;
  if (isArr) { while (j < L.length && L[j].trim() !== '];') j++; }
  else { while (j < L.length && !/;$/.test(L[j].trim())) j++; }
  return L.slice(s, j + 1).join('\n');
}
function grabFn(src, name) {
  const L = src.split('\n');
  const s = L.findIndex((l) => l.startsWith('function ' + name + '('));
  if (s < 0) return null;
  let j = s;
  while (j < L.length && L[j].trim() !== '}') j++;
  return L.slice(s, j + 1).join('\n');
}

const items = [['CMPL_STYLE', grab], ['CMPL_TAIL', grab], ['CMPL_GROUPS', grab], ['cmplFullStyle', grabFn]];
let allOk = true;
for (const [n, fn] of items) {
  const a = fn(oldSrc, n), b = fn(newSrc, n);
  const ok = a !== null && b !== null && a === b;
  if (!ok) allOk = false;
  console.log((ok ? '✅' : '❌') + ' ' + n.padEnd(14) + ' 原 ' + (a ? Buffer.byteLength(a) : 0) + ' B / 新 ' + (b ? Buffer.byteLength(b) : 0) + ' B');
  if (!ok && a && b) {
    const x = a.split('\n'), y = b.split('\n');
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) {
      console.log('   首个差异 第 ' + (i + 1) + ' 行:\n     原: ' + JSON.stringify(x[i]) + '\n     新: ' + JSON.stringify(y[i]));
      break;
    }
  }
}
console.log('\n' + (allOk ? '✅ 全部语料定义逐字节一致（仅行尾/注释不同）' : '❌ 存在实质性差异'));
