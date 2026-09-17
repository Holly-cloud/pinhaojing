import { readFileSync, writeFileSync, readdirSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const ids = JSON.parse(readFileSync(dir + 'ids.json', 'utf8'));
const titleById = Object.fromEntries(ids.map(x => [x.nodeId, x.title]));
const items = [];
for (const it of ids) {
  const j = JSON.parse(readFileSync(`${dir}shows/${it.nodeId}.json`, 'utf8'));
  const n = j.data.nodes[0].node;
  const g = n.generation || {};
  items.push({
    nodeId: n.nodeId, title: n.title, status: n.status,
    mode: g.mode, model: g.model, ratio: g.ratio, resolution: g.resolution,
    durationSeconds: g.durationSeconds, outputCount: g.outputCount,
    refs: (g.references || []).map(r => `${r.type}:${r.title || r.id}`),
    prompt: g.prompt || '',
    promptLen: (g.prompt || '').length,
    lines: (g.prompt || '').split('\n').length,
  });
}
writeFileSync(dir + 'corpus.json', JSON.stringify(items, null, 1));

// readable dump (numbered by original node title order)
const dump = items.map((x, i) =>
  `${'='.repeat(70)}\n[${i + 1}/${items.length}] ${x.title} (${x.nodeId}) mode=${x.mode} model=${x.model} ${x.ratio}/${x.resolution}/${x.durationSeconds}s status=${x.status}\nrefs: ${x.refs.join(' | ')}\n- len=${x.promptLen} lines=${x.lines}\n${'-'.repeat(70)}\n${x.prompt}\n`).join('\n');
writeFileSync(dir + 'prompts_dump.txt', dump, 'utf8');

// ---- boilerplate detection: repeated lines / repeated segments ----
const lineCount = new Map();
for (const x of items) for (const ln of x.prompt.split('\n')) {
  const k = ln.trim();
  if (!k) continue;
  lineCount.set(k, (lineCount.get(k) || 0) + 1);
}
const repeated = [...lineCount.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
console.log('=== 跨节点重复出现的整行（>=3 次）===');
for (const [ln, c] of repeated) console.log(`x${c} len=${ln.length} :: ${ln.slice(0, 160)}`);

// char share of repeated long lines (>=20 chars) vs total
const repeatedLong = new Set(repeated.filter(([ln]) => ln.length >= 20).map(([ln]) => ln));
let totalChars = 0, boiler = 0;
for (const x of items) {
  totalChars += x.prompt.length;
  for (const ln of x.prompt.split('\n')) if (repeatedLong.has(ln.trim())) boiler += ln.trim().length;
}
console.log(`\n=== 重复长行占比：${boiler} / ${totalChars} = ${(boiler / totalChars * 100).toFixed(1)}% ===`);
console.log(`=== 节点数 ${items.length}，平均 prompt 长度 ${Math.round(totalChars / items.length)} 字符 ===`);
console.log('模式分布', JSON.stringify(items.reduce((a, x) => (a[x.mode] = (a[x.mode] || 0) + 1, a), {})));
console.log('模型分布', JSON.stringify(items.reduce((a, x) => (a[x.model] = (a[x.model] || 0) + 1, a), {})));
console.log('时长分布', JSON.stringify(items.reduce((a, x) => (a[x.durationSeconds] = (a[x.durationSeconds] || 0) + 1, a), {})));
console.log('超长节点', items.filter(x => x.promptLen > 0).sort((a, b) => b.promptLen - a.promptLen).slice(0, 5).map(x => `${x.title}:${x.promptLen}`).join(' '));
