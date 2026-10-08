// 試算: 普通のプレイヤー（毎秒5タップ・一番お得な強化を買う）が転生を重ねるとどこまで行くか
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../core.js', import.meta.url), 'utf8');
vm.runInThisContext(src);
const WC = globalThis.WC;
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const s = WC.newState();
const RUNS = +(process.argv[2] || 20);
const PRIO = ['clone','thunder','combo','autobuy','midas','meteor','drill','weak','warp','greed','shock','fever','blast','drone','chrono','lucky'];
let total = 0;
for (let r = 0; r < RUNS; r++) {
  let t = 0, lastMaxT = 0, lastMax = s.runMax;
  const dt = 0.25;
  while (true) {
    const st = WC.stats(s);
    const p = WC.power(s) * dt;
    const res = WC.damage(s, p, st);
    if (res.broken) WC.nextWall(s);
    WC.tick(s, dt, st);
    if (!s.advance && s.failT > 20) { s.advance = true; s.failT = 0; }
    let b; let guard = 0;
    while ((b = WC.bestBuy(s)) && guard++ < 50) WC.buy(s, b, 1);
    t += dt;
    if (s.runMax > lastMax) { lastMax = s.runMax; lastMaxT = t; }
    if (t - lastMaxT > 90 && WC.shardsFor(s) > 0) break;
    if (t > 3600) break;
  }
  const ch = WC.abilityChoices(s, rnd);
  ch.sort((a, b) => PRIO.indexOf(a) - PRIO.indexOf(b));
  total += t;
  const got = WC.shardsFor(s);
  console.log(`run${r + 1}: max ${s.runMax} 時間 ${(t / 60).toFixed(1)}分 累計 ${(total / 60).toFixed(0)}分 魂+${got} 選択 ${ch[0]} 力 ${WC.fmt(WC.power(s))}`);
  WC.doReset(s, ch[0]);
  WC.checkAch(s);
  let g = 0;
  while (g++ < 200) {
    const opts = ['p_dmg', 'p_gold', 'p_time', 'p_crit', 'p_shard', 'p_fever'].filter((id) => WC.canBuyN(s, id, 1) && WC.upgCost(s, id, 1) <= s.shards);
    if (!opts.length) break;
    opts.sort((a, b) => WC.upgCost(s, a, 1) - WC.upgCost(s, b, 1));
    WC.buy(s, opts[0], 1);
  }
}
console.log('perm', JSON.stringify(s.perm), 'abil', JSON.stringify(Object.fromEntries(Object.entries(s.abil).filter(([, v]) => v))));
