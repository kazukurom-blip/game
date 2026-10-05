// クラス（v3）: heroId は「性別つきのキャラ」ではなく「クラス（系統の親）」。性別・名前・見た目は state.gender/name/look で別に持つ。
// ID は互換のため 'luna' / 'jin' を維持し、第3のクラス 'hacker' を追加。
// CLASSES = {id: {id, name, desc, role, weaponType, baseStats, base, branches:[branchId], jobs1:[1次jobId], defaultNames:{f,m}}}
//  - baseStats: 初期ステータス（str/dex/int/luk）, base: HP/MP/速度等（systems/progression.js HERO_BASE の元データ）
// DEFAULT_LOOKS = {classId: {f: look, m: look}}（look は render/character.js drawCharacter 用 {body, face, skin, hair, hairColor, eyeColor, ...}）
//  - face: 顔・髪の分割方式の顔の番号（manifest faces。絵が無ければ使われず今まで通り）。旧セーブは state の移行で初期の顔が入る
import { JOB_BRANCHES, jobsFor } from './jobs.js';

export const CLASSES = {
  luna: {
    id: 'luna', name: 'ストリートスター', role: 'スピード／銃',
    desc: '軽やかなステップと銃さばきで魅せるスピード型。クリティカルと連撃が得意。',
    weaponType: 'melee', // 初期武器はナイフ。銃（gun）も得意
    baseStats: { str: 4, dex: 7, int: 4, luk: 6 },
    base: { hp: 55, hpPerLv: 18, mp: 30, mpPerLv: 10, speed: 250, jump: 820, crit: 0.08, critDmg: 1.5, def: 0 },
    defaultNames: { f: 'ルナ', m: 'ルカ' },
  },
  jin: {
    id: 'jin', name: 'ストリートブロウラー', role: 'パワー／格闘',
    desc: '拳とバット、そして愛車でぶつかるパワー型。HPと防御が高く、高火力。',
    weaponType: 'melee',
    baseStats: { str: 8, dex: 4, int: 4, luk: 4 },
    base: { hp: 75, hpPerLv: 26, mp: 20, mpPerLv: 7, speed: 225, jump: 790, crit: 0.05, critDmg: 1.6, def: 4 },
    defaultNames: { f: 'ジーナ', m: 'ジン' },
  },
  hacker: {
    id: 'hacker', name: 'ストリートハッカー', role: '魔法／電脳',
    desc: '杖型デバイスでコードを撃ち出す魔法型。範囲攻撃とドローン召喚で戦う。MPが多くINTで火力が伸びる。',
    weaponType: 'magic', // 初期武器は杖（staff_glitch）
    baseStats: { str: 4, dex: 4, int: 9, luk: 5 },
    base: { hp: 50, hpPerLv: 15, mp: 45, mpPerLv: 14, speed: 235, jump: 810, crit: 0.06, critDmg: 1.5, def: 0 },
    defaultNames: { f: 'ノア', m: 'ネオ' },
  },
};
for (const c of Object.values(CLASSES)) {
  c.branches = Object.values(JOB_BRANCHES).filter((b) => b.hero === c.id).map((b) => b.id);
  c.jobs1 = jobsFor(c.id, 1).map((j) => j.id);
}

export const CLASS_IDS = Object.keys(CLASSES);
export const GENDERS = ['f', 'm'];

export const DEFAULT_LOOKS = {
  luna: {
    f: { body: 'f', face: 'f_01', skin: '#ffe3d3', hair: 'twin', hairColor: '#ff6fb5', eyeColor: '#ff3d8b', expr: 'cute', hairShadow: '#c8458f', hairHi: '#ffd0ea', hairTip: '#b47cff', tie: '#ffd23f', rim: '#8ff4ff' },
    m: { body: 'm', face: 'm_01', skin: '#fbdcc6', hair: 'short', hairColor: '#ff5fa8', eyeColor: '#ff3d8b', expr: 'cute', hairShadow: '#b8337e', hairHi: '#ffc6e4', rim: '#8ff4ff' },
  },
  jin: {
    f: { body: 'f', face: 'f_02', skin: '#f8dac6', hair: 'ponytail', hairColor: '#e2e7f2', eyeColor: '#33c7e6', expr: 'cool', hairShadow: '#8790ab', hairHi: '#ffffff', mesh: '#3ee6d2', tie: '#ff4f8b', rim: '#d0a8ff' },
    m: { body: 'm', face: 'm_02', skin: '#f2cfb6', hair: 'wolf', hairColor: '#dde3ee', eyeColor: '#2fb8e8', expr: 'cool', hairShadow: '#7d86a3', hairHi: '#ffffff', mesh: '#3ee6d2', rim: '#d0a8ff' },
  },
  hacker: {
    f: { body: 'f', face: 'f_03', skin: '#f0d2bc', hair: 'bob', hairColor: '#3dff8a', eyeColor: '#19f0ff', expr: 'cool', hairShadow: '#14a06a', hairHi: '#d4ffe6', rim: '#ff8ae0' },
    m: { body: 'm', face: 'm_03', skin: '#e8c6aa', hair: 'spiky', hairColor: '#36f08a', eyeColor: '#19f0ff', expr: 'cool', hairShadow: '#12925e', hairHi: '#c8ffdf', rim: '#ff8ae0' },
  },
};

/** 旧セーブ（v2 以前）の性別: luna=f, jin=m */
export const LEGACY_GENDER = { luna: 'f', jin: 'm', hacker: 'f' };

export function classOf(id) { return CLASSES[id] || CLASSES.luna; }
export function defaultLook(classId, gender) {
  const c = DEFAULT_LOOKS[classId] || DEFAULT_LOOKS.luna;
  return { ...(c[gender] || c[LEGACY_GENDER[classId] || 'f']) };
}
export function defaultName(classId, gender) {
  const c = classOf(classId);
  return c.defaultNames[gender] || c.defaultNames.f;
}
