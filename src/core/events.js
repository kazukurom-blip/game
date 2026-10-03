// シンプルなイベントバス
export class EventBus {
  constructor() { this.handlers = new Map(); }
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.handlers.get(name)?.delete(fn); }
  emit(name, data) {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (e) { console.error(`[event:${name}]`, e); }
    }
  }
}
