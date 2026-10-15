// 補助の刻印（サポート）。スキルの「刻印の穴」（主人公 Lv 10 / 30 / 60 で 1 つずつ開く、最大 3 つ）にはめて、スキルの動きや数値を変える。
// 敵が落とす（普通の敵 約 300 体に 1 つ、エリート・ボスはもっと）。同じ刻印を合成するとレベルが上がる（1〜20）。
//
// 形:
// { id, name, cat: 'atk'|'shape'|'elem'|'util', desc(lv) → 説明（数字入り）, req: 条件, mod(lv) → applyMod の形 }
// req（はめられるスキルの条件。どれか 1 つでも合えばよい）:
//   tags: ['projectile', ...]  … そのタグを持つ
//   behaviors: ['chain', ...]   … その動き
//   cd: true                     … 待ち時間がある
//   cost: true                   … リソースを使う
//   damage: true                 … ダメージを出す（強化だけのスキルは不可）
//   buff: true                   … 強化（バフ・障壁）
//   summon: true                 … 召喚物を出す
//   duration: true               … 続く時間がある（霧・罠・回る刃・強化・召喚物の時間など）
//   shots: true                  … まっすぐ飛ぶ弾を撃つ（動きが projectile / roll。貫通・追尾が効く）
//   not: ['ult']                 … このタグのスキルには付けられない
//   notBehaviors: ['chain']      … この動きのスキルには付けられない（弾の数を使わない連鎖・砲台など）

export const SUPPORT_MAX_LEVEL = 20;
/** そのレベルになるのに必要な合成の経験（累計）。同じ刻印 1 つ = (そのレベルの累計 + 1) */
export const glyphXpFor = (lv) => (lv * (lv - 1)) / 2;
export const glyphLevelOf = (xp) => { let lv = 1; while (lv < SUPPORT_MAX_LEVEL && glyphXpFor(lv + 1) <= xp) lv++; return lv; };
/** 合成の材料にしたときの価値 */
export const glyphValue = (g) => glyphXpFor(g.lvl || 1) + 1;

export const SUPPORT_CATS = { atk: { name: '攻め', color: '#ff6a4a' }, shape: { name: '形', color: '#5aa0ff' }, elem: { name: '属性', color: '#c77dff' }, util: { name: '補助', color: '#6ee08a' } };

const r1 = (x) => Math.round(x * 10) / 10;
const pct = (x) => `${r1(x * 100)}%`;
const mul = (x) => `×${Math.round(x * 100) / 100}`;

export const SUPPORTS = [
  // ---- 形（投射・範囲・連鎖）
  { id: 'sup_multi', name: '拡散の刻印', cat: 'shape', req: { tags: ['projectile'], notBehaviors: ['chain', 'turret'] },
    desc: (lv) => `弾 +2。弾 1 つのダメージ ${mul(0.7 + 0.01 * lv)}`, mod: (lv) => ({ countAdd: 2, dmgMul: 0.7 + 0.01 * lv }) },
  { id: 'sup_pierce', name: '貫きの刻印', cat: 'shape', req: { shots: true },
    desc: (lv) => `貫通 +${2 + Math.floor(lv / 10)}。ダメージ +${10 + lv}%`, mod: (lv) => ({ pierce: 2 + Math.floor(lv / 10), dmgMul: 1.1 + 0.01 * lv }) },
  { id: 'sup_chain', name: '連鎖の刻印', cat: 'shape', req: { behaviors: ['chain'] },
    desc: (lv) => `跳ねる回数 +${2 + Math.floor(lv / 10)}。ダメージ ${mul(0.85 + 0.01 * lv)}`, mod: (lv) => ({ chain: 2 + Math.floor(lv / 10), dmgMul: 0.85 + 0.01 * lv }) },
  { id: 'sup_area', name: '広域の刻印', cat: 'shape', req: { tags: ['area'] },
    desc: (lv) => `範囲 +${20 + lv}%`, mod: (lv) => ({ radius: 1.2 + 0.01 * lv }) },
  { id: 'sup_conc', name: '集束の刻印', cat: 'shape', req: { tags: ['area'] },
    desc: (lv) => `範囲 -25%。ダメージ ${mul(1.3 + 0.015 * lv)}`, mod: (lv) => ({ radius: 0.75, dmgMul: 1.3 + 0.015 * lv }) },
  { id: 'sup_seek', name: '追尾の刻印', cat: 'shape', req: { shots: true },
    desc: (lv) => `弾が敵を追いかける。弾の速さ +20%。ダメージ +${5 + lv}%`, mod: (lv) => ({ speedMul: 1.2, dmgMul: 1.05 + 0.01 * lv, extra: { homing: true } }) },
  { id: 'sup_burst', name: '爆裂の刻印', cat: 'shape', req: { tags: ['projectile', 'melee'] },
    desc: (lv) => `当たった所で半径 70 の小爆発（${pct(0.4 + 0.02 * lv)}）`, mod: (lv) => ({ extra: { burst: 0.4 + 0.02 * lv } }) },
  // ---- 攻め
  { id: 'sup_brutal', name: '残虐の刻印', cat: 'atk', req: { damage: true },
    desc: (lv) => `ダメージ ${mul(1.2 + 0.015 * lv)}。消費 +30%`, mod: (lv) => ({ dmgMul: 1.2 + 0.015 * lv, costMul: 1.3 }) },
  { id: 'sup_fury', name: '猛攻の刻印', cat: 'atk', req: { tags: ['attack'] },
    desc: (lv) => `動作が ${r1(20 + lv * 0.5)}% 速くなる`, mod: (lv) => ({ castMul: 1 / (1.2 + lv * 0.005), tickMul: 1 / (1.1 + lv * 0.005) }) },
  { id: 'sup_quick', name: '迅速詠唱の刻印', cat: 'atk', req: { tags: ['spell'] },
    desc: (lv) => `詠唱が ${r1(20 + lv * 0.5)}% 速くなる`, mod: (lv) => ({ castMul: 1 / (1.2 + lv * 0.005), tickMul: 1 / (1.1 + lv * 0.005) }) },
  { id: 'sup_execute', name: '処刑の刻印', cat: 'atk', req: { damage: true },
    desc: (lv) => `ライフ 30% 以下の敵へのダメージ ${mul(1.4 + 0.02 * lv)}`, mod: (lv) => ({ extra: { execute: 1.4 + 0.02 * lv } }) },
  { id: 'sup_giant', name: '巨人狩りの刻印', cat: 'atk', req: { damage: true },
    desc: (lv) => `エリート・ボスへのダメージ ${mul(1.25 + 0.015 * lv)}`, mod: (lv) => ({ extra: { eliteMul: 1.25 + 0.015 * lv } }) },
  { id: 'sup_crit', name: '会心の刻印', cat: 'atk', req: { damage: true },
    desc: (lv) => `クリティカル率 +${r1(5 + 0.25 * lv)}%・クリティカルダメージ +${15 + lv}%`, mod: (lv) => ({ extra: { critBonusAdd: (5 + 0.25 * lv) / 100, critDmgBonusAdd: (15 + lv) / 100 } }) },
  { id: 'sup_echo', name: '連撃の刻印', cat: 'atk', req: { tags: ['attack'] },
    desc: (lv) => `${20 + lv}% の確率でもう一度当たる（×0.8）`, mod: (lv) => ({ repeatChance: (20 + lv) / 100 }) },
  { id: 'sup_shatter', name: '破砕の刻印', cat: 'atk', req: { damage: true },
    desc: (lv) => `凍結・冷却中の敵へのダメージ ${mul(1.3 + 0.02 * lv)}`, mod: (lv) => ({ extra: { shatter: 1.3 + 0.02 * lv } }) },
  // ---- 属性（変換と状態異常）
  { id: 'sup_fire', name: '火炎転化の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `火炎ダメージになり、${15 + lv}% の確率で炎上させる。ダメージ +${lv}%`, mod: (lv) => ({ element: 'fire', status: { id: 'ignite', chance: (15 + lv) / 100 }, dmgMul: 1 + 0.01 * lv }) },
  { id: 'sup_cold', name: '氷結転化の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `冷気ダメージになり、${r1(8 + 0.5 * lv)}% の確率で凍結させる。ダメージ +${lv}%`, mod: (lv) => ({ element: 'cold', status: { id: 'freeze', chance: (8 + 0.5 * lv) / 100, dur: 1 }, dmgMul: 1 + 0.01 * lv }) },
  { id: 'sup_light', name: '雷撃転化の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `雷撃ダメージになり、${15 + lv}% の確率で感電させる。ダメージ +${lv}%`, mod: (lv) => ({ element: 'lightning', status: { id: 'shock', chance: (15 + lv) / 100 }, dmgMul: 1 + 0.01 * lv }) },
  { id: 'sup_poison', name: '毒化の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `毒ダメージになり、${r1(25 + 1.5 * lv)}% の確率で毒を与える`, mod: (lv) => ({ element: 'poison', status: { id: 'poison', chance: (25 + 1.5 * lv) / 100 } }) },
  { id: 'sup_void', name: '虚無の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `虚無ダメージになり、ダメージ ${mul(1.1 + 0.01 * lv)}`, mod: (lv) => ({ element: 'void', dmgMul: 1.1 + 0.01 * lv }) },
  { id: 'sup_bleed', name: '出血の刻印', cat: 'elem', req: { tags: ['attack'] },
    desc: (lv) => `${r1(25 + 1.5 * lv)}% の確率で出血させる。出血のダメージ +${2 * lv}%`, mod: (lv) => ({ status: { id: 'bleed', chance: (25 + 1.5 * lv) / 100 }, bleedMul: 1 + 0.02 * lv }) },
  { id: 'sup_stun', name: '衝撃の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `${r1(10 + 0.5 * lv)}% の確率で 1 秒気絶させる`, mod: (lv) => ({ status: { id: 'stun', chance: (10 + 0.5 * lv) / 100, dur: 1 } }) },
  { id: 'sup_hex', name: '呪縛の刻印', cat: 'elem', req: { damage: true },
    desc: (lv) => `当たった敵の受けるダメージ +${r1(10 + 0.5 * lv)}%（4 秒）`, mod: (lv) => ({ extra: { hexOnHit: (10 + 0.5 * lv) / 100 } }) },
  // ---- 補助（消費・時間・召喚・強化）
  { id: 'sup_thrift', name: '節約の刻印', cat: 'util', req: { cost: true },
    desc: (lv) => `消費 -${25 + lv}%`, mod: (lv) => ({ costMul: 1 - (25 + lv) / 100 }) },
  { id: 'sup_haste', name: '時短の刻印', cat: 'util', req: { cd: true },
    desc: (lv) => `待ち時間 -${r1(15 + 0.75 * lv)}%`, mod: (lv) => ({ cdMul: 1 - (15 + 0.75 * lv) / 100 }) },
  { id: 'sup_leech', name: '吸命の刻印', cat: 'util', req: { damage: true },
    desc: (lv) => `与えたダメージの ${r1(2 + 0.1 * lv)}% をライフに変える`, mod: (lv) => ({ extra: { leechAdd: (2 + 0.1 * lv) / 100 } }) },
  { id: 'sup_horde', name: '軍勢の刻印', cat: 'util', req: { summon: true },
    desc: (lv) => `召喚数 +1。召喚物のライフ ${mul(0.8 + 0.01 * lv)}`, mod: (lv) => ({ maxSummons: 1, countAdd: 1, summonLifeMul: 0.8 + 0.01 * lv }) },
  { id: 'sup_minion', name: '剛力の召喚の刻印', cat: 'util', req: { summon: true },
    desc: (lv) => `召喚物のダメージ ${mul(1.25 + 0.02 * lv)}・ライフ +${10 + lv}%`, mod: (lv) => ({ dmgMul: 1.25 + 0.02 * lv, summonLifeMul: 1.1 + 0.01 * lv }) },
  { id: 'sup_linger', name: '持続の刻印', cat: 'util', req: { duration: true },
    desc: (lv) => `続く時間 +${r1(30 + 1.5 * lv)}%`, mod: (lv) => ({ durMul: 1.3 + 0.015 * lv, buffDurMul: 1.3 + 0.015 * lv, summon: { ttlMul: 1.3 + 0.015 * lv } }) },
  { id: 'sup_amp', name: '増幅の刻印', cat: 'util', req: { buff: true },
    desc: (lv) => `強化・障壁の効果 +${r1(25 + 1.5 * lv)}%`, mod: (lv) => ({ buffMul: 1.25 + 0.015 * lv, shieldMul: 1.25 + 0.015 * lv }) },
];

export const SUPPORT = Object.fromEntries(SUPPORTS.map((s) => [s.id, s]));

/** そのスキル定義に、この刻印をはめられるか。p は resolveSkill の結果（無ければ def から判断） */
export function supportFits(sup, def) {
  const r = sup.req || {};
  const tags = def.tags || [];
  if (r.not && r.not.some((t) => tags.includes(t))) return false;
  const beh = def.behavior;
  if (r.notBehaviors && r.notBehaviors.includes(beh)) return false;
  const isSummon = beh === 'summon' || beh === 'turret' || beh === 'ult_deathmarch';
  const isBuff = beh === 'buff' || beh === 'barrier';
  const deals = !!def.dmg && !isBuff;
  const hasDur = !!(def.duration || def.buff || def.shield || def.summon?.ttl || def.curse || beh === 'trap');
  const checks = [];
  if (r.tags) checks.push(r.tags.some((t) => tags.includes(t)));
  if (r.behaviors) checks.push(r.behaviors.includes(beh));
  if (r.shots) checks.push(beh === 'projectile' || beh === 'roll');
  if (r.cd) checks.push((def.cd || 0) > 0);
  if (r.cost) checks.push((def.cost || 0) > 0);
  if (r.damage) checks.push(deals);
  if (r.buff) checks.push(isBuff);
  if (r.summon) checks.push(isSummon);
  if (r.duration) checks.push(hasDur);
  return checks.length ? checks.some(Boolean) : true;
}

/** はめる条件の説明 */
export function supportReqText(sup) {
  const r = sup.req || {};
  const TAGJ = { projectile: '投射', area: '範囲', attack: '攻撃', spell: '呪文', melee: '近接', minion: '召喚' };
  const parts = [];
  if (r.tags) parts.push(`${r.tags.map((t) => TAGJ[t] || t).join('・')}のスキル`);
  if (r.behaviors) parts.push('連鎖するスキル');
  if (r.shots) parts.push('まっすぐ飛ぶ弾を撃つスキル');
  if (r.cd) parts.push('待ち時間のあるスキル');
  if (r.cost) parts.push('リソースを使うスキル');
  if (r.damage) parts.push('ダメージを出すスキル');
  if (r.buff) parts.push('強化・障壁のスキル');
  if (r.summon) parts.push('召喚のスキル');
  if (r.duration) parts.push('効果が続くスキル');
  const out = parts.join(' / ') || 'どのスキルにも';
  return r.notBehaviors ? `${out}（連鎖・砲台を除く）` : out;
}
