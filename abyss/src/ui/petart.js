// ペットの絵の予備（アート担当の 'pet' の絵描きが無いときだけ使う）。data/pets.js の body・palette・features から簡単に描く。
// アート担当が assets.addPainter('pet', ...) を登録していれば、そちらが使われる（ここでは登録しない）。

const TAU = Math.PI * 2;

function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU); ctx.fill(); }
function tri(ctx, a, b, c) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); ctx.fill(); }

function shade(ctx, x, y, r, col) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#ffffff55'); g.addColorStop(0.4, `${col}00`); g.addColorStop(1, '#00000055');
  return g;
}

function eyes(ctx, x, y, r, pal, n = 2) {
  ctx.fillStyle = pal.eye || '#fff';
  for (let i = 0; i < n; i++) ell(ctx, x + i * r * 2.2, y, r, r * 1.15);
  ctx.fillStyle = '#000a';
  for (let i = 0; i < n; i++) ell(ctx, x + i * r * 2.2 + r * 0.3, y + r * 0.1, r * 0.45, r * 0.6);
}

export function drawPet(ctx, def, w, h) {
  const pal = def.palette || { main: '#aaa', sub: '#555', eye: '#fff' };
  const f = new Set(def.features || []);
  const cx = w * 0.5; const base = h * 0.95;
  ctx.save();
  ctx.lineJoin = 'round';
  if (f.has('glow') || f.has('flames')) {
    const g = ctx.createRadialGradient(cx, h * 0.55, 2, cx, h * 0.55, w * 0.5);
    g.addColorStop(0, `${pal.accent || pal.main}66`); g.addColorStop(1, `${pal.accent || pal.main}00`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const body = def.body;
  const wing = (x, y, s, up = true) => { ctx.fillStyle = pal.sub; tri(ctx, [x, y], [x - s * 0.9, y - s * (up ? 0.9 : 0.2)], [x - s * 0.2, y + s * 0.25]); ctx.fillStyle = `${pal.accent || pal.main}88`; tri(ctx, [x, y], [x - s * 0.6, y - s * (up ? 0.6 : 0.1)], [x - s * 0.15, y + s * 0.1]); };
  if (body === 'quad' || body === 'beast_large' || body === 'dragon') {
    const big = body === 'beast_large' ? 1.15 : 1;
    const by = h * 0.62; const bx = w * 0.46;
    if (f.has('tail')) { ctx.strokeStyle = pal.main; ctx.lineWidth = w * 0.07; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - w * 0.2, by); ctx.quadraticCurveTo(w * 0.05, by - h * 0.05, w * 0.1, by - h * 0.3); ctx.stroke(); if (f.has('flames')) { ctx.fillStyle = pal.accent || '#ffa040'; ell(ctx, w * 0.1, by - h * 0.33, w * 0.06, h * 0.08); } }
    if (body === 'dragon' || f.has('wings')) wing(bx + w * 0.02, by - h * 0.12, w * 0.32);
    ctx.fillStyle = pal.sub;
    for (const lx of [-0.18, -0.07, 0.08, 0.19]) ctx.fillRect(bx + w * lx * big - w * 0.03, by + h * 0.05, w * 0.06, base - by - h * 0.05);
    ctx.fillStyle = pal.main; ell(ctx, bx, by, w * 0.27 * big, h * 0.15 * big);
    ctx.fillStyle = shade(ctx, bx, by, w * 0.27, pal.main); ell(ctx, bx, by, w * 0.27 * big, h * 0.15 * big);
    const hx = bx + w * 0.26 * big; const hy = by - h * 0.14;
    ctx.fillStyle = pal.main;
    tri(ctx, [hx - w * 0.1, hy - h * 0.06], [hx - w * 0.04, hy - h * 0.24], [hx + w * 0.02, hy - h * 0.07]);
    tri(ctx, [hx + w * 0.02, hy - h * 0.07], [hx + w * 0.08, hy - h * 0.23], [hx + w * 0.12, hy - h * 0.04]);
    ell(ctx, hx, hy, w * 0.14, h * 0.12);
    ell(ctx, hx + w * 0.11, hy + h * 0.03, w * 0.07, h * 0.05);
    if (f.has('horns') || body === 'dragon') { ctx.fillStyle = pal.accent || '#e0d0a0'; tri(ctx, [hx - w * 0.04, hy - h * 0.08], [hx - w * 0.12, hy - h * 0.24], [hx, hy - h * 0.1]); }
    if (f.has('bones')) { ctx.strokeStyle = pal.sub; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(bx + i * w * 0.07, by - h * 0.1); ctx.lineTo(bx + i * w * 0.07, by + h * 0.1); ctx.stroke(); } }
    if (f.has('mask')) { ctx.fillStyle = pal.accent || '#fff'; ell(ctx, hx + w * 0.03, hy - h * 0.01, w * 0.09, h * 0.05); }
    eyes(ctx, hx - w * 0.01, hy - h * 0.02, w * 0.025, pal);
    if (f.has('crystals')) { ctx.fillStyle = pal.accent || '#a0d8ff'; for (const k of [-0.12, 0, 0.12]) tri(ctx, [bx + w * k - w * 0.03, by - h * 0.12], [bx + w * k, by - h * 0.26], [bx + w * k + w * 0.03, by - h * 0.12]); }
  } else if (body === 'flyer') {
    const by = h * 0.5;
    wing(cx - w * 0.04, by, w * 0.4);
    ctx.save(); ctx.translate(2 * cx, 0); ctx.scale(-1, 1); wing(cx - w * 0.04, by, w * 0.4); ctx.restore();
    ctx.fillStyle = pal.main; ell(ctx, cx, by, w * 0.16, h * 0.18);
    ctx.fillStyle = shade(ctx, cx, by, w * 0.16, pal.main); ell(ctx, cx, by, w * 0.16, h * 0.18);
    ctx.fillStyle = pal.accent || '#ffcc40'; tri(ctx, [cx + w * 0.12, by - h * 0.06], [cx + w * 0.24, by - h * 0.02], [cx + w * 0.12, by + h * 0.01]);
    eyes(ctx, cx - w * 0.02, by - h * 0.07, w * 0.03, pal);
    if (f.has('flames')) { ctx.fillStyle = `${pal.accent || '#ffa040'}cc`; tri(ctx, [cx - w * 0.08, by - h * 0.15], [cx, by - h * 0.36], [cx + w * 0.08, by - h * 0.15]); }
  } else if (body === 'blob' || body === 'elemental') {
    const by = body === 'elemental' ? h * 0.52 : h * 0.68;
    if (body === 'elemental') {
      ctx.fillStyle = `${pal.accent || pal.main}55`; ell(ctx, cx, by, w * 0.34, h * 0.34);
      ctx.fillStyle = pal.main; ell(ctx, cx, by, w * 0.22, h * 0.24);
      if (f.has('crystals')) { ctx.fillStyle = pal.accent || '#e0b0ff'; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; tri(ctx, [cx + Math.cos(a) * w * 0.2, by + Math.sin(a) * h * 0.2], [cx + Math.cos(a) * w * 0.4, by + Math.sin(a) * h * 0.4], [cx + Math.cos(a + 0.4) * w * 0.2, by + Math.sin(a + 0.4) * h * 0.2]); } }
    } else {
      ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(cx, by, w * 0.32, h * 0.26, 0, Math.PI, 0); ctx.lineTo(cx + w * 0.32, base); ctx.lineTo(cx - w * 0.32, base); ctx.fill();
    }
    ctx.fillStyle = shade(ctx, cx, by, w * 0.3, pal.main); ell(ctx, cx, by, w * 0.28, h * 0.22);
    eyes(ctx, cx - w * 0.06, by - h * 0.04, w * 0.035, pal);
  } else if (body === 'insect' || body === 'spider') {
    const by = h * 0.66;
    if (f.has('wings')) { ctx.fillStyle = `${pal.accent || '#fff'}77`; ell(ctx, cx - w * 0.12, by - h * 0.2, w * 0.2, h * 0.12, -0.5); ell(ctx, cx + w * 0.02, by - h * 0.22, w * 0.18, h * 0.1, -0.2); }
    ctx.strokeStyle = pal.sub; ctx.lineWidth = 2.5;
    for (const lx of [-0.15, -0.03, 0.09]) { ctx.beginPath(); ctx.moveTo(cx + w * lx, by); ctx.lineTo(cx + w * lx - w * 0.06, base); ctx.stroke(); }
    ctx.fillStyle = pal.main; ell(ctx, cx - w * 0.12, by, w * 0.2, h * 0.13); ell(ctx, cx + w * 0.16, by - h * 0.04, w * 0.11, h * 0.1);
    ctx.fillStyle = shade(ctx, cx, by, w * 0.2, pal.main); ell(ctx, cx - w * 0.12, by, w * 0.2, h * 0.13);
    if (f.has('armor')) { ctx.fillStyle = pal.accent || '#b0c8d8'; ell(ctx, cx - w * 0.12, by - h * 0.05, w * 0.16, h * 0.06); }
    if (f.has('horns')) { ctx.fillStyle = pal.accent || '#ddd'; tri(ctx, [cx + w * 0.2, by - h * 0.12], [cx + w * 0.3, by - h * 0.3], [cx + w * 0.26, by - h * 0.08]); }
    eyes(ctx, cx + w * 0.16, by - h * 0.07, w * 0.025, pal);
  } else if (body === 'golem' || body === 'construct') {
    const by = h * 0.6;
    if (f.has('wings')) wing(cx - w * 0.1, by - h * 0.05, w * 0.3);
    ctx.fillStyle = pal.sub; ctx.fillRect(cx - w * 0.18, by + h * 0.12, w * 0.12, base - by - h * 0.12); ctx.fillRect(cx + w * 0.06, by + h * 0.12, w * 0.12, base - by - h * 0.12);
    ctx.fillStyle = pal.main; ctx.fillRect(cx - w * 0.24, by - h * 0.16, w * 0.48, h * 0.3);
    ctx.fillRect(cx - w * 0.14, by - h * 0.36, w * 0.28, h * 0.2);
    ctx.fillStyle = shade(ctx, cx, by - h * 0.1, w * 0.3, pal.main); ctx.fillRect(cx - w * 0.24, by - h * 0.36, w * 0.48, h * 0.5);
    if (f.has('gears')) { ctx.strokeStyle = pal.accent || '#ffd88a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx - w * 0.08, by - h * 0.02, w * 0.08, 0, TAU); ctx.stroke(); }
    if (f.has('crystals')) { ctx.fillStyle = pal.accent || '#a0d8ff'; tri(ctx, [cx - w * 0.04, by - h * 0.36], [cx + w * 0.02, by - h * 0.5], [cx + w * 0.08, by - h * 0.36]); }
    eyes(ctx, cx - w * 0.04, by - h * 0.27, w * 0.03, pal);
  } else if (body === 'plant') {
    const by = h * 0.5;
    ctx.fillStyle = pal.sub; ctx.fillRect(cx - w * 0.1, by, w * 0.2, base - by);
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.ellipse(cx, by + h * 0.04, w * 0.34, h * 0.24, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff8'; for (const [dx, dy] of [[-0.15, -0.08], [0.05, -0.15], [0.17, -0.04]]) ell(ctx, cx + w * dx, by + h * dy, w * 0.045, h * 0.04);
    eyes(ctx, cx - w * 0.06, by + h * 0.18, w * 0.03, pal);
  } else if (body === 'aquatic' || body === 'serpent') {
    const by = h * 0.58;
    if (body === 'serpent') {
      ctx.fillStyle = pal.main;
      for (let i = 0; i < 6; i++) ell(ctx, w * 0.18 + i * w * 0.11, by + Math.sin(i * 1.3) * h * 0.1, w * 0.1, h * 0.1);
      if (f.has('spikes') || f.has('bones')) { ctx.fillStyle = pal.accent || '#fff'; for (let i = 0; i < 5; i++) tri(ctx, [w * 0.16 + i * w * 0.11, by - h * 0.08 + Math.sin(i * 1.3) * h * 0.1], [w * 0.2 + i * w * 0.11, by - h * 0.2 + Math.sin(i * 1.3) * h * 0.1], [w * 0.24 + i * w * 0.11, by - h * 0.08 + Math.sin(i * 1.3) * h * 0.1]); }
      ctx.fillStyle = pal.main; ell(ctx, w * 0.82, by - h * 0.12, w * 0.12, h * 0.11);
      eyes(ctx, w * 0.8, by - h * 0.15, w * 0.025, pal);
    } else {
      ctx.fillStyle = pal.sub; tri(ctx, [w * 0.2, by], [w * 0.04, by - h * 0.16], [w * 0.06, by + h * 0.16]);
      ctx.fillStyle = pal.main; ell(ctx, cx, by, w * 0.3, h * 0.2);
      ctx.fillStyle = shade(ctx, cx, by, w * 0.3, pal.main); ell(ctx, cx, by, w * 0.3, h * 0.2);
      eyes(ctx, cx + w * 0.1, by - h * 0.05, w * 0.03, pal);
    }
  } else {
    ctx.fillStyle = pal.main; ell(ctx, cx, h * 0.62, w * 0.25, h * 0.25);
    eyes(ctx, cx - w * 0.05, h * 0.55, w * 0.03, pal);
  }
  if (f.has('ice')) { ctx.fillStyle = '#d8f4ffcc'; for (const k of [0.3, 0.5, 0.7]) tri(ctx, [w * k - 4, h * 0.42], [w * k, h * 0.3], [w * k + 4, h * 0.42]); }
  if (f.has('flames') && body !== 'flyer') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `${pal.accent || '#ff9a3a'}66`; ell(ctx, cx, h * 0.45, w * 0.18, h * 0.2); }
  ctx.restore();
}

/** アート担当の絵描きが無いときだけ予備を登録する */
export function ensurePetPainter(assets, PET) {
  try {
    const any = Object.keys(PET)[0];
    if (!any || assets.painterFor(`pet.${any}`)?.prefix?.startsWith('pet')) return false;
    assets.addPainter('pet', (ctx, spec, w, h) => { const def = PET[spec.params?.pet] || PET[spec.id?.split('.')[1]]; if (def) drawPet(ctx, def, w, h); });
    return true;
  } catch (e) { console.error(e); return false; }
}

const FLY = new Set(['flyer', 'elemental']);

/** 連れているペットを戦闘の画面に描く（sceneHooks.drawFx から毎フレーム）。体は game.sys.pets.unit */
export function drawPetUnit(scene, ctx, assets, PET) {
  const g = scene.game;
  const u = g?.sys?.pets?.unit;
  if (!u || !g.state?.meta?.pets?.active || !g.combat?.hero) return;
  const x = typeof scene.sx === 'function' ? scene.sx(u.x) : u.x - (scene.camX || 0);
  const y = typeof scene.sy === 'function' ? scene.sy(u.y) : 560 + u.y * 0.9;
  if (x < -200 || x > 1500) return;
  const t = scene.t || 0; const a = u.anim || { s: 'idle', t: 0 };
  const def = PET[u.pet];
  let dx = 0; let dy = 0; let rot = 0; let sx = 1; let sy = 1;
  if (a.s === 'walk') { dy = -Math.abs(Math.sin(a.t * 11)) * 5; rot = Math.sin(a.t * 11) * 0.05; }
  else if (a.s === 'attack') { const k = Math.min(1, a.t / 0.45); dx = (u.face || 1) * Math.sin(k * Math.PI) * 16; sy = 1 + 0.08 * Math.sin(k * Math.PI); }
  else { const b = Math.sin(t * 3 + 1); dy = b * 1.5; sy = 1 + b * 0.02; }
  const fly = FLY.has(def?.body);
  if (fly) dy += -28 + Math.sin(t * 4) * 6;
  const sz = u.size || 0.8;
  ctx.save();
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y, 24 * sz, 6 * sz, 0, 0, TAU); ctx.fill();
  ctx.restore();
  assets.draw(ctx, u.art, x + dx, y + dy, { scale: sz, sx, sy, rot, flip: (u.face || 1) < 0, t });
}
