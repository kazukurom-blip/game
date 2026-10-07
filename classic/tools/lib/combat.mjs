// 戦闘の計算式（docs/STATS.md と同じ式）。ゲーム本体の実装時もこの式を正とする。

// 武器ごとの係数（主ステータスに掛ける）。振り/突きで変わる武器は [振り, 突き]。
export const WEAPON = {
  '片手剣': { main: 'STR', sub: 'DEX', mul: 4.0, speed: 5 },
  '両手剣': { main: 'STR', sub: 'DEX', mul: 4.6, speed: 6 },
  '片手斧': { main: 'STR', sub: 'DEX', mul: [4.4, 3.2], speed: 5 },
  '両手斧': { main: 'STR', sub: 'DEX', mul: [4.8, 3.4], speed: 6 },
  '片手鈍器': { main: 'STR', sub: 'DEX', mul: [4.4, 3.2], speed: 5 },
  '両手鈍器': { main: 'STR', sub: 'DEX', mul: [4.8, 3.4], speed: 6 },
  '槍': { main: 'STR', sub: 'DEX', mul: [3.0, 5.0], speed: 6 },
  '矛': { main: 'STR', sub: 'DEX', mul: [5.0, 3.0], speed: 6 },
  '弓': { main: 'DEX', sub: 'STR', mul: 3.4, speed: 6 },
  'クロスボウ': { main: 'DEX', sub: 'STR', mul: 3.6, speed: 6 },
  'クロー': { main: 'LUK', sub: 'STR+DEX', mul: 3.6, speed: 4 },
  '短剣': { main: 'LUK', sub: 'STR+DEX', mul: 3.6, speed: 4 },
  'ナックル': { main: 'STR', sub: 'DEX', mul: 4.8, speed: 5 },
  '銃': { main: 'DEX', sub: 'STR', mul: 3.6, speed: 5 },
  '素手': { main: 'STR', sub: 'DEX', mul: 4.2, speed: 4 }, // 初心者（攻撃力は Lv で決まる、STATS.md 参照）
  'ワンド': { main: 'INT', sub: 'LUK', mul: 3.6, speed: 5 },  // 魔法でなく殴った時
  'スタッフ': { main: 'INT', sub: 'LUK', mul: 3.6, speed: 6 },
};

function mulOf(type, stab) {
  const m = WEAPON[type].mul;
  return Array.isArray(m) ? (stab ? m[1] : m[0]) : m;
}

// 物理の攻撃力の幅（表示用の「攻撃力 最小〜最大」）
// main/sub: 主・副ステータスの合計値, watk: 攻撃力の合計, mastery: 熟練度(0.1〜0.9)
export function physRange({ type, main, sub, watk, mastery = 0.1, stab = false }) {
  const k = mulOf(type, stab);
  const max = (main * k + sub) * watk / 100;
  const min = (main * k * 0.9 * mastery + sub) * watk / 100;
  return { min: Math.max(1, Math.floor(min)), max: Math.max(1, Math.floor(max)) };
}

// 魔法の幅。matk = INT + 魔力（装備・バフ）。spell = スキルの「魔法攻撃力」。
export function magicRange({ int, matk, spell, mastery = 0.1 }) {
  const M = matk;
  const max = ((M * M) / 1000 + M) / 30 + int / 200;
  const min = ((M * M) / 1000 + M * mastery * 0.9) / 30 + int / 200;
  return { min: Math.floor(min * spell), max: Math.floor(max * spell) };
}

// 敵の防御で減らす。物理: 防御 × 0.5〜0.6 を引く。魔法: 魔防 × 0.5〜0.6 を引く。
export function afterDef(dmg, def, r = 0.55) { return Math.max(1, Math.floor(dmg - def * r)); }

// レベル差の補正（敵の方が高い時だけ）
export function levelPenalty(playerLv, mobLv) {
  const d = mobLv - playerLv;
  if (d <= 0) return 1;
  return Math.max(0.5, 1 - 0.02 * d);
}

// 自分の命中（STATS.md 2-3）。基礎の命中（Lv で上がる分）+ DEX × 0.8 + LUK × 0.5 + 装備・スキル（extra）。
// 基礎の命中は「DEX に振らない近接職でも同じくらいの Lv の敵にはほぼ当たる」ように（ユーザーの決定「命中の底上げ」）。
// 5 + Lv × 1.0（初めは Lv × 0.5。通しの検証で Lv が上がるほど近接職の MISS が増えたので、敵の回避を Lv × 0.36 に下げるのと合わせて上げた）。
export function baseAcc(lv) { return 5 + lv * 1.0; }
export function playerAcc({ lv, dex, luk, extra = 0 }) { return baseAcc(lv) + dex * 0.8 + luk * 0.5 + extra; }

// 命中率（物理）。acc: 命中、avoid: 敵の回避。
export function hitChance(acc, avoid, playerLv, mobLv) {
  const d = Math.max(0, mobLv - playerLv);
  const need = (55 + 2 * d) * avoid / 15;
  const r = acc / need;
  if (r >= 1) return 1;
  if (r <= 0.5) return 0;
  return (r - 0.5) * 2;
}

// 敵から受けるダメージ（物理）。wdef: 物理防御。
export function damageTaken(mobAtk, wdef, mobLv, playerLv) {
  const raw = mobAtk * 0.925; // 0.85〜1.0 の平均
  const red = wdef / (wdef + 4 * mobAtk);
  const lvAdj = mobLv > playerLv ? 1 + 0.01 * (mobLv - playerLv) : 1;
  return Math.max(1, Math.floor(raw * (1 - red) * lvAdj));
}
