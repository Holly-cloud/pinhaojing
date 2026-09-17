import { readFileSync, writeFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_任务暂存_拼好镜侧栏_20260913/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());
const P = items.map(x => ({ t: x.title, s: x.prompt }));
const out = [];
const say = s => { out.push(s); console.log(s); };

/* ============ 1. 骨架序列 ============ */
say('##### 1. 分节骨架：锚点出现顺序 #####');
const seqCount = new Map();
const anchorOf = (line) => {
  const t = line.trim();
  if (!t) return null;
  if (/^画面开始/.test(t)) return '开始';
  if (/^画面结束/.test(t)) return '结束';
  if (/^风格[:：]/.test(t)) return '风格';
  if (/^硬性要求/.test(t)) return '硬性';
  if (/^【/.test(t)) return '【段】';
  if (/^镜头\s*[1-9]/.test(t)) return '镜头N';
  if (/^事件发生在/.test(t)) return '事件发生在';
  if (/^现场情况说明/.test(t)) return '现场说明';
  if (/^禁止项/.test(t)) return '禁止项';
  if (/^强制声明/.test(t)) return '强制声明';
  if (/^画面全程|^画面直接|^画面一开始/.test(t)) return '画面X';
  return '正文';
};
for (const { s } of P) {
  const seq = s.split('\n').map(anchorOf).filter(Boolean);
  // 折叠连续正文
  const col = []; for (const x of seq) { if (x === '正文' && col[col.length - 1] === '正文') continue; col.push(x); }
  const k = col.join(' → ');
  seqCount.set(k, (seqCount.get(k) || 0) + 1);
}
[...seqCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, c]) => say(`  x${c}  ${k}`));

/* ============ 2. 镜头句语法（以「然后」/换行 切分叙事） ============ */
say('\n##### 2. 镜头句的语法槽位（以 然后/同时/接着 为切点） #####');
const SHOT = [];
for (const { s } of P) {
  const i = s.indexOf('画面开始'); const j = s.indexOf('风格：');
  let body = i >= 0 ? s.slice(i, j < 0 ? s.length : j) : '';
  if (!body) continue;
  body = body.replace(/^画面开始[^\n]*\n?/, '').replace(/画面结束。?$/, '');
  for (const seg of body.split(/(?=然后|同时|接着|随即)/)) {
    const t = seg.trim(); if (t.length < 4) continue;
    SHOT.push(t);
  }
}
const slot = (t) => ({
  连接词: (/^(然后|同时|接着|随即)/.exec(t) || [, ''])[1],
  运镜: /摄像机|镜头|切镜|摇|推|拉|俯拍|仰拍|特写|近景|中景|全景|固定镜头|过肩/.test(t),
  台词: /[“”]/.test(t),
  音色: /音色】/.test(t),
  主体引用: /\{\{node:/.test(t),
});
const agg = { 连接词: {}, 运镜: 0, 台词: 0, 音色: 0, 主体引用: 0 };
for (const t of SHOT) { const s = slot(t); agg.运镜 += s.运镜; agg.台词 += s.台词; agg.音色 += s.音色; agg.主体引用 += s.主体引用; if (s.连接词) agg.连接词[s.连接词] = (agg.连接词[s.连接词] || 0) + 1; }
say(`  镜头句总数 ${SHOT.length}（41 条有「画面开始」的节点）`);
say(`  含运镜词 ${agg.运镜} (${(agg.运镜 / SHOT.length * 100).toFixed(0)}%) ｜ 含台词 ${agg.台词} (${(agg.台词 / SHOT.length * 100).toFixed(0)}%) ｜ 含音色引用 ${agg.音色} ｜ 含主体引用 ${agg.主体引用}`);
say(`  连接词分布 ${JSON.stringify(agg.连接词)}`);
const lens = SHOT.map(t => t.length).sort((a, b) => a - b);
say(`  句子长度 中位 ${lens[Math.floor(lens.length / 2)]} 字符，P90 ${lens[Math.floor(lens.length * 0.9)]}`);

/* ============ 3. 运镜参数分布 ============ */
say('\n##### 3. 运镜的槽位参数 #####');
const camVerb = {}, camDir = {}, camSpeed = {}, camSubj = {};
const allShot = SHOT.join(' § ');
for (const m of allShot.matchAll(/摄像机|切镜|固定镜头|过肩视角|摇镜头|推近|拉远|俯拍|仰拍|特写|近景|中景|全景/g)) camVerb[m[0]] = (camVerb[m[0]] || 0) + 1;
for (const m of allShot.matchAll(/往画面(左|右|左方向|右方向|左侧|右侧|上方|下方)/g)) camDir[m[1]] = (camDir[m[1]] || 0) + 1;
for (const m of allShot.matchAll(/(快速|缓慢|缓缓|慢慢|猛|突然)/g)) camSpeed[m[1]] = (camSpeed[m[1]] || 0) + 1;
for (const m of allShot.matchAll(/拍摄([^ ，。]{1,12})/g)) { const k = m[1].replace(/\{\{node:[a-z0-9_]+\}\}/g, '{ref}'); camSubj[k] = (camSubj[k] || 0) + 1; }
say('  运镜词：' + JSON.stringify(camVerb));
say('  方向词：' + JSON.stringify(camDir));
say('  速度/节奏词：' + JSON.stringify(camSpeed));
say('  拍摄对象 top12：' + JSON.stringify(Object.entries(camSubj).sort((a, b) => b[1] - a[1]).slice(0, 12)));

/* ============ 4. 台词句变体 ============ */
say('\n##### 4. 台词句的模板变体 #####');
const tmpl = {};
for (const { s } of P) {
  for (const m of s.matchAll(/([\u4e00-\u9fa5]{0,6}?)(看着镜头方向|对着镜头方向|朝画面[左右]侧|扭头|转头)?\s*(说道|说|喊道|大喊|低声说|失笑说道|失笑|开口)?\s*【\{\{node:[a-z0-9_]+\}\}音色】\s*[:：]\s*“/g)) {
    const k = [m[1] ? '{角色}' : '', m[2] ? '{朝向}' : '', m[3] ? '{动词}' : ''].filter(Boolean).join('+') + '+【{音色}音色】：“…”';
    tmpl[k] = (tmpl[k] || 0) + 1;
  }
}
Object.entries(tmpl).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => say(`  x${c}  ${k}`));
// 不带音色的台词
let plain = 0, withVoice = 0;
for (const { s } of P) { withVoice += (s.match(/音色】/g) || []).length; plain += (s.match(/“[^”]*”/g) || []).length; }
say(`  带【音色】的台词 ${withVoice} 处 ｜ 全文引号句 ${plain} 处（差额 = 非台词的引号用法/未配音色的台词）`);

/* ============ 5. 引用的位置与首次出场规律 ============ */
say('\n##### 5. 引用（{{node:…}}）的位置规律 #####');
let lead = 0, mid = 0, tail = 0, total = 0;
const firstMentionRef = [];
for (const { s } of P) {
  const lines = s.split('\n');
  for (const m of s.matchAll(/\{\{node:[a-z0-9_]+\}\}/g)) {
    total++;
    const lineStart = s.lastIndexOf('\n', m.index) + 1;
    const pos = m.index - lineStart;
    if (pos < 30) lead++; else tail++;
  }
  // 角色首次出场是否带引用：找「{{ref}}名字」形态
  for (const m of s.matchAll(/\{\{node:[a-z0-9_]+\}\}([\u4e00-\u9fa5]{2,4})/g)) firstMentionRef.push(m[1]);
}
say(`  引用总数 ${total} ｜ 行首 30 字符内 ${lead} (${(lead / total * 100).toFixed(0)}%) ｜ 行内靠后 ${tail}`);
const nameCount = {};
firstMentionRef.forEach(n => nameCount[n] = (nameCount[n] || 0) + 1);
say('  「{{引用}}紧接角色名」形态 top10：' + JSON.stringify(Object.entries(nameCount).sort((a, b) => b[1] - a[1]).slice(0, 10)));

/* ============ 6. 空行/换行规律 ============ */
say('\n##### 6. 换行与空行规律 #####');
const blankStats = {};
for (const { s } of P) {
  const k = (s.match(/\n\s*\n/g) || []).length;
  blankStats[k] = (blankStats[k] || 0) + 1;
}
say('  空白行数分布（每条 prompt）：' + JSON.stringify(blankStats));
const lineStats = P.map(x => x.s.split('\n').length);
say(`  行数 中位 ${lineStats.sort((a, b) => a - b)[Math.floor(lineStats.length / 2)]}（说明他习惯长段落、少换行）`);

/* ============ 7. 正文 vs 定型件的标点规律 ============ */
say('\n##### 7. 标点规律（正文体 vs 定型件） #####');
let bh = { '。': 0, '，': 0, '、': 0, '；': 0, '：': 0, '·': 0 };
let sh = { '。': 0, '，': 0, '、': 0, '；': 0, '：': 0, '·': 0 };
for (const { s } of P) {
  const i = s.indexOf('风格：');
  const body = i < 0 ? s : s.slice(0, i), style = i < 0 ? '' : s.slice(i);
  for (const c of Object.keys(bh)) { bh[c] += (body.split(c).length - 1); sh[c] += (style.split(c).length - 1); }
}
say('  正文体：' + JSON.stringify(bh));
say('  定型件：' + JSON.stringify(sh));

writeFileSync(dir + 'regularities_report.txt', out.join('\n'), 'utf8');
