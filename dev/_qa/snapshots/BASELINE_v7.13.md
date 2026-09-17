# 交付快照指纹 · PHJ.html v7.13（2026-09-17）

> **本轮性质 = 分层（R1）**：把**领域语料**从 `editor/complete.js` 抽出到新层 `dev/src/skin/corpus.js`，
> 首次在源码里**用目录表达架构边界**（引擎 = `core/`+`editor/`；皮肤 = `skin/`）。
> 产物字节变化**仅因新片头注释 + 搬运**，行为零变化（语义等价已用「有效代码行多重集」证明）。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.13（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **230492** |
| **sha256** | **0b66ff140a40793f7a63986d2e4d347c1420d130409a4dfbe8c636fc695ce0a6** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.13_20260917.html`（同一字节内容，等价性闸门的比对基准） |

## 本轮变更要点（v7.12 → v7.13 · R1 皮肤抽取）

### 1. 动机（架构设计文档 §F1/A 路线）

产品的长期方向是「同一引擎 × 多套皮肤」（不同领域的提示词术语/语料不同，机制相同）。
但此前**领域语料与引擎机制混居**在 `editor/complete.js` 里 —— 换一个领域要动引擎文件，
"引擎零领域语义"无从保证，也无从校验。

### 2. 动作：抽出 4 个语料符号到 `skin/corpus.js`

| 从 `editor/complete.js` 移出 | 字节 | 说明 |
|---|---|---|
| `CMPL_STYLE` | 1668 B | 风格包正文（5 段） |
| `CMPL_TAIL` | 91 B | 风格包收尾（硬性要求段） |
| `cmplFullStyle()` | 159 B | 拼接函数 |
| `CMPL_GROUPS` | 3517 B | 补全分组语料 |

**逐字节校验**：抽出前后 4 个符号的字符串内容**完全一致**（CRLF 归一化后比对通过；
`build.mjs` 本就对输入做行尾归一化，故此差异不可见）。

### 3. `editor/complete.js` 变为零领域语义

- 28474 B → **22891 B**（删除 64 行语料块）
- 保留的**全是机制**：`CMPL_TRIGGER` / `CMPL_MAX_QUERY` / `CMPL_PER_GROUP` / `CMPL_DIGIT_JUMP` /
  `CMPL_SEED_V` / `CMPL_GROUP_HINT` / `cmplSeedItems()`（消费 `CMPL_GROUPS`）/ 触发与评分 / 气泡 UI / 槽位
- 文件头加注：**★R1（2026-09-17）本模块已零领域语义**

### 4. 加载位置的决定（关键，勿随手改）

`manifest.mjs` 的 `SLICES` 里 `corpus` 插在 **`struct` 之后、`complete` 之前（第 9 位）**。

**为什么这个位置**：`corpus` 提供的是**顶层 `var` 声明**，而 `CMPL_GROUPS` 等被 `complete.js` 的
顶层 `var CMPL_SEED = cmplSeedItems()` 消费 —— 必须**先声明后消费**。放在 `overlay` 之前会
把语料块搬到文件更早的位置（当时语义 diff 达 459 行）；放在 `struct` 后 → diff 降到 67 行，
且这 67 行**只是语料块换了个边界出现**。

**安全性证明（多重集口径）**：两侧**有效代码行多重集完全一致**（各 3067 行），
语料块仅位置变化（589 → 595 行）——这是**纯顶层 `var` 平移，无副作用**。

### 5. 产物变化

| 项 | v7.12 | v7.13 | Δ |
|---|---|---|---|
| PHJ.html | 228947 B | **230492 B** | **+1545 B**（新片头注释 + `skin/` 脚手架） |
| JS 模块数 | 17 | **18** | +1（`skin/corpus.js`，83 行） |
| manifest `SLICES` | 17 | **18** | +1（`layer: 'skin'`） |
| 对外面名数 | 108 | **108** | **0**（`skin/` 不导出到 `PHJ`） |

## 新增断言 2 条（verify_v78：48 → 50）

| 断言 | 内容 | 可证伪点 |
|---|---|---|
| **R1 皮肤边界** | 引擎（`core/`+`editor/`，8 文件）**零引用** `skin/`；且 `skin/`（1 文件）**不反向依赖**引擎（先剥注释再判） | 在 `editor/` 任一文件写一行 `skin/corpus` 即必红 |
| **R1 语料归属** | 领域 token `【光影逻辑】` **在 `skin/` 内命中、在 `core/editor` 内不命中** | 把语料块搬回引擎即必红 |

这两条是「引擎 × 皮肤」路线的**唯一守法断言**：没有它们，"引擎零领域语义"只是一句注释。

## 构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **230492 B**，sha256 `0b66ff140a40793f7a63986d2e4d347c1420d130409a4dfbe8c636fc695ce0a6` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.13_20260917.html`（逐字节相同） |
| 源文件 | CSS **9 片 / 396 行**；JS **18 模块 / 3492 行**（`wc -l` 口径） |
| JS 片序（18） | head · boot · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤)** · complete · library · canvas · splice · modals · keys · paste · pointer · boot(wiring) |

## 模块规模（v7.13 实测，`wc -l` 口径）

| 模块 | 行数 | | 模块 | 行数 |
|---|---:|---|---|---:|
| `interact/pointer.js` | 531 | | `view/canvas.js` | 182 |
| `view/modals.js` | 470 | | `editor/highlight.js` | 168 |
| `editor/complete.js` | 458 | | `view/overlay.js` | 167 |
| `editor/library.js` | 386 | | `core/persist.js` | 133 |
| `shell/boot.js` | 272 | | `editor/struct.js` | 86 |
| `view/splice.js` | 240 | | **`skin/corpus.js`** | **83** |
| `interact/keys.js` | 72 | | `interact/paste.js` | 56 |
| `core/store.js` | 51 | | `core/clipboard.js` | 47 |
| `editor/block-editor.js` | 29 | | | |

## 回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 结果 |
|---|---|
| 构建 | **230492 B** |
| 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.13_20260917.html`） |
| `verify_v7.mjs` | **83/83** |
| `verify_v76.mjs` | **18/18** |
| `verify_v77.mjs` | **16/16** |
| `verify_v78.mjs` | **50/50**（v7.8.2 40 + P1 4 + P2 2 + P3 1 + R0 1 + **R1 2**） |
| `probe_dev_index.mjs` | **18/18** |

## 本轮证伪

| 断言 | 证伪动作 | 结果 |
|---|---|---|
| **R1 皮肤边界** + **R1 语料归属** | 在 `editor/complete.js` 顶部注入 `var FALSIFY_SKIN_REF = "skin/corpus";` 与 `var FALSIFY_TOKEN = "【光影逻辑】";` | **两条同时红**，`48/50`，退出码 1：`违规 引擎→skin ["editor/complete.js"]`、`引擎命中=true`；**其余 48 条未受误伤** → 还原后 50/50、指纹复原 |

## 已知遗留 / 下一步

- **R2**：`shell/boot.js` 改名 `shell/wiring.js`（Q10 决定：**只改名不拆**；它是 F2「隐性上帝对象」，
  273 行 / 50 处 `addEventListener` / 被引 101 次）
- **R3/R4**：把「引擎零领域语义」从"一句注释"升级为**构建期检查**（如：引擎文件里禁出现领域词表）
- `skin/` 目前**只有 corpus 一片**；资产导入/导出的域仍是内置（v7.8.2 已撤销降示例）——
  若将来要支持"外置皮肤包"，`skin/` 就是落点

## 自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 230492 B
node dev/_qa/run-gate.mjs                    # 期望：7/7 全绿（83/18/16/50/18），退出码 0
node dev/_qa/diag/probe_dev_index.mjs        # 开发态 18/18（需先起 headless 浏览器）
```

---

## 补记（2026-09-17 · R2/R3/R4 收口后）

> 本文件是 **v7.13 的冻结记录**，正文（含上文「已知遗留」里的 R2/R3/R4 三条）**一字未改**；
> 此「补记」只**追加**后续演进，不改史实。

- **R2 已落地**：`dev/src/shell/boot.js` → **`dev/src/shell/wiring.js`**（`git mv`，只改名不拆）；
  导出键 `PHJ.boot` → `PHJ.wiring`；`manifest.mjs` 的 `SLICES`/`MODULES` 与 `verify_v78` 的
  `P2_MODULES`/`P2_EXPORTS_GOLDEN` 三处同步。
- **R3/R4 已落地**：「引擎零领域语义」由 R1 的「一条边断言」升级为**棘轮**（新模块
  `dev/_qa/lib/skin-guard.mjs`，`DOMAIN_HITS_GOLDEN = 15`）+ **皮肤可摘除**逐字节证明（R4）；
  新增断言 3 条，`verify_v78` 由 50 → **53**。
- **产物**：230492 → **230494 B**（**+2 B**，恰好是 `boot`→`wiring` 这一个导出键）。
- **闸门**：`node dev/_qa/run-gate.mjs` = **7/7 全绿**（**83 / 18 / 16 / 53 / 18**）。
- **当前现状**以 `dev/_qa/snapshots/BASELINE_v7.14.md` 为准。
