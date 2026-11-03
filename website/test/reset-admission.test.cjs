'use strict';
// Admission observer adapted from Penelope's R-012 body-pending-reset regression,
// itself based on Lilith's independent probe. It calls the actual body callback;
// all requests use the exported server and actual default und core.
const test = require('node:test');
const {randomUUID} = require('node:crypto');
const {site, session, request, current, op, http, assert, gate} = require('../../test/website-helpers.cjs');
const send = (s, cookie, input, intent = randomUUID()) => request(s.url, '/api/operation', {
  method:'POST', cookie, body:input, headers:intent ? {'X-Und-Intent':intent} : {}
});

function observeBody(marker, events) {
  const seen = gate(), original = http.IncomingMessage.prototype.on;
  http.IncomingMessage.prototype.on = function(name, listener) {
    if (name === 'data' && this.method === 'POST' && this.headers['x-und-probe'] === marker) {
      return original.call(this, name, function(chunk) {
        const result = listener.call(this, chunk);
        events.push({event:'server-body-data', bytes:chunk.length, complete:this.complete});
        seen.resolve(); return result;
      });
    }
    return original.call(this, name, listener);
  };
  return {seen:seen.promise, restore:() => {http.IncomingMessage.prototype.on = original;}};
}
function responseOf(req) {
  return new Promise((resolve, reject) => {
    req.once('response', res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk)); res.once('error', reject);
      res.once('end', () => {
        const text = Buffer.concat(chunks).toString();
        try {resolve({status:res.statusCode, json:JSON.parse(text), text});} catch(error) {reject(error);}
      });
    });
    req.once('error', reject);
  });
}
async function partial(t, s, cookie, input, events, intent = randomUUID()) {
  const bytes = Buffer.from(typeof input === 'string' ? input : JSON.stringify(input));
  const marker = randomUUID(), observer = observeBody(marker, events);
  t.after(observer.restore);
  const req = http.request(s.url + '/api/operation', {method:'POST', agent:false, headers:{
    Cookie:cookie, 'Content-Type':'application/json', 'Content-Length':bytes.length,
    'X-Und-Probe':marker, ...(intent ? {'X-Und-Intent':intent} : {})
  }});
  const response = responseOf(req); response.catch(() => {});
  t.after(() => req.destroy());
  req.setTimeout(6000, () => req.destroy(new Error('Partial request timed out')));
  const split = Math.floor(bytes.length / 2); req.write(bytes.subarray(0, split));
  await Promise.race([observer.seen, response.then(() => {throw new Error('Response before complete body');})]);
  observer.restore();
  return {intent, response, finish() {events.push({event:'remaining-body-sent'}); req.end(bytes.subarray(split));}, abort() {req.destroy();}};
}
async function resetAfterAdmission(t, s, cookie, events) {
  const marker = randomUUID(), observer = observeBody(marker, events); t.after(observer.restore);
  let completed = false;
  const response = request(s.url, '/api/operation', {method:'POST', cookie, body:{method:'reset', args:[]}, headers:{'X-Und-Probe':marker, 'X-Und-Intent':randomUUID()}});
  response.then(() => {completed = true; events.push({event:'reset-response'});}, () => {});
  await Promise.race([observer.seen, response]); observer.restore();
  // A real state response proves the server is serving other requests while the
  // first body is held; no fixed sleep claims that Reset has been admitted.
  await current(s.url, cookie);
  return {response, completed:() => completed};
}

for (const identified of [true, false]) test(`website reset admission: earlier partial ${identified ? 'identified' : 'raw'} put drains before reset; later writes remain usable`, async t => {
  const s = await site(t), a = await session(s.url), events = [];
  const doc = {id:'before-reset-body', value:'submitted before reset; body finished afterward'};
  const input = {method:'put', args:[doc]}, intent = identified ? randomUUID() : undefined;
  const pending = await partial(t, s, a.cookie, input, events, intent || null);
  const reset = await resetAfterAdmission(t, s, a.cookie, events);
  const completedWhileBodyPending = reset.completed();
  pending.finish(); const put = await pending.response, cleared = await reset.response;
  const state = await current(s.url, a.cookie);
  t.diagnostic(JSON.stringify({identified, events, completedWhileBodyPending, put:put.json, cleared:cleared.json, state}));
  assert.equal(put.status, 200); assert.equal(put.json.result.rev, 1);
  assert.equal(cleared.status, 200); assert.deepEqual(state, {ids:[], writes:[]}, 'An admitted old body must not populate the replacement sample');
  assert.equal(completedWhileBodyPending, false, 'Reset must wait for the earlier admitted body');
  if (identified) {
    const repeated = await send(s, a.cookie, input, intent);
    assert.equal(repeated.status, 409); assert.equal(repeated.json.error.code, 'STALE_INTENT');
  }
  const fresh = await send(s, a.cookie, {method:'put', args:[{id:'after-reset'}]});
  assert.equal(fresh.status, 200); assert.equal(fresh.json.result.rev, 1);
  assert.deepEqual((await current(s.url, a.cookie)).ids, ['after-reset']);
});

test('website reset admission: a same-intent wire retry before the original remainder cannot cross reset', async t => {
  const s = await site(t), a = await session(s.url), events = [], intent = randomUUID();
  const input = {method:'put', args:[{id:'retry-window', value:'one original intent'}]};
  const pending = await partial(t, s, a.cookie, input, events, intent);
  const reset = await resetAfterAdmission(t, s, a.cookie, events);
  const duplicate = await send(s, a.cookie, input, intent);
  const completedWhileBodyPending = reset.completed();
  pending.finish(); const original = await pending.response, cleared = await reset.response;
  const state = await current(s.url, a.cookie);
  t.diagnostic(JSON.stringify({events, completedWhileBodyPending, duplicate:duplicate.json, original:original.json, cleared:cleared.json, state}));
  assert.equal(duplicate.status, 200); assert.equal(duplicate.json.result.rev, 1);
  assert.deepEqual(state, {ids:[], writes:[]}, 'Faster retry of the admitted intent must be cleared with its original sample');
  assert.equal(completedWhileBodyPending, false);
  if (original.status === 200) assert.equal(original.json.result.uid, duplicate.json.result.uid);
  else {assert.equal(original.status, 409); assert.equal(original.json.error.code, 'STALE_INTENT');}
  assert.equal((await send(s, a.cookie, input, intent)).json.error.code, 'STALE_INTENT');
  assert.equal((await send(s, a.cookie, {method:'clean', args:[1]}, intent)).json.error.code, 'INTENT_CONFLICT');
  assert.equal((await send(s, a.cookie, input)).json.result.rev, 1, 'A genuinely new post-reset intent is allowed');
});

test('website reset admission: invalid and disconnected earlier bodies release reset and close', async t => {
  const s = await site(t), a = await session(s.url), events = [];
  for (const mode of ['invalid', 'disconnect']) {
    await op(s.url, a.cookie, 'put', [{id:'clear-' + mode}]);
    const input = mode === 'invalid' ? '{"method":"put","args":[' : {method:'put', args:[{id:'never-completed'}]};
    const pending = await partial(t, s, a.cookie, input, events);
    const reset = await resetAfterAdmission(t, s, a.cookie, events);
    if (mode === 'invalid') {pending.finish(); assert.equal((await pending.response).status, 400);}
    else {pending.abort(); await assert.rejects(pending.response);}
    assert.equal((await reset.response).status, 200);
    assert.deepEqual(await current(s.url, a.cookie), {ids:[], writes:[]});
  }
  await s.close(); t.diagnostic(JSON.stringify({events, closed:true}));
});
