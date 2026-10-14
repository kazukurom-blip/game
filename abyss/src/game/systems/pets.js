// ペット（卵から孵す・レベル・覚醒★・連れて歩く 1 匹＋所持の効果）。担当: メタ担当。
//
// 卵: エリート・ボスから落ちる（チャンピオン 1/200 など）。対象の敵を 600 体倒すと必ず落ちる（天井。画面に出す）。
// 孵卵器（2 つ）に入れて、決まった数の敵を倒すと孵る（放置の間も進む）。
// 同じペットが出たら覚醒 ★+1（最大 5。1 つごとに効果 +20%）。5★のあとは経験値。
// 餌（ゴールド）でも経験値が入る。レベル 1〜50。
// 連れているペットは戦闘で手助けする。体は game.sys.pets.unit（combat.units の外。敵に狙われず、攻撃も当たらない）。
//
// 外から: game.sys.pets.addEgg(kind, n) / incubate(kind) / hatch(i) / hatchReady() / setActive(id) / feed(id, n) / feedCost(id)
//         ownedList() / petBonus(id) / abilityText(id) / pity()
// 状態: state.meta.pets { owned: { id: { lvl, xp, stars, at } }, active, eggs: { kind: 数 }, incubator: [{ kind, prog, need }], pity, seen: {} }
// 出来事: 'eggFound' { kind } / 'eggReady' { kind } / 'petHatched' { id, dup, stars } / 'petLevel' { id, lvl } / 'metaChanged'

import { PETS, PET, EGGS, EGG, PET_BAL, PET_RARITIES } from '../../data/pets.js';
import { BAL } from '../../data/balance.js';
import { describeMod } from '../../data/stats.js';

const ELIGIBLE = new Set(['champion', 'rare', 'boss', 'actboss', 'guardian', 'goblin']);

export class PetSystem {
  constructor(game) {
    this.game = game;
    this.id = 'pets';
    this.ver = 0;
    this.cache = null;
    this.unit = null; // 連れているペットの体（combat.units には入れない）
    this.unitPet = null;
    this.unitCombat = null;
    this.abCd = 1.5;
    this.checkT = 0;
    this.t = 0;
    game.events.on('kill', (e) => { if (this.game.state) this.onKill(e?.unit); });
  }

  get ps() { return this.game.state.meta.pets; }

  ensureState(st) {
    const p = (st.meta.pets ||= {});
    if (!p.owned || typeof p.owned !== 'object') p.owned = {};
    for (const [id, o] of Object.entries(p.owned)) {
      if (!PET[id]) { delete p.owned[id]; continue; }
      if (typeof o !== 'object' || !o) p.owned[id] = { lvl: 1, xp: 0, stars: 0, at: Date.now() };
      else { o.lvl ??= 1; o.xp ??= 0; o.stars ??= 0; }
    }
    if (p.active && !p.owned[p.active]) p.active = null;
    p.active ??= null;
    if (!p.eggs || typeof p.eggs !== 'object') p.eggs = {};
    if (!Array.isArray(p.incubator)) p.incubator = [];
    p.incubator = p.incubator.filter((x) => x && EGG[x.kind]);
    p.pity ??= 0;
    p.seen ||= {};
    p.eggsFound ??= 0;
    this.ver++;
    this.unit = null;
  }

  // ---------------- 卵
  eggMul() { return 1 + (this.game.sys.prestige?.effect?.('eggMul') || 0) / 100; }
  pity() { return { cur: this.ps.pity, max: PET_BAL.PITY }; }

  /** 倒したとき（game.events 'kill'） */
  onKill(u) {
    const ps = this.ps;
    // 孵卵器の進み
    for (const inc of ps.incubator) {
      if (inc.prog < inc.need) {
        inc.prog++;
        if (inc.prog >= inc.need) { this.game.events.emit('eggReady', { kind: inc.kind, name: EGG[inc.kind]?.name }); this.game.events.emit('metaChanged', { kind: 'pets' }); }
      }
    }
    if (!u || !ELIGIBLE.has(u.rank)) return;
    ps.pity++;
    const ch = (PET_BAL.EGG_CHANCE[u.rank] || 0) * this.eggMul();
    if (this.game.rng.chance(ch) || ps.pity >= PET_BAL.PITY) {
      const kind = this.rollEggKind(u.rank);
      ps.pity = 0;
      this.addEgg(kind, 1, { drop: true, x: u.x, y: u.y });
    }
  }

  rollEggKind(rank) {
    const odds = PET_BAL.EGG_ODDS[rank] || PET_BAL.EGG_ODDS.champion;
    const t = this.game.state.world.torment || 0;
    const pick = this.game.rng.weighted(EGGS, (e) => (odds[e.id] || 0) * (e.id === 'egg_ash' ? 1 : 1 + t * 0.08));
    return pick?.id || 'egg_ash';
  }

  addEgg(kind, n = 1, opts = {}) {
    if (!EGG[kind] || n <= 0) return false;
    const ps = this.ps;
    ps.eggs[kind] = (ps.eggs[kind] || 0) + n;
    ps.eggsFound += n;
    if (opts.drop) this.game.combat.emit({ t: 'text', x: opts.x || 0, y: opts.y || 0, z: 120, text: `${EGG[kind].name}！`, color: EGG[kind].color });
    if (!opts.quiet) this.game.events.emit('eggFound', { kind, name: EGG[kind].name, n });
    this.game.events.emit('metaChanged', { kind: 'pets' });
    if (this.game.state.meta.unlocks.autoHatch) this.autoHatch();
    return true;
  }

  eggCount() { return Object.values(this.ps.eggs).reduce((s, v) => s + (v || 0), 0); }
  freeIncubators() { return PET_BAL.INCUBATORS - this.ps.incubator.length; }

  incubate(kind) {
    const ps = this.ps;
    if (!EGG[kind] || !(ps.eggs[kind] > 0) || this.freeIncubators() <= 0) return false;
    ps.eggs[kind]--;
    if (!ps.eggs[kind]) delete ps.eggs[kind];
    ps.incubator.push({ kind, prog: 0, need: EGG[kind].hatchKills });
    this.game.events.emit('metaChanged', { kind: 'pets' });
    return true;
  }

  hatchReady() { return this.ps.incubator.filter((x) => x.prog >= x.need).length; }

  hatch(i) {
    const ps = this.ps;
    const inc = ps.incubator[i];
    if (!inc || inc.prog < inc.need) return null;
    ps.incubator.splice(i, 1);
    const egg = EGG[inc.kind];
    const rar = this.game.rng.weighted(Object.keys(egg.odds).map((r) => ({ r, w: egg.odds[r] })), (x) => x.w)?.r || 'common';
    const pool = PETS.filter((p) => p.rarity === rar);
    // 持っていない物が少し出やすい
    const def = this.game.rng.weighted(pool, (p) => (ps.owned[p.id] ? 1 : 1.6)) || PETS[0];
    const res = this.givePet(def.id);
    const rec = this.game.state.meta.record;
    if (rec) { rec.hatched = (rec.hatched || 0) + 1; if (def.rarity === 'legendary') rec.legendPet = 1; }
    this.game.events.emit('petHatched', { id: def.id, name: def.name, rarity: def.rarity, ...res });
    this.game.events.emit('metaChanged', { kind: 'pets' });
    return { id: def.id, ...res };
  }

  hatchAll() { const out = []; for (let i = this.ps.incubator.length - 1; i >= 0; i--) { const r = this.hatch(i); if (r) out.push(r); } return out; }

  autoHatch() {
    this.hatchAll();
    // 良い卵から入れる
    for (const e of [...EGGS].reverse()) while (this.freeIncubators() > 0 && this.ps.eggs[e.id] > 0) this.incubate(e.id);
  }

  givePet(id) {
    const ps = this.ps;
    const o = ps.owned[id];
    let dup = false; let stars = 0;
    if (!o) {
      ps.owned[id] = { lvl: 1, xp: 0, stars: 0, at: Date.now() };
      if (!ps.active) this.setActive(id, true);
    } else {
      dup = true;
      if (o.stars < PET_BAL.MAX_STARS) { o.stars++; stars = o.stars; } else this.addXp(id, PET_BAL.DUP_XP);
    }
    this.ver++;
    this.game.onStatsChanged();
    return { dup, stars };
  }

  // ---------------- レベル
  addXp(id, xp) {
    const o = this.ps.owned[id];
    const def = PET[id];
    if (!o || !def) return 0;
    o.xp += xp;
    let up = 0;
    while (o.lvl < PET_BAL.MAX_LEVEL && o.xp >= PET_BAL.xpToNext(o.lvl, def.rarity)) { o.xp -= PET_BAL.xpToNext(o.lvl, def.rarity); o.lvl++; up++; }
    if (o.lvl >= PET_BAL.MAX_LEVEL) o.xp = 0;
    if (up) { this.ver++; this.game.onStatsChanged(); this.game.events.emit('petLevel', { id, lvl: o.lvl, name: def.name }); }
    return up;
  }

  feedCost(id) {
    const o = this.ps.owned[id];
    if (!o) return Infinity;
    const L = Math.max(1, this.game.state.hero.level);
    return Math.round(BAL.monsterGold(L) * 40 * 1.06 ** (o.lvl - 1));
  }

  canFeed(id) { const o = this.ps.owned[id]; return !!o && o.lvl < PET_BAL.MAX_LEVEL && this.game.state.meta.gold >= this.feedCost(id); }

  feed(id, n = 1) {
    let k = 0;
    while (k < n && this.canFeed(id)) {
      if (!this.game.spendGold(this.feedCost(id))) break;
      this.addXp(id, PET_BAL.FEED_XP);
      k++;
    }
    if (k) this.game.events.emit('metaChanged', { kind: 'pets' });
    return k;
  }

  setActive(id, silent = false) {
    if (id && !this.ps.owned[id]) return false;
    this.ps.active = id || null;
    this.ver++;
    if (!silent) this.game.onStatsChanged();
    this.game.events.emit('metaChanged', { kind: 'pets' });
    return true;
  }

  ownedList() { return PETS.filter((p) => this.ps.owned[p.id]); }

  // ---------------- 効果
  petMul() { return 1 + (this.game.sys.prestige?.effect?.('petMul') || 0) / 100; }
  starMul(id) { const o = this.ps.owned[id]; const def = PET[id]; return 1 + (o?.stars || 0) * (PET_RARITIES[def?.rarity]?.starStep || 0.2); }

  /** 連れているときの効果（今のレベル・★込み） */
  activeMods(id) {
    const def = PET[id]; const o = this.ps.owned[id];
    if (!def || !o) return [];
    const k = this.starMul(id) * this.petMul();
    const acc = {};
    for (const m of def.bonus || []) acc[m.s] = (acc[m.s] || 0) + m.v;
    for (const m of def.perLevel || []) acc[m.s] = (acc[m.s] || 0) + m.v * (o.lvl - 1);
    return Object.entries(acc).map(([s, v]) => ({ s, v: Math.round(v * k * 100) / 100 }));
  }
  ownMods(id) {
    const def = PET[id];
    if (!def || !this.ps.owned[id]) return [];
    const k = this.starMul(id) * this.petMul();
    return (def.own || []).map((m) => ({ s: m.s, v: Math.round(m.v * k * 100) / 100 }));
  }

  heroMods() {
    const st = this.game.state;
    const key = `${this.ver}:${this.game.sys.prestige?.ver ?? 0}`;
    if (this.cache && this.cache.key === key && this.cache.state === st) return this.cache.mods;
    const acc = {};
    for (const id of Object.keys(this.ps.owned)) for (const m of this.ownMods(id)) acc[m.s] = (acc[m.s] || 0) + m.v;
    const out = Object.entries(acc).map(([s, v]) => ({ s, v, src: 'petOwn' }));
    if (this.ps.active) for (const m of this.activeMods(this.ps.active)) out.push({ ...m, src: 'pet' });
    this.cache = { key, state: st, mods: out };
    return out;
  }

  /** 手助けの説明（今の数値で） */
  abilityText(id) {
    const def = PET[id];
    const ab = def?.ability;
    if (!ab) return '';
    const p = this.params(def);
    const d = Math.round(p.dmgPct);
    const el = { fire: '火炎', cold: '冷気', lightning: '雷撃', poison: '毒', void: '虚無', phys: '物理' }[ab.el || 'phys'];
    switch (ab.kind) {
      case 'bolt': return `${ab.cd} 秒ごとに${ab.count > 1 ? ` ${ab.count} 発の` : ''}${el}の弾（武器ダメージの ${d}%${ab.explode ? '・周りも巻き込む' : ''}）`;
      case 'bite': return `${ab.cd} 秒ごとに飛びかかる（武器ダメージの ${d}%${ab.lifesteal ? `・与えた ${Math.round(ab.lifesteal * 100)}% を回復` : ''}${ab.crit ? `・クリティカル率 +${Math.round(ab.crit * 100)}%` : ''}）`;
      case 'nova': return `${ab.cd} 秒ごとに敵の群れへ${el}の爆発（武器ダメージの ${d}%・半径 ${ab.radius || 150}）`;
      case 'heal': return `${ab.cd} 秒ごとにライフを ${Math.round(ab.heal * this.starMul(id) * 10) / 10}% 回復${ab.burn ? `・近くの敵に武器ダメージの ${Math.round((ab.burn * p.dmgPct) / Math.max(1, ab.dmg || 1))}% の火炎` : ''}`;
      case 'loot': return `${ab.cd} 秒ごとに敵 ${ab.gold} 体ぶんのゴールドを拾う${ab.mats ? '・ときどき素材も' : ''}`;
      case 'shield': return `${ab.cd} 秒ごとに ${ab.dur} 秒間、受けるダメージ -${Math.round(ab.dr * this.starMul(id) * 10) / 10}%`;
      case 'curse': return `${ab.cd} 秒ごとに${el}の弾（武器ダメージの ${d}%）。当てた敵は 4 秒間、受けるダメージ +15%`;
      default: return '';
    }
  }

  bonusText(id) { return this.activeMods(id).map((m) => describeMod(m)).join('・'); }
  ownText(id) { return this.ownMods(id).map((m) => describeMod(m)).join('・'); }

  // ---------------- 戦闘（unitHooks.onHeroTick から毎ティック）
  params(def) {
    const ab = def.ability || {};
    const o = this.ps.owned[def.id] || { lvl: 1, stars: 0 };
    const mult = (1 + 0.03 * (o.lvl - 1)) * this.starMul(def.id) * this.petMul();
    return {
      id: 'pet', def: { id: 'pet', name: def.name }, lvl: o.lvl, behavior: 'pet', element: ab.el || 'phys', tags: ['minion'],
      dmgPct: (ab.dmg || ab.burn || 0) * mult, dmgMul: 1, cost: 0, cd: ab.cd || 4, castTime: 0.3, range: 900, radius: ab.radius || 0,
      count: ab.count || 1, speed: 760, pierce: 0, chain: 0, spread: 0.3, explode: ab.explode || 0, maxSummons: 0, summon: null,
      status: ab.status ? { ...ab.status } : null, basic: false, extra: { critBonus: ab.crit || 0 },
    };
  }

  despawn() { this.unit = null; this.unitPet = null; }

  /**
   * 連れているペットの体。combat.units には入れない（敵に狙われない・敵の範囲攻撃も当たらない）。
   * 見た目は ui/petart.js が sceneHooks.drawFx で描く。形: { id, kind: 'pet', team: 'hero', pet, art, x, y, z, face, anim, size, level }
   */
  spawn(c, h) {
    const def = PET[this.ps.active];
    if (!def) return null;
    this.unit = {
      id: -1, kind: 'pet', team: 'hero', pet: def.id, name: def.name, art: `pet.${def.id}`, x: h.x - 64, y: h.y + 24, z: 0, vx: 0,
      face: 1, anim: { s: 'idle', t: 0 }, size: def.size || 0.8, level: h.level || 1, statuses: {}, hitFlash: 0, dead: false, life: 1, maxLife: 1,
      flags: { pet: true, untargetable: true },
    };
    this.unitPet = def.id;
    this.abCd = Math.min(this.abCd, 1.5);
    this.dashT = 0;
    return this.unit;
  }

  combatTick(c, h, dt) {
    const st = this.game.state;
    const active = st?.meta?.pets?.active;
    if (!active) { if (this.unit) this.despawn(); return; }
    if (!this.unit || this.unitPet !== active || this.unitCombat !== c.hero) {
      this.unitCombat = c.hero;
      if (!this.spawn(c, h)) return;
      c.emit({ t: 'summon', x: this.unit.x, y: this.unit.y, unit: this.unit, pet: true });
    }
    const u = this.unit;
    const def = PET[active];
    u.anim.t += dt;
    u.level = h.level || 1;
    // 位置: 近い敵から見て主人公の後ろ（飛びかかった後は戻る）
    const tgt = c.nearestEnemy(h.x, h.y, 900);
    const side = tgt ? (tgt.x >= h.x ? 1 : -1) : (h.face || 1);
    if (this.dashT > 0) this.dashT -= dt;
    else {
      const want = h.x - 64 * side;
      const dx = want - u.x;
      const far = Math.abs(dx) > 600;
      if (far) u.x = want;
      else if (Math.abs(dx) > 8) {
        const sp = Math.max(300, (c.H?.move || 220) * 1.3);
        u.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
        u.face = Math.sign(dx) || side;
        if (u.anim.s !== 'walk' && u.anim.s !== 'attack') u.anim = { s: 'walk', t: 0 };
      } else {
        u.face = side;
        if (u.anim.s === 'walk') u.anim = { s: 'idle', t: 0 };
      }
      u.y += (h.y + 24 - u.y) * Math.min(1, dt * 3);
    }
    if (u.anim.s === 'attack' && u.anim.t > 0.45) u.anim = { s: 'idle', t: 0 };
    if (h.dead) return;
    // 手助け
    this.abCd -= dt;
    if (this.abCd <= 0 && def?.ability) {
      const ab = def.ability;
      const needsTarget = ab.kind !== 'heal' && ab.kind !== 'shield';
      if (needsTarget && !tgt) { this.abCd = 0.3; return; }
      if (ab.kind === 'heal' && h.life >= h.maxLife * 0.97 && !tgt) { this.abCd = 0.5; return; }
      if (ab.kind === 'shield' && !tgt) { this.abCd = 0.5; return; }
      this.useAbility(c, h, u, tgt, def);
      this.abCd = ab.cd || 4;
    }
  }

  useAbility(c, h, u, tgt, def) {
    const ab = def.ability;
    const p = this.params(def);
    u.anim = { s: 'attack', t: 0, dur: 0.45 };
    switch (ab.kind) {
      case 'bolt': case 'curse': {
        const n = Math.max(1, ab.count || 1);
        for (let i = 0; i < n; i++) {
          const spread = n > 1 ? (i - (n - 1) / 2) * 26 : 0;
          c.spawnProj({
            src: u, team: 'hero', x: u.x + 18 * (u.face || 1), y: u.y, z: 36, tx: tgt.x, ty: tgt.y + spread, speed: 760, p, range: 1000,
            explode: ab.explode || 0, art: 'fx.pet.proj', el: p.element, size: 0.8,
            onHit: ab.kind === 'curse' ? (cc, pr, target) => cc.addStatus(target, 'vuln', { dur: 4 }) : undefined,
          });
        }
        break;
      }
      case 'bite': {
        if (Math.abs(tgt.x - u.x) > 800) break;
        const side = tgt.x >= u.x ? 1 : -1;
        u.x = tgt.x - 34 * side; u.y = tgt.y + 10; u.face = side;
        this.dashT = 0.5;
        const dmg = c.hitUnit(u, tgt, p, 1);
        c.emit({ t: 'swing', x: tgt.x, y: tgt.y, el: p.element, small: true, src: u });
        if (ab.lifesteal && dmg > 0 && !h.dead) h.life = Math.min(h.maxLife, h.life + dmg * ab.lifesteal);
        break;
      }
      case 'nova': {
        const at = tgt || u;
        c.spawnArea({ team: 'hero', x: at.x, y: at.y, r: ab.radius || 150, delay: 0.3, p, src: u, art: 'fx.pet.area' });
        break;
      }
      case 'heal': {
        const v = h.maxLife * (ab.heal || 3) / 100 * this.starMul(def.id);
        if (!h.dead) h.life = Math.min(h.maxLife, h.life + v);
        c.emit({ t: 'text', x: h.x, y: h.y, z: 160, text: `+${Math.round(v)}`, color: '#7cff8a' });
        c.emit({ t: 'pulse', x: h.x, y: h.y, r: 70, el: 'poison', team: 'hero', art: 'fx.pet.heal' });
        if (ab.burn && tgt && Math.abs(tgt.x - h.x) < 500) c.spawnArea({ team: 'hero', x: tgt.x, y: tgt.y, r: 130, delay: 0.2, p: { ...p, element: 'fire' }, src: u, art: 'fx.pet.area' });
        break;
      }
      case 'loot': {
        const L = this.game.sys.world.level();
        const gold = BAL.monsterGold(L) * (ab.gold || 2) * (1 + (c.H?.gold || 0) / 100);
        this.game.addGold(gold);
        c.emit({ t: 'gold', x: u.x, y: u.y, v: gold });
        if (ab.mats && this.game.rng.chance(0.35)) this.game.sys.inv.addMats({ [this.game.rng.chance(0.25) ? 'crystal' : 'dust']: 1 });
        break;
      }
      case 'shield': {
        const dr = (ab.dr || 5) * this.starMul(def.id);
        c.addBuff('pet_shield', [{ s: 'dr', v: dr }], ab.dur || 4, { name: `${def.name.split('の').pop()}の守り` });
        c.emit({ t: 'buff', unit: h, el: 'phys', skill: 'pet' });
        break;
      }
      default: break;
    }
  }

  tick(dt) {
    this.t += dt;
    if (this.t < 2) return;
    this.t = 0;
    if (this.game.state.meta.unlocks.autoHatch && (this.hatchReady() || (this.freeIncubators() > 0 && this.eggCount() > 0))) this.autoHatch();
  }

  onOffline(rep) {
    const ps = this.ps;
    const elites = Math.max(0, Math.floor(rep.elites || 0));
    const bosses = Math.max(0, Math.floor(rep.bosses || 0));
    const eggs = {};
    // 卵（期待値をポアソンで）＋天井
    const lam = (elites * (PET_BAL.EGG_CHANCE.champion || 0) + bosses * (PET_BAL.EGG_CHANCE.boss || 0)) * this.eggMul();
    let n = this.game.rng.poisson(lam);
    ps.pity += elites + bosses;
    while (ps.pity >= PET_BAL.PITY) { ps.pity -= PET_BAL.PITY; n++; }
    for (let i = 0; i < Math.min(n, 50); i++) {
      const kind = this.rollEggKind(i < bosses ? 'boss' : 'champion');
      eggs[kind] = (eggs[kind] || 0) + 1;
    }
    for (const [k, v] of Object.entries(eggs)) this.addEgg(k, v, { quiet: true });
    // 孵卵器
    for (const inc of ps.incubator) inc.prog = Math.min(inc.need, inc.prog + (rep.kills || 0));
    if (this.game.state.meta.unlocks.autoHatch) this.autoHatch();
    rep.eggs = eggs;
    rep.hatchReady = this.hatchReady();
  }
}
