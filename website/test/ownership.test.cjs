'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {startSite}=require('../server.cjs');

test('website regression: provisional samples remain owned after initialization and immediate cleanup fail',async()=>{
  const original=fs.rm;let owned,site,injected=false;
  try{
    site=await startSite({createStore:()=>({async path(location){owned=location;throw Object.assign(new Error('injected initialization failure'),{code:'EINIT'});}})});
    fs.rm=async function(location,...args){if(location===owned&&!injected){injected=true;throw Object.assign(new Error('injected immediate cleanup failure'),{code:'EACCES'});}return original.call(this,location,...args);};
    const response=await fetch(site.url+'/api/session');const body=await response.json();assert.equal(response.status,500);assert.equal(injected,true);
    fs.rm=original;await site.close();await assert.rejects(fs.lstat(owned),{code:'ENOENT'},'successful close must remove its provisional directory');
    assert.match(body.error.message,/initialization failure/,'preserve the primary initialization failure');assert.match(body.error.message,/cleanup/i,'explain the additional cleanup failure');assert.equal(body.error.code,'EINIT');
  }finally{fs.rm=original;if(site)await site.close().catch(()=>{});if(owned)await original(owned,{recursive:true,force:true});}
});

test('website regression: close attempts every owned directory and reports cleanup failure before retry',async()=>{
  const original=fs.rm,locations=[],attempted=[];let site,block=true;
  const real=require('../../index.js');
  try{
    site=await startSite({createStore:()=>{const store=real({});return {...store,async path(location){locations.push(location);await store.path(location);}};}});
    for(let i=0;i<2;i++){const response=await fetch(site.url+'/api/session');assert.equal(response.status,200);await response.json();}
    fs.rm=async function(location,...args){attempted.push(location);if(block&&location===locations[0])throw Object.assign(new Error('owned cleanup unavailable'),{code:'EACCES'});return original.call(this,location,...args);};
    await assert.rejects(site.close(),/cleanup/i);assert.ok(locations.every(location=>attempted.includes(location)),'all cleanup is attempted');await assert.rejects(fs.lstat(locations[1]),{code:'ENOENT'});
    block=false;await site.close();for(const location of locations)await assert.rejects(fs.lstat(location),{code:'ENOENT'});await site.close();
  }finally{fs.rm=original;if(site)await site.close().catch(()=>{});for(const location of locations)await original(location,{recursive:true,force:true});}
});
