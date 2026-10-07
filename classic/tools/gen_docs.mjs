// 設計書の表を作り直す道具。元データ（data/*.mjs）と式（lib/*.mjs）から、
// docs/*.md の <!-- GEN:名前 --> 〜 <!-- /GEN:名前 --> の間を書き換える。あわせてつじつまを検査する。
// 実行: node classic/tools/gen_docs.mjs        （書き換え＋検査）
//       node classic/tools/gen_docs.mjs --check （検査だけ。表がずれていたら 1 で終わる）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expTable, mobBase, KIND_MUL, soloMul, nice } from './lib/curves.mjs';
import { MONSTERS_RAW } from './data/monsters.mjs';
import { MAPS_RAW, REGIONS, TRAVEL } from './data/maps.mjs';
import { armorList, extraList, weaponList, STARTER } from './data/equips.mjs';
import { SCROLLS, scrollsFor } from './data/scrolls.mjs';
import { huntTable, killsPerMin } from './hunt_speed.mjs';
import { QUESTS_RAW } from './data/quests.mjs';
import { expToNext } from './lib/curves.mjs';
import { check } from './balance_check.mjs';

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
  const magic = atkType.includes('魔');
  return {
    id, name, lv, kind, move, atkType, el, etc, special, note, speed,
    hp: nice(b.hp * k.hp), mp: magic ? nice(lv * 6 + 10) : nice(lv * 2), exp: nice(b.exp * k.exp),
    atk: nice(b.atk * k.atk), matk: magic ? nice(b.atk * k.atk * 1.1) : 0, def: nice(b.def * k.def), mdef: nice(b.def * k.def * (magic ? 1.3 : 0.8)),
    avoid: Math.round(b.avoid * (kind === 'frail' ? 1.5 : 1)), acc: Math.round(lv * 1.4 + 5), meso: nice(b.meso * (kind === 'boss' ? 30 : kind === 'raid' ? 100 : kind === 'elite' ? 6 : 1)),
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
  const parts = [`${m.etc} 55%`, `${hp}・${mp} 各 4%`, `${ORE(m.lv)} 2%`];
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
      out.push(`| ${m.id} | ${m.name} | ${m.lv} | ${kindJ} | ${fmt(m.hp)} | ${fmt(m.mp)} | ${fmt(m.exp)} | ${fmt(m.atk)}/${m.matk ? fmt(m.matk) : '-'} | ${fmt(m.def)}/${fmt(m.mdef)} | ${m.avoid}/${m.acc} | ${fmt(m.meso)} | ${m.move}・${m.atkType} | ${m.move === '止' ? '-' : (m.speed > 0 ? '+' : '') + m.speed} | ${m.el} | ${m.maps.join(' ')} |`);
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
export const QUESTS = QUESTS_RAW.map(([id, name, giver, map, lv, pre, goal, size, items, story]) => {
  const [ef, mf] = SIZE[size] || [0, 0];
  if (!SIZE[size]) problems.push(`クエスト ${id} の大きさ ${size} が変`);
  return { id, name, giver, map, lv, pre, goal, size, items, story, exp: Math.max({ 小: 8, 中: 15, 大: 30, 特: 60 }[size] || 0, nice(expToNext(Math.min(lv, 199)) * ef)), meso: nice(mobBase(lv).meso * mf) };
});
const QMAP = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
function renderGoal(q) {
  return q.goal.replace(/\[\[(k|i|m):([A-Z0-9]+)(?::(\d+))?\]\]/g, (_, t, ref, n) => {
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
    const qs = QUESTS.filter((q) => q.lv >= a && q.lv < b && !q.id.startsWith('R-') && !q.id.startsWith('PQ'));
    const sum = qs.reduce((x, q) => x + q.exp, 0);
    const need = t.filter((r) => r.lv >= a && r.lv < b).reduce((x, r) => x + r.need, 0);
    out.push(`| ${a}〜${b - 1} | ${qs.length} | ${fmt(sum)} | ${fmt(need)} | ${(sum / need * 100).toFixed(1)}% |`);
  }
  out.push('', `- 合計 **${QUESTS.length} 本**（繰り返し・ダンジョンの受付を除くと ${QUESTS.filter((q) => !q.id.startsWith('R-') && !q.id.startsWith('PQ')).length} 本）。`);
  out.push('- 割合は「1 回だけのクエスト」の経験値だけ。低い Lv ほどクエストで育つ割合が高く（クラシックの「最初はクエストで町を覚える」流れ）、高 Lv は狩り・ボス・1 人用ダンジョンが中心。繰り返し（毎日 3 本）と 1 人用ダンジョンの報酬で高 Lv も 1〜2 割を足す。');
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
  'STATS.md': { exp: genExp, hunt: genHunt, balance: genBalance },
  'ITEMS.md': { equips: genEquips, scrolls: genScrolls },
  'DESIGN.md': { counts: genCounts },
  'QUESTS.md': { quests: genQuests, qstats: genQStats },
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
