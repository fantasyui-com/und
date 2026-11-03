'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
test('release: current license follows the explicit ISC decision and preserves GPL history',async()=>{
  const root=path.resolve(__dirname,'..');
  const current=await fs.readFile(path.join(root,'LICENSE'),'utf8');
  const old=await fs.readFile(path.join(root,'test/fixtures/LICENSE.GPL-3.0.txt'),'utf8');
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json')));
  assert.equal(pkg.license,'ISC');assert.equal(lock.packages[''].license,'ISC');
  assert.match(current,/^ISC License/m);assert.ok(current.includes('Permission to use, copy, modify, and/or distribute'));
  assert.match(current,/THE SOFTWARE IS PROVIDED \"AS IS\"/);assert.doesNotMatch(current,/GNU GENERAL PUBLIC LICENSE/);
  assert.match(old,/GNU GENERAL PUBLIC LICENSE/);
});
