# 交付快照指纹 · PHJ.html v7.8.2（2026-09-15）

来源：v7.8.2「风格包放回内置」（撤销 v7.8.1「内置降为中性示例」的处置；v7.8.1 其余成果全部保留），由 v7.8.1 源码增量而来。
记入时间：2026-09-15 ｜ 记录者：软件工程师（本轮交付时补档）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.8.2（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **222359** |
| **sha256** | **066286bf14338e9e704e011b8fe0ecc0dacdf593b18d8d8e1946c79dbd650bab** |
| 行尾 | CRLF ×3881，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 3882 行（`wc -l` 报 3881 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.8.2_20260915.html`（同一字节内容，等价性闸门的比对基准） |
| 构建 banner | 第 2 行：`<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->` |

## 本轮变更要点（v7.8.1 → v7.8.2）

背景：Holly 改变 Q7 决定——**风格包本身即语料的一部分**，不必在「是否暴露」上做设计；选择「**把风格包放回内置**」。
故本轮 = **撤回 v7.8.1「内置库降为中性示例」的那部分**，其余 v7.8.1 成果（导入/导出、`src` 字段、version 14、migrate 零丢失、reset 语义、I 组重锚、X3/X4）**全部保留**。

- **风格包放回内置**（`dev/src/js/52-complete.js`，**只还原风格包相关常量、未整文件回退**）：
  - 恢复 `CMPL_STYLE`（光影逻辑 / CG 风格 / 镜头构图 / 渲染质感 / 负面提示词 共 5 段）与 `CMPL_TAIL`（硬性要求）。
  - `cmplFullStyle()` 改回从 `CMPL_STYLE` + `CMPL_TAIL` 派生；`CMPL_GROUPS[0]`（风格包组）改回真实风格包
    （「风格包 · 全套」`block:true` + 5 段各自条目 + 硬性要求；仍 **7 组**、组内仍 **≥5 条**）。
  - 删除只服务于「中性示例」的废弃常量（`CMPL_EXAMPLE_PARTS` / `CMPL_EXAMPLE_TAIL`），不留无用代码。
  - **逐字一致**：恢复的 5 段 body 与硬性要求与 v7.8 原文（`git show ce8b7a0:dev/src/js/52-complete.js`）**逐字相同**（本次实测 **0 处不一致**）。
  - `CMPL_SEED_V` 保持 1；`cmplSeedItems` 的 `src:'seed'` 标注**保留**（导入/导出与 reset 语义需要它）。
  - v7.8.1 新增的**资产 导入/导出**（`cmplExportAsset()` / `cmplImportAsset()`，`FileReader`、零网络）、`src ∈ {seed, asset, user}`、`state.cmpl` 结构**全部保留**。
- **撤掉随需求撤销的一句失效提示**（`dev/src/js/53-library.js`）：
  v7.8.1 曾在内置仍为中性示例时于「补」窗顶部给一行非阻断提示「当前「风格包」是内置 **中性示例（请替换）**…」。
  风格包回内置后该提示**必然为假**（会误报），故**删除该提示块**及其专用判定函数 `cmplHasAsset()`（仅此一处使用）、
  以及仅该提示使用的样式 `.cmpl-cfg-hint-example`（`dev/src/styles/52-library.css`）；「恢复内置默认」确认文案「内置示例」→「内置片段」。
- `dev/src/index.html`：`#cmplCfgReset` 的 `title` 文案「内置示例上的改动」→「内置片段上的改动」（**未动 `<script src>` 顺序**）。
- `README.md`：同步 v7.8.2 现状——产物 `222359 B`、「改完必过的闸门」`v7.8.2 H+I+X 40/40`（H19 补齐后）、等价性默认基准改指
  `snapshots/PHJ_v7.8.2_20260915.html`（v7.8.1 快照列入可 argv 指定的历史基线）、实测体积余量、以及「内置真实风格包」的候选内容描述。
- `dev/src/js/10-state.js`：仅**注释**更新（记录 v7.8.2 撤回内置边界；`version` 仍 **14**、`migrate()` 口径**未变**——对 v1~v13 **逐字原样保留 `cmpl.items`**，仅补默认 `src`，绝不静默清除用户已有数据）。
- `dev/_build/verify/verify_v78.mjs`：**删除 X1 / X2** 两条断言（命题「内置库 / 产物不得含风格包私有正文」随需求撤销而不再成立 → 属**需求撤销→删除**，非放宽）；
  **保留** X3（导出 → 再导入 往返一致）/ X4（导入 → reload → 仍在），**保留** H 组 / I 组 13 条重锚断言与 `I7b`，
  以及夹具 `FIX_*` 的**运行时提取**机制（夹具仍从 `PHJ_v7.8_20260913.html` 运行时提取，H 组重锚依赖它）；
  仅被 X1/X2 使用的 `PRIV_STRINGS` 与 `XROOT/walkFiles/x2files` 一并清掉（不留无用代码）。
  **断言总数 41 → 39**（H+I+X 合计；本轮**唯一**允许的计数变化）。
- `dev/_build/run-gate.mjs`：同步期望值（构建 222359 B；等价性基准 = `PHJ_v7.8.2_20260915.html`；verify_v78 = 40/40，v7.8.2 交付后补 H19「内置风格包逐字」断言，39→40）。**未改判定逻辑**。
- `dev/_build/verify/verify_build_equivalence.mjs`：默认基准改指 `PHJ_v7.8.2_20260915.html`；v7.7 / v7.8 / v7.8.1 快照保留为 **argv 指定基线**。
- 新增自检脚本（可选、可复现、非产品）：`dev/_build/diag/probe_v782_verbatim.mjs`（产物 vs v7.8 原文逐字比对）、
  `dev/_build/diag/probe_v782_coldstart.mjs`（冷启动「补」窗呈现真实风格包 + 内置逐字活断言）。
- **未改**：`dev/build.mjs`、`dev/src/js/51-struct.js`、`dev/src/index.html` 的 `<script src>` 顺序、`.gitignore`。
- **保留**仓库外的 `AA_Dev\写作资产_风格包_v1.json`（便捷的导出/备份样本）。

## 构建可复现（等价性闸门基线，Q6 校准）

v7.8.1 起 `verify_build_equivalence.mjs` 的默认语义 = **构建可复现**（**全程有效**，原「P2 起退役」作废）：
`node dev/build.mjs` 的产出与本快照**逐字节一致（含 banner，不做 stripBanner）**。
历史基线 `PHJ_v7.7_baseline.html`、`PHJ_v7.8_20260913.html`、`PHJ_v7.8.1_20260915.html` 保留为 **argv 指定基线**。

| 项 | 值 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **222359 B**，sha256 `066286bf14338e9e704e011b8fe0ecc0dacdf593b18d8d8e1946c79dbd650bab` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.8.2_20260915.html`（逐字节相同） |
| 切片 | CSS **9 片 / 387 行**；JS **19 片 / 3357 行**（`wc -l` 口径） |

切片清单（`wc -l` 口径，2026-09-15 实测）：

- CSS（9）：`00-base.css` 20 ｜ `10-canvas.css` 43 ｜ `20-menu.css` 9 ｜ `30-splice.css` 61 ｜ `40-window.css` 51 ｜ `50-editor.css` 27 ｜ `51-complete.css` 22 ｜ `52-library.css` 49 ｜ `90-effects.css` 105（逐片之和 = 387）
- JS（19）：`00-header.js` 38 ｜ `10-state.js` 162 ｜ `15-clipboard.js` 45 ｜ `20-render.js` 30 ｜ `25-overlay.js` 164 ｜ `30-selection.js` 107 ｜ `35-splice.js` 237 ｜ `40-template.js` 322 ｜ `50-editor.js` 191 ｜ `51-struct.js` 83 ｜ `52-complete.js` 516 ｜ `53-library.js` 383 ｜ `55-menu.js` 142 ｜ `60-keyboard.js` 46 ｜ `62-block-size.js` 144 ｜ `64-zoom.js` 63 ｜ `66-pan.js` 55 ｜ `68-drag.js` 297 ｜ `90-boot.js` 332（逐片之和 = 3357）

## 回归闸门（本轮实测 · `node dev/_build/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 期望 |
|---|---|
| 构建 | `PHJ.html` = 222359 B |
| 等价性（构建可复现） | ✅ PASS（含 banner 逐字节一致，基准 = `PHJ_v7.8.2_20260915.html`） |
| `verify_v7.mjs` | **87/87**（B10b/C8b「产品硬上限 262144 B」；B10a/C8a「工程临时护栏 229376 B」保留、判定式未放宽） |
| `verify_v76.mjs` | **F 组 18/18** |
| `verify_v77.mjs` | **G 组 16/16** |
| `verify_v78.mjs` | **H 组 23（含 H19 内置风格包逐字）+ I 组 15 + X 组 2 = 40/40**（H 组其余键于「导入后的用户表」；夹具运行时从 v7.8 快照提取；X1/X2 已随需求撤销删除；H19 为交付后补的覆盖缺口——守**内置 seed 风格包**逐字，产物字节不变） |
| `probe_dev_index.mjs` | **开发态 18/18** |

## 体积余量（工程临时护栏 229376 B）

- 实测 `222359 B`；距工程临时护栏 `229376 B` 余 **7017 B（≈6.85 KB）**；距产品硬上限 `262144 B` 余 **39785 B**。
- 相对 v7.8.1（222400 B）**净减 41 B**：风格包回内置约 +680 B，但删掉失效提示块 + `cmplHasAsset()` + 失效 CSS 约 −727 B。
- 本轮**不做瘦身**。

## 自检

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('PHJ.html');console.log('bytes',b.length);console.log('sha256',c.createHash('sha256').update(b).digest('hex'))"
# 期望：bytes 222359 ／ sha256 066286bf14338e9e704e011b8fe0ecc0dacdf593b18d8d8e1946c79dbd650bab
```
