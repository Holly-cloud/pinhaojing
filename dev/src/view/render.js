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
