// v3 インスタンス背景: タワー（ヴァイス・スパイア内部）／アリーナ（ネオン・コロシアム）／ボス部屋（ボスごとの雰囲気）
// 判定: map.instance = 'tower'|'arena'|'boss'（または region/theme が同名）。
//  - tower: map.floor（無ければ map.towerFloor / id の数字）で 10階ごとに色が変わる。10の倍数階はボス階（赤い警告灯）
//  - boss : map.bossId / map.boss（敵ID）でモチーフを選ぶ。map.bossMode==='chaos' で赤黒く
// 静的部分は S.layer でキャッシュ、動く光だけライブ描画（軽量）。
import { shade, rgba, rng, hashStr, lerp, mix } from './util.js';
import { PI, LW, neonText } from './bgkit.js';

const TAU = PI * 2;
export const SPECIAL = { tower: 1, arena: 1, boss: 1 };

/** map → {kind, v} | null */
export function specialOf(map) {
  if (!map) return null;
  const k = SPECIAL[map.instance] ? map.instance : SPECIAL[map.region] ? map.region : (!map.region && SPECIAL[map.theme]) ? map.theme : null;
  if (!k) return null;
  if (k === 'tower') {
    const f = towerFloor(map);
    return { kind: k, v: Math.floor((Math.max(1, f) - 1) / 10) % TOWER_PAL.length, floor: f };
  }
  if (k === 'boss') return { kind: k, v: BOSS_MOTIF_IDS.indexOf(bossMotif(map)), floor: 0 };
  return { kind: k, v: 0, floor: 0 };
}
function towerFloor(map) {
  const f = map.floor ?? map.towerFloor;
  if (f != null && !isNaN(f)) return f | 0;
  const m = /(\d+)/.exec(map.id || '');
  return m ? +m[1] : 1;
}

// ================================================================ タワー
const TOWER_PAL = [
  { bg: '#0d0826', wall: '#1d1442', mid: '#2a1d5a', a: '#ff2e88', b: '#19f0ff', name: 'NEON LOBBY' },        // 1-10
  { bg: '#061a26', wall: '#0e2c3e', mid: '#164058', a: '#19f0ff', b: '#7cff6a', name: 'CYAN DECK' },         // 11-20
  { bg: '#1a0a22', wall: '#2e1238', mid: '#45184e', a: '#b45cff', b: '#ff7ad9', name: 'VIOLET HALL' },       // 21-30
  { bg: '#1e0e06', wall: '#3a1e0e', mid: '#5a2e14', a: '#ffb000', b: '#ff5f3c', name: 'AMBER CORE' },        // 31-40
  { bg: '#04160c', wall: '#0a2a18', mid: '#124026', a: '#3dff8a', b: '#b6ff3d', name: 'MATRIX FLOOR' },      // 41-50
  { bg: '#1e0612', wall: '#38101e', mid: '#561830', a: '#ff3d5a', b: '#ffd23f', name: 'CRIMSON SPIRE' },     // 51-60
  { bg: '#0a0a1e', wall: '#16163a', mid: '#222258', a: '#ffffff', b: '#9ff6ff', name: 'WHITE NOISE' },      // 61-70
  { bg: '#140620', wall: '#24103a', mid: '#3a1a5a', a: '#ffd23f', b: '#ff2e88', name: 'GOLDEN APEX' },       // 71-80+
];
function bgTower(ctx, S, sp) {
  const { W, H, gS, time, cam } = S;
  const pal = TOWER_PAL[sp.v] || TOWER_PAL[0];
  const bossFloor = sp.floor % 10 === 0;
  S.indoor = true;
  // 背景（塔の吹き抜け）
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, shade(pal.bg, -0.3)); bg.addColorStop(0.6, pal.bg); bg.addColorStop(1, pal.wall);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 奥: 吹き抜けの内壁（縦ネオン管・窓のスリット）
  const far = S.layer('towerFar', 720, (P) => {
    const g = P.g, h = P.h, R = rng(hashStr('tower' + sp.v));
    for (let x = 0; x < LW; x += 128) {
      g.fillStyle = shade(pal.wall, -0.15); g.fillRect(x, 0, 128, h);
      g.fillStyle = pal.wall; g.fillRect(x + 8, 0, 112, h);
      // 窓スリット（遠い夜景）
      for (let y = 40; y < h - 60; y += 70) {
        g.fillStyle = '#05030e'; g.fillRect(x + 24, y, 80, 40);
        for (let i = 0; i < 6; i++) { P.gl.fillStyle = rgba(R() < 0.5 ? pal.a : pal.b, 0.35 + R() * 0.4); P.gl.fillRect(x + 26 + R() * 74, y + 20 + R() * 18, 2 + R() * 3, 2); }
      }
      // 縦ネオン管
      P.gl.fillStyle = rgba((x / 128) % 2 ? pal.a : pal.b, 0.9); P.gl.fillRect(x + 4, 0, 3, h);
      g.fillStyle = shade((x / 128) % 2 ? pal.a : pal.b, -0.2); g.fillRect(x + 4, 0, 3, h);
    }
  });
  S.tile(far, 0.12, gS + 120, pal.wall);
  // 中: 構造リング（環状の梁）と柱
  const mid = S.layer('towerMid', 640, (P) => {
    const g = P.g, h = P.h;
    for (let y = 60; y < h; y += 180) {
      g.fillStyle = pal.mid; g.fillRect(0, y, LW, 26);
      g.fillStyle = shade(pal.mid, 0.2); g.fillRect(0, y, LW, 4);
      P.gl.fillStyle = rgba(pal.a, 0.8); P.gl.fillRect(0, y + 22, LW, 2);
      for (let x = 20; x < LW; x += 64) { P.gl.fillStyle = rgba(pal.b, 0.9); P.gl.fillRect(x, y + 10, 10, 4); }
    }
    for (let x = 0; x < LW; x += 256) {
      g.fillStyle = shade(pal.mid, -0.2); g.fillRect(x + 100, 0, 56, h);
      g.fillStyle = shade(pal.mid, 0.1); g.fillRect(x + 100, 0, 8, h);
      // 柱のホロパネル
      for (let y = 120; y < h - 40; y += 180) { g.fillStyle = '#05030e'; g.fillRect(x + 110, y, 36, 50); P.gl.fillStyle = rgba(pal.b, 0.5); P.gl.fillRect(x + 113, y + 4, 30, 6); P.gl.fillRect(x + 113, y + 14, 18, 3); P.gl.fillRect(x + 113, y + 22, 24, 3); }
    }
  });
  S.tile(mid, 0.35, gS + 40, shade(pal.mid, -0.3));
  // 手前: エレベーターのレールとケーブル
  const near = S.layer('towerNear', 680, (P) => {
    const g = P.g, h = P.h;
    for (const x of [180, 700]) {
      g.fillStyle = '#0a0614'; g.fillRect(x, 0, 14, h); g.fillRect(x + 90, 0, 14, h);
      for (let y = 0; y < h; y += 40) { g.fillStyle = '#1a1228'; g.fillRect(x, y, 104, 4); }
      P.gl.fillStyle = rgba(pal.a, 0.6); P.gl.fillRect(x + 5, 0, 3, h); P.gl.fillRect(x + 95, 0, 3, h);
    }
  });
  S.tile(near, 0.6, gS + 10);
  // ライブ: 昇る光の粒・エレベーター・階数ホロ
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 上昇するデータの粒
    for (let i = 0; i < 26; i++) {
      const x = ((i * 157 - cam.x * 0.2) % (W + 40) + W + 40) % (W + 40) - 20;
      const y = H - ((time * (40 + (i % 5) * 18) + i * 97) % (H + 40));
      ctx.fillStyle = rgba(i % 2 ? pal.a : pal.b, 0.5);
      ctx.fillRect(x, y, 2, 6 + (i % 3) * 3);
    }
    // エレベーター（ゆっくり上下）
    for (let j = 0; j < 2; j++) {
      const base = [180, 700][j];
      const ex = ((base + 7 - cam.x * 0.6) % LW + LW) % LW;
      for (let x = ex - LW; x < W + 120; x += LW) {
        const ey = gS - 300 + Math.sin(time * 0.35 + j * 2) * 220;
        ctx.fillStyle = rgba(pal.b, 0.18); ctx.fillRect(x + 7, ey, 84, 70);
        ctx.strokeStyle = rgba(pal.b, 0.8); ctx.lineWidth = 2; ctx.strokeRect(x + 7, ey, 84, 70);
        ctx.fillStyle = rgba('#ffffff', 0.5); ctx.fillRect(x + 12, ey + 6, 74, 4);
      }
    }
    // 階数ホロ（中央・奥）
    const fl = 'F' + sp.floor;
    const hx = W * 0.5 - ((cam.x * 0.08) % 300), hy = Math.max(110, gS - 330);
    ctx.globalAlpha = 0.16 + Math.sin(time * 2) * 0.04;
    ctx.font = '900 150px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.a; ctx.fillText(fl, hx, hy);
    ctx.globalAlpha = 0.5;
    ctx.font = '900 20px "Arial Black", sans-serif'; ctx.fillStyle = pal.b;
    ctx.fillText('VICE SPIRE  ·  ' + pal.name, hx, hy + 92);
    // ボス階: 赤い警告灯
    if (bossFloor) {
      const a = 0.25 + 0.25 * Math.max(0, Math.sin(time * 5));
      ctx.globalAlpha = a; ctx.fillStyle = '#ff2040';
      for (let i = 0; i < 4; i++) { const x = ((i * 340 - cam.x * 0.35) % (W + 200) + W + 200) % (W + 200) - 100; ctx.beginPath(); ctx.arc(x, 40, 60, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 0.6 * a + 0.2; ctx.font = '900 22px "Arial Black", sans-serif'; ctx.fillStyle = '#ff5a6a';
      ctx.fillText('⚠ BOSS FLOOR ⚠', hx, hy - 96);
    }
    ctx.restore();
  });
}

// ================================================================ アリーナ
function bgArena(ctx, S) {
  const { W, H, gS, time, cam } = S;
  S.indoor = true;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05020e'); bg.addColorStop(0.5, '#140828'); bg.addColorStop(1, '#2a0e3e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 奥: 天井リングと巨大スクリーン
  const roof = S.layer('arenaRoof', 360, (P) => {
    const g = P.g, h = P.h;
    g.fillStyle = '#0c0618'; g.fillRect(0, 0, LW, h);
    for (let x = 0; x < LW; x += 64) { g.fillStyle = '#1a0e2e'; g.fillRect(x, 0, 6, h - 60); }
    g.fillStyle = '#1e1232'; g.fillRect(0, h - 70, LW, 30);
    for (let x = 16; x < LW; x += 48) { P.gl.fillStyle = x % 96 < 48 ? '#ff2e88' : '#19f0ff'; P.gl.fillRect(x, h - 58, 20, 5); }
    // 大型ビジョン
    g.fillStyle = '#05030a'; g.fillRect(352, 60, 320, 170);
    g.strokeStyle = '#3a2a5a'; g.lineWidth = 8; g.strokeRect(352, 60, 320, 170);
  });
  const roofB = Math.min(gS - 260, H * 0.42);
  S.tile(roof, 0.08, roofB);
  // 中: すり鉢状の観客席
  const stands = S.layer('arenaStands', 300, (P) => {
    const g = P.g, h = P.h, R = rng(77);
    for (let row = 0; row < 7; row++) {
      const y = 30 + row * 36;
      g.fillStyle = row % 2 ? '#24143a' : '#2c1846'; g.fillRect(0, y, LW, 36);
      g.fillStyle = '#3a2258'; g.fillRect(0, y, LW, 3);
      // 観客（頭のシルエット＋ペンライト）
      for (let x = 6; x < LW; x += 12 + R() * 6) {
        g.fillStyle = mix('#140a22', '#2a1840', R()); g.beginPath(); g.arc(x, y + 14, 5, 0, TAU); g.fill(); g.fillRect(x - 6, y + 18, 12, 18);
        if (R() < 0.18) { P.gl.fillStyle = ['#ff2e88', '#19f0ff', '#ffd23f', '#7cff6a', '#b45cff'][(R() * 5) | 0]; P.gl.fillRect(x - 1, y - 2, 3, 12); }
      }
    }
    g.fillStyle = '#120a20'; g.fillRect(0, h - 30, LW, 30);
  });
  S.tile(stands, 0.25, gS - 70, '#120a20');
  // 手前: アリーナの壁（LED帯）
  const wall = S.layer('arenaWall', 110, (P) => {
    const g = P.g, h = P.h;
    g.fillStyle = '#1a1028'; g.fillRect(0, 0, LW, h);
    g.fillStyle = '#05030a'; g.fillRect(0, 14, LW, 46);
    g.fillStyle = '#3a2a5a'; g.fillRect(0, 10, LW, 4); g.fillRect(0, 60, LW, 4);
    for (let x = 0; x < LW; x += 256) { g.fillStyle = '#2a1a40'; g.fillRect(x, 64, 18, h - 64); }
  });
  const wb = gS + 4;
  S.tile(wall, 0.5, wb, '#1a1028');
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 大型ビジョンの映像（WAVE 表示）
    const vx = ((352 - cam.x * 0.08) % LW + LW) % LW;
    for (let x = vx - LW; x < W; x += LW) {
      const vy = roofB - 360 + 60;
      ctx.fillStyle = rgba('#ff2e88', 0.25 + 0.1 * Math.sin(time * 3)); ctx.fillRect(x + 6, vy + 6, 308, 158);
      ctx.font = '900 46px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText('NEON ARENA', x + 160, vy + 66);
      ctx.font = '900 24px "Arial Black", sans-serif'; ctx.fillStyle = '#19f0ff';
      ctx.fillText(S.arenaWave ? 'WAVE ' + S.arenaWave : 'FIGHT!', x + 160, vy + 118);
    }
    // LED 帯のスクロール文字
    const ly = wb - 110 + 37;
    ctx.font = '900 26px "Arial Black", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const msg = '★ NEON ARENA ★ VICE BAY CHAMPIONSHIP ★ BEAT THE WAVE ★ ';
    const mw = 900;
    const off = -((time * 120 + cam.x * 0.5) % mw);
    ctx.fillStyle = rgba('#ffd23f', 0.85);
    for (let x = off; x < W; x += mw) ctx.fillText(msg, x, ly);
    // スポットライト
    for (let i = 0; i < 4; i++) {
      const bx = W * (0.15 + i * 0.24), by = roofB - 70;
      const a = PI / 2 + Math.sin(time * (0.5 + i * 0.13) + i * 1.7) * 0.5;
      const len = gS - by + 40;
      const col = ['#ff2e88', '#19f0ff', '#ffd23f', '#b45cff'][i];
      const g = ctx.createLinearGradient(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len);
      g.addColorStop(0, rgba(col, 0.32)); g.addColorStop(1, rgba(col, 0.04));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.09) * len, by + Math.sin(a - 0.09) * len); ctx.lineTo(bx + Math.cos(a + 0.09) * len, by + Math.sin(a + 0.09) * len); ctx.closePath(); ctx.fill();
    }
    // 観客席のフラッシュ
    for (let i = 0; i < 6; i++) {
      const ph = (time * 1.3 + i * 0.37) % 1;
      if (ph > 0.12) continue;
      const x = ((i * 233 + Math.floor(time * 1.3 + i * 0.37) * 97) % W), y = gS - 300 + ((i * 53) % 200);
      ctx.fillStyle = rgba('#ffffff', 1 - ph / 0.12); ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  });
}

// ================================================================ ボス部屋
const BOSS_MOTIF = {
  boss_king_slime: 'jelly', boss_rat_king: 'sewer', boss_captain: 'dock', boss_gator: 'temple',
  boss_mecha: 'vault', boss_don: 'penthouse', boss_alien: 'reactor',
};
const BOSS_MOTIF_IDS = ['jelly', 'sewer', 'dock', 'temple', 'vault', 'penthouse', 'reactor'];
const MOTIF = {
  jelly: { bg: ['#05222a', '#0c3a40', '#145a5a'], wall: '#0e3a40', a: '#5cff9a', b: '#ff7ad9', sigil: 'drop' },
  sewer: { bg: ['#0a120e', '#16241a', '#24341e'], wall: '#1e2a22', a: '#9aff3d', b: '#ffd23f', sigil: 'crown' },
  dock: { bg: ['#120a0c', '#241418', '#3a1e1e'], wall: '#2a1a1a', a: '#ff3d3d', b: '#ffb000', sigil: 'anchor' },
  temple: { bg: ['#06140a', '#10261a', '#1e3a22'], wall: '#1a3020', a: '#7cff6a', b: '#ff9a3c', sigil: 'eye' },
  vault: { bg: ['#140e04', '#2a1e0a', '#3e2c10'], wall: '#33260e', a: '#ffd23f', b: '#ff2e88', sigil: 'chip' },
  penthouse: { bg: ['#0a0614', '#1a0e26', '#2e1438'], wall: '#241430', a: '#ffd23f', b: '#ff3d5a', sigil: 'crown' },
  reactor: { bg: ['#06020e', '#140628', '#24083e'], wall: '#1a0a30', a: '#5cff9a', b: '#7a3dff', sigil: 'eye' },
};
function bossMotif(map) {
  const id = map.bossId || (typeof map.boss === 'string' ? map.boss : map.boss && map.boss.id) || map.bossRoom || '';
  if (BOSS_MOTIF[id]) return BOSS_MOTIF[id];
  if (MOTIF[map.motif]) return map.motif;
  return BOSS_MOTIF_IDS[hashStr(id || map.id || 'boss') % BOSS_MOTIF_IDS.length];
}
function sigilPath(g, kind, x, y, r) {
  g.beginPath();
  if (kind === 'drop') { g.moveTo(x, y - r); g.bezierCurveTo(x + r * 0.9, y - r * 0.1, x + r * 0.8, y + r * 0.8, x, y + r * 0.8); g.bezierCurveTo(x - r * 0.8, y + r * 0.8, x - r * 0.9, y - r * 0.1, x, y - r); }
  else if (kind === 'crown') { g.moveTo(x - r, y + r * 0.5); g.lineTo(x - r, y - r * 0.4); g.lineTo(x - r * 0.5, y); g.lineTo(x, y - r * 0.8); g.lineTo(x + r * 0.5, y); g.lineTo(x + r, y - r * 0.4); g.lineTo(x + r, y + r * 0.5); g.closePath(); }
  else if (kind === 'anchor') { g.moveTo(x, y - r); g.lineTo(x, y + r * 0.8); g.moveTo(x - r * 0.4, y - r * 0.55); g.lineTo(x + r * 0.4, y - r * 0.55); g.moveTo(x - r * 0.8, y + r * 0.2); g.quadraticCurveTo(x - r * 0.6, y + r * 0.9, x, y + r * 0.8); g.quadraticCurveTo(x + r * 0.6, y + r * 0.9, x + r * 0.8, y + r * 0.2); }
  else if (kind === 'eye') { g.moveTo(x - r, y); g.quadraticCurveTo(x, y - r * 0.8, x + r, y); g.quadraticCurveTo(x, y + r * 0.8, x - r, y); g.moveTo(x + r * 0.3, y); g.arc(x, y, r * 0.3, 0, TAU); }
  else { g.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); g.moveTo(x - r, y - r * 0.3); g.lineTo(x - r * 0.7, y - r * 0.3); g.moveTo(x + r * 0.7, y + r * 0.3); g.lineTo(x + r, y + r * 0.3); }
}
function bgBoss(ctx, S, sp, map) {
  const { W, H, gS, time, cam } = S;
  const mk = BOSS_MOTIF_IDS[sp.v] || 'jelly';
  const M = MOTIF[mk];
  const chaos = map && (map.bossMode === 'chaos' || map.mode === 'chaos');
  S.indoor = true;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, M.bg[0]); bg.addColorStop(0.55, M.bg[1]); bg.addColorStop(1, M.bg[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 奥の壁（モチーフ別）
  const wall = S.layer('bossWall', 640, (P) => {
    const g = P.g, h = P.h, gl = P.gl, R = rng(hashStr('boss' + mk));
    g.fillStyle = M.wall; g.fillRect(0, 0, LW, h);
    if (mk === 'jelly') {
      // 鍾乳洞と光るゼリーの泡
      g.fillStyle = shade(M.wall, -0.3);
      for (let x = 0; x < LW; x += 60 + R() * 40) { const w = 30 + R() * 40, d = 60 + R() * 160; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w / 2, d); g.lineTo(x + w, 0); g.fill(); }
      for (let i = 0; i < 40; i++) { const x = R() * LW, y = 100 + R() * (h - 160), r = 4 + R() * 18; gl.fillStyle = rgba(R() < 0.5 ? M.a : M.b, 0.25 + R() * 0.25); gl.beginPath(); gl.arc(x, y, r, 0, TAU); gl.fill(); }
    } else if (mk === 'sewer') {
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < LW; x += 48) { g.fillStyle = mix(M.wall, '#2e3a2a', R() * 0.6); g.fillRect(x + 1, y + 1, 46, 30); }
      for (const x of [120, 520, 880]) { g.fillStyle = '#2a3428'; g.fillRect(x, 0, 46, h - 120); g.fillStyle = '#3a4a36'; g.fillRect(x - 6, h - 140, 58, 24); g.beginPath(); g.arc(x + 23, h - 116, 30, 0, PI); g.fillStyle = '#0a120a'; g.fill(); gl.fillStyle = rgba(M.a, 0.6); gl.fillRect(x + 8, h - 112, 30, 4); }
      // ガラクタの玉座
      g.fillStyle = '#3a3226'; g.beginPath(); g.moveTo(420, h); g.lineTo(440, h - 200); g.lineTo(512, h - 260); g.lineTo(584, h - 200); g.lineTo(604, h); g.fill();
      g.fillStyle = '#ffd23f'; sigilPath(g, 'crown', 512, h - 230, 26); g.fill();
    } else if (mk === 'dock') {
      // 倉庫: コンテナと警告ストライプ
      for (let x = 0; x < LW; x += 170) for (let y = h - 150; y > h - 450; y -= 100) {
        if (R() < 0.3) continue;
        const c = ['#7a2a2a', '#2a4a6a', '#6a5a2a', '#3a5a3a'][(R() * 4) | 0];
        g.fillStyle = c; g.fillRect(x + 6, y, 158, 96); g.fillStyle = shade(c, -0.25);
        for (let k = 0; k < 158; k += 14) g.fillRect(x + 6 + k, y + 4, 4, 88);
      }
      for (let x = 0; x < LW; x += 40) { g.fillStyle = (x / 40) % 2 ? '#ffb000' : '#1a1010'; g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 20, h - 40); g.lineTo(x + 40, h - 20); g.lineTo(x + 20, h - 20); g.fill(); }
      for (let x = 60; x < LW; x += 200) { gl.fillStyle = rgba(M.a, 0.9); gl.beginPath(); gl.arc(x, 50, 8, 0, TAU); gl.fill(); }
    } else if (mk === 'temple') {
      // 沼の神殿: 石柱・蔦・燭台
      for (let x = 0; x < LW; x += 256) {
        g.fillStyle = '#2e3a2a'; g.fillRect(x + 60, 80, 70, h - 80); g.fillStyle = '#3e4a36'; g.fillRect(x + 52, 70, 86, 24); g.fillRect(x + 52, h - 40, 86, 40);
        g.strokeStyle = '#3a7a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 70, 90); g.bezierCurveTo(x + 40, 200, x + 140, 300, x + 90, h - 60); g.stroke();
        gl.fillStyle = rgba(M.b, 0.9); gl.beginPath(); gl.arc(x + 200, h - 150, 6, 0, TAU); gl.fill();
        g.fillStyle = '#4a3a2a'; g.fillRect(x + 196, h - 144, 8, 104);
      }
      gl.strokeStyle = rgba(M.a, 0.6); gl.lineWidth = 4; sigilPath(gl, 'eye', 512, 220, 90); gl.stroke();
    } else if (mk === 'vault') {
      for (let x = 0; x < LW; x += 128) for (let y = 0; y < h; y += 96) { g.fillStyle = '#4a3a18'; g.fillRect(x + 4, y + 4, 120, 88); }
      // スロットマシンの壁
      for (let x = 40; x < LW; x += 140) { g.fillStyle = '#5a1030'; g.fillRect(x, h - 260, 100, 180); g.fillStyle = '#05030a'; g.fillRect(x + 12, h - 230, 76, 50); for (let k = 0; k < 3; k++) { gl.fillStyle = rgba(['#ffd23f', '#ff2e88', '#19f0ff'][k], 0.8); gl.fillRect(x + 16 + k * 24, h - 222, 18, 34); } gl.fillStyle = rgba(M.a, 0.7); gl.fillRect(x, h - 262, 100, 4); }
    } else if (mk === 'penthouse') {
      // ペントハウス: 大窓の夜景・シャンデリア
      g.fillStyle = '#05030e'; g.fillRect(60, 60, LW - 120, h - 200);
      for (let i = 0; i < 160; i++) { gl.fillStyle = rgba(['#ffd23f', '#ff7ad9', '#9ff6ff'][(R() * 3) | 0], 0.3 + R() * 0.5); gl.fillRect(60 + R() * (LW - 120), 200 + R() * (h - 340), 2 + R() * 2, 2); }
      for (let x = 60; x < LW - 60; x += 128) { g.fillStyle = '#2a1830'; g.fillRect(x, 60, 8, h - 200); }
      g.fillStyle = '#3a1428'; g.fillRect(0, h - 140, LW, 140);
      g.fillStyle = '#ffd23f'; g.fillRect(0, h - 140, LW, 4);
    } else {
      // 宇宙船のリアクター
      g.fillStyle = '#10061e'; g.beginPath(); g.arc(512, 300, 220, 0, TAU); g.fill();
      for (let i = 0; i < 3; i++) { gl.strokeStyle = rgba(i % 2 ? M.a : M.b, 0.7); gl.lineWidth = 6 - i; gl.beginPath(); gl.arc(512, 300, 120 + i * 40, 0, TAU); gl.stroke(); }
      for (let x = 0; x < LW; x += 96) { g.fillStyle = '#24103a'; g.fillRect(x, 0, 12, h); gl.fillStyle = rgba(M.a, 0.5); gl.fillRect(x + 4, 0, 3, h); }
    }
    // 中央の紋章（ボスのシンボル）
    if (mk !== 'temple' && mk !== 'sewer') { gl.lineWidth = 6; gl.strokeStyle = rgba(M.b, 0.5); sigilPath(gl, M.sigil, 512, 160, 60); gl.stroke(); }
  });
  S.tile(wall, 0.2, gS + 60, M.wall);
  // 手前の柱（左右に重厚なフレーム）
  const pillars = S.layer('bossPillars', 700, (P) => {
    const g = P.g, h = P.h;
    for (const x of [0, 512]) {
      g.fillStyle = shade(M.wall, -0.45); g.fillRect(x, 0, 64, h);
      g.fillStyle = shade(M.wall, -0.2); g.fillRect(x + 6, 0, 10, h);
      P.gl.fillStyle = rgba(M.a, 0.85); P.gl.fillRect(x + 54, 0, 4, h);
      for (let y = 80; y < h; y += 160) { P.gl.fillStyle = rgba(M.b, 0.9); P.gl.beginPath(); P.gl.arc(x + 32, y, 7, 0, TAU); P.gl.fill(); }
    }
  });
  S.tile(pillars, 0.55, gS + 10);
  S.post(() => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 脈打つ床の光（ボス戦の緊張感）
    const pulse = 0.5 + 0.5 * Math.sin(time * (chaos ? 5 : 2.4));
    const fg = ctx.createLinearGradient(0, gS - 160, 0, gS + 10);
    fg.addColorStop(0, rgba(chaos ? '#ff2040' : M.a, 0)); fg.addColorStop(1, rgba(chaos ? '#ff2040' : M.a, 0.12 + 0.12 * pulse));
    ctx.fillStyle = fg; ctx.fillRect(0, gS - 160, W, 170);
    // モチーフ別のライブ粒子
    for (let i = 0; i < 22; i++) {
      const x = ((i * 191 - cam.x * 0.3) % (W + 60) + W + 60) % (W + 60) - 30;
      let y, r = 2, col = i % 2 ? M.a : M.b;
      if (mk === 'jelly' || mk === 'reactor') { y = gS - ((time * (30 + (i % 4) * 12) + i * 71) % (gS + 30)); r = 2 + (i % 3) * 2; }
      else if (mk === 'sewer' || mk === 'temple') { y = ((time * (60 + (i % 3) * 30) + i * 53) % (gS + 30)); r = 1.6; col = M.a; } // 滴り・蛍
      else if (mk === 'vault' || mk === 'penthouse') { y = ((time * 50 + i * 83) % (gS + 30)); r = 1.5 + (i % 2); col = '#ffd23f'; } // 金の紙吹雪
      else { y = gS - 40 - ((i * 37) % 300); r = 1.5 + Math.sin(time * 6 + i) * 1.5; col = M.a; } // 火の粉
      ctx.fillStyle = rgba(col, 0.55);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 周辺減光（ボス部屋の圧）
    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, chaos ? 'rgba(60,0,10,0.55)' : 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  });
}

/** drawSpecial(ctx, S, map) → true なら描画した */
export function drawSpecial(ctx, S, map) {
  const sp = specialOf(map);
  if (!sp) return false;
  if (sp.kind === 'tower') bgTower(ctx, S, sp);
  else if (sp.kind === 'arena') { S.arenaWave = map && (map.wave || map.arenaWave) || 0; bgArena(ctx, S); }
  else bgBoss(ctx, S, sp, map);
  return true;
}

/** 床タイル用の配色（background.js の TILE と同形式） */
export function specialTile(map) {
  const sp = specialOf(map);
  if (!sp) return null;
  if (sp.kind === 'tower') {
    const p = TOWER_PAL[sp.v] || TOWER_PAL[0];
    return { gk: 'tower', pk: 'beam', ground: shade(p.mid, -0.1), groundD: shade(p.wall, -0.3), top: shade(p.mid, 0.25), plat: p.mid, platE: shade(p.mid, 0.4), neon: p.a, ladder: true, wall: p.wall };
  }
  if (sp.kind === 'arena') return { gk: 'arena', pk: 'beam', ground: '#2a1840', groundD: '#160a24', top: '#5a3a80', plat: '#3a2458', platE: '#8a6ab8', neon: '#ff2e88', ladder: true, wall: '#2a1840' };
  const M = MOTIF[BOSS_MOTIF_IDS[sp.v]] || MOTIF.jelly;
  return { gk: 'boss', pk: 'beam', ground: shade(M.wall, 0.1), groundD: shade(M.wall, -0.4), top: shade(M.wall, 0.35), plat: shade(M.wall, 0.15), platE: shade(M.wall, 0.45), neon: M.a, ladder: true, wall: M.wall };
}
void lerp;
