
/* ==================== v7.8 候选引擎（结构感知补全 + 槽位 + 复制全文） ====================
   触发：输入 `#` 后弹候选气泡（`#` 在 53 条语料中出现 0 次 → 零冲突；且中文输入法下不占键位——
        初版用 `\`，但中文态按 `\` 会出顿号「、」，已按 Holly 反馈改为 `#`）。
   键鼠双模：↑↓ 切换 / Enter·Tab 一键补全 / 数字 1..9 直取该条（输入法式跳位） / Esc 关闭 / 鼠标点选（mousedown+preventDefault 保住焦点与光标）。
   结构感知：候选按「当前节」（editor/struct.js）置顶——写风格包时风格段在前，写叙事时镜头句在前。
   槽位：片段里的 `${n}` 是占位标记（只在常量里存在，上屏时被吃掉）→ 上屏后 Tab 逐位跳。

   ★R1（2026-09-17）**本模块已零领域语义**：
     内置语料（CMPL_STYLE / CMPL_TAIL / CMPL_GROUPS / cmplFullStyle）已**整体搬至 `skin/corpus.js`**
     （逐字未改，由 H19「内置风格包逐字」守门）。本文件只留**机制**：触发 / 评分 / 两级气泡 /
     槽位 / 生效表 / 资产导入导出。→ 换皮肤 = 换 skin/corpus.js 的内容，**本文件零改动**。
     边界红线：本文件（editor/**）**不得**引用 skin/**；语料经加载序注入（见 manifest.SLICES）。
   ================================================================= */
var CMPL_TRIGGER = '#';            /* 触发符：语料 53 条中 0 次出现；且中文输入法下不占键位（`\` 在中文态会出顿号「、」，故弃用） */
var CMPL_MAX_QUERY = 14;           /* 触发符后最多跟多少字符算查询 */
var CMPL_PER_GROUP = 4;            /* 无查询时每组先露几条 */
var CMPL_DIGIT_JUMP = 9;           /* 候选前 N 条可用数字键 1..N 直接上屏（输入法式） */
var CMPL_SEED_V = 1;               /* 内置表版本：日后往内置表加条目时 +1，迁移会把新条目并入用户表 */
var CMPL_UNUSED_NOTE = '未用过';   /* B（v7.16）：动态徽章触发串——note 命中此值的条目才做「是否已在用户文本出现」判定；其它 note 静态原样 */
var CMPL_GROUP_HINT = { 风格包: 'style', 硬性要求: 'tail', 起手式: 'anchor', 结构件: 'mark', 镜头句: 'body', 景别: 'body', 运镜: 'body', 台词: 'body' };

/* ---- 内置语料（CMPL_STYLE / CMPL_TAIL / cmplFullStyle / CMPL_GROUPS）★R1 见 skin/corpus.js ---- */

/* ---- 运行态 ---- */
var cmplItems = [], cmplSel = 0, cmplOpen = false, cmplSlots = null, cmplSlotIdx = 0, cmplComposing = false;
var cmplGroup = null;   /* null = 组视图（数字=按组切换）；字符串 = 已进入该组（数字=直取条目） */
var _cmctx = null;
var CMPL_FONT = '13.5px ui-monospace,"Cascadia Mono",Consolas,"SF Mono",Menlo,"Microsoft YaHei",monospace';
var CMPL_LH = 13.5 * 1.65;         /* = .blk-hl/.blk-input 的 line-height（铁律：与编辑层排版一致） */
var CMPL_PAD_L = 52, CMPL_PAD_T = 10;   /* = 编辑层 padding */

function cmplWidth(s){
  if(!_cmctx) _cmctx = document.createElement('canvas').getContext('2d');
  _cmctx.font = CMPL_FONT;
  return _cmctx.measureText(String(s).replace(/\t/g, '    ')).width;
}
/* v7.15：宿主守卫 + 宿主寻址（缺省 = 弹窗宿主 hostPopup，保证既有零参调用行为逐字不变） */
function cmplH(host){ return (host && typeof host.el === 'function') ? host : hostPopup; }
function cmplTa(host){ host = cmplH(host); return host.el('ta'); }
function cmplPop(host){ host = cmplH(host); return host.el('pop'); }

/* 把 body 里的 ${n} 占位符吃掉，返回 {text, slots:[相对位置]} */
function cmplPrepare(body){
  var slots = [], out = '', i = 0, re = /\$\{(\d+)\}/g, m, last = 0;
  while((m = re.exec(body))){
    out += body.slice(last, m.index);
    slots.push(out.length);
    last = m.index + m[0].length;
  }
  out += body.slice(last);
  return { text: out, slots: slots };
}
/* 触发符检测：返回 {start, query}；不在触发态 → null */
function cmplQueryAt(ta){
  if(ta.selectionStart !== ta.selectionEnd) return null;
  var v = ta.value, p = ta.selectionStart, i, c;
  for(i = p - 1; i >= 0; i--){
    c = v.charAt(i);
    if(c === CMPL_TRIGGER) return { start: i, query: v.slice(i + 1, p) };
    if(c === '\n' || c === ' ' || c === '\t' || c === '　') return null;
    if(p - i > CMPL_MAX_QUERY) return null;
  }
  return null;
}
/* ---- 生效表（v7.8：内置表 / 用户表；配置界面见 editor/library.js）----
   数据：state.cmpl = { v, items: null | [{key, group, label, note, body, block, src}] }
        items === null → 用内置表；在配置界面动过即物化成用户表（空数组 = 用户清空）
   v7.8.1：条目 src ∈ {seed 内置表, asset 导入资产, user 自建/改写}（缺失 → user，**永不自动删**） */
function cmplSeedItems(){
  var out = [], gi, ii, g, it;
  for(gi = 0; gi < CMPL_GROUPS.length; gi++){
    g = CMPL_GROUPS[gi];
    for(ii = 0; ii < g.items.length; ii++){
      it = g.items[ii];
      out.push({ key: 'b:' + gi + ':' + ii, group: g.label, label: it.label, note: it.note || '', body: it.body, block: !!it.block, src: 'seed' });
    }
  }
  return out;
}
var _cmplCache = null, _cmplCacheSrc = null;
function cmplActive(){
  var c = (typeof state !== 'undefined' && state) ? state.cmpl : null;
  var src = (c && Array.isArray(c.items)) ? c.items : null;
  if(_cmplCache && _cmplCacheSrc === src) return _cmplCache;
  _cmplCacheSrc = src;
  _cmplCache = src ? src.slice() : cmplSeedItems();
  return _cmplCache;
}
function cmplInvalidate(){ _cmplCache = null; _cmplCacheSrc = null; }
function cmplNewKey(){ return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
/* 写回用户表（整表替换 → 缓存必然失效；调用方负责 saveNow） */
function cmplSetItems(arr){
  if(!state.cmpl || typeof state.cmpl !== 'object') state.cmpl = { v: CMPL_SEED_V, items: null, use: {} };
  state.cmpl.items = arr || null;
  state.cmpl.v = CMPL_SEED_V;
  cmplInvalidate();
  cmplUseInvalidate();   /* B：条目清单变了 → needle 来源变（cmplNoteFor 依赖条目），缓存必须失效 */
}

/* ---- v7.16（B 条）：「未用过」变活的——用**用户自己的写作文本**当真相 ----
   判定**仅**作用于 note === CMPL_UNUSED_NOTE 的条目；其余 note 一律静态原样（note 字段永不改写/删除）。
   用户文本 = 全部非图片块的 text ∪ 当前弹窗编辑器 text（写作台与画布同源；叠编辑器含「输入中态」）。
   两级缓存：_cmplUsedText（拼好的快照）+ _cmplUsedMap（逐 needle 记忆，同一 needle 不重复 indexOf）。
   失效统一入口 cmplUseInvalidate()；另有廉价签名兜底（blocks 数 + 文本长）。 */
var _cmplUsedText = null, _cmplUsedSig = null, _cmplUsedMap = {};
/* needle = body 去槽位 ${n} 后**最长连续 CJK 串**（等长取最早）；空串 → 保守视为「从未用过」 */
function cmplNeedle(body){
  var s = String(body == null ? '' : body).replace(/\$\{\d+\}/g, ' ');
  var m = s.match(/[\u4e00-\u9fff]+/g);
  if(!m || !m.length) return '';
  var best = m[0], i;
  for(i = 1; i < m.length; i++){ if(m[i].length > best.length) best = m[i]; }   /* 严格大于才替换 → 等长取最早 */
  return best;
}
function cmplUsedText(){
  var blocks = (typeof state !== 'undefined' && state && Array.isArray(state.blocks)) ? state.blocks : [];
  var parts = [], i, x, txt;
  for(i = 0; i < blocks.length; i++){ x = blocks[i]; if(!x || x.type === 'image') continue; parts.push(String(x.text == null ? '' : x.text)); }
  txt = parts.join('\n');
  var ta = (typeof hostPopup !== 'undefined' && hostPopup) ? hostPopup.el('ta') : null;
  if(ta && typeof ta.value === 'string') txt += '\n' + ta.value;
  var sig = blocks.length + ':' + txt.length;   /* 廉价签名兜底（盲区：等长就地改写 → 见设计 §13-U2，可接受） */
  if(_cmplUsedText !== null && _cmplUsedSig === sig) return _cmplUsedText;
  _cmplUsedSig = sig; _cmplUsedText = txt; _cmplUsedMap = {};
  return _cmplUsedText;
}
function cmplIsUsed(needle){
  if(!needle || needle.length < 2) return false;
  if(Object.prototype.hasOwnProperty.call(_cmplUsedMap, needle)) return _cmplUsedMap[needle];
  var hit = cmplUsedText().indexOf(needle) >= 0;
  _cmplUsedMap[needle] = hit;
  return hit;
}
/* 徽章取值**唯一入口**：'未用过' → 动态（用过则返回 ''，徽章消失）；其它 note → 静态原样 */
function cmplNoteFor(it){
  if(!it) return '';
  if(it.note === CMPL_UNUSED_NOTE) return cmplIsUsed(cmplNeedle(it.body)) ? '' : it.note;
  return it.note || '';
}
function cmplUseInvalidate(){ _cmplUsedText = null; _cmplUsedSig = null; _cmplUsedMap = {}; }

/* ---- v7.16（D 条）：「最近使用」加权（**仅查询视图**的次级排序键，不改 score） ----
   hkey = 'h' + FNV1a32hex(group\0label\0body) —— **内容派生**，免疫语料重排/换皮肤/物化与否；
   用户改写条目内容 → hkey 变 → 计数从头计（合理：改了内容就是另一条）。 */
function cmplHash32(s){                       /* FNV-1a 32bit（纯 ASCII 实现，逐 UTF-16 code unit 混入高低字节） */
  var h = 2166136261, i, c;
  for(i = 0; i < s.length; i++){
    c = s.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 16777619) >>> 0;
    h = Math.imul(h ^ ((c >>> 8) & 0xff), 16777619) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
function cmplUseKey(it){
  if(!it) return 'h00000000';
  return 'h' + cmplHash32(String(it.group || '') + '\u0000' + String(it.label || '') + '\u0000' + String(it.body == null ? '' : it.body));
}
function cmplUseGet(it){
  var c = (typeof state !== 'undefined' && state) ? state.cmpl : null;
  var u = (c && c.use && typeof c.use === 'object') ? c.use[cmplUseKey(it)] : null;
  return (u && typeof u.n === 'number') ? u : null;
}
function cmplUseW(it){
  var u = cmplUseGet(it);
  if(!u || !(u.n > 0)) return 0;
  var ageDays = (Date.now() - (u.t || 0)) / 86400000;
  if(ageDays < 0) ageDays = 0;
  return Math.log(1 + u.n) * Math.pow(0.5, ageDays / 14);   /* 频次对数 × 半衰期 14 天 */
}
function cmplUseTouch(it){
  if(!it) return;
  if(!state.cmpl || typeof state.cmpl !== 'object') state.cmpl = { v: CMPL_SEED_V, items: null, gorder: null, use: {} };
  if(!state.cmpl.use || typeof state.cmpl.use !== 'object') state.cmpl.use = {};
  var k = cmplUseKey(it), u = state.cmpl.use[k];
  if(u && typeof u.n === 'number'){ u.n = u.n + 1; u.t = Date.now(); }
  else state.cmpl.use[k] = { n: 1, t: Date.now() };
}
/* H 接缝（方案 i）：定型件（风格包全套）——供 editor/library.js 的「语料体检」逐字比对（单一皮肤读取缝） */
function cmplStyleRef(){ return cmplFullStyle(); }

/* ---- v7.8.1 写作资产 导出 / 导入（本机文件、FileReader、**零网络**） ----
   格式：{ "kind":"phj-writing-asset", "v":1, "app":..., "groups":[ {label,items:[{label,note,body,block}]} ] }
   导入语义：按组并入——资产里出现的组**以资产内容为准**（整组替换），未出现的组**原样保留**；条目打标 src:'asset'。 */
function cmplAssetGroups(){
  var all = cmplActive(), order = cmplGroupOrder(), out = [], gi, ii, g, list;
  for(gi = 0; gi < order.length; gi++){
    g = order[gi]; list = [];
    for(ii = 0; ii < all.length; ii++){
      if((all[ii].group || '未分组') !== g) continue;
      list.push({ label: all[ii].label || '', note: all[ii].note || '', body: all[ii].body, block: !!all[ii].block });
    }
    if(list.length) out.push({ label: g, items: list });
  }
  return out;
}
function cmplExportAssetData(){
  return { kind: 'phj-writing-asset', v: 1, app: 'storyboard-prompt-panel',
           exportedAt: new Date().toISOString(), groups: cmplAssetGroups() };
}
/* 导出：返回 JSON 字符串（便于复用/单测），并**尽力**触发一次本机下载（失败不抛、不影响返回值） */
function cmplExportAsset(){
  var json = JSON.stringify(cmplExportAssetData(), null, 2);
  try{
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = '写作资产_片段库.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 1000);
  }catch(e){}
  return json;
}
/* 把资产对象并入生效表（纯逻辑，便于单测；返回 {ok, added, total} 或 {ok:false,error}） */
function cmplApplyAsset(obj){
  if(!obj || obj.kind !== 'phj-writing-asset' || !Array.isArray(obj.groups)) return { ok: false, error: '格式不正确：不是写作资产文件' };
  var base = (state.cmpl && Array.isArray(state.cmpl.items)) ? state.cmpl.items.slice() : cmplSeedItems();
  var assetGroups = [], seenG = {}, gi, ii, g, x, out = [], added = 0;
  for(gi = 0; gi < obj.groups.length; gi++){
    g = obj.groups[gi];
    if(g && typeof g.label === 'string' && !seenG[g.label]){ seenG[g.label] = 1; assetGroups.push(g.label); }
  }
  /* 1) 资产组在前（以资产内容为准） */
  for(gi = 0; gi < obj.groups.length; gi++){
    g = obj.groups[gi];
    if(!g || typeof g.label !== 'string' || !Array.isArray(g.items)) continue;
    var label = g.label || '未分组';
    for(ii = 0; ii < g.items.length; ii++){
      x = g.items[ii];
      if(!x || typeof x.body !== 'string') continue;
      out.push({ key: cmplNewKey(), group: label, label: (typeof x.label === 'string' ? x.label : ''),
                 note: (typeof x.note === 'string' ? x.note : ''), body: x.body, block: !!x.block, src: 'asset' });
      added++;
    }
  }
  if(!added) return { ok: false, error: '资产文件里没有可用条目' };
  /* 2) 原有条目里**不属于资产组**的照旧保留（不覆盖其它组） */
  var drop = {}; for(gi = 0; gi < assetGroups.length; gi++) drop[assetGroups[gi]] = 1;
  for(ii = 0; ii < base.length; ii++){
    if(drop[base[ii].group || '未分组']) continue;
    out.push(base[ii]);
  }
  cmplSetItems(out); saveNow();
  return { ok: true, added: added, total: out.length };
}
/* 导入：读本机文件 → 解析 → cmplApplyAsset；回调 cb({ok,added,total} | {ok:false,error}) */
function cmplImportAsset(file, cb){
  cb = cb || function(){};
  if(!file){ cb({ ok: false, error: '未选择文件' }); return; }
  var reader = new FileReader();
  reader.onload = function(){
    var obj = null;
    try{ obj = JSON.parse(String(reader.result)); }catch(e){ cb({ ok: false, error: '不是有效的 JSON 文件' }); return; }
    var r; try{ r = cmplApplyAsset(obj); }catch(e2){ r = { ok: false, error: String((e2 && e2.message) || e2) }; }
    cb(r);
  };
  reader.onerror = function(){ cb({ ok: false, error: '读取文件失败' }); };
  reader.readAsText(file);
}

/* 组顺序：配置窗口里的拖拽顺序（state.cmpl.gorder）优先，其余按生效表出现顺序追加 */
function cmplGroupOrder(){
  var all = cmplActive(), c = (typeof state !== 'undefined' && state) ? state.cmpl : null;
  var ord = (c && Array.isArray(c.gorder)) ? c.gorder.slice() : [], seen = {}, out = [], i, g;
  for(i = 0; i < ord.length; i++){
    g = ord[i];
    if(!seen[g] && all.some(function(x){ return (x.group || '未分组') === g; })){ seen[g] = 1; out.push(g); }
  }
  for(i = 0; i < all.length; i++){
    g = all[i].group || '未分组';
    if(!seen[g]){ seen[g] = 1; out.push(g); }
  }
  return out;
}
/* 组视图：一行一组（数字/Enter/点击 = 进组；本节相关的组置顶） */
function cmplBuildGroups(region){
  var all = cmplActive(), order = cmplGroupOrder(), out = [], i, j, g, n, prev;
  for(i = 0; i < order.length; i++){
    g = order[i]; n = 0; prev = [];
    for(j = 0; j < all.length; j++){
      if((all[j].group || '未分组') !== g) continue;
      n++;
      if(prev.length < 3) prev.push(all[j].label || '');
    }
    if(!n) continue;
    out.push({ kind: 'group', group: g, label: g, count: n, note: n + ' 条',
               body: prev.join('、') + (n > 3 ? ' …' : ''), ord: out.length, score: (CMPL_GROUP_HINT[g] === region ? 0 : 1) });
  }
  out.sort(function(a, b){ return (a.score - b.score) || (a.ord - b.ord); });
  return out.slice(0, 24);
}
/* 组内视图：该组全部条目（数字 = 直取该条上屏） */
function cmplBuildGroupItems(g){
  var all = cmplActive(), out = [], i;
  for(i = 0; i < all.length; i++){
    if((all[i].group || '未分组') !== g) continue;
    out.push({ kind: 'item', group: all[i].group, note: all[i].note, label: all[i].label, body: all[i].body, block: all[i].block });
  }
  return out.slice(0, 40);
}
/* 查询视图：扁平结果（命中质量 名称 > 正文）+ 本节相关置顶 + v7.16 使用量次级键 */
function cmplBuild(query, region){
  var all = cmplActive(), q = String(query || '').toLowerCase(), pool = [], i, it;
  for(i = 0; i < all.length; i++){
    it = all[i];
    var score = cmplScore(it, q, region);
    if(score < 0) continue;
    pool.push({ kind: 'item', group: it.group || '未分组', note: it.note, label: it.label, body: it.body, block: it.block, score: score, ord: pool.length, useW: cmplUseW(it) });
  }
  /* 稳定排序：命中质量 → **使用量 useW（降序，次级键，不越档）** → 原顺序（无使用记录时 useW=0，行为与现状逐字一致） */
  pool.sort(function(a, b){ return (a.score - b.score) || (b.useW - a.useW) || (a.ord - b.ord); });
  return pool.slice(0, 24);
}
/* 命中评分：0 = 名称前缀命中 / 1 = 名称命中 / 2 = 正文命中（弱）；-1 = 不命中；本节相关组再 -0.5 提前 */
function cmplScore(it, q, region){
  var groupLabel = it.group || '未分组', s;
  if(!q) s = 0;
  else{
    var gl = groupLabel.toLowerCase(), lb = String(it.label || '').toLowerCase();
    if(gl.indexOf(q) === 0 || lb.indexOf(q) === 0) s = 0;
    else if(gl.indexOf(q) >= 0 || lb.indexOf(q) >= 0) s = 1;
    else if(String(it.body || '').toLowerCase().indexOf(q) >= 0) s = 2;
    else return -1;
  }
  if(CMPL_GROUP_HINT[groupLabel] === region) s -= 0.5;
  return s;
}
function cmplRender(host){
  host = cmplH(host);
  var pop = cmplPop(host); if(!pop) return;
  pop.innerHTML = '';
  var lastG = null, i, it;
  for(i = 0; i < cmplItems.length; i++){
    it = cmplItems[i];
    if(it.kind !== 'group' && it.group !== lastG){   /* 组视图不再插组标题行 */
      lastG = it.group;
      var h = document.createElement('div');
      h.className = 'cmpl-group';
      h.textContent = it.group;
      pop.appendChild(h);
    }
    var row = document.createElement('div');
    row.className = 'cmpl-item' + (i === cmplSel ? ' sel' : '') + (it.kind === 'group' ? ' cmpl-grp' : '');
    row.dataset.idx = i;
    if(i < CMPL_DIGIT_JUMP){
      var no = document.createElement('span');   /* 序号 = 数字键：组视图下按组切换，组内/查询下直取该条 */
      no.className = 'cmpl-idx';
      no.textContent = (i + 1);
      row.appendChild(no);
    }
    var lb = document.createElement('span');
    lb.className = 'cmpl-label';
    lb.textContent = it.label;
    row.appendChild(lb);
    var noteToShow = cmplNoteFor(it);   /* B（v7.16）：'未用过' 走动态判定，其它 note 静态原样 */
    if(noteToShow){
      var nt = document.createElement('span');
      nt.className = 'cmpl-note';
      nt.textContent = noteToShow;
      row.appendChild(nt);
    }
    var pv = document.createElement('span');
    pv.className = 'cmpl-preview';
    pv.textContent = it.kind === 'group' ? String(it.body || '') : it.body.replace(/\$\{\d+\}/g, '…').slice(0, 28);
    row.appendChild(pv);
    if(it.kind === 'group'){
      var ar = document.createElement('span');
      ar.className = 'cmpl-arrow';
      ar.textContent = '›';
      row.appendChild(ar);
    }
    pop.appendChild(row);
  }
  pop.classList.remove('hide');
  cmplOpen = true;
  var sel = pop.querySelector('.cmpl-item.sel');
  if(sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  cmplPlace(host);
}
/* 气泡定位：光标行下方（越界则上翻 / 右边界内收） */
function cmplPlace(host){
  host = cmplH(host);
  var pop = cmplPop(host), ta = cmplTa(host); if(!pop || !ta) return;
  var v = ta.value, p = ta.selectionStart, before = v.slice(0, p);
  var lineIdx = before.split('\n').length - 1;
  var lineStart = before.lastIndexOf('\n') + 1;
  var x = CMPL_PAD_L + cmplWidth(before.slice(lineStart)) - ta.scrollLeft;
  var yTop = CMPL_PAD_T + lineIdx * CMPL_LH - ta.scrollTop;
  var w = pop.offsetWidth, h = pop.offsetHeight;
  var maxX = ta.offsetWidth - w - 4;
  if(x > maxX) x = Math.max(4, maxX);
  if(x < 4) x = 4;
  var y = yTop + CMPL_LH + 2;
  if(y + h > ta.offsetHeight && yTop - h - 2 > 0) y = yTop - h - 2;   /* 下方不够 → 弹到上方 */
  pop.style.left = Math.round(x) + 'px';
  pop.style.top = Math.round(Math.max(0, y)) + 'px';
}
function cmplClose(host){
  host = cmplH(host);
  var pop = cmplPop(host);
  if(pop) pop.classList.add('hide');
  cmplOpen = false; cmplItems = []; cmplSel = 0; cmplGroup = null;
}
function cmplReset(host){
  cmplClose(host);
  cmplSlots = null; cmplSlotIdx = 0; cmplComposing = false;
  cmplUseInvalidate();   /* B：收候选时顺带失效，防跨轮串味 */
}
/* 进组：只换候选列表，不动文本（触发符仍在） */
function cmplEnterGroup(g, host){
  host = cmplH(host);
  var ta = cmplTa(host);
  var st = (ta && typeof structAt === 'function') ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  cmplGroup = g;
  cmplItems = cmplBuildGroupItems(g);
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(host); return; }
  cmplRender(host);
}
/* 退组：回到组视图（Esc 第一次） */
function cmplLeaveGroup(host){
  host = cmplH(host);
  var ta = cmplTa(host);
  var st = (ta && typeof structAt === 'function') ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  cmplGroup = null;
  cmplItems = cmplBuildGroups(st.region);
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(host); return; }
  cmplRender(host);
}
/* 上屏（组视图下 Enter/数字/点击 = 进组） */
function cmplCommit(host){
  host = cmplH(host);
  var ta = cmplTa(host), it = cmplItems[cmplSel];
  if(!ta || !it) return;
  if(it.kind === 'group'){ cmplEnterGroup(it.group, host); return; }
  var q = cmplQueryAt(ta);
  if(!q){ cmplClose(host); return; }
  var ins = cmplPrepare(it.body);
  var text = ins.text;
  var before = ta.value.slice(0, q.start), after = ta.value.slice(ta.selectionStart);
  /* 整块件（风格包全套）是独立段落：语料 44/44 条都与上文空行分隔 → 自动补足前置空行 */
  if(it.block){
    if(before.length && !/\n\s*\n$/.test(before)) text = (/\n$/.test(before) ? '\n' : '\n\n') + text;
    if(after.length && !/^\s*\n/.test(after)) text = text + '\n\n';
  }
  var base = q.start + (text.length - ins.text.length);
  ta.value = before + text + after;
  cmplClose(host);
  var caret;
  if(ins.slots.length){
    cmplSlots = []; for(var s = 0; s < ins.slots.length; s++) cmplSlots.push(base + ins.slots[s]);
    cmplSlotIdx = 0; caret = cmplSlots[0];
  }else{ cmplSlots = null; caret = base + ins.text.length; }
  ta.focus();
  ta.setSelectionRange(caret, caret);
  /* v7.19：上屏后**补派一次 input**，让宿主既有的「实时写回」路径跑起来。
     写作台右栏是「输入即写回」语义（wdOnInput 把 ta.value 写进 state.blocks）；此前补全上屏只改了
     textarea，**块文本与左栏摘要仍是旧值** → 切条 / 重开会丢字（弹窗宿主无此问题：它走「确定」才写回）。
     ★必须放在 setSelectionRange **之后**：cmplOnInput 会用「光标位移」去跟踪槽位，早派会算错位。
     ★放这里还能顺带让两宿主行为一致（弹窗的 input 处理器只做自适应宽 + 重渲染，无副作用）。 */
  try{ ta.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){}
  /* v7.16（D 条）：**仅在条目真正上屏成功后**记录一次使用（进组/查询/浏览不计）→ 查询视图据此加权 */
  cmplUseTouch(it);
  if(typeof scheduleSave === 'function') scheduleSave();
  /* v7.15：宽度自适应只对弹窗宿主有意义（写作台右栏编辑器填满，不做窗口宽度自适应） */
  if(host === hostPopup && typeof fitBlkWidth === 'function') fitBlkWidth();
  if(typeof hlRefresh === 'function') hlRefresh(host);
  if(typeof hlSyncBox === 'function') hlSyncBox(host);
}
function cmplMoveSel(d, host){
  host = cmplH(host);
  if(!cmplOpen || !cmplItems.length) return;
  cmplSel = (cmplSel + d + cmplItems.length) % cmplItems.length;
  cmplRender(host);
}
/* ---- 输入/键盘/鼠标接线 ---- */
function cmplOnInput(host){
  host = cmplH(host);
  if(cmplComposing) return;
  var ta = cmplTa(host); if(!ta) return;
  cmplUseInvalidate();   /* B：每键失效（重建成本 = 一次拼接，可接受）——「未用过」徽章随输入即时变活 */
  /* 槽位模式：跟踪当前槽位的输入位移，同步后续槽位 */
  if(cmplSlots && cmplSlots.length){
    var pos = ta.selectionStart, cur = cmplSlots[cmplSlotIdx];
    if(pos !== cur){
      var d = pos - cur;
      for(var i = cmplSlotIdx; i < cmplSlots.length; i++) cmplSlots[i] += d;
    }
  }
  var q = cmplQueryAt(ta);
  if(!q){ cmplClose(host); return; }
  var st = typeof structAt === 'function' ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  if(q.query){ cmplGroup = null; cmplItems = cmplBuild(q.query, st.region); }          /* 查询视图：扁平结果 */
  else if(cmplGroup){ cmplItems = cmplBuildGroupItems(cmplGroup); }                    /* 组内视图 */
  else { cmplItems = cmplBuildGroups(st.region); }                                     /* 组视图（数字=按组切换） */
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(host); return; }
  cmplRender(host);
}
function cmplKeydown(e, host){
  host = cmplH(host);
  if(cmplComposing || e.isComposing) return;
  var ta = cmplTa(host);
  if(cmplOpen){
    /* v7.8：数字键 = 输入法式跳位上屏（1..9 直取该条；超出候选条数则不拦截，数字照常进入文本） */
    if(/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey){
      var di = parseInt(e.key, 10) - 1;
      if(di < CMPL_DIGIT_JUMP && di < cmplItems.length){ e.preventDefault(); cmplSel = di; cmplCommit(host); return; }
    }
    if(e.key === 'ArrowDown'){ e.preventDefault(); cmplMoveSel(1, host); return; }
    if(e.key === 'ArrowUp'){ e.preventDefault(); cmplMoveSel(-1, host); return; }
    if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); cmplCommit(host); return; }   /* Enter 与 Tab 都是一键补全 */
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); if(cmplGroup){ cmplLeaveGroup(host); } else { cmplClose(host); } return; }   /* Esc：先退组/关候选，第二次才关编辑器 */
  }else if(cmplSlots && cmplSlots.length){
    if(e.key === 'Tab'){
      e.preventDefault();
      if(cmplSlotIdx < cmplSlots.length - 1){ cmplSlotIdx++; ta.setSelectionRange(cmplSlots[cmplSlotIdx], cmplSlots[cmplSlotIdx]); }
      else{ cmplSlots = null; }
      return;
    }
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cmplSlots = null; return; }   /* 再按一次 Esc 才关编辑器 */
  }
  /* v7.8：编辑器内 Tab 不逃逸焦点（无候选、无槽位时也拦住——否则焦点跑到窗口外，接着打字的字全丢） */
  if(e.key === 'Tab'){ e.preventDefault(); return; }
  if(e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')){ e.preventDefault(); blkCopyAll(host); }
}
/* ---- 复制全文（v7.8：编辑器内一键把整段提示词送进剪贴板） ---- */
function blkCopyAll(host){
  host = cmplH(host);
  var ta = cmplTa(host); if(!ta) return;
  var v = ta.value || '';
  if(!v.length){ toast('没有内容可复制'); return; }
  copyText(v).then(function(ok){ toast(ok ? ('已复制全文（' + v.length + ' 字符）') : '复制失败：请手动选择后复制'); });
}
function cmplBind(host){
  host = cmplH(host);
  var ta = cmplTa(host); if(!ta) return;
  ta.addEventListener('input', function(){ cmplOnInput(host); });
  ta.addEventListener('keydown', function(e){ cmplKeydown(e, host); });
  ta.addEventListener('compositionstart', function(){ cmplComposing = true; });
  ta.addEventListener('compositionend', function(){ cmplComposing = false; cmplOnInput(host); });
  /* v7.19（Holly 重裁 · 方案②，2026-09-20）：滚动时**只重定位、不关闭**。
     旧写法是滚动即关气泡，有个坑：长分镜在**文末**输入触发符时 textarea 会自动滚动把光标带进
     可视区，这次滚动紧跟在 cmplOnInput 弹出气泡之后发生，气泡被当场关掉——刚弹即关，闪一下就没。
     现改为调 cmplPlace(host)：气泡按新的 scrollTop / scrollLeft 重新锚定到光标处，
     既保住刚弹的气泡，用户主动滚轮时气泡也跟随光标移动而不是消失。 */
  ta.addEventListener('scroll', function(){ if(cmplOpen) cmplPlace(host); });
  ta.addEventListener('click', function(){
    if(cmplOpen) cmplClose(host);
    if(cmplSlots && cmplSlots.length){
      var p = ta.selectionStart;
      if(Math.abs(p - cmplSlots[cmplSlotIdx]) > 1) cmplSlots = null;   /* 点别处 → 结束槽位模式 */
    }
  });
  var pop = cmplPop(host);
  if(pop){
    /* 鼠标点选：mousedown + preventDefault —— 否则焦点离开输入框、光标位置丢失 */
    pop.addEventListener('mousedown', function(e){
      var row = e.target.closest ? e.target.closest('.cmpl-item') : null;
      if(!row) return;
      e.preventDefault();
      cmplSel = parseInt(row.dataset.idx, 10) || 0;
      cmplCommit(host);
    });
  }
  var copyEl = host.el('copy');
  if(copyEl) copyEl.addEventListener('click', function(){ blkCopyAll(host); });
}
document.addEventListener('DOMContentLoaded', cmplBind);                     /* DCL#1：弹窗宿主（既有） */
document.addEventListener('DOMContentLoaded', function(){ cmplBind(hostDesk); });   /* DCL#2：写作台宿主（v7.15 新增；非 keydown，不影响 P2-A/P3-A） */

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径）
   v7.16：+cmplStyleRef（library.js 引，H 接缝）、+cmplUseInvalidate（write.js/wiring.js 引，B 失效接线） */
PHJ.complete = { CMPL_SEED_V, cmplActive, cmplExportAsset, cmplGroupOrder, cmplImportAsset, cmplNewKey, cmplReset, cmplSeedItems, cmplSetItems, cmplStyleRef, cmplUseInvalidate };
