'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const assetRoot=path.join(root,'website/public/vendor');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
async function temporary(t,prefix='und-site-gate-'){const dir=await fs.mkdtemp(path.join(os.tmpdir(),prefix));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function loadSite(){const entry=path.join(root,'website/server.cjs');const exported=require(entry);assert.equal(typeof exported.startSite,'function','website/server.cjs must export startSite');return exported.startSite;}
async function site(t,options={}){const result=await loadSite()({port:0,...options});assert.equal(typeof result.close,'function');const url=new URL(result.url);assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.ok(Number(url.port)>0);t.after(()=>result.close());return {...result,url:url.origin};}
function request(url,pathname,{method='GET',cookie,body,raw,headers={}}={}){
 const target=new URL(pathname,url),data=raw!==undefined?raw:body===undefined?undefined:JSON.stringify(body);
 const opts={method,headers:{...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}};
 return new Promise((resolve,reject)=>{const req=http.request(target,opts,res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>{const bytes=Buffer.concat(chunks),text=bytes.toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,bytes,text,json});});});req.on('error',reject);req.setTimeout(4000,()=>req.destroy(new Error('request timed out')));req.end(data);});
}
function state(value){assert.ok(value&&typeof value==='object');assert.ok(Array.isArray(value.ids),'state.ids is required');assert.ok(Array.isArray(value.writes),'state.writes is required');return value;}
function success(response){assert.ok(response.status>=200&&response.status<300,response.text);assert.equal(response.json?.ok,true,response.text);assert.ok(Object.hasOwn(response.json,'result'),'result is explicit even when null');state(response.json.state);return {...response.json,state:{ids:response.json.state.ids,writes:response.json.state.writes}};}
function failure(response,statusClass=4){assert.equal(Math.floor(response.status/100),statusClass,response.text);assert.equal(response.json?.ok,false,response.text);assert.equal(typeof response.json?.error?.code,'string');assert.ok(response.json.error.code);assert.equal(typeof response.json?.error?.message,'string');assert.ok(response.json.error.message);return response.json;}
async function session(url,cookie){const response=await request(url,'/api/session',{cookie});const body=success(response);assert.equal(body.result,null);let selected=cookie;if(!cookie){const cookies=response.headers['set-cookie']||[];assert.ok(cookies.length,'new session must set a cookie');const header=cookies.find(c=>/HttpOnly/i.test(c)&&/SameSite=Strict/i.test(c)&&/Path=\//i.test(c));assert.ok(header,'opaque session cookie must be HttpOnly, SameSite=Strict and Path=/');selected=header.split(';')[0];assert.ok(selected.split('=')[1].length>=16,'session token must be opaque, not an incrementing integer');}return {cookie:selected,...body};}
async function op(url,cookie,method,args=[]){return success(await request(url,'/api/operation',{method:'POST',cookie,body:{method,args}}));}
async function current(url,cookie){const body=success(await request(url,'/api/state',{cookie}));assert.equal(body.result,null);return body.state;}
function realStore(){return require(path.join(root,'index.js'))({});}
async function snapshot(dir){const out=[];for(const name of (await fs.readdir(dir)).sort()){const file=path.join(dir,name),s=await fs.lstat(file);out.push([name,s.isDirectory()?await snapshot(file):await fs.readFile(file,'hex')]);}return out;}
module.exports={root,assetRoot,gate,tick,temporary,loadSite,site,request,state,success,failure,session,op,current,realStore,snapshot,fs,path,os,http,assert};
