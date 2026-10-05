// デバッグパネル（F2 / ` でトグル。main.js が enabled を切り替える）
// - 画面右側にパネル。ボタンはマウスクリック、またはパネル表示中のみ有効な F3〜F10（Shift併用）ホットキー。
// - テスト用に window.game.debug.run('actionId') でも同じ操作を呼べる。
import { ITEMS } from '../data/items.js';
import { MISSIONS } from '../data/missions.js';
import { ENEMIES } from '../data/enemies.js';
import { MAPS, MAP_ORDER } from '../world/maps.js';
import { resolveSpawns, civilianTypes } from '../entities/spawner.js';
import { entRect } from '../world/physics.js';
import { Enemy } from '../entities/enemy.js';
import { computeStats, gainExp, expToNext } from '../systems/progression.js';
import { addItem, countItem, freeSlots, equip } from '../systems/inventory.js';
import { damageEnemy, setWantedLevel, TEAR_THRESHOLDS } from '../systems/combat.js';
import { spawnEffect } from '../render/effects.js';
import { getSpriteMode, toggleSpriteMode, spriteStats } from '../render/sprites.js';

const PANEL_W = 300;
const BTN_H = 24;
const KEEP_ITEMS = new Set(['potion_red', 'potion_blue']);
export const PET_IDS = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'pet');
export const CLOCK_PRESETS = { morning: 7, noon: 12, evening: 18, night: 22 };
const CLOCK_LABEL = { morning: '朝', noon: '昼', evening: '夕', night: '夜' };

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.god = false;
    this.showHitboxes = false;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0; this._lastNow = null;
    this.log = [];            // 直近のデバッグ操作ログ
    this.errors = [];         // window error / unhandledrejection
    this.rect = { x: 1280 - PANEL_W - 10, y: 96, w: PANEL_W, h: 0 };
    this._btnRects = [];
    this._spawnIdx = 0;

    this.actions = [
      { id: 'hitbox', label: () => `当たり判定 ${this.showHitboxes ? 'ON' : 'OFF'}`, key: 'F3', fn: () => { this.showHitboxes = !this.showHitboxes; } },
      { id: 'god', label: () => `無敵 ${this.god ? 'ON' : 'OFF'}`, key: 'F4', fn: () => { this.god = !this.god; } },
      { id: 'level', label: () => 'Lv+1', key: 'F5', fn: () => this.levelUp() },
      { id: 'hpDown', label: () => 'HP-10%', key: 'F6', fn: () => this.hpDown() },
      { id: 'spawn', label: () => '敵スポーン', key: 'F7', fn: () => this.spawnEnemy() },
      { id: 'killAll', label: () => '全敵撃破', key: 'F8', fn: () => this.killAll() },
      { id: 'warp', label: () => `ワープ ${Math.max(0, MAP_ORDER.indexOf(this.game.map?.id)) + 1}/${MAP_ORDER.length}`, key: 'F9', fn: () => this.warp() },
      { id: 'mission', label: () => 'ミッション即完了', key: 'F10', fn: () => this.completeMission() },
      { id: 'items', label: () => '全アイテム付与', key: '⇧F3', fn: () => this.giveAllItems() },
      { id: 'money', label: () => 'お金+10000', key: '⇧F4', fn: () => { this.game.state.money += 10000; return '+$10000'; } },
      { id: 'wantedUp', label: () => '手配度+1', key: '⇧F5', fn: () => this.wanted(+1) },
      { id: 'wantedDown', label: () => '手配度-1', key: '⇧F6', fn: () => this.wanted(-1) },
      { id: 'hpFull', label: () => 'HP/MP全快', key: '⇧F7', fn: () => this.heal() },
      { id: 'clearInv', label: () => 'インベントリ整理', key: '⇧F8', fn: () => this.clearInventory() },
      { id: 'pet', label: () => `PET付与 ${this.game.state?.equipped?.pet ? '(次)' : ''}`, key: '⇧F9', fn: () => this.givePet() },
      { id: 'visitAll', label: () => '全マップ訪問済み', key: '⇧F10', fn: () => this.visitAll() },
      { id: 'sprites', label: () => `見た目: ${getSpriteMode() === 'auto' ? 'スプライト' : 'コード描画'}`, key: '', fn: () => { const m = toggleSpriteMode(); const st = spriteStats(); return `${m === 'auto' ? 'スプライト優先' : 'コード描画'}（読込 ${st.loaded}/${st.entries}）`; } },
      ...Object.keys(CLOCK_PRESETS).map((k) => ({ id: 'clock_' + k, label: () => `時刻: ${CLOCK_LABEL[k]} ${CLOCK_PRESETS[k]}時`, key: '', fn: () => this.setClock(CLOCK_PRESETS[k]) })),
    ];
    this._keyMap = {};
    for (const a of this.actions) {
      if (!a.key) continue;
      const shift = a.key.startsWith('⇧');
      this._keyMap[(shift ? 'S+' : '') + a.key.replace('⇧', '')] = a.id;
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (!this.enabled || !/^F\d+$/.test(e.code) || e.code === 'F2') return;
        const id = this._keyMap[(e.shiftKey ? 'S+' : '') + e.code];
        if (!id) return;
        e.preventDefault();
        this.run(id);
      });
      window.addEventListener('error', (e) => this._recordError(e.message || String(e.error)));
      window.addEventListener('unhandledrejection', (e) => this._recordError('promise: ' + (e.reason?.message || e.reason)));
    }
  }

  _recordError(msg) {
    this.errors.push(msg);
    if (this.errors.length > 20) this.errors.shift();
    this.game.lastError = msg;
  }

  // ---------------------------------------------------------- アクション
  run(id) {
    const a = this.actions.find((x) => x.id === id);
    const g = this.game;
    if (!a || g.scene !== 'play' || !g.state) return false;
    let res;
    try { res = a.fn(); } catch (e) {
      console.error('[debug]', id, e);
      g.lastError = `debug.${id}: ${e.message}`;
      return false;
    }
    const msg = `${a.label()}${typeof res === 'string' ? ' — ' + res : ''}`;
    this.log.push(msg);
    if (this.log.length > 4) this.log.shift();
    return res ?? true;
  }

  levelUp() {
    const st = this.game.state;
    gainExp(this.game, Math.max(1, expToNext(st.level) - st.exp));
    return `Lv.${st.level}`;
  }

  hpDown() {
    const g = this.game, st = g.state, p = g.player;
    const max = computeStats(st).maxHp;
    const before = st.hp / max;
    st.hp = Math.max(1, Math.round(st.hp - max * 0.1));
    const after = st.hp / max;
    for (const th of TEAR_THRESHOLDS) {
      if (before >= th && after < th && p) spawnEffect(g, 'tear', p.x, p.y - p.h * 0.55, { level: th, color: '#ff6fb5' });
    }
    if (p) p.lastHitT = p.t; // 自然回復を止める
    // PET の自動 HP ポーション（petSkills.petAutoUse, 閾値 50%）で即回復しないよう 10 秒止める（服破れ確認用）
    const a = (g._petAuto ||= { cdHp: 0, cdMp: 0, affT: 0, petId: st.equipped?.pet || null });
    a.cdHp = Math.max(a.cdHp || 0, 10);
    return `HP ${st.hp}/${max} (damage ${(1 - after).toFixed(2)})`;
  }

  heal() {
    const st = this.game.state, s = computeStats(st);
    st.hp = s.maxHp; st.mp = s.maxMp;
    if (this.game.player) this.game.player.dead = false;
    return `HP ${st.hp}`;
  }

  giveAllItems() {
    const g = this.game, st = g.state;
    let given = 0, skipped = 0;
    const equipped = new Set(Object.values(st.equipped || {}));
    for (const id of Object.keys(ITEMS)) {
      if (countItem(st, id) > 0 || equipped.has(id)) continue;
      const stack = ITEMS[id].type !== 'equip';
      if (!stack && freeSlots(st) <= 0) { skipped++; continue; }
      if (addItem(g, id, 1, { silent: true })) given++; else skipped++;
    }
    return `${given}個付与${skipped ? ` / ${skipped}個は空きなし（インベントリ整理→再実行）` : ''}`;
  }

  clearInventory() {
    const st = this.game.state;
    const n = st.inventory.length;
    st.inventory = st.inventory.filter((s) => s && KEEP_ITEMS.has(s.id));
    return `${n - st.inventory.length}枠削除`;
  }

  // 現在マップで実際に出る敵（spawner の解決済み出現表。町なら市民。フィールドで表が空なら habitats）
  spawnTypes() {
    const g = this.game, map = g.map;
    if (!map) return [];
    if (map.town) return civilianTypes();
    const areas = g.spawner?.map === map && g.spawner.areas?.length ? g.spawner.areas : resolveSpawns(map);
    const types = [];
    for (const s of areas) for (const t of s.types || []) if (ENEMIES[t] && !types.includes(t)) types.push(t);
    if (!types.length) {
      for (const e of Object.values(ENEMIES)) if ((e.habitats || []).includes(map.id) && !types.includes(e.id)) types.push(e.id);
    }
    return types;
  }

  wanted(d) {
    const g = this.game;
    setWantedLevel(g, (g.wanted || 0) + d);
    const note = d > 0 && !g.map?.town ? '（フィールドでは警察は出ない。町で確認）' : '';
    return `★${g.wanted}${note}`;
  }

  // PET を順番に付与して装備（インベントリが満杯なら直接装備スロットへ）
  givePet() {
    const g = this.game, st = g.state;
    if (!PET_IDS.length) return 'PET 定義なし';
    const cur = PET_IDS.indexOf(st.equipped?.pet);
    const id = PET_IDS[(cur + 1) % PET_IDS.length];
    if (countItem(st, id) <= 0 && !addItem(g, id, 1, { silent: true })) {
      st.equipped.pet = id;
      g.events.emit('equipChanged', { slot: 'pet' });
      return `${ITEMS[id].name}（直接装備）`;
    }
    const r = equip(g, id);
    if (r?.ok === false) { // Lv 不足などは無視して直接装備（デバッグ用）
        st.equipped.pet = id;
        g.events.emit('equipChanged', { slot: 'pet' });
        return `${ITEMS[id].name}（${r.msg} → 直接装備）`;
    }
    return ITEMS[id].name;
  }

  visitAll() {
    const st = this.game.state;
    st.visited = [...new Set([...(st.visited || []), ...Object.keys(MAPS)])];
    this.game.events.emit('visitedChanged', {});
    return `${st.visited.length} マップ`;
  }

  setClock(h) {
    const g = this.game;
    g.state.clock = h; g.clock = h;
    if (g.map) g.map._clock = h;
    return `${h}:00`;
  }

  // Lv を n まで上げる（gainExp 経由。SP/AP も通常どおり）
  setLevel(n) {
    const st = this.game.state;
    for (let i = 0; i < 200 && st.level < n; i++) this.levelUp();
    return `Lv.${st.level}`;
  }

  spawnEnemy(type) {
    const g = this.game, p = g.player;
    const types = this.spawnTypes();
    if (!type) {
      if (!types.length) return '出現テーブルなし';
      type = types[this._spawnIdx++ % types.length];
    }
    const x = Math.max(60, Math.min(g.map.width - 60, p.x + p.facing * 260));
    const e = new Enemy(g, type, x, p.y - 30, { x1: x - 300, x2: x + 300 });
    g.enemies.push(e);
    spawnEffect(g, 'smoke', x, p.y - 30);
    return ENEMIES[type].name;
  }

  killAll() {
    const g = this.game;
    let n = 0;
    for (const e of [...g.enemies]) {
      if (e.dead || e.hp <= 0) continue;
      damageEnemy(g, e, e.hp + 1, false, 0);
      n++;
    }
    return `${n}体`;
  }

  warp(mapId) {
    const g = this.game;
    const order = (MAP_ORDER || Object.keys(MAPS)).filter((id) => MAPS[id]);
    const next = mapId || order[(order.indexOf(g.map?.id) + 1) % order.length];
    g.changeMap(next);
    return next;
  }

  completeMission() {
    const g = this.game, mm = g.missions;
    if (!mm) return 'missions なし';
    let ids = [...mm.ms.active];
    if (!ids.length) {
      const m = Object.values(MISSIONS).find((x) => mm.canAccept(x.id));
      if (!m) return '受注可能なミッションなし';
      mm.accept(m.id);
      ids = [m.id];
    }
    const done = [];
    for (const id of ids) {
      const m = MISSIONS[id];
      const pr = mm._prog(id);
      m.objectives.forEach((o, i) => {
        if (o.type === 'collect') {
          const need = o.count - countItem(g.state, o.target);
          if (need > 0) addItem(g, o.target, need, { silent: true });
        } else pr[i] = o.count;
      });
      mm._syncProgress(id);
      if (mm.turnIn(id)) done.push(m.name);
    }
    return done.length ? done.join(', ') : '完了できず';
  }

  // ---------------------------------------------------------- 更新
  update(dt) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._lastNow != null) {
      const real = (now - this._lastNow) / 1000;
      this._fpsAcc += real; this._fpsN++;
      if (this._fpsAcc >= 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    }
    this._lastNow = now;
    if (!this.enabled) return;
    const m = this.game.input?.mouse;
    if (m && m.clicked && this._inRect(m.x, m.y, this.rect)) {
      for (const b of this._btnRects) {
        if (this._inRect(m.x, m.y, b)) { this.run(b.id); break; }
      }
      m.clicked = false; // UI / ゲームにクリックを渡さない
    }
    void dt;
  }

  _inRect(x, y, r) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // ---------------------------------------------------------- 描画（スクリーン）
  draw(ctx) {
    if (!this.enabled) return;
    const g = this.game, p = g.player, st = g.state;
    const r = this.rect;
    const lines = [];
    lines.push(`FPS ${this.fps.toFixed(0)}  frame ${(g.perf?.avg ?? 0).toFixed(1)}ms  t ${g.time.toFixed(0)}s`);
    lines.push(`enemies ${g.enemies.length}  drops ${g.drops.length}  proj ${g.projectiles.length}  fx ${g.effects.length}`);
    lines.push(`npcs ${g.npcs.length}  vehicles ${g.vehicles.length}`);
    if (p && st) {
      lines.push(`map ${g.map?.id}  ${MAP_ORDER.indexOf(g.map?.id) + 1}/${MAP_ORDER.length}`);
      lines.push(`pos ${p.x.toFixed(0)}, ${p.y.toFixed(0)}  v ${p.vx.toFixed(0)}, ${p.vy.toFixed(0)}`);
      lines.push(`${p.anim?.state || '?'} ${p.onGround ? 'ground' : 'air'}${p.climbing ? ' rope' : ''}${p.inVehicle ? ' car' : ''}${p.dead ? ' DEAD' : ''}`);
      lines.push(`Lv${st.level} HP ${st.hp} MP ${st.mp} $${st.money} ★${g.wanted} heat ${(g.wantedHeat || 0).toFixed(1)}`);
      lines.push(`damage ${(p.anim?.damage ?? 0).toFixed(2)}  inv ${st.inventory.length}/48  missions ${st.missions.active.length}`);
      const ck = g.clock ?? st.clock ?? 0;
      lines.push(`${g.map?.town ? 'TOWN' : 'FIELD'} ${g.map?.region || '-'}  clock ${String(Math.floor(ck)).padStart(2, '0')}:${String(Math.floor((ck % 1) * 60)).padStart(2, '0')}  pet ${st.equipped?.pet || '-'}`);
    }
    {
      const ss = spriteStats();
      lines.push(`sprites ${ss.mode === 'auto' ? 'ON' : 'OFF'}  manifest:${ss.manifest}  読込 ${ss.loaded}/${ss.entries}${ss.failed ? ` 失敗${ss.failed}` : ''}`);
    }
    const errLine = g.lastError ? `ERR: ${String(g.lastError).slice(0, 44)}` : 'ERR: なし';

    const lineH = 15;
    const cols = 2, bw = (r.w - 24 - 6) / cols;
    const rows = Math.ceil(this.actions.length / cols);
    r.h = 30 + lines.length * lineH + 18 + rows * (BTN_H + 4) + 8 + this.log.length * 13 + 6;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8,6,20,0.88)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#19f0ff';
    ctx.fillText('DEBUG [F2]', r.x + 10, r.y + 8);
    ctx.fillStyle = this.god ? '#ffd23f' : '#888';
    ctx.textAlign = 'right';
    ctx.fillText(this.god ? 'GOD' : '', r.x + r.w - 10, r.y + 8);
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    let y = r.y + 28;
    ctx.fillStyle = '#e8e8f0';
    for (const l of lines) { ctx.fillText(l, r.x + 10, y); y += lineH; }
    ctx.fillStyle = g.lastError ? '#ff5d73' : '#5cff9a';
    ctx.fillText(errLine, r.x + 10, y); y += 18;

    // ボタン
    this._btnRects = [];
    const m = g.input?.mouse || { x: -1, y: -1 };
    this.actions.forEach((a, i) => {
      const bx = r.x + 12 + (i % cols) * (bw + 6);
      const by = y + Math.floor(i / cols) * (BTN_H + 4);
      const b = { id: a.id, x: bx, y: by, w: bw, h: BTN_H };
      this._btnRects.push(b);
      const hov = this._inRect(m.x, m.y, b);
      const on = (a.id === 'god' && this.god) || (a.id === 'hitbox' && this.showHitboxes);
      ctx.fillStyle = on ? 'rgba(255,61,210,0.55)' : hov ? 'rgba(25,240,255,0.35)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.strokeStyle = 'rgba(25,240,255,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, BTN_H - 1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.label(), bx + 6, by + BTN_H / 2);
      ctx.fillStyle = '#9aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(a.key, bx + bw - 4, by + BTN_H / 2);
      ctx.textAlign = 'left';
    });
    y += rows * (BTN_H + 4) + 6;
    ctx.textBaseline = 'top';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffd23f';
    for (const l of this.log) { ctx.fillText('> ' + l.slice(0, 46), r.x + 10, y); y += 13; }
    ctx.restore();
  }

  // ---------------------------------------------------------- 描画（ワールド。ctx は translate 済み）
  drawWorld(ctx) {
    if (!this.enabled || !this.showHitboxes) return;
    const g = this.game, map = g.map, p = g.player;
    if (!map) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    // 足場・地面・壁・ロープ
    for (const pl of map.platforms || []) {
      ctx.strokeStyle = pl.solid ? '#ff8a00' : '#ffd23f';
      ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + pl.w, pl.y); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, map.groundY); ctx.lineTo(map.width, map.groundY); ctx.stroke();
    ctx.fillStyle = 'rgba(255,138,0,0.25)';
    for (const w of map.walls || []) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
    ctx.strokeStyle = '#a0ff6a';
    for (const rp of map.ropes || []) { ctx.beginPath(); ctx.moveTo(rp.x, rp.top); ctx.lineTo(rp.x, rp.bottom); ctx.stroke(); }
    // ポータル判定（player.tryPortal: |dx|<44, |dy|<90）
    ctx.strokeStyle = '#b47cff';
    for (const po of map.portals || []) ctx.strokeRect(po.x - 44, po.y - 90, 88, 90);
    // 出現エリア
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,93,115,0.6)';
    for (const s of map.spawns || []) ctx.strokeRect(s.x1, map.groundY - 6, s.x2 - s.x1, 6);
    ctx.setLineDash([]);

    const box = (e, col) => {
      if (!e || !(e.w > 0)) return;
      const r = entRect(e);
      ctx.strokeStyle = col;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    };
    for (const n of g.npcs) box(n, '#19d3c5');
    for (const v of g.vehicles) box(v, '#4da6ff');
    for (const d of g.drops) box(d, '#7cfc00');
    for (const e of g.enemies) {
      box(e, e.dead ? '#555' : '#ff3d3d');
      if (!e.dead) {
        ctx.fillStyle = '#ff9a9a'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`${e.defId} ${e.ai}:${e.phase || e.state} ${Math.ceil(e.hp)}`, e.x, e.y + 12);
      }
    }
    for (const pr of g.projectiles) {
      ctx.strokeStyle = pr.owner === 'player' ? '#ffd166' : '#ff4dff';
      ctx.strokeRect(pr.x - pr.w / 2, pr.y - pr.h / 2, pr.w, pr.h);
    }
    if (p) {
      box(p, '#00ff88');
      if (p.attackLeft > 0 && p.getAttackRect) {
        const ar = p.getAttackRect();
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(ar.x, ar.y, ar.w, ar.h);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#00ff88';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
