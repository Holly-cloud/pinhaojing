/* ============================================================================
   拼好镜 · 模块清单（manifest）
   ----------------------------------------------------------------------------
   状态：**P1 已接入构建**（v0.2-p1）。
     · P1 起本文件即**唯一顺序源**：build.mjs 读 `SLICES` / `CSS` 决定内联顺序，
       **不再从 dev/src/index.html 扫 `<script src>` 收集**；
     · dev/src/index.html 不再手写 19 个散列 `<script>`，改引**同一份代码生成**的
       开发态 bundle `dev/src/dev-bundle.js` → 开发态与产物跑在**同一作用域、同一顺序、同一字节**的 JS 上。
     · `MODULES` / `LAYERS` / `V78_EDGES` / `resolveOrder()` **保留**——那是 **P2 的模块化目标**
       （按 deps 拓扑求解、物理重切成 core/view/editor/interact）；**P1 用 `SLICES` 保序**，
       P2 完成后 `SLICES` 退役。
   放置：dev/manifest.mjs（**dev 根，故意不进 dev/src/**，否则会被 build.mjs 当切片内联）。

   红线（不变）：产物单文件、经典脚本（无 type=module/import）、零运行时依赖、构建期零依赖。
   —— 本清单**只描述源码结构**，不改变交付物形态。

   ★ = v7.8 新增片（51-struct/52-complete/53-library）。
   ✅ 2026-09-15 更新：本清单描述**已按 v7.8.2 现状校准**——风格包位于**内置**（Q7「资产分离 /
      降为中性示例」已由 v7.8.2 撤销；Holly 认定风格包即语料的一部分），52-complete 的 resp 已改写
      为事实陈述。当前现状以 dev/_qa/snapshots/BASELINE_v7.17.md 为准。
   ── 变更记录 ──────────────────────────────────────────────────────────────
   · v0.6-p3-2026-09-16（相对 v0.5-p2）：**P3 收口**——
     (1) **Escape 统一分发**：原 8 处 document 级 Esc 处理器（各自 if、互不阻断 → 一次 Esc 可能关多层）
         收编为 interact/keys.js 的 **closeTopLayer() 单点分发**（按"最上层优先"只关一层）；
         元素级 4 处（行内编辑框 / 配置窗表单体 / 命名模态框体 / 模板窗输入框）保留（stopPropagation 优先）；
     (2) **会话态收编**：跨模块可见的瞬时态（keyDir/keyVel/keyLoop/keyLastT/keyState、tplOpen/tplCur、
         spacePan、spliceMode）统一移入 core/store.js；模块内部专用态仍留各模块；
     (3) **PHJ 对外面收敛**：由"全部顶层符号"收敛为"**被他模块引用的顶层名**"（客观统计）：238 → 108，
         收敛掉 130 个内部符号（interact/keys 与 interact/paste 变为自包含、对外面为空）；
     (4) **修 1 个真 bug**：deleteTemplate 读已删字段 t.name（v6.13 起模板无名称）→ toast 恒显示 undefined，
         改为与 UI 一致的「模板 N」；
     (5) **判定 1 个"疑似 bug"非 bug**：copySpliced 的"开头空行"是 v6.21 有意规则（前缀段上方空行），
         由 A2a/A2c/A2d/A2e 四条断言锁定 → 保留不动；
     (6) **死代码扫描**：顶层声明 239 个，无"只声明未使用"者；
     (7) 新基线 PHJ_v7.11_20260916.html；闸门 7/7（83/18/16/47/18，新增 P3-A Escape 单点断言）；
     (8) PENDING 6 条全部判定并关闭（见下）。
   · v0.5-p2-2026-09-16（相对 v0.4-p2）：**P2 收口 = 模块划分落地 + 显式导出面**——
     (1) 合并：`view/canvas`（render+blocks）、`view/modals`（template+menu）、`interact/pointer`
         （selection+zoom+pan+drag）；拆分：`core/store` + `core/persist`（原 state）、`interact/paste`（原 boot）；
     (2) 17 个模块文件全部落地；每个文件末尾 `PHJ.<module> = {…}` **显式导出对外面**，`shell/head.js` 定义 `var PHJ = {}`；
     (3) `SLICES` 顺序 = **加载顺序**（由加载期副作用决定，见文件头 ★顺序不变式），17 条，**不建议按 deps 重排**；
     (4) `MODULES` 重写为**与实现一致**的清单（id/path/layer/deps/exports=PHJ.<id>）；`resolveOrder()` 保留备 P3；
     (5) 本阶段**改了字节**（合并/拆分 + 导出面）→ 新基线 `PHJ_v7.10_20260916.html`；闸门 **7/7 全绿**（83 / 18 / 16 / 46 / 18，体积 229609 B，容量限制已解除）。
   · v0.4-p2-2026-09-16（相对 v0.3-p2）：**P2 阶段二/三**——
     (1) `50-editor.js` 按职责切为 `editor/highlight.js` + `editor/block-editor.js`（行边界切分 → 拼接恒等）；
     (2) 余下 10 片改名归位（`core/state.js`、`view/render.js|template.js|menu.js|blocks.js`、
         `interact/selection.js|zoom.js|pan.js|drag.js`、`shell/boot.js`）→ **编号片 `js/` 目录消失**；
     (3) `SLICES` 20 条全部指向分层路径；`module` 取**文件级职责名**，架构师原稿里更粗的合并/拆分
         （canvas / modals / pointer / store+persist / boot+paste）标为 `open` 待评估——它们需重排
         （不相邻，或前半含共享声明），一旦执行**产物字节必变**，故另议；
     (4) 全程产物字节恒等（222381 B / `a6d3a6f6…`），闸门 7/7 全绿。\n   · v0.3-p2-2026-09-16（相对 v0.2-p1）：**P2 阶段一 = 纯搬迁（产物字节恒等）**——
     (1) 8 个模块迁入分层目录：`shell/head.js`、`core/clipboard.js`、`view/overlay.js`、`view/splice.js`、
         `editor/struct.js`、`editor/complete.js`、`editor/library.js`、`interact/keys.js`（**内容逐字节未改**，
         只用 `git mv`，故产物字节不变 = 222381 B）；
     (2) `SLICES` 条目新增 `module` / `layer` 字段：已迁者给出目标模块 id，未切者仍指向 `js/xx.js`
         并附「待拆 / 待合」注记；
     (3) 阶段一**不改顺序**，故 `SLICES` 仍是唯一顺序源；待全部模块迁完，再改由 `resolveOrder(MODULES)` 接管。
   · v0.2-p1-2026-09-16（相对 v0.1-draft-2026-09-15）：**接入 P1 止血**——
     (1) 新增 `SLICES`（19 条 JS，顺序 = 现有 index.html 的 `<script src>` 顺序）与
         `CSS`（9 条，顺序 = 现有 index.html 的 `<link rel=stylesheet>` 顺序）；
     (2) 本文件即成为构建的**唯一顺序源**（build.mjs 不再扫 index.html）；
     (3) `MODULES`/`LAYERS`/`V78_EDGES`/`resolveOrder()` 保留为 **P2 目标**，P1 用 `SLICES` 保序；
     (4) `PENDING` 保留（P2 的粒度开放问题）。
   · v0.1-draft-2026-09-15（相对 v0-draft-2026-09-14）：按 v7.8.2 现状校准——
     (1) 52-complete 的 resp 去「内置中性示例表（无私有资产）」，改为「内置风格包（＝v7.8 原文
         逐字，5 段 + 硬性要求）+ 生效表回落 + 资产导入/导出」；
     (2) 原「失效警告 / 勿据此施工」行改为「已同步」说明；
     (3) PENDING 第 5 条「资产导入/导出放置」由「本轮归入」改为**已交付**事实（P2 是否单立
         editor/asset 的开放问题保留）。
   ============================================================================ */

export const MANIFEST_VERSION = 'v0.6-p3';

/* ════════════════════════════════════════════════════════════════════════════
   P1 · 切片序列（SLICES / CSS）—— **当前构建的唯一顺序源**
   ----------------------------------------------------------------------------
   · file 为相对 `dev/src/` 的现片路径（P2 重切前沿用 00/10/… 编号片）。
   · 顺序 = 现有 dev/src/index.html 中 `<script src>` / `<link rel=stylesheet>` 的出现顺序
     （2026-09-16 从 index.html 实测抓取，逐条核对）。
   · build.mjs 依 `SLICES` 逐片拼接内联；`dev/src/index.html` 的 CSS 链顺序**必须**与
     下方 `CSS` 列表一致，否则构建**报错**（杜绝顺序漂移）。
   · P2 完成后本数组退役（改由 `resolveOrder(MODULES)` 决定）。
   ════════════════════════════════════════════════════════════════════════════ */

/* JS 源文件：**顺序 = 加载顺序**（首条 shell/head.js 首行即 'use strict';，末条 shell/wiring.js 末尾调 load()）
   ----------------------------------------------------------------------------
   P2 收口（2026-09-16）：全部 17 个模块文件已按 manifest 模块划分落地（合并 canvas/modals/pointer，
   拆分 store+persist、boot+paste），并在各文件末尾以 `PHJ.<module> = {…}` 显式导出对外面。
   ★ **顺序不变式（本文件最重要的约定）**：本数组的顺序由**加载期副作用**决定，不由 `deps` 决定——
     `deps` 描述的是**运行期调用关系**（函数声明提升 → 调用顺序与文件顺序无关）；
     真正对顺序敏感的是：① `addEventListener` 的**注册顺序**（同一事件按注册序调用 → Escape/keydown
     处理链、拖拽 vs 平移的 mousedown 优先级都靠它）；② 顶层 `var x = <表达式>` 的**初始化顺序**。
     当前顺序刻意保持与 v7.9 相同的**副作用注册序**：complete(DOMContentLoaded) → modals(contextmenu/click/
     keydown·Esc) → keys(keydown/keyup/blur) → pointer(pan keydown/keyup → drag blur/mousedown/move/up) → wiring(DCL/
     beforeunload/visibilitychange/load)。
     ⚠️ **不要**为了让顺序"等于 resolveOrder(MODULES) 的拓扑序"而重排本数组——那会改变上述注册序 → 行为改变。
     `resolveOrder()` 保留为 P3（模块真正隔离、deps 成为加载契约）时的参考工具。 */
export const SLICES = [
  { id: 'head',        module: 'head',        layer: 'shell',    file: 'shell/head.js' },
  { id: 'store',       module: 'store',       layer: 'core',     file: 'core/store.js' },
  { id: 'persist',     module: 'persist',     layer: 'core',     file: 'core/persist.js' },
  { id: 'clipboard',   module: 'clipboard',   layer: 'core',     file: 'core/clipboard.js' },
  { id: 'overlay',     module: 'overlay',     layer: 'view',     file: 'view/overlay.js' },
  { id: 'highlight',   module: 'highlight',   layer: 'editor',   file: 'editor/highlight.js' },
  { id: 'blockEditor', module: 'blockEditor', layer: 'editor',   file: 'editor/block-editor.js' },
  { id: 'struct',      module: 'struct',      layer: 'editor',   file: 'editor/struct.js' },
  { id: 'corpus',      module: 'corpus',      layer: 'skin',     file: 'skin/corpus.js' },
  { id: 'host',        module: 'host',        layer: 'editor',   file: 'editor/host.js' },   /* ★v7.15：宿主解析层（插在 corpus 之后：corpus 仍是第 9 位；host 无加载期副作用、只在运行期被引用） */
  { id: 'complete',    module: 'complete',    layer: 'editor',   file: 'editor/complete.js' },
  { id: 'library',     module: 'library',     layer: 'editor',   file: 'editor/library.js' },
  { id: 'canvas',      module: 'canvas',      layer: 'view',     file: 'view/canvas.js' },
  { id: 'splice',      module: 'splice',      layer: 'view',     file: 'view/splice.js' },
  { id: 'modals',      module: 'modals',      layer: 'view',     file: 'view/modals.js' },
  { id: 'write',       module: 'write',       layer: 'view',     file: 'view/write.js' },    /* ★v7.15：写作台视图（插在 modals 之后：view 层聚拢；DCL 在 complete 的 DCL 之后） */
  { id: 'keys',        module: 'keys',        layer: 'interact', file: 'interact/keys.js' },
  { id: 'paste',       module: 'paste',       layer: 'interact', file: 'interact/paste.js' },
  { id: 'pointer',     module: 'pointer',     layer: 'interact', file: 'interact/pointer.js' },
  { id: 'wiring',      module: 'wiring',      layer: 'shell',    file: 'shell/wiring.js' },
];

/* CSS 切片：顺序 = 现 index.html 的 <link rel=stylesheet> 顺序（构建据此校验） */
export const CSS = [
  { id: 'base',     file: 'styles/00-base.css' },
  { id: 'canvas',   file: 'styles/10-canvas.css' },
  { id: 'menu',     file: 'styles/20-menu.css' },
  { id: 'splice',   file: 'styles/30-splice.css' },
  { id: 'window',   file: 'styles/40-window.css' },
  { id: 'editor',   file: 'styles/50-editor.css' },
  { id: 'complete', file: 'styles/51-complete.css' },
  { id: 'library',  file: 'styles/52-library.css' },
  { id: 'write',    file: 'styles/55-write.css' },   /* ★v7.15：写作台样式（在 library 之后覆盖弹窗尺寸、让编辑器填满右栏；在 effects 之前使 reduced-motion 位于最末） */
  { id: 'effects',  file: 'styles/90-effects.css' },
];

/* 分层：skin（产品皮肤·领域内容）→ core（无 DOM 状态/持久）→ editor（纯引擎 + 窗口）
        → view（DOM 生成）→ interact（输入路由）→ shell（外壳/启动）。箭头 = 允许的依赖方向。
   ★R1（2026-09-17）：新增 **skin** 层——领域内容（语料/文案/默认值）的唯一边界。
     红线：core/** 与 editor/** **不得**引用 skin/**（引擎零领域语义）；skin 只放内容、不放机制。
   （P2 目标；P1 不据此排序。） */
export const LAYERS = ['skin', 'shell', 'core', 'editor', 'view', 'interact'];

/* ── 模块清单（P2 目标）────────────────────────────────────────────────────────
   id      : 稳定标识（= PHJ 命名空间二级名）
   path    : 目标文件（P2 重切后的物理位置）
   from    : v7.8 现片来源（19 片 JS 的搬迁映射——便于对照与回退）
   exports : 对外经 PHJ.* 暴露的符号（其余一律 **不导出**，IIFE 内私有）
   deps    : 显式依赖的模块 id（**顺序由此拓扑求解，不靠片号**）
   resp    : 一句话职责
   --------------------------------------------------------------------------- */
export const MODULES = [
  /* ── skin（★R1：产品皮肤——领域内容，引擎不引用）── */
  { id: 'corpus', path: 'src/skin/corpus.js', layer: 'skin', exports: [],
    deps: [],
    resp: '★R1 皮肤层：内置语料（CMPL_STYLE/CMPL_TAIL/CMPL_GROUPS/cmplFullStyle）。换皮肤即换本文件，引擎零改动' },

  /* ── shell ── */
  { id: 'head',  path: 'src/shell/head.js', layer: 'shell', exports: ['PHJ'], deps: [],
    resp: "IIFE 首行 + 'use strict' + PHJ 命名空间骨架" },
  { id: 'wiring', path: 'src/shell/wiring.js', layer: 'shell', exports: ['PHJ.wiring'],
    deps: ['store', 'persist', 'library', 'complete', 'keys', 'modals', 'paste'],
    resp: '★R2 唯一接线/启动入口（原 shell/boot.js，2026-09-17 只改名不拆）：事件接线 + 末尾 load()；P2 后不再含粘贴部分（已拆 interact/paste）' },

  /* ── core ── */
  { id: 'store',   path: 'src/core/store.js',   layer: 'core', exports: ['PHJ.store'],   deps: [],
    resp: '★唯一状态源：持久 state（含 state.cmpl）+ 会话 ui（selected/drag/pan/keyState…）+ 默认值/坐标工具' },
  { id: 'persist', path: 'src/core/persist.js', layer: 'core', exports: ['PHJ.persist'], deps: ['store'],
    resp: 'localStorage / 防抖 saveNow / migrate(v1→v14) / sanitize；LS 键与 version 契约的唯一持有者' },
  { id: 'clipboard', path: 'src/core/clipboard.js', layer: 'core', exports: ['PHJ.clipboard'], deps: [],
    resp: 'copyText / fallbackCopy / toast' },

  /* ── editor（纯引擎 + 窗口接线） ── */
  { id: 'highlight', path: 'src/editor/highlight.js', layer: 'editor', exports: ['PHJ.highlight'], deps: [],
    resp: '★纯函数引擎：零领域语义 tokenizer + 彩色层尺寸/滚动同步 + 状态栏' },
  { id: 'struct', path: 'src/editor/struct.js', layer: 'editor', exports: ['PHJ.struct'], deps: [],
    resp: '★结构层（节解析）：STRUCT_MARKS 单表 + structMap/structAt/structSummary；零 DOM、零私有资产' },
  { id: 'complete', path: 'src/editor/complete.js', layer: 'editor', exports: ['PHJ.complete'],
    deps: ['store', 'persist', 'struct'],
    resp: '★候选引擎：触发/评分/两级气泡/槽位 ${n}；内置风格包（＝v7.8 原文逐字）+ 生效表回落 + 资产导入/导出' },
  { id: 'library', path: 'src/editor/library.js', layer: 'editor', exports: ['PHJ.library'],
    deps: ['store', 'complete'],
    resp: '★片段库配置界面（浏览/改/增/删/排序/导入导出/恢复内置默认；改 state.cmpl）' },
  { id: 'blockEditor', path: 'src/editor/block-editor.js', layer: 'editor', exports: ['PHJ.blockEditor'],
    deps: ['highlight', 'struct', 'complete'],
    resp: '编辑器窗口接线（openBlockEditor/closeBlockEditor/fitBlkWidth）' },
  /* ★v7.15：宿主解析层——把「编辑器节点」抽象为宿主对象，内核按宿主寻址（缺省 = 弹窗宿主） */
  { id: 'host', path: 'src/editor/host.js', layer: 'editor', exports: ['PHJ.host'], deps: [],
    resp: '宿主解析层：hostPopup（#blkMask）/ hostDesk（#writeDesk）；el(name) 惰性解析并缓存宿主内节点' },

  /* ── view ── */
  { id: 'canvas', path: 'src/view/canvas.js', layer: 'view', exports: ['PHJ.canvas'], deps: ['store', 'persist'],
    resp: '块渲染归属地：buildCard/fitBlkWidth/autoSizeAll + render() 编排（P2 合并 20-render + 62-block-size）' },
  { id: 'splice', path: 'src/view/splice.js', layer: 'view', exports: ['PHJ.splice'], deps: ['store', 'canvas'],
    resp: '拼接栏：renderSplice/spItem/spUnit/copySpliced' },
  { id: 'overlay', path: 'src/view/overlay.js', layer: 'view', exports: ['PHJ.overlay'], deps: ['store'],
    resp: 'peek 光点 + 拼入光线（视角刷新只在此触发一次）' },
  { id: 'modals', path: 'src/view/modals.js', layer: 'view', exports: ['PHJ.modals'],
    deps: ['store', 'library', 'blockEditor'],
    resp: '通用 modal / 模板窗 / 预览窗 / 补全配置窗 / 右键菜单（P2 合并 40-template + 55-menu）' },
  /* ★v7.15：写作台视图（左大纲 + 右大编辑器；两视图同源、切视图按需拉取） */
  { id: 'write', path: 'src/view/write.js', layer: 'view', exports: ['PHJ.write'],
    deps: ['store', 'canvas', 'splice', 'modals', 'highlight', 'complete', 'host'],
    resp: '写作台视图：setView/applyView/renderWrite + 大纲增删移/拖序/切条/实时写回/门控键处理' },

  /* ── interact ── */
  { id: 'pointer', path: 'src/interact/pointer.js', layer: 'interact', exports: ['PHJ.pointer'],
    deps: ['store', 'canvas', 'splice'],
    resp: '多选 / 缩放 / 平移 / 拖拽：统一指针路由（P2 合并 30-selection + 64-zoom + 66-pan + 68-drag）' },
  { id: 'keys', path: 'src/interact/keys.js', layer: 'interact', exports: ['PHJ.keys'],
    deps: ['store', 'modals', 'blockEditor'],
    resp: '★方向键/空格平滑移动；Escape 统一分发仍属 P3' },
  { id: 'paste', path: 'src/interact/paste.js', layer: 'interact', exports: ['PHJ.paste'], deps: ['store', 'canvas'],
    resp: 'Ctrl+V 文本/图片粘贴为块（P2 由 90-boot 拆出）' },
];

/* ── ★v7.8 的 5 条隐式时序边 → 显式依赖（P2 目标）──────────────────────────────
   现状（src/index.html 片号顺序）只是"恰好：50 在 51/52 之前定义、调用发生在运行期"。
   重切后**不再依赖片号**，改由下表 deps 表达： */
export const V78_EDGES = [
  { edge: '50 → 51', was: 'block-editor 运行期调 structAt',        now: "block-editor.deps ∋ 'struct'" },
  { edge: '50 → 52', was: 'block-editor 运行期调 cmplReset 等',     now: "block-editor.deps ∋ 'complete'" },
  { edge: '52 → 51', was: 'complete 运行期调 structAt',            now: "complete.deps ∋ 'struct'" },
  { edge: '53 → 52', was: 'library 调 cmplActive/SetItems/...',    now: "library.deps ∋ 'complete'" },
  { edge: '90 → 52/53', was: 'boot 调 cmplCfg* / cmplBind/...',    now: "wiring.deps ∋ 'complete','library'" },
];

/* ── 拓扑求解：返回模块 id 的加载顺序（同层按清单出现序，跨层按 deps） ──
   （P2 目标；P1 构建**不**调用本函数，P1 用 SLICES 保序。） */
export function resolveOrder(mods = MODULES) {
  const byId = new Map(mods.map(m => [m.id, m]));
  const out = [], seen = new Set(), inStack = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    if (inStack.has(id)) throw new Error('循环依赖：' + id);
    const m = byId.get(id);
    if (!m) throw new Error('未知依赖：' + id);
    inStack.add(id);
    m.deps.forEach(visit);
    inStack.delete(id); seen.add(id); out.push(id);
  };
  /* 入口优先：head → ns → … → tail（tail 依赖 wiring，故最后） */
  visit('head');
  mods.forEach(m => visit(m.id));
  visit('tail');
  return out;
}

/* ── 与 dev/src/index.html 的关系（P1 已生效）─────────────────────────────────
   P1 起：index.html **不再手写** <script src>；由本清单**主导**：
     · 构建产物 PHJ.html：build.mjs 按 `SLICES` 顺序内联进**单个 <script>**，并用 IIFE 包裹；
     · 开发态 dev bundle：build.mjs 把**同一份逐字相同**的 IIFE 写入 dev/src/dev-bundle.js，
       index.html 只引这一个 → 保证 **dev≡prod**（同一份代码、同一严格作用域、同一字节）。
   校验：
     · build.mjs：index.html 的 CSS 链顺序 **必须** == 本清单 `CSS` 列表顺序（不一致即构建报错）；
     · 闸门：产物内联 JS 段 == dev/src/dev-bundle.js **逐字一致**（见 verify_v78.mjs）。 */

/* ── 需 Holly 评估后再定 / 待定项（P2 自述）─────────────────────────────────── */
export const PENDING = [
  /* ── 以下 6 条于 2026-09-16 由主理人按推荐判定并关闭（原为"待 Holly 评估"；结论均倾向"不增复杂度"）── */
  '【已判定·不拆】view/modals 再拆（模板窗 vs 右键菜单）：合并已足，拆只增文件数（两窗共用开合/遮罩与 tplCur 会话态）。',
  '【已判定·保持分开】core/store 与 core/persist：状态模型与"存储/迁移契约"分离，利于单测与迁移安全。',
  '【已判定·不拆】interact/pointer（selection+zoom+pan+drag 合）：指针路由集中一处反而更清晰，E5 的"统一指针路由"目标已达成。',
  '【已判定·不引入】PHJ.define/require（ns.js）：同处一个 IIFE 作用域已足够，引入 ns 只增代码与间接层；模块对外面已由 PHJ.<module> 显式表达。',
  '【已判定·不单立】editor/complete 的资产导入/导出：就近留在 complete（与内置表/生效表同源），单立 editor/asset 收益不足。',
  '【已关闭】目录命名与旧编号片的过渡映射：P2 收口后 src/ 已全部分层（js/ 目录消失），过渡映射不再需要。',
];

/* ── 默认导出 ── */
export default { MANIFEST_VERSION, SLICES, CSS, LAYERS, MODULES, V78_EDGES, PENDING, resolveOrder };
