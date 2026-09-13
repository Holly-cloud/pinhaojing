
/* ==================== v7.6 coding 编辑器引擎（叠层高亮 + 行号栏 + 状态栏 + 错误标记） ====================
   设计：划分依据 = 文本中出现的符号本身（Unicode 标点/符号）；引擎零领域语义（不为任何符号预设"代表什么内容"）。
   规则：R0 错误符号表（，,）→ 红 + 波浪下划线 + 行号标红；优先级最高；不参与括号配对
        R0.5 台词区豁免（v7.7）：被**一行内成对的中文双引号“ ”包住**的错误符号一律无视——随所在层级族色正常显示、
             不计入状态栏错误数、不使行号标红。边界＝仅中文双引号（半角 " 不算）；**未闭合不算台词区**（照旧标红）；
             判定按「祖先链含双引号」（引号内再嵌 {}/() 等成对符号，里层也豁免）
        R1 成对符号包裹的成分 → 括符与其内文本同族色
        R2 嵌套 → 内层覆盖外层（最近的开符号决定）
        R3 其余符号（句读/运算符/箭头…）→ 配对区域内随该族色，区域外着句读色
        R4 未闭合开符号 → 至行尾着该族色（换行即重置）
        R5 其余正文 → 叙述专属墨蓝（= 彩色层基线色，不产生 span）
   ================================================================================================== */
var HL_ERR = {'，':1, ',':1};                                  /* 错误符号表（常量，加一个字符即可扩展） */
var HL_DLG = {'“':'”'};                                       /* v7.7 台词区边界表（成对中文双引号，加一对即扩展；未闭合不生效） */
var HL_DLG_OPEN = {};                                          /* 台词区闭合符 → 开启符（由 HL_DLG 生成） */
for(var _dk in HL_DLG) HL_DLG_OPEN[HL_DLG[_dk]] = _dk;
var HL_PAIRS = {'{':'}','（':'）','(' : ')' ,'<':'>','〈':'〉','《':'》','「':'」','『':'』','【':'】','〔':'〕','[':']','［':'］','“':'”','‘':'’'};
var HL_TOGGLE = {'"':1, "'":1, '`':1};
var HL_CLOSERS = {};
for(var _hk in HL_PAIRS) HL_CLOSERS[HL_PAIRS[_hk]] = _hk;
function hlFamOf(ch){
  if('{}'.indexOf(ch) >= 0) return 'brace';
  if('<>〈〉'.indexOf(ch) >= 0) return 'angle';
  if('()（）'.indexOf(ch) >= 0) return 'paren';
  if('【】〔〕'.indexOf(ch) >= 0) return 'lent';
  if('[]［］'.indexOf(ch) >= 0) return 'square';
  if('《》'.indexOf(ch) >= 0) return 'title';
  if('「」『』“”‘’"\'`'.indexOf(ch) >= 0) return 'quote';
  return 'punct';
}
var HL_SYM = /[\p{P}\p{S}]/u;
/* v7.7 台词区掩码：一行内成对中文双引号“ ”包住的字符 → 1（含更内层嵌套；未闭合的开引号不生效）
   实现：行内深度配对出闭合区间 → 差分区累计覆盖数（O(n)，不做区间双重循环，嵌套区间亦正确） */
function hlDialogueMask(text){
  var n = text.length, diff = new Int32Array(n + 1), m = new Uint8Array(n), st = [], i, ch, o, acc = 0;
  for(i = 0; i < n; i++){
    ch = text.charAt(i);
    if(ch === '\n'){ st.length = 0; continue; }                                  /* 换行重置：跨行不成对 → 未闭合不生效 */
    if(HL_DLG[ch]) st.push(i);
    else if(HL_DLG_OPEN[ch] && st.length){ o = st.pop(); diff[o + 1]++; diff[i]--; }  /* 闭合对 → 标记内部区间 [o+1, i-1] */
  }
  for(i = 0; i < n; i++){ acc += diff[i]; if(acc > 0) m[i] = 1; }
  return m;
}
/* 逐字符分类：返回长度 = 文本长度的族名数组 */
function hlClassify(text){
  var fam = new Array(text.length), stack = [], i, ch, t, dlg = hlDialogueMask(text);
  function top(){ return stack.length ? stack[stack.length - 1] : null; }
  for(i = 0; i < text.length; i++){
    ch = text.charAt(i);
    if(ch === '\n'){ stack.length = 0; fam[i] = 'body'; continue; }              /* R4：换行重置 */
    if(HL_ERR[ch] && !dlg[i]){ fam[i] = 'err'; continue; }                       /* R0：不参与配对（v7.7：台词区内豁免，继续走 R1~R5 随层级族色） */
    if(!HL_SYM.test(ch)){ t = top(); fam[i] = t ? t.fam : 'body'; continue; }    /* R5 / R1 */
    if(HL_PAIRS[ch]){ fam[i] = hlFamOf(ch); stack.push({ch:ch, fam:fam[i]}); }
    else if(HL_CLOSERS[ch]){
      t = top();
      if(t && HL_PAIRS[t.ch] === ch){ stack.pop(); fam[i] = t.fam; } else fam[i] = 'punct';
    } else if(HL_TOGGLE[ch]){
      t = top();
      if(t && t.ch === ch){ stack.pop(); fam[i] = t.fam; }
      else { fam[i] = hlFamOf(ch); stack.push({ch:ch, fam:fam[i]}); }
    } else { t = top(); fam[i] = t ? t.fam : 'punct'; }                          /* R3 */
  }
  return fam;
}
/* 括号配对（coding 语义）：光标紧邻的括号 → 配对两端索引；不跨行 */
function hlFindMatch(text, caret){
  var cands = [caret - 1, caret], c, p, ch, i, j, d;
  for(c = 0; c < cands.length; c++){
    p = cands[c];
    if(p < 0 || p >= text.length) continue;
    ch = text.charAt(p);
    if(HL_ERR[ch]) continue;
    if(HL_PAIRS[ch]){
      d = 0;
      for(i = p; i < text.length; i++){
        var x = text.charAt(i);
        if(x === '\n') break;
        if(x === ch) d++;
        else if(x === HL_PAIRS[ch]){ d--; if(!d) return [p, i]; }
      }
    } else if(HL_CLOSERS[ch]){
      var open = HL_CLOSERS[ch]; d = 0;
      for(j = p; j >= 0; j--){
        var y = text.charAt(j);
        if(y === '\n') break;
        if(y === ch) d++;
        else if(y === open){ d--; if(!d) return [j, p]; }
      }
    }
  }
  return null;
}
function hlEsc(s){ return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* 逐行渲染：行号栏 + 族色 + 错误标记 + 配对高亮 */
function hlToHTML(text, match, fam){
  fam = fam || hlClassify(text);                              /* v7.7：可传入预分类结果（与状态栏计数同源，避免重复分类） */
  var lines = text.split('\n'), idx = 0, html = '', li, line, lineHasErr, body, i, j, f, q, g, isM, cur, curM, parts, pi, mm, ss;
  for(li = 0; li < lines.length; li++){
    line = lines[li]; lineHasErr = false; body = ''; i = 0;
    while(i < line.length){
      f = fam[idx + i]; j = i;
      while(j < line.length && fam[idx + j] === f) j++;
      cur = ''; curM = false; parts = [];
      for(q = i; q < j; q++){
        g = idx + q; isM = !!(match && (g === match[0] || g === match[1]));
        if(isM !== curM && cur){ parts.push([curM, cur]); cur = ''; }
        curM = isM; cur += hlEsc(line.charAt(q));
      }
      if(cur) parts.push([curM, cur]);
      for(pi = 0; pi < parts.length; pi++){
        mm = parts[pi][0]; ss = parts[pi][1];
        if(f === 'body' && !mm){ body += ss; }
        else { body += '<span class="hl-' + f + (mm ? ' hl-match' : '') + '">' + ss + '</span>'; }
      }
      if(f === 'err') lineHasErr = true;
      i = j;
    }
    html += '<div class="hl-line' + (lineHasErr ? ' has-err' : '') + '"><span class="ln">' + (li + 1) + '</span>'
          + (line.length ? body : '\u200b') + '</div>';           /* 空行补零宽字符，防塌陷 */
    idx += line.length + 1;
  }
  return html;
}
/* ---- 接线：彩色层尺寸/滚动同步 + 状态栏 + 渲染 ---- */
var _hlCode = null, _hlPre = null;
function hlSyncBox(){
  var ta = document.getElementById('blkInput');
  if(!_hlPre){ _hlPre = document.querySelector('.blk-hl'); }
  if(!_hlPre) return;
  _hlPre.style.width  = ta.offsetWidth  + 'px';
  _hlPre.style.height = ta.offsetHeight + 'px';
  _hlPre.scrollTop = ta.scrollTop;
  _hlPre.scrollLeft = ta.scrollLeft;
}
function hlStatus(fam){
  var ta = document.getElementById('blkInput'), v = ta.value, p = ta.selectionStart || 0;
  var line = v.slice(0, p).split('\n').length;
  var col = p - (v.lastIndexOf('\n', p - 1) + 1) + 1;
  if(!fam) fam = hlClassify(v);
  var errs = 0, ei;                                          /* v7.7：错误计数与着色同源（复用分类结果；台词区内已豁免，不再计入） */
  for(ei = 0; ei < fam.length; ei++) if(fam[ei] === 'err') errs++;
  document.getElementById('stLine').textContent = line;
  document.getElementById('stCol').textContent = col;
  document.getElementById('stLen').textContent = v.length;
  document.getElementById('stErr').textContent = errs;
}
function hlRefresh(){
  var ta = document.getElementById('blkInput');
  if(!_hlCode){ _hlCode = document.getElementById('blkHl'); }
  if(!_hlCode) return;
  var caret = (ta.selectionStart === ta.selectionEnd) ? ta.selectionStart : -1;
  var match = caret >= 0 ? hlFindMatch(ta.value, caret) : null;
  var fam = hlClassify(ta.value);                            /* v7.7：只分类一次，着色层 + 状态栏共用同一结果 */
  _hlCode.innerHTML = hlToHTML(ta.value, match, fam);
  hlSyncBox();
  hlStatus(fam);
}
var blkCb = null;
function openBlockEditor(initial, cb){
  document.getElementById('blkInput').value = initial || '';
  blkCb = cb;
  document.getElementById('blkMask').classList.remove('hide');
  var ta = document.getElementById('blkInput');
  /* v7.6.1 修复：原先 ta.select() 会把整段提示词全选（v6.12 起的行为）——一打字整段就被替换，
     且与 v7.6 的彩色层叠加后选区显眼。改为「光标落文末、无选区」，与画布块内联编辑一致。 */
  focusCaretEnd(ta);
  fitBlkWidth();
  hlRefresh();     /* v7.6：打开即渲染着色/行号/状态栏 */
  hlSyncBox();     /* 光标落文末可能触发内部滚动 → 立即同步彩色层，避免一帧错位 */
}
/* v6.14：编辑窗口宽度自适应最长字行（canvas 测量，复用 textWidth；上限 94vw，下限 560px） */
function fitBlkWidth(){
  var win = document.querySelector('.blk-win');
  if(!win) return;
  /* v6.20：单行文本允许换行显示后，宽度固定不再按最长行撑宽（折行显示，普通编辑器体验） */
  win.style.width = Math.min(640, window.innerWidth * 0.94) + 'px';
}
function closeBlockEditor(){
  document.getElementById('blkMask').classList.add('hide');
  blkCb = null;
}
