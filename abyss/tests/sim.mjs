// 数値の検証: Node で各クラスを放置で回し、進み具合を表にする。実行: node tests/sim.mjs [分]
// 装備は「強くなるなら自動で着替える」にして回す（放置の遊び方）。
// 強さ担当の確かめ（いつも走る）: 数字の大きさ（最初の 1 分で 2〜3 桁の整数）・古いセーブ（版 1）の数字の直し・序盤の進み。
// 長い計測は tools/balance_report.mjs（全クラスを並列・第十章まで・表つき）。ここの --pace はその簡易版。
import { Game } from '../src/game/game.js';
import { CLASSES } from '../src/data/classes.js';
import { ZONES } from '../src/data/world.js';
import { BAL, P, PG, NUM } from '../src/data/balance.js';
import { migrate, SAVE_VERSION } from '../src/game/state.js';
import { fmt } from '../src/engine/format.js';
import { runLife, fmtT } from '../tools/balance_lib.mjs';

const MIN = Number(process.argv[2]) || 60;
let bad = 0;
const check = (name, ok, info = '') => { if (!ok) bad++; console.log(`${ok ? '✔' : '✘'} ${name}${info ? `: ${info}` : ''}`); };

// ---------------- 数字の大きさ
{
  check('P(1) は 10・ゴールドの曲線 PG(1) も 10', P(1) === NUM && PG(1) === NUM, `P(1)=${P(1)} PG(1)=${PG(1)}`);
  const g = new Game({ seed: 3 });
  g.newGame('warrior', 'num');
  const hits = []; const golds = [];
  const orig = g.combat.emit.bind(g.combat);
  g.combat.emit = (e) => { if (e.t === 'dmg' && !e.dot && e.team !== g.combat.hero?.team) hits.push(e.v); if (e.t === 'gold') golds.push(e.v); return orig(e); };
  for (let i = 0; i < 20 * 60; i++) g.tick(0.05);
  const H = g.H;
  const life = BAL.monsterLife(1);
  check('最初の 1 分: 主人公のライフ・敵のライフ・武器は 2〜3 桁', H.life >= 100 && life >= 100 && H.weapon.max >= 10, `ライフ ${Math.round(H.life)}・敵 ${Math.round(life)}・武器 ${Math.round(H.weapon.min)}〜${Math.round(H.weapon.max)}`);
  const big = hits.filter((v) => v >= 10).length;
  check('最初の 1 分: 与えるダメージはほとんど 10 以上', hits.length > 5 && big / hits.length > 0.8, `${big}/${hits.length}`);
  check('最初の 1 分: 拾うゴールドは 10 以上', golds.length > 0 && golds.every((v) => v >= 10), golds.slice(0, 5).map((v) => fmt(v)).join(', '));
  check('10 以上の小数は整数で表示（5.5 は 5.5、12.4 は 12）', fmt(5.5) === '5.5' && fmt(12.4) === '12' && fmt(99.9) === '99' && fmt(1.234) === '1.23', `${fmt(5.5)} ${fmt(12.4)} ${fmt(99.9)} ${fmt(1.234)}`);
}

// ---------------- 古いセーブ（版 1）の数字を 10 倍に直す
{
  const g = new Game({ seed: 4 });
  g.newGame('ranger', 'old');
  const st = JSON.parse(JSON.stringify(g.snapshot()));
  st.version = 1;
  const it = { uid: 999, base: 'helm_plate_3', slot: 'helm', rarity: 'rare', ilvl: 20, q: 0, enh: 0, sockets: [], affixes: [{ id: 'life', s: 'life', t: 3, v: 123.4 }, { id: 'res_fire', s: 'res_fire', t: 2, v: 20 }], fixed: [{ s: 'armor', v: 50, r: 0.5, i: 0 }] };
  st.inv.bag.push(it);
  st.meta.gold = 1234; st.meta.stats.goldEarned = 5000;
  const m = migrate(st);
  const a = m.inv.bag.find((x) => x.uid === 999);
  check('古いセーブ: 版が上がる', m.version === SAVE_VERSION && SAVE_VERSION >= 2, `版 ${m.version}`);
  check('古いセーブ: 大きくなる能力（ライフ・アーマー）は 10 倍・% はそのまま', a.affixes[0].v === 1234 && a.affixes[1].v === 20 && a.fixed[0].v === 500, `${a.affixes[0].v} / ${a.affixes[1].v} / ${a.fixed[0].v}`);
  check('古いセーブ: ゴールドも 10 倍', m.meta.gold === 12340 && m.meta.stats.goldEarned === 50000, `${m.meta.gold}`);
  const again = migrate(JSON.parse(JSON.stringify(m)));
  check('今の版のセーブはもう直さない', again.inv.bag.find((x) => x.uid === 999).affixes[0].v === 1234 && again.meta.gold === 12340);
}

// ---------------- 見張り: 手下だけ倒し続けてウェーブが終わらないときもステージをやり直す（10 分）
{
  const g = new Game({ seed: 3 });
  g.newGame('warrior', 'sim');
  for (let i = 0; i < 20 * 15; i++) g.tick(0.05);
  const ws = g.sys.world;
  const r0 = ws.stuckRestarts || 0;
  const w0 = ws.wave;
  // 敵は倒れず攻撃もしない・撃破数だけ 1 秒に 1 増える（呼ばれた手下を倒し続けている形）
  for (let i = 0; i < 20 * 610; i++) {
    for (const u of g.combat.enemies()) { u.life = u.maxLife = 1e30; u.dmg = 0; }
    if (i % 20 === 0) g.state.meta.stats.kills++;
    g.tick(0.05);
  }
  check('見張り: ウェーブが 10 分進まなければステージをやり直す（撃破数が増えていても）', (ws.stuckRestarts || 0) > r0, `ウェーブ ${w0}・やり直し ${(ws.stuckRestarts || 0) - r0} 回`);
}

// ---------------- 序盤の進み（クラスごと）
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
  console.log(`${c.id.padEnd(12)} Lv${s.hero.level} 到達 ${ZONES[s.world.maxZone]?.name} 撃破 ${s.meta.stats.kills} 死亡 ${deaths} 金 ${fmt(s.meta.gold)} 発見 ${JSON.stringify(s.meta.stats.itemsFound)} (${Date.now() - t0}ms)\n   ${rows.join(' / ')}`);
  // 目安: 20 分で Lv8 以上・第一章の 2 つ目の地域まで（敵を硬くしてから。DESIGN §3）
  if (MIN >= 20) {
    const zi = s.world.maxZone;
    if (s.hero.level < 8 || zi < 1) { bad++; console.log(`✘ ${c.id}: 序盤が遅い（Lv${s.hero.level}・地域 ${zi + 1}）`); }
    if (zi >= 10) { bad++; console.log(`✘ ${c.id}: 序盤が速すぎる（${MIN} 分で地域 ${zi + 1}）`); }
  }
}

// ======== 物語の進み具合の長い計測（簡易） ========
// 実行: node tests/sim.mjs 20 --pace=2400 [--classes=warrior,ranger]   （--pace=分。全部の表は tools/balance_report.mjs）
// 遊び方は tools/balance_lib.mjs と同じ（自動装備・スキルの自動・星座盤の自動・autoBoss・ペット・クラフトなし）。
const paceArg = process.argv.find((a) => a.startsWith('--pace'));
if (paceArg) {
  const PMIN = Number(paceArg.split('=')[1]) || 600;
  const only = (process.argv.find((a) => a.startsWith('--classes=')) || '').slice(10).split(',').filter(Boolean);
  console.log(`\n── 進み具合（${PMIN} 分まで）　目安: Lv10 約20〜25分 / 章1 30〜50分 / 章5 7〜10時間 / 章10 33〜43時間 / 壁 10〜20分`);
  for (const c of CLASSES) {
    if (only.length && !only.includes(c.id)) continue;
    const r = await runLife({ cls: c.id, hours: PMIN / 60 });
    const acts = [];
    for (let a = 1; a <= 10; a++) if (r.acts[a]) acts.push(`章${a} ${fmtT(r.acts[a].t)}(Lv${r.acts[a].lv})`);
    const walls = r.wall.map((x) => x.wall).sort((a, b) => a - b);
    console.log(`${c.id.padEnd(12)} Lv10 ${r.lv10 ?? '—'}分　今 Lv${r.finalLevel}・${r.finalZone}　倒れた ${r.deaths}　壁 ${walls.length} 個（中央 ${fmtT(walls[Math.floor(walls.length / 2)])}・最大 ${fmtT(walls[walls.length - 1])}）　(${r.wallMs}ms)\n   ${acts.join(' / ') || '—'}`);
  }
}
process.exit(bad ? 1 : 0);
