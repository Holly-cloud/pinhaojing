/* v6.17：方向键平滑移动画布（LOL 式：按住加速曲线、松手即停；镜头语义——按 → 视角右移，内容左移） */
/* v6.18：keyState 记录每个键真实状态、keyDir 派生——修复快速连按时 keyup 误清同轴另一键导致「冲突不动」；位移 ÷zoom（高缩放视觉速度恒定） */
var KEY_MAX_VEL = 900, KEY_ACCEL = 4200;   /* px/s：0.9 秒内加速到 900px/s 约 0.21s */
function updateKeyDir(){
  keyDir.x = (keyState.ArrowRight ? 1 : 0) - (keyState.ArrowLeft ? 1 : 0);
  keyDir.y = (keyState.ArrowDown ? 1 : 0) - (keyState.ArrowUp ? 1 : 0);
}
function keyPanLoop(t){
  if(!keyLoop) return;
  var dt = Math.min(0.05, (t - keyLastT) / 1000 || 0.016);
  keyLastT = t;
  if(!keyDir.x && !keyDir.y){ keyLoop = false; keyVel = 0; return; }   /* 全部松开立即停 */
  keyVel = Math.min(KEY_MAX_VEL, keyVel + KEY_ACCEL * dt);
  var v = keyVel * dt / state.zoom;   /* v6.18：÷zoom —— 高缩放时视觉速度恒定 */
  state.pan.x -= keyDir.x * v;
  state.pan.y -= keyDir.y * v;
  applyPan();
  scheduleSave();
  requestAnimationFrame(keyPanLoop);
}
document.addEventListener('keydown', function(e){
  var ae = document.activeElement;
  if(ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;   /* 输入场景豁免 */
  if(document.querySelector('.modal-mask:not(.hide)')) return;   /* v6.19：任何独立窗口打开时方向键不动画布（焦点兜底） */
  var k = e.key;
  if(k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight'){
    e.preventDefault();
    keyState[k] = true;
    updateKeyDir();
    if(!keyLoop){ keyLoop = true; keyLastT = performance.now(); requestAnimationFrame(keyPanLoop); }
  }
});
document.addEventListener('keyup', function(e){
  var k = e.key;
  if(k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight'){
    keyState[k] = false;   /* 只清该键——同轴另一键仍按着时方向保持 */
    updateKeyDir();
    /* v6.18：同轴反向抵消时循环已停（keyDir=0），恢复方向后要重启循环 */
    if(!keyLoop && (keyDir.x || keyDir.y)){ keyLoop = true; keyLastT = performance.now(); requestAnimationFrame(keyPanLoop); }
  }
});
window.addEventListener('blur', function(){ keyState.ArrowUp = keyState.ArrowDown = keyState.ArrowLeft = keyState.ArrowRight = false; updateKeyDir(); });
window.addEventListener('blur', function(){ closeCtxMenu(); });

/* ==================== P3：Escape 统一分发（显式层栈） ====================
   收编前：**8 处** document 级 Esc 处理器各自 `if(e.key==='Escape' && …)` 且互不阻断
           → 一次 Esc 可能同时关掉两层（例如配置窗与编辑器窗同开时会一起关）。
   收编后：**唯一** document 级 Esc 处理点 = 本函数；按「最上层优先」只关**一**层。
   层序（自顶向下，与视觉叠放一致）：右键菜单 → 补全配置窗 → 编辑器窗 → 模板预览 → 模板窗 → 拼模式。
   元素级处理器**保留**（它们在元素上 `stopPropagation`，优先于本分发器，语义更细）：
     · complete.js 的行内编辑框：Esc 先退组/关候选/退槽位；
     · boot.js 配置窗表单体 / 命名模态框体：Esc 退回列表 / 关模态框；
     · modals.js 模板窗输入框：Esc 退出编辑态。
   —— 这三类都在"输入焦点"内，本分发器收不到（被 stopPropagation 截住）→ 无双重关闭。 */
function closeTopLayer(){
  var visible = function(id){ var el = document.getElementById(id); return !!(el && !el.classList.contains('hide')); };
  var cm = document.getElementById('ctxMenu');
  if(cm && cm.classList.contains('open')){ closeCtxMenu(); return 'ctxMenu'; }
  if(visible('cmplCfgMask')){ closeCmplCfg(); return 'cmplCfg'; }
  if(visible('blkMask')){ closeBlockEditor(); return 'blockEditor'; }
  if(visible('tplPrevMask')){ document.getElementById('tplPrevMask').classList.add('hide'); return 'tplPrev'; }
  if(visible('tplMask')){ closeTplWin(); return 'tplWin'; }
  if(spliceMode){ toggleSpliceMode(false); return 'spliceMode'; }
  return null;
}
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  if(closeTopLayer()) e.preventDefault();
});
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.keys = { KEY_ACCEL, KEY_MAX_VEL, closeTopLayer, keyDir, keyLastT, keyLoop, keyPanLoop, keyState, keyVel, updateKeyDir };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出）；本模块自包含，无对外面 */
PHJ.keys = {};
