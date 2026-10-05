// HUD v3: 転職の吹き出し / クエストナビ矢印 / 転職完了の祝福演出 / トラッカーのクリック
import { COL, FONT, font, txt, rrPath, rgba, clamp, ease, starPath, measure, RAINBOW } from './theme.js';
import { guard, drawChar, equipLooks, mapInfo, skillDef, drawSkillIco } from './deps.js';
import * as SpriteM from '../render/sprites.js';
import { jobOffer, trackedGuide, trackedMissionId, charLook, charName, JOBS } from './v3deps.js';

const W = 1280, H = 720;

function mouseFree(game, r) {
  const ui = game.ui, m = game.input?.mouse;
  if (!ui || !m || ui.drag || ui.dnd?.active) return false;
  return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h && !ui.winAt(m.x, m.y);
}
function camOf(game) { return { x: Math.round(game.cam?.x || 0), y: Math.round(game.cam?.y || 0) }; }

/** ミッション窓を開いて詳細を表示 */
export function openMissionDetail(ui, id) {
  if (!ui) return;
  ui.open('missions');
  const w = ui.wins.missions;
  if (!w) return;
  const act = ui.game.state?.missions?.active || [];
  w.tab = act.includes(id) ? 0 : w.tab;
  w.sel = id; w.page = 0;
}

// ---------------- 転職の吹き出し ----------------
export function drawJobBubble(ctx, game) {
  const st = game.state, p = game.player;
  if (!st || !p || p.dead || game.ui?.isOpen?.('worldmap')) return;
  const offer = jobOffer(st);
  if (!offer || offer.active) return;
  const t = game.time || 0;
  const cam = camOf(game);
  const ph = (p.h || 80);
  const bob = Math.sin(t * 4.2) * 5;
  const label = `⬆ ${offer.tier}次転職できる！`;
  const bw = Math.max(176, measure(ctx, label, 17) + 40), bh = 46;
  let cx = p.x - cam.x, by = p.y - cam.y - ph - 74 + bob;
  // 近くの NPC の「V で話す」・名前と重ならないよう、会話できる時は少し上へ
  if (guard('nearestNpc', () => p.nearestNpc?.(), null)) by -= 44;
  cx = clamp(cx, bw / 2 + 8, W - bw / 2 - 8);
  by = clamp(by, 170, H - 200);
  const r = { x: cx - bw / 2, y: by, w: bw, h: bh };
  const hov = mouseFree(game, { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 30 });
  const s = hov ? 1.08 : 1 + Math.sin(t * 6) * 0.025;
  const col = '#ffd23f';
  ctx.save();
  ctx.translate(cx, by + bh / 2); ctx.scale(s, s); ctx.translate(-cx, -(by + bh / 2));
  // 後光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gg = ctx.createRadialGradient(cx, by + bh / 2, 6, cx, by + bh / 2, bw * 0.8);
  gg.addColorStop(0, `rgba(255,220,90,${0.35 + 0.15 * Math.sin(t * 5)})`); gg.addColorStop(1, 'rgba(255,120,200,0)');
  ctx.fillStyle = gg; ctx.fillRect(cx - bw, by - bh, bw * 2, bh * 3);
  ctx.restore();
  // 本体＋しっぽ
  ctx.beginPath();
  const rr = 16, x = r.x, y = r.y, w = r.w, h = r.h;
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.lineTo(cx + 10, y + h); ctx.lineTo(cx, y + h + 14); ctx.lineTo(cx - 10, y + h);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#fff7c2'); bg.addColorStop(0.45, col); bg.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = bg;
  ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 18 + 10 * Math.sin(t * 5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#a0461a'; ctx.stroke();
  // ツヤ
  ctx.save(); ctx.clip();
  const sx = x + ((t * 160) % (w + 120)) - 60;
  const sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 30, y, 60, h);
  ctx.restore();
  ctx.restore();
  txt(ctx, label, cx, by + bh / 2 - 4, { size: 17, align: 'center', color: '#5a1a00', stroke: '#fff8d0', sw: 4, weight: 900 });
  txt(ctx, hov ? 'クリックして職業を選ぶ' : 'クリック / タップ', cx, by + bh / 2 + 13, { size: 10.5, align: 'center', color: '#7a3000', stroke: false, weight: 800 });
  // キラキラ
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const a = t * 1.6 + i * (Math.PI * 2 / 6);
    const px = cx + Math.cos(a) * (bw * 0.58), py = by + bh / 2 + Math.sin(a) * (bh * 0.9);
    const k = 0.5 + 0.5 * Math.sin(t * 7 + i * 1.7);
    ctx.fillStyle = i % 2 ? '#fff' : '#ffe14d';
    starPath(ctx, px, py, 3 + 4 * k, 1.2 + k, 4, 0); ctx.fill();
  }
  ctx.restore();
  game.ui?.hudHit?.('jobBubble', { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 26 }, { onClick: () => game.ui.open('jobOffer') });
}

// ---------------- ナビ矢印 ----------------
let navCache = { t: -9, v: null };
function navTarget(game) {
  const now = game.time || 0;
  if (now - navCache.t < 0.25 && navCache.map === game.map?.id) return navCache.v;
  const g = guard('trackedGuide', () => trackedGuide(game), null);
  let v = null;
  const cur = game.state?.mapId || game.map?.id;
  if (g) {
    const destMap = g.mapId || g.npcMapId;
    if (destMap && destMap !== cur && g.nextPortal) {
      const to = g.nextPortal.to;
      v = { x: g.nextPortal.x, y: (g.nextPortal.y ?? game.map?.groundY ?? 0) - 50, label: (() => { const l = g.nextPortal.label || mapInfo(to).name; return /(へ|戻る)$/.test(l) ? l : `${l} へ`; })(), sub: destMap !== to ? `目的地: ${g.mapName || mapInfo(destMap).name}` : (g.text || ''), kind: 'portal', col: '#7fe9ff' };
    } else if (!destMap || destMap === cur) {
      if (g.npcId) {
        const n = (game.npcs || []).find((e) => e.id === g.npcId || e.data?.id === g.npcId || e.def?.id === g.npcId);
        if (n) v = { x: n.x, y: (n.y ?? 0) - 100, label: g.npcName || n.name || '', sub: g.text || '', kind: 'npc', col: '#ffd23f', ref: n };
      }
      if (!v && (g.targetId || g.targetName) && g.type !== 'collect') {
        let best = null, bd = 1e9;
        const p = game.player;
        for (const e of game.enemies || []) {
          if (!e || e.dead || e.remove) continue;
          const id = e.def?.id || e.defId;
          if (!(id === g.targetId || (g.targetName && e.def?.name === g.targetName))) continue;
          const d = Math.abs(e.x - (p?.x || 0));
          if (d < bd) { bd = d; best = e; }
        }
        if (best) v = { x: best.x, y: best.y - (best.h || 50) - 30, label: g.targetName || best.def?.name || '', sub: g.text || '', kind: 'enemy', col: '#ff6a8a', ref: best };
      }
    }
    if (v) v.missionId = g.missionId || trackedMissionId(game);
  }
  navCache = { t: now, v, map: game.map?.id };
  return v;
}
export function drawNavArrow(ctx, game) {
  if (!game.state || !game.player || game.ui?.isOpen?.('worldmap')) return;
  if (game.settings?.nav === false) return;
  const v = navTarget(game);
  if (!v) return;
  if (v.ref) { v.x = v.ref.x; v.y = v.ref.y - (v.kind === 'npc' ? 100 : (v.ref.h || 50) + 30); }
  const t = game.time || 0;
  const cam = camOf(game);
  const sx = v.x - cam.x, sy = v.y - cam.y;
  const on = sx > 30 && sx < W - 30 && sy > 40 && sy < H - 150;
  const p = game.player;
  const dist = Math.round(Math.abs(v.x - p.x) / 10);
  let ax, ay, ang;
  if (on) {
    ax = sx; ay = sy - 18 + Math.sin(t * 5) * 6; ang = Math.PI / 2;
  } else {
    const ox = p.x - cam.x, oy = p.y - cam.y - 50;
    ang = Math.atan2(sy - oy, sx - ox);
    // 画面端の枠（HUD を避ける）にクランプ
    const L = 46, R = W - 46, T = 190, B = H - 170;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let k = 1e9;
    if (dx > 0) k = Math.min(k, (R - ox) / dx); if (dx < 0) k = Math.min(k, (L - ox) / dx);
    if (dy > 0) k = Math.min(k, (B - oy) / dy); if (dy < 0) k = Math.min(k, (T - oy) / dy);
    ax = clamp(ox + dx * k, L, R); ay = clamp(oy + dy * k, T, B);
    const pulse = Math.sin(t * 6) * 5;
    ax -= dx * pulse; ay -= dy * pulse;
  }
  const col = v.col;
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(ang);
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(22, 0); ctx.lineTo(-6, -17); ctx.lineTo(-1, -6); ctx.lineTo(-18, -6); ctx.lineTo(-18, 6); ctx.lineTo(-1, 6); ctx.lineTo(-6, 17);
  ctx.closePath();
  const g = ctx.createLinearGradient(-18, 0, 22, 0);
  g.addColorStop(0, rgba(col, 0.6)); g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a0630'; ctx.stroke();
  ctx.restore();
  // ラベル
  const label = v.label + (on ? '' : `  ${dist}m`);
  const lw = Math.min(300, Math.max(measure(ctx, label, 13), v.sub ? measure(ctx, v.sub, 10.5) : 0) + 26);
  let lx = ax - lw / 2, ly = on ? ay - 58 : ay + (Math.sin(ang) > 0.5 ? -62 : 26);
  if (!on && Math.abs(Math.cos(ang)) > 0.7) { lx = Math.cos(ang) > 0 ? ax - lw - 30 : ax + 30; ly = ay - 20; }
  lx = clamp(lx, 8, W - lw - 8); ly = clamp(ly, 168, H - 160);
  const lh = v.sub ? 38 : 24;
  const lr = { x: lx, y: ly, w: lw, h: lh };
  const hov = mouseFree(game, lr);
  ctx.save();
  rrPath(ctx, lx, ly, lw, lh, 11);
  ctx.fillStyle = hov ? 'rgba(40,20,90,0.95)' : 'rgba(10,4,30,0.8)'; ctx.fill();
  ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
  txt(ctx, (v.kind === 'portal' ? '🌀 ' : v.kind === 'npc' ? '💬 ' : '⚔ ') + label, lx + lw / 2, ly + 12.5, { size: 13, align: 'center', color: '#fff', sw: 3, maxW: lw - 12 });
  if (v.sub) txt(ctx, v.sub, lx + lw / 2, ly + 28, { size: 10.5, align: 'center', color: col, sw: 2.5, maxW: lw - 12 });
  if (v.missionId) game.ui?.hudHit?.('nav', lr, { onClick: () => openMissionDetail(game.ui, v.missionId) });
}

// ---------------- トラッカーのクリック ----------------
export function trackerHit(ctx, game, m, r) {
  if (!m?.id) return;
  const hov = mouseFree(game, r);
  if (hov) {
    ctx.save();
    rrPath(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(127,233,255,0.7)'; ctx.stroke();
    ctx.restore();
  }
  game.ui?.hudHit?.('track:' + m.id, r, { onClick: () => openMissionDetail(game.ui, m.id) });
}

// ---------------- 転職完了の祝福演出 ----------------
export function drawJobFx(ctx, game) {
  const fx = game.ui?.jobFx;
  if (!fx || game.ui?.petFx) return;
  const t = fx.t, life = fx.life || 5, time = game.time || 0;
  const a = clamp(t / 0.25, 0, 1) * (1 - clamp((t - life + 0.7) / 0.7, 0, 1));
  if (a <= 0) return;
  const job = fx.job || {};
  const col = job.aura || COL.gold;
  const st = game.state;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(6,2,22,0.55)'; ctx.fillRect(0, 0, W, H);
  if (t < 0.3) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / 0.3)})`; ctx.fillRect(0, 0, W, H); }
  // 放射光
  ctx.save();
  ctx.translate(W / 2, 330); ctx.rotate(time * 0.3);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    ctx.rotate(Math.PI * 2 / 18);
    const g = ctx.createLinearGradient(0, 0, 700, 0);
    g.addColorStop(0, rgba(i % 2 ? col : '#ffd23f', 0.45)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(700, -34); ctx.lineTo(700, 34); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // キャラ＋オーラ
  const pop = t < 0.5 ? ease(t / 0.5) : 1;
  const cx = W / 2, cy = 420;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ag = ctx.createRadialGradient(cx, cy - 100, 10, cx, cy - 100, 200);
  ag.addColorStop(0, rgba(col, 0.6)); ag.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = ag; ctx.beginPath(); ctx.ellipse(cx, cy - 100, 150, 210, 0, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const rr = (t * 180 + k * 90) % 270;
    ctx.strokeStyle = rgba(col, 0.8 * (1 - rr / 270)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, 40 + rr, 10 + rr * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // 立ち絵（manifest portraits）があれば笑顔の立ち絵を左に並べる（中央のキャラ・文字・スキル欄と重ならない位置）
  const lk = charLook(st) || {};
  const pc = lk.classId || st?.heroId, pg = lk.gender || st?.gender;
  if (pc && pg) {
    const sl = (1 - pop) * -120;
    guard('jobPortrait', () => SpriteM.drawPortrait?.(ctx, pc + '_' + pg, 'smile', 250 + sl, H - 84, 420, { maxW: 330, alpha: pop }));
  }
  drawChar(ctx, cx, cy, lk, equipLooks(st), { facing: 1, state: 'idle', t: time, attackT: 0, damage: 0, scale: 2.6 * pop, aura: col, headExpr: 'happy' });
  // 文字
  ctx.save();
  const sc = t < 0.4 ? 0.3 + ease(t / 0.4) * 0.9 : 1.2 - Math.min(0.2, (t - 0.4) * 0.5);
  ctx.translate(W / 2, 120); ctx.scale(sc, sc);
  ctx.font = `italic 900 70px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 13; ctx.strokeStyle = '#1a0630'; ctx.strokeText('JOB ADVANCE!', 0, 0);
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText('JOB ADVANCE!', 0, 0);
  const tg = ctx.createLinearGradient(0, -34, 0, 34);
  tg.addColorStop(0, '#fff7b0'); tg.addColorStop(0.5, COL.gold); tg.addColorStop(1, col);
  ctx.fillStyle = tg; ctx.shadowColor = col; ctx.shadowBlur = 26;
  ctx.fillText('JOB ADVANCE!', 0, 0);
  ctx.restore();
  const by = 196;
  const bw = 640;
  const bg = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0);
  bg.addColorStop(0, 'rgba(20,6,50,0)'); bg.addColorStop(0.2, 'rgba(20,6,50,0.9)'); bg.addColorStop(0.8, 'rgba(20,6,50,0.9)'); bg.addColorStop(1, 'rgba(20,6,50,0)');
  ctx.fillStyle = bg; ctx.fillRect(W / 2 - bw / 2, by - 30, bw, 76);
  ctx.fillStyle = col; ctx.fillRect(W / 2 - bw / 2 + 60, by - 30, bw - 120, 3); ctx.fillRect(W / 2 - bw / 2 + 60, by + 43, bw - 120, 3);
  ctx.restore();
  txt(ctx, `${fx.tier || job.tier || ''}次転職 完了  —  ${charName(st)}`, W / 2, by - 12, { size: 14, align: 'center', color: '#ffe3f7', alpha: a, sw: 3 });
  txt(ctx, job.name || '', W / 2, by + 16, { size: 32, align: 'center', color: '#fff', glow: col, glowBlur: 20, alpha: a, sw: 6 });
  // 新スキル
  const sks = (job.skills || []).map((id) => skillDef(id)).filter(Boolean);
  const sy = 470;
  if (sks.length) {
    txt(ctx, '新スキル習得！', W / 2, sy, { size: 15, align: 'center', color: COL.gold, alpha: a, sw: 3 });
    const gap = 150, x0 = W / 2 - (sks.length - 1) * gap / 2;
    sks.forEach((sk, i) => {
      const k = clamp((t - 0.6 - i * 0.18) / 0.3, 0, 1);
      if (k <= 0) return;
      ctx.save(); ctx.globalAlpha = a * k;
      const x = x0 + i * gap, y = sy + 44 - (1 - k) * 20;
      ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,4,30,0.8)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = sk.color || col; ctx.shadowColor = sk.color || col; ctx.shadowBlur = 12; ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a * k; drawSkillIco(ctx, sk, x, y, 40); ctx.restore();
      txt(ctx, sk.name, x, y + 42, { size: 12.5, align: 'center', color: '#fff', alpha: a * k, sw: 3, maxW: gap - 8 });
    });
  }
  txt(ctx, `HUD の職名が「${job.title || job.name || ''}」に！  スキル窓 [K] で新スキルを強化しよう`, W / 2, H - 150, { size: 13.5, align: 'center', color: '#ffe3f7', alpha: a * (0.6 + 0.4 * Math.sin(time * 4)), sw: 3 });
  // 紙吹雪
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < 60; i++) {
    const seed = i * 71.3;
    const px = (Math.sin(seed) * 0.5 + 0.5) * W + Math.sin(time * 2 + i) * 18;
    const py = ((seed * 5.3 + t * (110 + (i % 6) * 35)) % (H + 40)) - 20;
    ctx.save(); ctx.translate(px, py); ctx.rotate(time * 3 + i);
    ctx.fillStyle = i % 3 === 0 ? col : RAINBOW[i % RAINBOW.length];
    if (i % 4 === 0) { starPath(ctx, 0, 0, 7, 3, 5); ctx.fill(); } else ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
  ctx.restore();
  // クリックで閉じる
  game.ui?.hudHit?.('jobFx', { x: 0, y: 0, w: W, h: H }, { onClick: () => { if (game.ui.jobFx && game.ui.jobFx.t > 1) game.ui.jobFx.t = Math.max(game.ui.jobFx.t, life - 0.7); } });
  void font; void JOBS;
}
