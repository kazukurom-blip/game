// ユニーク・ミシック・セット・深淵の宝石の特別な力。
// ユニーク/ミシックの力は v がアイテムごとのロール。セットの力は v が決まっている。深淵の宝石の力は v が宝石のレベル。

import {
  power, n, SL, procHit, procNova, procChain, rawHit, wdmg, heal, lifePct, mem, every, ready, has, lifeRatio, enemyCount, frontEnemy, shoot, blast, procP,
} from './powerlib.js';
import { BAL } from '../../../data/balance.js';

const mul = (hit, pct) => { hit.dmg *= 1 + pct / 100; };
const fromHero = (c, hit) => hit.src === c.hero;
const U = (def) => power({ pool: 'unique', ...def });
const M = (def) => power({ pool: 'mythic', ...def });
const S = (def) => power({ pool: 'set', ...def });
const G = (def) => power({ pool: 'lgem', integer: true, ...def });

/** 呪文をもう一度（遅れて）発動させる仕組み（残響する詠唱・七曜） */
function queueEcho(c, key, p, delay = 0.3) { const m = mem(c, key); (m.q ||= []).push({ at: c.time + delay, p }); }
function runEcho(c, key) {
  const m = mem(c, key);
  if (!m.q?.length) return;
  const h = c.hero;
  for (let i = m.q.length - 1; i >= 0; i--) {
    const e = m.q[i];
    if (c.time >= e.at || c.time < e.at - 5) { m.q.splice(i, 1); if (h && !h.dead) { const t = frontEnemy(c); if (t) c.executeSkill(h, e.p, t); } }
  }
}
/** 倒れるほどのダメージを 1 回だけ防ぐ（待ち時間つき） */
function cheatDeath(c, info, key, cd, lifeAfter, text) {
  const h = c.hero;
  if (info.amount < h.life || !ready(c, key, cd)) return false;
  every(c, key, cd);
  info.amount = 0;
  h.life = Math.max(h.life, lifePct(c, lifeAfter));
  c.emit({ t: 'text', x: h.x, y: h.y, z: 130, text, color: '#ffd27a' });
  return true;
}

// ======================================================================
// ユニーク（武器）
// ======================================================================
U({ id: 'u_grief', name: '啜り泣く刃', cat: 'atk', range: [3, 5],
  desc: (v) => `敵を倒すたび、5 秒間 攻撃速度 +${n(v)}%（最大 5 回・${n(v * 5)}%）。`,
  hooks: { onKill(c, u, v) { c.addBuff('u_grief', [{ s: 'attack_speed', v }], 5, { stack: true, maxStacks: 5, name: '慟哭' }); } } });
U({ id: 'u_widow', name: '血の弔い', cat: 'atk', range: [150, 250],
  desc: (v) => `出血した敵が倒れると血が爆ぜ、周り（半径 170）に武器ダメージの ${n(v)}% の物理ダメージ。`,
  hooks: { onKill(c, u, v) { if (u.statuses.bleed?.t > 0) procNova(c, u.x, u.y, 170, v, 'phys', 'widow'); } } });
U({ id: 'u_bellringer', name: '割れ鐘', cat: 'atk', range: [150, 250],
  desc: (v) => `攻撃スキルを 4 回使うごとに鐘が鳴り、周り（半径 200）の敵を 1 秒気絶させ武器ダメージの ${n(v)}%。`,
  hooks: { onCast(c, d, p, v) { if (!has(p, 'attack')) return; const m = mem(c, 'u_bellringer'); m.n = (m.n || 0) + 1; if (m.n >= 4) { m.n = 0; procNova(c, c.hero.x, c.hero.y, 200, v, 'phys', 'bell', { status: 'stun', dur: 1, big: true }); c.emit({ t: 'shake', power: 3 }); } } } });
U({ id: 'u_kingslayer', name: '王の血', cat: 'atk', range: [60, 100],
  desc: (v) => `エリートとボスへのクリティカルのダメージ +${n(v)}%。`,
  hooks: { onCrit(c, hit, v) { if (hit.target.rank !== 'normal' || hit.target.boss) mul(hit, v); } } });
U({ id: 'u_ashbrand', name: '灰の波', cat: 'atk', range: [80, 140],
  desc: (v) => `近接スキルを使うと（0.8 秒に 1 回）、前方へ炎の波を放つ（武器ダメージの ${n(v)}% の火炎・敵を貫く）。`,
  hooks: { onCast(c, d, p, v) { if (has(p, 'melee') && every(c, 'u_ashbrand', 0.8)) shoot(c, frontEnemy(c), v, 'fire', 'ashwave', { pierce: 6, speed: 800, range: 600, z: 40 }); } } });
U({ id: 'u_windpiercer', name: '風穿ち', cat: 'atk', range: [2, 4], integer: true,
  desc: (v) => `投射物が ${n(v)} 回多く敵を貫き、弾の速さ +50%。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'projectile')) { p.pierce += v; p.speed *= 1.5; } } } });
U({ id: 'u_starfall', name: '流れ星', cat: 'atk', range: [100, 180],
  desc: (v) => `クリティカルで星が落ちる（武器ダメージの ${n(v)}%・半径 120・0.4 秒に 1 回まで）。`,
  hooks: { onCrit(c, hit, v) { if (every(c, 'u_starfall', 0.4)) blast(c, hit.target.x, hit.target.y, 120, v, 'lightning', 'starfall', { delay: 0.25 }); } } });
U({ id: 'u_ironbolt', name: '打ち込む杭', cat: 'atk', range: [20, 40],
  desc: (v) => `投射スキルのダメージ +${n(v)}%。当たった敵を 0.5 秒気絶させる（同じ敵はしばらく効かない）。`,
  hooks: {
    modifySkill(c, d, p, v) { if (has(p, 'projectile')) p.dmgMul *= 1 + v / 100; },
    onHit(c, hit) { if (has(hit.skill, 'projectile') && fromHero(c, hit)) c.addStatus(hit.target, 'stun', { dur: 0.5 }); },
  } });
U({ id: 'u_swarm', name: '群れる矢', cat: 'atk', range: [25, 45],
  desc: (v) => `投射の攻撃スキルを使うと ${n(v)}% の確率で、追加の矢を 2 本放つ（1 本 武器ダメージの 60%）。`,
  hooks: { onCast(c, d, p, v) { if (!has(p, 'projectile') || !has(p, 'attack') || !c.rng.chance(v / 100)) return; const t = frontEnemy(c); const base = t ? Math.atan2((t.y - c.hero.y) * 2, t.x - c.hero.x) : 0; for (const a of [-0.18, 0.18]) shoot(c, null, 60, 'phys', 'swarm', { angle: base + a, speed: 1200, range: 700 }); } } });
U({ id: 'u_frostheart', name: '凍てつく心臓', cat: 'atk', range: [25, 45],
  desc: (v) => `冷気ダメージ +${n(v)}%。凍結した敵が倒れると砕け、周り（半径 160）の敵を凍結させる。`,
  mods: (v) => [{ s: 'inc_cold', v }],
  hooks: { onKill(c, u) { if (u.statuses.freeze?.t > 0) procNova(c, u.x, u.y, 160, 50, 'cold', 'frostheart', { status: 'freeze', dur: 1 }); } } });
U({ id: 'u_tempest', name: '嵐呼び', cat: 'atk', range: [30, 50],
  desc: (v) => `呪文を使うと ${n(v)}% の確率で、近くの敵 2 体に落雷（武器ダメージの 150%・半径 70）。`,
  hooks: { onCast(c, d, p, v) { if (!has(p, 'spell') || !c.rng.chance(v / 100)) return; const h = c.hero; const list = c.enemiesNear(h.x + 300, h.y, 500).slice(0, 2); for (const e of list) procNova(c, e.x, e.y, 70, 150, 'lightning', 'tempest'); } } });
U({ id: 'u_cinder', name: '消えぬ熾火', cat: 'atk', range: [25, 45],
  desc: (v) => `炎上した敵へのダメージ +${n(v)}%、炎上率 +15%。`,
  mods: () => [{ s: 'ignite_chance', v: 15 }],
  hooks: { onHit(c, hit, v) { if (hit.target.statuses.ignite?.t > 0) mul(hit, v); } } });
U({ id: 'u_whisper', name: '秘めた囁き', cat: 'util', range: [3, 6],
  desc: (v) => `呪文のクリティカルで、最大リソースの ${n(v)}% を回復（0.3 秒に 1 回まで）。`,
  hooks: { onCrit(c, hit, v) { const h = c.hero; if (has(hit.skill, 'spell') && h && every(c, 'u_whisper', 0.3)) h.resource = Math.min(c.H.resourceMax, h.resource + c.H.resourceMax * v / 100); } } });
U({ id: 'u_reaper', name: '湧き出る骸', cat: 'atk', range: [20, 35],
  desc: (v) => `敵を倒すと ${n(v)}% の確率で骸骨の戦士が湧き、10 秒戦う（武器ダメージの 80%・同時に 4 体まで）。`,
  hooks: { onKill(c, u, v) { if (!c.rng.chance(v / 100)) return; const k = c.units.filter((x) => !x.dead && x.minion === 'reaper').length; if (k >= 4) return; const p = { ...procP('reaper', 80, 'phys', ['minion']), summon: { life: 0.8, aps: 1.1, range: 90 } }; const m = c.spawnMinion('reaper', p, { ttl: 10, art: 'minion.skeleton', name: '骸骨' }); if (m) { m.x = u.x; m.y = u.y; } } } });
U({ id: 'u_bonelord', name: '骨の玉座', cat: 'atk', range: [1, 2], integer: true,
  desc: (v) => `召喚スキルで呼べる数 +${n(v)}、召喚物のライフ +50%。`,
  mods: () => [{ s: 'minion_life', v: 50 }],
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'summon') p.maxSummons += v; } } });
U({ id: 'u_plaguerod', name: '黒い咳', cat: 'atk', range: [30, 50],
  desc: (v) => `召喚物の攻撃が 50% の確率で毒を与える。毒ダメージ +${n(v)}%。`,
  mods: (v) => [{ s: 'inc_poison', v }],
  hooks: { modifySkill(c, d, p) { if (p.behavior === 'summon') p.status = { id: 'poison', chance: 0.5 }; } } });
U({ id: 'u_nightfang', name: '影の追い打ち', cat: 'atk', range: [4, 7],
  desc: (v) => `クリティカル率 +${n(v)}%。クリティカルで影が追い打ちする（武器ダメージの 50% の虚無）。`,
  mods: (v) => [{ s: 'crit_chance', v }],
  hooks: { onCrit(c, hit) { if (fromHero(c, hit) && every(c, 'u_nightfang', 0.15)) procHit(c, hit.target, 50, 'void', 'nightfang'); } } });
U({ id: 'u_serpent', name: '二枚の舌', cat: 'atk', range: [25, 45],
  desc: (v) => `毒に侵された敵に当てると（0.3 秒に 1 回）、毒がもう 1 つ重なる。毒ダメージ +${n(v)}%。`,
  mods: (v) => [{ s: 'inc_poison', v }],
  hooks: { onHit(c, hit) { const st = hit.target.statuses.poison; if (st?.stacks?.length && every(c, 'u_serpent', 0.3)) { const last = st.stacks[st.stacks.length - 1]; c.addStatus(hit.target, 'poison', { dps: last.dps, dur: 4 }); } } } });
U({ id: 'u_tigerclaw', name: '虎の連撃', cat: 'atk', range: [8, 14],
  desc: (v) => `攻撃速度 +${n(v)}%、連撃率 +10%。`, mods: (v) => [{ s: 'attack_speed', v }, { s: 'multistrike', v: 10 }] });
U({ id: 'u_shadowclaw', name: '影縫い', cat: 'atk', range: [40, 80],
  desc: (v) => `敵を倒すと、次の攻撃は必ずクリティカルになり、さらにダメージ +${n(v)}%。`,
  hooks: {
    onKill(c) { mem(c, 'u_shadowclaw').ready = true; },
    onHit(c, hit, v) { const m = mem(c, 'u_shadowclaw'); if (!m.ready || !fromHero(c, hit)) return; m.ready = false; if (!hit.crit) hit.dmg *= c.H.critMult; mul(hit, v); },
  } });
// ユニーク（副手）
U({ id: 'u_aegis', name: '不落', cat: 'def', range: [8, 14],
  desc: (v) => `ブロック率 +${n(v)}%、受けるダメージ -${n(v / 2)}%。`, mods: (v) => [{ s: 'block', v }, { s: 'dr', v: v / 2 }] });
U({ id: 'u_thornshield', name: '茨の抱擁', cat: 'def', range: [100, 200],
  desc: (v) => `攻撃を受けると（1 秒に 1 回）、周り（半径 160）の敵に武器ダメージの ${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (every(c, 'u_thornshield', 1)) procNova(c, c.hero.x, c.hero.y, 160, v, 'phys', 'thornshield'); } } });
U({ id: 'u_quiverstorm', name: '尽きぬ矢', cat: 'atk', range: [1, 2], integer: true,
  desc: (v) => `投射スキルの弾が ${n(v)} 本増える（ダメージは下がらない）。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'projectile') && p.behavior === 'projectile') p.count += v; } } });
U({ id: 'u_orbofeye', name: '遠見', cat: 'atk', range: [20, 40],
  desc: (v) => `呪文の範囲 +${n(v)}%、呪文の射程 +30%。`,
  hooks: { modifySkill(c, d, p, v) { if (has(p, 'spell')) { if (p.radius) p.radius *= 1 + v / 100; p.range *= 1.3; } } } });
U({ id: 'u_mirrororb', name: '鏡返し', cat: 'def', range: [100, 200],
  desc: (v) => `術や飛び道具で受けるダメージ -15%、受けたダメージの ${n(v)}% を相手に返す。`,
  hooks: { onDamaged(c, info, v) { const a = info.from?.def?.attack; if (a !== 'ranged' && a !== 'caster') return; info.amount *= 0.85; if (!info.from.dead) rawHit(c, info.from, info.amount * v / 100, 'void'); } } });
U({ id: 'u_deadroll', name: '名を呼ぶ声', cat: 'atk', range: [150, 300],
  desc: (v) => `召喚物が倒れると爆発し、周り（半径 170）に武器ダメージの ${n(v)}%。`,
  hooks: { onTick(c, dt, v) { if (!every(c, 'u_deadroll_scan', 0.1)) return; for (const u of c.units) { if (u.kind === 'minion' && u.dead && !u._boom) { u._boom = 1; procNova(c, u.x, u.y, 170, v, 'phys', 'deadroll'); } } } } });
U({ id: 'u_twinfang', name: '片割れ', cat: 'atk', range: [25, 45],
  desc: (v) => `基本攻撃が ${n(v)}% の確率で、もう一度当たる（100% のダメージ）。`,
  hooks: { onHit(c, hit, v) { if (hit.skill?.basic && fromHero(c, hit) && c.rng.chance(v / 100)) c.hitUnit(c.hero, hit.target, hit.skill, 1, { noProc: true }); } } });
// ユニーク（頭）
U({ id: 'u_crownofash', name: '燃え残りの怒り', cat: 'atk', range: [20, 40], integer: true,
  desc: (v) => `最大リソース +${n(v)}。リソースが 90 以上のとき、ダメージ +20%。`,
  mods: (v) => [{ s: 'max_resource', v }],
  hooks: { onHit(c, hit) { if ((c.hero?.resource || 0) >= 90) mul(hit, 20); } } });
U({ id: 'u_hood', name: '獣の匂い', cat: 'util', range: [20, 40],
  desc: (v) => `リソース再生 +${n(v)}%、エリートへのダメージ +15%。`, mods: (v) => [{ s: 'resource_regen', v }, { s: 'dmg_elite', v: 15 }] });
U({ id: 'u_circlet', name: '星の囁き', cat: 'util', range: [20, 40],
  desc: (v) => `リソース再生 +${n(v)}%、呪文の待ち時間 -15%。`,
  mods: (v) => [{ s: 'resource_regen', v }],
  hooks: { modifySkill(c, d, p) { if (has(p, 'spell') && p.cd > 0) p.cd *= 0.85; } } });
U({ id: 'u_skullcap', name: '七つの忠告', cat: 'atk', range: [4, 7],
  desc: (v) => `召喚物 1 体につきダメージ +${n(v)}%（最大 6 体・${n(v * 6)}%）。`,
  hooks: { onHit(c, hit, v) { mul(hit, v * Math.min(6, enemyCount(c).minions)); } } });
U({ id: 'u_mask', name: '無貌', cat: 'atk', range: [40, 70],
  desc: (v) => `クリティカルダメージ +${n(v)}%、回避率 +5%。`, mods: (v) => [{ s: 'crit_damage', v }, { s: 'dodge', v: 5 }] });
// ユニーク（胴）
U({ id: 'u_bastion', name: '城塞', cat: 'def', range: [12, 20],
  desc: (v) => `最大ライフ +${n(v)}%、受けるダメージ -5%。`, mods: (v) => [{ s: 'inc_life', v }, { s: 'dr', v: 5 }] });
U({ id: 'u_mantle', name: '黄昏の加護', cat: 'def', range: [12, 20], integer: true,
  desc: (v) => `全耐性 +${n(v)}、虚無耐性 +${n(v)}。`, mods: (v) => [{ s: 'res_all', v }, { s: 'res_void', v }] });
U({ id: 'u_bloodmail', name: '吸う輪', cat: 'def', range: [1.5, 3],
  desc: (v) => `与えたダメージの ${n(v)}% をライフに吸収する。`, mods: (v) => [{ s: 'leech', v }] });
U({ id: 'u_shroud', name: '影隠れ', cat: 'def', range: [60, 90],
  desc: (v) => `ライフが 30% を下回ると（30 秒に 1 回）、3 秒間 影に溶け、受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { const h = c.hero; const m = mem(c, 'u_shroud'); if (!(c.time < m.until) && (h.life - info.amount) / h.maxLife < 0.3 && every(c, 'u_shroud', 30)) { m.until = c.time + 3; c.emit({ t: 'text', x: h.x, y: h.y, z: 120, text: '影隠れ', color: '#c77dff' }); } if (c.time < m.until) info.amount *= 1 - v / 100; } } });
U({ id: 'u_phoenix', name: '灰からの再誕', cat: 'def', range: [50, 100],
  desc: (v) => `倒れるほどのダメージを受けたとき（120 秒に 1 回）、炎となって蘇る（ライフ ${n(v)}%・周り（半径 260）に武器ダメージの 500% の火炎）。`,
  hooks: { onDamaged(c, info, v) { if (cheatDeath(c, info, 'u_phoenix', 120, v, '再誕')) procNova(c, c.hero.x, c.hero.y, 260, 500, 'fire', 'phoenix', { big: true }); } } });
// ユニーク（手）
U({ id: 'u_gauntlet', name: '巨人の握力', cat: 'atk', range: [20, 40],
  desc: (v) => `近接スキルのダメージ +${n(v)}%。`, hooks: { modifySkill(c, d, p, v) { if (has(p, 'melee')) p.dmgMul *= 1 + v / 100; } } });
U({ id: 'u_quickhand', name: '早業', cat: 'atk', range: [8, 14],
  desc: (v) => `攻撃速度 +${n(v)}%。`, mods: (v) => [{ s: 'attack_speed', v }] });
U({ id: 'u_stormgrip', name: 'はぜる指', cat: 'atk', range: [15, 30],
  desc: (v) => `ヒットで ${n(v)}% の確率（0.3 秒に 1 回まで）、雷が 2 体に跳ねる（武器ダメージの 70%）。`,
  hooks: { onHit(c, hit, v) { if (fromHero(c, hit) && c.rng.chance(v / 100) && every(c, 'u_stormgrip', 0.3)) procChain(c, hit.target, 2, 70, 'lightning', 'stormgrip'); } } });
U({ id: 'u_frostfinger', name: '凍る指先', cat: 'atk', range: [5, 10],
  desc: (v) => `凍結率 +${n(v)}%、冷気ダメージ +15%。`, mods: (v) => [{ s: 'freeze_chance', v }, { s: 'inc_cold', v: 15 }] });
U({ id: 'u_venomglove', name: '毒手', cat: 'atk', range: [20, 40],
  desc: (v) => `すべてのヒットが ${n(v)}% の確率で毒を与える（毎秒 武器ダメージの 40%・4 秒）。`,
  hooks: { onHit(c, hit, v) { if (c.rng.chance(v / 100)) c.addStatus(hit.target, 'poison', { dps: wdmg(c, 'poison', ['dot']) * 0.4, dur: 4 }); } } });
// ユニーク（腰・脚・足）
U({ id: 'u_girdle', name: '巨人の背丈', cat: 'def', range: [40, 80], integer: true,
  desc: (v) => `筋力 +${n(v)}、最大ライフ +10%。`, mods: (v) => [{ s: 'str', v }, { s: 'inc_life', v: 10 }] });
U({ id: 'u_coinbelt', name: '重い財布', cat: 'util', range: [30, 60],
  desc: (v) => `ゴールド獲得 +${n(v)}%、レア発見率 +10%。`, mods: (v) => [{ s: 'gold_find', v }, { s: 'magic_find', v: 10 }] });
U({ id: 'u_cordofsouls', name: '魂縛り', cat: 'util', range: [2, 4], integer: true,
  desc: (v) => `敵を倒すたびリソース +${n(v)}。`,
  hooks: { onKill(c, u, v) { const h = c.hero; if (h && !h.dead) h.resource = Math.min(c.H.resourceMax, h.resource + v); } } });
U({ id: 'u_chainbelt', name: '鎖の威圧', cat: 'def', range: [10, 20],
  desc: (v) => `周りに敵が 3 体以上いるとき、受けるダメージ -${n(v)}%。`,
  hooks: { onDamaged(c, info, v) { if (enemyCount(c).n >= 3) info.amount *= 1 - v / 100; } } });
U({ id: 'u_stonelegs', name: '根を張る', cat: 'def', range: [30, 60],
  desc: (v) => `アーマー +${n(v)}%。歩いていないとき、受けるダメージ -10%。`,
  mods: (v) => [{ s: 'inc_armor', v }],
  hooks: { onDamaged(c, info) { if (c.hero?.anim?.s !== 'walk') info.amount *= 0.9; } } });
U({ id: 'u_wanderer', name: '果てまでの道', cat: 'util', range: [10, 20],
  desc: (v) => `移動速度 +${n(v)}%、経験値 +10%。`, mods: (v) => [{ s: 'move_speed', v }, { s: 'xp_bonus', v: 10 }] });
U({ id: 'u_runedpants', name: '縫い込まれた呪文', cat: 'atk', range: [20, 40],
  desc: (v) => `呪文のダメージ +${n(v)}%。`, mods: (v) => [{ s: 'inc_spell', v }] });
U({ id: 'u_ironlegs', name: '膝をつかぬ誓い', cat: 'def', range: [10, 20], integer: true,
  desc: (v) => `全耐性 +${n(v)}。`, mods: (v) => [{ s: 'res_all', v }] });
U({ id: 'u_windboots', name: '一番槍', cat: 'atk', range: [10, 20],
  desc: (v) => `移動速度 +${n(v)}%。新しい群れへの最初の一撃のダメージ +100%。`,
  mods: (v) => [{ s: 'move_speed', v }],
  hooks: {
    onTick(c) { if (enemyCount(c).n === 0) mem(c, 'u_windboots').fresh = true; },
    onHit(c, hit) { const m = mem(c, 'u_windboots'); if (m.fresh && fromHero(c, hit)) { m.fresh = false; mul(hit, 100); } },
  } });
U({ id: 'u_emberstep', name: '火の足跡', cat: 'atk', range: [40, 80],
  desc: (v) => `歩いている間、0.5 秒ごとに足元が燃え上がる（武器ダメージの ${n(v)}% の火炎・半径 120）。`,
  hooks: { onTick(c, dt, v) { const h = c.hero; if (h?.anim?.s === 'walk' && enemyCount(c).n && every(c, 'u_emberstep', 0.5)) procNova(c, h.x, h.y, 120, v, 'fire', 'emberstep'); } } });
U({ id: 'u_ironboots', name: '揺るがぬ足', cat: 'def', range: [20, 40],
  desc: (v) => `凍結・気絶・冷却を受けない。アーマー +${n(v)}%。`,
  mods: (v) => [{ s: 'inc_armor', v }],
  hooks: { onTick(c) { const st = c.hero?.statuses; if (st && (st.freeze || st.stun || st.chill)) { delete st.freeze; delete st.stun; delete st.chill; } } } });
U({ id: 'u_ghoststep', name: '遅れる足音', cat: 'def', range: [5, 9],
  desc: (v) => `回避率 +${n(v)}%。`, mods: (v) => [{ s: 'dodge', v }] });
// ユニーク（首飾り・指輪）
U({ id: 'u_eye', name: '覗き返す眼', cat: 'atk', range: [10, 20],
  desc: (v) => `全スキルのレベル +1、ダメージ +${n(v)}%。`, mods: (v) => [{ s: 'skill_lvl', v: 1 }, { s: 'inc_dmg', v }] });
U({ id: 'u_heartstone', name: '石の鼓動', cat: 'def', range: [10, 20],
  desc: (v) => `最大ライフ +${n(v)}%、1 秒ごとに最大ライフの 1% を回復。`, mods: (v) => [{ s: 'inc_life', v }, { s: 'life_regen_pct', v: 1 }] });
U({ id: 'u_prism', name: '八つ目の色', cat: 'atk', range: [20, 35],
  desc: (v) => `火炎・冷気・雷撃のダメージ +${n(v)}%、炎上率 +5%、凍結率 +3%、感電率 +5%。`,
  mods: (v) => [{ s: 'inc_elemental', v }, { s: 'ignite_chance', v: 5 }, { s: 'freeze_chance', v: 3 }, { s: 'shock_chance', v: 5 }] });
U({ id: 'u_bonecharm', name: '増える指', cat: 'atk', range: [30, 60],
  desc: (v) => `召喚物のダメージ +${n(v)}%。`, hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'summon' || has(p, 'minion')) p.dmgMul *= 1 + v / 100; } } });
U({ id: 'u_beckon', name: '招く鈴の音', cat: 'util', range: [15, 30],
  desc: (v) => `レア発見率 +${n(v)}%、幸運ゲージのたまり方 +20%。`, mods: (v) => [{ s: 'magic_find', v }, { s: 'luck_gain', v: 20 }] });
U({ id: 'u_bandofwar', name: '戦の記憶', cat: 'atk', range: [15, 30],
  desc: (v) => `攻撃スキルのダメージ +${n(v)}%。`, mods: (v) => [{ s: 'inc_attack', v }] });
U({ id: 'u_ringofsun', name: '日輪の熱', cat: 'atk', range: [20, 35],
  desc: (v) => `火炎ダメージ +${n(v)}%、炎上率 +10%。`, mods: (v) => [{ s: 'inc_fire', v }, { s: 'ignite_chance', v: 10 }] });
U({ id: 'u_ringofmoon', name: '月輪の冷え', cat: 'atk', range: [20, 35],
  desc: (v) => `冷気ダメージ +${n(v)}%、凍結率 +5%。`, mods: (v) => [{ s: 'inc_cold', v }, { s: 'freeze_chance', v: 5 }] });
U({ id: 'u_serpentring', name: '尾を噛む蛇', cat: 'atk', range: [20, 35],
  desc: (v) => `毒ダメージ +${n(v)}%、毒付与率 +10%。`, mods: (v) => [{ s: 'inc_poison', v }, { s: 'poison_chance', v: 10 }] });
U({ id: 'u_greed', name: '金色の指', cat: 'util', range: [25, 45],
  desc: (v) => `ゴールド獲得 +${n(v)}%、レア発見率 +${n(v / 2)}%。`, mods: (v) => [{ s: 'gold_find', v }, { s: 'magic_find', v: v / 2 }] });
U({ id: 'u_ouroboros', name: '巡る力', cat: 'util', range: [6, 10],
  desc: (v) => `クールダウン短縮 +${n(v)}%。スキルを使うと 10% の確率で、使ったリソースが戻る。`,
  mods: (v) => [{ s: 'cdr', v }],
  hooks: { onCast(c, d, p) { if (p.cost > 0 && c.rng.chance(0.1)) { const h = c.hero; h.resource = Math.min(c.H.resourceMax, h.resource + p.cost); } } } });

// ======================================================================
// ミシック
// ======================================================================
M({ id: 'm_worldend', name: '終わりを開く', cat: 'atk', range: [1.5, 1.8],
  desc: (v) => `すべてのダメージ ×${v.toFixed(2)}（最終ダメージ）。`, mods: (v) => [{ s: 'more_dmg', v: (v - 1) * 100 }] });
M({ id: 'm_godslayer', name: '神を穿つ', cat: 'atk', range: [1.6, 2.0],
  desc: (v) => `エリートとボスへのダメージ ×${v.toFixed(2)}。ボスから受けるダメージ -20%。`,
  hooks: {
    onHit(c, hit, v) { if (hit.target.rank !== 'normal' || hit.target.boss) hit.dmg *= v; },
    onDamaged(c, info) { if (info.from?.boss) info.amount *= 0.8; },
  } });
M({ id: 'm_starmaw', name: '星を喰らう', cat: 'atk', range: [4, 6],
  desc: (v) => `敵を倒すたび、すべてのスキルの待ち時間が 0.5 秒縮み、8 秒間ダメージ +${n(v)}%（最大 10 回・${n(v * 10)}%）。`,
  hooks: {
    onKill(c, u, v) { const h = c.hero; if (!h) return; for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - 0.5); const m = mem(c, 'm_starmaw'); if (!(c.time < m.t)) m.n = 0; m.n = Math.min(10, (m.n || 0) + 1); m.t = c.time + 8; },
    onHit(c, hit, v) { const m = mem(c, 'm_starmaw'); if (m.n && c.time < m.t) mul(hit, v * m.n); },
  } });
M({ id: 'm_grail', name: '底なしの杯', cat: 'util', range: [40, 60],
  desc: (v) => `スキルのリソース消費 -${n(v)}%。1 秒ごとに最大リソースの 5% がたまる。`,
  hooks: {
    modifySkill(c, d, p, v) { if (p.cost > 0) p.cost *= 1 - v / 100; },
    onTick(c) { const h = c.hero; if (h && !h.dead && every(c, 'm_grail', 1)) h.resource = Math.min(c.H.resourceMax, h.resource + c.H.resourceMax * 0.05); },
  } });
M({ id: 'm_thousandeyes', name: '千の眼', cat: 'atk', range: [6, 10],
  desc: (v) => `全スキルのレベル +2、クリティカル率 +${n(v)}%。`, mods: (v) => [{ s: 'skill_lvl', v: 2 }, { s: 'crit_chance', v }] });
M({ id: 'm_undying', name: '止まらぬ鼓動', cat: 'def', range: [20, 30],
  desc: (v) => `最大ライフ +${n(v)}%。倒れるほどのダメージを受けたとき（60 秒に 1 回）、ライフが全回復する。`,
  mods: (v) => [{ s: 'inc_life', v }],
  hooks: { onDamaged(c, info) { cheatDeath(c, info, 'm_undying', 60, 100, '不滅'); } } });
M({ id: 'm_timegrasp', name: '掴んだ一瞬', cat: 'atk', range: [12, 20],
  desc: (v) => `攻撃速度 +${n(v)}%、クールダウン短縮 +15%。クリティカルで、すべての待ち時間が 0.2 秒縮む。`,
  mods: (v) => [{ s: 'attack_speed', v }, { s: 'cdr', v: 15 }],
  hooks: { onCrit(c) { const h = c.hero; if (h) for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - 0.2); } } });
M({ id: 'm_infinity', name: '終わらぬ環', cat: 'def', range: [20, 30], integer: true,
  desc: (v) => `全耐性 +${n(v)}、受けるダメージ -15%。`, mods: (v) => [{ s: 'res_all', v }, { s: 'dr', v: 15 }] });
M({ id: 'm_roots', name: '倒れぬ古木', cat: 'def', range: [60, 100],
  desc: (v) => `アーマー +${n(v)}%。攻撃を受けると、受けたダメージの 300% を相手に返す。`,
  mods: (v) => [{ s: 'inc_armor', v }],
  hooks: { onDamaged(c, info) { const f = info.from; if (f && !f.dead && f.team === 'enemy') rawHit(c, f, info.amount * 3, 'phys'); } } });
M({ id: 'm_voidwalk', name: '消える足跡', cat: 'atk', range: [25, 40],
  desc: (v) => `移動速度 +${n(v)}%。敵の群れに近づくと（6 秒に 1 回）、虚無が爆ぜる（武器ダメージの 600%・半径 220）。`,
  mods: (v) => [{ s: 'move_speed', v }],
  hooks: { onTick(c) { const h = c.hero; if (!h || !ready(c, 'm_voidwalk', 6)) return; const t = c.nearestEnemy(h.x, h.y, 300); if (t && every(c, 'm_voidwalk', 6)) procNova(c, h.x + 60, h.y, 220, 600, 'void', 'voidwalk', { big: true }); } } });
M({ id: 'm_genesis', name: '最初の一滴', cat: 'atk', range: [25, 40],
  desc: (v) => `ダメージ +${n(v)}%、最大ライフ +${n(v)}%、全スキルのレベル +1。`, mods: (v) => [{ s: 'inc_dmg', v }, { s: 'inc_life', v }, { s: 'skill_lvl', v: 1 }] });
M({ id: 'm_fate', name: '書き換わる運命', cat: 'util', range: [40, 60],
  desc: (v) => `レア発見率 +${n(v)}%、アイテム発見数 +20%、幸運ゲージのたまり方 +100%。`,
  mods: (v) => [{ s: 'magic_find', v }, { s: 'item_quantity', v: 20 }, { s: 'luck_gain', v: 100 }] });

// ======================================================================
// セットの力（v は決まった数）
// ======================================================================
S({ id: 'set_ironblood_6', name: '鉄血の誓約（6）', cat: 'atk',
  desc: (v) => `範囲の近接スキルのダメージ ×${n(1 + v / 100)}。範囲の近接スキルを使うと（1 秒に 1 回）、周り（半径 240）に衝撃波（武器ダメージの 300%）。`,
  hooks: {
    modifySkill(c, d, p, v) { if (has(p, 'melee') && has(p, 'area')) p.dmgMul *= 1 + v / 100; },
    onCast(c, d, p) { if (has(p, 'melee') && has(p, 'area') && every(c, 'set_ironblood_6', 1)) { procNova(c, c.hero.x, c.hero.y, 240, 300, 'phys', 'ironblood', { big: true }); c.emit({ t: 'shake', power: 2 }); } },
  } });
S({ id: 'set_beastfang_4', name: '闘獣の牙（4）', cat: 'atk',
  desc: (v) => `リソースが 50 以上のとき、近接のダメージ ×${n(1 + v / 100)}。`,
  hooks: { onHit(c, hit, v) { if (has(hit.skill, 'melee') && (c.hero?.resource || 0) >= 50) mul(hit, v); } } });
S({ id: 'set_windcutter_6', name: '風切りの装束（6）', cat: 'atk',
  desc: (v) => `投射スキルのダメージ ×${n(1 + v / 100)}。投射物が当たると 15% の確率（0.5 秒に 1 回）で矢の雨（武器ダメージの 200%・半径 110）。`,
  hooks: {
    modifySkill(c, d, p, v) { if (has(p, 'projectile')) p.dmgMul *= 1 + v / 100; },
    onHit(c, hit) { if (has(hit.skill, 'projectile') && !has(hit.skill, 'proc') && c.rng.chance(0.15) && every(c, 'set_windcutter_6', 0.5)) blast(c, hit.target.x, hit.target.y, 110, 200, 'phys', 'windcutter', { delay: 0.3 }); },
  } });
S({ id: 'set_moonshadow_4', name: '月影の狩装（4）', cat: 'atk',
  desc: (v) => `投射物のクリティカルで、冷気の矢が 2 本 近くの敵へ跳ねる（武器ダメージの ${n(v)}%）。`,
  hooks: { onCrit(c, hit, v) { if (has(hit.skill, 'projectile') && every(c, 'set_moonshadow_4', 0.25)) procChain(c, hit.target, 2, v, 'cold', 'moonshadow'); } } });
S({ id: 'set_sevenstar_6', name: '七曜の法衣（6）', cat: 'atk',
  desc: (v) => `呪文のダメージ ×${n(1 + v / 100)}。呪文を使うと 25% の確率で、0.3 秒後にもう一度発動する。`,
  hooks: {
    modifySkill(c, d, p, v) { if (has(p, 'spell')) p.dmgMul *= 1 + v / 100; },
    onCast(c, d, p) { if (has(p, 'spell') && !p.basic && c.rng.chance(0.25)) queueEcho(c, 'set_sevenstar_6', p); },
    onTick(c) { runEcho(c, 'set_sevenstar_6'); },
  } });
S({ id: 'set_icebloom_4', name: '氷華の宝冠（4）', cat: 'atk',
  desc: (v) => `冷気のスキルのダメージ ×${n(1 + v / 100)}。`,
  hooks: { modifySkill(c, d, p, v) { if (p.element === 'cold') p.dmgMul *= 1 + v / 100; } } });
S({ id: 'set_bonebanner_6', name: '骸の軍旗（6）', cat: 'atk',
  desc: (v) => `召喚物のダメージ ×${n(1 + v / 100)}、召喚スキルで呼べる数 +2。`,
  hooks: { modifySkill(c, d, p, v) { if (p.behavior === 'summon' || has(p, 'minion')) { p.dmgMul *= 1 + v / 100; if (p.behavior === 'summon') p.maxSummons += 2; } } } });
S({ id: 'set_rotrite_4', name: '腐蝕の祭具（4）', cat: 'atk',
  desc: (v) => `毒のスキルのダメージ ×${n(1 + v / 100)}（毒の継続ダメージも同じだけ増える）。`,
  hooks: { modifySkill(c, d, p, v) { if (p.element === 'poison' || p.status?.id === 'poison') p.dmgMul *= 1 + v / 100; } } });
S({ id: 'set_duskveil_6', name: '宵闇の装束（6）', cat: 'atk',
  desc: (v) => `攻撃スキルのダメージ ×${n(1 + v / 100)}。クリティカルで（0.3 秒に 1 回）、影の刃が 3 本飛ぶ（武器ダメージの 150%）。`,
  hooks: {
    modifySkill(c, d, p, v) { if (has(p, 'attack')) p.dmgMul *= 1 + v / 100; },
    onCrit(c, hit) { if (!fromHero(c, hit) || !every(c, 'set_duskveil_6', 0.3)) return; for (const a of [-0.25, 0, 0.25]) shoot(c, null, 150, 'void', 'duskveil', { angle: a, pierce: 2, speed: 1200, range: 600 }); },
  } });
S({ id: 'set_poisonbloom_4', name: '毒華の刺客（4）', cat: 'atk',
  desc: (v) => `毒に侵された敵へのダメージ ×${n(1 + v / 100)}。`,
  hooks: { onHit(c, hit, v) { if (hit.target.statuses.poison?.stacks?.length) mul(hit, v); } } });
S({ id: 'set_eldorado_6', name: '黄金郷の遺品（6）', cat: 'util',
  desc: (v) => `すべてのダメージ ×${n(1 + v / 100)}。敵を倒すと 5% の確率で金貨の雨（その敵の 10 倍のゴールド）。`,
  mods: (v) => [{ s: 'more_dmg', v }],
  hooks: { onKill(c, u) { if (!c.rng.chance(0.05)) return; const g = BAL.monsterGold(u.level) * 10 * (1 + (c.H.gold || 0) / 100); c.game.addGold(g); c.emit({ t: 'gold', x: u.x, y: u.y, v: g }); } } });
S({ id: 'set_pilgrim_4', name: '巡礼者の守り（4）', cat: 'def',
  desc: (v) => `倒れるほどのダメージを受けたとき（120 秒に 1 回）、ライフ ${n(v)}% で踏みとどまる。`,
  hooks: { onDamaged(c, info, v) { cheatDeath(c, info, 'set_pilgrim_4', 120, v, '巡礼の加護'); } } });

// ======================================================================
// 深淵の宝石（v = 宝石のレベル。レベル 25 で 2 つ目の効果）
// ======================================================================
export const lgemVal = {
  ruin: (L) => 10 + 0.4 * L,
  bane: (L) => 15 + 0.6 * L,
  spite: (L) => 600 + 25 * L,
  storm: (L) => 300 + 15 * L,
  tide: (L) => Math.min(30, 8 + 0.25 * L),
  ember: (L) => 0.5 + 0.03 * L,
  greed: (L) => 20 + L,
  echo: (L) => 1 + 0.04 * L,
};
const lv25 = (L, t) => (L >= 25 ? `　◆Lv25: ${t}` : `　（Lv25 で: ${t}）`);
G({ id: 'lgp_ruin', name: '破滅の瞳', cat: 'atk',
  desc: (L) => `当てた敵は 5 秒間、受けるダメージ +${n(lgemVal.ruin(L))}%。${lv25(L, '当てた敵を冷却する')}`,
  hooks: { onHit(c, hit, L) { const t = hit.target; if (c.time < t._ruin) mul(hit, lgemVal.ruin(L)); if (fromHero(c, hit)) { t._ruin = c.time + 5; if (L >= 25) c.addStatus(t, 'chill', {}); } } } });
G({ id: 'lgp_bane', name: '強者殺しの石', cat: 'atk',
  desc: (L) => `エリートとボスへのダメージ +${n(lgemVal.bane(L))}%。${lv25(L, 'エリートとボスから受けるダメージ -15%')}`,
  hooks: {
    onHit(c, hit, L) { if (hit.target.rank !== 'normal' || hit.target.boss) mul(hit, lgemVal.bane(L)); },
    onDamaged(c, info, L) { if (L >= 25 && info.from && (info.from.rank !== 'normal' || info.from.boss)) info.amount *= 0.85; },
  } });
G({ id: 'lgp_spite', name: '怨嗟の棘', cat: 'atk',
  desc: (L) => `当てた敵に 10 秒の呪毒（10 秒で武器ダメージの ${n(lgemVal.spite(L))}%）。${lv25(L, '呪毒の敵へのダメージ +10%')}`,
  hooks: { onHit(c, hit, L) { const t = hit.target; if (!(c.time < t._spite)) { t._spite = c.time + 10; c.addStatus(t, 'poison', { dps: wdmg(c, 'poison', ['dot']) * lgemVal.spite(L) / 1000, dur: 10 }); } else if (L >= 25) mul(hit, 10); } } });
G({ id: 'lgp_storm', name: '迅雷の核', cat: 'atk',
  desc: (L) => `${L >= 25 ? 3 : 6} 秒ごとに、次のヒットで周り（半径 300）に雷が落ちる（武器ダメージの ${n(lgemVal.storm(L))}%）。${lv25(L, '間隔が 3 秒になる')}`,
  hooks: { onHit(c, hit, L) { if (fromHero(c, hit) && every(c, 'lgp_storm', L >= 25 ? 3 : 6)) procNova(c, hit.target.x, hit.target.y, 300, lgemVal.storm(L), 'lightning', 'lgstorm', { big: true }); } } });
G({ id: 'lgp_tide', name: '満ち潮の珠', cat: 'def',
  desc: (L) => `周りに敵が 3 体以上いるとき、受けるダメージ -${n(lgemVal.tide(L))}%（最大 30%）。${lv25(L, '最大ライフ +10%')}`,
  mods: (L) => (L >= 25 ? [{ s: 'inc_life', v: 10 }] : []),
  hooks: { onDamaged(c, info, L) { if (enemyCount(c).n >= 3) info.amount *= 1 - lgemVal.tide(L) / 100; } } });
G({ id: 'lgp_ember', name: '燠火の心', cat: 'def',
  desc: (L) => `ヒットで最大ライフの ${n(lgemVal.ember(L))}% を回復（0.5 秒に 1 回）。${lv25(L, 'ライフ 50% 以下でこの回復が 2 倍')}`,
  hooks: { onHit(c, hit, L) { if (!every(c, 'lgp_ember', 0.5)) return; const k = L >= 25 && lifeRatio(c.hero) <= 0.5 ? 2 : 1; heal(c, lifePct(c, lgemVal.ember(L) * k)); } } });
G({ id: 'lgp_greed', name: '強欲の金貨', cat: 'util',
  desc: (L) => `ゴールド獲得 +${n(lgemVal.greed(L))}%。${lv25(L, 'レア発見率 +25%')}`,
  mods: (L) => [{ s: 'gold_find', v: lgemVal.greed(L) }, ...(L >= 25 ? [{ s: 'magic_find', v: 25 }] : [])] });
G({ id: 'lgp_echo', name: '重なる残響', cat: 'atk',
  desc: (L) => `スキルを使うたび、5 秒間ダメージ +${n(lgemVal.echo(L))}%（最大 ${L >= 25 ? 15 : 10} 回）。${lv25(L, '最大 15 回まで重なる')}`,
  hooks: {
    onCast(c, d, p, L) { const m = mem(c, 'lgp_echo'); if (!(c.time < m.t)) m.n = 0; m.n = Math.min(L >= 25 ? 15 : 10, (m.n || 0) + 1); m.t = c.time + 5; },
    onHit(c, hit, L) { const m = mem(c, 'lgp_echo'); if (m.n && c.time < m.t) mul(hit, lgemVal.echo(L) * m.n); },
  } });
