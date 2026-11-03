'use strict';
const test=require('node:test');
const {randomUUID}=require('node:crypto');
const {site,session,request,current,op,gate,tick,realStore,assert}=require('../../test/website-helpers.cjs');
const send=(s,cookie,key,method,args=[])=>request(s.url,'/api/operation',{method:'POST',cookie,headers:{'X-Und-Intent':key},body:{method,args}});

test('website intent: completed duplicate returns immutable original receipt without another write',async t=>{
 const s=await site(t),a=await session(s.url),key=randomUUID(),doc={id:'one',name:'Mira'};
 const first=await send(s,a.cookie,key,'put',[doc]);assert.equal(first.status,200);
 await send(s,a.cookie,randomUUID(),'put',[{id:'two'}]);
 const repeated=await send(s,a.cookie,key,'put',[doc]);assert.equal(repeated.status,first.status);assert.equal(repeated.text,first.text,'cached state must not grow with subsequent writes');
 assert.equal((await current(s.url,a.cookie)).writes.length,2);assert.equal((await op(s.url,a.cookie,'rev',['one'])).result,1);
 const next=await send(s,a.cookie,randomUUID(),'put',[doc]);assert.equal(next.json.result.rev,2,'a new explicit intent remains possible');
});

test('website intent: pending duplicates join one admitted operation and conflicting reuse rejects',async t=>{
 const entered=gate(),release=gate();let calls=0;t.after(()=>release.resolve());
 const s=await site(t,{createStore:()=>{const db=realStore();return {...db,async put(data){calls++;entered.resolve();await release.promise;return db.put(data);}};}}),a=await session(s.url),key=randomUUID(),doc={id:'pending'};
 const first=send(s,a.cookie,key,'put',[doc]);await entered.promise;
 const second=send(s,a.cookie,key,'put',[doc]);await tick();
 const conflict=await send(s,a.cookie,key,'put',[{id:'changed'}]);assert.equal(conflict.status,409);assert.equal(calls,1);
 release.resolve();const [left,right]=await Promise.all([first,second]);assert.equal(left.status,200);assert.equal(right.text,left.text);assert.equal(calls,1);assert.equal((await current(s.url,a.cookie)).writes.length,1);
});

test('website intent: failed receipt retains status and does not rerun while new intent may recover',async t=>{
 let calls=0,fail=true;const s=await site(t,{createStore:()=>{const db=realStore();return {...db,async put(data){calls++;if(fail)throw Object.assign(new Error('sample I/O unavailable'),{code:'EIO'});return db.put(data);}};}}),a=await session(s.url),key=randomUUID(),doc={id:'recover'};
 const failed=await send(s,a.cookie,key,'put',[doc]);assert.equal(failed.status,500);fail=false;
 const duplicate=await send(s,a.cookie,key,'put',[doc]);assert.equal(duplicate.status,500);assert.equal(duplicate.text,failed.text);assert.equal(calls,1);
 assert.equal((await send(s,a.cookie,randomUUID(),'put',[doc])).json.result.rev,1);assert.equal(calls,2);
 const malformed=await send(s,a.cookie,'not-an-intent','put',[{id:'invalid-header'}]);assert.equal(malformed.status,400);assert.equal(calls,2);
});

test('website intent: reset deduplicates itself and rejects old-generation mutations without resurrection',async t=>{
 const s=await site(t),a=await session(s.url),old=randomUUID(),reset=randomUUID(),doc={id:'before'};
 await send(s,a.cookie,old,'put',[doc]);const cleared=await send(s,a.cookie,reset,'reset');assert.equal(cleared.status,200);assert.deepEqual(cleared.json.state.writes,[]);
 await send(s,a.cookie,randomUUID(),'put',[{id:'after'}]);
 const repeatedReset=await send(s,a.cookie,reset,'reset');assert.equal(repeatedReset.text,cleared.text);assert.deepEqual((await current(s.url,a.cookie)).ids,['after'],'duplicate reset must not clear later work');
 const stale=await send(s,a.cookie,old,'put',[doc]);assert.equal(stale.status,409);assert.equal(stale.json.error.code,'STALE_INTENT');assert.deepEqual((await current(s.url,a.cookie)).ids,['after']);
});

test('website intent: identities belong to one session and bind the operation method',async t=>{
 const s=await site(t),a=await session(s.url),b=await session(s.url),key=randomUUID(),doc={id:'separate'};
 const left=await send(s,a.cookie,key,'put',[doc]),right=await send(s,b.cookie,key,'put',[doc]);assert.equal(left.json.result.rev,1);assert.equal(right.json.result.rev,1);assert.notEqual(left.json.result.uid,right.json.result.uid);
 const changed=await send(s,a.cookie,key,'clean',[1]);assert.equal(changed.status,409);assert.equal((await current(s.url,a.cookie)).writes.length,1);
});
