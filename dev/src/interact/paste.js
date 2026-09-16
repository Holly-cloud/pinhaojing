/* ==================== interact/paste · Ctrl+V 粘贴为块 ====================
    文本 / 图片粘贴入画布；由 90-boot.js 的粘贴部分拆出（函数提升 → 位置无关）。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
function addImageBlock(dataUrl, w, h){
  var n = state.blocks.length;
  var b = { id: uid(), type: 'image', img: dataUrl, iw: w, ih: h };
  b.x = (-state.pan.x + (canvas.clientWidth / 2)) / state.zoom - (w / 2) + ((n % 5) - 2) * 20;
  b.y = (-state.pan.y + (canvas.clientHeight / 2)) / state.zoom - (h / 2) + ((n % 5) - 2) * 16;
  state.blocks.push(b);
  render();
  popCard(board.querySelector('.block[data-id="' + b.id + '"]'));   /* v7：创建弹入 */
  saveNow();   /* 图片不落盘，其余数据照常保存 */
  toast('已粘贴为图片块（' + w + '×' + h + '）');
}

document.addEventListener('paste', function(e){
  if(e.target && e.target.closest && (e.target.closest('.block-text') || e.target.closest('.modal-body') || e.target.closest('.sp-item'))) return;   /* 编辑/输入场景保留原生粘贴 */
  var cd = e.clipboardData;
  if(cd && cd.items){
    var imgItem = null;
    for(var i = 0; i < cd.items.length; i++){
      var it = cd.items[i];
      if(it.type && it.type.indexOf('image/') === 0){ imgItem = it; break; }
    }
    if(imgItem){
      var f = imgItem.getAsFile();
      if(f){
        e.preventDefault();
        var rd = new FileReader();
        rd.onload = function(){
          var img = new Image();
          img.onload = function(){ addImageBlock(rd.result, img.naturalWidth, img.naturalHeight); };
          img.src = rd.result;
        };
        rd.readAsDataURL(f);
        return;
      }
    }
  }
  var txt = (cd && cd.getData('text/plain')) || '';
  if(!txt || !txt.trim()) return;
  e.preventDefault();
  var n = state.blocks.length;
  var b = { id: uid(), text: txt.trim() };
  b.x = (-state.pan.x + (canvas.clientWidth / 2)) / state.zoom - (MIN_BLOCK_W / 2) + ((n % 5) - 2) * 20;
  b.y = (-state.pan.y + (canvas.clientHeight / 2)) / state.zoom - 60 + ((n % 5) - 2) * 16;
  state.blocks.push(b);
  render();
  popCard(board.querySelector('.block[data-id="' + b.id + '"]'));   /* v7：创建弹入 */
  saveNow();
  toast('已粘贴为块（' + b.text.length + ' 字符）');
});
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.paste = { addImageBlock };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出）；本模块自包含，无对外面 */
PHJ.paste = {};
