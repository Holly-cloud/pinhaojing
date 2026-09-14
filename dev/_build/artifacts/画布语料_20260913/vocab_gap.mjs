import { readFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_任务暂存_拼好镜侧栏_20260913/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());
const all = items.map(x => x.prompt).join('\n');

/* 他自己的规则文档（02_抽象词解压速查表 第八节）给的标准术语 vs 他实际用的 */
const canon = {
  景别: ['远景', '全景', '中景', '近景', '特写', '大特写', '中近景', '中全景', '半身'],
  运镜: ['推镜', '推镜头', '缓慢推进', '拉镜', '拉镜头', '缓慢拉远', '摇镜头', '移镜', '横移', '跟镜', '跟拍', '升降', '环绕', '固定镜头', '变焦', '甩镜头'],
  切换: ['切换', '切镜', '淡入', '淡出', '叠化', '闪白', '黑场'],
  视角: ['平视', '仰视', '仰拍', '俯视', '俯拍', '顶拍', '主观视角', '过肩', '越肩', '无人机'],
};
console.log('##### 他的标准术语表（02_解压速查表 · 第八节）实际使用情况 #####');
for (const [k, terms] of Object.entries(canon)) {
  console.log(`\n${k}：`);
  for (const t of terms) {
    const n = all.split(t).length - 1;
    console.log(`   ${n > 0 ? '✔' : '✘'} ${t.padEnd(6)} ${n}`);
  }
}

/* 叙事功能型镜头（术语 vs 描述式） */
console.log('\n##### 叙事功能型镜头：他是用术语还是描述式？ #####');
const funcs = ['反应镜头', '插入镜头', '主观镜头', '空镜', '正反打', '反打', '特写插入', '背景人物', '群像'];
for (const f of funcs) console.log(`   ${all.split(f).length - 1}  ${f}`);

/* 描述式"拍摄某人+表情"的镜头句 = 他称之为反应镜头，只是没用术语 */
const shotSentences = [];
for (const x of items) {
  for (const seg of x.prompt.split(/(?=然后|同时|接着)/)) {
    if (/拍摄|镜头|摄像机/.test(seg) && /表情|眉头|脸|眼|嘴|手|头/.test(seg)) shotSentences.push(seg.trim());
  }
}
console.log(`\n「拍摄某人 + 身体/表情细节」的镜头句：${shotSentences.length} 句（他没有用「反应镜头」这个词，但干的就是这件事）`);
console.log('示例：');
shotSentences.slice(0, 3).forEach(s => console.log('   · ' + s.slice(0, 100)));

/* 他的写法里"运镜密度"：每 100 字符出现多少次运镜词 */
const camWords = (all.match(/摄像机|切镜|固定镜头|过肩视角|摇|推镜|拉镜|环绕|跟拍|仰拍|俯拍|移镜/g) || []).length;
console.log(`\n运镜词总出现 ${camWords} 次 / 45253 字符 = 每 1000 字符 ${(camWords / 45.253).toFixed(1)} 次`);
console.log('「摇」', (all.match(/摇/g) || []).length, '次 ｜「切镜」', (all.match(/切镜/g) || []).length, '次 ｜「推」', (all.match(/推/g) || []).length, '次 ｜「拉」', (all.match(/拉/g) || []).length, '次 ｜「环绕」', (all.match(/环绕/g) || []).length, '次 ｜「跟」', (all.match(/跟/g) || []).length, '次');
