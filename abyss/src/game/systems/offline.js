// 放置（オフライン）の稼ぎ。遊んでいる間の「1 秒あたりの稼ぎ」を測っておき、離れていた時間ぶんを渡す。担当: メタ担当。
//
// 上限: 8 時間（魂の祭壇「長き眠り」で最大 48 時間）。上限を超えた分も 25% の効率でたまる（最大で上限と同じ時間ぶん）。
// 効率: 80%（祭壇「夢見の効率」で 100% まで）×（1 + 放置の稼ぎ %）。
// アイテム: 1,500 個までは実際に作ってフィルタにかける。残りはレアリティだけを引き、エピック以上は 1 個ずつ作る（期待値＋上位の個別抽選）。
//           それより下は見本の平均の素材に変える（あふれた分も黙って消さない）。
// 外から: game.sys.offline.rates() / capSeconds() / efficiency() / grant(seconds, { reason }) → 報告
// 報告（'offlineReport' で配る。ほかの仕組みが項目を足してよい）:
//   { reason, seconds, capped（100% で数えた秒）, over（25% で数えた秒）, cap, effSec, kills, elites, bosses, xp, gold, drops, rolled,
//     found: { rarity: 数 }, kept: [item], best: [item]（良い順に 8 個）, where: { uid: 'bag'|'equipped' }, salvaged, mats: { id: 数 },
//     levels, paragon, levelFrom, levelTo, paragonFrom, paragonTo, eff, rate,
//     eggs?, hatchReady?, bounties?, achievements?（メタ担当の仕組みが onOffline で足す）, luck? gems? runes?（アイテム担当） }

import { BAL } from '../../data/balance.js';
import { generateItem, dropCount, rollRarity } from '../loot.js';
import { RARITY } from '../../data/rarity.js';

const BUCKET_SEC = 10;
const WINDOW = 30; // 5 分
export const OVER_EFF = 0.25;
/** これより短い留守は放置の稼ぎにしない（Game.catchUp がその時間ぶんふつうに進める） */
export const MIN_OFFLINE_SEC = 30;
export const MAX_CAP_HOURS = 48;
// 強さの決まりの版。変えたら、セーブに残った古い稼ぎの速さ（meta.rates）を使わない
export const BAL_STAMP = 'r2-difficulty';
const FULL_ITEMS = 1500;
const MAX_ROLLS = 200000;

export class OfflineSystem {
  constructor(game) {
    this.game = game;
    this.id = 'offline';
    this.cur = this.blank();
    this.buckets = [];
    game.events.on('kill', (e) => {
      const u = e?.unit;
      if (!u) return;
      if (u.rank === 'champion' || u.rank === 'rare') this.cur.elites++;
      if (u.boss) this.cur.bosses++;
    });
  }
  blank() { return { t: 0, kills: 0, xp: 0, gold: 0, drops: 0, levelSum: 0, elites: 0, bosses: 0 }; }

  ensureState() { this.cur = this.blank(); this.buckets = []; }

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
    if (t < 20) {
      // セーブに残った稼ぎは、同じ強さの決まり（BAL_STAMP）で測った物だけ使う（手応えの見直しの前の速さで放置の稼ぎを出さない）
      const saved = this.game.state.meta.rates;
      return saved && saved.bal === BAL_STAMP ? saved : this.fallback();
    }
    const sum = (k) => all.reduce((s, b) => s + (b[k] || 0), 0);
    const kills = sum('kills');
    return { kills: kills / t, xp: sum('xp') / t, gold: sum('gold') / t, drops: sum('drops') / t, elites: sum('elites') / t, bosses: sum('bosses') / t, level: kills ? sum('levelSum') / kills : this.game.sys.world.level(), heroLevel: this.game.state.hero.level, measured: t, bal: BAL_STAMP };
  }

  fallback() {
    // まだ測れていないとき: 今の場所で 2 秒に 1 体と仮定
    const L = this.game.sys.world.level();
    return { kills: 0.5, xp: 0.5 * BAL.monsterXp(L) * BAL.xpLevelPenalty(this.game.state.hero.level, L), gold: 0.5 * BAL.GOLD_DROP_CHANCE * BAL.monsterGold(L), drops: 0.5 * BAL.ITEM_DROP_CHANCE, elites: 0.5 * 0.05, bosses: 0, level: L, heroLevel: this.game.state.hero.level, measured: 0, bal: BAL_STAMP };
  }

  capHours() {
    const extra = this.game.state.meta.unlocks.offlineHours || 0;
    return Math.min(MAX_CAP_HOURS, BAL.OFFLINE_CAP_HOURS + extra);
  }
  capSeconds() { return this.capHours() * 3600; }

  /** 祭壇込みの基本の効率（0.8〜1.0） */
  baseEfficiency() { return Math.min(1, BAL.OFFLINE_EFFICIENCY + (this.game.state.meta.unlocks.offlineEff || 0) / 100); }
  /** 実際の効率（放置の稼ぎ % を掛ける） */
  efficiency() { return this.baseEfficiency() * (1 + (this.game.H?.offline || 0) / 100); }

  /** 放置の経験値を渡す。sec は効率をかけた秒。戻り値は渡した経験値 */
  grantXp(r, sec) {
    const g = this.game; const h = g.state.hero;
    const L = r.level || g.sys.world.level();
    const pen0 = BAL.xpLevelPenalty(r.heroLevel ?? h.level, L) || 1;
    const rateAt = () => (r.xp || 0) * BAL.xpLevelPenalty(h.level, L) / pen0;
    let left = sec; let total = 0;
    for (let guard = 0; left > 0 && h.level < BAL.MAX_LEVEL && guard < 200; guard++) {
      const rate = rateAt();
      if (!(rate > 0)) return total;
      const need = Math.max(0, BAL.xpToNext(h.level) - h.xp);
      const v = Math.min(need, rate * left);
      g.addXp(v, { quiet: true }); total += v; left -= v / rate;
      if (v < need) return total;
    }
    if (left > 0) { const v = rateAt() * left; g.addXp(v, { quiet: true }); total += v; } // Lv100 から先はアビスLv
    return total;
  }

  /** 離れていた seconds ぶんの稼ぎを渡して報告を返す */
  grant(seconds, { reason = 'offline' } = {}) {
    const g = this.game;
    const st = g.state;
    const cap = this.capSeconds();
    const capped = Math.min(seconds, cap);
    if (capped < MIN_OFFLINE_SEC) return null;
    const over = Math.min(Math.max(0, seconds - cap), cap);
    const effSec = capped + over * OVER_EFF;
    const r = this.rates();
    const eff = this.efficiency();
    const kills = Math.floor(r.kills * effSec * eff);
    const elites = Math.floor((r.elites || 0) * effSec * eff);
    const bosses = Math.floor((r.bosses || 0) * effSec * eff);
    const gold = Math.floor(r.gold * effSec * eff);
    const before = { level: st.hero.level, paragon: st.hero.paragon.level };
    // 経験値は 1 Lv ずつ、そのレベルでの Lv 差の補正をかけ直して渡す（測ったときのレベルのまま 8 時間ぶん渡すと、地域より上がりすぎた分も満額になる）
    const xp = this.grantXp(r, effSec * eff);
    g.addGold(gold);
    st.meta.stats.kills += kills;
    st.meta.stats.elites += elites;
    st.meta.stats.bosses += bosses;
    st.meta.stats.offlineSec += capped + over;
    const rec = st.meta.record;
    if (rec && st.world.mode === 'campaign') {
      const act = g.sys.world.zone()?.act;
      if (act) { rec.actKills ||= {}; rec.actKills[act] = (rec.actKills[act] || 0) + kills; }
    }
    // アイテム
    const nDrops = Math.floor(r.drops * effSec * eff);
    const found = {}; const kept = []; const where = {};
    let salvaged = 0;
    const matsStart = { ...st.inv.mats };
    const H = g.H;
    const diff = g.sys.world.difficulty();
    const mf = (H?.mf || 0) + (diff.mf || 0);
    const ilvl = Math.max(1, Math.round(r.level || 1));
    const baseOpts = { ilvl, cls: st.hero.cls, mf, torment: st.world.torment, ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0 };
    // 見本の素材（エピック未満を分解したときの平均）
    const lowMats = {}; const lowN = {};
    const take = (it) => {
      found[it.rarity] = (found[it.rarity] || 0) + 1;
      const idx = RARITY[it.rarity]?.idx || 0;
      const snap = idx < 3 ? { ...st.inv.mats } : null;
      const res = g.sys.inv.receive(it, { quiet: true });
      if (res === 'salvaged') salvaged++;
      else if (idx >= 3) { kept.push(it); where[it.uid] = res; }
      if (snap && res === 'salvaged') {
        lowN[it.rarity] = (lowN[it.rarity] || 0) + 1;
        const m = st.inv.mats;
        for (const k in m) { const d = m[k] - (snap[k] || 0); if (d > 0) { lowMats[it.rarity] ||= {}; lowMats[it.rarity][k] = (lowMats[it.rarity][k] || 0) + d; } }
      }
    };
    const FULL = Math.min(nDrops, FULL_ITEMS);
    for (let i = 0; i < FULL; i++) {
      const rank = g.rng.chance(0.08) ? 'champion' : 'normal';
      const it = generateItem(g.rng, { ...baseOpts, rank });
      if (it) take(it);
    }
    // 残り: レアリティだけ引く（エピック以上は 1 個ずつ作る）
    let rest = nDrops - FULL;
    let scale = 1;
    if (rest > MAX_ROLLS) { scale = rest / MAX_ROLLS; rest = MAX_ROLLS; }
    const lowExtra = {};
    for (let i = 0; i < rest; i++) {
      const rank = g.rng.chance(0.08) ? 'champion' : 'normal';
      const rar = rollRarity(g.rng, { mf, rank, torment: st.world.torment, ilvl });
      if ((RARITY[rar]?.idx || 0) >= 3) {
        const it = generateItem(g.rng, { ...baseOpts, rank, rarity: rar });
        if (it) take(it);
      } else {
        lowExtra[rar] = (lowExtra[rar] || 0) + scale;
      }
    }
    let rolledSalvaged = 0;
    for (const [rar, n0] of Object.entries(lowExtra)) {
      const n = Math.round(n0);
      found[rar] = (found[rar] || 0) + n;
      // 拾った数（記録・実績「マジックを N 個拾う」など）にも数える。作って受け取った分は receive() が数える
      const fs = st.meta.stats.itemsFound; fs[rar] = (fs[rar] || 0) + n;
      rolledSalvaged += n;
      const per = lowMats[rar]; const cnt = lowN[rar] || 0;
      const add = {};
      if (per && cnt) {
        for (const [k, v] of Object.entries(per)) { const a = Math.floor((v / cnt) * n); if (a > 0) add[k] = a; }
      } else {
        g.sys.inv.salvageYield({ rarity: rar, q: 0, affixes: [], sockets: [], ilvl, slot: 'ring', base: '', enh: 0 }, add);
        for (const k in add) add[k] = Math.floor(add[k] * n);
      }
      g.sys.inv.addMats(add);
    }
    // receive() の分解は receive 自身が数えるので、ここではレアリティだけ引いた分を足す
    st.meta.stats.salvaged += rolledSalvaged;
    salvaged += rolledSalvaged;
    const mats = {};
    for (const id in st.inv.mats) { const d = st.inv.mats[id] - (matsStart[id] || 0); if (d > 0) mats[id] = d; }
    const best = kept.slice().sort((a, b) => (RARITY[b.rarity].idx - RARITY[a.rarity].idx) || ((b.q || 0) - (a.q || 0)) || (b.ilvl - a.ilvl)).slice(0, 8);
    const report = {
      reason, seconds, capped, over, overEff: OVER_EFF, cap, effSec, kills, elites, bosses, xp, gold, drops: nDrops, rolled: FULL,
      found, kept, best, where, salvaged, mats,
      levels: st.hero.level - before.level, paragon: st.hero.paragon.level - before.paragon,
      levelFrom: before.level, levelTo: st.hero.level, paragonFrom: before.paragon, paragonTo: st.hero.paragon.level,
      eff, baseEff: this.baseEfficiency(), rate: r,
    };
    // ほかの仕組み（ペットの卵・孵卵器・日課・図鑑・実績）
    g.each('onOffline', report);
    g.events.emit('invChanged', {});
    g.events.emit('offlineReport', report);
    return report;
  }
}

export { dropCount };
