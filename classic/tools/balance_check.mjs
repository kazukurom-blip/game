// 装備の強さと敵の強さのつじつまを確かめる道具。
// 実行: node classic/tools/balance_check.mjs
// 各職の「その Lv の標準的な育て方」（AP の振り方・店で買える装備・代表的な狩りスキル）で、
// 自分の Lv-2 のふつうの敵を倒すのに何回攻撃が要るか、1 分で何匹倒せるか、敵から何回殴られると倒れるかを出す。
// 目標: 1 分の撃破数が hunt_speed.mjs の想定（killsPerMin）以上、倒れるまでの被弾回数が戦士 8 回以上・魔法使い 3 回以上。
import { mobBase, KIND_MUL } from './lib/curves.mjs';
import { physRange, magicRange, afterDef, damageTaken } from './lib/combat.mjs';
import { weaponAtk, BANDS, HIGH } from './data/equips.mjs';
import { killsPerMin } from './hunt_speed.mjs';

const ALLB = [...BANDS, ...HIGH.map((h) => h[0])];
const bandOf = (lv) => [...ALLB].reverse().find((b) => b <= lv) || 0;

// 代表スキル（段階ごと）: [倍率 or 魔法攻撃力, 同時に当たる数, 1 秒あたりの使用回数, 熟練度]
const PLAN = {
  戦士: { type: '両手剣', stages: [[1.0, 1, 1.3, 0.1], [1.6, 1, 1.3, 0.1], [1.8, 6, 1.1, 0.6], [2.6, 6, 1.1, 0.6], [4.0, 4, 1.3, 0.85]], hpPer: 44, mpPer: 4 },
  魔法使い: { type: 'スタッフ', magic: true, stages: [[25, 1, 1.2, 0.1], [60, 1, 1.2, 0.1], [80, 6, 1.0, 0.6], [160, 6, 0.9, 0.6], [220, 15, 0.8, 0.75]], hpPer: 11, mpPer: 22 },
  弓使い: { type: '弓', stages: [[1.0, 1, 1.2, 0.1], [1.3, 2, 1.2, 0.1], [1.4, 6, 1.0, 0.6], [3.0, 6, 1.0, 0.6], [4.2, 6, 1.2, 0.9]], hpPer: 20, mpPer: 14 },
  盗賊: { type: 'クロー', star: true, stages: [[1.0, 1, 1.4, 0.1], [2.8, 1, 1.3, 0.1], [3.8, 1.5, 1.6, 0.6], [3.8, 6, 1.1, 0.6], [5.2, 6, 1.3, 0.8]], hpPer: 20, mpPer: 14 },
  海賊: { type: 'ナックル', stages: [[1.0, 1, 1.3, 0.1], [1.6, 2, 1.3, 0.1], [2.0, 4, 1.1, 0.6], [2.8, 6, 1.1, 0.6], [4.0, 6, 1.15, 0.8]], hpPer: 22, mpPer: 16 },
};
const stageOf = (lv, job) => (lv < (job === '魔法使い' ? 8 : 10) ? 0 : lv < 30 ? 1 : lv < 70 ? 2 : lv < 120 ? 3 : 4);
const STAR_ATK = (lv) => (lv < 30 ? 15 : lv < 60 ? 19 : lv < 100 ? 23 : 27);

function player(job, lv) {
  const ap = 5 * (lv - 1) + 4 * 4;
  const gearMain = Math.round(lv * 0.25);           // 装備のおまけ能力値の合計の目安
  const scrollAtk = Math.round(lv * 0.15);          // 書で足した攻撃力・魔力の目安
  const buffAtk = lv >= 30 ? Math.round(10 + lv * 0.1) : 0; // 2 次以降の攻撃バフ
  const sub = Math.max(4, Math.round(lv * (job === '魔法使い' ? 0.2 : 0.55)) + 4);
  const main = ap - sub + gearMain;
  const band = bandOf(lv);
  const w = weaponAtk(PLAN[job].type, band || 0);
  const wdefJob = { 戦士: 3.0, 海賊: 2.4, 弓使い: 2.1, 盗賊: 2.1, 魔法使い: 1.35 }[job];
  const maxHp = 50 + PLAN[job].hpPer * (lv - 1) + (job === '戦士' && lv >= 10 ? 4 * Math.min(10, lv - 10) * 3 : 0);
  return { main, sub, watk: w.watk + scrollAtk + buffAtk + (PLAN[job].star ? STAR_ATK(lv) : 0), matk: main + w.matk + scrollAtk + buffAtk, wdef: Math.round(10 + band * wdefJob), maxHp };
}

export function check(job, lv) {
  const p = player(job, lv);
  const [k, targets, aps, mastery] = PLAN[job].stages[stageOf(lv, job)];
  const mobLv = Math.max(1, lv - 2);
  const mob = mobBase(mobLv);
  let avg;
  if (PLAN[job].magic) {
    const r = magicRange({ int: p.main, matk: p.matk, spell: k, mastery });
    avg = afterDef((r.min + r.max) / 2, mob.def * 0.8);
  } else {
    const r = physRange({ type: PLAN[job].type, main: p.main, sub: p.sub, watk: p.watk, mastery });
    avg = afterDef(((r.min + r.max) / 2) * k, mob.def);
  }
  const hits = Math.ceil(mob.hp / avg);
  const kpmFight = (aps * 60 * targets) / hits;
  const kpm = Math.min(kpmFight * 0.5, 30); // 半分は移動・拾い・敵の湧き待ち
  const taken = damageTaken(mob.atk * KIND_MUL.normal.atk, p.wdef, mobLv, lv);
  return { job, lv, mobLv, mobHp: Math.round(mob.hp), avg, hits, kpm: kpm.toFixed(1), want: killsPerMin(lv), ok: kpm >= killsPerMin(lv), taken, survive: Math.floor(p.maxHp / taken), maxHp: p.maxHp };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const LVS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 199];
  let bad = 0;
  for (const job of Object.keys(PLAN)) {
    console.log(`\n== ${job} ==`);
    console.log('Lv\t敵Lv\t敵HP\t1撃\t手数\t撃破/分\t想定\t被ダメ\t耐えられる回数');
    for (const lv of LVS) {
      const r = check(job, lv);
      if (!r.ok) bad++;
      console.log(`${lv}\t${r.mobLv}\t${r.mobHp}\t${r.avg}\t${r.hits}\t${r.kpm}\t${r.want}${r.ok ? '' : ' ×'}\t${r.taken}\t${r.survive}`);
    }
  }
  console.log(`\n想定に届かない組み合わせ: ${bad}`);
}
