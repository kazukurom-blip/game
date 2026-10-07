// ゲームのデータ（JSON）を、設計書の元データ classic/tools/data/*.mjs と式 classic/tools/lib/*.mjs から書き出す。
// Unity 版の Core（classic-unity/Core）はこの JSON を読む。数値は gen_docs.mjs（設計書の表）と同じ式で作る。
//
// 実行: node classic-unity/Data/tools/export_data.mjs          （書き出す）
//       node classic-unity/Data/tools/export_data.mjs --check  （書き出さずに、今の JSON と同じか・つじつまを検査。違えば 1 で終わる）
// 出力: classic-unity/Data/items.json, monsters.json, quests.json, shops.json, npcs.json, skills.json, maps/<ID>.json, maps/index.json
// スキル: 名前・MP・前提などは classic/docs/JOBS.md の表、動き（範囲・式・状態異常）は classic/tools/data/skills.mjs（skills_export.mjs）
// マップの足場の配置は仮（このファイルの ISLAND）。つながり（ポータル）は maps.mjs のとおり。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mobBase, KIND_MUL, nice, expToNext } from '../../../classic/tools/lib/curves.mjs';
import { MONSTERS_RAW } from '../../../classic/tools/data/monsters.mjs';
import { MAPS_RAW } from '../../../classic/tools/data/maps.mjs';
import { armorList, extraList, weaponList, STARTER, WEAPON_TYPES } from '../../../classic/tools/data/equips.mjs';
import { SCROLLS, scrollsFor } from '../../../classic/tools/data/scrolls.mjs';
import { QUESTS_RAW } from '../../../classic/tools/data/quests.mjs';
import { buildSkills } from './skills_export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const problems = [];
const CHECK_ONLY = process.argv.includes('--check');
const write = (name, obj) => {
  const p = path.join(OUT, name);
  const text = JSON.stringify(obj, null, 1) + '\n';
  if (CHECK_ONLY) {
    const now = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (now !== text) problems.push(`${name} が元のデータと違う（node classic-unity/Data/tools/export_data.mjs で書き出し直す）`);
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
  ['all_cure', '万能薬', { cure: ['poison', 'darkness', 'curse', 'stun', 'seal', 'weak'] }, 600],
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
const MOVE_SPEED = { crawl: 40, walk: 75, jump: 70, fly: 60, stand: 0, teleport: 50 };
const ELEM = { 火: 'fire', 氷: 'ice', 雷: 'lightning', 毒: 'poison', 聖: 'holy', 闇: 'dark' };
const SIZE = { crawl: [30, 24], walk: [44, 44], jump: [36, 36], fly: [34, 30], stand: [40, 56], teleport: [40, 50] };
const SIZE_MUL = { normal: 1, tough: 1.3, frail: 0.9, elite: 2, boss: 4, raid: 6 };
const idOf = (name) => { const id = byName.get(name); if (!id) problems.push(`アイテムの名前が見つからない: ${name}`); return id; };

const monsters = MONSTERS_RAW.map(([id, name, lv, kind, move, atkType, el, etc, special, note]) => {
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
  return {
    id, name, lv, kind, move: mv, attack: atkType, touch: atkType.includes('体'), ranged: atkType.includes('遠'), magic,
    elements, hp, mp: magic ? nice(lv * 6 + 10) : nice(lv * 2), exp: nice(b.exp * k.exp),
    atk: nice(b.atk * k.atk), matk: magic ? nice(b.atk * k.atk * 1.1) : 0, def: nice(b.def * k.def), mdef: nice(b.def * k.def * (magic ? 1.3 : 0.8)),
    avoid: Math.round(b.avoid * (kind === 'frail' ? 1.5 : 1)), acc: Math.round(lv * 1.4 + 5),
    meso: nice(b.meso * (kind === 'boss' ? 30 : kind === 'raid' ? 100 : kind === 'elite' ? 6 : 1)), mesoChance: 0.6,
    speed: MOVE_SPEED[mv], chaseOnSight: mv === 'walk' && lv >= 20, width: sz[0], height: sz[1],
    pushed: big ? 0 : Math.max(1, Math.round(hp * 0.1)), noKnockback: big,
    drops: drops.filter((d) => d.item),
    equipDrop: lv >= 10 ? { band: BAND(lv) || 10, chance: big ? 1 : kind === 'elite' ? 0.3 : 0.008, count: big ? 3 : 1 } : null,
    cursedScrollChance: big ? 0.2 : kind === 'elite' ? 0.02 : 0,
    etc: `etc.${id}`, special: special || null, note,
  };
});
write('monsters.json', { note: 'export_data.mjs が monsters.mjs と curves.mjs から書き出した（MONSTERS.md の表と同じ値）。手で直さない。', monsters });

// ---------------- NPC
const NPCS = [
  ['luka', '案内人ルカ', 'S000', 260],
  ['ganzo', '縄職人ガンゾ', 'S001', 560],
  ['poppo', 'はしご番のポッポ', 'S002', 300],
  ['yomogi', '村長ヨモギ', 'S003', 1180],
  ['tata', '雑貨屋タタ', 'S003', 620, { shop: 'shop.S003.general' }],
  ['nina', '薬屋ニナ', 'S003', 820, { shop: 'shop.S003.potion' }],
  ['momo', '宿屋のモモ', 'S003', 1450, { inn: 30 }],
  ['tobio', '漁師トビオ', 'S003', 1720],
  ['riri', '少女リリ', 'S003', 1900],
  ['gen', 'ゲン爺', 'S003', 1320],
  ['piko', '学者見習いピコ', 'S003', 2000],
  ['baldo', '教官バルド', 'S011', 500],
  ['kai', '船長カイ', 'S010', 900, { travel: { to: 'V100', toPortal: 'sp', minLevel: 7, oneWay: true, fee: 0, requiresQuest: 'S-19' } }],
  ['olga', '港長オルガ', 'V100', 1250],
];
const NPC_BY_NAME = new Map(NPCS.map(([id, name]) => [name, id]));
write('npcs.json', { npcs: NPCS.map(([id, name, map, x, extra]) => ({ id, name, map, x, ...(extra || {}) })) });

// ---------------- 店
const shops = [
  { id: 'shop.S003.general', name: '芽吹き村の雑貨屋', items: items.filter((i) => i.id.startsWith('eq.starter.') && i.price > 0).map((i) => ({ item: i.id })) },
  { id: 'shop.S003.potion', name: '芽吹き村の薬屋', items: [{ item: 'use.red_potion' }, { item: 'use.blue_potion' }] },
];
write('shops.json', { note: 'ITEMS.md 6 章（島の店だけ。ほかの町は後で足す）', shops });

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
  const tut = TUTORIAL[id] || {};
  const giverId = NPC_BY_NAME.get(giver) || giver;
  const objectives = tut.objectives || parseGoal(goal);
  if (!objectives.length && id.startsWith('S-')) problems.push(`クエスト ${id} の目的が読めない`);
  return {
    id, name, giver: giverId, giverName: giver, map, minLevel: lv, prereqs: pre === '-' ? [] : pre.split(/[・,]/).map((s) => s.trim()),
    size, goalText: goal.replace(/\[\[(k|i|m):([A-Z0-9]+)(?::(\d+))?\]\]/g, (_, t, a, n) => `${a}${n ? '×' + n : ''}`), objectives,
    end: tut.end || giverId, exp, meso: meso + r.meso, rewards: r.rewards, rewardText: itemsText, rewardUnparsed: r.rest, story,
    tutorial: id.startsWith('S-'),
  };
});
write('quests.json', { note: 'export_data.mjs が quests.mjs から書き出した。報酬の経験値・お金は QUESTS.md 1-3 の式。チュートリアル（S-01〜S-20）の目的は機械で判定できる形に書き直してある。', quests });

// ---------------- マップ（芽吹きの島 12 ＋ ブリーズ港の仮）
const G = 640; // 地面の高さ
const RAW = Object.fromEntries(MAPS_RAW.map((m) => [m[0], m]));
const ISLAND = {
  S000: { width: 1400, footholds: [{ id: 'g', ground: true, points: [[0, G], [1400, G]] }, { id: 'rock', points: [[620, 600], [680, 600]] }],
    walls: [{ x: 620, top: 600, bottom: G }, { x: 680, top: 600, bottom: G }], portals: { S001: 1350 }, spawn: 120,
    objects: [] },
  S001: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 'step', points: [[780, 592], [1080, 592]] }, { id: 'upper', points: [[1200, 512], [1560, 512]] }],
    ropes: [{ x: 1340, top: 512, bottom: 616 }], portals: { S000: 60, S002: 1740 },
    spawns: [['M001', 320], ['M001', 700], ['M001', 900, 592], ['M001', 1500]], mobMax: 6,
    objects: [{ id: 'S001.crate', name: '木箱', x: 1480, y: 512 }] },
  S002: { width: 2000, footholds: [{ id: 'g', ground: true, points: [[0, G], [2000, G]] }, { id: 'hill', points: [[560, 496], [1100, 496]] }],
    ropes: [{ x: 700, top: 496, bottom: 624, ladder: true }], portals: { S001: 60, S003: 1940 },
    spawns: [['M001', 400], ['M002', 900], ['M002', 1300], ['M001', 800, 496], ['M002', 1000, 496], ['M002', 1600]], mobMax: 8 },
  S003: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [1400, G], [1500, 620], [2400, 620]] }, { id: 'roof', points: [[1550, 556], [1850, 556]] }],
    portals: { S002: 60, S004: 300, S011: 1000, S010: 2150, S006: 2340 }, spawn: 1200, town: 1200 },
  S004: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [2400, G]] }, { id: 'f1', points: [[400, 576], [800, 576]] }, { id: 'f2', points: [[1200, 576], [1700, 576]] }, { id: 'f3', points: [[1800, 512], [2200, 512]] }],
    portals: { S003: 60, S005: 2340 },
    spawns: [['M001', 300], ['M002', 600], ['M002', 600, 576], ['M003', 1000], ['M003', 1400, 576], ['M002', 1600], ['M003', 2000, 512], ['M001', 2100]], mobMax: 10 },
  S005: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [600, G], [664, 608], [1300, 608], [1364, G], [2400, G]] }, { id: 'root1', points: [[300, 560], [600, 560]] }, { id: 'root2', points: [[800, 544], [1150, 544]] }, { id: 'root3', points: [[1500, 576], [1900, 576]] }],
    portals: { S004: 60, S007: 1000, S008: 2340 },
    spawns: [['M003', 400], ['M003', 450, 560], ['M005', 900, 544], ['M005', 1200], ['M003', 1600, 576], ['M005', 1800], ['M005', 2100]], mobMax: 10 },
  S006: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 't1', points: [[200, 520], [1600, 520]] }, { id: 't2', points: [[300, 400], [1400, 400]] }, { id: 't3', points: [[500, 280], [1250, 280]] }],
    ropes: [{ x: 420, top: 520, bottom: 616 }, { x: 900, top: 400, bottom: 500 }, { x: 700, top: 280, bottom: 380 }],
    portals: { S003: 60, S008: [1200, 280] },
    spawns: [['M004', 500], ['M004', 1200], ['M004', 600, 520], ['M005', 1100, 520], ['M004', 1400, 520], ['M005', 500, 400], ['M004', 1000, 400], ['M005', 1200, 400], ['M004', 800, 280], ['M005', 1000, 280]], mobMax: 12 },
  S007: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 'pond', points: [[600, 576], [1000, 576]] }, { id: 'room', points: [[1500, 300], [1760, 300]] }],
    walls: [{ x: 1500, top: 200, bottom: 300 }, { x: 1760, top: 200, bottom: 300 }],
    portals: { S005: 60 }, extraPortals: [
      { name: 'secret', type: 'hidden', x: 1720, y: G, toPortal: 'room' },
      { name: 'room', type: 'visible', x: 1540, y: 300, toPortal: 'secret' },
    ],
    spawns: [['M005', 400], ['M005', 700, 576], ['M006', 900, 576], ['M005', 1200], ['M006', 1400], ['M006', 300]], mobMax: 8,
    objects: [{ id: 'S007.box', name: 'ゲン爺の箱', x: 1680, y: 300 }] },
  S008: { width: 2000, footholds: [{ id: 'g', ground: true, points: [[0, G], [500, G], [700, 540], [1300, 540], [1500, G], [2000, G]] }],
    portals: { S005: 60, S006: [1000, 540], S009: 1940 },
    spawns: [['M006', 300], ['M006', 800, 540], ['M004', 1150, 540], ['M006', 1700], ['M004', 1850]], mobMax: 8,
    objects: [{ id: 'S008.view', name: '見晴らし台', x: 900, y: 540 }] },
  S009: { width: 2200, footholds: [{ id: 'g', ground: true, points: [[0, G], [2200, G]] }, { id: 'rock', points: [[900, 576], [1200, 576]] }],
    portals: { S008: 60 },
    spawns: [['M004', 400], ['M006', 700], ['M004', 1000, 576], ['M006', 1400], ['M004', 1800]], mobMax: 8,
    timed: [['M007', 1600, G, 600]] },
  S010: { width: 1200, footholds: [{ id: 'g', ground: true, points: [[0, G], [1200, G]] }], portals: { S003: 60 } },
  S011: { width: 1000, footholds: [{ id: 'g', ground: true, points: [[0, G], [1000, G]] }], portals: { S003: 60 } },
  V100: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [2400, G]] }], portals: {}, spawn: 1200, town: 1200, note: '仮（大陸のマップはまだ作っていない。島からの船の着く所だけ）' },
};

const mapIndex = [];
for (const [mid, L] of Object.entries(ISLAND)) {
  const raw = RAW[mid];
  const [, name, type, lv, links] = raw;
  const yAt = (x) => { // 地面の高さ（折れ線）
    const pts = L.footholds[0].points;
    for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return G;
  };
  const portals = [];
  const sx = L.spawn ?? 120;
  portals.push({ name: 'sp', type: 'spawn', x: sx, y: yAt(sx) });
  if (L.town) portals.push({ name: 'town', type: 'town', x: L.town, y: yAt(L.town) });
  for (const [to, pos] of Object.entries(L.portals)) {
    const [x, y] = Array.isArray(pos) ? pos : [pos, yAt(pos)];
    portals.push({ name: `to_${to}`, type: 'visible', x, y, to, toPortal: `to_${mid}` });
  }
  for (const p of L.extraPortals || []) portals.push(p);
  // つながりの検査: maps.mjs の links と同じか（V100 は島の外へのつながりを入れていない）
  if (mid.startsWith('S')) {
    const have = Object.keys(L.portals).sort().join(',');
    const want = [...links].sort().join(',');
    if (have !== want) problems.push(`${mid} のポータル ${have} が maps.mjs のつながり ${want} と違う`);
  }
  const npcs = NPCS.filter((n) => n[2] === mid).map(([id, nm, , x, extra]) => ({ id, name: nm, x, y: yAt(x), ...(extra || {}) }));
  const spawns = (L.spawns || []).map(([mob, x, y]) => ({ mob, x, y: y ?? yAt(x) }));
  for (const s of spawns) if (!raw[5].includes(s.mob)) problems.push(`${mid} に ${s.mob} は出ない（maps.mjs）`);
  for (const mob of raw[5]) if (!spawns.some((s) => s.mob === mob) && !(L.timed || []).some((t) => t[0] === mob)) problems.push(`${mid} の敵 ${mob} の湧く所が無い`);
  const data = {
    id: mid, name, region: mid[0], type, lv: lv || undefined, width: L.width, height: 720, bgm: type === '町' ? 'island_town' : 'island_field',
    returnMap: mid.startsWith('S') ? 'S003' : mid,
    footholds: L.footholds, ropes: L.ropes || [], walls: L.walls || [], portals,
    spawns, mobMax: L.mobMax || 0, respawnSec: 7,
    timedSpawns: (L.timed || []).map(([mob, x, y, sec]) => ({ mob, x, y, intervalSec: sec })),
    npcs, objects: L.objects || [], note: L.note || raw[6],
  };
  write(`maps/${mid}.json`, data);
  mapIndex.push({ id: mid, name, type });
}
// 島の中でポータルが両方向につながっているか
for (const [mid, L] of Object.entries(ISLAND)) for (const to of Object.keys(L.portals)) if (!ISLAND[to]?.portals[mid]) problems.push(`${mid} → ${to} の戻りのポータルが無い`);
write('maps/index.json', { maps: mapIndex });

// ---------------- スキル（JOBS.md の表 ＋ skills.mjs の動き）
const skills = buildSkills(problems);
write('skills.json', {
  note: 'export_data.mjs が JOBS.md 4 章の表（名前・最大Lv・効果・MP・前提）と classic/tools/data/skills.mjs（範囲・式・動き・状態異常）から書き出した。手で直さない。式の x はスキルの Lv、lv はキャラの Lv。range は当たる範囲（px、主人公の足元から。front = 向いている方）。',
  skills,
});

if (problems.length) { console.error('問題:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`${CHECK_ONLY ? '検査した（同じ）' : '書き出した'}: アイテム ${items.length}、敵 ${monsters.length}、クエスト ${quests.length}、マップ ${mapIndex.length}、NPC ${NPCS.length}、店 ${shops.length}、スキル ${skills.length}`);
