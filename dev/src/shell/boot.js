
/* ---- 事件 ---- */
document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('btnArrange').addEventListener('click', arrangeAll);
  /* v6.16：顶栏简化——「导」= 导出/导入收纳下拉（复用自定义右键菜单） */
  document.getElementById('btnMenu').addEventListener('click', function(e){
    e.stopPropagation();   /* 阻止冒泡到 document（否则菜单刚开就被关） */
    var cm = document.getElementById('ctxMenu');
    if(cm.classList.contains('open')){ closeCtxMenu(); return; }
    var r = this.getBoundingClientRect();
    openCtxMenu([
      { label: '导出 JSON', act: 'export' },
      { label: '导入 JSON', act: 'import' }
    ], r.left, r.bottom + 6);
  });

  /* v6：左键双击画布空白处新增块（复用右键「在此处新增块」逻辑） */
  canvas.addEventListener('dblclick', function(e){
    if(e.target.closest('.block')) return;        /* 块内双击 = 文本选择/编辑 */
    if(e.target.closest('.splice-panel')) return; /* 侧边栏内不响应 */
    if(e.target.closest('.topbar')) return;
    addBlockHere(e.clientX, e.clientY);
  });

  /* v6：滚轮上下滑动画布（纵向平移视角）；v6.9：Ctrl+滚轮 = 缩放（以光标为基准） */
  canvas.addEventListener('wheel', function(e){
    e.preventDefault();
    if(e.ctrlKey){
      zoomAt(e.clientX, e.clientY, Math.pow(1.1, -e.deltaY / 120));
      return;
    }
    var dy = (e.deltaMode === 1) ? e.deltaY * 16 : e.deltaY;   /* 行模式换算为像素 */
    if(!dy) return;
    state.pan.y -= dy / state.zoom;   /* v6.9：缩放后滚动按视觉 1:1（画布坐标 /zoom） */
    applyPan();
    if(drag && !drag.ghost) updateDragTransform();   /* 拖拽中滚轮：pan 变，块补偿保持相对鼠标（v7.3：虚影拖拽中真实块不动） */
    scheduleSave();
  }, { passive: false });

  document.getElementById('btnZoom').addEventListener('click', resetZoom);

  var fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', function(){
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if(!f) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var d = JSON.parse(reader.result);
        if(!d || d.app !== 'storyboard-prompt-panel' || !Array.isArray(d.blocks)) throw new Error('bad');
        try{ localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); }catch(e){}
        state = migrate(d);
        document.title = '拼好镜';
        render();
        saveNow();
        toast('导入成功 · 原数据已备份', {label:'撤销', fn: undoImport});
      }catch(e2){
        toast('导入失败：不是有效的面板数据文件');
      }
    };
    reader.onerror = function(){ toast('读取文件失败'); };
    reader.readAsText(f, 'utf-8');
  });

  function undoImport(){
    try{
      var bk = localStorage.getItem(BACKUP_KEY);
      if(bk){ state = JSON.parse(bk); render(); saveNow(); toast('已恢复导入前的数据'); }
    }catch(e){}
  }

  /* ---- 拼接侧边栏事件（v4） ---- */
  document.getElementById('spCopy').addEventListener('click', copySpliced);
  document.getElementById('spClear').addEventListener('click', function(){ spliceClear(); toast('已清空拼接'); });
  document.getElementById('spFold').addEventListener('click', toggleCollapsed);
  /* 拼接栏模板（v6.5：模板定制窗口） */
  document.getElementById('spTplCustom').addEventListener('click', openTplWin);
  /* v6.18：拼模式开关 */
  document.getElementById('spSplice').addEventListener('click', function(){ toggleSpliceMode(); });
  document.getElementById('spTplFold').addEventListener('click', function(){
    tplOpen = !tplOpen;
    renderTplList();
  });
  /* 模板定制窗口（v6.12：模板 = 任意数量单元；新建单元按钮 + 下拉新建模板） */
  document.getElementById('tplNew').addEventListener('click', newUnit);
  document.getElementById('tplSelect').addEventListener('change', function(){
    var v = parseInt(this.value, 10);
    if(v === -1){ newTemplate(); return; }   /* 下拉「＋ 新建模板…」 */
    tplCur = v;
    renderTplWin();
  });
  document.getElementById('tplDone').addEventListener('click', closeTplWin);
  document.getElementById('tplMask').addEventListener('click', function(e){ if(e.target.id === 'tplMask') closeTplWin(); });
  /* v6.18：模板预览窗口 */
  document.getElementById('tplPrevClose').addEventListener('click', function(){ document.getElementById('tplPrevMask').classList.add('hide'); });
  document.getElementById('tplPrevMask').addEventListener('click', function(e){ if(e.target.id === 'tplPrevMask') document.getElementById('tplPrevMask').classList.add('hide'); });
  /* v6.12：提示词块编辑窗口事件 */
  document.getElementById('blkOk').addEventListener('click', function(){
    var cb = blkCb;
    var v = document.getElementById('blkInput').value;
    closeBlockEditor();
    if(cb) cb(v);
  });
  /* v6.14：输入时实时自适应宽度；v7.6：同步重渲染着色/行号/状态栏 */
  document.getElementById('blkInput').addEventListener('input', function(){ fitBlkWidth(); hlRefresh(); });
  /* v7.6：coding 编辑器事件（滚动同步 / 光标驱动状态栏与配对高亮 / 改高同步） */
  (function(){
    var ta = document.getElementById('blkInput');
    ta.addEventListener('scroll', hlSyncBox);
    ta.addEventListener('click', hlRefresh);
    ta.addEventListener('keyup', hlRefresh);
    ta.addEventListener('select', hlRefresh);
    ta.addEventListener('focus', hlRefresh);
    if(window.ResizeObserver) new ResizeObserver(hlSyncBox).observe(ta);
    window.addEventListener('resize', hlSyncBox);
  })();
  /* v6.15：编辑窗口内一键移除空行 */
  document.getElementById('blkStrip').addEventListener('click', function(){
    var ta = document.getElementById('blkInput');
    var lines = (ta.value || '').split('\n');
    var kept = lines.filter(function(l){ return l.trim() !== ''; });
    var v = kept.join('\n');
    if(v !== ta.value){ ta.value = v; fitBlkWidth(); hlRefresh(); toast('已移除空行'); }   /* v7.6：改值后重渲染 */
    else{ toast('没有空行可移除'); }
  });
  document.getElementById('blkCancel').addEventListener('click', closeBlockEditor);
  /* v7.8：补全配置窗口（片段库：浏览 / 修改 / 新增） */
  document.getElementById('btnCmpl').addEventListener('click', openCmplCfg);
  document.getElementById('cmplCfgSearch').addEventListener('input', function(){ cmplCfgQ = this.value.trim(); renderCmplCfg(); });
  document.getElementById('cmplCfgNew').addEventListener('click', function(){
    cmplCfgEditing = null; cmplCfgAdding = true; renderCmplCfg();
    var b = document.getElementById('cmplCfgBody'); if(b) b.scrollTop = 0;
    var i = document.getElementById('cmplCfgLabelIn'); if(i) i.focus();
  });
  document.getElementById('cmplCfgDone').addEventListener('click', closeCmplCfg);
  document.getElementById('cmplCfgReset').addEventListener('click', cmplCfgResetAsk);   /* v7.8.1：先确认再恢复（Q7-7） */
  /* v7.8.1：写作资产 导入 / 导出（本机文件、零网络） */
  document.getElementById('cmplCfgImport').addEventListener('click', function(){
    var f = document.getElementById('cmplAssetInput'); if(f) f.click();
  });
  document.getElementById('cmplCfgExport').addEventListener('click', function(){
    if(!cmplActive().length){ toast('片段库是空的，没有可导出的资产'); return; }
    cmplExportAsset(); toast('已导出写作资产文件（本机保存）');
  });
  document.getElementById('cmplAssetInput').addEventListener('change', function(){
    var inp = this, file = inp.files && inp.files[0];
    if(!file) return;
    cmplImportAsset(file, function(r){
      inp.value = '';
      if(r && r.ok){ toast('已导入写作资产（' + r.added + ' 条，共 ' + r.total + ' 条）'); renderCmplCfg(); }
      else{ toast('导入失败：' + ((r && r.error) || '未知错误')); }
    });
  });
  document.getElementById('cmplCfgMask').addEventListener('click', function(e){ if(e.target.id === 'cmplCfgMask') closeCmplCfg(); });
  document.getElementById('cmplCfgBody').addEventListener('click', function(e){
    var t = e.target;
    if(t.id === 'cmplCfgSave'){ cmplCfgSave(); return; }
    if(t.id === 'cmplCfgCancel'){ cmplCfgEditing = null; cmplCfgAdding = false; renderCmplCfg(); return; }
    var btn = t.closest ? t.closest('button[data-act]') : null;
    if(!btn) return;
    if(btn.dataset.act === 'edit'){
      cmplCfgAdding = false; cmplCfgEditing = btn.dataset.key; renderCmplCfg();
      var g = document.getElementById('cmplCfgGroupIn'); if(g){ g.focus(); g.select(); }
    }else if(btn.dataset.act === 'del'){
      cmplCfgDel(btn.dataset.key);
    }
  });
  /* 配置窗口内：Esc 退回列表（不关窗）；Ctrl/⌘+Enter 保存 */
  document.getElementById('cmplCfgBody').addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ e.stopPropagation(); cmplCfgEditing = null; cmplCfgAdding = false; renderCmplCfg(); return; }
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); cmplCfgSave(); }
  });
  document.getElementById('blkMask').addEventListener('click', function(e){ if(e.target.id === 'blkMask') closeBlockEditor(); });
  /* 命名模态框（v6/v6.4 多字段） */
  document.getElementById('modalOk').addEventListener('click', function(){
    var cb = modalCb;
    var vals = Array.prototype.slice.call(document.getElementById('modalBody').querySelectorAll('.modal-input')).map(function(i){ return i.value; });
    closeModal();
    if(cb) cb(vals);
  });
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalMask').addEventListener('click', function(e){ if(e.target.id === 'modalMask') closeModal(); });
  document.getElementById('modalBody').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ document.getElementById('modalOk').click(); }
    else if(e.key === 'Escape'){ closeModal(); }
  });

  /* v6.16：peek 置顶块鼠标离开 → 恢复原层级 */
  board.addEventListener('mouseout', function(e){
    var card = e.target && e.target.closest ? e.target.closest('.block.peek') : null;
    if(!card) return;
    var rt = e.relatedTarget;
    if(rt && rt.closest && rt.closest('.block') === card) return;   /* 仍在块内（子元素间移动） */
    peekBlock(card.dataset.id, false);
  });
  /* 块内输入（textarea 原生编辑，无任何干预） */
  board.addEventListener('input', function(e){
    if(e.target.classList && e.target.classList.contains('block-text')){
      var card = e.target.closest('.block');
      if(!card) return;
      bringToFront(card.dataset.id);   /* v6.17：编辑中的块置顶 */
      var b = findBlock(card.dataset.id);
      if(!b) return;
      b.text = e.target.value;
      autoResize(e.target);
      fitBlock(e.target);
      syncSpliceText(card.dataset.id);   /* v7.5：拼接栏同一条目文本即时同步 */
      updateLinks();                     /* 条目高度变化 → 光线端点跟随 */
      scheduleSave();
    }
  });
  /* 块操作 */
  board.addEventListener('click', function(e){
    var btn = e.target.closest('.op-btn');
    if(!btn) return;
    var card = btn.closest('.block');
    if(!card) return;
    var i = state.blocks.findIndex(function(b){ return b.id === card.dataset.id; });
    if(i < 0) return;
    var act = btn.dataset.act;
    /* v7.6：放大 → 打开 coding 编辑器窗口（单块语义，不参与多选批量；写回不 trim，与画布内联编辑一致） */
    if(act === 'zoom'){
      var bz = state.blocks[i];
      openBlockEditor(bz.text, function(v){
        bz.text = (v === undefined || v === null) ? '' : v;
        var tz = board.querySelector('.block[data-id="' + bz.id + '"] .block-text');
        if(tz){ tz.value = bz.text; autoResize(tz); fitBlock(tz); }
        syncSpliceText(bz.id);
        updateLinks();
        scheduleSave();
      });
      return;
    }
    /* v6.1：该块在多选集内 → 批量作用于整个选中集（「新单体」语义） */
    var ids = (selected.length > 1 && isSel(state.blocks[i].id)) ? selected.slice() : [state.blocks[i].id];
    bulkAction(act, ids);
  });
  function findBlock(id){
    for(var j=0;j<state.blocks.length;j++){ if(state.blocks[j].id === id) return state.blocks[j]; }
    return null;
  }
});

function exportName(){
  var base = '拼好镜';
  var d = new Date();
  function p(n){ return (n<10 ? '0' : '') + n; }
  return base + '_' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.json';
}
/* v6.16：导出 JSON（剔除图片块——仅会话内） */
function exportJSON(){
  var blob = new Blob([JSON.stringify(sanitizeState(), null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportName();
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('已导出 JSON');
}

/* v6.4：Ctrl+V 将剪贴板文本创建为 prompt 块（焦点不在输入区时生效，整段单块，视口中心错位摆放） */
/* v6.16：剪贴板含图片 → 创建图片块（按原始分辨率，仅会话内，不落盘不导出） */

window.addEventListener('beforeunload', flush);
document.addEventListener('visibilitychange', function(){ if(document.hidden) flush(); });

load();
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.boot = { exportJSON, exportName };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出） */
PHJ.boot = { exportJSON };
