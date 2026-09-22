
/* ==================== view/write · 写作台视图（左大纲 + 右大编辑器） ====================
   v7.15 新增。「写作」从画布里独立成一个视图：
     · 左栏 = 分镜条目大纲（拖 ⠿ 排序 / 增删 / 切条；每项 ≥2 入口）；
     · 右栏 = 大号编辑器（复用 coding 编辑器内核，宿主 = hostDesk；实时写回，无确定/取消）。
   两视图**同源**（同一份 state.blocks）；**只有当前视图实时刷新**，切视图时按需拉取最新（单向，不成环）。
   领域文案一律落在本视图层（不写进 skin/）。本文件属 view 层，不对 core/editor 反向依赖。

   顺序：由 block.order 承载（显示序 = order 升序；兜底 y → x → 数组下标；normalizeOrder 归一 0..N-1）。
   图片块（type:'image'）不入大纲、不计数；选中项若失效 → 兜底落第一条文本块。
   ================================================================= */

var wdSelId = null;    /* 会话态：当前选中的块 id（不持久；重开回第一条文本块） */
var wdDragFrom = -1;   /* 拖拽排序的临时起点下标 */

/* ---- 数据访问 ---- */
function wdFindById(id){
  for(var i = 0; i < state.blocks.length; i++){ if(state.blocks[i] && state.blocks[i].id === id) return state.blocks[i]; }
  return null;
}
/* 文本块（图片块不入大纲），按 order 升序（兜底 y → x → 数组下标，与 store.normalizeOrder 同源） */
function wdTextBlocks(){
  var list = [], i;
  for(i = 0; i < state.blocks.length; i++){
    var b = state.blocks[i];
    if(b && b.type !== 'image') list.push({ b: b, i: i });
  }
  list.sort(function(A, B){
    var a = A.b, c = B.b;
    var ao = (Number.isInteger(a.order) && a.order >= 0);
    var co = (Number.isInteger(c.order) && c.order >= 0);
    if(ao !== co) return ao ? -1 : 1;
    if(ao && a.order !== c.order) return a.order - c.order;
    if(a.y !== c.y) return a.y - c.y;
    if(a.x !== c.x) return a.x - c.x;
    return A.i - B.i;
  });
  var out = [];
  for(i = 0; i < list.length; i++) out.push(list[i].b);
  return out;
}
function wdIndexOfSel(){
  var blocks = wdTextBlocks();
  for(var i = 0; i < blocks.length; i++){ if(blocks[i].id === wdSelId) return i; }
  return -1;
}
/* 首行摘要：取正文第一非空行、压空白、单行截断加 …；空块返回空串（渲染处显示占位） */
function wdSummary(text){
  var lines = String(text == null ? '' : text).split('\n');
  var first = '';
  for(var i = 0; i < lines.length; i++){ if(lines[i].trim() !== ''){ first = lines[i]; break; } }
  first = first.replace(/\s+/g, ' ').trim();
  if(!first) return '';
  return first.length > 40 ? (first.slice(0, 40) + '…') : first;
}

/* ---- 视图显隐 / 顶栏 ---- */
function applyView(){
  var body = document.body;
  body.classList.toggle('view-write', activeView === 'write');
  body.classList.toggle('view-canvas', activeView === 'canvas');
  /* 写作台容器随视图同步 hide 类：index.html 初始带 hide（首帧不闪），进入写作视图须移除、离开须加回。
     （CSS .write-desk.hide{display:none} 恒生效；不 remove 会导致默认写作视图下整块不可见 → 无法编辑。） */
  var desk = document.getElementById('writeDesk');
  if(desk) desk.classList.toggle('hide', activeView !== 'write');
  var sw = document.getElementById('viewSwitch');
  if(sw){
    var segs = sw.querySelectorAll('.vs-seg');
    for(var i = 0; i < segs.length; i++) segs[i].classList.toggle('active', segs[i].dataset.view === activeView);
  }
  wdUpdateCount();
  projSyncIdentity();   /* v7.20：两处项目身份显示（左栏头部 + 顶栏按钮）随既有视图刷新点同步 */
}
function wdUpdateCount(){
  var blocks = wdTextBlocks();
  var n = blocks.length;
  var el = document.getElementById('viewCount');
  if(el) el.textContent = '分镜 ' + n + ' 条';
  var wc = document.getElementById('wdCount');
  if(wc) wc.textContent = String(n);
  var pos = document.getElementById('wdPos');
  if(pos){
    var idx = wdIndexOfSel();
    pos.textContent = n ? ('第 ' + (idx + 1) + ' 条 / 共 ' + n + ' 条') : '还没有分镜';
  }
}

/* v7.21：块标签（'初' | '补' | '' = 无）。仅写作界面消费（大纲分组 + 标签钮）。
   缺字段/脏值一律归 '' —— 与 core/persist.js 的 migrateBlocks 归一口径同源，保证老数据零丢失。 */
function wdTagOf(b){ return (b && (b.tag === '初' || b.tag === '补')) ? b.tag : ''; }

/* v7.21：标签分组头。★必须是**独立 class**（绝不能是 .wd-item）——
   否则会打断 W4 的「#wdList .wd-item 的 DOM 序 == order 序」与 wdPos 计数。 */
function wdGroupHead(key, n){
  var h = document.createElement('div');
  h.className = 'wd-group';
  h.dataset.group = key || 'none';
  var t = document.createElement('span');
  t.className = 'wd-group-t';
  t.textContent = key ? ('标签「' + key + '」') : '无标签';
  var c = document.createElement('span');
  c.className = 'wd-group-c';
  c.textContent = String(n);
  h.appendChild(t);
  h.appendChild(c);
  return h;
}

/* ---- 大纲渲染 ---- */
function renderWrite(){
  if(normalizeOrder()) scheduleSave();   /* 惰性归一：仅在「有块缺 order / 有重复 / 非 0..N-1 紧致」时动手 */
  var list = document.getElementById('wdList');
  if(!list) return;
  wdEnsureSel();
  var blocks = wdTextBlocks();
  list.innerHTML = '';
  if(!blocks.length){
    var em = document.createElement('div');
    em.className = 'wd-empty';
    em.textContent = '还没有分镜 · 点「＋ 新建分镜」或按 Alt+Enter 写下第一条';
    list.appendChild(em);
    wdUpdateCount();
    wdFillEditor(false);
    return;
  }
  /* v7.21：按标签分组渲染（初 → 补 → 无）。**order 语义不变**——分组只是呈现层，
     order 仍是单一全序 ⇒ 拼接栏 / 导出 prompt / 画布 全部零改动（本需求仅服务写作界面）。
     —— 仅当存在 ≥2 种标签时才出组头，避免打扰尚未使用标签的既有项目。
     ★行内 idx 一律传**全局序位**（与 order 同源）⇒ wd-no 编号、wdPos、拖拽与右键菜单的 idx 全不受分组影响。 */
  var kinds = {}, nk = 0, i;
  for(i = 0; i < blocks.length; i++){ var kk = wdTagOf(blocks[i]); if(!kinds[kk]){ kinds[kk] = 1; nk++; } }
  if(nk > 1){
    var groupOrder = ['初', '补', ''];
    for(var g = 0; g < groupOrder.length; g++){
      var key = groupOrder[g], members = [];
      for(i = 0; i < blocks.length; i++){ if(wdTagOf(blocks[i]) === key) members.push(i); }
      if(!members.length) continue;
      list.appendChild(wdGroupHead(key, members.length));
      for(i = 0; i < members.length; i++) list.appendChild(wdRow(blocks[members[i]], members[i]));
    }
  }else{
    for(i = 0; i < blocks.length; i++) list.appendChild(wdRow(blocks[i], i));
  }
  wdUpdateCount();
  wdFillEditor(false);
  wdMarkSel(false);
}
function wdRow(b, idx){
  var row = document.createElement('div');
  row.className = 'wd-item' + (b.id === wdSelId ? ' active' : '');
  row.dataset.idx = String(idx);
  row.dataset.id = b.id;

  var grip = document.createElement('span');
  grip.className = 'wd-grip';
  grip.textContent = '⠿';
  grip.title = '拖动调整顺序';
  grip.draggable = true;

  var no = document.createElement('span');
  no.className = 'wd-no';
  no.textContent = String(idx + 1);

  /* v7.21：标签钮（元素级 click，由 #wdList 的既有委托处理；不新增任何全局按键监听） */
  var lk = wdTagOf(b);
  var lab = document.createElement('button');
  lab.className = 'wd-lab' + (lk ? ' on' : '');
  lab.type = 'button';
  lab.dataset.idx = String(idx);
  lab.dataset.tag = lk;
  lab.textContent = lk || '·';
  lab.title = '标签：' + (lk || '无标签') + '（点击循环：初 → 补 → 无）';

  var sum = document.createElement('span');
  sum.className = 'wd-sum';
  var s = wdSummary(b.text);
  sum.textContent = s || '（空分镜）';
  if(!s) sum.classList.add('wd-muted');
  sum.title = b.text || '';

  var cnt = document.createElement('span');
  cnt.className = 'wd-cnt';
  cnt.textContent = String((b.text || '').length);

  var x = document.createElement('button');
  x.className = 'wd-x';
  x.type = 'button';
  x.textContent = '×';
  x.title = '删除该分镜';
  x.dataset.idx = String(idx);

  row.appendChild(grip);
  row.appendChild(no);
  row.appendChild(lab);
  row.appendChild(sum);
  row.appendChild(cnt);
  row.appendChild(x);
  return row;
}
function wdUpdateRow(b){
  var list = document.getElementById('wdList');
  if(!list || !b) return;
  var row = list.querySelector('.wd-item[data-id="' + b.id + '"]');
  if(!row) return;
  var sumEl = row.querySelector('.wd-sum');
  var cntEl = row.querySelector('.wd-cnt');
  var s = wdSummary(b.text);
  if(sumEl){ sumEl.textContent = s || '（空分镜）'; sumEl.classList.toggle('wd-muted', !s); sumEl.title = b.text || ''; }
  if(cntEl) cntEl.textContent = String((b.text || '').length);
}

/* ---- 选中态 / 编辑器填充 ---- */
function wdEnsureSel(){
  var blocks = wdTextBlocks();
  if(!blocks.length){ wdSelId = null; return null; }
  for(var i = 0; i < blocks.length; i++){ if(blocks[i].id === wdSelId) return wdSelId; }
  wdSelId = blocks[0].id;   /* 选中项被删 / 失效（含图片块兜底）→ 落第一条文本块 */
  return wdSelId;
}
function wdMarkSel(scroll){
  var list = document.getElementById('wdList');
  if(!list) return;
  var rows = list.querySelectorAll('.wd-item');
  for(var i = 0; i < rows.length; i++) rows[i].classList.toggle('active', rows[i].dataset.id === wdSelId);
  if(scroll){
    var cur = list.querySelector('.wd-item.active');
    if(cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
}
function wdFillEditor(focusEnd){
  var ta = hostDesk.el('ta');
  if(!ta) return;
  var b = wdFindById(wdSelId);
  if(!b){
    ta.value = '';
    ta.disabled = true;   /* 空态：编辑器不可编辑（避免「能打字却不知道存到哪」） */
    hlRefresh(hostDesk);
    wdBubbleRefresh();    /* v7.20：空态无候选 → 气泡群整体隐藏（不出空壳） */
    return;
  }
  ta.disabled = false;
  if(ta.value !== (b.text || '')) ta.value = b.text || '';
  hlRefresh(hostDesk);
  wdBubbleRefresh();      /* v7.20：编辑器内容/光标节变化 → 气泡群按新节刷新 */
  if(focusEnd) focusDeskEditor();
}
function focusDeskEditor(){
  var ta = hostDesk.el('ta');
  if(!ta || ta.disabled) return;
  ta.focus();
  if(typeof ta.selectionStart === 'number'){ ta.selectionStart = ta.selectionEnd = ta.value.length; }
}

/* ---- 视图切换总控（唯一编排点） ---- */
function setView(v){
  if(v !== 'write' && v !== 'canvas') return;
  flush();                                            /* ① 立即落盘（清防抖）——不丢字 */
  cmplUseInvalidate();                                /* B：视图切换会 flush + 重填编辑器 → 「未用过」缓存失效 */
  if(activeView === v){ applyView(); return; }
  if(activeView === 'write'){ cmplReset(hostDesk); }  /* ② 离开写作台：收候选/槽位（与关窗口径一致） */
  else{ closeBlockEditor(); }                         /*    离开画布：关弹窗编辑器（若有） */
  activeView = v;
  /* ★v7.18（T03 需求②·方案A）：**先 applyView() 切显隐类，再渲染** —— 使画布在「可见态」被测量。
     原序「先 render 后 applyView」会让 autoSizeAll() 在 body.view-write .canvas{display:none} 下运行，
     读到 scrollHeight=0 → autoResize 把每个块高写 0px → 全块塌成 min-height（重开后点「画布」必现的「间距不均」）。
     选「提前 applyView」而非「进入画布后补一次 autoSizeAll」：前者一处调整即确立不变式「body 视图类先行于渲染」，
     对**任何**未来新增的 render 调用点都成立；后者只补画布一条分支，治标不治本（见 排布错位_调查 §五）。 */
  applyView();                                        /* ③ 显隐 / 高亮 / 按钮可见性（**先于 render**：画布可见后才好测高） */
  if(v === 'canvas'){ render(); }                     /* ④ 进入视图的按需拉取最新（单向，不成环） */
  else{ renderWrite(); }
  scheduleSave();
}

/* ---- 选中 / 切换条目 ---- */
function wdSelect(idx){
  var blocks = wdTextBlocks();
  if(idx < 0 || idx >= blocks.length) return;
  if(wdSelId !== blocks[idx].id) cmplReset(hostDesk);   /* 切条前收候选/槽位 */
  wdSelId = blocks[idx].id;
  cmplUseInvalidate();   /* B：切条 → 当前编辑器文本换块，失效 */
  wdFillEditor(true);
  wdMarkSel(true);
  wdUpdateCount();
}
function wdSelectStep(d){
  var blocks = wdTextBlocks();
  if(!blocks.length) return;
  var cur = wdIndexOfSel();
  if(cur < 0) cur = 0;
  var nx = Math.max(0, Math.min(blocks.length - 1, cur + d));
  wdSelect(nx);
}
/* wdMove：单参 = 'up'/'down' 调整当前条顺序（右键菜单）或 ±1 列表导航（门控键处理）；双参 = 把下标 a 的条目移到位置 b（拖拽） */
function wdMove(a, b){
  if(b === undefined){
    if(a === 'up'){ wdShiftSel(-1); return; }
    if(a === 'down'){ wdShiftSel(1); return; }
    wdSelectStep(a);
    return;
  }
  wdReorder(a, b);
}
function wdReorder(from, to){
  var blocks = wdTextBlocks();
  if(from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || from === to) return;
  /* v7.21：分组态下禁止**跨组**重排（跨组改标签请用标签钮）——组内重排不受影响。
     未使用标签时所有块同为 ''，此守卫恒不触发 ⇒ 既有行为逐字不变。 */
  if(wdTagOf(blocks[from]) !== wdTagOf(blocks[to])){ toast('跨标签分组不能直接拖动，请用标签钮调整'); return; }
  var moved = blocks.splice(from, 1)[0];
  blocks.splice(to, 0, moved);
  for(var k = 0; k < blocks.length; k++) blocks[k].order = k;
  wdSelId = moved.id;
  cmplUseInvalidate();   /* B：重排 → 拼接口径变（保守失效） */
  renderWrite();
  saveNow();
  toast('已调整顺序（不影响画布位置）');
}
function wdShiftSel(d){
  var cur = wdIndexOfSel();
  if(cur < 0) return;
  wdReorder(cur, cur + d);
}

/* v7.21：点标签钮 → 循环 初 → 补 → 无 → 初（真写回 state.blocks 并落盘）。
   不改 wdSelId：分组重排后 renderWrite 的 wdEnsureSel 仍保当前选中条不变。 */
function wdCycleTag(idx){
  var blocks = wdTextBlocks();
  var b = blocks[idx];
  if(!b) return;
  var seq = ['初', '补', ''];
  b.tag = seq[(seq.indexOf(wdTagOf(b)) + 1) % seq.length];
  renderWrite();
  saveNow();
}

/* ---- 新增 / 删除 ---- */
function wdNew(){
  var blocks = wdTextBlocks();
  var cur = wdIndexOfSel();
  var ref = (cur >= 0 && blocks[cur]) ? blocks[cur] : null;
  var nb = { id: uid(), text: '', tag: '初' };   /* v7.21：新块默认标签「初」 */
  nb.x = ref ? ref.x : 20;
  nb.y = ref ? (ref.y + 150) : 20;
  state.blocks.push(nb);
  var at = (cur < 0) ? blocks.length : (cur + 1);   /* 插到当前条之后 */
  blocks.splice(at, 0, nb);
  for(var k = 0; k < blocks.length; k++) blocks[k].order = k;
  wdSelId = nb.id;
  cmplUseInvalidate();   /* B：增块 → blocks 数量变，失效 */
  renderWrite();
  saveNow();
  focusDeskEditor();
}
function wdDel(idx){
  var blocks = wdTextBlocks();
  var di = (typeof idx === 'number' && idx >= 0 && blocks[idx]) ? idx : wdIndexOfSel();
  if(di < 0 || !blocks[di]) return;
  var b = blocks[di];
  var at = state.blocks.indexOf(b);
  if(at < 0) return;
  state.blocks.splice(at, 1);
  var after = wdTextBlocks();
  wdSelId = after.length ? after[Math.min(di, after.length - 1)].id : null;
  cmplUseInvalidate();   /* B：删块 → blocks 数量变，失效 */
  renderWrite();
  saveNow();
  toast('已删除该分镜', { label: '撤销', fn: function(){
    state.blocks.splice(at, 0, b);
    wdSelId = b.id;
    cmplUseInvalidate();   /* B：撤销恢复块 → 失效 */
    renderWrite();
    saveNow();
    toast('已恢复');
  }});
}
function wdDelSel(){
  var i = wdIndexOfSel();
  if(i < 0) return;
  wdDel(i);
}

/* ---- 写作台快捷键（Alt 家族；仅写作视图内生效，由 keys.js 门控调用） ---- */
function wdKeydown(e){
  if(!e.altKey) return false;
  var k = e.key;
  if(k === 'ArrowUp'){ if(e.shiftKey){ wdShiftSel(-1); } else { wdSelectStep(-1); } return true; }
  if(k === 'ArrowDown'){ if(e.shiftKey){ wdShiftSel(1); } else { wdSelectStep(1); } return true; }
  if(k === 'Enter'){ wdNew(); return true; }
  if(k === 'Backspace'){ wdDelSel(); return true; }
  return false;
}

/* ---- 条目右键菜单（复用 #ctxMenu，动作分发见 view/modals.js 的 wd-del/wd-up/wd-down） ---- */
function wdContext(e, idx){
  if(e && e.preventDefault) e.preventDefault();
  var blocks = wdTextBlocks();
  if(idx < 0 || idx >= blocks.length) return;
  wdSelect(idx);
  openCtxMenu([
    { label: '上移', act: 'wd-up', disabled: idx <= 0 },
    { label: '下移', act: 'wd-down', disabled: idx >= blocks.length - 1 },
    'sep',
    { label: '删除本条', act: 'wd-del', danger: true }
  ], e.clientX, e.clientY);
}

/* ---- 实时写回（无确定 / 取消）：输入即写入当前块 text + 局部更新左栏该行 ---- */
function wdOnInput(){
  var ta = hostDesk.el('ta');
  if(!ta) return;
  var b = wdFindById(wdSelId);
  if(!b) return;
  b.text = ta.value;
  cmplUseInvalidate();   /* B：写作台实时写回 → 「未用过」判定依赖用户文本，须失效（既有监听体内加行，不新增监听） */
  wdUpdateRow(b);
  hlRefresh(hostDesk);
  wdBubbleDim();         /* v7.20：输入中 → 气泡群临时降透明（800ms），不挡打字视线 */
  wdBubbleRefresh();     /* v7.20：光标所在节可能因输入而变 → 按节判定刷新（同节不重播动画） */
  scheduleSave();
}

/* ==================== v7.20 · 项目身份行 + 写作灵感气泡群 ====================
   ① 项目身份行：左栏头部 .wd-proj 与顶栏 #btnProjName 两处常显当前项目名（projSyncIdentity，
     挂在 applyView 单点刷新 → 切换/新建/删除走既有刷新链即生效；重命名由 modals 补调 applyView）。
   ② 写作灵感气泡群（Holly 定义形态：零散漂浮、可点选、跟随输入阶段实时更换，持续显式漂浮）：
     · 位置 = .wd-edit 内部右下角（#wdBubbles）；容器 pointer-events:none、气泡本体 auto（不挡正文）；
     · 数据 = cmplBuildGroups(本节 region) 的本节相关组 → cmplBuildGroupItems 扁平池（消费 skin/corpus.js，
       语料一字不改）；每批 8 个；多于一批给「换一批」轻量翻页；本节无候选 → 整体隐藏（不出空壳）；
     · 刷新钩子 = 既有编辑事件链（wdOnInput / ta click / ta keyup / wdFillEditor 监听体内加行），
       ★不新增任何 document/window 级监听（R2）；仅当光标所在节（region）变化时才重渲染（同节不重播）；
     · 点击气泡 = 直接插入该条 body 到光标处（不走 # 触发），插后补派 input 走 v7.19 实时写回链路
       （state.blocks 真写回），焦点回 textarea，槽位 ${n} 复用 # 候选的 Tab 跳位机制；
     · 折叠/展开 = 会话内存（wdBbl.fold），★不持久化（state.version 不动）；
     · 动效全部 CSS（入场 160ms 交错 35ms / 换节旧群淡出 120ms / hover 120ms / 折叠 200ms），
       prefers-reduced-motion 下按既有降级先例直切显隐（见 55-write.css 末尾）。
   ================================================================= */
var wdBbl = { fold: false, region: '', line: null, page: 0, dimTimer: 0, swapTimer: 0 };   /* 会话态：不持久（line = 上次刷新的当前行原文，v7.21c 用于「同行不重播」） */
var WDB_PAGE = 8;        /* 每批气泡数（口径 6-8，取 8） */
var WDB_POOL_MAX = 40;   /* 池上限（与 cmplBuildGroupItems 单组上限等大） */

/* 项目身份行：左栏头部 + 顶栏按钮 两处同步当前项目名（过长截断由 CSS ellipsis 承担） */
function projSyncIdentity(){
  var name = (state && state.title) ? String(state.title) : '';
  var wn = document.getElementById('wdProjName');
  var wp = document.getElementById('wdProj');
  var bn = document.getElementById('btnProjName');
  var btn = document.getElementById('btnProj');
  if(wn) wn.textContent = name || '未命名项目';
  if(wp) wp.title = '当前项目：' + (name || '未命名项目') + ' · 点击切换 / 新建 / 重命名 / 删除';
  if(bn) bn.textContent = name || '项目';
  if(btn) btn.title = '项目：切换 / 新建 / 重命名 / 删除';
}

/* 行内候选词：按分隔符 / 空白切分；**丢弃长度 < 2 的词**，但**保留以 '@' 开头的片段**（关键锚点）。
   ★v7.21c 方案 D：切词前先**剥离行首「镜头N」序号**——镜头序号是**伪 token**（任何镜头行都会切出它，
     却不携带“这行在写什么”的信息），且恰是起手式组样板 `镜头N·首帧画面·…` / `镜头1·…` 的**子串**
     → 必然误命中起手式组（曾致 v7.20 C4 红）。剥离后 `镜头1 摇镜测试。` → token `摇镜测试`（无命中 → 兜底），
     `镜头1·@首帧画面·…` → token `@首帧画面`（仍正确命中起手式）。
   ★**只剥离 shot 这一种**：`【属性名】`(para) 有语义（命中「风格包」正确）、`风格：`/`硬性要求：`/`画面开始·结束`
     皆不剥离（其命中语义正确，最小改动）。
   ★复用 `structLineMark()` 判型，纯文本切分，不写领域词表（E6）。 */
var WDB_TOK_RE = /[·，。、；：！？,.!?;:（）()「」【】\s]+/;
function wdBubbleLineTokens(line){
  var s = String(line == null ? '' : line);
  var mk = structLineMark(s);
  if(mk && mk.kind === 'shot') s = s.replace(/^\s*镜头\s*\d+\s*/, '');   /* 剥离行首「镜头N」序号（仅 shot） */
  var parts = s.split(WDB_TOK_RE), out = [], i, t;
  for(i = 0; i < parts.length; i++){
    t = parts[i];
    if(!t) continue;
    if(t.charAt(0) === '@'){ out.push(t); continue; }   /* @ 锚点：即便很短也保留 */
    if(t.length >= 2) out.push(t);
  }
  return out;
}
/* 该组是否「被某个行内词命中」：词出现在该组任一条目的 label 或 body 里 → 是。 */
function wdBubbleGroupHit(items, tok){
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    if(it.label != null && String(it.label).indexOf(tok) >= 0) return true;
    if(it.body != null && String(it.body).indexOf(tok) >= 0) return true;
  }
  return false;
}
/* 取光标所在行原文（与 structAt 同源的「索引推进」；空文本 / 越界均安全） */
function wdBubbleLineAt(text, caret){
  var str = String(text == null ? '' : text), lines = str.split('\n');
  var head = str.slice(0, Math.max(0, caret | 0));
  var idx = head.split('\n').length - 1;
  if(idx < 0) idx = 0;
  if(idx > lines.length - 1) idx = lines.length - 1;
  return lines[idx] == null ? '' : lines[idx];
}

/* 气泡候选组集合 = (**本节（region）相关组**) ∪ (**行内命中组**)——★并集（v7.21c 修正，修「anchor 块内行内容匹配无效」缺口）：
   ① 本节相关组 = 旧行为的「置顶组」（CMPL_GROUP_HINT[g] === region）；无 → 兜底「前 4 组」。
   ② 行内命中组 = 命中数 > 0 的组（**可能落在区外**）→ 一并并入，可被置顶。
   排序：命中数降序 → 本节相关组优先 → 原组序（稳定）。
   目标（Holly 口径）：气泡贴合「光标当下这一行在写什么」——
     · ★起手式块（块内无「画面开始：」→ region 恒 = anchor，本节相关组只有 1 个「起手式」）里写
       「然后 摄像机往右摇 拍摄」→ 命中**区外**的「镜头句」组 → 并入并置顶（**原缺口：旧实现只在区内排，故拿不到运镜灵感**）；
     · 写「首帧画面 / 站位」类锚定行 → 「起手式」组在前；
     · 写「全景」类景别行 / 「缓慢拉远」类运镜行 → 「景别」/「运镜」组在前；
     · 行内判不出（无命中）→ 组集合与组序**均不变**，与既有按 region 的行为**逐字一致**。
   ★E6：**零领域词表**——只拿行内词去匹配 cmplActive() 里**已有的**组/条目，不手写任何内容词。
   ★池取法（WDB_POOL_MAX / 每批 8 条 / 「换一批」逻辑）一律不动；命中组落在**区内**时，结果与旧实现相同。 */
var wdBblPoolCache = { key: '\u0000', out: null };   /* 轻量缓存：同一行（同 region / 同活跃表）不重复计算 */
function wdBubblePool(region, line){
  var groups = cmplGroupOrder(), itemsOf = {}, rel = [], i, j, g;
  for(i = 0; i < groups.length; i++){ itemsOf[groups[i]] = cmplBuildGroupItems(groups[i]); }
  var all = cmplActive(), ks = [];
  for(i = 0; i < all.length; i++) ks.push(all[i].key || '');
  var key = String(region == null ? '' : region) + '\u0000' + ks.join(',') + '\u0000' + String(line == null ? '' : line);
  if(line != null && wdBblPoolCache.key === key && wdBblPoolCache.out) return wdBblPoolCache.out;

  /* ① 本节（region）相关组 = 既有「置顶组」（与旧行为逐字一致）；无 → 既有兜底「前 4 组」 */
  var regOn = {};
  for(i = 0; i < groups.length; i++){
    g = groups[i];
    if(CMPL_GROUP_HINT[g] === region){ rel.push(g); regOn[g] = 1; }
  }
  if(!rel.length) rel = groups.slice(0, 4);

  /* ② 并入「行内命中组」：命中组可能在区外（如 anchor 块里写「然后…摇」命中 body 的「镜头句」组）→ 拉进并置顶。
        无命中 → rel 保持①（≡ 旧行为，逐字一致）。 */
  var toks = wdBubbleLineTokens(line), hitsOf = {}, ordOf = {}, anyHit = false;
  if(toks.length){
    for(i = 0; i < groups.length; i++){
      g = groups[i]; ordOf[g] = i;
      var h = 0;
      for(j = 0; j < toks.length; j++){ if(wdBubbleGroupHit(itemsOf[g], toks[j])) h++; }
      hitsOf[g] = h; if(h > 0) anyHit = true;
    }
    if(anyHit){
      for(i = 0; i < groups.length; i++){
        g = groups[i];
        if(hitsOf[g] > 0 && rel.indexOf(g) < 0) rel.push(g);   /* 区外命中组 → 并入 */
      }
    }
  }
  /* ③ 排序：命中数降序 → 本节相关组优先 → 原组序（稳定）；无命中 → rel 原序不动（≡ 旧行为） */
  if(anyHit && rel.length > 1){
    rel = rel.slice().sort(function(a, b){
      var d = (hitsOf[b] || 0) - (hitsOf[a] || 0);
      if(d) return d;
      var ra = regOn[a] ? 0 : 1, rb = regOn[b] ? 0 : 1;
      if(ra !== rb) return ra - rb;
      return (ordOf[a] || 0) - (ordOf[b] || 0);
    });
  }
  var out = [];
  for(i = 0; i < rel.length; i++){
    var arr = itemsOf[rel[i]] || [];
    for(j = 0; j < arr.length; j++){
      if(out.length >= WDB_POOL_MAX) break;
      out.push(arr[j]);
    }
    if(out.length >= WDB_POOL_MAX) break;
  }
  if(line != null){ wdBblPoolCache.key = key; wdBblPoolCache.out = out; }
  return out;
}

/* 刷新：只在写作台；空态/无候选 → 整体隐藏；**同节同行** → 不重播（换节/换行/首现 → 旧群淡出后新群交错淡入） */
function wdBubbleRefresh(){
  var desk = document.getElementById('writeDesk');
  if(!desk || desk.classList.contains('hide')) return;   /* 只在写作台（画布内联与放大弹窗不放） */
  var box = document.getElementById('wdBubbles');
  if(!box) return;
  var ta = hostDesk.el('ta');
  if(!ta || ta.disabled){ wdBubbleHide(); return; }
  var st = structAt(ta.value, ta.selectionStart);
  var lineText = wdBubbleLineAt(ta.value, ta.selectionStart);
  var pool = wdBubblePool(st.region, lineText);   /* v7.21c：按「当前行内容」排组 */
  if(!pool.length){ wdBubbleHide(); wdBbl.region = st.region; wdBbl.line = lineText; wdBbl.page = 0; return; }
  if(st.region === wdBbl.region && lineText === wdBbl.line && !box.classList.contains('hide')) return;
  wdBbl.region = st.region;
  wdBbl.line = lineText;
  wdBbl.page = 0;
  wdBubbleSwap(pool);
}

/* 换节过渡：旧群整体淡出（120ms）→ 新群交错淡入；无旧群则直接建 */
function wdBubbleSwap(pool){
  var box = document.getElementById('wdBubbles');
  if(!box) return;
  if(wdBbl.swapTimer){ clearTimeout(wdBbl.swapTimer); wdBbl.swapTimer = 0; }
  var old = box.querySelector('.wdb-cluster');
  if(old && old.childElementCount){
    old.classList.add('wdb-out');
    wdBbl.swapTimer = setTimeout(function(){ wdBbl.swapTimer = 0; wdBubbleRender(pool); }, 130);
  }else{
    wdBubbleRender(pool);
  }
}

/* 渲染一批：折叠钮 + 头（节名 / 换一批 / 折叠）+ 气泡（交错入场动画延迟 i*35ms） */
function wdBubbleRender(pool){
  var box = document.getElementById('wdBubbles');
  if(!box) return;
  var ta = hostDesk.el('ta');
  box.classList.remove('hide');
  box.classList.toggle('wdb-folded', wdBbl.fold);
  var pages = Math.max(1, Math.ceil(pool.length / WDB_PAGE));
  if(wdBbl.page >= pages) wdBbl.page = 0;
  var batch = pool.slice(wdBbl.page * WDB_PAGE, wdBbl.page * WDB_PAGE + WDB_PAGE);
  var st = (ta && typeof structAt === 'function') ? structAt(ta.value, ta.selectionStart) : { label: '' };
  box.innerHTML = '';
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'wdb-fab';
  fab.textContent = '✦';
  fab.title = '展开灵感气泡';
  fab.addEventListener('click', function(){ wdBubbleFold(false); });
  box.appendChild(fab);
  var cluster = document.createElement('div');
  cluster.className = 'wdb-cluster';
  var head = document.createElement('div');
  head.className = 'wdb-head';
  var tag = document.createElement('span');
  tag.className = 'wdb-tag';
  tag.textContent = st.label;
  tag.title = '当前节 · 气泡内容随节切换';
  head.appendChild(tag);
  if(pages > 1){
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'wdb-more';
    more.textContent = '换一批';
    more.title = '换一批灵感气泡（第 ' + (wdBbl.page + 1) + ' / ' + pages + ' 批）';
    more.addEventListener('click', function(){
      wdBbl.page = (wdBbl.page + 1) % pages;
      wdBubbleRender(pool);
    });
    head.appendChild(more);
  }
  var foldBtn = document.createElement('button');
  foldBtn.type = 'button';
  foldBtn.className = 'wdb-fold';
  foldBtn.textContent = '⌄';
  foldBtn.title = '折叠灵感气泡';
  foldBtn.addEventListener('click', function(){ wdBubbleFold(true); });
  head.appendChild(foldBtn);
  cluster.appendChild(head);
  var wrap = document.createElement('div');
  wrap.className = 'wdb-wrap';
  for(var i = 0; i < batch.length; i++) wdBubbleOne(wrap, batch[i], i);
  cluster.appendChild(wrap);
  box.appendChild(cluster);
}

/* 单个气泡（独立函数承载闭包，避免循环体内建闭包的写法） */
function wdBubbleOne(wrap, it, idx){
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'wdb-bubble' + (it.block ? ' wdb-blk' : '');
  b.textContent = it.label;
  b.title = '插入：' + String(it.body || '').replace(/\$\{\d+\}/g, '…').replace(/\s+/g, ' ').slice(0, 80);
  b.dataset.wdbLabel = it.label;
  b.dataset.wdbBody = it.body || '';
  b.style.animationDelay = (idx * 35) + 'ms';   /* 群内交错出现 */
  b.addEventListener('mousedown', function(e){
    e.preventDefault();                          /* 保住 textarea 焦点与光标（与 # 候选点选同口径） */
    wdBubbleInsert(it);
  });
  wrap.appendChild(b);
}

/* 点击气泡 → 直接插入该条 body 到光标处（不走 # 触发）；插后补派 input → wdOnInput 真写回 state.blocks */
function wdBubbleInsert(it){
  var ta = hostDesk.el('ta');
  if(!ta || ta.disabled || !it) return;
  var ins = cmplPrepare(it.body);
  var text = ins.text;
  var p = (typeof ta.selectionStart === 'number') ? ta.selectionStart : ta.value.length;
  var q = (typeof ta.selectionEnd === 'number') ? ta.selectionEnd : p;
  var before = ta.value.slice(0, p), after = ta.value.slice(q);
  /* 整块件（风格包全套等）与上下文空行分隔（与 cmplCommit 同规则） */
  if(it.block){
    if(before.length && !/\n\s*\n$/.test(before)) text = (/\n$/.test(before) ? '\n' : '\n\n') + text;
    if(after.length && !/^\s*\n/.test(after)) text = text + '\n\n';
  }
  var base = p + (text.length - ins.text.length);
  ta.value = before + text + after;
  var caret;
  if(ins.slots.length){
    cmplSlots = [];                              /* 槽位模式复用 # 候选的既有键路（Tab 逐位跳） */
    for(var s = 0; s < ins.slots.length; s++) cmplSlots.push(base + ins.slots[s]);
    cmplSlotIdx = 0;
    caret = cmplSlots[0];
  }else{ cmplSlots = null; caret = base + ins.text.length; }
  ta.focus();                                    /* 焦点回 textarea */
  ta.setSelectionRange(caret, caret);
  try{ ta.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){}   /* v7.19 写回链路 */
  wdBubbleRefresh();                             /* 新光标节 → 立即刷新气泡群 */
}

/* 折叠 / 展开（会话内存，不持久） */
function wdBubbleFold(on){
  wdBbl.fold = !!on;
  var box = document.getElementById('wdBubbles');
  if(box) box.classList.toggle('wdb-folded', wdBbl.fold);
}
/* 无候选 → 整体隐藏（不出空壳） */
function wdBubbleHide(){
  var box = document.getElementById('wdBubbles');
  if(box) box.classList.add('hide');
}
/* 输入态降透明：input 后 800ms 内气泡群临时降低存在感 */
function wdBubbleDim(){
  var box = document.getElementById('wdBubbles');
  if(!box) return;
  box.classList.add('wdb-dim');
  if(wdBbl.dimTimer) clearTimeout(wdBbl.dimTimer);
  wdBbl.dimTimer = setTimeout(function(){ wdBbl.dimTimer = 0; box.classList.remove('wdb-dim'); }, 800);
}

/* ---- DCL：初始化（applyView → renderWrite）+ 元素级接线（不新增 document/window 级 key 监听） ---- */
document.addEventListener('DOMContentLoaded', function(){
  applyView();
  renderWrite();

  var list = document.getElementById('wdList');
  if(list){
    list.addEventListener('click', function(e){
      var lab = e.target.closest ? e.target.closest('.wd-lab') : null;
      if(lab){ e.stopPropagation(); wdCycleTag(parseInt(lab.dataset.idx, 10)); return; }   /* v7.21：标签钮 */
      var x = e.target.closest ? e.target.closest('.wd-x') : null;
      if(x){ e.stopPropagation(); wdDel(parseInt(x.dataset.idx, 10)); return; }
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(item) wdSelect(parseInt(item.dataset.idx, 10));
    });
    list.addEventListener('contextmenu', function(e){
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(!item) return;
      wdContext(e, parseInt(item.dataset.idx, 10));
    });
    /* 拖拽排序（HTML5 DnD，与模板单元/片段库同型） */
    list.addEventListener('dragstart', function(e){
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(!item) return;
      wdDragFrom = parseInt(item.dataset.idx, 10);
      if(e.dataTransfer){ e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', String(wdDragFrom)); }catch(err){} }
      item.classList.add('dragging');
    });
    list.addEventListener('dragover', function(e){
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(!item) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    list.addEventListener('dragleave', function(e){
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(item) item.classList.remove('drag-over');
    });
    list.addEventListener('drop', function(e){
      var item = e.target.closest ? e.target.closest('.wd-item') : null;
      if(!item) return;
      e.preventDefault();
      item.classList.remove('drag-over');
      var to = parseInt(item.dataset.idx, 10);
      if(wdDragFrom >= 0 && wdDragFrom !== to) wdReorder(wdDragFrom, to);
      wdDragFrom = -1;
    });
    list.addEventListener('dragend', function(){
      var rows = list.querySelectorAll('.wd-item');
      for(var i = 0; i < rows.length; i++) rows[i].classList.remove('drag-over', 'dragging');
      wdDragFrom = -1;
    });
  }

  var addBtn = document.getElementById('wdAdd');
  if(addBtn) addBtn.addEventListener('click', function(){ wdNew(); });

  /* v7.20：左栏头部项目身份行 → 项目菜单（复用 openProjectMenu / #ctxMenu，与顶栏 #btnProj 同型） */
  var projBtn = document.getElementById('wdProj');
  if(projBtn){
    projBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var cm = document.getElementById('ctxMenu');
      if(cm.classList.contains('open')){ closeCtxMenu(); return; }
      var r = this.getBoundingClientRect();
      openProjectMenu(r.left, r.bottom + 6);
    });
  }

  /* 右栏编辑器 = coding 编辑器内核（宿主 hostDesk）；补全/复制全文由 complete.cmplBind(hostDesk) 接线 */
  var ta = hostDesk.el('ta');
  if(ta){
    ta.addEventListener('input', wdOnInput);
    ta.addEventListener('scroll', function(){ hlSyncBox(hostDesk); });
    ta.addEventListener('click', function(){ hlRefresh(hostDesk); wdBubbleRefresh(); });   /* v7.20：点选光标 → 节判定刷新（既有监听体内加行，不新增监听） */
    ta.addEventListener('keyup', function(){ hlRefresh(hostDesk); wdBubbleRefresh(); });   /* v7.20：键盘移光标 → 同上 */
    /* v7.19：划选**只刷新状态栏**（行列 / 节 / 错误数），不再整层重建彩色层。
       实测：键盘 Shift+方向 延展选区时 select 每按一次就触发一次（12 次按键 → 25 次整层重建），
       而划选期间文本与光标位置都没变，重建彩色层既无必要又抖（且会把配对高亮清掉）。 */
    ta.addEventListener('select', function(){ hlStatus(hostDesk); });
    ta.addEventListener('focus', function(){ hlRefresh(hostDesk); });
    if(window.ResizeObserver) new ResizeObserver(function(){ hlSyncBox(hostDesk); }).observe(ta);
  }

  var strip = hostDesk.el('strip');
  if(strip) strip.addEventListener('click', function(){
    var t = hostDesk.el('ta');
    if(!t || t.disabled) return;
    var kept = (t.value || '').split('\n').filter(function(l){ return l.trim() !== ''; });
    var v = kept.join('\n');
    if(v !== t.value){ t.value = v; wdOnInput(); toast('已移除空行'); }
    else{ toast('没有空行可移除'); }
  });
});

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.write = { applyView, focusDeskEditor, renderWrite, setView, wdContext, wdDel, wdKeydown, wdMove, wdNew, wdSelect };
