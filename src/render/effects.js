// エフェクト＆ダメージ数字（ワールド空間）。game.effects に積み、updateEffects / drawEffects で処理。
import { rgba, shade, rng, starPath } from './util.js';

const PI = Math.PI;
const MAX_EFFECTS = 500;

const LIFE = {
  slash: 0.28, hit: 0.3, critHit: 0.45, explosion: 0.9, levelUp: 2.2, pickup: 0.5, muzzle: 0.09, dash: 0.4,
  buff: 1.0, rareDrop: 1.6, heal: 0.9, smoke: 1.0, portal: 0.8, spark: 0.4, tear: 1.1, dmg: 1.0,
};
const DEF_COLOR = {
  slash: '#ffffff', hit: '#ffe066', critHit: '#ff4fd8', explosion: '#ff9a3c', levelUp: '#ffe066', pickup: '#7cfc00', muzzle: '#ffd27a',
  dash: '#19f0ff', buff: '#ff6fb5', rareDrop: '#ffc93c', heal: '#5cff9a', smoke: '#9a8fa8', portal: '#b47cff', spark: '#ffe066', tear: '#f4f4f4',
};

let seedCounter = 1;

function ensure(game) {
  if (!game.effects) game.effects = [];
  return game.effects;
}

export function spawnEffect(game, type, x, y, opts = {}) {
  if (!game) return null;
  const list = ensure(game);
  if (list.length >= MAX_EFFECTS) list.splice(0, list.length - MAX_EFFECTS + 1);
  const e = {
    kind: 'fx', type, x, y, t: 0,
    life: opts.life || LIFE[type] || 0.5,
    color: opts.color || DEF_COLOR[type] || '#ffffff',
    dir: opts.dir || opts.facing || 1,
    size: opts.size || opts.radius || 0,
    target: opts.target || null,
    opts,
    parts: null,
    seed: seedCounter++,
  };
  initParts(e);
  list.push(e);
  return e;
}

// メイプル風ダメージ数字
export function spawnDamageNumber(game, x, y, value, opts = {}) {
  if (!game) return null;
  const list = ensure(game);
  // 同じ場所に短時間で出た数字は縦に積む
  let stack = 0;
  for (const o of list) {
    if (o.type === 'dmg' && o.t < 0.35 && Math.abs(o.x - x) < 50 && Math.abs(o.baseY - y) < 50 && !!o.toPlayer === !!opts.toPlayer) stack = Math.max(stack, o.stack + 1);
  }
  const text = opts.miss ? 'MISS' : String(Math.max(0, Math.round(Number(value) || 0)));
  const e = {
    kind: 'dmg', type: 'dmg', x: x + (opts.miss ? 0 : 0), y, baseY: y, t: 0, life: opts.crit ? 1.05 : 0.95,
    text, stack, crit: !!opts.crit, toPlayer: !!opts.toPlayer, heal: !!opts.heal, miss: !!opts.miss,
    seed: seedCounter++,
  };
  list.push(e);
  if (list.length > MAX_EFFECTS) list.splice(0, list.length - MAX_EFFECTS);
  return e;
}

function initParts(e) {
  const R = rng(e.seed * 9973);
  const parts = [];
  const add = (n, f) => { for (let i = 0; i < n; i++) parts.push(f(i, n)); };
  switch (e.type) {
    case 'hit': case 'critHit': {
      const n = e.type === 'critHit' ? 12 : 7;
      add(n, (i) => { const a = (i / n) * PI * 2 + R() * 0.5; const s = (e.type === 'critHit' ? 260 : 180) * (0.6 + R() * 0.6); return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + R() * 2 }; });
      break;
    }
    case 'spark':
      add(8, () => { const a = -PI / 2 + (R() - 0.5) * PI * 1.4; const s = 120 + R() * 200; return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + R() * 1.5 }; });
      break;
    case 'explosion': {
      add(16, () => { const a = R() * PI * 2; const s = 120 + R() * 320; return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, r: 2 + R() * 4, c: R() < 0.5 ? '#ffe066' : '#ff5fa2' }; });
      add(8, () => { const a = R() * PI * 2; const s = 30 + R() * 80; return { x: Math.cos(a) * 10, y: Math.sin(a) * 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 14 + R() * 12, smoke: true }; });
      break;
    }
    case 'smoke':
      add(7, () => ({ x: (R() - 0.5) * 30, y: (R() - 0.5) * 16, vx: (R() - 0.5) * 50, vy: -20 - R() * 40, r: 10 + R() * 10 }));
      break;
    case 'pickup':
      add(8, (i, n) => { const a = (i / n) * PI * 2; return { x: 0, y: 0, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 60, r: 2.4 }; });
      break;
    case 'levelUp': case 'buff': case 'heal': case 'rareDrop':
      add(e.type === 'levelUp' ? 24 : 12, () => ({ x: (R() - 0.5) * 50, y: -R() * 30, vx: (R() - 0.5) * 20, vy: -40 - R() * 90, r: 2 + R() * 2.5, d: R() * 0.5 }));
      break;
    case 'tear': {
      const cols = e.opts.colors || [e.color, shade(e.color, -0.2), '#3a3346'];
      add(e.opts.count || 7, () => {
        const a = -PI / 2 + (R() - 0.5) * 2.4; const s = 120 + R() * 200;
        const pts = []; const m = 4 + ((R() * 2) | 0);
        for (let k = 0; k < m; k++) { const an = (k / m) * PI * 2; const rr = (k % 2 ? 3.5 : 7.5) * (0.7 + R() * 0.6); pts.push(Math.cos(an) * rr, Math.sin(an) * rr); }
        return { x: (R() - 0.5) * 16, y: -30 + (R() - 0.5) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: R() * 6, vr: (R() - 0.5) * 14, pts, c: cols[(R() * cols.length) | 0] };
      });
      break;
    }
    case 'portal':
      add(14, () => { const a = R() * PI * 2; return { a, r: 30 + R() * 20, vr: -40 - R() * 30, va: 4 + R() * 3, s: 2 + R() * 2 }; });
      break;
    case 'dash':
      add(6, () => ({ x: -R() * 40, y: -10 - R() * 50, l: 20 + R() * 30 }));
      break;
  }
  e.parts = parts;
}

export function updateEffects(game, dt) {
  const list = game && game.effects;
  if (!list) return;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    e.t += dt;
    if (e.t >= e.life) continue;
    if (e.target && !e.target.dead) { e.x = e.target.x; e.y = e.target.y + (e.opts && e.opts.offsetY || 0); }
    if (e.parts) {
      const grav = e.type === 'tear' ? 500 : e.type === 'spark' || e.type === 'explosion' ? 380 : e.type === 'hit' || e.type === 'critHit' ? 0 : 0;
      const drag = e.type === 'hit' || e.type === 'critHit' ? Math.pow(0.02, dt) : 1;
      for (const p of e.parts) {
        if (p.vx != null) {
          p.vx *= drag; p.vy *= drag;
          if (!p.smoke) p.vy += grav * dt;
          if (e.type === 'tear') { p.vx *= Math.pow(0.4, dt); p.vy = Math.min(p.vy, 90); p.rot += p.vr * dt; }
          p.x += p.vx * dt; p.y += p.vy * dt;
        } else if (p.a != null) { p.a += p.va * dt; p.r = Math.max(2, p.r + p.vr * dt); }
      }
    }
    list[w++] = e;
  }
  list.length = w;
}

export function drawEffects(ctx, game) {
  const list = game && game.effects;
  if (!list || !list.length) return;
  // 通常エフェクト（加算）→ ダメージ数字（通常合成・最前面）
  ctx.save();
  for (const e of list) if (e.kind !== 'dmg') drawFx(ctx, e);
  ctx.restore();
  for (const e of list) if (e.kind === 'dmg') drawDmg(ctx, e);
}

// ---------------------------------------------------------------- 各エフェクト
function drawFx(ctx, e) {
  const k = e.t / e.life; // 0..1
  const c = e.color;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const add = e.type !== 'smoke' && e.type !== 'tear';
  if (add) ctx.globalCompositeOperation = 'lighter';
  switch (e.type) {
    case 'slash': {
      const r = e.size || 46;
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      const a0 = -1.6 + k * 0.6, a1 = -1.6 + Math.min(1, k * 2.2) * 2.8;
      ctx.globalAlpha = 1 - k * k;
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.arc(-6, 2, r - 12, a1 - 0.1, a0 + 0.5, true); ctx.closePath();
      ctx.fillStyle = rgba(c, 0.55); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r - 2, a0 + 0.3, a1); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r + 6, a0 + 0.6, a1 - 0.2); ctx.strokeStyle = rgba(c, 0.5); ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case 'hit': case 'critHit': {
      const crit = e.type === 'critHit';
      const R = (crit ? 34 : 22) * (0.5 + k);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = rgba(crit ? '#ff4fd8' : c, 0.6);
      ctx.beginPath(); starPath(ctx, 0, 0, R, R * 0.35, crit ? 8 : 6, e.seed); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.35 * (1 - k), 0, PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(crit ? '#ffe066' : '#ffffff', 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = crit ? '#ffe066' : '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k), 0, PI * 2); ctx.fill(); }
      break;
    }
    case 'spark': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath();
      for (const p of e.parts) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
      ctx.stroke();
      break;
    }
    case 'explosion': {
      const R = e.size ? e.size * 0.5 : 80;
      const fk = Math.min(1, k * 3);
      // 閃光
      ctx.globalAlpha = Math.max(0, 1 - k * 2.2);
      const g = ctx.createRadialGradient(0, -10, 2, 0, -10, R * (0.4 + fk * 0.8));
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, rgba('#ffd23f', 0.9)); g.addColorStop(0.7, rgba(c, 0.6)); g.addColorStop(1, rgba('#ff3d7f', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -10, R * (0.4 + fk * 0.8), 0, PI * 2); ctx.fill();
      // 衝撃波リング
      ctx.globalAlpha = Math.max(0, 1 - k * 1.5);
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 4 * (1 - k);
      ctx.beginPath(); ctx.ellipse(0, -6, R * (0.3 + k * 1.1), R * (0.12 + k * 0.4), 0, 0, PI * 2); ctx.stroke();
      ctx.globalAlpha = 1 - k;
      for (const p of e.parts) {
        if (p.smoke) continue;
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y - 10, p.r * (1 - k * 0.7), 0, PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const p of e.parts) {
        if (!p.smoke) continue;
        ctx.globalAlpha = Math.max(0, 0.5 * (1 - k)) * Math.min(1, k * 4);
        ctx.fillStyle = '#5a4a66'; ctx.beginPath(); ctx.arc(p.x, p.y - 14, p.r * (0.6 + k), 0, PI * 2); ctx.fill();
      }
      break;
    }
    case 'smoke': {
      for (const p of e.parts) {
        ctx.globalAlpha = 0.45 * (1 - k);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.9), 0, PI * 2); ctx.fill();
        ctx.globalAlpha = 0.25 * (1 - k);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.4 * (0.6 + k), 0, PI * 2); ctx.fill();
      }
      break;
    }
    case 'pickup': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 6 + k * 22, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.6, p.r * 0.6, 4); ctx.fill(); }
      break;
    }
    case 'muzzle': {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      ctx.globalAlpha = 1 - k;
      const s = (e.size || 16) * (1 + k);
      ctx.fillStyle = 'rgba(255,240,180,0.95)';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 1.4, 0); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#ff9a3c', 0.7);
      ctx.beginPath(); starPath(ctx, s * 0.3, 0, s * 0.8, s * 0.3, 6); ctx.fill();
      break;
    }
    case 'dash': {
      ctx.scale(e.dir < 0 ? -1 : 1, 1);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = 3;
      ctx.beginPath();
      for (const p of e.parts) { const o = k * 60; ctx.moveTo(p.x - o, p.y + 30); ctx.lineTo(p.x - o - p.l, p.y + 30); }
      ctx.stroke();
      ctx.fillStyle = rgba(c, 0.25 * (1 - k)); ctx.beginPath(); ctx.ellipse(-20 - k * 30, 0, 24, 34, 0, 0, PI * 2); ctx.fill();
      break;
    }
    case 'buff': case 'heal': case 'levelUp': case 'rareDrop': {
      drawRising(ctx, e, k, c);
      break;
    }
    case 'portal': {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -40, 30 * (1 - k * 0.5), 44 * (1 - k * 0.5), 0, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const p of e.parts) { ctx.beginPath(); ctx.arc(Math.cos(p.a) * p.r, -40 + Math.sin(p.a) * p.r * 1.3, p.s, 0, PI * 2); ctx.fill(); }
      break;
    }
    case 'tear': {
      for (const p of e.parts) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7) * 0.6 + 0.4 || 0.1);
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        ctx.beginPath(); ctx.moveTo(p.pts[0], p.pts[1]); for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]); ctx.closePath();
        ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = '#2a1430'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      break;
    }
    default: {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 10 * (1 + k), 0, PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawRising(ctx, e, k, c) {
  const type = e.type;
  const fade = k < 0.8 ? 1 : (1 - k) / 0.2;
  if (type === 'levelUp' || type === 'rareDrop') {
    // 光の柱
    const h = type === 'levelUp' ? 160 : 130;
    const w = type === 'levelUp' ? 46 : 26;
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.6, rgba(c, 0.35 * fade)); g.addColorStop(1, rgba('#ffffff', 0.55 * fade));
    ctx.fillStyle = g;
    const ww = w * (type === 'levelUp' ? Math.min(1, k * 5) : 1) * (1 + Math.sin(e.t * 10) * 0.05);
    ctx.beginPath(); ctx.moveTo(-ww / 2, 0); ctx.lineTo(-ww * 0.35, -h); ctx.lineTo(ww * 0.35, -h); ctx.lineTo(ww / 2, 0); ctx.closePath(); ctx.fill();
    // 足元リング
    ctx.strokeStyle = rgba(c, 0.8 * fade); ctx.lineWidth = 3;
    const rk = (e.t * 1.5) % 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 20 + rk * 30, 6 + rk * 8, 0, 0, PI * 2); ctx.stroke();
  }
  if (type === 'buff') {
    ctx.strokeStyle = rgba(c, 0.8 * (1 - k)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -4, 22 + k * 20, 7 + k * 6, 0, 0, PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -40 - k * 30, 16 + k * 10, 5 + k * 3, 0, 0, PI * 2); ctx.stroke();
  }
  for (const p of e.parts) {
    if (e.t < p.d) continue;
    ctx.globalAlpha = fade * 0.9;
    ctx.fillStyle = type === 'heal' ? '#c8ffd8' : type === 'levelUp' ? (p.r > 3 ? '#ffe066' : '#ffffff') : '#ffffff';
    if (type === 'heal') { ctx.fillRect(p.x - p.r, p.y - p.r * 0.35, p.r * 2, p.r * 0.7); ctx.fillRect(p.x - p.r * 0.35, p.y - p.r, p.r * 0.7, p.r * 2); }
    else { ctx.beginPath(); starPath(ctx, p.x, p.y, p.r * 1.8, p.r * 0.6, 4, e.t * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (type === 'levelUp') {
    // LEVEL UP! テキスト
    ctx.globalCompositeOperation = 'source-over';
    const ty = -110 - Math.min(1, k * 4) * 20;
    const pop = k < 0.08 ? 0.6 + (k / 0.08) * 0.6 : k < 0.14 ? 1.2 - ((k - 0.08) / 0.06) * 0.2 : 1;
    ctx.save(); ctx.translate(0, ty); ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.font = '900 30px "Arial Black", "Arial Rounded MT Bold", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 7; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText('LEVEL UP!', 0, 0);
    const g = ctx.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, '#fffbd0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff7a3c');
    ctx.fillStyle = g; ctx.fillText('LEVEL UP!', 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- ダメージ数字
const DMG_STYLE = {
  normal: { top: '#ffe36e', bot: '#ff8a1f', size: 28 },
  crit: { top: '#ff7ad9', bot: '#c2187a', size: 34 },
  toPlayer: { top: '#d9b3ff', bot: '#8a3df0', size: 26 },
  heal: { top: '#b8ff9e', bot: '#2ecc71', size: 26 },
  miss: { top: '#eeeeee', bot: '#aaaaaa', size: 22 },
};


function drawDmg(ctx, e) {
  const st = e.miss ? DMG_STYLE.miss : e.heal ? DMG_STYLE.heal : e.toPlayer ? DMG_STYLE.toPlayer : e.crit ? DMG_STYLE.crit : DMG_STYLE.normal;
  const k = e.t / e.life;
  const rise = Math.min(1, e.t / 0.8) * 40;
  const y = e.baseY - 26 * e.stack - rise - 20;
  const pop = e.t < 0.1 ? 1.4 - (e.t / 0.1) * 0.4 : 1;
  const alpha = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
  const size = st.size;
  ctx.save();
  ctx.translate(e.x, y);
  ctx.scale(pop, pop);
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", Impact, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 1文字ずつ少し重ねて描く（メイプル風）
  const chars = e.text;
  const ws = [];
  let total = 0;
  for (let i = 0; i < chars.length; i++) { const w = ctx.measureText(chars[i]).width * 0.86; ws.push(w); total += w; }
  let cx = -total / 2;
  let g = null;
  if (!e.miss) {
    g = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, st.top); g.addColorStop(1, st.bot);
  }
  if (e.crit && !e.toPlayer) {
    // 星
    ctx.save(); ctx.translate(cx - 10, -size * 0.45); ctx.rotate(e.t * 3);
    ctx.beginPath(); starPath(ctx, 0, 0, 13, 5.5, 5);
    ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.strokeStyle = '#2a0b3d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < chars.length; i++) {
    const bob = e.t < 0.2 ? Math.sin(Math.min(1, e.t / 0.2) * PI) * -4 * ((i % 2) ? 1 : 0.4) : 0;
    const tx = cx + ws[i] / 2;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(chars[i], tx, bob);
    ctx.fillStyle = g || st.top; ctx.fillText(chars[i], tx, bob);
    cx += ws[i];
  }
  ctx.restore();
}

