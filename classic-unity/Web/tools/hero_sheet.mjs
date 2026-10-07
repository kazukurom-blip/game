// 主人公（コードで描くちびキャラ）の全部のコマを 1 枚に並べた見本（確認用）。
//   node classic-unity/Web/tools/hero_sheet.mjs [出力.png] [倍率]
// 1 行目: ふつうの見た目の 立ち 3・歩き 4・ジャンプ・構え・振り 3・縄 2・はしご 2・伏せ・座る
// 2 行目から: 美容院の髪型 7 種 × 色（立ちの 1 コマ）と、感情表現の顔
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, scaleRgba } from './png.mjs';
import { PixelBuf } from '../wwwroot/js/pixel.js';
import { composeBuf, DEFAULT_LOOK, FRAME_W, FRAME_H } from '../wwwroot/js/avatar/avatar.js';
import { HAIR_IDS, FACE_IDS } from '../wwwroot/js/avatar/parts_fun.js';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(WEB, 'shots', 'art_hero_sheet.png');
const K = +(process.argv[3] || 3);
const row1 = [['stand1', 0], ['stand1', 1], ['stand1', 2], ['walk1', 0], ['walk1', 1], ['walk1', 2], ['walk1', 3], ['jump', 0], ['alert', 0],
  ['swing', 0], ['swing', 1], ['swing', 2], ['rope', 0], ['rope', 1], ['ladder', 0], ['ladder', 1], ['prone', 0], ['sit', 0]];
const colors = ['brown', 'black', 'blond', 'red', 'silver', 'blue', 'pink', 'green'];
const rows = [row1.map(([a, i]) => ({ look: DEFAULT_LOOK, a, i }))];
rows.push(HAIR_IDS.map((h, n) => ({ look: { ...DEFAULT_LOOK, hairColor: colors[n % colors.length], parts: DEFAULT_LOOK.parts.map((p) => (p.startsWith('hair_') ? h : p)) }, a: 'stand1', i: 0 }))
  .concat(HAIR_IDS.map((h, n) => ({ look: { ...DEFAULT_LOOK, hairColor: colors[(n + 3) % colors.length], parts: DEFAULT_LOOK.parts.map((p) => (p.startsWith('hair_') ? h : p)) }, a: 'rope', i: 0 }))));
const faces = [...FACE_IDS, 'face_e_smile', 'face_e_cry', 'face_e_angry', 'face_e_surprise', 'face_e_shy', 'face_e_sleepy', 'face_e_wink'];
rows.push(faces.map((fc, n) => ({ look: { ...DEFAULT_LOOK, skin: ['light', 'tan', 'pale', 'dark'][n % 4], topColor: ['blue', 'white', 'red', 'green', 'black', 'night', 'snow'][n % 7], parts: DEFAULT_LOOK.parts.map((p) => (p.startsWith('face_') ? fc : p)) }, a: 'stand1', i: 0 })));
const hats = ['hat_acorn', 'hat_cat', 'hat_crown', 'hat_chef', 'hat_witch', 'hat_leaf', 'hat_pirate', 'hat_star', 'hat_pumpkin', 'hat_snow', 'hat_stump', 'hat_sheep'];
rows.push(hats.map((h) => ({ look: { ...DEFAULT_LOOK, parts: [...DEFAULT_LOOK.parts, h] }, a: 'stand1', i: 0 })));

const cols = Math.max(...rows.map((r) => r.length));
const W = cols * FRAME_W, H = rows.length * FRAME_H;
const sheet = new PixelBuf(W, H);
rows.forEach((r, j) => r.forEach((c, i) => {
  const b = composeBuf(c.look, c.a, c.i);
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) { const v = b.data[y * FRAME_W + x]; if (v) sheet.data[(j * FRAME_H + y) * W + i * FRAME_W + x] = v; }
}));
const rgba = new Uint8Array(sheet.data.buffer.slice(0));
fs.writeFileSync(out, encodePng(W * K, H * K, scaleRgba(W, H, rgba, K, [150, 200, 160])));
console.log('書いた', out, W * K, 'x', H * K);
