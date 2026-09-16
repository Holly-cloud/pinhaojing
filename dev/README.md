# dev/ 导览（开发用品区）

> **用户用品在仓库根**：`PHJ.html`（双击即用的单文件交付物）+ `README.md`。
> 本目录是开发侧：源码、构建、验收、档案。
> **一条命令复现全部验收**：`node dev/_build/run-gate.mjs`（7 道闸门，自起自收 headless 浏览器）。

## 一、改动入口（唯一手改处）

| 位置 | 内容 |
|---|---|
| `src/index.html` | 骨架：引**单一** `./dev-bundle.js` + 9 条 CSS 链（顺序须与 `manifest.mjs` 的 `CSS` 一致，构建会校验） |
| `src/styles/` | 9 片 CSS |
| `src/shell/` `src/core/` `src/editor/` `src/view/` `src/interact/` | **17 个职责模块**（head/boot；store/persist/clipboard；highlight/struct/complete/library/block-editor；canvas/splice/overlay/modals；pointer/keys/paste） |

- **顺序唯一来源 = `manifest.mjs` 的 `SLICES`（17 条 = 加载序）**；顺序对"加载期副作用注册序"敏感，**改顺序要跑 P2-A 断言**（见 `_build/snapshots/BASELINE_v7.11.md` 的说明）。
- 改完跑：`node dev/build.mjs`（产出根目录 `PHJ.html` + `dev/src/dev-bundle.js`）。
- ⚠️ `PHJ.html` 与 `src/dev-bundle.js` 都是**生成物**，勿手改（后者已 gitignore）。

## 二、构建与验收

| 文件 | 作用 |
|---|---|
| `build.mjs` | 纯 node、**零依赖**：按 manifest 顺序内联 → `PHJ.html`；同一份字节写入 `src/dev-bundle.js`（**dev≡prod**） |
| `manifest.mjs` | 模块清单：`SLICES`（顺序源）/ `CSS` / `MODULES`+`deps`（P2–P3 后的文档性质）/ `PENDING`（6 条已全部判定关闭） |
| `_build/run-gate.mjs` | ★ **一键闸门**（构建 / 等价性 / verify_v7 / F / G / H+I / 开发态） |
| `_build/README.md` | `_build/` 四分区 + 归档区导览（在用 / 历史 / 归档一眼分清） |

## 三、文档（01–09：按编号 = 按时间）

| 文档 | 是什么 | 状态 |
|---|---|---|
| `01_考察报告_2026-09-07.md` | 立项考察（单文件工具定位与取舍） | 历史 |
| `02_工程计划.md` | 工程计划与节奏 | 历史 |
| `03_发布说明.md` | 早期发布说明 | 历史 |
| `04_发布说明_v6.0.md` | v6 系列大版发布说明（**编号与 `03` 撞号：同一编号下的不同产物，非笔误**） | 历史 |
| `05_动效设计草案_2026-09-11.md` | 动效设计与验收口径 | 历史（口径仍被引用） |
| `06_着色方案草案_2026-09-13.md` + `06_小样截图_2026-09-13.png` + `06_高亮小样_2026-09-13.html` | 着色方案三件套（同一编号的三个产物） | 历史 |
| `07_编辑器补全_v7.8.md` | v7.8 筹备/设计/验收工件（含画布语料探查与 H 组验收） | 历史（**v7.8 的证据链**） |
| `08_重构简报_2026-09-14.md` | ★ **重构路线 P0–P4 的决策与迁移路径**（含执行结果标注） | **当前参考** |
| `09_增量需求_v7.8.1_资产分离.md` | v7.8.1 增量需求（Q7 已由 v7.8.2 撤销，文首有指向） | 历史 |

> 编号只表示**时间先后**，不表示"最新最权威"；**当前现状一律以 `_build/snapshots/BASELINE_v7.11.md` 与根 `README.md` 为准**。

## 四、档案原则（本项目一直遵守）

1. **历史文档里的旧路径按沿革原样保留**（`D:\Hermes_Store\…`、`分镜提示词管理面板` 等）——它们不作为当前位置依据；当前位置一律以根 `README.md` 为准。
2. **归档一律用 `git mv`**（保全历史、可回退）；**只删"可再生"的生成物**（构建产物 / 测试产物）。
3. 只加标注、不删史实：被撤销的决策用「⚠️ 已撤销」就地标注，不整段删除（例见 `08_重构简报` 的 Q7 与 Q5）。
