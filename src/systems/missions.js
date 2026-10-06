// ミッション進行管理
import { MISSIONS, MISSION_NPCS, turnInNpcOf } from '../data/missions.js';
import { ENEMIES } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { countItem, removeItem, addItem } from './inventory.js';
import { gainExp } from './progression.js';
import { canTakeJobMission, advanceJob } from './jobs.js';
import { addSp } from '../data/jobs.js';
import { refreshTicket, dayIndex, TICKET_CAP } from './daily.js';

export { MISSIONS, MISSION_NPCS };

/**
 * missionDialog(state, missionId, phase='offer'|'done') → [行]
 *  ストーリー分岐: m.dialogByFlag[flag][phase]（state.flags が立っていれば優先）、done は選んだ choice.dialog を優先
 */
export function missionDialog(state, missionId, phase = 'offer') {
  const m = MISSIONS[missionId];
  if (!m) return [];
  let lines = m.dialog?.[phase] || [];
  for (const [flag, d] of Object.entries(m.dialogByFlag || {})) if (state?.flags?.[flag] && d?.[phase]) lines = d[phase];
  if (phase === 'done' && m.choices) {
    const c = m.choices.find((x) => x.id === state?.storyChoices?.[missionId]);
    if (c?.dialog) lines = c.dialog;
  }
  return [...lines];
}

/**
 * v4 連作の派生（クエスト担当）: 前提の追加条件
 *  prereqAny: [[id, id], ...]  … 各グループのどれか 1 つが完了済み（A 編・B 編のどちらかを終えていれば良い、など）
 *  reqChoice: {mission, choice} … そのミッションの報告時に choice を選んでいた（A 編・B 編の分かれ道）
 *  reqFlags:  [flag]            … state.flags がすべて立っている
 */
export function branchOk(st, ms, m) {
  for (const g of m.prereqAny || []) if (!(Array.isArray(g) ? g : [g]).some((p) => ms.completed.includes(p))) return false;
  const rc = m.reqChoice;
  if (rc && st?.storyChoices?.[rc.mission] !== rc.choice) return false;
  for (const f of m.reqFlags || []) if (!st?.flags?.[f]) return false;
  return true;
}

// デイリーの日付キーはローカル日付（toISOString は UTC なので JST だと朝9時に切り替わっていた）
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function targetName(o) {
  switch (o.type) {
    case 'kill': case 'boss': return ENEMIES[o.target]?.name || o.target;
    case 'collect': return ITEMS[o.target]?.name || o.target;
    case 'talk': return MISSION_NPCS[o.target]?.name || o.target;
    case 'killAny': return o.text || o.area || '';
    default: return o.target;
  }
}

/** マップがその地域か（area = マップIDの頭。'w2_arkcity' は w2_arkcity と w2_arkcity_f1… に一致。area 無しは全マップ） */
export function inArea(mapId, area) {
  if (!area) return true;
  return mapId === area || String(mapId || '').startsWith(area + '_');
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this._unsub = [];
    this._notifiedDone = new Set();
    this._ensureState();
    const ev = game.events;
    if (ev) {
      const on = (n, fn) => { const u = ev.on(n, fn); this._unsub.push(typeof u === 'function' ? u : () => ev.off(n, fn)); };
      on('enemyKilled', (d) => this._onKill(d?.enemy));
      on('talkNpc', (d) => this._onTalk(d?.npcId));
      on('mapChanged', (d) => this._onReach(d?.mapId));
    }
  }

  destroy() { this._unsub.forEach((u) => u()); this._unsub = []; }

  get ms() { return this._ensureState(); }

  _ensureState() {
    const st = this.game.state;
    if (!st) return { active: [], completed: [], progress: {}, objProgress: {}, daily: {} };
    if (!st.missions) st.missions = {};
    const m = st.missions;
    m.active ||= []; m.completed ||= []; m.progress ||= {}; m.objProgress ||= {}; m.daily ||= {};
    return m;
  }

  _prog(id) {
    const m = MISSIONS[id];
    const ms = this.ms;
    if (!ms.objProgress[id] || ms.objProgress[id].length !== m.objectives.length) {
      ms.objProgress[id] = m.objectives.map(() => 0);
    }
    return ms.objProgress[id];
  }

  // 現在の各目的の進捗値（collect は所持数）
  objectiveValues(id) {
    const m = MISSIONS[id];
    if (!m) return [];
    const pr = this._prog(id);
    return m.objectives.map((o, i) => (o.type === 'collect' ? countItem(this.game.state, o.target) : pr[i]));
  }

  _bump(pred, amount = 1) {
    let changed = false;
    for (const id of this.ms.active) {
      const m = MISSIONS[id];
      if (!m) continue;
      const pr = this._prog(id);
      m.objectives.forEach((o, i) => {
        if (o.type !== 'collect' && pred(o) && pr[i] < o.count) {
          pr[i] = Math.min(o.count, pr[i] + amount);
          changed = true;
        }
      });
      this._syncProgress(id);
    }
    return changed;
  }

  _syncProgress(id) {
    const m = MISSIONS[id];
    const vals = this.objectiveValues(id);
    this.ms.progress[id] = vals.reduce((a, v, i) => a + Math.min(v, m.objectives[i].count), 0);
  }

  _onKill(enemy) {
    const eid = enemy?.def?.id || enemy?.defId;
    if (!eid) return;
    this._bump((o) => (o.type === 'kill' || o.type === 'boss') && o.target === eid);
    // v4 killAny: 敵の ID に依らず、倒した場所（area で始まるマップ）で数える（市民は数えない）
    if (enemy.def?.civilian || enemy.civilian) return;
    const mapId = enemy.mapId || this.game.map?.id || this.game.state?.mapId || '';
    const boss = !!(enemy.def?.boss || enemy.boss);
    this._bump((o) => o.type === 'killAny' && inArea(mapId, o.area || o.mapId) && (!o.boss || boss));
  }
  _onTalk(npcId) { if (npcId) this._bump((o) => o.type === 'talk' && o.target === npcId); }
  _onReach(mapId) { if (mapId) this._bump((o) => o.type === 'reach' && o.target === mapId); }

  /** NPC が今オファーできるミッション（転職ミッション type:'job' は吹き出しからのみ受注するので含めない） */
  available(npcId) {
    return Object.values(MISSIONS).filter((m) => m.giver === npcId && m.type !== 'job' && this.canAccept(m.id));
  }

  /** NPC に報告できる（完了済み）ミッション */
  completable(npcId) {
    return this.ms.active.map((id) => MISSIONS[id]).filter((m) => m && turnInNpcOf(m) === npcId && this.isComplete(m.id));
  }

  /** NPC の進行中（未完了）ミッション */
  inProgress(npcId) {
    return this.ms.active.map((id) => MISSIONS[id]).filter((m) => m && turnInNpcOf(m) === npcId && !this.isComplete(m.id));
  }

  /** NPC 頭上マーカー: '?'（報告可）| '!'（受注可）| null */
  npcMarker(npcId) {
    if (this.completable(npcId).length) return '?';
    if (this.available(npcId).length) return '!';
    return null;
  }

  canAccept(id) {
    const m = MISSIONS[id];
    const st = this.game.state;
    if (!m || !st) return false;
    const ms = this.ms;
    if (ms.active.includes(id)) return false;
    if (m.daily) {
      // v3: 未消化分は最大2日まで持ち越し（ストック上限3。5:00 リセット）
      if (this.dailyStock(id) <= 0) return false;
    } else if (ms.completed.includes(id)) return false;
    if (st.level < (m.reqLevel || 1)) return false;
    if (m.type === 'job' && !canTakeJobMission(st, m.jobId)) return false;
    if (!(m.prereq || []).every((p) => ms.completed.includes(p))) return false;
    return branchOk(st, ms, m);
  }

  /** デイリーの残り回数（持ち越し込み） */
  dailyStock(id) {
    const ms = this.ms;
    ms.dailyTickets ||= {};
    if (!ms.dailyTickets[id]) {
      // 旧セーブ: 今日すでに報告済みなら今日の分は消化済み
      ms.dailyTickets[id] = { idx: dayIndex(), stock: ms.daily[id] === todayKey() ? 0 : 1 };
    }
    return refreshTicket(ms.dailyTickets[id], 'daily', undefined, TICKET_CAP).stock;
  }

  /** ストーリー分岐: 報告前に選ぶ。→ {ok, msg, choice} */
  choose(missionId, choiceId) {
    const m = MISSIONS[missionId];
    const st = this.game.state;
    if (!m?.choices?.length) return { ok: false, msg: '選択肢のないミッションです' };
    const c = m.choices.find((x) => x.id === choiceId);
    if (!c) return { ok: false, msg: '選択肢が見つかりません' };
    if (this.ms.completed.includes(missionId)) return { ok: false, msg: 'すでに完了したミッションです' };
    st.storyChoices ||= {};
    st.storyChoices[missionId] = choiceId;
    this.game.events?.emit('storyChoice', { missionId, choiceId });
    return { ok: true, msg: c.text, choice: c };
  }

  /** 報告前に選択が必要か（UI は choices を表示して choose を呼ぶ。未選択のまま turnIn すると choices[0]） */
  needsChoice(missionId) {
    const m = MISSIONS[missionId];
    return !!m?.choices?.length && !this.game.state.storyChoices?.[missionId] && this.ms.active.includes(missionId);
  }

  /** missionDialog の MissionManager 版 */
  dialog(missionId, phase = 'offer') { return missionDialog(this.game.state, missionId, phase); }

  accept(id) {
    if (!this.canAccept(id)) return false;
    const m = MISSIONS[id];
    const ms = this.ms;
    ms.active.push(id);
    ms.objProgress[id] = m.objectives.map(() => 0);
    // 受注時点で満たしている reach
    const g = this.game;
    const curMap = g.map?.id || g.state.mapId;
    m.objectives.forEach((o, i) => {
      if (o.type === 'reach' && o.target === curMap) ms.objProgress[id][i] = o.count;
    });
    this._syncProgress(id);
    this._notifiedDone.delete(id);
    g.notify?.(`ミッション受注: ${m.name}`, '#ffd23f');
    g.events?.emit('missionAccepted', { id });
    return true;
  }

  abandon(id) {
    const ms = this.ms;
    const i = ms.active.indexOf(id);
    if (i < 0) return false;
    ms.active.splice(i, 1);
    delete ms.objProgress[id];
    delete ms.progress[id];
    return true;
  }

  isComplete(id) {
    const m = MISSIONS[id];
    if (!m || !this.ms.active.includes(id)) return false;
    const vals = this.objectiveValues(id);
    const turnInNpc = turnInNpcOf(m);
    // 報告先 NPC との talk は報告時に満たされるものとして扱う
    return m.objectives.every((o, i) => vals[i] >= o.count || (o.type === 'talk' && o.target === turnInNpc));
  }

  /** turnIn(id) → reward | false */
  turnIn(id) {
    if (!this.isComplete(id)) return false;
    const m = MISSIONS[id];
    const g = this.game;
    const st = g.state;
    const ms = this.ms;
    // 報酬アイテムの空き確認（足りなくても報告は可能、溢れた分は通知）
    for (const o of m.objectives) if (o.type === 'collect') removeItem(st, o.target, o.count);
    ms.active.splice(ms.active.indexOf(id), 1);
    delete ms.objProgress[id];
    delete ms.progress[id];
    if (m.daily) {
      ms.daily[id] = todayKey();
      this.dailyStock(id);
      ms.dailyTickets[id].stock = Math.max(0, ms.dailyTickets[id].stock - 1);
    }
    if (!ms.completed.includes(id)) ms.completed.push(id);

    const r = m.reward || {};
    if (r.money) st.money += r.money;
    if (r.sp) addSp(st, r.sp); // v3: 現職の段階の SP プールへ
    st.flags ||= {}; // 古いセーブ対策
    if (r.flag) st.flags[r.flag] = true;
    // v4: 報酬でフラグを立てる（例: m2 連作の最後 reward.flags: ['world2Unlocked']）
    for (const f of r.flags || []) st.flags[f] = true;
    for (const itemId of r.items || []) {
      if (!addItem(g, itemId, 1)) g.notify?.(`${ITEMS[itemId]?.name} を受け取れなかった（満杯）`, '#ff5555');
    }
    g.notify?.(`ミッション完了: ${m.name}  EXP+${r.exp || 0} $${r.money || 0}`, '#5cff9a');
    if (r.exp) gainExp(g, r.exp);
    if (m.type === 'job') advanceJob(g, m.jobId);
    // v3 ストーリー分岐の追加報酬・flag・称号（未選択なら最初の選択肢）
    let choice = null;
    if (m.choices?.length) {
      st.storyChoices ||= {};
      const cid = st.storyChoices[id] || m.choices[0].id;
      st.storyChoices[id] = cid;
      choice = m.choices.find((c) => c.id === cid) || m.choices[0];
      const cr = choice.reward || {};
      if (cr.money) st.money += cr.money;
      for (const itemId of cr.items || []) if (!addItem(g, itemId, 1)) g.notify?.(`${ITEMS[itemId]?.name} を受け取れなかった（満杯）`, '#ff5555');
      if (choice.flag) st.flags[choice.flag] = true;
      for (const f of choice.flags || []) st.flags[f] = true;
      if (choice.title) st.flags[choice.title] = true;
      g.notify?.(`選択: ${choice.text}`, '#c9b6ff');
    }
    g.events?.emit('missionComplete', { id, choice: choice?.id || null });
    return choice ? { ...r, choice: choice.id, choiceReward: choice.reward || {} } : r;
  }

  /** HUD 用: [{name, lines:[str]}] */
  tracked() {
    const out = [];
    for (const id of this.ms.active) {
      const m = MISSIONS[id];
      if (!m) continue;
      const vals = this.objectiveValues(id);
      const done = this.isComplete(id);
      const turnInNpc = turnInNpcOf(m);
      const lines = m.objectives.map((o, i) => {
        const v = Math.min(vals[i], o.count);
        const ok = v >= o.count;
        let t;
        if (o.type === 'reach' || o.type === 'talk' || o.type === 'boss' || (o.type === 'killAny' && o.boss)) t = o.text;
        else t = `${o.text} ${Math.floor(v)}/${o.count}`;
        if (o.type === 'talk' && o.target === turnInNpc && !ok) return done ? null : `・${t}`;
        return `${ok ? '✔' : '・'}${t}`;
      }).filter(Boolean);
      if (done) lines.push(`→ ${MISSION_NPCS[turnInNpc]?.name || turnInNpc} に報告`);
      out.push({ id, name: m.name, lines, complete: done, category: m.category, ...(m.type === 'job' ? { type: 'job', jobId: m.jobId } : {}) });
    }
    return out;
  }

  update(dt) {
    const g = this.game;
    if (!g.state) return;
    const active = this.ms.active;
    if (!active.length) return;
    // reach のポーリング（イベント取りこぼし対策）。旧 wanted / drive 目的は廃止（警察・乗り物の廃止）
    const curMap = g.map?.id || g.state.mapId;
    this._bump((o) => o.type === 'reach' && o.target === curMap, 1e9);
    // 完了通知
    for (const id of active) {
      if (!this._notifiedDone.has(id) && this.isComplete(id)) {
        this._notifiedDone.add(id);
        const m = MISSIONS[id];
        const npc = MISSION_NPCS[turnInNpcOf(m)]?.name || '';
        g.notify?.(`「${m.name}」達成！ ${npc}に報告しよう`, '#ffd23f');
      }
    }
  }
}
