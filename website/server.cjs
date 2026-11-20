'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomUUID, createHash} = require('node:crypto');
const createUnd = require('../index.js');
const root = path.resolve(__dirname, '..');
const vendorFiles = ['bootstrap/bootstrap.min.css', 'bootstrap/bootstrap.bundle.min.js', 'icons/bootstrap-icons.min.css', 'icons/fonts/bootstrap-icons.woff2', 'icons/fonts/bootstrap-icons.woff'];
const htmlEscape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const problem = (status, message, code = 'INVALID_REQUEST') => Object.assign(new Error(message), {status, code});

async function startSite({port = 0, assetRoot = path.join(__dirname, 'public/vendor'), createStore = () => createUnd({}), identity = null, maxSessions = 32, sessionIdleMs = 6 * 60 * 60 * 1000, maxIntents = 256, maxWrites = 100} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('port must be an integer from 0 to 65535');
  for (const [name, value] of Object.entries({maxSessions, sessionIdleMs, maxIntents, maxWrites})) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(name + ' must be a positive safe integer');
  }
  const staticFiles = new Map();
  for (const relative of vendorFiles) {
    try { staticFiles.set('/vendor/' + relative, await fs.readFile(path.join(assetRoot, relative))); }
    catch (error) { throw new Error('Required local asset unavailable: ' + relative + ' (' + error.code + ')'); }
  }
  for (const name of ['app.mjs', 'state.mjs']) staticFiles.set('/' + name, await fs.readFile(path.join(__dirname, 'public', name)));
  let html = await fs.readFile(path.join(__dirname, 'public/index.html'), 'utf8');
  for (const name of ['tutorial', 'patterns']) {
    const bytes = await fs.readFile(path.join(__dirname, 'examples', name + '.cjs'));
    staticFiles.set('/examples/' + name + '.cjs', bytes);
    // A function replacement keeps `$&`-style sequences in example source literal.
    html = html.replace('{{' + name + '}}', () => htmlEscape(bytes.toString()));
  }
  staticFiles.set('/', Buffer.from(html));
  staticFiles.set('/docs/VALIDATION.md', await fs.readFile(path.join(__dirname, 'VALIDATION.md')));
  for (const name of ['README.md', 'MIGRATION.md', 'BEHAVIOR.md', 'LICENSE']) staticFiles.set('/docs/' + name, await fs.readFile(path.join(root, name)));
  const sessions = new Map(), active = new Set(), ownedDirectories = new Set(), retiring = new Set();
  let closing = false, closePromise, stopped, url;
  async function removeOwned(directory) {
    await fs.rm(directory, {recursive:true, force:true});
    ownedDirectories.delete(directory);
  }
  async function cleanupAfterFailure(directory, error) {
    try { await removeOwned(directory); }
    catch (cleanup) {
      const combined = new AggregateError([error, cleanup], error.message + '; sample cleanup failed: ' + cleanup.message, {cause:error});
      combined.code = error.code || 'SAMPLE_ERROR'; throw combined;
    }
    throw error;
  }
  async function sample() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'und-playground-'));
    ownedDirectories.add(directory);
    try { const store = createStore(); await store.path(directory); return {directory, store}; }
    catch (error) { return cleanupAfterFailure(directory, error); }
  }
  // Samples are bounded without a timer: each new session first retires those
  // idle past the limit, then the least recently used idle one when full. Only
  // a session with no request in progress is retired, behind its queued work.
  function retire(key, session) {
    sessions.delete(key);
    const removal = enqueue(session, () => removeOwned(session.directory)).catch(() => {});
    retiring.add(removal); removal.then(() => retiring.delete(removal));
  }
  function admitSession() {
    const now = performance.now();
    const idle = [...sessions].filter(([, session]) => session.busy === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [key, session] of idle) if (now - session.used >= sessionIdleMs) retire(key, session);
    for (const [key, session] of idle) { if (sessions.size < maxSessions) break; if (sessions.has(key)) retire(key, session); }
    if (sessions.size >= maxSessions) throw Object.assign(problem(503, 'Too many Playground samples are in use. Try again shortly.', 'SESSION_LIMIT'), {headers:{'Retry-After':'5'}});
  }
  const snapshot = async session => ({ids:await session.store.all(), writes:session.writes, omittedWrites:session.omittedWrites});
  function enqueue(session, work) {
    const operation = session.tail.then(work);
    session.tail = operation.catch(() => {});
    return operation;
  }
  function admitBody(session) {
    // A reset must account for requests already received even while their bodies
    // are incomplete. Release once they have a queue/duplicate decision or fail.
    const earlier = [...session.receiving];
    let resolve;
    const received = new Promise(done => { resolve = done; });
    session.receiving.add(received);
    return {earlier, release() { session.receiving.delete(received); resolve(); }};
  }
  function jsonBytes(res, status, bytes, headers = {}) {
    // While closing, end the connection with the reply: a keep-alive socket that
    // becomes idle after server.close() would otherwise delay shutdown for seconds.
    if (!res.destroyed) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...(closing ? {Connection:'close'} : {}), ...headers}); res.end(bytes); }
  }
  function json(res, status, value, headers = {}) { jsonBytes(res, status, JSON.stringify(value), headers); }
  function errorReceipt(error) {
    const status = error.status || (error instanceof TypeError || error instanceof RangeError ? 400 : 500);
    return {status, bytes:JSON.stringify({ok:false, error:{code:String(error.code || (status === 400 ? 'VALIDATION' : 'IO_ERROR')), message:error.message || 'Sample operation unavailable.'}})};
  }
  async function body(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw problem(415, 'Send application/json.');
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0, exceeded = false;
      // Keep draining an oversized request so the client receives a useful 413.
      // Ending a for-await iterator here would destroy its socket before reply.
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) {
          if (!exceeded) { exceeded = true; chunks.length = 0; reject(problem(413, 'Sample request exceeds 256 KiB.')); }
        } else if (!exceeded) chunks.push(chunk);
      });
      req.once('end', () => {
        if (exceeded) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(problem(400, 'Malformed JSON. Check quotes, commas and brackets.')); }
      });
      req.once('error', reject);
      req.once('aborted', () => reject(problem(400, 'Request body disconnected.')));
      // 'aborted' is deprecated; an early close must still release this request.
      req.once('close', () => { if (!req.complete) reject(problem(400, 'Request body disconnected.')); });
    });
  }

  async function handle(req, res) {
    let admission, session;
    try {
      if (closing) throw problem(503, 'Playground is shutting down.', 'UNAVAILABLE');
      if (req.headers.host !== new URL(url).host || (req.headers.origin !== undefined && req.headers.origin !== url)) throw problem(403, 'Use this local site origin and Host.', 'ORIGIN');
      const route = req.url.split('?')[0];
      if (route === '/api/identity' && req.method === 'GET') { json(res, 200, {identity}); return; }
      if (!route.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw problem(405, 'Use GET for documentation.');
        const bytes = staticFiles.get(route);
        if (!bytes) throw problem(404, 'Resource not found.', 'NOT_FOUND');
        const ext = path.extname(route);
        const mime = {'.css':'text/css', '.mjs':'text/javascript', '.js':'text/javascript', '.woff2':'font/woff2', '.woff':'font/woff'}[ext] || (route === '/' ? 'text/html' : 'text/plain');
        res.writeHead(200, {'Content-Type':mime + (mime.startsWith('text/') ? '; charset=utf-8' : ''), 'Content-Length':bytes.length, 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      const token = /(?:^|;\s*)und_sample=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      session = sessions.get(token);
      if (session) { session.busy++; session.used = performance.now(); }
      if (route === '/api/session' && req.method === 'GET') {
        let headers = {};
        if (!session) {
          admitSession();
          const key = randomUUID(), reserved = {busy:1, used:performance.now()};
          // Reserve the place before the asynchronous sample so concurrent
          // first visits cannot exceed the limit together.
          sessions.set(key, reserved);
          let owned;
          try { owned = await sample(); } catch (error) { sessions.delete(key); throw error; }
          session = Object.assign(reserved, owned, {writes:[], omittedWrites:0, tail:Promise.resolve(), intents:new Map(), generation:0, receiving:new Set()});
          headers = {'Set-Cookie':'und_sample=' + key + '; HttpOnly; SameSite=Strict; Path=/'};
        }
        const state = await enqueue(session, () => snapshot(session)); json(res, 200, {ok:true, result:null, state}, headers); return;
      }
      if (!session) throw problem(401, 'Initialize a Playground session before this operation.', 'SESSION_REQUIRED');
      if (route === '/api/state' && req.method === 'GET') { json(res, 200, {ok:true, result:null, state:await enqueue(session, () => snapshot(session))}); return; }
      if (route !== '/api/operation' || req.method !== 'POST') throw problem(405, 'Use POST /api/operation for a sample operation.');
      admission = admitBody(session);
      const input = await body(req);
      const arity = new Map([['put',[1]], ['get',[1]], ['has',[1]], ['rev',[1]], ['all',[0]], ['clean',[0,1]], ['reset',[0]]]);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'args,method' || !arity.has(input.method) || !Array.isArray(input.args) || !arity.get(input.method).includes(input.args.length)) throw problem(400, 'Choose put, get, has, rev, all, clean or reset with its documented arguments.');
      // Earlier bodies must reach their queue/duplicate decision before reset.
      // This is bounded to requests received here, not a network-order promise.
      if (input.method === 'reset') await Promise.all(admission.earlier);
      // Identity is optional for existing raw clients. The browser assigns it once
      // per intent, so transport retries join the same in-memory session receipt.
      const intent = req.headers['x-und-intent'];
      let entry;
      if (intent !== undefined) {
        if (typeof intent !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent)) throw problem(400, 'X-Und-Intent must be a UUID-v4.', 'INVALID_INTENT');
        const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        const previous = session.intents.get(intent);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw problem(409, 'This intent already names a different operation or payload.', 'INTENT_CONFLICT');
          const stale = () => previous.generation !== null && previous.generation !== session.generation;
          if (stale()) throw problem(409, 'This intent belongs to a sample before reset. Read the current sample explicitly.', 'STALE_INTENT');
          admission.release();
          const receipt = await previous.promise;
          if (stale()) throw problem(409, 'This intent belongs to a sample before reset. Read the current sample explicitly.', 'STALE_INTENT');
          jsonBytes(res, receipt.status, receipt.bytes); return;
        }
        entry = {fingerprint, generation:null, promise:null, settled:false};
        session.intents.set(intent, entry);
        // Bound the ledger: forget the oldest settled receipts. Pending intents
        // are never dropped, so a transport retry still joins its operation.
        for (const [key, prior] of session.intents) {
          if (session.intents.size <= maxIntents) break;
          if (prior.settled) session.intents.delete(key);
        }
      }
      const execute = async () => {
        if (entry) entry.generation = session.generation;
        let result;
        if (input.method === 'reset') {
          const next = await sample();
          try { await removeOwned(session.directory); }
          catch (error) { return cleanupAfterFailure(next.directory, error); }
          Object.assign(session, next, {writes:[], omittedWrites:0}); result = null;
          session.generation++;
          if (entry) entry.generation = session.generation;
          // Keep small tombstones so an old request cannot resurrect reset data.
          // Release old response values; the reset's own receipt remains reusable.
          for (const prior of session.intents.values()) {
            if (prior !== entry && prior.generation !== null && prior.generation !== session.generation) prior.promise = null;
          }
        } else {
          result = await session.store[input.method](...input.args);
          if (input.method === 'put') {
            session.writes.push(result);
            // The ledger is a teaching aid, not history: keep the newest saves
            // and report how many older returns are no longer listed.
            while (session.writes.length > maxWrites) { session.writes.shift(); session.omittedWrites++; }
          }
        }
        return {ok:true, result, state:await snapshot(session)};
      };
      if (entry) {
        entry.promise = enqueue(session, execute).then(value => ({status:200, bytes:JSON.stringify(value)}), errorReceipt);
        entry.promise.then(() => { entry.settled = true; });
        admission.release();
        const receipt = await entry.promise;
        jsonBytes(res, receipt.status, receipt.bytes);
      } else {
        const operation = enqueue(session, execute);
        admission.release();
        json(res, 200, await operation);
      }
    } catch (error) {
      const receipt = errorReceipt(error); jsonBytes(res, receipt.status, receipt.bytes, error.headers);
    } finally { admission?.release(); if (session) { session.busy--; session.used = performance.now(); } }
  }
  const server = http.createServer((req, res) => {
    const work = handle(req, res); active.add(work); work.finally(() => active.delete(work));
  });
  server.requestTimeout = 15000;
  async function listen(chosen) {
    await new Promise((resolve, reject) => { const fail = e => { server.off('listening', ready); reject(e); }; const ready = () => { server.off('error', fail); resolve(); }; server.once('error', fail); server.once('listening', ready); server.listen(chosen, '127.0.0.1'); });
  }
  try { await listen(port); } catch (error) { if (error.code === 'EADDRINUSE' && port !== 0) await listen(0); else throw error; }
  url = 'http://127.0.0.1:' + server.address().port;
  return {url, close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      stopped ||= new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await Promise.all([...active]); server.closeIdleConnections(); await stopped;
      await Promise.all([...sessions.values()].map(session => session.tail)); await Promise.all([...retiring]);
      const results = await Promise.allSettled([...ownedDirectories].map(removeOwned));
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Owned sample cleanup failed; close may be retried after the filesystem recovers.');
      sessions.clear();
    })();
    closePromise.catch(() => { closePromise = undefined; });
    return closePromise;
  }};
}

async function main(argv) {
  let port = 8080;
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) { console.log('Usage: node website/server.cjs [--port N]\n       node website/server.cjs -h|--help\nLocal und learning site. Port defaults to 8080; 0 selects an available port.'); return; }
  if (argv.length && (argv.length !== 2 || argv[0] !== '--port' || !/^(0|[1-9][0-9]*)$/.test(argv[1]) || Number(argv[1]) > 65535)) throw new Error('Usage: node website/server.cjs [--port N] or --help; N is 0–65535.');
  if (argv.length) port = Number(argv[1]);
  const runtime = path.resolve(process.env.UND_SITE_RUNTIME_DIR || path.join(os.tmpdir(), 'und-site-' + createHash('sha256').update(root).digest('hex').slice(0,16)));
  const receipt = path.join(runtime, 'instance.json');
  try {
    const old = JSON.parse(await fs.readFile(receipt, 'utf8'));
    if (old.root === root && old.runtime === runtime && /^http:\/\/127\.0\.0\.1:\d+$/.test(old.url)) {
      const response = await fetch(old.url + '/api/identity', {signal:AbortSignal.timeout(1000)}), data = await response.json();
      if (response.ok && data.identity?.token === old.token && data.identity.root === root && data.identity.runtime === runtime) { console.log(old.url); return; }
    }
  } catch {}
  const identity = {root, runtime, token:randomUUID()};
  const site = await startSite({port, identity});
  try { // Publish the receipt by rename so a concurrent startup never reads a prefix.
    await fs.mkdir(runtime, {recursive:true}); const draft = receipt + '.' + identity.token + '.tmp';
    try { await fs.writeFile(draft, JSON.stringify({...identity, url:site.url})); await fs.rename(draft, receipt); }
    catch (error) { await fs.rm(draft, {force:true}).catch(() => {}); throw error; } }
  catch (error) { await site.close(); throw new Error('Cannot record local startup identity: ' + error.message); }
  let stopping;
  function stop() {
    if (stopping) return stopping;
    stopping = (async () => { await site.close(); try { const current = JSON.parse(await fs.readFile(receipt,'utf8')); if (current.token === identity.token) await fs.unlink(receipt); } catch (error) { if (error.code !== 'ENOENT') throw error; } })();
    stopping.catch(error => { console.error('Shutdown: ' + error.message); process.exitCode = 1; }); return stopping;
  }
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  console.log(site.url);
}
module.exports = {startSite};
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
