// キー → 動きの名前（UI.md 3 章の初期配置＋ノートパソコン用）。
// 元: NEON VICE STORY の src/core/input.js を写して直した物（元のファイルは変えていない）。
const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  AltLeft: 'jump', AltRight: 'jump', Space: 'jump', KeyC: 'jump',
  ControlLeft: 'attack', ControlRight: 'attack', KeyX: 'attack',
  KeyZ: 'pickup',
  F2: 'debug',
};

export class Input {
  constructor(target = window) {
    this.held = new Set();
    this.queue = new Set();
    this.justPressed = new Set();
    this.enabled = true;
    target.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault(); // Alt でブラウザのメニューが出ないように
      if (!this.held.has(a)) this.queue.add(a);
      this.held.add(a);
    });
    target.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) { e.preventDefault(); this.held.delete(a); }
    });
    window.addEventListener('blur', () => this.held.clear());
  }
  // テスト用: 押す・離す
  press(a) { if (!this.held.has(a)) this.queue.add(a); this.held.add(a); }
  release(a) { this.held.delete(a); }
  releaseAll() { this.held.clear(); }
  down(a) { return this.held.has(a); }
  pressed(a) { return this.justPressed.has(a); }
  // 固定の 1 フレームの始めに呼ぶ
  beginFrame() { this.justPressed = this.queue; this.queue = new Set(); }
  // 物理に渡す形
  snapshot() {
    return {
      left: this.down('left'), right: this.down('right'), up: this.down('up'), down: this.down('down'),
      jump: this.down('jump'), jumpPressed: this.pressed('jump'),
    };
  }
}
