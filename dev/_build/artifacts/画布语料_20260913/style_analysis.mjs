import { readFileSync, writeFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8'));
const withPrompt = items.filter(x => x.prompt.trim());

// 1. 骨架：非空行里以特定模式开头的行统计
const head = new Map();
for (const x of withPrompt) for (const ln of x.prompt.split('\n')) {
  const t = ln.trim(); if (!t) continue;
  let k = null;
  if (/^【.+?】/.test(t)) k = '【块名】';
  if (/^事件发生在/.test(t)) k = '事件发生在…（场景引用打头）';
  if (/^现场情况说明/.test(t)) k = '现场情况说明：';
  if (/^画面开始/.test(t)) k = '画面开始：';
  if (/^画面结束/.test(t)) k = '画面结束。';
  if (/^风格/.test(t)) k = '风格：';
  if (/^硬性要求/.test(t)) k = '硬性要求：';
  if (/^【/.test(t)) k = t.match(/^【(.+?)】/)[1];
  if (k) head.set(k, (head.get(k) || 0) + 1);
}
console.log('=== 结构件出现次数（共 %d 个有 prompt 的节点）===', withPrompt.length);
[...head.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log(String(c).padStart(3), k));

// 2. 风格块同质性：抽出从「风格：」到结尾
const styleBlocks = new Map();
for (const x of withPrompt) {
  const i = x.prompt.indexOf('风格：');
  if (i < 0) { styleBlocks.set('(无风格块)', (styleBlocks.get('(无风格块)') || 0) + 1); continue; }
  const b = x.prompt.slice(i);
  styleBlocks.set(b, (styleBlocks.get(b) || 0) + 1);
}
console.log('\n=== 风格块去重后种类 ===');
const arr = [...styleBlocks.entries()].sort((a, b) => b[1] - a[1]);
arr.forEach(([b, c], i) => {
  console.log(`--- 变体 ${i + 1} x${c} len=${b.length}`);
  if (i > 0 || arr.length <= 3) console.log('   ' + b.slice(0, 700).replace(/\n/g, '\n   '));
  else console.log('   变体1 内容见 corpus.json（首行：' + b.split('\n')[0].slice(0, 60) + '…）');
});

// 3. 语料里错误符号统计（与编辑器红标相关）
let zhComma = 0, enComma = 0, zhPeriod = 0, enPeriod = 0, quoteZh = 0, quoteHalf = 0, brk = 0, colonZh = 0, nls = 0;
let zhCommaInStyle = 0, styleChars = 0;
for (const x of withPrompt) {
  const styleIdx = x.prompt.indexOf('风格：');
  styleChars += styleIdx >= 0 ? x.prompt.length - styleIdx : 0;
  const p = x.prompt;
  for (const ch of p) {
    if (ch === '，') zhComma++; else if (ch === ',') enComma++;
    else if (ch === '。') zhPeriod++; else if (ch === '.') enPeriod++;
    else if (ch === '“' || ch === '”') quoteZh++; else if (ch === '"') quoteHalf++;
  }
  zhCommaInStyle += (p.slice(styleIdx).match(/，/g) || []).length;
  brk += (p.match(/【/g) || []).length;
  colonZh += (p.match(/：/g) || []).length;
  nls += p.split('\n').length;
}
console.log('\n=== 符号统计（全语料 53 节点）===');
console.log({ 中文逗号: zhComma, 半角逗号: enComma, 中文句号: zhPeriod, 中文双引号: quoteZh, 半角引号: quoteHalf, 中文冒号: colonZh, 方括号对: brk, 总行数: nls });
console.log(`风格块字符占全文 ${(styleChars / withPrompt.reduce((a, x) => a + x.prompt.length, 0) * 100).toFixed(1)}%，其中中文逗号 ${zhCommaInStyle} 个（占全文中文逗号 ${(zhCommaInStyle / zhComma * 100).toFixed(0)}%）`);

// 4. 正文体（画面开始~画面结束）里：句号 vs 逗号
let bodyZhComma = 0, bodyZhPeriod = 0, bodyChars = 0;
for (const x of withPrompt) {
  const a = x.prompt.indexOf('画面开始');
  const b = x.prompt.indexOf('画面结束');
  if (a < 0) continue;
  const body = x.prompt.slice(a, b < 0 ? x.prompt.indexOf('风格：') : b);
  bodyChars += body.length;
  bodyZhComma += (body.match(/，/g) || []).length;
  bodyZhPeriod += (body.match(/。/g) || []).length;
}
console.log(`正文体（画面开始~画面结束）长度 ${bodyChars} 字符：中文句号 ${bodyZhPeriod} 个 ｜ 中文逗号 ${bodyZhComma} 个`);

// 5. 引用形态统计
const refKinds = new Map();
let nodeRefs = 0, uriRefs = 0;
for (const x of withPrompt) {
  nodeRefs += (x.prompt.match(/\{\{node:/g) || []).length;
  uriRefs += (x.prompt.match(/\{\{uri:/g) || []).length;
  for (const r of x.refs) refKinds.set(r, (refKinds.get(r) || 0) + 1);
}
console.log(`\n正文内引用：{{node:}} ${nodeRefs} 处 ｜ {{uri:}} ${uriRefs} 处`);
console.log('最常被引用的素材 top12：');
[...refKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, c]) => console.log('  ', c, k));

// 6. 每节点正文体长度分布（用于判断「真正要手写的部分」有多少）
const bodyLens = withPrompt.map(x => { const a = x.prompt.indexOf('画面开始'); return a < 0 ? 0 : x.prompt.length - a; });
console.log('\n正文体长度中位数', bodyLens.sort((a, b) => a - b)[Math.floor(bodyLens.length / 2)], '最大', bodyLens[bodyLens.length - 1], '最小', bodyLens[0]);
