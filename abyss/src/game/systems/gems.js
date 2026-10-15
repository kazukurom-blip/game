// 宝石（7 種 × 10 段階・3 個で合成）・ルーン（24）・ルーン語（20）・深淵の宝石（8 種・裂け目で育つ）。担当: アイテム担当。
// 外から:
//   game.sys.gems.combineGem(type, tier) / combineAllGems(type?) / combineRune(id)
//   game.sys.gems.socket(uid, index, key) … key は '<種類>_<段階>' / 'r:<ルーン>' / 'lg:<深淵の宝石>'
//   game.sys.gems.unsocket(uid, index)  … 外すのは無料（ルーン語にしたルーンは外せない）
//   game.sys.gems.onRiftComplete(level, timeLeftRatio) … 深淵の裂け目を踏破したら呼ぶ（ワールド担当）。深淵の宝石が育つ
//   game.sys.gems.setLgemTarget(id) / lgemLevel(id) / ownedLegendaryGems()
//   game.sys.gems.grantRandom(tier, type?) → { id, key, type, tier, name, color } … 宝石を 1 つ渡す（日課の宝箱など）
// state: inv.gems { key: 数 }, inv.runes { id: 数 }, inv.lgems { id: { lvl, uid } }, inv.lgemTarget

import { GEMS, GEM, GEM_TIERS, gemCombineGold, RUNES, RUNE, runeCombineGold, RUNEWORDS, LEGENDARY_GEMS, LEGENDARY_GEM, LGEM_MAX_LEVEL, lgemUpgradeChance } from '../../data/gems.js';
import { socketKind } from '../../data/items.js';
import { parseSocket, gemKey, gemName, runeName } from '../content/items/itemlib.js';
import { invHooks } from './inventory.js';

// 売った装備の宝石・ルーンは持ち物に戻す（分解のときは content/items/loot.js の salvageExtra が戻す）
invHooks.onSell.push((game, item) => game.sys.gems?.returnSockets(item));

export class GemSystem {
  constructor(game) { this.game = game; this.id = 'gems'; }
  get inv() { return this.game.state.inv; }

  ensureState(state) {
    const inv = state.inv;
    if (!inv.gems || typeof inv.gems !== 'object') inv.gems = {};
    if (!inv.runes || typeof inv.runes !== 'object') inv.runes = {};
    if (!inv.lgems || typeof inv.lgems !== 'object') inv.lgems = {};
    if (inv.lgemTarget === undefined) inv.lgemTarget = null;
    state.meta.stats.riftGemUps ||= 0;
  }

  // ---------------- 一覧
  gemCount(key) { return this.inv.gems[key] || 0; }
  /** 持っている宝石 [{ key, id, tier, n, name }]（種類・段階の順） */
  gemList() {
    const out = [];
    for (const g of GEMS) for (let t = GEM_TIERS; t >= 1; t--) { const key = gemKey(g.id, t); const n = this.inv.gems[key] || 0; if (n > 0) out.push({ key, id: g.id, tier: t, n, name: gemName(g.id, t), color: g.color }); }
    return out;
  }
  runeList() { return RUNES.filter((r) => (this.inv.runes[r.id] || 0) > 0).map((r) => ({ id: r.id, key: `r:${r.id}`, n: this.inv.runes[r.id], name: runeName(r.id), tier: r.tier, color: r.color })); }

  // ---------------- 合成
  combineGem(type, tier) {
    if (!GEM[type] || tier < 1 || tier >= GEM_TIERS) return { ok: false, msg: 'これ以上は合成できない' };
    const key = gemKey(type, tier);
    if ((this.inv.gems[key] || 0) < 3) return { ok: false, msg: '同じ宝石が 3 つ必要' };
    const cost = gemCombineGold(tier);
    if (!this.game.spendGold(cost)) return { ok: false, msg: `ゴールドが足りない（${cost} G）` };
    this.inv.gems[key] -= 3;
    if (!this.inv.gems[key]) delete this.inv.gems[key];
    const nk = gemKey(type, tier + 1);
    this.inv.gems[nk] = (this.inv.gems[nk] || 0) + 1;
    this.changed();
    return { ok: true, key: nk, cost };
  }

  /** 下の段からまとめて合成（ゴールドが続く限り）。type を省くと全部 */
  combineAllGems(type = null, maxTier = GEM_TIERS) {
    let n = 0; let gold = 0;
    for (const g of GEMS) {
      if (type && g.id !== type) continue;
      for (let t = 1; t < maxTier; t++) {
        while ((this.inv.gems[gemKey(g.id, t)] || 0) >= 3) {
          const r = this.combineGem(g.id, t);
          if (!r.ok) return { ok: n > 0, n, gold, msg: r.msg };
          n++; gold += r.cost;
        }
      }
    }
    return { ok: n > 0, n, gold, msg: n ? '' : '合成できる宝石がない' };
  }

  combineRune(id) {
    const r = RUNE[id];
    const next = r && RUNES.find((x) => x.tier === r.tier + 1);
    if (!next) return { ok: false, msg: 'これ以上は合成できない' };
    if ((this.inv.runes[id] || 0) < 3) return { ok: false, msg: '同じルーンが 3 つ必要' };
    const cost = runeCombineGold(r.tier);
    if (!this.game.spendGold(cost)) return { ok: false, msg: `ゴールドが足りない（${cost} G）` };
    this.inv.runes[id] -= 3;
    if (!this.inv.runes[id]) delete this.inv.runes[id];
    this.inv.runes[next.id] = (this.inv.runes[next.id] || 0) + 1;
    this.changed();
    return { ok: true, id: next.id, cost };
  }

  // ---------------- ソケット
  /** はめられるか。理由（文字列）か null */
  socketProblem(item, index, key) {
    if (!item) return '装備が見つからない';
    if (!item.sockets || index < 0 || index >= item.sockets.length) return 'ソケットが無い';
    if (item.sockets[index]) return 'もう埋まっている';
    const s = parseSocket(key);
    if (!s) return 'はめられない物';
    if (s.type === 'gem' && !(this.inv.gems[key] > 0)) return '持っていない';
    if (s.type === 'rune') {
      if (!(this.inv.runes[s.id] > 0)) return '持っていない';
      if (item.rw) return 'ルーン語の装備にははめられない';
    }
    if (s.type === 'lgem') {
      const lg = this.inv.lgems[s.id];
      if (!lg) return '持っていない';
      if (lg.uid) return 'ほかの装備にはまっている';
      if (socketKind(item.slot) !== 'jewelry') return '深淵の宝石は首飾り・指輪にだけはめられる';
    }
    return null;
  }

  socket(uid, index, key) {
    const f = this.game.sys.inv.findItem(uid);
    const item = f?.item;
    if (index === null || index === undefined) index = item?.sockets?.findIndex((x) => !x) ?? -1;
    const prob = this.socketProblem(item, index, key);
    if (prob) return { ok: false, msg: prob };
    const s = parseSocket(key);
    if (s.type === 'gem') { this.inv.gems[key]--; if (!this.inv.gems[key]) delete this.inv.gems[key]; }
    if (s.type === 'rune') { this.inv.runes[s.id]--; if (!this.inv.runes[s.id]) delete this.inv.runes[s.id]; }
    if (s.type === 'lgem') { const lg = this.inv.lgems[s.id]; lg.uid = item.uid; item.lgl ||= {}; item.lgl[s.id] = lg.lvl; }
    item.sockets[index] = s.type === 'rune' ? `r:${s.id}` : s.type === 'lgem' ? `lg:${s.id}` : key;
    const rw = this.checkRuneword(item);
    this.changed(f.where === 'equip');
    return { ok: true, runeword: rw };
  }

  unsocket(uid, index) {
    const f = this.game.sys.inv.findItem(uid);
    const item = f?.item;
    if (!item?.sockets?.[index]) return { ok: false, msg: '何もはまっていない' };
    if (item.rw) return { ok: false, msg: 'ルーン語にしたルーンは外せない' };
    this.takeOut(item, index, this.inv);
    this.changed(f.where === 'equip');
    return { ok: true };
  }

  /** ソケット 1 つの中身を持ち物に戻す */
  takeOut(item, index) {
    const key = item.sockets[index];
    const s = parseSocket(key);
    item.sockets[index] = null;
    if (!s) return;
    if (s.type === 'gem') this.inv.gems[key] = (this.inv.gems[key] || 0) + 1;
    else if (s.type === 'rune') this.inv.runes[s.id] = (this.inv.runes[s.id] || 0) + 1;
    else if (s.type === 'lgem') { const lg = this.inv.lgems[s.id]; if (lg) lg.uid = null; if (item.lgl) delete item.lgl[s.id]; }
  }

  /** 分解・売却する装備の宝石・ルーン・深淵の宝石を持ち物に戻す */
  returnSockets(item) {
    if (!item.sockets?.length) return;
    if (item.rw) { this.releaseLgems(item); return; }
    for (let i = 0; i < item.sockets.length; i++) if (item.sockets[i]) this.takeOut(item, i);
  }
  releaseLgems(item) {
    for (let i = 0; i < (item.sockets || []).length; i++) { const s = parseSocket(item.sockets[i]); if (s?.type === 'lgem') this.takeOut(item, i); }
  }

  /** ルーン語の判定。できたらルーン語の id を返す */
  checkRuneword(item) {
    if (item.rw || item.rarity !== 'common' || item.affixes?.length || !item.sockets?.length) return null;
    const seq = [];
    for (const k of item.sockets) { const s = parseSocket(k); if (!s || s.type !== 'rune') return null; seq.push(s.id); }
    const rw = RUNEWORDS.find((w) => w.runes.length === seq.length && w.runes.every((r, i) => r === seq[i]) && w.slots.includes(item.slot));
    if (!rw) return null;
    const rng = this.game.rng;
    item.rw = rw.id;
    item.rarity = 'unique';
    const [a, b] = rw.power.r;
    item.power = { id: rw.power.id, r: Math.round((a + (b - a) * rng.next()) * 1000) / 1000 };
    item.isNew = true;
    this.game.state.meta.collection.runewords ||= {};
    this.game.state.meta.collection.runewords[rw.id] = (this.game.state.meta.collection.runewords[rw.id] || 0) + 1;
    this.game.events.emit('runeword', { item, rw });
    return rw.id;
  }

  /** ルーン語の途中か（はまっているルーンの並びが、どれかのルーン語の頭と一致） */
  runewordProgress(item) {
    if (!item?.sockets?.length || item.rarity !== 'common' || item.affixes?.length) return [];
    const seq = [];
    for (const k of item.sockets) { if (!k) break; const s = parseSocket(k); if (s?.type !== 'rune') return []; seq.push(s.id); }
    return RUNEWORDS.filter((w) => w.slots.includes(item.slot) && w.runes.length === item.sockets.length && seq.every((r, i) => w.runes[i] === r));
  }

  /**
   * 宝石を 1 つ渡す（種類はランダム、段階は tier。日課の宝箱などの報酬）。
   * 戻り値: { id（持ち物のキー '<種類>_<段階>'）, type, tier, name, color }
   */
  grantRandom(tier = 1, type = null) {
    const t = Math.max(1, Math.min(GEM_TIERS, Math.round(Number(tier) || 1)));
    const g = (type && GEM[type]) || this.game.rng.pick(GEMS);
    const key = gemKey(g.id, t);
    this.inv.gems[key] = (this.inv.gems[key] || 0) + 1;
    this.changed();
    return { id: key, key, type: g.id, tier: t, name: gemName(g.id, t), color: g.color };
  }

  // ---------------- 深淵の宝石
  ownedLegendaryGems() { return LEGENDARY_GEMS.filter((g) => this.inv.lgems[g.id]).map((g) => ({ ...g, lvl: this.inv.lgems[g.id].lvl, uid: this.inv.lgems[g.id].uid })); }
  lgemLevel(id) { return this.inv.lgems[id]?.lvl || 0; }
  setLgemTarget(id) { if (!id || this.inv.lgems[id]) { this.inv.lgemTarget = id; this.changed(); return true; } return false; }

  /** まだ持っていない深淵の宝石を 1 つ（id 指定も可）。全部あれば null */
  grantLegendaryGem(id = null) {
    const missing = LEGENDARY_GEMS.filter((g) => !this.inv.lgems[g.id]);
    const g = id ? LEGENDARY_GEM[id] : this.game.rng.pick(missing);
    if (!g || this.inv.lgems[g.id]) return null;
    this.inv.lgems[g.id] = { lvl: 1, uid: null };
    if (!this.inv.lgemTarget) this.inv.lgemTarget = g.id;
    this.game.events.emit('lgemFound', { gem: g });
    this.changed();
    return g.id;
  }

  /** 強化の対象（選んだ物、無ければ一番レベルの低い物） */
  lgemTargetId() {
    const t = this.inv.lgemTarget;
    if (t && this.inv.lgems[t] && this.inv.lgems[t].lvl < LGEM_MAX_LEVEL) return t;
    const owned = this.ownedLegendaryGems().filter((g) => g.lvl < LGEM_MAX_LEVEL).sort((a, b) => a.lvl - b.lvl);
    return owned[0]?.id || null;
  }

  /**
   * 深淵の裂け目を踏破した（ワールド担当が呼ぶ）。level = 裂け目の段階、timeLeftRatio = 残り時間の割合（0..1）。
   * 強化の回数: 1 回 + 時間内なら 1 回 + 残り 50% 以上なら 1 回。持っていない深淵の宝石が 25% で手に入る（最初の 1 つは確定）。
   * 戻り値: { gem, from, to, tries: [{ chance, ok }], found }
   */
  onRiftComplete(level, timeLeftRatio = 0) {
    const rng = this.game.rng;
    const rep = { level, gem: null, from: 0, to: 0, tries: [], found: null };
    const owned = Object.keys(this.inv.lgems).length;
    if (owned === 0 || (owned < LEGENDARY_GEMS.length && rng.chance(0.25))) rep.found = this.grantLegendaryGem();
    const id = this.lgemTargetId();
    if (id) {
      const lg = this.inv.lgems[id];
      rep.gem = id; rep.from = lg.lvl;
      const tries = 1 + (timeLeftRatio > 0 ? 1 : 0) + (timeLeftRatio >= 0.5 ? 1 : 0);
      for (let i = 0; i < tries && lg.lvl < LGEM_MAX_LEVEL; i++) {
        const chance = lgemUpgradeChance(level, lg.lvl);
        const ok = rng.chance(chance / 100);
        rep.tries.push({ chance, ok });
        if (ok) { lg.lvl++; this.game.state.meta.stats.riftGemUps++; }
      }
      rep.to = lg.lvl;
      this.syncLgem(id);
    }
    this.game.events.emit('lgemUpgrade', rep);
    this.changed(true);
    return rep;
  }

  /** はまっている装備にレベルを写す */
  syncLgem(id) {
    const lg = this.inv.lgems[id];
    if (!lg?.uid) return;
    const f = this.game.sys.inv.findItem(lg.uid);
    if (f?.item) { f.item.lgl ||= {}; f.item.lgl[id] = lg.lvl; } else lg.uid = null;
  }

  onLoad() {
    // つながりを装備のソケットから作り直す（壊れたセーブで uid が振り直された・はまっているはずの装備が無い）
    const st = this.game.state;
    // 壊れたセーブ: 深淵の宝石の記録が数や true になっていることがある（{ lvl, uid } に直す）
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(this.inv.lgems)) this.inv.lgems = {};
    for (const id of Object.keys(this.inv.lgems)) {
      const lg = this.inv.lgems[id];
      if (!isObj(lg)) this.inv.lgems[id] = { lvl: Math.max(1, Math.floor(Number(lg) || 1)), uid: null };
      else if (!(lg.lvl >= 1)) lg.lvl = 1;
    }
    const items = [...st.inv.bag, ...st.inv.stash.flat(), ...Object.values(st.hero.equip || {})].filter(isObj);
    const holder = {};
    for (const it of items) {
      if (it.lgl !== undefined && !isObj(it.lgl)) delete it.lgl;
      (Array.isArray(it.sockets) ? it.sockets : []).forEach((key, i) => {
        const s = parseSocket(key);
        if (s?.type !== 'lgem') return;
        // 持ち物の記録が無い（消えた）宝石は、はまっている物から戻す。同じ宝石が 2 か所にあれば後の方は外す（1 種 1 つ）
        if (!this.inv.lgems[s.id]) this.inv.lgems[s.id] = { lvl: Math.max(1, Math.floor(it.lgl?.[s.id] || 1)), uid: null };
        if (!holder[s.id]) holder[s.id] = it; else it.sockets[i] = null;
      });
    }
    for (const it of items) {
      if (!it?.lgl) continue;
      for (const id of Object.keys(it.lgl)) if (holder[id] !== it) delete it.lgl[id];
    }
    for (const id in this.inv.lgems) {
      this.inv.lgems[id].uid = holder[id]?.uid ?? null;
      this.syncLgem(id);
    }
  }

  changed(gear = false) {
    if (gear) this.game.onGearChanged(); else this.game.events.emit('invChanged', {});
  }
}
