// 戦闘担当が足す能力（パッシブの星座盤・パラゴン・要石で使う）。名前はツールチップに出る。
import { registerStat } from '../../../data/stats.js';
import { KEYSTONES } from '../../../data/tree.js';

for (const [t, n] of [['trap', '罠'], ['aura', 'オーラ'], ['channel', '詠唱'], ['ult', '奥義'], ['curse', '呪い'], ['movement', '移動']]) {
  registerStat(`inc_${t}`, `${n}スキルのダメージ`, { tag: t });
}
registerStat('curse_eff', '呪いの効果', { desc: '呪いの被ダメージ増加・与ダメージ減少・鈍足が強くなる' });
registerStat('glyph_find', '補助の刻印の発見率', { cat: 'utility', desc: '補助の刻印が落ちやすくなる' });
registerStat('mastery_xp', '熟練度の伸び', { cat: 'utility', desc: 'スキルの熟練度が早く上がる' });
for (const k of KEYSTONES) registerStat(`ks_${k.id}`, `要石「${k.name}」`, { kind: 'flat', cat: 'keystone', desc: k.desc, keystone: k.id });
