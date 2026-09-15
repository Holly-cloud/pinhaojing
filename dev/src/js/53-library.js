
/* ==================== v7.8 补全配置界面（片段库：浏览 / 修改 / 新增） ====================
   入口：顶栏「补」。窗口形态沿用模板定制窗口（.tpl-win 体系）。
   数据：生效表见 52-complete.js（state.cmpl）。首次打开即把内置表**物化**成用户表——之后一切改动都在用户表上，
        内置表只在「恢复内置默认」时回来。改完写 localStorage（随「导出 JSON」一起走）。
   片段内容可用：`${1}` `${2}` 槽位（上屏后 Tab 逐位跳）；素材绑定位照 Holly 的习惯手写 `@`。
   ================================================================= */
var cmplCfgQ = '', cmplCfgEditing = null, cmplCfgAdding = false;

function cmplCfgMaterialize(){
  if(!state.cmpl || !Array.isArray(state.cmpl.items)){
    cmplSetItems(cmplSeedItems());
    saveNow();
  }
}
function openCmplCfg(){
  cmplCfgMaterialize();
  cmplCfgQ = ''; cmplCfgEditing = null; cmplCfgAdding = false;
  var s = document.getElementById('cmplCfgSearch');
  if(s) s.value = '';
  renderCmplCfg();
  document.getElementById('cmplCfgMask').classList.remove('hide');
  var se = document.getElementById('cmplCfgSearch');
  if(se) se.focus();
}
function closeCmplCfg(){
  cmplCfgEditing = null; cmplCfgAdding = false;
  cmplOrderHide();
  document.getElementById('cmplCfgMask').classList.add('hide');
}
/* 分组顺序 = 组顺序表（cmplGroupOrder，气泡与配置窗口共用一套顺序） */
function cmplCfgGroups(){ return cmplGroupOrder(); }
/* 拖拽排序：条目（可跨组 = 顺带改归组） */
function cmplCfgMoveItem(fromKey, beforeKey){
  var arr = cmplActive().slice(), fi = -1, i;
  for(i = 0; i < arr.length; i++) if(arr[i].key === fromKey) fi = i;
  if(fi < 0) return false;
  var item = arr.splice(fi, 1)[0];
  var bi = -1;
  if(beforeKey) for(i = 0; i < arr.length; i++) if(arr[i].key === beforeKey) bi = i;
  if(beforeKey && bi < 0){ arr.splice(fi, 0, item); return false; }      /* 落点无效 → 原地还原 */
  if(bi >= 0) item.group = arr[bi].group || item.group;                  /* 拖到别组 → 归到该组 */
  if(bi < 0) arr.push(item); else arr.splice(bi, 0, item);
  cmplSetItems(arr); saveNow();
  return true;
}
/* 拖拽排序：整组（写 state.cmpl.gorder） */
function cmplCfgMoveGroup(fromG, beforeG){
  var order = cmplGroupOrder().slice(), fi = order.indexOf(fromG);
  if(fi < 0) return false;
  order.splice(fi, 1);
  var bi = beforeG ? order.indexOf(beforeG) : -1;
  if(bi < 0) order.push(fromG); else order.splice(bi, 0, fromG);
  if(!state.cmpl || typeof state.cmpl !== 'object') state.cmpl = { v: CMPL_SEED_V, items: null };
  state.cmpl.gorder = order;
  saveNow();
  return true;
}
/* 拖拽排序接线（条目与分组各一套；只允许同类互拖，避免误操作） */
var cmplCfgDrag = null;
/* ---- 拖动时左侧的顺序小窗：一行一项，拖到第 N 行即落到第 N 位
   mode='group' → 列分组顺序（拖起分组标题时）；mode='item' → 列「该条所属组」内的片段顺序（拖起条目卡时） ---- */
function cmplOrderRows(mode, val){
  var out = [], i;
  if(mode === 'group'){
    out = cmplGroupOrder().slice();
    return { rows: out, activeIdx: out.indexOf(val), cap: '分组顺序（拖到目标行即就位）', groupFilter: null };
  }
  var all = cmplActive(), g = null;
  for(i = 0; i < all.length; i++) if(all[i].key === val) g = all[i].group || '未分组';
  var rows = [], activeIdx = -1;
  for(i = 0; i < all.length; i++){
    if((all[i].group || '未分组') !== g) continue;
    if(all[i].key === val) activeIdx = rows.length;
    rows.push(all[i]);
  }
  return { rows: rows, activeIdx: activeIdx, cap: '「' + g + '」内顺序（拖到目标行即就位）', groupFilter: g };
}
function cmplOrderShow(mode, val){
  var pop = document.getElementById('cmplOrderPop');
  if(!pop) return;
  pop.innerHTML = '';
  var info = cmplOrderRows(mode, val), rows = info.rows, i;
  var cap = document.createElement('div');
  cap.className = 'cmpl-order-cap';
  cap.textContent = info.cap;
  pop.appendChild(cap);
  for(i = 0; i < rows.length; i++){
    (function(row0, idx){
      var isActive = (idx === info.activeIdx);
      var row = document.createElement('div');
      row.className = 'cmpl-order-row' + (isActive ? ' active' : '');
      row.dataset.idx = idx;
      row.dataset.key = (mode === 'group') ? row0 : row0.key;
      row.dataset.group = (mode === 'group') ? row0 : (row0.group || '未分组');
      var no = document.createElement('span'); no.className = 'cmpl-order-no'; no.textContent = (idx + 1);
      var tx = document.createElement('span'); tx.className = 'cmpl-order-tx';
      tx.textContent = (mode === 'group') ? row0 : (row0.label || '(未命名)');
      row.appendChild(no); row.appendChild(tx);
      if(!isActive){
        row.addEventListener('dragover', function(e){
          if(!cmplCfgDrag || cmplCfgDrag.mode !== mode) return;
          e.preventDefault(); e.dataTransfer.dropEffect = 'move';
          row.classList.add('over');
        });
        row.addEventListener('dragleave', function(){ row.classList.remove('over'); });
        row.addEventListener('drop', function(e){
          e.preventDefault(); row.classList.remove('over');
          var d = cmplCfgDrag;
          if(!d || d.mode !== mode) return;
          var ok = (mode === 'group') ? cmplCfgMoveGroupTo(d.val, idx) : cmplCfgMoveItemTo(d.val, idx);
          cmplCfgDrag = null;
          cmplOrderHide();
          if(ok){ renderCmplCfg(); toast('已排到第 ' + (idx + 1) + ' 位'); }
        });
      }
      pop.appendChild(row);
    })(rows[i], i);
  }
  /* 定位：默认贴在配置窗口左侧；左侧不够（窄屏）则贴窗口内左上 */
  var win = document.querySelector('#cmplCfgMask .tpl-win');
  var r = win ? win.getBoundingClientRect() : { left: 40, top: 80 };
  pop.classList.remove('hide');
  var pw = pop.offsetWidth, ph = pop.offsetHeight;
  var left = r.left - pw - 14;
  if(left < 12) left = Math.max(12, r.left + 12);
  var top = Math.min(Math.max(12, r.top + 60), Math.max(12, window.innerHeight - ph - 12));
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}
function cmplOrderHide(){
  var pop = document.getElementById('cmplOrderPop');
  if(pop){ pop.classList.add('hide'); pop.innerHTML = ''; }
}
/* 拖到顺序小窗的第 idx 位（数组插位语义）——组 */
function cmplCfgMoveGroupTo(fromG, idx){
  var order = cmplGroupOrder().slice(), fi = order.indexOf(fromG);
  if(fi < 0) return false;
  order.splice(fi, 1);
  if(idx < 0) idx = 0;
  if(idx > order.length) idx = order.length;
  order.splice(idx, 0, fromG);
  if(!state.cmpl || typeof state.cmpl !== 'object') state.cmpl = { v: CMPL_SEED_V, items: null };
  state.cmpl.gorder = order;
  saveNow();
  return true;
}
/* 拖到顺序小窗的第 idx 位——条目（保持在本组内，落到该组第 idx 位） */
function cmplCfgMoveItemTo(key, idx){
  var arr = cmplActive().slice(), fi = -1, i;
  for(i = 0; i < arr.length; i++) if(arr[i].key === key) fi = i;
  if(fi < 0) return false;
  var item = arr.splice(fi, 1)[0], g = item.group || '未分组';
  var pos = [];
  for(i = 0; i < arr.length; i++) if((arr[i].group || '未分组') === g) pos.push(i);
  var at;
  if(idx <= 0) at = pos.length ? pos[0] : arr.length;
  else if(idx >= pos.length) at = pos.length ? (pos[pos.length - 1] + 1) : arr.length;
  else at = pos[idx];
  arr.splice(at, 0, item);
  cmplSetItems(arr); saveNow();
  return true;
}
function cmplCfgDnd(el, type, val){
  el.draggable = true;
  el.addEventListener('dragstart', function(e){
    cmplCfgDrag = { mode: type, type: type, val: val };
    try{ e.dataTransfer.setData('text/plain', type + ':' + val); e.dataTransfer.effectAllowed = 'move'; }catch(err){}
    el.classList.add('dragging');
    cmplOrderShow(type, val);     /* 拖分组 → 列分组顺序；拖条目 → 列该组内片段顺序 */
  });
  el.addEventListener('dragend', function(){
    el.classList.remove('dragging');
    cmplCfgDrag = null;
    cmplOrderHide();
    var over = document.querySelectorAll('#cmplCfgBody .drag-over, #cmplOrderPop .over');
    for(var i = 0; i < over.length; i++) over[i].classList.remove('drag-over', 'over');
  });
  el.addEventListener('dragover', function(e){
    if(!cmplCfgDrag || cmplCfgDrag.type !== type || cmplCfgDrag.val === val) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', function(){ el.classList.remove('drag-over'); });
  el.addEventListener('drop', function(e){
    e.preventDefault();
    el.classList.remove('drag-over');
    var d = cmplCfgDrag;
    if(!d || d.type !== type) return;
    var ok = (type === 'group') ? cmplCfgMoveGroup(d.val, val) : cmplCfgMoveItem(d.val, val);
    cmplCfgDrag = null;
    if(ok){
      renderCmplCfg();
      toast(type === 'group' ? '已调整分组顺序' : '已调整片段顺序（跨组拖 = 改归组）');
    }
  });
}
function renderCmplCfg(){
  var body = document.getElementById('cmplCfgBody');
  if(!body) return;
  body.innerHTML = '';
  var all = cmplActive(), q = cmplCfgQ.toLowerCase(), shown = 0, gi, ii, g, gitems, it;
  /* 分组候选（编辑表单的 datalist） */
  var dl = document.getElementById('cmplCfgGroupList');
  if(dl){
    dl.innerHTML = '';
    cmplCfgGroups().forEach(function(g2){
      var o = document.createElement('option'); o.value = g2; dl.appendChild(o);
    });
  }
  var hint = document.createElement('div');
  hint.className = 'cmpl-cfg-hint';
  hint.innerHTML = '片段里可用 <b>${1} ${2}</b> 做槽位（上屏后 Tab 逐位跳）；素材绑定位照你的习惯手写 <b>@</b>。'
                 + '拖条目 <b>≡</b> 换位（拖到别的组 = 改归组），拖分组标题 <b>≡</b> 整组换位。';
  body.appendChild(hint);
  /* v7.8.1（Q7-P1-2）：内置风格包仍是中性示例时，给一条**非阻断**提示（一行字，不弹窗、不拦路） */
  if(!cmplHasAsset()){
    var ex = document.createElement('div');
    ex.className = 'cmpl-cfg-hint cmpl-cfg-hint-example';
    ex.innerHTML = '当前「风格包」是内置 <b>中性示例（请替换）</b>；点右下 <b>导入写作资产</b> 即可载入你自己的风格包（本机 <b>.json</b>、不走网络）。';
    body.appendChild(ex);
  }
  if(cmplCfgAdding) body.appendChild(cmplCfgForm(null));
  /* 按「组顺序」逐组渲染（组顺序 = cmplGroupOrder：配置里拖出来的顺序，候选气泡共用同一套） */
  var order = cmplGroupOrder();
  for(gi = 0; gi < order.length; gi++){
    g = order[gi];
    gitems = [];
    for(ii = 0; ii < all.length; ii++){
      if((all[ii].group || '未分组') !== g) continue;
      if(q){
        it = all[ii];
        if(((it.label || '') + ' ' + (it.body || '') + ' ' + (it.group || '')).toLowerCase().indexOf(q) < 0
           && cmplCfgEditing !== it.key) continue;
      }
      gitems.push(all[ii]);
    }
    var editingHere = false;
    for(ii = 0; ii < all.length; ii++) if(cmplCfgEditing === all[ii].key && (all[ii].group || '未分组') === g) editingHere = true;
    if(!gitems.length && !editingHere) continue;
    var gh = document.createElement('div');
    gh.className = 'cmpl-cfg-group';
    gh.dataset.group = g;
    var grip = document.createElement('span');
    grip.className = 'cmpl-cfg-grip';
    grip.textContent = '≡';
    grip.title = '拖动调整分组顺序';
    gh.appendChild(grip);
    var gtx = document.createElement('span');
    var total = 0;
    for(ii = 0; ii < all.length; ii++) if((all[ii].group || '未分组') === g) total++;
    gtx.textContent = g + '  ·  ' + total + ' 条';
    gh.appendChild(gtx);
    cmplCfgDnd(gh, 'group', g);
    body.appendChild(gh);
    for(ii = 0; ii < gitems.length; ii++){
      it = gitems[ii];
      if(cmplCfgEditing === it.key){ body.appendChild(cmplCfgForm(it)); }
      else{ body.appendChild(cmplCfgRow(it, ii)); }
      shown++;
    }
  }
  if(!shown){
    var em = document.createElement('div');
    em.className = 'tpl-empty';
    em.textContent = q ? '没有匹配的片段' : '片段库是空的（可「＋ 新增片段」或「恢复内置默认」）';
    body.appendChild(em);
  }
}
/* 只读行（可拖拽：拖到别的条目上 = 插到它前面；跨组拖 = 顺带改归组） */
function cmplCfgRow(it, idx){
  var row = document.createElement('div');
  row.className = 'cmpl-cfg-card';
  row.dataset.idx = idx;
  cmplCfgDnd(row, 'item', it.key);
  var head = document.createElement('div');
  head.className = 'cmpl-cfg-row';
  var lb = document.createElement('span');
  lb.className = 'cmpl-cfg-label';
  lb.textContent = it.label || '(未命名)';
  head.appendChild(lb);
  if(it.note){
    var nt = document.createElement('span');
    nt.className = 'cmpl-note';
    nt.textContent = it.note;
    head.appendChild(nt);
  }
  var pv = document.createElement('span');
  pv.className = 'cmpl-cfg-preview';
  pv.textContent = String(it.body || '').replace(/\s+/g, ' ').slice(0, 60);
  head.appendChild(pv);
  var ed = document.createElement('button');
  ed.className = 'tpl-block-op'; ed.textContent = '编辑'; ed.dataset.act = 'edit'; ed.dataset.key = it.key;
  var dl = document.createElement('button');
  dl.className = 'tpl-block-op danger'; dl.textContent = '删除'; dl.dataset.act = 'del'; dl.dataset.key = it.key;
  head.appendChild(ed); head.appendChild(dl);
  row.appendChild(head);
  return row;
}
/* 编辑/新增表单（it = null 表示新增） */
function cmplCfgForm(it){
  var isNew = !it;
  var src = it || { key: '', group: (cmplCfgGroups()[0] || '镜头句'), label: '', note: '', body: '', block: false };
  var card = document.createElement('div');
  card.className = 'cmpl-cfg-card editing';
  if(isNew) card.classList.add('adding');

  var r1 = document.createElement('div'); r1.className = 'cmpl-cfg-field';
  var gl = document.createElement('span'); gl.className = 'cmpl-cfg-fl'; gl.textContent = '分组';
  var gi = document.createElement('input'); gi.className = 'cmpl-cfg-input'; gi.id = 'cmplCfgGroupIn'; gi.value = src.group || '';
  gi.setAttribute('list', 'cmplCfgGroupList'); gi.placeholder = '如：镜头句 / 我的常用';
  r1.appendChild(gl); r1.appendChild(gi);

  var r2 = document.createElement('div'); r2.className = 'cmpl-cfg-field';
  var ll = document.createElement('span'); ll.className = 'cmpl-cfg-fl'; ll.textContent = '标签';
  var li = document.createElement('input'); li.className = 'cmpl-cfg-input'; li.id = 'cmplCfgLabelIn'; li.value = src.label || '';
  li.placeholder = '候选里显示的名字（也是搜索命中项）';
  var nl = document.createElement('span'); nl.className = 'cmpl-cfg-fl'; nl.textContent = '备注';
  var ni = document.createElement('input'); ni.className = 'cmpl-cfg-input'; ni.id = 'cmplCfgNoteIn'; ni.value = src.note || '';
  ni.placeholder = '可选，如「未用过」';
  r2.appendChild(ll); r2.appendChild(li); r2.appendChild(nl); r2.appendChild(ni);

  var bl = document.createElement('div'); bl.className = 'cmpl-cfg-fl'; bl.textContent = '内容';
  var bi = document.createElement('textarea'); bi.className = 'cmpl-cfg-body'; bi.id = 'cmplCfgBodyIn'; bi.spellcheck = false; bi.value = src.body || '';
  bi.placeholder = '上屏的原文；槽位写 ${1} ${2}';

  var op = document.createElement('div'); op.className = 'cmpl-cfg-ops';
  var ok = document.createElement('button'); ok.className = 'btn primary'; ok.id = 'cmplCfgSave'; ok.textContent = '保存';
  var cc = document.createElement('button'); cc.className = 'btn'; cc.id = 'cmplCfgCancel'; cc.textContent = '取消';
  op.appendChild(ok); op.appendChild(cc);

  card.appendChild(r1); card.appendChild(r2); card.appendChild(bl); card.appendChild(bi); card.appendChild(op);
  return card;
}
/* 读表单 → 写回用户表 */
function cmplCfgSave(){
  var gi = document.getElementById('cmplCfgGroupIn'), li = document.getElementById('cmplCfgLabelIn'),
      ni = document.getElementById('cmplCfgNoteIn'), bi = document.getElementById('cmplCfgBodyIn');
  if(!gi || !bi) return;
  var body = bi.value;
  if(!body.trim()){ toast('内容不能为空'); return; }
  var label = li.value.trim() || body.replace(/\s+/g, ' ').slice(0, 12);
  var arr = cmplActive().slice();
  if(cmplCfgAdding){
    arr.push({ key: cmplNewKey(), group: gi.value.trim() || '未分组', label: label, note: ni.value.trim(), body: body, block: false, src: 'user' });
    cmplCfgAdding = false;
  }else{
    for(var i = 0; i < arr.length; i++){
      if(arr[i].key === cmplCfgEditing){
        /* v7.8.1：改写后归为「我的」（asset 仍记 asset）——确保「恢复内置默认」不静默丢弃用户改动 */
        arr[i] = { key: arr[i].key, group: gi.value.trim() || '未分组', label: label, note: ni.value.trim(), body: body, block: !!arr[i].block, src: (arr[i].src === 'asset' ? 'asset' : 'user') };
        break;
      }
    }
    cmplCfgEditing = null;
  }
  cmplSetItems(arr);
  saveNow();
  renderCmplCfg();
  toast('已保存片段：' + label);
}
function cmplCfgDel(key){
  var before = cmplActive().slice(), gone = null;
  var arr = before.filter(function(x){ if(x.key === key){ gone = x; return false; } return true; });
  cmplSetItems(arr); saveNow(); renderCmplCfg();
  toast('已删除片段' + (gone ? '：' + (gone.label || '') : ''), { label: '撤销', fn: function(){ cmplSetItems(before); saveNow(); renderCmplCfg(); toast('已恢复片段'); } });
}
/* v7.8.1：是否已导入过写作资产（决定「仍是中性示例」提示是否出现） */
function cmplHasAsset(){
  var all = cmplActive(), i;
  for(i = 0; i < all.length; i++) if(all[i].src === 'asset') return true;
  return false;
}
/* v7.8.1「恢复内置默认」= 先确认（Q7-7）→ 丢 seed + 重注内置；**保留 asset/user**（绝不静默删用户资产） */
function cmplCfgResetAsk(){
  document.getElementById('modalTitle').textContent = '恢复内置默认？';
  var body = document.getElementById('modalBody');
  body.innerHTML = '';
  var p = document.createElement('div');
  p.className = 'modal-row';
  p.style.lineHeight = '1.7';
  p.textContent = '将丢弃你在内置示例上的改动，并重新注入内置片段库；你导入的写作资产与自建片段会保留。';
  body.appendChild(p);
  modalCb = function(){ cmplCfgReset(); };
  var mask = document.getElementById('modalMask');
  mask.style.zIndex = '12080';   /* 配置窗口同为 .modal-mask（z=11000），确认框需盖在其上 */
  mask.classList.remove('hide');
}
function cmplCfgReset(){
  var arr = cmplActive().slice(), kept = [], i;
  for(i = 0; i < arr.length; i++){ var s = arr[i].src; if(s === 'asset' || s === 'user') kept.push(arr[i]); }
  cmplSetItems(kept.concat(cmplSeedItems()));
  saveNow(); renderCmplCfg();
  toast('已恢复内置片段（保留你导入/自建的 ' + kept.length + ' 条）');
}
