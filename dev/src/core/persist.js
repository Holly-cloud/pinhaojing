/* ==================== core/persist · 存储 / 迁移 / 落盘 ====================
    localStorage 键与 version 契约的唯一持有者：migrate(v1→v14) / load / 防抖保存 / sanitize。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
var LS_KEY = 'storyboard-prompt-panel:v1';
var BACKUP_KEY = LS_KEY + ':backup';
var saveTimer = null;
var toastTimer = null;

function migrate(d){
  var blocks = d.blocks.filter(function(b){ return b && b.type !== 'image'; }).map(function(b, i){
    var pos = (typeof b.x === 'number' && typeof b.y === 'number') ? { x: b.x, y: b.y } : gridPos(i);
    return { id: b.id || uid(), text: b.text || '', x: pos.x, y: pos.y };
  });   /* v6.16：图片块仅会话内，防御性剔除（须在 map 前过滤——map 已剥离 type 字段） */
  var pan = (d.pan && typeof d.pan.x === 'number' && typeof d.pan.y === 'number') ? { x: d.pan.x, y: d.pan.y } : { x: 0, y: 0 };
  var ids = {};
  blocks.forEach(function(b){ ids[b.id] = 1; });
  /* v6.6：拼接栏条目化——平铺块条目 + 模板单元窗口条目；旧 order 平铺迁移为块条目（依旧平铺） */
  var spliceItems = [];
  if(d.splice && Array.isArray(d.splice.items)){
    spliceItems = d.splice.items.filter(function(it){
      if(it && it.type === 'unit') return typeof it.name === 'string' && Array.isArray(it.blockIds);
      return it && typeof it.id === 'string' && ids[it.id];
    }).map(function(it){
      if(it.type === 'unit'){
        return {
          type: 'unit', id: it.id || uid(), name: it.name,
          prefixes: Array.isArray(it.prefixes) ? it.prefixes.map(String).filter(Boolean) : [],
          suffixes: Array.isArray(it.suffixes) ? it.suffixes.map(String).filter(Boolean) : [],
          blockIds: it.blockIds.filter(function(bid){ return ids[bid]; })
        };
      }
      return { type: 'block', id: it.id };
    });
  }else if(Array.isArray(d.order)){
    spliceItems = d.order.filter(function(id){ return ids[id]; }).map(function(id){ return { type: 'block', id: id }; });
  }
  var lastUnitId = null;
  spliceItems.forEach(function(it){ if(it.type === 'unit') lastUnitId = it.id; });
  var activeUnitId = (d.splice && typeof d.splice.activeUnitId === 'string' && spliceItems.some(function(it){ return it.type === 'unit' && it.id === d.splice.activeUnitId; })) ? d.splice.activeUnitId : lastUnitId;
  /* v6.13（version 11）：模板 = 任意数量单元；单元 = 仅前缀值们 + 后缀值们（提示词块不是模板的一部分，中间为拼入容器）；模板名称移除（序号区分） */
  var templates = Array.isArray(d.templates) ? d.templates.filter(function(t){
    return t && typeof t === 'object';
  }).map(function(t){
    var units = [];
    if(Array.isArray(t.units) && t.units.length){
      units = t.units.filter(function(u){ return u && typeof u === 'object'; }).map(function(u){
        return {
          id: u.id || uid(),
          prefixes: Array.isArray(u.prefixes) ? u.prefixes.map(String).filter(Boolean) : [],
          suffixes: Array.isArray(u.suffixes) ? u.suffixes.map(String).filter(Boolean) : []
        };
      });
    }else{
      units = [{
        id: uid(),
        prefixes: Array.isArray(t.prefixes) ? t.prefixes.map(String).filter(Boolean) : (typeof t.prefix === 'string' && t.prefix ? [t.prefix] : []),
        suffixes: Array.isArray(t.suffixes) ? t.suffixes.map(String).filter(Boolean) : (typeof t.suffix === 'string' && t.suffix ? [t.suffix] : [])
      }];
    }
    return { id: t.id || uid(), units: units };
  }) : [];
  /* v7.8（version 13）：补全片段库 —— cmpl.items 缺省为 null（＝用内置表）；已物化用户表逐条校验；
     内置表版本升级（CMPL_SEED_V 变大）时把用户表里没有的新内置条目并进去（用户改过的不动）
     v7.8.1（version 14）：内置表边界变更，schema 未变 →
       `cmpl.items` **逐字原样保留**（仅补默认 src='user'，**绝不静默清除用户已有风格包**）；不 merge 新内置（CMPL_SEED_V 保持 1）。
     v7.8.2：撤回 v7.8.1「内置风格包降为中性示例」的处置（风格包即语料的一部分，已放回内置）；
       schema 未变 → version 仍 14、迁移口径不变。 */
  var cmplIn = (d.cmpl && typeof d.cmpl === 'object') ? d.cmpl : null;
  var cmpl = { v: (cmplIn && typeof cmplIn.v === 'number') ? cmplIn.v : CMPL_SEED_V, items: null, gorder: null };
  if(cmplIn && Array.isArray(cmplIn.items)){
    cmpl.gorder = Array.isArray(cmplIn.gorder) ? cmplIn.gorder.filter(function(x){ return typeof x === 'string'; }) : null;
    cmpl.items = cmplIn.items.filter(function(x){
      return x && typeof x.body === 'string';
    }).map(function(x){
      var s = (x.src === 'seed' || x.src === 'asset' || x.src === 'user') ? x.src : 'user';   /* 缺失/非法 → user（永不自动删） */
      return {
        key: (typeof x.key === 'string' && x.key) ? x.key : ('u_' + Math.random().toString(36).slice(2, 9)),
        group: typeof x.group === 'string' ? x.group : '',
        label: typeof x.label === 'string' ? x.label : '',
        note: typeof x.note === 'string' ? x.note : '',
        body: x.body,
        block: !!x.block,
        src: s
      };
    });
    if(cmpl.v < CMPL_SEED_V){
      var have = {};
      cmpl.items.forEach(function(x){ have[x.key] = 1; });
      cmplSeedItems().forEach(function(x){ if(!have[x.key]) cmpl.items.push(x); });
      cmpl.v = CMPL_SEED_V;
    }
  }
  return { app: 'storyboard-prompt-panel', version: 14, title: d.title || '未命名分镜', pan: pan, zoom: (typeof d.zoom === 'number' && d.zoom > 0 && d.zoom <= 4) ? d.zoom : 1, splice: { items: spliceItems, activeUnitId: activeUnitId }, collapsed: !!d.collapsed, templates: templates, cmpl: cmpl, blocks: blocks };
}

function load(){
  try{
    var raw = localStorage.getItem(LS_KEY);
    if(raw){
      var d = JSON.parse(raw);
      if(d && d.app === 'storyboard-prompt-panel' && Array.isArray(d.blocks)){
        state = migrate(d);
        document.title = '拼好镜';
        render();
        renderTplList();
        if(d.version < 14) saveNow();   /* v7.8.1：升到 14（内置表边界变更）时把规范化后的结构落盘 */
        return;
      }
    }
  }catch(e){}
  state = defaultState();
  document.title = '拼好镜';
  render();
  renderTplList();
  saveNow();
}

function scheduleSave(){ if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
function flush(){ if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; } saveNow(); }
/* v6.16：序列化前剔除图片块（图片块仅会话内存在，不落盘不导出） */
function sanitizeState(){
  var c = JSON.parse(JSON.stringify(state));
  c.blocks = (c.blocks || []).filter(function(b){ return b.type !== 'image'; });
  return c;
}
function saveNow(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(sanitizeState())); }
  catch(e){ toast('保存失败：' + e.message); }
}
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.persist = { BACKUP_KEY, LS_KEY, flush, load, migrate, sanitizeState, saveNow, saveTimer, scheduleSave, toastTimer };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出） */
PHJ.persist = { BACKUP_KEY, flush, load, migrate, sanitizeState, saveNow, scheduleSave, toastTimer };
