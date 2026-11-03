'use strict';
const nodeTest=require('node:test'),test=(name,run)=>nodeTest(name,{timeout:12000},run);
const {site,request,success,failure,session,op,current,realStore,temporary,snapshot,gate,tick,fs,path,http,assert}=require('./website-helpers.cjs');

test('website adapter: real empty create update read and session refresh',async t=>{
 const s=await site(t),a=await session(s.url);assert.deepEqual(a.state.ids,[]);assert.deepEqual(a.state.writes,[]);
 assert.equal((await op(s.url,a.cookie,'get',['profile'])).result,null);assert.equal((await op(s.url,a.cookie,'rev',['profile'])).result,0);assert.equal((await op(s.url,a.cookie,'has',['profile'])).result,false);
 const first=(await op(s.url,a.cookie,'put',[{id:'profile',name:'Mira',color:'blue'}])).result;
 assert.equal(first.id,'profile');assert.equal(first.rev,1);assert.match(first.uid,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 const second=(await op(s.url,a.cookie,'put',[{...first,name:'Mira Updated'}])).result;assert.equal(second.rev,2);assert.notEqual(second.uid,first.uid);
 assert.deepEqual((await op(s.url,a.cookie,'get',['profile'])).result,second);assert.equal((await op(s.url,a.cookie,'has',['profile'])).result,true);assert.equal((await op(s.url,a.cookie,'rev',['profile'])).result,2);assert.deepEqual((await op(s.url,a.cookie,'all')).result,['profile']);
 const state=await current(s.url,a.cookie);assert.deepEqual(state.writes,[first,second]);assert.deepEqual(state.ids,['profile']);
 const refreshed=await session(s.url,a.cookie);assert.deepEqual(refreshed.state,state,'refresh reuses the same learning session and performs no write');
});

test('website adapter: same-base conflicts cleanup depths and independent real-core reopen',async t=>{
 const s=await site(t),a=await session(s.url),put=async data=>(await op(s.url,a.cookie,'put',[data])).result;
 const one=await put({id:'profile',name:'Mira',color:'blue'}),two=await put({...one,name:'Second'});
 const left=await put({...two,name:'Third A'}),right=await put({...two,color:'green'});
 assert.equal(left.rev,3);assert.equal(right.rev,3);assert.notEqual(left.uid,right.uid);
 const expected=left.uid>right.uid?left:right;assert.deepEqual((await op(s.url,a.cookie,'get',['profile'])).result,expected,'selection comes from actual core get without merging');
 const firstClean=(await op(s.url,a.cookie,'clean',[2])).result;assert.equal(firstClean.length,1);assert.ok(path.isAbsolute(firstClean[0]));assert.equal(path.basename(firstClean[0]),one.rev+'-'+one.uid+'.json');
 const record=path.dirname(firstClean[0]),db=path.dirname(record),reopened=realStore();await reopened.path(db);assert.deepEqual(await reopened.get('profile'),expected);
 let names=await fs.readdir(record);assert.equal(names.length,3);assert.ok(names.includes(left.rev+'-'+left.uid+'.json'));assert.ok(names.includes(right.rev+'-'+right.uid+'.json'));
 const secondClean=(await op(s.url,a.cookie,'clean',[1])).result;assert.deepEqual(secondClean.map(file=>path.basename(file)),[two.rev+'-'+two.uid+'.json']);assert.equal((await fs.readdir(record)).length,2);assert.deepEqual((await op(s.url,a.cookie,'clean')).result,[]);
 assert.deepEqual((await current(s.url,a.cookie)).writes,[one,two,left,right],'session ledger records successful puts even after pruning');
});

test('website adapter: cookie isolation reset and unrelated files survive',async t=>{
 const tmp=await temporary(t),sentinel=path.join(tmp,'unrelated');await fs.writeFile(sentinel,'keep');const s=await site(t),a=await session(s.url),b=await session(s.url);assert.notEqual(a.cookie,b.cookie);
 const savedA=(await op(s.url,a.cookie,'put',[{id:'alice',value:'A'}])).result,savedB=(await op(s.url,b.cookie,'put',[{id:'bob',value:'B'}])).result;
 assert.deepEqual((await current(s.url,a.cookie)).ids,['alice']);assert.deepEqual((await current(s.url,b.cookie)).ids,['bob']);assert.equal((await op(s.url,b.cookie,'get',['alice'])).result,null);
 const reset=await op(s.url,a.cookie,'reset');assert.equal(reset.result,null);assert.deepEqual(reset.state.ids,[]);assert.deepEqual(reset.state.writes,[]);assert.equal((await op(s.url,a.cookie,'get',['alice'])).result,null);
 assert.deepEqual((await op(s.url,b.cookie,'get',['bob'])).result,savedB);assert.deepEqual((await current(s.url,b.cookie)).writes,[savedB]);assert.equal(await fs.readFile(sentinel,'utf8'),'keep');assert.equal(savedA.id,'alice');
});

test('website adapter: only session endpoint allocates and unknown cookies fail',async t=>{
 const s=await site(t);failure(await request(s.url,'/api/state'));failure(await request(s.url,'/api/operation',{method:'POST',body:{method:'put',args:[{id:'intruder'}]}}));
 const a=await session(s.url),name=a.cookie.split('=')[0],unknown=name+'=not-a-real-session-token-123456';
 failure(await request(s.url,'/api/state',{cookie:unknown}));failure(await request(s.url,'/api/operation',{method:'POST',cookie:unknown,body:{method:'reset',args:[]}}));assert.deepEqual((await current(s.url,a.cookie)).ids,[]);
});

test('website safety: malformed envelopes and invalid values cannot mutate data or select paths',async t=>{
 const tmp=await temporary(t),target=path.join(tmp,'live-data');await fs.mkdir(target);await fs.writeFile(path.join(target,'sentinel'),'keep');const before=await snapshot(tmp),s=await site(t),a=await session(s.url);
 const saved=(await op(s.url,a.cookie,'put',[{id:'valid',text:'<script>alert(1)</script> 😀'}])).result;const baseline=await current(s.url,a.cookie);
 const invalid=[null,[],{}, {method:'put'}, {method:'put',args:null}, {method:'put',args:[null]}, {method:'put',args:[[]]}, {method:'put',args:[{}]}, {method:'put',args:[{id:'../outside'}]}, {method:'put',args:[{id:'bad\u0000'}]}, {method:'put',args:[{id:'valid',rev:-1}]}, {method:'clean',args:[-1]}, {method:'clean',args:['1']}, {method:'clean',args:[1,2]}, {method:'all',args:['extra']}, {method:'reset',args:[target]}, {method:'path',args:[target]}, {method:'constructor',args:[]}, {method:'__proto__',args:[]}, {method:'get',args:['valid'],path:target}];
 for(const body of invalid){failure(await request(s.url,'/api/operation',{method:'POST',cookie:a.cookie,body}));assert.deepEqual(await current(s.url,a.cookie),baseline);}
 failure(await request(s.url,'/api/operation',{method:'POST',cookie:a.cookie,raw:'{"method":'}));assert.deepEqual(await snapshot(tmp),before);assert.deepEqual((await op(s.url,a.cookie,'get',['valid'])).result,saved);
});

test('website safety: bounded body methods origin and Host reject before mutation',async t=>{
 const s=await site(t),a=await session(s.url),before=await current(s.url,a.cookie),body={method:'put',args:[{id:'must-not-exist'}]};
 const attempts=[
 {method:'PUT',body},{method:'POST',body,headers:{Origin:'https://outside.invalid'}},{method:'POST',body,headers:{Origin:'null'}},
 {method:'POST',body,headers:{Host:'outside.invalid'}},{method:'POST',body,headers:{'Content-Type':'text/plain'}},
 {method:'POST',raw:JSON.stringify({method:'put',args:[{id:'huge',text:'x'.repeat(1024*1024)}]})}
 ];
 for(const options of attempts){failure(await request(s.url,'/api/operation',{cookie:a.cookie,...options}));assert.deepEqual(await current(s.url,a.cookie),before);}
 failure(await request(s.url,'/api/session',{headers:{Host:'outside.invalid'}}));failure(await request(s.url,'/api/state',{cookie:a.cookie,headers:{Origin:'https://outside.invalid'}}));
 const valid=await request(s.url,'/api/operation',{method:'POST',cookie:a.cookie,body:{method:'put',args:[{id:'same-origin'}]},headers:{Origin:s.url}});assert.equal(success(valid).result.rev,1);
});

test('website readiness: store initialization failure is an error and can recover',async t=>{
 let fail=true;const s=await site(t,{createStore(){const store=realStore();return {...store,async path(location){if(fail)throw Object.assign(new Error('sample initialization unavailable'),{code:'EIO'});return store.path(location);}};}});
 const rejected=await request(s.url,'/api/session');failure(rejected,5);assert.ok(!rejected.json?.state?.ready);fail=false;const a=await session(s.url);assert.deepEqual(a.state.ids,[]);assert.deepEqual(a.state.writes,[]);
});

test('website readiness: operation errors retain data and never append failed writes',async t=>{
 const s=await site(t,{createStore(){const store=realStore();return {...store,async put(data){if(data.fail)throw Object.assign(new Error('sample write unavailable'),{code:'EIO'});return store.put(data);},async get(id){if(id==='io-error')throw Object.assign(new Error('sample read unavailable'),{code:'EIO'});return store.get(id);}};}}),a=await session(s.url);
 const saved=(await op(s.url,a.cookie,'put',[{id:'valid'}])).result,before=await current(s.url,a.cookie);
 failure(await request(s.url,'/api/operation',{method:'POST',cookie:a.cookie,body:{method:'put',args:[{id:'failed',fail:true}]}}),5);
 failure(await request(s.url,'/api/operation',{method:'POST',cookie:a.cookie,body:{method:'get',args:['io-error']}}),5);
 assert.deepEqual(await current(s.url,a.cookie),before);assert.deepEqual((await op(s.url,a.cookie,'get',['valid'])).result,saved);assert.equal((await op(s.url,a.cookie,'get',['missing'])).result,null);
});

test('website lifecycle: reset queues behind admitted writes and clears their ledger',async t=>{
 const entered=gate(),release=gate(),events=[];let held=false;t.after(()=>release.resolve());const s=await site(t,{createStore(){const store=realStore();return {...store,async put(data){if(!held){held=true;events.push('put-start');entered.resolve();await release.promise;}const result=await store.put(data);events.push('put-end');return result;}};}}),a=await session(s.url);
 const putting=op(s.url,a.cookie,'put',[{id:'before-reset'}]);await entered.promise;
 let resetDone=false;const resetting=op(s.url,a.cookie,'reset').then(x=>{resetDone=true;return x;});await tick();assert.equal(resetDone,false,'reset must wait for an admitted mutation');release.resolve();await putting;const reset=await resetting;
 assert.deepEqual(events,['put-start','put-end']);assert.deepEqual(reset.state.ids,[]);assert.deepEqual(reset.state.writes,[]);assert.deepEqual(await current(s.url,a.cookie),reset.state);
});

test('website lifecycle: a disconnected request is never automatically replayed',async t=>{
 const entered=gate(),release=gate();let calls=0;t.after(()=>release.resolve());const s=await site(t,{createStore(){const store=realStore();return {...store,async put(data){calls++;entered.resolve();await release.promise;return store.put(data);}};}}),a=await session(s.url);
 const data=JSON.stringify({method:'put',args:[{id:'once'}]});const req=http.request(new URL('/api/operation',s.url),{method:'POST',headers:{Cookie:a.cookie,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}});req.on('error',()=>{});req.on('response',res=>res.resume());req.end(data);await entered.promise;req.destroy();release.resolve();
 const state=await current(s.url,a.cookie);assert.equal(calls,1);assert.equal(state.writes.length,1);assert.equal(state.writes[0].rev,1);assert.equal((await op(s.url,a.cookie,'rev',['once'])).result,1);
});

test('website lifecycle: close drains admitted work removes owned samples and is idempotent',async t=>{
 const entered=gate(),release=gate(),locations=[];t.after(()=>release.resolve());const s=await site(t,{createStore(){const store=realStore();return {...store,async path(location){locations.push(location);return store.path(location);},async put(data){entered.resolve();await release.promise;return store.put(data);}};}}),a=await session(s.url);
 const putting=op(s.url,a.cookie,'put',[{id:'pending'}]);await entered.promise;let closed=false;const closing=s.close().then(()=>{closed=true;});await tick();assert.equal(closed,false,'close waits for an admitted operation');release.resolve();assert.equal((await putting).result.rev,1);await closing;
 for(const location of locations)await assert.rejects(fs.lstat(location),{code:'ENOENT'});await s.close();
 await assert.rejects(request(s.url,'/api/session'));
});
