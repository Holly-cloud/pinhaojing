/* ============================================================================
   拼好镜 · 测试产物（A+ 机构化捕获桥）
   ----------------------------------------------------------------------------
   背景（P1）：产物 JS 已收进**单个 IIFE**，221 个顶层声明不再泄漏到 window。
   但 CDP 验收套件（verify_v7 / v76 / v77 / v78）历史上**靠这些全局**操纵内部状态，
   IIFE 一包它们即全红。为在不改产品、不放宽判定的前提下恢复可达性，本模块由**构建侧**
   产出一份**测试产物**：

     · 内容 = 产物内联 JS 段，**仅在 IIFE 闭合 `})();` 之前插入 1 行访问器代码**；其余逐字节等于产物；
     · 访问器名 **自动扫描**（内联段顶层声明：行首 `var|let|const|function`，去重）——
       改个变量名会自动跟着变，不存在"手改副本会静默失效"的问题；
     · 每个名生成 **闭包式访问器** `Object.defineProperty(window,n,{get:()=>n,set:v=>{n=v}})`
       —— getter/setter 在 IIFE 作用域内按标识符解析，**读与写都落到真实内部变量**
       （**不用 `eval`**：严格模式下直接 eval 有自己的变量环境，写入打不到外层变量）；
     · 名字总数写进产物头部注释，便于审计。

   不变式（team-lead 定，A+）：
     ① 产品 `PHJ.html` **新增全局名 = 0**（由 verify_v78 的 P1-D 纯度断言在真实浏览器核验）；
     ② 4 个套件**判定式与条数不变**（v7 87 / v76 18 / v77 16 / v78 42+）；
     ③ 测试产物与产品的差异**可被断言审计**（verify_v78 的 P1-C 断言：逐行 diff 恰为插入的 1 行）。

   本模块**纯 node、零依赖**；可被套件 import（自动重建，始终与当前产物一致），也可直接 `node` 运行（CLI）。
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE          = path.dirname(fileURLToPath(import.meta.url));   /* dev/_build/lib */
const BUILD_DIR     = path.resolve(HERE, '..');                        /* dev/_build */
export const ROOT   = path.resolve(BUILD_DIR, '..', '..');             /* 项目根 */
export const PRODUCT = path.join(ROOT, 'PHJ.html');                    /* 真实产物（权威源） */
export const ARTIFACT_DIR = path.join(BUILD_DIR, 'artifacts');
export const ARTIFACT_VERSION = 'v7.11';
export const ARTIFACT_PATH = path.join(ARTIFACT_DIR, 'PHJ_test_' + ARTIFACT_VERSION + '.html');

/** 取产物的内联 JS 段（`<script>…</script>` 之间，含 CRLF，逐字）。 */
export function extractSegment(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('未在 HTML 中找到内联 <script> 段');
  return m[1];
}

/** 扫描内联段里的**顶层声明名**（行首 var|let|const|function|class），去重并按字典序返回。
    关键：`var a = 0, b = 0, c = 0;` 这类**多声明符**必须逐个抓全（旧版只抓第一个 → 漏名 →
    套件里引用该名的探针函数会 ReferenceError）。做法：从关键字起按「字符串 / 注释 / 括号深度」
    推进到顶层 `;`，再按顶层逗号切分声明符列表。 */
export function scanTopLevelNames(seg) {
  const names = new Set();
  const src = seg;

  const declRe = /^(?:var|let|const)\s+/gm;
  let m;
  while ((m = declRe.exec(src)) !== null) {
    const start = m.index + m[0].length;
    let i = start, depth = 0, q = null, esc = false;
    for (; i < src.length; i++) {
      const ch = src[i], nx = src[i + 1];
      if (q) {                            /* 字符串/模板字面量内：只找闭合引号 */
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === q) { q = null; continue; }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '/' && nx === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }   /* 行注释 */
      if (ch === '/' && nx === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; } /* 块注释 */
      if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
      if (ch === ';' && depth === 0) break;   /* 顶层分号 = 声明语句结束 */
    }
    /* 按**顶层逗号**切分声明符列表 */
    const list = src.slice(start, i);
    const parts = [];
    let d2 = 0, q2 = null, esc2 = false, cur = '';
    for (let k = 0; k < list.length; k++) {
      const ch = list[k];
      if (q2) { cur += ch; if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === q2) q2 = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q2 = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') d2++;
      if (ch === ')' || ch === ']' || ch === '}') d2--;
      if (ch === ',' && d2 === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    for (const p of parts) { const id = p.trim().match(/^[A-Za-z_$][\w$]*/); if (id) names.add(id[0]); }
    declRe.lastIndex = i;
  }

  /* 顶层 function / class 声明（单名） */
  for (const mm of src.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm)) {
    names.add(mm[1] || mm[2]);
  }
  return [...names].sort();
}

/** 生成**单行**访问器代码：对每个顶层名定义 window 同名 get/set 访问器（闭包落到真实内部变量）。 */
export function accessorLine(names) {
  const parts = names.map(n =>
    'try{Object.defineProperty(window,' + JSON.stringify(n) +
    ',{configurable:true,enumerable:true,get:function(){return ' + n + '},set:function(v){' + n + '=v}})}catch(e){}');
  /* 头部注释由 buildTestArtifact 另起一行写；此处只返回那一行代码本体 */
  return ';' + parts.join(';');
}

/** 读真实产物 → 在 IIFE 闭合前插入 1 行访问器 → 写测试产物。返回审计所需信息。 */
export function buildTestArtifact() {
  const product = fs.readFileSync(PRODUCT, 'utf8');
  const seg = extractSegment(product);
  const names = scanTopLevelNames(seg);
  if (!names.length) throw new Error('未扫描到任何顶层声明名——测试产物将无意义');
  const accessor = accessorLine(names);
  const idx = seg.lastIndexOf('})();');
  if (idx < 0) throw new Error('内联 JS 段未找到 IIFE 闭合 `})();`（P1 后产物应为单 IIFE）');
  /* 插入「访问器 1 行」：…\r\n + accessor + \r\n + })(); …
     ——保持 CRLF，且**逐行 diff 恰为 +1 行**（供 P1-C 审计）。 */
  const seg2 = seg.slice(0, idx) + accessor + '\r\n' + seg.slice(idx);
  const artifact = product.replace(seg, seg2);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact, 'utf8');
  return { path: ARTIFACT_PATH, product, artifact, seg, seg2, names, accessor, nameCount: names.length };
}

/** P1-C 审计：测试产物 vs 真实产物 **逐行 diff 恰为插入的 1 行**，且该行就是访问器行。 */
export function auditArtifactDiff() {
  const prod = fs.readFileSync(PRODUCT, 'utf8');
  const art  = fs.readFileSync(ARTIFACT_PATH, 'utf8');
  const A = prod.split('\n'), B = art.split('\n');
  if (B.length !== A.length + 1) {
    return { ok: false, reason: '行数差≠1', da: A.length, db: B.length };
  }
  let i = 0;
  while (i < A.length && A[i] === B[i]) i++;
  const inserted = B[i];
  const prefixOk = A.slice(0, i).join('\n') === B.slice(0, i).join('\n');
  const suffixOk = A.slice(i).join('\n') === B.slice(i + 1).join('\n');
  const isAccessor = typeof inserted === 'string'
    && inserted.includes('Object.defineProperty(window,')
    && inserted.includes('get:function(){return ')
    && inserted.includes('set:function(v){');
  return { ok: prefixOk && suffixOk && isAccessor, i, insertedLineLen: inserted == null ? -1 : inserted.length,
           prefixOk, suffixOk, isAccessor, da: A.length, db: B.length, insertedHead: (inserted || '').slice(0, 60) };
}

/* ── CLI：node dev/_build/lib/test-artifact.mjs ── */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = buildTestArtifact();
  const a = auditArtifactDiff();
  console.log('✓ 已生成测试产物 ' + path.relative(ROOT, r.path).replace(/\\/g, '/') +
    '  顶层名 ' + r.nameCount + ' 个，访问器 1 行 ' + r.accessor.length + ' 字符');
  console.log('  审计：逐行 diff == 恰 1 行 → ' + a.ok + '（行数 ' + a.da + ' → ' + a.db + '；插入行首 ' + a.insertedHead + '…）');
}
