/* ==================== view/modals · 通用模态框 / 模板窗 / 右键菜单 ====================
    统一开合与遮罩；由 40-template.js + 55-menu.js 合并。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
/* ---- 拼接栏模板（v6）：多预设单元（模板），每单元容纳多个 prompt 块；套用=替换当前拼接 ---- */
function renderTplList(){
  var list = document.getElementById('spTplList');
  list.innerHTML = '';
  list.classList.toggle('open', tplOpen);
  var fold = document.getElementById('spTplFold');
  fold.textContent = '模板' + (state.templates.length ? ' (' + state.templates.length + ')' : '') + (tplOpen ? ' ▴' : ' ▾');
  if(!state.templates.length){
    var e = document.createElement('div');
    e.className = 'sp-tpl-empty';
    e.textContent = '暂无模板：点「模板定制」创建模板单元';
    list.appendChild(e);
    return;
  }
  state.templates.forEach(function(t, ti){
    var it = document.createElement('div');
    it.className = 'sp-tpl-item';
    var nm = document.createElement('span');
    nm.className = 'sp-tpl-name';
    var tname = '模板 ' + (ti + 1);   /* v6.13：模板名称移除，序号区分 */
    nm.textContent = tname;
    var units = t.units || [];
    var np = 0, ns = 0;
    units.forEach(function(u){ np += u.prefixes.length; ns += u.suffixes.length; });
    var extra = '单元×' + units.length + (np ? ' 前缀×' + np : '') + (ns ? ' 后缀×' + ns : '');
    nm.title = tname + '（' + extra + '）';
    var num = document.createElement('span');
    num.className = 'sp-tpl-num';
    num.textContent = (np ? '▶' : '') + (ns ? '◀' : '') + ' 单' + units.length;
    if(np || ns){
      var pf = document.createElement('span');
      pf.className = 'sp-tpl-num';
      pf.textContent = (np ? '▶' : '') + (ns ? '◀' : '');
      pf.title = '前缀:' + (np ? units.map(function(u){ return u.prefixes.join(' / '); }).filter(Boolean).join(' ｜ ') : '无') + ' 后缀:' + (ns ? units.map(function(u){ return u.suffixes.join(' / '); }).filter(Boolean).join(' ｜ ') : '无');
      it.appendChild(pf);
    }
    var ap = document.createElement('button');
    ap.className = 'sp-tpl-act primary';   /* v6.18：套用 = 主题色主操作 */
    ap.textContent = '套用';
    ap.title = '套用模板：清空拼接后按序生成模板的全部单元';
    ap.addEventListener('click', function(){ applyTemplate(t.id); });
    var pv = document.createElement('button');   /* v6.18：模板预览（只读查看单元结构） */
    pv.className = 'sp-tpl-act';
    pv.textContent = '预览';
    pv.title = '预览模板单元结构（前缀/块区/后缀）';
    pv.addEventListener('click', function(){ previewTemplate(ti); });
    var dl = document.createElement('button');
    dl.className = 'sp-tpl-act danger';
    dl.textContent = '删除';
    dl.addEventListener('click', function(){ deleteTemplate(t.id); });
    it.appendChild(nm);
    it.appendChild(num);
    it.appendChild(pv);
    it.appendChild(ap);
    it.appendChild(dl);
    list.appendChild(it);
  });
}
/* ---- 模板定制窗口（v6.7）：单模板工作模式——每次定制一个模板，窗口中创建的皆为同一模板的组成部分 ---- */
function openTplWin(){
  if(!state.templates.length) newTemplate();   /* v6.12：打开定制窗口立刻新建模板（用户拍板） */
  if(tplCur >= state.templates.length || tplCur < 0) tplCur = 0;
  blurActive();   /* v6.19：抢走画布焦点（否则打字/方向键作用于背景画布） */
  document.getElementById('tplMask').classList.remove('hide');
  renderTplWin();
  var win = document.querySelector('#tplMask .tpl-win');
  if(win && win.focus) win.focus();
}
function closeTplWin(){
  document.getElementById('tplMask').classList.add('hide');
  renderTplList();
  saveNow();
}
function renderTplSelect(){
  var sel = document.getElementById('tplSelect');
  sel.innerHTML = '';
  if(!state.templates.length){ tplCur = -1; return; }
  state.templates.forEach(function(t, i){
    var o = document.createElement('option');
    o.value = i;
    o.textContent = '模板 ' + (i + 1);   /* v6.13：序号区分 */
    sel.appendChild(o);
  });
  var oNew = document.createElement('option');   /* v6.12：新建模板入口收进下拉（按钮形态移除） */
  oNew.value = '-1';
  oNew.textContent = '＋ 新建模板…';
  sel.appendChild(oNew);
  sel.value = String(Math.max(0, tplCur));
}
/* v6.12：模板 = 容器，包含任意数量「模板单元」（单元 = 前缀 + 提示词块 + 后缀） */
function newUnitObj(){
  return { id: uid(), prefixes: [], blocks: [], suffixes: [] };
}
function newTemplate(){
  var t = { id: uid(), units: [newUnitObj()] };
  state.templates.push(t);
  tplCur = state.templates.length - 1;
  renderTplWin();
  renderTplList();
  saveNow();
  return t;
}
function newUnit(){
  var t = state.templates[tplCur];
  if(!t){ newTemplate(); t = state.templates[tplCur]; }
  t.units.push(newUnitObj());
  renderTplWin();
  renderTplList();
  saveNow();
}
function renderTplWin(){
  renderTplSelect();
  var body = document.getElementById('tplBody');
  body.innerHTML = '';
  if(!state.templates.length){
    var e = document.createElement('div');
    e.className = 'tpl-empty';
    e.textContent = '还没有模板：打开窗口已自动新建';
    body.appendChild(e);
    return;
  }
  var t = state.templates[tplCur];
  if(!t || !Array.isArray(t.units)){ tplCur = 0; t = state.templates[0]; }
  if(!t.units.length) t.units.push(newUnitObj());
  /* v6.13：模板名称已移除（序号区分）；直接渲染全部单元卡片（从上到下排列） */
  t.units.forEach(function(u, i){ body.appendChild(tplUnitCard(t, u, i)); });
}
/* v6.12：模板单元卡片 = 前缀值 + 提示词块（任意数量）+ 后缀值 */
/* v6.18：单元卡片可拖拽排序（HTML5 DnD） */
function tplUnitCard(t, u, idx){
  var card = document.createElement('div');
  card.className = 'tpl-card';
  card.draggable = true;
  card.addEventListener('dragstart', function(e){
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', function(){
    card.classList.remove('dragging');
    var cards = document.querySelectorAll('.tpl-card.drag-over');
    for(var i = 0; i < cards.length; i++) cards[i].classList.remove('drag-over');
  });
  card.addEventListener('dragover', function(e){
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', function(){ card.classList.remove('drag-over'); });
  card.addEventListener('drop', function(e){
    e.preventDefault();
    card.classList.remove('drag-over');
    var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if(isNaN(from) || from === idx) return;
    var units = t.units;
    var moved = units.splice(from, 1)[0];
    units.splice(idx, 0, moved);   /* v6.18 修正：插到目标卡片位置（移除后索引自然对齐） */
    renderTplWin();
    renderTplList();
    scheduleSave();
  });
  var head = document.createElement('div');
  head.className = 'tpl-card-head';
  var no = document.createElement('div');
  no.className = 'tpl-unit-no';
  no.textContent = '单元 ' + (idx + 1);
  head.appendChild(no);
  var hint = document.createElement('span');
  hint.className = 'tpl-drag-hint';
  hint.textContent = '≡ 拖动排序';
  head.appendChild(hint);
  card.appendChild(head);
  card.appendChild(tplChipsRow('前缀值（每个独立一行）', u.prefixes));
  card.appendChild(tplChipsRow('后缀值（每个独立一行）', u.suffixes));   /* v6.13：提示词块不是模板定制的一部分（中间为拼入容器） */
  var del = document.createElement('button');
  del.className = 'tpl-block-op danger';
  del.textContent = '删除本单元';
  del.style.alignSelf = 'flex-start';
  del.addEventListener('click', function(){
    var ui = t.units.findIndex(function(x){ return x.id === u.id; });
    if(ui >= 0){ t.units.splice(ui, 1); renderTplWin(); renderTplList(); scheduleSave(); }
  });
  card.appendChild(del);
  return card;
}
function tplChipsRow(label, arr){
  var wrap = document.createElement('div');
  var lbl = document.createElement('div');
  lbl.className = 'tpl-lbl';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  var chips = document.createElement('div');
  chips.className = 'tpl-chips';
  arr.forEach(function(v, vi){
    var c = document.createElement('span');
    c.className = 'tpl-chip';
    c.textContent = v;
    var x = document.createElement('button');
    x.className = 'tpl-chip-x';
    x.textContent = '×';
    x.title = '删除该值';
    x.addEventListener('click', function(){ arr.splice(vi, 1); renderTplWin(); renderTplList(); scheduleSave(); });
    c.appendChild(x);
    chips.appendChild(c);
  });
  wrap.appendChild(chips);
  var add = document.createElement('button');
  add.className = 'tpl-add';
  add.textContent = '+ 添加' + (label.indexOf('前缀') === 0 ? '前缀' : '后缀');
  add.addEventListener('click', function(){
    var inp = document.createElement('input');
    inp.className = 'tpl-add-input';
    inp.placeholder = '输入值后回车';
    add.style.display = 'none';
    wrap.appendChild(inp);
    inp.focus();
    var commit = function(){
      if(inp.dataset.done) return;
      inp.dataset.done = '1';
      var v = inp.value.trim();
      if(v){ arr.push(v); renderTplWin(); renderTplList(); scheduleSave(); }
      else{ renderTplWin(); }
    };
    inp.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ commit(); }
      else if(e.key === 'Escape'){ renderTplWin(); }
    });
    inp.addEventListener('blur', commit);
  });
  wrap.appendChild(add);
  return wrap;
}

function applyTemplate(id){
  var t = state.templates.find(function(x){ return x.id === id; });
  if(!t) return;
  /* v6.13：套用 = 替换清空 + 模板全部单元按序生成（单元 = 前缀+空块区+后缀，块由拼入填充）；拼入目标 = 第一个单元 */
  if(!t.units || !t.units.length){ toast('该模板还没有单元：先到「模板定制」添加单元'); return; }
  var ti = state.templates.findIndex(function(x){ return x.id === id; });
  var tname = '模板 ' + (ti + 1);   /* v6.13：模板序号名 */
  var items = t.units.map(function(u){
    return { type: 'unit', id: uid(), name: tname, prefixes: u.prefixes.slice(), suffixes: u.suffixes.slice(), blockIds: [] };
  });
  state.splice.items = items;
  state.splice.activeUnitId = items[0].id;
  renderSplice();
  renderTplList();
  saveNow();
  toast('已套用模板「' + tname + '」（' + items.length + ' 个单元），拼入的块进入第一个单元');
}
/* v6.18：模板预览（只读）——查看模板的单元结构（前缀/块区/后缀） */
function previewTemplate(ti){
  var t = state.templates[ti];
  if(!t) return;
  document.getElementById('tplPrevTitle').textContent = '模板 ' + (ti + 1) + ' 预览';
  var body = document.getElementById('tplPrevBody');
  body.innerHTML = '';
  (t.units || []).forEach(function(u, i){
    var card = document.createElement('div');
    card.className = 'tpl-prev-card';
    var no = document.createElement('div');
    no.className = 'tpl-unit-no';
    no.textContent = '单元 ' + (i + 1);
    card.appendChild(no);
    if(u.prefixes.length){
      var pl = document.createElement('div');
      pl.className = 'tpl-lbl';
      pl.textContent = '前缀值';
      card.appendChild(pl);
      var pw = document.createElement('div');
      pw.className = 'tpl-chips';
      u.prefixes.forEach(function(p){
        var s = document.createElement('span');
        s.className = 'tpl-chip';
        s.textContent = p;
        pw.appendChild(s);
      });
      card.appendChild(pw);
    }
    var em = document.createElement('div');
    em.className = 'tpl-prev-empty';
    em.textContent = '□ 拼入块容器（套用后把提示词块拼到这里）';
    card.appendChild(em);
    if(u.suffixes.length){
      var sl = document.createElement('div');
      sl.className = 'tpl-lbl';
      sl.textContent = '后缀值';
      card.appendChild(sl);
      var sw = document.createElement('div');
      sw.className = 'tpl-chips';
      u.suffixes.forEach(function(p){
        var s = document.createElement('span');
        s.className = 'tpl-chip';
        s.textContent = p;
        sw.appendChild(s);
      });
      card.appendChild(sw);
    }
    body.appendChild(card);
  });
  document.getElementById('tplPrevMask').classList.remove('hide');
  blurActive();   /* v6.19：只读窗口也抢走画布焦点（防方向键平移画布） */
  var win = document.querySelector('#tplPrevMask .tpl-win');
  if(win && win.focus) win.focus();
}

function deleteTemplate(id){
  var i = state.templates.findIndex(function(x){ return x.id === id; });
  if(i < 0) return;
  var t = state.templates[i];
  var label = '模板 ' + (i + 1);   /* P3 修复：v6.13 起模板已无 name 字段，原 t.name 恒为 undefined */
  state.templates.splice(i, 1);
  renderTplList();
  saveNow();
  toast('已删除模板：' + label, { label: '撤销', fn: function(){
    state.templates.splice(i, 0, t);
    renderTplList();
    saveNow();
    toast('已恢复模板：' + label);
  }});
}

/* ---- 命名模态框（v6：替代原生 prompt，headless/嵌入环境不可靠；v6.4 多字段通用版）
   v7.18：+ 可选 message（在表单顶部渲一句说明文字；供「删除项目」等确认框复用，避免原生 confirm） ---- */
var modalCb = null;
function openModal(title, fields, cb, message){
  document.getElementById('modalTitle').textContent = title;
  var body = document.getElementById('modalBody');
  body.innerHTML = '';
  if(message){
    var msg = document.createElement('div');
    msg.className = 'modal-msg';
    msg.textContent = message;
    body.appendChild(msg);
  }
  (fields || []).forEach(function(f){
    var row = document.createElement('div');
    row.className = 'modal-row';
    var lab = document.createElement('div');
    lab.className = 'modal-label';
    lab.textContent = f.label;
    var inp = document.createElement('input');
    inp.className = 'modal-input';
    inp.maxLength = f.maxLength || 60;
    inp.value = f.value || '';
    if(f.placeholder) inp.placeholder = f.placeholder;
    row.appendChild(lab);
    row.appendChild(inp);
    body.appendChild(row);
  });
  modalCb = cb;
  document.getElementById('modalMask').classList.remove('hide');
  var first = body.querySelector('.modal-input');
  if(first){ first.focus(); first.select(); }
}
function closeModal(){
  document.getElementById('modalMask').classList.add('hide');
  modalCb = null;
}
function toggleCollapsed(){
  state.collapsed = !state.collapsed;
  renderSplice();
  saveNow();
}
/* copySpliced 见拼接操作区（v6.6 条目结构） */

/* ==================== v7.18：多项目（项目菜单 / 切换 / 新建 / 重命名 / 删除） ====================
   复用 #ctxMenu（与「导」下拉同型）与 #modalMask（确认 / 命名）；**不新增窗骨架、不新增监听**。
   切换只渲染**当前活动视图**（单向，不成环）；绝不在隐藏态渲染画布（守需求② —— 设计 §5.2）。 */

/* 顶栏「项目」入口：列出全部项目（● = 当前，disabled）+ 新建 / 重命名 / 删除。 */
function openProjectMenu(x, y){
  var items = [], i;
  for(i = 0; i < state.projects.length; i++){
    var p = state.projects[i];
    var cur = (p.id === state.activeProject);
    items.push({ label: (cur ? '● ' : '○ ') + (p.title || '未命名项目'), act: 'proj-switch', projId: p.id, disabled: cur });
  }
  items.push('sep');
  items.push({ label: '＋ 新建项目', act: 'proj-new' });
  items.push({ label: '重命名当前项目', act: 'proj-rename' });
  items.push({ label: '删除当前项目', act: 'proj-del', danger: true });
  openCtxMenu(items, x, y);
}

/* 切到目标项目：写回当前槽（引用）→ 载入目标槽 → 只重渲染当前视图。 */
function switchProject(targetId){
  if(!state || !Array.isArray(state.projects)) return;
  if(targetId === state.activeProject) return;      /* 0 幂等 */
  if(!projectAt(targetId)) return;
  flush();                                           /* ① 立即落盘（清防抖，不丢字） */
  cmplUseInvalidate();                               /* ② 「未用过」缓存失效（编辑器文本将整体更换） */
  if(activeView === 'write'){ cmplReset(hostDesk); } /* ③ 收当前视图的临时层 */
  else{ closeBlockEditor(); }
  closeCtxMenu();
  syncActiveProject();                               /* ④ 写回当前项目槽（live → projects[active]） */
  loadProjectInto(targetId);                         /*    载入目标项目槽（activeProject=id; live ← 槽） */
  selected = [];                                     /* ⑤ 会话选中态跨项目无效 → 复位 */
  wdSelId = null;
  if(activeView === 'canvas'){ render(); }           /* ⑥ 只重渲染当前视图（隐藏的画布不渲染） */
  else{ renderWrite(); }
  applyView();                                       /* ⑦ 计数 / 高亮 / 显隐 */
  scheduleSave();                                    /* ⑧ 落盘 */
  toast('已切到项目「' + state.title + '」');
}

/* 新建项目默认名：扫描**现存**项目名里匹配 /^项目 (\d+)$/ 的最大号 + 1（无匹配则从 1）。
   用「现存最大号 +1」而非「项目数 +1」：既不跳号（已有「未命名分镜」→ 首次新建 =「项目 1」），
   也**绝不与现存重名**（删掉「项目 1」后若只剩「项目 2」→ 新号 = 3，不复用出与现存同名者）。 */
function nextProjectName(){
  var max = 0;
  for(var i = 0; i < state.projects.length; i++){
    var m = /^项目 (\d+)$/.exec(state.projects[i].title || '');
    if(m){ var n = parseInt(m[1], 10); if(n > max) max = n; }
  }
  return '项目 ' + (max + 1);
}

/* 新建项目：槽 + 顶层镜像（零块 → 真正「从零」；两视图各自显示空态引导）。 */
function newProject(){
  var def = nextProjectName();
  openModal('新建项目', [{ label: '项目名称', value: def }], function(vals){
    var name = (vals && vals[0] ? String(vals[0]).trim() : '') || def;
    var slot = newProjectSlot(name);
    flush();                                         /* 写回当前项目槽 */
    syncActiveProject();
    state.projects.push(slot);
    loadProjectInto(slot.id);                        /* 新项目为活动项目（空块） */
    selected = [];
    wdSelId = null;
    if(activeView === 'canvas'){ render(); } else{ renderWrite(); }
    applyView();
    scheduleSave();
    toast('已新建项目「' + state.title + '」');
  });
}

/* 重命名当前项目（空名回落「未命名项目」）。 */
function renameActiveProject(){
  var slot = projectAt(state.activeProject);
  if(!slot) return;
  openModal('重命名项目', [{ label: '项目名称', value: state.title }], function(vals){
    var name = (vals && vals[0] ? String(vals[0]).trim() : '');
    if(!name) name = '未命名项目';
    slot.title = name;
    state.title = name;
    saveNow();
    toast('已重命名项目「' + name + '」');
  });
}

/* 删除**当前**项目：唯一项目禁删；先确认 → 先切走再删 → toast 可撤销（插回原下标，**不自动激活**）。 */
function deleteProject(){
  if(!state || !Array.isArray(state.projects)) return;
  if(state.projects.length <= 1){ toast('至少保留一个项目'); return; }
  var slot = projectAt(state.activeProject);
  if(!slot) return;
  var idx = state.projects.indexOf(slot);
  openModal('删除项目', [], function(){
    var others = state.projects.filter(function(p){ return p.id !== slot.id; });
    if(!others.length) return;                       /* 双保险 */
    var next = others[Math.min(idx, others.length - 1)];
    switchProject(next.id);                          /* ★先切走（写回 + 载入），再删活动项目 */
    var at = state.projects.indexOf(slot);
    if(at < 0) return;
    state.projects.splice(at, 1);
    saveNow();
    toast('已删除项目「' + (slot.title || '未命名项目') + '」', { label: '撤销', fn: function(){
      state.projects.splice(idx, 0, slot);           /* 插回原下标；不自动激活（防视图跳变） */
      saveNow();
      toast('已恢复项目「' + (slot.title || '未命名项目') + '」');
    }});
  }, '该项目及其全部内容将从本机移除；可点提示上的「撤销」恢复。');
}

/* ---- 画布右键菜单（v5.2） ---- */
function addBlockHere(cx, cy){
  var c = document.getElementById('canvas');
  var cr = c.getBoundingClientRect();
  var n = state.blocks.length;
  var b = { id: uid(), text: '' };
  b.x = (cx - cr.left - state.pan.x) / state.zoom - (MIN_BLOCK_W / 2) + ((n % 5) - 2) * 20;
  b.y = (cy - cr.top - state.pan.y) / state.zoom - 60 + ((n % 5) - 2) * 16;
  state.blocks.push(b);
  render();
  var cards = board.querySelectorAll('.block');
  var last = cards[cards.length - 1];
  var tx = last && last.querySelector('.block-text');
  popCard(last);   /* v7：创建弹入 */
  if(tx) focusCaretEnd(tx);
  saveNow();
}
var __ctxBlock = -1;
var __ctxX = 0, __ctxY = 0;   /* 右键触发位置（「在此处新增块」落点用） */
function openCtxMenu(items, x, y){
  var m = document.getElementById('ctxMenu');
  m.innerHTML = '';
  items.forEach(function(it){
    if(it === 'sep'){
      var s = document.createElement('div');
      s.className = 'ctx-sep';
      m.appendChild(s);
      return;
    }
    var b = document.createElement('div');
    b.className = 'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
    b.textContent = it.label;
    b.dataset.act = it.act;
    if(it.projId) b.dataset.projId = it.projId;   /* v7.18：项目菜单项携带项目 id */
    m.appendChild(b);
  });
  m.classList.add('open');
  var r = m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
  m.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
}
function closeCtxMenu(){
  document.getElementById('ctxMenu').classList.remove('open');
  __ctxBlock = -1;
}
document.addEventListener('contextmenu', function(e){
  if(!e.target.closest('.canvas')) return;   /* 仅画布区域接管右键 */
  var block = e.target.closest('.block');
  if(block && e.target.closest('.block-text')) return;   /* textarea 内保留浏览器原生菜单 */
  e.preventDefault();
  __ctxX = e.clientX;
  __ctxY = e.clientY;
  if(block){   /* 块上（把手/卡片区域） */
    var i = state.blocks.findIndex(function(b){ return b.id === block.dataset.id; });
    if(i < 0) return;
    __ctxBlock = i;
    /* v6.3：右键菜单不修改选择集——右键块在选中集内 → 菜单批量作用于选中集；否则菜单单块 */
    var multi = (selected.length > 1) && isSel(state.blocks[i].id);
    if(state.blocks[i].type === 'image'){   /* v6.16：图片块仅提供删除 */
      openCtxMenu([
        { label: multi ? ('删除（' + selected.length + ' 块）') : '删除', act: 'del-block', danger: true }
      ], e.clientX, e.clientY);
    }else{
    openCtxMenu([
      { label: multi ? ('拼入拼接（' + selected.length + ' 块）') : '拼入拼接', act: 'splice-block' },
      { label: multi ? ('复制（' + selected.length + ' 块）') : '复制', act: 'copy-block' },
      { label: multi ? ('克隆组（' + selected.length + ' 块）') : '克隆', act: 'clone-block' },
      { label: multi ? ('移除空行（' + selected.length + ' 块）') : '移除空行', act: 'strip-blank' },
      'sep',
      { label: multi ? ('删除（' + selected.length + ' 块）') : '删除', act: 'del-block', danger: true }
    ], e.clientX, e.clientY);
    }
  }else if(!block){   /* 画布空白：清空多选 */
    if(selected.length){ selected = []; refreshSel(); }
    openCtxMenu([
      { label: '在此处新增块', act: 'add-here' },
      'sep',
      { label: '复制拼接', act: 'copy-spliced', disabled: !countSpliced() },
      { label: '清空拼接', act: 'clear-spliced', disabled: !countSpliced() },
      'sep',
      { label: '导出 JSON', act: 'export' },
      { label: '导入 JSON', act: 'import' }
    ], e.clientX, e.clientY);
  }
});
document.addEventListener('click', function(e){
  var m = document.getElementById('ctxMenu');
  if(!m.classList.contains('open')) return;
  var item = e.target.closest('.ctx-item');
  if(!item){ closeCtxMenu(); return; }   /* 点菜单外关闭 */
  var act = item.dataset.act;
  var bi = __ctxBlock;   /* 先取块索引（closeCtxMenu 会重置） */
  var pid = item.dataset.projId;   /* v7.18：项目菜单项携带的项目 id（同样须在 close 前取） */
  closeCtxMenu();
  if(act === 'add-here'){ addBlockHere(__ctxX, __ctxY); }
  else if(act === 'copy-spliced'){ copySpliced(); }
  else if(act === 'clear-spliced'){ spliceClear(); toast('已清空拼接'); }
  else if(act === 'export'){ exportJSON(); }
  else if(act === 'import'){ document.getElementById('fileInput').click(); }
  else if(act === 'splice-block'){ bulkAction('splice', actIds(bi)); }
  else if(act === 'copy-block'){ bulkAction('copy', actIds(bi)); }
  else if(act === 'clone-block'){ bulkAction('clone', actIds(bi)); }
  else if(act === 'strip-blank'){ bulkAction('strip-blank', actIds(bi)); }
  else if(act === 'del-block'){ bulkAction('del', actIds(bi)); }
  /* v7.15：写作台条目右键菜单动作（复用同一 #ctxMenu；closeCtxMenu 已在上面调用） */
  else if(act === 'wd-del'){ wdDel(); }
  else if(act === 'wd-up'){ wdMove('up'); }
  else if(act === 'wd-down'){ wdMove('down'); }
  /* v7.18：项目菜单动作（复用同一 #ctxMenu） */
  else if(act === 'proj-switch'){ if(pid) switchProject(pid); }
  else if(act === 'proj-new'){ newProject(); }
  else if(act === 'proj-rename'){ renameActiveProject(); }
  else if(act === 'proj-del'){ deleteProject(); }
  __ctxBlock = -1;
});

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.modals = { addBlockHere, closeCtxMenu, closeModal, closeTplWin, deleteProject, modalCb, newProject, newTemplate, newUnit, openCtxMenu, openProjectMenu, openTplWin, renameActiveProject, renderTplList, renderTplWin, switchProject, toggleCollapsed };
