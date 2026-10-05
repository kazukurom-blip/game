// 主人公6人（3クラス×♂♀）の「立ち絵」と「頭」を画像生成AIに頼むための指示文を書き出す。
//   node tools/gen_hero_prompts.mjs  → docs/art_handoff/HERO_PROMPTS.md, docs/art_handoff/manifest_heroes_example.json
import { writeFileSync } from 'node:fs';
import { CLASSES, CLASS_IDS, DEFAULT_LOOKS, defaultName } from '../src/data/classes.js';

const PERSONA = {
  luna_f: '明るく強気、八重歯がチャームポイントのストリートアイドル風。ネコミミの髪飾り、ピンクのパーカー',
  luna_m: '人なつっこく軽いノリの少年。キャップを後ろ向きにかぶる、ピンクのパーカーとジーンズ',
  jin_f: '姉御肌でクール、少し目つきが鋭い。銀髪ポニーテールにティールのメッシュ、黒の革ジャン',
  jin_m: '無口でクールな不良少年。銀髪のウルフカットにティールのメッシュ、黒の革ジャン、少し半目',
  hacker_f: 'ダウナーで知的、ヘッドホンをしたハッカー少女。緑のボブ、黒地に緑ネオンラインのパーカー',
  hacker_m: '自信家で皮肉屋のハッカー少年。緑のツンツン頭、ヘッドホン、黒地に緑ネオンラインの服',
};
const HAIR = { twin: 'ツインテール', short: 'ショート', ponytail: 'ポニーテール', wolf: 'ウルフカット', bob: 'ボブ', spiky: 'ツンツンヘア' };
const STYLE = 'ちびアニメ調（ゲーム中は2.5頭身）、太めの濃い紫(#2A1430)の輪郭線、セル塗り2段＋ツヤのハイライト、大きく潤んだ瞳（ハイライト2〜3個）、かわいい・かっこいい';
const WORLD = 'ネオン×夕焼けの架空のリゾート都市「ヴァイス・ベイ」のストリート系。全年齢向け、既存のゲームやキャラクターに似せない';
const BG = '背景は完全な透明（無理なら単色の白）、文字・影・地面・枠なし、1人だけ';

const PORTRAIT_EXPR = { '': '基本（自信のある笑み）', smile: '満面の笑顔', angry: '怒り・やる気', surprised: '驚き', sad: 'しょんぼり', shout: '叫び（技を放つ瞬間）' };
const HEAD_EXPR = { '': '基本', blink: '目を閉じた（まばたき）', hurt: '痛がる「> <」の目', shout: '口を大きく開けた叫び', happy: '「^ ^」の笑顔' };

const out = ['# 主人公の画像生成AI用の指示文（立ち絵・頭）', '',
  '置き方は README の「主人公の立ち絵・頭」を参照。**同じキャラは、最初に作った立ち絵を参考画像として毎回添付**し、「この子と同じキャラクターで」と伝えると絵柄と顔がそろいます。', '',
  '参考画像: `ref_heroes.png` / `ref_faces.png` / `ref_palette.png` の該当キャラ部分。', ''];
const man = { portraits: {}, heads: {} };

for (const c of CLASS_IDS) for (const g of ['f', 'm']) {
  const key = `${c}_${g}`;
  const L = DEFAULT_LOOKS[c][g];
  const name = defaultName ? defaultName(c, g) : key;
  const sex = g === 'f' ? '女の子' : '男の子';
  const colors = `髪 ${L.hairColor}${L.mesh ? `（メッシュ ${L.mesh}）` : ''}、瞳 ${L.eyeColor}、肌 ${L.skin}、ネオンの縁取り光 ${L.rim}`;
  const base = [
    `キャラクター：${name}（${sex}、クラス「${CLASSES[c].name}」＝${CLASSES[c].role}）`,
    `性格・見た目：${PERSONA[key]}。髪型は${HAIR[L.hair] || L.hair}`,
    `色：${colors}`,
    `画風：${STYLE}`,
    `世界観：${WORLD}`,
  ];
  out.push(`## ${name}（${key}）`, '');
  out.push('### ① 立ち絵（まず基本を1枚作り、それを参考に表情違いを作る）', '');
  const ex = {};
  for (const [e, desc] of Object.entries(PORTRAIT_EXPR)) {
    const file = `portraits/${key}${e ? '_' + e : ''}.png`;
    if (e) ex[e] = file;
    out.push(`- 保存先 \`assets/sprites/${file}\` — 表情：${desc}`, '', '```',
      'ゲームの会話画面とカットインに使うキャラクターの立ち絵を1枚作ってください。', ...base,
      `表情：${desc}`, '構図：腰から上〜全身、体はやや右向き（斜め前）、顔ははっきり見える大きさ',
      `条件：${BG}`, 'サイズ：縦長 1024×1536', e ? '※添付の基本の立ち絵と同じキャラクター・同じ服で、表情だけ変えてください' : '', '```', '');
  }
  man.portraits[key] = { file: `portraits/${key}.png`, expr: ex };
  out.push('### ② 頭（ゲーム中の小さいキャラの頭に使う）', '');
  const hx = {};
  for (const [e, desc] of Object.entries(HEAD_EXPR)) {
    const file = `heads/${key}${e ? '_' + e : ''}.png`;
    if (e) hx[e] = file;
    out.push(`- 保存先 \`assets/sprites/${file}\` — 表情：${desc}`, '', '```',
      'ゲーム中の小さいキャラクター（ちび）に使う「頭だけ」の画像を1枚作ってください。', ...base,
      `表情：${desc}`, '構図：首から上だけ（顔と髪。首は短く切る）、右向きの斜め前（3/4）、ちびキャラ用に顔は丸く大きく、目は特に大きく',
      '注意：帽子・ヘッドホン・髪飾りは描かない（ゲーム側で重ねる）。ただしネコミミの髪飾りなど髪型の一部はOK',
      `条件：${BG}`, 'サイズ：正方形 1024×1024、頭が画面の8割程度', '※添付の立ち絵と同じキャラクターの顔と髪で', '```', '');
  }
  man.heads[key] = { file: `heads/${key}.png`, expr: hx };
}
writeFileSync('docs/art_handoff/HERO_PROMPTS.md', out.filter((l) => l !== '').join('\n').replace(/\n(##|- 保存先|```\n)/g, '\n\n$1'));
writeFileSync('docs/art_handoff/manifest_heroes_example.json', JSON.stringify(man, null, 2));
console.log('HERO_PROMPTS: 6 キャラ × (立ち絵6 + 頭5)');
