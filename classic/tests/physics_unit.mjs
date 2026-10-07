// 物理の数値の単体テスト（FEEL.md の値どおりに動くか）
// 実行: node classic/tests/physics_unit.mjs
import { FEEL, DT } from '../src/engine/feel.js';
import { createPlayer, stepPlayer, hurtPlayer, blinkVisible } from '../src/engine/physics.js';
import { loadMap } from '../src/world/mapFormat.js';
import testField from '../src/data/maps/test_field.js';

let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) { pass++; console.log(`  ok  ${name}${info ? `  (${info})` : ''}`); }
  else { fail++; console.log(`  NG  ${name}${info ? `  (${info})` : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const I = (o = {}) => ({ left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, ...o });

// 平らな広いマップ
const flat = loadMap({
  id: 'flat', width: 4000, height: 2000,
  footholds: [
    { id: 'g', ground: true, points: [[0, 1000], [4000, 1000]] },
    { id: 'p', points: [[1000, 936], [1400, 936]] },
    { id: 'slope', points: [[2000, 900], [2200, 900], [2400, 800], [2600, 800]] },
  ],
  ropes: [{ x: 3000, top: 700, bottom: 980 }, { x: 3500, top: 936, bottom: 990, ladder: true }],
});
// はしごの上の足場
flat.segs.push(...loadMap({ id: 'x', width: 4000, height: 2000, footholds: [{ id: 'lt', points: [[3400, 936], [3600, 936]] }] }).segs);

function settle(p, map) { for (let i = 0; i < 60; i++) stepPlayer(p, I(), map, DT); }
function run(p, map, inp, frames) { for (let i = 0; i < frames; i++) stepPlayer(p, I(inp), map, DT); }

console.log('歩く');
{
  const p = createPlayer(200, 1000); settle(p, flat);
  check('着地して立ち', p.state === 'stand' && p.y === 1000);
  let t = 0;
  while (p.vx < FEEL.walkSpeed - 0.01 && t < 60) { stepPlayer(p, I({ right: true }), flat, DT); t++; }
  check('最高速 125 px/秒', near(p.vx, 125, 0.01), `vx=${p.vx}`);
  check('最高速まで 約 0.09 秒（5〜6 フレーム）', t >= 5 && t <= 6, `${t} フレーム`);
  run(p, flat, { right: true }, 60);
  const x0 = p.x; run(p, flat, { right: true }, 60);
  check('1 秒で 125 px 進む', near(p.x - x0, 125, 0.5), `${(p.x - x0).toFixed(2)} px`);
  const xs = p.x; let f = 0;
  while (p.vx > 0 && f < 60) { stepPlayer(p, I(), flat, DT); f++; }
  check('離すと 約 0.16 秒で止まる', f >= 9 && f <= 10, `${f} フレーム`);
  check('止まるまで 約 10 px すべる', near(p.x - xs, 9.8, 1.2), `${(p.x - xs).toFixed(2)} px`);
  check('止まったら立ち', p.state === 'stand');
}

console.log('ジャンプ');
{
  const p = createPlayer(200, 1000); settle(p, flat);
  stepPlayer(p, I({ jump: true, jumpPressed: true }), flat, DT);
  check('初速 555', p.vy === -FEEL.jumpSpeed && p.state === 'air');
  let minY = p.y, frames = 0;
  while (p.state === 'air' && frames < 200) { stepPlayer(p, I(), flat, DT); minY = Math.min(minY, p.y); frames++; }
  const h = 1000 - minY;
  check('最高 約 77 px（555²/2/2000 = 77.0）', near(h, 77, 1), `${h.toFixed(2)} px`);
  check('滞空 約 0.55 秒', near((frames + 1) * DT, 0.555, 0.04), `${((frames + 1) * DT).toFixed(3)} 秒`);
  check('着地すると立ち', p.state === 'stand' && p.y === 1000);
  // 64 px の段に上がれる
  const q = createPlayer(900, 1000); settle(q, flat);
  run(q, flat, { right: true }, 30);
  stepPlayer(q, I({ jump: true, right: true }), flat, DT);
  for (let i = 0; i < 60 && q.state === 'air'; i++) stepPlayer(q, I({ right: true }), flat, DT);
  check('64 px の段に跳び乗れる', q.y === 936, `y=${q.y.toFixed(1)}`);
}

console.log('空中の左右');
{
  const p = createPlayer(200, 1000); settle(p, flat);
  stepPlayer(p, I({ jump: true }), flat, DT);
  const x0 = p.x;
  while (p.state === 'air') stepPlayer(p, I({ right: true }), flat, DT);
  check('その場ジャンプ中に → で動けるのは少し（約 15 px）', p.x - x0 > 5 && p.x - x0 < 25, `${(p.x - x0).toFixed(1)} px`);
  check('向きは変わる', p.facing === 1);
  // 走りジャンプは速さを保つ
  const q = createPlayer(200, 1000); settle(q, flat);
  run(q, flat, { right: true }, 30);
  stepPlayer(q, I({ jump: true, right: true }), flat, DT);
  const qx = q.x; let fr = 0;
  while (q.state === 'air') { stepPlayer(q, I({ left: true }), flat, DT); fr++; }
  check('走りジャンプで逆を押しても勢いはほとんど変わらない', q.vx > 60, `着地時 vx=${q.vx.toFixed(1)}`);
  check('走りジャンプの飛距離 約 50〜70 px', q.x - qx > 45 && q.x - qx < 75, `${(q.x - qx).toFixed(1)} px`);
}

console.log('落下');
{
  const p = createPlayer(200, 0);
  let maxV = 0;
  for (let i = 0; i < 120 && p.state === 'air'; i++) { stepPlayer(p, I(), flat, DT); maxV = Math.max(maxV, p.vy); }
  check('落下の最大速度 670', maxV === FEEL.maxFall, `${maxV}`);
  check('下からすり抜けて地面に着地', p.y === 1000 && p.state === 'stand');
  const q = createPlayer(1200, 1000); settle(q, flat);
  stepPlayer(q, I({ jump: true }), flat, DT);
  while (q.state === 'air') stepPlayer(q, I(), flat, DT);
  check('浮いた足場（64 px 上）の下からジャンプ → すり抜けて上に乗る', q.y === 936, `y=${q.y}`);
}

console.log('下ジャンプ・端から落ちる');
{
  const p = createPlayer(1200, 936); settle(p, flat);
  check('足場に乗っている', p.y === 936 && p.seg && p.seg.chain.id === 'p');
  stepPlayer(p, I({ down: true, jump: true, jumpPressed: true }), flat, DT);
  check('↓＋ジャンプで小さく跳ねる', p.state === 'air' && p.vy === -FEEL.downJumpSpeed);
  let minY = p.y;
  while (p.state === 'air') { stepPlayer(p, I(), flat, DT); minY = Math.min(minY, p.y); }
  check('跳ねる高さ 約 10 px', near(936 - minY, 10, 1), `${(936 - minY).toFixed(1)} px`);
  check('下の地面に降りる', p.y === 1000);
  stepPlayer(p, I({ down: true, jump: true, jumpPressed: true }), flat, DT);
  check('一番下の地面では ↓＋ジャンプしても降りない（伏せのまま）', p.state === 'prone' && p.y === 1000);
  const q = createPlayer(1390, 936); settle(q, flat);
  run(q, flat, { right: true }, 20);
  check('端から歩いて出ると落ちる', q.state === 'air' || q.y === 1000);
  while (q.state === 'air') stepPlayer(q, I({ right: true }), flat, DT);
  check('落ちて地面へ', q.y === 1000);
}

console.log('坂');
{
  const p = createPlayer(2150, 900); settle(p, flat);
  run(p, flat, { right: true }, 30);
  let ok = true;
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, I({ right: true }), flat, DT);
    if (p.state !== 'walk') ok = false;
    if (p.x > 2200 && p.x < 2400 && !near(p.y, 900 - (p.x - 2200) / 2, 0.01)) ok = false;
  }
  check('坂の上り: 線にそって離れずに歩く', ok && p.x > 2400, `x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`);
  const q = createPlayer(2240, 870); settle(q, flat);
  run(q, flat, { right: true }, 30);
  const x0 = q.x; run(q, flat, { right: true }, 30);
  const dx = q.x - x0;
  check('坂の横の速さは cos 倍（125 × 0.894 / 2 ≒ 55.9 px / 0.5 秒）', near(dx, 125 * Math.cos(Math.atan(0.5)) / 2, 0.6), `${dx.toFixed(2)} px`);
}

console.log('縄・はしご');
{
  const p = createPlayer(3005, 1000); settle(p, flat);
  stepPlayer(p, I({ up: true }), flat, DT);
  check('縄の下端より下から ↑ でつかまる', p.state === 'rope' && p.x === 3000 && p.y === 980, `y=${p.y}`);
  const y0 = p.y; run(p, flat, { up: true }, 60);
  check('上る速さ 90 px/秒', near(y0 - p.y, 90, 0.01), `${(y0 - p.y).toFixed(2)} px`);
  stepPlayer(p, I({ jump: true, jumpPressed: true }), flat, DT);
  check('ジャンプだけでは離れない', p.state === 'rope');
  stepPlayer(p, I({ right: true, jump: true, jumpPressed: true }), flat, DT);
  check('左右＋ジャンプで飛び降りる', p.state === 'air' && p.vx === FEEL.ropeJumpSpeedX && p.vy === -FEEL.ropeJumpSpeedY);
  stepPlayer(p, I({ up: true }), flat, DT);
  check('飛び降りた直後はつかまらない', p.state === 'air');
  // 空中で縄にとびつく
  const q = createPlayer(2992, 1000); settle(q, flat);
  stepPlayer(q, I({ jump: true }), flat, DT);
  for (let i = 0; i < 10; i++) stepPlayer(q, I(), flat, DT);
  stepPlayer(q, I({ up: true }), flat, DT);
  check('空中で ↑ を押すと縄にとびつく', q.state === 'rope');
  // はしご: 上の足場で ↓ → つかまって降りる。上りきると足場に立つ
  const r = createPlayer(3502, 936); r.y = 936; settle(r, flat);
  check('はしごの上の足場に立つ', r.y === 936 && r.state === 'stand');
  stepPlayer(r, I({ down: true }), flat, DT);
  check('↓ ではしごにつかまる', r.state === 'ladder', r.state);
  run(r, flat, { down: true }, 120);
  check('下端で手を離して地面へ（↓ のままなので伏せ）', r.y === 1000 && r.state === 'prone', `${r.state} y=${r.y}`);
  stepPlayer(r, I({ up: true }), flat, DT);
  run(r, flat, { up: true }, 60);
  check('上りきると上の足場に立つ', r.state === 'stand' && r.y === 936, `${r.state} y=${r.y}`);
}

console.log('被弾');
{
  const p = createPlayer(200, 1000); settle(p, flat);
  check('ふっとぶ', hurtPlayer(p, 230) && p.vx === -FEEL.hurtKnockX && p.vy === -FEEL.hurtKnockY);
  check('無敵の間はもう当たらない', !hurtPlayer(p, 230));
  stepPlayer(p, I({ right: true }), flat, DT);
  check('着地まで操作できない', p.vx === -FEEL.hurtKnockX);
  let vis = 0, hid = 0, minY = 1000;
  for (let i = 0; i < 120; i++) { stepPlayer(p, I(), flat, DT); minY = Math.min(minY, p.y); if (p.invT > 0) (blinkVisible(p) ? vis++ : hid++); }
  check('浮く高さ 約 20 px', near(1000 - minY, 19.6, 1.5), `${(1000 - minY).toFixed(1)} px`);
  check('点滅する（表示と非表示が半々）', vis > 30 && hid > 30, `表示 ${vis} / 非表示 ${hid}`);
  check('1.5 秒で無敵が切れる', p.invT === 0);
}

console.log('テストマップ');
{
  const map = loadMap(testField);
  check('足場の線分', map.segs.length === 10, `${map.segs.length}`);
  check('縄 1・はしご 1', map.ropes.filter((r) => !r.ladder).length === 1 && map.ropes.filter((r) => r.ladder).length === 1);
  // 段差がすべて 64 px 以下か、縄・はしごがあるか
  const p = createPlayer(90, 600); settle(p, map);
  check('出現の位置で地面に立つ', p.y === 640 && p.state === 'stand');
  // 1 分間、右へ走りながらジャンプし続けて、すり抜け（地面の下へ落ちる）が無い
  let bad = 0;
  for (let i = 0; i < 3600; i++) {
    const t = i % 600;
    stepPlayer(p, I({ right: t < 300, left: t >= 300, jump: i % 50 < 2 }), map, DT);
    if (p.y > 641) bad++;
  }
  check('1 分間 動き回って地面をすり抜けない', bad === 0, `${bad}`);
}

console.log(`\n${pass} ok / ${fail} NG`);
process.exit(fail ? 1 : 0);
