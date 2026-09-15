/* v7.8.2 自检 · 风格包回内置的「逐字」独立比对（node 侧，不经浏览器）
   从**产物 PHJ.html** 提取内置风格包（CMPL_STYLE 5 段 + CMPL_TAIL），与 v7.8 原文
   （`git show ce8b7a0:dev/src/js/52-complete.js`）逐字比对，报告不一致处数。
   用法：node dev/_build/diag/probe_v782_verbatim.mjs
   期望结果：在 v7.8.2 交付产物上「不一致处数 = 0」（5 段 body + tail 共 6 项全 OK），退出码 0。
   退出码：0 = 0 处不一致；1 = 存在不一致（证伪用：故意改字后应退出 1）。 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

const v78 = execFileSync('git', ['show', 'ce8b7a0:dev/src/js/52-complete.js'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const prod = fs.readFileSync(path.join(ROOT, 'PHJ.html'), 'utf8');

function extract(s) {
  const st = (s.match(/var CMPL_STYLE = \[[\s\S]*?\];/) || [])[0] || '';
  const labels = [...st.matchAll(/label:\s*'([^']*)'/g)].map((m) => m[1]);
  const bodies = [...st.matchAll(/body:\s*'([^']*)'/g)].map((m) => m[1]);
  const tail = ((s.match(/var CMPL_TAIL = '([^']*)';/) || [])[1]) || '';
  return { labels, bodies, tail };
}
const A = extract(v78);
const B = extract(prod);

let diff = 0;
console.log('v7.8 原文 段数=' + A.bodies.length + ' tail=' + JSON.stringify(A.tail));
console.log('产物内置 段数=' + B.bodies.length + ' tail=' + JSON.stringify(B.tail));
for (let i = 0; i < 5; i++) {
  const ok = A.bodies[i] === B.bodies[i];
  if (!ok) diff++;
  console.log(`${ok ? 'OK  ' : 'DIFF'} 段${i + 1} [${A.labels[i] || '?'}]`);
}
const tOk = A.tail === B.tail;
if (!tOk) diff++;
console.log(`${tOk ? 'OK  ' : 'DIFF'} 硬性要求 tail`);
console.log('== 不一致处数（5 段 + tail 共 6 项）：' + diff + ' ==');
process.exit(diff === 0 && A.bodies.length === 5 && B.bodies.length === 5 ? 0 : 1);
