// 戦闘: ダメージ計算・プレイヤー攻撃判定・敵/プレイヤー被弾・手配度
import { spawnEffect, spawnDamageNumber } from '../render/effects.js';
import { Drop } from '../entities/drop.js';
import { rectOverlap, entRect } from '../world/physics.js';
import { computeStats, gainExp } from './progression.js';
import { rollDrops } from './loot.js';
import { bookRecord } from './book.js';
import { isFieldMap } from './travel.js';
import { isNight, NIGHT_EXP_BONUS } from '../data/balance.js';

const now = (game) => (typeof game.time === 'number' ? game.time : performance.now() / 1000);

export const ENEMY_INVULN = 0.1;   // 敵の無敵時間（短め）
export const PLAYER_INVULN = 1.0;  // プレイヤー被弾後の無敵時間
export const TEAR_THRESHOLDS = [0.75, 0.5, 0.25, 0.1];

// 手配度: wantedHeat がこの値以上で ★n
export const WANTED_HEAT = [0, 1, 5, 12, 22, 35];
export const WANTED_MAX_HEAT = 45;
// 市民への攻撃（GTA風）: 殴る=小, 倒す=中
export const CIVILIAN_HIT_HEAT = 0.8;
export const CIVILIAN_KILL_HEAT = 4;
// フィールド（警察がいない）での手配度減衰倍率
export const FIELD_WANTED_DECAY = 5;

/** 敵撃破時の経験値（夜 20〜5 時は +10%。game.clock 未定義なら補正なし。市民は 0） */
export function killExp(game, def) {
  if (!def || def.civilian) return 0;
  const base = def.exp || 0;
  return isNight(game?.clock) ? Math.round(base * (1 + NIGHT_EXP_BONUS)) : base;
}

/** calcDamage(atk, mult, def, crit, critDmg) → {dmg, crit} 乱数幅±10% */
export function calcDamage(atk, mult = 1, def = 0, crit = 0, critDmg = 1.5) {
  let d = atk * mult * (0.9 + Math.random() * 0.2);
  d *= 100 / (100 + Math.max(0, def) * 1.5);
  const isCrit = Math.random() < crit;
  if (isCrit) d *= critDmg;
  return { dmg: Math.max(1, Math.round(d)), crit: isCrit };
}

let _attackSeq = 1;
export function newAttackId() { return _attackSeq++; }

/**
 * playerAttackArea(game, rect, mult, opts) → 命中した敵配列
 * opts: {hits=1, knock=200, launch=0, effect, color, maxTargets=8, attackId, knockDir}
 *  attackId を渡すと、同じ攻撃で同じ敵に複数回当たらない（ダッシュの通過判定など）
 */
export function playerAttackArea(game, rect, mult = 1, opts = {}) {
  const hitsN = opts.hits ?? 1;
  const maxT = opts.maxTargets ?? 8;
  const stats = computeStats(game.state);
  const p = game.player;
  const t = now(game);
  const cands = [];
  for (const e of game.enemies || []) {
    if (!e || e.dead || e.hp <= 0) continue;
    if (opts.attackId != null) {
      if (e._hitBy === opts.attackId) continue;
    } else if (e._invulnUntil && t < e._invulnUntil) continue;
    if (!rectOverlap(rect, entRect(e))) continue;
    cands.push(e);
  }
  // 近い順
  const cx = p ? p.x : rect.x + rect.w / 2;
  cands.sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
  const hit = cands.slice(0, maxT);
  for (const e of hit) {
    if (opts.attackId != null) e._hitBy = opts.attackId;
    const dir = opts.knockDir ?? (e.x >= cx ? 1 : -1);
    for (let i = 0; i < hitsN && !e.dead; i++) {
      const r = calcDamage(stats.atk, mult, e.def?.def || 0, stats.crit, stats.critDmg);
      damageEnemy(game, e, r.dmg, r.crit, i === hitsN - 1 ? dir : 0, {
        stack: i, knock: opts.knock ?? 200, launch: opts.launch || 0,
      });
    }
    spawnEffect(game, opts.effect || 'hit', e.x, e.y - e.h / 2, { color: opts.color });
  }
  return hit;
}

/** damageEnemy(game, enemy, dmg, crit, knockDir, opts={stack, knock, launch}) */
export function damageEnemy(game, enemy, dmg, crit = false, knockDir = 0, opts = {}) {
  if (!enemy || enemy.dead) return;
  dmg = Math.max(1, Math.round(dmg));
  enemy.hp -= dmg;
  enemy.hurtT = 0.3;
  enemy._invulnUntil = now(game) + ENEMY_INVULN;
  enemy.provoked = true;
  const stack = opts.stack || 0;
  spawnDamageNumber(game, enemy.x, enemy.y - enemy.h - 8 - stack * 30, dmg, { crit });
  if (crit && stack === 0) spawnEffect(game, 'critHit', enemy.x, enemy.y - enemy.h / 2);

  const def = enemy.def || {};
  if (def.civilian) {
    // 市民を殴った → 手配度（小）・逃げる
    enemy.scared = true;
    enemy.fleeT = 4;
    enemy.fleeDir = knockDir || (game.player ? (enemy.x >= game.player.x ? 1 : -1) : 1);
    if (enemy.hp > 0) addWanted(game, CIVILIAN_HIT_HEAT);
    game.events?.emit('civilianHit', { enemy });
  }
  const resist = def.boss ? 0.15 : 1;
  const knock = opts.knock ?? 180;
  if (knockDir && knock > 0) {
    enemy.vx = knockDir * knock * resist;
    enemy.knockT = def.boss ? 0.05 : 0.25;
    if (def.ai !== 'flyer') enemy.vy = Math.min(enemy.vy || 0, -(opts.launch || 140) * resist);
  } else if (opts.launch && def.ai !== 'flyer') {
    enemy.vy = Math.min(enemy.vy || 0, -opts.launch * resist);
  }
  if (enemy.hp <= 0) killEnemy(game, enemy);
}

function killEnemy(game, enemy) {
  enemy.hp = 0;
  enemy.dead = true;
  enemy.state = 'dead';
  const def = enemy.def || {};
  const st = game.state;
  if (!def.civilian) {
    st.kills = (st.kills || 0) + 1;
    gainExp(game, killExp(game, def));
    bookRecord(game, def.id || enemy.defId);
  }
  const stats = computeStats(st);
  const drops = rollDrops(def, stats.luck);
  drops.forEach((payload, i) => {
    const off = (i - (drops.length - 1) / 2) * 22;
    const d = new Drop(game, enemy.x + off, enemy.y - Math.min(enemy.h, 60) / 2, payload);
    game.drops.push(d);
  });
  spawnEffect(game, def.art === 'drone' ? 'explosion' : 'smoke', enemy.x, enemy.y - enemy.h / 2);
  if (def.isCop) addWanted(game, def.heat ?? 3);
  if (def.civilian) {
    addWanted(game, CIVILIAN_KILL_HEAT);
    game.events?.emit('civilianKilled', { enemy });
  }
  if (def.boss) game.notify?.(`${def.name} を倒した！`, '#ffd23f');
  game.events?.emit('enemyKilled', { enemy });
}

export function setPlayerInvuln(game, sec) {
  const p = game.player;
  if (!p) return;
  p._invulnUntil = Math.max(p._invulnUntil || 0, now(game) + sec);
  p.invulnT = Math.max(p.invulnT || 0, sec);
}

export function isPlayerInvuln(game) {
  const p = game.player;
  if (!p) return true;
  if (p.godMode || p.god || game.debug?.god || game.debug?.invincible) return true;
  return now(game) < (p._invulnUntil || 0);
}

/** damagePlayer(game, amount, fromX) → 実ダメージ（無敵中は 0） */
export function damagePlayer(game, amount, fromX) {
  const st = game.state;
  const p = game.player;
  if (!p || st.hp <= 0 || isPlayerInvuln(game)) return 0;
  const s = computeStats(st);
  const before = st.hp / s.maxHp;
  let dmg = amount * (0.9 + Math.random() * 0.2) * (100 / (100 + s.def)) * (1 - s.dmgReduce);
  dmg = Math.max(1, Math.round(dmg));
  st.hp = Math.max(0, st.hp - dmg);
  const after = st.hp / s.maxHp;

  spawnDamageNumber(game, p.x, p.y - p.h - 8, dmg, { toPlayer: true });
  spawnEffect(game, 'hit', p.x, p.y - p.h / 2, { color: '#b04dff' });
  // ノックバック
  const dir = fromX == null ? -(p.facing || 1) : (p.x >= fromX ? 1 : -1);
  if (!p.inVehicle) {
    p.vx = dir * 320;
    p.vy = Math.min(p.vy || 0, -380);
    p.onGround = false;
    p.hurtT = 0.35;
  }
  setPlayerInvuln(game, PLAYER_INVULN);

  // 服が破れる演出（閾値を下回った瞬間）
  let torn = false;
  for (const th of TEAR_THRESHOLDS) {
    if (before >= th && after < th) {
      torn = true;
      spawnEffect(game, 'tear', p.x, p.y - p.h * 0.55, { level: th, color: '#ff6fb5' });
    }
  }
  if (torn && st.hp > 0) game.notify?.('服が破れた！', '#ff8ac8');

  game.events?.emit('playerDamaged', { amount: dmg });
  if (st.hp <= 0) {
    p.dead = true;
    game.events?.emit('playerDied');
  }
  return dmg;
}

// ---- 手配度 ----
export function wantedLevelFor(heat) {
  let lv = 0;
  for (let i = 1; i < WANTED_HEAT.length; i++) if (heat >= WANTED_HEAT[i]) lv = i;
  return lv;
}

function refreshWanted(game) {
  const lv = wantedLevelFor(game.wantedHeat || 0);
  if (lv !== (game.wanted || 0)) {
    const up = lv > (game.wanted || 0);
    game.wanted = lv;
    game.events?.emit('wantedChanged', { level: lv });
    if (up) game.notify?.(`手配度 ${'★'.repeat(lv)}`, '#ff3d3d');
    else if (lv === 0) game.notify?.('警察をまいた！', '#5cff9a');
  }
}

/** addWanted(game, heat) — 負の値で減少 */
export function addWanted(game, heat) {
  game.wantedHeat = Math.max(0, Math.min(WANTED_MAX_HEAT, (game.wantedHeat || 0) + heat));
  if (heat > 0) game._wantedLastAdd = now(game);
  refreshWanted(game);
}

export function setWantedLevel(game, level) {
  level = Math.max(0, Math.min(5, level | 0));
  game.wantedHeat = WANTED_HEAT[level] + (level ? 0.5 : 0);
  if (level) game._wantedLastAdd = now(game);
  refreshWanted(game);
}

/** 警官に見られていない時に減衰（main/spawner から毎フレーム呼ぶ）。opts: {seen?:bool, sight, grace, rate}
 *  フィールド（map.town === false。警察がいない）では素早く減衰する（grace 1 秒・速度 ×FIELD_WANTED_DECAY） */
export function updateWanted(game, dt, opts = {}) {
  if (!(game.wantedHeat > 0)) return;
  if (isFieldMap(game.map)) {
    const since = now(game) - (game._wantedLastAdd || 0);
    if (since > (opts.grace ?? 1)) {
      const rate = (opts.rate ?? (0.6 + game.wantedHeat * 0.03)) * FIELD_WANTED_DECAY;
      game.wantedHeat = Math.max(0, game.wantedHeat - rate * dt);
      refreshWanted(game);
    }
    return;
  }
  const p = game.player;
  const sight = opts.sight ?? 650;
  let seen = typeof opts.seen === 'boolean' ? opts.seen : false;
  if (p && typeof opts.seen !== 'boolean') {
    for (const e of game.enemies || []) {
      if (!e || e.dead || !e.def?.isCop) continue;
      if (Math.abs(e.x - p.x) < sight && Math.abs(e.y - p.y) < 300) { seen = true; break; }
    }
  }
  const since = now(game) - (game._wantedLastAdd || 0);
  if (!seen && since > (opts.grace ?? 4)) {
    const rate = opts.rate ?? (0.6 + (game.wantedHeat * 0.03));
    game.wantedHeat = Math.max(0, game.wantedHeat - rate * dt);
    refreshWanted(game);
  }
}
