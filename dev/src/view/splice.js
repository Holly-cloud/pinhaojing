/* ---- 拼接侧边栏（v6.6：平铺条目 = 块条目 + 模板单元窗口条目） ---- */
function renderSplice(growIds){   /* v7：growIds = 本次新增连线 id 列表 → 光线生长动画（其余刷新静态） */
  var panel = document.getElementById('splicePanel');
  var body = document.getElementById('spBody');
  panel.classList.toggle('collapsed', !!state.collapsed);
  document.getElementById('spCount').textContent = countSpliced();
  document.getElementById('spFold').textContent = state.collapsed ? '⏴' : '⏷';
  body.innerHTML = '';
  if(!state.splice.items.length){
    var e = document.createElement('div');
    e.className = 'sp-empty';
    e.innerHTML = '套用模板后拼入块，<br>点块拖手上「拼」或右键菜单拼入';
    body.appendChild(e);
    updateLinks();   /* v6.16：空态也要清空光线（提前 return 分支） */
    return;
  }
  state.splice.items.forEach(function(it){
    body.appendChild(it.type === 'unit' ? spUnit(it) : spItem(it.id));
  });
  updateLinks(growIds);   /* v6.16：拼接栏变化 → 光线刷新；v7：growIds 播生长 */
}
function countSpliced(){
  var n = 0;
  state.splice.items.forEach(function(it){
    if(it.type === 'block') n++;
    else n += it.blockIds.length;
  });
  return n;
}
/* 平铺块条目 */
function spItem(id){
  var b = findBlockById(id);
  var it = document.createElement('div');
  it.className = 'sp-item';
  it.dataset.id = id;   /* v6.16：供拼接光线定位 */
  var tx = document.createElement('span');
  tx.className = 'sp-text';
  tx.textContent = b ? (b.text || '(空块)') : '(缺失块)';
  var x = document.createElement('button');
  x.className = 'sp-x';
  x.title = '移出拼接';
  x.textContent = '×';
  x.addEventListener('click', function(e){
    e.stopPropagation();
    spliceRemove(id);
  });
  it.appendChild(tx);
  it.appendChild(x);
  return it;
}
/* 模板单元窗口条目（圆角窗口：头部 + 前缀行 + 内部块小窗 + 后缀行） */
function spUnit(u){
  var wrap = document.createElement('div');
  wrap.className = 'sp-unit' + (isActiveUnit(u.id) ? ' active' : '');
  wrap.dataset.id = u.id;   /* v6.18：供拼模式投放定位 */
  var head = document.createElement('div');
  head.className = 'sp-unit-head';
  head.title = '点击设为拼入目标';
  var name = document.createElement('span');
  name.className = 'sp-unit-name';
  /* v6.18：单元不显示模板名称——按拼接栏内序号显示「单元 N」 */
  var uidx = state.splice.items.findIndex(function(x){ return x.type === 'unit' && x.id === u.id; });
  name.textContent = '单元 ' + (uidx + 1);
  var tag = document.createElement('span');
  tag.className = 'sp-unit-tag';
  tag.textContent = '拼入到此';
  tag.style.display = isActiveUnit(u.id) ? '' : 'none';
  var x = document.createElement('button');
  x.className = 'sp-unit-x';
  x.textContent = '×';
  x.title = '移除该模板单元（画布块保留）';
  x.addEventListener('click', function(e){
    e.stopPropagation();
    spliceRemoveUnit(u.id);
  });
  head.appendChild(name);
  head.appendChild(tag);
  head.appendChild(x);
  head.addEventListener('click', function(){ setActiveUnit(u.id); });
  wrap.appendChild(head);
  if(u.prefixes.length){
    var pl = document.createElement('div');
    pl.className = 'sp-unit-line';
    u.prefixes.forEach(function(p){
      var s = document.createElement('span');
      s.className = 'sp-unit-prefix';
      s.textContent = p;
      pl.appendChild(s);
    });
    wrap.appendChild(pl);
  }
  var body = document.createElement('div');
  body.className = 'sp-unit-body';
  if(!u.blockIds.length){
    var em = document.createElement('div');
    em.className = 'sp-unit-empty';
    em.textContent = '（空）拼入的块将显示在这里';
    body.appendChild(em);
  }else{
    u.blockIds.forEach(function(bid, i){ body.appendChild(spUBlock(bid, u, i)); });
  }
  wrap.appendChild(body);
  if(u.suffixes.length){
    var sl = document.createElement('div');
    sl.className = 'sp-unit-line';
    u.suffixes.forEach(function(s){
      var el2 = document.createElement('span');
      el2.className = 'sp-unit-suffix';
      el2.textContent = s;
      sl.appendChild(el2);
    });
    wrap.appendChild(sl);
  }
  return wrap;
}
/* 单元内 prompt 块小窗（圆角窗口） */
function spUBlock(bid, u, i){
  var b = findBlockById(bid);
  var el = document.createElement('div');
  el.className = 'sp-ublock';
  el.dataset.id = bid;   /* v6.16：供拼接光线定位 */
  var tx = document.createElement('span');
  tx.className = 'sp-ub-text';
  tx.textContent = b ? (b.text || '(空块)') : '(缺失块)';
  var x = document.createElement('button');
  x.className = 'sp-ub-x';
  x.textContent = '×';
  x.title = '移出该单元';
  x.addEventListener('click', function(e){
    e.stopPropagation();
    u.blockIds.splice(i, 1);
    renderSplice();
    saveNow();
  });
  /* v6.12：点击引用块 = 弹出编辑窗口，同步修改画布块文本 */
  el.addEventListener('click', function(){
    if(!b) return;
    openBlockEditor(b.text, function(v){
      b.text = (v === undefined || v === null) ? '' : v;   /* v7.6：统一为不 trim（与画布内联编辑一致） */
      bringToFront(b.id);   /* v6.17：拼接栏内编辑也算操作 → 画布块置顶 */
      var ta = board.querySelector('.block[data-id="' + b.id + '"] .block-text');
      if(ta){ ta.value = b.text; autoResize(ta); fitBlock(ta); }
      renderSplice();
      scheduleSave();
    });
  });
  el.appendChild(tx);
  el.appendChild(x);
  return el;
}
/* ---- 拼接操作（v6.6） ---- */
function activeUnit(){
  if(state.splice.activeUnitId){
    for(var i = 0; i < state.splice.items.length; i++){
      var it = state.splice.items[i];
      if(it.type === 'unit' && it.id === state.splice.activeUnitId) return it;
    }
  }
  for(var j = state.splice.items.length - 1; j >= 0; j--){
    if(state.splice.items[j].type === 'unit') return state.splice.items[j];
  }
  return null;
}
function isActiveUnit(id){ return state.splice.activeUnitId === id; }
function setActiveUnit(id){ state.splice.activeUnitId = id; renderSplice(); saveNow(); }
/* v7：动效 helper —— 块创建弹入 / 拼入吸入 / 拼接栏条目弹入 */
function popCard(card){
  if(!card) return;
  card.classList.add('pop-in');
  setTimeout(function(){ card.classList.remove('pop-in'); }, 220);
}
function suckBlock(id){
  var c = board.querySelector('.block[data-id="' + id + '"]');
  if(!c) return;
  c.classList.add('suck');
  setTimeout(function(){ c.classList.remove('suck'); }, 200);
}
function popSpliceEntry(bid){
  var body = document.getElementById('spBody');
  var el = body.querySelector('.sp-item[data-id="' + bid + '"], .sp-ublock[data-id="' + bid + '"]');
  if(!el) return;
  el.classList.add('sp-pop');
  setTimeout(function(){ el.classList.remove('sp-pop'); }, 220);
}
function spliceAdd(id){
  var b = findBlockById(id);
  if(!b || b.type === 'image') return;   /* v6.16：图片块不可拼入（仅展示） */
  var u = activeUnit();
  if(u){ u.blockIds.push(id); }
  else{ state.splice.items.push({ type: 'block', id: id }); }
  renderSplice([id]);   /* v7：光线生长 */
  suckBlock(id);        /* v7：画布块微缩「吸入」 */
  popSpliceEntry(id);   /* v7：条目弹入落定 */
  saveNow();
}
function spliceRemoveIds(ids){
  state.splice.items = state.splice.items.filter(function(it){ return !(it.type === 'block' && ids.indexOf(it.id) >= 0); });
  state.splice.items.forEach(function(it){ if(it.type === 'unit') it.blockIds = it.blockIds.filter(function(b){ return ids.indexOf(b) < 0; }); });
}
function spliceRemove(id){
  spliceRemoveIds([id]);
  renderSplice();
  saveNow();
}
function spliceRemoveUnit(uid){
  state.splice.items = state.splice.items.filter(function(it){ return !(it.type === 'unit' && it.id === uid); });
  if(state.splice.activeUnitId === uid) state.splice.activeUnitId = null;
  renderSplice();
  saveNow();
}
function spliceClear(){
  state.splice.items = [];
  state.splice.activeUnitId = null;
  renderSplice();
  saveNow();
}
function copySpliced(){
  var parts = [];
  state.splice.items.forEach(function(it){
    if(it.type === 'block'){
      var b = findBlockById(it.id);
      if(b && b.text.trim()) parts.push(b.text.trim());
    }else{
      var seg = [];
      if(it.prefixes.length) seg.push('\n' + it.prefixes.join('\n'));   /* v6.21 规则（**非 bug，勿改**）：前缀值段上方加一个空行；若前缀段就是复制内容的第一段，则该空行表现为「开头空行」——由 A2a/A2d 断言锁定 */
      var blks = it.blockIds.map(function(bid){ var bl = findBlockById(bid); return bl ? bl.text.trim() : ''; }).filter(Boolean);
      if(blks.length) seg.push(blks.join('\n'));
      if(it.suffixes.length) seg.push(it.suffixes.join('\n'));
      if(seg.length) parts.push(seg.join('\n'));
    }
  });
  if(!parts.length){ toast('拼接列表是空的，先套用模板或把块加进来'); return; }
  /* v6.21：空行规则——提示词块不参与空行加入（块间无空行）、前缀值段上方加一个空行（加在前缀段前，非整段开头）、后缀值不参与（值间无空行）；其余全部 \n 紧挨连接 */
  copyText(parts.join('\n')).then(function(ok){
    toast(ok ? '已复制拼接（' + countSpliced() + ' 块）' : '复制失败，请手动全选复制');
  });
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.splice = { copySpliced, countSpliced, popCard, popSpliceEntry, renderSplice, spliceAdd, spliceClear, spliceRemoveIds, suckBlock };
