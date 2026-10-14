// セーブされる状態（state）の形。担当ごとに名前空間を分けている:
//   hero  … 主人公（クラス・レベル・スキル・パッシブ・装備）           … 戦闘/スキル担当
//   inv   … 持ち物・倉庫・素材・宝石・ルーン                             … アイテム担当
//   world … いまいる場所・最高到達・難易度・裂け目                       … ワールド担当
//   meta  … お金・転生・実績・図鑑・日課・ペット・統計                   … メタ担当
//   settings … 設定（UI 担当）
// 新しい項目を足すときは defaults を増やすだけで、古いセーブは migrate() で自動的に埋まる。

export const SAVE_VERSION = 1;

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

export function migrate(state) {
  const d = newState(state?.hero?.cls || 'warrior', state?.hero?.name);
  fillDefaults(state, d);
  // 版ごとの変換はここに足す
  // if (state.version < 2) { ...; }
  state.version = SAVE_VERSION;
  return state;
}

export function structuredCloneSafe(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}
