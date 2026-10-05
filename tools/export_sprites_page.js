// tools/export_sprites.mjs がブラウザ（Playwright）内で読み込むモジュール。
// ゲームの描画関数を呼んで「今のコード描画の絵」を SPEC_SPRITES.md のコマ割りでシートにし、PNG(base64) を返す。
// 単体では使わない（window.EXPORT.jobs() / window.EXPORT.run(job) を Node 側が呼ぶ）。
import { drawCharacter, charHeadPose, HAIR_STYLES, itemColors } from '../src/render/character.js';
import { drawEnemy, setEnemyArtExport } from '../src/render/enemyArt.js';
import { drawPet, PET_STYLES } from '../src/render/pets.js';
import { ART2_SIZE } from '../src/render/monsters2.js';
import { ENEMIES } from '../src/data/enemies.js';
import { DEFAULT_LOOKS, CLASS_IDS } from '../src/data/classes.js';
import { starterEquipFor, looksFromIds } from '../src/data/items.js';

setEnemyArtExport(true);

const RES = 2;     // ゲーム内表示の2倍で描く（manifest の scale 0.5 で等倍表示）
const PAD = 4;

// ------------------------------------------------------------ 行（状態）とコマ数
export const CHAR_ROWS = [['idle', 6], ['walk', 8], ['jump', 2], ['climb', 4], ['attack', 6], ['shoot', 4], ['hurt', 2], ['dead', 4], ['drive', 1], ['sit', 1]];
const ATK_ROWS = [['attack_melee', 6], ['attack_magic', 6]];
export const CHAR_FPS = { default: 8, idle: 2.5, walk: 13.333, jump: 1.667, climb: 4.444, drive: 1, sit: 1 };
const FACE_ROWS = [['neutral', 1], ['smile', 1], ['shout', 1], ['hurt', 1], ['happy', 1], ['jito', 1], ['angry', 1], ['sad', 1], ['wink', 1], ['blink', 1], ['dead', 1], ['aim', 1], ['panic', 1]];
const ENEMY_ROWS = [['idle', 4], ['walk', 6], ['windup', 2], ['attack', 4], ['hurt', 2], ['dead', 4]];
const BOSS_ROWS2 = [['idle2', 4], ['walk2', 6], ['windup2', 2], ['attack2', 4]];
const PET_ROWS = [['idle', 4], ['walk', 6], ['fly', 4], ['pick', [4, 11.46]]];
const ENEMY_FPS = 8;

const STYLES = {
  hat: ['cap', 'beanie', 'bandana', 'headphones', 'crown', 'helmet', 'cowboy', 'catEars'],
  top: ['tshirt', 'hoodie', 'leatherJacket', 'suit', 'hawaiian', 'tank', 'police', 'tracksuit', 'idolDress', 'armorVest'],
  bottom: ['jeans', 'shorts', 'cargo', 'skirt', 'suitPants', 'trackPants', 'armorPants'],
  shoes: ['sneakers', 'boots', 'sandals', 'loafers', 'heels'],
  accessory: ['sunglasses', 'goldChain', 'mask', 'scarf', 'wings', 'halo'],
  weapon: ['bat', 'knife', 'katana', 'pistol', 'smg', 'guitar', 'neonSword', 'staff'],
};
const WK_REP = { melee: 'bat', gun: 'pistol', magic: 'staff' };
const WKS = ['none', 'melee', 'gun', 'magic'];
const GLOOK = { f: DEFAULT_LOOKS.luna.f, m: DEFAULT_LOOKS.jin.m };
const HUMAN_ARTS = { thug: 1, cop: 1, swat: 1, bossDon: 1 };
const ART_BASE = Object.assign({ slime: [40, 32], mushroom: [44, 48], flamingo: [40, 70], gator: [92, 40], bossGator: [180, 80], drone: [44, 30] }, ART2_SIZE);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ キャンバス
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
function bbox(ctx, W, H) {
  const d = new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let rowHit = false;
    for (let x = 0; x < W; x++) {
      if (d[o + x] >>> 24 > 2) {          // ほぼ透明なにじみは無視
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        rowHit = true;
      }
    }
    if (rowHit) { if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
const nrows = (rows) => rows.map(([name, v]) => ({ name, n: Array.isArray(v) ? v[0] : v, fps: Array.isArray(v) ? v[1] : 0 }));

/**
 * rows のコマを draw(ctx, rowName, i, n) で描いてシートにする。
 * scratch: [W, H, ox, oy]（作業キャンバスと原点=足元の位置。2x 座標）
 * 戻り値: { sheet, cell, anchor, rows, warn } / 全部空なら null
 */
function buildSheet(rows, draw, scratch, fixed) {
  const R = nrows(rows);
  const [W, H, ox, oy] = scratch;
  const warn = [];
  if (fixed) {
    // 同じレイアウトで描く（グレースケール版）
    const { cell, anchor } = fixed;
    const cols = Math.max(...R.map((r) => r.n));
    const sheet = canvas(cell[0] * cols, cell[1] * R.length);
    const g = sheet.getContext('2d');
    R.forEach((r, ri) => {
      for (let i = 0; i < r.n; i++) {
        g.save();
        g.beginPath(); g.rect(i * cell[0], ri * cell[1], cell[0], cell[1]); g.clip();
        g.setTransform(RES, 0, 0, RES, i * cell[0] + anchor[0], ri * cell[1] + anchor[1]);
        try { draw(g, r.name, i, r.n); } catch (e) { warn.push(`${r.name}[${i}] ${e.message}`); }
        g.restore();
      }
    });
    return { sheet, cell, anchor, rows: R, warn };
  }
  const sc = canvas(W, H);
  const g = sc.getContext('2d', { willReadFrequently: true });
  const frames = [];
  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  R.forEach((r, ri) => {
    for (let i = 0; i < r.n; i++) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      g.setTransform(RES, 0, 0, RES, ox, oy);
      try { draw(g, r.name, i, r.n); } catch (e) { warn.push(`${r.name}[${i}] ${e.message}`); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      const b = bbox(g, W, H);
      if (!b) continue;
      if (b.x0 === 0 || b.y0 === 0 || b.x1 === W || b.y1 === H) warn.push(`${r.name}[${i}] 作業領域の端に接触（切れている可能性）`);
      const c = canvas(b.x1 - b.x0, b.y1 - b.y0);
      c.getContext('2d').drawImage(sc, b.x0, b.y0, c.width, c.height, 0, 0, c.width, c.height);
      const dx = b.x0 - ox, dy = b.y0 - oy;
      frames.push({ ri, i, c, dx, dy });
      ux0 = Math.min(ux0, dx); uy0 = Math.min(uy0, dy); ux1 = Math.max(ux1, dx + c.width); uy1 = Math.max(uy1, dy + c.height);
    }
  });
  if (!frames.length) return null;
  // 足元(0,0)は必ずセル内に含める
  ux0 = Math.min(ux0, -8); ux1 = Math.max(ux1, 8); uy1 = Math.max(uy1, 8);
  const x0 = Math.floor(ux0) - PAD, y0 = Math.floor(uy0) - PAD;
  const cw = Math.ceil((ux1 - x0 + PAD) / 8) * 8, ch = Math.ceil((uy1 - y0 + PAD) / 8) * 8;
  const anchor = [-x0, -y0];
  const cols = Math.max(...R.map((r) => r.n));
  const sheet = canvas(cw * cols, ch * R.length);
  const sg = sheet.getContext('2d');
  for (const f of frames) sg.drawImage(f.c, f.i * cw + anchor[0] + f.dx, f.ri * ch + anchor[1] + f.dy);
  return { sheet, cell: [cw, ch], anchor, rows: R, warn };
}

function toGray(sheet) {
  const c = canvas(sheet.width, sheet.height);
  const g = c.getContext('2d');
  g.drawImage(sheet, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(id, 0, 0);
  return c;
}

/** ガイド線入り版: セル枠・足元の基準点（十字）・行名ラベル */
function guide(res, fpsOf) {
  const { sheet, cell, anchor, rows } = res;
  const c = canvas(sheet.width, sheet.height);
  const g = c.getContext('2d');
  g.drawImage(sheet, 0, 0);
  const cols = Math.round(sheet.width / cell[0]);
  rows.forEach((r, ri) => {
    const y = ri * cell[1];
    for (let i = 0; i < cols; i++) {
      const x = i * cell[0];
      const used = i < r.n;
      g.strokeStyle = used ? 'rgba(25,240,255,0.9)' : 'rgba(25,240,255,0.25)'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, cell[0] - 1, cell[1] - 1);
      if (!used) continue;
      // 基準線（地面）と基準点
      g.strokeStyle = 'rgba(255,61,210,0.45)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x + 2, y + anchor[1] + 0.5); g.lineTo(x + cell[0] - 2, y + anchor[1] + 0.5); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = '#ff3dd2'; g.lineWidth = 1.5;
      const ax = x + anchor[0], ay = y + anchor[1];
      g.beginPath(); g.moveTo(ax - 7, ay); g.lineTo(ax + 7, ay); g.moveTo(ax, ay - 7); g.lineTo(ax, ay + 7); g.stroke();
      g.font = '9px monospace'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + cell[0] - 16, y + 2, 14, 11);
      g.fillStyle = '#fff'; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(String(i), x + cell[0] - 4, y + 3);
    }
    const label = `${r.name} ×${r.n}${fpsOf ? ' ' + fpsOf(r) + 'fps' : ''}`;
    g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    const w = g.measureText(label).width + 8;
    g.fillStyle = 'rgba(20,10,40,0.78)'; g.fillRect(2, y + 2, w, 15);
    g.fillStyle = '#ffe27a'; g.fillText(label, 6, y + 4);
  });
  return c;
}
const b64 = (c) => c.toDataURL('image/png').split(',')[1];

// ------------------------------------------------------------ 人型
function rowAnim(row, i, n) {
  const st = row.split('_')[0];
  const p = (i + 0.5) / n;
  if (st === 'attack' || st === 'shoot') return { state: st, t: 0, attackT: p };
  if (st === 'hurt') return { state: st, t: p / 6 };
  if (st === 'dead') return { state: st, t: 0, fallT: p };
  const fps = CHAR_FPS[st] || CHAR_FPS.default;
  return { state: st, t: (i + 0.5) / fps };
}
function rowWeapon(row, wk) {
  if (wk && wk !== 'none') return WK_REP[wk];
  if (row === 'shoot') return 'pistol';
  if (row === 'attack_melee') return 'bat';
  if (row === 'attack_magic') return 'staff';
  return null;
}
const CHAR_SCRATCH = [680, 620, 280, 480];
function grayLook(look) { return { ...look, skin: '#ffffff', hairColor: '#ffffff', hairShadow: undefined, hairHi: undefined, hairTip: undefined }; }
function grayHair(look) { return { ...look, hairColor: '#ffffff', hairShadow: undefined, hairHi: undefined, hairTip: undefined }; }
function graySkin(look) { return { ...look, skin: '#ffffff' }; }

/** 人型レイヤーのシート。spec: { g, layers, look?, equip, rows, wk?, weapon?, tint, gray } */
function charLayerSheet(spec, grayMode, fixed) {
  const look0 = spec.look || GLOOK[spec.g];
  const look = !grayMode ? look0 : spec.tint === 'skin' ? graySkin(look0) : spec.tint === 'hairColor' ? grayHair(look0) : look0;
  const draw = (ctx, row, i, n) => {
    const a = rowAnim(row, i, n);
    const eq = { ...(spec.equip || {}) };
    if (grayMode && spec.tint === 'color' && spec.slot && eq[spec.slot]) eq[spec.slot] = { ...eq[spec.slot], color: '#ffffff' };
    const ws = spec.weapon || rowWeapon(row, spec.wk);
    if (ws && !eq.weapon) eq.weapon = { style: ws };
    if (grayMode && spec.slot === 'weapon') eq.weapon = { ...eq.weapon, color: '#ffffff' };
    drawCharacter(ctx, 0, 0, look, eq, { ...a, facing: 1, scale: 1, damage: spec.damage || 0, noCache: true, noSprite: true, onlyLayers: spec.layers || null, noErase: spec.noErase });
  };
  return buildSheet(spec.rows, draw, CHAR_SCRATCH, fixed);
}

function inv(m) {
  const [a, b, c, d, e, f] = m, det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
const FACE_ANIM = {
  neutral: { state: 'idle', t: 0.2 }, smile: { state: 'cheer', t: 0.3 }, shout: { state: 'idle', t: 0.2, face: 'shout' },
  hurt: { state: 'hurt', t: 0.1 }, happy: { state: 'idle', t: 0.2, face: 'happy' }, jito: { state: 'idle', t: 0.2, face: 'jito' },
  angry: { state: 'idle', t: 0.2, face: 'angry' }, sad: { state: 'idle', t: 0.2, face: 'sad' }, wink: { state: 'idle', t: 0.2, face: 'wink' },
  blink: { state: 'idle', t: 3.9 }, dead: { state: 'dead', t: 0, fallT: 1 }, aim: { state: 'shoot', t: 0, attackT: 0.5, gun: 1 },
  panic: { state: 'walk', t: 0.1, panic: true },
};
function faceSheet(g, look0) {
  const look = look0 || GLOOK[g];
  const draw = (ctx, row) => {
    const a = FACE_ANIM[row];
    const eq = a.gun ? { weapon: { style: 'pistol' } } : {};
    const anim = { ...a, facing: 1, scale: 1, noCache: true, noSprite: true, onlyLayers: ['face'], noErase: true };
    const m = inv(charHeadPose(look, eq, anim).m);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    drawCharacter(ctx, 0, 0, look, eq, anim);
  };
  return buildSheet(FACE_ROWS, draw, [240, 240, 120, 120]);
}

// ------------------------------------------------------------ 敵・ボス
function enemyDims(def) {
  const art = def.art || 'slime';
  let w = def.w || 40, h = def.h || 40;
  if (HUMAN_ARTS[art] || art === 'civilian') {
    const sc = def.scale || clamp(h / 72, 0.8, 2.2);
    return { w: 40 * sc, h: 82 * sc, human: true };
  }
  const base = ART_BASE[art];
  if (def.scale && base) { w = base[0] * def.scale; h = base[1] * def.scale; }
  return { w, h, human: false };
}
function mkEnemy(id, row, i, n) {
  const def = ENEMIES[id];
  const rage = /2$/.test(row);
  const base = rage ? row.slice(0, -1) : row;
  const boss = !!def.boss || def.ai === 'boss';
  const maxHp = def.hp || 100;
  const e = {
    def, defId: id, id, name: def.name, x: 0, y: 0, w: def.w || 40, h: def.h || 40, vx: 0, vy: 0,
    state: 'idle', t: i / ENEMY_FPS + 0.01, hurtT: 0, deadT: 0, dead: false, facing: 1, hp: rage ? maxHp * 0.3 : maxHp, maxHp,
    onGround: true, flying: def.ai === 'flyer', boss, phase: null, hasActed: true, alpha: 1, seed: 1234567, showHpT: 0,
  };
  if (base === 'walk') e.state = 'walk';
  else if (base === 'windup') { e.state = 'attack'; e.phase = 'windup'; e.hasActed = false; }
  else if (base === 'attack') { e.state = 'attack'; e.phase = 'active'; }
  else if (base === 'hurt') { e.state = 'hurt'; e.hurtT = 0.05; }
  else if (base === 'dead') { e.state = 'dead'; e.dead = true; e.deadT = ((i + 0.5) / n) / 3; }
  return e;
}
function enemySheet(id) {
  const def = ENEMIES[id];
  const boss = !!def.boss || def.ai === 'boss';
  const rows = boss ? [...ENEMY_ROWS, ...BOSS_ROWS2] : ENEMY_ROWS;
  const d = enemyDims(def);
  const side = Math.max(400, Math.ceil(Math.max(d.w, d.h) * RES * 2.6));
  const res = buildSheet(rows, (ctx, row, i, n) => drawEnemy(ctx, mkEnemy(id, row, i, n)), [side, side, side / 2, Math.round(side * 0.78)]);
  return { res, boss, size: [Math.round(d.w * 100) / 100, Math.round(d.h * 100) / 100], human: d.human, civilian: !!def.civilian };
}

// ------------------------------------------------------------ ジョブ
function jobs(only) {
  const J = [];
  const want = (k) => !only || !only.length || only.includes(k);
  if (want('chars')) {
    const base = [...CHAR_ROWS, ...ATK_ROWS];
    for (const g of ['f', 'm']) {
      J.push({ kind: 'char', key: `body_${g}`, file: `chars/body_${g}`, g, layers: ['body_main'], rows: base, tint: 'skin' });
      for (const wk of WKS) J.push({ kind: 'char', key: `arm_${g}${wk === 'none' ? '' : '@' + wk}`, file: `chars/arm_${g}${wk === 'none' ? '' : '__' + wk}`, g, layers: ['arm'], rows: CHAR_ROWS, wk, tint: 'skin' });
      J.push({ kind: 'face', key: `face_${g}`, file: `chars/face_${g}`, g });
      // クラスの既定の見た目（目の色・目つき）ごとの顔（face_<g>@<目の色> が優先して使われる）
      const seen = new Set([GLOOK[g].eyeColor.toLowerCase()]);
      for (const cls of CLASS_IDS) {
        const lk = DEFAULT_LOOKS[cls][g];
        const ec = (lk.eyeColor || '').toLowerCase();
        if (!ec || seen.has(ec)) continue;
        seen.add(ec);
        J.push({ kind: 'face', key: `face_${g}@${ec.slice(1)}`, file: `chars/face_${g}__${ec.slice(1)}`, g, look: lk });
      }
      for (const h of HAIR_STYLES.map((x) => x.id)) {
        const look = { ...GLOOK[g], hair: h };
        J.push({ kind: 'char', key: `hair:${h}_back_${g}`, file: `chars/hair/${h}_back_${g}`, g, look, layers: ['hair_back'], rows: base, tint: 'hairColor' });
        J.push({ kind: 'char', key: `hair:${h}_front_${g}`, file: `chars/hair/${h}_front_${g}`, g, look, layers: ['hair_front'], rows: base, tint: 'hairColor' });
      }
      for (const slot of ['top', 'bottom', 'shoes', 'hat', 'accessory']) {
        const list = [...STYLES[slot], ...(slot === 'top' || slot === 'bottom' || slot === 'shoes' ? ['_default'] : [])];
        for (const st of list) {
          const def = st === '_default';
          const equip = def ? {} : { [slot]: { style: st } };
          const tint = def ? null : 'color';
          const main = slot === 'top' ? ['top_main'] : slot === 'accessory' ? ['accessory_front'] : [slot];
          J.push({ kind: 'char', key: `${slot}:${st}_${g}`, file: `chars/equip/${slot}/${st}_${g}`, g, equip, slot, layers: main, rows: base, tint });
          if (slot === 'accessory') J.push({ kind: 'char', key: `${slot}:${st}_back_${g}`, file: `chars/equip/${slot}/${st}_back_${g}`, g, equip, slot, layers: ['accessory_back'], rows: base, tint });
          if (slot === 'top') {
            for (const wk of WKS) J.push({ kind: 'char', key: `top:${st}_sleeve_${g}${wk === 'none' ? '' : '@' + wk}`, file: `chars/equip/top/${st}_sleeve_${g}${wk === 'none' ? '' : '__' + wk}`, g, equip, slot, layers: ['sleeve'], rows: CHAR_ROWS, wk, tint });
          }
        }
      }
      for (const ws of STYLES.weapon) J.push({ kind: 'char', key: `weapon:${ws}_${g}`, file: `chars/equip/weapon/${ws}_${g}`, g, equip: { weapon: { style: ws } }, slot: 'weapon', weapon: ws, layers: ['weapon'], rows: CHAR_ROWS, tint: 'color' });
      [0.3, 0.55, 0.8].forEach((dm, k) => J.push({ kind: 'char', key: `tear_${k + 1}_${g}`, file: `chars/tear_${k + 1}_${g}`, g, layers: ['tear'], rows: base, damage: dm, tint: null }));
    }
  }
  if (want('presets')) {
    for (const cls of CLASS_IDS) for (const g of ['f', 'm']) {
      J.push({ kind: 'char', preset: true, key: `${cls}_${g}`, file: `presets/${cls}_${g}`, g, look: DEFAULT_LOOKS[cls][g], equip: looksFromIds(starterEquipFor(cls, g)), layers: null, rows: CHAR_ROWS, tint: null });
    }
  }
  if (want('enemies')) for (const id of Object.keys(ENEMIES)) J.push({ kind: 'enemy', key: id });
  if (want('pets')) for (const st of PET_STYLES) J.push({ kind: 'pet', key: st, file: `pets/${st}` });
  return J;
}

function out(res, file, withGuide, fpsOf) {
  const files = [{ path: file + '.png', b64: b64(res.sheet) }];
  if (withGuide) files.push({ path: file + '_guide.png', b64: b64(guide(res, fpsOf)) });
  return files;
}
const rowsObj = (R) => Object.fromEntries(R.map((r) => [r.name, r.fps ? [r.n, r.fps] : r.n]));

function run(job, opts = {}) {
  const guides = opts.guides !== false;
  if (job.kind === 'char') {
    const res = charLayerSheet(job, false);
    if (!res) return { files: [], entry: null, empty: true };
    const charFps = (r) => CHAR_FPS[r.name.split('_')[0]] || CHAR_FPS.default;
    const files = out(res, job.file, guides, charFps);
    let file = job.file + '.png';
    if (job.tint) {
      const gr = charLayerSheet(job, true, { cell: res.cell, anchor: res.anchor });
      const gsheet = toGray(gr.sheet);
      files.push({ path: job.file + '_gray.png', b64: b64(gsheet) });
      if (guides && opts.grayGuides) files.push({ path: job.file + '_gray_guide.png', b64: b64(guide({ ...res, sheet: gsheet }, charFps)) });
      file = job.file + '_gray.png';
    }
    const entry = { file, cell: res.cell, anchor: res.anchor, rows: rowsObj(res.rows) };
    if (job.tint) {
      entry.tint = job.tint;
      // 色まで描いた版（カラー）と、その色。ゲーム内の色が同じならカラー版をそのまま使う
      const lk = job.look || GLOOK[job.g];
      const pc = job.tint === 'skin' ? lk.skin : job.tint === 'hairColor' ? lk.hairColor : job.slot ? itemColors((job.equip || {})[job.slot] || { style: job.weapon })[0] : null;
      if (pc) { entry.plain = job.file + '.png'; entry.plainColor = pc; }
    }
    return { files, entry, section: job.preset ? null : 'chars', warn: res.warn };
  }
  if (job.kind === 'face') {
    const res = faceSheet(job.g, job.look);
    return { files: out(res, job.file, guides, null), entry: { file: job.file + '.png', cell: res.cell, anchor: res.anchor, rows: rowsObj(res.rows), fps: 1, head: true }, section: 'chars', warn: res.warn };
  }
  if (job.kind === 'enemy') {
    const r = enemySheet(job.key);
    if (!r.res) return { files: [], entry: null, empty: true };
    const dir = r.boss ? 'bosses' : 'enemies';
    const file = `${dir}/${job.key}`;
    const entry = { file: file + '.png', cell: r.res.cell, anchor: r.res.anchor, rows: rowsObj(r.res.rows), fps: ENEMY_FPS, size: r.size };
    return { files: out(r.res, file, guides, () => ENEMY_FPS), entry, section: r.civilian ? null : dir, warn: r.res.warn, civilian: r.civilian };
  }
  if (job.kind === 'pet') {
    const res = buildSheet(PET_ROWS, (ctx, row, i, n) => {
      const R = nrows(PET_ROWS).find((x) => x.name === row);
      drawPet(ctx, 0, 0, { style: job.key }, { t: i / (R.fps || ENEMY_FPS) + 0.01, state: row, noShadow: true, noFx: true, facing: 1, scale: 1 });
    }, [320, 320, 160, 250]);
    return { files: out(res, job.file, guides, (r) => r.fps || ENEMY_FPS), entry: { file: job.file + '.png', cell: res.cell, anchor: res.anchor, rows: rowsObj(res.rows), fps: ENEMY_FPS }, section: 'pets', warn: res.warn };
  }
  return { files: [], entry: null };
}

window.EXPORT = { jobs, run, CHAR_ROWS: [...CHAR_ROWS, ...ATK_ROWS], CHAR_FPS, ready: true };
