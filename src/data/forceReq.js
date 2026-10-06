// v5: 第2ワールドのマップごとの「必要なネオン適性」（MapleStory のアーケインフォース相当）。強さ担当のファイル。docs/BALANCE_V5.md
//  - 自分の適性 F（neonForceOf）とマップの値 R を比べ、forceMods(F, R) で与えるダメージ・受けるダメージの倍率が決まる（systems/neonCore.js）。
//  - 無いマップ（町・第1ワールド）は 0（倍率なし）。
//  - 段々: 最初の 2 マップ（f1・f2）は 0（コアが無くても雑魚を倒せる）→ アーク・シティの奥 30〜50 → サイバー・ワイルド 60〜110
//          → アビス 120〜170 → ゼニス 180〜240。ボス部屋は、そのボスのいるフィールドと同じ値。
//  - コア 1 Lv で適性 +10。フラグメント（雑魚から 1%）でコアを上げる速さと、地域を進む速さは tools/sim_balance.mjs で確かめた
export const FORCE_REQ = {
  // アーク・シティ（Lv100〜130）
  w2_arkcity_f1: 0,
  w2_arkcity_f2: 0,
  w2_arkcity_f3: 30,
  w2_arkcity_f4: 50,
  boss_ark_titan: 30,
  // サイバー・ワイルド（Lv125〜155）
  w2_cyberwild_f1: 60,
  w2_cyberwild_f2: 80,
  w2_cyberwild_f3: 100,
  w2_cyberwild_f4: 110,
  boss_wild_kernel: 100,
  // ネオン・アビス（Lv150〜180）
  w2_abyss_f1: 120,
  w2_abyss_f2: 140,
  w2_abyss_f3: 160,
  w2_abyss_f4: 170,
  boss_abyss_queen: 160,
  // ゼニス・タワー（Lv175〜200）
  w2_zenith_f1: 180,
  w2_zenith_f2: 200,
  w2_zenith_f3: 220,
  w2_zenith_f4: 240,
  boss_zenith: 240,
};

/** マップの必要な適性（無ければ 0） */
export function forceReqOf(mapId) { return FORCE_REQ[mapId] || 0; }
