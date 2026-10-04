// 敵の描画: メイプル的かわいいモンスター（独自デザイン）＋GTA的な人型ギャング/警官
// v4 HQ: 2段セル影・リムライト（夜はネオン）・ため/被弾/目回しの表情・ボス第2形態・発光キャッシュ
import { drawCharacter } from './character.js';
import { shade, rgba, clamp, rr, mix } from './util.js';
import {
  FL, setFL, C, OC, fs, cuteEyes, blush, pickCol, body, part, metal, bodyK, metalK, partK, cpart, PC, groundShadow, glow, sparkle, crownHQ,
  fierceEye, mouth, mouthFor, tone, shadow, light, hue, setEnv, setPose, POSE, ENV, textUp,
} from './mkit.js';
import { drawMonster2, ART2_SIZE, drawCivilian } from './monsters2.js';

const PI = Math.PI;

const L = (style, color, accent) => ({ style, color, accent: accent || '#ffffff' });
// def.look/equip が無い場合のデフォルト
const DEFAULT_HUMANS = {
  thug: {
    look: { body: 'm', skin: '#d9a27a', hair: 'spiky', hairColor: '#39ff6a', eyeColor: '#2a2a2a' },
    equip: { hat: L('bandana', '#d8283c'), top: L('tank', '#222228', '#ffd23f'), bottom: L('jeans', '#3a5a8c', '#c9d6ea'), shoes: L('sneakers', '#f4f4f4', '#d8283c'), weapon: L('bat', '#b98a52', '#5a3a22') },
  },
  cop: {
    look: { body: 'm', skin: '#c98e62', hair: 'short', hairColor: '#2a1a10', eyeColor: '#1a2a4a' },
    equip: { hat: L('cap', '#1f3a8a', '#ffd23f'), top: L('police', '#1f3a8a', '#ffd23f'), bottom: L('suitPants', '#1a2440', '#5a5a66'), shoes: L('loafers', '#1a1a1a', '#444'), accessory: L('sunglasses', '#1a1a24', '#c0c0c8'), weapon: L('pistol', '#2a2a30', '#8a8a8a') },
  },
  swat: {
    look: { body: 'm', skin: '#b07a52', hair: 'short', hairColor: '#111111', eyeColor: '#111111' },
    equip: { hat: L('helmet', '#16161e', '#3a6bff'), top: L('armorVest', '#23282c', '#5a6470'), bottom: L('armorPants', '#23282c', '#5a6470'), shoes: L('boots', '#111', '#555'), accessory: L('mask', '#1a1a20', '#5a6470'), weapon: L('smg', '#1d1d24', '#3a6bff') },
  },
  bossDon: {
    look: { body: 'm', skin: '#d0a070', hair: 'wolf', hairColor: '#e8e8e8', eyeColor: '#ffd23f' },
    equip: { hat: L('crown', '#ffd23f', '#ff3d7f'), top: L('suit', '#ffd23f', '#15151b'), bottom: L('suitPants', '#15151b', '#5a5a66'), shoes: L('loafers', '#5a3a22', '#c9a26a'), accessory: L('goldChain', '#ffb800', '#ffffff'), weapon: L('pistol', '#ff8a00', '#ff3dd2') },
  },
};

function animState(e) {
  const s = e.state;
  if (s === 'dead' || e.dead) return 'dead';
  if (s === 'hurt' || e.hurtT > 0) return 'hurt';
  if (s === 'attack' || s === 'shoot') return 'attack';
  if (s === 'jump' || (!e.onGround && !e.flying && Math.abs(e.vy || 0) > 60)) return 'jump';
  if (s === 'walk' || s === 'move' || s === 'chase' || s === 'patrol' || s === 'flee' || s === 'run' || Math.abs(e.vx || 0) > 5) return 'walk';
  return 'idle';
}
const BOSS_WINDUP = { charge: 1, slam: 1, shoot: 1, summon: 1 };
/** 攻撃予備動作（溜め）0..1。charger の windup / ボス技の発動前 */
function windupOf(e, st) {
  if (st !== 'attack') return 0;
  if (e.phase === 'windup') return 1;
  if ((e.boss || (e.def && e.def.boss)) && !e.hasActed && BOSS_WINDUP[e.phase]) return 1;
  return 0;
}
/** 夜の度合い 0..1（map._clock / game.clock） */
function nightOf(e) {
  const g = e.game;
  const c = g ? (g.clock ?? g.map?._clock ?? g.state?.clock) : null;
  if (c == null) return 0;
  if (c >= 19.5 || c < 4.5) return 1;
  if (c >= 17.5) return (c - 17.5) / 2;
  if (c < 6) return 1 - (c - 4.5) / 1.5;
  return 0;
}

// 非人型 art の基準サイズ（def.scale 指定時は 基準×scale で描く。未指定なら e.w/e.h）
const ART_SIZE = Object.assign({
  slime: [40, 32], mushroom: [44, 48], flamingo: [40, 70], gator: [92, 40], bossGator: [180, 80], drone: [44, 30],
}, ART2_SIZE);
const DEF_COLORS = {
  slime: ['#5cff9a', '#ff4fa0'], mushroom: ['#ff8a00', null], flamingo: ['#ff7fb0', null], gator: ['#4e9a3a', '#ffd23f'],
  bossGator: ['#2f6f2a', '#ffd23f'], drone: ['#19f0ff', null],
};
const HUMAN_ARTS = { thug: 1, cop: 1, swat: 1, bossDon: 1 };
const FLYERS = { drone: 1, jellyfish: 1, seagull: 1, mosquito: 1, ghost: 1, bossAlien: 1 };

// def.color/accent で人型の既定装備を色替え（def.equip 明示時はそのまま）
const tintCache = new Map();
function tintedEquip(art, base, col, acc) {
  if ((!col || col === '#ffffff') && !acc) return base;
  const key = art + col + acc;
  let r = tintCache.get(key);
  if (r) return r;
  r = {};
  for (const k in base) {
    const v = base[k];
    if (!v) { r[k] = v; continue; }
    if (k === 'top' || k === 'hat' || (k === 'bottom' && art === 'swat')) r[k] = { style: v.style, color: (col && col !== '#ffffff') ? col : v.color, accent: acc || v.accent };
    else if (k === 'weapon' && acc) r[k] = { style: v.style, color: v.color, accent: acc };
    else r[k] = v;
  }
  if (tintCache.size > 200) tintCache.clear();
  tintCache.set(key, r);
  return r;
}

export function drawEnemy(ctx, e) {
  const def = e.def || {};
  const art = def.art || 'slime';
  const st = animState(e);
  const flash = e.hurtT > 0 && ((e.hurtT * 24) | 0) % 2 === 0;
  const t = e.t || 0;
  const boss = !!(def.boss || e.boss);
  const hpF = e.maxHp ? clamp(e.hp / e.maxHp, 0, 1) : 1;
  const rage = boss && hpF < 0.5 && st !== 'dead' ? 1 : 0;
  const wind = windupOf(e, st);
  const night = nightOf(e);
  ctx.save();
  if (st === 'dead' && e.alpha == null) ctx.globalAlpha *= clamp(1 - (e.deadT || 0), 0, 1);
  let topY = e.y - (e.h || def.h || 40);
  if (HUMAN_ARTS[art]) {
    const dflt = DEFAULT_HUMANS[art];
    const look = def.look || dflt.look;
    const equip = def.equip || tintedEquip(art, dflt.equip, def.color, def.accent);
    const sc = def.scale || clamp((e.h || 70) / 72, 0.8, 2.2);
    if (boss) humanBossFx(ctx, e, art, sc, t, st, wind, rage, false);
    let attackT = 0;
    if (st === 'attack') { attackT = wind ? 0.05 : ((t * 2.2) % 1); }
    drawCharacter(ctx, e.x, e.y, look, equip, {
      facing: e.facing || 1, state: st, t, attackT, damage: art === 'bossDon' ? (1 - hpF) * 0.8 : 0,
      scale: sc, flash, deadT: clamp((e.deadT || 0) * 3, 0, 1),
    });
    if (boss) humanBossFx(ctx, e, art, sc, t, st, wind, rage, true);
    topY = e.y - 82 * sc;
  } else if (art === 'civilian') {
    topY = drawCivilian(ctx, e, st, t, flash);
  } else {
    let w = e.w || def.w || 40, h = e.h || def.h || 40;
    const base = ART_SIZE[art];
    if (def.scale && base) { w = base[0] * def.scale; h = base[1] * def.scale; }
    topY = e.y - h;
    const fly = e.flying || FLYERS[art];
    ctx.translate(e.x, e.y);
    // 接地影（飛行体は薄く小さく）— キャッシュ外で毎フレーム
    if (!fly) groundShadow(ctx, 0, 0, w * 0.42, 0.3);
    else if (st !== 'dead') groundShadow(ctx, 0, 0, w * 0.26, 0.14);
    const fx = e.facing < 0 ? -1 : 1;
    ctx.scale(fx, 1);
    // パーツキャッシュの解像度: 画面上の拡大率×2（ボス等の大型でもぼけない）
    const sz = base ? Math.max(w / base[0], h / base[1]) : 1;
    PC.res = sz <= 1.05 ? 2 : Math.min(8, Math.ceil(sz * 4) / 2);
    drawArt(ctx, e, def, art, w, h, st, t, flash, wind, rage, night, boss);
    PC.res = 2;
  }
  ctx.restore();
  // HPバー・名前
  if (st !== 'dead') {
    if (boss) drawBossTag(ctx, e, topY);
    else if (e.hurtT > 0 || e.showHpT > 0) drawHpBar(ctx, e.x, topY - 10, 40, 5, e.hp / e.maxHp);
  }
}

// ---------------------------------------------------------------- 非人型の本体描画（足元中央・右向き）
function drawArt(ctx, e, def, art, w, h, st, t, flash, wind, rage, night, boss) {
  setFL(flash);
  setEnv(night);
  setPose(wind, rage, boss, e.facing < 0 ? -1 : 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const dc = DEF_COLORS[art];
  const col = tone(dc ? pickCol(def.color, dc[0]) : (def.color || '#5cff9a'));
  const acc = def.accent || (dc && dc[1]) || (art === 'flamingo' && def.color === '#b04dff' ? '#19f0ff' : null);
  if (boss && art !== 'bossGator' && art !== 'bossAlien' && art !== 'drone') drawAura(ctx, 0, -h * 0.5, Math.max(w, h) * 0.7, t, rage ? '#ff5a3c' : '#ffc93c', rage ? '#ff2e6a' : '#ff4fa0', wind);
  if (art === 'slime') drawSlime(ctx, w, h, col, t, st, boss, acc);
  else if (art === 'mushroom') drawMushroom(ctx, w, h, col, t, st, acc);
  else if (art === 'flamingo') drawFlamingo(ctx, w, h, col, t, st, acc);
  else if (art === 'gator') drawGator(ctx, w, h, col, t, st, false, acc);
  else if (art === 'bossGator') { drawAura(ctx, 0, -h * 0.45, w * 0.6, t, rage ? '#ff6a2a' : '#c8ff5a', rage ? '#ff2e4d' : '#ffc93c', wind); drawGator(ctx, w, h, col, t, st, true, acc); }
  else if (art === 'drone') { if (boss) drawMecha(ctx, w, h, col, t, st, acc); else drawDrone(ctx, w, h, col, t, st, acc); }
  else if (!drawMonster2(ctx, art, w, h, def.color, def.accent, t, st, boss, e)) drawSlime(ctx, w, h, tone(pickCol(def.color, '#5cff9a')), t, st, boss, acc || '#ff4fa0');
  setFL(false);
  setPose(0, 0, false);
}

// ---------------------------------------------------------------- 人型ボスの演出（キャラ本体は character.js）
function humanBossFx(ctx, e, art, sc, t, st, wind, rage, front) {
  const x = e.x, y = e.y, f = e.facing || 1;
  const don = art === 'bossDon';
  const c1 = rage ? '#ff5a3c' : don ? '#ffc93c' : '#3ee6d2';
  const c2 = rage ? '#ff2e6a' : don ? '#ff4fa0' : '#2e7bff';
  if (!front) {
    drawAura(ctx, x, y - 45 * sc, 58 * sc, t, c1, c2, wind);
    // 足元の魔法陣風リング
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(c1, 0.45 + wind * 0.4); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 40 * sc, 8 * sc, 0, 0, PI * 2); ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = rgba(c2, 0.5);
    ctx.beginPath(); ctx.ellipse(x, y, 48 * sc, 10 * sc, 0, 0, PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    if (st === 'dead') return;
    // 浮遊する札束/コイン（ドン）・波しぶき（船長）
    for (let i = 0; i < (rage ? 7 : 4); i++) {
      const a = t * (don ? 1.4 : 1.1) + i * (PI * 2 / (rage ? 7 : 4));
      const px = x + Math.cos(a) * 46 * sc, py = y - 50 * sc + Math.sin(a) * 14 * sc - Math.sin(t * 2 + i) * 6;
      if (Math.sin(a) > 0.2) continue; // 後ろ側だけここで描く
      fxToken(ctx, px, py, sc, don, i, t);
    }
    return;
  }
  if (st === 'dead') return;
  for (let i = 0; i < (rage ? 7 : 4); i++) {
    const a = t * (don ? 1.4 : 1.1) + i * (PI * 2 / (rage ? 7 : 4));
    if (Math.sin(a) <= 0.2) continue;
    const px = x + Math.cos(a) * 46 * sc, py = y - 50 * sc + Math.sin(a) * 14 * sc - Math.sin(t * 2 + i) * 6;
    fxToken(ctx, px, py, sc, don, i, t);
  }
  // 溜め: 武器のきらめき＋「!」の閃光
  if (wind) {
    const k = 0.6 + 0.4 * Math.sin(t * 30);
    glow(ctx, x + f * 22 * sc, y - 46 * sc, 26 * sc, rage ? '#ff4a4a' : '#fff6a0', 0.7 * k);
    sparkle(ctx, x + f * 22 * sc, y - 46 * sc, 14 * sc * k, '#ffffff', 1);
    sparkle(ctx, x - f * 4 * sc, y - 92 * sc, 9 * sc, rage ? '#ff6a6a' : '#fff6a0', 0.9);
  }
  // 第2形態: 怒りの湯気＋赤い眼光
  if (rage) {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.9 + i / 3) % 1;
      ctx.fillStyle = `rgba(255,${120 - k * 60 | 0},120,${0.35 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(x + (i - 1) * 12 * sc + Math.sin(t * 3 + i) * 4, y - 84 * sc - k * 30 * sc, (4 + k * 8) * sc, 0, PI * 2); ctx.fill();
    }
    glow(ctx, x + f * 5 * sc, y - 62 * sc, 12 * sc, '#ff2e4d', 0.55 + 0.25 * Math.sin(t * 8));
  }
}
function fxToken(ctx, px, py, sc, don, i, t) {
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(t * 2 + i) * 0.6); ctx.scale(sc, sc);
  if (don) {
    if (i % 2) { ctx.beginPath(); rr(ctx, -6, -3.5, 12, 7, 1.5); fs(ctx, '#5adf7a', 1.2); ctx.fillStyle = '#2a7a3a'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.3); }
    else { ctx.beginPath(); ctx.ellipse(0, 0, 4.2 * Math.abs(Math.cos(t * 4 + i)) + 0.8, 4.2, 0, 0, PI * 2); fs(ctx, '#ffd23f', 1.1); }
  } else {
    ctx.fillStyle = 'rgba(160,240,255,0.75)'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(4, 1, 0, 3.5); ctx.quadraticCurveTo(-4, 1, 0, -5); ctx.fill();
  }
  ctx.restore();
}

function drawAura(ctx, x, y, r, t, c1, c2, wind = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + Math.sin(t * 3) * 0.06 + wind * (0.12 + Math.sin(t * 24) * 0.04);
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * pulse);
  g.addColorStop(0, rgba(c1, 0.0)); g.addColorStop(0.6, rgba(c1, 0.12 + wind * 0.1)); g.addColorStop(0.85, rgba(c2, 0.18 + wind * 0.12)); g.addColorStop(1, rgba(c2, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, PI * 2); ctx.fill();
  // 立ちのぼる光の粒
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.6 + i / 6) % 1;
    const px = x + Math.sin(i * 2.3 + t) * r * 0.6, py = y + r * 0.6 - k * r * 1.4;
    ctx.fillStyle = rgba(i % 2 ? c1 : c2, 0.6 * (1 - k));
    ctx.beginPath(); ctx.arc(px, py, 1.5 + (1 - k) * 2, 0, PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawHpBar(ctx, x, y, w, h, frac, lag) {
  frac = clamp(frac || 0, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(42,20,48,0.88)';
  ctx.beginPath(); rr(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  if (lag != null && lag > frac) { ctx.fillStyle = 'rgba(255,240,200,0.85)'; ctx.beginPath(); rr(ctx, x - w / 2, y, w * clamp(lag, 0, 1), h, 2); ctx.fill(); }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (frac < 0.3) { g.addColorStop(0, '#ffb070'); g.addColorStop(1, '#ff3a1f'); }
  else { g.addColorStop(0, '#ff8fb8'); g.addColorStop(1, '#e8264f'); }
  ctx.fillStyle = g;
  if (frac > 0) { ctx.beginPath(); rr(ctx, x - w / 2, y, w * frac, h, 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - w / 2 + 1, y + 0.5, Math.max(0, w * frac - 2), Math.max(1, h * 0.25));
  if (w >= 80) { // 目盛り
    ctx.fillStyle = 'rgba(42,20,48,0.45)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x - w / 2 + (w * i) / 10 - 0.5, y + h * 0.5, 1, h * 0.5);
  }
  ctx.restore();
}

function drawBossTag(ctx, e, topY) {
  const def = e.def || {};
  const name = def.name || e.name || 'BOSS';
  const y = topY - 30;
  const frac = e.maxHp ? e.hp / e.maxHp : 1;
  // 遅れて減る白いダメージ帯
  if (e._hpLag == null || e._hpLag < frac) e._hpLag = frac;
  else e._hpLag += (frac - e._hpLag) * 0.04;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (def.title) {
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(def.title, e.x, y - 18);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(def.title, e.x, y - 18);
  }
  ctx.font = '900 18px "Arial Black", sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(name, e.x, y);
  const g = ctx.createLinearGradient(0, y - 16, 0, y);
  if (frac < 0.5) { g.addColorStop(0, '#ffd0a0'); g.addColorStop(1, '#ff2e4d'); }
  else { g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ff4fa0'); }
  ctx.fillStyle = g; ctx.fillText(name, e.x, y);
  ctx.restore();
  drawHpBar(ctx, e.x, y + 6, 110, 8, frac, e._hpLag);
}

// ================================================================ スライム（ソーダゼリー＋サングラス）
function drawSlime(ctx, w, h, col, t, st, boss, acc) {
  acc = acc || '#ff4fa0';
  const rage = POSE.rage, wind = POSE.windup;
  if (boss && rage) col = tone(hue(col, 150, 0.1, 0.02));
  // 一次運動（ぷるぷる）と二次運動（頂点が遅れて揺れる）
  let sq = Math.sin(t * 5) * 0.05, wob = Math.sin(t * 5 - 1.2) * 0.07;
  if (st === 'walk') { sq = Math.sin(t * 9) * 0.1; wob = Math.sin(t * 9 - 1.3) * 0.12; }
  if (st === 'jump') { sq = -0.16; wob = 0; }
  if (wind) { sq = 0.24 + Math.sin(t * 40) * 0.025; wob = Math.sin(t * 40) * 0.03; }
  else if (st === 'attack') { sq = -0.1 + Math.sin(t * 14) * 0.08; wob = Math.sin(t * 14 - 1) * 0.1; }
  if (st === 'hurt') { sq = -0.1; wob = 0.18; }
  if (st === 'dead') { sq = 0.46; wob = 0; }
  const W = w * 0.52 * (1 + sq), H = h * (1 - sq);
  const tx = wob * W * 0.7;

  ctx.save();
  // 王様のマント（後ろ）
  if (boss) {
    const fl = Math.sin(t * 3) * W * 0.05;
    ctx.beginPath(); ctx.moveTo(-W * 0.55, -H * 0.72); ctx.quadraticCurveTo(-W * 1.35 + fl, -H * 0.3, -W * 1.25 + fl, H * 0.02);
    ctx.lineTo(W * 1.25 - fl, H * 0.02); ctx.quadraticCurveTo(W * 1.35 - fl, -H * 0.3, W * 0.55, -H * 0.72); ctx.closePath();
    body(ctx, rage ? '#8a1030' : '#b0204a', -W * 1.3, -H * 0.72, W * 2.6, H * 0.74, { lw: 2.2, gloss: false });
    ctx.strokeStyle = C('#ffd23f'); ctx.lineWidth = Math.max(2, W * 0.05); ctx.beginPath(); ctx.moveTo(-W * 1.25 + fl, -H * 0.02); ctx.lineTo(W * 1.25 - fl, -H * 0.02); ctx.stroke();
  }
  // ゼリー本体: スクワッシュ前の基準形をスプライト化し、伸縮(scale)と頂点の遅れ(skew)は変換で与える
  const W0 = Math.round(w * 0.52 * 4) / 4, H0 = Math.round(h * 4) / 4;
  const bpath = (c) => {
    c.moveTo(-W0, 0);
    c.bezierCurveTo(-W0 * 1.1, -H0 * 0.56, -W0 * 0.5, -H0 * 0.96, 0, -H0);
    c.bezierCurveTo(W0 * 0.5, -H0 * 0.96, W0 * 1.1, -H0 * 0.56, W0, 0);
    c.quadraticCurveTo(0, H0 * 0.08, -W0, 0); c.closePath();
  };
  ctx.save();
  ctx.transform(1 + sq, 0, -tx / H0, 1 - sq, 0, 0);
  if (!FL) ctx.globalAlpha *= 0.92;
  cpart(ctx, 'slBody', -W0 * 1.12, -H0, W0 * 2.24, H0 * 1.08, 4, (c) => {
    c.beginPath(); bpath(c);
    body(c, col, -W0, -H0, W0 * 2, H0, {
      lw: 2.3, path: bpath,
      inner: (c) => {
        if (FL) return;
        c.fillStyle = rgba(shadow(col, 0.25), 0.45);
        c.beginPath(); c.ellipse(W0 * 0.15, -H0 * 0.3, W0 * 0.55, H0 * 0.28, 0, 0, PI * 2); c.fill();
        c.fillStyle = rgba(light(col, 0.5), 0.5);
        c.beginPath(); c.ellipse(-W0 * 0.1, -H0 * 0.06, W0 * 0.6, H0 * 0.06, 0, 0, PI * 2); c.fill();
      },
    });
    if (!FL) {
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath();
      c.ellipse(-W0 * 0.52, -H0 * 0.62, W0 * 0.13, H0 * 0.1, -0.7, 0, PI * 2);
      c.moveTo(-W0 * 0.23, -H0 * 0.82); c.arc(-W0 * 0.28, -H0 * 0.82, W0 * 0.05, 0, PI * 2); c.fill();
    }
  }, col + W0 + 'x' + H0);
  ctx.restore();
  // ソーダの泡（上へ昇る・本体内に収まるよう高さで幅を絞る）
  if (!FL) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const bx = [-0.5, 0.4, 0.1, -0.2, 0.6, -0.65][i], br = [0.07, 0.05, 0.04, 0.045, 0.035, 0.03][i];
      const yy = -0.15 - ((t * 0.22 + i * 0.19) % 0.6);
      const nar = 1 - Math.max(0, -yy - 0.35) * 1.3;
      const px = bx * W * nar + Math.sin(t * 2 + i) * W * 0.03 - tx * yy, py = yy * H, pr = br * W * 1.7;
      ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, PI * 2);
    }
    ctx.fill();
  }
  // 顔
  const fx = W * 0.12 + tx * 0.3, fy = -H * 0.42, er = Math.max(2.8, W * (boss ? 0.14 : 0.17)), gap = W * (boss ? 0.28 : 0.31);
  cuteEyes(ctx, fx, fy, er, gap, shadow(col, 0.1), st, t);
  blush(ctx, fx - gap - er * 0.9, fy + er * 1.7, er * 0.9); blush(ctx, fx + gap + er * 0.9, fy + er * 1.7, er * 0.85);
  mouth(ctx, fx, fy + er * 1.75, Math.max(1.6, er * 0.5), mouthFor(st, 'cat'));
  // サングラス: 通常=おでこ / ため=鼻までずらして睨む / 攻撃=装着 / 被弾=跳ね上がる
  let gy = -H * 0.8, gr = -0.08;
  if (st === 'dead') { gy = fy - er * 0.3; gr = 0.35; }
  else if (st === 'hurt') { gy = -H * 1.02; gr = -0.4; }
  else if (wind) { gy = fy + er * 0.55; gr = -0.03; }
  else if (st === 'attack' || (boss && rage)) { gy = fy - er * 0.15; gr = 0; }
  ctx.save(); ctx.translate(fx - W * 0.02, gy); ctx.rotate(gr);
  // サングラス本体は形が一定なのでスプライト化（大きさはスクワッシュ前の幅で決める）
  const Wb = Math.round(w * 0.52 * 4) / 4;
  const gw = Wb * 0.4, gh = Wb * 0.22, red = boss && rage;
  cpart(ctx, 'slGlass', -gw - Wb * 0.03, -gh / 2, gw * 2 + Wb * 0.06, gh, 2, (c) => {
    c.beginPath(); rr(c, -gw - Wb * 0.03, -gh / 2, gw, gh, gh * 0.4); rr(c, Wb * 0.03, -gh / 2, gw, gh, gh * 0.4);
    if (FL) fs(c, '#fff', 1.6);
    else {
      const lg = c.createLinearGradient(0, -gh / 2, 0, gh / 2);
      lg.addColorStop(0, red ? '#ff2e4d' : '#1a1a2a'); lg.addColorStop(1, red ? '#5a0010' : rgba(acc, 0.9));
      c.fillStyle = lg; c.fill(); c.strokeStyle = OC(); c.lineWidth = 1.7; c.stroke();
    }
    c.strokeStyle = C(acc); c.lineWidth = Math.max(1.2, Wb * 0.035); c.beginPath(); c.moveTo(-Wb * 0.05, -gh * 0.15); c.lineTo(Wb * 0.05, -gh * 0.15); c.stroke();
    if (!FL) {
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.moveTo(-gw * 0.9, -gh * 0.3); c.lineTo(-gw * 0.65, -gh * 0.3); c.lineTo(-gw * 0.85, gh * 0.3); c.lineTo(-gw * 0.98, gh * 0.3); c.closePath(); c.fill();
    }
  }, acc + (red ? 'R' : '') + Wb);
  if (!FL) {
    if (st === 'attack' && !wind) sparkle(ctx, gw * 0.75, -gh * 0.4, gh * 0.9, '#ffffff', 0.95);
    if (boss && rage) glow(ctx, 0, 0, gw * 1.5, '#ff2e4d', 0.5);
  }
  ctx.restore();
  if (boss) {
    // 宝石つきネックレス（胸元）＋王冠（てっぺん・揺れに追従）
    ctx.strokeStyle = C('#ffd23f'); ctx.lineWidth = Math.max(2, W * 0.05); ctx.setLineDash([W * 0.06, W * 0.04]);
    ctx.beginPath(); ctx.moveTo(-W * 0.75, -H * 0.16); ctx.quadraticCurveTo(0, H * 0.04, W * 0.8, -H * 0.18); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(W * 0.42, -H * 0.13, W * 0.07, 0, PI * 2); fs(ctx, acc, 1.6);
    sparkle(ctx, W * 0.45, -H * 0.16, W * 0.06, '#fff', 0.9);
    crownHQ(ctx, tx * 0.9, -H * 0.97, W * 0.33, acc, t, (rage ? -0.32 : -0.08) + wob * 0.5);
    // 第2形態: 怒りの湯気・泡の飛沫
    if (rage && !FL) {
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.8 + i / 4) % 1;
        ctx.fillStyle = `rgba(255,220,230,${0.45 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(-W * 0.6 + i * W * 0.4, -H * (1 + k * 0.5), W * (0.05 + k * 0.08), 0, PI * 2); ctx.fill();
      }
      ctx.strokeStyle = C('#ff2e4d'); ctx.lineWidth = Math.max(2, W * 0.04);
      const ax = W * 0.55, ay = -H * 0.72; // 怒りマーク
      ctx.beginPath(); for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(ax + dx * W * 0.03, ay + dy * W * 0.03); ctx.lineTo(ax + dx * W * 0.1, ay + dy * W * 0.04); ctx.moveTo(ax + dx * W * 0.03, ay + dy * W * 0.03); ctx.lineTo(ax + dx * W * 0.04, ay + dy * W * 0.1); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ================================================================ キノコ（パラソル傘のビーチキノコ）
function drawMushroom(ctx, w, h, col, t, st, acc) {
  const wind = POSE.windup;
  const walk = st === 'walk' || (st === 'attack' && !wind);
  const step = walk ? Math.sin(t * 10) : 0;
  const bob = walk ? Math.abs(Math.cos(t * 10)) * 2.2 : Math.sin(t * 2.5) * 0.8;
  let sq = st === 'dead' ? 0.32 : st === 'jump' ? -0.1 : wind ? 0.12 : Math.sin(t * 2.5 + 0.5) * 0.02;
  const S = w / 44;
  ctx.save();
  ctx.scale(S * (1 + sq * 0.5), S * (1 - sq));
  const stem = '#fff2dc';
  // 足
  for (const [fx, ph] of [[-7, 1], [7, -1]]) {
    ctx.beginPath(); ctx.ellipse(fx + step * 3 * ph, -2.6, 5.8, 3.6, 0, 0, PI * 2); part(ctx, shade(col, -0.3), fx - 6, -6, 12, 7, 1.8);
  }
  ctx.translate(0, -bob);
  // 柄（胴＋顔）
  bodyK(ctx, 'mStem', stem, -13, -28, 26, 28, (c) => { c.moveTo(-11, -4); c.bezierCurveTo(-14.5, -16, -11, -26, -9, -28); c.lineTo(9, -28); c.bezierCurveTo(11, -26, 14.5, -16, 11, -4);
  c.quadraticCurveTo(0, 0.5, -11, -4); c.closePath(); }, { lw: 2, gloss: false });
  // ちっちゃい手
  const aw = st === 'attack' && !wind ? Math.sin(t * 16) * 0.6 : Math.sin(t * 3) * 0.15;
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 12, -12); ctx.rotate(s * (0.5 + aw * s)); ctx.beginPath(); ctx.ellipse(0, 3, 2.6, 3.6, 0, 0, PI * 2); part(ctx, stem, -2.6, 0, 5.2, 7, 1.5); ctx.restore(); }
  cuteEyes(ctx, 1.5, -15.5, 3.2, 4.8, shade(col, -0.3), st, t);
  blush(ctx, -6.5, -10.5, 2.4); blush(ctx, 9.5, -10.5, 2.2);
  mouth(ctx, 1.5, -9.8, 1.7, mouthFor(st, 'cat'));
  // 傘（パラソル: 放射ストライプ＋スカラップ）
  const wob = Math.sin(t * 3 - 0.8) * 0.05 + (wind ? -0.18 : 0) + (st === 'hurt' ? 0.25 : 0) + step * 0.04;
  ctx.save(); ctx.translate(0, -28 + (wind ? 3 : 0)); ctx.rotate(wob);
  const R = 22, n = 6;
  const cap = (c) => {
    c.moveTo(-R, 2); c.bezierCurveTo(-R, -19, R, -19, R, 2);
    for (let i = 0; i < n; i++) { const x0 = R - (2 * R * i) / n, x1 = R - (2 * R * (i + 1)) / n; c.quadraticCurveTo((x0 + x1) / 2, 6.8, x1, 2); }
    c.closePath();
  };
  bodyK(ctx, 'cap' + acc, col, -R, -14, R * 2, 20, cap, {
    lw: 2.3, path: cap,
    inner: (c) => {
      c.fillStyle = C(acc || light(col, 0.75));
      for (let i = 0; i < n; i += 2) {
        const x0 = R - (2 * R * i) / n, x1 = R - (2 * R * (i + 1)) / n;
        c.beginPath(); c.moveTo(0, -15); c.lineTo(x0, 5); c.lineTo(x1, 5); c.closePath(); c.fill();
      }
      if (!FL) { c.fillStyle = 'rgba(60,0,60,0.18)'; c.beginPath(); c.ellipse(4, 4, R, 5, 0, 0, PI * 2); c.fill(); }
    },
  });
  if (!FL) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-10, -8, 6, 2.4, -0.55, 0, PI * 2); ctx.fill(); }
  // てっぺんの飾り（カクテルピック）
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -13.5); ctx.lineTo(2 + Math.sin(t * 4) * 0.6, -19.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(2.4 + Math.sin(t * 4) * 0.8, -20.5, 2.6, 0, PI * 2); part(ctx, acc || '#ffd23f', -0.2, -23, 5.2, 5.2, 1.4);
  ctx.restore();
  ctx.restore();
}

// ================================================================ フラミンゴ（ヤンキー）
function drawFlamingo(ctx, w, h, col, t, st, acc) {
  const S = h / 70;
  const wind = POSE.windup;
  const walk = st === 'walk' || (st === 'attack' && !wind);
  const sp = st === 'attack' ? 18 : 10;
  const s = walk ? Math.sin(t * sp) : 0;
  ctx.save(); ctx.scale(S, S);
  const dark = shadow(col, 0.25);
  const leg = '#ff9fbf';
  // 脚（細く膝が逆）。ため=片足立ち
  const legs = wind ? [[-2, 0], [3, 0.0001]] : [[-2, s], [3, -s]];
  legs.forEach(([lx, ph], i) => {
    if (wind && i === 1) { // 折りたたみ脚
      ctx.strokeStyle = OC(); ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(lx, -30); ctx.lineTo(lx - 7, -22); ctx.lineTo(lx + 1, -18); ctx.stroke();
      ctx.strokeStyle = C(leg); ctx.lineWidth = 2; ctx.stroke(); return;
    }
    const kx = lx + ph * 5 + 3, ky = -14;
    ctx.strokeStyle = OC(); ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(lx, -30); ctx.lineTo(kx, ky); ctx.lineTo(lx + ph * 7, -1); ctx.stroke();
    ctx.strokeStyle = C(leg); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(kx, ky, 2, 0, PI * 2); fs(ctx, leg, 1.2);
    ctx.beginPath(); ctx.ellipse(lx + ph * 7 + 2.5, -1, 4.2, 1.9, 0, 0, PI * 2); fs(ctx, leg, 1.4);
  });
  const bob = walk ? Math.abs(Math.cos(t * sp)) * 1.5 : Math.sin(t * 2) * 0.6;
  ctx.translate(0, -bob + (wind ? 2 : 0));
  if (wind) ctx.rotate(-0.08);
  // 尾羽
  ctx.beginPath(); ctx.moveTo(-15, -41); ctx.lineTo(-25, -46); ctx.lineTo(-20, -39); ctx.lineTo(-26, -36); ctx.lineTo(-15, -34); ctx.closePath(); part(ctx, dark, -26, -46, 11, 12, 1.8);
  // 胴体
  bodyK(ctx, 'flBody', col, -18, -54, 30, 26, (c) => { c.moveTo(-16, -38); c.bezierCurveTo(-18, -51, 2, -55, 10, -46); c.bezierCurveTo(14, -40, 10, -30, 0, -29);
  c.bezierCurveTo(-8, -28, -14, -31, -16, -38); c.closePath(); }, { lw: 2.2 });
  // 羽（重なり3枚）
  const wf = st === 'attack' && !wind ? Math.sin(t * 18) * 0.25 : Math.sin(t * 2.2) * 0.04;
  ctx.save(); ctx.translate(-2, -44); ctx.rotate(wf);
  cpart(ctx, 'flWings', -9, -5, 19, 15, 1.5, (c) => {
    for (let k = 0; k < 3; k++) {
      c.beginPath(); c.moveTo(-6 + k * 1.5, -0.5 + k * 1.2); c.quadraticCurveTo(6, -4 + k, 9 - k * 2, 5 + k * 1.6); c.quadraticCurveTo(0, 8 + k, -8 + k, 4 + k); c.closePath();
      part(c, k === 0 ? light(col, 0.3) : k === 1 ? light(col, 0.15) : col, -8, -4, 17, 12, 1.4);
    }
  }, col);
  ctx.restore();
  // 首（S字）— 二次運動で頭が遅れて揺れる
  const nk = st === 'attack' && !wind ? 4 + Math.sin(t * 18) * 1.5 : wind ? -4 : Math.sin(t * 2 - 0.8) * 0.8;
  ctx.strokeStyle = OC(); ctx.lineWidth = 7.8; ctx.beginPath();
  ctx.moveTo(6, -45); ctx.bezierCurveTo(14 + nk, -52, 2 + nk, -58, 8 + nk, -64); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = 4.2; ctx.stroke();
  ctx.strokeStyle = C(light(col, 0.3)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(5.5, -46.5); ctx.bezierCurveTo(12.5 + nk, -52.5, 0.5 + nk, -58, 6.5 + nk, -63); ctx.stroke();
  // 頭
  const hx = 10 + nk, hy = -65;
  ctx.translate(hx, hy);
  cpart(ctx, 'flHead', -8.5, -8.5, 25, 17, 1.5, (c) => {
    c.beginPath(); c.arc(0, 0, 7.4, 0, PI * 2); body(c, col, -7.4, -7.4, 14.8, 14.8, { lw: 2, gloss: false });
    c.beginPath(); c.moveTo(5, -2); c.quadraticCurveTo(14, -2.5, 15.5, 4); c.quadraticCurveTo(10, 2, 5, 3); c.closePath(); part(c, '#fff2dc', 5, -2, 10, 6, 1.6);
    c.beginPath(); c.moveTo(11, -1.8); c.quadraticCurveTo(15.5, -1, 15.5, 4); c.lineTo(11.5, 2); c.closePath(); fs(c, '#2a1430', 1);
  }, col);
  ctx.translate(-hx, -hy);
  // リーゼント（モヒカン）— 揺れ遅れ
  const mh = Math.sin(t * 3 - 1.5) * 0.8;
  ctx.beginPath(); ctx.moveTo(hx - 6, hy - 3); ctx.lineTo(hx - 8 + mh, hy - 12); ctx.lineTo(hx - 3, hy - 7.5); ctx.lineTo(hx - 2 + mh, hy - 15.5); ctx.lineTo(hx + 1, hy - 7.5); ctx.lineTo(hx + 5 + mh, hy - 12); ctx.lineTo(hx + 4, hy - 5); ctx.closePath();
  part(ctx, acc || '#ff3d7f', hx - 8, hy - 15, 13, 12, 1.6);
  // くちばし
  // サングラス（ため=ずらして睨む）
  if (st === 'hurt' || st === 'dead') cuteEyes(ctx, hx + 2, hy - 1, 2.2, 0.01, '#000', st, t);
  else {
    if (wind) {
      cuteEyes(ctx, hx + 2, hy - 2.5, 1.9, 0.01, '#3a1030', st, t);
      ctx.save(); ctx.translate(0, 2.5);
    }
    ctx.beginPath(); rr(ctx, hx - 3, hy - 4.2, 9.5, 4.6, 1.8);
    if (FL) fs(ctx, '#fff', 1.3);
    else { const lg = ctx.createLinearGradient(0, hy - 4, 0, hy + 1); lg.addColorStop(0, '#1a1a2a'); lg.addColorStop(1, rgba(acc || '#ff3d7f', 0.9)); ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(hx - 1, hy - 3.2, 2.4, 1);
    ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3); ctx.lineTo(hx - 6.5, hy - 4); ctx.stroke();
    if (wind) ctx.restore();
    if (st === 'attack' && !wind) sparkle(ctx, hx + 5, hy - 4, 3, '#fff', 0.9);
  }
  blush(ctx, hx - 1, hy + 3.2, 2);
  ctx.restore();
}

// ================================================================ ワニ（ちょいワル・金チェーン / ボス: 沼のドン）
function drawGator(ctx, w, h, col, t, st, boss, acc) {
  acc = acc || '#ffd23f';
  const rage = POSE.rage, wind = POSE.windup;
  const S = w / 92;
  const walk = st === 'walk' || (st === 'attack' && !wind);
  const sp = st === 'attack' ? 14 : 8;
  const s = walk ? Math.sin(t * sp) : 0;
  const jaw = wind ? 0.55 + Math.sin(t * 30) * 0.03 : st === 'attack' ? 0.3 + Math.abs(Math.sin(t * 12)) * 0.3 : st === 'hurt' ? 0.25 : st === 'dead' ? 0.3 : 0.04 + Math.max(0, Math.sin(t * 1.5)) * 0.05;
  const belly = boss ? '#f4e2a8' : '#eaf2b0';
  const dark = shadow(col, 0.3);
  ctx.save(); ctx.scale(S, S * (h / w) / (40 / 92) * 0.95);
  if (st === 'dead') ctx.scale(1, 0.85);
  // ため: 後ろ脚で踏ん張って前を持ち上げる
  if (wind) { ctx.translate(-4, 0); ctx.rotate(-0.08); }
  const breath = Math.sin(t * 2) * 0.6;
  // 尻尾（二次運動: 付け根→先へ遅れて揺れる）
  const tw1 = Math.sin(t * 4) * 2.2, tw2 = Math.sin(t * 4 - 1.2) * 4;
  const tail = (c) => { c.moveTo(-24, -24); c.bezierCurveTo(-36, -22 + tw1, -46, -14 + tw2, -58, -8 + tw2); c.quadraticCurveTo(-42, -4 + tw1, -24, -6); c.closePath(); };
  ctx.beginPath(); tail(ctx); body(ctx, col, -58, -24, 34, 18, { lw: 2, gloss: false });
  // 尻尾のトゲ
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const k = i / 4; const x = -28 - k * 26, y = -22.5 + k * 13 + (k > 0.4 ? tw2 * k : tw1 * k); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 4.5 + k * 1.5); ctx.lineTo(x - 4.5, y + 0.5); }
  fs(ctx, dark, 1.4);
  // 奥の脚
  for (const [lx, ph] of [[-16, -1], [14, 1]]) { ctx.translate(s * 3 * ph, 0); partK(ctx, lx < 0 ? 'gLegFL' : 'gLegFR', dark, lx - 4, -12, 8, 12, (c) => rr(c, lx - 4, -12, 8, 12, 3.5), 1.8); ctx.translate(-s * 3 * ph, 0); }
  // 胴
  const bodyP = (c) => { c.ellipse(-2, -18, 28, 14, 0, 0, PI * 2); };
  ctx.save(); ctx.translate(0, -4); ctx.scale(1, 1 + breath * 0.025); ctx.translate(0, 4);
  bodyK(ctx, 'gatorBody' + (boss ? 'B' : ''), col, -30, -32, 56, 28, bodyP, {
    lw: 2.3, gloss: false, path: bodyP,
    inner: (c) => {
      // 腹板（横じま）
      c.fillStyle = C(belly); c.beginPath(); c.ellipse(-2, -5.5, 25, 7.5, 0, 0, PI * 2); c.fill();
      if (!FL) {
        c.strokeStyle = rgba(shade(belly, -0.35), 0.7); c.lineWidth = 0.9; c.beginPath();
        for (let i = -4; i <= 4; i++) { c.moveTo(-2 + i * 5.2, -12); c.lineTo(-2 + i * 5.6, -1); }
        c.stroke();
      }
      // 背中の鱗（2列の盛り上がり＋ハイライト）
      for (let row = 0; row < 2; row++) for (let i = -3; i <= 3; i++) {
        const x = -2 + i * 7 + row * 3.5, y = -27 + row * 5 + Math.abs(i) * 0.4;
        c.fillStyle = C(row ? col : shadow(col, 0.12)); c.beginPath(); c.ellipse(x, y, 3.2, 2.2, 0, 0, PI * 2); c.fill();
        if (!FL) { c.fillStyle = rgba(light(col, 0.4), 0.7); c.beginPath(); c.ellipse(x - 0.8, y - 0.8, 1.4, 0.7, 0, 0, PI * 2); c.fill(); }
      }
    },
  });
  ctx.restore();
  // 背中のトゲ（鋭い・ボス第2形態で発光）
  partK(ctx, 'gSpikes', dark, -26, -38.5, 52.5, 9, (c) => { for (let i = 0; i < 7; i++) { const x = -26 + i * 7.6, b = Math.abs(i - 3) * 0.9; c.moveTo(x, -30 + b * 0.8); c.lineTo(x + 3.2, -38.5 + b); c.lineTo(x + 6.2, -30 + b * 0.8); } }, 1.6);
  if (boss && rage && !FL) { for (let i = 0; i < 7; i++) glow(ctx, -22.8 + i * 7.6, -35 + Math.abs(i - 3), 6, '#ff7a2a', 0.5 + 0.3 * Math.sin(t * 6 + i)); }
  // 頭
  ctx.save(); ctx.translate(22, -22); if (wind) ctx.rotate(-0.1);
  // 下顎
  ctx.save(); ctx.rotate(jaw);
  cpart(ctx, 'gJawLA', -1, -2, 33, 14, 2, (c) => {
    bodyK(c, 'gJawL' + (boss ? 'B' : ''), col, 0, 2, 31, 9, (c) => { c.moveTo(0, 2); c.lineTo(27, 3); c.quadraticCurveTo(31, 4, 29, 8.5); c.lineTo(2, 10.5); c.closePath(); }, { lw: 2, gloss: false, rim: false });
    c.fillStyle = C('#ffffff'); c.beginPath();
    for (let i = 0; i < 6; i++) { const x = 5 + i * 3.9, th = i % 2 ? 2.6 : 3.6; c.moveTo(x, 3); c.lineTo(x + 1.3, 3 - th); c.lineTo(x + 2.6, 3); }
    c.fill(); c.strokeStyle = OC(); c.lineWidth = 0.7; c.stroke();
    if (boss) { c.fillStyle = C('#ffd23f'); c.beginPath(); c.moveTo(20.6, 3); c.lineTo(21.9, -0.8); c.lineTo(23.2, 3); c.fill(); }
    c.fillStyle = C('#c2304a'); c.beginPath(); c.moveTo(2, 3.2); c.lineTo(26, 3.6); c.lineTo(4, 6); c.closePath(); c.fill();
  }, col + (boss ? 'B' : ''));
  ctx.restore();
  // 上顎（長い鼻先＋鼻こぶ）
  cpart(ctx, 'gJawUA', -6, -18, 42, 26, 2, (c) => {
    bodyK(c, 'gJawU', col, -5, -15, 40, 19, (c) => { c.moveTo(-5, -8); c.quadraticCurveTo(5, -16, 14, -9); c.lineTo(27, -5.5); c.quadraticCurveTo(30, -8, 33, -5); c.quadraticCurveTo(35, -2, 32, 2); c.lineTo(0, 4); c.closePath(); }, { lw: 2.2, gloss: false });
    c.fillStyle = C('#ffffff'); c.beginPath();
    for (let i = 0; i < 6; i++) { const x = 7 + i * 3.9, th = i % 2 ? 2.4 : 3.4; c.moveTo(x, 3); c.lineTo(x + 1.3, 3 + th); c.lineTo(x + 2.6, 3); }
    c.fill(); c.strokeStyle = OC(); c.lineWidth = 0.7; c.stroke();
    c.fillStyle = C(dark); c.beginPath(); c.ellipse(30.5, -4.8, 1.3, 0.9, 0.3, 0, PI * 2); c.fill();
    // 鼻先の点々（感覚孔）
    if (!FL) { c.fillStyle = rgba(dark, 0.7); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(17 + i * 3.4, -4 + (i % 2), 0.55, 0, PI * 2); c.fill(); } }
    // 目（盛り上がった眼窩＋鋭い発光目）
    partK(c, 'gSock', col, -1, -17, 14, 7, (c) => { c.arc(6, -10, 6.8, PI, 0); c.closePath(); }, 2);
  }, col);
  const eyeC = boss ? (rage ? '#ff3a2a' : '#ffd23f') : '#ffe25a';
  if (boss && !rage && st !== 'hurt' && st !== 'dead' && !wind) {
    // ボス: サングラス（ため/怒りで外して睨む）
    ctx.beginPath(); rr(ctx, -0.5, -13.5, 14, 5.4, 2);
    if (FL) fs(ctx, '#fff', 1.3);
    else { const lg = ctx.createLinearGradient(0, -13, 0, -8); lg.addColorStop(0, '#1a1a2a'); lg.addColorStop(1, '#6a3a9a'); ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = OC(); ctx.lineWidth = 1.3; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(1.5, -12.5, 3, 1.2);
  } else fierceEye(ctx, 6.4, -11, 3.7, eyeC, st, t, true, -0.12);
  if (boss && !FL) { // 傷跡
    ctx.strokeStyle = rgba('#2a1430', 0.7); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(2, -17); ctx.lineTo(9, -6); ctx.moveTo(3.5, -13.5); ctx.lineTo(5.5, -14.5); ctx.moveTo(5.5, -10.5); ctx.lineTo(7.5, -11.5); ctx.stroke();
  }
  if (!boss) blush(ctx, 13, -3, 2.4);
  if (boss) {
    crownHQ(ctx, 4, -17, 6.6, '#ff3d7f', t, rage ? -0.45 : -0.15);
    // 葉巻（先端が赤く光り、煙が上る）
    ctx.save(); ctx.translate(27, 3.5); ctx.rotate(-0.12 - jaw * 0.3);
    ctx.beginPath(); rr(ctx, 0, -1.3, 10, 2.6, 1.2); part(ctx, '#7a4a2a', 0, -1.3, 10, 2.6, 1);
    ctx.fillStyle = C('#ffd23f'); ctx.fillRect(1.6, -1.3, 1.4, 2.6);
    glow(ctx, 10, 0, 5, '#ff6a2a', 0.8 + Math.sin(t * 5) * 0.2);
    ctx.fillStyle = C('#ff8a3a'); ctx.beginPath(); ctx.arc(10, 0, 1.3, 0, PI * 2); ctx.fill();
    ctx.restore();
    if (!FL) for (let i = 0; i < 3; i++) {
      const k = (t * 0.5 + i / 3) % 1;
      ctx.fillStyle = `rgba(230,230,240,${0.4 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(37 + Math.sin(t * 2 + i) * 2 + k * 4, 1 - k * 22, 1.5 + k * 3.5, 0, PI * 2); ctx.fill();
    }
    if (rage && !FL) { // 鼻息
      for (let i = 0; i < 2; i++) { const k = (t * 1.6 + i / 2) % 1; ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(33 + k * 8, -6 - k * 4, 1 + k * 2.5, 0, PI * 2); ctx.fill(); }
    }
  }
  if (wind && !FL) sparkle(ctx, 18, 5, 4 + Math.sin(t * 30), '#ffffff', 0.9);
  ctx.restore();
  // 金チェーン（リンク）
  cpart(ctx, 'gChain', 10, -32, 16, 30, 2, (c) => {
    const chain = boss ? 2.4 : 1.8;
    c.strokeStyle = OC(); c.lineWidth = chain * 2 + 1.6; c.beginPath(); c.moveTo(16, -29); c.quadraticCurveTo(22, -13, 17, -6); c.stroke();
    c.strokeStyle = C(shade(acc, -0.2)); c.lineWidth = chain * 2; c.stroke();
    c.strokeStyle = C(light(acc, 0.4)); c.lineWidth = chain; c.setLineDash([2, 1.6]); c.stroke(); c.setLineDash([]);
    metalK(c, boss ? 'gMedB' : 'gMed', acc, 13, -9.5, 8, 8, (c) => c.arc(17, -5.5, boss ? 4 : 2.8, 0, PI * 2), 1.2);
  }, acc + (boss ? 'B' : ''));
  if (boss && !FL) { ctx.fillStyle = '#7a4a00'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; textUp(ctx, '$', 17, -5.3); }
  // 手前の脚（筋肉の盛り上がり＋爪）
  for (const [lx, ph] of [[-12, 1], [18, -1]]) {
    const dx = s * 3 * ph;
    ctx.translate(lx + dx, 0);
    cpart(ctx, 'gLegN', -7, -15, 14, 17, 2, (c) => {
      c.beginPath(); c.moveTo(-5, -14); c.quadraticCurveTo(-6.5, -6, -4.5, 0); c.lineTo(4.5, 0); c.quadraticCurveTo(6, -8, 4, -14); c.closePath();
      body(c, col, -6, -14, 12, 14, { lw: 1.9, gloss: false });
      c.fillStyle = C('#ffffff'); c.beginPath(); for (let k = 0; k < 3; k++) { const cx = -2.5 + k * 2.6; c.moveTo(cx - 1, 0); c.lineTo(cx + 1.6, 0.4); c.lineTo(cx + 0.4, -1.6); } c.fill();
    }, col);
    ctx.translate(-lx - dx, 0);
  }
  ctx.restore();
}

// ================================================================ ドローン（流線形メカ・発光レンズ）
function drawDrone(ctx, w, h, col, t, st, acc) {
  const S = w / 44;
  const wind = POSE.windup;
  const hov = Math.sin(t * 4) * 2, hov2 = Math.sin(t * 4 - 0.9);
  ctx.save();
  ctx.translate(0, -h * 0.5 + hov);
  ctx.scale(S, S);
  if (st === 'dead') ctx.rotate(0.55);
  else if (st === 'hurt') ctx.rotate(Math.sin(t * 40) * 0.14);
  else ctx.rotate((st === 'walk' ? 0.14 : 0) + hov2 * 0.03 + (wind ? -0.12 : 0));
  const hull = acc || mix('#2e3148', col, 0.22);
  // 機体（アーム・ナセル・シェル・パネルライン・発光ストリップ・レンズ枠・銃口）は1枚のスプライト
  const hp = (c) => { c.moveTo(-14, -5); c.lineTo(-9, -12.5); c.lineTo(8, -12.5); c.lineTo(14, -6); c.lineTo(11, 3); c.quadraticCurveTo(0, 9, -11, 3); c.closePath(); };
  cpart(ctx, 'drFrame', -22, -13, 44, 22, 2, (c) => {
    c.beginPath(); for (const sx of [-1, 1]) { c.moveTo(sx * 8, -8); c.lineTo(sx * 19, -10); c.lineTo(sx * 19, -7); c.lineTo(sx * 8, -4); c.closePath(); }
    metal(c, '#5a5f7a', -19, -10, 38, 6, 1.4);
    for (const rx of [-19, 19]) { c.beginPath(); rr(c, rx - 2.5, -12, 5, 6, 1.5); metal(c, '#3a3f58', rx - 2.5, -12, 5, 6, 1.2); }
    c.beginPath(); rr(c, 6, 5, 8, 2.8, 1); metal(c, '#3a3d4a', 6, 5, 8, 2.8, 1.1);
    c.beginPath(); hp(c); metal(c, hull, -14, -12.5, 28, 20, 2);
    c.strokeStyle = C(rgba('#0a0614', 0.55)); c.lineWidth = 0.8; c.beginPath();
    c.moveTo(-9, -12.5); c.lineTo(-11, -4); c.moveTo(8, -12.5); c.lineTo(10, -4); c.moveTo(-12, 0); c.lineTo(12, 0); c.stroke();
    c.fillStyle = C(col); c.fillRect(-12, -5.5, 24, 1.8);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-12, -5.5, 24, 0.6);
    c.beginPath(); c.arc(3, 1.5, 5.6, 0, PI * 2); metal(c, '#1a1a28', -2.6, -4, 11.2, 11.2, 1.6);
  }, col + hull);
  // ローター（ブレ円盤＋回転ブレード）
  if (!FL) for (const rx of [-19, 19]) {
    ctx.fillStyle = 'rgba(220,240,255,0.22)'; ctx.beginPath(); ctx.ellipse(rx, -12.5, 12, 2.4, 0, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 0.8; ctx.stroke();
    const ph = t * 55 + rx;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(rx - Math.cos(ph) * 11, -12.5 - Math.sin(ph) * 2); ctx.lineTo(rx + Math.cos(ph) * 11, -12.5 + Math.sin(ph) * 2); ctx.stroke();
  }
  glow(ctx, 0, -4.5, 12, col, 0.35 + ENV.night * 0.25);
  // カメラ目（ため=レンズがズーム＋照準リング）
  const eyeCol = st === 'attack' || wind ? '#ff2e4d' : col;
  if (st === 'dead') { ctx.strokeStyle = C('#ff2e4d'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(1, -0.5); ctx.lineTo(5, 3.5); ctx.moveTo(5, -0.5); ctx.lineTo(1, 3.5); ctx.stroke(); }
  else {
    const lr = wind ? 2.2 + Math.sin(t * 30) * 0.4 : 3.2;
    glow(ctx, 3.5, 1.5, 9, eyeCol, 0.7);
    ctx.fillStyle = C(eyeCol); ctx.beginPath(); ctx.arc(3.5, 1.5, lr, 0, PI * 2); ctx.fill();
    ctx.fillStyle = C(light(eyeCol, 0.6)); ctx.beginPath(); ctx.arc(3.5, 1.5, lr * 0.45, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -0.2, 1, 0, PI * 2); ctx.fill();
    if (wind && !FL) { ctx.strokeStyle = rgba('#ff2e4d', 0.8); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(3.5, 1.5, 7.5 + Math.sin(t * 20), 0, PI * 2); ctx.moveTo(12, 1.5); ctx.lineTo(16, 1.5); ctx.stroke(); }
  }
  // 点滅ランプ
  if (((t * 2) | 0) % 2 === 0) { glow(ctx, -9, -10.5, 4, '#ff2e4d', 0.8); ctx.fillStyle = C('#ff2e4d'); ctx.beginPath(); ctx.arc(-9, -10.5, 1.3, 0, PI * 2); ctx.fill(); }
  // アンテナ
  ctx.strokeStyle = OC(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, -12.5); ctx.lineTo(-5 - hov2, -18); ctx.stroke();
  ctx.fillStyle = C(col); ctx.beginPath(); ctx.arc(-5 - hov2, -18.5, 1.5, 0, PI * 2); ctx.fill();
  if (st === 'attack' && !wind) glow(ctx, 15, 6.4, 5, '#ffd23f', 0.8);
  ctx.restore();
}

// ================================================================ ボス: メカ・ハイローラー（スロットマシン型警備メカ）
const SLOT_SYM = ['7', '$', '♦', 'BAR', '♣'];
function drawMecha(ctx, w, h, col, t, st, acc) {
  const rage = POSE.rage, wind = POSE.windup;
  const S = w / 140;
  const hov = Math.sin(t * 2.2) * 4, hov2 = Math.sin(t * 2.2 - 1);
  ctx.save();
  ctx.translate(0, -h * 0.55 + hov);
  ctx.scale(S, S);
  const shake = st === 'hurt' ? Math.sin(t * 50) * 2 : wind ? Math.sin(t * 60) * 1.2 : 0;
  ctx.translate(shake, 0);
  if (st === 'dead') ctx.rotate(0.35);
  else ctx.rotate(hov2 * 0.02 + (st === 'walk' ? 0.05 : 0));
  const gold = col || '#ffd23f';
  const chassis = rage ? '#2a1418' : '#1e1a2a';
  const lamp = rage ? '#ff2e4d' : (acc || '#ff4fa0');
  // オーラ（ネオン）
  if (!FL) {
    glow(ctx, 0, 0, 95 + wind * 15, rage ? '#ff2e4d' : gold, 0.22 + wind * 0.2);
  }
  // 4ローターアーム
  for (const [ax, ay] of [[-62, -34], [62, -34], [-54, -50], [54, -50]]) {
    ctx.beginPath(); ctx.moveTo(Math.sign(ax) * 26, ay * 0.5 + 2); ctx.lineTo(ax, ay); ctx.lineTo(ax, ay + 6); ctx.lineTo(Math.sign(ax) * 26, ay * 0.5 + 10); ctx.closePath();
    metal(ctx, '#4a4e66', -62, ay, 124, 14, 1.8);
    ctx.beginPath(); rr(ctx, ax - 5, ay - 6, 10, 9, 2); metal(ctx, gold, ax - 5, ay - 6, 10, 9, 1.6);
    if (!FL) {
      ctx.fillStyle = 'rgba(220,240,255,0.2)'; ctx.beginPath(); ctx.ellipse(ax, ay - 7, 26, 4.5, 0, 0, PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(gold, 0.5); ctx.lineWidth = 1; ctx.stroke();
      const ph = t * 50 + ax;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax - Math.cos(ph) * 25, ay - 7 - Math.sin(ph) * 4); ctx.lineTo(ax + Math.cos(ph) * 25, ay - 7 + Math.sin(ph) * 4); ctx.stroke();
    }
  }
  // 腕キャノン（ため=銃口が発光チャージ）
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 38, 22); ctx.rotate(side > 0 ? (wind ? -0.25 : st === 'attack' ? -0.1 : 0.2 + hov2 * 0.05) : 0.3);
    ctx.beginPath(); rr(ctx, -9, -7, 18, 14, 4); metal(ctx, '#3a3d52', -9, -7, 18, 14, 2);
    ctx.beginPath(); rr(ctx, 4, -5, 26, 10, 3); metal(ctx, gold, 4, -5, 26, 10, 2);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(30, -3 + i * 3, 1.5, 0, PI * 2); fs(ctx, '#1a1a24', 0.8); }
    if (wind || st === 'attack') { const k = wind ? 0.6 + 0.4 * Math.sin(t * 30) : 0.9; glow(ctx, 32, 0, 18 * k, rage ? '#ff4a4a' : '#7af7ff', 0.9); }
    ctx.restore();
  }
  // 本体（スロット筐体）
  const shell = (c) => { c.moveTo(-34, -34); c.quadraticCurveTo(-34, -46, -22, -46); c.lineTo(22, -46); c.quadraticCurveTo(34, -46, 34, -34); c.lineTo(30, 26); c.quadraticCurveTo(0, 38, -30, 26); c.closePath(); };
  ctx.beginPath(); shell(ctx);
  metal(ctx, chassis, -34, -46, 68, 80, 2.8, false);
  // 金の縁取り・パネルライン
  ctx.strokeStyle = C(gold); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-31, -30); ctx.lineTo(31, -30); ctx.moveTo(-30, 14); ctx.lineTo(30, 14); ctx.stroke();
  ctx.strokeStyle = C(rgba('#ffffff', 0.12)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-20, 14); ctx.lineTo(-18, 30); ctx.moveTo(20, 14); ctx.lineTo(18, 30); ctx.stroke();
  // マーキー（電球が流れる）
  ctx.beginPath(); rr(ctx, -26, -58, 52, 14, 6); metal(ctx, gold, -26, -58, 52, 14, 2);
  if (!FL) { ctx.fillStyle = rage ? '#ffd0d0' : '#2a0b3d'; ctx.font = '900 9px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; textUp(ctx, rage ? 'DANGER' : 'JACKPOT', 0, -51); }
  for (let i = 0; i < 9; i++) {
    const on = (((t * 8) | 0) + i) % 3 === 0;
    const bx = -24 + i * 6;
    ctx.fillStyle = C(on ? '#fff6a0' : '#8a6a20'); ctx.beginPath(); ctx.arc(bx, -59.5, 1.6, 0, PI * 2); ctx.fill();
    if (on) glow(ctx, bx, -59.5, 4, '#fff6a0', 0.6);
  }
  // リール窓＝顔（3つの目）
  ctx.beginPath(); rr(ctx, -27, -26, 54, 34, 5); fs(ctx, '#0c0814', 2);
  for (let i = 0; i < 3; i++) {
    const rx = -18 + i * 18;
    ctx.save(); ctx.beginPath(); rr(ctx, rx - 7.5, -23.5, 15, 29, 3); ctx.clip();
    ctx.fillStyle = C(rage ? '#ffe0e0' : '#fffaf0'); ctx.fillRect(rx - 7.5, -23.5, 15, 29);
    if (!FL) {
      const spin = wind || st === 'attack';
      const sy = spin ? (t * 220 + i * 40) % 20 : 0;
      ctx.font = 'bold 13px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let k = -1; k <= 1; k++) {
        const sym = st === 'hurt' || st === 'dead' ? 'X' : rage ? '☠' : spin ? SLOT_SYM[(i + k + 5 + ((t * 11) | 0)) % 5] : '7';
        ctx.fillStyle = sym === '7' ? '#e8264f' : rage ? '#a0001a' : '#2a1430';
        ctx.globalAlpha = spin ? 0.55 : (k === 0 ? 1 : 0.3);
        textUp(ctx, sym, rx, -9 + k * 20 + sy);
      }
      ctx.globalAlpha = 1;
      const sg = ctx.createLinearGradient(0, -23.5, 0, 5.5);
      sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(0.65, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = sg; ctx.fillRect(rx - 7.5, -23.5, 15, 29);
    }
    ctx.restore();
  }
  // 照準ライン（ため）
  if (wind && !FL) { ctx.strokeStyle = rgba('#ff2e4d', 0.6 + 0.4 * Math.sin(t * 30)); ctx.lineWidth = 1.4; ctx.strokeRect(-28, -27, 56, 36); }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(-26, -25); ctx.lineTo(-14, -25); ctx.lineTo(-24, 7); ctx.lineTo(-26, 7); ctx.closePath(); ctx.fill();
  // レバー（右側）
  const lv = wind ? 0.9 : Math.sin(t * 1.5) * 0.1;
  ctx.save(); ctx.translate(34, -10); ctx.rotate(lv);
  ctx.strokeStyle = OC(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -22); ctx.stroke();
  ctx.strokeStyle = C('#c0c4d8'); ctx.lineWidth = 2.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(10, -24, 5, 0, PI * 2); fs(ctx, lamp, 1.8); glow(ctx, 10, -24, 9, lamp, 0.6);
  ctx.restore();
  // コイン投入口・ステータスLED
  ctx.beginPath(); rr(ctx, -8, 18, 16, 6, 2); fs(ctx, '#0c0814', 1.4);
  for (let i = 0; i < 4; i++) { const on = ((t * 3 | 0) + i) % 4 === 0; glow(ctx, -22 + i * 3.5 + (i > 1 ? 37 : 0), 20, on ? 4 : 0, lamp, 0.8); ctx.fillStyle = C(on ? lamp : rgba(lamp, 0.3)); ctx.beginPath(); ctx.arc(-22 + i * 3.5 + (i > 1 ? 37 : 0), 20, 1.4, 0, PI * 2); ctx.fill(); }
  // 第2形態: 装甲の亀裂・火花・煙
  if (rage && !FL) {
    ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(-24, -2); ctx.lineTo(-28, 6); ctx.moveTo(26, 16); ctx.lineTo(20, 24); ctx.stroke();
    glow(ctx, -26, -2, 10, '#ff7a2a', 0.6);
    for (let i = 0; i < 4; i++) {
      const k = (t * 1.3 + i / 4) % 1;
      ctx.fillStyle = `rgba(70,60,80,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(-26 + Math.sin(i * 3 + t) * 4, -8 - k * 40, 3 + k * 9, 0, PI * 2); ctx.fill();
    }
    if (((t * 7) | 0) % 3 === 0) { sparkle(ctx, 24, 20, 6, '#ffe080', 1); sparkle(ctx, -28, 4, 5, '#ffe080', 1); }
  }
  ctx.restore();
}
