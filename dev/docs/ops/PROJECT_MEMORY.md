# 项目记忆 · 拼好镜 PHJ（AGENT_MEMORY）

> **本文件是项目知识的唯一事实源**，随 git 仓库走（2026-09-20 从会话侧记忆迁入，Holly 拍板「可移植性优先」）。
> 任何 agent 接手后**先读本文件**；本文件由「交出方」在每次交付时更新。
> 历史细节另见：`HANDOVER.md`（当前状态）· `dev/CHANGELOG.md`（逐版功能史）· `dev/docs/decisions/`（决策冻结）· `dev/_qa/records/handover/`（任务存档）。

## 项目一句话

**拼好镜 PHJ** = HTML 工具（短剧/动画**分镜提示词**写作 + 画布排布）。
**当前交付形态** = 仓库根**一个 `PHJ.html`**，「双击即开、用完即走」；`github.com/Holly-cloud/pinhaojing`（公开）。
★**形态不设锁**（A1⑤，2026-09-20 Holly 修订）：单文件是**当前实现形态**，不是铁律——出现能让项目迈入更优质阶段的重构方案时，评估其对可移植性与用户零摩擦的影响后由 Holly 决策，**不得以"必须单文件"为由否决**。

**当前基线（v7.20，2026-09-21 复核）**：`PHJ.html` = **324783 B** ｜ sha256 `8ca1925156e28d0494f56d74a51a9e71b254d92da03379977d62b36d3425ae8a` ｜ 闸门 **15/15** ｜ `state.version` = **17** ｜ 本地 HEAD = **2026-09-21 交接校正提交**（**父 `00b4bfc`**；本轮仅文档、无产物变更）｜ 上一内容提交链：`00b4bfc` 根 README 分离（tag `v7.20` 所指提交 `b00e788` 之后另有 **9 个提交**：协作机制 → 跨平台巡回适配 → 交接同步 → 铁律区建立 → 铁律首轮修订 + 审计补录 → A1 改写 → 环境文档补坑 → 再次交接同步 → 根 README 分离）｜ 远端 `origin/master` = `00b4bfc`（**已同步**：tag `v7.9`/`v7.10`/`v7.11`/`v7.13`/`v7.18`/`v7.19`/`v7.20` 共 7 个全在远端）；⚠️ **本轮文档校正提交尚未推送**（本机无推送凭证，需 PAT）。
> **推送方法（备查）**：写 `~/.git-credentials` → `git -c credential.helper= -c credential.helper=store push origin master --tags` → **用完删**；`GIT_ASKPASS`+msys 路径会 spawn 失败。

## 产品红线

★**约束条文见 `IRON_RULES.md`（A1-A2 根本原则 / P2-P6 产品红线）**（本文件不再复制，避免两处漂移）。
要点速记：**打开即用、用户零摩擦**（现形态 = 单文件 `file://`；★A1⑤ 形态不设锁，允许为更优架构演进）· 经典脚本零依赖（P2，同属形态前提）· `migrate` 零丢失 · reduced-motion 降级 · 私有资产不入库（P6）。

## 版本沿革速览（细节见 CHANGELOG）

- **v7.20** = 项目名常显化（左栏身份行 `.wd-proj` + 顶栏 `#btnProjName`）+ **写作灵感气泡群** `#wdBubbles`（编辑区右下角漂浮、跟随光标所在节实时换内容、点击插入走写回链路、换一批、可折叠会话态）+ 第 15 道闸门
- **v7.19** = 划选重影修复（`::selection` 去文字显形；`select` 事件改 `hlStatus`）+ 补全上屏写回（`cmplCommit` 补派 input）+ scroll 改 `cmplPlace`（气泡跟随重定位，长文本文末输 # 不再刚弹即关）+ 第 14 道闸门
- **v7.18** = 多项目容器（`projects[]`+`activeProject`，version 16→17）+ 编辑器粘贴修复 + 渲染时机修复（`setView` 先 applyView 后 render；`autoResize` 隐藏态不写 0）+ 第 11-13 道闸门
- **v7.17** = 放大编辑「逗号转空格（台词除外）」（复用 `hlDialogueMask`）+ toast 层级修复（z-index 99→13000）+ 第 10 道闸门
- v7.16 = 写作补全四项增强（A/B/D/H，version 15→16）｜ v7.15 = 界面切换 + 写作台默认视图 + 宿主化 `editor/host.js`（SLICES 20 条）

## 结构地图（决策冻结在 dev/docs/decisions/）

- `dev/` 顶层 = **活文件**：`README.md` · `CHANGELOG.md` · `manifest.mjs`（顺序唯一源）· `build.mjs` · `src/`（**唯一手改入口**）
- `dev/docs/` = **冻结历史**（只增不改；`ops/` 内带日期文档同冻结，`AGENTS.md`/`HANDOVER.md`/`PROJECT_MEMORY.md` 三个跨文档指针类为**活文件**）
- `dev/_qa/` = 验收工装：`run-gate.mjs`（15 道）· `verify/`（11 套件）· `lib/` · `diag/` · `snapshots/` · `records/` · `gen/` · `handover/`（任务存档）
- 双视图：**写作台**（默认，左大纲 + 右编辑器 `#wdInput`）｜ 画布（`activeView` 会话态不持久）；两个编辑器宿主共用内核 `editor/host.js`（`hostPopup`=#blkInput 弹窗 / `hostDesk`=#wdInput 写作台）

## 闸门（改完必跑）

`node dev/_qa/run-gate.mjs` → 期望 **15/15**：324783 B ｜ 等价性 PASS ｜ 83/83 ｜ F 18/18 ｜ G 16/16 ｜ v7.8 **54/54** ｜ 开发态 18/18 ｜ W 21/21 ｜ C 31/31 ｜ E 16/16 ｜ P 4/4（粘贴）｜ M 9/9（多项目）｜ V 4/4（迁移观感）｜ v7.19 10/10 ｜ **v7.20 18/18**
> ⚠️ 套件单独跑需 9222 端口已有调试浏览器；`run-gate` 负责自起自收。单独跑报 `ECONNREFUSED 127.0.0.1:9222` 是**预期**。
> ⚠️ 新增套件优先复用 run-gate 传入的 `PHJ_BROWSER_PORT` 会话（参照 `verify_v719.mjs`/`verify_v720.mjs` 形态）。

## 工程不变式（展开说明）

> ★**约束条文见 `IRON_RULES.md` E1-E9**；本节是这些条文的背景与实现细节（若表述冲突，**以条文为准**）。

- **改产物字节的合法路径**：`node dev/build.mjs` → 拷 `PHJ.html` 为 `_qa/snapshots/PHJ_v<版本>_<日期>.html` → 改 `verify_build_equivalence.mjs` 的 `OLD` → 改 `run-gate.mjs` 头注释 → 跑 **15/15**（★`run-gate` 无体积判定式，唯一真闸门是**等价性逐字节**）
- **行尾无忧（已实测）**：`build.mjs` 读源码归一 LF、输出统一 CRLF → 源码 LF/CRLF 混用不影响产物；`PHJ.html` 与快照在 `.gitattributes` 为 `-text`
- **顺序敏感**：`addEventListener` 注册序 + 顶层 `var` 初始化序（`manifest.mjs` 的 `deps` 是运行期依赖）
- **皮肤边界 = 5 条断言守门**（R1/R3-A 棘轮 ≤15/R3-B/R3-C/R4）；`skin/corpus` 在 `SLICES` 第 9 位；`SLICES` 共 **20 条**；★新领域文案落 `view/**` 或 `index.html`（进 `skin/` 会顶穿 R3-A 棘轮）
- **测试可达性**：产物单 IIFE → CDP 套件跑 `dev/_qa/gen/PHJ_test.html`（产物+1 行访问器，`lib/test-artifact.mjs` 生成）
- **`PHJ` 对外面 = 18 模块键 / 136 名**（`P2-B2`；`highlight` 含 `hlCommaToSpace/hlRefresh/hlStatus/hlSyncBox`）——加导出名须同步 `verify_v78.mjs` 的 `P2_EXPORTS_GOLDEN`
- git 身份 = `Holly <99107877+Holly-cloud@users.noreply.github.com>`；**本机 Git for Windows 创建含 `/` 的 ref 静默失败** → 打 tag 后必须 `git show-ref` 复核

## 工具坑（实战事故提炼）

1. JS 块注释写 `**83**/18` 会提前闭合（`**/`=`*/`）→ 构建红
2. 顶层声明名扫描必须字符串感知 → 复用 `test-artifact.mjs` 的 `scanTopLevelNames`
3. 改动落成 .mjs 再跑（别内联 `node -e`）；`detectBrowser()` 返回 `{exe,pinned}`
4. bash PATH 缺 unix 工具 / git 不在 PATH → **见《环境探测与工装陷阱》按方法探测**
5. 工具调用结束会回收子进程 → 手动起浏览器须与跑断言在**同一次调用**内
6. ★★源码注释禁 `` $` ``/`$'`/`$&`/`$n`（v7.18 实测：`String.replace` 第二参数是替换模式 → 产物被静默拼坏 → 套件报 `state is not defined` 不指向根因；已改 indexOf+slice，但写注释仍要避开）
7. ★沙箱批量删除阈值（实测 ≈50/turn）触顶 → 整条命令被拒且**不得重试**；换 turn 恢复。清理时明确路径逐个列、单批 ≤10、删完复核；`AppData` 下不擅自递归删
8. ★headless CDP **鼠标拖选不派发选区**（v7.19 实测，about:blank 纯 textarea 对照证实）→ 划选类验证用「点击起点 + Shift+点选延展」同路径替代
9. 本机 git 打含 `/` 的 ref 静默失败 → `show-ref` 复核

## 数据结构（version 17 · 供实现参考）

- `state.blocks`（当前项目的块）· `state.projects[]` + `activeProject`（v17 多项目；顶层 `blocks/pan/zoom/splice/collapsed/title` 是活动槽的**镜像引用**）· `state.cmpl`（片段库 + `use` 使用记录 `{[hkey]:{n,t}}`，hkey = `FNV1a32(group\0label\0body)`）· `state.templates` · `block.order`（写作台顺序，与画布 x/y 互不干扰）
- `migrate()` 须 v1→v17 **零丢失**

## 测试铁律

★**条文见 `IRON_RULES.md` T1-T11**（本文件不再复制）。
事故细节与实战取证见 `dev/_qa/records/handover/` 各档案（四轮浓缩含 v7.15 零覆盖盲区、v7.16 假闸门、v7.17 跨进程时钟 flake、v7.19 假设被证伪、v7.20 夹具恒真等全部原始情形）。

## 多 agent 协作（详见《多agent异步协作协议》）

- 角色：主理人（编排/裁决/中转）· 工程师 · QA · 架构师 · 产品经理；**跨成员信息流必须经主理人**
- 任务书要素：环境（PATH/仓库根）· 基线指纹 · 需求口径表 · 红线 · 完成判据 · 回报格式 · 「不 commit/push」纪律
- 回报必含：TL;DR / 改动清单 / 逐项闸门结果 / skin-guard / 体积 sha / IS_PASS / 遗留
- 交接闭环判据：`git status 干净 + run-gate 15/15 + HANDOVER.md 与实际一致`

---

# 审计补录（2026-09-20 · 源自 2026-09-14 ~ 09-17 会话日志的未入库知识）

> 本节由主理人在「检查本地项目记忆是否存在可提升交接质量且暂未写入项目的内容」的审计中补录。
> 这些知识此前**只存在于会话侧日志**（不在 git），换区即丢——补录后成为交接资产。

## 资产边界与公开仓库（★最高风险项 · 已升为铁律 P6）

- 仓库 `github.com/Holly-cloud/pinhaojing` **是公开的**。
- **私有写作资产**（`写作资产*`：风格包等含个人人名/台词的文本）**一律不入库**：正式生成位置在**仓库之外** `AA_Dev/_assets/写作资产_风格包_v1.json`；`.gitignore` 有**路径无关**的保险丝 `写作资产*`。
- **历史事件（2026-09-15）**：v7.8 分支曾在远程，导致 `dev/_qa/records/corpus-20260913/**`（真实 53 条画布提示词语料，含人名与台词）**匿名可读**；Holly 手动删远程分支切断，并**明确接受该语料公开**。→ 该目录属 v7.8 证据链，**勿删、勿再新增同类内容**。
- **push 前必检**：新增文件与提交内容是否含私有资产/真实人名语料——**push 即公开，且历史删除成本极高**（公开仓库彻底清除需 `filter-repo` 重写或转私有）。

## headless 测试环境坑（★动效断言的隐形杀手）

- **headless Edge（152）的 `prefers-reduced-motion` 默认为 `reduce`** → 命中原生无障碍降级 → 一批动效/过渡断言被关成 `animationName: none`（v7.7 换机时表现为 `85 → 74/85`，**不是应用 Bug**）。
- **启动参数 `--force-prefers-reduced-motion=no-preference` 实测无效**。
- **有效解法**：CDP `Emulation.setEmulatedMedia` + `features:[{name:'prefers-reduced-motion', value:'no-preference'}]`，可双向钉住。
- ★**恢复时必须显式钉回 `no-preference`**——清空 `features:[]` 会**回落系统默认 reduce**（后续断言连带失败）。

## 可移植性验证法：换机演练（★可复用）

不要静态看，**真做一次换机**：
1. `git -c core.autocrlf=false clone` 到**含中文与空格**的路径（模拟另一台机器 + 苛刻路径）；
2. `node dev/build.mjs` → 比对体积/sha256 与本机一致；
3. `node dev/_qa/run-gate.mjs` → 全量闸门全绿；
4. **决定性判据**：克隆工作区字节 **== 仓库 blob 字节**（关键文件逐一 `cmp`；`git ls-files --eol` 应 `i/crlf w/crlf attr/-text`）。
★ 该演练曾在 2026-09-16 抓出真缺陷（快照 blob 是 LF → 换机后等价性闸门必红），修复方式 = `.gitattributes` 钉 `-text`。

## 明确不建议（会破红线或风险不成比例）

重写 / 换框架 / 引入打包器（webpack/vite 等）/ 恢复体积硬阈值 / 大爆炸改造 `PHJ.*` 调用通道。
（源自 2026-09-17 架构审计；如确需，先回 Holly 复核。）

## 历史决策要点（防后来者"顺手优化"）

| 项 | 现状与理由 |
|---|---|
| **体积限制** | 2026-09-15 曾拍板上限 262144 B；2026-09-16 **解除**——删 `verify_v7` 的 B10a/B10b/C8a/C8b 四条体积断言（87→**83**）。体积仍**打印但不阻断**。★勿擅自恢复硬阈值 |
| **`PHJ.*` 的定位** | 是**显式对外面**（供文档与闸门校验），**不是调用通道**——不要求（也不做）把数百处调用点改成 `PHJ.x.y()` |
| **`resolveOrder()` 不接管顺序** | `manifest.deps` 是**运行期**依赖（函数提升，与文件序无关）；真正顺序敏感的是**加载期副作用**：`addEventListener` 注册序 + 顶层 `var` 初始化序。顺序由显式 `SLICES` 掌管 |
| **快照不可动清单** | `dev/_qa/snapshots/PHJ_v7.8_20260913.html` = **`verify_v78` H 组夹具的运行时提取源**，删/改会打断断言，**不可动**；其余快照角色见 `snapshots/INDEX.md` |
| **覆盖承重点** | `probe_dev_index` 的 leaked 检查**只看内部符号名**，抓不到"任意新增全局" → 该类别**仅由 `P1-D` 一条断言守**（单点承重，改动全局相关代码时格外注意） |
| **模块重量口径** | `wc -l` / bytes **不足以判断模块重量**（版本沿革注释可占 24%）→ 正确口径 = **顶层声明数 + 监听器数 + 被跨模块引用数** |

## 一条工艺教训：门禁即规格

把「遗留 bug 清单」当施工依据前**先读断言**：v7.11 时曾按遗留清单"修" `copySpliced` 的开头空行，被 **A2a/A2c/A2d/A2e 四条断言打回**——那空行是 v6.21 的有意规则。**断言与"疑似缺陷"冲突时，以断言为准**（除非 Holly 明确改需求）。

## 两条诊断经验

- **测试产物不随 `build` 自动更新**：`dev/_qa/gen/PHJ_test.html` 由套件/`buildTestArtifact()` 生成 → 看到旧症状时**先重新生成再判断**（曾因此白查一轮）。
- **`node -e` 内联字符串里的反引号/正则会被 shell 吃掉** → 一切改动落成 `.mjs` 文件再跑（别内联进 shell）。
