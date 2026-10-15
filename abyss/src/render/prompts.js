// AI で差し替え画像を作るための「指示文（プロンプト）」を、枠の情報から自動で作る。
//
// すべての指示文は同じ「画風の決まり文（STYLE_BIBLE）」を使う → どの AI で作っても絵柄がそろいやすい。
// 向き: 主人公・召喚物・ペット・弾は右向き、敵・ボスは左向き（主人公に向かってくる）、武器は上向き（柄が下）。
// 背景: キャラ・装備・アイコンは透明（できなければ単色の緑 #00FF00）。光の演出は真っ黒（加算で黒が消える）。
//       背景の絵（bg.*）とタイトル画面は画面いっぱいの風景。
// 使い方: buildPrompt(spec) → { en, ja, neg, mj, bg, aspect, sizes, kind }（manifest.js が枠ごとに呼ぶ）。
// 既存の作品名・キャラ名・作家名は絶対に入れない（REFERENCE 6.10。似せた絵は権利の問題になる）。

import { CLASS } from '../data/classes.js';
import { MONSTER, FAMILIES } from '../data/monsters.js';
import { SKILL } from '../data/skills.js';
import { BASE, BASES, KIND_NAMES, STYLE_NAMES } from '../data/items.js';
import { PET } from '../data/pets.js';
import { MATERIAL } from '../data/materials.js';
import { ACTS } from '../data/world.js';

// ---------------------------------------------------------------- 画風の決まり文（途中で変えない）
export const STYLE_BIBLE = {
  en: 'hand-painted 2D dark fantasy game art, painterly brush texture with clean dark-brown outlines, two-tone cel shading with a soft highlight, muted earthy palette with rich glowing accents (not neon), soft even front lighting from slightly above',
  ja: '手描き風の2Dダークファンタジーのゲーム絵、筆のあとが残る絵画調の塗りとくっきりした濃い茶色の輪郭線、2段階の塗りと柔らかいハイライト、落ち着いた土色の配色に光る差し色（ネオン色にしない）、正面やや上からの均一で柔らかい光',
};

/** 光の演出と背景は輪郭線を描かないので、別の決まり文（画風はそろえる） */
export const STYLE_FX = {
  en: 'hand-painted 2D dark fantasy game visual effect, painterly glowing energy with soft bloom, rich saturated core fading to darkness (not neon)',
  ja: '手描き風の2Dダークファンタジーのゲームの光の演出、絵画調の光るエネルギーと柔らかいにじみ、濃い色の芯が暗さへ消えていく（ネオン色にしない）',
};
export const STYLE_BG = {
  en: 'hand-painted 2D dark fantasy game background art, painterly brush texture, atmospheric depth and haze, muted earthy palette with glowing accents, soft diffuse light',
  ja: '手描き風の2Dダークファンタジーのゲームの背景画、筆のあとが残る絵画調の塗り、奥行きのあるかすみ、落ち着いた土色の配色に光る差し色、柔らかく広がる光',
};

const RULES = {
  en: 'Exactly one subject. No text, no letters, no logo, no watermark, no signature, no frame, no border, no ground, no floor, no cast shadow, no reflection. Original design that does not imitate any existing game, anime, character or artist.',
  ja: '描くのは1つだけ。文字・ロゴ・透かし・署名・枠・地面・床・落ち影・反射は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。',
};

/** 否定のプロンプト（Stable Diffusion・NovelAI 用） */
export const NEGATIVE = 'text, letters, watermark, signature, logo, frame, border, ground, floor, cast shadow, reflection, multiple subjects, cropped, out of frame, blurry, lowres, jpeg artifacts, photo, 3d render, gradient background, scenery';

const BG = {
  transparent: {
    en: 'Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid pure green #00FF00 background with no gradient.',
    ja: '背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色の緑（#00FF00）にする。',
    mj: 'isolated on a plain flat solid pure green background',
    sd: 'simple background, green background',
  },
  magenta: {
    en: 'Background: fully transparent (PNG with alpha). If transparency is not available, use a perfectly flat solid magenta #FF00FF background with no gradient.',
    ja: '背景は完全な透明（透過PNG）。透明にできない場合は、ムラのない単色のマゼンタ（#FF00FF）にする（体が緑なので緑は使わない）。',
    mj: 'isolated on a plain flat solid magenta background',
    sd: 'simple background, magenta background',
  },
  black: {
    en: 'Background: pure black #000000 (the effect is drawn with additive blending, so black becomes invisible). The glow fades smoothly into pure black at its edges and nothing touches the image borders.',
    ja: '背景は真っ黒（#000000）。加算で重ねるので黒は見えなくなる。光は縁に向かってなめらかに真っ黒へ消え、画像の端に触れない。',
    mj: 'on a pure black background',
    sd: 'black background, simple background',
  },
  icon: {
    en: 'Background: a dark smoky vignette filling the square (no frame or border, the game draws its own frame).',
    ja: '背景は正方形いっぱいの暗い煙のようなぼかし（枠は入れない。ゲーム側で枠を描く）。',
    mj: 'dark smoky vignette background',
    sd: 'dark background, vignette',
  },
  scene: {
    en: 'The scene fills the whole image edge to edge. No characters, no creatures, no text, no UI.',
    ja: '画像の端から端まで風景で埋める。人物・生き物・文字・UI は入れない。',
    mj: 'wide landscape, no characters',
    sd: 'scenery, no humans, landscape',
  },
  portrait: {
    en: 'Background: a dark atmospheric backdrop with drifting ash and a soft colored glow behind the character, filling the whole image; no other characters.',
    ja: '背景は画像いっぱいの暗い雰囲気の背景（舞う灰と、キャラの後ろの柔らかい色の光）。ほかの人物は入れない。',
    mj: 'dark atmospheric backdrop with drifting ash',
    sd: 'dark background, ash particles',
  },
  keyart: {
    en: 'The scene fills the whole image edge to edge. No text, no logo, no UI.',
    ja: '画像の端から端まで絵で埋める。文字・ロゴ・UI は入れない。',
    mj: 'wide key art',
    sd: 'scenery',
  },
  layer: {
    en: 'Only the lower part of the image has scenery; everything above it is fully transparent (PNG with alpha) so a farther layer can show through. If transparency is not available, fill the empty sky with flat solid pure green #00FF00.',
    ja: '絵があるのは下の部分だけで、その上は完全な透明（透過PNG）にする（奥の背景が透けて見えるように）。透明にできない場合は、空の部分をムラのない単色の緑（#00FF00）で塗る。',
    mj: 'silhouetted scenery along the bottom, plain flat solid pure green sky',
    sd: 'scenery, green background',
  },
};

// ---------------------------------------------------------------- 言葉の対応表（英語 / 日本語）
const CLASS_LOOK = {
  warrior: { en: 'a battle-scarred gladiator warrior, broad muscular build, short dark hair, stern face, crimson cloth accents', ja: '歴戦の剣闘士。がっしりした体格、短い黒髪、険しい顔、深紅の布の差し色' },
  ranger: { en: 'a lean hooded ranger hunter, sharp eyes, green and brown hunting leathers, a quiver strap across the chest', ja: 'フードをかぶった細身の狩人。鋭い目、緑と茶の狩り装束、胸に矢筒のベルト' },
  sorcerer: { en: 'a young sorcerer mage with flowing robes, long silver hair, glowing blue arcane runes on the sleeves', ja: '流れるような衣の若い魔導士。長い銀髪、袖に青く光る魔法の紋' },
  necromancer: { en: 'a gaunt pale necromancer in tattered violet and black robes, bone ornaments, faint green-violet glow in the eyes', ja: 'やせて青白い死霊術師。ぼろぼろの紫と黒の衣、骨の飾り、目にかすかな紫緑の光' },
  assassin: { en: 'an agile shadowblade assassin, half-masked face, dark leather wrappings, golden yellow accents, light crouching posture', ja: '身軽な影刃の暗殺者。顔の下半分を覆う仮面、黒い革の巻き布、金色の差し色、低く構えた姿勢' },
};

const STYLE_EN = { cloth: 'layered cloth robes and wraps', leather: 'fitted leather armor with straps and buckles', mail: 'a chainmail hauberk with leather pauldrons', plate: 'full steel plate armor with engraved edges' };
const STYLE_JA = { cloth: '重ね着した布の衣と巻き布', leather: 'ベルトと留め金のついた体に合う革鎧', mail: '革の肩当てつきの鎖帷子', plate: '縁に彫りのある全身の鋼の板金鎧' };

const KIND_EN = {
  sword: 'one-handed longsword', axe: 'one-handed battle axe', mace: 'flanged war mace', greatsword: 'huge two-handed greatsword', bow: 'recurve longbow', crossbow: 'heavy crossbow',
  staff: 'tall wooden mage staff topped with a glowing crystal', wand: 'short carved magic wand', scythe: 'large reaper scythe', rod: 'bone rod with a small skull ornament', dagger: 'curved dagger', claw: 'katar-style punching claw blade',
  shield: 'heater shield with metal rim', quiver: 'leather quiver full of arrows', orb: 'floating arcane orb in a metal cradle', grimoire: 'leather-bound grimoire with metal corners', offblade: 'short offhand parrying blade',
  helm: 'helmet', chest: 'chest armor', gloves: 'gauntlets', belt: 'armored belt', legs: 'leg armor', boots: 'armored boots', amulet: 'amulet pendant on a chain', ring: 'ornate ring',
};

const BODY_EN = {
  biped: 'humanoid creature', brute: 'hulking brute humanoid', caster: 'robed spellcaster', quad: 'four-legged beast', beast_large: 'huge four-legged beast', flyer: 'winged flying creature',
  blob: 'slime blob creature', serpent: 'giant serpent', spider: 'giant spider', insect: 'giant armored insect', ghost: 'floating ghost wraith', golem: 'stone golem', dragon: 'dragon',
  plant: 'monstrous carnivorous plant', aquatic: 'aquatic fish-man creature', demon: 'horned demon', elemental: 'elemental being made of living energy', construct: 'mechanical construct',
};
const BODY_JA = {
  biped: '人型', brute: '大柄な人型', caster: 'ローブの術者', quad: '四足の獣', beast_large: '大きな獣', flyer: '翼で飛ぶ生き物', blob: '粘体', serpent: '大蛇・大きな虫', spider: '大蜘蛛',
  insect: '甲虫・蠍のような虫', ghost: '宙に浮かぶ霊', golem: '岩や金属の巨人', dragon: '竜', plant: '人食いの植物', aquatic: '魚人・水棲の魔物', demon: '悪魔', elemental: '炎や氷の塊の精霊', construct: '機械仕掛けの兵',
};
const FEATURE_EN = {
  horns: 'curved horns', wings: 'large wings', tail: 'a long tail', crown: 'a crown', armor: 'armor plates', staff: 'holding a staff', shield: 'carrying a shield', sword: 'wielding a sword', axe: 'wielding an axe', bow: 'holding a bow',
  spikes: 'spikes along the back', tentacles: 'tentacles', glow: 'a glowing aura', hood: 'a hood', mask: 'a mask', chains: 'hanging chains', crystals: 'crystal growths', gears: 'exposed gears', flames: 'licking flames', ice: 'ice shards', bones: 'exposed bones',
};
const FEATURE_JA = {
  horns: '角', wings: '翼', tail: '尾', crown: '冠', armor: '鎧の板', staff: '杖を持つ', shield: '盾を持つ', sword: '剣を持つ', axe: '斧を持つ', bow: '弓を持つ', spikes: '背中の棘', tentacles: '触手', glow: '光るオーラ',
  hood: 'フード', mask: '仮面', chains: '垂れた鎖', crystals: '生えた結晶', gears: 'むき出しの歯車', flames: 'まとった炎', ice: '氷のかけら', bones: 'むき出しの骨',
};
const FAMILY_EN = { undead: 'undead', beast: 'beast', demon: 'demonic', insect: 'insectoid', elemental: 'elemental', human: 'human', construct: 'construct', aberration: 'aberrant', aquatic: 'aquatic', dragon: 'draconic', plant: 'plant', spirit: 'spirit' };

const EL_EN = { phys: 'steel-white and pale gold', fire: 'orange and red fire', cold: 'icy cyan and white frost', lightning: 'electric yellow and white lightning', poison: 'toxic acid-green', void: 'deep violet void energy with a dark core' };
const EL_JA = { phys: '鋼の白と淡い金', fire: '橙と赤の炎', cold: '水色と白の冷気', lightning: '黄色と白の雷', poison: '毒々しい黄緑', void: '芯の暗い深い紫の虚無の力' };

const BEHAVIOR_MOTIF = {
  melee: 'a heavy weapon strike', projectile: 'a flying projectile', nova: 'a radial burst of power', rain: 'a rain of falling projectiles', chain: 'forking chain lightning', summon: 'a summoning circle with a rising figure',
  buff: 'a glowing empowering aura', leap: 'a leaping strike with a ground impact', dash: 'a blurred dash trail', beam: 'a focused energy beam', whirl: 'a spinning whirlwind of blades', aura: 'a ring of radiating power',
  trap: 'a spiked trap', dot: 'a lingering toxic cloud', meteor: 'a falling meteor', orbit: 'orbiting orbs', wall: 'a rising wall', wave: 'a rolling shockwave', curse: 'a curse sigil over a victim', totem: 'a carved totem', turret: 'a small turret',
};

const PART = {
  proj: { en: (el) => `a single ${el} projectile flying to the RIGHT, bright hot core with a tapering trailing tail`, ja: (el) => `${el}の弾を1つ。右へ飛ぶ向きで、明るい芯と細くなっていく尾`, aspect: 'wide' },
  hit: { en: (el) => `a ${el} impact spark burst, star-shaped flash with flying sparks`, ja: (el) => `${el}の当たった瞬間の火花。星形の閃光と飛び散る粒`, aspect: 'square' },
  area: { en: (el) => `a ${el} circular explosion burst seen from the front, radial shockwave ring`, ja: (el) => `${el}の円形の爆発。正面から見た放射状の衝撃波の輪`, aspect: 'square' },
  swing: { en: (el) => `a ${el} crescent weapon-slash arc, curved like a half moon, sweeping from upper left to lower right`, ja: (el) => `${el}の三日月形の斬撃の軌跡。左上から右下へ振り抜く弧`, aspect: 'square' },
  chain: { en: (el) => `a horizontal ${el} lightning arc segment running left to right`, ja: (el) => `左から右へ走る${el}の稲妻の筋`, aspect: 'wide' },
  beam: { en: (el) => `a straight horizontal ${el} energy beam running from the left edge to the right edge, seamless, glowing core`, ja: (el) => `左端から右端まで続く、まっすぐな横向きの${el}の光線。明るい芯`, aspect: 'wide' },
  aura: { en: (el) => `a ${el} glowing ring aura on the ground seen slightly from above`, ja: (el) => `少し上から見た地面の${el}の光の輪`, aspect: 'square' },
  buff: { en: (el) => `a ${el} swirling empowering aura shaped like a tall flame around an invisible body`, ja: (el) => `見えない体を包む、縦長の${el}の渦巻く強化のオーラ`, aspect: 'tall' },
  summon: { en: (el) => `a ${el} magic summoning circle with runes, seen slightly from above`, ja: (el) => `少し上から見た${el}の魔法陣（文字ではなく模様の紋）`, aspect: 'square' },
  trap: { en: (el) => `a small ${el} magical trap device lying on the ground, side view`, ja: (el) => `地面に置かれた小さな${el}の罠。真横から`, aspect: 'square' },
  totem: { en: (el) => `a carved wooden totem pole crackling with ${el}, side view`, ja: (el) => `${el}をまとう木彫りのトーテム。真横から`, aspect: 'tall' },
  trail: { en: (el) => `a horizontal ${el} motion-blur dash trail, streaks running left to right`, ja: (el) => `左から右へ流れる${el}の残像の筋`, aspect: 'wide' },
  curse: { en: (el) => `a floating ${el} curse sigil, ominous rune circle`, ja: (el) => `宙に浮かぶ${el}の呪いの紋`, aspect: 'square' },
  cut: { en: (el) => `an ultimate-skill cut-in banner: dramatic close-up of the hero's eyes and weapon with ${el} speed lines`, ja: (el) => `奥義のカットイン。主人公の目元と武器の大写しと${el}の集中線`, aspect: 'banner' },
};

const ENEMY_FX = {
  arrow: { en: 'a dark wooden arrow with a rusty iron head flying to the LEFT', ja: '左へ飛ぶ、錆びた鉄の鏃の黒い木の矢' },
  fireball: { en: 'a roaring fireball flying to the LEFT with a smoky tail', ja: '左へ飛ぶ、煙の尾を引く火の玉' },
  orb: { en: 'a crackling dark magic orb flying to the LEFT', ja: '左へ飛ぶ、ばちばちと鳴る闇の魔弾' },
  bone: { en: 'a spinning shard of bone flying to the LEFT', ja: '左へ回りながら飛ぶ骨の破片' },
  ice: { en: 'a sharp ice spike flying to the LEFT', ja: '左へ飛ぶ鋭い氷の棘' },
  spit: { en: 'a glob of acidic green spit flying to the LEFT', ja: '左へ飛ぶ酸の緑のつば' },
  area: { en: 'a red danger zone of corrupted energy on the ground, seen from the front', ja: '地面に広がる赤い危険な力の渦。正面から' },
  slam: { en: 'a ground-slam shockwave with cracked rock debris, seen from the front', ja: '地面を叩きつけた衝撃波と飛び散る岩。正面から' },
  blast: { en: 'a fiery death explosion burst', ja: '死に際の炎の爆発' },
  zap: { en: 'a lightning bolt striking down from above', ja: '上から落ちる雷' },
};

const ACT_EN = {
  act1: 'an ash-covered desolate village, a rotting forest, a graveyard, a swamp and a ruined chapel; gray and withered brown tones with a distant blood-red moon',
  act2: 'a desert of dunes, crumbling temples and tombs, tall obelisks; orange and gold sunset sky, sandstorm haze',
  act3: 'snowy mountains, ice caves, frozen waterfalls and a glacier fortress; pale blue light and a faint aurora',
  act4: 'a sunken drowned city, coral, broken towers and an undersea temple; teal light rays and rising bubbles',
  act5: 'a volcano, rivers of lava, giant forges hung with chains, black rock; red and orange with flying embers',
  act6: 'a forest of giant mushrooms, a poison swamp, spider webs and rotting great trees; yellow-green and purple mist with drifting spores',
  act7: 'a white castle above the clouds, broken colonnades, floating islands and thunderclouds; white and gold with storm light',
  act8: 'a clockwork labyrinth of gears, steam pipes, brass corridors and giant clock mechanisms; copper and gold with steam',
  act9: 'floating rock islands under a twisted sky, rifts full of stars, glowing crystals; purple and black with stardust',
  act10: 'a hellish castle, pillars of bone, a river of blood and a colossal throne; crimson and black under a burning sky',
};

// 名前の漢字から見た目の手がかり（ユニーク・敵・ペットの名前に使う）
const MOTIF = [
  [/炎|焔|火|紅蓮|灼|燃/, 'flame-wreathed', '炎をまとった'], [/氷|霜|凍|雪|吹雪/, 'frost-covered', '霜に覆われた'], [/雷|稲妻|轟/, 'crackling with lightning', '雷をまとった'],
  [/毒|腐|瘴/, 'dripping with toxic venom', '毒のしたたる'], [/骨|髑髏|骸/, 'made of carved bone', '骨でできた'], [/血|紅/, 'blood-red', '血のように赤い'], [/影|闇|夜|黒/, 'shrouded in shadow', '影をまとった'],
  [/星/, 'studded with starlight', '星の光をちりばめた'], [/竜|龍/, 'draconic', '竜の意匠の'], [/月/, 'moonlit silver', '月光の銀色の'], [/灰/, 'ash-gray', '灰色の'], [/深淵|虚無|虚/, 'abyssal and void-touched', '深淵の力に染まった'],
  [/聖|天|光/, 'radiant and holy', '神々しく光る'], [/金|黄金/, 'golden', '金色の'], [/鋼|鉄/, 'forged steel', '鍛えた鋼の'], [/茨|棘/, 'thorned', '茨の'], [/嵐|風/, 'storm-swept', '嵐の'], [/海|潮|水/, 'sea-worn', '潮に洗われた'],
  [/狼|獣|牙/, 'feral', '獣のような'], [/王|帝|皇/, 'regal', '王者の'], [/死|冥/, 'deathly', '死の気配の'], [/魂|霊/, 'spectral', '霊気の'], [/歯車|機/, 'clockwork', '機械仕掛けの'], [/砂/, 'sand-worn', '砂にさらされた'],
  [/呪/, 'cursed', '呪われた'], [/鎖/, 'chained', '鎖を巻いた'], [/晶|結晶/, 'crystalline', '結晶の'],
];

// ---------------------------------------------------------------- 小さな道具
/** 'boss_ash_wolf' → 'ash wolf'（id は英語の単語でできていることが多い） */
// 指示文に入れると既存の作品名・会社名と紛れる単語は言い換える
const WORD_SWAP = { blizzard: 'snowstorm', null: 'void', undefined: 'unknown' };
export function idWords(id) {
  const w = String(id || '').replace(/^(boss|act|zone|u|set|m)_/, '').replace(/^[wrsna]_/, '').replace(/[_\-.]+/g, ' ').trim();
  return w.split(' ').map((x) => WORD_SWAP[x.toLowerCase()] || x).join(' ');
}

/** '#8a5a4a' → { en: 'dark brown', ja: 'こげ茶' }（色の名前） */
export function colorName(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return { en: '', ja: '' };
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const r = parseInt(s.slice(0, 2), 16) / 255; const g = parseInt(s.slice(2, 4), 16) / 255; const b = parseInt(s.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) { if (mx === r) hue = 60 * (((g - b) / d) % 6); else if (mx === g) hue = 60 * ((b - r) / d + 2); else hue = 60 * ((r - g) / d + 4); }
  if (hue < 0) hue += 360;
  if (sat < 0.13 || d < 0.06) {
    if (l < 0.13) return { en: 'black', ja: '黒' };
    if (l < 0.35) return { en: 'dark gray', ja: '濃い灰色' };
    if (l < 0.66) return { en: 'gray', ja: '灰色' };
    if (l < 0.88) return { en: 'light gray', ja: '明るい灰色' };
    return { en: 'white', ja: '白' };
  }
  if (hue >= 12 && hue < 50 && l < 0.45 && sat < 0.75) return l < 0.25 ? { en: 'dark brown', ja: 'こげ茶' } : { en: 'brown', ja: '茶色' };
  const H = [[12, 'red', '赤'], [40, 'orange', '橙'], [66, 'yellow', '黄色'], [90, 'yellow-green', '黄緑'], [150, 'green', '緑'], [185, 'teal', '青緑'], [205, 'cyan', '水色'], [250, 'blue', '青'], [278, 'indigo', '藍色'], [318, 'purple', '紫'], [345, 'magenta', '赤紫'], [361, 'red', '赤']];
  const [, en, ja] = H.find(([lim]) => hue < lim);
  let pe = ''; let pj = '';
  if (l < 0.22) { pe = 'very dark '; pj = 'とても暗い'; } else if (l < 0.38) { pe = 'dark '; pj = '暗い'; } else if (l > 0.8) { pe = 'pale '; pj = '淡い'; } else if (l > 0.64) { pe = 'light '; pj = '明るい'; } else if (sat < 0.38) { pe = 'muted '; pj = 'くすんだ'; }
  return { en: `${pe}${en}`, ja: `${pj}${ja}` };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const article = (word) => (/^[aeiou]/i.test(String(word).trim()) ? 'an ' : 'a ');

/** スキルの説明の {dmg} などを、指示文に向く言葉にする */
function plainDesc(desc) {
  if (!desc) return '';
  return desc.replace(/の\s*\{dmg\}\s*で/g, 'で').replace(/\{count\}\s*体まで/g, '何体も').replace(/\{dmg\}\s*の?ダメージ/g, '大きなダメージ').replace(/\{count\}\s*本/g, '何本も').replace(/\{count\}\s*体/g, '何体か').replace(/半径\s*\{radius\}\s*の?/g, '広い範囲の').replace(/\{radius\}/g, '広い範囲').replace(/\{dur\}\s*秒/g, 'しばらく')
    .replace(/\{[a-z]+\}\s*の?/g, '').replace(/\s+/g, '');
}

function motifsOf(name) {
  const en = []; const ja = [];
  for (const [re, e, j] of MOTIF) if (re.test(name || '') && en.length < 2) { en.push(e); ja.push(j); }
  return { en, ja };
}

function isGreenish(hex) {
  const c = colorName(hex).en;
  return /green|teal|lime/.test(c);
}

/** 生成サイズの目安（縦横比ごと） */
export function aspectInfo(w, h, kind) {
  const r = w / h;
  if (kind === 'banner' || r >= 3.2) return { aspect: '3:1', gpt: '1536×512', sdxl: '1536×512', flux: '1536×512', mj: '--ar 3:1', note: '横に長い。余った上下は画像の窓の「上を切る」「下を切る」で切れる（地面の上の透明な所は自動で切る）' };
  if (r >= 1.6) return { aspect: '16:9', gpt: '1536×1024（または 1792×1008）', sdxl: '1344×768', flux: '1344×768', mj: '--ar 16:9', note: '' };
  if (r >= 1.25) return { aspect: '3:2', gpt: '1536×1024', sdxl: '1216×832', flux: '1248×832', mj: '--ar 3:2', note: '' };
  if (r >= 0.85) return { aspect: '1:1', gpt: '1024×1024', sdxl: '1024×1024', flux: '1024×1024', mj: '--ar 1:1', note: '' };
  if (r >= 0.7) return { aspect: '3:4', gpt: '1024×1536', sdxl: '896×1152', flux: '896×1184', mj: '--ar 3:4', note: '' };
  return { aspect: '2:3', gpt: '1024×1536', sdxl: '832×1216', flux: '832×1248', mj: '--ar 2:3', note: '' };
}

// ---------------------------------------------------------------- 本体
/**
 * 枠 1 つの指示文を作る。spec は manifest の枠（kind・params・w・h・facing を使う）。
 * 戻り値: { en, ja, neg, mj, bg: 'transparent'|'black'|'icon'|'scene'|'layer', aspect, sizes: { gpt, sdxl, flux, mj }, kind }
 */
export function buildPrompt(spec) {
  const p = spec.params || {};
  const kind = spec.kind || 'misc';
  const S = subjectFor(kind, spec, p);
  const bgKey = S.bg || 'transparent';
  const bg = BG[bgKey] || BG.transparent;
  const ai = aspectInfo(spec.w || 1, spec.h || 1, S.aspect);
  const style = S.style === 'fx' ? STYLE_FX : S.style === 'bg' ? STYLE_BG : STYLE_BIBLE;
  const rulesEn = S.rules ? ` ${S.rules.en}` : S.noRules ? '' : ` ${S.allowText ? RULES.en.replace('No text, no letters, no logo, no watermark', 'No watermark') : RULES.en}`;
  const rulesJa = S.rules ? S.rules.ja : S.noRules ? '' : S.allowText ? RULES.ja.replace('文字・ロゴ・', '') : RULES.ja;
  const en = `${S.en.trim()} ${S.pose ? `${S.pose.en} ` : ''}${S.frame ? `${S.frame.en} ` : ''}${bg.en} Style: ${style.en}.${rulesEn}`.replace(/\s+/g, ' ').trim();
  const ja = `${S.ja.trim()}${S.pose ? S.pose.ja : ''}${S.frame ? S.frame.ja : ''}${bg.ja}画風: ${style.ja}。${rulesJa}`.replace(/\s+/g, ' ').trim();
  const mjCore = S.mj || S.en.split('.')[0];
  const sceneLike = ['scene', 'keyart', 'portrait', 'layer'].includes(bgKey);
  const mj = `${mjCore}, ${S.pose?.mj ? `${S.pose.mj}, ` : ''}${bg.mj}, ${S.style === 'fx' ? 'painterly glowing game effect, soft bloom' : S.style === 'bg' ? 'hand-painted 2D dark fantasy game background, painterly, atmospheric' : 'hand-painted 2D dark fantasy game art, painterly, clean outlines'} ${ai.mj} --style raw --no ${S.allowText ? '' : 'text, letters, '}watermark, frame, border${sceneLike ? '' : ', ground, shadow, scenery'}`;
  const neg = sceneLike ? NEGATIVE.replace(', gradient background, scenery', '').replace(', ground, floor', '') + (bgKey === 'scene' || bgKey === 'layer' ? ', characters, people' : '') : NEGATIVE;
  return { en, ja, neg: S.allowText ? neg.replace('text, letters, ', '') : neg, mj, bg: bgKey, aspect: ai.aspect, sizes: { gpt: ai.gpt, sdxl: ai.sdxl, flux: ai.flux, mj: ai.mj }, kind, sizeNote: ai.note };
}

const FACE = {
  right: { en: 'Pose: strict side view (profile), whole body facing RIGHT, both feet on an invisible ground line.', ja: '向き: 完全な真横（横顔）で、体全体が画面の右を向く。両足は見えない地面の線に接地。', mj: 'strict side view profile facing right' },
  left: { en: 'Pose: strict side view (profile), whole body facing LEFT, menacing idle pose, feet or base on an invisible ground line.', ja: '向き: 完全な真横（横顔）で、体全体が画面の左を向く（主人公に向かってくる）。威嚇する待機の姿勢。足元は見えない地面の線に接地。', mj: 'strict side view profile facing left, menacing idle pose' },
  leftFly: { en: 'Pose: strict side view, facing LEFT, hovering in mid-air.', ja: '向き: 完全な真横で画面の左を向き、宙に浮いている。', mj: 'strict side view facing left, hovering' },
  up: { en: 'Orientation: perfectly vertical, pointing straight UP, the grip/handle at the bottom, seen from the side.', ja: '向き: まっすぐ縦に立て、先端が真上、柄（持ち手）が下。横から見た形。', mj: 'perfectly vertical, pointing straight up, handle at the bottom' },
  icon: { en: 'Orientation: shown at a 3/4 angle, diagonal at 45 degrees (handle at the bottom-left, tip to the top-right) for long items.', ja: '向き: 3/4 の角度。長い物は斜め 45 度（柄が左下、先が右上）。', mj: 'item icon, 3/4 view' },
  front: { en: 'Orientation: seen from the front.', ja: '向き: 正面から。', mj: 'front view' },
};
// 斜め 45 度で描く長い物（アイコン）
const LONG = new Set(['sword', 'axe', 'mace', 'greatsword', 'bow', 'crossbow', 'staff', 'wand', 'scythe', 'rod', 'dagger', 'claw', 'offblade']);
const FRAME = {
  body: { en: 'Framing: the entire body from the top of the head to the toes is visible, horizontally centered, feet at 92% of the image height, at least 6% empty margin on every side, nothing cropped.', ja: '構図: 頭のてっぺんからつま先まで全身が入り、左右の中央に置く。足元は画像の上から 92% の高さ。上下左右に 6% 以上の余白、見切れなし。' },
  item: { en: 'Framing: the whole item is visible and centered with an 8% margin.', ja: '構図: 全体が入るよう中央に置き、余白は 8%。' },
  icon: { en: 'Framing: centered in a square with a 10% margin, large and readable at small size.', ja: '構図: 正方形の中央に大きく置き、余白は 10%。小さく表示しても形が分かるように。' },
  fx: { en: 'Framing: centered.', ja: '構図: 中央に置く。' },
  part: { en: 'Framing: exactly the same canvas as the base character image (character centered, feet at 92% of the image height); draw only the armor piece in its place.', ja: '構図: 基本のキャラ画像とまったく同じキャンバス（キャラは中央、足元は上から 92%）。その位置に鎧の部品だけを描く。' },
  iconRound: { en: 'Orientation: a slightly angled 3/4 view.', ja: '向き: 少し斜めの 3/4 の角度。', mj: 'item icon, 3/4 view' },
};

function subjectFor(kind, spec, p) {
  const cls = CLASS[p.cls];
  const look = CLASS_LOOK[p.cls] || (cls ? { en: `a ${String(cls.en || cls.id).toLowerCase()} hero`, ja: `${cls.name}` } : { en: 'a hero', ja: '主人公' });
  switch (kind) {
    case 'hero.body': return {
      en: `Create ONE full-body character sprite for a side-scrolling 2D action RPG. Character: ${look.en}, wearing simple base clothes, empty hands closed into fists ready to hold a weapon (the game attaches weapons separately).`,
      ja: `横スクロールの2DアクションRPG用に、全身のキャラクター画像を1体だけ作ってください。キャラ: 「${cls?.name || ''}」${look.ja}。簡素な基本の服。手は何も持たず、武器を握れる形の握り拳（武器はゲームが別に持たせる）。`,
      mj: `${look.en}, 2D game character sprite, full body`, pose: FACE.right, frame: FRAME.body,
    };
    case 'hero.outfit': return {
      en: `Use the approved base character image of this hero as the exact base (same character, face, hair, body proportions, pose, size and position on the canvas, line style and lighting). Change ONLY the outfit to ${STYLE_EN[p.style] || 'armor'}. Character: ${look.en}. Empty hands closed into fists.`,
      ja: `この主人公の承認済みの基本の画像をそのまま土台にしてください（同じキャラ・顔・髪型・体型・ポーズ・キャンバス上の大きさと位置・線と光）。服装だけを「${STYLE_NAMES[p.style] || ''}」の装備＝${STYLE_JA[p.style] || '鎧'}に変える。キャラ: 「${cls?.name || ''}」${look.ja}。手は何も持たない握り拳。`,
      mj: `${look.en} wearing ${STYLE_EN[p.style] || 'armor'}, 2D game character sprite, full body`, pose: FACE.right, frame: FRAME.body,
    };
    case 'hero.portrait': return {
      en: `A dramatic character select portrait illustration of ${look.en}, knees-up three-quarter view, heroic pose, rim light.`,
      ja: `クラス選択画面の立ち絵。「${cls?.name || ''}」${look.ja}。膝から上、3/4 の角度、勇ましいポーズ、縁の光。`,
      mj: `${look.en}, character select portrait, knees-up, three-quarter view, heroic pose`, bg: 'portrait',
      rules: { en: 'Exactly one character. No text, no letters, no logo, no watermark, no signature, no frame, no border. Original design that does not imitate any existing game, anime, character or artist.', ja: 'キャラは1人だけ。文字・ロゴ・透かし・署名・枠は入れない。既存のゲーム・アニメ・キャラクター・作家に似せないオリジナルのデザイン。' },
    };
    case 'gear.weapon': {
      const k = p.kind;
      return {
        en: `One ${KIND_EN[k] || idWords(k)} as a standalone 2D game equipment sprite (the hero holds it in hand). No hands, no character, no stand.`,
        ja: `${KIND_NAMES[k] || k}（${KIND_EN[k] || k}）を1つだけ、2Dゲームの装備の単体画像として描いてください（主人公が手に持つ）。手・キャラ・台座なし。`,
        mj: `${KIND_EN[k] || idWords(k)}, single game item sprite`, pose: k === 'bow' || k === 'crossbow' ? { en: 'Orientation: seen from the side, held vertically as if aiming to the right, the grip at the center.', ja: '向き: 横から見て縦に構えた形（右へ狙う向き）、握りが中央。', mj: 'side view, vertical, aiming right' } : FACE.up, frame: FRAME.item,
      };
    }
    case 'gear.offhand': return {
      en: `One ${KIND_EN[p.kind] || idWords(p.kind)} as a standalone 2D game equipment sprite carried in the off hand. No hands, no character.`,
      ja: `${KIND_NAMES[p.kind] || p.kind}を1つだけ、副手に持つ装備の単体画像として描いてください。手・キャラなし。`,
      mj: `${KIND_EN[p.kind] || idWords(p.kind)}, single game item sprite`, pose: p.kind === 'shield' ? FACE.front : { en: 'Orientation: side view, upright.', ja: '向き: 横から見て立てた形。', mj: 'side view' }, frame: FRAME.item,
    };
    case 'gear.helm': return {
      en: `One ${STYLE_EN[p.style] ? `${p.style} ` : ''}${p.style === 'cloth' ? 'hood' : 'helmet'} (${STYLE_EN[p.style] || ''}) as a standalone 2D game sprite, seen from the side facing RIGHT, as it would sit on a head. No head inside, no character.`,
      ja: `${STYLE_NAMES[p.style] || ''}の兜（${STYLE_JA[p.style] || ''}の頭の装備）を1つ。頭にかぶった時の形で、真横から見て右向き。中に頭は描かない。キャラなし。`,
      mj: `${p.style} helmet, side view facing right, single game item sprite`, frame: FRAME.item,
    };
    case 'gear.part': return {
      en: `The ${KIND_EN[p.slot] || p.slot} piece only of ${STYLE_EN[p.style] || 'armor'}, drawn as an overlay layer that fits over a standing hero facing RIGHT. Same canvas size and position as the base character image; everything else transparent.`,
      ja: `${STYLE_NAMES[p.style] || ''}の${KIND_NAMES[p.slot] || p.slot}の部分だけ。右向きに立つ主人公の上に重ねる部品として、基本のキャラ画像と同じ大きさ・位置で描き、ほかは透明にする。`,
      mj: `${p.style} ${KIND_EN[p.slot] || p.slot}, armor overlay piece, side view facing right`, frame: FRAME.part,
    };
    case 'gear.unique': {
      const m = motifsOf(p.name);
      const k = p.kind;
      const base = KIND_EN[k] || idWords(k);
      const isW = p.slot === 'weapon';
      return {
        en: `One legendary one-of-a-kind ${base}${m.en.length ? `, ${m.en.join(', ')}` : ''}, ornate unique design with gold filigree and a faint magical glow, as a standalone 2D game equipment sprite. No hands, no character.`,
        ja: `伝説の一品「${p.name}」（${KIND_NAMES[k] || k}）。${m.ja.join('・')}${m.ja.length ? '、' : ''}金の細工とかすかな魔力の光のある、ほかに無い豪華なデザイン。${p.flavor ? `言い伝え:「${p.flavor}」。` : ''}2Dゲームの装備の単体画像。手・キャラなし。`,
        mj: `legendary unique ${base}${m.en.length ? `, ${m.en.join(', ')}` : ''}, ornate, single game item sprite`, pose: isW ? FACE.up : p.slot === 'helm' ? { en: 'Orientation: side view facing RIGHT as worn on a head.', ja: '向き: 頭にかぶった時の形で真横・右向き。', mj: 'side view facing right' } : FACE.front, frame: FRAME.item,
      };
    }
    case 'icon.item': {
      const k = p.kind;
      const st = p.style ? `${STYLE_EN[p.style]} ` : '';
      return {
        en: `An inventory icon of one ${p.style ? `${p.style} ` : ''}${KIND_EN[k] || idWords(k)}${st ? ` (${st.trim()})` : ''}.`,
        ja: `持ち物のアイコン: ${p.style ? `${STYLE_NAMES[p.style]}の` : ''}${KIND_NAMES[k] || k}を1つ。`,
        mj: `${p.style ? `${p.style} ` : ''}${KIND_EN[k] || idWords(k)}, game inventory icon`, pose: LONG.has(k) ? FACE.icon : FRAME.iconRound, frame: FRAME.icon,
      };
    }
    case 'icon.unique': {
      const m = motifsOf(p.name);
      return {
        en: `An inventory icon of a legendary one-of-a-kind ${KIND_EN[p.kind] || idWords(p.kind)}${m.en.length ? `, ${m.en.join(', ')}` : ''}, ornate with a faint magical glow.`,
        ja: `持ち物のアイコン: 伝説の一品「${p.name}」（${KIND_NAMES[p.kind] || p.kind}）。${m.ja.join('・')}${m.ja.length ? '、' : ''}豪華でかすかに光る。`,
        mj: `legendary ${KIND_EN[p.kind] || idWords(p.kind)}, game inventory icon`, pose: LONG.has(p.kind) ? FACE.icon : FRAME.iconRound, frame: FRAME.icon,
      };
    }
    case 'icon.mat': {
      const mat = MATERIAL[p.mat] || { name: p.name || p.mat, desc: '' };
      const c = colorName(p.color);
      return {
        en: `An inventory icon of a crafting material: ${idWords(p.mat)}, a small pile or single piece, ${c.en} colored with a soft glow.`,
        ja: `持ち物のアイコン: 素材「${mat.name}」。${mat.desc || ''}小さな山か 1 つのかけら、${c.ja}でほのかに光る。`,
        mj: `${idWords(p.mat)} crafting material, ${c.en}, game inventory icon`, pose: FRAME.iconRound, frame: FRAME.icon,
      };
    }
    case 'icon.gem': {
      const c = colorName(p.color);
      return {
        en: `An inventory icon of one faceted ${c.en || ''} gemstone (${idWords(p.gem)}), brilliant cut, inner light.`,
        ja: `持ち物のアイコン: 宝石「${p.name || p.gem}」を1つ。${c.ja ? `${c.ja}の` : ''}カットされた宝石、内側から光る。`,
        mj: `faceted ${c.en} gemstone, game inventory icon`, pose: FRAME.iconRound, frame: FRAME.icon,
      };
    }
    case 'icon.rune': return {
      en: `An inventory icon of one small carved stone rune tablet with a glowing engraved symbol (an abstract glyph, not a letter of any real alphabet) (${idWords(p.rune)}).`,
      ja: `持ち物のアイコン: ルーン「${p.name || p.rune}」。光る模様（実在の文字ではない抽象的な紋）を彫った小さな石の札。`,
      mj: 'carved stone rune tablet with a glowing abstract glyph, game inventory icon', pose: FRAME.iconRound, frame: FRAME.icon,
    };
    case 'icon.support': return {
      en: `A skill support glyph icon: a glowing engraved seal sigil (${idWords(p.support)}), abstract geometric runes, no letters.`,
      ja: `スキルの補助の刻印のアイコン「${p.name || p.support}」。光る印章の紋（抽象的な幾何学の模様、文字なし）。`,
      mj: 'glowing engraved seal sigil, abstract geometric runes, game skill icon', bg: 'icon', frame: FRAME.icon,
    };
    case 'icon.skill': {
      const sk = SKILL[p.skill] || {};
      const el = EL_EN[p.el] || EL_EN.phys;
      return {
        en: `A square skill icon for an action RPG: ${BEHAVIOR_MOTIF[sk.behavior] || 'a magical technique'} themed "${idWords(p.skill)}", ${el} colors, bold readable silhouette.`,
        ja: `アクションRPGのスキルのアイコン（正方形）: スキル「${sk.name || p.skill}」。${plainDesc(sk.desc)}${EL_JA[p.el] || EL_JA.phys}の色で、形がはっきり分かる絵。`,
        mj: `${BEHAVIOR_MOTIF[sk.behavior] || 'magic technique'}, ${el}, square game skill icon`, bg: 'icon', frame: FRAME.icon,
      };
    }
    case 'fx': {
      const part = PART[p.part] || PART.hit;
      const sk = SKILL[p.skill] || {};
      const el = EL_EN[p.el] || EL_EN.phys;
      return {
        en: `${cap(part.en(el))}: a visual effect for a 2D game skill "${idWords(p.skill)}". Bright glowing energy, high contrast.`,
        ja: `2Dゲームのスキル「${sk.name || p.skill}」の演出: ${part.ja(EL_JA[p.el] || EL_JA.phys)}。明るく光るエネルギー、強いコントラスト。`,
        mj: `${part.en(el)}, game visual effect`, bg: p.part === 'cut' ? 'transparent' : 'black', frame: FRAME.fx, aspect: part.aspect, style: 'fx',
      };
    }
    case 'fx.enemy': {
      const e = ENEMY_FX[p.proj] || { en: `an enemy ${idWords(p.proj)} attack effect`, ja: `敵の攻撃の演出（${p.proj}）` };
      return { en: `${cap(e.en)}: a visual effect for a 2D game enemy attack. Glowing, high contrast.`, ja: `2Dゲームの敵の攻撃の演出: ${e.ja}。光る、強いコントラスト。`, mj: `${e.en}, game visual effect`, bg: 'black', frame: FRAME.fx, style: 'fx' };
    }
    case 'monster': {
      const m = MONSTER[p.mon] || {};
      const pal = m.palette || {};
      const cMain = colorName(pal.main); const cSub = colorName(pal.sub); const cEye = colorName(pal.eye); const cAcc = colorName(pal.accent);
      const feats = (m.features || []).map((f) => FEATURE_EN[f] || f);
      const featsJ = (m.features || []).map((f) => FEATURE_JA[f] || f);
      const mot = motifsOf(m.name);
      const boss = m.boss;
      const el = m.element && m.element !== 'phys' ? `, ${EL_EN[m.element]} magic` : '';
      const bodyEn = BODY_EN[m.body] || 'monster';
      const fam = FAMILY_EN[m.family] && !bodyEn.includes(FAMILY_EN[m.family]) && !bodyEn.includes(m.family) ? `${FAMILY_EN[m.family]} ` : '';
      const enSubj = `${boss ? 'an imposing boss ' : article(fam || bodyEn)}${fam}${bodyEn} (${idWords(p.mon)})${mot.en.length ? `, ${mot.en.join(', ')}` : ''}${feats.length ? `, with ${feats.join(', ')}` : ''}, ${cMain.en} body with ${cSub.en} shading, glowing ${cEye.en} eyes${cAcc.en ? `, ${cAcc.en} accents` : ''}${el}`;
      return {
        en: `Create ONE ${boss ? 'boss ' : ''}monster sprite for a side-scrolling 2D action RPG: ${enSubj}.${boss ? ' Larger, more ornate and threatening than normal enemies, with a crown, trophies or an aura.' : ''}`,
        ja: `横スクロールの2DアクションRPG用の${boss ? 'ボス' : '敵'}の画像を1体: 「${m.name || p.mon}」（${FAMILIES[m.family] || ''}・${BODY_JA[m.body] || ''}）。${mot.ja.join('・')}${mot.ja.length ? '。' : ''}${featsJ.length ? `${featsJ.join('・')}。` : ''}体は${cMain.ja}、影や服は${cSub.ja}、目は光る${cEye.ja}${cAcc.ja ? `、飾りは${cAcc.ja}` : ''}。${boss ? 'ボスらしく大きく、豪華で恐ろしく。冠・戦利品・オーラなど。' : ''}`,
        mj: `${enSubj}, 2D game monster sprite, full body`, pose: m.flying ? FACE.leftFly : FACE.left, frame: FRAME.body, bg: isGreenish(pal.main) ? 'magenta' : 'transparent',
      };
    }
    case 'minion': {
      const look2 = MINION_LOOK[p.minion] || { en: `a summoned ${idWords(p.minion)} minion`, ja: `召喚された${p.label || p.minion}` };
      return { en: `Create ONE summoned ally creature sprite for a side-scrolling 2D action RPG: ${look2.en}.`, ja: `横スクロールの2DアクションRPG用の、味方の召喚物の画像を1体: ${look2.ja}。`, mj: `${look2.en}, 2D game sprite, full body`, pose: FACE.right, frame: FRAME.body };
    }
    case 'pet': {
      const pt = PET[p.pet] || {};
      const pal = pt.palette || {};
      const cMain = colorName(pal.main); const cSub = colorName(pal.sub); const cEye = colorName(pal.eye);
      const feats = (pt.features || []).map((f) => FEATURE_EN[f] || f);
      const featsJ = (pt.features || []).map((f) => FEATURE_JA[f] || f);
      return {
        en: `Create ONE small companion pet sprite for a 2D action RPG: a small ${BODY_EN[pt.body] || 'creature'} (${idWords(p.pet)}), cute but fitting a dark fantasy world${feats.length ? `, with ${feats.join(', ')}` : ''}, ${cMain.en} with ${cSub.en} markings and ${cEye.en} eyes.`,
        ja: `2DアクションRPGの、連れて歩く小さなペットの画像を1体: 「${pt.name || p.pet}」。${pt.desc || ''}小さな${BODY_JA[pt.body] || '生き物'}で、かわいいがダークファンタジーに合う雰囲気${featsJ.length ? `、${featsJ.join('・')}` : ''}。体は${cMain.ja}、模様は${cSub.ja}、目は${cEye.ja}。`,
        mj: `small cute dark fantasy companion ${BODY_EN[pt.body] || 'creature'}, ${cMain.en}, 2D game pet sprite`, pose: FACE.right, frame: FRAME.body, bg: isGreenish(pal.main) ? 'magenta' : 'transparent',
      };
    }
    case 'bg': {
      const act = ACTS.find((a) => a.id === p.act) || {};
      const th = ACT_EN[p.act] || 'a dark fantasy landscape';
      if (p.layer === 'far') return { en: `A side-scrolling game background, far layer: distant sky and horizon of ${th}. Low detail, atmospheric perspective, darker toward the bottom where the battle happens.`, ja: `横スクロールのゲームの背景（一番奥の層）: ${act.name || ''}。${act.theme || ''}。遠くの空と地平線、細部は少なめ、空気遠近法。戦う場所になる下の方は暗めに。`, mj: `side-scrolling game background, distant sky and horizon, ${th}`, bg: 'scene', noRules: true, aspect: 'wide', style: 'bg' };
      if (p.layer === 'mid') return { en: `A side-scrolling game background, middle layer that tiles seamlessly horizontally (the left and right edges match): silhouettes of ${th} standing along the bottom half.`, ja: `横スクロールのゲームの背景（中景の層。左右の端がつながり、横に並べても継ぎ目が出ない）: ${act.name || ''}。${act.theme || ''}。下半分に並ぶ建物や木などのシルエット。`, mj: `side-scrolling game background middle layer, seamless tileable horizontally, silhouettes of ${th}`, bg: 'layer', noRules: true, aspect: 'wide', style: 'bg' };
      return { en: `A side-scrolling game ground strip that tiles seamlessly horizontally (left and right edges match): a side cross-section of the ground surface of ${th}, the walkable top edge flat and near the top of the image, rocks and roots below.`, ja: `横スクロールのゲームの地面の帯（左右の端がつながり、横に並べても継ぎ目が出ない）: ${act.name || ''}。${act.theme || ''}。地面を真横から切った断面。歩く面は平らで画像の上の方、その下に岩や根。`, mj: `side-scrolling game ground strip, seamless tileable horizontally, side cross-section of the ground, ${th}`, bg: 'layer', noRules: true, aspect: 'banner', style: 'bg' };
    }
    case 'ui.logo': return { en: 'A game title logo with the words "ABYSS DROP" in ornate gothic metal letters, cracked dark iron with glowing ember-red edges, a small abyss chasm motif.', ja: 'ゲームのタイトルロゴ。「ABYSS DROP」の文字を、ひびの入った黒鉄と赤く光る縁の装飾的なゴシック体の金属文字で。小さな深淵の裂け目の意匠。', mj: 'game title logo "ABYSS DROP", ornate gothic metal letters, glowing ember edges', allowText: true, aspect: 'banner' };
    case 'ui.title': return { en: 'Title screen key art for a dark fantasy hack-and-slash game: a vast glowing abyss chasm under an ash-filled blood-red sky, ruins at its rim, a lone hero silhouette standing at the edge. Leave the center top area calm for the logo.', ja: 'ダークファンタジーのハクスラのタイトル画面の絵: 灰の舞う血のように赤い空の下に口を開けた巨大な光る深淵の裂け目、縁の廃墟、端に立つ主人公の小さなシルエット。中央の上はロゴが乗るので落ち着いた絵に。', mj: 'dark fantasy title key art, vast glowing abyss chasm, ash-filled blood red sky, lone hero silhouette at the edge', bg: 'keyart', noRules: true, aspect: 'wide', style: 'bg' };
    default: return { en: `One ${idWords(spec.id)} game sprite.`, ja: `${spec.label || spec.id} の画像。`, mj: `${idWords(spec.id)}, game sprite` };
  }
}

const MINION_LOOK = {
  skeleton: { en: 'a skeleton warrior with a rusty sword and a cracked round shield, faint violet glow in the eye sockets', ja: '錆びた剣と割れた丸盾を持つ骸骨の戦士。目のくぼみにかすかな紫の光' },
  skelmage: { en: 'a skeleton mage in tattered robes holding a bone staff, icy blue glowing eyes', ja: 'ぼろの衣を着て骨の杖を持つ骸骨の魔術師。目は氷のような青に光る' },
  golem: { en: 'a hulking golem stitched from bones and dark flesh, glowing violet runes', ja: '骨と黒い肉を縫い合わせた大きなゴーレム。紫に光る紋' },
  beast: { en: 'a loyal wolf-like hunting companion beast with scarred fur', ja: '傷だらけの毛並みの、狼のような忠実な狩りの相棒' },
  clone: { en: 'a shadow clone: a dark translucent smoky silhouette of an assassin holding twin daggers', ja: '影の分身。二本の短剣を持つ暗殺者の、黒く半透明な煙のシルエット' },
};

/** 型にない枠の説明（実行中に見つかった ID など） */
export function kindNameJa(kind) {
  return ({
    'hero.body': '主人公の体', 'hero.outfit': '鎧を着た姿', 'hero.portrait': '立ち絵', 'gear.weapon': '武器', 'gear.offhand': '副手', 'gear.helm': '兜', 'gear.part': '重ね着の部品', 'gear.unique': 'ユニークの装備',
    'icon.item': '持ち物のアイコン', 'icon.unique': 'ユニークのアイコン', 'icon.mat': '素材のアイコン', 'icon.gem': '宝石のアイコン', 'icon.rune': 'ルーンのアイコン', 'icon.support': '刻印のアイコン', 'icon.skill': 'スキルのアイコン',
    fx: 'スキルの演出', 'fx.enemy': '敵の攻撃の演出', monster: '敵・ボス', minion: '召喚物', pet: 'ペット', bg: '背景', 'ui.logo': 'ロゴ', 'ui.title': 'タイトル画面', misc: 'その他',
  })[kind] || kind;
}

export { BASE, BASES };
