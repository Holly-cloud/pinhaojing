var blkCb = null;
/* v7.15：本模块（弹窗编辑器接线）**固定弹窗宿主 hostPopup**——openBlockEditor/closeBlockEditor/fitBlkWidth
   全部走既有 DOM（#blkMask/#blkInput/.blk-win）与缺省宿主（highlight/complete 的 host 参数缺省 = hostPopup）。
   写作台右栏不经过本模块（由 view/write.js 直接驱动 hostDesk）。故本次**仅补注释，语句一行未改**。 */
function openBlockEditor(initial, cb){
  document.getElementById('blkInput').value = initial || '';
  blkCb = cb;
  cmplReset();     /* v7.8：清掉上一次的候选气泡与槽位状态 */
  document.getElementById('blkMask').classList.remove('hide');
  var ta = document.getElementById('blkInput');
  /* v7.6.1 修复：原先 ta.select() 会把整段提示词全选（v6.12 起的行为）——一打字整段就被替换，
     且与 v7.6 的彩色层叠加后选区显眼。改为「光标落文末、无选区」，与画布块内联编辑一致。 */
  focusCaretEnd(ta);
  fitBlkWidth();
  hlRefresh();     /* v7.6：打开即渲染着色/行号/状态栏 */
  hlSyncBox();     /* 光标落文末可能触发内部滚动 → 立即同步彩色层，避免一帧错位 */
}
/* v6.14：编辑窗口宽度自适应最长字行（canvas 测量，复用 textWidth；上限 94vw，下限 560px） */
function fitBlkWidth(){
  var win = document.querySelector('.blk-win');
  if(!win) return;
  /* v6.20：单行文本允许换行显示后，宽度固定不再按最长行撑宽（折行显示，普通编辑器体验） */
  win.style.width = Math.min(640, window.innerWidth * 0.94) + 'px';
}
function closeBlockEditor(){
  document.getElementById('blkMask').classList.add('hide');
  blkCb = null;
  cmplReset();     /* v7.8：关窗即清候选气泡与槽位状态 */
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.blockEditor = { blkCb, closeBlockEditor, fitBlkWidth, openBlockEditor };
