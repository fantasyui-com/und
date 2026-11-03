import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Optional project-local Chrome DevTools adapter. No dependency or provider install.
export async function openBrowser(executable) {
  if (!executable || !path.isAbsolute(executable)) throw new Error('--browser must name an installed browser by absolute path');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-menu-browser-'));
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--no-zygote', '--disable-breakpad', '--disable-crash-reporter', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-sync', '--metrics-recording-only', '--safebrowsing-disable-auto-update', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket, serial = 0, sessionId;
  const pending = new Map();
  const listeners = new Map(), eventErrors = [];
  const on = (method, callback) => { const set = listeners.get(method) ?? new Set(); set.add(callback); listeners.set(method,set); return () => set.delete(callback); };
  const close = async () => {
    socket?.close(); child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 1000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error(`Browser startup timeout: ${stderr.slice(-1400)}`)), 12000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail); child.once('exit', code => fail(new Error(`Browser exited ${code}: ${stderr.slice(-1400)}`)));
      child.stderr.on('data', data => {
        stderr = (stderr + data).slice(-5000);
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), item = pending.get(message.id);
      if (!item) { for (const callback of listeners.get(message.method) ?? []) Promise.resolve().then(() => callback(message.params, message.sessionId)).catch(error => eventErrors.push(String(error))); return; }
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
    });
    function send(method, params = {}, session = sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timeout: ${method}`)); }, 10000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
      });
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    await send('Page.enable'); await send('Runtime.enable');
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function settle() { await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); }
    return {
      close, evaluate, send, settle, on, eventErrors,
      async navigate(url, width = 1024, height = 768) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const result = await send('Page.navigate', { url });
        if (result.errorText) throw new Error(result.errorText);
        for (let attempt = 0; attempt < 100; attempt++) {
          if (await evaluate('document.readyState === "complete" && !!document.querySelector("select")')) { await settle(); return; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error('Page did not finish loading its record selector');
      },
      async screenshot(file, clip) {
        await settle();
        const result = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        await fs.writeFile(file, Buffer.from(result.data, 'base64'));
      },
      async click(expression) {
        const point = await evaluate(`(() => { const element = (${expression}); if (!element) throw new Error('Required control is absent'); const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) throw new Error('Required control is hidden'); return {x:rect.x + rect.width / 2, y:rect.y + rect.height / 2}; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); await settle();
      },
      async key(key) {
        const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, End: 35, Home: 36 };
        if (!codes[key]) throw new Error(`Unsupported key ${key}`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key], ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] }); await settle();
      },
    };
  } catch (error) { await close(); throw error; }
}
