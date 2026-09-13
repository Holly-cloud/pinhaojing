#!/usr/bin/env node
/* 拼好镜 · 构建：src/ → PHJ.html（零依赖，纯 node）
   用法：node build.mjs
   红线：不输出 ES module；不引入任何外部依赖；不改动 src/；产物行尾 = CRLF。
   —— 本文件 = 《09_重构施工指导书》第 8 节参考实现 + 两处必要修正/增强：
      ① 修正（必须）：内联时用 replace(/\n$/, '') 只剥每个文件自身那一个换行符。
         原版 replace(/\n+$/, '') 会把片尾空行一并吞掉 —— 16 片 JS 中有 3 片以空行结尾
         （基线第 585 / 630 / 1861 行为空行），产物会少 3 行、为 155309 B 而非 155315 B，
         等价性闸门必红，且校验脚本会误报「script 段不一致 → 回第 6 节重切」，把施工方带进死循环。
      ② 增强（施工中途需要）：允许某个类型暂时没有外链引用（P1 阶段 <script> 仍内联），
         此时跳过内联而不报错；全部外置后该分支自然不再触发。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.dirname(fileURLToPath(import.meta.url));
const SRC    = path.join(ROOT, 'src');
const OUT    = path.join(ROOT, 'PHJ.html');
const BANNER = '<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->';

/* 读取即统一为 LF（后续正则与拼接都在 LF 下进行，避免 \r 干扰匹配） */
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

let html = read(path.join(SRC, 'index.html'));

/* 行尾的 \n 必须被匹配吃掉，否则删除标签后会残留空行 */
const CSS_RE = /^[ \t]*<link[^>]*rel="stylesheet"[^>]*href="\.\/(styles\/[^"]+)"[^>]*>[ \t]*\n?/gm;
const JS_RE  = /^[ \t]*<script[^>]*src="\.\/(js\/[^"]+)"[^>]*><\/script>[ \t]*\n?/gm;

function collect(re, type) {
  const names = [...html.matchAll(re)].map(m => m[1]);
  if (!names.length) {
    if (type === 'JS' && /<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
      console.log('  跳过 ' + type + '：尚无外链引用（<script> 仍内联）');
      return { names: [], all: null };
    }
    throw new Error('src/index.html 未发现可内联的 ' + type + ' 引用');
  }
  let all = '';
  for (const n of names) {
    const body = read(path.join(SRC, n));
    if (type === 'CSS' ? /<\/style/i.test(body) : /<\/script/i.test(body)) {
      throw new Error(n + ' 中含有 </' + type.toLowerCase() + '>，内联会破损');
    }
    all += body.replace(/\n$/, '') + '\n';   /* ← 修正点：只剥自身那一个换行符 */
    console.log('  内联 ' + n + '  ' + body.split('\n').length + ' 行');
  }
  return { names, all: all.replace(/\n$/, '') };
}

const css = collect(CSS_RE, 'CSS');
const js  = collect(JS_RE,  'JS');

/* 首个替换为合并块、其余删除——保证合并块落在原位置 */
let cssDone = false, jsDone = false;
html = html.replace(CSS_RE, () => (cssDone ? '' : (cssDone = true, '<style>\n' + css.all + '\n</style>\n')));
if (js.all !== null) html = html.replace(JS_RE, () => (jsDone ? '' : (jsDone = true, '<script>\n' + js.all + '\n</script>\n')));

html = html.replace(/^(<!DOCTYPE html>\n)/i, '$1' + BANNER + '\n');

/* 写回 CRLF（与 v7.7 基线一致） */
fs.writeFileSync(OUT, html.replace(/\n/g, '\r\n'), 'utf8');
console.log('\n✓ 已生成 ' + path.relative(ROOT, OUT) + '  ' + fs.statSync(OUT).size + ' B  CSS ' + css.names.length + ' 片 / JS ' + js.names.length + ' 片');
