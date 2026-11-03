import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {startSite} from '../server.cjs';
import {openReviewBrowser,navigate,sizes,waitFor,key,tabTo,typeText,armDomEvent,finishDomEvent} from './support/browser-tools.mjs';
import {createFaultProxy} from './support/fault-proxy.mjs';
const {values}=parseArgs({options:{browser:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
if(values.help){console.log('Usage: node website/test/browser-regressions.mjs --browser /absolute/installed/chrome [--output /evidence/directory]');process.exit(0);}
if(!values.browser||!path.isAbsolute(values.browser))throw new Error('Pass --browser with an explicitly supplied installed Chrome executable. No browser is installed by this test.');
const output=values.output?path.resolve(values.output):await fs.mkdtemp(path.join(os.tmpdir(),'und-browser-regressions-'));
await fs.mkdir(output,{recursive:true});
const results=[];
async function scenario(name,run){
 const evidence={name,startedAt:new Date().toISOString()};let site,proxy,session;
 try{
  site=await startSite();proxy=await createFaultProxy({upstream:site.url,traceFile:path.join(output,name+'-http.json')});session=await openReviewBrowser(proxy.url,values.browser);
  await session.browser.send('Page.bringToFront');await run({b:session.browser,proxy,session,evidence});
  assert.deepEqual(session.blocked,[],'site must use local resources');assert.deepEqual(session.errors,[],'unexpected runtime error');evidence.result='pass';
 }catch(error){evidence.result='fail';evidence.error=error.stack;process.exitCode=1;}
 finally{if(session)await session.browser.close();if(proxy)await proxy.close();if(site)await site.close();evidence.network=session?.network;evidence.teardown='Owned browser/profile, forwarding proxy and server closed';results.push(evidence);await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(evidence,null,2)+'\n');}
 console.log(name+': '+evidence.result);
}
const ready=b=>waitFor(b,`document.getElementById('availability')?.textContent.includes('ready')`,'sample initialized');
const idle=b=>waitFor(b,`document.getElementById('playground').getAttribute('aria-busy')==='false'`,'operation completion',15000);
const snapshot=b=>b.evaluate(`fetch('/api/state').then(r=>r.json())`);
async function press(b,selector){await tabTo(b,selector,{limit:250});await key(b,'Enter');}
async function back(b){const history=await b.send('Page.getNavigationHistory');await b.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});await waitFor(b,`location.pathname==='/'&&document.readyState==='complete'`,'native Back');}

await scenario('native-back',async({b,proxy,evidence})=>{
 await navigate(b,proxy.url,sizes[0]);await ready(b);await b.evaluate(`addEventListener('pageshow',e=>window.__testPersisted=e.persisted)`);evidence.cycles=[];
 for(let i=0;i<3;i++){
  await press(b,'a[href="/docs/MIGRATION.md"]');await waitFor(b,`location.pathname==='/docs/MIGRATION.md'&&document.readyState==='complete'`,'documentation');await back(b);
  const persisted=await b.evaluate('window.__testPersisted');assert.equal(persisted,true,'Environment must exercise BFCache, not substitute a full reload');await ready(b);
  await typeText(b,'#document',JSON.stringify({id:'back-'+i,name:'First save after native Back'}));const before=proxy.trace.filter(x=>x.event==='forward'&&x.operation==='put').length;
  try{await press(b,'#save');}catch(error){if(!error.message.includes('navigated or closed'))throw error;evidence.unexpectedNavigation=error.message;}
  await waitFor(b,`document.readyState==='complete'&&!!document.getElementById('result')`,'page response');await idle(b);await new Promise(resolve=>setTimeout(resolve,250));
  const puts=proxy.trace.filter(x=>x.event==='forward'&&x.operation==='put').length-before;const actual=await snapshot(b);evidence.cycles.push({persisted,puts,state:actual.state});
  await b.screenshot(path.join(output,'native-back-'+i+'.png'));assert.equal(puts,1,'First Save after Back must issue exactly one operation');assert.equal(actual.state.writes.filter(x=>x.id==='back-'+i).length,1);
 }
 const history=await b.send('Page.getNavigationHistory');await b.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex+1].id});await waitFor(b,`location.pathname==='/docs/MIGRATION.md'`,'native Forward');await back(b);await ready(b);
 await typeText(b,'#document',JSON.stringify({id:'after-forward'}));await press(b,'#save');await idle(b);assert.equal((await snapshot(b)).state.writes.filter(x=>x.id==='after-forward').length,1);
});

await scenario('native-dialog-focus',async({b,proxy,evidence})=>{
 await navigate(b,proxy.url,sizes[2]);await ready(b);await b.send('Page.bringToFront');
 await tabTo(b,'#nav-toggle');assert.equal(await b.evaluate('document.hasFocus()'),true);await armDomEvent(b,'#navigation','shown.bs.drawer');await key(b,'Enter');await finishDomEvent(b);await b.settle();
 evidence.shown=await b.evaluate(`({focused:document.hasFocus(),tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),inside:document.getElementById('navigation').contains(document.activeElement),modal:document.getElementById('navigation').matches(':modal'),outline:getComputedStyle(document.activeElement).outline})`);
 await b.screenshot(path.join(output,'native-dialog-focus.png'));assert.equal(evidence.shown.focused,true);assert.equal(evidence.shown.modal,true);assert.equal(evidence.shown.inside,true,'shown native modal must receive focus immediately');
 await key(b,'Tab',{shift:true});assert.equal(await b.evaluate(`document.getElementById('navigation').contains(document.activeElement)`),true);
 // Revisit the original boundary: Shift-Tab from the first close control can
 // report BODY as activeElement, as reproduced with a plain native dialog.
 // The next Tab must return to the modal without reaching a background control.
 await key(b,'Tab',{shift:true});
 evidence.reverseBoundary=await b.evaluate(`({focused:document.hasFocus(),tag:document.activeElement.tagName,inside:document.getElementById('navigation').contains(document.activeElement),backgroundControl:!!document.activeElement.closest('main')})`);
 assert.equal(evidence.reverseBoundary.backgroundControl,false);
 assert.ok(evidence.reverseBoundary.inside || evidence.reverseBoundary.tag==='BODY','native boundary may have no DOM focus, never another application control');
 await key(b,'Tab');
 evidence.returnFromBoundary=await b.evaluate(`({inside:document.getElementById('navigation').contains(document.activeElement),label:document.activeElement.getAttribute('aria-label')})`);
 assert.equal(evidence.returnFromBoundary.inside,true);assert.equal(evidence.returnFromBoundary.label,'Close navigation');
 evidence.modalControls=[];
 for(const selector of ['#navigation [data-bs-dismiss="drawer"]',...['introduction','features','docs','playground','tutorial','examples'].map(id=>'#navigation a[href="#'+id+'"]')]){
  await tabTo(b,selector,{limit:30});const active=await b.evaluate(`({label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent,inside:document.getElementById('navigation').contains(document.activeElement),outline:getComputedStyle(document.activeElement).outline})`);assert.equal(active.inside,true);evidence.modalControls.push(active);
 }
 await armDomEvent(b,'#navigation','hidden.bs.drawer');await key(b,'Escape');await finishDomEvent(b);assert.equal(await b.evaluate('document.activeElement.id'),'nav-toggle');
 await tabTo(b,'#reset-open',{limit:250});await armDomEvent(b,'#reset-dialog','shown.bs.drawer');await key(b,'Enter');await finishDomEvent(b);assert.equal(await b.evaluate('document.activeElement.id'),'reset-cancel');
 await armDomEvent(b,'#reset-dialog','hidden.bs.drawer');await key(b,'Enter');await finishDomEvent(b);assert.equal(await b.evaluate('document.activeElement.id'),'reset-open');
 // Preserve painted reset controls at narrow width, not just activeElement.
 await navigate(b,proxy.url+'/#playground',sizes[3]);await ready(b);
 await tabTo(b,'#reset-open',{limit:250});await armDomEvent(b,'#reset-dialog','shown.bs.drawer');await key(b,'Enter');await finishDomEvent(b);await b.settle();
 evidence.narrowReset=await b.evaluate(`(() => {const d=document.getElementById('reset-dialog');return {modal:d.matches(':modal'),focus:document.activeElement.id,width:innerWidth,height:innerHeight,horizontal:d.scrollWidth>d.clientWidth||[...d.children].some(e=>e.scrollWidth>e.clientWidth),controls:['reset-confirm','reset-cancel'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right};})};})()`);
 await b.screenshot(path.join(output,'narrow-reset-focus.png'));assert.equal(evidence.narrowReset.focus,'reset-cancel');assert.equal(evidence.narrowReset.modal,true);assert.equal(evidence.narrowReset.horizontal,false);
 for(const r of evidence.narrowReset.controls){assert.ok(r.top>=0&&r.bottom<=evidence.narrowReset.height,'reset actions must paint within the viewport');assert.ok(r.left>=0&&r.right<=evidence.narrowReset.width);}
 await armDomEvent(b,'#reset-dialog','hidden.bs.drawer');await key(b,'Enter');await finishDomEvent(b);assert.equal(await b.evaluate('document.activeElement.id'),'reset-open');
});

await scenario('real-transport-loss',async({b,proxy,session,evidence})=>{
 await navigate(b,proxy.url+'/#playground',sizes[0]);await ready(b);
 await typeText(b,'#document',JSON.stringify({id:'zero-ack',name:'One native save'}));proxy.arm('put');const beforeLogical=session.network.filter(x=>x.event==='request'&&x.method==='POST').length;
 await press(b,'#save');const held=await proxy.waitHeld();assert.equal(held.body.result.rev,1);await proxy.drop();await idle(b);await new Promise(resolve=>setTimeout(resolve,250));
 const actual=await snapshot(b),forwards=proxy.trace.filter(x=>x.event==='forward'&&x.operation==='put');
 evidence.zeroByte={logicalPosts:session.network.filter(x=>x.event==='request'&&x.method==='POST').length-beforeLogical,forwards,firstCommit:held.body.result,actual:actual.state};
 assert.equal(evidence.zeroByte.logicalPosts,1,'one native action and logical request');assert.ok(forwards.length>=2,'Installed browser must exercise its observed transparent wire retry');assert.equal(actual.state.writes.length,1,'one intent must not publish a second revision');assert.equal(actual.state.writes[0].uid,held.body.result.uid);assert.ok(forwards[0].intent);assert.ok(forwards.every(x=>x.intent===forwards[0].intent));
 await b.screenshot(path.join(output,'zero-byte-ack.png'));
 await typeText(b,'#document',JSON.stringify({id:'body-ack',name:'Retain this draft'}));proxy.arm('put');await press(b,'#save');const bodyHeld=await proxy.waitHeld();await proxy.drop({afterFirstByte:true});
 await waitFor(b,`document.getElementById('error').textContent.includes('Unknown write outcome')`,'unknown actual incomplete response',15000);assert.match(await b.evaluate(`document.getElementById('document').value`),/Retain this draft/);
 await press(b,'#connect');await ready(b);await typeText(b,'#record-id','body-ack');await press(b,'#read');await idle(b);assert.equal(await b.evaluate(`JSON.parse(document.getElementById('result').textContent).uid`),bodyHeld.body.result.uid);
 evidence.partialBody={firstCommit:bodyHeld.body.result,state:(await snapshot(b)).state};await b.screenshot(path.join(output,'body-loss-reconciled.png'));
 proxy.arm('get');await press(b,'#read');await proxy.waitHeld();await armDomEvent(b,'#reset-dialog','shown.bs.drawer');await press(b,'#reset-open');await finishDomEvent(b);await armDomEvent(b,'#reset-dialog','hidden.bs.drawer');await press(b,'#reset-confirm');await finishDomEvent(b);await idle(b);
 proxy.release();await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await b.evaluate(`document.getElementById('result').textContent`),'null');assert.deepEqual(await b.evaluate(`JSON.parse(document.getElementById('ids').textContent)`),[]);evidence.oldReadAfterReset='discarded';
 // Disposal remains final for the old mount, even if a real response arrives later.
 await typeText(b,'#document',JSON.stringify({id:'dispose-read'}));await press(b,'#save');await idle(b);proxy.arm('get');await press(b,'#read');await proxy.waitHeld();await b.evaluate(`dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}))`);
 const disposedText=await b.evaluate(`document.getElementById('playground').textContent`);proxy.release();await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await b.evaluate(`document.getElementById('playground').textContent`),disposedText);evidence.syntheticTrueDisposalOldResponse='discarded (synthetic lifecycle event, real held HTTP response)';
});
await fs.writeFile(path.join(output,'results.json'),JSON.stringify({runtime:process.version,browser:values.browser,results:results.map(({network,...entry})=>entry)},null,2)+'\n');
console.log('Evidence: '+output);
