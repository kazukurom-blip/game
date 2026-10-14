// ワールド担当の中身の登録（敵の動き・ボスの特技・エリートの詞・ウェーブの組み立て・ため込み屋・報酬）。
// 細かい中身は content/world/* に分けてある。裂け目と門番のモードは game/systems/rift.js。
//
// ■ ワールド担当が出す見た目の出来事（combat.fx。アート・サウンド担当向け。知らない型は無視してよい）
//   { t: 'bossAbility', unit, ability, name }   ボスが特技を使い始めた（頭の上に技名の text も出る）
//   { t: 'bossIntro', unit, name, title, act?, final?, guardian?, gatekeeper?, desc }  章のボス・守護者・門番の登場
//   { t: 'bossPhase', unit, phase, text }       深淵王などの姿が変わった
//   { t: 'charge', unit, x, tx }                 突進（x から tx へ 0.2〜0.3 秒で）
//   { t: 'teleport', unit, from, to }            瞬間移動（分身が出たときも）
//   { t: 'enemyBeam', unit, x1, x2, y, z, el, dur }  敵の光線
//   { t: 'mortar', unit, x1, x2, y, delay, el }  弧を描いて delay 秒後に落ちる弾
//   { t: 'drain', unit, target }                 生命吸収（0.5 秒ごと）
//   { t: 'pull', unit, target }                  主人公を引き寄せた
//   { t: 'burrow', unit, up }                    潜る（up=false。潜っている間 unit.burrowed = true）/ 出る（up=true）
//   { t: 'enrage', unit } / { t: 'shieldUp', unit } / { t: 'shieldBreak', unit, expired? }
//   { t: 'eliteShield', unit, on }               エリートの「結界」（2 秒間 -85%）
//   { t: 'selfDestruct', unit }                  自爆した
//   { t: 'goblin', unit, kind: 'spawn'|'flee'|'escape' }  ため込み屋
//   { t: 'shrine', id, name, unit }              祠の強化を受けた
//   { t: 'riftOrb', x, y, v }                    裂け目でエリートが進行の玉を落とした
//   { t: 'riftGuardian', unit, level }           裂け目の守護者が出た
//   { t: 'chain', pts, el, enemy: true } / { t: 'summon', x, y, unit, enemy: true }（既存の形に enemy を足した物）
// ■ 地面の範囲（combat.areas）の art（差し替え枠の候補）:
//   fx.enemy.slam / meteor / nova / pool / beam / spikes / breath / quake / firewall / jail / warp / mortar / blood / whirl / zap / blast / area
import './world/abilities.js';
import './world/attacks.js';
import './world/elites.js';
import './world/bosses.js';
import './world/goblins.js';
import './world/composer.js';
import './world/rewards.js';
