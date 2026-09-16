
function isSel(id){ return selected.indexOf(id) >= 0; }
/* v6.3：Ctrl+左键点选多选（toggle：已选则取消） */
function toggleSel(card){
  if(!card) return;
  var i = state.blocks.findIndex(function(b){ return b.id === card.dataset.id; });
  if(i < 0) return;
  var id = state.blocks[i].id;
  var at = selected.indexOf(id);
  if(at >= 0){ selected.splice(at, 1); }else{ selected.push(id); }
  refreshSel();
}
function refreshSel(){
  var cards = board.querySelectorAll('.block');
  for(var i = 0; i < cards.length; i++){
    cards[i].classList.toggle('selected', isSel(cards[i].dataset.id));
  }
}
function clearSel(){ selected = []; refreshSel(); }
/* v6.1：批量操作（多选「新单体」：原本对单块的操作对选中集全部可用） */
function findBlockById(id){
  for(var j = 0; j < state.blocks.length; j++){ if(state.blocks[j].id === id) return state.blocks[j]; }
  return null;
}
function actIds(bi){
  /* v6.3：右键块在选中集内 → 批量作用于整个选中集；否则单块 */
  if(bi >= 0 && selected.length > 1 && isSel(state.blocks[bi].id)) return selected.slice();
  if(bi >= 0) return [state.blocks[bi].id];
  return [];
}
function bulkAction(act, ids){
  if(!ids.length) return;
  var lastNew = null;
  if(act === 'splice'){
    ids.forEach(function(id){ spliceAdd(id); });
    toast(ids.length > 1 ? '已加入拼接（' + ids.length + ' 块）' : '已加入拼接');
  }else if(act === 'copy'){
    var parts = ids.map(function(id){ var b = findBlockById(id); return (b && b.text) ? b.text.trim() : ''; }).filter(Boolean);   /* v6.16：图片块无文本，跳过 */
    if(!parts.length){ toast('所选块还没有内容'); return; }
    copyText(parts.join('\n\n')).then(function(ok){
      toast(ok ? (ids.length > 1 ? '已复制 ' + ids.length + ' 块（按序拼接）' : '已复制该块') : '复制失败，请手动全选复制');
    });
  }else if(act === 'clone'){
    var added = 0;
    for(var k = ids.length - 1; k >= 0; k--){   /* 从后往前插，索引不漂移 */
      var idx = state.blocks.findIndex(function(b){ return b.id === ids[k]; });
      if(idx < 0) continue;
      if(state.blocks[idx].type === 'image') continue;   /* v6.16：图片块不可克隆（仅展示） */
      var cp = JSON.parse(JSON.stringify(state.blocks[idx]));
      cp.id = uid();
      cp.x += 28; cp.y += 28;
      state.blocks.splice(idx + 1, 0, cp);
      lastNew = cp;
      added++;
    }
    toast('已克隆 ' + added + ' 块');
  }else if(act === 'strip-blank'){
    var done = 0;
    ids.forEach(function(id){
      var b = findBlockById(id);
      if(!b) return;
      var lines = (b.text || '').split('\n');
      var kept = lines.filter(function(l){ return l.trim() !== ''; });
      var v = kept.join('\n');
      if(v !== (b.text || '')){ b.text = v; done++; }
    });
    toast(done ? (done > 1 ? '已移除空行（' + done + ' 块）' : '已移除空行') : '所选块没有空行');
  }else if(act === 'del'){
      var snap = null;
      if(ids.length > 1) snap = JSON.parse(JSON.stringify({ blocks: state.blocks, splice: state.splice }));   /* 批量删除快照，可撤销 */
      /* v7：先播删除动画（110ms 收拢淡出），再真正移除——块「消失」有质感 */
      ids.forEach(function(id){
        var dc = board.querySelector('.block[data-id="' + id + '"]');
        if(dc) dc.classList.add('del-anim');
      });
      setTimeout(function(){
        spliceRemoveIds(ids);
        state.blocks = state.blocks.filter(function(b){ return ids.indexOf(b.id) < 0; });   /* v6.15 修复：v6.6 重构丢失画布块删除（此前「删除」仅移出拼接引用，块留在画布） */
        selected = [];
        render();
        if(snap){
          toast('已删除 ' + ids.length + ' 块', { label: '撤销', fn: function(){
            state.blocks = snap.blocks;
            state.splice = snap.splice;
            render();
            saveNow();
            toast('已恢复删除的块');
          }});
        }else{
          toast('已删除');
        }
        saveNow();
      }, 130);
      return;   /* v7：删除走动画分支自行收尾（render/saveNow 在动画后执行） */
    }
  selected = [];
  if(act === 'clone' || act === 'del' || act === 'strip-blank'){
    render();
    if(act === 'clone' && lastNew){
      var nc = board.querySelector('.block[data-id="' + lastNew.id + '"]');
      if(nc){ popCard(nc); var nt = nc.querySelector('.block-text'); if(nt) focusCaretEnd(nt); }   /* v7：克隆弹入 */
    }
  }else{
    refreshSel();
  }
  saveNow();
}
