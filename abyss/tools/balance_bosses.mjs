// ボスごとの手強さの計測（強さ担当）。その地域のレベルの「ふつうの装備」の主人公を作って、各ボスと何度も戦わせる。
// 特技あり・特技なし（同じボス）で倒すまでの時間を比べ、特技の「重さ」（実質のライフの倍率）と勝率を出す。
//
// 使い方（abyss/ の中で）:
//   node tools/balance_bosses.mjs                       … 剣闘士・魔導士で全 50 地域、各 4 回
//   node tools/balance_bosses.mjs --classes=ranger --zones=a5z3,a7z4 --n=8 --lvl=-3
//   --lvl=N … 主人公のレベル = 地域のレベル + N（既定 -4）。--rarity=rare（装備のレアリティ）

import { Game } from '../src/game/game.js';
import { ZONES, STAGES_PER_ZONE } from '../src/data/world.js';
import { MONSTER } from '../src/data/monsters.js';
import { SLOTS } from '../src/data/items.js';
import { generateItem } from '../src/game/loot.js';
import { BAL } from '../src/data/balance.js';
import { greedyTree } from './balance_lib.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const classes = arg('classes', 'warrior,sorcerer').split(',');
const zoneIds = arg('zones', '').split(',').filter(Boolean);
const N = Number(arg('n', 4));
const LVL = Number(arg('lvl', -4));
const RAR = arg('rarity', 'rare');

/** 地域 z 用の主人公を作る */
export function makeHero(cls, z, { lvlOff = LVL, rarity = RAR, seed = 11 } = {}) {
  const g = new Game({ seed });
  g.newGame(cls, 'boss');
  const st = g.state;
  const lvl = Math.max(1, Math.min(100, z.level + lvlOff));
  for (let i = 0; i < 200 && st.hero.level < lvl; i++) g.addXp(BAL.xpToNext(st.hero.level) - st.hero.xp + 1, { quiet: true });
  g.sys.skills.learnUnlocked(true);
  g.sys.skills.autoSpend();
  greedyTree(g, 3);
  for (const slot of SLOTS) {
    const it = generateItem(g.rng, { ilvl: z.level, rarity, slot: slot.startsWith('ring') ? 'ring' : slot, cls, anyReq: true });
    if (it) { it.isNew = false; st.hero.equip[slot] = it; }
  }
  // 両手武器なら副手を外す
  g.onGearChanged();
  const w = st.world;
  for (const zz of ZONES) { w.cleared[zz.id] = true; w.maxStage[zz.id] = STAGES_PER_ZONE; }
  w.maxZone = ZONES.length - 1;
  st.meta.unlocks.autoBoss = false;
  return g;
}

/** 1 回戦う。{ win, t, dealt } */
export function fight(g, z, { noAbilities = false } = {}) {
  const def = MONSTER[z.boss];
  const keep = def.abilities; const keepPh = def.phases;
  if (noAbilities) { def.abilities = []; def.phases = undefined; }
  try {
    const ws = g.sys.world;
    ws.travel(z.id, STAGES_PER_ZONE - 1);
    g.combat.reviveHero?.();
    g.combat.recalc();
    if (g.combat.hero) g.combat.hero.life = g.combat.hero.maxLife;
    ws.challengeBoss();
    let res = null;
    const offK = g.events.on('zoneClear', () => { res ||= { win: true }; });
    const offF = g.events.on('bossFail', (e) => { res ||= { win: false, reason: e.reason }; });
    let t = 0; let boss = null;
    for (let i = 0; i < 20 * 400 && !res; i++) { g.tick(0.05); t += 0.05; boss ||= ws.bossUnit; }
    offK?.(); offF?.();
    const dealt = boss ? Math.max(0, boss.maxLife - Math.max(0, boss.life)) / boss.maxLife : 0;
    return { win: !!res?.win, t, dealt: res?.win ? 1 : dealt, reason: res?.reason };
  } finally { def.abilities = keep; def.phases = keepPh; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const zones = zoneIds.length ? ZONES.filter((z) => zoneIds.includes(z.id)) : ZONES;
  console.log(`ボスの手強さ（主人公 Lv = 地域 Lv ${LVL >= 0 ? '+' : ''}${LVL}・装備 ${RAR}・各 ${N} 回）`);
  console.log('地域   ボス                    特技                         ' + classes.map((c) => `${c.padEnd(10)}勝率 重さ`).join('  '));
  const tot = {};
  for (const z of zones) {
    const def = MONSTER[z.boss];
    const parts = [];
    for (const cls of classes) {
      let win = 0; let tA = 0; let tB = 0; let dA = 0; let dB = 0;
      for (let k = 0; k < N; k++) {
        const g1 = makeHero(cls, z, { seed: 100 + k });
        const a = fight(g1, z);
        const g2 = makeHero(cls, z, { seed: 100 + k });
        const b = fight(g2, z, { noAbilities: true });
        if (a.win) win++;
        // 1 秒あたりに削った割合（勝てなかった回も含める）
        dA += a.dealt / a.t; dB += b.dealt / b.t;
        tA += a.t; tB += b.t;
      }
      const heavy = dA > 0 ? dB / dA : 9;
      (tot[cls] ||= []).push({ z: z.id, heavy, win: win / N });
      parts.push(`${String(Math.round((win / N) * 100)).padStart(3)}% ×${heavy.toFixed(2)}`.padEnd(20));
    }
    console.log(`${z.id.padEnd(6)} ${(def?.name || z.boss).padEnd(12, '　')} ${(def?.abilities || []).join(',').padEnd(28)} ${parts.join('  ')}`);
  }
}
