// アイテムデータ（装備 / 消費 / etc素材）
// stats の単位: atk/def/maxHp/maxMp = 実数, speed = px/s 加算, crit = % (3 → +3%), str/dex/int/luk = 能力値加算
// 武器: range = px（近接は前方リーチ／銃・魔法は射程）, attackSpeed = 1秒あたりの攻撃回数

import { ITEM_LORE } from './lore.js';

const STAT_KEYS = ['atk', 'def', 'maxHp', 'maxMp', 'speed', 'crit', 'str', 'dex', 'int', 'luk'];
function fillStats(s = {}) {
  const o = {};
  for (const k of STAT_KEYS) o[k] = s[k] || 0;
  return o;
}

const RARITY_PRICE = { common: 1, rare: 4, epic: 12, legendary: 40, mythic: 120, pet: 150 };

const list = [];

function equip(id, name, slot, rarity, reqLevel, stats, look, extra = {}) {
  list.push({
    id, name, slot, type: 'equip', rarity, reqLevel,
    stats: fillStats(stats),
    look: { style: look[0], color: look[1], accent: look[2] || '#ffffff' },
    icon: null,
    effect: null,
    price: Math.round((60 + reqLevel * 40) * RARITY_PRICE[rarity]),
    desc: extra.desc || '',
    ...extra,
  });
}
function weapon(id, name, rarity, reqLevel, stats, look, weaponType, range, attackSpeed, extra = {}) {
  equip(id, name, 'weapon', rarity, reqLevel, stats, look, { weaponType, range, attackSpeed, ...extra });
}
function consumable(id, name, rarity, effect, icon, price, desc) {
  list.push({ id, name, slot: null, type: 'consumable', rarity, reqLevel: 0, stats: fillStats(), look: null,
    effect: { hp: 0, mp: 0, buff: null, ...effect }, icon, price, desc, stack: 999 });
}
function etc(id, name, rarity, icon, price, desc) {
  list.push({ id, name, slot: null, type: 'etc', rarity, reqLevel: 0, stats: fillStats(), look: null,
    effect: null, icon, price, desc, stack: 999 });
}

// ============ 帽子 hat ============
equip('cat_ears_pink', 'ピンクのネコミミ', 'hat', 'common', 0, { def: 2, luk: 1 }, ['catEars', '#ff8ac8', '#ffe0f0'], { desc: 'ルナのお気に入り。ぴこぴこ動く。' });
equip('headphones_cyber', 'ジャンク・ヘッドセット', 'hat', 'common', 0, { def: 2, int: 1 }, ['headphones', '#2b2b38', '#3dff8a'], { desc: '片耳だけ鳴る。それで十分。' });
equip('cap_street', 'ストリートキャップ', 'hat', 'common', 0, { def: 3 }, ['cap', '#2b2b38', '#ff3d7f'], { desc: 'ツバを後ろに回すのが流儀。' });
equip('beanie_gray', 'グレーのビーニー', 'hat', 'common', 5, { def: 4, maxHp: 10 }, ['beanie', '#7a7f8c', '#c9ccd6']);
equip('bandana_red', 'レッドバンダナ', 'hat', 'common', 10, { def: 5, str: 1 }, ['bandana', '#d8283c', '#ffffff']);
equip('headphones_neon', 'ネオンヘッドホン', 'hat', 'rare', 15, { def: 6, dex: 2, maxMp: 20 }, ['headphones', '#19f0ff', '#ff3dd2'], { desc: 'DJパルス御用達。低音が骨に響く。' });
equip('cowboy_hat', 'デザートカウボーイ', 'hat', 'rare', 22, { def: 9, str: 2, luk: 1 }, ['cowboy', '#8a5a2b', '#e8c27a']);
equip('helmet_moto', 'バイカーヘルメット', 'hat', 'epic', 30, { def: 18, maxHp: 80 }, ['helmet', '#16161e', '#ff8a00']);
equip('cat_ears_neon', 'サイバーネコミミ', 'hat', 'epic', 35, { def: 14, luk: 4, dex: 3, crit: 2 }, ['catEars', '#b04dff', '#19f0ff']);
equip('crown_gold', 'ベイの王冠', 'hat', 'legendary', 45, { def: 25, str: 4, dex: 4, int: 4, luk: 4 }, ['crown', '#ffd23f', '#ff3d7f'], { desc: 'この街の頂点に立つ者の証。' });
equip('crown_neon', 'ネオン・エンペラー', 'hat', 'mythic', 55, { def: 40, atk: 10, str: 7, dex: 7, int: 7, luk: 7 }, ['crown', '#19f0ff', '#ff3dd2'], { desc: '夜の街そのものが頭上で輝く。' });

// ============ 上着 top ============
equip('hoodie_cyber', 'サイバーパーカー', 'top', 'common', 0, { def: 4, maxMp: 10 }, ['hoodie', '#1d2b24', '#3dff8a'], { desc: '袖にLEDテープを縫い込んだ自作パーカー。' });
equip('shirt_plain', '生成りのシャツ', 'top', 'common', 0, { def: 3, maxHp: 8 }, ['plainShirt', '#a89a84', '#6e6252'], { desc: 'くすんだ布の服。ここから成り上がる。' });
equip('hoodie_pink', 'ピンクのパーカー', 'top', 'common', 0, { def: 4, maxHp: 10 }, ['hoodie', '#ff6fb5', '#ffffff'], { desc: 'もこもこ。フードにネコ耳つき。' });
equip('leather_jacket', 'ブラックレザージャケット', 'top', 'common', 0, { def: 6, maxHp: 15 }, ['leatherJacket', '#1d1d24', '#c0c0c8'], { desc: 'ジンの一張羅。肩に傷あり。' });
equip('tshirt_white', 'ホワイトTシャツ', 'top', 'common', 3, { def: 5 }, ['tshirt', '#f4f4f4', '#ff3d7f']);
equip('tank_black', 'ブラックタンクトップ', 'top', 'common', 8, { def: 6, str: 1 }, ['tank', '#222228', '#ffd23f']);
equip('hawaiian_shirt', 'サンセット・アロハ', 'top', 'common', 12, { def: 8, luk: 2 }, ['hawaiian', '#ff8a00', '#19d3a0'], { desc: 'ヴァイス・ベイの夕焼け柄。' });
equip('tracksuit_green', 'グリーンジャージ', 'top', 'rare', 18, { def: 12, dex: 2, speed: 10 }, ['tracksuit', '#1fae5b', '#ffffff']);
equip('police_uniform', '奪った警官制服', 'top', 'rare', 25, { def: 16, maxHp: 60 }, ['police', '#20335c', '#ffd23f'], { desc: '着ていると妙に落ち着かない。' });
equip('suit_black', 'マフィアスーツ', 'top', 'rare', 30, { def: 18, str: 2, luk: 2 }, ['suit', '#15151b', '#d8283c']);
equip('idol_dress', 'ステージ・アイドルドレス', 'top', 'epic', 32, { def: 18, maxMp: 60, dex: 3, luk: 3 }, ['idolDress', '#ff6fb5', '#fff06a'], { desc: 'スポットライトが似合う一着。' });
equip('armor_vest', 'タクティカルベスト', 'top', 'epic', 40, { def: 34, maxHp: 150 }, ['armorVest', '#3b4231', '#9aa07a'], { desc: 'SWATの装備を拝借。' });
equip('suit_gold', 'ゴールデン・ボススーツ', 'top', 'legendary', 48, { def: 38, atk: 8, str: 5, luk: 5 }, ['suit', '#ffd23f', '#15151b'], { desc: 'ドンのクローゼットから。' });
equip('idol_dress_mythic', 'ギャラクシー・アイドル', 'top', 'mythic', 58, { def: 50, maxMp: 200, dex: 8, luk: 8, crit: 4 }, ['idolDress', '#7a3dff', '#19f0ff'], { desc: '星空を纏う伝説のステージ衣装。' });

// ============ 下 bottom ============
equip('pants_plain', '綿のズボン', 'bottom', 'common', 0, { def: 2 }, ['plainPants', '#5a5a62', '#3e3e44'], { desc: 'ふつうのズボン。動きやすいのが取り柄。' });
equip('skirt_pink', 'プリーツスカート', 'bottom', 'common', 0, { def: 3, dex: 1 }, ['skirt', '#ff8ac8', '#ffffff'], { desc: '下にはしっかりスパッツ。' });
equip('pants_cyber', 'カーゴ・ジョガー', 'bottom', 'common', 0, { def: 3, int: 1 }, ['trackPants', '#2a2f38', '#3dff8a']);
equip('jeans_blue', 'ダメージジーンズ', 'bottom', 'common', 0, { def: 4 }, ['jeans', '#3a5a8c', '#c9d6ea']);
equip('shorts_beach', 'ビーチショーツ', 'bottom', 'common', 5, { def: 4, speed: 5 }, ['shorts', '#19d3a0', '#ffffff']);
equip('cargo_khaki', 'カーゴパンツ', 'bottom', 'common', 12, { def: 7, maxHp: 20 }, ['cargo', '#8a7a52', '#4a4232']);
equip('track_pants', 'トラックパンツ', 'bottom', 'rare', 18, { def: 10, dex: 2, speed: 10 }, ['trackPants', '#1d1d24', '#ff3d7f']);
equip('suit_pants', 'スーツパンツ', 'bottom', 'rare', 28, { def: 14, str: 2 }, ['suitPants', '#15151b', '#5a5a66']);
equip('armor_pants', 'タクティカルパンツ', 'bottom', 'epic', 40, { def: 26, maxHp: 100 }, ['armorPants', '#3b4231', '#9aa07a']);
equip('skirt_star', 'スターダストスカート', 'bottom', 'legendary', 48, { def: 30, dex: 5, luk: 5, crit: 2 }, ['skirt', '#7a3dff', '#fff06a']);

// ============ 靴 shoes ============
equip('shoes_old', '古い布靴', 'shoes', 'common', 0, { def: 1, speed: 5 }, ['oldShoes', '#6a5848', '#3a2e26'], { desc: 'つま先がすり減っている。' });
equip('sneakers_white', 'ホワイトスニーカー', 'shoes', 'common', 0, { def: 2, speed: 8 }, ['sneakers', '#f4f4f4', '#ff6fb5']);
equip('boots_black', 'エンジニアブーツ', 'shoes', 'common', 0, { def: 3, speed: 4 }, ['boots', '#2a2018', '#8a8a8a']);
equip('sandals_beach', 'ビーチサンダル', 'shoes', 'common', 3, { def: 1, speed: 12 }, ['sandals', '#ffd23f', '#19d3a0']);
equip('loafers_brown', 'ブラウンローファー', 'shoes', 'common', 15, { def: 6, luk: 2 }, ['loafers', '#5a3a22', '#c9a26a']);
equip('heels_red', 'レッドヒール', 'shoes', 'rare', 20, { def: 6, dex: 3, crit: 1 }, ['heels', '#d8283c', '#ffd23f']);
equip('sneakers_neon', 'ネオン・エアスニーカー', 'shoes', 'epic', 32, { def: 12, speed: 25, dex: 3 }, ['sneakers', '#19f0ff', '#ff3dd2'], { desc: '靴底が光る。足取りが軽い。' });
equip('boots_rocket', 'ニトロブーツ', 'shoes', 'legendary', 45, { def: 20, speed: 35, str: 4 }, ['boots', '#ff8a00', '#ffd23f']);
equip('heels_glass', 'ガラスのヒール', 'shoes', 'mythic', 55, { def: 26, speed: 40, dex: 6, luk: 6 }, ['heels', '#bff6ff', '#ffffff'], { desc: '零時を過ぎても魔法は解けない。' });

// ============ アクセ accessory ============
equip('sunglasses_aviator', 'アビエーターサングラス', 'accessory', 'common', 5, { def: 2, dex: 1 }, ['sunglasses', '#2a2a2a', '#ffd23f']);
equip('scarf_red', 'レッドスカーフ', 'accessory', 'common', 10, { def: 4, maxHp: 30 }, ['scarf', '#d8283c', '#ffffff']);
equip('gold_chain', 'ゴールドチェーン', 'accessory', 'rare', 15, { def: 3, str: 2, luk: 2 }, ['goldChain', '#ffd23f', '#fff4b0']);
equip('mask_skull', 'スカルマスク', 'accessory', 'rare', 22, { def: 6, atk: 3 }, ['mask', '#e8e8e8', '#16161e']);
equip('sunglasses_neon', 'ネオンシェード', 'accessory', 'rare', 28, { def: 5, dex: 3, crit: 2 }, ['sunglasses', '#ff3dd2', '#19f0ff']);
equip('gold_chain_heavy', 'ヘビーゴールドチェーン', 'accessory', 'epic', 36, { def: 8, str: 4, luk: 4, atk: 4 }, ['goldChain', '#ffb800', '#ffffff']);
equip('wings_angel', 'エンジェルウィング', 'accessory', 'legendary', 45, { def: 15, speed: 20, maxHp: 120, maxMp: 120 }, ['wings', '#ffffff', '#bff6ff'], { desc: '背中に小さな白い翼。' });
equip('halo_angel', '天使の輪', 'accessory', 'mythic', 52, { def: 18, atk: 10, int: 8, luk: 8, crit: 3 }, ['halo', '#fff06a', '#ffffff'], { desc: '罪深き街に降りた奇跡。' });
equip('wings_neon', 'ネオン・セラフ', 'accessory', 'mythic', 58, { def: 24, atk: 14, speed: 30, crit: 4 }, ['wings', '#ff3dd2', '#19f0ff'], { desc: 'ネオン管でできた六枚の翼。' });

// ============ 武器 weapon ============
weapon('sword_wood', '木剣', 'common', 0, { atk: 13 }, ['woodSword', '#b98a52', '#6a4a2a'], 'melee', 85, 2.4, { desc: '飾りのない木の剣。握りに布を巻いただけ。' });
weapon('knife_basic', 'ポケットナイフ', 'common', 0, { atk: 12 }, ['knife', '#c9ccd6', '#ff6fb5'], 'melee', 70, 3.0, { desc: '軽くて素早い。' });
weapon('staff_glitch', 'グリッチ・ワンド', 'common', 0, { atk: 10, int: 2, maxMp: 15 }, ['staff', '#3dff8a', '#1d1d24'], 'magic', 380, 1.8, { desc: 'ジャンク基板を巻きつけた自作の杖。たまにバグる。' });
weapon('bat_wood', 'ウッドバット', 'common', 0, { atk: 15 }, ['bat', '#b98a52', '#5a3a22'], 'melee', 90, 2.0, { desc: 'ジンの相棒。ホームランしか狙わない。' });
weapon('pistol_9mm', '9mmピストル', 'common', 5, { atk: 14 }, ['pistol', '#2a2a30', '#8a8a8a'], 'gun', 520, 2.6);
weapon('katana_steel', 'スチールカタナ', 'common', 10, { atk: 26 }, ['katana', '#dfe4ee', '#d8283c'], 'melee', 110, 2.0);
weapon('knife_butterfly', 'バタフライナイフ', 'rare', 12, { atk: 24, dex: 2, crit: 3 }, ['knife', '#ff3dd2', '#19f0ff'], 'melee', 75, 3.4);
weapon('bat_nail', '釘バット', 'rare', 15, { atk: 34, str: 2 }, ['bat', '#8a5a2b', '#c9ccd6'], 'melee', 95, 1.8);
weapon('smg_compact', 'コンパクトSMG', 'rare', 18, { atk: 18, dex: 2 }, ['smg', '#1d1d24', '#ff8a00'], 'gun', 480, 6.0);
weapon('guitar_electric', 'エレキギター', 'rare', 20, { atk: 38, str: 2, luk: 2 }, ['guitar', '#d8283c', '#f4f4f4'], 'melee', 100, 1.6, { desc: 'ライブの後は鈍器になる。' });
weapon('staff_neon', 'ネオンスタッフ', 'rare', 20, { atk: 30, int: 4, maxMp: 40 }, ['staff', '#19f0ff', '#b04dff'], 'magic', 420, 1.8, { desc: 'ネオン管を束ねた魔法の杖。' });
weapon('pistol_gold', 'ゴールデン・デザート', 'epic', 28, { atk: 40, dex: 4, crit: 3 }, ['pistol', '#ffd23f', '#16161e'], 'gun', 580, 2.8);
weapon('katana_blood', '紅月の太刀', 'epic', 32, { atk: 58, str: 4, crit: 4 }, ['katana', '#d8283c', '#16161e'], 'melee', 120, 2.0);
weapon('guitar_thunder', 'サンダー・フライングV', 'epic', 36, { atk: 64, str: 5, luk: 3 }, ['guitar', '#7a3dff', '#fff06a'], 'melee', 110, 1.7);
weapon('smg_neon', 'ネオン・ストーム', 'legendary', 42, { atk: 46, dex: 6, crit: 4 }, ['smg', '#ff3dd2', '#19f0ff'], 'gun', 540, 7.0);
weapon('neon_sword', 'ネオンソード', 'legendary', 45, { atk: 85, str: 5, dex: 5, crit: 5 }, ['neonSword', '#19f0ff', '#ffffff'], 'melee', 130, 2.2, { desc: '光の刃。ヴァイス・ベイの夜を切り裂く。' });
weapon('staff_moon', 'ムーンライト・ワンド', 'legendary', 45, { atk: 70, int: 10, maxMp: 150 }, ['staff', '#bff6ff', '#fff06a'], 'magic', 460, 2.0);
weapon('neon_sword_mythic', '覇王ネオンブレード', 'mythic', 55, { atk: 130, str: 10, dex: 10, crit: 8 }, ['neonSword', '#ff3dd2', '#fff06a'], 'melee', 145, 2.4, { desc: '街の夜明けを告げる、伝説の刃。' });
weapon('pistol_mythic', 'ラスト・サンセット', 'mythic', 55, { atk: 95, dex: 12, luk: 8, crit: 8 }, ['pistol', '#ff8a00', '#ff3dd2'], 'gun', 640, 3.2, { desc: '夕陽色の銃身。撃つたびに空が燃える。' });


// ============ v2: 後半〜エンドコンテンツ装備（Lv60〜90, 宇宙港・タワー地域ドロップ） ============
equip('helmet_astro', 'アストロヘルメット', 'hat', 'epic', 62, { def: 34, maxHp: 180, int: 4 }, ['helmet', '#e8eef8', '#19f0ff'], { desc: 'ルミナ宇宙港の船外活動用。' });
equip('cat_ears_cosmic', 'コズミック・ネコミミ', 'hat', 'legendary', 78, { def: 46, luk: 9, dex: 9, crit: 3 }, ['catEars', '#7a3dff', '#fff06a'], { desc: '耳の先で小さな星が瞬く。' });
equip('armor_astro', 'アストロアーマー', 'top', 'epic', 64, { def: 58, maxHp: 260 }, ['armorVest', '#dfe6f2', '#ff8a00'], { desc: '月面シミュ区画の試作スーツ。' });
equip('jacket_nebula', 'ネビュラ・レザー', 'top', 'legendary', 80, { def: 66, atk: 14, str: 8, dex: 8 }, ['leatherJacket', '#2a1a5c', '#ff3dd2'] , { desc: '星雲を染め込んだ革ジャン。' });
equip('pants_astro', 'アストロパンツ', 'bottom', 'epic', 64, { def: 40, maxHp: 160 }, ['armorPants', '#dfe6f2', '#19f0ff']);
equip('boots_moon', 'ムーンウォーカー', 'shoes', 'legendary', 76, { def: 30, speed: 40, dex: 7 }, ['boots', '#e8eef8', '#7a3dff'], { desc: '重力を半分くらい無視できる。' });
equip('halo_cosmic', 'コズミック・ヘイロー', 'accessory', 'mythic', 90, { def: 34, atk: 22, int: 12, luk: 12, crit: 5 }, ['halo', '#19f0ff', '#ff3dd2'], { desc: '宇宙の果てから来た光輪。' });
weapon('katana_plasma', 'プラズマ太刀', 'epic', 62, { atk: 105, str: 7, crit: 4 }, ['katana', '#19f0ff', '#ffffff'], 'melee', 125, 2.1);
weapon('pistol_ray', 'レイガン Mk-II', 'epic', 64, { atk: 82, dex: 8, crit: 4 }, ['pistol', '#e8eef8', '#5cff9a'], 'gun', 600, 3.0, { desc: '発射音は「ピュン」。' });
weapon('staff_star', 'スターゲイザー', 'legendary', 74, { atk: 112, int: 16, maxMp: 260 }, ['staff', '#fff06a', '#7a3dff'], 'magic', 480, 2.0);
weapon('neon_sword_void', 'ヴォイド・ネオンブレード', 'mythic', 88, { atk: 185, str: 14, dex: 14, crit: 9 }, ['neonSword', '#7a3dff', '#19f0ff'], 'melee', 150, 2.4, { desc: '謎の宇宙船の動力炉から削り出した刃。' });
weapon('smg_galaxy', 'ギャラクシー・ストーム', 'mythic', 88, { atk: 120, dex: 16, luk: 8, crit: 7 }, ['smg', '#ff3dd2', '#fff06a'], 'gun', 560, 7.5, { desc: '一秒間に星を七つ撃ち落とす。' });

// ============ v2: PET（専用スロット pet・超低確率ドロップ） ============
// pet: {pickRange(px), pickRate(秒あたり取得数), name}。装備すると追従し、アイテム・お金を自動で拾う。
function pet(id, name, style, color, accent, stats, pickRange, pickRate, desc) {
  equip(id, name, 'pet', 'pet', 0, stats, [style, color, accent], { pet: { pickRange, pickRate, name }, desc });
}
pet('pet_slime', 'ペット: プルプル', 'slimePet', '#5cff9a', '#ffffff', { maxHp: 20, luk: 1 }, 160, 1.0, 'ソーダ味のちびスライム。のんびり屋。');
pet('pet_flamingo', 'ペット: フラミー', 'flamingoPet', '#ff7fb0', '#ffd23f', { speed: 5, dex: 1 }, 190, 1.2, '片足立ちが得意なひなフラミンゴ。');
pet('pet_cat', 'ペット: ネオンにゃん', 'catPet', '#b04dff', '#19f0ff', { crit: 1, luk: 2 }, 220, 1.4, '路地裏生まれ。光るものが大好き。');
pet('pet_drone', 'ペット: ピコドローン', 'dronePet', '#19f0ff', '#ff3dd2', { dex: 2, maxMp: 30 }, 260, 1.6, '回収アームつきの小型ドローン。');
pet('pet_dolphin', 'ペット: ドルフィ', 'dolphinPet', '#4da6ff', '#bff6ff', { maxHp: 60, maxMp: 30 }, 240, 1.5, '空中をすいすい泳ぐ不思議なイルカ。');
pet('pet_gator', 'ペット: ワニ太郎', 'gatorPet', '#3f8f3a', '#ffd23f', { def: 6, str: 2 }, 230, 1.3, 'グランパの孫…らしい。噛まない。');
pet('pet_ghost', 'ペット: チップくん', 'ghostPet', '#e8f0ff', '#ffd23f', { luk: 4, crit: 1 }, 300, 2.0, 'カジノで負け続けた亡霊。今は幸運の味方。');
pet('pet_robot', 'ペット: ボルトくん', 'robotPet', '#c9ccd6', '#ff8a00', { def: 8, maxHp: 80 }, 330, 2.2, '宇宙港の整備ロボ。几帳面に全部拾う。');
pet('pet_dragon', 'ペット: ネオンドラゴン', 'dragonPet', '#ff3d7f', '#fff06a', { atk: 6, str: 3, dex: 3 }, 380, 2.6, '摩天楼の頂に棲む小竜。');
pet('pet_alien', 'ペット: ピポ', 'alienPet', '#5cff9a', '#7a3dff', { atk: 8, int: 4, luk: 4, crit: 2 }, 420, 3.0, '謎の宇宙船から付いてきた。テレパシーで拾う。');

// ============ 消費アイテム ============
consumable('potion_red', '赤ポーション', 'common', { hp: 50 }, 'potionRed', 25, 'HPを50回復。');
consumable('potion_orange', 'オレンジポーション', 'common', { hp: 150 }, 'potionRed', 80, 'HPを150回復。');
consumable('potion_white', 'ホワイトポーション', 'rare', { hp: 400 }, 'potionRed', 240, 'HPを400回復。');
consumable('potion_blue', '青ポーション', 'common', { mp: 50 }, 'potionBlue', 40, 'MPを50回復。');
consumable('potion_mana', 'マナエリクサー', 'rare', { mp: 200 }, 'potionBlue', 260, 'MPを200回復。');
consumable('elixir', 'エリクサー', 'epic', { hpPct: 1, mpPct: 1 }, 'elixir', 1500, 'HPとMPを全回復。');
consumable('power_elixir', 'ハーフエリクサー', 'rare', { hpPct: 0.5, mpPct: 0.5 }, 'elixir', 700, 'HPとMPを50%回復。');
consumable('drink_energy', 'ネオン・エナジー', 'rare', { buff: { id: 'drink_energy', name: 'エナジー', duration: 120, atkPct: 0.15, speedPct: 0.1, color: '#19f0ff' } }, 'potionBlue', 500, '120秒間 攻撃+15% 移動速度+10%。');
consumable('drink_tough', 'アイアン・ミルク', 'rare', { buff: { id: 'drink_tough', name: 'アイアン', duration: 120, defPct: 0.3, color: '#ffd23f' } }, 'potionRed', 500, '120秒間 防御+30%。');
consumable('drink_lucky', 'ラッキー・ソーダ', 'epic', { buff: { id: 'drink_lucky', name: 'ラッキー', duration: 180, luckAdd: 100, critAdd: 0.05, color: '#ff3dd2' } }, 'elixir', 1200, '180秒間 ドロップ率UP・クリティカル+5%。');

// ============ etc 素材 ============
etc('slime_jelly', 'スライムゼリー', 'common', 'gem', 5, 'ぷるぷる。ほんのりソーダ味。');
etc('mushroom_cap', 'キノコのかさ', 'common', 'gem', 8, '路地裏キノコのかさ。');
etc('flamingo_feather', 'フラミンゴの羽', 'common', 'gem', 12, '鮮やかなピンクの羽根。');
etc('street_tag', 'ギャングのワッペン', 'common', 'chip', 15, 'チンピラが付けていたワッペン。');
etc('cop_badge', '警官バッジ', 'rare', 'chip', 60, '持っているとヤバい代物。');
etc('stolen_vinyl', '盗まれたレコード', 'common', 'chip', 20, 'DJパルスの貴重なレコード。');
etc('toxic_goo', '毒々しいゼリー', 'common', 'gem', 18, '港の排水で育ったスライムの残骸。');
etc('gator_tooth', 'ワニの牙', 'common', 'gem', 25, '沼のワニの鋭い牙。');
etc('gator_scale', 'アルビノの鱗', 'rare', 'gem', 80, '真っ白なワニの鱗。');
etc('drone_chip', 'ドローンのチップ', 'common', 'chip', 30, '監視ドローンの制御チップ。');
etc('casino_chip', 'カジノチップ', 'common', 'cash', 35, 'ネオン・パレスの高額チップ。');
etc('gold_bar', '金の延べ棒', 'rare', 'cash', 1000, '高く売れる。');
etc('diamond', 'ブルーダイヤ', 'epic', 'gem', 5000, 'とても高く売れる。');
etc('neon_core', 'ネオンコア', 'epic', 'chip', 2500, 'メカ・ドローンの動力源。');
etc('king_crown_shard', '王冠のかけら', 'rare', 'gem', 400, 'キングゼリーの王冠の破片。');


// v2: 地域素材
etc('crab_shell', 'カニの甲羅', 'common', 'gem', 6, 'ビーチのカニの硬い甲羅。');
etc('seagull_feather', 'カモメの羽', 'common', 'gem', 6, 'ポテトの匂いがする。');
etc('jelly_tentacle', 'クラゲの触手', 'common', 'gem', 10, 'ぴりぴり痺れる。');
etc('rat_tail', 'ネズミのしっぽ', 'common', 'chip', 14, '地下鉄のネズミの尾。');
etc('neon_bulb', '割れたネオン管', 'common', 'chip', 20, 'ダウンタウンの看板の破片。');
etc('rusty_bolt', 'サビたボルト', 'common', 'chip', 24, '港の機械から外れた部品。');
etc('snake_skin', 'ヘビの抜け殻', 'common', 'gem', 28, 'スワンプのヘビの抜け殻。');
etc('mosquito_wing', 'ヌマカの羽', 'common', 'gem', 26, '透き通った虫の羽。');
etc('ghost_wisp', '亡霊のゆらめき', 'rare', 'gem', 60, 'カジノで負けた者の未練。');
etc('robot_gear', 'ロボの歯車', 'common', 'chip', 45, '精密な金色の歯車。');
etc('golem_core', 'ゴーレムの核', 'rare', 'gem', 120, '鉄骨を動かす謎の結晶。');
etc('alien_crystal', 'エイリアン・クリスタル', 'rare', 'gem', 200, '脈打つように光る。');
etc('moon_rock', '月の石（模造）', 'common', 'gem', 150, '月面シミュ区画の小道具…のはず。');
etc('pirate_map', '密輸船の海図', 'rare', 'chip', 300, 'ドンの密輸ルートが記されている。');
etc('rat_crown', 'ネズミの王冠', 'rare', 'gem', 250, 'ラットキングが被っていた空き缶の王冠。');
etc('alien_core', 'オーバーロード・コア', 'mythic', 'gem', 50000, '宇宙船の心臓部。触れると温かい。');

// ============ v3: 強化・潜在・PET 用アイテム（etc。use は inventory.useItem が解釈） ============
etc('chip_reroll', 'リロール・チップ', 'rare', 'chip', 1500, '装備の潜在能力を再設定する（結果を見てから採用/破棄を選べる）。潜在の無い装備にはレア潜在を付与。');
etc('chip_lock', 'ロック・チップ', 'epic', 'chip', 6000, '潜在の行を固定したまま再設定する（1行=1個、2行=3個）。');
etc('tune_ticket', 'チューン・チケット', 'epic', 'chip', 20000, 'ネオン・チューンを1回確定成功にする。');
etc('pet_food', 'ネオン・ペットフード', 'common', 'gem', 300, 'PET にあげると親密度 +20。');
list[list.length - 1].use = 'petFood';
etc('spire_token', 'スパイア・トークン', 'rare', 'chip', 100, 'ヴァイス・スパイアの交換所で使うトークン。');
etc('boss_trophy', 'ボス・トロフィー', 'epic', 'cash', 5000, 'ボスの周回報酬。交換所でボス固有装備と交換できる。');

// ============ v3: エンドコンテンツ装備（カオスボス・スパイア報酬。★20/25 まで強化可能） ============
equip('crown_caiman', 'ドンの黒王冠', 'hat', 'legendary', 100, { def: 70, atk: 20, str: 12, dex: 12, int: 12, luk: 12, maxHp: 400 }, ['crown', '#16161e', '#ffd23f'], { desc: 'カオス・ドン・カイマンの固有ドロップ。' });
equip('suit_vice', 'ヴァイス・キングスーツ', 'top', 'mythic', 110, { def: 95, atk: 24, str: 14, dex: 14, int: 14, luk: 14, maxHp: 600 }, ['suit', '#ff3dd2', '#19f0ff'], { desc: 'ボス・トロフィー交換所の目玉。' });
weapon('neon_sword_spire', 'スパイア・ブレード', 'mythic', 120, { atk: 260, str: 18, dex: 18, crit: 10 }, ['neonSword', '#fff06a', '#7a3dff'], 'melee', 155, 2.5, { desc: 'ヴァイス・スパイア 100階の報酬。' });
weapon('pistol_spire', 'スパイア・リボルバー', 'mythic', 120, { atk: 190, dex: 20, luk: 10, crit: 10 }, ['pistol', '#fff06a', '#7a3dff'], 'gun', 660, 3.4, { desc: 'ヴァイス・スパイア 100階の報酬。' });
weapon('staff_spire', 'スパイア・オラクル', 'mythic', 120, { atk: 175, int: 24, maxMp: 400, crit: 6 }, ['staff', '#fff06a', '#7a3dff'], 'magic', 500, 2.1, { desc: 'ヴァイス・スパイア 100階の報酬。' });
equip('halo_zog', 'ゾグの灯台', 'accessory', 'mythic', 150, { def: 60, atk: 40, str: 20, dex: 20, int: 20, luk: 20, crit: 6 }, ['halo', '#5cff9a', '#7a3dff'], { desc: 'カオス・オーバーロード・ゾグの極レア固有ドロップ。' });

// ============ v3: PET スキル（petSkills = 初期スキル。親密度 Lv10/20/30 で PET_SKILL_ORDER から1つずつ追加） ============
export const PET_SKILL_IDS = ['autoHp', 'autoMp', 'range', 'filter', 'autoSell'];
export const PET_SKILL_INFO = {
  autoHp: { name: '自動HPポーション', desc: 'HPが設定値以下で所持ポーションを自動使用（間隔1秒）' },
  autoMp: { name: '自動MPポーション', desc: 'MPが設定値以下で所持ポーションを自動使用（間隔1秒）' },
  range: { name: '取得範囲拡大', desc: '取得範囲 +40%' },
  filter: { name: '取得フィルタ', desc: '指定レア度未満の装備を拾わない' },
  autoSell: { name: '自動売却ボックス', desc: '拾った common 装備を即座に $ 化（売値×80%）' },
};
const PET_SKILLS = {
  pet_slime: ['autoHp'], pet_flamingo: ['autoHp', 'range'], pet_cat: ['autoHp', 'filter'], pet_drone: ['autoMp', 'range'],
  pet_dolphin: ['autoHp', 'autoMp'], pet_gator: ['autoHp', 'autoSell'], pet_ghost: ['autoMp', 'filter', 'autoSell'],
  pet_robot: ['autoHp', 'autoMp', 'autoSell'], pet_dragon: ['autoHp', 'autoMp', 'range'], pet_alien: ['autoHp', 'autoMp', 'range', 'filter'],
};
for (const it of list) if (it.slot === 'pet') it.petSkills = [...(PET_SKILLS[it.id] || ['autoHp'])];

// ============ v3: フレーバーテキスト（全装備） ============
for (const it of list) if (it.type === 'equip') it.lore = ITEM_LORE[it.id] || it.desc || `${it.name}。ヴァイス・ベイの夜で手に入れた一品。`;

export const ITEMS = Object.fromEntries(list.map((it) => [it.id, it]));

export function getItem(id) {
  return ITEMS[id] || null;
}

export const EQUIP_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'accessory', 'weapon', 'pet'];
// キャラクター描画に使う（drawCharacter に渡す）スロット。pet は Pet エンティティが描画する
export const WEAR_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'accessory', 'weapon'];
export const PET_STYLES = ['slimePet', 'flamingoPet', 'gatorPet', 'catPet', 'dronePet', 'ghostPet', 'alienPet', 'dragonPet', 'dolphinPet', 'robotPet'];
export const PET_IDS = list.filter((it) => it.slot === 'pet').map((it) => it.id);
export function isPet(item) { const it = typeof item === 'string' ? ITEMS[item] : item; return !!it && it.slot === 'pet'; }

export const STARTER_EQUIP = {
  // 初期装備は地味なセット（くすんだ布の服・普通のズボン・古い靴・木剣）。前の初期装備（ピンクのパーカーなど）はビーチの店で買える着せ替え用
  luna: { hat: null, top: 'shirt_plain', bottom: 'pants_plain', shoes: 'shoes_old', accessory: null, weapon: 'sword_wood', pet: null },
  jin: { hat: null, top: 'shirt_plain', bottom: 'pants_plain', shoes: 'shoes_old', accessory: null, weapon: 'sword_wood', pet: null },
  hacker: { hat: null, top: 'shirt_plain', bottom: 'pants_plain', shoes: 'shoes_old', accessory: null, weapon: 'staff_glitch', pet: null },
};
// v3: 性別ごとの初期装備の差し替え（STARTER_EQUIP に上書き）。newState(classId, {gender}) が使う
export const STARTER_EQUIP_GENDER = {};
export function starterEquipFor(classId, gender) {
  return { ...(STARTER_EQUIP[classId] || STARTER_EQUIP.luna), ...(STARTER_EQUIP_GENDER[classId]?.[gender] || {}) };
}

// 装備IDのテーブル {slot: itemId} から look テーブルを作る（敵の equip 等で使用）
export function looksFromIds(ids) {
  const o = { hat: null, top: null, bottom: null, shoes: null, weapon: null, accessory: null };
  // pet は敵の見た目には不要
  for (const [slot, id] of Object.entries(ids || {})) o[slot] = id && ITEMS[id] ? ITEMS[id].look : null;
  return o;
}
