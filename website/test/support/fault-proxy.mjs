import http from 'node:http';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function loopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an HTTP loopback origin with no credentials, path, query or fragment');
  }
  return url;
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function collect(stream, limit = 2 * 1024 * 1024) {
  const chunks = []; let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > limit) throw new Error('Review proxy body limit exceeded');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function summarize(bytes) {
  try {
    const body = JSON.parse(bytes);
    return {
      ok: body.ok, result: body.result,
      state: body.state ? { ids: body.state.ids, writes: body.state.writes } : undefined
    };
  } catch { return { bytes: bytes.length, sha256: digest(bytes) }; }
}

// Narrow review transport: it never retries and never invents a success response.
// Only one explicitly armed response can be held at a time.
export async function createFaultProxy({ upstream, traceFile }) {
  const target = loopbackUrl(upstream);
  const trace = [], pending = new Set();
  let serial = 0, armed = null, held = null, closed = false;
  let waiters = [];
  const record = data => { trace.push({ at: new Date().toISOString(), ...data }); };
  const server = http.createServer(async (request, response) => {
    const id = ++serial;
    try {
      const incoming = new URL(request.url, 'http://review.invalid');
      if (!request.url.startsWith('/') || incoming.origin !== 'http://review.invalid') {
        response.writeHead(400); response.end('Invalid request target'); return;
      }
      const body = await collect(request);
      let operation;
      if (request.method === 'POST' && incoming.pathname === '/api/operation') {
        try { operation = JSON.parse(body).method; } catch {}
      }
      const match = armed && (
        (armed.match === 'state' && request.method === 'GET' && incoming.pathname === '/api/state') ||
        (['put', 'get'].includes(armed.match) && operation === armed.match)
      );
      const selected = match ? armed : null;
      if (selected) armed = null;
      record({ event: 'forward', id, method: request.method, path: incoming.pathname, operation, intent: request.headers['x-und-intent'], bytes: body.length, sha256: digest(body), selected: Boolean(selected) });
      const headers = { ...request.headers, host: target.host };
      if (headers.origin) headers.origin = target.origin;
      delete headers.connection;
      const remote = http.request(new URL(incoming.pathname + incoming.search, target), { method: request.method, headers });
      pending.add(remote);
      remote.once('error', error => {
        pending.delete(remote);
        record({ event: 'upstream-error', id, message: error.message });
        if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
        response.end('Review upstream unavailable');
        if (selected) { for (const waiter of waiters.splice(0)) waiter.reject(error); }
      });
      remote.once('response', async reply => {
        try {
          const data = await collect(reply);
          pending.delete(remote);
          const replyHeaders = { ...reply.headers };
          delete replyHeaders.connection; delete replyHeaders['transfer-encoding'];
          replyHeaders['content-length'] = String(data.length);
          // Set-Cookie values are forwarded unchanged and never included in the trace.
          const packet = { id, response, status: reply.statusCode, headers: replyHeaders, data, operation, requestMethod: request.method };
          record({ event: 'upstream-complete', id, status: reply.statusCode, bytes: data.length, sha256: digest(data), api: incoming.pathname.startsWith('/api/') ? summarize(data) : undefined });
          if (selected) {
            if (held) throw new Error('Review proxy already holds a response');
            held = packet;
            const info = { id, status: packet.status, operation, body: summarize(data) };
            record({ event: 'held', id, status: packet.status });
            for (const waiter of waiters.splice(0)) waiter.resolve(info);
          } else {
            response.writeHead(packet.status, packet.headers); response.end(packet.data);
            record({ event: 'delivered', id });
          }
        } catch (error) {
          record({ event: 'proxy-error', id, message: error.message });
          response.destroy(error);
          for (const waiter of waiters.splice(0)) waiter.reject(error);
        }
      });
      remote.end(body);
    } catch (error) {
      record({ event: 'proxy-error', id, message: error.message });
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('Review proxy failed');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = 'http://127.0.0.1:' + server.address().port;
  return {
    url, trace,
    arm(match) {
      if (closed || held || armed || !['put', 'get', 'state'].includes(match)) throw new Error('Arm exactly one put/get/state response while idle');
      armed = { match }; record({ event: 'armed', match });
    },
    async waitHeld(timeout = 10000) {
      if (held) return { id: held.id, status: held.status, operation: held.operation, body: summarize(held.data) };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters = waiters.filter(item => item !== waiter); reject(new Error('No matching completed response reached the hold')); }, timeout);
        const waiter = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
        waiters.push(waiter);
      });
    },
    async drop({afterFirstByte = false} = {}) {
      if (!held) throw new Error('No completed response is held');
      const packet = held; held = null;
      if (afterFirstByte) {
        packet.response.writeHead(packet.status, packet.headers); packet.response.flushHeaders();
        packet.response.write(packet.data.subarray(0, 1));
        record({event:'response-first-byte', id:packet.id});
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      record({ event: 'dropped-after-upstream-complete', id: packet.id, status: packet.status });
      packet.response.destroy();
    },
    release() {
      if (!held) throw new Error('No completed response is held');
      const packet = held; held = null;
      packet.response.writeHead(packet.status, packet.headers); packet.response.end(packet.data);
      record({ event: 'released', id: packet.id });
    },
    async flush() { if (traceFile) await fs.writeFile(traceFile, JSON.stringify({ upstream: target.origin, proxy: url, trace }, null, 2) + '\n'); },
    async close() {
      closed = true; armed = null;
      if (held) { held.response.destroy(); held = null; }
      for (const remote of pending) remote.destroy();
      for (const waiter of waiters.splice(0)) waiter.reject(new Error('Review proxy closed'));
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      if (traceFile) await fs.writeFile(traceFile, JSON.stringify({ upstream: target.origin, proxy: url, trace }, null, 2) + '\n');
    }
  };
}
