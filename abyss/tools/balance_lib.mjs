// 数値の計測の道具（強さ担当）。Node で 1 人の主人公を「放置の遊び方」で回し、進み具合と稼ぎを記録する。
// tools/balance_report.mjs（全クラスを並列に）と tests/sim.mjs から使う。
//
// 遊び方（policy）:
//   自動装備・スキルポイントの自動・おまかせ編成・星座盤の自動（game.sys.tree.autoAllocate があればそれ、無ければ下の簡単な欲張り）
//   ・パラゴンのおまかせ・ボスの自動再挑戦（autoBoss）・卵は空いた孵卵器に入れて孵し、一番良いペットを連れる。
//   鍛冶・宝石・極意・商人は使わない（「クラフトなし」の下限の進み）。
//   rebirth: true なら、転生できるようになったら（物語の第五章以降で）魂を祭壇に使って転生する（2 周目の計測）。

import { Game } from '../src/game/game.js';
import { ZONES, ACTS } from '../src/data/world.js';
import { TREE_NODE } from '../src/data/tree.js';
import { RARITIES } from '../src/data/rarity.js';
import { computeHero, heroPower, effectiveLife } from '../src/game/character.js';
import { estimateBuildDps } from '../src/game/skills.js';
import { ALTAR } from '../src/data/prestige.js';

export const fmtT = (sec) => (sec == null ? '—' : sec < 3600 ? `${Math.round(sec / 60)}分` : `${(sec / 3600).toFixed(1)}時間`);

/** 星座盤の簡単な欲張り: 3 歩以内の点で「戦力の伸び ÷ 歩数」が一番大きい物から振る */
export function greedyTree(g, maxSteps = 3) {
  const t = g.state.hero.tree;
  const sys = g.sys.tree;
  let n = 0;
  for (let guard = 0; guard < 60 && t.points > 0; guard++) {
    const st = g.state;
    const base = heroPower(computeHero(st, g), st);
    // 振ってある点から maxSteps 歩以内
    const have = new Set(t.alloc);
    const seen = new Map();
    let front = [...have];
    for (let d = 1; d <= maxSteps; d++) {
      const nxt = [];
      for (const id of front) for (const l of TREE_NODE[id]?.links || []) {
        if (have.has(l) || seen.has(l) || TREE_NODE[l]?.type === 'start') continue;
        seen.set(l, d); nxt.push(l);
      }
      front = nxt;
    }
    let best = null; let bv = -Infinity;
    for (const [id, d] of seen) {
      if (d > t.points) continue;
      const path = sys.pathTo(id);
      if (!path || !path.length || path.length > t.points) continue;
      sys.preview = [...t.alloc, ...path];
      let p;
      try { p = heroPower(computeHero(st, g), st); } finally { sys.preview = null; }
      const v = (p / Math.max(1, base) - 1) / path.length;
      if (v > bv) { bv = v; best = id; }
    }
    if (!best) break;
    const r = sys.allocate(best);
    if (!r.ok) break;
    n += r.n;
  }
  return n;
}

function autoTree(g) {
  const t = g.state.hero.tree;
  if (!(t.points > 0)) return 0;
  if (typeof g.sys.tree.autoAllocate === 'function') { try { return g.sys.tree.autoAllocate() || 0; } catch (e) { /* 下へ */ } }
  return greedyTree(g);
}

function petPolicy(g) {
  const ps = g.sys.pets;
  if (!ps) return;
  const s = g.state.meta.pets;
  try {
    for (let i = s.incubator.length - 1; i >= 0; i--) if (s.incubator[i].prog >= s.incubator[i].need) ps.hatch(i);
    while (ps.freeIncubators() > 0 && ps.eggCount() > 0) { const k = Object.keys(s.eggs).find((x) => s.eggs[x] > 0); if (!k || !ps.incubate(k)) break; }
    const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const owned = Object.entries(s.owned);
    if (owned.length) {
      owned.sort((a, b) => (order[petRarity(b[0])] - order[petRarity(a[0])]) || (b[1].stars - a[1].stars) || (b[1].lvl - a[1].lvl));
      if (s.active !== owned[0][0]) ps.setActive(owned[0][0]);
    }
  } catch { /* ペットの仕組みが無くても回す */ }
}
let PETDEF = null;
function petRarity(id) { return PETDEF?.[id]?.rarity || 'common'; }

/** 魂を祭壇に使う（攻め・守り・稼ぎの基本を順に） */
const ALTAR_ORDER = ['auto_boss', 'auto_skill', 'soul_blade', 'soul_life', 'soul_fury', 'soul_wisdom', 'soul_armor', 'soul_ward', 'soul_harvest', 'idle_warp', 'soul_slayer', 'soul_haste', 'soul_ruin', 'soul_edge', 'soul_gold', 'soul_fortune'];
export function spendSouls(g) {
  const p = g.sys.prestige;
  let n = 0;
  for (let guard = 0; guard < 400; guard++) {
    let bought = false;
    // 一番安い物から（同じ値段なら上の順）
    const cand = ALTAR_ORDER.filter((id) => p.canBuy(id)).sort((a, b) => p.cost(a) - p.cost(b));
    if (cand.length) { p.buy(cand[0], 1); n++; bought = true; }
    if (!bought) break;
  }
  return n;
}

/**
 * 1 人を回す。opts: { cls, hours, seed, rebirth（転生の計測）, stopAtAct（その章を倒したら止める）, onMinute }
 * 戻り値は JSON にできる記録。
 */
export async function runLife(opts = {}) {
  const { cls = 'warrior', hours = 35, seed = 7, rebirth = false, stopAct = 10, maxRebirths = 1, life2Hours = 12 } = opts;
  if (!PETDEF) { try { PETDEF = (await import('../src/data/pets.js')).PET; } catch { PETDEF = {}; } }
  const g = new Game({ seed });
  g.newGame(cls, 'sim');
  const st = g.state;
  st.inv.filter.autoEquip = true;
  st.meta.unlocks.autoBoss = true;
  g.sys.skills.setAutoSpend?.(true);
  const rec = {
    cls, seed, lv10: null, acts: {}, act5: null, hourly: [], deaths: 0, deathsByAct: {}, rebirths: [], life2: null,
    rarity: {}, rarityByAct: {}, goblins: 0, eggs: 0, hatched: 0, ach: 0, finalLevel: 0, wall: [], firstFail: {},
  };
  const actOf = () => (ZONES[g.state.world.maxZone]?.actIdx ?? 0) + 1;
  g.events.on('heroDeath', () => { rec.deaths++; const a = actOf(); rec.deathsByAct[a] = (rec.deathsByAct[a] || 0) + 1; });
  g.events.on('loot', (e) => {
    if (e.source) return;
    const r = e.item?.rarity; if (!r) return;
    rec.rarity[r] = (rec.rarity[r] || 0) + 1;
    const a = actOf(); const ra = (rec.rarityByAct[a] ||= {}); ra[r] = (ra[r] || 0) + 1;
  });
  g.events.on('eggFound', () => rec.eggs++);
  g.events.on('petHatched', () => rec.hatched++);
  const lastAct = { t: 0, kills: 0, gold: 0, xpLv: 1 };
  g.events.on('zoneClear', (e) => {
    if (!e.first || e.zone.zoneIdx !== 4) return;
    const a = e.zone.actIdx + 1;
    const lifeN = st.meta.rebirths;
    const key = lifeN ? `${a}@${lifeN + 1}` : String(a);
    if (rec.acts[key]) return;
    const H = g.H;
    const t = st.playTime;
    const dt = Math.max(1, t - lastAct.t);
    rec.acts[key] = {
      t: Math.round(t), lv: st.hero.level, par: st.hero.paragon.level, power: heroPower(H, st), dps: Math.round(estimateBuildDps(st, H)), ehp: Math.round(effectiveLife(H)),
      killsPerSec: +((st.meta.stats.kills - lastAct.kills) / dt).toFixed(2), goldPerH: Math.round((st.meta.stats.goldEarned - lastAct.gold) * 3600 / dt), gold: Math.round(st.meta.gold),
      enh: Math.max(0, ...Object.values(st.hero.equip).map((it) => it?.enh || 0)),
      ilvl: Math.round(Object.values(st.hero.equip).reduce((s, it) => s + (it?.ilvl || 0), 0) / Math.max(1, Object.values(st.hero.equip).filter(Boolean).length)),
      souls: g.sys.prestige?.previewSouls?.() || 0,
    };
    lastAct.t = t; lastAct.kills = st.meta.stats.kills; lastAct.gold = st.meta.stats.goldEarned;
  });
  const t0 = Date.now();
  const totalMin = Math.round(hours * 60);
  let life2Start = null;
  for (let m = 1; m <= totalMin; m++) {
    for (let i = 0; i < 20 * 60; i++) g.tick(0.05);
    if (st.hero.skillPoints > 0) g.sys.skills.autoSpend();
    autoTree(g);
    if (st.hero.level >= 100) g.sys.tree.autoParagon();
    petPolicy(g);
    if (rec.lv10 == null && st.hero.level >= 10) rec.lv10 = m;
    if (m % 60 === 0) {
      rec.hourly.push({ h: m / 60, lv: st.hero.level, par: st.hero.paragon.level, zone: ZONES[st.world.maxZone]?.id, power: heroPower(g.H, st), kills: st.meta.stats.kills, gold: Math.round(st.meta.stats.goldEarned), deaths: rec.deaths, ach: g.sys.achievements?.points?.() || 0 });
    }
    opts.onMinute?.(g, m, rec);
    // 転生の計測: 第 stopAct 章（既定 5）を倒したら転生して、2 周目の第五章までの時間を測る
    if (rebirth) {
      const lifeN = st.meta.rebirths;
      if (lifeN < maxRebirths && rec.acts[String(stopAct)] && g.sys.prestige.canRebirth().ok) {
        const souls = g.sys.prestige.previewSouls();
        const r = g.sys.prestige.rebirth();
        if (r.ok) {
          const bought = spendSouls(g);
          rec.rebirths.push({ at: Math.round(st.playTime), souls, bought, warp: ZONES[st.world.maxZone]?.id });
          life2Start = st.playTime;
          lastAct.t = st.playTime; lastAct.kills = st.meta.stats.kills; lastAct.gold = st.meta.stats.goldEarned;
        }
      }
      if (life2Start != null && rec.acts[`${stopAct}@${maxRebirths + 1}`]) { rec.life2 = { sec: Math.round(st.playTime - life2Start), souls: g.sys.prestige.previewSouls() }; break; }
      if (life2Start != null && st.playTime - life2Start > life2Hours * 3600) break;
    } else if (rec.acts[String(stopAct)]) break;
  }
  const w = st.world;
  rec.wall = Object.entries(w.bossLog).filter(([, l]) => l.wall != null).map(([z, l]) => ({ z, wall: l.wall, tries: l.tries }));
  rec.stuck = Object.entries(w.bossLog).filter(([z, l]) => l.wall == null && l.fails > 0 && !w.cleared[z]).map(([z, l]) => ({ z, since: Math.round(st.playTime - (l.firstFail || 0)), tries: l.tries }));
  rec.finalLevel = st.hero.level; rec.finalParagon = st.hero.paragon.level;
  rec.finalZone = ZONES[w.maxZone]?.id;
  rec.playTime = Math.round(st.playTime);
  rec.kills = st.meta.stats.kills;
  rec.goldEarned = Math.round(st.meta.stats.goldEarned);
  rec.gold = Math.round(st.meta.gold);
  rec.goblins = st.meta.stats.goblins || 0;
  rec.goblinEscaped = w.goblinEscaped || 0;
  rec.ach = g.sys.achievements?.points?.() || 0;
  rec.power = heroPower(g.H, st);
  rec.mats = { ...st.inv.mats };
  rec.pets = Object.keys(st.meta.pets.owned || {}).length;
  rec.wallMs = Date.now() - t0;
  rec.game = g;
  return rec;
}

/** 記録を JSON にできる形に（game を外す） */
export function plain(rec) { const { game, ...rest } = rec; return rest; }

export { ZONES, ACTS, RARITIES, ALTAR };
