// シンプルなイベントバス。ゲームの中身（game/）と見た目（render/・ui/）はこれでつながる。
// 例: bus.on('loot', (e) => ...); bus.emit('loot', { item });
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (e) => { off(); fn(e); });
    return off;
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[event:${type}]`, err); }
    }
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) {
      try { fn({ type, payload }); } catch (err) { console.error('[event:*]', err); }
    }
  }
  clear() { this.map.clear(); }
}
