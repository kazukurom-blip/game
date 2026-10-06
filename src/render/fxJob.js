// 職ごとのスキル演出（effects.js の拡張）。
//  - FX_TYPES[type] = {life, init(e, R, N), draw(ctx, e, k), tick?(e, dt, game, spawn), add?:bool}
//  - themeSpawn(game, e, spawn): skills.js 等が出した汎用エフェクト（slash/muzzle/explosion/spark/dash/buff/hit…）を
//    色 → 習得スキル → 系統・段階で判定し、系統別の追加エフェクトを重ねる（段階が上がるほど派手）。
// 重くしない: グラデーションは1エフェクト1つまで、粒は1パスにまとめる、ゴースト（残像）はプール canvas を再利用。
import { rgba, shade, starPath, makeCanvas, clamp, mix } from './util.js';
import { mapleWordImage, mapleHasGlyphs } from './mapleFont.js';
import { drawCharacter, lastDrawnArgs } from './character.js';
import { resolveSkillStyle, gearTrail, RAINBOW, rainbowAt, BRANCH_STYLE, jobStyleOf, FXA } from './fxStyle.js';

const PI = Math.PI, TAU = PI * 2;
const ease = (k) => 1 - (1 - k) * (1 - k);

// ================================================================ ゴースト（残像）スナップショット
const GH_W = 150, GH_H = 132, GH_N = 12;
const ghostPool = [];
let ghostI = 0;
const canCanvas = () => typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
export function ghostSnapshot(game, color) {
  const p = game && game.player;
  if (!p || !p.anim || !canCanvas()) return null;
  const d = lastDrawnArgs(p.anim);
  if (!d) return null;
  const i = ghostI++ % GH_N;
  let slot = ghostPool[i];
  if (!slot) { slot = ghostPool[i] = { c: makeCanvas(GH_W, GH_H), ver: 0 }; }
  slot.ver++;
  const g = slot.c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, GH_W, GH_H);
  try {
    drawCharacter(g, GH_W / 2, GH_H - 12, d.look, d.equip, Object.assign({}, p.anim, { alpha: 1, flash: false, aura: null, scale: 1 }));
  } catch (e) { return null; }
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.62; g.fillStyle = color || '#19f0ff'; g.fillRect(0, 0, GH_W, GH_H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return { slot, ver: slot.ver, scale: (p.anim.scale || 1) };
}

// ================================================================ 小物の描画
function hexPath(ctx, x, y, r) {
  for (let i = 0; i < 6; i++) {
    const a = PI / 6 + i * PI / 3;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}
function drone(ctx, x, y, s, col, t, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#2a2434'; ctx.strokeStyle = '#120a18'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(1, -1.2, 5, 2, 0, 0, TAU); ctx.fill();
  // ローター
  const r = 6 * Math.abs(Math.sin(t * 60));
  ctx.strokeStyle = 'rgba(230,230,255,0.75)'; ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(-9 - r, -6); ctx.lineTo(-9 + r, -6); ctx.moveTo(9 - r, -6); ctx.lineTo(9 + r, -6);
  ctx.moveTo(-9, -4); ctx.lineTo(-9, -6); ctx.moveTo(9, -4); ctx.lineTo(9, -6); ctx.stroke();
  // 目
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(6, 0.5, 1.6, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(col, 0.5); ctx.beginPath(); ctx.arc(6, 0.5, 4, 0, TAU); ctx.fill();
  ctx.restore();
}
function fist(ctx, s, col) {
  // 右向きの拳（原点=拳の中心）
  ctx.beginPath();
  ctx.moveTo(-7 * s, -6 * s); ctx.lineTo(4 * s, -7 * s); ctx.quadraticCurveTo(10 * s, -6.5 * s, 10 * s, 0);
  ctx.quadraticCurveTo(10 * s, 6.5 * s, 4 * s, 7 * s); ctx.lineTo(-7 * s, 6 * s); ctx.closePath();
  ctx.fillStyle = rgba(col, 0.75); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5 * s, -3.5 * s); ctx.lineTo(9 * s, -3.5 * s); ctx.moveTo(5 * s, 0); ctx.lineTo(9.5 * s, 0); ctx.moveTo(5 * s, 3.5 * s); ctx.lineTo(9 * s, 3.5 * s); ctx.stroke();
}
function flameTongue(ctx, x, y, r, h, sway) {
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x - r * 0.9, y - h * 0.55, x + sway, y - h);
  ctx.quadraticCurveTo(x + r * 0.9, y - h * 0.55, x + r, y);
  ctx.quadraticCurveTo(x, y + r * 0.8, x - r, y);
}
function noteShape(ctx, x, y, r) {
  ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  ctx.moveTo(x + r * 0.9, y); ctx.lineTo(x + r * 0.9, y - r * 3.2); ctx.lineTo(x + r * 2.2, y - r * 2.6);
}
const MAPLE_WORD = /^[A-Za-z0-9 !?+]+$/;
function bigText(ctx, text, x, y, size, c1, c2, alpha, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  // 英字だけの見出し（JOB UP! など）はメイプル風の角ばった金文字（render/mapleFont.js のキャッシュ画像）
  if (MAPLE_WORD.test(text) && mapleHasGlyphs(text.toUpperCase())) {
    const img = mapleWordImage(text.toUpperCase(), 'gold', Math.round(size * 1.3), { kern: 0.9 });
    if (img) { ctx.drawImage(img.img, -img.w / 2, -img.h / 2, img.w, img.h); ctx.restore(); return; }
  }
  ctx.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.24); ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();
}
const popScale = (t, d = 0.1) => (t < d ? 0.4 + (t / d) * 0.8 : t < d * 1.8 ? 1.2 - ((t - d) / (d * 0.8)) * 0.2 : 1);

// ================================================================ エフェクト定義
const T = (e) => 0.8 + 0.25 * Math.max(1, e.opts.tier || e.tier || 1); // 段階スケール 1.05〜1.8

export const FX_TYPES = {
  // ---------- 汎用: 斬撃の残光（★15以上・ミシック）
  slashGlow: {
    life: 0.5,
    draw(ctx, e, k) {
      const r = e.size || 46;
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const a0 = -1.6 + 0.6, a1 = -1.6 + 2.8;
      const rb = e.opts.rainbow;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = FXA.m * ((1 - k) * (0.55 - i * 0.15));
        ctx.strokeStyle = rb ? rainbowAt(e.t * 14 + i * 2) : e.color;
        ctx.lineWidth = 6 - i * 1.5;
        ctx.beginPath(); ctx.arc(-i * 4 * k * 6, 0, r + i * 5, a0 + 0.2, a1 - 0.1); ctx.stroke();
      }
      if (rb) { // 虹の星屑
        ctx.globalAlpha = FXA.m * (1 - k);
        for (let i = 0; i < 6; i++) {
          const a = a0 + (a1 - a0) * (i / 5);
          ctx.fillStyle = RAINBOW[(i + ((e.t * 20) | 0)) % RAINBOW.length];
          ctx.beginPath(); starPath(ctx, Math.cos(a) * (r + 4), Math.sin(a) * (r + 4) - k * 10, 4, 1.5, 4, e.t * 4); ctx.fill();
        }
      }
    },
  },

  // ---------- ガンスリンガー: 弾道の光跡
  gunTracer: {
    life: 0.16,
    init(e, R, N) {
      e.life = e.opts.glow ? 0.38 : e.opts.beam ? 0.3 : 0.16;
      e.parts = [];
      for (let i = 0; i < N(e.opts.casings ?? 1); i++) e.parts.push({ x: 0, y: 0, vx: -e.dir * (60 + R() * 80), vy: -160 - R() * 120, r: 0, rot: R() * 6, grav: 900 });
    },
    draw(ctx, e, k) {
      const len = e.opts.len || 520, dir = e.dir;
      const head = Math.min(1, k * 4) * len;
      const tail = Math.max(0, (k - 0.2) / 0.8) * len;
      const w = (e.opts.beam ? 9 : 2.2) * T(e);
      const col = e.opts.rainbow ? rainbowAt(e.t * 30) : e.color;
      const fade = e.opts.glow ? 1 - k * k : 1 - k;
      const lines = e.opts.lines || 1;
      const gr = ctx.createLinearGradient(dir * tail, 0, dir * head, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, '#ffffff');
      for (let l = 0; l < lines; l++) {
        const oy = lines === 1 ? 0 : (l - (lines - 1) / 2) * 7;
        ctx.globalAlpha = FXA.m * (0.5 * fade);
        ctx.strokeStyle = col; ctx.lineWidth = w * 2.6;
        ctx.beginPath(); ctx.moveTo(dir * (tail + (head - tail) * 0.3), oy); ctx.lineTo(dir * head, oy); ctx.stroke();
        ctx.globalAlpha = FXA.m * (fade);
        ctx.strokeStyle = gr; ctx.lineWidth = Math.max(1.4, w * 0.7);
        ctx.beginPath(); ctx.moveTo(dir * tail, oy); ctx.lineTo(dir * head, oy); ctx.stroke();
      }
      // 弾頭の光
      if (k < 0.5) { ctx.globalAlpha = FXA.m * (1 - k * 2); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(dir * head, 0, w * 3, w * 1.4, 0, 0, PI * 2); ctx.fill(); }
      if (e.opts.glow) { // ★残光: 細い残り線
        ctx.globalAlpha = FXA.m * (0.35 * (1 - k));
        ctx.strokeStyle = e.opts.gearCol || col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(dir * head, -4); ctx.moveTo(0, 4); ctx.lineTo(dir * head, 4); ctx.stroke();
      }
      // 薬莢
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = FXA.m * (1 - k * 0.5);
      ctx.fillStyle = '#ffd27a';
      for (const p of e.parts) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + e.t * 20); ctx.fillRect(-2.5, -1.2, 5, 2.4); ctx.restore(); }
    },
  },
  bulletRain: {
    life: 0.9,
    init(e, R, N) {
      const w = e.opts.w || 600, n = N(28 * T(e));
      e.parts = [];
      for (let i = 0; i < n; i++) e.parts.push({ x: (R() - 0.5) * w, d: R() * 0.5, sp: 1400 + R() * 600, len: 60 + R() * 50, gy: (e.opts.h || 260) * 0.45 + (R() - 0.5) * 30 });
    },
    draw(ctx, e, k) {
      const col = e.color;
      ctx.lineWidth = 2.4 * T(e) * 0.8;
      ctx.strokeStyle = col; ctx.globalAlpha = FXA.m * (0.9);
      ctx.beginPath();
      const flashes = [];
      for (const p of e.parts) {
        const tt = e.t - p.d; if (tt < 0) continue;
        const y = -340 + tt * p.sp;
        if (y > p.gy) { if (y - p.gy < 120) flashes.push(p); continue; }
        ctx.moveTo(p.x - 0.12 * p.len, y - p.len); ctx.lineTo(p.x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of flashes) {
        ctx.globalAlpha = FXA.m * (0.8);
        ctx.beginPath(); starPath(ctx, p.x, p.gy, 10, 3, 4, p.d * 9); ctx.fill();
      }
    },
  },
  starBurst: {
    life: 0.8,
    draw(ctx, e, k) {
      const R0 = (e.size || 120) * T(e) * 0.55 * ease(Math.min(1, k * 2.5));
      ctx.rotate(e.t * 2.5);
      ctx.globalAlpha = FXA.m * ((1 - k) * 0.9);
      ctx.fillStyle = rgba(e.color, 0.35);
      ctx.beginPath(); starPath(ctx, 0, 0, R0, R0 * 0.28, 8, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); starPath(ctx, 0, 0, R0 * 0.55, R0 * 0.14, 4, PI / 4); ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.8); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R0 * 1.15, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16; ctx.moveTo(Math.cos(a) * R0 * 1.25, Math.sin(a) * R0 * 1.25); ctx.lineTo(Math.cos(a) * R0 * 1.6, Math.sin(a) * R0 * 1.6); }
      ctx.stroke();
    },
  },

  // ---------- ネオンダンサー: リボン・音符
  ribbon: {
    life: 0.7,
    init(e, R, N) {
      const n = N(2 + (e.opts.tier || 1));
      e.parts = [];
      for (let i = 0; i < n; i++) e.parts.push({ ph: R() * TAU, rx: (e.size || 60) * (0.7 + R() * 0.5), ry: (e.size || 60) * (0.25 + R() * 0.35), tilt: (R() - 0.5) * 1.2, sp: (R() < 0.5 ? -1 : 1) * (7 + R() * 4), c: i % 2 ? (e.opts.sub || '#ff6fb5') : e.color, w: 5 + R() * 3 });
      const m = N(e.opts.notes ?? 4);
      for (let i = 0; i < m; i++) e.parts.push({ note: true, x: (R() - 0.5) * (e.size || 60) * 1.4, y: -R() * 30, vx: (R() - 0.5) * 50, vy: -50 - R() * 60, r: 3 + R() * 1.5, c: i % 2 ? '#ffffff' : e.color });
    },
    draw(ctx, e, k) {
      const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
      const SEG = 16;
      for (const p of e.parts) {
        if (p.note) continue;
        const head = p.ph + e.t * p.sp;
        const span = 2.6;
        const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
        ctx.beginPath();
        // 上辺 → 下辺（逆順）で1つの帯ポリゴン
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG, a = head - Math.sign(p.sp) * span * u;
          const w = p.w * (1 - u) * (0.6 + 0.4 * Math.sin(u * PI + e.t * 8));
          const x = Math.cos(a) * p.rx, y = Math.sin(a) * p.ry - w * 0.5;
          const X = x * ct - y * st, Y = x * st + y * ct;
          if (s === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        for (let s = SEG; s >= 0; s--) {
          const u = s / SEG, a = head - Math.sign(p.sp) * span * u;
          const w = p.w * (1 - u) * (0.6 + 0.4 * Math.sin(u * PI + e.t * 8));
          const x = Math.cos(a) * p.rx, y = Math.sin(a) * p.ry + w * 0.5;
          ctx.lineTo(x * ct - y * st, x * st + y * ct);
        }
        ctx.closePath();
        ctx.globalAlpha = FXA.m * (0.75 * fade); ctx.fillStyle = p.c; ctx.fill();
        ctx.globalAlpha = FXA.m * (0.9 * fade); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = FXA.m * (fade);
      ctx.lineWidth = 1.6;
      for (const p of e.parts) {
        if (!p.note) continue;
        ctx.strokeStyle = p.c; ctx.fillStyle = p.c;
        ctx.beginPath(); noteShape(ctx, p.x, p.y, p.r); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
    },
  },
  afterimage: {
    life: 0.34,
    draw(ctx, e, k) {
      const gs = e.opts.ghost;
      if (!gs || gs.slot.ver !== gs.ver) return;
      ctx.globalAlpha = FXA.m * ((1 - k) * (e.opts.alpha || 0.55));
      const s = gs.scale;
      ctx.translate(-e.dir * k * 10, 0);
      ctx.drawImage(gs.slot.c, -GH_W / 2 * s, -(GH_H - 12) * s, GH_W * s, GH_H * s);
    },
  },

  // ---------- ストリートファイター: 衝撃波・拳の残像・地割れ・龍
  shockwave: {
    life: 0.45,
    draw(ctx, e, k) {
      const r = (e.size || 50) * T(e);
      const kk = ease(k);
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = e.color; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + kk * 0.9), 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * (0.2 + kk * 0.75), 0, TAU); ctx.stroke();
      if (e.opts.ground !== false) {
        ctx.strokeStyle = e.color; ctx.lineWidth = 4 * (1 - k);
        ctx.beginPath(); ctx.ellipse(0, e.opts.gy || 30, r * (0.4 + kk * 1.6), r * (0.08 + kk * 0.25), 0, 0, TAU); ctx.stroke();
      }
      // 集中線
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 2.5));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath();
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n + e.seed;
        const r0 = r * (0.5 + kk * 0.6), r1 = r0 + r * 0.5;
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      }
      ctx.stroke();
    },
  },
  fistBurst: {
    life: 0.42,
    init(e, R, N) {
      const n = N(Math.min(8, (e.opts.hits || 3) + (e.opts.tier || 1)));
      e.parts = [];
      for (let i = 0; i < n; i++) e.parts.push({ y: (R() - 0.5) * Math.min(56, (e.opts.h || 60) * 0.7), d: i * (0.3 / n), dist: (e.opts.w || 120) * (0.55 + R() * 0.45), s: 0.9 + R() * 0.5 });
    },
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const big = T(e);
      for (const p of e.parts) {
        const tt = (e.t - p.d) / 0.16; if (tt < 0 || tt > 1.6) continue;
        const x = -40 + ease(Math.min(1, tt)) * p.dist;
        const a = tt < 1 ? 1 : 1 - (tt - 1) / 0.6;
        // モーションの尾
        ctx.globalAlpha = FXA.m * (0.45 * a);
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.moveTo(x - 6, p.y - 6 * p.s * big); ctx.lineTo(x - 50, p.y - 2); ctx.lineTo(x - 50, p.y + 2); ctx.lineTo(x - 6, p.y + 6 * p.s * big); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = FXA.m * (a);
        ctx.save(); ctx.translate(x, p.y); fist(ctx, p.s * big * 1.1, e.color); ctx.restore();
      }
    },
  },
  groundCrack: {
    life: 1.1, add: false,
    init(e, R, N) {
      const w = (e.opts.w || 300) * 0.5;
      e.parts = [];
      const n = N(6 + (e.opts.tier || 1) * 2);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, len = w * (0.4 + R() * 0.6);
        const pts = [0, 0]; let x = 0, y = 0;
        const seg = 5;
        for (let s = 1; s <= seg; s++) { x = side * len * s / seg; y = (R() - 0.5) * 8; pts.push(x, y); }
        e.parts.push({ pts });
      }
      const m = N(8 + (e.opts.tier || 1) * 3);
      for (let i = 0; i < m; i++) { const a = -PI / 2 + (R() - 0.5) * 2; const s = 200 + R() * 260; e.parts.push({ rock: true, x: (R() - 0.5) * w, y: 0, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s, r: 2 + R() * 4, grav: 900 }); }
    },
    draw(ctx, e, k) {
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      const grow = Math.min(1, k * 8);
      ctx.globalAlpha = FXA.m * (0.85 * fade);
      ctx.strokeStyle = '#1a0e1e'; ctx.lineWidth = 4;
      ctx.beginPath();
      for (const p of e.parts) {
        if (p.rock) continue;
        const n = Math.max(2, Math.round((p.pts.length / 2) * grow));
        ctx.moveTo(p.pts[0], p.pts[1]);
        for (let i = 1; i < n; i++) ctx.lineTo(p.pts[i * 2], p.pts[i * 2 + 1]);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = e.color; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#5a4a5a';
      ctx.beginPath();
      for (const p of e.parts) { if (!p.rock || p.y > 4) continue; ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, TAU); }
      ctx.fill();
    },
  },
  dragon: {
    life: 0.95,
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const L = (e.size || 160) * T(e);
      const SEG = 22;
      const head = ease(Math.min(1, k * 1.5));
      const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
      const Wd = 9 * T(e);
      // 中心線（上昇する S 字）
      const xs = [], ys = [];
      for (let i = 0; i <= SEG; i++) {
        const u = Math.max(0, head - (i / SEG) * 0.6);
        if (e.opts.rise) { xs.push(Math.sin(u * PI * 2.2) * L * 0.18 + u * L * 0.25); ys.push(30 - u * L * 1.25); }
        else { xs.push(u * L * 1.1 - 30 + Math.sin(u * 9 + e.t * 6) * 6); ys.push(-Math.sin(u * PI * 1.5) * L * 0.32 - u * L * 0.3); }
      }
      const wAt = (i) => Wd * (i === 0 ? 1.1 : Math.max(0.15, 1 - i / SEG)) * (0.85 + 0.15 * Math.sin(i * 1.3));
      const nx = [], ny = [];
      for (let i = 0; i <= SEG; i++) {
        const a = i < SEG ? Math.atan2(ys[i] - ys[i + 1], xs[i] - xs[i + 1]) : Math.atan2(ys[i - 1] - ys[i], xs[i - 1] - xs[i]);
        nx.push(-Math.sin(a)); ny.push(Math.cos(a));
      }
      ctx.globalAlpha = FXA.m * (fade * 0.9);
      ctx.beginPath();
      for (let i = 0; i <= SEG; i++) { const w = wAt(i); if (i === 0) ctx.moveTo(xs[i] + nx[i] * w, ys[i] + ny[i] * w); else ctx.lineTo(xs[i] + nx[i] * w, ys[i] + ny[i] * w); }
      for (let i = SEG; i >= 0; i--) { const w = wAt(i); ctx.lineTo(xs[i] - nx[i] * w, ys[i] - ny[i] * w); }
      ctx.closePath();
      ctx.fillStyle = rgba(e.color, 0.75); ctx.fill();
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.6; ctx.stroke();
      // 背びれ・腹の鱗線
      ctx.beginPath();
      for (let i = 2; i < SEG; i += 2) {
        const w = wAt(i);
        ctx.moveTo(xs[i] + nx[i] * w, ys[i] + ny[i] * w);
        ctx.lineTo(xs[i + 1] + nx[i] * (w + 7 * (1 - i / SEG) + 2), ys[i + 1] + ny[i] * (w + 7 * (1 - i / SEG) + 2));
        ctx.lineTo(xs[i + 2 > SEG ? SEG : i + 2] + nx[i] * w, ys[i + 2 > SEG ? SEG : i + 2] + ny[i] * w);
      }
      ctx.fillStyle = rgba('#ffe066', 0.8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 1; i < SEG; i++) { ctx.moveTo(xs[i] - nx[i] * wAt(i) * 0.4, ys[i] - ny[i] * wAt(i) * 0.4); ctx.lineTo(xs[i + 1] - nx[i] * wAt(i) * 0.1, ys[i + 1] - ny[i] * wAt(i) * 0.1); } ctx.stroke();
      // 頭
      const ha = Math.atan2(ys[0] - ys[2], xs[0] - xs[2]);
      ctx.save(); ctx.translate(xs[0], ys[0]); ctx.rotate(ha); ctx.scale(T(e) * 0.75, T(e) * 0.75);
      ctx.globalAlpha = FXA.m * (fade);
      const jaw = 0.25 + Math.sin(e.t * 18) * 0.12;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(10, -8); ctx.lineTo(24, -3 - jaw * 6); ctx.lineTo(8, 0); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill(); // 上顎
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(8, 2); ctx.lineTo(20, 6 + jaw * 10); ctx.lineTo(-4, 10); ctx.closePath(); ctx.fill();   // 下顎
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(10, -8); ctx.lineTo(24, -3 - jaw * 6); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(4, -4.5, 2.6, 1.6, -0.2, 0, PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-16, -22, -30, -22); ctx.moveTo(0, -8.5); ctx.quadraticCurveTo(-8, -20, -20, -26); ctx.stroke(); // 角
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.quadraticCurveTo(10, 16, -6, 20); ctx.stroke(); // ひげ
      // 炎の息
      ctx.fillStyle = rgba('#fff2a0', 0.8); ctx.beginPath(); ctx.ellipse(28, 2, 6 + jaw * 8, 3 + jaw * 4, 0, 0, PI * 2); ctx.fill();
      ctx.restore();
    },
  },

  // ---------- ナイトレーサー: タイヤ痕・炎・ニトロ
  tireMark: {
    life: 1.8, add: false,
    draw(ctx, e, k) {
      const len = e.opts.len || 40;
      ctx.globalAlpha = FXA.m * (0.5 * (1 - k));
      ctx.fillStyle = '#1a141e';
      const x0 = e.dir < 0 ? 0 : -len;
      ctx.fillRect(x0, -3, len, 2.4); ctx.fillRect(x0, 1.5, len, 2.4);
      if (k < 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = FXA.m * ((0.3 - k) * 2);
        ctx.fillStyle = e.color; ctx.fillRect(x0, -1, len, 2);
      }
    },
  },
  flameTrail: {
    life: 0.55,
    init(e, R, N) {
      const n = N(e.opts.count || 7 * T(e));
      const spread = e.opts.spread || 40;
      e.parts = [];
      for (let i = 0; i < n; i++) {
        const a = e.opts.radial ? (i / n) * TAU : 0;
        const sp = e.opts.radial ? 160 + R() * 100 : 0;
        e.parts.push({ x: e.opts.radial ? 0 : -e.dir * R() * spread, y: (R() - 0.5) * 8, vx: e.opts.radial ? Math.cos(a) * sp : -e.dir * (40 + R() * 80), vy: e.opts.radial ? Math.sin(a) * sp * 0.4 - 40 : -30 - R() * 50, r: (7 + R() * 6) * T(e) * 0.8, h: (24 + R() * 20) * (0.8 + T(e) * 0.2), d: R() * 0.12 });
      }
    },
    draw(ctx, e, k) {
      const hot = e.opts.blue ? '#bff6ff' : '#fff2a0';
      const mid = e.opts.blue ? '#4fa8ff' : '#ff9a3c';
      const outer = e.opts.blue ? e.color : mix(e.color, '#ff5f3c', 0.55);
      for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = pass === 0 ? outer : pass === 1 ? mid : hot;
        ctx.globalAlpha = FXA.m * ((pass === 0 ? 0.55 : pass === 1 ? 0.7 : 0.9) * (1 - k));
        ctx.beginPath();
        for (const p of e.parts) {
          const tt = e.t - p.d; if (tt < 0) continue;
          const s = (1 - k * 0.7) * (pass === 0 ? 1 : pass === 1 ? 0.7 : 0.4);
          flameTongue(ctx, p.x, p.y, p.r * s, p.h * s * (1 + k), Math.sin(e.t * 20 + p.h) * 3);
        }
        ctx.fill();
      }
    },
  },
  nitroBurst: {
    life: 0.7,
    draw(ctx, e, k) {
      const r = Math.min(170, e.size || 120) * (0.4 + ease(k) * 0.8);
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 1.8) * 0.85);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
      g.addColorStop(0, 'rgba(240,250,255,1)'); g.addColorStop(0.35, rgba('#4fa8ff', 0.85)); g.addColorStop(0.75, rgba(e.color, 0.55)); g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) { const a = i * TAU / 14 + e.seed; const r0 = r * 0.7, r1 = r * (1.1 + (i % 3) * 0.12); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.7); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.7); }
      ctx.stroke();
    },
  },

  // ---------- ネットランナー: 六角データ・コード・グリッチ
  hexBurst: {
    life: 0.8,
    init(e, R, N) {
      const r = e.size || 100, hs = Math.max(9, r / (5 + (e.opts.tier || 1)));
      e.parts = [];
      const step = hs * 1.75;
      const maxN = N(42);
      for (let gy = -r; gy <= r && e.parts.length < maxN; gy += step * 0.866) {
        const row = Math.round(gy / (step * 0.866));
        for (let gx = -r; gx <= r && e.parts.length < maxN; gx += step) {
          const x = gx + (row & 1 ? step / 2 : 0), y = gy * 0.62;
          const d = Math.hypot(x, gy) / r; if (d > 1) continue;
          if (R() < 0.35) continue;
          e.parts.push({ x, y, d: d * 0.28, s: hs * (0.7 + R() * 0.3), fill: R() < 0.3 });
        }
      }
      e.bits = [];
      const nb = N(10 + (e.opts.tier || 1) * 4);
      for (let i = 0; i < nb; i++) { const a = R() * TAU, s = 60 + R() * 140; e.bits.push({ x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 30, one: R() < 0.5 }); }
    },
    draw(ctx, e, k) {
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = FXA.m * (fade);
      ctx.beginPath();
      const fillP = [];
      for (const p of e.parts) {
        const tt = e.t - p.d; if (tt < 0) continue;
        const s = p.s * Math.min(1, tt * 8);
        hexPath(ctx, p.x, p.y, s);
        if (p.fill) fillP.push(p);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.35);
      ctx.beginPath();
      for (const p of fillP) hexPath(ctx, p.x, p.y, p.s * 0.8 * (0.6 + 0.4 * Math.sin(e.t * 20 + p.x)));
      ctx.fill();
      // コア（シンギュラリティ）
      if (e.opts.core) {
        const cr = (e.size || 100) * 0.35 * (1 - Math.abs(k - 0.5) * 1.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = FXA.m * (fade * 0.9); ctx.fillStyle = '#05140c';
        ctx.beginPath(); ctx.arc(0, 0, Math.max(2, cr), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, cr * 1.8, cr * 0.5, e.t * 3, 0, TAU); ctx.stroke();
        ctx.strokeStyle = e.color;
        ctx.beginPath(); ctx.ellipse(0, 0, cr * 1.5, cr * 0.4, -e.t * 4, 0, TAU); ctx.stroke();
      }
      // 0/1 ビット
      ctx.fillStyle = '#eafff2';
      ctx.globalAlpha = FXA.m * (fade);
      const kt = e.t;
      for (const b of e.bits) {
        const x = b.vx * kt, y = b.vy * kt;
        if (b.one) ctx.fillRect(x - 1, y - 4, 2.2, 8); else { ctx.strokeStyle = '#eafff2'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 2.5, y - 4, 5, 8); }
      }
    },
  },
  codeRain: {
    life: 0.9,
    init(e, R, N) {
      const w = e.opts.w || 300, n = N(8 + (e.opts.tier || 1) * 2);
      e.parts = [];
      for (let i = 0; i < n; i++) e.parts.push({ x: (R() - 0.5) * w, d: R() * 0.25, sp: 260 + R() * 200, len: 4 + ((R() * 4) | 0), seed: (R() * 1000) | 0 });
    },
    draw(ctx, e, k) {
      const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
      const h0 = (e.opts.h || 240) * 0.5;
      for (const p of e.parts) {
        const tt = e.t - p.d; if (tt < 0) continue;
        const y0 = -h0 + tt * p.sp;
        for (let j = 0; j < p.len; j++) {
          const y = y0 - j * 11; if (y < -h0 || y > h0) continue;
          ctx.globalAlpha = FXA.m * (fade * (j === 0 ? 1 : 0.7 - j * 0.1));
          ctx.fillStyle = j === 0 ? '#ffffff' : e.color;
          const one = ((p.seed + j * 7 + ((e.t * 12) | 0)) & 3) !== 0;
          if (one) ctx.fillRect(p.x - 1, y - 4, 2.4, 8); else ctx.fillRect(p.x - 3, y - 1, 6, 2.4);
        }
      }
    },
  },
  glitch: {
    life: 0.28,
    draw(ctx, e, k) {
      const w = e.opts.w || 70, h = e.opts.h || 60;
      const f = (e.t * 30) | 0;
      let s = (e.seed * 31 + f * 17) | 0;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const n = 4 + ((e.opts.tier || 1));
      ctx.globalAlpha = FXA.m * ((1 - k) * 0.85);
      for (let i = 0; i < n; i++) {
        const y = (rnd() - 0.5) * h, bw = w * (0.3 + rnd() * 0.8), bh = 2 + rnd() * 6, x = (rnd() - 0.5) * w - bw / 2;
        ctx.fillStyle = 'rgba(255,40,90,0.7)'; ctx.fillRect(x - 4, y, bw, bh);
        ctx.fillStyle = 'rgba(40,240,255,0.7)'; ctx.fillRect(x + 4, y, bw, bh);
        ctx.fillStyle = rgba(e.color, 0.8); ctx.fillRect(x, y + bh * 0.25, bw, bh * 0.5);
      }
    },
  },

  // ---------- ドローンマスター: ドローン群・レーザー・衛星砲
  droneSwarm: {
    life: 1.0,
    init(e, R, N) {
      const n = N(e.opts.n || 3);
      e.parts = [];
      const tx = e.opts.tx || e.dir * 200;
      for (let i = 0; i < n; i++) e.parts.push({
        sx: -e.dir * (60 + R() * 60), sy: -70 - R() * 50,
        mx: tx * (0.4 + R() * 0.5) * (e.opts.bomb ? 1 : 0.3), my: -110 - R() * 50 + (e.opts.bomb ? -30 : 40),
        fx: tx + (R() - 0.5) * (e.opts.spread || 120), fy: e.opts.ty || 0, d: i * 0.06, ph: R() * 6,
      });
    },
    draw(ctx, e, k) {
      const dir = e.dir;
      for (const p of e.parts) {
        const tt = clamp((e.t - p.d) / (e.life - p.d), 0, 1);
        // 出現→位置取り→攻撃→離脱
        let x, y;
        if (tt < 0.35) { const u = ease(tt / 0.35); x = p.sx + (p.mx - p.sx) * u; y = p.sy + (p.my - p.sy) * u; }
        else if (tt < 0.75) { x = p.mx + Math.sin(e.t * 6 + p.ph) * 4; y = p.my + Math.cos(e.t * 7 + p.ph) * 3; }
        else { const u = (tt - 0.75) / 0.25; x = p.mx + dir * u * 200; y = p.my - u * 160; }
        // 攻撃（レーザー or 爆弾）
        if (tt > 0.4 && tt < 0.62) {
          const a = 1 - Math.abs(tt - 0.51) / 0.11;
          if (e.opts.bomb) {
            const u = (tt - 0.4) / 0.22;
            ctx.globalAlpha = FXA.m * (1); ctx.fillStyle = '#ffe066';
            ctx.beginPath(); ctx.arc(x + (p.fx - x) * u * 0.3, y + (p.fy - y) * u, 4, 0, TAU); ctx.fill();
          } else {
            ctx.globalAlpha = FXA.m * (a * 0.6); ctx.strokeStyle = e.color; ctx.lineWidth = 9;
            ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(p.fx, p.fy); ctx.stroke();
            ctx.globalAlpha = FXA.m * (a); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.fx, p.fy, 5 * a, 0, TAU); ctx.fill();
          }
        }
        ctx.globalAlpha = FXA.m * (tt > 0.9 ? (1 - tt) * 10 : Math.min(1, tt * 8));
        drone(ctx, x, y, 1.7, e.color, e.t, dir);
        ctx.globalCompositeOperation = 'lighter';
      }
    },
  },
  laser: {
    life: 0.32,
    draw(ctx, e, k) {
      const len = e.opts.len || 600, dir = e.dir;
      const w = (e.opts.w || 12) * T(e) * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      ctx.globalAlpha = FXA.m * (0.5);
      ctx.fillStyle = e.color; ctx.fillRect(dir > 0 ? 0 : -len, -w, len, w * 2);
      ctx.globalAlpha = FXA.m * (0.95);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(dir > 0 ? 0 : -len, -w * 0.35, len, w * 0.7);
      ctx.fillStyle = rgba(e.color, 0.8);
      ctx.beginPath(); ctx.arc(0, 0, w * 1.8, 0, TAU); ctx.fill();
      // 走査リング
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = FXA.m * (1 - k);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const x = dir * ((e.t * 1600 + i * len / 4) % len); ctx.moveTo(x, -w * 1.6); ctx.lineTo(x, w * 1.6); }
      ctx.stroke();
    },
  },
  orbitalBeam: {
    life: 1.1,
    draw(ctx, e, k) {
      const W = Math.min(64, (e.opts.w || 160) * 0.25) * T(e) * 0.7;
      const grow = Math.min(1, k * 5), fade = k < 0.7 ? 1 : (1 - k) / 0.3;
      const w = W * grow * (1 + Math.sin(e.t * 40) * 0.06);
      const top = -900, bot = e.opts.gy || 40;
      if (e.opts.meteor) {
        // 隕石: 斜め上から落ちる炎の塊
        const u = Math.min(1, k * 2.2);
        const mx = -e.dir * 300 * (1 - u), my = top * 0.5 * (1 - u) + bot * u;
        ctx.globalAlpha = FXA.m * (fade);
        ctx.strokeStyle = rgba(e.color, 0.6); ctx.lineWidth = 30;
        ctx.beginPath(); ctx.moveTo(mx - e.dir * -140, my - 260); ctx.lineTo(mx, my); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, my, 22 * T(e), 0, TAU); ctx.fill();
        ctx.fillStyle = rgba('#ff9a3c', 0.8); ctx.beginPath(); ctx.arc(mx, my, 34 * T(e), 0, TAU); ctx.fill();
        return;
      }
      const bg = ctx.createLinearGradient(-w, 0, w, 0);
      bg.addColorStop(0, rgba(e.color, 0)); bg.addColorStop(0.3, rgba(e.color, 0.55)); bg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); bg.addColorStop(0.7, rgba(e.color, 0.55)); bg.addColorStop(1, rgba(e.color, 0));
      ctx.globalAlpha = FXA.m * (fade);
      ctx.fillStyle = bg; ctx.fillRect(-w, top, w * 2, bot - top);
      // 着弾点の閃光
      ctx.fillStyle = rgba('#ffffff', 0.7 * fade); ctx.beginPath(); ctx.ellipse(0, bot, w * 1.3, w * 0.35, 0, 0, PI * 2); ctx.fill();
      ctx.strokeStyle = e.color; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const rk = (e.t * 2 + i / 3) % 1;
        ctx.globalAlpha = FXA.m * (fade * (1 - rk));
        ctx.beginPath(); ctx.ellipse(0, bot, w * (1 + rk * 2.5), w * 0.25 * (1 + rk * 2.5), 0, 0, TAU); ctx.stroke();
      }
    },
  },

  // ---------- 汎用: ヒット時の集中線（impact の見た目）
  impactLines: {
    life: 0.22,
    draw(ctx, e, k) {
      const r = 40 + (e.opts.power || 0.5) * 80;
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.fillStyle = rgba(e.color, 0.9);
      ctx.beginPath();
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n + e.seed * 0.7;
        const r0 = r * (0.35 + k * 0.5), r1 = r * (1.2 + (i % 3) * 0.25);
        const da = 0.05;
        ctx.moveTo(Math.cos(a - da) * r0, Math.sin(a - da) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a + da) * r0, Math.sin(a + da) * r0);
      }
      ctx.fill();
    },
  },

  // ================================================================ 移動スキル5種
  move_flashJump: {
    life: 0.5,
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const kk = ease(k);
      ctx.translate(-14, 10);
      // 空中衝撃波（縦長の楕円リング）
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = e.color; ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(-kk * 30, 0, 8 + kk * 18, 22 + kk * 34, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-kk * 18, 0, 5 + kk * 12, 15 + kk * 24, 0, 0, TAU); ctx.stroke();
      // 翼状の三日月
      ctx.fillStyle = rgba(e.color, 0.6);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-30 - kk * 20, s * (30 + kk * 20), -60 - kk * 30, s * (10 + kk * 30));
        ctx.quadraticCurveTo(-30, s * 12, 0, 0); ctx.fill();
      }
      // 加速線
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const y = (i - 2) * 9; const x0 = -20 - kk * 40 - i * 4; ctx.moveTo(x0, y); ctx.lineTo(x0 - 40, y); }
      ctx.stroke();
      if (e.opts.gun && k < 0.35) { // リコイル: 後方へのマズルフラッシュ
        ctx.globalAlpha = FXA.m * (1 - k / 0.35);
        ctx.fillStyle = '#fff2b0';
        ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-50, 0); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
      }
    },
  },
  move_teleport: {
    life: 0.55,
    init(e, R, N) {
      e.parts = [];
      const n = N(16);
      const fx = e.opts.fromX ?? -e.dir * 120, fy = e.opts.fromY ?? 0;
      for (let i = 0; i < n; i++) { // 出発地点: 外へ散る
        const a = R() * TAU, s = 60 + R() * 120;
        e.parts.push({ out: true, x: fx + (R() - 0.5) * 24, y: fy + (R() - 0.5) * 60, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 1.5 + R() * 2.5 });
      }
      for (let i = 0; i < n; i++) { // 到着地点: 内へ集まる
        const a = R() * TAU, d = 50 + R() * 50;
        e.parts.push({ out: false, ax: Math.cos(a) * d, ay: Math.sin(a) * d * 1.2, r: 1.5 + R() * 2.5 });
      }
      e.from = { x: fx, y: fy };
    },
    draw(ctx, e, k) {
      const dig = e.opts.digital;
      const kk = ease(k);
      // 出発地点の縦スキャン
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 2));
      ctx.fillStyle = rgba(e.color, 0.5);
      ctx.fillRect(e.from.x - 16 * (1 - kk), e.from.y - 50, 32 * (1 - kk), 90);
      // 到着地点の光柱
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.fillStyle = rgba(e.color, 0.4);
      ctx.fillRect(-18 * (1 - kk * 0.5), -60, 36 * (1 - kk * 0.5), 100);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 40, 26 + kk * 16, 6 + kk * 3, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = dig ? '#eafff2' : '#ffffff';
      ctx.beginPath();
      for (const p of e.parts) {
        let x, y;
        if (p.out) { x = p.x + p.vx * e.t; y = p.y + p.vy * e.t; }
        else { const u = 1 - Math.min(1, k * 1.8); x = p.ax * u; y = p.ay * u; }
        const r = p.r * (1 - k * 0.6);
        if (dig) ctx.rect(x - r, y - r, r * 2, r * 2); else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      }
      ctx.fill();
    },
  },
  move_rush: {
    life: 0.45,
    tick(e, dt, game, spawn) {
      e.gt = (e.gt || 0) - dt;
      if (e.t < 0.3 && e.gt <= 0) {
        e.gt = 0.05;
        const gh = ghostSnapshot(game, e.color);
        const p = game.player;
        if (gh && p) spawn(game, 'afterimage', p.x, p.y, { ghost: gh, facing: e.dir, alpha: 0.5, _child: true });
      }
    },
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      // 前方の衝撃コーン
      ctx.globalAlpha = FXA.m * (Math.max(0, 1 - k * 1.4));
      ctx.fillStyle = rgba(e.color, 0.5);
      ctx.beginPath(); ctx.moveTo(34, -36); ctx.quadraticCurveTo(58, 0, 34, 36); ctx.quadraticCurveTo(46, 0, 34, -36); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(36, -30); ctx.quadraticCurveTo(54, 0, 36, 30); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const y = (i - 2.5) * 12; ctx.moveTo(-20 - i * 6, y); ctx.lineTo(-70 - i * 6, y); }
      ctx.strokeStyle = rgba(e.color, 0.8); ctx.stroke();
      // 土煙
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = FXA.m * (0.35 * (1 - k));
      ctx.fillStyle = '#b8a8b8';
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = -30 - i * 18 - k * 30, r = 8 + i * 3 + k * 10; ctx.moveTo(x + r, 36); ctx.arc(x, 36, r, 0, TAU); } ctx.fill();
    },
  },
  move_glide: {
    life: 0.9,
    init(e) { if (e.opts.time) e.life = e.opts.time + 0.25; },
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const fade = Math.min(1, e.t * 6) * (k > 0.8 ? (1 - k) / 0.2 : 1);
      const flap = Math.sin(e.t * 12) * 0.12;
      ctx.translate(-12, -14);
      // ホロの翼（背中から後ろ上へ。縁取り＋羽根の筋＋六角セル）
      for (const s of [0, 1]) {
        ctx.save(); ctx.rotate(-0.35 - s * 0.35 + flap * (s ? 1.4 : 1));
        const L = 54 - s * 10;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-L * 0.5, -22, -L, -10);
        ctx.lineTo(-L * 0.82, 0); ctx.lineTo(-L * 0.9, 8); ctx.lineTo(-L * 0.62, 8); ctx.lineTo(-L * 0.66, 15); ctx.lineTo(-L * 0.36, 11);
        ctx.closePath();
        ctx.globalAlpha = FXA.m * (0.2 * fade); ctx.fillStyle = e.color; ctx.fill();
        ctx.globalAlpha = FXA.m * (0.95 * fade); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = FXA.m * (0.8 * fade); ctx.strokeStyle = e.color; ctx.lineWidth = 1.2;
        ctx.beginPath(); for (let i = 1; i <= 3; i++) { ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-L * 0.4, -8 - i * 2, -L * (0.45 + i * 0.13), -6 + i * 4); } ctx.stroke();
        ctx.fillStyle = rgba('#ffffff', 0.7 * fade);
        for (let i = 0; i < 3; i++) { const u = ((e.t * 1.5 + i / 3 + s * 0.2) % 1); ctx.fillRect(-L * u, -10 + u * 14, 2, 2); }
        ctx.restore();
      }
      if (e.opts.drones) {
        ctx.globalAlpha = FXA.m * (fade);
        drone(ctx, 2, -44, 1.3, e.color, e.t, 1);
        drone(ctx, 30, -40, 1.3, e.color, e.t + 0.3, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(e.color, 0.6 * fade); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, -40); ctx.lineTo(8, -14); ctx.moveTo(30, -36); ctx.lineTo(20, -14); ctx.stroke();
      }
    },
  },
  move_wheelDash: {
    life: 1.6,
    init(e) { if (e.opts.time) e.life = e.opts.time + 0.15; },
    tick(e, dt, game, spawn) {
      e.gt = (e.gt || 0) - dt;
      const p = game.player;
      if (!p || e.t > e.life - 0.15 || e.gt > 0) return;
      e.gt = 0.05;
      if (p.onGround !== false) spawn(game, 'tireMark', p.x, p.y, { color: e.color, facing: p.facing || e.dir, len: 30, _child: true });
      spawn(game, 'spark', p.x - (p.facing || e.dir) * 14, p.y - 4, { color: '#ffd27a', _child: true });
      if (Math.random() < 0.5) spawn(game, 'flameTrail', p.x - (p.facing || e.dir) * 22, p.y - 14, { color: e.color, facing: p.facing || e.dir, count: 3, tier: 1, _child: true });
    },
    draw(ctx, e, k) {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const fade = Math.min(1, e.t * 8) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      // 足元の回転するホイール光
      ctx.globalAlpha = FXA.m * (fade);
      ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.save(); ctx.translate(0, 30);
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 9, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * PI / 3 + e.t * 30; ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 4); ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 8.5); }
      ctx.stroke(); ctx.restore();
      // スピード線
      ctx.strokeStyle = rgba(e.color, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const y = -20 + i * 12, x0 = -24 - ((e.t * 300 + i * 37) % 60); ctx.moveTo(x0, y); ctx.lineTo(x0 - 30, y); } ctx.stroke();
    },
  },

  // ================================================================ 転職・強化・等級
  jobUp: {
    life: 2.6,
    init(e, R, N) {
      e.parts = [];
      const n = N(36);
      for (let i = 0; i < n; i++) e.parts.push({ x: (R() - 0.5) * 70, y: -R() * 40, vx: (R() - 0.5) * 40, vy: -60 - R() * 140, r: 2 + R() * 3, d: R() * 0.8, c: RAINBOW[(R() * RAINBOW.length) | 0] });
    },
    draw(ctx, e, k) {
      const fade = k < 0.85 ? 1 : (1 - k) / 0.15;
      const grow = Math.min(1, e.t * 3);
      const H = 260 * grow, W0 = 70;
      const g = ctx.createLinearGradient(0, -H, 0, 0);
      g.addColorStop(0, rgba(e.color, 0)); g.addColorStop(0.5, rgba(e.color, 0.4 * fade)); g.addColorStop(1, rgba('#ffffff', 0.7 * fade));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-W0 / 2, 0); ctx.lineTo(-W0 * 0.3, -H); ctx.lineTo(W0 * 0.3, -H); ctx.lineTo(W0 / 2, 0); ctx.closePath(); ctx.fill();
      // 足元の魔法陣
      ctx.save(); ctx.scale(1, 0.3); ctx.rotate(e.t * 1.5);
      ctx.globalAlpha = FXA.m * (fade); ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.stroke();
      ctx.beginPath(); starPath(ctx, 0, 0, 54, 22, 6, 0); ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const rk = (e.t * 0.8 + i / 3) % 1;
        ctx.globalAlpha = FXA.m * (fade * (1 - rk)); ctx.strokeStyle = e.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, -rk * 200, 30 + rk * 20, 8 + rk * 5, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = FXA.m * (fade);
      ctx.beginPath();
      for (const p of e.parts) { if (e.t < p.d) continue; const tt = e.t - p.d; starPath(ctx, p.x + p.vx * tt, p.y + p.vy * tt, p.r * 2, p.r * 0.7, 4, tt * 3); }
      ctx.fillStyle = '#fff6c0'; ctx.fill();
      if (e.t > 0.3) {
        const kt = e.t - 0.3;
        bigText(ctx, e.opts.title || 'JOB UP!', 0, (e.opts.small ? -150 : -200) - Math.min(1, kt * 3) * 14, e.opts.small ? 22 : 34, '#ffe066', e.color, fade, popScale(kt, 0.12));
        if (e.opts.name) bigText(ctx, e.opts.name, 0, -165, 20, '#ffffff', e.color, fade * Math.min(1, kt * 4), 1);
      }
    },
  },
  tuneSuccess: {
    life: 1.5,
    init(e, R, N) {
      e.parts = [];
      const n = N(20);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + R() * 0.2, s = 120 + R() * 160; e.parts.push({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + R() * 3 }); }
    },
    draw(ctx, e, k) {
      const fade = k < 0.75 ? 1 : (1 - k) / 0.25;
      ctx.rotate(e.t * 1.2);
      ctx.globalAlpha = FXA.m * (fade * 0.5); ctx.fillStyle = '#ffe066';
      ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.08) * 160, Math.sin(a - 0.08) * 160); ctx.lineTo(Math.cos(a + 0.08) * 160, Math.sin(a + 0.08) * 160); } ctx.fill();
      ctx.rotate(-e.t * 1.2);
      ctx.globalAlpha = FXA.m * (fade);
      ctx.beginPath();
      const drag = 1 - Math.exp(-e.t * 4);
      for (const p of e.parts) starPath(ctx, p.vx * drag * 0.5, p.vy * drag * 0.5, p.r * 2, p.r * 0.8, 5, e.t * 4);
      ctx.fillStyle = '#fff6a0'; ctx.fill();
      const pop = popScale(e.t, 0.1);
      ctx.save(); ctx.scale(pop, pop);
      ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#2a0b3d'; ctx.lineWidth = 4; ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); starPath(ctx, 0, 0, 34, 14, 5); ctx.fill(); ctx.stroke();
      ctx.restore();
      bigText(ctx, e.opts.text || (e.opts.star != null ? `★${e.opts.star} SUCCESS!` : 'SUCCESS!'), 0, -60, 30, '#fff6a0', '#ff9a3c', fade, pop);
    },
  },
  tuneFail: {
    life: 1.3, add: false,
    init(e, R, N) {
      e.parts = [];
      const n = N(10);
      for (let i = 0; i < n; i++) e.parts.push({ x: (R() - 0.5) * 50, y: (R() - 0.5) * 20, vx: (R() - 0.5) * 60, vy: -30 - R() * 50, r: 10 + R() * 12 });
    },
    draw(ctx, e, k) {
      const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.fillStyle = '#6a6070';
      for (const p of e.parts) { ctx.globalAlpha = FXA.m * (0.45 * (1 - k)); ctx.beginPath(); ctx.arc(p.x + p.vx * e.t, p.y + p.vy * e.t, p.r * (0.6 + k), 0, TAU); ctx.fill(); }
      // ヒビ
      ctx.globalAlpha = FXA.m * (fade); ctx.strokeStyle = '#d8d0e0'; ctx.lineWidth = 3;
      const shake = e.t < 0.25 ? Math.sin(e.t * 90) * 4 : 0;
      ctx.translate(shake, 0);
      ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(4, -12); ctx.lineTo(-4, -2); ctx.lineTo(8, 14); ctx.lineTo(0, 28); ctx.moveTo(4, -12); ctx.lineTo(18, -16); ctx.moveTo(-4, -2); ctx.lineTo(-18, 4); ctx.stroke();
      bigText(ctx, e.opts.text || 'FAILED…', 0, -60, 28, '#e0d8f0', '#7a6e8a', fade, 1);
    },
  },
  gradeUp: {
    life: 1.8,
    draw(ctx, e, k) {
      const fade = k < 0.8 ? 1 : (1 - k) / 0.2;
      const grow = ease(Math.min(1, e.t * 3));
      ctx.save(); ctx.rotate(-e.t * 0.8);
      ctx.globalAlpha = FXA.m * (fade * 0.4); ctx.fillStyle = e.color;
      ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, L = (i % 2 ? 120 : 190) * grow; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.06) * L, Math.sin(a - 0.06) * L); ctx.lineTo(Math.cos(a + 0.06) * L, Math.sin(a + 0.06) * L); } ctx.fill();
      ctx.restore();
      ctx.globalAlpha = FXA.m * (fade);
      ctx.strokeStyle = e.color; ctx.lineWidth = 4;
      for (let i = 0; i < 2; i++) { const rk = (e.t * 1.2 + i * 0.5) % 1; ctx.globalAlpha = FXA.m * (fade * (1 - rk)); ctx.beginPath(); hexPath(ctx, 0, 0, 30 + rk * 90); ctx.stroke(); }
      ctx.globalAlpha = FXA.m * (fade);
      ctx.fillStyle = rgba(e.color, 0.8); ctx.beginPath(); hexPath(ctx, 0, 0, 26 * grow); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
      const pop = popScale(Math.max(0, e.t - 0.15), 0.1);
      bigText(ctx, 'GRADE UP!', 0, -70, 32, '#ffffff', e.color, fade * (e.t > 0.15 ? 1 : 0), pop);
      if (e.opts.grade) bigText(ctx, String(e.opts.grade), 0, -36, 20, '#ffffff', e.color, fade * (e.t > 0.3 ? 1 : 0), 1);
    },
  },
};

// ================================================================ 系統別の重ね掛け（themeSpawn）
const CAST_TYPES = { slash: 1, muzzle: 1, dash: 1, buff: 1 };
// エフェクト type → それを出すスキル kind の優先順
const PREFER = { slash: ['melee'], muzzle: ['projectile'], dash: ['move', 'dash'], buff: ['buff'], aoe: ['aoe', 'move'], hit: ['melee', 'aoe', 'projectile', 'dash'] };
let lastCutin = -1e9, lastImpact = -1e9, lastGlitch = -1e9, lastGhost = -1e9, lastTire = -1e9;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * themeSpawn(game, e, spawn, impact) — e は spawnEffect が作った直後のエフェクト。
 * spawn(game, type, x, y, opts) は spawnEffect（循環 import を避けて引数で受け取る）。
 */
export function themeSpawn(game, e, spawn, impactFn) {
  if (!game || !game.state || e.opts._child) return;
  const p = game.player;
  const fx = e.fx;
  const c = (type, x, y, o) => spawn(game, type, x, y, Object.assign({ _child: true }, o));
  const near = p && Math.abs(e.x - p.x) < 40 && Math.abs(e.y - (p.y - (p.h || 70) / 2)) < 40;
  // ---- 装備の軌跡（通常攻撃＋スキルの斬撃）
  const gear = gearTrail(game);
  if (e.type === 'slash') {
    if (gear.rainbow) e.opts.rainbow = true;
    if (gear.color && !e.opts.color) e.color = gear.color;
    if (gear.afterglow && fx > 0.2) c('slashGlow', e.x, e.y, { color: gear.color || e.color, facing: e.dir, size: e.size || (e.opts.w ? Math.min(110, Math.max(40, e.opts.w * 0.42)) : e.opts.range ? Math.min(90, Math.max(40, e.opts.range * 0.5)) : 46), rainbow: gear.rainbow });
  }
  // ---- スキルの判定
  const style = resolveSkillStyle(game, e.color, null, PREFER[e.type] || (near ? PREFER.aoe : PREFER.hit));
  const basicNear = !style && near;
  if (!style) {
    // 通常攻撃（銃・魔法）の弾道
    if (basicNear && e.type === 'muzzle' && !e.opts.color) {
      c('gunTracer', e.x, e.y, { color: gear.color || '#ffd27a', facing: e.dir, len: 420, glow: gear.afterglow, rainbow: gear.rainbow, tier: 1 });
    } else if (basicNear && e.type === 'spark') {
      const js = jobStyleOf(game.state);
      if (js.branch === 'netrunner' || js.branch === 'dronemaster' || game.state.heroId === 'hacker') c('glitch', e.x, e.y, { color: e.color, w: 40, h: 30, tier: 1 });
    }
    return;
  }
  const tier = style.tier || 1;
  e.tier = tier; e.branch = style.branch;
  const sk = style.skill || {};
  const rng = sk.range || {};
  const f = e.dir;
  const cast = CAST_TYPES[e.type] || near;
  const gy = p ? p.y - e.y : 30; // エフェクト原点から地面までの距離
  const busy = (game._fxCost || 0) > 6; // 描画が重いときは命中時の追加演出を省く
  const big = fx > 0.2 && !busy;  // 最小設定では追加演出を絞る
  if (busy && !CAST_TYPES[e.type] && !near) return;

  // ---- 移動スキル: dash → move_<type>
  if (style.kind === 'move' && style.move) {
    if (e.type === 'dash' || e.type === sk.effect) {
      const mtype = 'move_' + style.move;
      retype(e, mtype);
      if (style.move === 'teleport') {
        e.opts.digital = style.branch === 'netrunner';
        const lp = game._fxPrevPlayer;
        if (lp && p) { e.opts.fromX = lp.x - p.x; e.opts.fromY = lp.y - p.y; }
        FX_TYPES[mtype].init(e, e.R, e.N);
        if (e.opts.digital && big) c('glitch', e.x, e.y, { color: e.color, w: 70, h: 80, tier: 2 });
      }
      if (style.move === 'flashJump') e.opts.gun = style.branch === 'gunslinger';
      if (style.move === 'glide') { e.target = p; e.opts.offsetY = -(p ? (p.h || 70) / 2 : 35); e.opts.drones = style.branch === 'dronemaster'; const t = sk.move && sk.move.time; if (t) e.life = t + 0.25; }
      if (style.move === 'wheelDash') { e.target = p; e.opts.offsetY = -(p ? (p.h || 70) / 2 : 35); const t = sk.move && sk.move.time; if (t) e.life = t + 0.15; }
      if (style.move === 'rush') { e.target = p; e.opts.offsetY = -(p ? (p.h || 70) / 2 : 35); }
    }
    return;
  }

  // ---- カットイン（4次の攻撃スキル）・インパクト
  const attackKind = sk.kind === 'melee' || sk.kind === 'aoe' || sk.kind === 'projectile' || sk.kind === 'dash';
  if (cast && attackKind && e.type !== 'dash') {
    const tnow = now();
    if (tier >= 4 && tnow - lastCutin > 5 && game.settings?.cutin !== false && (e.type !== 'muzzle' || sk.kind === 'projectile')) {
      lastCutin = tnow;
      spawn(game, 'cutin', 0, 0, { name: sk.name, color: BRANCH_STYLE[style.branch]?.col || e.color, sub: BRANCH_STYLE[style.branch]?.sub, branch: style.branch, _child: true });
    }
    if (tier >= 2 && (sk.kind === 'aoe' || tier >= 4) && tnow - lastImpact > 0.25) {
      lastImpact = tnow;
      impactFn(game, tier >= 4 ? 1 : tier === 3 ? 0.55 : 0.3, BRANCH_STYLE[style.branch]?.col || e.color);
    }
  }
  if (e.type === 'critHit' && !near) {
    const tnow = now();
    if (tnow - lastImpact > 0.18) { lastImpact = tnow; impactFn(game, 0.15, null); }
  }

  const W = rng.w || e.opts.w || (e.size || 60) * 2, Hh = rng.h || e.opts.h || 120;
  switch (style.branch) {
    // ------------------------------------------------ ガンスリンガー
    case 'gunslinger': {
      if (e.type === 'muzzle') {
        const pk = sk.proj && sk.proj.kind;
        e.size = 16 + tier * 5;
        c('gunTracer', e.x, e.y, { color: e.color, facing: f, len: Math.min(1100, W), tier, beam: pk === 'beam', lines: pk === 'beam' ? 1 : Math.min(3, (sk.proj && sk.proj.count) || 1), glow: gear.afterglow || tier >= 3, gearCol: gear.color, rainbow: gear.rainbow, casings: (sk.proj && sk.proj.count) || 1 });
        if (pk === 'star' && big) c('starBurst', e.x + f * 30, e.y, { color: e.color, size: 110, tier });
        if (pk === 'heart' && big) c('ribbon', e.x + f * 20, e.y, { color: '#ff6fb5', sub: '#ffffff', size: 30, tier: 2, notes: 0 });
        if (pk === 'beam' && big) c('shockwave', e.x, e.y, { color: e.color, size: 22, tier, ground: false });
      } else if (cast && (e.type === 'spark' || e.type === 'explosion')) {
        c('bulletRain', e.x, e.y, { color: e.color, w: W, h: Hh, tier });
        if (tier >= 4 && big) c('starBurst', e.x, e.y - 40, { color: '#ffd23f', size: 140, tier });
      }
      break;
    }
    // ------------------------------------------------ ネオンダンサー
    case 'neondancer': {
      const tnow = now();
      if (e.type === 'slash') {
        c('ribbon', e.x - f * W * 0.2, e.y, { color: e.color, sub: '#ff6fb5', size: Math.max(40, W * 0.45), tier, notes: big ? 2 + tier : 0 });
        if (tier >= 2 && big && tnow - lastGhost > 0.06) { lastGhost = tnow; ghostAt(game, c, e.color); }
      } else if (e.type === 'dash') {
        if (tnow - lastGhost > 0.05 && fx > 0.2) { lastGhost = tnow; ghostAt(game, c, e.color); }
        if (!e.opts.trail && big) c('ribbon', e.x, e.y, { color: e.color, sub: '#ffffff', size: 50, tier, notes: 2 });
      } else if (cast && (e.type === 'spark' || e.type === 'explosion')) {
        c('ribbon', e.x, e.y, { color: e.color, sub: '#ff6fb5', size: Math.min(170, Math.max(70, W * 0.4)), tier: tier + 1, notes: 6 });
        if (tier >= 4 && big) c('starBurst', e.x, e.y - 30, { color: e.color, size: 160, tier });
        if (big) ghostAt(game, c, e.color);
      }
      break;
    }
    // ------------------------------------------------ ストリートファイター
    case 'streetfighter': {
      if (e.type === 'slash') {
        e.hide = true; // 拳なので斬撃の弧は描かない
        c('fistBurst', p ? p.x + f * 10 : e.x, e.y, { color: e.color, facing: f, w: W, h: Hh, hits: sk.hits || 1, tier });
        if (tier >= 3 && big && (sk.launch || sk.id === 'jj_fight_dragon_upper')) c('dragon', p ? p.x + f * 30 : e.x, e.y + 20, { color: e.color, facing: f, size: 120, tier, rise: true });
      } else if ((e.type === 'hit' || e.type === 'critHit') && !near) {
        c('shockwave', e.x, e.y, { color: e.color, size: 22 + tier * 4, tier: 1, ground: false });
      } else if (e.type === 'muzzle') { // 龍撃波
        c('shockwave', e.x, e.y, { color: e.color, size: 30, tier, ground: false });
        if (tier >= 3 && big) c('dragon', e.x, e.y + 20, { color: e.color, facing: f, size: 150, tier });
      } else if (cast && (e.type === 'explosion' || e.type === 'spark' || e.type === 'smoke')) {
        c('shockwave', e.x, e.y, { color: e.color, size: W * 0.25, tier, gy });
        c('groundCrack', e.x, e.y + gy, { color: e.color, w: W, tier });
        if (tier >= 3 && big) c('dragon', e.x - f * 40, e.y + 30, { color: e.color, facing: f, size: 140, tier });
      }
      break;
    }
    // ------------------------------------------------ ナイトレーサー
    case 'nightracer': {
      const tnow = now();
      if (e.type === 'dash') {
        if (p && tnow - lastTire > 0.035) { lastTire = tnow; c('tireMark', p.x, p.y, { color: e.color, facing: f, len: 46 }); }
        if (fx > 0.2) c('flameTrail', e.x - f * 20, e.y + 10, { color: e.color, facing: f, tier, count: e.opts.trail ? 3 : 6 });
      } else if (e.type === 'muzzle') {
        c('flameTrail', e.x, e.y + 8, { color: e.color, facing: -f, tier, count: 6, spread: 30 });
      } else if (cast && e.type === 'smoke') {
        c('flameTrail', e.x, e.y + gy * 0.6, { color: e.color, tier, radial: true, count: 10 });
        if (p) { c('tireMark', p.x - 30, p.y, { color: e.color, facing: 1, len: 60 }); c('tireMark', p.x + 30, p.y, { color: e.color, facing: -1, len: 60 }); }
      } else if (cast && (e.type === 'explosion' || e.type === 'spark')) {
        e.hide = true;
        c('nitroBurst', e.x, e.y, { color: e.color, size: Math.min(170, W * 0.4), tier });
        c('flameTrail', e.x, e.y + gy * 0.6, { color: e.color, tier, radial: true, count: 12, blue: true });
        if (tier >= 4 && big) c('orbitalBeam', e.x, e.y, { color: e.color, w: 120, tier, meteor: true, facing: f, gy });
      }
      break;
    }
    // ------------------------------------------------ ネットランナー
    case 'netrunner': {
      if (e.type === 'muzzle') {
        e.hide = true;
        const pk = sk.proj && sk.proj.kind;
        c('glitch', e.x, e.y, { color: e.color, w: 60, h: 40, tier });
        if (pk === 'beam') c('laser', e.x, e.y, { color: e.color, facing: f, len: Math.min(900, W), w: 6, tier });
        if (big) c('hexBurst', e.x, e.y, { color: e.color, size: 26, tier: 1 });
      } else if ((e.type === 'hit' || e.type === 'spark' || e.type === 'critHit') && !near) {
        const tnow = now();
        if (tnow - lastGlitch > 0.04) { lastGlitch = tnow; c('glitch', e.x, e.y, { color: e.color, w: 46, h: 40, tier: 1 }); }
      } else if (cast && (e.type === 'explosion' || e.type === 'spark' || e.type === 'smoke')) {
        if (e.type === 'explosion') e.hide = true;
        c('hexBurst', e.x, e.y, { color: e.color, size: Math.min(190, W * 0.48), tier, core: tier >= 4 });
        if (big) c('codeRain', e.x, e.y, { color: e.color, w: W, h: Hh * 1.4, tier });
        c('glitch', e.x, e.y, { color: e.color, w: W * 0.6, h: Hh * 0.8, tier });
      }
      break;
    }
    // ------------------------------------------------ ドローンマスター
    case 'dronemaster': {
      if (e.type === 'muzzle') {
        const pk = sk.proj && sk.proj.kind;
        c('droneSwarm', e.x, e.y, { color: e.color, facing: f, n: Math.min(5, tier + 1), tx: f * Math.min(500, W * 0.6), ty: 0, spread: 60 });
        if (pk === 'beam') c('laser', e.x, e.y, { color: e.color, facing: f, len: Math.min(1000, W), w: 9, tier });
      } else if (cast && (e.type === 'explosion' || e.type === 'spark')) {
        c('droneSwarm', e.x, e.y, { color: e.color, facing: f, n: Math.min(6, tier + 2), tx: 0, ty: gy * 0.8, spread: W * 0.7, bomb: true });
        if (tier >= 4) c('orbitalBeam', e.x, e.y, { color: e.color, w: W * 0.35, tier, gy });
      }
      break;
    }
  }
  // ---- バフ: 系統ごとの飾り
  if (e.type === 'buff' && big) {
    const col = e.color;
    switch (style.branch) {
      case 'gunslinger': c('starBurst', e.x, e.y - 40, { color: col, size: 50, tier }); break;
      case 'neondancer': c('ribbon', e.x, e.y - 36, { color: col, sub: '#ffffff', size: 44, tier, notes: 4 }); break;
      case 'streetfighter': c('flameTrail', e.x, e.y, { color: col, tier, radial: true, count: 10 }); break;
      case 'nightracer': c('nitroBurst', e.x, e.y - 30, { color: col, size: 70, tier }); break;
      case 'netrunner': c('hexBurst', e.x, e.y - 36, { color: col, size: 54, tier }); break;
      case 'dronemaster': c('droneSwarm', e.x, e.y - 30, { color: col, facing: f, n: 2 + (tier >= 4 ? 2 : 0), tx: 0, ty: -10, spread: 80 }); break;
    }
    if (tier >= 4) c('jobUp', e.x, e.y, { color: col, title: sk.name || 'HYPER', life: 1.6, small: true });
  }
}

function ghostAt(game, c, color) {
  const p = game.player;
  const gh = ghostSnapshot(game, color);
  if (gh && p) c('afterimage', p.x, p.y, { ghost: gh, facing: p.facing || 1 });
}

/** エフェクトの type を差し替えて粒を作り直す */
function retype(e, type) {
  e.type = type;
  const def = FX_TYPES[type];
  e.life = (e.opts.life) || (def && def.life) || e.life;
  e.parts = [];
  if (def && def.init) def.init(e, e.R, e.N);
}
