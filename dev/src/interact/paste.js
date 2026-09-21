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
  /* ★v7.18 修复「编辑器内 Ctrl+V 被画布抢占」：原判断**只列举三个容器 class**，而两个真正的编辑器
     ——「放大编辑」弹窗 #blkInput 与写作台 #wdInput —— 都落在 .blk-edit 内的 <textarea class="blk-input">，
     不在清单里 ⇒ 在编辑器里按 Ctrl+V 会落到本监听末尾 preventDefault() 并在画布新建块（内容没进编辑器）。
     改为「判断目标是否可编辑」（与 keys.js 的输入态口径一致）；因宿主/类名会随版本增删（v7.15 新增的
     #wdInput 就是这么漏掉的），故**不再依赖 class 名**，但与原三容器判断**取并集**：后者兜底非 textarea
     的输入/只读区（如 .sp-item 内的分区），二者互补、缺一不可。 */
  var t = e.target;
  var editable = !!(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable));
  var inLegacyHost = !!(t && t.closest && (t.closest('.block-text') || t.closest('.modal-body') || t.closest('.sp-item')));
  if(editable || inLegacyHost) return;   /* 编辑/输入场景保留原生粘贴 */
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
  var b = { id: uid(), text: txt.trim(), tag: '初' };   /* v7.21：新块默认标签「初」 */
  b.x = (-state.pan.x + (canvas.clientWidth / 2)) / state.zoom - (MIN_BLOCK_W / 2) + ((n % 5) - 2) * 20;
  b.y = (-state.pan.y + (canvas.clientHeight / 2)) / state.zoom - 60 + ((n % 5) - 2) * 16;
  state.blocks.push(b);
  render();
  popCard(board.querySelector('.block[data-id="' + b.id + '"]'));   /* v7：创建弹入 */
  saveNow();
  toast('已粘贴为块（' + b.text.length + ' 字符）');
});

/* 本模块对外面 = 空（自包含，无跨模块引用） */
PHJ.paste = {};
