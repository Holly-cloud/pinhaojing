# 交付快照指纹 · PHJ.html v7.8.1（2026-09-15）

来源：v7.8.1「私有写作资产分离 + 体积政策落定」（Q7 主体 + Q5/Q6 随轮落定），由 v7.8 源码增量而来。
记入时间：2026-09-15 ｜ 记录者：软件工程师（本轮交付时补档）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.8.1（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **222400** |
| **sha256** | **8fe2258e9b28a3369627671ce48b5fce0159c536ece2937306fe2c347422370d** |
| 行尾 | CRLF ×3896，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 3897 行（`wc -l` 报 3896 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.8.1_20260915.html`（同一字节内容，等价性闸门的比对基准） |
| 构建 banner | 第 2 行：`<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->` |

## 本轮变更要点（v7.8 → v7.8.1）

- **Q7 资产分离**：`dev/src/js/52-complete.js` 删除逐字硬编码的私有写作资产（风格包 5 段 + 硬性要求）；
  内置「风格包」组降为**中性示例（请替换）**（仍 7 组、组内仍 ≥5 条，机制/置顶/断言结构不变）；
  新增 `cmplExportAsset()` / `cmplImportAsset(file)`（`FileReader`、**零网络**），条目增 `src ∈ {seed, asset, user}`。
- `dev/src/js/10-state.js`：`version 13 → 14`；`migrate()` 对 v≤13 **逐字原样保留 `cmpl.items`**（仅补默认 `src`），**绝不静默清除用户已有风格包**；`CMPL_SEED_V` 保持 1。
- `dev/src/index.html`：`补` 窗 foot 增「导入/导出写作资产」入口 + 隐藏 `<input type=file>`；仍是 19 片 JS / 9 片 CSS，`<script src>` 顺序不变（无新 slice）。
- `dev/src/js/53-library.js`：`恢复内置默认` 改**先确认**（走既有 `#modalMask`）+ **保留 asset/user**；风格包仍为中性示例时给**非阻断**提示。
- `dev/src/styles/52-library.css`：复用既有 `.btn`，仅补 foot 左右分组与提示样式（+5 行）。
- `dev/build.mjs` / `dev/src/js/51-struct.js`：**未改**。

## 构建可复现（等价性闸门基线，Q6 校准）

v7.8.1 起 `verify_build_equivalence.mjs` 的默认语义 = **构建可复现**（**全程有效**，原「P2 起退役」作废）：
`node dev/build.mjs` 的产出与本快照**逐字节一致（含 banner，不做 stripBanner）**。
历史基线 `PHJ_v7.7_baseline.html`、`PHJ_v7.8_20260913.html` 保留为 **argv 指定基线**。

| 项 | 值 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **222400 B**，sha256 `8fe2258e9b28a3369627671ce48b5fce0159c536ece2937306fe2c347422370d` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.8.1_20260915.html`（逐字节相同） |
| 切片 | CSS **9 片 / 389 行**；JS **19 片 / 3370 行**（`wc -l` 口径） |

切片清单（`wc -l` 口径，2026-09-15 实测）：

- CSS（9）：`00-base.css` 20 ｜ `10-canvas.css` 43 ｜ `20-menu.css` 9 ｜ `30-splice.css` 61 ｜ `40-window.css` 51 ｜ `50-editor.css` 27 ｜ `51-complete.css` 22 ｜ `52-library.css` 51 ｜ `90-effects.css` 105（逐片之和 = 389）
- JS（19）：`00-header.js` 38 ｜ `10-state.js` 160 ｜ `15-clipboard.js` 45 ｜ `20-render.js` 30 ｜ `25-overlay.js` 164 ｜ `30-selection.js` 107 ｜ `35-splice.js` 237 ｜ `40-template.js` 322 ｜ `50-editor.js` 191 ｜ `51-struct.js` 83 ｜ `52-complete.js` 518 ｜ `53-library.js` 396 ｜ `55-menu.js` 142 ｜ `60-keyboard.js` 46 ｜ `62-block-size.js` 144 ｜ `64-zoom.js` 63 ｜ `66-pan.js` 56 ｜ `68-drag.js` 297 ｜ `90-boot.js` 332（逐片之和 = 3370）

## 回归闸门（本轮实测 · `node dev/_build/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 期望 |
|---|---|
| 构建 | `PHJ.html` = 222400 B |
| 等价性（构建可复现） | ✅ PASS（含 banner 逐字节一致，基准 = `PHJ_v7.8.1_20260915.html`） |
| `verify_v7.mjs` | **87/87**（v7.8.1 新增 B10b/C8b「产品硬上限 262144 B」；B10a/C8a「工程临时护栏 229376 B」保留、判定式未放宽） |
| `verify_v76.mjs` | **F 组 18/18** |
| `verify_v77.mjs` | **G 组 16/16** |
| `verify_v78.mjs` | **H 组 22 + I 组 15 + X 组 4 = 41/41**（重锚：H 组键于「导入后的用户表」；夹具运行时从 v7.8 快照提取） |
| `probe_dev_index.mjs` | **开发态 18/18** |

## 私有资产边界（红线自检）

- `PHJ.html` 产物 与 `dev/src/**`：对私有特征串 `光影逻辑`／`暖主体、冷环境`／`无BMG，无字幕`／`负面提示词】`／`中低对比度，柔亮中间调` **0 命中**（`verify_v78.mjs` 的 X1/X2 断言 + 独立检索双重确认）。
- `dev/_build/verify/verify_v78.mjs`：对上述特征串 **0 命中**（夹具文本运行时从 v7.8 快照提取，脚本内不硬编码私有文本）。
- 私有资产**文件**生成于**仓库之外**：`../写作资产_风格包_v1.json`（仓库目录的同级父目录）；`.gitignore` 追加 `dev/_build/artifacts/写作资产*` 作为保险丝。

## 自检

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('PHJ.html');console.log('bytes',b.length);console.log('sha256',c.createHash('sha256').update(b).digest('hex'))"
# 期望：bytes 222400 ／ sha256 8fe2258e9b28a3369627671ce48b5fce0159c536ece2937306fe2c347422370d
```
