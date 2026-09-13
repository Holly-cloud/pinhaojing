/* v6.1：画布移动粘滞感——拖动中平滑阻尼跟随 + 松手轻惯性缓停 */
var PAN_LERP = 0.32;     /* 阻尼系数：每帧向目标收敛比例（轻微滞后、有粘度） */
var PAN_FRICTION = 0.92; /* 惯性摩擦：每帧速度衰减（轻滑缓停） */
function panStep(){
  if(panning){
    var tx = panning.panX + (panning.lastX - panning.startX) / state.zoom;
    var ty = panning.panY + (panning.lastY - panning.startY) / state.zoom;
    panVel = { x: (tx - state.pan.x) * PAN_LERP, y: (ty - state.pan.y) * PAN_LERP };
    state.pan.x += panVel.x;
    state.pan.y += panVel.y;
    applyPan();
  }else if(panVel){
    /* 惯性滑行：沿最后速度滑行，但不越过拖动终点（避免甩动过冲） */
    var nx = state.pan.x + panVel.x;
    var ny = state.pan.y + panVel.y;
    var hitX = false, hitY = false;
    if((panVel.x > 0 && nx >= panEndX) || (panVel.x < 0 && nx <= panEndX)){ nx = panEndX; hitX = true; }
    if((panVel.y > 0 && ny >= panEndY) || (panVel.y < 0 && ny <= panEndY)){ ny = panEndY; hitY = true; }
    state.pan.x = nx;
    state.pan.y = ny;
    panVel.x *= PAN_FRICTION;
    panVel.y *= PAN_FRICTION;
    applyPan();
    if((hitX && hitY) || (Math.abs(panVel.x) < 0.4 && Math.abs(panVel.y) < 0.4)){
      panVel = null;
      panLooping = false;
      saveNow();          /* 惯性结束才落盘 pan */
      return;
    }
  }else{
    panLooping = false;
    return;
  }
  requestAnimationFrame(panStep);
}
function focusCaretEnd(el){
  el.focus();
  if(typeof el.selectionStart === 'number'){ el.selectionStart = el.selectionEnd = el.value.length; }
}

/* ---- 交互：块拖拽 + 画布平移 ---- */
/* v7.5：按住空格 + 左键拖动 = 平移画布（等价中键；文字编辑/独立窗口场景豁免，UI 区域不接管） */
var spacePan = false;
document.addEventListener('keydown', function(e){
  if(e.key !== ' ' && e.code !== 'Space') return;
  var ae = document.activeElement;
  if(ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;   /* 文字编辑状态：空格就是空格 */
  if(document.querySelector('.modal-mask:not(.hide)')) return;   /* 独立窗口打开时豁免 */
  e.preventDefault();   /* 阻止空格默认行为（滚动/激活聚焦按钮） */
  if(!spacePan){ spacePan = true; document.body.classList.add('space-pan'); }
});
document.addEventListener('keyup', function(e){
  if(e.key !== ' ' && e.code !== 'Space') return;
  if(spacePan){ spacePan = false; document.body.classList.remove('space-pan'); }
});
