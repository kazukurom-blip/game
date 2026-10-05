// 納品画像の検査（tools/check_art.mjs）の「キャラ以外」の部分: 背景・地面/足場・アイコン・乗り物・UI（依頼書 CODEX_BATCH_03）
//   classifyEnv(rel) / parseCatalog03(csv) / checkEnv(r, im, info, cat, H) / envOverlay(...) / envManifestKey(rel)
// 検査:
//   1. 大きさ（bg 2560×720・tiles 地面 512×256 / 足場 512×96・icons 256×256・vehicles 1024×512 / タイヤ 256×256・ui 1920×1080 / 1600×600 / 2048×1152）
//   2. 透明: 背景の空（上 48 行）・遠景の地面より下（y=648〜）・アイコン/乗り物/ロゴの外周。スキルのアイコンは逆に正方形いっぱい（角を丸めない）
//   3. 左右の継ぎ目（背景・地面・足場・あかり）: 左端の列と右端の列の差を、絵の中の隣り合う列の差（ふつうの変化）と比べる
//   4. 地面の線: 地面タイルは上から 40px、足場は 16px から下が埋まっているか。中景は建物の足元が y=640 に届いているか（浮いていないか）
//   5. 乗り物: マゼンタ #FF00FF の印が2つ、下半分・同じ高さ・離れているか、タイヤの所が空いているか。タイヤは円く中央にあるか
//   6. 装備アイコンの色: 依頼書の基準色（主色）があるか
import { findMarkers } from '../src/render/artOverrides.js';

export const ENV_TH = {
  seamOkMin: 10, seamWarn: 0.3, seamNg: 0.6,                     // 継ぎ目: 差がこれ以下 or 自然な差の 1.2 倍以下なら OK。score 0.3〜 注意・0.6〜 NG
  skyRows: 48, skyWarn: 0.1, skyNg: 0.5,                         // 背景の上 48 行の不透明の割合
  belowWarn: 0.1,                                                // 遠景: y=648〜 の不透明の割合
  footRows: [620, 640], footWarn: 0.25,                          // 中景: y=620〜639 の不透明の割合（建物の足元）
  surfaceOk: 6, surfaceWarn: 16, surfaceCov: 0.9,                // 地面・足場: 不透明が 90% 以上になる最初の行と 40/16 の差
  solidWarn: 0.95,                                               // 地面: 線より下（+20〜）の不透明の割合
  lightsOpaqueWarn: 0.5, lightsDarkWarn: 0.35,
  iconSmall: 0.55, skillFillOk: 0.97, skillFillNg: 0.6,
  markerDyWarn: 0.04, markerDxWarn: 0.3, holeWarn: 0.6,
  wheelCenter: 10, wheelRound: 0.08, wheelSmall: 0.5,
};
export const REGION_IDS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop', 'spaceport'];
const SIZE = {
  bg: [2560, 720], ground: [512, 256], platform: [512, 96], icon: [256, 256], vehicle: [1024, 512], wheel: [256, 256],
  title_art: [1920, 1080], logo: [1600, 600], world_map: [2048, 1152],
};

/** rel（assets/sprites/ からのパス）→ 種類。キャラ以外でなければ null */
export function classifyEnv(rel) {
  let m;
  if ((m = /^bg\/([a-z]+)_(town|field)(?:_v([0-3]))?_(far|mid|lights)\.png$/.exec(rel))) return { kind: 'bg', region: m[1], town: m[2] === 'town', v: m[3] != null ? +m[3] : null, layer: m[4], bad: !REGION_IDS.includes(m[1]) };
  if (/^bg\//.test(rel)) return { kind: 'bg', bad: true };
  if ((m = /^tiles\/([a-z]+)(?:_v([0-3]))?_(ground|platform)\.png$/.exec(rel))) return { kind: 'tile', region: m[1], v: m[2] != null ? +m[2] : null, what: m[3], bad: !REGION_IDS.includes(m[1]) };
  if (/^tiles\//.test(rel)) return { kind: 'tile', bad: true };
  if ((m = /^icons\/equip\/(hat|top|bottom|shoes|accessory|weapon)_([A-Za-z0-9]+)\.png$/.exec(rel))) return { kind: 'icon', group: 'equip', slot: m[1], style: m[2] };
  if ((m = /^icons\/(item|skill)\/([A-Za-z0-9_]+)\.png$/.exec(rel))) return { kind: 'icon', group: m[1], id: m[2] };
  if (/^icons\//.test(rel)) return { kind: 'icon', bad: true };
  if ((m = /^vehicles\/([a-z]+)_wheel\.png$/.exec(rel))) return { kind: 'wheel', vehicle: m[1] };
  if ((m = /^vehicles\/([a-z]+)\.png$/.exec(rel))) return { kind: 'vehicle', vehicle: m[1] };
  if (/^vehicles\//.test(rel)) return { kind: 'vehicle', bad: true };
  if ((m = /^ui\/(title_art|logo|world_map)\.png$/.exec(rel))) return { kind: 'ui', id: m[1] };
  if (/^ui\//.test(rel)) return { kind: 'ui', bad: true };
  return null;
}
export const ENV_KINDS = new Set(['bg', 'tile', 'icon', 'vehicle', 'wheel', 'ui']);
export const ENV_PREFIX = /^(bg|tiles|icons|vehicles|ui)\//;
/** manifest の節とキー（--install 用）: bg/beach_town_far.png → ['bg', 'beach_town_far']、icons/equip/hat_cap.png → ['icons', 'equip/hat_cap'] */
export function envManifestKey(rel) {
  const m = /^(bg|tiles|icons|vehicles|ui)\/(.+)\.png$/.exec(rel);
  return m ? [m[1], m[2]] : null;
}
export function sizeOf(info) {
  if (info.kind === 'bg') return SIZE.bg;
  if (info.kind === 'tile') return SIZE[info.what] || SIZE.ground;
  if (info.kind === 'icon') return SIZE.icon;
  if (info.kind === 'vehicle') return SIZE.vehicle;
  if (info.kind === 'wheel') return SIZE.wheel;
  if (info.kind === 'ui') return SIZE[info.id] || null;
  return null;
}

/** CODEX_BATCH_03.csv → { 'bg/beach_town_far.png': { colors: [主, 差し] | null, size: [w, h] }, ... } */
export function parseCatalog03(csv) {
  const cat = {};
  const rows = [];
  // CSV（"..." で囲み、"" はエスケープ）を読む
  let row = [], cell = '', q = false;
  const s = csv.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  for (const r of rows.slice(1)) {
    const file = r[1], size = r[2], prompt = r[4] || '';
    if (!file || !/\.png$/.test(file)) continue;
    const m = /主色\s*(#[0-9a-fA-F]{6})[^#]*差し色\s*(#[0-9a-fA-F]{6})/.exec(prompt);
    const sz = /(\d+)×(\d+)/.exec(size || '');
    cat[file] = { colors: m ? [m[1].toLowerCase(), m[2].toLowerCase()] : null, parts: null, size: sz ? [+sz[1], +sz[2]] : null, batch: 3 };
  }
  return cat;
}

// ---------------------------------------------------------------- 画像の小道具
const A = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
function rowCov(im, y, thr = 128) { let n = 0; for (let x = 0; x < im.w; x++) if (A(im, x, y) >= thr) n++; return n / im.w; }
function rowsCov(im, y0, y1, thr = 128) { let s = 0, k = 0; for (let y = Math.max(0, y0); y < Math.min(im.h, y1); y++, k++) s += rowCov(im, y, thr); return k ? s / k : 0; }
function opaqueRatio(im, thr = 32) { let n = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i] >= thr) n++; return n / (im.w * im.h); }
function bbox(im, thr = 64) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** 2つの列の差（アルファを掛けた色 + アルファ、0〜255 の平均）。どちらかに絵がある行だけで平均 */
function colDiff(im, xa, xb) {
  const d = im.data;
  let s = 0, n = 0;
  for (let y = 0; y < im.h; y++) {
    const i = (y * im.w + xa) * 4, j = (y * im.w + xb) * 4;
    if (d[i + 3] < 8 && d[j + 3] < 8) continue;
    const a = d[i + 3] / 255, b = d[j + 3] / 255;
    s += (Math.abs(d[i] * a - d[j] * b) + Math.abs(d[i + 1] * a - d[j + 1] * b) + Math.abs(d[i + 2] * a - d[j + 2] * b) + Math.abs(d[i + 3] - d[j + 3])) / 4;
    n++;
  }
  return n ? s / n : 0;
}
/**
 * 左右の継ぎ目: seam = 右端の列と左端の列の差（つながっていれば、絵の中の隣り合う列の差と同じくらい）
 *   natural = 絵の中の隣り合う列の差の 98% 点（輪郭線・建物の切れ目など、ふつうにある大きな変化）
 *   random  = 半分離れた列どうしの差の平均（まったくつながっていない時の差）
 *   score   = (seam − natural) / (random − natural)（0 = 自然、1 以上 = 無関係な絵が並んだのと同じ）
 */
export function seamMetric(im) {
  const seam = colDiff(im, im.w - 1, 0);   // 右端の次の列は左端
  const ds = [];
  for (let x = 0; x < im.w - 1; x++) ds.push(colDiff(im, x, x + 1));
  ds.sort((a, b) => a - b);
  const natural = ds[Math.floor(ds.length * 0.98)] || 0;
  const base = ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length);
  let rs = 0, k = 0;
  for (let i = 0; i < 64; i++) { const x = Math.floor((i * im.w) / 64) % im.w; rs += colDiff(im, x, (x + (im.w >> 1)) % im.w); k++; }
  const random = rs / k;
  const score = seam <= natural ? 0 : (seam - natural) / Math.max(1, random - natural);
  return { seam: +seam.toFixed(1), base: +base.toFixed(1), natural: +natural.toFixed(1), random: +random.toFixed(1), score: +score.toFixed(2) };
}
function checkSeam(r, im) {
  const T = ENV_TH, m = seamMetric(im);
  r.metrics.seam = m;
  if (m.seam <= Math.max(T.seamOkMin, m.natural * 1.2)) return;
  const msg = `（左端と右端の列の差 ${m.seam}。絵の中の隣の列の差は平均 ${m.base}・98% 点 ${m.natural}、無関係な列どうしは ${m.random}）`;
  if (m.score >= T.seamNg) r.add('NG', '左右の端がつながっていない' + msg, '横に並べた時に継ぎ目が出ないよう、左端と右端の絵（色・形・高さ）をつなげてください（右端の続きが左端になるように）');
  else if (m.score >= T.seamWarn) r.add('注意', '左右の端のつながりが少し悪い' + msg, '並べたプレビュー（オーバーレイの真ん中が継ぎ目）で段差が目立たないか確認してください');
}
function checkBorder(r, im, what = '背景') {
  if (!im.hasAlpha) { r.add('NG', '透明の情報（アルファ）が無い RGB の画像', `${what}を透明にした RGBA の PNG で保存してください`); return false; }
  const c = 12, b = 4;
  let co = 0, bn = 0, bt = 0;
  for (const [x0, y0] of [[0, 0], [im.w - c, 0], [0, im.h - c], [im.w - c, im.h - c]]) for (let y = y0; y < y0 + c; y++) for (let x = x0; x < x0 + c; x++) if (A(im, x, y) > 8) co++;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { if (x >= b && y >= b && x < im.w - b && y < im.h - b) continue; bn++; if (A(im, x, y) <= 8) bt++; }
  const ratio = bt / bn;
  r.metrics.cornerOpaquePx = co; r.metrics.borderTransparent = +(ratio * 100).toFixed(2);
  if (co > 0 || ratio < 0.95) r.add('NG', `${what}が透明ではない（四隅の不透明 ${co}px、外周の透明率 ${(ratio * 100).toFixed(1)}%）`, `${what}を完全な透明にしてください（枠・影・地面を描かない）`);
  else if (ratio < 0.995) r.add('注意', `外周に絵が少しかかっている（外周の透明率 ${(ratio * 100).toFixed(1)}%）`, '画像の端から離して描いてください');
  return true;
}

// ---------------------------------------------------------------- 検査の本体
/**
 * r: check_art の mkRes（add(level, msg, fix) / metrics）。H: { compareColor, colorStats }（色の比べ方を check_art と共通に）
 * 大きさが違えば NG だけ付けて false（他の検査はしない）
 */
export function checkEnv(r, im, info, cat, H) {
  const T = ENV_TH;
  r.metrics.size = `${im.w}×${im.h}`;
  r.metrics.opaqueRatio = +(opaqueRatio(im) * 100).toFixed(2);
  if (info.bad) { r.add('NG', 'ファイルの場所・名前の形がゲームの決まりに合わない（bg/<地域>_<town|field>_<far|mid|lights>.png・tiles/<地域>_<ground|platform>.png・icons/<equip|item|skill>/…・vehicles/<種類>[_wheel].png・ui/<title_art|logo|world_map>.png）', '依頼書（CODEX_BATCH_03.md）の保存先のとおりにしてください'); return false; }
  const want = sizeOf(info);
  if (want && (im.w !== want[0] || im.h !== want[1])) { r.add('NG', `大きさが ${im.w}×${im.h}（${want[0]}×${want[1]} が正しい）`, `${want[0]}×${want[1]} で描き直してください（縮小・切り抜き・余白の追加はしない）`); return false; }
  if (info.kind === 'bg') {
    if (!im.hasAlpha) { r.add('NG', '透明の情報（アルファ）が無い RGB の画像（空が塗られている）', '空を透明にした RGBA の PNG で保存してください'); return false; }
    const sky = rowsCov(im, 0, T.skyRows, 32);
    r.metrics.skyOpaque = +(sky * 100).toFixed(1);
    if (info.layer !== 'lights') {
      if (sky > T.skyNg) r.add('NG', `空が透明ではない（上 ${T.skyRows} 行の ${(sky * 100).toFixed(0)}% が不透明）`, '空は描かず透明にしてください（空はゲームが時間で塗ります）');
      else if (sky > T.skyWarn) r.add('注意', `上の方（空の部分）に絵が多い（上 ${T.skyRows} 行の ${(sky * 100).toFixed(0)}% が不透明）`, '空は透明にしてください。高い建物の先だけなら問題なし');
    }
    if (info.layer === 'far') {
      const below = rowsCov(im, 648, 720, 32);
      r.metrics.belowGroundOpaque = +(below * 100).toFixed(1);
      if (below > T.belowWarn) r.add('注意', `地面の線より下（y=648〜720）に絵がある（${(below * 100).toFixed(0)}%）`, '遠景の y=640 より下は透明にしてください（中景と地面の後ろに隠れる所です）');
    }
    if (info.layer === 'mid') {
      const foot = rowsCov(im, T.footRows[0], T.footRows[1], 128);
      const mx = Math.max(foot, 1e-6);
      let footY = null;
      for (let y = T.footRows[0]; y < im.h; y++) if (rowCov(im, y, 128) < 0.5 * mx) { footY = y; break; }
      r.metrics.footCoverage = +(foot * 100).toFixed(1);
      r.metrics.footY = footY;
      if (foot < T.footWarn) r.add('注意', `建物の足元が地面の線 y=640 に届いていない（y=620〜639 の不透明 ${(foot * 100).toFixed(0)}%）`, '中景の建物・木は足元を y=640 の線にそろえてください（浮いて見えます）');
      else if (footY != null && footY < 632) r.add('注意', `建物の足元が y=${footY} あたりで切れている（y=640 より上）`, '足元を y=640 までのばしてください');
      else if (footY == null || footY > 700) r.add('メモ', `y=640 より下の手前の縁が厚い（不透明が y=${footY ?? im.h} まで続く）`, '地面の手前の縁は少しだけにしてください（地面のタイルの上に重なります）');
    }
    if (info.layer === 'lights') {
      const op = opaqueRatio(im, 32);
      let ls = 0, n = 0;
      for (let i = 0; i < im.data.length; i += 16) if (im.data[i + 3] >= 64) { ls += (Math.max(im.data[i], im.data[i + 1], im.data[i + 2]) + Math.min(im.data[i], im.data[i + 1], im.data[i + 2])) / 510; n++; }
      const light = n ? ls / n : 0;
      r.metrics.lightsLightness = +(light * 100).toFixed(0);
      if (op > T.lightsOpaqueWarn) r.add('注意', `あかりの絵の ${(op * 100).toFixed(0)}% が不透明（建物まで描いている?）`, '夜に光る部分（窓・ネオン・街灯）だけを描いて、ほかは透明にしてください');
      if (n && light < T.lightsDarkWarn) r.add('注意', `あかりの色が暗い（明るさ ${(light * 100).toFixed(0)}%）`, '加算で重ねるので、明るい色で描いてください（暗い色はほとんど見えません）');
      if (!n) r.add('NG', 'あかりの絵がありません（全部透明）');
    }
    checkSeam(r, im);
    return true;
  }
  if (info.kind === 'tile') {
    if (!im.hasAlpha) { r.add('NG', '透明の情報（アルファ）が無い RGB の画像', '上の方（歩く面より上）と背景を透明にした RGBA の PNG で保存してください'); return false; }
    const want0 = info.what === 'ground' ? 40 : 16;
    let surf = null;
    for (let y = 0; y < im.h; y++) if (rowCov(im, y, 128) >= T.surfaceCov) { surf = y; break; }
    r.metrics.surfaceY = surf; r.metrics.surfaceWant = want0;
    const d = surf == null ? Infinity : Math.abs(surf - want0);
    if (d > T.surfaceWarn) r.add('NG', surf == null ? '横いっぱいに埋まった行がない（歩く面が無い）' : `${info.what === 'ground' ? '歩く' : '乗る'}面の線が y=${surf}（上から ${want0}px が正しい）`, `上端から ${want0}px の線より下を横いっぱいに埋めてください（それより上は草・縁石の出っ張りだけ）`);
    else if (d > T.surfaceOk) r.add('注意', `${info.what === 'ground' ? '歩く' : '乗る'}面の線が y=${surf}（上から ${want0}px が正しい。差 ${d}px）`, `面の線を上から ${want0}px にそろえてください（キャラが浮く・沈む）`);
    const above = rowsCov(im, 0, Math.max(1, want0 - 6), 128);
    r.metrics.aboveOpaque = +(above * 100).toFixed(1);
    if (above > 0.6) r.add('注意', `面の線より上が埋まりすぎ（${(above * 100).toFixed(0)}%）`, '線より上は草・砂・縁石の出っ張りだけにして、あとは透明にしてください');
    if (info.what === 'ground') {
      const solid = rowsCov(im, want0 + 20, im.h, 128);
      r.metrics.solidBelow = +(solid * 100).toFixed(1);
      if (solid < T.solidWarn) r.add('注意', `地面の断面に透明な所がある（線より下の不透明 ${(solid * 100).toFixed(0)}%）`, '線より下（断面）は全部塗ってください（下の方は下端の色で塗りのばします）');
    }
    checkSeam(r, im);
    return true;
  }
  if (info.kind === 'icon') {
    if (info.group === 'skill') {
      const op = opaqueRatio(im, 200);
      r.metrics.fill = +(op * 100).toFixed(1);
      if (op < T.skillFillNg) r.add('NG', `正方形いっぱいの絵ではない（不透明 ${(op * 100).toFixed(0)}%）`, 'スキルのアイコンは背景も込みで正方形いっぱいに描いてください（枠はゲームが付けます）');
      else {
        let corner = 0;
        for (const [x0, y0] of [[0, 0], [im.w - 6, 0], [0, im.h - 6], [im.w - 6, im.h - 6]]) for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) if (A(im, x, y) < 200) corner++;
        r.metrics.cornerTransparentPx = corner;
        if (op < T.skillFillOk || corner > 8) r.add('注意', `角や端が透明（不透明 ${(op * 100).toFixed(0)}%・四隅の透明 ${corner}px。角を丸めた?）`, '角は丸めず正方形いっぱいに描いてください（ゲームが角丸の枠で切ります）');
      }
      return true;
    }
    checkBorder(r, im, '背景');
    const bb = bbox(im);
    if (bb) {
      r.metrics.bbox = bb;
      if (Math.max(bb.w, bb.h) < im.w * T.iconSmall) r.add('注意', `物が小さい（絵の範囲 ${bb.w}×${bb.h}px）`, '物を画面の8割くらいの大きさで中央に描いてください');
    } else r.add('NG', '絵がありません（全部透明）');
    if (info.group === 'equip' && H && H.colorStats) {
      const c = cat && cat.colors;
      if (c) {
        const cs = H.colorStats(im);
        r.metrics.color = { main: H.compareColor(r, cs, '主な色', c[0]) };
        if (c[1]) r.metrics.color.accent = H.compareColor(r, cs, '差し色', c[1], false);
      } else r.add('注意', '基準色が分からない（依頼書 CODEX_BATCH_03 に無いスタイル）ので色は比べていません。ゲームはそのスタイルの最初のアイテムの色を基準色にします');
    }
    return true;
  }
  if (info.kind === 'vehicle') {
    checkBorder(r, im, '背景');
    const mk = findMarkers(im.data, im.w, im.h);
    r.metrics.markers = mk.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), px: m.n }));
    if (mk.length < 2) { r.add('NG', mk.length ? 'マゼンタ #FF00FF の印が1つしかない（前後のタイヤの中心に1つずつ）' : 'マゼンタ #FF00FF の印が無い', '前後のタイヤの中心に、マゼンタ #FF00FF（純色）の小さな丸を1つずつ描いてください。ゲームはそこにタイヤを付けて回します'); return true; }
    if (mk.length > 2) r.add('注意', `マゼンタの印が ${mk.length} か所に分かれている`, '印は前後に1つずつにしてください');
    const a = mk[0], b = mk[mk.length - 1];
    if (a.y < im.h * 0.5 || b.y < im.h * 0.5) r.add('注意', `タイヤの印が上の方にある（y=${Math.round(a.y)}, ${Math.round(b.y)}）`, 'タイヤの中心（車体の下の方）に印を描いてください');
    if (Math.abs(a.y - b.y) > im.h * T.markerDyWarn) r.add('注意', `前後の印の高さが違う（${Math.round(a.y)} と ${Math.round(b.y)}）`, '真横から見た絵なので、前後のタイヤの中心は同じ高さにしてください');
    if (b.x - a.x < im.w * T.markerDxWarn) r.add('注意', `前後の印が近すぎる（${Math.round(b.x - a.x)}px）`, '前後のタイヤの中心に1つずつ描いてください');
    // タイヤの所が空いているか（印の周り 半径 = 印の間の 13%）
    const R = (b.x - a.x) * 0.13;
    const holes = [a, b].map((m) => {
      let n = 0, o = 0;
      for (let y = Math.max(0, Math.round(m.y - R)); y < Math.min(im.h, m.y + R); y++) for (let x = Math.max(0, Math.round(m.x - R)); x < Math.min(im.w, m.x + R); x++) {
        if ((x - m.x) ** 2 + (y - m.y) ** 2 > R * R) continue;
        const i = (y * im.w + x) * 4, d = im.data;
        if (d[i] > 190 && d[i + 2] > 190 && d[i + 1] < 90) continue;
        n++; if (d[i + 3] >= 128) o++;
      }
      return n ? o / n : 0;
    });
    r.metrics.wheelAreaOpaque = holes.map((h) => +(h * 100).toFixed(0));
    if (holes.some((h) => h > T.holeWarn)) r.add('注意', `タイヤの所が埋まっている（印の周りの不透明 ${r.metrics.wheelAreaOpaque.join('%・')}%）`, 'タイヤは描かず、タイヤの所は空けてください（ゲームが別の絵のタイヤを回して重ねます）');
    return true;
  }
  if (info.kind === 'wheel') {
    checkBorder(r, im, '背景');
    const bb = bbox(im);
    if (!bb) { r.add('NG', '絵がありません（全部透明）'); return true; }
    const cx = (bb.x0 + bb.x1 + 1) / 2, cy = (bb.y0 + bb.y1 + 1) / 2;
    r.metrics.wheel = { cx, cy, w: bb.w, h: bb.h };
    if (Math.hypot(cx - im.w / 2, cy - im.h / 2) > T.wheelCenter) r.add('注意', `タイヤが中央にない（中心 ${cx.toFixed(0)},${cy.toFixed(0)}）`, 'タイヤの中心を画像の中央 (128,128) に置いてください（ずれると回した時にぶれます。ゲームは絵の範囲の中心で回します）');
    if (Math.abs(bb.w / bb.h - 1) > T.wheelRound) r.add('注意', `タイヤが円くない（${bb.w}×${bb.h}px）`, '真横から見た円いタイヤにしてください');
    if (Math.max(bb.w, bb.h) < im.w * T.wheelSmall) r.add('注意', `タイヤが小さい（${bb.w}×${bb.h}px）`, '画像いっぱい近くまで大きく描いてください');
    return true;
  }
  if (info.kind === 'ui') {
    if (info.id === 'logo') checkBorder(r, im, '背景');
    else if (im.hasAlpha && opaqueRatio(im, 200) < 0.95) r.add('注意', `透明な所がある（不透明 ${(opaqueRatio(im, 200) * 100).toFixed(0)}%）`, '画面いっぱいの絵なので、透明な所が無いように描いてください');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- オーバーレイ（確認用の絵）
/**
 * 背景・タイル: 右端の続きに左端を並べた絵（真ん中が継ぎ目）＋地面の線。アイコン・乗り物: 市松＋絵（乗り物は印に十字）。
 * D: check_art の小道具 { newImage, checker, drawOver, hline, vline, cross, C }
 */
export function envOverlay(im, info, D) {
  if (info.kind === 'bg' || info.kind === 'tile') {
    const half = Math.min(im.w, info.kind === 'bg' ? 640 : 256);
    const W = half * 2, Hh = im.h;
    const ov = D.checker(W, Hh);
    if (info.kind === 'bg' && info.layer === 'lights') for (let i = 0; i < ov.data.length; i += 4) { ov.data[i] = 20; ov.data[i + 1] = 16; ov.data[i + 2] = 40; }
    const part = { w: W, h: Hh, data: new Uint8Array(W * Hh * 4) };
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const sx = x < half ? im.w - half + x : x - half;
      const s = (y * im.w + sx) * 4, d = (y * W + x) * 4;
      part.data[d] = im.data[s]; part.data[d + 1] = im.data[s + 1]; part.data[d + 2] = im.data[s + 2]; part.data[d + 3] = im.data[s + 3];
    }
    D.drawOver(ov, part);
    const line = info.kind === 'bg' ? 640 : info.what === 'ground' ? 40 : 16;
    if (info.kind === 'tile' || info.layer !== 'far') D.hline(ov, 0, W - 1, line, D.C.guide, 0.9, 2, 8);
    D.vline(ov, half, 0, 24, D.C.out, 1, 2); D.vline(ov, half, Hh - 25, Hh - 1, D.C.out, 1, 2);
    return ov;
  }
  if (info.kind === 'icon' || info.kind === 'vehicle' || info.kind === 'wheel' || (info.kind === 'ui' && info.id === 'logo')) {
    const ov = D.checker(im.w, im.h);
    D.drawOver(ov, im);
    if (info.kind === 'vehicle') for (const m of findMarkers(im.data, im.w, im.h)) D.cross(ov, Math.round(m.x), Math.round(m.y), 24, D.C.grip, 3);
    if (info.kind === 'wheel') { D.cross(ov, im.w >> 1, im.h >> 1, 12, D.C.pivot, 2); }
    return ov;
  }
  return null;
}
