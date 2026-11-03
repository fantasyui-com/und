'use strict';
// Proposed additive gate. Run from the project root, or set UND_TEST_ROOT.
// The fault adapter supports fs/promises writeFile and FileHandle byte writers.
// Unreached fault points are harness failures, never evidence of product safety.
const nodeTest = require('node:test');
const test = (name, run) => nodeTest(name, {timeout: 5000}, run);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(process.env.UND_TEST_ROOT || process.cwd());
const make = () => require(path.join(root,'index.js'))({});
const finalName = /^[1-9][0-9]*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;
const within = (base,file) => typeof file === 'string' && file.startsWith(base + path.sep);
const gate = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {resolve,promise}; };
const ioError = () => Object.assign(new Error('injected review EIO'),{code:'EIO'});
async function bounded(promise,label) { let timer; try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Harness did not reach '+label)),2500);})]); } finally {clearTimeout(timer);} }
async function tree(dir) { const out=[]; for(const name of (await fs.readdir(dir)).sort()) {const p=path.join(dir,name),s=await fs.lstat(p);out.push([name,s.isDirectory()?await tree(p):await fs.readFile(p,'hex')]);} return out; }
async function setup(t) { const temp=await fs.mkdtemp(path.join(os.tmpdir(),'und-boundary-gate-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));const db=path.join(temp,'db'),api=make();await api.path(db);return {temp,db,api}; }
async function seed(api,db,label) { await api.path(db);const first=await api.put({id:'alice',label});await api.put({...first,updated:true}); }
async function interceptAfter(method,predicate,run) {
  const original=fs[method],entered=gate(),release=gate();let hit=false;
  fs[method]=async function(file,...args){const value=await original.call(this,file,...args);if(!hit&&predicate(file)){hit=true;entered.resolve();await release.promise;}return value;};
  try { await run(entered.promise,release.resolve); } finally {release.resolve();fs[method]=original;}
}

test('release: clean retains its selected database after reconfiguration',async t=>{
  const {temp,api}=await setup(t),a=path.join(temp,'A'),b=path.join(temp,'B');await seed(api,a,'A');await seed(api,b,'B');await api.path(a);const beforeB=await tree(b);let removed;
  await interceptAfter('readdir',file=>file===a,async(entered,release)=>{
    const pending=api.clean();try{await bounded(entered,'database enumeration');await api.path(b);}finally{release();}removed=await pending;
  });
  assert.deepEqual(await tree(b),beforeB,'an operation begun in A must not mutate B');
  assert.equal(removed.length,1);assert.ok(removed.every(file=>within(a,file)),'removed paths belong to the captured store');
  assert.equal((await fs.readdir(path.join(a,'alice'))).length,1);
});

test('release: get captures database before awaiting location validation',async t=>{
  const {temp,api}=await setup(t),a=path.join(temp,'A'),b=path.join(temp,'B');await seed(api,a,'A');await seed(api,b,'B');await api.path(a);let returned;
  await interceptAfter('lstat',file=>file===a,async(entered,release)=>{
    const pending=api.get('alice');try{await bounded(entered,'location validation');await api.path(b);}finally{release();}returned=await pending;
  });
  assert.equal(returned.label,'A','configured must return the location it validated');
  assert.equal((await api.get('alice')).label,'B','new calls use completed reconfiguration');
});

function partialWriter(base) {
  const originalWrite=fs.writeFile,originalOpen=fs.open,entered=gate(),release=gate();let hit=false;
  const patchedHandles=[];
  async function injected(bytes,writePrefix) {hit=true;const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(String(bytes));await writePrefix(buffer.subarray(0,Math.min(12,buffer.length)));entered.resolve();await release.promise;throw ioError();}
  fs.writeFile=async function(file,bytes,options){if(!hit&&within(base,file))return injected(bytes,prefix=>originalWrite.call(this,file,prefix,options));return originalWrite.call(this,file,bytes,options);};
  fs.open=async function(file,...args){const handle=await originalOpen.call(this,file,...args);if(!within(base,file))return handle;
    for(const name of ['writeFile','write','writev']) {
      const original=handle[name];
      handle[name]=async function(...values){
        if(hit)return original.apply(this,values);
        let bytes=values[0];if(name==='writev')bytes=Buffer.concat(bytes);
        if(name==='write'&&Buffer.isBuffer(bytes)&&typeof values[1]==='number')bytes=bytes.subarray(values[1],values[1]+(values[2]??bytes.length));
        return injected(bytes,prefix=>{
          if(name==='writeFile')return original.call(this,prefix,values[1]);
          if(name==='writev')return original.call(this,[prefix],values[1]);
          const position=Buffer.isBuffer(values[0])?values[3]:(typeof values[1]==='number'?values[1]:null);
          return original.call(this,prefix,0,prefix.length,position);
        });
      };patchedHandles.push([handle,name,original]);
    }return handle;
  };
  return {entered:entered.promise,release:release.resolve,hit:()=>hit,restore(){release.resolve();fs.writeFile=originalWrite;fs.open=originalOpen;for(const [handle,name,fn]of patchedHandles)handle[name]=fn;}};
}

test('release: partial write cannot expose corrupt JSON or poison reads after rejection',async t=>{
  const {db,api}=await setup(t),reader=make();await reader.path(db);const first=await api.put({id:'alice',label:'old'}),before=await tree(db);const fault=partialWriter(db);let outcome,visibility;
  const pending=api.put({...first,label:'new'}).then(value=>({value}),error=>({error}));
  try {
    await bounded(fault.entered,'partial byte write');
    visibility=await Promise.allSettled([reader.all(),reader.get('alice'),reader.rev('alice')]);
  } finally {fault.release();outcome=await pending;fault.restore();}
  assert.equal(outcome.error?.code,'EIO','prepublication byte failure rejects');
  assert.deepEqual(visibility.map(x=>x.status),['fulfilled','fulfilled','fulfilled'],'an independent instance remains readable during partial write');
  assert.deepEqual(visibility.map(x=>x.value),[['alice'],first,1],'pending internal bytes are not published revisions or record IDs');
  assert.deepEqual(await reader.get('alice'),first);assert.equal(await reader.rev('alice'),1);assert.deepEqual(await reader.all(),['alice']);
  const record=await fs.readdir(path.join(db,'alice'));const revisions=record.filter(name=>finalName.test(name));assert.equal(revisions.length,1,'no corrupt final revision survives rejection');
  assert.deepEqual(await reader.clean(),[],'staging leftovers cannot make prior valid data uncleanable');
  const after=await tree(db);for(const [id,files]of before){for(const old of files)assert.deepEqual(after.find(x=>x[0]===id)[1].find(x=>x[0]===old[0]),old,'prior bytes stay unchanged');}
});

test('release: serialization errors and failed reconfiguration preserve selected storage',async t=>{
  const {db,temp,api}=await setup(t);const saved=await api.put({id:'alice',label:'old'});const before=await tree(db);await fs.writeFile(path.join(temp,'collision'),'unrelated');await assert.rejects(api.path(path.join(temp,'collision')));await assert.rejects(api.put({id:'bob',value:1n}));assert.deepEqual(await tree(db),before);assert.deepEqual(await api.get('alice'),saved);
});

test('release: independent same-base writers retain all complete revisions',async t=>{
  const {db,api}=await setup(t);const first=await api.put({id:'alice',label:'base'});const writers=Array.from({length:6},()=>make());await Promise.all(writers.map(x=>x.path(db)));const saved=await Promise.all(writers.map((x,index)=>x.put({...first,writer:index})));
  assert.deepEqual(saved.map(x=>x.rev),[2,2,2,2,2,2]);assert.equal(new Set(saved.map(x=>x.uid)).size,6);
  const finals=(await fs.readdir(path.join(db,'alice'))).filter(name=>finalName.test(name));assert.equal(finals.length,7);const docs=await Promise.all(finals.map(name=>fs.readFile(path.join(db,'alice',name),'utf8').then(JSON.parse)));assert.deepEqual(docs.filter(x=>x.rev===2).map(x=>x.writer).sort(),[0,1,2,3,4,5]);const expected=saved.reduce((a,b)=>`${a.rev}-${a.uid}.json`>`${b.rev}-${b.uid}.json`?a:b);assert.deepEqual(await api.get('alice'),expected);
  await api.clean();assert.equal((await fs.readdir(path.join(db,'alice'))).filter(name=>finalName.test(name)).length,6);
});

test('release: failed publication preserves prior readable data',async t=>{
  const {db,api}=await setup(t);const first=await api.put({id:'alice',label:'old'}),before=await tree(db),originals=[];let hit=false;
  for(const method of ['writeFile','link','rename','copyFile']){const fn=fs[method];originals.push([method,fn]);fs[method]=async function(...args){const destination=method==='writeFile'?args[0]:args[1];if(within(db,destination)&&finalName.test(path.basename(destination))){hit=true;throw ioError();}return fn.apply(this,args);};}
  let result;try{result=await api.put({...first,label:'new'}).then(value=>({value}),error=>({error}));}finally{for(const [name,fn]of originals)fs[name]=fn;}
  assert.ok(hit,'publication failure adapter must reach the active mechanism');assert.equal(result.error?.code,'EIO');assert.deepEqual(await api.get('alice'),first);assert.equal(await api.rev('alice'),1);assert.deepEqual(await api.clean(),[]);
  const old=before[0][1][0];assert.deepEqual((await tree(db)).find(x=>x[0]==='alice')[1].find(x=>x[0]===old[0]),old);
});

test('release: a competing final filename cannot be overwritten during publication',async t=>{
  const {db,api}=await setup(t);const first=await api.put({id:'alice',label:'old'}),originals=[],write=fs.writeFile;let collision;
  for(const method of ['writeFile','open','link','rename','copyFile']){const fn=fs[method];originals.push([method,fn]);fs[method]=async function(...args){
    const destination=['writeFile','open'].includes(method)?args[0]:args[1];
    if(!collision&&typeof destination==='string'&&path.dirname(destination)===path.join(db,'alice')&&/^2-/.test(path.basename(destination))&&finalName.test(path.basename(destination))){
      const uid=path.basename(destination).slice(2,-5),document={id:'alice',rev:2,uid,label:'competing publication'};
      collision={file:destination,bytes:JSON.stringify(document)};await write.call(fs,destination,collision.bytes,{flag:'wx'});
    }
    return fn.apply(this,args);
  };}
  let outcome;try{outcome=await api.put({...first,label:'our write'}).then(value=>({value}),error=>({error}));}finally{for(const [method,fn]of originals)fs[method]=fn;}
  assert.ok(collision,'collision adapter must reach publication');assert.equal(await fs.readFile(collision.file,'utf8'),collision.bytes,'publication must never replace a file created by another writer');
  if(outcome.error)assert.equal(outcome.error.code,'EEXIST');else{assert.equal(outcome.value.label,'our write');assert.notEqual(outcome.value.uid,JSON.parse(collision.bytes).uid,'a retry must use a fresh identity');}
  const oldFile=path.join(db,'alice',`${first.rev}-${first.uid}.json`);assert.deepEqual(JSON.parse(await fs.readFile(oldFile,'utf8')),first);
});

test('release: known commit survives a later internal cleanup failure',async t=>{
  const {db,api}=await setup(t);const first=await api.put({id:'alice',label:'old'}),originals=[];let cleanupFaults=0;
  for(const method of ['unlink','rm']){const fn=fs[method];originals.push([method,fn]);fs[method]=async function(file,...args){if(within(db,file)&&!finalName.test(path.basename(file))){const names=await fs.readdir(path.join(db,'alice'));if(names.some(name=>/^2-/.test(name)&&finalName.test(name))){cleanupFaults++;throw ioError();}}return fn.call(this,file,...args);};}
  let outcome;try{outcome=await api.put({...first,label:'new'}).then(value=>({value}),error=>({error}));}finally{for(const [name,fn]of originals)fs[name]=fn;}
  assert.equal(outcome.error,undefined,'a known published revision must not be reported as an ordinary failed put');assert.equal(outcome.value.rev,2);assert.equal(outcome.value.label,'new');assert.deepEqual(await api.get('alice'),outcome.value);assert.equal(await api.rev('alice'),2);assert.deepEqual(await api.all(),['alice']);
  // Zero callbacks is legitimate for an atomic move or another method that has
  // no postpublication staging cleanup. No particular staging design is required.
  t.diagnostic('postpublication cleanup failures injected: '+cleanupFaults);
});
