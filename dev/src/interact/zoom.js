/* v6.9：画布缩放——Ctrl+滚轮以光标为基准（光标下内容不动），范围 25%~400%，每格 ×1.1 */
var ZOOM_MIN = 0.25, ZOOM_MAX = 4;
function zoomAt(cx, cy, factor){
  var cr = canvas.getBoundingClientRect();
  var mx = cx - cr.left, my = cy - cr.top;
  var s0 = state.zoom;
  var s1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s0 * factor));
  if(s1 === s0) return;
  var bx = (mx - state.pan.x) / s0;
  var by = (my - state.pan.y) / s0;
  state.pan.x = mx - bx * s1;
  state.pan.y = my - by * s1;
  state.zoom = s1;
  applyPan();
  updateZoomBtn();
  fixTextBlur();   /* v6.18：缩放后强制重绘（修复放大后文字模糊） */
  if(drag && !drag.ghost) updateDragTransform();   /* v7.3：虚影拖拽中真实块不动 */
  scheduleSave();
}
function updateZoomBtn(){
  var b = document.getElementById('btnZoom');
  if(!b) return;
  var txt = Math.round(state.zoom * 100) + '%';
  if(b.textContent === txt) return;
  b.textContent = txt;
  /* v7.1：数字变化 tick（动画期间不重播——连续滚轮缩放不闪） */
  if(!b.classList.contains('tick')){
    b.classList.add('tick');
    b.addEventListener('animationend', function(){ b.classList.remove('tick'); }, { once: true });
  }
}
function resetZoom(){
  if(state.zoom === 1) return;
  /* v7.3：恢复 100% 时保持画布位置——以视野中心为锚（中心处内容不动，pan 不归零） */
  var cr = canvas.getBoundingClientRect();
  var mx = cr.width / 2, my = cr.height / 2;
  var bx = (mx - state.pan.x) / state.zoom;   /* 视野中心处的画布坐标 */
  var by = (my - state.pan.y) / state.zoom;
  state.zoom = 1;
  state.pan.x = mx - bx;
  state.pan.y = my - by;
  panVel = null;
  panLooping = false;
  applyPan();
  updateZoomBtn();
  fixTextBlur();   /* v6.18：缩放后强制重绘（修复放大后文字模糊） */
  saveNow();
  toast('已恢复默认缩放 100%（画布位置保持）');
}
/* v6.18：缩放后强制重绘所有块（transform scale 下文本光栅化滞留会模糊，重绘后按新缩放渲染清晰） */
function fixTextBlur(){
  var cards = board.querySelectorAll('.block');
  if(!cards.length) return;
  for(var i = 0; i < cards.length; i++) cards[i].classList.add('rf');
  requestAnimationFrame(function(){
    for(var i = 0; i < cards.length; i++) cards[i].classList.remove('rf');
  });
}
/* v6.19：抢走画布焦点（独立窗口打开时防打字/方向键作用于背景画布） */
function blurActive(){
  var ae = document.activeElement;
  if(ae && typeof ae.blur === 'function' && ae !== document.body){ try{ ae.blur(); }catch(err){} }
}
