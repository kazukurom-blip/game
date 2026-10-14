// スキルの習得・強化・並び（スキルバー）・ルーン・自動使用の条件。補助の刻印は戦闘担当が足す。
// 外から: game.sys.skills.levelUp(id) / setBar(index, id) / setRune(id, runeId) / setAuto(id, { cond, on }) / reset()

import { SKILL, skillsOf, SKILL_MAX_LEVEL } from '../../data/skills.js';
import { CLASS } from '../../data/classes.js';

export const BAR_SIZE = 5; // 基本攻撃 + 4（転生で増やせる）

export class SkillSystem {
  constructor(game) { this.game = game; this.id = 'skills'; }
  get hero() { return this.game.state.hero; }

  barSize() { return BAR_SIZE + (this.game.state.meta.unlocks.extraSkillSlot || 0); }

  onNewGame() {
    const h = this.hero;
    const cls = CLASS[h.cls];
    h.skills = {};
    h.bar = [];
    for (const id of cls.startSkills) { h.skills[id] = { lvl: 1, rune: null, supports: [] }; h.bar.push(id); }
  }

  onLoad() {
    // 壊れたセーブの修復
    const h = this.hero;
    h.bar = (h.bar || []).filter((id) => SKILL[id] && h.skills[id]);
    if (!h.bar.length) this.onNewGame();
  }

  /** 習得できるスキル（解放レベルに達したもの） */
  available() { return skillsOf(this.hero.cls).filter((s) => s.unlock <= this.hero.level); }

  canLevel(id) {
    const s = SKILL[id];
    const h = this.hero;
    if (!s || s.cls !== h.cls || s.unlock > h.level) return false;
    const cur = h.skills[id]?.lvl || 0;
    if (cur >= SKILL_MAX_LEVEL) return false;
    // スキルのレベルは主人公のレベルの半分 + 2 まで（序盤の振りすぎを防ぐ）
    if (cur >= Math.floor(h.level / 2) + 2) return false;
    return h.skillPoints > 0;
  }

  levelUp(id) {
    if (!this.canLevel(id)) return false;
    const h = this.hero;
    h.skills[id] ||= { lvl: 0, rune: null, supports: [] };
    h.skills[id].lvl++;
    h.skillPoints--;
    // 初めて覚えたらバーの空きに入れる
    if (h.skills[id].lvl === 1 && !h.bar.includes(id) && h.bar.length < this.barSize()) h.bar.push(id);
    this.game.onSkillsChanged();
    return true;
  }

  setBar(index, id) {
    const h = this.hero;
    if (index < 0 || index >= this.barSize()) return false;
    if (id && !h.skills[id]) return false;
    const bar = h.bar.slice();
    while (bar.length <= index) bar.push(null);
    const prev = bar.indexOf(id);
    if (id && prev >= 0) bar[prev] = bar[index];
    bar[index] = id;
    h.bar = bar.filter((x, i) => x || i < bar.length);
    this.game.onSkillsChanged();
    return true;
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
    const i = def.runes?.findIndex((r) => r.id === runeId) ?? -1;
    const need = [3, 6, 10, 15, 18][i] ?? 99;
    return (this.hero.skills[id]?.lvl || 0) >= need;
  }

  setAuto(id, o) {
    this.hero.autocast[id] = { ...(this.hero.autocast[id] || {}), ...o };
    this.game.onSkillsChanged();
  }

  /** 振り直し（お金がかかる） */
  reset() {
    const h = this.hero;
    let pts = 0;
    for (const id in h.skills) pts += h.skills[id].lvl;
    const cls = CLASS[h.cls];
    for (const id of cls.startSkills) pts -= 1;
    h.skillPoints += Math.max(0, pts);
    for (const id in h.skills) { if (cls.startSkills.includes(id)) h.skills[id].lvl = 1; else delete h.skills[id]; }
    h.bar = h.bar.filter((id) => h.skills[id]);
    this.game.onSkillsChanged();
  }
}
