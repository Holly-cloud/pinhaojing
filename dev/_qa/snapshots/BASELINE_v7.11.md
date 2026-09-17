# 交付快照指纹 · PHJ.html v7.11（2026-09-16）

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.11（`state.version` = **14**；localStorage 键仍 `storyboard-prompt-panel:v1`） |
| **bytes** | **234243** |
| **sha256** | **1abe0431fe4e8a6eeb9f8e08a8332986a9be97c748df5e6092af7ce1685cc9fd** |
| 行尾 | CRLF（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符** |
| 快照 | `dev/_build/snapshots/PHJ_v7.11_20260916.html`（同一字节内容，等价性闸门的比对基准） |

## 本轮变更要点（v7.10 → v7.11 · P3 收口）

### 1. Escape 统一分发（原 8 处 document 级处理器 → 1 处分发器）

- **收编前**：8 处 `document.addEventListener('keydown')` 各自 `if(e.key==='Escape' && …)`，且互不阻断
  → **一次 Esc 可能同时关掉多层**（例如配置窗与编辑器窗同开会一起关）
- **收编后**：唯一 document 级 Esc 处理点 = `interact/keys.js` 的 **`closeTopLayer()`**，按「最上层优先」**只关一层**：
  右键菜单 → 补全配置窗 → 编辑器窗 → 模板预览 → 模板窗 → 拼模式
- **保留元素级 4 处**（输入焦点内、语义更细，且它们 `stopPropagation` 优先于分发器）：
  行内编辑框（complete）/ 配置窗表单体 / 命名模态框体 / 模板窗输入框
- **新断言 P3-A**：产物中 document 级 keydown 处理器共 **3** 处，其中含 Escape 的**恰为 1** 处（谁再加一处必红）

### 2. 会话态收编（跨模块可见的瞬时态 → `core/store.js`）

- 移入：`keyDir / keyVel / keyLoop / keyLastT / keyState`（原 keys）、`tplOpen / tplCur`（原 modals）、
  `spacePan / spliceMode`（原 pointer）
- **判据**：跨模块可见 → store；模块内部专用瞬时态（如 pointer 的 `ghostEl/ghostSrcId/dropUnitEl`）留在本模块
- `core/store.js` 顶层名 12 → **21**

### 3. `PHJ` 对外面收敛（objective：被他模块引用的顶层名）

- 由 P2 的"全部顶层符号"收敛为**客观统计出的跨模块引用面**：**238 → 108**（收敛掉 130 个内部符号，约 55%）
- 收敛后 `interact/keys.js` 与 `interact/paste.js` 对外面为**空**（自包含），导出写作 `PHJ.<module> = {}`
- 读者可据此判断真实耦合：`core/store`（21）、`interact/pointer`（15）、`view/modals`（12）、`editor/library`（10）

### 4. 修 1 个真 bug / 判定 1 个非 bug

- **修**：`deleteTemplate` 读 v6.13 已删字段 `t.name` → toast 恒显示 `已删除模板：undefined`；
  改为与 UI 一致的「**模板 N**」（N = 列表序号）
- **判定非 bug（保留）**：`copySpliced` 的"开头空行"是 **v6.21 有意规则**（前缀值段上方加空行，便于粘进画布），
  由 `A2a / A2c / A2d / A2e` 四条断言锁定 → **不改**（曾误列为 v7.7.1 遗留 bug）

### 5. 死代码扫描

- 顶层声明 **239** 个，**无"只声明未使用"者**（扫描口径：剥离注释/字符串/导出面后按词边界计数）

## 构建可复现（等价性闸门基线）

| 项 | 结果 |
|---|---|
| 构建命令 | `node dev/build.mjs` |
| 产物 | `PHJ.html` = **234243 B**，sha256 `1abe0431fe4e8a6eeb9f8e08a8332986a9be97c748df5e6092af7ce1685cc9fd` |
| 比对基准 | `dev/_build/snapshots/PHJ_v7.11_20260916.html`（逐字节相同） |
| 源文件 | CSS **9 片 / 387 行**；JS **17 模块 / 3484 行**（`wc -l` 口径） |
| 体积 | **限制已解除**（无上限/无护栏）；v7.10 229609 → v7.11 **234243 B**（+4634 B：Escape 分发器与注释、会话态段注释、对外面注释） |

## 回归闸门（本轮实测 · `node dev/_build/run-gate.mjs` = 7/7 全绿，退出码 0）

| 闸门 | 结果 |
|---|---|
| 构建 | 234243 B |
| 等价性（构建可复现） | ✅ PASS（基准 = `PHJ_v7.11_20260916.html`） |
| `verify_v7.mjs` | **83/83** |
| `verify_v76.mjs` | **18/18** |
| `verify_v77.mjs` | **16/16** |
| `verify_v78.mjs` | **47/47**（v7.8.2 的 40 + P1 4 + P2 2 + **P3 1**） |
| `probe_dev_index.mjs` | **18/18** |

## 本轮证伪

| 断言 | 证伪动作 | 结果 |
|---|---|---|
| **P3-A**（Escape 单点） | 偷偷加回一个 document 级 Esc 处理器 | **P3-A 与 P2-A 同时红**（45/47：`doc-keydown=4 含 Esc=2`；注册序 8→9 条）→ 还原回 47/47、指纹复原 |
| **P2-B**（对外面 16 键） | 删掉任一模块的 `PHJ.<module>` 行（P2 阶段已验证） | 红 → 还原回绿 |

## 已知遗留（均属"刻意不做"或下一阶段）

- 模块间调用**仍走同一 IIFE 作用域**：`PHJ.*` 是**显式对外面**（文档 + 闸门校验），不是调用通道；
  改成"调用点统一走 `PHJ.x.y()`"收益低、风险高（涉及数百处），**不做**
- `resolveOrder()` 仍不接管顺序（`deps` 是运行期依赖；顺序由 `SLICES` 显式给出并被 P2-A 守门）
- `editor/complete`（519 行）仍是最大的单模块（54 个顶层名）——若将来要拆，建议按「触发/评分/气泡 UI/槽位/资产」切

## 自检

```bash
node dev/build.mjs                              # 期望：PHJ.html 234243 B
node dev/_build/run-gate.mjs                    # 期望：7/7 全绿（83/18/16/47/18），退出码 0
node dev/_build/diag/probe_dev_index.mjs        # 开发态 18/18（需先起 headless 浏览器）
```
