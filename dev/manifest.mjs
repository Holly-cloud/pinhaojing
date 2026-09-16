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
      为事实陈述。当前现状以 dev/_build/snapshots/BASELINE_v7.9.md 为准。
   ── 变更记录 ──────────────────────────────────────────────────────────────
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

export const MANIFEST_VERSION = 'v0.4-p2';

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

/* JS 源文件：顺序 = 现 index.html 的 <script src> 顺序（首条 shell/head.js 首行即 'use strict';）
   P2 阶段一/二/三（2026-09-16）：全部 20 个源文件已按职责归入 shell/core/editor/view/interact，
   **编号片目录 `js/` 已消失**。以下三条不变式在 P2 全程成立，故产物字节恒等（222381 B / a6d3a6f6…）：
     ① 只搬家/改名 → 不动内容；② 只在行边界切分 → 拼接结果恒等；③ 顺序表逐条保持原相对次序。
   `module` = 本阶段认定的模块名；`open` = 架构师原稿里更粗的合并/拆分**仍待评估**（见 PENDING）。 */
export const SLICES = [
  { id: 'head',        module: 'head',         layer: 'shell',    file: 'shell/head.js' },
  { id: 'state',       module: 'state',        layer: 'core',     file: 'core/state.js',        open: '架构师原稿拆 store+persist：需重排（LS 键/vars 在文件头）→ 会改字节，另议' },
  { id: 'clipboard',   module: 'clipboard',    layer: 'core',     file: 'core/clipboard.js' },
  { id: 'render',      module: 'render',       layer: 'view',     file: 'view/render.js',       open: '架构师原稿并入 canvas（与 blocks 合）：两片不相邻，合并会重排 → 会改字节，另议' },
  { id: 'overlay',     module: 'overlay',      layer: 'view',     file: 'view/overlay.js' },
  { id: 'selection',   module: 'selection',    layer: 'interact', file: 'interact/selection.js', open: '架构师原稿并入 pointer（4 片合）：不相邻，另议' },
  { id: 'splice',      module: 'splice',       layer: 'view',     file: 'view/splice.js' },
  { id: 'template',    module: 'template',     layer: 'view',     file: 'view/template.js',     open: '架构师原稿并入 modals（与 menu 合）：不相邻，另议' },
  { id: 'highlight',   module: 'highlight',    layer: 'editor',   file: 'editor/highlight.js' },
  { id: 'blockEditor', module: 'block-editor', layer: 'editor',   file: 'editor/block-editor.js' },
  { id: 'struct',      module: 'struct',       layer: 'editor',   file: 'editor/struct.js' },
  { id: 'complete',    module: 'complete',     layer: 'editor',   file: 'editor/complete.js' },
  { id: 'library',     module: 'library',      layer: 'editor',   file: 'editor/library.js' },
  { id: 'menu',        module: 'menu',         layer: 'view',     file: 'view/menu.js',         open: '架构师原稿并入 modals，另议' },
  { id: 'keys',        module: 'keys',         layer: 'interact', file: 'interact/keys.js' },
  { id: 'blocks',      module: 'blocks',       layer: 'view',     file: 'view/blocks.js',       open: '架构师原稿并入 canvas，另议（本片实测藏着 buildCard 等「命名称谎」符号，已随改名归位）' },
  { id: 'zoom',        module: 'zoom',         layer: 'interact', file: 'interact/zoom.js',     open: '架构师原稿并入 pointer，另议' },
  { id: 'pan',         module: 'pan',          layer: 'interact', file: 'interact/pan.js',      open: '架构师原稿并入 pointer，另议' },
  { id: 'drag',        module: 'drag',         layer: 'interact', file: 'interact/drag.js',     open: '架构师原稿并入 pointer，另议' },
  { id: 'boot',        module: 'boot',         layer: 'shell',    file: 'shell/boot.js',        open: '架构师原稿拆出 interact/paste：会改字节，另议' },
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
  { id: 'effects',  file: 'styles/90-effects.css' },
];

/* 分层：core（无 DOM 状态/持久）→ editor（纯引擎 + 窗口）→ view（DOM 生成）
        → interact（输入路由）→ shell（外壳/启动）。箭头 = 允许的依赖方向。
   （P2 目标；P1 不据此排序。） */
export const LAYERS = ['shell', 'core', 'editor', 'view', 'interact'];

/* ── 模块清单（P2 目标）────────────────────────────────────────────────────────
   id      : 稳定标识（= PHJ 命名空间二级名）
   path    : 目标文件（P2 重切后的物理位置）
   from    : v7.8 现片来源（19 片 JS 的搬迁映射——便于对照与回退）
   exports : 对外经 PHJ.* 暴露的符号（其余一律 **不导出**，IIFE 内私有）
   deps    : 显式依赖的模块 id（**顺序由此拓扑求解，不靠片号**）
   resp    : 一句话职责
   --------------------------------------------------------------------------- */
export const MODULES = [
  /* ── shell ── */
  { id: 'boot', path: 'src/shell/boot.js', from: ['90-boot.js'], layer: 'shell',
    exports: ['PHJ.boot'], deps: ['store', 'persist', 'library', 'complete', 'keys', 'modals', 'paste'],
    resp: '唯一启动入口（PHJ.boot.init）：加载/迁移/首帧渲染/事件接线；末尾单点调用' },
  { id: 'head', path: 'src/shell/head.js', from: [], layer: 'shell',
    exports: ['PHJ'], deps: [], resp: "IIFE 首行 + 'use strict' + PHJ 命名空间骨架" },
  { id: 'tail', path: 'src/shell/tail.js', from: [], layer: 'shell',
    exports: [], deps: ['boot'], resp: 'IIFE 末行：唯一启动调用 PHJ.boot.init()' },

  /* ── core ── */
  { id: 'ns', path: 'src/core/ns.js', from: [], layer: 'core',
    exports: ['PHJ.define', 'PHJ.require'], deps: [], resp: '极简 define/require（≈20 行，零依赖）；仅用于模块间解析' },
  { id: 'store', path: 'src/core/store.js', from: ['10-state.js（持久模型部分）'], layer: 'core',
    exports: ['PHJ.store'], deps: ['ns'],
    resp: '★唯一状态源：持久 state（含 state.cmpl） + 会话 ui（selected/drag/pan/keyState…）；订阅通知（干 E1）' },
  { id: 'persist', path: 'src/core/persist.js', from: ['10-state.js（load/save/migrate 部分）'], layer: 'core',
    exports: ['PHJ.persist'], deps: ['ns', 'store'],
    resp: 'localStorage / 防抖 / migrate(v1→v14) / sanitize / 导入导出；LS 键与 version 契约的**唯一持有者**' },
  { id: 'clipboard', path: 'src/core/clipboard.js', from: ['15-clipboard.js'], layer: 'core',
    exports: ['PHJ.clipboard'], deps: ['ns'], resp: 'copyText / fallbackCopy / toast' },

  /* ── editor（纯引擎 + 窗口接线） ── */
  { id: 'highlight', path: 'src/editor/highlight.js', from: ['50-editor.js（HL_* 引擎）'], layer: 'editor',
    exports: ['PHJ.highlight'], deps: ['ns'],
    resp: '★纯函数引擎：零领域语义 tokenizer（classify/toHTML/status）；输入文本→分类，可单测' },
  { id: 'struct', path: 'src/editor/struct.js', from: ['51-struct.js'], layer: 'editor',
    exports: ['PHJ.struct'], deps: ['ns'],
    resp: '★结构层（节解析）：STRUCT_MARKS 单表 + structMap/structAt/structSummary；零 DOM、零私有资产（只认符号 风格：/硬性要求：/【…】）' },
  { id: 'complete', path: 'src/editor/complete.js', from: ['52-complete.js'], layer: 'editor',
    exports: ['PHJ.complete'], deps: ['ns', 'store', 'persist', 'struct'],
    resp: '★候选引擎：触发/评分/两级气泡/槽位 ${n}；**内置风格包**（＝v7.8 原文逐字，5 段 + 硬性要求）+ 生效表回落 + 资产导入/导出' },
  { id: 'library', path: 'src/editor/library.js', from: ['53-library.js'], layer: 'editor',
    exports: ['PHJ.library'], deps: ['ns', 'store', 'complete'],
    resp: '★片段库配置界面（浏览/改/增/删/排序/导入导出/恢复内置默认；改 state.cmpl）' },
  { id: 'block-editor', path: 'src/editor/block-editor.js', from: ['50-editor.js（窗口接线部分）'], layer: 'editor',
    exports: ['PHJ.blockEditor'], deps: ['ns', 'store', 'highlight', 'struct', 'complete'],
    resp: '编辑器窗口接线（openBlockEditor/closeBlockEditor 等）；依赖 highlight/struct/complete' },

  /* ── view ── */
  { id: 'canvas', path: 'src/view/canvas.js', from: ['20-render.js', '62-block-size.js'], layer: 'view',
    exports: ['PHJ.canvas'], deps: ['ns', 'store', 'persist'],
    resp: '块渲染归属地：buildCard/fitBlock/autoResize/arrangeAll + render() 编排（干 E2/E3「命名说谎」）' },
  { id: 'splice', path: 'src/view/splice.js', from: ['35-splice.js'], layer: 'view',
    exports: ['PHJ.splice'], deps: ['ns', 'store', 'canvas'],
    resp: '拼接栏：renderSplice/spItem/spUnit/copySpliced' },
  { id: 'overlay', path: 'src/view/overlay.js', from: ['25-overlay.js'], layer: 'view',
    exports: ['PHJ.overlay'], deps: ['ns', 'store'], resp: 'peek 光点 + 拼入光线（视角刷新只在此触发一次）' },
  { id: 'modals', path: 'src/view/modals.js', from: ['40-template.js', '55-menu.js'], layer: 'view',
    exports: ['PHJ.modals'], deps: ['ns', 'store', 'library', 'block-editor'],
    resp: '通用 modal / 模板窗 / 预览窗 / ★补全配置窗 / 右键菜单（统一开合与遮罩）' },

  /* ── interact ── */
  { id: 'pointer', path: 'src/interact/pointer.js', from: ['30-selection.js', '64-zoom.js', '66-pan.js', '68-drag.js'], layer: 'interact',
    exports: ['PHJ.pointer'], deps: ['ns', 'store', 'canvas', 'splice'], resp: '拖/平移/缩放/多选：统一 mousedown/move/up 路由（干 E5）' },
  { id: 'keys', path: 'src/interact/keys.js', from: ['60-keyboard.js'], layer: 'interact',
    exports: ['PHJ.keys'], deps: ['ns', 'store', 'modals', 'block-editor'],
    resp: '★方向键/空格 + 统一 Escape 分发（显式 modal 栈；收编 v7.8 新增 3 处，干 E4′）' },
  { id: 'paste', path: 'src/interact/paste.js', from: ['90-boot.js（粘贴部分）'], layer: 'interact',
    exports: ['PHJ.paste'], deps: ['ns', 'store', 'canvas'], resp: 'Ctrl+V 文本/图片粘贴为块' },
];

/* ── ★v7.8 的 5 条隐式时序边 → 显式依赖（P2 目标）──────────────────────────────
   现状（src/index.html 片号顺序）只是"恰好：50 在 51/52 之前定义、调用发生在运行期"。
   重切后**不再依赖片号**，改由下表 deps 表达： */
export const V78_EDGES = [
  { edge: '50 → 51', was: 'block-editor 运行期调 structAt',        now: "block-editor.deps ∋ 'struct'" },
  { edge: '50 → 52', was: 'block-editor 运行期调 cmplReset 等',     now: "block-editor.deps ∋ 'complete'" },
  { edge: '52 → 51', was: 'complete 运行期调 structAt',            now: "complete.deps ∋ 'struct'" },
  { edge: '53 → 52', was: 'library 调 cmplActive/SetItems/...',    now: "library.deps ∋ 'complete'" },
  { edge: '90 → 52/53', was: 'boot 调 cmplCfg* / cmplBind/...',    now: "boot.deps ∋ 'complete','library'" },
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
  /* 入口优先：head → ns → … → tail（tail 依赖 boot，故最后） */
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
  '切的粒度：是否把 view/modals 再拆（模板窗 vs 右键菜单）——当前合以减少跨片 churn。',
  'core/store 与 core/persist 是否合并（当前分开：迁移/存储契约与状态分离，便于单测）。',
  'interact/pointer 收纳 4 片（selection/zoom/pan/drag）是否过粗——评估后或拆 pointer/gestures。',
  'PHJ.define/require（ns.js）是否值得引入：若只用"定义时注册 + 启动时按 manifest 顺序执行"，可省 ns.js（更少代码）。',
  'editor/complete 的资产导入/导出放置：**已在 v7.8.1 交付并保留至今**，落在 complete（就近）；P2 是否单立 editor/asset（开放）。',
  '模块目录命名（core/view/editor/interact）与 src 现有 00/10/… 编号片的过渡映射是否一次到位。',
];

/* ── 默认导出 ── */
export default { MANIFEST_VERSION, SLICES, CSS, LAYERS, MODULES, V78_EDGES, PENDING, resolveOrder };
