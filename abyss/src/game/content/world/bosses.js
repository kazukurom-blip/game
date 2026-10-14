// ボスの受け身の仕掛け: 激昂（ライフ 30%）・障壁（60% と 25%）・呪いの柱の守り・段階の変化（深淵王など def.phases）。
// それと「1 体に与えられる火力」の測定（倒した敵の最大ライフ ÷ 初めて当ててから倒すまでの秒数）。HUD の「必要 DPS の目安」に使う。
// 見た目の出来事: { t: 'enrage', unit } / { t: 'shieldUp', unit } / { t: 'shieldBreak', unit } / { t: 'bossPhase', unit, phase, text }

import { unitHooks, monsterAbilities } from '../../combat.js';
import { BOSS_ABILITIES as A } from '../../../data/monsters.js';
import { say, spawnAdds } from './util.js';

const has = (u, id) => u.def?.abilities?.includes(id) || u.phaseAbilities?.includes(id);

unitHooks.onMonsterTick.push((c, u) => {
  if (!u.boss || u.dead || u.isClone) return;
  const ratio = u.life / u.maxLife;
  // 段階の変化
  const ph = u.def.phases;
  if (ph && (u.phase || 0) < ph.length && ratio <= ph[u.phase || 0].at) {
    const p = ph[u.phase || 0];
    u.phase = (u.phase || 0) + 1;
    u.phaseAbilities = p.abilities.slice();
    u.abilityT = {};
    for (const ab of p.abilities) u.abilityT[ab] = (monsterAbilities[ab]?.cd || 6) * c.rng.range(0.3, 0.6) + 2.5;
    u._invT = c.time + 2.5; // 姿を変える間はほとんど効かない
    u.dmg *= 1.15;
    spawnAdds(c, u, 3, u.def.summons, { max: 6, spread: 200 });
    c.emit({ t: 'bossPhase', unit: u, phase: u.phase, text: p.text });
    c.emit({ t: 'shake', power: 12 });
    const ws = c.game.sys.world;
    ws.banner = { text: p.text, t: 3, boss: true };
    if (ws.bossUnit === u) ws.bossTimer += 20; // 変化の分だけ時間を足す
  }
  // 激昂
  if (!u._enraged && has(u, 'enrage') && ratio <= A.enrage.at) {
    u._enraged = true;
    u.dmg *= 1.5; u.atkCd /= 1.4; u.speed *= 1.3;
    say(c, u, '激昂！', '#ff5040');
    c.emit({ t: 'enrage', unit: u });
    c.emit({ t: 'shake', power: 6 });
  }
  // 障壁
  if (has(u, 'shield')) {
    const at = A.shield.at;
    const i = u._shieldStep || 0;
    if (i < at.length && ratio <= at[i]) {
      u._shieldStep = i + 1;
      u.shieldHp = u.maxLife * A.shield.pct;
      u.shieldEnd = c.time + A.shield.dur;
      say(c, u, '障壁', '#a0d0ff');
      c.emit({ t: 'shieldUp', unit: u });
    }
    if (u.shieldHp > 0 && c.time >= u.shieldEnd) { u.shieldHp = 0; c.emit({ t: 'shieldBreak', unit: u, expired: true }); }
  }
});

unitHooks.onMonsterHit.push((c, u, hit) => {
  if (!u._fh) u._fh = c.time; // 初めて当たった時刻（火力の測定）
  if (!u.boss && !u._totems) return;
  if (u._invT && c.time < u._invT) { hit.dmg *= 0.05; return; }
  if (u._totems && u._totems.some((t) => !t.dead)) hit.dmg *= 0.6;
  if (u.shieldHp > 0) {
    let d = hit.dmg * 0.5;
    const ab = Math.min(d, u.shieldHp);
    u.shieldHp -= ab; d -= ab;
    hit.dmg = d;
    if (u.shieldHp <= 0) { say(c, u, '障壁が砕けた', '#ffffff'); c.emit({ t: 'shieldBreak', unit: u }); }
  }
});

// 火力の測定（ボス以外。呼び出された手下・柱は数えない）
unitHooks.onMonsterDeath.push((c, u) => {
  if (u.boss || u.isAdd || !u._fh || u._selfKill || u.def?.kind === 'goblin') return;
  const ws = c.game.sys.world;
  ws.noteKill?.(u.maxLife, Math.max(0.5, c.time - u._fh));
});
