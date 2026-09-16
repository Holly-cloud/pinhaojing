/* ---- 复制（单块） ---- */
function copyText(text){
  if(window.navigator.clipboard && window.navigator.clipboard.writeText){
    return window.navigator.clipboard.writeText(text).then(function(){ return true; }, function(){ return fallbackCopy(text); });
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text){
  try{
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly','');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }catch(e){ return false; }
}

/* ---- toast ---- */
function toast(msg, action){
  var el = document.getElementById('toast');
  el.classList.remove('toast-out');   /* v7：若上轮滑出中，先复位再滑入 */
  el.innerHTML = '';
  var span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if(action){
    var b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = function(){ clearTimeout(toastTimer); el.classList.remove('toast-out'); el.classList.add('hide'); action.fn(); };
    el.appendChild(b);
  }
  el.classList.remove('hide');
  clearTimeout(toastTimer);
  /* v7：自动滑出 = 先播 150ms 淡出，再隐藏（保持滑入/滑出对称） */
  toastTimer = setTimeout(function(){
    el.classList.add('toast-out');
    toastTimer = setTimeout(function(){ el.classList.remove('toast-out'); el.classList.add('hide'); }, 160);
  }, 2600);
}
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.clipboard = { copyText, fallbackCopy, toast };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出） */
PHJ.clipboard = { copyText, toast };
