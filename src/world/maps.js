// ワールドマップ定義（純データ + 小さなビルダー）
// 座標: y 下向き。groundY が地面。platforms は {x, y(上面), w, solid?}。
// solid !== true の足場は一方通行（下から抜けられ、↓+ジャンプで降りられる）。

const GROUND = 1000;

// [x, y, w, rope?] 形式から platforms / ropes を作る。
// rope が true なら足場の 30% 位置、数値ならその x にロープを垂らす（下の足場 or 地面まで）。
function build(def) {
  const groundY = def.groundY ?? GROUND;
  const platforms = def.plats.map(([x, y, w, rope, solid]) => ({ x, y, w, ...(solid ? { solid: true } : {}), _rope: rope }));
  const ropes = [...(def.ropes || [])];
  for (const p of platforms) {
    if (p._rope) {
      const rx = typeof p._rope === 'number' ? p._rope : Math.round(p.x + p.w * 0.3);
      let bottom = groundY;
      for (const q of platforms) {
        if (q === p) continue;
        if (q.y > p.y + 40 && q.y < bottom && rx >= q.x + 10 && rx <= q.x + q.w - 10) bottom = q.y;
      }
      ropes.push({ x: rx, top: p.y, bottom });
    }
    delete p._rope;
  }
  const out = {
    height: 1100,
    copSpawns: true,
    walls: [],
    vehicles: [],
    decor: [],
    npcs: [],
    ...def,
    groundY,
    platforms,
    ropes,
  };
  delete out.plats;
  // NPC の y 省略時は地面
  for (const n of out.npcs) if (n.y == null) n.y = groundY;
  for (const d of out.decor) if (d.y == null) d.y = groundY;
  return out;
}

// NPC 見た目ヘルパー（drawCharacter 用 look / equip = item.look 形式）
const L = (style, color, accent) => ({ style, color, accent: accent || color });

export const MAPS = {
  // ---------------------------------------------------------------- 1. 浜辺
  beach: build({
    id: 'beach', name: '初心者の浜辺 ヴァイス・ビーチ', theme: 'beach', levelRange: [1, 10],
    width: 3600, spawnX: 260, copSpawns: false, bgColor: '#ff9a6b',
    plats: [
      [380, 870, 260], [980, 870, 320], [1720, 870, 300], [2480, 870, 280], [3020, 870, 260],
      [600, 740, 260, true], [1260, 740, 320, 1330], [2060, 740, 280], [2760, 740, 260, true],
      [860, 610, 280, true], [1620, 610, 320, true], [2420, 610, 260, true],
      [1160, 480, 300, 1300], [2000, 480, 260, 2100],
    ],
    portals: [
      { x: 3480, y: GROUND, to: 'downtown', toX: 200, label: 'ネオン街へ' },
    ],
    spawns: [
      { x1: 800, x2: 1400, types: ['slime_green'], max: 6, interval: 4 },
      { x1: 1300, x2: 2300, types: ['slime_green', 'slime_pink', 'mushroom_orange'], max: 7, interval: 4 },
      { x1: 2200, x2: 3300, types: ['mushroom_orange', 'flamingo', 'slime_pink'], max: 7, interval: 5 },
      { x1: 1000, x2: 2400, types: ['flamingo', 'mushroom_orange'], max: 3, interval: 8 },
      { x1: 2900, x2: 3300, types: ['boss_king_slime'], max: 1, interval: 240, minLevel: 9 },
    ],
    npcs: [
      { id: 'rico', name: 'リコ', title: 'ビーチの情報屋', x: 380,
        look: { body: 'm', skin: '#c68e5e', hair: 'wolf', hairColor: '#1a1a1a', eyeColor: '#3b2a1a' },
        equip: { hat: L('cap', '#ff5fa2', '#ffffff'), top: L('hawaiian', '#19d3c5', '#ff5fa2'), bottom: L('shorts', '#2b4c7e'), shoes: L('sandals', '#c98b4a'), accessory: L('sunglasses', '#222222', '#ff5fa2') },
        dialog: ['よう、新入り！ ヴァイス・ベイへようこそ。', '←→で移動、Spaceでジャンプ、Xで攻撃だ。', 'ロープは↑↓で上り下り、↓+Spaceで足場から飛び降りられる。', 'ポータルの上で↑を押せば次の街へ行けるぜ。'] },
      { id: 'sunny', name: 'サニー', title: 'ライフガード兼売店', x: 620,
        look: { body: 'f', skin: '#f5d0b0', hair: 'ponytail', hairColor: '#ffcc66', eyeColor: '#2a7de1' },
        equip: { hat: L('headphones', '#ff7a00', '#ffffff'), top: L('tank', '#ff3b3b', '#ffffff'), bottom: L('shorts', '#ff3b3b'), shoes: L('sandals', '#c98b4a'), accessory: L('sunglasses', '#222222', '#ff7a00') },
        dialog: ['ハーイ！ 冷えたドリンクにポーション、なんでもあるわよ！', '無理は禁物。HPが減ったら 1/2 キーでポーションね。'],
        shop: ['potion_red', 'potion_blue', 'knife_basic', 'bat_wood', 'cap_street', 'tshirt_white', 'shorts_beach', 'sandals_beach', 'sunglasses_aviator'] },
    ],
    vehicles: [{ kind: 'bike', x: 760, color: '#ff5fa2' }],
    decor: [
      { type: 'palm', x: 120 }, { type: 'palm', x: 700 }, { type: 'flamingoStatue', x: 900 },
      { type: 'palm', x: 1150 }, { type: 'bench', x: 1500 }, { type: 'palm', x: 1900 },
      { type: 'billboard', x: 2200 }, { type: 'palm', x: 2600 }, { type: 'crate', x: 2950 },
      { type: 'palm', x: 3200 }, { type: 'neonSign', x: 3400 }, { type: 'lamp', x: 1250, y: 740 },
      { type: 'palm', x: 1700, y: 610 }, { type: 'flamingoStatue', x: 2100, y: 480 },
    ],
  }),

  // ---------------------------------------------------------------- 2. ネオン街
  downtown: build({
    id: 'downtown', name: 'ネオン街 ダウンタウン', theme: 'downtown', levelRange: [10, 20],
    width: 4200, spawnX: 200, bgColor: '#2a1446',
    plats: [
      [400, 870, 300], [1100, 870, 340], [1900, 870, 300], [2700, 870, 320], [3400, 870, 300],
      [650, 740, 300, true], [1450, 740, 360, true], [2300, 740, 300], [3050, 740, 320, true],
      [300, 610, 260, true], [1000, 610, 320], [1850, 610, 300, true], [2650, 610, 320, true], [3500, 610, 300, true],
      [700, 480, 340, true], [1500, 480, 300], [2250, 480, 340, true], [3100, 480, 300],
      [1150, 360, 360, 1300], [2700, 360, 360, 2850],
    ],
    portals: [
      { x: 90, y: GROUND, to: 'beach', toX: 3380, label: '浜辺へ' },
      { x: 4110, y: GROUND, to: 'slums', toX: 200, label: '港とスラムへ' },
    ],
    spawns: [
      { x1: 450, x2: 1500, types: ['thug_punk', 'mushroom_neon'], max: 7, interval: 4 },
      { x1: 1500, x2: 2800, types: ['mushroom_neon', 'thug_punk'], max: 8, interval: 4 },
      { x1: 2800, x2: 3950, types: ['thug_punk', 'mushroom_neon'], max: 7, interval: 5 },
      { x1: 800, x2: 3600, types: ['cop_patrol', 'drone_scout'], max: 2, interval: 15 },
    ],
    npcs: [
      { id: 'mama_rosa', name: 'ママ・ローザ', title: '食堂ローザ / ポーション', x: 380,
        look: { body: 'f', skin: '#d9a07a', hair: 'bob', hairColor: '#8b1e3f', eyeColor: '#3b2a1a' },
        equip: { hat: L('bandana', '#e63946', '#ffffff'), top: L('tshirt', '#ffffff', '#e63946'), bottom: L('skirt', '#8b1e3f'), shoes: L('loafers', '#3a2a1a'), accessory: L('goldChain', '#ffd166') },
        dialog: ['あら、腹ペコかい？ うちの料理とポーションは街いちばんさ。'],
        shop: ['potion_red', 'potion_orange', 'potion_blue', 'drink_energy'] },
      { id: 'officer_kai', name: 'カイ巡査', title: 'ヴァイス・ベイ市警', x: 1000,
        look: { body: 'm', skin: '#e0b090', hair: 'short', hairColor: '#2a1a10', eyeColor: '#1a2a4a' },
        equip: { hat: L('cap', '#1b2a4a', '#ffd166'), top: L('police', '#1b2a4a', '#ffd166'), bottom: L('suitPants', '#1b2a4a'), shoes: L('loafers', '#111111'), accessory: L('sunglasses', '#111111', '#ffd166') },
        dialog: ['…何も見てない。俺は何も見てないぞ。', '手配度が上がったら、しばらく警官の目から逃げ回れ。そのうち熱は冷める。'] },
      { id: 'ammo_shop', name: 'ブリック', title: '武器屋アモ・ストリート', x: 2050,
        look: { body: 'f', skin: '#d9a07a', hair: 'bob', hairColor: '#ff2e88', eyeColor: '#222' },
        equip: { hat: L('beanie', '#222', '#ff2e88'), top: L('armorVest', '#4b5320', '#222'), bottom: L('cargo', '#556b2f'), shoes: L('boots', '#222') },
        dialog: ['ネオン街一の品揃えよ。トラブルはお断り。'],
        shop: ['potion_red', 'potion_orange', 'potion_blue', 'pistol_9mm', 'katana_steel', 'beanie_gray', 'bandana_red', 'tank_black', 'hawaiian_shirt', 'cargo_khaki', 'scarf_red'] },
      { id: 'dash_garage', name: 'ダッシュ', title: 'ガレージ', x: 3650,
        look: { body: 'm', skin: '#8d5a3b', hair: 'spiky', hairColor: '#ffd166', eyeColor: '#222' },
        equip: { hat: L('cap', '#e63946', '#fff'), top: L('tracksuit', '#264653', '#e9c46a'), bottom: L('trackPants', '#264653'), shoes: L('sneakers', '#fff', '#e63946') },
        dialog: ['車ならそこに停めてあるのを使いな。Eで乗れるぜ。'] },
    ],
    vehicles: [{ kind: 'sports', x: 3850, color: '#ff2e88' }, { kind: 'sports', x: 1300, color: '#19d3c5' }],
    decor: [
      { type: 'neonSign', x: 250 }, { type: 'lamp', x: 500 }, { type: 'hydrant', x: 720 }, { type: 'car', x: 900 },
      { type: 'billboard', x: 1250 }, { type: 'graffiti', x: 1600 }, { type: 'lamp', x: 1800 }, { type: 'neonSign', x: 2200 },
      { type: 'bench', x: 2450 }, { type: 'palm', x: 2650 }, { type: 'hydrant', x: 2900 }, { type: 'lamp', x: 3200 },
      { type: 'graffiti', x: 3450 }, { type: 'neonSign', x: 3950 }, { type: 'billboard', x: 1300, y: 360 },
      { type: 'neonSign', x: 2850, y: 360 }, { type: 'crate', x: 1600, y: 480 },
    ],
  }),

  // ---------------------------------------------------------------- 3. 港とスラム
  slums: build({
    id: 'slums', name: '港とスラム ポート・ラスト', theme: 'slums', levelRange: [20, 30],
    width: 4400, spawnX: 200, bgColor: '#3b2b3a',
    plats: [
      [350, 870, 320], [1050, 870, 300], [1800, 870, 360], [2650, 870, 300], [3350, 870, 340],
      [700, 740, 300, true], [1450, 740, 300, true], [2250, 740, 340], [3000, 740, 300, true], [3750, 740, 300, true],
      [400, 610, 300, true], [1150, 610, 340], [1950, 610, 300, true], [2750, 610, 340, true], [3500, 610, 280],
      [800, 480, 320, true], [1650, 480, 300], [2400, 480, 320, true], [3200, 480, 320, true],
      [1950, 350, 420, 2100],
    ],
    walls: [{ x: 2600, y: 940, w: 120, h: 60 }],
    portals: [
      { x: 90, y: GROUND, to: 'downtown', toX: 3900, label: 'ネオン街へ' },
      { x: 4310, y: GROUND, to: 'swamp', toX: 200, label: 'ワニの沼へ' },
    ],
    spawns: [
      { x1: 450, x2: 1500, types: ['thug_dockhand', 'slime_toxic'], max: 7, interval: 4 },
      { x1: 1500, x2: 2900, types: ['slime_toxic', 'flamingo_punk', 'thug_dockhand'], max: 8, interval: 4 },
      { x1: 2900, x2: 4150, types: ['flamingo_punk', 'thug_gunner'], max: 7, interval: 5 },
      { x1: 700, x2: 3600, types: ['thug_gunner'], max: 4, interval: 7 },
    ],
    npcs: [
      { id: 'dj_pulse', name: 'DJパルス', title: '地下レイブの主催', x: 380,
        look: { body: 'f', skin: '#8d5a3b', hair: 'twin', hairColor: '#b04dff', eyeColor: '#19f0ff' },
        equip: { hat: L('headphones', '#19f0ff', '#ff2e88'), top: L('hoodie', '#1a1a2e', '#b04dff'), bottom: L('shorts', '#1a1a2e'), shoes: L('sneakers', '#ffffff', '#b04dff'), accessory: L('sunglasses', '#ff2e88', '#19f0ff') },
        dialog: ['今夜も倉庫はフロアが揺れてるぜ。ビートに乗れるヤツは大歓迎さ。'] },
      { id: 'tank', name: 'タンク', title: '港のメカニック', x: 3500,
        look: { body: 'm', skin: '#6b4226', hair: 'short', hairColor: '#111', eyeColor: '#222' },
        equip: { hat: L('beanie', '#2a9d8f'), top: L('tank', '#3d405b', '#e76f51'), bottom: L('cargo', '#3d405b'), shoes: L('boots', '#222222'), accessory: L('goldChain', '#ffd166') },
        dialog: ['車が要る？ そこのバイクを使いな。Eで乗れる。', '轢きすぎるとサツが飛んでくるぞ。'] },
      { id: 'sal_pawn', name: 'サル', title: '質屋', x: 2050,
        look: { body: 'm', skin: '#e0b48a', hair: 'bob', hairColor: '#777', eyeColor: '#333' },
        equip: { top: L('suit', '#5c4033', '#ffd166'), bottom: L('suitPants', '#5c4033'), shoes: L('loafers', '#3a2a1a'), accessory: L('sunglasses', '#111') },
        dialog: ['盗品？ うちは何も聞かない主義でね。'],
        shop: ['potion_orange', 'potion_blue', 'potion_mana', 'smg_compact', 'bat_nail', 'guitar_electric', 'staff_neon', 'tracksuit_green', 'track_pants', 'loafers_brown', 'heels_red'] },
    ],
    vehicles: [{ kind: 'bike', x: 3600, color: '#e76f51' }],
    decor: [
      { type: 'container', x: 260 }, { type: 'crate', x: 600 }, { type: 'graffiti', x: 850 }, { type: 'lamp', x: 1100 },
      { type: 'container', x: 1350 }, { type: 'crate', x: 1700 }, { type: 'hydrant', x: 1900 }, { type: 'graffiti', x: 2300 },
      { type: 'container', x: 2900 }, { type: 'lamp', x: 3150 }, { type: 'crate', x: 3400 }, { type: 'container', x: 3900 },
      { type: 'car', x: 4100 }, { type: 'crate', x: 2100, y: 350 }, { type: 'graffiti', x: 1300, y: 610 },
    ],
  }),

  // ---------------------------------------------------------------- 4. ワニの沼
  swamp: build({
    id: 'swamp', name: 'ワニの沼 グレイズ湿地', theme: 'swamp', levelRange: [25, 40],
    width: 4600, spawnX: 200, copSpawns: false, bgColor: '#1f3b2c',
    plats: [
      [300, 880, 280], [900, 860, 300], [1600, 880, 280], [2300, 860, 320], [3000, 880, 300], [3700, 860, 300],
      [550, 740, 300, true], [1250, 730, 320, true], [1950, 740, 300, true], [2700, 730, 300], [3400, 740, 320, true], [4050, 740, 280, true],
      [850, 600, 320, true], [1650, 600, 300], [2400, 600, 340, true], [3150, 600, 300, true], [3850, 600, 280],
      [1200, 470, 320, true], [2000, 460, 300, true], [2800, 470, 320, true], [3550, 470, 300],
      [2300, 340, 360, 2450],
    ],
    portals: [
      { x: 90, y: GROUND, to: 'slums', toX: 4100, label: '港とスラムへ' },
      { x: 4510, y: GROUND, to: 'casino', toX: 200, label: 'カジノ街へ' },
    ],
    spawns: [
      { x1: 450, x2: 1600, types: ['gator_swamp', 'mushroom_bog'], max: 7, interval: 4 },
      { x1: 1600, x2: 3000, types: ['gator_swamp', 'mushroom_bog', 'gator_albino'], max: 8, interval: 4 },
      { x1: 3000, x2: 4350, types: ['gator_albino', 'mushroom_bog'], max: 7, interval: 5 },
      { x1: 800, x2: 4000, types: ['flamingo_punk'], max: 3, interval: 8 },
      { x1: 2100, x2: 2700, types: ['boss_gator'], max: 1, interval: 240, minLevel: 26 },
    ],
    npcs: [
      { id: 'old_boone', name: 'ブーンじいさん', title: 'ワニ猟師', x: 380,
        look: { body: 'm', skin: '#c08a60', hair: 'long', hairColor: '#dddddd', eyeColor: '#3b2a1a' },
        equip: { hat: L('cowboy', '#6b4a2a', '#3a2a1a'), top: L('leatherJacket', '#5c4033', '#c9a227'), bottom: L('cargo', '#4b5320'), shoes: L('boots', '#3a2a1a') },
        dialog: ['ワシの沼へようこそ、若いの。', '沼の主グランパ・ゲイターには近づくんじゃないぞ…'] },
      { id: 'voodoo_betty', name: 'ブードゥー・ベティ', title: '沼の魔女の薬屋', x: 1150,
        look: { body: 'f', skin: '#7a4b2a', hair: 'long', hairColor: '#2d6a4f', eyeColor: '#d4ff4f' },
        equip: { hat: L('cowboy', '#4a3b2a'), top: L('hoodie', '#2d6a4f', '#d4ff4f'), bottom: L('skirt', '#3a2a1a'), shoes: L('boots', '#3a2a1a'), accessory: L('scarf', '#9b5de5') },
        dialog: ['沼の主が目を覚ましたよ…気をつけな。'],
        shop: ['potion_orange', 'potion_white', 'potion_mana', 'elixir', 'drink_energy', 'cowboy_hat', 'mask_skull', 'suit_pants'] },
    ],
    vehicles: [],
    decor: [
      { type: 'mangrove', x: 200 }, { type: 'mangrove', x: 650 }, { type: 'crate', x: 1000 }, { type: 'mangrove', x: 1350 },
      { type: 'flamingoStatue', x: 1700 }, { type: 'mangrove', x: 2100 }, { type: 'mangrove', x: 2600 }, { type: 'lamp', x: 2900 },
      { type: 'mangrove', x: 3300 }, { type: 'mangrove', x: 3800 }, { type: 'billboard', x: 4300 }, { type: 'mangrove', x: 2450, y: 340 },
    ],
  }),

  // ---------------------------------------------------------------- 5. カジノ街
  casino: build({
    id: 'casino', name: 'カジノ街 ゴールデン・ストリップ', theme: 'casino', levelRange: [35, 50],
    width: 4800, spawnX: 200, bgColor: '#3a0a3a',
    plats: [
      [400, 870, 340], [1150, 870, 320], [1950, 870, 340], [2800, 870, 320], [3600, 870, 340],
      [700, 740, 320, true], [1500, 740, 340, true], [2350, 740, 320], [3200, 740, 340, true], [4000, 740, 320, true],
      [350, 610, 300, true], [1100, 610, 320], [1900, 610, 340, true], [2750, 610, 320, true], [3550, 610, 320],
      [750, 480, 340, true], [1550, 480, 320], [2350, 480, 340, true], [3150, 480, 340, true], [3950, 480, 300],
      [1300, 350, 400, 1450], [2900, 350, 400, 3050],
    ],
    portals: [
      { x: 90, y: GROUND, to: 'swamp', toX: 4300, label: 'ワニの沼へ' },
      { x: 4710, y: GROUND, to: 'rooftop', toX: 200, label: '摩天楼屋上へ' },
    ],
    spawns: [
      { x1: 450, x2: 1700, types: ['thug_bouncer', 'slime_gold'], max: 7, interval: 4 },
      { x1: 1700, x2: 3200, types: ['slime_gold', 'thug_bouncer'], max: 8, interval: 4 },
      { x1: 3200, x2: 4550, types: ['thug_bouncer', 'drone_casino'], max: 7, interval: 5 },
      { x1: 600, x2: 4200, types: ['drone_casino'], max: 4, interval: 8 },
      { x1: 3700, x2: 4300, types: ['boss_mecha'], max: 1, interval: 240, minLevel: 38 },
    ],
    npcs: [
      { id: 'vivi', name: 'ヴィヴィ', title: 'ネオン・パレスのディーラー', x: 380,
        look: { body: 'f', skin: '#f2c7a5', hair: 'long', hairColor: '#111', eyeColor: '#c77dff' },
        equip: { top: L('idolDress', '#c77dff', '#ffd166'), bottom: L('skirt', '#3c096c'), shoes: L('heels', '#ffd166'), accessory: L('goldChain', '#ffd166') },
        dialog: ['ゴールデン・ストリップへようこそ。今夜の運試しはいかが？'] },
      { id: 'don_caiman', name: 'ドン・カイマン', title: 'カジノ王', x: 3500,
        look: { body: 'm', skin: '#d0a070', hair: 'wolf', hairColor: '#e8e8e8', eyeColor: '#ffd23f' },
        equip: { hat: L('crown', '#ffd23f', '#ff2e88'), top: L('suit', '#ffd23f', '#16161e'), bottom: L('suitPants', '#16161e'), shoes: L('loafers', '#3a2a1a'), accessory: L('goldChain', '#ffd23f') },
        dialog: ['フッ…この街の夜は全て私のものだ。', '用があるなら、摩天楼の屋上まで来るんだな。'] },
      { id: 'mr_chip', name: 'ミスター・チップ', title: '景品交換所', x: 2500,
        look: { body: 'm', skin: '#e8b88f', hair: 'short', hairColor: '#ffd166', eyeColor: '#222' },
        equip: { hat: L('cowboy', '#ffd166', '#222'), top: L('suit', '#ffffff', '#ffd166'), bottom: L('suitPants', '#ffffff'), shoes: L('loafers', '#ffd166'), accessory: L('sunglasses', '#ffd166') },
        dialog: ['チップがあるなら、とびきりの品と交換だ。'],
        shop: ['potion_white', 'potion_mana', 'elixir', 'power_elixir', 'drink_lucky', 'pistol_gold', 'katana_blood', 'suit_black', 'sunglasses_neon', 'idol_dress'] },
    ],
    vehicles: [{ kind: 'sports', x: 4300, color: '#ffd166' }],
    decor: [
      { type: 'slotMachine', x: 250 }, { type: 'neonSign', x: 550 }, { type: 'palm', x: 850 }, { type: 'slotMachine', x: 1050 },
      { type: 'billboard', x: 1350 }, { type: 'neonSign', x: 1750 }, { type: 'slotMachine', x: 2100 }, { type: 'palm', x: 2400 },
      { type: 'lamp', x: 2700 }, { type: 'neonSign', x: 3000 }, { type: 'slotMachine', x: 3400 }, { type: 'car', x: 3800 },
      { type: 'palm', x: 4100 }, { type: 'neonSign', x: 4550 }, { type: 'slotMachine', x: 1450, y: 350 },
      { type: 'slotMachine', x: 3050, y: 350 },
    ],
  }),

  // ---------------------------------------------------------------- 6. 摩天楼屋上（ボス）
  rooftop: build({
    id: 'rooftop', name: '摩天楼屋上 ヴァイス・タワー', theme: 'rooftop', levelRange: [45, 60],
    width: 3200, spawnX: 200, copSpawns: true, bgColor: '#0d0b26',
    plats: [
      [350, 870, 300], [1000, 860, 320], [2000, 860, 320], [2650, 870, 300],
      [600, 730, 300, true], [1450, 740, 300, true], [2350, 730, 300, true],
      [300, 600, 260, true], [1000, 600, 300], [1950, 600, 300], [2700, 600, 260, true],
      [700, 470, 300, true], [2200, 470, 300, true],
      [1350, 380, 500, 1500],
    ],
    portals: [
      { x: 90, y: GROUND, to: 'casino', toX: 4500, label: 'カジノ街へ' },
      { x: 3110, y: GROUND, to: 'beach', toX: 260, label: '浜辺へ戻る' },
    ],
    spawns: [
      { x1: 400, x2: 1250, types: ['thug_hitman', 'mushroom_mutant'], max: 5, interval: 6 },
      { x1: 2000, x2: 3000, types: ['mushroom_mutant', 'swat_heavy', 'thug_hitman'], max: 5, interval: 6 },
      { x1: 500, x2: 2800, types: ['drone_attack'], max: 3, interval: 9 },
      { x1: 1300, x2: 1900, types: ['boss_don'], max: 1, interval: 180, minLevel: 45 },
    ],
    npcs: [
      { id: 'nova', name: 'ノヴァ', title: '天才ハッカー', x: 380,
        look: { body: 'f', skin: '#f5d0b0', hair: 'twin', hairColor: '#19d3c5', eyeColor: '#ff2e88' },
        equip: { hat: L('catEars', '#19d3c5', '#ff2e88'), top: L('hoodie', '#1a1a2e', '#19d3c5'), bottom: L('shorts', '#1a1a2e'), shoes: L('sneakers', '#19d3c5'), accessory: L('mask', '#111', '#ff2e88') },
        dialog: ['ドンはこの屋上にいる。準備はいい？'] },
    ],
    vehicles: [],
    decor: [
      { type: 'neonSign', x: 450 }, { type: 'billboard', x: 800 }, { type: 'lamp', x: 1150 }, { type: 'crate', x: 1300 },
      { type: 'neonSign', x: 1600 }, { type: 'crate', x: 1900 }, { type: 'billboard', x: 2300 }, { type: 'lamp', x: 2600 },
      { type: 'neonSign', x: 2950 }, { type: 'neonSign', x: 1600, y: 380 },
    ],
  }),
};

export const MAP_ORDER = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop'];
export function getMap(id) { return MAPS[id] || null; }
