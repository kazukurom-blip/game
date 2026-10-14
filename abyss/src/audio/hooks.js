// 出来事 → 音。音の担当はゲームの中身を書き換えず、次の 2 つを聞くだけ:
//   1) 戦闘の画面の出来事（sceneHooks.onFx: combat.fx の 1 件ずつ。画面に映っているときだけ届く）
//   2) game.events（すべての出来事を '*' で受け取り、下の表で音に変える）
//
// ほかの担当へ: 好きな音を鳴らしたいときは、どちらでもよい
//   - game.events.emit('sfx', { id: 'enhance_ok' })        … 効果音 ID は src/audio/sfx.js（設定の「音の差し替え」にも一覧）
//   - fx（combat.emit）に sfx: '<id>' を付ける               … 例 c.emit({ t: 'meteor', x, y, sfx: 'explosion' })
//   - import { audio } from '../audio/audio.js'; audio.play('craft')
// 下の表にある出来事の名前で emit すれば、何もしなくても音が付く（名前は先頭が正式。後ろは別名として受け付ける）。

import { statusDefs } from '../game/combat.js';
import { VIEW_W } from '../render/scene.js';

const HIT = { phys: 'hit_phys', fire: 'hit_fire', cold: 'hit_cold', lightning: 'hit_lightning', poison: 'hit_poison', void: 'hit_void' };
const EL_RATE = { phys: 1, fire: 0.92, cold: 1.12, lightning: 1.22, poison: 0.86, void: 0.78 };
const CAST_BY_BEHAVIOR = {
  rain: 'cast_spell', meteor: 'cast_spell', leap: 'leap', dash: 'dash', beam: 'beam', whirl: 'swing_heavy', aura: 'buff',
  trap: 'trap', totem: 'trap', turret: 'trap', curse: 'curse', barrier: 'shield', shield: 'shield', wall: 'cast_spell', wave: 'cast_spell',
  dot: 'cast_dark', cloud: 'cast_dark', orbit: 'cast_spell', teleport: 'dash', blink: 'dash',
};
const SKIP_CAST = { melee: 1, nova: 1, chain: 1, summon: 1, buff: 1 };
// fx の種類 → 音（combat.js の fx の一覧に合わせる。知らない種類は鳴らさない）
const FX_SIMPLE = {
  chain: 'chain', summon: 'summon', buff: 'buff', revive: 'revive', ult: 'ult', beam: 'beam', leap: 'leap', dash: 'dash',
  meteor: 'explosion', explosion: 'explosion', impact: 'explosion', trap: 'trap', totem: 'trap', turret: 'trap', curse: 'curse',
  shield: 'shield', barrier: 'shield', whirl: 'swing_heavy', aura: 'buff', teleport: 'dash', blink: 'dash', telegraph: 'telegraph',
  warn: 'telegraph', warning: 'telegraph', goblin: 'goblin', slam: 'enemy_slam', wave: 'nova', wall: 'nova', freeze: 'freeze',
  shock: 'shock', stun: 'stun', crit: 'crit', proc: 'craft', cloud: 'cast_dark',
};

/** game.events の名前 → 音（関数なら payload から決める） */
export const EVENT_SFX = {
  zoneClear: (p) => (p?.first ? 'zone_clear' : null),
  bossFail: 'boss_fail',
  bagFull: 'bag_full',
  autoEquip: 'equip',
  gearChanged: 'equip',
  invChanged: (p) => (p?.salvaged > 0 ? 'salvage' : p?.sold > 0 ? 'buy' : null),
  offlineReport: 'offline',
  // 鍛冶・宝石（アイテム担当）
  enhance: enhanceSfx, enhanceResult: enhanceSfx, enhanced: enhanceSfx,
  craft: craftSfx, crafted: craftSfx,
  gemCombine: 'gem_combine', gemsCombined: 'gem_combine', gemFuse: 'gem_combine', gemFused: 'gem_combine',
  socket: 'socket', socketed: 'socket', gemSocket: 'socket', gemSocketed: 'socket', runeword: 'set_bonus',
  unsocket: 'ui_click',
  reroll: 'reroll', corrupt: 'corrupt', extract: 'craft', codexEquip: 'socket',
  gamble: 'buy', merchantBuy: 'buy', buy: 'buy', purchase: 'buy', sell: 'buy', bagExpand: 'unlock',
  setBonus: 'set_bonus', setComplete: 'set_bonus',
  // メタ（転生・実績・日課・ペット）
  rebirth: 'prestige', prestige: 'prestige', transcend: 'prestige', ascend: 'prestige',
  achievement: 'achievement', achievementUnlocked: 'achievement', achieve: 'achievement', titleUnlocked: 'achievement',
  bountyComplete: 'notify', bountyDone: 'notify', bountyClaim: 'chest', chestOpen: 'chest', chest: 'chest', dailyClaim: 'chest', loginReward: 'chest',
  petHatch: 'pet_hatch', hatch: 'pet_hatch', eggHatched: 'pet_hatch', petLevel: 'notify', eggDrop: 'drop_epic',
  unlock: 'unlock', featureUnlock: 'unlock', unlocked: 'unlock',
  // ワールド（裂け目・ゴブリン・門番）
  riftStart: 'rift_start', riftComplete: 'rift_complete', riftClear: 'rift_complete', riftFail: 'boss_fail',
  riftEnd: (p) => (p?.success === false || p?.ok === false ? 'boss_fail' : 'rift_complete'),
  goblinSpawn: 'goblin', goblinKill: 'chest', goblinKilled: 'chest', goblinEscape: 'boss_fail',
  gatekeeperSpawn: 'boss_horn', tormentUnlock: 'unlock',
  // 戦闘/スキル
  masteryUp: 'notify', mastery: 'notify', glyphDrop: 'drop_rare', supportDrop: 'drop_rare', skillUnlock: 'unlock', treeAllocate: 'socket',
};
const DUCK_EVENTS = { rebirth: [0.3, 2.6], prestige: [0.3, 2.6], transcend: [0.3, 2.6], riftComplete: [0.4, 1.6], riftStart: [0.4, 1.4], achievement: [0.6, 0.8], zoneClear: [0.5, 1.2] };
const MUSIC_EVENTS = { stageStart: 1, bossSpawn: 1, zoneClear: 1, bossFail: 1, started: 1, riftStart: 1, riftComplete: 1, riftEnd: 1, riftFail: 1, gatekeeperSpawn: 1, modeChange: 1, travel: 1 };

function enhanceSfx(p) {
  if (p?.great || p?.crit || p?.critical || p?.result === 'great') return 'enhance_great';
  if (p?.ok === false || p?.success === false || p?.fail || p?.result === 'fail') return 'enhance_fail';
  return 'enhance_ok';
}
function craftSfx(p) {
  const k = p?.kind || p?.op || p?.type || '';
  if (k === 'enhance') return enhanceSfx(p);
  if (/reroll|chaos|bless|replace|enchant/.test(k)) return 'reroll';
  if (/corrupt/.test(k)) return 'corrupt';
  if (/socket|pierce|drill/.test(k)) return 'socket';
  if (p?.ok === false || p?.success === false) return 'ui_error';
  return 'craft';
}

/** 画面の位置 → 左右の振り分け（-0.6〜0.6） */
function panOf(scene, x) {
  if (typeof x !== 'number' || !scene) return 0;
  const p = (x - (scene.camX || 0)) / VIEW_W;
  return Math.max(-0.6, Math.min(0.6, (p - 0.5) * 1.3));
}

/** sceneHooks.onFx に登録する関数を作る。A は audio */
export function makeFxHandler(A) {
  return (scene, e) => {
    if (!A.engine.running || !e || !e.t) return;
    if (e.sfx) { A.play(e.sfx, { pan: panOf(scene, e.x) }); return; }
    const pan = panOf(scene, e.x ?? e.unit?.x);
    switch (e.t) {
      case 'dmg': {
        if (e.dot) return;
        if (e.team === 'hero') {
          if (!e.hero) return;
          const hero = scene?.game?.combat?.hero;
          const mx = hero?.maxLife || 0;
          const k = mx > 0 ? Math.min(1, (e.v || 0) / mx) : 0.1;
          A.play('hero_hurt', { vol: 0.6 + k * 2, pan });
          if (mx > 0 && hero.life > 0 && hero.life / mx < 0.3) A.play('low_life'); // ライフが 3 割を切ったら心音
          return;
        }
        if (e.crit) A.play('crit', { pan });
        else A.play(HIT[e.el] || 'hit_phys', { pan });
        return;
      }
      case 'swing':
        if (e.enemy) A.play('enemy_attack', { pan });
        else if (e.small) A.play('swing', { pan, vol: 0.5, rate: 1.15 });
        else A.play((e.r || 0) >= 110 ? 'swing_heavy' : 'swing', { pan });
        return;
      case 'cast': {
        const b = e.behavior;
        if (SKIP_CAST[b]) return;
        let id = CAST_BY_BEHAVIOR[b];
        const cls = scene?.game?.state?.hero?.cls;
        if (!id && b === 'projectile') {
          if (e.el === 'phys' || !e.el) id = cls === 'ranger' ? 'bow' : cls === 'assassin' ? 'throw' : cls === 'necromancer' ? 'cast_dark' : 'cast_spell';
          else id = cls === 'necromancer' && e.el !== 'fire' ? 'cast_dark' : cls === 'ranger' ? 'bow' : cls === 'assassin' ? 'throw' : 'cast_spell';
        }
        if (!id && e.el && e.el !== 'phys') id = 'cast_spell';
        if (id) A.play(id, { pan, rate: id === 'cast_spell' ? EL_RATE[e.el] || 1 : 1 });
        return;
      }
      case 'nova':
        A.play('nova', { pan, vol: e.small ? 0.55 : 1 });
        if (!e.small && e.el && e.el !== 'phys') A.play(HIT[e.el], { pan, vol: 0.6, min: 0.08 });
        return;
      case 'pulse': if (e.team !== 'hero') A.play('enemy_slam', { pan }); return;
      case 'death': {
        const u = e.unit || {};
        if (u.goblin || u.def?.goblin || u.flags?.goblin) { A.play('chest', { pan }); return; }
        if (u.boss) { A.play('kill_boss', { pan: 0 }); A.duck(0.4, 1.2); return; }
        const rate = Math.max(0.7, Math.min(1.25, 1 / Math.sqrt(u.size || 1))); // 大きい敵ほど低い音
        if (u.rank === 'champion' || u.rank === 'rare') { A.play('kill_elite', { pan, rate }); return; }
        A.play('kill', { pan, vol: 0.8, rate });
        return;
      }
      case 'loot': A.loot(e); return;
      case 'gold': A.play('gold', { pan }); return;
      case 'levelup': A.play(e.paragon ? 'paragon' : 'level_up'); A.duck(0.5, 0.8); return;
      case 'boss': A.play('boss_horn'); A.duck(0.3, 1.5); return;
      case 'text': {
        const t = e.text;
        if (t === '回避') A.play('dodge', { pan });
        else if (t === 'ブロック') A.play('block', { pan });
        else if (t === statusDefs.freeze?.name) A.play('freeze', { pan });
        else if (t === statusDefs.stun?.name) A.play('stun', { pan });
        else if (t === statusDefs.shock?.name) A.play('shock', { pan });
        return;
      }
      case 'status': {
        const id = e.id || e.status;
        if (id === 'freeze' || id === 'shock' || id === 'stun') A.play(id, { pan });
        return;
      }
      case 'heroDeath': A.play('hero_death'); A.duck(0.4, 1.6); A.engine.muffle?.(true); return;
      case 'revive': A.play('revive'); A.engine.muffle?.(false); return;
      case 'ult': A.play('ult'); A.duck(0.45, 1.1); return;
      default: {
        const id = FX_SIMPLE[e.t];
        if (id) A.play(id, { pan });
      }
    }
  };
}

/** game.events の '*' に登録する関数 */
export function makeEventHandler(A) {
  return ({ type, payload }) => {
    if (type === 'sfx') { if (payload?.id) A.play(String(payload.id).replace(/^sfx\./, ''), payload); return; }
    if (type === 'music') { A.music(payload?.id ?? 'auto'); return; }
    if (MUSIC_EVENTS[type]) A.onWorldEvent(type, payload);
    if (type === 'panelOpen') { A.uiSound('ui_open'); return; }
    const m = EVENT_SFX[type];
    if (!m || !A.engine.running) return;
    if (type === 'gearChanged' && A.sinceStart() < 1.5) return; // 始まった直後の着替えは鳴らさない
    const id = typeof m === 'function' ? m(payload) : m;
    if (!id) return;
    A.play(id);
    const dk = DUCK_EVENTS[type];
    if (dk) A.duck(dk[0], dk[1]);
  };
}

/** 画面のボタン・タブ・マス目を押したときの音（document で 1 か所だけ聞く） */
export function uiClickSound(target) {
  const el = target?.closest?.('button, .tab, .cell, .navbtn, .classcard, input[type=checkbox], select, .chk, .slot');
  if (!el) return null;
  if (el.matches('.navbtn')) return null; // 窓を開く音（panelOpen）にまかせる
  if (el.matches('.modal-x')) return 'ui_close';
  if (el.matches('input[type=checkbox], .chk')) return el.matches('.chk') && target.tagName !== 'INPUT' ? null : 'ui_toggle';
  if (el.matches('.tab')) return 'ui_tab';
  if (el.matches('.cell, .classcard')) return 'ui_select';
  if (el.matches('select')) return null;
  if (el.matches(':disabled, .disabled')) return 'ui_error';
  if (el.matches('.btn-primary')) return 'ui_confirm';
  if (el.matches('button, .btn')) return 'ui_click';
  return null;
}
