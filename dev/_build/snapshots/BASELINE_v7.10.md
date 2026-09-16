# 交付快照指纹 · PHJ.html v7.10（2026-09-16）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.10（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **229609** |
| **sha256** | **fddb22e8993988ecababb2316a47a4a32b30d67d43ef57827884bb17e03fcc60** |
| 行尾 | CRLF ×3966，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 3967 行（`wc -l` 报 3966 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.10_20260916.html`（同一字节内容，等价性闸门的比对基准） |
| 构建 banner | 第 2 行：`<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->` |

## 本轮变更要点（v7.9 → v7.10 · P2 收口 + 容量限制解除）

### P2 收口（模块划分落地 + 显式导出面）

- **合并**：`view/canvas.js`（原 `view/render.js` + `view/blocks.js`）、`view/modals.js`（原 `view/template.js` + `view/menu.js`）、
  `interact/pointer.js`（原 `interact/selection.js` + `zoom.js` + `pan.js` + `drag.js`）
- **拆分**：`core/store.js` + `core/persist.js`（原 `core/state.js`）、`interact/paste.js`（从 `shell/boot.js` 拆出）
- **共 17 个模块文件**：`shell/head|boot`、`core/store|persist|clipboard`、`editor/highlight|struct|complete|library|block-editor`、
  `view/canvas|splice|overlay|modals`、`interact/pointer|keys|paste`
- **显式导出面**：`shell/head.js` 定义 `var PHJ = {}`（IIFE 私有命名空间）；每个模块末尾 `PHJ.<module> = { … }` 导出其对外面
- **顺序仍由 `dev/manifest.mjs` 的 `SLICES`（17 条 = 加载序）显式给出**，`resolveOrder(MODULES)` **不接管**——
  因为 `deps` 是**运行期**依赖（函数提升 → 与文件序无关），而对顺序敏感的是**加载期副作用注册序**（见下）

### ★为什么顺序不能按依赖图重排（本轮最重要的工程结论）

- 同一事件按**注册顺序**调用 → `keydown`/Escape 处理链、拖拽 vs 平移的 `mousedown` 优先级都取决于注册序
- 因此合并块被放在"**成员中最后一个**"的位置（canvas 放 blocks 处、modals 放 menu 处、pointer 放 drag 处），
  使 **`keydown`/`keyup`/`blur` 的注册序与 v7.9 逐条一致**（13 条，P2-A 断言守门）
- 唯一有意的位移：`document:paste` 从第 22 位 → 第 9 位（拆出 `interact/paste.js`）；事件类型不同，无交互

### 容量限制解除（Holly 指示，2026-09-16）

- **删除** `verify_v7.mjs` 的 B10a/B10b/C8a/C8b 四条体积断言 → verify_v7 断言数 **87 → 83**
- 原「产品硬上限 262144 B（P0 阻断）」「工程临时护栏 229376 B（告警）」**两条阈值一并作废**；
  体积仍**实测打印**（B10/C8 段）供人工评估，但**不再阻断、不再告警**
- 沿革保留：v7.2 立 131072 B → v7.7 155315 → v7.8 214433 → v7.8.1 222400 → v7.8.2 222359 → v7.9 222381 → **v7.10 229609**

## 构建可复现（等价性闸门基线）

| 项 | 值 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **229609 B**，sha256 `fddb22e8993988ecababb2316a47a4a32b30d67d43ef57827884bb17e03fcc60` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.10_20260916.html`（逐字节相同） |
| 源文件 | CSS **9 片 / 387 行**；JS **17 个模块 / 3440 行**（`wc -l` 口径） |
| 产物增量 | 相对 v7.9（222381 B）**+7228 B**：合并/拆分改写了文件边界注释与模块头注释、并新增 17 条 `PHJ.<module> = {…}` 显式导出面（约 +7 KB）——**限制已解除，不再作为交付门槛** |

## 回归闸门（本轮实测 · `node dev/_build/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 期望 |
|---|---|
| 构建 | `PHJ.html` = 229609 B |
| 等价性（构建可复现） | ✅ PASS（含 banner 逐字节一致，基准 = `PHJ_v7.10_20260916.html`） |
| `verify_v7.mjs` | **83/83**（体积断言已随容量限制解除删除） |
| `verify_v76.mjs` | **F 组 18/18** |
| `verify_v77.mjs` | **G 组 16/16** |
| `verify_v78.mjs` | **H 23 + I 15 + X 2 + P1 构建器 4 + P2 收口 2 = 46/46**（新增 P2-A 加载期副作用序契约 / P2-B 显式导出面） |
| `probe_dev_index.mjs` | **开发态 18/18**（模块数下限 20 → **17**：合并所致，常量已显式更新并注明） |

## 本轮证伪（关键断言都验证过"会红"）

- **P2-A**：把 `keys` 与 `pointer` 在 `SLICES` 里对调 → **P2-A 红**（45/46）→ 还原回绿
- **P2-B**：删掉任一模块的 `PHJ.<module> = {…}` 导出行 → **P2-B 红**（45/46）→ 还原回绿
- **探针两步断言**（P2 阶段一）：加"清单外"源文件 → B 红；删文件+删条目 → A 红（`清单=18/9`）；均还原回绿
- 每轮还原后产物指纹均回到 `fddb22e8…` / 229609 B，`git status` 干净

## 已知遗留

- `PHJ.<module>` 目前导出"该模块全部顶层符号"（便于快速落地与机器校验）；**P3 收敛为最小对外面**
- 模块间调用**仍走同一 IIFE 作用域**（`PHJ.*` 是显式**导出面**，尚未改为"调用点统一走 PHJ"）——P3 议题
- Escape/keydown 的**统一分发**（11 处处理点收编为显式 modal 栈）仍属 P3

## 自检

```bash
node dev/build.mjs                                  # 期望：PHJ.html 229609 B
node dev/_build/run-gate.mjs                        # 期望：7/7 全绿（83/18/16/46/18），退出码 0
node dev/_build/diag/probe_v782_verbatim.mjs        # 内置风格包逐字（v7.8.2 契约，仍有效）
```
