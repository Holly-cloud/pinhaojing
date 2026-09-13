import { readFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_任务暂存_拼好镜侧栏_20260913/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());
const P = items.map(x => x.prompt);
const total = P.reduce((a, s) => a + s.length, 0);
const cnt = (re) => P.reduce((a, s) => a + (s.match(re) || []).length, 0);
const chars = (re) => P.reduce((a, s) => a + (s.match(re) || []).reduce((b, m) => b + m.length, 0), 0);

const rows = [];
// 固定件
const styleChars = P.reduce((a, s) => { const i = s.indexOf('风格：'); return a + (i >= 0 ? s.length - i : 0); }, 0);
rows.push(['风格块+硬性要求（44 条）', 44, styleChars]);
// 运镜句式
const cam = [/然后 ?摄像机往画面[左右]方向摇 ?拍摄/g, /摄像机向画面[左右]方向摇/g, /切镜/g, /过肩视角/g];
const camC = cam.reduce((a, r) => a + cnt(r), 0), camCh = cam.reduce((a, r) => a + chars(r), 0);
rows.push(['运镜句式（摇/切镜/过肩）', camC, camCh]);
// 起手式
const opening = [/事件发生在\{\{node:[a-z0-9_]+\}\}室内/g, /镜头\d+·/g, /俯视站位参考图/g, /首帧画面/g, /本镜首帧画面/g];
rows.push(['起手式（事件发生在/镜头N/首帧画面）', opening.reduce((a, r) => a + cnt(r), 0), opening.reduce((a, r) => a + chars(r), 0)]);
// 音色引用
rows.push(['【{{node:…}}音色】引用（48 处）', cnt(/【\{\{node:[a-z0-9_]+\}\}音色】/g), chars(/【\{\{node:[a-z0-9_]+\}\}音色】/g)]);
// 结构件
rows.push(['画面开始/画面结束（57 处）', cnt(/画面开始|画面结束/g), chars(/画面开始|画面结束/g)]);
// 全部 node 引用
rows.push(['全部 {{node:…}} 引用字符量', cnt(/\{\{node:[a-z0-9_]+\}\}/g), chars(/\{\{node:[a-z0-9_]+\}\}/g)]);

console.log('语料总字符', total, '（53 条）\n');
console.log('可机械化段落\t\t处数\t字符数\t占全语料');
for (const [name, c, ch] of rows) console.log(`${name}\t${c}\t${ch}\t${(ch / total * 100).toFixed(1)}%`);
const sum = rows.slice(0, 5).reduce((a, r) => a + r[2], 0);
console.log(`\n前 5 类合计 ${sum} 字符 = 全语料 ${(sum / total * 100).toFixed(1)}%`);

// 单条「纯手写」的量
const hand = items.map(x => {
  let s = x.prompt;
  const i = s.indexOf('风格：'); if (i >= 0) s = s.slice(0, i);
  return s.length;
}).sort((a, b) => a - b);
console.log('剔除固定件后单条字数：中位', hand[Math.floor(hand.length / 2)], '平均', Math.round(hand.reduce((a, b) => a + b) / hand.length));
