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
process.exit(bad ? 1 : 0);
