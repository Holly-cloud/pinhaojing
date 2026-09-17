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
   /* 空块/短行的最小块宽；块宽随最长行自适应（v6） */

function uid(){ return 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function defaultState(){
  return {
    app: 'storyboard-prompt-panel',
    version: 14,
    zoom: 1,
    title: '未命名分镜',
    pan: { x: 0, y: 0 },
    splice: { items: [], activeUnitId: null },
    collapsed: false,
    templates: [],
    cmpl: { v: 1, items: null, gorder: null },   /* v7.8：补全片段库（items null = 用内置表；gorder = 分组顺序） */
    blocks: [{
      id: uid(),
      text: '示例块：这是一段提示词——雨夜小巷，霓虹倒映在水洼里，镜头缓慢推近，侦探撑伞走来。\n\n第二段：角色停步回望，眼神警惕，雨水沿帽沿滑落。\n\n左键拖把手=移动位置；右键菜单或点「拼」可加入右侧拼接栏，按顺序拼成整条 prompt。',
      x: 20,
      y: 20
    }]
  };
}

function gridPos(i){
  return { x: 20 + (i % 4) * 360, y: 20 + Math.floor(i / 4) * 150 };
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.store = { MIN_BLOCK_W, defaultState, drag, gridPos, keyDir, keyLastT, keyLoop, keyState, keyVel, panEndX, panEndY, panLooping, panVel, panning, selected, spacePan, spliceMode, state, tplCur, tplOpen, uid };
