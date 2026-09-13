
/* ==================== v7.8 补全配置界面（片段库：浏览 / 修改 / 新增） ====================
   入口：顶栏「补」。窗口形态沿用模板定制窗口（.tpl-win 体系）。
   数据：生效表见 52-complete.js（state.cmpl）。首次打开即把内置表**物化**成用户表——之后一切改动都在用户表上，
        内置表只在「恢复内置默认」时回来。改完写 localStorage（随「导出 JSON」一起走）。
   片段内容可用：`${1}` `${2}` 槽位（上屏后 Tab 逐位跳）；素材绑定位照 Holly 的习惯手写 `@`。
   ================================================================= */
var cmplCfgQ = '', cmplCfgEditing = null, cmplCfgAdding = false;

function cmplCfgMaterialize(){
  if(!state.cmpl || !Array.isArray(state.cmpl.items)){
    cmplSetItems(cmplSeedItems());
    saveNow();
  }
}
function openCmplCfg(){
  cmplCfgMaterialize();
  cmplCfgQ = ''; cmplCfgEditing = null; cmplCfgAdding = false;
  var s = document.getElementById('cmplCfgSearch');
  if(s) s.value = '';
  renderCmplCfg();
  document.getElementById('cmplCfgMask').classList.remove('hide');
  var se = document.getElementById('cmplCfgSearch');
  if(se) se.focus();
}
function closeCmplCfg(){
  cmplCfgEditing = null; cmplCfgAdding = false;
  document.getElementById('cmplCfgMask').classList.add('hide');
}
/* 分组顺序 = 生效表里首次出现的顺序（用户新组自动排到末尾） */
function cmplCfgGroups(){
  var items = cmplActive(), seen = {}, out = [], i, g;
  for(i = 0; i < items.length; i++){
    g = items[i].group || '未分组';
    if(!seen[g]){ seen[g] = 1; out.push(g); }
  }
  return out;
}
function renderCmplCfg(){
  var body = document.getElementById('cmplCfgBody');
  if(!body) return;
  body.innerHTML = '';
  var items = cmplActive(), q = cmplCfgQ.toLowerCase(), i, it, hit, lastG = null, shown = 0;
  /* 分组候选（编辑表单的 datalist） */
  var dl = document.getElementById('cmplCfgGroupList');
  if(dl){
    dl.innerHTML = '';
    cmplCfgGroups().forEach(function(g2){
      var o = document.createElement('option'); o.value = g2; dl.appendChild(o);
    });
  }
  var hint = document.createElement('div');
  hint.className = 'cmpl-cfg-hint';
  hint.innerHTML = '片段里可用 <b>${1} ${2}</b> 做槽位（上屏后 Tab 逐位跳）；素材绑定位照你的习惯手写 <b>@</b>。分组名相同的自动归到一组。';
  body.appendChild(hint);
  if(cmplCfgAdding) body.appendChild(cmplCfgForm(null));
  for(i = 0; i < items.length; i++){
    it = items[i];
    if(cmplCfgEditing === it.key){ body.appendChild(cmplCfgForm(it)); shown++; lastG = null; continue; }
    if(q){
      hit = ((it.label || '') + ' ' + (it.body || '') + ' ' + (it.group || '')).toLowerCase().indexOf(q) >= 0;
      if(!hit) continue;
    }
    var g = it.group || '未分组';
    if(g !== lastG){
      lastG = g;
      var gh = document.createElement('div');
      gh.className = 'cmpl-cfg-group';
      gh.textContent = g + '  ·  ' + cmplActive().filter(function(x){ return (x.group || '未分组') === g; }).length + ' 条';
      body.appendChild(gh);
    }
    body.appendChild(cmplCfgRow(it, i));
    shown++;
  }
  if(!shown){
    var em = document.createElement('div');
    em.className = 'tpl-empty';
    em.textContent = q ? '没有匹配的片段' : '片段库是空的（可「＋ 新增片段」或「恢复内置默认」）';
    body.appendChild(em);
  }
}
/* 只读行 */
function cmplCfgRow(it, idx){
  var row = document.createElement('div');
  row.className = 'cmpl-cfg-card';
  row.dataset.idx = idx;
  var head = document.createElement('div');
  head.className = 'cmpl-cfg-row';
  var lb = document.createElement('span');
  lb.className = 'cmpl-cfg-label';
  lb.textContent = it.label || '(未命名)';
  head.appendChild(lb);
  if(it.note){
    var nt = document.createElement('span');
    nt.className = 'cmpl-note';
    nt.textContent = it.note;
    head.appendChild(nt);
  }
  var pv = document.createElement('span');
  pv.className = 'cmpl-cfg-preview';
  pv.textContent = String(it.body || '').replace(/\s+/g, ' ').slice(0, 60);
  head.appendChild(pv);
  var ed = document.createElement('button');
  ed.className = 'tpl-block-op'; ed.textContent = '编辑'; ed.dataset.act = 'edit'; ed.dataset.key = it.key;
  var dl = document.createElement('button');
  dl.className = 'tpl-block-op danger'; dl.textContent = '删除'; dl.dataset.act = 'del'; dl.dataset.key = it.key;
  head.appendChild(ed); head.appendChild(dl);
  row.appendChild(head);
  return row;
}
/* 编辑/新增表单（it = null 表示新增） */
function cmplCfgForm(it){
  var isNew = !it;
  var src = it || { key: '', group: (cmplCfgGroups()[0] || '镜头句'), label: '', note: '', body: '', block: false };
  var card = document.createElement('div');
  card.className = 'cmpl-cfg-card editing';
  if(isNew) card.classList.add('adding');

  var r1 = document.createElement('div'); r1.className = 'cmpl-cfg-field';
  var gl = document.createElement('span'); gl.className = 'cmpl-cfg-fl'; gl.textContent = '分组';
  var gi = document.createElement('input'); gi.className = 'cmpl-cfg-input'; gi.id = 'cmplCfgGroupIn'; gi.value = src.group || '';
  gi.setAttribute('list', 'cmplCfgGroupList'); gi.placeholder = '如：镜头句 / 我的常用';
  r1.appendChild(gl); r1.appendChild(gi);

  var r2 = document.createElement('div'); r2.className = 'cmpl-cfg-field';
  var ll = document.createElement('span'); ll.className = 'cmpl-cfg-fl'; ll.textContent = '标签';
  var li = document.createElement('input'); li.className = 'cmpl-cfg-input'; li.id = 'cmplCfgLabelIn'; li.value = src.label || '';
  li.placeholder = '候选里显示的名字（也是搜索命中项）';
  var nl = document.createElement('span'); nl.className = 'cmpl-cfg-fl'; nl.textContent = '备注';
  var ni = document.createElement('input'); ni.className = 'cmpl-cfg-input'; ni.id = 'cmplCfgNoteIn'; ni.value = src.note || '';
  ni.placeholder = '可选，如「未用过」';
  r2.appendChild(ll); r2.appendChild(li); r2.appendChild(nl); r2.appendChild(ni);

  var bl = document.createElement('div'); bl.className = 'cmpl-cfg-fl'; bl.textContent = '内容';
  var bi = document.createElement('textarea'); bi.className = 'cmpl-cfg-body'; bi.id = 'cmplCfgBodyIn'; bi.spellcheck = false; bi.value = src.body || '';
  bi.placeholder = '上屏的原文；槽位写 ${1} ${2}';

  var op = document.createElement('div'); op.className = 'cmpl-cfg-ops';
  var ok = document.createElement('button'); ok.className = 'btn primary'; ok.id = 'cmplCfgSave'; ok.textContent = '保存';
  var cc = document.createElement('button'); cc.className = 'btn'; cc.id = 'cmplCfgCancel'; cc.textContent = '取消';
  op.appendChild(ok); op.appendChild(cc);

  card.appendChild(r1); card.appendChild(r2); card.appendChild(bl); card.appendChild(bi); card.appendChild(op);
  return card;
}
/* 读表单 → 写回用户表 */
function cmplCfgSave(){
  var gi = document.getElementById('cmplCfgGroupIn'), li = document.getElementById('cmplCfgLabelIn'),
      ni = document.getElementById('cmplCfgNoteIn'), bi = document.getElementById('cmplCfgBodyIn');
  if(!gi || !bi) return;
  var body = bi.value;
  if(!body.trim()){ toast('内容不能为空'); return; }
  var label = li.value.trim() || body.replace(/\s+/g, ' ').slice(0, 12);
  var arr = cmplActive().slice();
  if(cmplCfgAdding){
    arr.push({ key: cmplNewKey(), group: gi.value.trim() || '未分组', label: label, note: ni.value.trim(), body: body, block: false });
    cmplCfgAdding = false;
  }else{
    for(var i = 0; i < arr.length; i++){
      if(arr[i].key === cmplCfgEditing){
        arr[i] = { key: arr[i].key, group: gi.value.trim() || '未分组', label: label, note: ni.value.trim(), body: body, block: !!arr[i].block };
        break;
      }
    }
    cmplCfgEditing = null;
  }
  cmplSetItems(arr);
  saveNow();
  renderCmplCfg();
  toast('已保存片段：' + label);
}
function cmplCfgDel(key){
  var before = cmplActive().slice(), gone = null;
  var arr = before.filter(function(x){ if(x.key === key){ gone = x; return false; } return true; });
  cmplSetItems(arr); saveNow(); renderCmplCfg();
  toast('已删除片段' + (gone ? '：' + (gone.label || '') : ''), { label: '撤销', fn: function(){ cmplSetItems(before); saveNow(); renderCmplCfg(); toast('已恢复片段'); } });
}
function cmplCfgReset(){
  cmplSetItems(null); saveNow(); renderCmplCfg();
  toast('已恢复内置片段库（共 ' + cmplSeedItems().length + ' 条）');
}
