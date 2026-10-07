// ジャンプの試練（ジャンプクエスト）のマップ J001〜J005。敵のいない「足場を跳び継いで上まで登る」専用のマップ。
// maps.mjs（設計の 234 枚）とは別のマップなので、ここで形を作り、world.mjs が全マップに足す（check.mjs も同じ検査を通す）。
//
// 形: 1 枚のマップに 3〜5 の「段」を縦に積む。段ごとに
//   段の床（マップの横いっぱいの浮いた足場。1 段目は地面）→ 小さな足場を斜めに跳び継ぐ（その場ジャンプで真上の足場へ）→ 次の段の床
//   落ちると今の段の床（下の段）に戻る。てっぺんの床に宝箱（調べる）と、町へ戻す案内人。
//   足場どうしは「横に ov px 重なり、縦に dy px 上」: 重なった所でその場ジャンプすると次の足場に乗る。
//   段が上がるほど、足場がせまく・重なりが少なく・段差が高く・数が多くなる。難しい段には縄（跳びついて登る）も混ぜる。
// 手触りの決まり（FEEL.md・check.mjs）: 段差 dy は 40〜60（跳べる 64 まで）。2 つ下の足場とは 80 以上離れるので「跳べそうで跳べない」段差は無い。
// 入口: 町の案内人（npcs.mjs の jq_*。乗り物の travel で入る・お金なし）。下と上の案内人は町へ戻す（travel）。
// 機械の確かめ: check.mjs（設計の値）と Tests/JumpQuestTests.cs（本物の物理: 宝箱まで登れる・どの跳び継ぎも 10 px 以上の幅で成功する）。
import { hashStr, makeRng } from './rng.mjs';
import { NPCS } from './npcs.mjs';

// [ID, 名前, 入口の町, 背景, 段（[足場の幅 w, 重なり ov, 段差 dy, 数 n, 縄の数]…）, 初めてのごほうび, 毎日のごほうび]
export const JUMP_COURSES = [
  ['J001', 'そよ風の木登り', 'V200', 'grove', [[120, 64, 44, 5, 0], [96, 48, 48, 6, 0], [80, 40, 52, 7, 0]],
    { meso: 20000, items: [['use.white_potion', 30], ['use.speed_tonic', 5]] }, { meso: 3000, items: [['use.white_potion', 5]] }],
  ['J002', '屋根伝いの夜道', 'V500', 'rooftops', [[104, 52, 48, 6, 0], [88, 40, 52, 7, 0], [72, 34, 56, 8, 1], [64, 30, 56, 8, 0]],
    { meso: 40000, items: [['use.big_white_potion', 20], ['use.dodge_tonic', 5]] }, { meso: 6000, items: [['use.big_white_potion', 5]] }],
  ['J003', '雲の柱のぼり', 'C100', 'cloud_tower', [[96, 48, 52, 7, 0], [80, 36, 56, 8, 1], [64, 30, 56, 9, 0], [56, 28, 60, 9, 1]],
    { meso: 80000, items: [['use.ship_ticket', 3], ['use.mana_elixir', 20]] }, { meso: 10000, items: [['use.mana_elixir', 5]] }],
  ['J004', 'ゼンマイ塔の階段', 'T100', 'clock_path', [[88, 40, 52, 7, 0], [72, 34, 56, 8, 1], [64, 30, 56, 9, 0], [56, 28, 60, 10, 1], [52, 26, 60, 10, 0]],
    { meso: 150000, items: [['use.xl_potion', 30], ['use.taxi_ticket', 3]] }, { meso: 20000, items: [['use.xl_potion', 5]] }],
  ['J005', '竜骨の背のぼり', 'D100', 'dragon_bone_village', [[80, 36, 56, 8, 0], [64, 30, 56, 9, 1], [56, 28, 60, 10, 1], [52, 26, 60, 10, 0], [48, 24, 62, 11, 1]],
    { meso: 300000, items: [['use.power_elixir', 10], ['use.blue_secret', 30]] }, { meso: 40000, items: [['use.power_elixir', 2]] }],
];

const W = 1200;          // 横幅
const MARGIN = 48;       // 足場を置く左右の余白
const TOP_ROOM = 200;    // てっぺんの床の上の空き

/** maps.mjs の行と同じ形（[ID, 名前, 種類, 推奨Lv, つながり, 出る敵, 特徴]）。checkWorld に渡す。 */
export const JUMP_RAW = JUMP_COURSES.map(([id, name, town, , stages]) => [id, name, '特', null, [], [], `ジャンプの試練（${stages.length} 段）。${town} の案内人から入る。敵はいない。`]);

/** 段の足場を作る（下から上へ）。戻り: { footholds, ropes, height, floors } */
function layout(id, stages) {
  const rng = makeRng(hashStr(id + '.jump'));
  // まず相対の y（0 = 地面、上へ負）で作り、最後にずらす
  const fh = [];
  const ropes = [];
  const floors = [0];
  let y = 0;          // 今の段の床の高さ
  let x = MARGIN + 40; // 次の足場の左端
  let dir = 1;
  stages.forEach(([w, ov, dy, n, ropeCount], si) => {
    const ropeAt = new Set();
    for (let r = 0; r < ropeCount; r++) ropeAt.add(2 + Math.floor(((r + 1) * (n - 3)) / (ropeCount + 1)));
    let py = y;
    let prev = null; // 前の足場 [x1, x2, y]
    for (let i = 0; i < n; i++) {
      const rope = ropeAt.has(i) && prev;
      const step = w - ov;
      let nx;
      if (!prev) nx = x;
      else {
        nx = prev[0] + dir * (rope ? 0 : step);
        if (nx < MARGIN || nx + w > W - MARGIN) { dir = -dir; nx = prev[0] + dir * (rope ? 0 : step); }
      }
      // 縄: 前の足場の真上 120 px（跳んでは届かない）に置き、縄でつなぐ
      const ny = rope ? py - 120 : py - dy;
      fh.push({ id: `s${si + 1}p${i + 1}`, x1: nx, x2: nx + w, y: ny });
      if (rope) {
        const rx = nx + Math.round(w / 2);
        ropes.push({ x: rx, topRel: ny, bottomRel: py - 20 });
      }
      prev = [nx, nx + w, ny];
      py = ny;
      // ときどき向きを変える（同じ向きばかりにならないように）
      if (i > 1 && rng.chance(0.18)) {
        const back = prev[0] - dir * step;
        if (back >= MARGIN && back + w <= W - MARGIN) dir = -dir;
      }
    }
    // 次の段の床（横いっぱい）: 最後の足場の dy 上
    y = py - dy;
    floors.push(y);
    fh.push({ id: `f${si + 2}`, x1: 0, x2: W, y, floor: true });
    x = prev[0];
  });
  return { fh, ropes, floors };
}

export function buildJumpMaps() {
  const maps = {};
  for (const [id, name, town, bg, stages, first, daily] of JUMP_COURSES) {
    const { fh, ropes, floors } = layout(id, stages);
    const top = floors[floors.length - 1];
    const H = Math.ceil((-top + TOP_ROOM + 140) / 8) * 8;
    const G = H - 80; // 地面
    const sy = (ry) => G + ry;
    const footholds = [{ id: 'g', ground: true, points: [[0, G], [W, G]] }];
    for (const f of fh) footholds.push({ id: f.id, points: [[f.x1, sy(f.y)], [f.x2, sy(f.y)]] });
    const topY = sy(top);
    const npcs = NPCS.filter((n) => n[2] === id).map(([nid, nm, , extra = {}]) => {
      const { x, top: onTop, ...rest } = extra;
      return { id: nid, name: nm, x, y: onTop ? topY : G, ...rest };
    });
    maps[id] = {
      id, name, region: 'J', type: '特', width: W, height: H, bgm: 'pq', bg, theme: 'tower', returnMap: town,
      footholds, ropes: ropes.map((r) => ({ x: r.x, top: sy(r.topRel), bottom: sy(r.bottomRel), ladder: false })), walls: [],
      portals: [{ name: 'sp', type: 'spawn', x: 60, y: G }],
      spawns: [], mobMax: 0, respawnSec: 7, timedSpawns: [], npcs,
      objects: [{ id: `${id}.chest`, name: 'てっぺんの宝箱', x: W - 120, y: topY }],
      jump: {
        town, stages: stages.length, floors: floors.map((f) => sy(f)),
        first: { meso: first.meso, items: first.items.map(([item, count]) => ({ item, count })) },
        daily: { meso: daily.meso, items: daily.items.map(([item, count]) => ({ item, count })) },
        medal: `jump.${id}`,
      },
      note: `ジャンプの試練（${stages.length} 段）。敵はいない。落ちると今の段の床へ。てっぺんの宝箱で初めてのごほうびと勲章（2 回目からは 1 日 1 回の小さなごほうび）。`,
      seed: hashStr(id + '.jump'),
    };
  }
  return maps;
}
