// 手触りの数値（classic/docs/FEEL.md の表と同じ。数値はここが唯一の出どころ）
// 単位: px（内部解像度 800×600 の 1 px）・秒。速さは px/秒、加速は px/秒²。
// 「速さ 100・ジャンプ 100」（装備やスキルで変わる能力値）のときの値。

export const FPS = 60;
export const DT = 1 / FPS;

export const FEEL = {
  // --- 地上 ---
  walkSpeed: 125,        // 歩く最高速（速さ 100）
  walkAccel: 1400,       // 押した時の加速（約 0.09 秒で最高速）
  walkDecel: 800,        // 離した時の減速（止まるまで 約 0.16 秒・約 10 px すべる）
  turnDecel: 2200,       // 逆向きを押した時の減速（加速＋減速）
  slopeSpeedByLength: true, // 坂は「線にそって」進む（横の速さは cos 倍）

  // --- 空中 ---
  jumpSpeed: 555,        // ジャンプの初速（ジャンプ 100）→ 最高 約 77 px
  gravity: 2000,         // 重力
  maxFall: 670,          // 落下の最大速度
  airAccel: 100,         // 空中で左右を押した時の加速（ほとんど変わらない）
  airMaxSpeed: 125,      // 空中の横の速さの上限（歩く最高速まで）
  airTurnFacing: true,   // 空中でも向きは変えられる

  // --- 縄・はしご ---
  climbSpeed: 90,        // 上り下りの速さ
  ropeGrabRange: 10,     // 縄の中心から左右この距離でつかまれる（はしごは +4）
  ropeBottomReach: 28,   // 縄の下端より下にいても、この高さまでなら ↑ でつかまれる
  ropeTopReach: 6,       // 足場の上で ↓ を押した時、縄の上端がこの距離以内ならつかまって降りる
  ropeJumpSpeedX: 100,   // 縄から左右＋ジャンプで飛び降りる時の横の速さ
  ropeJumpSpeedY: 370,   // 同じく上向きの速さ（ジャンプの 2/3 → 約 34 px）
  ropeRegrabDelay: 0.25, // 飛び降りてから、もう一度つかまれるまで

  // --- 足場 ---
  downJumpSpeed: 200,    // ↓＋ジャンプの小さな跳ね（約 10 px）
  downJumpIgnore: 0.35,  // 降りる足場をすり抜ける時間の上限
  edgeFallKeepsSpeed: true, // 端から落ちる時は横の速さをそのまま

  // --- 被弾 ---
  hurtKnockX: 150,       // ふっとびの横（敵と反対へ）
  hurtKnockY: 280,       // ふっとびの上（約 20 px 浮く）
  hurtInvincible: 1.5,   // 無敵の時間
  hurtBlink: 0.08,       // 点滅の周期の半分（表示/非表示を 0.08 秒ずつ）

  // --- カメラ ---
  camFollowX: 3.0,       // 横の追いつき（1 秒で残りの約 95%）
  camFollowY: 1.4,       // 縦の追いつき（1 秒で残りの約 75%、少し遅れる）
  camOffsetY: 70,        // プレイヤーの足元が画面の中心より この分だけ下
  camDeadY: 12,          // 縦はこの差までは動かない（ジャンプで揺れない）

  // --- 絵の動き（コマの時間） ---
  standFrame: 0.5,
  walkFrame: 0.18,
  ropeFrame: 0.25,
};

// 速さ・ジャンプの能力値（100 が基準。最大 140 / 123）から実際の値へ
export function moveStats(speed = 100, jump = 100) {
  const s = Math.max(100, Math.min(140, speed)) / 100;
  const j = Math.max(100, Math.min(123, jump)) / 100;
  return { walkSpeed: FEEL.walkSpeed * s, jumpSpeed: FEEL.jumpSpeed * j, climbSpeed: FEEL.climbSpeed * s };
}

// 武器の速さの段階（2 = いちばん速い 〜 9 = いちばん遅い）→ ふつうの攻撃の 1 回の時間（秒）
// 段階の名前はクラシックの表示に合わせる
export const ATTACK_SPEED = {
  2: { name: 'より速い', delay: 0.48 },
  3: { name: 'より速い', delay: 0.54 },
  4: { name: '速い', delay: 0.60 },
  5: { name: '速い', delay: 0.66 },
  6: { name: 'ふつう', delay: 0.72 },
  7: { name: '遅い', delay: 0.78 },
  8: { name: '遅い', delay: 0.84 },
  9: { name: 'より遅い', delay: 0.90 },
};
