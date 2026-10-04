// NPC。頭上に名前・肩書。受注可能クエスト=黄色「！」、完了報告可=「？」
import { drawCharacter } from '../render/character.js';
import { MISSIONS } from '../data/missions.js';
import { inHours, clockOf } from '../world/sys.js';

const TALK_RANGE = 90; // player.js の TALK_RANGE と同じ
/** 頭上マークの色: メイン金・サブ水色・デイリー緑・転職ピンク */
export const MARK_COLORS = { main: '#ffd400', sub: '#5ad8ff', daily: '#5cff7a', job: '#ff6fd8' };
export function missionKind(m) {
  if (!m) return 'main';
  if (m.type === 'job' || m.category === 'job') return 'job';
  if (m.daily || m.category === 'daily') return 'daily';
  if (m.category === 'sub') return 'sub';
  return 'main';
}

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
    this.mark = null; this.markT = 0; this.markKind = null;
    this.hours = Array.isArray(data.hours) ? data.hours : null; // [from, to]（時）: この時間帯だけ出現（夜の店など）
    this.service = data.service || null;                       // 'tower' | 'arena' | 'boss'（コンテンツ受付）
    this.hidden = false;
    this.fade = 1;
    this.updateHours();
  }

  /** 時間帯 NPC の表示切替（map._clock / game.clock） */
  updateHours() {
    if (!this.hours) { this.hidden = false; return; }
    this.hidden = !inHours(this.hours, clockOf(this.game));
  }

  /** {mark:'available'|'complete'|null, kind:'main'|'sub'|'daily'|'job'|null} */
  questInfo() {
    const mark = this.questMark();
    if (!mark) return { mark: null, kind: null };
    const m = this.game.missions;
    let ms = null;
    try {
      const list = mark === 'complete' ? (m?.completable?.(this.id) || []) : (m?.available?.(this.id) || []);
      // 転職 > メイン > サブ > デイリー の優先で色を決める
      const order = ['job', 'main', 'sub', 'daily'];
      ms = [...list].sort((a, b) => order.indexOf(missionKind(a)) - order.indexOf(missionKind(b)))[0] || null;
    } catch (e) { ms = null; }
    return { mark, kind: missionKind(ms) };
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
    if (this.markT <= 0) {
      this.markT = 0.5;
      this.updateHours();
      const qi = this.questInfo();
      this.mark = qi.mark; this.markKind = qi.kind;
    }
  }

  isNear(player, range = TALK_RANGE) {
    return Math.abs(player.x - this.x) < range && Math.abs(player.y - this.y) < 70;
  }

  draw(ctx) {
    if (this.hidden) return;
    drawCharacter(ctx, this.x, this.y, this.look, this.equip, { facing: this.facing, state: 'idle', t: this.t, attackT: 0, damage: 0, alpha: this.data.alpha ?? 1 });
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
    if (this.hours) {
      // 夜だけの NPC/店の印
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = 'rgba(30,20,70,0.75)';
      roundRect(ctx, this.x - 30, this.y + 24, 60, 14, 4); ctx.fill();
      ctx.fillStyle = '#c9b6ff';
      ctx.fillText(`🌙 ${this.hours[0]}時〜${this.hours[1]}時`, this.x, this.y + 31);
    }
    const near = p && !p.inVehicle && this.isNear(p) && (typeof p.nearestNpc !== 'function' || p.nearestNpc() === this);
    if (near) {
      // 頭上に「V で話す」
      const by = top - (this.mark ? 62 : 30) + Math.sin(this.t * 5) * 2;
      ctx.font = 'bold 13px sans-serif';
      const label = 'V で話す';
      const w = ctx.measureText(label).width + 30;
      ctx.fillStyle = 'rgba(10,8,24,0.82)';
      roundRect(ctx, this.x - w / 2, by - 11, w, 22, 6); ctx.fill();
      ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#19f0ff';
      roundRect(ctx, this.x - w / 2 + 5, by - 8, 16, 16, 3); ctx.fill();
      ctx.fillStyle = '#0a0818'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('V', this.x - w / 2 + 13, by + 1);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('で話す', this.x + 10, by + 1);
    }
    if (this.mark) {
      const bob = Math.sin(this.t * 4) * 4;
      const my = top - 30 + bob;
      const col = MARK_COLORS[this.markKind] || (this.mark === 'complete' ? '#7CFC00' : '#ffd400');
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
