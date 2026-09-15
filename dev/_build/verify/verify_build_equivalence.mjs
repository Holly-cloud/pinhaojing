/* 等价性 / 构建可复现校验：构建产物 vs 交付快照
   用法（默认 = 当前交付快照 v7.8.1「构建可复现」语义）：
         node dev/_build/verify/verify_build_equivalence.mjs
         node dev/_build/verify/verify_build_equivalence.mjs <产物> <基线>
   默认判定：断言「node dev/build.mjs 的产出」（= 根目录 PHJ.html）与「当前交付快照
         dev/_build/snapshots/PHJ_v7.8.1_20260915.html」**逐字节一致（含 banner，不做 stripBanner）**。
         即：源码能如实、逐字节地构建出已交付的产物 → 构建可复现 + src 与交付物一致。

   —— 为什么把 v7.7 的语义换掉（改义理由，务必保留本段）——
      v7.7 的等价性闸门保护的是「重构没动过内容」，其成立前提是「按行段保序切片」：
      单文件被切成 src/ 若干片再拼回，内容应当逐字节不变（故剥离 banner 后必须逐字节相等）。
      v7.8 是**真实功能增量**（结构层 / 候选气泡 / 槽位 / 片段库），字节必然改变——此时「逐字节
      等价于旧基线的无 banner 内容」既不成立、也不再是想要的保证。此刻有价值的闸门是
      「**源码能如实构建出已交付的产物**」，即构建可复现 + src 与交付物一致。故本脚本默认改为
      对**当前交付快照**做**含 banner 的逐字节相等**断言。**全程有效**（P0–P4 与发布都适用），
      原「P2 起退役」表述作废（见 README §闸门 · Q6）。
      历史基线 PHJ_v7.7_baseline.html / PHJ_v7.8_20260913.html 仍在，**可作 argv 指定基线**复跑（见下）。

   历史比对（保留能力，未删）：把历史基线作为第 3 个参数传入，即走旧语义：
         node dev/_build/verify/verify_build_equivalence.mjs PHJ.html dev/_build/snapshots/PHJ_v7.8_20260913.html
       若产物与该历史快照含 banner 精确不等，脚本退一步做「剥离 banner 后逐字节相等」的判定
       并作「历史重构语义」报告（退出码 2，区别于新语义的 0）。

   退出码：0 = PASS（默认：构建可复现，逐字节一致）
           2 = 仅「剥离 banner 后等价」——历史重构语义 / 非严格（默认语义下不算通过）
           1 = FAIL（与基线不等价）
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const NEW  = process.argv[2] || path.join(ROOT, 'PHJ.html');
const OLD  = process.argv[3] || path.join(ROOT, 'dev', '_build/snapshots/PHJ_v7.8.1_20260915.html');

/* 仅在「历史比对」退一步时使用：剥离构建 banner（按第 2 行、多行模式） */
const stripBanner = s => s.replace(/^<!--\s*构建生成[\s\S]*?-->\r?\n/m, '');
const norm = s => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');

const rawNew = fs.readFileSync(NEW, 'utf8');
const rawOld = fs.readFileSync(OLD, 'utf8');

/* ── 默认语义：含 banner 逐字节一致（构建可复现） ── */
if (rawNew === rawOld) {
  console.log('✅ PASS（构建可复现） 构建产物与交付快照逐字节完全一致（含 banner）');
  console.log('   产物 = 基线 = ' + Buffer.byteLength(rawNew) + ' B  ' + path.relative(ROOT, OLD).replace(/\\/g, '/'));
  process.exit(0);
}

/* ── 退一步诊断：剥离 banner 后逐字节一致？（历史重构语义，v7.7 基线走这里） ── */
const strictNew = stripBanner(rawNew);
if (strictNew === rawOld) {
  console.log('⚠️  历史重构语义：剥离 banner 后逐字节一致，但含 banner 的精确比对不等');
  console.log('   —— 这通常意味着你传入的是 v7.7 无 banner 历史基线（旧语义比对）；');
  console.log('      默认「构建可复现」语义要求对当前交付快照（含 banner）逐字节一致。');
  console.log('   产物（含 banner） ' + Buffer.byteLength(rawNew) + ' B  基线 ' + Buffer.byteLength(rawOld) + ' B');
  process.exit(2);
}

const a = norm(strictNew), b = norm(rawOld);
if (a === b) {
  console.warn('⚠️  仅格式差异（剥离 banner 并归一化后一致，字节级不等）');
  console.warn('   产物 ' + Buffer.byteLength(strictNew) + ' B  基线 ' + Buffer.byteLength(rawOld) + ' B');
  console.warn('   最常见原因：行尾被写成了 LF（必须是 CRLF），或残留了空行');
  process.exit(2);
}

function firstDiff(x, y) {
  const A = x.split('\n'), B = y.split('\n');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) {
      return '   首次差异在第 ' + (i + 1) + ' 行：\n     产物: ' + JSON.stringify(A[i] === undefined ? '(缺)' : A[i]) +
             '\n     基线: ' + JSON.stringify(B[i] === undefined ? '(缺)' : B[i]);
    }
  }
  return '   (无逐行差异但整体不等长)';
}

console.error('❌ FAIL  产物与基线不等价');
console.error('   产物 ' + path.relative(ROOT, NEW).replace(/\\/g, '/') + '：' + Buffer.byteLength(rawNew) + ' B');
console.error('   基线 ' + path.relative(ROOT, OLD).replace(/\\/g, '/') + '：' + Buffer.byteLength(rawOld) + ' B');
console.error('   行数  产物 ' + a.split('\n').length + ' / 基线 ' + b.split('\n').length);
console.error(firstDiff(a, b));

/* 附加诊断：定位是哪一段不一致（样式 / 脚本）。两侧都剥离 banner 后逐段比对，
   对「带 banner 的 v7.8 快照」与「无 banner 的 v7.7 历史基线」都适用。 */
const grab = (s, tag) => { const m = s.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')); return m ? m[1] : ''; };
for (const tag of ['style', 'script']) {
  const ok = grab(stripBanner(rawNew), tag) === grab(stripBanner(rawOld), tag);
  console.error('   ' + tag + ' 段（剥离 banner 后）：' + (ok ? '一致' : '★ 不一致 → src 与交付物不同源'));
}
process.exit(1);
