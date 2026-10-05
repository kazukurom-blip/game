// 主人公のパーツ式（着せ替え人形 = リグ）の配置図と基準色（エンジン・テンプレート書き出し・指示書で共通）
//  - 配置図: ♀♂共通の 1024×1024 の画像に、各パーツの枠（box）と回転の支点（pivot）を決める。
//    AI は「この枠の中に描く」。1アイテム = 1枚のパーツシート（描かない枠は空）。
//  - 単位: ゲーム内の座標（キャラの高さ 約80）× RIG_S px。支点はパーツの局所座標の原点。
//  - パーツの局所座標は「直立・腕と脚はまっすぐ下」（休めの姿勢）。肘・膝はエンジンが関節の位置で2つに分けて曲げる。
//  詳しい仕様: docs/SPEC_SPRITES.md「リグ（パーツ式）」、描く人向け: docs/art_handoff/HERO_PARTS_GUIDE.md

export const RIG_W = 1024, RIG_H = 1024;
export const RIG_S = 8;                 // 配置図の 1 単位 = 8px
export const RIG_R = 4;                 // 読み込み後に保持する解像度（1 単位 = 4px）

// パーツ: ext = 支点からの範囲 [x0, y0, x1, y1]（単位）、at = 枠の左上（px）
//  frame: どの座標系に付くか（upper = 腰〜上半身（傾く）, root = 足元基準（脚）, head = 頭）
const P = {
  head:  { at: [16, 16],   ext: [-34, -38, 34, 22], frame: 'head',  label: '頭（帽子・メガネ・マスク・天使の輪）', short: '頭' },
  back:  { at: [584, 16],  ext: [-38, -42, 14, 4],  frame: 'upper', label: '背中（翼・フード・スカーフのなびき）', short: '背中' },
  torso: { at: [16, 536],  ext: [-18, -31, 18, 13], frame: 'upper', label: '胴（首〜腰。スカート・ドレスの裾も）', short: '胴' },
  armB:  { at: [328, 536], ext: [-6, -4, 6, 22],    frame: 'upper', label: '後ろの腕（肩〜手）', short: '後ろ腕', joint: 'elbow' },
  armF:  { at: [448, 536], ext: [-6, -4, 6, 22],    frame: 'upper', label: '手前の腕（肩〜手）', short: '前腕', joint: 'elbow' },
  legB:  { at: [568, 536], ext: [-7, -4, 7, 23],    frame: 'root',  label: '後ろの脚（股〜足首）', short: '後ろ脚', joint: 'knee' },
  legF:  { at: [704, 536], ext: [-7, -4, 7, 23],    frame: 'root',  label: '手前の脚（股〜足首）', short: '前脚', joint: 'knee' },
  footB: { at: [856, 536], ext: [-7, -10, 10, 5],   frame: 'root',  label: '後ろの足（靴）', short: '後ろ足' },
  footF: { at: [856, 696], ext: [-7, -10, 10, 5],   frame: 'root',  label: '手前の足（靴）', short: '前足' },
};
for (const k of Object.keys(P)) {
  const p = P[k];
  p.name = k;
  p.w = (p.ext[2] - p.ext[0]) * RIG_S; p.h = (p.ext[3] - p.ext[1]) * RIG_S;
  p.x = p.at[0]; p.y = p.at[1];
  p.px = p.x - p.ext[0] * RIG_S; p.py = p.y - p.ext[1] * RIG_S;   // 支点（配置図の px）
}
export const RIG_PARTS = P;
export const RIG_PART_NAMES = Object.keys(P);

// 武器の配置図（性別共通）: 1024×512、1 単位 = 16px、持ち手（握る所）= 支点。+x = 刃・銃口の向き（右向きに水平に描く）
export const WPN_W = 1024, WPN_H = 512, WPN_S = 16, WPN_R = 8;
export const WPN_BOX = { x: 16, y: 32, w: 864, h: 448, px: 16 + 14 * 16, py: 32 + 14 * 16, ext: [-14, -14, 40, 14] };
/** 持ち手の印（任意）: この色（マゼンタ）の小さな丸を描くと、そこを持ち手として使う（読み込み時に消す） */
export const GRIP_MARK = '#ff00ff';

// シートの種類（グループ）→ 描く枠
export const RIG_GROUP_PARTS = {
  body: ['torso', 'armB', 'armF', 'legB', 'legF', 'footB', 'footF'],
  top: ['back', 'torso', 'armB', 'armF'],
  bottom: ['torso', 'legB', 'legF'],
  shoes: ['footB', 'footF'],
  hat: ['head'],
  accessory: ['head', 'back', 'torso'],
  tear: ['torso', 'armB', 'armF', 'legB', 'legF'],
};
export const RIG_SLOTS = ['top', 'bottom', 'shoes', 'hat', 'accessory'];

// 素体の肌の基準色（AI に描いてもらう色。look.skin がこれと違えば色相回転＋明度補正）
export const RIG_SKIN_BASE = { f: '#ffe3d3', m: '#f6d5be' };

// スタイルごとの基準色 [主色, アクセント]（AI に描いてもらう色）。items.js の初期装備（無ければ最初のアイテム）の色。
// アイテムの色がこれと同じなら補正しない。違えば主色（とアクセント）を色相回転＋彩度・明度補正で合わせる。
export const RIG_BASE = {
  hat: {
    catEars: ['#ff8ac8', '#ffe0f0'], headphones: ['#2b2b38', '#3dff8a'], cap: ['#2b2b38', '#ff3d7f'], beanie: ['#7a7f8c', '#c9ccd6'],
    bandana: ['#d8283c', '#ffffff'], cowboy: ['#8a5a2b', '#e8c27a'], helmet: ['#16161e', '#ff8a00'], crown: ['#ffd23f', '#ff3d7f'],
  },
  top: {
    hoodie: ['#ff6fb5', '#ffffff'], leatherJacket: ['#1d1d24', '#c0c0c8'], tshirt: ['#f4f4f4', '#ff3d7f'], tank: ['#222228', '#ffd23f'],
    hawaiian: ['#ff8a00', '#19d3a0'], tracksuit: ['#1fae5b', '#ffffff'], police: ['#20335c', '#ffd23f'], suit: ['#15151b', '#d8283c'],
    idolDress: ['#ff6fb5', '#fff06a'], armorVest: ['#3b4231', '#9aa07a'],
  },
  bottom: {
    skirt: ['#ff8ac8', '#ffffff'], trackPants: ['#2a2f38', '#3dff8a'], jeans: ['#3a5a8c', '#c9d6ea'], shorts: ['#4d6fb5', '#ffffff'],
    cargo: ['#8a7a52', '#4a4232'], suitPants: ['#15151b', '#5a5a66'], armorPants: ['#3b4231', '#9aa07a'],
  },
  shoes: {
    sneakers: ['#f4f4f4', '#ff6fb5'], boots: ['#2a2018', '#8a8a8a'], sandals: ['#ffd23f', '#19d3a0'], loafers: ['#5a3a22', '#c9a26a'], heels: ['#d8283c', '#ffd23f'],
  },
  accessory: {
    sunglasses: ['#2a2a2a', '#ffd23f'], scarf: ['#d8283c', '#ffffff'], goldChain: ['#ffd23f', '#fff4b0'], mask: ['#e8e8e8', '#16161e'],
    wings: ['#ffffff', '#bff6ff'], halo: ['#fff06a', '#ffffff'],
  },
  weapon: {
    knife: ['#c9ccd6', '#ff6fb5'], bat: ['#b98a52', '#5a3a22'], staff: ['#3dff8a', '#1d1d24'], pistol: ['#2a2a30', '#8a8a8a'],
    katana: ['#dfe4ee', '#d8283c'], smg: ['#1d1d24', '#ff8a00'], guitar: ['#d8283c', '#f4f4f4'], neonSword: ['#19f0ff', '#ffffff'],
  },
};
// 何も装備していない時の見た目（今のコード描画と同じ: 白Tシャツ・青の短パン・素体の足）
export const RIG_DEFAULT_WEAR = {
  top: (g) => ({ style: 'tshirt', color: '#f6f4f8', accent: g === 'f' ? '#ff5fa2' : '#19d3c5' }),
  bottom: () => ({ style: 'shorts', color: '#4d6fb5', accent: '#ffffff' }),
};
/** アクセサリの種類ごとに使う枠（他の枠は空） */
export const RIG_ACC_PARTS = { sunglasses: ['head'], mask: ['head'], halo: ['head'], goldChain: ['torso'], scarf: ['torso', 'back'], wings: ['back'] };

/** 武器の種類（近接 / 銃 / 魔法） */
export function weaponKind(ws) { return !ws ? 'none' : ws === 'pistol' || ws === 'smg' ? 'gun' : ws === 'staff' ? 'magic' : 'melee'; }
