# BASELINE · v7.21（写作台块标签「初/补」+ 大纲分组排列 + 项目总览面板）

> 交付日：2026-09-21 ｜ 前序基线：`BASELINE_v7.20.md`
> 本文件是**当前基线**；`dev/CHANGELOG.md` 是历史，本文件是现状。

## 一、指纹与验收

| 项 | 值 |
|---|---|
| 版本 | **v7.21** |
| `state.version` | **17**（★**未升版**：`block.tag` 为纯增量可选字段，迁移零丢失；升版无收益且会扰动四个套件的 `version === 17` 断言） |
| `LS_KEY` | `storyboard-prompt-panel:v1`（**不变**，P3） |
| bytes | **338465**（324783 → +13682） |
| sha256 | `2b2551d5a179f6625b9a9175a59abb7b4976c1c51c33301eb1742b352d1126d9` |
| 快照 | `PHJ_v7.21_2026-09-21.html`（= 产物，`cmp` 逐字节一致；等价性闸门默认基准） |
| 闸门 | `node dev/_qa/run-gate.mjs` = **16/16 全绿**（106.4s） |
| skin-guard | R3-A = **15**（未顶穿）／ R3-B = 0 ／ R3-C 非真空 ／ R4 可摘除 |
| `PHJ` 对外面 | **136 名不变**（18 模块键） |

闸门逐项：`338465 B` ｜ 等价性 PASS ｜ 83/83 ｜ F 18/18 ｜ G 16/16 ｜ v7.8 **54/54** ｜ 开发态 18/18 ｜ W 21/21 ｜ C 31/31 ｜ E 16/16 ｜ P 4/4 ｜ M 9/9 ｜ V 4/4 ｜ v7.19 10/10 ｜ v7.20 18/18 ｜ **v7.21 11/11**

## 二、本轮变更（需求 → 落点）

### 需求一 · 写作台块标签「初/补」+ 分组排列（Holly 定：仅为写作界面服务）

| 文件 | 改什么 |
|---|---|
| `core/persist.js` | `migrateBlocks()` **两处投影**纳入 `tag`（脏值/缺失归 `''`，零丢失）—— **不改版本** |
| `core/store.js` | `defaultState()` 示例块 `tag: '初'` |
| `view/write.js` | `wdTagOf` / `wdGroupHead` / `wdCycleTag` 新增；`renderWrite()` 分组渲染；`wdRow()` 加标签钮；`wdReorder()` 加跨组守卫；`wdNew()` 默认 `tag:'初'`；DCL 内 `#wdList` 委托加 `.wd-lab` 分支 |
| `view/modals.js` · `interact/paste.js` | 另两处建块点默认 `tag:'初'` |
| `styles/55-write.css` | `.wd-group` / `.wd-lab` 样式 + 加入 reduced-motion 直切清单 |

**设计裁决**：分组走**呈现层**（`order` 语义不变 → 拼接栏/导出零改动）；组头独立 class `.wd-group`；行内 idx 一律全局序位；仅 ≥2 种标签才出组头；跨组拖动被拒。

### 需求二 · 移除顶栏项目按钮 —— **已取消**（Holly 指令），**零改动**

### 需求三 · 产品内「项目总览」面板（Holly 定：产品内面板）

| 文件 | 改什么 |
|---|---|
| `view/modals.js` | `MAP_GATE_TOTAL` / `MAP_ASSERT_TOTAL` / `MAP_FEATURES` + `mapSection` / `mapFeatureRow` / `mapBuildDom` / `openMapPanel` / `closeMapPanel` |
| `index.html` | 顶栏 `#btnMap`（「览」）+ `#mapMask` 面板骨架（复用 `.modal-mask/.modal` 类） |
| `shell/wiring.js` | `#btnMap` / `#mapClose` 元素级 click 接线 |
| `interact/keys.js` | `closeTopLayer()` **加一层分支**（Escape 单点归口内，不新增监听） |
| `styles/40-window.css` | `.map-*` 内容样式 |

**口径**：完善度 = **闸门覆盖（套件 + 条数）× 上线状态**（客观证据、非自评）。**防漂移**：数据手写 + `verify_v721` B3 交叉校验（对不上即红）。

## 三、工装变更

- **新增第 16 道闸门** `dev/_qa/verify/verify_v721.mjs`（**11 条** = A×6 + B×5）
- `dev/_qa/run-gate.mjs`：**T10 四处**（`SCRIPTS` / `GATE_META` / 步骤头 `/16` / 汇总 key 数组）+ 退出码 **19** + 头注释
- `dev/_qa/verify/verify_build_equivalence.mjs`：`OLD` → `PHJ_v7.21_2026-09-21.html`
- `dev/_qa/snapshots/INDEX.md`：当前基准提升为 v7.21

## 四、★证伪记录（T7 / T8）

新闸门按 **T7** 做**闸门级证伪**：改坏 → 跑**完整** `run-gate` → 确认真变红且退**自己那道的非零码**。

| 轮次 | 破坏内容 | 结果 |
|---|---|---|
| **R1** | 从 `migrateBlocks` 末尾投影**删掉 `tag`**（即「静默剥离」那个致命点） | **退出码 19**、`[16] → 9/11`；**A1 + A2 红**（A2 明细 `reload后={"has":false}` 正是剥离现场） |
| **R2** | 同时 7 处：组头误用 `.wd-item` · `wdCycleTag` 不写 state · 删跨组守卫 · 删 `keys.js` 的 mapMask 分支 · `MAP_ASSERT_TOTAL` 改错 · 完善度徽标不渲染 · reduce 清单删 `.wd-lab` | **退出码 19**、`[16] → 2/11`；**A3/A4/A5/A6/B1/B2/B3/B4/B5 全红** |

⇒ **11 条断言全部取得证伪证据**（R1 覆盖 A1/A2，R2 覆盖其余 9 条）。
破坏后**还原并复核指纹**：`sha256` 精确回到 `2b2551d5…`（构建确定性得证）。

**★R2 顺带抓出我自己的套件缺陷**：破坏把组头变成 `.wd-item` 后，助手 `__rowInfo` 对无 `.wd-no` 的行直接 `null.textContent` → **套件崩溃（exit 1）**，run-gate 报「未取到汇总」而非逐条红。
→ 断言应当**报红而不是崩掉**，已为 `__rowInfo` 与 B5 的 `tdSel` 加**空值防护**（改坏必得干净红色 + 可读明细）。**这条缺陷是被证伪环节发现的，不是被测试通过的。**

## 五、已知遗留（不阻塞）

1. `verify_v78`（[6]）低频偶发红：既有记录 1/3 + 本轮实跑 0/4 → **累计 1/7 ≈ 14%**，按 **T9 留观**，未改任何断言。
2. Linux 侧跨平台首巡回（在途工作，Windows 侧已完成）。
3. `pointer.js` 130ms 定时器理论时序窗口（v7.18 QA 记录，未能复现，留观）。
4. 「同批刷新 `HANDOVER`」已由**交付惯例**固化（见 `PROJECT_MEMORY.md` §交付惯例）；`IRON_RULES.md` 的 **C2 已改为道数无关**（不再写死「15/15」），并新增 **C7**（推送时机由 Holly 自行安排）。

## 六、本轮结论

- 两项需求**功能完整**、**对既有 15 道闸门零回归**（每轮全绿）。
- 新功能**有常驻断言守门**且**逐条证伪**（T5 的零覆盖盲区已消除）。
- 无新增源文件 ⇒ 未触碰 `E5`（SLICES 20 条）/`E8`（136 名）；`skin-guard` 未顶穿。
- **可交接**：`git status` 干净 + 闸门 16/16 + `HANDOVER` 与实际一致。
