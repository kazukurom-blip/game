// 戦闘の画面に重ねる表示（場所・ステージ・自動前進・ボス挑戦・ライフ・リソース・スキルの並び・DPS）。

import { h, clear, spriteImg } from './dom.js';
import { fmt, fmtTime } from '../engine/format.js';
import { ZONE, STAGES_PER_ZONE, WAVES_PER_STAGE } from '../data/world.js';
import { SKILL } from '../data/skills.js';
import { CLASS } from '../data/classes.js';
import { assets } from '../render/assets.js';
import { attachTip } from './tooltip.js';
import { skillDesc } from '../game/skills.js';

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.el = ui.hudEl;
    this.t = 0;
    this.dpsWin = [];
    this.lastDmg = 0;
    this.build();
    this.game.events.on('skillsChanged', () => this.buildSkills());
    this.game.events.on('started', () => this.buildSkills());
  }

  build() {
    const el = this.el;
    clear(el);
    this.loc = h('div.hud-loc', [h('div.hud-zone'), h('div.hud-stage'), h('div.hud-waves')]);
    this.autoBtn = h('button.hud-btn', { onclick: () => { const w = this.game.sys.world; w.setAutoAdvance(!this.game.state.world.autoAdvance); this.update(1); } });
    this.bossBtn = h('button.hud-btn.boss', { onclick: () => { if (this.game.sys.world.challengeBoss()) this.ui.toast('ボスに挑戦！', 'boss'); } }, 'ボスに挑む');
    this.ctrl = h('div.hud-ctrl', [this.autoBtn, this.bossBtn]);
    this.dps = h('div.hud-dps');
    this.bars = h('div.hud-bars', [
      h('div.bar.life', [h('div.fill'), h('div.txt')]),
      h('div.bar.res', [h('div.fill'), h('div.txt')]),
    ]);
    this.skillRow = h('div.hud-skills');
    this.buffRow = h('div.hud-buffs');
    el.append(h('div.hud-tl', [this.loc, this.ctrl]), h('div.hud-tr', [this.dps]), h('div.hud-bottom', [this.buffRow, this.bars, this.skillRow]));
    this.buildSkills();
  }

  buildSkills() {
    const st = this.game.state;
    if (!st) return;
    clear(this.skillRow);
    this.skillEls = [];
    const size = this.game.sys.skills.barSize();
    for (let i = 0; i < size; i++) {
      const id = st.hero.bar[i];
      const def = id ? SKILL[id] : null;
      const slot = h('div.skslot', [def ? spriteImg(assets, `icon.skill.${id}`, 44) : h('div.empty', '＋'), h('div.cd'), h('div.key', i === 0 ? '基本' : String(i))]);
      if (def) attachTip(slot, () => h('div.tipbox', [h('b', def.name), h('div', skillDesc(st, this.game.H, id)), h('div.dim', `Lv ${st.hero.skills[id]?.lvl || 0}${def.cd ? `　待ち時間 ${def.cd} 秒` : ''}${def.cost > 0 ? `　消費 ${def.cost}` : ''}`)]));
      slot.addEventListener('click', () => this.ui.openPanel('skills'));
      this.skillRow.append(slot);
      this.skillEls.push({ slot, id });
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t < 0.1) return;
    const d = this.t; this.t = 0;
    const g = this.game;
    const st = g.state;
    const c = g.combat;
    const h0 = c.hero;
    if (!st || !h0) return;
    const w = st.world;
    const z = ZONE[w.zone];
    const ws = g.sys.world;
    const [zoneEl, stageEl, wavesEl] = this.loc.children;
    if (w.mode === 'campaign') {
      zoneEl.textContent = z ? `${z.name}${w.torment ? `　苦行 ${w.torment}` : ''}` : '';
      stageEl.textContent = ws.isBossStage() ? 'ボス戦' : `ステージ ${w.stage} / ${STAGES_PER_ZONE}　Lv ${ws.level()}`;
      wavesEl.innerHTML = ws.isBossStage() ? '' : Array.from({ length: WAVES_PER_STAGE }, (_, i) => `<span class="wv ${i < ws.wave - (c.enemies().length ? 1 : 0) ? 'done' : i < ws.wave ? 'cur' : ''}"></span>`).join('');
    } else {
      zoneEl.textContent = ws.modeLabel ? ws.modeLabel() : w.mode;
      stageEl.textContent = '';
      wavesEl.innerHTML = '';
    }
    this.autoBtn.textContent = w.autoAdvance ? '自動前進 ON' : '自動前進 OFF';
    this.autoBtn.classList.toggle('on', !!w.autoAdvance);
    const canBoss = w.mode === 'campaign' && !ws.isBossStage() && ((w.maxStage[w.zone] || 1) >= STAGES_PER_ZONE || w.cleared[w.zone]);
    this.bossBtn.style.display = canBoss ? '' : 'none';
    // ライフ・リソース
    const H = g.H;
    const [lb, rb] = this.bars.children;
    lb.firstChild.style.width = `${Math.max(0, h0.life / h0.maxLife) * 100}%`;
    lb.lastChild.textContent = `${fmt(Math.max(0, h0.life))} / ${fmt(h0.maxLife)}`;
    const cls = CLASS[st.hero.cls];
    rb.firstChild.style.width = `${Math.max(0, h0.resource / H.resourceMax) * 100}%`;
    rb.firstChild.style.background = cls.resource.color;
    rb.lastChild.textContent = `${cls.resource.name} ${Math.floor(h0.resource)}`;
    // スキルの待ち時間
    for (const s of this.skillEls) {
      if (!s.id) continue;
      const p = c.params(s.id);
      const cd = h0.cds[s.id] || 0;
      const cdEl = s.slot.querySelector('.cd');
      if (cd > 0 && p?.cd) { cdEl.style.height = `${Math.min(100, (cd / p.cd) * 100)}%`; cdEl.textContent = cd > 1 ? Math.ceil(cd) : ''; } else { cdEl.style.height = '0'; cdEl.textContent = ''; }
      s.slot.classList.toggle('nores', !!p && p.cost > 0 && h0.resource < p.cost);
      s.slot.classList.toggle('casting', h0.anim?.skill === s.id && h0.busy > 0);
    }
    // バフ
    const buffs = c.buffs;
    if (buffs.length !== this.buffRow.childElementCount || buffs.some((b, i) => this.buffRow.children[i]?.dataset.id !== b.id)) {
      clear(this.buffRow);
      for (const b of buffs) this.buffRow.append(h('span.buff', { dataset: { id: b.id } }, b.name));
    }
    [...this.buffRow.children].forEach((el, i) => { const b = buffs[i]; if (b) el.title = `${b.name} 残り ${Math.ceil(b.t)} 秒`; });
    // DPS（直近 5 秒）
    const done = c.stats.dmgDone;
    this.dpsWin.push({ t: d, v: done - this.lastDmg });
    this.lastDmg = done;
    let tt = 0; let vv = 0;
    for (let i = this.dpsWin.length - 1; i >= 0 && tt < 5; i--) { tt += this.dpsWin[i].t; vv += this.dpsWin[i].v; }
    if (this.dpsWin.length > 80) this.dpsWin.splice(0, this.dpsWin.length - 80);
    const r = g.sys.offline.rates();
    this.dps.innerHTML = `<div>DPS <b>${fmt(tt ? vv / tt : 0)}</b></div><div class="dim">撃破 ${(r.kills * 60).toFixed(0)}/分　経験値 ${fmt(r.xp * 3600)}/時</div>`;
  }
}

export { fmtTime };
