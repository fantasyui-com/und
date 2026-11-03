'use strict';
const test=require('node:test');
const {site,request,failure,realStore,fs,assert}=require('../../test/website-helpers.cjs');
test('website lifecycle: failed initialization cleanup remains owned until close',{timeout:10000},async t=>{
 let owned,injected=false;
 const original=fs.rm;
 const s=await site(t,{createStore(){const store=realStore();return {...store,async path(location){owned=location;throw Object.assign(new Error('injected initialization failure'),{code:'EINIT'});}};}});
 try{
  fs.rm=async function(location,...args){if(location===owned&&!injected){injected=true;throw Object.assign(new Error('injected temporary cleanup failure'),{code:'EACCES'});}return original.call(this,location,...args);};
  const response=await request(s.url,'/api/session');failure(response,5);assert.equal(injected,true,'the provisional cleanup failure must be reached');
  fs.rm=original;
  await s.close();
  await assert.rejects(fs.lstat(owned),{code:'ENOENT'},'fulfilled close must remove its provisional sample after filesystem cleanup recovers');
 }finally{fs.rm=original;await s.close().catch(()=>{});if(owned)await original(owned,{recursive:true,force:true});}
});
