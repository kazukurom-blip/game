// タイトル画面: ネオン夕焼け背景 / ロゴ / 主人公選択（ルナ・ジン） / つづきから
import { COL, FONT, font, txt, rrPath, panel, drawButton, inRect, rgba, clamp } from './theme.js';
import { guard, drawChar, heroLook, starterEquip, getItemDef, looksFrom } from './deps.js';

const W = 1280, H = 720;
const HEROES = [
  { id: 'luna', name: 'ルナ', en: 'LUNA', color: COL.pink,
    role: 'ストリートアイドル', lines: ['スピードとクリティカルで魅せる', 'テクニカル型アタッカー'] },
  { id: 'jin', name: 'ジン', en: 'JIN', color: COL.teal,
    role: 'ストリートブロウラー', lines: ['パワーとタフさで押し切る', '頼れる喧嘩屋'] },
];
const WT = { melee: '近接', gun: '銃', magic: '魔法' };

const T = { sel: 0, focus: 'hero', regions: {}, saveChecked: -1, hasSave: false, hover: null };

function checkSave(t) {
  if (t - T.saveChecked < 1 && T.saveChecked >= 0) return T.hasSave;
  T.saveChecked = t;
  T.hasSave = guard('localStorage', () => !!localStorage.getItem('nvs_save'), false);
  return T.hasSave;
}

// 戻り値: 'luna' | 'jin' | 'continue' | null
export function titleInput(game) {
  const inp = game?.input;
  if (!inp) return null;
  const P = (a) => guard('input.pressed', () => !!inp.pressed(a), false);
  const m = inp.mouse || {};
  const hasSave = checkSave(game.time || 0);
  if (!hasSave && T.focus === 'continue') T.focus = 'hero';
  if (P('left')) { T.focus = 'hero'; T.sel = (T.sel + HEROES.length - 1) % HEROES.length; }
  if (P('right')) { T.focus = 'hero'; T.sel = (T.sel + 1) % HEROES.length; }
  if (P('down') && hasSave) T.focus = 'continue';
  if (P('up')) T.focus = 'hero';
  // マウス
  const R = T.regions;
  T.hover = null;
  for (let i = 0; i < HEROES.length; i++) {
    if (inRect(m.x, m.y, R['hero' + i])) { T.hover = 'hero' + i; if (T.mx !== m.x || T.my !== m.y) { T.sel = i; T.focus = 'hero'; } }
  }
  if (hasSave && inRect(m.x, m.y, R.cont)) { T.hover = 'cont'; if (T.mx !== m.x || T.my !== m.y) T.focus = 'continue'; }
  if (inRect(m.x, m.y, R.start)) T.hover = 'start';
  T.mx = m.x; T.my = m.y;
  if (m.clicked) {
    for (let i = 0; i < HEROES.length; i++) if (inRect(m.x, m.y, R['hero' + i])) { T.sel = i; return HEROES[i].id; }
    if (hasSave && inRect(m.x, m.y, R.cont)) return 'continue';
    if (inRect(m.x, m.y, R.start)) return HEROES[T.sel].id;
  }
  if (P('confirm') || P('interact') || P('jump')) {
    guard('consume', () => { inp.consume?.('confirm'); inp.consume?.('interact'); inp.consume?.('jump'); });
    return T.focus === 'continue' && hasSave ? 'continue' : HEROES[T.sel].id;
  }
  return null;
}

export function drawTitle(ctx, game, t) {
  t = t ?? game?.time ?? 0;
  const hasSave = checkSave(t);
  ctx.save();
  try {
    drawBackdrop(ctx, t);
    drawLogo(ctx, t);
    drawHeroes(ctx, game, t);
    drawMenu(ctx, t, hasSave);
  } catch (e) { guard('title', () => { throw e; }); }
  ctx.restore();
}

// ---------- 背景: シンセウェーブ夕焼け ----------
function drawBackdrop(ctx, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a0b3d');
  sky.addColorStop(0.32, '#5a1a7a');
  sky.addColorStop(0.52, '#d63d8a');
  sky.addColorStop(0.64, '#ff8a3d');
  sky.addColorStop(0.66, '#3a0f5a');
  sky.addColorStop(1, '#0d0624');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // 星
  for (let i = 0; i < 70; i++) {
    const sx = (i * 197.3) % W, sy = (i * 73.7) % 220;
    const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + i));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  // 太陽（ストライプ）
  const sunX = W / 2, sunY = 400, sr = 170;
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, sr, Math.PI, 0); ctx.closePath();
  ctx.clip();
  const sg = ctx.createLinearGradient(0, sunY - sr, 0, sunY);
  sg.addColorStop(0, '#fff3a0'); sg.addColorStop(0.5, '#ffb347'); sg.addColorStop(1, '#ff4f9a');
  ctx.fillStyle = sg;
  ctx.fillRect(sunX - sr, sunY - sr, sr * 2, sr);
  ctx.fillStyle = '#d63d8a';
  for (let i = 0; i < 7; i++) {
    const yy = sunY - 80 + i * 13 + ((t * 10) % 13);
    ctx.fillRect(sunX - sr, yy, sr * 2, 2 + i * 0.9);
  }
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#ff7ab8'; ctx.shadowBlur = 60;
  ctx.fillStyle = 'rgba(255,140,90,0.08)';
  ctx.beginPath(); ctx.arc(sunX, sunY, sr + 20, Math.PI, 0); ctx.fill();
  ctx.restore();
  // 遠景ビル群
  const hz = 432;
  ctx.fillStyle = '#2b0f4f';
  for (let i = 0; i < 40; i++) {
    const bw = 28 + (i * 37) % 40, bh = 40 + (i * 89) % 150;
    const bx = (i * 61) % (W + 60) - 30;
    ctx.fillRect(bx, hz - bh, bw, bh);
  }
  ctx.fillStyle = '#1c0838';
  for (let i = 0; i < 26; i++) {
    const bw = 40 + (i * 53) % 50, bh = 60 + (i * 131) % 200;
    const bx = (i * 97 + 20) % (W + 80) - 40;
    if (Math.abs(bx + bw / 2 - W / 2) < 120 && bh > 150) continue;
    ctx.fillRect(bx, hz - bh, bw, bh);
    // 窓
    for (let wy = hz - bh + 10; wy < hz - 8; wy += 14) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
        const on = ((wx * 7 + wy * 13 + i) % 5) === 0;
        if (on) { ctx.fillStyle = ((wx + wy) % 3) ? 'rgba(255,216,110,0.7)' : 'rgba(0,240,255,0.6)'; ctx.fillRect(wx, wy, 4, 5); ctx.fillStyle = '#1c0838'; }
      }
    }
  }
  // ネオン看板
  const signs = [[150, 300, COL.pink, 'MOTEL'], [1090, 280, COL.teal, 'CLUB'], [930, 340, '#ffd447', 'BAR']];
  for (const [sx, sy, c, s] of signs) {
    const on = Math.sin(t * 3 + sx) > -0.85;
    ctx.save();
    ctx.font = `900 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = c; ctx.shadowBlur = on ? 18 : 0;
    ctx.fillStyle = on ? c : rgba(c, 0.3);
    ctx.fillText(s, sx, sy);
    ctx.restore();
  }
  // グリッド床
  const fg = ctx.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, '#2a0b4d'); fg.addColorStop(1, '#0a0420');
  ctx.fillStyle = fg;
  ctx.fillRect(0, hz, W, H - hz);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,95,162,0.55)';
  ctx.shadowColor = COL.pink; ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  const off = (t * 40) % 40;
  for (let i = 0; i < 14; i++) {
    const k = (i * 40 + off) / 560;
    const yy = hz + Math.pow(k, 1.8) * (H - hz) * 1.6;
    if (yy > H) break;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(25,211,197,0.45)';
  ctx.shadowColor = COL.teal;
  for (let i = -16; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo(W / 2 + i * 18, hz); ctx.lineTo(W / 2 + i * 150, H); ctx.stroke();
  }
  ctx.restore();
  // 地平線グロー
  const hg = ctx.createLinearGradient(0, hz - 6, 0, hz + 10);
  hg.addColorStop(0, 'rgba(255,120,180,0)'); hg.addColorStop(0.5, 'rgba(255,170,200,0.9)'); hg.addColorStop(1, 'rgba(255,120,180,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, hz - 6, W, 16);
  // ヤシの木シルエット
  palm(ctx, 70, H - 30, 1.25, t);
  palm(ctx, 1200, H - 20, 1.4, t + 1);
  palm(ctx, 1120, H - 60, 0.9, t + 2);
}
function palm(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#0a0318';
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.quadraticCurveTo(10, -150, 26, -300); ctx.lineTo(36, -298); ctx.quadraticCurveTo(22, -150, 10, 0);
  ctx.closePath(); ctx.fill();
  const sway = Math.sin(t * 1.2) * 0.06;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.5 + sway;
    ctx.save();
    ctx.translate(31, -300); ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(50, -40, 110, 10);
    ctx.quadraticCurveTo(50, -18, 0, 8);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---------- ロゴ ----------
function drawLogo(ctx, t) {
  const cx = W / 2, cy = 112;
  const wob = Math.sin(t * 1.6) * 0.012;
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 2) * 3);
  ctx.rotate(wob - 0.03);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  const txtLogo = 'NEON VICE STORY';
  ctx.font = `italic 900 84px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 影（オフセット）
  ctx.fillStyle = 'rgba(25,211,197,0.85)';
  ctx.fillText(txtLogo, 6, 6);
  ctx.lineWidth = 14; ctx.strokeStyle = '#1a0630';
  ctx.strokeText(txtLogo, 0, 0);
  // グロー
  ctx.shadowColor = COL.pink; ctx.shadowBlur = 30 + Math.sin(t * 4) * 8;
  const g = ctx.createLinearGradient(0, -40, 0, 40);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(0.6, '#ff5fa2'); g.addColorStop(1, '#7b2ff7');
  ctx.fillStyle = g;
  ctx.fillText(txtLogo, 0, 0);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(txtLogo, 0, 0);
  // ハイライトスイープ
  const sx = ((t * 260) % 1400) - 700;
  ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillText(txtLogo, 0, 0);
  ctx.restore();
  // サブタイトル
  ctx.save();
  const sw = 420;
  rrPath(ctx, cx - sw / 2, cy + 52, sw, 34, 17);
  ctx.fillStyle = 'rgba(15,5,40,0.7)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = COL.teal; ctx.shadowColor = COL.teal; ctx.shadowBlur = 12; ctx.stroke();
  ctx.restore();
  txt(ctx, '〜 ネオン・ヴァイス・ストーリー 〜', cx, cy + 70, { size: 18, align: 'center', color: '#e8fffd', glow: COL.teal });
}

// ---------- 主人公 ----------
function drawHeroes(ctx, game, t) {
  const pos = [W / 2 - 230, W / 2 + 230];
  const baseY = 540;
  // 非選択→選択の順で描画（選択中が前）
  const order = [0, 1].sort((a, b) => (a === T.sel ? 1 : 0) - (b === T.sel ? 1 : 0));
  for (const i of order) {
    const h = HEROES[i];
    const on = i === T.sel && T.focus === 'hero';
    const sel = i === T.sel;
    const x = pos[i] + (sel ? 0 : (i === 0 ? -14 : 14));
    const sc = sel ? 2.7 : 2.3;
    T.regions['hero' + i] = { x: pos[i] - 120, y: 230, w: 240, h: 390 };
    // スポットライト
    ctx.save();
    if (sel) {
      const lg = ctx.createRadialGradient(x, baseY - 100, 10, x, baseY - 80, 230);
      lg.addColorStop(0, rgba(h.color, 0.45)); lg.addColorStop(1, rgba(h.color, 0));
      ctx.fillStyle = lg; ctx.fillRect(x - 240, baseY - 330, 480, 400);
      // 台座リング
      ctx.strokeStyle = h.color; ctx.lineWidth = 3; ctx.shadowColor = h.color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.ellipse(x, baseY + 4, 90 + Math.sin(t * 4) * 4, 20, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, baseY + 4, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // キャラ
    const se = starterEquip(h.id);
    const equip = se ? looksFrom(se) : {};
    ctx.save();
    if (!sel) ctx.globalAlpha = 0.62;
    const bob = sel ? Math.sin(t * 3) * 3 : 0;
    drawChar(ctx, x, baseY + bob * 0, heroLook(h.id), equip, {
      facing: i === 0 ? 1 : -1, state: 'idle', t: t + i * 0.7, attackT: 0, damage: 0, scale: sc, flash: false, alpha: sel ? 1 : 0.75,
    });
    ctx.restore();
    // ネームカード
    const cw = 260, ch = 110;
    const cx = pos[i] - cw / 2, cy = baseY + 22;
    panel(ctx, cx, cy, cw, ch, {
      r: 16, glow: sel ? rgba(h.color, 0.8) : null, stroke: sel ? '#fff' : 'rgba(255,255,255,0.5)',
      inner: rgba(h.color, 0.7), top: sel ? 'rgba(60,30,120,0.92)' : 'rgba(30,20,70,0.8)',
    });
    txt(ctx, h.name, cx + 18, cy + 26, { size: 26, color: '#fff', glow: sel ? h.color : null, sw: 5 });
    const nw = 26 * h.name.length + 8;
    txt(ctx, h.en, cx + 18 + nw, cy + 29, { size: 13, color: h.color, sw: 3 });
    // 武器種
    const wpn = getItemDef(se?.weapon);
    const role = h.role + (wpn?.weaponType ? ` ・ ${WT[wpn.weaponType] || wpn.weaponType}` : '');
    ctx.save();
    rrPath(ctx, cx + 16, cy + 44, cw - 32, 20, 10);
    ctx.fillStyle = rgba(h.color, 0.25); ctx.fill();
    ctx.restore();
    txt(ctx, role, cx + cw / 2, cy + 54.5, { size: 12, color: COL.gold, align: 'center', sw: 3 });
    txt(ctx, h.lines[0], cx + 18, cy + 77, { size: 12.5, color: '#efeaff', weight: 700, sw: 3 });
    txt(ctx, h.lines[1], cx + 18, cy + 96, { size: 12.5, color: '#efeaff', weight: 700, sw: 3 });
    if (sel) {
      const ay = cy + ch / 2, k = Math.sin(t * 6) * 4;
      txt(ctx, '◀', cx - 22 - k, ay, { size: 22, align: 'center', color: h.color, glow: h.color });
      txt(ctx, '▶', cx + cw + 22 + k, ay, { size: 22, align: 'center', color: h.color, glow: h.color });
    }
  }
}

// ---------- メニュー ----------
function drawMenu(ctx, t, hasSave) {
  const h = HEROES[T.sel];
  // 開始ボタン（中央）
  const sr = { x: W / 2 - 110, y: 420, w: 220, h: 50 };
  T.regions.start = sr;
  const startFocus = T.focus === 'hero';
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  ctx.save();
  if (startFocus) { ctx.shadowColor = h.color; ctx.shadowBlur = 16 + pulse * 14; }
  drawButton(ctx, sr, `${h.name} ではじめる`, { color: h.color === COL.pink ? '#d93f86' : '#109f95', hover: startFocus || T.hover === 'start', size: 18, r: 25 });
  ctx.restore();
  txt(ctx, '←→ 主人公を選択  /  Enter・Space で決定', W / 2, sr.y + sr.h + 14, { size: 11, align: 'center', color: COL.sub, sw: 2.5, alpha: startFocus ? 1 : 0.5 });
  if (hasSave) {
    const cr = { x: W / 2 - 100, y: 500, w: 200, h: 40 };
    T.regions.cont = cr;
    const f = T.focus === 'continue';
    ctx.save();
    if (f) { ctx.shadowColor = COL.gold; ctx.shadowBlur = 14 + pulse * 10; }
    drawButton(ctx, cr, '▶ つづきから', { color: '#c98a1a', hover: f || T.hover === 'cont', size: 16, r: 20 });
    ctx.restore();
    txt(ctx, f ? '↑ で主人公選択へ' : '↓ でつづきから', W / 2, cr.y + cr.h + 13, { size: 11, align: 'center', color: COL.sub, sw: 2.5 });
  } else T.regions.cont = null;
  // 操作説明
  const help = '操作:  ←→ 移動   Space ジャンプ   X 攻撃   A/S/D/F スキル   1/2 ポーション   Z 拾う   E 会話・乗車   ↑ ポータル   I/K/J/T ウィンドウ';
  ctx.save();
  rrPath(ctx, 40, H - 40, W - 80, 28, 14);
  ctx.fillStyle = 'rgba(10,4,30,0.7)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,95,162,0.6)'; ctx.stroke();
  ctx.restore();
  txt(ctx, help, W / 2, H - 25.5, { size: 12, align: 'center', color: '#e9e4ff', sw: 2.5, maxW: W - 110, weight: 700 });
  txt(ctx, '© NEON VICE STORY  —  ネオリダ州ヴァイス・ベイ市（架空）', W - 16, 16, { size: 10, align: 'right', color: 'rgba(255,255,255,0.45)', stroke: false });
  void clamp; void font;
}
