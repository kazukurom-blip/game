// 背景・地面/足場・アイコン・乗り物・UI の仮の画像（テスト用。CODEX_BATCH_03 の約束どおりの「正しい絵」と、わざと間違えた絵）
//   goodImages() → { 'bg/beach_town_far.png': img, ... }（img = { w, h, data: RGBA, hasAlpha }）
//   badImages()  → { rel: { img, expect: 'NG' | '注意', why } }
// 見分けやすい色: 中景の建物 = 緑、建物の足元の帯（y=630〜639）= 黄、パララックス確認の縦線 = 青、
//                 地面の歩く面（y=40〜45）= 明るい黄土、地面の断面 = 茶、タイトル = 橙、地図 = 青緑、ロゴ = 水色
import { newImage, writePng } from '../tools/png_rgba.mjs';

export const COLORS = {
  far: [150, 120, 200], mid: [40, 200, 80], foot: [255, 230, 0], marker: [0, 0, 255], lights: [255, 240, 120],
  groundTop: [230, 190, 90], ground: [150, 90, 40], platTop: [240, 210, 130], plat: [120, 70, 40],
  title: [255, 140, 0], map: [0, 160, 120], logo: [0, 255, 255], body: [220, 30, 40], bikeBody: [40, 120, 230], wheel: [30, 30, 40], rim: [200, 200, 210],
  skill: [120, 40, 200],
};
const OUT = [42, 20, 48];
function put(im, x, y, c, a = 255) { if (x < 0 || y < 0 || x >= im.w || y >= im.h) return; const o = (y * im.w + x) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = a; }
function img(w, h, alpha = true) { const im = newImage(w, h); im.hasAlpha = alpha; return im; }
function fillRect(im, x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(im, x, y, c, a); }
function disc(im, cx, cy, r, c, a = 255) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(im, x, y, c, a); }
function clearDisc(im, cx, cy, r) { disc(im, cx, cy, r, [0, 0, 0], 0); }

// ---------------------------------------------------------------- 背景（2560×720。周期が 2560 を割り切るので左右がつながる）
export function bgFar() {
  const im = img(2560, 720);
  for (let x = 0; x < 2560; x++) {
    const h = 160 + 90 * Math.sin((x / 2560) * Math.PI * 2 * 3) + 40 * Math.sin((x / 2560) * Math.PI * 2 * 7);
    for (let y = Math.round(640 - h); y < 640; y++) put(im, x, y, COLORS.far, 255);
  }
  return im;
}
export function bgMid() {
  const im = img(2560, 720);
  for (let x = 0; x < 2560; x++) {
    const k = Math.floor((x + 80) / 160) % 4;        // 建物 160px ごと（2560 / 160 = 16 で割り切れる。継ぎ目は建物の真ん中）
    const h = [260, 180, 320, 220][k];
    const edge = (x + 80) % 160 < 3 || (x + 80) % 160 >= 157;
    for (let y = 640 - h; y < 630; y++) put(im, x, y, edge || y < 640 - h + 3 ? OUT : COLORS.mid);
    for (let y = 630; y < 640; y++) put(im, x, y, COLORS.foot);   // 足元の帯
    for (let y = 640; y < 652; y++) put(im, x, y, [90, 70, 60]);   // 手前の縁（少しだけ）
  }
  fillRect(im, 100, 300, 10, 330, COLORS.marker);    // パララックス確認の縦線（x=100〜109）
  return im;
}
export function bgLights() {
  const im = img(2560, 720);
  for (let x = 20; x < 2560; x += 40) for (let y = 460; y < 600; y += 40) fillRect(im, x, y, 12, 16, COLORS.lights);
  return im;
}

// ---------------------------------------------------------------- 地面・足場
export function tileGround(surface = 40) {
  const im = img(512, 256);
  for (let x = 0; x < 512; x++) {
    if (x % 64 < 20) for (let y = surface - 8; y < surface; y++) put(im, x, y, [90, 170, 60]);   // 草の出っ張り
    for (let y = surface; y < 256; y++) put(im, x, y, y < surface + 6 ? COLORS.groundTop : (x + y) % 32 === 0 ? [120, 70, 30] : COLORS.ground);
  }
  return im;
}
export function tilePlatform() {
  const im = img(512, 96);
  for (let x = 0; x < 512; x++) {
    for (let y = 16; y < 40; y++) put(im, x, y, y < 20 ? COLORS.platTop : x % 32 === 0 ? OUT : COLORS.plat);
    for (let y = 40; y < 56; y++) put(im, x, y, [20, 0, 30], 80);
  }
  return im;
}

// ---------------------------------------------------------------- アイコン
export function iconEquip(main = '#ff8ac8', accent = '#ffe0f0') {
  const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const im = img(256, 256);
  disc(im, 128, 132, 96, OUT); disc(im, 128, 132, 90, hx(main));
  fillRect(im, 70, 150, 116, 16, hx(accent));
  disc(im, 100, 100, 10, [255, 255, 255]);
  return im;
}
export function iconItem(c = [230, 40, 60]) {
  const im = img(256, 256);
  disc(im, 128, 140, 84, OUT); disc(im, 128, 140, 78, c); fillRect(im, 108, 40, 40, 30, OUT);
  return im;
}
export function iconSkill(round = false) {
  const im = img(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) put(im, x, y, [COLORS.skill[0] + (y >> 3), COLORS.skill[1], COLORS.skill[2]]);
  disc(im, 128, 128, 50, [255, 255, 255]);
  if (round) for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const dx = Math.max(0, 40 - x, x - 215), dy = Math.max(0, 40 - y, y - 215); if (dx * dx + dy * dy > 40 * 40) put(im, x, y, [0, 0, 0], 0); }
  return im;
}

// ---------------------------------------------------------------- 乗り物（1024×512・右向き・タイヤの所は空け、中心にマゼンタの印）
export function vehicleBody(color = COLORS.body, wheels = [[250, 380], [780, 380]], marks = true, r = 70) {
  const im = img(1024, 512);
  fillRect(im, 80, 200, 864, 180, OUT); fillRect(im, 86, 206, 852, 168, color);
  fillRect(im, 300, 130, 360, 76, OUT); fillRect(im, 306, 136, 348, 70, [90, 60, 140]);
  for (const [x, y] of wheels) { clearDisc(im, x, y, r); if (marks) disc(im, x, y, 8, [255, 0, 255]); }
  return im;
}
export function wheelImg(cx = 128, cy = 128) {
  const im = img(256, 256);
  disc(im, cx, cy, 110, COLORS.wheel); disc(im, cx, cy, 60, COLORS.rim); fillRect(im, cx - 4, cy - 58, 8, 116, COLORS.wheel);
  return im;
}

// ---------------------------------------------------------------- UI
export function solid(w, h, c, alpha = false) { const im = img(w, h, alpha); fillRect(im, 0, 0, w, h, c); return im; }
export function logoImg(w = 1600, h = 600) { const im = img(w, h); fillRect(im, 200, 150, w - 400, h - 300, COLORS.logo); return im; }

/** 正しい絵（全部の種類を1つ以上。背景は beach の町とフィールド、地面・足場は beach） */
export function goodImages() {
  const far = bgFar(), mid = bgMid(), lights = bgLights();
  return {
    'bg/beach_town_far.png': far, 'bg/beach_town_mid.png': mid, 'bg/beach_town_lights.png': lights,
    'bg/beach_field_far.png': far, 'bg/beach_field_mid.png': mid, 'bg/beach_field_lights.png': lights,
    'tiles/beach_ground.png': tileGround(), 'tiles/beach_platform.png': tilePlatform(),
    'icons/equip/hat_catEars.png': iconEquip(), 'icons/item/potion_red.png': iconItem(), 'icons/skill/luna_neon_rush.png': iconSkill(),
    'vehicles/sports.png': vehicleBody(), 'vehicles/sports_wheel.png': wheelImg(),
    'vehicles/bike.png': vehicleBody(COLORS.bikeBody, [[300, 400], [720, 400]], true, 80), 'vehicles/bike_wheel.png': wheelImg(),
    'ui/title_art.png': solid(1920, 1080, COLORS.title), 'ui/logo.png': logoImg(), 'ui/world_map.png': solid(2048, 1152, COLORS.map),
  };
}
/** わざと間違えた絵（検査ツールのテスト用） */
export function badImages() {
  // 継ぎ目: 横方向に明るさが変わる（右端と左端で色が違う）
  const seam = bgMid();
  for (let y = 0; y < 720; y++) for (let x = 0; x < 2560; x++) { const o = (y * 2560 + x) * 4; if (seam.data[o + 3]) seam.data[o + 2] = Math.round((x / 2559) * 255); }
  const sky = bgFar(); for (let y = 0; y < 300; y++) for (let x = 0; x < 2560; x++) put(sky, x, y, [120, 160, 255]);
  const platSeam = tilePlatform(); for (let y = 16; y < 40; y++) for (let x = 0; x < 512; x++) put(platSeam, x, y, [Math.floor(x / 2), 70, 40]);
  const opaqueIcon = iconItem(); for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const o = (y * 256 + x) * 4; if (!opaqueIcon.data[o + 3]) put(opaqueIcon, x, y, [255, 255, 255]); }
  return {
    'bg/downtown_town_mid.png': { img: seam, expect: 'NG', why: '左右の継ぎ目' },
    'bg/slums_field_far.png': { img: sky, expect: 'NG', why: '空が塗られている' },
    'tiles/swamp_ground.png': { img: tileGround(70), expect: 'NG', why: '歩く面の線が y=70' },
    'tiles/casino_platform.png': { img: platSeam, expect: 'NG', why: '足場の継ぎ目' },
    'vehicles/police.png': { img: vehicleBody([240, 240, 245], [[250, 380], [780, 380]], false), expect: 'NG', why: 'マゼンタの印なし' },
    'vehicles/police_wheel.png': { img: wheelImg(140, 128), expect: '注意', why: 'タイヤが中央にない' },
    'icons/item/diamond.png': { img: opaqueIcon, expect: 'NG', why: '背景が透明でない' },
    'icons/skill/jin_ground_quake.png': { img: iconSkill(true), expect: '注意', why: '角を丸めた' },
    'ui/logo.png': { img: logoImg(1200, 600), expect: 'NG', why: '大きさ違い' },
  };
}
export const png = (im) => writePng(im);
