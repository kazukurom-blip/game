// スキルの「動き」のデータ（JOBS.md 4 章の全 306 スキル）。
// 名前・種類・最大Lv・効果の文・MP・前提は JOBS.md の表から読む（classic-unity/Data/tools/export_data.mjs）。
// ここに書くのは、表に無い「どう動くか」: 当たる範囲・同時に当たる数・回数・ダメージの式・動きの種類・ディレイ・状態異常など。
// 式の x はスキルの Lv、lv はキャラの Lv。範囲（range）は px（主人公の足元から、front = 向いている方）。値の根拠は FEEL.md の「似」。
//
// 職（JOBS.md 4 章の見出しの名前） → [ID の頭, 系統, 段階, 枝（2 次で選ぶ番号）, その職の武器]
// 武器の名前はデータ（items.json の weaponType）と同じ日本語。
export const W = {
  sword: ['片手剣', '両手剣'], axe: ['片手斧', '両手斧'], blunt: ['片手鈍器', '両手鈍器'], spear: ['槍'], pole: ['矛'],
  bow: ['弓'], xbow: ['クロスボウ'], claw: ['クロー'], dagger: ['短剣'], knuckle: ['ナックル'], gun: ['銃'], wand: ['ワンド', 'スタッフ'],
};

export const SKILL_JOBS = {
  初心者: ['beginner', 'beginner', 0, -1, null],
  戦士: ['warrior', 'warrior', 1, -1, null],
  ファイター: ['fighter', 'warrior', 2, 0, [...W.sword, ...W.axe]],
  クルセイダー: ['crusader', 'warrior', 3, 0, [...W.sword, ...W.axe]],
  チャンピオン: ['champion', 'warrior', 4, 0, [...W.sword, ...W.axe]],
  ページ: ['page', 'warrior', 2, 1, [...W.sword, ...W.blunt]],
  ナイト: ['knight', 'warrior', 3, 1, [...W.sword, ...W.blunt]],
  パラディン: ['paladin', 'warrior', 4, 1, [...W.sword, ...W.blunt]],
  スピアマン: ['spearman', 'warrior', 2, 2, [...W.spear, ...W.pole]],
  ドラグーン: ['dragoon', 'warrior', 3, 2, [...W.spear, ...W.pole]],
  ダークナイト: ['darkknight', 'warrior', 4, 2, [...W.spear, ...W.pole]],
  魔法使い: ['magician', 'magician', 1, -1, null],
  ファイアウィザード: ['firewizard', 'magician', 2, 0, null],
  ファイアメイジ: ['firemage', 'magician', 3, 0, null],
  ファイアアークメイジ: ['firearchmage', 'magician', 4, 0, null],
  アイスウィザード: ['icewizard', 'magician', 2, 1, null],
  アイスメイジ: ['icemage', 'magician', 3, 1, null],
  アイスアークメイジ: ['icearchmage', 'magician', 4, 1, null],
  クレリック: ['cleric', 'magician', 2, 2, null],
  プリースト: ['priest', 'magician', 3, 2, null],
  ビショップ: ['bishop', 'magician', 4, 2, null],
  弓使い: ['bowman', 'bowman', 1, -1, null],
  ハンター: ['hunter', 'bowman', 2, 0, W.bow],
  レンジャー: ['ranger', 'bowman', 3, 0, W.bow],
  マスターアーチャー: ['masterarcher', 'bowman', 4, 0, W.bow],
  クロスボウマン: ['crossbowman', 'bowman', 2, 1, W.xbow],
  スナイパー: ['sniper', 'bowman', 3, 1, W.xbow],
  マークスマン: ['marksman', 'bowman', 4, 1, W.xbow],
  盗賊: ['thief', 'thief', 1, -1, null],
  アサシン: ['assassin', 'thief', 2, 0, W.claw],
  ハーミット: ['hermit', 'thief', 3, 0, W.claw],
  ナイトストーカー: ['nightstalker', 'thief', 4, 0, W.claw],
  バンディット: ['bandit', 'thief', 2, 1, W.dagger],
  ローグ: ['rogue', 'thief', 3, 1, W.dagger],
  シャドウブレード: ['shadowblade', 'thief', 4, 1, W.dagger],
  海賊: ['pirate', 'pirate', 1, -1, null],
  ブローラー: ['brawler', 'pirate', 2, 0, W.knuckle],
  ストライカー: ['striker', 'pirate', 3, 0, W.knuckle],
  ファイトマスター: ['fightmaster', 'pirate', 4, 0, W.knuckle],
  ガンスリンガー: ['gunslinger', 'pirate', 2, 1, W.gun],
  アウトロー: ['outlaw', 'pirate', 3, 1, W.gun],
  キャプテン: ['captain', 'pirate', 4, 1, W.gun],
};

// ---------------- 当たる範囲（似）
const R = {
  melee: { front: 80, back: 10, up: 60, down: 10 },          // 前の 1 体（剣・短剣・拳）
  reach: { front: 110, back: 10, up: 60, down: 10 },         // 槍・矛の長い突き
  wide: { front: 130, back: 25, up: 75, down: 15 },          // 前の数体（なぎ払い型）
  wideLong: { front: 160, back: 25, up: 80, down: 15 },      // 槍・矛の前の数体
  around: (r = 120, up = 80) => ({ front: r, back: r, up, down: 20, around: true }), // 自分のまわり
  shot: (f = 350) => ({ front: f, back: 0, up: 40, down: 20 }),     // 前へ真っすぐ（1 体）
  line: (f = 400) => ({ front: f, back: 0, up: 30, down: 15 }),     // 一直線（貫く）
  fan: (f = 330) => ({ front: f, back: 0, up: 110, down: 50 }),     // 前の扇形
  area: (f = 320) => ({ front: f, back: 30, up: 130, down: 40 }),   // 前の広い範囲
  screen: { front: 420, back: 420, up: 320, down: 280, around: true }, // 画面の敵
};

// ---------------- よく出る形
const mastery = (id, weapons, extra = {}) => ({ id, passive: [{ weapons, mastery: '10+5*ceil(x/2)', stats: { acc: 'x' }, ...extra }] });
const booster = (id, weapons) => ({ id, buff: { sec: '10*x', booster: 2, weapons } });
const finalAttack = (id, weapons) => ({ id, passive: [{ weapons, finalAttack: { chance: '2*x', damage: '100+3*x' } }] });
const mpRecovery3 = { id: 'mp_recovery', passive: [{ mpRegen: 'x+lv/10' }] };
const shieldMastery = { id: 'shield_mastery', passive: [{ shieldDefPct: '5*x' }] };
const powerGuard = { id: 'power_guard', buff: { sec: '4*x', reflect: '10+x' } };
const allStats = { id: 'blessing', buff: { sec: '30*x', statPct: 'ceil(x/2)' } };
const will = { id: 'will', cooldown: '600-60*x', cure: true };
const stoic = { id: 'stoic', passive: [{ damageTaken: 'ceil(x/2)' }] };
const rush = { id: 'rush', damage: '80+4*x', targets: '10', range: R.wide, dash: 420, dashTime: 0.35, delay: 1.3, push: 60 };
const magnet = { id: 'monster_magnet', targets: '1', pull: { chance: '40+2*x' }, range: { front: 320, back: 0, up: 70, down: 30 }, motion: 'cast' };
const guardShield = { id: 'guard', passive: [{ guard: '10+x' }] };
const mpEater = { id: 'mp_eater', passive: [{ mpEater: { chance: '10+x', pct: '2+x/2' } }] };
const meditation = { id: 'meditation', buff: { sec: '10*x', stats: { matk: 'x' } } };
const teleport = { id: 'teleport', kind: 'movement', teleport: '150+5*x' };
const slow = { id: 'slow', kind: 'area', targets: '6', range: R.around(200), magic: true, motion: 'cast', status: [{ type: 'slow', chance: '100', sec: '3*x', power: '2*x' }] };
const seal = { id: 'seal', kind: 'area', targets: '6', range: R.around(200), magic: true, motion: 'cast', status: [{ type: 'seal', chance: '30+3*x', sec: '2*x' }] };
const magicBooster = { id: 'magic_booster', buff: { sec: '10*x', booster: 2, weapons: W.wand } };
const amplify = { id: 'amplify', passive: [{ amp: { damage: 'x', mp: 'x' }, mastery: '60' }] };
const resistPierce = { id: 'element_resist', passive: [{ resistPierce: 'x' }] };
const magicReflect = { id: 'magic_reflect', buff: { sec: '4*x', magicReflect: '10+2*x' } };
const infinity = { id: 'infinity', cooldown: '600', buff: { sec: '10+x', noMp: true, infinity: 4 } };
const bigBang = (el) => ({ id: 'big_bang', kind: 'area', magic: true, spell: '200+12*x', element: el, targets: '15', range: R.around(220, 120), charge: 2 });
const soulArrow = (id) => ({ id, buff: { sec: '10*x', noAmmo: true } });
const knockback = { id: 'power_knockback', kind: 'area', damage: '100+5*x', targets: '6', range: R.wide, motion: 'swing', ammo: false, rangeBonus: false, knockback: true };
const execute = { id: 'mortal_blow', passive: [{ execute: { chance: 'x', hpPct: '10' } }] };
const puppet = { id: 'puppet', kind: 'summon', summonSec: '60', decoy: { hpPct: '50+5*x' } };
const quadShot = { id: 'quad_shot', damage: '70+3*x', targets: '1', hits: '4', range: R.shot(380), delay: 1.3 };
const windStance = { id: 'wind_stance', buff: { sec: '10*x', stats: { speed: 'x' } } };
const sharpEyes = { id: 'sharp_eyes', buff: { sec: '10*x', critRate: 'x', critDamage: 'x' } };
const enduranceThief = { id: 'endure', passive: [{ ropeRegenInterval: '30-x' }] };
const haste = { id: 'haste', buff: { sec: '10*x', stats: { speed: 'x', jump: 'ceil(x/2)' } } };
const shadowShifter = { id: 'shadow_shifter', passive: [{ dodge: 'x' }] };
const ninjaAmbush = { id: 'ninja_ambush', kind: 'area', damage: '60+3*x', targets: '10', range: R.around(200), motion: 'cast', ticks: { count: 5, interval: 1 }, ammo: false, rangeBonus: false, weapons: null };
const taunt = { id: 'taunt', kind: 'area', targets: '6', range: R.wide, motion: 'cast', ammo: false, rangeBonus: false, weapons: null, debuff: { defPct: 'x', sec: '4*x' }, mark: { exp: 'x/2', sec: '4*x' } };

// ---------------- 職ごと（キーは JOBS.md の表のスキル名。★は付けない）
export const SKILL_MECH = {
  初心者: {
    石つぶて: { id: 'pebble', kind: 'ranged', fixed: '15*x', targets: '1', hits: '1', range: { front: 200, back: 0, up: 40, down: 20 }, motion: 'throw' },
    ひと休み: { id: 'rest', kind: 'heal', buff: { sec: '30', hotHp: '8*x', hotInterval: 10 } },
    身軽な足: { id: 'nimble_feet', buff: { sec: '4*x', stats: { speed: '15' } } },
  },
  戦士: {
    HP回復力アップ: { id: 'hp_recovery', passive: [{ hpRegen: '3*x' }] },
    最大HPアップ: { id: 'max_hp', passive: [{ levelHp: '2*x', apHp: 'x' }] },
    我慢: { id: 'endure', passive: [{ ropeRegenInterval: '30-2*x' }] },
    鉄の体: { id: 'iron_body', buff: { sec: '10*x', stats: { wdef: '3*x' } } },
    強打: { id: 'power_strike', kind: 'attack', damage: '160+5*x', targets: '1', hits: '1', range: { front: 75, back: 10, up: 60, down: 10 } },
    なぎ払い: { id: 'slash_blast', kind: 'area', hp: '5', damage: '60+3*x', targets: '6', hits: '1', range: { front: 110, back: 25, up: 70, down: 15 } },
  },
  ファイター: {
    剣の熟練: mastery('sword_mastery', W.sword),
    斧の熟練: mastery('axe_mastery', W.axe),
    剣の加速: booster('sword_booster', W.sword),
    斧の加速: booster('axe_booster', W.axe),
    剣の追撃: finalAttack('sword_final', W.sword),
    斧の追撃: finalAttack('axe_final', W.axe),
    闘志: { id: 'rage', buff: { sec: '4*x', stats: { watk: 'ceil(2*x/3)', wdef: '-ceil(x/2)' } } },
    守りの構え: powerGuard,
  },
  クルセイダー: {
    MP回復力アップ: mpRecovery3,
    盾の熟練: shieldMastery,
    闘気: { id: 'combo', buff: { sec: '4*x', combo: { max: 5, damage: 'x/2+5' } } },
    '闘気爆発・剣': { id: 'panic_sword', damage: '300+10*x', targets: '1', range: R.melee, weapons: W.sword, combo: { use: 'all' }, status: [{ type: 'darkness', chance: '100', sec: '10', power: 'x' }], delay: 1.2 },
    '闘気爆発・斧': { id: 'panic_axe', damage: '300+10*x', targets: '1', range: R.melee, weapons: W.axe, combo: { use: 'all' }, status: [{ type: 'darkness', chance: '100', sec: '10', power: 'x' }], delay: 1.2 },
    '闘気衝撃・剣': { id: 'coma_sword', kind: 'area', damage: '140+4*x', targets: '6', range: R.wide, weapons: W.sword, combo: { use: 1 }, status: [{ type: 'stun', chance: '2*x', sec: 'x/2+5' }] },
    '闘気衝撃・斧': { id: 'coma_axe', kind: 'area', damage: '140+4*x', targets: '6', range: R.wide, weapons: W.axe, combo: { use: 1 }, status: [{ type: 'stun', chance: '2*x', sec: 'x/2+5' }] },
    鎧崩し: { id: 'armor_crash', targets: '1', range: R.melee, dispel: { chance: '40+2*x', what: 'def' } },
    雄叫び: { id: 'shout', kind: 'area', damage: '120+5*x', targets: '15', range: R.around(200, 100), motion: 'cast', weapons: null, status: [{ type: 'stun', chance: '3*x', sec: '3' }] },
  },
  チャンピオン: {
    全能力の加護: allStats,
    意志の力: will,
    不屈: stoic,
    闘気の極み: { id: 'advanced_combo', passive: [{ combo: { max: 5, damage: '1', rate: 'x' } }] },
    乱れ斬り: { id: 'brandish', kind: 'area', damage: '260+5*x', targets: '3', hits: '2', range: R.wide, delay: 1.2 },
    突撃: rush,
    怒りの解放: { id: 'enrage', combo: { use: 10 }, buff: { sec: '3*x', stats: { watk: 'x' }, damagePct: 'x' } },
    守りの盾: guardShield,
    怪物の引き寄せ: magnet,
  },
  ページ: {
    剣の熟練: mastery('sword_mastery', W.sword),
    鈍器の熟練: mastery('blunt_mastery', W.blunt),
    剣の加速: booster('sword_booster', W.sword),
    鈍器の加速: booster('blunt_booster', W.blunt),
    剣の追撃: finalAttack('sword_final', W.sword),
    鈍器の追撃: finalAttack('blunt_final', W.blunt),
    威圧: { id: 'threaten', kind: 'area', targets: '6', range: R.wide, motion: 'cast', weapons: null, debuff: { atk: 'x', defPct: 'ceil(x/2)', sec: '3*x', chance: '50+2*x' } },
    守りの構え: powerGuard,
  },
  ナイト: {
    MP回復力アップ: mpRecovery3,
    盾の熟練: shieldMastery,
    炎の付与: { id: 'fire_charge', buff: { sec: '4*x', element: 'fire', damagePct: '5+x', charge: true } },
    氷の付与: { id: 'ice_charge', buff: { sec: '4*x', element: 'ice', damagePct: '5+x', charge: true, onHitStatus: [{ type: 'freeze', chance: '100', sec: '2+x/10' }] } },
    雷の付与: { id: 'lightning_charge', buff: { sec: '4*x', element: 'lightning', damagePct: '10+x', charge: true } },
    付与の一撃: { id: 'charge_blow', damage: '300+10*x', targets: '1', range: R.melee, needsCharge: true, consumeCharge: true, status: [{ type: 'stun', chance: '2*x', sec: '3' }], prereqs: [['炎の付与', 1], ['氷の付与', 1], ['雷の付与', 1]], prereqAny: true },
    魔法崩し: { id: 'magic_crash', targets: '1', range: R.melee, dispel: { chance: '40+3*x', what: 'magic' } },
    鉄壁の誓い: { id: 'iron_will', buff: { sec: '10*x', stats: { wdef: '5*x', mdef: '5*x' } } },
  },
  パラディン: {
    全能力の加護: allStats,
    意志の力: will,
    不屈: stoic,
    聖なる付与: { id: 'holy_charge', buff: { sec: '4*x', element: 'holy', damagePct: '10+x', charge: true } },
    天の一撃: { id: 'blast', damage: '120+6*x', targets: '1', hits: '4', range: R.melee, delay: 1.3 },
    天からの鉄槌: { id: 'heavens_hammer', kind: 'area', damage: '600+20*x', targets: '15', range: R.area(300), instantKill: 'x', delay: 1.4 },
    突撃: rush,
    守りの盾: guardShield,
    怪物の引き寄せ: magnet,
  },
  スピアマン: {
    槍の熟練: mastery('spear_mastery', W.spear),
    矛の熟練: mastery('polearm_mastery', W.pole),
    槍の加速: booster('spear_booster', W.spear),
    矛の加速: booster('polearm_booster', W.pole),
    槍の追撃: finalAttack('spear_final', W.spear),
    矛の追撃: finalAttack('polearm_final', W.pole),
    鉄の意志: { id: 'iron_will', buff: { sec: '10*x', stats: { wdef: '2*x', mdef: '2*x' } } },
    体力強化: { id: 'hyper_body', buff: { sec: '10*x', hpPct: '2*x', mpPct: '2*x' } },
  },
  ドラグーン: {
    属性への耐性: { id: 'element_resist', passive: [{ elementResist: 'x' }] },
    '連突き・槍': { id: 'crusher_spear', kind: 'area', damage: '80+4*x', targets: '3', hits: '3', range: R.wideLong, weapons: W.spear, motion: 'stab', delay: 1.3 },
    '連突き・矛': { id: 'crusher_polearm', kind: 'area', damage: '80+4*x', targets: '3', hits: '3', range: R.wideLong, weapons: W.pole, motion: 'stab', delay: 1.3 },
    '竜巻き・槍': { id: 'fury_spear', kind: 'area', damage: '150+4*x', targets: '6', range: R.wideLong, weapons: W.spear, motion: 'swing', delay: 1.1 },
    '竜巻き・矛': { id: 'fury_polearm', kind: 'area', damage: '150+4*x', targets: '6', range: R.wideLong, weapons: W.pole, motion: 'swing', delay: 1.1 },
    捨て身: { id: 'sacrifice', damage: '350+10*x', targets: '1', range: R.reach, ignoreDef: true, selfDamagePct: 10, motion: 'stab', prereqs: [['連突き・槍', 1], ['連突き・矛', 1]], prereqAny: true },
    竜の咆哮: { id: 'dragon_roar', kind: 'area', damage: '240+8*x', targets: '15', range: R.screen, hpPct: '20', motion: 'cast', selfStatus: [{ type: 'bind', chance: '100', sec: '2' }], delay: 1.3, prereqs: [['竜巻き・槍', 1], ['竜巻き・矛', 1]], prereqAny: true },
    力崩し: { id: 'power_crash', targets: '1', range: R.reach, dispel: { chance: '40+3*x', what: 'atk' } },
    竜の血: { id: 'dragon_blood', buff: { sec: '8*x', stats: { watk: 'x+5' }, hpDrain: { amount: '4+x', interval: 4 } } },
  },
  ダークナイト: {
    全能力の加護: allStats,
    意志の力: will,
    不屈: stoic,
    暗黒の力: { id: 'berserk', passive: [{ berserk: 'x' }] },
    闇の獣を呼ぶ: { id: 'beholder', summonSec: '30*x', summonHeal: '100+20*x', summonHealInterval: 20 },
    獣の加護: { id: 'beholder_aura', needsBuff: ['darkknight.beholder'], buff: { sec: '30*x', stats: { wdef: '10*x', acc: '2*x', avoid: '2*x' } } },
    獣の一撃: { id: 'beholder_strike', damage: '150+20*x', targets: '1', range: R.shot(300), needsBuff: ['darkknight.beholder'], motion: 'cast', weapons: null },
    突撃: rush,
    怪物の引き寄せ: magnet,
  },
  魔法使い: {
    MP回復力アップ: { id: 'mp_recovery', passive: [{ mpRegen: 'x*lv/10' }] },
    最大MPアップ: { id: 'max_mp', passive: [{ levelMp: 'x' }] },
    魔力の盾: { id: 'magic_guard', buff: { sec: '30+10*x', magicGuard: 'min(75, 15+3*x)' } },
    魔力の鎧: { id: 'magic_armor', buff: { sec: '10*x', stats: { wdef: '2*x' } } },
    魔力の矢: { id: 'energy_bolt', kind: 'ranged', magic: true, spell: 'min(60, 20+2*x)', targets: '1', hits: '1', range: { front: 300, back: 0, up: 40, down: 20 } },
    魔力の爪: { id: 'magic_claw', kind: 'ranged', magic: true, spell: 'min(50, 10+2*x)', targets: '1', hits: '2', range: { front: 220, back: 0, up: 50, down: 20 } },
  },
  ファイアウィザード: {
    MP吸収: mpEater,
    瞑想: meditation,
    テレポート: teleport,
    遅延: slow,
    火の矢: { id: 'fire_arrow', magic: true, spell: 'min(180, 60+4*x)', element: 'fire', targets: '1', range: R.shot(330) },
    毒の息: { id: 'poison_breath', magic: true, spell: '40+3*x', element: 'poison', targets: '1', range: R.shot(300), status: [{ type: 'poison', chance: '100', sec: '3+x/5', power: '0.5' }] },
    炎の輪: { id: 'fire_ring', kind: 'area', magic: true, spell: '40+3*x', element: 'fire', targets: '4', range: R.around(130) },
  },
  ファイアメイジ: {
    属性への耐性: resistPierce,
    属性の増幅: amplify,
    爆炎: { id: 'explosion', kind: 'area', magic: true, spell: '90+4*x', element: 'fire', targets: '6', range: R.around(170, 100), delay: 1.1 },
    毒の霧: { id: 'poison_mist', kind: 'area', magic: true, spell: '70+2*x', element: 'poison', targets: '6', range: R.area(220), zone: 6, status: [{ type: 'poison', chance: '100', sec: '6', power: '0.5' }] },
    封印: seal,
    魔法の加速: magicBooster,
    炎と毒の混合: { id: 'fire_poison', magic: true, spell: '200+6*x', element: 'fire', targets: '1', range: R.shot(330), status: [{ type: 'poison', chance: '100', sec: '6', power: '0.5' }] },
  },
  ファイアアークメイジ: {
    全能力の加護: allStats,
    意志の力: will,
    魔力の反射: magicReflect,
    無限の魔力: infinity,
    流星群: { id: 'meteor', kind: 'area', magic: true, spell: '300+12*x', element: 'fire', targets: '15', range: R.screen, cast: 1.5 },
    毒の雲: { id: 'poison_cloud', kind: 'area', magic: true, spell: '200+8*x', element: 'poison', targets: '15', range: R.area(360), status: [{ type: 'poison', chance: '100', sec: '8', power: '0.5' }] },
    麻痺の毒: { id: 'paralyze', magic: true, spell: '300+15*x', element: 'poison', targets: '1', range: R.shot(350), status: [{ type: 'bind', chance: '100', sec: '3', noBoss: true }] },
    火の精を呼ぶ: { id: 'fire_spirit', summonSec: '20+3*x', summonAttack: { spell: '150+5*x', element: 'fire', targets: '1', interval: 3, range: 300 } },
    溜めの大魔法: bigBang('fire'),
  },
  アイスウィザード: {
    MP吸収: mpEater,
    瞑想: meditation,
    テレポート: teleport,
    遅延: slow,
    冷気の矢: { id: 'cold_beam', magic: true, spell: '50+4*x', element: 'ice', targets: '1', range: R.shot(320), status: [{ type: 'freeze', chance: '100', sec: '2+x/10' }] },
    雷撃: { id: 'thunder_bolt', kind: 'area', magic: true, spell: '40+3*x', element: 'lightning', targets: '6', range: R.around(150, 100) },
  },
  アイスメイジ: {
    属性への耐性: resistPierce,
    属性の増幅: amplify,
    氷の槍: { id: 'ice_strike', kind: 'area', magic: true, spell: '90+4*x', element: 'ice', targets: '6', range: R.area(300), status: [{ type: 'freeze', chance: '100', sec: '2+x/10' }], delay: 1.1 },
    雷の柱: { id: 'thunder_spear', kind: 'area', magic: true, spell: '100+4*x', element: 'lightning', targets: '6', range: R.area(260) },
    封印: seal,
    魔法の加速: magicBooster,
    氷と雷の混合: { id: 'ice_lightning', magic: true, spell: '200+6*x', element: 'ice', targets: '1', range: R.shot(330), status: [{ type: 'freeze', chance: '100', sec: '2+x/10' }] },
  },
  アイスアークメイジ: {
    全能力の加護: allStats,
    意志の力: will,
    魔力の反射: magicReflect,
    無限の魔力: infinity,
    吹雪: { id: 'blizzard', kind: 'area', magic: true, spell: '300+12*x', element: 'ice', targets: '15', range: R.screen, cast: 1.5, status: [{ type: 'freeze', chance: '100', sec: '3' }] },
    連鎖の雷: { id: 'chain_lightning', kind: 'area', magic: true, spell: '300+12*x', element: 'lightning', targets: '6', range: R.area(350), pierce: -10 },
    氷の精を呼ぶ: { id: 'ice_spirit', summonSec: '20+3*x', summonAttack: { spell: '150+5*x', element: 'ice', targets: '1', interval: 3, range: 300, status: [{ type: 'freeze', chance: '100', sec: '2' }] } },
    溜めの大魔法: bigBang('ice'),
    氷の大精霊: { id: 'ice_great_spirit', cooldown: '300', summonSec: '10+x', summonAttack: { spell: '100+4*x', element: 'ice', targets: '15', interval: 1, range: 420 } },
  },
  クレリック: {
    MP吸収: mpEater,
    テレポート: teleport,
    ヒール: { id: 'heal', kind: 'heal', healPct: '10+2*x', undeadSpell: { spell: '30+3*x', targets: '5', range: 200 } },
    祝福: { id: 'bless', buff: { sec: '10*x', stats: { acc: 'x', avoid: 'x', wdef: '2*x', mdef: '2*x' } } },
    聖なる守り: { id: 'holy_guard', buff: { sec: '10*x', damageReduce: '10+x' } },
    聖なる矢: { id: 'holy_arrow', magic: true, spell: '60+4*x', element: 'holy', targets: '1', range: R.shot(320) },
  },
  プリースト: {
    属性への耐性: { id: 'element_resist', passive: [{ elementResist: 'x', allElements: true }] },
    解除: { id: 'dispel', kind: 'area', targets: '6', range: R.around(220, 120), magic: true, motion: 'cast', cure: true, dispel: { chance: '40+3*x', what: 'all' } },
    秘術の扉: { id: 'mystic_door', door: true, buff: { sec: '30+5*x' } },
    聖なる御印: { id: 'holy_symbol', buff: { sec: '4*x', expPct: '10+x' } },
    聖なる光: { id: 'shining_ray', kind: 'area', magic: true, spell: '100+5*x', element: 'holy', targets: '6', range: R.area(300) },
    光の竜を呼ぶ: { id: 'light_dragon', summonSec: '60+3*x', summonAttack: { spell: '80+5*x', element: 'holy', targets: '1', interval: 3, range: 300 } },
    変化の呪い: { id: 'doom', kind: 'area', targets: '6', range: R.area(260), magic: true, motion: 'cast', status: [{ type: 'polymorph', chance: '20+3*x', sec: '10+x', noBoss: true }] },
  },
  ビショップ: {
    全能力の加護: allStats,
    意志の力: will,
    魔力の反射: magicReflect,
    無限の魔力: infinity,
    天の裁き: { id: 'genesis', kind: 'area', magic: true, spell: '300+12*x', element: 'holy', targets: '15', range: R.screen, cast: 1.5 },
    天使の光線: { id: 'angel_ray', magic: true, spell: '250+10*x', element: 'holy', targets: '1', range: R.shot(350), healPerHit: '2' },
    聖竜を呼ぶ: { id: 'holy_dragon', summonSec: '60+3*x', summonAttack: { spell: '200+10*x', element: 'holy', targets: '1', interval: 3, range: 320 } },
    復活: { id: 'resurrection', cooldown: '3600-60*x', buff: { sec: '3600-60*x', revive: true } },
    聖なる盾: { id: 'holy_shield', buff: { sec: '4*x', statusImmune: true } },
  },
  弓使い: {
    弓の心得: { id: 'archery_basics', passive: [{ stats: { acc: 'x' } }, { weapons: ['弓', 'クロスボウ'], stats: { watk: 'ceil(x/4)' } }] },
    遠目: { id: 'eagle_eye', passive: [{ weapons: ['弓', 'クロスボウ'], range: '10*x' }] },
    必中の矢: { id: 'critical_shot', passive: [{ weapons: ['弓', 'クロスボウ'], critRate: '2+x', critDamage: '200' }] },
    集中: { id: 'focus', buff: { sec: '10*x', stats: { acc: 'x', avoid: 'x' } } },
    強弓: { id: 'power_arrow', kind: 'ranged', damage: '160+5*x', targets: '1', hits: '1', weapons: ['弓', 'クロスボウ'], ammo: true, rangeBonus: true, range: { front: 350, back: 0, up: 40, down: 20 } },
    ダブルショット: { id: 'double_shot', kind: 'ranged', damage: '50+3*x', targets: '1', hits: '2', weapons: ['弓', 'クロスボウ'], ammo: true, rangeBonus: true, range: { front: 350, back: 0, up: 40, down: 20 } },
  },
  ハンター: {
    弓の熟練: mastery('bow_mastery', W.bow),
    弓の加速: booster('bow_booster', W.bow),
    弓の追撃: finalAttack('bow_final', W.bow),
    '魂の矢・弓': soulArrow('soul_arrow'),
    力の解放: knockback,
    爆裂矢: { id: 'arrow_bomb', kind: 'area', damage: '60+3*x', targets: '6', range: R.shot(350), explode: 90, status: [{ type: 'stun', chance: '2*x', sec: '3' }] },
  },
  レンジャー: {
    必殺の一撃: execute,
    身代わり人形: puppet,
    銀の鷹を呼ぶ: { id: 'silver_hawk', summonSec: '60+3*x', summonAttack: { damage: '200+10*x', targets: '1', interval: 3, range: 300, status: [{ type: 'stun', chance: '20', sec: '2' }] } },
    炎の矢: { id: 'inferno', kind: 'area', damage: '180+5*x', element: 'fire', targets: '6', range: R.fan(360) },
    矢の雨: { id: 'arrow_rain', kind: 'area', damage: '170+5*x', targets: '6', range: R.area(360), delay: 1.1 },
    四連射: quadShot,
    疾風の構え: windStance,
  },
  マスターアーチャー: {
    全能力の加護: allStats,
    意志の力: will,
    弓の極み: { id: 'bow_expert', passive: [{ weapons: W.bow, mastery: '60+x', stats: { watk: 'x' } }] },
    嵐の連射: { id: 'hurricane', damage: '80+3*x', targets: '1', range: R.shot(400), rapid: 8 },
    鷹の目: sharpEyes,
    火の鳥を呼ぶ: { id: 'phoenix', summonSec: '60+3*x', summonAttack: { damage: '300+12*x', element: 'fire', targets: '4', interval: 3, range: 320 } },
    集中の極意: { id: 'concentrate', cooldown: '120', buff: { sec: '4*x', stats: { watk: 'x' }, mpCostPct: 'x/2' } },
    矢の大雨: { id: 'arrow_storm', kind: 'area', damage: '200+6*x', targets: '15', range: R.screen, delay: 1.3 },
  },
  クロスボウマン: {
    クロスボウの熟練: mastery('crossbow_mastery', W.xbow),
    クロスボウの加速: booster('crossbow_booster', W.xbow),
    クロスボウの追撃: finalAttack('crossbow_final', W.xbow),
    '魂の矢・クロスボウ': soulArrow('soul_arrow'),
    力の解放: knockback,
    鉄の矢: { id: 'iron_arrow', kind: 'area', damage: '100+4*x', targets: '6', range: R.line(420), pierce: -10, hits: '1' },
  },
  スナイパー: {
    必殺の一撃: execute,
    身代わり人形: puppet,
    金の鷲を呼ぶ: { id: 'golden_eagle', summonSec: '60+3*x', summonAttack: { damage: '200+10*x', targets: '1', interval: 3, range: 300, status: [{ type: 'stun', chance: '20', sec: '2' }] } },
    氷の矢: { id: 'blizzard_arrow', kind: 'area', damage: '180+5*x', element: 'ice', targets: '6', range: R.fan(360), status: [{ type: 'freeze', chance: '100', sec: '3' }] },
    噴き出す矢: { id: 'arrow_eruption', kind: 'area', damage: '170+5*x', targets: '6', range: R.area(360), delay: 1.1 },
    四連射: quadShot,
    疾風の構え: windStance,
  },
  マークスマン: {
    全能力の加護: allStats,
    意志の力: will,
    クロスボウの極み: { id: 'crossbow_expert', passive: [{ weapons: W.xbow, mastery: '60+x', stats: { watk: 'x' } }] },
    貫く矢: { id: 'piercing_arrow', kind: 'area', damage: '150+5*x', targets: '6', range: R.line(450), pierce: 30 },
    狙撃: { id: 'snipe', damage: '1500+60*x', targets: '1', range: R.shot(450), cooldown: '5', delay: 1.5 },
    鷹の目: sharpEyes,
    氷の鳥を呼ぶ: { id: 'frostprey', summonSec: '60+3*x', summonAttack: { damage: '300+12*x', element: 'ice', targets: '4', interval: 3, range: 320, status: [{ type: 'freeze', chance: '100', sec: '2' }] } },
    竜の息の矢: { id: 'dragon_breath', kind: 'area', damage: '200+6*x', targets: '15', range: R.fan(400), delay: 1.2 },
  },
  盗賊: {
    身のこなし: { id: 'nimble_body', passive: [{ stats: { acc: 'x', avoid: 'x' } }] },
    鋭い目: { id: 'keen_eyes', passive: [{ weapons: ['クロー'], range: '10*x' }] },
    かく乱: { id: 'disorder', kind: 'attack', targets: '1', hits: '1', debuff: { atk: 'x', def: 'x', sec: '3*x' }, range: { front: 110, back: 10, up: 60, down: 10 } },
    闇隠れ: { id: 'dark_sight', buff: { sec: '5*x', stealth: true, stats: { speed: '-20+x' } } },
    二段突き: { id: 'double_stab', kind: 'attack', damage: '70+5*x', targets: '1', hits: '2', weapons: ['短剣'], range: { front: 75, back: 10, up: 60, down: 10 } },
    二つ星投げ: { id: 'lucky_seven', kind: 'ranged', damage: '80+3*x', targets: '1', hits: '2', weaponMul: 5.0, weapons: ['クロー'], ammo: true, rangeBonus: true, range: { front: 250, back: 0, up: 40, down: 20 } },
  },
  アサシン: {
    クローの熟練: mastery('claw_mastery', W.claw, { starBundle: '10*x' }),
    急所狙い: { id: 'critical_throw', passive: [{ weapons: W.claw, critRate: 'min(40, 10+x)', critDamage: '200+3*x' }] },
    クローの加速: booster('claw_booster', W.claw),
    '我慢・盗賊': enduranceThief,
    ヘイスト: haste,
    吸い取り: { id: 'drain', damage: '100+4*x', targets: '1', range: R.melee, motion: 'swing', ammo: false, rangeBonus: false, drain: { pct: '10+x', cap: 50 } },
    星の連投: { id: 'star_chain', passive: [{ weapons: W.claw, chainStar: '2*x' }] },
  },
  ハーミット: {
    調合上手: { id: 'alchemist', passive: [{ potionPct: '10+x', potionTimePct: 'x' }] },
    お金の加護: { id: 'meso_up', buff: { sec: '10*x', mesoPct: 'x+10' } },
    影分身: { id: 'shadow_partner', buff: { sec: '4*x', shadowPartner: '50' } },
    影の網: { id: 'shadow_web', kind: 'area', targets: '6', range: R.around(180), motion: 'cast', ammo: false, rangeBonus: false, weapons: null, status: [{ type: 'bind', chance: '100', sec: '2+x/5' }] },
    大星投げ: { id: 'avenger', kind: 'area', damage: '100+4*x', targets: '6', range: R.line(420), weaponMul: 5.0 },
    空中ジャンプ: { id: 'flash_jump', kind: 'movement', airJump: { vx: '330*(1+x/100)', vy: '300' } },
    お金の投げ打ち: { id: 'meso_toss', fixed: '5*x*x', targets: '1', range: R.shot(300), ammo: false, rangeBonus: false, weapons: null },
  },
  ナイトストーカー: {
    全能力の加護: allStats,
    意志の力: will,
    影の身代わり: shadowShifter,
    三つ星投げ: { id: 'triple_throw', damage: '100+5*x', targets: '1', hits: '3', range: R.shot(300), weaponMul: 5.0 },
    毒の星: { id: 'venom_star', passive: [{ weapons: W.claw, onHitStatus: [{ type: 'poison', chance: 'x+10', sec: '6', power: '0.5' }] }] },
    忍び寄る影: ninjaAmbush,
    挑発: taunt,
    星の嵐: { id: 'star_storm', kind: 'area', damage: '300+10*x', targets: '15', range: R.screen, hpPct: '30', delay: 1.3 },
    尽きない星: { id: 'shadow_stars', buff: { sec: '4*x', noAmmo: true } },
  },
  バンディット: {
    短剣の熟練: mastery('dagger_mastery', W.dagger),
    '我慢・盗賊': enduranceThief,
    短剣の加速: booster('dagger_booster', W.dagger),
    ヘイスト: haste,
    盗む: { id: 'steal', targets: '1', range: R.melee, steal: { chance: '3*x' } },
    連続斬り: { id: 'savage_blow', damage: '40+2*x', targets: '1', hits: '6', range: R.melee, delay: 1.4 },
    回し斬り: { id: 'spin_slash', kind: 'area', damage: '80+4*x', targets: '4', range: R.around(110), motion: 'swing' },
  },
  ローグ: {
    突進斬り: { id: 'assaulter', damage: '300+10*x', targets: '1', range: R.melee, dash: 450, dashTime: 0.3, status: [{ type: 'stun', chance: '2*x', sec: '3' }] },
    盗賊団: { id: 'band_of_thieves', kind: 'area', damage: '150+5*x', targets: '6', range: R.area(300), motion: 'cast', delay: 1.2 },
    気の回復: { id: 'chakra', kind: 'heal', healStats: { luk: 0.5, dex: 0.3, mul: '1+x/30' } },
    お金の盾: { id: 'meso_guard', buff: { sec: '10*x', mesoGuard: { pct: '50', cost: '1+x/5' } } },
    お金の爆発: { id: 'meso_explosion', kind: 'area', targets: '6', range: R.around(200, 100), motion: 'cast', mesoExplosion: true, weapons: null },
    お金拾い: { id: 'pickpocket', passive: [{ mesoOnHit: '2*x' }] },
    影の衣: { id: 'shadow_cloak', passive: [{ stealthAttack: '5*x', stealthNoSlow: true }] },
  },
  シャドウブレード: {
    全能力の加護: allStats,
    意志の力: will,
    影の身代わり: shadowShifter,
    毒の刃: { id: 'venom_blade', passive: [{ weapons: W.dagger, onHitStatus: [{ type: 'poison', chance: 'x+10', sec: '6', power: '0.5' }] }] },
    暗殺: { id: 'assassinate', damage: '300+10*x', targets: '1', hits: '4', range: R.melee, stealthMul: 2, delay: 1.4 },
    刃の嵐: { id: 'blade_storm', kind: 'area', damage: '200+6*x', targets: '6', hits: '2', range: R.wide, delay: 1.2 },
    忍び寄る影: ninjaAmbush,
    挑発: taunt,
    煙玉: { id: 'smokescreen', cooldown: '600', buff: { sec: '10+x/2', invincible: true } },
  },
  海賊: {
    早足: { id: 'dash', kind: 'movement', dash: 220, buff: { sec: '2+x', stats: { speed: '10+x', jump: 'x' } } },
    身軽な構え: { id: 'nimble_stance', passive: [{ stats: { acc: 'x', avoid: 'x' } }] },
    宙返り蹴り: { id: 'somersault_kick', kind: 'area', damage: '80+4*x', targets: '6', hits: '1', range: { front: 85, back: 85, up: 60, down: 15, around: true }, motion: 'punch' },
    拳の連打: { id: 'flash_fist', kind: 'attack', damage: '80+5*x', targets: '1', hits: '2', weapons: ['ナックル'], range: { front: 70, back: 10, up: 60, down: 10 } },
    ダブルショット: { id: 'double_shot', kind: 'ranged', damage: '70+5*x', targets: '1', hits: '2', weapons: ['銃'], ammo: true, rangeBonus: true, range: { front: 280, back: 0, up: 40, down: 20 } },
    銃の心得: { id: 'gun_mastery', passive: [{ weapons: ['銃'], range: '10*x' }] },
  },
  ブローラー: {
    ナックルの熟練: mastery('knuckle_mastery', W.knuckle),
    ナックルの加速: booster('knuckle_booster', W.knuckle),
    突進の拳: { id: 'corkscrew', kind: 'area', damage: '150+5*x', targets: '4', range: R.wide, dash: 420, dashTime: 0.3 },
    回し蹴り: { id: 'spin_kick', kind: 'area', damage: '120+5*x', targets: '4', range: R.around(110), status: [{ type: 'stun', chance: '2*x', sec: '3' }] },
    気合い: { id: 'energy_charge', passive: [{ energy: { watk: 'x/2', wdef: 'x', hpRegen: 'x' } }] },
    二段アッパー: { id: 'double_upper', damage: '180+5*x', targets: '1', hits: '2', range: R.melee },
    気合いの回復: { id: 'mp_recovery', kind: 'heal', cooldown: '60', healMpPct: '5*x' },
  },
  ストライカー: {
    変身: { id: 'transform', buff: { sec: '10*x', stats: { watk: 'x', wdef: '5*x', speed: '10' }, transform: true } },
    衝撃波: { id: 'shockwave', kind: 'area', damage: '200+5*x', targets: '6', range: R.around(160), needsBuff: ['striker.transform', 'fightmaster.super_transform'] },
    気の弾: { id: 'energy_blast', kind: 'area', damage: '160+5*x', targets: '6', range: R.line(380), needsEnergy: true },
    気の吸収: { id: 'energy_drain', damage: '200+5*x', targets: '1', range: R.melee, drain: { pct: 'x', cap: 50 } },
    気絶の極み: { id: 'stun_mastery', passive: [{ stunCrit: 'x' }] },
    竜巻アッパー: { id: 'tornado_upper', kind: 'area', damage: '250+6*x', targets: '3', range: R.wide },
  },
  ファイトマスター: {
    全能力の加護: allStats,
    意志の力: will,
    竜の変身: { id: 'super_transform', buff: { sec: '10*x', stats: { watk: '2*x', wdef: '8*x', speed: '20' }, transform: true } },
    百裂拳: { id: 'barrage', damage: '150+5*x', targets: '1', hits: '6', range: R.melee, delay: 1.5 },
    空裂拳: { id: 'sky_fist', damage: '500+20*x', targets: '1', range: R.melee, debuff: { defPct: '20', sec: '10' }, delay: 1.2 },
    気の大玉: { id: 'energy_orb', kind: 'area', damage: '300+10*x', targets: '10', range: R.line(420), delay: 1.2 },
    神速: { id: 'speed_infusion', buff: { sec: '10*x', boosterStack: 1 } },
    時の拳: { id: 'time_leap', cooldown: '1800-30*x', cdReset: true },
  },
  ガンスリンガー: {
    銃の熟練: mastery('gun_mastery', W.gun),
    銃の加速: booster('gun_booster', W.gun),
    爆発弾: { id: 'grenade', kind: 'area', damage: '100+4*x', targets: '6', range: R.shot(300), explode: 90 },
    隠れ足: { id: 'wings', buff: { sec: '10*x', slowFall: true } },
    跳弾: { id: 'ricochet', kind: 'area', damage: '60+3*x', targets: '6', range: R.fan(300), status: [{ type: 'seal', chance: '2*x', sec: '5' }] },
    後ろ跳び撃ち: { id: 'backspin_shot', damage: '150+5*x', targets: '1', range: R.shot(300), backJump: { vx: 220, vy: 330 } },
  },
  アウトロー: {
    炎の弾: { id: 'flamethrower', kind: 'area', damage: '160+5*x', element: 'fire', targets: '6', range: R.fan(280), status: [{ type: 'burn', chance: '100', sec: '4' }] },
    氷の弾: { id: 'ice_splitter', kind: 'area', damage: '160+5*x', element: 'ice', targets: '6', range: R.fan(280), status: [{ type: 'freeze', chance: '100', sec: '2' }] },
    爆弾カモメを呼ぶ: { id: 'gaviota', summonSec: '1.5', summonAttack: { damage: '300+10*x', targets: '6', interval: 0.6, range: 300, once: true, front: true } },
    八方撃ち: { id: 'homing', kind: 'area', damage: '120+4*x', targets: 'floor(4+x/10)', range: R.around(350, 120) },
    タコの砲台: { id: 'octopus', summonSec: '30+x', summonFixed: true, summonAttack: { damage: '150+5*x', targets: '1', interval: 2, range: 300 } },
    連射: { id: 'burst_fire', damage: '100+5*x', targets: '1', hits: '4', range: R.shot(320), delay: 1.2 },
  },
  キャプテン: {
    全能力の加護: allStats,
    意志の力: will,
    乗船: { id: 'ship', buff: { sec: '600', stats: { hp: 'x*100', wdef: '10*x' }, ship: true } },
    大砲: { id: 'cannon', kind: 'area', damage: '400+15*x', targets: '6', range: R.line(450), needsBuff: ['captain.ship'], motion: 'shoot', delay: 1.2 },
    弾幕: { id: 'rapid_fire', damage: '100+3*x', targets: '1', range: R.shot(380), rapid: 8 },
    艦砲射撃: { id: 'air_strike', kind: 'area', damage: '300+10*x', targets: '15', range: R.screen, motion: 'cast', delay: 1.4, ammo: false },
    狙い撃ち: { id: 'hypnotize_mark', targets: '1', range: R.shot(380), mark: { damage: 'x', exp: 'x/2', sec: '30' } },
    錯乱弾: { id: 'hypnotize', targets: '1', range: R.shot(320), status: [{ type: 'charm', chance: '100', sec: '10+x/3', noBoss: true }] },
  },
};
