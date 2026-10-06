// 5次転職スキルの演出（render/fxJob.js の FX_TYPES に足す）。
//  画面全体攻撃（skill.screen）: systems/skills.js の useUltimate が出す
//    ult5Dark  … 画面の暗転（プレイヤーの周りだけ明るい）＋溜めの集中線・系統の魔法陣・光の柱（プレイヤーに付いて動く）
//    ult5Mark  … 画面内の敵に付く狙いの印（溜めの間）
//    ult5Burst … 当たった瞬間の画面いっぱいの系統の演出（画面の中央に置く）
//    ultChildren(game, spawn, {branch, color, rect, targets}) … ult5Burst ＋ 既存の系統エフェクトを敵ごとに重ねる
//  通常攻撃強化（buff.empower）: empBeam（次元弾の光線）/ empWave（拳圧の衝撃波）
// 重くしない: 粒は init で一度だけ作る。グラデーションは1エフェクト1つまで。
import { rgba, starPath } from './util.js';
import { FXA } from './fxStyle.js';

const PI = Math.PI, TAU = PI * 2;
const ease = (k) => 1 - (1 - k) * (1 - k);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 系統の印（溜めの魔法陣の中央）
function sigil(ctx, branch, r, t) {
  ctx.beginPath();
  switch (branch) {
    case 'gunslinger': // 照準
      ctx.arc(0, 0, r * 0.55, 0, TAU);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2; ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25); ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); }
      break;
    case 'neondancer': starPath(ctx, 0, 0, r * 0.8, r * 0.34, 5, t * 1.5); break; // 星
    case 'streetfighter': // 拳の形の八角
      for (let i = 0; i <= 8; i++) { const a = i * TAU / 8 + PI / 8; const x = Math.cos(a) * r * 0.75, y = Math.sin(a) * r * 0.75; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      break;
    case 'nightracer': // ホイール
      ctx.arc(0, 0, r * 0.7, 0, TAU);
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 6; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); }
      break;
    case 'netrunner': // 六角
      for (let i = 0; i <= 6; i++) { const a = PI / 6 + i * PI / 3; const x = Math.cos(a) * r * 0.75, y = Math.sin(a) * r * 0.75; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      break;
    default: // ドローンマスター: 三角（艦隊の印）
      for (let i = 0; i <= 3; i++) { const a = -PI / 2 + i * TAU / 3; const x = Math.cos(a) * r * 0.8, y = Math.sin(a) * r * 0.8; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  }
  ctx.stroke();
}

export const ULT_FX_TYPES = {
  // ---------- 画面の暗転＋溜め（プレイヤーに付く）
  ult5Dark: {
    life: 2.3, add: false,
    draw(ctx, e) {
      const d = e.opts.delay ?? 0.8, t = e.t;
      const a = t < 0.22 ? t / 0.22 : t < d + 0.05 ? 1 : Math.max(0, 1 - (t - d - 0.05) / 1.1);
      const dark = 0.74 * a * Math.max(0.6, FXA.m);
      const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 460);
      g.addColorStop(0, `rgba(6,2,22,${dark * 0.12})`); g.addColorStop(1, `rgba(6,2,22,${dark})`);
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-2600, -1800, 5200, 3600);
      ctx.globalAlpha = 0.14 * a; ctx.fillStyle = e.color; ctx.fillRect(-2600, -1800, 5200, 3600);
      if (t > d + 0.12) return;
      const ck = clamp01(t / d);
      ctx.globalCompositeOperation = 'lighter';
      // 集中線: 画面の外からプレイヤーへ吸い込まれる
      ctx.globalAlpha = FXA.m * 0.55 * a; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 30; i++) {
        const ang = i * TAU / 30 + e.seed * 0.37;
        const ph = (t * 2.4 + i * 0.137) % 1;
        const r1 = 70 + 820 * (1 - ph), r0 = r1 + 120 + (i % 3) * 40;
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0 * 0.7); ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1 * 0.7);
      }
      ctx.stroke();
      // 光の柱
      ctx.globalAlpha = FXA.m * (0.25 + 0.5 * ck) * a; ctx.fillStyle = rgba(e.color, 0.5);
      const pw = 26 + 30 * ck;
      ctx.fillRect(-pw / 2, -900, pw, 940);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-pw / 6, -900, pw / 3, 940);
      // 魔法陣（足元の楕円＋系統の印）
      ctx.save(); ctx.translate(0, 30); ctx.scale(1, 0.32); ctx.rotate(t * 2.2);
      ctx.globalAlpha = FXA.m * 0.9 * a; ctx.strokeStyle = e.color; ctx.lineWidth = 5;
      const R = 80 + 80 * ease(ck);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); ctx.stroke();
      ctx.lineWidth = 4; sigil(ctx, e.opts.branch, R * 0.75, t);
      ctx.restore();
      // 胸の前の印（大きく回る）
      ctx.save(); ctx.rotate(-t * 1.4);
      ctx.globalAlpha = FXA.m * 0.8 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      sigil(ctx, e.opts.branch, 40 + 40 * ck, t);
      ctx.restore();
    },
  },
  // ---------- 狙いの印（敵に付く）
  ult5Mark: {
    life: 0.95,
    draw(ctx, e, k) {
      const r = 46 - 18 * ease(Math.min(1, k * 1.4));
      ctx.rotate(e.t * 3);
      ctx.globalAlpha = FXA.m * (k < 0.85 ? 1 : (1 - k) / 0.15);
      ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * PI / 2; ctx.moveTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10)); ctx.lineTo(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12)); }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(r * 0.4, 0); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.4, 0); ctx.closePath(); ctx.stroke();
    },
  },
  // ---------- 当たった瞬間の画面いっぱいの演出（画面の中央）
  ult5Burst: {
    life: 1.45,
    init(e, R, N) {
      const w = e.opts.w || 1280, h = e.opts.h || 720;
      e.parts = [];
      const n = N(22);
      for (let i = 0; i < n; i++) e.parts.push({ x: (R() - 0.5) * w * 1.1, y: (R() - 0.5) * h, a: R() * TAU, d: R() * 0.55, r: 0.4 + R() * 0.8, s: R() < 0.5 ? -1 : 1 });
    },
    draw(ctx, e, k) {
      const w = e.opts.w || 1280, h = e.opts.h || 720, t = e.t, col = e.color;
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      // 中央から広がる白い輪と閃光
      const rk = ease(Math.min(1, t / 0.5));
      // 一瞬だけ系統の色で光る（白く飛ばさない）
      ctx.globalAlpha = FXA.m * Math.max(0, 1 - t / 0.28) * 0.5;
      ctx.fillStyle = rgba(col, 0.45); ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = FXA.m * fade;
      ctx.strokeStyle = col; ctx.lineWidth = 14 * (1 - rk) + 2;
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.75 * rk, h * 0.75 * rk, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.6 * rk, h * 0.6 * rk, 0, 0, TAU); ctx.stroke();
      // 系統ごとの大きな模様
      ctx.lineCap = 'round';
      switch (e.opts.branch) {
        case 'gunslinger': { // 画面を横切る無数の弾道＋星のきらめき
          ctx.lineWidth = 5; ctx.strokeStyle = col;
          ctx.beginPath();
          for (const p of e.parts) {
            const u = clamp01((t - p.d) / 0.18); if (u <= 0 || t - p.d > 0.7) continue;
            const L = w * 0.9, dx = Math.cos(p.a) * L, dy = Math.sin(p.a) * L * 0.5;
            ctx.moveTo(p.x - dx * 0.5, p.y - dy * 0.5); ctx.lineTo(p.x - dx * 0.5 + dx * u, p.y - dy * 0.5 + dy * u);
          }
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          for (const p of e.parts) { const u = t - p.d; if (u < 0.1 || u > 0.9) continue; ctx.beginPath(); starPath(ctx, p.x, p.y, 16 * p.r * (1 - u), 4, 4, p.a); ctx.fill(); }
          break;
        }
        case 'neondancer': { // 上から振れるスポットライト＋大きな星
          for (let i = 0; i < 5; i++) {
            const sx = -w * 0.4 + i * w * 0.2, sw = Math.sin(t * 3 + i * 1.3) * w * 0.12;
            ctx.globalAlpha = FXA.m * fade * 0.35;
            ctx.fillStyle = i % 2 ? col : '#ff6fb5';
            ctx.beginPath(); ctx.moveTo(sx - 20, -h / 2); ctx.lineTo(sx + 20, -h / 2); ctx.lineTo(sx + sw + 140, h / 2); ctx.lineTo(sx + sw - 140, h / 2); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = FXA.m * fade; ctx.save(); ctx.rotate(t * 1.6);
          ctx.fillStyle = rgba(col, 0.45); ctx.beginPath(); starPath(ctx, 0, 0, 260 * rk, 100 * rk, 5, 0); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
          break;
        }
        case 'streetfighter': { // 空が割れる稲妻の亀裂＋拳の衝撃
          ctx.strokeStyle = col; ctx.lineWidth = 7;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            let x = -w * 0.45 + i * w * 0.15, y = -h / 2;
            ctx.moveTo(x, y);
            for (let s = 0; s < 6; s++) { x += ((i * 7 + s * 13) % 9 - 4) * 14; y += h * 0.16 * Math.min(1, t * 4); ctx.lineTo(x, y); }
          }
          ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.globalAlpha = FXA.m * fade * 0.6; ctx.fillStyle = rgba(col, 0.4);
          ctx.beginPath(); ctx.arc(0, 0, 220 * rk, 0, TAU); ctx.fill();
          break;
        }
        case 'nightracer': { // 画面を横切る光の轍（速度の帯）
          for (let i = 0; i < 9; i++) {
            const y = -h * 0.4 + i * h * 0.1, sp = 2600 + (i % 3) * 700, x = -w + ((t * sp + i * 300) % (w * 2));
            ctx.globalAlpha = FXA.m * fade * (0.5 + (i % 2) * 0.4);
            ctx.strokeStyle = i % 2 ? col : '#19f0ff'; ctx.lineWidth = 6 + (i % 3) * 4;
            ctx.beginPath(); ctx.moveTo(x - 520, y); ctx.lineTo(x, y); ctx.stroke();
          }
          ctx.globalAlpha = FXA.m * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) { const q = (t * 1.6 + i / 3) % 1; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5 * q, h * 0.18 * q, 0, 0, TAU); ctx.stroke(); }
          break;
        }
        case 'netrunner': { // 画面を覆う六角の格子と走査線
          const hs = 48, step = hs * 1.75;
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let gy = -h / 2; gy <= h / 2; gy += step * 0.866) {
            const row = Math.round(gy / (step * 0.866));
            for (let gx = -w / 2; gx <= w / 2; gx += step) {
              const x = gx + (row & 1 ? step / 2 : 0);
              const dist = Math.hypot(x, gy) / (w * 0.6);
              if (dist > t * 2.2) continue;
              for (let i = 0; i <= 6; i++) { const a = PI / 6 + i * PI / 3; const px = x + Math.cos(a) * hs * 0.8, py = gy + Math.sin(a) * hs * 0.8; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
            }
          }
          ctx.globalAlpha = FXA.m * fade * 0.6; ctx.stroke();
          const sy = -h / 2 + ((t * 1.4) % 1) * h;
          ctx.globalAlpha = FXA.m * fade; ctx.fillStyle = rgba(col, 0.7); ctx.fillRect(-w / 2, sy - 6, w, 12);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(-w / 2, sy - 1.5, w, 3);
          break;
        }
        default: { // ドローンマスター: 画面の上を横切る艦隊の影＋一斉砲撃の光線
          ctx.fillStyle = rgba('#1a1408', 0.85);
          for (let i = 0; i < 5; i++) {
            const x = -w * 0.6 + ((t * 500 + i * 300) % (w * 1.2)), y = -h * 0.42 + (i % 2) * 40, s = 1 + (i % 3) * 0.4;
            ctx.globalAlpha = FXA.m * fade * 0.9;
            ctx.beginPath(); ctx.moveTo(x + 70 * s, y); ctx.lineTo(x - 50 * s, y - 16 * s); ctx.lineTo(x - 30 * s, y); ctx.lineTo(x - 50 * s, y + 16 * s); ctx.closePath(); ctx.fill();
            ctx.fillStyle = col; ctx.fillRect(x - 60 * s, y - 3, 14 * s, 6); ctx.fillStyle = rgba('#1a1408', 0.85);
          }
          ctx.lineWidth = 10;
          for (const p of e.parts.slice(0, 10)) {
            const u = t - p.d; if (u < 0 || u > 0.5) continue;
            ctx.globalAlpha = FXA.m * (1 - u / 0.5); ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(p.x, -h / 2); ctx.lineTo(p.x, h / 2); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 10;
          }
        }
      }
    },
  },
  // ---------- 通常攻撃強化: 次元弾の光線（前方へ）
  empBeam: {
    life: 0.22,
    draw(ctx, e, k) {
      const L = (e.opts.w || 900) * ease(Math.min(1, k * 3)), hh = (e.opts.h || 60) * 0.35 * (1 - k);
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.fillStyle = rgba(e.color, 0.7); ctx.fillRect(0, -hh, L, hh * 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -hh * 0.3, L, hh * 0.6);
      ctx.beginPath(); starPath(ctx, 0, 0, 22 * (1 - k) + 6, 5, 4, e.t * 9); ctx.fill();
    },
  },
  // ---------- 通常攻撃強化: 拳圧の衝撃波（前方へ走る三日月）
  empWave: {
    life: 0.32,
    draw(ctx, e, k) {
      const W = e.opts.w || 420, H = e.opts.h || 140;
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const x = W * 0.85 * ease(k);
      ctx.globalAlpha = FXA.m * (1 - k);
      ctx.strokeStyle = e.color; ctx.lineWidth = 10 * (1 - k) + 3;
      ctx.beginPath(); ctx.ellipse(x, 0, 24 + 30 * k, H * 0.45, 0, -PI / 2, PI / 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x - 8, 0, 18 + 24 * k, H * 0.38, 0, -PI / 2, PI / 2); ctx.stroke();
    },
  },
};

/**
 * ultChildren(game, spawn, {branch, color, rect, targets}) — 画面全体攻撃が当たった瞬間の演出。
 * spawn = render/effects.js の spawnEffect（循環 import を避けて引数で受け取る）。rect = 画面の矩形（ワールド座標）
 */
export function ultChildren(game, spawn, o = {}) {
  const { branch, color, rect } = o;
  if (!game || !rect) return;
  const targets = (o.targets || []).slice(0, 14);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const c = (type, x, y, op) => spawn(game, type, x, y, Object.assign({ _child: true }, op));
  c('ult5Burst', cx, cy, { color, branch, w: rect.w, h: rect.h });
  const mid = (e) => e.y - (e.h || 40) / 2;
  switch (branch) {
    case 'gunslinger':
      c('bulletRain', cx, cy, { color, w: rect.w * 1.1, h: rect.h, tier: 5 });
      for (const e of targets) c('starBurst', e.x, mid(e), { color, size: 120, tier: 4 });
      break;
    case 'neondancer':
      c('starBurst', cx, cy - 60, { color, size: 360, tier: 5 });
      for (const e of targets) c('ribbon', e.x, mid(e), { color, sub: '#ff6fb5', size: 70, tier: 3, notes: 4 });
      break;
    case 'streetfighter':
      c('dragon', cx - 220, cy + 140, { color, facing: 1, size: 340, tier: 5, rise: true });
      for (const e of targets) { c('shockwave', e.x, mid(e), { color, size: 40, tier: 3, ground: false }); c('groundCrack', e.x, e.y, { color, w: 200, tier: 3 }); }
      break;
    case 'nightracer':
      for (const e of targets) { c('orbitalBeam', e.x, mid(e), { color, w: 120, tier: 4, meteor: true, facing: 1, gy: (e.h || 40) / 2 }); c('nitroBurst', e.x, mid(e), { color, size: 120, tier: 4 }); }
      break;
    case 'netrunner':
      c('codeRain', cx, cy, { color, w: rect.w, h: rect.h * 1.2, tier: 5 });
      for (const e of targets) { c('hexBurst', e.x, mid(e), { color, size: 80, tier: 3 }); c('glitch', e.x, mid(e), { color, w: 70, h: 60, tier: 2 }); }
      break;
    default:
      c('droneSwarm', cx, cy, { color, facing: 1, n: 6, tx: 0, ty: rect.h * 0.3, spread: rect.w * 0.8, bomb: true });
      for (const e of targets) c('orbitalBeam', e.x, mid(e), { color, w: 140, tier: 4, gy: (e.h || 40) / 2 });
  }
}
