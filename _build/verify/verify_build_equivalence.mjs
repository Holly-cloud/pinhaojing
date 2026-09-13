/* 等价性校验：构建产物 vs 施工前快照
   用法：node _build/verify/verify_build_equivalence.mjs
         node _build/verify/verify_build_equivalence.mjs <产物> <基线>
   判定：① 严格 —— 仅剥离 banner 后逐字节相等（最强保证）
         ② 退一步 —— 归一化行尾与行尾空白后相等（报"仅格式差异"）
   —— 本文件 = 《09_重构施工指导书》第 9 节参考实现 + 一处修正：
      stripBanner 的正则补 m 标志。banner 按第 8 节插在 <!DOCTYPE html> 之后（第 2 行），
      原版 ^ 锚定且无 m，剥不掉 banner → 即使产物逐字节完美也报 ❌ FAIL。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const NEW  = process.argv[2] || path.join(ROOT, 'PHJ.html');
const OLD  = process.argv[3] || path.join(ROOT, '_build/snapshots/PHJ_v7.7_baseline.html');

const stripBanner = s => s.replace(/^<!--\s*构建生成[\s\S]*?-->\r?\n/m, '');
const norm = s => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');

const rawNew = fs.readFileSync(NEW, 'utf8');
const rawOld = fs.readFileSync(OLD, 'utf8');

const strictNew = stripBanner(rawNew);
if (strictNew === rawOld) {
  console.log('✅ PASS（严格） 剥离 banner 后逐字节完全一致 —— 重构未改变任何内容');
  process.exit(0);
}

const a = norm(strictNew), b = norm(rawOld);
if (a === b) {
  console.warn('⚠️  仅格式差异：归一化后一致，但字节级不等');
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
console.error('   行数  产物 ' + a.split('\n').length + ' / 基线 ' + b.split('\n').length);
console.error(firstDiff(a, b));

/* 附加诊断：定位是哪一段切错了 */
const grab = (s, tag) => { const m = s.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')); return m ? m[1] : ''; };
for (const tag of ['style', 'script']) {
  const ok = grab(a, tag) === grab(b, tag);
  console.error('   ' + tag + ' 段：' + (ok ? '一致' : '★ 不一致 → 回第 ' + (tag === 'style' ? '5' : '6') + ' 节重切行段'));
}
process.exit(1);
