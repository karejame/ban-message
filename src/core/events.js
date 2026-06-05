const listeners = {};

export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const fns = listeners[event];
  if (fns) {
    listeners[event] = fns.filter(f => f !== fn);
  }
}

export function emit(event, data) {
  (listeners[event] || []).forEach(fn => {
    try { fn(data); } catch (e) { console.warn('[CyberShield] event error:', e); }
  });
}