'use strict';
const test=require('node:test'),{spawn}=require('node:child_process');
const {root,temporary,fs,path,assert}=require('./website-helpers.cjs');
async function runExample(t,name){
 const file=path.join(root,'website/examples',name+'.cjs');await fs.access(file);const temp=await temporary(t),samples=path.join(temp,'samples'),traces=path.join(temp,'traces');await fs.mkdir(samples);await fs.mkdir(traces);const preload=path.join(__dirname,'website-example-preload.cjs');
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,TMPDIR:samples,NODE_OPTIONS:'--require '+preload,UND_EXAMPLE_PROJECT:root,UND_EXAMPLE_SAMPLE_ROOT:samples,UND_EXAMPLE_TRACE_DIR:traces},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('example timed out'));},7000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr});});});
 assert.equal(result.code,0,result.stderr);assert.equal(result.signal,null);assert.ok(result.stdout.trim(),'example explains actual results');assert.doesNotMatch(result.stderr,/MODULE_NOT_FOUND|Cannot find module|\n\s+at /);
 const records=await Promise.all((await fs.readdir(traces)).map(async name=>JSON.parse(await fs.readFile(path.join(traces,name),'utf8')))),events=records.flatMap(x=>x.events);
 assert.ok(events.length,'examples must call the actual installed core');assert.ok(events.every(x=>x.status!=='pending'),'examples must await operations');
 for(const call of events.filter(x=>x.method==='path'&&x.status==='fulfilled')){const location=path.resolve(call.args[0]);assert.ok(location.startsWith(samples+path.sep));await assert.rejects(fs.lstat(location),{code:'ENOENT'},'example removes its owned sample');}
 return {records,events};
}
test('website examples: exact tutorial exercises the real seven-method learning journey',{timeout:10000},async t=>{
 const {events}=await runExample(t,'tutorial');for(const method of ['path','put','get','has','all','rev','clean'])assert.ok(events.some(x=>x.method===method&&x.status==='fulfilled'),'tutorial includes '+method);
 const writes=events.filter(x=>x.method==='put'&&x.status==='fulfilled').map(x=>x.result);assert.ok(writes.length>=3);assert.ok(writes.every(x=>x.id&&Number.isInteger(x.rev)&&x.uid));assert.ok(writes.some((a,index)=>writes.slice(index+1).some(b=>a.id===b.id&&a.rev===b.rev&&a.uid!==b.uid)),'tutorial demonstrates two same-base edits');assert.ok(events.some(x=>x.status==='rejected'),'tutorial demonstrates handling an error');
});
test('website examples: exact patterns exercise cleanup depths and the direct CLI',{timeout:10000},async t=>{
 const {records,events}=await runExample(t,'patterns');for(const method of ['path','put','get','all','clean'])assert.ok(events.some(x=>x.method===method&&x.status==='fulfilled'),'patterns includes '+method);
 const clean=events.filter(x=>x.method==='clean'&&x.status==='fulfilled');assert.ok(clean.some(x=>(x.args[0]??1)===1));assert.ok(clean.some(x=>x.args[0]===2));
 const cli=records.find(x=>path.resolve(x.argv[1]||'.')===path.join(root,'cli.js')&&x.argv[2]==='clean');assert.ok(cli,'patterns runs the real direct cleanup CLI with an explicit sample path');assert.ok(cli.argv[3]&&!cli.argv[3].startsWith('-'));assert.ok(cli.events.some(x=>x.method==='clean'&&x.status==='fulfilled'));
});
