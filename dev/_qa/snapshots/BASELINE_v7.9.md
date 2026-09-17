# 交付快照指纹 · PHJ.html v7.9（2026-09-16）

来源：v7.9 = v7.8.2 之上的 **P1 止血**——**只改构建器 / 接线，不改任何业务代码**。
记入时间：2026-09-16 ｜ 记录者：软件工程师（本轮交付时补档）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.9（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **222381** |
| **sha256** | **a6d3a6f61af157052b3543acba1df1f50eb2d19f698400ee0f66e45277ff8f43** |
| 行尾 | CRLF ×3883，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 3884 行（`wc -l` 报 3883 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.9_20260916.html`（同一字节内容，等价性闸门的比对基准） |
| 构建 banner | 第 2 行：`<!-- 构建生成：请勿手改本文件；源码在 src/，改完跑 node build.mjs -->` |

## 本轮变更要点（v7.8.2 → v7.9 · P1）

**目标口径：不是「零全局」，而是「零意外泄漏」——产物不得新增任何全局名（目标 0 个）。**

1. **产物 JS 收进单个 IIFE + 严格模式**（`dev/build.mjs`）：JS 段包 `;(function(){\n<体>\n})();`。
   因 `js/00-header.js` 首行本就是 `'use strict';`，该字面量落在**函数体首条语句位置** ⇒ 严格模式
   覆盖整个函数体（未再插第二条）。**注：产物在 P1 之前本已是严格模式**（该 `'use strict';` 原就是
   单 `<script>` 的首条语句），故本步**对产物无严格性行为改变**；真正消除的是 **243 个顶层声明
   从全局（window）收进一个私有函数作用域**（`verify_v78` 的 P1-D 在真实浏览器实测：加载 pristine
   `PHJ.html` 后 window 自有键增量 **= 空集**）。
2. **manifest 成为唯一顺序源**（`dev/manifest.mjs` · `MANIFEST_VERSION='v0.2-p1'`）：新增 `SLICES`(19) /
   `CSS`(9) 顺序表；`build.mjs` 的 JS 顺序**改读 `SLICES`**（切掉旧机制 `matchAll(JS_RE)` 扫
   `index.html` 收集）；CSS 顺序读 `manifest.CSS` 并**校验** index.html 的链顺序 == manifest（不一致即构建报错）。
   `MODULES`/`LAYERS`/`V78_EDGES`/`resolveOrder()` **保留**，为 **P2 的模块化目标**（P2 完成后 `SLICES` 退役）。
3. **开发态 ≡ 产物**：`build.mjs` 把**与产物内联 JS 段逐字相同**的那一份写入 `dev/src/dev-bundle.js`
   （`dev/src/index.html` 19 个 `<script src="./js/*">` → **1 个** `./dev-bundle.js`；9 个 CSS `<link>` 不动）
   ⇒ 开发态与产物跑在**同一作用域、同一顺序、同一字节**的 JS 上（`verify_v78` 的 P1-A 逐字一致，0 处不同）。
4. **A+ 测试产物（恢复 CDP 套件对内部的可达性，不改产品）**：`dev/_build/lib/test-artifact.mjs` 由
   **构建侧**产出 `dev/_build/artifacts/PHJ_test_v7.9.html` = 产物内联 JS 段 **仅在 IIFE 闭合前插入 1 行**
   访问器代码（其余逐字节等于产物）；访问器名**自动扫描**（内联段顶层声明 243 个，多声明符 `var a,b,c`
   逐个抓全），每个名 `Object.defineProperty(window,n,{get,set})` **闭包落到真实内部变量**（读与写皆生效，不用 `eval`）。
   4 个 CDP 套件（v7/v76/v77/v78）**改对测试产物执行，判定式一字不改、计数不变**。
   - P1-C 审计断言：测试产物 vs 产物 **逐行 diff 恰为插入的 1 行访问器**（行数 3884→3885，prefix/suffix 全等）。
   - P1-D 产品纯度断言：pristine `PHJ.html` 加载后 window 自有键增量 **⊆ 白名单（当前 = 空集）**。
   - **未被测试产物改动**：产品 `PHJ.html` 字节零变化（`node dev/build.mjs` 默认行为不变，只出 `PHJ.html` + `dev/src/dev-bundle.js`）。
5. `dev/_build/verify/verify_build_equivalence.mjs`：默认比对基准改指 `PHJ_v7.9_20260916.html`；
   v7.7 / v7.8 / v7.8.1 / v7.8.2 快照保留为 **argv 指定基线**。
6. `dev/_build/diag/probe_dev_index.mjs`：index.html 只余 1 条 JS 链，故「实际加载片数」改看**目录实况**
   （① js≥19 / styles≥9 独立下限抓一致删除；② 目录 == manifest `SLICES`/`CSS` 条数抓加片漏接线）；
   旧断言「跨片全局函数在 window 可用」按**反面**重写为「单 bundle 链 + 内部符号不泄漏全局」；
   `closeBlockEditor` 已私有化，改走真实 UI（点「取消」）。**断言数 18 不变**。
7. **未改**：`dev/src/js/**`、`dev/src/styles/**` 任何业务代码；`version` 仍 **14**、`migrate()` 对 v1~v13 **零丢失**；
   `prefers-reduced-motion` 降级规则保留；产物仍为**单文件、经典脚本、零外链、零运行时依赖**。

## 构建可复现（等价性闸门基线，Q6 校准）

`node dev/build.mjs` 的产出与本快照**逐字节一致（含 banner，不做 stripBanner）**。

| 项 | 值 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **222381 B**，sha256 `a6d3a6f61af157052b3543acba1df1f50eb2d19f698400ee0f66e45277ff8f43` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.9_20260916.html`（逐字节相同） |
| 切片 | CSS **9 片 / 387 行**；JS **19 片 / 3357 行**（`wc -l` 口径，与 v7.8.2 相同） |
| 产物增量 | 相对 v7.8.2（222359 B）**净 +22 B —— 仅 IIFE 外壳**（`;(function(){`+换行、`})();`+换行；旧构建已把 19 对 `<script src>` 标签替换为内联块，故该步不在产物字节中体现） |

## 回归闸门（本轮实测 · `node dev/_build/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 期望 |
|---|---|
| 构建 | `PHJ.html` = 222381 B |
| 等价性（构建可复现） | ✅ PASS（含 banner 逐字节一致，基准 = `PHJ_v7.9_20260916.html`） |
| `verify_v7.mjs` | **87/87**（B10b/C8b「产品硬上限 262144 B」；B10a/C8a「工程临时护栏 229376 B」保留、判定式未放宽） |
| `verify_v76.mjs` | **F 组 18/18** |
| `verify_v77.mjs` | **G 组 16/16** |
| `verify_v78.mjs` | **H 组 23 + I 组 15 + X 组 2 + P1 构建器 4 = 44/44**（P1-A dev≡prod 逐字 / P1-B CSS 链序 / P1-C 测试产物审计 / P1-D 产品纯度） |
| `probe_dev_index.mjs` | **开发态 18/18** |

## 体积余量（工程临时护栏 229376 B）

- 实测 `222381 B`；距工程临时护栏 `229376 B` 余 **6995 B（≈6.83 KB）**；距产品硬上限 `262144 B` 余 **39763 B**。
- 相对 v7.8.2（222359 B）**净 +22 B**（仅 IIFE 外壳）。
- 本轮**不做瘦身**。

## 自检

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('PHJ.html');console.log('bytes',b.length);console.log('sha256',c.createHash('sha256').update(b).digest('hex'))"
# 期望：bytes 222381 ／ sha256 a6d3a6f61af157052b3543acba1df1f50eb2d19f698400ee0f66e45277ff8f43
node dev/_build/lib/test-artifact.mjs   # 生成测试产物并打印「逐行 diff 恰 1 行」审计
```
