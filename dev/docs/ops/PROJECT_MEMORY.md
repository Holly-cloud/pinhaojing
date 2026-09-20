# 项目记忆 · 拼好镜 PHJ（AGENT_MEMORY）

> **本文件是项目知识的唯一事实源**，随 git 仓库走（2026-09-20 从会话侧记忆迁入，Holly 拍板「可移植性优先」）。
> 任何 agent 接手后**先读本文件**；本文件由「交出方」在每次交付时更新。
> 历史细节另见：`HANDOVER.md`（当前状态）· `dev/CHANGELOG.md`（逐版功能史）· `dev/docs/decisions/`（决策冻结）· `dev/_qa/records/handover/`（任务存档）。

## 项目一句话

**拼好镜 PHJ** = 单文件 HTML 工具（短剧/动画**分镜提示词**写作 + 画布排布）。
交付物 = 仓库根**一个 `PHJ.html`**，「双击即开、用完即走」；`github.com/Holly-cloud/pinhaojing`（公开）。

**当前基线（v7.20，2026-09-20）**：`PHJ.html` = **324783 B** ｜ sha256 `8ca1925156e28d0494f56d74a51a9e71b254d92da03379977d62b36d3425ae8a` ｜ 闸门 **15/15** ｜ `state.version` = **17** ｜ 本地 HEAD `b00e788` + tag `v7.20`（**远端 `origin/master` 仍 `63e0671`（v7.14 期），v7.18/v7.19/v7.20 三个提交与 tag 未推送**——推送需 PAT：写 `~/.git-credentials` → `git -c credential.helper= -c credential.helper=store push origin master --tags` → **用完删**；`GIT_ASKPASS`+msys 路径会 spawn 失败）。

## 产品红线（不可违背）

1. 交付物 = 根目录**单个 `PHJ.html`**，`file://` 双击即用；零安装/零进程/零系统残留
2. 经典脚本（禁 `type=module` / 动态 `import()`，`file://` 被 CORS 挡）；构建期零依赖（纯 node）
3. localStorage 键 `storyboard-prompt-panel:v1`；`version`=**17**；`migrate()` 须 v1→v17 **零丢失**（v15 加 `block.order`；v16 加 `cmpl.use`=补全条目使用记录 `{[hkey]:{n,t}}`，hkey = 内容派生 `FNV1a32(group\0label\0body)`；**v17 加 `projects[]`+`activeProject`，老数据升为单项目并沿用原 `title`；顶层 `blocks/pan/zoom/splice/collapsed/title` 是活动项目槽的镜像引用，切项目换引用**）
4. `prefers-reduced-motion` 降级必须保留
5. `dev/src/skin/corpus.js` 一字不改；皮肤语料演进（如给「硬性要求」节加专属气泡组）属皮肤层演进，需 Holly 批准

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

## 工程不变式

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

## 测试工装铁律（11 条 · 全部实战事故）

1. 断言必须**真读**被测对象（state/LS/DOM 真值/getComputedStyle/rect/像素），不许判"元素存在"
2. 每条改过的断言都要**证伪**（改到必红 → 还原）
3. 存在性/计数断言追问「内容变空会不会照样通过」
4. 断言**条数变动须先报 Holly** 核准
5. ★新增「默认入口/默认初始态」会被既有套件 setup 绕开 → 变成零覆盖盲区，**必须单立断言**（v7.15：写作台 `display:none` 却 7/7 全绿）
6. 门控/豁免断言必须配**反方向对照组**
7. ★★新闸门必须做**闸门级证伪**（改坏 → 完整 run-gate 真红退自己那道的非零码；v7.16 出过"只跑 8 道硬编码报 9/9"的假闸门）
8. 断言写完自问反向「改坏必红吗」；**夹具不得预含被插入/被断言的内容**（v7.20：fixture 首行含目标 body → 插入断言恒真）
9. ★★修 flake 先稳定复现（连跑 20 次统计）；**修法不得放宽判定**（v7.17：跨进程时钟比较 → 基准挪同进程，不是放大容差）；**复现不出就不许改**
10. ★闸门总数禁止硬编码：汇总用 `GATE_TOTAL` 推导；**新增闸门改四处**（SCRIPTS / GATE_META / 步骤头 `/N` / 汇总 key 数组）——漏 key 数组 = 不显示、漏步骤头 = 数字撒谎
11. ★探测类操作（环境/工装陷阱）以**实测为准**：假设被证伪就接受（v7.19"dev 页顶层名全 undefined → W 组跑那儿只会崩不会部分红"），不按猜测改代码

## 多 agent 协作（详见《多agent异步协作协议》）

- 角色：主理人（编排/裁决/中转）· 工程师 · QA · 架构师 · 产品经理；**跨成员信息流必须经主理人**
- 任务书要素：环境（PATH/仓库根）· 基线指纹 · 需求口径表 · 红线 · 完成判据 · 回报格式 · 「不 commit/push」纪律
- 回报必含：TL;DR / 改动清单 / 逐项闸门结果 / skin-guard / 体积 sha / IS_PASS / 遗留
- 交接闭环判据：`git status 干净 + run-gate 15/15 + HANDOVER.md 与实际一致`
