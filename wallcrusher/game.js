// WALL CRUSHER ∞ — 描画・入力・音・画面の板。計算は core.js（WC）。
(function () {
  'use strict';
  const WC = window.WC;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = WC.fmt;
  const SAVE_KEY = 'wallcrusher.v1';

  // ================= 状態 =================
  let S = null;
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return WC.fix(JSON.parse(raw));
    } catch (e) { /* 保存できない環境 */ }
    return WC.newState();
  }
  function save() {
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境 */ }
  }
  const HOT = window.claude && window.claude.hot;
  let hotLoaded = false;
  S = load();
  if (HOT && HOT.snapshot) HOT.snapshot(() => ({ S }));
  function useHot(data) { if (data && data.S) { S = WC.fix(data.S); hotLoaded = true; } }
  let ST = WC.stats(S);
  const refreshStats = () => { ST = WC.stats(S); };

  // ================= 画面 =================
  const cv = $('cv'), ctx = cv.getContext('2d');
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  let W = 0, H = 0, DPR = 1, K = 1; // K: 大きさの基準
  let GY = 0, HX = 0; // 地面の高さ・主人公の x
  let WALL = { x0: 0, w: 0, top: 0, h: 0, cols: 8, rows: 14, bw: 0, bh: 0 };
  let bgCanvas = null, bgZone = -1;
  function resize() {
    const r = $('stage').getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    K = clamp(Math.min(W / 700, H / 420), 0.55, 1.6);
    GY = H * 0.86; HX = Math.max(46, W * 0.13);
    const ww = clamp(W * 0.46, 150, 560);
    WALL.cols = 8;
    WALL.w = ww; WALL.x0 = W - ww * 0.86; WALL.top = H * 0.13; WALL.h = GY - WALL.top;
    WALL.bw = ww / WALL.cols; WALL.rows = Math.max(8, Math.round(WALL.h / (WALL.bw * 0.55))); WALL.bh = WALL.h / WALL.rows;
    bgZone = -1;
    buildBricks(false);
  }

  // ================= 地域と壁の材質 =================
  const ZONES = [
    { name: '赤レンガ通り', sky: ['#2a1240', '#8a2f55'], far: '#3b1838', ground: '#2a1424', brick: ['#c2553a', '#9a3d2a'], mortar: '#4a1c18' },
    { name: '石切り場', sky: ['#14203a', '#4a6a8a'], far: '#1f2c44', ground: '#1e222c', brick: ['#9aa0aa', '#767c88'], mortar: '#3a3e48' },
    { name: '凍てつく氷河', sky: ['#0a1a3a', '#3a8ab8'], far: '#18345a', ground: '#a8d8f0', brick: ['#a8ecff', '#6cc8ec'], mortar: '#2a6a9a', glow: '#bff6ff' },
    { name: '鋼鉄工場', sky: ['#1a1414', '#5a3a2a'], far: '#2a201c', ground: '#1c1a1a', brick: ['#7d8a98', '#5a6674'], mortar: '#2a2e34', rivet: true },
    { name: '水晶の洞窟', sky: ['#120a2a', '#4a2a7a'], far: '#22124a', ground: '#1a1030', brick: ['#c09aff', '#8a5aec'], mortar: '#3a1a6a', glow: '#e0ccff' },
    { name: '灼熱の溶岩地帯', sky: ['#1a0604', '#8a2a0a'], far: '#2a0c06', ground: '#1a0806', brick: ['#3a221c', '#2a1814'], mortar: '#ff6a1a', glow: '#ff8a3d' },
    { name: '黄金宮殿', sky: ['#1a1204', '#6a4a1a'], far: '#2a1e0a', ground: '#2a2010', brick: ['#f0c040', '#c8961c'], mortar: '#6a4a10', glow: '#fff0a0' },
    { name: 'ネオン街', sky: ['#05051a', '#2a0a4a'], far: '#0a0a2a', ground: '#0a0a1a', brick: ['#1c1440', '#141030'], mortar: '#3df5ff', glow: '#ff3df0' },
    { name: '翡翠の森', sky: ['#04140e', '#1a5a3a'], far: '#082a1a', ground: '#0a1a10', brick: ['#3ad29f', '#22a078'], mortar: '#0a4a32' },
    { name: '虚無の果て', sky: ['#000000', '#1a0a2a'], far: '#0a0414', ground: '#05030a', brick: ['#14101e', '#0c0a14'], mortar: '#8a5aff', glow: '#b98bff' },
  ];
  const zoneIdx = (s) => Math.floor((s - 1) / 10);
  const zoneOf = (s) => ZONES[zoneIdx(s) % ZONES.length];
  const zoneName = (s) => { const z = zoneIdx(s); const lap = Math.floor(z / ZONES.length); return zoneOf(s).name + (lap ? ' ' + ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(lap, 9)] + (lap > 9 ? '+' : '') : ''); };

  function buildBg() {
    const z = zoneOf(S.stage);
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = cv.width; bgCanvas.height = cv.height;
    const g = bgCanvas.getContext('2d');
    g.scale(DPR, DPR);
    const grd = g.createLinearGradient(0, 0, 0, GY);
    grd.addColorStop(0, z.sky[0]); grd.addColorStop(1, z.sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // 星
    let seed = zoneIdx(S.stage) * 977 + 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 70; i++) { const s = r() * 1.6 + 0.4; g.fillRect(r() * W, r() * GY * 0.6, s, s); }
    // 遠くの影（町・山）
    g.fillStyle = z.far;
    const zi = zoneIdx(S.stage) % ZONES.length;
    if (zi === 1 || zi === 2 || zi === 5 || zi === 9) {
      g.beginPath(); g.moveTo(0, GY);
      for (let x = 0; x <= W + 40; x += 40) g.lineTo(x, GY - (0.18 + 0.22 * r()) * H);
      g.lineTo(W, GY); g.fill();
    } else if (zi === 8) {
      for (let x = -10; x < W; x += 26 + r() * 20) { const h = (0.2 + 0.3 * r()) * H; g.beginPath(); g.moveTo(x, GY); g.lineTo(x + 18, GY - h); g.lineTo(x + 36, GY); g.fill(); }
    } else {
      for (let x = 0; x < W; ) {
        const bw = 24 + r() * 46, bh = (0.12 + 0.36 * r()) * H;
        g.fillRect(x, GY - bh, bw, bh);
        g.fillStyle = 'rgba(255,220,140,.25)';
        for (let wy = GY - bh + 8; wy < GY - 8; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (r() < 0.35) g.fillRect(wx, wy, 4, 5);
        g.fillStyle = z.far; x += bw + 4;
      }
    }
    // 地面
    g.fillStyle = z.ground; g.fillRect(0, GY, W, H - GY);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, GY, W, 2);
    for (let x = 0; x < W; x += 30) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + (r() * 10), GY + 6 + r() * (H - GY - 10), 12, 3); }
    bgZone = zoneIdx(S.stage);
  }

  // ================= レンガ =================
  let bricks = [], brickPtr = 0, wallSlide = 1, wallShake = 0, wallFlash = 0, wallVisP = 0;
  function buildBricks(fresh) {
    bricks = [];
    const { cols, rows } = WALL;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const off = r % 2 ? 0.5 : 0;
      bricks.push({
        c, r, off,
        o: Math.min(0.985, 0.62 * Math.random() + 0.36 * (c / (cols - 1))),
        gold: Math.random() < ST.golden,
        broken: false,
        cr: Math.random(),
      });
    }
    bricks.sort((a, b) => a.o - b.o);
    brickPtr = 0;
    if (fresh) wallSlide = 1;
    syncBricks(true);
  }
  function brickRect(b, wx) {
    let x = wx + b.c * WALL.bw - (b.off ? WALL.bw / 2 : 0), w = WALL.bw;
    if (b.off && b.c === 0) { x = wx; w = WALL.bw / 2; }
    return { x, y: WALL.top + b.r * WALL.bh, w, h: WALL.bh };
  }
  function syncBricks(silent) {
    const f = 1 - S.wallHp / S.wallMax;
    while (brickPtr < bricks.length && bricks[brickPtr].o <= f) {
      const b = bricks[brickPtr++];
      b.broken = true;
      if (!silent) breakBrick(b);
    }
  }
  function breakBrick(b) {
    const rc = brickRect(b, wallX());
    const z = zoneOf(S.stage);
    const n = fxN(5);
    for (let i = 0; i < n; i++) spawnDebris(rc.x + rand(0, rc.w), rc.y + rand(0, rc.h), b.gold ? '#ffd23f' : z.brick[i % 2], rand(-120, 380) * K, rand(-520, -80) * K, rand(3, 9) * K);
    if (b.gold) {
      const g = WC.goldFor(S.stage) * ST.goldMult * 0.04 * (1 + S.abil.lucky);
      S.gold += g; S.stats.golden++;
      for (let i = 0; i < fxN(10); i++) spawnCoin(rc.x + rc.w / 2, rc.y + rc.h / 2);
      floatText(rc.x, rc.y, '+' + fmt(g), '#ffd23f', 18);
      sfx.coin(); sfx.coin(1.5);
    } else if (Math.random() < 0.25) spawnCoin(rc.x + rc.w / 2, rc.y + rc.h / 2);
    sfx.brick();
  }
  function wallX() {
    const x0 = WALL.x0, xmin = HX + 60 * K;
    return x0 - (x0 - xmin) * wallVisP + wallSlide * (WALL.w + W * 0.1) + (wallShake ? rand(-wallShake, wallShake) : 0);
  }
  function aliveBrickNear(y) { // y の高さで一番左の残っているレンガの x
    const wx = wallX();
    let best = null;
    for (const b of bricks) {
      if (b.broken) continue;
      const rc = brickRect(b, wx);
      if (y >= rc.y && y < rc.y + rc.h && (!best || rc.x < best.x)) best = rc;
    }
    return best;
  }
  function randomTarget() {
    for (let t = 0; t < 8; t++) {
      const y = WALL.top + rand(0.05, 0.95) * WALL.h;
      const rc = aliveBrickNear(y);
      if (rc) return { x: rc.x + 2, y };
    }
    return { x: wallX() + WALL.w * 0.5, y: WALL.top + WALL.h * 0.6 };
  }

  // ================= 演出 =================
  const parts = [], coins = [], texts = [], shots = [], bolts = [], rings = [], meteors = [], beams = [], shocks = [];
  let shake = 0, flash = 0, flashColor = '#fff', slowT = 0, banner = null;
  const FX_CAP = [150, 450, 900];
  const fxN = (n) => Math.max(1, Math.round(n * [0.35, 1, 1.6][S.opt.fx]));
  function spawnDebris(x, y, color, vx, vy, size) {
    if (parts.length > FX_CAP[S.opt.fx]) parts.shift();
    parts.push({ x, y, vx, vy, s: size, c: color, r: rand(0, 6), vr: rand(-12, 12), life: rand(1, 1.8), t: 0 });
  }
  function spark(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      if (parts.length > FX_CAP[S.opt.fx]) parts.shift();
      const a = rand(Math.PI * 0.5, Math.PI * 1.5), v = rand(0.3, 1) * spd * K;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * K, s: rand(2, 4) * K, c: color, r: 0, vr: 0, life: rand(0.2, 0.5), t: 0, spark: true });
    }
  }
  function spawnCoin(x, y) {
    if (coins.length > 120) return;
    coins.push({ x, y, vx: rand(-260, 200) * K, vy: rand(-520, -200) * K, t: 0, home: rand(0.3, 0.6) });
  }
  function floatText(x, y, text, color, size, opts) {
    if (texts.length > 70) texts.shift();
    opts = opts || {};
    texts.push({ x: x + rand(-14, 14), y, text, color, size: size * K, t: 0, life: opts.life || 0.9, vy: opts.vy || -90, pop: opts.pop || 1 });
  }
  function showBanner(text, color, sub) { banner = { text, color, sub, t: 0 }; }
  function addShake(v) { if (S.opt.fx) shake = Math.min(28, shake + v * K); }
  function doFlash(a, c) { flash = Math.max(flash, a * (S.opt.fx ? 1 : 0.4)); flashColor = c || '#fff'; }

  // ================= 音 =================
  let AC = null, master = null, bgmGain = null, sfxGain = null, noiseBuf = null;
  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination);
      sfxGain = AC.createGain(); sfxGain.gain.value = S.opt.sfx ? 0.55 : 0; sfxGain.connect(master);
      bgmGain = AC.createGain(); bgmGain.gain.value = S.opt.bgm ? 0.22 : 0; bgmGain.connect(master);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      startBgm();
    } catch (e) { AC = null; }
  }
  function applyVolume() {
    if (!AC) return;
    sfxGain.gain.value = S.opt.sfx ? 0.55 : 0;
    bgmGain.gain.value = S.opt.bgm ? 0.22 : 0;
  }
  const lastSnd = {};
  function can(name, gap) { const t = performance.now(); if (lastSnd[name] && t - lastSnd[name] < gap) return false; lastSnd[name] = t; return true; }
  function tone(type, f0, f1, dur, vol, out, when) {
    if (!AC) return;
    const t = (when || AC.currentTime);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(out || sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, ftype, freq, out, when, q) {
    if (!AC) return;
    const t = when || AC.currentTime;
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.8;
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(out || sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const sfx = {
    hit(combo) { if (!can('hit', 45)) return; const p = 1 + Math.min(combo || 0, 60) * 0.02; tone('square', 220 * p, 90 * p, 0.07, 0.18); noise(0.05, 0.25, 'bandpass', 1800 * p); },
    shot() { if (!can('shot', 70)) return; noise(0.04, 0.08, 'highpass', 3000); },
    crit() { if (!can('crit', 60)) return; tone('sawtooth', 660, 220, 0.12, 0.16); noise(0.12, 0.35, 'bandpass', 900); },
    sup() { tone('sawtooth', 1200, 200, 0.4, 0.25); tone('square', 600, 1600, 0.3, 0.12); noise(0.4, 0.5, 'lowpass', 2500); },
    brick() { if (!can('brick', 35)) return; noise(0.12, 0.22, 'lowpass', rand(500, 900)); },
    coin(m) { if (!can('coin' + (m || ''), 70)) return; const f = 1320 * (m || 1); tone('sine', f, 0, 0.09, 0.12); tone('sine', f * 1.5, 0, 0.12, 0.08, null, AC && AC.currentTime + 0.05); },
    crush() { tone('sine', 120, 30, 0.6, 0.6); noise(0.7, 0.7, 'lowpass', 1400); tone('square', 80, 40, 0.3, 0.2); },
    buy() { if (!can('buy', 40)) return; tone('square', 520, 1040, 0.08, 0.12); },
    milestone() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, 0.14, 0.12, null, AC && AC.currentTime + i * 0.07)); },
    thunder() { noise(0.35, 0.5, 'highpass', 1500); tone('sawtooth', 90, 40, 0.3, 0.25); },
    meteor() { tone('sine', 90, 25, 0.9, 0.7); noise(0.9, 0.8, 'lowpass', 700); },
    shock() { tone('sine', 140, 50, 0.4, 0.4); noise(0.3, 0.3, 'lowpass', 500); },
    fever() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, 0, 0.12, 0.13, null, AC && AC.currentTime + i * 0.05)); },
    fail() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.2, 0.2, null, AC && AC.currentTime + i * 0.12)); },
    ach() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, 0.25, 0.14, null, AC && AC.currentTime + i * 0.08)); },
    rebirth() { for (let i = 0; i < 10; i++) tone('sine', 200 * Math.pow(1.25, i), 0, 0.3, 0.12, null, AC && AC.currentTime + i * 0.06); noise(1.2, 0.4, 'highpass', 2000); },
    boss() { tone('sawtooth', 110, 55, 0.8, 0.3); tone('sawtooth', 116, 58, 0.8, 0.3); },
    warn() { if (!can('warn', 900)) return; tone('square', 880, 0, 0.08, 0.1); },
  };
  // BGM：小さな打ち込み（Am F C G）
  let bgmStep = 0, bgmNext = 0, bgmTimer = null;
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function startBgm() {
    if (bgmTimer) return;
    bgmNext = AC.currentTime + 0.1;
    bgmTimer = setInterval(() => {
      if (!AC || AC.state !== 'running') return;
      const fever = S.feverT > 0;
      const spb = 60 / (fever ? 150 : 126) / 4;
      while (bgmNext < AC.currentTime + 0.12) {
        const st = bgmStep % 16, bar = Math.floor(bgmStep / 16) % 4, ch = PROG[bar];
        if (S.opt.bgm) {
          if (st % 4 === 0) tone('sine', 150, 40, 0.18, 0.9, bgmGain, bgmNext);
          if (st === 4 || st === 12) noise(0.12, 0.35, 'highpass', 1500, bgmGain, bgmNext);
          if (st % 2 === 1) noise(0.03, 0.12, 'highpass', 7000, bgmGain, bgmNext);
          if (st % 2 === 0) tone('sawtooth', midi(ch[0] - 24 + (st % 8 === 6 ? 12 : 0)), 0, spb * 1.6, 0.22, bgmGain, bgmNext);
          if (fever) tone('square', midi(ch[(st) % 3] + 12 + (st % 8 >= 4 ? 12 : 0)), 0, spb * 0.9, 0.07, bgmGain, bgmNext);
          else if (st === 0 || st === 10) tone('triangle', midi(ch[2] + 12), 0, spb * 4, 0.08, bgmGain, bgmNext);
        }
        bgmNext += spb; bgmStep++;
      }
    }, 25);
  }

  // ================= 戦闘 =================
  let autoAcc = 0, cloneAcc = 0, droneAcc = 0, thunderT = 0, meteorT = 0, drillAcc = 0, autoBuyT = 0, breakT = 0;
  let punchT = 0, punchArm = 0;
  let weak = { y: 0.5, t: 0 };
  let lastMilestone = { power: 0, auto: 0 };
  function hit(base, kind, tx, ty, opts) {
    opts = opts || {};
    if (S.wallHp <= 0 || breakT > 0) return;
    const r = WC.roll(S, base, ST, Math.random, opts);
    let dmg = r.dmg * (opts.mult || 1);
    const res = WC.damage(S, dmg, ST);
    S.hits++;
    // 見た目
    wallShake = Math.max(wallShake, (r.crit ? 5 : 2) * K);
    wallFlash = Math.max(wallFlash, r.crit ? 0.6 : 0.25);
    const showNum = kind !== 'drill' && (kind === 'tap' || r.crit || opts.big || Math.random() < 0.35);
    if (showNum) {
      const col = r.sup ? '#ff3df0' : r.crit ? '#ff3d81' : opts.color || (kind === 'tap' ? '#ffffff' : '#bff6ff');
      const size = r.sup ? 40 : r.crit ? 28 : opts.big ? 30 : kind === 'tap' ? 20 : 15;
      floatText(tx, ty - 6, (r.crit ? '💥' : '') + fmt(dmg), col, size, { pop: r.crit ? 1.6 : 1.2 });
    }
    if (kind !== 'drill') spark(tx, ty, r.crit ? '#ff3d81' : opts.color || '#ffffff', fxN(r.crit ? 8 : 3), r.crit ? 420 : 260);
    if (r.crit) {
      sfx.crit();
      S.wallT = Math.max(0, S.wallT - 0.004 * ST.time);
      if (S.abil.blast) { rings.push({ x: tx, y: ty, r: 4, max: 60 * K, life: 0.3, t: 0, c: '#ff6a00' }); addShake(3); }
    }
    if (r.sup) { sfx.sup(); showBanner('超会心!!', '#ff3df0'); slowT = 0.12; addShake(14); doFlash(0.5, '#ff3df0'); }
    if (S.abil.shock && kind !== 'shock' && S.hits % 20 === 0) doShock();
    if (res.broken) onBreak(); else syncBricks(false);
  }
  function onBreak() {
    breakT = 0.42;
    slowT = 0.22;
    addShake(16); doFlash(0.55);
    sfx.crush();
    const wx = wallX();
    const z = zoneOf(S.stage);
    for (const b of bricks) {
      if (b.broken) continue;
      b.broken = true;
      const rc = brickRect(b, wx);
      for (let i = 0; i < fxN(2); i++) spawnDebris(rc.x + rand(0, rc.w), rc.y + rand(0, rc.h), b.gold ? '#ffd23f' : z.brick[i % 2], rand(-60, 700) * K, rand(-700, -50) * K, rand(5, 12) * K);
    }
    for (let i = 0; i < fxN(22); i++) spawnCoin(wx + rand(0, WALL.w), WALL.top + rand(0.2, 0.9) * WALL.h);
    const boss = WC.isBoss(S.stage);
    showBanner(boss ? 'BOSS CRUSH!!' : ['CRUSH!', 'BREAK!', 'DOKAAN!', 'SMASH!'][Math.floor(Math.random() * 4)], boss ? '#ff3d81' : '#ffd23f');
    rings.push({ x: wx + WALL.w / 2, y: WALL.top + WALL.h / 2, r: 10, max: WALL.h * 0.9, life: 0.45, t: 0, c: '#ffffff' });
  }
  function afterBreak() {
    const prevZone = zoneIdx(S.stage), prevBest = S.bestStage;
    WC.nextWall(S);
    newWallVisual();
    if (S.advance && S.bestStage > prevBest && S.resets > 0 && S.bestStage % 10 === 1) toast('🏆 最高記録 更新！ ステージ ' + S.bestStage);
    if (zoneIdx(S.stage) !== prevZone) { bgZone = -1; if (S.advance) setTimeout(() => showBanner(zoneName(S.stage), '#3df5ff', 'ZONE ' + (zoneIdx(S.stage) + 1)), 300); }
  }
  function newWallVisual() {
    refreshStats();
    buildBricks(true);
    wallVisP = 0;
    if (WC.isBoss(S.stage) && S.advance) { setTimeout(() => { showBanner('⚠ BOSS WALL ⚠', '#ff3d81', '体力 ×5'); sfx.boss(); }, 250); }
  }
  function onFail() {
    sfx.fail();
    showBanner('押し返された…！', '#ff3d81', WC.shardsFor(S) > 0 ? '転生で もっと強くなれる！' : '金貨をためて 強化しよう');
    addShake(20); doFlash(0.4, '#ff3d81');
    newWallVisual();
  }
  function doShock() {
    const dmg = ST.ref * 3 * S.abil.shock;
    shocks.push({ x: HX, t: 0 });
    sfx.shock(); addShake(6);
    const tg = { x: wallX(), y: GY - 30 * K };
    hit(dmg, 'shock', tg.x, tg.y, { big: true, color: '#4ad8ff' });
    S.wallT = Math.max(0, S.wallT - 0.05 * ST.time);
  }
  function tapAttack(px, py) {
    if (breakT > 0) { punchT = 0.12; return; }
    S.stats.taps++;
    S.combo++; S.comboT = 0.9;
    punchT = 0.12; punchArm ^= 1;
    let t;
    if (py !== undefined && py >= WALL.top && py <= GY) { const rc = aliveBrickNear(py); t = rc ? { x: rc.x + 2, y: py } : randomTarget(); }
    else t = randomTarget();
    let mult = 1, isWeak = false;
    if (S.abil.weak) {
      const wp = weakPos();
      if (px !== undefined && Math.hypot(px - wp.x, py - wp.y) < 46 * K) { mult = 4 + 2 * S.abil.weak; isWeak = true; t = { x: wp.x, y: wp.y }; }
    }
    beams.push({ x1: HX + 26 * K, y1: GY - 76 * K, x2: t.x, y2: t.y, t: 0, c: isWeak ? '#ff2d55' : '#3df5ff' });
    hit(ST.tap, 'tap', t.x, t.y, { mult, color: isWeak ? '#ff2d55' : null });
    if (isWeak) { floatText(t.x, t.y - 30 * K, 'WEAK!', '#ff2d55', 18); weak.t = 99; }
    sfx.hit(S.combo);
    if (S.tut === 0 && S.stats.taps >= 6) S.tut = 1;
  }
  function weakPos() {
    const wx = wallX();
    const y = WALL.top + weak.y * WALL.h;
    const rc = aliveBrickNear(y);
    return { x: (rc ? rc.x : wx) + WALL.bw * 0.5, y };
  }
  function fireShot(fromX, fromY, dmg, color, target, kind) {
    const t = target || randomTarget();
    shots.push({ x: fromX, y: fromY, tx: t.x, ty: t.y, sx: fromX, sy: fromY, t: 0, dur: clamp((t.x - fromX) / (1300 * K), 0.08, 0.5), dmg, color, kind: kind || 'auto', arc: rand(-40, 40) * K });
  }

  function update(dt) {
    // 時間の流れ（会心や破壊の一瞬だけ遅く）
    let sdt = dt;
    if (slowT > 0) { slowT -= dt; sdt = dt * 0.3; }
    const fever = S.feverT > 0;
    if (breakT > 0) { breakT -= dt; if (breakT <= 0) afterBreak(); }
    else {
      const ev = WC.tick(S, sdt, ST);
      if (ev === 'fail') onFail();
      else if (ev === 'retry') { newWallVisual(); showBanner('自動で再挑戦！', '#3df5ff'); }
    }
    if (!S.advance) S.wallT = 0;
    if (S.feverT <= 0 && feverWas) { feverWas = false; refreshStats(); }
    // 自動攻撃
    const rate = ST.rate * (fever ? 1.6 : 1);
    if (ST.autoBase > 0) {
      autoAcc += sdt * rate;
      let guard = 0;
      while (autoAcc >= 1 && guard++ < 6) {
        autoAcc -= 1;
        const n = Math.min(ST.shots, 7);
        const per = (ST.autoBase / rate) * (ST.shots / n);
        for (let i = 0; i < n; i++) fireShot(HX + 26 * K, GY - 76 * K + (i - (n - 1) / 2) * 8 * K, per, fever ? `hsl(${(performance.now() / 4 + i * 40) % 360},100%,65%)` : '#3df5ff');
        sfx.shot();
      }
    }
    // 分身
    if (S.abil.clone && ST.autoDps > 0) {
      cloneAcc += sdt * rate * 0.8;
      while (cloneAcc >= 1) {
        cloneAcc -= 1;
        const n = Math.min(S.abil.clone, 6);
        for (let i = 0; i < n; i++) fireShot(clonePos(i).x + 18 * K, clonePos(i).y - 60 * K, (ST.autoDps * 0.45 * S.abil.clone / n) / (rate * 0.8), '#ff5af0', null, 'clone');
      }
    }
    // ドローン
    if (S.abil.drone && ST.autoBase > 0) {
      droneAcc += sdt * 4;
      while (droneAcc >= 1) {
        droneAcc -= 1;
        const n = Math.min(S.abil.drone, 5);
        for (let i = 0; i < n; i++) { const d = dronePos(i); fireShot(d.x, d.y, (ST.autoBase * 0.35 * S.abil.drone / n) / 4, '#5affc8', S.abil.weak ? weakPos() : null, 'drone'); }
      }
    }
    // 雷
    if (S.abil.thunder) {
      thunderT += sdt;
      if (thunderT >= WC.thunderCd(S.abil.thunder)) { thunderT = 0; doThunder(); }
    }
    // 隕石
    if (S.abil.meteor) {
      meteorT += sdt;
      if (meteorT >= WC.meteorCd(S.abil.meteor)) { meteorT = 0; const t = randomTarget(); meteors.push({ x: t.x - W * 0.5, y: -60, tx: t.x + WALL.bw, ty: t.y, t: 0, dur: 0.7 }); }
    }
    // ドリル
    if (S.abil.drill && S.wallHp > 0 && breakT <= 0) {
      drillAcc += sdt;
      while (drillAcc >= 0.1) { drillAcc -= 0.1; const y = WALL.top + (0.5 + 0.42 * Math.sin(performance.now() / 600)) * WALL.h; const rc = aliveBrickNear(y); hit(ST.ref * 0.5 * S.abil.drill * 0.1, 'drill', rc ? rc.x : wallX(), y, { noCrit: true }); if (Math.random() < 0.6) spark(rc ? rc.x : wallX(), y, '#c8ff5a', fxN(2), 300); }
    }
    // 弱点が動く
    if (S.abil.weak) { weak.t += sdt; if (weak.t > 2.6) { weak.t = 0; weak.y = rand(0.1, 0.9); } }
    // 自動強化
    if (S.abil.autobuy) {
      autoBuyT += dt;
      const gap = 2.4 / S.abil.autobuy;
      if (autoBuyT >= gap) { autoBuyT = 0; const b = WC.bestBuy(S); if (b) { WC.buy(S, b, 1); afterBuy(b, true); } }
    }
    // フィーバー自動
    if (S.abil.fever && S.fever >= 100 && S.feverT <= 0) triggerFever();
    // 長押し
    if (holding && breakT <= 0) { holdAcc += dt; while (holdAcc >= 1 / 9) { holdAcc -= 1 / 9; tapAttack(holdX, holdY); } }
    // 迫る壁
    const target = S.advance ? clamp(S.wallT / ST.time, 0, 1) : 0;
    wallVisP += (target - wallVisP) * Math.min(1, dt * 6);
    if (S.advance && target > 0.75 && breakT <= 0) sfx.warn();
    wallSlide = Math.max(0, wallSlide - dt * 3.2);
    wallShake = Math.max(0, wallShake - dt * 40);
    wallFlash = Math.max(0, wallFlash - dt * 4);
    shake = Math.max(0, shake - dt * 60);
    flash = Math.max(0, flash - dt * 2.5);
    punchT = Math.max(0, punchT - dt);
    // 演出の動き
    for (let i = shots.length - 1; i >= 0; i--) {
      const p = shots[i]; p.t += sdt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      if (k >= 1) { shots.splice(i, 1); hit(p.dmg, p.kind, p.tx, p.ty, { color: p.kind === 'clone' ? '#ff5af0' : p.kind === 'drone' ? '#5affc8' : null }); }
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.t += sdt;
      if (m.t >= m.dur) {
        meteors.splice(i, 1);
        sfx.meteor(); addShake(18); doFlash(0.35, '#ff8a3d');
        rings.push({ x: m.tx, y: m.ty, r: 10, max: 160 * K, life: 0.5, t: 0, c: '#ff8a3d' });
        for (let j = 0; j < fxN(24); j++) spawnDebris(m.tx, m.ty, ['#ff8a3d', '#ffd23f', '#5a2a10'][j % 3], rand(-500, 500) * K, rand(-700, -100) * K, rand(4, 10) * K);
        hit(ST.ref * 10 * S.abil.meteor, 'meteor', m.tx, m.ty, { big: true, color: '#ff8a3d' });
        S.wallT = Math.max(0, S.wallT - 0.15 * ST.time);
      }
    }
    const gr = 1500 * K;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += sdt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += gr * sdt * (p.spark ? 0.4 : 1); p.x += p.vx * sdt; p.y += p.vy * sdt; p.r += p.vr * sdt;
      if (!p.spark && p.y > GY - p.s / 2) { p.y = GY - p.s / 2; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
    }
    const gb = goldTarget();
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.t += sdt;
      if (c.t < c.home) { c.vy += gr * 0.8 * sdt; c.x += c.vx * sdt; c.y += c.vy * sdt; if (c.y > GY - 6) { c.y = GY - 6; c.vy *= -0.4; } }
      else {
        const dx = gb.x - c.x, dy = gb.y - c.y, d = Math.hypot(dx, dy);
        const sp = (900 + (c.t - c.home) * 2600) * K * sdt;
        if (d < sp + 8) { coins.splice(i, 1); sfx.coin(); bumpGold(); continue; }
        c.x += dx / d * sp; c.y += dy / d * sp;
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.t += dt; t.y += t.vy * K * dt; t.vy *= 0.94; if (t.t >= t.life) texts.splice(i, 1); }
    for (const arr of [bolts, rings, beams]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= (arr[i].life || 0.12)) arr.splice(i, 1); }
    for (let i = shocks.length - 1; i >= 0; i--) { shocks[i].t += dt; if (shocks[i].t > 0.5) shocks.splice(i, 1); }
    if (banner) { banner.t += dt; if (banner.t > 1.4) banner = null; }
  }
  function doThunder() {
    const t = randomTarget();
    const pts = [[t.x + rand(-40, 40), 0]];
    let y = 0;
    while (y < t.y) { y += rand(20, 46) * K; pts.push([t.x + rand(-26, 26) * K, Math.min(y, t.y)]); }
    pts[pts.length - 1] = [t.x, t.y];
    bolts.push({ pts, t: 0, life: 0.22 });
    sfx.thunder(); doFlash(0.18, '#bff6ff'); addShake(4);
    hit(ST.ref * (1.5 + 0.6 * S.abil.thunder), 'thunder', t.x, t.y, { color: '#7df9ff', big: true });
  }
  let feverWas = false;
  function triggerFever() {
    if (WC.startFever(S, ST)) {
      feverWas = true;
      sfx.fever(); showBanner('FEVER!!', '#ffd23f', `ダメージ ×${ST.feverMult}`); doFlash(0.5, '#ffd23f'); addShake(8);
    }
  }
  const clonePos = (i) => ({ x: HX - (24 + 22 * i) * K, y: GY - (i % 2) * 6 * K });
  const dronePos = (i) => ({ x: HX + (10 + 26 * i) * K, y: GY - (130 + 12 * Math.sin(performance.now() / 300 + i)) * K });
  function goldTarget() {
    const a = $('goldBox').getBoundingClientRect(), b = cv.getBoundingClientRect();
    return { x: a.left - b.left + 18, y: a.top - b.top + a.height / 2 };
  }
  let bumpT = 0;
  function bumpGold() { const g = $('goldBox'); g.classList.add('bump'); clearTimeout(bumpT); bumpT = setTimeout(() => g.classList.remove('bump'), 80); }

  // ================= 描画 =================
  function draw() {
    const now = performance.now();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bgZone !== zoneIdx(S.stage) || !bgCanvas) buildBg();
    const sx = shake ? rand(-shake, shake) : 0, sy = shake ? rand(-shake, shake) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(bgCanvas, -10, -10, W + 20, H + 20);
    const fever = S.feverT > 0;
    if (fever) { ctx.fillStyle = `hsla(${(now / 8) % 360},100%,60%,.12)`; ctx.fillRect(-10, -10, W + 20, H + 20); }
    // 危険
    if (S.advance && wallVisP > 0.6) { const a = (wallVisP - 0.6) * 1.2 * (0.6 + 0.4 * Math.sin(now / 90)); const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.8); g.addColorStop(0, 'rgba(255,0,60,0)'); g.addColorStop(1, `rgba(255,0,60,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    drawWall(now);
    drawHero(now, fever);
    // 弾
    ctx.globalCompositeOperation = 'lighter';
    for (const p of shots) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * K, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(p.x - 8 * K, p.y, 4 * K, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const b of beams) {
      const a = 1 - b.t / 0.12;
      ctx.strokeStyle = b.c; ctx.globalAlpha = a; ctx.lineWidth = 6 * K * a + 1;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const b of bolts) {
      const a = 1 - b.t / b.life;
      ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 5 * K; ctx.globalAlpha = a;
      ctx.beginPath(); b.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const r of rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.c; ctx.globalAlpha = 1 - k; ctx.lineWidth = 8 * K * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const s of shocks) {
      const k = s.t / 0.5, x = s.x + (wallX() - s.x) * Math.min(1, k * 2);
      ctx.fillStyle = `rgba(74,216,255,${1 - k})`;
      ctx.beginPath(); ctx.ellipse(x, GY, 30 * K, 60 * K * (1 - k * 0.5), 0, Math.PI, 0); ctx.fill();
    }
    for (const m of meteors) {
      const k = m.t / m.dur, x = m.x + (m.tx - m.x) * k, y = m.y + (m.ty - m.y) * k * k;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 40 * K);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#ffd23f'); g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40 * K, 0, 7); ctx.fill();
      for (let i = 1; i < 6; i++) { ctx.globalAlpha = 0.5 - i * 0.08; ctx.beginPath(); ctx.arc(x - i * 16 * K, y - i * 10 * K * (k + 0.3), (26 - i * 3) * K, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    // かけら
    for (const p of parts) {
      const a = Math.min(1, (p.life - p.t) * 3);
      ctx.globalAlpha = a; ctx.fillStyle = p.c;
      if (p.spark) { ctx.fillRect(p.x, p.y, p.s, p.s); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.7); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    // 金貨
    for (const c of coins) {
      const sq = Math.abs(Math.sin((c.t + c.home) * 14));
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#a06c00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 6 * K * (0.3 + 0.7 * sq), 6 * K, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // 数字
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of texts) {
      const k = t.t / t.life;
      const sc = k < 0.12 ? t.pop - (t.pop - 1) * (k / 0.12) : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${Math.round(t.size * sc)}px 'Dela Gothic One', sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    // 連打
    if (S.combo >= 5) {
      const sz = Math.min(44, 18 + S.combo * 0.25) * K;
      ctx.font = `${Math.round(sz)}px 'Dela Gothic One', sans-serif`;
      ctx.textAlign = 'left';
      ctx.lineWidth = 5; ctx.strokeStyle = '#000';
      const tx = `${S.combo} COMBO` + (S.abil.combo ? `  ×${WC.comboMult(S).toFixed(2)}` : '');
      ctx.strokeText(tx, 12, H * 0.32); ctx.fillStyle = `hsl(${(S.combo * 7) % 360},100%,65%)`; ctx.fillText(tx, 12, H * 0.32);
      ctx.textAlign = 'center';
    }
    // 大きな字
    if (banner) {
      const k = banner.t / 1.4;
      const sc = k < 0.1 ? 2.2 - 1.2 * (k / 0.1) : 1 + (k - 0.1) * 0.08;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.save(); ctx.translate(W / 2, H * 0.45); ctx.rotate(-0.06); ctx.scale(sc, sc);
      ctx.font = `${Math.round(Math.min(64, W / 9))}px 'Dela Gothic One', sans-serif`;
      ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(banner.text, 0, 0);
      ctx.fillStyle = banner.color; ctx.fillText(banner.text, 0, 0);
      if (banner.sub) { ctx.font = `${Math.round(Math.min(22, W / 26))}px 'Dela Gothic One', sans-serif`; ctx.lineWidth = 5; ctx.strokeText(banner.sub, 0, Math.min(48, W / 12)); ctx.fillStyle = '#fff'; ctx.fillText(banner.sub, 0, Math.min(48, W / 12)); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (flash > 0) { ctx.globalAlpha = Math.min(0.8, flash); ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  function drawWall(now) {
    const z = zoneOf(S.stage), wx = wallX(), boss = WC.isBoss(S.stage);
    const f = 1 - S.wallHp / S.wallMax;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(wx + 8, GY - 4, WALL.w + 20, 10);
    if (z.glow) { ctx.shadowColor = z.glow; ctx.shadowBlur = 18; }
    const gap = Math.max(1.5, 2.5 * K);
    for (const b of bricks) {
      if (b.broken) continue;
      const rc = brickRect(b, wx);
      let col = b.gold ? (b.c % 2 ? '#ffe066' : '#ffcc22') : z.brick[(b.r + b.c) % 2];
      ctx.fillStyle = z.mortar; ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      ctx.fillStyle = col; ctx.fillRect(rc.x + gap / 2, rc.y + gap / 2, rc.w - gap, rc.h - gap);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(rc.x + gap / 2, rc.y + gap / 2, rc.w - gap, 3 * K);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rc.x + gap / 2, rc.y + rc.h - gap / 2 - 3 * K, rc.w - gap, 3 * K);
      if (z.rivet) { ctx.fillStyle = '#c8d2dc'; ctx.fillRect(rc.x + 4, rc.y + 4, 3, 3); ctx.fillRect(rc.x + rc.w - 7, rc.y + 4, 3, 3); }
      if (b.gold) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(now / 150 + b.cr * 6)})`; ctx.fillRect(rc.x + rc.w * 0.2, rc.y + gap, rc.w * 0.15, rc.h - gap * 2); }
      // ひび
      const near = b.o - f;
      if (near < 0.12 && f > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        const cx = rc.x + rc.w * (0.3 + b.cr * 0.4), cy = rc.y + rc.h * 0.5;
        ctx.moveTo(cx, rc.y + 2); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx - 3, rc.y + rc.h - 2);
        if (near < 0.06) { ctx.moveTo(cx + 5, cy); ctx.lineTo(rc.x + rc.w - 3, cy + 3); }
        ctx.stroke();
      }
      if (z.glow) { ctx.shadowColor = z.glow; ctx.shadowBlur = 18; }
    }
    ctx.shadowBlur = 0;
    if (wallFlash > 0) {
      ctx.globalAlpha = wallFlash * 0.5; ctx.fillStyle = '#fff';
      for (const b of bricks) if (!b.broken) { const rc = brickRect(b, wx); ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
      ctx.globalAlpha = 1;
    }
    if (boss && S.wallHp > 0) {
      ctx.strokeStyle = `rgba(255,61,129,${0.5 + 0.4 * Math.sin(now / 120)})`; ctx.lineWidth = 3;
      ctx.strokeRect(wx, WALL.top, WALL.w, WALL.h);
      // とげ
      ctx.fillStyle = '#2a0a14';
      for (let y = WALL.top + 10; y < GY - 10; y += 26 * K) { const rc = aliveBrickNear(y); if (!rc) continue; ctx.beginPath(); ctx.moveTo(rc.x, y); ctx.lineTo(rc.x - 14 * K, y + 8 * K); ctx.lineTo(rc.x, y + 16 * K); ctx.fill(); }
      // どくろ
      ctx.font = `${Math.round(WALL.w * 0.35)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.5 * (1 - f); ctx.fillText('💀', wx + WALL.w * 0.42, WALL.top + WALL.h * 0.4); ctx.globalAlpha = 1;
    }
    // 弱点
    if (S.abil.weak && S.wallHp > 0 && breakT <= 0) {
      const p = weakPos(), r = (18 + 4 * Math.sin(now / 100)) * K;
      ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - r - 6, p.y); ctx.lineTo(p.x + r + 6, p.y); ctx.moveTo(p.x, p.y - r - 6); ctx.lineTo(p.x, p.y + r + 6); ctx.stroke();
      ctx.fillStyle = 'rgba(255,45,85,.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    }
    // ドリル
    if (S.abil.drill && S.wallHp > 0 && breakT <= 0) {
      const y = WALL.top + (0.5 + 0.42 * Math.sin(now / 600)) * WALL.h; const rc = aliveBrickNear(y); const x = rc ? rc.x : wx;
      ctx.save(); ctx.translate(x - 4, y);
      ctx.fillStyle = '#9aa0aa'; ctx.fillRect(-56 * K, -9 * K, 30 * K, 18 * K);
      ctx.fillStyle = '#c8ff5a'; ctx.beginPath(); ctx.moveTo(-28 * K, -14 * K); ctx.lineTo(4 * K, 0); ctx.lineTo(-28 * K, 14 * K); ctx.fill();
      ctx.strokeStyle = '#4a6a1a'; ctx.lineWidth = 2; const ph = (now / 30) % 8;
      for (let i = 0; i < 4; i++) { const xx = (-26 + i * 8 + ph) * K; ctx.beginPath(); ctx.moveTo(xx, -12 * K * (1 - (xx / K + 28) / 32)); ctx.lineTo(xx + 4 * K, 12 * K * (1 - (xx / K + 28) / 32)); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawFighter(x, y, now, opts) {
    const k = K * 1.25 * (opts.scale || 1);
    const bob = Math.sin(now / 220 + (opts.ph || 0)) * 2 * k;
    const punch = opts.punch || 0;
    ctx.save(); ctx.translate(x, y);
    if (opts.alpha) ctx.globalAlpha = opts.alpha;
    // オーラ
    if (opts.aura) {
      const g = ctx.createRadialGradient(0, -50 * k, 10 * k, 0, -50 * k, 70 * k);
      g.addColorStop(0, opts.aura); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -50 * k, 70 * k, 0, 7); ctx.fill();
    }
    const body = opts.body || '#2b2350', accent = opts.accent || '#3df5ff';
    // 足
    ctx.fillStyle = '#16122a';
    ctx.fillRect(-12 * k, -30 * k, 9 * k, 30 * k); ctx.fillRect(3 * k, -30 * k, 9 * k, 30 * k);
    ctx.fillStyle = '#fff'; ctx.fillRect(-14 * k, -4 * k, 13 * k, 5 * k); ctx.fillRect(2 * k, -4 * k, 13 * k, 5 * k);
    // 後ろの腕
    ctx.fillStyle = body;
    const backArm = opts.arm === 1 ? punch : 0, frontArm = opts.arm === 1 ? 0 : punch;
    ctx.fillRect(-4 * k, (-62 + bob / k) * k, (14 + 26 * backArm) * k, 8 * k);
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc((12 + 26 * backArm) * k, (-58) * k + bob, 6 * k, 0, 7); ctx.fill();
    // 胴
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-15 * k, -68 * k + bob, 30 * k, 40 * k, 6 * k); ctx.fill();
    ctx.fillStyle = accent; ctx.fillRect(-15 * k, -46 * k + bob, 30 * k, 4 * k);
    // 頭
    ctx.fillStyle = '#ffd9b8'; ctx.beginPath(); ctx.arc(2 * k, -84 * k + bob, 15 * k, 0, 7); ctx.fill();
    ctx.fillStyle = opts.hair || '#1a1030';
    ctx.beginPath(); ctx.moveTo(-14 * k, -86 * k + bob);
    for (let i = 0; i < 5; i++) ctx.lineTo((-12 + i * 7) * k, (-106 + (i % 2) * 8) * k + bob);
    ctx.lineTo(16 * k, -88 * k + bob); ctx.lineTo(4 * k, -94 * k + bob); ctx.closePath(); ctx.fill();
    // はちまき
    ctx.fillStyle = opts.band || '#ff3d81'; ctx.fillRect(-13 * k, -92 * k + bob, 30 * k, 5 * k);
    ctx.beginPath(); ctx.moveTo(-13 * k, -91 * k + bob);
    const fl = Math.sin(now / 90) * 5 * k;
    ctx.lineTo(-30 * k, -96 * k + bob + fl); ctx.lineTo(-28 * k, -88 * k + bob + fl); ctx.closePath(); ctx.fill();
    // 目
    ctx.fillStyle = '#1a1030'; ctx.fillRect(8 * k, -86 * k + bob, 3 * k, 5 * k);
    // 前の腕
    ctx.fillStyle = body;
    ctx.fillRect(-2 * k, (-60) * k + bob, (16 + 30 * frontArm) * k, 9 * k);
    ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc((16 + 30 * frontArm) * k, -55 * k + bob, 7.5 * k, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  function drawHero(now, fever) {
    for (let i = Math.min(S.abil.clone, 6) - 1; i >= 0; i--) {
      const p = clonePos(i);
      drawFighter(p.x, p.y, now, { alpha: 0.55, body: '#5a1a5a', accent: '#ff5af0', band: '#ff5af0', ph: i, scale: 0.85 });
    }
    const pk = punchT > 0 ? Math.sin((1 - punchT / 0.12) * Math.PI) : 0;
    const danger = S.advance && wallVisP > 0.75;
    drawFighter(HX + (danger ? rand(-1.5, 1.5) : 0), GY, now, { punch: pk, arm: punchArm, aura: fever ? `hsla(${(now / 5) % 360},100%,60%,.55)` : null });
    for (let i = 0; i < Math.min(S.abil.drone, 5); i++) {
      const d = dronePos(i);
      ctx.fillStyle = '#2a3a4a'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 12 * K, 5 * K, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5affc8'; ctx.beginPath(); ctx.arc(d.x, d.y - 2 * K, 4 * K, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(d.x - 14 * K, d.y - 6 * K); ctx.lineTo(d.x + 14 * K, d.y - 6 * K); ctx.stroke();
    }
  }

  // ================= HUD =================
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function hud() {
    setText('goldV', fmt(S.gold));
    setText('soulV', fmt(S.shards));
    setText('dpsV', '毎秒 約' + fmt(WC.power(S, 0)) + '（自動）');
    const boss = WC.isBoss(S.stage);
    setText('zoneV', `ZONE ${zoneIdx(S.stage) + 1}　${zoneName(S.stage)}`);
    setText('stgV', (boss ? '⚠ BOSS ' : 'STAGE ') + S.stage + (S.advance ? '' : '（稼ぎ中）'));
    $('stgV').classList.toggle('boss', boss);
    $('hpBar').firstChild.style.width = (100 * S.wallHp / S.wallMax).toFixed(1) + '%';
    setText('hpV', fmt(S.wallHp) + ' / ' + fmt(S.wallMax));
    const left = S.advance ? Math.max(0, 1 - S.wallT / ST.time) : 1;
    $('tmBar').firstChild.style.width = (100 * left).toFixed(1) + '%';
    $('tmBar').classList.toggle('danger', S.advance && left < 0.25);
    const fb = $('feverBtn');
    const on = S.feverT > 0;
    fb.firstChild.style.width = (on ? 100 * S.feverT / ST.feverDur : S.fever) + '%';
    fb.classList.toggle('ready', !on && S.fever >= 100);
    fb.classList.toggle('on', on);
    setText('feverTx', on ? `FEVER ×${ST.feverMult} ${S.feverT.toFixed(0)}s` : S.fever >= 100 ? '🔥 FEVER! タップ' : `FEVER ${Math.floor(S.fever)}%`);
    $('retryBtn').hidden = S.advance;
    $('rebirthQuick').hidden = !(WC.shardsFor(S) > 0 && (!S.advance || S.runMax >= Math.max(25, S.bestStage * 0.9)) && tab !== 'rb');
    setText('rebirthQuick', `💎 転生 +${fmt(WC.shardsFor(S))}`);
    // 説明
    const h = $('hint');
    let ht = '';
    if (S.tut === 0) ht = '👆 画面をタップして壁をなぐれ！';
    else if (S.tut === 1 && S.gold >= WC.upgCost(S, 'power', 1)) ht = (isWide() ? '→' : '↓') + ' 金貨で「強化」を買おう！';
    else if (S.tut === 2 && S.stage >= 3) { ht = '⏳ 時間内にこわせ！ 壁が迫りきると押し返される'; tutT += 1 / 60; if (tutT > 5) S.tut = 3; }
    h.hidden = !ht; if (ht) setText('hint', ht);
  }
  let tutT = 0;
  const isWide = () => window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches;

  // ================= 板（タブ） =================
  let tab = 'up';
  const rowRefs = {};
  function buyAmtLabel() { const b = S.opt.buy; return b === 'max' ? 'MAX' : '×' + b; }
  function renderTab() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('body'), bar = $('buybar');
    body.innerHTML = ''; Object.keys(rowRefs).forEach((k) => delete rowRefs[k]);
    bar.hidden = !(tab === 'up' || tab === 'rb');
    bar.innerHTML = '<span>まとめ買い</span>' + [1, 10, 100, 'max'].map((v) => `<button data-b="${v}" class="${S.opt.buy === v ? 'on' : ''}">${v === 'max' ? 'MAX' : '×' + v}</button>`).join('') + '<span class="sp"></span>';
    bar.querySelectorAll('button').forEach((b) => b.onclick = () => { S.opt.buy = b.dataset.b === 'max' ? 'max' : +b.dataset.b; renderTab(); });
    if (tab === 'up') {
      WC.UPG.forEach((u, i) => body.appendChild(upgRow(u, i)));
    } else if (tab === 'ab') {
      const owned = WC.ABIL.filter((a) => S.abil[a.id]);
      const sec = document.createElement('div'); sec.className = 'sect'; sec.textContent = `永久アビリティ（${owned.length} / ${WC.ABIL.length}）`; body.appendChild(sec);
      if (!owned.length) { const p = document.createElement('div'); p.className = 'help'; p.innerHTML = 'まだ持っていません。<b>ステージ 15</b> まで行って「転生」すると、<b>永久に残る能力</b>を 1 つ選べます。転生のたびに増えたり強くなったりします。'; body.appendChild(p); }
      WC.ABIL.forEach((a) => {
        const L = S.abil[a.id];
        const r = document.createElement('div'); r.className = 'row' + (L ? '' : ' locked');
        r.innerHTML = `<div class="ico" style="box-shadow:inset 0 0 0 2px ${a.color}">${a.icon}</div><div><div class="nm">${a.name} <span class="lv">${L ? 'Lv.' + L + (a.max ? ' / ' + a.max : '') : '未入手'}</span></div><div class="ds">${a.desc(Math.max(1, L))}</div></div><div></div>`;
        body.appendChild(r);
      });
    } else if (tab === 'rb') {
      const got = WC.shardsFor(S);
      const box = document.createElement('div'); box.className = 'rebirth';
      box.innerHTML = `<div style="font-size:12px;color:#d8ccff">この周回の最高ステージ <b style="font-size:16px;color:#fff">${S.runMax}</b>　転生 ${S.resets} 回</div>
        <div class="big">💎 +${fmt(got)} 魂コア</div>
        <p>${got > 0 ? '金貨と強化は 0 に戻るかわりに、<b>魂コア</b>と<b>永久アビリティ 1 つ</b>（' + WC.choiceCount(S) + ' 枚から選ぶ）が手に入る。先のステージほど魂コアが多い。' : 'ステージ <b>15</b> まで進むと転生できる。'}</p>
        <button class="rbig" id="doRebirth" ${got > 0 ? '' : 'disabled'}>${got > 0 ? '転生する' : 'ステージ 15 で解放'}</button>`;
      body.appendChild(box);
      box.querySelector('#doRebirth').onclick = askRebirth;
      const sec = document.createElement('div'); sec.className = 'sect'; sec.textContent = '魂コアの永久強化'; body.appendChild(sec);
      WC.PERM.forEach((p, i) => body.appendChild(upgRow(p, i, true)));
    } else if (tab === 'ac') {
      const n = WC.achCount(S);
      const sec = document.createElement('div'); sec.className = 'sect g'; sec.textContent = `実績 ${n} / ${WC.ACH.length}　（1 つにつき全ダメージ +${WC.ACH_DMG * 100}% → 今 +${Math.round(n * WC.ACH_DMG * 100)}%）`; body.appendChild(sec);
      WC.ACH.forEach((a) => {
        const v = a.f(S), done = !!S.ach[a.id];
        const r = document.createElement('div'); r.className = 'ach' + (done ? ' done' : '');
        r.innerHTML = `<div>${done ? '✅' : '⬜'} ${a.name}</div><div class="rw">💎 ${a.reward}</div><div class="pg"><i style="width:${Math.min(100, 100 * v / a.goal)}%"></i></div>`;
        body.appendChild(r);
      });
    } else if (tab === 'op') {
      const opt = (label, key, vals, names) => {
        const r = document.createElement('div'); r.className = 'opt';
        r.innerHTML = `<span>${label}</span><span class="seg">${vals.map((v, i) => `<button data-v="${i}" class="${S.opt[key] === v ? 'on' : ''}">${names[i]}</button>`).join('')}</span>`;
        r.querySelectorAll('button').forEach((b) => b.onclick = () => { S.opt[key] = vals[+b.dataset.v]; applyVolume(); updSnd(); renderTab(); });
        body.appendChild(r);
      };
      opt('効果音', 'sfx', [true, false], ['オン', 'オフ']);
      opt('BGM', 'bgm', [true, false], ['オン', 'オフ']);
      opt('演出の量', 'fx', [0, 1, 2], ['少ない', '普通', '多い']);
      const st = S.stats;
      const info = document.createElement('div'); info.className = 'help';
      info.innerHTML = `<b>記録</b>　最高ステージ ${S.bestStage} ／ こわした壁 ${fmt(st.walls)} ／ 最大ダメージ ${fmt(st.maxHit)} ／ タップ ${fmt(st.taps)} ／ 遊んだ時間 ${Math.floor(st.play / 3600)}時間${Math.floor(st.play / 60) % 60}分 ／ 魂コア累計 ${fmt(S.totalShards)}`;
      body.appendChild(info);
      const r2 = document.createElement('div'); r2.className = 'opt';
      r2.innerHTML = '<span>セーブ</span><span class="seg"><button class="wbtn" id="exBtn">書き出す</button><button class="wbtn" id="imBtn">読み込む</button></span>';
      body.appendChild(r2);
      r2.querySelector('#exBtn').onclick = exportSave; r2.querySelector('#imBtn').onclick = importSave;
      const r3 = document.createElement('div'); r3.className = 'opt';
      r3.innerHTML = '<span>データを消して最初から</span><button class="wbtn danger" id="wipeBtn">消す</button>';
      body.appendChild(r3);
      r3.querySelector('#wipeBtn').onclick = () => modal('本当に消しますか？', '<p>すべての記録・魂コア・アビリティが消えます。元に戻せません。</p>', [{ t: 'やめる' }, { t: '消す', cls: 'pri', f: () => { S = WC.newState(); refreshStats(); save(); newWallVisual(); bgZone = -1; renderTab(); } }]);
      const help = document.createElement('div'); help.className = 'help';
      help.innerHTML = `<b>遊び方</b><br>・画面をタップ（PC はクリックかスペース）で壁をなぐる。長押しで連打。<br>・金貨で「強化」を買う。パンチ力と気功弾は <b>25 Lv ごとに ×2</b>。<br>・壁は時間とともに迫ってくる。時間切れだと 1 つ前のステージに<b>押し返される</b>。「▶ 再挑戦」で挑み直す。<br>・10 ステージごとに <b>BOSS 壁</b>（体力 ×5）。<br>・ゲージがたまったら <b>FEVER</b>（F キー）でダメージ ×3 以上。<br>・ステージ 15 から <b>転生</b>。強化は 0 に戻るが、魂コアと<b>永久アビリティ</b>が手に入り、次はもっと先へ行ける。<br>・アプリを閉じている間も少し金貨がたまる。`;
      body.appendChild(help);
    }
    updatePanel();
  }
  function upgRow(u, i, perm) {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<div class="ico">${u.icon}</div><div style="min-width:0"><div class="nm">${u.name} <span class="lv"></span></div><div class="ds">${u.desc}${!perm && i < 7 ? '　<span style="opacity:.6">[' + (i + 1) + ']</span>' : ''}</div><div class="ef"></div><div class="ms"></div></div><button class="buy${perm ? ' soul' : ''}"></button>`;
    const btn = r.querySelector('.buy');
    btn.onclick = () => buyClick(u.id, perm);
    rowRefs[u.id] = { lv: r.querySelector('.lv'), ef: r.querySelector('.ef'), ms: r.querySelector('.ms'), btn, perm };
    return r;
  }
  function effectText(id, n) {
    const now = WC.stats(S);
    const tgt = WC.UPG_BY[id] ? S.upg : S.perm;
    tgt[id] += n; const nx = WC.stats(S); tgt[id] -= n;
    const pct = (v) => (v * 100).toFixed(0) + '%';
    switch (id) {
      case 'power': return `タップ ${fmt(now.tap)} → <b>${fmt(nx.tap)}</b>`;
      case 'auto': case 'speed': case 'multi': return `毎秒 ${fmt(now.autoDps)} → <b>${fmt(nx.autoDps)}</b>`;
      case 'crit': return `会心率 ${pct(now.critP)} → <b>${pct(nx.critP)}</b>`;
      case 'critdmg': return `会心 ×${now.critM.toFixed(1)} → <b>×${nx.critM.toFixed(1)}</b>`;
      case 'goldup': case 'p_gold': return `金貨 ×${fmt(now.goldMult)} → <b>×${fmt(nx.goldMult)}</b>`;
      case 'p_dmg': return `全ダメージ ×${fmt(now.dmgMult)} → <b>×${fmt(nx.dmgMult)}</b>`;
      case 'p_time': return `制限時間 ${now.time}秒 → <b>${nx.time}秒</b>`;
      case 'p_crit': return `会心率 ${pct(now.critP)}・×${now.critM.toFixed(1)} → <b>${pct(nx.critP)}・×${nx.critM.toFixed(1)}</b>`;
      case 'p_fever': return `フィーバー ×${now.feverMult}・${now.feverDur.toFixed(1)}秒 → <b>×${nx.feverMult}・${nx.feverDur.toFixed(1)}秒</b>`;
      case 'p_start': return `転生後の金貨 ${S.perm.p_start ? fmt(WC.goldFor(4 * S.perm.p_start) * 8) : 0} → <b>${fmt(WC.goldFor(4 * (S.perm.p_start + n)) * 8)}</b>`;
      case 'p_shard': return `魂コア +${S.perm.p_shard * 25}% → <b>+${(S.perm.p_shard + n) * 25}%</b>`;
      case 'p_choice': return `選択肢 ${3 + S.perm.p_choice} 枚 → <b>${3 + S.perm.p_choice + n} 枚</b>`;
      case 'p_offline': return `留守の間 ${25 + 15 * S.perm.p_offline}% → <b>${25 + 15 * (S.perm.p_offline + n)}%</b>`;
    }
    return '';
  }
  function updatePanel() {
    for (const id in rowRefs) {
      const ref = rowRefs[id];
      const L = (ref.perm ? S.perm : S.upg)[id];
      const max = WC.maxLv(id);
      const money = ref.perm ? S.shards : S.gold;
      let n = WC.canBuyN(S, id, S.opt.buy);
      const showN = n || (L < max ? 1 : 0);
      const cost = showN ? WC.upgCost(S, id, showN) : 0;
      const ok = n > 0 && cost <= money;
      const lvT = 'Lv.' + L + (isFinite(max) ? ' / ' + max : '');
      if (ref._lv !== lvT) { ref._lv = lvT; ref.lv.textContent = lvT; }
      const efT = L >= max ? '最大' : effectText(id, showN || 1);
      if (ref._ef !== efT) { ref._ef = efT; ref.ef.innerHTML = efT; }
      let ms = '';
      if (id === 'power' || id === 'auto') ms = `あと ${25 - (L % 25)} Lv で ×2！`;
      if (ref._ms !== ms) { ref._ms = ms; ref.ms.textContent = ms; }
      const bt = L >= max ? '<small>最大</small>MAX' : `<small>${ref.perm ? '💎' : '🪙'} ${showN > 1 ? '×' + showN : ''}</small>${fmt(cost)}`;
      if (ref._bt !== bt) { ref._bt = bt; ref.btn.innerHTML = bt; }
      ref.btn.classList.toggle('ok', ok);
      ref.btn.classList.toggle('max', L >= max);
    }
    // タブの赤い点
    const dot = (t, on) => { const b = document.querySelector(`#tabs button[data-t="${t}"]`); let d = b.querySelector('.dot'); if (on && !d) { d = document.createElement('span'); d.className = 'dot'; b.appendChild(d); } else if (!on && d) d.remove(); };
    dot('up', tab !== 'up' && WC.UPG.some((u) => S.upg[u.id] < WC.maxLv(u.id) && WC.upgCost(S, u.id, 1) <= S.gold));
    dot('rb', tab !== 'rb' && (WC.shardsFor(S) > 0 && !S.advance || WC.PERM.some((p) => S.perm[p.id] < WC.maxLv(p.id) && WC.upgCost(S, p.id, 1) <= S.shards)));
  }
  function buyClick(id, perm) {
    const n = WC.canBuyN(S, id, S.opt.buy);
    if (!n || !WC.buy(S, id, n)) return;
    initAudio();
    afterBuy(id, false, n);
  }
  function afterBuy(id, auto, n) {
    const prev = WC.stats(S);
    refreshStats();
    sfx.buy();
    if (S.tut === 1) S.tut = 2;
    if (id === 'power' || id === 'auto') {
      const L = S.upg[id];
      const m = Math.floor(L / 25);
      if (m > lastMilestone[id] && m > Math.floor((L - (n || 1)) / 25)) {
        sfx.milestone();
        showBanner(`${WC.UPG_BY[id].name} ×2!!`, '#ffd23f', `Lv.${m * 25} 突破`);
        doFlash(0.25, '#ffd23f');
      }
      lastMilestone[id] = m;
    }
    if (id === 'multi') showBanner('多重弾 +1!!', '#3df5ff');
    if (!auto) {
      const ref = rowRefs[id];
      if (ref) { ref.btn.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 160 }); }
    }
    void prev;
    updatePanel();
  }

  // ================= 転生 =================
  function askRebirth() {
    const got = WC.shardsFor(S);
    if (got <= 0) return;
    modal('転生しますか？', `<div class="gain">💎 +${fmt(got)}</div><p>金貨・強化・ステージは最初に戻ります。<br>魂コアと、永久アビリティ 1 つ（${WC.choiceCount(S)} 枚から選ぶ）は<b>ずっと残ります</b>。</p>`,
      [{ t: 'まだ続ける' }, { t: '転生する', cls: 'soulb', f: chooseAbility }]);
  }
  function chooseAbility() {
    const ch = WC.abilityChoices(S, Math.random);
    const cards = ch.map((id, i) => {
      const a = WC.ABIL_BY[id], L = S.abil[id];
      return `<button class="card" data-id="${id}" style="--c:${a.color};animation-delay:${i * 0.08}s">${L ? '' : '<span class="new">NEW</span>'}<span class="ci">${a.icon}</span><span class="cn">${a.name}</span><span class="cl">${L ? 'Lv.' + L + ' → ' + (L + 1) : 'Lv.1'}</span><span class="cd">${a.desc(L + 1)}</span></button>`;
    }).join('');
    modal('永久アビリティを選べ', `<div class="cards">${cards}</div>`, []);
    $('modal').querySelectorAll('.card').forEach((c) => c.onclick = () => { closeModal(); rebirth(c.dataset.id); });
    sfx.ach();
  }
  function rebirth(abilId) {
    const got = WC.doReset(S, abilId);
    sfx.rebirth();
    doFlash(1, '#b98bff');
    refreshStats();
    shots.length = 0; meteors.length = 0;
    newWallVisual(); bgZone = -1;
    const a = WC.ABIL_BY[abilId];
    setTimeout(() => showBanner('REBIRTH!!', '#b98bff', `${a.icon} ${a.name} Lv.${S.abil[abilId]}　💎+${fmt(got)}`), 200);
    checkAch();
    tab = 'rb'; renderTab();
    toast(`💎 魂コア +${fmt(got)}　永久強化を買おう！`, 'soul');
    save();
  }

  // ================= 窓・知らせ =================
  function modal(title, html, btns) {
    const m = $('modal');
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><h2>${title}</h2>${html}<div class="mbtns"></div></div>`;
    const bb = m.querySelector('.mbtns');
    btns.forEach((b) => {
      const e = document.createElement('button'); e.textContent = b.t; if (b.cls) e.className = b.cls;
      e.onclick = () => { closeModal(); if (b.f) b.f(); };
      bb.appendChild(e);
    });
    m.hidden = false;
  }
  function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; }
  function toast(t, cls) {
    const box = $('toasts');
    while (box.children.length >= 2) box.firstChild.remove();
    const e = document.createElement('div'); e.className = 'toast' + (cls ? ' ' + cls : ''); e.textContent = t;
    box.appendChild(e); setTimeout(() => e.remove(), 3100);
  }
  function checkAch() {
    const got = WC.checkAch(S);
    got.forEach((a, i) => setTimeout(() => { toast(`🏅 実績「${a.name}」 💎+${a.reward}`, 'soul'); sfx.ach(); }, i * 400));
    if (got.length) { refreshStats(); if (tab === 'ac') renderTab(); }
  }
  function exportSave() {
    let code = '';
    try { code = btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) { code = ''; }
    modal('セーブの書き出し', `<p>この文字を別の機械で「読み込む」に貼ると続きから遊べます。</p><textarea id="saveCode" readonly>${code}</textarea>`, [{ t: 'コピー', cls: 'pri', f: () => { try { navigator.clipboard.writeText(code).then(() => toast('コピーしました'), () => toast('コピーできませんでした。文字を選んでコピーしてください')); } catch (e) { toast('コピーできませんでした'); } } }, { t: '閉じる' }]);
    const ta = $('saveCode'); if (ta) { ta.focus(); ta.select(); }
  }
  function importSave() {
    modal('セーブの読み込み', '<p>書き出した文字を貼ってください。今のデータは上書きされます。</p><textarea id="loadCode"></textarea>', [{ t: 'やめる' }, { t: '読み込む', cls: 'pri' }]);
    const okBtn = $('modal').querySelector('.pri');
    okBtn.onclick = () => {
      const v = $('loadCode').value.trim();
      try {
        const obj = JSON.parse(decodeURIComponent(escape(atob(v))));
        if (!obj || typeof obj !== 'object' || !obj.upg) throw new Error('bad');
        S = WC.fix(obj); refreshStats(); newWallVisual(); bgZone = -1; save(); closeModal(); renderTab(); toast('読み込みました');
      } catch (e) { toast('読み込めませんでした。文字が全部あるか確かめてください'); }
    };
  }

  // ================= 入力 =================
  let holding = false, holdX = 0, holdY = 0, holdAcc = 0, holdId = null;
  function localXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    const [x, y] = localXY(e);
    tapAttack(x, y);
    holding = true; holdX = x; holdY = y; holdAcc = -0.25; holdId = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 古いブラウザ */ }
  });
  cv.addEventListener('pointermove', (e) => { if (holding && e.pointerId === holdId) { [holdX, holdY] = localXY(e); } });
  const endHold = (e) => { if (e.pointerId === holdId) holding = false; };
  cv.addEventListener('pointerup', endHold); cv.addEventListener('pointercancel', endHold);
  window.addEventListener('blur', () => { holding = false; });
  window.addEventListener('keydown', (e) => {
    if (!$('title').hidden || !$('modal').hidden) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat || Math.random() < 0.5) tapAttack(); }
    else if (e.code === 'KeyF') triggerFever();
    else if (e.code === 'KeyR') { tab = 'rb'; renderTab(); }
    else if (/^Digit[1-7]$/.test(e.code)) { const u = WC.UPG[+e.code.slice(5) - 1]; if (u) buyClick(u.id, false); }
  });
  $('feverBtn').onclick = () => { initAudio(); triggerFever(); };
  $('retryBtn').onclick = () => { initAudio(); WC.retry(S); newWallVisual(); showBanner('再挑戦！', '#3df5ff'); };
  $('rebirthQuick').onclick = () => { tab = 'rb'; renderTab(); askRebirth(); };
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; renderTab(); $('body').scrollTop = 0; });
  function updSnd() { $('sndBtn').textContent = S.opt.sfx || S.opt.bgm ? '🔊' : '🔇'; }
  $('sndBtn').onclick = () => { initAudio(); const on = !(S.opt.sfx || S.opt.bgm); S.opt.sfx = on; S.opt.bgm = on; applyVolume(); updSnd(); if (tab === 'op') renderTab(); };
  $('title').addEventListener('click', () => {
    initAudio();
    $('title').hidden = true;
    offlineCheck();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { offlineCheck(); } });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => { resize(); });

  function offlineCheck() {
    const sec = (Date.now() - (S.lastSave || Date.now())) / 1000;
    const g = WC.offline(S, sec);
    S.lastSave = Date.now();
    if (g > 0 && S.stats.walls > 5) {
      S.gold += g;
      const h = Math.floor(Math.min(sec, 8 * 3600) / 3600), m = Math.floor(Math.min(sec, 8 * 3600) / 60) % 60;
      modal('おかえり！', `<p>留守の ${h ? h + '時間' : ''}${m}分 の間に、気功弾が壁を削っていた。</p><div class="gain">🪙 +${fmt(g)}</div>`, [{ t: '受け取る', cls: 'pri', f: () => { for (let i = 0; i < 30; i++) spawnCoin(W / 2 + rand(-60, 60), H / 2); sfx.coin(); } }]);
    }
  }

  // ================= 回す =================
  let last = performance.now(), panelT = 0, saveT = 0, achT = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    if ($('title').hidden) {
      update(dt);
      panelT += dt; saveT += dt; achT += dt;
      if (panelT > 0.12) { panelT = 0; updatePanel(); }
      if (achT > 1) { achT = 0; checkAch(); }
      if (saveT > 10) { saveT = 0; save(); }
    }
    draw();
    hud();
    requestAnimationFrame(frame);
  }
  function start() {
    resize();
    lastMilestone = { power: Math.floor(S.upg.power / 25), auto: Math.floor(S.upg.auto / 25) };
    newWallVisual();
    renderTab(); updSnd();
    if (hotLoaded) $('title').hidden = true;
    requestAnimationFrame(frame);
    // テスト用の入口
    window.__wc = { dbg: () => ({ W, H, WALL, wallSlide, wallVisP, wx: wallX(), alive: bricks.filter((b) => !b.broken).length, n: bricks.length, breakT }), get S() { return S; }, set S(v) { S = WC.fix(v); refreshStats(); newWallVisual(); renderTab(); }, tap: tapAttack, step: (sec) => { for (let i = 0; i < sec * 60; i++) update(1 / 60); }, rebirth, refresh: () => { refreshStats(); renderTab(); } };
  }
  const boot = (data) => { useHot(data); refreshStats(); start(); };
  const go = () => {
    const run = () => (HOT && HOT.ready ? HOT.ready(boot) : boot(HOT && HOT.data));
    document.fonts && document.fonts.ready ? document.fonts.ready.then(run, run) : run();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
