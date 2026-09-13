/* 探查探针：引擎对「双引号内的错误符号」的分类（只读，不改产品）
   用法：headless Edge --remote-debugging-port=9222 起好后 node diag_hl_quote_zone.mjs [目标HTML_URL]
        省略 URL 时默认测交付物 PHJ.html；传备份 URL 可做 A/B（如 _build/PHJ_v7.6.1_*_pre-v7.7.html）
   输出：逐字符族名（err = 红字波浪线那类）+ 与着色同源的错误数对照旧正则口径 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, r => res(r.result || r.error)); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
}
const TARGET = process.argv[2] ? process.argv[2] : ('file:///' + encodeURI('D:/Hermes_Store/拼好镜/PHJ.html'));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);

const SAMPLES = [
  ['中文弯引号内中文逗号', '甲说：“你好，世界”乙'],
  ['半角直引号内半角逗号', '甲说:"hi, there"乙'],
  ['花括号台词区（引号嵌在 {} 内）', '{少女说“你好，世界”}'],
  ['引号外对照（应为 err）', '甲说你好，世界'],
  ['引号内后再接引号外', '“内有，逗号”然后外面，也有'],
  ['未闭合引号（行内无闭合）', '甲说：“未闭合，逗号到这里'],
  ['嵌套：引号内再有引号', '“外层‘内层，逗号’”'],
  ['多行：上一行开引号不闭合', '第一行“台词，区\n第二行外面，逗号'],
  ['「」日式引号内逗号', '甲「引用，内容」乙'],
  ['单引号内逗号', "甲‘单引，号’乙"],
  ['JSON 式半角引号（键值之间的逗号在引号外）', '{"a":1, "b":2}'],
  ['引号嵌在【】内的逗号', '【甲“台词，区”乙】'],
  ['弯引号内嵌套花括号', '“外{内，层}层，尾”'],
  ['成对半角引号不对称（3 个引号）', '甲"台词，区"乙"第三，段']
];
const out = await evalJS(`(() => {
  const S = ${JSON.stringify(SAMPLES.map(s => s[1]))};
  const NAMES = ${JSON.stringify(SAMPLES.map(s => s[0]))};
  return S.map((txt, k) => {
    const fam = hlClassify(txt);
    const chars = [...txt].map((c, i) => c + ':' + (c === '\\n' ? 'LF' : fam[i]));
    const errIdx = [...txt].map((c, i) => fam[i] === 'err' ? i : -1).filter(i => i >= 0);
    const html = hlToHTML(txt, null);
    const errSpans = (html.match(/class="hl-err/g) || []).length;
    const errLines = (html.match(/hl-line has-err/g) || []).length;
    const statusErrs = (txt.match(/[，,]/g) || []).length;
    return { name: NAMES[k], text: txt, chars: chars.join(' '), errChars: errIdx.map(i => txt[i]).join(''),
             errSpans, errLines, statusErrs };
  });
})()`);
for (const r of out) {
  console.log('■ ' + r.name + '  「' + r.text.replace(/\n/g, '⏎') + '」');
  console.log('   逐字符: ' + r.chars);
  console.log('   判定: err 字符=[' + r.errChars + ']  hl-err span=' + r.errSpans + '  标红行=' + r.errLines + '  旧正则计数（v7.6 口径，仅对照）=' + r.statusErrs);
}
console.log('\n--- 引擎常量现状 ---');
console.log(await evalJS('JSON.stringify({ HL_ERR: Object.keys(HL_ERR), HL_PAIRS: Object.keys(HL_PAIRS), HL_TOGGLE: Object.keys(HL_TOGGLE) })'));
console.log(await evalJS("JSON.stringify(['「','」','『','』','“','”','‘','’',String.fromCharCode(34),String.fromCharCode(39),'`'].map(c => c + '->' + hlFamOf(c)))"));
ws.close();
