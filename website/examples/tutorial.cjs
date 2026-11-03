'use strict';
// Run from the checkout: node website/examples/tutorial.cjs
const und = require('../../index.js');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
async function tutorial() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'und-tutorial-'));
  try {
    const db = und({});
    await db.path(directory); // Factory creation does no I/O. Await initialization.
    console.log('Empty:', await db.all(), await db.get('profile'), await db.rev('profile'));
    const first = await db.put({id:'profile', name:'Mira', color:'blue'});
    console.log('Created with revision 1 and a fresh uid:', first);
    const updated = await db.put({...first, name:'Mira Chen'});
    assert.equal(updated.rev, 2);
    console.log('Updated:', updated);
    console.log('List, presence, revision:', await db.all(), await db.has('profile'), await db.rev('profile'));
    const reopened = und({}); await reopened.path(directory);
    assert.deepEqual(await reopened.get('profile'), updated);
    console.log('A second instance reads the same saved document.');
    // Deliberately use the exact same base twice: this is not a concurrency test.
    const left = await db.put({...updated, name:'Mira A'});
    const right = await db.put({...updated, color:'green'});
    assert.equal(left.rev, right.rev); assert.notEqual(left.uid, right.uid);
    console.log('Two edits from one base:', {left, right});
    const selected = await db.get('profile');
    assert.ok([left.uid, right.uid].includes(selected.uid));
    console.log('Actual get selects one, without merging fields:', selected);
    // Application policy explicitly combines fields; und does not decide a merge.
    const combined = await db.put({...selected, name:left.name, color:right.color});
    console.log('Application chose both fields:', combined);
    try { await db.get('../invalid'); assert.fail('Invalid ID should reject'); }
    catch (error) { assert.match(error.message, /id|component/i); console.log('Handled validation error:', error.message); }
    console.log('Writers stopped; clean keeps the highest group. Removed paths:', await db.clean(1));
    assert.deepEqual(await db.clean(1), []);
  } finally { await fs.rm(directory, {recursive:true, force:true}); }
}
tutorial().catch(error => { console.error(error.message); process.exitCode = 1; });
