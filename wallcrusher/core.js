// WALL CRUSHER ∞ — 計算の中心（描画なし）。ブラウザでは window.WC、Node では globalThis.WC。
(function (G) {
  'use strict';

  // ---------- 数字の書き方 ----------
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
    const e = Math.floor(Math.log10(n) / 3);
    let s;
    if (e < SUF.length) s = SUF[e];
    else {
      const k = e - SUF.length;
      s = String.fromCharCode(97 + (Math.floor(k / 26) % 26)) + String.fromCharCode(97 + (k % 26));
    }
    const v = n / Math.pow(10, e * 3);
    return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + s;
  }

  // ---------- 壁 ----------
  const isBoss = (s) => s % 10 === 0;
  function hpFor(s) {
    let hp = 12 * Math.pow(1.3, s - 1);
    return hp * (isBoss(s) ? 5 : 1);
  }
  function goldFor(s) {
    return 5 * Math.pow(1.235, s - 1) * (isBoss(s) ? 4 : 1);
  }

  // ---------- 1 回の周回の強化（金貨） ----------
  const UPG = [
    { id: 'power', icon: '👊', name: 'パンチ力', desc: 'タップの威力', base: 5, growth: 1.09 },
    { id: 'auto', icon: '🔥', name: '気功弾', desc: '自動で撃つ弾の毎秒ダメージ', base: 15, growth: 1.1 },
    { id: 'speed', icon: '💨', name: '連射', desc: '弾の速さ（毎秒ダメージ +12%）', base: 80, growth: 1.75, max: 30 },
    { id: 'crit', icon: '🎯', name: '会心率', desc: '会心の出やすさ +1%', base: 60, growth: 1.42, max: 45 },
    { id: 'critdmg', icon: '💥', name: '会心倍率', desc: '会心の威力 +0.5 倍', base: 250, growth: 1.5 },
    { id: 'multi', icon: '✴️', name: '多重弾', desc: '一度に撃つ弾 +1', base: 3000, growth: 14, max: 7 },
    { id: 'goldup', icon: '💰', name: '金運', desc: '手に入る金貨 +30%', base: 120, growth: 1.6 },
  ];
  const UPG_BY = Object.fromEntries(UPG.map((u) => [u.id, u]));

  // ---------- 永久アビリティ（転生ごとに 1 つ選ぶ） ----------
  const ABIL = [
    { id: 'thunder', icon: '⚡', name: '雷撃', color: '#7df9ff', desc: (L) => `${thunderCd(L).toFixed(1)}秒ごとに雷が落ちる（威力 ×${(1.5 + 0.6 * L).toFixed(1)}）` },
    { id: 'meteor', icon: '☄️', name: '隕石', color: '#ff8a3d', desc: (L) => `${meteorCd(L).toFixed(1)}秒ごとに巨大隕石（威力 ×${10 * L}）壁を押し返す` },
    { id: 'drill', icon: '🌀', name: 'ドリル', color: '#c8ff5a', desc: (L) => `壁を削り続ける（毎秒 基本×${(0.5 * L).toFixed(1)}）` },
    { id: 'clone', icon: '👥', name: '分身', color: '#ff5af0', desc: (L) => `分身 ${L} 体がいっしょに撃つ（1体 気功弾の45%）` },
    { id: 'midas', icon: '👑', name: '黄金の手', color: '#ffd84a', desc: (L) => `金貨 ×${(1 + 0.6 * L).toFixed(1)}` },
    { id: 'chrono', icon: '⏳', name: '時の砂', color: '#9ab8ff', desc: (L) => `制限時間 +${5 * L}秒・壁が迫るのが遅い`, max: 10 },
    { id: 'combo', icon: '🔗', name: '連打の極み', color: '#ff4a6e', desc: (L) => `連打するほど全ダメージ上昇（1連打 +${L}%、上限 ${comboCap(L)}連打）` },
    { id: 'blast', icon: '💣', name: '爆裂会心', color: '#ff6a00', desc: (L) => `会心が爆発して追加 +${50 * L}%` },
    { id: 'weak', icon: '🎯', name: '弱点看破', color: '#ff2d55', desc: (L) => `壁に弱点が出る。弱点タップ ×${4 + 2 * L}` },
    { id: 'drone', icon: '🛸', name: 'ドローン', color: '#5affc8', desc: (L) => `ドローン ${L} 機が弱点を撃つ（1機 気功弾の35%）` },
    { id: 'shock', icon: '🌊', name: '衝撃波', color: '#4ad8ff', desc: (L) => `20発ごとに衝撃波（威力 ×${3 * L}）壁を押し返す` },
    { id: 'fever', icon: '🌈', name: '熱狂体質', color: '#ff9cf5', desc: (L) => `フィーバーがたまりやすい ×${(1 + 0.35 * L).toFixed(2)}・自動発動・時間 +${(1.5 * L).toFixed(1)}秒` },
    { id: 'autobuy', icon: '🤖', name: '自動強化', color: '#a0ffa0', desc: (L) => `${(2.4 / L).toFixed(1)}秒ごとに一番お得な強化を自動で買う。押し返されても自動で再挑戦`, max: 6 },
    { id: 'warp', icon: '🚀', name: 'ワープ', color: '#b48aff', desc: (L) => `転生後ステージ ${1 + 5 * L} から始まる`, max: 30 },
    { id: 'greed', icon: '💎', name: '強欲', color: '#5ab0ff', desc: (L) => `転生で手に入る魂コア ×${(1 + 0.3 * L).toFixed(1)}` },
    { id: 'lucky', icon: '🍀', name: '幸運', color: '#7dff7d', desc: (L) => `金のレンガ ${(3 + 2 * L)}%・金のレンガの金貨 ×${1 + L}` },
  ];
  const ABIL_BY = Object.fromEntries(ABIL.map((a) => [a.id, a]));
  function thunderCd(L) { return Math.max(0.5, 2.6 - 0.18 * L); }
  function meteorCd(L) { return Math.max(3, 9 - 0.5 * L); }
  function comboCap(L) { return 30 + 15 * L; }

  // ---------- 永久強化（魂コア） ----------
  const PERM = [
    { id: 'p_dmg', icon: '💀', name: '破壊のコア', desc: '全ダメージ ×2', base: 2, growth: 1.5 },
    { id: 'p_gold', icon: '🪙', name: '黄金のコア', desc: '金貨 ×1.7', base: 2, growth: 1.55 },
    { id: 'p_time', icon: '⌛', name: '時のコア', desc: '制限時間 +3秒', base: 4, growth: 2, max: 10 },
    { id: 'p_crit', icon: '🎯', name: '会心のコア', desc: '会心率 +3%・会心倍率 +1', base: 3, growth: 1.9, max: 10 },
    { id: 'p_fever', icon: '🌈', name: '熱狂のコア', desc: 'フィーバー威力 +1倍・時間 +1秒', base: 4, growth: 1.9 },
    { id: 'p_start', icon: '🎒', name: '出発のコア', desc: '転生後の金貨が増える', base: 3, growth: 2.1, max: 15 },
    { id: 'p_shard', icon: '💎', name: '魂のコア', desc: '魂コア +25%', base: 10, growth: 2.2 },
    { id: 'p_choice', icon: '🃏', name: '選択のコア', desc: 'アビリティの選択肢 +1', base: 40, growth: 8, max: 2 },
    { id: 'p_offline', icon: '🌙', name: '留守番のコア', desc: '留守の間の金貨 +15%', base: 5, growth: 2, max: 5 },
  ];
  const PERM_BY = Object.fromEntries(PERM.map((p) => [p.id, p]));

  // ---------- 実績 ----------
  const ACH = [];
  function ach(id, name, f, goal, reward) { ACH.push({ id, name, f, goal, reward }); }
  [10, 100, 1000, 10000, 100000].forEach((g, i) => ach('walls' + g, `壁を ${fmt(g)} 枚こわす`, (s) => s.stats.walls, g, 2 + i * 3));
  [10, 25, 50, 75, 100, 150, 200, 300, 500].forEach((g, i) => ach('stage' + g, `ステージ ${g} に到達`, (s) => s.bestStage, g, 2 + i * 4));
  [1, 5, 20, 50, 100].forEach((g, i) => ach('reset' + g, `転生 ${g} 回`, (s) => s.resets, g, 3 + i * 4));
  [1e3, 1e6, 1e9, 1e12, 1e15, 1e18, 1e24, 1e30].forEach((g, i) => ach('hit' + i, `1発 ${fmt(g)} ダメージ`, (s) => s.stats.maxHit, g, 2 + i * 3));
  [100, 1000, 10000, 100000].forEach((g, i) => ach('tap' + g, `${fmt(g)} 回タップ`, (s) => s.stats.taps, g, 2 + i * 3));
  [1, 10, 100, 1000].forEach((g, i) => ach('fever' + g, `フィーバー ${g} 回`, (s) => s.stats.fevers, g, 2 + i * 3));
  [10, 100, 1000].forEach((g, i) => ach('gold' + g, `金のレンガ ${g} 個`, (s) => s.stats.golden, g, 2 + i * 4));
  [5, 25, 50].forEach((g, i) => ach('super' + g, `超会心 ${g} 回`, (s) => s.stats.supers, g, 3 + i * 4));
  const ACH_DMG = 0.03; // 実績 1 つで全ダメージ +3%

  // ---------- 状態 ----------
  function newState() {
    const s = {
      v: 1,
      gold: 0, stage: 1, runMax: 1, bestStage: 1,
      upg: {}, perm: {}, abil: {},
      shards: 0, totalShards: 0, resets: 0,
      stats: { walls: 0, taps: 0, maxHit: 0, fevers: 0, golden: 0, supers: 0, totalDmg: 0, play: 0 },
      ach: {},
      wallHp: 0, wallMax: 0, wallT: 0,
      fever: 0, feverT: 0, combo: 0, comboT: 0, hits: 0,
      advance: true, failT: 0,
      lastSave: Date.now(),
      opt: { sfx: true, bgm: true, fx: 1, buy: 1 },
      tut: 0,
    };
    UPG.forEach((u) => (s.upg[u.id] = 0));
    PERM.forEach((p) => (s.perm[p.id] = 0));
    ABIL.forEach((a) => (s.abil[a.id] = 0));
    startWall(s);
    return s;
  }
  function fix(s) { // 古いセーブや欠けた項目を埋める
    const d = newState();
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    for (const g of ['upg', 'perm', 'abil', 'stats', 'opt']) for (const k of Object.keys(d[g])) if (s[g][k] === undefined) s[g][k] = d[g][k];
    if (!(s.wallMax > 0)) startWall(s);
    return s;
  }

  // ---------- 能力値 ----------
  function achCount(s) { let n = 0; for (const k in s.ach) if (s.ach[k]) n++; return n; }
  function stats(s) {
    const u = s.upg, p = s.perm, a = s.abil;
    const dmgMult = Math.pow(2, p.p_dmg) * (1 + ACH_DMG * achCount(s));
    const tap = (1 + u.power) * Math.pow(2, Math.floor(u.power / 25)) * dmgMult;
    const autoBase = 1.5 * u.auto * Math.pow(2, Math.floor(u.auto / 25)) * (1 + 0.12 * u.speed) * dmgMult;
    const shots = 1 + u.multi;
    const autoDps = autoBase * shots;
    const critP = Math.min(0.75, 0.05 + 0.01 * u.crit + 0.03 * p.p_crit);
    const critM = 2 + 0.5 * u.critdmg + p.p_crit;
    const goldMult = (1 + 0.3 * u.goldup) * Math.pow(1.7, p.p_gold) * (1 + 0.6 * a.midas);
    const time = 30 + 3 * p.p_time + 5 * a.chrono;
    const feverMult = 3 + p.p_fever;
    const feverDur = 8 + p.p_fever + 1.5 * a.fever;
    const feverGain = 1 + 0.35 * a.fever;
    const ref = tap * 3 + autoDps; // アビリティの基本の強さ
    const rate = Math.min(12, 1.6 + 0.12 * u.speed * 1.5); // 1 秒に撃つ回数（見た目用）
    const golden = 0.03 + 0.02 * a.lucky;
    return { dmgMult, tap, autoDps, autoBase, shots, critP, critM, goldMult, time, feverMult, feverDur, feverGain, ref, rate, golden };
  }

  // ---------- 強化の値段 ----------
  function upgCost(s, id, n) {
    const u = UPG_BY[id] || PERM_BY[id];
    const L = (UPG_BY[id] ? s.upg : s.perm)[id];
    n = n || 1;
    const r = u.growth;
    let c = u.base * Math.pow(r, L) * (Math.pow(r, n) - 1) / (r - 1);
    return UPG_BY[id] ? c : Math.ceil(c - 1e-9);
  }
  function maxLv(id) { const u = UPG_BY[id] || PERM_BY[id]; return u.max || Infinity; }
  function canBuyN(s, id, want) { // want: 1/10/100 または 'max'
    const isU = !!UPG_BY[id];
    const L = (isU ? s.upg : s.perm)[id];
    const room = maxLv(id) - L;
    if (room <= 0) return 0;
    const money = isU ? s.gold : s.shards;
    if (want === 'max') {
      const u = UPG_BY[id] || PERM_BY[id];
      const first = u.base * Math.pow(u.growth, L);
      if (money < first) return 0;
      let n = Math.floor(Math.log(money * (u.growth - 1) / first + 1) / Math.log(u.growth));
      n = Math.max(1, Math.min(n, room, 10000));
      while (n > 1 && upgCost(s, id, n) > money) n--;
      return upgCost(s, id, n) <= money ? n : 0;
    }
    return Math.min(want, room);
  }
  function buy(s, id, n) {
    const isU = !!UPG_BY[id];
    if (!n) return false;
    const c = upgCost(s, id, n);
    if (isU) { if (s.gold < c) return false; s.gold -= c; s.upg[id] += n; }
    else { if (s.shards < c) return false; s.shards -= c; s.perm[id] += n; }
    return true;
  }
  // 自動強化と試算用：毎秒ダメージの伸び ÷ 値段 が一番よい物
  function bestBuy(s) {
    const base = power(s);
    let best = null, bestV = 0;
    for (const u of UPG) {
      if (s.upg[u.id] >= maxLv(u.id)) continue;
      const c = upgCost(s, u.id, 1);
      if (c > s.gold) continue;
      s.upg[u.id]++;
      let gain = power(s) - base;
      if (u.id === 'goldup') gain = base * 0.3 / (1 + 0.3 * (s.upg.goldup - 1)) * 0.6;
      s.upg[u.id]--;
      const v = gain / c;
      if (v > bestV) { bestV = v; best = u.id; }
    }
    return best;
  }
  // おおよその毎秒ダメージ（タップ 5 回/秒、アビリティ込み）
  function power(s, taps) {
    const st = stats(s), a = s.abil;
    taps = taps === undefined ? 5 : taps;
    const critAvg = 1 + st.critP * (st.critM - 1) * (1 + 0.5 * a.blast);
    let dps = (st.tap * taps * (a.weak ? 1 + 0.4 * (3 + 2 * a.weak) : 1) + st.autoDps * (1 + 0.45 * a.clone) + st.autoBase * 0.35 * a.drone) * critAvg;
    dps += st.ref * (a.thunder ? (1.5 + 0.6 * a.thunder) / thunderCd(a.thunder) : 0);
    dps += st.ref * (a.meteor ? 10 * a.meteor / meteorCd(a.meteor) : 0);
    dps += st.ref * 0.5 * a.drill;
    dps += a.shock ? st.ref * 3 * a.shock * (taps + st.rate * st.shots) / 20 : 0;
    if (a.combo) dps *= 1 + 0.01 * a.combo * Math.min(comboCap(a.combo), taps * 6);
    const fev = Math.min(1, st.feverDur / (st.feverDur + 25 / st.feverGain));
    dps *= 1 + fev * (st.feverMult - 1);
    return dps;
  }

  // ---------- 壁の流れ ----------
  function startWall(s) {
    s.wallMax = hpFor(s.stage);
    s.wallHp = s.wallMax;
    s.wallT = 0;
  }
  function comboMult(s) { return s.abil.combo ? 1 + 0.01 * s.abil.combo * Math.min(s.combo, comboCap(s.abil.combo)) : 1; }
  // 1 発の当たり。kind: tap / auto / thunder / ...
  function roll(s, base, st, rnd, opts) {
    opts = opts || {};
    let dmg = base * comboMult(s);
    if (s.feverT > 0) dmg *= st.feverMult;
    let crit = false, sup = false;
    if (!opts.noCrit && rnd() < st.critP) {
      crit = true;
      dmg *= st.critM;
      if (s.abil.blast) dmg *= 1 + 0.5 * s.abil.blast;
      if (rnd() < 0.02) { sup = true; dmg *= 10; s.stats.supers++; }
    }
    return { dmg, crit, sup };
  }
  // ダメージを入れる。返り値: 落ちた金貨と、壊れたか
  function damage(s, dmg, st) {
    if (s.wallHp <= 0) return { gold: 0, broken: false };
    const real = Math.min(dmg, s.wallHp);
    s.wallHp -= real;
    s.stats.totalDmg += real;
    if (dmg > s.stats.maxHit) s.stats.maxHit = dmg;
    const g = goldFor(s.stage) * st.goldMult;
    let gold = g * 0.4 * real / s.wallMax;
    let broken = false;
    if (s.wallHp <= s.wallMax * 1e-9) {
      s.wallHp = 0; broken = true; gold += g * 0.6;
    }
    s.gold += gold;
    s.fever = Math.min(100, s.fever + (dmg > 0 ? 0.35 * st.feverGain : 0));
    return { gold, broken };
  }
  // 壁が壊れた後：次へ（または同じステージで稼ぐ）
  function nextWall(s) {
    s.stats.walls++;
    if (s.advance) {
      s.stage++;
      if (s.stage > s.runMax) s.runMax = s.stage;
      if (s.stage > s.bestStage) s.bestStage = s.stage;
    }
    startWall(s);
  }
  // 時間切れ：押し返されて 1 つ前へ
  function failWall(s) {
    s.retry = s.stage;
    s.stage = Math.max(1, s.stage - 1);
    s.advance = false;
    s.failT = 0;
    startWall(s);
  }
  // 押し返された後に挑み直す
  function retry(s) {
    s.advance = true; s.failT = 0;
    s.stage = Math.max(s.stage, s.retry || s.stage);
    startWall(s);
  }
  // 時間を進める（壁の時間・フィーバー・連打）。返り値: 'fail' など
  function tick(s, dt, st) {
    s.stats.play += dt;
    if (s.feverT > 0) s.feverT = Math.max(0, s.feverT - dt);
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
    if (!s.advance) {
      s.failT += dt;
      if (s.abil.autobuy && s.failT > 25) { retry(s); return 'retry'; }
      return null;
    }
    s.wallT += dt;
    if (s.wallT >= st.time) { failWall(s); return 'fail'; }
    return null;
  }
  function startFever(s, st) {
    if (s.fever < 100 || s.feverT > 0) return false;
    s.fever = 0; s.feverT = st.feverDur; s.stats.fevers++;
    return true;
  }

  // ---------- 転生 ----------
  function shardsFor(s) {
    const m = s.runMax;
    if (m < 15) return 0;
    const base = Math.pow((m - 5) / 5, 1.9);
    return Math.floor(base * (1 + 0.3 * s.abil.greed) * (1 + 0.25 * s.perm.p_shard));
  }
  function choiceCount(s) { return 3 + s.perm.p_choice; }
  function abilityChoices(s, rnd) {
    const pool = ABIL.filter((a) => !(a.max && s.abil[a.id] >= a.max));
    const out = [];
    // 持っていない物を少し出やすく
    const w = pool.map((a) => (s.abil[a.id] ? 1 : 1.6));
    const n = Math.min(choiceCount(s), pool.length);
    while (out.length < n) {
      let t = rnd() * w.reduce((x, y) => x + y, 0);
      let i = 0;
      for (; i < pool.length; i++) { t -= w[i]; if (t <= 0) break; }
      i = Math.min(i, pool.length - 1);
      out.push(pool[i].id); pool.splice(i, 1); w.splice(i, 1);
    }
    return out;
  }
  function doReset(s, abilId) {
    const got = shardsFor(s);
    s.shards += got; s.totalShards += got; s.resets++;
    if (abilId && ABIL_BY[abilId]) s.abil[abilId]++;
    s.gold = 0;
    UPG.forEach((u) => (s.upg[u.id] = 0));
    s.stage = 1 + 5 * s.abil.warp;
    s.runMax = s.stage;
    if (s.stage > s.bestStage) s.bestStage = s.stage;
    s.gold = (s.abil.warp ? goldFor(s.stage) * 6 : 0) + (s.perm.p_start ? goldFor(4 * s.perm.p_start) * 8 : 0);
    s.fever = 0; s.feverT = 0; s.combo = 0; s.advance = true; s.failT = 0;
    startWall(s);
    return got;
  }

  // ---------- 実績 ----------
  function checkAch(s) {
    const got = [];
    for (const a of ACH) {
      if (s.ach[a.id]) continue;
      if (a.f(s) >= a.goal) { s.ach[a.id] = 1; s.shards += a.reward; s.totalShards += a.reward; got.push(a); }
    }
    return got;
  }

  // ---------- 留守の間 ----------
  function offline(s, sec) {
    sec = Math.min(sec, 8 * 3600);
    if (sec < 60) return 0;
    const st = stats(s);
    const stg = Math.max(1, s.stage - 1);
    const perWall = hpFor(stg) / Math.max(1e-9, power(s, 0)) + 0.6;
    const g = (goldFor(stg) * st.goldMult / perWall) * sec * (0.25 + 0.15 * s.perm.p_offline);
    return g;
  }

  G.WC = {
    fmt, isBoss, hpFor, goldFor, UPG, UPG_BY, ABIL, ABIL_BY, PERM, PERM_BY, ACH, ACH_DMG,
    newState, fix, stats, upgCost, maxLv, canBuyN, buy, bestBuy, power, startWall, roll, damage,
    nextWall, failWall, retry, tick, startFever, shardsFor, choiceCount, abilityChoices, doReset, checkAch,
    offline, achCount, comboMult, thunderCd, meteorCd, comboCap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
