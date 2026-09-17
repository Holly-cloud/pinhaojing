# 交付快照指纹 · PHJ.html v7.14（2026-09-17）

> **本轮性质 = R2/R3/R4 三项收口**：
> **R2** 模块改名（`shell/boot.js` → `shell/wiring.js`，只改名不拆）；
> **R3** 把「引擎零领域语义」从 R1 的「一条边断言」升级为**可执行、可证伪的棘轮**（新模块 `dev/_qa/lib/skin-guard.mjs`）；
> **R4** 新增「皮肤可摘除」逐字节证明（真读产物 + 合成皮肤替换演练）。
> 产物字节变化**仅因 R2 的导出键 `PHJ.boot` → `PHJ.wiring`（+2 B）**，行为零变化。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.14（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **230494** |
| **sha256** | **5d8e7a5c386c589f9edbf8ed107588ff62eb29fe059420149ff8915340859f3d** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.14_20260917.html`（同一字节内容，等价性闸门的比对基准） |

## 本轮变更要点（v7.13 → v7.14 · R2/R3/R4）

### R2 · 模块改名：`shell/boot.js` → `shell/wiring.js`（只改名不拆）

| 项 | 改动 | 是否影响产物字节 |
|---|---|---|
| 文件 | `git mv dev/src/shell/boot.js dev/src/shell/wiring.js` | 否 |
| 导出键 | 末行 `PHJ.boot = { exportJSON };` → `PHJ.wiring = { exportJSON };` | **是（唯一）**：`boot`→`wiring` = **+2 B** |
| `manifest.mjs` | `SLICES[18]` 的 `id/module/file` → `wiring`；`MODULES` 的 `id/path/exports/resp` → `wiring`（**顺序不变**，仍是第 18 条 = 末条）；活注释（顺序说明 / `V78_EDGES` 的 `now`）同步 | 否（manifest 不进产物） |
| `verify_v78.mjs` | `P2_MODULES`（`wiring` 归位到**排序末位**）与 `P2_EXPORTS_GOLDEN`（`wiring: ['exportJSON']`）同步 | 否 |

**为什么只改名**：`wiring` 的职责是「事件接线 + 末尾 `load()`」——它仍是 F2「隐性上帝对象」（272 行 / 50 处
`addEventListener` / 被引 101 次），拆分不是本轮目标（Q10 决定）。改名让「它是什么」在文件名上诚实。

**产物 diff 证明（恰好一处）**：

```bash
git show 65905d4:PHJ.html > old.html && diff old.html PHJ.html
# 3994c3994
# < PHJ.boot = { exportJSON };
# > PHJ.wiring = { exportJSON };
# （全文仅此 1 行变化；230492 → 230494 B = +2 B）
```

### R3 · 引擎零领域语义**棘轮**（新模块 `dev/_qa/lib/skin-guard.mjs`）

**动机**：R1 只用「引擎不得引用 `skin/` 路径」这一条边守门；但领域**词元**可以不写路径、
直接以字面量/对象键**塞进引擎代码**（现存就有：`struct.js` 的 `STRUCT_MARKS`、`complete.js` 的
`CMPL_GROUP_HINT`）。R3 用一个**棘轮**把这条路堵死。

**机制**（零依赖、纯静态，不依赖浏览器）：

| 导出 | 口径 |
|---|---|
| `harvestDomainTokens(skinSrcFiles)` | 从**皮肤源码的字符串字面量**里抽「领域词元」（连续 CJK，长度 ≥ 2） |
| `listEngineFiles(srcRoot)` | `src/**` 下**非皮肤** JS（排除 `skin/**` 与生成物 `dev-bundle.js`） |
| `DOMAIN_HITS_GOLDEN` | 冻结尾数 = **15** |

| 断言 | 判定 | 可证伪点 |
|---|---|---|
| **R3-A 棘轮** | 皮肤词元命中「**引擎代码（剥注释）**」的去重数 **≤ 15** | 往 `editor/` 写一行**未出现过的**皮肤词元（如 `暖主体`）→ 命中 16 > 15 → **必红** |
| **R3-B 零泄漏** | 皮肤**长语料**（≥ 40 字）在「非皮肤源码**原文**」里 **命中 == 0** | 把一段长语料原样粘进 `editor/` → 命中非空 → **必红** |

**为什么是「≤ golden」而非「== 0」**：现存引擎代码里**刻意保留**了一批领域词元（符号契约，非待清债）：

| 文件 | 命中词元 | 性质 |
|---|---|---|
| `editor/complete.js` | 台词/景别/运镜/镜头/镜头句/风格/风格包/硬性要求/结构件/起手式 | `CMPL_GROUP_HINT` 组名→区 映射（**代码**） |
| `editor/struct.js` | 画面开始/画面结束/风格/风格包/硬性要求/起手式/镜头 | `STRUCT_MARKS` 标记表（**代码**） |
| `core/store.js` | 角色 / 镜头 | 默认**示例块文本**（字面量） |
| `editor/library.js` | 未用过 / 用过 / 镜头句 | 配置窗**占位符文案**（字面量） |

实测：皮肤字面量词元 **146** 个 → 命中引擎代码 **15** 个（上表 15 个去重）。**棘轮冻结 15，只堵新增**；
将来把这些词元迁回皮肤，命中数**下降**不会变红；只有**新增泄漏**才红。

> 口径细节：R3-A 在**剥注释后**的引擎代码上判（「语义」指代码；与 R1 同源口径）；
> R3-B 在**原文**上判（更严，连注释里出现长语料也算泄漏）。

### R4 · 皮肤可摘除（逐字节证明 + 合成皮肤替换演练）

**命题**：产物内联 JS 段 == 「各**非皮肤**片按构建规则拼接」+「**皮肤**片的贡献」，且皮肤片可**整段摘除**
（摘除后逐字节等于各非皮肤片的拼接）→ 皮肤是**可替换的独立段**：换皮肤不动引擎。

**做法**（真读 `PHJ.html`，按 `build.mjs` 的拼接规则反向证明）：

1. 取产物 `<script>` 段 → LF 归一 → 剥 IIFE 外壳（`\n;(function(){\n` … `\n})();\n`）得 `body`；
2. 按规则重算：皮肤片贡献 = `corpus.js(LF 归一).replace(/\n$/,'') + '\n'`；非皮肤片拼接 = 各片同规则 `join('\n')`；
3. **断言**：`body − 皮肤贡献 == 非皮肤片拼接`（逐字节）；且替换演练：用合成皮肤段替换真皮肤段后，
   引擎前缀/后缀**逐字节不变**、仅皮肤段变化。

| 断言 | 可证伪点 |
|---|---|
| **R4 皮肤可摘除** | 改 `skin/corpus.js` 一个字符（不重建）→ 产物皮肤段与源不再逐字节相等 → **必红** |

## 新增断言 3 条（verify_v78：50 → 53）

| 断言 | 内容 | 可证伪点 |
|---|---|---|
| **R3-A 皮肤词元棘轮** | 皮肤词元命中引擎代码（剥注释）的去重数 ≤ 15 | 引擎里新增一个皮肤词元即红 |
| **R3-B 皮肤语料零泄漏** | 皮肤长语料（≥ 40 字）在非皮肤原文零命中 | 引擎里粘贴一段长语料即红 |
| **R4 皮肤可摘除** | 产物 = 非皮肤拼接 + 皮肤贡献；摘除皮肤 == 非皮肤拼接（+ 合成替换演练） | 改皮肤一字符即红 |

至此「引擎 × 皮肤」路线有 **5 条**守法断言：R1 皮肤边界、R1 语料归属、R3-A 棘轮、R3-B 零泄漏、R4 可摘除。

## 构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **230494 B**，sha256 `5d8e7a5c386c589f9edbf8ed107588ff62eb29fe059420149ff8915340859f3d` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.14_20260917.html`（逐字节相同） |
| JS 片序（18） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus(皮肤)** · complete · library · canvas · splice · modals · keys · paste · pointer · **wiring** |

## 模块规模（v7.14 实测，`wc -l` 口径）

| 模块 | 行数 | | 模块 | 行数 |
|---|---:|---|---|---:|
| `interact/pointer.js` | 532 | | `view/canvas.js` | 183 |
| `view/modals.js` | 471 | | `editor/highlight.js` | 169 |
| `editor/complete.js` | 459 | | `view/overlay.js` | 168 |
| `editor/library.js` | 387 | | `core/persist.js` | 134 |
| **`shell/wiring.js`** | **273** | | `editor/struct.js` | 87 |
| `view/splice.js` | 241 | | `skin/corpus.js` | 84 |
| `interact/keys.js` | 73 | | `interact/paste.js` | 57 |
| `core/store.js` | 52 | | `core/clipboard.js` | 48 |
| `editor/block-editor.js` | 30 | | | |

## 回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 结果 |
|---|---|
| 构建 | **230494 B** |
| 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.14_20260917.html`） |
| `verify_v7.mjs` | **83/83** |
| `verify_v76.mjs` | **18/18** |
| `verify_v77.mjs` | **16/16** |
| `verify_v78.mjs` | **53/53**（v7.8.2 40 + P1 4 + P2 2 + P3 1 + R0 1 + R1 2 + **R3 2** + **R4 1**） |
| `probe_dev_index.mjs` | **18/18** |

## 本轮证伪

| 断言 | 证伪动作 | 结果 |
|---|---|---|
| **R3-A / R3-B** | 往 `editor/struct.js` 注入 `var __DRILL='暖主体';` 与一段皮肤长语料 | **R3-A / R3-B 同时红**（命中 16 > 15；长语料命中 ≥ 1）；其余未受误伤 |
| **R4** | 改 `skin/corpus.js` 一个字符（不重建） | **R4 独红**（产物皮肤段与源不再逐字节相等） |
| R2 三处同步 | 只改导出键、漏改 manifest/verify | 若漏改 `P2_MODULES`/`P2_EXPORTS_GOLDEN`，P2-B/P2-B2 会红（已同步，故绿） |

> 证伪在**不改产品**的前提下、以**直驱 `verify_v78.mjs`**（先构建产物、再改源、不重建）复现：
> 断言读的是**源文件**（R3）与**源 + 已经构建的产物**（R4），故能单独触发而其余保持绿。还原后 53/53。

## 已知遗留 / 下一步

- `shell/wiring.js`（273 行 / 50 处 `addEventListener`）仍是 F2「隐性上帝对象」——**只改名，未拆**。
  拆分（按加载期副作用边界切）会改变注册序，需另案 + P2-A 契约同步。
- R3-A 的 `DOMAIN_HITS_GOLDEN = 15` 是**冻结尾数**，维护口径**只减不增**；若确因机制需新增领域符号，
  须在本文件写明理由后上调（棘轮允许收紧、惩罚放松）。
- `skin/` 仍只有 `corpus.js` 一片；「外置皮肤包」是长期落点（见 `docs/ops/目标架构与长期规划`）。

## 自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 230494 B
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A 命中 15 ≤ golden 15；R3-B 长语料命中 0
node dev/_qa/run-gate.mjs                       # 期望：7/7 全绿（83/18/16/53/18），退出码 0
node dev/_qa/diag/probe_dev_index.mjs           # 开发态 18/18（需先起 headless 浏览器）
```
