// 戦闘の画面に重ねる表示（場所・ステージ・自動前進・ボス挑戦・ライフ・リソース・スキルの並び・DPS）。
// 左上: 場所の箱（地域・魔境・ステージ／ボスの残り m:ss／裂け目の残り）＋ 自動前進・ボスに挑む ＋ hudHooks.lines
// 右上: DPS の箱 ＋ 小さなボタン（消音など hudHooks.build で足された .hud-btn）
// 下:   バフ ＋ ライフ ＋ リソース ＋ スキル。ライフが 30% を切ると画面の縁が赤く脈打つ（動きを減らす設定では脈打たない）。
// スマホでは「下」の部分が戦闘の画面の外（すぐ下の帯）に出る（style.css）。

import { h, clear, spriteImg } from './dom.js';
import { fmt, fmtTime, fmtClock, roman } from '../engine/format.js';
import { ZONE, STAGES_PER_ZONE, WAVES_PER_STAGE } from '../data/world.js';
import { SKILL } from '../data/skills.js';
import { CLASS } from '../data/classes.js';
import { assets } from '../render/assets.js';
import { attachTip } from './tooltip.js';
import { skillDesc } from '../game/skills.js';

/** HUD に足す表示。lines: (game) => { text, cls } | null（左上の場所の下に出る）。 build: (hud) => DOM | null（一度だけ作る） */
export const hudHooks = { lines: [], build: [] };

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.el = ui.hudEl;
    this.t = 0;
    this.dpsWin = [];
    this.lastDmg = 0;
    this.build();
    const offs = ui.offs || [];
    offs.push(this.game.events.on('skillsChanged', () => this.buildSkills()));
    offs.push(this.game.events.on('started', () => this.buildSkills()));
  }

  build() {
    const el = this.el;
    clear(el);
    this.loc = h('div.hud-loc.hud-box', [h('div.hud-zone'), h('div.hud-stage'), h('div.hud-waves')]);
    this.autoBtn = h('button.hud-btn.hud-auto', { type: 'button', title: '自動前進の ON / OFF（Space）', onclick: () => { const w = this.game.sys.world; w.setAutoAdvance(!this.game.state.world.autoAdvance); this.update(1); } });
    this.bossBtn = h('button.hud-btn.boss', { type: 'button', title: 'ボスに挑み直す', onclick: () => this.ui.challengeBoss() }, '⚔ ボスに挑む');
    this.ctrl = h('div.hud-ctrl', [this.autoBtn, this.bossBtn]);
    this.dps = h('div.hud-dps.hud-box');
    this.trBtns = h('div.hud-trbtns');
    this.bars = h('div.hud-bars', [
      h('div.bar.life', { role: 'progressbar', 'aria-label': 'ライフ' }, [h('div.fill'), h('div.txt')]),
      h('div.bar.res', [h('div.fill'), h('div.txt')]),
    ]);
    this.skillRow = h('div.hud-skills');
    this.buffRow = h('div.hud-buffs');
    this.extra = h('div.hud-extra');
    this.low = h('div.hud-lowlife', { 'aria-hidden': 'true' });
    el.append(this.low, h('div.hud-tl', [this.loc, this.ctrl, this.extra]), h('div.hud-tr', [this.dps, this.trBtns]), h('div.hud-bottom', [this.buffRow, this.bars, this.skillRow]));
    for (const f of hudHooks.build) {
      try {
        const x = f(this);
        if (!x) continue;
        // 小さなボタン（消音など）は右上の列に並べる。ほかはそのまま重ねる
        if (x.classList?.contains('hud-btn')) this.trBtns.append(x); else el.append(x);
      } catch (e) { console.error(e); }
    }
    this.buildSkills();
  }

  buildSkills() {
    const st = this.game.state;
    if (!st) return;
    clear(this.skillRow);
    this.skillEls = [];
    const size = this.game.sys.skills.barSize();
    this.skillSig = this.barSig();
    for (let i = 0; i < size; i++) {
      const id = st.hero.bar[i];
      const def = id ? SKILL[id] : null;
      const slot = h('div.skslot', { role: 'button', tabindex: '-1', 'aria-label': def ? def.name : '空き' }, [def ? spriteImg(assets, `icon.skill.${id}`, 44) : h('div.empty', '＋'), h('div.cd'), h('div.key', i === 0 ? '基本' : String(i))]);
      if (def) attachTip(slot, () => h('div.tipbox', [h('b', def.name), h('div', skillDesc(st, this.game.H, id)), h('div.dim', `Lv ${st.hero.skills[id]?.lvl || 0}${def.cd ? `　待ち時間 ${def.cd} 秒` : ''}${def.cost > 0 ? `　消費 ${def.cost}` : ''}`)]));
      slot.addEventListener('click', () => this.ui.openPanel('skills'));
      this.skillRow.append(slot);
      this.skillEls.push({ slot, id });
    }
  }

  /** スキルの並びの形（枠の数と中身）。出来事を出さずに変わっても（祭壇の「第六の構え」・静かに覚えたスキル）HUD を合わせる */
  barSig() {
    const st = this.game.state;
    return st ? `${this.game.sys.skills.barSize()}|${st.hero.bar.join(',')}` : '';
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
    if (this.barSig() !== this.skillSig) this.buildSkills();
    const w = st.world;
    const z = ZONE[w.zone];
    const ws = g.sys.world;
    const [zoneEl, stageEl, wavesEl] = this.loc.children;
    let zt = ''; let stt = ''; let wv = '';
    const boss = w.mode === 'campaign' && ws.isBossStage();
    if (w.mode === 'campaign') {
      zt = z ? `${z.name}${w.torment ? `<span class="hud-torment">魔境 ${roman(w.torment)}</span>` : ''}` : '';
      if (boss) {
        const tl = Math.max(0, ws.bossTimer || 0);
        stt = `<b class="hud-bossl">ボス戦</b>${tl > 0 ? `　残り <span class="${tl < 10 ? 'hud-hurry' : ''}">${fmtClock(tl)}</span>` : ''}`;
      } else {
        stt = `ステージ ${w.stage} / ${STAGES_PER_ZONE}　<span class="dim">Lv ${ws.level()}</span>`;
        // ウェーブが多いので点ではなく棒と数で出す（スマホでもはみ出さない）
        const done = Math.max(0, ws.wave - (c.enemies().length ? 1 : 0));
        const pct = Math.min(100, (done / WAVES_PER_STAGE) * 100);
        wv = `<span class="wvbar"><i style="width:${pct.toFixed(1)}%"></i></span><span class="wvtx">ウェーブ ${Math.min(WAVES_PER_STAGE, Math.max(1, ws.wave))}/${WAVES_PER_STAGE}</span>`;
      }
    } else {
      zt = ws.modeLabel ? ws.modeLabel() : w.mode;
    }
    if (zoneEl.innerHTML !== zt) zoneEl.innerHTML = zt;
    if (stageEl.innerHTML !== stt) stageEl.innerHTML = stt;
    stageEl.style.display = stt ? '' : 'none';
    if (wavesEl.innerHTML !== wv) wavesEl.innerHTML = wv;
    wavesEl.style.display = wv ? '' : 'none';
    this.loc.classList.toggle('boss', boss);
    const lines = [];
    for (const f of hudHooks.lines) { try { const r = f(g); if (r) lines.push(r); } catch (e) { console.error(e); } }
    const html = lines.map((l) => `<div class="hud-line ${l.cls || ''}">${l.text}</div>`).join('');
    if (this.extra.innerHTML !== html) this.extra.innerHTML = html;
    const at = w.autoAdvance ? '▶ 自動前進 ON' : '⏸ 自動前進 OFF';
    if (this.autoBtn.textContent !== at) this.autoBtn.textContent = at;
    this.autoBtn.classList.toggle('on', !!w.autoAdvance);
    this.autoBtn.setAttribute('aria-pressed', w.autoAdvance ? 'true' : 'false');
    const canBoss = w.mode === 'campaign' && !ws.isBossStage() && ((w.maxStage[w.zone] || 1) >= STAGES_PER_ZONE || w.cleared[w.zone]);
    this.bossBtn.style.display = canBoss ? '' : 'none';
    // ライフ・リソース
    const H = g.H;
    const [lb, rb] = this.bars.children;
    const lifeP = Math.max(0, h0.life / h0.maxLife);
    lb.firstChild.style.width = `${lifeP * 100}%`;
    lb.lastChild.textContent = `ライフ ${fmt(Math.max(0, h0.life))} / ${fmt(h0.maxLife)}`;
    lb.setAttribute('aria-valuenow', String(Math.round(lifeP * 100)));
    const low = !h0.dead && lifeP < 0.3;
    lb.classList.toggle('low', low);
    this.low.classList.toggle('on', low);
    this.low.style.opacity = low ? String(Math.min(1, 0.35 + (0.3 - lifeP) * 2.5)) : '0';
    const cls = CLASS[st.hero.cls];
    rb.firstChild.style.width = `${Math.max(0, h0.resource / H.resourceMax) * 100}%`;
    rb.firstChild.style.background = cls.resource.color;
    rb.lastChild.textContent = `${cls.resource.name} ${Math.floor(h0.resource)} / ${Math.round(H.resourceMax)}`;
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
    const dh = `<div class="hd-main">DPS <b>${fmt(tt ? vv / tt : 0)}</b></div><div class="dim">撃破 ${fmt(r.kills * 60, { dec: r.kills * 60 < 10 ? 1 : 0 })}/分　経験値 ${fmt(r.xp * 3600)}/時</div>`;
    if (this.dps.innerHTML !== dh) this.dps.innerHTML = dh;
  }
}

export { fmtTime };
