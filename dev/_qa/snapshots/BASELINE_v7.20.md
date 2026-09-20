# 交付快照指纹 · PHJ.html v7.20（2026-09-20）

> **本轮性质 = 功能增量（两需求）**：
> ① **项目名常显化 + 快速切换（Holly 选定方案一）**：写作台左栏头部新增**项目身份行**（当前项目名 + ▾，点击复用 `openProjectMenu` 弹项目菜单）；顶栏 `#btnProj` 由固定文字「项目」改为**当前项目名**（CSS ellipsis 截断）；切换 / 新建 / 重命名 / 删除后两处**立即刷新**。
> ② **写作灵感气泡群（Holly 亲自定义形态）**：编辑区（`.wd-edit`）右下角**持续显式漂浮**的补全气泡群，**跟随光标所在节实时更换**（起手式→起手式片段、风格包节→风格词……）；点击气泡**直接插入**该条 body 并走 v7.19 实时写回链路；带「换一批」轻量翻页、整体可折叠（会话态）、无候选整体隐藏、reduced-motion 直切降级。
> ③ **数据契约不变**：`state.version` 仍 **17**，持久结构无变化（气泡折叠态等全部会话内存）；`skin/corpus.js` 一字未改。

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.20（`state.version` = **17**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **324783** |
| **sha256** | **8ca1925156e28d0494f56d74a51a9e71b254d92da03379977d62b36d3425ae8a** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.20_2026-09-20.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.19 = **306977 B**（sha256 `dfca622f…2cf52`）→ 本轮 **+17806 B** |

---

## 一、需求①：项目名常显化 + 快速切换

### 结构

- `dev/src/index.html`：
  - `.wd-head` 顶部新增 `<button class="wd-proj" id="wdProj">`（内含 `#wdProjName` 项目名 + `▾` 指示符）；点击 → `openProjectMenu()`（复用既有 `#ctxMenu` 菜单，不新造菜单骨架）；
  - `#btnProj` 内文字改为 `<span class="btn-clip" id="btnProjName">`（span 承担 `max-width:9em + ellipsis`——flex 容器自身不支持 text-overflow）。
- `dev/src/view/write.js`：新增 `projSyncIdentity()`——两处身份显示同步 `state.title`（过长由 CSS 截断；`title` 属性给全名/功能说明）。挂在 **`applyView()` 单点刷新**：切换（`switchProject`）/ 新建（`newProject`）/ 删除（`deleteProject` → 先切走）都走 `applyView`，天然立即刷新；重命名（`renameActiveProject`，modals.js）本不走 applyView → 就地补调 `applyView()` 一行。
- `dev/src/styles/55-write.css`：`.wd-proj` 身份行样式（沿用写作台既有头部语言：透明底 + 悬停微深 + `--text`/`--muted`，不引入新色彩体系）；`.btn-clip` 截断。

### 真机证据（probe_v720_selftest A1–A5，全部真读 DOM + 真 modal 链）

| 断言 | 结果 |
|---|---|
| A1 初始两处常显 `state.title` | ✅ left=top=「未命名分镜」 |
| A2 点击身份行 → 项目菜单弹出（含 切换/新建 项） | ✅ open=true, n=4 |
| A3 新建项目（真 modal 链）→ 两处立即刷新 | ✅ 两处=「测试新建项目」 |
| A4 `switchProject` 切回 → 两处立即刷新 | ✅ 两处=「未命名分镜」 |
| A5 重命名（真 modal 链）→ 两处立即刷新 | ✅ 两处=「改名后的项目」 |

---

## 二、需求②：写作灵感气泡群

### 形态（Holly 口径：零散漂浮 · 可点选 · 跟随输入阶段实时更换 · 持续显式漂浮 · 编辑区内）

- **位置**：`#wdBubbles` 悬浮于 `.wd-edit` 内部右下角（`position:absolute; right:16px; bottom:14px`）；**只在写作台**（画布内联与放大弹窗不放——刷新函数入口即按 `#writeDesk` 显隐守卫返回）。
- **不遮挡正文**：容器 `pointer-events:none`（不挡正文选择/编辑/滚动条），气泡与按钮本体 `auto`；用户输入中（input 后 800ms）整群临时降透明（`.wdb-dim` → opacity .35，指针回到气泡上即恢复）。
- **数据源**（消费 `skin/corpus.js`，一字不改）：`cmplBuildGroups(structAt(ta.value, ta.selectionStart).region)` 取**本节相关组**（score 0 的组；无本节专属组则取最前几组兜底）→ `cmplBuildGroupItems` 扁平池（上限 40）；**每批 8 个**气泡（label 短名）；池多于一批 → 「换一批」轻量翻页（循环页序）；**当前节无候选 → 整体隐藏**（不出空壳；空态/无块同样隐藏）。
- **刷新钩子**（全部既有监听体内加行，★零新增 document/window 级监听，R2）：`wdOnInput`（input）、写作台 ta `click` / `keyup`（write.js DCL 既有监听）、`wdFillEditor`（切条/渲染）。**仅当光标所在节（region）变化时才重渲染**——同节打字不重播动画。
- **点击气泡 → 直接插入**：不走 `#` 触发；`cmplPrepare` 吃掉 `${n}` 槽位并**复用 # 候选的 Tab 跳位机制**（`cmplSlots/cmplSlotIdx`）；整块件（风格包全套）按 `cmplCommit` 同规则补空行分隔；插后 `ta.focus()` 焦点回 textarea + `setSelectionRange` + **补派 `input` 事件** → `wdOnInput` 真写回 `state.blocks`（v7.19 链路）→ 气泡群按新光标节刷新。
- **折叠/展开**：`wdBubbleFold` 折叠后收成「✦」小圆钮；**会话内存（wdBbl.fold），不持久化**——`state.version` 不动（实测落盘 JSON 无气泡字段）。
- **与既有 `#` 补全并存**：气泡不依赖 `#`、`#` 弹窗不依赖气泡；`z-index` 5 < `.cmpl-pop` 的 6（触发候选优先）。

### 动效规格（全部 CSS，只动 transform/opacity，零布局抖动）

| 场景 | 实现 |
|---|---|
| 入场 | 单气泡 `opacity 0→1 + translateY(6px)→0`，160ms ease-out；群内交错 `animation-delay = i*35ms`（`animation-fill-mode: backwards` 保延迟期不可见、结束后 hover 过渡不被锁） |
| 节切换 | 旧群整体淡出 120ms（`.wdb-out`）→ 新群交错淡入（JS setTimeout 130ms 换内容） |
| 换批（同节翻页） | 同规格重建（旧批淡出新批淡入路径同函数） |
| hover | `translateY(-1px)` + 背景加深，120ms |
| 折叠/展开 | 容器收放过渡 200ms（opacity/transform/visibility） |
| reduced-motion | `@media (prefers-reduced-motion:reduce)` 下全部 `animation:none / transition:none` + 气泡直切显隐（R4 红线，与项目既有降级先例一致） |

### 真机证据（probe_v720_selftest B1–B9，headless CDP 真鼠标/真事件）

| 断言 | 结果 |
|---|---|
| B1 起手式节：气泡群出现且 label 全属「起手式」组 | ✅ 4 条 = 组条目逐一对应 |
| B2 光标移到风格包节 → 内容实时切换 | ✅ prev=起手式 4 条 → now=风格包 7 条（集合不同） |
| B3 点击气泡 → body 真插入 + `state.blocks` 真写回（block===ta）+ 焦点回 textarea | ✅ 「事件发生在@室内。」上屏 |
| B4 「换一批」：body 节 32 条池 → 4 页，点击后批内容更换 | ✅ 镜头句 8 条 → 景别 8 条 |
| B5 无候选节（空态）→ 整体隐藏（display:none） | ✅ |
| B6 折叠/展开可用；折叠态不入持久化（version=17） | ✅ |
| B7 不遮挡：容器 pe=none / 气泡 pe=auto；正文真划选 selLen=14 | ✅ |
| B8 reduced-motion：animationName=none（直切）且插入功能正常 | ✅ |
| B9 全程零未捕获错误 | ✅ |

> 自测脚本：`dev/_qa/diag/probe_v720_selftest.mjs`（14 断言，本轮**自测口径，不接入闸门**——新增常驻断言条数须先报主理人转 Holly）。

---

## 三、数据契约与纪律

| 项 | 值 |
|---|---|
| `state.version` | 仍 **17**（气泡折叠态 = 会话内存，不持久；无新落盘字段） |
| `skin/corpus.js` | **一字未改**（仍 `SLICES` 第 9 位；只消费 `cmplBuildGroups/cmplBuildGroupItems/cmplActive/cmplPrepare`） |
| `skin-guard` | **R3-A = 15（≤ 顶格 15）/ R3-B = 0** ✅（新中文文案全部落在 `view/**` 与 `index.html`） |
| `P2-B2` 导出面 | **136 名不变**（本轮新顶层函数均未被跨模块引用——`projSyncIdentity` 仅 write.js 内部 + modals 补调 `applyView`（既有导出名）；气泡函数模块内自洽；QA 经测试产物访问器直达） |
| 监听纪律 | **零新增 document/window 级 keydown/keyup/blur 监听**（仅元素级：`#wdProj` click、气泡 mousedown、fab/more/fold click；ta 既有 input/click/keyup 监听体内加行） |
| 产物 | 306977 → **324783 B**（+17806） |

## 四、闸门结果

`node dev/_qa/run-gate.mjs` = **15/15 全绿**（83/18/16/54/18/21/31/16/4/9/4/10/18——第 15 道为 v7.20 组常驻断言）；`skin-guard` R3-A=15 / R3-B=0。

## 五、已知遗留 / 观察项

1. 气泡群为**常驻**右下角，正文最后几行右侧局部会被半透明卡片群叠压（Holly 口径内：常驻 + 半透明 + pointer-events 精细控制）；`textarea` 滚动条不受影响（容器 pe=none，实测真划选/滚动正常）。
2. 「硬性要求」节当前无本节专属组（`CMPL_GROUP_HINT` 的 `硬性要求:'tail'` 在内置语料中无同名组）→ 该节气泡走「最前几组兜底」分支，显示相关性最前的通用片段。若 Holly 希望尾段节有专属气泡，需在皮肤（corpus.js）加组——属皮肤层内容演进，引擎零改动。
3. 气泡插入沿用 `cmplPrepare` 的槽位口径（`${n}` 上屏时被吃掉、Tab 逐位跳），与 `#` 候选行为一致。
4. **闸门 [14] verify_v719 同步说明**（断言判定式与条数零改动，仅测量夹具隔离）：G6 计墨口径 = 编辑层墨迹，而 v7.20 新增的气泡群是 `.wd-edit` 内的**合法常驻覆盖层**（含深色气泡文字）→ 计墨前随 `.wd-hl` 一并对 `#wdBubbles` 做隐藏隔离、计完恢复。排查中发现并修掉一个真 CSS 缺陷：`.wdb-cluster` 原写了**显式 `visibility:visible`**，把父容器 `visibility:hidden` 的继承短路（折叠过渡与外层隐藏均失效）→ 已删（visibility 靠继承），实测隐藏/折叠恢复生效。

## 附：第 15 道闸门 `verify_v720.mjs` 物证（v7.20 组常驻断言 · 2026-09-20 · 主理人接线）

- **缘起**：v7.20 两功能（项目名常显 + 写作灵感气泡群）由工程师自测探针 `diag/probe_v720_selftest.mjs`（14 条）+ QA 独立探针 `diag/probe_v720_qa_indep.mjs`（20 条）验证通过后，Holly 核准升格常驻（17-18 条）。工程师两度被会话中断未开工 → 主理人亲自接线。
- **★夹具恒真修复**（QA 抓出）：自测探针 `__fixture` 首行原含「事件发生在@室内。」——B3「插入后包含该内容」恒真（改坏插入逻辑不会红）。常驻版 fixture 首行改为「镜头1·@首帧画面。」，插入断言恢复可证伪。
- **18 条** = A×5（项目身份：两处常显/菜单弹出/新建/切换/重命名刷新）+ B×9（气泡：节变换/点击写回/换批/空态隐藏/折叠不持久/不挡正文/reduced-motion/零报错）+ C×4（与#并存 / 节往返·真鼠标点击行 / 切条+落盘·含 LS_CLEAR_ID 摘除 / 换一批循环性——连点 pages 次回出发批，不依赖页码重置）。
- **闸门级证伪**：C4 断言取反 → 完整 run-gate = `[15] 17/18 ❌、退出码 18、失败闸门=[15]`（同时反证前 14 道真跑）→ 还原 → **15/15 全绿**（101.5s，exit 0）。
- **纯工装改动**：`PHJ.html` = 324783 B / sha256 `8ca1925156e28d0494f56d74a51a9e71b254d92da03379977d62b36d3425ae8a` **不变**；`dev/src/**` 零改动；无需新快照。QA 两个探针留 `diag/` 作物证。
