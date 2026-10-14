// 次の目標（REFERENCE U01）: 次の地域・ボス、必要 DPS と今の DPS、到達までの目安、手段（スキル・パッシブ・装備・強化）、次に開く機能。
// nextGoal(game) → { title, sub, need, cur, ratio, ok, eta, etaText, hints: [{ text, panel }], unlock, extra: [] }
// DOM は作らない（下の欄・スマホの帯・テストから使う）。重い計算（持ち物の比べ）は数秒に 1 回だけ。

import { ZONE, ZONES, ACT, STAGES_PER_ZONE, WAVES_PER_STAGE, FINAL_ZONE } from '../data/world.js';
import { BAL } from '../data/balance.js';
import { MONSTER } from '../data/monsters.js';
import { fmt, fmtTime, roman } from '../engine/format.js';
import { nextFeature, isOpen } from './unlocks.js';

let upCache = { key: '', n: 0, t: -1e9 };

/** 持ち物の中の「今より強い装備」の数（重いので 4 秒に 1 回） */
export function bagUpgrades(game) {
  const st = game.state;
  const inv = game.sys.inv;
  if (!inv?.isUpgrade) return 0;
  const key = `${st.inv.bag.length}:${st.inv.bag[st.inv.bag.length - 1]?.uid || 0}:${Object.values(st.hero.equip).map((x) => x?.uid || 0).join(',')}:${st.hero.level}`;
  const now = performance.now();
  if (key === upCache.key && now - upCache.t < 4000) return upCache.n;
  let n = 0;
  for (const it of st.inv.bag.slice(-80)) {
    try { if (!inv.equipProblem(it, it.slot === 'ring' ? 'ring1' : it.slot) && inv.isUpgrade(it)) n++; } catch { /* 次へ */ }
  }
  upCache = { key, n, t: now };
  return n;
}

/** 1 ステージにかかる秒の目安 */
function stageSec(game) {
  const r = game.sys.offline.rates();
  const kps = Math.max(0.05, r.kills || 0.3);
  return (WAVES_PER_STAGE * 4.5) / kps + 2;
}

/** DPS を ratio 倍にするのに要るレベルの目安と、その時間 */
function levelEta(game, ratio) {
  if (!(ratio > 1)) return null;
  const st = game.state;
  const lv = st.hero.level;
  if (lv >= BAL.MAX_LEVEL) return null;
  // 1 レベルでおよそ +11%（曲線 P(L) と能力の伸び）
  const levels = Math.min(BAL.MAX_LEVEL - lv, Math.ceil(Math.log(ratio) / Math.log(1.11)));
  const xps = game.sys.offline.rates().xp || 0;
  if (!(xps > 0)) return { levels, sec: null };
  let need = BAL.xpToNext(lv) - st.hero.xp;
  for (let i = 1; i < levels; i++) need += BAL.xpToNext(lv + i);
  return { levels, sec: need / xps };
}

function zoneTitle(z) {
  if (!z) return '';
  const boss = MONSTER[z.boss]?.name || 'ボス';
  const act = (ACT[z.act]?.name || '').split('　')[0];
  return z.zoneIdx === 4 ? `${act}の章のボス「${boss}」` : `「${z.name}」のボス「${boss}」`;
}

export function hints(game, { max = 3 } = {}) {
  const st = game.state;
  const out = [];
  const un = st.meta.unlocks || {};
  if (st.hero.skillPoints > 0 && !un.autoSkill) out.push({ text: `スキルポイント ${st.hero.skillPoints} を振る`, panel: 'skills' });
  const tp = st.hero.tree?.points || 0;
  if (tp > 0 && isOpen(game, 'tree')) out.push({ text: `パッシブの点 ${tp} を振る`, panel: 'tree' });
  const free = game.sys.tree?.paragonFree?.() || 0;
  if (free > 0) out.push({ text: `アビスLv の点 ${free} を振る`, panel: 'tree' });
  const ups = bagUpgrades(game);
  if (ups > 0) out.push({ text: `持ち物に今より強い装備が ${ups} 個（▲）`, panel: 'bag' });
  const cr = game.sys.crafting;
  const wpn = st.hero.equip.weapon;
  if (cr?.enhanceInfo && wpn && isOpen(game, 'craft')) {
    try {
      const inf = cr.enhanceInfo(wpn);
      if (inf.ok && !inf.missing?.length) out.push({ text: `鍛冶で武器を +${inf.next} に（成功率 ${inf.chance}%）`, panel: 'craft' });
    } catch { /* 無視 */ }
  }
  const gm = st.inv.gems || {};
  if (isOpen(game, 'gems') && Object.entries(gm).some(([k, v]) => v >= 3 && !/_10$/.test(k))) out.push({ text: '宝石を合成できる（3 つで 1 段上）', panel: 'gems' });
  const bc = game.sys.bounties?.claimable?.() || 0;
  if (bc > 0 && isOpen(game, 'bounties')) out.push({ text: `日課の報酬を ${bc} つ受け取れる`, panel: 'bounties' });
  return out.slice(0, max);
}

export function nextGoal(game) {
  const st = game.state;
  const w = st.world;
  const ws = game.sys.world;
  const g = { title: '', sub: '', need: 0, cur: 0, ratio: 1, ok: true, eta: null, etaText: '', hints: [], unlock: null, extra: [] };
  if (!st || !ws) return g;
  const nf = nextFeature(game);
  if (nf) g.unlock = { name: nf.name, when: nf.when, id: nf.id };
  // 自動化・転生
  const ps = game.sys.prestige;
  try { if (ps?.isUnlocked?.() && ps.canRebirth?.().ok) { const n = ps.previewSouls(); if (n > 0) g.extra.push({ text: `転生できます（魂 +${fmt(n)}）`, panel: 'prestige' }); } } catch { /* 無視 */ }

  if (w.mode === 'rift' && w.rift?.run) {
    const r = w.rift.run;
    g.title = `深淵の裂け目 段階 ${r.level} を踏破`;
    g.sub = r.phase === 'guardian' ? '守護者を倒す' : `進行 ${Math.floor(Math.min(1, r.progress / r.need) * 100)}%`;
    g.eta = r.timeLeft; g.etaText = `残り ${fmtTime(r.timeLeft)}`;
    g.hints = hints(game);
    return g;
  }
  if (w.mode === 'gate' && w.gate?.run) {
    g.title = '門番を倒す';
    g.eta = w.gate.run.timeLeft; g.etaText = `残り ${fmtTime(w.gate.run.timeLeft)}`;
    g.hints = hints(game);
    return g;
  }
  const z = ZONE[w.zone];
  const storyDone = !!w.cleared?.[FINAL_ZONE];
  let target = z;
  if (z && w.cleared[z.id]) {
    // 踏破した地域にいる: 次の未踏の地域
    const nx = ZONES.find((x) => !w.cleared[x.id]);
    if (nx && !storyDone) target = nx;
  }
  if (!storyDone && target) {
    const nd = ws.bossNeed(target);
    const cur = ws.estDps(target.id);
    g.need = nd.need; g.cur = cur;
    g.ratio = nd.need > 0 ? cur / nd.need : 1;
    g.ok = g.ratio >= 1;
    g.title = `次の目標: ${zoneTitle(target)}`;
    const reached = w.maxStage?.[target.id] || 1;
    if (target.id !== z?.id) {
      g.sub = `今は「${z?.name || ''}」。地図から「${target.name}」へ進めます`;
    } else if (reached < STAGES_PER_ZONE && !ws.isBossStage()) {
      const left = STAGES_PER_ZONE - Math.max(reached, w.stage);
      g.eta = left * stageSec(game);
      g.sub = `ステージ ${Math.max(reached, w.stage)} / ${STAGES_PER_ZONE}（ボスまであと ${left}）`;
      g.etaText = `ボスまで 約 ${fmtTime(g.eta, true)}`;
    } else {
      g.sub = ws.isBossStage() ? 'ボス戦の最中' : 'ボスに挑めるところまで来ています';
    }
    if (!g.ok) {
      const le = levelEta(game, 1 / Math.max(0.01, g.ratio));
      g.short = Math.max(1, Math.round((1 - g.ratio) * 100));
      g.extra.unshift({ text: `ボスには火力があと ${g.short}% 足りません。手段を試すか、レベルを上げてから挑みます` });
      if (le?.sec) { g.eta = le.sec; g.etaText = `目安 約 ${fmtTime(le.sec, true)}（Lv +${le.levels}）`; }
    } else if (!ws.isBossStage() && (reached >= STAGES_PER_ZONE || w.bossFailZone === target.id)) {
      g.extra.unshift({ text: '火力は十分です。ここを押すとボスに挑みます', act: 'boss' });
    }
  } else if (storyDone) {
    const t = w.torment || 0;
    const mx = w.maxTorment || 0;
    if (t < mx) {
      g.title = `魔境 ${roman(t + 1)} に上げられます`;
      g.sub = '段を上げるほど、経験値・ゴールド・ドロップが増えます';
      g.extra.push({ text: '地図か裂け目の窓で魔境の段を選ぶ', panel: 'map' });
    } else if (mx < BAL.MAX_TORMENT) {
      g.title = `魔境 ${roman(mx + 1)} を開く`;
      g.sub = `魔境 ${roman(Math.max(1, mx))} で章のボスを倒すと開きます`;
    } else {
      g.title = '魔境 XVI を制覇';
    }
    const best = w.rift?.best || 0;
    g.extra.push({ text: `深淵の裂け目: 最高 段階 ${best}${best ? `　次は段階 ${best + 1}` : '（まだ挑んでいない）'}`, panel: 'rift' });
  }
  g.hints = hints(game);
  return g;
}

/** 進み具合（1 時間あたり） */
export function paceInfo(game) {
  const r = game.sys.offline.rates();
  const st = game.state;
  const lv = st.hero.level;
  const xps = r.xp || 0;
  const toNext = lv < BAL.MAX_LEVEL ? BAL.xpToNext(lv) - st.hero.xp : BAL.paragonXpToNext(st.hero.paragon.level) - st.hero.paragon.xp;
  return {
    killsMin: (r.kills || 0) * 60,
    xpH: xps * 3600,
    goldH: (r.gold || 0) * 3600,
    dropsH: (r.drops || 0) * 3600,
    elitesH: (r.elites || 0) * 3600,
    levelEta: xps > 0 ? toNext / xps : null,
    measured: r.measured || 0,
  };
}
