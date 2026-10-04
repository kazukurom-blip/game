// スキル使用・クールダウン・バフ・習得
import { SKILLS, jobSkillUnlocked } from '../data/skills.js';
import { JOBS, hasJob, skillSpTier, getSp, addSp } from '../data/jobs.js';
import { Projectile } from '../entities/projectile.js';
import { rectOverlap, entRect } from '../world/physics.js';
import { spawnEffect } from '../render/effects.js';
import { computeStats, addBuff, getBuffs, tickBuffs } from './progression.js';
import { playerAttackArea, calcDamage, newAttackId, setPlayerInvuln } from './combat.js';
import { updateCombo } from './combo.js';
import { updateContent } from './content.js';

const cds = {};       // skillId → {left, total}
let _dash = null;     // 進行中のダッシュ
let _lastWarn = 0;
let _lastTownWarn = -1e9;
export const TOWN_SKILL_WARN_INTERVAL = 1.5; // 秒

/** 町（map.town === true）ではスキル使用不可 */
export function skillsBlockedHere(game) { return !!game.map?.town; }

function warn(game, text) {
  const t = performance.now();
  if (t - _lastWarn < 400) return;
  _lastWarn = t;
  game.notify?.(text, '#ff8a8a');
}

export function getCooldown(skillId) {
  return cds[skillId] ? { left: cds[skillId].left, total: cds[skillId].total } : { left: 0, total: 0 };
}

export function resetCooldowns() {
  for (const k in cds) delete cds[k];
  _dash = null;
}

export function activeBuffs(game) { return getBuffs(game); }

export function skillLevel(state, id) { return state.skills?.[id] || 0; }

/** 前方の矩形（足元基準） */
function frontRect(p, w, h) {
  const f = p.facing || 1;
  const cy = p.y - p.h / 2;
  return { x: f > 0 ? p.x - 10 : p.x - w + 10, y: cy - h / 2, w, h };
}

/** useSkill(game, skillId) → bool */
export function useSkill(game, skillId) {
  const sk = SKILLS[skillId];
  const st = game.state;
  const p = game.player;
  if (!sk || !p) return false;
  if (skillsBlockedHere(game) && !sk.townOk) {
    const t = typeof game.time === 'number' ? game.time : performance.now() / 1000;
    if (t - _lastTownWarn >= TOWN_SKILL_WARN_INTERVAL || t < _lastTownWarn) {
      _lastTownWarn = t;
      game.notify?.('町ではスキルは使えない！', '#ff8a8a');
    }
    return false;
  }
  const lv = skillLevel(st, skillId);
  if (lv <= 0) { warn(game, `${sk.name} は未習得です`); return false; }
  if (sk.kind === 'passive') { warn(game, `${sk.name} はパッシブスキルです`); return false; }
  if (st.hp <= 0 || p.dead) return false;
  if (p.inVehicle) { warn(game, '車に乗っている間はスキルを使えない'); return false; }
  const cd = cds[skillId];
  if (cd && cd.left > 0) { warn(game, `${sk.name} はクールダウン中（${cd.left.toFixed(1)}秒）`); return false; }
  if (_dash && sk.kind === 'dash') return false;
  const mp = sk.mp(lv);
  if (st.mp < mp) { warn(game, 'MPが足りない！'); return false; }

  const mv = sk.kind === 'move' ? moveParams(st, skillId, lv) : null;
  if (mv && mv.airOnly && p.onGround === true && !p.climbing) return false; // フラッシュジャンプは空中のみ（MP/CDは消費しない）
  if (mv && mv.groundOnly && p.onGround === false) return false;             // ホイール・ダッシュは地上のみ

  st.mp -= mp;
  const stats = computeStats(st);
  // 潜在「スキルCT短縮」（秒。元の CT の半分までしか短縮しない）
  const base = mv ? mv.cooldown : sk.cooldown(lv);
  const total = stats.cdr > 0 && base > 0 ? Math.max(base * 0.5, base - stats.cdr) : base;
  cds[skillId] = { left: total, total };
  const f = p.facing || 1;
  const mult = sk.mult(lv);

  switch (sk.kind) {
    case 'melee': {
      p.startAttack?.('melee');
      const rect = frontRect(p, sk.range.w, sk.range.h);
      spawnEffect(game, 'slash', p.x + f * sk.range.w * 0.45, p.y - p.h / 2, { color: sk.color, facing: f, w: sk.range.w, h: sk.range.h, hits: sk.hits });
      const hit = playerAttackArea(game, rect, mult, { hits: sk.hits, knock: sk.knock ?? 200, launch: sk.launch, effect: sk.effect, color: sk.color, maxTargets: sk.maxTargets ?? 6, knockDir: f });
      tryFinalAttack(game, hit);
      break;
    }
    case 'projectile': {
      p.startAttack?.('gun');
      const pr = sk.proj;
      const n = pr.count || 1;
      const ox = p.x + f * 26, oy = p.y - p.h * 0.55;
      spawnEffect(game, 'muzzle', ox, oy, { color: sk.color, facing: f });
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0 : i / (n - 1) - 0.5;
        const r = calcDamage(stats.atk, mult, 0, stats.crit, stats.critDmg);
        game.projectiles.push(new Projectile(game, {
          owner: 'player', x: ox - f * i * (n <= 3 ? 18 : 0), y: oy + (n <= 3 ? (i - (n - 1) / 2) * 10 : 0),
          vx: f * pr.speed, vy: k * (pr.spread || 0),
          damage: r.dmg, crit: r.crit, life: pr.life, kind: pr.kind, pierce: pr.pierce ?? 0,
          w: pr.w, h: pr.h, color: sk.color, skillId,
        }));
      }
      break;
    }
    case 'aoe': {
      p.startAttack?.('melee');
      const rect = { x: p.x - sk.range.w / 2, y: p.y - p.h / 2 - sk.range.h / 2, w: sk.range.w, h: sk.range.h };
      spawnEffect(game, sk.effect || 'explosion', p.x, p.y - p.h / 2, { color: sk.color, radius: sk.range.w / 2, w: sk.range.w, h: sk.range.h });
      const hit = playerAttackArea(game, rect, mult, { hits: sk.hits, knock: sk.knock ?? 300, launch: sk.launch, effect: 'hit', color: sk.color, maxTargets: sk.maxTargets ?? 10 });
      tryFinalAttack(game, hit);
      break;
    }
    case 'dash': {
      p.startAttack?.('melee');
      const d = sk.dash;
      const dist = typeof d.dist === 'function' ? d.dist(lv) : d.dist;
      _dash = { skill: sk, dir: f, speed: dist / d.time, t: d.time, mult, attackId: newAttackId(), faDone: false };
      setPlayerInvuln(game, d.invuln ?? d.time + 0.15);
      p.dashing = true;
      spawnEffect(game, 'dash', p.x, p.y - p.h / 2, { color: sk.color, facing: f });
      break;
    }
    case 'buff': {
      p.startAttack?.('magic');
      const b = sk.buff(lv);
      addBuff(game, { id: sk.id, name: sk.name, color: sk.color, ...b });
      spawnEffect(game, 'buff', p.x, p.y, { color: sk.color });
      game.notify?.(`${sk.name}！`, sk.color);
      break;
    }
    case 'move': {
      // 実際の動き（物理）は entities/player.js の doMoveSkill(skill, lv, params) が担当（無ければ何もしない）
      p.doMoveSkill?.(sk, lv, mv);
      if (mv.invuln > 0) setPlayerInvuln(game, mv.invuln);
      // 3次強化: 移動先の小爆発（doMoveSkill が同期的に位置を変える前提。非同期なら player 側で arrivalBlast を使う）
      if (mv.arrivalBlast) {
        const b = mv.arrivalBlast;
        const rect = { x: p.x - b.w / 2, y: p.y - p.h / 2 - b.h / 2, w: b.w, h: b.h };
        spawnEffect(game, 'explosion', p.x, p.y - p.h / 2, { color: b.color || sk.color, radius: b.w / 2, w: b.w, h: b.h });
        playerAttackArea(game, rect, b.mult, { hits: 1, knock: 220, effect: 'hit', color: b.color || sk.color, maxTargets: 8 });
      }
      if (sk.effect) spawnEffect(game, sk.effect, p.x, p.y - p.h / 2, { color: sk.color, facing: f });
      if (mv.afterBuff) addBuff(game, { id: sk.id + '_after', name: sk.name, color: sk.color, ...mv.afterBuff });
      break;
    }
    default:
      return false;
  }
  game.events?.emit('skillUsed', { id: skillId });
  return true;
}

/** updateSkills(game, dt) — クールダウン・バフ・ダッシュを進める（毎フレーム呼ぶ） */
export function updateSkills(game, dt) {
  for (const k in cds) {
    cds[k].left = Math.max(0, cds[k].left - dt);
  }
  tickBuffs(game, dt);
  // v3: コンボの時間切れ・エンドコンテンツ（ボス/スパイア/アリーナの制限時間）
  try { updateCombo(game, dt); } catch (e) { /* noop */ }
  try { updateContent(game, dt); } catch (e) { if (!game._contentErr) { game._contentErr = true; console.warn('[updateContent]', e); } }

  if (_dash) {
    const p = game.player;
    if (!p || p.dead || p.inVehicle) { _dash = null; if (p) p.dashing = false; return; }
    const step = Math.min(dt, _dash.t);
    const oldX = p.x;
    p.x += _dash.dir * _dash.speed * step;
    const mw = game.map?.width;
    if (mw) p.x = Math.max(p.w / 2, Math.min(mw - p.w / 2, p.x));
    // 壁を貫通しない
    for (const w of game.map?.walls || []) {
      if (rectOverlap(entRect(p), w)) { p.x = oldX; _dash.t = step; break; }
    }
    p.vx = _dash.dir * 120; // 通常移動の物理を邪魔しない程度の慣性
    if ((p.vy || 0) > 0) p.vy *= 0.5;
    p.facing = _dash.dir;
    // 通過した範囲にダメージ
    const minX = Math.min(oldX, p.x) - _dash.skill.range.w / 2;
    const rect = { x: minX, y: p.y - p.h / 2 - _dash.skill.range.h / 2, w: Math.abs(p.x - oldX) + _dash.skill.range.w, h: _dash.skill.range.h };
    const dhit = playerAttackArea(game, rect, _dash.mult, {
      hits: _dash.skill.hits, knock: _dash.skill.knock ?? 260, attackId: _dash.attackId,
      effect: 'hit', color: _dash.skill.color, knockDir: _dash.dir, maxTargets: 12,
    });
    if (!_dash.faDone && dhit && dhit.length) { _dash.faDone = true; tryFinalAttack(game, dhit); }
    if (Math.random() < 0.6) spawnEffect(game, 'dash', p.x, p.y - p.h / 2, { color: _dash.skill.color, facing: _dash.dir, trail: true });
    _dash.t -= step;
    if (_dash.t <= 0) { _dash = null; p.dashing = false; }
  }
}

export function isDashing() { return !!_dash; }

/** ファイナルアタック: 習得済みスキルの finalAttack(lv) のうち最大の {chance, mult, color, skillId} | null */
export function finalAttackOf(state) {
  let best = null;
  for (const [sid, lv] of Object.entries(state?.skills || {})) {
    const sk = SKILLS[sid];
    if (!sk || !lv || typeof sk.finalAttack !== 'function') continue;
    const fa = sk.finalAttack(lv);
    if (!best || fa.chance * fa.mult > best.chance * best.mult) best = { ...fa, color: sk.color, skillId: sid };
  }
  return best;
}

/**
 * tryFinalAttack(game, targets, rnd?) — 攻撃が命中した敵 targets に確率で追撃（ファイナルアタック）。発動したら true
 * skills.js の melee/aoe/dash は自動で呼ぶ。通常攻撃・弾の命中時は player.js / projectile.js から呼んでよい。
 */
export function tryFinalAttack(game, targets, rnd = Math.random()) {
  const fa = finalAttackOf(game?.state);
  const list = (targets || []).filter((e) => e && !e.dead);
  if (!fa || !list.length || rnd >= fa.chance) return false;
  const pick = list.slice(0, 3);
  const x0 = Math.min(...pick.map((e) => e.x - (e.w || 40) / 2)), x1 = Math.max(...pick.map((e) => e.x + (e.w || 40) / 2));
  const y0 = Math.min(...pick.map((e) => e.y - (e.h || 40))), y1 = Math.max(...pick.map((e) => e.y));
  const rect = { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 };
  playerAttackArea(game, rect, fa.mult, { hits: 1, knock: 120, effect: 'spark', color: fa.color, maxTargets: pick.length });
  return true;
}

/**
 * moveParams(state, skillId, lv?) → 移動スキル（kind:'move'）の実効パラメータ（3次の強化パッシブ込み）
 *  {type, power, distance, cooldown, invuln, afterBuff|null, enhancedBy:[skillId], ...move の追加キー(lift/time/gravityScale/airOnly)}
 */
export function moveParams(state, skillId, lv) {
  const sk = SKILLS[skillId];
  if (!sk || sk.kind !== 'move' || !sk.move) return null;
  lv = lv ?? Math.max(1, skillLevel(state, skillId));
  const m = sk.move;
  const out = { ...m, distance: (m.distance || 0) + (m.perLv || 0) * (lv - 1), power: m.power || 0, invuln: m.invuln || 0, cooldown: sk.cooldown(lv), afterBuff: null, enhancedBy: [] };
  delete out.perLv;
  for (const [eid, elv] of Object.entries(state?.skills || {})) {
    const e = SKILLS[eid];
    if (!e || e.enhances !== skillId || !elv || typeof e.enhance !== 'function') continue;
    const b = e.enhance(elv);
    out.enhancedBy.push(eid);
    if (b.distancePct) out.distance *= 1 + b.distancePct;
    if (b.powerPct) out.power *= 1 + b.powerPct;
    if (b.cooldownCut) out.cooldown *= Math.max(0.2, 1 - b.cooldownCut);
    if (b.invulnAdd) out.invuln += b.invulnAdd;
    if (b.afterBuff) out.afterBuff = { ...(out.afterBuff || {}), ...b.afterBuff };
    if (b.arrivalBlast) out.arrivalBlast = { ...b.arrivalBlast };
    if (b.backShotMult && out.backShot) out.backShot = { ...out.backShot, mult: Math.round(out.backShot.mult * b.backShotMult * 100) / 100 };
    if (b.pushMult && out.push) out.push = { ...out.push, mult: Math.round(out.push.mult * b.pushMult * 100) / 100 };
  }
  out.distance = Math.round(out.distance);
  out.power = Math.round(out.power);
  out.cooldown = Math.round(out.cooldown * 100) / 100;
  return out;
}

/** learnSkill(game, skillId) → bool（SP を1消費してレベル+1） */
export function learnSkill(game, skillId) {
  const sk = SKILLS[skillId];
  const st = game.state;
  if (!sk) return false;
  if (sk.hero !== 'both' && sk.hero !== st.heroId) { game.notify?.('このキャラは習得できません', '#ff8a8a'); return false; }
  if (!jobSkillUnlocked(st, sk)) { game.notify?.(`「${JOBS[sk.reqJob]?.name || sk.reqJob}」に転職すると習得可能`, '#ff8a8a'); return false; }
  if (st.level < sk.reqLevel) { game.notify?.(`Lv.${sk.reqLevel} で習得可能`, '#ff8a8a'); return false; }
  const lv = skillLevel(st, skillId);
  if (lv >= sk.maxLevel) { game.notify?.(`${sk.name} はMAXレベルです`, '#ffd23f'); return false; }
  const pool = skillSpTier(sk);
  if (getSp(st, pool) <= 0) { game.notify?.(pool <= 1 ? 'SPが足りません' : `${pool}次スキル用のSPが足りません`, '#ff8a8a'); return false; }
  addSp(st, -1, pool);
  st.skills[skillId] = lv + 1;
  if (lv === 0 && sk.kind !== 'passive' && Array.isArray(st.skillBar)) {
    const i = st.skillBar.indexOf(null);
    if (i >= 0 && !st.skillBar.includes(skillId)) st.skillBar[i] = skillId;
  }
  // パッシブで最大HP等が変わるのでクランプ
  const s = computeStats(st);
  st.hp = Math.min(st.hp, s.maxHp); st.mp = Math.min(st.mp, s.maxMp);
  return true;
}

/** 転職スキルのロック理由（UI用）: null（習得条件OK）| {reqJob, jobName} */
export function jobLockOf(state, skillId) {
  const sk = SKILLS[skillId];
  if (!sk?.reqJob || hasJob(state, sk.reqJob)) return null;
  return { reqJob: sk.reqJob, jobName: JOBS[sk.reqJob]?.name || sk.reqJob };
}

/** スキル習得可能か（UI用） */
export function canLearn(state, skillId) {
  const sk = SKILLS[skillId];
  if (!sk) return false;
  return (sk.hero === 'both' || sk.hero === state.heroId) && state.level >= sk.reqLevel && jobSkillUnlocked(state, sk) &&
    skillLevel(state, skillId) < sk.maxLevel && getSp(state, skillSpTier(sk)) > 0;
}
