// 倒したときの追加の報酬（試薬・深淵の欠片・宝石・ルーン）と、見える天井（幸運ゲージ）。
// オフライン（放置）の稼ぎでもゲージは進み、天井に届けば確定でドロップする。
//
// 幸運ゲージ（state.inv.luck）:
//   leg  … レジェンダリー以上が出ないまま振ったドロップの回数。LUCK.leg.max で確定、60% を超えると少しずつ出やすくなる
//   myth … ミシックが出ないまま振ったドロップの回数。LUCK.myth.max で確定
//   「幸運ゲージの上昇」（luck_gain）で 1 回あたりのたまり方が増える

import { generateItem } from '../../loot.js';
import { RARITY } from '../../../data/rarity.js';
import { MAT_DROPS, TORMENT_ABYSSDROP } from '../../../data/materials.js';
import { GEMS, GEM_TIERS, RUNES, LEGENDARY_GEMS } from '../../../data/gems.js';

export const LUCK = {
  leg: { max: 400, soft: 0.6, name: 'レジェンダリー以上' },
  myth: { max: 12000, soft: 0.6, name: 'ミシック' },
};
const LEG_PLUS = ['legendary', 'set', 'unique', 'mythic'];
const LEG_WEIGHTS = [['legendary', 0.35], ['unique', 0.12], ['set', 0.08]];

export function ensureLuck(state) {
  const inv = state.inv;
  inv.luck ||= {};
  for (const k of ['leg', 'myth', 'forcedLeg', 'forcedMyth', 'rolls']) if (typeof inv.luck[k] !== 'number') inv.luck[k] = 0;
  return inv.luck;
}

/** UI 用: { leg: { cur, max, pct, soft }, myth: {...} } */
export function luckView(state) {
  const l = ensureLuck(state);
  const out = {};
  for (const k of ['leg', 'myth']) out[k] = { cur: Math.floor(l[k]), max: LUCK[k].max, pct: Math.min(100, (l[k] / LUCK[k].max) * 100), soft: LUCK[k].soft * 100, name: LUCK[k].name, forced: k === 'leg' ? l.forcedLeg : l.forcedMyth };
  return out;
}

function gainMul(game) { return 1 + (game.H?.S?.luck_gain || 0) / 100; }

function itemOpts(game, unit, extra = {}) {
  const st = game.state;
  const H = game.H || {};
  const diff = game.sys.world.difficulty();
  return {
    ilvl: unit?.level || game.sys.world.level(), cls: st.hero.cls, mf: (H.mf || 0) + (diff.mf || 0), rank: unit?.rank || 'normal', torment: st.world.torment,
    ancientChance: diff.ancient ?? 0.08, primalChance: diff.primal || 0, ...extra,
  };
}

/** 天井に届いたときの確定ドロップ */
export function forcedDrop(game, kind, unit = null) {
  const rng = game.rng;
  const rarity = kind === 'myth' ? 'mythic' : rng.weighted(LEG_WEIGHTS, (x) => x[1])[0];
  const it = generateItem(rng, itemOpts(game, unit, { rarity, anyReq: true, source: 'luck' }));
  if (it) it.luck = 1;
  return it;
}

/** ドロップを n 回振ったあと（items は今回落ちた物）。確定・底上げのアイテムを返す */
export function advanceLuck(game, n, items, unit = null) {
  const l = ensureLuck(game.state);
  const extra = [];
  if (n <= 0) return extra;
  const g = gainMul(game);
  l.rolls += n;
  // 自然に出た物でリセット
  const hasLeg = items.some((it) => LEG_PLUS.includes(it.rarity));
  const hasMyth = items.some((it) => it.rarity === 'mythic');
  l.leg = hasLeg ? 0 : l.leg + n * g;
  l.myth = hasMyth ? 0 : l.myth + n * g;
  // 底上げ（60% を超えると、ふつうのドロップが少しずつレジェンダリー以上に変わる）
  const ratio = l.leg / LUCK.leg.max;
  if (!hasLeg && ratio > LUCK.leg.soft && ratio < 1) {
    const k = (ratio - LUCK.leg.soft) / (1 - LUCK.leg.soft);
    if (game.rng.chance(Math.min(0.5, 0.02 * k * n))) { const it = forcedDrop(game, 'leg', unit); if (it) { extra.push(it); l.leg = 0; } }
  }
  if (l.leg >= LUCK.leg.max) { const it = forcedDrop(game, 'leg', unit); if (it) { extra.push(it); l.forcedLeg++; } l.leg = 0; }
  if (l.myth >= LUCK.myth.max) { const it = forcedDrop(game, 'myth', unit); if (it) { extra.push(it); l.forcedMyth++; } l.myth = 0; }
  return extra;
}

// ---------------- 素材・宝石・ルーン
function addMat(game, out, id, k) { if (k > 0) out[id] = (out[id] || 0) + k; }

/** 宝石の段階（エリアレベルで上限が上がる） */
export function rollGemTier(rng, L) {
  const max = Math.max(1, Math.min(GEM_TIERS, 1 + Math.floor(L / 12)));
  const r = rng.next();
  return Math.max(1, r < 0.5 ? max : r < 0.8 ? max - 1 : max - 2);
}
/** ルーンの段階（上ほど珍しい） */
export function rollRune(rng, L) {
  const max = Math.max(1, Math.min(RUNES.length, 1 + Math.floor(L / 4.5)));
  const pool = RUNES.filter((r) => r.tier <= max);
  return rng.weighted(pool, (r) => 0.85 ** (r.tier - 1));
}

const GEM_CHANCE = { champion: 0.1, rare: 0.12, boss: 0.6, actboss: 1, goblin: 1, guardian: 1 };
const GEM_COUNT = { actboss: 2, goblin: 2, guardian: 2 };
const RUNE_CHANCE = { champion: 0.04, rare: 0.05, boss: 0.25, actboss: 0.6, goblin: 0.5, guardian: 0.6 };

/** 1 体ぶんの素材・宝石・ルーンを out（{ mats, gems, runes }）に足す */
export function rollUnitExtras(game, unit, out) {
  const rng = game.rng;
  const H = game.H || { S: {} };
  const S = H.S || {};
  const rank = unit.rank || 'normal';
  const shardMul = 1 + (S.shard_find || 0) / 100;
  const table = MAT_DROPS[rank];
  if (table) {
    for (const [id, p, lo, hi] of table) {
      if (!rng.chance(p)) continue;
      let k = rng.int(lo, hi);
      if (id === 'shard') k = Math.floor(k * shardMul + (rng.next() < (k * shardMul) % 1 ? 1 : 0));
      addMat(game, out.mats, id, k);
    }
  }
  if (game.state.world.torment > 0 && rng.chance(TORMENT_ABYSSDROP)) addMat(game, out.mats, 'abyssdrop', 1);
  const L = unit.level || 1;
  const gc = (GEM_CHANCE[rank] || 0) * (1 + (S.gem_find || 0) / 100);
  if (gc > 0) {
    const times = (GEM_COUNT[rank] || 1);
    for (let i = 0; i < times; i++) if (rng.chance(Math.min(1, gc))) { const g = rng.pick(GEMS); const key = `${g.id}_${rollGemTier(rng, L)}`; out.gems[key] = (out.gems[key] || 0) + 1; }
  }
  const rc = (RUNE_CHANCE[rank] || 0) * (1 + (S.rune_find || 0) / 100);
  if (rc > 0 && rng.chance(Math.min(1, rc))) { const r = rollRune(rng, L); if (r) out.runes[r.id] = (out.runes[r.id] || 0) + 1; }
  // 深淵の宝石（苦行の章のボス・守護者から、まだ持っていない物がまれに）
  if ((rank === 'actboss' || rank === 'guardian') && game.state.world.torment > 0 && rng.chance(0.03)) out.lgem = true;
}

export function applyExtras(game, out) {
  const inv = game.state.inv;
  for (const k in out.mats) inv.mats[k] = (inv.mats[k] || 0) + out.mats[k];
  for (const k in out.gems) inv.gems[k] = (inv.gems[k] || 0) + out.gems[k];
  for (const k in out.runes) inv.runes[k] = (inv.runes[k] || 0) + out.runes[k];
  if (out.lgem) game.sys.gems?.grantLegendaryGem?.();
}

/** game.js の報酬の差し込み（rewardMods）に登録する関数 */
export function rewardHook(game, unit, reward) {
  const out = { mats: {}, gems: {}, runes: {} };
  rollUnitExtras(game, unit, out);
  applyExtras(game, out);
  const got = Object.keys(out.gems).length + Object.keys(out.runes).length;
  if (got && game.combat) {
    const names = [];
    if (Object.keys(out.gems).length) names.push('宝石');
    if (Object.keys(out.runes).length) names.push('ルーン');
    game.combat.emit({ t: 'text', x: unit.x, y: unit.y, z: 140, text: `${names.join('・')}を手に入れた`, color: '#c77dff' });
  }
  if (got || Object.keys(out.mats).length) reward.extras = out;
  // 幸運ゲージ
  const extra = advanceLuck(game, reward.drops || 0, reward.items, unit);
  for (const it of extra) { reward.items.push(it); reward.drops = (reward.drops || 0) + 1; }
}

/** オフラインの報告に、ゲージと素材を足す（UI より先に呼ばれる） */
export function offlineHook(game, rep) {
  if (!rep) return;
  const r = game.sys.offline.rates();
  const nDrops = Math.floor((r.drops || 0) * (rep.capped || 0) * (rep.eff || 1));
  const l = ensureLuck(game.state);
  const g = gainMul(game);
  const found = rep.found || {};
  const legFound = LEG_PLUS.reduce((s, k) => s + (found[k] || 0), 0);
  const kept = [];
  // レジェンダリー以上
  if (legFound > 0) l.leg = game.rng.int(0, Math.floor(Math.min(LUCK.leg.max - 1, nDrops / (legFound + 1)) * g));
  else l.leg += nDrops * g;
  while (l.leg >= LUCK.leg.max) { l.leg -= LUCK.leg.max; const it = forcedDrop(game, 'leg'); if (it) { l.forcedLeg++; kept.push(it); } if (kept.length > 50) { l.leg = 0; break; } }
  // ミシック
  if ((found.mythic || 0) > 0) l.myth = game.rng.int(0, Math.floor(Math.min(LUCK.myth.max - 1, nDrops / 2) * g));
  else l.myth += nDrops * g;
  while (l.myth >= LUCK.myth.max) { l.myth -= LUCK.myth.max; const it = forcedDrop(game, 'myth'); if (it) { l.forcedMyth++; kept.push(it); } if (kept.length > 60) { l.myth = 0; break; } }
  l.rolls += nDrops;
  for (const it of kept) {
    found[it.rarity] = (found[it.rarity] || 0) + 1;
    const where = game.sys.inv.receive(it, { quiet: true });
    if (where !== 'salvaged') rep.kept?.push(it);
  }
  rep.found = found;
  // エリートの分の素材・宝石・ルーン（撃破数の 7% をエリートとして、平均で渡す。重いので最大 400 体ぶんを実際に振って倍にする）
  const elites = Math.floor((rep.kills || 0) * 0.07);
  if (elites > 0) {
    const real = Math.min(elites, 400);
    const k = elites / real;
    const out = { mats: {}, gems: {}, runes: {} };
    const L = Math.round(r.level || game.sys.world.level());
    for (let i = 0; i < real; i++) rollUnitExtras(game, { rank: 'champion', level: L }, out);
    const scale = (o) => { for (const key in o) o[key] = Math.floor(o[key] * k); };
    scale(out.mats); scale(out.gems); scale(out.runes);
    applyExtras(game, out);
    rep.mats ||= {};
    for (const key in out.mats) rep.mats[key] = (rep.mats[key] || 0) + out.mats[key];
    rep.gems = out.gems; rep.runes = out.runes;
  }
  rep.luck = luckView(game.state);
}

export { LEGENDARY_GEMS, RARITY };
