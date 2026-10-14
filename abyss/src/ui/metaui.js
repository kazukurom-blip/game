// メタ担当の窓で共通に使う部品（見た目・知らせ・進み具合の棒・タブ）。
// 転生・実績・図鑑・日課・ペット・記録の窓と「おかえり」の報告から使う。
// 知らせ（トースト）は hudHooks.build で UI ができたときに game.events とつなぐ（タイトルに戻って始め直しても二重にならない）。

import { h, injectCss } from './dom.js';
import { hudHooks } from './hud.js';
import { MATERIAL } from '../data/materials.js';
import { fmt } from '../engine/format.js';
import { assets } from '../render/assets.js';
import { PET } from '../data/pets.js';
import { MONSTER, FAMILIES } from '../data/monsters.js';
import { ensurePetPainter, drawPetUnit } from './petart.js';
import { sceneHooks } from '../render/scene.js';

export const MAT_NAMES = { scrap: '鉄屑', dust: '魔塵', crystal: '秘晶', echo: '伝説の残響', core: '極致の核', shard: '深淵の欠片' };
export const matName = (id) => MATERIAL[id]?.name || MAT_NAMES[id] || id;
export const matColor = (id) => MATERIAL[id]?.color || '#aaa';

/** 素材の一覧（チップ） */
export function matChips(mats, opts = {}) {
  const list = Object.entries(mats || {}).filter(([, v]) => v > 0);
  if (!list.length) return opts.empty ? h('span.dim', opts.empty) : null;
  return h('div.mt-chips', list.map(([k, v]) => h('span.mt-chip', [h('i', { style: { background: matColor(k) } }), `${matName(k)} `, h('b', `${opts.plus === false ? '' : '+'}${fmt(v)}`)])));
}

/** 進み具合の棒 */
export function bar(pct, text = '', cls = '') {
  const p = Math.max(0, Math.min(100, pct || 0));
  return h(`div.mt-bar${cls ? `.${cls}` : ''}`, [h('i', { style: { width: `${p}%` } }), text ? h('span', text) : null]);
}

/** 小さな数字のカード */
export function card(k, v, sub = null, cls = '') {
  return h(`div.mt-card${cls ? `.${cls}` : ''}`, [h('div.k', k), h('div.v', v), sub ? h('div.s', sub) : null]);
}

/** タブ。list: [[id, 名前, 数?]]、cur: 今の id、set(id) */
export function tabs(list, cur, set) {
  return h('div.tabs', list.map(([id, name, n]) => h(`button.tab${cur === id ? '.on' : ''}`, { onclick: () => set(id) }, [name, n ? h('span.mt-tabn', String(n)) : null])));
}

/** el がページにある間だけ fn を ms ごとに呼ぶ（棒の更新など。描き直しをしない） */
export function live(el, ms, fn) {
  const id = setInterval(() => {
    if (!el.isConnected) { clearInterval(id); return; }
    try { fn(); } catch (e) { clearInterval(id); console.error(e); }
  }, ms);
  return id;
}

export function setBar(barEl, pct, text) {
  if (!barEl) return;
  const p = Math.max(0, Math.min(100, pct || 0));
  barEl.firstChild.style.width = `${p}%`;
  if (text !== undefined && barEl.lastChild && barEl.lastChild !== barEl.firstChild) barEl.lastChild.textContent = text;
}

// ---------------- 知らせ
let offs = [];
let badgeTimer = null;

export function bindMetaUi(ui) {
  for (const f of offs) { try { f(); } catch { /* 無視 */ } }
  offs = [];
  if (badgeTimer) clearInterval(badgeTimer);
  ensurePetPainter(assets, PET);
  const ev = ui.game.events;
  const on = (t, fn) => offs.push(ev.on(t, (e) => { try { fn(e || {}); } catch (err) { console.error(err); } }));
  // まとめて届いた知らせは 1 つにする（画面を埋めないように）
  const batch = (fmt1, fmtN, kind, ms = 900) => {
    let list = []; let timer = null;
    return (item) => {
      list.push(item);
      if (timer) return;
      timer = setTimeout(() => { const l = list; list = []; timer = null; ui.toast(l.length === 1 ? fmt1(l[0]) : fmtN(l), kind); }, ms);
    };
  };
  const achToast = batch((d) => `🏆 実績「${d.name}」を達成　+${d.points} pt`, (l) => `🏆 実績を ${l.length} 個達成（「${l[0].name}」ほか）　+${l.reduce((sum, d) => sum + d.points, 0)} pt`, 'good.mtach');
  const monToast = batch((id) => `📖 魔物図鑑に「${MONSTER[id]?.name || '新しい魔物'}」を登録`, (l) => `📖 魔物図鑑に ${l.length} 種類を登録（「${MONSTER[l[0]]?.name || ''}」ほか）`, '', 1500);
  on('achievement', (e) => achToast(e.def));
  const titleToast = batch((t) => `称号「${t.name}」を手に入れた（実績の窓で選べる）`, (l) => `称号を ${l.length} つ手に入れた（「${l[0].name}」ほか。実績の窓で選べる）`, 'level');
  on('titleUnlocked', (e) => titleToast(e.title));
  on('prestigeUnlocked', () => ui.toast('♻ 転生が解放された！ 転生の窓で魂の見込みを確かめよう', 'level.mtbig'));
  on('rebirth', (e) => ui.toast(`♻ 転生した　魂 +${fmt(e.souls)}（${e.count} 回目）`, 'level.mtbig'));
  on('transcend', (e) => ui.toast(`✧ 超越した　星晶 +${e.stars}`, 'level.mtbig'));
  on('automationUnlocked', (e) => ui.toast(`⚙ 自動化「${e.name}」を解放した（転生の窓の「自動化」で ON/OFF）`, 'good'));
  on('eggFound', (e) => ui.toast(`🥚 ${e.name}${e.n > 1 ? ` ×${e.n}` : ''} を手に入れた！ ペットの窓で孵卵器へ`, 'good.mtegg'));
  on('eggReady', (e) => { if (!ui.game.state.meta.unlocks.autoHatch) ui.toast(`🥚 ${e.name || '卵'}が孵ります！ ペットの窓で孵そう`, 'good.mtegg'); });
  on('petHatched', (e) => ui.toast(e.dup ? (e.stars ? `🐾 ${e.name} が重なった　進化 ★${e.stars}` : `🐾 ${e.name} が重なった　経験値 +`) : `🐾 ${e.name} が生まれた！`, e.rarity === 'legendary' ? 'r-legendary' : 'good'));
  on('petLevel', (e) => ui.toastOnce(`pl-${e.id}`, `🐾 ${e.name} が Lv ${e.lvl} になった`, 'good'));
  on('bountyDone', (e) => ui.toast(`📜 ${e.name} を達成！ 日課の窓で受け取れます`, 'good'));
  on('loginClaim', (e) => ui.toast(`🎁 ログインの贈り物（${e.day} 日目）を受け取った`, 'good'));
  on('collectionFind', (e) => ui.toast(`📖 宝物図鑑に「${e.name}」を登録`, 'good.mtcol'));
  on('bestiaryNew', (e) => monToast(e.id));
  on('bestiaryTier', (e) => { if (e.tier >= 3) ui.toast(`📖 魔物図鑑「${MONSTER[e.id]?.name || ''}」が段 ${e.tier} に（${MONSTER[e.id] ? `${FAMILIES[MONSTER[e.id].family] || ''}へのダメージ +1%` : ''}）`, 'good'); });
  on('metaChanged', (e) => { ui.markDirty('meta'); if (e.kind) ui.markDirty(`meta:${e.kind}`); });
  on('unlocksChanged', () => ui.markDirty('meta'));
  badgeTimer = setInterval(() => { if (!ui.root?.isConnected) { clearInterval(badgeTimer); return; } ui.markDirty('badge'); }, 2000);
}

hudHooks.build.push((hud) => { bindMetaUi(hud.ui); return null; });
// HUD の左上に出す一行: 転生できるとき・卵が孵るとき（0.1 秒ごとに呼ばれるので軽く）
hudHooks.lines.push((g) => {
  const ps = g.sys.prestige;
  if (ps?.isUnlocked() && g.state.world.mode === 'campaign') {
    const n = ps.previewSouls();
    if (n > 0 && ps.canRebirth().ok) return { text: `♻ 転生できます（魂 +${fmt(n)}）`, cls: 'mt-hud-soul' };
  }
  const pets = g.sys.pets;
  if (pets && !g.state.meta.unlocks.autoHatch && pets.hatchReady() > 0) return { text: '🥚 卵が孵ります（ペットの窓）', cls: 'mt-hud-egg' };
  return null;
});
// 連れているペット（combat.units の外にいるので、ここで描く）
sceneHooks.drawFx.push((scene, ctx) => { try { drawPetUnit(scene, ctx, assets, PET); } catch (e) { console.error(e); } });

// ---------------- 見た目
injectCss('meta-ui', `
.mt-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin: 6px 0 10px; }
.mt-card { background: linear-gradient(#18141d, #110e15); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; min-width: 0; }
.mt-card .k { color: var(--dim); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mt-card .v { font-size: 17px; color: var(--gold2); font-weight: 800; font-family: var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mt-card .s { font-size: 10.5px; color: var(--dim); }
.mt-card.soul .v { color: #9ad0ff; } .mt-card.star .v { color: #ffe08a; } .mt-card.good .v { color: var(--good); }
.mt-bar { position: relative; height: 12px; background: #0c0a10; border: 1px solid #3a3142; border-radius: 7px; overflow: hidden; }
.mt-bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #6a3ab0, #c890ff); transition: width .3s; }
.mt-bar > span { position: absolute; inset: 0; font-size: 9.5px; line-height: 11px; text-align: center; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; white-space: nowrap; }
.mt-bar.gold > i { background: linear-gradient(90deg, #8a5a1a, #f5d98a); }
.mt-bar.good > i { background: linear-gradient(90deg, #2a7a3a, #8af0a0); }
.mt-bar.soul > i { background: linear-gradient(90deg, #2a5a9a, #9ad0ff); }
.mt-bar.red > i { background: linear-gradient(90deg, #8a1a12, #ff7a5a); }
.mt-bar.tall { height: 16px; } .mt-bar.tall > span { line-height: 15px; font-size: 11px; }
.mt-chips { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 12px; }
.mt-chip { display: inline-flex; align-items: center; gap: 3px; background: #15111a; border: 1px solid #2a2230; border-radius: 10px; padding: 1px 8px; }
.mt-chip i { width: 8px; height: 8px; transform: rotate(45deg); border-radius: 2px; display: inline-block; }
.mt-chip b { color: var(--gold2); }
.mt-tabn { margin-left: 5px; background: #c2382a; color: #fff; border-radius: 8px; font-size: 10px; padding: 0 5px; }
.mt-box { background: linear-gradient(160deg, #1d1726, #120f16 60%); border: 1px solid var(--line2); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
.mt-box h4 { margin: 0 0 4px; font-family: var(--serif); color: var(--gold2); font-size: 15px; }
.mt-note { font-size: 11.5px; color: var(--dim); line-height: 1.6; }
.mt-lock { text-align: center; padding: 18px 10px; color: var(--dim); }
.mt-lock b { color: var(--gold2); }
.mt-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.mt-grow { flex: 1; min-width: 0; }
.mt-list { display: flex; flex-direction: column; gap: 6px; }
.toast.mtach { border-color: var(--gold); color: var(--gold2); }
.toast.mtbig { font-size: 15px; font-weight: 800; box-shadow: 0 0 22px rgba(154,208,255,.35); border-color: #6aa0ff; color: #cfe6ff; }
.toast.mtegg { border-color: #c77dff; }
.hud-line.mt-hud-soul { color: #9ad0ff; background: rgba(10,16,30,.75); border: 1px solid #3a5a8a; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.hud-line.mt-hud-egg { color: #e0b0ff; background: rgba(20,10,30,.75); border: 1px solid #5a3a8a; border-radius: 6px; padding: 2px 8px; font-size: 12px; } .toast.mtcol { border-color: var(--r-unique); }
.mt-medal { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 900; color: #1a1208; flex: none;
  background: radial-gradient(circle at 35% 30%, #fff8, transparent 45%), var(--mc, #6a5a4a); box-shadow: inset 0 -2px 0 #0005, 0 0 0 1px #0008; }
.mt-medal.off { filter: grayscale(1) brightness(.45); }
.mt-cards.w { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); }
@media (max-width: 900px) { .mt-cards, .mt-cards.w { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`);
