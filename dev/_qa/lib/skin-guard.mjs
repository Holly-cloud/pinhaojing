/* ============================================================================
   拼好镜 · 皮肤边界护栏（skin-guard）
   ----------------------------------------------------------------------------
   ★R3（2026-09-17）：把「引擎零领域语义」从**一句注释**升级为**可执行、可证伪**的棘轮。
   ★F1（2026-09-17 收尾）：R3-B 零容忍集补上**全部 `【…】` 完整标记串**——原先只查 ≥40 字长语料，
     短标记串此前仅被 R3-A 的**词元**层覆盖（同一内容两种粒度，见下）。

   本模块**纯 node、零依赖**，被验收套件 `verify_v78.mjs` 与 CLI 复用（无浏览器依赖）。

   采集口径：
     · harvestDomainTokens(skinSrcFiles)
         —— 从**皮肤源码的字符串字面量**里抽出「领域词元」（连续 CJK，长度 ≥ 2）。
         为什么只从字面量抽：皮肤层「只放内容」——语料 / 文案 / 默认值全都写在字符串字面量里
         （label / body / note）；标识符与机制在引擎侧，不该被算作「领域词元」。
     · harvestCorpusStrings(skinSrcFiles, minLen)
         —— 皮肤源码字面量里的**长语料字符串**（内容长度 ≥ minLen，默认 40）＝ 语料正文。
     · harvestMarkerStrings(skinSrcFiles)
         —— 皮肤源码字面量里的**全部 `【…】` 完整标记串**（含方括号，如 `【光影逻辑】` / `【@音色】`）。
         与 harvestDomainTokens 的关系：后者抽的是标记**括号内**的连续 CJK（如 `光影逻辑`），
         本函数抽的是**含括号的完整串**（如 `【光影逻辑】`）——二者是**互补**的两种粒度，不是同一集合。
     · listEngineFiles(srcRoot)
         —— 列出 `src/**` 下**非皮肤**的 JS 源（排除 `skin/**` 与生成物 `dev-bundle.js`）。
         这就是「引擎 + 外壳 + 视图 + 交互」的全部**源码文本**（生成物含全量语料，故必须排除）。

   两条断言口径（由 verify_v78 的 R3-A / R3-B 分别断言）：

     R3-A **棘轮**（harvestDomainTokens → 命中数 ≤ DOMAIN_HITS_GOLDEN）
       统计「皮肤词元中，出现在**非皮肤源码文本**里的**去重词元数**」，与冻结尾数比 ——
       **≤ 即通过**：词元迁移出引擎（命中减少）是进步，不惩罚；只有**新增泄漏**（命中增加）才红。
       为什么用棘轮而非「必须 = 0」：现存引擎里**刻意保留**了一批领域词元——
         · `editor/struct.js` 的 `STRUCT_MARKS`：`画面开始`/`画面结束`/`风格`/`硬性要求`/`【…】`/`镜头N`；
         · `editor/complete.js` 的 `CMPL_GROUP_HINT`：`风格包`/`硬性要求`/`起手式`/`结构件`/`镜头句`/`景别`/`运镜`/`台词`。
       它们是「符号契约」的必经之处（结构层/置顶评分按符号而非语义工作），不是待清债；
       棘轮把**当前水位冻结**，先堵住新增，把「往引擎里塞领域语义」这条路堵死。

     R3-B **零泄漏**（harvestCorpusStrings ∪ harvestMarkerStrings → 命中数 == 0）
       皮肤里的**长语料字符串**（字面量内容长度 ≥ 40 字）**以及全部 `【…】` 完整标记串**
       在非皮肤源码文本里**零命中**——语料正文（风格包 5 段 / 硬性要求 / 分组语料）与完整标记串
       **一个字都不许进引擎**。硬零容忍。
       不把**裸** `【`/`】` 纳入：引擎的 `HL_PAIRS` 括号对表与 `/^【(.+?)】/` 正则属**机制**，
       不是领域内容——只查**完整标记串**。

   证伪（可机器复现）：
     · 往 `editor/` 任一文件写一行**未出现过的**皮肤词元（如 `暖主体`）→ R3-A 命中数 +1 > golden → 必红；
     · 把一段**长语料字符串**原样粘进 `editor/` → R3-B 命中非空 → 必红；
     · 把一整个 `【…】` 标记串（如 `【光影逻辑】`）粘进 `editor/` → R3-B 命中非空 → 必红。

   R3-C **守卫自检**（采集非空 + 数量下限；由 verify_v78 断言，非本模块导出）
     若 `skin/` 被清空 / 大幅缩水，则 harvest* 返回空数组 → R3-A/R3-B **真空通过**（假绿）。
     故补一条「守卫自检」：词元数 ≥ 下限 **且** 长语料数 ≥ 下限；下限取**保守值**，
     只用于抓「被清空 / 大幅缩水」，**不贴实测值卡边**（实测 146 / 5，下限 50 / 3 = 留足余量）。
     这是项目规则「每个存在性断言都要问『内容清空后它还过吗』」的第 5 次应用。
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));   /* dev/_qa/lib */
const DEFAULT_SRC = path.resolve(HERE, '..', '..', 'src');    /* dev/src */

/* ── 递归收集目录下的 .js 文件（字典序，稳定） ── */
function walkJs(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* ── 字符串字面量扫描：`'…'` / `"…"` / `` `…` ``（单行、不含转义换行） ── */
const LITERAL_RE = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\\n]*)`/g;

/* ── 注释剥离（与 verify_v78 的 R1 同源口径）：块注释 + 整行 `//` 注释 ──
   R3-A 只在**引擎代码**（剥注释后）上做棘轮 —— 「领域语义」指代码里的语义，
   不以引擎自己的文档注释计入预算（R1 亦如此，保持一致）。R3-B 则用**原文**（更严）。 */
export function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** 抽一段源码里的全部字符串字面量内容。 */
function literals(src) {
  const out = [];
  for (const m of src.matchAll(LITERAL_RE)) {
    const inner = m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3]);
    out.push(inner == null ? '' : inner);
  }
  return out;
}

/** 皮肤文件列表（skin 目录下的全部 .js，字典序）。 */
export function listSkinFiles(srcRoot = DEFAULT_SRC) {
  return walkJs(path.join(srcRoot, 'skin')).sort();
}

/** 引擎（非皮肤）文件列表：`src/**` 排除 `skin/**` 与生成物 `dev-bundle.js`。 */
export function listEngineFiles(srcRoot = DEFAULT_SRC) {
  const out = [];
  for (const p of walkJs(srcRoot)) {
    const rel = path.relative(srcRoot, p).replace(/\\/g, '/');
    if (rel === 'skin' || rel.startsWith('skin/')) continue;   /* 皮肤层不算引擎 */
    if (rel === 'dev-bundle.js') continue;                     /* 生成物（含全量语料）——非源码 */
    out.push(p);
  }
  return out.sort();
}

/**
 * 从皮肤源码的**字符串字面量**里抽领域词元：连续 CJK（\u4e00-\u9fff）且长度 ≥ 2，去重 + 排序。
 * @param {string[]} skinSrcFiles 皮肤源码文件绝对路径
 * @returns {string[]} 领域词元（已排序、去重）
 */
export function harvestDomainTokens(skinSrcFiles) {
  const toks = new Set();
  for (const f of skinSrcFiles) {
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const inner of literals(s)) {
      for (const run of inner.matchAll(/[\u4e00-\u9fff]{2,}/g)) toks.add(run[0]);
    }
  }
  return [...toks].sort();
}

/**
 * 从皮肤源码里抽**长语料字符串**（字面量内容长度 ≥ minLen）——用于零泄漏断言。
 * @param {string[]} skinSrcFiles 皮肤源码文件绝对路径
 * @param {number} [minLen] 最短长度（默认 40）
 * @returns {string[]} 长语料字符串（原样，用于 includes 精确比对）
 */
export function harvestCorpusStrings(skinSrcFiles, minLen = 40) {
  const out = [];
  for (const f of skinSrcFiles) {
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const inner of literals(s)) {
      if (inner.length >= minLen) out.push(inner);
    }
  }
  return out;
}

/**
 * 从皮肤源码里抽**全部 `【…】` 完整标记串**（含方括号）——用于 R3-B 零泄漏。
 * 只从字符串字面量抽；正则 `【[^】]*】`（不跨 `】`，串内可含 `@`/空格等任意非 `】` 字符）。
 * 与 harvestDomainTokens 互补：后者抽括号**内**的 CJK，本函数抽**含括号的完整串**。
 * @param {string[]} skinSrcFiles 皮肤源码文件绝对路径
 * @returns {string[]} 完整标记串（已排序、去重）
 */
export function harvestMarkerStrings(skinSrcFiles) {
  const set = new Set();
  for (const f of skinSrcFiles) {
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const inner of literals(s)) {
      for (const m of inner.matchAll(/【[^】]*】/g)) set.add(m[0]);
    }
  }
  return [...set].sort();
}

/**
 * 计算当前源码树下的皮肤边界命中：R3-A 词元命中 + R3-B 零泄漏命中（长语料 ∪ 完整标记串）。
 * @param {string} [srcRoot] 源码根（默认 dev/src）
 * @returns {{skinFiles,engineFiles,tokens,leakTokens,hits,corpus,markers,r3bSet,corpusLeak}}
 */
export function scanDomainHits(srcRoot = DEFAULT_SRC) {
  const skinFiles = listSkinFiles(srcRoot);
  const engineFiles = listEngineFiles(srcRoot);
  const tokens = harvestDomainTokens(skinFiles);
  const engineRaw = engineFiles.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  const engineCode = stripComments(engineRaw);
  const leakTokens = tokens.filter((t) => engineCode.includes(t));          /* R3-A：引擎代码 */
  const corpus = harvestCorpusStrings(skinFiles, 40);
  const markers = harvestMarkerStrings(skinFiles);
  const r3bSet = [...new Set([...corpus, ...markers])];                     /* R3-B 检查集：长语料 ∪ 完整标记串 */
  const corpusLeak = r3bSet.filter((s) => engineRaw.includes(s));           /* R3-B：引擎原文，零容忍 */
  return { skinFiles, engineFiles, tokens, leakTokens, hits: leakTokens.length, corpus, markers, r3bSet, corpusLeak };
}

/* ════════════════════════════════════════════════════════════════════════════
   DOMAIN_HITS_GOLDEN —— R3-A 棘轮的**冻结尾数**
   ----------------------------------------------------------------------------
   由 `node dev/_qa/lib/skin-guard.mjs` 在当前源码树实测得到（见该 CLI 输出）。
   含义：皮肤词元出现在非皮肤源码文本里的**去重命中数**上限。
   · 命中 ≤ 本值 → 通过（迁移出引擎不惩罚）；
   · 命中 >  本值 → 必红（有领域语义新泄漏进引擎）。
   维护：**只减不增**。若确因机制需要新增一处领域符号契约，须在 BASELINE 里写明理由后上调。
   ════════════════════════════════════════════════════════════════════════════ */
export const DOMAIN_HITS_GOLDEN = 15;   /* ← CLI 实测（剥注释后）＝ 15，见 BASELINE_v7.14.md */

/* ── CLI：node dev/_qa/lib/skin-guard.mjs ── */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = scanDomainHits(DEFAULT_SRC);
  console.log('皮肤文件 ' + r.skinFiles.length + ' 个 / 引擎文件 ' + r.engineFiles.length + ' 个');
  console.log('领域词元（来自皮肤字面量）' + r.tokens.length + ' 个');
  console.log('R3-A 命中（非皮肤**引擎代码**·剥注释 里的皮肤词元）=' + r.hits + '  ≤ golden ' + DOMAIN_HITS_GOLDEN +
    ' → ' + (r.hits <= DOMAIN_HITS_GOLDEN ? 'PASS' : 'FAIL'));
  console.log('  泄漏词元：' + JSON.stringify(r.leakTokens));
  console.log('R3-B 长语料（≥40 字）' + r.corpus.length + ' 条 + 完整标记串 ' + r.markers.length +
    ' 个（检查集 ' + r.r3bSet.length + ' 条），非皮肤**原文**命中 =' + r.corpusLeak.length +
    ' → ' + (r.corpusLeak.length === 0 ? 'PASS' : 'FAIL'));
  console.log('  完整标记串：' + JSON.stringify(r.markers));
  if (r.corpusLeak.length) console.log('  泄漏首段：' + JSON.stringify(r.corpusLeak[0].slice(0, 40)));
  console.log('>>> DOMAIN_HITS_GOLDEN = ' + r.hits + '   （实测值，写回常量）');
}
