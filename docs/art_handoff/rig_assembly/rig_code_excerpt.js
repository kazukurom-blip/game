// NEON VICE STORY — 主人公リグの組み立て・歩行描画コードの抜粋（src/render/character.js / rigLayout.js より）
// 読むだけの資料です。座標は単位（ゲーム内で scale 1 のとき 1単位 = 画面 1px。キャラの背丈 84）。y は下が正。
// rigView() は manifest の rig.view（'3q' = 右向き斜め前。配置図 v2 の既定）

// ===== rigLayout.js
export const RIG_W = 1024, RIG_H = 1024;
export const RIG_S = 8;                 // 配置図の 1 単位 = 8px
export const RIG_R = 4;                 // 読み込み後に保持する解像度（1 単位 = 4px）

// ---- 骨格プロファイル v2（リグ専用。見本 docs/art_handoff/style/luna_f_reference.png の頭身）
//  足裏からの高さ（単位）。頭（頭頂〜顎）34 = 40%、胴（肩〜股）22 = 26%、脚（股〜足裏）24 = 29%（うち靴 足首〜足裏 6）。
//  NPC・敵・市民のコード描画（character.js の BODY）は変えない。リグ（主人公のパーツ式）と、その「絵が無い装備の代用」だけがこの寸法。
export const RIG_PROFILE = { H: 84, ankle: 6, knee: 15, crotch: 24, waist: 26, shoulder: 46, neck: 48, chin: 50, head: 66, top: 84 };
/** 腰（股＝脚の付け根。上半身の座標系の原点）からの位置（上が負） */
export const RIG_Y = {
  hip: -RIG_PROFILE.crotch,                                   // 足元から股まで -24
  shoulder: RIG_PROFILE.crotch - RIG_PROFILE.shoulder,        // 股 → 肩 -22
  neck: RIG_PROFILE.crotch - RIG_PROFILE.neck,                // 股 → 首の付け根 -24
  chin: RIG_PROFILE.crotch - RIG_PROFILE.chin,                // 股 → 顎 -26
  head: RIG_PROFILE.crotch - RIG_PROFILE.head,                // 股 → 頭の中心 -42
};
/** 肢の長さ（単位）。上腕9＋前腕（手の中心まで）9、太もも9＋すね9。♂は肩幅・腕を太めに（BODY の値に上書き） */
export const RIG_LIMBS = {
  f: { upper: 9, fore: 9, thigh: 9, shin: 9 },
  m: { upper: 9, fore: 9, thigh: 9, shin: 9, sw: 11.4, sx: 9.6, armW: 6.4, armW2: 5.7 },
};
/** コードの頭（旧い頭の座標: 中心から 髪の上端 -25・顎 +15.5）を v2 の頭の座標（頭頂 -18・顎 +16）に置く変換: y' = dy + s*y */
export const RIG_CODE_HEAD = { s: 0.88, dy: 2.4 };

// ---- 頭の配置図（頭の絵＝前の頭、後ろ髪の絵 で共通）: 1024×1024、1 単位 = 10px、支点（頭の中心）= (512, 400)
//  頭の座標（単位）: 原点 = 頭の中心（足裏から 66）、頭頂 -18、目の高さ 約 +5、顎 +16、腰の高さ +40（ツインテールの先の目安）
export const HEAD_W = 1024, HEAD_H = 1024, HEAD_S = 10, HEAD_PX = 512, HEAD_PY = 400;
export const HEAD_GUIDE = { top: -18, eye: 5, chin: 16, shoulder: RIG_PROFILE.head - RIG_PROFILE.shoulder, waist: RIG_PROFILE.head - RIG_PROFILE.waist };
/** 後ろ髪の揺れの支点（頭の座標。ツインテールの結び目の高さ） */
export const HEAD_BACK_PIVOT = [0, -6];

// パーツ: ext = 支点からの範囲 [x0, y0, x1, y1]（単位）、at = 枠の左上（px）
//  frame: どの座標系に付くか（upper = 腰〜上半身（傾く）, root = 足元基準（脚）, head = 頭）
const P = {
  head:  { at: [16, 16],   ext: [-32, -34, 32, 20], frame: 'head',  label: '頭の上に重ねる物（帽子・メガネ・マスク・天使の輪）', short: '頭の物' },
  back:  { at: [560, 16],  ext: [-40, -52, 16, 4],  frame: 'upper', label: '背中（翼・フード・スカーフのなびき）', short: '背中' },
  torso: { at: [16, 500],  ext: [-20, -32, 20, 16], frame: 'upper', label: '胴（首の付け根〜腰。スカート・ドレスの裾も）', short: '胴' },
  armB:  { at: [356, 500], ext: [-7, -5, 7, 24],    frame: 'upper', label: '後ろの腕（肩〜手）', short: '後ろ腕', joint: 'elbow' },
  armF:  { at: [488, 500], ext: [-7, -5, 7, 24],    frame: 'upper', label: '手前の腕（肩〜手）', short: '前腕', joint: 'elbow' },
  legB:  { at: [620, 500], ext: [-8, -5, 8, 23],    frame: 'root',  label: '後ろの脚（股〜足首）', short: '後ろ脚', joint: 'knee' },
  legF:  { at: [768, 500], ext: [-8, -5, 8, 23],    frame: 'root',  label: '手前の脚（股〜足首）', short: '前脚', joint: 'knee' },
  footB: { at: [356, 752], ext: [-8, -9, 13, 8],    frame: 'root',  label: '後ろの足（靴）', short: '後ろ足' },
  footF: { at: [544, 752], ext: [-8, -9, 13, 8],    frame: 'root',  label: '手前の足（靴）', short: '前足' },
};
// 旧い配置図（v1。layout: 1 の古い絵の読み込みだけに使う。旧い頭身の枠の位置）
const P1 = {
  head:  { at: [16, 16],   ext: [-34, -38, 34, 22] },

// ===== 骨格
const BODY = {
  f: { sw: 8.5, ww: 6.3, hw: 8.6, legX: 3.5, thigh: 9.0, shin: 8.9, legW: 6.6, legW2: 5.4, upper: 7.6, fore: 7.2, armW: 4.9, armW2: 4.3, sx: 7.2, neck: 1.9, head: 0.96, hipY: -19.6 },
  m: { sw: 11.0, ww: 9.0, hw: 9.2, legX: 4.3, thigh: 8.6, shin: 8.4, legW: 7.6, legW2: 6.6, upper: 8.0, fore: 7.6, armW: 6.0, armW2: 5.4, sx: 9.3, neck: 2.8, head: 1.0, hipY: -19 },
};
// リグ（主人公のパーツ式）専用の骨格 v2（rigLayout.js の RIG_PROFILE / RIG_LIMBS）。頭の座標は縮尺 1（コードの頭は RIG_CODE_HEAD で置く）
const RIG_B = {
  f: { ...BODY.f, ...RIG_LIMBS.f, head: 1, hipY: RIG_Y.hip },
  m: { ...BODY.m, ...RIG_LIMBS.m, head: 1, hipY: RIG_Y.hip },
};
const RIG_B0 = { f: { ...RIG_B.f }, m: { ...RIG_B.m } };
// manifest rig.profile で骨格の一部（肩の位置 sx・腕/脚の太さなど）を上書き。null で元に戻す
const RIG_PROFILE_KEYS = ['sx', 'sw', 'ww', 'hw', 'legX', 'legW', 'legW2', 'armW', 'armW2'];
export function setRigProfile(p) {
  for (const g of ['f', 'm']) {
    Object.assign(RIG_B[g], RIG_B0[g]);
    const o = p && p[g];
    if (!o || typeof o !== 'object') continue;
    for (const k of RIG_PROFILE_KEYS) if (typeof o[k] === 'number' && isFinite(o[k])) RIG_B[g][k] = clamp(o[k], RIG_B0[g][k] * 0.5, RIG_B0[g][k] * 2);
  }
}
// コードの胴（旧い肩 -17.5）を v2 の肩（-22）に合わせる縦の伸ばし: 腰の少し上 y0 より上だけを s 倍（裾・腰回りはそのまま）
const RIG_STRETCH = { y0: -4, s: (-RIG_Y.shoulder - 4) / (-SHOULDER_Y - 4), top: RIG_Y.chin - 3 };
// コードの靴（足首から靴底 +2.8）を v2 の大きな靴（足首から靴底 +6）に: 足首を中心に s 倍して dy 下げる

// ===== 関節の位置
function limbPts(x0, y0, a, e, l1, l2) {
  LP.kx = x0 + Math.sin(a) * l1; LP.ky = y0 + Math.cos(a) * l1;
  const a2 = a + e;
  LP.ex = LP.kx + Math.sin(a2) * l2; LP.ey = LP.ky + Math.cos(a2) * l2;
}

// ===== 姿勢（makePose）
const LOOPS = {
  idle: [LOOP, 24], walk: [0.6, 10], jump: [1.2, 8], climb: [0.9, 8], sit: [LOOP, 24], drive: [LOOP, 24], cheer: [1.2, 12],
};

function makePose(state, t, at, wk, ws, anim, w, f) {
  const P = {
    bob: 0, tilt: 0, hipY: 0, hx: 0, lb: [-0.06, 0], lf: [0.06, 0], ab: [-0.1, 0.25], af: [0.15, 0.45],
    eyes: 'n', mouth: 'n', brow: 'n', wAng: null, swoosh: null, back: false, lie: 0, headTilt: 0, hairSway: 0, hairLift: 0,
    showWeapon: true, muzzle: false, punch: false, sit: false, handF: wk === 'none' ? 'open' : 'grip', handB: 'open', twist: 0,
  };
  // 武器持ちの基本腕
  if (wk === 'melee') { P.af = [0.25, 0.75]; P.wAng = -1.15; }
  else if (wk === 'gun') { P.af = [0.45, 0.85]; }
  else if (wk === 'magic') { P.af = [0.3, 0.6]; P.wAng = -1.48; }
  switch (state) {
    case 'walk': {
      const ww = w; // 0.6s で1周（2歩）
      const s = Math.sin(t * ww), c = Math.cos(t * ww);
      // 人の歩き: 脚を前へ振り出す間（遊脚）だけ膝を大きく曲げ、着地〜後ろへ送る間（立脚）はほぼ伸ばす。
      // 脚の角度 amp·sin の増える側（cos > 0）が前へ振り出す時。かかと着地の直後に少しだけ膝を曲げて衝撃を受ける
      const amp = f ? 0.44 : 0.5;
      const knee = (q) => Math.max(0, q) ** 1.3 * 0.95 + Math.max(0, -q) * 0.12 + 0.06;
      P.lf = [amp * s, knee(c)]; P.lb = [-amp * s, knee(-c)];
      P.ab = [0.45 * s, 0.3 + Math.max(0, s) * 0.25];
      if (wk === 'none') { P.af = [-0.45 * s, 0.3 + Math.max(0, -s) * 0.25]; P.handF = 'fist'; } else P.af[0] += -0.18 * s;
      P.handB = 'fist';
      P.bob = -Math.abs(c) * 1.8 + 0.9; P.tilt = 0.07; P.twist = -s * 0.9;
      P.headTilt = Math.sin(t * ww * 2 - 1.1) * 0.025 - 0.02;
      P.hairSway = 0.55 + Math.sin(t * ww * 2 - 1.3) * 0.35;
      break;
    }
    case 'jump': {
      const q = Math.sin(t * om(w, 5));
      P.lf = [0.95, 1.35]; P.lb = [-0.15, 0.95];
      P.ab = [2.5, 0.45]; if (wk === 'none') { P.af = [-0.75, 0.6]; P.handF = 'open'; }
      P.handB = 'open';
      P.hairSway = 0.3 + q * 0.15; P.hairLift = 1; P.bob = -0.5; P.tilt = -0.03;
      P.mouth = 'o';
      break;
    }
    case 'climb': {

// ===== 上半身・頭の座標系
function enterUpper(ctx, P) {
  ctx.save();
  ctx.translate(P.hx, P.hipY + P.bob);
  ctx.rotate(P.tilt);
}
function enterHead(ctx, K) {
  const P = K.P;
  ctx.save();
  if (K.rig && K.ai) { enterAiNeck(ctx, K); return; }
  ctx.translate(P.twist * 0.25, K.headY != null ? K.headY : HEAD_Y + (K.f ? 0.6 : 0));
  ctx.rotate(P.headTilt);
  if (K.B.head !== 1) ctx.scale(K.B.head, K.B.head);
}
/**
 * 画像の頭（リグ）: 首の付け根を支点に回す。1枚絵の頭は表情も角度も変わらないので、
 * 体の動きに少し遅れて・大きめに頭を振る（うなずき・攻撃の踏み込み・被弾ののけぞり）＋ひねりで横に少し縮めて「振り向き」に見せる
 */
function enterAiNeck(ctx, K) {
  const P = K.P, t = K.t || 0, w = K.w || 1, st = K.state;
  let a = P.headTilt * 1.6 + P.tilt * 0.55, dy = 0;
  if (st === 'walk') { a += Math.sin(t * w * 2 - 0.6) * 0.05; dy = -Math.abs(Math.cos(t * w)) * 0.6 + 0.3; }
  else if (st === 'attack' || st === 'shoot') a += P.twist * 0.05 + P.hx * 0.02;
  else if (st === 'jump') { a -= 0.07; dy = -0.6; }
  else if (st === 'hurt') a -= 0.12;
  else if (st === 'cheer') a -= 0.08;
  else if (!P.sit && !P.lie) a += Math.sin(t * w * 1.3) * 0.025;
  a = clamp(a, -0.4, 0.4);
  const ny = RIG_Y.neck - K.headY;                     // 頭の中心 → 首の付け根（下が正）
  ctx.translate(P.twist * 0.35, K.headY + ny + dy);
  ctx.rotate(a);
  const turn = Math.min(0.09, Math.abs(P.twist) * 0.05);
  if (turn) ctx.scale(1 - turn, 1);
  ctx.translate(0, -ny);
}
/** リグの頭の座標（v2）で、コードの頭・帽子を描く座標系に入る（コード描画の時は何もしない）。restore は呼び出し側 */
function enterCodeHead(ctx, K) {
  ctx.save();
  if (K.rig) { ctx.translate(0, RIG_CODE_HEAD.dy); ctx.scale(RIG_CODE_HEAD.s, RIG_CODE_HEAD.s); }
}

function drawFrontView(ctx, K) {
  const P = K.P, eq = K.eq, B = K.B;
  const tw = P.twist;

// ===== パーツの描画と重ね順
function rigImg(ctx, p) {
  if (!p) return;
  const R = p.R;
  ctx.drawImage(FL ? rigFlash(p) : p.cv, -p.px / R, -p.py / R, p.w / R, p.h / R);
}
/** 肢（肩/股〜手/足首の1枚の絵）を関節（肘/膝 = 支点から l1）で2つに分けて描く。a, e はコードの limb と同じ（a=付け根の角度, e=関節の曲がり） */
// 関節を曲げる幅（単位）。この範囲で上の骨と下の骨の角度をなめらかに混ぜる
const JOINT_BLEND = 3;
/**
 * 腕・脚の絵を、関節（肘・膝）でなめらかに曲げて描く（細い横帯に分け、帯ごとに角度を少しずつ変えて並べる＝2Dのスキニング）。
 * 絵の縦の軸が骨。支点（肩・股）から l1 の所が関節。a = 上の骨の角度、e = 関節の曲げ角
 */
function rigLimb(ctx, p, x0, y0, a, e, l1) {
  if (!p) return;
  const R = p.R, src = FL ? rigFlash(p) : p.cv;
  const X = -p.px / R, W = p.w / R;
  if (Math.abs(e) < 0.06) {   // ほぼまっすぐ: 1枚で
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(-a);
    ctx.drawImage(src, 0, 0, p.w, p.h, X, -p.py / R, W, p.h / R);
    ctx.restore();
    return;
  }
  const step = 0.75, sp = step * R;                       // 帯の高さ（単位 / 保持 px）
  const d0 = -p.py / R, d1 = (p.h - p.py) / R;           // 支点からの距離の範囲（上が負）
  const lo = l1 - JOINT_BLEND, hi = l1 + JOINT_BLEND;
  const wOf = (d) => (d <= lo ? 0 : d >= hi ? 1 : ((d - lo) / (hi - lo)) ** 2 * (3 - 2 * (d - lo) / (hi - lo)));
  // 支点より上（肩・腰の丸み）は上の骨と同じ向き
  let px = x0, py = y0;
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(-a);
  const top = Math.min(p.h, Math.ceil(p.py + (lo + 0.15) * R));
  ctx.drawImage(src, 0, 0, p.w, top, X, d0, W, top / R);
  ctx.restore();
  // 関節の手前まではまっすぐ進む
  px += Math.sin(a) * lo; py += Math.cos(a) * lo;
  const XL = X - 0.6, XR = X + W + 0.6, EPS = 0.14;                  // 帯の切り抜きの左右（少し外まで）
  let th0 = a;
  for (let d = lo; d < d1; d += step) {
    const last = d + step >= hi;
    const th1 = last ? a + e : a + e * wOf(d + step), thm = (th0 + th1) / 2;
    const y = Math.max(0, p.py + (d - step) * R);
    if (y >= p.h) break;
    const nx = px + Math.sin(thm) * step, ny = py + Math.cos(thm) * step;
    if (last) {
      // 関節より下は1枚で（上端だけ前の帯との境目で切る）
      const c1 = Math.cos(th1), s1 = Math.sin(th1);
      ctx.save();
      ctx.beginPath();
      const ux = px - Math.sin(th0) * EPS, uy = py - Math.cos(th0) * EPS;
      ctx.moveTo(ux + Math.cos(th0) * XL, uy - Math.sin(th0) * XL); ctx.lineTo(ux + Math.cos(th0) * XR, uy - Math.sin(th0) * XR);
      ctx.lineTo(nx + c1 * XR + s1 * 40, ny - s1 * XR + c1 * 40); ctx.lineTo(nx + c1 * XL + s1 * 40, ny - s1 * XL + c1 * 40);
      ctx.closePath(); ctx.clip();
      ctx.translate(px, py); ctx.rotate(-thm);
      ctx.drawImage(src, 0, y, p.w, p.h - y, X, (y - p.py) / R - d, W, (p.h - y) / R);
      ctx.restore();
      break;
    }
    // 上の境目（角度 th0）と下の境目（角度 th1）で囲んだ四角に切り抜いて描く（外側の隙間・内側のギザギザが出ない）
    // 境目の細い線が出ないよう、上下に少し（EPS）重ねる
    const ux = px - Math.sin(th0) * EPS, uy = py - Math.cos(th0) * EPS, bx = nx + Math.sin(th1) * EPS, by = ny + Math.cos(th1) * EPS;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ux + Math.cos(th0) * XL, uy - Math.sin(th0) * XL); ctx.lineTo(ux + Math.cos(th0) * XR, uy - Math.sin(th0) * XR);
    ctx.lineTo(bx + Math.cos(th1) * XR, by - Math.sin(th1) * XR); ctx.lineTo(bx + Math.cos(th1) * XL, by - Math.sin(th1) * XL);
    ctx.closePath(); ctx.clip();
    ctx.translate(px, py); ctx.rotate(-thm);
    const h = Math.min(p.h - y, sp * 3);
    ctx.drawImage(src, 0, y, p.w, h, X, (y - p.py) / R - d, W, h / R);
    ctx.restore();
    px = nx; py = ny; th0 = th1;
  }
}
/** 手前の手だけをもう一度（武器の上に。握っている見た目） */
function rigHand(ctx, p, x0, y0, a, e, l1, L) {
  if (!p) return;
  const R = p.R, src = FL ? rigFlash(p) : p.cv;
  const jy = p.py + l1 * R;
  const hy = Math.max(0, Math.floor(p.py + (L - 3.2) * R)), hh = p.h - hy;
  if (hh <= 0) return;
  const kx = x0 + Math.sin(a) * l1, ky = y0 + Math.cos(a) * l1;
  ctx.save(); ctx.translate(kx, ky); ctx.rotate(-(a + e));
  ctx.beginPath(); ctx.arc(0, L - l1, 3.0, 0, TAU); ctx.clip();
  ctx.drawImage(src, 0, hy, p.w, hh, -p.px / R, (hy - jy) / R, p.w / R, hh / R);
  ctx.restore();
}
function rigFoot(ctx, p, hx, hy, a, k, B) {
  if (!p) return;
  limbPts(hx, hy, a, -k, B.thigh, B.shin);
  ctx.save(); ctx.translate(LP.ex, LP.ey); ctx.rotate(-(a - k) * 0.85);
  rigImg(ctx, p);
  ctx.restore();
}
/** 杖の先の光（絵の武器の上に。コードの drawWeapon と同じ位置） */
function staffGlow(ctx, c, P, t, w) {
  const glow = P && P.magicGlow ? P.magicGlow : 0;
  ctx.save(); ctx.translate(30, Math.sin(t * om(w, 3)) * 0.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = FL ? '#ffffff' : rgba(c, 0.16 + glow * 0.3);
  ctx.beginPath(); ctx.arc(0, 0, 6 + glow * 6 + Math.sin(t * om(w, 6)) * 0.8, 0, TAU); ctx.fill();
  ctx.restore();
}

/** リグで1人描く（原点=足元・右向き・scale 1）。plan = rig.js の rigPlanFor() */
function renderRig(ctx, look, equip, anim, state, ws, wk, plan) {
  const dmg = clamp(anim.damage || 0, 0, 1);
  const parts = plan.parts(dmg);       // 先に用意（中でコード部品を描くことがあるので、描画の状態を設定する前に）
  const lp = LOOPS[state];
  const w = TAU / (lp ? lp[0] : LOOP);
  const t = anim.t || 0;
  const at = clamp(anim.attackT || 0, 0, 1);
  const f = look.body === 'f';
  const P = makePose(state, t, at, wk, ws, anim, w, f);
  const K = makeK(look, equip, anim, state, ws, wk, P, t, at, w, true);
  P.hipY += K.B.hipY;
  resolveFace(P, K, anim);
  K.ai = anim.villain ? null : aiHeadOf(look, anim, state, t);
  FL = !!anim.flash;
  RIM = anim.rim || look.rim || (f ? '#9ff4ff' : '#8fe8ff');
  TAG = 'body';
  if (state !== 'drive' && !P.lie) {
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.2, 0, 0, TAU);
    ctx.fillStyle = 'rgba(20,0,30,0.28)'; ctx.fill();
  }
  ctx.save();
  if (P.lie) { ctx.translate(34 * P.lie, -9 * P.lie); ctx.rotate(-PI / 2 * P.lie); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  try {
    if (P.back) rigBackView(ctx, K, parts);
    else rigFrontView(ctx, K, parts);
  } finally { ctx.restore(); FL = false; }
}
function rigHead(ctx, K, parts, back) {
  const P = K.P;
  enterHead(ctx, K);
  const hat = K.eq.hat && K.eq.hat.style;
  if (K.ai) {
    paintAiHead(ctx, K.ai, hat, back, FL, 'rig');
    if (back && K.ai.back) paintAiHeadBack(ctx, K.ai, hat, P, FL, 'rig', true);
  } else {
    enterCodeHead(ctx, K);
    if (back) {
      ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 15.5, 0, 0, TAU); fillStroke(ctx, K.skin);
      drawHairBack(ctx, K, true);
    } else {
      RIG_HEADITEMS = true;
      try { drawHead(ctx, K); } finally { RIG_HEADITEMS = false; }
    }
    ctx.restore();
  }
  rigImg(ctx, parts.head);
  if (!back) {
    enterCodeHead(ctx, K);
    if (P.panic) drawPanicLines(ctx, K);
    if (P.sweat || P.panic) drawSweat(ctx, K);
    ctx.restore();
  }
  ctx.restore();
}
function rigWeaponAndHand(ctx, K, parts, sx, sy) {
  const P = K.P, B = K.B, a = P.af[0], e = P.af[1];
  rigLimb(ctx, parts.armF, sx, sy, a, e, B.upper);
  if (!(P.showWeapon && K.eq.weapon)) return;
  limbPts(sx, sy, a, e, B.upper, B.fore);
  const fore = PI / 2 - (a + e);
  const ang = K.wk === 'gun' ? fore : P.wAng != null ? P.wAng : fore;
  const [wc, wa] = itemColors(K.eq.weapon);
  ctx.save(); ctx.translate(LP.ex, LP.ey); ctx.rotate(ang);
  if (parts.weapon) {
    rigImg(ctx, parts.weapon);
    if (P.muzzle) muzzleFx(ctx, K.ws);
    if (K.ws === 'staff') staffGlow(ctx, wc, P, K.t, K.w);
  } else drawWeapon(ctx, K.ws, wc, wa, K.t, P, K.w);
  ctx.restore();
  rigHand(ctx, parts.armF, sx, sy, a, e, B.upper, B.upper + B.fore);
}
function rigFrontView(ctx, K, parts) {
  const P = K.P, B = K.B, tw = P.twist;
  // 右向き斜め前（3q）: 体の右半身が手前 → 手前の腕・脚は画面の左側（背中側）、奥の腕・脚は顔の向きの側（胸の陰で少し内側）
  const q = rigView() === '3q';
  const sxF = q ? -B.sx + 0.4 + tw * 2 : B.sx - 0.4 + tw * 0.5;   // 3q: ひねると手前の肩が大きく前へ（パンチ・斬りの踏み込み）
  const sxB = q ? B.sx * 0.85 - tw * 0.8 : -B.sx - tw * 0.35;
  enterUpper(ctx, P);
  rigImg(ctx, parts.backA);
  if (!K.ai) { enterHead(ctx, K); enterCodeHead(ctx, K); drawHairBack(ctx, K); ctx.restore(); ctx.restore(); }
  else if (K.ai.back) { enterHead(ctx, K); paintAiHeadBack(ctx, K.ai, K.eq.hat && K.eq.hat.style, P, FL, 'rig'); ctx.restore(); }
  rigImg(ctx, parts.backT);
  rigLimb(ctx, parts.armB, sxB, K.shY + 0.3, P.ab[0], P.ab[1], B.upper);
  ctx.restore();
  const lx = q ? -B.legX : B.legX;
  const hb = -lx + P.hx * 0.3, hf = lx + P.hx * 0.3;
  rigLimb(ctx, parts.legB, hb, P.hipY, P.lb[0], -P.lb[1], B.thigh);
  rigFoot(ctx, parts.footB, hb, P.hipY, P.lb[0], P.lb[1], B);
  rigLimb(ctx, parts.legF, hf, P.hipY, P.lf[0], -P.lf[1], B.thigh);
  rigFoot(ctx, parts.footF, hf, P.hipY, P.lf[0], P.lf[1], B);
  enterUpper(ctx, P);
  rigImg(ctx, parts.torso);
  rigHead(ctx, K, parts, false);
  rigWeaponAndHand(ctx, K, parts, sxF, K.shY + 0.6);
  if (K.anim.bones) drawRigBonesUpper(ctx, K, sxF, sxB, hf, hb);
  if (!K.anim.noFx) {
    if (P.swoosh) drawSwoosh(ctx, K, sxF, K.shY + 0.5);
    if (K.wk === 'magic' && !FL) drawHoloPanel(ctx, K);
  }
  ctx.restore();
}
// ---- デバッグ・資料用: 骨（anim.bones = true）。黄 = 関節、水色 = 骨。座標は股が原点の上半身 / 足元が原点の脚
function boneLine(ctx, pts, col) {
  ctx.save(); ctx.lineWidth = 0.7; ctx.strokeStyle = col; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.fillStyle = '#ffe14a';
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawRigBonesUpper(ctx, K, sxF, sxB, hf, hb) {
  const P = K.P, B = K.B;
  boneLine(ctx, [[0, 0], [0, RIG_Y.neck], [0, K.headY]], '#5ff');
  boneLine(ctx, [[sxB, K.shY + 0.3], [sxF, K.shY + 0.6]], '#5ff');
  limbPts(sxB, K.shY + 0.3, P.ab[0], P.ab[1], B.upper, B.fore);
  boneLine(ctx, [[sxB, K.shY + 0.3], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  limbPts(sxF, K.shY + 0.6, P.af[0], P.af[1], B.upper, B.fore);
  boneLine(ctx, [[sxF, K.shY + 0.6], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  ctx.restore();   // 上半身の座標を抜けて足元の座標で脚（最後に enterUpper で戻す）
  for (const [hx, L] of [[hb, P.lb], [hf, P.lf]]) {
    limbPts(hx, P.hipY, L[0], -L[1], B.thigh, B.shin);
    boneLine(ctx, [[hx, P.hipY], [LP.kx, LP.ky], [LP.ex, LP.ey]], '#5ff');
  }
  boneLine(ctx, [[hb, P.hipY], [hf, P.hipY]], '#5ff');
  enterUpper(ctx, P);
}
