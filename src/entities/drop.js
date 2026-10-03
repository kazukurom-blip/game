// ドロップアイテム / お金。ポンと跳ねて着地、レア以上は光の柱。
import { moveAndCollide } from '../world/physics.js';
import { getItem } from '../data/items.js';
import { addItem } from '../systems/inventory.js';
import { RARITY } from '../systems/loot.js';
import { drawItemIcon } from '../render/icons.js';
import { spawnEffect } from '../render/effects.js';

const LIFE = 60;
const RARE_SET = new Set(['rare', 'epic', 'legendary', 'mythic']);
const FALLBACK_COLORS = { common: '#ffffff', rare: '#4da6ff', epic: '#b06bff', legendary: '#ffb020', mythic: '#ff3df2' };
let lastFullNotify = 0;

export function rarityColor(r) {
  return (RARITY && RARITY[r] && RARITY[r].color) || FALLBACK_COLORS[r] || '#fff';
}

export class Drop {
  constructor(game, x, y, payload = {}) {
    this.game = game;
    this.x = x; this.y = y;
    this.w = 24; this.h = 24;
    this.vx = (Math.random() - 0.5) * 240 + (payload.vx || 0);
    this.vy = -480 - Math.random() * 180;
    this.onGround = false;
    this.t = 0;
    this.angle = 0;
    this.remove = false;
    this.dead = false;
    this.pickDelay = 0.45;
    this.flyT = -1;           // 拾われて吸い込まれ中
    if (payload.money != null) {
      this.money = Math.max(1, Math.round(payload.money));
      this.item = { id: 'cash', name: `${this.money}$`, icon: 'cash', type: 'etc', rarity: 'common' };
      this.rarity = 'common';
    } else {
      this.id = payload.id;
      this.qty = payload.qty || 1;
      this.item = getItem(payload.id) || { id: payload.id, name: payload.id, rarity: 'common', type: 'etc' };
      this.rarity = this.item.rarity || 'common';
    }
    this.isRare = RARE_SET.has(this.rarity);
    this.color = rarityColor(this.rarity);
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    if (this.flyT >= 0) {
      // プレイヤーへ吸い込まれる
      this.flyT += dt;
      const p = g.player;
      const tx = p.x, ty = p.y - 40;
      const k = Math.min(1, dt * 14);
      this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
      if (this.flyT > 0.18) this.remove = true;
      return;
    }
    if (!this.onGround) {
      this.angle += dt * 14 * Math.sign(this.vx || 1);
      moveAndCollide(this, g.map, dt);
      if (this.onGround) {
        this.vx = 0; this.angle = 0;
        if (this.isRare && !this.announced) {
          this.announced = true;
          spawnEffect(g, 'spark', this.x, this.y - 10, { color: this.color });
        }
      }
    } else {
      this.vx = 0;
    }
    if (this.t > LIFE) this.remove = true;
  }

  canPick() { return this.flyT < 0 && !this.remove && this.t >= this.pickDelay; }

  // 拾う。成功で true
  pickup() {
    if (!this.canPick()) return false;
    const g = this.game, s = g.state;
    if (this.money != null) {
      s.money = (s.money || 0) + this.money;
      g.events.emit('moneyPicked', { amount: this.money });
      spawnEffect(g, 'pickup', this.x, this.y - 12, { color: '#7CFC00' });
    } else {
      // addItem は満杯通知とレア装備の rareDrop emit を自前で行う。通知連打を避けるため間引く
      const quiet = g.time - lastFullNotify < 3;
      const ok = addItem(g, this.id, this.qty, quiet ? { silent: true } : {});
      if (!ok) {
        if (!quiet) lastFullNotify = g.time;
        this.pickDelay = this.t + 1.0;
        return false;
      }
      g.events.emit('itemPicked', { id: this.id, qty: this.qty });
      spawnEffect(g, 'pickup', this.x, this.y - 12, { color: this.color });
      if (this.isRare) {
        const isEquip = this.item.type === 'equip';
        // 装備は addItem 側が emit 済み（silent 時のみこちらで補う）。装備以外はエピック以上のみ演出
        if (isEquip && quiet) g.events.emit('rareDrop', { item: this.item });
        if (!isEquip && RARE_SET.has(this.rarity) && this.rarity !== 'rare') g.events.emit('rareDrop', { item: this.item });
        if (isEquip || this.rarity !== 'rare') spawnEffect(g, 'rareDrop', this.x, this.y - 12, { color: this.color, rarity: this.rarity });
      }
    }
    this.flyT = 0;
    this.dead = true;
    return true;
  }

  draw(ctx) {
    const left = LIFE - this.t;
    let alpha = 1;
    if (left < 4) alpha = (Math.floor(this.t * 8) % 2) ? 0.35 : 1;
    if (this.flyT >= 0) alpha = 1 - this.flyT / 0.18;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // 光の柱
    if (this.isRare && this.onGround && this.flyT < 0) {
      const h = this.rarity === 'mythic' ? 260 : this.rarity === 'legendary' ? 220 : this.rarity === 'epic' ? 170 : 120;
      const pulse = 0.55 + 0.25 * Math.sin(this.t * 4);
      const gr = ctx.createLinearGradient(0, this.y - h, 0, this.y);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, this.color);
      ctx.globalAlpha = Math.max(0, alpha) * pulse * 0.6;
      ctx.fillStyle = gr;
      ctx.fillRect(this.x - 14, this.y - h, 28, h);
      ctx.globalAlpha = Math.max(0, alpha) * pulse;
      ctx.fillRect(this.x - 4, this.y - h, 8, h);
      ctx.globalAlpha = Math.max(0, alpha) * 0.5;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.max(0, alpha);
    }
    const bob = this.onGround ? Math.sin(this.t * 3) * 3 : 0;
    const cy = this.y - 14 - bob;
    ctx.translate(this.x, cy);
    if (this.angle) ctx.rotate(this.angle);
    if (this.isRare) { ctx.shadowColor = this.color; ctx.shadowBlur = 14; }
    drawItemIcon(ctx, this.item, 0, 0, 28);
    ctx.restore();
  }
}
