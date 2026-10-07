// ゲームのデータ（JSON）を、設計書の元データ classic/tools/data/*.mjs と式 classic/tools/lib/*.mjs から書き出す。
// Unity 版の Core（classic-unity/Core）はこの JSON を読む。数値は gen_docs.mjs（設計書の表）と同じ式で作る。
//
// 実行: node classic-unity/Data/tools/export_data.mjs            … 書き出す（マップは生成して検査してから）
//       node classic-unity/Data/tools/export_data.mjs --check    … 書き出さずに、生成し直した結果がファイルと同じか・マップの検査を通るかだけ確かめる
// 出力: classic-unity/Data/items.json, monsters.json, quests.json, shops.json, npcs.json, skills.json, maps/<ID>.json, maps/index.json
// スキル: 名前・MP・前提などは classic/docs/JOBS.md の表、動き（範囲・式・状態異常）は classic/tools/data/skills.mjs（skills_export.mjs）
// マップ: 芽吹きの島は world/island.mjs（手で置いた）、ほかの 222 枚は world/generate.mjs（地形の型から生成。種はマップの ID）。
//         つながり（ポータル）と出る敵は maps.mjs のとおり。NPC は world/npcs.mjs。検査は world/check.mjs。
// クエスト: 文章だけの目的は quest_goals.mjs で判定できる形に直す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mobBase, KIND_MUL, nice, expToNext } from '../../../classic/tools/lib/curves.mjs';
import { MONSTERS_RAW } from '../../../classic/tools/data/monsters.mjs';
import { MOB_SKILLS } from '../../../classic/tools/data/mob_skills.mjs';
import { MAPS_RAW } from '../../../classic/tools/data/maps.mjs';
import { armorList, extraList, weaponList, STARTER, WEAPON_TYPES } from '../../../classic/tools/data/equips.mjs';
import { SCROLLS, scrollsFor } from '../../../classic/tools/data/scrolls.mjs';
import { QUESTS_RAW } from '../../../classic/tools/data/quests.mjs';
import { NPCS, npcIdOf, POTION_SHOPS } from './world/npcs.mjs';
import { buildWorld } from './world/world.mjs';
import { QUEST_GOALS } from './quest_goals.mjs';
import { buildSkills } from './skills_export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const problems = [];
const CHECK = process.argv.includes('--check');
const stale = [];
const write = (name, obj) => {
  const p = path.join(OUT, name);
  const text = JSON.stringify(obj, null, 1) + '\n';
  if (CHECK) {
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) stale.push(name);
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};

// ---------------- 共通の言葉 → コードの名前
const JOB = { 戦士: 'warrior', 魔法使い: 'magician', 弓使い: 'bowman', 盗賊: 'thief', 海賊: 'pirate', 共通: 'common' };
const SLOT = { 帽子: 'cap', 上着: 'top', 下衣: 'bottom', 全身: 'overall', 靴: 'shoes', 手袋: 'gloves', 盾: 'shield', マント: 'cape', 耳飾り: 'earring', 武器: 'weapon', 顔飾り: 'face' };
const WTYPE = { 片手剣: 'sword1', 両手剣: 'sword2', 片手斧: 'axe1', 両手斧: 'axe2', 片手鈍器: 'mace1', 両手鈍器: 'mace2', 槍: 'spear', 矛: 'polearm', ワンド: 'wand', スタッフ: 'staff', 弓: 'bow', クロスボウ: 'xbow', クロー: 'claw', 短剣: 'dagger', ナックル: 'knuckle', 銃: 'gun' };
const TWO_HANDED = new Set(['両手剣', '両手斧', '両手鈍器', '槍', '矛', 'スタッフ', '弓', 'クロスボウ', '銃']);
const STAT_WORD = { 攻撃力: 'watk', 魔力: 'matk', 防御: 'wdef', 魔防: 'mdef', 命中: 'acc', 回避: 'avoid', 速さ: 'speed', ジャンプ: 'jump', HP: 'hp', MP: 'mp', STR: 'str', DEX: 'dex', INT: 'int', LUK: 'luk' };

// 「攻撃力+5 STR+3」「防御 2」「全能力+1」→ { watk: 5, str: 3 }
function parseStats(text, into = {}) {
  if (!text) return into;
  const re = /(攻撃力|魔力|防御|魔防|命中|回避|速さ|ジャンプ|HP|MP|STR|DEX|INT|LUK|全能力)\s*([+-]?\s*\d+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = parseInt(m[2].replace(/\s/g, ''), 10);
    if (m[1] === '全能力') for (const k of ['str', 'dex', 'int', 'luk']) into[k] = (into[k] || 0) + v;
    else into[STAT_WORD[m[1]]] = (into[STAT_WORD[m[1]]] || 0) + v;
  }
  return into;
}
function parseReq(req) {
  const m = /^(STR|DEX|INT|LUK)\s+(\d+)/.exec(req || '');
  return m ? { reqStat: m[1], reqValue: parseInt(m[2], 10) } : {};
}

// ---------------- アイテム
const items = [];
const byName = new Map();
function addItem(it) {
  if (items.some((x) => x.id === it.id)) { problems.push(`アイテムの ID が重なっている: ${it.id}`); return it; }
  items.push(it);
  if (!byName.has(it.name)) byName.set(it.name, it.id);
  return it;
}

// 3-1 回復 / 3-2 強化の薬 / 3-5 その他
const USE = [
  ['red_potion', '赤ポーション', { hp: 50 }, 50],
  ['orange_potion', '橙ポーション', { hp: 150 }, 160],
  ['white_potion', '白ポーション', { hp: 300 }, 320],
  ['big_white_potion', '大白ポーション', { hp: 1000 }, 1000],
  ['xl_potion', '特大ポーション', { hp: 2000 }, 2200],
  ['blue_potion', '青ポーション', { mp: 100 }, 200],
  ['mana_elixir', '魔力のエリクサー', { mp: 300 }, 620],
  ['blue_secret', '青の秘薬', { mp: 800 }, 1800],
  ['elixir', 'エリクサー', { hpPct: 0.5, mpPct: 0.5 }, 0],
  ['power_elixir', '大エリクサー', { hpPct: 1, mpPct: 1 }, 0],
  ['baked_apple', '焼きりんご', { hp: 400 }, 350],
  ['nut_soup', '木の実のスープ', { mp: 250 }, 450],
  ['warm_milk', '温かい乳', { hp: 1000 }, 900],
  ['seaweed_dango', '海藻団子', { mp: 600 }, 1000],
  ['honey_pot', '蜂蜜の壺', { hp: 600 }, 0],
  ['antidote', '解毒薬', { cure: ['poison'] }, 300],
  ['eye_drop', '目薬', { cure: ['darkness'] }, 300],
  ['holy_water', '聖水', { cure: ['curse'] }, 500],
  ['all_cure', '万能薬', { cure: ['poison', 'darkness', 'curse', 'stun', 'seal'] }, 600], // STATS.md 4-3（弱り・凍結・眠りは時間だけ）
  ['power_tonic', '力の薬', { buff: { watk: 5 }, buffSec: 180 }, 2000],
  ['magic_tonic', '魔力の薬', { buff: { matk: 5 }, buffSec: 180 }, 2000],
  ['aim_tonic', '狙いの薬', { buff: { acc: 10 }, buffSec: 180 }, 1500],
  ['dodge_tonic', '身軽の薬', { buff: { avoid: 10 }, buffSec: 180 }, 1500],
  ['speed_tonic', '速さの薬', { buff: { speed: 10 }, buffSec: 180 }, 1000],
  ['warrior_elixir', '戦士の秘薬', { buff: { watk: 12 }, buffSec: 600 }, 0],
  ['sage_elixir', '賢者の秘薬', { buff: { matk: 12 }, buffSec: 600 }, 0],
  ['marksman_elixir', '名手の秘薬', { buff: { acc: 20 }, buffSec: 600 }, 0],
];
for (const [id, name, use, price] of USE) addItem({ id: `use.${id}`, name, tab: 'use', maxStack: 100, price, use });
addItem({ id: 'use.safety_charm', name: '守りのお守り', tab: 'use', maxStack: 100, price: 5000, desc: '死んだ時に経験値を失わない（1 個使う）' });
addItem({ id: 'use.ap_reset', name: 'AP 振り直しの書', tab: 'use', maxStack: 100, price: 0 });
addItem({ id: 'use.sp_reset', name: 'SP 振り直しの書', tab: 'use', maxStack: 100, price: 0 });
addItem({ id: 'use.bag', name: '持ち物の袋', tab: 'use', maxStack: 100, price: 0, desc: '持ち物の枠 +4（タブを選ぶ）' });
addItem({ id: 'use.pet_food', name: 'ペットの餌', tab: 'use', maxStack: 100, price: 30 });

// 3-3 帰還の書（町ごと）
const TOWNS = MAPS_RAW.filter((m) => m[2] === '町');
for (const [mid, name] of TOWNS) {
  const region = mid[0];
  const price = region === 'V' ? 400 : ['C', 'F', 'T', 'M'].includes(region) ? 600 : 1000;
  addItem({ id: `use.return.${mid}`, name: `${name}への帰還の書`, tab: 'use', maxStack: 100, price, use: { returnTo: mid, returnRegion: region } });
}
addItem({ id: 'use.return.nearest', name: '一番近い町への帰還の書', tab: 'use', maxStack: 100, price: 500, use: { returnTo: 'nearest' } });

// 3-4 弾・矢・投げ星
const AMMO = [
  ['arrow_bow', '弓の矢', 0, 1000, 1000, 'arrow_bow'], ['arrow_xbow', 'クロスボウの矢', 0, 1000, 1000, 'arrow_xbow'],
  ['bronze_arrow_bow', '青銅の矢（弓）', 1, 1000, 5000, 'arrow_bow'], ['bronze_arrow_xbow', '青銅の矢（クロスボウ）', 1, 1000, 5000, 'arrow_xbow'],
  ['steel_arrow_bow', '鋼の矢（弓）', 2, 1000, 15000, 'arrow_bow'], ['steel_arrow_xbow', '鋼の矢（クロスボウ）', 2, 1000, 15000, 'arrow_xbow'],
  ['star_iron', '投げ星（鉄）', 15, 500, 500, 'star'], ['star_steel', '投げ星（鋼）', 17, 500, 2500, 'star'],
  ['star_silver_moon', '投げ星（銀の月）', 19, 500, 8000, 'star'], ['star_snow', '投げ星（雪の結晶）', 21, 500, 20000, 'star'],
  ['star_black_moon', '投げ星（黒い月）', 23, 600, 0, 'star'], ['star_thunder', '投げ星（雷）', 25, 700, 0, 'star'],
  ['star_dragon', '投げ星（竜の牙）', 27, 800, 0, 'star'], ['star_stardust', '投げ星（星屑）', 29, 800, 0, 'star'],
  ['bullet_lead', '弾（鉛）', 10, 500, 600, 'bullet'], ['bullet_steel', '弾（鋼）', 13, 500, 3000, 'bullet'],
  ['bullet_silver', '弾（銀）', 16, 600, 0, 'bullet'], ['bullet_dragon', '弾（竜鉄）', 19, 800, 0, 'bullet'],
];
for (const [id, name, watk, stack, price, kind] of AMMO) addItem({ id: `use.${id}`, name, tab: 'use', maxStack: stack, price, sellPrice: Math.floor(price / 4), ammo: kind, ammoWatk: watk, bundle: stack });

// 素材（敵ごと）・原石・宝石
for (const [id, , lv, , , , , etc] of MONSTERS_RAW) addItem({ id: `etc.${id}`, name: etc, tab: 'etc', maxStack: 200, price: 0, sellPrice: Math.max(1, lv * 2) });
const ORES = [['bronze', '青銅の原石'], ['iron', '鉄の原石'], ['silver', '銀の原石'], ['mithril', 'ミスリルの原石'], ['gold', '金の原石'], ['adaman', 'アダマンの原石'], ['starsteel', '星鉄の原石']];
for (const [id, name] of ORES) addItem({ id: `etc.ore.${id}`, name, tab: 'etc', maxStack: 100, price: 0, sellPrice: 50 });
const GEMS = ['ガーネット', 'アメジスト', 'アクアマリン', 'エメラルド', 'オパール', 'サファイア', 'トパーズ', 'ダイヤモンド', '黒水晶'];
GEMS.forEach((g, i) => addItem({ id: `etc.gem.${i}`, name: `${g}の原石`, tab: 'etc', maxStack: 100, price: 0, sellPrice: 200 }));

// 書（スクロール）: 10% / 60% / 100% と 呪い付き 30% / 70%
for (const [sid, part, what, e10, e60, e100] of SCROLLS) {
  const isWeapon = !!WTYPE[part];
  const target = isWeapon ? { weapon: part } : { slot: SLOT[part] };
  const variants = [[10, e10, false], [60, e60, false], [30, e10, true], [70, e60, true]];
  if (e100) variants.push([100, e100, false]);
  for (const [rate, eff, cursed] of variants) {
    addItem({
      id: `scroll.${sid}.${rate}`, name: `${part}${what}の書 ${rate}%`, tab: 'use', maxStack: 100,
      price: 0, sellPrice: rate === 10 || rate === 30 ? 5000 : 1000,
      scroll: { ...target, rate, cursed, stats: parseStats(eff) },
    });
  }
}

// 装備
const SHIELD_OK = new Set(WEAPON_TYPES.filter((w) => (w[6] || '').includes('盾と使える')).map((w) => w[0]));
function equipItem(o) { return addItem({ tab: 'equip', maxStack: 1, ...o }); }
// 初心者の装備を先に（同じ名前の装備があっても、クエストの報酬の名前は初心者の物を指す。例: 綿の手袋）
STARTER.forEach(([slot, full, lv, perf, upg, price], i) => {
  const m = /^(.+?)（(.+)）$/.exec(full);
  const name = m ? m[1] : full;
  const wtype = m ? m[2] : null;
  const o = {
    id: `eq.starter.${i}`, name, slot: SLOT[slot], job: 'common', reqLevel: lv, stats: parseStats(perf), upgrades: upg, price,
  };
  if (wtype) {
    Object.assign(o, { weaponType: wtype, twoHanded: TWO_HANDED.has(wtype), allowsShield: SHIELD_OK.has(wtype) });
    if (perf.includes('遅い')) o.attackSpeed = 6;
  }
  equipItem(o);
});
for (const a of armorList()) {
  equipItem({
    id: `eq.${JOB[a.job]}.${SLOT[a.slot]}.${a.lv}`, name: a.name, slot: SLOT[a.slot], job: JOB[a.job], reqLevel: a.lv,
    ...parseReq(a.req), stats: parseStats(a.bonus, { wdef: a.def, mdef: a.mdef }), upgrades: a.upg, price: a.price,
  });
}
for (const a of extraList()) {
  equipItem({
    id: `eq.${JOB[a.job]}.${SLOT[a.slot]}.${a.lv}`, name: a.name, slot: SLOT[a.slot], job: JOB[a.job], reqLevel: a.lv,
    ...parseReq(a.req), stats: parseStats(a.bonus, { wdef: a.def, mdef: a.mdef }), upgrades: a.upg, price: a.price,
  });
}
for (const w of weaponList()) {
  const stats = parseStats(w.bonus, {});
  stats.watk = (stats.watk || 0) + w.watk;
  if (w.matk) stats.matk = (stats.matk || 0) + w.matk;
  equipItem({
    id: `eq.${JOB[w.job]}.${WTYPE[w.type]}.${w.lv}`, name: w.name, slot: 'weapon', job: JOB[w.job], reqLevel: w.lv,
    ...parseReq(w.req), stats, upgrades: w.upg, price: w.price, weaponType: w.type,
    twoHanded: TWO_HANDED.has(w.type), allowsShield: SHIELD_OK.has(w.type), desc: w.note || '',
  });
}
// クエストの見た目だけの品・特別な品
equipItem({ id: 'eq.cosmetic.shell_necklace', name: '貝の首飾り', slot: 'face', job: 'common', reqLevel: 0, stats: {}, upgrades: 0, price: 0, cosmetic: true, desc: '見た目だけ' });
addItem({ id: 'special.letter_breeze', name: 'ブリーズ港への推薦状', tab: 'special', maxStack: 1, price: 0, quest: true });
// 敵の固有品（2-5。島では「旅立ちの髪飾り」）
for (const [id, , lv, kind, , , , , special] of MONSTERS_RAW) {
  if (!special || byName.has(special)) continue;
  const m = /^(.+?)（(.+)）$/.exec(special);
  const name = m ? m[1] : special;
  const kindWord = m ? m[2] : '';
  const bandLv = Math.max(10, lv);
  if (WTYPE[kindWord]) {
    equipItem({ id: `eq.unique.${id}`, name, slot: 'weapon', job: 'common', reqLevel: bandLv, stats: { watk: Math.round(lv * 0.9 + 15) }, upgrades: 7, price: 0, weaponType: kindWord, twoHanded: TWO_HANDED.has(kindWord), allowsShield: SHIELD_OK.has(kindWord), desc: '固有品' });
  } else if (kindWord === '帽子' || /髪飾り|冠|帽子/.test(name)) {
    equipItem({ id: `eq.unique.${id}`, name, slot: 'cap', job: 'common', reqLevel: Math.max(0, lv - 2), stats: { wdef: Math.round(lv * 0.6 + 3), str: 1, dex: 1, int: 1, luk: 1 }, upgrades: 5, price: 0, desc: '固有品' });
  } else {
    addItem({ id: `etc.unique.${id}`, name, tab: 'etc', maxStack: 100, price: 0, sellPrice: lv * 50, desc: '固有品' });
  }
}
write('items.json', { note: 'export_data.mjs が classic/tools/data から書き出した。手で直さない。', items });

// ---------------- 敵
const POT = (lv) => (lv < 15 ? ['赤ポーション', '青ポーション'] : lv < 35 ? ['橙ポーション', '青ポーション'] : lv < 60 ? ['白ポーション', '魔力のエリクサー'] : lv < 100 ? ['大白ポーション', '魔力のエリクサー'] : ['特大ポーション', '青の秘薬']);
const ORE = (lv) => (lv < 20 ? 'bronze' : lv < 35 ? 'iron' : lv < 50 ? 'silver' : lv < 70 ? 'mithril' : lv < 90 ? 'gold' : lv < 120 ? 'adaman' : 'starsteel');
const GEM = (lv) => Math.min(8, Math.floor(lv / 15));
const BAND = (lv) => [10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150].reduce((a, b) => (b <= lv ? b : a), 0);
const MOVE = { 這: 'crawl', 歩: 'walk', 跳: 'jump', 飛: 'fly', 止: 'stand', 瞬: 'teleport' };
// 速さ（-50〜+50、monsters.mjs の最後の列）→ px/秒 = 100 + 速さ（FEEL.md 9 章）。止は 0。
const moveSpeed = (mv, sp) => (mv === 'stand' ? 0 : 100 + Math.max(-50, Math.min(50, sp ?? 0)));
const STATUS_KINDS = ['poison', 'stun', 'darkness', 'seal', 'curse', 'weak', 'freeze', 'sleep'];
const ATTACK_TYPES = ['melee', 'shot', 'magic', 'area', 'summon', 'heal', 'dive'];
// mob_skills.mjs に無い敵の技: 遠 = 真っすぐの飛び道具（3 秒ごと）、魔 = 足元に予兆 → 当たる魔法
const defaultAttacks = (atkType) => {
  if (atkType.includes('遠')) return [{ id: 'shot', name: '飛び道具', type: 'shot', range: 300, cd: 3, windup: 0.3, pct: 100, speed: 300, life: 1.2 }];
  if (atkType.includes('魔')) return [{ id: 'magic', name: '魔法', type: 'magic', range: 300, cd: 3.5, windup: 0.8, pct: 100, w: 70, h: 90 }];
  return [];
};
const ELEM = { 火: 'fire', 氷: 'ice', 雷: 'lightning', 毒: 'poison', 聖: 'holy', 闇: 'dark' };
const SIZE = { crawl: [30, 24], walk: [44, 44], jump: [36, 36], fly: [34, 30], stand: [40, 56], teleport: [40, 50] };
const SIZE_MUL = { normal: 1, tough: 1.3, frail: 0.9, elite: 2, boss: 4, raid: 6 };
const idOf = (name) => { const id = byName.get(name); if (!id) problems.push(`アイテムの名前が見つからない: ${name}`); return id; };

const monsters = MONSTERS_RAW.map(([id, name, lv, kind, move, atkType, el, etc, special, note, speedStat]) => {
  const b = mobBase(lv);
  const k = KIND_MUL[kind];
  const magic = atkType.includes('魔');
  const hp = nice(b.hp * k.hp);
  const mv = MOVE[move] || 'walk';
  const big = ['boss', 'raid'].includes(kind);
  const elements = {};
  for (const tok of el.split(/\s+/)) {
    const m = /^(火|氷|雷|毒|聖|闇)(弱|耐|無)$/.exec(tok);
    if (m) elements[ELEM[m[1]]] = m[2] === '弱' ? 1.5 : m[2] === '耐' ? 0.5 : 0;
  }
  const [hpPot, mpPot] = POT(lv);
  const drops = [
    { item: `etc.${id}`, chance: 0.55 },
    { item: idOf(hpPot), chance: 0.04 },
    { item: idOf(mpPot), chance: 0.04 },
    { item: `etc.ore.${ORE(lv)}`, chance: 0.02 },
  ];
  if (lv >= 15) drops.push({ item: `etc.gem.${GEM(lv)}`, chance: 0.01 });
  for (const sid of scrollsFor(id)) {
    drops.push({ item: `scroll.${sid}.60`, chance: big ? 0.3 : 0.003 });
    drops.push({ item: `scroll.${sid}.10`, chance: big ? 0.1 : 0.001 });
  }
  if (lv >= 40) drops.push({ item: lv >= 80 ? 'use.power_elixir' : 'use.elixir', chance: big ? 1 : 0.005, count: big ? 5 : 1 });
  if (special) drops.push({ item: byName.get(special) || byName.get(special.replace(/（.+）$/, '')), chance: big ? 0.15 : kind === 'elite' ? 0.1 : 0.0005 });
  const sz = SIZE[mv].map((v) => Math.round(v * SIZE_MUL[kind]));
  const sk = MOB_SKILLS[id] || {};
  const attacks = sk.attacks || defaultAttacks(atkType);
  const checkStatus = (st, where) => { if (st && !STATUS_KINDS.includes(st.kind)) problems.push(`${id} ${where} の状態異常 ${st.kind} が無い`); };
  const ids = new Set();
  for (const a of attacks) {
    if (!ATTACK_TYPES.includes(a.type)) problems.push(`${id} の技 ${a.id} の種類 ${a.type} が無い`);
    if (ids.has(a.id)) problems.push(`${id} の技の ID ${a.id} が重なっている`);
    ids.add(a.id);
    checkStatus(a.status, a.id);
    for (const m of a.mobs || []) if (!MONSTERS_RAW.some((r) => r[0] === m)) problems.push(`${id} の技 ${a.id} が呼ぶ ${m} が無い`);
  }
  checkStatus(sk.touchStatus, '触れた時');
  const boss = sk.boss || (big ? { phases: [{ hp: 1, name: name }] } : null);
  if (boss) for (const ph of boss.phases) for (const m of ph.summon?.mobs || []) if (!MONSTERS_RAW.some((r) => r[0] === m)) problems.push(`${id} の段階 ${ph.name} が呼ぶ ${m} が無い`);
  if (!Number.isInteger(speedStat) || speedStat < -50 || speedStat > 50) problems.push(`${id} の速さ ${speedStat} が -50〜+50 でない`);
  return {
    id, name, lv, kind, move: mv, attack: atkType, touch: atkType.includes('体'), ranged: atkType.includes('遠'), magic,
    elements, hp, mp: magic ? nice(lv * 6 + 10) : nice(lv * 2), exp: nice(b.exp * k.exp),
    atk: nice(b.atk * k.atk), matk: magic ? nice(b.atk * k.atk * 1.1) : 0, def: nice(b.def * k.def), mdef: nice(b.def * k.def * (magic ? 1.3 : 0.8)),
    avoid: Math.round(b.avoid * (kind === 'frail' ? 1.5 : 1)), acc: Math.round(lv * 1.4 + 5),
    meso: nice(b.meso * (kind === 'boss' ? 30 : kind === 'raid' ? 100 : kind === 'elite' ? 6 : 1)), mesoChance: 0.6,
    speedStat, speed: moveSpeed(mv, speedStat), chaseOnSight: mv === 'walk' && lv >= 20, width: sz[0], height: sz[1],
    pushed: big ? 0 : Math.max(1, Math.round(hp * 0.1)), noKnockback: big,
    drops: drops.filter((d) => d.item),
    equipDrop: lv >= 10 ? { band: BAND(lv) || 10, chance: big ? 1 : kind === 'elite' ? 0.3 : 0.008, count: big ? 3 : 1 } : null,
    cursedScrollChance: big ? 0.2 : kind === 'elite' ? 0.02 : 0,
    etc: `etc.${id}`, special: special || null, note,
    attacks, touchStatus: sk.touchStatus || null, boss,
  };
});
write('monsters.json', { note: 'export_data.mjs が monsters.mjs と curves.mjs から書き出した（MONSTERS.md の表と同じ値）。手で直さない。', monsters });

// ---------------- NPC（world/npcs.mjs。位置はマップを作った時に決まる → 下のマップの所で書き出す）
const NPC_BY_NAME = new Map(NPCS.map(([id, name]) => [name, id]));

// ---------------- 店
const shops = [
  { id: 'shop.S003.general', name: '芽吹き村の雑貨屋', items: items.filter((i) => i.id.startsWith('eq.starter.') && i.price > 0).map((i) => ({ item: i.id })) },
  { id: 'shop.S003.potion', name: '芽吹き村の薬屋', items: [{ item: 'use.red_potion' }, { item: 'use.blue_potion' }] },
];
// 町の薬屋（地域の Lv に合わせた薬）。武器屋・防具屋の品ぞろえはまだ（NPC の role だけ）
for (const [mid, list] of Object.entries(POTION_SHOPS)) {
  const town = MAPS_RAW.find((m) => m[0] === mid);
  for (const it of list) if (!items.some((x) => x.id === it)) problems.push(`店の品 ${it} が無い`);
  shops.push({ id: `shop.${mid}.potion`, name: `${town ? town[1] : mid}の薬屋`, items: list.map((item) => ({ item })) });
}
for (const n of NPCS) if (n[3]?.shop && !shops.some((sh) => sh.id === n[3].shop)) problems.push(`NPC ${n[0]} の店 ${n[3].shop} が無い`);
write('shops.json', { note: 'ITEMS.md 6 章（島の店と、町の薬屋。武器屋・防具屋の品ぞろえは後で足す）', shops });

// ---------------- クエスト
const QSIZE = { 小: [0.06, 10], 中: [0.12, 25], 大: [0.25, 60], 特: [0.5, 150] };
const QMIN = { 小: 8, 中: 15, 大: 30, 特: 60 };
// チュートリアル（S-01〜S-20）の目的は機械で判定できる形に書き直す（あらすじは quests.mjs のとおり）
const T = (o) => o;
const TUTORIAL = {
  'S-01': T({ end: 'ganzo', objectives: [{ type: 'visit', map: 'S001' }] }),
  'S-02': T({ end: 'ganzo', objectives: [{ type: 'interact', target: 'S001.crate', label: '上の段の木箱を調べる' }] }),
  'S-03': T({ end: 'ganzo' }),
  'S-04': T({ end: 'poppo' }),
  'S-05': T({ end: 'yomogi', objectives: [{ type: 'talk', npc: 'yomogi' }] }),
  'S-06': T({ end: 'yomogi', objectives: ['tata', 'nina', 'momo', 'tobio'].map((n) => ({ type: 'talk', npc: n })) }),
  'S-07': T({ end: 'baldo', objectives: [{ type: 'event', event: 'quickslot_set', label: '薬をクイックスロットに置く' }, { type: 'event', event: 'use_potion', label: '薬を使う' }] }),
  'S-08': T({ end: 'baldo', objectives: [{ type: 'event', event: 'ap_spent', count: 5, label: 'AP を 5 振る' }] }),
  'S-09': T({ end: 'baldo', objectives: [{ type: 'event', event: 'sp_spent', count: 1, label: 'SP を 1 振る' }, { type: 'event', event: 'skill_used', count: 1, label: 'スキルを使う' }] }),
  'S-10': T({ end: 'riri' }),
  'S-11': T({ end: 'nina' }),
  'S-12': T({ end: 'gen', objectives: [{ type: 'interact', target: 'S007.box', label: '隠し部屋の箱を開ける' }] }),
  'S-13': T({ end: 'momo' }),
  'S-14': T({ end: 'tobio' }),
  'S-15': T({ end: 'piko' }),
  'S-16': T({ end: 'piko', objectives: [{ type: 'interact', target: 'S008.view', label: '高台から大陸を眺める' }] }),
  'S-17': T({ end: 'tobio' }),
  'S-18': T({ end: 'kai', objectives: ['tata', 'nina', 'momo', 'tobio', 'kai'].map((n) => ({ type: 'talk', npc: n })) }),
  'S-19': T({ end: 'auto', objectives: [{ type: 'visit', map: 'V100' }] }),
  'S-20': T({ end: 'riri' }),
};

function parseGoal(goal) {
  const out = [];
  const re = /\[\[(k|i|m):([A-Z0-9]+)(?::(\d+))?\]\]/g;
  let m;
  while ((m = re.exec(goal))) {
    if (m[1] === 'k') out.push({ type: 'kill', mob: m[2], count: parseInt(m[3], 10) });
    else if (m[1] === 'i') out.push({ type: 'collect', item: `etc.${m[2]}`, count: parseInt(m[3], 10) });
    else out.push({ type: 'visit', map: m[2] });
  }
  return out;
}

// 「赤ポーション ×5」「守りのお守り ×1」「1 万ルド」「靴速さの書 100%」→ 品
function parseRewards(text) {
  const rewards = [];
  let meso = 0;
  if (!text || text === '-') return { rewards, meso, rest: [] };
  const rest = [];
  for (let part of text.split(/、/)) {
    part = part.trim();
    let m = /^([\d.]+)\s*万ルド$/.exec(part);
    if (m) { meso += Math.round(parseFloat(m[1]) * 10000); continue; }
    m = /^(.+?)\s*×\s*(\d+)/.exec(part);
    let name = m ? m[1].trim() : part.replace(/（.*）$/, '').trim();
    const count = m ? parseInt(m[2], 10) : 1;
    let id = byName.get(name) || byName.get(name.replace(/\s/g, ''));
    if (!id) {
      const sm = /^(.+?)の書\s*(\d+)%$/.exec(name.replace(/\s/g, ''));
      if (sm) { const it = items.find((x) => x.scroll && x.name.replace(/\s/g, '') === `${sm[1]}の書${sm[2]}%`); if (it) id = it.id; }
    }
    if (id) rewards.push({ item: id, count }); else rest.push(part);
  }
  return { rewards, meso, rest };
}

const quests = QUESTS_RAW.map(([id, name, giver, map, lv, pre, goal, size, itemsText, story]) => {
  const [ef, mf] = QSIZE[size] || [0, 0];
  const exp = Math.max(QMIN[size] || 0, nice(expToNext(Math.min(lv, 199)) * ef));
  const meso = nice(mobBase(lv).meso * mf);
  const r = parseRewards(itemsText);
  const tut = TUTORIAL[id] || QUEST_GOALS[id] || {};
  const giverId = npcIdOf(giver, map) || NPC_BY_NAME.get(giver) || giver;
  if (!NPCS.some((n) => n[0] === giverId && n[2] === map)) problems.push(`クエスト ${id} の依頼者 ${giver} が ${map} にいない`);
  const objectives = tut.parsed ? [...parseGoal(goal), ...tut.objectives] : tut.objectives || parseGoal(goal);
  if (!objectives.length) problems.push(`クエスト ${id} の目的が無い`);
  if (!objectives.length && id.startsWith('S-')) problems.push(`クエスト ${id} の目的が読めない`);
  return {
    id, name, giver: giverId, giverName: giver, map, minLevel: lv, prereqs: pre === '-' ? [] : pre.split(/[・,]/).map((s) => s.trim()),
    size, goalText: goal.replace(/\[\[(k|i|m):([A-Z0-9]+)(?::(\d+))?\]\]/g, (_, t, a, n) => `${a}${n ? '×' + n : ''}`), objectives,
    end: tut.end || giverId, ...(tut.minStats ? { minStats: tut.minStats } : {}), exp, meso: meso + r.meso, rewards: r.rewards, rewardText: itemsText, rewardUnparsed: r.rest, story,
    tutorial: id.startsWith('S-'),
  };
});
write('quests.json', { note: 'export_data.mjs が quests.mjs から書き出した。報酬の経験値・お金は QUESTS.md 1-3 の式。チュートリアル（S-01〜S-20）と文章だけの目的（quest_goals.mjs）は機械で判定できる形に書き直してある。', quests });

// ---------------- マップ（234 枚）と NPC の位置
const world = buildWorld({ MAPS_RAW, MONSTERS_RAW });
problems.push(...world.problems);
const mapIndex = [];
for (const raw of MAPS_RAW) {
  const m = world.maps[raw[0]];
  if (!m) continue;
  write(`maps/${m.id}.json`, m);
  mapIndex.push({ id: m.id, name: m.name, type: m.type, theme: m.theme });
}
write('maps/index.json', { maps: mapIndex });
const npcOut = [];
for (const [id, name, map, extra = {}] of NPCS) {
  const placed = world.maps[map]?.npcs.find((n) => n.id === id);
  const { tier: _t, x: _x, ...rest } = extra;
  npcOut.push({ id, name, map, x: placed?.x ?? extra.x, y: placed?.y, ...rest });
}
write('npcs.json', { note: 'world/npcs.mjs（位置はマップを作った時に決まる）', npcs: npcOut });

// ---------------- スキル（JOBS.md の表 ＋ skills.mjs の動き）
const skills = buildSkills(problems);
write('skills.json', {
  note: 'export_data.mjs が JOBS.md 4 章の表（名前・最大Lv・効果・MP・前提）と classic/tools/data/skills.mjs（範囲・式・動き・状態異常）から書き出した。手で直さない。式の x はスキルの Lv、lv はキャラの Lv。range は当たる範囲（px、主人公の足元から。front = 向いている方）。',
  skills,
});


// クエストの目的が指す物があるか
{
  const objIds = new Set(Object.values(world.maps).flatMap((m) => (m.objects || []).map((o) => o.id)));
  const npcIds = new Set(NPCS.map((n) => n[0]));
  for (const q of quests) {
    if (!npcIds.has(q.end) && q.end !== 'auto') problems.push(`クエスト ${q.id} の報告先 ${q.end} がいない`);
    for (const o of q.objectives) {
      if (o.type === 'talk' && !npcIds.has(o.npc)) problems.push(`クエスト ${q.id}: 話す相手 ${o.npc} がいない`);
      if (o.type === 'interact' && !objIds.has(o.target)) problems.push(`クエスト ${q.id}: 調べる物 ${o.target} がマップに無い`);
      if (o.type === 'visit' && !world.maps[o.map]) problems.push(`クエスト ${q.id}: マップ ${o.map} が無い`);
      if (o.type === 'collect' && !items.some((i) => i.id === o.item)) problems.push(`クエスト ${q.id}: アイテム ${o.item} が無い`);
      if (o.type === 'kill' && !monsters.some((mm) => mm.id === o.mob)) problems.push(`クエスト ${q.id}: 敵 ${o.mob} がいない`);
    }
  }
}

if (CHECK) {
  if (stale.length) problems.push(`書き出した物が古い（node classic-unity/Data/tools/export_data.mjs で書き出し直す）: ${stale.slice(0, 10).join(', ')}${stale.length > 10 ? ` ほか ${stale.length - 10}` : ''}`);
  if (problems.length) { console.error('問題:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`検査 OK: マップ ${mapIndex.length}（生成 ${world.stats.generated}・島 ${mapIndex.length - world.stats.generated}）、どのポータルからも全部の足場に行ける・ポータルは両方向・湧く所は足場の上・跳べない段差なし。書き出したファイルは最新`);
  process.exit(0);
}
if (problems.length) { console.error('問題:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`書き出した: アイテム ${items.length}、敵 ${monsters.length}、クエスト ${quests.length}、マップ ${mapIndex.length}（検査 OK）、NPC ${NPCS.length}、店 ${shops.length}、スキル ${skills.length}`);
