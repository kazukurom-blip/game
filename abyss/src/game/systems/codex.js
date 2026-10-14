// 極意（力の書庫）: レジェンダリーの力を装備から抽出して登録し、3 つの枠（攻め・守り・補助）に着けて使う。担当: アイテム担当。
// 抽出すると装備は消える（残響を使う）。同じ力は一番強いロールだけが残る。装備にすでにある力は、極意の方は重ねて効かない。
// 外から: game.sys.codex.extract(uid) / equip(slotIndex, powerId) / unequip(slotIndex) / list() / extractInfo(item)
// state: meta.codex = { powers: { id: r }, equipped: [攻め, 守り, 補助] }

import { registry } from '../registry.js';
import { PG } from '../../data/balance.js';
import { SLOTS } from '../../data/items.js';
import { weaponStats } from '../items.js';
import { ensureSkillPowers } from '../content/items/powers.js';

export const CODEX_SLOTS = [
  { cat: 'atk', name: '攻め', desc: '攻撃の力（スキルを変える・発動する・ダメージ）' },
  { cat: 'def', name: '守り', desc: '守りの力（受けるダメージ・回復・障壁）' },
  { cat: 'util', name: '補助', desc: '補助の力（ゴールド・発見率・リソース・移動）' },
];
const EXTRACTABLE = new Set(['legendary', 'skill']);

/** 装備にある力の id（両手武器のときの副手は除く） */
function equippedPowerIds(state) {
  const eq = state.hero.equip || {};
  const two = eq.weapon && weaponStats(eq.weapon)?.twoHanded;
  const ids = new Set();
  for (const s of SLOTS) { const it = eq[s]; if (it?.power && !(two && s === 'offhand')) ids.add(it.power.id); }
  return ids;
}

/** 今効いている極意の力 [{ id, v }]（state だけで決まる） */
export function codexActive(state) {
  const cx = state.meta?.codex;
  if (!cx?.equipped) return [];
  const onGear = equippedPowerIds(state);
  const out = [];
  cx.equipped.forEach((id, i) => {
    if (!id || onGear.has(id)) return;
    const def = registry.power(id);
    if (!def || def.cat !== CODEX_SLOTS[i]?.cat) return;
    const r = cx.powers?.[id];
    if (r === undefined) return;
    out.push({ id, v: registry.powerValue(id, r), src: 'codex' });
  });
  return out;
}

registry.addPowerSource('codex', (state) => codexActive(state));
registry.addHeroSource('codex', (state) => {
  const out = [];
  for (const p of codexActive(state)) { const d = registry.power(p.id); if (d?.mods) out.push(...d.mods(p.v)); }
  return out;
});

export class CodexSystem {
  constructor(game) { this.game = game; this.id = 'codex'; }
  get cx() { return this.game.state.meta.codex; }

  ensureState(state) {
    // 後から足されたスキルの「極め」の力も、読み込みの前に作っておく（セーブにある力が引けるように）
    ensureSkillPowers();
    const m = state.meta;
    if (!m.codex || typeof m.codex !== 'object') m.codex = { powers: {}, equipped: [null, null, null] };
    m.codex.powers ||= {};
    if (!Array.isArray(m.codex.equipped)) m.codex.equipped = [null, null, null];
    while (m.codex.equipped.length < 3) m.codex.equipped.push(null);
  }

  /** 抽出できるか・費用 */
  extractInfo(item) {
    if (!item?.power) return { ok: false, msg: '伝説の力が付いていない' };
    const def = registry.power(item.power.id);
    if (!def || !EXTRACTABLE.has(def.pool)) return { ok: false, msg: 'ユニーク・セット・ミシックの力は抽出できない（レジェンダリーだけ）' };
    const f = this.game.sys.inv.findItem(item.uid);
    if (!f) return { ok: false, msg: '見つからない' };
    if (f.where === 'equip') return { ok: false, msg: '装備中の物は抽出できない（外してから）' };
    if (item.locked) return { ok: false, msg: '鍵つき（鍵を外してから）' };
    const prev = this.cx.powers[def.id];
    const cost = { gold: Math.round(50 * PG(item.ilvl || 1)), echo: 3 };
    const miss = [];
    if (this.game.state.meta.gold < cost.gold) miss.push('ゴールド');
    if ((this.game.state.inv.mats.echo || 0) < cost.echo) miss.push('伝説の残響');
    return { ok: true, def, r: item.power.r, prev, better: prev === undefined || item.power.r > prev, cost, missing: miss };
  }

  extract(uid) {
    const f = this.game.sys.inv.findItem(uid);
    const info = this.extractInfo(f?.item);
    if (!info.ok) return { ok: false, msg: info.msg };
    if (info.missing.length) return { ok: false, msg: `${info.missing.join('・')}が足りない` };
    this.game.spendGold(info.cost.gold);
    this.game.state.inv.mats.echo -= info.cost.echo;
    // はまっていた宝石は戻す
    this.game.sys.gems?.returnSockets(f.item);
    this.game.sys.inv.remove(f);
    const id = info.def.id;
    const prev = this.cx.powers[id];
    if (prev === undefined || f.item.power.r > prev) this.cx.powers[id] = f.item.power.r;
    this.game.state.meta.collection.powers[id] = (this.game.state.meta.collection.powers[id] || 0) + 1;
    this.changed();
    return { ok: true, id, improved: prev === undefined || f.item.power.r > prev, prev, r: this.cx.powers[id] };
  }

  /** 登録済みの力 [{ id, def, r, v, cat, equipped }]（分類ごと） */
  list(cat = null) {
    const out = [];
    for (const [id, r] of Object.entries(this.cx.powers)) {
      const def = registry.power(id);
      if (!def || (cat && def.cat !== cat)) continue;
      out.push({ id, def, r, v: registry.powerValue(id, r), cat: def.cat, equipped: this.cx.equipped.indexOf(id) });
    }
    return out.sort((a, b) => (a.def.cls ? 1 : 0) - (b.def.cls ? 1 : 0) || a.def.name.localeCompare(b.def.name, 'ja'));
  }

  equip(slot, id) {
    const s = CODEX_SLOTS[slot];
    const def = registry.power(id);
    if (!s || !def) return { ok: false, msg: '選べない' };
    if (this.cx.powers[id] === undefined) return { ok: false, msg: 'まだ登録していない力' };
    if (def.cat !== s.cat) return { ok: false, msg: `「${s.name}」の枠には「${s.name}」の力だけ` };
    const other = this.cx.equipped.indexOf(id);
    if (other >= 0) this.cx.equipped[other] = null;
    this.cx.equipped[slot] = id;
    this.changed();
    return { ok: true };
  }

  unequip(slot) {
    if (!this.cx.equipped[slot]) return { ok: false };
    this.cx.equipped[slot] = null;
    this.changed();
    return { ok: true };
  }

  /** 装備と重なっていて効いていない枠 */
  shadowed() { const on = equippedPowerIds(this.game.state); return this.cx.equipped.map((id) => !!id && on.has(id)); }

  changed() {
    this.game.onStatsChanged();
    this.game.events.emit('invChanged', {});
  }
}
