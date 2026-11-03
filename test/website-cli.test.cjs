'use strict';
const test=require('node:test'),{spawn,spawnSync}=require('node:child_process');
const {root,temporary,request,session,op,fs,path,http,assert}=require('./website-helpers.cjs');
const entry=path.join(root,'website/server.cjs');
async function exit(child,timeout=5000){if(child.exitCode!==null||child.signalCode!==null)return {code:child.exitCode,signal:child.signalCode};return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('child did not exit')),timeout);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});}
async function launched(t,args,runtime){
 const child=spawn(process.execPath,[entry,...args],{cwd:root,env:{...process.env,UND_SITE_RUNTIME_DIR:runtime},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exit(child).catch(()=>{child.kill('SIGKILL');});}});
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No startup URL; stdout='+stdout+' stderr='+stderr)),6000);function inspect(){const lines=stdout.trim().split(/\r?\n/);const line=lines[0];if(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/.test(line)){clearTimeout(timer);resolve(line);}}child.stdout.on('data',inspect);child.once('exit',code=>{inspect();if(!/^http:/.test(stdout.trim())){clearTimeout(timer);reject(new Error('Startup exited '+code+': '+stderr));}});child.once('error',e=>{clearTimeout(timer);reject(e);});});
 return {child,url,output:()=>({stdout,stderr})};
}
test('website cli: help and invalid arguments terminate without launching a server',{timeout:10000},async t=>{
 await fs.access(entry);const tmp=await temporary(t),env={...process.env,UND_SITE_RUNTIME_DIR:path.join(tmp,'runtime')};
 const help=spawnSync(process.execPath,[entry,'--help'],{cwd:root,env,encoding:'utf8',timeout:2000});assert.equal(help.error,undefined);assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/usage/i);assert.match(help.stdout,/--port/);assert.equal(help.stderr,'');
 for(const args of [['--unknown'],['--port'],['--port','-1'],['--port','65536'],['--port','no'],['--port','1.5'],['--port','0','--port','0'],['--help','--unknown'],['extra']]){const result=spawnSync(process.execPath,[entry,...args],{cwd:root,env,encoding:'utf8',timeout:2000});assert.equal(result.error,undefined,args.join(' '));assert.notEqual(result.status,0,args.join(' '));assert.equal(result.stdout,'');assert.ok(result.stderr.trim());assert.doesNotMatch(result.stderr,/MODULE_NOT_FOUND|Cannot find module|\n\s+at /);}
});
test('website cli: occupied preferred port falls back and verified instance is reused',{timeout:15000},async t=>{
 const tmp=await temporary(t),runtime=path.join(tmp,'runtime');const unrelated=http.createServer((req,res)=>res.end('unrelated listener stays alive'));await new Promise(resolve=>unrelated.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>unrelated.close(resolve)));
 const port=unrelated.address().port,first=await launched(t,['--port',String(port)],runtime);assert.notEqual(Number(new URL(first.url).port),port);assert.equal((await request('http://127.0.0.1:'+port,'/')).text,'unrelated listener stays alive');
 const a=await session(first.url),saved=(await op(first.url,a.cookie,'put',[{id:'reuse'}])).result;
 const second=await launched(t,['--port',String(port)],runtime);assert.equal(second.url,first.url);const done=await exit(second.child);assert.equal(done.code,0);assert.equal(done.signal,null);
 assert.deepEqual((await op(first.url,a.cookie,'get',['reuse'])).result,saved);assert.equal((await request('http://127.0.0.1:'+port,'/')).text,'unrelated listener stays alive');
 for(const running of [first,second])assert.match(running.output().stdout,/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?\n?$/);
 first.child.kill('SIGTERM');await exit(first.child);await assert.rejects(request(first.url,'/api/session'));
});

