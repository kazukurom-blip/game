// UIManager: ウィンドウ管理（inventory / skills / stats / missions / dialog / shop / death）
// 即時モードGUI: draw() で当たり領域(hits)を登録し、次フレームの handleInput() がそれを使う。
import { COL, panel, txt, drawButton, inRect, rrPath, font, clamp } from './theme.js';
import { drawHUD, hudSlots } from './hud.js';
import { guard, getItemDef, skillDef, drawItemIco, drawSkillIco } from './deps.js';
import { WINDOW_DRAW, drawTooltipBox, initDialog, dialogKey } from './windows.js';
import { drawWorldMap, drawBook, drawPhone, rideTaxi } from './v2windows.js';
import { enemyDef } from './deps.js';
import { audio } from '../audio/audio.js';

Object.assign(WINDOW_DRAW, { worldmap: drawWorldMap, book: drawBook, phone: drawPhone });

const W = 1280, H = 720;
const MODAL = new Set(['dialog', 'shop', 'death', 'worldmap']);
const LAYOUT = {
  inventory: { w: 800, h: 520, title: 'インベントリ', key: 'I', y: 70 }, // 下端が左下の HUD に重ならない高さ
  skills: { w: 520, h: 610, title: 'スキル', key: 'K', y: 14 },
  stats: { w: 420, h: 510, title: 'ステータス', key: 'T' },
  missions: { w: 640, h: 480, title: 'ミッション', key: 'J' },
  dialog: { w: 940, h: 260, title: null, x: (W - 940) / 2, y: H - 290 },
  shop: { w: 780, h: 520, title: 'ショップ' },
  death: { w: 460, h: 250, title: null },
  worldmap: { w: 1240, h: 690, title: 'ワールドマップ  —  ネオリダ州 ヴァイス・ベイ', key: 'M' },
  book: { w: 1000, h: 620, title: 'モンスター図鑑', key: 'B', y: 40 },
  phone: { w: 360, h: 660, title: null, key: 'P', x: W - 360 - 36, y: 30 },
};
const TOAST_MAX = 3;
// 重要度: 2 = レベルアップ / PET / レア / ボス / ミッション完了、1 = 進行系、0 = その他
function toastPriority(text) {
  if (/LEVEL UP|PET|レア|レジェンダリ|ミシック|コンプリート|ミッション完了|倒した|現れた/.test(text)) return 2;
  if (/ミッション|達成|手配度|警察|称号|訪れた|到着|図鑑/.test(text)) return 1;
  return 0;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class UIManager {
  constructor(game) {
    this.game = game;
    this.wins = {};
    this.order = [];
    this.toasts = [];
    this.banners = [];
    this.levelFx = null;
    this.frame = 0;
    this.hits = [];
    this._hits = [];
    this.tip = null;
    this.drag = null;   // ウィンドウ移動
    this.dnd = null;    // スキル/アイテムのドラッグ&ドロップ
    this.lastClick = { id: null, t: -9 };
    this.pos = {};      // ウィンドウ位置の記憶
    this._hudFrame = -1;
    this.petFx = null;
    this.bookToasts = [];
    this.bookNewIds = new Set();
    this.radio = null;
    const ev = game?.events;
    if (ev?.on) {
      ev.on('rareDrop', (d) => {
        const item = getItemDef(d?.item?.id || d?.item || d?.id) || d?.item;
        if (item && (item.slot === 'pet' || item.rarity === 'pet')) return; // PET は専用演出
        if (item) this.banners.push({ item, t: 0, life: 3.6 });
        if (this.banners.length > 4) this.banners.splice(1, 1);
      });
      ev.on('petDrop', (d) => {
        const item = getItemDef(d?.item?.id || d?.item || d?.id) || d?.item;
        if (item) { this.petFx = { item, t: 0, life: 6.5 }; this.banners = this.banners.filter((b) => b.item?.id !== item.id); }
      });
      ev.on('bookNew', (d) => {
        const id = d?.id || d?.enemyId || d?.enemy?.def?.id || d?.enemy?.id || d?.def?.id;
        const def = enemyDef(id) || d?.def || d?.enemy?.def || null;
        if (!id && !def) return;
        this.bookNewIds.add(id || def?.id);
        this.bookToasts.push({ id: id || def?.id, def, name: d?.name || def?.name || id, t: 0, life: 3.8 });
        while (this.bookToasts.length > 3) this.bookToasts.shift();
      });
      ev.on('radioChanged', (d) => {
        const name = typeof d === 'string' ? d : (d?.name ?? d?.station ?? null);
        this.radio = { name: name || null, t: 0, life: name ? 3.2 : 1.6, off: !name };
      });
      // 乗車した瞬間に現在の局名を出す（audio 側の radioChanged が来なくても表示できるように）
      ev.on('vehicleEnter', () => {
        const name = guard('radioName', () => audio?.radioName) || null;
        if (name && this.radio?.name !== name) this.radio = { name, t: 0, life: 3.2, off: false };
      });
      ev.on('vehicleExit', () => { if (this.radio) this.radio.name = null; });
      ev.on('levelUp', (d) => { this.levelFx = { level: d?.level ?? game.state?.level ?? 1, t: 0, life: 3.2 }; });
    }
  }

  // ---------- 公開API ----------
  // 同時表示は最大 TOAST_MAX 件。同じ文言は1件にまとめて「×n」。重要度の低い・古いものから押し出す。
  notify(text, color, opts = {}) {
    if (!text) return;
    text = String(text);
    const pri = opts.priority ?? toastPriority(text);
    // 表示時間は短め。長い文（操作説明など）は読める分だけ少し延ばす
    const life = (pri >= 2 ? 3.2 : pri === 1 ? 2.6 : 2.1) + Math.min(1.6, Math.max(0, text.length - 24) / 25);
    const same = this.toasts.find((t) => t.text === text);
    if (same) {
      same.count = (same.count || 1) + 1;
      same.t = Math.min(same.t, 0.25); // 表示し直す（フェードインはしない）
      same.life = Math.max(same.life, life);
      return;
    }
    this.toasts.push({ text, color: color || COL.teal, t: 0, life, pri, count: 1 });
    while (this.toasts.length > TOAST_MAX) {
      // 最も重要度の低いもののうち一番古いものを外す（新しい通知も対象）
      let k = 0;
      for (let i = 1; i < this.toasts.length; i++) if (this.toasts[i].pri < this.toasts[k].pri) k = i;
      this.toasts.splice(k, 1);
    }
  }
  isOpen(name) { return !!this.wins[name]; }
  isModal() { return this.order.some((n) => MODAL.has(n)); }

  open(name, data) {
    const L = LAYOUT[name];
    if (!L) return;
    let win = this.wins[name];
    if (!win) {
      const p = this.pos[name];
      win = {
        name, w: L.w, h: L.h, title: L.title, key: L.key,
        x: p ? p.x : (L.x ?? Math.round((W - L.w) / 2 + this.order.length * 24)),
        y: p ? p.y : (L.y ?? Math.round((H - L.h) / 2 - 10 + this.order.length * 16)),
        t: 0, tab: 0, sel: null, page: 0,
      };
      win.x = clamp(win.x, 0, W - win.w); win.y = clamp(win.y, 0, H - win.h);
      this.wins[name] = win;
    }
    win.data = data || win.data || {};
    win.t = 0;
    if (name === 'dialog') guard('dialog.init', () => initDialog(this, win));
    if (name === 'shop') { win.tab = 0; win.sel = null; win.page = 0; }
    this.front(name);
  }

  close(name) {
    if (!name) {
      // 一番上（death は Esc で閉じない）
      for (let i = this.order.length - 1; i >= 0; i--) {
        if (this.order[i] !== 'death') { name = this.order[i]; break; }
      }
      if (!name) return;
    }
    const win = this.wins[name];
    if (!win) return;
    if (LAYOUT[name] && !MODAL.has(name)) this.pos[name] = { x: win.x, y: win.y };
    delete this.wins[name];
    this.order = this.order.filter((n) => n !== name);
    if (this.drag?.win === win) this.drag = null;
    if (name === 'shop' || name === 'dialog') guard('save', () => this.game.save?.());
  }

  toggle(name) { this.isOpen(name) ? this.close(name) : this.open(name); }

  front(name) {
    this.order = this.order.filter((n) => n !== name);
    this.order.push(name);
    // death は常に最前面
    if (this.wins.death && name !== 'death') { this.order = this.order.filter((n) => n !== 'death'); this.order.push('death'); }
  }

  winAt(x, y) {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const w = this.wins[this.order[i]];
      if (w && inRect(x, y, w)) return w;
    }
    return null;
  }

  // ---------- 入力 ----------
  handleInput() {
    const g = this.game, inp = g?.input;
    if (!inp) return this.isModal();
    const m = inp.mouse || { x: 0, y: 0 };
    const P = (a) => guard('input.pressed', () => !!inp.pressed(a), false);
    const eat = (a) => guard('input.consume', () => inp.consume?.(a));
    let consumed = false;

    try {
      // トグル
      if (!this.isModal()) {
        const tg = [['inventory', 'inventory'], ['skillWin', 'skills'], ['missionWin', 'missions'], ['statWin', 'stats'],
          ['mapWin', 'worldmap'], ['bookWin', 'book'], ['phoneWin', 'phone']];
        for (const [act, nm] of tg) if (P(act)) { this.toggle(nm); eat(act); consumed = true; }
      } else if (this.wins.worldmap && this.order[this.order.length - 1] === 'worldmap' && P('mapWin')) {
        this.close('worldmap'); eat('mapWin'); consumed = true;
      }
      if (P('escape') && this.order.length) {
        const topW = this.wins[this.order[this.order.length - 1]];
        if (this.dnd) this.dnd = null;
        else if (topW?.confirm) topW.confirm = null;
        else this.close();
        eat('escape'); consumed = true;
      }

      // ウィンドウドラッグ中
      if (this.drag) {
        if (m.down) {
          const w = this.drag.win;
          w.x = clamp(m.x - this.drag.dx, -w.w + 80, W - 80);
          w.y = clamp(m.y - this.drag.dy, 0, H - 40);
        } else this.drag = null;
        consumed = true;
      }
      // D&D
      if (this.dnd) {
        if (m.down) {
          if (Math.hypot(m.x - this.dnd.sx, m.y - this.dnd.sy) > 6) this.dnd.active = true;
        } else {
          if (this.dnd.active) this.drop(this.dnd.payload, m.x, m.y);
          this.dnd = null;
        }
        consumed = true;
      }

      const top = this.winAt(m.x, m.y);
      if (m.clicked) {
        const hit = this.hitAt(m.x, m.y, top);
        if (top) { this.front(top.name); consumed = true; }
        if (hit) {
          consumed = true;
          if (hit.drag) this.dnd = { payload: hit.drag, sx: m.x, sy: m.y, active: false };
          const t = now();
          const dbl = this.lastClick.id === hit.id && t - this.lastClick.t < 0.38;
          if (dbl && hit.onDbl) { hit.onDbl(); this.lastClick = { id: null, t: -9 }; this._dblAt = t; } else {
            hit.onClick?.();
            this.lastClick = { id: hit.id, t };
          }
        } else if (top && m.y < top.y + 40 && top.name !== 'death') {
          this.drag = { win: top, dx: m.x - top.x, dy: m.y - top.y };
        }
      }
      // ブラウザの dblclick（2回の mousedown が同一フレームに入った場合の救済）
      if (m.dblClicked && !(now() - (this._dblAt || -9) < 0.5)) {
        const hit = this.hitAt(m.x, m.y, top);
        if (hit?.onDbl) { hit.onDbl(); this._dblAt = now(); this.lastClick = { id: null, t: -9 }; consumed = true; }
      }
      if (m.rightClicked) {
        const hit = this.hitAt(m.x, m.y, top);
        if (hit?.onRight) { hit.onRight(); consumed = true; } else if (top) consumed = true;
        else if (!this.isModal()) {
          // HUD のスロットを右クリックで解除
          for (const sl of hudSlots()) {
            if (!inRect(m.x, m.y, sl)) continue;
            const bar = sl.kind === 'skill' ? 'skillBar' : 'potionBar';
            if (g.state?.[bar]?.[sl.i]) { g.state[bar][sl.i] = null; this.notify('スロットを解除しました', COL.dim); }
            consumed = true;
          }
        }
      }

      // キーボード（モーダル / インベントリ）
      const topName = this.order[this.order.length - 1];
      if (topName === 'dialog') dialogKey(this, this.wins.dialog, P, eat);
      else if (topName === 'worldmap' && this.wins.worldmap?.confirm && P('confirm')) {
        rideTaxi(this, this.wins.worldmap);
        eat('confirm'); eat('interact'); consumed = true;
      }
      else if (topName === 'death') {
        if ((P('confirm') || P('interact')) && this.wins.death.t > 0.4) { this.revive(); eat('confirm'); eat('interact'); }
      } else if (topName === 'inventory' && P('confirm') && P('interact') && !P('jump')) {
        // Enter で選択アイテムを装備/使用
        const w = this.wins.inventory;
        if (w.onEnter) { w.onEnter(); eat('confirm'); eat('interact'); consumed = true; }
      }
      if (this.isModal()) {
        for (const a of ['attack', 'jump', 'skill1', 'skill2', 'skill3', 'skill4', 'potion1', 'potion2', 'pickup', 'interact', 'up', 'down', 'confirm']) eat(a);
      }
    } catch (e) {
      guard('ui.handleInput', () => { throw e; });
    }
    return consumed || this.isModal();
  }

  hitAt(x, y, top) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (!inRect(x, y, h.r)) continue;
      if (top && h.win !== top.name) continue;
      if (!top && h.win) continue;
      return h;
    }
    return null;
  }

  drop(payload, x, y) {
    const st = this.game.state;
    if (!st || !payload) return;
    // ウィンドウ内のドロップ先
    const top = this.winAt(x, y);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.onDrop && inRect(x, y, h.r) && (!top || h.win === top.name)) { h.onDrop(payload); return; }
    }
    if (top) return;
    for (const sl of hudSlots()) {
      if (!inRect(x, y, sl)) continue;
      if (payload.kind === 'skill' && sl.kind === 'skill') this.assignSkill(payload.id, sl.i);
      else if (payload.kind === 'potion' && sl.kind === 'potion') this.assignPotion(payload.id, sl.i);
      else this.notify('そのスロットには登録できません', COL.bad);
      return;
    }
  }

  assignSkill(id, i) {
    const st = this.game.state, sk = skillDef(id);
    if (!sk) return;
    if (sk.kind === 'passive') { this.notify('パッシブスキルは登録できません', COL.bad); return; }
    if (!(st.skills?.[id] > 0)) { this.notify('まだ習得していません', COL.bad); return; }
    st.skillBar = st.skillBar || [null, null, null, null];
    for (let k = 0; k < 4; k++) if (st.skillBar[k] === id) st.skillBar[k] = null;
    st.skillBar[i] = id;
    this.notify(`${sk.name} を [${'ASDF'[i]}] に登録`, COL.teal);
  }
  assignPotion(id, i) {
    const st = this.game.state, it = getItemDef(id);
    if (!it) return;
    if (it.type !== 'consumable') { this.notify('消費アイテムのみ登録できます', COL.bad); return; }
    st.potionBar = st.potionBar || [null, null];
    for (let k = 0; k < 2; k++) if (st.potionBar[k] === id) st.potionBar[k] = null;
    st.potionBar[i] = id;
    this.notify(`${it.name} を [${i + 1}] に登録`, COL.pink);
  }

  revive() {
    const w = this.wins.death;
    const cb = w?.data?.onRevive;
    this.close('death');
    if (typeof cb === 'function') guard('onRevive', () => cb());
  }

  // ---------- 更新 ----------
  update(dt) {
    dt = Math.min(0.1, dt || 0);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.life);
    // PET 入手演出の間はレアバナー・レベルアップ演出を止めておき、終わってから順に出す
    const hold = !!this.petFx;
    if (this.banners.length && !hold) {
      this.banners[0].t += dt;
      if (this.banners[0].t > this.banners[0].life) this.banners.shift();
    }
    if (this.levelFx && !hold) { this.levelFx.t += dt; if (this.levelFx.t > this.levelFx.life) this.levelFx = null; }
    if (this.petFx) { this.petFx.t += dt; if (this.petFx.t > this.petFx.life) this.petFx = null; }
    for (const b of this.bookToasts) b.t += dt;
    this.bookToasts = this.bookToasts.filter((b) => b.t < b.life);
    if (this.radio) this.radio.t += dt;
    if (this.wins.worldmap?.confirm) this.wins.worldmap.confirm.t += dt;
    for (const n of this.order) {
      const w = this.wins[n];
      if (!w) continue;
      w.t += dt;
      if (n === 'dialog' && w.lines) {
        const line = w.lines[w.li] || '';
        if (w.chars < line.length) w.chars = Math.min(line.length, w.chars + dt * 42);
      }
    }
  }

  // ---------- 描画ヘルパ（windows.js から使う） ----------
  mouse() { return this.game?.input?.mouse || { x: -1, y: -1 }; }
  hover(win, r) {
    const m = this.mouse();
    if (this.drag || (this.dnd && this.dnd.active)) return false;
    return inRect(m.x, m.y, r) && this.winAt(m.x, m.y) === win;
  }
  hit(win, id, r, h = {}) { this._hits.push({ id: win.name + ':' + id, win: win.name, r, ...h }); }
  btn(ctx, win, id, r, label, onClick, o = {}) {
    const hov = this.hover(win, r);
    drawButton(ctx, r, label, { ...o, hover: hov });
    if (!o.disabled) this.hit(win, id, r, { onClick });
    return hov;
  }
  setTip(lines) { this.tip = lines; }

  frameWin(ctx, win) {
    const { x, y, w, h } = win;
    if (win.name === 'phone') return; // スマホは自前のフレーム
    if (win.name === 'death' || win.name === 'dialog') {
      panel(ctx, x, y, w, h, { r: 18, glow: win.name === 'death' ? 'rgba(255,95,162,0.6)' : 'rgba(25,211,197,0.45)', inner: win.name === 'death' ? 'rgba(255,95,162,0.6)' : 'rgba(25,211,197,0.55)' });
      return;
    }
    const focused = this.order[this.order.length - 1] === win.name;
    panel(ctx, x, y, w, h, { r: 16, glow: focused ? 'rgba(123,47,247,0.55)' : null, inner: 'rgba(255,95,162,0.45)' });
    // タイトルバー
    ctx.save();
    rrPath(ctx, x + 6, y + 6, w - 12, 30, 11);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, focused ? 'rgba(255,95,162,0.95)' : 'rgba(255,95,162,0.55)');
    g.addColorStop(0.55, focused ? 'rgba(123,47,247,0.95)' : 'rgba(123,47,247,0.55)');
    g.addColorStop(1, focused ? 'rgba(25,211,197,0.9)' : 'rgba(25,211,197,0.5)');
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    txt(ctx, '✦ ' + (win.title || ''), x + 18, y + 21.5, { size: 16 });
    if (win.key) txt(ctx, `[${win.key}]`, x + w - 52, y + 21.5, { size: 12, align: 'right', color: '#ffe3f0', sw: 3 });
    const cr = { x: x + w - 40, y: y + 9, w: 26, h: 24 };
    const hov = this.hover(win, cr);
    ctx.save();
    rrPath(ctx, cr.x, cr.y, cr.w, cr.h, 8);
    ctx.fillStyle = hov ? '#ff5fa2' : 'rgba(20,10,50,0.6)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    txt(ctx, '×', cr.x + cr.w / 2, cr.y + cr.h / 2 + 1, { size: 17, align: 'center', sw: 2 });
    this.hit(win, 'close', cr, { onClick: () => this.close(win.name) });
  }

  // ---------- 描画 ----------
  draw(ctx) {
    this.frame++;
    this._hits = [];
    this.tip = null;
    const g = this.game;
    // main が同じフレームに drawHUD を呼んでいれば drawHUD 側で何もしない（game.frameNo で判定）
    if (g && g.state && (g.scene == null || g.scene === 'play')) {
      ctx.save();
      try { drawHUD(ctx, g, true); } catch (e) { guard('hud', () => { throw e; }); }
      ctx.restore();
    }
    if (this.wins.death) {
      const a = Math.min(1, this.wins.death.t / 0.6);
      ctx.save();
      ctx.fillStyle = `rgba(20,0,20,${0.55 * a})`;
      ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(120,0,40,${0.5 * a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    for (const n of this.order) {
      const win = this.wins[n];
      if (!win) continue;
      if (n === 'worldmap') {
        ctx.save();
        ctx.fillStyle = `rgba(4,2,16,${0.6 * Math.min(1, win.t / 0.2)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      ctx.save();
      try {
        // 開く時のポップ
        const k = Math.min(1, win.t / 0.14);
        if (k < 1) {
          const cx = win.x + win.w / 2, cy = win.y + win.h / 2, s = 0.92 + 0.08 * k;
          ctx.globalAlpha = 0.4 + 0.6 * k;
          ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        }
        this.frameWin(ctx, win);
        WINDOW_DRAW[n]?.(this, ctx, win);
      } catch (e) {
        guard('win.' + n, () => { throw e; });
      }
      ctx.restore();
    }
    // ツールチップ
    if (this.tip && !this.dnd?.active) {
      ctx.save();
      try { drawTooltipBox(ctx, this.tip, this.mouse()); } catch (e) { guard('tooltip', () => { throw e; }); }
      ctx.restore();
    }
    // D&D 中のアイコン
    if (this.dnd?.active) {
      const m = this.mouse(), p = this.dnd.payload;
      ctx.save();
      ctx.globalAlpha = 0.85;
      if (p.kind === 'skill') drawSkillIco(ctx, skillDef(p.id), m.x, m.y, 44);
      else drawItemIco(ctx, getItemDef(p.id), m.x, m.y, 44);
      ctx.restore();
      // ドロップ候補をハイライト
      ctx.save();
      for (const sl of hudSlots()) {
        if ((p.kind === 'skill') !== (sl.kind === 'skill')) continue;
        rrPath(ctx, sl.x - 2, sl.y - 2, sl.w + 4, sl.h + 4, 12);
        ctx.lineWidth = 2.5; ctx.strokeStyle = inRect(m.x, m.y, sl) ? '#fff' : 'rgba(255,212,71,0.7)';
        ctx.stroke();
      }
      ctx.restore();
    }
    this.hits = this._hits;
    void font;
  }
}

export default UIManager;
