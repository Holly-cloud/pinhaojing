import { readFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());
const norm = s => s.split('\n').map(l => l.trimEnd()).join('\n').trim();
console.log('节点数（有 prompt）', items.length);
const total = items.reduce((a, x) => a + x.prompt.length, 0);
console.log('总字符', total, '平均', Math.round(total / items.length), '中位', items.map(x => x.prompt.length).sort((a, b) => a - b)[Math.floor(items.length / 2)]);

// 风格块（含硬性要求）归一化去重
const style = new Map();
const noStyle = [];
for (const x of items) {
  const i = x.prompt.indexOf('风格：');
  if (i < 0) { noStyle.push(x.title); continue; }
  const k = norm(x.prompt.slice(i));
  style.set(k, (style.get(k) || 0) + 1);
}
const sorted = [...style.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n风格块归一化后种类:', sorted.length, '｜分布:', sorted.map(([, c]) => c).join('/'));
console.log('主变体长度', sorted[0][0].length, '字符，占该节点 prompt 比例 =', (sorted[0][0].length / (total / items.length) * 100).toFixed(0) + '%');
const styleChars = (sorted[0][0].length + 6) * [...style.values()].reduce((a, b) => a + b, 0);
console.log('风格块字符合计 ≈', styleChars, '=全语料', (styleChars / total * 100).toFixed(1) + '%');
console.log('缺风格块的节点:', noStyle.join(' / '));

// 逐节点的「固定件占比」
const rows = items.map(x => {
  const i = x.prompt.indexOf('风格：');
  const fixed = i >= 0 ? x.prompt.length - i : 0;
  return { t: x.title, len: x.prompt.length, fixed, pct: Math.round(fixed / x.prompt.length * 100) };
});
const withFixed = rows.filter(r => r.fixed > 0);
console.log('\n含风格块的节点数', withFixed.length, '｜其固定件平均占比', Math.round(withFixed.reduce((a, r) => a + r.pct, 0) / withFixed.length) + '%');
console.log('固定件平均字符数', Math.round(withFixed.reduce((a, r) => a + r.fixed, 0) / withFixed.length));

// 结构件清单（可做片段库的候选）
const parts = [
  ['风格块（5 个【】段，542 字符）', 49],
  ['硬性要求：无BMG，无字幕，禁止自行新增或删减台词。', 46],
  ['画面开始：', 41],
  ['画面结束。', 16],
  ['事件发生在{{node:…}}室内。', 18],
];
console.log('\n=== 片段库候选（出现次数）===');
parts.forEach(([t, c]) => console.log(String(c).padStart(3), t));
