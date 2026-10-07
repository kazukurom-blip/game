// 装備の生成ルール。名前は「素材（シリーズ）＋ 部位の名前」。数値は Lv から式で決める。
// gen_docs.mjs が ITEMS.md の装備表を作る。balance_check.mjs も同じ値を使う。
import { logInterp, nice } from '../lib/curves.mjs';

export const BANDS = [10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110];
// 4 次以降の武器（店では売らない。ボス・高 Lv の敵・1 人用ダンジョンのドロップと、素材からの製作）
export const HIGH = [[120, '焔鋼', '焔の坑道の敵・焔の巨像'], [130, '竜牙', '竜の谷の敵・製作'], [140, '黒竜', '三つ首の黒竜'], [150, '星鉄', '星の果ての敵・星を呑む者']];

// 職ごとのシリーズ名（Lv 帯ごと）
export const SERIES = {
  戦士: ['青銅', '鋼', '銀鱗', '赤銅', '鉄騎', '黒鉄', '白銀', 'ミスリル', '竜骨', '蒼鋼', '紅蓮', '聖騎', '天鋼', '覇王'],
  魔法使い: ['麻', '綿', '星布', '月光', '精霊', '賢者', '白霧', '魔晶', '霊樹', '蒼天', '紅月', '聖光', '天啓', '至高'],
  弓使い: ['草原', '若葉', '鷹羽', '狩人', '風切', '翡翠', '森王', '疾風', '天弓', '蒼穹', '流星', '聖樹', '天翔', '神風'],
  盗賊: ['黒布', '夜霧', '影縫', '月影', '朧', '闇紫', '黒曜', '幻影', '冥府', '蒼月', '紅影', '聖影', '天影', '虚空'],
  海賊: ['帆布', '潮風', '錨', '砂浜', '珊瑚', '大波', '嵐', '海竜', '黒潮', '蒼海', '紅潮', '聖海', '天海', '覇海'],
};

// 部位ごとの名前と基本値
export const ARMOR_SLOTS = {
  戦士: [['帽子', '兜'], ['上着', '鎧'], ['下衣', '脚甲'], ['靴', '鉄靴'], ['手袋', '小手']],
  魔法使い: [['帽子', '帽子'], ['全身', 'ローブ'], ['靴', '靴'], ['手袋', '手袋']],
  弓使い: [['帽子', 'フード'], ['上着', '狩衣'], ['下衣', 'ズボン'], ['靴', 'ブーツ'], ['手袋', 'グローブ']],
  盗賊: [['帽子', '頭巾'], ['上着', '装束'], ['下衣', '袴'], ['靴', '足袋'], ['手袋', '手甲']],
  海賊: [['帽子', 'バンダナ'], ['上着', 'コート'], ['下衣', 'ズボン'], ['靴', 'ブーツ'], ['手袋', '手袋']],
};
export const MAIN_STAT = { 戦士: 'STR', 魔法使い: 'INT', 弓使い: 'DEX', 盗賊: 'LUK', 海賊: 'STR/DEX' };
export const SUB_STAT = { 戦士: 'DEX', 魔法使い: 'LUK', 弓使い: 'STR', 盗賊: 'DEX', 海賊: 'DEX/STR' };

// 部位の防御倍率・強化回数
const SLOT_DEF = { 帽子: 0.6, 上着: 0.9, 下衣: 0.6, 全身: 1.5, 靴: 0.35, 手袋: 0.3, 盾: 0.9, マント: 0.3, 耳飾り: 0 };
export const SLOT_UPG = { 帽子: 7, 上着: 7, 下衣: 7, 全身: 10, 靴: 5, 手袋: 5, 盾: 7, マント: 5, 耳飾り: 5, 武器: 7 };
const JOB_DEF = { 戦士: 1.0, 海賊: 0.8, 弓使い: 0.7, 盗賊: 0.7, 魔法使い: 0.45 };
const JOB_MDEF = { 戦士: 0.2, 海賊: 0.3, 弓使い: 0.3, 盗賊: 0.3, 魔法使い: 1.0 };

export function reqMain(lv) { return lv <= 0 ? 0 : Math.round(lv * 2.5 + 10); }
export function priceOf(lv, mul = 1) { return nice(30 * Math.pow(Math.max(lv, 3), 1.85) * mul); }

function baseDef(lv) { return 6 + lv * 0.9; }

// その帯で付くおまけの能力値（Lv20 以上、部位で決まった順番で付く）
function bonusFor(job, slot, lv, i) {
  if (lv < 20) return '';
  const n = Math.max(1, Math.round(lv / 20));
  const main = MAIN_STAT[job].split('/')[0];
  const sub = SUB_STAT[job].split('/')[0];
  const pick = (i + BANDS.indexOf(lv)) % 3;
  if (slot === '帽子') return pick === 0 ? `${main}+${n}` : pick === 1 ? `HP+${n * 15}` : `${sub}+${n}`;
  if (slot === '上着' || slot === '全身') return pick === 2 ? `${sub}+${n}` : `${main}+${n}`;
  if (slot === '下衣') return pick === 0 ? `${sub}+${n}` : '';
  if (slot === '靴') return pick === 1 ? `速さ+${Math.min(10, n * 2)}` : pick === 2 ? `ジャンプ+${Math.min(6, n)}` : `回避+${n * 2}`;
  if (slot === '手袋') return pick === 0 ? `命中+${n * 2}` : '';
  return '';
}

export function armorList() {
  const out = [];
  for (const job of Object.keys(SERIES)) {
    BANDS.forEach((lv, bi) => {
      const series = SERIES[job][bi];
      ARMOR_SLOTS[job].forEach(([slot, noun], si) => {
        const def = Math.round(baseDef(lv) * SLOT_DEF[slot] * JOB_DEF[job]);
        const mdef = Math.round(baseDef(lv) * SLOT_DEF[slot] * JOB_MDEF[job]);
        out.push({
          job, lv, slot, name: `${series}の${noun}`,
          req: `${MAIN_STAT[job].split('/')[0]} ${reqMain(lv)}`,
          def, mdef, bonus: bonusFor(job, slot, lv, si),
          upg: SLOT_UPG[slot], price: priceOf(lv, slot === '全身' ? 1.6 : slot === '上着' ? 0.9 : 0.6),
        });
      });
    });
  }
  return out;
}

// 盾（戦士・盗賊・魔法使い）とマント・耳飾り（共通）
export function extraList() {
  const out = [];
  const SH = { 戦士: ['盾', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]], 盗賊: ['小盾', [20, 40, 60, 80, 100, 110]], 魔法使い: ['魔導書の盾', [30, 50, 70, 90, 110]] };
  for (const [job, [noun, lvs]] of Object.entries(SH)) {
    for (const lv of lvs) {
      const bi = BANDS.indexOf(lv);
      const def = Math.round(baseDef(lv) * SLOT_DEF['盾'] * (job === '戦士' ? 1 : 0.6));
      const bonus = job === '魔法使い' ? `魔力+${Math.round(lv / 10)}` : job === '盗賊' ? `LUK+${Math.round(lv / 20) + 1}` : lv >= 30 ? `HP+${lv * 2}` : '';
      out.push({ job, lv, slot: '盾', name: `${SERIES[job][bi]}の${noun}`, req: `${MAIN_STAT[job]} ${reqMain(lv)}`, def, mdef: Math.round(def / 2), bonus, upg: 7, price: priceOf(lv, 0.8) });
    }
  }
  const CAPE = [[30, '旅のマント'], [50, '風のマント'], [70, '星のマント'], [90, '月のマント'], [110, '陽のマント']];
  for (const [lv, name] of CAPE) out.push({ job: '共通', lv, slot: 'マント', name, req: '-', def: Math.round(lv / 5), mdef: Math.round(lv / 5), bonus: `全能力+${Math.round(lv / 30)}`, upg: 5, price: priceOf(lv, 0.7) });
  const EAR = [[15, '銅の耳飾り'], [35, '銀の耳飾り'], [55, '金の耳飾り'], [75, '真珠の耳飾り'], [95, '星石の耳飾り'], [110, '虹の耳飾り']];
  for (const [lv, name] of EAR) out.push({ job: '共通', lv, slot: '耳飾り', name, req: '-', def: 0, mdef: Math.round(lv / 2), bonus: `INT+${Math.round(lv / 25) + 1} 魔防+${Math.round(lv / 2)}`, upg: 5, price: priceOf(lv, 0.8) });
  return out;
}

// ---- 武器
export const WEAPON_TYPES = [
  // [種類, 職, 名前の語, 攻撃力倍率, 魔力倍率, 速さ, 備考]
  ['片手剣', '戦士', 'ソード', 1.0, 0, '速い', '盾と使える'],
  ['両手剣', '戦士', '大剣', 1.1, 0, '普通', ''],
  ['片手斧', '戦士', '斧', 1.04, 0, '普通', '盾と使える'],
  ['両手斧', '戦士', '大斧', 1.12, 0, '遅い', ''],
  ['片手鈍器', '戦士', 'メイス', 1.02, 0, '普通', '盾と使える'],
  ['両手鈍器', '戦士', 'ハンマー', 1.12, 0, '遅い', ''],
  ['槍', '戦士', '槍', 1.12, 0, '普通', '突きが強い'],
  ['矛', '戦士', '矛', 1.08, 0, '遅い', '振りが強い'],
  ['ワンド', '魔法使い', 'ワンド', 0.25, 1.0, '速い', '盾と使える'],
  ['スタッフ', '魔法使い', '杖', 0.3, 1.15, '普通', ''],
  ['弓', '弓使い', '弓', 0.9, 0, '普通', '弓の矢が要る'],
  ['クロスボウ', '弓使い', 'クロスボウ', 0.95, 0, '普通', 'クロスボウの矢が要る'],
  ['クロー', '盗賊', 'クロー', 0.35, 0, '速い', '投げ星が要る（投げ星の攻撃力を足す）'],
  ['短剣', '盗賊', 'ダガー', 0.92, 0, '速い', '盾と使える'],
  ['ナックル', '海賊', 'ナックル', 0.78, 0, '速い', ''],
  ['銃', '海賊', '銃', 0.55, 0, '普通', '弾が要る（弾の攻撃力を足す）'],
];
export const WATK = [[0, 17], [10, 30], [20, 40], [30, 50], [40, 60], [50, 68], [60, 75], [70, 82], [80, 88], [90, 94], [100, 100], [110, 108], [120, 115], [150, 135]];
export const MATK = [[0, 15], [8, 30], [20, 45], [30, 60], [40, 72], [50, 85], [70, 105], [100, 130], [110, 138], [120, 145], [150, 165]];

export function weaponAtk(type, lv) {
  const t = WEAPON_TYPES.find((w) => w[0] === type);
  return { watk: Math.round(logInterp(WATK, lv) * t[3]), matk: t[4] ? Math.round(logInterp(MATK, lv) * t[4]) : 0 };
}

// 1 次転職の条件（JOBS.md 3-1）。1 次の帯の武器の必要な能力値もこれにする
export const FIRST_JOB_REQ = { 戦士: 'STR 35', 魔法使い: 'INT 20', 弓使い: 'DEX 25', 盗賊: 'DEX 25', 海賊: 'DEX 20' };

export function weaponList() {
  const out = [];
  for (const [type, job, noun, , , speed, note] of WEAPON_TYPES) {
    BANDS.forEach((lv0, bi) => {
      const lv = job === '魔法使い' && lv0 === 10 ? 8 : lv0;
      const { watk, matk } = weaponAtk(type, lv);
      const main = MAIN_STAT[job].split('/')[0];
      const reqStat = type === '銃' ? 'DEX' : type === 'ナックル' ? 'STR' : main;
      const bonus = lv >= 30 ? (matk ? `INT+${Math.round(lv / 15)}` : `${reqStat}+${Math.round(lv / 25)}`) : '';
      // 1 次の帯（Lv10・魔法使い Lv8）の武器は、転職の条件と同じ能力値で持てる（転職官からもらってすぐ使えるように）
      const req = bi === 0 ? FIRST_JOB_REQ[job] : `${reqStat} ${reqMain(lv)}`;
      out.push({ job, type, lv, name: `${SERIES[job][bi]}の${noun}`, req, watk, matk, speed, bonus, upg: 7, price: priceOf(lv, 1.5), note });
    });
    for (const [lv, pre, src] of HIGH) {
      const { watk, matk } = weaponAtk(type, lv);
      const main = MAIN_STAT[job].split('/')[0];
      const reqStat = type === '銃' ? 'DEX' : type === 'ナックル' ? 'STR' : main;
      const bonus = matk ? `INT+${Math.round(lv / 12)} 魔力+${Math.round(lv / 20)}` : `${reqStat}+${Math.round(lv / 15)} 攻撃力+${Math.round(lv / 40)}`;
      out.push({ job, type, lv, name: `${pre}の${noun}`, req: `${reqStat} ${reqMain(lv)}`, watk, matk, speed, bonus, upg: 7, price: 0, note: `入手: ${src}` });
    }
  }
  return out;
}

// 初心者（0〜9）用の共通装備
export const STARTER = [
  ['帽子', '麦わら帽子', 0, '防御 2', 5, 60],
  ['帽子', '布のバンダナ', 5, '防御 4', 5, 200],
  ['上着', '白いシャツ', 0, '防御 3', 7, 0],
  ['下衣', '青い半ズボン', 0, '防御 2', 7, 0],
  ['上着', '旅人のチョッキ', 5, '防御 5', 7, 300],
  ['下衣', '旅人のズボン', 5, '防御 4', 7, 300],
  ['靴', '革のサンダル', 0, '防御 1', 5, 0],
  ['靴', '旅人の靴', 5, '防御 3 速さ+2', 5, 250],
  ['手袋', '綿の手袋', 5, '防御 1', 5, 150],
  ['武器', '木の剣（片手剣）', 0, '攻撃力 17', 7, 0],
  ['武器', '木のこん棒（片手鈍器）', 0, '攻撃力 19 遅い', 7, 50],
  ['武器', '木の棒（スタッフ）', 0, '攻撃力 10 魔力 15', 7, 50],
  ['武器', '練習用の弓（弓）', 0, '攻撃力 15', 7, 50],
  ['武器', '果物ナイフ（短剣）', 0, '攻撃力 16', 7, 50],
];
