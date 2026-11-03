'use strict';
// Test-only observation of actual core calls, including a CLI child. It is not
// shipped application code and it does not supply a replacement store.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const original=Module._load,expected=path.join(process.env.UND_EXAMPLE_PROJECT,'core.js'),sample=path.resolve(process.env.UND_EXAMPLE_SAMPLE_ROOT),events=[];
const safe=value=>{try{return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v)+'n':v));}catch{return '<unserializable>';}};
Module._load=function(request,parent,isMain){const exported=original.apply(this,arguments);let resolved;try{resolved=Module._resolveFilename(request,parent);}catch{return exported;}if(resolved!==expected)return exported;return {...exported,core(...args){const api=exported.core(...args);return Object.fromEntries(Object.entries(api).map(([method,fn])=>[method,async function(...values){const event={method,args:safe(values),status:'pending'};events.push(event);try{if(method==='path'&&!path.resolve(values[0]).startsWith(sample+path.sep))throw Error('Example must use its own temporary sample, not a live/default directory');const result=await fn(...values);event.status='fulfilled';event.result=safe(result);return result;}catch(error){event.status='rejected';event.error=error.message;throw error;}}]));}};};
process.on('exit',()=>fs.writeFileSync(path.join(process.env.UND_EXAMPLE_TRACE_DIR,process.pid+'.json'),JSON.stringify({argv:process.argv,events})));
