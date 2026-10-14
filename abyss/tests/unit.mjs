// データの整合と計算の確かめ（Node だけで動く）。実行: node tests/unit.mjs
import { Game } from '../src/game/game.js';
import { RNG } from '../src/engine/rng.js';
import { fmt, setNumberMode } from '../src/engine/format.js';
import { generateItem } from '../src/game/loot.js';
import { itemMods } from '../src/game/items.js';
import { BASES, AFFIXES } from '../src/data/items.js';
import { SKILLS } from '../src/data/skills.js';
import { CLASSES } from '../src/data/classes.js';
import { MONSTER } from '../src/data/monsters.js';
import { ZONES } from '../src/data/world.js';
import { statDef } from '../src/data/stats.js';
import { computeHero } from '../src/game/character.js';
import { migrate } from '../src/game/state.js';

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };

t('数字の表記', () => { setNumberMode('jp'); eq(fmt(12345).slice(0, 4) + fmt(12345).slice(-1), '1.23万'); eq(fmt(123456789), '1.235億'); eq(fmt(999), '999'); setNumberMode('en'); eq(fmt(1234567), '1.235M'); setNumberMode('jp'); });
t('乱数は再現できる', () => { const a = new RNG(5); const b = new RNG(5); for (let i = 0; i < 100; i++) eq(a.next(), b.next()); });
t('すべてのスキルのクラスがある', () => SKILLS.every((s) => CLASSES.some((c) => c.id === s.cls)));
t('クラスの開始スキルがある', () => CLASSES.every((c) => c.startSkills.every((id) => SKILLS.some((s) => s.id === id))));
t('地域の敵とボスがいる', () => { for (const z of ZONES) { for (const m of z.monsters) if (!MONSTER[m]) throw new Error(`${z.id}: ${m}`); if (!MONSTER[z.boss]) throw new Error(`${z.id} boss ${z.boss}`); } });
t('オプションの能力は定義済み', () => { for (const a of AFFIXES) if (statDef(a.s).unknown) throw new Error(a.s); });
t('ベースの固有効果の能力は定義済み', () => { for (const b of BASES) for (const m of b.implicit || []) if (statDef(m.s).unknown) throw new Error(`${b.id} ${m.s}`); });
t('アイテムを 5000 個作っても壊れない', () => {
  const rng = new RNG(1);
  for (let i = 0; i < 5000; i++) {
    const it = generateItem(rng, { ilvl: 1 + (i % 120), cls: CLASSES[i % 5].id, mf: i % 300 });
    if (!it) throw new Error('null');
    for (const m of itemMods(it)) if (!Number.isFinite(m.v)) throw new Error(`NaN ${m.s} ${it.base}`);
  }
});
t('能力の計算に NaN が無い', () => {
  for (const c of CLASSES) {
    const g = new Game({ seed: 3 }); g.newGame(c.id, 'x');
    const H = computeHero(g.state, g);
    for (const [k, v] of Object.entries(H)) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${c.id} ${k}`);
  }
});
t('セーブして読み直せる', () => {
  const g = new Game({ seed: 9 }); g.newGame('ranger', 'x');
  for (let i = 0; i < 2000; i++) g.tick(0.05);
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 9 }); g2.load(JSON.parse(json));
  eq(g2.state.hero.level, g.state.hero.level);
  eq(g2.state.inv.bag.length, g.state.inv.bag.length);
});
t('古いセーブに足りない項目が埋まる', () => { const st = migrate({ hero: { cls: 'warrior', level: 3, equip: {}, skills: {}, bar: [] }, inv: { bag: [] } }); return !!st.meta && !!st.settings && !!st.world; });

console.log(`\nunit: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
