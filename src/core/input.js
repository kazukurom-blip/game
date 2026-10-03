// キーボード・マウス・タッチ入力。アクション名で問い合わせる。
const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Space: 'jump', AltLeft: 'jump', AltRight: 'jump', KeyC: 'jump',
  KeyX: 'attack', ControlLeft: 'attack', ControlRight: 'attack',
  KeyA: 'skill1', KeyS: 'skill2', KeyD: 'skill3', KeyF: 'skill4',
  Digit1: 'potion1', Digit2: 'potion2',
  KeyZ: 'pickup',
  KeyE: 'interact', Enter: 'interact',
  KeyI: 'inventory', KeyK: 'skillWin', KeyJ: 'missionWin', KeyT: 'statWin',
  F2: 'debug', Backquote: 'debug',
  Escape: 'escape',
};
// Enter は UI の決定にも使うので別名も発火
const EXTRA = { Enter: ['confirm'], Space: ['confirm'] };

export class Input {
  constructor(canvas, logicalW, logicalH) {
    this.canvas = canvas;
    this.W = logicalW; this.H = logicalH;
    this.held = new Set();
    this.justPressed = new Set();
    this.queue = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false, rightClicked: false, dblClicked: false };
    this._click = false; this._rclick = false; this._dbl = false;
    this.lastKey = null;

    window.addEventListener('keydown', (e) => {
      const acts = this._actions(e.code);
      if (acts.length) {
        e.preventDefault();
        for (const a of acts) {
          if (!this.held.has(a)) this.queue.add(a);
          this.held.add(a);
        }
      }
      this.lastKey = e.code;
    });
    window.addEventListener('keyup', (e) => {
      for (const a of this._actions(e.code)) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.held.clear());

    const toLogical = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * this.W, y: (cy - r.top) / r.height * this.H };
    };
    canvas.addEventListener('mousemove', (e) => Object.assign(this.mouse, toLogical(e.clientX, e.clientY)));
    canvas.addEventListener('mousedown', (e) => {
      Object.assign(this.mouse, toLogical(e.clientX, e.clientY));
      if (e.button === 0) { this.mouse.down = true; this._click = true; }
      if (e.button === 2) this._rclick = true;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('dblclick', () => { this._dbl = true; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _actions(code) {
    const a = [];
    if (KEYMAP[code]) a.push(KEYMAP[code]);
    if (EXTRA[code]) a.push(...EXTRA[code]);
    return a;
  }

  // 仮想ボタン（タッチ）用
  press(action) { if (!this.held.has(action)) this.queue.add(action); this.held.add(action); }
  release(action) { this.held.delete(action); }

  down(action) { return this.held.has(action); }
  pressed(action) { return this.justPressed.has(action); }
  consume(action) { this.justPressed.delete(action); }

  // フレーム開始時に呼ぶ
  beginFrame() {
    this.justPressed = this.queue;
    this.queue = new Set();
    this.mouse.clicked = this._click; this._click = false;
    this.mouse.rightClicked = this._rclick; this._rclick = false;
    this.mouse.dblClicked = this._dbl; this._dbl = false;
  }
}
