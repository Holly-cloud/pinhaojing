# dev/_build/ 导览（构建与验收资产）

> `_build/` = 本项目全部**验收脚本 / 诊断探针 / 版本快照 / 截图留档**。
> **一眼分清"在用 / 历史 / 归档"**，是本文件存在的唯一理由。
> 一条命令复现：`node dev/_build/run-gate.mjs` → 期望 **7/7（83/18/16/47/18）**，退出码 0。

## 一、分区总表

| 分区 | 内容 | 状态 |
|---|---|---|
| `verify/` | **5 个在用套件**：`verify_build_equivalence.mjs`、`verify_v7.mjs`（回归 83）、`verify_v76.mjs`（F 18）、`verify_v77.mjs`（G 16）、`verify_v78.mjs`（H+I+X+P1+P2+P3 47） | ★ **闸门在用** |
| `verify/archive/` | **22 个 v6 系列套件**（`verify_v6` … `verify_v621`，逐版历史验收） | 历史（只读留档） |
| `diag/` | **5 个在用/契约探针**：`probe_dev_index.mjs`（闸门第 7 道）、`probe_arch_audit.mjs`（★ 架构审计只读探针，8 段：模块规模分布 / 重复导出行 / 跨模块引用面 / 导出契约 vs 实际 / 加载期副作用 / 环检测 / 状态边界 / 产物全局面；**R0/R1 的事实依据来源，可随时复跑**）、`probe_v782_verbatim.mjs` + `probe_v782_coldstart.mjs`（v7.8.2 内置风格包契约）、`spike_emulate_media.mjs`（`lib/browser-detect.mjs` 依赖的动效钉桩实验） | ★ 在用 |
| `diag/archive/` | **15 个历史探针**：`diag_*`（v7.2 跟手量化、v7.4 虚影偏移、v7.6/7.7 着色对齐、审计复核 `diag_audit_claims`）+ `split_phj_to_src.mjs`（**P2 后已退役**：其存在意义只是"保序切分"）+ `migrate_paths_to_relative.py`（一次性路径迁移）+ `split_user_dev.py` + **R0/R1 一次性脚本 3 个**（`_r0_strip_dup_exports.mjs` 删死导出行、`_r1_verify_verbatim.mjs` 语料逐字校验、`_r1_falsify_run.mjs` 绕等价性闸门直跑 verify_v78 的证伪跑手） | 历史（只读留档） |
| `snapshots/` | 当前与历史**版本快照 + BASELINE 文档**；角色与"不可动"清单见 `snapshots/INDEX.md` | ★ 见 INDEX |
| `snapshots/archive/` | v5.4–v7.5 整文件拷贝（30 项） | 历史 |
| `lib/` | 共享模块：`browser-detect.mjs`（浏览器探测/端口）、`test-artifact.mjs`（生成"产物 + 1 行访问器"的测试产物，供 4 套件操纵内部态） | ★ 在用 |
| `artifacts/screenshots/` | v7.6 / v7.7 交付截图 | 留档 |
| `artifacts/v78/` | v7.8 截图 + 着色对齐举证图（10 张） | 留档（被 04/07/08 文档引用） |
| `artifacts/画布语料_20260913/` | **v7.8 依据语料**：即梦画布「补补补」53 个节点全文 + 规律分析（见该目录 `00_说明.md`） | 留档（**证据链，勿删**） |
| `artifacts/archive/` | `_recon_20260913/`（外部重构交接包复核）、`_recon_20260914/`（RECON） | 历史 |
| `run-gate.mjs` | ★ **一键闸门入口**（自动定位浏览器 → 选空闲端口 → 起 headless → 依次跑 7 道 → 语义化退出码） | ★ 在用 |

## 二、归档说明（为何有 `archive/`，以及文档路径为何没跟着改）

- **归档一律用 `git mv`**：历史保全、可回退；**只删可再生生成物**（`PHJ.html`、`src/dev-bundle.js`、`artifacts/PHJ_test_*.html`）。
- **历史文档不动**：`dev/04_发布说明_v6.0.md`、`dev/06_着色方案草案_2026-09-13.md`、`artifacts/archive/_recon_*/` 里提到的
  `verify_v6*.mjs`、`diag_hl_align.py`、`split_phj_to_src.mjs` 等路径，**现位于对应 `archive/` 子目录**；
  这些文档是历史留档，按本项目"旧路径按沿革保留"的原则**未改**——**别把它们当当前位置依据**，当前位置以本文件与根 `README.md` 为准。
- 根 `README.md` 里 v7.x 交付日志中提到的 `_build/diag_xxx.mjs` 同理属**历史叙事**，未逐条改写。

## 三、常用命令

```bash
node dev/build.mjs                          # 构建（产出 PHJ.html + src/dev-bundle.js）
node dev/_build/run-gate.mjs                # ★ 全部 7 道闸门（自包含）
node dev/_build/run-gate.mjs                # 期望：7/7 全绿，退出码 0；各闸门 83/18/16/47/18
node dev/_build/diag/probe_dev_index.mjs    # 开发态单跑（需先有 headless 浏览器监听 PHJ_BROWSER_PORT，缺省 9222）
node dev/_build/diag/probe_v782_verbatim.mjs  # 内置风格包逐字（v7.8.2 契约）
node dev/_build/verify/verify_build_equivalence.mjs PHJ.html dev/_build/snapshots/PHJ_v7.10_20260916.html
                                            # 等价性：以历史基线复跑（argv[3] 指定基线）
```
