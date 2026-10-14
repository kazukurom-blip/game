// 持ち物（バッグ・倉庫・装備・分解・売却・自動の振り分け）。
// 外から: game.sys.inv.equip(uid, slot?) / unequip(slot) / salvage(uids) / sell(uids) / lock(uid) / toStash(uid, tab) / fromStash(uid)
//         receive(item, where) … ドロップしたアイテムを受け取る（振り分けの規則をかける）
//         compare(item, slot?) … { dps, ehp, dpsPct, ehpPct, slot } 今の装備と比べた変化

import { SLOTS, baseSlotOf, AFFIX } from '../../data/items.js';
import { RARITY } from '../../data/rarity.js';
import { SALVAGE } from '../../data/materials.js';
import { CLASS } from '../../data/classes.js';
import { computeHero, effectiveLife } from '../character.js';
import { estimateDps } from '../skills.js';
import { itemReq, sellValue, weaponStats, baseOf } from '../items.js';

export const invHooks = {
  onFound: [], // (game, item) => void … 図鑑などに記録
  salvageExtra: [], // (game, item, out) => void … 分解の追加の素材
  canEquip: [], // (game, item, slot) => string|null … 着けられない理由
  keepRules: [], // (game, item, keep) => true|false|null … 拾ったときに残すか（自動の振り分けの細かい規則。null は変えない）
  onSell: [], // (game, item) => void … 売る前（はまっている宝石を戻すなど）
};

export class InventorySystem {
  constructor(game) { this.game = game; this.id = 'inv'; }
  get inv() { return this.game.state.inv; }
  get hero() { return this.game.state.hero; }

  findItem(uid) {
    const inv = this.inv;
    let i = inv.bag.findIndex((x) => x.uid === uid);
    if (i >= 0) return { item: inv.bag[i], where: 'bag', index: i };
    for (let t = 0; t < inv.stash.length; t++) {
      i = inv.stash[t].findIndex((x) => x.uid === uid);
      if (i >= 0) return { item: inv.stash[t][i], where: 'stash', tab: t, index: i };
    }
    for (const s of SLOTS) if (this.hero.equip[s]?.uid === uid) return { item: this.hero.equip[s], where: 'equip', slot: s };
    return null;
  }

  remove(found) {
    if (found.where === 'bag') this.inv.bag.splice(found.index, 1);
    else if (found.where === 'stash') this.inv.stash[found.tab].splice(found.index, 1);
    else if (found.where === 'equip') delete this.hero.equip[found.slot];
  }

  bagFree() { return this.inv.bagSize - this.inv.bag.length; }

  /** 着けられるか。着けられなければ理由（文字列） */
  equipProblem(item, slot) {
    if (baseSlotOf(slot) !== item.slot) return '部位が違う';
    const lvl = this.hero.level;
    if (itemReq(item) > lvl) return `レベル ${itemReq(item)} が必要`;
    const b = baseOf(item);
    const cls = CLASS[this.hero.cls];
    if (item.slot === 'weapon' && b && !cls.weapons.includes(b.kind)) return `${cls.name}は使えない武器`;
    if (item.slot === 'offhand' && b && !cls.offhands.includes(b.kind)) return `${cls.name}は使えない副手`;
    if (item.slot === 'offhand') {
      const w = this.hero.equip.weapon;
      if (w && weaponStats(w)?.twoHanded) return '両手武器を装備中';
    }
    for (const f of invHooks.canEquip) { const r = f(this.game, item, slot); if (r) return r; }
    return null;
  }

  /** 空いている方・弱い方の指輪の枠を選ぶ */
  slotFor(item) {
    if (item.slot !== 'ring') return item.slot;
    if (!this.hero.equip.ring1) return 'ring1';
    if (!this.hero.equip.ring2) return 'ring2';
    const a = this.compare(item, 'ring1'); const b = this.compare(item, 'ring2');
    return (a.dpsPct + a.ehpPct) >= (b.dpsPct + b.ehpPct) ? 'ring1' : 'ring2';
  }

  equip(uid, slot = null) {
    const f = this.findItem(uid);
    if (!f || f.where === 'equip') return { ok: false, msg: '見つからない' };
    const item = f.item;
    slot ||= this.slotFor(item);
    const prob = this.equipProblem(item, slot);
    if (prob) return { ok: false, msg: prob };
    this.remove(f);
    const old = this.hero.equip[slot];
    this.hero.equip[slot] = item;
    item.isNew = false;
    if (old) this.putBack(old, f);
    // 両手武器を着けたら副手を外す
    if (slot === 'weapon' && weaponStats(item)?.twoHanded && this.hero.equip.offhand) {
      const off = this.hero.equip.offhand; delete this.hero.equip.offhand; this.putBack(off, null);
    }
    this.game.onGearChanged();
    return { ok: true };
  }

  /**
   * 外した装備を戻す。倉庫から着けたならその倉庫へ、ふつうはバッグへ。
   * バッグが満杯なら空いている倉庫へ、どこも満杯ならバッグの一番弱い物（鍵なし・外した物よりレアリティが低い）を分解して空ける。
   * それも無ければ外した物を分解する（鍵つきは捨てずに倉庫へ）。倉庫が上限を超えて増え続けないように。
   */
  putBack(item, f) {
    const inv = this.inv; const cap = inv.stashTabSize;
    if (f?.where === 'stash' && inv.stash[f.tab] && inv.stash[f.tab].length < cap) { inv.stash[f.tab].push(item); return 'stash'; }
    if (this.bagFree() > 0) { inv.bag.push(item); return 'bag'; }
    const tab = inv.stash.find((t) => t.length < cap);
    if (tab) { tab.push(item); return 'stash'; }
    const idx = RARITY[item.rarity]?.idx || 0;
    const victim = inv.bag.filter((x) => !x.locked && (RARITY[x.rarity]?.idx || 0) < idx).sort((a, b) => (RARITY[a.rarity].idx - RARITY[b.rarity].idx) || a.ilvl - b.ilvl)[0];
    if (victim) { this.salvage([victim.uid], { silent: true }); inv.bag.push(item); return 'bag'; }
    if (item.locked) { inv.stash[0].push(item); return 'stash'; }
    this.addMats(this.salvageYield(item)); // はまっている宝石は salvageExtra が持ち物に戻す
    this.game.state.meta.stats.salvaged++;
    this.game.events.emit('invChanged', { salvaged: 1 });
    return 'salvaged';
  }

  unequip(slot) {
    const it = this.hero.equip[slot];
    if (!it) return { ok: false };
    if (this.bagFree() <= 0) return { ok: false, msg: 'バッグがいっぱい' };
    delete this.hero.equip[slot];
    this.inv.bag.push(it);
    this.game.onGearChanged();
    return { ok: true };
  }

  lock(uid, v = null) {
    const f = this.findItem(uid);
    if (!f) return;
    f.item.locked = v === null ? !f.item.locked : !!v;
    this.game.events.emit('invChanged', {});
  }

  /** 分解して素材にする。装備中・鍵つきは無視 */
  salvage(uids, { silent = false } = {}) {
    const got = {};
    let n = 0;
    for (const uid of uids) {
      const f = this.findItem(uid);
      if (!f || f.where === 'equip' || f.item.locked) continue;
      this.remove(f);
      this.salvageYield(f.item, got);
      n++;
    }
    this.addMats(got);
    this.game.state.meta.stats.salvaged += n;
    if (!silent) this.game.events.emit('invChanged', { salvaged: n, got });
    return { n, got };
  }

  salvageYield(item, out = {}) {
    const rng = this.game.rng;
    const table = SALVAGE[item.rarity] || SALVAGE.common;
    const mult = 1 + (this.game.H?.matFind || 0) / 100;
    for (const [id, lo, hi] of table) {
      const k = Math.floor(rng.int(lo, hi) * mult + (rng.next() < ((mult % 1) || 0) ? 1 : 0));
      if (k > 0) out[id] = (out[id] || 0) + k;
    }
    if (item.q >= 1) out.core = (out.core || 0) + (item.q === 2 ? 3 : 1);
    for (const f of invHooks.salvageExtra) f(this.game, item, out);
    return out;
  }

  addMats(got) {
    const m = this.inv.mats;
    for (const k in got) m[k] = (m[k] || 0) + got[k];
  }

  sell(uids) {
    let gold = 0; let n = 0;
    for (const uid of uids) {
      const f = this.findItem(uid);
      if (!f || f.where === 'equip' || f.item.locked) continue;
      for (const fn of invHooks.onSell) { try { fn(this.game, f.item); } catch (e) { console.error(e); } }
      this.remove(f);
      gold += sellValue(f.item);
      n++;
    }
    this.game.addGold(gold);
    this.game.events.emit('invChanged', { sold: n, gold });
    return { n, gold };
  }

  toStash(uid, tab = 0) {
    const f = this.findItem(uid);
    if (!f || f.where !== 'bag') return false;
    const st = this.inv.stash[tab];
    if (!st || st.length >= this.inv.stashTabSize) return false;
    this.remove(f); st.push(f.item);
    this.game.events.emit('invChanged', {});
    return true;
  }

  fromStash(uid) {
    const f = this.findItem(uid);
    if (!f || f.where !== 'stash' || this.bagFree() <= 0) return false;
    this.remove(f); this.inv.bag.push(f.item);
    this.game.events.emit('invChanged', {});
    return true;
  }

  sortBag() {
    const order = (it) => -(RARITY[it.rarity]?.idx || 0) * 1e6 - (it.q || 0) * 1e5 - (it.ilvl || 0) * 100;
    this.inv.bag.sort((a, b) => order(a) - order(b) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    this.game.events.emit('invChanged', {});
  }

  /** 今の装備と比べる（実際の計算で DPS と耐久の変化を出す） */
  compare(item, slot = null) {
    slot ||= item.slot === 'ring' ? (this.hero.equip.ring1 ? (this.hero.equip.ring2 ? 'ring1' : 'ring2') : 'ring1') : item.slot;
    const st = this.game.state;
    const basic = st.hero.bar.find(Boolean);
    const before = this.game.H || computeHero(st, this.game);
    const over = { [slot]: item };
    if (slot === 'weapon' && weaponStats(item)?.twoHanded) over.offhand = null;
    const after = computeHero(st, this.game, { equipOverride: over });
    const dpsB = basic ? estimateDps(st, before, basic) : 0;
    const dpsA = basic ? estimateDps(st, after, basic) : 0;
    const ehpB = effectiveLife(before); const ehpA = effectiveLife(after);
    return { slot, dps: dpsA, ehp: ehpA, dpsPct: dpsB > 0 ? (dpsA / dpsB - 1) * 100 : 0, ehpPct: ehpB > 0 ? (ehpA / ehpB - 1) * 100 : 0, before, after };
  }

  isUpgrade(item) {
    if (this.equipProblem(item, item.slot === 'ring' ? 'ring1' : item.slot)) return false;
    const c = this.compare(item);
    return c.dpsPct + c.ehpPct * 0.6 > 2;
  }

  /** フィルタで「残したい」と言われたか */
  wanted(item) {
    const f = this.inv.filter;
    if (!f.wantStats?.length) return false;
    let n = 0;
    for (const a of item.affixes || []) if (f.wantStats.includes(a.s)) n++;
    return n >= (f.wantMin || 1);
  }

  /** ドロップを受け取る。戻り値: 'bag' | 'salvaged' | 'equipped' */
  receive(item, { quiet = false } = {}) {
    const g = this.game;
    const meta = g.state.meta;
    meta.stats.itemsFound[item.rarity] = (meta.stats.itemsFound[item.rarity] || 0) + 1;
    for (const f of invHooks.onFound) f(g, item);
    const f = this.inv.filter;
    const r = RARITY[item.rarity];
    let keep = !f.autoSalvage[item.rarity];
    if (!keep && this.wanted(item)) keep = true;
    for (const fn of invHooks.keepRules) { try { const r = fn(g, item, keep); if (r === true || r === false) keep = r; } catch (e) { console.error(e); } }
    let upgrade = false;
    if (f.keepUpgrades || f.autoEquip) upgrade = r.idx >= 1 && this.isUpgrade(item);
    if (!keep && f.keepUpgrades && upgrade) keep = true;
    if (keep && f.autoEquip && upgrade) {
      this.inv.bag.push(item);
      const res = this.equip(item.uid);
      if (res.ok) { if (!quiet) g.events.emit('autoEquip', { item }); return 'equipped'; }
      this.inv.bag.pop();
    }
    if (!keep) {
      const got = this.salvageYield(item);
      this.addMats(got);
      meta.stats.salvaged++;
      return 'salvaged';
    }
    if (this.bagFree() <= 0) {
      // バッグが満杯: 鍵の無い一番弱いマジック以下を分解して空ける。無理ならこれを分解
      const victim = this.inv.bag.filter((x) => !x.locked && (RARITY[x.rarity]?.idx || 0) < r.idx).sort((a, b) => (RARITY[a.rarity].idx - RARITY[b.rarity].idx) || a.ilvl - b.ilvl)[0];
      if (victim) this.salvage([victim.uid], { silent: true });
      else { this.addMats(this.salvageYield(item)); g.events.emit('bagFull', {}); return 'salvaged'; }
    }
    this.inv.bag.push(item);
    if (!quiet) g.events.emit('invChanged', { added: item });
    return 'bag';
  }
}

export { AFFIX };
