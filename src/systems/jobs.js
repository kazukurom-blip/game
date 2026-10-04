// 転職システム（v3 / docs/SPEC_JOB.md）
//  attachJobs(game)              levelUp / mapChanged を購読し、転職可能になったら events 'jobAvailable' {tier, options} ＋ notify
//  jobOffer(state)               → {tier, options:[jobId], active: missionId|null} | null
//  acceptJobMission(game, jobId) → {ok, msg, missionId?}（MissionManager 経由で受注）
//  advanceJob(game, jobId)       → {ok, msg, job?}（転職ミッション報告時に MissionManager.turnIn から呼ばれる）
//  currentJob(state)             → Job（data/jobs.js）
//  jobBonus(state)               → 系譜の statBonus 合計（computeStats が加算済み）
import { JOBS, JOB_TIERS, BEGINNER_ID, jobsFor, jobStateOf, currentJobOf, jobBonusOf, jobLineage, hasJob } from '../data/jobs.js';
import { MISSIONS, MISSION_NPCS, JOB_MISSIONS } from '../data/missions.js';
import { SKILLS } from '../data/skills.js';
import { computeStats } from './progression.js';
import { snsPost } from './sns.js';
import { spawnEffect } from '../render/effects.js';

export { JOBS, JOB_TIERS, jobsFor, jobLineage, hasJob };

export function currentJob(state) { return currentJobOf(state); }
export function jobBonus(state) { return jobBonusOf(state); }

/** 次の転職段階（0〜4 の tier。最終段階なら null） */
export function nextJobTier(state) {
  const t = jobStateOf(state).tier + 1;
  return t < JOB_TIERS.length ? t : null;
}

/** 受注中の転職ミッション ID | null */
export function activeJobMission(state) {
  return (state?.missions?.active || []).find((id) => MISSIONS[id]?.type === 'job') || null;
}

/** その職の転職ミッションを受けられるか（ヒーロー・Lv・現職が from・他の転職ミッション未受注） */
export function canTakeJobMission(state, jobId) {
  const j = JOBS[jobId];
  if (!j || !state || j.tier <= 0) return false;
  if (j.hero !== state.heroId) return false;
  if ((state.level || 1) < j.reqLevel) return false;
  if (jobStateOf(state).id !== j.from) return false;
  const act = activeJobMission(state);
  return !act || act === JOB_MISSIONS[jobId];
}

/**
 * jobOffer(state) → {tier, options:[jobId...], active} | null
 *  - 次段階の必要Lvに達していなければ null（最終段階到達後も null）
 *  - active: 受注中の転職ミッション ID（受注中は UI は吹き出しを出さずトラッカー表示）
 */
export function jobOffer(state) {
  if (!state) return null;
  const tier = nextJobTier(state);
  if (tier == null) return null;
  if ((state.level || 1) < JOB_TIERS[tier]) return null;
  const options = jobsFor(state.heroId, tier, jobStateOf(state).id).map((j) => j.id);
  if (!options.length) return null;
  return { tier, reqLevel: JOB_TIERS[tier], options, active: activeJobMission(state) };
}

/** acceptJobMission(game, jobId) → {ok, msg, missionId?} */
export function acceptJobMission(game, jobId) {
  const st = game?.state;
  const j = JOBS[jobId];
  if (!st || !j) return { ok: false, msg: '不明な職業です' };
  const offer = jobOffer(st);
  if (!offer) return { ok: false, msg: '今は転職できない' };
  if (!offer.options.includes(jobId)) return { ok: false, msg: `${j.name} にはなれない` };
  const mid = JOB_MISSIONS[jobId];
  if (offer.active) {
    if (offer.active === mid) return { ok: true, msg: '既に受注している', missionId: mid };
    return { ok: false, msg: `受注中の転職ミッションがある（${MISSIONS[offer.active]?.name || offer.active}）` };
  }
  const mm = game.missions;
  if (!mm || typeof mm.accept !== 'function') return { ok: false, msg: 'ミッションを受注できない' };
  if (!mm.accept(mid)) return { ok: false, msg: 'ミッションを受注できない' };
  const npc = MISSION_NPCS[j.instructor];
  game.notify?.(`転職ミッション: ${npc?.name || ''} の試練を受けよう`, j.aura || '#ffd23f');
  return { ok: true, msg: `「${MISSIONS[mid].name}」を受注した`, missionId: mid };
}

/** advanceJob(game, jobId) → {ok, msg, job?} */
export function advanceJob(game, jobId) {
  const st = game?.state;
  const j = JOBS[jobId];
  if (!st || !j || j.tier <= 0) return { ok: false, msg: '不明な職業です' };
  if (j.hero !== st.heroId) return { ok: false, msg: 'このキャラはその職になれない' };
  const cur = jobStateOf(st);
  if (cur.id === jobId) return { ok: false, msg: '既にその職です' };
  if (cur.id !== j.from) return { ok: false, msg: `${JOBS[j.from]?.name || j.from} からのみ転職できる` };
  const prev = cur.id;
  st.job = { id: j.id, tier: j.tier, history: [...cur.history, { id: j.id, tier: j.tier, from: prev, level: st.level || 1, t: Date.now() }] };
  st.sp = (st.sp || 0) + (j.sp || 0);
  // 新スキルを Lv1 で自動習得（アクティブは空きスキルバーへ）
  st.skills ||= {};
  const learned = [];
  for (const sid of j.skills || []) {
    const sk = SKILLS[sid];
    if (!sk) continue;
    if (!(st.skills[sid] > 0)) { st.skills[sid] = 1; learned.push(sk.name); }
    if (sk.kind !== 'passive' && Array.isArray(st.skillBar) && !st.skillBar.includes(sid)) {
      const i = st.skillBar.indexOf(null);
      if (i >= 0) st.skillBar[i] = sid;
    }
  }
  // HP/MP 全快（ボーナス反映後）
  const s = computeStats(st);
  st.hp = s.maxHp; st.mp = s.maxMp;
  const p = game.player;
  if (p) {
    spawnEffect(game, 'levelUp', p.x, p.y, { color: j.aura });
    spawnEffect(game, 'buff', p.x, p.y, { color: j.aura });
    spawnEffect(game, 'spark', p.x, p.y - (p.h || 70) / 2, { color: j.aura });
  }
  game.shake = Math.max(game.shake || 0, 6);
  game.notify?.(`🎉 転職成功！ ${j.name} になった！（SP+${j.sp}）`, j.aura || '#ffd23f');
  if (learned.length) game.notify?.(`新スキル習得: ${learned.join('・')}`, '#ffd23f');
  snsPost(game, pickPost(st, j), { gain: [0, 30, 120, 400, 1500][j.tier] || 30, kind: 'job', tags: ['転職', j.name] });
  game.events?.emit('jobAdvanced', { job: j, from: prev, tier: j.tier });
  game.save?.();
  return { ok: true, msg: `${j.name} に転職した`, job: j };
}

function pickPost(st, j) {
  const name = st.heroId === 'jin' ? 'ジン' : 'ルナ';
  const a = [
    `【ご報告】${name}、本日より「${j.name}」になりました！ #転職 #${j.title}`,
    `${j.tier}次転職、完了。今日から${j.title}としてヴァイス・ベイを駆け抜ける🔥 #転職 #ヴァイスベイ`,
    `新しい自分、はじめました。「${j.name}」✨ オーラの色、見て！ #転職 #NeonGram`,
  ];
  return a[Math.floor(Math.random() * a.length)];
}

/**
 * attachJobs(game) — levelUp / mapChanged / jobAdvanced を購読。転職可能（未受注）になったら
 * events.emit('jobAvailable', {tier, options}) と notify。同じ段階の案内はセッション中1回（levelUp では毎回再案内しない）。
 * 戻り値: 購読解除関数（二重 attach しない）
 */
export function attachJobs(game) {
  if (game._jobsUnsub) return game._jobsUnsub;
  const ev = game.events;
  if (!ev) return () => {};
  let notifiedTier = null;
  const check = () => {
    const offer = jobOffer(game.state);
    if (!offer || offer.active) return;
    if (notifiedTier === offer.tier) return;
    notifiedTier = offer.tier;
    ev.emit('jobAvailable', { tier: offer.tier, options: offer.options });
    const names = offer.options.map((id) => JOBS[id]?.name).join(' / ');
    game.notify?.(`⬆ ${offer.tier}次転職ができる！ 頭上の吹き出しをクリック（${names}）`, '#ffd23f');
  };
  const offs = [ev.on('levelUp', check), ev.on('mapChanged', check), ev.on('jobAdvanced', () => { notifiedTier = null; check(); })];
  check();
  game._jobsUnsub = () => { offs.forEach((f) => f?.()); game._jobsUnsub = null; };
  return game._jobsUnsub;
}

export { BEGINNER_ID };
