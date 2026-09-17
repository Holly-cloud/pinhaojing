#!/usr/bin/env node
/* 拼好镜 · 架构审计探针（一次性取证；只读，不改任何源码/产物）
   目的：为「整体架构设计 + 长期发展规划」提供**可复现的硬数据**，而非印象。
   用法：node dev/_build/diag/probe_arch_audit.mjs
   输出：顶层声明数 / 跨模块引用面 / PHJ.x 重复导出行 / addEventListener 注册序 / 模块规模分布 / 循环依赖
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLICES } from '../../manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEV = path.resolve(HERE, '..', '..');          // dev/
const SRC = path.join(DEV, 'src');
const read = (p) => fs.readFileSync(p, 'utf8');

const W = (s) => console.log(s);
const hr = (t) => W('\n' + '━'.repeat(64) + '\n' + t + '\n' + '━'.repeat(64));

/* ── 0. 顶层声明扫描（字符串感知：剥注释/字符串/正则，避免误判）──────
   复用 test-artifact.mjs 的思路：逐字符状态机。 */
function stripNoise(src) {
  let out = '', i = 0, n = src.length;
  let st = null;              // null | "'" | '"' | '`' | '//' | '/*'
  while (i < n) {
    const c = src[i], c2 = src.slice(i, i + 2);
    if (st === null) {
      if (c2 === '//') { st = '//'; i += 2; continue; }
      if (c2 === '/*') { st = '/*'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { st = c; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (st === '//') { if (c === '\n') { st = null; out += '\n'; } i++; continue; }
    if (st === '/*') { if (c2 === '*/') { st = null; i += 2; } else i++; continue; }
    if (st === "'" || st === '"' || st === '`') {
      if (c === '\\') { i += 2; continue; }
      if (c === st) { st = null; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
  }
  return out;
}

function topLevelNames(src) {
  const s = stripNoise(src);
  const names = new Set();
  const re = /(?:^|\n)\s*var\s+([^;]*?)(?:;|\n|$)/g;
  let m;
  while ((m = re.exec(s))) {
    m[1].split(',').forEach((part) => {
      const id = part.split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id);
    });
  }
  const rf = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)/g;
  while ((m = rf.exec(s))) names.add(m[1]);
  return names;
}

/* ── 汇总 ───────────────────────────────────────────────── */
const mods = SLICES.map((s) => {
  const p = path.join(SRC, s.file);
  const src = read(p);
  return {
    ...s,
    src,
    lines: src.split('\n').length - 1,
    bytes: Buffer.byteLength(src, 'utf8'),
    names: topLevelNames(src),
    listeners: (src.match(/addEventListener\s*\(/g) || []).length,
  };
});

hr('1. 模块规模分布（按 bytes 降序）');
const totalLines = mods.reduce((a, m) => a + m.lines, 0);
const totalBytes = mods.reduce((a, m) => a + m.bytes, 0);
mods.slice().sort((a, b) => b.bytes - a.bytes).forEach((m) => {
  W('  ' + String(m.bytes).padStart(6) + ' B  ' + String(m.lines).padStart(5) + ' 行  ' +
    String(m.names.size).padStart(3) + ' 顶层  ' + String(m.listeners).padStart(2) + ' 监听器  ' +
    m.layer.padEnd(9) + m.file);
});
W('  ' + '-'.repeat(70));
W('  合计 ' + totalBytes + ' B / ' + totalLines + ' 行 / ' + mods.reduce((a, m) => a + m.names.size, 0) + ' 顶层声明');

hr('2. PHJ.<module> 导出行（重复赋值检测）');
let dupCount = 0, dupBytes = 0;
mods.forEach((m) => {
  const matches = [...m.src.matchAll(/^PHJ\.(\w+)\s*=\s*\{([^}]*)\}\s*;?\s*$/gm)];
  if (matches.length > 1) {
    const dupLine = matches[0][0];
    dupCount++;
    dupBytes += Buffer.byteLength(dupLine, 'utf8') + 1;
    W('  ⚠️  ' + m.file);
    W('        L1 导出 ' + matches[0][2].split(',').filter(Boolean).length + ' 个名  ← 立即被下一行覆盖（死代码）');
    W('        L2 导出 ' + matches[1][2].split(',').filter(Boolean).length + ' 个名  ← 生效');
  }
});
W('  → 重复导出的模块：' + dupCount + ' / ' + mods.length + '（可回收约 ' + dupBytes + ' B 源码字节）');

hr('3. 跨模块引用面（PHJ.x 真实用法）');
const allNames = new Map();
mods.forEach((m) => m.names.forEach((n) => allNames.set(n, (allNames.get(n) || 0) + 1)));

/* 对每个模块，统计"本模块内出现的、属于其它模块的顶层名" */
const crossRef = new Map();
mods.forEach((m) => {
  const s = stripNoise(m.src);
  const others = new Set();
  mods.forEach((o) => { if (o.file !== m.file) o.names.forEach((n) => others.add(n)); });
  const used = new Set();
  others.forEach((n) => {
    if (new RegExp('\\b' + n.replace(/[$]/g, '\\$') + '\\b').test(s)) used.add(n);
  });
  crossRef.set(m.file, used);
});
const unionCross = new Set();
crossRef.forEach((v) => v.forEach((n) => unionCross.add(n)));
mods.slice().sort((a, b) => (crossRef.get(b.file).size) - (crossRef.get(a.file).size)).forEach((m) => {
  W('  ' + String(crossRef.get(m.file).size).padStart(3) + ' 个跨模块引用  ' + m.file);
});
W('  ' + '-'.repeat(70));
W('  ★ 全部顶层声明 ' + allNames.size + ' 个；其中被"跨模块引用"的 ' + unionCross.size +
  ' 个（' + Math.round((1 - unionCross.size / allNames.size) * 100) + '% 仅模块内部可见）');

hr('4. 交互契约：跨模块引用 vs PHJ 对外面');
mods.forEach((m) => {
  const exp = [...m.src.matchAll(/^PHJ\.(\w+)\s*=\s*\{([^}]*)\}\s*;?\s*$/gm)].pop();
  const expset = exp ? new Set(exp[2].split(',').map((x) => x.trim().split(':')[0].trim()).filter(Boolean)) : new Set();
  const cross = crossRef.get(m.file);
  const leaked = [...expset].filter((n) => !cross.has(n) && n !== 'PHJ');
  W('  ' + m.id.padEnd(12) + ' 导出 ' + String(expset.size).padStart(3) + '  被他模块引用 ' +
    String(cross.size).padStart(3) + '  导出但无人引用 ' + String(leaked.length).padStart(3));
});

hr('5. 加载期副作用：addEventListener 注册序（顺序敏感点）');
let seq = 0;
mods.forEach((m) => {
  const re = /(?:document|window)\s*\.\s*addEventListener\s*\(\s*['"]([\w]+)['"]/g;
  let mm; const hits = [];
  while ((mm = re.exec(m.src))) hits.push(mm[1]);
  if (hits.length) {
    W('  [' + String(seq++).padStart(2) + '] ' + m.file.padEnd(28) + ' → ' + hits.join(', '));
  }
});

hr('6. 依赖图与循环检测');
const byId = new Map(mods.map((m) => [m.id, m]));
const edges = [];
mods.forEach((m) => {
  const exp = [...m.src.matchAll(/^PHJ\.(\w+)\s*=\s*\{([^}]*)\}\s*;?\s*$/gm)].pop();
  const expset = exp ? [...new Set(exp[2].split(',').map((x) => x.trim().split(':')[0].trim()).filter(Boolean))] : [];
  crossRef.get(m.file).forEach((n) => {
    if (!expset.includes(n)) return;
    mods.forEach((o) => { if (o.file !== m.file && o.names.has(n)) edges.push([m.id, o.id, n]); });
  });
});
const adj = new Map(mods.map((m) => [m.id, []]));
edges.forEach(([a, b]) => { if (adj.has(a)) adj.get(a).push(b); });
let cyc = false;
const color = new Map();
function dfs(u, stack) {
  color.set(u, 1);
  for (const v of (adj.get(u) || [])) {
    if (color.get(v) === 1) { cyc = true; W('  ⚠️ 环路：' + stack.concat(v).join(' → ')); }
    else if (!color.get(v)) dfs(v, stack.concat(v));
  }
  color.set(u, 2);
}
mods.forEach((m) => { if (!color.get(m.id)) dfs(m.id, [m.id]); });
W('  跨模块依赖边 ' + edges.length + ' 条；循环依赖：' + (cyc ? '★ 存在' : '无'));

hr('7. 状态边界（跨模块会话态集中度）');
const sess = ['drag', 'panning', 'panVel', 'panLooping', 'panEndX', 'panEndY', 'selected', 'spliceMode',
  'keyDir', 'keyVel', 'keyLoop', 'keyLastT', 'keyState', 'tplOpen', 'tplCur', 'spacePan'];
sess.forEach((s) => {
  const owners = mods.filter((m) => m.names.has(s)).map((m) => m.file);
  const users = mods.filter((m) => crossRef.get(m.file).has(s)).map((m) => m.id);
  W('  ' + s.padEnd(12) + ' 定义于 ' + (owners.length ? owners[0].split('/')[1].padEnd(20) : '(无)'.padEnd(20)) +
    ' 被他模块引用 ' + users.length + (users.length ? '  [' + users.join(', ') + ']' : ''));
});

hr('8. 构建产物对外全局面');
const html = read(path.join(DEV, '..', 'PHJ.html'));
W('  product PHJ.html = ' + Buffer.byteLength(html, 'utf8') + ' B');
const jsMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (jsMatch) {
  const body = jsMatch[1];
  W('  内联 JS 段 = ' + Buffer.byteLength(body, 'utf8') + ' B');
  W('  IIFE 包裹：' + (/^\s*;\(function\s*\(\s*\)\s*\{/.test(body) ? '✅ 有' : '❌ 无'));
  W('  type=module：' + (/type\s*=\s*["']module/.test(html) ? '★ 存在（红线违规）' : '无（符合红线）'));
  W('  外链 http(s)：' + ((html.match(/https?:\/\//g) || []).length) + ' 处');
}
W('\n（审计完毕：本探针只读，未改动任何文件）');
