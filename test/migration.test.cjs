'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const project = path.resolve(__dirname, '..');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const highUUID = 'a2aaaaaa-0000-4000-8000-000000000000';
const lowUUID = 'a10bbbbb-0000-4000-8000-000000000000';
const uuid = 'ffffffff-0000-4000-8000-000000000000';
const duration = 6000;
const factory = () => require(path.join(project, 'index.js'))({});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'und-migration-check-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function store(t) {
  const root = await fixture(t), api = factory();
  const db = path.join(root, 'db');
  await api.path(db);
  return { api, root, db };
}
async function revision(db, id, rev, uid, extra = {}) {
  await fs.mkdir(path.join(db, id), { recursive: true });
  const doc = { id, rev, uid, ...extra };
  const filename = `${rev}-${uid}.json`;
  await fs.writeFile(path.join(db, id, filename), JSON.stringify(doc));
  return { doc, file: path.join(db, id, filename) };
}
async function bounded(promise, ms = 1500) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('operation did not settle')), ms); })]); }
  finally { clearTimeout(timer); }
}
function rejectsSoon(promise, ...expected) {
  return bounded(assert.rejects(promise, ...expected));
}
function cli(args, cwd) {
  return spawnSync(process.execPath, [path.join(project, 'cli.js'), ...args], { cwd, encoding: 'utf8', timeout: 2500, maxBuffer: 1024 * 1024 });
}
function child(script, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['-e', script, ...args], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('child timed out')); }, 3000);
    proc.stdout.on('data', data => { stdout += data; });
    proc.stderr.on('data', data => { stderr += data; });
    proc.once('error', error => { clearTimeout(timer); reject(error); });
    proc.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}

test('package: next major, dependency-free manifests and a built-in test entry', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(project, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, '3.0.0');
  assert.equal(lock.version, pkg.version);
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) assert.equal(Object.keys(pkg[key] ?? {}).length, 0, key);
  for (const key of ['bundledDependencies', 'bundleDependencies']) assert.ok(pkg[key] === undefined || Array.isArray(pkg[key]) && pkg[key].length === 0, key);
  assert.match(pkg.scripts.test, /^node\s+--test\s/);
  assert.match(pkg.scripts.test, /test\//, 'select actual tests explicitly; historical sketches remain outside the runner');
  assert.equal(pkg.ava, undefined);
  assert.deepEqual(Object.keys(lock.dependencies ?? {}), []);
  assert.deepEqual(Object.keys(lock.packages ?? {}).sort(), ['']);
  assert.equal(lock.packages[''].version, pkg.version);
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) assert.equal(Object.keys(lock.packages[''][key] ?? {}).length, 0, key);
});

test('package: original unfinished sketches and license are retained as historical source', async () => {
  const freeze = JSON.parse(await fs.readFile(path.join(__dirname, 'historical-files.json'), 'utf8'));
  for (const [file, expected] of Object.entries(freeze)) {
    const actual = createHash('sha256').update(await fs.readFile(path.join(project, file))).digest('hex');
    assert.equal(actual, expected, `retain ${file}; do not invent or silently delete unfinished features`);
  }
  const readme = await fs.readFile(path.join(project, 'README.md'), 'utf8');
  assert.match(readme, /unfinished|unimplemented/i, 'document the distinction between the published API and ESM sketches');
  assert.match(readme, /index\.mjs/);
});

test('storage: explicit initialization and nested directory creation', { timeout: duration }, async t => {
  const root = await fixture(t), api = factory();
  await rejectsSoon(api.get('alice'));
  await api.path(path.join(root, 'nested', 'db'));
  assert.equal((await fs.stat(path.join(root, 'nested', 'db'))).isDirectory(), true);
  assert.equal(await api.get('missing'), null);
  assert.equal(await api.has('missing'), false);
  assert.equal(await api.rev('missing'), 0);
  assert.deepEqual(await api.all(), []);
  await fs.mkdir(path.join(root, 'nested', 'db', 'empty'));
  assert.equal(await api.has('empty'), true);
  assert.equal(await api.get('empty'), null);
  assert.equal(await api.rev('empty'), 0);
  await fs.writeFile(path.join(root, 'file'), 'unchanged');
  await rejectsSoon(api.path(path.join(root, 'file')));
});

test('storage: put/get persistence, UUIDs, input preservation and independent instances', { timeout: duration }, async t => {
  const { api, db } = await store(t), input = { id: 'alice', name: 'Alice', nested: { active: true } };
  const first = await api.put(input);
  assert.deepEqual(input, { id: 'alice', name: 'Alice', nested: { active: true } });
  assert.notEqual(first, input);
  assert.equal(first.rev, 1); assert.match(first.uid, uuidPattern);
  assert.deepEqual(await api.get('alice'), first);
  assert.equal(await api.rev('alice'), 1);
  const second = await api.put({ ...first, name: 'Second' });
  assert.equal(second.rev, 2); assert.notEqual(second.uid, first.uid);
  const again = factory(); await again.path(db);
  assert.deepEqual(await again.get('alice'), second);
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
  const third = await api.put({ id: 'alice', rev: null, name: 'Third' });
  assert.equal(third.rev, 3);
  const fourth = await api.put({ id: 'alice', rev: 0 });
  assert.equal(fourth.rev, 4);
  const stale = await api.put({ id: 'alice', rev: 1, name: 'Stale branch' });
  assert.equal(stale.rev, 2, 'explicit old base must retain conflict history, not silently rebase');
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 5);
  assert.deepEqual(await api.get('alice'), fourth);
});

test('storage: numeric revisions and locale-independent full-filename tie breaking', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  await revision(db, 'alice', 9, uuid, { value: 'older' });
  const loser = await revision(db, 'alice', 10, lowUUID, { value: 'same-revision loser' });
  const winner = await revision(db, 'alice', 10, highUUID, { value: 'lexical winner' });
  assert.ok(winner.file > loser.file);
  assert.equal(await api.rev('alice'), 10);
  assert.deepEqual(await api.get('alice'), winner.doc);
});

test('storage: clean preserves all tied revisions, respects depth and is idempotent', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  const old = await revision(db, 'alice', 8, uuid);
  const previous = await revision(db, 'alice', 9, uuid);
  const a = await revision(db, 'alice', 10, lowUUID);
  const b = await revision(db, 'alice', 10, highUUID);
  assert.deepEqual((await api.clean(2)).sort(), [old.file]);
  assert.deepEqual((await fs.readdir(path.join(db, 'alice'))).sort(), [previous.file, a.file, b.file].map(p => path.basename(p)).sort());
  assert.deepEqual((await api.clean()).sort(), [previous.file]);
  assert.deepEqual((await fs.readdir(path.join(db, 'alice'))).sort(), [a.file, b.file].map(p => path.basename(p)).sort());
  assert.deepEqual(await api.clean(), []);
  for (const depth of [0, -1, 1.5, '2', NaN, Infinity]) await rejectsSoon(api.clean(depth), String(depth));
});

test('storage: all lists records deterministically and preserves unrelated root files', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  await api.put({ id: 'zebra' }); await api.put({ id: 'alice' });
  await fs.writeFile(path.join(db, 'notes.txt'), 'keep');
  assert.deepEqual(await api.all(), ['alice', 'zebra']);
  assert.equal(await api.has('notes.txt'), false, 'a file is not a record directory');
  await api.clean();
  assert.equal(await fs.readFile(path.join(db, 'notes.txt'), 'utf8'), 'keep');
});

test('storage: invalid IDs, invalid revisions and unserializable data do not create records', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  for (const id of ['', '.', '..', '../outside', 'a/b', 'a\\b', 'bad\0id', 0, 7, null]) {
    for (const method of ['get', 'has', 'rev']) await rejectsSoon(api[method](id), `${method} ${String(id)}`);
    await rejectsSoon(api.put({ id }), String(id));
  }
  for (const rev of [-1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) await rejectsSoon(api.put({ id: 'alice', rev }), String(rev));
  await rejectsSoon(api.put(null));
  await rejectsSoon(api.put([]));
  const cyclic = { id: 'alice' }; cyclic.self = cyclic;
  await rejectsSoon(api.put(cyclic));
  await rejectsSoon(api.put({ id: 'alice', unsupported: 1n }));
  assert.deepEqual(await fs.readdir(db), [], 'validation must precede creating a record');
});

test('storage: corrupt latest data is reported and clean does not destroy that record', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  await revision(db, 'alice', 1, uuid);
  const broken = await revision(db, 'alice', 2, uuid);
  await fs.writeFile(broken.file, '{broken');
  await rejectsSoon(api.get('alice'));
  await rejectsSoon(api.clean());
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
  await fs.writeFile(broken.file, JSON.stringify({ id: 'mallory', rev: 2, uid: uuid }));
  await rejectsSoon(api.get('alice'));
  await fs.writeFile(broken.file, JSON.stringify(broken.doc));
  await fs.writeFile(path.join(db, 'alice', 'unexpected.txt'), 'keep');
  await rejectsSoon(api.get('alice'));
  await rejectsSoon(api.clean());
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 3);
});

test('storage: symlink records/files reject without changing external data', { timeout: duration }, async t => {
  const { api, root, db } = await store(t), outside = path.join(root, 'outside');
  await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'keep'), 'untouched');
  await fs.symlink(outside, path.join(db, 'linked'));
  for (const method of ['get', 'has', 'rev']) await rejectsSoon(api[method]('linked'), method);
  await rejectsSoon(api.put({ id: 'linked' }));
  await rejectsSoon(api.all());
  await rejectsSoon(api.clean());
  await fs.unlink(path.join(db, 'linked'));
  await fs.mkdir(path.join(db, 'alice'));
  await fs.symlink(path.join(outside, 'keep'), path.join(db, 'alice', `1-${uuid}.json`));
  await rejectsSoon(api.get('alice'));
  await rejectsSoon(api.clean());
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'untouched');
  const other = factory();
  await fs.symlink(outside, path.join(root, 'root-link'));
  await rejectsSoon(other.path(path.join(root, 'root-link')));
  await rejectsSoon(other.path(path.join(root, 'root-link', 'nested')));
  await assert.rejects(fs.stat(path.join(outside, 'nested')), { code: 'ENOENT' });
});

test('storage: simultaneous writers retain every same-base revision and leak no stdout', { timeout: duration }, async t => {
  const { api, db } = await store(t);
  await api.put({ id: 'alice', name: 'base' });
  const script = `const make=require(${JSON.stringify(path.join(project, 'index.js'))});(async()=>{const db=make({});await db.path(process.argv[1]);await db.put({id:'alice',rev:1,writer:process.argv[2]});})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => child(script, [db, String(i)])));
  for (const result of results) { assert.equal(result.code, 0, result.stderr); assert.equal(result.signal, null); assert.equal(result.stdout, '', 'library must not print document contents'); }
  const files = await fs.readdir(path.join(db, 'alice'));
  assert.equal(files.length, 7);
  const docs = await Promise.all(files.map(file => fs.readFile(path.join(db, 'alice', file), 'utf8').then(JSON.parse)));
  assert.equal(new Set(docs.map(d => d.uid)).size, 7);
  assert.equal(docs.filter(d => d.rev === 2).length, 6);
  assert.deepEqual(docs.filter(d => d.rev === 2).map(d => d.writer).sort(), ['0', '1', '2', '3', '4', '5']);
  await api.clean();
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 6, 'cleanup preserves every same-revision conflict');
});

test('cli: help, no-argument help and package-derived version', { timeout: duration }, async t => {
  const root = await fixture(t);
  for (const args of [[], ['--help'], ['clean', '--help']]) {
    const result = cli(args, root);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.error, undefined);
    assert.match(result.stdout, /usage/i); assert.match(result.stdout, /clean/); assert.equal(result.stderr, '');
  }
  for (const args of [['--version'], ['-V']]) {
    const result = cli(args, root);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), '3.0.0'); assert.equal(result.stderr, '');
  }
});

test('cli: explicit and default database, depth and conflict-preserving cleanup', { timeout: duration }, async t => {
  const root = await fixture(t), db = path.join(root, 'db');
  const old = await revision(db, 'alice', 8, uuid);
  const previous = await revision(db, 'alice', 9, uuid);
  const a = await revision(db, 'alice', 10, lowUUID);
  const b = await revision(db, 'alice', 10, highUUID);
  const two = cli(['clean', db, '--depth', '2'], root);
  assert.equal(two.status, 0, two.stderr);
  await assert.rejects(fs.stat(old.file), { code: 'ENOENT' });
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 3);
  const one = cli(['clean'], db);
  assert.equal(one.status, 0, one.stderr);
  await assert.rejects(fs.stat(previous.file), { code: 'ENOENT' });
  assert.deepEqual((await fs.readdir(path.join(db, 'alice'))).sort(), [a.file, b.file].map(p => path.basename(p)).sort());
  const short = cli(['clean', db, '-d', '1'], root);
  assert.equal(short.status, 0, short.stderr);
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
});

test('cli: invalid commands/options/depths fail before storage mutation', { timeout: duration }, async t => {
  const root = await fixture(t), db = path.join(root, 'db');
  await revision(db, 'alice', 1, uuid); await revision(db, 'alice', 2, uuid);
  const invalid = [
    ['unknown'], ['--unknown'], ['clean', db, '--unknown'], ['clean', db, 'extra'],
    ['clean', db, '--depth'], ['clean', db, '--depth', '0'], ['clean', db, '--depth', '-1'],
    ['clean', db, '--depth', '1.5'], ['clean', db, '--depth', 'abc'],
    ['clean', db, '--depth', '9007199254740992'], ['clean', db, '-d', '1', '--depth', '2']
  ];
  for (const args of invalid) {
    const result = cli(args, root);
    assert.notEqual(result.status, 0, args.join(' ')); assert.equal(result.error, undefined);
    assert.equal(result.stdout, '', args.join(' ')); assert.ok(result.stderr.trim(), args.join(' '));
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|Cannot find module|\n\s+at /, 'an import failure or uncaught stack is not argument validation');
    assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
  }
  await fs.writeFile(path.join(root, 'file'), 'keep');
  const badPath = cli(['clean', path.join(root, 'file')], root);
  assert.notEqual(badPath.status, 0); assert.ok(badPath.stderr.trim());
  assert.equal(await fs.readFile(path.join(root, 'file'), 'utf8'), 'keep');
});
