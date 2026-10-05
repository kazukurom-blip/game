// 乗り物描画: 80年代ネオン×現代スポーツカー調（v.x,v.y = 足元中央）
import { shade, rgba, rr, OUTLINE } from './util.js';
import { drawCharacter, HERO_LOOKS, lastHeroEquip } from './character.js';
import { vehicleArt } from './artOverrides.js';

// 運転手の見た目: v.driverLook / v.driverEquip があればそれを使う。プレイヤー運転時は heroId から推定。
function driverLook(v) {
  if (v.driverLook) return [v.driverLook, v.driverEquip || null];
  if (v.driverType === 'player') {
    const hid = v.game && v.game.state && v.game.state.heroId;
    const p = v.game && v.game.player;
    const look = HERO_LOOKS[hid] || HERO_LOOKS.luna;
    const eq = (p && (p.equipLooks || p.looks)) || lastHeroEquip(look);
    return [look, eq];
  }
  return null;
}

const PI = Math.PI;

function fs(ctx, col, lw = 2) { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); }

function wheel(ctx, x, y, r, rot, rim = '#d8dde8', accent = '#19f0ff') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); fs(ctx, '#18161f', 2);
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, PI * 2); fs(ctx, rim, 1.4);
  ctx.strokeStyle = shade(rim, -0.45); ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = rot + (i * PI * 2) / 5; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, PI * 2); ctx.fillStyle = accent; ctx.fill();
}

function underglow(ctx, w, col, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, -2, 4, 0, -2, w * 0.55);
  const a = 0.35 + Math.sin(t * 4) * 0.05;
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -2, w * 0.55, 9, 0, 0, PI * 2); ctx.fill();
  ctx.restore();
}

function driverHead(ctx, x, y, cop) {
  ctx.fillStyle = 'rgba(20,10,30,0.75)';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, PI * 2); ctx.fill();
  ctx.fillRect(x - 9, y + 4, 18, 12);
  if (cop) { ctx.fillStyle = 'rgba(31,58,138,0.9)'; ctx.beginPath(); ctx.ellipse(x, y - 6, 10, 4, 0, PI, PI * 2); ctx.fill(); ctx.fillRect(x, y - 7, 13, 2.5); }
}

export function drawVehicle(ctx, v) {
  const kind = v.kind || 'sports';
  const t = v.t != null ? v.t : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
  ctx.save();
  ctx.translate(v.x, v.y);
  // 影
  const sw = kind === 'bike' ? 42 : 72;
  ctx.beginPath(); ctx.ellipse(0, 0, sw, 6, 0, 0, PI * 2); ctx.fillStyle = 'rgba(20,0,30,0.3)'; ctx.fill();
  ctx.scale(v.facing < 0 ? -1 : 1, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const rot = (v.x || 0) / 15;
  // 差し替え画像（manifest の vehicles 節）。読み込み中・無い → コードの絵
  if (drawArtVehicle(ctx, v, kind, t, rot)) { ctx.restore(); return; }
  if (kind === 'bike') drawBike(ctx, v, t, rot);
  else drawCar(ctx, v, t, rot, kind === 'police');
  ctx.restore();
}

function drawCar(ctx, v, t, rot, police) {
  const col = v.color || (police ? '#1b2a4a' : '#ff2e88');
  const acc = police ? '#ffffff' : '#19f0ff';
  const glow = police ? '#2e7bff' : (v.glow || '#19f0ff');
  const sp = Math.abs(v.speed || v.vx || 0);
  const bounce = sp > 30 ? Math.sin(t * 30) * 0.6 : 0;
  underglow(ctx, 150, glow, t);
  ctx.save(); ctx.translate(0, bounce);
  // 車体（ウェッジシェイプ）
  ctx.beginPath();
  if (police) {
    ctx.moveTo(-74, -14); ctx.lineTo(-73, -30); ctx.lineTo(-48, -33); ctx.lineTo(-30, -50); ctx.lineTo(22, -50);
    ctx.lineTo(42, -34); ctx.lineTo(70, -30); ctx.quadraticCurveTo(76, -26, 75, -14); ctx.lineTo(70, -8); ctx.lineTo(-70, -8); ctx.closePath();
  } else {
    ctx.moveTo(-74, -14); ctx.lineTo(-72, -28); ctx.lineTo(-40, -32); ctx.quadraticCurveTo(-18, -48, 10, -46); ctx.lineTo(34, -32);
    ctx.lineTo(70, -24); ctx.quadraticCurveTo(77, -20, 75, -12); ctx.lineTo(70, -8); ctx.lineTo(-70, -8); ctx.closePath();
  }
  const g = ctx.createLinearGradient(0, -50, 0, -8);
  g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.4));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  if (police) {
    // 白いドア
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f4f4f8'; ctx.fillRect(-36, -33, 62, 26);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-6, -25); ctx.lineTo(-1, -22); ctx.lineTo(-2, -16); ctx.lineTo(-6, -13); ctx.lineTo(-10, -16); ctx.lineTo(-11, -22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1b2a4a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  // 窓
  ctx.beginPath();
  if (police) { ctx.moveTo(-42, -34); ctx.lineTo(-27, -47); ctx.lineTo(19, -47); ctx.lineTo(35, -34); ctx.closePath(); }
  else { ctx.moveTo(-34, -32); ctx.quadraticCurveTo(-16, -44, 8, -43); ctx.lineTo(27, -32); ctx.closePath(); }
  const wg = ctx.createLinearGradient(0, -46, 0, -32);
  wg.addColorStop(0, '#5a3d8a'); wg.addColorStop(1, '#1d1a3a');
  ctx.fillStyle = wg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  if (v.driver) {
    ctx.save(); ctx.clip();
    const dl = driverLook(v);
    if (dl) drawCharacter(ctx, -8, -2, dl[0], dl[1], { facing: 1, state: 'drive', t, scale: 0.85 });
    else driverHead(ctx, -4, -36, v.driverType === 'cop' || police);
    ctx.fillStyle = 'rgba(90,61,138,0.25)'; ctx.fillRect(-60, -60, 120, 40);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-22, -36); ctx.lineTo(-14, -42); ctx.moveTo(-12, -35); ctx.lineTo(-5, -41); ctx.stroke();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-6, police ? -47 : -43); ctx.lineTo(-6, -32); ctx.stroke();
  // ボディライン（ネオンストライプ）
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-70, -20); ctx.lineTo(72, -18); ctx.stroke();
  if (!police) {
    ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-68, -17); ctx.lineTo(70, -15); ctx.stroke();
    // サイドインテーク
    ctx.fillStyle = shade(col, -0.5); ctx.beginPath(); ctx.moveTo(30, -28); ctx.lineTo(44, -26); ctx.lineTo(40, -22); ctx.lineTo(30, -23); ctx.closePath(); ctx.fill();
    // スポイラー
    ctx.beginPath(); ctx.moveTo(-74, -28); ctx.lineTo(-76, -36); ctx.lineTo(-58, -36); ctx.lineTo(-58, -32); ctx.closePath(); fs(ctx, shade(col, -0.2), 1.8);
  }
  // ドア線・ハンドル
  ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-36, -31); ctx.lineTo(-38, -10); ctx.moveTo(26, -32); ctx.lineTo(28, -10); ctx.stroke();
  ctx.fillStyle = OUTLINE; ctx.fillRect(14, -28, 6, 1.6);
  // ライト
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.moveTo(70, -24); ctx.lineTo(76, -20); ctx.lineTo(68, -19); ctx.closePath(); ctx.fill();
  const hb = ctx.createLinearGradient(74, 0, 150, 0); hb.addColorStop(0, 'rgba(255,240,180,0.25)'); hb.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = hb; ctx.beginPath(); ctx.moveTo(74, -22); ctx.lineTo(150, -34); ctx.lineTo(150, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,46,77,0.95)'; ctx.fillRect(-75, -26, 4, 6);
  ctx.restore();
  // バンパー
  ctx.beginPath(); rr(ctx, -76, -13, 152, 6, 3); fs(ctx, '#2a2733', 1.6);
  // パトランプ
  if (police) {
    const on = v.siren !== false;
    const ph = ((t * 6) | 0) % 2;
    ctx.beginPath(); rr(ctx, -16, -56, 32, 6, 2); fs(ctx, '#2a2733', 1.6);
    const red = on && ph === 0 ? '#ff2e4d' : '#7a1a2a', blue = on && ph === 1 ? '#2e7bff' : '#1a2a6a';
    ctx.beginPath(); rr(ctx, -15, -55, 14, 4.5, 1.5); ctx.fillStyle = red; ctx.fill();
    ctx.beginPath(); rr(ctx, 1, -55, 14, 4.5, 1.5); ctx.fillStyle = blue; ctx.fill();
    if (on) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cx = ph === 0 ? -8 : 8, c = ph === 0 ? '#ff2e4d' : '#2e7bff';
      const rg = ctx.createRadialGradient(cx, -53, 2, cx, -53, 60);
      rg.addColorStop(0, rgba(c, 0.6)); rg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, -53, 60, 0, PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  // タイヤ
  ctx.beginPath(); ctx.arc(-46, -8, 16, PI, 0); ctx.arc(48, -8, 16, PI, 0); ctx.fillStyle = '#100c18'; ctx.fill();
  wheel(ctx, -46, -12, 12, rot, police ? '#c0c4d0' : '#d8dde8', police ? '#ffffff' : '#ff2e88');
  wheel(ctx, 48, -12, 12, rot, police ? '#c0c4d0' : '#d8dde8', police ? '#ffffff' : '#ff2e88');
  // 速度線
  const s = Math.abs(v.speed || v.vx || 0);
  if (s > 300) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, (s - 300) / 900)})`; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const y = -40 + i * 9; const o = ((t * 900 + i * 37) % 60); ctx.moveTo(-90 - o, y); ctx.lineTo(-120 - o, y); }
    ctx.stroke();
  }
}

function drawBike(ctx, v, t, rot) {
  const col = v.color || '#ff5fa2';
  underglow(ctx, 90, '#ff5fa2', t);
  // ホイール
  wheel(ctx, -30, -14, 14, rot, '#d8dde8', '#19f0ff');
  wheel(ctx, 32, -14, 14, rot, '#d8dde8', '#19f0ff');
  // フレーム
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6; ctx.beginPath();
  ctx.moveTo(-30, -14); ctx.lineTo(-8, -26); ctx.lineTo(14, -24); ctx.lineTo(32, -14);
  ctx.moveTo(22, -46); ctx.lineTo(32, -14); ctx.stroke();
  ctx.strokeStyle = '#8a8fa8'; ctx.lineWidth = 3; ctx.stroke();
  // 車体カウル
  ctx.beginPath(); ctx.moveTo(-18, -26); ctx.quadraticCurveTo(-6, -40, 12, -38); ctx.lineTo(28, -40); ctx.quadraticCurveTo(38, -34, 30, -24);
  ctx.lineTo(4, -20); ctx.lineTo(-14, -20); ctx.closePath();
  const g = ctx.createLinearGradient(0, -40, 0, -20); g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.3));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-10, -26); ctx.quadraticCurveTo(8, -33, 28, -31); ctx.stroke();
  // シート
  ctx.beginPath(); ctx.moveTo(-26, -30); ctx.quadraticCurveTo(-24, -36, -6, -36); ctx.lineTo(-4, -32); ctx.lineTo(-24, -27); ctx.closePath(); fs(ctx, '#2a2230', 1.6);
  // ハンドル
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(22, -46); ctx.lineTo(14, -48); ctx.stroke();
  ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 1.6; ctx.stroke();
  // エンジン・マフラー
  ctx.beginPath(); rr(ctx, -6, -24, 16, 9, 2); fs(ctx, '#5a5f7a', 1.4);
  ctx.beginPath(); rr(ctx, -40, -22, 26, 4.5, 2); fs(ctx, '#c0c4d0', 1.4);
  // ライト
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(34, -36, 3, 0, PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,46,77,0.9)'; ctx.fillRect(-29, -32, 3, 3);
  ctx.restore();
  if (v.driver) {
    const dl = driverLook(v);
    if (dl) drawCharacter(ctx, -6, -18, dl[0], dl[1], { facing: 1, state: 'drive', t, scale: 0.95 });
    else { ctx.fillStyle = 'rgba(20,10,30,0.7)'; ctx.beginPath(); ctx.arc(-6, -58, 9, 0, PI * 2); ctx.fill(); ctx.fillRect(-14, -50, 14, 16); }
  }
}

// ---------------------------------------------------------------- 差し替え画像
// 今のコードの絵のタイヤの位置・大きさ（足元中央が原点・右向き）。車体の絵はマゼンタの印がここに来るように縮めて置く
export const VEHICLE_GEO = {
  bike: { rear: [-30, -14], front: [32, -14], wheelR: 14 },
  sports: { rear: [-46, -12], front: [48, -12], wheelR: 13 },
  police: { rear: [-46, -12], front: [48, -12], wheelR: 13 },
};
function drawArtVehicle(ctx, v, kind, t, rot) {
  const geo = VEHICLE_GEO[kind] || VEHICLE_GEO.sports;
  const A = vehicleArt(kind, geo, v.color);
  if (!A) return false;
  const sp = Math.abs(v.speed || v.vx || 0);
  const bounce = kind !== 'bike' && sp > 30 ? Math.sin(t * 30) * 0.6 : 0;
  const glow = kind === 'police' ? '#2e7bff' : kind === 'bike' ? '#ff5fa2' : (v.glow || '#19f0ff');
  underglow(ctx, kind === 'bike' ? 90 : 150, glow, t);
  const dl = v.driver ? driverLook(v) : null;
  // 車: 運転手を車体の後ろに（窓から見える）。バイク: 車体の上に
  if (v.driver && kind !== 'bike') {
    if (dl) drawCharacter(ctx, -8, -2 + bounce, dl[0], dl[1], { facing: 1, state: 'drive', t, scale: 0.85 });
    else driverHead(ctx, -4, -36 + bounce, v.driverType === 'cop' || kind === 'police');
  }
  ctx.drawImage(A.body, A.bx, A.by + bounce, A.bw, A.bh);
  for (const [wx, wy] of [geo.rear, geo.front]) {
    if (A.wheel) {
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(rot);
      ctx.drawImage(A.wheel, -A.wr, -A.wr, A.wr * 2, A.wr * 2);
      ctx.restore();
    } else wheel(ctx, wx, wy, A.wr * 0.86, rot);
  }
  if (v.driver && kind === 'bike') {
    if (dl) drawCharacter(ctx, -6, -18, dl[0], dl[1], { facing: 1, state: 'drive', t, scale: 0.95 });
    else { ctx.fillStyle = 'rgba(20,10,30,0.7)'; ctx.beginPath(); ctx.arc(-6, -58, 9, 0, PI * 2); ctx.fill(); ctx.fillRect(-14, -50, 14, 16); }
  }
  // パトカーの回転灯の光（絵の回転灯の上に、点滅する光だけ足す）
  if (kind === 'police' && v.siren !== false) {
    const ph = ((t * 6) | 0) % 2, cx = ph === 0 ? -8 : 8, c = ph === 0 ? '#ff2e4d' : '#2e7bff';
    const top = A.top + 4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(cx, top, 2, cx, top, 60);
    rg.addColorStop(0, rgba(c, 0.55)); rg.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, top, 60, 0, PI * 2); ctx.fill();
    ctx.restore();
  }
  return true;
}
