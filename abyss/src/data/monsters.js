// 敵。見た目の差し替え枠は monster.<id>（render/manifest.js）。差し替えが無いときは body の形で絵を描く。
//
// 体の形（body。アート担当がこの形ごとに絵を描く。ワールド担当はこの中から選ぶ）:
//   biped（人型）, brute（大柄な人型）, caster（ローブの術者）, quad（四足の獣）, beast_large（大きな獣）, flyer（翼で飛ぶ）,
//   blob（粘体）, serpent（蛇・虫）, spider（蜘蛛）, insect（甲虫・蠍）, ghost（霊）, golem（岩・金属の巨人）, dragon（竜）,
//   plant（植物）, aquatic（魚人・水棲）, demon（悪魔）, elemental（精霊・炎や氷の塊）, construct（機械）
// 飾り（features。いくつでも）: horns, wings, tail, crown, armor, staff, shield, sword, axe, bow, spikes, tentacles, glow, hood, mask, chains, crystals, gears, flames, ice, bones
// palette: { main（体の色）, sub（影・服）, eye（目）, accent?（飾り・光） }
//
// 形:
// { id, name, family, body, features?, size, palette: { main, sub, eye, accent? },
//   life: 1, dmg: 1, speed: 80, range: 70, atkCd: 1.6, element: 'phys',
//   attack: 'melee' | 'ranged' | 'charge' | 'slam' | 'caster' | 'summoner' | 'explode',
//   proj: 'bone' など（ranged のときの弾の見た目の種類）, res: { fire: 0, ... }, flying: false,
//   boss: false, abilities: [...]（ボス用の特技。world 担当が拡張） }
// life / dmg は balance.js の monsterLife / monsterDmg（エリアレベル基準）に掛ける倍率。

export const FAMILIES = {
  undead: '不死', beast: '獣', demon: '悪魔', insect: '虫', elemental: '精霊', human: '人', construct: '機巧', aberration: '異形', aquatic: '水棲', dragon: '竜', plant: '植物', spirit: '霊',
};

export const MONSTERS = [
  // ---- 第 1 章: 灰の村と腐れ森
  { id: 'rot_zombie', name: '腐れ屍', family: 'undead', body: 'biped', size: 1, palette: { main: '#6b8f5a', sub: '#3a4a30', eye: '#ffef7a' }, life: 1.1, dmg: 1, speed: 55, range: 70, atkCd: 1.8, attack: 'melee' },
  { id: 'ash_wolf', name: '灰狼', family: 'beast', body: 'quad', size: 0.95, palette: { main: '#8a8a8a', sub: '#4a4a4a', eye: '#ff5a3a' }, life: 0.8, dmg: 1.1, speed: 120, range: 70, atkCd: 1.2, attack: 'melee' },
  { id: 'grave_bat', name: '墓場の蝙蝠', family: 'beast', body: 'flyer', size: 0.7, palette: { main: '#5a3a6b', sub: '#2a1a30', eye: '#ff3a3a' }, life: 0.55, dmg: 0.8, speed: 140, range: 60, atkCd: 1.0, attack: 'melee', flying: true },
  { id: 'bone_archer', name: '骸骨の射手', family: 'undead', body: 'biped', size: 1, palette: { main: '#e8e0c8', sub: '#7a705a', eye: '#5ad0ff' }, life: 0.8, dmg: 0.9, speed: 60, range: 420, atkCd: 2.0, attack: 'ranged', proj: 'arrow' },
  { id: 'bog_slime', name: '沼の粘体', family: 'aberration', body: 'blob', size: 0.9, palette: { main: '#7acf5a', sub: '#3a7a2a', eye: '#1a1a1a' }, life: 1.3, dmg: 0.8, speed: 45, range: 60, atkCd: 1.6, attack: 'melee', res: { poison: 50 } },
  { id: 'cultist', name: '灰の信徒', family: 'human', body: 'caster', size: 1, palette: { main: '#6a4a3a', sub: '#2a1a14', eye: '#ff7a2a' }, life: 0.9, dmg: 1.2, speed: 60, range: 380, atkCd: 2.2, attack: 'caster', element: 'fire', proj: 'fireball' },
  // ボス
  { id: 'boss_butcher', name: '肉屋のグロム', family: 'undead', body: 'brute', size: 1.6, palette: { main: '#8a5a4a', sub: '#4a2a20', eye: '#ff2a2a' }, life: 1, dmg: 1, speed: 70, range: 100, atkCd: 1.8, attack: 'slam', boss: true },
  { id: 'boss_ashlord', name: '灰の司祭ヴォルク', family: 'human', body: 'caster', size: 1.5, palette: { main: '#4a3a5a', sub: '#1a1424', eye: '#ff8a2a' }, life: 1, dmg: 1, speed: 50, range: 420, atkCd: 2.0, attack: 'caster', element: 'fire', proj: 'fireball', boss: true },
];

export const MONSTER = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

// エリートの詞（チャンピオン・群れの長につく）。効果は game/combat.js の eliteHooks で処理する
export const ELITE_AFFIXES = [
  { id: 'fast', name: '俊足', desc: '動きと攻撃が速い', mods: { speed: 1.5, atkCd: 0.7 } },
  { id: 'armored', name: '鋼鉄', desc: '受けるダメージ -40%', mods: { dr: 0.4 } },
  { id: 'vampiric', name: '吸血', desc: '与えたダメージでライフ回復', mods: { leech: 0.5 } },
  { id: 'molten', name: '溶岩', desc: '火炎の攻撃、死ぬと爆発', mods: { element: 'fire', deathBlast: true } },
  { id: 'frozen', name: '凍気', desc: '冷気の攻撃、当たると移動が遅くなる', mods: { element: 'cold', chill: true } },
  { id: 'arcane', name: '雷鳴', desc: '雷撃の攻撃、ときどき雷を落とす', mods: { element: 'lightning', zap: true } },
  { id: 'huge', name: '巨体', desc: 'ライフ +80%、大きい', mods: { life: 1.8, size: 1.3 } },
  { id: 'berserk', name: '狂乱', desc: 'ダメージ +50%', mods: { dmg: 1.5 } },
  { id: 'regen', name: '再生', desc: 'ライフが回復し続ける', mods: { regen: 0.03 } },
  { id: 'splitter', name: '分裂', desc: '倒すと小さく 2 体に分かれる', mods: { split: 2 } },
];
