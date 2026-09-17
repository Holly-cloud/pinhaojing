import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestArtifact, auditArtifactDiff } from '../lib/test-artifact.mjs';
import { CSS as MANIFEST_CSS, SLICES as MANIFEST_SLICES } from '../../manifest.mjs';
import { harvestDomainTokens, harvestCorpusStrings, listEngineFiles, DOMAIN_HITS_GOLDEN } from '../lib/skin-guard.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUILD = buildTestArtifact();
const TEST_ARTIFACT = TEST_BUILD.path;   /* A+：测试产物（= 产物 + 1 行访问器），4 套件对它执行；真实产物仅用于体积/P1-A/C/D 断言 */
/* v7.8 验收 · H 组：编辑器结构层 + 结构感知候选气泡 + 槽位 + 复制全文；I 组：补全配置窗口
   —— v7.8.2 收敛：风格包**已放回内置**（v7.8.1「内置降为中性示例」的决定被 Holly 撤销）；
      H 组断言仍**键于「导入后的用户表」**（导入/导出能力本身未变，v7.8.1 成果保留）；
      夹具（v7.8 风格包 5 段 + 硬性要求）仍**运行时从 dev/_qa/snapshots/PHJ_v7.8_20260913.html 提取**
      （快照在 git 历史内）→ 夹具运行时提取机制保留，本脚本不硬编码夹具文本。
   —— X 组边界断言收敛：X1/X2（「内置/产物不含私有正文」）随需求撤销 **已删除**（非放宽）；
      保留 X3（导出 → 再导入 往返一致）/ X4（导入 → reload → 仍在）。
   用法：headless Edge --remote-debugging-port=9222 起好后： node verify_v78.mjs [截图输出.png]
   ※ 调试端口：优先读 PHJ_BROWSER_PORT（run-gate.mjs 传入），缺省 9222。
   真机口径：文本输入走 Input.insertText / 按键走 Input.dispatchKeyEvent / 点击走 Input.dispatchMouseEvent；
   仅「中文输入法组合态门控」一项用页面内合成 CompositionEvent（无头环境无法真起 IME），该条已在断言名标注。 */
import fs from 'node:fs';
/* ── 夹具：**从 v7.8 快照文本运行时提取**（快照已存在于 git 历史）──
   风格包（5 段 + 硬性要求）为便于断言复用，**运行时从 dev/_qa/snapshots/PHJ_v7.8_20260913.html 提取**；
   H 组重锚仍键于「导入后的用户表」，故夹具文本**不硬编码在本脚本**（夹具运行时提取机制保留）。 */
const SNAP = path.join(HERE, '..', 'snapshots', 'PHJ_v7.8_20260913.html');
if (!fs.existsSync(SNAP)) { console.error('夹具快照缺失（应为 git 历史内文件）：' + SNAP); process.exit(3); }
const SNAP_TXT = fs.readFileSync(SNAP, 'utf8');
const STYLE_BLOCK = (SNAP_TXT.match(/var CMPL_STYLE = \[([\s\S]*?)\];/) || [])[1] || '';
const FIX_LABELS = [...STYLE_BLOCK.matchAll(/label:\s*'([^']*)'/g)].map(m => m[1]);
const FIX_PARTS = [...STYLE_BLOCK.matchAll(/body:\s*'([^']*)'/g)].map(m => m[1]);
const FIX_TAIL = ((SNAP_TXT.match(/var CMPL_TAIL = '([^']*)';/) || [])[1]) || '';
if (FIX_PARTS.length !== 5 || FIX_LABELS.length !== 5 || !FIX_TAIL) {
  console.error('夹具提取失败：未能从 v7.8 快照提取风格包 5 段 + 硬性要求（长度 ' + FIX_PARTS.length + '/' + FIX_LABELS.length + '）');
  process.exit(3);
}
const FIX_FULL = '风格：\n' + FIX_PARTS.join('\n') + '\n\n' + FIX_TAIL;
/* 导入用资产（= 一份「风格包」资产；经真实导入路径写入用户表）——文本全部来自上面提取结果 */
const FIX_ASSET_JSON = JSON.stringify({
  kind: 'phj-writing-asset', v: 1, app: 'storyboard-prompt-panel',
  groups: [{ label: '风格包', items: [
    { label: '风格包 · 全套', note: '', body: FIX_FULL, block: true },
    ...FIX_PARTS.map((b, i) => ({ label: FIX_LABELS[i], note: '', body: b, block: false })),
    { label: '硬性要求', note: '', body: FIX_TAIL, block: false }
  ] }]
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';   /* 调试端口：run-gate.mjs 经此环境变量传入，缺省 9222 */
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
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
async function click(sel) {
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
    const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
  if (!r) throw new Error('click target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(120);
}
async function mousedown(sel) {   /* 只按下不抬起：候选是 mousedown 上屏语义 */
  const r = await evalJS(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
    const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; })()`);
  if (!r) throw new Error('mousedown target missing: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(80);
}
const KEY = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 };
async function key(name) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: KEY[name], nativeVirtualKeyCode: KEY[name] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: KEY[name], nativeVirtualKeyCode: KEY[name] });
  await sleep(90);
}
async function type(text) { await send('Input.insertText', { text }); await sleep(120); }
const DIGIT_VK = { '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57 };
async function digit(d) {   /* v7.8：数字键跳位（输入法式） */
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: d, code: 'Digit' + d, windowsVirtualKeyCode: DIGIT_VK[d], nativeVirtualKeyCode: DIGIT_VK[d] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: d, code: 'Digit' + d, windowsVirtualKeyCode: DIGIT_VK[d], nativeVirtualKeyCode: DIGIT_VK[d] });
  await sleep(90);
}

const TARGET = 'file:///' + encodeURI(TEST_ARTIFACT.replace(/\\/g, '/'));   /* A+：对测试产物执行 */
const REAL_PRODUCT = path.resolve(HERE, '../../../PHJ.html');   /* 真实产物：P1-A/P1-C/P1-D 断言的对象 */
const REAL_PRODUCT_URL = 'file:///' + encodeURI(REAL_PRODUCT.replace(/\\/g, '/'));
await send('Page.enable'); await send('Runtime.enable');
/* 记录「每次新文档清空 localStorage」脚本的 id：X3「导入→reload→仍在」需临时摘掉它（否则 reload 即被清空） */
const clearScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try{ localStorage.clear(); }catch(e){}' })).identifier;
await send('Page.navigate', { url: TARGET });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 });
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);

const R = [];
function t(name, pass, detail) { R.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

/* 夹具：按语料真实结构拼的短提示词（起手式 → 画面开始 → 叙事 → 画面结束 → 风格包 → 硬性要求）；
   其中风格包 2 行 + 硬性要求行**取自快照提取结果**（FIX_PARTS / FIX_TAIL），本脚本不含私有字面量 */
const FIX = [
  '事件发生在{{node:node_4ytg0d23am}}室内·周夫子坐在图片最右侧的椅子。',
  '',
  '画面开始：',
  '然后 摄像机往画面右方向摇 拍摄周大伯。周大伯看着镜头方向说【{{node:node_ctz905bh1a}}音色】：“你好。”',
  '画面结束。',
  '',
  '风格：',
  FIX_PARTS[0],
  FIX_PARTS[2],
  '',
  FIX_TAIL
].join('\n');

/* ---------- H19 内置风格包逐字（v7.8.2：冷启动未物化 → 内置 seed 即真实风格包） ----------
   ★ 放在最前（H0 之前）的理由（会话状态）：本断言需「state.cmpl.items === null（冷启动/未物化）」
     这一先决状态，而随后 H0 会导入夹具、I 组会继续物化/改表 —— 故必须在**任何物化之前**单独做一次。
     做完后**重新导航一次**（clearLocalStorage 脚本仍在生效 → LS 再清空）→ 下一轮 H0 从 pristine
     冷启动开始，本断言对后续 39 条**零污染**（且 H0 的导入在 base=seed 与 base=null 下结果相同）。
   ★ 动作走真实路径：openCmplCfg()（「补」窗首次打开即把内置表物化出来，与 I1 同一路径）。
   ★ 逐字口径：labels + bodies + 硬性要求 与 v7.8 原文夹具逐字相等（**不放宽**为「包含/长度>0」）。 */
const h19pre = await evalJS('({ items: (state && state.cmpl) ? state.cmpl.items : "NO_STATE" })');
const h19 = await evalJS(`(() => {
  openCmplCfg();
  var seed = cmplSeedItems().filter(function(x){ return (x.group || '') === '风格包'; });
  var bodyText = (document.getElementById('cmplCfgBody') || {}).textContent || '';
  closeCmplCfg();
  return { labels: seed.map(function(x){ return x.label; }),
           bodies: seed.map(function(x){ return x.body; }),
           hasExample: bodyText.indexOf('示例（请替换）') >= 0 || bodyText.indexOf('【示例·') >= 0 };
})()`);
const H19_LABELS = ['风格包 · 全套'].concat(FIX_LABELS).concat(['硬性要求']);
const H19_BODIES = [FIX_FULL].concat(FIX_PARTS).concat([FIX_TAIL]);
t('H19 冷启动（未物化）→ 内置 seed「风格包」组 labels+bodies+硬性要求 与 v7.8 原文**逐字一致**（全套+5 段+硬性要求），且组内不含「示例（请替换）」标记',
  h19pre.items === null && JSON.stringify(h19.labels) === JSON.stringify(H19_LABELS)
  && JSON.stringify(h19.bodies) === JSON.stringify(H19_BODIES) && !h19.hasExample,
  `items=${JSON.stringify(h19pre.items)}；组内=${JSON.stringify(h19.labels)}；逐字一致=${JSON.stringify(h19.bodies) === JSON.stringify(H19_BODIES)}；含示例标记=${h19.hasExample}`);

/* H19 复位：重新导航（clearLocalStorage 仍生效）→ H0 从 pristine 冷启动开始 */
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);

/* ── H0 夹具前置：走**真实导入路径**（FileReader + cmplImportAsset）载入 v7.8 风格包资产
   —— 之后 H 组断言全部键于「导入后的用户表」，逐字等于 v7.8，原意（风格包能力仍在且可被引用）完整保住。 */
const impFixture = await evalJS(`new Promise(function(res){
  var f = new File([${JSON.stringify(FIX_ASSET_JSON)}], '写作资产_风格包_v1.json', { type: 'application/json' });
  cmplImportAsset(f, function(r){ res(r); });
})`);
t('H0 夹具前置：经真实导入路径（FileReader）载入 v7.8 风格包资产 → 生效表就位（7 条）',
  !!(impFixture && impFixture.ok && impFixture.added === 7),
  impFixture ? `导入 ${JSON.stringify(impFixture)}` : 'null');


/* ---------- H1 结构层：逐行节判定无歧义 ---------- */
const h1 = await evalJS(`(() => {
  var txt = ${JSON.stringify(FIX)};
  var map = structMap(txt);
  var pick = function(i){ return map[i].label; };
  return { n: map.length, labels: map.map(function(m){ return m.label; }), l0: pick(0), l2: pick(2), l3: pick(3), l4: pick(4), l6: pick(6), l7: pick(7), l8: pick(8), l10: pick(10),
           shot: structMap('画面开始：\\n镜头2·{{node:x}}首帧画面·画面左侧是甲。')[1].label,
           anchorShot: structMap('镜头1·{{node:x}}首帧画面·画面左侧是甲。')[0].label };
})()`);
t('H1 结构层逐行判定（起手式/画面开始/叙事正文/画面结束/风格包·属性/硬性要求 + 起手式区的镜头N 不误判为分镜）',
  h1.l0 === '起手式' && h1.l2 === '画面开始' && h1.l3 === '叙事正文' && h1.l4 === '画面结束'
  && h1.l6 === '风格包' && h1.l7 === ('风格包 · ' + FIX_LABELS[0]) && h1.l8 === ('风格包 · ' + FIX_LABELS[2]) && h1.l10 === '硬性要求'
  && h1.shot === '分镜 镜头2' && h1.anchorShot === '起手式',
  `实测 ${JSON.stringify(h1.labels)}`);

/* ---------- H2 状态栏「节」随光标走 ---------- */
await evalJS(`(() => { state.blocks = [{ id:'h1', text:${JSON.stringify(FIX)}, x:40, y:40 }]; state.splice = { items: [], activeUnitId: null }; render(); openBlockEditor(state.blocks[0].text, null); return 1; })()`);
await sleep(150);
const h2 = await evalJS(`(() => {
  var ta = document.getElementById('blkInput'), v = ta.value, out = {};
  var lineStart = function(n){ var p = 0; for(var i=0;i<n;i++) p = v.indexOf('\\n', p) + 1; return p; };
  ta.focus(); ta.setSelectionRange(lineStart(7) + 3, lineStart(7) + 3); hlRefresh(); out.style = document.getElementById('stStruct').textContent;
  ta.setSelectionRange(lineStart(3) + 5, lineStart(3) + 5); hlRefresh(); out.body = document.getElementById('stStruct').textContent;
  ta.setSelectionRange(lineStart(10) + 2, lineStart(10) + 2); hlRefresh(); out.tail = document.getElementById('stStruct').textContent;
  return out;
})()`);
t('H2 状态栏「节」随光标显示当前结构', h2.style === ('风格包 · ' + FIX_LABELS[0]) && h2.body === '叙事正文' && h2.tail === '硬性要求',
  `风格行=${h2.style} 叙事行=${h2.body} 硬性行=${h2.tail}`);

/* ---------- H3 `#` 触发气泡 + 结构置顶（叙事区 → 镜头句组在前） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh(); return 1; })()`);
await type('#');
const h3 = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  var labels = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; });
  var idxs = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-idx'), function(e){ return e.textContent; }).join('');
  var rectE = document.querySelector('.blk-edit').getBoundingClientRect(), rectP = pop.getBoundingClientRect();
  return { open: !pop.classList.contains('hide'), rows: pop.querySelectorAll('.cmpl-item').length,
           groupRows: pop.querySelectorAll('.cmpl-item.cmpl-grp').length, labels: labels, idxs: idxs,
           inEdit: rectP.left >= rectE.left - 1 && rectP.right <= rectE.right + 1, w: Math.round(rectP.width), h: Math.round(rectP.height) };
})()`);
t('H3 输入 `#` 弹候选气泡：第一层是**组视图**（一行一组、带序号 1..9），气泡落在编辑区内',
  h3.open && h3.rows > 0 && h3.inEdit && h3.groupRows === h3.rows && h3.idxs.slice(0, 3) === '123' && h3.idxs.length === h3.rows,
  `组行 ${h3.groupRows}/${h3.rows} 尺寸=${h3.w}×${h3.h} 序号=${h3.idxs} 组序=${JSON.stringify(h3.labels)}`);
t('H4 结构感知置顶：光标在「硬性要求」节（风格区）触发时，风格包组排第一',
  (h3.labels[0] || '') === '风格包', `实际首组＝${h3.labels[0]}｜完整组序=${JSON.stringify(h3.labels)}`);

/* ---------- H5 过滤：`#光影` → 名称命中优先于正文命中（整套只靠正文命中，必须排在后面） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await type('光影');
const h5 = await evalJS(`(() => { var pop = document.getElementById('cmplPop');
  return { rows: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; }) }; })()`);
t('H5 触发符后接查询词即过滤，且名称命中排前（`#光影` → 风格首段第一；只有正文含该词的「风格包·全套」退到后面）',
  h5.rows[0] === FIX_LABELS[0] && h5.rows.indexOf('风格包 · 全套') > 0, `候选=${JSON.stringify(h5.rows)}`);

/* ---------- H6 键盘上屏（↑↓ 切换回第一项 + Enter 提交），触发符被吃掉 ---------- */
const h6first = await evalJS(`(() => { var it = cmplItems[0]; return { label: it.label, len: it.body.length, tail: it.body.slice(-24) }; })()`);
await key('ArrowDown');
await key('ArrowUp');
await key('Enter');
const h6 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); var v = ta.value; var pop = document.getElementById('cmplPop');
  return { len: v.length, tail: v.slice(-24), triggerLeft: v.slice(-400).indexOf('#光影') >= 0, popHidden: pop.classList.contains('hide') }; })()`);
t('H6 键盘 ↑↓ + Enter 上屏（↑↓ 转一圈回到当前第一项并落盘、触发符与查询词被吃掉、气泡关闭）',
  h6.popHidden && !h6.triggerLeft && h6.tail === h6first.tail, `第一项=「${h6first.label}」→ 尾部=「${h6.tail}」（期望「${h6first.tail}」）`);

/* ---------- H6b 键盘层级导航：Enter 进组 → Esc 退回组视图 → Esc 关气泡 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await key('Enter');                                   /* 进组视图第一行 */
const h6b1 = await evalJS(`({ group: cmplGroup, first: cmplItems[0] ? cmplItems[0].label : null, kind: cmplItems[0] ? cmplItems[0].kind : null })`);
await key('Escape');                                  /* 退组 */
const h6b2 = await evalJS(`({ group: cmplGroup, kind: cmplItems[0] ? cmplItems[0].kind : null, popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
await key('Escape');                                  /* 关气泡（编辑器仍在） */
const h6b3 = await evalJS(`({ popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
t('H6b 层级导航：Enter 进组 → Esc 退回组视图 → 再 Esc 关气泡（编辑器不关）',
  h6b1.group === '风格包' && h6b1.kind === 'item' && h6b2.group === null && h6b2.kind === 'group' && !h6b2.popHidden
  && h6b3.popHidden && h6b3.editorOpen,
  `进组=${h6b1.group}｜退组后 kind=${h6b2.kind}｜两次 Esc 后 气泡藏=${h6b3.popHidden} 编辑器开=${h6b3.editorOpen}`);

/* ---------- H7 鼠标点选上屏（mousedown + preventDefault 保焦点） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
const h7a = await evalJS(`(() => { var p = document.getElementById('cmplPop'); if(p.classList.contains('hide')) return null;
  var lab = p.querySelector('.cmpl-item .cmpl-label'); return lab ? lab.textContent : null; })()`);
await mousedown('#cmplPop .cmpl-item');                 /* 第一下：点组 → 进组 */
const h7mid = await evalJS(`({ group: cmplGroup, first: (document.querySelector('#cmplPop .cmpl-item .cmpl-label') || {}).textContent })`);
await mousedown('#cmplPop .cmpl-item');                 /* 第二下：点组内第一条 → 上屏 */
const h7 = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-46), popHidden: pop.classList.contains('hide'), focused: document.activeElement === ta, triggerLeft: ta.value.slice(-30).indexOf('#') >= 0 }; })()`);
t('H7 鼠标点选（两级）：第一下点组 = 进组，第二下点条目 = 上屏（焦点仍在输入框、触发符被吃掉）',
  h7mid.group === h7a && h7.popHidden && h7.focused && !h7.triggerLeft && h7.tail.indexOf(FIX_TAIL) >= 0,
  `点组「${h7a}」→ 进组后首条「${h7mid.first}」→ 尾部=「${h7.tail}」 焦点=${h7.focused}`);

/* ---------- H8 Esc 顺序：第一次关候选、第二次才关编辑器 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await key('Escape');
const h8a = await evalJS(`({ popHidden: document.getElementById('cmplPop').classList.contains('hide'), editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
await key('Escape');
const h8b = await evalJS(`({ editorOpen: !document.getElementById('blkMask').classList.contains('hide') })`);
t('H8 Esc 顺序：候选打开时 Esc 只关候选，再按一次才关编辑器',
  h8a.popHidden && h8a.editorOpen && !h8b.editorOpen, `第一次 Esc → 气泡藏=${h8a.popHidden}/编辑器开=${h8a.editorOpen}；第二次 → 编辑器开=${h8b.editorOpen}`);

/* ---------- H9 槽位：`${n}` 上屏后吃掉标记、Tab 逐位跳并跟住输入位移 ---------- */
await evalJS(`(() => { state.blocks = [{ id:'h9', text:'', x:40, y:40 }]; render();
  openBlockEditor('', function(v){ window.__cb9 = v; }); return 1; })()`);
await sleep(150);
await type('#台词');
await key('Enter');
const h9a = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null, marker: /\\$\\{/.test(ta.value) }; })()`);
await type('干嘛呢');
const h9b = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
await key('Tab');
const h9c = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
t('H9 槽位：${n} 标记上屏即被吃掉（文档里不留标记）、光标落第一个槽位（引号内台词位）',
  !h9a.marker && h9a.v === '说【@音色】：“”' && h9a.caret === h9a.v.indexOf('“') + 1,
  `上屏=「${h9a.v}」 光标=${h9a.caret}（期望 ${h9a.v.indexOf('“') + 1}） 槽位=${JSON.stringify(h9a.slots)}`);
t('H10 槽位跟踪：槽位内打字后续槽位同步位移；多槽位片段（角色+说+音色）Tab 跳到下一个槽位',
  h9b.v === '说【@音色】：“干嘛呢”' && h9c.slots === null && h9c.caret === h9b.caret,
  `打字后=「${h9b.v}」；末槽位后 Tab → 槽位模式结束（slots=${JSON.stringify(h9c.slots)}）`);

/* ---------- H10b 多槽位：角色槽 → Tab → 台词槽（检查位移同步） ---------- */
await evalJS(`(() => { openBlockEditor('', null); return 1; })()`);
await sleep(150);
await type('#角色');
await key('Enter');
const h10b0 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
await type('周夫子');
await key('Tab');
const h10b1 = await evalJS(`(() => { var ta = document.getElementById('blkInput'); return { v: ta.value, caret: ta.selectionStart, slots: cmplSlots ? cmplSlots.slice() : null }; })()`);
t('H10b 两槽位片段：角色槽打字后 Tab 跳到台词槽（槽位位置随输入右移）',
  h10b0.v === '说【@音色】：“”' && h10b1.v === '周夫子说【@音色】：“”' && h10b1.caret === h10b1.v.indexOf('“') + 1 && h10b1.slots && h10b1.slots.length === 2,
  `上屏=「${h10b0.v}」→ 打字+Tab 后=「${h10b1.v}」光标=${h10b1.caret}（期望 ${h10b1.v.indexOf('“') + 1}）槽位=${JSON.stringify(h10b1.slots)}`);

/* ---------- H10c 候选表里不出现 `{{node:…}}`（素材绑定位一律用 @） ---------- */
const h10c = await evalJS(`(() => {
  var bad = [], all = 0;
  for(var gi = 0; gi < CMPL_GROUPS.length; gi++) for(var ii = 0; ii < CMPL_GROUPS[gi].items.length; ii++){
    all++;
    if(CMPL_GROUPS[gi].items[ii].body.indexOf('{{node:') >= 0) bad.push(CMPL_GROUPS[gi].label + '/' + CMPL_GROUPS[gi].items[ii].label);
  }
  return { all: all, bad: bad, hasAt: CMPL_GROUPS[1].items[0].body.indexOf('@') >= 0 };
})()`);
t('H10c 候选片段里不写 `{{node:…}}`（那是画布自动生成的引用；素材绑定位统一用 `@`）',
  h10c.bad.length === 0 && h10c.hasAt, `候选 ${h10c.all} 条，违规 ${h10c.bad.length} 条${h10c.bad.length ? '：' + h10c.bad.join('、') : ''}`);

/* ---------- H16 数字键分级：组视图下数字 = 按组切换；组内数字 = 直取该条上屏 ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
const h16a = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  return { first: (pop.querySelector('.cmpl-item .cmpl-label') || {}).textContent,
           idxs: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-idx'), function(e){ return e.textContent; }).join('') };
})()`);
await digit('1');                                    /* 数字 = 按组切换 → 进第 1 组 */
const h16b = await evalJS(`(() => {
  var pop = document.getElementById('cmplPop');
  return { group: cmplGroup,
           labels: Array.prototype.map.call(pop.querySelectorAll('.cmpl-item .cmpl-label'), function(e){ return e.textContent; }),
           fifth: cmplItems[4] ? cmplPrepare(cmplItems[4].body).text.slice(-20) : null,
           fifthLabel: cmplItems[4] ? cmplItems[4].label : null };
})()`);
await digit('5');                                    /* 组内数字 = 直取该条上屏 */
const h16c = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-20), popHidden: pop.classList.contains('hide'), triggerLeft: ta.value.slice(-400).indexOf('#') >= 0 }; })()`);
t('H16 数字键分级：组视图下数字 = 按组切换（1 → 进第 1 组「风格包」）；组内数字 = 直取该条上屏',
  h16a.idxs === '1234567' && h16a.first === '风格包' && h16b.group === '风格包' && h16b.labels.length >= 5
  && h16c.popHidden && !h16c.triggerLeft && h16c.tail.indexOf(h16b.fifth) >= 0,
  `组视图首行=「${h16a.first}」→ 按 1 进组「${h16b.group}」（${h16b.labels.length} 条）→ 按 5 取「${h16b.fifthLabel}」→ 尾部=「${h16c.tail}」`);

/* ---------- H17 Tab = 一键补全（两级：先按 Tab 进组，再按 Tab 落组内第一条） ---------- */
await evalJS(`(() => { var ta = document.getElementById('blkInput'); ta.value = ${JSON.stringify(FIX)}; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset(); return 1; })()`);
await type('#');
await key('Tab');                                     /* 第一下：进组视图第一行 */
const h17a = await evalJS(`({ group: cmplGroup, first: cmplItems[0] ? cmplItems[0].label : null })`);
const h17first = await evalJS(`(() => { var it = cmplItems[0]; return { label: it.label, tail: it.body.slice(-20) }; })()`);
await key('Tab');                                     /* 第二下：落组内第一条 */
const h17 = await evalJS(`(() => { var ta = document.getElementById('blkInput'), pop = document.getElementById('cmplPop');
  return { tail: ta.value.slice(-20), popHidden: pop.classList.contains('hide'), focused: document.activeElement === ta }; })()`);
t('H17 Tab 一键补全（两级）：`#` → Tab 进组 → Tab 落组内第一条（气泡关闭、焦点留在输入框）',
  h17a.group === '风格包' && h17.popHidden && h17.focused && h17.tail === h17first.tail,
  `进组「${h17a.group}」→ 第一条「${h17first.label}」→ 尾部=「${h17.tail}」 焦点=${h17.focused}`);

/* ---------- H18 无候选时 Tab 不逃逸焦点（否则接着打的字会丢到窗口外） ---------- */
const h18 = await evalJS(`(() => { openBlockEditor('画面结束。', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); cmplReset();
  return { before: document.activeElement === ta, len: ta.value.length }; })()`);
await key('Tab');
const h18b = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { focused: document.activeElement === ta, len: ta.value.length, hasTab: ta.value.indexOf('\\t') >= 0 }; })()`);
t('H18 无候选/无槽位时按 Tab：焦点不逃出编辑器、也不往文本里插 Tab 字符',
  h18.before && h18b.focused && h18b.len === h18.len && !h18b.hasTab,
  `焦点 ${h18.before} → ${h18b.focused}；长度 ${h18.len} → ${h18b.len}`);

/* ---------- H11 风格包·全套：逐字等于夹具全套（5 段 + 硬性要求），且自动补足前置空行 ---------- */
await evalJS(`(() => { openBlockEditor('画面结束。', null); return 1; })()`);
await sleep(150);
await type('#全套');
await key('Enter');
const h11 = await evalJS(`(() => { var v = document.getElementById('blkInput').value; var FULL = ${JSON.stringify(FIX_FULL)};
  return { head: v.slice(0, 16), exact: v === ('画面结束。\\n\\n' + FULL), len: v.length, styleLen: FULL.length, tail: v.slice(-30) }; })()`);
t('H11 「风格包·全套」逐字等于夹具全套（5 段 + 硬性要求，真源＝导入资产），且自动补前置空行',
  h11.exact, `产物 ${h11.len} 字符（含前段）；全套 ${h11.styleLen} 字符；开头=「${h11.head}」尾部=「${h11.tail}」`);

/* ---------- H12 复制全文：剪贴板内容 = textarea.value 原样（不带渲染层 span） ---------- */
const h12 = await evalJS(`(async () => {
  var cap = [];
  var orig = window.copyText;
  window.copyText = function(s){ cap.push(s); return Promise.resolve(true); };
  var btn = document.getElementById('blkCopy');
  btn.click();
  await new Promise(function(r){ setTimeout(r, 60); });
  window.copyText = orig;
  var v = document.getElementById('blkInput').value;
  return { got: cap.length === 1 && cap[0] === v, len: cap[0] ? cap[0].length : -1, hasSpan: /<span/i.test(cap[0] || ''), toast: document.getElementById('toast').innerText.trim() };
})()`);
t('H12 「⧉ 复制全文」送出的就是 textarea 原文（不含着色 span）+ toast 回执',
  h12.got && !h12.hasSpan && h12.toast.indexOf('已复制全文') === 0, `${h12.len} 字符 ｜ toast=「${h12.toast}」`);

/* ---------- H13 中文输入法组合态门控（无头环境用合成 CompositionEvent 验证门闩本身） ---------- */
const h13 = await evalJS(`(() => {
  var ta = document.getElementById('blkInput');
  openBlockEditor('', null);
  ta.focus();
  ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  ta.value = '#'; ta.setSelectionRange(1, 1);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  var composing = { pop: !document.getElementById('cmplPop').classList.contains('hide') };
  ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '#' }));
  var after = { pop: !document.getElementById('cmplPop').classList.contains('hide'), rows: document.getElementById('cmplPop').querySelectorAll('.cmpl-item').length };
  return { composing: composing.pop, after: after.pop, rows: after.rows };
})()`);
t('H13 输入法组合态门控（合成事件）：组合中不弹候选，组合结束才评估',
  h13.composing === false && h13.after === true && h13.rows > 0, `组合中弹=${h13.composing}；组合结束后弹=${h13.after}（${h13.rows} 条）`);

/* ---------- H14 气泡不扰动编辑层（着色层与编辑层排版仍逐字一致：气泡在浮动层） ---------- */
const h14 = await evalJS(`(() => {
  openBlockEditor(${JSON.stringify(FIX)}, null);
  var ta = document.getElementById('blkInput'), pre = document.querySelector('.blk-hl');
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh();
  cmplClose();
  var a = { taW: ta.getBoundingClientRect().width, preW: pre.getBoundingClientRect().width, lines: document.querySelectorAll('.blk-hl .hl-line').length, taH: ta.getBoundingClientRect().height };
  cmplOnInput();
  cmplRender();
  var open = !document.getElementById('cmplPop').classList.contains('hide');
  var b = { taW: ta.getBoundingClientRect().width, preW: pre.getBoundingClientRect().width, lines: document.querySelectorAll('.blk-hl .hl-line').length, taH: ta.getBoundingClientRect().height };
  cmplClose();
  return { a: a, b: b, open: open };
})()`);
t('H14 候选气泡为独立浮层（弹出前后彩色层/编辑层宽度、高度、行数逐项不变）',
  h14.open && h14.a.taW === h14.b.taW && h14.a.preW === h14.b.preW && h14.a.lines === h14.b.lines && h14.a.taH === h14.b.taH,
  `宽 ${h14.a.taW}/${h14.a.preW} → ${h14.b.taW}/${h14.b.preW}；高 ${h14.a.taH} → ${h14.b.taH}；行数 ${h14.a.lines} → ${h14.b.lines}`);

/* ---------- H15 结构层零副作用：着色/错误计数口径未变（对照 v7.7 语义） ---------- */
const h15 = await evalJS(`(() => {
  var txt = '然后 摄像机往画面右方向摇 拍摄某人，然后 他说：“这里有，逗号。”';
  var fam = hlClassify(txt);
  var errs = 0; for(var i=0;i<fam.length;i++) if(fam[i] === 'err') errs++;
  return { errs: errs, expect: 1 };   /* 台词区豁免后：引号内的「，」不计，只剩引号外那一个半角/中文逗号 */
})()`);
t('H15 结构层未改动着色引擎（v7.7 台词区豁免语义保持：引号内逗号不计错误）',
  h15.errs === h15.expect, `错误数=${h15.errs}（期望 ${h15.expect}）`);

/* ========== I 组（v7.8 补全配置窗口：浏览 / 修改 / 新增） ========== */
/* 前置：把上一组留下的编辑器窗口关掉（否则顶栏按钮被遮罩盖住，点不到）；并把片段库复位成「未物化」 */
await evalJS(`(() => { closeBlockEditor(); closeCmplCfg(); state.cmpl = { v: CMPL_SEED_V, items: null }; cmplInvalidate(); return 1; })()`);

/* ---------- I1 顶栏入口 + 首开物化 + 全量列出 ---------- */
const i0 = await evalJS(`({ hasBtn: !!document.getElementById('btnCmpl'), hiddenBefore: document.getElementById('cmplCfgMask').classList.contains('hide'), seedLen: cmplSeedItems().length, materialized: Array.isArray(state.cmpl && state.cmpl.items) })`);
await click('#btnCmpl');
const i1 = await evalJS(`(() => {
  var cards = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card').length;
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  return { open: !document.getElementById('cmplCfgMask').classList.contains('hide'), cards: cards,
           items: state.cmpl && Array.isArray(state.cmpl.items) ? state.cmpl.items.length : -1,
           persisted: !!(ls && ls.cmpl && Array.isArray(ls.cmpl.items)),
           title: (document.querySelector('#cmplCfgMask .tpl-title') || {}).textContent };
})()`);
t('I1 顶栏「补」入口打开补全配置窗口；首次打开即把内置表物化成用户表并落盘（条目数一致）',
  i0.hasBtn && i0.hiddenBefore && !i0.materialized && i1.open && i1.cards === i1.items && i1.items === i0.seedLen && i1.persisted,
  `内置 ${i0.seedLen} 条 → 窗口列出 ${i1.cards} 张卡 / 用户表 ${i1.items} 条；已落盘=${i1.persisted}；标题=「${i1.title}」`);

/* ---------- I2 按组归并 + 搜索框可用 ---------- */
const i2 = await evalJS(`(() => ({
  groups: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group').length,
  distinct: (function(){ var s = {}, n = 0; cmplActive().forEach(function(x){ var g = x.group || '未分组'; if(!s[g]){ s[g] = 1; n++; } }); return n; })(),
  hasSearch: !!document.getElementById('cmplCfgSearch'), listOpts: document.querySelectorAll('#cmplCfgGroupList option').length
}))()`);
t('I2 片段按组归并展示（组标题数 = 生效表里去重后的组数）+ 搜索框与分组候选就位',
  i2.groups === i2.distinct && i2.hasSearch && i2.listOpts === i2.distinct,
  `组标题 ${i2.groups} / 去重组数 ${i2.distinct}；分组候选 ${i2.listOpts} 项`);

/* ---------- I3 修改内置片段：表单预填 → 保存 → 生效表与候选气泡同步 ---------- */
const i3before = await evalJS(`(() => { var f = cmplActive()[0]; return { key: f.key, label: f.label, len: f.body.length }; })()`);
await click('#cmplCfgBody .cmpl-cfg-card [data-act="edit"]');
const i3form = await evalJS(`(() => ({
  editing: document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card.editing').length,
  label: (document.getElementById('cmplCfgLabelIn') || {}).value,
  group: (document.getElementById('cmplCfgGroupIn') || {}).value,
  len: ((document.getElementById('cmplCfgBodyIn') || {}).value || '').length
}))()`);
await evalJS(`(() => {
  var li = document.getElementById('cmplCfgLabelIn'), bi = document.getElementById('cmplCfgBodyIn');
  li.value = '风格段（我的改版）'; bi.value = '【风格段】 这是我改过的版本，专门用来验收配置窗口。';
  return 1;
})()`);
await click('#cmplCfgSave');
const i3after = await evalJS(`(() => {
  var f = cmplActive()[0];
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.setSelectionRange(0, 0);
  ta.value = '#'; ta.setSelectionRange(1, 1); cmplOnInput();
  var pop = document.getElementById('cmplPop');
  var rows = Array.prototype.map.call(pop.querySelectorAll('.cmpl-item'), function(e){ return e.textContent; });
  cmplClose(); closeBlockEditor();
  return { label: f.label, body: f.body, lsBody: ls && ls.cmpl.items[0].body, editorStillOpen: false, rows: rows.slice(0, 3) };
})()`);
t('I3 改内置片段：点「编辑」表单预填原值 → 保存后生效表/localStorage 同步更新，候选气泡里立刻是改后的内容',
  i3form.editing === 1 && i3form.label === i3before.label && i1.cards === i0.seedLen
  && i3after.label === '风格段（我的改版）' && i3after.body.length !== i3before.len && i3after.lsBody === i3after.body,
  `表单预填「${i3form.label}」(${i3form.len} 字符) → 保存后「${i3after.label}」(${i3after.body.length} 字符)；落盘一致=${i3after.lsBody === i3after.body}`);

/* ---------- I4 新增自定义片段（带槽位）→ 候选命中并正确上屏 ---------- */
await evalJS(`(() => { if(document.getElementById('cmplCfgMask').classList.contains('hide')) openCmplCfg(); return 1; })()`);
await click('#cmplCfgNew');
await evalJS(`(() => {
  document.getElementById('cmplCfgGroupIn').value = '我的常用';
  document.getElementById('cmplCfgLabelIn').value = '环绕半圈句';
  document.getElementById('cmplCfgNoteIn').value = '自建';
  document.getElementById('cmplCfgBodyIn').value = '然后 镜头环绕@\${1}半圈，速度\${2}。';
  return 1;
})()`);
await click('#cmplCfgSave');
const i4 = await evalJS(`(() => {
  var found = null; cmplActive().forEach(function(x){ if(x.label === '环绕半圈句') found = x; });
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.focus(); ta.value = '#环绕半圈'; ta.setSelectionRange(5, 5); cmplOnInput();
  var hit = cmplItems.length ? cmplItems[0].label : null;
  return { exists: !!found, group: found && found.group, note: found && found.note, len: cmplActive().length, hit: hit };
})()`);
await key('Enter');
const i4b = await evalJS(`(() => { var ta = document.getElementById('blkInput');
  return { v: ta.value, slots: cmplSlots ? cmplSlots.slice() : null, caret: ta.selectionStart }; })()`);
t('I4 新增自建片段（含 ${n} 槽位）：保存后进生效表、按标签搜索命中、上屏后槽位就位',
  i4.exists && i4.group === '我的常用' && i4.note === '自建' && i4.hit === '环绕半圈句'
  && i4b.v === '然后 镜头环绕@半圈，速度。' && i4b.slots && i4b.slots.length === 2,
  `新片段在表=${i4.exists}（组「${i4.group}」）；候选首条=「${i4.hit}」；上屏=「${i4b.v}」槽位=${JSON.stringify(i4b.slots)}`);

/* ---------- I5 删除 + 撤销 ---------- */
await evalJS(`closeBlockEditor()`);
const i5before = await evalJS(`cmplActive().length`);
await evalJS(`(() => { var k = null; cmplActive().forEach(function(x){ if(x.label === '环绕半圈句') k = x.key; }); cmplCfgDel(k); return 1; })()`);
const i5mid = await evalJS(`(() => ({ len: cmplActive().length, toast: document.getElementById('toast').innerText.replace(/\s+/g,' ').trim(), hasUndo: !!document.querySelector('#toast button') }))()`);
await evalJS(`(() => { var b = document.querySelector('#toast button'); if(b) b.click(); return 1; })()`);
const i5after = await evalJS(`cmplActive().length`);
t('I5 删除片段：生效表立即减一，toast 带「撤销」，撤销后恢复原状',
  i5mid.len === i5before - 1 && i5mid.hasUndo && i5after === i5before,
  `删除 ${i5before} → ${i5mid.len} → 撤销后 ${i5after}；toast=「${i5mid.toast}」`);

/* ---------- I6 恢复内置默认（v7.8.1：先确认 → 丢 seed + 重注内置；保留 asset/user） ---------- */
await click('#cmplCfgReset');
const i6ask = await evalJS(`({ modalOpen: !document.getElementById('modalMask').classList.contains('hide'), title: (document.getElementById('modalTitle') || {}).textContent })`);
await click('#modalOk');
const i6 = await evalJS(`(() => {
  var act = cmplActive(), seed = cmplSeedItems();
  var seedAllPresent = seed.every(function(s){ return act.some(function(x){ return x.key === s.key; }); });
  var keptLabels = act.filter(function(x){ return x.src !== 'seed'; }).map(function(x){ return x.label; });
  return { seedAllPresent: seedAllPresent, keptLabels: keptLabels, len: act.length, seed: seed.length,
           hasUser: keptLabels.indexOf('环绕半圈句') >= 0, hasEdited: keptLabels.indexOf('风格段（我的改版）') >= 0 };
})()`);
t('I6 「恢复内置默认」= **先确认** → 丢弃内置 seed 片段并重注内置片段库，**保留 asset/user**（不静默删用户资产）',
  i6ask.modalOpen && i6.seedAllPresent && i6.hasUser && i6.hasEdited && i6.len === i6.seed + i6.keptLabels.length,
  `先确认=${i6ask.modalOpen}（标题=「${i6ask.title}」）；重注内置全在=${i6.seedAllPresent}；保留 ${i6.keptLabels.length} 条=${JSON.stringify(i6.keptLabels)}；生效 ${i6.len} 条（内置 ${i6.seed}）`);

/* ---------- I7 存储往返 + 迁移（无 cmpl 的 v12 文件；v13 已物化表零丢失） ---------- */
const i7 = await evalJS(`(() => {
  cmplCfgMaterialize();
  var arr = cmplActive().slice();
  arr[0] = { key: arr[0].key, group: arr[0].group, label: '往返测试', note: '', body: '往返测试内容', block: false, src: 'user' };
  cmplSetItems(arr); saveNow();
  var back = migrate(JSON.parse(localStorage.getItem(LS_KEY)));
  var old = migrate({ app: 'storyboard-prompt-panel', version: 12, blocks: [] });
  /* v13 ⇒ v14 零丢失：带已物化 cmpl.items 的 v13 数据 → 逐字保留 + version=14 + 补默认 src */
  var m13 = migrate({ app: 'storyboard-prompt-panel', version: 13, blocks: [], cmpl: { v: 1, items: [
    { key: 'k1', group: '风格包', label: 'L1', note: '', body: '用户资产甲', block: false },
    { key: 'k2', group: '我的', label: 'L2', note: 'n', body: '用户资产乙', block: true }
  ] } });
  return { roundTrip: back.cmpl.items[0].label, version: back.version, oldHidden: old.cmpl.items, oldV: old.version, oldBlocks: old.blocks.length,
           m13v: m13.version, m13len: m13.cmpl.items.length, m13b0: m13.cmpl.items[0].body, m13b1: m13.cmpl.items[1].body, m13s0: m13.cmpl.items[0].src };
})()`);
t('I7 存储往返（state → localStorage → migrate 后仍在）+ 旧数据（无 cmpl / v12）迁移后回落内置、version=14',
  i7.roundTrip === '往返测试' && i7.version === 14 && i7.oldHidden === null && i7.oldV === 14 && i7.oldBlocks === 0,
  `往返=${i7.roundTrip}｜version=${i7.version}｜旧数据 cmpl.items=${JSON.stringify(i7.oldHidden)}（null=用内置）`);
t('I7b v13 ⇒ v14 迁移**零丢失**：已物化的 cmpl.items 逐字保留（仅补默认 src），version 落 14',
  i7.m13v === 14 && i7.m13len === 2 && i7.m13b0 === '用户资产甲' && i7.m13b1 === '用户资产乙' && i7.m13s0 === 'user',
  `v13→${i7.m13v}；items ${i7.m13len} 条：body0=「${i7.m13b0}」body1=「${i7.m13b1}」src0=${i7.m13s0}`);

/* ---------- I8 Esc 关窗 + 回到干净状态 ----------
   放宽理由（**全轮唯一放宽点**，非随手放宽）：I6 语义变更后，生效表内**必然**同时含 asset/user 条目，
   故不能再精确断言「len === seed」。改为「isArr && 内置全在 && len ≥ seed」——保留真正的不变量
   （表已物化、内置一条不少）；**精确计数不变量已由 I6 的 len === seed + keptLabels.length 覆盖**。 */
await evalJS(`(() => { cmplCfgReset(); closeCmplCfg(); openCmplCfg(); return 1; })()`);
await key('Escape');
const i8 = await evalJS(`(() => {
  var act = cmplActive(), seed = cmplSeedItems();
  return { open: !document.getElementById('cmplCfgMask').classList.contains('hide'), isArr: Array.isArray(state.cmpl.items),
           len: act.length, seed: seed.length, seedAllPresent: seed.every(function(s){ return act.some(function(x){ return x.key === s.key; }); }) };
})()`);
await evalJS(`(() => { cmplCfgReset(); return 1; })()`);
t('I8 配置窗口内按 Esc 关窗（关窗后片段库保持已物化状态；末尾已复位）',
  !i8.open && i8.isArr && i8.seedAllPresent && i8.len >= i8.seed,
  `窗口开=${i8.open}；用户表 ${i8.len} 条（内置 ${i8.seed}，内置全在=${i8.seedAllPresent}）`);

/* ---------- I9 前重置 + 重新导入夹具：I9/I10/I11 键于「导入后的用户表」（风格包＝夹具全套） ----------
   先落回未物化内置表（顺带清掉 I4~I8 留下的自建组/条目与 gorder），再导入 → 组序确定为
   [风格包(资产) , 起手式 , 结构件 , 镜头句 , 景别 , 运镜 , 台词]，与 v7.8 原断言口径一致。 */
await evalJS(`(() => { state.cmpl = { v: CMPL_SEED_V, items: null, gorder: null }; cmplInvalidate(); return 1; })()`);
const impBeforeI9 = await evalJS(`new Promise(function(res){
  var f = new File([${JSON.stringify(FIX_ASSET_JSON)}], '写作资产_风格包_v1.json', { type: 'application/json' });
  cmplImportAsset(f, function(r){ res(r); });
})`);

/* ---------- I9 拖拽排序：条目（拖到第 3 条之前 → 插到它前面） ---------- */
const i9 = await evalJS(`(() => {
  cmplCfgMaterialize(); renderCmplCfg();
  var cards = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card');
  var dt = new DataTransfer();
  var a = cards[0], c = cards[2];
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  c.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overCls = c.classList.contains('drag-over');
  c.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  var arr = cmplActive();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  return { overCls: overCls, order: arr.slice(0, 3).map(function(x){ return x.label; }),
           persisted: !!(ls && ls.cmpl && ls.cmpl.items && ls.cmpl.items[1].label === '风格包 · 全套'),
           toast: document.getElementById('toast').innerText.replace(/\s+/g,' ').trim() };
})()`);
t('I9 条目拖拽排序：把第 1 条拖到第 3 条之前 → 生效表顺序改变、落盘、dragover 有高亮反馈',
  i9.overCls && i9.order[0] === FIX_LABELS[0] && i9.order[1] === '风格包 · 全套' && i9.persisted,
  `（前置导入=${!!(impBeforeI9 && impBeforeI9.ok)}）dragover 高亮=${i9.overCls}；新序前三条=${JSON.stringify(i9.order)}；已落盘=${i9.persisted}；toast=「${i9.toast}」`);

/* ---------- I10 拖拽排序：分组（把第 1 组拖到第 3 组之前） ---------- */
const i10 = await evalJS(`(() => {
  var before = cmplGroupOrder().slice();
  var heads = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group');
  var dt = new DataTransfer();
  var a = heads[0], b = heads[2];
  var fromG = a.dataset.group, toG = b.dataset.group;
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  var after = cmplGroupOrder();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  var headOrder = Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group'), function(e){ return e.dataset.group; });
  var bubbleFirst = null;
  openBlockEditor('', null);
  var ta = document.getElementById('blkInput'); ta.value = '#'; ta.setSelectionRange(1, 1); cmplOnInput();
  var pop = document.getElementById('cmplPop');
  bubbleFirst = (pop.querySelector('.cmpl-item .cmpl-label') || {}).textContent;
  cmplClose(); closeBlockEditor();
  return { before: before, after: after, fromG: fromG, toG: toG, headOrder: headOrder, bubbleFirst: bubbleFirst,
           gorder: (ls && ls.cmpl && ls.cmpl.gorder) || null };
})()`);
t('I10 分组拖拽排序：整组换位 → 组顺序变化、写进 state.cmpl.gorder 落盘、配置窗口与候选气泡同步跟随',
  i10.after.indexOf(i10.fromG) === i10.after.indexOf(i10.toG) - 1
  && JSON.stringify(i10.gorder) === JSON.stringify(i10.after)
  && i10.headOrder[0] === i10.after[0] && i10.bubbleFirst === i10.after[0],
  `组序 ${JSON.stringify(i10.before)} → ${JSON.stringify(i10.after)}（把「${i10.fromG}」拖到「${i10.toG}」前）；gorder=${JSON.stringify(i10.gorder)}；headOrder=${JSON.stringify(i10.headOrder)}；气泡首组=「${i10.bubbleFirst}」；子句=${[i10.after.indexOf(i10.fromG) === i10.after.indexOf(i10.toG) - 1, JSON.stringify(i10.gorder) === JSON.stringify(i10.after), i10.headOrder[0] === i10.after[0], i10.bubbleFirst === i10.after[0]].join(',')}`);

/* ---------- I11 拖分组时左侧浮现「顺序小窗」 ---------- */
const i11 = await evalJS(`(() => {
  cmplCfgMaterialize(); renderCmplCfg();
  var heads = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group');
  var dt = new DataTransfer();
  var a = heads[0], g0 = a.dataset.group;
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var pop = document.getElementById('cmplOrderPop');
  var rows = Array.prototype.map.call(pop.querySelectorAll('.cmpl-order-row'), function(e){ return e.dataset.group; });
  var rectW = document.querySelector('#cmplCfgMask .tpl-win').getBoundingClientRect();
  var rectP = pop.getBoundingClientRect();
  return { open: !pop.classList.contains('hide'), rows: rows, active: pop.querySelectorAll('.cmpl-order-row.active').length,
           nums: Array.prototype.map.call(pop.querySelectorAll('.cmpl-order-row .cmpl-order-no'), function(e){ return e.textContent; }).join(''),
           g0: g0, leftOfWin: rectP.right <= rectW.left + 1, cap: (pop.querySelector('.cmpl-order-cap') || {}).textContent };
})()`);
t('I11 拖动分组时：窗口左侧浮现顺序小窗（一行一组、带序号、被拖那行标「拖动中」，且整块落在窗口左侧）',
  i11.open && i11.rows.length >= 7 && i11.rows[0] === i11.g0 && i11.active === 1 && i11.leftOfWin
  && i11.nums.slice(0, 7) === '1234567',
  `小窗开=${i11.open} 行数=${i11.rows.length} 序号=${i11.nums} 被拖=${i11.g0} 左侧=${i11.leftOfWin} 标题=「${i11.cap}」`);

/* ---------- I12 拖到小窗第 3 行 → 该组落到第 3 位 ---------- */
const i12 = await evalJS(`(() => {
  var pop = document.getElementById('cmplOrderPop');
  var rows = pop.querySelectorAll('.cmpl-order-row');
  var fromG = pop.querySelector('.cmpl-order-row.active').dataset.group;
  var target = rows[2];
  var dt = new DataTransfer();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overCls = target.classList.contains('over');
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cmplOrderHide();
  var after = cmplGroupOrder();
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  var headOrder = Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group'), function(e){ return e.dataset.group; });
  return { overCls: overCls, fromG: fromG, after: after, idx: after.indexOf(fromG),
           gorder: (ls && ls.cmpl && ls.cmpl.gorder) || null, popHidden: document.getElementById('cmplOrderPop').classList.contains('hide'),
           headOk: headOrder[0] === after[0] };
})()`);
t('I12 拖到小窗第 3 行：该组落到第 3 位（高亮反馈 + 落盘 + 主列表同步；小窗收起）',
  i12.overCls && i12.idx === 2 && JSON.stringify(i12.gorder) === JSON.stringify(i12.after) && i12.popHidden && i12.headOk,
  `把「${i12.fromG}」拖到第 3 行 → 组序=${JSON.stringify(i12.after)}（现在第 ${i12.idx + 1} 位）；gorder 落盘=${JSON.stringify(i12.gorder) === JSON.stringify(i12.after)}；小窗收起=${i12.popHidden}`);

/* ---------- I13 拖条目时小窗改为「该组内片段顺序」 ---------- */
const i13 = await evalJS(`(() => {
  renderCmplCfg();
  var cards = document.querySelectorAll('#cmplCfgBody .cmpl-cfg-card');
  var a = cards[0];
  var key = a.dataset.idx !== undefined ? null : null;
  var all = cmplActive();
  var firstCardKey = null;
  var dt = new DataTransfer();
  a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var pop = document.getElementById('cmplOrderPop');
  var activeRow = pop.querySelector('.cmpl-order-row.active');
  var rows = Array.prototype.map.call(pop.querySelectorAll('.cmpl-order-row .cmpl-order-tx'), function(e){ return e.textContent; });
  var groupOfActive = activeRow ? activeRow.dataset.group : null;
  var sameGroup = all.filter(function(x){ return (x.group || '未分组') === groupOfActive; }).map(function(x){ return x.label; });
  return { open: !pop.classList.contains('hide'), cap: (pop.querySelector('.cmpl-order-cap') || {}).textContent,
           rows: rows, activeCount: pop.querySelectorAll('.cmpl-order-row.active').length,
           activeIdxInRows: activeRow ? parseInt(activeRow.dataset.idx, 10) : -1,
           groupOfActive: groupOfActive, sameGroup: sameGroup,
           activeKey: activeRow ? activeRow.dataset.key : null, mode: cmplCfgDrag ? cmplCfgDrag.mode : null };
})()`);
t('I13 拖条目时小窗列出「该条所属组」内的片段顺序（标题带组名、行数=该组条数、被拖那条标「拖动中」）',
  i13.open && i13.mode === 'item' && i13.activeCount === 1 && i13.rows.length === i13.sameGroup.length
  && i13.rows.indexOf(i13.sameGroup[0]) >= 0 && (i13.cap || '').indexOf(i13.groupOfActive) >= 0,
  `标题=${i13.cap}｜行数=${i13.rows.length}（组内 ${i13.sameGroup.length}）被拖在第 ${i13.activeIdxInRows + 1} 行 mode=${i13.mode}`);

/* ---------- I14 拖到小窗第 2 行 → 该条目落到组内第 2 位 ---------- */
const i14 = await evalJS(`(() => {
  var pop = document.getElementById('cmplOrderPop');
  var activeRow = pop.querySelector('.cmpl-order-row.active');
  var key = activeRow.dataset.key, g = activeRow.dataset.group;
  var target = pop.querySelectorAll('.cmpl-order-row')[1];
  var dt = new DataTransfer();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overCls = target.classList.contains('over');
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  cmplOrderHide();
  var after = cmplActive().filter(function(x){ return (x.group || '未分组') === g; }).map(function(x){ return x.label; });
  var ls = null; try{ ls = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  var lsLabels = ls && ls.cmpl && ls.cmpl.items ? ls.cmpl.items.filter(function(x){ return (x.group || '未分组') === g; }).map(function(x){ return x.label; }) : null;
  var headOrder = Array.prototype.map.call(document.querySelectorAll('#cmplCfgBody .cmpl-cfg-group'), function(e){ return e.dataset.group; });
  return { overCls: overCls, key: key, group: g, after: after, lsLabels: lsLabels, popHidden: document.getElementById('cmplOrderPop').classList.contains('hide'),
           groupOrderKept: headOrder.indexOf(g) === cmplGroupOrder().indexOf(g) };
})()`);
t('I14 拖到小窗第 2 行：该条目落到组内第 2 位（高亮 + 落盘 + 组顺序不受影响；小窗收起）',
  i14.overCls && i14.after.length === i13.sameGroup.length && i14.after[1] === i13.sameGroup[i13.activeIdxInRows]
  && JSON.stringify(i14.lsLabels) === JSON.stringify(i14.after) && i14.popHidden && i14.groupOrderKept,
  `「${i13.sameGroup[i13.activeIdxInRows]}」拖到第 2 行 → 组「${i14.group}」内序列=${JSON.stringify(i14.after)}；落盘一致=${JSON.stringify(i14.lsLabels) === JSON.stringify(i14.after)}`);

/* ========== X 组（资产 导入/导出 边界断言） ==========
   —— v7.8.2 收敛：v7.8.1 新增的 X1/X2「内置/产物不含私有正文」**随需求撤销已删除**
      （Holly 认定风格包是语料的一部分、已放回内置 → 命题不再成立，属**删除**而非放宽）；保留 X3 / X4。 */

/* ---------- X3 导出 → 再导入 往返一致 ---------- */
const x3 = await evalJS(`(async () => {
  var imp = function(json, name){ return new Promise(function(res){ cmplImportAsset(new File([json], name, { type: 'application/json' }), function(r){ res(r); }); }); };
  var snap = function(){ return cmplActive().map(function(x){ return (x.group || '') + '|' + (x.label || '') + '|' + x.body + '|' + (!!x.block); }); };
  var reset = function(){ state.cmpl = { v: CMPL_SEED_V, items: null, gorder: null }; cmplInvalidate(); };
  reset();                                       /* 干净、确定性的起点（不受 I 组拖拽残留影响） */
  await imp(${JSON.stringify(FIX_ASSET_JSON)}, 'a.json');
  var before = snap();
  var out = cmplExportAsset();                    /* 返回 JSON 字符串（并尽力触发本机下载） */
  reset();
  var r2 = await imp(out, 'b.json');
  var after = snap();
  return { ok: !!(r2 && r2.ok), n: before.length, same: JSON.stringify(before) === JSON.stringify(after) };
})()`);
t('X3 写作资产 **导出 → 再导入 往返一致**（确定性起点：导入夹具 → 导出 → 回落内置 → 再导入 → 生效表逐条相同）',
  x3.ok && x3.n > 0 && x3.same, `条目 ${x3.n} 条；往返一致=${x3.same}`);

/* ---------- X4 真实导入路径可用：导入 → reload → 仍在（localStorage 持久） ---------- */
await evalJS(`new Promise(function(res){
  var f = new File([${JSON.stringify(FIX_ASSET_JSON)}], '写作资产_风格包_v1.json', { type: 'application/json' });
  cmplImportAsset(f, function(r){ saveNow(); res(r); });
})`);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clearScriptId });   /* 摘掉「新文档即清空 LS」以免 reload 丢失 */
await send('Page.reload');
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(500);
const x4 = await evalJS(`(() => {
  var all = cmplActive();
  var style = all.filter(function(x){ return (x.group || '') === '风格包'; });
  var full = null; all.forEach(function(x){ if(x.label === '风格包 · 全套') full = x; });
  return { v: state.version, hasAsset: all.some(function(x){ return x.src === 'asset'; }), styleLen: style.length, fullOk: !!(full && full.body === ${JSON.stringify(FIX_FULL)}) };
})()`);
t('X4 真实导入路径可用：导入 → **reload 后仍在**（localStorage 持久；风格包全套逐字等于夹具）',
  x4.v === 14 && x4.hasAsset && x4.styleLen === 7 && x4.fullOk,
  `version=${x4.v}；含 asset=${x4.hasAsset}；风格包 ${x4.styleLen} 条；全套逐字=${x4.fullOk}`);

/* ---------- P1 新增（构建器止血，**非产品行为**）：dev≡prod 逐字 + CSS 链顺序 ----------
   ① 产物内联 JS 段 == dev/src/dev-bundle.js **逐字一致**：这是「开发态≡产物」的机器证明。
      必须**真读两个对象**并整串逐字比对（不用 includes 局部命中——本项目历史上三次抓到「假装通过」）。
   ② index.html 的 CSS 链顺序 == manifest.CSS 列表：防顺序漂移（与 build.mjs 的构建期校验同源、互为双保险）。 */
const P1_PHJ   = fs.readFileSync(path.resolve(HERE, '../../../PHJ.html'), 'utf8');
const P1_SEG_M = P1_PHJ.match(/<script>([\s\S]*?)<\/script>/);
const P1_SEG   = P1_SEG_M ? P1_SEG_M[1] : '';
const P1_BUNDLE_PATH = path.resolve(HERE, '../../src/dev-bundle.js');
const P1_BUNDLE = fs.existsSync(P1_BUNDLE_PATH) ? fs.readFileSync(P1_BUNDLE_PATH, 'utf8') : null;
t('P1-A dev≡prod：产物内联 JS 段 == dev/src/dev-bundle.js（**逐字一致**，含 IIFE 外壳 + 严格模式）',
  P1_BUNDLE !== null && P1_SEG.length > 0 && P1_SEG === P1_BUNDLE,
  `段长=${P1_SEG.length} bundle长=${P1_BUNDLE === null ? 'MISSING' : P1_BUNDLE.length} 逐字一致=${P1_BUNDLE !== null && P1_SEG === P1_BUNDLE} 段首=${JSON.stringify(P1_SEG.slice(0, 16))}`);
const P1_IDX = fs.readFileSync(path.resolve(HERE, '../../src/index.html'), 'utf8');
const P1_GOT_CSS  = [...P1_IDX.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]);
const P1_WANT_CSS = MANIFEST_CSS.map(c => './' + c.file);
t('P1-B CSS 链顺序：index.html 的 <link rel=stylesheet> 顺序 == manifest.CSS 列表（防顺序漂移）',
  P1_GOT_CSS.length === P1_WANT_CSS.length && P1_GOT_CSS.join('\u0000') === P1_WANT_CSS.join('\u0000'),
  `index=${JSON.stringify(P1_GOT_CSS)}`);

/* ---------- 截图 ---------- */
const SHOT = process.argv[2] || '';
if (SHOT) {
  await evalJS(`(() => { state.blocks = [{ id:'s1', text:${JSON.stringify(FIX)}, x:80, y:60 }]; render(); openBlockEditor(state.blocks[0].text, null);
    var ta = document.getElementById('blkInput'); ta.value += '\\n\\n\\n'; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); hlRefresh();
    ta.value += '#'; ta.setSelectionRange(ta.value.length, ta.value.length); cmplOnInput(); return 1; })()`);
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', SHOT);
  const SHOT2 = process.argv[3] || '';
  if (SHOT2) {
    await evalJS(`(() => { state.blocks = [{ id:'s1', text:${JSON.stringify(FIX)}, x:80, y:60 }]; render(); closeBlockEditor(); openCmplCfg();
      var h = document.querySelector('#cmplCfgBody .cmpl-cfg-group');
      window.__dt = new DataTransfer();
      h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
      var rows = document.querySelectorAll('#cmplOrderPop .cmpl-order-row');
      if(rows[2]) rows[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
      return 1; })()`);
    await sleep(400);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT2, Buffer.from(shot2.data, 'base64'));
    console.log('截图:', SHOT2);
  }
}

/* ---------- P1-C 审计：测试产物 vs 真实产物，逐行 diff 恰为插入的 1 行访问器 ---------- */
const AUDIT = auditArtifactDiff();
t('P1-C 审计：测试产物 == 产物 且逐行 diff 恰为插入的 1 行访问器（保证被测的就是同一份代码，只多这一行）',
  AUDIT.ok, `行数 ${AUDIT.da}→${AUDIT.db}；插入行长 ${AUDIT.insertedLineLen}；prefix=${AUDIT.prefixOk} suffix=${AUDIT.suffixOk} 是访问器行=${AUDIT.isAccessor}`);

/* ---------- P2-A 加载期副作用序契约：keydown/keyup/blur 的**注册顺序**必须与既定契约一致 ----------
   为什么顺序敏感：同一事件按注册序调用 → Escape/keydown 处理链、拖拽 vs 平移的 mousedown 优先级都靠它。
   P2 的合并/拆分**刻意保持**该序（合并块放在"成员中最后一个"的位置、模块内顺序 = 原片顺序）。
   ⚠️ P3（2026-09-16）**有意变更**：Escape 由 8 处 document 级处理器收编为 **1 处分发器**（interact/keys.js
   的 closeTopLayer），故 keydown/keyup/blur 子序由 13 条 → **8 条**（计数改变是收敛的直接结果，非回归；
   契约随之更新，并由 P3-A 独立守"唯一 Esc 处理点"）。 */
const P2_KEY_SEQ_GOLDEN = ['document:keydown', 'document:keyup', 'window:blur', 'window:blur', 'document:keydown', 'document:keydown', 'document:keyup', 'window:blur'];
const P2_SEG = fs.readFileSync(REAL_PRODUCT, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const P2_KEY_SEQ = [...P2_SEG.matchAll(/(document|window)\.addEventListener\(\s*'([a-zA-Z]+)'/g)]
  .map(m => m[1] + ':' + m[2]).filter(x => /keydown|keyup|blur/.test(x));
t('P2-A 加载期副作用序：产物里 keydown/keyup/blur 的注册序 == 契约（重排守门人；P3 收编 Esc 后为 8 条）',
  JSON.stringify(P2_KEY_SEQ) === JSON.stringify(P2_KEY_SEQ_GOLDEN),
  P2_KEY_SEQ.length + ' 条：' + P2_KEY_SEQ.join(' '));

/* ---------- P3-A Escape 统一分发：document 级 keydown 处理器中，含 Escape 的恰为 1 处 ----------
   收编前 8 处各自判断、互不阻断（一次 Esc 可能关掉多层）；收编后唯一处理点 = interact/keys.js 的 closeTopLayer。
   本断言是"路回旧写法"的守门人：谁再加一个 document 级 Esc 处理器，这里必红。
   （元素级 4 处保留：行内编辑框 / 配置窗表单体 / 命名模态框体 / 模板窗输入框——它们 stopPropagation，优先于分发器） */
const P3_CHUNKS = P2_SEG.split("document.addEventListener('keydown'").slice(1);
const P3_WITH_ESC = P3_CHUNKS.filter(c => c.slice(0, 500).includes("'Escape'")).length;
t('P3-A Escape 统一分发：document 级 keydown 处理器共 3 处、其中含 Escape 的恰为 1 处（唯一分发点）',
  P3_CHUNKS.length === 3 && P3_WITH_ESC === 1,
  'doc-keydown=' + P3_CHUNKS.length + ' 含 Esc=' + P3_WITH_ESC);

/* ---------- P2-B 显式导出面：PHJ 恰含 16 个模块键（真读页面内的 PHJ，非静态文本） ----------
   ★2026-09-17 加固（R0 证伪发现）：原断言【只查 16 个模块键存在】，把某个模块的导出面清空为
   `PHJ.x = {}` 仍会 PASS —— 即"键在、内容空"这一整类腐化抓不到。现补一条内容断言，
   要求每个模块的导出面 == 契约清单（逐名精确），任一模块被清空/缩水即红。 */
const P2_MODULES = ['blockEditor', 'canvas', 'clipboard', 'complete', 'highlight', 'keys', 'library', 'modals', 'overlay', 'paste', 'persist', 'pointer', 'splice', 'store', 'struct', 'wiring'];
const P2_KEYS = JSON.parse(await evalJS('JSON.stringify(Object.keys(PHJ).sort())'));
t('P2-B 显式导出面：PHJ 恰含 16 个模块键（PHJ.<module> = {…}，读页面实例）',
  Array.isArray(P2_KEYS) && P2_KEYS.join(',') === P2_MODULES.join(','), 'keys=' + JSON.stringify(P2_KEYS));

/* P2-B2 导出面【内容】契约：每模块导出名逐名精确匹配（键存在 ≠ 面正确） */
const P2_EXPORTS_GOLDEN = {
  blockEditor: ['blkCb', 'closeBlockEditor', 'fitBlkWidth', 'openBlockEditor'],
  canvas: ['applyPan', 'arrangeAll', 'autoResize', 'board', 'canvas', 'fitBlock', 'render', 'textWidth'],
  clipboard: ['copyText', 'toast'],
  complete: ['CMPL_SEED_V', 'cmplActive', 'cmplExportAsset', 'cmplGroupOrder', 'cmplImportAsset', 'cmplNewKey', 'cmplReset', 'cmplSeedItems', 'cmplSetItems'],
  highlight: ['hlRefresh', 'hlSyncBox'],
  keys: [],
  library: ['closeCmplCfg', 'cmplCfgAdding', 'cmplCfgDel', 'cmplCfgEditing', 'cmplCfgQ', 'cmplCfgReset', 'cmplCfgResetAsk', 'cmplCfgSave', 'openCmplCfg', 'renderCmplCfg'],
  modals: ['addBlockHere', 'closeCtxMenu', 'closeModal', 'closeTplWin', 'modalCb', 'newTemplate', 'newUnit', 'openCtxMenu', 'openTplWin', 'renderTplList', 'renderTplWin', 'toggleCollapsed'],
  overlay: ['activeId', 'bringToFront', 'peekBlock', 'refreshOverlays', 'updateLinks', 'updatePeekDots'],
  paste: [],
  persist: ['BACKUP_KEY', 'flush', 'load', 'migrate', 'sanitizeState', 'saveNow', 'scheduleSave', 'toastTimer'],
  pointer: ['actIds', 'blurActive', 'bulkAction', 'findBlockById', 'focusCaretEnd', 'ghostEl', 'ghostSrcId', 'isSel', 'refreshSel', 'resetZoom', 'syncSpliceText', 'toggleSpliceMode', 'updateDragTransform', 'updateZoomBtn', 'zoomAt'],
  splice: ['copySpliced', 'countSpliced', 'popCard', 'popSpliceEntry', 'renderSplice', 'spliceAdd', 'spliceClear', 'spliceRemoveIds', 'suckBlock'],
  store: ['MIN_BLOCK_W', 'defaultState', 'drag', 'gridPos', 'keyDir', 'keyLastT', 'keyLoop', 'keyState', 'keyVel', 'panEndX', 'panEndY', 'panLooping', 'panVel', 'panning', 'selected', 'spacePan', 'spliceMode', 'state', 'tplCur', 'tplOpen', 'uid'],
  struct: ['structAt'],
  wiring: ['exportJSON'],
};
const P2_EXPORTS_ACTUAL = JSON.parse(await evalJS(
  'JSON.stringify(Object.fromEntries(Object.keys(PHJ).sort().map(k => [k, Object.keys(PHJ[k]).sort()])))'));
const P2_EXPORT_MISMATCH = P2_MODULES.filter(m =>
  JSON.stringify(P2_EXPORTS_ACTUAL[m] || []) !== JSON.stringify(P2_EXPORTS_GOLDEN[m].slice().sort()));
t('P2-B2 导出面内容契约：每模块的导出名逐名精确（清空/缩水即红，护 R0 后的对外面）',
  P2_EXPORT_MISMATCH.length === 0,
  P2_EXPORT_MISMATCH.length ? '不符模块=' + JSON.stringify(P2_EXPORT_MISMATCH.map(m => [m, P2_EXPORTS_ACTUAL[m]])) :
    '16 个模块导出面一致，合计 ' + Object.values(P2_EXPORTS_GOLDEN).reduce((a, v) => a + v.length, 0) + ' 名');

/* ---------- P1-D 产品纯度：pristine PHJ.html 加载后 window 自有键增量 ⊆ 白名单（预期空集） ---------- */
const W0_ID = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__W0 = Object.getOwnPropertyNames(window).slice();' })).identifier;
await send('Page.navigate', { url: REAL_PRODUCT_URL });
for (let i = 0; i < 40; i++) { if (await evalJS('document.readyState === "complete"')) break; await sleep(200); }
await sleep(400);
const P1_DELTA = await evalJS('(() => { const s = new Set(window.__W0 || []); return Object.getOwnPropertyNames(window).filter(k => !s.has(k) && k !== "__W0"); })()');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: W0_ID });
t('P1-D 产品纯度：pristine PHJ.html 加载后 window 自有键增量 ⊆ 白名单（当前预期 = 空集 → ' + TEST_BUILD.nameCount + ' 个顶层声明零泄漏）',
  Array.isArray(P1_DELTA) && P1_DELTA.length === 0, 'delta=' + JSON.stringify(P1_DELTA));

/* ---------- R1 皮肤边界：core/** 与 editor/** 不得引用 skin/**（引擎零领域语义） ----------
   ★2026-09-17 新增（R1）。这是「引擎 × 皮肤」路线的**唯一守法断言**：
     · 引擎（core/editor）若直接引用皮肤（skin/），则"换皮肤不动引擎"不成立 → 产品族路线失效；
     · 断言对象 = dev/src 的**源码文本**（静态，不依赖浏览器）——故意做成**可证伪**：
       在 editor/ 任一文件写一行 `skin/corpus` 即必红。
   反向也守：skin/** 不得引用 core/** 或 editor/**（皮肤只放内容、不放机制、不反向依赖引擎）。 */
const SRC_ROOT = path.resolve(HERE, '../../src');
const readIf = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const walkJs = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
};
const ENGINE_FILES = ['core', 'editor'].flatMap((d) => walkJs(path.join(SRC_ROOT, d)));
const SKIN_FILES = fs.existsSync(path.join(SRC_ROOT, 'skin')) ? walkJs(path.join(SRC_ROOT, 'skin')) : [];
/* 引擎文件里出现「skin/」即视为违规（注释里提及不算：先剥注释再判） */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const R1_ENGINE_VIOLATIONS = ENGINE_FILES.filter((f) => /skin\//.test(stripComments(readIf(f) || '')))
  .map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, '/'));
const R1_SKIN_VIOLATIONS = SKIN_FILES.filter((f) => /(core|editor)\//.test(stripComments(readIf(f) || '')))
  .map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, '/'));
t('R1 皮肤边界：引擎（core/editor）零引用 skin/，且 skin/ 不反向依赖引擎（引擎零领域语义的守法断言）',
  R1_ENGINE_VIOLATIONS.length === 0 && R1_SKIN_VIOLATIONS.length === 0,
  '引擎文件 ' + ENGINE_FILES.length + ' 个 / 皮肤文件 ' + SKIN_FILES.length + ' 个；违规 引擎→skin ' +
    JSON.stringify(R1_ENGINE_VIOLATIONS) + ' skin→引擎 ' + JSON.stringify(R1_SKIN_VIOLATIONS));

/* ---------- R1 语料归属：领域语料在 skin 内、且不在引擎内 ---------- */
const R1_SKIN_TXT = SKIN_FILES.map((f) => readIf(f) || '').join('\n');
const R1_ENGINE_TXT = ENGINE_FILES.map((f) => readIf(f) || '').join('\n');
const R1_STYLE_TOKEN = '【光影逻辑】';       /* 风格包正文的特征片段（领域内容） */
t('R1 语料归属：领域语料（风格包）在 skin/ 内、且不在 core/editor 内',
  R1_SKIN_TXT.includes(R1_STYLE_TOKEN) && !R1_ENGINE_TXT.includes(R1_STYLE_TOKEN),
  'skin 命中=' + R1_SKIN_TXT.includes(R1_STYLE_TOKEN) + ' 引擎命中=' + R1_ENGINE_TXT.includes(R1_STYLE_TOKEN));

/* ---------- R3-A/R3-B 引擎零领域语义**棘轮** + 皮肤语料**零泄漏**（★2026-09-17 新增） ----------
   把「引擎零领域语义」从 R1 的「一条边断言」升级为**可执行、可证伪**的棘轮（口径见 lib/skin-guard.mjs）。
   · R3-A：从皮肤源码字面量抽「领域词元」→ 命中**引擎代码（剥注释）**的去重数 **≤ DOMAIN_HITS_GOLDEN**。
     ≤ 而非 =0：现存 STRUCT_MARKS / CMPL_GROUP_HINT 等是**符号契约**，不是待清债；棘轮冻结水位、只堵新增。
     证伪：往 editor/ 写一行**未出现过的**皮肤词元（如 `暖主体`）→ 命中 +1 > golden → 必红。
   · R3-B：皮肤**长语料字符串**（≥40 字）在**非皮肤源码原文**里**零命中**（硬零容忍）。
     证伪：把一段长语料原样粘进 editor/ → 命中非空 → 必红。 */
const R3_TOKENS = harvestDomainTokens(SKIN_FILES);
const R3_ENGINE_FILES = listEngineFiles(SRC_ROOT);
const R3_ENGINE_RAW = R3_ENGINE_FILES.map((f) => readIf(f) || '').join('\n');
const R3_ENGINE_CODE = stripComments(R3_ENGINE_RAW);
const R3_LEAK = R3_TOKENS.filter((tk) => R3_ENGINE_CODE.includes(tk));
t('R3-A 皮肤词元棘轮：皮肤领域词元命中「引擎代码（剥注释）」的去重数 ≤ 冻结尾数（只堵新增泄漏）',
  R3_LEAK.length <= DOMAIN_HITS_GOLDEN,
  '词元 ' + R3_TOKENS.length + ' 个；命中 ' + R3_LEAK.length + ' ≤ golden ' + DOMAIN_HITS_GOLDEN +
    '；命中词元=' + JSON.stringify(R3_LEAK));
const R3_CORPUS = harvestCorpusStrings(SKIN_FILES, 40);
const R3_CORPUS_LEAK = R3_CORPUS.filter((s) => R3_ENGINE_RAW.includes(s));
t('R3-B 皮肤语料零泄漏：皮肤长语料字符串（≥40 字）在「非皮肤源码原文」里零命中（硬零容忍）',
  R3_CORPUS_LEAK.length === 0,
  '长语料 ' + R3_CORPUS.length + ' 条；非皮肤原文命中 ' + R3_CORPUS_LEAK.length +
    (R3_CORPUS_LEAK.length ? '；首段=' + JSON.stringify(R3_CORPUS_LEAK[0].slice(0, 40)) : ''));

/* ---------- R4 皮肤可摘除（**真读产物** 的逐字节证明 + 合成皮肤替换演练）（★2026-09-17 新增） ----------
   命题：产物内联 JS 段 == 「各**非皮肤**片按构建规则拼接」+「**皮肤**片的贡献」，且皮肤片可**整段摘除**
        （摘除后逐字节等于各非皮肤片的拼接）→ 皮肤是**可替换的独立段**：换皮肤不动引擎。
   构建规则（与 build.mjs 同源）：每片贡献 = 内容(LF 归一).replace(/\n$/,'') + '\n'；整体末尾再剥一个 '\n'；
        IIFE 外壳 = '\n;(function(){\n' + 体 + '\n})();\n'。
   证伪：① 改 skin/corpus.js 一个字符 → 产物与「非皮肤拼接 + 皮肤贡献」不再逐字节相等 → 必红；
        ②（替换演练）用合成皮肤内容替换皮肤段 → 引擎前缀/后缀逐字节不变、仅皮肤段变化。 */
const R4_SEG = fs.readFileSync(REAL_PRODUCT, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const R4_LF = R4_SEG.replace(/\r\n/g, '\n');
const R4_PRE = '\n;(function(){\n', R4_SUF = '\n})();\n';
const R4_BODY = (R4_LF.startsWith(R4_PRE) && R4_LF.endsWith(R4_SUF))
  ? R4_LF.slice(R4_PRE.length, R4_LF.length - R4_SUF.length) : null;
const R4_C = (rel) => (readIf(path.join(SRC_ROOT, rel)) || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
const R4_SKIN_REL = MANIFEST_SLICES.filter((s) => s.layer === 'skin').map((s) => s.file);
const R4_NONSKIN_REL = MANIFEST_SLICES.filter((s) => s.layer !== 'skin').map((s) => s.file);
const R4_EXPECT_NON = R4_NONSKIN_REL.map(R4_C).join('\n');
const R4_SKIN_CONTRIB = R4_SKIN_REL.length === 1 ? (R4_C(R4_SKIN_REL[0]) + '\n') : null;
const R4_IDX = (R4_BODY !== null && R4_SKIN_CONTRIB !== null) ? R4_BODY.indexOf(R4_SKIN_CONTRIB) : -1;
const R4_STRIP = R4_IDX >= 0 ? (R4_BODY.slice(0, R4_IDX) + R4_BODY.slice(R4_IDX + R4_SKIN_CONTRIB.length)) : null;
const R4_REMOVABLE = R4_STRIP !== null && R4_STRIP === R4_EXPECT_NON;
/* 替换演练：合成皮肤（唯一标记「合成皮肤·R4」）替换真皮肤段 → 引擎前缀/后缀逐字节不变 */
const R4_SYNTH = "var CMPL_STYLE=[{label:'合成皮肤·R4',body:'【合成皮肤·R4】 用于证明皮肤段可替换的合成语料。'}];\nvar CMPL_TAIL='硬性要求：合成皮肤·R4。';\nfunction cmplFullStyle(){ return '合成皮肤·R4'; }\nvar CMPL_GROUPS=[];\n";
const R4_SWAPPED = R4_IDX >= 0 ? (R4_BODY.slice(0, R4_IDX) + R4_SYNTH + R4_BODY.slice(R4_IDX + R4_SKIN_CONTRIB.length)) : null;
const R4_SWAP_OK = R4_SWAPPED !== null && R4_SWAPPED !== R4_BODY && R4_SWAPPED.includes(R4_SYNTH)
  && R4_SWAPPED.slice(0, R4_IDX) === R4_BODY.slice(0, R4_IDX)
  && R4_SWAPPED.slice(R4_IDX + R4_SYNTH.length) === R4_BODY.slice(R4_IDX + R4_SKIN_CONTRIB.length);
t('R4 皮肤可摘除：产物 JS 段 = 非皮肤片拼接 + 皮肤片贡献；摘除皮肤后逐字节 == 非皮肤拼接（+ 合成皮肤替换演练：引擎前后缀不变）',
  R4_REMOVABLE && R4_SWAP_OK,
  '皮肤片 ' + R4_SKIN_REL.length + ' / 非皮肤片 ' + R4_NONSKIN_REL.length +
    '；段长 ' + (R4_BODY === null ? -1 : R4_BODY.length) + '；可摘除=' + R4_REMOVABLE +
    '；替换演练=' + R4_SWAP_OK + '；皮肤段偏移=' + R4_IDX);

const pass = R.filter(r => r.pass).length;
console.log('=== v7.8 验收（真机 headless Edge + CDP）：H 组 候选/槽位/复制 + I 组 补全配置 + X 组 资产 导入/导出 ===');
for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
console.log(`\nH+I 组合计 ${pass}/${R.length}（含 X 组资产 导入/导出 2 条 + H0 夹具前置 + H19 内置风格包逐字 + P1 构建器 4 条 + P2 2 条 + P3 1 条 + R0 1 条 + R1 2 条 + **R3-A/R3-B 皮肤棘轮/零泄漏 2 条** + **R4 皮肤可摘除 1 条**；标签沿用「H+I」以兼容 run-gate 汇总解析）`);
ws.close();
process.exit(pass === R.length ? 0 : 1);
