#!/usr/bin/env node
/* 临时诊断 v4（用后即删）：①「正确高度」渲染下的间距 ② 整（arrangeAll）后 reopen 的间距 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowser } from '../lib/browser-detect.mjs';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isPortFree(port){ return new Promise((res)=>{ const s=new net.createServer(); let d=false; const f=(v)=>{if(!d){d=true;res(v);}}; s.once('error',()=>f(false)); s.once('listening',()=>s.close(()=>f(true))); try{s.listen(port,'127.0.0.1');}catch{f(false);} }); }
async function waitForCDP(port,t){ const dl=Date.now()+t; while(Date.now()<dl){ try{ const r=await fetch(`http://127.0.0.1:${port}/json/version`); if(r.ok) return await r.json(); }catch{} await sleep(250);} return null; }
function killTree(pid){ if(!pid) return; if(process.platform==='win32'){ try{ spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{stdio:'ignore'}); return;}catch{} } try{process.kill(pid,'SIGKILL');}catch{} }

const det = detectBrowser(); if(!det.exe){ console.error('no browser'); process.exit(10); }
let port = 9280; while(!(await isPortFree(port))) port++;
const prof = fs.mkdtempSync(path.join(os.tmpdir(),'phj_d4_'));
const proc = spawn(det.exe,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});

try{
  const ver = await waitForCDP(port,25000); if(!ver){ console.error('CDP timeout'); process.exit(12); }
  const TEST = buildTestArtifact();
  const TARGET = 'file:///' + encodeURI(TEST.path.replace(/\\/g,'/'));
  const list = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page = list.find(t=>t.type==='page'&&!t.url.startsWith('edge://'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=()=>rej(new Error('ws')); });
  let id=0; const pend=new Map();
  ws.onmessage=(e)=>{ const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);} };
  const send=(method,params={})=>new Promise((res)=>{ const i=++id; pend.set(i,(r)=>res(r.result||r.error)); ws.send(JSON.stringify({id:i,method,params})); });
  async function ev(expr){ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error('EVAL '+JSON.stringify(r.exceptionDetails).slice(0,300)); return r.result&&r.result.value; }
  async function waitReady(){ for(let i=0;i<50;i++){ if(await ev('document.readyState==="complete"')) return; await sleep(200);} }
  async function shot(name){ const r=await send('Page.captureScreenshot',{format:'png'}); if(r&&r.data){ fs.writeFileSync(path.join(HERE,name), Buffer.from(r.data,'base64')); console.log('  [shot] '+name); } }

  await send('Page.enable'); await send('Runtime.enable');
  const clearId=(await send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear();}catch(e){}'})).identifier;
  await send('Page.navigate',{url:TARGET}); await waitReady();
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,mobile:false,deviceScaleFactor:1});
  await send('Page.reload'); await waitReady(); await sleep(400);

  const MEASURE=`(() => {
    var bs = state.blocks.map(function(b){
      var el = document.querySelector('.block[data-id="'+b.id+'"]');
      var ta = el ? el.querySelector('.block-text') : null;
      var r = el ? el.getBoundingClientRect() : null;
      return { y:b.y, inlineH: ta?ta.style.height:null, scrollH: ta?ta.scrollHeight:null, cardH: r?Math.round(r.height):null, cardTop:r?Math.round(r.top):null };
    });
    var gaps=[]; for(var i=1;i<bs.length;i++) if(bs[i].cardTop&&bs[i-1].cardTop!=null) gaps.push(Math.round((bs[i].cardTop-(bs[i-1].cardTop+bs[i-1].cardH))*10)/10);
    return { blocks: bs, yDiffs: bs.slice(1).map(function(b,i){return Math.round(b.y-bs[i].y);}), gaps: gaps };
  })()`;

  // 4 块，内容长度差异大（模拟真实分镜长短不一）
  const texts = ['短', '中等\n二\n三\n四\n五', '很长\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12', '短2'];
  await ev("setView('write')"); await sleep(300);
  await ev("state.blocks=[]; renderWrite(); saveNow();");
  for(const tx of texts){ await ev("wdNew()"); await ev("focusDeskEditor()"); await send('Input.insertText',{text:tx}); await sleep(80); }
  await ev("flush()"); await sleep(400);

  console.log('=== A. 切到画布（render 在隐藏时执行）→ 「塌陷」状态 ===');
  await ev("setView('canvas')"); await sleep(400);
  console.log(JSON.stringify(await ev(MEASURE),null,1));

  console.log('\n=== B. 可见下重渲染（render()）→ 「真实高度」状态 ===');
  await ev("render()"); await sleep(400);
  console.log(JSON.stringify(await ev(MEASURE),null,1));
  await shot('_v4_b_visible_render.png');

  console.log('\n=== C. 点「整」arrangeAll（可见下按真实高度排布）===');
  { const r=await ev("(()=>{var e=document.getElementById('btnArrange'); var b=e.getBoundingClientRect(); return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()");
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});
    await sleep(1200); }
  console.log(JSON.stringify(await ev(MEASURE),null,1));
  await shot('_v4_c_arranged.png');
  console.log('[落盘 y] ' + JSON.stringify(await ev("JSON.parse(localStorage.getItem(LS_KEY)).blocks.map(function(b){return {y:Math.round(b.y)};})")));

  console.log('\n=== D. 重开 + 点「画布」→ 塌陷，但 y 已是 arrangeAll 的（间距是否不均？）===');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clearId});
  await send('Page.reload'); await waitReady(); await sleep(500);
  await ev("setView('canvas')"); await sleep(500);
  console.log(JSON.stringify(await ev(MEASURE),null,1));
  await shot('_v4_d_reopen_canvas.png');

  ws.close();
} catch(e){ console.error('异常：'+(e&&e.stack?e.stack:e)); }
finally{ killTree(proc.pid); await sleep(400); try{ fs.rmSync(prof,{recursive:true,force:true}); }catch{} }
