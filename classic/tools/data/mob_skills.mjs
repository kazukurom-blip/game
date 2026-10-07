// 敵の技（体当たり以外の攻撃）・状態異常つきの攻撃・ボスの段階と呼び出し（MONSTERS.md 2・5 章）。
// export_data.mjs が monsters.json の各敵に attacks / touchStatus / boss として入れる。
// ここに書いていない敵は monsters.mjs の「攻撃」の列から自動で作る（遠 = 真っすぐの飛び道具、魔 = 足元に予兆→当たる魔法）。
//
// attacks の 1 つ（数値は無ければ既定値）:
//   id, name      技の ID（敵の中で 1 つ）と名前（画面に出す）
//   type          melee  = 前に構えてから振る（w×h の四角、back: true なら後ろ）
//                 shot   = 飛び道具（speed px/秒・life 秒・count 本・spread で上下に広がる）
//                 magic  = 主人公の足元に予兆 → windup 秒後に当たる（w×h。count > 1 なら spread px おきに並ぶ。linger 秒その場に残る）
//                 area   = 敵のまわり（w 幅）か画面全体（global）。groundOnly = 地面にいる時だけ当たる、safeHeight = 敵の足元よりその px 以上高い所なら当たらない
//                 summon = 手下を呼ぶ（mobs を順に count 体、呼んだ手下は max 体まで）
//                 heal   = 自分の HP を pct% 治す
//                 dive   = 消えて主人公の所に予兆 → windup 秒後にそこへ出て当たる（潜る・急降下）
//                 buff   = 自分（allies: true なら w 幅の中の仲間も）を強化する。buff: { atk, matk, def, mdef, speed（すべて +%）, reflect, magicReflect（受けたダメージの % を返す）, sec }
//                          主人公の鎧崩し（def・reflect）・魔法崩し（matk・mdef・magicReflect）・力崩し（atk）・解除（全部）で消える
//   range         主人公がこの横の距離（px）にいる時だけ使う（area global・summon・heal は無視）
//   cd            待ち時間（秒）。windup = 構え・予兆の時間（秒）
//   pct           敵の攻撃力（magic: true なら魔法攻撃力）の何 % か（0 なら状態異常だけ）
//   status        { kind: poison|stun|darkness|seal|curse|weak|freeze|sleep|slow|polymorph|confuse, sec, chance(0〜1), power }
//                 slow = 速さ -power（既定 20）、polymorph = 姿が変わって攻撃・スキル不可、confuse = 左右が逆になる
//   pull          当たったら主人公を敵の方へ px 引き寄せる（ツタ）
//   suck          { w, speed }: 予兆の間、敵のまわり w 幅の中の主人公を中心へ speed px/秒 で吸い込む（渦潮。当たるのは中心の w×h だけ）
//   shelter       { at: [マップの横幅の割合 …], w }: その位置の w 幅（盾の陰）にいると当たらない（全滅の炎）
//   phases        使う段階（0 から。無ければ全部）
//   weight        同時に使える技が複数ある時の選ばれやすさ（既定 1）
// touchStatus: 触れた時の状態異常（{ kind, sec, chance, power }）
// boss.phases: [{ hp: この割合以下で始まる（最初は 1）, name, atkMul, defMul, speedMul, rate(技の速さ), elements(弱点の上書き), healPct(始まった時に治す), summon: { mobs, count },
//               clones: { count, hpPct, shuffle }（分身: 本物と同じ姿で影が無い。HP は本物の最大 HP の hpPct%、shuffle 秒ごとに本物と分身が入れ替わる）,
//               submerge: { sec, healPct, rocks, rockHpPct }（深く潜る: sec 秒消えて、その間に最大 HP の healPct% を少しずつ治す。まわりに光る岩を rocks 個。全部壊すと回復が止まって出てくる） }]
// boss.rifts: { phase, count, mob, limit, guard, expose }（時の裂け目: phase の段階の間、床に count 個の裂け目。本体の受けるダメージ × guard。
//               部屋の mob（呼ばれる）を倒すと「時のかけら」を 1 つ持つ。裂け目の上で調べるキーではめる。limit 秒で全部はめないと元に戻る。
//               全部はめると expose 秒、本体が無防備（ダメージがふつうに通る）。その後また裂け目が開く）

const S = (kind, sec, chance = 1, power = 0) => ({ kind, sec, chance, ...(power ? { power } : {}) });

export const MOB_SKILLS = {
  // ===== 状態異常つきのふつうの敵 =====
  M012: { attacks: [{ id: 'ink', name: '墨', type: 'shot', range: 300, cd: 3.5, windup: 0.3, pct: 100, status: S('darkness', 4, 0.2) }] },
  M027: { attacks: [{ id: 'straw', name: '藁飛ばし', type: 'shot', range: 300, cd: 3, windup: 0.3, pct: 100 }] },
  M031: { attacks: [{ id: 'light', name: '光の玉', type: 'shot', magic: true, range: 320, cd: 3, windup: 0.4, pct: 100, speed: 240 }] },
  M062: { touchStatus: S('poison', 6, 0.2) },
  M067: { touchStatus: S('weak', 5, 0.25) },
  M071: { touchStatus: S('curse', 10, 0.25) },
  M073: { attacks: [{ id: 'chill', name: '冷気', type: 'magic', range: 280, cd: 4, windup: 0.8, pct: 100, w: 80, h: 80, status: S('freeze', 2, 0.25) }] },
  M076: { attacks: [{ id: 'fire', name: '火の息', type: 'shot', magic: true, range: 260, cd: 3.5, windup: 0.4, pct: 110, speed: 260, life: 1.0 }] },
  M077: { attacks: [{ id: 'ice', name: '冷気の息', type: 'shot', magic: true, range: 260, cd: 3.5, windup: 0.4, pct: 110, speed: 260, life: 1.0, status: S('freeze', 1.5, 0.15) }] },
  M081: { attacks: [{ id: 'axe', name: '斧の振り下ろし', type: 'melee', range: 90, cd: 3, windup: 0.5, pct: 130, w: 90, h: 70 }] },
  M082: { attacks: [{ id: 'spear', name: '槍投げ', type: 'shot', range: 350, cd: 3.5, windup: 0.4, pct: 110, speed: 380 }] },
  M083: { attacks: [{ id: 'dust', name: '眠りの鱗粉', type: 'magic', range: 260, cd: 5, windup: 1.0, pct: 60, w: 90, h: 90, status: S('sleep', 3, 0.5) }] },
  M106: { attacks: [{ id: 'fireball', name: '火の玉', type: 'shot', magic: true, range: 350, cd: 3, windup: 0.5, pct: 100, speed: 260 }] },
  M107: { attacks: [{ id: 'iceball', name: '氷の玉', type: 'shot', magic: true, range: 350, cd: 3, windup: 0.5, pct: 100, speed: 260, status: S('freeze', 1.5, 0.15) }] },
  M154: { attacks: [{ id: 'daze', name: '惑わしの息', type: 'magic', range: 300, cd: 4, windup: 0.8, pct: 90, w: 80, h: 90, status: S('confuse', 4, 0.3) }] },
  M153: { attacks: [{ id: 'hex', name: 'のろい', type: 'magic', range: 300, cd: 4, windup: 0.8, pct: 90, w: 70, h: 90, status: S('curse', 8, 0.3) }] },
  M171: { touchStatus: S('stun', 2, 0.3) },
  M172: { touchStatus: S('poison', 8, 0.4) },
  M174: { attacks: [{ id: 'ink', name: '墨', type: 'shot', range: 320, cd: 3.5, windup: 0.3, pct: 100, status: S('darkness', 6, 0.5) }] },
  M178: { attacks: [{ id: 'gloom', name: '闇のもや', type: 'magic', range: 300, cd: 4, windup: 0.8, pct: 100, w: 80, h: 90, status: S('darkness', 6, 0.4) }] },
  M193: { attacks: [{ id: 'pray', name: '祈りののろい', type: 'magic', range: 300, cd: 4, windup: 0.9, pct: 100, w: 80, h: 100, status: S('curse', 10, 0.4) }] },
  M195: { attacks: [
    { id: 'seal', name: '封印の魔法', type: 'magic', range: 320, cd: 5, windup: 0.9, pct: 80, w: 80, h: 100, status: S('seal', 4, 0.5) },
    { id: 'bless', name: '守りの祈り', type: 'buff', allies: true, w: 400, range: 400, cd: 18, windup: 0.8, buff: { def: 40, mdef: 40, sec: 15 } },
  ] },
  M232: { attacks: [{ id: 'void', name: '虚ろの光', type: 'magic', range: 320, cd: 4, windup: 0.8, pct: 100, w: 80, h: 100, status: S('seal', 3, 0.3) }] },

  // ===== 地域のボス（MONSTERS.md 5-1） =====
  M029: { // キノコの女王
    attacks: [
      { id: 'quake', name: '大跳ねの着地', type: 'area', global: true, groundOnly: true, cd: 12, windup: 1.2, pct: 80, status: S('stun', 1) },
      { id: 'call', name: 'キノコ呼び', type: 'summon', mobs: ['M024', 'M021'], count: 6, max: 6, cd: 25, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '女王' }] },
  },
  M069: { // 下水の大ワニ
    attacks: [
      { id: 'bite', name: '噛みつき', type: 'melee', range: 110, cd: 3, windup: 0.5, pct: 130, w: 110, h: 80 },
      { id: 'tail', name: '尾払い', type: 'melee', back: true, range: 120, cd: 5, windup: 0.4, pct: 110, w: 120, h: 60 },
      { id: 'swamp', name: '毒の沼', type: 'magic', range: 400, cd: 12, windup: 1.0, pct: 60, w: 200, h: 40, linger: 10, status: S('poison', 5, 1, 2) },
      { id: 'dive', name: '潜って飛び出す', type: 'dive', range: 600, cd: 8, windup: 1.2, pct: 150, w: 120, h: 90, phases: [1] },
    ],
    boss: { phases: [{ hp: 1, name: '陸' }, { hp: 0.5, name: '水の中', rate: 1.2 }] },
  },
  M088: { // ゾンビダケの王
    attacks: [
      { id: 'spore', name: '呪いの胞子', type: 'magic', range: 400, cd: 10, windup: 1.0, pct: 70, w: 400, h: 120, status: S('curse', 10) },
      { id: 'call', name: 'ゾンビダケ呼び', type: 'summon', mobs: ['M071'], count: 4, max: 8, cd: 25, windup: 0.8 },
      { id: 'stomp', name: '跳ねて着地', type: 'area', w: 320, groundOnly: true, cd: 8, windup: 1.0, pct: 120, status: S('stun', 1, 0.5) },
    ],
    boss: { phases: [{ hp: 1, name: '王' }] },
  },
  M039: { // 大樹の怪
    attacks: [
      { id: 'root', name: '突き出す根', type: 'magic', range: 500, cd: 4, windup: 1.0, pct: 120, w: 80, h: 120 },
      { id: 'seeds', name: '種の雨', type: 'magic', range: 600, cd: 9, windup: 1.2, pct: 90, w: 60, h: 120, count: 3, spread: 150 },
      { id: 'vine', name: 'からむツタ', type: 'magic', range: 400, cd: 10, windup: 0.9, pct: 60, w: 120, h: 60, status: S('weak', 4), pull: 200 },
    ],
    boss: { phases: [{ hp: 1, name: '大樹' }, { hp: 0.4, name: '燃える枝', rate: 1.5, elements: { fire: 2 } }] },
  },
  M059: { // ガイコツ大将
    attacks: [
      { id: 'cleave', name: '大剣の振り下ろし', type: 'melee', range: 170, cd: 4, windup: 0.7, pct: 150, w: 170, h: 110 },
      { id: 'call', name: '骨の兵呼び', type: 'summon', mobs: ['M048'], count: 2, max: 6, cd: 18, windup: 0.8 },
      { id: 'arrows', name: '骨の矢の雨', type: 'magic', physical: true, range: 600, cd: 12, windup: 1.2, pct: 90, w: 60, h: 140, count: 5, spread: 120 },
      { id: 'guard', name: '骨の守り', type: 'buff', range: 600, cd: 20, windup: 0.8, buff: { def: 60, sec: 15 } },
    ],
    boss: { phases: [{ hp: 1, name: '兜' }, { hp: 0.5, name: '兜が落ちた', elements: { holy: 3 } }] },
  },
  M159: { // からくり大王
    attacks: [
      { id: 'block', name: '積み木投げ', type: 'shot', range: 400, cd: 3, windup: 0.5, pct: 110, speed: 280, life: 1.6 },
      { id: 'split', name: '分裂', type: 'summon', mobs: ['M147'], count: 4, max: 4, cd: 30, windup: 1.0 },
    ],
    boss: { phases: [{ hp: 1, name: '大王' }] },
  },
  M089: { // 黒角の魔獣
    attacks: [
      { id: 'orb', name: '闇の玉', type: 'shot', magic: true, range: 450, cd: 3, windup: 0.5, pct: 110, speed: 220, life: 2.2 },
      { id: 'swoop', name: '急降下', type: 'dive', range: 600, cd: 9, windup: 1.0, pct: 150, w: 120, h: 100, phases: [1, 2] },
      { id: 'flame', name: '黒い炎の雨', type: 'magic', range: 800, cd: 14, windup: 1.4, pct: 120, w: 260, h: 160 },
      { id: 'seal', name: '封印', type: 'magic', range: 400, cd: 15, windup: 1.0, pct: 0, w: 120, h: 120, status: S('seal', 3) },
      { id: 'rage', name: '怒りの咆哮', type: 'buff', range: 800, cd: 25, windup: 1.0, buff: { atk: 30, speed: 30, sec: 15 }, phases: [2] },
    ],
    boss: { phases: [{ hp: 1, name: '地上' }, { hp: 0.66, name: '空', speedMul: 1.2 }, { hp: 0.33, name: '怒り', rate: 1.5, atkMul: 1.1 }] },
  },
  M119: { // 雲の魔女
    attacks: [
      { id: 'thunder', name: '雷', type: 'magic', range: 600, cd: 3, windup: 0.8, pct: 120, w: 60, h: 200 },
      { id: 'stone', name: '石化の光', type: 'shot', magic: true, range: 400, cd: 8, windup: 0.6, pct: 50, speed: 300, status: S('stun', 2, 0.7) },
      { id: 'call', name: 'ホシの子呼び', type: 'summon', mobs: ['M100'], count: 2, max: 4, cd: 20, windup: 0.8 },
      { id: 'veil', name: '雲の衣', type: 'buff', range: 800, cd: 25, windup: 0.8, buff: { mdef: 60, magicReflect: 20, sec: 15 } },
      { id: 'change', name: '変化の光', type: 'shot', magic: true, range: 400, cd: 14, windup: 0.6, pct: 0, speed: 280, status: S('polymorph', 4, 0.5) },
    ],
    boss: { phases: [{ hp: 1, name: '魔女' }, { hp: 0.5, name: '分身', rate: 1.3, clones: { count: 2, hpPct: 2, shuffle: 8 } }] },
  },
  M139: { // 雪原の大狼
    attacks: [
      { id: 'bite', name: '噛みつき', type: 'melee', range: 120, cd: 3, windup: 0.5, pct: 130, w: 120, h: 90 },
      { id: 'blizzard', name: '吹雪', type: 'area', global: true, safeHeight: 120, cd: 15, windup: 1.5, pct: 60, status: S('freeze', 2) },
      { id: 'howl', name: '遠吠え', type: 'summon', mobs: ['M121'], count: 4, max: 4, cd: 30, windup: 1.0 },
    ],
    boss: { phases: [{ hp: 1, name: '大狼' }, { hp: 0.5, name: '怒り', rate: 1.3, speedMul: 1.2 }] },
  },
  M160: { // 時計塔の魔物
    attacks: [
      { id: 'stop', name: '時を止める', type: 'area', global: true, cd: 20, windup: 2.0, pct: 0, status: S('stun', 3) },
      { id: 'hand', name: '時計の針', type: 'melee', range: 220, cd: 4, windup: 0.7, pct: 140, w: 220, h: 80 },
      { id: 'call', name: '時の亡霊呼び', type: 'summon', mobs: ['M157'], count: 2, max: 4, cd: 25, windup: 0.8 },
      { id: 'late', name: '時の遅れ', type: 'magic', range: 500, cd: 12, windup: 1.0, pct: 0, w: 200, h: 120, status: S('slow', 6, 1, 40) },
    ],
    boss: {
      phases: [{ hp: 1, name: '時計' }, { hp: 0.5, name: '乗り手', rate: 1.3, atkMul: 1.1 }],
      rifts: { phase: 0, count: 3, mob: 'M149', limit: 60, guard: 0.1, expose: 20 },
    },
  },
  M189: { // 深淵の大魚
    attacks: [
      { id: 'whirl', name: '渦潮', type: 'area', w: 140, cd: 10, windup: 1.6, pct: 100, suck: { w: 600, speed: 110 } },
      { id: 'school', name: '小魚の群れ', type: 'shot', range: 600, cd: 8, windup: 0.8, pct: 80, speed: 320, life: 2.5, count: 3, spread: 60 },
      { id: 'call', name: '小魚呼び', type: 'summon', mobs: ['M170'], count: 3, max: 6, cd: 25, windup: 0.8 },
    ],
    boss: { phases: [
      { hp: 1, name: '浅瀬' },
      { hp: 0.75, name: '潜る', submerge: { sec: 30, healPct: 5, rocks: 3, rockHpPct: 0.5 } },
      { hp: 0.5, name: '深く潜る', submerge: { sec: 30, healPct: 5, rocks: 3, rockHpPct: 0.5 } },
      { hp: 0.25, name: '溝の底', rate: 1.3, submerge: { sec: 30, healPct: 5, rocks: 4, rockHpPct: 0.5 } },
    ] },
  },
  M199: { // 神殿の守護神
    attacks: [
      { id: 'fist', name: '石の拳', type: 'melee', range: 140, cd: 3, windup: 0.6, pct: 140, w: 140, h: 100 },
      { id: 'pillar', name: '光の柱', type: 'magic', range: 600, cd: 6, windup: 1.2, pct: 150, w: 100, h: 220 },
      { id: 'seal', name: '封印', type: 'magic', range: 400, cd: 15, windup: 1.0, pct: 0, w: 140, h: 120, status: S('seal', 3) },
      { id: 'mirror', name: '光の鏡', type: 'buff', range: 800, cd: 25, windup: 1.0, buff: { reflect: 20, def: 40, sec: 12 }, phases: [1, 2] },
    ],
    boss: { phases: [
      { hp: 1, name: '石', elements: { lightning: 1.5 } },
      { hp: 0.66, name: '金', elements: { ice: 1.5 } },
      { hp: 0.33, name: '光', elements: { dark: 1.5 }, rate: 1.2 },
    ] },
  },

  // ===== 大ボス（MONSTERS.md 5-2。部位は段階にまとめた簡略版） =====
  M229: { // 焔の巨像
    attacks: [
      { id: 'slam', name: '腕の叩きつけ', type: 'magic', range: 600, cd: 5, windup: 1.0, pct: 130, w: 120, h: 120, phases: [0] },
      { id: 'fireball', name: '火の玉', type: 'shot', magic: true, range: 600, cd: 4, windup: 0.5, pct: 110, speed: 260, life: 2.5, phases: [0] },
      { id: 'poison', name: '毒の腕', type: 'magic', range: 600, cd: 12, windup: 1.0, pct: 60, w: 160, h: 60, linger: 6, status: S('poison', 5, 1, 2), phases: [0] },
      { id: 'seal', name: '封印の腕', type: 'magic', range: 600, cd: 15, windup: 1.0, pct: 0, w: 140, h: 120, status: S('seal', 3), phases: [0] },
      { id: 'dark', name: '暗闇の腕', type: 'magic', range: 600, cd: 15, windup: 1.0, pct: 0, w: 140, h: 120, status: S('darkness', 6), phases: [0] },
      { id: 'wave', name: '気絶の波', type: 'area', global: true, groundOnly: true, cd: 18, windup: 1.5, pct: 60, status: S('stun', 1.5), phases: [0] },
      { id: 'mend', name: '回復の腕', type: 'heal', pct: 2, cd: 30, windup: 1.5, phases: [0] },
      { id: 'rain', name: '火の雨', type: 'area', global: true, safeHeight: 150, cd: 10, windup: 1.5, pct: 100, phases: [1, 2] },
      { id: 'doom', name: '全滅の炎', type: 'area', global: true, cd: 60, windup: 5, pct: 300, phases: [2], shelter: { at: [0.06, 0.94], w: 90 } },
    ],
    boss: { phases: [{ hp: 1, name: '腕' }, { hp: 0.6, name: '上半身' }, { hp: 0.3, name: '怒り', atkMul: 1.2, speedMul: 1.2, rate: 1.3 }] },
  },
  M219: { // 三つ首の黒竜
    attacks: [
      { id: 'fire', name: '火の吐息', type: 'magic', range: 700, cd: 6, windup: 1.2, pct: 140, w: 400, h: 120, phases: [0, 2] },
      { id: 'ice', name: '氷の吐息', type: 'magic', range: 700, cd: 6, windup: 1.2, pct: 120, w: 400, h: 120, status: S('freeze', 2), phases: [1, 2] },
      { id: 'thunder', name: '雷の吐息', type: 'magic', range: 700, cd: 6, windup: 1.2, pct: 140, w: 100, h: 220, count: 3, spread: 160, phases: [2] },
      { id: 'tail', name: '尾払い', type: 'melee', back: true, range: 200, cd: 6, windup: 0.6, pct: 150, w: 200, h: 100, phases: [2] },
      { id: 'wind', name: '翼の風', type: 'area', global: true, cd: 20, windup: 1.5, pct: 50, status: S('weak', 5), phases: [2] },
    ],
    boss: { phases: [{ hp: 1, name: '左の首' }, { hp: 0.8, name: '右の首' }, { hp: 0.6, name: '本体', rate: 1.2 }] },
  },
  M239: { // 星を呑む者
    attacks: [
      { id: 'shade', name: '影の手', type: 'magic', range: 700, cd: 4, windup: 1.0, pct: 130, w: 100, h: 140 },
      { id: 'call', name: '星喰い呼び', type: 'summon', mobs: ['M234'], count: 4, max: 4, cd: 40, windup: 1.0, phases: [0] },
      { id: 'meteor', name: '星の雨', type: 'magic', range: 900, cd: 10, windup: 1.4, pct: 120, w: 80, h: 200, count: 5, spread: 140, phases: [2, 3] },
      { id: 'nova', name: '星の爆発', type: 'area', global: true, safeHeight: 150, cd: 18, windup: 2.0, pct: 150, phases: [3] },
      { id: 'void', name: '虚無', type: 'area', global: true, cd: 25, windup: 2.0, pct: 0, status: S('seal', 4), phases: [3] },
      { id: 'daze', name: '惑いの星', type: 'area', global: true, cd: 22, windup: 1.5, pct: 0, status: S('confuse', 4), phases: [2, 3] },
    ],
    boss: { phases: [
      { hp: 1, name: '影', summon: { mobs: ['M234'], count: 4 } },
      { hp: 0.8, name: '鎧', defMul: 3 },
      { hp: 0.55, name: '翼', speedMul: 1.3 },
      { hp: 0.3, name: '星', rate: 1.3, atkMul: 1.1 },
    ] },
  },

  // ===== 1 人用ダンジョンの主（MONSTERS.md 5-3） =====
  M068: { attacks: [{ id: 'call', name: '子ネズミ呼び', type: 'summon', mobs: ['M061'], count: 3, max: 6, cd: 15, windup: 0.6 }], boss: { phases: [{ hp: 1, name: '大ネズミ' }] } },
  M161: { attacks: [{ id: 'screw', name: 'ネジの弾', type: 'shot', range: 400, cd: 2.5, windup: 0.4, pct: 110, speed: 340, count: 2, spread: 40 }], boss: { phases: [{ hp: 1, name: '王' }] } },
  M162: { attacks: [{ id: 'bark', name: '吠える', type: 'area', w: 300, cd: 10, windup: 0.8, pct: 50, status: S('stun', 1.5) }], boss: { phases: [{ hp: 1, name: '番犬' }] } },
  M118: {
    attacks: [
      { id: 'light', name: '光の玉', type: 'shot', magic: true, range: 400, cd: 3, windup: 0.5, pct: 110, speed: 260, life: 1.8 },
      { id: 'call', name: '星の子呼び', type: 'summon', mobs: ['M100', 'M101'], count: 2, max: 4, cd: 20, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '番人' }] },
  },
  M188: { attacks: [{ id: 'anchor', name: '錨投げ', type: 'shot', range: 400, cd: 4, windup: 0.6, pct: 150, speed: 300, life: 1.6 }], boss: { phases: [{ hp: 1, name: '船長' }] } },
  M213: { attacks: [{ id: 'breath', name: '火の息', type: 'magic', range: 500, cd: 5, windup: 1.0, pct: 130, w: 300, h: 100 }], boss: { phases: [{ hp: 1, name: '母竜' }] } },
  M300: {
    attacks: [
      { id: 'slash', name: '影の一撃', type: 'melee', range: 100, cd: 2.5, windup: 0.4, pct: 120, w: 100, h: 80 },
      { id: 'bolt', name: '影の魔法', type: 'magic', range: 400, cd: 5, windup: 0.8, pct: 110, w: 80, h: 100 },
    ],
    boss: { phases: [{ hp: 1, name: '影' }] },
  },

  // ===== クエスト専用のボス（QUESTS.md 8 章。そのクエストの間だけ湧く） =====
  M400: { // ころがり大岩ガニ
    attacks: [{ id: 'roll', name: '丸まって転がる', type: 'dive', range: 500, cd: 7, windup: 1.2, pct: 120, w: 120, h: 60 }],
    boss: { phases: [{ hp: 1, name: '大岩ガニ' }] },
  },
  M401: { // ヤドカリの親分
    attacks: [
      { id: 'pinch', name: '大ばさみ', type: 'melee', range: 90, cd: 3, windup: 0.5, pct: 130, w: 90, h: 70 },
      { id: 'call', name: '子分呼び', type: 'summon', mobs: ['M014'], count: 2, max: 4, cd: 20, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '親分' }, { hp: 0.4, name: '殻にこもる', defMul: 2, rate: 0.8 }] },
  },
  M402: { // わらの大王
    attacks: [
      { id: 'straw', name: 'わらの雨', type: 'magic', range: 500, cd: 6, windup: 1.0, pct: 90, w: 60, h: 120, count: 3, spread: 140 },
      { id: 'call', name: 'カカシ兵の行進', type: 'summon', mobs: ['M027'], count: 2, max: 4, cd: 22, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '大王' }, { hp: 0.5, name: '冠が光る', rate: 1.3, elements: { fire: 1.8 } }] },
  },
  M403: { // 夜泣きの古ツタ
    attacks: [
      { id: 'vine', name: 'からむツタ', type: 'magic', range: 450, cd: 7, windup: 0.9, pct: 70, w: 120, h: 60, status: S('slow', 4, 1, 30), pull: 180 },
      { id: 'sob', name: '夜泣き', type: 'area', w: 360, cd: 12, windup: 1.2, pct: 40, status: S('sleep', 2, 0.4) },
    ],
    boss: { phases: [{ hp: 1, name: '古ツタ' }] },
  },
  M404: { // よみがえった化石竜
    attacks: [
      { id: 'bite', name: '骨の顎', type: 'melee', range: 110, cd: 3, windup: 0.6, pct: 140, w: 110, h: 80 },
      { id: 'quake', name: '地響き', type: 'area', global: true, groundOnly: true, cd: 14, windup: 1.4, pct: 70, status: S('stun', 1) },
    ],
    boss: { phases: [{ hp: 1, name: '骨' }, { hp: 0.5, name: 'かけらの光', atkMul: 1.2, speedMul: 1.2, summon: { mobs: ['M046'], count: 2 } }] },
  },
  M405: { // 回送電車の車掌
    attacks: [
      { id: 'ticket', name: '切符の改め', type: 'shot', magic: true, range: 400, cd: 3, windup: 0.4, pct: 100, speed: 300, status: S('seal', 3, 0.3) },
      { id: 'rush', name: '回送電車', type: 'area', global: true, safeHeight: 60, cd: 15, windup: 1.6, pct: 120 },
    ],
    boss: { phases: [{ hp: 1, name: '車掌' }] },
  },
  M406: { // 眠りの女王蛾
    attacks: [
      { id: 'dust', name: '眠りの鱗粉', type: 'magic', range: 400, cd: 6, windup: 1.0, pct: 70, w: 140, h: 120, status: S('sleep', 3, 0.5) },
      { id: 'call', name: '蛾の群れ', type: 'summon', mobs: ['M083'], count: 3, max: 6, cd: 20, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '女王蛾' }, { hp: 0.4, name: '霧の中', rate: 1.3 }] },
  },
  M407: { // 迷子の雷雲ゴロン
    attacks: [
      { id: 'bolt', name: '泣き雷', type: 'magic', range: 500, cd: 4, windup: 0.9, pct: 110, w: 70, h: 160, count: 2, spread: 180, status: S('stun', 1, 0.3) },
      { id: 'rain', name: '大粒の涙', type: 'area', w: 400, cd: 10, windup: 1.0, pct: 60, status: S('slow', 4, 1, 20) },
    ],
    boss: { phases: [{ hp: 1, name: 'しくしく' }, { hp: 0.5, name: 'わんわん', rate: 1.4 }] },
  },
  M408: { // 氷柱の牙王
    attacks: [
      { id: 'fang', name: '氷の牙', type: 'melee', range: 110, cd: 3, windup: 0.5, pct: 140, w: 110, h: 80, status: S('freeze', 1.5, 0.3) },
      { id: 'howl', name: '遠吠え', type: 'area', w: 500, cd: 14, windup: 1.0, pct: 0, status: S('weak', 5, 0.8) },
      { id: 'call', name: '群れ呼び', type: 'summon', mobs: ['M121'], count: 2, max: 4, cd: 25, windup: 0.8, phases: [1] },
    ],
    boss: { phases: [{ hp: 1, name: '牙王' }, { hp: 0.5, name: '吹雪', speedMul: 1.3, atkMul: 1.1 }] },
  },
  M409: { // ぜんまい楽隊長
    attacks: [
      { id: 'baton', name: '指揮棒の音符', type: 'shot', range: 450, cd: 2.5, windup: 0.4, pct: 100, speed: 300, count: 3, spread: 50 },
      { id: 'march', name: '行進の合図', type: 'summon', mobs: ['M148'], count: 2, max: 4, cd: 20, windup: 0.8 },
    ],
    boss: { phases: [{ hp: 1, name: '行進' }, { hp: 0.4, name: '早送り', rate: 1.5, speedMul: 1.3 }] },
  },
  M410: { // 沈み鐘の亡霊
    attacks: [
      { id: 'bell', name: '鐘の音', type: 'area', global: true, cd: 12, windup: 1.4, pct: 60, status: S('stun', 1.5, 0.6) },
      { id: 'wave', name: '亡霊の波', type: 'shot', magic: true, range: 450, cd: 3.5, windup: 0.5, pct: 110, speed: 260, life: 1.6 },
    ],
    boss: { phases: [{ hp: 1, name: '亡霊' }, { hp: 0.5, name: '鐘が割れる', rate: 1.3, clones: { count: 1, hpPct: 3, shuffle: 10 } }] },
  },
  M411: { // 石板食いの大紙魚
    attacks: [
      { id: 'dive', name: '石の床に潜る', type: 'dive', range: 600, cd: 8, windup: 1.2, pct: 150, w: 120, h: 70 },
      { id: 'dust', name: '銀の粉', type: 'area', w: 300, cd: 10, windup: 0.8, pct: 60, status: S('darkness', 5, 0.6) },
    ],
    boss: { phases: [{ hp: 1, name: '紙魚' }] },
  },
  M412: { // はぐれ骨竜の古兵
    attacks: [
      { id: 'spear', name: '古い槍', type: 'melee', range: 140, cd: 3, windup: 0.6, pct: 140, w: 140, h: 70 },
      { id: 'shield', name: '骨の盾を構える', type: 'buff', cd: 20, windup: 0.5, buff: { def: 50, reflect: 10, sec: 8 } },
    ],
    boss: { phases: [{ hp: 1, name: '古兵' }, { hp: 0.5, name: '竜の記憶', atkMul: 1.2, summon: { mobs: ['M204'], count: 1 } }] },
  },
  M413: { // 灰かぶりの鍛冶霊
    attacks: [
      { id: 'hammer', name: '金槌の一撃', type: 'melee', range: 100, cd: 3, windup: 0.6, pct: 150, w: 100, h: 90, status: S('stun', 1, 0.3) },
      { id: 'sparks', name: '火の粉', type: 'magic', range: 500, cd: 6, windup: 0.9, pct: 100, w: 60, h: 120, count: 3, spread: 120, linger: 4 },
    ],
    boss: { phases: [{ hp: 1, name: '鍛冶霊' }] },
  },
  M414: { // 流れ星の亡霊騎士
    attacks: [
      { id: 'slash', name: '星の剣', type: 'melee', range: 120, cd: 3, windup: 0.5, pct: 140, w: 120, h: 80 },
      { id: 'meteor', name: '流れ星', type: 'magic', range: 600, cd: 7, windup: 1.2, pct: 120, w: 80, h: 160, count: 3, spread: 160 },
    ],
    boss: { phases: [{ hp: 1, name: '騎士' }, { hp: 0.6, name: '星の盾', defMul: 2 }, { hp: 0.3, name: '燃え尽きる前に', rate: 1.4, atkMul: 1.2 }] },
  },
  M415: { // 化けダヌキの大泥棒
    attacks: [
      { id: 'leaf', name: '木の葉手裏剣', type: 'shot', range: 450, cd: 2.5, windup: 0.4, pct: 100, speed: 320, count: 2, spread: 40 },
      { id: 'drum', name: '腹つづみ', type: 'area', w: 320, cd: 12, windup: 1.0, pct: 60, status: S('confuse', 3, 0.5) },
    ],
    boss: { phases: [{ hp: 1, name: '大泥棒' }, { hp: 0.5, name: '化け分身', clones: { count: 2, hpPct: 2, shuffle: 8 } }] },
  },
};
