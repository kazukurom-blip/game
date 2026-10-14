// 地図の窓: 章（色と景色）ごとのカード、地域の進み具合・推奨の戦力・敵とボス、移動・ボスへの挑戦、苦行の選択。
// あわせて、戦闘の画面の HUD に「必要 DPS の目安」「ため込み屋」「裂け目の残り時間と進行」を出し、ワールドの知らせ（トースト）を出す。

import { h, button, injectCss, clear, append } from '../dom.js';
import { fmt } from '../../engine/format.js';
import { ACTS, ZONES, STAGES_PER_ZONE, GATE_GROUPS } from '../../data/world.js';
import { MONSTER, FAMILIES, ATTACK_NAMES, BOSS_ABILITIES } from '../../data/monsters.js';
import { ELEMENT_NAMES, ELEMENT_COLORS } from '../../data/stats.js';
import { BAL } from '../../data/balance.js';
import { hudHooks } from '../hud.js';
import { roman } from '../../game/systems/world.js';
import { fmtClock, RIFT } from '../../game/systems/rift.js';
import { GOBLIN } from '../../game/content/world/goblins.js';

export const WORLD_CSS = `
.wm-here { border: 1px solid var(--line2); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--ac, #9a8a7a) 30%, transparent), transparent 60%), #120f16; }
.wm-here .wm-title { font-family: var(--serif); font-size: 17px; color: var(--gold2); }
.wm-here .wm-sub { color: var(--dim); font-size: 12px; margin: 2px 0 6px; }
.wm-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wm-power { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 8px 0; }
.wm-power > div { background: #0f0d13; border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--dim); }
.wm-power b { display: block; font-size: 15px; color: var(--text); }
.wm-adv { font-weight: 700; }
.wm-adv.easy { color: #6ee08a; } .wm-adv.ok { color: #d9e86e; } .wm-adv.hard { color: #ffb050; } .wm-adv.danger { color: #ff6b6b; }
.wm-act { border: 1px solid var(--line); border-left: 4px solid var(--ac); border-radius: 8px; margin-bottom: 10px; background: #120f16; overflow: hidden; }
.wm-act.locked { opacity: .55; }
.wm-act-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; background: linear-gradient(90deg, color-mix(in srgb, var(--ac) 28%, #120f16), #120f16 70%); }
.wm-act-head h3 { margin: 0; font-family: var(--serif); font-size: 15px; color: var(--ac); text-shadow: 0 1px 2px #000; }
.wm-act-head .wm-cnt { font-size: 12px; color: var(--dim); white-space: nowrap; }
.wm-act-body { padding: 0 10px 6px; }
.wm-act-desc { font-size: 12px; color: var(--dim); margin: 6px 0; }
.wm-theme { font-size: 11px; color: color-mix(in srgb, var(--ac) 70%, #fff); opacity: .8; margin-bottom: 4px; }
.wm-zone { border-top: 1px solid #221d28; padding: 7px 4px; display: grid; gap: 4px; }
.wm-zone.cur { background: #1d1722; box-shadow: inset 3px 0 0 var(--gold); padding-left: 8px; }
.wm-zone.locked { opacity: .5; }
.wm-zn { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.wm-zn b { font-size: 13px; }
.wm-zn .ok { color: var(--good); font-size: 11px; margin-left: 6px; }
.wm-zdesc { font-size: 11px; color: var(--dim); }
.wm-pbar { height: 5px; background: #221d28; border-radius: 3px; overflow: hidden; }
.wm-pbar > i { display: block; height: 100%; background: var(--ac, var(--gold)); }
.wm-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.wm-chips span { font-size: 11px; padding: 1px 7px; border-radius: 9px; background: #221d28; color: #c8bfae; }
.wm-chips span.el { border: 1px solid currentColor; background: transparent; }
.wm-boss { font-size: 12px; color: #ff9a7a; }
.wm-boss .tag { font-size: 10px; border: 1px solid #ff9a7a; border-radius: 4px; padding: 0 4px; margin-right: 4px; }
.wm-boss .abil { color: var(--dim); font-size: 11px; }
.wm-zone .stages { margin-top: 2px; }
.tm-box { border: 1px solid var(--line2); border-radius: 10px; padding: 10px; margin-bottom: 12px; background: linear-gradient(#1a1320, #120f16); }
.tm-grid { display: flex; flex-wrap: wrap; gap: 3px; margin: 6px 0; }
.tm-btn { min-width: 38px; height: 28px; background: #1f1a25; color: var(--text); border: 1px solid var(--line); border-radius: 5px; cursor: pointer; font-size: 12px; font-family: var(--serif); }
.tm-btn.on { border-color: #ff6a4a; color: #ffd0b0; background: #3a1a14; box-shadow: 0 0 8px rgba(255,90,60,.4); }
.tm-btn:disabled { opacity: .3; cursor: default; }
.tm-mult { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.tm-mult > div { background: #0f0d13; border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font-size: 10.5px; color: var(--dim); text-align: center; }
.tm-mult b { display: block; color: var(--text); font-size: 13px; }
.tm-mult .up b { color: #6ee08a; } .tm-mult .down b { color: #ff8a7a; }
.wm-fest { border: 1px solid #c8a040; color: #ffe08a; background: #2a2010; border-radius: 8px; padding: 6px 10px; font-size: 12px; margin-bottom: 10px; }
.hud-line.wl { background: rgba(10,8,12,.72); border: 1px solid var(--line); border-radius: 7px; padding: 4px 9px; font-size: 12px; max-width: 360px; line-height: 1.45; }
.hud-line.wl b { color: var(--gold2); }
.hud-line.wl .ok { color: #6ee08a; font-weight: 700; } .hud-line.wl .ng { color: #ff8a7a; font-weight: 700; }
.hud-line.wl.boss { border-color: #7a3a2a; }
.hud-line.wl.gob { border-color: #c8a040; color: #ffe08a; animation: wlpulse .8s infinite alternate; }
.hud-line.wl.rift { border-color: #7a4ac0; min-width: 240px; }
.hud-line.wl .rbar { height: 8px; background: #221a30; border-radius: 4px; overflow: hidden; margin-top: 3px; border: 1px solid #3a2a50; }
.hud-line.wl .rbar > i { display: block; height: 100%; background: linear-gradient(90deg, #7a4aff, #ff5ad0); }
.hud-line.wl .dim { color: var(--dim); }
@keyframes wlpulse { to { box-shadow: 0 0 10px rgba(255,210,90,.5); } }
.toast.gob { border-color: #c8a040; color: #ffe08a; font-weight: 700; }
.toast.rift { border-color: #8a5aff; color: #e0c8ff; font-weight: 700; box-shadow: 0 0 18px rgba(140,90,255,.35); }
.toast.gate { border-color: #ff5a8a; color: #ffc8d8; font-weight: 700; }
@media (max-width: 760px) { .tm-mult { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wm-power { grid-template-columns: 1fr 1fr; } .hud-line.wl { max-width: 240px; font-size: 10.5px; } }
`;

const openActs = new Set();
let openInit = false;

const elName = (el) => ELEMENT_NAMES[el] || el;

/** 苦行の選択（地図と裂け目の窓で共通） */
export function tormentSelector(ui, opts = {}) {
  const g = ui.game;
  const w = g.state.world;
  const ws = g.sys.world;
  const max = w.maxTorment || 0;
  const box = h('div.tm-box');
  if (max < 1) {
    box.append(h('h3.sec-title', '苦行（難しさ）'), h('p.dim', '第十章の最後で深淵王を倒すと、苦行 I〜XVI が開きます。段を上げるほど敵は強くなり、経験値・ゴールド・ドロップが増えます。'));
    return box;
  }
  const cur = w.torment || 0;
  const info = ws.tormentInfo(cur);
  const grid = h('div.tm-grid');
  for (let t = 0; t <= BAL.MAX_TORMENT; t++) {
    grid.append(h(`button.tm-btn${t === cur ? '.on' : ''}`, { disabled: t > max || undefined, title: t > max ? `苦行 ${roman(t - 1)} で章のボスを倒すと開く` : ws.tormentInfo(t).name, onclick: () => { ws.setTorment(t); ui.renderPanel(); } }, t === 0 ? 'なし' : roman(t)));
  }
  const cell = (label, v, cls = '') => h(`div${cls ? `.${cls}` : ''}`, [h('b', v), label]);
  const st = w.tormentStats?.[cur];
  append(box, [
    h('h3.sec-title', ['苦行（難しさ）', h('span.sec-right', cur ? info.name : 'ふつう')]),
    grid,
    h('div.tm-mult', [
      cell('経験値', `×${info.xp.toFixed(2)}`, 'up'), cell('ゴールド', `×${info.gold.toFixed(2)}`, 'up'), cell('ドロップ数', `×${info.loot.toFixed(2)}`, 'up'), cell('レア発見率', `+${info.mf}%`, 'up'),
      cell('敵のライフ', `×${fmt(info.life, { dec: 1 })}`, 'down'), cell('敵の攻撃', `×${fmt(info.dmg, { dec: 1 })}`, 'down'), cell('耐性', info.resPenalty ? `-${info.resPenalty}` : 'なし', 'down'), cell('太古 / 原初', `${Math.round((info.ancient || 0) * 100)}% / ${((info.primal || 0) * 100).toFixed(1)}%`, 'up'),
    ]),
    h('div.hint', `敵のレベル ${cur ? `${info.level}〜` : '地域どおり'}。苦行 ${roman(Math.min(BAL.MAX_TORMENT, max))} まで解放（今の段で章のボスを倒すと次の段が開く）。苦行では地域のボスが門の欠片を落とします。`),
    h(`label.chk${ws.canTormentAuto() ? '' : '.dim'}`, [h('input', { type: 'checkbox', checked: ws.tormentAutoOn() || undefined, disabled: !ws.canTormentAuto() || undefined, onchange: (e) => { ws.setTormentAuto(e.target.checked); ui.renderPanel(); } }), ' 自動で最適な段（2 分ごとに、撃破のペースが 0.9 体/秒以上で倒れなければ 1 段上げ、0.35 体/秒未満か 2 回倒れたら 1 段下げる）', ws.canTormentAuto() ? '' : '　※ 魂の祭壇「苦行の見極め」で解放（祭壇の ON/OFF と同じスイッチ）']),
    st ? h('div.dim.small', `この段の実測: ${st.rate.toFixed(2)} 体/秒・倒れた回数 ${st.deaths}（${Math.round(st.secs / 60)} 分）`) : null,
  ]);
  if (opts.compact) box.classList.add('compact');
  return box;
}

function powerRow(g, z) {
  const ws = g.sys.world;
  const adv = ws.zoneAdvice(z);
  const nd = ws.bossNeed(z);
  const est = ws.estDps(z.id);
  return h('div.wm-power', [
    h('div', [h('b', fmt(adv.power)), '今の戦力']),
    h('div', [h('b', fmt(adv.rec)), `推奨の戦力（敵 Lv ${adv.level}）`]),
    h('div', [h(`b.wm-adv.${adv.cls}`, `${adv.label}${adv.weak ? `（${adv.weak}不足）` : ''}`), `ボス必要 DPS ${fmt(nd.need)} ／ 今 ${fmt(est)}　耐久 ${Math.round(adv.ehpRatio * 100)}%`]),
  ]);
}

function zoneRow(ui, z, act) {
  const g = ui.game;
  const w = g.state.world;
  const ws = g.sys.world;
  const open = z.global <= w.maxZone;
  const cur = w.zone === z.id && w.mode === 'campaign';
  const maxS = w.cleared[z.id] ? STAGES_PER_ZONE : (w.maxStage[z.id] || 1);
  const L = ws.campaignLevel(z, 1, w.torment || 0);
  const row = h(`div.wm-zone${cur ? '.cur' : ''}${open ? '' : '.locked'}`);
  if (!open) {
    row.append(h('div.wm-zn', [h('b', z.name), h('span.dim', `Lv ${z.level}〜${z.level + 1}`)]), h('div.wm-zdesc', '前の地域のボスを倒すと解放'));
    return row;
  }
  const adv = ws.zoneAdvice(z);
  const boss = MONSTER[z.boss];
  const isAct = z.zoneIdx === 4;
  append(row, [
    h('div.wm-zn', [
      h('span', [h('b', z.name), w.cleared[z.id] ? h('span.ok', '踏破') : null, cur ? h('span.ok', '　いまここ') : null]),
      h('span', [h('span.dim', `Lv ${L}〜${L + 1}${w.torment ? '' : `・推奨 Lv ${adv.recLevel}`}　`), h(`span.wm-adv.${adv.cls}`, { title: `火力 ${Math.round(adv.dpsRatio * 100)}%・耐久 ${Math.round(adv.ehpRatio * 100)}%（ボスに対して）` }, `${adv.label}${adv.weak ? `（${adv.weak}）` : ''}`)]),
    ]),
    h('div.wm-zdesc', z.desc || ''),
    h('div.wm-pbar', { title: `到達 ${maxS} / ${STAGES_PER_ZONE}` }, h('i', { style: { width: `${(Math.min(maxS, STAGES_PER_ZONE) / STAGES_PER_ZONE) * 100}%` } })),
    h('div.wm-chips', z.monsters.map((id) => {
      const m = MONSTER[id];
      if (!m) return null;
      const el = m.element && m.element !== 'phys' ? m.element : null;
      return h(`span${el ? '.el' : ''}`, { style: el ? { color: ELEMENT_COLORS[el] } : null, title: `${FAMILIES[m.family] || ''}・${ATTACK_NAMES[m.attack] || '近接'}${el ? `・${elName(el)}` : ''}${m.res ? `　耐性: ${Object.entries(m.res).filter(([, v]) => v).map(([k, v]) => `${elName(k)} ${v > 0 ? '+' : ''}${v}`).join(' ')}` : ''}` }, m.name);
    })),
    boss ? h('div.wm-boss', [h('span.tag', isAct ? '章のボス' : 'ボス'), boss.name, h('span.abil', `　${(boss.abilities || []).map((a) => BOSS_ABILITIES[a]?.name).filter(Boolean).join('・')}`)]) : null,
  ]);
  const stages = h('div.stages');
  for (let s = 1; s <= STAGES_PER_ZONE; s++) {
    const ok = s <= maxS || w.cleared[z.id];
    stages.append(h(`button.st${ok ? '' : '.lock'}${cur && w.stage === s ? '.on' : ''}${s === STAGES_PER_ZONE ? '.boss' : ''}`, {
      disabled: !ok || undefined,
      title: s === STAGES_PER_ZONE ? `ボス「${boss?.name}」に挑む` : `ステージ ${s}`,
      onclick: () => {
        if (s === STAGES_PER_ZONE) { if (w.zone !== z.id || w.mode !== 'campaign') g.sys.world.travel(z.id, STAGES_PER_ZONE - 1); g.sys.world.challengeBoss(); } else g.sys.world.travel(z.id, s);
        ui.renderPanel();
      },
    }, s === STAGES_PER_ZONE ? 'B' : String(s)));
  }
  row.append(stages);
  void act;
  return row;
}

export const mapPanel = {
  id: 'map', name: '地図', icon: '🗺',
  refreshOn: ['world', 'level', 'gear'],
  help: '<p>10 の章、50 の地域。各地域は 10 ステージで、10 番目がボスです。ボスを倒すと次の地域へ進めます。</p><p>「推奨」は地域のボスを倒すための戦力の目安です。<b>楽勝</b>・<b>ちょうどよい</b>・<b>手ごわい</b>・<b>危険</b>の 4 段で出ます。</p><p>ボスに負けると手前のステージで稼ぎ直します。HUD の「必要 DPS」が足りたら挑み直しましょう。</p>',
  render(ui, el) {
    injectCss('world', WORLD_CSS);
    const g = ui.game;
    const w = g.state.world;
    const ws = g.sys.world;
    const z = ws.zone();
    const act = ACTS[z.actIdx];
    if (!openInit) { openInit = true; openActs.add(act.id); }
    // いまの場所
    const here = h('div.wm-here', { style: { '--ac': act.color } });
    if (w.mode !== 'campaign') {
      here.append(h('div.wm-title', ws.modeLabel()), h('div.wm-sub', '物語の地域へ移動すると、いまの挑戦は終わります。'));
      here.append(h('div.wm-row', [button('裂け目の窓を開く', () => ui.openPanel('rift'), { kind: 'primary' })]));
    } else {
      here.append(
        h('div.wm-title', `${z.name}${w.torment ? `　苦行 ${roman(w.torment)}` : ''}`),
        h('div.wm-sub', `${act.name}　${ws.isBossStage() ? 'ボス戦' : `ステージ ${w.stage} / ${STAGES_PER_ZONE}`}　敵 Lv ${ws.level()}`),
        powerRow(g, z),
        h('div.wm-row', [
          button(w.autoAdvance ? '自動前進 ON' : '自動前進 OFF', () => { ws.setAutoAdvance(!w.autoAdvance); ui.renderPanel(); }, { kind: w.autoAdvance ? 'primary' : null, class: 'btn-small' }),
          (w.maxStage[z.id] || 1) >= STAGES_PER_ZONE || w.cleared[z.id] ? button(`ボス「${MONSTER[z.boss]?.name}」に挑む`, () => { if (ws.challengeBoss()) ui.toast('ボスに挑戦！', 'boss'); ui.renderPanel(); }, { class: 'btn-small' }) : null,
          g.state.meta.unlocks?.autoBoss ? h('span.dim.small', '火力が足りたら自動で再挑戦します') : null,
        ]),
      );
    }
    el.append(here);
    if (ws.festival()) el.append(h('div.wm-fest', '週末の祭　ため込み屋が 2 倍出ます（土・日）'));
    el.append(tormentSelector(ui));
    // 章のカード
    for (const a of ACTS) {
      const zones = ZONES.filter((x) => x.act === a.id);
      const locked = !zones.length || zones[0].global > w.maxZone;
      const cleared = zones.filter((x) => w.cleared[x.id]).length;
      const card = h(`div.wm-act${locked ? '.locked' : ''}`, { style: { '--ac': a.color } });
      const isOpen = openActs.has(a.id) && !locked;
      const head = h('div.wm-act-head', { onclick: () => { if (locked) return; if (openActs.has(a.id)) openActs.delete(a.id); else openActs.add(a.id); ui.renderPanel(); } }, [
        h('h3', a.name),
        h('span.wm-cnt', locked ? '前の章を進めると解放' : `${cleared} / ${zones.length} 踏破　${isOpen ? '▲' : '▼'}`),
      ]);
      card.append(head);
      if (isOpen) {
        const body = h('div.wm-act-body', [h('div.wm-act-desc', a.desc), h('div.wm-theme', a.theme)]);
        for (const zz of zones) body.append(zoneRow(ui, zz, a));
        card.append(body);
      }
      el.append(card);
    }
    el.append(h('div.hint', 'ステージを押すとそこへ移動。B はボス。自動前進を切ると同じステージで稼ぎ続けます。章の見出しを押すと開け閉めできます。'));
  },
};

// ---------------- HUD の行
hudHooks.lines.push((g) => {
  const w = g.state?.world;
  if (!w) return null;
  const ws = g.sys.world;
  if (w.mode === 'campaign') {
    const z = ws.zone();
    const boss = ws.isBossStage();
    if (!(boss || w.bossFailZone === z.id || (!w.cleared[z.id] && w.stage >= STAGES_PER_ZONE - 1))) return null;
    const nd = ws.bossNeed(z);
    const est = ws.estDps(z.id);
    const ok = est >= nd.need;
    const short = nd.need > 0 ? Math.max(1, Math.round((1 - est / nd.need) * 100)) : 0;
    const status = ok ? '<span class="ok">十分</span>' : `<span class="ng">あと ${short}% 足りない</span>`;
    const log = w.bossLog?.[z.id];
    const extra = !boss && w.bossFailZone === z.id && !ok ? '<br><span class="dim">装備の強化・スキルのレベル・パッシブで火力を上げよう</span>' : '';
    return { cls: 'wl boss', text: `<b>ボス</b> 必要 DPS ${fmt(nd.need)} ／ 今 ${fmt(est)}　${status}${log?.lastDps ? `<br><span class="dim">前回のボス戦 ${fmt(log.lastDps)} DPS（${log.fails} 敗）</span>` : ''}${extra}` };
  }
  return null;
});

hudHooks.lines.push((g) => {
  const c = g.combat;
  if (!c?.units) return null;
  for (const u of c.units) {
    if (u.goblin && !u.dead) {
      const left = u.goblin.state === 'flee' ? Math.max(0, GOBLIN.escapeSec - u.goblin.t) : null;
      return { cls: 'wl gob', text: `${u.name}が${left === null ? 'いる！' : `逃げる！ 残り ${Math.ceil(left)} 秒`}` };
    }
  }
  return null;
});

hudHooks.lines.push((g) => {
  const w = g.state?.world;
  if (!w) return null;
  if (w.mode === 'rift' && w.rift?.run) {
    const r = w.rift.run;
    const p = Math.min(1, r.progress / r.need);
    const head = r.phase === 'guardian' ? '守護者を倒せ！' : r.phase === 'done' ? (r.ok ? '踏破！' : '終了') : `進行 ${Math.floor(p * 100)}%`;
    return { cls: 'wl rift', text: `<b>段階 ${r.level}</b>　残り ${fmtClock(r.timeLeft)}　${head}${r.deaths ? `　<span class="ng">倒れた ${r.deaths}</span>` : ''}<div class="rbar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` };
  }
  if (w.mode === 'gate' && w.gate?.run) {
    const r = w.gate.run;
    return { cls: 'wl rift', text: `<b>${GATE_GROUPS[r.gi]?.name}の門番</b>　残り ${Math.max(0, Math.ceil(r.timeLeft))} 秒　苦行 ${roman(r.tier)}` };
  }
  return null;
});

// ---------------- 知らせ（トースト）
let offs = [];
hudHooks.build.push((hud) => {
  for (const f of offs) f();
  offs = [];
  const ui = hud.ui;
  const ev = hud.game.events;
  const on = (type, fn) => offs.push(ev.on(type, (e) => { try { fn(e || {}); } catch (err) { console.error(err); } }));
  on('goblinSpawn', (e) => ui.toast(`${MONSTER[e.unit?.defId]?.name || 'ため込み屋'}が現れた！ 逃がすな`, 'gob'));
  on('goblinKill', (e) => ui.toast(`${MONSTER[e.unit?.defId]?.name || 'ため込み屋'}を倒した！ 戦利品 ${e.items || 0} 個`, 'gob'));
  on('goblinEscape', () => ui.toast('ため込み屋に逃げられた…', 'bad'));
  on('storyClear', () => ui.toast('物語を踏破！ 苦行と深淵の裂け目が開いた', 'level'));
  on('tormentUnlock', (e) => ui.toast(`苦行 ${roman(e.tier)} が解放された`, 'level'));
  on('autoBossRetry', () => ui.toast('火力が足りたのでボスに再挑戦', 'boss'));
  on('chestOpen', () => ui.toast('呪われた宝箱が開いた！ レア以上が 3 つ', 'good'));
  on('gateFragment', (e) => ui.toast(`${e.name}を手に入れた（${GATE_GROUPS[e.group]?.name}）`, 'gate'));
  on('riftComplete', (e) => ui.toast(`深淵の裂け目 段階 ${e.level} を踏破！ 深淵の欠片 +${e.rewards?.shards || 0}${e.open > 1 ? `・段階 ${e.level + e.open} まで開いた` : ''}`, 'rift'));
  on('riftFail', (e) => { if (!e.abandoned) ui.toast(`裂け目 段階 ${e.level}：時間切れ（進行 ${Math.floor((e.progress || 0) * 100)}%）`, 'bad'); });
  on('gateResult', (e) => ui.toast(e.ok ? `門番を討った！${e.mythic ? ' ミシック！' : ''}` : `門番に敗れた　欠片を ${(e.refund || []).length} つ取り戻した`, e.ok ? 'gate' : 'bad'));
  on('riftStart', () => ui.markDirty('world'));
  on('gateStart', () => ui.markDirty('world'));
  on('tormentChanged', (e) => { ui.markDirty('world'); if (e.auto) ui.toast(`苦行を ${e.tier ? roman(e.tier) : 'なし'} に自動で切り替えた`); });
  injectCss('world', WORLD_CSS);
  return null;
});

export { button, clear, RIFT };
