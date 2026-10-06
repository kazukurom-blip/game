// 戦闘: ダメージ計算・プレイヤー攻撃判定・敵/プレイヤー被弾
// ※ 警察制度（手配度・警官・パトカー）は廃止。住民（civilian）は攻撃の対象にならない。
//    addWanted / setWantedLevel / updateWanted は古い呼び出し元が落ちないよう、何もしない関数として残す（game.wanted は常に 0）。
import { spawnEffect, spawnDamageNumber } from '../render/effects.js';
import { Drop } from '../entities/drop.js';
import { rectOverlap, entRect } from '../world/physics.js';
import { computeStats, gainExp } from './progression.js';
import { rollDrops } from './loot.js';
import { bookRecord } from './book.js';
import { isNight, NIGHT_EXP_BONUS } from '../data/balance.js';
import { comboHit } from './combo.js';
import { weekdayEvent } from './daily.js';
import { arenaExpMult } from './arena.js';

/** 実時刻（ms）。テストは game.nowMs を差し替えて曜日イベントを固定できる */
export function gameNow(game) { return typeof game?.nowMs === 'function' ? game.nowMs() : Date.now(); }

const now = (game) => (typeof game.time === 'number' ? game.time : performance.now() / 1000);

export const ENEMY_INVULN = 0.1;   // 敵の無敵時間（短め）
export const PLAYER_INVULN = 1.0;  // プレイヤー被弾後の無敵時間
export const TEAR_THRESHOLDS = [0.75, 0.5, 0.25, 0.1];

/** 攻撃の対象になれない相手（住民）。通常攻撃・スキル・弾のどれも当たらない */
export function isUntargetable(e) { return !!(e && (e.civilian || e.def?.civilian || e.ai === 'civilian')); }

/**
 * 敵撃破時の経験値（市民は 0）
 *  夜 20〜5 時 +10%（game.clock 未定義なら補正なし）× 曜日イベント（月曜 +10%）× リンク（他キャラ）× アリーナ倍率
 */
export function killExp(game, def, enemy = null) {
  if (!def || def.civilian) return 0;
  let v = def.exp || 0;
  if (isNight(game?.clock)) v *= 1 + NIGHT_EXP_BONUS;
  v *= weekdayEvent(gameNow(game)).expMult || 1;
  if (game?.state) v *= 1 + (computeStats(game.state).expRate || 0);
  v *= arenaExpMult(game, enemy);
  return Math.round(v);
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
    if (!e || e.dead || e.hp <= 0 || isUntargetable(e)) continue;
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
    const m = e.def?.boss ? mult * (1 + (stats.bossDmg || 0)) : mult; // 潜在「ボスダメージ」
    for (let i = 0; i < hitsN && !e.dead; i++) {
      const r = calcDamage(stats.atk, m, e.def?.def || 0, stats.crit, stats.critDmg);
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
  if (!enemy || enemy.dead || isUntargetable(enemy)) return; // 住民にはダメージが入らない
  dmg = Math.max(1, Math.round(dmg));
  enemy.hp -= dmg;
  enemy.hurtT = 0.3;
  enemy._invulnUntil = now(game) + ENEMY_INVULN;
  enemy.provoked = true;
  const stack = opts.stack || 0;
  // v3: コンボ（同フレーム同一敵は1回）・ボスモードの最大ダメージ記録
  comboHit(game, 1, [enemy]);
  if (enemy.def?.boss && (game.bossMode || game.bossRun) && dmg > (game.bossMaxHit || 0)) {
    game.bossMaxHit = dmg;
    game.events?.emit('bossHit', { dmg, bossId: enemy.def.id });
  }
  spawnDamageNumber(game, enemy.x, enemy.y - enemy.h - 8 - stack * 30, dmg, { crit });
  if (crit && stack === 0) spawnEffect(game, 'critHit', enemy.x, enemy.y - enemy.h / 2);

  const def = enemy.def || {};
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
  const practice = enemy.instance === 'boss' && game.bossMode === 'practice'; // 練習モードは報酬なし
  if (!def.civilian && !practice) {
    st.kills = (st.kills || 0) + 1;
    gainExp(game, killExp(game, def, enemy));
    bookRecord(game, def.id || enemy.defId);
  }
  const stats = computeStats(st);
  const wd = weekdayEvent(gameNow(game));
  const drops = practice ? [] : rollDrops(def, stats.luck, Math.random, {
    dropMult: (1 + (stats.dropRate || 0)) * (wd.dropMult || 1),
    moneyMult: (1 + (stats.mesoRate || 0)) * (wd.moneyMult || 1),
  });
  drops.forEach((payload, i) => {
    const off = (i - (drops.length - 1) / 2) * 22;
    const d = new Drop(game, enemy.x + off, enemy.y - Math.min(enemy.h, 60) / 2, payload);
    game.drops.push(d);
  });
  spawnEffect(game, def.art === 'drone' ? 'explosion' : 'smoke', enemy.x, enemy.y - enemy.h / 2);
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
  // 潜在「被弾時 5% で HP 回復」
  if (s.hpRecover > 0 && st.hp > 0 && Math.random() < 0.05) {
    const heal = Math.min(s.maxHp - st.hp, Math.round(s.maxHp * s.hpRecover));
    if (heal > 0) { st.hp += heal; spawnDamageNumber(game, p.x + 16, p.y - p.h - 26, heal, { heal: true }); }
  }

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

// ---- 手配度（廃止） ----
// 警察制度は廃止した。古いコード・セーブ・デバッグから呼ばれても落ちないよう、手配度を 0 に保つだけの関数を残す。
export function wantedLevelFor() { return 0; }

function clearWanted(game) {
  if (!game) return;
  game.wanted = 0;
  game.wantedHeat = 0;
}

/** addWanted(game, heat) — 廃止（何もしない。手配度は常に 0） */
export function addWanted(game) { clearWanted(game); }

/** setWantedLevel(game, level) — 廃止（何もしない。手配度は常に 0） */
export function setWantedLevel(game) { clearWanted(game); }

/** updateWanted(game, dt) — 廃止（何もしない。手配度は常に 0） */
export function updateWanted(game) { clearWanted(game); }
