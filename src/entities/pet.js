// PET: 装備スロット pet に装備すると出現し、プレイヤーに追従してドロップ（アイテム・お金）を自動で拾う。
// game.pet を管理する。生成/破棄は syncPet(game)（装備変化 'equipChanged' / 'mapChanged' と毎フレームの確認で呼ばれる）。
// update/draw は Player.update/draw から呼ばれる（main が別途呼んでも同一フレームで二重実行しない）。
import { drawPet } from '../render/pets.js';
import { getItem } from '../data/items.js';
import { MAX_SLOTS } from '../systems/inventory.js';
import { spawnEffect } from '../render/effects.js';
import { RARITY } from '../systems/loot.js';
import { sysFn } from '../world/sys.js';

const FLYING = new Set(['dronePet', 'ghostPet', 'alienPet', 'dragonPet', 'dolphinPet', 'flamingoPet']);
const WARP_DIST = 640;

// インベントリに入る余地があるか（満杯なら拾わない）
function canAccept(state, item) {
  const inv = (state.inventory || []).filter(Boolean);
  if (inv.length < MAX_SLOTS) return true;
  if (!item || item.type === 'equip') return false;
  return inv.some((s) => s.id === item.id);
}

/**
 * 拾うフィルタ（UI が state.petFilter を書き換える）。既定は全部拾う。
 * {money:bool, consumable:bool, equip:bool, etc:bool, minRarity:'common'|'rare'|'epic'|'legendary'|'mythic'}
 */
export const DEFAULT_PET_FILTER = { money: true, consumable: true, equip: true, etc: true, minRarity: 'common' };
export function petFilterOf(state) {
  const f = state?.petFilter || state?.pet?.filter || state?.settings?.petFilter || null;
  return f && typeof f === 'object' ? { ...DEFAULT_PET_FILTER, ...f } : DEFAULT_PET_FILTER;
}
/** PET がこのドロップを拾うか（フィルタ判定） */
export function petWants(state, d) {
  const f = petFilterOf(state);
  if (d.money != null) return f.money !== false;
  const it = d.item || {};
  const type = it.type === 'equip' ? 'equip' : it.type === 'consumable' ? 'consumable' : 'etc';
  if (f[type] === false) return false;
  const ord = (r) => RARITY?.[r]?.order ?? 0;
  // PET アイテム（rarity 'pet'）は常に拾う（取り逃がし防止）
  if (it.rarity === 'pet') return true;
  return ord(it.rarity || 'common') >= ord(f.minRarity || 'common');
}

export class Pet {
  constructor(game, itemId) {
    this.game = game;
    this.itemId = itemId;
    const it = getItem(itemId) || {};
    this.item = it;
    this.look = it.look || { style: 'slimePet', color: '#5cff9a', accent: '#ffffff' };
    const pd = it.pet || {};
    this.name = (pd.name || it.name || 'PET').replace(/^ペット[:：]\s*/, '');
    this.pickRange = Math.max(160, Math.min(420, pd.pickRange || 160));
    this.pickRate = Math.max(0.3, pd.pickRate || 1);
    this.flying = FLYING.has(this.look.style);
    const p = game.player;
    this.x = p ? p.x - (p.facing || 1) * 50 : 0;
    this.y = p ? p.y : 0;
    this.vx = 0; this.vy = 0;
    this.facing = p?.facing || 1;
    this.t = Math.random() * 10;
    this.target = null;
    this.pickCd = 0;
    this.skip = new Map();     // 拾えなかったドロップ → 再挑戦までの時刻
    this.state = 'idle';
    this.pickAnim = 0;
    this._updT = -1; this._drawT = -1;
    this.remove = false;
  }

  warpToPlayer() {
    const p = this.game.player;
    if (!p) return;
    this.x = p.x - (p.facing || 1) * 50; this.y = p.y - (this.flying ? 50 : 0);
    this.vx = this.vy = 0; this.target = null;
  }

  findTarget() {
    const g = this.game, p = g.player, now = g.time || 0;
    let best = null, bd = Infinity;
    for (const d of g.drops) {
      if (!d.canPick || !d.canPick() || !d.onGround || d.petTarget && d.petTarget !== this) continue;
      if ((this.skip.get(d) || 0) > now) continue;
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      if (dist > this.pickRange) continue;
      if (d.money == null && !canAccept(g.state, d.item)) continue;
      if (!petWants(g.state, d)) continue;
      const sp = sysFn('petShouldPick', g); // systems/petSkills.js の取得フィルタ（PET スキル）
      if (sp) { let ok = true; try { ok = sp(g, d) !== false; } catch (e) { ok = true; } if (!ok) continue; }
      const pd = Math.hypot(d.x - this.x, d.y - this.y);
      if (pd < bd) { bd = pd; best = d; }
    }
    return best;
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (!p || this._updT === g.time) return;
    this._updT = g.time;
    this.t += dt;
    if (this.pickCd > 0) this.pickCd -= dt;
    if (this.pickAnim > 0) this.pickAnim -= dt;
    // PET の自動ポーション等（systems の petAutoUse があれば）
    const au = sysFn('petAutoUse', g);
    if (au) { try { au(g, dt); } catch (e) { if (!this._auErr) { this._auErr = true; console.warn('[petAutoUse]', e); } } }

    // 離れすぎたらワープ
    if (Math.hypot(p.x - this.x, p.y - this.y) > WARP_DIST) {
      this.warpToPlayer();
      spawnEffect(g, 'spark', this.x, this.y - 20, { color: this.look.accent || '#fff' });
    }

    // 取得対象
    if (this.target && (this.target.remove || this.target.flyT >= 0 || !g.drops.includes(this.target) || Math.hypot(this.target.x - p.x, this.target.y - p.y) > this.pickRange + 80)) {
      if (this.target.petTarget === this) this.target.petTarget = null;
      this.target = null;
    }
    if (!this.target && this.pickCd <= 0 && !p.dead) {
      this.target = this.findTarget();
      if (this.target) this.target.petTarget = this;
    }

    let tx, ty, speed;
    if (this.target) {
      tx = this.target.x; ty = this.target.y - 6; speed = 560;
      this.state = 'move';
      if (Math.hypot(tx - this.x, ty - this.y) < 26) this.tryPick(this.target);
    } else {
      // プレイヤーの少し後ろ・上をふわふわ
      tx = p.x - (p.facing || 1) * 56;
      ty = p.y - (this.flying ? 54 + Math.sin(this.t * 2.2) * 8 : 0);
      speed = 420;
      this.state = Math.abs(tx - this.x) > 14 ? 'move' : 'idle';
    }
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      // 近いほど減速（追従はなめらかに）
      const sp = Math.min(speed, d * 6);
      this.vx = dx / d * sp; this.vy = dy / d * sp;
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else { this.vx = this.vy = 0; }
    if (Math.abs(this.vx) > 12) this.facing = Math.sign(this.vx);
    const m = g.map;
    if (m) {
      this.x = Math.max(10, Math.min(m.width - 10, this.x));
      this.y = Math.min(m.groundY, this.y);
    }
  }

  tryPick(d) {
    const g = this.game;
    if (d.petTarget === this) d.petTarget = null;
    this.target = null;
    this.pickCd = 1 / this.pickRate;
    if (d.money == null && !canAccept(g.state, d.item)) { this.skip.set(d, (g.time || 0) + 5); return false; }
    const ok = d.pickup(this);
    if (ok) {
      this.pickAnim = 0.35;
      spawnEffect(g, 'pickup', this.x, this.y - 16, { color: this.look.accent || '#fff' });
    } else this.skip.set(d, (g.time || 0) + 3);
    return ok;
  }

  draw(ctx) {
    const g = this.game;
    if (this._drawT === g.time) return;
    this._drawT = g.time;
    const anim = { facing: this.facing, t: this.t, state: this.pickAnim > 0 ? 'pick' : this.state, moving: this.state === 'move', flying: this.flying };
    drawPet(ctx, this.x, this.y, this.look, anim);
    // 名前（足元に小さく）
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = (ctx.measureText(this.name).width || 30) + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(this.x - w / 2, this.y + 3, w, 13);
    ctx.fillStyle = '#ffd6ff';
    ctx.fillText(this.name, this.x, this.y + 10);
    ctx.restore();
  }
}

/** 装備中の PET と game.pet を同期（生成・破棄・差し替え）。マップ移動時はプレイヤーの横へ */
export function syncPet(game, reposition = false) {
  const id = game.state?.equipped?.pet || null;
  if (!id || !game.player) {
    if (game.pet) game.pet.remove = true;
    game.pet = null;
    return null;
  }
  if (!game.pet || game.pet.itemId !== id) game.pet = new Pet(game, id);
  else if (reposition) game.pet.warpToPlayer();
  return game.pet;
}
