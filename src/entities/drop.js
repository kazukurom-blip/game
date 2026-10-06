// ドロップアイテム / お金。メイプル風: 上へ跳ねて弧を描き、地面で小さく1〜2回跳ねて止まり、ゆっくり上下に浮く。
// お金は額で見た目が変わる（銅貨・金貨・札束・袋）。レア以上は下から光の輪／光の柱。拾うとプレイヤーへ吸い込まれる。
import { moveAndCollide } from '../world/physics.js';
import { getItem } from '../data/items.js';
import { addItem } from '../systems/inventory.js';
import { RARITY } from '../systems/loot.js';
import { drawItemIcon } from '../render/icons.js';
import { spawnEffect } from '../render/effects.js';
import { moneySprite, rarityGlowSprite, rarityPillarSprite } from '../render/dropArt.js';

const LIFE = 60;
const FLY_TIME = 0.22;
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
    this.bounces = 0;         // 着地後の小さな跳ね（見た目だけ。最大2回）
    this.landT = -1;          // 止まった時刻（浮く動きの位相）
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
      // プレイヤー（または PET）へ吸い込まれる
      this.flyT += dt;
      const c = this.collector && !this.collector.remove ? this.collector : g.player;
      const tx = c.x, ty = c.y - (c === g.player ? 40 : 14);
      if (this.sx == null) { this.sx = this.x; this.sy = this.y; }
      // 少し上へ浮いてから、プレイヤーへ吸い込まれる（0.22秒）
      const k = Math.min(1, this.flyT / FLY_TIME), ek = k * k * (3 - 2 * k);
      this.x = this.sx + (tx - this.sx) * ek;
      this.y = this.sy + (ty - this.sy) * ek - Math.sin(k * Math.PI) * 26;
      if (this.flyT > FLY_TIME) this.remove = true;
      return;
    }
    if (!this.onGround) {
      this.angle += dt * 14 * Math.sign(this.vx || 1);
      const vy0 = this.vy;
      moveAndCollide(this, g.map, dt);
      if (this.onGround && this.bounces < 2 && vy0 > 160) {
        // 地面で小さく跳ねる（1回目は落下速度の 3 割、2回目はさらに小さく）。横には動かない
        this.bounces++;
        this.vy = -vy0 * (this.bounces === 1 ? 0.3 : 0.18);
        this.vx = 0;
        this.onGround = false;
        this.angle = 0;
      } else if (this.onGround) {
        this.vx = 0; this.angle = 0; this.landT = this.t;
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

  // 拾う。成功で true。by = 拾った主体（PET など。省略時プレイヤー）
  pickup(by = null) {
    if (!this.canPick()) return false;
    this.collector = by;
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
    let sc = 1;
    if (this.flyT >= 0) { const k = Math.min(1, this.flyT / FLY_TIME); alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; sc = 1 - k * 0.45; }
    if (alpha <= 0) return;
    const fx = this.game.settings?.fx ?? 1;
    const landed = this.onGround && this.flyT < 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    // レア以上: 下から光（レア=光の輪 / エピック=輪＋低い柱 / レジェンダリ以上=高い光の柱）。画像はキャッシュ
    if (this.isRare && landed) {
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 4);
      const tall = this.rarity === 'mythic' ? 230 : this.rarity === 'legendary' ? 190 : this.rarity === 'epic' ? 90 : 0;
      ctx.globalCompositeOperation = 'lighter';
      if (tall) {
        const pl = rarityPillarSprite(this.color);
        if (pl) {
          // 明るい背景でも見えるよう、色を薄く重ねてから加算で光らせる
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha * pulse * 0.45; ctx.drawImage(pl.img, this.x - pl.w / 2, this.y - tall, pl.w, tall);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * pulse * (fx < 0.3 ? 0.5 : 0.9); ctx.drawImage(pl.img, this.x - pl.w / 2, this.y - tall, pl.w, tall);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      const rg = rarityGlowSprite(this.color);
      if (rg) {
        const rk = (this.t * 0.8) % 1;
        ctx.globalAlpha = alpha * (0.9 - rk * 0.6);
        const rw = 34 + rk * 22;
        ctx.drawImage(rg.ring, this.x - rw, this.y - rw * 0.28, rw * 2, rw * 0.56);
        ctx.globalAlpha = alpha * pulse;
        ctx.drawImage(rg.ring, this.x - 30, this.y - 8, 60, 16);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    // 地面ではゆっくり上下に浮く（止まった瞬間から）
    const bob = landed ? (1 - Math.cos((this.t - Math.max(0, this.landT)) * 2.6)) * 2.5 : 0;
    const cy = this.y - 14 - bob;
    ctx.translate(this.x, cy);
    if (sc !== 1) ctx.scale(sc, sc);
    if (this.isRare) {
      const rg = rarityGlowSprite(this.color);
      if (rg) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.8; ctx.drawImage(rg.glow, -26, -26, 52, 52); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha; }
    }
    if (this.angle) ctx.rotate(this.angle);
    if (this.money != null) {
      const m = moneySprite(this.money);
      if (m) {
        // 硬貨は地面でくるくる回る（メイプルのメル）。札束・袋は回らない
        const spin = m.coin ? Math.cos(this.t * 5) : 1;
        ctx.scale(m.coin ? Math.max(0.12, Math.abs(spin)) : 1, 1);
        ctx.drawImage(m.img, -m.w / 2, -m.h / 2 + 2, m.w, m.h);
      } else drawItemIcon(ctx, this.item, 0, 0, 28);
    } else drawItemIcon(ctx, this.item, 0, 0, 28);
    ctx.restore();
  }
}
