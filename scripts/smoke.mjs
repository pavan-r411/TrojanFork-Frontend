import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { getOptions } from '../menu.js';
import { validatePlan } from '../api.js';
import { daily, log, remove } from '../nutrition-mock.js';

assert.equal(getOptions('campus','Lunch',{},{}).length,0);
assert.throws(()=>validatePlan({}),/invalid plan/);
let connected=false;
let unavailable=false;
let liveMode=false;
let livePlanCalls=0;
let lastGenerate;
const plans=new Map();
function backendPlan(body) {
  return {
    plan_id:`test_${body.mode}`, mode:body.mode, date:body.date, generated_at:new Date().toISOString(),
    summary:{total_cost_cents:null,remaining_budget_cents:body.mode==='off_campus'?2000:null,swipes_used:0,remaining_swipes:2,nutrition:{calories:null,protein_g:null,coverage:'insufficient_data'}},
    slots:['breakfast','lunch','dinner'].map(slot=>({slot,optional:false,locked:false,selected_recommendation_id:null,
      recommendations:body.profile.allergies.length?[]:[1,2].map(rank=>({id:`${slot}_${rank}`,rank,meal_title:`Backend ${slot} ${rank}`,item_ids:[],venue:{id:'test_venue',name:'Backend venue',type:body.mode==='usc_dining'?'dining_hall':'restaurant'},cuisine:null,image_url:null,dietary_tags:[],price_cents:null,payment_label:'Backend payment information',walking_meters:null,walking_minutes:null,nutrition:{calories:500,protein_g:30,carbs_g:55,fat_g:18,serving_size:'1 bowl',status:'estimated'},allergen_information_status:'unknown',source:{url:'https://example.com/menu',menu_date:body.date,verified_at:null,status:'needs_verification'},reason:'Explanation from the backend.'}))})),warnings:[],
  };
}
const root=path.resolve('.');
const server=http.createServer(async(req,res)=>{
  try {
    res.setHeader('Cache-Control','no-store');
    if(req.url==='/config.js') { res.setHeader('Content-Type','text/javascript');res.end(`export const config={apiBaseUrl:${JSON.stringify(connected?'/backend':'')},timeoutMs:12000,liveMode:${liveMode},browserNutrition:${liveMode}}`);return; }
    if(req.url.startsWith('/backend/')) {
      res.setHeader('Content-Type','application/json');
      if(unavailable) {res.writeHead(503);res.end(JSON.stringify({error:{code:'API_UNAVAILABLE',message:'Backend is offline',retryable:true}}));return;}
      if(req.url.includes('/nutrition/daily')) {res.end(JSON.stringify(daily(new URL(req.url,'http://test').searchParams.get('date'))));return;}
      if(req.method==='DELETE') {res.end(JSON.stringify(remove(new URL(req.url,'http://test').searchParams.get('date'),decodeURIComponent(req.url.split('/').pop().split('?')[0]))));return;}
      let raw='';for await(const chunk of req) raw+=chunk;
      const body=JSON.parse(raw);
      if(req.url.endsWith('/meals/log')) {const item=[...plans.values()].flatMap(p=>p.slots.flatMap(s=>s.recommendations)).find(x=>x.id===body.recommendation_id);res.end(JSON.stringify(log(body,item)));return;}
      if(req.url.endsWith('/v1/live/plan')) {livePlanCalls++;res.end(JSON.stringify(backendPlan(body)));return;}
      if(req.url.endsWith('/generate')) {lastGenerate=body;const plan=backendPlan(body);plans.set(plan.plan_id,plan);res.end(JSON.stringify(plan));return;}
      if(req.url.endsWith('/swap')) {const plan=structuredClone(body.plan_state);const slot=plan.slots.find(x=>x.slot===body.slot);slot.selected_recommendation_id=body.selected_recommendation_id;for(const entry of plan.slots)entry.locked=body.locked_meal_ids.includes(entry.selected_recommendation_id);res.end(JSON.stringify(plan));return;}
    }
    const file=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1) || 'index.html');
    if(!file.startsWith(root+path.sep)) throw new Error();
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await fs.readFile(file));
  }catch {res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'trojanplate-smoke-'));
const chrome=spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--user-data-dir=${temp}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore','ignore','pipe']});
let ws;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);
    chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    chrome.on('error',reject);
  });
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let seq=0;const pending=new Map();
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const entry=pending.get(data.id);pending.delete(data.id);data.error?entry.reject(new Error(data.error.message)):entry.resolve(data.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await send('Target.createTarget',{url:`http://127.0.0.1:${server.address().port}/`});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector(".empty"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelectorAll("#app [data-action=pick]").length'),0);
  assert.equal(await evaluate('document.querySelector(".empty").textContent.includes("Waiting for the meal service")'),true);
  connected=true;
  await send('Page.reload',{},sessionId);
  const ready=async()=>{for(let i=0;i<100;i++){if(await evaluate('Boolean(document.querySelector("#app [data-action=pick]"))'))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Backend results did not render');};
  await ready();
  assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'),2);
  await evaluate('document.querySelector("[data-action=cuisines]").click()');
  assert.equal(await evaluate('document.activeElement.id'), 'cuisines');
  assert.equal(await evaluate('document.querySelector("#context .field input").id'), 'cuisines');
  await evaluate('document.querySelector(".bottom-nav [data-action=home]").click()');
  assert.equal(await evaluate('document.querySelector("[data-carousel]").querySelectorAll(".meal-card").length'),1);
  const firstCard=await evaluate('document.querySelector(".meal-card h3").textContent');
  await evaluate('document.querySelector(".meal-carousel-nav button:last-child").click()');
  assert.notEqual(await evaluate('document.querySelector(".meal-card h3").textContent'),firstCard);
  await evaluate('document.querySelector(".meal-carousel-nav button:first-child").click()');
  assert.equal(await evaluate('document.querySelector(".meal-card h3").textContent'),firstCard);
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector("[data-action=log]:not(:disabled)"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),0);
  await evaluate('document.querySelector("[data-action=log]").click();document.querySelector("[data-action=log]").click()');
  for(let i=0;i<80;i++){if(await evaluate('document.querySelector(".nutrition-stats > div:first-child strong")?.textContent==="500"'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelector(".nutrition-stats").textContent.includes("500")'),true);
  await evaluate('document.querySelector("[data-action=plan]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".nutrition-log").length'),1);
  await evaluate('document.querySelector("[data-action=unlog]").click()');
  for(let i=0;i<80;i++){if(await evaluate('!document.querySelector(".nutrition-log")'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelectorAll(".nutrition-log").length'),0);
  await evaluate('document.querySelector(".bottom-nav [data-action=home]").click()');
  await evaluate('document.querySelector("[data-action=pick]").click()');
  await ready();
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),1);
  await evaluate('document.querySelector("[data-action=lock]").click();document.querySelector("[data-mode=nearby]").click()');
  await ready();
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),0);
  await evaluate('document.querySelector("[data-action=pick]").click()');
  await ready();
  await evaluate('document.querySelector("[data-mode=campus]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),1);
  assert.equal(await evaluate('document.querySelector(".meal-card.selected [data-action=pick]").disabled'),true);
  await evaluate('document.querySelector("[data-action=plan]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),1);
  await evaluate('document.querySelector(".bottom-nav [data-action=home]").click();document.querySelector("[data-action=details]").click()');
  assert.equal(await evaluate('document.querySelector("dialog").open'),true);
  await evaluate('document.querySelector("[data-action=close]").click()');
  for(const width of [320,375,390,768,1024,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,`Overflow at ${width}`);
  }
  for(const width of [390,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sessionId);
    await evaluate('window.scrollTo(0,0)');
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(os.tmpdir(),`trojanplate-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await send('Page.reload',{},sessionId);
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector(".meal-card.selected"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelector(".meal-card.selected [data-action=pick]").disabled'),true);
  await evaluate('document.querySelector("[data-action=edit]").click();document.querySelector("#onboarding").requestSubmit();document.querySelector("#allergies").value="peanuts";document.querySelector("#onboarding").requestSubmit();document.querySelector("#onboarding").requestSubmit();document.querySelector("#onboarding").requestSubmit()');
  for(let i=0;i<80;i++){if(lastGenerate?.profile.allergies.includes('peanuts') && await evaluate('Boolean(document.querySelector(".empty"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(lastGenerate.profile.allergies[0],'peanuts');
  assert.equal(await evaluate('document.querySelectorAll("#app [data-action=pick]").length'),0);
  unavailable=true;
  await evaluate('document.querySelector("[data-action=refresh]").click()');
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector("[role=alert]"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelector("[role=alert]").textContent.includes("Backend is offline")'),true);
  assert.equal(await evaluate('document.querySelectorAll("#app [data-action=pick]").length'),0);
  liveMode=true;unavailable=false;
  await evaluate('localStorage.clear();sessionStorage.clear()');
  await send('Page.reload',{},sessionId);await ready();
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector("[data-action=log]:not(:disabled)"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(livePlanCalls,1);
  await evaluate('document.querySelector("[data-action=pick]").click()');
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector(".meal-card.selected"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelectorAll(".meal-card.selected").length'),1);
  for(let i=0;i<80;i++){if(await evaluate('Boolean(document.querySelector(".meal-card.selected [data-action=log]:not(:disabled)"))'))break;await new Promise(r=>setTimeout(r,100));}
  await evaluate('document.querySelector(".meal-card.selected [data-action=log]").click()');
  for(let i=0;i<80;i++){if(await evaluate('document.querySelector(".nutrition-stats > div:first-child strong")?.textContent==="500"'))break;await new Promise(r=>setTimeout(r,100));}
  await evaluate('document.querySelector("[data-mode=nearby]").click()');await ready();
  assert.equal(livePlanCalls,2);
  assert.equal(await evaluate('document.querySelector(".nutrition-stats").textContent.includes("500")'),true);
  await evaluate('document.querySelector("[data-action=plan]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".nutrition-log").length'),1);
  await evaluate('document.querySelector("#nutrition-targets input[name=calories]").value="2200";document.querySelector("#nutrition-targets input[name=protein_g]").value="130";document.querySelector("#nutrition-targets").requestSubmit()');
  for(let i=0;i<80;i++){if(await evaluate('document.querySelector(".nutrition-stats").textContent.includes("2,200")'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelector(".nutrition-stats").textContent.includes("2,200")'),true);
  await evaluate('document.querySelector("[data-action=unlog]").click()');
  for(let i=0;i<80;i++){if(await evaluate('!document.querySelector(".nutrition-log")'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('document.querySelectorAll(".nutrition-log").length'),0);
  for(const width of [320,390,768,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sessionId);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Live dashboard overflow at ${width}`);
  }
  for(const width of [390,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},sessionId);
    await evaluate('window.scrollTo(0,0)');
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(os.tmpdir(),`trojanplate-live-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  console.log('PASS: live API connection, session tracking across tabs, manual targets, logging and undo; legacy regressions.');
  console.log('PASS: unconfigured state, backend generate/swap, mode caches, locks, details, backend empty/error states, profile payload, API validation, and overflow at 320–1440px.');
} finally {
  ws?.close();chrome.kill();server.close();
}
