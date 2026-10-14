// クラスの釣り合いの計測（強さ担当）。同じレベル・同じくらいの装備の主人公を 5 クラス作り、
// ① 群れを倒す速さ（ステージ 5 で 4 分: 撃破/秒・倒れた回数） ② ボスを倒すまでの時間（地域のボス・特技あり）を比べる。
// 進み具合の差（tools/balance_report.mjs）が「クラスの強さ」なのか「育ち方」なのかを分けて見るための物。
//
// 使い方: node tools/balance_classes.mjs [--zones=a1z5,a3z3,a5z5,a7z3,a9z5] [--n=2] [--lvl=-4] [--min=4]

import { ZONE, STAGES_PER_ZONE } from '../src/data/world.js';
import { estimateBuildDps } from '../src/game/skills.js';
import { effectiveLife } from '../src/game/character.js';
import { makeHero, fight } from './balance_bosses.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const zones = arg('zones', 'a1z5,a3z3,a5z5,a7z3,a9z5').split(',').map((id) => ZONE[id]).filter(Boolean);
const N = Number(arg('n', 2));
const LVL = Number(arg('lvl', -4));
const MIN = Number(arg('min', 4));
const CLASSES = (arg('classes', 'warrior,ranger,sorcerer,necromancer,assassin')).split(',');

export function clearRate(cls, z, seed = 1) {
  const g = makeHero(cls, z, { seed, lvlOff: LVL });
  let deaths = 0;
  g.events.on('heroDeath', () => deaths++);
  g.sys.world.travel(z.id, 5);
  g.state.world.autoAdvance = false;
  const k0 = g.state.meta.stats.kills; const t0 = g.state.playTime;
  for (let i = 0; i < MIN * 60 * 20; i++) g.tick(0.05);
  const st = g.state;
  return { kps: (st.meta.stats.kills - k0) / (st.playTime - t0), deaths, dps: estimateBuildDps(st, g.H), ehp: effectiveLife(g.H) };
}

console.log(`クラスの釣り合い（主人公 Lv = 地域 Lv ${LVL}・レアの装備・各 ${N} 回・群れ ${MIN} 分）`);
for (const z of zones) {
  const rows = [];
  for (const cls of CLASSES) {
    let kps = 0; let deaths = 0; let bt = 0; let win = 0; let dps = 0; let ehp = 0;
    for (let k = 0; k < N; k++) {
      const r = clearRate(cls, z, 200 + k);
      kps += r.kps / N; deaths += r.deaths / N; dps += r.dps / N; ehp += r.ehp / N;
      const f = fight(makeHero(cls, z, { seed: 300 + k, lvlOff: LVL }), z);
      bt += (f.win ? f.t : f.t / Math.max(0.05, f.dealt)) / N; if (f.win) win++;
    }
    rows.push({ cls, kps, deaths, bt, win: win / N, dps, ehp });
  }
  const avgK = rows.reduce((s, r) => s + r.kps, 0) / rows.length;
  const avgB = rows.reduce((s, r) => s + r.bt, 0) / rows.length;
  console.log(`\n${z.id}（Lv ${z.level}）　群れ 平均 ${avgK.toFixed(2)}/秒・ボス 平均 ${avgB.toFixed(0)} 秒`);
  for (const r of rows) console.log(`  ${r.cls.padEnd(12)} 群れ ${r.kps.toFixed(2)}/秒（${Math.round((r.kps / avgK - 1) * 100)}%）倒れた ${r.deaths.toFixed(1)}　ボス ${r.bt.toFixed(0)} 秒（${Math.round((r.bt / avgB - 1) * 100)}%）勝率 ${Math.round(r.win * 100)}%　見積 DPS ${Math.round(r.dps)}　耐久 ${Math.round(r.ehp)}`);
}
