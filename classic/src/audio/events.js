// Core のお知らせ（classic-unity/Core/Game/GameEvents.cs の GameEventType）→ 鳴らす効果音・ジングルの対応表。
// render_bgm.mjs / render_sfx.mjs が audio_manifest.json の events の欄へそのまま書き出す（Unity 側はこれを読んで鳴らす）。
// 検査: tests/audio_unit.mjs が「GameEventType を全部書いてあるか」「書いた ID が効果音・ジングルにあるか」を確かめる。
//
// 値の書き方（sfx / jingle の欄）
//   "id"                         いつもこの音
//   null                         鳴らさない（画面の表示だけ・他の音と重なる）
//   { byId: {...}, default }     GameEvent.Id で選ぶ（前方一致。無ければ default）。値はさらに入れ子の決め方でもよい
//   { byValue: {...}, default }  GameEvent.Value で選ぶ
//   { byText: {...}, default }   GameEvent.Text で選ぶ（前方一致）
//   { rule: "weapon" }           今の武器の種類で weaponSfx から選ぶ
//   { rule: "skill" }            スキルのデータ（skills.json）で skillSfx から選ぶ
//   { rule: "mobSize" }          敵のデータ（monsters.json）で mobSize から選ぶ
//   { rule: "status", ... }      状態異常の種類（Id）で statusSfx から選ぶ。主人公（Value=0）だけ鳴らすなら onlyPlayer: true

export const WEAPON_SFX = {
  片手剣: 'atk_sword1', 両手剣: 'atk_sword2', 片手斧: 'atk_axe', 両手斧: 'atk_axe', 片手鈍器: 'atk_blunt', 両手鈍器: 'atk_blunt',
  槍: 'atk_spear', 矛: 'atk_spear', 短剣: 'atk_dagger', クロー: 'atk_claw', 弓: 'atk_bow', クロスボウ: 'atk_xbow',
  ナックル: 'atk_knuckle', 銃: 'atk_gun', ワンド: 'atk_wand', スタッフ: 'atk_wand', 素手: 'atk_knuckle',
};

// スキル: 上から順に見て、最初に当てはまった物を鳴らす
export const SKILL_SFX = {
  order: ['element', 'kind', 'motion', 'projectile', 'weapon'],
  // skills.json の element（魔法の属性）
  element: { fire: 'mag_fire', ice: 'mag_ice', lightning: 'mag_thunder', poison: 'mag_poison', holy: 'mag_holy', dark: 'mag_dark' },
  // skills.json の kind（攻撃でない物）
  kind: { buff: 'buff', heal: 'heal', summon: 'summon', movement: 'dash' },
  // skills.json の motion（技の動き）
  motion: { swing: 'skill_swing', stab: 'skill_stab', shoot: 'skill_shoot', throw: 'skill_throw', punch: 'skill_punch', cast: 'mag_cast' },
  // SkillUsed の Text（弾の種類。GameSession.ProjectileKind）
  projectile: { arrow: 'skill_shoot', bullet: 'skill_shoot', star: 'skill_throw', magic: 'mag_cast', pebble: 'atk_claw' },
  // それでも決まらなければ武器の種類で（槍・矛は突き、弓・銃は撃つ…）
  weapon: {
    片手剣: 'skill_swing', 両手剣: 'skill_swing', 片手斧: 'skill_swing', 両手斧: 'skill_swing', 片手鈍器: 'skill_swing', 両手鈍器: 'skill_swing',
    槍: 'skill_stab', 矛: 'skill_stab', 短剣: 'skill_stab', クロー: 'skill_throw', 弓: 'skill_shoot', クロスボウ: 'skill_shoot',
    ナックル: 'skill_punch', 銃: 'skill_shoot', ワンド: 'mag_cast', スタッフ: 'mag_cast', 素手: 'skill_punch',
  },
  default: 'skill_swing',
};

// 状態異常（StatusApplied の Id）
export const STATUS_SFX = {
  poison: 'st_poison', stun: 'st_stun', freeze: 'st_freeze', sleep: 'st_sleep',
  darkness: 'st_curse', seal: 'st_curse', curse: 'st_curse', weak: 'st_curse', slow: 'st_curse', polymorph: 'st_curse', confuse: 'st_curse',
};

// 敵が倒れる音の大きさ（monsters.json）: boss がある・kind が boss / raid → large、kind が tough / elite か高さ 70 以上 → medium、ほかは small
export const MOB_SIZE = { large: 'mob_die_l', medium: 'mob_die_m', small: 'mob_die_s', mediumHeight: 70 };

// はしご・縄を上り下りしている間、一定間隔で鳴らす（Core にお知らせは無い。Unity 側が体の状態を見て鳴らす）
export const CLIMB = { ladder: 'ladder', rope: 'rope', intervalSec: 0.3 };

// 敵の動き（Core の Mob.Motion。お知らせは無いので Unity 側が動きの始まりで鳴らす）
export const MOB_MOTION = { attack1: 'mob_attack', skill1: 'mob_attack' };

export const EVENT_SFX = {
  // 物理
  Jump: 'jump', Land: 'land', Grab: 'grab', DownJump: 'jump_down', RopeJump: 'jump', Hurt: 'hurt',
  // 攻撃・スキル
  AttackStart: { rule: 'weapon', default: 'atk_sword1' },
  AttackHit: null, // 当たった音は MobHit で鳴らす（重ならないように）
  SkillUsed: { rule: 'skill' },
  SkillFailed: 'ui_error',
  MobHit: { byText: { 'status:': null, pull: 'grab', steal: 'coin', dispel: 'dispel', debuff: 'st_curse' }, default: 'hit', note: 'Text が status:〜 のときは状態異常の音に任せる。同じフレームのダメージの数字が会心なら hit の代わりに crit' },
  MobDied: { rule: 'mobSize' },
  MobSpawned: 'mob_spawn',
  // 拾う・持ち物
  DropSpawned: 'drop', // 落ちた物の中にお金があれば drop_meso を重ねてもよい
  ItemPicked: 'pickup', MesoPicked: 'coin', InventoryFull: 'ui_error',
  // 成長
  ExpGained: null, LevelUp: 'levelup', ApChanged: 'ui_click', SpChanged: 'ui_click', JobAdvanced: 'jobup',
  BuffStarted: 'buff', BuffEnded: 'buff_end', Healed: 'heal',
  // クエスト
  QuestStarted: 'quest_accept', QuestProgress: null, QuestCompleted: 'quest_done', QuestFailed: 'quest_fail',
  // 移動
  MapChanged: null, PortalUsed: 'portal', Travel: { byValue: { 0: 'ship_horn' }, default: 'portal', note: '船（Value なし）は汽笛、タクシー（Value = 料金）はポータルの音' },
  // 持ち物の操作
  ItemUsed: { byId: { 'use.return.': 'portal', 'use.master_book.': { byValue: { 1: 'scroll_ok', 0: 'scroll_fail' }, default: 'scroll_fail' } }, default: 'potion' },
  ItemBought: 'shop_buy', ItemSold: 'shop_sell', EquipChanged: 'ui_equip',
  ScrollResult: { byValue: { 0: 'scroll_ok', 1: 'scroll_fail', 2: 'scroll_break' }, default: 'ui_error' },
  Died: 'death', Revived: 'revive',
  Saved: null, SaveFailed: 'ui_error', Message: null,
  // 状態異常
  StatusApplied: { rule: 'status', default: 'st_curse' },
  StatusEnded: { rule: 'status', fixed: 'status_end', onlyPlayer: true },
  StatusCured: 'status_cure',
  StatusResisted: 'status_resist',
  // 敵の技
  MobCast: 'mob_cast', MobSkillHit: 'mob_skill_hit', MobSummoned: 'mob_summon', BossPhase: 'boss_phase',
  // 町と成長の仕組み
  StorageChanged: 'storage', Crafted: 'craft', ChestOpened: 'chest_open', SatDown: 'sit', StoodUp: null,
  PetAdopted: 'pet_adopt', PetFed: 'pet_feed', PetCloseness: 'pet_happy',
  PetTrick: { byValue: { 1: 'pet_happy', 0: 'pet_sulk' }, default: 'pet_happy' },
  PetHungry: 'pet_sulk', PetUsedPotion: 'potion',
  RoomEntered: 'room_enter', RoomTimeUp: 'room_timeup', RoomFailed: 'quest_fail', DungeonCleared: null, BossKilled: null,
  QuizQuestion: 'ui_open', QuizAnswered: { byValue: { 1: 'quiz_ok', 0: 'quiz_ng' }, default: 'quiz_ng' }, QuizCleared: 'quest_done',
  // 敵の強化
  MobBuffed: 'mob_buff', MobBuffEnded: 'buff_end', MobDispelled: 'dispel',
  // ボスの仕掛け・スキルの仕掛け（Id）
  Mechanic: {
    byId: {
      rift_open: 'mech_glass', rift_filled: 'mech_glass', rift_reset: 'mob_cast', rift_exposed: 'mech_glass', rift_guarded: 'status_resist', shard_got: 'pickup',
      submerge: 'mech_splash', surface: 'mech_splash', rock_broken: 'mech_rock',
      clones: 'summon', shuffle: 'dash', pulled: 'grab',
      decoy_hit: 'hit', decoy_broken: 'mech_rock', ship_broken: 'mech_rock',
      door_open: 'mech_door', door_used: 'portal', zone_start: 'mag_poison',
    },
    default: 'mob_cast',
  },
};

// ジングル（BGM の上に短く鳴らす。鳴っている間 BGM の音量を下げる）
export const EVENT_JINGLE = {
  LevelUp: 'jingle_levelup',
  JobAdvanced: 'jingle_jobup',
  QuestCompleted: 'jingle_quest',
  BossKilled: 'jingle_boss_clear',
  DungeonCleared: 'jingle_boss_clear',
  Died: 'jingle_death',
  Travel: { byValue: { 0: 'jingle_ship' }, default: null },
};

export const EVENTS_ABOUT = 'Core の GameEventType → 鳴らす音。sfx の値は SFX の ID（null は鳴らさない）。{byId|byValue|byText: {...}, default} は GameEvent の Id/Value/Text で選ぶ（byId・byText は前方一致。値はさらに入れ子の決め方でもよい）。{rule: "weapon"} は weaponSfx、{rule: "skill"} は skillSfx（order の順に element → kind → motion → projectile → weapon）、{rule: "mobSize"} は mobSize、{rule: "status"} は statusSfx（fixed があればその音、onlyPlayer なら主人公 = Value 0 のときだけ）。jingle はジングル（BGM の ID。jingle の欄）を BGM の上に鳴らす。はしご・縄の上り下りは climb の音を intervalSec ごとに。敵の動き（Motion）が attack1 / skill1 になったら mobMotion の音。同じ音が同じフレームに何度も来たら 1 回にまとめる（MobSpawned・MobHit・DropSpawned は特に）。';

export function eventsManifest() {
  return { about: EVENTS_ABOUT, sfx: EVENT_SFX, jingle: EVENT_JINGLE, weaponSfx: WEAPON_SFX, skillSfx: SKILL_SFX, statusSfx: STATUS_SFX, mobSize: MOB_SIZE, climb: CLIMB, mobMotion: MOB_MOTION };
}
