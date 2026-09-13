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
var spliceMode = false, dropUnitEl = null;
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
