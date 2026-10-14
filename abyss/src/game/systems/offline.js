// 放置（オフライン）の稼ぎ。遊んでいる間の「1 秒あたりの稼ぎ」を測っておき、離れていた時間ぶんを渡す。
// アイテムは実際に生成してフィルタにかける（多すぎる分は素材に換算）。
// 外から: game.sys.offline.rates() / grant(seconds, { reason }) → 報告

import { BAL } from '../../data/balance.js';
import { generateItem, dropCount } from '../loot.js';
import { RARITY } from '../../data/rarity.js';

const BUCKET_SEC = 10;
const WINDOW = 30; // 5 分

export class OfflineSystem {
  constructor(game) {
    this.game = game;
    this.id = 'offline';
    this.cur = this.blank();
    this.buckets = [];
  }
  blank() { return { t: 0, kills: 0, xp: 0, gold: 0, drops: 0, levelSum: 0, mfSum: 0 }; }

  /** 倒したときに game から呼ばれる */
  record(k) {
    const c = this.cur;
    c.kills += 1; c.xp += k.xp || 0; c.gold += k.gold || 0; c.drops += k.drops || 0; c.levelSum += k.level || 0;
  }

  tick(dt) {
    this.cur.t += dt;
    if (this.cur.t >= BUCKET_SEC) {
      this.buckets.push(this.cur);
      if (this.buckets.length > WINDOW) this.buckets.shift();
      this.cur = this.blank();
      // セーブにも残す（再起動しても放置の稼ぎが分かるように）
      this.game.state.meta.rates = this.rates();
    }
  }

  /** 1 秒あたりの稼ぎ */
  rates() {
    const all = [...this.buckets, this.cur];
    const t = all.reduce((s, b) => s + b.t, 0);
    if (t < 20) return this.game.state.meta.rates || this.fallback();
    const sum = (k) => all.reduce((s, b) => s + b[k], 0);
    const kills = sum('kills');
    return { kills: kills / t, xp: sum('xp') / t, gold: sum('gold') / t, drops: sum('drops') / t, level: kills ? sum('levelSum') / kills : this.game.sys.world.level(), measured: t };
  }

  fallback() {
    // まだ測れていないとき: 今の場所で 2 秒に 1 体と仮定
    const L = this.game.sys.world.level();
    return { kills: 0.5, xp: 0.5 * BAL.monsterXp(L), gold: 0.5 * BAL.GOLD_DROP_CHANCE * BAL.monsterGold(L), drops: 0.5 * BAL.ITEM_DROP_CHANCE, level: L, measured: 0 };
  }

  capSeconds() {
    const extra = this.game.state.meta.unlocks.offlineHours || 0;
    return (BAL.OFFLINE_CAP_HOURS + extra) * 3600;
  }

  /** 離れていた seconds ぶんの稼ぎを渡して報告を返す */
  grant(seconds, { reason = 'offline' } = {}) {
    const g = this.game;
    const capped = Math.min(seconds, this.capSeconds());
    if (capped < 30) return null;
    const r = this.rates();
    const eff = BAL.OFFLINE_EFFICIENCY * (1 + (g.H?.offline || 0) / 100);
    const kills = Math.floor(r.kills * capped * eff);
    const xp = r.xp * capped * eff;
    const gold = Math.floor(r.gold * capped * eff);
    const before = { level: g.state.hero.level, paragon: g.state.hero.paragon.level };
    g.addXp(xp, { quiet: true });
    g.addGold(gold);
    g.state.meta.stats.kills += kills;
    g.state.meta.stats.offlineSec += capped;
    // アイテム
    const nDrops = Math.floor(r.drops * capped * eff);
    const REAL = Math.min(nDrops, 1500);
    const found = {}; const kept = []; const matsBefore = { ...g.state.inv.mats };
    const H = g.H;
    const diff = g.sys.world.difficulty();
    for (let i = 0; i < REAL; i++) {
      const rank = g.rng.chance(0.08) ? 'champion' : 'normal';
      const it = generateItem(g.rng, { ilvl: Math.round(r.level), cls: g.state.hero.cls, mf: (H?.mf || 0) + (diff.mf || 0), rank, torment: g.state.world.torment, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0 });
      if (!it) continue;
      found[it.rarity] = (found[it.rarity] || 0) + 1;
      const res = g.sys.inv.receive(it, { quiet: true });
      if (res !== 'salvaged' && RARITY[it.rarity].idx >= 3) kept.push(it);
    }
    // 多すぎた分は素材に（平均的な分解の量）
    if (nDrops > REAL) {
      const k = (nDrops - REAL) / Math.max(1, REAL);
      const m = g.state.inv.mats;
      for (const id in m) { const d = m[id] - (matsBefore[id] || 0); if (d > 0) m[id] += Math.floor(d * k); }
    }
    const mats = {};
    for (const id in g.state.inv.mats) { const d = g.state.inv.mats[id] - (matsBefore[id] || 0); if (d > 0) mats[id] = d; }
    const report = { reason, seconds, capped, kills, xp, gold, found, kept, mats, levels: g.state.hero.level - before.level, paragon: g.state.hero.paragon.level - before.paragon, eff };
    g.events.emit('offlineReport', report);
    return report;
  }
}

export { dropCount };
