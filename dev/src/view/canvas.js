/* ==================== view/canvas · 块渲染归属地 ====================
    buildCard/fitBlock/autoSizeAll + render() 编排；由 20-render.js + 62-block-size.js 合并。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
/* ---- 渲染 ---- */
var canvas, board;

function render(){
  canvas = document.getElementById('canvas');
  board = document.getElementById('board');
  board.innerHTML = '';
  var empty = canvas.querySelector('.empty');
  if(empty) empty.remove();
  if(!state.blocks.length){
    var e = document.createElement('div');
    e.className = 'empty';
    e.innerHTML = '双击画布空白处新增块<br><span>无限画布：拖块圆点摆放位置 ｜ 拖空白平移视角 ｜ 滚轮上下滑动 ｜ 方向键移动画布</span>';
    canvas.appendChild(e);
  }else{
    state.blocks.forEach(function(b){
      var card = buildCard(b);
      if(b.id === activeId) card.classList.add('active');   /* v6.17：操作置顶在重建后恢复 */
      board.appendChild(card);
    });
    autoSizeAll();
  }
  applyPan();
  updateZoomBtn();
  renderSplice();
  refreshSel();
  refreshOverlays();   /* v6.16：光点 + 光线 */
}
/* v6.1：多选高亮刷新（DOM 按 dataset.id 同步 .selected） */
/* ---- v6.16：拖手光点（被遮挡块） + 拼接光线（画布块 ↔ 拼接栏） ---- */

/* v6：边缘滚动已移除（滚轮上下滑动取代） */
function buildCard(b){
  var card = document.createElement('div');
  card.className = 'block' + (b.type === 'image' ? ' block-img' : '');
  card.dataset.id = b.id;
  card.style.left = b.x + 'px';
  card.style.top = b.y + 'px';

  /* v6.17：图片块 = 纯图片无拖手（完全无边框），直接按住图片拖动；删按钮左下角 hover 浮现 */
  if(b.type === 'image'){
    var img = document.createElement('img');
    img.className = 'block-img-el';
    img.src = b.img;
    img.draggable = false;
    card.style.width = b.iw + 'px';
    card.style.height = b.ih + 'px';
    var db = opBtn('删', 'del', true);
    db.classList.add('block-img-del');
    db.title = '删除该图片块';
    card.appendChild(img);
    card.appendChild(db);
    return card;
  }

  /* v6.15：拖手 = 顶部「拼」+ 中部拖点 + 底部「删」；复制/克隆等收进右键菜单 */
  var handle = document.createElement('div');
  handle.className = 'drag-handle';
  var sb = opBtn('拼', 'splice');
  sb.classList.add('handle-btn', 'splice');
  sb.title = '拼入拼接';
  /* v7.6：放大编辑 —— 打开独立 coding 编辑器窗口（单块语义） */
  var zb = opBtn('⤢', 'zoom');
  zb.classList.add('handle-btn', 'zoom');
  zb.title = '放大编辑（打开 coding 编辑器）';
  var grip = document.createElement('div');
  grip.className = 'handle-grip';
  grip.title = '拖动摆放';
  for(var k=0;k<6;k++) grip.appendChild(document.createElement('i'));
  var db = opBtn('删', 'del', true);
  db.classList.add('handle-btn');
  db.title = '删除该块';
  handle.appendChild(sb);
  handle.appendChild(zb);
  handle.appendChild(grip);
  handle.appendChild(db);

  var tx = document.createElement('textarea');
  tx.className = 'block-text';
  tx.spellcheck = false;
  tx.value = b.text || '';

  card.appendChild(handle);
  card.appendChild(tx);
  return card;
}
function opBtn(label, act, danger){
  var b = document.createElement('button');
  b.className = 'op-btn' + (danger ? ' danger' : '');
  b.dataset.act = act;
  b.textContent = label;
  return b;
}
/* textarea 随内容自动长高：全文展开，无内部滚动 */
function autoResize(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
/* v6：块宽自适应最长行（文本不自动换行，整行完整显示） */
var _mctx = null;
function textWidth(str){
  if(!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = '13.5px system-ui,-apple-system,"SF Pro Text","Segoe UI",Roboto,"Helvetica Neue","Microsoft YaHei",Arial,sans-serif';
  return _mctx.measureText(String(str).replace(/\t/g, '    ')).width;
}
function fitBlock(ta){
  var card = ta.closest('.block');
  if(!card) return;
  var maxW = 0;
  var lines = (ta.value || '').split('\n');
  for(var i = 0; i < lines.length; i++){
    var w = textWidth(lines[i]);
    if(w > maxW) maxW = w;
  }
  /* 文本宽 + textarea 左右 padding 12 + 块 padding 12 + 间隙 4 + 把手 18 + 侧栏按钮 46 + 安全余量 8 */
  var w = Math.ceil(maxW) + 100;
  card.style.width = Math.max(MIN_BLOCK_W, w) + 'px';
}
function autoSizeAll(){
  var tas = board.querySelectorAll('.block-text');
  for(var i = 0; i < tas.length; i++){
    autoResize(tas[i]);
    fitBlock(tas[i]);
  }
}
/* v6：一键整理：所有块从上到下左对齐排列（视角归零，看得到效果） */
function arrangeAll(){
  if(!state.blocks.length){ toast('画布是空的'); return; }
  state.blocks.sort(function(a, b){ return (a.y - b.y) || (a.x - b.x); });
  render();
  var cards = board.querySelectorAll('.block');
  /* v7：FLIP——记录旧视口位置（含 pan/zoom），更新坐标后从旧位滑到新位 */
  var from = [];
  for(var f = 0; f < cards.length; f++){
    var fr = cards[f].getBoundingClientRect();
    from.push({ x: fr.left, y: fr.top });
  }
  var cursorY = 20;
  for(var i = 0; i < cards.length; i++){
    var b = state.blocks[i];
    b.x = 20;
    b.y = cursorY;
    cards[i].style.left = '20px';
    cards[i].style.top = cursorY + 'px';
    cursorY += cards[i].offsetHeight + 24;
  }
  state.pan = { x: 0, y: 0 };
  applyPan();
  var z = state.zoom;
  for(var j = 0; j < cards.length; j++){
    var nr = cards[j].getBoundingClientRect();
    cards[j].style.transition = 'none';
    cards[j].style.transform = 'translate(' + ((from[j].x - nr.left) / z) + 'px,' + ((from[j].y - nr.top) / z) + 'px)';
  }
  void board.offsetHeight;   /* 强制 reflow 使初始位移生效 */
  for(var k = 0; k < cards.length; k++){
    cards[k].style.transitionDelay = (k * 8) + 'ms';   /* v7：错峰 8ms/块，防齐飞 */
    cards[k].style.transition = 'transform .32s cubic-bezier(.16,1,.3,1)';
    cards[k].style.transform = '';
  }
  setTimeout(function(){
    for(var m = 0; m < cards.length; m++){
      cards[m].style.transition = '';
      cards[m].style.transitionDelay = '';
      cards[m].style.transform = '';
    }
  }, 420 + cards.length * 8);
  saveNow();
  toast('已整理：' + cards.length + ' 块 自上而下左对齐');
}
function applyPan(){
  board.style.transform = 'translate(' + state.pan.x + 'px,' + state.pan.y + 'px) scale(' + state.zoom + ')';
  updateLinks();
  updatePeekDots();   /* v6.16：视角变化时光线/光点跟随 */
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.canvas = { applyPan, arrangeAll, autoResize, board, canvas, fitBlock, render, textWidth };
