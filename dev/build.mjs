#!/usr/bin/env node
/* 拼好镜 · 构建：src/ → PHJ.html（零依赖，纯 node）
   用法：node dev/build.mjs
   红线：不输出 ES module；不引入任何外部依赖；不改动 src/ 的业务代码；产物行尾 = CRLF。

   ── P1（2026-09-16）止损改造，三件事全在构建器/接线上，**不改任何业务代码** ──
   ① manifest 成为**唯一顺序源**：JS 顺序改读 `dev/manifest.mjs` 的 `SLICES`（不再 `matchAll(JS_RE)`
      扫 index.html 收集）；CSS 顺序读 manifest 的 `CSS`，并**校验** index.html 的 CSS 链顺序 == manifest
      （不一致即构建报错 → 杜绝顺序漂移）。
   ② 产物 JS 收进**单个 IIFE + 严格模式**：`;(function(){ … })();`。因 `js/00-header.js` 首行本就是
      `'use strict';`，拼接体落在函数体首条语句位置 ⇒ 严格模式覆盖整个函数体（无需再插一条，避免重复）。
      此举把原来散落全局的顶层 `var/function`（19 片 221 个顶层声明）收进一个私有作用域。
   ③ **开发态 ≡ 产物**：把**与产物内联 JS 段逐字相同**的那一份写入 `dev/src/dev-bundle.js`，
      `dev/src/index.html` 只引这一个 bundle（不再手写 19 个 `<script src>`）→ 开发态与产物跑在
      **同一作用域、同一顺序、同一字节**的 JS 上（dev≡prod 可机器证明，见 verify_v78.mjs）。

   ── 沿革修正（保留，勿回退）──
   · 内联时用 replace(/\n$/, '') 只剥每个文件自身那一个换行符（原 replace(/\n+$/, '') 会吞片尾空行，
     使产物少行 → 等价性闸门必红）。
   · 首行 banner、产物 CRLF 行尾 一并保留。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLICES, CSS } from './manifest.mjs';

const HERE   = path.dirname(fileURLToPath(import.meta.url));   /* dev/ */
const ROOT   = path.resolve(HERE, '..');                       /* 项目根：交付物 PHJ.html 所在层 */
const SRC    = path.join(HERE, 'src');
const OUT    = path.join(ROOT, 'PHJ.html');
const BUNDLE = path.join(SRC, 'dev-bundle.js');                 /* 开发态 bundle（.gitignore） */
const BANNER = '<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->';

/* 读取即统一为 LF（后续正则与拼接都在 LF 下进行，避免 \r 干扰匹配） */
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

let html = read(path.join(SRC, 'index.html'));

/* 内联锚点：行尾的 \n 必须被匹配吃掉，否则删除标签后会残留空行。
   JS：index.html 里仅一条 <script src="./dev-bundle.js"></script>（P1 起不再列 19 个 ./js/*）。 */
const CSS_RE = /^[ \t]*<link[^>]*rel="stylesheet"[^>]*href="\.\/(styles\/[^"]+)"[^>]*>[ \t]*\n?/gm;
const JS_RE  = /^[ \t]*<script[^>]*src="\.\/dev-bundle\.js"[^>]*><\/script>[ \t]*\n?/gm;

/* 读片：路径**相对 dev/src/** 给出（P2 起源文件按职责分层，不再固定在 js/、styles/）。
   读回统一 LF，剥离自身那一个末尾换行符后逐片拼接（保留既有修正）。 */
function slice(names, kind) {
  let all = '';
  for (const n of names) {
    const p = path.join(SRC, n);
    if (!fs.existsSync(p)) throw new Error('manifest ' + kind + ' 引用的源文件缺失：' + n);
    const body = read(p);
    if (kind === 'CSS' ? /<\/style/i.test(body) : /<\/script/i.test(body)) {
      throw new Error(n + ' 中含有 </' + kind.toLowerCase() + '>，内联会破损');
    }
    all += body.replace(/\n$/, '') + '\n';   /* ← 修正点：只剥自身那一个换行符 */
    console.log('  内联 ' + n + '  ' + body.split('\n').length + ' 行');
  }
  return all.replace(/\n$/, '');
}

/* ── CSS：顺序源 = manifest.CSS；并校验 index.html 的链顺序 == manifest（不一致即报错） ── */
const cssNames = CSS.map(c => c.file);
const htmlCss  = [...html.matchAll(CSS_RE)].map(m => m[1]);
if (htmlCss.length !== cssNames.length || htmlCss.join('\u0000') !== cssNames.join('\u0000')) {
  throw new Error('index.html 的 CSS 链顺序与 manifest.CSS 不一致（防顺序漂移）：\n  index:    ' +
    htmlCss.join(', ') + '\n  manifest: ' + cssNames.join(', '));
}
const cssAll = slice(cssNames, 'CSS');

/* ── JS：顺序源 = manifest.SLICES；包 IIFE（'use strict' 落在函数体首条语句 → 覆盖全函数体） ── */
const jsNames = SLICES.map(s => s.file);
const jsBody  = slice(jsNames, 'JS');
const IIFE    = ';(function(){\n' + jsBody + '\n})();';

/* 产物内联 JS 段 = <script> 与 </script> 之间的**逐字**内容；把同一串写入 dev-bundle.js ⇒ dev≡prod。 */
const JS_BUNDLE = '\n' + IIFE + '\n';
fs.writeFileSync(BUNDLE, JS_BUNDLE.replace(/\n/g, '\r\n'), 'utf8');

/* 首个 CSS 替换为合并块、其余删除——保证合并块落在原位置 */
let cssDone = false;
html = html.replace(CSS_RE, () => (cssDone ? '' : (cssDone = true, '<style>\n' + cssAll + '\n</style>\n')));

/* 唯一 <script src="./dev-bundle.js"> 替换为内联 IIFE 块（保持原位置语义） */
let jsDone = false;
html = html.replace(JS_RE, () => (jsDone ? '' : (jsDone = true, '<script>' + JS_BUNDLE + '</script>\n')));
if (!jsDone) throw new Error('index.html 未发现 <script src="./dev-bundle.js"> 锚点（P1 起 JS 只此一条）');

html = html.replace(/^(<!DOCTYPE html>\n)/i, '$1' + BANNER + '\n');

/* 写回 CRLF（与基线一致） */
fs.writeFileSync(OUT, html.replace(/\n/g, '\r\n'), 'utf8');
console.log('\n✓ 已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/') + '  ' + fs.statSync(OUT).size +
  ' B  CSS ' + CSS.length + ' 片 / JS ' + SLICES.length + ' 片（单 IIFE）');
console.log('✓ 已生成 ' + path.relative(ROOT, BUNDLE).replace(/\\/g, '/') + '  ' + fs.statSync(BUNDLE).size +
  ' B（开发态用，= 产物内联 JS 段逐字）');
