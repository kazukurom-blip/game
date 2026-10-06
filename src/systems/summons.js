// 召喚獣（kind:'summon' のスキル）: 一定時間だけプレイヤーのそばに浮かび、近くの敵を自動で攻撃する
//  - 同じスキルをもう一度使うと残り時間が全体に戻る（重ねがけ）。同時に出せるのは MAX_SUMMONS 体まで（超えたら残り時間が一番短いものと入れ替え）
//  - game.summons = [{ id, skillId, name, color, left: 残り秒, dur: 全体の秒 }]（UI が右上に残り時間を出す。形は変えないこと）
//  - 安全のための扱い:
//      マップ移動 … ついてくる（プレイヤーの横に並び直す。残り時間はそのまま。砲台もプレイヤーの近くに置き直す）
//      町への移動 … 全部消える（市民・警官を巻き込まないため。町では召喚スキル自体も使えない）
//      倒れた時 / キャラが変わった時（タイトルに戻って別キャラ） … 全部消える
//      車に乗っている間 … ついてくるが攻撃しない
//  - 攻撃するのはモンスターだけ（市民・警官は狙わない）
//  skill.summon = { type, dur(lv), interval, attack, reach:{w,h}, count?, burst?, area?:{w,h}, follow?:false, knock? }
//    type   … 見た目（render/summons.js）: sprite | familiar | daemon | oracle | drone | turret | bomber | squadron
//    attack … bolt（狙い撃ちの弾。burst 発ずつ）| zap（狙った1体に電撃。skill.hits 回）| beam（向いた方へ貫く光線）
//             | pulse（自分の周りに波動）| bomb（狙った敵の真上から爆弾。area の範囲）
//    1回の攻撃の倍率 = skill.mult(lv)、ヒット数 = skill.hits
import { SKILLS } from '../data/skills.js';
import { Projectile } from '../entities/projectile.js';
import { entRect } from '../world/physics.js';
import { spawnEffect } from '../render/effects.js';
import { drawSummon } from '../render/summons.js';
import { computeStats } from './progression.js';
import { playerAttackArea } from './combat.js';

export const MAX_SUMMONS = 3;
const SUMMON_SCALE = 1.2; // ゲーム内の見た目の大きさ（キャラ約80pxに対して）
let _seq = 1;

const units = (game) => game._summonUnits || (game._summonUnits = []);
/** game.summons（UI 用の一覧）を作り直す。各要素は Summon.info と同じオブジェクト（left は毎フレーム更新される） */
function publish(game) { game.summons = units(game).map((s) => s.info); }

/** 狙ってよい敵（モンスターのみ。市民・警官・倒れた敵・出現演出中は除く） */
export function summonTargetOk(e) {
  return !!e && !e.dead && !e.remove && e.hp > 0 && !e.def?.civilian && !e.civilian && !e.def?.isCop && !(e.spawnT > 0);
}

export class Summon {
  constructor(game, sk, lv) {
    this.game = game;
    this.skill = sk;
    this.lv = lv;
    const sm = sk.summon || {};
    this.type = sm.type || 'drone';
    this.follow = sm.follow !== false;
    this.count = Math.max(1, sm.count || 1);
    const dur = Math.max(1, typeof sm.dur === 'function' ? sm.dur(lv) : sm.dur || 30);
    this.info = { id: 'sm' + _seq++, skillId: sk.id, name: sk.name, color: sk.color || '#3dff8a', left: dur, dur };
    this.owner = game.state;
    this.mapId = game.map?.id;
    const p = game.player;
    this.facing = p?.facing || 1;
    this.x = (p?.x ?? 0) + this.facing * (this.follow ? -30 : 50);
    this.y = this.follow ? (p?.y ?? 0) - 70 : groundYAt(game, this.x, p?.y ?? 0);
    this.cd = 0.35;          // 最初の攻撃までの間
    this.t = 0;
    this.slot = 0;
    this.queue = [];         // 連射の予約 {t, target}
    this.fx = [];            // 攻撃の線（描画用）{kind, x1, y1, x2, y2, t, life}
    this.spawnT = 0.35;      // 出現演出
    this.remove = false;
  }

  get left() { return this.info.left; }

  /** 重ねがけ: 残り時間を全体に戻す（レベルが上がっていれば長さも更新） */
  refresh(lv) {
    const sm = this.skill.summon || {};
    this.lv = lv;
    const dur = Math.max(1, typeof sm.dur === 'function' ? sm.dur(lv) : sm.dur || 30);
    this.info.dur = dur; this.info.left = dur;
    this.spawnT = 0.25;
  }

  /** 召喚した場所に戻す（マップ移動の後など） */
  relocate() {
    const p = this.game.player;
    if (!p) return;
    this.facing = p.facing || 1;
    // 浮かぶものはプレイヤーの後ろ上、砲台はプレイヤーの前の地面
    this.x = this.follow ? p.x - this.facing * 40 : p.x + this.facing * 50;
    this.y = this.follow ? p.y - 90 : groundYAt(this.game, this.x, p.y);
    this.queue.length = 0; this.fx.length = 0;
    this.mapId = this.game.map?.id;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    this.spawnT = Math.max(0, this.spawnT - dt);
    this.info.left = Math.max(0, this.info.left - dt);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.info.left <= 0) { this.vanish(); return; }
    if (!p) return;
    // 位置: プレイヤーの後ろ上にふわふわ（何体もいる時は少しずつずらす）。砲台は置いた場所に固定（離れすぎたら付いてくる）
    if (this.follow) {
      const f = p.facing || 1;
      const tx = p.x - f * (50 + this.slot * 46), ty = p.y - 100 - (this.slot % 2) * 26 + Math.sin(this.t * 2.6 + this.slot) * 6;
      const k = 1 - Math.exp(-dt * 6);
      this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
      if (Math.abs(p.x - this.x) > 900 || Math.abs(p.y - this.y) > 600) { this.x = tx; this.y = ty; }
    } else if (Math.abs(p.x - this.x) > 800 || Math.abs(p.y - this.y) > 400) {
      this.relocate();
    }
    // 予約済みの連射
    for (const q of this.queue) q.t -= dt;
    while (this.queue.length && this.queue[0].t <= 0) { const q = this.queue.shift(); this.fireBolt(q.target, q.i); }
    // 攻撃（車に乗っている間・倒れている間は止まる）
    this.cd -= dt;
    if (this.cd > 0 || p.inVehicle || p.dead) return;
    const target = this.findTarget();
    if (!target) { this.cd = 0.15; return; }
    const sm = this.skill.summon || {};
    this.cd = Math.max(0.2, sm.interval || 1.2);
    this.facing = target.x >= this.x ? 1 : -1;
    this.attack(target);
  }

  /** 範囲（summon.reach。召喚獣とプレイヤーの両方から見る）の中で一番近い敵 */
  findTarget() {
    const g = this.game, p = g.player;
    const rw = (this.skill.summon?.reach?.w || 700) / 2, rh = (this.skill.summon?.reach?.h || 320) / 2;
    let best = null, bd = Infinity;
    for (const e of g.enemies || []) {
      if (!summonTargetOk(e)) continue;
      const ey = e.y - (e.h || 40) / 2;
      const near = (ox, oy) => Math.abs(e.x - ox) <= rw && Math.abs(ey - oy) <= rh;
      if (!near(this.x, this.y) && !(p && near(p.x, p.y - 40))) continue;
      const d = Math.hypot(e.x - this.x, ey - this.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** muzzle: 弾・線の出る位置（群れなら i 番目の機体） */
  muzzle(i = 0) {
    if (this.type === 'squadron') {
      const a = this.t * 2.2 + (i / this.count) * Math.PI * 2;
      return { x: this.x + Math.cos(a) * 38 * SUMMON_SCALE, y: this.y + Math.sin(a) * 14 * SUMMON_SCALE };
    }
    if (this.type === 'turret') return { x: this.x + this.facing * 30 * SUMMON_SCALE, y: this.y - 34 * SUMMON_SCALE };
    return { x: this.x + this.facing * 12, y: this.y };
  }

  attack(target) {
    const g = this.game, sk = this.skill, sm = sk.summon || {};
    const mult = sk.mult(this.lv);
    const hits = Math.max(1, sk.hits || 1);
    const col = sk.color;
    const tx = target.x, ty = target.y - (target.h || 40) / 2;
    switch (sm.attack) {
      case 'zap': {
        const m = this.muzzle();
        this.fx.push({ kind: 'zap', x1: m.x, y1: m.y, x2: tx, y2: ty, t: 0, life: 0.22, seed: Math.random() * 1000 });
        const rect = entRect(target);
        playerAttackArea(g, { x: rect.x - 4, y: rect.y - 4, w: rect.w + 8, h: rect.h + 8 }, mult, { hits, knock: sm.knock ?? 60, effect: 'spark', color: col, maxTargets: 1, knockDir: this.facing });
        break;
      }
      case 'beam': {
        const m = this.muzzle();
        const len = sm.reach?.w ? sm.reach.w * 0.6 : 520;
        const x2 = m.x + this.facing * len;
        const y2 = m.y + (ty - m.y) * 0.85;
        this.fx.push({ kind: 'beam', x1: m.x, y1: m.y, x2, y2, t: 0, life: 0.3 });
        const top = Math.min(m.y, y2) - 30, bot = Math.max(m.y, y2) + 30;
        playerAttackArea(g, { x: Math.min(m.x, x2), y: top, w: Math.abs(x2 - m.x), h: bot - top }, mult, { hits, knock: sm.knock ?? 120, effect: 'spark', color: col, maxTargets: sk.maxTargets ?? 6, knockDir: this.facing });
        break;
      }
      case 'pulse': {
        const a = sm.area || { w: 460, h: 260 };
        this.fx.push({ kind: 'pulse', x1: this.x, y1: this.y + 40, x2: this.x, y2: this.y, t: 0, life: 0.45, w: a.w, h: a.h });
        spawnEffect(g, 'spark', this.x, this.y + 40, { color: col });
        playerAttackArea(g, { x: this.x - a.w / 2, y: this.y + 40 - a.h / 2, w: a.w, h: a.h }, mult, { hits, knock: sm.knock ?? 160, effect: 'spark', color: col, maxTargets: sk.maxTargets ?? 10 });
        break;
      }
      case 'bomb': {
        const a = sm.area || { w: 220, h: 160 };
        const m = this.muzzle();
        this.fx.push({ kind: 'bomb', x1: m.x, y1: m.y, x2: tx, y2: ty, t: 0, life: 0.3 });
        spawnEffect(g, 'explosion', tx, ty, { color: col, radius: a.w / 2, w: a.w, h: a.h });
        playerAttackArea(g, { x: tx - a.w / 2, y: ty - a.h / 2, w: a.w, h: a.h }, mult, { hits, knock: sm.knock ?? 240, effect: 'hit', color: col, maxTargets: sk.maxTargets ?? 8 });
        break;
      }
      case 'bolt': default: {
        // 群れは各機が1発ずつ、単体は burst 発の連射（少しずつ遅らせる）
        const n = this.type === 'squadron' ? this.count : Math.max(1, sm.burst || 1);
        for (let i = 0; i < n; i++) {
          if (i === 0) this.fireBolt(target, 0);
          else this.queue.push({ t: i * 0.09, target, i });
        }
      }
    }
  }

  fireBolt(target, i = 0) {
    const g = this.game, sk = this.skill;
    if (!g.state || !g.player || g.player.dead) return;
    const tgt = summonTargetOk(target) ? target : this.findTarget();
    const m = this.muzzle(i);
    const tx = tgt ? tgt.x : m.x + this.facing * 300, ty = tgt ? tgt.y - (tgt.h || 40) / 2 : m.y;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    const speed = this.skill.summon?.speed || 900;
    const stats = computeStats(g.state);
    const hits = Math.max(1, sk.hits || 1);
    g.projectiles.push(new Projectile(g, {
      owner: 'player', kind: this.skill.summon?.proj || 'magic', x: m.x, y: m.y,
      vx: (dx / d) * speed, vy: (dy / d) * speed,
      atk: stats.atk, mult: sk.mult(this.lv), crit: stats.crit, critDmg: stats.critDmg, multiHit: hits,
      life: 1.2, range: (this.skill.summon?.reach?.w || 700) + 200, pierce: 0, w: 18, h: 18, color: sk.color, knock: 60, skillId: sk.id, summon: true,
    }));
    spawnEffect(g, 'muzzle', m.x, m.y, { color: sk.color, facing: dx >= 0 ? 1 : -1 });
  }

  vanish(silent = false) {
    if (this.remove) return;
    this.remove = true;
    if (!silent) spawnEffect(this.game, 'spark', this.x, this.y, { color: this.skill.color });
  }

  draw(ctx) {
    drawSummon(ctx, this.type, this.x, this.y, {
      t: this.t, color: this.skill.color, facing: this.facing, count: this.count, fx: this.fx, scale: SUMMON_SCALE,
      spawnK: this.spawnT > 0 ? 1 - this.spawnT / 0.35 : 1,
      fade: this.info.left < 3 ? 0.45 + 0.55 * Math.abs(Math.sin(this.t * 10)) : 1, // 消える前は点滅
    });
  }
}

/** 地面（足場）の高さ: 砲台を置く位置。見つからなければプレイヤーの足元 */
function groundYAt(game, x, fallbackY) {
  const map = game.map;
  if (!map) return fallbackY;
  let best = map.groundY ?? fallbackY;
  for (const pl of map.platforms || []) {
    if (x < pl.x || x > pl.x + pl.w) continue;
    if (pl.y >= fallbackY - 4 && pl.y < best) best = pl.y;
  }
  return Math.min(best, map.groundY ?? best);
}

/**
 * spawnSummon(game, skillId|skill, lv) → Summon（召喚 or 重ねがけ）
 *  同じスキルの召喚獣がいれば残り時間を戻すだけ。上限（MAX_SUMMONS）を超えたら残り時間が一番短いものを消す
 */
export function spawnSummon(game, skillOrId, lv = 1) {
  const sk = typeof skillOrId === 'string' ? SKILLS[skillOrId] : skillOrId;
  if (!sk || !game) return null;
  const list = units(game);
  const same = list.find((s) => s.skill.id === sk.id && !s.remove);
  if (same) {
    same.refresh(lv);
    spawnEffect(game, 'buff', same.x, same.y + 20, { color: sk.color });
    publish(game);
    return same;
  }
  while (list.filter((s) => !s.remove).length >= MAX_SUMMONS) {
    const old = list.filter((s) => !s.remove).sort((a, b) => a.info.left - b.info.left)[0];
    old.vanish();
    list.splice(list.indexOf(old), 1);
  }
  const s = new Summon(game, sk, lv);
  list.push(s);
  resetSlots(list);
  spawnEffect(game, 'portal', s.x, s.y + (s.follow ? 30 : -10), { color: sk.color });
  publish(game);
  return s;
}

function resetSlots(list) { let k = 0; for (const s of list) if (s.follow) s.slot = k++; }

/** 全部消す（倒れた・町に入った・キャラが変わった時） */
export function clearSummons(game, silent = true) {
  const list = units(game);
  for (const s of list) s.vanish(silent);
  list.length = 0;
  publish(game);
}

/** updateSummons(game, dt) — systems/skills.js の updateSkills から毎フレーム呼ばれる */
export function updateSummons(game, dt) {
  if (!game) return;
  const list = units(game);
  if (!Array.isArray(game.summons)) publish(game);
  if (!list.length) { if (game.summons.length) publish(game); return; }
  const p = game.player;
  // キャラが変わった・倒れた → 全部消える。町に入った → 全部消える。別のフィールドへ移動 → ついてくる
  if (!p || p.dead || (game.state?.hp ?? 1) <= 0 || list[0].owner !== game.state) { clearSummons(game); return; }
  if (game.map?.town) { clearSummons(game); game.notify?.('召喚獣は町には入れない', '#ffd166'); return; }
  let changed = false;
  for (const s of list) {
    if (s.mapId !== game.map?.id) s.relocate();
    s.update(dt);
    if (s.remove) changed = true;
  }
  if (changed) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].remove) list.splice(i, 1);
    resetSlots(list);
    publish(game);
  }
}

/** drawSummons(ctx, game) — ワールド空間（entities/player.js の draw から呼ぶ） */
export function drawSummons(ctx, game) {
  const list = game?._summonUnits;
  if (!list || !list.length) return;
  for (const s of list) {
    if (s.remove || s.owner !== game.state || s.mapId !== game.map?.id) continue;
    try { s.draw(ctx); } catch (e) { if (!drawSummons._warned) { drawSummons._warned = 1; console.warn('[summon draw]', e); } }
  }
}

/** 召喚中のユニット（テスト・デバッグ用） */
export function summonUnits(game) { return units(game); }
