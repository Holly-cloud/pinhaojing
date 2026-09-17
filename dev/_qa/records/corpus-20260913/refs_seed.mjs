import { readFileSync, writeFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());

// 素材清单：node id → type/title，统计被引用次数
const refs = new Map();
for (const x of items) for (const r of x.refs) {
  const [type, ...rest] = r.split(':');
  const title = rest.join(':');
  const k = r;
  if (!refs.has(k)) refs.set(k, { type, title, count: 0 });
  refs.get(k).count++;
}
// 正文里出现的 id（含未被 references 记录的）
const inText = new Map();
for (const x of items) for (const m of x.prompt.matchAll(/\{\{node:(node_[a-z0-9_]+)\}\}/g)) {
  inText.set(m[1], (inText.get(m[1]) || 0) + 1);
}
// id ↔ title 映射：从 generation.references 里拿
const idTitle = new Map();
for (const x of items) { /* refs 已含 title，但无 id 配对；改用 show 原始文件 */ }
import { readdirSync } from 'fs';
for (const f of readdirSync(dir + 'shows')) {
  const j = JSON.parse(readFileSync(dir + 'shows/' + f, 'utf8'));
  const g = j.data.nodes[0].node.generation || {};
  for (const r of g.references || []) idTitle.set(r.id, `${r.type}:${r.title || ''}`);
}
const rows = [...inText.entries()].map(([id, c]) => ({ id, count: c, name: idTitle.get(id) || '(仅出现在正文)' }))
  .sort((a, b) => b.count - a.count);
console.log('=== 正文引用素材清单（id / 出现次数 / 名称）共', rows.length, '个 ===');
rows.forEach(r => console.log(String(r.count).padStart(4), r.name.padEnd(18), r.id));

const byName = new Map();
for (const r of rows) { const k = r.name; byName.set(k, (byName.get(k) || 0) + r.count); }
console.log('\n=== 按名称聚合（去重后）===');
[...byName.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log(String(c).padStart(4), k));

// 镜头N 格式的节点
const shotN = items.filter(x => /镜头\s*\d/.test(x.prompt));
console.log('\n=== 使用「镜头N」分段格式的节点：', shotN.map(x => x.title).join(' / '), `(共${shotN.length})`);
const shotNums = new Map();
for (const x of shotN) for (const m of x.prompt.matchAll(/镜头\s*(\d+)/g)) shotNums.set(m[1], (shotNums.get(m[1]) || 0) + 1);
console.log('镜头编号出现次数:', JSON.stringify([...shotNums.entries()].sort()));

// 首行（打头句式）样本
console.log('\n=== 各节点首行（打头句式）===');
items.forEach(x => console.log('·', JSON.stringify(x.prompt.split('\n')[0].slice(0, 90))));

writeFileSync(dir + 'refs_seed.json', JSON.stringify(rows, null, 1), 'utf8');
