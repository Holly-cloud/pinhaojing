import { readFileSync, writeFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const ids = [];
for (const f of ['nf0.json', 'nf1.json']) {
  const j = JSON.parse(readFileSync(dir + f, 'utf8'));
  for (const it of j.data.items) ids.push({ nodeId: it.nodeId, title: it.title, status: it.status });
}
writeFileSync(dir + 'ids.txt', ids.map(x => x.nodeId).join('\n') + '\n');
writeFileSync(dir + 'ids.json', JSON.stringify(ids, null, 1));
console.log('ids', ids.length);
