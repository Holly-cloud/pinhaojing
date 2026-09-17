
/* ==================== v7.8 结构层（节解析） ====================
   用途：把编辑器文本按**符号**切成「节」，三处共用——① 状态栏结构提示；② 候选池按节置顶；③ 后续槽位/轮盘。
   口径分层（重要）：
     · 着色引擎（50-editor.js）保持「零领域语义」不变——它不认识任何内容含义，只认符号；
     · 领域语义**只活在本文的 STRUCT_MARKS 标记表里**（一行一条，可增减）。
   规则：
     · 默认区 = 前置「起手式」（画面开始之前）→ 之后进「叙事正文」；
     · 风格包 = `风格：` 起 → `硬性要求：` 止（其间 `^【属性名】` 行各自成标签）；
     · `镜头N` 在叙事区内 = 分镜；在起手式区（行首即镜头N）= 起手式的一部分（实测 22 条语料都是后者）。
   ================================================================= */
var STRUCT_MARKS = [
  /* [行首正则, 固定节名（null = 取捕获组）, 类型] —— 顺序即优先级 */
  [/^画面开始/, '画面开始', 'mark'],
  [/^画面结束/, '画面结束', 'mark'],
  [/^风格[:：]/, '风格包', 'style'],
  [/^硬性要求[:：]/, '硬性要求', 'tail'],
  [/^【(.+?)】/, null, 'para'],
  [/^镜头\s*([1-9]\d*)(?!\d)/, null, 'shot']
];
/* 单行判定：命中标记表 → {kind, name}；否则 null（交给上下文决定） */
function structLineMark(line){
  var t = String(line).replace(/^[ \t]+/, '');
  for(var i = 0; i < STRUCT_MARKS.length; i++){
    var m = STRUCT_MARKS[i][0].exec(t);
    if(!m) continue;
    var kind = STRUCT_MARKS[i][2], fixed = STRUCT_MARKS[i][1], name = fixed;
    if(name === null) name = (kind === 'shot') ? ('镜头' + m[1]) : m[1];   /* 捕获组 = 镜头号 / 【属性名】 */
    return { kind: kind, name: name };
  }
  return null;
}
/* 逐行解析：返回与 lines 等长的 [{region, label}]（region = 区，label = 给状态栏看的节名） */
function structMap(text){
  var lines = String(text).split('\n'), out = [], i, ln, mk, region = 'anchor', label = '起手式', styleOn = false;
  for(i = 0; i < lines.length; i++){
    ln = lines[i]; mk = structLineMark(ln);
    if(mk){
      if(mk.kind === 'mark'){
        region = (mk.name === '画面开始') ? 'body' : region;   /* 画面结束 不改变区（仍是叙事区） */
        label = mk.name;
      }else if(mk.kind === 'shot'){
        /* 叙事区里的 镜头N = 分镜；起手式区的 镜头N = 起手式的一部分 */
        label = (region === 'body') ? ('分镜 ' + mk.name) : '起手式';
        if(region === 'body') region = 'body';
      }else if(mk.kind === 'style'){
        region = 'style'; styleOn = true; label = '风格包';
      }else if(mk.kind === 'tail'){
        region = 'tail'; styleOn = false; label = '硬性要求';
      }else if(mk.kind === 'para'){
        region = 'style'; styleOn = true; label = '风格包 · ' + mk.name;
      }
    }else{
      if(ln.trim() === ''){ /* 空行：归属上一节，不改变 label（分节本身就是空行做的） */ }
      else if(styleOn){ label = '风格包'; }          /* 风格包内的续行 */
      else if(region === 'style'){ label = '风格包'; }
      else if(region === 'anchor'){ label = '起手式'; }
      else if(region === 'body'){ label = '叙事正文'; }
      else if(region === 'tail'){ label = '硬性要求'; }
    }
    out.push({ region: region, label: label });
  }
  return out;
}
/* 光标处结构：返回 {region, label}（文本空 / 越界均安全） */
function structAt(text, caret){
  var lines = String(text).split('\n');
  var head = String(text).slice(0, Math.max(0, caret | 0));
  var idx = head.split('\n').length - 1;
  if(idx > lines.length - 1) idx = lines.length - 1;
  var map = structMap(text);
  return map[idx] || { region: 'anchor', label: '起手式' };
}
/* 整篇结构摘要（供后续检查器/侧栏用；最小版只在状态栏用得上单点查询） */
function structSummary(text){
  var map = structMap(text), seen = {}, order = [], i, k;
  for(i = 0; i < map.length; i++){
    k = map[i].label;
    if(!seen[k]){ seen[k] = { label: k, count: 0, region: map[i].region }; order.push(seen[k]); }
    seen[k].count++;
  }
  return order;
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.struct = { structAt };
