// NPC。頭上に名前・肩書。受注可能クエスト=黄色「！」、完了報告可=「？」
import { drawCharacter } from '../render/character.js';
import { MISSIONS } from '../data/missions.js';

const SLOTS = ['hat', 'top', 'bottom', 'shoes', 'weapon', 'accessory'];
const DEFAULT_LOOK = { body: 'm', skin: '#f1c9a5', hair: 'short', hairColor: '#333', eyeColor: '#333' };

export class NPC {
  constructor(game, data = {}) {
    this.game = game;
    this.data = data;
    this.id = data.id;
    this.name = data.name || data.id;
    this.title = data.title || '';
    this.dialog = data.dialog || [];
    this.shop = data.shop || null;
    this.look = { ...DEFAULT_LOOK, ...(data.look || {}) };
    this.equip = {};
    for (const s of SLOTS) this.equip[s] = (data.equip && data.equip[s]) || null;
    this.x = data.x ?? 300;
    this.y = data.y ?? game.map?.groundY ?? 1000;
    this.w = 32; this.h = 70;
    this.facing = data.facing || 1;
    this.t = Math.random() * 5;
    this.remove = false;
    this.mark = null; this.markT = 0;
  }

  // 'available' | 'complete' | null
  questMark() {
    const g = this.game, m = g.missions;
    if (!m) return null;
    try {
      if (typeof m.npcMarker === 'function') {
        const mk = m.npcMarker(this.id);
        return mk === '?' ? 'complete' : mk === '!' ? 'available' : null;
      }
      const active = g.state?.missions?.active || [];
      for (const id of active) {
        const ms = MISSIONS[id];
        const turnTo = ms && (ms.turnIn || ms.giver);
        if (turnTo === this.id && m.isComplete(id)) return 'complete';
      }
      const av = m.available(this.id);
      if (av && av.length) return 'available';
    } catch (e) { /* missions 未初期化 */ }
    return null;
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player;
    if (p && Math.abs(p.x - this.x) < 250) this.facing = p.x < this.x ? -1 : 1;
    this.markT -= dt;
    if (this.markT <= 0) { this.markT = 0.5; this.mark = this.questMark(); }
  }

  isNear(player, range = 80) {
    return Math.abs(player.x - this.x) < range && Math.abs(player.y - this.y) < 60;
  }

  draw(ctx) {
    drawCharacter(ctx, this.x, this.y, this.look, this.equip, { facing: this.facing, state: 'idle', t: this.t, attackT: 0, damage: 0 });
    const top = this.y - 92;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 名前タグ（メイプル風の黒帯）
    ctx.font = 'bold 13px sans-serif';
    const nw = ctx.measureText(this.name).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, this.x - nw / 2, this.y + 4, nw, 18, 4); ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.fillText(this.name, this.x, this.y + 13);
    if (this.title) {
      ctx.font = '11px sans-serif';
      const tw = ctx.measureText(this.title).width + 10;
      ctx.fillStyle = 'rgba(20,10,40,0.7)';
      roundRect(ctx, this.x - tw / 2, top - 8, tw, 16, 4); ctx.fill();
      ctx.fillStyle = '#9ef0ff';
      ctx.fillText(this.title, this.x, top);
    }
    const p = this.game.player;
    if (p && this.isNear(p) && !p.inVehicle) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, this.x - 34, this.y + 25, 68, 17, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('E: 話す', this.x, this.y + 34);
    }
    if (this.mark) {
      const bob = Math.sin(this.t * 4) * 4;
      const my = top - 30 + bob;
      const col = this.mark === 'complete' ? '#7CFC00' : '#ffd400';
      ctx.font = 'bold 30px sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#3a2400';
      const ch = this.mark === 'complete' ? '？' : '！';
      ctx.strokeText(ch, this.x, my);
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.fillText(ch, this.x, my);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
