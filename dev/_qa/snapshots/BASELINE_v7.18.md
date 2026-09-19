# 交付快照指纹 · PHJ.html v7.18（2026-09-19）

> **本轮性质 = 结构增量（多项目容器）+ 缺陷修复（渲染时机）**：
> ① **需求③ 多项目容器**：把「单文档」升级为「一个工作台里放多个项目」，顶栏新增「项目」入口（切换 / 新建 / 重命名 / 删除）；
>    **顶层 live 字段（`blocks/pan/zoom/splice/title/collapsed`）成为活动项目槽的同引用镜像** → 既有消费者（canvas / write / splice / pointer / paste / keys / overlay）**零改动**；
>    `state.version` 16 → **17**；`LS_KEY` 不变。
> ② **需求②「间距不均」渲染时机修复**：`setView` 切「画布」时**先切显隐类、再渲染**（方案 A）+ `autoResize` 隐藏态（`scrollHeight===0`）**不写 `height:0px`**（方案 B 加固）→ 消除「重开后块高塌陷 / 间距不均」。
> ③ 并入上一轮（v7.18 中间态）**paste 修复**：编辑器（`#blkInput` / `#wdInput` / `.block-text`）内 Ctrl+V 不再被画布抢占。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.18（`state.version` = **17**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **304151** |
| **sha256** | **df22b5903fdcbe39cc6eae873b40689b6ed9fc37a7de46eb2609f2f848f91e71** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.18_2026-09-19.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.17 = **288444 B**（sha256 `d943d616…fd4b8`）→ 本轮 **+15707 B** |

---

## 一、本轮变更要点（v7.17 → v7.18）

> 需求③（多项目）走「架构设计文档」（`dev/docs/design/多项目_设计_2026-09-19.md`）；需求②（渲染时机）走根因调查文档（`排布错位_调查`）。Engineer 按 T01–T04 落地。

### ① 数据层：多项目容器（`core/store.js` / `core/persist.js`）

- **项目槽**：`newProjectSlot(title) → { id, title, blocks, pan, zoom, splice, collapsed }`（`id` 用既有 `uid()`；默认名 `未命名项目`）。
- **`defaultState()`**：`version: 17` + `projects: [slot]` + `activeProject: slot.id`；顶层 `blocks/pan/zoom/splice/collapsed/title` **= 活动槽的同引用镜像**。
- **`syncActiveProject()`**：把顶层 live 字段写回活动槽（幂等重连）；**在 `saveNow()` 与 `switchProject()` 两处必须成对调用**（否则块改动可能只留在顶层镜像、未回写项目槽 → 落盘/切换丢改动）。
- **`loadProjectInto(id)`**：切活动项 → 顶层 live 字段重新指向该槽；返回是否命中。
- **`projectAt(id)`**：按 id 取槽。
- **`migrate(v1→v17)`**：拆为 `migrateTemplates` / `migrateCmpl` / `migrateBlocks` / `migrateSplice` / `migrateOneProject` 辅助；**v16 老数据（无 `projects`）→ 恰合成 1 个项目槽**，其 `blocks/pan/zoom/splice/title/collapsed` **逐字等于旧版输出**（单项目路径与旧路径**字节等价**）；`load()` 阈值 `<16` → `<17`。
- **`sanitizeState()`**：顶层镜像 **与** 每个 `projects[i].blocks` **两处都剔图片**（同存两个引用，两处都要净）。

### ② 视图层：项目 UI 与切换编排（`view/modals.js` / `shell/wiring.js` / `styles/20-menu.css` / `index.html`）

- 顶栏 `#btnProj`（**固定文案「项目」**，不显示当前项目名）→ 复用 `#ctxMenu` 打开项目菜单：逐项 `●/○ 项目名`（当前项 `●` 且禁用）+ `＋ 新建项目` / `重命名当前项目` / `删除当前项目`（danger）。
- `openModal` 增**可选 `message`**（表单顶部渲一句说明；供「删除项目」确认框复用，**不引入原生 confirm**）。
- `switchProject(id)`：幂等 → flush → 关编辑器/复位 → `syncActiveProject` → `loadProjectInto` → 复位选择 → **仅渲染当前视图**（canvas→`render()` 否则 `renderWrite()`）→ `applyView()` → `scheduleSave` → toast。
- `newProject()`：默认名 **`项目 N`**（N 由 `nextProjectName()` 求：扫描**现存**项目名里匹配 `^项目 (\d+)$` 的最大号 **+1**，无匹配则从 **1**）；**新项目 = 零块**（真正从零开始）；推入 `projects[]` → 装入 → toast。
- `renameActiveProject()`：预填当前名；空则回落 `未命名项目`。
- `deleteProject()`：**唯一项目禁止删除**（toast `至少保留一个项目`）；删除**活动项目先切邻居**；确认后 splice 出 → toast 带**撤销**（原位插回，**不自动激活**）。
- `ctx` 动作名：`proj-switch` / `proj-new` / `proj-rename` / `proj-del`；导入守卫接受 `projects`；导入后**按活动视图刷新**。
- `.ctx-menu` 增 `max-height:60vh; overflow:auto`（项目多时限高滚动）；新增 `.modal-msg` 说明文字样式。

### ③ 需求②「间距不均」渲染时机修复（`view/write.js` / `view/canvas.js`）

- **根因**：`setView` 曾**先 `render()`（内部 `autoSizeAll()`）再切显隐类**，而隐藏态 `body.view-write .canvas{display:none}` 下 `scrollHeight === 0` → 块高被写成 `0px` → 重开/切画布后**塌陷、间距不均**。
- **方案 A（`write.js` `setView`）**：**先 `applyView()`（切显隐类），再 `render()`/`renderWrite()`** —— 使画布在「**可见态**」被测量；为所有 render 调用者建立不变量（非仅补画布分支）。
- **方案 B（`canvas.js` `autoResize`）**：`ta.style.height='auto'` 后 **仅当 `scrollHeight > 0` 才写 `height`**；隐藏态测量无意义 → 不写 `0px`（**加固**，非 A 的替代）。

### ④ paste 修复（并入本版 · `interact/paste.js`）

- 原判断**只列举三个容器 class**（`.block-text` / `.modal-body` / `.sp-item`），两个真正的编辑器（`<textarea class="blk-input">`）不在列 → 编辑器内 Ctrl+V 被画布抢占（新建块而非落字）。
- 改为：**判断目标是否可编辑**（`TEXTAREA` / `INPUT` / `isContentEditable`）**∪ 保留旧三容器**；三处编辑器宿主（`#blkInput` / `#wdInput` / `.block-text`）均为 `<textarea>` → 覆盖。

### ⑤ 数据契约

- `state.version` 16 → **17**；`LS_KEY` **不变**（`storyboard-prompt-panel:v1`）。
- `templates` / `cmpl`（含 `use`）**全局共享**（跨项目）；`splice` **逐项目**（块 id 仅在项目内有效）。
- **零新增 `keydown/keyup/blur` 监听**；`#btnProj` 仅 1 个 `click`（复用 `#ctxMenu`）。

### ⑥ 新建项目默认名（就地纠正 · 收尾）

- **旧**：`'项目 ' + (state.projects.length + 1)` → 已有 1 个迁移项目时首个新建 =「项目 2」（**跳号**）；且删项目后 `length` 回收 → **可能与现存同名**。
- **新**：新增具名 `nextProjectName()`（`view/modals.js` 内，**仅项目创建一处调用**）：N = 现存名里 `^项目 (\d+)$` 的最大号 **+1**，无匹配从 **1**。
- **效果**：已有「未命名分镜」→ 首建「项目 1」→ 再建「项目 2」；删掉「项目 1」后若只剩「项目 2」→ 新号 = 3（**绝不与现存重名**）。**格式不变**（仍 `项目 N`）。
- **影响面**：`nextProjectName` 为**模块内**函数（**不导出**）→ `PHJ` 对外面与 `P2-B2` 名数**不变**；新顶层声明进 IIFE（`P1-D` 仍空集）。

---

## 二、`PHJ` 对外面变更（★ store +4 / modals +5，已同步 P2-B2 契约）

| 模块 | 变化 | 内容 |
|---|---|---|
| `store` | **+4 名** | `+ loadProjectInto` / `+ newProjectSlot` / `+ projectAt` / `+ syncActiveProject`（`modals` 跨模块引用） |
| `modals` | **+5 名** | `+ deleteProject` / `+ newProject` / `+ openProjectMenu` / `+ renameActiveProject` / `+ switchProject`（`wiring` 引用 `openProjectMenu`） |
| 其余 16 个模块 | **不变** | 既有导出名逐名不变 |

- 结果：`PHJ` 模块键仍 **18**（`P2_MODULES` 不变，无新模块）；`P2_EXPORTS_GOLDEN` 名数 **126 → 135**（store +4 / modals +5）→ `P2-B2` 断言实测 **135 名**。

---

## 三、★ 对既有闸门的适配（**判定式与条数不变**）

### 3.1 因契约变化而更新的期望值（**仅期望值/快照，条数不变**）

| 文件 | 现状 → 改为 |
|---|---|
| `verify_w.mjs` `W8` | 断言名/文案 `v14→v16` → **`v14→v17`**；`w8.version===16` → **`===17`** |
| `verify_w.mjs` `W9` | 文案「（version=16）」→ **17**；`flushed.version===16` / `after.version===16` → **`===17`** |
| `verify_v78.mjs` `I7` | `i7.version===16` / `i7.oldV===16` → **`===17`**（文案同步） |
| `verify_v78.mjs` `I7b` | `i7.m13v===16` → **`===17`**（文案「v13⇒v16」→「v13⇒v17」） |
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.store` | + `loadProjectInto,newProjectSlot,projectAt,syncActiveProject` |
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.modals` | + `deleteProject,newProject,openProjectMenu,renameActiveProject,switchProject` |
| `verify_c.mjs` `D5` | `d5m.version===16` / `d5reload.version===16` → **`===17`**（文案同步） |
| `verify_c.mjs` `D7` | `d7.version===16` → **`===17`**（文案同步） |
| `verify_build_equivalence.mjs` `OLD`（默认） | `PHJ_v7.17_20260918.html` → **`PHJ_v7.18_2026-09-19.html`**（含头注释同步） |
| `run-gate.mjs` 头注释 `[1]`/`[2]` | 期望 `288444 B` → **`304151 B`**（+ sha256）；基准 `PHJ_v7.17…` → **`PHJ_v7.18…`**（**注释；run-gate 无体积判定式**） |

### 3.2 `run-gate.mjs` **无体积判定式**（口径澄清，与 v7.17 一致）

> `[1]` 步只 `result.push({ detail: String(size)+' B' })` + `ok = status===0` —— **不比较体积数值**。
> **唯一真闸门 = 等价性（逐字节）**（`[2]` 直接比对 `PHJ.html` 与快照 `OLD`）。故「体积新值」只改**注释**。

### 3.3 既有 10 道判定式与条数 **零改动**

> 本轮**不新增、不删除任何断言**；仅**期望值**（version 字面量、导出万名、快照字节）变动。

---

## 四、构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **304151 B**，sha256 `df22b5903fdcbe39cc6eae873b40689b6ed9fc37a7de46eb2609f2f848f91e71` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.18_2026-09-19.html`（逐字节相同） |
| CSS 片序（10，**不变**） | 00-base · 10-canvas · 20-menu · 30-splice · 40-window · 50-editor · 51-complete · 52-library · 55-write · 90-effects |
| JS 片序（20，**不变**） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤·第 9 位)** · host · complete · library · canvas · splice · modals · write · keys · paste · pointer · wiring |

> **无新增切片**：`SLICES` 仍 20 条、`skin/corpus` 仍**第 9 位**；`CSS` 仍 10 条。`index.html` 只**多一个 `<button id="btnProj">`** → 锚点数不变、CSS 链顺序校验照旧通过。

## 五、模块规模（v7.18 实测，构建期行数口径）

| 模块 | 行数 | Δvs v7.17 | | 模块 | 行数 | Δvs v7.17 |
|---|---:|---:|---|---|---:|---:|
| `core/store.js` | 145 | **+多项目槽/镜像/导出** | | `core/persist.js` | 222 | **+migrate 拆槽 + syncActiveProject** |
| `view/modals.js` | 598 | **+项目菜单/切换/新建/改名/删除 + nextProjectName** | | `view/write.js` | 434 | **+setView 方案A** |
| `view/canvas.js` | 187 | **+autoResize 方案B** | | `shell/wiring.js` | 312 | **+#btnProj 接线 + 导入按视图刷新** |
| `interact/paste.js` | 66 | **+可编辑判定（并入）** | | `skin/corpus.js` | 84 | **0（未改）** |

- `src/index.html`：**+1 个 `<button>`**（`#btnProj`）；`styles/20-menu.css`：**+`.ctx-menu` 限高滚动 + `.modal-msg`**；10 片 CSS 其余不变。

## 六、回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = **13/13 全绿**，退出码 0）

| 闸门 | 结果 |
|---|---|
| [1] 构建 | **304151 B** |
| [2] 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.18_2026-09-19.html`） |
| [3] 回归 `verify_v7.mjs` | **83/83** |
| [4] F 组 `verify_v76.mjs` | **F 18/18** |
| [5] G 组 `verify_v77.mjs` | **G 16/16** |
| [6] v7.8 `verify_v78.mjs` | **H+I 54/54**（含 P2-B2 导出面内容契约，实测 **135 名**） |
| [7] 开发态 `probe_dev_index.mjs` | **18/18** |
| [8] W 组 `verify_w.mjs` | **W 21/21** |
| [9] C 组 `verify_c.mjs` | **C 31/31** |
| [10] E 组 `verify_e.mjs` | **E 16/16** |

> 既有闸门判定式与条数**全部与 v7.17 相同**（本轮仅期望值/快照同步）。

## 七、守门人自查（**必须仍绿**）

- `P2-A`（8 条 `keydown/keyup/blur` 注册序）与 `P3-A`（document keydown 3 处 / 含 Esc 1 处）—— 本轮**仅新增 1 个 `click`**、**不新增键类监听** → 仍绿。
- `P1-A`（dev≡prod 逐字）、`P1-C`（测试产物逐行 diff 恰 +1 行）、`P1-D`（window 全局增量空集）—— 新顶层声明（`newProjectSlot` 等）在 IIFE 内 → 仍绿。
- `P2-B`（`PHJ` 恰 18 模块键）、`P2-B2`（导出面内容契约，**实测 135 名**）—— store/modals 按 §二 更新后一致。
- `R1`（引擎零 `skin/` 字面量）/ `R1 语料归属` / `R3-A`（**命中 ≤ golden**）/ `R3-B`（零泄漏）/ `R3-C`（守卫自检）/ `R4`（皮肤可摘除）—— 皮肤层**一字未改**、新增代码不含 `skin/` 字面量 → 仍绿。

## 八、已知遗留 / 下一步

- **本需求未做**（明确超出本轮口径）：跨项目复制 / 项目排序 / 导出单个项目。
- **项目菜单复用 `#ctxMenu`**、确认/命名框复用 `#modalMask`：**未新增窗骨架**。
- **皮肤边界**：新中文文案一律落 `view/**` 或 `index.html`，未命中皮肤词元（`skin-guard` 实测 R3-A ≤ 阈值、R3-B 仍 0）。

## 九、自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 304151 B（20 JS 片 / 10 CSS 片）
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A ≤ golden；R3-B 命中 0
node dev/_qa/run-gate.mjs                       # 期望：13/13 全绿（83/18/16/54/18/21/31/16/4/9/4），退出码 0
```
