import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 外部审计报告指控复核 —— 对 PHJ.html v7.7 逐条真机取证（只读，不改产品）
   用法：headless Edge --remote-debugging-port=9222 起好后： node diag_audit_claims.mjs
   覆盖：① 删除模板 toast 是否 undefined；② 复制拼接是否以空行开头（含边界对照）；③ 重渲染耗时随块数增长
*/
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
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../PHJ.html').replace(/\\/g, '/'));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' });
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);

const out = {};

/* ---------- 指控 ①：删除模板 → toast 里是否出现 undefined ---------- */
out.claim_deleteTemplate = await evalJS(`(() => {
  const res = {};
  state.templates = [{ id:'tA', units:[ newUnitObj() ] }, { id:'tB', units:[ newUnitObj() ] }];
  const tplFields = Object.keys(state.templates[0]).join(',');       /* 模板对象到底有哪些字段 */
  renderTplList();
  const listName0 = [...document.querySelectorAll('.sp-tpl-name')].map(e => e.textContent)[0] || null;
  deleteTemplate('tA');
  res.tplFields = tplFields;
  res.toastOnDelete = document.getElementById('toast').innerText.replace(/\\s+/g, ' ').trim();
  const btn = document.querySelector('#toast button');
  res.hasUndoBtn = !!btn;
  if(btn) btn.click();                                              /* 触发撤销回调，看第二条提示 */
  res.toastOnUndo = document.getElementById('toast').innerText.replace(/\\s+/g, ' ').trim();
  res.templatesAfter = state.templates.length;
  res.listNameAfter = [...document.querySelectorAll('.sp-tpl-name')].map(e => e.textContent)[0] || null;
  state.templates = []; renderTplList();
  return res;
})()`);

/* ---------- 指控 ②：复制拼接是否以空行开头（monkey-patch copyText 捕获实际文本） ---------- */
out.claim_leadingBlank = await evalJS(`(() => {
  const cap = [];
  const origin = window.copyText;
  window.copyText = function(s){ cap.push(s); return Promise.resolve(true); };
  const mk = () => { state.blocks = [
      { id:'b1', text:'块一', x:0, y:0 }, { id:'b2', text:'块二', x:0, y:60 }, { id:'b3', text:'块三', x:0, y:120 }];
    render(); };
  /* A：首条目 = 带前缀的模板单元（审计指控场景） */
  mk();
  state.splice.items = [
    { type:'unit', id:'u1', name:'单元 1', prefixes:['前缀A','前缀B'], suffixes:['后缀X','后缀Y'], blockIds:['b1','b2'] },
    { type:'unit', id:'u2', name:'单元 2', prefixes:['第二单元前缀'], suffixes:[], blockIds:['b3'] }
  ];
  copySpliced();
  /* B：首条目 = 平铺块（对照：不应以空行开头） */
  state.splice.items = [
    { type:'block', id:'b1' },
    { type:'unit', id:'u2', name:'单元 2', prefixes:['单元前缀'], suffixes:[], blockIds:['b3'] }
  ];
  copySpliced();
  /* C：单块（最简对照） */
  state.splice.items = [ { type:'block', id:'b1' } ];
  copySpliced();
  window.copyText = origin;
  return {
    firstStartsWithNL: cap[0].charAt(0) === '\\n',
    leadingNLCount: (cap[0].match(/^\\n+/) || [''])[0].length,
    A: JSON.stringify(cap[0]),
    B: JSON.stringify(cap[1]),
    B_startsWithNL: cap[1].charAt(0) === '\\n',
    C: JSON.stringify(cap[2])
  };
})()`);

/* ---------- 指控 ③：重渲染耗时随块数增长（审计称 100 块 24ms / 200 块 66ms） ---------- */
out.perf = await evalJS(`(() => {
  const bench = n => {
    state.blocks = Array.from({length:n}, (_, i) => ({ id:'k'+i, text:'第' + i + '块：“台词，区”与{嵌套，层}普通叙述，尾巴。', x:(i%12)*260, y:Math.floor(i/12)*90 }));
    render();                                  /* 预热 */
    const t0 = performance.now();
    for(let r = 0; r < 3; r++) render();
    return +(((performance.now() - t0) / 3)).toFixed(1);
  };
  const r20 = bench(20), r50 = bench(50), r100 = bench(100), r200 = bench(200);
  const longText = Array.from({length:500}, (_, i) => '第' + (i+1) + '行：“台词，区”与{嵌套，层}普通叙述，尾巴。').join('\\n');
  const t0 = performance.now(); const fam = hlClassify(longText); const cls = +(performance.now() - t0).toFixed(2);
  let errs = 0; for (const f of fam) if (f === 'err') errs++;
  state.blocks = [{ id:'k1', text:'回位', x:100, y:100 }]; render();
  return { render20: r20, render50: r50, render100: r100, render200: r200,
           chars: longText.length, lines: 500, classifyMs: cls, errs };
})()`);

/* ---------- 附：审计其它相关声明 ---------- */
out.claims = await evalJS(`(() => ({
  storageListener: (function(){ let n = 0; const o = window.addEventListener; return null; })(),
  hasSearch: document.body.innerHTML.match(/placeholder="[^"]*搜索|id="[^"]*search/i) ? true : false,
  inlineEditHl: !!document.querySelector('.block-text ~ .blk-hl, .block .blk-hl'),
  spliceShowsHl: !!document.querySelector('.sp-item .hl-err, .sp-item .blk-hl'),
  editorHeightCss: (function(){ const el = document.querySelector('.blk-input'); return el ? getComputedStyle(el).height : null; })(),
  undoBinding: /keydown[\\s\\S]{0,200}(z|Z)/.test(document.documentElement.outerHTML.slice(0, 200000)) ? 'string-hit' : 'none'
}))()`);

console.log('=== ① 删除模板 toast ===');
console.log('  模板对象字段:', out.claim_deleteTemplate.tplFields);
console.log('  删除时提示:', JSON.stringify(out.claim_deleteTemplate.toastOnDelete), '｜ 有撤销按钮:', out.claim_deleteTemplate.hasUndoBtn);
console.log('  撤销后提示:', JSON.stringify(out.claim_deleteTemplate.toastOnUndo), '｜ 模板数:', out.claim_deleteTemplate.templatesAfter);
console.log('  列表显示名:', out.claim_deleteTemplate.listName0, '→', out.claim_deleteTemplate.listNameAfter);
console.log('\n=== ② 复制拼接首行空行 ===');
console.log('  首条目=带前缀单元 → 以空行开头:', out.claim_leadingBlank.firstStartsWithNL, '（前导换行数', out.claim_leadingBlank.leadingNLCount, '）');
console.log('  A(带前缀单元打头):', out.claim_leadingBlank.A);
console.log('  B(平铺块打头，对照):', out.claim_leadingBlank.B, '｜ 以空行开头:', out.claim_leadingBlank.B_startsWithNL);
console.log('  C(单块, 最简):', out.claim_leadingBlank.C);
console.log('\n=== ③ 重渲染耗时（本机实测，对比审计 100 块 24.2ms / 200 块 66.1ms）===');
console.log(`  20 块 ${out.perf.render20}ms ｜ 50 块 ${out.perf.render50}ms ｜ 100 块 ${out.perf.render100}ms ｜ 200 块 ${out.perf.render200}ms`);
console.log(`  着色分类 500 行 ${out.perf.chars} 字 ${out.perf.classifyMs}ms（审计 19000 字 2.82ms）｜ 引号外错误 ${out.perf.errs}`);
console.log('\n=== 附：其它声明 ===');
console.log('  ' + JSON.stringify(out.claims));
ws.close();
