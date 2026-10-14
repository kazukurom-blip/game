// パッシブの星座盤（約 360 の点）とパラゴンの盤。点の並びは決まった手順で作る（毎回同じ形になる）。
//
// 形（点 = node）:
// { id, x, y, type: 'start'|'small'|'attr'|'notable'|'keystone', name, mods: [{ s, v }], links: [id...], cls?, ks?, theme }
//   start    … クラスの出発点（5 つ。円の上に並ぶ）。最初から振ってある
//   small    … 小さな点（能力 +）
//   attr     … 主能力 +10
//   notable  … 名前のある要の点（30）
//   keystone … 特別な要石（12）。ルールを変える効果と代償がある（効果は character.js / combat.js が ks_<id> を見て処理する）
// 座標は「盤の単位」。中心が (0,0)。半径 230 の内側の環 → 半径 470 にクラスの出発点 → 外へ 3 本の枝 → 半径 1310 の外側の環 → 要石。

import { CLASSES } from './classes.js';

export const TREE_CLASS_ORDER = ['warrior', 'ranger', 'sorcerer', 'necromancer', 'assassin'];
export const CLASS_ANGLE = Object.fromEntries(TREE_CLASS_ORDER.map((c, k) => [c, -90 + 72 * k]));

// ---------------- 小さな点の能力（枝の色ごと）
const POOLS = {
  guard: [['inc_armor', 8], ['inc_life', 4], ['block', 1.5], ['res_all', 3]],
  might: [['inc_melee', 6], ['inc_phys', 6], ['area', 4], ['inc_dmg', 4]],
  fury: [['attack_speed', 2.5], ['leech', 0.3], ['bleed_chance', 3], ['max_resource', 4]],
  marks: [['crit_chance', 1], ['crit_damage', 6], ['inc_projectile', 6], ['dmg_elite', 5]],
  volley: [['inc_projectile', 6], ['attack_speed', 2.5], ['inc_attack', 5], ['inc_area', 5]],
  wild: [['inc_minion', 7], ['minion_life', 6], ['move_speed', 2.5], ['inc_trap', 8]],
  fire: [['inc_fire', 7], ['ignite_chance', 2], ['inc_spell', 4], ['res_fire', 5]],
  frost: [['inc_cold', 7], ['freeze_chance', 1], ['cdr', 1.5], ['max_resource', 5]],
  storm: [['inc_lightning', 7], ['shock_chance', 2], ['resource_regen', 4], ['inc_spell', 4]],
  bone: [['inc_armor', 7], ['minion_life', 6], ['inc_phys', 6], ['inc_life', 3]],
  legion: [['inc_minion', 7], ['minion_as', 3], ['minion_life', 5], ['inc_spell', 4]],
  plague: [['inc_poison', 7], ['poison_chance', 2], ['inc_dot', 6], ['curse_eff', 4]],
  shadow: [['dodge', 1.5], ['inc_void', 7], ['move_speed', 2.5], ['dmg_vs_low', 6]],
  blades: [['crit_chance', 1], ['crit_damage', 7], ['attack_speed', 2.5], ['inc_melee', 6]],
  venom: [['inc_poison', 7], ['poison_chance', 2], ['status_dmg', 5], ['inc_dot', 6]],
  generic: [['inc_dmg', 4], ['inc_life', 3], ['res_all', 3], ['all_attr', 4]],
  outer: [['inc_dmg', 5], ['inc_life', 4], ['res_all', 4], ['cdr', 1.5], ['crit_damage', 6], ['inc_armor', 7]],
  fortune: [['gold_find', 6], ['magic_find', 5], ['xp_bonus', 3], ['glyph_find', 10], ['mastery_xp', 8], ['mat_find', 6]],
};

/** クラスごとの 3 本の枝（左・中・右）の色 */
const BRANCH_THEMES = {
  warrior: ['guard', 'might', 'fury'],
  ranger: ['marks', 'volley', 'wild'],
  sorcerer: ['fire', 'frost', 'storm'],
  necromancer: ['bone', 'legion', 'plague'],
  assassin: ['shadow', 'blades', 'venom'],
};
export const THEME_NAMES = {
  guard: '鉄壁', might: '剛力', fury: '憤怒', marks: '狙撃', volley: '連射', wild: '野生', fire: '業火', frost: '凍気', storm: '雷霆',
  bone: '骨', legion: '軍勢', plague: '疫病', shadow: '影', blades: '刃', venom: '猛毒', generic: '基礎', outer: '外縁', fortune: '幸運', ks: '要石',
};
export const THEME_COLORS = {
  guard: '#c8a060', might: '#ff7a5a', fury: '#ff4040', marks: '#9ae07a', volley: '#6ad06a', wild: '#b0d060', fire: '#ff8a3a', frost: '#7fd8ff', storm: '#ffe45a',
  bone: '#e8e0c8', legion: '#b47cff', plague: '#8adf5a', shadow: '#a070ff', blades: '#ffd84a', venom: '#7cff5a', generic: '#bfb6a6', outer: '#d9b45a', fortune: '#ffd27a', ks: '#ff4d6d',
};

// ---------------- 要の点（ノータブル）30。[枝の真ん中の輪, 枝の先] × 3 本 × 5 クラス
const NOTABLES = {
  warrior: [
    [{ name: '鉄の砦', mods: [['inc_armor', 30], ['block', 5], ['inc_life', 8]] }, { name: '不屈の肉体', mods: [['inc_life', 15], ['life_regen_pct', 0.5], ['res_all', 6]] }],
    [{ name: '戦場の咆哮', mods: [['area', 15], ['inc_melee', 15]] }, { name: '巨人殺し', mods: [['dmg_boss', 20], ['dmg_elite', 20], ['inc_phys', 10]] }],
    [{ name: '血塗れの斧', mods: [['bleed_chance', 15], ['status_dmg', 20], ['inc_phys', 10]] }, { name: '怒りの炉', mods: [['resource_on_hit', 2], ['max_resource', 20], ['attack_speed', 6]] }],
  ],
  ranger: [
    [{ name: '鷹の眼差し', mods: [['crit_chance', 4], ['crit_damage', 20], ['inc_projectile', 10]] }, { name: '狩人の忍耐', mods: [['inc_life', 10], ['res_all', 8], ['leech', 1]] }],
    [{ name: '千本の矢', mods: [['proj_count', 1], ['inc_projectile', 8]] }, { name: '疾風の足', mods: [['move_speed', 10], ['dodge', 6], ['attack_speed', 5]] }],
    [{ name: '獣の絆', mods: [['inc_minion', 20], ['minion_life', 20], ['minion_as', 10]] }, { name: '罠師の技', mods: [['inc_trap', 25], ['cdr', 6], ['area', 10]] }],
  ],
  sorcerer: [
    [{ name: '業火の心', mods: [['inc_fire', 25], ['ignite_chance', 10]] }, { name: '時の歪み', mods: [['cdr', 10], ['inc_spell', 10]] }],
    [{ name: '凍てつく理', mods: [['inc_cold', 25], ['freeze_chance', 6]] }, { name: '魔導の障壁', mods: [['res_all', 10], ['inc_life', 8], ['dr', 4]] }],
    [{ name: '雷霆の指', mods: [['inc_lightning', 25], ['shock_chance', 10], ['chain', 1]] }, { name: '秘術の泉', mods: [['max_resource', 30], ['resource_regen', 20], ['cost_red', 6]] }],
  ],
  necromancer: [
    [{ name: '骨の鎧', mods: [['inc_armor', 25], ['minion_life', 15], ['inc_phys', 10]] }, { name: '魂喰らい', mods: [['leech', 1.5], ['inc_void', 20]] }],
    [{ name: '屍の王', mods: [['minion_count', 1], ['inc_minion', 10]] }, { name: '霊気の渦', mods: [['resource_on_hit', 2], ['resource_regen', 15], ['max_resource', 15]] }],
    [{ name: '腐敗の息吹', mods: [['poison_chance', 12], ['inc_poison', 20], ['inc_dot', 15]] }, { name: '呪詛の達人', mods: [['curse_eff', 25], ['area', 10]] }],
  ],
  assassin: [
    [{ name: '影の舞', mods: [['dodge', 8], ['attack_speed', 8], ['move_speed', 6]] }, { name: '闇夜の歩み', mods: [['dmg_vs_low', 30], ['inc_void', 15]] }],
    [{ name: '死角からの一撃', mods: [['crit_chance', 5], ['crit_damage', 25]] }, { name: '千の刃', mods: [['multistrike', 8], ['inc_melee', 12]] }],
    [{ name: '毒の作法', mods: [['poison_chance', 15], ['inc_poison', 20]] }, { name: '影の契約', mods: [['inc_minion', 15], ['minion_as', 15], ['minion_life', 10]] }],
  ],
};

// ---------------- 要石（キーストーン）12。外側の環の先に 30 度ごと
export const KEYSTONES = [
  { id: 'ironvow', name: '鉄壁の誓い', angle: -90, desc: '回避率が 0% になる。アーマー +80%、ブロック率 +10%。', mods: [['inc_armor', 80], ['block', 10]] },
  { id: 'bloodrage', name: '狂血', angle: -60, desc: '最大ライフ -25%。失ったライフ 1% につきダメージ +1%（最大 +75%）。', mods: [['inc_life', -25]] },
  { id: 'onestrike', name: '一撃の美学', angle: -30, desc: '待ち時間のあるスキルのダメージ ×1.5。基本攻撃のダメージ ×0.6。', mods: [] },
  { id: 'cascade', name: '止まらぬ連撃', angle: 0, desc: '連撃率 +25%。連撃からさらに連撃が起こる（3 回まで）。クリティカルダメージ -30%。', mods: [['multistrike', 25], ['crit_damage', -30]] },
  { id: 'balance', name: '均衡の天秤', angle: 30, desc: '火炎・冷気・雷撃・毒の耐性が、いちばん高い耐性と同じになる。最大ライフ -10%。', mods: [['inc_life', -10]] },
  { id: 'twincast', name: '二重詠唱', angle: 60, desc: '呪文が 2 回発動する。呪文の消費 ×2.5、待ち時間 +30%。', mods: [] },
  { id: 'ember', name: '灰燼の心臓', angle: 90, desc: '物理ダメージはすべて火炎ダメージになる。炎上率 +15%。冷気・雷撃のダメージ -30%。', mods: [['ignite_chance', 15], ['inc_cold', -30], ['inc_lightning', -30]] },
  { id: 'legion', name: '屍の軍勢', angle: 120, desc: '召喚数 +2、召喚物のダメージ +20%。召喚物のライフ -25%。主人公自身のダメージ ×0.6。', mods: [['minion_count', 2], ['inc_minion', 20], ['minion_life', -25]] },
  { id: 'thirst', name: '渇きの王', angle: 150, desc: 'ライフが自然に回復しなくなる。ライフ吸収 +4%、1 秒に吸収できる量 2 倍。', mods: [['leech', 4]] },
  { id: 'mindcloak', name: '魔力の外套', angle: 180, desc: '受けるダメージの 35% を、ライフの代わりにリソースで受ける（リソース 1 = 最大ライフの 1%）。リソースの回復 -30%。', mods: [['resource_regen', -30]] },
  { id: 'venomcrown', name: '毒の王冠', angle: 210, desc: '毒を重ねられる数 20 → 60、毒のダメージ +30%。火炎・冷気・雷撃のダメージ -40%。', mods: [['inc_poison', 30], ['inc_fire', -40], ['inc_cold', -40], ['inc_lightning', -40]] },
  { id: 'precise', name: '研ぎ澄まされた一点', angle: 240, desc: 'クリティカルしなくなる。クリティカル率 1% につきダメージ +3%。', mods: [] },
];
export const KEYSTONE = Object.fromEntries(KEYSTONES.map((k) => [k.id, k]));

// ---------------- 作る
const rad = (d) => (d * Math.PI) / 180;
const polar = (r, deg) => ({ x: Math.round(r * Math.cos(rad(deg))), y: Math.round(r * Math.sin(rad(deg))) });
const toMods = (arr) => arr.map(([s, v]) => ({ s, v }));

function build() {
  const nodes = [];
  const byId = {};
  const add = (id, pos, type, o = {}) => {
    const n = { id, x: pos.x, y: pos.y, type, name: o.name || '', mods: o.mods || [], links: [], theme: o.theme || 'generic', ...o.more };
    if (o.cls) n.cls = o.cls;
    if (o.ks) n.ks = o.ks;
    nodes.push(n); byId[id] = n;
    return n;
  };
  const link = (a, b) => {
    const A = byId[a]; const B = byId[b];
    if (!A || !B || a === b) return;
    if (!A.links.includes(b)) A.links.push(b);
    if (!B.links.includes(a)) B.links.push(a);
  };
  const counters = {};
  const small = (id, pos, theme) => {
    const pool = POOLS[theme];
    const i = (counters[theme] = (counters[theme] || 0) + 1) - 1;
    const [s, v] = pool[i % pool.length];
    return add(id, pos, 'small', { theme, mods: [{ s, v }] });
  };
  const attr = (id, pos, cls, theme) => {
    const c = CLASSES.find((x) => x.id === cls);
    const s = c?.primary || 'str';
    return add(id, pos, 'attr', { theme, mods: [{ s, v: 10 }], name: { str: '筋力', dex: '敏捷', int: '知力' }[s] });
  };

  // 内側の環（20）
  const R_IN = 230;
  for (let i = 0; i < 20; i++) small(`in.${i}`, polar(R_IN, -90 + 18 * i), 'generic');
  for (let i = 0; i < 20; i++) link(`in.${i}`, `in.${(i + 1) % 20}`);

  // クラスごと
  TREE_CLASS_ORDER.forEach((cls, k) => {
    const th = CLASS_ANGLE[cls];
    const c = CLASSES.find((x) => x.id === cls);
    add(`${cls}.start`, polar(470, th), 'start', { cls, theme: BRANCH_THEMES[cls][1], name: `${c.name}の出発点`, mods: [{ s: c.primary, v: 5 }] });
    small(`${cls}.sp0`, polar(395, th), 'generic');
    attr(`${cls}.sp1`, polar(315, th), cls, 'generic');
    link(`${cls}.start`, `${cls}.sp0`); link(`${cls}.sp0`, `${cls}.sp1`); link(`${cls}.sp1`, `in.${4 * k}`);
    BRANCH_THEMES[cls].forEach((theme, bi) => {
      const ang = th + (bi - 1) * 21;
      const pre = `${cls}.b${bi}`;
      // 根元の鎖（4）: 色・主能力・色・色
      const c1 = [545, 615, 685, 755];
      c1.forEach((r, j) => { if (j === 1) attr(`${pre}.c${j}`, polar(r, ang), cls, theme); else small(`${pre}.c${j}`, polar(r, ang), theme); });
      link(`${cls}.start`, `${pre}.c0`);
      for (let j = 1; j < c1.length; j++) link(`${pre}.c${j - 1}`, `${pre}.c${j}`);
      // 真ん中の輪（6）と要の点
      const center = polar(900, ang);
      const inward = Math.atan2(-center.y, -center.x);
      for (let j = 0; j < 6; j++) {
        const a = inward + (j * Math.PI * 2) / 6;
        small(`${pre}.w${j}`, { x: Math.round(center.x + Math.cos(a) * 74), y: Math.round(center.y + Math.sin(a) * 74) }, theme);
      }
      for (let j = 0; j < 6; j++) link(`${pre}.w${j}`, `${pre}.w${(j + 1) % 6}`);
      link(`${pre}.c3`, `${pre}.w0`);
      const nb = NOTABLES[cls][bi];
      add(`${pre}.n`, center, 'notable', { theme, name: nb[0].name, mods: toMods(nb[0].mods) });
      link(`${pre}.n`, `${pre}.w2`); link(`${pre}.n`, `${pre}.w4`);
      // 先の鎖（2）と先の要の点
      small(`${pre}.d0`, polar(1040, ang), theme);
      attr(`${pre}.d1`, polar(1110, ang), cls, theme);
      link(`${pre}.w3`, `${pre}.d0`); link(`${pre}.d0`, `${pre}.d1`);
      add(`${pre}.e`, polar(1185, ang), 'notable', { theme, name: nb[1].name, mods: toMods(nb[1].mods) });
      link(`${pre}.d1`, `${pre}.e`);
    });
  });

  // クラスの間の橋（4 × 5）。右の枝の根元 → 次のクラスの左の枝の根元
  TREE_CLASS_ORDER.forEach((cls, k) => {
    const next = TREE_CLASS_ORDER[(k + 1) % 5];
    const th = CLASS_ANGLE[cls];
    const tA = BRANCH_THEMES[cls][2]; const tB = BRANCH_THEMES[next][0];
    for (let i = 0; i < 4; i++) small(`br.${k}.${i}`, polar(640, th + 21 + (30 * (i + 1)) / 5), i < 2 ? tA : tB);
    link(`${cls}.b2.c1`, `br.${k}.0`);
    for (let i = 1; i < 4; i++) link(`br.${k}.${i - 1}`, `br.${k}.${i}`);
    link(`br.${k}.3`, `${next}.b0.c1`);
  });

  // 外側の環: 枝の先・要石・幸運の群れの角度を軸に、9.5 度以内の間隔で埋める
  const R_RING = 1310;
  const anchors = [];
  TREE_CLASS_ORDER.forEach((cls) => { for (let bi = 0; bi < 3; bi++) anchors.push({ a: norm(CLASS_ANGLE[cls] + (bi - 1) * 21), branch: `${cls}.b${bi}.e` }); });
  for (const ks of KEYSTONES) anchors.push({ a: norm(ks.angle), ks: ks.id });
  TREE_CLASS_ORDER.forEach((cls, k) => anchors.push({ a: norm(CLASS_ANGLE[cls] + 36), cluster: k }));
  anchors.sort((x, y) => x.a - y.a);
  // 近い軸はまとめる
  const merged = [];
  for (const an of anchors) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(an.a - last.a) < 4) { Object.assign(last, { ...an, a: last.a }); last.all.push(an); } else merged.push({ ...an, all: [an] });
  }
  if (merged.length > 1 && Math.abs(merged[0].a + 360 - merged[merged.length - 1].a) < 4) { const f = merged.shift(); merged[merged.length - 1].all.push(...f.all); }
  const ringIds = [];
  let ri = 0;
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i];
    const id = `ring.${ri++}`;
    small(id, polar(R_RING, m.a), 'outer');
    ringIds.push(id);
    for (const an of m.all) {
      if (an.branch) link(an.branch, id);
      if (an.ks) {
        const ks = KEYSTONE[an.ks];
        small(`ks.${ks.id}.s`, polar(1395, m.a), 'outer');
        add(`ks.${ks.id}`, polar(1480, m.a), 'keystone', { theme: 'ks', ks: ks.id, name: ks.name, mods: [{ s: `ks_${ks.id}`, v: 1 }, ...toMods(ks.mods)] });
        link(id, `ks.${ks.id}.s`); link(`ks.${ks.id}.s`, `ks.${ks.id}`);
      }
      if (an.cluster !== undefined) {
        const k = an.cluster;
        const ca = m.a;
        const center = polar(1095, ca);
        small(`cl.${k}.l`, polar(1222, ca), 'fortune');
        link(id, `cl.${k}.l`);
        const outward = Math.atan2(center.y, center.x);
        for (let j = 0; j < 5; j++) {
          const a = outward + (j * Math.PI * 2) / 5;
          small(`cl.${k}.${j}`, { x: Math.round(center.x + Math.cos(a) * 62), y: Math.round(center.y + Math.sin(a) * 62) }, 'fortune');
        }
        for (let j = 0; j < 5; j++) link(`cl.${k}.${j}`, `cl.${k}.${(j + 1) % 5}`);
        link(`cl.${k}.l`, `cl.${k}.0`);
      }
    }
    // 次の軸までを埋める
    const nx = merged[(i + 1) % merged.length];
    let gap = nx.a - m.a; if (gap <= 0) gap += 360;
    const fill = Math.max(0, Math.ceil(gap / 9.5) - 1);
    for (let f = 1; f <= fill; f++) {
      const fid = `ring.${ri++}`;
      small(fid, polar(R_RING, m.a + (gap * f) / (fill + 1)), 'outer');
      ringIds.push(fid);
    }
  }
  for (let i = 0; i < ringIds.length; i++) link(ringIds[i], ringIds[(i + 1) % ringIds.length]);
  return { nodes, byId };
}
function norm(a) { let x = a % 360; if (x < 0) x += 360; return x; }

const BUILT = build();
export const TREE_NODES = BUILT.nodes;
export const TREE_NODE = BUILT.byId;
export const TREE_START = Object.fromEntries(TREE_CLASS_ORDER.map((c) => [c, `${c}.start`]));
export const TREE_BOUNDS = (() => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const n of TREE_NODES) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  return { x0, y0, x1, y1 };
})();

/** 振り直しの費用（Lv30 までは無料）。points = 返ってくる点の数 */
export const TREE_FREE_RESPEC_LEVEL = 30;
export const treeRespecCost = (level, points, Gfn) => (level < TREE_FREE_RESPEC_LEVEL || points <= 0 ? 0 : Math.round(points * 6 * Gfn(level))); // Gfn はゴールドの曲線 PG
/** 主人公のレベルで手に入るパッシブの点の追加（10 レベルごとに +1） */
export const treeBonusPoints = (level) => Math.floor(level / 10);

// ---------------- パラゴン（Lv100 以降、上限なし）
// 盤 4 つ。各盤の main の線は上限なし、それ以外は 50 点まで。
// stat: 'primary' はクラスの主能力に読み替える。stats: [...] は複数の能力に同じ値
export const PARAGON_CAP = 50;
export const PARAGON_BOARDS = [
  {
    id: 'off', name: '攻め', color: '#ff6a4a', desc: '主能力と攻めの数値',
    lines: [
      { id: 'main', name: '主能力', stat: 'primary', per: 5, cap: 0 },
      { id: 'dmg', name: 'ダメージ', stat: 'inc_dmg', per: 0.5 },
      { id: 'as', name: '攻撃速度', stat: 'attack_speed', per: 0.2 },
      { id: 'cc', name: 'クリティカル率', stat: 'crit_chance', per: 0.1 },
      { id: 'cd', name: 'クリティカルダメージ', stat: 'crit_damage', per: 1 },
    ],
  },
  {
    id: 'def', name: '守り', color: '#6aa0ff', desc: '体力と守りの数値',
    lines: [
      { id: 'main', name: '体力', stat: 'vit', per: 5, cap: 0 },
      { id: 'life', name: '最大ライフ', stat: 'inc_life', per: 0.5 },
      { id: 'armor', name: 'アーマー', stat: 'inc_armor', per: 1 },
      { id: 'res', name: '全耐性', stat: 'res_all', per: 0.2 },
      { id: 'regen', name: '最大ライフの再生', stat: 'life_regen_pct', per: 0.02 },
    ],
  },
  {
    id: 'util', name: '便利', color: '#6ee08a', desc: '稼ぎと便利な数値',
    lines: [
      { id: 'main', name: 'ゴールド獲得', stat: 'gold_find', per: 0.5, cap: 0 },
      { id: 'move', name: '移動速度', stat: 'move_speed', per: 0.5 },
      { id: 'cdr', name: 'クールダウン短縮', stat: 'cdr', per: 0.2 },
      { id: 'cost', name: 'リソース消費軽減', stat: 'cost_red', per: 0.2 },
      { id: 'mf', name: 'レア発見率', stat: 'magic_find', per: 0.5 },
    ],
  },
  {
    id: 'elem', name: '属性', color: '#c77dff', desc: 'すべての属性のダメージと状態異常',
    lines: [
      { id: 'main', name: '全属性のダメージ', stats: ['inc_phys', 'inc_fire', 'inc_cold', 'inc_lightning', 'inc_poison', 'inc_void'], per: 0.4, cap: 0 },
      { id: 'pen', name: '耐性貫通', stat: 'res_pen', per: 0.1 },
      { id: 'status', name: '状態異常ダメージ', stat: 'status_dmg', per: 1 },
      { id: 'area', name: '効果範囲', stat: 'area', per: 0.4 },
      { id: 'minion', name: '召喚物のダメージ', stat: 'inc_minion', per: 0.6 },
    ],
  },
];
export const PARAGON_LINE = Object.fromEntries(PARAGON_BOARDS.flatMap((b) => b.lines.map((l) => [`${b.id}.${l.id}`, { ...l, board: b.id, key: `${b.id}.${l.id}`, cap: l.cap === 0 ? 0 : (l.cap || PARAGON_CAP) }])));
/** おまかせの重み（大きいほど先に振る。上限のある線は早めに埋まる） */
export const PARAGON_AUTO_WEIGHT = {
  'off.main': 1.0, 'off.dmg': 1.6, 'off.as': 1.3, 'off.cc': 1.4, 'off.cd': 1.4,
  'def.main': 0.8, 'def.life': 1.5, 'def.armor': 1.1, 'def.res': 1.3, 'def.regen': 0.9,
  'util.main': 0.15, 'util.move': 0.9, 'util.cdr': 1.3, 'util.cost': 1.0, 'util.mf': 0.8,
  'elem.main': 0.9, 'elem.pen': 1.2, 'elem.status': 0.7, 'elem.area': 0.9, 'elem.minion': 0.6,
};
