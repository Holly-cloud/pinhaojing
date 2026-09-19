#!/usr/bin/env node
/* 临时诊断 v2（用后即删）：聚焦「块高/间距在首建 vs 重开后是否一致」 */
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
async function waitForCDP(port, t){ const dl=Date.now()+t; while(Date.now()<dl){ try{ const r=await fetch(`http://127.0.0.1:${port}/json/version`); if(r.ok) return await r.json(); }catch{} await sleep(250);} return null; }
function killTree(pid){ if(!pid) return; if(process.platform==='win32'){ try{ spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{stdio:'ignore'}); return;}catch{} } try{process.kill(pid,'SIGKILL');}catch{} }

const det = detectBrowser(); if(!det.exe){ console.error('no browser'); process.exit(10); }
let port = 9278; while(!(await isPortFree(port))) port++;
const prof = fs.mkdtempSync(path.join(os.tmpdir(),'phj_d2_'));
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
  async function type(t){ await send('Input.insertText',{text:t}); await sleep(160); }
  async function waitReady(){ for(let i=0;i<50;i++){ if(await ev('document.readyState==="complete"')) return; await sleep(200);} }
  async function clickSel(sel){ const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e)return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()`); await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y}); await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1}); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1}); await sleep(150); }

  await send('Page.enable'); await send('Runtime.enable');
  const clearId=(await send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear();}catch(e){}'})).identifier;
  await send('Page.navigate',{url:TARGET}); await waitReady();
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,mobile:false,deviceScaleFactor:1});
  await send('Page.reload'); await waitReady(); await sleep(500);

  /* 采集画布块几何 + 视觉间距（需在画布视图） */
  const GAP=`(() => {
    var bs = state.blocks.map(function(b){
      var el = document.querySelector('.block[data-id="'+b.id+'"]');
      var ta = el ? el.querySelector('.block-text') : null;
      var r = el ? el.getBoundingClientRect() : null;
      return { id:b.id, y:b.y, order:b.order, inlineH: ta?ta.style.height:null, scrollH: ta?ta.scrollHeight:null, rectTop:r?Math.round(r.top):null, rectH:r?Math.round(r.height):null };
    });
    var gaps=[]; for(var i=1;i<bs.length;i++){ if(bs[i].rectTop!=null&&bs[i-1].rectTop!=null) gaps.push(Math.round((bs[i].rectTop-(bs[i-1].rectTop+bs[i-1].rectH))*10)/10); }
    return { blocks:bs, visualGaps:gaps };
  })()`;

  // 建立 1/4/8 行三种块（真流程：写作台新建+输入）
  await ev("setView('write')"); await sleep(300);
  await ev("state.blocks=[]; renderWrite(); saveNow();");
  const texts = ['单行块', '第二块第一行\n第二块第二行\n第二块第三行\n第二块第四行', '第三块\nL2\nL3\nL4\nL5\nL6\nL7\nL8'];
  for (const tx of texts){
    await ev("wdNew()");
    await ev("focusDeskEditor()");
    await type(tx);
    await sleep(80);
  }
  await ev("flush()"); await sleep(400);
  await ev("setView('canvas')"); await sleep(400);
  const A = await ev(GAP);
  console.log('=== 首建（画布视图）===');
  console.log(JSON.stringify(A,null,1));

  // 重开
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clearId});
  await send('Page.reload'); await waitReady();
  // 立刻量（autoSizeAll 刚跑完的状态）
  await ev("setView('canvas')");
  const B0 = await ev(GAP);
  console.log('\n=== 重开后（切画布后立刻量）===');
  console.log(JSON.stringify(B0,null,1));

  // 再等 1.5s 后量（是否被后续布局修正）
  await sleep(1500);
  const B1 = await ev(GAP);
  console.log('\n=== 重开后（等 1.5s）===');
  console.log(JSON.stringify(B1,null,1));

  // 手动再跑一次 autoSizeAll，看高度是否被改
  await ev("autoSizeAll()"); await sleep(200);
  const B2 = await ev(GAP);
  console.log('\n=== 重开后 + 手动 autoSizeAll() 一次 ===');
  console.log(JSON.stringify(B2,null,1));

  // 打印落盘的块（x/y/order）
  const ls = await ev("JSON.parse(localStorage.getItem(LS_KEY)).blocks.map(function(b){return {id:b.id,x:b.x,y:b.y,order:b.order};})");
  console.log('\n=== LS 落盘 ===');
  console.log(JSON.stringify(ls));

  ws.close();
} catch(e){ console.error('异常：'+(e&&e.stack?e.stack:e)); }
finally{ killTree(proc.pid); await sleep(400); try{ fs.rmSync(prof,{recursive:true,force:true}); }catch{} }
