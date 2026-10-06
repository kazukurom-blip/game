// Dots への依頼の一覧（docs/art_handoff/dots/DOTS_LIST.csv）を、今のゲームのデータと絵のファイルから作る。
//   node tools/gen_dots_request.mjs
// 段: P 見本 / A スキルアイコン / B キャラ（素体・顔・髪・服・武器）/ C 装備のアイコン / D ネタ装備（専用の絵）
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, COSMETIC_IDS } from '../src/data/items.js';
import * as JS from '../src/data/jobSkills.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SP = path.join(root, 'assets', 'sprites');
const ls = (d) => (fs.existsSync(path.join(SP, d)) ? fs.readdirSync(path.join(SP, d)).filter((f) => f.endsWith('.png')).sort() : []);
const rows = [];
const add = (stage, file, size, what, ref, note = '') => rows.push([stage, file, size, what, ref, note]);

// ---- P 見本（最初にこれだけ。合格したら残りへ）
add('P', 'pilot/style_A.png ・ style_B.png ・ style_C.png', '1024×1024', 'ルナ♀の全身（初期装備）を、絵柄の候補 3 つで 1 枚ずつ', 'DOTS_REQUEST.md §3', '同じポーズ・同じ服で、塗りと線だけを変える。ユーザーが 1 つ選ぶ');
add('P', 'rig/body_f.png ほか 見本一式', '型紙どおり', '選ばれた絵柄で、ルナ♀を1人分（素体・顔 f_01＋表情4・髪 f_twin＋後ろ髪・初期の服3点・武器1つ）', 'DOTS_REQUEST.md §3', 'ゲームに入れて動きを確認してから、B 段の残りへ進む');

// ---- A スキルアイコン（絵が無いもの）
const have = new Set(ls('icons/skill').map((f) => f.replace('.png', '')));
const all = Object.values(JS).flatMap((v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])).flat().filter((s) => s && s.id && s.name);
const seen = new Set();
const COLOR = { lj_gun: '#ff3d7f', lj_dance: '#19f0ff', jj_fight: '#ff8a00', jj_race: '#7b5cff', hn: '#3dff8a', hd: '#ffb000' };
const colorOf = (id) => COLOR[Object.keys(COLOR).find((k) => id.startsWith(k + '_'))] || '#888888';
const SYMBOL = {
  lj_gun_gatling_waltz: '二丁拳銃と、ワルツの音符の形に並んだ3発の弾',
  lj_dance_prism_rush: '七色の残像が重なった、斜めの斬撃の線（8本）',
  jj_fight_hundred_fist: 'ネオンの残光を引く、たくさん重なった拳',
  hn_data_sprite: '0と1でできた小さな精霊（丸い光の体に小さな羽）',
  hn_glitch_cat: '輪郭がずれて見える電子の猫の顔と、小さな稲妻',
  hn_phantom_daemon: '幽霊のようなデーモンの顔と、まっすぐの光線',
  hn_oracle_eye: '大きな電脳の眼と、周りの同心円の波動',
  hd_attack_drone: '小さな攻撃ドローン（4つのプロペラ）と2発の光弾',
  hd_sentry_turret: '三脚の自動砲台と照準の円',
  hd_bomber_drone: '爆弾を下げたドローンと、下の爆発',
};
const batch05 = fs.readFileSync(path.join(root, 'docs/art_handoff/CODEX_BATCH_05_JOB5.md'), 'utf8');
for (const s of all) {
  if (seen.has(s.id) || have.has(s.id)) continue;
  seen.add(s.id);
  const m = new RegExp('`icons/skill/' + s.id + '\\.png` \\| [^|]+\\|[^|]+\\|[^|]+\\| ([^|]+) \\|').exec(batch05);
  const sym = SYMBOL[s.id] || (m ? m[1].trim() : '');
  add('A', `icons/skill/${s.id}.png`, '256×256', `${s.name}（${(s.desc || '').replace(/\s+/g, ' ').slice(0, 70)}）`, 'DOTS_REQUEST.md §5', `中央の記号: ${sym} ／ 地の色: ${colorOf(s.id)}`);
}

// ---- B キャラ（今ある絵を全部、新しい絵柄で描き直す）
for (const f of ls('rig')) add('B', `rig/${f}`, '1024×1024', '素体', 'HERO_PARTS_GUIDE.md（型紙・枠） ', '型紙 docs/art_handoff/rig/templates/body/');
for (const f of ls('heads/face')) add('B', `heads/face/${f}`, '1024×1024', /_(blink|hurt|shout|happy)\.png$/.test(f) ? '顔の表情' : '顔', 'FACE_HAIR_SPEC.md', '頭の形は全部の顔で同じ（f_01 / m_01 を下敷き）');
for (const f of ls('heads/hair')) add('B', `heads/hair/${f}`, '1024×1024', f.includes('_back') ? '後ろ髪' : '前髪', 'FACE_HAIR_SPEC.md', '基準色で塗る（髪の色はゲームが塗り替える）');
for (const slot of ['top', 'bottom', 'shoes', 'hat', 'accessory', 'weapon']) {
  for (const f of ls('rig/' + slot)) {
    if (f.includes('__')) continue; // 色違いの専用の絵（D 段と同じ扱い）は除く
    add('B', `rig/${slot}/${f}`, slot === 'weapon' ? '1024×512' : '1024×1024', `服・装備（${slot}）`, 'HERO_PARTS_GUIDE.md（その装備の行の指示文）', slot === 'weapon' ? '武器の型紙 rig/layout_weapon.png' : '素体に重ねてずれないこと');
  }
}
// ---- C 装備のアイコン（キャラの絵柄に合わせて描き直す）
for (const f of ls('icons/equip')) add('C', `icons/equip/${f}`, '256×256', '装備のアイコン', 'CODEX_BATCH_03.md「装備のアイコン」', 'B 段の同じ装備の絵と形・色をそろえる（基準色で塗る）');

// ---- D ネタ装備（専用の絵。色替えしない。そのアイテムの色で描く）
const hex = (c) => c.replace('#', '').toLowerCase();
for (const id of COSMETIC_IDS) {
  const it = ITEMS[id];
  const L = it.look;
  const desc = (it.desc || '').replace(/\s+/g, ' ');
  if (it.slot === 'weapon') add('D', `rig/weapon/${L.style}__${hex(L.color)}.png`, '1024×512', `${it.name}（武器・手に持った形）: ${desc}`, 'HERO_PARTS_GUIDE.md の weapon/' + L.style + ' の型紙', `形は「${it.name}」そのもの。持つ位置（支点）は ${L.style} と同じ`);
  else for (const g of ['f', 'm']) add('D', `rig/${it.slot}/${L.style}__${hex(L.color)}_${g}.png`, '1024×1024', `${it.name}（${g === 'f' ? '♀' : '♂'}が着た形）: ${desc}`, `HERO_PARTS_GUIDE.md の ${it.slot}/${L.style}_${g} の型紙`, `枠は ${L.style} と同じ。形は「${it.name}」そのもの`);
  add('D', `icons/equip/${id}.png`, '256×256', `${it.name}のアイコン`, 'CODEX_BATCH_03.md「装備のアイコン」', '色替えしないので、そのアイテムの色で描く');
}

const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
const out = ['段,保存先（assets/sprites/ の下）,大きさ,内容,見る指示書,注意', ...rows.map((r) => r.map(q).join(','))].join('\n');
fs.writeFileSync(path.join(root, 'docs/art_handoff/dots/DOTS_LIST.csv'), '﻿' + out + '\n');
const cnt = {};
for (const r of rows) cnt[r[0]] = (cnt[r[0]] || 0) + 1;
console.log(JSON.stringify(cnt));
