import {Drawer} from '/vendor/bootstrap/bootstrap.bundle.min.js';
import {Signal, EventEmitter, SignalBinder, DisposableScope} from './state.mjs';

export function mountPage(doc = document, transport = fetch) {
  const scope = DisposableScope(), actions = EventEmitter();
  const el = id => doc.getElementById(id), pretty = value => JSON.stringify(value, null, 2);
  const initialDraft = pretty({id:'profile', name:'Mira', color:'blue'});
  const signals = Object.fromEntries(['availability','status','error','call','result','selected','ids','operations','result-age','branch-a','branch-b','branch-selected','copy-status'].map(id => [id, Signal(el(id).textContent)]));
  for (const [id, signal] of Object.entries(signals)) scope.use(SignalBinder(el(id), signal));
  const set = (id, value) => signals[id].set(value);
  let revision = 0, disposed = false, busy = false, ready = false, lastSaved, selected, writes = [], history = [], branchA, branchB;
  const pending = new Set();
  const valid = token => !disposed && token === revision;
  const navigation = Drawer.getOrCreateInstance(el('navigation'));
  const resetDialog = Drawer.getOrCreateInstance(el('reset-dialog'));
  scope.use(() => navigation.dispose()); scope.use(() => resetDialog.dispose());
  function on(target, event, listener) { target.addEventListener(event, listener); scope.use(() => target.removeEventListener(event, listener)); }
  function buttons() {
    for (const item of doc.querySelectorAll('#save,#read,[data-operation],#clean,#branch,#cleanup-lesson')) item.disabled = !ready || busy;
    el('connect').disabled = busy;
    el('reset-open').disabled = !ready;
    el('reset-confirm').disabled = !ready;
    el('edit-last').disabled = !ready || !lastSaved || busy;
    el('playground').setAttribute('aria-busy', String(busy));
  }
  function draft(value) { el('document').value = value; try { sessionStorage.setItem('und-draft', value); } catch {} preview(); }
  try { const stored = sessionStorage.getItem('und-draft'); if (stored !== null) el('document').value = stored; } catch {}
  function preview() { if (!busy) set('call', 'put(' + el('document').value + ')'); }
  function clearError() { set('error',''); el('error').hidden = true; for (const item of [el('document'),el('record-id'),el('depth')]) item.removeAttribute('aria-invalid'); }
  function fail(message, field) {
    set('error', message); el('error').hidden = false; set('status', 'Operation did not produce a confirmed fresh result.');
    set('result-age', 'Earlier confirmed results retained below; they are not the result of this attempt.');
    if (field) { field.setAttribute('aria-invalid','true'); field.focus(); } else el('error').focus();
  }
  function renderWrites() {
    const container = el('writes'); container.replaceChildren();
    if (!writes.length) { const p = doc.createElement('p'); p.textContent = 'No writes yet. Save the example document to begin.'; container.append(p); return; }
    for (const [index, write] of writes.entries()) {
      const column = doc.createElement('div'); column.className = 'col-12 md:col-6 min-w-0';
      const card = doc.createElement('article'); card.className = 'card h-100'; const body = doc.createElement('div'); body.className = 'card-body';
      const title = doc.createElement('h4'); title.className = 'fs-lg text-break'; title.textContent = 'Save ' + (index + 1) + ' · ' + write.id + ' · revision ' + write.rev;
      const note = doc.createElement('p'); note.className = 'fs-sm'; note.textContent = selected?.uid === write.uid ? 'Selected by the most recent get()' : 'Saved return · may have been pruned by cleanup';
      const pre = doc.createElement('pre'); pre.className = 'overflow-auto'; pre.tabIndex = 0; pre.setAttribute('aria-label', 'Saved return ' + (index + 1)); pre.textContent = pretty(write);
      body.append(title,note,pre); card.append(body); column.append(card); container.append(column);
    }
  }
  function snapshot(state) { writes = state.writes; set('ids',pretty(state.ids)); renderWrites(); }
  async function request(route, options = {}) {
    const controller = new AbortController(); pending.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await transport(route, {...options, signal:controller.signal, credentials:'same-origin'});
      let data;
      try { data = await response.json(); } catch { throw new Error('The local server response was unreadable.'); }
      if (!response.ok || data.ok !== true) { const error = new Error(data.error?.message || 'Local operation unavailable.'); error.code = data.error?.code; error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timeout); pending.delete(controller); }
  }
  async function operation(token, method, args = []) {
    if (!valid(token)) return null;
    const call = method + '(' + args.map(pretty).join(', ') + ')'; set('call',call); set('status','Pending: ' + method + '. Waiting for the actual result…');
    const headers = {'Content-Type':'application/json'};
    if (['put','clean','reset'].includes(method)) headers['X-Und-Intent'] = crypto.randomUUID();
    const response = await request('/api/operation', {method:'POST', headers, body:JSON.stringify({method,args})});
    if (!valid(token)) return null;
    if (method === 'reset') {
      history = []; lastSaved = selected = branchA = branchB = undefined;
      draft(initialDraft); el('record-id').value = 'profile';
      set('selected','Not read yet'); set('branch-a','Run the lesson to see its real return'); set('branch-b','Run the lesson to see its real return'); set('branch-selected','No selected lesson write yet.');
    }
    if (method === 'put') { lastSaved = response.result; el('record-id').value = response.result.id; selected = undefined; set('selected','Read selected document to refresh after this save.'); }
    if (method === 'get') { selected = response.result; set('selected',pretty(response.result)); }
    history.push({call, result:response.result}); snapshot(response.state);
    set('operations',pretty(history)); set('result',pretty(response.result));
    set('result-age','Confirmed response at ' + new Date().toLocaleTimeString() + '.');
    set('status',method === 'clean' ? 'Clean completed. Removed ' + response.result.length + ' file(s). The returned paths are below.' : method === 'get' && response.result === null ? 'Read completed: no document for this ID (null).' : method + ' completed. Actual return value shown below.');
    return response.result;
  }
  async function run(work, {reset = false, mutation = false, field} = {}) {
    if (disposed || (busy && !reset)) return;
    const token = ++revision; busy = true; clearError(); buttons();
    try { await work(token); }
    catch (error) {
      if (!valid(token)) return;
      const uncertain = !error.status || (mutation && error.status >= 500);
      if (!ready || !error.status || error.status === 401 || error.status === 503) { ready = false; set('availability','Unavailable. Reconnect the local sample to continue.'); }
      const message = uncertain && mutation
        ? 'Unknown write outcome: ' + error.message + ' Your draft is retained. No write was retried. Reconnect, then explicitly Read selected document to reconcile; a lost response does not prove rollback.'
        : error.message + ' Your draft is retained. Correct the input, or reconnect and explicitly read again.';
      fail(message, error.status === 400 ? field : undefined);
    } finally { if (valid(token)) { busy = false; buttons(); } }
  }
  function parseDocument() {
    let value; try { value = JSON.parse(el('document').value); } catch { throw new Error('Document JSON is malformed. Use double quotes and check commas and brackets.'); }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document JSON must be an object with a nonempty id, not null or an array.');
    return value;
  }
  function depth() { const text = el('depth').value; if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('Revision groups to keep must be a positive safe integer, such as 1 or 2.'); return Number(text); }
  function invalid(work, field) { try { return work(); } catch (error) { clearError(); fail(error.message,field); return undefined; } }
  async function initialize() {
    await run(async token => { set('status','Initializing the local sample…'); const response = await request('/api/session'); if (!valid(token)) return; ready = true; snapshot(response.state); lastSaved = writes.at(-1); set('availability','Playground ready · local sample initialized'); set('status',writes.length ? 'Sample reconnected. Existing writes retained; no operation was replayed.' : 'Sample ready. Start empty, or save the example document.'); });
  }
  scope.use(actions.subscribe(({method,args,field,mutation}) => { run(token => operation(token,method,args),{field,mutation}); }));
  on(el('save-form'),'submit',event => { event.preventDefault(); const data = invalid(parseDocument,el('document')); if (data !== undefined) actions.emit({method:'put',args:[data],field:el('document'),mutation:true}); });
  on(el('read-form'),'submit',event => { event.preventDefault(); actions.emit({method:'get',args:[el('record-id').value],field:el('record-id')}); });
  for (const button of doc.querySelectorAll('[data-operation]')) on(button,'click',() => actions.emit({method:button.dataset.operation,args:button.dataset.operation === 'all' ? [] : [el('record-id').value],field:el('record-id')}));
  on(el('clean-form'),'submit',event => { event.preventDefault(); const n = invalid(depth,el('depth')); if (n !== undefined) actions.emit({method:'clean',args:[n],field:el('depth'),mutation:true}); });
  on(el('document'),'input',() => { try { sessionStorage.setItem('und-draft',el('document').value); } catch {} preview(); });
  on(el('default-draft'),'click',() => draft(initialDraft));
  on(el('edit-last'),'click',() => { if (lastSaved) { draft(pretty(lastSaved)); el('document').focus(); } });
  on(el('connect'),'click',initialize);
  on(el('reset-open'),'click',() => resetDialog.show(el('reset-open')));
  on(el('reset-confirm'),'click',() => { resetDialog.hide(); run(token => operation(token,'reset'),{reset:true,mutation:true}); });
  on(el('reset-dialog'),'hidden.bs.drawer',() => { if (!disposed) el('reset-open').focus(); });
  on(el('navigation'),'shown.bs.drawer',() => {
    if (el('navigation').matches(':modal')) el('navigation').querySelector('a[href]').focus({preventScroll:true});
  });
  on(el('reset-dialog'),'shown.bs.drawer',() => {
    if (el('reset-dialog').matches(':modal')) el('reset-cancel').focus({preventScroll:true});
  });
  on(el('navigation'),'show.bs.drawer',() => el('nav-toggle').setAttribute('aria-expanded','true'));
  on(el('navigation'),'hidden.bs.drawer',() => el('nav-toggle').setAttribute('aria-expanded','false'));
  for (const link of el('navigation').querySelectorAll('a')) on(link,'click',() => { if (el('navigation').open) navigation.hide(); });
  const updateNav = () => { for (const link of el('navigation').querySelectorAll('a')) { const active = link.hash === (location.hash || '#introduction'); link.classList.toggle('active',active); if (active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); } };
  on(window,'hashchange',updateNav); updateNav();
  on(el('branch'),'click',() => run(async token => {
    const base = await operation(token,'put',[{id:'two-edits-' + crypto.randomUUID().slice(0,8),name:'Mira',color:'blue'}]); if (!valid(token)) return;
    branchA = await operation(token,'put',[{...base,name:'Mira A'}]); if (!valid(token)) return; set('branch-a',pretty(branchA));
    branchB = await operation(token,'put',[{...base,color:'green'}]); if (!valid(token)) return; set('branch-b',pretty(branchB));
    const current = await operation(token,'get',[base.id]); if (!valid(token)) return;
    set('branch-selected','Actual get selected edit ' + (current.uid === branchA.uid ? 'A' : 'B') + ' · UID ' + current.uid + '. The other fields were not merged.');
  },{mutation:true}));
  on(el('cleanup-lesson'),'click',() => run(async token => {
    const first = await operation(token,'put',[{id:'cleanup-' + crypto.randomUUID().slice(0,8),name:'Mira',color:'blue'}]); if (!valid(token)) return;
    const second = await operation(token,'put',[{...first,name:'Mira II'}]); if (!valid(token)) return;
    await operation(token,'put',[{...second,name:'Mira III'}]); if (!valid(token)) return;
    await operation(token,'put',[{...second,color:'green'}]); if (!valid(token)) return;
    await operation(token,'get',[first.id]); if (!valid(token)) return;
    el('depth').value = '2'; set('status','Cleanup lesson saved: groups 1, 2 and two writes in 3. Submit Clean sample history at depth 2, then 1, then 1 again.');
  },{mutation:true}));
  for (const button of doc.querySelectorAll('[data-copy]')) on(button,'click',async () => { const token = revision; try { await navigator.clipboard.writeText(el(button.dataset.copy).textContent); if (!disposed && token === revision) set('copy-status','Copied the complete example. Save at the documented path.'); } catch { if (!disposed && token === revision) set('copy-status','Copy unavailable. Select the source text or use Download instead.'); } });
  function dispose() {
    if (disposed) return; disposed = true; revision++;
    ready = false; busy = false; buttons();
    set('availability','Playground suspended. Returning to this page reconnects the sample.');
    set('result-age','Earlier confirmed results retained; read again after returning to this page.');
    for (const controller of pending) controller.abort();
    scope.dispose();
  }
  set('availability','Checking local assets and sample initialization…');
  set('selected','Not read in this active view. Read selected document to refresh.');
  buttons(); preview(); initialize();
  return {dispose};
}
// These two listeners belong to the document, which may survive in BFCache.
// Each active view owns its listeners, requests and Bootstrap instances separately.
let activeView = mountPage();
const documentScope = DisposableScope();
function onDocument(type, listener) {
  window.addEventListener(type, listener);
  documentScope.use(() => window.removeEventListener(type, listener));
}
onDocument('pagehide', event => {
  try { activeView?.dispose(); }
  finally { activeView = null; if (!event.persisted) documentScope.dispose(); }
});
onDocument('pageshow', event => {
  if (event.persisted && !activeView) activeView = mountPage();
});
