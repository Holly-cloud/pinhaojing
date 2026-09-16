function refreshOverlays(){ updatePeekDots(); updateLinks(); }

function updatePeekDots(){
  var layer = document.getElementById('peekLayer');
  if(!layer || !board) return;
  var cards = board.querySelectorAll('.block');
  var rects = [];
  for(var i = 0; i < cards.length; i++){
    var el = cards[i];
    var r = el.getBoundingClientRect();
    /* v6.17：有效层级 peek(3) > drag(2) > active(1) > 普通(0) */
    var eff = el.classList.contains('peek') ? 3 : el.classList.contains('drag') ? 2 : el.classList.contains('active') ? 1 : 0;
    rects.push({ id: el.dataset.id, el: el, x: r.x, y: r.y, w: r.width, h: r.height, eff: eff, idx: i, isImg: el.classList.contains('block-img') });
  }
  var wanted = {};   /* v7.2：本帧需要的光点 { id: {x,y} } */
  for(var a = 0; a < rects.length; a++){
    var A = rects[a];
    if(A.eff >= 2) continue;   /* peek/drag 中的块拖手（或图片）一定可见 */
    /* v6.17：操作区 = 文本块拖手区（左 30px）/ 图片块中心（无拖手） */
    var opR = A.isImg
      ? { x: A.x + A.w / 2 - 9, y: A.y + A.h / 2 - 9, w: 18, h: 18 }
      : { x: A.x, y: A.y, w: 30, h: A.h };
    var covered = false;
    for(var b = 0; b < rects.length; b++){
      if(b === a) continue;
      var B = rects[b];
      if(B.eff >= 3) continue;   /* peek 置顶块不遮挡（自己会被操作） */
      if(B.eff < A.eff) continue;                    /* 层级更低不遮挡 */
      if(B.eff === A.eff && B.idx < A.idx) continue; /* 同层 DOM 靠前不遮挡 */
      if(opR.x + opR.w <= B.x || B.x + B.w <= opR.x || opR.y + opR.h <= B.y || B.y + B.h <= opR.y) continue;
      covered = true;
      break;
    }
    if(covered){
      wanted[A.id] = { x: Math.round(opR.x + opR.w / 2), y: Math.round(opR.y + opR.h / 2) };
    }
  }
  /* v7.2：复用式更新（不再每帧重建 DOM）——
     ① 新出现的光点创建元素并播 dotIn 入场；既有光点只更新位置（拖拽/平移中不重播，消除闪烁与 DOM 开销）；
     ② render() 内部会调用本函数两次（applyPan + refreshOverlays），重建式会让第二批丢掉入场标记，复用式天然免疫 */
  var kids = layer.children;
  var alive = {};
  for(var i2 = kids.length - 1; i2 >= 0; i2--){
    var el2 = kids[i2];
    var id2 = el2.dataset.id;
    if(!wanted[id2]){ layer.removeChild(el2); continue; }   /* 不再需要 → 移除（下次出现重新播入场） */
    el2.style.left = wanted[id2].x + 'px';
    el2.style.top = wanted[id2].y + 'px';
    alive[id2] = 1;
  }
  for(var id3 in wanted){
    if(alive[id3]) continue;
    var d = document.createElement('div');
    d.className = 'peek-dot in';   /* 新出现 → 入场动画 */
    d.dataset.id = id3;
    d.style.left = wanted[id3].x + 'px';
    d.style.top = wanted[id3].y + 'px';
    d.title = '下层块（被遮挡）：悬停临时置顶';
    (function(id4){ d.addEventListener('mouseenter', function(){ peekBlock(id4, true); }); })(id3);
    d.addEventListener('animationend', function(){ d.classList.remove('in'); });   /* 入场播完摘除标记 */
    layer.appendChild(d);
  }
}
/* v6.17：最近操作的块置顶（遮挡关系受操作记录影响） */
var activeId = null;
function bringToFront(id){
  if(activeId === id) return;
  activeId = id;
  var cards = board.querySelectorAll('.block');
  for(var i = 0; i < cards.length; i++){
    cards[i].classList.toggle('active', cards[i].dataset.id === id);
  }
  updatePeekDots();
}
function peekBlock(id, on){
  var card = board.querySelector('.block[data-id="' + id + '"]');
  if(!card) return;
  if(on){ card.classList.add('peek'); }else{ card.classList.remove('peek'); }
  updatePeekDots();
}
/* v6.16：光线层 —— 画布块 ↔ 拼接栏条目（朦胧渐变色贝塞尔曲线） */
function updateLinks(growIds){   /* v7：growIds 存在且含 bid 时该连线播生长动画 */
  var svg = document.getElementById('linkLayer');
  if(!svg) return;
  svg.innerHTML = '';
  if(state.collapsed) return;
  var ns = 'http://www.w3.org/2000/svg';
  var defs = document.createElementNS(ns, 'defs');
  var lg = document.createElementNS(ns, 'linearGradient');
  lg.id = 'lnkGrad';
  lg.setAttribute('x1', '0%'); lg.setAttribute('y1', '0%'); lg.setAttribute('x2', '100%'); lg.setAttribute('y2', '0%');
  var s1 = document.createElementNS(ns, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', 'rgba(0,113,227,.6)');
  var s2 = document.createElementNS(ns, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', 'rgba(124,58,237,.5)');
  lg.appendChild(s1); lg.appendChild(s2);
  defs.appendChild(lg);
  svg.appendChild(defs);
  state.splice.items.forEach(function(it){
    if(it.type === 'block'){
      addLink(svg, ns, it.id, '.sp-item[data-id="' + it.id + '"]', growIds);
    }else if(it.blockIds){
      it.blockIds.forEach(function(bid){ addLink(svg, ns, bid, '.sp-ublock[data-id="' + bid + '"]', growIds); });
    }
  });
  /* v7.3：拼模式拖拽中——源块 → 虚影 的渐变连线（实时跟随，两端最近边 + 双圆点） */
  if(ghostEl && ghostSrcId){
    var gsc = board.querySelector('.block[data-id="' + ghostSrcId + '"]');
    if(gsc){
      var gsr = gsc.getBoundingClientRect();
      var ghr = ghostEl.getBoundingClientRect();
      var pA = { x: gsr.right, y: gsr.top + gsr.height / 2 };
      var pB = { x: ghr.left, y: ghr.top + ghr.height / 2 };
      if(ghr.left < gsr.left){   /* 虚影在源块左侧 → 反转连接边 */
        pA = { x: gsr.left, y: gsr.top + gsr.height / 2 };
        pB = { x: ghr.right, y: ghr.top + ghr.height / 2 };
      }
      var gdx = Math.max(40, Math.abs(pB.x - pA.x) / 2);
      var gpath = document.createElementNS(ns, 'path');
      gpath.setAttribute('class', 'lnk lnk-ghost');   /* v7.3：虚影光线专属标识（便于识别/验收） */
      gpath.setAttribute('d', 'M' + pA.x.toFixed(1) + ',' + pA.y.toFixed(1) + ' C' + (pA.x + gdx).toFixed(1) + ',' + pA.y.toFixed(1) + ' ' + (pB.x - gdx).toFixed(1) + ',' + pB.y.toFixed(1) + ' ' + pB.x.toFixed(1) + ',' + pB.y.toFixed(1));
      gpath.setAttribute('stroke', 'url(#lnkGrad)');
      gpath.setAttribute('opacity', '.8');
      svg.appendChild(gpath);
      var gcA = document.createElementNS(ns, 'circle');
      gcA.setAttribute('class', 'lnk-dot');
      gcA.setAttribute('cx', pA.x.toFixed(1)); gcA.setAttribute('cy', pA.y.toFixed(1)); gcA.setAttribute('r', '3');
      gcA.setAttribute('fill', 'rgba(0,113,227,.75)');
      var gcB = document.createElementNS(ns, 'circle');
      gcB.setAttribute('class', 'lnk-dot');
      gcB.setAttribute('cx', pB.x.toFixed(1)); gcB.setAttribute('cy', pB.y.toFixed(1)); gcB.setAttribute('r', '3');
      gcB.setAttribute('fill', 'rgba(124,58,237,.75)');
      svg.appendChild(gcA); svg.appendChild(gcB);
    }
  }
}
function addLink(svg, ns, bid, sel, growIds){
  var bc = board.querySelector('.block[data-id="' + bid + '"]');
  var sc = document.querySelector(sel);
  if(!bc || !sc) return;
  var br = bc.getBoundingClientRect();
  var sr = sc.getBoundingClientRect();
  if(!br.width || !sr.width) return;   /* 隐藏/折叠中 */
  var x1 = br.right, y1 = br.top + br.height / 2;
  var x2 = sr.left, y2 = sr.top + sr.height / 2;
  var dx = Math.max(50, (x2 - x1) / 2);
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('class', 'lnk');
  if(growIds && growIds.indexOf(bid) >= 0) path.classList.add('lnk-grow');   /* v7：新增连线播生长（pathLength 归一化 dash） */
  path.setAttribute('pathLength', '1');   /* v7：dash 按路径总长归一化（生长动画与长度无关） */
  path.setAttribute('d', 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' C' + (x1 + dx).toFixed(1) + ',' + y1.toFixed(1) + ' ' + (x2 - dx).toFixed(1) + ',' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1));
  path.setAttribute('stroke', 'url(#lnkGrad)');
  path.setAttribute('opacity', '.5');
  svg.appendChild(path);
  var c1 = document.createElementNS(ns, 'circle');
  c1.setAttribute('class', 'lnk-dot');
  c1.setAttribute('cx', x1.toFixed(1)); c1.setAttribute('cy', y1.toFixed(1)); c1.setAttribute('r', '3');
  c1.setAttribute('fill', 'rgba(0,113,227,.6)');
  var c2 = document.createElementNS(ns, 'circle');
  c2.setAttribute('class', 'lnk-dot');
  c2.setAttribute('cx', x2.toFixed(1)); c2.setAttribute('cy', y2.toFixed(1)); c2.setAttribute('r', '3');
  c2.setAttribute('fill', 'rgba(124,58,237,.6)');
  svg.appendChild(c1); svg.appendChild(c2);
  /* v7.5：目标条目左缘「渐变朦胧光线接口」——有画布块光线接入时显示（class 幂等；条目重建后自动重加） */
  if(sc.classList) sc.classList.add('lnk-in');
}
/* P2：本模块对外面（显式导出；当前 = 全部顶层符号，P3 收敛为最小面） */
PHJ.overlay = { activeId, addLink, bringToFront, peekBlock, refreshOverlays, updateLinks, updatePeekDots };

/* P3：对外面 = **被他模块引用的顶层名**（客观统计；P2 时为全量导出） */
PHJ.overlay = { activeId, bringToFront, peekBlock, refreshOverlays, updateLinks, updatePeekDots };
