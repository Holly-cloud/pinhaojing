# 交付快照指纹 · PHJ.html v7.19（2026-09-20）

> **本轮性质 = 缺陷修复（两项）**：
> ① **需求① 划选文字「重影 / 双重叠」**：修复后**选中时不再显形编辑层自己的字**，只由底层彩色层高亮层显示，选中反馈由半透明蓝底表达；同时**划选不再触发整层彩色层重建**，键盘 Shift+方向延展选区时重建次数减半（实测 25 → 13）。
> ② **需求② 写作台右栏「补全上屏后未实时写回」**：补全上屏后补派一次 `input` 事件，让写作台「输入即写回」路径生效（此前只改了 `textarea.value`，`state.blocks` 仍是旧值 → 切条/重开会丢字）。
> ③ **数据契约不变**：`state.version` 仍 **17**，结构无变化。

| 项 | 值 |
|---|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.19（`state.version` = **17**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **306399** |
| **sha256** | **1a7c6aa1b6713652d1a2f03aecb84ac8dc17782de7a12679760eb20e404ce8ba** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_qa/snapshots/PHJ_v7.19_2026-09-20.html`（同一字节内容，等价性闸门的比对基准） |
| 上一版 | v7.18 = **304151 B**（sha256 `df22b590…91e71`）→ 本轮 **+2248 B** |

---

## 一、本轮变更要点（v7.18 → v7.19）

### ① 需求①：划选文字「重影 / 双重叠」修复

> **真机复现结论**：假设部分成立——`::selection` 把 `-webkit-text-fill-color` / `color` 强制覆盖为不透明深色，确实会让上层编辑层的字在选中区间显形，压在底层彩色层同一份字上；但实测**两层几何完全对齐**（偏移 0 px），现象是「两份字精确叠印」而非大错位。
> 键盘 Shift+方向延展选区时，`select` 事件每按一次触发一次（12 次按键 → 12 次 `select`），叠加 `keyup` 事件，共造成 **25 次整层 `hlRefresh` 重建**；鼠标拖拽则因 Blink 只在选区建立/结束时派发 `select`，实测 20 帧仅 1 次重建。故**放大因素在键盘路径上成立**。

**修法 A（CSS，最小首选）**：`styles/50-editor.css`

```css
/* 旧 */
.blk-input::selection{background:rgba(0,113,227,.22);-webkit-text-fill-color:#1d1d1f;color:#1d1d1f}
/* 新 */
.blk-input::selection{background:rgba(0,113,227,.28)}
```

- 去掉 `-webkit-text-fill-color` 与 `color` 覆盖 → 选中时**只见蓝底**，文字仍由底层彩色层显示 → 第二份字消失。
- 底色由 `.22` 微调到 `.28`：原先选中反馈靠「蓝底 + 深色字」双重表达，现在只剩蓝底，略加浓度保持可读。
- 实测：未选中时编辑层墨迹 ≈ 0；选中时编辑层墨迹由 **6184 px 降到 0**；蓝底像素仍在（23813 px），选中反馈保留。

**修法 C（select 事件不再整层重建）**：

- `view/write.js`：写作台宿主 `select` 事件由 `hlRefresh(hostDesk)` 改为 `hlStatus(hostDesk)`。
- `shell/wiring.js`：弹窗宿主 `select` 事件由 `hlRefresh()` 改为 `hlStatus()`。
- `editor/highlight.js`：`hlStatus(host, fam)` 缺省 `fam` 时改走与 `hlRefresh` 同源的 `hlClassify(v, structExemptMask(v))`，保证状态栏错误数与着色层一致；并把 `hlStatus` 加入 `PHJ.highlight` 导出面。
- 实测：键盘 Shift+→ 12 次 → 重建次数 **25 → 13**（只剩 `keyup` 触发的必要重建）；状态栏行/列/节/错误数仍正确刷新。

**覆盖两个宿主**：写作台右栏（`#writeDesk / #wdInput`）与放大编辑弹窗（`#blkMask / #blkInput`）均共用同一份 CSS，都已验证。

### ② 需求②：写作台右栏补全「实时写回」修复

> **真机实测现状**：写作台的气泡**已经能弹**（`#` 触发），位置/裁剪/键盘↑↓/数字键/Esc/鼠标点选/滚动关闭均与弹窗宿主一致；唯一差异是**补全上屏后只改了 `textarea.value`，没写回 `state.blocks`** → 左栏摘要仍是旧文本，切条再切回会把新字覆盖/丢掉。

**修法**：`editor/complete.js` 的 `cmplCommit` 在 `ta.setSelectionRange(caret, caret)` 之后补派一次 `input` 事件：

```js
try{ ta.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){}
```

- 写作台既有 `wdOnInput` 监听 `input` → 把 `ta.value` 写回当前块 `b.text`、刷新左栏摘要、落盘。
- 弹窗宿主监听 `input` 只做 `fitBlkWidth(); hlRefresh();` → 无副作用，保持「确定/取消」语义不变。
- 必须放在 `setSelectionRange` 之后，否则 `cmplOnInput` 的槽位位移跟踪会算错位。

**A'（撤销封存 + scroll 根因修复）**：`editor/complete.js` 的 `cmplBind`

```js
/* 旧（坑：长分镜在文末输入触发符 → textarea 自动滚动 → 刚弹的气泡被这监听当场关掉，刚弹即关） */
ta.addEventListener('scroll', function(){ if(cmplOpen) cmplClose(host); });
/* 新（滚动只重定位、不关闭：气泡按新 scrollTop/scrollLeft 重新锚定到光标处） */
ta.addEventListener('scroll', function(){ if(cmplOpen) cmplPlace(host); });
```

- 同轮**撤销封存**：删除 `var CMPL_TRIGGER_OFF = true;` 与 `input` / `compositionend` 监听体里的两处 `if(CMPL_TRIGGER_OFF) return;` 短路——`#` 触发恢复原样（气泡绑定 / pop DOM / 候选计算 / 槽位 / 上屏写回本来就原样保留）。
- 真机三场景（`verify_v719.mjs` K9 断言 + 探针逐项复测）：① 长文本（80 行）文末真实输入 `#` → textarea 自动滚动（scrollTop=900）发生且气泡 `cmplOpen=true`、在视口内；② 用户再滚动 60px → 气泡仍 open 且 popTop 随之移动（跟随光标）；③ 气泡关闭后滚动 → 不弹泡、零报错。

### ③ 数据契约

- `state.version` 仍 **17**；`LS_KEY` 不变；持久结构无变化。
- `skin/corpus.js` **一字未改**；`SLICES` 仍 20 条、`CSS` 仍 10 条。

---

## 二、`PHJ` 对外面变更（★ highlight +1 名，已同步 P2-B2 契约）

| 模块 | 变化 | 内容 |
|---|---|---|
| `highlight` | **+1 名** | `+ hlStatus`（`write.js` / `wiring.js` 的 `select` 事件跨模块引用） |
| 其余 17 个模块 | **不变** | 既有导出名逐名不变 |

- 结果：`PHJ` 模块键仍 **18**（`P2_MODULES` 不变，无新模块）；`P2_EXPORTS_GOLDEN` 名数 **135 → 136** → `P2-B2` 断言实测 **136 名**。

---

## 三、★ 对既有闸门的适配（**判定式与条数不变**）

| 文件 | 现状 → 改为 |
|---|---|---|
| `verify_v78.mjs` `P2_EXPORTS_GOLDEN.highlight` | `['hlCommaToSpace','hlRefresh','hlSyncBox']` → **加 `'hlStatus'`** |
| `verify_build_equivalence.mjs` `OLD`（默认） | `PHJ_v7.18_2026-09-19.html` → **`PHJ_v7.19_2026-09-20.html`**（含头注释同步） |
| `run-gate.mjs` 头注释 `[1]`/`[2]` | 期望 `304151 B` / sha256 `df22b590…` / 基准 v7.18 → **`306399 B`** / sha256 `1a7c6aa1…` / 基准 **v7.19**（**注释**；run-gate 无体积判定式） |

### 3.1 既有 13 道判定式与条数 **零改动**

> 本轮**不新增、不删除任何断言**；仅期望值/快照/导出面同步。

---

## 四、构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **306977 B**，sha256 `dfca622f62d0124ef6ee9dc21dac783cb27ce707c7b5f6928dfb9e6f8602cf52` |
| 比对基准 | `dev/_qa/snapshots/PHJ_v7.19_2026-09-20.html`（逐字节相同） |
| CSS 片序（10，**不变**） | 00-base · 10-canvas · 20-menu · 30-splice · 40-window · 50-editor · 51-complete · 52-library · 55-write · 90-effects |
| JS 片序（20，**不变**） | head · store · persist · clipboard · overlay · highlight · block-editor · struct · **corpus（皮肤·第 9 位）** · host · complete · library · canvas · splice · modals · write · keys · paste · pointer · wiring |

> **无新增切片**：`SLICES` 仍 20 条、`skin/corpus` 仍**第 9 位**；`index.html` 未增删节点。

## 五、模块规模（v7.19 实测 · `wc -l` 口径（换行符计数，末行有换行）；A' 撤销封存 + scroll 修复后复测）

| 模块 | 行数 | Δvs v7.18 | | 模块 | 行数 | Δvs v7.18 |
|---|---:|---:|---|---|---:|---:|
| `styles/50-editor.css` | 32 | **-1 行声明（删 text-fill-color/color 覆盖）+2 行注释** | | `editor/highlight.js` | 196 | **+hlStatus fallback 掩码 + 注释 + 导出面** |
| `view/write.js` | 436 | **+select 改 hlStatus + 注释** | | `shell/wiring.js` | 311 | **+select 改 hlStatus（-1 行注释）** |
| `editor/complete.js` | 575 | **+dispatchEvent('input') + scroll→cmplPlace 修复注释** | | `skin/corpus.js` | 83 | **0（未改）** |

> 口径勘误（2026-09-20）：本表初稿 4 处行数与实测不符（`highlight.js` 曾误写 537、`50-editor.css` 31、`complete.js` 569、`wiring.js` 313），已按上表统一 `wc -l` 口径复测更正。

## 六、回归闸门（本轮实测 · `node dev/_qa/run-gate.mjs` = **13/13 全绿**，退出码 0）

| 闸门 | 结果 |
|---|---|
| [1] 构建 | **306399 B** |
| [2] 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.19_2026-09-20.html`） |
| [3] 回归 `verify_v7.mjs` | **83/83** |
| [4] F 组 `verify_v76.mjs` | **F 18/18** |
| [5] G 组 `verify_v77.mjs` | **G 16/16** |
| [6] v7.8 `verify_v78.mjs` | **H+I 54/54**（含 P2-B2 导出面内容契约，实测 **136 名**） |
| [7] 开发态 `probe_dev_index.mjs` | **18/18** |
| [8] W 组 `verify_w.mjs` | **W 21/21** |
| [9] C 组 `verify_c.mjs` | **C 31/31** |
| [10] E 组 `verify_e.mjs` | **E 16/16** |
| [11] P 组 `verify_paste.mjs` | **P 4/4** |
| [12] M 组 `verify_qa_v718.mjs` | **M 9/9** |
| [13] V 组 `verify_qa_migrate_visual.mjs` | **V 4/4** |

> 既有闸门判定式与条数**全部与 v7.18 相同**（本轮仅期望值/快照/导出面同步）。

## 七、守门人自查（**必须仍绿**）

- `P2-A`（8 条 `keydown/keyup/blur` 注册序）与 `P3-A`（document keydown 3 处 / 含 Esc 1 处）—— 本轮**未新增任何键类监听** → 仍绿。
- `P1-A`（dev≡prod 逐字）、`P1-C`（测试产物逐行 diff 恰 +1 行）、`P1-D`（window 全局增量空集）—— 新顶层声明在 IIFE 内 → 仍绿。
- `P2-B`（`PHJ` 恰 18 模块键）、`P2-B2`（导出面内容契约，**实测 136 名**）—— `highlight` +1 名后同步。
- `R1`（引擎零 `skin/` 字面量）/ `R1 语料归属` / `R3-A`（命中 ≤ golden）/ `R3-B`（零泄漏）/ `R3-C`（守卫自检）/ `R4`（皮肤可摘除）—— 皮肤层**一字未改**、新增代码不含皮肤词元/长语料/完整标记串 → 仍绿。

## 八、已知遗留 / 下一步

- **本需求未做**（明确超出本轮口径）：把划选高亮映射到底层彩色层（方案 B）、在底层渲染「选中文字反色/加粗」等更丰富的选中视觉。
- **补全触发条件**：`#` 触发**已恢复并可用**（A' 撤销封存 + scroll 根因修复）；Holly 若期望「打字即自动弹出」，需再明确触发字符/策略。
- **皮肤边界**：新中文文案一律落 `view/**` / `shell/**` / `editor/**` 注释或 `index.html`，未命中皮肤词元（`skin-guard` 实测 R3-A = 15 / R3-B = 0）。

## 九、自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 306977 B（20 JS 片 / 10 CSS 片）
node dev/_qa/lib/skin-guard.mjs                 # 期望：R3-A ≤ golden；R3-B 命中 0
node dev/_qa/run-gate.mjs                       # 期望：14/14 全绿（83/18/16/54/18/21/31/16/4/9/4 + v7.19 组 10/10），退出码 0
```
