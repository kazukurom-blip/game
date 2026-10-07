// 狩りの速さの目安を計算する道具。
// 実行: node classic/tools/hunt_speed.mjs [--verbose]
// 仮定: その Lv に合った敵（自分の Lv - 2 前後、ふつうの敵）を狩り続ける。
//       1 分あたりの撃破数は「職の段階」と「1 匹を倒す手数」から決める（下の KPM）。
//       1 人用の補正として、敵の経験値は MOB_EXP そのまま（＝パーティー無しを前提に、最初から高めに設定済み）。
import { expTable, mobBase } from './lib/curves.mjs';

// 1 分あたりの撃破数（移動・拾う時間込み）。2 次で範囲技、3 次で強い範囲技を得る想定。
export function killsPerMin(lv) {
  if (lv < 10) return 7;
  if (lv < 30) return 9;
  if (lv < 70) return 13;
  if (lv < 120) return 16;
  return 18;
}

export function huntTable() {
  const t = expTable();
  let minutes = 0;
  const out = [];
  for (const r of t) {
    if (r.lv >= 200) break;
    const mobLv = Math.max(1, r.lv - 2);
    const exp = mobBase(mobLv).exp;
    const perMin = exp * killsPerMin(r.lv);
    const m = r.need / perMin;
    minutes += m;
    out.push({ lv: r.lv, need: r.need, mobLv, expPerKill: Math.round(exp), kills: Math.ceil(r.need / exp), min: m, totalH: minutes / 60 });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = huntTable();
  const verbose = process.argv.includes('--verbose');
  console.log('Lv\t必要EXP\t敵Lv\t1匹EXP\t匹数\t分\t累計時間');
  for (const r of rows) {
    if (verbose || [1, 5, 8, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 199].includes(r.lv)) {
      console.log(`${r.lv}\t${r.need}\t${r.mobLv}\t${r.expPerKill}\t${r.kills}\t${r.min.toFixed(1)}\t${r.totalH.toFixed(1)}h`);
    }
  }
}
