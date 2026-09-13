/* ---- 拼接栏模板（v6）：多预设单元（模板），每单元容纳多个 prompt 块；套用=替换当前拼接 ---- */
var tplOpen = false;
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
var tplCur = 0;   /* 当前编辑的模板索引 */
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
  state.templates.splice(i, 1);
  renderTplList();
  saveNow();
  toast('已删除模板：' + t.name, { label: '撤销', fn: function(){
    state.templates.splice(i, 0, t);
    renderTplList();
    saveNow();
    toast('已恢复模板：' + t.name);
  }});
}
