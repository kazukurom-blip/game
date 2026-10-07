// 設計書の表を作り直す道具。元データ（data/*.mjs）と式（lib/*.mjs）から、
// docs/*.md の <!-- GEN:名前 --> 〜 <!-- /GEN:名前 --> の間を書き換える。あわせてつじつまを検査する。
// 実行: node classic/tools/gen_docs.mjs        （書き換え＋検査）
//       node classic/tools/gen_docs.mjs --check （検査だけ。表がずれていたら 1 で終わる）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { earlyHpMul, FRAIL_AVOID, POT_DROP, expTable, mobBase, KIND_MUL, soloMul, nice } from './lib/curves.mjs';
import { MONSTERS_RAW, MOB_TUNE } from './data/monsters.mjs';
import { MAPS_RAW, REGIONS, TRAVEL } from './data/maps.mjs';
import { armorList, extraList, weaponList, STARTER } from './data/equips.mjs';
import { SCROLLS, scrollsFor } from './data/scrolls.mjs';
import { huntTable, killsPerMin } from './hunt_speed.mjs';
import { QUESTS_RAW } from './data/quests.mjs';
import { QUEST_SPAWNS, SIDE_EXP, SIDE_MESO } from './data/quests_more.mjs';
import { QUEST_ITEMS } from './data/quest_items.mjs';
import { Q as ANYTIME } from './data/quests_more/anytime.mjs';
import { FIELD_BOSSES, SEASON_MOBS } from './data/fun_mobs.mjs';
import { expToNext } from './lib/curves.mjs';
import { check } from './balance_check.mjs';
import { playerAcc, hitChance } from './lib/combat.mjs';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const CHECK_ONLY = process.argv.includes('--check');
const problems = [];
const fmt = (n) => Number(n).toLocaleString('en-US');

// ---------------- 敵
const POT = (lv) => (lv < 15 ? ['赤ポーション', '青ポーション'] : lv < 35 ? ['橙ポーション', '青ポーション'] : lv < 60 ? ['白ポーション', '魔力のエリクサー'] : lv < 100 ? ['大白ポーション', '魔力のエリクサー'] : ['特大ポーション', '青の秘薬']);
const ORE = (lv) => (lv < 20 ? '青銅の原石' : lv < 35 ? '鉄の原石' : lv < 50 ? '銀の原石' : lv < 70 ? 'ミスリルの原石' : lv < 90 ? '金の原石' : lv < 120 ? 'アダマンの原石' : '星鉄の原石');
const GEM = (lv) => ['ガーネット', 'アメジスト', 'アクアマリン', 'エメラルド', 'オパール', 'サファイア', 'トパーズ', 'ダイヤモンド', '黒水晶'][Math.min(8, Math.floor(lv / 15))] + 'の原石';
const BAND = (lv) => [10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150].reduce((a, b) => (b <= lv ? b : a), 0);

export const MONSTERS = MONSTERS_RAW.map(([id, name, lv, kind, move, atkType, el, etc, special, note, speed = 0]) => {
  const b = mobBase(lv);
  const k = KIND_MUL[kind];
  const t = MOB_TUNE[id] || {};
  const magic = atkType.includes('魔');
  const atk = b.atk * k.atk * (t.atk ?? 1);
  return {
    id, name, lv, kind, move, atkType, el, etc, special, note, speed, etcChance: t.etc ?? 0.55,
    hp: nice(b.hp * k.hp * earlyHpMul(lv, kind) * (t.hp ?? 1)), mp: magic ? nice(lv * 6 + 10) : nice(lv * 2), exp: nice(b.exp * k.exp),
    atk: nice(atk), matk: magic ? nice(atk * 1.1) : 0, def: nice(b.def * k.def), mdef: nice(b.def * k.def * (magic ? 1.3 : 0.8)),
    avoid: Math.round(b.avoid * (kind === 'frail' ? FRAIL_AVOID : 1)), acc: Math.round(lv * 1.4 + 5), meso: nice(b.dropMeso * (kind === 'boss' ? 30 : kind === 'raid' ? 100 : kind === 'elite' ? 6 : 1)),
    maps: [],
  };
});
const MOB = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

// ---------------- マップ
export const MAPS = MAPS_RAW.map(([id, name, type, lv, links, mobs, note]) => ({ id, name, type, lv, links, mobs, note, region: id[0] }));
const MAP = Object.fromEntries(MAPS.map((m) => [m.id, m]));
for (const m of MAPS) {
  for (const l of m.links) {
    if (!MAP[l]) problems.push(`マップ ${m.id} のつながり先 ${l} が無い`);
    else if (!MAP[l].links.includes(m.id)) problems.push(`マップ ${m.id} → ${l} は片道（${l} 側に ${m.id} が無い）`);
  }
  for (const mid of m.mobs) {
    const mob = MOB[mid];
    if (!mob) { problems.push(`マップ ${m.id} の敵 ${mid} が無い`); continue; }
    mob.maps.push(m.id);
    if (m.lv && m.type !== 'ボ' && !['boss', 'raid', 'elite'].includes(mob.kind) && (mob.lv < m.lv[0] - 8 || mob.lv > m.lv[1] + 4)) {
      problems.push(`マップ ${m.id}（Lv${m.lv[0]}〜${m.lv[1]}）に Lv${mob.lv} の ${mob.name} は合わない`);
    }
  }
}
// クエスト専用の敵（quests_more.mjs の QUEST_SPAWNS。そのクエストの間だけ湧く）
for (const [mid, map, quest] of QUEST_SPAWNS) {
  const mob = MOB[mid];
  if (!mob) { problems.push(`クエスト専用の敵 ${mid} が無い`); continue; }
  if (!MAP[map]) { problems.push(`クエスト専用の敵 ${mid} のマップ ${map} が無い`); continue; }
  mob.maps.push(map);
  mob.questOnly = quest;
}
// フィールドボス・季節の敵（data/fun_mobs.mjs。classic-unity の fun.json）
for (const [mid, map] of FIELD_BOSSES) { const mob = MOB[mid]; if (!mob) { problems.push(`フィールドボス ${mid} が無い`); continue; } if (!MAP[map]) problems.push(`フィールドボス ${mid} のマップ ${map} が無い`); else mob.maps.push(map); }
for (const [mid, , maps] of SEASON_MOBS) { const mob = MOB[mid]; if (!mob) { problems.push(`季節の敵 ${mid} が無い`); continue; } for (const map of maps) if (!MAP[map]) problems.push(`季節の敵 ${mid} のマップ ${map} が無い`); else mob.maps.push(map); }
for (const mob of MONSTERS) if (!mob.maps.length) problems.push(`敵 ${mob.id} ${mob.name} がどのマップにも出ない`);
for (const mob of MONSTERS) if (!Number.isInteger(mob.speed) || mob.speed < -50 || mob.speed > 50) problems.push(`敵 ${mob.id} ${mob.name} の速さ ${mob.speed} が -50〜+50 の整数でない`);
// どのマップからも町へ歩いて戻れるか（乗り物を含めず、ポータルだけで町に着くか）
for (const m of MAPS) {
  if (m.type === '町' || m.type === '移' && !m.links.length) continue;
  const seen = new Set([m.id]); const q = [m.id]; let ok = false;
  while (q.length) { const c = q.shift(); if (MAP[c]?.type === '町') { ok = true; break; } for (const n of MAP[c]?.links || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  if (!ok) problems.push(`マップ ${m.id} ${m.name} から町へ歩いて戻れない`);
}

function dropsOf(m) {
  const [hp, mp] = POT(m.lv);
  const big = ['boss', 'raid'].includes(m.kind);
  const sc = scrollsFor(m.id).map((s) => SCROLLS.find((x) => x[0] === s)).map((s) => `${s[1]}${s[2]}の書`);
  const parts = [`${m.etc} ${Math.round(m.etcChance * 100)}%`, `${hp}・${mp} 各 ${Math.round(POT_DROP * 100)}%`, `${ORE(m.lv)} 2%`];
  if (m.lv >= 15) parts.push(`${GEM(m.lv)} 1%`);
  if (m.lv >= 10) parts.push(`装備(Lv${BAND(m.lv) || 10}帯) ${big ? '100%×3 個' : m.kind === 'elite' ? '30%' : '0.8%'}`);
  parts.push(`${sc.join('・')} 60%版 ${big ? '30%' : '0.3%'} / 10%版 ${big ? '10%' : '0.1%'}`);
  if (m.lv >= 40) parts.push(`${m.lv >= 80 ? '大エリクサー' : 'エリクサー'} ${big ? '100%×5' : '0.5%'}`);
  if (big || m.kind === 'elite') parts.push(`呪いの書（30%/70%、種類はランダム）${big ? '20%' : '2%'}`);
  if (m.special) parts.push(`**${m.special}** ${big ? '15%' : m.kind === 'elite' ? '10%' : '0.05%'}`);
  return parts.join('・');
}

function genMonsters() {
  const out = [];
  for (const [code, rname] of REGIONS) {
    const list = MONSTERS.filter((m) => m.maps.some((id) => id[0] === code) && (m.maps[0][0] === code));
    if (!list.length) continue;
    out.push(`\n### ${rname}\n`);
    out.push('| ID | 名前 | Lv | 種類 | HP | MP | 経験値 | 攻撃(物/魔) | 防御(物/魔) | 回避/命中 | お金 | 動き・攻撃 | 速さ | 属性 | 出るマップ |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const m of list) {
      const kindJ = { normal: '通常', tough: '硬い', frail: '柔い', elite: '強敵', boss: 'ボス', raid: '大ボス' }[m.kind];
      out.push(`| ${m.id} | ${m.name} | ${m.lv} | ${kindJ} | ${fmt(m.hp)} | ${fmt(m.mp)} | ${fmt(m.exp)} | ${fmt(m.atk)}/${m.matk ? fmt(m.matk) : '-'} | ${fmt(m.def)}/${fmt(m.mdef)} | ${m.avoid}/${m.acc} | ${fmt(m.meso)} | ${m.move}・${m.atkType} | ${m.move === '止' ? '-' : (m.speed > 0 ? '+' : '') + m.speed} | ${m.el} | ${m.maps.join(' ')}${m.questOnly ? `（${m.questOnly} の間だけ）` : ''} |`);
    }
    out.push('');
    out.push('<details><summary>ドロップと説明</summary>\n');
    for (const m of list) out.push(`- **${m.id} ${m.name}**: ${m.note} ドロップ: ${dropsOf(m)}`);
    out.push('\n</details>');
  }
  return out.join('\n');
}

function genBossTime() {
  const out = ['| ID | ボス | Lv | 種類 | HP | 経験値 | 推奨Lv | 1 人で倒す時間の目安（5 系統の平均） |', '|---|---|---|---|---|---|---|---|'];
  for (const m of MONSTERS.filter((x) => ['boss', 'raid', 'elite'].includes(x.kind))) {
    const lv = m.kind === 'raid' ? m.lv : m.kind === 'boss' ? m.lv - 5 : m.lv - 2;
    const jobs = ['戦士', '魔法使い', '弓使い', '盗賊', '海賊'];
    // ボスは単体技を使う: 狩りの 1 撃 × 1.6、1 秒 1.2 回
    const dps = jobs.map((j) => check(j, Math.max(1, Math.min(200, lv))).avg * 1.6 * 1.2).reduce((a, b) => a + b, 0) / jobs.length;
    const min = m.hp / dps / 60;
    out.push(`| ${m.id} | ${m.name} | ${m.lv} | ${m.kind === 'raid' ? '大ボス' : m.kind === 'boss' ? 'ボス' : '強敵'} | ${fmt(m.hp)} | ${fmt(m.exp)} | ${lv} | 約 ${min < 1 ? '1 分未満' : Math.round(min) + ' 分'} |`);
  }
  return out.join('\n');
}


// ---------------- クエスト
const SIZE = { 小: [0.06, 10], 中: [0.12, 25], 大: [0.25, 60], 特: [0.5, 150] };
export const QUESTS = QUESTS_RAW.map(([id, name, giver, map, lv, pre, goal, size, items, story, ext = {}]) => {
  const [ef, mf] = SIZE[size] || [0, 0];
  if (!SIZE[size]) problems.push(`クエスト ${id} の大きさ ${size} が変`);
  return { id, name, giver, map, lv, pre, goal, size, items, story, ext, exp: Math.max(({ 小: 8, 中: 15, 大: 30, 特: 60 }[size] || 0) * (ext.side ? 0.5 : 1), nice(expToNext(Math.min(lv, 199)) * ef * (ext.side ? SIDE_EXP : 1))), meso: nice(mobBase(lv).meso * mf * (ext.side ? SIDE_MESO : 1)) };
});
const QMAP = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
const QIDS = new Set(QUESTS.map((q) => q.id));
for (const q of QUESTS) if (QUESTS.filter((x) => x.id === q.id).length > 1) problems.push(`クエストの ID ${q.id} が重なっている`);
void QIDS;
function renderGoal(q) {
  // ラベル付きの印（quests_more.mjs の先頭: [[t:..|表示]] [[x:..|表示]] [[g:..|表示]] [[e:..|表示]]）は表示の文だけ
  const g = q.goal.replace(/\[\[(t|x|g|e):([^\]|:]+)(?::(\d+))?\|([^\]]+)\]\]/g, (_, t, ref, n, label) => label);
  return g.replace(/\[\[(k|i|m):([A-Z0-9]+)(?::(\d+))?\]\]/g, (_, t, ref, n) => {
    if (t === 'm') { if (!MAP[ref]) problems.push(`クエスト ${q.id} のマップ ${ref} が無い`); return `${MAP[ref]?.name}（${ref}）`; }
    const m = MOB[ref];
    if (!m) { problems.push(`クエスト ${q.id} の敵 ${ref} が無い`); return ref; }
    if (!['boss', 'raid', 'elite'].includes(m.kind) && m.lv > q.lv + 12) problems.push(`クエスト ${q.id}（Lv${q.lv}）に Lv${m.lv} の ${m.name} は強すぎる`);
    return t === 'k' ? `${m.name}（Lv${m.lv}）を ${n} 匹倒す` : `${m.etc} ×${n}（${m.name}）`;
  });
}
for (const q of QUESTS) {
  if (!MAP[q.map]) problems.push(`クエスト ${q.id} の依頼者のマップ ${q.map} が無い`);
  if (q.pre !== '-') { const p = QMAP[q.pre]; if (!p) problems.push(`クエスト ${q.id} の前提 ${q.pre} が無い`); else if (p.lv > q.lv) problems.push(`クエスト ${q.id}（Lv${q.lv}）の前提 ${q.pre} が Lv${p.lv} で高い`); }
}
const QGROUPS = [
  ['S', '芽吹きの島（チュートリアル）'], ['V', 'ブリーズ港'], ['B', 'ポム丘'], ['W', 'シルワ森都'], ['G', 'ガルド岩台'], ['K', 'クロウ街'], ['N', 'ねむり谷'],
  ['C', 'セレス'], ['F', 'ヒョウガ村'], ['T', 'ティンクル'], ['M', 'マリナ'], ['A', '古の神殿'], ['D', '竜の谷'], ['H', '焔の坑道'], ['E', '星の果て'],
  ['L', '本筋「星の封印」'], ['J', '転職'], ['PET', 'ペット'], ['R', '繰り返し（募集の掲示板）'], ['PQ', '1 人用ダンジョンの受付'],
  ['IS', '芽吹きの島の寄り道'], ['MK', 'にぎわい市場'], ['Y', '町をまたぐ寄り道の連作'], ['X', '冒険の記録（長い目標）'],
];
const groupOf = (id) => id.split('-')[0].replace(/^J\d$/, 'J');
function genQuests() {
  const out = [];
  for (const [g, title] of QGROUPS) {
    const list = QUESTS.filter((q) => groupOf(q.id) === g);
    out.push(`\n### ${g}: ${title}（${list.length} 本）\n`);
    out.push('| ID | 名前 | 依頼者（場所） | Lv | 前提 | 目的 | 報酬 | あらすじ |', '|---|---|---|---|---|---|---|---|');
    for (const q of list) out.push(`| ${q.id} | ${q.name} | ${q.giver}（${q.map}） | ${q.lv} | ${q.pre} | ${renderGoal(q)} | 経験値 ${fmt(q.exp)}・${fmt(q.meso)} ルド${q.items && q.items !== '-' ? '・' + q.items : ''} | ${q.story} |`);
  }
  return out.join('\n');
}
function genQStats() {
  const t = expTable();
  const bands = [[1, 10], [10, 30], [30, 70], [70, 120], [120, 200]];
  const out = ['| Lv 帯 | クエスト数 | 報酬の経験値の合計 | その帯で要る経験値 | 割合 |', '|---|---|---|---|---|'];
  for (const [a, b] of bands) {
    const qs = QUESTS.filter((q) => q.lv >= a && q.lv < b && !q.id.startsWith('R-') && !q.id.startsWith('PQ') && !q.ext.repeat);
    const sum = qs.reduce((x, q) => x + q.exp, 0);
    const need = t.filter((r) => r.lv >= a && r.lv < b).reduce((x, r) => x + r.need, 0);
    out.push(`| ${a}〜${b - 1} | ${qs.length} | ${fmt(sum)} | ${fmt(need)} | ${(sum / need * 100).toFixed(1)}% |`);
  }
  out.push('', `- 合計 **${QUESTS.length} 本**（繰り返し・ダンジョンの受付を除くと ${QUESTS.filter((q) => !q.id.startsWith('R-') && !q.id.startsWith('PQ') && !q.ext.repeat).length} 本）。`);
  out.push('- 割合は「1 回だけのクエスト」の経験値だけ。低い Lv ほどクエストで育つ割合が高く（クラシックの「最初はクエストで町を覚える」流れ）、高 Lv は狩り・ボス・1 人用ダンジョンが中心。繰り返し（毎日 3 本）と 1 人用ダンジョンの報酬で高 Lv も 1〜2 割を足す。');
  return out.join('\n');
}

// 町ごと・Lv 帯ごとの本数（QUESTS.md 8 章）。町は依頼者のいるマップの地域（大陸は町の番号の帯）で分ける
const TOWN_OF = (map) => {
  const r = map[0], n = parseInt(map.slice(1), 10);
  if (r === 'S') return '芽吹きの島';
  if (r === 'V') {
    if (n === 90) return 'にぎわい市場';
    if (n >= 100 && n < 200) return 'ブリーズ港（潮風号を含む）';
    if (n >= 200 && n < 300) return 'ポム丘';
    if (n >= 300 && n < 400) return 'シルワ森都';
    if (n >= 400 && n < 500) return 'ガルド岩台';
    if (n >= 500 && n < 600 || n === 707) return 'クロウ街';
    if (n >= 600 && n < 700) return 'ねむり谷';
    return 'ヴェルデ大陸の道';
  }
  return { C: 'セレス', F: 'ヒョウガ村', T: 'ティンクル', M: 'マリナ', P: '古の神殿', D: '竜の谷', H: '焔の坑道', E: '星の果て' }[r] || r;
};
const BANDS = [[1, 10], [10, 30], [30, 70], [70, 120], [120, 201]];
function genQTowns() {
  const towns = [...new Set(QUESTS.map((q) => TOWN_OF(q.map)))];
  const out = ['| 町 | ' + BANDS.map(([a, b]) => `Lv${a}〜${b - 1}`).join(' | ') + ' | 合計 | うち連作の最後の限定品・隠し・毎日 |', '|---|' + BANDS.map(() => '---|').join('') + '---|---|'];
  for (const t of towns) {
    const qs = QUESTS.filter((q) => TOWN_OF(q.map) === t);
    const cells = BANDS.map(([a, b]) => qs.filter((q) => q.lv >= a && q.lv < b).length || '-');
    const special = QUEST_ITEMS.filter((it) => qs.some((q) => q.id === it[5])).length;
    const hidden = qs.filter((q) => q.ext.hours || q.ext.needItem).length;
    const daily = qs.filter((q) => q.ext.repeat || q.id.startsWith('R-')).length;
    out.push(`| ${t} | ${cells.join(' | ')} | ${qs.length} | ${special}・${hidden}・${daily} |`);
  }
  const tot = BANDS.map(([a, b]) => QUESTS.filter((q) => q.lv >= a && q.lv < b).length);
  out.push(`| **合計** | ${tot.join(' | ')} | **${QUESTS.length}** | ${QUEST_ITEMS.length}・${QUESTS.filter((q) => q.ext.hours || q.ext.needItem).length}・${QUESTS.filter((q) => q.ext.repeat || q.id.startsWith('R-')).length} |`);
  // Lv ごとに「その Lv で受けられる（前提を除く）クエスト」の数の目安
  out.push('', '| Lv | ' + [5, 10, 15, 20, 30, 40, 50, 60, 70, 85, 100, 120, 140, 160, 180, 200].join(' | ') + ' |', '|---|' + Array(16).fill('---|').join(''));
  const near = [5, 10, 15, 20, 30, 40, 50, 60, 70, 85, 100, 120, 140, 160, 180, 200].map((lv) => QUESTS.filter((q) => q.lv <= lv && q.lv > lv - 10).length);
  out.push(`| その Lv の 10 下までに始まる本数 | ${near.join(' | ')} |`);
  return out.join('\n');
}
// 前提無しで Lv だけで受けられる頼みごと（QUESTS.md 8-4）。町ごとの Lv 帯（TOWN_BANDS）の中のどの Lv でも、
// 「その Lv から 10 下までに始まる前提無しの物」が 3 本以上あること。QuestCoverageTests.EveryTownHasQuestsWithoutPrereqs と同じ数え方・同じ帯。
export const TOWN_BANDS = [
  ['芽吹きの島', 3, 10], ['ブリーズ港（潮風号を含む）', 8, 22], ['ポム丘', 9, 30], ['シルワ森都', 10, 35], ['ガルド岩台', 10, 55], ['クロウ街', 14, 40],
  ['ねむり谷', 20, 70], ['にぎわい市場', 10, 40], ['セレス', 28, 65], ['ヒョウガ村', 40, 85], ['ティンクル', 25, 95], ['マリナ', 40, 100],
  ['古の神殿', 85, 120], ['竜の谷', 98, 155], ['焔の坑道', 110, 140], ['星の果て', 150, 200],
];
const FREE_MIN = 3;
// 前提無し・隠しでない・毎日でない・転職/掲示板/ダンジョンの受付/長い目標/本筋でない
const isFree = (q) => q.pre === '-' && !q.ext.hours && !q.ext.needItem && !q.ext.repeat && !/^(J\d|R|PQ|X|L)-/.test(q.id);
const freeAt = (qs, L) => qs.filter((q) => q.lv <= L && q.lv >= L - 10).length;
function genQFree() {
  const added = new Set(ANYTIME.map((r) => r[0]));
  const out = ['| 町 | Lv 帯 | 前提無しの本数（足す前 → 今） | 足した本数 | 帯の中で一番少ない Lv の本数（足す前 → 今） |', '|---|---|---|---|---|'];
  const LVS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
  const grid = ['| 町 | ' + LVS.join(' | ') + ' |', '|---|' + LVS.map(() => '---|').join('')];
  let tb = 0, ta = 0;
  for (const [t, lo, hi] of TOWN_BANDS) {
    const all = QUESTS.filter((q) => TOWN_OF(q.map) === t && isFree(q));
    const before = all.filter((q) => !added.has(q.id));
    let minB = Infinity, minA = Infinity;
    for (let L = lo; L <= hi; L++) {
      minB = Math.min(minB, freeAt(before, L)); minA = Math.min(minA, freeAt(all, L));
      if (freeAt(all, L) < FREE_MIN) problems.push(`${t} の Lv${L} で前提無しで受けられる頼みごとが ${freeAt(all, L)} 本（${FREE_MIN} 本以上）`);
    }
    tb += before.length; ta += all.length;
    out.push(`| ${t} | ${lo}〜${hi} | ${before.length} → ${all.length} | +${all.length - before.length} | ${minB} → ${minA} |`);
    grid.push(`| ${t} | ` + LVS.map((L) => (L < lo || L > hi ? '-' : freeAt(all, L))).join(' | ') + ' |');
  }
  out.push(`| **合計** | | ${tb} → ${ta} | +${ta - tb} | |`);
  return [...out, '', '「その Lv から 10 下までに始まる、前提無しの頼みごと」の本数（町の Lv 帯の中だけ）:', '', ...grid].join('\n');
}

// クエストでしか手に入らない品（ITEMS.md 8 章）
function genQuestItems() {
  const out = ['| 名前 | 種類 | 必要Lv | 能力 | 入手 | 説明 |', '|---|---|---|---|---|---|'];
  for (const [, name, kind, lv, stats, quest, desc] of QUEST_ITEMS) {
    if (!QMAP[quest]) problems.push(`クエストの品 ${name} の入手のクエスト ${quest} が無い`);
    else if (!QMAP[quest].items.includes(name) && !(QUEST_ITEMS.find((x) => x[1] === name)?.[7] || []).some((a) => QMAP[quest].items.includes(a))) problems.push(`クエストの品 ${name} が ${quest} の報酬に無い`);
    out.push(`| ${name} | ${kind} | ${lv || '-'} | ${stats || '-'} | **クエストのみ**（${quest} ${QMAP[quest]?.name || ''}） | ${desc} |`);
  }
  return out.join('\n');
}

// ---------------- マップの表
function genMaps() {
  const out = [];
  for (const [code, rname, desc] of REGIONS) {
    const list = MAPS.filter((m) => m.region === code);
    out.push(`\n### ${code}: ${rname}（${list.length} マップ）\n\n${desc}\n`);
    out.push('| ID | 名前 | 種類 | 推奨Lv | つながり | 出る敵 | 特徴 |');
    out.push('|---|---|---|---|---|---|---|');
    for (const m of list) {
      const mobs = m.mobs.map((id) => `${MOB[id]?.name}(${MOB[id]?.lv})`).join('、') || '-';
      out.push(`| ${m.id} | ${m.name} | ${m.type} | ${m.lv ? m.lv.join('〜') : '-'} | ${m.links.join(' ') || '-'} | ${mobs} | ${m.note || ''} |`);
    }
  }
  return out.join('\n');
}
function genTravel() {
  return ['| 手段 | 区間 | 説明 | 料金(ルド) |', '|---|---|---|---|', ...TRAVEL.map((t) => `| ${t.join(' | ')} |`)].join('\n');
}

// ---------------- 経験値・狩りの速さ
function genExp() {
  const t = expTable();
  const out = ['| Lv | 次まで | 累計 | Lv | 次まで | 累計 | Lv | 次まで | 累計 | Lv | 次まで | 累計 |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (let i = 0; i < 50; i++) {
    const cells = [0, 50, 100, 150].map((o) => t[i + o]).map((r) => `${r.lv} | ${r.lv === 200 ? '-' : fmt(r.need)} | ${fmt(r.total)}`);
    out.push(`| ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}
function genHunt() {
  const rows = huntTable();
  const pick = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 199];
  const out = ['| Lv | 次までの経験値 | 狩る敵の Lv | 1 匹の経験値（1人用補正込み） | 1 人用補正 | 必要な撃破数 | 1 分の撃破数(想定) | この Lv にかかる時間 | Lv1 からの累計 |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows.filter((x) => pick.includes(x.lv))) {
    out.push(`| ${r.lv} | ${fmt(r.need)} | ${r.mobLv} | ${fmt(r.expPerKill)} | ×${soloMul(r.mobLv).toFixed(2)} | ${fmt(r.kills)} | ${killsPerMin(r.lv)} | ${r.min < 60 ? Math.round(r.min) + ' 分' : (r.min / 60).toFixed(1) + ' 時間'} | ${r.totalH.toFixed(1)} 時間 |`);
  }
  return out.join('\n');
}
// 命中の目安（STATS.md 2-3）: 近接職（戦士・海賊）の振り方ごとに、ふつうの敵（回避は curves.mjs）に当たる率。装備・スキルの命中は入れない
function genHit() {
  const builds = [['DEX 4（振らない）', () => 4], ['DEX Lv÷3+4', (lv) => Math.round(lv / 3 + 4)], ['DEX Lv×0.55+4', (lv) => Math.round(lv * 0.55 + 4)]];
  const diffs = [-5, 0, 5, 10];
  const out = ['| Lv | 振り方 | 命中 | 敵 Lv−5 | 同じ Lv | 敵 Lv+5 | 敵 Lv+10 |', '|---|---|---|---|---|---|---|'];
  for (const lv of [10, 30, 50, 70, 120, 160, 200]) {
    for (const [name, dex] of builds) {
      const acc = playerAcc({ lv, dex: dex(lv), luk: 4 });
      const cells = diffs.map((d) => { const ml = Math.max(1, lv + d); return Math.round(100 * hitChance(acc, Math.round(mobBase(ml).avoid), lv, ml)) + '%'; });
      out.push(`| ${lv} | ${name} | ${Math.round(acc)} | ${cells.join(' | ')} |`);
    }
  }
  return out.join('\n');
}
function genBalance() {
  const out = ['| Lv | 戦士 撃破/分 | 魔法使い | 弓使い | 盗賊 | 海賊 | 想定 | 戦士 耐える回数 | 魔法使い | 弓使い | 盗賊 | 海賊 |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const lv of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 199]) {
    const r = ['戦士', '魔法使い', '弓使い', '盗賊', '海賊'].map((j) => check(j, lv));
    out.push(`| ${lv} | ${r.map((x) => x.kpm).join(' | ')} | ${r[0].want} | ${r.map((x) => x.survive).join(' | ')} |`);
  }
  return out.join('\n');
}

// ---------------- 装備
function genEquips() {
  const out = [];
  out.push('\n### 初心者の装備（全職）\n');
  out.push('| 部位 | 名前 | 必要Lv | 性能 | 強化回数 | 値段 |', '|---|---|---|---|---|---|');
  for (const s of STARTER) out.push(`| ${s[0]} | ${s[1]} | ${s[2]} | ${s[3]} | ${s[4]} | ${s[5] ? fmt(s[5]) : '初期装備'} |`);
  const W = weaponList();
  const A = armorList();
  const X = extraList();
  for (const job of ['戦士', '魔法使い', '弓使い', '盗賊', '海賊']) {
    out.push(`\n### ${job}の武器\n`);
    out.push('| 種類 | 名前 | 必要Lv | 必要 | 攻撃力 | 魔力 | 速さ | おまけ | 強化 | 値段 | 備考 |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const w of W.filter((x) => x.job === job)) out.push(`| ${w.type} | ${w.name} | ${w.lv} | ${w.req} | ${w.watk} | ${w.matk || '-'} | ${w.speed} | ${w.bonus || '-'} | ${w.upg} | ${w.price ? fmt(w.price) : '売らない'} | ${w.note || ''} |`);
    out.push(`\n### ${job}の防具\n`);
    out.push('| 部位 | 名前 | 必要Lv | 必要 | 防御 | 魔防 | おまけ | 強化 | 値段 |', '|---|---|---|---|---|---|---|---|---|');
    for (const a of [...A, ...X].filter((x) => x.job === job).sort((p, q) => p.lv - q.lv)) out.push(`| ${a.slot} | ${a.name} | ${a.lv} | ${a.req} | ${a.def} | ${a.mdef} | ${a.bonus || '-'} | ${a.upg} | ${fmt(a.price)} |`);
  }
  out.push('\n### 共通（マント・耳飾り）\n');
  out.push('| 部位 | 名前 | 必要Lv | 防御 | 魔防 | おまけ | 強化 | 値段 |', '|---|---|---|---|---|---|---|---|');
  for (const a of X.filter((x) => x.job === '共通')) out.push(`| ${a.slot} | ${a.name} | ${a.lv} | ${a.def} | ${a.mdef} | ${a.bonus} | ${a.upg} | ${fmt(a.price)} |`);
  return out.join('\n');
}
function genScrolls() {
  const out = ['| ID | 部位 | 上がるもの | 10%（と 30%） | 60%（と 70%） | 100% | 落とす敵（例） |', '|---|---|---|---|---|---|---|'];
  for (const s of SCROLLS) {
    const who = MONSTERS.filter((m) => scrollsFor(m.id).includes(s[0])).map((m) => `${m.name}(${m.lv})`);
    out.push(`| ${s[0]} | ${s[1]} | ${s[2]} | ${s[3]} | ${s[4]} | ${s[5] || '無し'} | ${who.slice(0, 5).join('、') || '市場・クエスト'}${who.length > 5 ? ` ほか ${who.length - 5}` : ''} |`);
  }
  return out.join('\n');
}

// ---------------- 書き込み
const counts = {
  maps: MAPS.length, monsters: MONSTERS.length,
  equips: STARTER.length + weaponList().length + armorList().length + extraList().length, scrolls: SCROLLS.length, quests: QUESTS.length,
};
function genCounts() {
  return `- クエスト: ${counts.quests}\n- マップ: ${counts.maps}\n- 敵: ${counts.monsters}（うちボス・大ボス・強敵 ${MONSTERS.filter((m) => ['boss', 'raid', 'elite'].includes(m.kind)).length}）\n- 装備: ${counts.equips}\n- 書の種類: ${counts.scrolls}（× 成功率 5 種 = ${counts.scrolls * 5 - SCROLLS.filter((s) => !s[5]).length} 品）`;
}

const BLOCKS = {
  'MONSTERS.md': { monsters: genMonsters, bosstime: genBossTime },
  'WORLD.md': { maps: genMaps, travel: genTravel },
  'STATS.md': { exp: genExp, hit: genHit, hunt: genHunt, balance: genBalance },
  'ITEMS.md': { equips: genEquips, scrolls: genScrolls, questitems: genQuestItems },
  'DESIGN.md': { counts: genCounts },
  'QUESTS.md': { quests: genQuests, qstats: genQStats, qtowns: genQTowns, qfree: genQFree },
};

let drift = 0;
for (const [file, blocks] of Object.entries(BLOCKS)) {
  const p = path.join(DOCS, file);
  if (!fs.existsSync(p)) { problems.push(`${file} が無い`); continue; }
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  for (const [key, fn] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- GEN:${key} -->)[\\s\\S]*?(<!-- /GEN:${key} -->)`);
    if (!re.test(s)) { problems.push(`${file} に GEN:${key} の印が無い`); continue; }
    const body = fn();
    s = s.replace(re, (_, a, b) => `${a}\n${body}\n${b}`);
  }
  if (s !== before) { drift++; if (!CHECK_ONLY) fs.writeFileSync(p, s); }
}

console.log(`クエスト ${counts.quests} / マップ ${counts.maps} / 敵 ${counts.monsters} / 装備 ${counts.equips} / 書 ${counts.scrolls}`);
if (problems.length) { console.log(`問題 ${problems.length} 件:`); for (const x of problems) console.log(' - ' + x); }
else console.log('つじつまの検査: 問題なし');
if (CHECK_ONLY && drift) console.log(`表が古いファイル: ${drift}`);
process.exit(problems.length || (CHECK_ONLY && drift) ? 1 : 0);
