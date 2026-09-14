# 交付快照指纹 · PHJ.html v7.8（2026-09-13）

来源：`feat/editor-blocks` 分支 v7.8 交付物（编辑器「结构层 + 结构感知候选气泡 + 槽位 + 复制全文」），
并入 master 后逐字节落入本仓（提交见 `git log`）。
记入时间：2026-09-14 ｜ 记录者：软件工程师（合并集成时补档）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.8（编辑器补全：结构层 / 候选气泡 / 槽位 / 片段库） |
| **bytes** | **214433** |
| **sha256** | **b6ff74a039f4a56a1cc0c555c7c340360d3ddac17cf63f26cc54c55297782e25** |
| 行尾 | CRLF ×3749，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 3750 行（`wc -l` 报 3749 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.8_20260913.html`（同一字节内容，等价性闸门的比对基准） |
| 构建 banner | 第 2 行：`<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->` |

## 构建可复现（等价性闸门基线，2026-09-14 改义）

v7.8 起 `verify_build_equivalence.mjs` 的默认语义 = **构建可复现**：
`node dev/build.mjs` 的产出与本快照**逐字节一致（含 banner，不做 stripBanner）**。

| 项 | 值 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **214433 B**，sha256 `b6ff74a039f4a56a1cc0c555c7c340360d3ddac17cf63f26cc54c55297782e25` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.8_20260913.html`（逐字节相同） |
| 切片 | CSS **9 片 / 384 行**；JS **19 片 / 3235 行**（`wc -l` 口径；构建逐片打印的行数含每片末尾换行，合计 393 / 3254） |

切片清单（构建输出，2026-09-14 实测）：

- CSS（9）：`00-base.css` 20 ｜ `10-canvas.css` 43 ｜ `20-menu.css` 9 ｜ `30-splice.css` 61 ｜ `40-window.css` 51 ｜ `50-editor.css` 27 ｜ `51-complete.css` 22 ｜ `52-library.css` 46 ｜ `90-effects.css` 105
- JS（19）：`00-header.js` 38 ｜ `10-state.js` 156 ｜ `15-clipboard.js` 45 ｜ `20-render.js` 30 ｜ `25-overlay.js` 164 ｜ `30-selection.js` 107 ｜ `35-splice.js` 237 ｜ `40-template.js` 322 ｜ `50-editor.js` 191 ｜ `51-struct.js` 83 ｜ `52-complete.js` 436 ｜ `53-library.js` 364 ｜ `55-menu.js` 142 ｜ `60-keyboard.js` 46 ｜ `62-block-size.js` 145 ｜ `64-zoom.js` 63 ｜ `66-pan.js` 56 ｜ `68-drag.js` 297 ｜ `90-boot.js` 315

## 回归闸门（并入 master 后实测）

| 闸门 | 期望 |
|---|---|
| 构建 | `PHJ.html` = 214433 B |
| 等价性（构建可复现） | ✅ PASS（含 banner 逐字节一致） |
| `verify_v7.mjs` | **85/85**（体积预算 B10a/C8a 已上调至 229376 B） |
| `verify_v76.mjs` | **F 组 18/18** |
| `verify_v77.mjs` | **G 组 16/16** |
| `verify_v78.mjs` | **H 组 21 + I 组 14 = 35/35** |
| `probe_dev_index.mjs` | **开发态 18/18** |

一键复跑：`node dev/_build/run-gate.mjs`（7 道闸门，退出码 0 = 全绿）。

## 自检

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('PHJ.html');console.log('bytes',b.length);console.log('sha256',c.createHash('sha256').update(b).digest('hex'))"
# 期望：bytes 214433 ／ sha256 b6ff74a039f4a56a1cc0c555c7c340360d3ddac17cf63f26cc54c55297782e25
```

> 历史基线 `PHJ_v7.7_baseline.html`（155224 B，无 banner，重构前单文件形态）与 `BASELINE_v7.7.md`
> 仍保留；v7.7 的「剥离 banner 后逐字节等价」语义可用 argv 指定基线复跑（见
> `verify_build_equivalence.mjs` 文件头「历史比对」段）。
