# 交付快照指纹 · PHJ.html v7.16（2026-09-18）

> **本轮性质 = 写作补全「四项增强」（A/B/D/H）**（需求定义 `写作补全_初衷复盘与改进建议_2026-09-18.md` §3，
> 架构设计 `写作补全四项增强_设计_2026-09-18.md`）。
> 一句话：把「写作补全」从「能用」推到「越用越顺」——①**A** 状态栏对**风格区/硬性要求区**里的逗号不再报假错误
> （字符级豁免掩码，领域判定只活 `struct.js`，着色层保持零领域语义）；②**B**「未用过」徽章**变活的**（候选渲染时动态判定条目
> 是否已在用户文本里出现）；③**D**「最近使用」加权（**仅查询视图**，`score` 相等时才按使用量/新鲜度上浮）；
> ④**H** 配置窗新增「**语料体检**」（同窗视图切换，从你的写作里发现**重复句**与**风格包漂移**，一键收进片段库）。
> 行为增量为**受控新增**：既有画布 / 拼接 / 模板 / 编辑器 / 台词区豁免 / 导出格式 / 皮肤边界**一律不动**；
> 唯一持久结构变化 = `state.cmpl` 多一个 **`use`** 字段（`state.version` **15 → 16**，`migrate()` 零丢失保留）。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.16（`state.version` = **16**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **285848** |
| **sha256** | **4e4803c7649240ff9926ace7a0b012e0c8ac7c3a244b79f0bc4b4099bc7d40c5** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.16_20260918.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.15 = **264162 B**（sha256 `cc383db0…4087`）→ 本轮 **+21686 B** |

---

## 一、本轮变更要点（v7.15 → v7.16）

### ① `state.version` 15 → 16 · `state.cmpl.use` 迁移（零丢失）

- **唯一结构变化** = `state.cmpl` 多一个字段 **`use`**（默认 `{}`）；其余字段（`v/items/gorder`）与 `state` 其余部分（`blocks/splice/templates/pan/zoom/title/collapsed`）逐字不动。
- `store.js`：`defaultState().version` → **16**，`cmpl` 增 `use: {}`。
- `persist.js`：`migrate(d)` 的 `cmpl` **重建**为 `{ v, items, gorder, use: {} }`，随后**逐键保留**旧数据里的 `cmpl.use`：
  - 跳过 `__proto__`；**只保留 `n` 为数字且 `> 0`** 的项；`t` 非数字则回落 `0`（脏数据清洗，不退化为「整表丢弃」）。
  - 返回 `version: 16`；`load()` 阈值 `if(d.version < 15)` → `if(d.version < 16)` → 补齐后落盘。
- **逐条零丢失**：块、`splice.items`、`templates`、`cmpl.items`、`cmpl.gorder` 全部经既有规范化逻辑保留；本次**只多**写一个 `use`。
- **为什么升版**（设计 §5.3）：`migrate()` 本就**重建** `cmpl`——若不显式保留 `use`，每次 `load` 都会把使用数据抹掉（违反零丢失）；
  既然 `migrate` 必须感知该字段，升版是让「持久形态变化 = 版本事件」这一先例（v13 加 `cmpl`、v14 `src` 边界、v15 加 `order`）**显式可断言**的正道。

### ② A 的落点：按结构区豁免风格包的 `，`（字符级掩码）

- **复用 v7.7 台词区豁免的同一层**：豁免发生在 `fam` 生成时的 **R0 错误分支**（`highlight.js`），**领域判定外置**到 `struct.js`。
- **新增 `struct.structExemptMask(text)`**（领域策略）：`structMap(text)` 逐行取 `region`，`region ∈ {style, tail}` 的行字符置 `1`，其余 `0`；
  用与 `hlToHTML` **同源的索引推进法**（`idx += 行.length + 1`，`+1` = 行末 `\n`，属 `body` 段不置 1）把**行级 region** 铺到**字符级 `Uint8Array(text.length)`** 上——精确等长、无二次切分、无越界。
- **改 `highlight.js`**：签名 `hlClassify(text, exempt)` 增**可选**掩码参数；R0 分支改为
  `if(HL_ERR[ch] && !dlg[i] && !(exempt && exempt[i])){ fam[i]='err'; continue; }`；
  `hlRefresh` 传 `structExemptMask(ta.value)`；`hlToHTML`/`hlStatus` **不动**（只吃 `fam`）→ **着色与计数同源**。
- **零领域语义**：`highlight.js` **不认识**「风格/硬性要求」，只消费一个**不透明布尔掩码**；「哪些区算风格区」的领域策略只活在 `struct.js`。
- **对照组（防「把错误全关掉」）**：

| 区（`structMap` 的 `region`） | 逗号是否计入错误 | 依据 |
|---|---|---|
| `style`（`风格：` 起） | **豁免** | 需求 §3-A（实测 v7.8 假错误 ~18/22 来自风格块） |
| `tail`（`硬性要求：` 起） | **豁免** | 需求原文「风格区/硬性要求区的逗号移出错误族」 |
| `anchor`（起手式，`画面开始：` 前） | **照旧计入** | 需求「正文区的逗号仍须计数」；anchor 语义同正文 |
| `body`（叙事正文 / 分镜） | **照旧计入** | **核心对照组** |

### ③ B 的落点：「未用过」徽章变活的

- **触发范围**：仅 `note === CMPL_UNUSED_NOTE`（新常量 `'未用过'`）的候选条目（**实测 13 处**；需求口径写「8 处」，**以实测 13 为准**）。其它 note（`项目级定型件`/`141 句的语法槽位`/`远近谱…`/自建备注）**永远静态原样渲染**。
- **needle 抽取 `cmplNeedle(body)`**：去槽位 `body.replace(/\$\{\d+\}/g,' ')` → 取全部连续 CJK 串 `/[\u4e00-\u9fff]+/g` → **最长者**（等长取最早出现）。空则视为「从未用过」（保守：保留徽章）。
- **命中判定 `cmplIsUsed(needle)`**：`needle.length >= 2 && usedText.indexOf(needle) >= 0`。
- **「用户文本」范围** = **全部非图片块 text ∪ 当前编辑器文本**（`hostPopup.el('ta').value`）：覆盖「已落块」与「正在写、尚未确定」两种场景；不做大小写/空白归一（needle 是连续 CJK 串，不会被空白/标点切断）。
- **缓存两级**：`_cmplUsedText`（归一文本快照）+ `_cmplUsedMap`（`{needle:bool}` 逐条记忆，同一 needle 不重复 `indexOf`）；统一入口 **`cmplUseInvalidate()`** 清两级。
- **失效时机（10 处，全部枚举）**：

| # | 触发点 | 落点 | 说明 |
|---|---|---|---|
| 1 | 弹窗/写作台编辑器输入 | `complete.js:cmplOnInput` | 每键失效 |
| 2 | 写作台实时写回 | `write.js:wdOnInput` | 与 #1 同源、另一路径，各置一处 |
| 3 | 画布块内联编辑 | `wiring.js` board `input` 分支 | 既有监听体内加一行 |
| 4 | 切条 | `write.js:wdSelect` | 当前编辑器文本换块 |
| 5 | 切视图 | `write.js:setView` | 切换会 `flush`+重填编辑器 |
| 6 | 增/删块 | `write.js:wdNew/wdDel` | blocks 数量变 |
| 7 | 重排块 | `write.js:wdReorder` | 拼接口径变（保守失效） |
| 8 | JSON 导入 | `wiring.js` fileInput `change` | 整体换 state |
| 9 | 片段库改表 | `complete.js:cmplSetItems` | needle **来源**变了 |
| 10 | 收候选 | `complete.js:cmplReset` | 顺带失效，防跨轮串味 |

- **`note` 字段永不改写、永不删除**（语料的固有信息）；渲染取值唯一入口 = **`cmplNoteFor(it)`**。
- **兜底签名**（防御性，非主路径）：`_cmplUsedSig = blocks.length + ':' + Σtext.length + ':' + selId + ':' + 编辑器.value.length`，签名变则强制重建。**已知盲区**：同长度就地改写（改错别字）签名不变 → 缓存可陈旧一格；因徽章是**软提示**且 #1/#2 每键失效已覆盖绝大多数输入，**盲区可接受**（设计 §13-U2）。
- **配置窗显示静态 `note`、气泡显示动态徽章**：口径差**有意**（配置窗=语料固有信息浏览器；气泡=写作时引导），设计 §13-U3。

### ④ D 的落点：「最近使用」加权（仅查询视图）

- **数据结构**：`state.cmpl.use = { [hkey]: { n: <int≥0>, t: <毫秒时间戳> } }`（缺省 `{}`；随 `sanitizeState` → localStorage / 导出 JSON 一起走）。
- **内容稳定 key**：`hkey = cmplUseKey(it) = 'h' + FNV1a32hex((group||'')+'\u0000'+(label||'')+'\u0000'+body)`。
  - **不用位置 key**（内置 `'b:'+gi+':'+ii` 是位置相关，语料重排/换皮肤/未物化会指错条目）；内容 hkey 免疫重排/换皮肤/物化与否；用户**改写内容**则 hkey 变、计数从头（合理）；两条完全相同内容会**共享**计数（本就重复，可接受）。
  - **未物化也能记**（`state.cmpl` 存在即可写 `use`）→ 不丢「未物化就用」的会话数据。
- **加权公式**：`useW(it) = ln(1 + n) * Math.pow(0.5, ageDays/14)`（频次对数 × 半衰期 14 天），`ageDays = (now - t)/86400000`；`useW` 在 push 进 pool 时**算一次**。
- **排序（不与既有评分打架）**：**次级键**——`sort((a,b) => (a.score-b.score) || (b.useW-a.useW) || (a.ord-b.ord))`；即「命中质量 > 本节相关 > 使用习惯 > 原序」。
  无 `use` 记录 → `useW = 0` → **行为与现状完全一致**。
- **作用范围（保守：仅查询视图）**：`cmplBuild`（查询结果）加 `useW` 次级键；**`cmplBuildGroupItems`（组内视图）不改排序**（否则 `H7` 的「进 `风格包` 组 → 点第一条 = 风格包·全套」语义变更，需 Holly 核准）；**`cmplBuildGroups`（组视图）不改**。
- **记录时机（只在真正上屏成功）**：`cmplCommit` 里 `it.kind !== 'group'` 且成功插入文本后 → `cmplUseTouch(it)`（`hkey` 计数 `n+1`、`t=now`）+ `scheduleSave()`（400ms 防抖）。
  **不计**进组 / 查询输入 / `cmplMoveSel` / 仅浏览（浏览噪声会稀释「重复劳动」信号）。

### ⑤ H 的落点：配置窗口「语料体检」（MVP）

- **入口**：`#cmplCfgMask` foot 左组新增 `<button class="btn" id="cmplCfgCheck" title="…">语料体检</button>`（与「恢复内置默认」同列）。
- **形态：同窗视图切换**（`var cmplCfgView ∈ {'lib','check'}`），**不新开窗口**（复用 `.tpl-win` 骨架与 `#cmplCfgBody`）→ 不新增 `keydown/blur`、`closeTopLayer` 的 Esc 结构不动。按钮文案随视图切换（`语料体检` ↔ `返回片段库`）。
- **接线**：`library.js` 增**一个** `DOMContentLoaded` 只注册一次 `#cmplCfgCheck` 的 **`click`**（不涉 `P2-A`/`P3-A` 的 `keydown|keyup|blur` 集合）。
- **`openCmplCfg()`** 每次打开**复位** `cmplCfgView='lib'`（保证既有 `I1/I2` 看到的仍是库视图）。
- **检测 1 · 重复句**：遍历非图片块 → 逐行 `trim` → 保留 `len ≥ 8` 的行 → **跨块**统计完全相同行出现次数 → `count ≥ 2` 且 `∉ cmplActiveBodies()`（`cmplActive().map(body.trim)` 集合，= 「当前不在片段库」）→ 排序 `count 降序 → 行长降序 → 字典序`。
- **检测 2 · 风格包漂移**：非图片块中若存在 `/^风格[:：]/m` 行 → 从该行起到「下一条 `/^硬性要求[:：]/m` 行（含）」或块尾 = 该块风格段 `st` → 与定型件 `ref = cmplStyleRef()`（= `cmplFullStyle()`）比较：
  - `\r\n→\n`、去首尾空行后**逐字相等** → 一致；不等 → 记不一致 + 差异摘要（`ref` 相对块「缺」哪些行 / 块相对 `ref`「多」哪些行）。
  - 报告「共 N 条含风格包，M 条与定型件不一致」+ 每条差异摘要。
- **访问定型件 = 方案 i**：`complete.js` 暴露 `cmplStyleRef()`（→ `cmplFullStyle()`），`library.js` 调 `complete`——**单一接缝**（现状只有 `complete.js` 一个 editor 文件读 skin 顶层名），且 `manifest` 已声明 `library.deps ∋ 'complete'`（零新增耦合）。
- **唯一动作 · 收进片段库**：每重复句行附 `<select>`（选项 = `cmplGroupOrder()`）+ 「收进片段库」按钮 → `cmplCheckCollect(text, group)`：`cmplSetItems(cmplActive().slice().concat([{ key: cmplNewKey(), group, label: text.slice(0,12), note:'', body: text, block:false, src:'user' }]))` + `saveNow()` + 重渲染体检视图。
  **明确不做**：自动改写、批量修复、结构体检之外的新检查项。

### ⑥ B/D 失效接线的落层（**不新增任何 key 监听**）

| 文件 | 改动 |
|---|---|
| `editor/complete.js` | `cmplSetItems`/`cmplReset`/`cmplOnInput` 调 `cmplUseInvalidate()`（既有函数体内加行） |
| `view/write.js` | `wdOnInput`/`setView`/`wdSelect`/`wdNew`/`wdDel`/`wdReorder` 内调 `cmplUseInvalidate()`（既有监听体内加行） |
| `shell/wiring.js` | board `input` 分支 + fileInput `change` 分支内调 `cmplUseInvalidate()`（既有监听体内加行） |

- **零新增 `document`/`window` 级 `keydown|keyup|blur` 监听** → `P2-A`（8 条注册序）/`P3-A`（doc keydown 3 处/含 Esc 1 处）**逐字不变**。

---

## 二、`PHJ` 对外面变更（★扩大对外面 +3 名，已同步 P2-B2 契约）

| 模块 | 变化 | 内容 |
|---|---|---|
| `struct` | **+1 名** | `+ structExemptMask`（`highlight.js` 跨模块引用） |
| `complete` | **+2 名** | `+ cmplStyleRef`（`library.js` 引）、`+ cmplUseInvalidate`（`write.js`/`wiring.js` 引） |
| 其余 16 个模块 | **不变** | 既有导出名逐名不变（B/D 的 `cmplNeedle/…/cmplUseKey/Get/W/Touch`、H 的 `cmplCheck*` 均为**模块内**函数，**不导出**） |

- 结果：`PHJ` 模块键仍 **18**（`P2_MODULES` 不变，无新模块）；`P2_EXPORTS_GOLDEN` 名数 **122 → 125**（struct +1、complete +2）→ `P2-B2` 断言实测 **125 名**。
- 新顶层声明（进测试产物访问器，**不泄漏到 window**，`P1-D` 仍空集）：`structExemptMask`、`CMPL_UNUSED_NOTE`、`cmplNeedle/cmplUsedText/cmplIsUsed/cmplNoteFor/cmplUseInvalidate`、`cmplUseKey/cmplUseGet/cmplUseW/cmplUseTouch`、`cmplStyleRef`、`_cmplUsedText/_cmplUsedSig/_cmplUsedMap`、`cmplCfgView`、`cmplCheckToggle/Dup/StyleDrift/Segment/NormLines/TrimBlank/Same/Diff/Render/Collect/DupRow/DriftRow` 等。
- **`LS_KEY` 不变**（`storyboard-prompt-panel:v1`）；`migrate` **只加** `use`，不减字段。

---

## 三、★ 对既有闸门的适配（**判定式与条数不变**）

### 3.1 因契约/版本变化而更新的期望值（**全部为「期望值」变化，条数不变**）

| 文件 | 现状 → 改为 |
|---|---|
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.complete` | 9 名 → **11 名**（+ `cmplStyleRef`、+ `cmplUseInvalidate`） |
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.struct` | `['structAt']` → **`['structAt','structExemptMask']`** |
| `verify_v78.mjs` `I7` | `i7.version === 15 && i7.oldV === 15` → **`=== 16`**（含文案） |
| `verify_v78.mjs` `I7b` | `i7.m13v === 15` → **`=== 16`**（含文案） |
| `verify_v78.mjs` `X4` | `x4.v === 15` → **`=== 16`**（含文案） |
| `verify_w.mjs` `W8` | 断言名/文案 `v14→v15` → **`v14→v16`**；`w8.version === 15` → **`=== 16`** |
| `verify_w.mjs` `W9` | `flushed.version === 15 && after.version === 15` → **`=== 16`**（含汇总行/头注释） |
| `run-gate.mjs:9` | 期望 `264162 B` → **`285848 B`**（注释；**run-gate 无体积判定式**，见 §3.2） |
| `run-gate.mjs:10` | 基准 `PHJ_v7.15_20260918.html` → **`PHJ_v7.16_20260918.html`**（注释） |
| `verify_build_equivalence.mjs` `OLD` | `PHJ_v7.15_20260918.html` → **`PHJ_v7.16_20260918.html`** |

### 3.2 ★ 一处**非契约**的收尾（本次顺带修）

> `run-gate.mjs` 的**中间步骤行标**在 v7.15 加入 W 组后**漏改 5 处**：`[2/7]`…`[6/7]` 应为 `[2/8]`…`[6/8]`
> （`[1/8]`/`[7/8]`/`[8/8]` 已对）。本次**只改这 5 行显示字符串**（`console.log` 文案），**不触**判定式、汇总解析与 `GATE_META`。
> 修复后全 8 步行标一致显示 `/8`。

### 3.3 `run-gate.mjs` **无体积判定式**（口径澄清）

> 实测 `run-gate.mjs` 的 `[1]` 步只 `result.push({ detail: String(size)+' B' })` + `ok = status===0`——**不比较体积数值**。
> **唯一真闸门 = 等价性（逐字节）**（`[2]` 直接比对 `PHJ.html` 与快照 `OLD`）。故「体积新值」只改**注释**；
> 判定靠「构建 → 快照 → `OLD`」三者一致（本轮构建产物 = 快照 = **285848 B**，`[2]` PASS）。

---

## 四、构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **285848 B**，sha256 `4e4803c7649240ff9926ace7a0b012e0c8ac7c3a244b79f0bc4b4099bc7d40c5` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.16_20260918.html`（逐字节相同） |
| CSS 片序（10，**不变**） | 00-base · 10-canvas · 20-menu · 30-splice · 40-window · 50-editor · 51-complete · 52-library · 55-write · 90-effects |
| JS 片序（20，**不变**） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤·第 9 位)** · host · complete · library · canvas · splice · modals · write · keys · paste · pointer · wiring |

> **无新增切片**：`SLICES` 仍 20 条、`skin/corpus` 仍**第 9 位**；`CSS` 仍 10 条。`index.html` 只**多一个 `<button>`**（非 `<script>`/`<link>`）→ 锚点数不变、CSS 链顺序校验照旧通过。

## 五、模块规模（v7.16 实测，构建期 `wc -l` 口径）

| 模块 | 行数 | Δvs v7.15 | | 模块 | 行数 | Δvs v7.15 |
|---|---:|---:|---|---|---:|---:|
| `editor/library.js` | 571 | **+184** | | `view/canvas.js` | 183 | 0 |
| `editor/complete.js` | 565 | **+90** | | `editor/highlight.js` | 177 | **+5** |
| `interact/pointer.js` | 534 | 0 | | `view/overlay.js` | 168 | 0 |
| `view/modals.js` | 475 | 0 | | `core/persist.js` | 157 | **+10** |
| `view/write.js` | 429 | **+7** | | `editor/struct.js` | 104 | **+17** |
| `shell/head.js` | 44 | 0 | | `core/store.js` | 83 | **+2** |
| `view/splice.js` | 241 | 0 | | `editor/host.js` | 48 | 0 |
| `shell/wiring.js` | 287 | **+2** | | `interact/keys.js` | 84 | 0 |
| `skin/corpus.js` | 84 | **0（未改）** | | `interact/paste.js` | 57 | 0 |
| | | | | `core/clipboard.js` | 48 | 0 |
| | | | | `editor/block-editor.js` | 33 | 0 |

- CSS `52-library.css`：**23 → 69 行**（+46，追加 `.cmpl-check-*`）；其余 9 片不变。
- 净增 JS 行 ≈ **+317**（library +184、complete +90、struct +17、persist +10、write +7、highlight +5、store +2、wiring +2）。

## 六、回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = **8/8 全绿**，退出码 0）

| 闸门 | 结果 |
|---|---|
| [1] 构建 | **285848 B** |
| [2] 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.16_20260918.html`） |
| [3] 回归 `verify_v7.mjs` | **83/83** |
| [4] F 组 `verify_v76.mjs` | **F 18/18** |
| [5] G 组 `verify_v77.mjs` | **G 16/16** |
| [6] v7.8 `verify_v78.mjs` | **H+I 54/54** |
| [7] 开发态 `probe_dev_index.mjs` | **18/18** |
| [8] W 组 `verify_w.mjs` | **W 21/21** |

> 条数全部**与 v7.15 相同**（本轮不增删任何既有断言；A/B/D/H 的行为断言由 QA 另行落地，不计入本基线）。

## 七、守门人自查（**必须仍绿**，本轮实测全绿）

- `P2-A`（8 条 keydown/keyup/blur 注册序）与 `P3-A`（document keydown 3 处 / 含 Esc 1 处）—— 本次**不新增键类监听** → 仍绿。
- `P1-A`（dev≡prod 逐字）、`P1-C`（测试产物逐行 diff 恰 +1 行；访问器自动扫名）、`P1-D`（window 全局增量空集 = 308 个顶层声明零泄漏）—— 新顶层声明都在 IIFE 内 → 仍绿。
- `P2-B`（`PHJ` 恰 18 模块键）、`P2-B2`（导出面内容契约，**实测 125 名**）—— struct/complete 各按 §二更新后一致。
- `R1`（引擎零 `skin/` 字面量）/ `R1 语料归属` / `R3-A`（**命中 15 ≤ golden 15**）/ `R3-B`（零泄漏）/ `R3-C`（守卫自检）/ `R4`（皮肤可摘除）—— 皮肤层**一字未改**、H 走 `complete.cmplStyleRef` 单一接缝（源码仍不含 `skin/` 字面量）→ 仍绿。
- `verify_v78.H19`（内置风格包逐字）、`verify_v78.H7/S16/S17`（查询/组序/组内首条）、`verify_v7` A 组 / `verify_v76` F 组 / `verify_v77` G 组（着色/台词区）—— 相关机制未触碰或按 §四保守口径「无 `use` 记录时行为不变」→ 仍绿。
- **A 的对照安全性**：`F5/F11`（`stErr` 计数文本均无 `风格：`）、`G2–G13`（对照文本无风格标记）、`H15`（`hlClassify(txt)` 单参 → 掩码缺省 `undefined` → 旧行为逐字不变）—— 实测掩码对 `anchor/body` 恒 0 → 均不受影响。

## 八、已知遗留 / 下一步

- **A/B/D/H 的行为断言**：本设计明确「由 QA 另行落地、条数变动须先报 Holly 核准」→ 本轮 Engineer **未增删任何既有断言**；快照/基线只记录「不回归」。若 QA 追加，`verify_v78` 条数将 54 → 54+k（须先报备）。
- **D 不作用于组内视图**（`cmplBuildGroupItems`）：会改 `H7` 语义（进组后首条=风格包·全套）→ **本轮不做**（设计 §13-U5）。
- **H 不含**：自动改写 / 批量修复 / 结构体检之外的新检查项（设计 §1.3、§6.6）。
- **B 的两处温柔妥协**：`推镜头（缓慢推进）` 的 needle 取到 `缓慢推进`（非 `推镜头`，单一规则优先）；缓存签名对「同长度就地改写」有一格盲区（软提示 + 每键失效已覆盖多数）→ 设计 §13-U1/U2。
- **配置窗静态 note vs 气泡动态徽章**的口径差：**有意保留**（设计 §13-U3）。
- **`镜头句` 组 label 自带「（你没用过）」**：属**皮肤内容**，随使用不会消失（改它=改皮肤+触 R3-A）→ **本轮不动**（设计 §13-U1）。
- **轮盘 / 自动改写 / `CMPL_PER_GROUP` 兑现 / C 条（`CMPL_GROUP_HINT` 挪出引擎）**：均**本轮不做**（设计 §13）。

## 九、自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 285848 B（20 JS 片 / 10 CSS 片）
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A 命中 15 ≤ golden 15；R3-B 长语料5+完整标记串6 命中 0
node dev/_qa/run-gate.mjs                       # 期望：8/8 全绿（83/18/16/54/18/21），退出码 0
node dev/_qa/diag/probe_dev_index.mjs           # 开发态 18/18（需先起 headless 浏览器）
```

> **升版自检（migrate 零丢失）**：`migrate({...version:15, cmpl:{use:{k:{n:3,t:1}}}}).cmpl.use.k.n === 3` 且 `.version === 16`。
