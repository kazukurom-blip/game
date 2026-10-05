// 画像生成AIに「1枚絵」を頼むための指示文を、全モンスター・ボス・PET分まとめて書き出す。
//   node tools/gen_ai_prompts.mjs
// 出力: docs/art_handoff/AI_PROMPTS.csv（Excel 用・BOM付き）, docs/art_handoff/AI_PROMPTS.md, docs/art_handoff/manifest_single_example.json
import { writeFileSync } from 'node:fs';
import { ENEMIES } from '../src/data/enemies.js';
import { ITEMS, PET_IDS } from '../src/data/items.js';

const HUMAN_ARTS = new Set(['thug', 'cop', 'swat', 'bossDon', 'civilian']); // 人型はコード描画（重ね合わせ式）なので対象外
const REGION = {
  beach: '夕焼けのビーチ', downtown: 'ネオンのダウンタウン', slums: '港のスラム', swamp: '霧のワニ沼',
  casino: '金と紫のカジノ街', rooftop: '摩天楼の屋上', spaceport: '宇宙港',
};
const ART = {
  slime: 'ぷるぷるのゼリー状スライム（サングラスがトレードマーク）', mushroom: 'パラソルのような傘を持つキノコ', flamingo: 'フラミンゴ',
  gator: 'ワニ', drone: '小型ドローン', crab: 'カニ', jellyfish: 'クラゲ', seagull: 'カモメ', rat: 'ネズミ', snake: 'ヘビ',
  mosquito: '巨大な蚊', ghost: 'カジノチップの亡霊', robot: 'ロボット', alien: 'エイリアン', golem: 'ゴーレム',
  bossGator: '王冠とサングラスと葉巻のボスワニ', bossAlien: 'UFOに乗ったエイリアンの女王',
};
const STYLE = 'ちびアニメ調、太めの濃い紫(#2A1430)の輪郭線、セル塗り2段＋ツヤのハイライト、大きく表情豊かな目、かわいい・かっこいい';
const COMMON = '全身1体だけ、右向き（真横〜斜め前）、背景は完全な透明（無理なら単色の白）、文字・影・地面・枠は入れない、全年齢向け、既存のゲームやキャラクターに似せない';

const rows = [];
const manifest = { version: 1, defaults: { scale: 0.5, fps: 8 }, enemies: {}, bosses: {}, pets: {} };

for (const id of Object.keys(ENEMIES)) {
  const d = ENEMIES[id];
  if (!d || HUMAN_ARTS.has(d.art) || d.civilian || d.isCop) continue;
  const boss = !!d.boss;
  const sec = boss ? 'bosses' : 'enemies';
  const file = `${sec}/${id}.png`;
  const kind = ART[d.art] || d.art;
  const colors = [d.color && d.color !== '#ffffff' ? `主色 ${d.color}` : '', d.accent ? `差し色 ${d.accent}` : ''].filter(Boolean).join('、');
  const prompt = [
    `2Dアクションゲーム用の${boss ? 'ボス' : 'モンスター'}の画像を1枚作ってください。`,
    `名前：${d.name}（Lv${d.level}、${REGION[d.region] || d.region}に出る${kind}）`,
    d.lore ? `設定：${d.lore}` : '',
    `画風：${STYLE}${boss ? '、ボスらしい迫力と豪華な装飾' : ''}`,
    `世界観：ネオン×夕焼けの架空のリゾート都市「ヴァイス・ベイ」`,
    colors ? `色：${colors}` : '',
    `条件：${COMMON}`,
    `サイズ：正方形 ${boss ? '1536×1536' : '1024×1024'}、キャラが画面の8割程度`,
    boss ? '※できれば同じ構図で「第2形態」（怒って赤く光る・ダメージを受けた姿）も別画像で' : '',
  ].filter(Boolean).join('\n');
  rows.push({ type: boss ? 'ボス' : 'モンスター', id, name: d.name, region: d.region, level: d.level, file, prompt, size: boss ? 1536 : 1024 });
  manifest[sec][id] = boss ? { file, single: true, file2: `${sec}/${id}_2.png` } : file;
}
for (const pid of PET_IDS) {
  const it = ITEMS[pid];
  const style = it.look?.style;
  if (!style) continue;
  const file = `pets/${style}.png`;
  const prompt = [
    '2Dゲーム用のペット（マスコット）の画像を1枚作ってください。',
    `名前：${(it.name || '').replace(/^ペット[:：]\s*/, '')}`,
    it.desc ? `設定：${it.desc}` : '',
    `画風：${STYLE}、超レアなペットらしく思わず欲しくなる愛らしさ、キラキラした目`,
    `色：主色 ${it.look.color}${it.look.accent ? `、差し色 ${it.look.accent}` : ''}`,
    `条件：${COMMON}`,
    'サイズ：正方形 512×512、キャラが画面の8割程度',
  ].filter(Boolean).join('\n');
  rows.push({ type: 'PET', id: style, name: it.name, region: '', level: '', file, prompt, size: 512 });
  manifest.pets[style] = file;
}

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = ['種類,ID,名前,地域,Lv,保存するファイル名（assets/sprites/ の下）,推奨サイズ,AIへの指示文']
  .concat(rows.map((r) => [r.type, r.id, r.name, r.region, r.level, r.file, r.size, r.prompt].map(esc).join(',')));
writeFileSync('docs/art_handoff/AI_PROMPTS.csv', '﻿' + csv.join('\r\n'));

const md = [
  '# 画像生成AI用の指示文（1枚絵モード）',
  '',
  `全 ${rows.length} 件（モンスター ${rows.filter((r) => r.type === 'モンスター').length}・ボス ${rows.filter((r) => r.type === 'ボス').length}・PET ${rows.filter((r) => r.type === 'PET').length}）。`,
  '使い方は [README.md の「1枚絵モード」](README.md#1枚絵モード画像生成ai向け) を参照。参考画像は `ref_enemies_<地域>.png` / `ref_bosses.png` / `ref_pets.png` の該当部分を一緒に渡す。',
  '',
  ...rows.map((r) => `## ${r.type}：${r.name}（${r.id}）\n保存先: \`assets/sprites/${r.file}\`\n\n\`\`\`\n${r.prompt}\n\`\`\`\n`),
].join('\n');
writeFileSync('docs/art_handoff/AI_PROMPTS.md', md);
writeFileSync('docs/art_handoff/manifest_single_example.json', JSON.stringify(manifest, null, 2));
console.log(`AI_PROMPTS: ${rows.length} 件`);
