'use strict';
// Run from the checkout: node website/examples/patterns.cjs
const und = require('../../index.js');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
async function patterns() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'und-patterns-'));
  try {
    const db = und({}); await db.path(directory);
    const one = await db.put({id:'profile', name:'Mira', color:'blue'});
    const two = await db.put({...one, name:'Mira Chen'});
    const left = await db.put({...two, name:'Mira A'});
    const right = await db.put({...two, color:'green'});
    console.log('Both same-base revision 3 documents:', {left, right});
    console.log('Selected document (not a merge):', await db.get('profile'));
    // all() is a list of IDs. This loop is not an atomic multi-record snapshot.
    for (const id of await db.all()) console.log('Record:', id, await db.get(id));
    assert.equal(await db.get('missing'), null);
    console.log('Missing returns null; a failed read instead rejects.');
    try { await db.get('bad/id'); } catch (error) { console.log('Handle validation/read errors:', error.message); }
    const depthTwo = await db.clean(2); assert.equal(depthTwo.length, 1);
    console.log('Keep groups 2 and 3, including both highest writes:', depthTwo);
    const depthOne = await db.clean(1); assert.equal(depthOne.length, 1);
    console.log('Keep group 3 and both writes:', depthOne);
    assert.deepEqual(await db.clean(1), []);
    const selected = await db.get('profile');
    console.log('Application explicitly chooses both fields:', await db.put({...selected, name:left.name, color:right.color}));
    // Always pass this owned sample path. No argument would use the current directory.
    const cli = path.resolve(__dirname, '../../cli.js');
    const result = await promisify(execFile)(process.execPath, [cli, 'clean', directory, '--depth', '1']);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
    console.log('Direct CLI cleanup succeeded silently with an explicit sample path.');
  } finally { await fs.rm(directory, {recursive:true, force:true}); }
}
patterns().catch(error => { console.error(error.message); process.exitCode = 1; });
