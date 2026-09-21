# CLAUDE.md

本项目的 **agent 接手须知、铁律与交接协议**统一维护在以下三份文件（通用 agent 入口）：

| 文件 | 作用 |
|---|---|
| **[`IRON_RULES.md`](IRON_RULES.md)** | ★ **项目铁律 · 最高约束**（P 产品红线 / E 工程不变式 / C 协作 / T 测试；冲突时以它为准） |
| [`AGENTS.md`](AGENTS.md) | 接手流程（30 秒上手 + **接手 6 步** + 交接闭环判据 + 跨平台巡回） |
| [`HANDOVER.md`](HANDOVER.md) | 当前交接状态（版本 / 指纹 / 闸门形态 / 在途工作 / 待裁决项） |

接手前按 `AGENTS.md` 的「接手 6 步」执行：
0. 读 [`IRON_RULES.md`](IRON_RULES.md)（最高约束，任务书与回报一律引用编号）
1. 读 [`HANDOVER.md`](HANDOVER.md)
2. 读 [`dev/docs/ops/PROJECT_MEMORY.md`](dev/docs/ops/PROJECT_MEMORY.md)（事实类唯一事实源）
3. 环境探测：[`dev/docs/ops/环境探测与工装陷阱.md`](dev/docs/ops/环境探测与工装陷阱.md)
4. 跑闸门 `node dev/_qa/run-gate.mjs` → 必须 16/16 全绿
5. 读 [`dev/docs/ops/多agent异步协作协议_2026-09-20.md`](dev/docs/ops/多agent异步协作协议_2026-09-20.md)
