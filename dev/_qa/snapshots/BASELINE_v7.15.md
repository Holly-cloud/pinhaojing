# 交付快照指纹 · PHJ.html v7.15（2026-09-18）

> **本轮性质 = 界面切换 + 「写作台」视图**（增量需求 `增量需求_界面切换与写作台_2026-09-18.md`，
> 增量设计 `界面切换与写作台_设计_2026-09-18.md`）。
> 一句话：顶栏新增**胶囊分段控件「写作｜画布」**，把「当前视图」提升为**会话态**（默认 **写作**）；
> 画布视图原样保留；新增**写作台视图**（左大纲 + 右大编辑器），两视图**同源**（同一份 `state.blocks`）；
> 写作台右栏**复用既有 coding 编辑器内核**（新增「宿主解析层」`editor/host.js`）；
> 线性顺序由**新增字段 `block.order`** 承载（`state.version` **14 → 15**，`migrate()` 零丢失补齐）。
> 行为增量为**纯新增**：既有画布 / 拼接 / 模板 / 片段库 / 弹窗编辑器 / 导出格式 / 皮肤边界**一律不动**。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.15（`state.version` = **15**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **264162** |
| **sha256** | **cc383db0d07c9f7e91f49093c2e1e1b6e40b9787dcb4c4cc4e55908d7e804087** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.15_20260918.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.14 = **230515 B**（sha256 `19d762a2…9fa6`）→ 本轮 **+33647 B** |

---

## 一、本轮变更要点（v7.14 → v7.15）

### ① `state.version` 14 → 15 · `block.order` 迁移（零丢失）

- **唯一结构变化** = 每个**文本块**多一个字段 `order`（整数 ≥ 0）；其余字段（`pan/zoom/splice/templates/cmpl/collapsed/title`）逐字不动。
- `migrate(d)` 的块投影改为：先按既有规则算 `x/y` 兜底，再按 **`(hasOrd → order → y → x → i)`** 排序，
  最后**覆盖写**连续 `order = 0..N-1`（`id/text/x/y` 原样保留）。
  - `hasOrd = Number.isInteger(b.order) && b.order >= 0`；`i` = 原数组下标（全序唯一兜底）。
  - **老数据（无 `order`）→ 全部 `hasOrd=false`** → 排序退化为 `(y, x, i)`，与既有「整」的 `(a.y-b.y)||(a.x-b.x)` **同源**
    → 老用户首次进写作台，大纲顺序 = **画布自上而下**（不出现字母序/随机序）。
- `persist.js`：返回 `version: 15`；`load()` 阈值 `d.version < 15` → `saveNow()`（把补齐后的结构落盘）。
- `store.js`：`defaultState().version` → **15**，默认示例块加 `order: 0`；新增 `normalizeOrder()`（按同一规则惰性归一 `0..N-1`，变更返回 `true`）。
- **逐条零丢失**：块、`splice.items`、`templates`、`cmpl.items` 全部经既有规范化逻辑保留（本次只**多**写一个 `order`）。

### ② 「宿主解析层」`editor/host.js`（新）与编辑器内核宿主化

- 新增 `makeHost(id, rootId, map)`：把「一套编辑窗口节点」抽象为**宿主对象**，`host.el(name)` 以 `root.querySelector(选择器)`
  **作用域化 + 惰性缓存**解析节点；`host.inval()` 清缓存。
- `hostPopup`（root `#blkMask`）复用既有 id；`hostDesk`（root `#writeDesk`）用独立 `wd*` id。
- `editor/highlight.js`：4 处单例查找（`#blkInput`/`.blk-hl`/`#blkHl`/`#stLine…`）改为 **`host.el(…)`**；
  `hlRefresh/hlSyncBox/hlStatus` 增**可选 `host`**（缺省 `hostPopup`）；模块级 `_hlCode/_hlPre` 单例**移除**（缓存挂宿主）。
- `editor/complete.js`：`cmplTa/cmplPop` 改按宿主寻址；`cmplOnInput/cmplKeydown/cmplBind/blkCopyAll` 增可选 `host`；
  `#blkCopy` → `host.el('copy')`；`cmplCommit` 里 `fitBlkWidth()` **仅弹窗宿主**执行；
  **新增 1 条 DCL** `cmplBind(hostDesk)`（**非 keydown**，不影响 P2-A/P3-A）。
- `editor/block-editor.js`：仅注释（`openBlockEditor/closeBlockEditor/fitBlkWidth` 固定弹窗宿主，**语句不变**）。
- **既有零参调用行为逐字不变**（缺省宿主 = `hostPopup`）；事件回调须传宿主处用守卫 `host && host.el ? host : hostPopup`，
  使「被当作事件处理器调用（实参是 Event）」与「零参调用」都落到弹窗宿主。

### ③ 写作台视图 `view/write.js`（新）+ 样式 `styles/55-write.css`（新）

- 双栏（左 `#wdOutline` 大纲 + 右 `#wdPane` 大编辑器），两栏各自独立滚动，右栏编辑器**填满**（覆盖 `.blk-input{height:80vh}`）。
- 展示：拖手 ⠿ / 序号 / 首行摘要 / 字数 / 当前项高亮 / 空态「（空分镜）」；**图片块不入大纲、不计数**。
- 操作：`#wdAdd` 新建、条目点击/右键切条、`Alt+↑/↓` 切条、`Alt+Shift+↑/↓` 上下移、`Alt+Enter` 新条、`Alt+Backspace` 删条、
  拖拽排序（改 `order` → `normalizeOrder` → 重排 + `saveNow` + toast「已调整顺序（不影响画布位置）」）。
- **实时写回**（`#wdInput` 输入 → 改块文本 + 局部更新左栏行摘要 + `scheduleSave`）；`#wdStrip`「移除空行」；`#wdCopy`「复制全文」。
- `setView(v)`（编排总控）：`flush()` → 离开视图收尾（离开写作台 `cmplReset(hostDesk)`；离开画布 `closeBlockEditor()`）
  → `activeView = v` → **拉取目标视图**（canvas `render()` / write `renderWrite()`）→ `applyView()` → `scheduleSave()`。**单向刷新、不成环**。
- `applyView()`：切 `body.view-write/view-canvas` + 胶囊 `.active` + **`#writeDesk` 的 `hide` 类随视图同步**
  （进入写作**移除**、离开**加回**）。
  > ★**补记（QA Round 1 复核发现的源码 bug）**：首版 `applyView()` **漏切 `#writeDesk` 的 `hide` 类** →
  > `index.html` 初始 `class="write-desk hide"` 下的 `display:none` 恒生效 → **默认写作视图整块不可见**、
  > `#wdInput` 不可聚焦（P0-9 写作台写回连带失效）。已修：`view/write.js` 的 `applyView()` 内加一行
  > `desk.classList.toggle('hide', activeView !== 'write')`（单点、最小）。修复因无 T03 可见性断言故此前闸门未捕获；
  > W 组已将该隐式契约显式锁定（`#writeDesk` 在 `#blkMask` **之后** + 写作视图下可见）。
- `view/modals.js`：既有 `#ctxMenu` 点击分发**新增 3 分支** `wd-del` / `wd-up` / `wd-down`（复用现有菜单与 `closeTopLayer`）。

### ④ 输入路由门控（`keys.js` / `pointer.js` / `wiring.js`）——**不新增任何 key 监听**

| # | 文件 | 改动 |
|---|---|---|
| G1 | `interact/keys.js` | **既有** document keydown 顶部加「写作视图分支」：`Alt+*` 写作键 + 左栏 `↑/↓` 导航 + **一律不动画布**（在原「输入态豁免」之前 → 焦点在右栏编辑器时 `Alt+*` 仍生效） |
| G2 | `interact/pointer.js` | **既有**空格 keydown 顶部加 `if(activeView==='write') return;` |
| G3 | `interact/pointer.js` | `onMouseDown` 顶部加同一门控（覆盖 空白平移 / Ctrl+左键多选 / 点块置顶 / 点空白清焦点） |
| G4 | `shell/wiring.js` | 画布 `dblclick`（防御）顶部加写作视图门控 |
| G5 | `shell/wiring.js` | 画布 `wheel`（防御）顶部加写作视图门控 |
| — | `shell/wiring.js` | DCL 内接线 `#viewSwitch` 两段点击 → `setView`（**不新增 key 监听**） |

- **G6（右键菜单）不改**：画布右键菜单本就 `closest('.canvas')` 门控 → 写作台天然不触发；写作台用**自己的条目右键菜单**（复用 `openCtxMenu`）。
- **G7（Esc 分发）不改**：`Esc` 语义不变（关最上层；条目菜单用的就是 `#ctxMenu`，已被 `closeTopLayer` 覆盖）。

### ⑤ 写作台「领域文案」落层（R3 棘轮口径）

- 写作台领域文案 = **视图层 CJK 字面量**（`view/write.js`）+ `index.html` 静态标记；**不写进 `skin/`**。
- 实测（`node dev/_qa/lib/skin-guard.mjs`）：**R3-A 命中 15 ≤ golden 15 → PASS**；**R3-B 命中 0 → PASS**。
  `DOMAIN_HITS_GOLDEN` 保持 **15 不上调**。
- 写作台文案逐词验算**不含**任何 146 个皮肤词元子串，且不含 `【…】` 完整标记串 / 40+ 字长语料。

---

## 二、`PHJ` 对外面变更（★扩大对外面，已同步 P2-B / P2-B2 契约）

| 模块 | 变化 | 内容 |
|---|---|---|
| **新增** `host` | 新键 | `PHJ.host = { hostPopup, hostDesk }` |
| **新增** `write` | 新键 | `PHJ.write = { setView, applyView, renderWrite, wdNew, wdDel, wdMove, wdSelect, wdKeydown, wdContext, focusDeskEditor }` |
| `store` | +2 名 | `+ activeView`、`+ normalizeOrder`（其余 21 名不动） |
| 其余 15 个模块 | **不变** | 既有导出名逐名不变（只加了**参数**，未加导出） |

- 结果：`PHJ` 模块键 **16 → 18**（`P2_MODULES` +`host`,`write`）；`P2_EXPORTS_GOLDEN` 同步（+`host`/`write` 两条、`store` +2 名）→ 导出名合计 **108 → 122**。
- 新顶层声明（进测试产物访问器，**不泄漏到 window**，P1-D 仍空集）：`hostPopup`/`hostDesk`/`activeView`/`normalizeOrder`/`setView`/`applyView`/`renderWrite`/`wdNew`/`wdDel`/`wdMove`/`wdSelect`/`wdKeydown`/`wdContext`/`focusDeskEditor` 等。
- **`LS_KEY` 不变**（`storyboard-prompt-panel:v1`）；`migrate` **只加** `order`，不减字段。

---

## 三、★ 对既有闸门的适配（**判定式与条数不变**）

### 3.1 因「默认视图 = 写作」而加的 **setup preamble**（每套件一行）

> 既有 4 套 CDP 套件默认**画布可见/可点**（点 `#btnArrange`/按块坐标驱动鼠标/经 `.block [data-action=zoom]` 开弹窗）。
> 产品默认写作台后画布被隐藏 → 不 preamble 会大量**假红**。措施：加载完成后切回 `canvas`（**零新增/零删除断言、零判定式改动**）。

| 套件 | 插入位置 | 形式 |
|---|---|---|
| `verify_v7.mjs` | 单次导航后 | `setView('canvas')` |
| `verify_v76.mjs` | 导航后 | `setView('canvas')` |
| `verify_v77.mjs` | 导航后 | `setView('canvas')` |
| `verify_v78.mjs` | 3 处导航（初始 / H19 复位 reload / X4 reload）后各一行 | `setView('canvas')` |
| `diag/probe_dev_index.mjs` | 导航后 | **优先 `setView('canvas')`；dev 页加载的是 IIFE 产物、`setView` 非全局 → 回落点顶栏「画布」段**（真实 UI，幂等） |

### 3.2 因契约/版本变化而更新的期望值（**条数不变**）

| 文件 | 现状 → 改为 |
|---|---|
| `verify_v78.mjs` `P2_MODULES` | 16 键 → **18 键**（+`host`,`write`；文案同步） |
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN` | `store` +`activeView`+`normalizeOrder`；新增 `host`/`write` 两条 |
| `verify_v78.mjs` `I7` / `I7b` / `X4` | `version` 期望 `14` → **`15`**（含文案） |
| `run-gate.mjs:9` | 期望 `230515 B` → **`263761 B`** |
| `verify_build_equivalence.mjs` `OLD` | `PHJ_v7.14_20260917.html` → **`PHJ_v7.15_20260918.html`** |

### 3.3 ★ 一处**产品 DOM 顺序**决策（写作台置于 `#blkMask` 之后）

> **背景**：写作台右栏**复用既有排版类**（`.blk-edit`/`.blk-hl`/`.blk-input`/`.blk-status`/`.cmpl-pop`，与弹窗编辑器同型，
> 保证彩色层/编辑层排版一致，见设计 §9）；而 `verify_v76` 的 F6/F10/F18、`verify_v78` 的 H3 等断言用
> **全局单值查询** `document.querySelector('.blk-edit')`/`('.blk-hl')` 定位**弹窗**编辑器节点。
>
> **若写作台置于 `#blkMask` 之前**：全局 `querySelector` 取**第一个** → 命中**隐藏的**写作台节点（`getBoundingClientRect` 全 0）
> → 这些**坐标类**断言假红（实测：F6/F10/F18 三条红）。
>
> **决策**：把 `#writeDesk` 置于 `#blkMask`（及 `#cmplCfgMask`）**之后**（DOM 末位）。`.write-desk` 为 `position:fixed`，
> DOM 顺序**不影响布局**；置末位后单值全局查询仍命中弹窗（第一个） → **判定式零改动**即全绿。
> （多值查询 `querySelectorAll('.blk-hl .hl-line')` 出现在 H14，但该断言只比较**弹起前后**两值相等、不比较绝对值，故不受影响。）

---

## 四、构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **264162 B**，sha256 `cc383db0d07c9f7e91f49093c2e1e1b6e40b9787dcb4c4cc4e55908d7e804087` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.15_20260918.html`（逐字节相同） |
| CSS 片序（10） | 00-base · 10-canvas · 20-menu · 30-splice · 40-window · 50-editor · 51-complete · 52-library · **55-write(新)** · 90-effects |
| JS 片序（20） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤)** · **host(新)** · complete · library · canvas · splice · modals · **write(新)** · keys · paste · pointer · wiring |

## 五、模块规模（v7.15 实测，构建期 `wc -l` 口径）

| 模块 | 行数 | | 模块 | 行数 |
|---|---:|---|---|---:|
| `interact/pointer.js` | 534 | | `view/canvas.js` | 183 |
| `editor/complete.js` | 475 | | `editor/highlight.js` | 172 |
| `view/modals.js` | 475 | | `core/persist.js` | 147 |
| **`view/write.js`** | **422** | | `editor/struct.js` | 87 |
| `editor/library.js` | 387 | | `interact/keys.js` | 84 |
| `shell/wiring.js` | 285 | | `skin/corpus.js` | 84 |
| `view/splice.js` | 241 | | `core/store.js` | 81 |
| `view/overlay.js` | 168 | | `interact/paste.js` | 57 |
| **`editor/host.js`** | **48** | | `core/clipboard.js` | 48 |
| `shell/head.js` | 44 | | `editor/block-editor.js` | 33 |

## 六、回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = **8/8 全绿**，退出码 0）

| 闸门 | 结果 |
|---|---|
| 构建 | **264162 B** |
| 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.15_20260918.html`） |
| `verify_v7.mjs` | **83/83** |
| `verify_v76.mjs` | **18/18** |
| `verify_v77.mjs` | **16/16** |
| `verify_v78.mjs` | **54/54** |
| `probe_dev_index.mjs` | **18/18** |
| `verify_w.mjs`（**QA 新增 W 组**） | **21/21** |

## 七、守门人自查（**必须仍绿**，本轮实测全绿）

- `P2-A`（keydown/keyup/blur 注册序 8 条）与 `P3-A`（document keydown 3 处 / 含 Esc 1 处）—— 本次**不新增监听** → 仍绿。
- `P1-A`（dev≡prod 逐字）、`P1-C`（测试产物逐行 diff 恰 +1 行）、`P1-D`（window 全局增量空集）—— 新顶层声明都在 IIFE 内 → 仍绿。
- `R1` / `R3-A`（= 15 ≤ 15）/ `R3-B`（= 0）/ `R3-C` / `R4` —— 皮肤层**未改**、文案落视图层且无词元子串 → 仍绿。
- `verify_v78.H19`（内置风格包逐字）、`verify_v7` A 组空行规则、`v76/v77` 着色/台词区 —— 相关机制未触碰 → 仍绿。

## 八、已知遗留 / 下一步

- **`W` 组断言（写作台行为）**：由 QA 另立 `verify_w.mjs`，共 **21 条**（默认视图 / 胶囊切换 / 同源同步 / 拖序 order / 门控 ×4 / 空态 / 图片块不入大纲 / 迁移 v14→v15 / 实时写回 / 快捷键 ×4 / **隐式契约锁定 W11** / order 边界 / 全序稳定 / pan-zoom 保留 / 超长文本），本轮全绿。
  > 其中 **W11** 把「`document.querySelector('.blk-hl')`/`.blk-edit` 必须解析到 `#blkMask`（弹窗宿主），且 `#blkMask` 先于 `#writeDesk`」这一**隐式契约显式锁定** → 若将来有人调错 DOM 顺序会立刻报红（本轮 §三.3 的决策由此获得机器守卫）。
- **窄窗口双栏**：本轮**固定宽度**（320px 左栏），窄窗给最小宽度 + 水平滚动，**不做折叠**（设计 §11 U2）。
- **图片块提示 / 画布 `order` 角标 / 「记忆上次视图」/ 条目「⋮」菜单**：均**本轮不做**（设计 §11 U3/U4/U6/U8）。
- **拖拽排序**：采用 **HTML5 DnD**（与 `.tpl-card`/片段库同型；实测 `file://` 下表现正常，未降级）。
- **编辑器内核「实例化」（B 方案）**：仍不做——两视图**互斥**，单份运行态天然够用（设计 §5.2）。

## 九、自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 264162 B
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A 命中 15 ≤ golden 15；R3-B 长语料5+完整标记串6 命中 0
node dev/_qa/run-gate.mjs                       # 期望：8/8 全绿（83/18/16/54/18/21），退出码 0
node dev/_qa/diag/probe_dev_index.mjs           # 开发态 18/18（需先起 headless 浏览器）
```
