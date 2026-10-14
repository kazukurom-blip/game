// 拡張の登録所。ユニーク・セット・宝石・伝説の力・パッシブ・転生などの仕組みは、
// ここに「効果を返す関数」や「戦闘のフック」を登録する。こうするとファイル同士が直接ぶつからない。
//
// ■ アイテムの効果（items.js から呼ばれる）
//   registry.provide('uniqueMods', (item) => [{s,v}...])   ユニーク/セット/ミシックの固定効果
//   registry.provide('uniqueName', (item) => '名前' | null)
//   registry.provide('socketMods', (item) => [...])         ソケットの宝石・ルーン
//   registry.provide('powerMods',  (item) => [...])         伝説の力の数値の部分
//
// ■ 主人公への効果（character.js の能力計算で集める）
//   registry.addHeroSource('tree', (state, game) => [{s,v}...])   パッシブ・パラゴン・転生・実績・図鑑・ペット・セット効果など
//
// ■ 戦闘中の力（伝説の力・ユニーク・セット・キーストーン・宝石など）
//   registry.definePower({ id, name, desc:(v)=>string, range:[a,b], slots:[...], cls, codex:'weapon'|'armor'|'jewelry',
//                          mods:(v)=>[{s,v}], hooks: { modifySkill, onHit, onCrit, onKill, onCast, onTick, onDamaged, onStart } })
//   registry.addPowerSource('items', (state, game) => [{ id, v, src }])   今効いている力の一覧を返す
//
// フックの引数（combat.js が渡す）:
//   modifySkill(ctx, skill, params, v)  … params はそのスキルの今回の数値（書き換えてよい）
//   onHit(ctx, hit, v)       hit = { src, target, dmg, crit, element, skill, tags }
//   onCrit(ctx, hit, v)
//   onKill(ctx, target, v)
//   onCast(ctx, skill, params, v)
//   onTick(ctx, dt, v)
//   onDamaged(ctx, info, v)  info = { amount, element, from }（amount を書き換えると受けるダメージが変わる）
//   onStart(ctx, v)          戦闘（ステージ）開始時

const providers = { uniqueMods: [], uniqueName: [], socketMods: [], powerMods: [], itemArt: [] };
const heroSources = new Map();
const powerSources = new Map();
const powers = {};

export const registry = {
  provide(name, fn) {
    if (!providers[name]) providers[name] = [];
    providers[name].push(fn);
  },
  _collect(name, item) {
    const out = [];
    for (const fn of providers[name] || []) {
      try { const r = fn(item); if (r && r.length) out.push(...r); } catch (e) { console.error(`[registry:${name}]`, e); }
    }
    return out;
  },
  uniqueMods(item) { return this._collect('uniqueMods', item); },
  socketMods(item) { return this._collect('socketMods', item); },
  powerMods(item) { return this._collect('powerMods', item); },
  uniqueName(item) {
    for (const fn of providers.uniqueName) { try { const n = fn(item); if (n) return n; } catch (e) { console.error(e); } }
    return null;
  },
  /** 装備の見た目の枠を上書き（ユニーク専用の絵など）。無ければ null */
  itemArt(item) {
    for (const fn of providers.itemArt) { try { const n = fn(item); if (n) return n; } catch (e) { console.error(e); } }
    return null;
  },

  addHeroSource(id, fn) { heroSources.set(id, fn); },
  heroMods(state, game) {
    const out = [];
    for (const [id, fn] of heroSources) {
      try {
        const r = fn(state, game);
        if (r && r.length) for (const m of r) out.push(m.src ? m : { ...m, src: id });
      } catch (e) { console.error(`[heroSource:${id}]`, e); }
    }
    return out;
  },

  definePower(def) {
    if (!def?.id) throw new Error('power needs id');
    powers[def.id] = { range: [1, 1], hooks: {}, ...def };
    return powers[def.id];
  },
  power(id) { return powers[id]; },
  allPowers() { return Object.values(powers); },
  powerValue(id, r = 1) {
    const p = powers[id];
    if (!p) return 0;
    const [a, b] = p.range || [1, 1];
    const v = a + (b - a) * Math.max(0, Math.min(1, r));
    return p.integer ? Math.round(v) : Math.round(v * 100) / 100;
  },
  addPowerSource(id, fn) { powerSources.set(id, fn); },
  /** 今効いている力: [{ id, v, src, def }] */
  activePowers(state, game) {
    const out = [];
    for (const [sid, fn] of powerSources) {
      try {
        const r = fn(state, game) || [];
        for (const p of r) { const def = powers[p.id]; if (def) out.push({ ...p, src: p.src || sid, def }); }
      } catch (e) { console.error(`[powerSource:${sid}]`, e); }
    }
    return out;
  },
};
