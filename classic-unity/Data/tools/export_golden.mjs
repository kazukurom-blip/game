// テストの期待値（Golden）を、ブラウザ版の JS（classic/src/engine/physics.js）と
// 設計書の式（classic/tools/lib/curves.mjs・combat.mjs）から書き出す。
// C# の Core が「同じ入力で同じ数値」になることを Tests/GoldenTests.cs で比べる。
//
// 実行: node classic-unity/Data/tools/export_golden.mjs
// 出力: classic-unity/Tests/Golden/physics_traces.json, curves.json, combat.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DT } from '../../../classic/src/engine/feel.js';
import { createPlayer, stepPlayer, hurtPlayer } from '../../../classic/src/engine/physics.js';
import { loadMap } from '../../../classic/src/world/mapFormat.js';
import testField from '../../../classic/src/data/maps/test_field.js';
import { expTable, mobBase, soloMul, logInterp, nice, EXP_ANCHORS } from '../../../classic/tools/lib/curves.mjs';
import { physRange, magicRange, afterDef, levelPenalty, hitChance, damageTaken, WEAPON } from '../../../classic/tools/lib/combat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '..', 'Tests', 'Golden');
fs.mkdirSync(OUT, { recursive: true });

// ---------------- 物理
// physics_unit.mjs と同じ平らなマップ（あとから足した 'lt' も 4 本目の足場として同じ順番で入れる）
const FLAT = {
  id: 'flat', width: 4000, height: 2000,
  footholds: [
    { id: 'g', ground: true, points: [[0, 1000], [4000, 1000]] },
    { id: 'p', points: [[1000, 936], [1400, 936]] },
    { id: 'slope', points: [[2000, 900], [2200, 900], [2400, 800], [2600, 800]] },
    { id: 'lt', points: [[3400, 936], [3600, 936]] },
  ],
  ropes: [{ x: 3000, top: 700, bottom: 980 }, { x: 3500, top: 936, bottom: 990, ladder: true }],
  portals: [],
};
const TEST_FIELD = {
  id: testField.id, width: testField.width, height: testField.height,
  footholds: testField.footholds, ropes: testField.ropes, portals: testField.portals,
};
const MAPS = { flat: FLAT, test_field: TEST_FIELD };

// 入力の印: L=1 R=2 U=4 D=8 J=16 JP=32
const L = 1, R = 2, U = 4, D = 8, J = 16, JP = 32;
const toInp = (m) => ({ left: !!(m & L), right: !!(m & R), up: !!(m & U), down: !!(m & D), jump: !!(m & J), jumpPressed: !!(m & JP) });

// 決まった疑似乱数（LCG）で長い入力を作る
function lcgInputs(seed, frames) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const runs = [];
  let left = frames;
  while (left > 0) {
    const n = Math.min(left, 1 + Math.floor(rnd() * 40));
    let m = 0;
    const r = rnd();
    if (r < 0.35) m |= R; else if (r < 0.65) m |= L;
    if (rnd() < 0.25) m |= J;
    if (rnd() < 0.15) m |= U;
    if (rnd() < 0.10) m |= D;
    if (m & J) { runs.push([m | JP, 1]); if (n > 1) runs.push([m, n - 1]); } else runs.push([m, n]);
    left -= n;
  }
  return runs;
}

const SCENARIOS = [
  { name: 'walk_and_slide', map: 'flat', x: 200, y: 1000, inputs: [[0, 60], [R, 90], [0, 30], [L, 20], [R, 10], [0, 40]] },
  { name: 'jump_in_place_air_control', map: 'flat', x: 200, y: 1000, inputs: [[0, 60], [J | JP, 1], [R, 40], [0, 20], [J | JP, 1], [L, 40], [0, 10]] },
  { name: 'running_jump_reverse', map: 'flat', x: 200, y: 1000, inputs: [[0, 60], [R, 30], [J | JP | R, 1], [L, 40], [0, 30]] },
  { name: 'hold_jump_bunny', map: 'flat', x: 200, y: 1000, inputs: [[0, 10], [J | JP | R, 1], [J | R, 150]] },
  { name: 'step_up_64', map: 'flat', x: 900, y: 1000, inputs: [[0, 60], [R, 30], [J | JP | R, 1], [R, 60]] },
  { name: 'fall_from_sky', map: 'flat', x: 200, y: 0, inputs: [[0, 120]] },
  { name: 'pass_through_platform', map: 'flat', x: 1200, y: 1000, inputs: [[0, 60], [J | JP, 1], [0, 60]] },
  { name: 'down_jump', map: 'flat', x: 1200, y: 936, inputs: [[0, 60], [D | J | JP, 1], [0, 60], [D | J | JP, 1], [0, 5]] },
  { name: 'walk_off_edge', map: 'flat', x: 1390, y: 936, inputs: [[0, 60], [R, 80]] },
  { name: 'slope_up_down', map: 'flat', x: 2150, y: 900, inputs: [[0, 60], [R, 200], [0, 20], [L, 200], [0, 20]] },
  { name: 'rope_climb_and_jump', map: 'flat', x: 3005, y: 1000, inputs: [[0, 60], [U, 61], [J | JP, 1], [R | J | JP, 1], [U, 1], [0, 60]] },
  { name: 'rope_grab_midair', map: 'flat', x: 2992, y: 1000, inputs: [[0, 60], [J | JP, 1], [0, 10], [U, 1], [U, 200], [D, 400]] },
  { name: 'ladder_from_top', map: 'flat', x: 3502, y: 936, inputs: [[0, 60], [D, 121], [U, 61], [0, 10]] },
  { name: 'prone', map: 'flat', x: 200, y: 1000, inputs: [[0, 60], [R, 40], [D, 30], [D | R, 20], [0, 10]] },
  { name: 'test_field_random', map: 'test_field', x: 90, y: 600, inputs: [[0, 60], ...lcgInputs(12345, 3600)] },
  { name: 'test_field_random2', map: 'test_field', x: 1500, y: 300, inputs: lcgInputs(987654321, 3600) },
];
// 被弾（そのフレームの更新の前に hurtPlayer(p, fromX) を呼ぶ）
SCENARIOS.push({ name: 'hurt_knockback', map: 'flat', x: 200, y: 1000, inputs: [[0, 60], [R, 150]], hurts: [{ frame: 60, fromX: 230 }, { frame: 70, fromX: 230 }, { frame: 160, fromX: 100 }] });
SCENARIOS.push({ name: 'hurt_on_rope', map: 'flat', x: 3005, y: 1000, inputs: [[0, 60], [U, 30], [U, 60]], hurts: [{ frame: 80, fromX: 2990 }] });

const STATES = ['stand', 'walk', 'prone', 'air', 'rope', 'ladder'];

function runScenario(sc) {
  const map = loadMap(MAPS[sc.map]);
  const p = createPlayer(sc.x, sc.y);
  const trace = [];
  let f = 0;
  const hurts = sc.hurts || [];
  for (const [m, n] of sc.inputs) {
    for (let i = 0; i < n; i++) {
      for (const h of hurts) if (h.frame === f) hurtPlayer(p, h.fromX);
      stepPlayer(p, toInp(m), map, DT);
      trace.push([p.x, p.y, p.vx, p.vy, STATES.indexOf(p.state), p.facing, p.invT]);
      f++;
    }
  }
  return trace;
}

const physics = {
  note: 'export_golden.mjs が classic/src/engine/physics.js で作った期待値。1 行 = 1 フレームの [x, y, vx, vy, 状態, 向き, 無敵の残り]。状態: ' + STATES.join(','),
  dt: DT, states: STATES, maps: MAPS,
  scenarios: SCENARIOS.map((sc) => ({ ...sc, trace: runScenario(sc) })),
};
fs.writeFileSync(path.join(OUT, 'physics_traces.json'), JSON.stringify(physics));

// ---------------- 経験値の表・敵の基礎値
const curves = {
  exp: expTable().map((r) => [r.lv, r.need, r.total]),
  mobBase: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30, 42, 55, 70, 99, 120, 150, 199, 200].map((lv) => ({ lv, ...mobBase(lv), solo: soloMul(lv) })),
  nice: [3.4, 7.5, 99.5, 100.4, 1234.5, 98765, 1499999, 0.5, 2.5, 155.5].map((v) => [v, nice(v)]),
  logInterp: [1, 5.5, 10, 33, 77.7, 150, 199, 205].map((x) => [x, logInterp(EXP_ANCHORS, x)]),
};
fs.writeFileSync(path.join(OUT, 'curves.json'), JSON.stringify(curves));

// ---------------- 戦闘の式
const phys = [];
for (const type of Object.keys(WEAPON)) {
  for (const [main, sub, watk, mastery] of [[35, 4, 17, 0.1], [120, 40, 60, 0.6], [400, 120, 150, 0.8], [4, 4, 10, 0.1]]) {
    for (const stab of [false, true]) phys.push({ type, main, sub, watk, mastery, stab, ...physRange({ type, main, sub, watk, mastery, stab }) });
  }
}
const magic = [];
for (const [int, matk, spell, mastery] of [[20, 35, 22, 0.1], [100, 160, 60, 0.6], [500, 700, 200, 0.75], [4, 4, 1, 0.1]]) magic.push({ int, matk, spell, mastery, ...magicRange({ int, matk, spell, mastery }) });
const defs = [];
for (const [dmg, def, r] of [[100, 10, 0.55], [5, 20, 0.5], [1000, 300, 0.6], [57.9, 3, 0.55]]) defs.push({ dmg, def, r, out: afterDef(dmg, def, r) });
const lvpen = [];
for (const [p, m] of [[10, 5], [10, 10], [10, 15], [10, 40], [50, 80], [1, 200]]) lvpen.push({ p, m, out: levelPenalty(p, m) });
const hits = [];
for (const [acc, avoid, p, m] of [[20, 1, 1, 1], [10, 15, 10, 30], [30, 25, 30, 32], [5, 5, 5, 5], [12, 20, 10, 12], [40, 50, 30, 50]]) hits.push({ acc, avoid, p, m, out: hitChance(acc, avoid, p, m) });
const taken = [];
for (const [atk, wdef, ml, pl] of [[6, 5, 1, 1], [31, 20, 10, 8], [200, 150, 60, 55], [500, 50, 100, 120]]) taken.push({ atk, wdef, ml, pl, out: damageTaken(atk, wdef, ml, pl) });
fs.writeFileSync(path.join(OUT, 'combat.json'), JSON.stringify({ phys, magic, defs, lvpen, hits, taken }));

console.log('Golden を書き出した:', OUT);
for (const sc of physics.scenarios) console.log(`  ${sc.name}: ${sc.trace.length} フレーム`);
