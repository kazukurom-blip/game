// スキル使用・クールダウン・バフ・習得
import { SKILLS } from '../data/skills.js';
import { Projectile } from '../entities/projectile.js';
import { rectOverlap, entRect } from '../world/physics.js';
import { spawnEffect } from '../render/effects.js';
import { computeStats, addBuff, getBuffs, tickBuffs } from './progression.js';
import { playerAttackArea, calcDamage, newAttackId, setPlayerInvuln } from './combat.js';

const cds = {};       // skillId → {left, total}
let _dash = null;     // 進行中のダッシュ
let _lastWarn = 0;

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

  st.mp -= mp;
  const total = sk.cooldown(lv);
  cds[skillId] = { left: total, total };
  const stats = computeStats(st);
  const f = p.facing || 1;
  const mult = sk.mult(lv);

  switch (sk.kind) {
    case 'melee': {
      p.startAttack?.('melee');
      const rect = frontRect(p, sk.range.w, sk.range.h);
      spawnEffect(game, 'slash', p.x + f * sk.range.w * 0.45, p.y - p.h / 2, { color: sk.color, facing: f, w: sk.range.w, h: sk.range.h, hits: sk.hits });
      playerAttackArea(game, rect, mult, { hits: sk.hits, knock: sk.knock ?? 200, launch: sk.launch, effect: sk.effect, color: sk.color, maxTargets: sk.maxTargets ?? 6, knockDir: f });
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
      playerAttackArea(game, rect, mult, { hits: sk.hits, knock: sk.knock ?? 300, launch: sk.launch, effect: 'hit', color: sk.color, maxTargets: sk.maxTargets ?? 10 });
      break;
    }
    case 'dash': {
      p.startAttack?.('melee');
      const d = sk.dash;
      const dist = typeof d.dist === 'function' ? d.dist(lv) : d.dist;
      _dash = { skill: sk, dir: f, speed: dist / d.time, t: d.time, mult, attackId: newAttackId() };
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
    playerAttackArea(game, rect, _dash.mult, {
      hits: _dash.skill.hits, knock: _dash.skill.knock ?? 260, attackId: _dash.attackId,
      effect: 'hit', color: _dash.skill.color, knockDir: _dash.dir, maxTargets: 12,
    });
    if (Math.random() < 0.6) spawnEffect(game, 'dash', p.x, p.y - p.h / 2, { color: _dash.skill.color, facing: _dash.dir, trail: true });
    _dash.t -= step;
    if (_dash.t <= 0) { _dash = null; p.dashing = false; }
  }
}

export function isDashing() { return !!_dash; }

/** learnSkill(game, skillId) → bool（SP を1消費してレベル+1） */
export function learnSkill(game, skillId) {
  const sk = SKILLS[skillId];
  const st = game.state;
  if (!sk) return false;
  if (sk.hero !== 'both' && sk.hero !== st.heroId) { game.notify?.('このキャラは習得できません', '#ff8a8a'); return false; }
  if (st.level < sk.reqLevel) { game.notify?.(`Lv.${sk.reqLevel} で習得可能`, '#ff8a8a'); return false; }
  const lv = skillLevel(st, skillId);
  if (lv >= sk.maxLevel) { game.notify?.(`${sk.name} はMAXレベルです`, '#ffd23f'); return false; }
  if ((st.sp || 0) <= 0) { game.notify?.('SPが足りません', '#ff8a8a'); return false; }
  st.sp -= 1;
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

/** スキル習得可能か（UI用） */
export function canLearn(state, skillId) {
  const sk = SKILLS[skillId];
  if (!sk) return false;
  return (sk.hero === 'both' || sk.hero === state.heroId) && state.level >= sk.reqLevel &&
    skillLevel(state, skillId) < sk.maxLevel && (state.sp || 0) > 0;
}
