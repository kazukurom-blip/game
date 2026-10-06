// 差し替えスプライト（外部で描いた PNG で見た目を上書き。仕様: docs/SPEC_SPRITES.md）
//  - main 起動時に loadSpriteManifest() を1回。assets/sprites/manifest.json が無い/壊れている → 全部コード描画。
//  - 画像は最初に必要になった時に Image で読み込み（遅延）。読み込み完了まではコード描画のまま。
//  - drawEnemy / drawPet / drawCharacter の入口から呼ばれ、描けたら true（呼び出し側はコード描画をしない）。
//  - spriteMode: 'auto'（スプライトがあれば使う）| 'procedural'（常にコード描画）。デバッグパネル（F2）で切替。
//  - パスはすべて相対（公開ページ・サブディレクトリ配信でも動く）。
import { assetUrl, setWebpMap } from './assetUrl.js';
import { charHeadPose, itemColors, SPRITE_LAYER_ORDER, aiHeadOf, paintAiHead, paintAiHeadBack } from './character.js';
import { setRigManifest, rigStats, rigPreload } from './rig.js';
import { HEAD_W, HEAD_S, HEAD_PX, HEAD_PY } from './rigLayout.js';
import { HEX6, colorInfo, effectiveColor, recolorData, sameColor } from './recolor.js';
import { setArtManifest } from './artOverrides.js';

export const SPRITE_BASE = 'assets/sprites/';
const DEF_SCALE = 0.5, DEF_FPS = 8;

let MAN = null;                 // 正規化済み manifest（null = スプライト無し）
let BASE = SPRITE_BASE;
let MODE = 'auto';
let REV = 0;                    // 画像の読み込み完了・モード切替で +1（アイコン等のキャッシュキー用）
let MGEN = 0;                   // manifest の設定・モード切替で +1（manifest にある顔・髪の一覧が変わる時。NPC の顔の割り当てのキャッシュ用）
const IMG = new Map();          // file → { img, st: 1 読込中 / 2 完了 / 3 失敗, w, h }
const STATS = { manifest: 'none', entries: 0, requested: 0, loaded: 0, failed: 0, errors: [] };

try { const m = typeof localStorage !== 'undefined' && localStorage.getItem('nvs_sprite_mode'); if (m === 'procedural' || m === 'auto') MODE = m; } catch { /* ignore */ }

// ================================================================ 公開 API
export function getSpriteMode() { return MODE; }
export function setSpriteMode(m) {
  MODE = m === 'procedural' ? 'procedural' : 'auto';
  REV++; MGEN++;
  try { localStorage.setItem('nvs_sprite_mode', MODE); } catch { /* ignore */ }
  return MODE;
}
export function toggleSpriteMode() { return setSpriteMode(MODE === 'auto' ? 'procedural' : 'auto'); }
/** 画像の読み込み・モードが変わるたびに増える番号（キャッシュの無効化用） */
export function spriteRev() { return REV; }
/** 画像の読み込み完了などで番号を進める（rig.js から） */
export function bumpSpriteRev() { REV++; }
/** manifest の設定・モード切替で増える番号（顔・髪の一覧が変わったかの判定用。画像の読み込みでは増えない） */
export function spriteManifestGen() { return MGEN; }
export function spriteStats() { return { mode: MODE, ...STATS, errors: STATS.errors.slice(-5), tintCache: TINT.size, faceRecolor: FRC.size, faceRecolors: FSTAT.recolors, rig: rigStats() }; }
export function hasSpriteManifest() { return !!MAN; }

/** manifest.json を読み込む（失敗しても例外を投げない）。戻り値: 読み込めたら true */
export async function loadSpriteManifest(url = SPRITE_BASE + 'manifest.json') {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch なし');
    // 軽い WebP の対応表（無くてもよい。読めなければ PNG のまま）
    const base0 = url.slice(0, url.lastIndexOf('/') + 1);
    const wp = fetch(base0 + 'webp.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { STATS.manifest = 'broken'; note('manifest.json の JSON が壊れています: ' + e.message); MAN = null; return false; }
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    setWebpMap(await wp);
    return setSpriteManifest(j, base);
  } catch (e) {
    MAN = null; STATS.manifest = 'none'; setRigManifest(null);
    return false;
  }
}

/** manifest を直接設定（テスト・ツール用）。不正な項目は無視する */
export function setSpriteManifest(j, base = SPRITE_BASE) {
  MAN = null; STATS.entries = 0; IMG.clear(); TINT.clear(); PLAIN.clear(); FRC.clear(); FHC.clear(); tintPx = 0; frcPx = 0; REV++; MGEN++;
  STATS.requested = STATS.loaded = STATS.failed = 0;
  setRigManifest(null, base);
  try { setArtManifest(j, base); } catch (e) { note('背景・アイコン等の節の解釈に失敗: ' + e.message); } // bg / tiles / icons / vehicles / ui（artOverrides.js）
  if (!j || typeof j !== 'object' || Array.isArray(j)) { STATS.manifest = j == null ? 'none' : 'broken'; return false; }
  try { setRigManifest(j.rig, base); } catch (e) { note('rig の解釈に失敗: ' + e.message); }
  try {
    BASE = base;
    const d = j.defaults && typeof j.defaults === 'object' ? j.defaults : {};
    const defs = { scale: num(d.scale, DEF_SCALE), fps: d.fps != null ? d.fps : DEF_FPS };
    const M = { enemies: {}, bosses: {}, pets: {}, chars: null, portraits: {}, heads: {}, faces: {}, hairs: {}, faceBase: normFaceBase(j.faceBase) };
    for (const sec of ['enemies', 'bosses', 'pets']) {
      const src = j[sec];
      if (!src || typeof src !== 'object') continue;
      for (const k of Object.keys(src)) {
        const s = normSheet(src[k], {}, defs, k);
        if (s) { M[sec][k] = s; STATS.entries++; }
      }
    }
    // 主人公の立ち絵・頭（画像生成AI向けの1枚絵。キー = <classId>_<gender>）
    for (const sec of ['portraits', 'heads']) {
      const src = j[sec];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for (const k of Object.keys(src)) {
        const E = normHero(src[k], sec, k);
        if (E) M[sec][k] = E;
      }
    }
    // 顔・髪の分割方式（顔 + 前髪 + 後ろ髪の3枚重ね。キー = 顔 'f_01' / 髪 '<性別>_<髪型>'）
    normFacesHairs(j, M);
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
  const rp = rigPreload();
  for (const sec of ['enemies', 'bosses', 'pets']) for (const k in MAN[sec]) all.push(MAN[sec][k]);
  if (MAN.chars) for (const k in MAN.chars.layers) all.push(MAN.chars.layers[k]);
  for (const sec of ['portraits', 'heads', 'faces']) for (const k in MAN[sec]) { const E = MAN[sec][k]; all.push(E.base); for (const e in E.expr) all.push(E.expr[e]); if (E.back) all.push(E.back); }
  for (const k in MAN.hairs) { const H = MAN.hairs[k]; if (H.front) all.push(H.front); if (H.back) all.push(H.back); }
  return Promise.all(all.map((s) => new Promise((res) => {
    const r = img(s);
    if (!r || r.st !== 1) return res();
    r.wait.push(res);
  })).concat([rp])).then(() => STATS.loaded);
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
/** 先読み用: 敵（ボスも）のスプライトの画像（manifest の相対パス） */
export function spriteFilesForEnemies(ids) {
  if (!MAN || MODE !== 'auto') return [];
  const out = [];
  for (const id of ids || []) for (const s of [MAN.enemies[id], MAN.bosses[id]]) { if (!s) continue; out.push(s.file); if (s.phase2) out.push(s.phase2.file); }
  return out;
}
export function spriteBaseUrl() { return BASE; }
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
    // AIの頭（heads[<classId>_<gender>]）があれば髪・顔のレイヤーの代わりに使う
    const ah = !vil ? aiHeadOf(look, A, state, A.t || 0) : null;
    for (const name of SPRITE_LAYER_ORDER) {
      if (ah && name === 'hair_back') { if (ah.back) picks.push({ name: 'aiback', s: null, key: 'aiback' }); continue; }
      if (ah && name === 'hair_front') continue;
      if (ah && name === 'face') { picks.push({ name: 'aihead', s: null, key: 'aihead' }); continue; }
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
      if (p.name === 'aihead' || p.name === 'aiback') { layers.push({ name: p.name, s: null, ai: ah, hat: sty('hat'), head: null, aiBack: p.name === 'aiback' }); continue; }
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
    const fl = layers.find((l) => l.name === 'face' || l.name === 'aihead');
    if (fl) {
      const hp = charHeadPose(look, eq, { state: A.state || state, t: repT, attackT: repAT, fallT: state === 'dead' ? repP : undefined, panic: A.panic });
      if (hp.back && !fl.ai) layers.splice(layers.indexOf(fl), 1);
      else { fl.head = hp.m; fl.back = hp.back; }
      const bl = layers.find((l) => l.name === 'aiback');
      if (bl) {
        if (hp.back) layers.splice(layers.indexOf(bl), 1);   // 背面は後ろ髪を頭の上に（aihead の中で）
        else { bl.head = hp.m; bl.back = false; }
      }
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
  if (l.aiBack) { paintAiHeadBack(ctx, l.ai, l.hat, null, false, 'code'); ctx.restore(); return; }
  if (l.ai) {
    paintAiHead(ctx, l.ai, l.hat, !!l.back, false);
    if (l.back && l.ai.back) paintAiHeadBack(ctx, l.ai, l.hat, null, false, 'code', true);
    ctx.restore(); return;
  }
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
    const s = l.s, k = s ? s.scale : 1;
    if (s) R = Math.max(R, Math.min(4, 1 / k));
    const sc = l.ai ? (l.ai.scale || 1) * (l.ai.place ? 1.15 : 1) : 1;
    const pl = l.ai && l.ai.place ? (l.aiBack && l.ai.back ? l.ai.back.place : l.ai.place) : null;
    const ex = pl ? Math.max(-pl[0], pl[0] + pl[2]) : 32;
    const pts = l.ai ? [[-ex * sc, (pl ? pl[1] : -30) * sc], [ex * sc, (pl ? pl[1] : -30) * sc], [-ex * sc, (pl ? pl[1] + pl[3] : 26) * sc], [ex * sc, (pl ? pl[1] + pl[3] : 26) * sc]] : [[-s.anchor[0] * k, -s.anchor[1] * k], [(s.cell[0] - s.anchor[0]) * k, -s.anchor[1] * k], [-s.anchor[0] * k, (s.cell[1] - s.anchor[1]) * k], [(s.cell[0] - s.anchor[0]) * k, (s.cell[1] - s.anchor[1]) * k]];
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
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        try { r.single = prepSingle(im, r.w, r.h, s.bgRemove, s.maxH); } catch (e) { note('1枚絵の前処理に失敗: ' + s.file + ' ' + e.message); }
        if (t0) { const ms = performance.now() - t0; STATS.prepMs = (STATS.prepMs || 0) + ms; STATS.prepMax = Math.max(STATS.prepMax || 0, ms); STATS.preps = (STATS.preps || 0) + 1; }
        if (!r.single) { r.st = 3; STATS.failed++; REV++; for (const f of r.wait.splice(0)) f(); return; }
      }
      if (r.w > 0 && r.h > 0) { r.st = 2; STATS.loaded++; } else { r.st = 3; STATS.failed++; }
      REV++;
      for (const f of r.wait.splice(0)) f();
    };
    im.onerror = () => { r.st = 3; STATS.failed++; note('画像を読めません: ' + s.file); REV++; for (const f of r.wait.splice(0)) f(); };
    im.src = assetUrl(BASE, s.file);
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

/**
 * 背景を透明に（画素配列 d を直接書き換え）。四隅が不透明でほぼ同じ色なら、その色を四隅から塗りつぶして消し、縁のにじみを薄くする。
 * mode: 'auto'（既定）| true（強制）| false（しない）。消したら背景色 [r,g,b]（真）、消さなければ false。リグのパーツシートでも使う。
 */
export function removeBg(d, w, h, mode = 'auto') {
  if (mode === false) return false;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const opaque = corners.every((i) => d[i + 3] > 250);
  if (!(mode === true || (mode === 'auto' && opaque))) return false;
  const ref = corners[0];
  const R = d[ref], G = d[ref + 1], B = d[ref + 2];
  const same = corners.every((i) => Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < 60);
  if (!same && mode !== true) return false;
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
  return [R, G, B];
}
/** 背景を透明に（四隅が不透明でほぼ同じ色なら、その色を四隅から塗りつぶして消す）＋不透明部分で切り抜き */
function prepSingle(im, w, h, mode, maxH) {
  const c = newCanvas(w, h);
  if (!c) return null;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  let data;
  try { data = g.getImageData(0, 0, w, h); } catch { return { canvas: c, x: 0, y: 0, w, h }; } // 読み取り不可（別オリジン）ならそのまま
  const d = data.data;
  const at = (x, y) => (y * w + x) * 4;
  if (removeBg(d, w, h, mode)) g.putImageData(data, 0, 0);
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
  // 切り抜き前の位置（配置図方式の頭の絵で使う）: ox,oy = 元の画像での左上、cw,ch = 元の画像での大きさ、srcW/srcH = 元の画像の大きさ
  const trim = { ox: x0, oy: y0, cw, ch, srcW: w, srcH: h };
  if (maxH > 0 && ch > maxH) return Object.assign(shrinkCanvas(out, cw, ch, maxH), trim);
  return { canvas: out, w: cw, h: ch, ...trim };
}
/** 大きすぎる1枚絵を半分ずつ縮小（画質を保ちつつ、毎フレームの drawImage を軽くする） */
function shrinkCanvas(src, w, h, maxH) {
  let cur = src, cw = w, ch = h;
  while (ch > maxH) {
    const nh = Math.max(maxH, Math.ceil(ch / 2));
    const nw = Math.max(1, Math.round(cw * nh / ch));
    const n = newCanvas(nw, nh);
    if (!n) break;
    const g = n.getContext('2d');
    g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
    g.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    if (cur !== src) cur.width = cur.height = 1;
    cur = n; cw = nw; ch = nh;
  }
  return { canvas: cur, w: cw, h: ch };
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}

function drawSingleEnemy(ctx, e, I, s) {
  const def = e.def || {};
  const st = I.st || (e.dead ? 'dead' : e.hurtT > 0 ? 'hurt' : e.state === 'attack' ? 'attack' : e.state === 'walk' ? 'walk' : 'idle');
  const isBoss = !!(def.boss || e.boss);
  // 1枚絵は余白が無いぶん小さく見えるので、雑魚は最低 56px（主人公は約80px）
  const baseH = s.height > 0 ? s.height : Math.max(isBoss ? 160 : 56, (I.h || e.h || def.h || 40) * (isBoss ? 1.25 : 1.45));
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

// ================================================================ 主人公の立ち絵・頭（画像生成AI向け）
// manifest:
//   "portraits": { "luna_f": "portraits/luna_f.png" | { "file": "...", "expr": { "smile": "...", ... } } }
//   "heads":     { "luna_f": { "file": "heads/luna_f.png", "expr": { "blink": "...", "hurt": "...", "shout": "...", "happy": "..." },
//                              "scale": 1, "offset": [0, 0], "facesLeft": false } }
// どれも1枚絵（背景は透明か単色 → 自動で透明化・トリミング）。表情の絵が無い/読み込み中なら基本の絵。
const HERO_MAXH = { portraits: 720, heads: 320, headsLayout: 420 };      // 読み込み時にこの高さまで縮小（性能のため）。配置図方式の頭は後ろ髪も入るので少し大きめ
/** 表情の別名（無ければ順に探す） */
const EXPR_ALIAS = {
  smile: ['smile', 'happy'], happy: ['happy', 'smile'], shout: ['shout', 'angry'], angry: ['angry', 'shout'],
  surprised: ['surprised', 'hurt'], hurt: ['hurt', 'surprised'], sad: ['sad'], blink: ['blink'],
};
function heroSingle(v, inheritBg, key) {
  if (typeof v === 'string') v = { file: v };
  if (!v || typeof v !== 'object' || typeof v.file !== 'string') return null;
  return normSingle({ file: v.file, single: true, bgRemove: v.bgRemove !== undefined ? v.bgRemove : inheritBg }, key);
}
function normHero(o, sec, k) {
  if (typeof o === 'string') o = { file: o };
  if (!o || typeof o !== 'object') return null;
  const base = heroSingle(o, o.bgRemove, sec + ':' + k);
  if (!base) return null;
  base.maxH = HERO_MAXH[sec];
  STATS.entries++;
  const expr = {};
  if (o.expr && typeof o.expr === 'object' && !Array.isArray(o.expr)) {
    for (const e of Object.keys(o.expr)) {
      const s = heroSingle(o.expr[e], o.bgRemove, sec + ':' + k + ':' + e);
      if (s) { s.maxH = HERO_MAXH[sec]; expr[e] = s; STATS.entries++; }
    }
  }
  const off = arr2(o.offset) || [0, 0];
  // 頭: fit:false（既定）= 頭の配置図（1024×1024、支点 = 頭の中心）のまま置く / fit:true = 旧方式（範囲を 46×58 に収める）
  const fit = sec === 'heads' ? o.fit === true : true;
  let back = null;
  if (sec === 'heads' && o.back != null) {
    back = heroSingle(o.back, o.bgRemove, sec + ':' + k + ':back');
    if (back) { back.maxH = HERO_MAXH.headsLayout; STATS.entries++; }
    if (back && fit) { note(`heads.${k}: 後ろ髪（back）は配置図方式（fit:false）の時だけ使えます`); back = null; }
  }
  if (sec === 'heads' && !fit) { base.maxH = HERO_MAXH.headsLayout; for (const e in expr) expr[e].maxH = HERO_MAXH.headsLayout; }
  // 後ろ髪だけの大きさ・位置の微調整（前の頭の scale/offset に掛け合わせる。単位は頭の座標）
  const backScale = clamp(num(o.backScale, 1), 0.3, 3), backOffset = arr2(o.backOffset) || [0, 0];
  return { key: k, sec, base, expr, back, fit, scale: clamp(num(o.scale, 1), 0.1, 10), offset: off, backScale, backOffset, facesLeft: !!o.facesLeft, pre: false };
}
function heroKey(a, b) {
  if (a && typeof a === 'object') return a.classId && a.gender ? a.classId + '_' + a.gender : null;   // look オブジェクト
  if (typeof a !== 'string' || !a) return null;
  return b ? a + '_' + b : a;
}
function heroEntry(sec, a, b) {
  if (!MAN || MODE !== 'auto' || !MAN[sec]) return null;
  const k = heroKey(a, b);
  return (k && MAN[sec][k]) || null;
}
function heroResolve(E, expr) {
  if (!E) return null;
  if (!E.pre) { E.pre = true; img(E.base); for (const e in E.expr) img(E.expr[e]); if (E.back) img(E.back); }   // 表情・後ろ髪もまとめて先読み
  if (expr) {
    for (const c of EXPR_ALIAS[expr] || [expr]) {
      const s = E.expr[c];
      if (!s) continue;
      const r = IMG.get(s.file);
      if (r && r.st === 2 && r.single) return { r, s, expr: c };
    }
  }
  const r = IMG.get(E.base.file);
  if (r && r.st === 2 && r.single) return { r, s: E.base, expr: null };
  return null;
}
/** 配置図方式（頭の配置図 1024×1024、1単位 = HEAD_S px、支点 HEAD_PX/HEAD_PY）の絵の置き場所 [x, y, w, h]（頭の座標の単位）。正方形でなければ null */
function layoutPlace(o) {
  if (!o || !(o.srcW > 0) || o.ox == null) return null;
  if (Math.abs(o.srcW / o.srcH - 1) > 0.03) return null;
  const u = HEAD_S * o.srcW / HEAD_W;              // 元の画像の 1単位の px
  return [o.ox / u - HEAD_PX / HEAD_S, o.oy / u - HEAD_PY / HEAD_S, o.cw / u, o.ch / u];
}
function heroOut(E, R) {
  const o = R.r.single;
  const out = { canvas: o.canvas, w: o.w, h: o.h, expr: R.expr, file: R.s.file, scale: E.scale, offset: E.offset, facesLeft: E.facesLeft, rec: R.r, fit: true, place: null, back: null };
  if (E.sec === 'heads' && !E.fit) {
    const pl = layoutPlace(o);
    if (pl) { out.fit = false; out.place = pl; }
    else if (!R.r.warnedFit) { R.r.warnedFit = true; note(`heads.${E.key}: ${R.s.file} が正方形ではないので旧方式（自動で範囲に収める）で置きます。頭の配置図（1024×1024）で描くか、manifest に "fit": true`); }
    if (out.place && E.back) {
      const rb = IMG.get(E.back.file);
      if (rb && rb.st === 2 && rb.single) {
        const bp = layoutPlace(rb.single);
        if (bp) out.back = { canvas: rb.single.canvas, w: rb.single.w, h: rb.single.h, place: bp, file: E.back.file, scale: E.backScale || 1, offset: E.backOffset || [0, 0] };
        else if (!rb.warnedFit) { rb.warnedFit = true; note(`heads.${E.key}: 後ろ髪 ${E.back.file} が正方形ではないので使いません（頭の配置図 1024×1024 で）`); }
      }
    }
  }
  return out;
}
/** 立ち絵 {canvas,w,h,expr,file} | null（画像が無い/読み込み中/壊れている）。classId には 'luna_f' や look も可 */
export function portraitFor(classId, gender, expr) {
  try {
    const E = heroEntry('portraits', classId, gender);
    const R = heroResolve(E, expr);
    return R ? heroOut(E, R) : null;
  } catch (err) { note('portraitFor: ' + err.message); return null; }
}
/** 頭の絵 {canvas,w,h,expr,file,scale,offset,facesLeft} | null */
export function headFor(classId, gender, expr) {
  try {
    const E = heroEntry('heads', classId, gender);
    const R = heroResolve(E, expr);
    return R ? heroOut(E, R) : null;
  } catch (err) { note('headFor: ' + err.message); return null; }
}
/** manifest に立ち絵/頭があるか（読み込み状態は問わない）。sec = 'portraits' | 'heads' */
export function hasHeroArt(sec, classId, gender) { return !!heroEntry(sec, classId, gender); }
/** 読み込み状態: 0 無し / 1 読み込み中 / 2 完了 / 3 失敗 */
export function heroArtState(sec, classId, gender) {
  const E = heroEntry(sec, classId, gender);
  if (!E) return 0;
  return img(E.base).st;
}
/** 背面（ロープ登り）用: 頭の絵のシルエットを髪の色（上の方の平均色）で塗ったもの。絵ごとにキャッシュ */
export function headBackOf(h) {
  if (!h || !h.rec) return null;
  const rec = h.rec;
  if (rec.back !== undefined) return rec.back;
  rec.back = null;
  try {
    const src = h.canvas, w = h.w, hh = h.h;
    const c = newCanvas(w, hh);
    if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    let R = 90, G = 60, B = 50;
    try {
      const d = g.getImageData(0, 0, w, Math.max(1, Math.floor(hh * 0.3))).data;
      let n = 0, r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      if (n) { R = r / n; G = gg / n; B = b / n; }
    } catch { /* ignore */ }
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, `rgb(${R | 0},${G | 0},${B | 0})`);
    gr.addColorStop(1, `rgb(${(R * 0.62) | 0},${(G * 0.62) | 0},${(B * 0.62) | 0})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    g.globalCompositeOperation = 'source-over';
    rec.back = c;
  } catch (err) { note('headBackOf: ' + err.message); }
  return rec.back;
}
/** 白フラッシュ（被弾）用のシルエット（共有の作業キャンバス。すぐに描くこと） */
export function flashOf(canvas, col = '#ffffff', a = 0.9) { return singleFlash(canvas, col, a); }

/**
 * 立ち絵を描く。描けたら描いた矩形 {x,y,w,h}、無ければ null（呼び出し側は今まで通りの表示に）。
 *  key: 'luna_f' / look（classId・gender を持つ）/ classId（gender は opts.gender）
 *  x, y: opts.anchor='foot'（既定）なら足元中央、'center' なら中心。h: 表示の高さ(px)
 *  opts: { anchor, gender, flip, alpha, maxW, dim(0..1 暗く), crop:[u0,v0,u1,v1]（0..1 の切り出し）, flash }
 */
export function drawPortrait(ctx, key, expr, x, y, h, opts = {}) {
  try {
    const p = portraitFor(key, typeof key === 'string' && opts.gender ? opts.gender : undefined, expr);
    if (!p) return null;
    const cr = Array.isArray(opts.crop) && opts.crop.length >= 4 ? opts.crop : null;
    const sx = cr ? cr[0] * p.w : 0, sy = cr ? cr[1] * p.h : 0;
    const sw = cr ? Math.max(1, (cr[2] - cr[0]) * p.w) : p.w, sh = cr ? Math.max(1, (cr[3] - cr[1]) * p.h) : p.h;
    let k = h / sh;
    if (opts.maxW > 0 && sw * k > opts.maxW) k = opts.maxW / sw;
    const dw = sw * k, dh = sh * k;
    const dx = x - dw / 2, dy = opts.anchor === 'center' ? y - dh / 2 : y - dh;
    let src = p.canvas;
    if (opts.flash) src = singleFlash(p.canvas, '#ffffff', 0.9);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha *= clamp(opts.alpha, 0, 1);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch { /* ignore */ }
    const flip = !!opts.flip !== !!(portraitEntryFacesLeft(key, opts.gender));
    if (flip) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    if (opts.dim > 0) {   // 聞き手側は暗く（絵の形で塗った暗色を半透明で重ねる）
      ctx.globalAlpha *= clamp(opts.dim, 0, 1);
      ctx.drawImage(singleFlash(p.canvas, '#140828', 1), sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
    return { x: dx, y: dy, w: dw, h: dh };
  } catch (err) { note('drawPortrait: ' + err.message); return null; }
}
function portraitEntryFacesLeft(key, gender) {
  const E = heroEntry('portraits', key, typeof key === 'string' ? gender : undefined);
  return !!(E && E.facesLeft);
}

// ================================================================ 顔・髪の分割方式（顔 + 前髪 + 後ろ髪の3枚重ね）
// manifest（仕様: docs/SPEC_SPRITES.md「顔・髪の分割方式」, docs/art_handoff/FACE_HAIR_SPEC.md）:
//   "faces":    { "f_01": { "file": "heads/face/f_01.png", "expr": { "blink": "...", "hurt": "...", "shout": "...", "happy": "..." } } }
//   "hairs":    { "f_twin": { "file": "heads/hair/f_twin.png", "back": "heads/hair/f_twin_back.png", "base": "#b07850" } }
//   "faceBase": { "skin": { "f": "#ffe3d3", "m": "#f6d5be" }, "eye": "#6a5cff" }
// 3枚とも頭の配置図（1024×1024・1単位 = 10px・支点 (512,400)）。look.face（'f_01'）+ look.hair（髪型ID）で選ぶ。
// 色: 髪 = hairs の base → look.hairColor、肌 = faceBase.skin[性別] → look.skin、瞳 = faceBase.eye → look.eyeColor に塗り替え。
const FACE_BASE_DEF = { skin: { f: '#ffe3d3', m: '#f6d5be' }, eye: '#6a5cff', hair: '#b07850' };
const FRC = new Map();          // 色替え済みの絵: file|色 → canvas（LRU。合計の画素数が FRC_BUDGET を超えたら古い物から捨てる）
const FRC_BUDGET = 10e6;        // 約40MB（主人公の 420px の絵なら約56枚、NPC 用の縮小版 210px なら約220枚）
let frcPx = 0;
const FHC = new Map();          // 解決済みの重ね頭: look の顔・髪・色・表情 → 出力（REV が変わったら作り直し。LRU 上限 FHC_MAX）
const FHC_MAX = 1500;
/** NPC・市民・敵用の縮小版の倍率（420px → 210px。画面の頭は 2x キャッシュでも 100px 前後なので十分。色替えも 1/4 の画素で速い） */
const SMALL_K = 0.5;
const FSTAT = { recolors: 0 };
const hex6 = (v, d) => (typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : d);
function normFaceBase(o) {
  o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const sk = o.skin && typeof o.skin === 'object' ? o.skin : {};
  return { skin: { f: hex6(sk.f, FACE_BASE_DEF.skin.f), m: hex6(sk.m, FACE_BASE_DEF.skin.m) }, eye: hex6(o.eye, FACE_BASE_DEF.eye) };
}
const genderOfKey = (k, o) => (o && (o.gender === 'f' || o.gender === 'm') ? o.gender : /^m_/.test(k) ? 'm' : 'f');
function normFacesHairs(j, M) {
  const fs = j.faces;
  if (fs && typeof fs === 'object' && !Array.isArray(fs)) {
    for (const k of Object.keys(fs)) {
      const E = normHero(fs[k], 'faces', k);
      if (!E) continue;
      E.base.maxH = HERO_MAXH.headsLayout;
      for (const e in E.expr) E.expr[e].maxH = HERO_MAXH.headsLayout;
      E.back = null; E.fit = false; E.g = genderOfKey(k, fs[k]);
      M.faces[k] = E;
    }
  }
  const hs = j.hairs;
  if (hs && typeof hs === 'object' && !Array.isArray(hs)) {
    for (const k of Object.keys(hs)) {
      let o = hs[k];
      if (typeof o === 'string') o = { file: o };
      if (!o || typeof o !== 'object') continue;
      const front = o.file != null ? heroSingle(o.file, o.bgRemove, 'hairs:' + k) : null;
      const back = o.back != null ? heroSingle(o.back, o.bgRemove, 'hairs:' + k + ':back') : null;
      if (!front && !back) { note(`hairs.${k}: file（前髪）か back（後ろ髪）が必要です`); continue; }
      for (const s of [front, back]) if (s) { s.maxH = HERO_MAXH.headsLayout; STATS.entries++; }
      const m = /^([fm])_(.+)$/.exec(k);
      M.hairs[k] = { key: k, g: m ? m[1] : genderOfKey(k, o), id: m ? m[2] : k, front, back, base: hex6(o.base, FACE_BASE_DEF.hair), pre: false };
    }
  }
}
/** その性別の顔の ID 一覧（manifest にある物。読み込み状態は問わない）。並びは ID 順 */
export function faceList(gender) {
  if (!MAN || MODE !== 'auto') return [];
  return Object.keys(MAN.faces).filter((k) => MAN.faces[k].g === gender).sort();
}
/** その性別で、AI の髪の絵がある髪型 ID（'twin' など、性別の接頭辞なし）の一覧 */
export function hairArtList(gender) {
  if (!MAN || MODE !== 'auto') return [];
  return Object.keys(MAN.hairs).map((k) => MAN.hairs[k]).filter((H) => H.g === gender).map((H) => H.id);
}
/** look の顔・髪の絵が manifest にあるか（読み込み状態は問わない） */
export function hasFaceArt(look) {
  if (!MAN || MODE !== 'auto' || !look || !look.face) return false;
  const F = MAN.faces[look.face];
  return !!(F && MAN.hairs[(look.gender || look.body || F.g) + '_' + look.hair]);
}
/** 絵の基準色の実際の平均（読み込んだ絵ごとに1回） */
function effOf(r, hex) {
  const m = r.eff || (r.eff = {});
  if (m[hex]) return m[hex];
  let d = null;
  try { d = r.single.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, r.single.w, r.single.h).data; } catch { /* ignore */ }
  return (m[hex] = d ? effectiveColor(colorInfo(hex), [d]) : colorInfo(hex));
}
/**
 * 1枚絵（読み込み済み）を色替え。pairs = [[基準色, 目標色], ...]。同じ色なら元の絵。絵×色ごとにキャッシュ。
 * small: NPC 用の縮小版（SMALL_K 倍。色替えが無くても縮小した絵を返す）
 */
function recoloredSingle(r, file, pairs, tint, small) {
  const o = r.single;
  const use = pairs.filter(([b, t]) => b && t && HEX6.test(t) && !sameColor(t.toLowerCase(), b));
  if (!use.length && !small) return o.canvas;
  const key = file + '|' + use.map((p) => p[1].toLowerCase()).join(',') + (small ? '|s' : '');
  let cv = FRC.get(key);
  if (cv) { FRC.delete(key); FRC.set(key, cv); return cv; }
  const w = small ? Math.max(1, Math.round(o.w * SMALL_K)) : o.w, h = small ? Math.max(1, Math.round(o.h * SMALL_K)) : o.h;
  cv = newCanvas(w, h);
  if (!cv) return o.canvas;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (small) { g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch { /* ignore */ } }
  g.drawImage(o.canvas, 0, 0, w, h);
  if (use.length) {
    try {
      const im = g.getImageData(0, 0, w, h);
      recolorData(im.data, use.map(([b, t]) => [effOf(r, b), colorInfo(t.toLowerCase())]), { tint });
      g.putImageData(im, 0, 0);
    } catch (e) { note('色替えに失敗: ' + file + ' ' + e.message); return o.canvas; }
    FSTAT.recolors++;
  }
  FRC.set(key, cv); frcPx += w * h;
  // 捨てるだけ（描画中の重ね頭が持っていることがあるので消さない）
  while (frcPx > FRC_BUDGET && FRC.size > 1) { const [k0, c0] = FRC.entries().next().value; FRC.delete(k0); frcPx -= c0.width * c0.height; }
  return cv;
}
/** 読み込み状態: 0 無し / 1 読み込み中 / 2 完了 / 3 失敗（失敗は「その絵は無し」として扱う） */
function stOf(s) { if (!s) return 0; const r = img(s); return r.st === 2 && !r.single ? 3 : r.st; }
/**
 * 顔 + 前髪 + 後ろ髪の重ね頭（paintAiHead / paintAiHeadBack に渡せる形。layered: true）。
 * look.face の顔の絵と hairs['<性別>_<look.hair>'] があり、読み込み済みなら返す。無い/読み込み中 → null（呼び出し側は heads → コードの頭）
 */
export function faceHeadFor(look, expr, small) {
  try {
    if (!MAN || MODE !== 'auto' || !look || !look.face) return null;
    const F = MAN.faces[look.face];
    if (!F) return null;
    const g = look.gender || look.body || F.g;
    const H = MAN.hairs[g + '_' + look.hair];
    if (!H) return null;
    small = !!small;
    const ck = look.face + '|' + H.key + '|' + (look.skin || '') + (look.eyeColor || '') + (look.hairColor || '') + '|' + (expr || '') + (small ? '|s' : '');
    let out = FHC.get(ck);
    if (out && out.rev === REV) { FHC.delete(ck); FHC.set(ck, out); return out.v; }
    if (!H.pre) { H.pre = true; if (H.front) img(H.front); if (H.back) img(H.back); }
    const R = heroResolve(F, expr);                     // 表情の絵（無ければ基本の顔）
    const sf = stOf(H.front), sb = stOf(H.back);
    let v = null;
    if (R && sf !== 1 && sb !== 1 && (sf === 2 || sb === 2)) {
      const fp = layoutPlace(R.r.single);
      if (!fp) {
        if (!R.r.warnedFit) { R.r.warnedFit = true; note(`faces.${F.key}: ${R.s.file} が正方形ではないので使えません（頭の配置図 1024×1024 で）`); }
      } else {
        const FB = MAN.faceBase;
        const hc = look.hairColor;
        const face = recoloredSingle(R.r, R.s.file, [[FB.skin[F.g] || FB.skin.f, look.skin], [FB.eye, look.eyeColor]], false, small);
        const part = (s) => {
          if (!s) return null;
          const r = IMG.get(s.file);
          if (!r || r.st !== 2 || !r.single) return null;
          const pl = layoutPlace(r.single);
          if (!pl) { if (!r.warnedFit) { r.warnedFit = true; note(`hairs.${H.key}: ${s.file} が正方形ではないので使いません（頭の配置図 1024×1024 で）`); } return null; }
          const cv = recoloredSingle(r, s.file, [[H.base, hc]], true, small);
          return { canvas: cv, w: cv.width, h: cv.height, place: pl, file: s.file, scale: 1, offset: [0, 0] };
        };
        const front = part(H.front), back = part(H.back);
        v = {
          layered: true, fit: false, scale: 1, offset: [0, 0], facesLeft: false,
          canvas: face, w: face.width, h: face.height, place: fp, expr: R.expr,
          file: 'F:' + R.s.file + '+' + H.key + (front ? '' : '-f') + (back ? '' : '-b') + '|' + (look.skin || '') + (look.eyeColor || '') + (hc || '') + (small ? '|s' : ''),
          front, back, hairColor: hex6(hc, H.base), rec: {},
        };
      }
    }
    FHC.set(ck, { rev: REV, v });
    while (FHC.size > FHC_MAX) FHC.delete(FHC.keys().next().value);
    return v;
  } catch (err) { note('faceHeadFor: ' + err.message); return null; }
}
/** 重ね頭の背面（ロープ登り）: 顔と前髪のシルエットを髪の色で塗った絵 { canvas, w, h, place }。重ね頭ごとにキャッシュ */
export function layeredBackOf(h) {
  if (!h || !h.layered) return null;
  const rec = h.rec || (h.rec = {});
  if (rec.back !== undefined) return rec.back;
  rec.back = null;
  try {
    const ls = [h, h.front].filter((x) => x && x.place);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of ls) { x0 = Math.min(x0, l.place[0]); y0 = Math.min(y0, l.place[1]); x1 = Math.max(x1, l.place[0] + l.place[2]); y1 = Math.max(y1, l.place[1] + l.place[3]); }
    const k = h.w / h.place[2];                       // 1単位の px（顔の絵の解像度）
    const w = Math.max(1, Math.ceil((x1 - x0) * k)), hh = Math.max(1, Math.ceil((y1 - y0) * k));
    const c = newCanvas(w, hh);
    if (!c) return null;
    const g = c.getContext('2d');
    for (const l of ls) g.drawImage(l.canvas, 0, 0, l.w, l.h, (l.place[0] - x0) * k, (l.place[1] - y0) * k, l.place[2] * k, l.place[3] * k);
    const [R, G, B] = [1, 3, 5].map((i) => parseInt(h.hairColor.slice(i, i + 2), 16));
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, `rgb(${R},${G},${B})`);
    gr.addColorStop(1, `rgb(${(R * 0.62) | 0},${(G * 0.62) | 0},${(B * 0.62) | 0})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    g.globalCompositeOperation = 'source-over';
    rec.back = { canvas: c, w, h: hh, place: [x0, y0, x1 - x0, y1 - y0] };
  } catch (err) { note('layeredBackOf: ' + err.message); }
  return rec.back;
}
