var blkCb = null;
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
