// ルミナリア・クラシック — 最初の段階（エンジン）
// 800×600 の内部の画面を整数倍で拡大（最近傍）。物理は 60 回/秒の固定。
import { DT, FEEL } from './engine/feel.js';
import { createPlayer, stepPlayer, blinkVisible } from './engine/physics.js';
import { loadMap, spawnPoint } from './world/mapFormat.js';
import { Input } from './core/input.js';
import { Camera, VIEW_W, VIEW_H } from './render/camera.js';
import { Background } from './render/background.js';
import { renderTerrain } from './render/terrain.js';
import { drawAvatar, DEFAULT_LOOK } from './render/avatar/avatar.js';
import { frameIndexAt } from './render/avatar/skeleton.js';
import { playBgm, playSfx } from './audio/index.js';
import testField from './data/maps/test_field.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');     // テスト: 自動で進めない（step で進める）

const STATE_ANIM = { stand: 'stand1', walk: 'walk1', air: 'jump', prone: 'prone', rope: 'rope', ladder: 'ladder' };
const EVENT_SFX = { jump: 'jump', downjump: 'jump', ropejump: 'jump', grab: 'rope', hurt: 'hurt' };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input();
    this.look = { ...DEFAULT_LOOK };
    this.debug = params.has('debug');
    this.frame = 0;
    this.lastError = null;
    this.loadMap(testField);
  }

  loadMap(data, portal = null) {
    this.map = loadMap(data);
    const sp = spawnPoint(this.map, portal);
    this.player = createPlayer(sp.x, sp.y - 1);
    this.camera = new Camera(this.map);
    this.camera.snap(this.player);
    this.bg = new Background(this.map);
    this.terrain = renderTerrain(this.map);
    this.animT = 0;
    playBgm(this.map.bgm);
    // 足元を決めるため少し進める
    for (let i = 0; i < 3; i++) stepPlayer(this.player, {}, this.map, DT);
  }

  // 固定の 1 フレーム
  tick() {
    this.input.beginFrame();
    if (this.input.pressed('debug')) this.debug = !this.debug;
    const p = this.player;
    const prevState = p.state;
    stepPlayer(p, this.input.snapshot(), this.map, DT);
    for (const e of p.events) if (EVENT_SFX[e]) playSfx(EVENT_SFX[e]);
    // 絵の時間: 縄・はしごは動いている時だけ進む
    if (p.state !== prevState) this.animT = 0;
    else if (!((p.state === 'rope' || p.state === 'ladder') && !p.climbing)) this.animT += DT;
    this.camera.update(p, DT);
    if (!TEST) this.bg.update(DT);
    this.frame++;
  }

  step(n = 1) { for (let i = 0; i < n; i++) this.tick(); this.render(); }

  render() {
    const g = this.ctx, cam = this.camera, p = this.player;
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, VIEW_H);
    this.bg.draw(g, { x: cx, y: cy });
    g.drawImage(this.terrain, cx, cy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    this.drawPortals(g, cx, cy);
    // 足元の影（半透明はプログラムで）
    if (p.state === 'stand' || p.state === 'walk') {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      const sx = Math.round(p.x) - cx, sy = Math.round(p.y) - cy;
      g.fillRect(sx - 8, sy - 1, 17, 2); g.fillRect(sx - 6, sy - 2, 13, 4);
    }
    if (blinkVisible(p)) {
      const anim = STATE_ANIM[p.state] || 'stand1';
      const idx = frameIndexAt(anim, this.animT);
      drawAvatar(g, this.look, anim, idx, Math.round(p.x) - cx, Math.round(p.y) - cy, p.facing);
    }
    if (this.debug) this.drawDebug(g, cx, cy);
  }

  drawPortals(g, cx, cy) {
    const t = this.frame / 60;
    for (const pt of this.map.portals) {
      if (pt.type !== 'visible') continue;
      const x = Math.round(pt.x) - cx, y = Math.round(pt.y) - cy;
      // 仮: 光の渦（4 コマ）
      const k = Math.floor(t * 8) % 4;
      const cols = ['#ffffff', '#bff4ff', '#6ad8ff', '#2a9cf0'];
      for (let r = 0; r < 4; r++) {
        g.fillStyle = cols[(r + k) % 4];
        const w = 18 - r * 4, h = 34 - r * 7;
        for (let j = -h; j <= h; j += 1) {
          const ww = Math.round(w * Math.sqrt(1 - (j / h) ** 2));
          g.fillRect(x - ww, y - 38 + j, 1, 1); g.fillRect(x + ww, y - 38 + j, 1, 1);
        }
      }
    }
  }

  drawDebug(g, cx, cy) {
    g.save();
    g.strokeStyle = '#ff0040'; g.lineWidth = 1;
    for (const s of this.map.segs) {
      g.beginPath(); g.moveTo(s.x1 - cx + 0.5, s.y1 - cy + 0.5); g.lineTo(s.x2 - cx + 0.5, s.y2 - cy + 0.5); g.stroke();
    }
    g.strokeStyle = '#00e0ff';
    for (const r of this.map.ropes) { g.beginPath(); g.moveTo(r.x - cx + 0.5, r.top - cy); g.lineTo(r.x - cx + 0.5, r.bottom - cy); g.stroke(); }
    const p = this.player;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, 4, 250, 46);
    g.fillStyle = '#fff'; g.font = '12px monospace';
    g.fillText(`${p.state}  x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`, 10, 18);
    g.fillText(`vx=${p.vx.toFixed(1)} vy=${p.vy.toFixed(1)} fps=${this.fps || 0}`, 10, 32);
    g.fillText(`cam ${Math.round(this.camera.x)},${Math.round(this.camera.y)}  F2: 線の表示`, 10, 46);
    g.restore();
  }
}

// ---- 画面の大きさ: 800×600 の整数倍（入らなければ ×1）。余りは黒
function fit(canvas) {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * s}px`;
  canvas.style.height = `${VIEW_H * s}px`;
  return s;
}

function boot() {
  const canvas = document.getElementById('screen');
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  fit(canvas);
  addEventListener('resize', () => fit(canvas));
  const game = new Game(canvas);
  window.__classic = { game, FEEL };
  game.render();
  if (TEST) return;

  // 60 回/秒の固定。描くのは画面の更新ごと
  let acc = 0, last = performance.now(), fpsN = 0, fpsT = 0;
  const loop = (now) => {
    const el = Math.min(0.1, (now - last) / 1000);
    last = now; acc += el;
    try {
      let n = 0;
      while (acc >= DT && n < 5) { game.tick(); acc -= DT; n++; }
      if (n === 5) acc = 0;
      game.render();
    } catch (e) {
      game.lastError = String(e && e.stack || e);
      console.error(e);
    }
    fpsN++; fpsT += el;
    if (fpsT >= 1) { game.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
