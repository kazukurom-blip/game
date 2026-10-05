#!/usr/bin/env node
// 納品画像の検査（外部の画像生成AI から段階ごとに届く主人公の画像 ZIP を、機械的に検査してゲーム内の見た目も動画にする）
//
// 使い方:
//   node tools/check_art.mjs <zipファイル または フォルダ> [--out <出力フォルダ>] [--install] [--no-video]
//   npm run check:art -- <zip> [--install]
//
//   - ZIP は unzip で一時フォルダに展開する。中の assets/sprites/... 以下の PNG（無ければ rig/ heads/ から始まるパス）が対象。
//   - 種類はパスで判定: rig/body_<g>.png / rig/(top|bottom|shoes|hat|accessory)/*.png / rig/weapon/*.png / rig/tear/*.png /
//     heads/face/*.png / heads/hair/*.png / heads/*.png（1枚の頭・旧方式）。
//   - 出力（既定 tests/art_check/<ZIP名>/。.gitignore 済み）:
//       report.md（日本語。画像ごとの OK / 注意 / NG と理由・数値・直し方）、result.json（機械用）、
//       overlay_<名前>.png（素体や基本の顔と重ねたプレビュー。枠・支点・関節・頭頂/顎の線つき）、
//       preview.mp4 / preview_frames.png（ゲーム内の見た目: 右向きの 立ち → 歩き2周 → 攻撃 → 被弾。左 = そのまま、右 = 骨つき）
//   - --install: NG ではない画像を assets/sprites/ にコピーし、node tools/rig_manifest.mjs（rig 節）を実行、
//     faces / hairs 節を manifest に追記（docs/art_handoff/FACE_HAIR_SPEC.md の 5.）。RIG_BASE に無いスタイル（plainShirt 等）は
//     依頼書（docs/art_handoff/CODEX_BATCH_01.md）の基準色を rig.parts の base / accent に書く。
//     --root <dir> で入れる先のリポジトリを変えられる（テスト用）。
//   - --no-video: 動画・コマ並べを作らない（速い）。
//   - 終了コード: NG が1枚でもあれば 1、無ければ 0（エラーは 2）。
//
// 検査（閾値は下の TH）:
//   1. 大きさ（体・服・頭 1024×1024、武器 1024×512）、RGBA・背景の透明（四隅 16px と外周 4px）
//   2. 体・服: rigLayout.js の RIG_PARTS の枠（＋余白 12px）の外の絵、描くべき枠に絵があるか、描かない枠が空か
//   3. 関節: armB/armF/legB/legF の支点から 72px 下の ±24px で、1行ごとの不透明部分の幅の急な変化（服は素体と重ねた幅）
//   4. 素体との重なり（服）: 素体の輪郭から外へのはみ出し（距離つき・枠ごと）、袖・裾の横から素体が出る量、服の内側の穴から素体が見える量
//   5. 色: 主な色（輪郭線 #2A1430 付近を除く）と依頼書の基準色（主・アクセント）の差（色相・明度・ΔE）。顔は肌・瞳、髪は #b07850
//   6. 武器: マゼンタ #FF00FF の持ち手の印があるか、(240,256) 付近か
//   7. 頭: 支点 (512,400)・頭頂 y=220・顎 y=560 との位置。表情違いは基本の顔とのアルファの輪郭の一致率（IoU）。
//      前髪と顔を重ねて、頭頂の肌が前髪から出ていないか。顔に髪の色の画素が無いか
//   8. ファイル名が依頼書の一覧に無いものは注意
//   9. キャラ以外（依頼書 CODEX_BATCH_03: bg/ tiles/ icons/ vehicles/ ui/）は tools/check_art_env.mjs で検査:
//      大きさ・透明（背景の空・アイコンの外周）・左右の継ぎ目・地面の線の位置・乗り物のマゼンタの印・タイヤの中心。
//      プレビューは preview_env_bg / icons / vehicles / ui.png（ゲームの描画関数で描いたスクショ）。
//      --install で manifest の bg / tiles / icons / vehicles / ui 節に "キー": "パス" を書く（例 bg.beach_town_far・icons."equip/hat_cap"）。
//
// PNG の読み書きは tools/png_rgba.mjs（依存なし）。動画は Playwright（Chromium）でテスト用ページ tests/art_preview.html を開き、
// 一時フォルダの画像を assets/sprites/ に重ねて配信（このツールの中の小さな http サーバー）し、manifest を上書きして drawCharacter で描く。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readPng, writePng, newImage } from './png_rgba.mjs';
import { classifyEnv, parseCatalog03, checkEnv, envOverlay, envManifestKey, ENV_KINDS, ENV_PREFIX } from './check_art_env.mjs';
import {
  RIG_PARTS, RIG_GROUP_PARTS, RIG_ACC_PARTS, RIG_BASE, RIG_SKIN_BASE, WPN_W, WPN_H, WPN_BOX,
  HEAD_W, HEAD_H, HEAD_PX, HEAD_PY, HEAD_S, HEAD_GUIDE,
} from '../src/render/rigLayout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_MD = path.join(ROOT, 'docs', 'art_handoff', 'CODEX_BATCH_01.md');
const CATALOG02_MD = path.join(ROOT, 'docs', 'art_handoff', 'CODEX_BATCH_02.md');
const CATALOG03_CSV = path.join(ROOT, 'docs', 'art_handoff', 'CODEX_BATCH_03.csv');

// ---------------------------------------------------------------- 閾値
export const TH = {
  alpha: 32,              // 不透明とみなすアルファ
  margin: 12,             // 枠の余白
  outsideNg: 200, outsideWarn: 20,          // 枠の外の画素
  boxEmpty: 150,          // 描くべき枠: これ未満なら「絵が無い」
  forbidNg: 150, forbidWarn: 20,            // 描かない枠の画素
  corner: 16, border: 4, borderOkRatio: 0.995, borderNgRatio: 0.95,
  jointDy: 72, jointWin: 24,
  jointStep: 0.15,        // 隣の行との幅の変化（比）
  jointStep4: 0.25,       // 4行先との幅の変化（比）
  jointStepPx: 4,         // ただし差がこの px 以下なら無視（細い所の 1〜2px のゆれ）
  overDist: 16,           // 素体の輪郭からこれ以上離れたはみ出しを数える（px）
  overWarnLimb: 0.03, overNgLimb: 0.12, overNgDist: 40,   // 腕・脚・足: はみ出し（>16px）の割合
  overWarnTorso: 0.2,     // 胴・背中（スカート・フードは広がって当然なので注意だけ）
  sideGapPx: 3, sideGapRows: 6,             // 袖・裾の横から素体が出ている行（片側 > 3px）
  holeWarn: 60, innerGapWarn: 120,
  colorOkShare: 0.10, colorWarnShare: 0.03, colorOkDE: 12, colorWarnDE: 22, colorNear: 14,
  gripPx: 6, gripOk: 16, gripWarn: 48, gripMaxPx: 4000,
  headTopOk: 12, headTopWarn: 30, headCxOk: 50, headCxWarn: 90,
  iouOk: 0.995, iouWarn: 0.985,
  crownWarn: 0.08, crownNg: 0.25,           // 頭頂（y < 300）の肌が前髪から出ている割合
  sideSkinWarn: 0.03,
  hairInFaceWarn: 0.004, hairInFaceNg: 0.015,
};
const OUTLINE = [0x2a, 0x14, 0x30];
const HAIR_BASE = '#b07850', EYE_BASE = '#6a5cff';
const EXPRS = ['blink', 'hurt', 'shout', 'happy'];
const PART_JA = { head: '頭の物', back: '背中', torso: '胴', armB: '奥の腕', armF: '手前の腕', legB: '奥の脚', legF: '手前の脚', footB: '奥の足', footF: '手前の足' };
const JA_PART = Object.fromEntries(Object.entries(PART_JA).map(([k, v]) => [v, k]));
const LV = { OK: 0, 'メモ': 0, '注意': 1, NG: 2 };

// ---------------------------------------------------------------- 依頼書の一覧
/** CODEX_BATCH_01.md の表から { 'rig/top/plainShirt_f.png': { colors: [主, アクセント], parts: [...] }, 'heads/face/f_01.png': {} ... } */
export function parseCatalog(md) {
  const cat = {};
  const add = (p, info = {}) => { if (!cat[p]) cat[p] = { colors: null, parts: null }; if (info.colors && !cat[p].colors) cat[p].colors = info.colors; if (info.parts && !cat[p].parts) cat[p].parts = info.parts; };
  const norm = (t) => (/^(face|hair)\//.test(t) ? 'heads/' + t : t);
  const addFace = (base) => { add(base + '.png'); for (const e of EXPRS) add(`${base}_${e}.png`); };
  const sameAs = [];
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const ci = cells.findIndex((c) => /`(rig|face|hair)\/[^`]+`/.test(c));
      if (ci < 0) continue;
      const cell = cells[ci];
      const toks = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const rest = cells.slice(ci + 1).join(' | ');
      const hex = [...rest.matchAll(/`(#[0-9a-fA-F]{6})`/g)].map((m) => m[1].toLowerCase());
      const colors = hex.length ? [hex[0], hex[1] || null] : null;
      const partCell = cells.slice(ci + 1).find((c) => /胴|腕|脚|足|背中|頭の物/.test(c) && !/`/.test(c));
      const parts = partCell ? partCell.split(/[・、,]/).map((s) => JA_PART[s.trim()]).filter(Boolean) : null;
      let prev = null;
      const got = [];
      for (const t0 of toks) {
        let t;
        if (/^(rig|face|hair)\//.test(t0)) t = norm(t0.endsWith('.png') ? t0 : t0 + '.png');
        else if (prev && /^_[fm]\.png$/.test(t0)) t = prev.replace(/_[fm]\.png$/, t0);
        else if (prev && t0 === '_back.png') t = prev.replace(/\.png$/, '_back.png');
        else if (prev && /^_(blink|hurt|shout|happy)$/.test(t0)) t = prev.replace(/_(blink|hurt|shout|happy)\.png$/, '').replace(/\.png$/, '') + t0 + '.png';
        else continue;
        prev = t; got.push(t);
      }
      for (const t of got) {
        add(t, { colors, parts });
        if (/＋表情4枚|ほか3枚/.test(cell)) addFace(t.replace(/(_(blink|hurt|shout|happy))?\.png$/, ''));
        if (/⓪と同じ/.test(rest)) sameAs.push(t);
      }
    } else if (/^- [♀♂]:/.test(line)) {
      const toks = [...line.matchAll(/`([^`]+)`/g)].map((m) => norm(m[1]));
      if (/〜/.test(line) && toks.length === 2 && /face\//.test(toks[0])) {
        const m0 = /face\/([fm])_(\d+)/.exec(toks[0]), m1 = /face\/([fm])_(\d+)/.exec(toks[1]);
        if (m0 && m1) for (let n = +m0[2]; n <= +m1[2]; n++) addFace(`heads/face/${m0[1]}_${String(n).padStart(2, '0')}`);
      } else for (const t of toks) if (/heads\/hair\//.test(t)) { add(t + '.png'); add(t + '_back.png'); }
    }
  }
  for (const t of sameAs) { const f = t.replace(/_m\.png$/, '_f.png'); if (cat[f]) { cat[t].colors = cat[t].colors || cat[f].colors; cat[t].parts = cat[t].parts || cat[f].parts; } }
  return cat;
}

// ---------------------------------------------------------------- 色
const hex2rgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgb2hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function rgb2lab([r, g, b]) {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = k(x); y = k(y); z = k(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ---------------------------------------------------------------- 画像の小道具
const A = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
function maskOf(im, thr = TH.alpha) { const m = new Uint8Array(im.w * im.h); for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = im.data[j] >= thr ? 1 : 0; return m; }
function bboxOf(m, w, h, r = [0, 0, w, h]) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
  for (let y = Math.max(0, r[1]); y < Math.min(h, r[1] + r[3]); y++) for (let x = Math.max(0, r[0]); x < Math.min(w, r[0] + r[2]); x++) if (m[y * w + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return n ? { x0, y0, x1, y1, n } : null;
}
/** 素体の外の画素の、素体までのおおよその距離（チャンファー 3-4。px） */
function distFrom(m, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i]; if (!v) continue;
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); }
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}
// 描画（オーバーレイ用）
function blendPx(im, x, y, c, a) {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const o = (y * im.w + x) * 4, d = im.data, da = d[o + 3] / 255, oa = a + da * (1 - a);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) d[o + k] = (c[k] * a + d[o + k] * da * (1 - a)) / oa;
  d[o + 3] = oa * 255;
}
function drawOver(dst, src, alpha = 1, dx = 0, dy = 0) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const o = (y * src.w + x) * 4, a = (src.data[o + 3] / 255) * alpha;
    if (a > 0) blendPx(dst, x + dx, y + dy, [src.data[o], src.data[o + 1], src.data[o + 2]], a);
  }
}
function checker(w, h) {
  const im = newImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ((x >> 4) + (y >> 4)) & 1 ? 74 : 62, o = (y * w + x) * 4; im.data[o] = v; im.data[o + 1] = v; im.data[o + 2] = v + 8; im.data[o + 3] = 255; }
  return im;
}
function rect(im, x, y, w, h, c, a = 1, t = 2, dash = 0) {
  for (let i = 0; i < t; i++) {
    for (let xx = x; xx < x + w; xx++) if (!dash || ((xx / dash) | 0) % 2 === 0) { blendPx(im, xx, y + i, c, a); blendPx(im, xx, y + h - 1 - i, c, a); }
    for (let yy = y; yy < y + h; yy++) if (!dash || ((yy / dash) | 0) % 2 === 0) { blendPx(im, x + i, yy, c, a); blendPx(im, x + w - 1 - i, yy, c, a); }
  }
}
function hline(im, x0, x1, y, c, a = 1, t = 1, dash = 0) { for (let i = 0; i < t; i++) for (let x = x0; x <= x1; x++) if (!dash || ((x / dash) | 0) % 2 === 0) blendPx(im, x, y + i, c, a); }
function vline(im, x, y0, y1, c, a = 1, t = 1) { for (let i = 0; i < t; i++) for (let y = y0; y <= y1; y++) blendPx(im, x + i, y, c, a); }
function cross(im, x, y, r, c, t = 2) { hline(im, x - r, x + r, y - (t >> 1), c, 1, t); vline(im, x - (t >> 1), y - r, y + r, c, 1, t); }
const C = { box: [60, 255, 120], boxOff: [150, 150, 160], pivot: [255, 230, 40], joint: [255, 150, 30], out: [255, 40, 60], gap: [40, 220, 255], guide: [80, 220, 255], grip: [40, 220, 255] };
function tintMask(im, m, c, a) { for (let i = 0; i < m.length; i++) if (m[i]) blendPx(im, i % im.w, (i / im.w) | 0, c, a); }
function dimmed(im, k = 0.45) { const o = { w: im.w, h: im.h, data: new Uint8Array(im.data) }; for (let i = 0; i < o.data.length; i += 4) { const g = (o.data[i] + o.data[i + 1] + o.data[i + 2]) / 3; for (let j = 0; j < 3; j++) o.data[i + j] = g * k + o.data[i + j] * (1 - k) * 0.7 + 30; } return o; }

// ---------------------------------------------------------------- 種類の判定
/** rel（assets/sprites/ からのパス）→ { kind, slot, style, variant, g, id, expr, back } */
export function classify(rel) {
  let m;
  const env = classifyEnv(rel);   // 背景・地面/足場・アイコン・乗り物・UI（tools/check_art_env.mjs）
  if (env) return env;
  if ((m = /^rig\/body_([fm])\.png$/.exec(rel))) return { kind: 'body', slot: 'body', g: m[1] };
  if ((m = /^rig\/(top|bottom|shoes|hat|accessory)\/([A-Za-z0-9]+)(?:__([0-9a-fA-F]{6}))?_([fm])\.png$/.exec(rel))) return { kind: 'wear', slot: m[1], style: m[2], variant: m[3] ? '#' + m[3].toLowerCase() : null, g: m[4] };
  if ((m = /^rig\/(top|bottom|shoes|hat|accessory)\/.+\.png$/.exec(rel))) return { kind: 'wear', slot: m[1], style: null, bad: true };
  if ((m = /^rig\/weapon\/([A-Za-z0-9]+)(?:__([0-9a-fA-F]{6}))?\.png$/.exec(rel))) return { kind: 'weapon', slot: 'weapon', style: m[1], variant: m[2] ? '#' + m[2].toLowerCase() : null };
  if ((m = /^rig\/tear\/([123])_([fm])\.png$/.exec(rel))) return { kind: 'wear', slot: 'tear', style: m[1], g: m[2] };
  // 番号の顔（f_01）に加えて、NPC・敵専用の悪役（m_v01）・老人（m_o01）・ボスのドン（m_don）
  if ((m = /^heads\/face\/([fm])_(\d+|v\d+|o\d+|don)(?:_(blink|hurt|shout|happy))?\.png$/.exec(rel))) return { kind: 'face', g: m[1], id: `${m[1]}_${m[2]}`, expr: m[3] || null };
  if ((m = /^heads\/hair\/([fm])_([A-Za-z0-9]+?)(_back)?\.png$/.exec(rel))) return { kind: 'hair', g: m[1], id: m[2], key: `${m[1]}_${m[2]}`, back: !!m[3] };
  if ((m = /^heads\/([a-z]+)_([fm])(_back)?\.png$/.exec(rel))) return { kind: 'head', cls: m[1], g: m[2], back: !!m[3] };
  return { kind: 'other' };
}
/** 展開したフォルダ → [{ rel, abs }]（assets/sprites/ 以下、無ければ rig/ heads/ から） */
export function collect(dir) {
  const all = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { if (n === '__MACOSX' || n.startsWith('._')) continue; const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (/\.png$/i.test(n)) all.push(f); } };
  walk(dir);
  const out = [];
  for (const f of all) {
    const p = path.relative(dir, f).replace(/\\/g, '/');
    let rel = null;
    const i = p.indexOf('assets/sprites/');
    if (i >= 0) rel = p.slice(i + 'assets/sprites/'.length);
    else { const m = /(?:^|\/)((?:rig|heads|bg|tiles|icons|vehicles|ui)\/.+)$/.exec(p); if (m) rel = m[1]; }
    if (rel && !/^(rig|heads)\//.test(rel) && !ENV_PREFIX.test(rel) && i < 0) rel = null;
    if (rel) out.push({ rel, abs: f });
  }
  // 同じ rel が2つ（assets/sprites/ と直下）なら assets/sprites/ の方
  const seen = new Map();
  for (const o of out) if (!seen.has(o.rel) || o.abs.includes('assets/sprites/')) seen.set(o.rel, o);
  return [...seen.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

// ---------------------------------------------------------------- 検査
function mkRes(rel, info) {
  return {
    rel, info, items: [], metrics: {}, overlay: null,
    add(level, msg, fix) { this.items.push({ level, msg, fix: fix || null }); },
    get verdict() { return this.items.reduce((v, it) => (LV[it.level] > LV[v] ? it.level : v), 'OK'); },
  };
}
function checkSizeAlpha(r, im, W, H) {
  r.metrics.size = `${im.w}×${im.h}`;
  if (im.w !== W || im.h !== H) r.add('NG', `大きさが ${im.w}×${im.h}（${W}×${H} が正しい）`, `${W}×${H} の配置図の上に描き直してください（縮小・切り抜き・余白の追加はしない）`);
  if (!im.hasAlpha) { r.add('NG', '透明の情報（アルファ）が無い RGB の画像', '背景を透明にした RGBA の PNG で保存してください'); return; }
  const c = TH.corner;
  let cornerOpaque = 0;
  for (const [x0, y0] of [[0, 0], [im.w - c, 0], [0, im.h - c], [im.w - c, im.h - c]]) for (let y = y0; y < y0 + c; y++) for (let x = x0; x < x0 + c; x++) if (A(im, x, y) > 8) cornerOpaque++;
  let bn = 0, bt = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { if (x >= TH.border && y >= TH.border && x < im.w - TH.border && y < im.h - TH.border) continue; bn++; if (A(im, x, y) <= 8) bt++; }
  const ratio = bt / bn;
  let op = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i] >= TH.alpha) op++;
  r.metrics.cornerOpaquePx = cornerOpaque; r.metrics.borderTransparent = +(ratio * 100).toFixed(2); r.metrics.opaqueRatio = +((op / (im.w * im.h)) * 100).toFixed(2);
  if (op / (im.w * im.h) > 0.85) r.add('NG', `画像の ${(op / (im.w * im.h) * 100).toFixed(0)}% が不透明（背景が抜けていない）`, '背景を完全な透明にしてください');
  else if (cornerOpaque > 0 || ratio < TH.borderNgRatio) r.add('NG', `四隅・外周が透明ではない（四隅の不透明 ${cornerOpaque}px、外周の透明率 ${(ratio * 100).toFixed(1)}%）`, '背景・枠線・文字を消して、透明にしてください');
  else if (ratio < TH.borderOkRatio) r.add('注意', `外周に絵が少しかかっている（外周の透明率 ${(ratio * 100).toFixed(1)}%）`, '画像の端から離して描いてください');
  if (op === 0) r.add('NG', '絵がありません（全部透明）');
}
function partsFor(info, cat) {
  if (info.kind === 'body') return { req: RIG_GROUP_PARTS.body, allow: RIG_GROUP_PARTS.body };
  const allow = info.slot === 'accessory' ? (RIG_ACC_PARTS[info.style] || RIG_GROUP_PARTS.accessory) : RIG_GROUP_PARTS[info.slot] || [];
  let req = cat && cat.parts && cat.parts.length ? cat.parts : allow;
  if (info.slot === 'top' && !(cat && cat.parts)) req = allow.filter((p) => p !== 'back');   // 背中（フード等）は無くてもよい
  if (info.slot === 'accessory' && !RIG_ACC_PARTS[info.style]) req = [];
  return { req, allow: [...new Set([...allow, ...req])] };
}
function checkBoxes(r, im, info, cat, ov) {
  const { req, allow } = partsFor(info, cat);
  const names = Object.keys(RIG_PARTS), cnt = Object.fromEntries(names.map((k) => [k, 0]));
  let outside = 0, inMargin = 0;
  const M = TH.margin, outMask = new Uint8Array(im.w * im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (A(im, x, y) < TH.alpha) continue;
    let hit = null, near = false;
    for (const k of names) { const p = RIG_PARTS[k]; if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) { hit = k; break; } if (x >= p.x - M && x < p.x + p.w + M && y >= p.y - M && y < p.y + p.h + M) near = true; }
    if (hit) cnt[hit]++; else if (near) inMargin++; else { outside++; outMask[y * im.w + x] = 1; }
  }
  r.metrics.boxPx = cnt; r.metrics.outsidePx = outside; r.metrics.marginPx = inMargin;
  if (outside >= TH.outsideNg) r.add('NG', `枠（＋余白${M}px）の外に絵が ${outside}px 出ている`, '各パーツを配置図の枠の中に収めてください（配置図の線・文字も消す）');
  else if (outside >= TH.outsideWarn) r.add('注意', `枠（＋余白${M}px）の外に絵が ${outside}px ある`, '枠の外の小さな点・線を消してください');
  if (inMargin > 400) r.add('注意', `枠のすぐ外（余白${M}px の中）に ${inMargin}px かかっている`, '枠の中に収めてください（読み込み時に切れる）');
  for (const k of req) if (cnt[k] < TH.boxEmpty) r.add('NG', `描くべき枠「${PART_JA[k]}」(${k}) に絵が無い（${cnt[k]}px）`, `「${PART_JA[k]}」の枠に描いてください`);
  for (const k of names) {
    if (allow.includes(k)) continue;
    if (cnt[k] >= TH.forbidNg) r.add('NG', `描かない枠「${PART_JA[k]}」(${k}) に絵がある（${cnt[k]}px）`, `「${PART_JA[k]}」の枠は空にしてください`);
    else if (cnt[k] >= TH.forbidWarn) r.add('注意', `描かない枠「${PART_JA[k]}」(${k}) に小さな絵（${cnt[k]}px）`, 'ゴミを消してください');
  }
  if (ov) tintMask(ov, outMask, C.out, 0.9);
  return { req, allow, cnt };
}
/** 関節の前後の幅（1行ごと） */
function widths(m, w, p, y0, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) {
    let a = -1, b = -1, n = 0;
    for (let x = p.x; x < p.x + p.w; x++) if (m[y * w + x]) { if (a < 0) a = x; b = x; n++; }
    out.push({ y, w: a < 0 ? 0 : b - a + 1, n, a, b });
  }
  return out;
}
function jointEval(rows) {
  let worst = { step: 0, y: null, from: 0, to: 0, kind: '' };
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].w, b = rows[i].w;
    if (!a || !b) continue;
    const d = Math.abs(b - a), s = d / Math.max(a, b);
    if (d > TH.jointStepPx && s > worst.step) worst = { step: s, y: rows[i].y, from: a, to: b, kind: '1' };
  }
  for (let i = 4; i < rows.length; i++) {
    const a = rows[i - 4].w, b = rows[i].w;
    if (!a || !b) continue;
    const d = Math.abs(b - a), s = d / Math.max(a, b);
    if (d > TH.jointStepPx && s * (TH.jointStep / TH.jointStep4) > worst.step) worst = { step: s * (TH.jointStep / TH.jointStep4), y: rows[i].y, from: a, to: b, kind: '4', raw: s };
  }
  const nz = rows.filter((r) => r.w > 0);
  return { worst, zeroRows: rows.length - nz.length, min: nz.length ? Math.min(...nz.map((r) => r.w)) : 0, max: nz.length ? Math.max(...nz.map((r) => r.w)) : 0 };
}
function checkJoints(r, im, info, used, bodyIm, ov) {
  const J = {};
  const m = maskOf(im, 64);
  const bm = bodyIm ? maskOf(bodyIm, 64) : null;
  const um = bm ? m.map((v, i) => v | bm[i]) : m;
  for (const k of ['armB', 'armF', 'legB', 'legF']) {
    if (!used.req.includes(k) && used.cnt[k] < TH.boxEmpty) continue;
    const p = RIG_PARTS[k], jy = p.py + TH.jointDy;
    const own = widths(m, im.w, p, jy - TH.jointWin, jy + TH.jointWin);
    const seen = info.kind === 'body' || !bm ? own : widths(um, im.w, p, jy - TH.jointWin, jy + TH.jointWin);
    const ev = jointEval(seen), evOwn = jointEval(own);
    J[k] = { jointY: jy, minW: ev.min, maxW: ev.max, worstStep: +(ev.worst.step * 100).toFixed(1), at: ev.worst.y, from: ev.worst.from, to: ev.worst.to, ownZeroRows: evOwn.zeroRows, ownWidths: own.map((o) => o.w) };
    if (info.kind === 'body' && ev.zeroRows) r.add('NG', `${PART_JA[k]}: 肘・膝（y=${jy}）の±${TH.jointWin}px で絵が切れている（${ev.zeroRows} 行が空）`, `支点から ${TH.jointDy}px 下の前後もつながった形で描いてください`);
    if (ev.worst.step >= TH.jointStep) {
      const lvl = ev.worst.step >= TH.jointStep * 2 ? 'NG' : '注意';
      r.add(lvl, `${PART_JA[k]}: 関節（y=${jy}）付近で太さが急に変わる（y=${ev.worst.y} で ${ev.worst.from}→${ev.worst.to}px${ev.worst.kind === '4' ? '、4行で' : ''}${info.kind !== 'body' && bm ? '、素体と重ねた幅' : ''}）`, `肘・膝の前後 ${TH.jointWin}px は、まっすぐで太さを変えずに描いてください（袖口・裾・飾りは関節から離す）`);
    }
    if (info.kind !== 'body' && evOwn.zeroRows > 0 && evOwn.zeroRows < own.length) r.add('注意', `${PART_JA[k]}: 袖口・裾の端が関節（y=${jy}）の±${TH.jointWin}px の中にある`, `袖・裾の端は関節から ${TH.jointWin}px 以上離すと、曲げた時に折れて見えません`);
    if (ov) { hline(ov, p.x, p.x + p.w - 1, jy, C.joint, 1, 2); hline(ov, p.x, p.x + p.w - 1, jy - TH.jointWin, C.joint, 0.8, 1, 4); hline(ov, p.x, p.x + p.w - 1, jy + TH.jointWin, C.joint, 0.8, 1, 4); }
  }
  r.metrics.joints = J;
}
function checkOverlap(r, im, info, used, bodyIm, ov) {
  const w = im.w, h = im.h;
  const cm = maskOf(im, 64), bm = maskOf(bodyIm, 64);
  const dist = distFrom(bm, w, h);
  const out = {}, outMask = new Uint8Array(w * h), gapMask = new Uint8Array(w * h);
  for (const k of Object.keys(RIG_PARTS)) {
    const p = RIG_PARTS[k];
    if (used.cnt[k] < TH.boxEmpty) continue;
    if (k === 'head') continue;
    let n = 0, o16 = 0, maxD = 0, nOut = 0;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const i = y * w + x;
      if (!cm[i]) continue;
      n++;
      if (!bm[i]) { nOut++; const d = dist[i]; if (d > maxD) maxD = d; if (d > TH.overDist) { o16++; outMask[i] = 1; } }
    }
    // 服の内側の穴（枠の外周から服を通らずに行けない透明部分）で素体が見える画素
    const reach = new Uint8Array(p.w * p.h), st = [];
    const at = (x, y) => (y - p.y) * p.w + (x - p.x);
    for (let x = p.x; x < p.x + p.w; x++) for (const y of [p.y, p.y + p.h - 1]) st.push([x, y]);
    for (let y = p.y; y < p.y + p.h; y++) for (const x of [p.x, p.x + p.w - 1]) st.push([x, y]);
    while (st.length) {
      const [x, y] = st.pop();
      if (x < p.x || y < p.y || x >= p.x + p.w || y >= p.y + p.h) continue;
      const j = at(x, y);
      if (reach[j] || cm[y * w + x]) continue;
      reach[j] = 1;
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    let hole = 0;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { const i = y * w + x; if (!cm[i] && !reach[at(x, y)] && bm[i]) { hole++; gapMask[i] = 1; } }
    // 腕・脚・足: 服がある行で、服の左右の外に素体が出ている量と、服の幅の中で覆われていない素体
    let sideRows = 0, sidePx = 0, inner = 0;
    if (/^(arm|leg|foot)/.test(k)) {
      for (let y = p.y; y < p.y + p.h; y++) {
        let a = -1, b = -1;
        for (let x = p.x; x < p.x + p.w; x++) if (cm[y * w + x]) { if (a < 0) a = x; b = x; }
        if (a < 0) continue;
        let L = 0, R = 0;
        for (let x = p.x; x < a; x++) if (bm[y * w + x]) { L++; if (a - x <= 40) gapMask[y * w + x] = 1; }
        for (let x = b + 1; x < p.x + p.w; x++) if (bm[y * w + x]) { R++; if (x - b <= 40) gapMask[y * w + x] = 1; }
        if (L > TH.sideGapPx || R > TH.sideGapPx) { sideRows++; sidePx += L + R; }
        for (let x = a; x <= b; x++) { const i = y * w + x; if (!cm[i] && bm[i]) { inner++; gapMask[i] = 1; } }
      }
    }
    out[k] = { clothPx: n, outsideBodyPx: nOut, farOutsidePx: o16, farRatio: +(n ? (o16 / n) * 100 : 0).toFixed(1), maxDist: Math.round(maxD), holePx: hole, sideGapRows: sideRows, sideGapPx: sidePx, innerGapPx: inner };
    const limb = /^(arm|leg|foot)/.test(k), ratio = n ? o16 / n : 0;
    if (limb) {
      if (ratio >= TH.overNgLimb && maxD >= TH.overNgDist) r.add('NG', `${PART_JA[k]}: 素体の輪郭から大きくはみ出している（${TH.overDist}px より外が ${(ratio * 100).toFixed(1)}%、最大 ${Math.round(maxD)}px）`, '素体の腕・脚・足の形に沿って描いてください');
      else if (ratio >= TH.overWarnLimb) r.add('注意', `${PART_JA[k]}: 素体の輪郭からはみ出し（${TH.overDist}px より外が ${(ratio * 100).toFixed(1)}%、最大 ${Math.round(maxD)}px）`, '袖・裾・靴のふくらみが大きすぎないか確認してください');
      if (sideRows > TH.sideGapRows) r.add('注意', `${PART_JA[k]}: 服の横から素体がはみ出している行が ${sideRows} 行（計 ${sidePx}px）`, '袖・裾・靴の幅を素体の腕・脚より少し太くしてください');
      if (inner > TH.innerGapWarn) r.add('注意', `${PART_JA[k]}: 服の幅の中で素体が見えている隙間 ${inner}px`, '袖口・裾の内側の透明な隙間を塗ってください');
    } else if (ratio >= TH.overWarnTorso) r.add('注意', `${PART_JA[k]}: 素体の輪郭から ${TH.overDist}px より外が ${(ratio * 100).toFixed(1)}%（最大 ${Math.round(maxD)}px）`, 'スカート・フードなら問題なし。肩が浮いていないか重ねた絵で確認してください');
    if (hole > TH.holeWarn) r.add('注意', `${PART_JA[k]}: 服の内側の穴から素体が見えている（${hole}px）`, '穴（透明の抜け）を塗ってください（破れの表現はインナーで）');
  }
  r.metrics.overlap = out;
  if (ov) { tintMask(ov, outMask, C.out, 0.75); tintMask(ov, gapMask, C.gap, 0.75); }
}
function colorStats(im, opts = {}) {
  const bins = new Map();
  let n = 0;
  const ol = rgb2lab(OUTLINE);
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] < 200) continue;
    const c = [im.data[i], im.data[i + 1], im.data[i + 2]];
    if (opts.skipMagenta && c[0] > 200 && c[1] < 90 && c[2] > 200) continue;
    const lab = rgb2lab(c);
    if (dE(lab, ol) < 12 || lab[0] < 12) continue;   // 輪郭線・黒
    n++;
    const k = (c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3);
    const b = bins.get(k) || bins.set(k, { n: 0, r: 0, g: 0, b: 0 }).get(k);
    b.n++; b.r += c[0]; b.g += c[1]; b.b += c[2];
  }
  // 近いビンをまとめる（ΔE < 8）
  const list = [...bins.values()].map((b) => ({ n: b.n, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] })).sort((a, b) => b.n - a.n);
  const cl = [];
  for (const b of list) {
    const lab = rgb2lab(b.rgb);
    const c = cl.find((x) => dE(x.lab, lab) < 8);
    if (c) { const t = c.n + b.n; c.rgb = c.rgb.map((v, j) => (v * c.n + b.rgb[j] * b.n) / t); c.n = t; } else if (cl.length < 400) cl.push({ n: b.n, rgb: b.rgb, lab });
  }
  cl.sort((a, b) => b.n - a.n);
  return { n, clusters: cl, share(hex, near = TH.colorNear) { const L = rgb2lab(hex2rgb(hex)); let s = 0; for (const c of cl) if (dE(c.lab, L) < near) s += c.n; return n ? s / n : 0; } };
}
function compareColor(r, cs, label, hex, required = true) {
  const L = rgb2lab(hex2rgb(hex)), H = rgb2hsl(hex2rgb(hex));
  const share = cs.share(hex);
  const top = cs.clusters.slice(0, 3);
  const best = top.map((c) => ({ c, d: dE(c.lab, L) })).sort((a, b) => a.d - b.d)[0];
  const dom = cs.clusters[0];
  const info = { base: hex, share: +(share * 100).toFixed(1) };
  if (best) {
    const hs = rgb2hsl(best.c.rgb);
    info.nearest = rgb2hex(best.c.rgb); info.dE = +best.d.toFixed(1); info.hueDiff = H[1] > 0.12 && hs[1] > 0.12 ? +hueDiff(H[0], hs[0]).toFixed(0) : null; info.lightDiff = +((hs[2] - H[2]) * 100).toFixed(0);
  }
  if (dom) info.dominant = rgb2hex(dom.rgb);
  if (!required) return info;
  const ok = share >= TH.colorOkShare || (best && best.d < TH.colorOkDE);
  const warn = share >= TH.colorWarnShare || (best && best.d < TH.colorWarnDE);
  const detail = best ? `一番近い主な色 ${info.nearest}（ΔE ${info.dE}${info.hueDiff != null ? `・色相 ${info.hueDiff}°` : ''}・明度 ${info.lightDiff > 0 ? '+' : ''}${info.lightDiff}%）、基準色に近い画素 ${info.share}%` : '色が取れません';
  if (!ok) r.add(warn ? '注意' : 'NG', `${label}の色が基準色 ${hex} と${warn ? '少し' : ''}違う（${detail}）`, `${label}は基準色 ${hex} で塗り、陰と光はその濃淡で付けてください`);
  return info;
}
function checkColors(r, im, info, cat) {
  const cs = colorStats(im, { skipMagenta: info.kind === 'weapon' });
  r.metrics.mainColors = cs.clusters.slice(0, 5).map((c) => `${rgb2hex(c.rgb)} ${(c.n / Math.max(1, cs.n) * 100).toFixed(1)}%`);
  let base = null;
  if (info.kind === 'body') base = [RIG_SKIN_BASE[info.g], '#3a3346'];
  else if (info.kind === 'wear' || info.kind === 'weapon') {
    const d = (RIG_BASE[info.slot] && RIG_BASE[info.slot][info.style]) || null;
    base = (cat && cat.colors) || (info.variant ? [info.variant, d ? d[1] : null] : d);
  }
  if (!base) { if (info.kind === 'wear' || info.kind === 'weapon') r.add('注意', '基準色が分からない（依頼書にも RIG_BASE にも無いスタイル）ので色は比べていません'); return; }
  const lab0 = info.kind === 'body' ? '肌' : '主な色';
  r.metrics.color = { main: compareColor(r, cs, lab0, base[0]) };
  if (base[1]) {
    const a = compareColor(r, cs, 'アクセント', base[1], false);
    r.metrics.color.accent = a;
    if (a.share < 0.2 && !(a.dE < TH.colorWarnDE)) r.add('注意', `アクセントの基準色 ${base[1]} がほとんど無い（近い画素 ${a.share}%）`, `アクセントは ${base[1]} で塗ってください（無いデザインなら問題なし）`);
  }
}
function checkWeapon(r, im, ov) {
  let n = 0, sx = 0, sy = 0;
  const mm = new Uint8Array(im.w * im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const o = (y * im.w + x) * 4, d = im.data;
    if (d[o + 3] > 128 && d[o] > 200 && d[o + 1] < 90 && d[o + 2] > 200 && Math.abs(d[o] - d[o + 2]) < 60) { n++; sx += x; sy += y; mm[y * im.w + x] = 1; }
  }
  r.metrics.gripPx = n;
  const tx = WPN_BOX.px, ty = WPN_BOX.py;
  if (n < TH.gripPx) r.add('NG', 'マゼンタ #FF00FF の持ち手の印がありません', `握る所の真ん中 (${tx},${ty}) に、マゼンタ #FF00FF の小さな丸を描いてください`);
  else {
    const cx = sx / n, cy = sy / n, d = Math.hypot(cx - tx, cy - ty);
    r.metrics.grip = { x: Math.round(cx), y: Math.round(cy), dist: Math.round(d) };
    if (d > TH.gripWarn) r.add('NG', `持ち手の印の位置 (${Math.round(cx)},${Math.round(cy)}) が (${tx},${ty}) から ${Math.round(d)}px 離れている`, `握る所を (${tx},${ty}) に置いて描いてください`);
    else if (d > TH.gripOk) r.add('注意', `持ち手の印の位置 (${Math.round(cx)},${Math.round(cy)}) が (${tx},${ty}) から ${Math.round(d)}px ずれている`, `握る所を (${tx},${ty}) に合わせてください`);
    if (n > TH.gripMaxPx) r.add('注意', `持ち手の印が大きい（${n}px）`, '印は小さな丸（直径 10〜30px）で');
    if (ov) cross(ov, Math.round(cx), Math.round(cy), 14, C.grip, 3);
  }
  // 枠の外
  const B = WPN_BOX, M = TH.margin;
  let out = 0;
  const om = new Uint8Array(im.w * im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) >= TH.alpha && !(x >= B.x - M && x < B.x + B.w + M && y >= B.y - M && y < B.y + B.h + M)) { out++; om[y * im.w + x] = 1; }
  r.metrics.outsidePx = out;
  if (out >= TH.outsideNg) r.add('NG', `武器の枠（＋余白）の外に絵が ${out}px 出ている`, `武器の枠 (${B.x},${B.y})・${B.w}×${B.h} の中に描いてください`);
  else if (out >= TH.outsideWarn) r.add('注意', `武器の枠の外に ${out}px`);
  if (ov) { tintMask(ov, om, C.out, 0.9); rect(ov, B.x, B.y, B.w, B.h, C.box, 0.9, 2); cross(ov, tx, ty, 22, C.pivot, 2); }
}
function headGuides(ov) {
  for (const [y, c, d] of [[HEAD_PY + HEAD_GUIDE.top * HEAD_S, C.guide, 0], [HEAD_PY + HEAD_GUIDE.eye * HEAD_S, C.guide, 6], [HEAD_PY + HEAD_GUIDE.chin * HEAD_S, C.guide, 0]]) hline(ov, 0, ov.w - 1, y, c, 0.8, 1, d);
  cross(ov, HEAD_PX, HEAD_PY, 24, C.pivot, 2);
}
function checkHeadPos(r, im, info) {
  const m = maskOf(im, 128), bb = bboxOf(m, im.w, im.h);
  if (!bb) return null;
  const top = HEAD_PY + HEAD_GUIDE.top * HEAD_S, chin = HEAD_PY + HEAD_GUIDE.chin * HEAD_S;
  r.metrics.bbox = { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, cx: Math.round((bb.x0 + bb.x1) / 2) };
  const lv = (d, ok, wn) => (Math.abs(d) <= ok ? null : Math.abs(d) <= wn ? '注意' : 'NG');
  if (info.kind === 'face') {
    const l1 = lv(bb.y0 - top, TH.headTopOk, TH.headTopWarn), l2 = lv(bb.y1 - chin, TH.headTopOk, TH.headTopWarn), l3 = lv((bb.x0 + bb.x1) / 2 - HEAD_PX, TH.headCxOk, TH.headCxWarn);
    if (l1) r.add(l1, `頭頂の高さ y=${bb.y0}（基準 y=${top}、差 ${bb.y0 - top}px）`, `頭頂を y=${top} に合わせてください（face/f_01.png を下敷きに）`);
    if (l2) r.add(l2, `顎の高さ y=${bb.y1}（基準 y=${chin}、差 ${bb.y1 - chin}px）`, `顎を y=${chin} に合わせてください`);
    if (l3) r.add(l3, `頭の横の中心 x=${Math.round((bb.x0 + bb.x1) / 2)}（支点 x=${HEAD_PX} から ${Math.round((bb.x0 + bb.x1) / 2 - HEAD_PX)}px）`, `頭の中心を支点 (${HEAD_PX},${HEAD_PY}) に合わせてください`);
  } else if (info.kind === 'hair' && !info.back) {
    if (bb.y0 > top + 12) r.add('注意', `前髪の上端 y=${bb.y0} が頭頂の線 y=${top} より下（頭頂の髪が無い？）`, '頭頂の丸みも髪で覆ってください');
    if (bb.y0 < top - 120) r.add('注意', `前髪の上端 y=${bb.y0} が頭頂の線 y=${top} より ${top - bb.y0}px 上`, 'アホ毛でなければ、頭頂の線に合わせてください');
  } else if (info.kind === 'hair' && info.back) {
    if (bb.y0 > HEAD_PY) r.add('注意', `後ろ髪の上端 y=${bb.y0} が頭の中心より下`, '後頭部（頭頂の後ろ）から描いてください');
  }
  return { m, bb };
}
function iouOf(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] || b[k]) { u++; if (a[k] && b[k]) i++; } } return u ? i / u : 1; }
function checkExpr(r, im, baseIm, ov) {
  if (!baseIm) { r.add('注意', '基本の顔（表情なし）が無いので、輪郭の一致は比べていません', '基本の顔も一緒に入れてください'); return; }
  if (baseIm.w !== im.w || baseIm.h !== im.h) { r.add('NG', '基本の顔と大きさが違う'); return; }
  const a = maskOf(im, 128), b = maskOf(baseIm, 128);
  const iou = iouOf(a, b), ba = bboxOf(a, im.w, im.h), bb = bboxOf(b, im.w, im.h);
  const sh = ba && bb ? [ba.x0 - bb.x0, ba.y0 - bb.y0, ba.x1 - bb.x1, ba.y1 - bb.y1] : null;
  r.metrics.exprIoU = +(iou * 100).toFixed(2); r.metrics.bboxShift = sh;
  const moved = sh && sh.some((v) => v !== 0);
  if (iou < TH.iouWarn || (moved && sh.some((v) => Math.abs(v) > 1))) r.add('NG', `表情違いの輪郭が基本の顔とずれている（IoU ${(iou * 100).toFixed(2)}%、外枠のずれ ${JSON.stringify(sh)}）`, '基本の顔を下敷きにして、目・眉・口・頬だけを描き変えてください（輪郭は1pxも動かさない）');
  else if (iou < TH.iouOk || moved) r.add('注意', `輪郭が少し違う（IoU ${(iou * 100).toFixed(2)}%、外枠のずれ ${JSON.stringify(sh)}）`, '輪郭が1pxもずれないようにしてください');
  if (ov) { const x = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) x[i] = a[i] !== b[i] ? 1 : 0; tintMask(ov, x, C.out, 1); }
}
function checkFaceColors(r, im, info) {
  const cs = colorStats(im);
  r.metrics.mainColors = cs.clusters.slice(0, 5).map((c) => `${rgb2hex(c.rgb)} ${(c.n / Math.max(1, cs.n) * 100).toFixed(1)}%`);
  r.metrics.color = { skin: compareColor(r, cs, '肌', RIG_SKIN_BASE[info.g]) };
  const eye = compareColor(r, cs, '瞳', EYE_BASE, false);
  r.metrics.color.eye = eye;
  const shut = info.expr === 'blink' || info.expr === 'happy' || info.expr === 'hurt';
  if (!shut && eye.share < 0.15 && !(eye.dE < TH.colorWarnDE)) r.add('注意', `瞳の基準色 ${EYE_BASE} がほとんど無い（近い画素 ${eye.share}%）`, `瞳は ${EYE_BASE} で塗ってください`);
  // 顔の絵に髪の色の画素（髪 #b07850 の濃淡: 色相 ±14°・彩度 0.2〜0.75・明度 0.2〜0.62）
  const HH = rgb2hsl(hex2rgb(HAIR_BASE));
  let hair = 0, tot = 0;
  const hm = new Uint8Array(im.w * im.h);
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] < 200) continue;
    tot++;
    const [h, s, l] = rgb2hsl([im.data[i], im.data[i + 1], im.data[i + 2]]);
    if (hueDiff(h, HH[0]) < 14 && s > 0.2 && s < 0.75 && l > 0.2 && l < 0.62) { hair++; hm[i >> 2] = 1; }
  }
  const ratio = tot ? hair / tot : 0;
  r.metrics.hairColoredPx = hair; r.metrics.hairColoredRatio = +(ratio * 100).toFixed(2);
  if (ratio >= TH.hairInFaceNg) r.add('NG', `顔の絵に髪の色の画素がある（${hair}px・${(ratio * 100).toFixed(1)}%）`, '顔には髪を1本も描かないでください（頭頂も肌で塗る）');
  else if (ratio >= TH.hairInFaceWarn) r.add('注意', `顔の絵に髪の色に近い画素が少しある（${hair}px・${(ratio * 100).toFixed(2)}%）`, '眉なら問題なし。髪なら消してください');
  return hm;
}
function checkHairOnFace(r, hairIm, faceIm, faceName, ov) {
  const hm = maskOf(hairIm, 128), fm = maskOf(faceIm, 128), W = faceIm.w;
  const fb = bboxOf(fm, W, faceIm.h);
  if (!fb) return null;
  const crownY = 300, sideY = HEAD_PY;
  let crown = 0, crownOut = 0, side = 0, upper = 0;
  const bad = new Uint8Array(fm.length);
  for (let y = fb.y0; y < Math.min(sideY, faceIm.h); y++) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (hm[y * W + x]) { if (a < 0) a = x; b = x; }
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!fm[i]) continue;
      upper++;
      if (y < crownY) { crown++; if (!hm[i]) { crownOut++; bad[i] = 1; } }
      if (a >= 0 && (x < a || x > b)) { side++; bad[i] = 1; }
    }
  }
  const cr = crown ? crownOut / crown : 0, sr = upper ? side / upper : 0;
  const o = { face: faceName, crownUncovered: +(cr * 100).toFixed(1), sideSkinOutside: +(sr * 100).toFixed(1) };
  if (cr >= TH.crownNg) r.add('NG', `${faceName} に重ねると、頭頂（y<${crownY}）の肌が前髪から ${(cr * 100).toFixed(0)}% 出ている`, '頭頂の丸みと生え際まで髪で覆ってください（face/f_01.png を下敷きに）');
  else if (cr >= TH.crownWarn) r.add('注意', `${faceName} に重ねると、頭頂（y<${crownY}）の肌が前髪から ${(cr * 100).toFixed(0)}% 出ている`, '生え際の位置を顔の下敷きに合わせてください');
  if (sr >= TH.sideSkinWarn) r.add('注意', `${faceName} に重ねると、こめかみ・耳の上（y<${sideY}）で肌が前髪の外側に ${(sr * 100).toFixed(1)}% 出ている`, '髪の幅を頭の輪郭に合わせてください（耳は出してよい）');
  if (ov) tintMask(ov, bad, C.out, 0.8);
  return o;
}

// ---------------------------------------------------------------- 本体
function parseArgs(argv) {
  const a = { input: null, out: null, install: false, video: true, root: ROOT, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--out') a.out = argv[++i];
    else if (v === '--install') a.install = true;
    else if (v === '--no-video') a.video = false;
    else if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--quiet') a.quiet = true;
    else if (!a.input) a.input = v;
  }
  return a;
}
const loadPng = (f) => readPng(fs.readFileSync(f));
const safeName = (rel) => rel.replace(/\.png$/i, '').replace(/[\\/]/g, '_');

export async function checkArt(args) {
  const log = args.quiet ? () => {} : (...m) => console.log(...m);
  if (!args.input || !fs.existsSync(args.input)) throw new Error('ZIP かフォルダを指定してください: node tools/check_art.mjs <zip|dir> [--out dir] [--install]');
  const input = path.resolve(args.input);
  const isZip = fs.statSync(input).isFile();
  const name = path.basename(input).replace(/\.zip$/i, '');
  const outDir = path.resolve(args.out || path.join(ROOT, 'tests', 'art_check', name));
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^(overlay_.*\.png|report\.md|result\.json|preview.*\.(mp4|png))$/.test(f)) fs.rmSync(path.join(outDir, f));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'art_check_'));
  let src = input;
  try {
    if (isZip) { src = path.join(work, 'zip'); fs.mkdirSync(src); execFileSync('unzip', ['-o', '-qq', input, '-d', src]); }
    const files = collect(src);
    log(`対象: ${files.length} 枚（${isZip ? 'ZIP' : 'フォルダ'} ${input}）`);
    // 依頼書の一覧（第1弾＋第2弾）。第2弾は敵・NPC用の顔と服（タンクトップは胴だけ、など描く枠も読む）
    const cat = {};
    for (const f of [CATALOG_MD, CATALOG02_MD]) if (fs.existsSync(f)) { const c2 = parseCatalog(fs.readFileSync(f, 'utf8')); for (const k in c2) if (!cat[k]) cat[k] = c2[k]; }
    if (fs.existsSync(CATALOG03_CSV)) Object.assign(cat, parseCatalog03(fs.readFileSync(CATALOG03_CSV, 'utf8')));
    const repoSpr = path.join(args.root, 'assets', 'sprites');
    const imgs = new Map();
    const get = (rel) => {
      if (imgs.has(rel)) return imgs.get(rel);
      const f = files.find((x) => x.rel === rel);
      let im = null;
      try { if (f) im = loadPng(f.abs); else if (fs.existsSync(path.join(repoSpr, rel))) { im = loadPng(path.join(repoSpr, rel)); im.fromRepo = true; } } catch { im = null; }
      imgs.set(rel, im);
      return im;
    };
    const results = [];
    for (const f of files) {
      const info = classify(f.rel);
      const r = mkRes(f.rel, info);
      results.push(r);
      let im;
      try { im = get(f.rel); if (!im) throw new Error('読めません'); } catch (e) { r.add('NG', 'PNG として読めない: ' + e.message, 'PNG で保存し直してください'); continue; }
      const c = cat[f.rel] || null;
      if (Object.keys(cat).length && !c && info.kind !== 'body' && info.kind !== 'head' && !(ENV_KINDS.has(info.kind) && (info.v != null || info.bad))) r.add('注意', `ファイル名が依頼書（${ENV_KINDS.has(info.kind) ? 'CODEX_BATCH_03.md' : 'CODEX_BATCH_01.md'}）の一覧にありません`, '保存先とファイル名を依頼書の表のとおりにしてください');
      if (ENV_KINDS.has(info.kind)) {
        // 背景・地面/足場・アイコン・乗り物・UI
        const ok = checkEnv(r, im, info, c, { colorStats, compareColor });
        if (ok) { const ov = envOverlay(im, info, { checker, drawOver, hline, vline, cross, C }); if (ov) { const of = `overlay_${safeName(f.rel)}.png`; fs.writeFileSync(path.join(outDir, of), writePng(ov)); r.overlay = of; } }
        continue;
      }
      if (info.kind === 'other' || info.bad) { r.add('NG', 'ファイルの場所・名前の形がゲームの決まりに合わない（rig/<種類>/<スタイル>_<f|m>.png・heads/face/<f|m>_<番号>.png 等）', '依頼書の保存先のとおりにしてください'); continue; }
      const W = info.kind === 'weapon' ? WPN_W : info.kind === 'face' || info.kind === 'hair' || info.kind === 'head' ? HEAD_W : 1024;
      const H = info.kind === 'weapon' ? WPN_H : info.kind === 'face' || info.kind === 'hair' || info.kind === 'head' ? HEAD_H : 1024;
      checkSizeAlpha(r, im, W, H);
      if (im.w !== W || im.h !== H) continue;
      let ov = null;
      if (info.kind === 'body' || info.kind === 'wear') {
        const body = info.kind === 'wear' ? get(`rig/body_${info.g}.png`) : null;
        ov = checker(im.w, im.h);
        if (body && body.w === im.w) { drawOver(ov, dimmed(body), 1); }
        drawOver(ov, im, info.kind === 'wear' ? 0.92 : 1);
        const used = checkBoxes(r, im, info, c, ov);
        if (info.kind === 'wear' && !body) r.add('注意', `素体 rig/body_${info.g}.png が無いので、素体との重なりは比べていません`);
        if (info.slot !== 'hat' && info.slot !== 'accessory') checkJoints(r, im, info, used, body && body.w === im.w ? body : null, ov);
        if (info.kind === 'wear' && body && body.w === im.w && ['top', 'bottom', 'shoes', 'tear'].includes(info.slot)) checkOverlap(r, im, info, used, body, ov);
        if (info.slot !== 'tear') checkColors(r, im, info, c);
        for (const k of Object.keys(RIG_PARTS)) { const p = RIG_PARTS[k]; const on = used.allow.includes(k); rect(ov, p.x, p.y, p.w, p.h, on ? C.box : C.boxOff, on ? 0.9 : 0.5, on ? 2 : 1, on ? 0 : 6); cross(ov, p.px, p.py, 10, C.pivot, 2); }
        if (body) r.metrics.body = body.fromRepo ? `assets/sprites/rig/body_${info.g}.png（リポジトリ）` : `rig/body_${info.g}.png（この納品物）`;
      } else if (info.kind === 'weapon') {
        ov = checker(im.w, im.h); drawOver(ov, im);
        checkWeapon(r, im, ov);
        checkColors(r, im, info, c);
      } else if (info.kind === 'face') {
        ov = checker(im.w, im.h);
        const baseIm = info.expr ? get(`heads/face/${info.id}.png`) : null;
        if (info.expr && baseIm) { drawOver(ov, dimmed(baseIm), 0.6); drawOver(ov, im, 0.85); } else drawOver(ov, im);
        checkHeadPos(r, im, info);
        const hm = checkFaceColors(r, im, info);
        tintMask(ov, hm, [255, 140, 0], 0.7);
        if (info.expr) { checkExpr(r, im, baseIm, ov); if (baseIm) r.metrics.baseFace = baseIm.fromRepo ? 'リポジトリ' : 'この納品物'; }
        headGuides(ov);
      } else if (info.kind === 'hair') {
        ov = checker(im.w, im.h);
        checkHeadPos(r, im, info);
        const faceRels = [...new Set([...files.map((x) => x.rel), ...listRepoFaces(repoSpr)])].filter((x) => new RegExp(`^heads/face/${info.g}_\\d+\\.png$`).test(x)).sort();
        const faces = faceRels.map((x) => [x, get(x)]).filter(([, x]) => x && x.w === im.w && x.h === im.h);
        if (info.back) {
          drawOver(ov, im);
          if (faces[0]) drawOver(ov, faces[0][1], 0.9);
          const front = get(`heads/hair/${info.key}.png`);
          if (front && front.w === im.w) drawOver(ov, front, 0.9);
        } else {
          if (faces[0]) drawOver(ov, faces[0][1]);
          drawOver(ov, im, 0.85);
          r.metrics.onFaces = [];
          if (!faces.length) r.add('注意', `同じ性別の顔（heads/face/${info.g}_01.png など）が無いので、生え際の合い方は比べていません`);
          faces.forEach(([rel, fi], i) => { const o = checkHairOnFace(r, im, fi, rel.replace(/^heads\//, ''), i === 0 ? ov : null); if (o) r.metrics.onFaces.push(o); });
        }
        const cs = colorStats(im);
        r.metrics.mainColors = cs.clusters.slice(0, 5).map((x) => `${rgb2hex(x.rgb)} ${(x.n / Math.max(1, cs.n) * 100).toFixed(1)}%`);
        r.metrics.color = { hair: compareColor(r, cs, '髪', HAIR_BASE) };
        headGuides(ov);
      } else if (info.kind === 'head') {
        ov = checker(im.w, im.h); drawOver(ov, im);
        if (info.back) { const fr = get(`heads/${info.cls}_${info.g}.png`); if (fr && fr.w === im.w) drawOver(ov, fr, 0.9); }
        checkHeadPos(r, im, info);
        const cs = colorStats(im);
        r.metrics.mainColors = cs.clusters.slice(0, 5).map((x) => `${rgb2hex(x.rgb)} ${(x.n / Math.max(1, cs.n) * 100).toFixed(1)}%`);
        r.add('メモ', '1枚の頭（旧方式 heads/<クラス>_<性別>.png）。大きさ・透明・位置の数値だけ確認');
        headGuides(ov);
      }
      if (ov) { const of = `overlay_${safeName(f.rel)}.png`; fs.writeFileSync(path.join(outDir, of), writePng(ov)); r.overlay = of; }
    }
    // 依頼書の段階の抜け（同じ段階で他が入っているのに無い表情・後ろ髪）
    const rels = new Set(files.map((x) => x.rel));
    const missing = [];
    for (const f of files) {
      const i = classify(f.rel);
      if (i.kind === 'face' && !i.expr) for (const e of EXPRS) if (!rels.has(`heads/face/${i.id}_${e}.png`) && !fs.existsSync(path.join(repoSpr, `heads/face/${i.id}_${e}.png`))) missing.push(`heads/face/${i.id}_${e}.png`);
      if (i.kind === 'hair' && !i.back && !rels.has(`heads/hair/${i.key}_back.png`) && !fs.existsSync(path.join(repoSpr, `heads/hair/${i.key}_back.png`))) missing.push(`heads/hair/${i.key}_back.png`);
    }
    // ゲーム内の見た目（キャラ以外: 背景・地面・アイコン一覧・乗り物のスクリーンショット）
    let envPreview = null;
    const envFiles = files.filter((f) => ENV_KINDS.has(classify(f.rel).kind) && !classify(f.rel).bad);
    if (args.video && envFiles.length) {
      try { envPreview = await renderEnvPreview({ files: envFiles, results, outDir, root: args.root, log }); } catch (e) { envPreview = { error: e.message }; log('プレビューを作れませんでした: ' + e.message); }
    }
    // ゲーム内の見た目
    let video = null;
    if (args.video && files.length && files.length > envFiles.length) {
      try { video = await renderPreview({ files, outDir, root: args.root, cat, log }); } catch (e) { video = { error: e.message }; log('動画を作れませんでした: ' + e.message); }
    }
    // 入れる
    let installed = null;
    if (args.install) installed = install({ results, files, root: args.root, cat, log });
    const report = buildReport({ name, input, results, video, envPreview, installed, missing, catalogN: Object.keys(cat).length });
    fs.writeFileSync(path.join(outDir, 'report.md'), report);
    const json = { name, input, results: results.map((r) => ({ rel: r.rel, kind: r.info.kind, verdict: r.verdict, items: r.items, metrics: r.metrics, overlay: r.overlay })), video, envPreview, installed, missing };
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(json, null, 2));
    const cnt = { OK: 0, '注意': 0, NG: 0 };
    for (const r of results) cnt[r.verdict]++;
    log(`結果: OK ${cnt.OK} / 注意 ${cnt['注意']} / NG ${cnt.NG}`);
    for (const r of results) log(`  ${r.verdict.padEnd(2, '　')} ${r.rel}${r.verdict !== 'OK' ? ' — ' + r.items.filter((x) => x.level === r.verdict)[0].msg : ''}`);
    log(`出力: ${path.relative(process.cwd(), outDir) || outDir}/report.md${video && video.mp4 ? '・' + video.mp4 : ''}`);
    return { outDir, results: json.results, counts: cnt, video, envPreview, installed };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
function listRepoFaces(spr) {
  const d = path.join(spr, 'heads', 'face');
  return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.endsWith('.png')).map((n) => 'heads/face/' + n) : [];
}

// ---------------------------------------------------------------- report.md
function buildReport({ name, input, results, video, envPreview, installed, missing, catalogN }) {
  const cnt = { OK: 0, '注意': 0, NG: 0 };
  for (const r of results) cnt[r.verdict]++;
  const KIND = { body: '素体', wear: '服・装備', weapon: '武器', face: '顔', hair: '髪', head: '1枚の頭', other: '不明', bg: '背景', tile: '地面・足場', icon: 'アイコン', vehicle: '乗り物', wheel: 'タイヤ', ui: 'タイトル・地図' };
  const L = [];
  L.push(`# 納品画像の検査: ${name}`, '');
  L.push(`- 入力: \`${input}\``, `- 日時: ${new Date().toISOString().replace('T', ' ').slice(0, 16)}（UTC）`, `- 結果: **OK ${cnt.OK} / 注意 ${cnt['注意']} / NG ${cnt.NG}**（全 ${results.length} 枚。依頼書の一覧 ${catalogN} 枚と照合）`, '');
  if (video) {
    if (video.mp4) L.push(`- ゲーム内の見た目（右向き・立ち → 歩き2周 → 攻撃 → 被弾。左 = そのまま、右 = 骨つき）: [${video.mp4}](${video.mp4})・コマ並べ [${video.sheet}](${video.sheet})`);
    if (video.cases) for (const c of video.cases) L.push(`  - ${c}`);
    if (video.notes) for (const n of video.notes) L.push(`  - 注: ${n}`);
    if (video.error) L.push(`- 動画: 作れませんでした（${video.error}）`);
    L.push('');
  }
  if (envPreview) {
    if (envPreview.shots) L.push('- ゲーム内の見た目（キャラ以外）: ' + envPreview.shots.map((s) => `[${s}](${s})`).join('・'));
    if (envPreview.notes) for (const n of envPreview.notes) L.push(`  - 注: ${n}`);
    if (envPreview.error) L.push(`- プレビュー: 作れませんでした（${envPreview.error}）`);
    L.push('');
  }
  if (missing.length) { L.push('**同じ段階で足りないファイル**（表情4枚・後ろ髪）:', ...missing.map((m) => `- \`${m}\``), ''); }
  L.push('| ファイル | 種類 | 判定 | 主な理由 |', '|---|---|---|---|');
  for (const r of results) {
    const top = r.items.filter((x) => x.level === r.verdict && LV[x.level] > 0).map((x) => x.msg);
    L.push(`| \`${r.rel}\` | ${KIND[r.info.kind] || r.info.kind} | ${r.verdict === 'NG' ? '**NG**' : r.verdict} | ${top.length ? top.slice(0, 2).join(' / ').replace(/\|/g, '｜') + (top.length > 2 ? ` ほか${top.length - 2}件` : '') : '—'} |`);
  }
  L.push('');
  L.push('オーバーレイの色: 緑の枠 = 描く枠 / 灰の点線 = 描かない枠 / 黄の十字 = 支点 / 橙の線 = 肘・膝（支点から72px下）と前後±24px / 赤 = 枠の外・素体からのはみ出し（16px より外）・表情の輪郭の差・前髪から出た肌 / 水色 = 服の横や穴から見える素体 / 橙の塗り（顔）= 髪の色に近い画素 / 水色の線（頭）= 頭頂 y=220・目 y=450（点線）・顎 y=560', '');
  for (const r of results) {
    L.push(`## ${r.verdict === 'NG' ? '❌' : r.verdict === '注意' ? '⚠️' : '✅'} \`${r.rel}\` — ${r.verdict}`, '');
    if (r.overlay) L.push(`![${r.overlay}](${r.overlay})`, '');
    const probs = r.items.filter((x) => LV[x.level] > 0);
    for (const it of r.items) L.push(`- **${it.level}** ${it.msg}${it.fix ? `\n  - 直し方: ${it.fix}` : ''}`);
    if (!probs.length) L.push('- 問題は見つかりませんでした');
    const m = r.metrics, lines = [];
    if (m.size) lines.push(`大きさ ${m.size}・不透明 ${m.opaqueRatio}%・外周の透明率 ${m.borderTransparent}%`);
    if (m.boxPx) lines.push('枠ごとの画素: ' + Object.entries(m.boxPx).filter(([, v]) => v).map(([k, v]) => `${PART_JA[k]} ${v}`).join('・') + `（枠の外 ${m.outsidePx}・余白 ${m.marginPx}）`);
    if (m.joints) for (const [k, j] of Object.entries(m.joints)) lines.push(`関節 ${PART_JA[k]}: y=${j.jointY}±${TH.jointWin} の幅 ${j.minW}〜${j.maxW}px、最大の急変 ${j.worstStep}%${j.at != null ? `（y=${j.at} ${j.from}→${j.to}px）` : ''}`);
    if (m.overlap) for (const [k, o] of Object.entries(m.overlap)) lines.push(`素体との重なり ${PART_JA[k]}: 服 ${o.clothPx}px のうち素体の外 ${o.outsideBodyPx}px・16px より外 ${o.farRatio}%（最大 ${o.maxDist}px）・穴 ${o.holePx}px${o.sideGapRows || o.innerGapPx ? `・横から素体 ${o.sideGapRows}行/${o.sideGapPx}px・内側の隙間 ${o.innerGapPx}px` : ''}`);
    if (m.body) lines.push(`比べた素体: ${m.body}`);
    if (m.color) for (const [k, c] of Object.entries(m.color)) lines.push(`色 ${k}: 基準 ${c.base} → 近い主な色 ${c.nearest || '-'}（ΔE ${c.dE ?? '-'}${c.hueDiff != null ? `・色相 ${c.hueDiff}°` : ''}・明度 ${c.lightDiff ?? '-'}%）・基準色に近い画素 ${c.share}%`);
    if (m.mainColors) lines.push('主な色: ' + m.mainColors.join('・'));
    if (m.grip) lines.push(`持ち手の印: (${m.grip.x},${m.grip.y})・基準 (${WPN_BOX.px},${WPN_BOX.py}) から ${m.grip.dist}px・${m.gripPx}px`);
    if (m.bbox) lines.push(`絵の範囲: x ${m.bbox.x0}〜${m.bbox.x1}・y ${m.bbox.y0}〜${m.bbox.y1}（中心 x=${m.bbox.cx}。支点 (${HEAD_PX},${HEAD_PY})・頭頂 y=${HEAD_PY + HEAD_GUIDE.top * HEAD_S}・顎 y=${HEAD_PY + HEAD_GUIDE.chin * HEAD_S}）`);
    if (m.exprIoU != null) lines.push(`基本の顔との輪郭の一致 IoU ${m.exprIoU}%・外枠のずれ ${JSON.stringify(m.bboxShift)}`);
    if (m.hairColoredRatio != null) lines.push(`髪の色に近い画素 ${m.hairColoredPx}px（${m.hairColoredRatio}%）`);
    if (m.seam) lines.push(`左右の継ぎ目: 右端と左端の列の差 ${m.seam.seam}（絵の中の隣の列の差 平均 ${m.seam.base}）`);
    if (m.skyOpaque != null) lines.push(`空（上 48 行）の不透明 ${m.skyOpaque}%`);
    if (m.belowGroundOpaque != null) lines.push(`地面の線より下（y=648〜）の不透明 ${m.belowGroundOpaque}%`);
    if (m.footCoverage != null) lines.push(`建物の足元（y=620〜639）の不透明 ${m.footCoverage}%・不透明が半分を切る行 y=${m.footY ?? '-'}`);
    if (m.surfaceY !== undefined) lines.push(`面の線（横の 90% 以上が埋まる最初の行）y=${m.surfaceY ?? '-'}（正しくは ${m.surfaceWant}）・線より上の不透明 ${m.aboveOpaque}%${m.solidBelow != null ? `・断面の不透明 ${m.solidBelow}%` : ''}`);
    if (m.lightsLightness != null) lines.push(`あかりの明るさ ${m.lightsLightness}%`);
    if (m.fill != null) lines.push(`不透明 ${m.fill}%（スキルは正方形いっぱい）`);
    if (m.markers) lines.push(`マゼンタの印: ${m.markers.map((x) => `(${x.x},${x.y}) ${x.px}px`).join('・') || 'なし'}${m.wheelAreaOpaque ? `・タイヤの所の不透明 ${m.wheelAreaOpaque.join('%・')}%` : ''}`);
    if (m.wheel) lines.push(`タイヤ: 中心 (${m.wheel.cx},${m.wheel.cy})・${m.wheel.w}×${m.wheel.h}px`);
    if (m.onFaces) for (const o of m.onFaces) lines.push(`${o.face} と重ねる: 頭頂の肌が出る ${o.crownUncovered}%・こめかみで外に出る肌 ${o.sideSkinOutside}%`);
    if (lines.length) L.push('', '<details><summary>数値</summary>', '', ...lines.map((x) => '- ' + x), '', '</details>');
    L.push('');
  }
  if (installed) {
    L.push('## 組み込み（--install）', '');
    L.push(`- コピーした画像 ${installed.copied.length} 枚: ${installed.copied.map((x) => '`' + x + '`').join('・') || 'なし'}`);
    if (installed.skipped.length) L.push(`- NG のため入れなかった: ${installed.skipped.map((x) => '`' + x + '`').join('・')}`);
    L.push(`- rig_manifest.mjs: ${installed.rigManifest}`);
    if (installed.faces.length || installed.hairs.length) L.push(`- manifest に書いた faces: ${installed.faces.join(', ') || 'なし'} / hairs: ${installed.hairs.join(', ') || 'なし'}`);
    if (installed.bases.length) L.push(`- rig.parts に基準色を書いた: ${installed.bases.join(', ')}`);
    if (installed.env && installed.env.length) L.push(`- manifest の bg / tiles / icons / vehicles / ui に書いた: ${installed.env.join(', ')}`);
    L.push('');
  }
  L.push('## 閾値', '', '```json', JSON.stringify(TH), '```', '');
  return L.join('\n');
}

// ---------------------------------------------------------------- --install
function install({ results, files, root, cat, log }) {
  const spr = path.join(root, 'assets', 'sprites');
  const copied = [], skipped = [];
  for (const r of results) {
    if (r.verdict === 'NG' || r.info.kind === 'other') { skipped.push(r.rel); continue; }
    const f = files.find((x) => x.rel === r.rel);
    const dst = path.join(spr, r.rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f.abs, dst);
    copied.push(r.rel);
  }
  let rigManifest = '実行せず（rig の画像なし）';
  if (copied.some((x) => x.startsWith('rig/'))) {
    const p = spawnSync(process.execPath, [path.join(root, 'tools', 'rig_manifest.mjs')], { cwd: root, encoding: 'utf8' });
    rigManifest = p.status === 0 ? 'OK' : '失敗: ' + (p.stderr || p.stdout).trim().split('\n').pop();
    log('rig_manifest.mjs: ' + rigManifest);
  }
  const manPath = path.join(spr, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  // RIG_BASE に無いスタイル（または依頼書の色が違う物）: rig.parts に base / accent
  const bases = [];
  if (man.rig && man.rig.parts) for (const rel of copied) {
    const i = classify(rel);
    if (i.kind !== 'wear' && i.kind !== 'weapon') continue;
    const key = rel.slice(4, -4);
    const c = cat[rel] && cat[rel].colors;
    const d = RIG_BASE[i.slot] && RIG_BASE[i.slot][i.style];
    if (!c || (d && d[0] === c[0] && (!c[1] || d[1] === c[1])) || i.variant) continue;
    const old = man.rig.parts[key];
    const o = old && typeof old === 'object' ? old : { file: typeof old === 'string' ? old : `rig/${key}.png` };
    if (!o.base) o.base = c[0];
    if (!o.accent && c[1]) o.accent = c[1];
    man.rig.parts[key] = o; bases.push(key);
  }
  // faces / hairs（assets/sprites/heads/face・hair/ にある物を全部）
  const faces = [], hairs = [];
  const fd = path.join(spr, 'heads', 'face'), hd = path.join(spr, 'heads', 'hair');
  if (copied.some((x) => /^heads\/(face|hair)\//.test(x))) {
    man.faces = man.faces && typeof man.faces === 'object' ? man.faces : {};
    man.hairs = man.hairs && typeof man.hairs === 'object' ? man.hairs : {};
    if (fs.existsSync(fd)) for (const n of fs.readdirSync(fd).sort()) {
      const m = /^([fm]_(?:\d+|v\d+|o\d+|don))\.png$/.exec(n);   // 番号の顔＋NPC・敵専用（悪役・老人・ドン）
      if (!m) continue;
      const id = m[1], old = man.faces[id] && typeof man.faces[id] === 'object' ? man.faces[id] : {};
      const expr = { ...(old.expr || {}) };
      for (const e of EXPRS) if (fs.existsSync(path.join(fd, `${id}_${e}.png`))) expr[e] = `heads/face/${id}_${e}.png`;
      man.faces[id] = { ...old, file: `heads/face/${id}.png`, ...(Object.keys(expr).length ? { expr } : {}) };
      faces.push(id);
    }
    if (fs.existsSync(hd)) {
      const keys = new Set(fs.readdirSync(hd).map((n) => /^([fm]_[A-Za-z0-9]+?)(_back)?\.png$/.exec(n)).filter(Boolean).map((m) => m[1]));
      for (const k of [...keys].sort()) {
        const old = man.hairs[k] && typeof man.hairs[k] === 'object' ? man.hairs[k] : {};
        const o = { ...old };
        if (fs.existsSync(path.join(hd, `${k}.png`))) o.file = `heads/hair/${k}.png`;
        if (fs.existsSync(path.join(hd, `${k}_back.png`))) o.back = `heads/hair/${k}_back.png`;
        if (!o.base) o.base = HAIR_BASE;
        man.hairs[k] = o; hairs.push(k);
      }
    }
    if (!man.faceBase) man.faceBase = { skin: { ...RIG_SKIN_BASE }, eye: EYE_BASE };
  }
  // 背景・地面/足場・アイコン・乗り物・UI: manifest の節に "キー": "パス"（bg/beach_town_far.png → bg.beach_town_far）
  const env = [];
  for (const rel of copied) {
    const k = envManifestKey(rel);
    if (!k || !ENV_KINDS.has(classify(rel).kind)) continue;
    const [sec, key] = k;
    man[sec] = man[sec] && typeof man[sec] === 'object' && !Array.isArray(man[sec]) ? man[sec] : {};
    const old = man[sec][key];
    man[sec][key] = old && typeof old === 'object' ? { ...old, file: rel } : rel;
    env.push(`${sec}.${key}`);
  }
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + '\n');
  log(`組み込み: ${copied.length} 枚コピー、NG で除外 ${skipped.length} 枚`);
  return { copied, skipped, rigManifest, faces, hairs, bases, env };
}

// ---------------------------------------------------------------- ゲーム内の見た目（動画・コマ並べ）
async function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
  try { return await import('playwright'); } catch { /* fallthrough */ }
  const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'));
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright が見つかりません');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
/** プレビュー用の manifest と、描く組み合わせ（cases） */
export function previewPlan(files, root, cat) {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'sprites', 'manifest.json'), 'utf8'));
  const rig = man.rig && typeof man.rig === 'object' ? JSON.parse(JSON.stringify(man.rig)) : { enabled: true, fit: false, layout: 2, defaultWear: false };
  const parts = rig.parts && typeof rig.parts === 'object' && !Array.isArray(rig.parts) ? rig.parts : {};
  const items = { f: { top: [], bottom: [], shoes: [], hat: [], accessory: [] }, m: { top: [], bottom: [], shoes: [], hat: [], accessory: [] } };
  const weapons = [];
  const faces = { f: [], m: [] }, hairs = { f: [], m: [] };
  man.faces = man.faces && typeof man.faces === 'object' ? man.faces : {};
  man.hairs = man.hairs && typeof man.hairs === 'object' ? man.hairs : {};
  const rels = new Set(files.map((f) => f.rel));
  for (const f of files) {
    const i = classify(f.rel);
    const c = cat[f.rel] && cat[f.rel].colors;
    if (i.kind === 'body') parts[`body_${i.g}`] = true;
    if (i.kind === 'wear' && i.slot !== 'tear' && !i.bad) {
      const key = f.rel.slice(4, -4), d = (RIG_BASE[i.slot] && RIG_BASE[i.slot][i.style]) || null;
      const col = i.variant ? [i.variant, d ? d[1] : '#ffffff'] : c || d || ['#cccccc', '#ffffff'];
      parts[key] = !d || (c && c[0] !== d[0]) ? { base: col[0], ...(col[1] ? { accent: col[1] } : {}) } : true;
      items[i.g][i.slot].push({ style: i.style, color: col[0], accent: col[1] || col[0], key });
    }
    if (i.kind === 'weapon') {
      const key = f.rel.slice(4, -4), d = RIG_BASE.weapon[i.style] || null;
      const col = i.variant ? [i.variant, d ? d[1] : '#ffffff'] : c || d || ['#cccccc', '#ffffff'];
      parts[key] = !d || (c && c[0] !== d[0]) ? { base: col[0], accent: col[1] || col[0] } : true;
      weapons.push({ style: i.style, color: col[0], accent: col[1] || col[0], key });
    }
    if (i.kind === 'face' && !i.expr) {
      const expr = {};
      for (const e of EXPRS) if (rels.has(`heads/face/${i.id}_${e}.png`) || fs.existsSync(path.join(root, 'assets', 'sprites', `heads/face/${i.id}_${e}.png`))) expr[e] = `heads/face/${i.id}_${e}.png`;
      man.faces[i.id] = { file: f.rel, expr };
      faces[i.g].push(i.id);
    }
    if (i.kind === 'hair') {
      const o = man.hairs[i.key] && typeof man.hairs[i.key] === 'object' ? man.hairs[i.key] : { base: HAIR_BASE };
      if (i.back) o.back = f.rel; else o.file = f.rel;
      if (!o.base) o.base = HAIR_BASE;
      man.hairs[i.key] = o;
      if (!hairs[i.g].includes(i.id)) hairs[i.g].push(i.id);
    }
    if (i.kind === 'head' && !i.back) { const k = `${i.cls}_${i.g}`; if (!man.heads || !man.heads[k]) { man.heads = man.heads || {}; man.heads[k] = { file: f.rel, ...(rels.has(`heads/${k}_back.png`) ? { back: `heads/${k}_back.png` } : {}) }; } }
  }
  rig.parts = parts;
  rig.enabled = true;
  man.rig = rig;
  if (!man.faceBase) man.faceBase = { skin: { ...RIG_SKIN_BASE }, eye: EYE_BASE };
  const hasBody = (g) => rels.has(`rig/body_${g}.png`) || fs.existsSync(path.join(root, 'assets', 'sprites', `rig/body_${g}.png`));
  const cases = [], notes = [];
  for (const g of ['f', 'm']) {
    const its = items[g], touched = Object.values(its).some((a) => a.length) || faces[g].length || hairs[g].length || rels.has(`rig/body_${g}.png`) || [...rels].some((r) => new RegExp(`^heads/[a-z]+_${g}(_back)?\\.png$`).test(r));
    const wTouched = weapons.length && g === 'f' && !cases.length;
    if (!touched && !wTouched) continue;
    if (!hasBody(g)) notes.push(`${g === 'f' ? '♀' : '♂'}の素体 rig/body_${g}.png が無いので、${g === 'f' ? '♀' : '♂'}はコードの体で描いています（服の絵は使われません）`);
    const n = Math.min(3, Math.max(1, ...Object.values(its).map((a) => a.length), weapons.length));
    for (let k = 0; k < n; k++) {
      const eq = {};
      for (const s of Object.keys(its)) if (its[s].length) { const it = its[s][k % its[s].length]; eq[s] = { style: it.style, color: it.color, accent: it.accent }; }
      if (weapons.length) { const w = weapons[k % weapons.length]; eq.weapon = { style: w.style, color: w.color, accent: w.accent }; }
      const lk = { cls: 'luna', g };
      if (faces[g].length) lk.face = faces[g][k % faces[g].length];
      const hs = hairs[g].filter((id) => man.hairs[`${g}_${id}`] && man.hairs[`${g}_${id}`].file);
      if (hairs[g].length) lk.hair = (hs.length ? hs : hairs[g])[k % (hs.length ? hs : hairs[g]).length];
      const label = [g === 'f' ? '♀' : '♂', ...Object.values(eq).map((e) => e.style), lk.face, lk.hair].filter(Boolean).join(' ');
      cases.push({ label: label + '（基準色）', look: lk, base: true, equip: eq });
      if (faces[g].length || hairs[g].length) cases.push({ label: label + '（ルナの色）', look: lk, base: false, equip: eq });
    }
  }
  return { manifest: man, cases: cases.slice(0, 4), notes };
}
async function renderPreview({ files, outDir, root, cat, log }) {
  const plan = previewPlan(files, root, cat);
  if (!plan.cases.length) return { notes: ['描く組み合わせがありません'] };
  const byRel = new Map(files.map((f) => [f.rel, f.abs]));
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__art/assets/sprites/manifest.json') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(plan.manifest)); return; }
    let f;
    if (u.startsWith('/__art/assets/sprites/')) { const rel = u.slice('/__art/assets/sprites/'.length); f = byRel.get(rel) || path.join(root, 'assets', 'sprites', rel); }
    else f = path.join(ROOT, u);
    if (!path.resolve(f).startsWith(path.resolve(ROOT)) && !byRel.has(u.slice('/__art/assets/sprites/'.length)) && !path.resolve(f).startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const fdir = fs.mkdtempSync(path.join(os.tmpdir(), 'art_frames_'));
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/tests/art_preview.html`);
    await page.waitForFunction(() => window.ARTPREV && window.ARTPREV.ready, null, { timeout: 20000 });
    const st = await page.evaluate(([cases]) => window.ARTPREV.setup('/__art/assets/sprites/manifest.json', cases), [plan.cases]);
    const N = await page.evaluate(() => window.ARTPREV.frameCount());
    log(`動画: ${plan.cases.length} 組 × ${N} コマ…`);
    for (let i = 0; i < N; i++) {
      const url = await page.evaluate((i) => window.ARTPREV.frame(i), i);
      fs.writeFileSync(path.join(fdir, `f_${String(i).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    const sheet = await page.evaluate(() => window.ARTPREV.sheet());
    fs.writeFileSync(path.join(outDir, 'preview_frames.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    const fps = await page.evaluate(() => window.ARTPREV.FPS);
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fdir, 'f_%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', path.join(outDir, 'preview.mp4')], { encoding: 'utf8' });
    if (ff.status !== 0) throw new Error('ffmpeg: ' + ff.stderr);
    const notes = [...plan.notes, ...st.notes, ...errs.map((e) => 'ページのエラー: ' + e)];
    return { mp4: 'preview.mp4', sheet: 'preview_frames.png', frames: N, cases: plan.cases.map((c) => c.label), notes, stats: st.stats };
  } finally {
    await browser.close();
    srv.close();
    fs.rmSync(fdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- ゲーム内の見た目（キャラ以外）
// 納品物を manifest の bg / tiles / icons / vehicles / ui に足して tests/art_env_preview.html を開き、ゲームの描画関数で描いたスクショを出す
//   preview_env_bg.png（地域ごと 夕方・夜。背景＋地面・足場）/ preview_env_icons.png / preview_env_vehicles.png / preview_env_ui.png
async function renderEnvPreview({ files, results, outDir, root, log }) {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'sprites', 'manifest.json'), 'utf8'));
  const sizeNg = new Set(results.filter((r) => r.items.some((it) => it.level === 'NG' && /^大きさ|PNG として読めない/.test(it.msg))).map((r) => r.rel));
  const use = files.filter((f) => !sizeNg.has(f.rel));
  const kinds = new Set();
  for (const f of use) {
    const k = envManifestKey(f.rel); if (!k) continue;
    man[k[0]] = man[k[0]] && typeof man[k[0]] === 'object' ? man[k[0]] : {};
    man[k[0]][k[1]] = f.rel;
    kinds.add(k[0] === 'tiles' ? 'bg' : k[0]);
  }
  if (!kinds.size) return { notes: ['描ける画像がありません（大きさが違う物は描きません）'] };
  const byRel = new Map(use.map((f) => [f.rel, f.abs]));
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__art/assets/sprites/manifest.json') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(man)); return; }
    let f;
    if (u.startsWith('/__art/assets/sprites/')) { const rel = u.slice('/__art/assets/sprites/'.length); f = byRel.get(rel) || path.join(root, 'assets', 'sprites', rel); }
    else f = path.join(ROOT, u);
    const rp = path.resolve(f);
    if (!byRel.has(u.slice('/__art/assets/sprites/'.length)) && !rp.startsWith(path.resolve(ROOT)) && !rp.startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/tests/art_env_preview.html`);
    await page.waitForFunction(() => window.ARTENV && window.ARTENV.ready, null, { timeout: 20000 });
    const st = await page.evaluate(() => window.ARTENV.setup('/__art/assets/sprites/manifest.json'));
    const shots = [];
    for (const k of ['bg', 'icons', 'vehicles', 'ui']) {
      if (!kinds.has(k)) continue;
      const url = await page.evaluate((k) => window.ARTENV.sheet(k), k);
      if (!url) continue;
      const fn = `preview_env_${k}.png`;
      fs.writeFileSync(path.join(outDir, fn), Buffer.from(url.split(',')[1], 'base64'));
      shots.push(fn);
    }
    log(`プレビュー（キャラ以外）: ${shots.join('・')}`);
    const notes = [...(st.stats.errors || []), ...errs.map((e) => 'ページのエラー: ' + e)];
    return { shots, notes, stats: { loaded: st.stats.loaded, failed: st.stats.failed } };
  } finally {
    await browser.close();
    srv.close();
  }
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  checkArt(args).then((r) => process.exit(r.counts.NG ? 1 : 0)).catch((e) => { console.error('エラー: ' + (e.stack || e.message)); process.exit(2); });
}
