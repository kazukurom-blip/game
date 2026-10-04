// ビルド保存: スキルバー＆装備セットを2つ保存して切替（狩り / ボス）
//  state.presets = {active, list:[{name, skillBar:[8], equip:{slot: uid|null}, savedAt}]}
//  装備は uid で記録（同じ ID の別個体＝★違いを区別）。見つからない装備はスキップ（missing に入る）
import { SKILLS, SKILL_BAR_SIZE } from '../data/skills.js';
import { EQUIP_SLOTS } from '../data/items.js';
import { equip, equippedInstOf, resolveItemRef, normalizeInventory } from './inventory.js';

export const PRESET_COUNT = 2;
export const PRESET_NAMES = ['狩り', 'ボス'];

export function ensurePresets(state) {
  const p = state.presets && typeof state.presets === 'object' && Array.isArray(state.presets.list) ? state.presets : { active: 0, list: [] };
  while (p.list.length < PRESET_COUNT) p.list.push({ name: PRESET_NAMES[p.list.length] || `セット${p.list.length + 1}`, skillBar: null, equip: null, savedAt: 0 });
  p.list = p.list.slice(0, PRESET_COUNT);
  if (!(p.active >= 0 && p.active < PRESET_COUNT)) p.active = 0;
  state.presets = p;
  return p;
}

/** presetList(state) → [{index, name, active, saved, skillBar, equip}] */
export function presetList(state) {
  const p = ensurePresets(state);
  return p.list.map((e, i) => ({ index: i, name: e.name, active: p.active === i, saved: !!(e.skillBar || e.equip), skillBar: e.skillBar ? [...e.skillBar] : null, equip: e.equip ? { ...e.equip } : null, savedAt: e.savedAt }));
}

/** savePreset(state, i, {skills=true, equip=true}) → bool（現在のスキルバー・装備を保存） */
export function savePreset(state, i, what = {}) {
  const p = ensurePresets(state);
  const e = p.list[i];
  if (!e) return false;
  if (what.skills !== false) e.skillBar = (state.skillBar || []).slice(0, SKILL_BAR_SIZE).map((x) => x || null);
  if (what.equip !== false) {
    normalizeInventory(state);
    e.equip = {};
    for (const slot of EQUIP_SLOTS) e.equip[slot] = equippedInstOf(state, slot)?.uid || null;
  }
  e.savedAt = Date.now();
  p.active = i;
  return true;
}

export function renamePreset(state, i, name) {
  const e = ensurePresets(state).list[i];
  if (!e || typeof name !== 'string' || !name.trim()) return false;
  e.name = name.trim().slice(0, 10);
  return true;
}

/** applyPreset(game, i) → {ok, msg, missing:[slot]}（スキルバーは習得済み・非パッシブのみ。装備は uid で探して装備） */
export function applyPreset(game, i) {
  const st = game.state;
  const p = ensurePresets(st);
  const e = p.list[i];
  if (!e || (!e.skillBar && !e.equip)) return { ok: false, msg: 'このセットは未保存です', missing: [] };
  const missing = [];
  if (e.skillBar) {
    const bar = e.skillBar.slice(0, SKILL_BAR_SIZE).map((id) => (id && SKILLS[id] && (st.skills?.[id] || 0) > 0 && SKILLS[id].kind !== 'passive' ? id : null));
    while (bar.length < SKILL_BAR_SIZE) bar.push(null);
    st.skillBar = bar;
  }
  if (e.equip) {
    normalizeInventory(st);
    for (const slot of EQUIP_SLOTS) {
      const uid = e.equip[slot];
      if (!uid) continue;
      if (equippedInstOf(st, slot)?.uid === uid) continue;
      const r = resolveItemRef(st, uid, { invOnly: true });
      if (!r) { missing.push(slot); continue; }
      const res = equip(game, { uid });
      if (!res.ok) missing.push(slot);
    }
  }
  p.active = i;
  game.events?.emit('presetApplied', { index: i });
  const msg = `セット「${e.name}」に切り替えた${missing.length ? `（見つからない装備: ${missing.length}）` : ''}`;
  game.notify?.(msg, '#19f0ff');
  return { ok: true, msg, missing };
}
