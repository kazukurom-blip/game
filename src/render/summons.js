// 召喚獣の描画（コード描画・ネオン調）。systems/summons.js の Summon.draw とスキル窓のプレビュー（ui/v3windows.js）から呼ぶ
//  drawSummon(ctx, type, x, y, o)  … (x, y) は浮かぶものは体の中心、砲台（turret）は足元
//   o = { t, color, facing, count, fx:[{kind, x1, y1, x2, y2, t, life, w?, h?}], spawnK: 0..1（出現演出）, fade: 0..1, scale }
//  type: sprite（データ精霊）| familiar（グリッチ・キャット）| daemon（ファントム・デーモン）| oracle（オラクル・アイ）
//        drone（アタック・ドローン）| turret（セントリー・タレット）| bomber（ボマー・ドローン）| squadron（ドローン編隊）
import { rgba, shade } from './util.js';

const PI = Math.PI, TAU = PI * 2;
const OUT = '#14062a';

export const SUMMON_TYPES = ['sprite', 'familiar', 'daemon', 'oracle', 'drone', 'turret', 'bomber', 'squadron'];

function glow(ctx, x, y, r, col, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

export function drawSummon(ctx, type, x, y, o = {}) {
  const t = o.t || 0, col = o.color || '#3dff8a', f = o.facing || 1;
  const sk = o.spawnK == null ? 1 : Math.max(0, Math.min(1, o.spawnK));
  const sc = (o.scale || 1) * (0.4 + 0.6 * easeOut(sk));
  ctx.save();
  ctx.globalAlpha *= (o.fade == null ? 1 : o.fade) * (0.3 + 0.7 * sk);
  // 攻撃の線（体の後ろ）
  if (o.fx && o.fx.length) drawAttackFx(ctx, o.fx, col);
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  (BODY[type] || BODY.drone)(ctx, t, col, f, o);
  ctx.restore();
  // 出現の光の輪
  if (sk < 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 1 - sk); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y + (type === 'turret' ? 0 : 26), 20 + sk * 40, 6 + sk * 10, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
const easeOut = (k) => 1 - (1 - k) * (1 - k);

const BODY = {
  // データ精霊: 光の核のまわりを 0/1 の文字が回る。しっぽは炎のように揺れる
  sprite(ctx, t, col, f) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, 34, col, 0.55);
    // しっぽ
    ctx.fillStyle = rgba(col, 0.55);
    ctx.beginPath(); ctx.moveTo(-f * 6, -10);
    ctx.quadraticCurveTo(-f * 26, -4 + Math.sin(t * 8) * 6, -f * 34, 10 + Math.sin(t * 6) * 4);
    ctx.quadraticCurveTo(-f * 18, 8, -f * 4, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
    const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, shade(col, 0.4)); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    // 目
    ctx.fillStyle = OUT;
    const blink = (t % 3.2) < 0.12 ? 0.2 : 1;
    ctx.beginPath(); ctx.ellipse(f * 3, -2, 2, 3.4 * blink, 0, 0, TAU); ctx.ellipse(f * 9, -2, 2, 3.4 * blink, 0, 0, TAU); ctx.fill();
    // 回る文字
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.font = '900 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 6; i++) {
      const a = t * 2.4 + (i / 6) * TAU;
      ctx.fillStyle = rgba(i % 2 ? '#ffffff' : col, 0.85);
      ctx.fillText((i + Math.floor(t * 4)) % 2 ? '1' : '0', Math.cos(a) * 24, Math.sin(a) * 9 + 2);
    }
    ctx.restore();
  },

  // グリッチ・キャット: 宙に浮かぶ猫の頭。RGB にずれた輪郭がチラつく
  familiar(ctx, t, col, f) {
    const jit = (Math.floor(t * 12) % 7 === 0) ? 3 : 0;
    const head = (c) => {
      ctx.beginPath();
      ctx.moveTo(-16, -2); ctx.lineTo(-15, -20); ctx.lineTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(15, -20); ctx.lineTo(16, -2);
      ctx.quadraticCurveTo(16, 14, 0, 15); ctx.quadraticCurveTo(-16, 14, -16, -2); ctx.closePath();
      if (c) { ctx.strokeStyle = c; ctx.stroke(); }
    };
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, 32, col, 0.45);
    ctx.lineWidth = 2;
    ctx.save(); ctx.translate(-2 - jit, 0); head('rgba(255,40,120,0.8)'); ctx.restore();
    ctx.save(); ctx.translate(2 + jit, 0); head('rgba(40,200,255,0.8)'); ctx.restore();
    ctx.restore();
    head(); ctx.fillStyle = '#1a0f33'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.stroke();
    // 回路の模様
    ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-10, -4); ctx.lineTo(-4, -4); ctx.moveTo(10, -9); ctx.lineTo(10, -4); ctx.lineTo(4, -4); ctx.stroke();
    // 目（向いている方へ寄る）
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(-6 + f * 1.5, 2, 3.4, 2.4 + Math.abs(Math.sin(t * 1.3)) * 1.2, 0, 0, TAU); ctx.ellipse(6 + f * 1.5, 2, 3.4, 2.4 + Math.abs(Math.sin(t * 1.3)) * 1.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ff6fb5'; ctx.beginPath(); ctx.moveTo(-2, 8); ctx.lineTo(2, 8); ctx.lineTo(0, 10.5); ctx.closePath(); ctx.fill();
    // ノイズの帯
    if (jit) { ctx.fillStyle = rgba(col, 0.7); ctx.fillRect(-20, -6 + (t * 97 % 14), 40, 2); }
  },

  // ファントム・デーモン: フードをかぶった電子の幽霊。裾が波打ち、角と目が光る
  daemon(ctx, t, col, f) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, 42, col, 0.4); ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-18, 2); ctx.quadraticCurveTo(-20, -26, 0, -28); ctx.quadraticCurveTo(20, -26, 18, 2);
    for (let i = 0; i <= 6; i++) { const xx = 18 - i * 6; ctx.lineTo(xx, 22 + Math.sin(t * 7 + i * 1.3) * 4 + (i % 2 ? 5 : 0)); }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -28, 0, 26);
    g.addColorStop(0, '#2b1450'); g.addColorStop(0.7, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0.05));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.stroke();
    // 角
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(-19, -34); ctx.lineTo(-7, -25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, -20); ctx.lineTo(19, -34); ctx.lineTo(7, -25); ctx.closePath(); ctx.fill();
    // 顔の闇と目
    ctx.fillStyle = '#05010d'; ctx.beginPath(); ctx.ellipse(f * 2, -10, 11, 9, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(f * 2 - 8, -13); ctx.lineTo(f * 2 - 2, -10); ctx.lineTo(f * 2 - 8, -9); ctx.closePath();
    ctx.moveTo(f * 2 + 8, -13); ctx.lineTo(f * 2 + 2, -10); ctx.lineTo(f * 2 + 8, -9); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 走査線
    ctx.fillStyle = rgba('#ffffff', 0.12);
    for (let i = 0; i < 5; i++) ctx.fillRect(-16, -18 + ((i * 9 + t * 30) % 40), 32, 1.5);
  },

  // オラクル・アイ: 回る六角形の輪の中に大きな目。瞳は向いている方を見る
  oracle(ctx, t, col, f) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, 56, col, 0.45);
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2;
    for (let r = 0; r < 2; r++) {
      ctx.save(); ctx.rotate((r ? -1 : 1) * t * 0.8);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU, rr = r ? 40 : 32; if (!i) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + PI / 6; ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.fillRect(Math.cos(a) * (r ? 40 : 32) - 2, Math.sin(a) * (r ? 40 : 32) - 2, 4, 4); }
      ctx.restore();
    }
    ctx.restore();
    // 目
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.quadraticCurveTo(0, -20, 24, 0); ctx.quadraticCurveTo(0, 20, -24, 0); ctx.closePath();
    ctx.fillStyle = '#f4fff0'; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save(); ctx.clip();
    const ix = f * 5 + Math.sin(t * 0.9) * 3;
    const ig = ctx.createRadialGradient(ix, 0, 1, ix, 0, 11);
    ig.addColorStop(0, '#ffffff'); ig.addColorStop(0.3, col); ig.addColorStop(1, shade(col, -0.5));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(ix, 0, 3, 6, 0, 0, TAU); ctx.fill();
    // まばたき
    const bl = (t % 4) < 0.15 ? 1 : 0;
    if (bl) { ctx.fillStyle = shade(col, -0.6); ctx.fillRect(-26, -22, 52, 44); }
    ctx.restore();
  },

  // アタック・ドローン: 丸い胴体・左右のローター・赤い目・下に光
  drone(ctx, t, col, f) {
    drawDrone(ctx, t, col, f, 1);
  },

  // セントリー・タレット: 三脚の上で砲塔が敵へ向く（足元が (0,0)）
  turret(ctx, t, col, f) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.55 + 0.25 * Math.sin(t * 4)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -2, 30, 7, 0, 0, TAU); ctx.stroke();
    glow(ctx, 0, -34, 30, col, 0.3);
    ctx.restore();
    // 三脚
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-18, 0); ctx.moveTo(0, -22); ctx.lineTo(18, 0); ctx.moveTo(0, -22); ctx.lineTo(0, -2); ctx.stroke();
    ctx.strokeStyle = '#5a6b8a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-18, 0); ctx.moveTo(0, -22); ctx.lineTo(18, 0); ctx.moveTo(0, -22); ctx.lineTo(0, -2); ctx.stroke();
    // 砲塔
    ctx.save(); ctx.translate(0, -32); ctx.scale(f, 1);
    ctx.fillStyle = '#2a3150'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-14, -10, 26, 18, 6) : ctx.rect(-14, -10, 26, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a4468'; ctx.fillRect(10, -5, 22, 5); ctx.fillRect(10, 1, 22, 4); ctx.strokeRect(10, -5, 22, 10);
    ctx.fillStyle = col; ctx.fillRect(-10, -6, 12, 3); // 光る帯
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ff3d5a'; ctx.shadowColor = '#ff3d5a'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(4, 1, 2.6, 0, TAU); ctx.fill(); ctx.restore();
    ctx.restore();
  },

  // ボマー・ドローン: 横に広い機体に4枚のローター、腹に爆弾
  bomber(ctx, t, col, f) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 8, 40, col, 0.35); ctx.restore();
    for (const rx of [-26, -12, 12, 26]) rotor(ctx, rx, -10, 9, t * 40 + rx, col);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(26, -8); ctx.stroke();
    ctx.fillStyle = '#2a2140'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-16, -2, 32, 3);
    // 爆弾
    ctx.fillStyle = '#ff5a1f'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
    for (const bx of [-9, 0, 9]) { ctx.beginPath(); ctx.ellipse(bx, 12, 3.6, 5, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(f * 18, 0, 2.5, 0, TAU); ctx.fill(); ctx.restore();
  },

  // ドローン編隊: 小さなドローンが輪になって回る
  squadron(ctx, t, col, f, o) {
    const n = Math.max(1, o.count || 4);
    const items = [];
    for (let i = 0; i < n; i++) {
      const a = t * 2.2 + (i / n) * TAU;
      items.push({ x: Math.cos(a) * 38, y: Math.sin(a) * 14, z: Math.sin(a) });
    }
    items.sort((a, b) => a.z - b.z);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 38, 14, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    for (const it of items) { ctx.save(); ctx.translate(it.x, it.y); ctx.scale(0.78 + it.z * 0.1, 0.78 + it.z * 0.1); drawDrone(ctx, t, col, f, 0.9); ctx.restore(); }
  },
};

function rotor(ctx, x, y, r, a, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = rgba('#ffffff', 0.18); ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.28, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.6;
  const k = Math.cos(a);
  ctx.beginPath(); ctx.moveTo(-r * k, 0); ctx.lineTo(r * k, 0); ctx.stroke();
  ctx.restore();
}

function drawDrone(ctx, t, col, f, s) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(0, 6, 0, 34);
  lg.addColorStop(0, rgba(col, 0.45)); lg.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(8, 8); ctx.lineTo(16, 34); ctx.lineTo(-16, 34); ctx.closePath(); ctx.fill();
  ctx.restore();
  // アーム＋ローター
  ctx.strokeStyle = OUT; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(20, -8); ctx.stroke();
  ctx.strokeStyle = '#5a6b8a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(20, -8); ctx.stroke();
  rotor(ctx, -20, -10, 10, t * 45, col); rotor(ctx, 20, -10, 10, t * 45 + 1, col);
  // 胴体
  const g = ctx.createLinearGradient(0, -10, 0, 10);
  g.addColorStop(0, '#4a5478'); g.addColorStop(1, '#1d2238');
  ctx.fillStyle = g; ctx.strokeStyle = OUT; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(-9, 4, 18, 2.2);
  // 目（カメラ）
  ctx.fillStyle = '#0b0618'; ctx.beginPath(); ctx.arc(f * 5, -1, 5, 0, TAU); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ff3d5a'; ctx.shadowColor = '#ff3d5a'; ctx.shadowBlur = 8 * s;
  ctx.beginPath(); ctx.arc(f * 6, -1, 2.4, 0, TAU); ctx.fill(); ctx.restore();
}

/** 攻撃の線: zap（ギザギザの電撃）/ beam（太い光線）/ pulse（広がる波動）/ bomb（落ちていく爆弾の軌跡） */
export function drawAttackFx(ctx, list, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const e of list) {
    const k = Math.max(0, Math.min(1, e.t / (e.life || 0.3)));
    const a = 1 - k;
    if (e.kind === 'zap') {
      const n = 7, seed = (e.seed || 0) + Math.floor(e.t * 40);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const q = i / n, j = i && i < n ? (Math.sin(seed * 12.9 + i * 78.2) * 43758.5 % 1) * 18 : 0;
        pts.push([e.x1 + (e.x2 - e.x1) * q, e.y1 + (e.y2 - e.y1) * q + j]);
      }
      for (const [w, c] of [[7, rgba(col, 0.35 * a)], [3, rgba('#ffffff', 0.9 * a)]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    } else if (e.kind === 'beam') {
      const w = 16 * (1 - k * 0.7);
      ctx.strokeStyle = rgba(col, 0.45 * a); ctx.lineWidth = w + 10; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.95 * a); ctx.lineWidth = w * 0.45; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else if (e.kind === 'pulse') {
      const rw = (e.w || 400) / 2 * (0.25 + 0.75 * k), rh = (e.h || 240) / 2 * (0.25 + 0.75 * k);
      ctx.strokeStyle = rgba(col, 0.9 * a); ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.ellipse(e.x1, e.y1, rw, rh * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(col, 0.15 * a); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.6 * a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x2, e.y2); ctx.lineTo(e.x1, e.y1); ctx.stroke();
    } else if (e.kind === 'bomb') {
      const q = Math.min(1, k * 1.6);
      const bx = e.x1 + (e.x2 - e.x1) * q, by = e.y1 + (e.y2 - e.y1) * q;
      ctx.strokeStyle = rgba(col, 0.6 * a); ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba('#ffe14d', a); ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
