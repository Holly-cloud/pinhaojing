#!/usr/bin/env node
/* 临时诊断 v5（用后即删）：在 autoSizeAll 调用瞬间记录 canvas 的 computed display / body class + scrollHeight */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBrowser } from '../lib/browser-detect.mjs';
import { buildTestArtifact } from '../lib/test-artifact.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isPortFree(port){ return new Promise((res)=>{ const s=new net.createServer(); let d=false; const f=(v)=>{if(!d){d=true;res(v);}}; s.once('error',()=>f(false)); s.once('listening',()=>s.close(()=>f(true))); try{s.listen(port,'127.0.0.1');}catch{f(false);} }); }
async function waitForCDP(port,t){ const dl=Date.now()+t; while(Date.now()<dl){ try{ const r=await fetch(`http://127.0.0.1:${port}/json/version`); if(r.ok) return await r.json(); }catch{} await sleep(250);} return null; }
function killTree(pid){ if(!pid) return; if(process.platform==='win32'){ try{ spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{stdio:'ignore'}); return;}catch{} } try{process.kill(pid,'SIGKILL');}catch{} }

const det = detectBrowser(); if(!det.exe){ console.error('no browser'); process.exit(10); }
let port = 9281; while(!(await isPortFree(port))) port++;
const prof = fs.mkdtempSync(path.join(os.tmpdir(),'phj_d5_'));
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

  await send('Page.enable'); await send('Runtime.enable');
  const clearId=(await send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear();}catch(e){}'})).identifier;
  await send('Page.navigate',{url:TARGET}); await waitReady();
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,mobile:false,deviceScaleFactor:1});
  await send('Page.reload'); await waitReady(); await sleep(400);

  // 种子：2 个块（一个多行）
  await ev("setView('write')"); await sleep(250);
  await ev("state.blocks=[{id:'a',text:'一',x:20,y:20,order:0},{id:'b',text:'一\\n二\\n三\\n四\\n五\\n六',x:20,y:170,order:1}]; renderWrite(); saveNow();");
  await ev("setView('canvas')"); await sleep(300);

  // 猴子补丁：记录 autoSizeAll 被调用瞬间的 环境（canvas display / body class / 首个 scrollHeight）
  const patch = await ev(`(() => {
    window.__probe = [];
    var _o = autoSizeAll;
    autoSizeAll = function(){
      var c = document.getElementById('canvas');
      var t = document.querySelector('.block-text');
      window.__probe.push({ bodyClass: document.body.className, canvasDisplay: getComputedStyle(c).display,
                            firstScrollH: t?t.scrollHeight:null });
      return _o.apply(this, arguments);
    };
    return true;
  })()`);
  console.log('patch ok = ' + patch);

  // 触发两条路径
  await ev("setView('write')"); await sleep(250);
  await ev("autoSizeAll===undefined?null:0"); // noop
  await ev("__probe=[]; setView('canvas');");
  await sleep(300);
  const p1 = await ev("__probe");
  console.log('\n[setView(\'canvas\') 触发的 autoSizeAll 调用点] ' + JSON.stringify(p1));

  await ev("__probe=[];");
  await ev("document.body.className"); // ensure canvas visible now
  await ev("render()");   // 可见下重渲染
  await sleep(300);
  const p2 = await ev("__probe");
  console.log('\n[render() at 可见态 触发的 autoSizeAll 调用点] ' + JSON.stringify(p2));

  // 记录 render 时 body class（人为记录 setView 内部顺序无关，仅佐证）
  console.log('\n[佐证] setView 内部次序：activeView=v → render() → applyView()（write.js）；applyView 才切 body 类');
  console.log('[佐证] 当前 body class = ' + await ev("document.body.className") + ' / canvas display = ' + await ev("getComputedStyle(document.getElementById('canvas')).display"));

  ws.close();
} catch(e){ console.error('异常：'+(e&&e.stack?e.stack:e)); }
finally{ killTree(proc.pid); await sleep(400); try{ fs.rmSync(prof,{recursive:true,force:true}); }catch{} }
