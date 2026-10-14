// 戦闘担当の中身の登録（スキルの動き・能力の名前・補助の刻印のドロップ）。
//
// ======================================================================
// ■ 戦闘が出す見た目の出来事（combat.fx）の一覧 … アート担当・音担当向け
//   scene.js は毎フレーム combat.fx を読み出す（sceneHooks.fx[t] / sceneHooks.onFx で受け取れる）。
//   座標 x, y は戦闘の座標（scene.sx(x), scene.sy(y, z) で画面へ）。el は属性（phys fire cold lightning poison void）。
//   skill はスキルの id（差し替え枠 fx.<skill>.proj / .hit / .area / .swing がある）。
//   fallbackOf: 'X' が付いた出来事は「新しい種類 X の簡易表示」。X を描くなら、それは無視してよい。
//
//  （前からある物）
//   cast       { unit, skill, el, behavior, dur, kind }       技の動作が始まる（kind: basic/active/buff/summon/ult）
//   swing      { x, y, r, el, skill, src, small?, enemy? }    斬撃の軌跡
//   nova       { x, y, r, el, skill, small?, land?, ult?, slam? }  円形の衝撃（着地・叩きつけ・爆発も）
//   chain      { pts: [{x,y,z}...], el, skill }               連鎖・稲妻・線
//   hit        { x, y, z, el, skill }                         弾が当たった
//   pulse      { x, y, r, el, team, art, skill, kind, len }   地面の効果の 1 刻み（kind は areas の kind）
//   dmg        { x, y, z, v, crit, el, dot?, team, hero? }    ダメージの数字
//   text       { x, y, z, text, color }                       「凍結」「回避」などの文字
//   summon     { x, y, unit, skill, kind }                    召喚物が出た（kind = minion の種類）
//   buff       { unit, el, skill, dur }                       強化をかけた
//   shake      { power }                                      画面の揺れ
//   death / boss / levelup / gold / loot / heroDeath / revive  （前と同じ）
//
//  （戦闘担当が足した物）
//   ult        { skill, cls, unit, x, y, el, dur }            奥義の発動（画面全体の演出・暗転・カットインなど）。cls はクラスの id
//   crit       { x, y, z, v, el, skill }                      主人公のクリティカル（0.15 秒に 1 回まで。ヒットストップ向け）
//   leap       { unit, x0, y0, x1, y1, dur, skill, el, ult? } 跳躍の始まり（unit.z が高さ。着地で nova{land:true}）
//   dash       { unit, x0, y0, x1, y1, dur, skill, el, back?, roll? }  突進・後転（残像・砂ぼこり）
//   blink      { unit, x0, y0, x1, y1, skill }                瞬間移動（冥府の舞）
//   beam       { unit, x1, y1, x2, y2, w, dur, skill, el }    光線（dur 秒続く。unit について動く。毎刻み chain{fallbackOf:'beam'}）
//   channel    { unit, skill, kind, dur, el }                 詠唱し続ける技の始まり（kind: whirl / beam / flurry）
//   whirl      { unit, r, dur, skill, el }                    回転斬り（dur 秒。毎刻み nova{small, fallbackOf:'whirl'}）
//   flurry     { unit, r, dur, skill, el }                    千刃（毎刻み swing{fallbackOf:'flurry'}）
//   wave       { unit, x, y, dir, range, r, count, skill, el } 地を走る衝撃波（projs に kind:'wave' の弾がある）
//   aura       { unit, r, dur, skill, el }                    主人公についていく範囲（areas に kind:'aura'）
//   orbit      { unit, n, r, dur, speed, skill, el }          まわりを回る刃・骨（areas に kind:'orbit'、area.orbit = { n, ang } で刃の角度）
//   trap       { x, y, r, skill, el, life }                   罠を置いた（areas に kind:'trap'、area.armed で準備完了）
//   trapFire   { x, y, r, skill, el }                         罠が爆発した（同時に nova{fallbackOf:'trapFire'}）
//   trapFade   { x, y, skill }                                罠が時間切れで消えた
//   cloud      { x, y, r, dur, skill, el, kind? }             霧・吹雪・燃える地面（kind:'burn'）（areas に kind:'cloud' / 'burn'）
//   wall       { x, y, len, depth, dur, skill, el }           横に長い炎の壁（areas に kind:'wall'、shape:'line'、len）
//   meteor     { x, y, r, delay, skill, el, ult? }            隕石の予告（delay 秒後に落ちる。areas に kind:'meteor'）
//   barrage    { x, y, r, dur, count, skill, el }             矢の嵐（星落としの矢）
//   curse      { x, y, r, skill, el, curse, single, unit }    呪いをかけた（敵の u.statuses.curse が続く間は呪いの印）
//   shield     { unit, v, max, dur, skill, el }               障壁を張った（unit.shield / unit.shieldMax で残り）
//   shieldBreak{ unit }                                       障壁が壊れた
//   corpse     { x, y, r, skill, el }                         死体が爆発した（同時に nova{fallbackOf:'corpse'}）
//   trait      { unit, cls, kind }                            クラスの特性が発動（魔導士の「奔流」 kind:'surge'）
//   minionDeath{ unit }                                       召喚物が消えた・倒れた
//   glyph      { x, y, id, lvl, name }                        補助の刻印を拾った
//   mastery    { skill, level }                               スキルの熟練度が上がった
//
//  見た目に使える状態: 敵 u.statuses.curse（呪い）/ vuln（脆弱）/ weaken（衰弱）/ freeze / chill / stun / shock / ignite / poison / bleed
//                     主人公 h.shield, h.shieldMax, h.z, h.channel, h.anim.channel、召喚物 m.minion（種類）, m.fly, m.stationary, m.temp
// ======================================================================

import './combat/stats.js';
import './combat/behaviors.js';
import './combat/glyphs.js';
