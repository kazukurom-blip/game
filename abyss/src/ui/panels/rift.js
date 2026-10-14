// 深淵の裂け目（段階を選んで挑む・最高記録・報酬）・苦行の選択・門番（欠片を集めて呼ぶ）・記録。

import { h, button, injectCss } from '../dom.js';
import { fmt, fmtTime } from '../../engine/format.js';
import { GATE_GROUPS } from '../../data/world.js';
import { BOSS_ABILITIES } from '../../data/monsters.js';
import { roman } from '../../game/systems/world.js';
import { RIFT, GATE, fmtClock, riftTormentTier, guardianFor } from '../../game/systems/rift.js';
import { BAL } from '../../data/balance.js';
import { tormentSelector, WORLD_CSS } from './map.js';

const RIFT_CSS = `
.rf-hero { border: 1px solid #5a3a8a; border-radius: 12px; padding: 12px; margin-bottom: 12px; background: radial-gradient(circle at 80% 0, rgba(140,80,255,.35), transparent 60%), radial-gradient(circle at 0 100%, rgba(255,60,140,.18), transparent 50%), #110c18; }
.rf-hero h3 { margin: 0 0 4px; font-family: var(--serif); color: #e0c8ff; font-size: 18px; }
.rf-hero p { margin: 4px 0; color: var(--dim); font-size: 12px; }
.rf-run { border: 1px solid #8a5aff; border-radius: 10px; padding: 10px; margin-bottom: 12px; background: #160f22; box-shadow: 0 0 16px rgba(140,90,255,.25); }
.rf-run .big { font-size: 22px; font-family: var(--serif); color: #fff; }
.rf-bar { height: 12px; background: #221a30; border-radius: 6px; overflow: hidden; border: 1px solid #3a2a50; margin: 6px 0; }
.rf-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #7a4aff, #ff5ad0); transition: width .2s; }
.rf-pick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.rf-pick .lv { font-size: 26px; font-family: var(--serif); color: #e0c8ff; min-width: 64px; text-align: center; }
.rf-pick input { width: 70px; }
.rf-info { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin: 8px 0; }
.rf-info > div { background: #0f0d13; border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; font-size: 11px; color: var(--dim); }
.rf-info b { display: block; color: var(--text); font-size: 14px; }
.rf-guard { border-left: 3px solid #ff5ad0; padding: 4px 8px; margin: 8px 0; font-size: 12px; background: #1a1020; border-radius: 0 6px 6px 0; }
.rf-guard b { color: #ffb0e0; }
.gk-card { border: 1px solid var(--line); border-left: 4px solid var(--gc); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; background: linear-gradient(90deg, color-mix(in srgb, var(--gc) 16%, #120f16), #120f16 70%); }
.gk-card h4 { margin: 0; font-family: var(--serif); color: var(--gc); font-size: 15px; }
.gk-frags { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin: 6px 0; }
.gk-frags > div { text-align: center; font-size: 11px; border: 1px solid var(--line); border-radius: 6px; padding: 4px 2px; background: #0f0d13; color: var(--dim); }
.gk-frags > div.have { border-color: var(--gc); color: var(--text); box-shadow: inset 0 0 8px color-mix(in srgb, var(--gc) 35%, transparent); }
.gk-frags b { display: block; font-size: 15px; }
.gk-odds { font-weight: 700; } .gk-odds.hi { color: #6ee08a; } .gk-odds.mid { color: #ffd060; } .gk-odds.lo { color: #ff7a6a; }
table.rf-hist { width: 100%; border-collapse: collapse; font-size: 12px; }
table.rf-hist th { color: var(--dim); font-weight: 400; text-align: left; border-bottom: 1px solid var(--line); padding: 3px 4px; }
table.rf-hist td { padding: 3px 4px; border-bottom: 1px solid #1d1822; }
table.rf-hist .ok { color: #6ee08a; } table.rf-hist .ng { color: #ff7a6a; }
@media (max-width: 760px) { .rf-info { grid-template-columns: 1fr 1fr; } .gk-frags { grid-template-columns: 1fr 1fr; } }
`;

let tab = 'rift';
let sel = null;

function tabs(ui) {
  const items = [['rift', '深淵の裂け目'], ['torment', '魔境'], ['gate', '門番'], ['log', '記録']];
  return h('div.tabs', items.map(([id, name]) => h(`button.tab${tab === id ? '.on' : ''}`, { onclick: () => { tab = id; ui.renderPanel(); } }, name)));
}

function runBox(ui) {
  const g = ui.game;
  const R = g.state.world.rift;
  const r = R.run;
  const box = h('div.rf-run');
  const t = h('div.big');
  const bar = h('div.rf-bar', h('i'));
  const sub = h('div.dim');
  box.append(h('div', `深淵の裂け目　段階 ${r.level}`), t, bar, sub, h('div.toolbar', [button('裂け目から戻る（報酬なし）', async () => { if (await ui.confirm('裂け目から戻りますか？ この挑戦の報酬はもらえません。', '戻る')) { g.sys.rift.abandon(); ui.renderPanel(); } }, { class: 'btn-small' })]));
  let seen = false;
  const upd = () => {
    if (!box.isConnected) { if (!seen) setTimeout(upd, 50); return; }
    seen = true;
    const rr = g.state.world.rift.run;
    if (!rr) { ui.renderPanel(); return; }
    const p = Math.min(1, rr.progress / rr.need);
    t.textContent = `残り ${fmtClock(rr.timeLeft)}　${rr.phase === 'guardian' ? '守護者を倒せ！' : rr.phase === 'done' ? (rr.ok ? '踏破！' : '終了') : `進行 ${Math.floor(p * 100)}%`}`;
    bar.firstChild.style.width = `${p * 100}%`;
    sub.textContent = `倒した敵 ${rr.kills}　倒れた回数 ${rr.deaths}　守護者「${guardianFor(rr.level)?.name || ''}」`;
    setTimeout(upd, 250);
  };
  upd();
  return box;
}

function riftTab(ui, el) {
  const g = ui.game;
  const sys = g.sys.rift;
  const R = g.state.world.rift;
  const hero = h('div.rf-hero', [
    h('h3', '深淵の裂け目'),
    h('p', `段階を選んで挑む、制限時間 ${Math.round(BAL.rift(1).timeLimit / 60)} 分の深い潜り。敵を倒して進行を ${RIFT.need} ためると守護者が現れます（ふつうの敵 ${RIFT.value.normal}・チャンピオン ${RIFT.value.champion}・群れの長 ${RIFT.value.rare}）。`),
    h('p', `守護者を倒せば踏破。残り時間が 40% 以上なら 2 段上まで、60% 以上なら 3 段上まで開きます。倒れると 1 回目 -${RIFT.deathPenalty[0]} 秒、2 回目から -${RIFT.deathPenalty[1]} 秒。同じ段階の敵の並びはいつも同じです。`),
  ]);
  el.append(hero);
  if (!sys.available()) {
    el.append(h('section.sec', [h('h3.sec-title', 'まだ開いていません'), h('p', '第十章「深淵の玉座」で深淵王を倒すと開きます。'), h('ul.dim', [
      h('li', '報酬: 深淵の欠片（商人の目利きに使う）・大量のゴールドと経験値・レジェンダリー確定の装備'),
      h('li', '深淵の宝石の強化（踏破の早さで上がり方が変わる）'),
      h('li', '最高記録と、段階ごとの最短時間'),
    ])]));
    return;
  }
  if (g.state.world.mode === 'rift' && R.run) el.append(runBox(ui));
  if (g.state.world.mode === 'gate') el.append(h('div.hint', '門番と戦っています。終わると選べます。'));
  const max = R.unlocked || 1;
  if (sel === null || sel > max) sel = R.runs ? Math.min(max, R.level || max) : max;
  const info = sys.info(sel);
  const lvEl = h('span.lv', String(sel));
  const set = (v) => { sel = Math.max(1, Math.min(max, v)); ui.renderPanel(); };
  el.append(h('section.sec', [
    h('h3.sec-title', ['段階を選ぶ', h('span.sec-right', `最高記録 ${R.best || 0}　選べる最大 ${max}`)]),
    h('div.rf-pick', [
      button('−10', () => set(sel - 10), { class: 'btn-small' }), button('−1', () => set(sel - 1), { class: 'btn-small' }),
      lvEl,
      button('+1', () => set(sel + 1), { class: 'btn-small' }), button('+10', () => set(sel + 10), { class: 'btn-small' }),
      button('最大', () => set(max), { class: 'btn-small' }),
      h('input', { type: 'number', min: 1, max, value: sel, onchange: (e) => set(Number(e.target.value) || 1) }),
    ]),
    h('div.rf-info', [
      h('div', [h('b', `Lv ${info.areaLevel}`), '敵のレベル']),
      h('div', [h('b', `×${fmt(info.d.riftLife, { dec: 2 })}`), '敵のライフ（段階）']),
      h('div', [h('b', `×${fmt(info.d.riftDmg, { dec: 2 })}`), '敵の攻撃（段階）']),
      h('div', [h('b', `${Math.round(info.time / 60)} 分`), '制限時間']),
      h('div', [h('b', info.resPenalty ? `-${info.resPenalty}` : 'なし'), `耐性の減り（魔境 ${riftTormentTier(sel) ? roman(riftTormentTier(sel)) : 'なし'} 相当）`]),
      h('div', [h('b', R.bestTime?.[sel] ? fmtClock(R.bestTime[sel]) : '—'), 'この段階の最短']),
      h('div', [h('b', `${info.shards}〜${info.shards + 1}`), '深淵の欠片']),
      h('div', [h('b', `${info.items} 個`), '装備（1 つはレジェンダリー）']),
      h('div', [h('b', `+${info.d.mf}%`), 'レア発見率']),
    ]),
    h('div.rf-guard', [h('b', `守護者「${info.guardian.name}」`), `　${info.guardian.desc || ''}`, h('div.dim', `特技: ${(info.guardian.abilities || []).map((a) => BOSS_ABILITIES[a]?.name).filter(Boolean).join('・')}　（5 段ごとに入れ替わる）`)]),
    h('div.toolbar', [
      button(`段階 ${sel} に挑む`, () => { const r = sys.begin(sel); if (!r.ok) ui.toast(r.msg, 'bad'); else ui.toast(`深淵の裂け目 段階 ${sel}`, 'rift'); ui.renderPanel(); }, { kind: 'primary' }),
      h('label', ['終わったら ', h('select', { onchange: (e) => { sys.setAuto(e.target.value); } }, [
        ['off', '物語に戻る'], ['same', '同じ段階にもう一度'], ['push', '記録を目指して続ける（失敗したら 1 段下げる）'],
      ].map(([v, l]) => h('option', { value: v, selected: (R.auto || 'off') === v || undefined }, l)))]),
    ]),
    h('div.hint', '敵のライフと攻撃は「段階の倍率」に加えて、レベル 100 の敵の強さが土台になります。挑んでいる間の耐性の減りは段階に合わせて決まり、物語の魔境の設定は戻ったときに元に戻ります。'),
  ]));
  el.append(h('div.dim.small', `挑戦 ${R.runs || 0} 回・踏破 ${R.clears || 0} 回`));
}

function gateTab(ui, el) {
  const g = ui.game;
  const sys = g.sys.rift;
  const w = g.state.world;
  el.append(h('section.sec', [
    h('h3.sec-title', '門番'),
    h('p.dim', `魔境（I 以上）で地域のボス（各章の 1〜4 番目）を倒すと、50% + 魔境の段 × 2%（最大 80%）で「門の欠片」が落ちます。2 章で 1 組、4 種そろうと門番を呼べます（制限 ${GATE.time} 秒）。`),
    h('p.dim', `勝てば レジェンダリー 2 つを含む装備 5 つ・深淵の欠片・次の門の欠片（必ず 1 つ）。ミシックは ${Math.round(GATE.mythicBase * 100)}% + 魔境の段 × ${(GATE.mythicPerTier * 100).toFixed(1)}%（最大 ${Math.round(GATE.mythicCap * 100)}%）。負けても欠片を ${GATE.refund} つ取り戻します。初めて倒した門番 1 体ごとに、永続で全ダメージ +${GATE.badge.dmg}%・ライフ +${GATE.badge.life}%（門番の証）。`),
  ]));
  if ((w.maxTorment || 0) < 1) { el.append(h('p', '魔境が開くと集められます（第十章の深淵王を倒す）。')); return; }
  for (const s of sys.gateStatus()) {
    const odds = sys.gateOdds(s.gi);
    const pct = Math.round(odds.win * 100);
    const spec = sys.gateSpec(s.gi);
    const card = h('div.gk-card', { style: { '--gc': s.group.color } }, [
      h('h4', `${s.group.name}　${s.keeper?.name || ''}`),
      h('div.dim.small', `${s.keeper?.desc || ''}　特技: ${(s.keeper?.abilities || []).map((a) => BOSS_ABILITIES[a]?.name).filter(Boolean).join('・')}`),
      h('div.gk-frags', s.group.frags.map((nm, k) => h(`div${s.have[k] ? '.have' : ''}`, [h('b', String(s.have[k])), nm]))),
      h('div.wm-row', [
        h('span', ['推定勝率 ', h(`span.gk-odds.${pct >= 70 ? 'hi' : pct >= 35 ? 'mid' : 'lo'}`, `${pct}%`)]),
        h('span.dim.small', `（Lv ${spec.level}・ライフ ${fmt(spec.life)}・必要 DPS ${fmt(odds.need)} ／ 今 ${fmt(odds.dps)}）`),
        s.kills ? h('span.ok.small', `撃破 ${s.kills}`) : null,
      ]),
      h('div.toolbar', [button(s.ready ? '門番を呼ぶ' : '欠片が足りない', () => { const r = sys.summonGate(s.gi); if (!r.ok) ui.toast(r.msg, 'bad'); ui.renderPanel(); }, { kind: s.ready ? 'primary' : null, disabled: !s.ready || w.mode === 'gate' })]),
    ]);
    el.append(card);
  }
  el.append(h('div.hint', `推定勝率は、今の火力（ばらつき ±15%）と受けるダメージ（±25%）で 100 回戦った見積もりです。挑む魔境の段は今の段（最低 I）。`));
}

function logTab(ui, el) {
  const g = ui.game;
  const R = g.state.world.rift;
  const w = g.state.world;
  const rows = (R.history || []).map((x) => h('tr', [
    h('td', String(x.lv)), h(`td.${x.ok ? 'ok' : 'ng'}`, x.ok ? '踏破' : x.abandoned ? '中断' : '時間切れ'), h('td', fmtClock(x.time)), h('td', String(x.deaths || 0)), h('td', String(x.kills || 0)), h('td', x.shards ? `欠片 ${x.shards}${x.items ? `・装備 ${x.items}` : ''}` : '—'), h('td.dim', x.at ? new Date(x.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''),
  ]));
  el.append(h('section.sec', [
    h('h3.sec-title', ['裂け目の記録', h('span.sec-right', `最高 ${R.best || 0}`)]),
    rows.length ? h('table.rf-hist', [h('tr', ['段階', '結果', '時間', '倒れた', '撃破', '報酬', '日時'].map((t) => h('th', t))), ...rows]) : h('p.dim', 'まだ挑んでいません。'),
  ]));
  const gh = (w.gate.history || []).map((x) => h('tr', [h('td', GATE_GROUPS[x.gi]?.name || ''), h(`td.${x.ok ? 'ok' : 'ng'}`, x.ok ? (x.mythic ? '勝利（ミシック！）' : '勝利') : '敗北'), h('td', `魔境 ${roman(x.tier || 1)}`), h('td.dim', x.ok ? `装備 ${x.items}・欠片 ${x.shards}・${x.next}` : `返った欠片 ${(x.refund || []).join('・')}`)]));
  el.append(h('section.sec', [h('h3.sec-title', '門番の記録'), gh.length ? h('table.rf-hist', [h('tr', ['門', '結果', '段', '内容'].map((t) => h('th', t))), ...gh]) : h('p.dim', 'まだ戦っていません。')]));
  const st = g.state.meta.stats;
  el.append(h('div.dim.small', `ため込み屋 撃破 ${st.goblins || 0}・逃がした ${w.goblinEscaped || 0}　遊んだ時間 ${fmtTime(g.state.playTime)}`));
}

export const riftPanel = {
  id: 'rift', name: '裂け目', icon: '🌀',
  refreshOn: ['world', 'level'],
  visible: () => true,
  badge: (g) => (g.sys.rift?.gateStatus?.().some((s) => s.ready) ? 1 : 0),
  help: '<p><b>深淵の裂け目</b>は物語の後の終わりのない挑戦です。段階が上がるほど敵は強く、報酬は良くなります。</p><p><b>魔境</b>は物語の地域の難しさです。<b>門番</b>は魔境で集めた欠片で呼ぶ強敵で、ミシックを落とすことがあります。</p>',
  render(ui, el) {
    injectCss('world', WORLD_CSS);
    injectCss('world-rift', RIFT_CSS);
    el.append(tabs(ui));
    if (tab === 'rift') riftTab(ui, el);
    else if (tab === 'torment') el.append(tormentSelector(ui));
    else if (tab === 'gate') gateTab(ui, el);
    else logTab(ui, el);
  },
};
