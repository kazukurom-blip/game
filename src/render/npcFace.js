// NPC・人型の敵・市民の顔と髪（顔・髪の分割方式の絵）の割り当て。仕様: docs/SPEC_SPRITES.md「NPC・敵のリグ」
//  主人公（look.classId あり）は look.face / look.hair をそのまま使う。NPC 等は次の規則で「絵のある顔・髪」に寄せる:
//  - 性別 = look.body（'f' / 'm'）
//  - 顔: look.face が manifest にあればそれ。無ければ役割（role）の候補から、id のハッシュで決定論的に選ぶ。
//      npc = 通常の顔（主人公の初期の顔 f_01〜f_03 / m_01〜m_03 は除く。他が無ければ使う）
//      villain = 悪役の顔（種類ごとの好み → 悪役の顔全部 → 通常の顔）、don = m_don（→ 悪役 → 通常）、old = 老人の顔（→ 通常）
//  - 髪: hairs['<性別>_<look.hair>'] があればそれ。無ければ同じ性別の絵のある髪型から、長さが近い物（結ぶ髪は結ぶ髪を優先）。
//      ドンは m_slick → m_short → 近い物。髪の色はドンだけ白髪交じりのグレー
//  - 色: look.hairColor / skin / eyeColor をそのまま（重ね頭の色替え）
//  役割・id は tagNpcLook(look, info) で look に結び付ける（WeakMap。セーブ・比較に出ない）。付いていない look は見た目の値のハッシュと anim.villain で決める。
import { faceList, hairArtList, spriteManifestGen } from './sprites.js';

const TAGS = new WeakMap();        // look → { id, role, art }
const RES = new WeakMap();         // look → { gen, sig, villain, out }
/** 主人公の初期の顔（NPC の候補から外す。他が無ければ使う） */
export const HERO_FACES = { f_01: 1, f_02: 1, f_03: 1, m_01: 1, m_02: 1, m_03: 1 };
const VIL = { m: ['m_v01', 'm_v02', 'm_v03', 'm_v04', 'm_v05', 'm_v06'], f: ['f_v01', 'f_v02'] };
// 敵の種類ごとの好み（CODEX_BATCH_02 ⑨ の「使う所」）
const VIL_PREF = {
  thug: { m: ['m_v01', 'm_v02', 'm_v03'], f: ['f_v01'] },
  cop: { m: ['m_v04'], f: ['f_v02'] },
  swat: { m: ['m_v05'], f: ['f_v02'] },
  boss: { m: ['m_v06'], f: ['f_v01'] },
};
const OLD = { m: ['m_o01', 'm_o02'], f: ['f_o01'] };
const DON_HAIR_COLOR = '#8e8f99';  // 白髪交じりのグレー
// 髪型の長さ（目安。0 = 坊主 〜 5 = 腰まで）と、結ぶ髪か
const HAIR_LEN = {
  buzz: 0, short: 1, undercut: 1, mohawk: 1, slick: 1.1, spiky: 1.2, topknot: 1.3, messy: 1.6, afro: 2, bun: 2,
  curly: 2.5, bob: 2.5, sidepart: 2.5, wolf: 2.8, hime: 3.5, ponytail: 3.5, sidetail: 3.5, twin: 3.8, braid: 4, long: 4.5,
};
const TIED = { topknot: 1, bun: 1, ponytail: 1, sidetail: 1, twin: 1, braid: 1 };

/** look に NPC の情報を結び付ける。info = { id, name, title, role: 'npc'|'villain'|'don'|'old', art }（role 省略時は id・名前から推定） */
export function tagNpcLook(look, info) {
  if (!look || typeof look !== 'object' || !info) return look;
  const id = String(info.id || '');
  let role = info.role;
  if (!role) role = roleOf(id, info.name, info.title, info.art);
  TAGS.set(look, { id: id || String(info.name || ''), role, art: info.art || null });
  RES.delete(look);
  return look;
}
export function npcTagOf(look) { return (look && TAGS.get(look)) || null; }
/** id・名前・肩書・敵の種類 → 役割 */
export function roleOf(id, name, title, art) {
  id = String(id || ''); const s = id + ' ' + (name || '') + ' ' + (title || '');
  if (art === 'bossDon' || id === 'boss_don' || id === 'don_caiman') return 'don';
  if (art === 'thug' || art === 'cop' || art === 'swat') return 'villain';
  if (/(^|_)old(_|$)|elder|gran|grandpa|granny|じいさん|じじ|ばあさん|ばあちゃん|おばあ|おじい|老/.test(s)) return 'old';
  return 'npc';
}
/** 文字列 → 32bit ハッシュ（FNV-1a） */
export function hash32(s) {
  let h = 0x811c9dc5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const pickBy = (arr, h) => arr[h % arr.length];
/** 候補（優先順のリスト）の中で manifest にある物を、ハッシュで1つ */
function pickFace(groups, have, h) {
  for (const g of groups) {
    const a = g.filter((k) => have.has(k));
    if (a.length) return pickBy(a, h);
  }
  return null;
}
/** 絵のある髪型から look.hair に近い物 */
export function nearestHair(hair, have) {
  if (!have.length) return null;
  if (have.includes(hair)) return hair;
  const L = HAIR_LEN[hair] != null ? HAIR_LEN[hair] : 2;
  const t = !!TIED[hair];
  let best = null, bd = Infinity;
  for (const id of have) {
    const d = Math.abs((HAIR_LEN[id] != null ? HAIR_LEN[id] : 2) - L) + (!!TIED[id] !== t ? 0.6 : 0);
    if (d < bd - 1e-9) { bd = d; best = id; }
  }
  return best;
}
function sigOf(l) { return (l.body || '') + '|' + (l.face || '') + '|' + (l.hair || '') + '|' + (l.skin || '') + '|' + (l.hairColor || '') + '|' + (l.eyeColor || ''); }

/**
 * NPC・敵・市民の look → 顔・髪の分割方式で使う look（{ face, hair, gender, body, skin, hairColor, eyeColor }）| null（その性別の顔か髪の絵が無い）。
 * villain: anim.villain（タグの無い look の役割の推定に使う）。結果は look ごとにキャッシュ（manifest が変わるか look の値が変わったら作り直し）
 */
export function npcHeadLook(look, villain) {
  if (!look) return null;
  const gen = spriteManifestGen();
  const sig = sigOf(look);
  const c = RES.get(look);
  if (c && c.gen === gen && c.sig === sig && c.villain === !!villain) return c.out;
  const out = resolve(look, !!villain);
  RES.set(look, { gen, sig, villain: !!villain, out });
  return out;
}
function resolve(look, villain) {
  const g = look.body === 'm' ? 'm' : 'f';
  const faces = faceList(g);
  const hairs = hairArtList(g);
  if (!faces.length || !hairs.length) return null;
  const have = new Set(faces);
  const tag = TAGS.get(look);
  const role = tag ? tag.role : villain ? 'villain' : 'npc';
  const h = hash32((tag && tag.id) || sigOf(look));
  const normal = faces.filter((k) => /^[fm]_\d+$/.test(k));
  const normalNpc = normal.filter((k) => !HERO_FACES[k]);
  const allVil = VIL[g];
  let face = look.face && have.has(look.face) ? look.face : null;
  if (!face) {
    const groups = [];
    if (role === 'don') groups.push(g === 'm' ? ['m_don'] : [], allVil);
    else if (role === 'villain') { const pf = tag && tag.art && VIL_PREF[tag.art]; if (pf) groups.push(pf[g]); groups.push(allVil); }
    else if (role === 'old') groups.push(OLD[g]);
    groups.push(normalNpc, normal, faces);
    face = pickFace(groups, have, h);
  }
  if (!face) return null;
  let hair;
  if (role === 'don' && g === 'm') hair = hairs.includes('slick') ? 'slick' : hairs.includes('short') ? 'short' : nearestHair(look.hair, hairs);
  else hair = nearestHair(look.hair, hairs);
  if (!hair) return null;
  return {
    body: g, gender: g, face, hair, skin: look.skin, eyeColor: look.eyeColor,
    hairColor: role === 'don' ? DON_HAIR_COLOR : look.hairColor,
  };
}
