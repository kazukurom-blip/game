// PET スキル（REFERENCE_MAPLE_SYSTEMS §3 S-8）と親密度
//  - スキル: autoHp / autoMp（閾値以下で所持ポーションを自動使用・間隔1秒）, range（取得範囲+40%）,
//            filter（指定レア度未満の装備を拾わない）, autoSell（拾った common 装備を売値×80%で即 $ 化）
//  - 親密度 Lv1〜30: フィールドで1分ごと +1pt、ペットフード +20pt。Lv ごとに pickRate +2%、Lv10/20/30 でスキル枠+1
//  - 寿命・餌切れで動かなくなる仕様は無し
//  ワールド担当の entities/pet.js が毎フレーム petAutoUse(game, dt) を呼び、取得判定で petShouldPick(game, drop)、
//  取得範囲・速度に petStats(state).pickRange / pickRate を使う。
import { ITEMS, PET_SKILL_IDS, PET_SKILL_INFO } from '../data/items.js';
import { RARITY } from './loot.js';
import { useItem, countItem, removeItem, sellPrice } from './inventory.js';
import { computeStats } from './progression.js';

export { PET_SKILL_IDS, PET_SKILL_INFO };
export const PET_MAX_LV = 30;
export const PET_FOOD_AFF = 20;
export const PET_AFF_PER_MIN = 1;
export const PET_POTION_INTERVAL = 1.0;
export const PET_SKILL_UNLOCK_LV = [10, 20, 30];
export const PET_FILTERS = ['none', 'rare', 'epic', 'legendary']; // 'rare' = rare 未満（common）を拾わない
export const DEFAULT_PET_CFG = { autoHp: true, hpTh: 0.5, hpPotion: null, autoMp: true, mpTh: 0.3, mpPotion: null, filter: 'none', autoSell: true };

/** Lv n → n+1 に必要な親密度 pt（合計 Lv30 まで 4,350pt） */
export function petAffNeed(lv) { return 10 * lv; }
export function petLevelFromAff(aff) {
  let lv = 1, left = Math.max(0, aff || 0);
  while (lv < PET_MAX_LV && left >= petAffNeed(lv)) { left -= petAffNeed(lv); lv++; }
  return { lv, into: left, need: lv < PET_MAX_LV ? petAffNeed(lv) : 0 };
}

/** state.petData[petId] を保証して返す */
export function petData(state, petId = state?.equipped?.pet) {
  if (!state || !petId || ITEMS[petId]?.slot !== 'pet') return null;
  if (!state.petData || typeof state.petData !== 'object') state.petData = {};
  const d = state.petData[petId] && typeof state.petData[petId] === 'object' ? state.petData[petId] : {};
  d.aff = Math.max(0, Number.isFinite(d.aff) ? d.aff : 0);
  d.cfg = { ...DEFAULT_PET_CFG, ...(d.cfg && typeof d.cfg === 'object' ? d.cfg : {}) };
  state.petData[petId] = d;
  return d;
}

/** その PET が今使えるスキル（初期 petSkills ＋ 親密度で解放） */
export function petSkillsOf(state, petId = state?.equipped?.pet) {
  const it = ITEMS[petId];
  if (!it || it.slot !== 'pet') return [];
  const out = [...(it.petSkills || [])];
  const lv = petLevelFromAff(petData(state, petId)?.aff || 0).lv;
  for (const need of PET_SKILL_UNLOCK_LV) {
    if (lv < need) break;
    const next = PET_SKILL_IDS.find((s) => !out.includes(s));
    if (next) out.push(next);
  }
  return out;
}

/** petStats(state) → {id, name, lv, aff, into, need, skills, pickRange, pickRate, cfg} | null（取得範囲・速度は親密度/スキル込み） */
export function petStats(state, petId = state?.equipped?.pet) {
  const it = ITEMS[petId];
  if (!it || it.slot !== 'pet') return null;
  const d = petData(state, petId);
  const L = petLevelFromAff(d.aff);
  const skills = petSkillsOf(state, petId);
  const base = it.pet || {};
  return {
    id: petId, name: base.name || it.name, lv: L.lv, aff: d.aff, into: L.into, need: L.need,
    skills, skillInfo: skills.map((s) => ({ id: s, ...PET_SKILL_INFO[s] })),
    pickRange: Math.round((base.pickRange || 160) * (skills.includes('range') ? 1.4 : 1)),
    pickRate: (base.pickRate || 1) * (1 + 0.02 * (L.lv - 1)),
    cfg: { ...d.cfg },
  };
}

/** setPetConfig(state, patch, petId?) → cfg */
export function setPetConfig(state, patch = {}, petId = state?.equipped?.pet) {
  const d = petData(state, petId);
  if (!d) return null;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_PET_CFG)) continue;
    if (k === 'hpTh' || k === 'mpTh') d.cfg[k] = Math.max(0.1, Math.min(0.9, Math.round(Number(v) * 20) / 20));
    else if (k === 'filter') d.cfg[k] = PET_FILTERS.includes(v) ? v : 'none';
    else if (k === 'hpPotion' || k === 'mpPotion') d.cfg[k] = v && ITEMS[v]?.type === 'consumable' ? v : null;
    else d.cfg[k] = !!v;
  }
  return { ...d.cfg };
}

/** 親密度を加算（Lv アップで petLevelUp を emit） */
export function addPetAffinity(game, n, petId = game.state?.equipped?.pet) {
  const d = petData(game.state, petId);
  if (!d || !(n > 0)) return 0;
  const before = petLevelFromAff(d.aff).lv;
  d.aff += n;
  const after = petLevelFromAff(d.aff).lv;
  if (after > before) {
    const name = ITEMS[petId]?.pet?.name || ITEMS[petId]?.name;
    game.notify?.(`${name} の親密度が Lv.${after} になった！`, '#ff6fd8');
    game.events?.emit('petLevelUp', { petId, level: after });
  }
  return after;
}

/** feedPet(game, foodId='pet_food') → {ok, msg} */
export function feedPet(game, foodId = 'pet_food') {
  const st = game.state;
  const petId = st?.equipped?.pet;
  if (!petId) { game.notify?.('PET を装備していません', '#ff8a8a'); return { ok: false, msg: 'PET を装備していません' }; }
  if (countItem(st, foodId) <= 0) return { ok: false, msg: 'ペットフードがありません' };
  removeItem(st, foodId, 1);
  addPetAffinity(game, PET_FOOD_AFF, petId);
  const msg = `${ITEMS[petId].pet?.name || 'PET'} はうれしそう！（親密度 +${PET_FOOD_AFF}）`;
  game.notify?.(msg, '#ff6fd8');
  game.events?.emit('petFed', { petId });
  return { ok: true, msg };
}

/** drop を拾うか（取得フィルタ）。お金・非装備は常に true */
export function petShouldPick(game, drop) {
  const st = game.state;
  const ps = petStats(st);
  if (!ps || !ps.skills.includes('filter') || ps.cfg.filter === 'none') return true;
  const it = drop?.item;
  if (!it || drop.money != null || it.type !== 'equip' || it.slot === 'pet') return true;
  const need = RARITY[ps.cfg.filter]?.order ?? 0;
  return (RARITY[it.rarity]?.order ?? 0) >= need;
}

/** 自動売却（inventory.addItem が fromDrop のとき呼ぶ）。売ったら true */
export function petAutoSellCheck(game, id, qty = 1) {
  const st = game.state;
  const it = ITEMS[id];
  if (!st || !it || it.type !== 'equip' || it.rarity !== 'common' || it.slot === 'pet') return false;
  const ps = petStats(st);
  if (!ps || !ps.skills.includes('autoSell') || !ps.cfg.autoSell) return false;
  const gain = Math.max(1, Math.floor(sellPrice(id) * 0.8)) * qty;
  st.money = (st.money || 0) + gain;
  (st.itemsFound ||= {})[id] = true;
  game.events?.emit('petAutoSell', { id, qty, gain });
  return true;
}

function healOf(it, key) { const e = it?.effect || {}; return e.buff ? 0 : (e[key] || 0) + (e[key + 'Pct'] || 0) * 1000; }
function pickPotion(st, key, prefer) {
  if (prefer && countItem(st, prefer) > 0 && healOf(ITEMS[prefer], key) > 0) return prefer;
  for (const id of st.potionBar || []) if (id && countItem(st, id) > 0 && healOf(ITEMS[id], key) > 0) return id;
  let best = null, bv = 0;
  for (const s of st.inventory || []) {
    const it = s && ITEMS[s.id];
    if (!it || it.type !== 'consumable') continue;
    const v = healOf(it, key);
    if (v > 0 && (best == null || v < bv)) { best = s.id; bv = v; } // 小さい回復量から使う（エリクサー温存）
  }
  return best;
}

/**
 * petAutoUse(game, dt) — 毎フレーム（pet.js から）。自動ポーション・親密度の時間加算。
 * 戻り値: {hp: itemId|null, mp: itemId|null}
 */
export function petAutoUse(game, dt) {
  const st = game.state;
  const out = { hp: null, mp: null };
  const petId = st?.equipped?.pet;
  if (!petId || !game.player || game.player.dead || !(st.hp > 0)) return out;
  const a = (game._petAuto ||= { cdHp: 0, cdMp: 0, affT: 0, petId });
  if (a.petId !== petId) { a.petId = petId; a.affT = 0; }
  a.cdHp = Math.max(0, a.cdHp - dt);
  a.cdMp = Math.max(0, a.cdMp - dt);
  if (game.map && game.map.town === false) {
    a.affT += dt;
    while (a.affT >= 60) { a.affT -= 60; addPetAffinity(game, PET_AFF_PER_MIN, petId); }
  }
  const ps = petStats(st, petId);
  if (!ps) return out;
  const s = computeStats(st);
  if (ps.skills.includes('autoHp') && ps.cfg.autoHp && a.cdHp <= 0 && st.hp <= s.maxHp * ps.cfg.hpTh) {
    const id = pickPotion(st, 'hp', ps.cfg.hpPotion);
    if (id && useItem(game, id)) { out.hp = id; a.cdHp = PET_POTION_INTERVAL; game.events?.emit('petPotion', { id, kind: 'hp' }); }
    else a.cdHp = PET_POTION_INTERVAL;
  }
  if (ps.skills.includes('autoMp') && ps.cfg.autoMp && a.cdMp <= 0 && st.mp <= s.maxMp * ps.cfg.mpTh) {
    const id = pickPotion(st, 'mp', ps.cfg.mpPotion);
    if (id && useItem(game, id)) { out.mp = id; a.cdMp = PET_POTION_INTERVAL; game.events?.emit('petPotion', { id, kind: 'mp' }); }
    else a.cdMp = PET_POTION_INTERVAL;
  }
  return out;
}
