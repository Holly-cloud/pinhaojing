/* 诊断：headless 环境下 prefers-reduced-motion 实际取值
   用法：先起 headless Edge（--remote-debugging-port=9222），再 node probe_reduced_motion.mjs
   背景：verify_v7 的 B/C 组 11 项动效断言在本机全红，疑因 headless 默认 reduce → 所有
        transition/animation 被 @media (prefers-reduced-motion: reduce) 关成 none。
   —— 保留为「环境体检探针」：动效断言异常时，用它快速确认环境媒体特性取值。
      （verify_v7 已在 CDP 会话层自动钉桩 no-preference；正常经 run-gate 跑无需此探针。）
      端口可用环境变量 PHJ_BROWSER_PORT 覆盖，缺省 9222。
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PHJ_BROWSER_PORT || '9222';
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome-extension://'));
if (!page) { console.error('未找到 page 目标'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../../PHJ.html').replace(/\\/g, '/'));
await send('Page.navigate', { url: TARGET });
await new Promise(r => setTimeout(r, 2500));

const evalJS = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'ERR: ' + r.result.exceptionDetails.text;
  return r.result?.result?.value;
};

console.log('=== 环境探测（' + TARGET.replace(/^file:\/\/\//, '').slice(-30) + '）===');
console.log('prefers-reduced-motion: reduce      =', await evalJS("matchMedia('(prefers-reduced-motion: reduce)').matches"));
console.log('prefers-reduced-motion: no-preference =', await evalJS("matchMedia('(prefers-reduced-motion: no-preference)').matches"));
console.log('document.visibilityState            =', await evalJS('document.visibilityState'));
console.log('document.hidden                     =', await evalJS('document.hidden'));
console.log('UA                                  =', await evalJS('navigator.userAgent'));
console.log('--- 取一条动效规则的解析结果 ---');
console.log('90-effects 是否含 reduce 兜底       =', await evalJS(`(()=>{for(const s of document.styleSheets){try{const t=[...s.cssRules].map(r=>r.cssText).join('\\n');if(/prefers-reduced-motion/.test(t))return t.match(/@media[^{]*prefers-reduced-motion[^{]*\\{[\\s\\S]{0,160}/)?.[0]||'含 reduce 但正则未取到';}catch(e){}}return '未找到';})()`));
console.log('--- 实测一个动画元素 ---');
console.log('probe animate 一帧             =', await evalJS(`(()=>{const d=document.createElement('div');d.style.cssText='animation:breatheK 2s infinite';document.body.appendChild(d);const n=getComputedStyle(d).animationName;const p=getComputedStyle(d).animationPlayState;d.remove();return 'animationName='+n+' playState='+p;})()`));
ws.close();
