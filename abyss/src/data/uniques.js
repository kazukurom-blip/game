// ユニーク・セット・ミシック。担当: アイテム担当。
// ユニークの形: { id, name, base（ベースの種類。防具は 'helm.plate' のように 部位.スタイル）, slot, req（出始めるアイテムレベル）,
//                flavor（短い言い伝え）, mods: [{ s, min, max }]（固定のオプション）, power（特別な力の id）, cls?（クラス専用） }
//   mods の数値: scale のある能力（ライフ・追加ダメージなど）は Lv1 の値（アイテムレベルの曲線で伸びる）、
//               それ以外はアイテムレベル 90 での値（低いアイテムレベルでは弱くなる: 40%〜125%）。
// セットの形:   { id, name, cls?, desc, pieces: [{ id, name, base, slot, mods }], bonus: { 2: { mods, power? }, 4: ..., 6: ... } }
//   power: { id, v }（セットの力は数値が決まっている）。同じ部品は 2 つ着けても 1 つと数える。
// ミシックの形: ユニークと同じ + base: 'any'（クラスに合う種類で出る）。固定のオプションはすべて「大いなる」（×1.5・★）。
// 絵: 装備した姿の差し替え枠は gear.u.<id>（manifest が自動で作る）。

export const UNIQUES = [
  // ================= 武器
  { id: 'u_grief', name: '慟哭の刃', base: 'sword', slot: 'weapon', req: 8, cls: 'warrior', flavor: '泣き女の涙で鍛えられ、斬るたびに細く啜り泣く。', mods: [{ s: 'weapon_dmg', min: 70, max: 100 }, { s: 'add_phys', min: 2, max: 3 }, { s: 'crit_chance', min: 4, max: 6 }], power: 'u_grief' },
  { id: 'u_widow', name: '寡婦の斧', base: 'axe', slot: 'weapon', req: 12, cls: 'warrior', flavor: '夫を奪った獣の首を、彼女はこの斧で七日かけて刎ねた。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'bleed_chance', min: 20, max: 30 }, { s: 'inc_phys', min: 30, max: 45 }], power: 'u_widow' },
  { id: 'u_bellringer', name: '鐘撞きの槌', base: 'mace', slot: 'weapon', req: 20, cls: 'warrior', flavor: '廃寺の鐘を叩き割った槌。いまも頭の中で鳴り止まない。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'dmg_elite', min: 20, max: 30 }, { s: 'str', min: 30, max: 50 }], power: 'u_bellringer' },
  { id: 'u_kingslayer', name: '王殺しの大剣', base: 'greatsword', slot: 'weapon', req: 30, cls: 'warrior', flavor: '三人の王の血を吸い、四人目を待っている。', mods: [{ s: 'weapon_dmg', min: 80, max: 120 }, { s: 'dmg_boss', min: 25, max: 40 }, { s: 'crit_damage', min: 40, max: 60 }], power: 'u_kingslayer' },
  { id: 'u_ashbrand', name: '灰燼の烙剣', base: 'sword', slot: 'weapon', req: 40, cls: 'warrior', flavor: '灰の降った日に焼け落ちた鍛冶場から、ただ一振りだけ残った。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'add_fire', min: 2.5, max: 4 }, { s: 'inc_fire', min: 30, max: 45 }], power: 'u_ashbrand' },
  { id: 'u_windpiercer', name: '風穿ちの長弓', base: 'bow', slot: 'weapon', req: 8, cls: 'ranger', flavor: '放った矢は、谷の向こうの鷹の目を射抜いた。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'attack_speed', min: 6, max: 10 }, { s: 'dex', min: 25, max: 40 }], power: 'u_windpiercer' },
  { id: 'u_starfall', name: '星墜としの弓', base: 'bow', slot: 'weapon', req: 35, cls: 'ranger', flavor: '狩人は夜空を狙った。翌朝、空から星が一つ減っていた。', mods: [{ s: 'weapon_dmg', min: 70, max: 100 }, { s: 'crit_chance', min: 4, max: 6 }, { s: 'crit_damage', min: 40, max: 60 }], power: 'u_starfall' },
  { id: 'u_ironbolt', name: '鉄杭の大弩', base: 'crossbow', slot: 'weapon', req: 15, cls: 'ranger', flavor: '城門を撃ち抜くための弩を、狂った職人が一人で担げるようにした。', mods: [{ s: 'weapon_dmg', min: 90, max: 130 }, { s: 'inc_phys', min: 30, max: 45 }, { s: 'dmg_vs_low', min: 20, max: 30 }], power: 'u_ironbolt' },
  { id: 'u_swarm', name: '群蜂の連弩', base: 'crossbow', slot: 'weapon', req: 45, cls: 'ranger', flavor: '一度引けば羽音のように矢が湧く。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'attack_speed', min: 8, max: 12 }, { s: 'add_poison', min: 2, max: 3 }], power: 'u_swarm' },
  { id: 'u_frostheart', name: '凍心の杖', base: 'staff', slot: 'weapon', req: 10, cls: 'sorcerer', flavor: '恋人を失った魔女は、心臓を氷に変えて杖の先に据えた。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'inc_cold', min: 35, max: 50 }, { s: 'int', min: 30, max: 50 }], power: 'u_frostheart' },
  { id: 'u_tempest', name: '嵐呼びの杖', base: 'staff', slot: 'weapon', req: 32, cls: 'sorcerer', flavor: 'この杖を掲げた日、三つの村に三日三晩雷が落ち続けた。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'inc_lightning', min: 35, max: 50 }, { s: 'inc_spell', min: 25, max: 40 }], power: 'u_tempest' },
  { id: 'u_cinder', name: '熾火の短杖', base: 'wand', slot: 'weapon', req: 18, cls: 'sorcerer', flavor: '消えたはずの火が、灰の中でまだ笑っている。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'ignite_chance', min: 15, max: 25 }, { s: 'inc_fire', min: 30, max: 45 }], power: 'u_cinder' },
  { id: 'u_whisper', name: '囁きの短杖', base: 'wand', slot: 'weapon', req: 50, cls: 'sorcerer', flavor: '持ち主にだけ、まだ誰も知らない呪文を囁く。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'crit_chance', min: 5, max: 7 }, { s: 'resource_regen', min: 20, max: 30 }], power: 'u_whisper' },
  { id: 'u_reaper', name: '刈り取る者の大鎌', base: 'scythe', slot: 'weapon', req: 14, cls: 'necromancer', flavor: '刈った命の数だけ、刃に小さな顔が浮かぶ。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'inc_minion', min: 30, max: 45 }, { s: 'leech', min: 1, max: 2 }], power: 'u_reaper' },
  { id: 'u_bonelord', name: '骨王の杖', base: 'rod', slot: 'weapon', req: 25, cls: 'necromancer', flavor: '骨の王は死んでも玉座を降りなかった。いまも杖の中に座っている。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'minion_life', min: 30, max: 45 }, { s: 'int', min: 30, max: 50 }], power: 'u_bonelord' },
  { id: 'u_plaguerod', name: '疫病の骨杖', base: 'rod', slot: 'weapon', req: 42, cls: 'necromancer', flavor: '黒い咳が三つの都を空にした。杖はまだ咳をしている。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'inc_poison', min: 35, max: 50 }, { s: 'poison_chance', min: 15, max: 25 }], power: 'u_plaguerod' },
  { id: 'u_nightfang', name: '夜牙', base: 'dagger', slot: 'weapon', req: 10, cls: 'assassin', flavor: '月のない夜にだけ鞘から抜ける。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'crit_damage', min: 40, max: 60 }, { s: 'dex', min: 25, max: 40 }], power: 'u_nightfang' },
  { id: 'u_serpent', name: '蛇の舌', base: 'dagger', slot: 'weapon', req: 28, cls: 'assassin', flavor: '二つに割れた刃先。どちらにも別々の毒が塗られている。', mods: [{ s: 'weapon_dmg', min: 50, max: 80 }, { s: 'add_poison', min: 2.5, max: 4 }, { s: 'poison_chance', min: 20, max: 30 }], power: 'u_serpent' },
  { id: 'u_tigerclaw', name: '虎爪', base: 'claw', slot: 'weapon', req: 20, cls: 'assassin', flavor: '人食い虎の前脚から作った。爪は持ち主を選ぶ。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'add_phys', min: 2, max: 3 }, { s: 'life_on_hit', min: 1.5, max: 2.5 }], power: 'u_tigerclaw' },
  { id: 'u_shadowclaw', name: '影縫いの鉤爪', base: 'claw', slot: 'weapon', req: 48, cls: 'assassin', flavor: '影を地面に縫い留めれば、人はもう逃げられない。', mods: [{ s: 'weapon_dmg', min: 60, max: 90 }, { s: 'crit_chance', min: 4, max: 6 }, { s: 'add_void', min: 2, max: 3.5 }], power: 'u_shadowclaw' },
  // ================= 副手
  { id: 'u_aegis', name: '不落の大盾', base: 'shield', slot: 'offhand', req: 15, cls: 'warrior', flavor: '百日の籠城を、この盾一枚で耐えた。', mods: [{ s: 'life', min: 8, max: 12 }, { s: 'armor', min: 6, max: 9 }, { s: 'res_all', min: 10, max: 15 }], power: 'u_aegis' },
  { id: 'u_thornshield', name: '茨の円盾', base: 'shield', slot: 'offhand', req: 35, cls: 'warrior', flavor: '殴りかかった者の拳が、盾に咲いた茨に絡め取られる。', mods: [{ s: 'thorns', min: 6, max: 10 }, { s: 'block', min: 6, max: 10 }, { s: 'inc_armor', min: 30, max: 45 }], power: 'u_thornshield' },
  { id: 'u_quiverstorm', name: '嵐の矢筒', base: 'quiver', slot: 'offhand', req: 25, cls: 'ranger', flavor: '底が無い。覗くと遠雷が聞こえる。', mods: [{ s: 'inc_projectile', min: 25, max: 40 }, { s: 'attack_speed', min: 6, max: 10 }, { s: 'dex', min: 20, max: 35 }], power: 'u_quiverstorm' },
  { id: 'u_orbofeye', name: '千里眼の宝珠', base: 'orb', slot: 'offhand', req: 22, cls: 'sorcerer', flavor: '覗き込むと、遠くで戦う自分の背中が見える。', mods: [{ s: 'inc_spell', min: 25, max: 40 }, { s: 'area', min: 12, max: 20 }, { s: 'max_resource', min: 20, max: 30 }], power: 'u_orbofeye' },
  { id: 'u_mirrororb', name: '鏡写しの宝珠', base: 'orb', slot: 'offhand', req: 45, cls: 'sorcerer', flavor: '映った呪いを、そっくりそのまま相手に返す。', mods: [{ s: 'res_all', min: 12, max: 18 }, { s: 'inc_elemental', min: 25, max: 40 }, { s: 'cdr', min: 5, max: 8 }], power: 'u_mirrororb' },
  { id: 'u_deadroll', name: '死者の名簿', base: 'grimoire', slot: 'offhand', req: 18, cls: 'necromancer', flavor: '名を書かれた者は、死んだあとも呼べば来る。', mods: [{ s: 'inc_minion', min: 25, max: 40 }, { s: 'minion_life', min: 20, max: 30 }, { s: 'int', min: 20, max: 35 }], power: 'u_deadroll' },
  { id: 'u_twinfang', name: '双子の牙', base: 'offblade', slot: 'offhand', req: 20, cls: 'assassin', flavor: '片割れの短剣と同じ夜に鍛えられた。二つで一つの獣。', mods: [{ s: 'attack_speed', min: 6, max: 10 }, { s: 'crit_chance', min: 3, max: 5 }, { s: 'inc_attack', min: 20, max: 35 }], power: 'u_twinfang' },
  // ================= 頭
  { id: 'u_crownofash', name: '灰の王冠', base: 'helm.plate', slot: 'helm', req: 20, cls: 'warrior', flavor: '燃え落ちた王国の、燃え残った冠。', mods: [{ s: 'life', min: 8, max: 12 }, { s: 'str', min: 30, max: 50 }, { s: 'res_fire', min: 20, max: 30 }], power: 'u_crownofash' },
  { id: 'u_hood', name: '狩人の頭巾', base: 'helm.leather', slot: 'helm', req: 16, cls: 'ranger', flavor: '獲物の匂いが染みついて、獣も仲間だと思い込む。', mods: [{ s: 'dex', min: 30, max: 50 }, { s: 'crit_chance', min: 3, max: 5 }, { s: 'life', min: 6, max: 9 }], power: 'u_hood' },
  { id: 'u_circlet', name: '星詠みの額冠', base: 'helm.cloth', slot: 'helm', req: 24, cls: 'sorcerer', flavor: '額に触れた星の光が、次に唱える言葉を教える。', mods: [{ s: 'int', min: 30, max: 50 }, { s: 'cdr', min: 5, max: 8 }, { s: 'res_all', min: 8, max: 12 }], power: 'u_circlet' },
  { id: 'u_skullcap', name: '髑髏の冠', base: 'helm.cloth', slot: 'helm', req: 26, cls: 'necromancer', flavor: '七つの髑髏が交代で耳元に忠告をくれる。たいていは嘘だ。', mods: [{ s: 'int', min: 30, max: 50 }, { s: 'minion_life', min: 20, max: 30 }, { s: 'life', min: 6, max: 9 }], power: 'u_skullcap' },
  { id: 'u_mask', name: '無貌の面', base: 'helm.leather', slot: 'helm', req: 30, cls: 'assassin', flavor: '被った者の顔を、誰も思い出せなくなる。', mods: [{ s: 'dex', min: 30, max: 50 }, { s: 'dodge', min: 4, max: 6 }, { s: 'crit_chance', min: 3, max: 5 }], power: 'u_mask' },
  // ================= 胴
  { id: 'u_bastion', name: '城塞の胸甲', base: 'chest.plate', slot: 'chest', req: 18, flavor: '城が落ちても、これを着た門番だけは立っていた。', mods: [{ s: 'life', min: 10, max: 15 }, { s: 'armor', min: 8, max: 11 }, { s: 'vit', min: 30, max: 50 }], power: 'u_bastion' },
  { id: 'u_mantle', name: '黄昏の外套', base: 'chest.cloth', slot: 'chest', req: 22, flavor: '昼と夜のあいだの色。どちらの魔も手を出しにくい。', mods: [{ s: 'res_all', min: 12, max: 18 }, { s: 'int', min: 25, max: 40 }, { s: 'life', min: 8, max: 12 }], power: 'u_mantle' },
  { id: 'u_bloodmail', name: '血吸いの鎖帷子', base: 'chest.mail', slot: 'chest', req: 30, flavor: '輪の一つ一つが小さな口になっている。', mods: [{ s: 'life', min: 9, max: 13 }, { s: 'str', min: 25, max: 40 }, { s: 'life_regen', min: 0.8, max: 1.2 }], power: 'u_bloodmail' },
  { id: 'u_shroud', name: '影の帷', base: 'chest.leather', slot: 'chest', req: 34, flavor: '着れば、自分の影の方が先に歩き出す。', mods: [{ s: 'dex', min: 30, max: 50 }, { s: 'dodge', min: 4, max: 6 }, { s: 'life', min: 8, max: 12 }], power: 'u_shroud' },
  { id: 'u_phoenix', name: '不死鳥の羽衣', base: 'chest.cloth', slot: 'chest', req: 55, flavor: '燃え尽きるたびに、前より少し美しくなる。', mods: [{ s: 'life', min: 10, max: 14 }, { s: 'res_fire', min: 30, max: 40 }, { s: 'inc_fire', min: 20, max: 30 }], power: 'u_phoenix' },
  // ================= 手
  { id: 'u_gauntlet', name: '巨人の籠手', base: 'gloves.plate', slot: 'gloves', req: 16, flavor: '指一本が子どもの腕ほどもある。なぜか手に合う。', mods: [{ s: 'str', min: 30, max: 50 }, { s: 'add_phys', min: 2, max: 3 }, { s: 'armor', min: 5, max: 8 }], power: 'u_gauntlet' },
  { id: 'u_quickhand', name: '早業の手袋', base: 'gloves.leather', slot: 'gloves', req: 12, flavor: '持ち主が気づく前に、もう三度振り終えている。', mods: [{ s: 'dex', min: 25, max: 40 }, { s: 'crit_chance', min: 3, max: 5 }, { s: 'life', min: 5, max: 8 }], power: 'u_quickhand' },
  { id: 'u_stormgrip', name: '雷握り', base: 'gloves.mail', slot: 'gloves', req: 28, flavor: '握った手を開くと、指の間で稲妻がはぜる。', mods: [{ s: 'add_lightning', min: 1.5, max: 6 }, { s: 'shock_chance', min: 15, max: 25 }, { s: 'attack_speed', min: 5, max: 8 }], power: 'u_stormgrip' },
  { id: 'u_frostfinger', name: '霜の指先', base: 'gloves.cloth', slot: 'gloves', req: 26, flavor: '触れた水は、落ちる前に凍る。', mods: [{ s: 'add_cold', min: 2, max: 3.5 }, { s: 'int', min: 25, max: 40 }, { s: 'crit_damage', min: 25, max: 40 }], power: 'u_frostfinger' },
  { id: 'u_venomglove', name: '毒手の籠手', base: 'gloves.leather', slot: 'gloves', req: 36, flavor: '握手を求められたら、断るのが礼儀だ。', mods: [{ s: 'add_poison', min: 2, max: 3.5 }, { s: 'poison_chance', min: 15, max: 25 }, { s: 'dex', min: 25, max: 40 }], power: 'u_venomglove' },
  // ================= 腰
  { id: 'u_girdle', name: '巨人の帯', base: 'belt.plate', slot: 'belt', req: 20, flavor: '締めれば背が伸びる気がする。気のせいではない。', mods: [{ s: 'life', min: 8, max: 12 }, { s: 'inc_life', min: 8, max: 12 }, { s: 'res_cold', min: 20, max: 30 }], power: 'u_girdle' },
  { id: 'u_coinbelt', name: '金貨袋の帯', base: 'belt.leather', slot: 'belt', req: 10, flavor: '強欲な商人の遺品。袋はいつも少しだけ重い。', mods: [{ s: 'gold_find', min: 30, max: 50 }, { s: 'life', min: 6, max: 9 }, { s: 'magic_find', min: 10, max: 18 }], power: 'u_coinbelt' },
  { id: 'u_cordofsouls', name: '魂縛りの紐', base: 'belt.cloth', slot: 'belt', req: 30, flavor: '結び目の一つ一つに、逃げ遅れた魂が絡まっている。', mods: [{ s: 'max_resource', min: 20, max: 30 }, { s: 'int', min: 25, max: 40 }, { s: 'life', min: 6, max: 9 }], power: 'u_cordofsouls' },
  { id: 'u_chainbelt', name: '鎖の帯', base: 'belt.mail', slot: 'belt', req: 40, flavor: '処刑場の鎖を打ち直した。じゃらりと鳴るたび敵が怯む。', mods: [{ s: 'life', min: 8, max: 12 }, { s: 'res_all', min: 10, max: 15 }, { s: 'dr', min: 3, max: 5 }], power: 'u_chainbelt' },
  // ================= 脚
  { id: 'u_stonelegs', name: '岩の脚甲', base: 'legs.plate', slot: 'legs', req: 22, flavor: '山の神の脛当て。履いた者は根を張る。', mods: [{ s: 'armor', min: 8, max: 11 }, { s: 'life', min: 8, max: 12 }, { s: 'str', min: 25, max: 40 }], power: 'u_stonelegs' },
  { id: 'u_wanderer', name: '旅人の脚絆', base: 'legs.leather', slot: 'legs', req: 8, flavor: '世界の果てまで歩いて戻ってきた男の、たった一つの荷物。', mods: [{ s: 'move_speed', min: 10, max: 15 }, { s: 'dex', min: 20, max: 35 }, { s: 'life', min: 6, max: 9 }], power: 'u_wanderer' },
  { id: 'u_runedpants', name: '呪紋の袴', base: 'legs.cloth', slot: 'legs', req: 28, flavor: '裏地いっぱいに、読めない字で呪文が縫い込まれている。', mods: [{ s: 'int', min: 30, max: 50 }, { s: 'res_lightning', min: 20, max: 30 }, { s: 'life', min: 6, max: 9 }], power: 'u_runedpants' },
  { id: 'u_ironlegs', name: '鉄壁の鎖脚絆', base: 'legs.mail', slot: 'legs', req: 38, flavor: '一度も膝をつかなかった騎士団の、最後の一揃い。', mods: [{ s: 'life', min: 8, max: 12 }, { s: 'vit', min: 30, max: 50 }, { s: 'armor', min: 6, max: 9 }], power: 'u_ironlegs' },
  // ================= 足
  { id: 'u_windboots', name: '疾風の靴', base: 'boots.leather', slot: 'boots', req: 10, flavor: '風の精が片方ずつ住んでいる。仲が悪い。', mods: [{ s: 'move_speed', min: 15, max: 22 }, { s: 'dex', min: 20, max: 35 }, { s: 'dodge', min: 2, max: 4 }], power: 'u_windboots' },
  { id: 'u_emberstep', name: '燃え足', base: 'boots.cloth', slot: 'boots', req: 30, flavor: '歩いた跡には、三日は消えない火が残る。', mods: [{ s: 'move_speed', min: 12, max: 18 }, { s: 'res_fire', min: 25, max: 35 }, { s: 'int', min: 20, max: 35 }], power: 'u_emberstep' },
  { id: 'u_ironboots', name: '鉄の重靴', base: 'boots.plate', slot: 'boots', req: 24, flavor: '重すぎて誰も履きこなせない。だから誰も倒せない。', mods: [{ s: 'armor', min: 6, max: 9 }, { s: 'life', min: 8, max: 12 }, { s: 'res_all', min: 8, max: 12 }], power: 'u_ironboots' },
  { id: 'u_ghoststep', name: '亡霊の足音', base: 'boots.mail', slot: 'boots', req: 44, flavor: '足音だけが、少し遅れてついてくる。', mods: [{ s: 'move_speed', min: 12, max: 18 }, { s: 'dodge', min: 4, max: 6 }, { s: 'vit', min: 25, max: 40 }], power: 'u_ghoststep' },
  // ================= 首飾り
  { id: 'u_eye', name: '深淵の眼', base: 'amulet', slot: 'amulet', req: 60, flavor: '覗けば覗くほど、向こうもこちらを覗いている。', mods: [{ s: 'inc_dmg', min: 20, max: 30 }, { s: 'crit_damage', min: 30, max: 45 }, { s: 'all_attr', min: 15, max: 25 }], power: 'u_eye' },
  { id: 'u_heartstone', name: '心臓石の首飾り', base: 'amulet', slot: 'amulet', req: 15, flavor: '石なのに、たまに脈を打つ。', mods: [{ s: 'inc_life', min: 8, max: 12 }, { s: 'res_all', min: 10, max: 15 }, { s: 'vit', min: 25, max: 40 }], power: 'u_heartstone' },
  { id: 'u_prism', name: '七色の雫', base: 'amulet', slot: 'amulet', req: 30, flavor: '光を通すと、この世に無い色が一つだけ混じる。', mods: [{ s: 'inc_elemental', min: 25, max: 40 }, { s: 'crit_chance', min: 3, max: 5 }, { s: 'int', min: 20, max: 35 }], power: 'u_prism' },
  { id: 'u_bonecharm', name: '骨の護符', base: 'amulet', slot: 'amulet', req: 20, cls: 'necromancer', flavor: '指の骨を七本つないだ護符。数えるたびに一本増えている。', mods: [{ s: 'inc_minion', min: 25, max: 40 }, { s: 'minion_life', min: 20, max: 30 }, { s: 'int', min: 20, max: 35 }], power: 'u_bonecharm' },
  { id: 'u_beckon', name: '招福の鈴', base: 'amulet', slot: 'amulet', req: 12, flavor: '鳴らすと福が来る。代わりに何が出ていくかは、誰も知らない。', mods: [{ s: 'magic_find', min: 20, max: 30 }, { s: 'gold_find', min: 20, max: 30 }, { s: 'xp_bonus', min: 8, max: 12 }], power: 'u_beckon' },
  // ================= 指輪
  { id: 'u_bandofwar', name: '戦の環', base: 'ring', slot: 'ring', req: 18, flavor: '戦場で拾った指輪。前の持ち主の指ごと落ちていた。', mods: [{ s: 'inc_dmg', min: 15, max: 25 }, { s: 'attack_speed', min: 5, max: 8 }, { s: 'add_phys', min: 1.5, max: 2.5 }], power: 'u_bandofwar' },
  { id: 'u_ringofsun', name: '日輪', base: 'ring', slot: 'ring', req: 25, flavor: '真昼の太陽を一滴だけ閉じ込めた。', mods: [{ s: 'add_fire', min: 2, max: 3 }, { s: 'ignite_chance', min: 10, max: 15 }, { s: 'res_fire', min: 15, max: 25 }], power: 'u_ringofsun' },
  { id: 'u_ringofmoon', name: '月輪', base: 'ring', slot: 'ring', req: 25, flavor: '満ちては欠ける。持ち主の気分もまた。', mods: [{ s: 'add_cold', min: 2, max: 3 }, { s: 'freeze_chance', min: 5, max: 8 }, { s: 'res_cold', min: 15, max: 25 }], power: 'u_ringofmoon' },
  { id: 'u_serpentring', name: '蛇輪', base: 'ring', slot: 'ring', req: 32, flavor: '自分の尾を噛む蛇。噛む力は日ごとに強くなる。', mods: [{ s: 'poison_chance', min: 12, max: 20 }, { s: 'res_poison', min: 15, max: 25 }, { s: 'dex', min: 15, max: 25 }], power: 'u_serpentring' },
  { id: 'u_greed', name: '強欲の指輪', base: 'ring', slot: 'ring', req: 14, flavor: 'はめた指が少しずつ金色に変わっていく。', mods: [{ s: 'gold_find', min: 25, max: 40 }, { s: 'magic_find', min: 12, max: 20 }, { s: 'life', min: 4, max: 6 }], power: 'u_greed' },
  { id: 'u_ouroboros', name: '循環の指輪', base: 'ring', slot: 'ring', req: 50, flavor: '始まりと終わりがつながった環。時間もまた、ここで少し丸まる。', mods: [{ s: 'cost_red', min: 6, max: 10 }, { s: 'crit_chance', min: 3, max: 5 }, { s: 'res_all', min: 8, max: 12 }], power: 'u_ouroboros' },
];

// ================= セット（各クラス 2 + 共通 2）
const piece = (setId, key, name, base, slot, mods) => ({ id: `${setId}_${key}`, name, base, slot, mods });
export const SETS = [
  {
    id: 'set_ironblood', name: '鉄血の誓約', cls: 'warrior', desc: '血で誓い、鉄で果たす。退かぬ者たちの重装。',
    pieces: [
      piece('set_ironblood', 'helm', '鉄血の面頬', 'helm.plate', 'helm', [{ s: 'str', min: 25, max: 40 }]),
      piece('set_ironblood', 'chest', '鉄血の胸甲', 'chest.plate', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_ironblood', 'gloves', '鉄血の籠手', 'gloves.plate', 'gloves', [{ s: 'attack_speed', min: 5, max: 8 }]),
      piece('set_ironblood', 'belt', '鉄血の鉄帯', 'belt.plate', 'belt', [{ s: 'inc_life', min: 6, max: 10 }]),
      piece('set_ironblood', 'legs', '鉄血の脚甲', 'legs.plate', 'legs', [{ s: 'armor', min: 6, max: 9 }]),
      piece('set_ironblood', 'boots', '鉄血の鉄靴', 'boots.plate', 'boots', [{ s: 'move_speed', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'inc_life', v: 15 }, { s: 'inc_melee', v: 25 }] },
      4: { mods: [{ s: 'inc_area', v: 50 }, { s: 'dr', v: 10 }] },
      6: { power: { id: 'set_ironblood_6', v: 150 } },
    },
  },
  {
    id: 'set_beastfang', name: '闘獣の牙', cls: 'warrior', desc: '闘技場で百の獣を屠った剣闘士の遺品。',
    pieces: [
      piece('set_beastfang', 'weapon', '闘獣の大斧', 'axe', 'weapon', [{ s: 'weapon_dmg', min: 60, max: 90 }]),
      piece('set_beastfang', 'offhand', '闘獣の革盾', 'shield', 'offhand', [{ s: 'block', min: 5, max: 8 }]),
      piece('set_beastfang', 'amulet', '闘獣の牙飾り', 'amulet', 'amulet', [{ s: 'crit_damage', min: 30, max: 45 }]),
      piece('set_beastfang', 'ring', '闘獣の爪輪', 'ring', 'ring', [{ s: 'str', min: 20, max: 30 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'attack_speed', v: 10 }, { s: 'crit_chance', v: 5 }] },
      4: { power: { id: 'set_beastfang_4', v: 80 } },
    },
  },
  {
    id: 'set_windcutter', name: '風切りの装束', cls: 'ranger', desc: '風より先に矢が届く。草原の狩人の装い。',
    pieces: [
      piece('set_windcutter', 'helm', '風切りの帽子', 'helm.leather', 'helm', [{ s: 'dex', min: 25, max: 40 }]),
      piece('set_windcutter', 'chest', '風切りの革鎧', 'chest.leather', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_windcutter', 'gloves', '風切りの革手袋', 'gloves.leather', 'gloves', [{ s: 'attack_speed', min: 5, max: 8 }]),
      piece('set_windcutter', 'belt', '風切りの革帯', 'belt.leather', 'belt', [{ s: 'dex', min: 20, max: 30 }]),
      piece('set_windcutter', 'legs', '風切りの革脚絆', 'legs.leather', 'legs', [{ s: 'dodge', min: 3, max: 5 }]),
      piece('set_windcutter', 'boots', '風切りの革靴', 'boots.leather', 'boots', [{ s: 'move_speed', min: 12, max: 18 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'move_speed', v: 15 }, { s: 'inc_projectile', v: 25 }] },
      4: { mods: [{ s: 'proj_count', v: 1 }, { s: 'inc_projectile', v: 40 }] },
      6: { power: { id: 'set_windcutter_6', v: 150 } },
    },
  },
  {
    id: 'set_moonshadow', name: '月影の狩装', cls: 'ranger', desc: '夜の森でしか狩りをしない、名を持たぬ狩人のもの。',
    pieces: [
      piece('set_moonshadow', 'weapon', '月影の長弓', 'bow', 'weapon', [{ s: 'weapon_dmg', min: 60, max: 90 }]),
      piece('set_moonshadow', 'offhand', '月影の矢筒', 'quiver', 'offhand', [{ s: 'pierce', min: 1, max: 1 }]),
      piece('set_moonshadow', 'amulet', '月影の首飾り', 'amulet', 'amulet', [{ s: 'crit_chance', min: 3, max: 5 }]),
      piece('set_moonshadow', 'ring', '月影の指輪', 'ring', 'ring', [{ s: 'dex', min: 20, max: 30 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'crit_damage', v: 40 }, { s: 'inc_cold', v: 20 }] },
      4: { power: { id: 'set_moonshadow_4', v: 80 } },
    },
  },
  {
    id: 'set_sevenstar', name: '七曜の法衣', cls: 'sorcerer', desc: '七つの星の巡りを縫い込んだ、星読みの魔導士の衣。',
    pieces: [
      piece('set_sevenstar', 'helm', '七曜の頭巾', 'helm.cloth', 'helm', [{ s: 'int', min: 25, max: 40 }]),
      piece('set_sevenstar', 'chest', '七曜の法衣', 'chest.cloth', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_sevenstar', 'gloves', '七曜の手袋', 'gloves.cloth', 'gloves', [{ s: 'crit_chance', min: 3, max: 5 }]),
      piece('set_sevenstar', 'belt', '七曜の腰帯', 'belt.cloth', 'belt', [{ s: 'max_resource', min: 15, max: 25 }]),
      piece('set_sevenstar', 'legs', '七曜の袴', 'legs.cloth', 'legs', [{ s: 'res_all', min: 8, max: 12 }]),
      piece('set_sevenstar', 'boots', '七曜の布靴', 'boots.cloth', 'boots', [{ s: 'move_speed', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'inc_elemental', v: 25 }, { s: 'resource_regen', v: 20 }] },
      4: { mods: [{ s: 'inc_spell', v: 50 }, { s: 'cdr', v: 10 }] },
      6: { power: { id: 'set_sevenstar_6', v: 100 } },
    },
  },
  {
    id: 'set_icebloom', name: '氷華の宝冠', cls: 'sorcerer', desc: '凍てつく峰に咲く氷の花。触れた者は二度と寒さを感じない。',
    pieces: [
      piece('set_icebloom', 'weapon', '氷華の杖', 'staff', 'weapon', [{ s: 'weapon_dmg', min: 60, max: 90 }]),
      piece('set_icebloom', 'offhand', '氷華の宝珠', 'orb', 'offhand', [{ s: 'inc_cold', min: 25, max: 40 }]),
      piece('set_icebloom', 'amulet', '氷華の首飾り', 'amulet', 'amulet', [{ s: 'int', min: 25, max: 40 }]),
      piece('set_icebloom', 'ring', '氷華の指輪', 'ring', 'ring', [{ s: 'freeze_chance', min: 5, max: 8 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'inc_cold', v: 30 }, { s: 'freeze_chance', v: 8 }] },
      4: { power: { id: 'set_icebloom_4', v: 100 } },
    },
  },
  {
    id: 'set_bonebanner', name: '骸の軍旗', cls: 'necromancer', desc: '死者の軍勢を率いた将の装い。旗はいまも風なしにはためく。',
    pieces: [
      piece('set_bonebanner', 'helm', '骸の兜', 'helm.cloth', 'helm', [{ s: 'int', min: 25, max: 40 }]),
      piece('set_bonebanner', 'chest', '骸の法衣', 'chest.cloth', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_bonebanner', 'gloves', '骸の手袋', 'gloves.cloth', 'gloves', [{ s: 'int', min: 20, max: 30 }]),
      piece('set_bonebanner', 'belt', '骸の腰帯', 'belt.leather', 'belt', [{ s: 'inc_life', min: 6, max: 10 }]),
      piece('set_bonebanner', 'legs', '骸の脚絆', 'legs.leather', 'legs', [{ s: 'res_all', min: 8, max: 12 }]),
      piece('set_bonebanner', 'boots', '骸の靴', 'boots.leather', 'boots', [{ s: 'move_speed', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'minion_life', v: 30 }, { s: 'inc_minion', v: 30 }] },
      4: { mods: [{ s: 'minion_count', v: 1 }, { s: 'minion_as', v: 20 }] },
      6: { power: { id: 'set_bonebanner_6', v: 200 } },
    },
  },
  {
    id: 'set_rotrite', name: '腐蝕の祭具', cls: 'necromancer', desc: '疫病の神を祀る、禁じられた祭りの道具。',
    pieces: [
      piece('set_rotrite', 'weapon', '腐蝕の大鎌', 'scythe', 'weapon', [{ s: 'weapon_dmg', min: 60, max: 90 }]),
      piece('set_rotrite', 'offhand', '腐蝕の祈祷書', 'grimoire', 'offhand', [{ s: 'inc_dot', min: 25, max: 40 }]),
      piece('set_rotrite', 'amulet', '腐蝕の首飾り', 'amulet', 'amulet', [{ s: 'inc_poison', min: 25, max: 40 }]),
      piece('set_rotrite', 'ring', '腐蝕の指輪', 'ring', 'ring', [{ s: 'poison_chance', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'inc_poison', v: 30 }, { s: 'poison_chance', v: 15 }] },
      4: { power: { id: 'set_rotrite_4', v: 100 } },
    },
  },
  {
    id: 'set_duskveil', name: '宵闇の装束', cls: 'assassin', desc: '宵と闇の境目にだけ姿を現す、影の一族の衣。',
    pieces: [
      piece('set_duskveil', 'helm', '宵闇の頭巾', 'helm.leather', 'helm', [{ s: 'dex', min: 25, max: 40 }]),
      piece('set_duskveil', 'chest', '宵闇の革鎧', 'chest.leather', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_duskveil', 'gloves', '宵闇の革手袋', 'gloves.leather', 'gloves', [{ s: 'crit_chance', min: 3, max: 5 }]),
      piece('set_duskveil', 'belt', '宵闇の革帯', 'belt.leather', 'belt', [{ s: 'dex', min: 20, max: 30 }]),
      piece('set_duskveil', 'legs', '宵闇の脚絆', 'legs.leather', 'legs', [{ s: 'dodge', min: 3, max: 5 }]),
      piece('set_duskveil', 'boots', '宵闇の足袋', 'boots.leather', 'boots', [{ s: 'move_speed', min: 12, max: 18 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'crit_chance', v: 6 }, { s: 'attack_speed', v: 8 }] },
      4: { mods: [{ s: 'crit_damage', v: 80 }, { s: 'dodge', v: 8 }] },
      6: { power: { id: 'set_duskveil_6', v: 150 } },
    },
  },
  {
    id: 'set_poisonbloom', name: '毒華の刺客', cls: 'assassin', desc: '花の名で呼ばれた暗殺者たち。最後に嗅ぐのは甘い香り。',
    pieces: [
      piece('set_poisonbloom', 'weapon', '毒華の短剣', 'dagger', 'weapon', [{ s: 'weapon_dmg', min: 60, max: 90 }]),
      piece('set_poisonbloom', 'offhand', '毒華の副刀', 'offblade', 'offhand', [{ s: 'poison_chance', min: 10, max: 15 }]),
      piece('set_poisonbloom', 'amulet', '毒華の首飾り', 'amulet', 'amulet', [{ s: 'inc_poison', min: 25, max: 40 }]),
      piece('set_poisonbloom', 'ring', '毒華の指輪', 'ring', 'ring', [{ s: 'dex', min: 20, max: 30 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'poison_chance', v: 15 }, { s: 'inc_poison', v: 30 }] },
      4: { power: { id: 'set_poisonbloom_4', v: 100 } },
    },
  },
  {
    id: 'set_eldorado', name: '黄金郷の遺品', desc: '誰も辿り着けなかった黄金の都。持ち帰られたのはこれだけ。',
    pieces: [
      piece('set_eldorado', 'helm', '黄金郷の冠', 'helm.mail', 'helm', [{ s: 'magic_find', min: 10, max: 15 }]),
      piece('set_eldorado', 'chest', '黄金郷の鎖帷子', 'chest.mail', 'chest', [{ s: 'life', min: 8, max: 12 }]),
      piece('set_eldorado', 'gloves', '黄金郷の手袋', 'gloves.mail', 'gloves', [{ s: 'crit_chance', min: 2, max: 4 }]),
      piece('set_eldorado', 'belt', '黄金郷の鎖帯', 'belt.mail', 'belt', [{ s: 'gold_find', min: 20, max: 30 }]),
      piece('set_eldorado', 'legs', '黄金郷の脚絆', 'legs.mail', 'legs', [{ s: 'res_all', min: 8, max: 12 }]),
      piece('set_eldorado', 'boots', '黄金郷の靴', 'boots.mail', 'boots', [{ s: 'move_speed', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'gold_find', v: 50 }, { s: 'xp_bonus', v: 10 }] },
      4: { mods: [{ s: 'magic_find', v: 50 }, { s: 'luck_gain', v: 15 }] },
      6: { power: { id: 'set_eldorado_6', v: 50 } },
    },
  },
  {
    id: 'set_pilgrim', name: '巡礼者の守り', desc: '世界の果ての聖地を目指した巡礼者たちが、代々受け継いだお守り。',
    pieces: [
      piece('set_pilgrim', 'amulet', '巡礼者の数珠', 'amulet', 'amulet', [{ s: 'res_all', min: 8, max: 12 }]),
      piece('set_pilgrim', 'ring', '巡礼者の指輪', 'ring', 'ring', [{ s: 'life', min: 4, max: 6 }]),
      piece('set_pilgrim', 'belt', '巡礼者の帯', 'belt.cloth', 'belt', [{ s: 'inc_life', min: 6, max: 10 }]),
      piece('set_pilgrim', 'boots', '巡礼者の草鞋', 'boots.cloth', 'boots', [{ s: 'move_speed', min: 10, max: 15 }]),
    ],
    bonus: {
      2: { mods: [{ s: 'res_all', v: 15 }, { s: 'life_regen_pct', v: 0.5 }] },
      4: { mods: [{ s: 'dr', v: 15 }, { s: 'inc_life', v: 15 }], power: { id: 'set_pilgrim_4', v: 20 } },
    },
  },
];

// ================= ミシック（とても珍しい。固定のオプションはすべて大いなる）
export const MYTHICS = [
  { id: 'm_worldend', name: '終焉の鍵', base: 'any', slot: 'weapon', req: 60, flavor: '世界のどこにも合う鍵穴はない。世界そのものが鍵穴なのだ。', mods: [{ s: 'weapon_dmg', min: 100, max: 140 }, { s: 'inc_dmg', min: 30, max: 40 }, { s: 'crit_chance', min: 5, max: 7 }], power: 'm_worldend' },
  { id: 'm_godslayer', name: '神殺しの楔', base: 'any', slot: 'weapon', req: 70, flavor: '天から落ちた神の心臓に、最初に打ち込まれた楔。', mods: [{ s: 'weapon_dmg', min: 100, max: 140 }, { s: 'dmg_boss', min: 30, max: 40 }, { s: 'dmg_elite', min: 30, max: 40 }], power: 'm_godslayer' },
  { id: 'm_starmaw', name: '星喰らいの顎', base: 'any', slot: 'weapon', req: 80, flavor: '空の星を一つ食べるたびに、少しだけ強くなる。もう残りは少ない。', mods: [{ s: 'weapon_dmg', min: 100, max: 140 }, { s: 'attack_speed', min: 10, max: 14 }, { s: 'crit_damage', min: 50, max: 70 }], power: 'm_starmaw' },
  { id: 'm_grail', name: '深淵の聖杯', base: 'any', slot: 'offhand', req: 60, flavor: '満たしても満たしても、底の方で何かが飲み干していく。', mods: [{ s: 'max_resource', min: 30, max: 40 }, { s: 'res_all', min: 15, max: 20 }, { s: 'life', min: 10, max: 14 }], power: 'm_grail' },
  { id: 'm_thousandeyes', name: '千の眼の冠', base: 'helm.plate', slot: 'helm', req: 65, flavor: '眼を閉じても、千の眼のどれかが開いている。', mods: [{ s: 'life', min: 10, max: 14 }, { s: 'crit_chance', min: 4, max: 6 }, { s: 'res_all', min: 15, max: 20 }], power: 'm_thousandeyes' },
  { id: 'm_undying', name: '不滅の心臓', base: 'chest.plate', slot: 'chest', req: 60, flavor: '鎧の内側で、持ち主のものではない心臓が脈を打つ。', mods: [{ s: 'life', min: 12, max: 16 }, { s: 'inc_life', min: 12, max: 16 }, { s: 'armor', min: 9, max: 12 }], power: 'm_undying' },
  { id: 'm_timegrasp', name: '時を掴む手', base: 'gloves.mail', slot: 'gloves', req: 70, flavor: '指の隙間から、ほんの一瞬だけ時がこぼれる。', mods: [{ s: 'attack_speed', min: 10, max: 14 }, { s: 'crit_damage', min: 40, max: 55 }, { s: 'add_phys', min: 3, max: 4.5 }], power: 'm_timegrasp' },
  { id: 'm_infinity', name: '無限の帯', base: 'belt.plate', slot: 'belt', req: 65, flavor: '結び目がない。始まりも終わりも、どこにも。', mods: [{ s: 'life', min: 10, max: 14 }, { s: 'res_all', min: 15, max: 20 }, { s: 'inc_life', min: 10, max: 14 }], power: 'm_infinity' },
  { id: 'm_roots', name: '大地の根', base: 'legs.plate', slot: 'legs', req: 70, flavor: '大地に根を張った古木の皮。立つ者を決して倒さない。', mods: [{ s: 'armor', min: 9, max: 12 }, { s: 'life', min: 10, max: 14 }, { s: 'thorns', min: 8, max: 12 }], power: 'm_roots' },
  { id: 'm_voidwalk', name: '虚空を歩む靴', base: 'boots.leather', slot: 'boots', req: 75, flavor: '一歩ごとに、足元の世界が少しだけ消える。', mods: [{ s: 'move_speed', min: 20, max: 26 }, { s: 'dodge', min: 5, max: 7 }, { s: 'res_void', min: 15, max: 20 }], power: 'm_voidwalk' },
  { id: 'm_genesis', name: '創世の雫', base: 'amulet', slot: 'amulet', req: 80, flavor: '世界が生まれる前に落ちた、最初の一滴。', mods: [{ s: 'inc_dmg', min: 30, max: 40 }, { s: 'all_attr', min: 20, max: 28 }, { s: 'res_all', min: 12, max: 16 }], power: 'm_genesis' },
  { id: 'm_fate', name: '運命の環', base: 'ring', slot: 'ring', req: 60, flavor: 'はめた者の運命を一つだけ書き換える。何を書き換えたかは教えてくれない。', mods: [{ s: 'magic_find', min: 25, max: 35 }, { s: 'crit_chance', min: 4, max: 6 }, { s: 'gold_find', min: 25, max: 35 }], power: 'm_fate' },
];

export const UNIQUE = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
export const MYTHIC = Object.fromEntries(MYTHICS.map((u) => [u.id, u]));
export const SET = Object.fromEntries(SETS.map((s) => [s.id, s]));
/** セットの部品 id → { set, piece } */
export const SET_PIECE = {};
for (const s of SETS) for (const p of s.pieces) SET_PIECE[p.id] = { set: s, piece: p };
