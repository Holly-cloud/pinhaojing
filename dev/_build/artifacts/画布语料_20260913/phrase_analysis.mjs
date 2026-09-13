import { readFileSync, writeFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_小汐临时/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());

// 只取「正文体」= 画面开始 → 风格 之前
function body(p) {
  const a = p.indexOf('画面开始');
  const b = p.indexOf('风格：');
  if (a < 0) return '';
  return p.slice(a, b < 0 ? p.length : b);
}
const bodies = items.map(x => ({ t: x.title, b: body(x.prompt) })).filter(x => x.b);

// 1. 镜头/动作词频
const lex = ['然后','摄像机','往画面右方向摇','往画面左方向摇','往画面右侧摇','往画面左侧摇','切镜','特写','近景','中景','全景','正面','俯拍','仰拍','推近','拉远','缓慢','快速','镜头方向','画面前方','看着镜头','看向','表情','语气','说道','说','失笑','皱眉','眉头','扭头','点头','摇头','转身','起身','坐下','走','跑','手','脸','眼睛','嘴角','停顿','画面开始','画面结束','同时','随即','接着','突然','缓缓','轻轻','微微','一声','响起','特写镜头','镜头','侧','背后','画面外','出画','入画','叠化','转场','黑屏'];
const freq = new Map();
for (const { b } of bodies) for (const w of lex) {
  let i = 0, c = 0;
  while ((i = b.indexOf(w, i)) >= 0) { c++; i += w.length; }
  if (c) freq.set(w, (freq.get(w) || 0) + c);
}
console.log('=== 正文体词频（53 节点）===');
[...freq.entries()].sort((a, b) => b[1] - a[1]).forEach(([w, c]) => console.log(String(c).padStart(4), w));

// 2. 常见短语 n-gram（4~10 字，跨节点出现 >=3 次）
const ngrams = new Map();
for (const { b } of bodies) {
  const s = b.replace(/\s+/g, ' ');
  for (let n = 4; n <= 10; n++) for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    if (/[，。：·]/.test(g[0]) || /[，。：·]/.test(g[n - 1])) continue;
    ngrams.set(g, (ngrams.get(g) || 0) + 1);
  }
}
const cand = [...ngrams.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
// 去掉被更长同类短语包含的
const kept = [];
for (const [g, c] of cand) {
  if (kept.some(([kg]) => kg.includes(g))) continue;
  kept.push([g, c]);
}
console.log('\n=== 正文体高频短语 top 40（跨节点 >=3 次，已去被更长短语包含者）===');
kept.slice(0, 40).forEach(([g, c]) => console.log(String(c).padStart(4), JSON.stringify(g)));

// 3. 台词与音色引用形态
const dlgPat = /【\{\{node:[a-z0-9_]+\}\}音色】/g;
let dlgWithVoice = 0, dlgPlain = 0, quoteCount = 0;
for (const { b } of bodies) {
  dlgWithVoice += (b.match(dlgPat) || []).length;
  const quotes = b.match(/“[^”]*”/g) || [];
  quoteCount += quotes.length;
  dlgPlain += quotes.filter(q => !/音色/.test(q)).length;
}
console.log(`\n=== 台词：带【{{node:…}}音色】标记 ${dlgWithVoice} 处 ｜ 引号台词总数 ${quoteCount} ===`);

// 4. 每个节点的段落数（空行分隔块）
const paraStats = items.map(x => x.prompt.split(/\n\s*\n/).filter(s => s.trim()).length);
console.log('段落数分布', JSON.stringify(paraStats.reduce((a, n) => (a[n] = (a[n] || 0) + 1, a), {})));

// 5. 导出候选片段库（风格块变体1 = 最长出现者）
const styleCount = new Map();
for (const x of items) { const i = x.prompt.indexOf('风格：'); if (i >= 0) styleCount.set(x.prompt.slice(i).trim(), (styleCount.get(x.prompt.slice(i).trim()) || 0) + 1); }
const best = [...styleCount.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`\n=== 主风格块：x${best[1]}，长度 ${best[0].length} 字符，5 个【】段 ===`);
writeFileSync(dir + 'snippet_style_block.txt', best[0], 'utf8');
const topPhrases = kept.slice(0, 60).map(([g, c]) => ({ text: g, count: c }));
writeFileSync(dir + 'snippets_phrases.json', JSON.stringify(topPhrases, null, 1), 'utf8');
