// 転生（魂の祭壇）と超越（星晶）の数値。ロジックは game/systems/prestige.js。
//
// ■ 転生
//   魂 = floor( floor(k × ((この周回で着いた最高のエリア Lv − 20) ÷ 10)²) × 倍率 )   … L49 で 25・L70 で 75・L100 で 192
//   解放: 第五章のボス（通し番号 24 の地域）を初めて倒したとき。
//   消える: 物語の進み（章・地域・ステージ）・お金・この周回の数え上げ
//   残る:   レベル・パラゴン・装備・素材・宝石・力の書庫・ペット・実績・図鑑・星座盤
//   転生の直後は「前回の最高の地域」の 50%（祭壇で 80% まで）へ飛ぶ。
//
// ■ 魂の祭壇（ALTAR）の形
//   { id, cat, name, desc（{v} にその Lv の合計値が入る）, max（0 = 上限なし）, cost: [基本, 伸び],
//     mods?: [{ s, per }]（1 Lv ごとの能力）, effect?: { key, per }（能力以外の効果。システムが読む）,
//     unlock?: 'meta.unlocks のキー'（自動化など。Lv1 で解放）, keep?: true（超越でも消えない）, req?: { rebirths } }
//   費用 = ceil(基本 × 伸び^今の Lv × (1 − 星の割引))
//
// ■ 超越（STAR_UPGRADES）
//   転生 5 回で解放。魂と祭壇（keep 以外）を手放して「星晶」を得る。
//   星晶 = floor(2 × √(前の超越から得た魂の合計 ÷ 25))
//   形は祭壇と同じ。費用は cost: [基本, 1 Lv ごとの増加]（線形）。

export const PRESTIGE = {
  UNLOCK_ZONE: 24, // 第五章のボスの地域（ZONES の通し番号）
  UNLOCK_LEVEL: 50, // 地域のデータが無いときの目安（第五章のボスのエリア Lv）
  SOUL_K: 3,
  SOUL_DIV: 10,
  SOUL_POW: 2,
  SOUL_BASE_LEVEL: 20,
  MIN_LIFE_SEC: 20 * 60, // 2 回目以降は、この周回を 20 分以上遊ぶと転生できる（すぐ転生をくり返すのを防ぐ）
  WARP_BASE: 0.5,
  WARP_ALTAR_MAX: 0.8,
  WARP_STAR_MAX: 0.9,
  TRANSCEND_REBIRTHS: 5,
  STAR_K: 2,
  STAR_DIV: 25,
  HISTORY: 20, // 転生の記録を残す数
};

/** 魂の基本の量（倍率の前）= floor(K × ((L − 20) ÷ 10)^2) */
export function baseSouls(level) {
  if (!(level > PRESTIGE.SOUL_BASE_LEVEL)) return 0;
  return Math.floor(PRESTIGE.SOUL_K * ((level - PRESTIGE.SOUL_BASE_LEVEL) / PRESTIGE.SOUL_DIV) ** PRESTIGE.SOUL_POW);
}

/** 次の 1 点に必要なエリア Lv（倍率 mult 込み） */
export function levelForSouls(n, mult = 1) {
  const need = n / Math.max(0.01, mult);
  return Math.ceil(PRESTIGE.SOUL_BASE_LEVEL + PRESTIGE.SOUL_DIV * (need / PRESTIGE.SOUL_K) ** (1 / PRESTIGE.SOUL_POW));
}

/** 星晶の量 */
export function starsFor(souls) {
  if (!(souls > 0)) return 0;
  return Math.floor(PRESTIGE.STAR_K * Math.sqrt(souls / PRESTIGE.STAR_DIV));
}

export const ALTAR_CATS = [
  { id: 'offense', name: '攻め', color: '#ff7a5a' },
  { id: 'defense', name: '守り', color: '#7ab8ff' },
  { id: 'economy', name: '稼ぎ', color: '#f5d98a' },
  { id: 'idle', name: '放置', color: '#b48aff' },
  { id: 'auto', name: '自動化', color: '#6ee08a' },
];

const A = [];
const def = (o) => A.push({ max: 0, mods: [], ...o });

// ---------------- 攻め
def({ id: 'soul_blade', cat: 'offense', name: '魂の刃', desc: '与えるダメージ ×{v}（最終）', max: 50, cost: [2, 1.18], mods: [{ s: 'more_dmg', per: 5 }], fmt: 'more' });
def({ id: 'soul_fury', cat: 'offense', name: '怒れる魂', desc: '全ダメージ +{v}%', max: 0, cost: [1, 1.12], mods: [{ s: 'inc_dmg', per: 10 }] });
def({ id: 'soul_edge', cat: 'offense', name: '研がれた魂', desc: 'クリティカル率 +{v}%', max: 20, cost: [3, 1.25], mods: [{ s: 'crit_chance', per: 0.5 }] });
def({ id: 'soul_ruin', cat: 'offense', name: '破滅の魂', desc: 'クリティカルダメージ +{v}%', max: 40, cost: [3, 1.2], mods: [{ s: 'crit_damage', per: 5 }] });
def({ id: 'soul_haste', cat: 'offense', name: '急ぐ魂', desc: '攻撃速度 +{v}%', max: 25, cost: [4, 1.22], mods: [{ s: 'attack_speed', per: 1 }] });
def({ id: 'soul_elements', cat: 'offense', name: '元素の魂', desc: '火炎・冷気・雷撃のダメージ +{v}%', max: 50, cost: [2, 1.15], mods: [{ s: 'inc_elemental', per: 6 }] });
def({ id: 'soul_hunter', cat: 'offense', name: '狩る魂', desc: 'エリートへのダメージ +{v}%', max: 40, cost: [2, 1.15], mods: [{ s: 'dmg_elite', per: 5 }] });
def({ id: 'soul_slayer', cat: 'offense', name: '王殺しの魂', desc: 'ボスへのダメージ +{v}%', max: 40, cost: [2, 1.15], mods: [{ s: 'dmg_boss', per: 5 }] });
def({ id: 'soul_legion', cat: 'offense', name: '軍勢の魂', desc: '召喚スキルのダメージ +{v}%・召喚物のライフ +{v}%', max: 40, cost: [2, 1.15], mods: [{ s: 'inc_minion', per: 8 }, { s: 'minion_life', per: 8 }] });
def({ id: 'soul_pierce', cat: 'offense', name: '穿つ魂', desc: '敵の耐性を {v}% 無視する', max: 15, cost: [6, 1.3], mods: [{ s: 'res_pen', per: 1 }] });
def({ id: 'soul_reach', cat: 'offense', name: '広がる魂', desc: '効果範囲 +{v}%', max: 20, cost: [4, 1.22], mods: [{ s: 'area', per: 2 }] });
def({ id: 'soul_cycle', cat: 'offense', name: '巡る魂', desc: 'クールダウン短縮 +{v}%', max: 15, cost: [6, 1.3], mods: [{ s: 'cdr', per: 1 }] });
def({ id: 'soul_skill', cat: 'offense', name: '技の極み', desc: 'すべてのスキルのレベル +{v}', max: 3, cost: [60, 4], mods: [{ s: 'skill_lvl', per: 1 }] });

// ---------------- 守り
def({ id: 'soul_life', cat: 'defense', name: '不屈の魂', desc: '最大ライフ +{v}%', max: 50, cost: [2, 1.16], mods: [{ s: 'inc_life', per: 5 }] });
def({ id: 'soul_armor', cat: 'defense', name: '鋼の魂', desc: 'アーマー +{v}%', max: 40, cost: [2, 1.15], mods: [{ s: 'inc_armor', per: 8 }] });
def({ id: 'soul_ward', cat: 'defense', name: '守りの魂', desc: '全耐性 +{v}%', max: 30, cost: [3, 1.2], mods: [{ s: 'res_all', per: 1 }] });
def({ id: 'soul_shell', cat: 'defense', name: '殻の魂', desc: '受けるダメージ -{v}%', max: 15, cost: [8, 1.3], mods: [{ s: 'dr', per: 1 }] });
def({ id: 'soul_mend', cat: 'defense', name: '癒しの魂', desc: '1 秒ごとに最大ライフの {v}% を回復', max: 20, cost: [3, 1.2], mods: [{ s: 'life_regen_pct', per: 0.1 }] });
def({ id: 'soul_thirst', cat: 'defense', name: '血を啜る魂', desc: '与えたダメージの {v}% をライフに', max: 15, cost: [4, 1.25], mods: [{ s: 'leech', per: 0.2 }] });
def({ id: 'soul_mist', cat: 'defense', name: '霞の魂', desc: '回避率 +{v}%', max: 20, cost: [4, 1.22], mods: [{ s: 'dodge', per: 0.5 }] });
def({ id: 'soul_well', cat: 'defense', name: '尽きぬ魂', desc: '最大リソース +{v}・リソースの再生 +{v2}%', max: 10, cost: [4, 1.25], mods: [{ s: 'max_resource', per: 5 }, { s: 'resource_regen', per: 3 }] });

// ---------------- 稼ぎ
def({ id: 'soul_gold', cat: 'economy', name: '黄金の魂', desc: 'ゴールド獲得 +{v}%', max: 0, cost: [1, 1.1], mods: [{ s: 'gold_find', per: 10 }] });
def({ id: 'soul_wisdom', cat: 'economy', name: '賢者の魂', desc: '経験値 +{v}%', max: 60, cost: [1, 1.12], mods: [{ s: 'xp_bonus', per: 5 }] });
def({ id: 'soul_fortune', cat: 'economy', name: '幸運の魂', desc: 'レア発見率 +{v}%', max: 60, cost: [2, 1.13], mods: [{ s: 'magic_find', per: 5 }] });
def({ id: 'soul_plenty', cat: 'economy', name: '豊かな魂', desc: 'アイテム発見数 +{v}%', max: 25, cost: [4, 1.22], mods: [{ s: 'item_quantity', per: 2 }] });
def({ id: 'soul_craft', cat: 'economy', name: '職人の魂', desc: '分解・ドロップの素材 +{v}%', max: 30, cost: [2, 1.15], mods: [{ s: 'mat_find', per: 5 }] });
def({ id: 'soul_harvest', cat: 'economy', name: '魂の収穫', desc: '転生で得る魂 +{v}%', max: 30, cost: [5, 1.25], effect: { key: 'soulMul', per: 10 } });
def({ id: 'soul_wind', cat: 'economy', name: '疾風の魂', desc: '移動速度 +{v}%', max: 20, cost: [2, 1.18], mods: [{ s: 'move_speed', per: 3 }] });
def({ id: 'soul_nest', cat: 'economy', name: '卵を嗅ぐ魂', desc: 'ペットの卵が落ちる確率 +{v}%', max: 10, cost: [5, 1.3], effect: { key: 'eggMul', per: 10 } });
def({ id: 'soul_bounty', cat: 'economy', name: '恵みの魂', desc: '日課・ログインの報酬 +{v}%', max: 10, cost: [3, 1.25], effect: { key: 'bountyMul', per: 10 } });
def({ id: 'soul_purse', cat: 'economy', name: '蓄えの魂', desc: '転生してもゴールドの {v}% が残る', max: 10, cost: [4, 1.3], effect: { key: 'keepGold', per: 5 } });
def({ id: 'soul_honor', cat: 'economy', name: '誉れの魂', desc: '実績ポイントの効果 +{v}%', max: 10, cost: [3, 1.2], effect: { key: 'achMul', per: 5 } });

// ---------------- 放置
def({ id: 'idle_cap', cat: 'idle', name: '長き眠り', desc: '放置の上限 +{v} 時間（8 時間 → 最大 48 時間）', max: 20, cost: [3, 1.22], effect: { key: 'offlineHours', per: 2 }, unit: '' });
def({ id: 'idle_dream', cat: 'idle', name: '夢見の効率', desc: '放置の効率 +{v}%（80% → 最大 100%）', max: 20, cost: [3, 1.2], effect: { key: 'offlineEff', per: 1 } });
def({ id: 'idle_warp', cat: 'idle', name: '遠き跳躍', desc: '転生の直後に飛ぶ先 +{v}%（前回の最高の 50% → 最大 80%）', max: 10, cost: [5, 1.3], effect: { key: 'warp', per: 3 } });
def({ id: 'idle_bag', cat: 'idle', name: '広い鞄', desc: 'バッグの枠 +{v}', max: 6, cost: [4, 1.5], effect: { key: 'bagBonus', per: 10 }, keep: true });
def({ id: 'idle_speed', cat: 'idle', name: '時の加速', desc: '速度の切り替えに ×{v2} を足す', max: 2, cost: [15, 4], effect: { key: 'speed', per: 1 }, keep: true });
def({ id: 'idle_slot', cat: 'idle', name: '第六の構え', desc: 'スキルの並びの枠 +{v}', max: 1, cost: [40, 1], effect: { key: 'extraSkillSlot', per: 1 }, keep: true });

// ---------------- 自動化（Lv1 で解放。超越でも消えない）
def({ id: 'auto_skill', cat: 'auto', name: '自動の修練', desc: 'スキルポイント・パッシブの点を自動で振る', max: 1, cost: [8, 1], unlock: 'autoSkill', keep: true });
def({ id: 'auto_boss', cat: 'auto', name: '再挑戦の誓い', desc: '火力が足りたらボスに自動で再挑戦する', max: 1, cost: [5, 1], unlock: 'autoBoss', keep: true });
def({ id: 'auto_salvage', cat: 'auto', name: '分別の目', desc: 'レベルに合わせて自動分解の段を上げる（決まった型から選べる）', max: 1, cost: [6, 1], unlock: 'autoSalvage', keep: true });
def({ id: 'auto_hatch', cat: 'auto', name: '孵化の番人', desc: '卵を空いた孵卵器に自動で入れ、孵ったら自動で孵す', max: 1, cost: [6, 1], unlock: 'autoHatch', keep: true });
def({ id: 'auto_bounty', cat: 'auto', name: '日課の使い', desc: '終わった日課とログインの贈り物を自動で受け取る', max: 1, cost: [10, 1], unlock: 'autoBounty', keep: true });
def({ id: 'auto_torment', cat: 'auto', name: '苦行の見極め', desc: '倒す速さを見て、ちょうど良い苦行の段を自動で選ぶ', max: 1, cost: [25, 1], unlock: 'autoTorment', keep: true });
def({ id: 'auto_rebirth', cat: 'auto', name: '輪廻の自動', desc: '決めた魂の数に届いたら自動で転生する', max: 1, cost: [30, 1], unlock: 'autoRebirth', keep: true, req: { rebirths: 3 } });

export const ALTAR = A;
export const ALTAR_BY_ID = Object.fromEntries(A.map((u) => [u.id, u]));

/** 祭壇の強化の費用（今の Lv → 次の Lv） */
export function altarCost(u, lvl, discount = 0) {
  const [base, growth] = u.cost;
  return Math.max(1, Math.ceil(base * growth ** lvl * (1 - Math.min(0.5, discount))));
}

// ---------------- 超越（星晶）
const S = [];
const star = (o) => S.push({ mods: [], ...o });
star({ id: 'star_blade', name: '星の刃', desc: '与えるダメージ ×{v}（最終）', max: 20, cost: [1, 1], mods: [{ s: 'more_dmg', per: 25 }], fmt: 'more' });
star({ id: 'star_shield', name: '星の盾', desc: '最大ライフ +{v}%・アーマー +{v}%', max: 20, cost: [1, 1], mods: [{ s: 'inc_life', per: 25 }, { s: 'inc_armor', per: 25 }] });
star({ id: 'star_spring', name: '魂の泉', desc: '転生で得る魂 +{v}%', max: 20, cost: [1, 1], effect: { key: 'soulMul', per: 25 } });
star({ id: 'star_sage', name: '星の知恵', desc: '経験値 +{v}%', max: 20, cost: [1, 1], mods: [{ s: 'xp_bonus', per: 25 }] });
star({ id: 'star_vein', name: '星の金脈', desc: 'ゴールド獲得 +{v}%', max: 20, cost: [1, 1], mods: [{ s: 'gold_find', per: 50 }] });
star({ id: 'star_luck', name: '星の幸運', desc: 'レア発見率 +{v}%', max: 20, cost: [2, 1], mods: [{ s: 'magic_find', per: 20 }] });
star({ id: 'star_altar', name: '祭壇の星', desc: '魂の祭壇の費用 -{v}%', max: 10, cost: [2, 2], effect: { key: 'altarDiscount', per: 5 } });
star({ id: 'star_road', name: '星の道', desc: '転生の直後に飛ぶ先 +{v}%（祭壇の上限 80% を越えて最大 90%）', max: 5, cost: [3, 2], effect: { key: 'warp', per: 2 } });
star({ id: 'star_dream', name: '夢の星', desc: '放置の稼ぎ +{v}%', max: 5, cost: [2, 2], mods: [{ s: 'offline_gain', per: 10 }] });
star({ id: 'star_beast', name: '星の獣', desc: 'ペットの効果 +{v}%', max: 5, cost: [2, 2], effect: { key: 'petMul', per: 20 } });
star({ id: 'star_honor', name: '星の誉れ', desc: '実績ポイントの効果 +{v}%', max: 10, cost: [1, 1], effect: { key: 'achMul', per: 5 } });

export const STAR_UPGRADES = S;
export const STAR_BY_ID = Object.fromEntries(S.map((u) => [u.id, u]));

export function starCost(u, lvl) {
  const [base, inc] = u.cost;
  return Math.max(1, Math.round(base + inc * lvl));
}

/** 説明文の {v} {v2} を埋める */
export function upgradeDesc(u, lvl) {
  const L = Math.max(0, lvl);
  const first = u.mods?.[0]?.per ?? u.effect?.per ?? 1;
  const second = u.mods?.[1]?.per ?? first;
  let v = first * L;
  if (u.fmt === 'more') v = `${(1 + v / 100).toFixed(2)}`;
  else v = String(Math.round(v * 100) / 100);
  let v2 = Math.round(second * L * 100) / 100;
  if (u.id === 'idle_speed') v2 = L > 0 ? `${2 + L}` : '3';
  return u.desc.replaceAll('{v}', v).replaceAll('{v2}', String(v2));
}
