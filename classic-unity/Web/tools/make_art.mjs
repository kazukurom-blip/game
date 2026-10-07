// 試遊版のドット絵（PNG）を作る。絵はすべてこのプロジェクトのオリジナル（コードで 1 ドットずつ形を作り、3 段の塗りと 1px の線で塗る）。
//   node classic-unity/Web/tools/make_art.mjs
// 出力（git に入れる。make_dist.mjs が wwwroot/ ごと dist/ にコピーする）:
//   wwwroot/art/mobs/<ID>.png … 敵 1 体のコマを横に並べた 1 枚（右向き。左は描く時に反転）
//   wwwroot/art/mobs.json     … コマの大きさ・基準点（足元の中央）・動きごとのコマと時間（js/art.js が読む）
//   wwwroot/art/ui/*.png      … 窓の枠（9 分割）・ボタン・スロット
//   shots/art_mobs_sheet.png  … 全部のコマを 4 倍で並べた見本（確認用）
// 敵の大きさは Data/monsters.json の width・height（MONSTERS.md の値）に合わせる。
// 動き: stand（立ち 3）・move（動く 4）・hit1（やられ 1）・die1（倒れる 3）・air（跳ねている間 1。跳ねる敵だけ使う）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelBuf, Mask, paintMask, pxLine } from '../wwwroot/js/pixel.js';
import { encodePng, scaleRgba } from './png.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(WEB, 'wwwroot', 'art');
const MONS = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'Data', 'monsters.json'), 'utf8')).monsters;
const mon = (id) => MONS.find((m) => m.id === id);

const P = (light, mid, dark, line) => ({ light, mid, dark, line });
const EYE = { k: '#1e1428', w: '#ffffff', r: '#ff8a9a' };

// 目（右向きの顔。前の目と奥の目）。kind: normal / hit（ぎゅっ）/ dead（×）/ blink
const EYES = {
  s: { normal: ['wk', 'kk', 'kk'], blink: ['..', '..', 'kk'], hit: ['k.', '.k', 'k.'], dead: ['k.k', '.k.', 'k.k'] },
  m: { normal: ['.k.', 'wkk', 'wkk', 'kkk', '.k.'], blink: ['...', '...', '...', 'kkk', '...'], hit: ['k..', '.k.', '..k', '.k.', 'k..'], dead: ['k.k', '.k.', 'k.k'] },
  l: { normal: ['.kk.', 'wwkk', 'wkkk', 'kkkk', 'kkkk', '.kk.'], blink: ['....', '....', '....', 'kkkk', '.kk.'], hit: ['kk..', '.kk.', '..kk', '.kk.', 'kk..'], dead: ['k..k', '.kk.', '.kk.', 'k..k'] },
};
function eyes(b, size, kind, x1, x2, y) {
  const set = EYES[size]; const rows = set[kind] || set.normal;
  const pal = { k: EYE.k, w: EYE.w };
  b.sprite(rows, x1, y, pal);
  if (x2 != null) b.sprite(kind === 'hit' ? rows.map((r) => [...r].reverse().join('')) : rows, x2, y, pal);
}
const blush = (b, x, y, n = 2) => { for (let i = 0; i < n; i++) b.px(x + i, y, EYE.r); };

// ---------------------------------------------------------------- コロ貝（巻き貝。塔のように段の重なった殻・さんご色の体・頭に目）
// 殻は「段の重なった塔の形の巻き貝」（平たい渦巻きにしない）。体は海の生き物らしいさんご色、短い 2 本の触角の先に丸
function snail(b, pal, s, p) {
  const st = p.stretch || 0, hb = p.hb || 0, tilt = p.tilt || 0, hide = p.hide || 0, sw = p.sway || 0;
  const S = (v) => v * s;
  const hx = S(10) + st - hide * S(8), hy = S(-6) + hb + hide * S(2);
  // 触角
  if (hide < 0.5) {
    for (const [ax, tx, ty] of [[-1, -3 + sw, -11], [2, 3 + sw, -10]]) {
      const m = new Mask().line({ x: hx + S(ax), y: hy - S(3) }, { x: hx + S(tx * 0.85), y: hy + S(ty * 0.85) }, Math.max(0.6, S(0.6)));
      m.ellipse(hx + S(tx * 0.85), hy + S(ty * 0.85), S(1.3), S(1.3));
      paintMask(b, m, pal.body, { rimL: 1, rimD: 0 });
    }
  }
  // 体（足と頭）
  const body = new Mask().ellipse(S(1) + st / 2 - hide * S(4), S(-3.5), S(11) + st / 2 - hide * S(5), S(3.5));
  if (hide < 0.8) body.ellipse(hx, hy, S(4.6), S(5));
  body.sub(new Mask().rect(-80, 0, 160, 40));
  paintMask(b, body, pal.body, { rimL: 1, rimD: 1 });
  // 殻: 下の段から上の段へ 4 段（上の段ほど小さい）。段ごとに塗るので段の間に線が入る
  const whorls = [[-6.5, -22.2, 2.2, 1.8], [-6, -19.2, 4.4, 3.2], [-5, -14.8, 7, 4.6], [-4, -8.8, 9.6, 6.6]];
  const ox = (p.roll || 0);
  whorls.forEach(([x, y, rx, ry], i) => {
    const m = new Mask().ellipse(S(x) + ox * (4 - i), S(y) + tilt, S(rx), S(ry));
    if (i === 3) m.sub(new Mask().rect(-80, 0, 160, 40));
    paintMask(b, m, pal.shell, { rimL: s > 1 ? 2 : 1, rimD: s > 1 ? 3 : 2 });
    // 段の帯（模様）: 段の真ん中より少し下に 1 列（大きい殻は 2 列）
    const by = Math.round(S(y) + tilt + S(ry) * (i === 3 ? 0.35 : -0.25));
    if (i === 0) return;
    for (const [px, py] of m.each()) if (py === by || (s > 1 && py === by + 1)) { if (m.has(px - 1, py) && m.has(px + 1, py)) b.px(px, py, (px + py) % 3 ? pal.band : pal.band2); }
  });
  // 殻の光
  b.px(S(-7) + ox * 4, S(-23) + tilt, '#ffffff'); if (s > 1) { b.px(S(-7) + 1 + ox * 4, S(-23) + tilt, '#ffffff'); b.px(S(-10), S(-14) + tilt, '#ffffff'); b.px(S(-10) + 1, S(-14) + tilt, '#ffffff'); b.px(S(-10), S(-14) + 1 + tilt, '#ffffff'); }
  // 大きい殻の飾り（フジツボと、くっついた小さなヒトデ）
  if (p.deco) {
    for (const [x, y] of [[-20, -24], [-13, -30], [-22, -14]]) {
      paintMask(b, new Mask().ellipse(x, y + tilt, 2.2, 2), P('#ffffff', '#d8dce4', '#a0a8b8', '#4a5060'), { rimL: 1, rimD: 1 });
      b.px(x, y + tilt, '#4a5060');
    }
    b.sprite(['...o...', '..oso..', 'oosssoo', 'osssyso', '.ossso.', '.os.so.', 'oo...oo'], S(-3), S(-12) + tilt, { s: '#ff8c5a', o: '#a83c1c', y: '#ffe0a0' });
  }
  // 顔
  if (hide < 0.5) {
    const sz = s > 1 ? 'l' : 's';
    const ex = Math.round(hx + S(0.5)), ey = Math.round(hy - S(2));
    eyes(b, sz, p.face || 'normal', ex - (s > 1 ? 7 : 3), ex + (s > 1 ? 1 : 0), ey);
    if (p.face !== 'dead') blush(b, ex + (s > 1 ? 4 : 2), ey + (s > 1 ? 7 : 4), s > 1 ? 3 : 2);
    if (p.face === 'hit') b.px(ex + 1, ey + (s > 1 ? 8 : 5), pal.body.line);
  }
  if (p.stars) stars(b, S(-4), S(-26), p.stars);
}
function stars(b, x, y, t) {
  const pts = [[-6, 0], [0, -3], [6, 0]];
  pts.forEach(([dx, dy], i) => { if ((i + t) % 2) b.sprite(['.y.', 'yyy', '.y.'], x + dx - 1, y + dy - 1, { y: '#ffe860' }); else b.px(x + dx, y + dy, '#ffe860'); });
}

// ---------------------------------------------------------------- ホコリダケ（ほこりの玉のようなキノコ。てっぺんの口から胞子のけむりを出す）
function puffball(b, pal, p) {
  const sx = p.sx || 1, sy = p.sy || 1, lift = p.lift || 0;
  const by = -lift;
  // 足（短い 2 本）
  if (!p.flat) for (const fx of [-5, 4]) paintMask(b, new Mask().ellipse(fx * sx, by - 1.5, 3, 2), pal.foot, { rimL: 1, rimD: 1 });
  // 体（下がふくらんだ玉）
  const h = 26 * sy, w = 14 * sx;
  const cy = by - 3 - h / 2;
  const m = new Mask().ellipse(0, cy + h * 0.08, w, h / 2).ellipse(0, by - 3 - h * 0.25, w + 1.5 * sx, h * 0.28);
  m.sub(new Mask().rect(-60, by - 1, 120, 40));
  paintMask(b, m, pal.body, { rimL: 2, rimD: 3 });
  // いぼ（明るい点）とすじ
  for (const [x, y] of [[-8, -0.32], [-3, -0.42], [5, -0.36], [-10, -0.1], [9, -0.12], [-5, 0.1]]) {
    const X = Math.round(x * sx), Y = Math.round(cy + y * h);
    if (m.has(X, Y)) { b.px(X, Y, pal.body.light); if (m.has(X + 1, Y + 1)) b.px(X + 1, Y + 1, pal.body.dark); }
  }
  // てっぺんの口（星の形の割れ目）
  const tx = 1, ty = Math.round(cy - h * 0.42 + 1);
  b.sprite(['.k.', 'kkk', '.k.'], tx - 1, ty, { k: pal.body.line });
  // 胞子のけむり
  if (p.puff) puffs(b, tx, ty - 3, p.puff);
  // 顔
  const ex = Math.round(3 * sx), ey = Math.round(cy + h * 0.06);
  eyes(b, 'm', p.face || 'normal', ex - 5, ex + 2, ey);
  if (p.face !== 'dead') blush(b, ex + 5, ey + 5, 2);
  const mo = p.face === 'hit' ? ['kk', 'kk'] : ['k.k', '.k.'];
  b.sprite(mo, ex, ey + 6, { k: pal.body.line });
}
function puffs(b, x, y, n) {
  const pal = P('#ffffff', '#ece6f4', '#c4bcd0', '#8a8098');
  const pts = [[-4, -2, 2.6], [3, -5, 2.2], [-1, -8, 1.8], [6, -10, 1.4], [-6, -11, 1.2]].slice(0, n);
  for (const [dx, dy, r] of pts) paintMask(b, new Mask().ellipse(x + dx, y + dy, r, r), pal, { rimL: 1, rimD: 1 });
}

// ---------------------------------------------------------------- ポヨスライム（ぷるぷるの丸い液体。てっぺんはとがらない丸い山・中に泡）
function slime(b, pal, p) {
  const sx = p.sx || 1, sy = p.sy || 1, lift = p.lift || 0;
  const by = -lift;
  const w = 15.5 * sx, h = 25 * sy;
  const m = new Mask().ellipse(0, by - h * 0.5, w, h * 0.55);
  m.add(new Mask().ellipse(0, by - 4, w + 1.5, 5));
  m.sub(new Mask().rect(-60, by, 120, 40));
  if (p.melt) { m.sub(new Mask().rect(-60, by - 40, 120, 40 - p.melt)); m.ellipse(0, by - 2, w + 4, 2.5); m.sub(new Mask().rect(-60, by, 120, 40)); }
  paintMask(b, m, pal.body, { rimL: 2, rimD: 3 });
  if (p.melt && p.melt < 8) return;
  // 中の泡と光（左上）
  const top = by - h * 1.02;
  const hx = Math.round(-w * 0.55), hy = Math.round(top + h * 0.3);
  if (m.has(hx, hy)) b.sprite(['.ww', 'ww.', 'w..'], hx, hy, { w: '#ffffff' });
  for (const [x, y, r] of [[w * 0.45, 0.58, 2], [-w * 0.15, 0.82, 1.3]]) {
    const X = Math.round(x), Y = Math.round(top + h * y);
    if (m.has(X, Y)) paintMask(b, new Mask().ellipse(X, Y, r, r), P('#ffffff', pal.body.light, pal.body.mid, pal.body.mid), { rimL: 1, rimD: 1 });
  }
  if (p.melt) { eyes(b, 's', 'dead', 0, null, by - p.melt + 2); return; }
  // 顔（目は離して大きく）
  const ex = Math.round(1 * sx), ey = Math.round(by - h * 0.5);
  eyes(b, 'm', p.face || 'normal', ex - 6, ex + 4, ey);
  if (p.face !== 'dead') { blush(b, ex - 9, ey + 5, 2); blush(b, ex + 8, ey + 5, 2); }
  const mo = p.face === 'hit' ? ['.kk.', 'k..k'] : p.face === 'dead' ? ['kkkk'] : ['k..k', '.kk.'];
  b.sprite(mo, ex - 1, ey + 5, { k: pal.body.line });
}

// ---------------------------------------------------------------- ダイダイダケ（みかんの房のような筋のあるだいだい色のかさ・てっぺんに葉・へたのある茎の顔）
function citrusCap(b, pal, p) {
  const sx = p.sx || 1, sy = p.sy || 1, lift = p.lift || 0;
  const by = -lift;
  // 足
  if (!p.flat) for (const fx of [-5, 4]) paintMask(b, new Mask().ellipse(fx * sx, by - 1.5, 3, 2), pal.foot, { rimL: 1, rimD: 1 });
  // 茎（たる形）
  const stemH = 15 * sy;
  const stem = new Mask().ellipse(0, by - 2 - stemH / 2, 9.5 * sx, stemH / 2 + 1);
  stem.sub(new Mask().rect(-60, by - 1, 120, 40));
  paintMask(b, stem, pal.stem, { rimL: 1, rimD: 2 });
  // かさ（高めの丸屋根。縦の房の筋）
  const capB = by - 2 - stemH + 1 * sy, capH = 14 * sy, capW = 17 * sx;
  const cap = new Mask().ellipse(0, capB, capW, capH);
  cap.sub(new Mask().rect(-60, capB + 2, 120, 60));
  paintMask(b, cap, pal.cap, { rimL: 2, rimD: 3 });
  for (const k of [-0.55, 0, 0.55]) { // 房の筋（弧）
    for (let y = Math.round(capB - capH + 3); y <= capB; y++) {
      const t = (capB - y) / capH; const x = Math.round(k * capW * Math.sqrt(Math.max(0, 1 - t * t)) * 0.95);
      if (cap.has(x, y) && cap.has(x + 1, y) && cap.has(x - 1, y)) b.px(x, y, pal.cap.dark);
    }
  }
  // かさのふち（クリーム色のひだ）
  for (let x = -Math.round(capW) + 1; x <= Math.round(capW) - 1; x++) if (cap.has(x, capB + 1)) b.px(x, capB + 1, x % 2 ? pal.stem.light : pal.stem.mid);
  // 光（左上の小さな光の点 2 つ。白い水玉の模様にはしない）
  b.sprite(['ww.', 'w..'], Math.round(-capW * 0.6), Math.round(capB - capH * 0.75), { w: pal.cap.light });
  // てっぺんの葉と軸
  const ty = Math.round(capB - capH);
  paintMask(b, new Mask().line({ x: 0, y: ty }, { x: 1, y: ty - 3 }, 0.8), P(null, '#7a5a20', '#5a3c10', '#2e1c04'), { rimL: 0 });
  const lw = p.leaf || 0;
  paintMask(b, new Mask().poly([[1, ty - 3], [6 + lw, ty - 7], [10 + lw, ty - 5], [6, ty - 2]]), P('#c4f08c', '#6cc040', '#3c8a24', '#1c4010'), { rimL: 1, rimD: 1 });
  // 顔（茎に。むっとした太いまゆ）
  const ex = Math.round(2 * sx), ey = Math.round(by - 2 - stemH * 0.6);
  eyes(b, 's', p.face || 'normal', ex - 4, ex + 2, ey);
  if (!p.face || p.face === 'normal' || p.face === 'blink') { pxLine(b, ex - 5, ey - 2, ex - 3, ey - 1, pal.stem.line); pxLine(b, ex + 4, ey - 2, ex + 2, ey - 1, pal.stem.line); }
  if (p.face !== 'dead') blush(b, ex + 4, ey + 4, 2);
  b.sprite(p.face === 'hit' ? ['kk', 'kk'] : ['kkk'], ex - 1, ey + 5, { k: pal.stem.line });
}

// ---------------------------------------------------------------- 色（敵ごと。色違いは同じ形で色だけ替える）
const SAND = P('#fff4d4', '#ecd096', '#c49a5c', '#6a4a20');
const CORAL = P('#ffd6c8', '#f4a090', '#d0705c', '#7a3424');
const SNAILS = {
  M001: { shell: SAND, band: '#b06a34', band2: '#8a4a1e', body: CORAL },
  M002: { shell: P('#f0fcff', '#bfe4ee', '#84b4c8', '#2c5468'), band: '#2c84b8', band2: '#1c5c8c', body: P('#e8f0ff', '#b8c8f0', '#8494c8', '#34406c') },
  M004: { shell: P('#fff6e8', '#f2d6b8', '#cc9c78', '#6a3a20'), band: '#d03c3c', band2: '#9a2424', body: P('#ffe0b8', '#f4b47c', '#cc8448', '#6a3a14') },
  M007: { shell: P('#fff8e4', '#ead2a0', '#c09a62', '#5a3c18'), band: '#7a5ab0', band2: '#54388a', body: P('#ffd6d0', '#f09a98', '#c86a6c', '#6a2a30') },
};
const PUFF = { body: P('#f8f0e0', '#dccaa8', '#ac9670', '#56462a'), foot: P('#f0e4cc', '#c8b48c', '#9a8458', '#4a3a20') };
const SLIME = { body: P('#eef2ff', '#a8beff', '#7086e4', '#2c3488') };
const CITRUS = { cap: P('#ffd890', '#ff9a2a', '#d0620c', '#6a2804'), stem: P('#fffaf0', '#f2e2c0', '#ccb084', '#6a4a24'), foot: P('#fff0d8', '#e0c8a0', '#b49a70', '#5a4224') };

// ---------------------------------------------------------------- 敵ごとのコマ
// 各コマ: [動き, 描く関数に渡す形]
function snailFrames(big) {
  const D = big ? { deco: true } : {};
  return [
    ['stand', { ...D, hb: 0 }], ['stand', { ...D, hb: 1, sway: 1 }], ['stand', { ...D, hb: 0, face: 'blink' }],
    ['move', { ...D, stretch: 0 }], ['move', { ...D, stretch: 2, sway: -1 }], ['move', { ...D, stretch: 3, hb: -1, sway: -1 }], ['move', { ...D, stretch: 1, sway: 1 }],
    ['hit1', { ...D, face: 'hit', tilt: -1, hb: 1, stretch: -2, roll: -0.5 }],
    ['die1', { ...D, face: 'dead', stretch: -2, tilt: -1 }], ['die1', { ...D, face: 'dead', hide: 0.6, stars: 1 }], ['die1', { ...D, face: 'dead', hide: 1, tilt: 1, stars: 2 }],
  ];
}
function bounceFrames(extra = {}) {
  return [
    ['stand', { ...extra, sx: 1, sy: 1 }], ['stand', { ...extra, sx: 1.04, sy: 0.96 }], ['stand', { ...extra, sx: 1.06, sy: 0.93, face: 'blink' }],
    ['move', { ...extra, sx: 1.12, sy: 0.84 }], ['move', { ...extra, sx: 0.9, sy: 1.1, lift: 2 }], ['move', { ...extra, sx: 0.95, sy: 1.05, lift: 4, leaf: 1 }], ['move', { ...extra, sx: 1.08, sy: 0.9 }],
    ['hit1', { ...extra, sx: 1.15, sy: 0.82, face: 'hit' }],
    ['die1', { ...extra, sx: 1.18, sy: 0.78, face: 'dead' }], ['die1', { ...extra, sx: 1.28, sy: 0.6, face: 'dead' }], ['die1', { ...extra, sx: 1.4, sy: 0.42, face: 'dead', flat: true }],
    ['air', { ...extra, sx: 0.88, sy: 1.12, leaf: 1 }],
  ];
}
const MOBS = {
  M001: { draw: (b, p) => snail(b, SNAILS.M001, 1, p), frames: snailFrames(false) },
  M002: { draw: (b, p) => snail(b, SNAILS.M002, 1, p), frames: snailFrames(false), swapOf: 'M001' },
  M004: { draw: (b, p) => snail(b, SNAILS.M004, 1, p), frames: snailFrames(false), swapOf: 'M001' },
  M007: { draw: (b, p) => snail(b, SNAILS.M007, 2, p), frames: snailFrames(true) },
  M003: { draw: (b, p) => puffball(b, PUFF, p), frames: bounceFrames().map(([a, p], i) => [a, { ...p, puff: a === 'hit1' ? 4 : a === 'die1' ? 5 : a === 'move' && i === 5 ? 2 : i === 1 ? 1 : 0 }]) },
  M005: { draw: (b, p) => slime(b, SLIME, p), frames: bounceFrames().map(([a, p], i) => [a, a === 'die1' ? { ...p, melt: [0, 12, 6][i - 8] || 0, sy: [0.78, 0.6, 0.4][i - 8] } : p]) },
  M006: { draw: (b, p) => citrusCap(b, CITRUS, p), frames: bounceFrames() },
};
const ANIM = { stand: { d: 0.5, loop: 'ping' }, move: { d: 0.14, loop: 'loop' }, hit1: { d: 0.3, loop: 'none' }, die1: { d: 0.25, loop: 'none' }, air: { d: 0, loop: 'none' } };

// ---------------------------------------------------------------- 書き出し
fs.mkdirSync(path.join(ART, 'mobs'), { recursive: true });
const meta = {};
const sheets = [];
for (const [id, def] of Object.entries(MOBS)) {
  const m = mon(id);
  const fw = m.width + 24, fh = m.height + 22, ox = Math.floor(fw / 2), oy = fh - 2;
  const n = def.frames.length;
  const sheet = new PixelBuf(fw * n, fh);
  const anims = {};
  def.frames.forEach(([anim, pose], i) => {
    const b = new PixelBuf(fw, fh).setOrigin(ox, oy);
    def.draw(b, pose);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const v = b.data[y * fw + x]; if (v) sheet.data[y * fw * n + i * fw + x] = v; }
    (anims[anim] ||= { f: [], d: ANIM[anim].d, loop: ANIM[anim].loop }).f.push(i);
  });
  const rgba = new Uint8Array(sheet.data.buffer.slice(0));
  // 色の数（敵は 24 色まで）と半透明が無いことの確かめ
  const cols = new Set(); for (let i = 0; i < rgba.length; i += 4) { if (rgba[i + 3] && rgba[i + 3] !== 255) throw new Error(id + ' 半透明'); if (rgba[i + 3]) cols.add(rgba.readUInt32?.(i) ?? (rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2])); }
  fs.writeFileSync(path.join(ART, 'mobs', id + '.png'), encodePng(fw * n, fh, rgba));
  meta[id] = { png: `art/mobs/${id}.png`, fw, fh, ox, oy, anims, name: m.name };
  sheets.push({ id, w: fw * n, h: fh, rgba });
  console.log(`${id} ${m.name.padEnd(8, '　')} ${m.width}×${m.height} → コマ ${fw}×${fh} × ${n}・${cols.size} 色${def.swapOf ? `（${def.swapOf} の色違い）` : ''}`);
}
fs.writeFileSync(path.join(ART, 'mobs.json'), JSON.stringify({ note: 'tools/make_art.mjs が書き出した。手で直さない。右向き・基準点は足元の中央 (ox, oy)', mobs: meta }, null, 1));

// ---------------------------------------------------------------- UI の部品（9 分割の枠・ボタン・スロット）
fs.mkdirSync(path.join(ART, 'ui'), { recursive: true });
function writeUi(name, w, h, fn) {
  const b = new PixelBuf(w, h);
  fn(b, w, h);
  fs.writeFileSync(path.join(ART, 'ui', name + '.png'), encodePng(w, h, new Uint8Array(b.data.buffer.slice(0))));
}
// 角の丸い枠: 外の線・明るい縁・本体・内側の影。round = 角を落とすドット数
function frame(b, w, h, c, round = 2) {
  const inCorner = (x, y, r) => { const cx = x < r ? r - x : x > w - 1 - r ? x - (w - 1 - r) : 0; const cy = y < r ? r - y : y > h - 1 - r ? y - (h - 1 - r) : 0; return cx + cy > r; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inCorner(x, y, round)) continue;
    const edge = inCorner(x - 1, y, round) || inCorner(x + 1, y, round) || inCorner(x, y - 1, round) || inCorner(x, y + 1, round) || x === 0 || y === 0 || x === w - 1 || y === h - 1;
    let col = c.fill;
    if (edge) col = c.line;
    else if (x === 1 || y === 1 || (x === 2 && y < h - 2) || (y === 2 && x < w - 2)) col = c.hi;
    else if (x === w - 2 || y === h - 2) col = c.lo;
    else if (c.fill2 && y > h / 2) col = c.fill2;
    b.px(x, y, col);
  }
}
// 窓の枠（24×24、9 分割の角は 8）: 明るい金色がかった枠＋内側の細い線
writeUi('win', 24, 24, (b, w, h) => {
  frame(b, w, h, { line: '#2a2440', hi: '#fff6d8', lo: '#a08850', fill: '#e8d8a8' }, 3);
  for (let x = 4; x < w - 4; x++) { b.px(x, 4, '#8a7444'); b.px(x, h - 5, '#fff4d0'); }
  for (let y = 4; y < h - 4; y++) { b.px(4, y, '#8a7444'); b.px(w - 5, y, '#fff4d0'); }
  for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) b.px(x, y, '#2e3456');
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) b.px(x, y, '#ffffff'); // 角のびょう
});
// ボタン（ふつう・押せる所にのせた時）
const btn = (hi, fill, fill2, lo) => (b, w, h) => frame(b, w, h, { line: '#1c2040', hi, lo, fill, fill2 }, 2);
writeUi('btn', 16, 16, btn('#bfe4ff', '#6aa4f0', '#4a7cd0', '#2c4c98'));
writeUi('btn_hover', 16, 16, btn('#e4f6ff', '#8cc0ff', '#6a9cf0', '#3a5cb0'));
writeUi('btn_gold', 16, 16, btn('#fff6c0', '#ffc840', '#f0a020', '#a06010'));
// スロット（クイックスロット・持ち物のます）: へこんだ枠
writeUi('slot', 12, 12, (b, w, h) => frame(b, w, h, { line: '#141830', hi: '#20264a', lo: '#6a78b8', fill: '#30386a' }, 1));
// 下の帯の地（縦 64・横に繰り返す）: 上に明るい線、下に向かって暗く
writeUi('bar', 4, 64, (b, w, h) => {
  const cs = ['#1a1e3a', '#9aa8e8', '#e8ecff', '#6a78c0'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = y < 4 ? cs[y] : y < 34 ? '#3c4890' : y < 50 ? '#323c7c' : '#2a3268';
    if (y === h - 1) c = '#141830';
    b.px(x, y, c);
  }
});

// ---------------------------------------------------------------- 見本（4 倍）
const K = 4, pad = 6;
const W = Math.max(...sheets.map((s) => s.w)), H = sheets.reduce((a, s) => a + s.h + pad, 0);
const all = new Uint8Array(W * H * 4);
let yy = 0;
for (const s of sheets) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const si = (y * s.w + x) * 4, di = ((yy + y) * W + x) * 4; for (let k = 0; k < 4; k++) all[di + k] = s.rgba[si + k]; }
  yy += s.h + pad;
}
fs.writeFileSync(path.join(WEB, 'shots', 'art_mobs_sheet.png'), encodePng(W * K, H * K, scaleRgba(W, H, all, K, [176, 214, 150])));
console.log('見本', path.join(WEB, 'shots', 'art_mobs_sheet.png'));
