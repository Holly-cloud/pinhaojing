# 侦察卷宗 · 拼好镜（PHJ）本地可运行性核查（2026-09-14）

> 作者：交付总监（齐活林）｜ 用途：供本 team 各成员在动手前对齐事实基线。**全部结论均经实机实测，非推测。**

## 0. 一句话现状

仓库**已克隆可用**、**构建管线已可移植**（产物逐字节等价）；**唯一实质故障 = 回归验收闸门在换机/换浏览器后不可复现**（`verify_v7.mjs` 85 → 74/85）。其余为文档路径陈旧等低危债。

## 1. 仓库与落位

| 项 | 值 |
|---|---|
| 远程 | `https://github.com/holly-cloud/pinhaojing.git` |
| 本地 | `C:\Users\Holly\Documents\Work_Store\AA_Dev\pinhaojing` |
| 分支 | 仅 `master`（`refactor/src-tree` 已并入，远程无残留分支） |
| HEAD | `9f7a3c8` `chore(migrate): 项目整体迁入 D:\Hermes_Store\AA-Dev\拼好镜`（2026-09-13 19:19） |
| 规模 | 117 个跟踪文件；源码 = 7 片 CSS（316 行）+ 16 片 JS（2285 行） |
| 交付物 | 根目录 `PHJ.html`（单文件，双击即用） |

## 2. 产品定位（来自 README）

「双击即开、用完即走」的**单文件 HTML 小工具**：把一条视频模型的提示词拆成**无限画布上自由摆放的提示词块**，右侧拼接栏按序拼成整条 prompt，支持模板预设、自动保存、JSON 导入导出。红线为**零安装、零进程、零系统残留**（便携性即产品卖点）。

## 3. 现有架构（已实测）

```
pinhaojing/
├─ PHJ.html                  ← 构建产物（155315 B，勿手改）
├─ README.md                 ← 交接入口
└─ dev/
   ├─ 01~06_*.md/png/html    ← 文档链（考察/计划/发布说明/动效/着色方案/小样）
   ├─ build.mjs              ← 零依赖构建（node，无 node_modules）
   ├─ src/                   ← ★唯一手改入口
   │  ├─ index.html          ← 骨架 + 按序 <link>/<script src> 引入（file:// 可直接跑）
   │  ├─ styles/  7 片
   │  └─ js/      16 片（00-header → 90-boot，靠全局变量 + 脚本顺序耦合）
   └─ _build/
      ├─ verify/  verify_v6…v77.mjs（CDP 真机断言）+ verify_build_equivalence.mjs
      ├─ diag/    诊断探针 + split_phj_to_src.mjs（切分执行器）
      ├─ snapshots/ PHJ_v7.7_baseline.html + archive/（历史整文件）
      └─ artifacts/ 截图留档 + _recon_20260913/
```

构建链：`dev/src/**` →（`node dev/build.mjs` 内联 CSS/JS）→ 根 `PHJ.html`。**不输出 ES module、不引外部依赖、产物行尾 CRLF。**

## 4. 实测结果（本机 Edge 152.0.4191.66 / Node v22.22.2）

### ✅ 通过

| 闸门 | 命令 | 结果 |
|---|---|---|
| 构建 | `node dev/build.mjs` | ✅ 155315 B，CSS 7 片 / JS 16 片 |
| 等价性 | `node dev/_build/verify/verify_build_equivalence.mjs` | ✅ **PASS（严格）**：剥离 banner 后与基线逐字节一致 |
| 工作区洁净 | `git status --porcelain` | ✅ 空（构建可重复、无副作用） |
| F 组 | `node dev/_build/verify/verify_v76.mjs` | ✅ **18/18** |
| G 组 | `node dev/_build/verify/verify_v77.mjs` | ✅ **16/16** |
| 开发态 | `node dev/_build/diag/probe_dev_index.mjs` | ✅ **18/18**（含无 Console 报错） |

产物 sha256 = `67e1ce47da62d5d14277b6993f141a89685ca42311c23364c61118c81891687b`（= 基线 `0de0d27f…d17bcc` + banner）。

### ❌ 失败：`verify_v7.mjs` = 74 通过 / 11 失败

11 项**全部**是动效/过渡断言：

```
B5a 被遮挡块光点 dotIn 淡入      C1b 真实按下按钮 scale(.96)
B6a 模板窗口 winIn 弹入          C2a hover 浮起 translateY(-1px)
B6b 遮罩 maskIn 淡入             C5a drop-target 呼吸动画 breatheK
B6c 块编辑窗口弹入               C6a 缩放值 tick（tickK）
B7a 右键菜单 menuIn 弹入         C6c 动画结束后 class 自动移除
B8a toast 滑入动画
```

失败项的实测值均为 `animationName = none`。

## 5. 根因（已定位，非页面 Bug）

```
prefers-reduced-motion: reduce  = true    ← headless Edge 152 默认值
document.visibilityState        = visible（不是后台节流）
```

- 应用在 `90-effects.css` 里有**正当的无障碍降级**规则：`@media (prefers-reduced-motion: reduce) { <若干动效类> { animation: none } }`
- 该规则命中 → 上述 11 项的过渡/动画被关成 `none` → 断言全红
- **对照证据**：`probe_dev_index`（开发态）与 F/G 组不含动效断言，故全绿；`C3a 拖拽 lift scale(1.02)`、`C7a reduce-motion 直切` 亦绿（后者本就期望降级，故"因祸得福"通过）
- **结论：应用本身无 Bug；故障在验收工装未钉住环境媒体特性**——换机/换浏览器版本必现，这正是"可移植性差"的真实病灶。

### 已验证：两条修复路径其中一条无效

| 方案 | 实测 |
|---|---|
| 启动参数 `--force-prefers-reduced-motion=no-preference` | ❌ **无效**，仍为 `reduce = true` |
| CDP `Emulation.setEmulatedMedia` + `features:[{name:'prefers-reduced-motion', value:'no-preference'}]` | ✅ **有效**，且可双向钉回 `reduce`（B9/C7 组需要） |

冒烟证据（`dev/_build/diag/spike_emulate_media.mjs`）：

```
① 模拟前 reduce = true      ② setEmulatedMedia = OK
③ 模拟后 reduce = false     ④ 模拟后 no-preference = true
⑤ 钉回 reduce = true
```

## 6. 其余可移植性债（低危，但需清理）

| # | 位置 | 问题 | 危害 |
|---|---|---|---|
| P1 | `README.md:4` | 声明位置 = `D:\Hermes_Store\AA-Dev\拼好镜\`，**本机不存在** | 交接方照抄即卡住 |
| P2 | `dev/_build/artifacts/_recon_20260913/make_fixed_refs.py:3-4` | 硬编码 `C:/Users/Holly/AppData/Local/Temp/…` + `D:/Hermes_Store/…` | 一次性留档脚本，不可复跑 |
| P3 | `README.md` / `dev/01~06` | 历史沿革里保留 `D:\Hermes_Store\…`、`C:\…\Work_Store\拼好镜` 等旧路径 | 属**沿革存档**，按原则应保留（仅需标注"非当前位置依据"） |
| P4 | `dev/_build/verify/verify_*.mjs`（30+ 个） | 硬编码 `http://127.0.0.1:9222`，需**人工先起** headless Edge；无自启/自清 | 换机无 Edge、或端口占用即失败；无统一入口 |
| P5 | 全仓 | 无 `package.json`（有意零依赖）→ **没有一条命令跑完全部闸门** | 复现门槛 = 读懂 README 手工起浏览器 |

> 注：`verify_*/diag/*.mjs` 的 `TARGET` 与 `SAMPLE` **已全部改为 `path.resolve(HERE, …)` 相对解析**，迁移目录不再失效——这部分旧账已还清。

## 7. 本机环境事实（供各成员复跑）

| 项 | 路径 / 值 |
|---|---|
| Edge | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（Edg/152.0.4191.66） |
| Node | `C:\Users\Holly\.workbuddy\binaries\node\versions\22.22.2-3\node.exe`（v22.22.2） |
| Git | `C:\Users\Holly\.workbuddy\binaries\PortableGit\versions\1.2.0\mingw64\bin\git.exe` |
| 起浏览器模板 | `"<EDGE>" --headless=new --disable-gpu --remote-debugging-port=9222 --user-data-dir=<临时目录> about:blank` |

**执行注意**：本环境的 shell 会**随单次工具调用结束回收子进程**——必须"起浏览器 → 跑完 → 杀进程"放在**同一次调用**内，否则 Edge 已死、`ECONNREFUSED`。

## 8. 侦察期新增文件（非交付物，可清理）

- `dev/_build/diag/probe_reduced_motion.mjs`（根因定位探针，**建议保留**为环境体检工具）
- `dev/_build/diag/probe_rm_port.mjs`（端口版探针，与本文件同族的临时件）
- `dev/_build/diag/spike_emulate_media.mjs`（CDP 模拟可行性冒烟，**建议保留**为回归防退化用例）
