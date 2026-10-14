// 数値の検証: Node で各クラスを放置で回し、進み具合を表にする。実行: node tests/sim.mjs [分]
// 装備は「強くなるなら自動で着替える」にして回す（放置の遊び方）。
import { Game } from '../src/game/game.js';
import { CLASSES } from '../src/data/classes.js';
import { ZONES } from '../src/data/world.js';

const MIN = Number(process.argv[2]) || 60;
let bad = 0;
for (const c of CLASSES) {
  const g = new Game({ seed: 7 });
  g.newGame(c.id, 'sim');
  g.state.inv.filter.autoEquip = true;
  let deaths = 0;
  g.events.on('heroDeath', () => deaths++);
  const rows = [];
  const t0 = Date.now();
  for (let m = 1; m <= MIN; m++) {
    for (let i = 0; i < 20 * 60; i++) g.tick(0.05);
    // スキルポイントは覚えている順に振る
    for (const id of Object.keys(g.state.hero.skills)) while (g.sys.skills.canLevel(id)) g.sys.skills.levelUp(id);
    if (m % Math.max(1, Math.floor(MIN / 6)) === 0) rows.push(`${m}分 Lv${g.state.hero.level} ${ZONES[g.state.world.maxZone]?.id}`);
  }
  const s = g.state;
  const ok = s.hero.level > 1 && s.meta.stats.kills > 0;
  if (!ok) bad++;
  console.log(`${c.id.padEnd(12)} Lv${s.hero.level} 到達 ${ZONES[s.world.maxZone]?.name} 撃破 ${s.meta.stats.kills} 死亡 ${deaths} 金 ${Math.round(s.meta.gold)} 発見 ${JSON.stringify(s.meta.stats.itemsFound)} (${Date.now() - t0}ms)\n   ${rows.join(' / ')}`);
}

// ======== ワールド担当: 物語の進み具合の長い計測 ========
// 実行: node tests/sim.mjs 20 --pace=2400   （--pace=分。ボスの自動再挑戦 autoBoss を入れ、第十章を倒すか時間まで回す）
// 章ごとの踏破の時刻とそのときの Lv、ボスの壁（初めて負けてから倒すまで）の中央と最大、倒れた回数、ため込み屋を出す。
// 目安（DESIGN §3）: Lv10 約 10 分 / 第一章 30〜45 分 / 第五章 6〜10 時間 / 第十章 25〜35 時間 / 壁 10〜20 分。敵の強さは BAL.WORLD で合わせる。
const paceArg = process.argv.find((a) => a.startsWith('--pace'));
if (paceArg) {
  const PMIN = Number(paceArg.split('=')[1]) || 600;
  const only = (process.argv.find((a) => a.startsWith('--classes=')) || '').slice(10).split(',').filter(Boolean);
  const fmtT = (sec) => (sec == null ? '—' : sec < 3600 ? `${Math.round(sec / 60)}分` : `${(sec / 3600).toFixed(1)}時間`);
  console.log(`\n── 進み具合（${PMIN} 分まで・autoBoss あり）　目安: Lv10 約10分 / 章1 30〜45分 / 章5 6〜10時間 / 章10 25〜35時間 / 壁 10〜20分`);
  for (const c of CLASSES) {
    if (only.length && !only.includes(c.id)) continue;
    const g = new Game({ seed: 7 });
    g.newGame(c.id, 'pace');
    g.state.inv.filter.autoEquip = true;
    g.state.meta.unlocks.autoBoss = true;
    let deaths = 0; let lv10 = null; const lvAt = {};
    g.events.on('heroDeath', () => deaths++);
    g.events.on('zoneClear', (e) => { if (e.first) lvAt[e.zone.id] = g.state.hero.level; });
    const t0 = Date.now();
    for (let m = 1; m <= PMIN; m++) {
      for (let i = 0; i < 20 * 60; i++) g.tick(0.05);
      for (const id of Object.keys(g.state.hero.skills)) while (g.sys.skills.canLevel(id)) g.sys.skills.levelUp(id);
      if (lv10 === null && g.state.hero.level >= 10) lv10 = m;
      if (g.state.world.cleared.a10z5) break;
    }
    const w = g.state.world;
    const acts = [];
    for (let a = 1; a <= 10; a++) { const id = `a${a}z5`; if (w.clearedAt[id] != null) acts.push(`章${a} ${fmtT(w.clearedAt[id])}(Lv${lvAt[id]})`); }
    const walls = Object.values(w.bossLog).map((l) => l.wall).filter((x) => x != null).sort((a, b) => a - b);
    const st = g.state.meta.stats;
    console.log(`${c.id.padEnd(12)} Lv10 ${lv10 ?? '—'}分　今 Lv${g.state.hero.level}・${ZONES[w.maxZone]?.name}　撃破 ${(st.kills / Math.max(1, g.state.playTime)).toFixed(2)}/秒　倒れた ${deaths}　壁 ${walls.length} 個（中央 ${fmtT(walls[Math.floor(walls.length / 2)])}・最大 ${fmtT(walls[walls.length - 1])}）　ため込み屋 ${st.goblins || 0}/${(st.goblins || 0) + (w.goblinEscaped || 0)} (${Date.now() - t0}ms)\n   ${acts.join(' / ') || '—'}`);
  }
}
// ======== ワールド担当ここまで ========
process.exit(bad ? 1 : 0);
