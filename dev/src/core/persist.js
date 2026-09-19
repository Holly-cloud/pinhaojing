/* ==================== core/persist · 存储 / 迁移 / 落盘 ====================
    localStorage 键与 version 契约的唯一持有者：migrate(v1→v17) / load / 防抖保存 / sanitize。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
var LS_KEY = 'storyboard-prompt-panel:v1';
var BACKUP_KEY = LS_KEY + ':backup';
var saveTimer = null;
var toastTimer = null;

/* ---- v7.18：migrate 及其辅助（块 / 拼接 / 模板 / 片段库），按项目逐槽归一 ----
   单项目路径（v16 及更老数据）与旧版逐字同源：helpers 是原 migrate 内联逻辑的**原样抽出**，
   只是把「一块数据」换成「一个项目槽的数据」→ 升级后观感/字段逐字承接（见 多项目_设计 §4.2）。 */

/* 模板归一（v6.13：模板 = 任意数量单元；单元 = 仅前缀值们 + 后缀值们；模板名称移除，序号区分） */
function migrateTemplates(dTemplates){
  return Array.isArray(dTemplates) ? dTemplates.filter(function(t){
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
}

/* 补全片段库归一（v7.8/v7.8.1/v7.8.2/v7.16 口径逐字保留）：
   cmpl.items 缺省为 null（＝用内置表）；已物化用户表逐条校验（**逐字原样保留**，仅补默认 src='user'）；
   `cmpl.use` 零丢失保留（忽略 n ≤ 0 的脏项，t 非法则置 0；与 items 解耦）。 */
function migrateCmpl(dCmpl){
  var cmplIn = (dCmpl && typeof dCmpl === 'object') ? dCmpl : null;
  var cmpl = { v: (cmplIn && typeof cmplIn.v === 'number') ? cmplIn.v : CMPL_SEED_V, items: null, gorder: null, use: {} };
  if(cmplIn && cmplIn.use && typeof cmplIn.use === 'object'){
    for(var uk in cmplIn.use){
      if(uk === '__proto__') continue;
      if(!Object.prototype.hasOwnProperty.call(cmplIn.use, uk)) continue;
      var u = cmplIn.use[uk];
      if(u && typeof u.n === 'number' && u.n > 0) cmpl.use[uk] = { n: u.n, t: (typeof u.t === 'number' ? u.t : 0) };
    }
  }
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
  return cmpl;
}

/* 块归一：v6.16 剔图片（须在 map 前过滤——map 已剥离 type 字段）；
   v7.15 块投影新增 order；hasOrd/ord/i 仅供随后排序定序用（不进最终块对象）；
   按「有 order 的在前（order, y, x, i）、无 order 的在后（y, x, i）」全序排序，再赋连续 order = 0..N-1。 */
function migrateBlocks(blocksIn){
  var blocks = (Array.isArray(blocksIn) ? blocksIn : []).filter(function(b){ return b && b.type !== 'image'; }).map(function(b, i){
    var pos = (typeof b.x === 'number' && typeof b.y === 'number') ? { x: b.x, y: b.y } : gridPos(i);
    return { id: b.id || uid(), text: b.text || '', x: pos.x, y: pos.y,
             hasOrd: (Number.isInteger(b.order) && b.order >= 0), ord: b.order, i: i };
  });
  blocks.sort(function(A, B){
    if(A.hasOrd !== B.hasOrd) return A.hasOrd ? -1 : 1;
    if(A.hasOrd && A.ord !== B.ord) return A.ord - B.ord;
    if(A.y !== B.y) return A.y - B.y;
    if(A.x !== B.x) return A.x - B.x;
    return A.i - B.i;
  });
  return blocks.map(function(z, k){ return { id: z.id, text: z.text, x: z.x, y: z.y, order: k }; });
}

/* 拼接栏归一：v6.6 条目化——平铺块条目 + 模板单元窗口条目；旧 order 平铺迁移为块条目（依旧平铺）。
   按**本项目**块 id 集合过滤（splice.items[].id / unit.blockIds 跨项目必失效 → 必须按项目隔离）。 */
function migrateSplice(spliceIn, orderIn, ids){
  var spliceItems = [];
  if(spliceIn && Array.isArray(spliceIn.items)){
    spliceItems = spliceIn.items.filter(function(it){
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
  }else if(Array.isArray(orderIn)){
    spliceItems = orderIn.filter(function(id){ return ids[id]; }).map(function(id){ return { type: 'block', id: id }; });
  }
  var lastUnitId = null;
  spliceItems.forEach(function(it){ if(it.type === 'unit') lastUnitId = it.id; });
  var activeUnitId = (spliceIn && typeof spliceIn.activeUnitId === 'string' && spliceItems.some(function(it){ return it.type === 'unit' && it.id === spliceIn.activeUnitId; })) ? spliceIn.activeUnitId : lastUnitId;
  return { items: spliceItems, activeUnitId: activeUnitId };
}

/* 单个项目源 → 项目槽（id/title/blocks/pan/zoom/splice/collapsed）；v16 老数据由 migrate 合成单源后走此路径。 */
function migrateOneProject(p){
  p = (p && typeof p === 'object') ? p : {};
  var blocks = migrateBlocks(p.blocks);
  var ids = {};
  blocks.forEach(function(b){ ids[b.id] = 1; });
  return {
    id: (typeof p.id === 'string' && p.id) ? p.id : uid(),
    title: (typeof p.title === 'string' && p.title) ? p.title : '未命名分镜',
    blocks: blocks,
    pan: (p.pan && typeof p.pan.x === 'number' && typeof p.pan.y === 'number') ? { x: p.pan.x, y: p.pan.y } : { x: 0, y: 0 },
    zoom: (typeof p.zoom === 'number' && p.zoom > 0 && p.zoom <= 4) ? p.zoom : 1,
    splice: migrateSplice(p.splice, p.order, ids),
    collapsed: !!p.collapsed
  };
}

function migrate(d){
  /* ① 跨项目共享字段：模板 / 片段库（含 use）—— 逐字沿用既有逻辑，保持全局 */
  var templates = migrateTemplates(d.templates);
  var cmpl = migrateCmpl(d.cmpl);

  /* ② 收集「项目源」列表：v17+ 文档有 projects[]；v16 及更老（无 projects）→ 合成**恰好一个**项目源，
        其 blocks/pan/zoom/splice/title/collapsed 取自顶层 live 字段，order 取旧顶层 order（v1..v5 兼容）
        ⇒ 单项目路径与旧版 migrate 输出逐字等价 → 升级后画布/视角/拼接/order 逐字承接（观感不变） */
  var srcs;
  if(Array.isArray(d.projects) && d.projects.length){
    srcs = d.projects;
  }else{
    srcs = [{ id: (typeof d.activeProject === 'string' && d.activeProject) ? d.activeProject : null,
              title: d.title, blocks: d.blocks, pan: d.pan, zoom: d.zoom,
              splice: d.splice, collapsed: d.collapsed, order: d.order }];
  }

  /* ③ 逐项目归一（复用同一套块/拼接逻辑；老数据 → 单项目） */
  var projects = srcs.map(migrateOneProject);

  /* ④ 活动项目 id：命中则用，否则落第一个 */
  var activeProject = projects[0].id;
  for(var i = 0; i < projects.length; i++){ if(projects[i].id === d.activeProject){ activeProject = d.activeProject; break; } }
  var act = projects[0];
  for(var j = 0; j < projects.length; j++){ if(projects[j].id === activeProject){ act = projects[j]; break; } }

  /* ⑤ 顶层镜像 = 活动项目（**同一引用**） */
  return { app: 'storyboard-prompt-panel', version: 17,
           templates: templates, cmpl: cmpl,
           activeProject: activeProject, projects: projects,
           blocks: act.blocks, pan: act.pan, zoom: act.zoom,
           splice: act.splice, collapsed: act.collapsed, title: act.title };
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
        if(d.version < 17) saveNow();   /* v7.15：升到 15 时补 order；v7.16：升到 16 时落盘 use 契约；v7.17：升到 17 时落多项目容器 */
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
/* v6.16：序列化前剔除图片块（图片块仅会话内存在，不落盘不导出）
   v7.18：多项目——**逐项目**也剔图片（顶层镜像与 projects[] 各存一份，两处都要净）。
   ★保留顶层镜像：不破坏 W4/W9 等读 `LS.blocks` 的既有断言（见设计 §14-12）。 */
function sanitizeState(){
  var c = JSON.parse(JSON.stringify(state));
  c.blocks = (c.blocks || []).filter(function(b){ return b.type !== 'image'; });
  if(Array.isArray(c.projects)){
    c.projects.forEach(function(p){
      if(p && Array.isArray(p.blocks)) p.blocks = p.blocks.filter(function(b){ return b.type !== 'image'; });
    });
  }
  return c;
}
function saveNow(){
  syncActiveProject();   /* ★v7.18：落盘前把 live 字段写回活动项目槽（幂等重连镜像，防「改动只在顶层未回写」） */
  try{ localStorage.setItem(LS_KEY, JSON.stringify(sanitizeState())); }
  catch(e){ toast('保存失败：' + e.message); }
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.persist = { BACKUP_KEY, flush, load, migrate, sanitizeState, saveNow, scheduleSave, toastTimer };
