// スキル。すべてのダメージは「武器ダメージ × dmg%」で計算する（装備が強さの中心になる）。
// 各クラス 12 個: 基本攻撃 2・技 7・強化/召喚 2・奥義 1。各スキルにルーン 4 つ（スキル Lv 3 / 6 / 10 / 15 で順に解放）。
//
// 形（スキル定義）:
// {
//   id, cls, name, desc,            desc の {dmg} {radius} {count} {dur} {cd} {chain} {pierce} {summons} {ttl} {tick} {shield} {b0} {b1} {b2} {curse}
//                                   はレベル・ルーン・補助の刻印を反映した値に置き換わる（skills.js の skillDesc）
//   kind: 'basic'|'active'|'buff'|'summon'|'ult'
//   tags: ['attack','melee','area'], element: 'phys'|'fire'|'cold'|'lightning'|'poison'|'void'
//   unlock: 1,                      解放レベル（このレベルになると Lv1 で自動的に覚える）
//   basic: true,                    基本攻撃（リソースを使わない・常に使える）
//   behavior: 戦闘の動き。combat.js と content/combat/behaviors.js に実装:
//     melee projectile nova rain chain summon buff leap dash beam whirl flurry aura trap turret cloud meteor orbit wave wall
//     curse barrier corpse roll ult_cataclysm ult_barrage ult_starfall ult_deathmarch ult_shadowdance
//   cost: 10,                       リソースの消費（負ならたまる）
//   cd: 0,                          クールダウン（秒）
//   castTime: 0.6,                  動作の長さ（秒）。攻撃速度で縮む
//   dmg: [130, 6],                  [Lv1 の %, 1 レベルごとに +%]（1 ヒットあたり。継続・詠唱の技は 1 回の刻みあたり）
//   range, radius, count, speed, pierce, chain, spread, duration, tick, delay, explode, maxSummons
//   status: { id, chance, dur }     当たったときの状態異常（ignite/freeze/shock/poison/bleed/chill/stun/vuln/weaken）
//   buff: { mods: [{ s, v, per }], dur }   強化（per は 1 レベルごとの増え方）
//   shield: { pct, per, dur }       障壁（最大ライフの pct%、1 レベルごとに +per%）
//   curse: { vuln, weaken, slow, dot, dur }   呪い（被ダメージ増・与ダメージ減・鈍足・毎秒の継続ダメージ）
//   summon: { unit, life, aps, range, count, ttl, ... }   召喚物（unit は minion.<unit> の絵）
//   burn: { dur, tick, mult }       着弾した所が燃える（毎刻み 武器ダメージ × dmg% × mult）
//   extra: { ... }                  動きごとの細かい値（homing, critBonus, corpsePct など）
//   auto: 'always'|'elite'|...      自動で使う条件の既定値
//   runes: [{ id, name, desc, mod }]  1 つだけ選べる変化（mod は skills.js の applyMod の形）
// }
// スキルのレベルは 1〜20（装備の「スキルレベル +N」で上限を超えられる）。
// 熟練度（使うほど上がる 0〜10）: 1 段ごとにそのスキルのダメージ +4%、5 段と 10 段で特別な効果（MASTERY_BONUS）。

export const SKILL_MAX_LEVEL = 20;
/** ルーンが解放されるスキルのレベル（runes[0..3]） */
export const RUNE_LEVELS = [3, 6, 10, 15];
export const KIND_NAMES = { basic: '基本攻撃', active: '技', buff: '強化', summon: '召喚', ult: '奥義' };

// ---------------- 熟練度
export const MASTERY_MAX = 10;
/** その段に必要な熟練度の経験（累計）。0 段目は 0 */
export const MASTERY_XP = [0, 300, 900, 2000, 3800, 6500, 10500, 16000, 23500, 33500, 46500];
export const MASTERY_DMG = 4; // 1 段ごとのダメージ +%
/** 5 段・10 段の特別な効果（スキルの種類ごと）。mod は applyMod の形 */
export const MASTERY_BONUS = {
  basic: { m5: { castMul: 0.9 }, d5: '動作が 10% 速くなる', m10: { repeatChance: 0.15 }, d10: '15% の確率でもう一度当たる' },
  active: { m5: { cdMul: 0.85, costMul: 0.85 }, d5: '待ち時間と消費 -15%', m10: { dmgMul: 1.2, radius: 1.15 }, d10: 'ダメージ ×1.2・範囲 +15%' },
  buff: { m5: { buffDurMul: 1.25 }, d5: '効果時間 +25%', m10: { buffMul: 1.3, shieldMul: 1.3 }, d10: '効果の大きさ +30%' },
  summon: { m5: { summonLifeMul: 1.3 }, d5: '召喚物のライフ +30%', m10: { maxSummons: 1 }, d10: '召喚数 +1' },
  ult: { m5: { cdMul: 0.85 }, d5: '待ち時間 -15%', m10: { dmgMul: 1.4 }, d10: 'ダメージ ×1.4' },
};

const R = (id, name, desc, mod) => ({ id, name, desc, mod });
const FIRE = (ch = 0.25) => ({ element: 'fire', status: { id: 'ignite', chance: ch } });
const COLD = (ch = 0.15) => ({ element: 'cold', status: { id: 'freeze', chance: ch, dur: 1 } });
const LIGHT = (ch = 0.3) => ({ element: 'lightning', status: { id: 'shock', chance: ch } });
const POIS = (ch = 0.4) => ({ element: 'poison', status: { id: 'poison', chance: ch } });

export const SKILLS = [
  // =====================================================================
  // 剣闘士（怒り）: 近接の範囲・跳躍・雄叫び
  // =====================================================================
  {
    id: 'w_slash', cls: 'warrior', kind: 'basic', name: '強打', desc: '目の前の敵を武器で叩き、半径 {radius} の範囲に {dmg} のダメージ。怒り +12。',
    tags: ['attack', 'melee'], element: 'phys', unlock: 1, basic: true, behavior: 'melee',
    cost: -12, cd: 0, castTime: 0.55, dmg: [240, 11], range: 110, radius: 70,
    runes: [
      R('fire', '燃える刃', '火炎ダメージになり、25% の確率で炎上させる', FIRE(0.25)),
      R('wide', '薙ぎ払い', '当たる範囲が 2 倍、ダメージ ×0.85', { radius: 2, dmgMul: 0.85 }),
      R('rage', '怒りの一撃', '怒りの回復が 2 倍（+24）', { costAdd: -12 }),
      R('quake', '地鳴り', '20% の確率で敵を 0.8 秒気絶させる', { status: { id: 'stun', chance: 0.2, dur: 0.8 } }),
    ],
  },
  {
    id: 'w_cleave', cls: 'warrior', kind: 'active', name: '大旋斬', desc: '武器を振り回し、半径 {radius} の敵すべてに {dmg} のダメージ。',
    tags: ['attack', 'melee', 'area'], element: 'phys', unlock: 1, behavior: 'nova',
    cost: 14, cd: 0, castTime: 0.7, dmg: [245, 12], radius: 170,
    runes: [
      R('quake', '地割れ', '範囲 +40%', { radius: 1.4 }),
      R('bleed', '血の旋風', '50% の確率で出血させる（4 秒の継続ダメージ）', { status: { id: 'bleed', chance: 0.5 } }),
      R('ice', '凍える刃', '冷気ダメージになり、25% の確率で凍結させる', COLD(0.25)),
      R('pull', '引き寄せ', '斬る前に半径 270 の敵を引き寄せる。範囲 +15%', { radius: 1.15, extra: { pull: 270 } }),
    ],
  },
  {
    id: 'w_leap', cls: 'warrior', kind: 'active', name: '跳躍斬', desc: '最大 {range} 先の敵へ跳びかかり、着地点の半径 {radius} に {dmg} のダメージ。30% の確率で 0.8 秒気絶。',
    tags: ['attack', 'melee', 'area', 'movement'], element: 'phys', unlock: 3, behavior: 'leap',
    cost: 15, cd: 5, castTime: 0.7, dmg: [270, 12], range: 480, radius: 140, status: { id: 'stun', chance: 0.3, dur: 0.8 },
    runes: [
      R('quake', '大地割り', '着地の範囲 +60%', { radius: 1.6 }),
      R('fire', '炎の着地', '火炎ダメージになり、着地点が 3 秒燃える（0.5 秒ごとに 20%）', { element: 'fire', burn: { dur: 3, tick: 0.5, mult: 0.2 } }),
      R('twice', '身軽な跳躍', '待ち時間 -40%、ダメージ ×0.75', { cdMul: 0.6, dmgMul: 0.75 }),
      R('rage', '怒りの跳躍', '怒りを使わず、着地で怒り +20', { costMul: 0, extra: { resGain: 20 } }),
    ],
  },
  {
    id: 'w_shout', cls: 'warrior', kind: 'buff', name: '鬨の声', desc: '{dur} 秒間、ダメージ +{b0}%・アーマー +{b1}%。叫ぶと怒り +30。',
    tags: ['buff'], element: 'phys', unlock: 6, behavior: 'buff',
    cost: -30, cd: 20, castTime: 0.4, buff: { mods: [{ s: 'inc_dmg', v: 20, per: 1.5 }, { s: 'inc_armor', v: 30, per: 2 }], dur: 8 },
    runes: [
      R('long', '長い残響', '効果時間 +50%', { buffDurMul: 1.5 }),
      R('blood', '血の滾り', '効果中、ライフ吸収 +2%', { buffMods: [{ s: 'leech', v: 2 }] }),
      R('fear', '威圧', '叫ぶと半径 260 の敵を 1.5 秒気絶させる', { extra: { castStatus: { id: 'stun', r: 260, dur: 1.5 } } }),
      R('speed', '戦の太鼓', '効果中、攻撃速度 +15%', { buffMods: [{ s: 'attack_speed', v: 15 }] }),
    ],
  },
  {
    id: 'w_bash', cls: 'warrior', kind: 'basic', name: '盾打ち', desc: '重い一撃で {dmg} のダメージ。15% の確率で 1 秒気絶。怒り +12。',
    tags: ['attack', 'melee'], element: 'phys', unlock: 11, basic: true, behavior: 'melee',
    cost: -12, cd: 0, castTime: 0.7, dmg: [255, 10.5], range: 110, radius: 60, status: { id: 'stun', chance: 0.15, dur: 1 },
    runes: [
      R('shock', '雷の盾', '雷撃ダメージになり、30% の確率で感電させる', LIGHT(0.3)),
      R('heavy', '重い一撃', 'ダメージ ×1.35、動作 +25%', { dmgMul: 1.35, castMul: 1.25 }),
      R('guard', '守りの構え', '当たるたびに 4 秒間ブロック率 +2%（5 回まで重なる）', { extra: { onHitBuff: { id: 'w_bash_guard', name: '守りの構え', mods: [{ s: 'block', v: 2 }], dur: 4, max: 5 } } }),
      R('wide', '盾の薙ぎ', '範囲 ×2.2', { radius: 2.2 }),
    ],
  },
  {
    id: 'w_whirl', cls: 'warrior', kind: 'active', name: '旋風', desc: '{dur} 秒間回転しながら進み、{tick} 秒ごとに半径 {radius} の敵に {dmg} のダメージ。',
    tags: ['attack', 'melee', 'area', 'channel'], element: 'phys', unlock: 14, behavior: 'whirl',
    cost: 30, cd: 0, castTime: 0.3, duration: 2.4, tick: 0.3, dmg: [75, 3.6], radius: 150,
    runes: [
      R('fire', '炎の竜巻', '火炎ダメージになり、20% の確率で炎上させる', FIRE(0.2)),
      R('long', '終わらぬ回転', '回転の時間 +50%、消費 +20', { durMul: 1.5, costAdd: 20 }),
      R('pull', '吸い込み', '範囲 +30%、回るたびに周りの敵を引き寄せる', { radius: 1.3, extra: { pull: 200 } }),
      R('blade', '刃の嵐', '回転の終わりに半径 220 へ衝撃波（武器ダメージの 200%）', { extra: { finisher: 2.0 } }),
    ],
  },
  {
    id: 'w_quake', cls: 'warrior', kind: 'active', name: '地裂き', desc: '地面を割る衝撃波を {range} 先まで走らせ、通り道の敵すべてに {dmg} のダメージ。',
    tags: ['attack', 'melee', 'area'], element: 'phys', unlock: 18, behavior: 'wave',
    cost: 22, cd: 4, castTime: 0.6, dmg: [240, 12], range: 600, radius: 70, speed: 900,
    runes: [
      R('triple', '三つ裂き', '3 方向に走る。1 つあたり ×0.7', { countAdd: 2, dmgMul: 0.7, spread: 0.7 }),
      R('fire', '溶岩の裂け目', '火炎ダメージになり、30% の確率で炎上させる', FIRE(0.3)),
      R('stun', '震動', '40% の確率で 1 秒気絶させる', { status: { id: 'stun', chance: 0.4, dur: 1 } }),
      R('long', '長い亀裂', '届く距離 +60%、ダメージ +15%', { rangeMul: 1.6, dmgMul: 1.15 }),
    ],
  },
  {
    id: 'w_charge', cls: 'warrior', kind: 'active', name: '猛進', desc: '{range} 先まで突進し、通り抜けた敵すべてに {dmg} のダメージ。',
    tags: ['attack', 'melee', 'movement'], element: 'phys', unlock: 23, behavior: 'dash',
    cost: 20, cd: 5, castTime: 0.45, dmg: [320, 15], range: 420, radius: 70,
    runes: [
      R('stun', '突き飛ばし', '当たった敵を 1 秒気絶させる', { status: { id: 'stun', chance: 1, dur: 1 } }),
      R('fire', '炎の突進', '火炎ダメージになり、50% の確率で炎上させる', FIRE(0.5)),
      R('return', '往復', '突進のあと元の位置へ戻りながら、もう一度当てる（×0.7）', { extra: { back: 0.7 } }),
      R('armor', '鋼の突進', '突進のあと 4 秒間、受けるダメージ -20%', { extra: { afterBuff: { name: '鋼の突進', mods: [{ s: 'dr', v: 20 }], dur: 4 } } }),
    ],
  },
  {
    id: 'w_warcry', cls: 'warrior', kind: 'buff', name: '不屈の雄叫び', desc: '最大ライフの {shield}% の障壁を {dur} 秒張り、全耐性 +{b0}。',
    tags: ['buff'], element: 'phys', unlock: 8, behavior: 'barrier',
    cost: 0, cd: 25, castTime: 0.4, shield: { pct: 25, per: 1, dur: 10 }, buff: { mods: [{ s: 'res_all', v: 10, per: 0.5 }], dur: 10 },
    runes: [
      R('big', '鋼の意志', '障壁 +50%', { shieldMul: 1.5 }),
      R('regen', '癒やしの雄叫び', '効果中、毎秒最大ライフの 3% を回復', { buffMods: [{ s: 'life_regen_pct', v: 3 }] }),
      R('rage', '戦意の高揚', '効果中、ダメージ +15%', { buffMods: [{ s: 'inc_dmg', v: 15 }] }),
      R('burst', '砕ける障壁', '障壁が壊れると半径 220 の敵に武器ダメージの 300%', { extra: { shieldBurst: 3 } }),
    ],
  },
  {
    id: 'w_rend', cls: 'warrior', kind: 'active', name: '引き裂き', desc: '半径 {radius} を切り裂き {dmg} のダメージ。必ず強い出血（通常の 2.5 倍）を与える。',
    tags: ['attack', 'melee', 'area', 'dot'], element: 'phys', unlock: 30, behavior: 'melee',
    cost: 15, cd: 0, castTime: 0.6, dmg: [190, 8.5], range: 120, radius: 110, status: { id: 'bleed', chance: 1 }, extra: { bleedMul: 2.5 },
    runes: [
      R('deep', '深い傷', '出血のダメージ ×1.6', { bleedMul: 1.6 }),
      R('wide', '広い薙ぎ', '範囲 +60%', { radius: 1.6 }),
      R('poison', '毒の刃', '毒ダメージになり、出血の代わりに 2 倍の強さの毒を 100% の確率で与える', { element: 'poison', statusReplace: [{ id: 'poison', chance: 1 }], extra: { poisonMul: 2 } }),
      R('leech', '血を啜る', '与えたダメージの 3% をライフに変える', { extra: { leech: 0.03 } }),
    ],
  },
  {
    id: 'w_axes', cls: 'warrior', kind: 'active', name: '回旋斧', desc: '{count} 本の斧が {dur} 秒間まわりを回り、触れた敵に {dmg} のダメージ（同じ敵には {tick} 秒ごと）。',
    tags: ['attack', 'area', 'projectile'], element: 'phys', unlock: 38, behavior: 'orbit',
    cost: 30, cd: 10, castTime: 0.5, dmg: [95, 4.5], count: 3, radius: 130, duration: 6, tick: 0.35,
    runes: [
      R('more', '斧の群れ', '斧 +2、1 本あたり ×0.8', { countAdd: 2, dmgMul: 0.8 }),
      R('fire', '灼熱の斧', '火炎ダメージになり、30% の確率で炎上させる', FIRE(0.3)),
      R('wide', '大きな輪', '回る輪の大きさ +40%', { radius: 1.4 }),
      R('long', '長い回転', '回る時間 +60%', { durMul: 1.6 }),
    ],
  },
  {
    id: 'w_ult', cls: 'warrior', kind: 'ult', name: '天崩し', desc: '【奥義】天高く跳び、着地の衝撃で半径 {radius} に {dmg} のダメージと 2 秒の気絶。続けて余震が 3 回（各 30%）。',
    tags: ['attack', 'melee', 'area', 'ult'], element: 'phys', unlock: 50, behavior: 'ult_cataclysm', auto: 'elite',
    cost: 0, cd: 90, castTime: 1.2, dmg: [2200, 110], range: 600, radius: 360, status: { id: 'stun', chance: 1, dur: 2 },
    runes: [
      R('fire', '灼熱の天崩し', '火炎ダメージになり、着地点が 5 秒燃える', { element: 'fire', burn: { dur: 5, tick: 0.5, mult: 0.06 } }),
      R('quick', '即座の天崩し', '待ち時間 -30%', { cdMul: 0.7 }),
      R('huge', '大天崩し', '範囲 +40%、ダメージ +20%', { radius: 1.4, dmgMul: 1.2 }),
      R('rage', '怒りの解放', '使うと怒りが満タンになり、10 秒間ダメージ +25%', { extra: { fillRes: true, afterBuff: { name: '怒りの解放', mods: [{ s: 'inc_dmg', v: 25 }], dur: 10 } } }),
    ],
  },

  // =====================================================================
  // 狩人（集中）: 矢・罠・砲台・相棒の獣
  // =====================================================================
  {
    id: 'r_shot', cls: 'ranger', kind: 'basic', name: '速射', desc: '矢を放ち {dmg} のダメージ。',
    tags: ['attack', 'projectile'], element: 'phys', unlock: 1, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.5, dmg: [122, 5.5], range: 650, speed: 1300, count: 1, pierce: 0,
    runes: [
      R('split', '分かれ矢', '矢が 3 本になる（1 本 ×0.7）', { count: 3, dmgMul: 0.7 }),
      R('fire', '火矢', '火炎ダメージになり、20% の確率で炎上させる', FIRE(0.2)),
      R('pierce', '貫き矢', '貫通 +2、ダメージ +10%', { pierce: 2, dmgMul: 1.1 }),
      R('focus', '集中の矢', '当たるたびに集中 +2', { extra: { resOnHit: 2 } }),
    ],
  },
  {
    id: 'r_multishot', cls: 'ranger', kind: 'active', name: '扇射ち', desc: '{count} 本の矢を扇状に放ち、それぞれ {dmg} のダメージ。貫通 {pierce}。',
    tags: ['attack', 'projectile', 'area'], element: 'phys', unlock: 1, behavior: 'projectile',
    cost: 25, cd: 0, castTime: 0.65, dmg: [140, 7], range: 650, speed: 1200, count: 5, pierce: 1, spread: 0.5,
    runes: [
      R('frost', '凍て矢', '冷気ダメージになり、15% の確率で凍結させる', COLD(0.15)),
      R('more', '矢の扇', '矢 +3、1 本あたり ×0.85', { countAdd: 3, dmgMul: 0.85 }),
      R('burst', '炸裂矢', '当たると半径 70 で小さく爆発する（×0.6）', { explode: 70 }),
      R('narrow', '集束', '広がりが半分になり、ダメージ +25%', { spreadMul: 0.5, dmgMul: 1.25 }),
    ],
  },
  {
    id: 'r_trap', cls: 'ranger', kind: 'active', name: '炸裂罠', desc: '罠を投げて仕掛ける（同時に {count} 個まで、{dur} 秒）。敵が踏むと半径 {radius} に {dmg} のダメージ。',
    tags: ['attack', 'area', 'trap'], element: 'phys', unlock: 3, behavior: 'trap',
    cost: 15, cd: 3, castTime: 0.4, dmg: [320, 15], range: 380, radius: 150, count: 3, duration: 12, delay: 0.4,
    runes: [
      R('frost', '氷の罠', '冷気ダメージになり、40% の確率で凍結させる', COLD(0.4)),
      R('poison', '毒の罠', '毒ダメージになり、爆発の後に毒の霧が 4 秒残る', { element: 'poison', status: { id: 'poison', chance: 0.5 }, extra: { leaveCloud: { dur: 4, tick: 0.5, mult: 0.12 } } }),
      R('chain', '連鎖罠', '爆発が近くの罠も起爆させ、置ける数 +2', { countAdd: 2, extra: { chainTrap: true } }),
      R('big', '大罠', '範囲 +50%、ダメージ +20%、置ける数 -1', { radius: 1.5, dmgMul: 1.2, countAdd: -1 }),
    ],
  },
  {
    id: 'r_volley', cls: 'ranger', kind: 'active', name: '矢の雨', desc: '{count} 本の矢を空から降らせ、それぞれ半径 {radius} に {dmg} のダメージ。',
    tags: ['attack', 'area', 'projectile'], element: 'phys', unlock: 6, behavior: 'rain',
    cost: 30, cd: 4, castTime: 0.6, dmg: [190, 9], range: 600, radius: 110, count: 6, delay: 0.45,
    runes: [
      R('fire', '火の雨', '火炎ダメージになり、25% の確率で炎上させる', FIRE(0.25)),
      R('frost', '氷の雨', '冷気ダメージになり、15% の確率で凍結させる', COLD(0.15)),
      R('dense', '豪雨', '矢 +4、1 本あたり ×0.8', { countAdd: 4, dmgMul: 0.8 }),
      R('long', '長雨', '3 回に分けて降り続ける（1 回あたり ×0.6）', { dmgMul: 0.6, extra: { waves: 3 } }),
    ],
  },
  {
    id: 'r_beast', cls: 'ranger', kind: 'summon', name: '狩りの相棒', desc: '狼の相棒を {summons} 体呼ぶ。狼は素早く噛みつき、武器ダメージの {dmgp} のダメージ。',
    tags: ['minion', 'summon'], element: 'phys', unlock: 9, behavior: 'summon',
    cost: 30, cd: 6, castTime: 0.6, dmg: [105, 5], maxSummons: 1, summon: { unit: 'wolf', life: 3, aps: 1.4, range: 80, status: { id: 'bleed', chance: 0.2 } },
    runes: [
      R('hawk', '鷹', '空を飛ぶ鷹になり、380 離れた所から急降下で攻撃する（ライフ -33%）', { summon: { unit: 'hawk', range: 380, fly: true, life: 2 } }),
      R('boar', '猪', 'ライフ ×2 の猪になり、敵の攻撃を引きつける', { summon: { unit: 'boar', life: 6, aps: 0.9, taunt: true } }),
      R('pack', '狼の群れ', '狼が 2 体になる（1 体あたり ×0.6）', { maxSummons: 1, dmgMul: 0.6 }),
      R('spider', '毒蜘蛛', '毒を吐く蜘蛛になり、50% の確率で毒を与える', { element: 'poison', summon: { unit: 'spider', range: 260, status: { id: 'poison', chance: 0.5 } } }),
    ],
  },
  {
    id: 'r_snipe', cls: 'ranger', kind: 'basic', name: '狙い撃ち', desc: 'じっくり狙い、{dmg} のダメージ。貫通 {pierce}、当たると半径 {explode} で弾ける。クリティカル率 +15%。',
    tags: ['attack', 'projectile'], element: 'phys', unlock: 11, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.85, dmg: [255, 12], range: 700, speed: 1900, count: 1, pierce: 3, explode: 160, extra: { critBonus: 0.15 },
    runes: [
      R('heavy', '重い矢', 'ダメージ ×1.3、動作 +20%', { dmgMul: 1.3, castMul: 1.2 }),
      R('frost', '凍てる狙撃', '冷気ダメージになり、15% の確率で凍結させる', COLD(0.15)),
      R('explode', '炸裂弾', '当たると半径 90 で爆発する（×0.6）', { explode: 90 }),
      R('quick', '早撃ち', '動作 ×0.8、ダメージ ×0.85', { castMul: 0.8, dmgMul: 0.85 }),
    ],
  },
  {
    id: 'r_focus', cls: 'ranger', kind: 'buff', name: '鷹の目', desc: '{dur} 秒間、クリティカル率 +{b0}%・攻撃速度 +{b1}%。',
    tags: ['buff'], element: 'phys', unlock: 14, behavior: 'buff',
    cost: 0, cd: 20, castTime: 0.3, buff: { mods: [{ s: 'crit_chance', v: 8, per: 0.3 }, { s: 'attack_speed', v: 12, per: 0.5 }], dur: 8 },
    runes: [
      R('long', '長い集中', '効果時間 +50%', { buffDurMul: 1.5 }),
      R('crit', '急所を見抜く', '効果中、クリティカルダメージ +40%', { buffMods: [{ s: 'crit_damage', v: 40 }] }),
      R('regen', '集中の泉', '効果中、集中の回復 +50%', { buffMods: [{ s: 'resource_regen', v: 50 }] }),
      R('pierce', '射抜く目', '効果中、貫通 +2', { buffMods: [{ s: 'pierce', v: 2 }] }),
    ],
  },
  {
    id: 'r_frost', cls: 'ranger', kind: 'active', name: '氷晶の矢', desc: '氷の矢を放ち {dmg} の冷気ダメージ。当たると半径 {explode} で砕け散る。20% の確率で凍結。',
    tags: ['attack', 'projectile', 'area'], element: 'cold', unlock: 18, behavior: 'projectile',
    cost: 20, cd: 0, castTime: 0.6, dmg: [185, 8.5], range: 650, speed: 1200, explode: 130, status: { id: 'freeze', chance: 0.2, dur: 1 },
    runes: [
      R('shatter', '砕ける氷', '凍結・冷却中の敵へのダメージ ×1.5', { extra: { shatter: 1.5 } }),
      R('nova', '冷気の爆散', '砕ける範囲 +80%', { explodeMul: 1.8 }),
      R('storm', '雷の矢', '雷撃ダメージになり、30% の確率で感電させる', LIGHT(0.3)),
      R('triple', '三連氷矢', '矢が 3 本になる（1 本 ×0.65）', { count: 3, dmgMul: 0.65 }),
    ],
  },
  {
    id: 'r_turret', cls: 'ranger', kind: 'active', name: '弩の砲台', desc: '弩の砲台を {summons} 台まで置く（{ttl} 秒）。砲台は {range} 先まで撃ち、1 発で {dmg} のダメージ。',
    tags: ['attack', 'minion', 'projectile', 'trap'], element: 'phys', unlock: 23, behavior: 'turret',
    cost: 35, cd: 10, castTime: 0.6, dmg: [85, 4], range: 600, maxSummons: 2, summon: { unit: 'turret', life: 4, aps: 1.5, range: 600, ttl: 15, stationary: true },
    runes: [
      R('fire', '火の砲台', '火炎ダメージになり、20% の確率で炎上させる', FIRE(0.2)),
      R('multi', '連弩', '一度に 3 本撃つ（1 本 ×0.6）', { dmgMul: 0.6, summon: { multi: 3 } }),
      R('frost', '氷の砲台', '冷気ダメージになり、15% の確率で凍結させる', COLD(0.15)),
      R('long', '頑丈な砲台', '置いておける時間 +60%、ライフ ×2', { summon: { ttlMul: 1.6, lifeMul: 2 } }),
    ],
  },
  {
    id: 'r_roll', cls: 'ranger', kind: 'active', name: '後転射ち', desc: '後ろへ転がって間合いを取り、{count} 本の矢を放つ。それぞれ {dmg} のダメージ。',
    tags: ['attack', 'projectile', 'movement'], element: 'phys', unlock: 29, behavior: 'roll',
    cost: 15, cd: 6, castTime: 0.45, dmg: [125, 6], range: 650, count: 4, spread: 0.4, speed: 1300,
    runes: [
      R('far', '大跳び', '下がる距離 ×2、待ち時間 -20%', { cdMul: 0.8, extra: { rollDist: 2 } }),
      R('fire', '火の置き矢', '火炎ダメージになり、25% の確率で炎上させる', FIRE(0.25)),
      R('trap', '置き土産', '元いた場所に炸裂罠を残す（武器ダメージの 260%）', { extra: { leaveTrap: 2.6 } }),
      R('more', '連射', '矢 +3、1 本あたり ×0.85', { countAdd: 3, dmgMul: 0.85 }),
    ],
  },
  {
    id: 'r_chain', cls: 'ranger', kind: 'active', name: '稲妻矢', desc: '雷の矢が {chain} 回跳ね、当たるたびに {dmg} の雷撃ダメージ（跳ねるたびに -15%）。',
    tags: ['attack', 'projectile'], element: 'lightning', unlock: 36, behavior: 'chain',
    cost: 25, cd: 0, castTime: 0.6, dmg: [160, 7.5], range: 600, chain: 5, status: { id: 'shock', chance: 0.2 },
    runes: [
      R('fork', '枝分かれ', '跳ねる回数 +3、1 回あたり ×0.85', { chain: 3, dmgMul: 0.85 }),
      R('fire', '炎の連鎖', '火炎ダメージになり、25% の確率で炎上させる', FIRE(0.25)),
      R('stun', '雷鳴', '25% の確率で 0.6 秒気絶させる', { status: { id: 'stun', chance: 0.25, dur: 0.6 } }),
      R('return', '帰る雷', '跳ね終わると集中 +10', { extra: { resGain: 10 } }),
    ],
  },
  {
    id: 'r_ult', cls: 'ranger', kind: 'ult', name: '星落としの矢', desc: '【奥義】空へ矢を放ち、2 秒かけて半径 {radius} に {count} 本の流星の矢を降らせる。1 本 {dmg} のダメージ。',
    tags: ['attack', 'projectile', 'area', 'ult'], element: 'phys', unlock: 50, behavior: 'ult_barrage', auto: 'elite',
    cost: 0, cd: 90, castTime: 1.0, dmg: [170, 8.5], range: 650, radius: 420, count: 30, duration: 2,
    runes: [
      R('fire', '燃える星', '火炎ダメージになり、30% の確率で炎上させる', FIRE(0.3)),
      R('frost', '凍てつく星', '冷気ダメージになり、25% の確率で凍結させる', COLD(0.25)),
      R('more', '星の嵐', '矢 +15、1 本あたり ×0.85', { countAdd: 15, dmgMul: 0.85 }),
      R('huge', '天の弓', '範囲 +30%、ダメージ +15%', { radius: 1.3, dmgMul: 1.15 }),
    ],
  },

  // =====================================================================
  // 魔導士（マナ）: 火・氷・雷の呪文
  // =====================================================================
  {
    id: 's_bolt', cls: 'sorcerer', kind: 'basic', name: '魔弾', desc: '魔力の弾で {dmg} の雷撃ダメージ。',
    tags: ['spell', 'projectile'], element: 'lightning', unlock: 1, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.5, dmg: [145, 7], range: 650, speed: 1100, count: 1,
    runes: [
      R('fire', '火の玉', '火炎ダメージになり、当たると半径 80 で小さく爆発する', { element: 'fire', explode: 80 }),
      R('frost', '氷の礫', '冷気ダメージになり、10% の確率で凍結させる', COLD(0.1)),
      R('split', '三連魔弾', '弾が 3 つになる（1 つ ×0.7）', { count: 3, dmgMul: 0.7 }),
      R('chain', '跳ね返り', '当たると近くの敵へ 1 回跳ねる（×0.7）', { extra: { chainOnHit: 1 } }),
    ],
  },
  {
    id: 's_nova', cls: 'sorcerer', kind: 'active', name: '氷結の環', desc: '周りに冷気を放ち、半径 {radius} に {dmg} のダメージ。30% の確率で 1 秒凍結。',
    tags: ['spell', 'area'], element: 'cold', unlock: 1, behavior: 'nova',
    cost: 30, cd: 2, castTime: 0.6, dmg: [210, 10], radius: 220, status: { id: 'freeze', chance: 0.3, dur: 1 },
    runes: [
      R('storm', '雷の環', '雷撃ダメージになり、40% の確率で感電させる', LIGHT(0.4)),
      R('fire', '炎の環', '火炎ダメージになり、40% の確率で炎上させる', FIRE(0.4)),
      R('wide', '大環', '範囲 +40%、ダメージ ×0.9', { radius: 1.4, dmgMul: 0.9 }),
      R('twin', '二重環', '0.5 秒後にもう一度広がる（×0.6）', { extra: { repeat: { delay: 0.5, mult: 0.6 } } }),
    ],
  },
  {
    id: 's_fireball', cls: 'sorcerer', kind: 'active', name: '火球', desc: '火球を放ち {dmg} の火炎ダメージ。当たると半径 {explode} で爆発する。30% の確率で炎上。',
    tags: ['spell', 'projectile', 'area'], element: 'fire', unlock: 3, behavior: 'projectile',
    cost: 16, cd: 0, castTime: 0.7, dmg: [225, 10], range: 650, speed: 900, explode: 120, status: { id: 'ignite', chance: 0.3 },
    runes: [
      R('big', '大火球', '爆発の範囲 +50%、ダメージ +15%、弾が遅くなる', { explodeMul: 1.5, dmgMul: 1.15, speedMul: 0.7 }),
      R('split', '三つ火', '火球が 3 つになる（1 つ ×0.6）', { count: 3, dmgMul: 0.6 }),
      R('frost', '氷球', '冷気ダメージになり、20% の確率で凍結させる', COLD(0.2)),
      R('seek', '追い火', '火球が敵を追いかけ、ダメージ +5%', { dmgMul: 1.05, extra: { homing: true } }),
    ],
  },
  {
    id: 's_chain', cls: 'sorcerer', kind: 'active', name: '連鎖雷', desc: '雷が {chain} 回跳ね、当たるたびに {dmg} の雷撃ダメージ（跳ねるたびに -15%）。30% の確率で感電。',
    tags: ['spell'], element: 'lightning', unlock: 7, behavior: 'chain',
    cost: 22, cd: 0, castTime: 0.6, dmg: [160, 8], range: 600, chain: 5, status: { id: 'shock', chance: 0.3 },
    runes: [
      R('fork', '枝分かれ', '跳ねる回数 +3、1 回あたり ×0.85', { chain: 3, dmgMul: 0.85 }),
      R('fire', '炎の鎖', '火炎ダメージになり、30% の確率で炎上させる', FIRE(0.3)),
      R('stun', '雷撃の衝撃', '25% の確率で 0.6 秒気絶させる', { status: { id: 'stun', chance: 0.25, dur: 0.6 } }),
      R('overload', '過負荷', '跳ねるたびにダメージが 10% 増える', { extra: { chainGrow: 1.1 } }),
    ],
  },
  {
    id: 's_armor', cls: 'sorcerer', kind: 'buff', name: '氷の鎧', desc: '最大ライフの {shield}% の氷の障壁を {dur} 秒まとい、アーマー +{b0}%。攻撃してきた敵を冷却する。',
    tags: ['buff', 'spell'], element: 'cold', unlock: 4, behavior: 'barrier',
    cost: 30, cd: 18, castTime: 0.4, shield: { pct: 35, per: 1.2, dur: 12 }, buff: { mods: [{ s: 'inc_armor', v: 40, per: 2 }], dur: 12 }, extra: { chillAttackers: true },
    runes: [
      R('storm', '雷の鎧', '攻撃してきた敵に武器ダメージの 60% の雷撃を返す。雷撃耐性 +20', { buffMods: [{ s: 'res_lightning', v: 20 }], extra: { retaliate: { el: 'lightning', mult: 0.6 } } }),
      R('fire', '炎の鎧', '攻撃してきた敵に武器ダメージの 60% の火炎を返す。火炎耐性 +20', { buffMods: [{ s: 'res_fire', v: 20 }], extra: { retaliate: { el: 'fire', mult: 0.6 } } }),
      R('big', '厚い氷', '障壁 +50%', { shieldMul: 1.5 }),
      R('quick', '素早い詠唱', '待ち時間 -30%', { cdMul: 0.7 }),
    ],
  },
  {
    id: 's_flame', cls: 'sorcerer', kind: 'basic', name: '火の礫', desc: '燃える礫を放ち {dmg} の火炎ダメージ。当たると半径 {explode} で弾ける。20% の確率で炎上。',
    tags: ['spell', 'projectile'], element: 'fire', unlock: 10, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.55, dmg: [140, 7], range: 650, speed: 1000, explode: 90, status: { id: 'ignite', chance: 0.2 },
    runes: [
      R('big', '大きな礫', '弾ける範囲 ×2、動作 +20%', { explodeMul: 2, castMul: 1.2 }),
      R('cold', '氷の礫', '冷気ダメージになり、10% の確率で凍結させる', COLD(0.1)),
      R('triple', '三つ礫', '礫が 3 つになる（1 つ ×0.65）', { count: 3, dmgMul: 0.65 }),
      R('seek', '追い礫', '礫が敵を追いかけ、ダメージ +5%', { dmgMul: 1.05, extra: { homing: true } }),
    ],
  },
  {
    id: 's_beam', cls: 'sorcerer', kind: 'active', name: '灼光線', desc: '{dur} 秒間、{range} 先まで届く光線を放ち、{tick} 秒ごとに線上の敵すべてに {dmg} の火炎ダメージ。',
    tags: ['spell', 'channel'], element: 'fire', unlock: 13, behavior: 'beam',
    cost: 35, cd: 3, castTime: 0.2, duration: 1.5, tick: 0.15, dmg: [56, 2.6], range: 600, radius: 40, status: { id: 'ignite', chance: 0.1 },
    runes: [
      R('frost', '凍える光線', '冷気ダメージになり、敵の動きを 2 秒間 35% 遅くする', { element: 'cold', status: { id: 'chill', chance: 1 } }),
      R('storm', '雷の光線', '雷撃ダメージになり、20% の確率で感電させる', LIGHT(0.2)),
      R('wide', '太い光線', '光線の太さ ×2、ダメージ ×0.85', { radius: 2, dmgMul: 0.85 }),
      R('long', '長い照射', '照射の時間 +60%、消費 +15', { durMul: 1.6, costAdd: 15 }),
    ],
  },
  {
    id: 's_meteor', cls: 'sorcerer', kind: 'active', name: '隕石', desc: '1 秒後に隕石を落とし、半径 {radius} に {dmg} の火炎ダメージ。落ちた所は 3 秒燃える。',
    tags: ['spell', 'area'], element: 'fire', unlock: 17, behavior: 'meteor',
    cost: 45, cd: 8, castTime: 0.8, dmg: [540, 25], range: 650, radius: 170, delay: 1.0, burn: { dur: 3, tick: 0.5, mult: 0.12 },
    runes: [
      R('comet', '彗星', '冷気ダメージになり、50% の確率で凍結させる', { element: 'cold', status: { id: 'freeze', chance: 0.5, dur: 1.2 } }),
      R('swarm', '流星群', '小さな隕石を 3 つ落とす（1 つ ×0.45）', { countAdd: 2, dmgMul: 0.45 }),
      R('quick', '早い落下', '落ちるまで ×0.4、待ち時間 -20%', { delayMul: 0.4, cdMul: 0.8 }),
      R('big', '巨大隕石', '範囲 ×1.5、ダメージ ×1.25、待ち時間 +40%', { radius: 1.5, dmgMul: 1.25, cdMul: 1.4 }),
    ],
  },
  {
    id: 's_blizzard', cls: 'sorcerer', kind: 'active', name: '吹雪', desc: '半径 {radius} に {dur} 秒間吹雪を起こし、{tick} 秒ごとに {dmg} の冷気ダメージ。中の敵は冷却される。',
    tags: ['spell', 'area', 'dot'], element: 'cold', unlock: 22, behavior: 'cloud',
    cost: 40, cd: 6, castTime: 0.6, dmg: [62, 3], range: 600, radius: 180, duration: 5, tick: 0.5, status: { id: 'chill', chance: 1 },
    runes: [
      R('storm', '雷雨', '雷撃ダメージになり、20% の確率で感電させる', LIGHT(0.2)),
      R('wide', '大吹雪', '範囲 +40%', { radius: 1.4 }),
      R('long', '長い吹雪', '続く時間 +60%', { durMul: 1.6 }),
      R('hail', '雹', '刻みの間隔 ×1.5、1 回 ×1.6、10% の確率で凍結させる', { tickMul: 1.5, dmgMul: 1.6, status: { id: 'freeze', chance: 0.1, dur: 1 } }),
    ],
  },
  {
    id: 's_firewall', cls: 'sorcerer', kind: 'active', name: '炎の壁', desc: '長さ {len} の炎の壁を {dur} 秒立て、{tick} 秒ごとに触れた敵に {dmg} の火炎ダメージ。',
    tags: ['spell', 'area', 'dot'], element: 'fire', unlock: 28, behavior: 'wall',
    cost: 35, cd: 8, castTime: 0.6, dmg: [72, 3.5], range: 450, radius: 50, duration: 5, tick: 0.4, status: { id: 'ignite', chance: 0.2 }, extra: { len: 340 },
    runes: [
      R('frost', '氷の壁', '冷気ダメージになり、敵を冷却し 15% の確率で凍結させる', { element: 'cold', status: { id: 'freeze', chance: 0.15, dur: 1 } }),
      R('storm', '雷の壁', '雷撃ダメージになり、30% の確率で感電させる', LIGHT(0.3)),
      R('long', '燃え続ける壁', '続く時間 +60%', { durMul: 1.6 }),
      R('wide', '長い壁', '壁の長さ ×1.5', { extra: { lenMul: 1.5 } }),
    ],
  },
  {
    id: 's_familiar', cls: 'sorcerer', kind: 'summon', name: '魔力の使い魔', desc: '宙に浮く使い魔を {summons} 体呼ぶ。使い魔は主人公のそばから雷の弾を撃ち、武器ダメージの {dmgp} のダメージ。',
    tags: ['spell', 'minion', 'summon'], element: 'lightning', unlock: 35, behavior: 'summon',
    cost: 30, cd: 6, castTime: 0.5, dmg: [135, 6.5], maxSummons: 1, summon: { unit: 'familiar', life: 2, aps: 1.2, range: 500, fly: true },
    runes: [
      R('fire', '炎の精', '火炎ダメージになり、弾が当たると半径 60 で爆発する', { element: 'fire', summon: { explode: 60 } }),
      R('frost', '氷の精', '冷気ダメージになり、敵の動きを 2 秒間 35% 遅くする', { element: 'cold', summon: { status: { id: 'chill', chance: 1 } } }),
      R('twin', '双子の精', '使い魔 +1（1 体あたり ×0.7）', { maxSummons: 1, dmgMul: 0.7 }),
      R('chain', '跳ねる弾', '弾が近くの敵へ 2 回跳ねる', { summon: { chain: 2 } }),
    ],
  },
  {
    id: 's_ult', cls: 'sorcerer', kind: 'ult', name: '星崩し', desc: '【奥義】空を裂き、{count} 個の隕石を降らせる。それぞれ半径 {radius} に {dmg} の火炎ダメージ。',
    tags: ['spell', 'area', 'ult'], element: 'fire', unlock: 50, behavior: 'ult_starfall', auto: 'elite',
    cost: 0, cd: 90, castTime: 1.2, dmg: [620, 31], range: 700, radius: 160, count: 8, status: { id: 'ignite', chance: 0.5 },
    runes: [
      R('cold', '氷河の崩落', '冷気ダメージになり、50% の確率で凍結させる', { element: 'cold', status: { id: 'freeze', chance: 0.5, dur: 1.5 } }),
      R('storm', '天雷', '雷撃ダメージになり、60% の確率で感電させる', LIGHT(0.6)),
      R('more', '終末の雨', '隕石 +4、1 つあたり ×0.85', { countAdd: 4, dmgMul: 0.85 }),
      R('quick', '星読み', '待ち時間 -30%', { cdMul: 0.7 }),
    ],
  },

  // =====================================================================
  // 死霊術師（霊気）: 召喚・呪い・骨・死体
  // =====================================================================
  {
    id: 'n_bonespear', cls: 'necromancer', kind: 'basic', name: '骨の槍', desc: '敵を貫く骨の槍で {dmg} のダメージ。貫通 {pierce}。霊気 +4。',
    tags: ['spell', 'projectile'], element: 'phys', unlock: 1, basic: true, behavior: 'projectile',
    cost: -4, cd: 0, castTime: 0.55, dmg: [100, 4.5], range: 650, speed: 1200, count: 1, pierce: 2,
    runes: [
      R('blight', '腐れ槍', '毒ダメージになり、50% の確率で毒を与える', POIS(0.5)),
      R('void', '虚無の槍', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
      R('split', '骨の破片', '槍が 3 本になる（1 本 ×0.65）', { count: 3, dmgMul: 0.65 }),
      R('seek', '呪われた槍', '槍が敵を追いかけ、貫通 +1', { pierce: 1, extra: { homing: true } }),
    ],
  },
  {
    id: 'n_skeleton', cls: 'necromancer', kind: 'summon', name: '骸骨召喚', desc: '骸骨の戦士を {summons} 体まで呼ぶ。骸骨は武器ダメージの {dmgp} で攻撃する。',
    tags: ['spell', 'minion', 'summon'], element: 'phys', unlock: 1, behavior: 'summon',
    cost: 30, cd: 4, castTime: 0.7, dmg: [60, 3], maxSummons: 3, summon: { unit: 'skeleton', life: 2.5, aps: 1.1, range: 90 },
    runes: [
      R('mage', '骸骨の魔術師', '射程 450 から冷気の弾を撃つ骸骨になる', { element: 'cold', summon: { unit: 'skelmage', range: 450 } }),
      R('archer', '骸骨の射手', '物理の矢で遠くから撃つ骸骨になり、ダメージ ×1.1', { dmgMul: 1.1, summon: { unit: 'skelarcher', range: 500 } }),
      R('horde', '骸骨の群れ', '数 +2、1 体あたり ×0.7', { maxSummons: 2, dmgMul: 0.7 }),
      R('brute', '骸骨の重戦士', '数 -1、ライフ ×2、ダメージ ×1.6', { maxSummons: -1, dmgMul: 1.6, summon: { unit: 'skelbrute', lifeMul: 2 } }),
    ],
  },
  {
    id: 'n_curse', cls: 'necromancer', kind: 'active', name: '衰弱の呪い', desc: '半径 {radius} の敵を {dur} 秒呪い、受けるダメージ +{curse}%・与えるダメージ -20%。',
    tags: ['spell', 'area', 'curse'], element: 'void', unlock: 3, behavior: 'curse',
    cost: 20, cd: 6, castTime: 0.4, range: 550, radius: 220, curse: { vuln: 0.2, weaken: 0.2, dur: 6 },
    runes: [
      R('decay', '腐敗の呪い', '呪われた敵に毎秒 武器ダメージの 40% の毒', { curse: { dot: 0.4 } }),
      R('slow', '鈍重の呪い', '呪われた敵の動きと攻撃 -30%', { curse: { slow: 0.3 } }),
      R('wide', '広がる呪い', '範囲 +60%', { radius: 1.6 }),
      R('aura', '呪いの霧', '8 秒間、主人公の周りの敵に呪いをかけ続ける', { behavior: 'aura', extra: { auraDur: 8 } }),
    ],
  },
  {
    id: 'n_corpse', cls: 'necromancer', kind: 'active', name: '死体爆発', desc: '近くの死体を {count} 体まで爆発させ、それぞれ半径 {radius} に {dmg}＋死体の最大ライフの 5% のダメージ。',
    tags: ['spell', 'area'], element: 'phys', unlock: 6, behavior: 'corpse',
    cost: 15, cd: 1.2, castTime: 0.4, dmg: [160, 8], range: 600, radius: 150, count: 3, extra: { corpsePct: 0.05 },
    runes: [
      R('fire', '火葬', '火炎ダメージになり、50% の確率で炎上させる', FIRE(0.5)),
      R('poison', '疫病の死体', '毒ダメージになり、爆発の後に毒の霧が 3 秒残る', { element: 'poison', extra: { leaveCloud: { dur: 3, tick: 0.5, mult: 0.12 } } }),
      R('more', '連爆', '爆発させる死体 +3', { countAdd: 3 }),
      R('big', '大爆発', '範囲 ×1.5', { radius: 1.5 }),
    ],
  },
  {
    id: 'n_reap', cls: 'necromancer', kind: 'basic', name: '刈り取り', desc: '大鎌で半径 {radius} を刈り {dmg} のダメージ。霊気 +8。',
    tags: ['attack', 'melee', 'area'], element: 'phys', unlock: 9, basic: true, behavior: 'melee',
    cost: -8, cd: 0, castTime: 0.6, dmg: [135, 6], range: 130, radius: 110,
    runes: [
      R('void', '虚無の鎌', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
      R('poison', '腐れ鎌', '毒ダメージになり、40% の確率で毒を与える', POIS(0.4)),
      R('wide', '大振り', '範囲 ×1.6、ダメージ ×0.85', { radius: 1.6, dmgMul: 0.85 }),
      R('soul', '魂の刈り取り', '倒した敵 1 体につき霊気 +3', { extra: { resOnKill: 3 } }),
    ],
  },
  {
    id: 'n_bonestorm', cls: 'necromancer', kind: 'active', name: '骨の嵐', desc: '{count} 本の骨片が {dur} 秒間まわりを回り、触れた敵に {dmg} のダメージ（同じ敵には {tick} 秒ごと）。',
    tags: ['spell', 'area'], element: 'phys', unlock: 12, behavior: 'orbit',
    cost: 30, cd: 8, castTime: 0.5, dmg: [82, 4], count: 4, radius: 120, duration: 6, tick: 0.35,
    runes: [
      R('armor', '骨の鎧', '嵐の間、受けるダメージ -15%', { extra: { selfBuff: { name: '骨の鎧', mods: [{ s: 'dr', v: 15 }] } } }),
      R('more', '骨の竜巻', '骨片 +3、1 本あたり ×0.85', { countAdd: 3, dmgMul: 0.85 }),
      R('wide', '広がる嵐', '回る輪の大きさ +40%', { radius: 1.4 }),
      R('void', '虚無の嵐', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
    ],
  },
  {
    id: 'n_golem', cls: 'necromancer', kind: 'summon', name: '屍の巨像', desc: '屍の巨像を {summons} 体呼ぶ。巨像は敵を引きつけ、叩きつけで半径 120 に武器ダメージの {dmgp} のダメージ。',
    tags: ['spell', 'minion', 'summon'], element: 'phys', unlock: 16, behavior: 'summon',
    cost: 40, cd: 10, castTime: 0.9, dmg: [220, 10], maxSummons: 1, summon: { unit: 'golem', life: 8, aps: 0.7, range: 110, slam: 120, taunt: true, size: 1.25 },
    runes: [
      R('fire', '溶岩の巨像', '火炎ダメージになり、叩きつけで 40% の確率で炎上させる', { element: 'fire', summon: { unit: 'golem_fire', status: { id: 'ignite', chance: 0.4 } } }),
      R('iron', '鉄の巨像', 'ライフ ×1.6、ダメージ ×0.8', { dmgMul: 0.8, summon: { unit: 'golem_iron', lifeMul: 1.6 } }),
      R('blood', '血の巨像', '叩きつけのたびに主人公のライフを 2% 回復する', { summon: { unit: 'golem_blood', healHero: 0.02 } }),
      R('bone', '骨の巨像', '叩きつけの範囲 ×1.5', { summon: { unit: 'golem_bone', slamMul: 1.5 } }),
    ],
  },
  {
    id: 'n_blight', cls: 'necromancer', kind: 'active', name: '疫病の霧', desc: '半径 {radius} に {dur} 秒間毒の霧を出し、{tick} 秒ごとに {dmg} の毒ダメージ。50% の確率で毒を与える。',
    tags: ['spell', 'area', 'dot'], element: 'poison', unlock: 21, behavior: 'cloud',
    cost: 30, cd: 5, castTime: 0.5, dmg: [56, 2.6], range: 550, radius: 160, duration: 6, tick: 0.5, status: { id: 'poison', chance: 0.5 },
    runes: [
      R('wide', '広がる霧', '範囲 +40%', { radius: 1.4 }),
      R('long', '淀む霧', '続く時間 +60%', { durMul: 1.6 }),
      R('void', '虚無の霧', '虚無ダメージになり、ダメージ ×1.15', { element: 'void', dmgMul: 1.15 }),
      R('corpse', '死体を苗床に', '霧の中で倒れた敵が半径 100 で破裂する（×0.5）', { extra: { deathBurst: 0.5 } }),
    ],
  },
  {
    id: 'n_spirit', cls: 'necromancer', kind: 'active', name: '怨霊の群れ', desc: '{count} 体の怨霊を放つ。怨霊は敵を追いかけ、それぞれ {dmg} の虚無ダメージ。',
    tags: ['spell', 'projectile'], element: 'void', unlock: 27, behavior: 'projectile',
    cost: 25, cd: 0, castTime: 0.6, dmg: [112, 5.3], range: 650, speed: 620, count: 3, spread: 1.2, extra: { homing: true },
    runes: [
      R('more', '怨霊の大群', '怨霊 +2、1 体あたり ×0.85', { countAdd: 2, dmgMul: 0.85 }),
      R('poison', '腐った怨霊', '毒ダメージになり、50% の確率で毒を与える', POIS(0.5)),
      R('cold', '凍えた怨霊', '冷気ダメージになり、敵の動きを 2 秒間 35% 遅くする', { element: 'cold', status: { id: 'chill', chance: 1 } }),
      R('drain', '命を奪う怨霊', '与えたダメージの 3% をライフに変える', { extra: { leech: 0.03 } }),
    ],
  },
  {
    id: 'n_nova', cls: 'necromancer', kind: 'active', name: '骨の環', desc: '骨の破片を周りに撒き、半径 {radius} に {dmg} のダメージ。',
    tags: ['spell', 'area'], element: 'phys', unlock: 33, behavior: 'nova',
    cost: 30, cd: 2.5, castTime: 0.6, dmg: [235, 11], radius: 230,
    runes: [
      R('void', '虚無の環', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
      R('prison', '骨の牢', '50% の確率で 1.2 秒気絶させる', { status: { id: 'stun', chance: 0.5, dur: 1.2 } }),
      R('wide', '大きな環', '範囲 +40%、ダメージ ×0.9', { radius: 1.4, dmgMul: 0.9 }),
      R('twin', '二重の環', '0.5 秒後にもう一度広がる（×0.6）', { extra: { repeat: { delay: 0.5, mult: 0.6 } } }),
    ],
  },
  {
    id: 'n_soulrend', cls: 'necromancer', kind: 'active', name: '魂裂き', desc: '魂を裂く鎖が {chain} 回跳ね、当たるたびに {dmg} の虚無ダメージ。与えたダメージの 2% をライフに変える。',
    tags: ['spell'], element: 'void', unlock: 40, behavior: 'chain',
    cost: 25, cd: 0, castTime: 0.6, dmg: [172, 8], range: 550, chain: 4, extra: { leech: 0.02 },
    runes: [
      R('fork', '枝分かれ', '跳ねる回数 +3、1 回あたり ×0.85', { chain: 3, dmgMul: 0.85 }),
      R('poison', '腐敗の鎖', '毒ダメージになり、50% の確率で毒を与える', POIS(0.5)),
      R('heal', '癒やしの鎖', '跳ねるたびに召喚物のライフを 5% 回復する', { extra: { healMinions: 0.05 } }),
      R('curse', '呪いの鎖', '当たった敵の受けるダメージ +15%（4 秒）', { extra: { hexOnHit: 0.15 } }),
    ],
  },
  {
    id: 'n_ult', cls: 'necromancer', kind: 'ult', name: '死者の行進', desc: '【奥義】半径 {radius} に骨の衝撃（{dmg}）を放ち、骸骨の軍勢 {count} 体を {ttl} 秒呼び出す。',
    tags: ['spell', 'minion', 'area', 'ult'], element: 'phys', unlock: 50, behavior: 'ult_deathmarch', auto: 'elite',
    cost: 0, cd: 100, castTime: 1.2, dmg: [720, 36], radius: 300, count: 8, summon: { unit: 'skeleton', life: 2, aps: 1.3, range: 90, ttl: 15, dmgPct: 0.1 },
    runes: [
      R('mage', '魔術師の軍勢', '軍勢が射程 450 から冷気の弾を撃つ骸骨の魔術師になる', { summon: { unit: 'skelmage', range: 450 } }),
      R('more', '大軍勢', '軍勢 +4、1 体あたり ×0.8', { countAdd: 4, summon: { dmgPctMul: 0.8 } }),
      R('long', '終わらぬ行進', '軍勢がいる時間 +60%', { summon: { ttlMul: 1.6 } }),
      R('blast', '冥府の衝撃', '衝撃の範囲 ×1.5、ダメージ ×1.3', { radius: 1.5, dmgMul: 1.3 }),
    ],
  },

  // =====================================================================
  // 影刃（気力）: 二刀・毒・分身・踏み込み・クリティカル
  // =====================================================================
  {
    id: 'a_stab', cls: 'assassin', kind: 'basic', name: '連刃', desc: '素早く切りつけ {dmg} のダメージ。',
    tags: ['attack', 'melee'], element: 'phys', unlock: 1, basic: true, behavior: 'melee',
    cost: 0, cd: 0, castTime: 0.38, dmg: [92, 4], range: 100, radius: 40,
    runes: [
      R('venom', '毒刃', '毒ダメージになり、40% の確率で毒を与える', POIS(0.4)),
      R('twin', '双刃', '2 回切りつける（1 回 ×0.6）', { dmgMul: 0.6, extra: { hits: 2 } }),
      R('crit', '急所突き', 'クリティカル率 +10%', { extra: { critBonus: 0.1 } }),
      R('shadow', '影の刃', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
    ],
  },
  {
    id: 'a_fan', cls: 'assassin', kind: 'active', name: '刃の扇', desc: '周りに刃をばらまき、半径 {radius} に {dmg} のダメージ。35% の確率で出血させる。',
    tags: ['attack', 'area'], element: 'phys', unlock: 1, behavior: 'nova',
    cost: 22, cd: 0, castTime: 0.5, dmg: [115, 5.5], radius: 160, status: { id: 'bleed', chance: 0.35 },
    runes: [
      R('shadow', '影の扇', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
      R('poison', '毒の扇', '毒ダメージになり、50% の確率で毒を与える', POIS(0.5)),
      R('wide', '大きな扇', '範囲 +40%、ダメージ ×0.9', { radius: 1.4, dmgMul: 0.9 }),
      R('cascade', '刃の連鎖', '0.4 秒後にもう一度ばらまく（×0.6）', { extra: { repeat: { delay: 0.4, mult: 0.6 } } }),
    ],
  },
  {
    id: 'a_dash', cls: 'assassin', kind: 'active', name: '影走り', desc: '影になって {range} 先まで駆け抜け、通り抜けた敵に {dmg} のダメージ。クリティカル率 +20%。',
    tags: ['attack', 'melee', 'movement'], element: 'phys', unlock: 3, behavior: 'dash',
    cost: 20, cd: 4, castTime: 0.35, dmg: [180, 9], range: 380, radius: 60, extra: { critBonus: 0.2 },
    runes: [
      R('poison', '毒の足跡', '毒ダメージになり、60% の確率で毒を与える', POIS(0.6)),
      R('return', '往復', '駆け抜けたあと戻りながらもう一度当てる（×0.7）', { extra: { back: 0.7 } }),
      R('clone', '残像', '走り出した場所に影分身を 4 秒残す', { extra: { spawnClone: 4 } }),
      R('void', '虚無の影', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
    ],
  },
  {
    id: 'a_poison', cls: 'assassin', kind: 'active', name: '毒霧玉', desc: '毒の玉を投げ、半径 {radius} に {dur} 秒間毒の霧を出す。{tick} 秒ごとに {dmg} の毒ダメージ。60% の確率で毒を与える。',
    tags: ['attack', 'area', 'dot'], element: 'poison', unlock: 6, behavior: 'cloud',
    cost: 25, cd: 5, castTime: 0.4, dmg: [52, 2.5], range: 450, radius: 150, duration: 5, tick: 0.5, status: { id: 'poison', chance: 0.6 },
    runes: [
      R('wide', '広がる霧', '範囲 +40%', { radius: 1.4 }),
      R('long', '淀む霧', '続く時間 +60%', { durMul: 1.6 }),
      R('blind', '目潰し', '霧の中の敵の与えるダメージ -25%', { curse: { weaken: 0.25, dur: 1 } }),
      R('void', '虚無の霧', '虚無ダメージになり、ダメージ ×1.15', { element: 'void', dmgMul: 1.15 }),
    ],
  },
  {
    id: 'a_throw', cls: 'assassin', kind: 'basic', name: '投げ刃', desc: '{count} 本の刃を投げ、それぞれ {dmg} のダメージ。15% の確率で毒を与える。',
    tags: ['attack', 'projectile'], element: 'phys', unlock: 9, basic: true, behavior: 'projectile',
    cost: 0, cd: 0, castTime: 0.5, dmg: [72, 3.5], range: 550, speed: 1400, count: 2, spread: 0.15, status: { id: 'poison', chance: 0.15 },
    runes: [
      R('more', '刃の雨', '刃 +2、1 本あたり ×0.8', { countAdd: 2, dmgMul: 0.8 }),
      R('pierce', '貫く刃', '貫通 +2', { pierce: 2 }),
      R('fire', '火打ちの刃', '火炎ダメージになり、20% の確率で炎上させる', FIRE(0.2)),
      R('seek', '追う刃', '刃が敵を追いかけ、ダメージ +5%', { dmgMul: 1.05, extra: { homing: true } }),
    ],
  },
  {
    id: 'a_clone', cls: 'assassin', kind: 'summon', name: '影分身', desc: '影の分身を {summons} 体呼ぶ（{ttl} 秒）。分身は素早く切りつけ、武器ダメージの {dmgp} のダメージ。',
    tags: ['minion', 'summon'], element: 'phys', unlock: 11, behavior: 'summon',
    cost: 35, cd: 12, castTime: 0.4, dmg: [70, 3.3], maxSummons: 2, summon: { unit: 'clone', life: 2, aps: 1.6, range: 100, ttl: 12 },
    runes: [
      R('more', '分身の群れ', '分身 +1、1 体あたり ×0.8', { maxSummons: 1, dmgMul: 0.8 }),
      R('long', '長い残影', 'いる時間 +60%', { summon: { ttlMul: 1.6 } }),
      R('poison', '毒の分身', '毒ダメージになり、40% の確率で毒を与える', { element: 'poison', summon: { status: { id: 'poison', chance: 0.4 } } }),
      R('blade', '刃の分身', '分身が消えるとき、半径 160 に刃をばらまく（武器ダメージの 150%）', { summon: { deathFan: 1.5 } }),
    ],
  },
  {
    id: 'a_mark', cls: 'assassin', kind: 'active', name: '死の刻印', desc: '敵に刻印を {dur} 秒刻む。刻印された敵は受けるダメージ +{curse}%、受けるクリティカルダメージ +50%。倒すと気力 +30。',
    tags: ['attack', 'curse'], element: 'void', unlock: 14, behavior: 'curse',
    cost: 15, cd: 8, castTime: 0.3, range: 600, radius: 60, curse: { vuln: 0.15, mark: 0.3, dur: 8, resOnKill: 30 }, auto: 'elite',
    runes: [
      R('spread', '広がる刻印', '半径 240 の敵すべてに刻む', { radius: 4 }),
      R('death', '死の連鎖', '刻印の敵が倒れると、320 以内の近くの敵に刻印が移る', { curse: { spread: true } }),
      R('poison', '毒の刻印', '刻印の敵に毎秒 武器ダメージの 30% の毒', { curse: { dot: 0.3 } }),
      R('deep', '深い刻印', '受けるダメージ +10%、続く時間 ×1.5', { curse: { vulnAdd: 0.1 }, durMul: 1.5 }),
    ],
  },
  {
    id: 'a_blades', cls: 'assassin', kind: 'active', name: '刃の嵐', desc: '{count} 枚の刃が {dur} 秒間まわりを回り、触れた敵に {dmg} のダメージ（同じ敵には {tick} 秒ごと）。',
    tags: ['attack', 'area'], element: 'phys', unlock: 18, behavior: 'orbit',
    cost: 30, cd: 9, castTime: 0.4, dmg: [50, 2.4], count: 5, radius: 110, duration: 6, tick: 0.3,
    runes: [
      R('more', '刃の竜巻', '刃 +3、1 枚あたり ×0.85', { countAdd: 3, dmgMul: 0.85 }),
      R('poison', '毒の嵐', '毒ダメージになり、30% の確率で毒を与える', POIS(0.3)),
      R('wide', '広がる嵐', '回る輪の大きさ +40%', { radius: 1.4 }),
      R('crit', '研ぎ澄ます嵐', 'クリティカル率 +15%', { extra: { critBonus: 0.15 } }),
    ],
  },
  {
    id: 'a_shuriken', cls: 'assassin', kind: 'active', name: '鎖刃', desc: '跳ね回る刃を投げ、{chain} 回跳ねて当たるたびに {dmg} のダメージ（跳ねるたびに -15%）。30% の確率で出血。',
    tags: ['attack', 'projectile'], element: 'phys', unlock: 24, behavior: 'chain',
    cost: 20, cd: 0, castTime: 0.5, dmg: [135, 6], range: 550, chain: 3, status: { id: 'bleed', chance: 0.3 },
    runes: [
      R('fork', '枝分かれ', '跳ねる回数 +3、1 回あたり ×0.85', { chain: 3, dmgMul: 0.85 }),
      R('poison', '毒の刃', '毒ダメージになり、50% の確率で毒を与える', POIS(0.5)),
      R('void', '虚無の刃', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
      R('crit', '急所を跳ねる', 'クリティカル率 +20%', { extra: { critBonus: 0.2 } }),
    ],
  },
  {
    id: 'a_vanish', cls: 'assassin', kind: 'buff', name: '霞隠れ', desc: '{dur} 秒間、霞に紛れる。回避率 +{b0}%・クリティカル率 +{b1}%・移動速度 +{b2}%。',
    tags: ['buff'], element: 'void', unlock: 30, behavior: 'buff',
    cost: 0, cd: 20, castTime: 0.3, buff: { mods: [{ s: 'dodge', v: 20, per: 0.5 }, { s: 'crit_chance', v: 10, per: 0.4 }, { s: 'move_speed', v: 20 }], dur: 6 },
    runes: [
      R('long', '深い霞', '効果時間 +50%', { buffDurMul: 1.5 }),
      R('strike', '闇討ち', '効果中、クリティカルダメージ +50%', { buffMods: [{ s: 'crit_damage', v: 50 }] }),
      R('regen', '気力の泉', '効果中、気力の回復 +50%', { buffMods: [{ s: 'resource_regen', v: 50 }] }),
      R('clone', '影を残す', '隠れると同時に影分身を 1 体呼ぶ（6 秒）', { extra: { spawnClone: 6 } }),
    ],
  },
  {
    id: 'a_flurry', cls: 'assassin', kind: 'active', name: '千刃', desc: '{dur} 秒間、目にも止まらぬ速さで切り続け、{tick} 秒ごとに半径 {radius} の敵に {dmg} のダメージ。',
    tags: ['attack', 'melee', 'channel'], element: 'phys', unlock: 37, behavior: 'flurry',
    cost: 30, cd: 0, castTime: 0.2, duration: 1.2, tick: 0.1, dmg: [38, 1.8], range: 110, radius: 80,
    runes: [
      R('poison', '毒の千刃', '毒ダメージになり、20% の確率で毒を与える', POIS(0.2)),
      R('long', '終わらぬ刃', '切り続ける時間 +60%、消費 +15', { durMul: 1.6, costAdd: 15 }),
      R('wide', '刃の渦', '範囲 ×2、ダメージ ×0.85', { radius: 2, dmgMul: 0.85 }),
      R('void', '虚無の千刃', '虚無ダメージになり、ダメージ ×1.1', { element: 'void', dmgMul: 1.1 }),
    ],
  },
  {
    id: 'a_ult', cls: 'assassin', kind: 'ult', name: '冥府の舞', desc: '【奥義】影となって敵から敵へ {count} 回跳び移り、そのたびに必ずクリティカルで {dmg} のダメージ。',
    tags: ['attack', 'melee', 'ult'], element: 'phys', unlock: 50, behavior: 'ult_shadowdance', auto: 'elite',
    cost: 0, cd: 90, castTime: 0.3, dmg: [330, 16.5], range: 600, radius: 70, count: 7,
    runes: [
      R('poison', '毒の舞', '毒ダメージになり、100% の確率で毒を与える', { element: 'poison', status: { id: 'poison', chance: 1 } }),
      R('more', '終わらぬ舞', '跳ぶ回数 +5、1 回あたり ×0.85', { countAdd: 5, dmgMul: 0.85 }),
      R('clone', '影の供', '舞い終えると影分身を 2 体呼ぶ（8 秒）', { extra: { spawnClone: 8, cloneCount: 2 } }),
      R('void', '虚無の舞', '虚無ダメージになり、ダメージ ×1.15', { element: 'void', dmgMul: 1.15 }),
    ],
  },
];

export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillsOf = (cls) => SKILLS.filter((s) => s.cls === cls);

/** 召喚物の種類（絵の枠 minion.<id> と名前）。アート担当はこの一覧で絵を描く */
export const MINION_KINDS = [
  { id: 'skeleton', name: '骸骨の戦士', desc: '剣と盾の骸骨。近接', body: 'biped' },
  { id: 'skelmage', name: '骸骨の魔術師', desc: '杖を持つ骸骨。冷気の弾を撃つ', body: 'caster' },
  { id: 'skelarcher', name: '骸骨の射手', desc: '弓を持つ骸骨', body: 'biped' },
  { id: 'skelbrute', name: '骸骨の重戦士', desc: '大きな骸骨。両手斧', body: 'brute' },
  { id: 'golem', name: '屍の巨像', desc: '死体を継ぎ合わせた巨人', body: 'golem' },
  { id: 'golem_fire', name: '溶岩の巨像', desc: '溶けた岩の巨人', body: 'golem' },
  { id: 'golem_iron', name: '鉄の巨像', desc: '鎖と鉄板の巨人', body: 'golem' },
  { id: 'golem_blood', name: '血の巨像', desc: '血の塊の巨人', body: 'golem' },
  { id: 'golem_bone', name: '骨の巨像', desc: '骨を組んだ巨人', body: 'golem' },
  { id: 'wolf', name: '狼の相棒', desc: '灰色の狼', body: 'quad' },
  { id: 'hawk', name: '鷹の相棒', desc: '空を飛ぶ鷹', body: 'flyer' },
  { id: 'boar', name: '猪の相棒', desc: '牙の大きな猪', body: 'quad' },
  { id: 'spider', name: '毒蜘蛛の相棒', desc: '毒を吐く大蜘蛛', body: 'spider' },
  { id: 'turret', name: '弩の砲台', desc: '三脚の上の弩。動かない', body: 'construct' },
  { id: 'familiar', name: '魔力の使い魔', desc: '宙に浮く光の玉と小さな翼', body: 'elemental' },
  { id: 'clone', name: '影分身', desc: '主人公の黒い影（半透明）', body: 'biped' },
];
