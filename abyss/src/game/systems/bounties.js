// 日課（毎日 3 つ・3 日まで繰り越し）・週課（毎週 1 つ）・ログインの贈り物（7 日で 1 巡り）。担当: メタ担当。
// 日課の中身はその日の日付（端末の時計）から決まる。進み具合は普段の放置で進む（放置で離れていた間も）。
//
// 外から: game.sys.bounties.list() / weekly() / claim(uid) / claimAll() / loginInfo() / claimLogin() / claimable()
// 状態: state.meta.bounties { day, list: [...], weekly, seq } ・ state.meta.daily { lastClaim, cycle, total }
// 出来事: 'bountyDone' { b } / 'bountyClaim' { b, reward } / 'loginClaim' { day, reward } / 'metaChanged'
// 報酬の宝石: game.sys.gems.grantRandom?.(段階) があればそれを使う（無ければ深淵の欠片に置きかえる）

import { RNG, hashStr } from '../../engine/rng.js';
import { BAL } from '../../data/balance.js';
import { ACTS, ZONES } from '../../data/world.js';
import { EGG } from '../../data/pets.js';

export const BOUNTY_TYPES = {
  kills: { name: '討伐', desc: (b) => `敵を ${b.target.toLocaleString('en-US')} 体倒す` },
  actKills: { name: '章の討伐', desc: (b) => `${ACTS.find((a) => a.id === b.arg)?.name.replace(/^第.+?章　/, '') || '章'}で敵を ${b.target.toLocaleString('en-US')} 体倒す` },
  elites: { name: '精鋭狩り', desc: (b) => `エリートを ${b.target} 体倒す` },
  bosses: { name: '首級', desc: (b) => `ボスを ${b.target} 体倒す` },
  salvage: { name: '分解', desc: (b) => `装備を ${b.target} 個分解する（自動の分解も数える）` },
  gold: { name: '稼ぎ', desc: (b) => `ゴールドを ${fmtShort(b.target)} 稼ぐ` },
  stages: { name: '進軍', desc: (b) => `ステージを ${b.target} 回クリアする` },
  craft: { name: '鍛冶', desc: (b) => `鍛冶（強化・付け替えなど）を ${b.target} 回行う` },
  rift: { name: '裂け目', desc: (b) => `深淵の裂け目を ${b.target} 回クリアする` },
};

export const LOGIN_REWARDS = [
  { name: '1 日目', desc: 'ゴールドの袋', gold: 200 },
  { name: '2 日目', desc: '魔塵と秘晶', mats: { dust: 10, crystal: 2 } },
  { name: '3 日目', desc: '深淵の欠片', mats: { shard: 3 } },
  { name: '4 日目', desc: '灰の卵', egg: 'egg_ash' },
  { name: '5 日目', desc: '大きなゴールドの袋', gold: 600 },
  { name: '6 日目', desc: '秘晶と伝説の残響', mats: { crystal: 5, echo: 1 } },
  { name: '7 日目', desc: '熾火の卵と欠片', egg: 'egg_ember', mats: { shard: 5 } },
];

export const CARRY_DAYS = 3;

function fmtShort(n) {
  if (n >= 1e8) return `${Math.round(n / 1e7) / 10}億`;
  if (n >= 1e4) return `${Math.round(n / 1e3) / 10}万`;
  return n.toLocaleString('en-US');
}

/** 端末の時計での「今日」 */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayNum(day) { const [y, m, d] = day.split('-').map(Number); return Math.round(new Date(y, m - 1, d).getTime() / 86400000); }
/** 週の始まり（月曜）の日付 */
export function localWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return localDay(x);
}

/** きりのいい数に丸める */
export function nice(n) {
  if (n < 10) return Math.max(1, Math.round(n));
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  const step = m < 2 ? 0.25 : m < 5 ? 0.5 : 1;
  return Math.round(Math.round(m / step) * step * p);
}

export class BountySystem {
  constructor(game) {
    this.game = game;
    this.id = 'bounties';
    this.t = 0;
    this.nowFn = () => new Date(); // テスト用に差し替えられる
  }

  get b() { return this.game.state.meta.bounties; }
  get d() { return this.game.state.meta.daily; }

  ensureState(st) {
    const m = st.meta;
    const b = (m.bounties ||= {});
    b.day ??= '';
    if (!Array.isArray(b.list)) b.list = [];
    b.list = b.list.filter((x) => x && x.uid && BOUNTY_TYPES[x.type]);
    if (b.weekly && !BOUNTY_TYPES[b.weekly.type]) b.weekly = null;
    b.weekly ??= null;
    b.seq ??= 1;
    b.done ??= 0;
    const d = (m.daily ||= {});
    d.lastClaim ??= '';
    d.cycle ??= 0;
    d.total ??= 0;
  }

  onNewGame() { this.refresh(); }
  onLoad() { this.refresh(); }

  today() { return localDay(this.nowFn()); }

  /** 今の数え上げ（進み具合はこれの差） */
  counters() {
    const st = this.game.state;
    const s = st.meta.stats; const r = st.meta.record || {};
    return {
      kills: s.kills || 0, elites: s.elites || 0, bosses: s.bosses || 0, salvage: s.salvaged || 0, gold: s.goldEarned || 0,
      stages: r.stages || 0, craft: Math.max(s.crafted || 0, r.crafted || 0), rift: st.world.rift?.runs || 0, actKills: r.actKills || {},
    };
  }
  counterOf(type, arg, c = this.counters()) { return type === 'actKills' ? (c.actKills[arg] || 0) : (c[type] || 0); }

  /** 日付が変わっていたら作り直す */
  refresh() {
    const b = this.b;
    const today = this.today();
    if (b.day !== today) {
      const tn = dayNum(today);
      // 3 日まで繰り越し（受け取っていない物）
      b.list = b.list.filter((x) => !x.claimed && tn - dayNum(x.day) <= CARRY_DAYS);
      if (!b.list.some((x) => x.day === today)) b.list.push(...this.generate(today));
      b.day = today;
      if (b.list.length > 12) b.list = b.list.slice(-12);
    }
    const wk = localWeek(this.nowFn());
    if (!b.weekly || b.weekly.week !== wk) {
      if (b.weekly && b.weekly.done && !b.weekly.claimed) this.claimReward(b.weekly); // 先週の分は自動で受け取る
      b.weekly = this.generateWeekly(wk);
    }
  }

  /** プレイヤーの今の稼ぎ（1 秒あたり）。目標の数の目安にする */
  pace() {
    const r = this.game.sys.offline?.rates?.() || {};
    const kps = Math.max(0.3, Math.min(5, r.kills || 0.5));
    return { kps, gps: Math.max(1, r.gold || 1), dps: Math.max(0.02, r.drops || kps * BAL.ITEM_DROP_CHANCE) };
  }

  level() {
    const st = this.game.state;
    return Math.max(st.hero.level, this.game.sys.world?.level?.() || 1);
  }

  available(type) {
    const st = this.game.state;
    if (type === 'bosses') return st.hero.level >= 5;
    if (type === 'craft') {
      const sys = this.game.sys.crafting;
      return !!sys && Object.getOwnPropertyNames(Object.getPrototypeOf(sys)).length > 2 && st.hero.level >= 8;
    }
    if (type === 'rift') return (st.world.rift?.runs || 0) > 0;
    if (type === 'actKills') return true;
    return true;
  }

  makeBounty(type, day, rng, scale = 1, weekly = false) {
    const p = this.pace();
    const st = this.game.state;
    const sec = 1800 * scale; // おおよそ 30 分の放置で終わる量
    let target = 1; let arg;
    switch (type) {
      case 'kills': target = nice(p.kps * sec); break;
      case 'actKills': {
        const maxAct = ZONES[st.world.maxZone || 0]?.actIdx ?? 0;
        const cur = this.game.sys.world.zone()?.actIdx ?? 0;
        const ai = rng.chance(0.7) ? cur : rng.int(0, maxAct);
        arg = ACTS[ai]?.id || 'act1';
        target = nice(p.kps * sec * 0.6);
        break;
      }
      case 'elites': target = Math.max(5, nice(p.kps * sec * 0.05)); break;
      case 'bosses': target = Math.max(2, Math.round(3 * scale)); break;
      case 'salvage': target = Math.max(15, nice(p.dps * sec * 0.5)); break;
      case 'gold': target = nice(p.gps * sec * 0.9); break;
      case 'stages': target = Math.max(5, Math.round(12 * scale)); break;
      case 'craft': target = Math.max(3, Math.round(5 * scale)); break;
      case 'rift': target = Math.max(1, Math.round(1 * scale)); break;
      default: break;
    }
    const b = { uid: `b${this.b.seq++}`, day, type, arg, target, base: this.counterOf(type, arg), prog: 0, done: false, claimed: false, weekly, reward: this.makeReward(rng, weekly ? 'weekly' : 'daily') };
    return b;
  }

  generate(day) {
    const rng = new RNG(hashStr(`abyss-daily:${day}`));
    const pool = ['kills', 'actKills', 'elites', 'bosses', 'salvage', 'gold', 'stages', 'craft', 'rift'].filter((t) => this.available(t));
    const picks = rng.weightedN(pool.map((t) => ({ t, weight: t === 'kills' || t === 'elites' ? 3 : t === 'rift' || t === 'craft' ? 1.5 : 2 })), 3, (x) => x.weight).map((x) => x.t);
    return picks.map((t, i) => this.makeBounty(t, day, rng, 1 + i * 0.25));
  }

  generateWeekly(week) {
    const rng = new RNG(hashStr(`abyss-weekly:${week}`));
    const pool = ['kills', 'elites', 'bosses', 'salvage', 'gold'].filter((t) => this.available(t));
    const t = rng.pick(pool);
    const b = this.makeBounty(t, this.today(), rng, t === 'bosses' ? 8 : 12, true);
    b.week = week;
    return b;
  }

  makeReward(rng, kind) {
    const L = this.level();
    const big = kind === 'weekly' ? 6 : 1;
    const r = { chest: kind === 'weekly' ? '黄金の宝箱' : rng.chance(0.25) ? '銀の宝箱' : '銅の宝箱' };
    const silver = r.chest === '銀の宝箱' ? 1.6 : 1;
    r.gold = Math.round(BAL.monsterGold(L) * 250 * big * silver);
    r.mats = { dust: Math.round((6 + L / 6) * big * silver), crystal: Math.round((1 + L / 25) * big * silver) };
    if (L >= 10 || kind === 'weekly') r.mats.shard = Math.round((1 + L / 40) * (kind === 'weekly' ? 4 : 1) * silver);
    if (L >= 40 && (kind === 'weekly' || rng.chance(0.3))) r.mats.echo = kind === 'weekly' ? 3 : 1;
    if (L >= 70 && kind === 'weekly') r.mats.core = 1;
    if (kind === 'weekly') r.egg = 'egg_ember';
    else if (rng.chance(silver > 1 ? 0.25 : 0.1)) r.egg = 'egg_ash';
    if (L >= 15 && (kind === 'weekly' || rng.chance(0.35))) r.gem = Math.max(1, Math.min(10, 1 + Math.floor(L / 20) + (kind === 'weekly' ? 1 : 0)));
    return r;
  }

  rewardMul() { return 1 + (this.game.sys.prestige?.effect?.('bountyMul') || 0) / 100; }

  /** 報酬を渡す。実際に渡した物を返す */
  grant(r) {
    const g = this.game;
    const mul = this.rewardMul();
    const got = { gold: 0, mats: {}, eggs: {}, gems: [] };
    if (r.gold) { const v = Math.round(r.gold * mul); g.addGold(v); got.gold = v; }
    if (r.mats) for (const [k, v] of Object.entries(r.mats)) { const n = Math.max(1, Math.round(v * mul)); got.mats[k] = (got.mats[k] || 0) + n; }
    if (r.egg && EGG[r.egg]) { g.sys.pets?.addEgg?.(r.egg, 1); got.eggs[r.egg] = 1; }
    if (r.gem) {
      let res = null;
      try { res = g.sys.gems?.grantRandom?.(r.gem) || null; } catch (e) { console.error(e); }
      if (res) got.gems.push(res);
      else got.mats.shard = (got.mats.shard || 0) + r.gem; // 宝石の仕組みが無いときは欠片
    }
    if (Object.keys(got.mats).length) g.sys.inv.addMats(got.mats);
    const rec = g.state.meta.record; if (rec) rec.chests = (rec.chests || 0) + 1;
    g.events.emit('goldChanged', {});
    g.events.emit('invChanged', {});
    return got;
  }

  update() {
    const c = this.counters();
    const all = [...this.b.list, this.b.weekly].filter(Boolean);
    let changed = false;
    for (const x of all) {
      if (x.done) continue;
      const prog = Math.max(0, Math.min(x.target, this.counterOf(x.type, x.arg, c) - x.base));
      if (prog !== x.prog) { x.prog = prog; changed = true; }
      if (prog >= x.target) {
        x.done = true;
        changed = true;
        this.game.events.emit('bountyDone', { b: x, name: this.title(x) });
        this.game.events.emit('metaChanged', { kind: 'bounties' });
      }
    }
    return changed;
  }

  title(x) { return `${x.weekly ? '週課' : '日課'}「${BOUNTY_TYPES[x.type]?.name || x.type}」`; }
  desc(x) { return BOUNTY_TYPES[x.type]?.desc(x) || ''; }

  tick(dt) {
    this.t += dt;
    if (this.t < 1) return;
    this.t = 0;
    this.refresh();
    this.update();
    if (this.game.state.meta.unlocks.autoBounty) this.claimAll(true);
  }

  onOffline(rep) {
    this.refresh();
    this.update();
    rep.bounties = [...this.b.list, this.b.weekly].filter((x) => x && x.done && !x.claimed).length;
  }

  list() { return this.b.list; }
  weekly() { return this.b.weekly; }

  claimReward(x) {
    if (!x || !x.done || x.claimed) return null;
    x.claimed = true;
    const got = this.grant(x.reward);
    const rec = this.game.state.meta.record; if (rec) rec.bountiesDone = (rec.bountiesDone || 0) + 1;
    this.b.done++;
    this.game.events.emit('bountyClaim', { b: x, reward: got });
    this.game.events.emit('metaChanged', { kind: 'bounties' });
    return got;
  }

  claim(uid) {
    const x = [...this.b.list, this.b.weekly].find((y) => y && y.uid === uid);
    return this.claimReward(x);
  }

  claimAll(auto = false) {
    const out = [];
    for (const x of [...this.b.list, this.b.weekly]) if (x && x.done && !x.claimed) out.push(this.claimReward(x));
    if (auto && this.canClaimLogin()) out.push(this.claimLogin());
    return out;
  }

  claimable() {
    return [...this.b.list, this.b.weekly].filter((x) => x && x.done && !x.claimed).length + (this.canClaimLogin() ? 1 : 0);
  }

  // ---------------- ログインの贈り物
  canClaimLogin() { return this.d.lastClaim !== this.today(); }
  loginInfo() {
    const idx = this.d.cycle % LOGIN_REWARDS.length;
    return { idx, can: this.canClaimLogin(), total: this.d.total, rewards: LOGIN_REWARDS };
  }
  loginReward(idx) {
    const base = LOGIN_REWARDS[idx];
    const L = this.level();
    const r = { chest: base.name };
    if (base.gold) r.gold = Math.round(BAL.monsterGold(L) * base.gold);
    if (base.mats) { r.mats = {}; for (const [k, v] of Object.entries(base.mats)) r.mats[k] = Math.max(1, Math.round(v * (1 + L / 50))); }
    if (base.egg) r.egg = base.egg;
    return r;
  }
  claimLogin() {
    if (!this.canClaimLogin()) return null;
    const idx = this.d.cycle % LOGIN_REWARDS.length;
    const got = this.grant(this.loginReward(idx));
    this.d.lastClaim = this.today();
    this.d.cycle++;
    this.d.total++;
    const rec = this.game.state.meta.record; if (rec) rec.logins = (rec.logins || 0) + 1;
    this.game.events.emit('loginClaim', { day: idx + 1, reward: got });
    this.game.events.emit('metaChanged', { kind: 'bounties' });
    return got;
  }
}
