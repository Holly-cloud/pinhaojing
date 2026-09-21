/* ==================== core/store · 唯一状态源 ====================
    持久 state（含 state.cmpl）+ 会话 ui（selected/drag/pan/keyState…）+ 默认值与坐标工具。
    （P2 收口 2026-09-16：文件按 manifest 模块划分重排；**仅换边界，未改任何语句**）
   ================================================================= */
var state = null;
var drag = null;      /* 块拖拽：{idx,startX,startY,origX,origY,lastX,lastY,el}；v6.1 支持 group 组拖 */
var panning = null;   /* 画布平移：{startX,startY,panX,panY,x,y} */
var panVel = null;    /* v6.1 画布平移惯性速度 */
var panLooping = false;
var panEndX = 0, panEndY = 0;   /* v6.1 惯性滑行终点（拖动最后目标，防过冲） */
var selected = [];    /* v6.1 多选：选中块 id 列表（内存态，刷新不保留） */
var MIN_BLOCK_W = 140;

/* ---- P3：会话态（**跨模块可见**的瞬时态收编于此；模块内部专用态仍留在各模块）---- */
/* 来源标注：keys（方向键平滑移动）/ modals（模板列表开合与当前模板）/ pointer（空格平移、拼模式） */
var spliceMode = false;
var keyDir = { x: 0, y: 0 }, keyVel = 0, keyLoop = false, keyLastT = 0;
var keyState = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
var tplOpen = false;
var tplCur = 0;
var spacePan = false;
/* v7.15：当前视图（会话态，**不持久**——刷新回默认「写作台」，不做「记忆上次视图」） */
var activeView = 'write';
   /* 空块/短行的最小块宽；块宽随最长行自适应（v6） */

function uid(){ return 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

/* v7.18（version 17）：多项目容器 —— 一个项目槽 = { id, title, blocks, pan, zoom, splice, collapsed }。
   顶层 live 字段（blocks/pan/zoom/splice/collapsed/title）是**活动项目槽的镜像引用**（同一对象），
   故所有既有消费方（canvas/write/splice/pointer/paste/keys/overlay）**零改动**。见 多项目_设计 §3。 */
function newProjectSlot(title){
  return {
    id: uid(),
    title: (typeof title === 'string' && title.trim()) ? title : '未命名项目',
    blocks: [],
    pan: { x: 0, y: 0 },
    zoom: 1,
    splice: { items: [], activeUnitId: null },
    collapsed: false
  };
}

function defaultState(){
  var slot = newProjectSlot('未命名分镜');   /* 迁移来的首个项目沿用原 title 口径；首启仍用示例名 */
  slot.blocks = [{
    id: uid(),
    text: '示例块：这是一段提示词——雨夜小巷，霓虹倒映在水洼里，镜头缓慢推近，侦探撑伞走来。\n\n第二段：角色停步回望，眼神警惕，雨水沿帽沿滑落。\n\n左键拖把手=移动位置；右键菜单或点「拼」可加入右侧拼接栏，按顺序拼成整条 prompt。',
    tag: '初',   /* v7.21：写作台标签（'初' | '补' | '' = 无）；仅写作界面消费，不影响画布 x/y 与拼接栏 */
    x: 20,
    y: 20,
    order: 0   /* v7.15：写作台大纲顺序（整数 ≥ 0；仅文本块；与画布 x/y 互不干扰） */
  }];
  return {
    app: 'storyboard-prompt-panel',
    version: 17,
    /* v7.8：补全片段库（items null = 用内置表；gorder = 分组顺序）
       v7.16：+ use —— 条目使用记录 { [hkey]: { n: 次数, t: 最近毫秒时间戳 } }（缺省 {}；随 sanitize/导出 JSON 走） */
    templates: [],
    cmpl: { v: 1, items: null, gorder: null, use: {} },
    /* ── 多项目容器 ── */
    activeProject: slot.id,
    projects: [slot],
    /* ── 活动项目的「活」镜像（与 slot 内字段**同一引用**） ── */
    blocks: slot.blocks,
    pan: slot.pan,
    zoom: slot.zoom,
    splice: slot.splice,
    collapsed: slot.collapsed,
    title: slot.title
  };
}

function gridPos(i){
  return { x: 20 + (i % 4) * 360, y: 20 + Math.floor(i / 4) * 150 };
}

/* v7.15：把文本块的 order 惰性归一为连续 0..N-1（仅文本块；图片块不分配 order）。
   规则与 persist.migrate 同源：有 order 的按 (order, y, x, i)，无 order 的按 (y, x, i) 排在后；
   仅「有块缺 order / 有重复 / 非 0..N-1 紧致」时才写回；发生变化返回 true（调用方决定落盘）。 */
function normalizeOrder(){
  if(!state || !Array.isArray(state.blocks)) return false;
  var list = [], i;
  for(i = 0; i < state.blocks.length; i++){
    var b = state.blocks[i];
    if(b && b.type !== 'image') list.push({ b: b, i: i });
  }
  list.sort(function(A, B){
    var a = A.b, c = B.b;
    var ao = (Number.isInteger(a.order) && a.order >= 0);
    var co = (Number.isInteger(c.order) && c.order >= 0);
    if(ao !== co) return ao ? -1 : 1;
    if(ao && a.order !== c.order) return a.order - c.order;
    if(a.y !== c.y) return a.y - c.y;
    if(a.x !== c.x) return a.x - c.x;
    return A.i - B.i;
  });
  var changed = false;
  for(i = 0; i < list.length; i++){ if(list[i].b.order !== i){ changed = true; break; } }
  if(changed){ for(i = 0; i < list.length; i++) list[i].b.order = i; }
  return changed;
}

/* ==================== v7.18：多项目容器（项目槽 + 活动镜像） ====================
   设计 多项目_设计_2026-09-19.md §3/§5。核心不变式：state.blocks === projects[active].blocks（同一引用）。
   风险（设计 §14-1）：pointer.js 的 bulkAction('del')/arrangeAll 等会**重新赋值** state.blocks（新数组）
   → 与项目槽「解链」。故 syncActiveProject() 在 saveNow()（落盘前）与 switchProject()（切换前）成对调用，
   幂等重连镜像引用，杜绝「改动只留在顶层、未回写项目槽」。 */

/* 按 id 找项目槽（找不到返回 null）。 */
function projectAt(id){
  if(!state || !Array.isArray(state.projects)) return null;
  for(var i = 0; i < state.projects.length; i++){ if(state.projects[i] && state.projects[i].id === id) return state.projects[i]; }
  return null;
}

/* 把顶层 live 字段**写回**活动项目槽，并（幂等）重连镜像引用。
   —— 必须先于 saveNow() 调用：否则「in-place 改块 / 重新赋值 blocks」的改动可能只在顶层、未进项目槽。 */
function syncActiveProject(){
  if(!state || !Array.isArray(state.projects) || !state.projects.length) return;
  var slot = projectAt(state.activeProject) || state.projects[0];
  state.activeProject = slot.id;
  slot.title = state.title;
  slot.blocks = state.blocks;
  slot.pan = state.pan;
  slot.zoom = state.zoom;
  slot.splice = state.splice;
  slot.collapsed = state.collapsed;
}

/* 载入目标项目槽为活动项目：activeProject=id；顶层 live ← 槽（**替换引用**，非拷贝）。 */
function loadProjectInto(id){
  var slot = projectAt(id);
  if(!slot) return false;
  state.activeProject = slot.id;
  state.title = slot.title;
  state.blocks = slot.blocks;
  state.pan = slot.pan;
  state.zoom = slot.zoom;
  state.splice = slot.splice;
  state.collapsed = slot.collapsed;
  return true;
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.store = { MIN_BLOCK_W, activeView, defaultState, drag, gridPos, keyDir, keyLastT, keyLoop, keyState, keyVel, loadProjectInto, newProjectSlot, normalizeOrder, panEndX, panEndY, panLooping, panVel, panning, projectAt, selected, spacePan, spliceMode, state, syncActiveProject, tplCur, tplOpen, uid };
