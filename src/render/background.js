// 背景（スクリーン空間・多層パララックス）とマップタイル（ワールド空間）
// - 地域 map.region（未設定なら map.theme）× map.variant(0〜3)／町 map.town でシーンを切替
// - 静的レイヤーは決定論的乱数で生成しオフスクリーンにキャッシュ（シーン単位 LRU・上限あり）
// - 昼夜: map._clock（0〜24, 未定義=17時）で空・色調・窓明かり/ネオン・星を変える
import { shade, rgba, rng, hashStr, rr, starPath, makeCanvas, lerp, mix, mixW, clamp, OUTLINE } from './util.js';
import { drawDecor } from './decor.js';
import { drawScene } from './bgScenes.js';
import { drawSpecial, specialOf, specialTile } from './bgSpecial.js';

const PI = Math.PI;
const LW = 1024;

// ================================================================ シーン解決
export const REGIONS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop', 'spaceport'];
// SPEC_V2 のマップID → 地域内バリアント（ID が既知ならこちらを優先、未知なら map.variant）
const ID_VARIANT = {
  beach_f1: 0, beach_f2: 1, beach_f3: 2, beach_f4: 3,
  down_f1: 0, down_f2: 1, down_f3: 2, down_f4: 3,
  slums_f1: 0, slums_f2: 1, slums_f3: 2, slums_f4: 3,
  swamp_f1: 0, swamp_f2: 1, swamp_f3: 2, swamp_f4: 3,
  casino_f1: 0, casino_f2: 1, casino_f3: 2, casino_f4: 3,
  tower_f1: 0, tower_f2: 1, tower_f3: 2,
  space_f1: 0, space_f2: 1, space_f3: 2, space_f4: 3,
};
const INDOOR = { 'downtown:1': 1, 'casino:1': 1, 'casino:2': 1, 'rooftop:2': 1, 'spaceport:2': 1, 'spaceport:3': 1 };
const sceneMemo = new WeakMap();
export function sceneOf(map) {
  if (!map) return { region: 'beach', v: 0, town: false, id: '' };
  let s = sceneMemo.get(map);
  if (s && s.r0 === map.region && s.t0 === map.theme && s.v0 === map.variant && s.w0 === map.town && s.i0 === map.instance && s.f0 === map.floor && s.b0 === map.bossId) return s;
  const sp = specialOf(map);
  if (sp) {
    s = { region: sp.kind, v: sp.v, town: false, id: map.id || '', indoor: true, special: sp, r0: map.region, t0: map.theme, v0: map.variant, w0: map.town, i0: map.instance, f0: map.floor, b0: map.bossId };
    s.tile = specialTile(map);
    sceneMemo.set(map, s);
    return s;
  }
  let region = map.region || map.theme;
  if (REGIONS.indexOf(region) < 0) region = map.theme && REGIONS.indexOf(map.theme) >= 0 ? map.theme : 'beach';
  const town = !!map.town;
  let v = ID_VARIANT[map.id];
  if (v == null) v = ((map.variant | 0) % 4 + 4) % 4;
  // v1 互換（region/variant 未設定の旧マップ）: カジノ・屋上は従来の見た目
  if (!map.region && map.variant == null && ID_VARIANT[map.id] == null && (region === 'rooftop' || region === 'casino')) v = 3;
  s = { region, v, town, id: map.id || '', indoor: !town && !!INDOOR[region + ':' + v], r0: map.region, t0: map.theme, v0: map.variant, w0: map.town, i0: map.instance, f0: map.floor, b0: map.bossId };
  sceneMemo.set(map, s);
  return s;
}

// ================================================================ レイヤーキャッシュ（シーン単位 LRU）
const MAX_SCENES = 3;
const sceneCache = new Map(); // key -> Map(name -> {img, glow})
function sceneLayers(key) {
  let m = sceneCache.get(key);
  if (m) { sceneCache.delete(key); sceneCache.set(key, m); return m; }
  m = new Map();
  sceneCache.set(key, m);
  while (sceneCache.size > MAX_SCENES) {
    const k = sceneCache.keys().next().value;
    const old = sceneCache.get(k);
    for (const L of old.values()) { if (L.img) { L.img.width = 1; L.img.height = 1; } if (L.glow) { L.glow.width = 1; L.glow.height = 1; } }
    sceneCache.delete(k);
  }
  return m;
}
function buildLayer(h, paint) {
  const img = makeCanvas(LW, h);
  const g = img.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  let glow = null, gctx = null;
  const P = {
    g, h, w: LW,
    get gl() {
      if (!gctx) { glow = makeCanvas(LW, h); gctx = glow.getContext('2d'); gctx.lineJoin = 'round'; gctx.lineCap = 'round'; }
      return gctx;
    },
  };
  try { paint(P); } catch (e) { console.warn('[background] layer paint failed', e); }
  return { img, glow, h };
}

// ================================================================ 時間帯
// 0〜24 時 → {dawn, day, dusk, night} の重み（合計1）
const TOD_KEYS = [[0, 'night'], [4.6, 'night'], [6, 'dawn'], [7.6, 'day'], [16.2, 'day'], [17.6, 'dusk'], [19.2, 'dusk'], [20.4, 'night'], [24, 'night']];
const TODW = { dawn: 0, day: 0, dusk: 0, night: 0 };
export function todWeights(clock, out) {
  out = out || { dawn: 0, day: 0, dusk: 0, night: 0 };
  let c = clock == null || isNaN(clock) ? 17 : ((clock % 24) + 24) % 24;
  out.dawn = out.day = out.dusk = out.night = 0;
  for (let i = 0; i < TOD_KEYS.length - 1; i++) {
    const [h0, a] = TOD_KEYS[i], [h1, b] = TOD_KEYS[i + 1];
    if (c >= h0 && c <= h1) { const k = h1 > h0 ? (c - h0) / (h1 - h0) : 0; out[a] += 1 - k; out[b] += k; break; }
  }
  return out;
}
const TOD_SKY = {
  dawn: ['#3b3b86', '#9a7ad0', '#ffb3c8', '#ffe2c8'],
  day: ['#2e7fe0', '#5aaef0', '#9ad8ff', '#e0f6ff'],
  dusk: ['#4a2280', '#ff5f8f', '#ffa86b', '#ffd98e'],
  night: ['#05061c', '#0e1240', '#241e5a', '#3a2a6a'],
};
// 地域の空の味付け（25% 混ぜる）
const REGION_SKY = {
  beach: ['#5b2a86', '#ff6f91', '#ffb86b', '#ffd98e'],
  downtown: ['#140a2e', '#3b1660', '#c2387a', '#ff6f91'],
  slums: ['#3a2340', '#8c4a4a', '#e08a4f', '#f2b06a'],
  swamp: ['#1e2b3a', '#3f5e5a', '#a8a86a', '#d8bd80'],
  casino: ['#0e0620', '#2a0b4a', '#6a1a6e', '#a02a7a'],
  rooftop: ['#07051a', '#1e1450', '#5a2d82', '#ff6f91'],
  spaceport: ['#0a1430', '#1c3a7a', '#4a7ab8', '#ffb07a'],
};
// 色調補正（source-atop で背景レイヤーに重ねる）
const TOD_TINT = { dawn: ['#ff9ac8', 0.2], day: ['#c4dcf4', 0.32], dusk: ['#ff6a3a', 0.12], night: ['#0a0e3a', 0.5] };
const TOD_LIGHTS = { dawn: 0.35, day: 0.06, dusk: 0.75, night: 1 };

function weighted(table, w) {
  const keys = ['dawn', 'day', 'dusk', 'night'];
  const cols = [], ws = [];
  let a = 0;
  for (const k of keys) { cols.push(table[k][0]); ws.push(w[k] * table[k][1]); a += w[k] * table[k][1]; }
  return [mixW(cols, ws), a];
}

let glowBuf = null, glowCtx = null, glowKey = '', glowHad = false;
const GLOW_SCALE = 0.5;
const framePost = [];

// ================================================================ drawBackground
export function drawBackground(ctx, map, cam, W, H, time) {
  const sc = sceneOf(map);
  cam = cam || { x: 0, y: 0 };
  W = W || 1280; H = H || 720;
  time = time || 0;
  const clock = map && map._clock != null ? map._clock : 17;
  const w = todWeights(clock, TODW);
  const groundY = (map && map.groundY) || 1000;
  const gS = groundY - cam.y;
  const horizon = lerp(H * 0.78, gS - 120, 0.25);
  const key = sc.region + ':' + (sc.town ? 't' : sc.v) + ':' + (sc.town ? sc.v : '') + (sc.special && sc.special.kind === 'tower' ? ':' + (sc.special.floor % 10 === 0 ? 'b' : '') : '');
  const layers = sceneLayers(key);
  let lights = 0;
  for (const k in TOD_LIGHTS) lights += w[k] * TOD_LIGHTS[k];
  if (sc.indoor) lights = 0.9;
  // 太陽・月の位置
  const sunP = (clock - 5.6) / 14, moonP = ((clock - 18.4 + 24) % 24) / 12;
  const sunUp = sunP > 0 && sunP < 1 ? Math.min(1, Math.sin(sunP * PI) * 4) : 0;
  const moonUp = moonP > 0 && moonP < 1 ? Math.min(1, Math.sin(moonP * PI) * 4) : 0;
  const skyTop = 40;
  const sunX = lerp(0.12, 0.88, clamp(sunP, 0, 1)) * W - cam.x * 0.02;
  const sunY = horizon - Math.sin(clamp(sunP, 0, 1) * PI) * (horizon - skyTop - 60) - 10;
  const moonX = lerp(0.85, 0.15, clamp(moonP, 0, 1)) * W - cam.x * 0.02;
  const moonY = horizon - Math.sin(clamp(moonP, 0, 1) * PI) * (horizon - skyTop - 80) - 20;
  const sunAlt = Math.sin(clamp(sunP, 0, 1) * PI);
  const sunCol = mix('#ff8a4a', '#fff4d0', clamp(sunAlt * 1.6, 0, 1));
  framePost.length = 0;
  // 光バッファ（画面サイズ1枚を使い回し）
  // 性能: 光バッファは半解像度（柔らかい光なので見た目はほぼ同じで塗り面積 1/4）。
  //       昼間（lights が小さい）は寄与がほぼ無いので省略する
  let gb = null, hasGlow = false, reuse = false;
  if (lights > 0.1) {
    // カメラ・シーンが前フレームと同じなら光バッファを作り直さない（静止中の負荷を削減）
    const gk = key + '|' + cam.x + '|' + cam.y + '|' + W + 'x' + H;
    reuse = !!glowBuf && glowKey === gk;
    glowKey = gk;
  } else glowKey = '';
  if (lights > 0.1 && reuse) { gb = null; hasGlow = glowHad; } else if (lights > 0.1) {
    const gw = Math.ceil(W * GLOW_SCALE), gh = Math.ceil(H * GLOW_SCALE);
    if (!glowBuf || glowBuf.width !== gw || glowBuf.height !== gh) { glowBuf = makeCanvas(gw, gh); glowCtx = glowBuf.getContext('2d'); }
    gb = glowCtx;
    gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'source-over'; gb.clearRect(0, 0, gw, gh); gb.fillStyle = '#000';
    gb.setTransform(GLOW_SCALE, 0, 0, GLOW_SCALE, 0, 0);
  }
  const S = {
    ctx, cam, W, H, time, gS, horizon, v: sc.v, town: sc.town, region: sc.region, id: sc.id, w, lights, indoor: sc.indoor,
    sunX, sunY, sunUp, sunCol, moonX, moonY, moonUp,
    layer(name, h, paint) {
      let L = layers.get(name);
      if (!L) { L = buildLayer(h, paint); layers.set(name, L); }
      return L;
    },
    tile(L, f, bottomY, fillBelow) {
      const lh = L.h;
      const off = -(((cam.x * f) % LW) + LW) % LW;
      const y = Math.round(bottomY - lh);
      for (let x = off; x < W; x += LW) ctx.drawImage(L.img, Math.round(x), y);
      if (fillBelow && bottomY < H) { ctx.fillStyle = fillBelow; ctx.fillRect(0, bottomY - 1, W, H - bottomY + 1); }
      // 光バッファ: 手前のレイヤーで奥の光を隠し、自分の光を足す
      if (gb) {
        gb.globalCompositeOperation = 'destination-out';
        for (let x = off; x < W; x += LW) gb.drawImage(L.img, Math.round(x), y);
        if (fillBelow && bottomY < H) gb.fillRect(0, bottomY - 1, W, H - bottomY + 1);
        if (L.glow) {
          gb.globalCompositeOperation = 'lighter';
          for (let x = off; x < W; x += LW) gb.drawImage(L.glow, Math.round(x), y);
          hasGlow = true;
        }
      }
    },
    /** ライブで描いた不透明物（柱など）で奥の光を隠す */
    occlude(x, y, w, h) { if (gb) { gb.globalCompositeOperation = 'destination-out'; gb.fillRect(x, y, w, h); } },
    post(fn) { framePost.push(fn); },
  };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  try { if (!(sc.special && drawSpecial(ctx, S, map))) drawScene(ctx, S); } catch (e) { console.warn('[background] scene failed', e); }
  // 色調補正（描いた部分だけ）
  let [tc, ta] = weighted(TOD_TINT, w);
  if (S.indoor) ta *= 0.25;
  if (ta > 0.01) { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = Math.min(0.85, ta); ctx.fillStyle = tc; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.globalCompositeOperation = 'source-over';
  // 窓明かり・ネオン（夜ほど強い）
  if (gb) glowHad = hasGlow;
  if ((gb || reuse) && hasGlow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, lights);
    ctx.drawImage(glowBuf, 0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  for (const fn of framePost) { ctx.save(); try { fn(); } catch (e) { console.warn('[background] post failed', e); } ctx.restore(); }
  // 空（描画済みの後ろへ: destination-over。手前→奥の順に描く）
  ctx.globalCompositeOperation = 'destination-over';
  if (moonUp > 0) drawMoon(ctx, moonX, moonY, 34, moonUp, sc.region);
  if (sunUp > 0) drawSun(ctx, sunX, sunY, lerp(95, 60, sunAlt), sunCol, sunUp, sunAlt < 0.35, time);
  const starA = clamp(w.night + w.dawn * 0.25 + w.dusk * 0.3, 0, 1) * (sc.region === 'downtown' || sc.region === 'casino' ? 0.6 : 1);
  if (starA > 0.02) drawStars(ctx, sc.region, 140, W, H, time, cam, starA);
  const skyB = Math.max(H * 0.4, horizon + 40);
  const sky = ctx.createLinearGradient(0, Math.min(0, skyB - H), 0, skyB);
  const rs = REGION_SKY[sc.region] || REGION_SKY.downtown;
  const keys = ['dawn', 'day', 'dusk', 'night'];
  const ws = keys.map((k) => w[k]);
  for (let i = 0; i < 4; i++) {
    const c = mixW(keys.map((k) => TOD_SKY[k][i]), ws);
    sky.addColorStop([0, 0.45, 0.82, 1][i], mix(c, rs[i], 0.32 + w.night * 0.12));
  }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawStars(ctx, theme, n, W, H, time, cam, a) {
  const R = rng(hashStr(theme + 'stars'));
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    const x = ((R() * (W + 200) - cam.x * 0.01) % (W + 200) + W + 200) % (W + 200) - 100;
    const y = R() * H * 0.55;
    const s = R() < 0.1 ? 2 : 1;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (0.5 + R() * 2) + i));
    ctx.globalAlpha = a * tw * (1 - y / (H * 0.6));
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

// destination-over 用（光彩→本体の順＝奥から見て本体が手前）
function drawMoon(ctx, x, y, r, a, theme) {
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.5, r * 0.18, PI * 1.1, PI * 1.6); ctx.lineTo(x - r * 0.25, y - r * 0.5); ctx.fill();
  ctx.fillStyle = 'rgba(180,160,220,0.3)';
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.15, r * 0.2, 0, PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.35, r * 0.13, 0, PI * 2); ctx.fill();
  ctx.fillStyle = theme === 'swamp' ? '#f2f0d0' : '#f5eeff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3);
  g.addColorStop(0, rgba('#b47cff', 0.35)); g.addColorStop(1, rgba('#b47cff', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawSun(ctx, x, y, r, col, a, stripes, time) {
  ctx.globalAlpha = a;
  if (stripes) {
    // レトロな横縞（夕日・朝日のみ）: 縞を背景色で抜く代わりに、縞部分は後ろの空が見えるよう本体を分割して描く
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.clip();
    const sg = ctx.createLinearGradient(0, y - r, 0, y + r); sg.addColorStop(0, mix(col, '#fff4d0', 0.5)); sg.addColorStop(1, shade(col, -0.1));
    ctx.fillStyle = sg;
    let yy = y - r;
    const cut = [];
    for (let i = 0; i < 7; i++) cut.push([y + r * 0.05 + i * r * 0.15 + ((time * 6) % (r * 0.15)), 2 + i * 1.3]);
    for (const [cy, ch] of cut) { if (cy > yy) ctx.fillRect(x - r, yy, r * 2, cy - yy); yy = cy + ch; }
    ctx.fillRect(x - r, yy, r * 2, y + r - yy);
    ctx.restore();
  } else {
    const sg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, col);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, PI * 2); ctx.fill();
  }
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.6);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

// ================================================================ drawNightOverlay（スクリーン空間・HUD の前）
// focus: 明るく残す中心（スクリーン座標 {x,y}）。省略時は map._focus、なければ画面中央やや下。
export function drawNightOverlay(ctx, map, W, H, focus) {
  W = W || 1280; H = H || 720;
  const clock = map && map._clock != null ? map._clock : 17;
  const w = todWeights(clock, {});
  const sc = sceneOf(map);
  const f = focus || (map && map._focus) || { x: W / 2, y: H * 0.6 };
  ctx.save();
  // 朝・夕の色かぶり
  const warm = w.dusk * 0.18, pink = w.dawn * 0.14;
  if (warm + pink > 0.01) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = mixW(['#ffb080', '#ffc0dc'], [warm, pink]);
    ctx.globalAlpha = Math.min(0.5, (warm + pink) * 1.6);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  // 夜: 青い暗がり＋周辺減光（中心=プレイヤー周りは明るく）
  const n = w.night + w.dusk * 0.25 + w.dawn * 0.15;
  const k = sc.indoor ? n * 0.35 : n;
  if (k > 0.02) {
    ctx.globalCompositeOperation = 'multiply';
    const r0 = 150, r1 = Math.max(W, H) * 0.85;
    const g = ctx.createRadialGradient(f.x, f.y, r0, f.x, f.y, r1);
    g.addColorStop(0, mix('#ffffff', '#c8d0ff', k * 0.4));
    g.addColorStop(0.45, mix('#ffffff', '#7884c8', k * 0.75));
    g.addColorStop(1, mix('#ffffff', '#3a4280', k * 0.85));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 灯りのにじみ
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(f.x, f.y - 30, 0, f.x, f.y - 30, 170);
    lg.addColorStop(0, rgba('#ffe6c0', 0.08 * k)); lg.addColorStop(1, 'rgba(255,230,192,0)');
    ctx.fillStyle = lg; ctx.fillRect(f.x - 180, f.y - 210, 360, 360);
  }
  ctx.restore();
}

/** テスト用: 時間帯の重み・現在のキャッシュ数 */
export function _bgStats() { let n = 0; for (const m of sceneCache.values()) n += m.size; return { scenes: sceneCache.size, layers: n }; }
// ================================================================ drawMapTiles（ワールド空間）
const TILE = {
  beach: { ground: '#f4c98b', groundD: '#d69a5c', top: '#fff0c8', plat: '#b9774a', platE: '#7a4527', platTop: '#d9985e', ladder: false, wall: '#c9906a' },
  downtown: { ground: '#2a2738', groundD: '#1c1a28', top: '#4a4560', plat: '#4a4560', platE: '#8e86b0', neon: '#ff2e88', ladder: true, wall: '#3a3550' },
  slums: { ground: '#5c5260', groundD: '#3e3442', top: '#6e6472', plat: '#7a4e3a', platE: '#4a2e22', ladder: true, wall: '#5a4048' },
  swamp: { ground: '#4b3b2a', groundD: '#33281c', top: '#6e9a3e', plat: '#6b4a2e', platE: '#3a2616', platTop: '#6e9a3e', ladder: false, wall: '#4a3a2a' },
  casino: { ground: '#6e1238', groundD: '#4a0a26', top: '#e8dcc8', plat: '#e8dcc8', platE: '#b89a5a', neon: '#ffd23f', ladder: true, wall: '#3a1660' },
  rooftop: { ground: '#2e2a40', groundD: '#1e1a2c', top: '#5d5880', plat: '#3a3552', platE: '#5d5880', neon: '#b45cff', ladder: true, wall: '#3a3552' },
  // v2: バリアント・新地域
  road: { gk: 'downtown', pk: 'beam', ground: '#3a3448', groundD: '#24202e', top: '#5a5470', plat: '#5a5470', platE: '#9a92b8', neon: '#ffc93c', ladder: true, wall: '#4a4458' },
  tunnel: { gk: 'tunnel', pk: 'beam', ground: '#3a3444', groundD: '#22202a', top: '#6a6474', plat: '#4a4458', platE: '#8a84a0', neon: '#2e7bff', ladder: true, wall: '#5a5468' },
  park: { gk: 'swamp', pk: 'beach', ground: '#4a3a2a', groundD: '#30261c', top: '#5aa84a', plat: '#9a6a44', platE: '#5a3a22', platTop: '#b98a5a', grass: ['#5ac85a', '#3a9a3a'], ladder: false, wall: '#5a4a3a' },
  deck: { gk: 'deck', pk: 'slums', ground: '#5a3e2e', groundD: '#3a281e', top: '#7a5a42', plat: '#6a4a34', platE: '#3a2416', ladder: true, wall: '#4a3428' },
  desert: { gk: 'desert', pk: 'beach', ground: '#e0a868', groundD: '#b87a48', top: '#f4c890', plat: '#a8784a', platE: '#6a4428', platTop: '#c8945a', grass: ['#8aa83a', '#5a7a2a'], ladder: false, wall: '#b8784a' },
  vault: { gk: 'vault', pk: 'beam', ground: '#4a4a5a', groundD: '#2a2a36', top: '#8a8ea0', plat: '#6a6e80', platE: '#a8acc0', neon: '#ffd23f', ladder: true, wall: '#545468' },
  garden: { gk: 'swamp', pk: 'beach', ground: '#4a3a2a', groundD: '#2e2418', top: '#6ac85a', plat: '#8a6a4a', platE: '#4a3020', platTop: '#a88a5a', grass: ['#6ad86a', '#3aa84a'], ladder: true, wall: '#5a4a3a' },
  spaceport: { gk: 'spaceport', pk: 'beam', ground: '#5a6488', groundD: '#3a4060', top: '#a8b0c8', plat: '#6a7498', platE: '#c8d0e8', neon: '#3ee6d2', ladder: true, wall: '#5a6488' },
  moon: { gk: 'moon', pk: 'beam', ground: '#8a8aa0', groundD: '#5a5a70', top: '#b8b8cc', plat: '#7a7e98', platE: '#c8ccdc', neon: '#9ff6ff', ladder: true, wall: '#6a6a80' },
  alien: { gk: 'alien', pk: 'alien', ground: '#3a1450', groundD: '#1a0828', top: '#7a3a9a', plat: '#4a1a5a', platE: '#b45cff', neon: '#7cff6a', ladder: true, wall: '#3a1450' },
};
// 地域×バリアントから床タイル種を選ぶ
function tileTheme(sc) {
  const r = sc.region, v = sc.v;
  if (sc.town) return TILE[r] ? r : 'beach';
  if (r === 'beach') return v === 3 ? 'road' : 'beach';
  if (r === 'downtown') return v === 1 ? 'tunnel' : v === 3 ? 'park' : v === 2 ? 'road' : 'downtown';
  if (r === 'slums') return v === 2 ? 'deck' : 'slums';
  if (r === 'casino') return v === 0 ? 'desert' : v === 1 ? 'vault' : 'casino';
  if (r === 'rooftop') return v === 1 ? 'garden' : 'rooftop';
  if (r === 'spaceport') return v === 2 ? 'moon' : v === 3 ? 'alien' : 'spaceport';
  return TILE[r] ? r : 'beach';
}

function viewRange(ctx) {
  const m = ctx.getTransform();
  const sx = m.a || 1;
  const x0 = -m.e / sx, y0 = -m.f / (m.d || 1);
  const w = ctx.canvas.width / sx, h = ctx.canvas.height / (m.d || 1);
  return { x0: x0 - 80, x1: x0 + w + 80, y0: y0 - 80, y1: y0 + h + 80 };
}

export function drawMapTiles(ctx, map, time) {
  if (!map) return;
  const sc = sceneOf(map);
  const theme = sc.special ? sc.special.kind : tileTheme(sc);
  const S = sc.special ? sc.tile : TILE[theme];
  const region = sc.region;
  time = time || 0;
  const V = viewRange(ctx);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 装飾（足場の後ろ）
  if (map.decor) for (const d of map.decor) {
    if (d.x < V.x0 - 260 || d.x > V.x1 + 260) continue;
    drawDecor(ctx, d, region, time, map.style);
  }
  // ロープ
  if (map.ropes) for (const r of map.ropes) {
    if (r.x < V.x0 || r.x > V.x1) continue;
    drawRope(ctx, r, S.ladder || r.ladder, theme);
  }
  // 壁
  if (map.walls) for (const w of map.walls) {
    if (w.x + w.w < V.x0 || w.x > V.x1) continue;
    drawWall(ctx, w, S, theme);
  }
  // 足場
  if (map.platforms) for (const p of map.platforms) {
    if (p.x + p.w < V.x0 || p.x > V.x1 || p.y < V.y0 - 60 || p.y > V.y1 + 60) continue;
    drawPlatform(ctx, p, S, theme, time);
  }
  // 地面
  drawGround(ctx, map, S, theme, V, time);
  if (sc.town && theme !== 'downtown') drawSidewalk(ctx, map, S, region, V);
  // ポータル
  if (map.portals) for (const p of map.portals) {
    if (p.x < V.x0 - 100 || p.x > V.x1 + 100) continue;
    drawPortal(ctx, p, time);
  }
  ctx.restore();
}

function drawGround(ctx, map, S, theme, V, time) {
  const gy = map.groundY;
  const x0 = Math.max(V.x0, -400), x1 = Math.min(V.x1, (map.width || 4000) + 400);
  const bottom = Math.max((map.height || gy + 200), V.y1) + 50;
  const g = ctx.createLinearGradient(0, gy, 0, gy + 160);
  g.addColorStop(0, S.ground); g.addColorStop(1, S.groundD);
  ctx.fillStyle = g; ctx.fillRect(x0, gy, x1 - x0, bottom - gy);
  const step = 64;
  const i0 = Math.floor(x0 / step), i1 = Math.ceil(x1 / step);
  switch (S.gk || theme) {
    case 'tower': case 'arena': case 'boss': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(S.neon, 0.55 + 0.2 * Math.sin(time * 2)); ctx.fillRect(x0, gy + 8, x1 - x0, 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 10); ctx.lineTo(i * step, gy + 200); }
      for (let y = gy + 40; y < gy + 200; y += 36) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      if (S.gk === 'arena') { ctx.fillStyle = rgba(S.neon, 0.25); for (let i = i0; i <= i1; i++) if (i % 4 === 0) ctx.fillRect(i * step, gy + 10, 3, 30); }
      break;
    }
    case 'tunnel': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 10);
      ctx.fillStyle = '#ffc93c'; ctx.fillRect(x0, gy + 10, x1 - x0, 4);
      ctx.fillStyle = '#2a2632'; for (let i = i0; i <= i1; i++) ctx.fillRect(i * step + 8, gy + 44, 48, 8);
      ctx.fillStyle = '#9a96a8'; ctx.fillRect(x0, gy + 40, x1 - x0, 3); ctx.fillRect(x0, gy + 54, x1 - x0, 3);
      break;
    }
    case 'deck': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 5);
      ctx.strokeStyle = 'rgba(30,16,10,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let y = gy + 14; y < gy + 120; y += 14) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      for (let i = i0; i <= i1; i++) { const h = hashStr('d' + i); ctx.moveTo(i * step + (h % 64), gy + 5 + ((h >>> 6) % 6) * 14); ctx.lineTo(i * step + (h % 64), gy + 19 + ((h >>> 6) % 6) * 14); }
      ctx.stroke();
      break;
    }
    case 'desert': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 6);
      ctx.fillStyle = 'rgba(184,122,72,0.6)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('ds' + i); ctx.fillRect(i * step + (h % 50), gy + 14 + (h >>> 8) % 60, 4, 2); if (h % 7 === 0) { ctx.fillStyle = '#8a6a5a'; ctx.beginPath(); ctx.ellipse(i * step + 30, gy + 6, 9, 4, 0, PI, 0); ctx.fill(); ctx.fillStyle = 'rgba(184,122,72,0.6)'; } }
      break;
    }
    case 'vault': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 12);
      ctx.fillStyle = '#ffd23f'; for (let i = i0; i <= i1; i++) if (i % 2) ctx.fillRect(i * step, gy + 12, 32, 5);
      ctx.fillStyle = '#2a2a36'; for (let i = i0; i <= i1; i++) if (!(i % 2)) ctx.fillRect(i * step, gy + 12, 32, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 17); ctx.lineTo(i * step, gy + 200); } ctx.stroke();
      break;
    }
    case 'spaceport': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 10);
      for (let i = i0; i <= i1; i++) { ctx.fillStyle = i % 2 ? '#ffd23f' : '#2a2a3a'; ctx.beginPath(); ctx.moveTo(i * step, gy + 10); ctx.lineTo(i * step + 32, gy + 10); ctx.lineTo(i * step + 20, gy + 18); ctx.lineTo(i * step - 12, gy + 18); ctx.closePath(); ctx.fill(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(62,230,210,0.5)'; ctx.fillRect(x0, gy, x1 - x0, 2); ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = i0; i <= i1; i += 2) { ctx.moveTo(i * step, gy + 18); ctx.lineTo(i * step, gy + 200); } ctx.stroke();
      break;
    }
    case 'moon': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 6);
      ctx.fillStyle = 'rgba(70,70,90,0.45)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('m' + i); if (h % 3 === 0) { ctx.beginPath(); ctx.ellipse(i * step + (h % 40), gy + 20 + (h >>> 5) % 50, 10 + h % 12, 3 + h % 3, 0, 0, PI * 2); ctx.fill(); } }
      break;
    }
    case 'alien': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#7cff6a', 0.35 + 0.2 * Math.sin(time * 2)); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const h = hashStr('a' + i); ctx.moveTo(i * step, gy + 12 + h % 30); ctx.quadraticCurveTo(i * step + 32, gy + 4 + (h >>> 4) % 50, i * step + 64, gy + 12 + (h >>> 8) % 30); }
      ctx.stroke(); ctx.fillStyle = 'rgba(180,92,255,0.5)'; ctx.fillRect(x0, gy, x1 - x0, 2); ctx.restore();
      break;
    }
    case 'beach': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 6);
      ctx.fillStyle = 'rgba(214,154,92,0.6)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('b' + i); ctx.fillRect(i * step + (h % 50), gy + 14 + (h >>> 8) % 60, 3, 2); ctx.fillRect(i * step + ((h >>> 4) % 60), gy + 30 + (h >>> 12) % 50, 2, 2); }
      ctx.fillStyle = '#ffffff';
      for (let i = i0; i <= i1; i += 3) { const h = hashStr('s' + i); if (h % 4 === 0) { ctx.save(); ctx.translate(i * step + 20, gy + 26); shell(ctx, h); ctx.restore(); } }
      break;
    }
    case 'downtown': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 22);
      ctx.fillStyle = '#8e86b0'; ctx.fillRect(x0, gy, x1 - x0, 3);
      ctx.fillStyle = '#1c1a28'; ctx.fillRect(x0, gy + 22, x1 - x0, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 3); ctx.lineTo(i * step, gy + 22); } ctx.stroke();
      ctx.fillStyle = '#e6e1f0';
      for (let i = i0; i <= i1; i++) if (i % 2 === 0) ctx.fillRect(i * step, gy + 62, 36, 5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,46,136,0.12)'; ctx.fillRect(x0, gy + 26, x1 - x0, 20); ctx.restore();
      break;
    }
    case 'slums': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 8);
      ctx.strokeStyle = '#3e3442'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const h = hashStr('c' + i);
        if (h % 3) continue;
        const sx = i * step + (h % 40);
        ctx.moveTo(sx, gy + 8); ctx.lineTo(sx + 8, gy + 20); ctx.lineTo(sx + 4, gy + 34); ctx.moveTo(sx + 8, gy + 20); ctx.lineTo(sx + 18, gy + 26);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,20,30,0.25)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('p' + i); if (h % 5 === 0) { ctx.beginPath(); ctx.ellipse(i * step + 20, gy + 40, 26, 5, 0, 0, PI * 2); ctx.fill(); } }
      break;
    }
    case 'swamp': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 7);
      ctx.fillStyle = '#5a8a32'; ctx.beginPath();
      for (let i = i0 * 2; i <= i1 * 2; i++) { const x = i * 32, h = hashStr('g' + i) % 8; ctx.moveTo(x, gy + 2); ctx.lineTo(x + 4, gy - 6 - h); ctx.lineTo(x + 7, gy + 2); ctx.moveTo(x + 12, gy + 2); ctx.lineTo(x + 18, gy - 4 - h * 0.6); ctx.lineTo(x + 20, gy + 2); }
      ctx.fill();
      ctx.fillStyle = 'rgba(44,92,79,0.6)';
      for (let i = i0; i <= i1; i++) { const h = hashStr('w' + i); if (h % 4 === 0) { ctx.beginPath(); ctx.ellipse(i * step + 30, gy + 30 + h % 20, 30, 5, 0, 0, PI * 2); ctx.fill(); } }
      break;
    }
    case 'casino': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 14);
      ctx.fillStyle = '#b89a5a'; ctx.fillRect(x0, gy + 14, x1 - x0, 3);
      ctx.fillStyle = '#a8204e';
      for (let i = i0; i <= i1; i++) { ctx.beginPath(); ctx.moveTo(i * step + 32, gy + 26); ctx.lineTo(i * step + 44, gy + 38); ctx.lineTo(i * step + 32, gy + 50); ctx.lineTo(i * step + 20, gy + 38); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = 'rgba(184,154,90,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 3); ctx.lineTo(i * step, gy + 14); } ctx.stroke();
      break;
    }
    case 'rooftop': {
      ctx.fillStyle = S.top; ctx.fillRect(x0, gy, x1 - x0, 10);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(180,92,255,0.5)'; ctx.fillRect(x0, gy, x1 - x0, 2); ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = i0; i <= i1; i++) { ctx.moveTo(i * step, gy + 10); ctx.lineTo(i * step, gy + 200); } ctx.stroke();
      ctx.fillStyle = '#3a3552';
      for (let i = i0; i <= i1; i++) { const h = hashStr('v' + i); if (h % 7 === 0) { ctx.fillRect(i * step + 10, gy + 24, 30, 14); ctx.fillStyle = '#5d5880'; ctx.fillRect(i * step + 12, gy + 26, 26, 3); ctx.fillStyle = '#3a3552'; } }
      break;
    }
  }
  // 地面上端のアウトライン
  ctx.fillStyle = 'rgba(42,20,48,0.5)'; ctx.fillRect(x0, gy - 1, x1 - x0, 2);
}

function shell(ctx, h) {
  ctx.fillStyle = h % 2 ? '#ffd0e0' : '#fff6e8';
  ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(0, -6, 5, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(160,90,90,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -2); ctx.moveTo(-2.5, 3); ctx.lineTo(-1, -1.5); ctx.moveTo(2.5, 3); ctx.lineTo(1, -1.5); ctx.stroke();
}

function drawPlatform(ctx, p, S, theme, time) {
  const x = p.x, y = p.y, w = p.w;
  const th = p.solid ? 26 : 16;
  ctx.save();
  // 影
  ctx.fillStyle = 'rgba(20,0,30,0.18)'; ctx.fillRect(x + 6, y + th, w - 12, 6);
  switch (S.pk || theme) {
    case 'alien': {
      ctx.beginPath(); rr(ctx, x, y, w, th, th / 2); ctx.fillStyle = S.plat; ctx.fill(); ctx.strokeStyle = '#1a0828'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + Math.sin(time * 3 + x * 0.01) * 0.4;
      ctx.fillStyle = rgba('#7cff6a', 0.6 * pulse);
      for (let k = x + 14; k < x + w - 8; k += 26) { ctx.beginPath(); ctx.ellipse(k, y + th / 2, 4, 2.4, 0, 0, PI * 2); ctx.fill(); }
      ctx.strokeStyle = rgba(S.platE, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + th / 2, y + 1); ctx.lineTo(x + w - th / 2, y + 1); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'beach': {
      // 木の桟橋（板）＋草とヤシ葉の縁取り
      ctx.beginPath(); rr(ctx, x, y, w, th, 4); ctx.fillStyle = S.plat; ctx.fill();
      ctx.strokeStyle = S.platE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(122,69,39,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let k = x + 22; k < x + w - 4; k += 22) { ctx.moveTo(k, y + 4); ctx.lineTo(k, y + th - 1); }
      ctx.stroke();
      ctx.fillStyle = '#8a5530';
      for (let k = x + 12; k < x + w; k += 70) ctx.fillRect(k, y + th, 6, 18);
      ctx.fillStyle = S.platTop; ctx.fillRect(x + 2, y, w - 4, 4);
      grassTop(ctx, x, y, w, S.grass ? S.grass[0] : '#6ccf5a', S.grass ? S.grass[1] : '#3f9a3a');
      break;
    }
    case 'swamp': {
      // 丸太＋苔
      ctx.beginPath(); rr(ctx, x, y, w, th, th / 2); ctx.fillStyle = S.plat; ctx.fill(); ctx.strokeStyle = S.platE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(58,38,22,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = x + 16; k < x + w - 10; k += 30) { ctx.moveTo(k, y + 6); ctx.lineTo(k + 18, y + 6); ctx.moveTo(k + 8, y + 11); ctx.lineTo(k + 24, y + 11); }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 6, y + th / 2, 5, th / 2 - 1, 0, 0, PI * 2); ctx.fillStyle = '#9a7a4e'; ctx.fill(); ctx.stroke();
      grassTop(ctx, x, y, w, '#6e9a3e', '#4e7a3a');
      // 垂れ苔
      ctx.strokeStyle = '#4e7a3a'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = x + 20; k < x + w - 10; k += 46) { const l = 10 + (hashStr('m' + k) % 14); const s = Math.sin(time * 1.5 + k) * 2; ctx.moveTo(k, y + th); ctx.quadraticCurveTo(k + s, y + th + l / 2, k + s * 1.5, y + th + l); }
      ctx.stroke();
      break;
    }
    case 'slums': {
      // 錆びた鉄骨足場
      ctx.fillStyle = S.plat; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = S.platE; ctx.fillRect(x, y + th - 5, w, 5);
      ctx.strokeStyle = S.plat; ctx.lineWidth = 2.4; ctx.beginPath();
      for (let k = x; k < x + w - 4; k += 20) { ctx.moveTo(k, y + 7); ctx.lineTo(k + 20, y + th - 5); ctx.moveTo(k + 20, y + 7); ctx.lineTo(k, y + th - 5); }
      ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, th);
      ctx.fillStyle = '#b07a52'; for (let k = x + 6; k < x + w; k += 20) ctx.fillRect(k, y + 2, 2.5, 2.5);
      ctx.fillStyle = 'rgba(160,80,40,0.45)'; for (let k = x + 13; k < x + w; k += 57) ctx.fillRect(k, y + 7, 6, 3);
      break;
    }
    case 'casino': {
      // 大理石＋金縁＋電飾
      ctx.beginPath(); rr(ctx, x, y, w, th, 3);
      const g = ctx.createLinearGradient(0, y, 0, y + th); g.addColorStop(0, '#fff8ea'); g.addColorStop(1, S.plat);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = S.platE; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(184,154,90,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.quadraticCurveTo(x + w * 0.4, y + 12, x + w * 0.7, y + 5); ctx.stroke();
      const n = Math.floor(w / 16);
      for (let k = 0; k < n; k++) { const on = (k + Math.floor(time * 8)) % 3 === 0; ctx.fillStyle = on ? '#fff6c0' : 'rgba(255,201,60,0.5)'; ctx.fillRect(x + 8 + k * 16, y + th - 4, 3, 3); }
      break;
    }
    case 'beam': default: {
      // downtown / rooftop: 鉄骨 I ビーム＋ネオン縁
      ctx.fillStyle = S.plat; ctx.fillRect(x, y, w, 5); ctx.fillRect(x, y + th - 5, w, 5); ctx.fillRect(x, y + 5, w, th - 10);
      ctx.fillStyle = shade(S.plat, -0.25); ctx.fillRect(x, y + 5, w, th - 10);
      ctx.fillStyle = S.platE;
      for (let k = x + 8; k < x + w - 4; k += 24) { ctx.beginPath(); ctx.arc(k, y + 2.5, 1.6, 0, PI * 2); ctx.arc(k, y + th - 2.5, 1.6, 0, PI * 2); ctx.fill(); }
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, th);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const nc = S.neon || '#ff2e88';
      const pulse = 0.7 + Math.sin(time * 3 + x * 0.01) * 0.3;
      ctx.strokeStyle = rgba(nc, 0.3 * pulse); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x + 2, y + 1); ctx.lineTo(x + w - 2, y + 1); ctx.stroke();
      ctx.strokeStyle = rgba(nc, 0.95); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function grassTop(ctx, x, y, w, c1, c2) {
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.moveTo(x - 2, y + 5);
  for (let k = x - 2; k < x + w + 2; k += 8) { ctx.quadraticCurveTo(k + 4, y + 10, k + 8, y + 5); }
  ctx.lineTo(x + w + 2, y - 2); ctx.lineTo(x - 2, y - 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c2; ctx.beginPath();
  for (let k = x + 4; k < x + w - 4; k += 14) { ctx.moveTo(k, y - 1); ctx.lineTo(k + 2.5, y - 7 - (k % 3)); ctx.lineTo(k + 5, y - 1); }
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,20,48,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + w + 2, y - 2); ctx.stroke();
}

function drawRope(ctx, r, ladder, theme) {
  const top = r.top, bot = r.bottom;
  if (ladder) {
    const c = theme === 'casino' ? '#ffd23f' : theme === 'slums' ? '#8a5a3a' : '#8e86b0';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(r.x - 10, top); ctx.lineTo(r.x - 10, bot); ctx.moveTo(r.x + 10, top); ctx.lineTo(r.x + 10, bot); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath();
    for (let y = top + 10; y < bot - 4; y += 16) { ctx.moveTo(r.x - 10, y); ctx.lineTo(r.x + 10, y); }
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(r.x, top - 4); ctx.lineTo(r.x, bot); ctx.stroke();
    ctx.strokeStyle = '#c8945a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let y = top; y < bot - 4; y += 8) { ctx.moveTo(r.x - 2, y); ctx.lineTo(r.x + 2, y + 5); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x, top - 2, 5, 0, PI * 2); ctx.fillStyle = '#c8945a'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  }
}

function drawWall(ctx, w, S, theme) {
  ctx.fillStyle = S.wall; ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeStyle = shade(S.wall, -0.3); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = w.y + 14, r = 0; y < w.y + w.h; y += 14, r++) {
    ctx.moveTo(w.x, y); ctx.lineTo(w.x + w.w, y);
    for (let x = w.x + (r % 2 ? 14 : 0); x < w.x + w.w; x += 28) { ctx.moveTo(x, y - 14); ctx.lineTo(x, y); }
  }
  ctx.stroke();
  ctx.fillStyle = shade(S.wall, 0.2); ctx.fillRect(w.x, w.y, w.w, 4);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
}

// ---------------------------------------------------------------- ポータル（メイプル風の光の渦）
function drawPortal(ctx, p, time) {
  const x = p.x, y = p.y;
  const cy = y - 46;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 足元の光
  const g = ctx.createRadialGradient(x, y - 4, 4, x, y - 4, 60);
  g.addColorStop(0, 'rgba(180,124,255,0.55)'); g.addColorStop(1, 'rgba(180,124,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 4, 60, 16, 0, 0, PI * 2); ctx.fill();
  // 渦
  for (let i = 0; i < 5; i++) {
    const a0 = time * (2.4 + i * 0.5) + i * 1.3;
    const rx = 18 + i * 5, ry = 30 + i * 7;
    ctx.strokeStyle = i % 2 ? 'rgba(62,230,210,0.6)' : 'rgba(255,79,160,0.55)';
    ctx.lineWidth = 4 - i * 0.5;
    ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, a0, a0 + PI * 1.2); ctx.stroke();
  }
  const cg = ctx.createRadialGradient(x, cy, 2, x, cy, 30);
  cg.addColorStop(0, 'rgba(255,255,255,0.9)'); cg.addColorStop(0.5, 'rgba(180,124,255,0.5)'); cg.addColorStop(1, 'rgba(180,124,255,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, cy, 26, 40, 0, 0, PI * 2); ctx.fill();
  // 上昇する粒
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const k = ((time * 0.6 + i / 8) % 1);
    const px = x + Math.sin(i * 2.3 + time) * 22 * (1 - k);
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(px, y - 8 - k * 90, 2.5, 2.5);
  }
  ctx.restore();
  // ラベル
  if (p.label) {
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(p.label).width + 18;
    const ly = y - 112 + Math.sin(time * 2) * 2;
    ctx.fillStyle = 'rgba(42,20,48,0.8)'; ctx.beginPath(); rr(ctx, x - tw / 2, ly - 11, tw, 22, 11); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(p.label, x, ly + 1);
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(x - 5, ly + 13); ctx.lineTo(x + 5, ly + 13); ctx.lineTo(x, ly + 19); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}


// 町: 歩道（縁石＋タイル）
const WALK = {
  beach: ['#f2e2d0', '#d8c0a8', '#ff9ab8'], slums: ['#8a8090', '#6a6070', '#b5523b'], swamp: ['#8a7a5a', '#6a5a3a', '#c9a13b'],
  casino: ['#e8dcc8', '#b89a5a', '#ffd23f'], rooftop: ['#6a6488', '#4a4468', '#b45cff'], spaceport: ['#d8e0f0', '#a8b4cc', '#3ee6d2'],
};
function drawSidewalk(ctx, map, S, region, V) {
  const c = WALK[region]; if (!c) return;
  const gy = map.groundY;
  const x0 = Math.max(V.x0, -400), x1 = Math.min(V.x1, (map.width || 4000) + 400);
  ctx.fillStyle = c[0]; ctx.fillRect(x0, gy, x1 - x0, 18);
  ctx.fillStyle = c[1]; ctx.fillRect(x0, gy + 18, x1 - x0, 5);
  ctx.fillStyle = c[2]; ctx.fillRect(x0, gy + 23, x1 - x0, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
  const i0 = Math.floor(x0 / 48), i1 = Math.ceil(x1 / 48);
  for (let i = i0; i <= i1; i++) { ctx.moveTo(i * 48, gy + 2); ctx.lineTo(i * 48, gy + 18); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(42,20,48,0.5)'; ctx.fillRect(x0, gy - 1, x1 - x0, 2);
}

// 内部用（テストページ等）
export function _clearBackgroundCache() { sceneCache.clear(); glowKey = ''; }
