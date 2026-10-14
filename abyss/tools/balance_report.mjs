// 進み具合の表（強さ担当）。全クラスを別々のプロセスで並列に回して、章ごとの時刻・壁・倒れた回数・稼ぎを表にする。
//
// 使い方（abyss/ の中で）:
//   node tools/balance_report.mjs                    … 5 クラス × 35 時間（第十章を倒したら止める）。並列 2
//   node tools/balance_report.mjs --hours=12 --stop=5 --workers=2 --classes=warrior,ranger
//   node tools/balance_report.mjs --rebirth          … 第五章で転生して、2 周目の第五章までを測る
//   node tools/balance_report.mjs --json=out.json    … 記録を JSON にも書く
// 目安（docs/DESIGN.md §3）: Lv10 約 10 分 / 第一章 30〜45 分 / 第五章 6〜10 時間 / 第十章 25〜35 時間 / 壁 10〜20 分 / クラスの差 ±25%

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);

const CLASSES = ['warrior', 'ranger', 'sorcerer', 'necromancer', 'assassin'];
const NAMES = { warrior: '剣闘士', ranger: '狩人', sorcerer: '魔導士', necromancer: '死霊術師', assassin: '影刃' };

if (flag('worker')) {
  const { runLife, plain } = await import('./balance_lib.mjs');
  const rec = await runLife({ cls: arg('cls'), hours: Number(arg('hours', 35)), seed: Number(arg('seed', 7)), rebirth: flag('rebirth'), stopAct: Number(arg('stop', flag('rebirth') ? 5 : 10)), craft: flag('craft') ? Number(arg('enh', 10)) : false, endgame: Number(arg('endgame', 0)) });
  process.send?.(plain(rec));
  process.exit(0);
}

const hours = Number(arg('hours', 35));
const workers = Math.max(1, Math.min(4, Number(arg('workers', 2))));
const seed = Number(arg('seed', 7));
const stop = Number(arg('stop', flag('rebirth') ? 5 : 10));
const list = (arg('classes', '') || '').split(',').filter(Boolean);
const classes = list.length ? list : CLASSES;
const self = fileURLToPath(import.meta.url);

function runOne(cls) {
  return new Promise((resolve) => {
    const args = ['--worker', `--cls=${cls}`, `--hours=${hours}`, `--seed=${seed}`, `--stop=${stop}`];
    if (flag('rebirth')) args.push('--rebirth');
    if (flag('craft')) args.push('--craft', `--enh=${arg('enh', 10)}`);
    if (arg('endgame', '')) args.push(`--endgame=${arg('endgame')}`);
    const p = fork(self, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let got = null;
    p.on('message', (m) => { got = m; });
    p.on('exit', () => resolve(got || { cls, error: true }));
  });
}

const t0 = Date.now();
const results = [];
const queue = [...classes];
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  while (queue.length) { const c = queue.shift(); const r = await runOne(c); results.push(r); console.error(`  … ${c} 終わり（${Math.round((r.wallMs || 0) / 1000)} 秒）`); }
}));
results.sort((a, b) => classes.indexOf(a.cls) - classes.indexOf(b.cls));

const fmtT = (sec) => (sec == null ? '—' : sec < 3600 ? `${Math.round(sec / 60)}分` : `${(sec / 3600).toFixed(1)}h`);
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 0xff ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

console.log(`\n■ 進み具合（${hours} 時間まで・第${stop}章で止める・seed ${seed}・自動装備/自動スキル/星座盤の自動/autoBoss・クラフトなし）`);
console.log('  目安: Lv10 約10分 / 章1 30〜45分 / 章5 6〜10h / 章10 25〜35h / 壁 10〜20分 / クラス差 ±25%\n');
const head = ['クラス', 'Lv10', ...Array.from({ length: stop }, (_, i) => `章${i + 1}`), '壁 中央/最大', '20分超', '倒れた', '最後'];
console.log(head.map((h, i) => pad(h, i === 0 ? 10 : i <= stop + 1 ? 9 : 14)).join(''));
for (const r of results) {
  if (r.error) { console.log(`${pad(NAMES[r.cls] || r.cls, 10)}（失敗）`); continue; }
  const walls = r.wall.map((x) => x.wall);
  const over = r.wall.filter((x) => x.wall > 1200).length + (r.stuck?.length || 0);
  const row = [NAMES[r.cls] || r.cls, r.lv10 != null ? `${r.lv10}分` : '—'];
  for (let a = 1; a <= stop; a++) row.push(r.acts[a] ? fmtT(r.acts[a].t) : '—');
  row.push(`${fmtT(median(walls))}/${fmtT(walls.length ? Math.max(...walls) : null)}`, String(over), String(r.deaths), `Lv${r.finalLevel}${r.finalParagon ? `+${r.finalParagon}` : ''} ${r.finalZone}`);
  console.log(row.map((h, i) => pad(h, i === 0 ? 10 : i <= stop + 1 ? 9 : 14)).join(''));
}

// 章ごとの詳細
console.log('\n■ 章を倒したときの様子（Lv・戦力・撃破/秒・ゴールド/時・装備の平均 ilvl）');
for (const r of results) {
  if (r.error) continue;
  const parts = [];
  for (let a = 1; a <= stop; a++) { const x = r.acts[a]; if (x) parts.push(`章${a} Lv${x.lv} 戦力${short(x.power)} ${x.killsPerSec}/秒 ${short(x.goldPerH)}G/h il${x.ilvl}`); }
  console.log(`${pad(NAMES[r.cls], 10)}${parts.join(' | ')}`);
}

// 経済（章ごと: 持っているゴールド・使ったゴールド・素材・強化の平均）
console.log('\n■ 経済（章を倒したとき: 所持金 / 使った金 / 鉄屑・魔塵・秘晶・欠片 / 装備の強化の平均）');
for (const r of results) {
  if (r.error) continue;
  const parts = [];
  for (const a of [1, 3, 5, 7, 10]) { const x = r.acts[a]; if (x?.mats) parts.push(`章${a} ${short(x.gold)}/${short(x.goldSpent)}G 屑${x.mats.scrap}・塵${x.mats.dust}・晶${x.mats.crystal}・欠${x.mats.shard} +${x.enhAvg}`); }
  console.log(`${pad(NAMES[r.cls], 10)}${parts.join(' | ')}`);
}

// 壁（20 分を超えた物）
console.log('\n■ 20 分を超えた壁・越えられなかった壁');
for (const r of results) {
  if (r.error) continue;
  const big = r.wall.filter((x) => x.wall > 1200).map((x) => `${x.z} ${fmtT(x.wall)}(${x.tries}回)`);
  const stuck = (r.stuck || []).map((x) => `${x.z} 未突破 ${fmtT(x.since)}(${x.tries}回)`);
  console.log(`${pad(NAMES[r.cls], 10)}${[...big, ...stuck].join(' / ') || 'なし'}`);
}

// ドロップ
console.log('\n■ ドロップ（全体の数と 1 時間あたり）・ため込み屋・卵');
for (const r of results) {
  if (r.error) continue;
  const h = Math.max(0.01, r.playTime / 3600);
  const R = r.rarity;
  const leg = (R.legendary || 0) + (R.unique || 0) + (R.set || 0) + (R.mythic || 0);
  console.log(`${pad(NAMES[r.cls], 10)}レア ${R.rare || 0}（${((R.rare || 0) / h).toFixed(0)}/h）エピック ${R.epic || 0}（${((R.epic || 0) / h).toFixed(1)}/h）伝説以上 ${leg}（${(leg / h).toFixed(1)}/h・${(60 / Math.max(0.01, leg / h)).toFixed(0)}分に 1 つ）ミシック ${R.mythic || 0}　ため込み屋 ${r.goblins}/${r.goblins + r.goblinEscaped}　卵 ${r.eggs}・ペット ${r.pets}　実績 ${r.ach}pt　金 ${short(r.goldEarned)}`);
}

if (flag('rebirth')) {
  console.log('\n■ 転生（第五章で転生 → 2 周目の第五章まで）');
  for (const r of results) {
    if (r.error) continue;
    const first = r.acts['5']?.t;
    const second = r.life2?.sec;
    console.log(`${pad(NAMES[r.cls], 10)}1 周目 ${fmtT(first)}　魂 ${r.rebirths[0]?.souls ?? '—'}（祭壇 ${r.rebirths[0]?.bought ?? 0} 回）→ ${r.rebirths[0]?.warp ?? '—'} へ　2 周目 ${fmtT(second)}　速さ ×${first && second ? (first / second).toFixed(1) : '—'}`);
  }
}

if (arg('endgame', '')) {
  console.log(`\n■ 物語のあと（${arg('endgame')} 時間・苦行は自動・2 時間ごとに裂け目 30 分・門番は欠片がそろったら）`);
  for (const r of results) {
    const e = r.endgame;
    if (!e || e.start == null) { console.log(`${pad(NAMES[r.cls], 10)}物語を終えていない`); continue; }
    const hs = e.hourly.filter((x, i) => [0, 1, 3, 5, 9, 14, 19, 29, 39, 49, 59, 79, 99].includes(i)).map((x) => `${x.h}h: Lv${x.lv}+${x.par} 苦行${x.t}/${x.tMax} 裂${x.rift} ${x.kps}/秒 倒${x.deaths}`);
    const gw = e.gates.filter((x) => x.ok).length;
    console.log(`${pad(NAMES[r.cls], 10)}${hs.join(' | ')}\n          門番 ${gw}/${e.gates.length} 勝（${e.gates.map((x) => `${x.gi}:${x.tier}${x.ok ? '○' : '×'}`).slice(0, 12).join(' ')}）　裂け目の記録: ${e.rifts.filter((x) => x.ok).map((x) => x.lv).reduce((a, b) => Math.max(a, b), 0) || '—'}（失敗 ${e.rifts.filter((x) => !x.ok).length}）`);
  }
}

const nums = results.filter((r) => !r.error && r.acts[stop]).map((r) => r.acts[stop].t);
if (nums.length > 1) {
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  console.log(`\n■ 第${stop}章のクラスの差: 平均 ${fmtT(avg)}・最速 ${fmtT(Math.min(...nums))}（${Math.round((Math.min(...nums) / avg - 1) * 100)}%）・最遅 ${fmtT(Math.max(...nums))}（+${Math.round((Math.max(...nums) / avg - 1) * 100)}%）`);
}
console.log(`\n（${Math.round((Date.now() - t0) / 1000)} 秒）`);
const out = arg('json', '');
if (out) writeFileSync(out, JSON.stringify(results, null, 1));

function short(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}兆`;
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}億`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v));
}
