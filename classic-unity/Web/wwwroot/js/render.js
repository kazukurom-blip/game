// 画面を描く（仮の絵）。マップの形はマップの JSON（data.json）から、動く物は C# の Frame の結果から。
// 座標は Core と同じ: 1 px = 1、y は下が正。カメラの左上を引いて 800×600 に描く（canvas 全体を整数倍に拡大）。
import { drawAvatar, DEFAULT_LOOK, FRAME_W } from './avatar/avatar.js';
import { getFrame } from './avatar/skeleton.js';
import { COLORS } from './avatar/parts.js';

export const VIEW_W = 800, VIEW_H = 600, HUD_H = 64;

// ---------------------------------------------------------------- 色（背景の種類・地形の型から）
const PAL = {
  grass: { sky: ['#8fd3ff', '#d8f2ff'], hill: '#7cc46a', hill2: '#5aa850', top: '#6cc84a', line: '#2c6420', fill: '#c08a52', dark: '#9c6a3c' },
  beach: { sky: ['#7fd0ff', '#fff3d0'], hill: '#5fb8e8', hill2: '#3d98d0', top: '#f0d890', line: '#9c7a40', fill: '#e2c27a', dark: '#c0a060' },
  forest: { sky: ['#9ad8a0', '#e0f4d0'], hill: '#3f8f4a', hill2: '#2e7038', top: '#58b048', line: '#24501c', fill: '#8a5c34', dark: '#6a4424' },
  dark: { sky: ['#1a2a3a', '#324a58'], hill: '#24394a', hill2: '#1a2a38', top: '#4a7a5a', line: '#18301e', fill: '#4c3a2c', dark: '#34281e' },
  cave: { sky: ['#1c1a22', '#3a3440'], hill: '#2c2832', hill2: '#221e28', top: '#8a8090', line: '#3a3440', fill: '#5c5460', dark: '#403a46' },
  snow: { sky: ['#a8c8e8', '#f4fbff'], hill: '#dfeef8', hill2: '#c4dcec', top: '#ffffff', line: '#5a7a98', fill: '#88a4c4', dark: '#6a88a8' },
  sea: { sky: ['#0c3a6a', '#2a7ab0'], hill: '#1a5a8a', hill2: '#124a78', top: '#e8c890', line: '#7a5a30', fill: '#b08a5a', dark: '#8a6a40' },
  fire: { sky: ['#3a0e08', '#a83a18'], hill: '#5a1a10', hill2: '#3a100a', top: '#c85a28', line: '#401408', fill: '#5a2a18', dark: '#3a1a10' },
  sky: { sky: ['#b8a8f0', '#fff4fc'], hill: '#f4f0ff', hill2: '#ddd4f8', top: '#fffaff', line: '#7a68b0', fill: '#b0a0e0', dark: '#9080c8' },
  temple: { sky: ['#e8d8a0', '#fff8e0'], hill: '#d8c070', hill2: '#c0a858', top: '#f0e0a0', line: '#806028', fill: '#c8b078', dark: '#a89058' },
  toy: { sky: ['#ffd0e8', '#fff8d0'], hill: '#a8e0ff', hill2: '#ffc0d8', top: '#ff8ab0', line: '#a04070', fill: '#ffd890', dark: '#e8b060' },
  city: { sky: ['#202848', '#5a5a88'], hill: '#2a3050', hill2: '#1e2440', top: '#8890a8', line: '#30344a', fill: '#5a5e74', dark: '#44485c' },
  rock: { sky: ['#e8c890', '#fff0d0'], hill: '#b08850', hill2: '#906a38', top: '#c8a060', line: '#5a3a18', fill: '#a07040', dark: '#805428' },
  swamp: { sky: ['#5a6a48', '#a8b088'], hill: '#4a5a38', hill2: '#384828', top: '#6a8a40', line: '#2a3818', fill: '#5a4a30', dark: '#403420' },
  town: { sky: ['#a0dcff', '#fff6e0'], hill: '#88c070', hill2: '#6aa858', top: '#d8b880', line: '#6a4a20', fill: '#b89060', dark: '#987048' },
  ship: { sky: ['#78c8ff', '#e8f8ff'], hill: '#3a90d0', hill2: '#2a78b8', top: '#b07840', line: '#5a3410', fill: '#8a5a2a', dark: '#6a4018' },
};
const BG_RULES = [
  [/cave|mine|dig|anthill|sewer|subway|tomb|den|nest|hideout|lair|trench|abyss/, 'cave'],
  [/snow|ice|yeti|cold/, 'snow'],
  [/sea|coral|octo|shark|deep|sunken|bubble|sub_dock|pond/, 'sea'],
  [/fire|lava|magma|volcano|ash|colossus|red_cave|steam/, 'fire'],
  [/cloud|star|heaven|moon|sun_garden|pegasus|goddess|altar|apostle|guardian|greenhouse/, 'sky'],
  [/temple|golden|knight|prayer|seal|afterimage|shrine|ruin/, 'temple'],
  [/toy|block|plush|clock|time|screw|rocking|elevator/, 'toy'],
  [/night|alley|construction|rooftop|city|ticket/, 'city'],
  [/rock|cliff|valley|road_dry|stump|logging|battlefield|ranch|dragon|bone|chimera|thunder|ancient|black/, 'rock'],
  [/swamp|misty|vines/, 'swamp'],
  [/forest_dark|forest_night|dark/, 'dark'],
  [/forest|grove|tree|fairy|branch|beehive|mushroom|vine/, 'forest'],
  [/beach|pier|port|lighthouse|shore/, 'beach'],
  [/ship/, 'ship'],
  [/village|town|market|station|plaza|camp|house|hall|room|training/, 'town'],
];
export function paletteFor(map) {
  const bg = map.bg || '';
  for (const [re, k] of BG_RULES) if (re.test(bg)) return PAL[k];
  const t = map.theme || '';
  if (t === 'cave') return PAL.cave;
  if (t.startsWith('town')) return PAL.town;
  if (t === 'swamp') return PAL.swamp;
  if (t === 'ship') return PAL.ship;
  if (t === 'forest') return PAL.forest;
  if (t === 'cliff') return PAL.rock;
  if (t === 'tower') return PAL.temple;
  return PAL.grass;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------- 小さなドットの数字（ダメージ）
const GLYPH = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], M: ['10001', '11011', '10101', '10001', '10001'], I: ['111', '010', '010', '010', '111'],
  S: ['111', '100', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'],
};
const glyphCache = new Map();
function glyphs(text, fill, edge, px) {
  const key = text + fill + px;
  let c = glyphCache.get(key);
  if (c) return c;
  const rows = 5; let w = 0;
  for (const ch of text) w += (GLYPH[ch]?.[0].length || 3) + 1;
  c = document.createElement('canvas');
  c.width = (w + 2) * px; c.height = (rows + 2) * px;
  const g = c.getContext('2d');
  const draw = (color, ox, oy) => {
    g.fillStyle = color; let x = 1;
    for (const ch of text) {
      const gl = GLYPH[ch]; if (!gl) { x += 4; continue; }
      for (let j = 0; j < rows; j++) for (let i = 0; i < gl[j].length; i++) if (gl[j][i] === '1') g.fillRect((x + i + ox) * px, (1 + j + oy) * px, px, px);
      x += gl[0].length + 1;
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) draw(edge, ox, oy);
  draw(fill, 0, 0);
  if (glyphCache.size > 600) glyphCache.clear();
  glyphCache.set(key, c);
  return c;
}
const DMG_COL = [['#ffb030', '#5a2000'], ['#ff4040', '#4a0000'], ['#c070ff', '#2a0040'], ['#60e060', '#0a3a0a'], ['#60a0ff', '#0a1a4a'], ['#e0e0e0', '#303030'], ['#b050e0', '#200030']];

// ---------------------------------------------------------------- 描く物
export class Renderer {
  constructor(canvas, db) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.db = db; // { items, monsters, skills }
    this.cam = { x: 0, y: 0 };
    this.map = null;
    this.nums = [];       // ダメージの数字
    this.fx = [];         // エフェクト（Lv アップの光など）
    this.time = 0;
    this.scale = 1;
    this.look = { ...DEFAULT_LOOK };
    this.npcLooks = new Map();
    this.bulbs = {};
  }

  resize(scale) {
    this.scale = scale;
    this.canvas.width = VIEW_W * scale; this.canvas.height = VIEW_H * scale;
    this.canvas.style.width = VIEW_W * scale + 'px'; this.canvas.style.height = VIEW_H * scale + 'px';
  }

  setMap(map, px, py) {
    this.map = map;
    this.pal = paletteFor(map);
    this.nums = []; this.fx = [];
    this.snapCam(px, py);
    // 壁で囲まれた足場（岩・段）は下まで塗る
    for (const fh of map.footholds) {
      fh._solid = 0;
      if (fh.ground) continue;
      const a = fh.points[0], b = fh.points[fh.points.length - 1];
      for (const w of map.walls || []) {
        if ((Math.abs(w.x - a[0]) <= 1 && Math.abs(w.top - a[1]) <= 2) || (Math.abs(w.x - b[0]) <= 1 && Math.abs(w.top - b[1]) <= 2)) fh._solid = Math.max(fh._solid, w.bottom);
      }
    }
    // 背景の山（種はマップの ID）
    const h = hash(map.id);
    this.hills = [];
    for (let layer = 0; layer < 2; layer++) {
      const pts = []; let x = -200; let k = h + layer * 977;
      while (x < VIEW_W + 600) { k = (Math.imul(k, 1103515245) + 12345) >>> 0; pts.push([x, 60 + (k % 120)]); x += 80 + (k % 120); }
      this.hills.push(pts);
    }
  }

  camTarget(px, py) {
    const m = this.map;
    let tx = px - VIEW_W / 2, ty = py - VIEW_H / 2 - 40;
    tx = Math.max(0, Math.min(m.width - VIEW_W, tx));
    ty = Math.max(-40, Math.min(m.height - VIEW_H + HUD_H - 16, ty));
    if (m.width < VIEW_W) tx = (m.width - VIEW_W) / 2;
    if (m.height + HUD_H < VIEW_H) ty = m.height - VIEW_H + HUD_H;
    return [tx, ty];
  }
  snapCam(px, py) { const [x, y] = this.camTarget(px, py); this.cam.x = x; this.cam.y = y; }

  // ---------------- 1 フレーム
  draw(f, dt, ui) {
    const g = this.g, S = this.scale;
    this.time += dt;
    const [tx, ty] = this.camTarget(f.p[0], f.p[1]);
    const k = Math.min(1, dt * 7);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
    this.drawBackground(g, cx, cy);
    g.save(); g.translate(-cx, -cy);
    this.drawTerrain(g, cx, cy);
    this.drawPortals(g, cx);
    this.drawObjects(g, f);
    this.drawNpcs(g, f, ui);
    this.drawHazards(g, f, cx, cy, false);
    this.drawDrops(g, f);
    for (const m of f.mo) this.drawMob(g, m);
    if (f.pe) for (const p of f.pe) this.drawPet(g, p);
    this.drawPlayer(g, f, ui);
    this.drawProjectiles(g, f);
    this.drawHazards(g, f, cx, cy, true);
    this.drawFx(g, dt);
    this.addNums(f);
    this.drawNums(g, dt);
    g.restore();
    this.drawGlobalHazards(g, f);
    this.drawMinimap(g, f, ui);
    if (f.bb) this.drawBossBar(g, f.bb);
    if (f.rt != null) this.drawRoomTimer(g, f.rt);
  }

  drawBackground(g, cx, cy) {
    const P = this.pal;
    const gr = g.createLinearGradient(0, 0, 0, VIEW_H);
    gr.addColorStop(0, P.sky[0]); gr.addColorStop(1, P.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, VIEW_W, VIEW_H);
    // 遠くの山（ゆっくり動く）
    const layers = [[0.15, P.hill2, 380], [0.3, P.hill, 440]];
    layers.forEach(([par, col, base], i) => {
      const pts = this.hills[i];
      const off = -((cx * par) % 1200);
      const yoff = base - cy * par * 0.4;
      g.fillStyle = col;
      for (let rep = -1; rep < 2; rep++) {
        g.beginPath();
        g.moveTo(off + rep * 1200 - 200, VIEW_H);
        for (const [x, h] of pts) g.lineTo(Math.round(off + rep * 1200 + x * 1.2), Math.round(yoff - h));
        g.lineTo(off + rep * 1200 + 1200, VIEW_H);
        g.fill();
      }
    });
  }

  drawTerrain(g, cx, cy) {
    const m = this.map, P = this.pal;
    const x0 = cx - 20, x1 = cx + VIEW_W + 20;
    for (const fh of m.footholds) {
      const pts = fh.points;
      if (pts[pts.length - 1][0] < x0 || pts[0][0] > x1) continue;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      if (fh.ground) { g.lineTo(pts[pts.length - 1][0], m.height + 200); g.lineTo(pts[0][0], m.height + 200); }
      else if (fh._solid) { g.lineTo(pts[pts.length - 1][0], fh._solid); g.lineTo(pts[0][0], fh._solid); }
      else { for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + 14); }
      g.closePath();
      g.fillStyle = P.fill; g.fill();
      // 上の縁（草・雪・板）
      g.lineWidth = 6; g.strokeStyle = P.top;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 3); for (const p of pts) g.lineTo(p[0], p[1] + 3); g.stroke();
      g.lineWidth = 1; g.strokeStyle = P.line;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 0.5); for (const p of pts) g.lineTo(p[0], p[1] + 0.5); g.stroke();
      if (!fh.ground && !fh._solid) {
        g.strokeStyle = P.dark;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 13.5); for (const p of pts) g.lineTo(p[0], p[1] + 13.5); g.stroke();
      }
    }
    // 縄・はしご
    for (const r of m.ropes) {
      if (r.x < x0 || r.x > x1) continue;
      const top = r.top - 14, bot = r.bottom;
      if (r.ladder) {
        g.fillStyle = '#7a4a20'; g.fillRect(r.x - 9, top, 3, bot - top); g.fillRect(r.x + 6, top, 3, bot - top);
        g.fillStyle = '#b07840';
        for (let y = top + 6; y < bot; y += 10) g.fillRect(r.x - 8, y, 16, 3);
      } else {
        g.fillStyle = '#c89a5a'; g.fillRect(r.x - 1, top, 3, bot - top);
        g.fillStyle = '#7a5428';
        for (let y = top + 4; y < bot; y += 8) g.fillRect(r.x - 1, y, 3, 2);
        g.fillStyle = '#7a5428'; g.fillRect(r.x - 3, bot - 4, 7, 4);
      }
    }
  }

  drawPortals(g) {
    const t = this.time;
    for (const p of this.map.portals) {
      if (p.type !== 'visible') continue;
      const x = p.x, y = p.y;
      for (let i = 0; i < 4; i++) {
        const a = t * 3 + i * Math.PI / 2;
        g.fillStyle = i % 2 ? 'rgba(120,200,255,0.75)' : 'rgba(200,240,255,0.85)';
        const r = 12 + 4 * Math.sin(t * 4 + i);
        g.fillRect(Math.round(x + Math.cos(a) * r) - 3, Math.round(y - 34 + Math.sin(a) * r * 1.6) - 3, 6, 6);
      }
      g.fillStyle = 'rgba(140,210,255,0.35)';
      g.beginPath(); g.ellipse(x, y - 34, 16, 30, 0, 0, Math.PI * 2); g.fill();
    }
  }

  drawObjects(g, f) {
    for (const o of this.map.objects || []) {
      const near = Math.abs(o.x - f.p[0]) < 40 && Math.abs(o.y - f.p[1]) < 60;
      g.fillStyle = '#8a5a2a'; g.fillRect(o.x - 10, o.y - 20, 20, 20);
      g.fillStyle = '#c08a4a'; g.fillRect(o.x - 8, o.y - 18, 16, 6); g.fillRect(o.x - 8, o.y - 10, 16, 8);
      if (near) this.tag(g, o.name + '（V で調べる）', o.x, o.y - 34, '#fff8c0');
    }
  }

  npcLook(id) {
    let l = this.npcLooks.get(id);
    if (l) return l;
    const h = hash(id);
    const pick = (o, n) => { const ks = Object.keys(o); return ks[(h >>> n) % ks.length]; };
    l = { ...DEFAULT_LOOK, hairColor: pick(COLORS.hair, 3), topColor: pick(COLORS.top, 7), pantsColor: pick(COLORS.pants, 11), skin: pick(COLORS.skin, 15) };
    this.npcLooks.set(id, l);
    return l;
  }

  drawNpcs(g, f, ui) {
    const t = this.time;
    if (f.bu) this.bulbs = f.bu;
    // V で話せる人（Core の InteractNearby と同じ: 横 120 px・縦 80 px の中でいちばん近い人）
    let near = null, nd = 120;
    for (const n of this.map.npcs) {
      const d = Math.abs(n.x - f.p[0]);
      if (d <= nd && Math.abs(n.y - f.p[1]) < 80) { nd = d; near = n; }
    }
    for (const n of this.map.npcs) {
      const facing = f.p[0] < n.x ? -1 : 1;
      drawAvatar(g, this.npcLook(n.id), 'stand1', Math.floor(t / 0.5 + (hash(n.id) % 3)) % 3, n.x, n.y, facing);
      this.tag(g, n.name, n.x, n.y + 4, '#ffe080');
      if (n === near && !ui?.talking) this.tag(g, 'V で話す', n.x, n.y + 19, '#c8f0ff');
      const b = this.bulbs[n.id];
      if (b) this.drawMark(g, b, n.x, n.y - 100 + Math.round(Math.sin(t * 3 + (hash(n.id) % 7)) * 4), t);
    }
  }

  // 頭の上のマーク: 1 = 受けられるクエスト（黄色の「？」）、2 = 報告できるクエスト（光る電球）。上が y、中心が x
  // 遠くからでも分かるよう 3 px のドットで描き、まわりをぼんやり光らせる（上下の動きは呼ぶ側）
  drawMark(g, kind, x, y, t) {
    x = Math.round(x); y = Math.round(y);
    const px = 3;
    const glow = 0.25 + 0.2 * Math.sin(t * 5);
    const dots = (rows, ox, oy, color) => {
      g.fillStyle = '#3a2400';
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') g.fillRect(ox + c * px - 1, oy + r * px - 1, px + 2, px + 2);
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') { g.fillStyle = color(r, c); g.fillRect(ox + c * px, oy + r * px, px, px); }
    };
    const halo = (cx, cy, rad, rgb) => {
      const gr = g.createRadialGradient(cx, cy, 2, cx, cy, rad);
      gr.addColorStop(0, `rgba(${rgb},${glow + 0.3})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
    };
    if (kind === 1) {
      const Q = ['.#####.', '##...##', '##...##', '.....##', '....##.', '...##..', '...##..', '.......', '...##..', '...##..'];
      halo(x, y + 15, 22, '255,220,60');
      dots(Q, x - 10, y, (r) => (r < 2 ? '#fff6a0' : '#ffd820'));
      return;
    }
    const B = ['..####..', '.######.', '########', '########', '########', '.######.', '..####..', '...##...'];
    halo(x, y + 11, 26, '255,250,170');
    g.fillStyle = '#fffbd0';
    for (const [dx, dy, w, h] of [[-21, 9, 5, 2], [16, 9, 5, 2], [-1, -9, 2, 5], [-16, -4, 4, 2], [12, -4, 4, 2]]) g.fillRect(x + dx, y + dy, w, h);
    dots(B, x - 12, y, (r, c) => ((r < 3 && c < 4) ? '#ffffff' : '#ffec60'));
    g.fillStyle = '#4a3a00'; g.fillRect(x - 7, y + 23, 14, 10);
    g.fillStyle = '#a0a0a8'; g.fillRect(x - 6, y + 24, 12, 3); g.fillRect(x - 6, y + 29, 12, 3);
  }

  // 名前の札（下が暗い四角・字は明るい）
  tag(g, text, x, y, color = '#ffffff') {
    g.font = '11px sans-serif';
    const w = Math.ceil(g.measureText(text).width) + 6;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(x - w / 2), Math.round(y), w, 14);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(text, Math.round(x), Math.round(y) + 1);
    g.textAlign = 'left';
  }

  medalTag(g, text, x, y) {
    g.font = 'bold 11px sans-serif';
    const w = Math.ceil(g.measureText(text).width) + 14;
    const bx = Math.round(x - w / 2), by = Math.round(y);
    g.fillStyle = '#5a3a00'; g.fillRect(bx - 1, by - 1, w + 2, 16);
    g.fillStyle = '#c89020'; g.fillRect(bx, by, w, 14);
    g.fillStyle = '#ffe890'; g.fillRect(bx, by, w, 2);
    g.fillStyle = '#fff6d0'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(text, Math.round(x), by + 1);
    g.textAlign = 'left';
  }

  drawDrops(g, f) {
    for (const d of f.dr) {
      const x = Math.round(d[3]), y = Math.round(d[4]);
      if (!d[1]) {
        const col = ['#c88a40', '#c88a40', '#d0d0e0', '#ffd040', '#ffd040'][d[5]];
        if (d[5] >= 4) { g.fillStyle = '#806010'; g.fillRect(x - 8, y - 12, 16, 12); g.fillStyle = col; g.fillRect(x - 7, y - 11, 14, 10); g.fillStyle = '#fff4a0'; g.fillRect(x - 4, y - 9, 3, 2); }
        else { g.fillStyle = '#5a3a00'; g.fillRect(x - 6, y - 12, 12, 12); g.fillStyle = col; g.fillRect(x - 5, y - 11, 10, 10); g.fillStyle = '#ffffff'; g.fillRect(x - 3, y - 9, 2, 2); }
      } else if (d[1].startsWith('card.')) {
        // 図鑑のカード（拾うと図鑑へ）: 縦長の札に敵の色の丸
        const mob = this.db.monsters[d[1].slice(5)];
        g.fillStyle = '#3a2a08'; g.fillRect(x - 7, y - 19, 14, 19);
        g.fillStyle = '#fff4c8'; g.fillRect(x - 6, y - 18, 12, 17);
        g.fillStyle = mobColor(mob); g.beginPath(); g.arc(x, y - 11, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c08a10'; g.fillRect(x - 6, y - 4, 12, 2);
        if (Math.floor(this.time * 3) % 2) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x + 3, y - 17, 2, 2); }
      } else {
        const it = this.db.items[d[1]];
        g.fillStyle = '#202020'; g.fillRect(x - 8, y - 16, 16, 16);
        g.fillStyle = itemColor(it); g.fillRect(x - 7, y - 15, 14, 14);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - 5, y - 13, 4, 3);
      }
    }
  }

  drawMob(g, m) {
    const [uid, id, x0, y0, facing, motion, hp, maxHp, fade, flags, , mech] = m;
    if (flags & 1) return; // 潜っている・消えている
    const def = this.db.monsters[id] || { width: 30, height: 30, name: id, move: 'walk' };
    const x = Math.round(x0), y = Math.round(y0);
    const w = Math.max(16, def.width), h = Math.max(16, def.height);
    const hue = hash(id) % 360;
    const t = this.time + uid;
    g.save();
    let alpha = 1 - fade;
    if (flags & 4) alpha *= 0.6; // 分身
    g.globalAlpha = Math.max(0, alpha);
    // 影
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - w / 2 + 2, y - 2, w - 4, 3);
    const hit = motion === 'hit1';
    const atk = motion === 'attack1' || motion === 'skill1';
    const body = hit ? '#ffffff' : `hsl(${hue},55%,${atk ? 62 : 55}%)`;
    const dark = `hsl(${hue},55%,30%)`;
    const light = `hsl(${hue},70%,78%)`;
    const move = mech === 'rock' ? 'rock' : def.move;
    const left = x - w / 2, top = y - h;
    const bob = motion === 'move' || motion === 'fly' ? Math.round(Math.sin(t * 10)) : 0;
    g.fillStyle = dark;
    if (move === 'crawl') {
      // 殻と体
      g.fillRect(left, y - Math.round(h * 0.35), w, Math.round(h * 0.35));
      g.fillStyle = body; g.fillRect(left + 1, y - Math.round(h * 0.35) + 1, w - 2, Math.round(h * 0.35) - 2);
      const sx = x - facing * Math.round(w * 0.12), sw = Math.round(w * 0.6), sh = Math.round(h * 0.75);
      g.fillStyle = dark; g.beginPath(); g.ellipse(sx, y - sh / 2 - 2 + bob, sw / 2, sh / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = light; g.beginPath(); g.ellipse(sx, y - sh / 2 - 2 + bob, sw / 2 - 2, sh / 2 - 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = dark; g.lineWidth = 2; g.beginPath(); g.arc(sx, y - sh / 2 - 2 + bob, sw / 5, 0, Math.PI * 1.6); g.stroke();
      this.eyes(g, x + facing * Math.round(w * 0.38), y - Math.round(h * 0.42), facing);
    } else if (move === 'jump') {
      const sq = motion === 'move' ? 1 + 0.08 * Math.sin(t * 8) : 1;
      g.beginPath(); g.ellipse(x, y - h / 2 * sq, w / 2, h / 2 * sq, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = body; g.beginPath(); g.ellipse(x, y - h / 2 * sq, w / 2 - 2, h / 2 * sq - 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = light; g.fillRect(x - w / 4, y - h * 0.8, 5, 4);
      this.eyes(g, x + facing * w * 0.15, y - h * 0.55, facing);
    } else if (move === 'fly') {
      const fy = y - h / 2 + bob * 2;
      const wing = Math.sin(t * 16) > 0 ? -6 : 2;
      g.fillStyle = light; g.fillRect(x - w / 2 - 8, fy - 6 + wing, 12, 6); g.fillRect(x + w / 2 - 4, fy - 6 + wing, 12, 6);
      g.fillStyle = dark; g.beginPath(); g.arc(x, fy, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = body; g.beginPath(); g.arc(x, fy, Math.min(w, h) / 2 - 2, 0, Math.PI * 2); g.fill();
      this.eyes(g, x + facing * 4, fy - 3, facing);
    } else if (move === 'stand' || move === 'rock') {
      g.fillRect(left + 2, top, w - 4, h);
      g.fillStyle = body; g.fillRect(left + 3, top + 1, w - 6, h - 2);
      g.fillStyle = light; g.fillRect(left + 5, top + 3, 4, h - 8);
      if (move !== 'rock') { g.fillStyle = `hsl(${(hue + 120) % 360},60%,45%)`; g.fillRect(x - w / 3, top - 6, Math.round(w / 1.5), 8); this.eyes(g, x + facing * 3, top + h * 0.3, facing); }
    } else if (move === 'teleport') {
      g.fillRect(left, top + bob, w, h - 4);
      g.fillStyle = body; g.fillRect(left + 1, top + 1 + bob, w - 2, h - 6);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? body : dark; g.fillRect(left + i * w / 4, y - 5 + bob, w / 4, 4); }
      this.eyes(g, x + facing * 4, top + h * 0.35 + bob, facing);
    } else {
      // 歩く: 体＋足
      const step = motion === 'move' ? (Math.sin(t * 12) > 0 ? 2 : -2) : 0;
      g.fillRect(left + 2, top + bob, w - 4, h - 6);
      g.fillStyle = body; g.fillRect(left + 3, top + 1 + bob, w - 6, h - 8);
      g.fillStyle = light; g.fillRect(left + 5, top + 3 + bob, Math.max(3, w / 4), 3);
      g.fillStyle = dark; g.fillRect(x - w / 4 - 2 + step, y - 7, 5, 7); g.fillRect(x + w / 4 - 2 - step, y - 7, 5, 7);
      this.eyes(g, x + facing * w * 0.22, top + h * 0.3 + bob, facing);
      if (atk) { g.fillStyle = '#ffffff'; g.fillRect(x + facing * (w / 2 + 2) - 2, top + h * 0.4, 6, 3); }
    }
    if (flags & 16) { // ボス: 冠
      g.fillStyle = '#ffd040';
      const cxw = Math.min(30, w / 2);
      g.fillRect(x - cxw / 2, top - 12, cxw, 6); for (let i = 0; i < 3; i++) g.fillRect(x - cxw / 2 + i * (cxw / 2) - 1, top - 17, 4, 6);
    }
    if (flags & 8) { g.fillStyle = '#ff70b0'; g.fillRect(x - 3, top - 12, 6, 5); }
    g.restore();
    if (fade > 0) return;
    // HP バー（被弾した後）と名前
    if (flags & 2 || flags & 16) {
      const bw = Math.max(36, Math.min(80, w));
      g.fillStyle = '#000'; g.fillRect(x - bw / 2 - 1, top - 9, bw + 2, 6);
      g.fillStyle = '#400'; g.fillRect(x - bw / 2, top - 8, bw, 4);
      g.fillStyle = '#ff3a3a'; g.fillRect(x - bw / 2, top - 8, Math.round(bw * Math.max(0, hp) / Math.max(1, maxHp)), 4);
    }
    if (!(flags & 4)) this.tag(g, (def.name || id) + ' Lv' + (def.lv || '?'), x, y + 3, flags & 64 ? '#ffd080' : '#ffffff');
  }

  eyes(g, x, y, facing) {
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 2, 4, 5); g.fillRect(x + 1, y - 2, 4, 5);
    g.fillStyle = '#101010'; g.fillRect(x - 3 + (facing > 0 ? 1 : 0), y, 2, 3); g.fillRect(x + 2 + (facing > 0 ? 1 : 0), y, 2, 3);
  }

  drawPet(g, p) {
    const x = Math.round(p[0]), y = Math.round(p[1]);
    g.fillStyle = '#5a3a20'; g.fillRect(x - 9, y - 14, 18, 14);
    g.fillStyle = '#d8a060'; g.fillRect(x - 8, y - 13, 16, 12);
    g.fillStyle = '#5a3a20'; g.fillRect(x - 8, y - 18, 4, 5); g.fillRect(x + 4, y - 18, 4, 5);
    this.eyes(g, x, y - 9, 1);
    this.tag(g, p[2], x, y + 2, '#c0f0ff');
  }

  drawPlayer(g, f, ui) {
    const p = f.p;
    const [x, y, motion, frame, right, visible, dead, akind] = p;
    const facing = right ? 1 : -1;
    if (dead) {
      // 墓石
      g.fillStyle = '#404048'; g.fillRect(x - 12, y - 30, 24, 30);
      g.fillStyle = '#9090a0'; g.fillRect(x - 10, y - 28, 20, 26);
      g.fillStyle = '#404048'; g.fillRect(x - 1, y - 24, 3, 14); g.fillRect(x - 6, y - 20, 13, 3);
      return;
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    if (p[9] <= 2) { g.fillRect(Math.round(x) - 8, Math.round(y) - 1, 17, 2); g.fillRect(Math.round(x) - 6, Math.round(y) - 2, 13, 4); }
    if (!visible) return;
    let anim = 'stand1', idx = frame;
    switch (motion) {
      case 'walk1': anim = 'walk1'; break;
      case 'jump': anim = 'jump'; idx = 0; break;
      case 'prone': anim = 'prone'; idx = 0; break;
      case 'rope': anim = 'rope'; break;
      case 'ladder': anim = 'ladder'; break;
      case 'alert': anim = 'alert'; break;
      case 'sit': anim = 'sit'; idx = 0; break;
      case 'swingO1': anim = ['swing', 'stab', 'shoot', 'throw', 'cast', 'punch'][akind] || 'swing'; idx = Math.min(2, frame); break;
      default: anim = 'stand1';
    }
    if (motion === 'sit') { g.fillStyle = '#7a4a20'; g.fillRect(Math.round(x) - 10, Math.round(y) - 12, 20, 12); g.fillStyle = '#b07840'; g.fillRect(Math.round(x) - 10, Math.round(y) - 14, 20, 3); }
    drawAvatar(g, this.look, anim, idx, x, y, facing);
    // 名前の札と、付けている勲章の札（頭の上）
    if (ui && ui.name) this.tag(g, ui.name, x, y + 2, '#ffffff');
    if (ui && ui.medal) this.medalTag(g, ui.medal, x, y - 92);
    // 武器（仮）: 手前の手から
    if (anim !== 'rope' && anim !== 'ladder' && ui && ui.weaponType && ui.weaponType !== '素手') this.drawWeapon(g, anim, idx, x, y, facing, ui.weaponType);
    // 攻撃の軌跡
    if (motion === 'swingO1' && idx >= 1) this.drawSwingFx(g, akind, idx, x, y, facing);
    // 状態異常（頭の上）
    const mask = p[8];
    if (mask) {
      const ST = [['毒', '#60c040'], ['気', '#ffe040'], ['暗', '#404040'], ['封', '#a060ff'], ['呪', '#802040'], ['弱', '#a0a0a0'], ['凍', '#80d0ff'], ['眠', '#8080ff'], ['遅', '#c08040'], ['変', '#ff80c0'], ['乱', '#ff8040']];
      const on = ST.filter((_, i) => mask & (1 << i));
      g.font = '10px sans-serif'; g.textBaseline = 'top';
      on.forEach(([ch, col], i) => {
        const bx = Math.round(x - on.length * 7 + i * 14), by = Math.round(y - 78);
        g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 14, 14); g.fillStyle = col; g.fillRect(bx, by, 12, 12);
        g.fillStyle = '#fff'; g.fillText(ch, bx + 1, by + 1);
      });
    }
  }

  drawWeapon(g, anim, idx, x, y, facing, type) {
    let fr;
    try { fr = getFrame(anim, idx); } catch { return; }
    const h = fr.armF?.h; if (!h) return;
    const hx = Math.round(x) + facing * h.x, hy = Math.round(y) + h.y - 2;
    // 刃の向き: 手と肩の向き
    const s = fr.armF.s || { x: 0, y: -27 };
    let dx = h.x - s.x, dy = h.y - s.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    let len = 18, col = '#e0e8f0', wdt = 3;
    if (/弓|クロスボウ/.test(type)) { g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.beginPath(); g.arc(hx + facing * 2, hy, 12, facing > 0 ? -1.2 : Math.PI - 1.2, facing > 0 ? 1.2 : Math.PI + 1.2); g.stroke(); return; }
    if (/銃/.test(type)) { g.fillStyle = '#404048'; g.fillRect(facing > 0 ? hx : hx - 12, hy - 2, 12, 4); return; }
    if (/クロー|ナックル/.test(type)) { g.fillStyle = '#c0c8d0'; g.fillRect(hx - 3, hy - 3, 7, 6); return; }
    if (/ワンド|スタッフ/.test(type)) { col = '#a0703a'; len = 20; wdt = 2; }
    if (/槍|矛/.test(type)) { len = 30; col = '#c0a070'; wdt = 2; }
    if (/短剣/.test(type)) len = 11;
    if (anim === 'stand1' || anim === 'walk1' || anim === 'alert' || anim === 'jump' || anim === 'sit') { dx = 0.35; dy = -1; const l2 = Math.hypot(dx, dy); dx /= l2; dy /= l2; }
    g.strokeStyle = '#303038'; g.lineWidth = wdt + 2;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + facing * dx * len, hy + dy * len); g.stroke();
    g.strokeStyle = col; g.lineWidth = wdt;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + facing * dx * len, hy + dy * len); g.stroke();
    g.fillStyle = '#7a4a20'; g.fillRect(hx - 2, hy - 2, 4, 4);
  }

  drawSwingFx(g, akind, idx, x, y, facing) {
    g.save();
    g.globalAlpha = idx === 1 ? 0.8 : 0.4;
    if (akind === 0 || akind === 5) { // 振り・殴り: 弧
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath();
      if (facing > 0) g.arc(x + 6, y - 28, 34, -1.3, 0.9); else g.arc(x - 6, y - 28, 34, Math.PI - 0.9, Math.PI + 1.3);
      g.stroke();
    } else if (akind === 1) { // 突き
      g.fillStyle = '#ffffff'; g.fillRect(facing > 0 ? x + 14 : x - 54, y - 24, 40, 3);
    } else if (akind === 4) { // 詠唱
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#a0e0ff' : '#ffffff'; const a = this.time * 6 + i; g.fillRect(x + Math.cos(a) * 18 - 2, y - 30 + Math.sin(a) * 18 - 2, 4, 4); }
    }
    g.restore();
  }

  drawProjectiles(g, f) {
    for (const p of f.pr) {
      g.fillStyle = '#401000'; g.fillRect(Math.round(p[0]) - 6, Math.round(p[1]) - 6, 12, 12);
      g.fillStyle = '#ff9030'; g.fillRect(Math.round(p[0]) - 5, Math.round(p[1]) - 5, 10, 10);
      g.fillStyle = '#ffe080'; g.fillRect(Math.round(p[0]) - 2, Math.round(p[1]) - 2, 4, 4);
    }
  }

  // 予兆（ShowWarning）: 赤い四角が濃くなる。当たった後は白く光る
  drawHazards(g, f, cx, cy, top) {
    for (const h of f.hz) {
      const [kind, x1, y1, x2, y2, prog, flags, name, safe] = h;
      if (flags & 1) continue;
      if (!(flags & 2)) continue;
      if (top) {
        if (flags & 4) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x1, y1, x2 - x1, y2 - y1); }
        continue;
      }
      g.fillStyle = `rgba(255,40,40,${0.12 + 0.3 * prog})`; g.fillRect(x1, y1, x2 - x1, y2 - y1);
      g.strokeStyle = 'rgba(255,60,60,0.9)'; g.lineWidth = 1; g.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1 - 1, y2 - y1 - 1);
      g.fillStyle = 'rgba(255,220,80,0.8)'; g.fillRect(x1, y2 - 3, (x2 - x1) * prog, 3);
      for (let i = 0; i < safe.length; i += 2) { g.fillStyle = 'rgba(80,255,120,0.3)'; g.fillRect(safe[i], cy, safe[i + 1] - safe[i], VIEW_H); }
    }
  }

  drawGlobalHazards(g, f) {
    for (const h of f.hz) {
      if (!(h[6] & 1)) continue;
      const prog = h[5];
      g.fillStyle = `rgba(255,30,30,${0.08 + 0.25 * prog})`;
      g.fillRect(0, 0, VIEW_W, 10); g.fillRect(0, VIEW_H - HUD_H - 10, VIEW_W, 10); g.fillRect(0, 0, 10, VIEW_H); g.fillRect(VIEW_W - 10, 0, 10, VIEW_H);
      g.font = 'bold 14px sans-serif'; g.fillStyle = '#ffd0d0'; g.textAlign = 'center';
      g.fillText('⚠ ' + (h[7] || '大技') + (h[6] & 8 ? '（跳べばよけられる）' : ''), VIEW_W / 2, 70);
      g.textAlign = 'left';
      for (let i = 0; i < h[8].length; i += 2) { g.fillStyle = 'rgba(80,255,120,0.3)'; g.fillRect(h[8][i] - this.cam.x, 0, h[8][i + 1] - h[8][i], VIEW_H); }
    }
  }

  // ---------------- ダメージの数字（クラシック風: 同じ攻撃の数字は下から上へ積む）
  addNums(f) {
    for (const d of f.dm) {
      const [kind, value, x, y, stack, delay] = d;
      this.nums.push({ kind, value, x, y: y - stack * 18, delay, t: 0 });
    }
  }

  drawNums(g, dt) {
    const keep = [];
    for (const n of this.nums) {
      if (n.delay > 0) { n.delay -= dt; keep.push(n); continue; }
      n.t += dt;
      if (n.t > 1.4) continue;
      keep.push(n);
      const rise = Math.min(30, n.t * 40);
      const a = n.t < 0.9 ? 1 : Math.max(0, 1 - (n.t - 0.9) / 0.5);
      const [fill, edge] = DMG_COL[n.kind] || DMG_COL[0];
      const text = n.kind === 5 ? 'MISS' : (n.kind === 3 || n.kind === 4 ? '+' : '') + n.value;
      const big = n.kind === 1 ? 3 : 2;
      const img = glyphs(text, fill, edge, big);
      g.globalAlpha = a;
      g.drawImage(img, Math.round(n.x - img.width / 2), Math.round(n.y - 20 - rise));
      if (n.kind === 1) { g.fillStyle = '#ffe040'; g.fillRect(Math.round(n.x - img.width / 2) - 6, Math.round(n.y - 16 - rise), 5, 5); }
      g.globalAlpha = 1;
    }
    this.nums = keep;
  }

  addFx(kind, x, y, text) { this.fx.push({ kind, x, y, text, t: 0 }); }

  drawFx(g, dt) {
    const keep = [];
    for (const e of this.fx) {
      e.t += dt;
      const dur = e.kind === 'level' ? 2.2 : 1.5;
      if (e.t > dur) continue;
      keep.push(e);
      const a = Math.max(0, 1 - e.t / dur);
      if (e.kind === 'level' || e.kind === 'job') {
        g.fillStyle = e.kind === 'job' ? `rgba(255,200,255,${0.5 * a})` : `rgba(255,240,140,${0.5 * a})`;
        g.fillRect(e.x - 18, e.y - 200, 36, 200);
        g.fillStyle = `rgba(255,255,255,${0.7 * a})`; g.fillRect(e.x - 6, e.y - 200, 12, 200);
        g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
        g.fillStyle = `rgba(80,40,0,${a})`; g.fillText(e.text, e.x + 1, e.y - 100 - e.t * 10 + 1);
        g.fillStyle = `rgba(255,230,80,${a})`; g.fillText(e.text, e.x, e.y - 100 - e.t * 10);
        g.textAlign = 'left';
      } else if (e.kind === 'card' || e.kind === 'medal') {
        g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
        g.fillStyle = `rgba(60,30,0,${a})`; g.fillText(e.text, e.x + 1, e.y - 80 - e.t * 20 + 1);
        g.fillStyle = e.kind === 'medal' ? `rgba(255,220,80,${a})` : `rgba(255,250,200,${a})`; g.fillText(e.text, e.x, e.y - 80 - e.t * 20);
        g.textAlign = 'left';
      } else if (e.kind === 'text') {
        g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
        g.fillStyle = `rgba(255,255,255,${a})`; g.fillText(e.text, e.x, e.y - 70 - e.t * 20);
        g.textAlign = 'left';
      }
    }
    this.fx = keep;
  }

  drawMinimap(g, f, ui) {
    if (ui && ui.hideMinimap) return;
    const m = this.map;
    const W = 160, H = Math.max(50, Math.min(110, Math.round(160 * m.height / m.width)));
    const sx = W / m.width, sy = H / m.height;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(4, 4, W + 4, H + 20);
    g.font = '11px sans-serif'; g.fillStyle = '#fff'; g.textBaseline = 'top';
    g.fillText(m.name, 8, 6);
    const ox = 6, oy = 22;
    g.fillStyle = 'rgba(200,200,200,0.8)';
    for (const fh of m.footholds) {
      const p = fh.points;
      g.fillRect(ox + p[0][0] * sx, oy + p[0][1] * sy, Math.max(1, (p[p.length - 1][0] - p[0][0]) * sx), 1);
    }
    g.fillStyle = '#80c0ff';
    for (const p of m.portals) if (p.type === 'visible') g.fillRect(ox + p.x * sx - 1, oy + p.y * sy - 3, 3, 3);
    // NPC の点: ふつうは緑、受けられるクエストは黄色（大きめ）、報告できるクエストは白く光る
    for (const n of m.npcs) {
      const b = this.bulbs[n.id];
      const x = ox + n.x * sx, y = oy + n.y * sy;
      if (b === 2) { g.fillStyle = '#4a3a00'; g.fillRect(x - 3, y - 6, 7, 7); g.fillStyle = '#fffbd0'; g.fillRect(x - 2, y - 5, 5, 5); }
      else if (b === 1) { g.fillStyle = '#3a2400'; g.fillRect(x - 3, y - 6, 7, 7); g.fillStyle = '#ffd820'; g.fillRect(x - 2, y - 5, 5, 5); }
      else { g.fillStyle = '#70ff70'; g.fillRect(x - 1, y - 3, 3, 3); }
    }
    g.fillStyle = '#ffe040';
    g.fillRect(ox + f.p[0] * sx - 2, oy + f.p[1] * sy - 4, 4, 4);
  }

  drawBossBar(g, bb) {
    const [name, lv, ratio, phase, count, phaseName, cast, castProg, guarded, submerged] = bb;
    const W = 420, x = 186, y = 10;
    const cols = ['#ff4040', '#ff9030', '#ffe040', '#c060ff', '#40c0ff'];
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - 4, y - 4, W + 8, 30);
    g.fillStyle = '#300'; g.fillRect(x, y + 12, W, 10);
    g.fillStyle = cols[phase % cols.length]; g.fillRect(x, y + 12, Math.round(W * ratio), 10);
    for (let i = 1; i < count; i++) { g.fillStyle = '#000'; g.fillRect(x + Math.round(W * (1 - i / count)), y + 12, 1, 10); }
    g.font = 'bold 11px sans-serif'; g.fillStyle = '#fff'; g.textBaseline = 'top';
    g.fillText(`Lv${lv} ${name}　${phaseName || ''}${count > 1 ? `（${phase + 1}/${count}）` : ''}${guarded ? '　守られている' : ''}${submerged ? '　潜っている' : ''}`, x, y - 1);
    g.textAlign = 'right'; g.fillText(Math.round(ratio * 1000) / 10 + '%', x + W, y - 1); g.textAlign = 'left';
    if (cast) {
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x + 100, y + 28, W - 200, 14);
      g.fillStyle = '#c080ff'; g.fillRect(x + 102, y + 30, (W - 204) * castProg, 10);
      g.fillStyle = '#fff'; g.fillText(cast, x + 106, y + 29);
    }
  }

  drawRoomTimer(g, t) {
    const s = Math.max(0, Math.ceil(t)); const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(VIEW_W / 2 - 50, 52, 100, 22);
    g.font = 'bold 15px monospace'; g.fillStyle = s < 60 ? '#ff8080' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(`残り ${mm}:${ss}`, VIEW_W / 2, 55); g.textAlign = 'left';
  }
}

export function itemColor(it) {
  if (!it) return '#888';
  if (it.tab === 'equip') {
    const s = it.slot || '';
    return s === 'weapon' ? '#c0c8e0' : s === 'cap' ? '#80a0e0' : s === 'top' || s === 'overall' ? '#6080d0' : s === 'bottom' ? '#5060a0' : s === 'shoes' ? '#a07040' : '#9090c0';
  }
  if (it.tab === 'use') {
    if (/赤|red/.test(it.name + it.id)) return '#e04040';
    if (/青|blue/.test(it.name + it.id)) return '#4060e0';
    if (it.scroll) return '#e8e0b0';
    if (it.ammo) return '#c0c0c0';
    return '#e0a040';
  }
  if (it.tab === 'setup') return '#a06030';
  if (it.tab === 'special') return '#c060c0';
  return '#a08060';
}

/** 敵の仮の色（描く時と同じ: ID の hash の色相）。図鑑の窓・カードの絵で使う */
export function mobColor(def) {
  const id = def?.id || '';
  return `hsl(${hash(id) % 360},55%,55%)`;
}
