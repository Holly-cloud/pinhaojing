# 交付快照指纹 · PHJ.html v7.17（2026-09-18）

> **本轮性质 = 编辑器文本工具增量（单点、小需求）**：在「放大编辑」弹窗（`#blkMask`）底部动作区新增一个按钮，
> 把**编辑器内全文**的**中文逗号 `，`**替换为**半角空格 ` `**，**中文双引号“ ”成对包住的台词区内的逗号保持不动**。
> 一句话：给「放大编辑」加一把「一键清逗号（台词除外）」的梳子 —— 判定**复用 v7.7 的 `hlDialogueMask`**，
> 与着色层同源；**只改弹窗、不动写作台右栏**；**不改持久结构**（`state.version` 仍 **16**）。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.17（`state.version` = **16**，**与 v7.16 相同**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **288444** |
| **sha256** | **d943d616672f5a2ef79528b61f175804fa6b75a5fb66c9a26601015d902fd4b8** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.17_20260918.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.16 = **285848 B**（sha256 `4e4803c7…40c5`）→ 本轮 **+2596 B**（首建 288249 B → 就地补丁 +195 B，见 §十一） |

---

## 一、本轮变更要点（v7.16 → v7.17）

> **无 PRD、无架构设计（快速模式）**；需求口径由主理人与 Holly 逐条锁定，Engineer 直接实现。

### ① 入口：`#blkMask` 动作区新增按钮（`src/index.html`，+2 行）

- 在 `#blkMask` 的 `.modal-actions` 内、**`#blkStrip`（移除空行）与 `#blkCopy`（复制全文）之间**插入：
  `<button class="btn" id="blkComma" title="把编辑器里全文的中文逗号「，」换成空格（台词“…”里的逗号不动）">逗号转空格</button>`
- 只多一个 `<button>`（非 `<script>`/`<link>`）→ `index.html` 锚点数不变、CSS 链顺序校验照旧通过、`SLICES`/`CSS` **零新增**。
- **只此一个编辑器**：**未动**写作台右栏（`#writeDesk` / `#wdInput`）。

### ② 核心：纯函数 `hlCommaToSpace(text)`（`editor/highlight.js`，+16 行）

- **签名/返回**：`hlCommaToSpace(text) → { text: 结果串, n: 实际替换处数 }`（`n === 0` 表示无变化）。**纯函数**：不改宿主、不读 DOM。
- **算法**：`mask = hlDialogueMask(v)`（同文件，v7.7 既有）→ 逐字符：`if(ch === '，' && !mask[i]) out += ' '; else out += ch;`
- **台词区豁免 = 复用同一判定**：★**不另写一套**「引号内/外」规则 —— 直接吃 `hlDialogueMask` 的 `Uint8Array(text.length)`（`1` = 一行内成对中文双引号“ ”包住的字符），
  与着色层（`hlClassify` 的 R0 台词区豁免）**同源**，杜绝「转空格」与「着色」两套口径脱钩。
- **出口**：`PHJ.highlight += hlCommaToSpace`（`wiring.js` 跨模块引用 → 纳入显式对外面，见 §二）。`hlDialogueMask` **仍不导出**（仅模块内被 `hlClassify` 与本函数消费）。

### ③ 接线：`#blkComma` 的 `click`（`shell/wiring.js`，+13 行）

- 在既有 `DOMContentLoaded` 块内、紧随 `#blkStrip` 之后，给 `#blkComma` 加**一个 `click`**监听：
  1. `before = ta.value`；`r = hlCommaToSpace(before)`；
  2. `r.n > 0` → `ta.value = r.text` → `fitBlkWidth()` → `hlRefresh()` → `cmplReset()`（清候选气泡/槽位临时态，文本已变、旧槽位位置失效）→ `toast('已转换 ' + r.n + ' 处逗号', {label:'撤销', fn: restore})`；
  3. `r.n === 0` → `toast('没有可转换的逗号')`，**不给撤销**、**不改值**。
- **撤销** `restore`：闭包捕获 `before` → `ta.value = before` → `fitBlkWidth(); hlRefresh(); cmplReset();`。
- ★**取消语义**：弹窗为「确定/取消」语义 → 此处**只改 `textarea`**，**不直接改 `state.blocks`**（点「确定」才写回块）。
- **零新增键类监听**：只加 `click`（不在 `keydown|keyup|blur` 集合内）→ `P2-A` / `P3-A` 逐字不变。

### ④ 口径与边界（**逐条对照需求，全部锁死**）

| 项 | 定义 | 落点 |
|---|---|---|
| **处理对象** | **仅中文逗号 `，`（U+FF0C）** | `hlCommaToSpace` 的 `ch === '，'` |
| **替换为** | **半角空格 ` `（U+0020）** | `out += ' '` |
| **不处理** | 半角逗号 `,`（U+002C）、顿号 `、` | 不匹配 `'，'` → 原样保留 |
| **例外（台词区）** | **一行内成对中文双引号“ ”包住范围**内的逗号一律不动 | `!mask[i]`（`hlDialogueMask`） |
| **台词区判定** | 换行重置 / 未闭合不生效 / 半角 `"` 不算 / 嵌套里层同样豁免 | ★**随 `hlDialogueMask` 既有口径**（未重写） |
| **作用范围** | 编辑器内**全部文本**（非选区） | 整段 `ta.value` |

### ⑤ 数据契约（**零变化**）

- **不改任何持久结构**：`state.version` **保持 16**（不升版本）；`state.cmpl` / `state.blocks` / `LS_KEY` **逐字不动**。
- 本工具**只操作 `textarea.value`**（弹窗内临时态），点「确定」才经既有回调写回块 —— 与 v7.16 的数据契约**零交集**。

---

## 二、`PHJ` 对外面变更（★+1 名，已同步 P2-B2 契约）

| 模块 | 变化 | 内容 |
|---|---|---|
| `highlight` | **+1 名** | `+ hlCommaToSpace`（`shell/wiring.js` 跨模块引用） |
| 其余 17 个模块 | **不变** | 既有导出名逐名不变（`hlDialogueMask` 仍为**模块内**函数，**不导出**） |

- 结果：`PHJ` 模块键仍 **18**（`P2_MODULES` 不变，无新模块）；`P2_EXPORTS_GOLDEN` 名数 **125 → 126**（highlight +1）→ `P2-B2` 断言实测 **126 名**。
- 新顶层声明 `hlCommaToSpace`（进测试产物访问器，**不泄漏到 window**，`P1-D` 仍空集）→ `P1-D` 顶层声明数 **308 → 309**。

---

## 三、★ 对既有闸门的适配（**判定式与条数不变**）

### 3.1 因契约变化而更新的期望值（**唯一一处，为「期望值」变化，条数不变**）

| 文件 | 现状 → 改为 |
|---|---|
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.highlight` | `['hlRefresh','hlSyncBox']` → **`['hlCommaToSpace','hlRefresh','hlSyncBox']`** |
| `verify_build_equivalence.mjs` `OLD`（默认） | `PHJ_v7.16_20260918.html` → **`PHJ_v7.17_20260918.html`**（含头注释同步） |
| `run-gate.mjs` 头注释 `[1]`/`[2]` | 期望 `285848 B` → **`288444 B`**（v7.17 §十一 补丁后终值；首建曾记 288249 B）；基准 `PHJ_v7.16…` → **`PHJ_v7.17…`**（**注释；run-gate 无体积判定式**） |

### 3.2 `run-gate.mjs` **无体积判定式**（口径澄清，与 v7.16 一致）

> `[1]` 步只 `result.push({ detail: String(size)+' B' })` + `ok = status===0` —— **不比较体积数值**。
> **唯一真闸门 = 等价性（逐字节）**（`[2]` 直接比对 `PHJ.html` 与快照 `OLD`）。故「体积新值」只改**注释**。

### 3.3 既有 9 道判定式与条数 **零改动**

> 本轮**不新增、不删除任何断言**（本需求为快速模式；QA 若另立行为断言，条数变动须先报备）。

---

## 四、构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **288444 B**，sha256 `d943d616672f5a2ef79528b61f175804fa6b75a5fb66c9a26601015d902fd4b8`（含 §十一 的 toast z-index 就地补丁；首建 288249 B） |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.17_20260918.html`（逐字节相同） |
| CSS 片序（10，**不变**） | 00-base · 10-canvas · 20-menu · 30-splice · 40-window · 50-editor · 51-complete · 52-library · 55-write · 90-effects |
| JS 片序（20，**不变**） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤·第 9 位)** · host · complete · library · canvas · splice · modals · write · keys · paste · pointer · wiring |

> **无新增切片**：`SLICES` 仍 20 条、`skin/corpus` 仍**第 9 位**；`CSS` 仍 10 条。`index.html` 只**多一个 `<button>`** → 锚点数不变、CSS 链顺序校验照旧通过。

## 五、模块规模（v7.17 实测，构建期行数口径）

| 模块 | 行数 | Δvs v7.16 | | 模块 | 行数 | Δvs v7.16 |
|---|---:|---:|---|---|---:|---:|
| `editor/highlight.js` | 193 | **+16**（+`hlCommaToSpace` + 导出） | | `shell/wiring.js` | 300 | **+13**（+`#blkComma` 接线） |
| 其余 17 个引擎模块 | 不变 | 0 | | `skin/corpus.js` | 84 | **0（未改）** |

- `src/index.html`：**+2 行**（1 行注释 + 1 个 `<button>`）；10 片 CSS 行数不变。
- 净增 JS 行 ≈ **+29**（highlight +16、wiring +13）。

## 六、回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = **10/10 全绿**，退出码 0，耗时 51.0s）

| 闸门 | 结果 |
|---|---|
| [1] 构建 | **288444 B** |
| [2] 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.17_20260918.html`） |
| [3] 回归 `verify_v7.mjs` | **83/83** |
| [4] F 组 `verify_v76.mjs` | **F 18/18** |
| [5] G 组 `verify_v77.mjs` | **G 16/16** |
| [6] v7.8 `verify_v78.mjs` | **H+I 54/54** |
| [7] 开发态 `probe_dev_index.mjs` | **18/18** |
| [8] W 组 `verify_w.mjs` | **W 21/21** |
| [9] C 组 `verify_c.mjs` | **C 31/31** |
| [10] E 组 `verify_e.mjs` | **E 16/16** |

> 既有 9 道的判定式与条数**全部与 v7.16 相同**（本轮不增删任何既有断言）；**第 10 道 E 组**为 QA 为「逗号转空格」另立的常驻断言组（见 §十一）。

## 七、守门人自查（**必须仍绿**，本轮实测全绿）

- `P2-A`（8 条 `keydown/keyup/blur` 注册序）与 `P3-A`（document keydown 3 处 / 含 Esc 1 处）—— 本次**仅新增 1 个 `click`**、**不新增键类监听** → 仍绿。
- `P1-A`（dev≡prod 逐字）、`P1-C`（测试产物逐行 diff 恰 +1 行）、`P1-D`（window 全局增量空集 = **309** 个顶层声明零泄漏）—— 新顶层声明在 IIFE 内 → 仍绿。
- `P2-B`（`PHJ` 恰 18 模块键）、`P2-B2`（导出面内容契约，**实测 126 名**）—— highlight 按 §二更新后一致。
- `R1`（引擎零 `skin/` 字面量）/ `R1 语料归属` / `R3-A`（**命中 15 ≤ golden 15**）/ `R3-B`（零泄漏）/ `R3-C`（守卫自检）/ `R4`（皮肤可摘除）—— 皮肤层**一字未改**、新增代码不含 `skin/` 字面量 → 仍绿。
- `verify_v7` B 组（窗口弹开/按钮动效）/ `verify_v76` F1–F5（编辑器窗口 + 着色 + 错误标注）/ `verify_v77` G 组（**台词区豁免着色/计数**）/ `probe_dev_index`（编辑器窗口开合）—— 相关机制未触碰，新增按钮为 `#blkMask` 动作区**同级新增**、不改既有按钮几何 → 仍绿。

## 八、已知遗留 / 下一步

- **本需求无行为断言入闸门**：快速模式，仅「不回归」由既有 9 道守住；`#blkComma` 的行为由 Engineer 临时探针自测（§十，探针**用后已删**），若需常驻断言由 QA 另行落地（条数变动须先报备）。
- **只做「放大编辑」弹窗**：**写作台右栏未加此工具**（Holly 明确口径）。
- **未做**（超出本轮口径，明确不做）：把「逗号转空格」扩到画布内联编辑 / 写作台；半角逗号 `,`、顿号 `、` 的处理；替换为「顿号/换行/自定义符」等可配置项；选中区局部处理（本轮为**全文**）。
- **文案词元**：按钮文案「逗号转空格」、`title`、toast「已转换 N 处逗号 / 没有可转换的逗号」「撤销」——均为引擎侧文案，**未命中皮肤词元**（`skin-guard` 实测 R3-A 仍 15、R3-B 仍 0）。

## 九、自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 288444 B（20 JS 片 / 10 CSS 片）
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A 命中 15 ≤ golden 15；R3-B 长语料5+完整标记串6 命中 0
node dev/_qa/run-gate.mjs                       # 期望：10/10 全绿（83/18/16/54/18/21/31/16），退出码 0
```

## 十、自测记录（临时探针，**用后已删**）

> 探针 `dev/_qa/diag/_probe_comma_v717.mjs`（**运行后即删除**）：自起 headless Edge → 载入「测试产物」（= 真实产物 + 1 行访问器）→
> 驱动**真实 UI**（`#blkComma.click()`）逐例核对。结果 **10/10**：

| # | 用例 | 期望 | 实测 |
|---|---|---|---|
| A | `角色停步回望，眼神警惕，雨水沿帽沿滑落。` | → `角色停步回望 眼神警惕 雨水沿帽沿滑落。`；toast「已转换 2 处逗号」+「撤销」 | ✅ |
| A-撤销 | 点「撤销」 | 文本复原为原串 | ✅ |
| B | `小满说道【@音色】：“老陈，你来了，别走。”` | **引号内两个逗号不动**；无引号外逗号 → 无变化提示、**不给撤销** | ✅ |
| C | `他停步，说：“别走，留下”，然后转身，走了。` | 引号内 1 逗号保留、引号外 3 逗号转空格 → `他停步 说：“别走，留下” 然后转身 走了。` | ✅ |
| D | `画面开始：`（纯标记） | 提示「没有可转换的逗号」、不产生撤销 | ✅ |
| E | `a,b、c，d` | 半角 `,` 与顿号 `、` 不处理 → `a,b、c d`（仅 1 处中文逗号转） | ✅ |
| G | 弹窗取消语义 | 只改 `textarea`（`甲 乙 丙`），`state.blocks[0].text` 仍为 `甲，乙，丙` | ✅ |
| 纯函数 | 跨行未闭合引号 `“未闭合，逗号\n下一行，逗号` | 不成台词区 → 2 处照转 | ✅ |
| 纯函数 | 空串 | `{text:"",n:0}` | ✅ |
| 纯函数 | 整句台词 `“老陈，你来了，别走。”` | `n=0`、原样 | ✅ |

---

## 十一、★ 就地补丁与新增断言组（2026-09-18 · **并入 v7.17，不新开版本**）

### 11.1 缺陷与修法（QA 复核发现 · **真缺陷**）

- **现象**：点 `#blkComma` 后弹出的 toast（含「撤销」按钮）在「放大编辑」弹窗打开时**被弹窗遮挡**——用户看不到反馈、也点不到「撤销」。
- **根因**：`.toast` `z-index:99`（`styles/10-canvas.css`）< `.modal-mask` `z-index:11000`（`styles/40-window.css`）；`.blk-input` 高 `80vh`（`.blk-win` `max-height:96vh`），toast 固定 `bottom:26px` 底心 → 落在弹窗矩形内 → `elementFromPoint` 命中 `.blk-win`。
- **修法（**只此 1 处 CSS**，不避让、不重定位）**：`styles/10-canvas.css` `.toast` `z-index: 99 → 13000`（> `modal-mask` 11000、> `cmpl-order-pop` 12050 → **全域置顶**），行尾附中文注释说明。
- **验收**：QA 的 **E6a**（真实鼠标点 toast「撤销」→ `#blkInput.value` 复原）**由红转绿**——实测 `elementFromPoint(#toast button)` 命中 `BUTTON`（修复前命中 `.blk-win`）。

### 11.2 新增常驻断言组 E（`verify_e.mjs` = 16 条 · run-gate **第 10 道**）

- 16 条覆盖：基本转换 / 台词豁免（全台词 + 混合 + **反方向对照**）/ 与着色层**同源核实** / 不误伤（半角 `,`·顿号 `、`）/ 边界（跨行引号·空·纯标记）/ **取消语义** / **撤销（真实鼠标）** / 无变化不给撤销 / 写回链路 / 纯函数层 ×2 / 与「移除空行」互不干扰 / 范围界定（仅弹窗，写作台无）。
- 挂为 `run-gate.mjs` **第 10 道**（退出码 13）；**既有 9 道判定式与条数零改动**（本文件 §六 的 [8] W = 21/21 即本轮重跑实测）。

### 11.3 W 组偶发红：主理人假设的核实结论（**假设证伪** · 未改 `verify_w.mjs`）

- **假设**：`verify_w.mjs` 的 `Page.navigate` 偶发不落地 → W 组跑在 `probe_dev_index.mjs` 的遗留页（画布留态）→ `W1` 读 `activeView='canvas'`。
- **核实（临时探针 `_repro_w_nav.mjs`，**用后即删**）**：
  1. **dev 页（`src/index.html`）顶层名**全部 `undefined`（`state` / `setView` / `hostDesk` / `activeView` / `applyView` / `renderWrite` / `normalizeOrder` … 皆非全局——P1 起产物收进单 IIFE，dev 页跑**逐字同一份 bundle**）。W 的 `setup()` 在 dev 页**直接 `ReferenceError: state is not defined`** → 会**崩溃**（无「W 合计」行），**不可能**产出「W 17/21」这种"跑完但部分红"。→ **假设的预测症状与其机制自相矛盾**。
  2. 照抄 `verify_w.mjs:84-91` 的导航节奏（dev 页 + 画布留态 → `Page.navigate(TARGET)` → readyState 轮询 → 度量 → `reload`）**连跑 25 次**：**0 次**落地失败、`Page.navigate.errorText` **0 次**非空；再以"navigate 后**立即** reload（放大竞态）"**连跑 25 次**：仍 **0 次**落地失败。
- **结论**：**假设证伪、且未能复现**「导航不落地」。按主理人口径—— **不改 `verify_w.mjs`**（其 setup 判定式与 21 条断言保持原样）。该历史偶发红的**确切来源在本机未能复现**（既无「落地失败」证据，原假设机制又不成立），**留观**；若再复现，先取该次完整原始日志再定位。
- **只报不改**：`verify_e.mjs` / `verify_c.mjs` 的导航段与 W **同一形态**（`Page.navigate` 后不校验 `location.href`）；因缺陷不成立，**不扩大改动范围**，仅在此记录。

---

## 十二、★ 测试工装 flake 修复：C 组 D1 跨进程时钟（2026-09-19 · QA 复核发现 · **不改产品**）

> 对象：`dev/_qa/verify/verify_c.mjs` 的 **D1** 断言（属**测试工装**，非产品源码）。本节为**物证留档**，供将来防「优化回去」。

### 12.1 现象（flake）

- `node dev/_qa/run-gate.mjs` **首跑偶发** `[9] C 组 30/31`，唯一红点 **D1**；报错详情形如 `t=1789795562645（区间 1789795562640~1789795562644）`——**越界恒为 +1ms**。当日约 **1/3** 复发；重跑即绿。

### 12.2 根因（跨进程时钟）

- D1 断言 `d1.t >= before && d1.t <= after`，但：
  - `d1.t` 由**浏览器进程**内 `cmplUseTouch`（`editor/complete.js`）写 `Date.now()`；
  - 而 `before`/`after` 却取自 **node 进程** `Date.now()`（`verify_c.mjs` 原 409/412 行）。
- 两进程同取系统时间但**取值进程 / 精度不同**，1ms 级偏差即越界，而**边界容差 = 0** → 随机假红（实测越界恰好 +1ms）。

### 12.3 修法（**基准同源 · 不放大容差**）

```diff
-  const before = Date.now();
-  ...
-  const after = Date.now();
+  const before = await evalJS('Date.now()');   /* 浏览器侧取，与 d1.t 同源 */
+  ...
+  const after = await evalJS('Date.now()');
```
- 基准 `before`/`after` 挪到**浏览器侧**（与 `d1.t` 同进程、同源、单调）→ `before ≤ d1.t ≤ after` 必然成立，flake 消失。
- ★ **不放大容差**（禁止用「放宽 ±N 秒」了事，那是弱化语义）；**D1 判定式与 C 组 31 条一字未动**（`grep -c "^  t("` = 31）。

### 12.4 复现与复查数据（QA 实测）

| 阶段 | 命令 | 结果 |
|---|---|---|
| 修前 | `verify_c.mjs` × 20 | **D1 红 4 次（20%）**，恒 +1ms |
| 修后 | `verify_c.mjs` × 20 | **D1 红 0 次** |
| 修后 | `run-gate.mjs` × 3 | **均 10/10 全绿，C 组每次 31/31，退出码 0**（51.3 / 51.0 / 50.9 s） |

### 12.5 证伪（改坏**产物副本** · `PHJ_C_ARTIFACT` · 未碰 `dev/src/**` 与 `PHJ.html`）

| 改坏 `cmplUseTouch` | 结果 | 命中子句 |
|---|---|---|
| `t := 0`（= 1 小时前等价） | **D1 必红** | `d.t >= before` |
| `n := 1`（不再累加） | **D1 必红** | `d.n === 2` |

→ 证明修后 D1 **仍能抓到真错误**（并非靠放宽容差通过）。

### 12.6 全库同类隐患扫查（结论：**仅此一处**）

- 全套件（`verify_v7/v76/v77/v78/w/c/e` + `probe_*` + `run-gate`）中，「node 侧时间戳去框浏览器侧时间戳」**仅 D1 一处**（本轮已修）。
- 其余时间用法均**非跨进程**：`run-gate.mjs` 的 `Date.now()` 为 node 自用；`verify_v77.mjs:184/187` 的 `performance.now()` 位于 `evalJS` 模板串内（浏览器一次求值，自洽）；`diag/*` 的用法为 node 自用。
