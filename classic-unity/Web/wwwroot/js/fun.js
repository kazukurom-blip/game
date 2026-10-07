// 楽しさの要素の画面（試遊版）: 町の機械・係の絵と窓（景品の機械・遊び場の五目並べと神経衰弱・美容院・見た目の品の店・印の交換・祭りの係）、
// 船の旅の残り時間と「すぐ着く」、感情表現（R ＋ 1〜7・R だけで選ぶ帯）、見た目（髪型・顔・帽子・服・名札・吹き出し）、
// 珍しい色違いの敵の光、フィールドボスの知らせ、大当たりの画面全体の知らせ、ダンジョンの仕掛け、天気と季節の飾り。
// 中身は C# の src/Fun.cs（FunFrame・FunUi・Act の続き）→ Core の GameSession.Fun.cs。ほかの画面のファイルには呼び出しだけを足してある。
import { DEFAULT_LOOK } from './avatar/avatar.js';
import { OUTFITS } from './avatar/parts_fun.js';
import { itemColor } from './render.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('ja-JP');
const TIER = ['ふつう', '少し珍しい', '大当たり'];
const KIND_TITLE = { gacha: '景品の機械', arcade: '遊び場', salon: '美容院', boutique: '見た目の品の店', marks: '踏破の印の交換', season: '祭りの係' };
const SALON_NAMES = { hair: '髪型', hairColor: '髪の色', face: '顔（目）', skin: '肌の色' };
const TAG_STYLE = { wood: ['#8a5a2a', '#f0d8b0'], gold: ['#b08a10', '#fff4b0'], sakura: ['#d0608a', '#ffe4ee'], star: ['#3a3a90', '#fff060'], ice: ['#3a80c0', '#e8f8ff'] };
const BUBBLE_STYLE = { cloud: ['#ffffff', '#8090b0'], heart: ['#ffe0ec', '#e05080'], scroll: ['#f4e4c0', '#8a6030'], neon: ['#102030', '#40ffe0'], leaf: ['#e4ffd8', '#4a9a30'] };
const EMOTE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

export class Fun {
  constructor(game) {
    this.game = game;
    this.api = game.api;
    this.data = JSON.parse(game.data['fun.json'] || '{}');
    this.emotes = this.data.emotes || [];
    this.voyageNpcs = new Set((this.data.voyages || []).map((v) => v.npc));
    this.fr = null;          // FunFrame の結果
    this.win = null;         // 開いている機械・係の ID
    this.ui = null;          // FunUi の結果
    this.tab = '';           // 窓の中のタブ
    this.rHeld = false; this.rUsed = false; this.palette = false;
    this.parts = [];         // 天気・季節の粒
    this.banner = null;
    this.t = 0;
    const root = game.ui.root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.box = document.createElement('div'); this.box.id = 'funwin'; root.appendChild(this.box);
    this.hudEl = document.createElement('div'); this.hudEl.id = 'funhud'; root.appendChild(this.hudEl);
    this.bannerEl = document.createElement('div'); this.bannerEl.id = 'funbanner'; root.appendChild(this.bannerEl);
    this.box.addEventListener('click', (e) => this.onClick(e));
    this.hudEl.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keyup', (e) => this.keyUp(e));
    this.patch();
  }

  // ---------------- ほかの画面へのつなぎ（会話の窓の乗り物・Esc・会話の間は動かない）
  patch() {
    const ui = this.game.ui, fun = this;
    const winDialog = ui.winDialog.bind(ui);
    ui.winDialog = (s) => {
      let html = winDialog(s);
      const d = ui.dialog;
      if (d?.travel && fun.voyageNpcs.has(d.npc) && !fun.fr?.voyage) {
        // 雲の船: 船の上で 1〜2 分の旅（途中で襲撃）。待てない人は「すぐ着く」
        html = html.replace(`<button data-act="travel" data-a="${d.npc}">乗る（`, `<button data-act="board" data-a="${d.npc}">船の旅で行く（`)
          .replace(/(<button data-act="board"[^>]*>[^<]*<\/button>)/, `$1<button data-act="travel" data-a="${d.npc}">すぐ着く</button>`);
      }
      if (d?.travel && fun.fr?.voyage) html = html.replace(/<button data-act="travel" data-a="[^"]*">[^<]*<\/button>/, `<button data-act="travel" data-a="${d.npc}">すぐ着く（船を下りる）</button>`);
      return html;
    };
    const doAct = ui.doAct.bind(ui);
    ui.doAct = (cmd, a, b, n) => { doAct(cmd, a, b, n); if (cmd === 'board' && ui.open.has('dialog')) ui.close('dialog'); };
    const closeTop = ui.closeTop.bind(ui);
    ui.closeTop = () => { if (fun.palette) { fun.palette = false; fun.drawHud(); return true; } if (fun.win) { fun.close(); return true; } return closeTop(); };
    const talking = this.game.talking.bind(this.game);
    this.game.talking = () => talking() || !!this.win;
  }

  act(cmd, a = '', b = '', n = 0) {
    const r = this.game.act(cmd, a, b, n);
    if (r.msg) this.game.ui.msg(r.msg, r.ok ? '' : 'bad');
    this.game.audio.sfx(r.ok ? 'ui_ok' : 'ui_error');
    this.game.ui.refresh(false);
    return r;
  }

  // ---------------- キー（main.js の keydown から先に呼ぶ。使ったら true）
  key(e) {
    const c = e.code;
    if (c === 'KeyR') { if (!e.repeat) { this.rHeld = true; this.rUsed = false; } return true; }
    if (this.rHeld || this.palette) {
      const i = EMOTE_KEYS.indexOf(c);
      if (i >= 0 && i < this.emotes.length) { if (!e.repeat) this.emote(this.emotes[i].id); this.rUsed = true; this.palette = false; this.drawHud(); return true; }
    }
    if (this.win && !e.repeat) {
      if (c === 'KeyV' || c === 'Enter' || c === 'NumpadEnter') { this.close(); return true; }
    }
    return false;
  }
  keyUp(e) {
    if (e.code !== 'KeyR') return;
    if (this.rHeld && !this.rUsed) { this.palette = !this.palette; this.drawHud(); }
    this.rHeld = false;
  }
  emote(id) { this.act('emote', id); }

  // ---------------- 毎フレーム
  frame(f, dt) {
    this.t += dt;
    let fr;
    try { fr = JSON.parse(this.api.FunFrame()); } catch (e) { console.warn(e); return; }
    if (!fr) return;
    this.fr = fr;
    this.game.renderer.look = this.buildLook(fr);
    const bub = this.lookOf(fr.look?.bubble) || '';
    if ((this.game.ui.root.dataset.bubble || '') !== bub) { if (bub) this.game.ui.root.dataset.bubble = bub; else delete this.game.ui.root.dataset.bubble; }
    if (fr.open) this.open(fr.open);
    for (const e of f.ev) if (e[0] === 'Fun') this.onEvent(e);
    this.drawWorld(f, dt);
    if (this.game.frameNo % 6 === 0) this.drawHud();
    // 天気: BGM の音量
    const au = this.game.audio;
    if (au.ctx && au.bgmGain) { const want = (au.vol.bgm || 0) * (fr.bgmVol ?? 1); if (Math.abs(au.bgmGain.gain.value - want) > 0.01) au.bgmGain.gain.value = want; }
    if (this.win && this.game.frameNo % 30 === 0 && this.ui?.kind !== 'arcade') { /* 開いている窓の数（券・お金）を新しく */ this.reload(false); }
  }

  lookOf(itemId) { return itemId ? this.data.looks?.[itemId]?.look : null; }

  buildLook(fr) {
    const l = fr.look || {};
    const outfit = OUTFITS[this.lookOf(l.outfit)] || {};
    const parts = ['body', fr.emoteFace || l.face || 'face_basic', l.hair || 'hair_spiky', 'top_tee', 'pants_long', 'shoes_basic'];
    const hat = this.lookOf(l.hat);
    if (hat) parts.push(hat);
    const look = { ...DEFAULT_LOOK, skin: l.skin || 'light', hairColor: l.hairColor || 'brown', topColor: outfit.topColor || 'blue', pantsColor: outfit.pantsColor || 'navy', parts };
    const prev = this.game.renderer.look;
    return prev && JSON.stringify(prev) === JSON.stringify(look) ? prev : look;
  }

  onEvent(e) {
    const [, id, value, , , text] = e;
    const U = this.game.ui;
    const kind = String(id).split(':')[0];
    switch (kind) {
      case 'jackpot': this.showBanner(text || '大当たり！'); U.msg(text, 'big'); this.game.audio.sfx('levelup'); break;
      case 'gacha': U.msg(text, value >= 1 ? 'big' : 'item'); break;
      case 'boss_warn': U.toast('大きな気配…'); U.msg(text, 'bad'); break;
      case 'boss_spawn': U.toast(text); U.msg(text, 'bad'); break;
      case 'boss_down': case 'rare_down': case 'voyage_clear': case 'season': case 'dungeon_task': case 'dungeon_chest': U.msg(text, 'big'); if (kind === 'dungeon_task') U.toast('課題を達成！'); break;
      case 'voyage_start': case 'voyage_arrive': U.toast(text); break;
      case 'voyage_raid': U.toast(text); U.msg(text, 'bad'); break;
      case 'rare': U.msg(text, 'big'); break;
      case 'arcade': case 'salon': case 'look': case 'dungeon_progress': case 'dungeon_reset': U.msg(text); break;
      default: break;
    }
  }

  showBanner(text) {
    this.bannerEl.innerHTML = `<div><b>★ 大当たり ★</b><br>${esc(text)}</div>`;
    this.bannerEl.classList.remove('show'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('show');
  }

  // ---------------- 画面の上に描く物（世界の座標）
  drawWorld(f, dt) {
    const R = this.game.renderer, g = R.g, S = R.scale, fr = this.fr;
    if (!R.map) return;
    const cx = Math.round(R.cam.x), cy = Math.round(R.cam.y);
    g.save();
    g.setTransform(S, 0, 0, S, -cx * S, -cy * S);
    if (fr.season) this.drawSeason(g, fr.season, cx, cy);
    for (const s of fr.spots || []) this.drawSpot(g, s, s.id === fr.near);
    if (fr.dungeon) this.drawDungeon(g, fr.dungeon);
    // 珍しい色違いの個体（光る輪と印）・フィールドボス（名札）
    for (const m of f.mo) {
      const flags = m[9];
      if (flags & 128) {
        const r = 26 + Math.sin(this.t * 6) * 4;
        const gr = g.createRadialGradient(m[2], m[3] - 20, 4, m[2], m[3] - 20, r + 10);
        gr.addColorStop(0, 'rgba(255,240,120,0.45)'); gr.addColorStop(1, 'rgba(255,200,40,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(m[2], m[3] - 20, r + 10, 0, Math.PI * 2); g.fill();
        this.tag(g, '★珍しい ' + (this.game.db.monsters[m[1]]?.name || ''), m[2], m[3] + 6, '#fff070', '#6a4a00');
      } else if (flags & 256) this.tag(g, '◆ ' + (this.game.db.monsters[m[1]]?.name || ''), m[2], m[3] + 6, '#ffb0b0', '#600010');
    }
    // 主人公: 名札・感情表現の吹き出し
    const p = f.p;
    const st = this.game.ui.state;
    if (!p[6] && p[5]) {
      const tag = this.lookOf(fr.look?.tag);
      if (tag && st) { const [bg, fg] = TAG_STYLE[tag] || TAG_STYLE.wood; this.tag(g, st.name, p[0], p[1] + 2, fg, bg, true); }
      if (fr.emote) {
        const em = this.emotes.find((x) => x.id === fr.emote);
        const [bg, fg] = BUBBLE_STYLE[this.lookOf(fr.look?.bubble)] || ['#ffffff', '#404050'];
        this.bubble(g, em?.name || fr.emote, p[0], p[1] - (st?.medal ? 116 : 96), bg, fg);
      }
    }
    g.restore();
    // 天気（画面の座標）
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    this.drawWeather(g, fr.weather || (fr.season === 'winter' ? 'snow_light' : fr.season === 'autumn' ? 'leaves' : null), dt);
    g.restore();
  }

  tag(g, text, x, y, fg, bg, plate) {
    g.font = '10px sans-serif'; g.textBaseline = 'top'; g.textAlign = 'center';
    const w = Math.ceil(g.measureText(text).width) + 8;
    g.fillStyle = bg || 'rgba(0,0,0,0.6)'; g.fillRect(Math.round(x - w / 2), Math.round(y), w, 13);
    if (plate) { g.strokeStyle = fg; g.lineWidth = 1; g.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y) + 0.5, w - 1, 12); }
    g.fillStyle = fg; g.fillText(text, Math.round(x), Math.round(y) + 1);
    g.textAlign = 'left';
  }

  bubble(g, text, x, y, bg, fg) {
    g.font = '11px sans-serif'; g.textBaseline = 'top'; g.textAlign = 'center';
    const w = Math.ceil(g.measureText(text).width) + 14;
    const bx = Math.round(x - w / 2), by = Math.round(y);
    g.fillStyle = fg; g.fillRect(bx - 1, by - 1, w + 2, 18);
    g.fillStyle = bg; g.fillRect(bx, by, w, 16);
    g.beginPath(); g.moveTo(x - 4, by + 16); g.lineTo(x + 4, by + 16); g.lineTo(x, by + 22); g.closePath(); g.fillStyle = fg; g.fill();
    g.fillStyle = fg === '#40ffe0' ? fg : '#202030'; g.fillText(text, Math.round(x), by + 2);
    g.textAlign = 'left';
  }

  drawSpot(g, s, near) {
    const x = Math.round(s.x), y = Math.round(s.y), t = this.t;
    if (s.kind === 'gacha') {
      // カプセルの機械（仮の絵）
      g.fillStyle = '#c03040'; g.fillRect(x - 16, y - 30, 32, 30);
      g.fillStyle = '#802030'; g.fillRect(x - 16, y - 4, 32, 4);
      g.fillStyle = 'rgba(200,240,255,0.85)'; g.beginPath(); g.arc(x, y - 44, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
      const cols = ['#ff6060', '#ffd040', '#60c0ff', '#80e080', '#ff90d0'];
      for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.arc(x - 9 + (i % 3) * 9, y - 40 - Math.floor(i / 3) * 9, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffe060'; g.beginPath(); g.arc(x, y - 18, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#806000'; g.fillRect(x - 5, y - 19, 10, 2);
      g.fillStyle = '#202020'; g.fillRect(x - 6, y - 9, 12, 5);
    } else {
      // 係（仮のアバターの代わりに人の形）
      const col = { arcade: '#d08030', salon: '#d060a0', boutique: '#60a0d0', marks: '#80a050', season: '#e0a020' }[s.kind] || '#8080c0';
      g.fillStyle = '#ffd9b4'; g.beginPath(); g.arc(x, y - 44, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a3a20'; g.fillRect(x - 9, y - 54, 18, 6);
      g.fillStyle = col; g.fillRect(x - 9, y - 35, 18, 22);
      g.fillStyle = '#404060'; g.fillRect(x - 8, y - 13, 7, 13); g.fillRect(x + 1, y - 13, 7, 13);
      g.fillStyle = '#202030'; g.fillRect(x + 2, y - 46, 2, 3); g.fillRect(x - 4, y - 46, 2, 3);
      if (s.kind === 'arcade') { g.fillStyle = '#ffffff'; g.fillRect(x + 14, y - 34, 16, 16); g.fillStyle = '#000'; for (let i = 0; i < 3; i++) g.fillRect(x + 16 + i * 5, y - 32 + (i % 2) * 6, 3, 3); }
      if (s.kind === 'season') { g.fillStyle = '#ff9030'; g.beginPath(); g.arc(x + 20, y - 30 + Math.sin(t * 3) * 2, 6, 0, Math.PI * 2); g.fill(); }
    }
    this.tag(g, s.name, x, y + 4, '#ffd8a0');
    if (near) this.tag(g, 'V で調べる', x, y + 19, '#c8f0ff');
  }

  drawDungeon(g, dg) {
    const t = this.t;
    dg.rooms.forEach((r, i) => {
      if (!r.kind) return;
      const cx = (r.x1 + r.x2) / 2;
      this.tag(g, `部屋 ${i + 1}: ${r.label}${r.done ? '（達成）' : ''}`, cx, 220, r.done ? '#90ff90' : '#ffe0a0');
      if (r.kind === 'switch') r.sw.forEach(([x, y], k) => {
        const on = r.done || k < r.next;
        g.fillStyle = on ? '#60ff80' : '#ff6060'; g.fillRect(x - 10, y - 6, 20, 6);
        g.fillStyle = '#303030'; g.fillRect(x - 12, y - 2, 24, 2);
        this.tag(g, String(k + 1), x, y - 24, '#ffffff');
      });
      if (r.kind === 'carry' && !r.done) {
        const [gx, gy] = r.goal; g.strokeStyle = '#60ff80'; g.lineWidth = 2; g.strokeRect(gx - 20, gy - 40, 40, 40); this.tag(g, '出口の印', gx, gy - 56, '#60ff80');
        if (!r.carry) { const [x, y] = r.crate; g.fillStyle = '#a06830'; g.fillRect(x - 12, y - 22, 24, 22); g.fillStyle = '#704418'; g.fillRect(x - 12, y - 12, 24, 2); this.tag(g, '荷物', x, y - 36, '#ffe0a0'); }
        else this.tag(g, `荷物 あと ${Math.ceil(r.carryLeft)} 秒`, gx, gy - 72, '#ffffff');
      }
      if (r.kind === 'climb') {
        const [x, y] = r.flag; g.fillStyle = '#d0d0d0'; g.fillRect(x, y - 40, 2, 40);
        g.fillStyle = r.done ? '#60ff80' : '#ff5050'; g.beginPath(); g.moveTo(x + 2, y - 40); g.lineTo(x + 20 + Math.sin(t * 5) * 2, y - 34); g.lineTo(x + 2, y - 28); g.fill();
      }
    });
    for (const [x, y, opened] of dg.chests) {
      g.fillStyle = opened ? '#6a5030' : '#c08a30'; g.fillRect(x - 14, y - 20, 28, 20);
      g.fillStyle = opened ? '#3a2810' : '#ffe060'; g.fillRect(x - 14, y - 22, 28, opened ? 3 : 5); g.fillRect(x - 2, y - 14, 4, 6);
      if (!opened) this.tag(g, 'V で開ける', x, y - 38, '#ffe060');
    }
  }

  drawSeason(g, deco, cx) {
    // 町の飾り: 上の方に旗と灯り（秋はだいだいの灯籠と葉、冬は白い玉と星）
    const m = this.game.renderer.map;
    const ground = Math.min(...m.footholds.filter((f) => f.ground).map((f) => f.points[0][1]));
    const y = ground - 150;
    g.strokeStyle = deco === 'autumn' ? '#8a5a2a' : '#c8d8f0'; g.lineWidth = 1;
    for (let x0 = Math.floor(cx / 200) * 200 - 200; x0 < cx + 1000; x0 += 200) {
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(x0 + 100, y + 24, x0 + 200, y); g.stroke();
      for (let k = 1; k < 5; k++) {
        const lx = x0 + k * 40, ly = y + Math.sin((k / 5) * Math.PI) * 18 + 4;
        if (deco === 'autumn') { g.fillStyle = k % 2 ? '#ff8a20' : '#e04830'; g.fillRect(lx - 4, ly, 8, 10); g.fillStyle = '#ffe080'; g.fillRect(lx - 2, ly + 3, 4, 4); }
        else { g.fillStyle = k % 2 ? '#ffffff' : '#a0d0ff'; g.beginPath(); g.arc(lx, ly + 5, 4, 0, Math.PI * 2); g.fill(); }
      }
    }
  }

  drawWeather(g, kind, dt) {
    if (!kind) { this.parts.length = 0; return; }
    const want = { rain: 90, snow: 70, snow_light: 25, petals: 30, leaves: 18, fog: 0 }[kind] ?? 0;
    const P = this.parts;
    while (P.length < want) P.push({ x: Math.random() * 820, y: Math.random() * 540 - 20, s: 0.6 + Math.random() * 0.8, p: Math.random() * 6 });
    if (P.length > want) P.length = want;
    if (kind === 'fog') {
      for (let i = 0; i < 3; i++) {
        const x = ((this.t * (8 + i * 5)) % 1000) - 200;
        const gr = g.createLinearGradient(0, 0, 800, 0);
        gr.addColorStop(0, 'rgba(220,230,240,0)'); gr.addColorStop(0.5, 'rgba(220,230,240,0.18)'); gr.addColorStop(1, 'rgba(220,230,240,0)');
        g.fillStyle = gr; g.fillRect(x - 400, 180 + i * 90, 1400, 90);
      }
      return;
    }
    for (const q of P) {
      if (kind === 'rain') { q.y += 520 * q.s * dt; q.x -= 60 * dt; g.strokeStyle = 'rgba(170,200,255,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - 3, q.y + 10); g.stroke(); }
      else if (kind === 'snow' || kind === 'snow_light') { q.y += 40 * q.s * dt; q.x += Math.sin(this.t + q.p) * 15 * dt; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(q.x, q.y, 2, 2); }
      else { q.y += 45 * q.s * dt; q.x += (Math.sin(this.t * 1.5 + q.p) * 30 - 10) * dt; g.fillStyle = kind === 'petals' ? '#ffc0d8' : (q.p > 3 ? '#e08030' : '#c05020'); g.fillRect(q.x, q.y, 3, 2); }
      if (q.y > 540) { q.y = -10; q.x = Math.random() * 820; }
      if (q.x < -10) q.x = 810;
    }
  }

  // ---------------- HUD（船の旅・フィールドボスの気配・感情表現の帯）
  drawHud() {
    const fr = this.fr;
    let h = '';
    if (fr?.voyage) {
      const v = fr.voyage;
      h += `<div class="voy"><b>${esc(v.to)}行きの船</b> あと ${v.left} 秒${v.raid ? ' <span class="bad">襲撃中！</span>' : ''}<div class="vbar"><i style="width:${Math.round((1 - v.left / Math.max(1, v.total)) * 100)}%"></i></div><button data-f="voyageSkip">すぐ着く</button></div>`;
    }
    if (fr && fr.bossIn >= 0 && fr.bossIn <= 60) h += `<div class="voy"><span class="bad">大きな気配</span> あと ${fr.bossIn} 秒</div>`;
    if (this.palette) h += `<div class="emo">${this.emotes.map((e, i) => `<button data-f="emote" data-a="${e.id}">${i + 1} ${esc(e.name)}</button>`).join('')}<small>R＋数字でも</small></div>`;
    if (this.hudEl.innerHTML !== h) this.hudEl.innerHTML = h;
  }

  // ---------------- 窓
  open(id) {
    this.win = id; this.tab = '';
    this.game.audio.sfx('ui_open');
    this.reload(true);
  }
  close() {
    if (!this.win) return;
    if (this.ui?.game) this.act('arcadeEnd');
    this.win = null; this.ui = null; this.box.innerHTML = '';
    this.game.audio.sfx('ui_close');
  }
  reload(render = true) {
    if (!this.win) return;
    this.ui = JSON.parse(this.api.FunUi(this.win));
    if (render) this.render();
  }

  itemName(id) { return this.game.db.items[id]?.name || id; }
  icon(id) { const d = this.game.db.items[id]; return `<span class="ic" style="background:${itemColor(d)}"></span>`; }

  render() {
    const u = this.ui;
    if (!u) { this.box.innerHTML = ''; return; }
    let body = '';
    const head = `<div class="dim">お金 ${num(u.meso)} ルド・券 ${u.tickets} 枚・遊び場の点数 ${num(u.points)}</div>`;
    switch (u.kind) {
      case 'gacha': body = this.winGacha(u); break;
      case 'arcade': body = this.winArcade(u); break;
      case 'salon': body = this.winSalon(u); break;
      case 'boutique': body = this.winBoutique(u); break;
      case 'marks': body = this.winMarks(u); break;
      case 'season': body = this.winSeason(u); break;
    }
    const wide = u.kind === 'arcade' && u.game?.kind === 'gomoku' ? ' big' : '';
    this.box.innerHTML = `<div class="win fun${wide}" id="w_fun"><div class="title">${esc(u.name)}（${KIND_TITLE[u.kind] || ''}）<button class="x" data-f="close">×</button></div><div class="body">${head}${body}<div class="dim keyhint">V・Esc で閉じる</div></div></div>`;
  }

  winGacha(u) {
    let h = `<div class="say">券を 1 枚入れて、取っ手を回そう。出る物と確率:</div>`;
    h += `<div class="tiers">ふつう ${u.tiers[0]}%・少し珍しい ${u.tiers[1]}%・<b class="gold">大当たり ${u.tiers[2]}%</b></div><div class="list">`;
    for (const p of u.prizes) h += `<div class="row t${p.tier}">${this.icon(p.item)} ${esc(this.itemName(p.item))}${p.n > 1 ? ' ×' + p.n : ''} <small>${TIER[p.tier]}・${p.pct}%</small></div>`;
    h += `</div><div class="btns"><button data-f="gacha" class="big" ${u.tickets > 0 ? '' : 'disabled'}>回す（券 1 枚）</button><button data-f="buyTicket" data-n="1">券を買う（${num(u.ticketPrice)} ルド）</button><button data-f="buyTicket" data-n="10">10 枚</button></div>`;
    if (this.last) h += `<div class="say prize t${this.last.tier}">${TIER[this.last.tier]}！ ${this.icon(this.last.item)} ${esc(this.itemName(this.last.item))}${this.last.n > 1 ? ' ×' + this.last.n : ''}</div>`;
    h += `<div class="dim">回した数 ${u.pulls}・大当たり ${u.jackpots} 回。券は店・敵（まれ）・フィールドボス・船の襲撃・遊び場の景品でも手に入る。</div>`;
    return h;
  }

  winArcade(u) {
    const g = u.game;
    if (g?.kind === 'gomoku') return this.winGomoku(g);
    if (g?.kind === 'memory') return this.winMemory(g);
    const pts = (t) => `勝ち ${t[0]}・引き分け ${t[1]}・負け ${t[2]} 点`;
    let h = `<div class="say">いらっしゃい。遊んで点数をためれば、景品と替えられるよ。</div>`;
    h += `<div class="opt-row"><b>五目並べ</b>（15×15・先に 5 つ並べた方の勝ち）<br><button data-f="arcadeStart" data-b="gomoku" data-n="0">やさしい</button><small>${pts(u.gomokuPts.easy)}</small> <button data-f="arcadeStart" data-b="gomoku" data-n="1">ふつう</button><small>${pts(u.gomokuPts.normal)}</small></div>`;
    h += `<div class="opt-row"><b>神経衰弱</b>（16 枚・交代でめくる）<br><button data-f="arcadeStart" data-b="memory" data-n="0">やさしい</button><small>${pts(u.memoryPts.easy)}</small> <button data-f="arcadeStart" data-b="memory" data-n="1">ふつう</button><small>${pts(u.memoryPts.normal)}</small></div>`;
    h += `<b>景品の交換</b>（点数 ${num(u.points)}・勝った数 ${u.wins}）<div class="list">`;
    u.prizes.forEach((p, i) => { h += `<div class="row">${this.icon(p.item)} ${esc(this.itemName(p.item))}${p.n > 1 ? ' ×' + p.n : ''} <small>${p.cost} 点</small> <button data-f="arcadeEx" data-n="${i}" ${u.points >= p.cost ? '' : 'disabled'}>替える</button></div>`; });
    return h + '</div>';
  }

  winGomoku(g) {
    const n = g.size;
    const win = new Set(); for (let i = 0; i < g.win.length; i += 2) win.add(g.win[i + 1] * n + g.win[i]);
    let h = `<div class="say">${g.state === 'Playing' ? 'あなたは黒（先手）。空いている所をクリック。' : esc(g.result || '')}</div><div class="gomoku" style="grid-template-columns:repeat(${n},17px)">`;
    g.cells.forEach((c, i) => {
      const last = g.last[1] * n + g.last[0] === i;
      h += `<button class="gc${c === 1 ? ' b' : c === 2 ? ' w' : ''}${last ? ' last' : ''}${win.has(i) ? ' win' : ''}" data-f="gomoku" data-n="${i}" ${c || g.state !== 'Playing' ? 'disabled' : ''}></button>`;
    });
    h += `</div><div class="btns"><button data-f="arcadeEnd">${g.state === 'Playing' ? 'やめる' : 'もどる'}</button></div>`;
    return h;
  }

  winMemory(g) {
    const PICS = ['★', '♪', '◆', '●', '▲', '♥', '☀', '☾'];
    const COLS = ['#ffd040', '#60c0ff', '#ff6080', '#80e080', '#c080ff', '#ff9040', '#ffffff', '#a0a0ff'];
    let h = `<div class="say">あなた ${g.mine} 組・係 ${g.npc} 組　${g.state === 'Finished' ? esc(g.result || '') : g.peek ? 'そろわなかった。「続ける」で係の番。' : '2 枚めくってそろえよう。'}</div>`;
    if (g.npcFlips.length) {
      let s = '係のめくった札: ';
      for (let i = 0; i + 1 < g.npcFlips.length; i += 3) s += `${PICS[g.npcCards[(i / 3) * 2]] || '?'}${PICS[g.npcCards[(i / 3) * 2 + 1]] || '?'}${g.npcFlips[i + 2] ? '（そろった）' : ''} `;
      h += `<div class="dim">${s}</div>`;
    }
    h += '<div class="memory">';
    g.cards.forEach((c, i) => {
      const owner = g.owner[i];
      h += `<button class="mc${c >= 0 ? ' up' : ''}${owner === 1 ? ' mine' : owner === 2 ? ' npc' : ''}" data-f="memFlip" data-n="${i}" ${c >= 0 && !g.peek || g.state === 'Finished' ? 'disabled' : ''} style="${c >= 0 ? 'color:' + COLS[c] : ''}">${c >= 0 ? PICS[c] : '？'}</button>`;
    });
    h += `</div><div class="btns">${g.peek ? '<button data-f="memCont">続ける（係の番）</button>' : ''}<button data-f="arcadeEnd">${g.state === 'Finished' ? 'もどる' : 'やめる'}</button></div>`;
    return h;
  }

  winSalon(u) {
    const tab = this.tab || 'hair';
    let h = `<div class="tabs">${Object.keys(SALON_NAMES).map((k) => `<button class="${k === tab ? 'on' : ''}" data-f="tab" data-a="${k}">${SALON_NAMES[k]}</button>`).join('')}</div>`;
    const cp = u.coupon[tab];
    h += `<div class="dim">${num(u.price[tab])} ルド、または ${esc(this.itemName(cp?.item))}（${cp?.have || 0} 枚）</div><div class="list">`;
    for (const o of u.options[tab] || []) {
      const cur = u.look[tab] === o.id;
      h += `<div class="row">${esc(o.name)}${cur ? ' <span class="good">今</span>' : ''} <button data-f="salon" data-b="${tab}:${o.id}" data-n="0" ${cur ? 'disabled' : ''}>お金で</button><button data-f="salon" data-b="${tab}:${o.id}" data-n="1" ${cur || !cp?.have ? 'disabled' : ''}>券で</button></div>`;
    }
    return h + '</div><div class="dim">見た目はセーブに残る。</div>';
  }

  winBoutique(u) {
    let h = `<div class="say">見た目だけの品だよ。持ち物の「設置」から使うと着ける・もう一度で外す。</div><div class="list">`;
    u.items.forEach((p, i) => { h += `<div class="row">${this.icon(p.item)} ${esc(this.itemName(p.item))} <small>${num(p.price)} ルド${p.have ? '・持っている' : ''}</small> <button data-f="boutique" data-n="${i}" ${u.meso >= p.price ? '' : 'disabled'}>買う</button></div>`; });
    return h + '</div>';
  }

  winMarks(u) {
    let h = `<div class="say">1 人用ダンジョンの「${esc(this.itemName(u.mark))}」を品と替えるよ。持っている印: ${u.marks}</div><div class="list">`;
    u.prizes.forEach((p, i) => { h += `<div class="row">${this.icon(p.item)} ${esc(this.itemName(p.item))}${p.n > 1 ? ' ×' + p.n : ''} <small>印 ${p.cost}</small> <button data-f="marks" data-n="${i}" ${u.marks >= p.cost ? '' : 'disabled'}>替える</button></div>`; });
    return h + '</div>';
  }

  winSeason(u) {
    const s = u.season;
    if (!s) return '<div class="say">今は祭りの季節ではない。</div>';
    let h = `<div class="say">${esc(s.say)}</div><div>${esc(this.itemName(s.item))} ${s.have}/${s.need}（${esc(this.game.db.monsters[s.mob]?.name || '')}が落とす）</div>`;
    h += `<div class="dim">${s.first ? '2 回目からは 1 日 1 回のお礼' : '初めてのお礼'}: ${s.rewards.map((r) => esc(this.itemName(r.item)) + (r.n > 1 ? ' ×' + r.n : '')).join('・')}</div>`;
    h += `<div class="btns"><button data-f="season" ${s.have >= s.need && !(s.first && s.today) ? '' : 'disabled'}>渡す</button></div>`;
    return h;
  }

  onClick(e) {
    const t = e.target.closest('button');
    if (!t || !t.dataset.f) return;
    t.blur();
    e.stopPropagation();
    this.game.audio.unlock();
    const { f, a, b, n } = t.dataset;
    const id = this.win;
    switch (f) {
      case 'close': this.close(); return;
      case 'tab': this.tab = a; this.render(); return;
      case 'voyageSkip': this.act('voyageSkip'); return;
      case 'emote': this.emote(a); this.palette = false; this.drawHud(); return;
      case 'gacha': { const r = this.act('gacha', id); this.last = r.ok ? r : null; if (r.ok && r.tier >= 1) this.game.audio.sfx('levelup'); break; }
      case 'arcadeEnd': this.act('arcadeEnd'); break;
      default: this.act(f, a ?? id, b ?? '', n != null ? +n : 0);
    }
    this.reload(true);
  }
}

const CSS = `
#funwin .win.fun { left: 200px; top: 50px; width: 400px; z-index: 6; }
#funwin .win.fun.big { left: 230px; top: 20px; width: 340px; }
#funwin .list { max-height: 260px; overflow-y: auto; }
#funwin .row { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
#funwin .row small { color: var(--dim); }
#funwin .row.t1 { color: #a0e0ff; } #funwin .row.t2 { color: var(--gold); font-weight: bold; }
#funwin .ic { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; vertical-align: middle; }
#funwin .say { margin: 4px 0; } #funwin .say.prize { font-size: 13px; } #funwin .say.prize.t2 { color: var(--gold); font-weight: bold; }
#funwin .gold { color: var(--gold); } #funwin .good { color: var(--good); } #funwin .bad { color: var(--bad); } #funwin .dim { color: var(--dim); }
#funwin button.big { font-size: 13px; padding: 4px 14px; background: #a03050; }
#funwin .tabs button.on { background: #6a78d0; }
#funwin .gomoku { display: grid; gap: 1px; background: #8a6a30; padding: 3px; width: max-content; margin: 4px auto; }
#funwin .gc { width: 17px; height: 17px; padding: 0; margin: 0; border: 0; border-radius: 0; background: #e8c070; position: relative; }
#funwin .gc:disabled { opacity: 1; }
#funwin .gc.b::after, #funwin .gc.w::after { content: ''; position: absolute; left: 2px; top: 2px; width: 13px; height: 13px; border-radius: 50%; }
#funwin .gc.b::after { background: #202020; } #funwin .gc.w::after { background: #ffffff; box-shadow: inset 0 0 0 1px #888; }
#funwin .gc.last { outline: 2px solid #ff4040; z-index: 1; } #funwin .gc.win { background: #90ff90; }
#funwin .memory { display: grid; grid-template-columns: repeat(4, 52px); gap: 4px; justify-content: center; margin: 6px 0; }
#funwin .mc { height: 52px; font-size: 22px; background: #3a4680; } #funwin .mc.up { background: #f8f4e8; } #funwin .mc:disabled { opacity: 1; }
#funwin .mc.mine { box-shadow: inset 0 0 0 3px #60c0ff; } #funwin .mc.npc { box-shadow: inset 0 0 0 3px #ff8060; }
#funhud { position: absolute; right: 6px; top: 64px; width: 220px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
#funhud .voy, #funhud .emo { pointer-events: auto; background: var(--panel); border: 1px solid var(--edge); border-radius: 3px; padding: 4px 6px; width: 100%; }
#funhud .vbar { height: 6px; background: #222; margin: 3px 0; } #funhud .vbar i { display: block; height: 100%; background: #60c0ff; }
#funhud .bad { color: var(--bad); font-weight: bold; }
#funhud .emo button { width: 48%; }
#funbanner { position: absolute; left: 0; right: 0; top: 90px; text-align: center; opacity: 0; pointer-events: none; }
#funbanner div { display: inline-block; padding: 10px 26px; font-size: 16px; color: #fff; background: linear-gradient(#c08010, #803000); border: 3px solid #ffe060; border-radius: 6px; text-shadow: 2px 2px 0 #000; }
#funbanner b { font-size: 22px; color: #fff4a0; }
#funbanner.show { animation: funbanner 6s ease-out; }
@keyframes funbanner { 0% { opacity: 0; transform: scale(0.6); } 8% { opacity: 1; transform: scale(1.1); } 14% { transform: scale(1); } 85% { opacity: 1; } 100% { opacity: 0; } }
[data-bubble] #w_dialog .say { border-radius: 10px; padding: 4px 8px; }
[data-bubble="cloud"] #w_dialog .say { background: #ffffff; color: #303040; }
[data-bubble="heart"] #w_dialog .say { background: #ffe0ec; color: #802040; }
[data-bubble="scroll"] #w_dialog .say { background: #f4e4c0; color: #5a3a10; border-radius: 2px; }
[data-bubble="neon"] #w_dialog .say { background: #102030; color: #40ffe0; box-shadow: 0 0 6px #40ffe0; }
[data-bubble="leaf"] #w_dialog .say { background: #e4ffd8; color: #2a5a18; }
`;
