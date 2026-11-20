'use strict';
// Regressions for defects found during the 2026-11-20 quality pass. These are
// additional checks; the frozen evaluator suites and case lists are unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const h = require('./website-helpers.cjs');
const { fs, path, root } = h;

const cli = (args, cwd) => spawnSync(process.execPath, [path.join(root, 'cli.js'), ...args], { cwd, encoding: 'utf8', timeout: 5000 });

async function database(t) {
  const directory = await h.temporary(t, 'und-quality-'), db = path.join(directory, 'db');
  const api = h.realStore(); await api.path(db);
  const first = await api.put({ id: 'alice' });
  const second = await api.put(first);
  await api.put(second);
  return { directory, db, api };
}

test('quality cli: clean refuses a missing database instead of creating it', async t => {
  const directory = await h.temporary(t, 'und-quality-'), missing = path.join(directory, 'typo', 'deep');
  const result = cli(['clean', missing], directory);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /does not exist/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.deepEqual(await fs.readdir(directory), [], 'no directory may be created by cleanup');
});

test('quality cli: --depth=N and -- operand separator are parsed and validated', async t => {
  const { directory, db } = await database(t);
  const inline = cli(['clean', db, '--depth=2'], directory);
  assert.equal(inline.status, 0, inline.stderr); assert.equal(inline.stdout, '');
  assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2);
  for (const args of [['clean', db, '--depth='], ['clean', db, '--depth=0'], ['clean', db, '--depth=x'], ['clean', db, '--depth=1', '-d', '1'], ['clean', '--', db, 'extra'], ['clean', '--', db, '--depth']]) {
    const result = cli(args, directory);
    assert.notEqual(result.status, 0, args.join(' ')); assert.equal(result.stdout, ''); assert.ok(result.stderr.trim());
    assert.equal((await fs.readdir(path.join(db, 'alice'))).length, 2, args.join(' '));
  }
  const dashed = path.join(directory, '-db'); await fs.rename(db, dashed);
  const separated = cli(['clean', '-d', '1', '--', '-db'], directory);
  assert.equal(separated.status, 0, separated.stderr);
  assert.equal((await fs.readdir(path.join(dashed, 'alice'))).length, 1);
});

test('quality website: close does not wait for a keep-alive connection to time out', async t => {
  const entered = h.gate(), release = h.gate(); t.after(() => release.resolve());
  const s = await h.site(t, { assetRoot: h.assetRoot, createStore() { const store = h.realStore(); return { ...store, async put(data) { entered.resolve(); await release.promise; return store.put(data); } }; } });
  const a = await h.session(s.url);
  const putting = h.op(s.url, a.cookie, 'put', [{ id: 'pending' }]); await entered.promise;
  const started = Date.now(), closing = s.close();
  release.resolve();
  assert.equal((await putting).result.rev, 1);
  await closing;
  assert.ok(Date.now() - started < 2000, 'shutdown must not idle until the client drops its connection');
});

test('quality website: example source is embedded literally and HEAD reports its length', async t => {
  const s = await h.site(t, { assetRoot: h.assetRoot });
  const page = await h.request(s.url, '/');
  for (const name of ['tutorial', 'patterns']) {
    const source = await fs.readFile(path.join(root, 'website/examples', name + '.cjs'), 'utf8');
    const escaped = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    assert.ok(page.text.includes(escaped), name + ' source appears unmodified');
  }
  const head = await h.request(s.url, '/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.bytes.length, 0);
  assert.equal(Number(head.headers['content-length']), page.bytes.length);
});

test('quality storage: a failed first put leaves no empty record and concurrent writers still publish', async t => {
  const directory = await h.temporary(t, 'und-quality-'), db = path.join(directory, 'db');
  const promises = require('node:fs/promises'), api = h.realStore(); await api.path(db);
  const link = promises.link; t.after(() => { promises.link = link; });
  promises.link = async () => { throw Object.assign(new Error('injected link failure'), { code: 'EIO' }); };
  await assert.rejects(api.put({ id: 'ghost' }), /injected/);
  promises.link = link;
  assert.equal(await api.has('ghost'), false); assert.deepEqual(await api.all(), []);
  assert.equal(await api.get('ghost'), null); assert.equal(await api.rev('ghost'), 0);
  assert.deepEqual(await fs.readdir(db), [], 'no record directory or staging file remains');
  // A directory the caller made is not this put's to withdraw.
  await fs.mkdir(path.join(db, 'kept'));
  promises.link = async () => { throw Object.assign(new Error('injected link failure'), { code: 'EIO' }); };
  await assert.rejects(api.put({ id: 'kept' }));
  promises.link = link;
  assert.equal(await api.has('kept'), true);
  // One writer fails while others publish the same new record: every success survives.
  let failures = 0;
  promises.link = async (...args) => { if (failures++ % 2 === 0) throw Object.assign(new Error('injected link failure'), { code: 'EIO' }); return link(...args); };
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => api.put({ id: 'shared' })));
  promises.link = link;
  const saved = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  assert.equal(saved.length, 6);
  assert.deepEqual((await fs.readdir(path.join(db, 'shared'))).sort(), saved.map(doc => doc.rev + '-' + doc.uid + '.json').sort());
});

test('quality website: samples are bounded by least-recently-used and idle retirement', async t => {
  const locations = [];
  const createStore = () => { const store = h.realStore(); return { ...store, async path(location) { locations.push(location); return store.path(location); } }; };
  const s = await h.site(t, { assetRoot: h.assetRoot, createStore, maxSessions: 2 });
  const a = await h.session(s.url), b = await h.session(s.url);
  await h.op(s.url, a.cookie, 'put', [{ id: 'recent' }]);
  const c = await h.session(s.url);
  await h.tick();
  await assert.rejects(fs.lstat(locations[1]), { code: 'ENOENT' }, 'least recently used sample is removed');
  h.failure(await h.request(s.url, '/api/state', { cookie: b.cookie }));
  assert.deepEqual((await h.current(s.url, a.cookie)).ids, ['recent']);
  assert.deepEqual((await h.current(s.url, c.cookie)).ids, []);

  const brief = await h.site(t, { assetRoot: h.assetRoot, sessionIdleMs: 1 });
  const old = await h.session(brief.url); await h.tick();
  await h.session(brief.url);
  assert.equal((await h.request(brief.url, '/api/state', { cookie: old.cookie })).status, 401);
  for (const options of [{ maxSessions: 0 }, { sessionIdleMs: 1.5 }, { maxIntents: -1 }]) await assert.rejects(h.loadSite()({ port: 0, ...options }), TypeError);
});

test('quality website: a full set of busy samples refuses a new one without disturbing them', async t => {
  const entered = h.gate(), release = h.gate(); t.after(() => release.resolve());
  const s = await h.site(t, { assetRoot: h.assetRoot, maxSessions: 1, createStore() { const store = h.realStore(); return { ...store, async put(data) { entered.resolve(); await release.promise; return store.put(data); } }; } });
  const a = await h.session(s.url);
  const putting = h.op(s.url, a.cookie, 'put', [{ id: 'busy' }]); await entered.promise;
  const refused = await h.request(s.url, '/api/session');
  assert.equal(refused.status, 503); assert.equal(h.failure(refused, 5).error.code, 'SESSION_LIMIT'); assert.ok(refused.headers['retry-after']);
  release.resolve();
  assert.equal((await putting).result.rev, 1);
  assert.deepEqual((await h.current(s.url, a.cookie)).ids, ['busy']);
});

test('quality website: the intent ledger is bounded and recent receipts still replay', async t => {
  const { randomUUID } = require('node:crypto');
  const s = await h.site(t, { assetRoot: h.assetRoot, maxIntents: 3 });
  const a = await h.session(s.url), intents = [];
  const put = (intent, n) => h.request(s.url, '/api/operation', { method: 'POST', cookie: a.cookie, body: { method: 'put', args: [{ id: 'doc', n }] }, headers: { 'X-Und-Intent': intent } });
  for (let n = 0; n < 6; n++) { intents.push(randomUUID()); h.success(await put(intents[n], n)); }
  const replay = h.success(await put(intents[5], 5));
  assert.equal(replay.result.rev, 6, 'a recent intent returns its original receipt');
  assert.equal((await h.current(s.url, a.cookie)).writes.length, 6, 'replay wrote nothing');
});

test('quality website: the session write list keeps the newest saves and counts the rest', async t => {
  const s = await h.site(t, { assetRoot: h.assetRoot, maxWrites: 3 });
  const a = await h.session(s.url);
  for (let n = 1; n <= 5; n++) await h.op(s.url, a.cookie, 'put', [{ id: 'doc', n }]);
  const state = h.success(await h.request(s.url, '/api/state', { cookie: a.cookie })).state;
  assert.deepEqual(state.writes.map(write => write.rev), [3, 4, 5]);
  const raw = (await h.request(s.url, '/api/state', { cookie: a.cookie })).json.state;
  assert.equal(raw.omittedWrites, 2);
  assert.equal((await h.op(s.url, a.cookie, 'rev', ['doc'])).result, 5, 'stored revisions are untouched');
  await h.op(s.url, a.cookie, 'reset');
  const cleared = (await h.request(s.url, '/api/state', { cookie: a.cookie })).json.state;
  assert.deepEqual(cleared.writes, []); assert.equal(cleared.omittedWrites, 0);
});
