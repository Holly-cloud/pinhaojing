# 重构前基线指纹 · PHJ.html v7.7（2026-09-13）

来源：外部专家《重构交接包_2026-09-13》P0 布网第 1 步（09 §3.1）
记入时间：2026-09-13 16:05 CST ｜ 记录者：小汐

| 项 | 值 |
|---|---|
| 文件 | `PHJ.html`（项目根，双击即用的单文件交付物） |
| 版本 | v7.7（文本编辑器「台词区」豁免） |
| **bytes** | **155224** |
| **sha256** | **0de0d27fa5b8c9cf7b5091eb03e9a50a15dfec573d8f1dc08c42dca010d17bcc** |
| 行尾 | CRLF ×2705，纯 LF 0（Windows 行尾） |
| 末行 | `</html>`，**文件结尾无换行符**（最后一字符 `>`） |
| 行数 | 2706 行（`wc -l` 报 2705 —— 它是换行符计数） |
| 快照 | `dev/_build/snapshots/PHJ_v7.7_baseline.html`（同一字节内容，等价性闸门的比对基准） |
| git 基线提交 | 见 `git log` 首条 `chore: 重构前基线 v7.7（单文件形态）` |

## 施工对账用（指导书第 8/9 节）

| 项 | 值 |
|---|---|
| 构建产物预期 | **155315 B** = 155224 + banner 89 B + banner 行 CRLF 2 B |
| CSS 切分 | 7 片 / **316 行**（原块第 8–323 行；`<style>` 在 7 行，`</style>` 在 324 行） |
| JS 切分 | 16 片 / **2285 行**（原块第 419–2703 行；`<script>` 在 418 行，`</script>` 在 2704 行） |
| 回归闸门 | `verify_v7.mjs` **85/85** ｜ `verify_v76.mjs` **F 组 18/18** ｜ `verify_v77.mjs` **G 组 16/16** |
| ⚠️ 参考实现修正 | 指导书第 8/9 节原版各有一处字符级 bug，见 `_build/_recon_20260913/README.md`；修正版在同目录 |

## 自检

```bash
node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('PHJ.html');console.log('bytes',b.length);console.log('sha256',c.createHash('sha256').update(b).digest('hex'))"
# 期望：bytes 155224 ／ sha256 0de0d27fa5b8c9cf7b5091eb03e9a50a15dfec573d8f1dc08c42dca010d17bcc
```
