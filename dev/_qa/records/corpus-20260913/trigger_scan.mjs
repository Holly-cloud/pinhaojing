import { readFileSync } from 'fs';
const dir = 'D:/Hermes_Store/_任务暂存_拼好镜侧栏_20260913/';
const items = JSON.parse(readFileSync(dir + 'corpus.json', 'utf8')).filter(x => x.prompt.trim());
const all = items.map(x => x.prompt).join('\n');
const test = ['/', '\\', '@', '#', '|', '~', '<', '>', '$', '%', '^', '&', '*', '+', '=', '!', '?', ';', ':', '"', "'", '`', '.', ',', '-', '_', '　'];
console.log('候选触发符在 53 条语料中的出现次数（0 = 安全）:');
for (const c of test) { const n = all.split(c).length - 1; console.log('  ' + JSON.stringify(c) + ' → ' + n); }
console.log('\n「然后」出现', (all.match(/然后/g) || []).length, '次');
console.log('「然后 摄像机」', (all.match(/然后 摄像机/g) || []).length, '次');
console.log('「然后+摄像机/画面/镜头」', (all.match(/然后[ 　]*(摄像机|画面|镜头)/g) || []).length, '次');
console.log('「摄像机」总共', (all.match(/摄像机/g) || []).length, '次');
console.log('「说【」', (all.match(/说【/g) || []).length, '次；「音色】」', (all.match(/音色】/g) || []).length, '次');
console.log('\n语料里的半角字符统计：半角字母数字 =', (all.match(/[A-Za-z0-9]/g) || []).length, '，半角空格 =', (all.match(/ /g) || []).length);
