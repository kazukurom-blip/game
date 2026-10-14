// セーブされる状態（state）の形。担当ごとに名前空間を分けている:
//   hero  … 主人公（クラス・レベル・スキル・パッシブ・装備）           … 戦闘/スキル担当
//   inv   … 持ち物・倉庫・素材・宝石・ルーン                             … アイテム担当
//   world … いまいる場所・最高到達・難易度・裂け目                       … ワールド担当
//   meta  … お金・転生・実績・図鑑・日課・ペット・統計                   … メタ担当
//   settings … 設定（UI 担当）
// 新しい項目を足すときは defaults を増やすだけで、古いセーブは migrate() で自動的に埋まる。

import { statDef } from '../data/stats.js';
import { NUM } from '../data/balance.js';

// 版 2: 数字の大きさを 10 倍にした（balance.js の NUM）。古い装備の「大きくなる値」とゴールドを直す。
export const SAVE_VERSION = 2;

export function newState(cls = 'warrior', name = '名もなき者') {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    created: now,
    lastSaved: now,
    lastTick: now,
    playTime: 0,
    hero: {
      cls,
      name,
      level: 1,
      xp: 0,
      paragon: { level: 0, xp: 0, alloc: {} },
      skillPoints: 0,
      skills: {}, // { skillId: { lvl, rune, supports: [] } }
      bar: [], // スキルの並び（先頭が基本攻撃。左から順に優先して使う）
      autocast: {}, // { skillId: { cond: 'always'|'elite'|'pack3'|'lowlife', on: true } }
      tree: { alloc: [], points: 0, respecs: 0 },
      equip: {}, // { slot: item }
      title: null,
      cosmetics: {}, // 見た目の固定（装備を変えても見た目を残す）
    },
    inv: {
      bag: [],
      bagSize: 60,
      stash: [[]],
      stashTabSize: 60,
      mats: {}, // { matId: 個数 }
      gems: {}, // { 'ruby_3': 個数 }
      runes: {},
      nextUid: 1,
      filter: {
        autoSalvage: { common: true, magic: true, rare: false, epic: false, legendary: false, set: false, unique: false, mythic: false },
        keepUpgrades: true, // 今の装備より良さそうな物は残す
        autoEquip: false,
        wantStats: [], // この能力が N 個以上ついていたら残す
        wantMin: 2,
      },
    },
    world: {
      zone: 'a1z1',
      stage: 1,
      maxZone: 0, // 解放済みの一番奥の地域（ZONES の通し番号）
      maxStage: { a1z1: 1 }, // 地域ごとの到達ステージ
      cleared: {}, // { zoneId: true } ボスを倒した地域
      autoAdvance: true,
      torment: 0,
      maxTorment: 0,
      mode: 'campaign', // 'campaign' | 'rift'
      rift: { best: 0, runs: 0, keys: 0, level: 1 },
    },
    meta: {
      gold: 0,
      souls: 0,
      totalSouls: 0,
      rebirths: 0,
      upgrades: {}, // 転生の強化 { id: レベル }
      achievements: {}, // { id: 達成時刻 }
      bestiary: {}, // { monsterId: 倒した数 }
      collection: { uniques: {}, sets: {}, powers: {}, mythics: {} },
      codex: { powers: {}, equipped: [null, null, null] },
      bounties: { day: '', list: [], weekly: null, done: 0 },
      daily: { lastLogin: '', streak: 0, claimed: {} },
      pets: { owned: {}, active: null, eggs: {} },
      stats: { kills: 0, elites: 0, bosses: 0, deaths: 0, goblins: 0, itemsFound: {}, goldEarned: 0, highestHit: 0, salvaged: 0, crafted: 0, offlineSec: 0 },
      tutorial: { step: 0, done: {} },
      unlocks: {}, // 機能の解放（クラフト・裂け目・転生など）
    },
    settings: {
      numberFormat: 'jp',
      dmgNumbers: true,
      fx: 'high', // 'high' | 'mid' | 'low'
      shake: true,
      lootBeams: true,
      sfx: 0.6,
      bgm: 0.35,
      speed: 1,
      autoSaveSec: 30,
      showTips: true,
    },
  };
}

/** 古いセーブに足りない項目を defaults から埋める（配列や中身のあるオブジェクトは上書きしない） */
export function fillDefaults(target, defaults) {
  for (const k of Object.keys(defaults)) {
    const dv = defaults[k];
    if (!(k in target) || target[k] === undefined || target[k] === null && dv !== null) {
      target[k] = structuredCloneSafe(dv);
    } else if (dv && typeof dv === 'object' && !Array.isArray(dv) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      // 中身が自由なマップ（{} の既定値）は再帰しない
      if (Object.keys(dv).length) fillDefaults(target[k], dv);
    }
  }
  return target;
}

/**
 * 古い・壊れたセーブを読める形に直す。
 * ref … 「新しく始めた直後のすべての仕組みの形」（Game.load が作る。無ければ newState だけ）。
 * 1) 名前空間・足りない項目を埋める（fillDefaults） 2) 形の違う値（オブジェクトのはずが文字列など）を ref の値に置きかえる（repairTypes）
 */
export function migrate(state, ref = null) {
  if (!isPlainObject(state)) state = {};
  const v0 = Number(state?.version) || 1;
  for (const ns of NAMESPACES) if (state[ns] !== undefined && !isPlainObject(state[ns])) delete state[ns];
  const cls = typeof state.hero?.cls === 'string' ? state.hero.cls : 'warrior';
  const d = newState(cls, typeof state.hero?.name === 'string' ? state.hero.name : undefined);
  fillDefaults(state, d);
  repairTypes(state, ref || d);
  // 版ごとの変換はここに足す
  if (v0 < 2) rescaleNumbers(state, NUM);
  state.version = SAVE_VERSION;
  return state;
}

const NAMESPACES = ['hero', 'inv', 'world', 'meta', 'settings'];
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const kindOf = (v) => (v === null || v === undefined ? 'none' : Array.isArray(v) ? 'array' : typeof v);
/** 中身を見ない場所（装備はアイテムの検査 sanitizeItem で直す） */
const REPAIR_SKIP = new Set(['hero/equip', 'inv/bag', 'inv/stash']); // 道は / でつなぐ

/**
 * target の値の形を ref に合わせる（ref が null の項目は何でもよい）。
 * 形が違う・数が有限でない → ref の値を入れる。null・無い → ref の値を入れる。オブジェクトどうしは中へ。配列の中身は見ない。
 */
export function repairTypes(target, ref, path = '', depth = 0) {
  if (!isPlainObject(target) || !isPlainObject(ref) || depth > 8) return target;
  for (const k of Object.keys(ref)) {
    const p = path ? `${path}/${k}` : k;
    const rv = ref[k];
    const tv = target[k];
    if (rv === null || rv === undefined) continue;
    const rk = kindOf(rv); const tk = kindOf(tv);
    if (tk === 'none' || rk !== tk || (tk === 'number' && !Number.isFinite(tv))) { target[k] = structuredCloneSafe(rv); continue; }
    if (rk === 'object' && !REPAIR_SKIP.has(p)) repairTypes(tv, rv, p, depth + 1);
  }
  return target;
}

/** 版 1 → 2: 装備に保存された scale の能力（武器ダメージの追加・ライフ・アーマーなど）とゴールドを k 倍にする */
export function rescaleNumbers(state, k) {
  if (!(k > 0) || k === 1) return state;
  const line = (a) => { if (a && typeof a.v === 'number' && statDef(a.s)?.scale) a.v = Math.round(a.v * k * 10) / 10; };
  const item = (it) => {
    if (!it || typeof it !== 'object') return;
    (it.affixes || []).forEach(line);
    (it.fixed || []).forEach(line);
    (it.rrPending?.opts || []).forEach(line);
    if (it.cimp) line(it.cimp);
  };
  const inv = state.inv || {};
  (inv.bag || []).forEach(item);
  for (const tab of inv.stash || []) (Array.isArray(tab) ? tab : []).forEach(item);
  Object.values(state.hero?.equip || {}).forEach(item);
  const m = state.meta || {};
  if (typeof m.gold === 'number') m.gold *= k;
  if (m.stats && typeof m.stats.goldEarned === 'number') m.stats.goldEarned *= k;
  if (m.stats && typeof m.stats.highestHit === 'number') m.stats.highestHit *= k;
  // ゴールドで数える日課（稼いだ額の差で進む）と、日課の報酬・放置の稼ぎの記録も同じ桁に（直さないと日課がすぐ終わり、報酬と放置のゴールドが 1/10 になる）
  const bounty = (b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'gold') for (const key of ['target', 'base', 'prog']) if (typeof b[key] === 'number') b[key] *= k;
    if (b.reward && typeof b.reward.gold === 'number') b.reward.gold *= k;
  };
  if (m.bounties) { (Array.isArray(m.bounties.list) ? m.bounties.list : []).forEach(bounty); bounty(m.bounties.weekly); }
  if (m.rates && typeof m.rates.gold === 'number') m.rates.gold *= k;
  return state;
}

export function structuredCloneSafe(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}
