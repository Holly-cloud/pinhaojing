# dev/ 导览（开发用品区）

> **用户用品在仓库根**：`PHJ.html`（双击即用的单文件交付物）+ `README.md`（交接入口）。
> 本目录是开发侧：源码、构建、验收、文档。
> **一条命令复现全部验收**：`node dev/_qa/run-gate.mjs`（7 道闸门，自起自收 headless 浏览器）。

## 一、本目录 5 个区域（先看这张表）

| 区域 | 性质 | 一句话是什么 |
|---|---|---|
| `dev/README.md` · `dev/CHANGELOG.md` · `dev/manifest.mjs` · `dev/build.mjs` · `dev/src/` | **活文件** | 「改源码 → 构建 → 出产物」的日常链路；每次改动都在变。 |
| `dev/docs/` | **冻结的历史记录** | 记「为什么这么定 / 怎么做的 / 做成了什么 / 怎么交接」；写完即不再改。索引见 `dev/docs/README.md`。 |
| `dev/_qa/` | **验收工装 + 闸门基准 + 物证留档** | 一条命令复现全部验收；分区见 `dev/_qa/README.md`，快照角色见 `dev/_qa/snapshots/INDEX.md`。 |

## 二、改动入口（唯一手改处）

| 位置 | 内容 |
|---|---|
| `src/index.html` | 骨架：引**单一** `./dev-bundle.js` + 9 条 CSS 链（顺序须与 `manifest.mjs` 的 `CSS` 一致，构建会校验） |
| `src/styles/` | 9 片 CSS |
| `src/shell/` `src/core/` `src/editor/` `src/view/` `src/interact/` | **引擎：17 个职责模块**（head/boot；store/persist/clipboard；highlight/struct/complete/library/block-editor；canvas/splice/overlay/modals；pointer/keys/paste） |
| **`src/skin/`** | ★ **皮肤层（R1）**：领域语料/术语/默认值。当前 1 片 `corpus.js`（风格包 5 段 + 硬性要求 + 补全分组语料） |

> **引擎 × 皮肤分层（R1，2026-09-17）**：`core/` + `editor/` = **引擎（零领域语义）**；`skin/` = **域内容**。
> 方向单一：引擎**不得**引用 `skin/`，`skin/` **不得**反向依赖引擎。由 `verify_v78.mjs` 的 **R1 皮肤边界** + **R1 语料归属** 两条断言守门（违反即红）。含义：换领域只需替换 `skin/`，**不动引擎**。`skin/` 不导出到 `PHJ` 对外面。

- **顺序唯一来源 = `manifest.mjs` 的 `SLICES`（18 条 = 加载序，含 1 片皮肤）**；顺序对「加载期副作用注册序」敏感，**改顺序要跑 P2-A 断言**（见 `_qa/snapshots/BASELINE_v7.13.md` 的说明）。
- ⚠️ **`skin/corpus` 的加载位置（`struct` 之后 / `complete` 之前）勿随手改**：它提供的是顶层 `var`，被 `complete.js` 的顶层 `var` 消费，必须**先声明后消费**。
- 改完跑：`node dev/build.mjs`（产出根目录 `PHJ.html` + `dev/src/dev-bundle.js`）。
- ⚠️ `PHJ.html` 与 `src/dev-bundle.js` 都是**生成物**，勿手改（后者已 gitignore）。

## 三、构建与验收

| 文件 | 作用 |
|---|---|
| `build.mjs` | 纯 node、**零依赖**：按 manifest 顺序内联 → `PHJ.html`；同一份字节写入 `src/dev-bundle.js`（**dev≡prod**） |
| `manifest.mjs` | 模块清单：`SLICES`（顺序源）/ `CSS` / `MODULES`+`deps`（文档性质）/ `PENDING`（已全部判定关闭） |
| `_qa/run-gate.mjs` | ★ **一键闸门**（构建 / 等价性 / verify_v7 / F / G / H+I / 开发态），期望 **7/7** |
| `_qa/README.md` | `_qa/` 分区导览（在用 / 历史 / 留档 / 生成物一眼分清） |
| `_qa/snapshots/INDEX.md` | 快照角色表（当前基准 / 历史 argv 基准 / 不可动清单） |

## 四、文档去哪看

| 想了解 | 去看 |
|---|---|
| 版本沿革（逐版功能史 v6.1→v7.8） | `dev/CHANGELOG.md` |
| 历史决策 / 设计 / 发布 / 交接（**分类索引 + 旧名→新名映射表**） | `dev/docs/README.md` |
| 为什么是现在这个结构 | `dev/docs/decisions/项目结构整理_2026-09-17.md` |
| 目标架构与长期规划 | `dev/docs/ops/目标架构与长期规划_2026-09-17.md` |
| 换机 / 交接 | `dev/docs/ops/交接与换机指南_2026-09-16.md` |

## 五、档案原则（本项目一直遵守）

1. **活文件不得引用旧路径**：`dev/` 顶层与各 README 一律使用当前路径；历史文档正文里的旧路径（`dev/01_…`–`dev/11_…`、`dev/_build/…`）**按沿革保留、不再逐条改写**，当前位置一律以 `dev/docs/README.md` 的映射表为准。
2. **归档一律用 `git mv`**（保全历史、可回退）；**只删「可再生」的生成物**（构建产物 / 测试产物）。
3. **只加标注、不删史实**：被撤销的决策用「⚠️ 已撤销」就地标注，不整段删除。
