// 町ごとのショップ品揃え（提案。ワールド担当が maps.js の npcs[].shop に使う。全 itemId は ITEMS に実在）
// 地域の Lv 帯に合わせて「消費アイテム＋その地域で使う装備」を並べる。PET・ミシックは売らない。
export const TOWN_SHOPS = {
  beach: [
    { npcId: 'sunny', name: 'サニーのビーチ売店', items: ['potion_red', 'potion_blue', 'potion_orange', 'sandals_beach', 'shorts_beach', 'tshirt_white', 'cap_street', 'sunglasses_aviator', 'pistol_9mm', 'knife_basic', 'bat_wood'] },
  ],
  downtown: [
    { npcId: 'mama_rosa', name: 'ママ・ローザの食堂', items: ['potion_red', 'potion_orange', 'potion_blue', 'drink_energy', 'drink_tough'] },
    { npcId: 'shop_downtown', name: 'ネオン・ブティック', items: ['beanie_gray', 'bandana_red', 'tank_black', 'hawaiian_shirt', 'cargo_khaki', 'loafers_brown', 'scarf_red', 'katana_steel', 'bat_nail', 'knife_butterfly'] },
  ],
  slums: [
    { npcId: 'tank', name: 'タンクのガレージ', items: ['potion_orange', 'potion_blue', 'potion_white', 'drink_energy', 'drink_tough', 'cargo_khaki', 'track_pants', 'tracksuit_green', 'boots_black', 'smg_compact', 'guitar_electric', 'mask_skull'] },
  ],
  swamp: [
    { npcId: 'old_boone', name: 'ブーンの猟師小屋', items: ['potion_orange', 'potion_white', 'potion_mana', 'power_elixir', 'cowboy_hat', 'heels_red', 'staff_neon', 'police_uniform', 'suit_pants'] },
  ],
  casino: [
    { npcId: 'vivi', name: 'ネオン・パレス両替所', items: ['potion_white', 'potion_mana', 'power_elixir', 'drink_lucky', 'suit_black', 'sunglasses_neon', 'gold_chain', 'pistol_gold', 'idol_dress', 'helmet_moto'] },
  ],
  rooftop: [
    { npcId: 'nova', name: 'ノヴァの闇マーケット', items: ['potion_white', 'potion_mana', 'power_elixir', 'elixir', 'drink_energy', 'drink_tough', 'drink_lucky', 'armor_vest', 'armor_pants', 'sneakers_neon', 'cat_ears_neon', 'katana_blood', 'guitar_thunder'] },
  ],
  spaceport: [
    { npcId: 'ace_jet', name: 'ジェットの宇宙食ストア', items: ['potion_white', 'potion_mana', 'power_elixir', 'elixir', 'drink_energy', 'drink_tough', 'drink_lucky'] },
    { npcId: 'dr_stella', name: 'ステラ研究所の払い下げ品', items: ['helmet_astro', 'armor_astro', 'pants_astro', 'katana_plasma', 'pistol_ray', 'gold_chain_heavy', 'staff_moon'] },
  ],
};

/** ショップ専用 NPC（ミッションを持たない売り子）の提案 */
export const SHOP_NPCS = {
  shop_downtown: { name: 'ブティック店員ミミ', mapId: 'downtown', role: 'ダウンタウンの古着屋。ストリート系装備を売る。' },
};
