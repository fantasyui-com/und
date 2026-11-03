'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const state = () => import(pathToFileURL(path.join(__dirname, '../website/public/state.mjs')));

test('website state: signal binds its initial value, updates and unsubscribes', async () => {
  const {Signal, SignalBinder} = await state();
  const value = Signal('empty'), element = {textContent:''};
  const unbind = SignalBinder(element, value);
  assert.equal(element.textContent, 'empty');
  value.set('<script>literal</script>');
  assert.equal(element.textContent, '<script>literal</script>');
  assert.equal(value.get(), '<script>literal</script>');
  unbind(); value.set('later');
  assert.equal(element.textContent, '<script>literal</script>');
});

test('website state: reentrant signal updates preserve coherent revision delivery', async () => {
  const {Signal} = await state(); const signal = Signal(0), observed=[];
  signal.subscribe(value => { if(value === 1) signal.set(2); });
  signal.subscribe(value => observed.push([value, signal.get()]));
  signal.set(1);
  assert.deepEqual(observed, [[1,1],[2,2]]);
});

test('website state: emitter uses ordered snapshots and removes subscriptions', async () => {
  const {EventEmitter} = await state(); const events = EventEmitter(), seen=[];
  let removeSecond;
  events.subscribe(value => { seen.push('a'+value); if(value===1){removeSecond();events.emit(2);} });
  removeSecond=events.subscribe(value => seen.push('b'+value));
  events.emit(1); assert.deepEqual(seen,['a1','b1','a2']);
});

test('website state: disposal closes admission and attempts every owned cleanup', async () => {
  const {DisposableScope} = await state(); const owner = DisposableScope(), seen=[];
  owner.use(()=>seen.push('first')); owner.use(()=>{seen.push('fault');throw Error('cleanup fault');});
  owner.use(()=>seen.push('last'));
  assert.throws(()=>owner.dispose(), /cleanup|dispos/i);
  assert.deepEqual(new Set(seen),new Set(['first','fault','last']));
  owner.dispose(); assert.equal(seen.length,3);
  owner.use(()=>seen.push('late')); assert.equal(seen.at(-1),'late');
});
