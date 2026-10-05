// 主人公6人（3クラス×♂♀）の「立ち絵」と「頭（前の頭・後ろ髪）」を画像生成AIに頼むための指示文を書き出す。
//   node tools/gen_hero_prompts.mjs  → docs/art_handoff/HERO_PROMPTS.md, docs/art_handoff/manifest_heroes_example.json
//   頭は頭の配置図（docs/art_handoff/rig/layout_head.png、src/render/rigLayout.js の HEAD_*）に描く。見本 style/luna_f_reference.png を毎回添付。
import { writeFileSync } from 'node:fs';
import { CLASSES, CLASS_IDS, DEFAULT_LOOKS, defaultName } from '../src/data/classes.js';
import { HEAD_PX, HEAD_PY, HEAD_S, HEAD_GUIDE } from '../src/render/rigLayout.js';

const PERSONA = {
  luna_f: '明るく強気、八重歯がチャームポイントのストリートアイドル風。ネコミミのカチューシャ（立ち絵だけ。頭の絵には描かない）、ピンクのパーカー',
  luna_m: '人なつっこく軽いノリの少年。キャップを後ろ向きにかぶる、ピンクのパーカーとジーンズ',
  jin_f: '姉御肌でクール、少し目つきが鋭い。銀髪ポニーテールにティールのメッシュ、黒の革ジャン',
  jin_m: '無口でクールな不良少年。銀髪のウルフカットにティールのメッシュ、黒の革ジャン、少し半目',
  hacker_f: 'ダウナーで知的、ヘッドホンをしたハッカー少女。緑のボブ、黒地に緑ネオンラインのパーカー',
  hacker_m: '自信家で皮肉屋のハッカー少年。緑のツンツン頭、ヘッドホン、黒地に緑ネオンラインの服',
};
const HAIR = { twin: 'ツインテール', short: 'ショート', ponytail: 'ポニーテール', wolf: 'ウルフカット', bob: 'ボブ', spiky: 'ツンツンヘア' };
// 後ろ髪の絵に描くもの（髪型ごと）
const BACK_HAIR = {
  twin: 'ツインテール2本（頭の左右の高い位置で結び、ふんわり広がって毛先は腰の線くらいまで。体とほぼ同じ幅まで広がってよい）と、後頭部の髪',
  ponytail: '後頭部の高い位置で結んだポニーテール（毛先は背中の中ほど〜腰の線くらいまで）と、後頭部の髪',
  wolf: '襟足の長い毛束（首の後ろ〜肩の線まで、毛先は外はね）と、後頭部の髪',
  bob: '後頭部のボブの髪（首の付け根〜肩の線の少し上まで、毛先は内巻き）',
  spiky: '後頭部の髪（短いツンツン。首の付け根まで）',
  short: '後頭部の髪（短め。首の付け根まで）',
};
const STYLE = '見本（style/luna_f_reference.png）と同じちびアニメ調（頭が背丈の約4割）、太めの濃い紫(#2A1430)の輪郭線、セル塗り2段＋ツヤのハイライト、大きく潤んだ瞳（ハイライト2〜3個）、かわいい・かっこいい';
const REF = '見本（添付 style/luna_f_reference.png）は絵柄と品質の基準です（正面寄り・腕を曲げたポーズの見本ですが、向き・構図はこの指示の指定どおりに）。';
const G = HEAD_GUIDE, hy = (v) => HEAD_PY + v * HEAD_S;
const HEAD_POS = `位置と大きさ：添付の頭の配置図（rig/layout_head.png）と同じ 1024×1024 に、同じ位置・大きさで描く。頭の中心を十字 (${HEAD_PX}, ${HEAD_PY}) に、頭頂（髪の上端）を y=${hy(G.top)} の線、目の高さを y≈${hy(G.eye)}、顎を y=${hy(G.chin)} の線に合わせる（顔の幅は約 ${30 * HEAD_S}〜${36 * HEAD_S}px）。アホ毛は頭頂の線より上にはみ出してよい`;
const NO_ITEMS = '描かない物：ネコミミ・鈴・リボンの髪飾り・帽子・ヘッドホン（ゲームが装備として上に重ねます。見本のネコミミ・鈴も描かない）';
const WORLD = 'ネオン×夕焼けの架空のリゾート都市「ヴァイス・ベイ」のストリート系。全年齢向け、既存のゲームやキャラクターに似せない';
const BG = '背景は完全な透明（無理なら単色の白）、文字・影・地面・枠なし、1人だけ';

const PORTRAIT_EXPR = { '': '基本（自信のある笑み）', smile: '満面の笑顔', angry: '怒り・やる気', surprised: '驚き', sad: 'しょんぼり', shout: '叫び（技を放つ瞬間）' };
const HEAD_EXPR = { '': '基本', blink: '目を閉じた（まばたき）', hurt: '痛がる「> <」の目', shout: '口を大きく開けた叫び', happy: '「^ ^」の笑顔' };

const out = ['# 主人公の画像生成AI用の指示文（立ち絵・頭）', '',
  '置き方は README の「主人公の立ち絵・頭」を参照。**毎回、見本 `style/luna_f_reference.png` を「絵柄と品質の基準」として添付**します（見本は正面寄り・腕を曲げたポーズなので、向き・構図は各指示文の指定どおりに）。同じキャラは、最初に作った立ち絵も参考画像として添付し、「この子と同じキャラクターで」と伝えると絵柄と顔がそろいます。', '',
  `頭は **「② 前の頭」（顔・前髪・頭頂の髪。表情5枚）と「③ 後ろ髪」（ツインテール・後ろの髪。1枚）** に分けて、頭の配置図 \`rig/layout_head.png\`（1024×1024、1単位 = ${HEAD_S}px、頭の中心 = (${HEAD_PX}, ${HEAD_PY})、頭頂 y=${hy(G.top)}・目 y≈${hy(G.eye)}・顎 y=${hy(G.chin)}）に描きます。キャラ別の下絵は \`rig/templates/head/<キー>.png\` / \`<キー>_back.png\`。ゲームは前の頭を胴の上、後ろ髪を体の後ろに置き、後ろ髪は歩き・ジャンプで少し遅れて揺らします。`, '',
  '参考画像: `style/luna_f_reference.png`（見本・毎回）、`ref_heroes.png` / `ref_faces.png` / `ref_palette.png` の該当キャラ部分。', ''];
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
      `表情：${desc}`, '構図：腰から上〜全身、体はやや右向き（斜め前）、顔ははっきり見える大きさ', REF,
      `条件：${BG}`, 'サイズ：縦長 1024×1536', e ? '※添付の基本の立ち絵と同じキャラクター・同じ服で、表情だけ変えてください' : '', '```', '');
  }
  man.portraits[key] = { file: `portraits/${key}.png`, expr: ex };
  out.push('### ② 前の頭（顔・前髪・頭頂の髪。ゲーム中の小さいキャラの頭）', '');
  const hx = {};
  for (const [e, desc] of Object.entries(HEAD_EXPR)) {
    const file = `heads/${key}${e ? '_' + e : ''}.png`;
    if (e) hx[e] = file;
    out.push(`- 保存先 \`assets/sprites/${file}\` — 表情：${desc}`, `- 添付：① \`rig/templates/head/${key}.png\`（頭の配置図の下絵） ② \`style/luna_f_reference.png\`（見本） ③ このキャラの立ち絵${e ? ' ④ 基本の前の頭' : ''}`, '', '```',
      'ゲーム中の小さいキャラクター（ちび）に使う「前の頭」の画像を1枚作ってください（後ろ髪は別の画像に描きます）。', ...base,
      `表情：${desc}`,
      '描くもの：顔・前髪・頭頂の髪・耳の横の短い髪だけ。ツインテール・ポニーテール・後ろに長く垂れる髪は描かない（別の「後ろ髪」の画像）',
      NO_ITEMS,
      '向き：右向きの斜め前（3/4）。ちびキャラ用に顔は丸く大きく、目は特に大きく。首は描かない（顎の下で切る）',
      HEAD_POS, REF,
      `条件：${BG}。添付①の青い枠・十字・線・文字・灰色の下絵は描かない`, e ? '※添付④の基本の前の頭と同じ位置・大きさ・髪で、表情だけ変えてください' : '※添付③の立ち絵と同じキャラクターの顔と髪で', '```', '');
  }
  out.push('### ③ 後ろ髪（体の後ろに表示。表情なしの1枚）', '');
  {
    const file = `heads/${key}_back.png`;
    out.push(`- 保存先 \`assets/sprites/${file}\``, `- 添付：① \`rig/templates/head/${key}_back.png\`（後ろ髪の下絵） ② \`style/luna_f_reference.png\`（見本） ③ 作った基本の前の頭 \`heads/${key}.png\``, '', '```',
      'ゲーム中の小さいキャラクター（ちび）の「後ろ髪」だけの画像を1枚作ってください（顔と前髪は別の画像＝添付③）。', ...base,
      `描くもの：${BACK_HAIR[L.hair] || '後頭部の髪'}。添付③の前の頭の後ろにつながる位置に描く（後頭部の丸みも描く。前の頭の後ろに隠れる部分）`,
      '描かない物：顔・前髪・ネコミミ・鈴・リボンの髪飾り・帽子・ヘッドホン・体',
      `位置：添付①と同じ 1024×1024 の配置（頭の中心 (${HEAD_PX}, ${HEAD_PY})）。添付③と重ねるとぴったり1つの頭になるように。毛先は腰の線 y=${hy(G.waist)} くらいまで（画像全体を使ってよい）`,
      REF, `条件：${BG}。添付①の線・十字・文字・灰色の下絵は描かない`, '```', '');
  }
  man.heads[key] = { file: `heads/${key}.png`, back: `heads/${key}_back.png`, expr: hx };
}
writeFileSync('docs/art_handoff/HERO_PROMPTS.md', out.filter((l) => l !== '').join('\n').replace(/\n(##|- 保存先|```\n)/g, '\n\n$1'));
writeFileSync('docs/art_handoff/manifest_heroes_example.json', JSON.stringify(man, null, 2));
console.log('HERO_PROMPTS: 6 キャラ × (立ち絵6 + 前の頭5 + 後ろ髪1)');
