'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const make = () => require(path.join(root, 'index.js'))({});
const uid = 'ffffffff-0000-4000-8000-000000000000';
async function setup(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'und-extra-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const db = path.join(temp, 'db'), api = make();
  await api.path(db);
  return { api, temp, db };
}
async function write(db, id, rev, body) {
  await fs.mkdir(path.join(db, id), { recursive: true });
  await fs.writeFile(path.join(db, id, `${rev}-${uid}.json`), body ?? JSON.stringify({ id, rev, uid }));
}

test('regression: serialization cannot replace stored identity or create an unreadable document', async t => {
  const { api, db } = await setup(t);
  for (const toJSON of [() => null, () => ({ id: 'mallory' }), () => 'text', () => []]) {
    await assert.rejects(api.put({ id: 'alice', toJSON }));
    assert.deepEqual(await fs.readdir(db), []);
  }
});

test('extra: old corrupt revisions prevent any deletion of that record', async t => {
  const { api, db } = await setup(t);
  await write(db, 'alice', 1, '{broken');
  await write(db, 'alice', 2);
  const before = await fs.readdir(path.join(db, 'alice'));
  await assert.rejects(api.clean());
  assert.deepEqual(await fs.readdir(path.join(db, 'alice')), before);
});

test('extra: observed maximum-safe revision rejects the next write without mutation', async t => {
  const { api, db } = await setup(t);
  await write(db, 'alice', Number.MAX_SAFE_INTEGER);
  await assert.rejects(api.put({ id: 'alice' }));
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 1);
});

test('extra: failed path reconfiguration retains the last valid location', async t => {
  const { api, db, temp } = await setup(t);
  await fs.writeFile(path.join(temp, 'collision'), 'keep');
  for (const location of ['', null, 42, 'a\0b', path.join(temp, 'collision')]) await assert.rejects(api.path(location));
  await api.put({ id: 'alice' });
  assert.deepEqual(await fs.readdir(db), ['alice']);
});

test('extra: a storage ancestor replaced with a symlink is refused before writing', async t => {
  const { api, temp, db } = await setup(t);
  const outside = path.join(temp, 'outside');
  await fs.mkdir(outside);
  await fs.rmdir(db);
  await fs.symlink(outside, db);
  await assert.rejects(api.put({ id: 'alice' }));
  assert.deepEqual(await fs.readdir(outside), []);
});

test('extra: retired, duplicate and mixed help arguments fail with no output or mutation', async t => {
  const { db } = await setup(t);
  await write(db, 'alice', 1);
  await write(db, 'alice', 2);
  const invalid = [['--no-tests'], ['--help', '--unknown'], ['--version', '--version'], ['clean', '--help', '--help'], ['clean', '--help', '--unknown'], ['clean', '--depth', '1', '-d', '1']];
  for (const args of invalid) {
    const r = spawnSync(process.execPath, [path.join(root, 'cli.js'), ...args], { cwd: db, encoding: 'utf8', timeout: 3000 });
    assert.equal(r.error, undefined);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.trim());
    assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
  }
});

// Independent review regression, retained from .nt/drafts/R-006-unicode-regression.test.cjs
test('regression: a successful put must remain addressable by its enumerated ID and cleanable', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'und-lilith-unicode-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const api = make({}); await api.path(dir);
  const id = '\ud800';
  let result;
  try { result = await api.put({ id, value: 'first' }); }
  catch (error) {
    assert.deepEqual(await fs.readdir(dir), [], 'a rejected unrepresentable ID must not create storage');
    return;
  }
  assert.equal(result.id, id);
  assert.deepEqual(await api.all(), [id], 'successful storage must not change the record ID');
  assert.deepEqual(await api.get((await api.all())[0]), result);
  assert.deepEqual(await api.clean(), []);
});

test('regression: distinct JavaScript IDs must not silently alias the same record directory', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'und-lilith-alias-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const api = make({}); await api.path(dir);
  let saved;
  try { saved = await api.put({ id: '\ud800', value: 'first' }); }
  catch (error) { assert.deepEqual(await fs.readdir(dir), []); return; }
  let second;
  try { second = await api.put({ id: '\ud801', value: 'second' }); }
  catch (error) { assert.deepEqual(await api.get('\ud800'), saved); return; }
  assert.equal(second.rev, 1, 'a distinct new ID must not inherit the first ID revision');
  assert.deepEqual(await api.get('\ud800'), saved);
  assert.deepEqual(await api.get('\ud801'), second);
});

// Independent review regression, retained from .nt/drafts/R-006-path-regression.test.cjs
test('regression: an unrepresentable storage location rejects before creating any parent or database', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'und-lilith-path-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const api = make({});
  const operation = api.path(path.join(dir, 'new-parent', '\ud800', 'db'));
  let error;
  try { await operation; } catch (e) { error = e; }
  const names = await fs.readdir(dir);
  assert.ok(error, 'an unpaired surrogate cannot represent the selected filesystem path losslessly');
  assert.deepEqual(names, [], 'invalid storage location validation precedes creation of any parent');
  await assert.rejects(api.all(), /not configured/);
});

test('regression: distinct requested storage paths must not silently share data', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'und-lilith-path-alias-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const first = make({}), second = make({});
  try { await first.path(path.join(dir, '\ud800')); }
  catch (e) { assert.deepEqual(await fs.readdir(dir), []); return; }
  await first.put({ id: 'alice', value: 'private-to-first-directory' });
  try { await second.path(path.join(dir, '\ud801')); }
  catch (e) { return; }
  assert.equal(await second.get('alice'), null, 'a distinct database path must not expose the first database');
});

const malformedUnicode = ['\ud800', '\udbff', '\udc00', '\udfff', 'a\ud800', '\udc00z', 'a\ud800z', '\ud800\ud800', '\udc00\ud800', '\ud83d\ude00\ud800'];

async function snapshot(directory) {
  const entries = [];
  for (const name of (await fs.readdir(directory)).sort()) {
    const file = path.join(directory, name);
    const stat = await fs.lstat(file);
    entries.push(stat.isDirectory() ? [name, await snapshot(file)] : [name, await fs.readFile(file, 'hex')]);
  }
  return entries;
}

test('regression: malformed Unicode IDs reject across all record methods without changing valid data', async t => {
  const { api, db } = await setup(t);
  const replacement = await api.put({ id: '\ufffd', value: 'literal replacement character' });
  const before = await snapshot(db);
  for (const id of malformedUnicode) {
    for (const method of ['get', 'has', 'rev']) {
      await assert.rejects(api[method](id), /well-formed Unicode/, `${method}: ${JSON.stringify(id)}`);
    }
    await assert.rejects(api.put({ id, value: 'invalid ID' }), /well-formed Unicode/, JSON.stringify(id));
    assert.deepEqual(await snapshot(db), before, 'rejected input must not create or alter a record');
  }
  assert.deepEqual(await api.get('\ufffd'), replacement);
  assert.deepEqual(await api.clean(), []);
});

test('regression: valid Unicode IDs remain distinct, addressable and cleanable', async t => {
  const { api, db } = await setup(t);
  const ids = ['\ufffd', '\ud83d\ude00', '\u00e9', 'e\u0301', '\u6c49\u5b57', '\ud7ff', '\ue000', '\ud800\udc00', '\udbff\udfff'];
  const saved = new Map();
  for (const id of ids) {
    const first = await api.put({ id, value: id });
    assert.equal(first.rev, 1, 'distinct valid Unicode IDs must not alias existing records');
    saved.set(id, await api.put({ ...first, value: `updated ${id}` }));
  }
  assert.deepEqual(await api.all(), [...ids].sort());
  assert.equal((await api.clean()).length, ids.length);
  for (const id of ids) {
    assert.equal(await api.has(id), true);
    assert.equal(await api.rev(id), 2);
    assert.deepEqual(await api.get(id), saved.get(id));
    assert.equal((await fs.readdir(path.join(db, id))).length, 1);
  }
  assert.deepEqual(await api.clean(), []);
});

test('regression: invalid Unicode reconfiguration preserves the selected database and creates no parents', async t => {
  const { api, db, temp } = await setup(t);
  const saved = await api.put({ id: 'alice', value: 'original selection' });
  const before = await snapshot(temp);
  for (const [index, fragment] of malformedUnicode.entries()) {
    const location = path.join(temp, `missing-parent-${index}`, fragment, 'db');
    await assert.rejects(api.path(location), /well-formed Unicode/, JSON.stringify(location));
    assert.deepEqual(await snapshot(temp), before, 'path validation must precede every parent creation');
    assert.deepEqual(await api.get('alice'), saved);
  }
  await api.put({ id: 'bob' });
  assert.deepEqual(await fs.readdir(db), ['alice', 'bob']);
});

test('regression: valid Unicode storage paths retain separate databases without normalization', async t => {
  const { temp } = await setup(t);
  const names = ['\ufffd', '\ud83d\ude00', '\u00e9', 'e\u0301', '\ud800\udc00', '\udbff\udfff'];
  const stores = [];
  for (const name of names) {
    const api = make();
    await api.path(path.join(temp, 'unicode', name, 'db'));
    assert.equal(await api.get('alice'), null, 'new Unicode path must not alias an existing database');
    const saved = await api.put({ id: 'alice', location: name });
    stores.push({ api, saved });
  }
  assert.deepEqual((await fs.readdir(path.join(temp, 'unicode'))).sort(), [...names].sort());
  for (const { api, saved } of stores) assert.deepEqual(await api.get('alice'), saved);
});
