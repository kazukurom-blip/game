// v3 装備成長データ（純データ・純関数。systems/tune.js / potential.js / progression.js が共有）
//  - ネオン・チューン（★強化）: REFERENCE_MAPLE_SYSTEMS §3 S-3 の表どおり。破壊なし・★は下がらない・天井つき
//  - ハックチップ（潜在）     : REFERENCE §3 S-4。等級・行抽選・天井・行ロック・全確率公開
import { ITEMS } from './items.js';

// ============================================================ 共通
/** クラスの主ステータス（★16以上・潜在「主ステ%」が伸ばすステータス） */
export const MAIN_STAT = { luna: 'dex', jin: 'str', hacker: 'int' };
export const mainStatOf = (heroId) => MAIN_STAT[heroId] || 'str';
export const ARMOR_SLOTS = ['hat', 'top', 'bottom', 'shoes'];

// ============================================================ ネオン・チューン（★強化）
/** 成功率（★s → ★s+1 の確率）。index = 現在の★ */
export const TUNE_RATES = [0.95, 0.9, 0.85, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.3, 0.25, 0.2, 0.15, 0.15, 0.1, 0.1, 0.07, 0.05, 0.03];
/** 天井: 連続失敗で N 回目は確定成功（REFERENCE S-3 の表。目安 N ≈ ceil(2.1 / p)） */
export const TUNE_PITY = [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 7, 8, 8, 9, 11, 15, 15, 21, 21, 30, 42, 70];
/** 期待試行回数（天井込み）= (1-(1-p)^N)/p */
export const TUNE_EXPECTED = TUNE_RATES.map((p, i) => (1 - Math.pow(1 - p, TUNE_PITY[i])) / p);
export const TUNE_MAX = 25;

/** 上限★（装備の reqLevel で決まる）。PET は 0（強化不可） */
export function maxStarFor(item) {
  const it = typeof item === 'string' ? ITEMS[item] : item;
  if (!it || it.type !== 'equip' || it.slot === 'pet') return 0;
  const r = it.reqLevel || 0;
  return r < 30 ? 5 : r < 60 ? 10 : r < 100 ? 15 : r < 150 ? 20 : 25;
}

const round10 = (v) => Math.round(v / 10) * 10;
/** 旧費用（基準額）$ = 50 + reqLv^1.8 × (s+1)^1.5 / 20 */
export function tuneBaseCost(star, reqLevel) {
  return 50 + Math.pow(Math.max(0, reqLevel || 0), 1.8) * Math.pow(star + 1, 1.5) / 20;
}
/**
 * 費用倍率（★が高いほど上がる）: 10^(1 + (s/24)^1.5)
 *  ★0→1 ≈ 10倍 / ★5→6 ≈ 12.5倍 / ★10→11 ≈ 18.6倍 / ★15→16 ≈ 31倍 / ★20→21 ≈ 58倍 / ★24→25 = 100倍
 *  装備は壊れない・★は下がらない代わりに、強化は「お金の使い道」として高くしてある
 */
export function tuneCostMultFor(star) {
  const s = Math.max(0, Math.min(TUNE_MAX - 1, star || 0));
  return Math.pow(10, 1 + Math.pow(s / (TUNE_MAX - 1), 1.5));
}
/** 費用 $ = 基準額 × 倍率（1万未満は 10 単位、1万以上は 100 単位に丸める） */
export function tuneCost(star, reqLevel) {
  const v = tuneBaseCost(star, reqLevel) * tuneCostMultFor(star);
  return v < 10000 ? round10(v) : Math.round(v / 100) * 100;
}

/**
 * starBonus(item, star, heroId) → ★0→star の合計上昇値 {atk, def, maxHp, str, dex, int, luk}
 *  武器: atk +3%（★1〜15） / +5%（★16〜25）（基礎atkに対して。最低 +1/+2）、★16以上は主ステ +3
 *  防具/アクセ: def +4%（最低+1）、maxHp +1.5%（最低 +2+reqLv×0.2）、主ステ +1（★1〜15）/ +3（★16〜）、★16以上は atk +1
 */
export function starBonus(item, star, heroId) {
  const it = typeof item === 'string' ? ITEMS[item] : item;
  const o = { atk: 0, def: 0, maxHp: 0, str: 0, dex: 0, int: 0, luk: 0 };
  if (!it || !star || it.slot === 'pet') return o;
  const ms = mainStatOf(heroId);
  const st = it.stats || {};
  for (let s = 1; s <= star; s++) {
    const high = s > 15;
    if (it.slot === 'weapon') {
      o.atk += Math.max(high ? 2 : 1, Math.round((st.atk || 0) * (high ? 0.05 : 0.03)));
      if (high) o[ms] += 3;
    } else {
      o.def += Math.max(1, Math.round((st.def || 0) * 0.04));
      o.maxHp += Math.max(Math.round(2 + (it.reqLevel || 0) * 0.2), Math.round((st.maxHp || 0) * 0.015));
      o[ms] += high ? 3 : 1;
      if (high) o.atk += 1;
    }
  }
  return o;
}

// ============================================================ ハックチップ（潜在）
export const POT_GRADES = ['rare', 'epic', 'legendary', 'mythic'];
export const POT_GRADE_INFO = {
  rare:      { name: 'レア',         color: '#4da6ff' },
  epic:      { name: 'エピック',     color: '#b04dff' },
  legendary: { name: 'レジェンダリ', color: '#ffb800' },
  mythic:    { name: 'ミシック',     color: '#ff3d7f', rainbow: true },
};
export const POT_LINES_N = 3;
/** 2・3行目が現等級になる確率（それ以外は1段下の等級の値） */
export const POT_SAME_GRADE_LINE = 0.25;
/** 等級アップ確率/回と天井（その等級で N 回目は確定アップ） */
export const POT_UPGRADE = {
  rare:      { to: 'epic',      p: 0.10,  pity: 15 },
  epic:      { to: 'legendary', p: 0.03,  pity: 50 },
  legendary: { to: 'mythic',    p: 0.008, pity: 150 },
};
/** 行ロックに必要なロック・チップ数（ロック行数 → 個数） */
export const POT_LOCK_COST = [0, 1, 3];

// 部位グループ
const G_ALL = ['hat', 'top', 'bottom', 'shoes', 'accessory', 'weapon'];
const G_WA = ['weapon', 'accessory'];
/**
 * 行のプール。values = [レア, エピック, レジェ, ミシック]（null = その等級には出ない）
 * stat キー（computeStats が解釈）: mainPct atkPct defPct maxHpPct crit bossDmg speed dropRate mesoRate cdr hpRecover
 * 単位: *Pct / crit / bossDmg / dropRate / mesoRate / hpRecover = 割合(0.03=3%)、speed = px/s、cdr = 秒
 */
export const POT_LINES = [
  { stat: 'mainPct',   name: '主ステータス',       values: [0.03, 0.06, 0.09, 0.12], slots: G_ALL, fmt: 'pct' },
  { stat: 'atkPct',    name: '攻撃力',             values: [0.03, 0.06, 0.09, 0.12], slots: G_WA, fmt: 'pct' },
  { stat: 'defPct',    name: '防御力',             values: [0.04, 0.08, 0.12, 0.15], slots: ARMOR_SLOTS, fmt: 'pct' },
  { stat: 'maxHpPct',  name: '最大HP',             values: [0.03, 0.06, 0.09, 0.12], slots: ARMOR_SLOTS, fmt: 'pct' },
  { stat: 'crit',      name: 'クリティカル率',     values: [0.02, 0.04, 0.06, 0.08], slots: G_WA, fmt: 'pct' },
  { stat: 'bossDmg',   name: 'ボスダメージ',       values: [null, 0.15, 0.25, 0.35], slots: ['weapon'], fmt: 'pct' },
  { stat: 'speed',     name: '移動速度',           values: [10, 20, 30, 40], slots: ['shoes'], fmt: 'flat' },
  { stat: 'dropRate',  name: 'アイテムドロップ率', values: [null, 0.05, 0.10, 0.15], slots: ['accessory'], fmt: 'pct' },
  { stat: 'mesoRate',  name: '所持金獲得量',       values: [null, 0.05, 0.10, 0.15], slots: ['accessory'], fmt: 'pct' },
  { stat: 'cdr',       name: 'スキルCT短縮',       values: [null, null, 0.5, 1], slots: ['hat'], fmt: 'sec' },
  { stat: 'hpRecover', name: '被弾時5%でHP回復',   values: [0.02, 0.04, 0.06, 0.08], slots: ARMOR_SLOTS, fmt: 'pct' },
];
export const POT_STAT_KEYS = POT_LINES.map((l) => l.stat);
export const POT_LINE_BY_STAT = Object.fromEntries(POT_LINES.map((l) => [l.stat, l]));

export const gradeIndex = (g) => POT_GRADES.indexOf(g);
export const lowerGrade = (g) => POT_GRADES[Math.max(0, gradeIndex(g) - 1)];
export const higherGrade = (g) => POT_GRADES[Math.min(POT_GRADES.length - 1, gradeIndex(g) + 1)];

/** その部位・行等級で出るオプション（等確率） */
export function potLinePool(slot, lineGrade) {
  const gi = gradeIndex(lineGrade);
  return POT_LINES.filter((l) => l.slots.includes(slot) && l.values[gi] != null);
}

/** 行の表示文字列 */
export function potLineText(line) {
  const d = POT_LINE_BY_STAT[line?.stat];
  if (!d) return '';
  const v = line.value;
  if (d.fmt === 'pct') return `${d.name} +${Math.round(v * 1000) / 10}%`;
  if (d.fmt === 'sec') return `${d.name} -${v}秒`;
  return `${d.name} +${v}`;
}

/**
 * 確率表（UI の「確率一覧」用・全公開）。potRateTable(slot) → {
 *   upgrade:[{from,to,p,pity,expected}], sameGradeLine, lines:{grade:{line1:[{stat,name,p,value}], line23:[...]}} }
 */
export function potRateTable(slot) {
  const upgrade = Object.entries(POT_UPGRADE).map(([from, u]) => ({
    from, to: u.to, p: u.p, pity: u.pity, expected: (1 - Math.pow(1 - u.p, u.pity)) / u.p,
  }));
  const lines = {};
  for (const g of POT_GRADES) {
    const own = potLinePool(slot, g);
    const low = potLinePool(slot, lowerGrade(g));
    const lowG = lowerGrade(g);
    const sameP = g === lowG ? 1 : POT_SAME_GRADE_LINE;
    const line23 = {};
    for (const l of own) line23[l.stat + '@' + g] = { stat: l.stat, name: l.name, grade: g, value: l.values[gradeIndex(g)], p: sameP / own.length };
    if (g !== lowG) for (const l of low) {
      const k = l.stat + '@' + lowG;
      line23[k] = { stat: l.stat, name: l.name, grade: lowG, value: l.values[gradeIndex(lowG)], p: (line23[k]?.p || 0) + (1 - sameP) / low.length };
    }
    lines[g] = {
      line1: own.map((l) => ({ stat: l.stat, name: l.name, grade: g, value: l.values[gradeIndex(g)], p: 1 / own.length })),
      line23: Object.values(line23),
    };
  }
  return { upgrade, sameGradeLine: POT_SAME_GRADE_LINE, lockCost: POT_LOCK_COST, lines };
}

/** ドロップ時の潜在（低確率）: 6% で付与。等級 レア 85% / エピック 13% / レジェ 2% */
export const DROP_POT_CHANCE = 0.06;
export const DROP_POT_GRADES = [['rare', 0.85], ['epic', 0.13], ['legendary', 0.02]];

/** 潜在行の合計（computeStats 用）。lines: [{stat, value}] */
export function sumPotLines(lines, out = {}) {
  for (const l of lines || []) if (l && POT_LINE_BY_STAT[l.stat] && Number.isFinite(l.value)) out[l.stat] = (out[l.stat] || 0) + l.value;
  return out;
}
