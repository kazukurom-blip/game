#!/usr/bin/env node
// 主人公のパーツ式（着せ替え人形）の指示書と一覧を生成する
//   node tools/gen_rig_guide.mjs        （npm run export:rig の最後にも実行）
// 出力: docs/art_handoff/HERO_PARTS_GUIDE.md（描く人・画像生成AI向けの説明＋1枚ごとの指示文）
//       docs/art_handoff/HERO_PARTS_LIST.csv（一覧。Excel 用に BOM 付き UTF-8）
// 使う枠は docs/art_handoff/rig/parts.json（tools/export_rig_templates.mjs が書き出す）。無ければ既定の枠。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIG_BASE, RIG_PARTS, RIG_GROUP_PARTS, RIG_ACC_PARTS, RIG_SKIN_BASE } from '../src/render/rigLayout.js';
import { ITEMS, STARTER_EQUIP, starterEquipFor } from '../src/data/items.js';
import { CLASSES } from '../src/data/classes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'art_handoff');
let USED = null;
try { USED = JSON.parse(fs.readFileSync(path.join(DOC, 'rig', 'parts.json'), 'utf8')); } catch { /* 既定 */ }

const SLOT_JA = { body: '素体', top: '上着', bottom: '下', shoes: '靴', hat: '帽子', accessory: 'アクセサリ', weapon: '武器', tear: '服破れ' };
const G_JA = { f: '♀', m: '♂' };
const G_BODY = { f: '女の子の体型（小顔・細い首・くびれ・脚長め）', m: '男の子の体型（肩幅が広い・胸板・がっしり）' };
const DESC = {
  hat: {
    catEars: 'ネコミミのカチューシャ（三角の耳が2つ、耳の内側はアクセント色）', headphones: 'ヘッドホン（頭の上を通るバンドと、耳あて。片側にマイク付きでも可）',
    cap: 'キャップ（つばが右＝前向き、正面にワッペン）', beanie: 'ニット帽（ビーニー。折り返しのリブとてっぺんのポンポン）', bandana: 'バンダナ（頭に巻き、後ろで結んだ端が2本）',
    cowboy: 'カウボーイハット（広いつば・帽子の帯）', helmet: 'バイクのヘルメット（右＝前にバイザー）', crown: '王冠（頭の上に少し傾けて乗せる、宝石付き）',
  },
  top: {
    hoodie: 'パーカー（長袖・前にひも・お腹のポケット。フードは首の後ろ＝背中の枠）', leatherJacket: '革ジャン（長袖・ジッパー・襟）', tshirt: 'Tシャツ（半袖・丸首・胸にハートのロゴ）',
    tank: 'タンクトップ（袖なし）', hawaiian: 'アロハシャツ（半袖・開襟・花柄）', tracksuit: 'ジャージの上着（長袖・ジッパー・袖に2本線）',
    police: '警官の制服シャツ（半袖・胸のバッジ・ベルト）', suit: 'スーツのジャケット（長袖・ネクタイ・白いシャツの襟）',
    idolDress: 'アイドルのステージドレス（パフスリーブ・フリルの裾が腰から広がる）', armorVest: 'タクティカルベスト（防弾ベスト。下に半袖の黒いインナー）',
  },
  bottom: {
    skirt: 'プリーツスカート（下に黒いスパッツ。脚の枠にはスパッツの太もも部分）', trackPants: 'ジョガーパンツ（長ズボン・側面にライン・裾がしぼってある）',
    jeans: 'ジーンズ（長ズボン・裾の折り返し）', shorts: '短パン（ひざ上まで）', cargo: 'カーゴパンツ（長ズボン・太ももにポケット）',
    suitPants: 'スーツのズボン（長ズボン・細身）', armorPants: 'タクティカルパンツ（長ズボン・ひざ当て）',
  },
  shoes: {
    sneakers: 'スニーカー（白い靴底・ひも）', boots: 'エンジニアブーツ（足首より上まで・ベルト）', sandals: 'ビーチサンダル（素足が見える・鼻緒）',
    loafers: 'ローファー（革靴・甲に飾り）', heels: 'ヒール（パンプス・細いかかと）',
  },
  accessory: {
    sunglasses: 'サングラス（顔の目の位置。頭の枠）', scarf: 'スカーフ（首元に巻いた部分＝胴の枠、背中になびく端＝背中の枠）', goldChain: '金のチェーンネックレス（首元〜胸。胴の枠）',
    mask: 'スカルのフェイスマスク（口元〜あごを覆う。頭の枠）', wings: '天使の翼（背中の小さな白い翼2枚。背中の枠）', halo: '天使の輪（頭の上に浮く光る輪。頭の枠）',
  },
  weapon: {
    knife: 'ポケットナイフ（短い刃・持ち手）', bat: '木製バット（持ち手にグリップテープ）', staff: '杖型のデバイス（長い柄、先に光る六角形のコアと爪）',
    pistol: 'ピストル（銃口が右。握りは下へ）', katana: '刀（つか・つば・反った刃）', smg: 'サブマシンガン（銃口が右。握りとマガジンが下へ）',
    guitar: 'エレキギター（ネックを握って振る。ボディは右＝先の方）', neonSword: 'ネオンソード（持ち手と、光る刃）',
  },
};
const PART_JA = Object.fromEntries(Object.entries(RIG_PARTS).map(([k, v]) => [k, v.short]));
const PART_WHAT = {
  head: '頭の上に重ねる物だけ（頭そのものは描かない）', back: '体の後ろに出る物', torso: '首〜腰（スカート・ドレスの裾も）',
  armB: '奥側の腕（まっすぐ下ろした形・肩が上の十字）', armF: '手前の腕（まっすぐ下ろした形・肩が上の十字）',
  legB: '奥側の脚（まっすぐ下ろした形・股が上の十字）', legF: '手前の脚（まっすぐ下ろした形・股が上の十字）',
  footB: '奥側の足（右向きの横から見た靴・足首が十字）', footF: '手前の足（右向きの横から見た靴・足首が十字）',
};

// ---------------------------------------------------------------- 一覧（優先度）
const S_KEYS = new Set([
  'body_f', 'body_m',
  'hat/catEars_f', 'hat/cap_m', 'hat/headphones_f', 'hat/headphones_m',
  'top/hoodie_f', 'top/hoodie_m', 'top/hoodie__1d2b24_f', 'top/hoodie__1d2b24_m', 'top/leatherJacket_f', 'top/leatherJacket_m',
  'bottom/skirt_f', 'bottom/jeans_f', 'bottom/jeans_m', 'bottom/trackPants_f', 'bottom/trackPants_m',
  'shoes/sneakers_f', 'shoes/sneakers_m', 'shoes/boots_f', 'shoes/boots_m',
  'weapon/knife', 'weapon/bat', 'weapon/staff',
]);
// 確認: S が初期装備を網羅しているか
for (const c of Object.keys(CLASSES)) for (const g of ['f', 'm']) {
  const eq = starterEquipFor(c, g);
  for (const [slot, id] of Object.entries(eq)) {
    if (!id || slot === 'pet') continue;
    const it = ITEMS[id];
    const st = it.look.style;
    const k = slot === 'weapon' ? `weapon/${st}` : `${slot}/${st}_${g}`;
    const kv = `${slot}/${st}__${it.look.color.slice(1).toLowerCase()}_${g}`;
    if (!S_KEYS.has(k) && !S_KEYS.has(kv)) console.warn(`  注意: 初期装備 ${c}_${g} ${id} (${k}) が S にありません`);
  }
}
void STARTER_EQUIP;
const minReq = {};
const itemsOf = {};
for (const it of Object.values(ITEMS)) {
  if (!it || !it.look || !it.slot || it.slot === 'pet' || typeof it.look !== 'object') continue;
  const k = it.slot + '/' + it.look.style;
  minReq[k] = Math.min(minReq[k] ?? 999, it.reqLevel || 0);
  (itemsOf[k] = itemsOf[k] || []).push(it);
}
const DEFAULT_A = new Set(['top/tshirt', 'bottom/shorts']);   // 何も装備していない時の服（いつも見える）
function prio(key, slot, style) {
  if (S_KEYS.has(key)) return 'S';
  if (slot === 'tear') return 'B';
  const k = slot + '/' + style;
  if (DEFAULT_A.has(k)) return 'A';
  return (minReq[k] ?? 999) <= 20 ? 'A' : 'B';
}
function usedParts(slot, style, g) {
  if (slot === 'body') return (USED && USED.body && USED.body[g]) || RIG_GROUP_PARTS.body;
  if (slot === 'tear') return RIG_GROUP_PARTS.tear;
  if (USED && USED[slot] && USED[slot][style] && USED[slot][style][g]) return USED[slot][style][g];
  if (slot === 'accessory') return RIG_ACC_PARTS[style] || [];
  return RIG_GROUP_PARTS[slot];
}
const rows = [];
const add = (o) => rows.push(o);
for (const g of ['f', 'm']) add({ key: `body_${g}`, slot: 'body', style: 'body', g, colors: [RIG_SKIN_BASE[g]] });
for (const slot of ['top', 'bottom', 'shoes', 'hat', 'accessory']) {
  for (const style of Object.keys(RIG_BASE[slot])) {
    for (const g of ['f', 'm']) add({ key: `${slot}/${style}_${g}`, slot, style, g, colors: RIG_BASE[slot][style] });
  }
}
for (const g of ['f', 'm']) add({ key: `top/hoodie__1d2b24_${g}`, slot: 'top', style: 'hoodie', g, colors: ['#1d2b24', '#3dff8a'], variant: 'サイバーパーカー（ハッカーの初期装備の色違い専用）' });
for (const style of Object.keys(RIG_BASE.weapon)) add({ key: `weapon/${style}`, slot: 'weapon', style, g: null, colors: RIG_BASE.weapon[style] });
for (const n of [1, 2, 3]) for (const g of ['f', 'm']) add({ key: `tear/${n}_${g}`, slot: 'tear', style: String(n), g, colors: ['#3a3346'] });
for (const r of rows) {
  r.prio = prio(r.key, r.slot, r.style);
  r.file = `assets/sprites/rig/${r.key}.png`;
  r.tpl = r.slot === 'body' ? `rig/templates/body/body_${r.g}.png` : r.slot === 'weapon' ? `rig/templates/weapon/${r.style}.png` : r.slot === 'tear' ? `rig/templates/tear/${r.style}_${r.g}.png` : `rig/templates/${r.slot}/${r.style}_${r.g}.png`;
  r.parts = r.slot === 'weapon' ? [] : usedParts(r.slot, r.style, r.g);
  const its = itemsOf[r.slot + '/' + r.style] || [];
  r.items = its.map((i) => i.name).join('・');
  r.title = r.slot === 'body' ? `素体（${G_JA[r.g]}）` : r.slot === 'tear' ? `服破れ ${r.style}（${G_JA[r.g]}）` : `${SLOT_JA[r.slot]}：${r.variant || (DESC[r.slot][r.style] || r.style).split('（')[0]}${r.g ? `（${G_JA[r.g]}）` : ''}`;
}
const order = { S: 0, A: 1, B: 2 };
rows.sort((a, b) => order[a.prio] - order[b.prio]);
const count = (p) => rows.filter((r) => r.prio === p).length;
const total = rows.length;

// ---------------------------------------------------------------- 指示文
const STYLE = '画風：ちびアニメ調（ゲーム中は2.5頭身・高さ約80px）、太めの濃い紫（#2A1430）の輪郭線、セル塗り2段＋ツヤのハイライト、かわいい・かっこいい。世界観はネオン×夕焼けのリゾート都市のストリート系。';
const COMMON = [
  '画像は添付1と同じ 1024×1024（正方形）。添付1の「青い点線の枠」の位置と大きさをそのまま守り、枠の中の薄い下絵を、同じ位置・同じ大きさで描き直してください。',
  '使わない枠・枠の外には何も描かない。青い点線の枠・桃色の十字・文字・灰色の参考シルエットは描かない（完成画像には残さない）。',
  '腕と脚は「まっすぐ下に下ろした形」のまま（曲げない。ゲームが関節で曲げます）。各パーツは離ればなれのままにする（つなげない）。',
  '向きは右向き（体はやや右を向いた斜め前）。背景は真っ白（#FFFFFF）か透明。影・地面・枠線なし。',
  '全年齢向け。既存のゲームやキャラクターに似せない。',
];
function prompt(r) {
  const L = [];
  if (r.slot === 'weapon') {
    L.push('ゲームのキャラクターが手に持つ武器の画像を1枚描いてください（着せ替えパーツ）。添付1は配置図の下絵です。');
    L.push(`描くもの：${DESC.weapon[r.style]}。`);
    L.push(`色：主色 ${r.colors[0]}、アクセント ${r.colors[1]}（主色はこの色ちょうどで。陰影は同じ色の濃淡）。`);
    L.push('画像は添付1と同じ 1024×512（横長）。武器は右向きに水平（刃・銃口が右）。握る所（手で持つ所）を桃色の十字の位置に、大きさは薄い下絵と同じに。');
    L.push('（できれば）握る所の真ん中にマゼンタ（#FF00FF）の小さな丸（直径10px程度）を1つ描く。ゲームが持ち手の位置として使って消します。武器の他の部分にマゼンタは使わない。');
    L.push('手・腕・キャラクターは描かない（武器だけ）。青い点線の枠・十字・文字は描かない。背景は真っ白（#FFFFFF）か透明。影なし。');
    L.push(STYLE);
    L.push('全年齢向け。実在の銃・製品に似せない。');
    return L.join('\n');
  }
  if (r.slot === 'body') {
    L.push(`ゲームのキャラクター（主人公）の着せ替え人形の「素体」を描いてください。添付1は配置図の下絵（${G_JA[r.g]}）です。`);
    L.push(`描くもの：${G_BODY[r.g]}の素体。服の下に着るインナー（濃い紫グレーのタンクトップ #3A3346 と、ひざ上の黒いスパッツ #2A2633）を着た状態。足には濃いグレーのシンプルな室内靴（#5B5266）。`);
    L.push(`描く枠：${r.parts.map((n) => `${PART_JA[n]}（${PART_WHAT[n]}）`).join('、')}。`);
    L.push(`肌の色：${r.colors[0]}（この色ちょうどで。陰影は同じ肌色の濃淡）。奥側の腕・脚は少し暗めの肌色に。手は軽く握ったグー。首は胴の枠の上の方に短く。`);
    L.push('頭は描かない（頭の枠は空のまま。頭は別の絵を使います）。');
  } else if (r.slot === 'tear') {
    L.push(`ゲームのキャラクターの「服破れ」の重ね絵を描いてください（体力が減ると服の上に重ねて表示）。添付1は配置図の下絵（${G_JA[r.g]}）です。`);
    L.push(`描くもの：段階 ${r.style}（${['軽い：すり傷・汚れ', '中：小さな破れ穴・すす', '重い：大きな破れ・穴・すす'][+r.style - 1]}）。破れ穴の中はインナーの色（#3A3346）で、縁はギザギザ。服そのもの・肌は描かない（穴・傷・すすだけ）。`);
    L.push(`描く枠：${r.parts.map((n) => PART_JA[n]).join('、')}（下絵の穴の位置を目安に）。`);
    L.push('全年齢の表現：肌は見せない（穴の中は必ずインナー）。');
  } else {
    L.push(`ゲームのキャラクター（主人公）の着せ替えパーツを1枚描いてください。添付1は配置図の下絵（${G_JA[r.g]}用）です。`);
    L.push(`描くもの：${r.variant ? r.variant + '：' : ''}${DESC[r.slot][r.style]}。${G_BODY[r.g]}に合う形。`);
    L.push(`描く枠：${r.parts.map((n) => `${PART_JA[n]}（${PART_WHAT[n]}）`).join('、')}。`);
    L.push(`色：主色 ${r.colors[0]}、アクセント ${r.colors[1]}（主色はこの色ちょうどで塗る。陰影は同じ色の濃淡。ゲームが色違いを自動で作ります）。`);
    if (r.slot === 'hat' || r.slot === 'accessory') L.push('頭・顔・髪は描かない（薄い灰色の頭は位置の目安。帽子・アクセサリだけ）。');
    else if (r.slot === 'shoes') L.push('靴だけを描く（脚は描かない）。右向きの横から見た形、かかとが左・つま先が右。');
    else L.push('服だけを描く（肌・頭・手は描かない）。腕の枠には袖だけ、脚の枠にはズボンの脚だけ。素体（添付2）の上に重ねてぴったり合う形と位置に。');
  }
  L.push(STYLE);
  for (const c of COMMON) L.push(c);
  if (r.slot !== 'body') L.push('※添付2（素体）と同じ絵柄・同じ線の太さで。');
  return L.join('\n');
}
function attach(r) {
  const A = [`添付1: docs/art_handoff/${r.tpl}`];
  if (r.slot === 'body') A.push('（あれば）添付2: 頭の絵 assets/sprites/heads/<クラス>_' + r.g + '.png（絵柄・肌の色をそろえる）');
  else if (r.slot === 'weapon') A.push('添付2: 最初に作った素体 assets/sprites/rig/body_f.png（絵柄をそろえる）');
  else A.push(`添付2: 最初に作った素体 assets/sprites/rig/body_${r.g}.png（絵柄・体の位置をそろえる）`);
  return A;
}

// ---------------------------------------------------------------- CSV
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = [['優先度', '保存ファイル名', '種類', 'スタイル', '性別', '内容', '描く枠', '基準色(主)', '基準色(アクセント)', '使うアイテム', '添付する画像', 'AIへの指示文']];
for (const r of rows) csv.push([r.prio, r.file, SLOT_JA[r.slot], r.style, r.g ? G_JA[r.g] : '共通', r.title, r.parts.map((n) => PART_JA[n]).join('・') || '武器の枠', r.colors[0] || '', r.colors[1] || '', r.items, attach(r).join(' / '), prompt(r)]);
fs.writeFileSync(path.join(DOC, 'HERO_PARTS_LIST.csv'), '﻿' + csv.map((row) => row.map(esc).join(',')).join('\r\n') + '\r\n');

// ---------------------------------------------------------------- MD
const md = [];
const P = (s = '') => md.push(s);
P('# 主人公のパーツ式（着せ替え人形）— 描く人・画像生成AI向けの指示書');
P();
P('> 自動生成: `node tools/gen_rig_guide.mjs`（`npm run export:rig` で配置図・下絵と一緒に作り直し）。一覧は [`HERO_PARTS_LIST.csv`](HERO_PARTS_LIST.csv)。エンジニア向けの仕様は `docs/SPEC_SPRITES.md` の「リグ（パーツ式）」。');
P();
P('敵・ボス・PET は画像生成AIの1枚絵になりました。主人公だけはコードで描いた絵のままなので、**「素体」「服（装備の種類ごと）」「武器（種類ごと）」をAIに描いてもらい、ゲームがそれを着せ替え人形のように組み立てて動かします**。頭は今ある「頭の絵（heads）」をそのまま使います（無ければコードの頭）。');
P();
P(`**作る枚数: 全 ${total} 枚**（S＝最優先 ${count('S')} 枚 / A＝人気の装備 ${count('A')} 枚 / B＝残り ${count('B')} 枚）。S だけ作れば、3クラス×♀♂の初期装備の主人公が全部AIの絵になります。足りない装備は、その装備だけ今のコードの絵で代わりに表示されます（**一部だけ作ってもゲームは動きます**）。`);
P();
P('## 1. しくみ');
P();
P('### 1-1. 配置図（全部の絵の共通の型紙）');
P('どの絵も **1024×1024 の同じ配置図** の上に描きます。配置図には体のパーツごとの **枠**（青い点線）と、パーツを回す **支点**（桃色の十字）があります。');
P();
P('| ♀の配置図 | ♂の配置図 |');
P('|---|---|');
P('| ![配置図♀](rig/layout_f.png) | ![配置図♂](rig/layout_m.png) |');
P();
P('| 枠 | 何を描く | 支点（十字） | ゲームでの動き |');
P('|---|---|---|---|');
const MOVE = { head: '首の位置・頭の傾きに合わせて重ねる', back: '胴と一緒に傾く（体の後ろ）', torso: '腰を中心に傾く・上下に弾む', armB: '肩で回る・肘で曲がる', armF: '肩で回る・肘で曲がる', legB: '股で回る・膝で曲がる', legF: '股で回る・膝で曲がる', footB: '足首で回る', footF: '足首で回る' };
const PIV = { head: '頭の中心', back: '腰（胴と同じ）', torso: '腰（おへその少し下）', armB: '肩', armF: '肩', legB: '股（脚の付け根）', legF: '股（脚の付け根）', footB: '足首', footF: '足首' };
for (const [k, v] of Object.entries(RIG_PARTS)) P(`| ${v.short} | ${PART_WHAT[k]} | ${PIV[k]} | ${MOVE[k]} |`);
P();
P('- **腕と脚は「まっすぐ下ろした形」で描く**。肘・膝はゲームが絵を関節の位置で2つに分けて曲げます（歩く・走る・攻撃・座る・倒れる・はしごを登る、の動きは全部ゲームが付けます）。');
P('- パーツどうしは離して描く（枠の中だけ）。枠から少しはみ出たり、少し大きさ・位置がずれても、ゲームが「枠の中の絵の範囲」を自動で見つけて、下絵の位置と大きさに合わせます（±20% 程度まで）。');
P('- 背景は **透明** か **真っ白などの単色**（四隅の色を自動で透明にします）。');
P('- 頭の枠: 素体や服のシートでは空。帽子・メガネ・マスク・天使の輪のシートだけ、頭の上に重ねる物を描きます（灰色の頭は位置の目安。頭の絵 heads と同じ大きさ・位置）。');
P();
P('### 1-2. 1アイテム＝1枚の「パーツシート」');
P('例: パーカーのシートには「背中（フード）・胴・後ろの腕（袖）・手前の腕（袖）」の枠に描きます。描かない枠は空のまま。各アイテムには、そのアイテムの今のコードの絵を枠に分けて薄く描いた **下絵** があるので、AIにはそれを添付して「この下絵を描き直して」と頼みます。');
P();
P('| 下絵の例（パーカー♀） | 武器の配置図 |');
P('|---|---|');
P('| ![下絵の例](rig/templates/top/hoodie_f.png) | ![武器の配置図](rig/layout_weapon.png) |');
P();
P('- **素体**（`body_f` / `body_m`）: 肌と、インナー（濃い紫グレーのタンクトップとスパッツ）と室内靴。何も着ていない時と、服の下の肌（半袖の腕・短パンの脚など）に使います。**素体が無いと、リグは使われません**（今まで通りのコードの絵）。');
P('- **服**: 素体の上に重ねます（素体 → 下 → 靴 → 上着 → アクセサリ → 破れ の順）。靴は素体の足と入れ替わります。');
P('- **武器**（性別共通）: 右向きに水平に描き、握る所を十字に合わせます。ゲームが手の位置に持たせて、攻撃の動きに合わせて回します。武器の上に手前の手をもう一度重ねる（握っている見た目）ので、手は描きません。');
P('- 何も装備していない時は、今のゲームと同じく白いTシャツと青い短パンを着ます（`top/tshirt`・`bottom/shorts` の絵を使う。無ければコードの絵）。');
P();
P('### 1-3. 色（色違いは自動）');
P('同じスタイルの色違い（例: ピンクのパーカーと黒っぽい緑のサイバーパーカー）は、**スタイルごとに1枚だけ** 描けばよく、ゲームが「描いた基準色 → アイテムの色」に **色相を回して彩度・明るさを合わせます**（陰影・線・白いハイライト・他の色の部分は残します）。');
P('- 各シートの **基準色（主色・アクセント）ちょうどで塗る**のがコツ（下の各項目・CSV に書いてあります）。基準色はそのスタイルの初期装備の色なので、初期装備は描いた絵のまま表示されます。');
P('- 主色のまわりの色（色相 ±40° くらい）が主色として、アクセント（はっきりした色のときだけ）がアクセントとして変わります。白・黒・灰色・肌色など、主色から遠い色は変わりません。');
P('- 色違いをきれいに見せたい物は **専用の絵** も置けます: `<スロット>/<スタイル>__<色の6桁>_<性別>.png`（例 `top/hoodie__1d2b24_f.png`。武器は `weapon/katana__d8283c.png`）。その色のアイテムでは、色替えより専用の絵が優先されます。');
P('- 素体の肌は、キャラ作成で選んだ肌の色に同じ方法で合わせます（基準 ♀ `' + RIG_SKIN_BASE.f + '` / ♂ `' + RIG_SKIN_BASE.m + '`）。※頭の絵（heads）は色を変えません。');
P();
P('## 2. 作るもの一覧');
P();
P('| 優先度 | 枚数 | 内容 |');
P('|---|---|---|');
P(`| **S** | ${count('S')} | 素体♀♂、3クラス×♀♂の初期装備（ルナ: ネコミミ/キャップ・ピンクのパーカー・スカート/ジーンズ・スニーカー・ナイフ、ジン: 革ジャン・ジーンズ・ブーツ・バット、ハッカー: ヘッドホン・サイバーパーカー（色違い専用）・ジョガーパンツ・スニーカー・杖） |`);
P(`| **A** | ${count('A')} | 何も着ていない時の白Tシャツ・短パン、Lv20 までに手に入る装備（序盤の店・ドロップ）、序盤の武器（ピストル・刀・SMG・ギター） |`);
P(`| **B** | ${count('B')} | 残りの装備（中盤以降のレア装備）、ネオンソード、服破れの重ね（任意。無ければコードの破れ） |`);
P(`| 合計 | ${total} | ♀♂で体型が違うので、服は♀用と♂用を別に描きます（武器は共通） |`);
P();
P('| 優先度 | 保存ファイル名（`assets/sprites/` の下） | 内容 | 描く枠 | 基準色 |');
P('|---|---|---|---|---|');
for (const r of rows) P(`| ${r.prio} | \`${r.file.replace('assets/sprites/', '')}\` | ${r.title} | ${r.parts.map((n) => PART_JA[n]).join('・') || '武器'} | ${r.colors.filter(Boolean).map((c) => '`' + c + '`').join(' / ')} |`);
P();
P('## 3. 作業の流れ');
P();
P('1. **素体♀** を作る（添付1: `rig/templates/body/body_f.png`、あれば頭の絵も添付して絵柄と肌の色をそろえる）。気に入るまで作り直す（これが全部の絵柄の基準になります）。');
P('2. **素体♂** を作る（添付2に素体♀を付けて「同じ絵柄で」）。');
P('3. S の服・武器を作る。**毎回、添付2に最初の素体を付けます**（絵柄・線の太さ・体の位置がそろう）。');
P('4. できた PNG を `assets/sprites/rig/` の下に、一覧の「保存ファイル名」で置く（フォルダ `top/` `bottom/` `shoes/` `hat/` `accessory/` `weapon/` `tear/`）。');
P('5. `npm run rig:manifest` を実行（置いたファイルを `assets/sprites/manifest.json` の `"rig"` に自動で書き込む）。手で書く場合は次の形:');
P('   ```json');
P('   "rig": { "enabled": true, "parts": ["body_f", "body_m", "top/hoodie_f", "weapon/knife"] }');
P('   ```');
P('   基準色と違う色で描いてしまった時は `"parts": { "top/hoodie_f": { "base": "#ff5aa0" } }` のように、実際に塗った色を書くと色替えが合います。位置合わせを止めるなら `"fit": false`、色替えを止めるなら `"recolor": false`。');
P('6. 確認（§6）。');
P();
P('## 4. 絵柄をそろえるコツ');
P();
P('- **最初に作った素体を、毎回「添付2」として付ける**。「添付2と同じ絵柄・同じ線の太さで」と書く（指示文に入っています）。');
P('- 頭の絵（`assets/sprites/heads/<クラス>_<性別>.png`）がある場合は、素体を作る時に添付して「この頭に合う体で」と頼むと、線・塗り・肌の色が頭とそろいます。');
P('- AIが枠を無視して1人のキャラを描いてしまう時は、画像編集（下絵の上に描き直し）モードを使うか、「添付1の画像をそのまま下敷きにして、各枠の中の薄い絵だけを塗り直して」と強めに頼む。');
P('- 1枚目がうまくいった指示文を、同じ会話の中で「次は○○を同じやり方で」と続けると安定します。');
P('- 線の色は濃い紫（#2A1430）でそろえる（色替えで線の色が変わらないように、線は主色と違う色に）。');
P('- 基準色は「ちょうどその色」で塗る。違う色で塗ると、色違いの色が少しずれます（その時は manifest に `base` を書く）。');
P();
P('## 5. 全年齢の線引き');
P();
P('- 素体は **インナー（タンクトップ・ひざ上のスパッツ）を着た状態**（スポーツウェアのイメージ）。肌を出しすぎない。下着・水着のような描き方はしない。');
P('- 服破れは **穴の中が必ずインナー**（肌は見せない）。血・傷口は描かない（すり傷・すす・汚れまで）。');
P('- 武器は架空のデザイン（実在の銃・製品に似せない）。');
P();
P('## 6. 確認方法');
P();
P('1. 置いて `npm run rig:manifest` → ブラウザでゲームを開く（`npm run serve` → http://localhost:8080 、公開ページなら再公開）。');
P('2. 主人公が新しい絵で動く。**F2**（デバッグパネル）の「見た目: スプライト / コード描画」ボタンで、今のコードの絵と切り替えて見比べられる。パネルの `rig` の行に読み込んだ枚数・失敗・代用（コードの絵で代わりに出している装備の数）が出ます。');
P('3. よくある失敗:');
P('   - **何も変わらない** → 素体（`body_f`/`body_m`）が無い・名前が違う・manifest に無い（`npm run rig:manifest`）。主人公だけに使われます（敵・NPC・市民には使われません）。');
P('   - **パーツがずれる・小さい/大きい** → 枠の位置を守っていない。下絵を添付し直して描き直す。少しのずれは自動で直ります。');
P('   - **背景が残る** → 背景を真っ白（または透明）にする。四隅が同じ色でないと透明にできません。');
P('   - **色違いの色が変** → 基準色ちょうどで塗っていない（manifest の `base` に実際の色）、または色違い専用の絵を置く。');
P('   - **関節に隙間** → 腕・脚が曲がっていたり、肩・股の十字から離れている。まっすぐ下ろした形で、上の端を十字に合わせる。');
P();
P('## 7. 1枚ごとの指示（コピペ用）');
P();
P('各項目の「添付」の画像を付けて、指示文をそのままAIに貼り付けます。');
P();
let cur = '';
for (const r of rows) {
  if (r.prio !== cur) { cur = r.prio; P(`### 優先度 ${cur}`); P(); }
  P(`#### ${r.prio}｜${r.title} → \`${r.file}\``);
  P();
  if (r.slot !== 'weapon') P(`- 描く枠: ${r.parts.map((n) => PART_JA[n]).join('・')}（他の枠は空）`);
  P(`- 基準色: ${r.colors.filter(Boolean).map((c) => '`' + c + '`').join(' / ')}${r.items ? `　使うアイテム: ${r.items}` : ''}`);
  P(`- 添付: ${attach(r).join(' ／ ')}`);
  P();
  P('```');
  P(prompt(r));
  P('```');
  P();
}
fs.writeFileSync(path.join(DOC, 'HERO_PARTS_GUIDE.md'), md.join('\n'));
console.log(`指示書: docs/art_handoff/HERO_PARTS_GUIDE.md / HERO_PARTS_LIST.csv（${total} 枚: S ${count('S')} / A ${count('A')} / B ${count('B')}）`);
