#!/usr/bin/env node
/* R0 清债脚本（一次性；执行后即删）
   目标：删除每个模块里「被紧随其后的 P3 行完整覆盖」的 P2 导出行（死代码）。
   铁律：只删 P2 那条注释 + 其下的 P2 导出行；
         保留 P3 注释（改写为生效面说明）与 P3 导出行；
         其余内容一字不动。
   用法：node dev/_build/diag/_r0_strip_dup_exports.mjs [--dry]
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLICES } from '../../manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'src');
const DRY = process.argv.includes('--dry');

/* P2 注释行（精确形态） */
const P2_COMMENT = /^\/\* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） \*\/\n/;
/* P3 注释行（两种形态：普通 / 自包含） */
const P3_COMMENT = /^\/\* P3：对外面 = \*\*被他模块引用的顶层名\*\*（客观统计；P2 时为全量导出）(；本模块自包含，无对外面)? \*\/\n/;

let touched = [];
for (const s of SLICES) {
  const p = path.join(SRC, s.file);
  const src = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const lines = src.split('\n');

  const p2c = lines.findIndex((l) => P2_COMMENT.test(l + '\n'));
  const p3c = lines.findIndex((l) => P3_COMMENT.test(l + '\n'));
  if (p2c < 0 || p3c < 0) { console.log('  跳过（无双导出）：' + s.file); continue; }

  const p2Export = lines[p2c + 1];
  const p3Export = lines[p3c + 1];
  if (!/^PHJ\.\w+ = \{/.test(p2Export) || !/^PHJ\.\w+ = \{/.test(p3Export)) {
    throw new Error('非预期结构：' + s.file);
  }
  const mod = p2Export.match(/^PHJ\.(\w+)/)[1];
  if (mod !== p3Export.match(/^PHJ\.(\w+)/)[1]) throw new Error('模块名不一致：' + s.file);

  /* 新内容：
     - 删掉 P2 注释 + P2 导出行（共 2 行）
     - 把 P3 注释改写为「生效面」说明（去掉"P2 时为全量导出"这类历史措辞，源码只留生效态）
     - 保留 P3 导出行、以及紧随其后的空行
     注意 P3 行之后可能还有一个空行（原文件结构），一并保留。 */
  const nP2Names = p2Export.slice(p2Export.indexOf('{') + 1, p2Export.lastIndexOf('}')).split(',').filter((x) => x.trim()).length;
  const nP3Names = p3Export.slice(p3Export.indexOf('{') + 1, p3Export.lastIndexOf('}')).split(',').filter((x) => x.trim()).length;

  const out = lines.slice();
  out.splice(p2c, 2);                                  // 删 P2 注释 + P2 导出行
  /* P3 注释行位置前移 2 */
  const np3 = p3c - 2;
  const selfContained = /本模块自包含/.test(out[np3]);
  out[np3] = selfContained
    ? '/* 本模块对外面 = 空（自包含，无跨模块引用） */'
    : '/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */';

  const next = out.join('\n');
  if (next === src) { console.log('  无变化：' + s.file); continue; }

  if (!DRY) fs.writeFileSync(p, next.replace(/\n/g, '\r\n'), 'utf8');
  touched.push({ file: s.file, mod, removed: nP2Names, kept: nP3Names, bytes: Buffer.byteLength(p2Export + '\n') + 60 });
  console.log('  ✓ ' + s.file.padEnd(30) + ' ' + mod.padEnd(11) + ' 删 ' + String(nP2Names).padStart(2) + ' 名 → 保留 ' + String(nP3Names).padStart(2) + ' 名');
}
console.log('\n处理模块 ' + touched.length + ' 个' + (DRY ? '（DRY RUN，未写盘）' : ''));
