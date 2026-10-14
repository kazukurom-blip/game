// アイテムの QA（第 3 弾）: 見つけた不具合が戻っていないかの確かめ。
// 前半は Node だけ（数・仕組み）、後半は Chromium（説明の窓・図鑑の表示）。
// 実行: PORT=8302 node tests/qa_items.mjs   （--only=node,ui のように一部だけ）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/game/game.js';
import { RNG } from '../src/engine/rng.js';
import { generateItem, rollRarity } from '../src/game/loot.js';
import * as LOOT from '../src/game/loot.js';
import { itemMods, weaponStats, offhandDamage } from '../src/game/items.js';
import { aggregate } from '../src/data/stats.js';
import { BAL } from '../src/data/balance.js';
import { gemCombineGold, runeCombineGold } from '../src/data/gems.js';
import { MATERIALS } from '../src/data/materials.js';
import { LUCK, offlineHook } from '../src/game/content/items/rewards.js';
import * as ITEMLIB from '../src/game/content/items/itemlib.js';
import * as ITEMS from '../src/game/items.js';
import { registry } from '../src/game/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8302;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; console.log(`✔ ${name}`); } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
async function ta(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; console.log(`✔ ${name}`); } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'false'); };
const near = (a, b, rel, m = '') => { if (!(Math.abs(a - b) <= Math.abs(b) * rel)) throw new Error(`${m} ${a} ≉ ${b}`); };

function newGame(cls = 'warrior', seed = 11) { const g = new Game({ seed }); g.newGame(cls, 'QA'); return g; }
function richGame(cls = 'warrior', L = 60) {
  const g = newGame(cls, 5);
  g.state.hero.level = L; g.combat.recalc();
  g.state.meta.gold = 1e13;
  for (const m of MATERIALS) g.state.inv.mats[m.id] = 100000;
  return g;
}
const give = (g, it) => { g.state.inv.bag.push(it); return it; };
/** 条件に合うアイテムができるまで作る */
function make(rng, opts, pred, tries = 40000) {
  for (let i = 0; i < tries; i++) { const it = generateItem(rng, opts); if (it && pred(it)) return it; }
  throw new Error(`作れない ${JSON.stringify(opts)}`);
}

if (want('node')) {
  // ---------------- QA-I01 宝石・ルーンの合成の費用が NUM（×10）に合っていない
  t('I01 宝石・ルーンの合成の費用はゴールドの桁（NUM）に合っている', () => {
    // 以前（NUM=1）の設計: 1→2 段の合成 104 G ≒ Lv1 の敵 70 体ぶんのゴールド。×10 の後も同じ手応え
    const kills = (gold) => gold / BAL.monsterGold(1);
    ok(kills(gemCombineGold(1)) >= 60, `宝石 1→2: ${gemCombineGold(1)} G = ${kills(gemCombineGold(1)).toFixed(1)} 体ぶん`);
    ok(kills(runeCombineGold(1)) >= 50, `ルーン 1→2: ${runeCombineGold(1)} G = ${kills(runeCombineGold(1)).toFixed(1)} 体ぶん`);
    const g = richGame();
    const gold0 = g.state.meta.gold;
    g.state.inv.gems = { ember_1: 3 };
    const r = g.sys.gems.combineGem('ember', 1);
    ok(r.ok && r.cost === gemCombineGold(1) && gold0 - g.state.meta.gold === r.cost, '払った額 = 表示');
  });

  // ---------------- QA-I02 図鑑の落とし物の表がアイテム Lv の伸び（legendaryBoost など）を入れていない
  t('I02 図鑑の落とし物の確率 = 実際に振ったときの確率（アイテム Lv・ミシック込み）', () => {
    const g = newGame();
    ok(typeof LOOT.rarityOdds === 'function', 'loot.js が rarityOdds を出す');
    const rng = new RNG(5);
    for (const [ilvl, mf, rank] of [[1, 0, 'normal'], [60, 40, 'normal'], [100, 0, 'champion'], [100, 250, 'boss']]) {
      const odds = g.sys.bestiary.rarityOdds({ mf, rank, torment: 0, ilvl });
      const N = 200000; const c = {};
      for (let i = 0; i < N; i++) { const r = rollRarity(rng, { mf, rank, ilvl }); c[r] = (c[r] || 0) + 1; }
      for (const r of ['rare', 'epic', 'legendary']) near(odds[r], (c[r] || 0) / N, 0.08, `ilvl ${ilvl} mf ${mf} ${rank} ${r}`);
      const sum = Object.values(odds).reduce((s, v) => s + v, 0);
      near(sum, 1, 1e-9, '合計 100%');
    }
  });

  // ---------------- QA-I03 覚醒・極致の武器で「武器ダメージ %」のオプションだけ品質の倍率が効いていない
  t('I03 覚醒の武器: 武器ダメージ % のオプションにも ×1.3（説明の数 = 実際）', () => {
    const rng = new RNG(9);
    const it = make(rng, { ilvl: 60, rarity: 'legendary', slot: 'weapon', cls: 'warrior' }, (x) => x.affixes.some((a) => a.s === 'weapon_dmg') && !x.fixed);
    const a = it.affixes.find((x) => x.s === 'weapon_dmg');
    it.q = 0; const w0 = weaponStats(it).min;
    it.q = 1; const w1 = weaponStats(it).min;
    const expect = 1.3 * (1 + (a.v * 1.3) / 100) / (1 + a.v / 100);
    near(w1 / w0, expect, 1e-6, `比 ${(w1 / w0).toFixed(4)}`);
  });

  // ---------------- QA-I04 副刀（二刀流）のダメージに品質の倍率が無い
  t('I04 副刀のダメージにも覚醒の倍率', () => {
    const rng = new RNG(3);
    const it = make(rng, { ilvl: 50, rarity: 'legendary', slot: 'offhand', cls: 'assassin' }, (x) => x.base.startsWith('offblade'));
    it.q = 0; const d0 = offhandDamage(it);
    it.q = 1; const d1 = offhandDamage(it);
    near(d1 / d0, 1.3, 1e-9);
  });

  // ---------------- QA-I05 指輪の比べ: 両方の指輪があると左（ring1）とだけ比べ、右の方が弱くても「強くならない」と出る
  t('I05 指輪の比べ: 弱い方の指輪と比べる（自動の装備・▲の印・説明の窓）', () => {
    const g = newGame('warrior', 3);
    g.state.hero.level = 60; g.combat.recalc();
    const rng = new RNG(9);
    const mk = (fn) => make(rng, { ilvl: 60, rarity: 'rare', slot: 'ring', cls: 'warrior' }, fn);
    const OFF = ['add_phys', 'add_fire', 'add_cold', 'add_lightning', 'inc_dmg', 'crit_chance', 'crit_damage', 'attack_speed', 'life', 'res_all', 'str', 'vit', 'life_on_hit'];
    const strong = mk((r) => r.affixes.some((x) => x.s === 'add_phys') && r.affixes.some((x) => x.s === 'inc_dmg'));
    const weak = mk((r) => !r.affixes.some((x) => OFF.includes(x.s)));
    const cand = mk((r) => r.affixes.some((x) => x.s === 'add_phys') && !r.affixes.some((x) => x.s === 'inc_dmg'));
    g.state.hero.equip.ring1 = strong; g.state.hero.equip.ring2 = weak; g.onGearChanged();
    const inv = g.sys.inv;
    const c2 = inv.compare(cand, 'ring2');
    ok(c2.dpsPct > 5, `右と比べると強い ${c2.dpsPct.toFixed(1)}`);
    const c = inv.compare(cand);
    ok(c.slot === 'ring2', `比べる枠 ${c.slot}`);
    ok(Math.abs(c.dpsPct - c2.dpsPct) < 1e-9, '弱い方との差');
    ok(inv.isUpgrade(cand), 'isUpgrade');
    g.state.inv.filter.autoEquip = true;
    eq3(inv.receive(cand), 'equipped');
    ok(g.state.hero.equip.ring2 === cand && g.state.hero.equip.ring1 === strong, '弱い方を入れ替える');
  });
  function eq3(a, b) { if (a !== b) throw new Error(`${a} !== ${b}`); }

  // ---------------- QA-I06 説明の窓のオプションの数に強化のボーナスが入っていない（実際より小さく見える）
  t('I06 説明に出すオプションの数 = 実際に効く数（品質・強化 +15）', () => {
    ok(typeof ITEMLIB.shownValue === 'function', 'itemlib.shownValue');
    const rng = new RNG(21);
    const it = make(rng, { ilvl: 70, rarity: 'legendary', slot: 'chest' }, (x) => x.affixes.length >= 3);
    it.q = 1; it.enh = 15;
    const S = aggregate(itemMods(it));
    const shown = {};
    for (const a of it.affixes) shown[a.s] = (shown[a.s] || 0) + ITEMLIB.shownValue(it, a.v);
    for (const s of Object.keys(shown)) {
      // 同じ能力が固有効果・アーマー・力からも来るものは除く
      const others = aggregate(itemMods({ ...it, affixes: it.affixes.filter((a) => a.s !== s) }))[s] || 0;
      near(shown[s], (S[s] || 0) - others, 1e-6, s);
    }
  });

  t('I06b どのアイテムでも、説明に出す行の合計 = 実際に効く数（2000 個・宝石・ルーン・ルーン語・堕落・品質・強化）', () => {
    const g = richGame('sorcerer', 80);
    const rng = new RNG(77);
    const RAR = ['common', 'magic', 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'];
    const keys = ['ember_4', 'frost_7', 'star_10', 'blood_2', 'abyss_5', 'r:tetsu', 'r:hai', 'r:owari', 'r:kiri'];
    for (let i = 0; i < 2000; i++) {
      const it = generateItem(rng, { ilvl: 1 + (i % 110), rarity: RAR[i % RAR.length], cls: 'sorcerer', anyReq: true });
      if (!it) continue;
      it.q = i % 7 === 0 ? 2 : i % 5 === 0 ? 1 : it.q;
      it.enh = i % 21;
      if (it.sockets?.length) it.sockets = it.sockets.map((_, k) => keys[(i + k) % keys.length]);
      if (i % 13 === 0) it.cimp = { s: 'res_all', v: 10 };
      // 説明の窓に出る行（tooltip.js・itemkit.js と同じ材料）
      const lines = [...ITEMLIB.socketModsOf(it), ...(it.rw ? ITEMLIB.runewordMods(it) : []), ...(it.cimp ? [it.cimp] : [])];
      for (const a of it.affixes) lines.push({ s: a.s, v: ITEMLIB.shownValue(it, a.v) });
      for (const f of it.fixed || []) lines.push({ s: f.s, v: ITEMLIB.shownValue(it, f.v) });
      const shown = aggregate(lines.filter((m) => !(it.slot === 'weapon' && m.s === 'weapon_dmg')));
      // 実際: itemMods から固有効果・アーマー・力の数値を引いた物
      const real = aggregate(itemMods(it));
      const minus = aggregate([...implicitOf(it), ...armorOf(it), ...powerOf(it)]);
      for (const s of new Set([...Object.keys(shown), ...Object.keys(real)])) {
        if (s === 'dr' || s === 'more_dmg') continue; // 掛け算の能力は足し引きできない
        const want = (real[s] || 0) - (minus[s] || 0);
        if (Math.abs((shown[s] || 0) - want) > 1e-6 * Math.max(1, Math.abs(want))) throw new Error(`${it.rarity} ${it.base} ${s}: 説明 ${shown[s] || 0} / 実際 ${want}`);
      }
    }
  });
  function implicitOf(it) { return ITEMS.implicitMods(it); }
  function armorOf(it) { const a = ITEMS.itemArmor(it); return a ? [{ s: 'armor', v: a }] : []; }
  function powerOf(it) { return registry.powerMods(it); }

  // ---------------- QA-I07 ルーン語の装備の力を極意に抽出できた（説明では「レジェンダリーだけ」）
  t('I07 ルーン語の装備は極意に抽出できない', () => {
    const g = richGame('warrior', 30);
    g.state.inv.runes = { rin: 1, hai: 1 };
    const w = give(g, generateItem(g.rng, { ilvl: 20, rarity: 'common', slot: 'weapon', cls: 'warrior', noSockets: true }));
    w.sockets = [null, null];
    g.sys.gems.socket(w.uid, 0, 'r:rin'); g.sys.gems.socket(w.uid, 1, 'r:hai');
    ok(w.rw === 'rw_kindle' && w.power, 'ルーン語ができる');
    const info = g.sys.codex.extractInfo(w);
    ok(!info.ok, `抽出できてしまう ${info.msg || ''}`);
    ok(!g.sys.codex.extract(w.uid).ok && g.sys.inv.findItem(w.uid), '消えない');
  });

  // ---------------- QA-I08 素材の発見の端数の扱いで、分解の素材が多く出すぎる
  t('I08 分解の素材の数: 素材獲得 +50% でちょうど 1.5 倍（平均）', () => {
    const g = newGame();
    g.combat.H = { ...g.combat.H, matFind: 50 };
    let n = 0; const N = 40000;
    const it = { rarity: 'common', slot: 'helm', q: 0, sockets: [] };
    for (let i = 0; i < N; i++) n += g.sys.inv.salvageYield(it).scrap || 0;
    near(n / N, 1.5 * 1.5, 0.03, '鉄屑の平均（1〜2 → ×1.5）');
  });

  // ---------------- QA-I09 商人の目利きで選んだ部位と違う部位のユニークが出る
  t('I09 目利き: 選んだ部位の物だけが出る（ユニーク・セット・ミシック）', () => {
    const rng = new RNG(4);
    for (const [cls, ilvl, slot] of [['warrior', 10, 'helm'], ['ranger', 20, 'offhand'], ['sorcerer', 12, 'chest'], ['assassin', 9, 'amulet'], ['necromancer', 30, 'gloves']]) {
      for (const rarity of ['unique', 'set', 'mythic']) {
        for (let i = 0; i < 60; i++) {
          const it = generateItem(rng, { ilvl, rarity, slot, cls, anyReq: true, source: 'gamble' });
          ok(it && it.slot === slot, `${cls} ${slot} ${rarity} → ${it?.slot} (${it?.uniqueId || it?.rarity})`);
        }
      }
    }
    const g = richGame('ranger', 20);
    g.state.inv.mats.shard = 1e6; g.state.inv.bagSize = 2000;
    for (let i = 0; i < 300; i++) { const r = g.sys.merchant.gamble('offhand'); ok(r.ok && r.item.slot === 'offhand', `gamble ${r.item?.slot}`); }
  });

  // ---------------- QA-I10 バッグが満杯だと、残すはずのレジェンダリー以上がその場で分解される（倉庫に空きがあっても）
  t('I10 バッグが満杯: レジェンダリー以上は倉庫の空きへ（分解しない）', () => {
    const g = newGame('warrior');
    const rng = new RNG(8);
    g.state.inv.bagSize = 10;
    for (let i = 0; i < 10; i++) { const x = generateItem(rng, { ilvl: 20, rarity: 'legendary' }); x.locked = true; g.state.inv.bag.push(x); }
    const myth = generateItem(rng, { ilvl: 60, rarity: 'mythic', anyReq: true });
    const where = g.sys.inv.receive(myth);
    ok(where === 'stash', `行き先 ${where}`);
    ok(g.state.inv.stash[0].includes(myth), '倉庫にある');
    // 倉庫も満杯なら今まで通り分解（増え続けない）
    g.state.inv.stashTabSize = g.state.inv.stash[0].length;
    const leg = generateItem(rng, { ilvl: 20, rarity: 'legendary' });
    ok(g.sys.inv.receive(leg) === 'salvaged', '倉庫も満杯なら分解');
  });

  // ---------------- QA-I11 オフラインの幸運ゲージ: レジェンダリーが出たのに、上昇の倍率で天井を超えて確定ドロップ
  t('I11 オフライン: レジェンダリーが出ていれば、ゲージの戻し先は天井より下', () => {
    const g = newGame('warrior');
    g.combat.H = { ...g.combat.H, S: { ...g.combat.H.S, luck_gain: 150 } };
    g.sys.offline.rates = () => ({ drops: 1, level: 10 });
    const l = g.state.inv.luck;
    let forced = 0;
    for (let i = 0; i < 200; i++) {
      l.leg = 0; l.forcedLeg = 0;
      const rep = { capped: 3000, eff: 1, found: { legendary: 1 }, kills: 0, kept: [] };
      offlineHook(g, rep);
      forced += l.forcedLeg;
      ok(l.leg < LUCK.leg.max, `leg ${l.leg}`);
    }
    ok(forced === 0, `確定ドロップ ${forced} 回`);
  });

  // ---------------- QA-I12 深淵の宝石のつながり: 読み込みで uid が振り直されると、別の装備にレベルが写る
  t('I12 深淵の宝石: 読み込み直しで、はまっている装備とつながり直す', () => {
    const g = newGame('assassin');
    g.sys.gems.grantLegendaryGem('ruin');
    const ring = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'ring', noSockets: true })); ring.sockets = [null];
    ok(g.sys.gems.socket(ring.uid, 0, 'lg:ruin').ok);
    const other = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'amulet', noSockets: true }));
    const raw = JSON.parse(JSON.stringify(g.snapshot()));
    // 壊れたセーブ: 宝石の入った指輪と別の装備の uid が同じ（指輪の方が後ろなので振り直される）
    const bag = raw.inv.bag;
    const ri = bag.findIndex((x) => x.uid === ring.uid); const oi = bag.findIndex((x) => x.uid === other.uid);
    bag[ri].uid = other.uid; [bag[ri], bag[oi]] = [bag[oi], bag[ri]];
    const g2 = new Game({ seed: 2 }); g2.load(raw);
    const holder = g2.state.inv.bag.find((x) => x.sockets?.includes('lg:ruin'));
    ok(holder, 'はまっている装備');
    ok(g2.state.inv.lgems.ruin.uid === holder.uid, `つながり ${g2.state.inv.lgems.ruin.uid} / ${holder.uid}`);
    g2.sys.gems.onRiftComplete(40, 0.9);
    ok(holder.lgl.ruin === g2.state.inv.lgems.ruin.lvl, 'レベルが写る');
    ok(!g2.state.inv.bag.some((x) => x !== holder && x.lgl?.ruin), 'ほかの装備に写らない');
  });

  // ---------------- QA-I14 武器のソケットの鉄・淵のルーン（武器ダメージ %）が何にも効いていない
  t('I14 武器にはめた鉄・淵のルーンの「武器ダメージ %」が武器のダメージに効く', () => {
    const g = richGame('warrior', 60);
    const w = give(g, generateItem(g.rng, { ilvl: 60, rarity: 'rare', slot: 'weapon', cls: 'warrior', noSockets: true }));
    w.sockets = [null, null];
    const w0 = weaponStats(w).min;
    g.state.inv.runes = { tetsu: 1, fuchi: 1 };
    ok(g.sys.gems.socket(w.uid, 0, 'r:tetsu').ok && g.sys.gems.socket(w.uid, 1, 'r:fuchi').ok, 'はめる');
    let local = 0; for (const a of w.affixes) if (a.s === 'weapon_dmg') local += a.v;
    near(weaponStats(w).min / w0, (1 + (local + 15 + 30) / 100) / (1 + local / 100), 1e-9, '鉄 +15%・淵 +30%');
    ok(!itemMods(w).some((m) => m.s === 'weapon_dmg'), '武器の外（効かない能力）には出さない');
  });

  // ---------------- QA-I15 祝福で極致（全部最大）が下がる・付け替えの候補が残ったまま段上げ・祝福ができる
  t('I15 鍛冶: 極致は祝福しない・付け替えの候補があるときは段上げ・祝福しない', () => {
    const g = richGame('warrior', 70);
    const rng = new RNG(31);
    const p = give(g, make(rng, { ilvl: 70, rarity: 'legendary', slot: 'chest', primalChance: 1 }, (x) => x.q === 2 && x.affixes.length >= 3));
    const info = g.sys.crafting.blessInfo(p);
    ok(!info.ok && /極致/.test(info.msg), `祝福できてしまう ${info.msg || ''}`);
    const before = JSON.stringify(p.affixes);
    ok(!g.sys.crafting.bless(p.uid).ok && JSON.stringify(p.affixes) === before, '数値が変わらない');
    const r = give(g, make(rng, { ilvl: 70, rarity: 'rare', slot: 'chest' }, (x) => x.affixes.length >= 3 && x.affixes.some((a) => AFFIX_TOP(a, 70))));
    ok(g.sys.crafting.rerollRoll(r.uid, 0).ok, '候補を出す');
    ok(!g.sys.crafting.blessInfo(r).ok, '候補があるのに祝福できる');
    ok(!g.sys.crafting.tierUpInfo(r, 0).ok, '候補があるのに段上げできる');
    ok(g.sys.crafting.rerollChoose(r.uid, 2).ok && g.sys.crafting.blessInfo(r).ok, '選んだ後はできる');
  });
  function AFFIX_TOP(a, ilvl) { return a.t < ITEMLIB.topTier(ITEMLIB.AFFIX[a.id], ilvl); }

  // ---------------- QA-I16 堕落: オプションの無い装備で「1 行が上限を超える」などが出ても、何も変わらないのに成功のように言う
  t('I16 堕落: 対象が無い結果は「変化なし」と言う', () => {
    const g = richGame('warrior', 30);
    let said = 0;
    for (let i = 0; i < 40; i++) {
      const w = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'common', slot: 'helm', noSockets: true }));
      const r = g.sys.crafting.corrupt(w.uid);
      ok(r.ok, r.msg);
      if (r.outcome === 2 || r.outcome === 3) { ok(/変化なし/.test(r.outcomeText), r.outcomeText); said++; }
    }
    ok(said > 0, '2・3 の結果が出ない');
  });

  // ---------------- QA-I13 比べの火力が「基本攻撃だけ」で、召喚・呪文のビルドで装備の良し悪しが出ない
  t('I13 比べの火力はスキルの並び全体（召喚物のダメージ % で死霊術師の火力が上がる）', () => {
    const g = newGame('necromancer', 3);
    for (let i = 0; i < 20 * 60 * 20; i++) g.tick(0.05);
    ok(g.state.hero.bar.includes('n_skeleton'), `bar ${g.state.hero.bar}`);
    const rng = new RNG(2);
    const base = make(rng, { ilvl: g.state.hero.level, rarity: 'magic', slot: 'offhand', cls: 'necromancer' }, (x) => x.base.startsWith('grimoire') && x.affixes.length === 1 && x.affixes[0].s === 'life');
    const minion = JSON.parse(JSON.stringify(base)); minion.uid = base.uid + 100000;
    minion.affixes = [{ id: 'inc_minion', s: 'inc_minion', t: 3, v: 60 }];
    g.state.hero.equip.offhand = base; g.onGearChanged();
    const c = g.sys.inv.compare(minion);
    ok(c.dpsPct > 1, `火力 ${c.dpsPct.toFixed(2)}%`);
  });
}

// ===================== Chromium =====================
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}

if (want('ui')) {
  const srv = await serve();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#title');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('#title');
  await page.click('.slot.empty .btn'); await page.click('.classcard:nth-child(5)'); await page.click('.title-box .btn-primary');
  await page.waitForSelector('#scene');
  await page.evaluate(() => window.__ui.unlockAll());
  /** 説明の窓（itemCard）の文字 */
  const cardText = (uid) => page.evaluate(async (u) => {
    const { itemCard } = await import('/src/ui/tooltip.js');
    const g = window.__game; const f = g.sys.inv.findItem(u);
    return itemCard(g, f.item, { compare: true }).textContent;
  }, uid);

  await ta('I06 説明の窓: 強化 +10 の装備のオプションは強化のボーナス込みの数', async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game; const { generateItem } = await import('/src/game/loot.js');
      const { fmt } = await import('/src/engine/format.js');
      const { shownValue } = await import('/src/game/content/items/itemlib.js');
      g.state.hero.level = 60;
      let it;
      for (let i = 0; i < 4000; i++) { it = generateItem(g.rng, { ilvl: 60, rarity: 'rare', slot: 'chest' }); if (it.affixes.some((a) => a.s === 'life')) break; }
      it.enh = 10; g.state.inv.bag.push(it);
      const a = it.affixes.find((x) => x.s === 'life');
      return { uid: it.uid, want: `+${fmt(shownValue(it, a.v))} 最大ライフ`, raw: `+${fmt(a.v)} 最大ライフ` };
    });
    const txt = await cardText(r.uid);
    ok(txt.includes(r.want), `「${r.want}」が無い（素の数 ${r.raw}）`);
  });

  await ta('I04 説明の窓: 副刀のダメージが出る', async () => {
    const uid = await page.evaluate(async () => {
      const g = window.__game; const { generateItem } = await import('/src/game/loot.js');
      let it;
      for (let i = 0; i < 4000; i++) { it = generateItem(g.rng, { ilvl: 30, rarity: 'magic', slot: 'offhand', cls: 'assassin' }); if (it.base.startsWith('offblade')) break; }
      g.state.inv.bag.push(it); return it.uid;
    });
    const txt = await cardText(uid);
    ok(/副手のダメージ/.test(txt), txt.slice(0, 120));
  });

  await ta('I05 説明の窓: 指輪は左右のどちらと比べたかを出す', async () => {
    const uid = await page.evaluate(async () => {
      const g = window.__game; const { generateItem } = await import('/src/game/loot.js');
      g.state.hero.equip.ring1 = generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'ring' });
      g.state.hero.equip.ring2 = generateItem(g.rng, { ilvl: 30, rarity: 'magic', slot: 'ring' });
      g.onGearChanged();
      const it = generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'ring' }); g.state.inv.bag.push(it); return it.uid;
    });
    const txt = await cardText(uid);
    ok(/(左|右)の指輪と比べると/.test(txt), txt.slice(-80));
  });

  await ta('I02 図鑑: 発見率の「実際の効き」の説明が数と食い違わない', async () => {
    await page.evaluate(() => { window.__ui.openPanel('bestiary'); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#panelbody .tab, #panelbody button')].find((x) => /落とし物/.test(x.textContent)); b?.click(); });
    await page.waitForTimeout(250);
    const txt = await page.evaluate(() => document.querySelector('#panelbody')?.textContent || '');
    ok(/レア発見率/.test(txt), '落とし物の表が開く');
    ok(!/多いほど逓減/.test(txt), '「多いほど逓減」（実効の方が大きいのに逓減と書く）');
  });

  await ta('I17 持ち物: 操作の窓に「倉庫へ」（スマホは長押しが出ない）・鍵つきも倉庫へ入れられる', async () => {
    const uid = await page.evaluate(async () => {
      const g = window.__game; const { generateItem } = await import('/src/game/loot.js');
      const it = generateItem(g.rng, { ilvl: 20, rarity: 'rare', slot: 'helm' }); it.locked = true; g.state.inv.bag.unshift(it);
      window.__ui.openPanel('bag'); return it.uid;
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#panelbody .tabs .tab')].find((x) => x.textContent.startsWith('バッグ')); b?.click(); });
    await page.waitForTimeout(200);
    await page.click('#panelbody .grid .cell:not(.empty)');
    await page.waitForSelector('.modal .modal-foot');
    const has = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal .modal-foot button')].find((x) => x.textContent === '倉庫へ'); b?.click(); return !!b; });
    ok(has, '「倉庫へ」が無い');
    await page.waitForTimeout(200);
    const where = await page.evaluate((u) => window.__game.sys.inv.findItem(u)?.where, uid);
    ok(where === 'stash', `場所 ${where}`);
  });

  ok(true);
  await ta('Chromium のエラーが 0 件', async () => ok(!errors.length, errors.slice(0, 3).join(' / ')));
  await browser.close();
  srv.close();
}

console.log(`\nqa_items: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
