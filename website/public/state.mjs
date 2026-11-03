// Website-local, synchronous push state. Listener failures do not strand deliveries.
export function EventEmitter() {
  const listeners = new Set(), queue = []; let delivering = false;
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(value) {
      queue.push(value); if (delivering) return;
      delivering = true; const errors = [];
      try { while (queue.length) { const next = queue.shift(); for (const listener of [...listeners]) { try { listener(next); } catch (error) { errors.push(error); } } } }
      finally { delivering = false; }
      if (errors.length) throw new AggregateError(errors, 'Event delivery failed');
    }
  };
}
export function Signal(initial) {
  let current = initial, delivering = false; const queue = [], listeners = new Set();
  return {
    get:() => current,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) {
      queue.push(value); if (delivering) return;
      delivering = true; const errors = [];
      try { while (queue.length) { current = queue.shift(); for (const listener of [...listeners]) { try { listener(current); } catch (error) { errors.push(error); } } } }
      finally { delivering = false; }
      if (errors.length) throw new AggregateError(errors, 'Signal delivery failed');
    }
  };
}
export function SignalBinder(element, signal, render = value => { element.textContent = String(value); }) {
  render(signal.get()); return signal.subscribe(render);
}
export function DisposableScope() {
  let closed = false; const resources = [];
  return {
    use(cleanup) { if (closed) cleanup(); else resources.push(cleanup); return cleanup; },
    dispose() {
      if (closed) return; closed = true; const errors = [];
      for (const cleanup of resources.splice(0).reverse()) { try { cleanup(); } catch (error) { errors.push(error); } }
      if (errors.length) throw new AggregateError(errors, 'Resource disposal failed');
    }
  };
}
