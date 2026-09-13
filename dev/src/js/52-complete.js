
/* ==================== v7.8 候选引擎（结构感知补全 + 槽位 + 复制全文） ====================
   触发：输入 `#` 后弹候选气泡（`#` 在 53 条语料中出现 0 次 → 零冲突；且中文输入法下不占键位——
        初版用 `\`，但中文态按 `\` 会出顿号「、」，已按 Holly 反馈改为 `#`）。
   键鼠双模：↑↓ 切换 / Enter·Tab 一键补全 / 数字 1..9 直取该条（输入法式跳位） / Esc 关闭 / 鼠标点选（mousedown+preventDefault 保住焦点与光标）。
   结构感知：候选按「当前节」（51-struct.js）置顶——写风格包时风格段在前，写叙事时镜头句在前。
   槽位：片段里的 `${n}` 是占位标记（只在常量里存在，上屏时被吃掉）→ 上屏后 Tab 逐位跳。
   数据来源（不照搬语料，全部来自规律；逐字引用的只有你的「风格包」——那是项目级资产，不是片段）：
     · 风格包 5 段 + 硬性要求 —— 你的定型件原文（44/53 条共用，占这类 prompt 的 63%）
     · 镜头句 —— 141 句镜头句的语法：{连接词}{运镜}{主体}{动作}{台词}
     · 词表 —— 你的实际用词（9 运镜 / 3 连接 / 3 台词动词）+ **标注你从没用过的**（未用过徽章）
   ================================================================= */
var CMPL_TRIGGER = '#';            /* 触发符：语料 53 条中 0 次出现；且中文输入法下不占键位（`\` 在中文态会出顿号「、」，故弃用） */
var CMPL_MAX_QUERY = 14;           /* 触发符后最多跟多少字符算查询 */
var CMPL_PER_GROUP = 4;            /* 无查询时每组先露几条 */
var CMPL_DIGIT_JUMP = 9;           /* 候选前 N 条可用数字键 1..N 直接上屏（输入法式） */
var CMPL_SEED_V = 1;               /* 内置表版本：日后往内置表加条目时 +1，迁移会把新条目并入用户表 */
var CMPL_GROUP_HINT = { 风格包: 'style', 硬性要求: 'tail', 起手式: 'anchor', 结构件: 'mark', 镜头句: 'body', 景别: 'body', 运镜: 'body', 台词: 'body' };

var CMPL_STYLE = [
  { label: '光影逻辑', body: '【光影逻辑】 遵循「暖主体、冷环境、柔面光、轻轮廓」；侧前低位暖柔光铺脸，暗部弱补光，窗外暖光勾勒发丝；室外日戏侧前柔化日光或月光，半阴漫射提亮面部，背景保留建筑日照质感，杜绝硬光直打，人物面部干净柔和。' },
  { label: 'CG 风格', body: '【CG 风格】 高质量写实 CG 古风甜宠质感，温柔克制，精致干净；色彩统一木棕、土黄、灰瓦、灰蓝、米白、雾青低饱和体系，' },
  { label: '镜头构图', body: '【镜头构图】 电影级 CG 镜头，等效 50-85mm 中焦为主，无广角畸变；浅景深渲染，人物清晰锐利、背景虚化可辨不抢戏；适度前景遮挡。' },
  { label: '渲染质感', body: '【渲染质感】 中低对比度，柔亮中间调，暗部保留细节，高光压控不过曝；统一色相秩序，木构土墙偏暖米棕、瓦面阴影偏冷灰；局部锐化集中于眉眼、发丝、衣褶，背景适度柔化；微添空气感、发丝高光与轻暗角，整体呈精修级古偶 CG 影像质感。' },
  { label: '负面提示词', body: '【负面提示词】 低多边形、模型穿模、贴图拉伸模糊、卡通二次元画风、塑料材质感、渲染锯齿、过度磨皮塑料脸、脸部死白无血色、高饱和艳色、脏黄肤色、荧光蓝夜景、正午顶光硬影、广角畸变、现代元素穿帮、死黑死白过曝、强 HDR 感、五官过度锐化、廉价假古风布景、浓妆艳抹、韩式滤镜、强青橙调色、过硬轮廓光、色彩杂乱失控，真人感，真实感' }
];
var CMPL_TAIL = '硬性要求：无BMG，无字幕，禁止自行新增或删减台词。';
/* 全套 = 单段按序拼（单一真源：改一段，全套跟着变） */
function cmplFullStyle(){
  var s = '风格：', i;
  for(i = 0; i < CMPL_STYLE.length; i++) s += '\n' + CMPL_STYLE[i].body;
  return s + '\n\n' + CMPL_TAIL;
}

var CMPL_GROUPS = [
  { label: '风格包', note: '项目级定型件', items: [
    { label: '风格包 · 全套', block: true, body: cmplFullStyle() },
    { label: '光影逻辑', body: CMPL_STYLE[0].body },
    { label: 'CG 风格', body: CMPL_STYLE[1].body },
    { label: '镜头构图', body: CMPL_STYLE[2].body },
    { label: '渲染质感', body: CMPL_STYLE[3].body },
    { label: '负面提示词', body: CMPL_STYLE[4].body },
    { label: '硬性要求', body: CMPL_TAIL }
  ] },
  { label: '起手式', note: '你语料里的三种锚定写法', items: [
    { label: '事件发生在…室内', body: '事件发生在@室内。' },
    { label: '镜头N·首帧画面·左右站位', body: '镜头1·@首帧画面·画面左侧是@${1} 画面右侧是@${2}。' },
    { label: '俯视站位参考图', body: '@俯视站位参考图·${1}' },
    { label: '场景照片', body: '@场景照片。' }
  ] },
  { label: '结构件', items: [
    { label: '画面开始：', body: '画面开始：' },
    { label: '画面结束。', body: '画面结束。' },
    { label: '画面开始（全程固定镜头）：', body: '画面开始（全程固定镜头）：' }
  ] },
  { label: '镜头句', note: '141 句的语法槽位', items: [
    { label: '摇镜·右→拍摄', body: '然后 摄像机往画面右方向摇 拍摄${1}' },
    { label: '摇镜·左→拍摄', body: '然后 摄像机往画面左方向摇 拍摄${1}' },
    { label: '切镜', body: '然后 切镜 拍摄${1}' },
    { label: '过肩视角', body: '然后 过肩视角 拍摄${1}' },
    { label: '固定镜头', body: '然后 固定镜头 拍摄${1}' },
    { label: '推镜（你没用过）', note: '未用过', body: '然后 镜头缓慢推进 拍摄${1}' },
    { label: '环绕（你没用过）', note: '未用过', body: '然后 镜头环绕${1}半圈' },
    { label: '跟拍（你没用过）', note: '未用过', body: '然后 镜头平稳跟拍${1}' }
  ] },
  { label: '景别', note: '远近谱 · ✔ 用过 / ✘ 没用过', items: [
    { label: '近景', body: '近景' }, { label: '特写', body: '特写' }, { label: '中景', body: '中景' }, { label: '半身', body: '半身' },
    { label: '中近景', note: '未用过', body: '中近景' }, { label: '大特写', note: '未用过', body: '大特写' },
    { label: '全景', note: '未用过', body: '全景' }, { label: '远景', note: '未用过', body: '远景' }
  ] },
  { label: '运镜', note: '动静谱 · ✔ 用过 / ✘ 没用过', items: [
    { label: '摇', body: '摇' }, { label: '切镜', body: '切镜' }, { label: '固定镜头', body: '固定镜头' }, { label: '移镜', body: '移镜' },
    { label: '过肩', body: '过肩' }, { label: '仰拍', body: '仰拍' }, { label: '俯拍', body: '俯拍' },
    { label: '推镜头', note: '未用过', body: '推镜头（缓慢推进）' }, { label: '拉镜头', note: '未用过', body: '拉镜头（缓慢拉远）' },
    { label: '环绕', note: '未用过', body: '环绕' }, { label: '升降', note: '未用过', body: '升降镜头' }, { label: '甩镜头', note: '未用过', body: '甩镜头' },
    { label: '主观视角', note: '未用过', body: '主观视角' }
  ] },
  { label: '台词', items: [
    { label: '说 + 音色引用', body: '说【@音色】：“${1}”' },
    { label: '角色 + 说 + 音色引用', body: '${1}说【@音色】：“${2}”' },
    { label: '角色 + 说道 + 音色引用', body: '${1}说道【@音色】：“${2}”' }
  ] }
];

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
function cmplTa(){ return document.getElementById('blkInput'); }
function cmplPop(){ return document.getElementById('cmplPop'); }

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
/* ---- 生效表（v7.8：内置表 / 用户表；配置界面见 53-library.js）----
   数据：state.cmpl = { v: 内置表版本, items: null | [{key, group, label, note, body, block}] }
        items === null → 用内置表；一旦在配置界面里动过，就物化成用户表（可为空数组 = 用户清空） */
function cmplSeedItems(){
  var out = [], gi, ii, g, it;
  for(gi = 0; gi < CMPL_GROUPS.length; gi++){
    g = CMPL_GROUPS[gi];
    for(ii = 0; ii < g.items.length; ii++){
      it = g.items[ii];
      out.push({ key: 'b:' + gi + ':' + ii, group: g.label, label: it.label, note: it.note || '', body: it.body, block: !!it.block });
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
  if(!state.cmpl || typeof state.cmpl !== 'object') state.cmpl = { v: CMPL_SEED_V, items: null };
  state.cmpl.items = arr || null;
  state.cmpl.v = CMPL_SEED_V;
  cmplInvalidate();
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
/* 查询视图：扁平结果（命中质量 名称 > 正文）+ 本节相关置顶 */
function cmplBuild(query, region){
  var all = cmplActive(), q = String(query || '').toLowerCase(), pool = [], i, it;
  for(i = 0; i < all.length; i++){
    it = all[i];
    var score = cmplScore(it, q, region);
    if(score < 0) continue;
    pool.push({ kind: 'item', group: it.group || '未分组', note: it.note, label: it.label, body: it.body, block: it.block, score: score, ord: pool.length });
  }
  /* 稳定排序：命中质量 → 本节相关（score 里已含 -0.5）→ 原顺序 */
  pool.sort(function(a, b){ return (a.score - b.score) || (a.ord - b.ord); });
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
function cmplRender(){
  var pop = cmplPop(); if(!pop) return;
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
    if(it.note){
      var nt = document.createElement('span');
      nt.className = 'cmpl-note';
      nt.textContent = it.note;
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
  cmplPlace();
}
/* 气泡定位：光标行下方（越界则上翻 / 右边界内收） */
function cmplPlace(){
  var pop = cmplPop(), ta = cmplTa(); if(!pop || !ta) return;
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
function cmplClose(){
  var pop = cmplPop();
  if(pop) pop.classList.add('hide');
  cmplOpen = false; cmplItems = []; cmplSel = 0; cmplGroup = null;
}
function cmplReset(){
  cmplClose();
  cmplSlots = null; cmplSlotIdx = 0; cmplComposing = false;
}
/* 进组：只换候选列表，不动文本（触发符仍在） */
function cmplEnterGroup(g){
  var ta = cmplTa();
  var st = (ta && typeof structAt === 'function') ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  cmplGroup = g;
  cmplItems = cmplBuildGroupItems(g);
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(); return; }
  cmplRender();
}
/* 退组：回到组视图（Esc 第一次） */
function cmplLeaveGroup(){
  var ta = cmplTa();
  var st = (ta && typeof structAt === 'function') ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  cmplGroup = null;
  cmplItems = cmplBuildGroups(st.region);
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(); return; }
  cmplRender();
}
/* 上屏（组视图下 Enter/数字/点击 = 进组） */
function cmplCommit(){
  var ta = cmplTa(), it = cmplItems[cmplSel];
  if(!ta || !it) return;
  if(it.kind === 'group'){ cmplEnterGroup(it.group); return; }
  var q = cmplQueryAt(ta);
  if(!q){ cmplClose(); return; }
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
  cmplClose();
  var caret;
  if(ins.slots.length){
    cmplSlots = []; for(var s = 0; s < ins.slots.length; s++) cmplSlots.push(base + ins.slots[s]);
    cmplSlotIdx = 0; caret = cmplSlots[0];
  }else{ cmplSlots = null; caret = base + ins.text.length; }
  ta.focus();
  ta.setSelectionRange(caret, caret);
  if(typeof fitBlkWidth === 'function') fitBlkWidth();
  if(typeof hlRefresh === 'function') hlRefresh();
  if(typeof hlSyncBox === 'function') hlSyncBox();
}
function cmplMoveSel(d){
  if(!cmplOpen || !cmplItems.length) return;
  cmplSel = (cmplSel + d + cmplItems.length) % cmplItems.length;
  cmplRender();
}
/* ---- 输入/键盘/鼠标接线 ---- */
function cmplOnInput(){
  if(cmplComposing) return;
  var ta = cmplTa(); if(!ta) return;
  /* 槽位模式：跟踪当前槽位的输入位移，同步后续槽位 */
  if(cmplSlots && cmplSlots.length){
    var pos = ta.selectionStart, cur = cmplSlots[cmplSlotIdx];
    if(pos !== cur){
      var d = pos - cur;
      for(var i = cmplSlotIdx; i < cmplSlots.length; i++) cmplSlots[i] += d;
    }
  }
  var q = cmplQueryAt(ta);
  if(!q){ cmplClose(); return; }
  var st = typeof structAt === 'function' ? structAt(ta.value, ta.selectionStart) : { region: 'anchor' };
  if(q.query){ cmplGroup = null; cmplItems = cmplBuild(q.query, st.region); }          /* 查询视图：扁平结果 */
  else if(cmplGroup){ cmplItems = cmplBuildGroupItems(cmplGroup); }                    /* 组内视图 */
  else { cmplItems = cmplBuildGroups(st.region); }                                     /* 组视图（数字=按组切换） */
  cmplSel = 0;
  if(!cmplItems.length){ cmplClose(); return; }
  cmplRender();
}
function cmplKeydown(e){
  if(cmplComposing || e.isComposing) return;
  var ta = cmplTa();
  if(cmplOpen){
    /* v7.8：数字键 = 输入法式跳位上屏（1..9 直取该条；超出候选条数则不拦截，数字照常进入文本） */
    if(/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey){
      var di = parseInt(e.key, 10) - 1;
      if(di < CMPL_DIGIT_JUMP && di < cmplItems.length){ e.preventDefault(); cmplSel = di; cmplCommit(); return; }
    }
    if(e.key === 'ArrowDown'){ e.preventDefault(); cmplMoveSel(1); return; }
    if(e.key === 'ArrowUp'){ e.preventDefault(); cmplMoveSel(-1); return; }
    if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); cmplCommit(); return; }   /* Enter 与 Tab 都是一键补全 */
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); if(cmplGroup){ cmplLeaveGroup(); } else { cmplClose(); } return; }   /* Esc：先退组/关候选，第二次才关编辑器 */
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
  if(e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')){ e.preventDefault(); blkCopyAll(); }
}
/* ---- 复制全文（v7.8：编辑器内一键把整段提示词送进剪贴板） ---- */
function blkCopyAll(){
  var ta = cmplTa(); if(!ta) return;
  var v = ta.value || '';
  if(!v.length){ toast('没有内容可复制'); return; }
  copyText(v).then(function(ok){ toast(ok ? ('已复制全文（' + v.length + ' 字符）') : '复制失败：请手动选择后复制'); });
}
function cmplBind(){
  var ta = cmplTa(); if(!ta) return;
  ta.addEventListener('input', cmplOnInput);
  ta.addEventListener('keydown', cmplKeydown);
  ta.addEventListener('compositionstart', function(){ cmplComposing = true; });
  ta.addEventListener('compositionend', function(){ cmplComposing = false; cmplOnInput(); });
  ta.addEventListener('scroll', function(){ if(cmplOpen) cmplClose(); });
  ta.addEventListener('click', function(){
    if(cmplOpen) cmplClose();
    if(cmplSlots && cmplSlots.length){
      var p = ta.selectionStart;
      if(Math.abs(p - cmplSlots[cmplSlotIdx]) > 1) cmplSlots = null;   /* 点别处 → 结束槽位模式 */
    }
  });
  var pop = cmplPop();
  if(pop){
    /* 鼠标点选：mousedown + preventDefault —— 否则焦点离开输入框、光标位置丢失 */
    pop.addEventListener('mousedown', function(e){
      var row = e.target.closest ? e.target.closest('.cmpl-item') : null;
      if(!row) return;
      e.preventDefault();
      cmplSel = parseInt(row.dataset.idx, 10) || 0;
      cmplCommit();
    });
  }
  document.getElementById('blkCopy').addEventListener('click', blkCopyAll);
}
document.addEventListener('DOMContentLoaded', cmplBind);
