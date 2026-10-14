// スキルの習得・強化・並び（スキルバー）・ルーン・自動使用の条件・熟練度・補助の刻印。
//
// 外から:
//   game.sys.skills.levelUp(id) / setBar(index, id) / moveBar(index, dir) / swapBar(i, j) / setRune(id, runeId) / setAuto(id, { cond, on })
//   autoArrange() … おまかせ編成（hero.autoBar が ON なら、覚えたとき・レベルが上がったときに自動で並べる）
//   reset() / resetCost() … スキルポイントの振り直し
//   mastery(id) → { level, xp, next, pct }  熟練度
//   glyphs: addGlyph(g) / rollGlyphDrop(unit) / socket(skillId, slot, uid) / unsocket(skillId, slot) / fuse(targetUid, sourceUid) / fuseAll() / openSockets()
// セーブ（ensureState で用意）:
//   hero.skills[id] = { lvl, rune, supports: [{ uid, id, lvl, xp } | null ×3], mxp }
//   hero.autoBar（おまかせ編成）, hero.autoSkill（ポイント自動）, hero.masteryRates（放置中の熟練度の伸び）
//   inv.glyphs = [{ uid, id, lvl, xp }], inv.glyphAutoFuse, inv.nextGlyphUid
// 出来事: 'skillLearned' { id }, 'masteryUp' { id, level }, 'glyphFound' { glyph, fused }, 'skillsChanged'

import { SKILL, skillsOf, SKILL_MAX_LEVEL, RUNE_LEVELS, MASTERY_XP, MASTERY_MAX } from '../../data/skills.js';
import { SUPPORTS, SUPPORT, supportFits, glyphXpFor, glyphLevelOf, SUPPORT_MAX_LEVEL } from '../../data/supports.js';
import { CLASS } from '../../data/classes.js';
import { PG } from '../../data/balance.js';
import { gameHooks } from '../game.js';
import { resolveSkill, estimateBuildDps, estimateDpsP, masteryLevel } from '../skills.js';
import { computeHero } from '../character.js';
import { GLYPH_DROP } from '../content/combat/glyphs.js';

export const BAR_SIZE = 5; // 基本攻撃 + 4（転生で増やせる）
/** 刻印の穴が開く主人公のレベル */
export const SOCKET_LEVELS = [10, 30, 60];
/** 自動で使う条件の選択肢 */
export const AUTO_CONDS = [
  ['always', 'いつでも'], ['pack3', '敵が 3 体以上'], ['pack5', '敵が 5 体以上'], ['elite', 'エリート・ボス・大群'], ['boss', 'ボスだけ'], ['lowlife', 'ライフ 50% 以下'], ['highres', 'リソース 70% 以上'],
];
export const SKILL_RESET_FREE_LEVEL = 20;

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // 補助の刻印のドロップ（すべての Game で共通のフック。渡された game の sys を使う）
  gameHooks.rewardMods.push((game, unit, reward) => {
    const sys = game.sys?.skills;
    if (!sys?.rollGlyphDrop) return;
    const g = sys.rollGlyphDrop(unit);
    if (!g) return;
    reward.glyphs = [...(reward.glyphs || []), g];
    sys.addGlyph(g);
    game.combat.emit({ t: 'glyph', x: unit.x, y: unit.y, id: g.id, lvl: g.lvl, name: SUPPORT[g.id]?.name });
  });
}

export class SkillSystem {
  constructor(game) {
    this.game = game;
    this.id = 'skills';
    this.rateCur = { t: 0, xp: {} };
    this.rateBuckets = [];
    installHooks();
    game.events.on('levelUp', () => this.onLevel());
    game.events.on('offlineReport', (rep) => this.onOffline(rep));
  }
  get hero() { return this.game.state.hero; }
  get inv() { return this.game.state.inv; }

  barSize() { return BAR_SIZE + (this.game.state.meta.unlocks.extraSkillSlot || 0); }

  /** セーブの形をそろえる（新しいゲーム・読み込みのとき Game が呼ぶ） */
  ensureState(state) {
    const h = state.hero;
    h.skills ||= {};
    for (const id of Object.keys(h.skills)) {
      const sk = h.skills[id];
      if (!SKILL[id] || !sk || typeof sk !== 'object' || Array.isArray(sk)) { delete h.skills[id]; continue; }
      sk.lvl = Math.max(0, Math.min(SKILL_MAX_LEVEL, Math.floor(sk.lvl || 0)));
      sk.rune ??= null;
      if (sk.rune && !SKILL[id].runes?.some((r) => r.id === sk.rune)) sk.rune = null;
      if (!Array.isArray(sk.supports)) sk.supports = [];
      sk.supports = [0, 1, 2].map((i) => (sk.supports[i] && (sk.supports[i].id || sk.supports[i].mod) ? sk.supports[i] : null));
      sk.mxp = Number(sk.mxp) || 0;
    }
    h.bar = Array.isArray(h.bar) ? h.bar : [];
    h.autocast ||= {};
    h.autoBar ??= true;
    h.autoSkill ??= false;
    h.masteryRates ||= {};
    h.skillResets ||= 0;
    const inv = state.inv;
    inv.glyphs = Array.isArray(inv.glyphs) ? inv.glyphs.filter((g) => g && SUPPORT[g.id]) : [];
    inv.glyphAutoFuse ??= true;
    let maxUid = inv.nextGlyphUid || 1;
    const scan = (g) => { if (g?.uid >= maxUid) maxUid = g.uid + 1; };
    inv.glyphs.forEach(scan);
    for (const sk of Object.values(h.skills)) sk.supports.forEach(scan);
    inv.nextGlyphUid = maxUid;
    for (const g of inv.glyphs) this.normGlyph(g);
    for (const sk of Object.values(h.skills)) for (const g of sk.supports) if (g && g.id) { if (!g.uid) g.uid = inv.nextGlyphUid++; this.normGlyph(g); }
  }

  normGlyph(g) {
    g.xp = Math.max(0, Math.min(glyphXpFor(SUPPORT_MAX_LEVEL), Number(g.xp ?? glyphXpFor(g.lvl || 1)) || 0));
    g.lvl = glyphLevelOf(g.xp);
    return g;
  }

  onNewGame() {
    const h = this.hero;
    const cls = CLASS[h.cls];
    h.skills = {};
    h.bar = [];
    for (const id of cls.startSkills) { h.skills[id] = this.blank(1); h.bar.push(id); }
    this.learnUnlocked(true);
  }

  onLoad() {
    // 壊れたセーブの修復
    const h = this.hero;
    h.bar = (h.bar || []).filter((id) => !id || (SKILL[id] && h.skills[id]));
    while (h.bar.length && !h.bar[h.bar.length - 1]) h.bar.pop();
    if (!h.bar.filter(Boolean).length) { const cls = CLASS[h.cls]; for (const id of cls.startSkills) { h.skills[id] ||= this.blank(1); if (!h.bar.includes(id)) h.bar.push(id); } }
    this.learnUnlocked(true);
  }

  blank(lvl = 1) { return { lvl, rune: null, supports: [null, null, null], mxp: 0 }; }

  /** 解放レベルに達したスキルを Lv1 で覚える（ポイントは使わない） */
  learnUnlocked(quiet = false) {
    const h = this.hero;
    const got = [];
    for (const s of skillsOf(h.cls)) {
      if (s.unlock > h.level || h.skills[s.id]?.lvl > 0) continue;
      h.skills[s.id] = { ...this.blank(1), ...(h.skills[s.id] || {}), lvl: 1 };
      got.push(s.id);
    }
    if (!got.length) return got;
    if (h.autoBar) this.autoArrange(true);
    else for (const id of got) if (!SKILL[id].basic && h.bar.filter(Boolean).length < this.barSize() && !h.bar.includes(id)) { const i = h.bar.indexOf(null); if (i >= 0) h.bar[i] = id; else h.bar.push(id); }
    for (const id of got) this.game.events.emit('skillLearned', { id, quiet });
    if (!quiet) this.game.onSkillsChanged();
    return got;
  }

  onLevel() {
    this.learnUnlocked();
    if (this.hero.autoSkill) this.autoSpend();
    else if (this.hero.autoBar) { this.autoArrange(); }
  }

  /** 習得できるスキル（解放レベルに達したもの） */
  available() { return skillsOf(this.hero.cls).filter((s) => s.unlock <= this.hero.level); }

  /** そのスキルのレベルの上限（主人公のレベルの半分 + 2、最大 20） */
  levelCap() { return Math.min(SKILL_MAX_LEVEL, Math.floor(this.hero.level / 2) + 2); }

  canLevel(id) {
    const s = SKILL[id];
    const h = this.hero;
    if (!s || s.cls !== h.cls || s.unlock > h.level) return false;
    const cur = h.skills[id]?.lvl || 0;
    if (cur >= SKILL_MAX_LEVEL) return false;
    if (cur >= this.levelCap()) return false;
    return h.skillPoints > 0;
  }

  levelUp(id, { quiet = false } = {}) {
    if (!this.canLevel(id)) return false;
    const h = this.hero;
    h.skills[id] ||= this.blank(0);
    h.skills[id].lvl++;
    h.skillPoints--;
    if (h.skills[id].lvl === 1 && !h.bar.includes(id) && h.bar.filter(Boolean).length < this.barSize() && !SKILL[id].basic) h.bar.push(id);
    if (!quiet) this.game.onSkillsChanged();
    return true;
  }

  /** ポイントを自動で振る（並びにあるスキルの低い物から） */
  autoSpend() {
    const h = this.hero;
    let n = 0;
    while (h.skillPoints > 0 && n < 500) {
      const pool = [...h.bar.filter(Boolean), ...Object.keys(h.skills)].filter((id, i, a) => a.indexOf(id) === i && this.canLevel(id));
      if (!pool.length) break;
      const inBar = pool.filter((id) => h.bar.includes(id));
      const list = inBar.length ? inBar : pool;
      list.sort((a, b) => (h.skills[a]?.lvl || 0) - (h.skills[b]?.lvl || 0) || h.bar.indexOf(a) - h.bar.indexOf(b));
      this.levelUp(list[0], { quiet: true });
      n++;
    }
    if (h.autoBar) this.autoArrange(true);
    if (n) this.game.onSkillsChanged();
    return n;
  }

  setAutoSpend(v) { this.hero.autoSkill = !!v; if (v) this.autoSpend(); this.game.events.emit('skillsChanged', {}); }
  setAutoBar(v) { this.hero.autoBar = !!v; if (v) this.autoArrange(); else this.game.events.emit('skillsChanged', {}); }

  // ---------------- 並び
  setBar(index, id, { manual = true } = {}) {
    const h = this.hero;
    if (index < 0 || index >= this.barSize()) return false;
    if (id && !h.skills[id]?.lvl) return false;
    const bar = h.bar.slice();
    while (bar.length <= index) bar.push(null);
    const prev = id ? bar.indexOf(id) : -1;
    if (id && prev >= 0) bar[prev] = bar[index];
    bar[index] = id || null;
    while (bar.length && !bar[bar.length - 1]) bar.pop();
    h.bar = bar;
    if (manual) h.autoBar = false;
    this.game.onSkillsChanged();
    return true;
  }

  swapBar(i, j) {
    const h = this.hero;
    const n = this.barSize();
    if (i < 0 || j < 0 || i >= n || j >= n || i === j) return false;
    const bar = h.bar.slice();
    while (bar.length < n) bar.push(null);
    [bar[i], bar[j]] = [bar[j], bar[i]];
    while (bar.length && !bar[bar.length - 1]) bar.pop();
    h.bar = bar;
    h.autoBar = false;
    this.game.onSkillsChanged();
    return true;
  }

  moveBar(index, dir) { return this.swapBar(index, index + dir); }

  /** 並びに入れる（空きか、最後の枠と入れ替え） */
  addToBar(id) {
    const h = this.hero;
    if (h.bar.includes(id)) return true;
    const n = this.barSize();
    let idx = -1;
    for (let i = 0; i < n; i++) if (!h.bar[i]) { idx = i; break; }
    if (idx < 0) idx = n - 1;
    return this.setBar(idx, id);
  }

  /**
   * おまかせ編成: 基本攻撃は単体の火力が一番高い物、残りの枠は「並び全体の目安の火力」が一番上がる物から順に入れる。
   * 奥義はあれば必ず入れる。並びの順（左ほど先に使う）: 奥義 → 召喚 → 強化・障壁 → 呪い → 火力の高い技
   */
  autoArrange(quiet = false) {
    const g = this.game;
    const st = g.state;
    const h = st.hero;
    let H = g.combat?.H;
    if (!H || H.cls !== h.cls || H.level !== h.level) H = computeHero(st, g);
    const learned = skillsOf(h.cls).filter((s) => h.skills[s.id]?.lvl > 0);
    const basics = learned.filter((s) => s.basic);
    const others = learned.filter((s) => !s.basic);
    const dpsOf = (id) => { const p = resolveSkill(st, H, id); return p ? estimateDpsP(H, p) : 0; };
    const basic = basics.sort((a, b) => dpsOf(b.id) - dpsOf(a.id))[0]?.id || null;
    const slots = this.barSize() - 1;
    const melee = CLASS[h.cls]?.range === 'melee';
    const pick = [];
    const ult = others.find((s) => s.kind === 'ult');
    if (ult) pick.push(ult.id);
    const score = (ids) => {
      const bar = [basic, ...ids].filter(Boolean);
      let v = estimateBuildDps(st, H, { bar });
      let mobility = false;
      for (const id of ids) {
        const k = SKILL[id];
        if (k.behavior === 'barrier' || (k.kind === 'buff' && !k.buff?.mods?.some((m) => m.s === 'inc_dmg' || m.s === 'attack_speed'))) v *= 1.12;
        if (k.behavior === 'leap' || k.behavior === 'dash') mobility = true;
      }
      // 近接のクラスは、間合いを詰める技（跳躍・突進）が 1 つあると群れに早く届く
      if (melee && mobility) v *= 1.3;
      return v;
    };
    while (pick.length < slots) {
      let best = null; let bv = -1;
      for (const s of others) {
        if (pick.includes(s.id)) continue;
        const v = score([...pick, s.id]);
        if (v > bv) { bv = v; best = s.id; }
      }
      if (!best) break;
      pick.push(best);
    }
    const ORDER = { ult: 0, summon: 1, buff: 2 };
    const rank = (id) => {
      const k = SKILL[id];
      if (k.behavior === 'curse') return 3;
      if (k.behavior === 'turret' || k.behavior === 'orbit' || k.behavior === 'aura') return 3.5;
      return ORDER[k.kind] ?? 4;
    };
    const dps = Object.fromEntries(pick.map((id) => [id, dpsOf(id)]));
    pick.sort((a, b) => rank(a) - rank(b) || dps[b] - dps[a]);
    const bar = [basic, ...pick].filter(Boolean);
    const changed = bar.join() !== h.bar.join();
    h.bar = bar;
    if (changed && !quiet) g.onSkillsChanged();
    else if (changed) { g.combat?.recalc?.(); }
    return bar;
  }

  setRune(id, runeId) {
    const sk = this.hero.skills[id];
    const def = SKILL[id];
    if (!sk || !def) return false;
    if (runeId && !def.runes?.some((r) => r.id === runeId)) return false;
    if (runeId && !this.runeUnlocked(id, runeId)) return false;
    sk.rune = runeId || null;
    this.game.onSkillsChanged();
    return true;
  }

  /** ルーンはスキルレベル 3 / 6 / 10 / 15 で順に解放 */
  runeUnlocked(id, runeId) {
    const def = SKILL[id];
    const i = def?.runes?.findIndex((r) => r.id === runeId) ?? -1;
    return (this.hero.skills[id]?.lvl || 0) >= this.runeLevel(i);
  }
  runeLevel(i) { return RUNE_LEVELS[i] ?? 99; }

  setAuto(id, o) {
    this.hero.autocast[id] = { ...(this.hero.autocast[id] || {}), ...o };
    this.game.onSkillsChanged();
  }

  resetCost() {
    const h = this.hero;
    const pts = this.spentPoints();
    if (h.level < SKILL_RESET_FREE_LEVEL || pts <= 0) return 0;
    return Math.round(8 * PG(h.level) * pts);
  }

  spentPoints() { let pts = 0; for (const id in this.hero.skills) pts += Math.max(0, (this.hero.skills[id].lvl || 0) - 1); return pts; }

  /** 振り直し（Lv20 からはお金がかかる）。覚えたスキルは Lv1 に戻る */
  reset() {
    const h = this.hero;
    const cost = this.resetCost();
    if (cost > 0 && !this.game.spendGold(cost)) return false;
    h.skillPoints += this.spentPoints();
    for (const id in h.skills) {
      if (SKILL[id].unlock <= h.level) { h.skills[id].lvl = 1; if (h.skills[id].rune && !this.runeUnlocked(id, h.skills[id].rune)) h.skills[id].rune = null; } else delete h.skills[id];
    }
    h.bar = h.bar.filter((id) => h.skills[id]);
    h.skillResets++;
    this.game.onSkillsChanged();
    return true;
  }

  // ---------------- 熟練度
  mastery(id) {
    const xp = this.hero.skills[id]?.mxp || 0;
    const level = masteryLevel(xp);
    const cur = MASTERY_XP[level]; const next = MASTERY_XP[level + 1];
    return { level, xp, cur, next: next ?? null, pct: next ? (xp - cur) / (next - cur) : 1, max: level >= MASTERY_MAX };
  }

  /** 1 回使ったときの熟練度の経験: 待ち時間（最大 60 秒）+ 動作の長さ。基本攻撃は 1 回 1 ほど */
  castXp(p) { return (Math.max(1, Math.min(60, p.baseCd || 0)) + (p.castTime || 0.5)) * (1 + (this.game.H?.masteryXp || 0) / 100); }

  recordCast(p) {
    const sk = this.hero.skills[p.id];
    if (!sk) return;
    const xp = this.castXp(p);
    this.rateCur.xp[p.id] = (this.rateCur.xp[p.id] || 0) + xp;
    this.addMastery(p.id, xp);
  }

  addMastery(id, xp, { quiet = false } = {}) {
    const sk = this.hero.skills[id];
    if (!sk || !(xp > 0)) return false;
    const before = masteryLevel(sk.mxp);
    sk.mxp = Math.min(MASTERY_XP[MASTERY_MAX], (sk.mxp || 0) + xp);
    const after = masteryLevel(sk.mxp);
    if (after > before) {
      if (!quiet) this.game.combat.emit({ t: 'mastery', skill: id, level: after });
      this.game.events.emit('masteryUp', { id, level: after, quiet });
      this.game.combat.recalc();
      this.game.events.emit('skillsChanged', {});
      return true;
    }
    return false;
  }

  tick(dt) {
    this.rateCur.t += dt;
    if (this.rateCur.t >= 10) {
      this.rateBuckets.push(this.rateCur);
      if (this.rateBuckets.length > 30) this.rateBuckets.shift();
      this.rateCur = { t: 0, xp: {} };
      this.hero.masteryRates = this.masteryRates();
    }
  }

  /** 1 秒あたりの熟練度の伸び（直近 5 分の平均） */
  masteryRates() {
    const all = [...this.rateBuckets, this.rateCur];
    const t = all.reduce((s, b) => s + b.t, 0);
    if (t < 30) return this.hero.masteryRates && Object.keys(this.hero.masteryRates).length ? this.hero.masteryRates : this.fallbackRates();
    const out = {};
    for (const b of all) for (const id in b.xp) out[id] = (out[id] || 0) + b.xp[id];
    for (const id in out) out[id] = Math.round((out[id] / t) * 1000) / 1000;
    return out;
  }

  fallbackRates() {
    const out = {};
    for (const id of this.hero.bar) if (id && SKILL[id]) out[id] = SKILL[id].basic ? 0.8 : 0.5;
    return out;
  }

  /** 放置（オフライン）していた分の熟練度と刻印 */
  onOffline(rep) {
    if (!rep) return;
    const sec = (rep.capped || 0) * (rep.eff || 1);
    const rates = this.masteryRates();
    const ups = [];
    for (const id in rates) { if (this.addMastery(id, rates[id] * sec, { quiet: true })) ups.push(id); }
    // 刻印: 倒した数から（普通の敵の確率）
    const n0 = (rep.kills || 0) * GLYPH_DROP.normal * (1 + (this.game.H?.glyphFind || 0) / 100) * 1.3;
    let n = Math.floor(n0) + (this.game.rng.chance(n0 % 1) ? 1 : 0);
    n = Math.min(n, 200);
    const got = [];
    for (let i = 0; i < n; i++) { const g = this.makeGlyph({ level: rep.level || this.game.sys.world.level() }); this.addGlyph(g, { quiet: true }); got.push(g.id); }
    rep.mastery = ups;
    rep.glyphs = got.length;
    if (got.length || ups.length) this.game.events.emit('offlineSkills', { glyphs: got.length, mastery: ups });
  }

  // ---------------- 補助の刻印
  /** 開いている刻印の穴の数（主人公 Lv 10 / 30 / 60） */
  openSockets() { return SOCKET_LEVELS.filter((l) => this.hero.level >= l).length; }

  /** 刻印を 1 つ作る。level はエリアレベル（高いほど高いレベルで落ちる） */
  makeGlyph({ level = 1, id = null } = {}) {
    const rng = this.game.rng;
    let sup = id ? SUPPORT[id] : null;
    if (!sup) {
      // 60% は今の並びのスキルにはめられる物から
      const bar = this.hero.bar.filter(Boolean).map((x) => SKILL[x]).filter(Boolean);
      const fits = SUPPORTS.filter((s) => bar.some((d) => supportFits(s, d)));
      sup = (fits.length && rng.chance(0.6)) ? rng.pick(fits) : rng.pick(SUPPORTS);
    }
    const top = Math.max(1, Math.min(10, 1 + Math.floor(level / 20)));
    const lvl = Math.max(1, Math.min(top, 1 + Math.floor(rng.next() ** 1.6 * top)));
    return { uid: 0, id: sup.id, lvl, xp: glyphXpFor(lvl) };
  }

  /** 倒した敵から刻印が落ちるか（gameHooks.rewardMods から） */
  rollGlyphDrop(unit) {
    const base = GLYPH_DROP[unit.rank] ?? (unit.boss ? GLYPH_DROP.boss : GLYPH_DROP.normal);
    const ch = base * (unit.lootMul || 1) * (1 + (this.game.H?.glyphFind || 0) / 100);
    if (!this.game.rng.chance(Math.min(1, ch))) return null;
    return this.makeGlyph({ level: unit.level || 1 });
  }

  /** 刻印を持ち物に入れる。自動の合成が ON なら、はめていない同じ刻印に合成する */
  addGlyph(g, { quiet = false } = {}) {
    const inv = this.inv;
    g.uid ||= inv.nextGlyphUid++;
    this.normGlyph(g);
    let fused = null;
    if (inv.glyphAutoFuse) {
      const same = inv.glyphs.filter((x) => x.id === g.id && x.lvl < SUPPORT_MAX_LEVEL).sort((a, b) => b.xp - a.xp)[0];
      if (same) { this.feed(same, g); fused = same; }
    }
    if (!fused) inv.glyphs.push(g);
    this.game.events.emit('glyphFound', { glyph: fused || g, fused: !!fused, quiet });
    return fused || g;
  }

  feed(target, src) {
    target.xp = Math.min(glyphXpFor(SUPPORT_MAX_LEVEL), target.xp + (src.xp || 0) + 1);
    target.lvl = glyphLevelOf(target.xp);
  }

  findGlyph(uid) {
    const i = this.inv.glyphs.findIndex((g) => g.uid === uid);
    if (i >= 0) return { g: this.inv.glyphs[i], where: 'inv', i };
    for (const [sid, sk] of Object.entries(this.hero.skills)) {
      const j = sk.supports.findIndex((g) => g?.uid === uid);
      if (j >= 0) return { g: sk.supports[j], where: 'skill', skill: sid, slot: j };
    }
    return null;
  }

  /** はめられない理由（はめられるなら null） */
  socketProblem(skillId, slot, g) {
    const def = SKILL[skillId];
    const sk = this.hero.skills[skillId];
    if (!def || !sk?.lvl) return 'まだ覚えていないスキル';
    if (slot >= this.openSockets()) return `主人公 Lv ${SOCKET_LEVELS[slot]} で開く穴`;
    const sup = SUPPORT[g.id];
    if (!sup) return '知らない刻印';
    if (!supportFits(sup, def)) return 'このスキルには合わない刻印';
    if (sk.supports.some((x, i) => i !== slot && x?.id === g.id)) return '同じ刻印は 1 つのスキルに 1 つまで';
    return null;
  }

  socket(skillId, slot, uid) {
    const f = this.findGlyph(uid);
    if (!f || f.where !== 'inv') return { ok: false, msg: '見つからない' };
    const prob = this.socketProblem(skillId, slot, f.g);
    if (prob) return { ok: false, msg: prob };
    const sk = this.hero.skills[skillId];
    const old = sk.supports[slot];
    this.inv.glyphs.splice(f.i, 1);
    sk.supports[slot] = f.g;
    if (old) this.inv.glyphs.push(old);
    this.game.onSkillsChanged();
    return { ok: true };
  }

  unsocket(skillId, slot) {
    const sk = this.hero.skills[skillId];
    const g = sk?.supports?.[slot];
    if (!g) return false;
    sk.supports[slot] = null;
    if (g.id) this.inv.glyphs.push(g);
    this.game.onSkillsChanged();
    return true;
  }

  /** source を target に合成する（同じ種類だけ）。target ははめてあってもよい */
  fuse(targetUid, sourceUid) {
    if (targetUid === sourceUid) return false;
    const t = this.findGlyph(targetUid); const s = this.findGlyph(sourceUid);
    if (!t || !s || s.where !== 'inv' || t.g.id !== s.g.id) return false;
    if (t.g.lvl >= SUPPORT_MAX_LEVEL) return false;
    this.feed(t.g, s.g);
    const si = this.inv.glyphs.indexOf(s.g);
    if (si >= 0) this.inv.glyphs.splice(si, 1);
    if (t.where === 'skill') this.game.onSkillsChanged(); else this.game.events.emit('skillsChanged', {});
    return true;
  }

  /** 持ち物の同じ刻印をまとめて 1 つに合成する（はめてある物があれば、そちらに入れる） */
  fuseAll() {
    const byId = {};
    for (const g of this.inv.glyphs) (byId[g.id] ||= []).push(g);
    let n = 0;
    for (const [id, list] of Object.entries(byId)) {
      const socketed = Object.values(this.hero.skills).flatMap((sk) => sk.supports).filter((g) => g?.id === id && g.lvl < SUPPORT_MAX_LEVEL).sort((a, b) => b.xp - a.xp)[0];
      list.sort((a, b) => b.xp - a.xp);
      const target = socketed || list[0];
      for (const g of list) {
        if (g === target || target.lvl >= SUPPORT_MAX_LEVEL) continue;
        this.feed(target, g);
        this.inv.glyphs.splice(this.inv.glyphs.indexOf(g), 1);
        n++;
      }
    }
    if (n) this.game.onSkillsChanged();
    return n;
  }

  setGlyphAutoFuse(v) { this.inv.glyphAutoFuse = !!v; this.game.events.emit('skillsChanged', {}); }
}
