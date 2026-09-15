/* ============================================================================
   拼好镜 · 模块清单（manifest）· 草案 v0（Q4 交付物）
   ----------------------------------------------------------------------------
   状态：**草案（draft）** —— 供 Holly 评估切分粒度后再定；本轮不接入构建。
   放置：dev/manifest.mjs（**dev 根，故意不进 dev/src/**，否则会被 build.mjs 当切片内联）。

   作用（P1/P2 起生效）：成为**唯一顺序源**——
     · build.mjs 读它 → 按解析出的顺序内联模块 → 拼成单文件 PHJ.html；
     · dev/src/index.html 的 <script src> 由它**生成/校验**（不再手写 19 个散列引用 →
       根治 E6′「dev≠prod」与「顺序漂移」）。
   本文件即"依赖即契约"：每条 deps 都是**显式**的，替代现在靠片号 00→90 的**隐式时序**。

   红线（不变）：产物单文件、经典脚本（无 type=module/import）、零运行时依赖、构建期零依赖。
   —— 本清单**只描述源码结构**，不改变交付物形态。

   ★ = v7.8 新增片（51-struct/52-complete/53-library）；本稿把它们纳入 P2（Q8）。
   ⚠️ 2026-09-15 更新：本清单里 52-complete 的「内置中性示例表」描述已被 **v7.8.2 撤销**
      （Holly 认定风格包即语料的一部分，52-complete 已恢复真实风格包内置）。**历史留档，勿据此施工**；
      当前现状见 dev/_build/snapshots/BASELINE_v7.8.2.md。
   ============================================================================ */

export const MANIFEST_VERSION = 'v0-draft-2026-09-14';

/* 分层：core（无 DOM 状态/持久）→ editor（纯引擎 + 窗口）→ view（DOM 生成）
        → interact（输入路由）→ shell（外壳/启动）。箭头 = 允许的依赖方向。 */
export const LAYERS = ['shell', 'core', 'editor', 'view', 'interact'];

/* ── 模块清单 ────────────────────────────────────────────────────────────────
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
    resp: '★候选引擎：触发/评分/两级气泡/槽位 ${n}；**内置中性示例表**（无私有资产）+ 生效表回落 + 资产导入/导出' },
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

/* ── ★v7.8 的 5 条隐式时序边 → 显式依赖 ──────────────────────────────────────
   现状（src/index.html 片号顺序）只是"恰好：50 在 51/52 之前定义、调用发生在运行期"。
   重切后**不再依赖片号**，改由下表 deps 表达： */
export const V78_EDGES = [
  { edge: '50 → 51', was: 'block-editor 运行期调 structAt',        now: "block-editor.deps ∋ 'struct'" },
  { edge: '50 → 52', was: 'block-editor 运行期调 cmplReset 等',     now: "block-editor.deps ∋ 'complete'" },
  { edge: '52 → 51', was: 'complete 运行期调 structAt',            now: "complete.deps ∋ 'struct'" },
  { edge: '53 → 52', was: 'library 调 cmplActive/SetItems/...',    now: "library.deps ∋ 'complete'" },
  { edge: '90 → 52/53', was: 'boot 调 cmplCfg* / cmplBind/...',    now: "boot.deps ∋ 'complete','library'" },
];

/* ── 拓扑求解：返回模块 id 的加载顺序（同层按清单出现序，跨层按 deps） ── */
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

/* ── 与 dev/src/index.html 的关系 ─────────────────────────────────────────────
   P1 起：index.html **不再手写** <script src>；由本清单生成：
     · 构建产物 PHJ.html：build.mjs 按 resolveOrder() 内联进**单个 <script>**；
     · 开发态 dev bundle：索引同一顺序，保证 **dev≡prod**（同一份代码、同一严格作用域）。
   校验：若 index.html 的引用序 ≠ resolveOrder() → 构建/闸门**报错**（杜绝顺序漂移）。 */

/* ── 需 Holly 评估后再定 / 待定项（DRAFT 自述） ─────────────────────────────── */
export const PENDING = [
  '切的粒度：是否把 view/modals 再拆（模板窗 vs 右键菜单）——当前合以减少跨片 churn。',
  'core/store 与 core/persist 是否合并（当前分开：迁移/存储契约与状态分离，便于单测）。',
  'interact/pointer 收纳 4 片（selection/zoom/pan/drag）是否过粗——评估后或拆 pointer/gestures。',
  'PHJ.define/require（ns.js）是否值得引入：若只用"定义时注册 + 启动时按 manifest 顺序执行"，可省 ns.js（更少代码）。',
  'editor/complete 的资产导入/导出放置：本轮归入 complete（就近）；P2 是否单立 editor/asset。',
  '模块目录命名（core/view/editor/interact）与 src 现有 00/10/… 编号片的过渡映射是否一次到位。',
];

/* ── 默认导出 ── */
export default { MANIFEST_VERSION, LAYERS, MODULES, V78_EDGES, PENDING, resolveOrder };
