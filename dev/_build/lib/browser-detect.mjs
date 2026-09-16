/* 浏览器探测共享模块（零依赖）
   ---------------------------------------------------------------------------
   被 run-gate.mjs 与 diag/spike_emulate_media.mjs 复用，避免各自硬编码浏览器绝对路径。

   语义：
     - browserCandidates()：返回按优先级排序的候选可执行文件路径（**按平台**列候选：
         · win32  → Edge(x86/64) → Chrome，三个已知根（ProgramFiles(x86)/ProgramFiles/LOCALAPPDATA）
         · darwin → Edge / Chrome / Chromium 的 .app 内可执行文件
         · linux  → microsoft-edge(-stable) / google-chrome(-stable) / chromium(-browser) / snap
       —— 换机（尤其跨平台）时若自动探测不到，**用 PHJ_BROWSER 显式指定**即可。）
     - detectBrowser()    ：返回 { exe, pinned, pinnedPath }。
         · 未设 PHJ_BROWSER → 自动探测候选，命中即返回 { exe, pinned:false }。
         · 设了 PHJ_BROWSER → 「硬覆盖」语义：**只认它**；可用则 { exe, pinned:true }，
           不可用则 { exe:null, pinned:true, pinnedPath }——绝不静默回落到自动探测。
           （显式钉住环境即用以它为准；系统若偷偷换一个浏览器，正是「在我机器上能跑」的温床。）
   —— 2026-09-16（交接检查）：补 darwin/linux 候选，此前仅 Windows，换到 macOS/Linux 需靠 PHJ_BROWSER 兜底。
*/
import fs from 'node:fs';
import path from 'node:path';

const EDGE_REL = ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
const CHROME_REL = ['Google', 'Chrome', 'Application', 'chrome.exe'];

export function browserCandidates() {
  const list = [];
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles'], process.env['LOCALAPPDATA']];
    for (const rel of [EDGE_REL, CHROME_REL]) {
      for (const r of roots) if (r) list.push(path.join(r, ...rel));
    }
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    list.push(
      '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
      '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
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
