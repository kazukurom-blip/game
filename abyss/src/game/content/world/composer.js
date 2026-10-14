// ウェーブの組み立て（worldHooks.waveComposer）。物語・苦行のステージ 1〜9 で使う。
// 群れの型: 混成 / 同族の群れ / 前衛と後衛 / チャンピオンの群れ / 群れの長とお供 / 精鋭の行軍。
// 数はステージで増える（ステージ 1: 4〜5 体 → ステージ 9: 7〜8 体、苦行 +1）。
// ときどき小さな出来事（待ち伏せ・祠・呪われた宝箱）。ため込み屋はここで群れの後ろに混ざる。

import { worldHooks } from '../../systems/world.js';
import { MONSTER } from '../../../data/monsters.js';
import { pickAffixes, affixCount } from './elites.js';
import { GOBLIN } from './goblins.js';

// 小さな出来事（祠の効果は 30〜60 秒の強化）
export const SHRINES = [
  { id: 'shrine_power', name: '力の祠', mods: [{ s: 'more_dmg', v: 25 }], dur: 30, text: '力の祠：最終ダメージ +25%（30 秒）' },
  { id: 'shrine_haste', name: '疾風の祠', mods: [{ s: 'attack_speed', v: 30 }, { s: 'move_speed', v: 30 }], dur: 30, text: '疾風の祠：攻撃の速さ・移動 +30%（30 秒）' },
  { id: 'shrine_fortune', name: '幸運の祠', mods: [{ s: 'magic_find', v: 100 }, { s: 'gold_find', v: 100 }], dur: 60, text: '幸運の祠：レア発見率・ゴールド +100%（60 秒）' },
  { id: 'shrine_wisdom', name: '叡智の祠', mods: [{ s: 'xp_bonus', v: 50 }], dur: 60, text: '叡智の祠：経験値 +50%（60 秒）' },
  { id: 'shrine_guard', name: '守りの祠', mods: [{ s: 'dr', v: 30 }], dur: 30, text: '守りの祠：受けるダメージ -30%（30 秒）' },
];
export const EVENTS = {
  ambush: { name: '待ち伏せ', text: '待ち伏せだ！ 前後から群れが来る（経験値 +50%）' },
  shrine: { name: '祠', text: '祠を見つけた' },
  chest: { name: '呪われた宝箱', text: '呪われた宝箱！ 守り手を倒せばレア以上が 3 つ' },
  march: { name: '精鋭の行軍', text: '精鋭の行軍！ 群れの長が 2 体' },
};
const EVENT_CHANCE = 0.035; // 1 ウェーブあたり（ステージ 3 以降・90 秒に 1 回まで）
const EVENT_CD = 90;

const ranged = (id) => ['ranged', 'caster', 'summoner'].includes(MONSTER[id]?.attack);
const melee = (id) => !ranged(id);

export function composeWave(sys, { zone, stage, wave, level, rng }) {
  const t = sys.w.torment || 0;
  const mons = zone.monsters.filter((id) => MONSTER[id]);
  const n = 4 + Math.floor((stage - 1) / 3) + rng.int(0, 1) + (t > 0 ? 1 : 0) + (wave === 3 && stage >= 5 ? 1 : 0);
  const out = [];
  const elitePool = zone.elites?.length ? zone.elites : mons;
  // 出来事
  let ev = null;
  if (stage >= 3 && level >= 5 && sys.game.time - (sys.lastEventAt ?? -EVENT_CD) >= EVENT_CD && rng.chance(EVENT_CHANCE)) {
    ev = rng.pick(['ambush', 'shrine', 'shrine', 'chest', 'march']);
    sys.lastEventAt = sys.game.time;
  }
  const roll = rng.next();
  // 序盤（Lv 3 未満）はエリートを出さない。Lv 8 までは半分
  const early = level < 3 ? 0 : level < 8 ? 0.5 : 1;
  const champChance = (0.06 + stage * 0.004 + t * 0.005) * early;
  const rareChance = (0.04 + stage * 0.003 + t * 0.004) * early;
  if (ev === 'chest') {
    const id = rng.pick(elitePool);
    const aff = pickAffixes(rng, affixCount(level), level);
    for (let i = 0; i < 3; i++) out.push({ id, rank: 'champion', elite: aff, tag: 'chest' });
    for (let i = 0; i < 2; i++) out.push({ id: rng.pick(mons), tag: 'chest' });
  } else if (ev === 'march') {
    for (let k = 0; k < 2; k++) {
      out.push({ id: rng.pick(elitePool), rank: 'rare', elite: pickAffixes(rng, affixCount(level, true), level) });
      for (let i = 0; i < 2; i++) out.push({ id: rng.pick(mons) });
    }
  } else if (roll < champChance) {
    const id = rng.pick(elitePool);
    const aff = pickAffixes(rng, Math.max(1, affixCount(level)), level);
    const k = rng.int(2, 3);
    for (let i = 0; i < k; i++) out.push({ id, rank: 'champion', elite: aff });
  } else if (roll < champChance + rareChance) {
    const id = rng.pick(elitePool);
    out.push({ id, rank: 'rare', elite: pickAffixes(rng, affixCount(level, true), level) });
    const minion = rng.chance(0.6) ? id : rng.pick(mons);
    for (let i = 0; i < 3; i++) out.push({ id: minion });
  } else {
    const kind = rng.next();
    if (kind < 0.25) {
      // 同族の群れ（足の速い・小さい敵なら多め）
      const id = rng.pick(mons);
      const small = (MONSTER[id].size || 1) <= 0.8;
      for (let i = 0; i < n + (small ? 2 : 0); i++) out.push({ id });
    } else if (kind < 0.5 && mons.some(ranged) && mons.some(melee)) {
      // 前衛と後衛
      const front = mons.filter(melee); const back = mons.filter(ranged);
      const nb = Math.max(1, Math.floor(n / 3));
      for (let i = 0; i < n - nb; i++) out.push({ id: rng.pick(front) });
      for (let i = 0; i < nb; i++) out.push({ id: rng.pick(back), dx: 120 });
    }
  }
  while (out.length < n) out.push({ id: rng.pick(mons) });
  if (ev === 'ambush') {
    const k = Math.max(2, Math.floor(n * 0.6));
    for (let i = 0; i < k; i++) out.push({ id: rng.pick(mons.filter(melee).length ? mons.filter(melee) : mons), behind: true, xpMul: 1.5 });
    for (const e of out) e.xpMul = 1.5;
  }
  // ため込み屋
  if (sys.pendingGoblin) {
    const gid = sys.pendingGoblin;
    sys.pendingGoblin = null;
    out.push({ id: gid, rank: 'goblin', dx: 220, lifeMul: GOBLIN.lifeMul, y: 0, tag: 'goblin' });
  }
  if (ev) sys.onMiniEvent?.(ev, rng);
  return out;
}

worldHooks.waveComposer = composeWave;
worldHooks.composerInfo = { SHRINES, EVENTS };
