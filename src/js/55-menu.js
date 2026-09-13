/* ---- 命名模态框（v6：替代原生 prompt，headless/嵌入环境不可靠；v6.4 多字段通用版） ---- */
var modalCb = null;
function openModal(title, fields, cb){
  document.getElementById('modalTitle').textContent = title;
  var body = document.getElementById('modalBody');
  body.innerHTML = '';
  fields.forEach(function(f){
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
  __ctxBlock = -1;
});
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeCtxMenu(); });
