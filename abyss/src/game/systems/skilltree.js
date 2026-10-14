// パッシブの星座盤（約 360 の点・要の点 30・要石 12）とパラゴン（Lv100 以降・上限なし）。
//
// 外から:
//   game.sys.tree.pathTo(id) → [id...]（振ってある点から一番近い道。振れなければ null）
//   allocate(id) / deallocate(id) / respec() / respecCost() / canAllocate(id)
//   saveBuild(i) / loadBuild(i)（構成の保存 2 つ）
//   previewDelta(id, mode) → { dps, ehp, dpsPct, ehpPct, cost }（点を振ったら・外したら）
//   paragonFree() / addParagon(key, n) / autoParagon() / resetParagon()
// セーブ（ensureState で用意）:
//   hero.tree = { alloc: [id...], points（未使用の点）, respecs, builds: [{ name, alloc } | null, null], bonusGiven }
//   hero.paragon = { level, xp, alloc: { 'off.main': 点, ... } }
// 能力は registry.addHeroSource('tree') と ('paragon') で入る。

import { TREE_NODE, TREE_NODES, TREE_START, treeRespecCost, treeBonusPoints, PARAGON_LINE, PARAGON_AUTO_WEIGHT, KEYSTONE } from '../../data/tree.js';
import { CLASS } from '../../data/classes.js';
import { PG, BAL } from '../../data/balance.js';
import { registry } from '../registry.js';
import { computeHero, effectiveLife, heroPower } from '../character.js';
import { estimateBuildDps } from '../skills.js';

/** 振ってある点の能力（同じ alloc ならキャッシュ） */
const modCache = new Map();
export function treeMods(alloc) {
  const key = alloc.join(',');
  if (modCache.has(key)) return modCache.get(key);
  const out = [];
  for (const id of alloc) { const n = TREE_NODE[id]; if (n) for (const m of n.mods) out.push({ s: m.s, v: m.v }); }
  if (modCache.size > 200) modCache.clear();
  modCache.set(key, out);
  return out;
}

export function paragonMods(state) {
  const p = state.hero.paragon;
  const cls = CLASS[state.hero.cls];
  const out = [];
  for (const [key, n] of Object.entries(p?.alloc || {})) {
    const L = PARAGON_LINE[key];
    if (!L || !(n > 0)) continue;
    const pts = L.cap ? Math.min(n, L.cap) : n;
    const stats = L.stats || [L.stat === 'primary' ? cls.primary : L.stat];
    for (const s of stats) out.push({ s, v: L.per * pts });
  }
  return out;
}

registry.addHeroSource('tree', (state, game) => {
  const prev = game?.sys?.tree?.preview;
  return treeMods(prev || state.hero.tree?.alloc || []);
});
registry.addHeroSource('paragon', (state) => paragonMods(state));

export class TreeSystem {
  constructor(game) {
    this.game = game;
    this.id = 'tree';
    this.preview = null; // 比較のための仮の振り方
    game.events.on('levelUp', () => this.syncBonus());
  }
  get hero() { return this.game.state.hero; }
  get t() { return this.game.state.hero.tree; }

  ensureState(state) {
    const h = state.hero;
    h.tree ||= { alloc: [], points: 0, respecs: 0 };
    const t = h.tree;
    t.alloc = Array.isArray(t.alloc) ? t.alloc.filter((id) => TREE_NODE[id]) : [];
    t.points = Math.max(0, Math.floor(t.points || 0));
    t.respecs ||= 0;
    if (!Array.isArray(t.builds)) t.builds = [null, null];
    while (t.builds.length < 2) t.builds.push(null);
    t.bonusGiven ??= treeBonusPoints(h.level);
    const start = TREE_START[h.cls];
    // 別のクラスの出発点や、つながっていない点は外して点を返す
    if (!t.alloc.includes(start)) t.alloc.unshift(start);
    const keep = this.connected(t.alloc, start);
    const lost = t.alloc.filter((id) => !keep.has(id));
    if (lost.length) { t.points += lost.length; t.alloc = t.alloc.filter((id) => keep.has(id)); }
    for (const id of t.alloc) if (TREE_NODE[id].type === 'start' && id !== start) { t.alloc = t.alloc.filter((x) => x !== id); t.points++; }
    h.paragon ||= { level: 0, xp: 0, alloc: {} };
    h.paragon.alloc ||= {};
    for (const k of Object.keys(h.paragon.alloc)) if (!PARAGON_LINE[k]) delete h.paragon.alloc[k];
  }

  onNewGame() {
    const t = this.t;
    t.alloc = [TREE_START[this.hero.cls]];
    t.points = 0;
    t.bonusGiven = treeBonusPoints(this.hero.level);
  }

  /** 10 レベルごとの追加の点 */
  syncBonus() {
    const t = this.t;
    const want = treeBonusPoints(this.hero.level);
    if (want > (t.bonusGiven || 0)) { t.points += want - (t.bonusGiven || 0); t.bonusGiven = want; }
  }

  allocSet() { return new Set(this.t.alloc); }
  isAllocated(id) { return this.t.alloc.includes(id); }
  spent() { return Math.max(0, this.t.alloc.length - 1); }

  /** start からつながっている点の集合 */
  connected(alloc, start = TREE_START[this.hero.cls]) {
    const set = new Set(alloc);
    const seen = new Set();
    if (!set.has(start)) return seen;
    const q = [start]; seen.add(start);
    while (q.length) {
      const id = q.shift();
      for (const l of TREE_NODE[id]?.links || []) if (set.has(l) && !seen.has(l)) { seen.add(l); q.push(l); }
    }
    return seen;
  }

  /** 振ってある点から id までの最短の道（新しく振る点の並び。id を含む） */
  pathTo(id) {
    if (!TREE_NODE[id]) return null;
    const have = this.allocSet();
    if (have.has(id)) return [];
    const prev = new Map();
    const q = [];
    for (const a of have) { q.push(a); prev.set(a, null); }
    while (q.length) {
      const cur = q.shift();
      for (const l of TREE_NODE[cur].links) {
        if (prev.has(l)) continue;
        if (TREE_NODE[l].type === 'start') continue; // ほかのクラスの出発点は通れない
        prev.set(l, cur);
        if (l === id) {
          const path = [];
          let x = l;
          while (x && !have.has(x)) { path.unshift(x); x = prev.get(x); }
          return path;
        }
        q.push(l);
      }
    }
    return null;
  }

  canAllocate(id) { const p = this.pathTo(id); return !!p && p.length > 0 && p.length <= this.t.points; }

  allocate(id) {
    const p = this.pathTo(id);
    if (!p || !p.length) return { ok: false, msg: 'ここは振れない' };
    if (p.length > this.t.points) return { ok: false, msg: `点が ${p.length - this.t.points} 足りない（必要 ${p.length}）` };
    this.t.alloc.push(...p);
    this.t.points -= p.length;
    this.changed();
    return { ok: true, n: p.length };
  }

  /** id を外したときに一緒に外れる点（つながらなくなる点） */
  removalSet(id) {
    if (!this.isAllocated(id) || TREE_NODE[id]?.type === 'start') return [];
    const rest = this.t.alloc.filter((x) => x !== id);
    const keep = this.connected(rest);
    return this.t.alloc.filter((x) => !keep.has(x));
  }

  deallocCost(n) { return treeRespecCost(this.hero.level, n, PG); }

  deallocate(id) {
    const rm = this.removalSet(id);
    if (!rm.length) return { ok: false, msg: '外せない点' };
    const cost = this.deallocCost(rm.length);
    if (cost > 0 && !this.game.spendGold(cost)) return { ok: false, msg: `お金が足りない（${Math.round(cost)} G）` };
    this.t.alloc = this.t.alloc.filter((x) => !rm.includes(x));
    this.t.points += rm.length;
    this.changed();
    return { ok: true, n: rm.length, cost };
  }

  respecCost() { return this.deallocCost(this.spent()); }

  respec() {
    const n = this.spent();
    if (!n) return { ok: false, msg: '振ってある点がない' };
    const cost = this.respecCost();
    if (cost > 0 && !this.game.spendGold(cost)) return { ok: false, msg: `お金が足りない（${Math.round(cost)} G）` };
    this.t.alloc = [TREE_START[this.hero.cls]];
    this.t.points += n;
    this.t.respecs++;
    this.changed();
    return { ok: true, n, cost };
  }

  saveBuild(i, name = null) {
    if (i < 0 || i > 1) return false;
    this.t.builds[i] = { name: name || `構成 ${i + 1}`, alloc: this.t.alloc.slice(), at: Date.now() };
    this.game.events.emit('statsChanged', {});
    return true;
  }

  /** 保存した構成に振り直す（振り直しの費用がかかる。点が足りなければ道の順に途中まで） */
  loadBuild(i) {
    const b = this.t.builds[i];
    if (!b) return { ok: false, msg: '保存されていない' };
    const start = TREE_START[this.hero.cls];
    const target = b.alloc.filter((id) => TREE_NODE[id] && id !== start);
    const cur = new Set(this.t.alloc);
    const same = target.length === this.t.alloc.length - 1 && target.every((id) => cur.has(id));
    if (same) return { ok: true, n: 0 };
    const toRemove = this.t.alloc.filter((id) => id !== start && !target.includes(id)).length;
    const cost = this.deallocCost(toRemove);
    if (cost > 0 && !this.game.spendGold(cost)) return { ok: false, msg: `お金が足りない（${Math.round(cost)} G）` };
    this.t.points += this.spent();
    this.t.alloc = [start];
    // つながる順に入れる
    const want = new Set(target);
    let added = true;
    while (added && this.t.points > 0) {
      added = false;
      for (const id of target) {
        if (this.t.alloc.includes(id) || this.t.points <= 0) continue;
        if (TREE_NODE[id].links.some((l) => this.t.alloc.includes(l))) { this.t.alloc.push(id); this.t.points--; added = true; }
      }
    }
    const missing = [...want].filter((id) => !this.t.alloc.includes(id)).length;
    this.changed();
    return { ok: true, missing, cost };
  }

  changed() {
    this.game.onStatsChanged();
  }

  /** 点を振ったら（mode 'add'）・外したら（'remove'）どう変わるか。DPS と耐久と戦力 */
  previewDelta(id, mode = 'add') {
    const g = this.game;
    const st = g.state;
    let alloc;
    let n = 0;
    if (mode === 'add') { const p = this.pathTo(id); if (!p || !p.length) return null; alloc = [...this.t.alloc, ...p]; n = p.length; } else {
      const rm = this.removalSet(id); if (!rm.length) return null; alloc = this.t.alloc.filter((x) => !rm.includes(x)); n = rm.length;
    }
    const before = g.H || computeHero(st, g);
    this.preview = alloc;
    let after;
    try { after = computeHero(st, g); } finally { this.preview = null; }
    // 戦闘中のバフは入れない（両方とも同じ条件で比べる）
    const base = computeHero(st, g);
    const dB = estimateBuildDps(st, base); const dA = estimateBuildDps(st, after);
    const eB = effectiveLife(base); const eA = effectiveLife(after);
    return {
      n, alloc, dps: dA, ehp: eA, dpsPct: dB > 0 ? (dA / dB - 1) * 100 : 0, ehpPct: eB > 0 ? (eA / eB - 1) * 100 : 0,
      power: heroPower(after, st), powerBefore: heroPower(base, st), cost: mode === 'remove' ? this.deallocCost(n) : 0, before,
    };
  }

  // ---------------- パラゴン
  paragonSpent() { return Object.values(this.hero.paragon.alloc || {}).reduce((s, v) => s + (v || 0), 0); }
  paragonTotal() { return Math.floor((this.hero.paragon.level || 0) * BAL.PARAGON_POINTS_PER_LEVEL); }
  paragonFree() { return Math.max(0, this.paragonTotal() - this.paragonSpent()); }
  paragonRoom(key) { const L = PARAGON_LINE[key]; if (!L) return 0; return L.cap ? Math.max(0, L.cap - (this.hero.paragon.alloc[key] || 0)) : Infinity; }

  addParagon(key, n = 1) {
    if (!PARAGON_LINE[key]) return 0;
    const a = this.hero.paragon.alloc;
    const k = Math.max(0, Math.min(n, this.paragonFree(), this.paragonRoom(key)));
    if (!k) return 0;
    a[key] = (a[key] || 0) + k;
    this.game.onStatsChanged();
    return k;
  }

  removeParagon(key, n = 1) {
    const a = this.hero.paragon.alloc;
    const k = Math.min(n, a[key] || 0);
    if (!k) return 0;
    a[key] -= k;
    if (!a[key]) delete a[key];
    this.game.onStatsChanged();
    return k;
  }

  resetParagon() { this.hero.paragon.alloc = {}; this.game.onStatsChanged(); }

  /** おまかせ: 重み ÷ (1 + 振った点/10) が一番大きい線に 1 点ずつ */
  autoParagon() {
    const a = this.hero.paragon.alloc;
    let free = this.paragonFree();
    let n = 0;
    const keys = Object.keys(PARAGON_LINE);
    while (free > 0 && n < 100000) {
      let best = null; let bv = -1;
      for (const k of keys) {
        if (this.paragonRoom(k) <= 0) continue;
        const v = (PARAGON_AUTO_WEIGHT[k] || 0.5) / (1 + (a[k] || 0) / 10);
        if (v > bv) { bv = v; best = k; }
      }
      if (!best) break;
      // まとめて振る（同じ線が続くあいだ）
      a[best] = (a[best] || 0) + 1;
      free--; n++;
    }
    if (n) this.game.onStatsChanged();
    return n;
  }

  keystones() { return this.t.alloc.map((id) => TREE_NODE[id]).filter((n) => n?.type === 'keystone').map((n) => KEYSTONE[n.ks]); }
}

export { TREE_NODES };
