// 外部イラスト担当への納品物リストをゲームデータから自動生成する。
//   node tools/gen_asset_list.mjs
//     → docs/art_handoff/ASSET_LIST.csv を作り直す
//     → docs/art_handoff/README.md の <!-- ASSET_TABLE:BEGIN --> 〜 <!-- ASSET_TABLE:END --> を一覧表で置き換える
// データ（敵・装備・PET・髪型）が増えても、これを流せば一覧が追従する。
// テンプレート（npm run export:sprites → assets/sprites_template/manifest.json）があれば、その manifest の
// ファイル名・セル・基準点・行・tint をそのまま使う（＝テンプレートと 1 対 1）。無ければ SPEC_SPRITES.md の既定値で作る。
//   node tools/gen_asset_list.mjs --template=<dir>   … 別の場所のテンプレートを使う
// 仕様: docs/SPEC_SPRITES.md（フォルダ・行・セル）。優先度の考え方は docs/art_handoff/README.md を参照。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENEMIES } from '../src/data/enemies.js';
import { ITEMS, PET_STYLES, STARTER_EQUIP, STARTER_EQUIP_GENDER, WEAR_SLOTS } from '../src/data/items.js';
import { DEFAULT_LOOKS } from '../src/data/classes.js';
import { HAIR_STYLES } from '../src/render/character.js';
import { ART2_SIZE } from '../src/render/monsters2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'art_handoff');

// ---------------------------------------------------------------- 行（状態）とコマ数（SPEC_SPRITES.md）
export const ROWS = {
  human: [['idle', 6], ['walk', 8], ['jump', 2], ['climb', 4], ['attack', 6], ['shoot', 4], ['hurt', 2], ['dead', 4], ['drive', 1], ['sit', 1]],
  face: [['neutral', 2], ['smile', 2], ['shout', 2], ['hurt', 1], ['happy', 2], ['jito', 1], ['angry', 2], ['sad', 2], ['wink', 1], ['blink', 1]],
  enemy: [['idle', 4], ['walk', 6], ['windup', 2], ['attack', 4], ['hurt', 2], ['dead', 4]],
  boss2: [['idle2', 4], ['walk2', 6], ['windup2', 2], ['attack2', 4]],
  pet: [['idle', 4], ['walk', 6], ['fly', 4], ['pick', 4]],
  tear: [['idle', 6], ['walk', 8], ['jump', 2], ['climb', 4], ['attack', 6], ['shoot', 4], ['hurt', 2], ['dead', 4], ['drive', 1], ['sit', 1]],
};
const rowStr = (rows) => rows.map(([k, n]) => `${k}(${n})`).join(' ');

// ---------------------------------------------------------------- セルの大きさ（ゲーム内表示の 2 倍で描く）
const HUMAN_CELL = [160, 200];
const PET_CELL = [96, 96];
const ART_BASE = { slime: [40, 32], mushroom: [44, 48], flamingo: [40, 70], gator: [92, 40], bossGator: [180, 80], drone: [44, 30], ...ART2_SIZE };
const HUMAN_ARTS = { thug: 1, cop: 1, swat: 1, bossDon: 1, civilian: 1 };
const FLY_ARTS = { drone: 1, jellyfish: 1, seagull: 1, mosquito: 1, ghost: 1, bossAlien: 1 };
const up = (v, s) => Math.ceil(v / s) * s;

/** ゲーム画面上での見た目の大きさ [幅, 高さ]（px, 等倍） */
export function drawnSize(def) {
  if (HUMAN_ARTS[def.art]) {
    const sc = def.scale || Math.min(2.2, Math.max(0.8, (def.h || 70) / 72));
    return [Math.round(60 * sc), Math.round(84 * sc)];
  }
  const b = ART_BASE[def.art];
  if (def.scale && b) return [Math.round(b[0] * def.scale), Math.round(b[1] * def.scale)];
  return [def.w || 40, def.h || 40];
}
/** 推奨セル（2 倍描き＋動きの余白 30%） */
export function cellFor(def) {
  if (def.boss) {
    const [w, h] = drawnSize(def);
    const s = Math.max(512, up(Math.max(w, h) * 2 * 1.3, 64));
    return [s, s];
  }
  if (HUMAN_ARTS[def.art]) {
    const sc = def.scale || Math.min(2.2, Math.max(0.8, (def.h || 70) / 72));
    return sc <= 1.05 ? [...HUMAN_CELL] : [up(HUMAN_CELL[0] * sc, 32), up(HUMAN_CELL[1] * sc, 32)];
  }
  const [w, h] = drawnSize(def);
  return [Math.max(160, up(w * 2 * 1.3, 32)), Math.max(160, up(h * 2 * 1.3, 32))];
}
export const isFlyer = (def) => def.ai === 'flyer' || !!FLY_ARTS[def.art];

// ---------------------------------------------------------------- 優先度
// S = 主人公（3 クラス×♂♀）の素体・顔・初期髪型・初期装備、ボス 7 体
// A = 各地域の代表的な敵（art ごとに最初に出会う 1 体）・PET 10 種・人気装備・残りの髪型・服破れ
// B = 残りの敵と装備（市民は任意）
const DEFAULT_HAIRS = new Set(Object.values(DEFAULT_LOOKS).flatMap((g) => Object.values(g).map((l) => l.hair)));
function starterStyles() {
  const s = new Set();
  for (const cid of Object.keys(STARTER_EQUIP)) {
    for (const g of ['f', 'm']) {
      const eq = { ...STARTER_EQUIP[cid], ...(STARTER_EQUIP_GENDER[cid]?.[g] || {}) };
      for (const slot of WEAR_SLOTS) if (eq[slot] && ITEMS[eq[slot]]) s.add(slot + ':' + ITEMS[eq[slot]].look.style);
    }
  }
  return s;
}
const POPULAR = new Set([
  'hat:crown', 'hat:helmet', 'top:suit', 'top:idolDress', 'top:tshirt', 'bottom:shorts', 'bottom:suitPants', 'shoes:heels',
  'accessory:sunglasses', 'accessory:wings', 'accessory:halo', 'accessory:goldChain',
  'weapon:pistol', 'weapon:katana', 'weapon:neonSword', 'weapon:smg',
]);
/** 地域ごとの代表（各 art の最初の 1 体） */
export function representativeIds() {
  const seen = new Set(), out = new Set();
  for (const e of Object.values(ENEMIES)) {
    if (e.boss || e.civilian || e.night) continue;
    if (seen.has(e.art)) continue;
    seen.add(e.art); out.add(e.id);
  }
  return out;
}

const SLOT_JA = { hat: '帽子', top: '上着', bottom: '下衣', shoes: '靴', accessory: 'アクセサリー', weapon: '武器' };
const REGION_JA = { beach: 'ビーチ', downtown: 'ダウンタウン', slums: 'スラム/港', swamp: 'スワンプ', casino: 'カジノ', rooftop: '摩天楼', spaceport: '宇宙港', town: '町（市民）', police: '警察' };
const STYLE_JA = {
  catEars: 'ネコミミ', headphones: 'ヘッドホン', cap: 'キャップ', beanie: 'ビーニー', bandana: 'バンダナ', cowboy: 'カウボーイハット', helmet: 'ヘルメット', crown: '王冠',
  hoodie: 'パーカー', leatherJacket: 'レザージャケット', tshirt: 'Tシャツ', tank: 'タンクトップ', hawaiian: 'アロハシャツ', tracksuit: 'ジャージ', police: '警官制服', suit: 'スーツ', idolDress: 'アイドル衣装', armorVest: 'アーマーベスト',
  skirt: 'スカート', trackPants: 'ジャージパンツ', jeans: 'ジーンズ', shorts: 'ショートパンツ', cargo: 'カーゴパンツ', suitPants: 'スーツパンツ', armorPants: 'アーマーパンツ',
  sneakers: 'スニーカー', boots: 'ブーツ', sandals: 'サンダル', loafers: 'ローファー', heels: 'ヒール',
  sunglasses: 'サングラス', scarf: 'マフラー', goldChain: '金のチェーン', mask: 'マスク', wings: '翼', halo: '天使の輪',
  knife: 'ナイフ', staff: '杖（デバイス）', bat: 'バット', pistol: '拳銃', katana: '刀', smg: 'サブマシンガン', guitar: 'エレキギター', neonSword: 'ネオンソード',
};
const PET_JA = Object.fromEntries(Object.values(ITEMS).filter((it) => it.slot === 'pet').map((it) => [it.look.style, it.name.replace(/^ペット:\s*/, '')]));

function buildSpecList() {
  const rows = [];
  const add = (r) => rows.push({ tint: '', note: '', ...r });
  const H = HUMAN_CELL.join('x');
  // ---- 人型キャラ（重ね合わせ式）
  for (const g of ['f', 'm']) {
    add({ path: `chars/body_${g}.png`, kind: 'char-body', id: `body_${g}`, name: g === 'f' ? '素体 ♀' : '素体 ♂', rows: rowStr(ROWS.human), cell: H, pri: 'S', tint: 'skin',
      note: 'インナー（タンクトップ＋スパッツ）込みの素体。肌はグレースケール。服・髪は描かない' });
    add({ path: `chars/face_${g}.png`, kind: 'char-face', id: `face_${g}`, name: g === 'f' ? '顔 ♀' : '顔 ♂', rows: rowStr(ROWS.face), cell: H, pri: 'S', tint: '',
      note: '目・眉・口だけ。行は表情（状態ではない）。頭の位置は素体の idle 1 コマ目に合わせる' });
  }
  for (const h of HAIR_STYLES) {
    add({ path: `chars/hair/${h.id}.png`, kind: 'char-hair', id: h.id, name: '髪 ' + h.name, rows: rowStr(ROWS.human), cell: H, pri: DEFAULT_HAIRS.has(h.id) ? 'S' : 'A', tint: 'hairColor',
      note: (DEFAULT_HAIRS.has(h.id) ? '主人公の初期髪型。' : '') + '後ろ髪/前髪を分けるなら ' + `${h.id}_back.png + ${h.id}_front.png` });
  }
  const starter = starterStyles();
  const styles = {};
  for (const it of Object.values(ITEMS)) {
    if (it.type !== 'equip' || it.slot === 'pet') continue;
    const k = it.slot + ':' + it.look.style;
    (styles[k] ??= { slot: it.slot, style: it.look.style, items: [] }).items.push(it);
  }
  for (const slot of WEAR_SLOTS) {
    for (const s of Object.values(styles).filter((x) => x.slot === slot)) {
      const k = slot + ':' + s.style;
      const pri = starter.has(k) ? 'S' : POPULAR.has(k) ? 'A' : 'B';
      const ids = s.items.map((it) => it.id).join(' ');
      add({ path: `chars/equip/${slot}/${s.style}.png`, kind: 'equip-' + slot, id: s.style, name: `${SLOT_JA[slot]} ${STYLE_JA[s.style] || s.style}`, rows: rowStr(ROWS.human), cell: H, pri, tint: 'color',
        note: `${starter.has(k) ? '初期装備。' : ''}色違い ${s.items.length} 種を tint で表現: ${ids}` });
    }
  }
  for (let i = 1; i <= 3; i++) {
    add({ path: `chars/tear_${i}.png`, kind: 'char-tear', id: `tear_${i}`, name: `服破れ 段階${i}（HP ${[75, 50, 25][i - 1]}% 以下）`, rows: rowStr(ROWS.tear), cell: H, pri: 'A', tint: '',
      note: '上着・下衣の上に重ねる破れ・すす・ほつれ。インナーは必ず残す（全年齢）' });
  }
  // ---- 敵・ボス
  const reps = representativeIds();
  for (const e of Object.values(ENEMIES)) {
    const cell = cellFor(e).join('x');
    const [dw, dh] = drawnSize(e);
    if (e.boss) {
      const base = ROWS.enemy;
      add({ path: `bosses/${e.id}.png`, kind: 'boss', id: e.id, name: e.name, rows: rowStr([...base, ...ROWS.boss2]), cell, pri: 'S',
        note: `${REGION_JA[e.region]} Lv${e.level} art=${e.art} 画面上 約${dw}x${dh}px。${isFlyer(e) ? '飛行型（walk 行に飛行モーション）。' : ''}第2形態（HP50%以下）の行 idle2/walk2/windup2/attack2` });
      continue;
    }
    const rws = ROWS.enemy;
    let pri = reps.has(e.id) ? 'A' : 'B';
    const tags = [];
    if (isFlyer(e)) tags.push('飛ぶ敵: walk 行に飛行モーションを描く（行名 fly でも可）');
    if (reps.has(e.id)) tags.push(`art「${e.art}」の代表（${e.art}.png として置けば同じ art の他の敵の代用にもなる）`);
    if (e.night) tags.push('夜だけ出る');
    if (e.isCop) tags.push('警察（手配度で出現）');
    if (e.civilian) { tags.push('町の市民。服装は乱数で変わるので個別シートは任意'); pri = 'B'; }
    if (HUMAN_ARTS[e.art] && !e.civilian) tags.push('人型（chars の部品でも描かれる）');
    add({ path: `enemies/${e.id}.png`, kind: 'enemy', id: e.id, name: e.name, rows: rowStr(rws), cell, pri,
      note: `${REGION_JA[e.region] || e.region} Lv${e.level} art=${e.art} 主色${e.color || ''} 画面上 約${dw}x${dh}px。${tags.join('。')}` });
  }
  // ---- PET
  for (const st of PET_STYLES) {
    add({ path: `pets/${st}.png`, kind: 'pet', id: st, name: 'PET ' + (PET_JA[st] || st), rows: rowStr(ROWS.pet), cell: PET_CELL.join('x'), pri: 'A',
      note: '超レアドロップのマスコット。画面上 高さ 28〜40px' });
  }
  return rows;
}

// ---------------------------------------------------------------- テンプレートの manifest から作る
export function templateDir() {
  const a = process.argv.find((x) => x.startsWith('--template='));
  return a ? path.resolve(ROOT, a.slice(11)) : path.join(ROOT, 'assets', 'sprites_template');
}
export function loadTemplateManifest(dir = templateDir()) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return null; }
}
const WK_JA = { gun: '銃を持つとき', melee: '近接武器を持つとき', magic: '杖を持つとき' };
const wkOf = (ws) => (!ws ? 'none' : ws === 'pistol' || ws === 'smg' ? 'gun' : ws === 'staff' ? 'magic' : 'melee');
/** 主人公（3クラス×♂♀）の初期装備: Set('slot:style:g')、初期の上着ごとの武器種 Map('style:g' → Set(wk)) */
function starterPairs() {
  const set = new Set(), topWk = new Map();
  for (const cid of Object.keys(STARTER_EQUIP)) for (const g of ['f', 'm']) {
    const eq = { ...STARTER_EQUIP[cid], ...(STARTER_EQUIP_GENDER[cid]?.[g] || {}) };
    const ws = eq.weapon && ITEMS[eq.weapon] ? ITEMS[eq.weapon].look.style : null;
    for (const slot of WEAR_SLOTS) if (eq[slot] && ITEMS[eq[slot]]) {
      const st = ITEMS[eq[slot]].look.style;
      set.add(`${slot}:${st}:${g}`);
      if (slot === 'top') { const k = `${st}:${g}`; if (!topWk.has(k)) topWk.set(k, new Set(['none'])); topWk.get(k).add(wkOf(ws)); }
    }
  }
  return { set, topWk };
}
const GJ = { f: '♀', m: '♂' };
function buildFromManifest(man) {
  const rows = [];
  const add = (r) => rows.push({ tint: '', note: '', ...r });
  const C = man.chars || {};
  const baseRows = C.rows || Object.fromEntries(ROWS.human);
  const rs = (o) => Object.entries(o).map(([k, v]) => `${k}(${Array.isArray(v) ? v[0] : v})`).join(' ');
  const cellS = (e) => `${e.cell[0]}x${e.cell[1]}`;
  const anc = (e) => `基準点 ${e.anchor[0]},${e.anchor[1]}${e._plain || ''}`;
  const defHair = new Set(Object.values(DEFAULT_LOOKS).flatMap((gg) => Object.entries(gg).map(([g, l]) => `${l.hair}:${g}`)));
  const defHairAny = new Set([...defHair].map((k) => k.split(':')[0]));
  const { set: starter, topWk } = starterPairs();
  const HAIR_JA = Object.fromEntries(HAIR_STYLES.map((h) => [h.id, h.name]));
  for (const [key, e0] of Object.entries(C.layers || {})) {
    const e = e0.plain ? { ...e0, anchor: e0.anchor, _plain: `。色付き版（任意）: ${e0.plain}（色が ${e0.plainColor} のときはこちらをそのまま使う）` } : e0;
    const rws = rs(e.rows || baseRows);
    const tint = e.tint || '';
    let m;
    if ((m = key.match(/^body_([fm])$/))) add({ path: e.file, kind: 'char-body', id: key, name: `素体 ${GJ[m[1]]}（奥の腕・胴・脚）`, rows: rws, cell: cellS(e), pri: 'S', tint, note: `${anc(e)}。インナー（タンクトップ＋スパッツ）込み。手前の腕は arm_${m[1]}` });
    else if ((m = key.match(/^arm_([fm])(?:@(\w+))?$/))) add({ path: e.file, kind: 'char-arm', id: key, name: `手前の腕 ${GJ[m[1]]}${m[2] ? '（' + WK_JA[m[2]] + '）' : '（素手）'}`, rows: rws, cell: cellS(e), pri: 'S', tint, note: `${anc(e)}。武器より奥・服より手前に重なる腕` });
    else if ((m = key.match(/^face_([fm])(?:@([0-9a-f]{6}))?$/i))) add({ path: e.file, kind: 'char-face', id: key, name: `顔 ${GJ[m[1]]}（目・眉・口）${m[2] ? '瞳 #' + m[2] + ' 用' : '基本'}`, rows: rws, cell: cellS(e), pri: 'S', tint, note: `${anc(e)}（頭の中心）。行は表情。頭の動きに合わせてゲームが動かす。${m[2] ? `瞳の色が #${m[2]} のキャラ用（色まで描く）` : '瞳の色は描いたまま（色違いは @色 の別ファイル）'}` });
    else if ((m = key.match(/^tear_(\d)_([fm])$/))) add({ path: e.file, kind: 'char-tear', id: key, name: `服破れ 段階${m[1]} ${GJ[m[2]]}（HP ${[75, 50, 25][m[1] - 1]}% 以下）`, rows: rws, cell: cellS(e), pri: 'A', tint, note: `${anc(e)}。上着の上に重ねる破れ・すす。インナーは必ず残す（全年齢）` });
    else if ((m = key.match(/^hair:(\w+?)_(back|front)_([fm])$/))) {
      const [, h, bf, g] = m;
      const pri = defHair.has(`${h}:${g}`) ? 'S' : defHairAny.has(h) ? 'A' : 'B';
      add({ path: e.file, kind: 'char-hair', id: key, name: `髪 ${HAIR_JA[h] || h} ${bf === 'back' ? '後ろ髪' : '前髪'} ${GJ[g]}`, rows: rws, cell: cellS(e), pri, tint, note: `${anc(e)}。${pri === 'S' ? '主人公の初期髪型。' : ''}${bf === 'back' ? '体より奥' : '顔より手前'}` });
    } else if ((m = key.match(/^(hat|top|bottom|shoes|accessory|weapon):(\w+?)(_sleeve|_back)?_([fm])(?:@(\w+))?$/))) {
      const [, slot, st, part, g, wk] = m;
      const isDef = st === '_default';
      let pri = starter.has(`${slot}:${st}:${g}`) ? 'S' : isDef ? 'A' : POPULAR.has(`${slot}:${st}`) ? 'A' : 'B';
      if (pri === 'S' && part === '_sleeve' && wk && !(topWk.get(`${st}:${g}`) || new Set()).has(wk)) pri = 'A';
      const ids = Object.values(ITEMS).filter((it) => it.slot === slot && it.look && it.look.style === st).map((it) => it.id);
      const pn = part === '_sleeve' ? ' 手前の袖' : part === '_back' ? ' 背面パーツ' : '';
      const nm = isDef ? `${SLOT_JA[slot]} 未装備時の服${pn}` : `${SLOT_JA[slot]} ${STYLE_JA[st] || st}${pn}`;
      add({ path: e.file, kind: 'equip-' + slot, id: key, name: `${nm} ${GJ[g]}${wk ? '（' + WK_JA[wk] + '）' : ''}`, rows: rws, cell: cellS(e), pri, tint,
        note: `${anc(e)}。${pri === 'S' && !isDef ? '初期装備。' : ''}${isDef ? '何も着ていないときの既定の服（Tシャツ/短パン/靴）。' : `色違い ${ids.length} 種を tint で表現: ${ids.join(' ')}`}` });
    } else add({ path: e.file, kind: 'char-other', id: key, name: key, rows: rws, cell: cellS(e), pri: 'B', tint, note: anc(e) });
  }
  const reps = representativeIds();
  for (const sec of ['bosses', 'enemies']) for (const [id, e] of Object.entries(man[sec] || {})) {
    const def = ENEMIES[id];
    if (!def) continue;
    const [dw, dh] = drawnSize(def);
    const tags = [];
    if (isFlyer(def)) tags.push('飛ぶ敵: walk 行に飛行モーション（行名 fly でも可）');
    if (sec === 'bosses') {
      add({ path: e.file, kind: 'boss', id, name: def.name, rows: rs(e.rows), cell: cellS(e), pri: 'S', note: `${anc(e)}。${REGION_JA[def.region]} Lv${def.level} art=${def.art} 画面上 約${dw}x${dh}px。第2形態（HP50%以下）の行 idle2/walk2/windup2/attack2。${tags.join('。')}` });
      continue;
    }
    const pri = reps.has(id) ? 'A' : 'B';
    if (reps.has(id)) tags.push(`art「${def.art}」の代表（enemies/${def.art}.png として置けば同じ art の他の敵の代用にもなる）`);
    if (def.night) tags.push('夜だけ出る');
    if (def.isCop) tags.push('警察（手配度で出現）');
    if (HUMAN_ARTS[def.art]) tags.push('人型');
    add({ path: e.file, kind: 'enemy', id, name: def.name, rows: rs(e.rows), cell: cellS(e), pri, note: `${anc(e)}。${REGION_JA[def.region] || def.region} Lv${def.level} art=${def.art} 主色${def.color || ''} 画面上 約${dw}x${dh}px。${tags.join('。')}` });
  }
  for (const [st, e] of Object.entries(man.pets || {})) {
    add({ path: e.file, kind: 'pet', id: st, name: 'PET ' + (PET_JA[st] || st), rows: rs(e.rows), cell: cellS(e), pri: 'A', note: `${anc(e)}。超レアドロップのマスコット。画面上 高さ 28〜40px` });
  }
  return rows;
}

/** 納品物の一覧。テンプレートの manifest があればそれに合わせる */
export function buildAssetList(man = loadTemplateManifest()) {
  const rows = man ? buildFromManifest(man) : buildSpecList();
  const order = { S: 0, A: 1, B: 2 };
  return rows.map((r, i) => ({ ...r, _i: i })).sort((a, b) => order[a.pri] - order[b.pri] || a._i - b._i).map(({ _i, ...r }) => r);
}
export const assetListSource = () => (loadTemplateManifest() ? 'template' : 'spec');

// ---------------------------------------------------------------- 出力
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(rows) {
  const head = ['パス', '種類', 'ID', '名前', '行（状態）', 'セル', '優先度', 'tint', '備考'];
  const lines = [head.join(',')];
  for (const r of rows) lines.push([`assets/sprites/${r.path}`, r.kind, r.id, r.name, r.rows, r.cell, r.pri, r.tint, r.note].map(csvCell).join(','));
  return '﻿' + lines.join('\n') + '\n'; // BOM: Excel で文字化けしないように
}
export function summary(rows) {
  const by = { S: 0, A: 0, B: 0 };
  for (const r of rows) by[r.pri]++;
  return { total: rows.length, ...by };
}
function toMarkdown(rows) {
  const s = summary(rows);
  const kinds = {};
  for (const r of rows) { const k = r.kind.replace(/^equip-.*/, 'equip'); (kinds[k] ??= { S: 0, A: 0, B: 0 })[r.pri]++; }
  const KJ = { 'char-arm': '手前の腕', 'char-body': '素体', 'char-face': '顔', 'char-hair': '髪型', equip: '装備（スタイル×性別、袖・背面を含む）', 'char-tear': '服破れ', boss: 'ボス', enemy: '敵', pet: 'PET' };
  const out = [];
  out.push(`**総数 ${s.total} ファイル**（S: ${s.S} / A: ${s.A} / B: ${s.B}）— \`node tools/gen_asset_list.mjs\` で自動生成（${assetListSource() === 'template' ? 'テンプレートの manifest.json と 1 対 1' : 'テンプレート未生成のため SPEC_SPRITES の既定値'}）`);
  out.push('', '| 種類 | S | A | B | 計 |', '|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(kinds)) out.push(`| ${KJ[k] || k} | ${v.S} | ${v.A} | ${v.B} | ${v.S + v.A + v.B} |`);
  for (const p of ['S', 'A', 'B']) {
    const list = rows.filter((r) => r.pri === p);
    out.push('', `#### 優先度 ${p}（${list.length}）`, '', '| ☐ | ファイル（assets/sprites/ 以下） | 名前 | セル | tint |', '|---|---|---|---|---|');
    for (const r of list) out.push(`| ☐ | \`${r.path}\` | ${r.name} | ${r.cell} | ${r.tint || '—'} |`);
  }
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rows = buildAssetList();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'ASSET_LIST.csv'), toCsv(rows));
  const readme = path.join(OUT_DIR, 'README.md');
  if (fs.existsSync(readme)) {
    const src = fs.readFileSync(readme, 'utf8');
    const re = /(<!-- ASSET_TABLE:BEGIN -->)[\s\S]*?(<!-- ASSET_TABLE:END -->)/;
    if (re.test(src)) fs.writeFileSync(readme, src.replace(re, `$1\n${toMarkdown(rows)}\n$2`));
  }
  const s = summary(rows);
  console.log(`ASSET_LIST.csv: ${s.total} 件（S ${s.S} / A ${s.A} / B ${s.B}）元: ${assetListSource()}`);
}
