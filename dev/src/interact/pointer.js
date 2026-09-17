/* ==================== interact/pointer · 指针手势路由 ====================
    多选 / 缩放 / 平移 / 拖拽；由 30-selection + 64-zoom + 66-pan + 68-drag 合并。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */

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

window.addEventListener('blur', function(){ if(spacePan){ spacePan = false; document.body.classList.remove('space-pan'); } });
function onMouseDown(e){
  /* v6.17：鼠标中键按下 = 全局平移视角（不论鼠标在哪里） */
  if(e.button === 1){
    e.preventDefault();   /* 阻止浏览器 autoscroll */
    panStart(e.clientX, e.clientY);
    return;
  }
  /* v7.5：空格 + 左键 = 平移（画布区域含块上；顶栏/拼接栏/菜单/窗口等 UI 区域不接管，保证按钮正常） */
  if(e.button === 0 && spacePan){
    if(!e.target.closest('.topbar') && !e.target.closest('.splice-panel') && !e.target.closest('.ctx-menu') && !e.target.closest('.modal-mask')){
      e.preventDefault();
      panStart(e.clientX, e.clientY);
      return;
    }
  }
  /* v6.17：最近被点击/编辑过的块置顶（遮挡关系受操作记录影响）；右键弹菜单也计入 */
  var mCard = e.target.closest('.block');
  if(mCard && (e.button === 0 || e.button === 2)) bringToFront(mCard.dataset.id);
  /* v6.3：Ctrl+左键点块 = 多选 toggle（任意位置含把手/textarea；不启动拖拽/编辑） */
  if(e.button === 0 && e.ctrlKey){
    var tCard = e.target.closest('.block');
    if(tCard){
      toggleSel(tCard);
      e.preventDefault();
      return;
    }
  }
  var handle = e.target.closest('.handle-grip') || e.target.closest('.block-img-el');   /* v6.17：图片块无拖手 → 直接按图拖动 */
  if(handle){
    if(e.button !== 0) return;   /* v6.8：右键拖拽拼入手势已移除（浏览器鼠标手势劫持右键划动）；右键=弹菜单 */

    var card = handle.closest('.block');
    var idx = state.blocks.findIndex(function(b){ return b.id === card.dataset.id; });
    if(idx < 0) return;
    /* v6.1：该块在选中集内 → 组拖（整组一起动）；否则单选该块并重置选择 */
    var group = (isSel(state.blocks[idx].id) && selected.length > 1) ? selected.slice() : null;
    if(!group){ selected = [state.blocks[idx].id]; refreshSel(); }
    /* v7.3：拼模式（文本块）= 拖动「虚影」到单元——源块位置不动，光线连接二者；图片块不可拼入，仍走普通拖拽 */
    if(spliceMode && !card.classList.contains('block-img')){
      drag = { idx: idx, group: group, startX: e.clientX, startY: e.clientY, origX: state.blocks[idx].x, origY: state.blocks[idx].y, basePanX: state.pan.x, basePanY: state.pan.y, baseZoom: state.zoom, el: card, els: [], offsets: [], ghost: true, lastX: e.clientX, lastY: e.clientY };
      if(group){
        group.forEach(function(id){
          var gb = findBlockById(id);
          if(!gb) return;
          drag.els.push(board.querySelector('.block[data-id="' + id + '"]'));
          drag.offsets.push({ x: gb.x - state.blocks[idx].x, y: gb.y - state.blocks[idx].y });
        });
      }
      var cr0 = card.getBoundingClientRect();
      ghostOffX = e.clientX - cr0.left;
      ghostOffY = e.clientY - cr0.top;
      ghostSrcId = state.blocks[idx].id;
      ghostEl = createGhost(card);
      moveGhost(e.clientX, e.clientY);
      card.classList.add('splice-src');
      updateLinks();
      updateDropTarget(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    drag = { idx: idx, group: group, startX: e.clientX, startY: e.clientY, origX: state.blocks[idx].x, origY: state.blocks[idx].y, basePanX: state.pan.x, basePanY: state.pan.y, baseZoom: state.zoom, el: card, els: [], offsets: [] };
    if(group){
      group.forEach(function(id){
        var b = findBlockById(id);
        if(!b) return;
        drag.els.push(board.querySelector('.block[data-id="' + id + '"]'));
        drag.offsets.push({ x: b.x - state.blocks[idx].x, y: b.y - state.blocks[idx].y });
      });
    }
    /* v7.2：拖拽跟手——拖拽中禁过渡（CSS .block.drag + inline 双保险；v7.1 曾清空 inline 导致 CSS 的 transform 过渡继续拖慢拖拽，实测滞后 115px/150px）
       同时移除一次性动画类（pop-in/suck 的 animation 会覆盖跟手 transform），清 FLIP 残留 delay */
    card.style.transition = 'none'; card.style.transitionDelay = '0ms';
    card.classList.remove('pop-in', 'suck');
    if(group){
      for(var gc = 0; gc < drag.els.length; gc++){
        var gce = drag.els[gc];
        if(gce){ gce.style.transition = 'none'; gce.style.transitionDelay = '0ms'; gce.classList.remove('pop-in', 'suck'); }
      }
    }
    card.classList.add('drag');
    e.preventDefault();
    return;
  }
  if(e.button !== 0) return;   /* 空白右键留给 contextmenu */
  if(e.target.closest('.block')) return;   /* 块内（非把手）不响应：保留文本编辑 */
  if(e.target.closest('.splice-panel')) return;  /* 侧边栏内不启动平移（拼接排序拖拽由自身处理） */
  if(e.target.closest('.ctx-menu')) return;  /* v6.1：右键菜单项按下不清空多选（否则批量操作先失去选中集） */
  if(e.target.closest('.modal-mask')) return;  /* v6.19：独立窗口内不启动画布平移/不抢焦点——否则点击窗口输入框失焦无法编辑、模板窗口单元拖动被 panning 吞掉（dragstart 不触发） */
  if(selected.length){ selected = []; refreshSel(); }   /* v6.1：点空白清空多选 */
  /* 点空白：先取消所有输入焦点（textarea/标题框），再启动平移 */
  var ae = document.activeElement;
  if(ae && typeof ae.blur === 'function' && ae !== document.body){ try{ ae.blur(); }catch(err){} }
  panStart(e.clientX, e.clientY);
  e.preventDefault();
}
/* v6.18：拼模式——拖动任意提示词块到拼接栏任意单元，松手即拼入 */
var dropUnitEl = null;   /* P3：spliceMode 已收编进 core/store.js（跨模块可见） */
function toggleSpliceMode(on){
  spliceMode = (on !== undefined) ? on : !spliceMode;
  document.getElementById('spSplice').classList.toggle('active', spliceMode);
  clearDropTarget();
  destroyGhost();   /* v7.3：退出/切换拼模式时清理虚影与源块标记 */
  toast(spliceMode ? '拼模式：拖动提示词块到右侧任意单元，松手即拼入（再按「拼」或 Esc 退出）' : '已退出拼模式');
}
function clearDropTarget(){
  if(dropUnitEl){ dropUnitEl.classList.remove('drop-target'); dropUnitEl = null; }
}
function updateDropTarget(x, y){
  if(!spliceMode){ clearDropTarget(); return; }
  var el = document.elementFromPoint(x, y);
  var u = el && el.closest ? el.closest('.sp-unit') : null;
  if(u !== dropUnitEl){
    clearDropTarget();
    if(u){ u.classList.add('drop-target'); dropUnitEl = u; }
  }
}
/* v7.5：拼接栏条目文本与画布块保持一致（画布内联编辑即时同步；不重建整栏，避免滚动位置/动画被打断） */
function syncSpliceText(bid){
  var b = findBlockById(bid);
  if(!b) return;
  var els = document.querySelectorAll('.sp-item[data-id="' + bid + '"] .sp-text, .sp-ublock[data-id="' + bid + '"] .sp-ub-text');
  for(var i = 0; i < els.length; i++) els[i].textContent = b.text || '(空块)';
}
/* v7.3：拼模式虚影——拖动「提示词块的虚影」到单元，源块位置不动；渐变光线实时连接源块与虚影 */
var ghostEl = null, ghostSrcId = null, ghostOffX = 0, ghostOffY = 0;
function createGhost(card){
  var g = card.cloneNode(true);
  g.className = 'block block-ghost';
  /* v7.4 修复：cloneNode 会连原块的 inline 定位样式（left/top = 画布坐标）一起复制，
     而 inline 优先级高于 CSS 类的 left:0 → 虚影整体错位（实测偏差 ≈ 块坐标值）。
     必须显式归零/清空这些继承来的 inline 属性。 */
  g.style.left = '0px';
  g.style.top = '0px';
  g.style.transform = '';
  g.style.transition = 'none';
  g.style.transitionDelay = '0ms';
  g.style.width = card.offsetWidth + 'px';
  g.style.height = card.offsetHeight + 'px';
  var src = card.querySelector('.block-text'), dst = g.querySelector('.block-text');
  if(src && dst){ dst.value = src.value; dst.setAttribute('readonly', ''); }   /* cloneNode 不复制用户输入的 value */
  document.body.appendChild(g);
  return g;
}
function moveGhost(x, y){
  if(!ghostEl) return;
  ghostEl.style.transform = 'translate(' + Math.round(x - ghostOffX) + 'px,' + Math.round(y - ghostOffY) + 'px)';
}
function destroyGhost(){
  if(ghostEl){ ghostEl.remove(); ghostEl = null; }
  ghostSrcId = null;
  var ss = document.querySelectorAll('.splice-src');
  for(var i = 0; i < ss.length; i++) ss[i].classList.remove('splice-src');
  updateLinks();
}
/* v6.18：拼模式投放（mouseup 在单元上 → 拼入该单元） */
function spliceDropAt(x, y, ids){
  if(!spliceMode || !ids || !ids.length) return;
  var el = document.elementFromPoint(x, y);
  var ue = el && el.closest ? el.closest('.sp-unit') : null;
  if(!ue) return;
  var unit = state.splice.items.find(function(it){ return it.type === 'unit' && it.id === ue.dataset.id; });
  if(!unit) return;
  var added = 0;
  var addedIds = [];   /* v7：动效目标 = 本次实际加入的块 */
  ids.forEach(function(id){
    var b = findBlockById(id);
    if(!b || b.type === 'image') return;   /* 图片块不可拼入 */
    if(unit.blockIds.indexOf(id) < 0){ unit.blockIds.push(id); added++; addedIds.push(id); }
  });
  clearDropTarget();
  if(added){
    renderSplice(addedIds);   /* v7：光线生长 */
    addedIds.forEach(function(id){ suckBlock(id); popSpliceEntry(id); });   /* v7：吸入 + 条目弹入 */
    saveNow();
    toast('已拼入' + (added > 1 ? ' ' + added + ' 块到' : '') + '单元 ' + (state.splice.items.indexOf(unit) + 1));
  }
}
/* v6.17：平移启动（拖空白 / 中键拖动共用） */
function panStart(clientX, clientY){
  panning = { startX: clientX, startY: clientY, panX: state.pan.x, panY: state.pan.y, x: state.pan.x, y: state.pan.y, lastX: clientX, lastY: clientY };
  canvas.classList.add('panning');
}
/* v6.9：拖拽位移统一换算——client 位移 /zoom 得画布坐标；pan/zoom 变化自动补偿（块保持相对鼠标，滚轮滚动/缩放期间不脱离） */
function dragOffset(){
  return {
    x: (drag.lastX - drag.startX + drag.basePanX + drag.origX * drag.baseZoom - state.pan.x) / state.zoom - drag.origX,
    y: (drag.lastY - drag.startY + drag.basePanY + drag.origY * drag.baseZoom - state.pan.y) / state.zoom - drag.origY
  };
}
function updateDragTransform(){
  if(!drag) return;
  var d = dragOffset();
  if(drag.group){
    for(var gi = 0; gi < drag.els.length; gi++){
      var ge = drag.els[gi];
      if(ge) ge.style.transform = 'translate(' + (d.x + drag.offsets[gi].x) + 'px,' + (d.y + drag.offsets[gi].y) + 'px) scale(1.02)';   /* v7.1：lift */
    }
  }else{
    drag.el.style.transform = 'translate(' + d.x + 'px,' + d.y + 'px) scale(1.02)';   /* v7.1：lift（跟手无过渡） */
  }
}
function onMouseMove(e){
  if(drag){
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if(drag.ghost){   /* v7.3：虚影跟随（源块不动），光线/高亮实时刷新 */
      moveGhost(e.clientX, e.clientY);
      updateLinks();
      updatePeekDots();
      updateDropTarget(e.clientX, e.clientY);
      return;
    }
    updateDragTransform();
    updateLinks();
    updatePeekDots();
    updateDropTarget(e.clientX, e.clientY);   /* v6.18：拼模式单元高亮跟随 */
    return;
  }
  if(panning){
    panning.lastX = e.clientX;
    panning.lastY = e.clientY;
    if(!panLooping){ panLooping = true; requestAnimationFrame(panStep); }   /* 阻尼循环接管 transform */
  }
}
function onMouseUp(e){
  if(drag){
    if(drag.ghost){   /* v7.3：虚影投放——源块位置不变；落单元则拼入（spliceDropAt 内部 saveNow） */
      var gids = drag.group ? drag.group.slice() : [state.blocks[drag.idx].id];
      var glx = (typeof drag.lastX === 'number') ? drag.lastX : drag.startX;
      var gly = (typeof drag.lastY === 'number') ? drag.lastY : drag.startY;
      destroyGhost();
      drag = null;
      spliceDropAt(glx, gly, gids);
      return;
    }
    var lx = (typeof drag.lastX === 'number') ? drag.lastX : drag.startX;
    var ly = (typeof drag.lastY === 'number') ? drag.lastY : drag.startY;
    var gdx = (lx - drag.startX + drag.basePanX + drag.origX * drag.baseZoom - state.pan.x) / state.zoom - drag.origX;
    var gdy = (ly - drag.startY + drag.basePanY + drag.origY * drag.baseZoom - state.pan.y) / state.zoom - drag.origY;   /* v6.9：/zoom 换算 + pan/zoom 补偿并入落点 */
    if(drag.group){
      drag.group.forEach(function(id, gi){
        var gb = findBlockById(id);
        if(!gb) return;
        gb.x += gdx;
        gb.y += gdy;
        var ge = drag.els[gi];
        if(ge){
          ge.style.transform = '';
          ge.style.left = gb.x + 'px';
          ge.style.top = gb.y + 'px';
          void ge.offsetWidth;              /* v7.2：先以「无过渡」状态提交最终位置 */
          ge.style.transition = '';          /* 再恢复 CSS 过渡（属性无变化 → 不触发回弹动画） */
          ge.style.transitionDelay = '';
        }
      });
    }else{
      var b = state.blocks[drag.idx];
      b.x = drag.origX + gdx;
      b.y = drag.origY + gdy;
      drag.el.style.transform = '';
      drag.el.style.left = b.x + 'px';
      drag.el.style.top = b.y + 'px';
      void drag.el.offsetWidth;              /* v7.2：先以「无过渡」状态提交最终位置 */
      drag.el.style.transition = '';          /* 再恢复 CSS 过渡（属性无变化 → 不触发回弹动画） */
      drag.el.style.transitionDelay = '';
    }
    drag.el.classList.remove('drag');
    spliceDropAt(lx, ly, drag.group ? drag.group.slice() : [state.blocks[drag.idx].id]);   /* v6.18：拼模式投放（在 drag 置空前取 ids） */
    drag = null;
    saveNow();
    return;
    }
  if(panning){
    /* v6：位移 <4px 视为「点击空白」（取消焦点/双击新增块），不产生平移 */
    var tdx = panning.lastX - panning.startX;
    var tdy = panning.lastY - panning.startY;
    if(Math.abs(tdx) < 4 && Math.abs(tdy) < 4){
      panVel = null;
      panLooping = false;
    }else{
      /* v6.1：有位移 → 视觉已由阻尼循环跟随；记录惯性终点（不越过），松手后惯性滑行或立即落盘 */
      panEndX = panning.panX + tdx / state.zoom;   /* v6.9：client 位移换算画布坐标（/zoom） */
      panEndY = panning.panY + tdy / state.zoom;
      if(!panVel || (Math.abs(panVel.x) < 1.2 && Math.abs(panVel.y) < 1.2)){
        panVel = null;
        panLooping = false;
        saveNow();
      }
    }
    canvas.classList.remove('panning');
    panning = null;
  }
}
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.pointer = { actIds, blurActive, bulkAction, findBlockById, focusCaretEnd, ghostEl, ghostSrcId, isSel, refreshSel, resetZoom, syncSpliceText, toggleSpliceMode, updateDragTransform, updateZoomBtn, zoomAt };
