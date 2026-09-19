
/* ==================== editor/host · 编辑器节点「宿主解析层」 ====================
   背景（v7.15）：编辑器内核（highlight/complete/block-editor）原先直接把 DOM 写死为
   `document.getElementById('blkInput' / 'blkHl' / 'cmplPop' / 'stLine' …)` 与
   全局 `document.querySelector('.blk-hl')`——只有一套宿主 DOM，故「写作台右栏复用同一内核」会
   撞出第二个同 id 元素，`getElementById` 只认第一个 → 高亮 / 行号 / 状态栏 / 补全全部错位。

   方案（最小、最稳）：把「一套编辑器节点」抽象为**宿主对象**，内核改为**按宿主寻址**，
   内核函数**增可选 host 参数、缺省 = hostPopup**（既有零参调用行为逐字不变）。

   · 解析惰性（首次 el(name) 才查询）、**按 root 作用域**（root.querySelector）、结果缓存；
   · `host.el(name)` name ∈ ta/pre/code/pop/copy/strip/stStruct/stLine/stCol/stLen/stErr；
   · 切视图 / DOM 重建后调 `host.inval()` 清缓存；
   · 弹窗宿主复用既有 id（不动既有 DOM）；`<pre class="blk-hl">` 原无 id → 用 root 作用域选择器解决；
   · 写作台宿主用独立 id 前缀 `wd*`，无 id 冲突。

   边界：本文件属 editor 层（引擎），**不得**引用 skin/**；不带任何领域文案。
   ================================================================= */

function makeHost(id, rootId, map){
  var h = { id: id, rootId: rootId, _root: null, _cache: {} };
  h.root = function(){ return h._root || (h._root = document.getElementById(h.rootId)); };
  h.el = function(name){
    if(h._cache[name] !== undefined) return h._cache[name];
    var r = h.root();
    var el = r ? r.querySelector(map[name]) : null;
    h._cache[name] = el;
    return el;
  };
  h.inval = function(){ h._root = null; h._cache = {}; };   /* 切视图 / 重建后清缓存 */
  return h;
}

/* 弹窗宿主（#blkMask）：复用既有 id/类，不动既有 DOM */
var hostPopup = makeHost('popup', 'blkMask', {
  ta: '#blkInput', pre: '.blk-hl', code: '#blkHl', pop: '#cmplPop',
  copy: '#blkCopy', strip: '#blkStrip', stStruct: '#stStruct', stLine: '#stLine', stCol: '#stCol', stLen: '#stLen', stErr: '#stErr'
});

/* 写作台宿主（#writeDesk）：独立 id 前缀 wd* */
var hostDesk = makeHost('desk', 'writeDesk', {
  ta: '#wdInput', pre: '.wd-hl', code: '#wdHl', pop: '#wdPop',
  copy: '#wdCopy', strip: '#wdStrip', stStruct: '#wdStruct', stLine: '#wdLine', stCol: '#wdCol', stLen: '#wdLen', stErr: '#wdErr'
});

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.host = { hostDesk, hostPopup };
