// レジェンダリーの力（伝説の力）。レジェンダリー装備に 1 つ付き、極意（力の書庫）に登録して使い回せる。
// 数値 v はアイテムごとのロール（range の間）。説明文は v を埋めた正確な数字にする。
// フック: modifySkill(c, def, p, v) / onHit(c, hit, v) / onCrit / onKill(c, u, v) / onCast(c, def, p, v) / onTick(c, dt, v) / onDamaged(c, info, v)

import {
  power, n, SL, procHit, procNova, procChain, rawHit, wdmg, heal, lifePct, mem, every, ready, has, lifeRatio, enemyCount, frontEnemy, shoot, blast, procP, POOLS,
} from './powerlib.js';
import { SKILLS } from '../../../data/skills.js';
import { CLASS } from '../../../data/classes.js';
import { BAL } from '../../../data/balance.js';
import { registerStat } from '../../../data/stats.js';

const mul = (hit, pct) => { hit.dmg *= 1 + pct / 100; };
const fromHero = (c, hit) => hit.src === c.hero;
const EL_NAME = { fire: '火炎', cold: '冷気', lightning: '雷撃', poison: '毒', void: '虚無', phys: '物理' };

// ======================================================================
// 攻め: スキルの形を変える
// ======================================================================
power({ id: 'pw_volley', name: '群れ矢の理', cat: 'atk', slots: SL.WO, range: [1, 3], integer: true,
  desc: (v) => `投射スキルの弾が ${n(v)} 本増える（1 本のダメージは 15% 下がる）。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'projectile') && p.behavior === 'projectile') { p.count += v; p.dmgMul *= 0.85; } } } });
power({ id: 'pw_pierce', name: '貫きの楔', cat: 'atk', slots: [...SL.WO, ...SL.J], range: [1, 3], integer: true,
  desc: (v) => `投射物が ${n(v)} 回多く敵を貫き、投射スキルのダメージ +10%。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'projectile')) { p.pierce += v; p.dmgMul *= 1.1; } } } });
power({ id: 'pw_chainmore', name: '連なる稲妻', cat: 'atk', slots: SL.WJ, range: [2, 4], integer: true,
  desc: (v) => `連鎖するスキルが ${n(v)} 回多く跳ね、ダメージ +15%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'chain') { p.chain += v; p.dmgMul *= 1.15; } } } });
power({ id: 'pw_widenova', name: '広がる環', cat: 'atk', slots: SL.ALL, range: [25, 50],
  desc: (v) => `自分を中心に放つ範囲スキルの範囲 +${n(v)}%、そのダメージ +${n(v / 2)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'nova' || p.behavior === 'whirl' || p.behavior === 'aura') { p.radius = (p.radius || 150) * (1 + v / 100); p.dmgMul *= 1 + v / 200; } } } });
power({ id: 'pw_bigswing', name: '大振りの型', cat: 'atk', slots: [...SL.W, 'gloves', 'chest'], range: [40, 80],
  desc: (v) => `近接で振るスキルの当たる範囲 +${n(v)}%、そのダメージ +15%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'melee') { p.radius = (p.radius || 50) * (1 + v / 100); p.dmgMul *= 1.15; } } } });
power({ id: 'pw_rainmore', name: '降り注ぐ災い', cat: 'atk', slots: SL.ALL, range: [2, 4], integer: true,
  desc: (v) => `空から降らせるスキルの数が ${n(v)} 増える。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'rain') p.count += v; } } });
power({ id: 'pw_legion', name: '死者の行列', cat: 'atk', slots: SL.ALL, range: [1, 3], integer: true,
  desc: (v) => `召喚スキルで呼べる数 +${n(v)}。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'summon') p.maxSummons += v; } } });
power({ id: 'pw_bonescepter', name: '骨の王笏', cat: 'atk', slots: [...SL.WO, ...SL.J], range: [40, 80],
  desc: (v) => `召喚物のダメージ +${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'summon' || has(p, 'minion')) p.dmgMul *= 1 + v / 100; } } });
power({ id: 'pw_longrite', name: '長き祝詞', cat: 'atk', slots: SL.AJ, range: [50, 100],
  desc: (v) => `強化スキルの効果時間 +${n(v)}%、効果の強さ +20%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'buff' && p.buff) { p.buff.dur = (p.buff.dur || 5) * (1 + v / 100); p.buff.mods = (p.buff.mods || []).map((m) => ({ ...m, v: m.v * 1.2, per: (m.per || 0) * 1.2 })); } } } });
power({ id: 'pw_sands', name: '時の砂', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `待ち時間のあるスキルの待ち時間 -${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.cd > 0) p.cd *= 1 - v / 100; } } });
power({ id: 'pw_spring', name: '無尽の泉', cat: 'atk', slots: SL.ALL, range: [20, 40],
  desc: (v) => `スキルのリソース消費 -${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.cost > 0) p.cost *= 1 - v / 100; } } });
power({ id: 'pw_basics', name: '基礎の極み', cat: 'atk', slots: SL.ALL, range: [60, 120],
  desc: (v) => `基本攻撃のダメージ +${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.basic) p.dmgMul *= 1 + v / 100; } } });
power({ id: 'pw_spender', name: '浪費の美学', cat: 'atk', slots: SL.ALL, range: [30, 60],
  desc: (v) => `リソースを使うスキルのダメージ +${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if (p.cost > 0) p.dmgMul *= 1 + v / 100; } } });
for (const [id, nm, el] of [['pw_conv_fire', '業火の転生', 'fire'], ['pw_conv_cold', '凍原の転生', 'cold'], ['pw_conv_light', '雷霆の転生', 'lightning'], ['pw_conv_poison', '腐毒の転生', 'poison'], ['pw_conv_void', '虚無の転生', 'void']]) {
  power({ id, name: nm, cat: 'atk', slots: SL.WO, range: [20, 40],
    desc: (v) => `すべてのスキルが${EL_NAME[el]}ダメージになり、${EL_NAME[el]}ダメージ +${n(v)}%。`,
    mods: (v) => [{ s: `inc_${el}`, v }],
    hooks: { modifySkill(c, d, p) { p.element = el; } } });
}
power({ id: 'pw_blastarrow', name: '炸裂の鏃', cat: 'atk', slots: SL.WO, range: [70, 120], integer: true,
  desc: (v) => `投射物が当たると半径 ${n(v)} で爆ぜ、周りの敵にも 60% のダメージ。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'projectile') && p.behavior === 'projectile') p.explode = Math.max(p.explode || 0, v); } } });
power({ id: 'pw_deadeye', name: '死点の見切り', cat: 'atk', slots: SL.AJ, range: [15, 30],
  desc: (v) => `待ち時間が 3 秒以上のスキルのクリティカル率 +${n(v)}%。`,
  hooks: { modifySkill(c, d, p, v) { if ((d?.cd || 0) >= 3) p.extra.critBonus = (p.extra.critBonus || 0) + v / 100; } } });
power({ id: 'pw_echocast', name: '残響する詠唱', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `呪文を使うと ${n(v)}% の確率で、0.3 秒後にもう一度発動する（消費なし）。`,
  hooks: {
    onCast(c, d, p, v) { if (has(p, 'spell') && !p.basic && c.rng.chance(v / 100)) { const m = mem(c, 'pw_echocast'); (m.q ||= []).push({ at: c.time + 0.3, p }); } },
    onTick(c) { const m = mem(c, 'pw_echocast'); if (!m.q?.length) return; const h = c.hero; for (let i = m.q.length - 1; i >= 0; i--) { const e = m.q[i]; if (c.time >= e.at || c.time < e.at - 5) { m.q.splice(i, 1); if (h && !h.dead) { const t = frontEnemy(c); if (t) c.executeSkill(h, e.p, t); } } } },
  } });
power({ id: 'pw_twinstrike', name: '双撃の構え', cat: 'atk', slots: [...SL.WO, 'gloves'], range: [20, 40],
  desc: (v) => `近接攻撃が ${n(v)}% の確率で、もう一度当たる（2 回目は 50% のダメージ）。`,
  hooks: { onHit(c, hit, v) { if (fromHero(c, hit) && has(hit.skill, 'melee') && !has(hit.skill, 'proc') && c.rng.chance(v / 100)) c.hitUnit(c.hero, hit.target, hit.skill, 0.5, { noProc: true }); } } });

// ======================================================================
// 攻め: 発動する力
// ======================================================================
power({ id: 'pw_ashheart', name: '灰燼の心臓', cat: 'atk', slots: SL.ALL, range: [120, 220],
  desc: (v) => `炎上した敵を倒すと爆発し、周り（半径 160）に武器ダメージの ${n(v)}% の火炎ダメージ。`,
  hooks: { onKill(c, u, v) { if (u.statuses.ignite?.t > 0) procNova(c, u.x, u.y, 160, v, 'fire', 'ashheart'); } } });
power({ id: 'pw_shatter', name: '砕氷の拳', cat: 'atk', slots: SL.ALL, range: [20, 45],
  desc: (v) => `凍結した敵へのダメージ +${n(v)}%、冷却した敵へのダメージ +${n(v / 2)}%。`,
  hooks: { onHit(c, hit, v) { const s = hit.target.statuses; if (s.freeze?.t > 0) mul(hit, v); else if (s.chill?.t > 0) mul(hit, v / 2); } } });
power({ id: 'pw_thundermsg', name: '雷の伝言', cat: 'atk', slots: SL.ALL, range: [20, 40],
  desc: (v) => `感電した敵に当たると ${n(v)}% の確率で、雷が 3 体に跳ねる（武器ダメージの 80%）。`,
  hooks: { onHit(c, hit, v) { if (hit.target.statuses.shock?.t > 0 && c.rng.chance(v / 100) && every(c, 'pw_thundermsg', 0.25)) procChain(c, hit.target, 3, 80, 'lightning', 'thundermsg'); } } });
power({ id: 'pw_plague', name: '疫の種', cat: 'atk', slots: SL.ALL, range: [30, 60],
  desc: (v) => `毒に侵された敵が倒れると、周りの敵 3 体に毒が移る（毎秒 武器ダメージの ${n(v)}%・4 秒）。`,
  hooks: { onKill(c, u, v) { if (!u.statuses.poison?.stacks?.length) return; const dps = wdmg(c, 'poison', ['dot']) * v / 100; let k = 0; for (const e of c.enemiesNear(u.x, u.y, 220)) { if (e === u || k >= 3) continue; c.addStatus(e, 'poison', { dps, dur: 4 }); k++; } } } });
power({ id: 'pw_bloodfall', name: '血の滝', cat: 'atk', slots: SL.ALL, range: [60, 120],
  desc: (v) => `出血している敵へのクリティカルで、武器ダメージの ${n(v)}% の物理ダメージを追加。`,
  hooks: { onCrit(c, hit, v) { if (hit.target.statuses.bleed?.t > 0) procHit(c, hit.target, v, 'phys', 'bloodfall'); } } });
power({ id: 'pw_starburst', name: '星砕き', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `クリティカルの ${n(v)}% で星が弾け、周り（半径 140）に武器ダメージの 120%（0.5 秒に 1 回まで）。`,
  hooks: { onCrit(c, hit, v) { if (c.rng.chance(v / 100) && every(c, 'pw_starburst', 0.5)) procNova(c, hit.target.x, hit.target.y, 140, 120, hit.element, 'starburst'); } } });
power({ id: 'pw_corpseblast', name: '死の連鎖', cat: 'atk', slots: SL.ALL, range: [8, 15],
  desc: (v) => `敵を倒すと 25% の確率で死体が爆ぜ、周り（半径 180）にその敵の最大ライフの ${n(v)}% のダメージ。`,
  hooks: { onKill(c, u, v) { if (!c.rng.chance(0.25)) return; const amt = u.maxLife * v / 100; for (const e of c.enemiesNear(u.x, u.y, 180)) if (e !== u) rawHit(c, e, e.boss ? amt * 0.5 : amt, 'phys'); c.emit({ t: 'nova', x: u.x, y: u.y, r: 180, el: 'phys', small: true }); } } });
power({ id: 'pw_skyhammer', name: '天の鉄槌', cat: 'atk', slots: SL.ALL, range: [10, 20],
  desc: (v) => `攻撃が当たると ${n(v)}% の確率で落雷（武器ダメージの 150% の雷撃・半径 90）。`,
  hooks: { onHit(c, hit, v) { if (has(hit.skill, 'attack') && c.rng.chance(v / 100) && every(c, 'pw_skyhammer', 0.3)) procNova(c, hit.target.x, hit.target.y, 90, 150, 'lightning', 'skyhammer'); } } });
power({ id: 'pw_fallingstar', name: '堕ちる星', cat: 'atk', slots: SL.ALL, range: [300, 600],
  desc: (v) => `6 秒ごとに敵の群れへ隕石を落とす（0.6 秒後、武器ダメージの ${n(v)}% の火炎・半径 170）。`,
  hooks: { onTick(c, dt, v) { if (!ready(c, 'pw_fallingstar', 6)) return; const t = frontEnemy(c, 700); if (t && every(c, 'pw_fallingstar', 6)) blast(c, t.x, t.y, 170, v, 'fire', 'fallingstar', { delay: 0.6 }); } } });
power({ id: 'pw_orbit', name: '回る刃', cat: 'atk', slots: SL.ALL, range: [60, 120],
  desc: (v) => `2 秒ごとに周り（半径 170）の敵すべてに武器ダメージの ${n(v)}%。`,
  hooks: { onTick(c, dt, v) { if (enemyCount(c).n && every(c, 'pw_orbit', 2)) procNova(c, c.hero.x, c.hero.y, 170, v, 'phys', 'orbit'); } } });
power({ id: 'pw_ricochetlife', name: '吸血の牙', cat: 'atk', slots: SL.ALL, range: [2, 4],
  desc: (v) => `クリティカルで与えたダメージの ${n(v)}% をライフに（1 回で最大ライフの 5% まで）。`,
  hooks: { onCrit(c, hit, v) { heal(c, Math.min(hit.dmg * v / 100, lifePct(c, 5))); } } });
power({ id: 'pw_mercy', name: '処刑人の慈悲', cat: 'atk', slots: SL.ALL, range: [8, 16],
  desc: (v) => `ライフが ${n(v)}% 以下になった普通の敵を、その場で倒す。`,
  hooks: { onHit(c, hit, v) { const t = hit.target; if (t.rank === 'normal' && !t.boss && t.life - hit.dmg <= t.maxLife * v / 100) hit.dmg = Math.max(hit.dmg, t.life + 1); } } });
power({ id: 'pw_headhunt', name: '首狩り', cat: 'atk', slots: SL.ALL, range: [25, 50],
  desc: (v) => `エリートへのダメージ +${n(v)}%、ボスへのダメージ +${n(v / 2)}%。`,
  mods: (v) => [{ s: 'dmg_elite', v }, { s: 'dmg_boss', v: v / 2 }] });
power({ id: 'pw_killlust', name: '高まる殺意', cat: 'atk', slots: SL.ALL, range: [10, 25], integer: true,
  desc: (v) => `敵を倒すたびダメージ +2%（最大 ${n(v)} 回・6 秒倒さないと消える）。`,
  hooks: {
    onKill(c, u, v) { const m = mem(c, 'pw_killlust'); if (!(c.time < m.t)) m.n = 0; m.n = Math.min(v, (m.n || 0) + 1); m.t = c.time + 6; },
    onHit(c, hit) { const m = mem(c, 'pw_killlust'); if (m.n && c.time < m.t) mul(hit, 2 * m.n); },
  } });
power({ id: 'pw_firststrike', name: '先手必勝', cat: 'atk', slots: SL.ALL, range: [40, 80],
  desc: (v) => `ライフ 90% 以上の敵へのダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if (lifeRatio(hit.target) >= 0.9) mul(hit, v); } } });
power({ id: 'pw_backwater', name: '背水の陣', cat: 'atk', slots: SL.ALL, range: [30, 60],
  desc: (v) => `自分のライフが 50% 以下のとき、ダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if (c.hero && lifeRatio(c.hero) <= 0.5) mul(hit, v); } } });
power({ id: 'pw_unscathed', name: '無傷の誇り', cat: 'atk', slots: SL.ALL, range: [20, 40],
  desc: (v) => `自分のライフが 90% 以上のとき、ダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if (c.hero && lifeRatio(c.hero) >= 0.9) mul(hit, v); } } });
power({ id: 'pw_longshot', name: '遠矢の極意', cat: 'atk', slots: SL.ALL, range: [25, 50],
  desc: (v) => `350 以上離れた敵へのダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if (c.hero && Math.abs(hit.target.x - c.hero.x) >= 350) mul(hit, v); } } });
power({ id: 'pw_closequarters', name: '肉薄', cat: 'atk', slots: SL.ALL, range: [20, 40],
  desc: (v) => `180 以内の敵へのダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if (c.hero && Math.abs(hit.target.x - c.hero.x) <= 180) mul(hit, v); } } });
power({ id: 'pw_crowdbreak', name: '群れ崩し', cat: 'atk', slots: SL.ALL, range: [4, 8],
  desc: (v) => `戦っている敵 1 体につきダメージ +${n(v)}%（最大 6 体・${n(v * 6)}%）。`,
  hooks: { onHit(c, hit, v) { mul(hit, v * Math.min(6, enemyCount(c).n)); } } });
power({ id: 'pw_giantslayer', name: '巨人殺し', cat: 'atk', slots: SL.ALL, range: [25, 50],
  desc: (v) => `ボスへのダメージ +${n(v)}%。ボスのライフが 50% 以下ならさらに +${n(v / 2)}%。`,
  hooks: { onHit(c, hit, v) { const t = hit.target; if (t.boss) mul(hit, lifeRatio(t) <= 0.5 ? v * 1.5 : v); } } });
power({ id: 'pw_pestilence', name: '病魔の書', cat: 'atk', slots: SL.ALL, range: [40, 80],
  desc: (v) => `状態異常（炎上・毒・出血）のダメージ +${n(v)}%、炎上・毒・出血の確率 +10%。`,
  mods: (v) => [{ s: 'status_dmg', v }, { s: 'ignite_chance', v: 10 }, { s: 'poison_chance', v: 10 }, { s: 'bleed_chance', v: 10 }] });
power({ id: 'pw_wildfire', name: '野火', cat: 'atk', slots: SL.ALL, range: [30, 60],
  desc: (v) => `1 秒ごとに、炎上した敵から ${n(v)}% の確率で近くの敵（220 以内）へ炎上が燃え移る。`,
  hooks: { onTick(c, dt, v) { if (!every(c, 'pw_wildfire', 1)) return; for (const u of c.units) { if (u.dead || u.team !== 'enemy' || !(u.statuses.ignite?.t > 0) || !c.rng.chance(v / 100)) continue; const nx = c.nearestEnemy(u.x, u.y, 220, (e) => !(e.statuses.ignite?.t > 0)); if (nx) c.addStatus(nx, 'ignite', { dps: u.statuses.ignite.dps }); } } } });
power({ id: 'pw_permafrost', name: '永久凍土', cat: 'atk', slots: SL.ALL, range: [6, 12],
  desc: (v) => `凍結率 +${n(v)}%。凍結した敵が倒れると、周り（半径 150）を冷却し武器ダメージの 100% の冷気ダメージ。`,
  mods: (v) => [{ s: 'freeze_chance', v }],
  hooks: { onKill(c, u) { if (u.statuses.freeze?.t > 0) procNova(c, u.x, u.y, 150, 100, 'cold', 'permafrost', { status: 'chill' }); } } });
power({ id: 'pw_thunderbrand', name: '雷鳴の烙印', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `感電した敵が受けるダメージがさらに +${n(v)}%。感電率 +10%。`,
  mods: () => [{ s: 'shock_chance', v: 10 }],
  hooks: { onHit(c, hit, v) { if (hit.target.statuses.shock?.t > 0) mul(hit, v); } } });
power({ id: 'pw_viperden', name: '毒蛇の巣', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `毒付与率 +${n(v)}%、毒ダメージ +${n(v)}%。`,
  mods: (v) => [{ s: 'poison_chance', v }, { s: 'inc_poison', v }] });
power({ id: 'pw_deepwound', name: '深手', cat: 'atk', slots: SL.ALL, range: [15, 30],
  desc: (v) => `出血率 +${n(v)}%。出血している敵へのダメージ +${n(v / 2)}%。`,
  mods: (v) => [{ s: 'bleed_chance', v }],
  hooks: { onHit(c, hit, v) { if (hit.target.statuses.bleed?.t > 0) mul(hit, v / 2); } } });
power({ id: 'pw_critdmg', name: '必殺の型', cat: 'atk', slots: SL.WJ, range: [40, 80],
  desc: (v) => `クリティカルダメージ +${n(v)}%。`, mods: (v) => [{ s: 'crit_damage', v }] });
power({ id: 'pw_haste', name: '疾風迅雷', cat: 'atk', slots: SL.ALL, range: [8, 15],
  desc: (v) => `攻撃速度 +${n(v)}%。`, mods: (v) => [{ s: 'attack_speed', v }] });
power({ id: 'pw_cascade', name: '連鎖崩壊', cat: 'atk', slots: SL.ALL, range: [60, 120],
  desc: (v) => `敵を倒すと、次の 1 撃のダメージ +${n(v)}%。`,
  hooks: { onKill(c) { mem(c, 'pw_cascade').ready = true; }, onHit(c, hit, v) { const m = mem(c, 'pw_cascade'); if (m.ready && fromHero(c, hit)) { m.ready = false; mul(hit, v); } } } });
power({ id: 'pw_resonance', name: '共鳴', cat: 'atk', slots: SL.ALL, range: [4, 8],
  desc: (v) => `同じ敵に当てるたびダメージ +${n(v)}%（最大 5 回・${n(v * 5)}%）。`,
  hooks: { onHit(c, hit, v) { if (!fromHero(c, hit)) return; const m = mem(c, 'pw_resonance'); if (m.id !== hit.target.id) { m.id = hit.target.id; m.n = 0; } mul(hit, v * m.n); m.n = Math.min(5, m.n + 1); } } });
power({ id: 'pw_voidrift', name: '虚ろの裂け目', cat: 'atk', slots: SL.ALL, range: [40, 80],
  desc: (v) => `8 秒ごとに敵の足元へ虚無の裂け目（4 秒・0.5 秒ごとに武器ダメージの ${n(v)}%・半径 130）。`,
  hooks: { onTick(c, dt, v) { if (!ready(c, 'pw_voidrift', 8)) return; const t = frontEnemy(c, 700); if (t && every(c, 'pw_voidrift', 8)) blast(c, t.x, t.y, 130, v, 'void', 'voidrift', { delay: 0.2, dur: 4, tick: 0.5, tags: ['area', 'dot'] }); } } });
power({ id: 'pw_wolves', name: '灰狼の群れ', cat: 'atk', slots: SL.ALL, range: [60, 120],
  desc: (v) => `15 秒ごとに灰狼を 2 体、10 秒間呼ぶ（武器ダメージの ${n(v)}% で噛みつく）。`,
  hooks: { onTick(c, dt, v) { if (!enemyCount(c).n || !every(c, 'pw_wolves', 15)) return; const p = { ...procP('wolves', v, 'phys', ['minion']), summon: { life: 0.6, aps: 1.4, range: 90 } }; for (let i = 0; i < 2; i++) c.spawnMinion('wolf', p, { ttl: 10, art: 'monster.ash_wolf', size: 0.7, name: '灰狼' }); } } });

// ======================================================================
// 攻め: クラス専用
// ======================================================================
// 剣闘士
power({ id: 'pw_w_fury', name: '怒髪天', cat: 'atk', cls: 'warrior', slots: SL.ALL, range: [20, 40],
  desc: (v) => `怒りが 60 以上のとき、ダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { if ((c.hero?.resource || 0) >= 60) mul(hit, v); } } });
power({ id: 'pw_w_quake', name: '地鳴りの斧', cat: 'atk', cls: 'warrior', slots: SL.ALL, range: [20, 40],
  desc: (v) => `範囲の近接スキルを使うと ${n(v)}% の確率で、0.4 秒後に地割れ（武器ダメージの 150%・半径 220）。`,
  hooks: { onCast(c, d, p, v) { if (has(p, 'melee') && has(p, 'area') && c.rng.chance(v / 100)) { const t = frontEnemy(c, 400); const h = c.hero; blast(c, t ? t.x : h.x + 150, t ? t.y : h.y, 220, 150, 'phys', 'quake', { delay: 0.4 }); c.emit({ t: 'shake', power: 3 }); } } } });
power({ id: 'pw_w_retort', name: '盾突き', cat: 'def', cls: 'warrior', slots: SL.ALL, range: [150, 300],
  desc: (v) => `攻撃を受けると 2 秒に 1 回、目の前の敵に武器ダメージの ${n(v)}% で反撃する。`,
  hooks: { onDamaged(c, info, v) { if (info.from && !info.from.dead && every(c, 'pw_w_retort', 2)) { procHit(c, info.from, v, 'phys', 'retort'); c.emit({ t: 'swing', x: info.from.x, y: info.from.y, el: 'phys', src: c.hero }); } } } });
power({ id: 'pw_w_unbreak', name: '不倒の構え', cat: 'def', cls: 'warrior', slots: SL.ALL, range: [40, 60],
  desc: (v) => `ライフが 35% を下回ると、20 秒に 1 回、4 秒間 受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { const h = c.hero; const m = mem(c, 'pw_w_unbreak'); if (!(c.time < m.until) && (h.life - info.amount) / h.maxLife < 0.35 && every(c, 'pw_w_unbreak', 20)) { m.until = c.time + 4; c.emit({ t: 'text', x: h.x, y: h.y, z: 120, text: '不倒', color: '#ffd27a' }); } if (c.time < m.until) info.amount *= 1 - v / 100; } } });
power({ id: 'pw_w_bloodfeast', name: '血の宴', cat: 'def', cls: 'warrior', slots: SL.ALL, range: [0.3, 0.6],
  desc: (v) => `近接のヒットのたび、最大ライフの ${n(v)}% を回復（1 秒に 5 回まで）。`,
  hooks: { onHit(c, hit, v) { if (has(hit.skill, 'melee') && fromHero(c, hit) && every(c, 'pw_w_bloodfeast', 0.2)) heal(c, lifePct(c, v)); } } });
power({ id: 'pw_w_warcry', name: '鬨の声', cat: 'atk', cls: 'warrior', slots: SL.ALL, range: [20, 40], integer: true,
  desc: (v) => `12 秒ごとに怒り +${n(v)}、5 秒間アーマー +50%。`,
  hooks: { onTick(c, dt, v) { if (!enemyCount(c).n || !every(c, 'pw_w_warcry', 12)) return; const h = c.hero; h.resource = Math.min(c.H.resourceMax, h.resource + v); c.addBuff('pw_w_warcry', [{ s: 'inc_armor', v: 50 }], 5, { name: '鬨の声' }); } } });
// 狩人
power({ id: 'pw_r_arrowrain', name: '千の矢雨', cat: 'atk', cls: 'ranger', slots: SL.ALL, range: [60, 100],
  desc: (v) => `攻撃スキルを 5 回使うごとに、敵の群れへ矢の雨を 4 本（1 本 武器ダメージの ${n(v)}%）。`,
  hooks: { onCast(c, d, p, v) { if (!has(p, 'attack')) return; const m = mem(c, 'pw_r_arrowrain'); m.n = (m.n || 0) + 1; if (m.n < 5) return; m.n = 0; const t = frontEnemy(c, 800); if (!t) return; for (let i = 0; i < 4; i++) blast(c, t.x + c.rng.range(-90, 90), t.y + c.rng.range(-30, 30), 90, v, 'phys', 'arrowrain', { delay: 0.35 + i * 0.08 }); } } });
power({ id: 'pw_r_mark', name: '狩人の印', cat: 'atk', cls: 'ranger', slots: SL.ALL, range: [25, 50],
  desc: (v) => `当てた敵に印を付け（同時に 1 体）、印の敵へのダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { const m = mem(c, 'pw_r_mark'); if (!m.u || m.u.dead) m.u = hit.target; if (hit.target === m.u) mul(hit, v); } } });
power({ id: 'pw_r_focus', name: '研ぎ澄ます心', cat: 'atk', cls: 'ranger', slots: SL.ALL, range: [30, 60],
  desc: (v) => `集中が 50 以上のとき、クリティカルのダメージがさらに +${n(v)}%。`,
  hooks: { onCrit(c, hit, v) { if ((c.hero?.resource || 0) >= 50) mul(hit, v); } } });
power({ id: 'pw_r_ricochet', name: '跳弾', cat: 'atk', cls: 'ranger', slots: SL.ALL, range: [25, 50],
  desc: (v) => `投射物が当たると ${n(v)}% の確率で、近くの別の敵へ跳ねる（武器ダメージの 70%）。`,
  hooks: { onHit(c, hit, v) { if (has(hit.skill, 'projectile') && !has(hit.skill, 'proc') && c.rng.chance(v / 100)) procChain(c, hit.target, 1, 70, hit.element, 'ricochet'); } } });
power({ id: 'pw_r_snare', name: '仕掛け罠', cat: 'atk', cls: 'ranger', slots: SL.ALL, range: [150, 300],
  desc: (v) => `4 秒ごとに前方へ罠を仕掛け、1 秒後に爆発する（武器ダメージの ${n(v)}%・半径 140・冷却）。`,
  hooks: { onTick(c, dt, v) { if (!ready(c, 'pw_r_snare', 4)) return; const t = frontEnemy(c, 600); if (t && every(c, 'pw_r_snare', 4)) blast(c, t.x, t.y, 140, v, 'phys', 'snare', { delay: 1, status: 'chill' }); } } });
// 魔導士
power({ id: 'pw_s_manashield', name: '魔力の盾', cat: 'def', cls: 'sorcerer', slots: SL.ALL, range: [20, 40],
  desc: (v) => `受けるダメージの ${n(v)}% をマナで肩代わりする（最大ライフの 1% につきマナ 1）。`,
  hooks: { onDamaged(c, info, v) { const h = c.hero; const take = info.amount * v / 100; const cost = take / Math.max(1, h.maxLife) * 100; if (h.resource >= cost) { h.resource -= cost; info.amount -= take; } } } });
power({ id: 'pw_s_cycle', name: '四元の輪廻', cat: 'atk', cls: 'sorcerer', slots: SL.ALL, range: [30, 60],
  desc: (v) => `呪文を使うと、火炎→冷気→雷撃の順で「次の属性」のダメージが 4 秒間 +${n(v)}%。`,
  hooks: {
    onCast(c, d, p) { if (!has(p, 'spell')) return; const order = ['fire', 'cold', 'lightning']; const i = order.indexOf(p.element); const m = mem(c, 'pw_s_cycle'); m.el = order[(i + 1) % 3]; m.t = c.time + 4; },
    onHit(c, hit, v) { const m = mem(c, 'pw_s_cycle'); if (m.el === hit.element && c.time < m.t) mul(hit, v); },
  } });
power({ id: 'pw_s_orb', name: '浮遊する魔球', cat: 'atk', cls: 'sorcerer', slots: SL.ALL, range: [50, 90],
  desc: (v) => `1.5 秒ごとに、浮かぶ魔球が近くの敵へ雷の弾を撃つ（武器ダメージの ${n(v)}%）。`,
  hooks: { onTick(c, dt, v) { if (!ready(c, 'pw_s_orb', 1.5)) return; const t = frontEnemy(c, 650); if (t && every(c, 'pw_s_orb', 1.5)) shoot(c, t, v, 'lightning', 'orb', { z: 110, speed: 900, tags: ['projectile', 'spell'] }); } } });
power({ id: 'pw_s_overload', name: '過負荷', cat: 'atk', cls: 'sorcerer', slots: SL.ALL, range: [30, 60],
  desc: (v) => `マナが 90% 以上のとき、呪文のダメージ +${n(v)}%。`,
  hooks: { onHit(c, hit, v) { const h = c.hero; if (h && has(hit.skill, 'spell') && h.resource >= c.H.resourceMax * 0.9) mul(hit, v); } } });
power({ id: 'pw_s_blizzard', name: '凍てつく嵐', cat: 'atk', cls: 'sorcerer', slots: SL.ALL, range: [30, 60],
  desc: (v) => `冷気の呪文を使うと（3 秒に 1 回）、敵の位置に 3 秒の吹雪を残す（0.5 秒ごとに武器ダメージの ${n(v)}%）。`,
  hooks: { onCast(c, d, p, v) { if (p.element !== 'cold' || !has(p, 'spell')) return; const t = frontEnemy(c, 700); if (t && every(c, 'pw_s_blizzard', 3)) blast(c, t.x, t.y, 150, v, 'cold', 'blizzard', { delay: 0.1, dur: 3, tick: 0.5, status: 'chill', tags: ['area', 'spell'] }); } } });
// 死霊術師
power({ id: 'pw_n_bonearmor', name: '骨の鎧', cat: 'def', cls: 'necromancer', slots: SL.ALL, range: [3, 6],
  desc: (v) => `召喚物 1 体につき受けるダメージ -${n(v)}%（最大 5 体・${n(v * 5)}%）。`,
  hooks: { onDamaged(c, info, v) { info.amount *= 1 - v * Math.min(5, enemyCount(c).minions) / 100; } } });
power({ id: 'pw_n_corpselance', name: '屍の槍', cat: 'atk', cls: 'necromancer', slots: SL.ALL, range: [20, 40],
  desc: (v) => `敵が倒れると ${n(v)}% の確率で、骨の槍が近くの敵へ飛ぶ（武器ダメージの 200%・2 体貫通）。`,
  hooks: { onKill(c, u, v) { if (!c.rng.chance(v / 100)) return; const t = c.nearestEnemy(u.x, u.y, 600, (e) => e !== u); if (t) shoot(c, t, 200, 'phys', 'corpselance', { x: u.x, y: u.y, pierce: 2, art: 'fx.n_bonespear.proj' }); } } });
power({ id: 'pw_n_army', name: '軍勢の主', cat: 'atk', cls: 'necromancer', slots: SL.ALL, range: [30, 60],
  desc: (v) => `召喚スキルで呼べる数 +1、召喚物のライフ +${n(v)}%。`,
  mods: (v) => [{ s: 'minion_life', v }],
  hooks: { modifySkill(c, d, p) { if (p.behavior === 'summon') p.maxSummons += 1; } } });
power({ id: 'pw_n_harvest', name: '魂の収穫', cat: 'util', cls: 'necromancer', slots: SL.ALL, range: [3, 6], integer: true,
  desc: (v) => `敵を倒すたび霊気 +${n(v)}。`,
  hooks: { onKill(c, u, v) { const h = c.hero; if (h && !h.dead) h.resource = Math.min(c.H.resourceMax, h.resource + v); } } });
power({ id: 'pw_n_bloodpact', name: '血の契り', cat: 'atk', cls: 'necromancer', slots: SL.ALL, range: [15, 30],
  desc: (v) => `召喚物の攻撃速度 +${n(v)}%。敵を倒すと最大ライフの 1% を回復。`,
  mods: (v) => [{ s: 'minion_as', v }],
  hooks: { onKill(c) { heal(c, lifePct(c, 1)); } } });
// 影刃
power({ id: 'pw_a_clone', name: '影の分身', cat: 'atk', cls: 'assassin', slots: SL.ALL, range: [60, 100],
  desc: (v) => `12 秒ごとに 6 秒間、影の分身を呼ぶ（基本攻撃の ${n(v)}% の力で戦う）。`,
  hooks: { onTick(c, dt, v) { if (!enemyCount(c).n || !every(c, 'pw_a_clone', 12)) return; const b = c.basicSkill(); if (!b) return; const p = { ...b, dmgMul: (b.dmgMul || 1) * v / 100, summon: { life: 0.5, aps: 1.6, range: 90 } }; c.spawnMinion('shadow', p, { ttl: 6, art: `hero.${c.state.hero.cls}.body`, size: 0.9, name: '影の分身' }); } } });
power({ id: 'pw_a_venomkiss', name: '毒の口づけ', cat: 'atk', cls: 'assassin', slots: SL.ALL, range: [30, 60],
  desc: (v) => `クリティカルで毒を与える（毎秒 武器ダメージの ${n(v)}%・4 秒・重なる）。`,
  hooks: { onCrit(c, hit, v) { c.addStatus(hit.target, 'poison', { dps: wdmg(c, 'poison', ['dot']) * v / 100, dur: 4 }); } } });
power({ id: 'pw_a_backstab', name: '背後の一閃', cat: 'atk', cls: 'assassin', slots: SL.ALL, range: [5, 12],
  desc: (v) => `普通の敵へのクリティカルは ${n(v)}% の確率で、その敵を即座に倒す。`,
  hooks: { onCrit(c, hit, v) { const t = hit.target; if (t.rank === 'normal' && !t.boss && c.rng.chance(v / 100)) { hit.dmg = Math.max(hit.dmg, t.life + 1); c.emit({ t: 'text', x: t.x, y: t.y, z: 100, text: '一閃', color: '#ffd84a' }); } } } });
power({ id: 'pw_a_breath', name: '刹那の呼吸', cat: 'util', cls: 'assassin', slots: SL.ALL, range: [3, 6], integer: true,
  desc: (v) => `クリティカルで気力 +${n(v)}（0.2 秒に 1 回まで）。`,
  hooks: { onCrit(c, hit, v) { const h = c.hero; if (h && every(c, 'pw_a_breath', 0.2)) h.resource = Math.min(c.H.resourceMax, h.resource + v); } } });
power({ id: 'pw_a_thousand', name: '千刃', cat: 'atk', cls: 'assassin', slots: SL.ALL, range: [60, 110],
  desc: (v) => `敵を倒すと（1 秒に 1 回）、4 方向へ刃が飛ぶ（武器ダメージの ${n(v)}%・貫通）。`,
  hooks: { onKill(c, u, v) { if (!every(c, 'pw_a_thousand', 1)) return; for (const a of [-0.5, -0.17, 0.17, 0.5]) shoot(c, null, v, 'phys', 'thousand', { x: u.x - 20, y: u.y, angle: a, pierce: 3, speed: 1100, range: 500 }); } } });

// ======================================================================
// 守り
// ======================================================================
power({ id: 'pw_d_barrier', name: '守りの結界', cat: 'def', slots: SL.AJ, range: [15, 30],
  desc: (v) => `8 秒ごとに最大ライフの ${n(v)}% の障壁を張る（ダメージを先に受け止める）。`,
  hooks: {
    onTick(c, dt, v) { if (enemyCount(c).n && every(c, 'pw_d_barrier', 8)) { const m = mem(c, 'pw_d_barrier'); m.hp = lifePct(c, v); } },
    onDamaged(c, info) { const m = mem(c, 'pw_d_barrier'); if (m.hp > 0) { const a = Math.min(m.hp, info.amount); m.hp -= a; info.amount -= a; } },
  } });
power({ id: 'pw_d_thorns', name: '茨の誓い', cat: 'def', slots: SL.A, range: [150, 400],
  desc: (v) => `攻撃を受けると、受けたダメージの ${n(v)}% を相手に返す。`,
  hooks: { onDamaged(c, info, v) { const f = info.from; if (f && !f.dead && f.team === 'enemy') rawHit(c, f, info.amount * v / 100, 'phys'); } } });
power({ id: 'pw_d_laststand', name: '死なずの誓い', cat: 'def', slots: SL.AJ, range: [30, 60],
  desc: (v) => `倒れるほどのダメージを受けたとき（90 秒に 1 回）、ライフ ${n(v)}% で踏みとどまる。`,
  hooks: { onDamaged(c, info, v) { const h = c.hero; if (info.amount >= h.life && ready(c, 'pw_d_laststand', 90)) { every(c, 'pw_d_laststand', 90); info.amount = 0; h.life = Math.max(h.life, lifePct(c, v)); c.emit({ t: 'text', x: h.x, y: h.y, z: 130, text: '踏みとどまった', color: '#ffd27a' }); } } } });
power({ id: 'pw_d_spring', name: '癒しの泉', cat: 'def', slots: SL.AJ, range: [30, 50],
  desc: (v) => `ライフが 50% を下回ると（20 秒に 1 回）、最大ライフの ${n(v)}% を回復。`,
  hooks: { onDamaged(c, info, v) { const h = c.hero; if ((h.life - info.amount) / h.maxLife < 0.5 && every(c, 'pw_d_spring', 20)) { heal(c, lifePct(c, v)); c.emit({ t: 'buff', unit: h, el: 'poison' }); } } } });
power({ id: 'pw_d_fortress', name: '城壁', cat: 'def', slots: SL.OA, range: [40, 80],
  desc: (v) => `アーマー +${n(v)}%、受ける物理ダメージ -8%。`,
  mods: (v) => [{ s: 'inc_armor', v }],
  hooks: { onDamaged(c, info) { if (info.element === 'phys') info.amount *= 0.92; } } });
power({ id: 'pw_d_ward', name: '四精の加護', cat: 'def', slots: SL.AJ, range: [10, 20], integer: true,
  desc: (v) => `全耐性 +${n(v)}、虚無耐性 +${n(v / 2)}。`,
  mods: (v) => [{ s: 'res_all', v }, { s: 'res_void', v: v / 2 }] });
power({ id: 'pw_d_bloodfeed', name: '血の糧', cat: 'def', slots: SL.ALL, range: [1, 3],
  desc: (v) => `敵を倒すたび、最大ライフの ${n(v)}% を回復。`,
  hooks: { onKill(c, u, v) { heal(c, lifePct(c, v)); } } });
power({ id: 'pw_d_steel', name: '鋼の意志', cat: 'def', slots: SL.A, range: [6, 12],
  desc: (v) => `受けるダメージ -${n(v)}%。`, mods: (v) => [{ s: 'dr', v }] });
power({ id: 'pw_d_giantshield', name: '巨人の盾', cat: 'def', slots: SL.OA, range: [15, 30],
  desc: (v) => `ボスから受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (info.from?.boss) info.amount *= 1 - v / 100; } } });
power({ id: 'pw_d_arrowward', name: '矢除けの加護', cat: 'def', slots: SL.A, range: [20, 35],
  desc: (v) => `飛び道具や術で受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { const a = info.from?.def?.attack; if (a === 'ranged' || a === 'caster') info.amount *= 1 - v / 100; } } });
power({ id: 'pw_d_iceskin', name: '氷の皮膚', cat: 'def', slots: SL.A, range: [1, 2],
  desc: (v) => `攻撃を受けると（3 秒に 1 回）、攻撃してきた敵を ${n(v)} 秒凍らせる。`,
  hooks: { onDamaged(c, info, v) { const f = info.from; if (f && !f.dead && f.team === 'enemy' && every(c, 'pw_d_iceskin', 3)) c.addStatus(f, 'freeze', { dur: v }); } } });
power({ id: 'pw_d_scapegoat', name: '身代わりの骨', cat: 'def', slots: SL.ALL, range: [10, 20],
  desc: (v) => `召喚物がいるとき、受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (enemyCount(c).minions > 0) info.amount *= 1 - v / 100; } } });
power({ id: 'pw_d_stand', name: '不動', cat: 'def', slots: SL.A, range: [8, 15],
  desc: (v) => `歩いていないとき、受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (c.hero?.anim?.s !== 'walk') info.amount *= 1 - v / 100; } } });
power({ id: 'pw_d_giant', name: '巨躯', cat: 'def', slots: SL.A, range: [15, 30],
  desc: (v) => `最大ライフ +${n(v)}%。`, mods: (v) => [{ s: 'inc_life', v }] });
power({ id: 'pw_d_bulwark', name: '大盾の心得', cat: 'def', slots: SL.OA, range: [8, 15],
  desc: (v) => `ブロック率 +${n(v)}%。`, mods: (v) => [{ s: 'block', v }] });
power({ id: 'pw_d_unyield', name: '不屈', cat: 'def', slots: SL.A, range: [40, 70],
  desc: (v) => `凍結・気絶の時間 -${n(v)}%。`,
  hooks: { onTick(c, dt, v) { const st = c.hero?.statuses; if (!st) return; for (const k of ['freeze', 'stun']) { const s = st[k]; if (s && s.t > 0 && !s._r) { s.t *= 1 - v / 100; s._r = 1; } } } } });
power({ id: 'pw_d_regen', name: '再生の血', cat: 'def', slots: SL.A, range: [0.5, 1.2],
  desc: (v) => `1 秒ごとに最大ライフの ${n(v)}% を回復する。`, mods: (v) => [{ s: 'life_regen_pct', v }] });
power({ id: 'pw_d_evasion', name: '霞の身のこなし', cat: 'def', slots: SL.A, range: [6, 12],
  desc: (v) => `回避率 +${n(v)}%。`, mods: (v) => [{ s: 'dodge', v }] });
power({ id: 'pw_d_resolve', name: '覚悟の鎧', cat: 'def', slots: SL.A, range: [15, 30],
  desc: (v) => `ライフが 50% 以下のとき、受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (lifeRatio(c.hero) <= 0.5) info.amount *= 1 - v / 100; } } });
power({ id: 'pw_d_frostbreath', name: '霜の吐息', cat: 'def', slots: SL.A, range: [100, 200],
  desc: (v) => `攻撃を受けると（4 秒に 1 回）、周り（半径 180）に冷気の環（武器ダメージの ${n(v)}%・1 秒凍結）。`,
  hooks: { onDamaged(c, info, v) { if (every(c, 'pw_d_frostbreath', 4)) procNova(c, c.hero.x, c.hero.y, 180, v, 'cold', 'frostbreath', { status: 'freeze', dur: 1 }); } } });

// ======================================================================
// 補助
// ======================================================================
power({ id: 'pw_u_midas', name: '黄金の指', cat: 'util', slots: SL.AJ, range: [30, 60],
  desc: (v) => `ゴールド獲得 +${n(v)}%。敵を倒すと 3% の確率で金貨が弾ける（その敵の 5 倍のゴールド）。`,
  mods: (v) => [{ s: 'gold_find', v }],
  hooks: { onKill(c, u) { if (!c.rng.chance(0.03)) return; const g = BAL.monsterGold(u.level) * 5 * (1 + (c.H.gold || 0) / 100); c.game.addGold(g); c.emit({ t: 'gold', x: u.x, y: u.y, v: g }); } } });
power({ id: 'pw_u_treasure', name: '宝探しの勘', cat: 'util', slots: SL.AJ, range: [20, 40],
  desc: (v) => `レア発見率 +${n(v)}%。`, mods: (v) => [{ s: 'magic_find', v }] });
power({ id: 'pw_u_sage', name: '賢者の眼', cat: 'util', slots: SL.AJ, range: [10, 20],
  desc: (v) => `経験値 +${n(v)}%。`, mods: (v) => [{ s: 'xp_bonus', v }] });
power({ id: 'pw_u_gale', name: '疾風の脚', cat: 'util', slots: SL.A, range: [15, 30],
  desc: (v) => `移動速度 +${n(v)}%。`, mods: (v) => [{ s: 'move_speed', v }] });
power({ id: 'pw_u_butcher', name: '解体の名手', cat: 'util', slots: SL.AJ, range: [20, 40],
  desc: (v) => `分解で得る素材 +${n(v)}%。`, mods: (v) => [{ s: 'mat_find', v }] });
power({ id: 'pw_u_horn', name: '豊穣の角', cat: 'util', slots: SL.J, range: [8, 15],
  desc: (v) => `アイテム発見数 +${n(v)}%。`, mods: (v) => [{ s: 'item_quantity', v }] });
power({ id: 'pw_u_goblin', name: '財宝嗅ぎ', cat: 'util', slots: SL.AJ, range: [50, 100],
  desc: (v) => `宝ゴブリンへのダメージ +${n(v)}%。宝ゴブリンを倒すとアイテムが 3 個増える。`,
  hooks: {
    onHit(c, hit, v) { if (hit.target.rank === 'goblin') mul(hit, v); },
    onKill(c, u) { if (u.rank === 'goblin') c.game.sys.merchant?.bonusDrops?.(u, 3); },
  } });
power({ id: 'pw_u_dream', name: '夢見の砂時計', cat: 'util', slots: SL.AJ, range: [10, 20],
  desc: (v) => `オフライン（放置）の効率 +${n(v)}%。`, mods: (v) => [{ s: 'offline_gain', v }] });
power({ id: 'pw_u_spirit', name: '尽きぬ闘志', cat: 'util', slots: SL.ALL, range: [20, 40],
  desc: (v) => `リソース再生 +${n(v)}%、最大リソース +20。`, mods: (v) => [{ s: 'resource_regen', v }, { s: 'max_resource', v: 20 }] });
power({ id: 'pw_u_chrono', name: '刻を削る', cat: 'util', slots: SL.ALL, range: [5, 10],
  desc: (v) => `クールダウン短縮 +${n(v)}%。`, mods: (v) => [{ s: 'cdr', v }] });
power({ id: 'pw_u_shards', name: '欠片拾い', cat: 'util', slots: SL.AJ, range: [15, 30],
  desc: (v) => `エリートを倒すと ${n(v)}% の確率で深淵の欠片を 1 つ得る。`,
  hooks: { onKill(c, u, v) { if ((u.rank === 'champion' || u.rank === 'rare') && c.rng.chance(v / 100)) { const m = c.game.state.inv.mats; m.shard = (m.shard || 0) + 1; } } } });
power({ id: 'pw_u_echo', name: '残響の鈴', cat: 'util', slots: SL.AJ, range: [25, 50],
  desc: (v) => `レジェンダリー以上を分解すると、${n(v)}% の確率で残響がもう 1 つ。` });
power({ id: 'pw_u_stars', name: '星読みの羅針', cat: 'util', slots: SL.AJ, range: [15, 30],
  desc: (v) => `幸運ゲージのたまり方 +${n(v)}%。`, mods: (v) => [{ s: 'luck_gain', v }] });
power({ id: 'pw_u_gemeye', name: '宝石の目', cat: 'util', slots: SL.AJ, range: [30, 60],
  desc: (v) => `宝石とルーンの発見率 +${n(v)}%。`, mods: (v) => [{ s: 'gem_find', v }, { s: 'rune_find', v }] });
power({ id: 'pw_u_shardsense', name: '深淵の嗅覚', cat: 'util', slots: SL.AJ, range: [25, 50],
  desc: (v) => `深淵の欠片の獲得 +${n(v)}%。`, mods: (v) => [{ s: 'shard_find', v }] });

// ======================================================================
// スキルごとの力（各スキルに 1 つ。戦闘担当がスキルを増やしても自動で作られる）
// ======================================================================
const BEHAVIOR_BONUS = {
  projectile: { t: '弾 +2', f: (p) => { p.count += 2; } },
  nova: { t: '範囲 +35%', f: (p) => { p.radius = (p.radius || 150) * 1.35; } },
  melee: { t: '当たる範囲 +60%', f: (p) => { p.radius = (p.radius || 50) * 1.6; } },
  chain: { t: '跳ねる回数 +3', f: (p) => { p.chain += 3; } },
  rain: { t: '数 +2', f: (p) => { p.count += 2; } },
  summon: { t: '呼べる数 +2', f: (p) => { p.maxSummons += 2; } },
  buff: { t: '効果時間 +100%', f: (p) => { if (p.buff) p.buff.dur = (p.buff.dur || 5) * 2; } },
  leap: { t: '範囲 +40%', f: (p) => { p.radius = (p.radius || 120) * 1.4; } },
  whirl: { t: '範囲 +35%', f: (p) => { p.radius = (p.radius || 150) * 1.35; } },
  beam: { t: '待ち時間 -25%', f: (p) => { p.cd *= 0.75; } },
  aura: { t: '範囲 +35%', f: (p) => { p.radius = (p.radius || 150) * 1.35; } },
  trap: { t: '待ち時間 -25%', f: (p) => { p.cd *= 0.75; } },
  dot: { t: '効果時間 +50%', f: (p) => { p.duration = (p.duration || 3) * 1.5; } },
};
const DEFAULT_BONUS = { t: '待ち時間 -20%', f: (p) => { p.cd *= 0.8; } };

let skillPowersDone = 0;
/** スキルの数だけ「極め」の力を作る（スキルが増えたら足す）。Game を作るときと読み込み時に呼ぶ */
export function ensureSkillPowers() {
  if (skillPowersDone === SKILLS.length) return;
  for (const s of SKILLS) {
    // スキル名の能力名（ツールチップで「強打」のダメージ と出す）
    registerStat(`skill_dmg:${s.id}`, `「${s.name}」のダメージ`, { kind: 'pct', dyn: 'skill_dmg', arg: s.id });
    registerStat(`skill_lvl:${s.id}`, `「${s.name}」のレベル`, { kind: 'flat', dyn: 'skill_lvl', arg: s.id });
    registerStat(`skill_cdr:${s.id}`, `「${s.name}」のクールダウン短縮`, { kind: 'pct', dyn: 'skill_cdr', arg: s.id });
    const id = `pw_sk_${s.id}`;
    if (POOLS.skill.includes(id)) continue;
    const bonus = BEHAVIOR_BONUS[s.behavior] || DEFAULT_BONUS;
    const clsName = CLASS[s.cls]?.name || '';
    power({ id, pool: 'skill', name: `${s.name}・極`, cat: 'atk', cls: s.cls, skill: s.id, slots: SL.ALL, range: [80, 150],
      desc: (v) => `${clsName}のスキル「${s.name}」のダメージ +${n(v)}%、${bonus.t}。`,
      hooks: { modifySkill(c, d, p, v) { if (p.id === s.id) { p.dmgMul *= 1 + v / 100; bonus.f(p); } } } });
    POOLS.legendary.push(id);
  }
  skillPowersDone = SKILLS.length;
}
ensureSkillPowers();
