// 納品画像の検査（tools/check_art.mjs）・テスト用のページ（キャラ以外）: window.ARTENV
//   setup(manifestUrl) → manifest を読み込み、bg / tiles / icons / vehicles / ui の画像を先読み → { stats }
//   scene({ region, town, v, clock, camX, camY, w, h }) → 背景＋地面・足場（ゲームと同じ drawBackground / drawMapTiles）の dataURL
//   sheet(kind) → 'bg' | 'icons' | 'vehicles' | 'ui' の一覧（dataURL）
//   time(o, n) → 背景＋地面を n 回描いた 1 回あたりの ms
import { loadSpriteManifest, setSpriteMode } from '../src/render/sprites.js';
import { preloadArt, artStats, _artInternal } from '../src/render/artOverrides.js';
import { drawBackground, drawMapTiles, _clearBackgroundCache } from '../src/render/background.js';
import { drawItemIcon, drawSkillIcon } from '../src/render/icons.js';
import { drawVehicle } from '../src/render/vehicles.js';
import { ITEMS } from '../src/data/items.js';
import { SKILLS } from '../src/data/skills.js';

const W = 1280, H = 720;
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function label(g, s, x, y, size = 14, col = '#fff') { g.save(); g.font = `bold ${size}px sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); g.restore(); }

/** テスト用の地図（地面 groundY=1000、足場3枚） */
export function demoMap(region, town, v, clock) {
  return {
    id: '__artenv_' + region + (town ? '_t' : '_f') + (v ?? 0), region, theme: region, town: !!town, variant: v ?? 0, _clock: clock ?? 17,
    width: 4000, height: 1160, groundY: 1000,
    platforms: [{ x: 300, y: 860, w: 300 }, { x: 760, y: 760, w: 240 }, { x: 1120, y: 880, w: 360 }],
  };
}
function scene(o = {}) {
  const w = o.w || W, h = o.h || H;
  const c = mk(w, h), g = c.getContext('2d');
  const map = demoMap(o.region || 'beach', o.town, o.v, o.clock);
  const cam = { x: o.camX ?? 0, y: o.camY ?? (map.groundY + 160 - h) };
  drawBackground(g, map, cam, w, h, o.t || 0);
  g.save(); g.translate(-cam.x, -cam.y); drawMapTiles(g, map, o.t || 0); g.restore();
  return c;
}
window.ARTENV = {
  ready: true,
  W, H,
  async setup(url) {
    setSpriteMode('auto');
    await loadSpriteManifest(url);
    await preloadArt();
    _clearBackgroundCache();
    return { stats: artStats() };
  },
  stats: () => artStats(),
  setMode: (m) => setSpriteMode(m),
  scene(o) { return scene(o).toDataURL('image/png'); },
  /** 画面の画素（テスト用）: [[x, y], ...] → [[r, g, b, a], ...] */
  pixels(o, pts) { const g = scene(o).getContext('2d'); return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data]); },
  time(o, n = 60) {
    const c = mk(W, H), g = c.getContext('2d');
    const map = demoMap(o.region || 'beach', o.town, o.v, o.clock);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const cam = { x: i * 7, y: map.groundY + 160 - H };
      drawBackground(g, map, cam, W, H, i / 60);
      g.save(); g.translate(-cam.x, -cam.y); drawMapTiles(g, map, i / 60); g.restore();
    }
    g.getImageData(0, 0, 1, 1);
    return (performance.now() - t0) / n;
  },
  sheet(kind, opts = {}) {
    const M = _artInternal().MAN || {};
    if (kind === 'bg') {
      // 地域 × 町/フィールド（manifest に mid か地面がある物）: 夕方・夜 の2枚を横に（各 640×360）
      const rows = [];
      for (const k of Object.keys(M.bg || {})) { const m = /^([a-z]+)_(town|field)_mid$/.exec(k); if (m) rows.push([m[1], m[2] === 'town']); }
      for (const k of Object.keys(M.tiles || {})) { const m = /^([a-z]+)_(ground|platform)$/.exec(k); if (m && !rows.some((r) => r[0] === m[1])) rows.push([m[1], false]); }
      const out = mk(1280, Math.max(1, rows.length) * 360), g = out.getContext('2d');
      rows.forEach(([region, town], i) => {
        [17, 22].forEach((clock, j) => {
          g.drawImage(scene({ region, town, clock, camX: opts.camX ?? 200 }), j * 640, i * 360, 640, 360);
          label(g, `${region} ${town ? '町' : 'フィールド'} ${clock}時`, j * 640 + 10, i * 360 + 22);
        });
      });
      return out.toDataURL('image/png');
    }
    if (kind === 'icons') {
      const list = [];
      for (const k of Object.keys(M.icons || {})) {
        let m;
        if ((m = /^equip\/([a-z]+)_([A-Za-z0-9]+)$/.exec(k))) {
          const its = Object.values(ITEMS).filter((it) => it.type === 'equip' && it.slot === m[1] && it.look && it.look.style === m[2]).slice(0, 3);
          if (!its.length) its.push({ id: k, type: 'equip', slot: m[1], look: { style: m[2], color: '#cccccc', accent: '#ffffff' } });
          for (const it of its) list.push(['i', it, it.name || k]);
        } else if ((m = /^item\/(.+)$/.exec(k))) list.push(['i', ITEMS[m[1]] || { id: m[1], type: 'etc' }, m[1]]);
        else if ((m = /^skill\/(.+)$/.exec(k))) list.push(['s', SKILLS[m[1]] || { id: m[1], kind: 'buff', color: '#ff5fa2' }, m[1]]);
      }
      const cols = 8, cw = 160, ch = 112;
      const out = mk(cols * cw, Math.max(1, Math.ceil(list.length / cols)) * ch), g = out.getContext('2d');
      g.fillStyle = '#2b2638'; g.fillRect(0, 0, out.width, out.height);
      list.forEach(([t, o, name], i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 4, y + 4, cw - 8, ch - 8);
        if (t === 'i') { drawItemIcon(g, o, x + 46, y + 44, 64); drawItemIcon(g, o, x + 112, y + 52, 32); }
        else { drawSkillIcon(g, o, x + 46, y + 44, 64); drawSkillIcon(g, o, x + 112, y + 52, 32); }
        label(g, String(name).slice(0, 16), x + 8, y + ch - 12, 11);
      });
      return out.toDataURL('image/png');
    }
    if (kind === 'vehicles') {
      const kinds = [...new Set(Object.keys(M.vehicles || {}).map((k) => k.replace(/_wheel$/, '')))];
      const out = mk(1280, Math.max(1, kinds.length) * 200), g = out.getContext('2d');
      g.fillStyle = '#3a3448'; g.fillRect(0, 0, out.width, out.height);
      kinds.forEach((kind, i) => {
        const y = i * 200 + 150;
        g.fillStyle = '#5a5470'; g.fillRect(0, y, 1280, 4);
        const cols = kind === 'police' ? [null] : ['#ff2e88', '#19d3c5', '#ffd166'];
        let x = 130;
        for (const facing of [1, -1]) for (const color of cols) {
          g.save(); g.translate(x, y); g.scale(1.4, 1.4);
          drawVehicle(g, { kind, x: 0, y: 0, facing, color: color || undefined, speed: 0, t: 0.3 + x / 100 });
          g.restore();
          x += kind === 'bike' ? 190 : 210;
        }
        label(g, kind, 10, i * 200 + 24);
      });
      return out.toDataURL('image/png');
    }
    if (kind === 'ui') {
      const I = _artInternal().IMG, keys = Object.keys(M.ui || {});
      const out = mk(1280, 360 * Math.max(1, Math.ceil(keys.length / 2))), g = out.getContext('2d');
      g.fillStyle = '#1a0b3d'; g.fillRect(0, 0, out.width, out.height);
      keys.forEach((k, i) => {
        const r = I.get(M.ui[k].file); const x = (i % 2) * 640, y = Math.floor(i / 2) * 360;
        if (r && r.st === 2) { const s = Math.min(620 / r.w, 340 / r.h); g.drawImage(r.img, x + (640 - r.w * s) / 2, y + (360 - r.h * s) / 2, r.w * s, r.h * s); }
        label(g, k, x + 10, y + 22);
      });
      return out.toDataURL('image/png');
    }
    return null;
  },
};
