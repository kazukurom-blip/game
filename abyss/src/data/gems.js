// 宝石（7 種 × 10 段階）・深淵の宝石（8 種・裂け目で育つ）・ルーン（24）・ルーン語（20）。担当: アイテム担当。
//
// 宝石: ソケットにはめると、場所（武器 / 防具 / 装飾品）によって効果が変わる。同じ段階 3 つでひとつ上の段階に合成できる。
//   持ち物のキーは '<種類>_<段階>'（例 'ember_3'）。ソケットにはめた物も同じキー。
//   効果の数値: scale のある能力は「base × P(段階のレベル)」、それ以外は「base × 段階の倍率」。
// 深淵の宝石: 1 種につき 1 つだけ持てる。首飾り・指輪のソケットにだけはめられる。ソケットのキーは 'lg:<id>'。
// ルーン: ソケットのキーは 'r:<id>'。ノーマル（オプション無し）の装備に、ルーン語の順番どおりにちょうどの数だけはめると
//   ルーン語の装備（名前つき・特別な力）に変わる。ルーン語にしたルーンは外せない。

export const GEM_TIERS = 10;
export const GEM_TIER_NAMES = ['欠けた', '小さな', 'ふつうの', '磨かれた', '美しい', '見事な', '完璧な', '至高の', '王者の', '深淵の'];
/** 段階ごとのレベル（scale のある能力の伸び） */
export const GEM_TIER_LEVEL = [1, 10, 20, 32, 45, 58, 72, 86, 100, 115];
/** 段階ごとの倍率（scale の無い能力） */
export const GEM_TIER_MULT = [1, 1.6, 2.3, 3.1, 4, 5, 6.1, 7.3, 8.6, 10];

export const GEMS = [
  { id: 'blood', name: '血晶', color: '#d0203a', desc: '乾かない血の結晶。命を吸い、命を与える。',
    weapon: { s: 'leech', base: 0.25 }, armor: { s: 'inc_life', base: 1.2 }, jewelry: { s: 'life_regen', base: 0.3 } },
  { id: 'ember', name: '熾火石', color: '#ff7a2a', desc: '中で小さな火が燃え続ける石。',
    weapon: { s: 'add_fire', base: 0.9 }, armor: { s: 'res_fire', base: 3 }, jewelry: { s: 'inc_fire', base: 3 } },
  { id: 'frost', name: '氷晶石', color: '#7fd8ff', desc: '真夏でも溶けない、凍原の涙。',
    weapon: { s: 'add_cold', base: 0.9 }, armor: { s: 'res_cold', base: 3 }, jewelry: { s: 'inc_cold', base: 3 } },
  { id: 'storm', name: '雷鳴石', color: '#ffe45a', desc: '雷の落ちた地面から掘り出される。触ると指がしびれる。',
    weapon: { s: 'add_lightning', base: 1.0 }, armor: { s: 'res_lightning', base: 3 }, jewelry: { s: 'inc_lightning', base: 3 } },
  { id: 'venom', name: '毒蛇石', color: '#7cff5a', desc: '大蛇の胆石。舐めると死ぬ。',
    weapon: { s: 'add_poison', base: 0.9 }, armor: { s: 'res_poison', base: 3 }, jewelry: { s: 'inc_poison', base: 3 } },
  { id: 'star', name: '星辰石', color: '#f2f0ff', desc: '流れ星の芯。夜になると淡く光る。',
    weapon: { s: 'crit_damage', base: 4 }, armor: { s: 'res_all', base: 1.5 }, jewelry: { s: 'crit_chance', base: 0.6 } },
  { id: 'abyss', name: '深淵石', color: '#9a4aff', desc: '深淵の底から湧き上がる紫の石。覗き込むと吸い込まれそうになる。',
    weapon: { s: 'inc_dmg', base: 2.5 }, armor: { s: 'inc_armor', base: 4 }, jewelry: { s: 'magic_find', base: 3 } },
];
export const GEM = Object.fromEntries(GEMS.map((g) => [g.id, g]));

/** 宝石を合成するゴールド（段階 t の 3 つ → t+1） */
export const gemCombineGold = (t) => Math.round(40 * 2.6 ** t);

// ---------------- 深淵の宝石
export const LEGENDARY_GEMS = [
  { id: 'ruin', name: '破滅の瞳', color: '#ff4d6d', power: 'lgp_ruin', desc: '見つめられた者は、自分の終わりを思い出す。' },
  { id: 'bane', name: '強者殺しの石', color: '#ffb84a', power: 'lgp_bane', desc: '強い者ほど、この石の前では脆くなる。' },
  { id: 'spite', name: '怨嗟の棘', color: '#7cff5a', power: 'lgp_spite', desc: '恨みを吸って育った棘。刺さると十日は抜けない。' },
  { id: 'storm', name: '迅雷の核', color: '#ffe45a', power: 'lgp_storm', desc: '雷雲の心臓。脈打つたびに稲妻が走る。' },
  { id: 'tide', name: '満ち潮の珠', color: '#4ac0ff', power: 'lgp_tide', desc: '囲まれるほど満ちる潮。' },
  { id: 'ember', name: '燠火の心', color: '#ff7a2a', power: 'lgp_ember', desc: '消えかけた焚き火の、最後の温もり。' },
  { id: 'greed', name: '強欲の金貨', color: '#ffd84a', power: 'lgp_greed', desc: '一枚拾えば、もう一枚欲しくなる。' },
  { id: 'echo', name: '重なる残響', color: '#c77dff', power: 'lgp_echo', desc: '唱えた言葉が、消えずに重なっていく。' },
];
export const LEGENDARY_GEM = Object.fromEntries(LEGENDARY_GEMS.map((g) => [g.id, g]));
export const LGEM_MAX_LEVEL = 150;

/** 裂け目の段階 − 宝石のレベル で決まる強化の成功率（%） */
export function lgemUpgradeChance(riftLevel, gemLevel) {
  const d = riftLevel - gemLevel;
  if (d >= 7) return 100;
  if (d >= 0) return 60 + 6 * d;
  const table = { '-1': 30, '-2': 15, '-3': 8, '-4': 4, '-5': 2, '-6': 1 };
  return table[d] ?? 0;
}

// ---------------- ルーン（段階 1〜24。上ほど珍しい）
// 効果の v: scale のある能力は Lv1 の値（ルーンのレベル = 4 × 段階 で伸びる）
const R = (id, name, tier, color, w, a, j) => ({ id, name, tier, color, weapon: { s: w[0], v: w[1] }, armor: { s: a[0], v: a[1] }, jewelry: { s: j[0], v: j[1] } });
export const RUNES = [
  R('hai', '灰', 1, '#b0a898', ['add_phys', 1.2], ['life', 3], ['magic_find', 5]),
  R('rin', '燐', 2, '#ff8a3a', ['add_fire', 1.2], ['res_fire', 8], ['inc_fire', 6]),
  R('shimo', '霜', 3, '#9ae0ff', ['add_cold', 1.2], ['res_cold', 8], ['inc_cold', 6]),
  R('rai', '雷', 4, '#ffe45a', ['add_lightning', 1.4], ['res_lightning', 8], ['inc_lightning', 6]),
  R('doku', '毒', 5, '#7cff5a', ['add_poison', 1.2], ['res_poison', 8], ['inc_poison', 6]),
  R('hone', '骨', 6, '#e8e0c8', ['inc_minion', 8], ['minion_life', 10], ['inc_minion', 6]),
  R('chi', '血', 7, '#e03040', ['leech', 0.6], ['life_regen', 0.6], ['life_on_hit', 0.8]),
  R('kage', '影', 8, '#6a5a8a', ['crit_chance', 2], ['dodge', 2], ['crit_damage', 10]),
  R('tsuki', '月', 9, '#c8d8ff', ['inc_cold', 10], ['res_all', 4], ['resource_regen', 8]),
  R('hoshi', '星', 10, '#f2f0ff', ['crit_damage', 12], ['res_all', 5], ['crit_chance', 1.5]),
  R('tetsu', '鉄', 11, '#9aa4b0', ['weapon_dmg', 15], ['inc_armor', 12], ['armor', 3]),
  R('kaze', '風', 12, '#9affd0', ['attack_speed', 4], ['move_speed', 5], ['attack_speed', 3]),
  R('kiri', '霧', 13, '#c0c8d0', ['inc_elemental', 10], ['dodge', 2.5], ['cdr', 2]),
  R('suna', '砂', 14, '#d8b070', ['add_phys', 2], ['armor', 4], ['gold_find', 10]),
  R('kumo', '雲', 15, '#e0e8f0', ['inc_lightning', 12], ['res_lightning', 12], ['inc_elemental', 8]),
  R('yami', '闇', 16, '#7a4aaa', ['add_void', 1.8], ['res_void', 6], ['inc_void', 10]),
  R('hikari', '光', 17, '#fff4c0', ['inc_dmg', 10], ['inc_life', 5], ['xp_bonus', 5]),
  R('yaiba', '刃', 18, '#d0d8e0', ['inc_phys', 15], ['thorns', 4], ['inc_attack', 10]),
  R('tate', '盾', 19, '#a0b0c0', ['dmg_elite', 12], ['dr', 2], ['res_all', 6]),
  R('kanmuri', '冠', 20, '#ffd84a', ['dmg_boss', 12], ['inc_life', 7], ['all_attr', 8]),
  R('ou', '王', 21, '#ffb84a', ['inc_dmg', 15], ['res_all', 8], ['magic_find', 12]),
  R('kyo', '虚', 22, '#b07dff', ['res_pen', 6], ['res_void', 10], ['inc_spell', 12]),
  R('fuchi', '淵', 23, '#8a3aff', ['weapon_dmg', 30], ['dr', 3], ['crit_damage', 20]),
  R('owari', '終', 24, '#ff4d6d', ['crit_damage', 30], ['inc_life', 10], ['skill_lvl', 1]),
];
export const RUNE = Object.fromEntries(RUNES.map((r) => [r.id, r]));
export const runeLevel = (r) => 4 * r.tier;
/** ルーンを合成するゴールド（段階 t の 3 つ → t+1） */
export const runeCombineGold = (t) => Math.round(60 * 1.45 ** t);

// ---------------- ルーン語（20）
// mods の v: scale のある能力は Lv1 の値（装備のアイテムレベルで伸びる）。power の r は力の強さ（0..1）の範囲
const RW = (id, name, runes, slots, mods, power, flavor) => ({ id, name, runes, slots, mods, power, flavor });
export const RUNEWORDS = [
  // 武器（2 つ）
  RW('rw_kindle', '焚き火', ['rin', 'hai'], ['weapon'], [{ s: 'add_fire', v: 2.5 }, { s: 'ignite_chance', v: 15 }], { id: 'pw_ashheart', r: [0.6, 1] }, '灰の中から、もう一度火を起こす。'),
  RW('rw_icicle', '氷柱', ['shimo', 'tsuki'], ['weapon'], [{ s: 'add_cold', v: 2.5 }, { s: 'freeze_chance', v: 6 }], { id: 'pw_shatter', r: [0.6, 1] }, '軒先から落ちた氷柱が、そのまま刃になった。'),
  RW('rw_spark', '閃き', ['rai', 'kaze'], ['weapon'], [{ s: 'add_lightning', v: 3 }, { s: 'attack_speed', v: 8 }], { id: 'pw_thundermsg', r: [0.6, 1] }, '思いついた時には、もう斬っている。'),
  RW('rw_fang', '牙', ['yaiba', 'chi'], ['weapon'], [{ s: 'inc_phys', v: 40 }, { s: 'leech', v: 1.5 }], { id: 'pw_bloodfall', r: [0.6, 1] }, '血の味を覚えた刃は、もう鞘に戻りたがらない。'),
  RW('rw_gravecall', '墓の呼び声', ['hone', 'kage'], ['weapon'], [{ s: 'inc_minion', v: 40 }, { s: 'minion_as', v: 15 }], { id: 'pw_legion', r: [0.6, 1] }, '墓地を通るたび、後ろの足音が増えていく。'),
  // 武器（3 つ）
  RW('rw_tempest', '大嵐', ['rai', 'kumo', 'kaze'], ['weapon'], [{ s: 'inc_lightning', v: 60 }, { s: 'attack_speed', v: 12 }], { id: 'pw_skyhammer', r: [0.7, 1] }, '空の怒りを三つ束ねると、こうなる。'),
  RW('rw_inferno', '煉獄', ['rin', 'hoshi', 'ou'], ['weapon'], [{ s: 'inc_fire', v: 60 }, { s: 'crit_damage', v: 50 }], { id: 'pw_fallingstar', r: [0.7, 1] }, '燃える星を王が投げ落とした夜の記憶。'),
  RW('rw_nightfall', '夜の帳', ['kage', 'yami', 'tsuki'], ['weapon'], [{ s: 'add_void', v: 3.5 }, { s: 'crit_chance', v: 6 }], { id: 'pw_voidrift', r: [0.7, 1] }, '幕が下りれば、舞台の上には誰もいない。'),
  RW('rw_executioner', '処刑台', ['tetsu', 'yaiba', 'kanmuri'], ['weapon'], [{ s: 'weapon_dmg', v: 90 }, { s: 'dmg_vs_low', v: 40 }], { id: 'pw_mercy', r: [0.7, 1] }, '冠をかぶった者も、ここでは等しく首一つ。'),
  RW('rw_plague', '疫病', ['doku', 'hone', 'kyo'], ['weapon'], [{ s: 'inc_poison', v: 60 }, { s: 'poison_chance', v: 25 }], { id: 'pw_plague', r: [0.7, 1] }, '一人が咳をすれば、十人が倒れる。'),
  // 胴
  RW('rw_bulwark', '砦', ['tetsu', 'tate'], ['chest'], [{ s: 'inc_armor', v: 60 }, { s: 'dr', v: 6 }], { id: 'pw_d_fortress', r: [0.6, 1] }, '一人で立つ砦。'),
  RW('rw_lifeblood', '命の泉', ['chi', 'hikari'], ['chest'], [{ s: 'inc_life', v: 15 }, { s: 'life_regen_pct', v: 1 }], { id: 'pw_d_spring', r: [0.6, 1] }, '流した血の分だけ、泉は湧く。'),
  RW('rw_prism', '虹の守り', ['hoshi', 'kumo'], ['chest'], [{ s: 'res_all', v: 20 }], { id: 'pw_d_ward', r: [0.6, 1] }, '雨上がりの空が、すべての災いを遠ざける。'),
  RW('rw_rebirth', '炎の衣', ['rin', 'owari'], ['chest'], [{ s: 'res_fire', v: 30 }, { s: 'inc_life', v: 12 }], { id: 'pw_d_laststand', r: [0.6, 1] }, '燃え尽きても、終わりではない。'),
  // 頭
  RW('rw_insight', '洞察', ['kiri', 'hikari'], ['helm'], [{ s: 'cdr', v: 8 }, { s: 'resource_regen', v: 25 }], { id: 'pw_sands', r: [0.6, 1] }, '霧の向こうに、次の一手が見える。'),
  RW('rw_crown', '王冠', ['kanmuri', 'ou'], ['helm'], [{ s: 'magic_find', v: 30 }, { s: 'gold_find', v: 30 }], { id: 'pw_u_treasure', r: [0.6, 1] }, '王の目には、宝の在りかがわかる。'),
  RW('rw_watch', '見張り', ['kaze', 'kage'], ['helm'], [{ s: 'crit_chance', v: 5 }, { s: 'dodge', v: 4 }], { id: 'pw_deadeye', r: [0.6, 1] }, '風の音で敵の数を知る。'),
  // 脚
  RW('rw_stone', '不動の石', ['suna', 'tetsu'], ['legs'], [{ s: 'armor', v: 6 }, { s: 'life', v: 8 }], { id: 'pw_d_stand', r: [0.6, 1] }, '砂が固まり、石になる。'),
  RW('rw_wander', '放浪', ['kaze', 'suna'], ['legs'], [{ s: 'move_speed', v: 15 }, { s: 'xp_bonus', v: 10 }], { id: 'pw_u_gale', r: [0.6, 1] }, '風の吹くまま、砂の続くまま。'),
  RW('rw_abyss', '深淵', ['fuchi', 'owari'], ['legs'], [{ s: 'inc_dmg', v: 30 }, { s: 'dr', v: 5 }], { id: 'pw_backwater', r: [0.7, 1] }, '底まで落ちた者だけが知る強さ。'),
];
export const RUNEWORD = Object.fromEntries(RUNEWORDS.map((r) => [r.id, r]));
