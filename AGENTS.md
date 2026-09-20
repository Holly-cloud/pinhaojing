# AGENTS.md · AI agent 接手须知（30 秒上手）

> 本文件是**任何 AI agent 接手本项目的标准入口**（Claude Code / Cursor / WorkBuddy 等通用）。
> 人也读它，但它的首要读者是 agent。最后更新：2026-09-20（v7.20）。

## 这是什么项目

**拼好镜 PHJ** —— 单文件 HTML 工具（短剧/动画**分镜提示词**写作 + 画布排布），
交付物 = 仓库根**一个 `PHJ.html`**，`file://` 双击即用、零安装/零进程/零系统残留。

## 接手 5 步（按序执行，全部通过才视为交接完成）

1. **读交接状态**：[`HANDOVER.md`](HANDOVER.md)（当前版本/指纹/闸门形态/在途工作/待裁决项——**活文件，每次交付必须更新**）
2. **读项目记忆**：[`dev/docs/ops/PROJECT_MEMORY.md`](dev/docs/ops/PROJECT_MEMORY.md)（红线/不变式/结构地图/工具坑/测试铁律——**唯一事实源**，git 管理）
3. **环境引导**：[`dev/docs/ops/环境探测与工装陷阱.md`](dev/docs/ops/环境探测与工装陷阱.md)（只写探测方法，本机差异按模板自行探测）
4. **跑闸门**：`node dev/_qa/run-gate.mjs` → 必须 **15/15 全绿**（自起自收 headless 浏览器，约 100s）。**跑不过闸门不许改代码**——先修复环境或向交接方追问
5. **读协作协议**：[`dev/docs/ops/多agent异步协作协议_2026-09-20.md`](dev/docs/ops/多agent异步协作协议_2026-09-20.md)（角色/任务书要素/回报格式/交接 checklist）

## 改动前必知（违者返工）

| # | 红线 |
|---|---|
| 1 | 交付物 = 单个 `PHJ.html`；经典脚本（禁 `type=module`/动态 `import()`）；构建期零依赖 |
| 2 | **改产物字节走合法路径**：`node dev/build.mjs` → 拷新快照 → 改 `verify_build_equivalence.mjs` 的 `OLD` → 改 `run-gate.mjs` 头注释 → 闸门 15/15 |
| 3 | `dev/src/skin/corpus.js` 一字不改（皮肤棘轮 R3-A=15 顶格，新中文文案落 `view/**` 或 `index.html`，改完跑 `skin-guard`） |
| 4 | **不新增任何 `document`/`window` 级 `keydown\|keyup\|blur` 监听**；新 UI 文案遵守 R3-A |
| 5 | `state.version` 只进不退；`migrate()` 零丢失；改动数据结构前先报用户批准 |
| 6 | **断言条数变动、判定式改动 → 必须先报用户核准**；新闸门必须做**闸门级证伪**（改坏 → 完整 run-gate 真红退非零码 → 还原） |
| 7 | 源码注释禁 `` $` ``/`$'`/`$&`/`$n`（会静默拼坏测试产物，详见 PROJECT_MEMORY 工具坑） |
| 8 | `dev/docs/**` 历史文档冻结（只加不改）；测试断言**不许为凑绿弱化** |

更多细节（结构地图 / 顺序不变式 / 测试工装铁律 10 条）见 PROJECT_MEMORY.md。

## 交接完成判据

```
git status 干净  +  run-gate 15/15 全绿  +  HANDOVER.md 与实际一致
```

三者齐 = 交接闭环。任何一步不满足，按协作协议§交接 checklist 处理，**不要带病开工**。
