// 差し替えスプライト（外部で描いた PNG で見た目を上書き。仕様: docs/SPEC_SPRITES.md）
//  - main 起動時に loadSpriteManifest() を1回。assets/sprites/manifest.json が無い/壊れている → 全部コード描画。
//  - 画像は最初に必要になった時に Image で読み込み（遅延）。読み込み完了まではコード描画のまま。
//  - drawEnemy / drawPet / drawCharacter の入口から呼ばれ、描けたら true（呼び出し側はコード描画をしない）。
//  - spriteMode: 'auto'（スプライトがあれば使う）| 'procedural'（常にコード描画）。デバッグパネル（F2）で切替。
//  - パスはすべて相対（公開ページ・サブディレクトリ配信でも動く）。
import { charHeadPose, itemColors, SPRITE_LAYER_ORDER } from './character.js';

export const SPRITE_BASE = 'assets/sprites/';
const DEF_SCALE = 0.5, DEF_FPS = 8;

let MAN = null;                 // 正規化済み manifest（null = スプライト無し）
let BASE = SPRITE_BASE;
let MODE = 'auto';
let REV = 0;                    // 画像の読み込み完了・モード切替で +1（アイコン等のキャッシュキー用）
const IMG = new Map();          // file → { img, st: 1 読込中 / 2 完了 / 3 失敗, w, h }
const STATS = { manifest: 'none', entries: 0, requested: 0, loaded: 0, failed: 0, errors: [] };

try { const m = typeof localStorage !== 'undefined' && localStorage.getItem('nvs_sprite_mode'); if (m === 'procedural' || m === 'auto') MODE = m; } catch { /* ignore */ }

// ================================================================ 公開 API
export function getSpriteMode() { return MODE; }
export function setSpriteMode(m) {
  MODE = m === 'procedural' ? 'procedural' : 'auto';
  REV++;
  try { localStorage.setItem('nvs_sprite_mode', MODE); } catch { /* ignore */ }
  return MODE;
}
export function toggleSpriteMode() { return setSpriteMode(MODE === 'auto' ? 'procedural' : 'auto'); }
/** 画像の読み込み・モードが変わるたびに増える番号（キャッシュの無効化用） */
export function spriteRev() { return REV; }
export function spriteStats() { return { mode: MODE, ...STATS, errors: STATS.errors.slice(-5), tintCache: TINT.size }; }
export function hasSpriteManifest() { return !!MAN; }

/** manifest.json を読み込む（失敗しても例外を投げない）。戻り値: 読み込めたら true */
export async function loadSpriteManifest(url = SPRITE_BASE + 'manifest.json') {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch なし');
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { STATS.manifest = 'broken'; note('manifest.json の JSON が壊れています: ' + e.message); MAN = null; return false; }
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    return setSpriteManifest(j, base);
  } catch (e) {
    MAN = null; STATS.manifest = 'none';
    return false;
  }
}

/** manifest を直接設定（テスト・ツール用）。不正な項目は無視する */
export function setSpriteManifest(j, base = SPRITE_BASE) {
  MAN = null; STATS.entries = 0; IMG.clear(); TINT.clear(); PLAIN.clear(); tintPx = 0; REV++;
  STATS.requested = STATS.loaded = STATS.failed = 0;
  if (!j || typeof j !== 'object' || Array.isArray(j)) { STATS.manifest = j == null ? 'none' : 'broken'; return false; }
  try {
    BASE = base;
    const d = j.defaults && typeof j.defaults === 'object' ? j.defaults : {};
    const defs = { scale: num(d.scale, DEF_SCALE), fps: d.fps != null ? d.fps : DEF_FPS };
    const M = { enemies: {}, bosses: {}, pets: {}, chars: null };
    for (const sec of ['enemies', 'bosses', 'pets']) {
      const src = j[sec];
      if (!src || typeof src !== 'object') continue;
      for (const k of Object.keys(src)) {
        const s = normSheet(src[k], {}, defs, k);
        if (s) { M[sec][k] = s; STATS.entries++; }
      }
    }
    const c = j.chars;
    if (c && typeof c === 'object' && c.layers && typeof c.layers === 'object') {
      const inh = { cell: c.cell, anchor: c.anchor, rows: c.rows, fps: c.fps, scale: c.scale };
      const layers = {};
      for (const k of Object.keys(c.layers)) {
        const s = normSheet(c.layers[k], inh, defs, k);
        if (s) { layers[k] = s; STATS.entries++; }
      }
      M.chars = { enabled: c.enabled !== false, layers };
    }
    MAN = M;
    STATS.manifest = 'ok';
    return true;
  } catch (e) {
    MAN = null; STATS.manifest = 'broken'; note('manifest の解釈に失敗: ' + e.message);
    return false;
  }
}

/** 全画像を先読み（テスト・スクショ用）。完了で解決 */
export function preloadSprites() {
  if (!MAN) return Promise.resolve(0);
  const all = [];
  for (const sec of ['enemies', 'bosses', 'pets']) for (const k in MAN[sec]) all.push(MAN[sec][k]);
  if (MAN.chars) for (const k in MAN.chars.layers) all.push(MAN.chars.layers[k]);
  return Promise.all(all.map((s) => new Promise((res) => {
    const r = img(s);
    if (!r || r.st !== 1) return res();
    r.wait.push(res);
  }))).then(() => STATS.loaded);
}

// ================================================================ 敵・ボス
const ROWS_ENEMY = { idle: ['idle'], walk: ['walk', 'fly'], jump: ['jump', 'walk', 'fly'], attack: ['attack'], hurt: ['hurt'], dead: ['dead'] };
const ROWS_FLY = { walk: ['fly', 'walk'], jump: ['fly', 'jump', 'walk'] };

function enemySheet(e, preferBoss) {
  if (!MAN || MODE !== 'auto') return null;
  const def = e.def || {};
  const id = def.id || e.defId || e.id;
  const art = def.art;
  const boss = preferBoss != null ? preferBoss : !!(def.boss || e.boss);
  return (boss && (MAN.bosses[id] || MAN.bosses[art])) || MAN.enemies[id] || (id && MAN.bosses[id]) || (art && MAN.enemies[art]) || null;
}
/** その敵のスプライトが読み込み済みか（未読込なら読み込みを始めて false） */
export function spriteEnemyReady(e, boss) {
  const s = enemySheet(e, boss);
  return !!(s && ready(s));
}
/**
 * 敵（ボス含む）をスプライトで描く。描けたら true。
 * info: { st, wind, rage, flash, boss, w, h, local }（drawEnemy が計算済みの値。省略時は e から推定）
 *  local=true … 呼び出し側で translate(e.x,e.y)＋向きの反転済み（原点=足元）
 */
export function drawSpriteEnemy(ctx, e, info) {
  try {
    const I = info || {};
    const s = enemySheet(e, I.boss);
    if (!s || !ready(s)) return false;
    if (s.single) return drawSingleEnemy(ctx, e, I, s);
    const st = I.st || (e.dead ? 'dead' : e.hurtT > 0 ? 'hurt' : e.state === 'attack' ? 'attack' : e.state === 'walk' ? 'walk' : 'idle');
    const fly = !!(e.flying || I.fly);
    let base = st === 'attack' && I.wind ? ['windup', 'attack'] : (fly && ROWS_FLY[st]) || ROWS_ENEMY[st] || [st];
    const cands = I.rage ? [...base.map((r) => r + '2'), ...base] : base;
    const row = pickRow(s, cands);
    if (!row) return false;
    const n = row.frames;
    let fi;
    if (st === 'dead') fi = Math.min(n - 1, Math.floor(clamp((e.deadT || 0) * 3, 0, 1) * n));
    else fi = loopFrame(s, row, e.t || 0);
    let k = 1;
    if (s.size && I.w > 0) k = I.w / s.size[0];
    const fx = e.facing < 0 ? -1 : 1;
    ctx.save();
    if (!I.local) { ctx.translate(e.x, e.y); ctx.scale(fx, 1); }
    ctx.scale(k * s.scale, k * s.scale);
    if (I.flash) drawFlashFrame(ctx, s, row, fi, null);
    else drawFrame(ctx, s, row, fi, null);
    ctx.restore();
    return true;
  } catch (err) { note('drawSpriteEnemy: ' + err.message); return false; }
}
/** ボス（bosses セクションを優先） */
export function drawSpriteBoss(ctx, e, info) { return drawSpriteEnemy(ctx, e, Object.assign({}, info, { boss: true })); }

// ================================================================ PET
export function spritePetReady(style) {
  if (!MAN || MODE !== 'auto') return false;
  const s = MAN.pets[style];
  return !!(s && ready(s));
}
/**
 * PET をスプライトで描く。描けたら true。anim.local=true なら呼び出し側で translate/向き/拡大済み。
 * look.style（例 catPet）。anim.state: idle|walk|fly|pick
 */
export function drawSpritePet(ctx, x, y, look, anim) {
  try {
    if (!MAN || MODE !== 'auto') return false;
    look = look || {}; anim = anim || {};
    const s = MAN.pets[look.style];
    if (!s || !ready(s)) return false;
    if (s.single) return drawSinglePet(ctx, x, y, anim, s);
    const raw = anim.state || 'idle';
    const st = raw === 'pick' ? 'pick' : (raw === 'walk' || raw === 'move' || anim.moving) ? 'walk' : raw === 'fly' ? 'fly' : 'idle';
    const row = pickRow(s, st === 'walk' ? ['walk', 'fly'] : st === 'fly' ? ['fly', 'walk'] : [st]);
    if (!row) return false;
    const fi = loopFrame(s, row, anim.t || 0);
    ctx.save();
    if (!anim.local) { const sc = anim.scale || 1; ctx.translate(x, y); ctx.scale((anim.facing < 0 ? -1 : 1) * sc, sc); }
    ctx.scale(s.scale, s.scale);
    if (anim.flash) drawFlashFrame(ctx, s, row, fi, null); else drawFrame(ctx, s, row, fi, null);
    ctx.restore();
    return true;
  } catch (err) { note('drawSpritePet: ' + err.message); return false; }
}

// ================================================================ 人型（重ね合わせ）
const WK_OF = (ws) => (!ws ? 'none' : ws === 'pistol' || ws === 'smg' ? 'gun' : ws === 'staff' ? 'magic' : 'melee');
const PROGRESS = { attack: 1, shoot: 1, hurt: 1, dead: 1 };
const FALLBACK = { jump: ['walk'], cheer: ['idle'], shoot: ['attack'], sit: ['drive', 'idle'], drive: ['sit', 'idle'], climb: ['idle'] };

function charLayer(L, keys) {
  for (const k of keys) { const s = L[k]; if (s) return s; }
  return null;
}
function rowCands(state, wk, extra) {
  const c = [];
  if (extra) for (const r of extra) c.push(r);
  if (wk !== 'none') c.push(state + '_' + wk);
  c.push(state);
  const fb = FALLBACK[state];
  if (fb) for (const r of fb) c.push(r);
  c.push('idle');
  return c;
}
function faceRows(state, A, dmg, vil) {
  if (state === 'dead') return ['dead', 'hurt', 'neutral'];
  if (A.panic) return ['panic', 'hurt', 'neutral'];
  if (A.face) return [A.face, 'neutral'];
  if (state === 'attack') return ['shout', 'angry', 'neutral'];
  if (state === 'shoot') return ['aim', 'angry', 'neutral'];
  if (state === 'hurt') return ['hurt', 'neutral'];
  if (state === 'cheer') return ['smile', 'happy', 'neutral'];
  if (vil) return ['angry', 'neutral'];
  if ((state === 'idle' || state === 'walk' || state === 'sit') && dmg >= 0.75) return ['sad', 'neutral'];
  if (state === 'idle' || state === 'sit') {
    const ph = (((A.t || 0) % 4.8) + 4.8) % 4.8;
    if (ph >= 3.82 && ph < 4.0) return ['blink', 'neutral'];
  }
  return ['neutral'];
}

/**
 * drawCharacter から: スプライトで描けるなら描画計画を返す（null ならコード描画）。
 * state/wk/ws は drawCharacter が解決済みの値。
 */
export function spriteCharPlan(look, equip, A, state, wk, ws) {
  if (!MAN || MODE !== 'auto' || !MAN.chars || !MAN.chars.enabled) return null;
  try {
    const L = MAN.chars.layers;
    const g = look.body === 'm' ? 'm' : 'f';
    const body = charLayer(L, ['body_' + g, 'body']);
    if (!body) return null;
    wk = wk || WK_OF(ws);
    const eq = equip || {};
    const dmg = clamp(A.damage || 0, 0, 1);
    const tear = dmg >= 0.75 ? 3 : dmg >= 0.5 ? 2 : dmg >= 0.25 ? 1 : 0;
    const vil = !!(look.villain || A.villain || (A.deadT !== undefined && !look.expr));
    const hs = look.hair || 'short';
    const sty = (slot) => eq[slot] && eq[slot].style;
    const slotKeys = (slot, suffix = '') => {
      const st = sty(slot);
      if (st) return [`${slot}:${st}${suffix}_${g}`, `${slot}:${st}${suffix}`];
      return slot === 'top' || slot === 'bottom' || slot === 'shoes' ? [`${slot}:_default${suffix}_${g}`, `${slot}:_default${suffix}`] : [];
    };
    const wkKeys = (keys) => (wk === 'none' ? keys : [...keys.map((k) => k + '@' + wk), ...keys]);
    const picks = [];
    let loading = false;
    for (const name of SPRITE_LAYER_ORDER) {
      let keys = null, tintSlot = null;
      switch (name) {
        case 'accessory_back': if (sty('accessory')) keys = slotKeys('accessory', '_back'); tintSlot = 'accessory'; break;
        case 'hair_back': keys = [`hair:${hs}_back_${g}`, `hair:${hs}_back`]; break;
        case 'body': keys = ['body_' + g, 'body']; break;
        case 'bottom': case 'shoes': case 'top': keys = slotKeys(name); tintSlot = name; break;
        case 'tear': if (tear) keys = [`tear_${tear}_${g}`, `tear_${tear}`]; break;
        case 'face': keys = [`face_${g}@${String(look.eyeColor || '').replace('#', '').toLowerCase()}`, 'face_' + g, 'face']; break;   // 目の色ごとの顔があれば優先
        case 'hair_front': keys = [`hair:${hs}_front_${g}`, `hair:${hs}_front`, `hair:${hs}_${g}`, `hair:${hs}`]; break;
        case 'accessory': case 'hat': if (sty(name)) keys = slotKeys(name); tintSlot = name; break;
        case 'arm': keys = wkKeys(['arm_' + g, 'arm']); break;
        case 'sleeve': keys = wkKeys(slotKeys('top', '_sleeve')); tintSlot = 'top'; break;
        case 'weapon': if (ws && state !== 'climb' && state !== 'drive') keys = [`weapon:${ws}_${g}`, `weapon:${ws}`]; tintSlot = 'weapon'; break;
      }
      if (!keys || !keys.length) continue;
      let s = null, key = null;
      for (const k of keys) if (L[k]) { s = L[k]; key = k; break; }
      if (!s) continue;
      const r = img(s);
      if (r.st === 1) { loading = true; continue; }   // 読み込み中 → 全部そろうまでコード描画
      if (r.st !== 2) continue;                       // 読み込み失敗 → そのレイヤーは描かない
      picks.push({ name, s, key, tintSlot });
    }
    if (loading || !picks.some((p) => p.name === 'body')) return null;
    // ---- 行とコマ（全レイヤー共通の基準 = body）
    const t = A.t || 0;
    let prog = 0;
    if (state === 'attack' || state === 'shoot') prog = clamp(A.attackT || 0, 0, 1);
    else if (state === 'hurt') prog = clamp(t * 6, 0, 1);
    else if (state === 'dead') prog = clamp(A.fallT != null ? A.fallT : A.deadT != null ? A.deadT : t * 3, 0, 1);
    const isProg = !!PROGRESS[state];
    const layers = [];
    let repT = t, repAT = clamp(A.attackT || 0, 0, 1), repP = prog, master = null;
    for (const p of picks) {
      const s = p.s;
      let row;
      if (p.name === 'face') row = pickRow(s, faceRows(state, A, dmg, vil));
      else row = pickRow(s, rowCands(state, wk, state === 'walk' && A.panic ? ['panic'] : null));
      if (!row) continue;
      const n = row.frames;
      const fi = isProg && p.name !== 'face' ? Math.min(n - 1, Math.floor(prog * n)) : loopFrame(s, row, t);
      if (p.name === 'body' && !master) {
        master = { row, fi };
        if (isProg) { repP = (fi + 0.5) / n; if (state === 'attack' || state === 'shoot') repAT = repP; else if (state === 'hurt') repT = repP / 6; }
        else repT = (fi + 0.5) / rowFps(s, row);
      }
      let tint = null, src = s;
      if (s.tint) tint = tintColor(s.tint, look, p.tintSlot ? eq[p.tintSlot] : null);
      if (tint && s.plain && s.plainColor === String(tint).toLowerCase()) {
        const ps = plainSheet(s);
        const r = img(ps);
        if (r.st === 2) { src = ps; tint = null; } else if (r.st === 1) return null;
      }
      layers.push({ name: p.name, s: src, row, fi, tint, head: null });
    }
    // 顔: 頭の座標系に合わせる（body と同じコマの姿勢）
    const fl = layers.find((l) => l.name === 'face');
    if (fl) {
      const hp = charHeadPose(look, eq, { state: A.state || state, t: repT, attackT: repAT, fallT: state === 'dead' ? repP : undefined, panic: A.panic });
      if (hp.back) layers.splice(layers.indexOf(fl), 1);
      else fl.head = hp.m;
    }
    return { layers, repT, repAT, facing: A.facing < 0 ? -1 : 1, s: A.scale || 1 };
  } catch (err) { note('spriteCharPlan: ' + err.message); return null; }
}

/** 計画どおりに重ねて描く（半透明・白フラッシュは一度オフスクリーンで合成） */
export function drawSpriteCharPlan(ctx, x, y, plan, A) {
  const alpha = A && A.alpha != null ? A.alpha : 1;
  const flash = !!(A && A.flash);
  if (alpha < 0.999 || flash) {
    const ok = composeScratch(plan.layers, flash);
    if (ok) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(plan.facing * plan.s, plan.s);
      if (alpha < 1) ctx.globalAlpha *= alpha;
      ctx.drawImage(ok.cv, 0, 0, ok.w, ok.h, ok.x0, ok.y0, ok.w / ok.R, ok.h / ok.R);
      ctx.restore();
      return;
    }
  }
  ctx.save();
  ctx.translate(x, y); ctx.scale(plan.facing * plan.s, plan.s);
  for (const l of plan.layers) drawLayer(ctx, l);
  ctx.restore();
}

/** 単独呼び出し用（テスト・ツール）。描けたら true */
export function drawSpriteCharacter(ctx, x, y, look, equip, anim) {
  const A = anim || {};
  equip = equip || {};
  const ws = equip.weapon && equip.weapon.style;
  const wk = WK_OF(ws);
  let state = A.state || 'idle';
  if (state === 'attack' && wk === 'gun') state = 'shoot';
  if (state === 'shoot' && wk !== 'gun') state = 'attack';
  const plan = spriteCharPlan(look || {}, equip, A, state, wk, ws);
  if (!plan) return false;
  drawSpriteCharPlan(ctx, x, y, plan, A);
  return true;
}

function drawLayer(ctx, l) {
  ctx.save();
  if (l.head) { const m = l.head; ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); }
  ctx.scale(l.s.scale, l.s.scale);
  drawFrame(ctx, l.s, l.row, l.fi, l.tint);
  ctx.restore();
}

// ---- 合成用オフスクリーン
let SC = null, SCX = null;
function composeScratch(layers, flash) {
  // 外接矩形（足元原点・scale 1 の単位）
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let R = 2;
  for (const l of layers) {
    const s = l.s, k = s.scale;
    R = Math.max(R, Math.min(4, 1 / k));
    const pts = [[-s.anchor[0] * k, -s.anchor[1] * k], [(s.cell[0] - s.anchor[0]) * k, -s.anchor[1] * k], [-s.anchor[0] * k, (s.cell[1] - s.anchor[1]) * k], [(s.cell[0] - s.anchor[0]) * k, (s.cell[1] - s.anchor[1]) * k]];
    for (const [px, py] of pts) {
      let X = px, Y = py;
      if (l.head) { const m = l.head; X = m[0] * px + m[2] * py + m[4]; Y = m[1] * px + m[3] * py + m[5]; }
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
  }
  if (!isFinite(x0)) return null;
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  const w = Math.ceil((x1 - x0) * R) + 2, h = Math.ceil((y1 - y0) * R) + 2;
  if (w > 4096 || h > 4096) return null;
  if (!SC) { SC = newCanvas(w, h); if (!SC) return null; SCX = SC.getContext('2d'); }
  if (SC.width < w || SC.height < h) { SC.width = Math.max(SC.width, w); SC.height = Math.max(SC.height, h); }
  const g = SCX;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  g.setTransform(R, 0, 0, R, -x0 * R, -y0 * R);
  for (const l of layers) drawLayer(g, l);
  if (flash) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  return { cv: SC, w, h, x0, y0, R };
}

// ================================================================ シート共通
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function arr2(v) { return Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1]) ? [+v[0], +v[1]] : null; }
function note(msg) { STATS.errors.push(msg); if (STATS.errors.length > 20) STATS.errors.shift(); if (typeof console !== 'undefined') console.warn('[sprites]', msg); }

function normSheet(o, inh, defs, key) {
  // 1枚絵モード: "slime_green": "enemies/slime_green.png" の文字列だけでも可
  if (typeof o === 'string') o = { file: o, single: true };
  if (o && typeof o === 'object' && o.single) return normSingle(o, key);
  if (!o || typeof o !== 'object' || typeof o.file !== 'string' || !o.file) return null;
  if (/^(?:[a-z]+:)?\/\//i.test(o.file) || o.file.includes('..')) { note(`${key}: file は assets/sprites/ からの相対パスにしてください`); return null; }
  const cell = arr2(o.cell) || arr2(inh.cell) || [160, 160];
  if (cell[0] < 1 || cell[1] < 1 || cell[0] > 4096 || cell[1] > 4096) return null;
  const anchor = arr2(o.anchor) || arr2(inh.anchor) || [cell[0] / 2, cell[1] - 8];
  const rowsSrc = (o.rows && typeof o.rows === 'object' && o.rows) || (inh.rows && typeof inh.rows === 'object' && inh.rows) || { idle: 1 };
  const rows = {};
  let i = 0;
  for (const k of Object.keys(rowsSrc)) {
    const v = rowsSrc[k];
    const n = Array.isArray(v) ? v[0] : v;
    const fps = Array.isArray(v) ? num(v[1], 0) : 0;
    rows[k] = { name: k, index: i++, frames: Math.max(1, Math.min(64, Math.floor(num(+n, 1)))), fps };
  }
  const fps = o.fps != null ? o.fps : inh.fps != null ? inh.fps : defs.fps;
  return {
    key, file: o.file, cell, anchor, rows, nrows: i, fps,
    scale: num(o.scale, num(inh.scale, defs.scale)),
    tint: typeof o.tint === 'string' ? o.tint : null,
    // plain/plainColor: tint の色が plainColor と同じなら、色まで描いた plain 画像をそのまま使う（既定色の装備・髪が完全一致する）
    plain: typeof o.plain === 'string' && !o.plain.includes('..') ? o.plain : null,
    plainColor: typeof o.plainColor === 'string' ? o.plainColor.toLowerCase() : null,
    size: arr2(o.size),
  };
}
const PLAIN = new Map();
function plainSheet(s) {
  let p = PLAIN.get(s);
  if (!p) { p = { ...s, file: s.plain, tint: null, plain: null }; PLAIN.set(s, p); }
  return p;
}
function rowFps(s, row) {
  if (row.fps > 0) return row.fps;
  const f = s.fps;
  if (typeof f === 'number' && f > 0) return f;
  if (f && typeof f === 'object') return num(f[row.name], 0) || num(f.default, 0) || DEF_FPS;
  return DEF_FPS;
}
function loopFrame(s, row, t) {
  const n = row.frames;
  if (n <= 1) return 0;
  const f = Math.floor(Math.max(0, t) * rowFps(s, row));
  return ((f % n) + n) % n;
}
function pickRow(s, cands) {
  const img0 = IMG.get(s.file);
  const maxRows = img0 && img0.h ? Math.floor(img0.h / s.cell[1]) : Infinity;
  for (const c of cands) {
    const r = s.rows[c];
    if (r && r.index < maxRows) return r;
  }
  const r = s.rows.idle;
  return r && r.index < maxRows ? r : null;
}

function img(s) {
  let r = IMG.get(s.file);
  if (r) return r;
  r = { img: null, st: 3, w: 0, h: 0, wait: [] };
  IMG.set(s.file, r);
  if (typeof Image === 'undefined') return r;
  try {
    const im = new Image();
    r.img = im; r.st = 1; STATS.requested++;
    im.onload = () => {
      r.w = im.naturalWidth || im.width; r.h = im.naturalHeight || im.height;
      if (r.w > 0 && r.h > 0 && s.single) {
        try { r.single = prepSingle(im, r.w, r.h, s.bgRemove); } catch (e) { note('1枚絵の前処理に失敗: ' + s.file + ' ' + e.message); }
        if (!r.single) { r.st = 3; STATS.failed++; REV++; for (const f of r.wait.splice(0)) f(); return; }
      }
      if (r.w > 0 && r.h > 0) { r.st = 2; STATS.loaded++; } else { r.st = 3; STATS.failed++; }
      REV++;
      for (const f of r.wait.splice(0)) f();
    };
    im.onerror = () => { r.st = 3; STATS.failed++; note('画像を読めません: ' + s.file); REV++; for (const f of r.wait.splice(0)) f(); };
    im.src = BASE + s.file;
  } catch (e) { r.st = 3; STATS.failed++; note('画像の読み込みに失敗: ' + s.file + ' ' + e.message); }
  return r;
}
function ready(s) { return img(s).st === 2; }

function drawFrame(ctx, s, row, fi, tint) {
  const r = IMG.get(s.file);
  if (!r || r.st !== 2) return;
  const cw = s.cell[0], ch = s.cell[1];
  const sx = fi * cw, sy = row.index * ch;
  if (sx + cw > r.w || sy + ch > r.h) return;            // シートが小さい（コマ不足）→ 描かない
  if (tint) {
    const c = tintFrame(s, r, row, fi, tint);
    if (c) { ctx.drawImage(c, 0, 0, cw, ch, -s.anchor[0], -s.anchor[1], cw, ch); return; }
  }
  ctx.drawImage(r.img, sx, sy, cw, ch, -s.anchor[0], -s.anchor[1], cw, ch);
}
// 白フラッシュ（被弾）: そのコマを白く塗ったシルエットで描く
let FC = null, FCX = null;
function drawFlashFrame(ctx, s, row, fi, tint) {
  const cw = s.cell[0], ch = s.cell[1];
  if (!FC) { FC = newCanvas(cw, ch); if (!FC) { drawFrame(ctx, s, row, fi, tint); return; } FCX = FC.getContext('2d'); }
  if (FC.width < cw || FC.height < ch) { FC.width = Math.max(FC.width, cw); FC.height = Math.max(FC.height, ch); }
  const g = FCX;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, cw, ch);
  g.translate(s.anchor[0], s.anchor[1]);
  drawFrame(g, s, row, fi, tint);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, cw, ch);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(FC, 0, 0, cw, ch, -s.anchor[0], -s.anchor[1], cw, ch);
}

// ---- tint（グレースケールで描いた絵を色で着色: multiply → destination-in で元の透明度に戻す）。コマ×色ごとにキャッシュ
const TINT = new Map();
let tintPx = 0;
const TINT_BUDGET = 24e6;              // 着色済みコマのキャッシュ上限（画素数。約96MB）
function tintColor(kind, look, item) {
  switch (kind) {
    case 'skin': return look.skin || '#ffe0cc';
    case 'hairColor': return look.hairColor || '#5a3a2a';
    case 'eyeColor': return look.eyeColor || '#4a3a8a';
    case 'color': return item ? itemColors(item)[0] : null;
    case 'accent': return item ? itemColors(item)[1] : null;
    default: return /^#[0-9a-f]{3,8}$/i.test(kind) ? kind : null;
  }
}
function tintFrame(s, r, row, fi, col) {
  const key = s.file + '|' + col + '|' + row.index + '|' + fi;
  let c = TINT.get(key);
  if (c) { TINT.delete(key); TINT.set(key, c); return c; }
  const cw = s.cell[0], ch = s.cell[1];
  c = newCanvas(cw, ch);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  const sx = fi * cw, sy = row.index * ch;
  g.drawImage(r.img, sx, sy, cw, ch, 0, 0, cw, ch);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = col; g.fillRect(0, 0, cw, ch);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(r.img, sx, sy, cw, ch, 0, 0, cw, ch);
  g.globalCompositeOperation = 'source-over';
  TINT.set(key, c); tintPx += cw * ch;
  while (tintPx > TINT_BUDGET && TINT.size > 1) {
    const [k0, c0] = TINT.entries().next().value;
    TINT.delete(k0); tintPx -= c0.width * c0.height;
  }
  return c;
}
function newCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch { /* ignore */ }
  return null;
}

// ================================================================ 1枚絵モード
// 画像生成AIなどで作った「1体1枚」の絵をそのまま使う。動き（待機の呼吸・歩きの弾み・溜め・攻撃・被弾・倒れる）はゲーム側で付ける。
// manifest: "slime_green": "enemies/slime_green.png"  または
//           "slime_green": { "file": "...", "single": true, "height": 60, "facesLeft": false, "bgRemove": "auto", "file2": "...(第2形態)" }
function normSingle(o, key) {
  if (typeof o.file !== 'string' || !o.file || /^(?:[a-z]+:)?\/\//i.test(o.file) || o.file.includes('..')) { note(`${key}: file は assets/sprites/ からの相対パスにしてください`); return null; }
  const file2 = typeof o.file2 === 'string' && !o.file2.includes('..') && !/^(?:[a-z]+:)?\/\//i.test(o.file2) ? o.file2 : null;
  const s = {
    key, file: o.file, single: true,
    height: num(o.height, 0),                       // ゲーム内の表示の高さ(px)。0 = 敵の当たり判定から自動
    facesLeft: !!o.facesLeft,                        // 絵が左向きで描かれている
    bgRemove: o.bgRemove === false ? false : o.bgRemove === true ? true : 'auto',
    motion: o.motion !== false,
    flyBob: num(o.flyBob, 5),
    rows: {}, nrows: 0, cell: [1, 1], anchor: [0, 0], scale: 1, fps: DEF_FPS, tint: null, plain: null, plainColor: null, size: null,
  };
  if (file2) s.phase2 = { ...s, key: key + ':2', file: file2, phase2: null };
  return s;
}

/** 背景を透明に（四隅が不透明でほぼ同じ色なら、その色を四隅から塗りつぶして消す）＋不透明部分で切り抜き */
function prepSingle(im, w, h, mode) {
  const c = newCanvas(w, h);
  if (!c) return null;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  let data;
  try { data = g.getImageData(0, 0, w, h); } catch { return { canvas: c, x: 0, y: 0, w, h }; } // 読み取り不可（別オリジン）ならそのまま
  const d = data.data;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const opaque = corners.every((i) => d[i + 3] > 250);
  if (mode === true || (mode === 'auto' && opaque)) {
    const ref = corners[0];
    const R = d[ref], G = d[ref + 1], B = d[ref + 2];
    const same = corners.every((i) => Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < 60);
    if (same || mode === true) {
      const tol = 70;
      const seen = new Uint8Array(w * h);
      const stack = [0, w - 1, (h - 1) * w, h * w - 1];
      while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        seen[p] = 1;
        const i = p * 4;
        if (Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) > tol) continue;
        d[i + 3] = 0;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }
      // 縁のにじみ（背景色が混ざった半端な画素）を薄くする
      for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        if (d[i + 3] === 0) continue;
        const x = p % w, y = (p / w) | 0;
        const nb = (x > 0 && d[i - 1] === 0) || (x < w - 1 && d[i + 7] === 0) || (y > 0 && d[i - w * 4 + 3] === 0) || (y < h - 1 && d[i + w * 4 + 3] === 0);
        if (nb && Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < tol * 1.6) d[i + 3] = Math.min(d[i + 3], 110);
      }
      g.putImageData(data, 0, 0);
    }
  }
  // 不透明部分の範囲で切り抜き
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[at(x, y) + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;                          // 全部透明
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = newCanvas(cw, ch);
  if (!out) return null;
  out.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
  c.width = c.height = 1;
  return { canvas: out, w: cw, h: ch };
}

let SFC = null;
function singleFlash(src, tintCol, a) {
  const w = src.width, h = src.height;
  if (!SFC) SFC = newCanvas(w, h);
  if (!SFC) return src;
  if (SFC.width < w || SFC.height < h) { SFC.width = Math.max(SFC.width, w); SFC.height = Math.max(SFC.height, h); }
  const g = SFC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = tintCol; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  return SFC;
}

/**
 * 1枚絵を足元基準で、動きを付けて描く。原点=足元（呼び出し側で translate 済み）。
 * m: { st, t, wind, flash, rage, dead, deadT, fly, hurt, targetH, facingFlip }
 */
function drawSingleAt(ctx, s, m) {
  const sheet = m.rage && s.phase2 && ready(s.phase2) ? s.phase2 : s;
  const r = IMG.get(sheet.file);
  if (!r || !r.single) return false;
  const src = r.single.canvas, w = r.single.w, h = r.single.h;
  const k = (m.targetH > 0 ? m.targetH : h) / h;
  const t = m.t || 0;
  let sx = 1, sy = 1, dx = 0, dy = 0, rot = 0, alpha = 1;
  if (s.motion) {
    switch (m.st) {
      case 'walk': dy = -Math.abs(Math.sin(t * 9)) * 4; rot = Math.sin(t * 9) * 0.05; sy = 1 + Math.abs(Math.sin(t * 9)) * 0.03; sx = 2 - sy; break;
      case 'attack':
        if (m.wind) { sx = 1.1; sy = 0.9; dx = -4; rot = -0.08; }
        else { sx = 1.14; sy = 0.92; dx = 8; rot = 0.06; }
        break;
      case 'hurt': dx = Math.sin(t * 60) * 3; rot = -0.08; break;
      case 'dead': { const p = clamp((m.deadT || 0) * 2.5, 0, 1); rot = -p * 1.35; dy = p * 6; alpha = 1 - clamp((m.deadT || 0) * 1.6 - 0.4, 0, 1); break; }
      default: { const b = Math.sin(t * 3); sy = 1 + b * 0.03; sx = 1 - b * 0.02; }
    }
    if (m.fly && m.st !== 'dead') dy += Math.sin(t * 3.2) * s.flyBob - s.flyBob;
    if (m.rage && m.st !== 'dead') dx += Math.sin(t * 40) * 1.2;
  }
  let img = src;
  if (m.flash) img = singleFlash(src, '#ffffff', 0.9);
  else if (m.rage && sheet === s) img = singleFlash(src, '#ff2050', 0.22);   // 第2形態の絵が無ければ赤く
  ctx.save();
  if (s.facesLeft) ctx.scale(-1, 1);
  ctx.translate(dx, dy);
  ctx.rotate(rot);
  ctx.scale(sx * k, sy * k);
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, 0, 0, w, h, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}

function drawSingleEnemy(ctx, e, I, s) {
  const def = e.def || {};
  const st = I.st || (e.dead ? 'dead' : e.hurtT > 0 ? 'hurt' : e.state === 'attack' ? 'attack' : e.state === 'walk' ? 'walk' : 'idle');
  const baseH = s.height > 0 ? s.height : (I.h || e.h || def.h || 40) * (def.boss || e.boss ? 1.25 : 1.35);
  const fx = e.facing < 0 ? -1 : 1;
  ctx.save();
  if (!I.local) { ctx.translate(e.x, e.y); ctx.scale(fx, 1); }
  const ok = drawSingleAt(ctx, s, { st, t: e.t || 0, wind: !!I.wind, flash: !!I.flash, rage: !!I.rage, deadT: e.deadT || 0, fly: !!(e.flying || I.fly), targetH: baseH });
  ctx.restore();
  return ok;
}

function drawSinglePet(ctx, x, y, anim, s) {
  const raw = anim.state || 'idle';
  const st = raw === 'pick' ? 'attack' : (raw === 'walk' || raw === 'move' || anim.moving) ? 'walk' : 'idle';
  ctx.save();
  if (!anim.local) { const sc = anim.scale || 1; ctx.translate(x, y); ctx.scale((anim.facing < 0 ? -1 : 1) * sc, sc); }
  if (raw === 'pick') ctx.translate(0, -Math.abs(Math.sin((anim.t || 0) * 10)) * 8);   // 拾ったときの喜びジャンプ
  const ok = drawSingleAt(ctx, s, { st: st === 'attack' ? 'idle' : st, t: anim.t || 0, flash: !!anim.flash, fly: !!anim.flying || raw === 'fly', targetH: s.height > 0 ? s.height : 36 });
  ctx.restore();
  return ok;
}
