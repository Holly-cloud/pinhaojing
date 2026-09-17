# dev/_qa/ 导览（验收工装 + 闸门基准 + 物证留档）

> `_qa/` = 本项目**全部验收脚本 / 诊断探针 / 版本快照 / 物证留档 / 可再生产物**。
> **一眼分清「在用 / 历史 / 留档 / 生成物」**，是本文件存在的唯一理由。
> 一条命令复现全部验收：`node dev/_qa/run-gate.mjs` → 期望 **7/7 全绿**（83 / 18 / 16 / **53** / 18），退出码 0。
>
> 命名沿革：本目录原名 `dev/_build/`；2026-09-17 结构整理改名 `dev/_qa/`（原名名实不符——它不只是「构建产物」，而是**验收工装 + 基准 + 物证**三合一）。

## 一、分区总表（四态一眼分清）

| 分区 | 内容 | 存在理由（删了会怎样） | 状态 |
|---|---|---|---|
| `run-gate.mjs` | ★ 一键闸门入口：自动定位浏览器 → 选空闲端口 → 起 headless → 依次跑 7 道 → 语义化退出码 | 没有它，7 道验收要人工逐条起浏览器跑 | ★ **在用** |
| `lib/` | 共享模块：`browser-detect.mjs`（浏览器探测/端口）、`test-artifact.mjs`（生成「产物 + 1 行访问器」的测试产物，供 4 套件操纵内部态；产物落 `gen/PHJ_test.html`）、**`skin-guard.mjs`（R3 皮肤边界护栏：抽皮肤词元 / 列引擎文件 / `DOMAIN_HITS_GOLDEN`）** | 没有它，CDP 套件无法在「不改产品」前提下触达内部态，R3 棘轮也无处实现 | ★ **在用** |
| `verify/` | **5 个在用套件**：`verify_build_equivalence.mjs`（等价性，闸门第 2 道）、`verify_v7.mjs`（回归 83）、`verify_v76.mjs`（F 18）、`verify_v77.mjs`（G 16）、`verify_v78.mjs`（H+I+X+P1+P2+P3+R0+R1+**R3+R4** **53**） | 闸门的主体；删了等于没有回归保护 | ★ **在用** |
| `verify/archive/` | **22 个 v6 系列套件**（`verify_v6` … `verify_v621`，逐版历史验收） | 历史验收口径的可追溯留档 | 历史（只读） |
| `diag/` | **在用/契约探针 5 个**：`probe_dev_index.mjs`（闸门第 7 道）、`probe_arch_audit.mjs`（架构审计只读探针，R0/R1 的事实依据）、`probe_v782_verbatim.mjs` + `probe_v782_coldstart.mjs`（内置风格包契约）、`spike_emulate_media.mjs` | 提供闸门之外的可复现诊断数据 | ★ **在用** |
| `diag/archive/` | **15 个历史探针**：v7.2 跟手量化 / v7.4 虚影偏移 / v7.6-7.7 着色对齐 / 审计复核 `diag_audit_claims`；`split_phj_to_src.mjs`（**P2 后已退役**）、`migrate_paths_to_relative.py`（一次性）、R0/R1 一次性脚本 3 个 | 历史诊断与一次性脚本的留档 | 历史（只读） |
| `snapshots/` | 当前与历史**版本快照 + BASELINE 文档**；角色与「不可动」清单见 `snapshots/INDEX.md` | 等价性闸门的比对基准 + 夹具来源 | ★ **见 INDEX** |
| `snapshots/archive/` | v5.4–v7.5 整文件拷贝 | 更早版本的可追溯留档 | 历史（只读） |
| `records/` | **纯留档**：`screenshots/`（交付截图 + 着色对齐举证图）、`corpus-20260913/`（v7.8 依据语料，**证据链**）、`archive/`（外部重构交接包复核） | 让设计/交付记录**有物证可查**；删了不会让闸门红，却会让文档失去凭据 | **留档** |
| `gen/` | **可再生产物**（`PHJ_test.html` 等，gitignore） | 隔离「跑一次就重生」的生成物，不污染其余分区 | **生成物** |

## 二、归档说明（为何有 `archive/`，以及旧路径为何没跟着改）

- **归档一律用 `git mv`**：历史保全、可回退；**只删「可再生」生成物**（如 `gen/` 内的测试产物）。
- **历史文档/脚本不动**：`records/archive/_recon_*/`、`diag/archive/`、`verify/archive/` 里提到的旧路径（`_build/…`、`split_phj_to_src.mjs` 等）**按沿革原样保留**——它们是历史留档，**别当作当前位置依据**；当前位置以本文件与 `dev/docs/README.md` 为准。
- **`dev/_build/` 为整理前旧名**：**v7.13 之前**的逐版记录（`snapshots/BASELINE_v7.5…v7.12.md` 等）里出现的 `dev/_build/` 均属整理前旧路径，**刻意未改**（冻结记录只增不改）。

## 三、常用命令（路径已更新为新路径）

```bash
node dev/build.mjs                          # 构建（产出 PHJ.html + src/dev-bundle.js）
node dev/_qa/run-gate.mjs                   # ★ 全部 7 道闸门（自包含）；期望 7/7 全绿，退出码 0；各闸门 83/18/16/53/18
node dev/_qa/lib/skin-guard.mjs             # R3 皮肤边界：R3-A 命中 ≤ golden；R3-B 长语料零命中（纯静态，无需浏览器）
node dev/_qa/diag/probe_dev_index.mjs       # 开发态单跑（需先有 headless 浏览器监听 PHJ_BROWSER_PORT，缺省 9222）
node dev/_qa/diag/probe_v782_verbatim.mjs   # 内置风格包逐字（v7.8.2 契约）
node dev/_qa/verify/verify_build_equivalence.mjs PHJ.html dev/_qa/snapshots/PHJ_v7.13_20260917.html
                                            # 等价性：以历史基线复跑（argv[3] 指定基线）
```
