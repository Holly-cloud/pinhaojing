# AGENTS.md · AI agent 接手须知（30 秒上手）

> 本文件是**任何 AI agent 接手本项目的标准入口**（Claude Code / Cursor / WorkBuddy 等通用）。
> 人也读它，但它的首要读者是 agent。最后更新：2026-09-20（v7.20）。

## 这是什么项目

**拼好镜 PHJ** —— 单文件 HTML 工具（短剧/动画**分镜提示词**写作 + 画布排布），
交付物 = 仓库根**一个 `PHJ.html`**，`file://` 双击即用、零安装/零进程/零系统残留。

## 接手 6 步（按序执行，全部通过才视为交接完成）

0. **读 [`IRON_RULES.md`](IRON_RULES.md)**（★**项目铁律 · 最高约束**：P 产品红线 / E 工程不变式 / C 协作铁律 / T 测试铁律。与任何其他文件冲突时**以它为准**；任务书与回报一律**引用编号**不复述条文）
1. **读交接状态**：[`HANDOVER.md`](HANDOVER.md)（当前版本/指纹/闸门形态/在途工作/待裁决项——**活文件，每次交付必须更新**）
2. **读项目记忆**：[`dev/docs/ops/PROJECT_MEMORY.md`](dev/docs/ops/PROJECT_MEMORY.md)（沿革/结构地图/工具坑——**事实类唯一事实源**）
3. **环境引导**：[`dev/docs/ops/环境探测与工装陷阱.md`](dev/docs/ops/环境探测与工装陷阱.md)（只写探测方法，本机差异按模板自行探测；§9 为 Linux 巡回）
4. **跑闸门**：`node dev/_qa/run-gate.mjs` → 必须 **15/15 全绿**（自起自收 headless 浏览器，约 100s）。**跑不过闸门不许改代码**——先修复环境或向交接方追问
5. **读协作协议**：[`dev/docs/ops/多agent异步协作协议_2026-09-20.md`](dev/docs/ops/多agent异步协作协议_2026-09-20.md)（角色/任务书要素/回报格式/交接 checklist）

## 改动前必知

**全部约束条文见 [`IRON_RULES.md`](IRON_RULES.md)**（本文件不再复制条文，避免两处漂移）。
最常踩的三条先记住：**A1** 绝对可移植性（单文件 `file://` 即用 / 零依赖 / 不绑机器）· **E1** 改产物字节走合法路径 · **T7** 新闸门必须做闸门级证伪。

## 交接完成判据

```
git status 干净  +  run-gate 15/15 全绿  +  HANDOVER.md 与实际一致
```

三者齐 = 交接闭环。任何一步不满足，按协作协议§交接 checklist 处理，**不要带病开工**。

## 跨平台巡回（Windows ↔ Linux）

项目支持在 **Windows 与 Linux 的 agent 管理区之间自由巡回**：工装已做平台适配
（浏览器三平台探测 + `PHJ_BROWSER` 硬覆盖 + `PHJ_BROWSER_FLAGS` 注入 + root 自动
`--no-sandbox`；套件 URL 统一 `pathToFileURL`；行尾策略跨平台无忧）。
**Linux 侧接手**：按 `dev/docs/ops/环境探测与工装陷阱.md` §9 走（重点：CJK 字体是
像素断言的前提）；首次巡回 = 跨平台的最终验收，跑完 15/15 在 `HANDOVER.md` 记录
「已巡回平台」。
