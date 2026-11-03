'use strict';
const test=require('node:test'),{createHash}=require('node:crypto');
const {site,request,session,loadSite,temporary,root,fs,path,assert}=require('./website-helpers.cjs');
const assets=['bootstrap/bootstrap.min.css','bootstrap/bootstrap.bundle.min.js','icons/bootstrap-icons.min.css','icons/fonts/bootstrap-icons.woff2','icons/fonts/bootstrap-icons.woff'];
test('website assets: supplied vendor bytes are served locally through assetRoot',{timeout:10000},async t=>{
 const source=path.join(root,'website/public/vendor'),temp=await temporary(t),vendor=path.join(temp,'vendor');
 const expected=['678508b198d9b1b8877e338f419fdada00024be2bcc638a539dd724856095112','47ea447f46e288dd9d3e83147b7ba539c6df5192c047b8f91739cd56a5721148','79c99c1a1e0e937f808a58165728b7ed00800f02ef5efcfcd10dfe71464e675d','2b7689746f87e0beeae25338bc021dd2515c2f6f003f3d3d064d878d380b2150','24929e8a44da027588f833d4e82240ee734bd65bf962b08b0545af58a9ce80fa'];
 for(const [index,relative] of assets.entries()){assert.equal(createHash('sha256').update(await fs.readFile(path.join(source,relative))).digest('hex'),expected[index],'supplied vendor bytes');const destination=path.join(vendor,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(source,relative),destination);}
 const s=await site(t,{assetRoot:vendor});for(const relative of assets){const response=await request(s.url,'/vendor/'+relative);assert.equal(response.status,200,relative);assert.deepEqual(response.bytes,await fs.readFile(path.join(vendor,relative)),relative);}
 const a=await session(s.url);assert.deepEqual(a.state.ids,[]);
 const traversal=await request(s.url,'/vendor/%2e%2e/%2e%2e/package.json');assert.ok(traversal.status>=400);
});
test('website assets: missing supplied assets cannot report Playground ready',{timeout:10000},async t=>{
 const temp=await temporary(t);let instance;
 try{instance=await loadSite()({port:0,assetRoot:path.join(temp,'missing')});}catch(error){assert.ok(error.message);assert.match(error.message,/asset|bootstrap|missing|ENOENT/i);return;}
 t.after(()=>instance.close());const response=await request(instance.url,'/api/session');assert.ok(response.status>=400);assert.equal(response.json?.ok,false);assert.ok(response.json?.error?.message);
});
