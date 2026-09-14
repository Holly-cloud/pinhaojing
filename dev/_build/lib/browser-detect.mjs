/* 浏览器探测共享模块（零依赖）
   ---------------------------------------------------------------------------
   被 run-gate.mjs 与 diag/spike_emulate_media.mjs 复用，避免各自硬编码浏览器绝对路径。

   语义：
     - browserCandidates()：返回按优先级排序的候选 exe 路径（Edge x86 → Edge → Chrome，三个已知根）。
     - detectBrowser()    ：返回 { exe, pinned, pinnedPath }。
         · 未设 PHJ_BROWSER → 自动探测候选，命中即返回 { exe, pinned:false }。
         · 设了 PHJ_BROWSER → 「硬覆盖」语义：**只认它**；可用则 { exe, pinned:true }，
           不可用则 { exe:null, pinned:true, pinnedPath }——绝不静默回落到自动探测。
           （显式钉住环境即用以它为准；系统若偷偷换一个浏览器，正是「在我机器上能跑」的温床。）
*/
import fs from 'node:fs';
import path from 'node:path';

const EDGE_REL = ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
const CHROME_REL = ['Google', 'Chrome', 'Application', 'chrome.exe'];

export function browserCandidates() {
  const roots = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles'], process.env['LOCALAPPDATA']];
  const list = [];
  for (const rel of [EDGE_REL, CHROME_REL]) {
    for (const r of roots) if (r) list.push(path.join(r, ...rel));
  }
  return [...new Set(list)];
}

function isUsableFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

export function detectBrowser() {
  const pinned = (process.env.PHJ_BROWSER || '').trim();
  if (pinned) {
    if (isUsableFile(pinned)) return { exe: pinned, pinned: true };
    return { exe: null, pinned: true, pinnedPath: pinned };
  }
  for (const c of browserCandidates()) {
    if (isUsableFile(c)) return { exe: c, pinned: false };
  }
  return { exe: null, pinned: false };
}
