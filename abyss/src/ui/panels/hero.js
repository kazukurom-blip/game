// 装備の窓: 着せ替えの絵・装備の枠・おもな能力。

import { h } from '../dom.js';
import { fmt, fmtPct } from '../../engine/format.js';
import { equipSlot, kvTable } from './common.js';
import { CLASS } from '../../data/classes.js';
import { drawHero, heroLook } from '../../render/paperdoll.js';
import { estimateDps } from '../../game/skills.js';
import { effectiveLife, armorReduction } from '../../game/character.js';

export const heroPanel = {
  id: 'hero', name: '装備', icon: '🛡',
  refreshOn: ['gear', 'inv', 'level', 'stats', 'skills'],
  key: 'I',
  help: '<p>着ている装備と、おもな能力です。装備の枠を押すと外せます（マウスを乗せると詳しい説明）。</p><p>持ち物の窓でアイテムを押すと、今の装備と比べて「火力 ▲12% ／ 耐久 ▼3%」のように出ます。▲ の付いた物は今より強くなりそうな物です。</p><p>レアリティは色のほかに、マスの左下の 1 文字（並・魔・稀・秀・伝・組・唯・神）でも分かります。★ は覚醒、✦ は極致（オプションの数値が高い品質）。</p>',
  render(ui, el) {
    const g = ui.game;
    const st = g.state;
    const H = g.H;
    const cls = CLASS[st.hero.cls];
    // 着せ替えの絵
    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 420; cv.className = 'doll';
    const ctx = cv.getContext('2d');
    const look = heroLook(st);
    const draw = (t) => {
      if (!cv.isConnected) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const gr = ctx.createRadialGradient(180, 260, 20, 180, 260, 220);
      gr.addColorStop(0, `${cls.color}55`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 360, 420);
      drawHero(ctx, { anim: { s: 'idle', t: 0 }, face: 1, hitFlash: 0 }, 180, 390, { look, t: t / 1000, scale: 1.75 });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    const L = ['helm', 'amulet', 'chest', 'gloves', 'belt'];
    const R = ['weapon', 'offhand', 'ring1', 'ring2', 'legs', 'boots'];
    el.append(h('div.equip-grid', [
      h('div.eqcol', L.map((s) => equipSlot(ui, s))),
      h('div.dollwrap', [cv, h('div.dollname', [h('b', st.hero.name), `${st.hero.name === cls.name ? '' : ` ${cls.name}`}　Lv ${st.hero.level}${st.hero.level >= 100 ? `　アビスLv ${st.hero.paragon.level}` : ''}`])]),
      h('div.eqcol', R.map((s) => equipSlot(ui, s))),
    ]));
    const basic = st.hero.bar.find(Boolean);
    const dps = basic ? estimateDps(st, H, basic) : 0;
    el.append(h('div.statgrid', [
      kvTable([
        ['火力（基本攻撃）', fmt(dps)],
        ['武器ダメージ', `${fmt(H.weapon.min)}〜${fmt(H.weapon.max)}`],
        ['攻撃速度', `${H.aps.toFixed(2)} 回/秒`],
        ['クリティカル', `${fmtPct(H.critChance * 100)} ／ ×${H.critMult.toFixed(2)}`],
        ['ダメージ増加', fmtPct(H.incBase)],
        [cls.primary === 'str' ? '筋力' : cls.primary === 'dex' ? '敏捷' : '知力', fmt(H.primary)],
      ]),
      kvTable([
        ['最大ライフ', fmt(H.life)],
        ['耐久力（目安）', fmt(effectiveLife(H))],
        ['アーマー', `${fmt(H.armor)}（${fmtPct(armorReduction(H.armor, st.hero.level) * 100)} 軽減）`],
        ['耐性 火/冷/雷/毒', `${Math.round(H.res.fire)} / ${Math.round(H.res.cold)} / ${Math.round(H.res.lightning)} / ${Math.round(H.res.poison)}`],
        ['回避 / ブロック', `${fmtPct(H.dodge * 100)} / ${fmtPct(H.block * 100)}`],
        ['ライフ再生', `${fmt(H.lifeRegen)}/秒`],
      ]),
      kvTable([
        ['移動速度', fmtPct((H.move / 220 - 1) * 100)],
        ['レア発見率', fmtPct(H.mf)],
        ['ゴールド獲得', fmtPct(H.gold)],
        ['経験値', fmtPct(H.xp)],
      ]),
    ]));
    el.append(h('div.hint', '装備の枠を押すと外せます。持ち物の窓でアイテムを押すと装備できます。'));
  },
};
