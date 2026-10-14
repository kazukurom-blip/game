// 能力値（ステータス）の一覧。装備のオプション・パッシブ・転生の強化など、すべての「効果」はこのキーで書く。
//
// mod（効果）の形: { s: 'inc_dmg', v: 25 }   … 「全ダメージ +25%」
// 集め方（agg）:
//   'sum' … 足し算（ほとんどの能力）
//   'mul' … 掛け算。v は % で、合計は (Π(1+v/100) - 1) × 100 として持つ（「最終ダメージ」「被ダメージ軽減」など）
//   'max' … 一番大きい値だけ使う
// kind: 'flat' は数値そのまま（大きくなる値は曲線 P(ilvl) で伸びる）、'pct' は %。
// scale: true の能力はアイテムレベルの曲線で伸びる（装備のオプションの値の計算に使う）。
//
// 動的なキー（コロン付き）:
//   'skill_lvl:<skillId>'  そのスキルのレベル +N
//   'skill_dmg:<skillId>'  そのスキルのダメージ +N%
//   'skill_cdr:<skillId>'  そのスキルのクールダウン短縮 +N%
//   'family_dmg:<family>'  その種族の敵へのダメージ +N%

export const ELEMENTS = ['phys', 'fire', 'cold', 'lightning', 'poison', 'void'];
export const ELEMENT_NAMES = { phys: '物理', fire: '火炎', cold: '冷気', lightning: '雷撃', poison: '毒', void: '虚無' };
export const ELEMENT_COLORS = { phys: '#e8e2d0', fire: '#ff7a2a', cold: '#7fd8ff', lightning: '#ffe45a', poison: '#7cff5a', void: '#c77dff' };

// スキルの種類（タグ）。スキル定義の tags と、能力 inc_<tag> が対応する
export const SKILL_TAGS = ['attack', 'spell', 'melee', 'projectile', 'area', 'dot', 'minion', 'channel', 'movement', 'buff', 'summon', 'trap', 'aura'];
export const TAG_NAMES = { attack: '攻撃', spell: '呪文', melee: '近接', projectile: '投射', area: '範囲', dot: '継続', minion: '召喚', channel: '詠唱', movement: '移動', buff: '強化', summon: '召喚', trap: '罠', aura: 'オーラ' };

const S = [];
function def(key, name, o = {}) { S.push({ key, name, kind: 'pct', agg: 'sum', cat: 'offense', ...o }); }

// ---------- 基本の能力
def('str', '筋力', { kind: 'flat', cat: 'attr', desc: '戦士の主能力。1 につきダメージ +0.25%（戦士）。アーマー +0.1%' });
def('dex', '敏捷', { kind: 'flat', cat: 'attr', desc: '狩人・暗殺者の主能力。1 につきダメージ +0.25%。回避 +0.02%' });
def('int', '知力', { kind: 'flat', cat: 'attr', desc: '魔導士・死霊術師の主能力。1 につきダメージ +0.25%。全耐性 +0.02%' });
def('vit', '体力', { kind: 'flat', cat: 'attr', desc: '1 につき最大ライフ +0.15%' });
def('all_attr', '全能力', { kind: 'flat', cat: 'attr', desc: '筋力・敏捷・知力・体力すべてに加算' });

// ---------- 攻撃
for (const e of ELEMENTS) def(`add_${e}`, `${ELEMENT_NAMES[e]}ダメージ追加`, { kind: 'flat', scale: true, desc: `武器ダメージに${ELEMENT_NAMES[e]}ダメージを足す`, el: e });
def('inc_dmg', 'ダメージ', { desc: 'すべてのダメージが増える（足し算の枠）' });
for (const e of ELEMENTS) def(`inc_${e}`, `${ELEMENT_NAMES[e]}ダメージ`, { el: e });
def('inc_elemental', '属性ダメージ', { desc: '火炎・冷気・雷撃のダメージ' });
for (const t of ['attack', 'spell', 'melee', 'projectile', 'area', 'dot', 'minion']) def(`inc_${t}`, `${TAG_NAMES[t]}スキルのダメージ`, { tag: t });
def('more_dmg', '最終ダメージ', { agg: 'mul', desc: '他のすべてと掛け算される特別な枠' });
def('attack_speed', '攻撃速度', { desc: '攻撃と詠唱の速さ' });
def('crit_chance', 'クリティカル率', { desc: '基本 5%。上限 95%' });
def('crit_damage', 'クリティカルダメージ', { desc: 'クリティカル時の倍率に足す（基本 +50%）' });
def('multistrike', '連撃率', { desc: '攻撃がもう一度当たる確率' });
def('area', '効果範囲', { desc: '範囲スキルの大きさ' });
def('proj_count', '投射物の数', { kind: 'flat', desc: '投射スキルの弾が増える' });
def('pierce', '貫通', { kind: 'flat', desc: '弾が敵を突き抜ける回数' });
def('chain', '連鎖', { kind: 'flat', desc: '連鎖スキルが跳ねる回数' });
def('cdr', 'クールダウン短縮', { desc: '上限 60%' });
def('cost_red', 'リソース消費軽減', { desc: '上限 60%' });
def('res_pen', '耐性貫通', { desc: '敵の耐性を無視する' });
def('dmg_elite', 'エリートへのダメージ');
def('dmg_boss', 'ボスへのダメージ');
def('dmg_vs_low', '瀕死の敵へのダメージ', { desc: 'ライフ 30% 以下の敵' });
def('ignite_chance', '炎上率', { desc: '火炎ヒットで炎上（3 秒の継続ダメージ）' });
def('freeze_chance', '凍結率', { desc: '冷気ヒットで敵を 1 秒止める' });
def('shock_chance', '感電率', { desc: '雷撃ヒットで敵の被ダメージ +20%' });
def('poison_chance', '毒付与率', { desc: 'ヒットで毒（重ねがけできる継続ダメージ）' });
def('bleed_chance', '出血率', { desc: '物理ヒットで出血（継続ダメージ）' });
def('status_dmg', '状態異常ダメージ', { desc: '炎上・毒・出血のダメージ' });
def('life_on_hit', 'ヒット時ライフ回復', { kind: 'flat', scale: true });
def('leech', 'ライフ吸収', { desc: '与えたダメージの % をライフに（1 秒に最大ライフの 20% まで）' });
def('life_on_kill', 'キル時ライフ回復', { kind: 'flat', scale: true });
def('resource_on_hit', 'ヒット時リソース回復', { kind: 'flat' });
def('skill_lvl', '全スキルのレベル', { kind: 'flat', desc: 'すべてのスキルのレベル +N' });
def('weapon_dmg', '武器ダメージ', { desc: '武器の基本ダメージが増える' });

// ---------- 防御
def('life', '最大ライフ', { kind: 'flat', scale: true, cat: 'defense' });
def('inc_life', '最大ライフ', { cat: 'defense' });
def('life_regen', 'ライフ再生', { kind: 'flat', scale: true, cat: 'defense', desc: '1 秒ごと' });
def('life_regen_pct', '最大ライフの再生', { cat: 'defense', desc: '1 秒ごとに最大ライフの N%' });
def('armor', 'アーマー', { kind: 'flat', scale: true, cat: 'defense', desc: '受けるダメージを減らす（上限 85%）' });
def('inc_armor', 'アーマー', { cat: 'defense' });
for (const e of ['fire', 'cold', 'lightning', 'poison', 'void']) def(`res_${e}`, `${ELEMENT_NAMES[e]}耐性`, { cat: 'defense', el: e, desc: '上限 75%' });
def('res_all', '全耐性', { cat: 'defense', desc: '火炎・冷気・雷撃・毒の耐性（虚無には半分）' });
def('dodge', '回避率', { cat: 'defense', desc: '攻撃をよける。上限 60%' });
def('block', 'ブロック率', { cat: 'defense', desc: '盾で攻撃を防ぐ（受けるダメージ 70% 減）。上限 75%' });
def('dr', '被ダメージ軽減', { agg: 'mul', cat: 'defense', desc: '最後にかかる軽減（掛け算）' });
def('thorns', '反射ダメージ', { kind: 'flat', scale: true, cat: 'defense', desc: '攻撃してきた敵にダメージ' });
def('cc_immune', '状態異常耐性', { cat: 'defense' });

// ---------- 便利
def('move_speed', '移動速度', { cat: 'utility', desc: '次の群れまでの移動が速くなる（上限 +150%）' });
def('gold_find', 'ゴールド獲得', { cat: 'utility' });
def('magic_find', 'レア発見率', { cat: 'utility', desc: '良いレアリティが出やすくなる' });
def('item_quantity', 'アイテム発見数', { cat: 'utility', desc: '落ちるアイテムの数が増える' });
def('xp_bonus', '経験値', { cat: 'utility' });
def('max_resource', '最大リソース', { kind: 'flat', cat: 'utility' });
def('resource_regen', 'リソース再生', { cat: 'utility' });
def('offline_gain', 'オフライン効率', { cat: 'utility' });
def('mat_find', '素材獲得', { cat: 'utility', desc: '分解・ドロップの素材が増える' });

// ---------- 召喚物
def('minion_life', '召喚物のライフ', { cat: 'minion' });
def('minion_count', '召喚数', { kind: 'flat', cat: 'minion' });
def('minion_as', '召喚物の攻撃速度', { cat: 'minion' });

export const STATS = Object.fromEntries(S.map((d) => [d.key, d]));

/** 実行中に足す（データ担当がほかのファイルから追加したいとき） */
export function registerStat(key, name, o = {}) {
  if (STATS[key]) return STATS[key];
  const d = { key, name, kind: 'pct', agg: 'sum', cat: 'offense', ...o };
  STATS[key] = d;
  return d;
}

/** 動的なキーも含めて定義を返す */
export function statDef(key) {
  if (STATS[key]) return STATS[key];
  const [pre, arg] = key.split(':');
  if (pre === 'skill_lvl') return { key, name: `「${arg}」のレベル`, kind: 'flat', agg: 'sum', cat: 'offense', dyn: pre, arg };
  if (pre === 'skill_dmg') return { key, name: `「${arg}」のダメージ`, kind: 'pct', agg: 'sum', cat: 'offense', dyn: pre, arg };
  if (pre === 'skill_cdr') return { key, name: `「${arg}」のクールダウン短縮`, kind: 'pct', agg: 'sum', cat: 'offense', dyn: pre, arg };
  if (pre === 'family_dmg') return { key, name: `${arg}へのダメージ`, kind: 'pct', agg: 'sum', cat: 'offense', dyn: pre, arg };
  return { key, name: key, kind: 'pct', agg: 'sum', cat: 'offense', unknown: true };
}

/** 効果の一覧を足し合わせる。戻り値は { key: 値 } */
export function aggregate(mods, into = {}) {
  const mulAcc = {};
  for (const m of mods) {
    if (!m || m.s === undefined) continue;
    const d = statDef(m.s);
    const v = Number(m.v) || 0;
    if (d.agg === 'mul') { mulAcc[m.s] = (mulAcc[m.s] ?? 1) * (1 + v / 100); } else if (d.agg === 'max') { into[m.s] = Math.max(into[m.s] ?? -Infinity, v); } else { into[m.s] = (into[m.s] ?? 0) + v; }
  }
  for (const k in mulAcc) {
    const prev = into[k] !== undefined ? 1 + into[k] / 100 : 1;
    into[k] = (prev * mulAcc[k] - 1) * 100;
  }
  return into;
}

/** 'dr' のような「軽減」は 1-Π(1-v) で集めたいので専用 */
export function aggregateLess(values) {
  let keep = 1;
  for (const v of values) keep *= 1 - Math.min(95, Math.max(0, v)) / 100;
  return (1 - keep) * 100;
}

/** 効果 1 つを日本語で（ツールチップ用） */
export function describeMod(m, fmtNum = (x) => String(Math.round(x))) {
  const d = statDef(m.s);
  const v = m.v;
  const sign = v >= 0 ? '+' : '';
  if (d.kind === 'flat') {
    if (d.key === 'proj_count' || d.key === 'pierce' || d.key === 'chain' || d.key === 'minion_count' || d.key === 'skill_lvl' || d.dyn === 'skill_lvl') return `${d.name} ${sign}${Math.round(v)}`;
    return `${sign}${fmtNum(v)} ${d.name}`;
  }
  if (d.key === 'dr') return `受けるダメージ -${round1(v)}%`;
  if (d.key === 'more_dmg') return `ダメージ ×${round2(1 + v / 100)}（最終）`;
  return `${d.name} ${sign}${round1(v)}%`;
}
function round1(x) { return Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
