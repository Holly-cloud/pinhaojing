
/* ==================== v7.8 结构层（节解析） ====================
   用途：把编辑器文本按**符号**切成「节」，三处共用——① 状态栏结构提示；② 候选池按节置顶；③ 后续槽位/轮盘。
   口径分层（重要）：
     · 着色引擎（editor/highlight.js）保持「零领域语义」不变——它不认识任何内容含义，只认符号；
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
/* 逐行解析：返回与 lines 等长的 [{region, label}]（region = **区（含段落延续）**，label = 给状态栏看的节名）。
   ★用途分离（勿混淆）：本函数是**状态机**——从全文第一行往下累积 region，region 表示「**区（含段落延续）**」，
     专供 `structExemptMask`（逗号豁免掩码）消费：`风格：` 起 → `硬性要求：` / 块尾 止 的续行据此豁免。
     它与 `structAt` 的「**行级节判定**」是**两个不同用途**——structAt 只看光标所在行本身、与上下文无关，
     故二者对同一行**不必一致、也不应一致**（后者恒定行级，前者含段落延续）。 */
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
/* 光标处结构：返回 {region, label}——**两个字段来源不同、职责不同**（务必分清）：
     · label  = 「**光标这一行像什么**」——**行级**、只按本行**行首特征**判定（供状态栏显示「节名」）。
                 命中即按下面这张**行级映射表**取名；**未命中（含空行）→ '判断中'**（判不出就不敲定）。
                   ^画面开始      → '画面开始'
                   ^画面结束      → '画面结束'
                   ^风格[:：]     → '风格包'
                   ^硬性要求[:：] → '硬性要求'
                   ^【(.+?)】     → '风格包 · <属性名>'
                   ^镜头\\s*N     → '分镜 镜头N'   （★不要求前文有「画面开始」）
     · region = 「**这一段处于哪个区**」——**段落延续**（与 structMap 逐字同源，含段落延续语义）；
                 供灵感气泡兜底、`#` 候选置顶、逗号豁免掩码等**按区**工作的地方消费。
   换言之：label 行级（看这一行），region 段落延续（看这一段）——同一行二者**不必一致**。
   无副作用、纯函数；文本空 / 越界均安全。 */
function structAt(text, caret){
  var str = String(text);
  var lines = str.split('\n');
  var head = str.slice(0, Math.max(0, caret | 0));
  var idx = head.split('\n').length - 1;
  if(idx < 0) idx = 0;
  if(idx > lines.length - 1) idx = lines.length - 1;
  var map = structMap(text);                                   /* ★region：段落延续（原语义，不改 structMap） */
  var region = (map[idx] && map[idx].region) ? map[idx].region : 'anchor';
  var line = lines[idx] == null ? '' : lines[idx];
  var mk = structLineMark(line), label;                        /* ★label：行级、只看本行行首特征 */
  if(!mk) label = '判断中';
  else if(mk.kind === 'mark') label = mk.name;                 /* 画面开始 / 画面结束 */
  else if(mk.kind === 'shot') label = '分镜 ' + mk.name;        /* 镜头N → 一律「分镜」 */
  else if(mk.kind === 'style') label = '风格包';
  else if(mk.kind === 'tail') label = '硬性要求';
  else if(mk.kind === 'para') label = '风格包 · ' + mk.name;
  else label = '判断中';
  return { region: region, label: label };
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

/* v7.16（A 条）：结构区豁免掩码——风格区(style)/硬性要求区(tail) 的字符 → 1，其余 → 0。
   ★领域判定**只在本文件**：着色层（editor/highlight.js）只消费这个**不透明布尔掩码**，不认识任何区名含义。
   行级 → 字符级的映射：与 hlToHTML 同源的索引推进法（idx += 行长 + 1，+1 为该行末尾 '\n'，归 body 段 → 不置 1）。
   anchor（起手式）与 body（正文/分镜）**不豁免**（对照组，逗号照旧计入错误）。 */
function structExemptMask(text){
  var m = new Uint8Array(String(text).length), lines = String(text).split('\n'), map = structMap(text);
  var idx = 0, li, reg, k;
  for(li = 0; li < lines.length; li++){
    reg = map[li] ? map[li].region : '';
    if(reg === 'style' || reg === 'tail'){
      for(k = 0; k < lines[li].length; k++) m[idx + k] = 1;
    }
    idx += lines[li].length + 1;     /* +1 = 该行末尾的 '\n'（'body' 段，不置 1） */
  }
  return m;
}

/* 本模块对外面 = 被他模块引用的顶层名（P3 客观统计口径） */
PHJ.struct = { structAt, structExemptMask };
