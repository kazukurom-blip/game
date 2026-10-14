// 画像の枠（差し替えできる絵）の一覧を、データから自動で作る。
//
// 枠の形: { id, cat, group, kind, label, w, h, ax, ay, anchors?, facing, blend?, fit?, frames?, fps?, fallback?, noInherit?, params, note? }
//   id      … 枠 ID（ファイル名にもなる。例: hero.warrior.body / monster.ash_wolf / fx.s_bolt.proj）。一度決めた ID は変えない
//   cat     … 大きな分類（CATEGORIES）。group … 画像の窓の小分類（GROUPS[cat]）
//   kind    … 指示文の型（prompts.js）
//   w, h    … ゲームの中で描く大きさ（px。画面は 1280×720 基準）。差し替え画像は高さを h に合わせる（fit:'width' なら幅を w に）
//   ax, ay  … 基準点（0〜1）。キャラは足元（0.5, 0.97）、武器は握り（0.5, 0.82）、弾・演出は中心
//   anchors … 体の中の点（hand: 武器を持つ手、offhand: 盾の手、head: 兜、back: 背中、chest: 胸）
//   facing  … 'right' | 'left' | 'up' | 'front' | 'none'（絵の向き。敵は左向き、主人公は右向き）
//   fallback… 差し替えが無いときに代わりに使う枠（例: 鎧の姿 → 体、アイコン → 装備の絵）
//   noInherit … 末尾を削った親の ID の画像を使わない
// 指示文は slotPrompt(spec)（prompts.js の buildPrompt）。画像の作り方は docs/ASSETS.md・docs/AI_PROMPTS.md。
//
// ほかの担当が枠を足すとき: addSlots([{ id, cat, label, w, h, ax, ay, ... }])。後から足しても登録される。
// まだ無いデータ（data/gems.js・data/supports.js）は、読み込まれていれば loadOptionalSlots() で枠を足す（無くても壊れない）。

import { assets } from './assets.js';
import { buildPrompt, kindNameJa } from './prompts.js';
import { CLASSES, CLASS } from '../data/classes.js';
import { SKILLS, SKILL } from '../data/skills.js';
import { MONSTERS, MONSTER } from '../data/monsters.js';
import { ACTS } from '../data/world.js';
import { WEAPON_KINDS, OFFHAND_KINDS, ARMOR_STYLES, KIND_NAMES, STYLE_NAMES, BASE, BASES } from '../data/items.js';
import { MATERIALS } from '../data/materials.js';
import { PETS } from '../data/pets.js';
import { UNIQUES, MYTHICS, SETS } from '../data/uniques.js';

export const CATEGORIES = [
  { id: 'hero', name: '主人公', desc: '体・鎧を着た姿・クラス選択の立ち絵' },
  { id: 'gear', name: '装備（着た姿）', desc: '手に持つ武器・副手・兜・ユニークの見た目' },
  { id: 'monster', name: '敵・ボス', desc: '章ごとの敵とボス（左向き）' },
  { id: 'minion', name: '召喚物・ペット', desc: '死霊術師の骸骨などの召喚物と、連れて歩くペット' },
  { id: 'fx', name: 'スキルの演出', desc: '弾・当たった瞬間・範囲・斬撃などの光（黒い背景で作ると加算で黒が消える）' },
  { id: 'icon', name: 'アイコン', desc: '持ち物・素材・スキル・宝石のアイコン' },
  { id: 'bg', name: '背景', desc: '章ごとの奥・中景・地面の 3 枚（横につながる絵）' },
  { id: 'ui', name: '画面の飾り', desc: 'タイトルロゴとタイトル画面' },
];
/** 画像の窓の小分類（buildManifest で作る）: { cat: [{ id, name }] } */
export const GROUPS = {};

/** 主人公の体の基準点（差し替え画像でも同じ位置に手・頭が来るように描くと合う） */
export const HERO_ANCHORS = { hand: [0.66, 0.56], offhand: [0.34, 0.56], head: [0.5, 0.17], back: [0.44, 0.38], chest: [0.5, 0.42] };

/** アンカーの名前（画像の窓の表示） */
export const ANCHOR_NAMES = { hand: '手（武器）', offhand: '副手（盾）', head: '頭（兜）', back: '背中（矢筒）', chest: '胸' };

/** 各スキルの動き（behavior）ごとに、どの演出の部品を使うか。知らない動きは proj/hit/area/swing を全部作る */
export const FX_PARTS = {
  melee: ['swing', 'hit'], projectile: ['proj', 'hit'], nova: ['area', 'hit'], rain: ['proj', 'area', 'hit'], chain: ['chain', 'hit'], summon: ['summon'], buff: ['buff'],
  leap: ['swing', 'area', 'hit'], dash: ['trail', 'swing', 'hit'], beam: ['beam', 'hit'], whirl: ['swing', 'area', 'hit'], channel: ['swing', 'area', 'hit'], aura: ['aura', 'hit'], trap: ['trap', 'area', 'hit'],
  totem: ['totem', 'proj', 'hit'], turret: ['totem', 'proj', 'hit'], dot: ['area', 'hit'], cloud: ['area', 'hit'], meteor: ['proj', 'area', 'hit'], orbit: ['proj', 'hit'], wall: ['area', 'hit'], wave: ['area', 'hit'],
  curse: ['curse', 'area'], shield: ['buff'], barrier: ['buff'], ult: ['cut', 'area', 'hit'],
};
const FX_PART_INFO = {
  proj: { name: '弾', w: 90, h: 46, ax: 0.6, ay: 0.5, facing: 'right' },
  hit: { name: '当たった瞬間', w: 120, h: 120 },
  area: { name: '範囲（地面・爆発）', w: 256, h: 256 },
  swing: { name: '斬撃・振りの軌跡', w: 200, h: 200 },
  chain: { name: '連鎖の稲妻（横に伸ばす）', w: 200, h: 60, ax: 0, facing: 'right' },
  beam: { name: '光線（横に伸ばす）', w: 300, h: 80, ax: 0, facing: 'right' },
  aura: { name: '足元のオーラ', w: 260, h: 120 },
  buff: { name: '強化のオーラ（体を包む）', w: 180, h: 240, ay: 0.95 },
  summon: { name: '呼び出す魔法陣', w: 200, h: 120, ay: 0.6 },
  trap: { name: '罠の置き物', w: 90, h: 70, ay: 0.95 },
  totem: { name: 'トーテム・砲台', w: 90, h: 160, ay: 0.97 },
  trail: { name: '突進の残像', w: 260, h: 90, ax: 0.8, facing: 'right' },
  curse: { name: '呪いの紋', w: 120, h: 120 },
  cut: { name: '奥義のカットイン（画面に大きく出す帯）', w: 1280, h: 360, blend: 'source-over' },
};
const ENEMY_FX = [['arrow', '矢'], ['fireball', '火の玉'], ['orb', '魔弾'], ['bone', '骨の破片'], ['ice', '氷の棘'], ['spit', '毒のつば']];
const ENEMY_AREAS = [['area', '地面の危険な範囲'], ['slam', '叩きつけの衝撃'], ['blast', '死に際の爆発'], ['zap', '落ちる雷']];
const MINION_NAMES = { skeleton: '骸骨の戦士', skelmage: '骸骨の魔術師', golem: 'ゴーレム', beast: '獣の相棒', clone: '影の分身', wolf: '狼', spirit: '霊' };

const extra = []; // 担当が足す枠
let optional = []; // data/gems.js などから作った枠
let installed = false;

/** ほかの担当が枠を足す（manifest を作った後でも登録される） */
export function addSlots(list) {
  extra.push(...list);
  if (installed) { const fin = list.map(finalize); ensureGroups(fin); assets.defineMany(fin); assets.changed(); }
}

export function buildManifest() {
  const S = [];
  for (const k of Object.keys(GROUPS)) delete GROUPS[k];
  const group = (cat, id, name) => { const g = (GROUPS[cat] ||= []); if (!g.some((x) => x.id === id)) g.push({ id, name }); return id; };

  // ---------------- 主人公
  for (const c of CLASSES) {
    const gid = group('hero', c.id, c.name);
    S.push({ id: `hero.${c.id}.body`, cat: 'hero', group: gid, kind: 'hero.body', label: `${c.name}（体・基本の服）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, facing: 'right', params: { cls: c.id }, note: '1 枚の絵を傾けたり揺らしたりして動かします。手は武器を持つ位置（アンカー「手」）に合わせてください' });
    for (const st of ARMOR_STYLES) S.push({ id: `hero.${c.id}.outfit.${st}`, cat: 'hero', group: gid, kind: 'hero.outfit', label: `${c.name}（${STYLE_NAMES[st]}の鎧を着た姿）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, facing: 'right', fallback: [`hero.${c.id}.body`], noInherit: true, params: { cls: c.id, style: st }, note: `胴に${STYLE_NAMES[st]}の鎧を着たときの全身。無ければ「体」の画像を使います` });
    S.push({ id: `hero.${c.id}.portrait`, cat: 'hero', group: gid, kind: 'hero.portrait', label: `${c.name}（立ち絵・クラス選択の画面）`, w: 300, h: 420, ax: 0.5, ay: 1, facing: 'right', params: { cls: c.id }, note: '背景つきの 1 枚絵でかまいません' });
  }

  // ---------------- 装備（着た姿）
  group('gear', 'weapon', '武器'); group('gear', 'offhand', '副手'); group('gear', 'helm', '兜'); group('gear', 'part', '鎧の部品'); group('gear', 'unique', 'ユニーク');
  for (const k of WEAPON_KINDS) S.push({ id: `gear.${k}`, cat: 'gear', group: 'weapon', kind: 'gear.weapon', label: `${KIND_NAMES[k]}（手に持った姿）`, w: 110, h: 150, ax: 0.5, ay: 0.82, facing: 'up', params: { kind: k }, note: '先を真上に、柄を下にして描きます。基準点は握る所。斜めの絵なら「回転」で縦に直せます' });
  for (const k of OFFHAND_KINDS) S.push({ id: `gear.${k}`, cat: 'gear', group: 'offhand', kind: 'gear.offhand', label: `${KIND_NAMES[k]}（副手）`, w: 90, h: 110, ax: 0.5, ay: 0.55, facing: k === 'shield' ? 'front' : 'up', params: { kind: k }, note: '基準点は持つ所（取っ手）' });
  for (const st of ARMOR_STYLES) S.push({ id: `gear.helm.${st}`, cat: 'gear', group: 'helm', kind: 'gear.helm', label: `${STYLE_NAMES[st]}の兜`, w: 80, h: 70, ax: 0.5, ay: 0.72, facing: 'right', params: { style: st }, note: '体の「頭」のアンカーに重ねます（体を差し替えたときは描かれません）' });
  for (const slot of ['chest', 'gloves', 'belt', 'legs', 'boots']) for (const st of ARMOR_STYLES) S.push({ id: `gear.${slot}.${st}`, cat: 'gear', group: 'part', kind: 'gear.part', label: `${STYLE_NAMES[st]}の${KIND_NAMES[slot]}（重ね着の部品）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, facing: 'right', params: { slot, style: st }, note: '体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う' });

  // ---------------- ユニーク・セット・ミシック（着た姿は武器・副手・兜だけ。アイコンは全部）
  const uniq = [...UNIQUES.map((u) => [u, 'ユニーク']), ...MYTHICS.map((u) => [u, 'ミシック']), ...SETS.flatMap((st) => (st.pieces || []).map((pc) => [{ ...pc, set: st }, `セット「${st.name}」`]))];
  for (const [u, what] of uniq) {
    if (!u?.id) continue;
    const b = BASE[u.base] || BASES.find((x) => x.kind === u.base);
    const kind = b?.kind || u.base || 'sword';
    const slot = u.slot || b?.slot || 'weapon';
    const params = { unique: u.id, kind, slot, name: u.name, flavor: u.flavor || '' };
    const look = slot === 'weapon' ? { w: 110, h: 150, ax: 0.5, ay: 0.82, facing: 'up' } : slot === 'offhand' ? { w: 90, h: 110, ax: 0.5, ay: 0.55, facing: kind === 'shield' ? 'front' : 'up' } : slot === 'helm' ? { w: 80, h: 70, ax: 0.5, ay: 0.72, facing: 'right' } : null;
    if (look) S.push({ id: `gear.u.${u.id}`, cat: 'gear', group: 'unique', kind: 'gear.unique', label: `${what}「${u.name}」（着た姿）`, ...look, params, fallback: b?.art ? [b.art] : undefined, note: '無ければベースの絵（同じ種類の装備）を使います' });
    S.push({ id: `icon.u.${u.id}`, cat: 'icon', group: group('icon', 'unique', 'ユニーク'), kind: 'icon.unique', label: `${what}「${u.name}」のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, facing: 'none', params, fallback: look ? [`gear.u.${u.id}`] : undefined, note: '無ければ着た姿の画像、それも無ければベースのアイコン' });
  }

  // ---------------- アイコン
  group('icon', 'weapon', '武器・副手'); group('icon', 'armor', '防具'); group('icon', 'jewel', '装飾品'); group('icon', 'mat', '素材'); group('icon', 'skill', 'スキル');
  for (const k of [...WEAPON_KINDS, ...OFFHAND_KINDS]) S.push({ id: `icon.item.${k}`, cat: 'icon', group: 'weapon', kind: 'icon.item', label: `${KIND_NAMES[k]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, facing: 'none', fallback: [`gear.${k}`], params: { kind: k }, note: '無ければ「手に持った姿」の画像を使います' });
  for (const slot of ['helm', 'chest', 'gloves', 'belt', 'legs', 'boots']) for (const st of ARMOR_STYLES) S.push({ id: `icon.item.${slot}.${st}`, cat: 'icon', group: 'armor', kind: 'icon.item', label: `${STYLE_NAMES[st]}の${KIND_NAMES[slot]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, facing: 'none', fallback: [`gear.${slot}.${st}`], params: { kind: slot, style: st } });
  for (const k of ['amulet', 'ring']) S.push({ id: `icon.item.${k}`, cat: 'icon', group: 'jewel', kind: 'icon.item', label: `${KIND_NAMES[k]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, facing: 'none', params: { kind: k } });
  for (const m of MATERIALS) S.push({ id: `icon.mat.${m.id}`, cat: 'icon', group: 'mat', kind: 'icon.mat', label: `素材「${m.name}」のアイコン`, w: 64, h: 64, ax: 0.5, ay: 0.5, facing: 'none', params: { color: m.color, mat: m.id, name: m.name } });

  // ---------------- スキル（アイコン・演出）
  for (const s of SKILLS) {
    const cls = CLASS[s.cls];
    S.push({ id: `icon.skill.${s.id}`, cat: 'icon', group: 'skill', kind: 'icon.skill', label: `スキル「${s.name}」のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, facing: 'none', params: { skill: s.id, el: s.element } });
    const gid = group('fx', s.cls || 'other', cls ? cls.name : 'その他');
    const seen = new Set();
    for (const part of fxPartsOf(s)) {
      if (seen.has(part)) continue;
      seen.add(part);
      const info = FX_PART_INFO[part] || FX_PART_INFO.hit;
      S.push({ id: `fx.${s.id}.${part}`, cat: 'fx', group: gid, kind: 'fx', label: `「${s.name}」の${info.name}`, w: info.w, h: info.h, ax: info.ax ?? 0.5, ay: info.ay ?? 0.5, blend: info.blend || 'lighter', facing: info.facing || 'none', params: { skill: s.id, el: s.element, part } });
    }
    // スキル定義の fx: { cast, proj, hit, area } で別の ID を指定しているとき
    for (const [part, id] of Object.entries(s.fx || {})) {
      if (typeof id !== 'string' || S.some((x) => x.id === id)) continue;
      const info = FX_PART_INFO[part] || FX_PART_INFO.hit;
      S.push({ id, cat: 'fx', group: gid, kind: 'fx', label: `「${s.name}」の演出（${part}）`, w: info.w, h: info.h, ax: info.ax ?? 0.5, ay: info.ay ?? 0.5, blend: 'lighter', facing: info.facing || 'none', params: { skill: s.id, el: s.element, part } });
    }
  }
  const eg = group('fx', 'enemy', '敵の攻撃');
  const projKinds = new Map(ENEMY_FX);
  for (const m of MONSTERS) if (m.proj && !projKinds.has(m.proj)) projKinds.set(m.proj, m.proj);
  for (const [k, name] of projKinds) S.push({ id: `fx.enemy.${k}`, cat: 'fx', group: eg, kind: 'fx.enemy', label: `敵の弾（${name}）`, w: 70, h: 40, ax: 0.5, ay: 0.5, blend: 'lighter', facing: 'left', params: { proj: k } });
  for (const [k, name] of ENEMY_AREAS) S.push({ id: `fx.enemy.${k}`, cat: 'fx', group: eg, kind: 'fx.enemy', label: `敵の攻撃（${name}）`, w: 256, h: 256, ax: 0.5, ay: 0.5, blend: 'lighter', facing: 'none', params: { proj: k } });
  // 親の枠: 専用の画像が無い敵の攻撃（ボスの特技など、あとから増える物も）はこの画像を使う
  S.push({ id: 'fx.enemy', cat: 'fx', group: eg, kind: 'fx.enemy', label: '敵の攻撃の演出（全部まとめて）', w: 128, h: 128, ax: 0.5, ay: 0.5, blend: 'lighter', facing: 'none', params: { proj: 'orb' }, note: 'ここに入れると、専用の画像が無い敵の弾・攻撃すべてに使われます（ボスの特技も）' });

  // ---------------- 敵・ボス（章ごと）
  const actOf = new Map();
  ACTS.forEach((a, i) => {
    group('monster', a.id, a.name.replace(/\s.*$/, '').replace(/　.*$/, ''));
    if (a.actBoss && !actOf.has(a.actBoss)) actOf.set(a.actBoss, a.id);
    for (const z of a.zones || []) for (const id of [...(z.monsters || []), ...(z.elites || []), z.boss]) if (id && !actOf.has(id)) actOf.set(id, ACTS[i].id);
  });
  for (const m of MONSTERS) {
    const big = m.boss ? 1.6 : 1;
    const gid = actOf.get(m.id) || group('monster', 'other', 'そのほか');
    S.push({ id: `monster.${m.id}`, cat: 'monster', group: gid, kind: 'monster', label: `${m.boss ? 'ボス' : '敵'}「${m.name}」`, w: Math.round(150 * big), h: Math.round(150 * big), ax: 0.5, ay: m.flying ? 0.6 : 0.97, facing: 'left', params: { mon: m.id }, note: m.flying ? '飛ぶ敵。基準点は体の中心あたり' : '左向き（主人公の方を向く）。右向きの絵なら「左右反転」' });
  }

  // ---------------- 召喚物・ペット
  const minions = new Map([['skeleton', MINION_NAMES.skeleton], ['skelmage', MINION_NAMES.skelmage]]);
  for (const s of SKILLS) {
    const units = [s.summon?.unit, ...(s.runes || []).map((r) => r.mod?.summon?.unit)].filter(Boolean);
    for (const u of units) if (!minions.has(u)) minions.set(u, MINION_NAMES[u] || u);
  }
  group('minion', 'summon', '召喚物');
  for (const [k, name] of minions) S.push({ id: `minion.${k}`, cat: 'minion', group: 'summon', kind: 'minion', label: `召喚物「${name}」`, w: 120, h: 140, ax: 0.5, ay: 0.97, facing: 'right', params: { minion: k, label: name } });
  S.push({ id: 'minion', cat: 'minion', group: 'summon', kind: 'minion', label: '召喚物（全部まとめて）', w: 120, h: 140, ax: 0.5, ay: 0.97, facing: 'right', params: { minion: 'skeleton', label: '召喚物' }, note: 'ここに入れると、専用の画像が無い召喚物すべてに使われます' });
  if (PETS.length) group('minion', 'pet', 'ペット');
  for (const p of PETS) S.push({ id: `pet.${p.id}`, cat: 'minion', group: 'pet', kind: 'pet', label: `ペット「${p.name}」`, w: 90, h: 90, ax: 0.5, ay: 0.97, facing: 'right', params: { pet: p.id } });

  // ---------------- 背景
  for (const a of ACTS) {
    const gid = group('bg', a.id, a.name.replace(/　.*$/, ''));
    S.push({ id: `bg.${a.id}`, cat: 'bg', group: gid, kind: 'bg', label: `${a.name}（背景・一番奥）`, w: 1280, h: 720, ax: 0, ay: 0, fit: 'width', facing: 'none', params: { act: a.id, layer: 'far' }, note: 'ゆっくり横に流れます。下の方は暗めに' });
    S.push({ id: `bg.${a.id}.mid`, cat: 'bg', group: gid, kind: 'bg', label: `${a.name}（背景・中景、横につながる絵）`, w: 1280, h: 720, ax: 0, ay: 0, fit: 'width', facing: 'none', params: { act: a.id, layer: 'mid' }, noInherit: true, note: '空の部分は透明に。左右の端がつながる絵（「左右をつなげる」でなじませられます）' });
    S.push({ id: `bg.${a.id}.ground`, cat: 'bg', group: gid, kind: 'bg', label: `${a.name}（地面、横につながる絵）`, w: 1280, h: 220, ax: 0, ay: 0, fit: 'width', facing: 'none', params: { act: a.id, layer: 'ground' }, noInherit: true, note: '画面の下の帯（高さ 220）。上の端が歩く面。縦長の絵は「切り抜き」で上下を切ります' });
  }

  // ---------------- 画面の飾り
  group('ui', 'title', 'タイトル');
  S.push({ id: 'ui.logo', cat: 'ui', group: 'title', kind: 'ui.logo', label: 'タイトルロゴ', w: 720, h: 240, ax: 0.5, ay: 0.5, facing: 'none', note: '背景は透明に' });
  S.push({ id: 'ui.title', cat: 'ui', group: 'title', kind: 'ui.title', label: 'タイトル画面の背景', w: 1280, h: 720, ax: 0, ay: 0, fit: 'width', facing: 'none', note: '画面いっぱいに広げて表示（はみ出た所は切れる）' });

  S.push(...optional, ...extra);
  // 同じ ID は後の物を優先（担当が上書きできる）
  const map = new Map();
  for (const s of S) map.set(s.id, finalize(s));
  const out = [...map.values()];
  ensureGroups(out);
  return out;
}

const GROUP_NAMES = { gem: '宝石・ルーン', support: '補助の刻印', unique: 'ユニーク', other: 'そのほか', enemy: '敵の攻撃', summon: '召喚物', pet: 'ペット' };
function ensureGroups(list) {
  for (const s of list) {
    const g = (GROUPS[s.cat] ||= []);
    if (!g.some((x) => x.id === s.group)) g.push({ id: s.group, name: GROUP_NAMES[s.group] || CLASS[s.group]?.name || s.group });
  }
}

/** 枠の決まりを埋める */
function finalize(s) {
  const out = { facing: 'none', group: s.group || 'other', kind: s.kind || guessKind(s), ...s };
  if (!out.label) out.label = describeUnknown(out.id);
  return out;
}

function guessKind(s) {
  const id = s.id || '';
  if (id.startsWith('hero.')) return id.endsWith('.portrait') ? 'hero.portrait' : id.includes('.outfit.') ? 'hero.outfit' : 'hero.body';
  if (id.startsWith('fx.enemy.')) return 'fx.enemy';
  if (id.startsWith('fx.')) return 'fx';
  if (id.startsWith('monster.')) return 'monster';
  if (id.startsWith('minion.')) return 'minion';
  if (id.startsWith('pet.')) return 'pet';
  if (id.startsWith('icon.gem')) return 'icon.gem';
  if (id.startsWith('icon.rune')) return 'icon.rune';
  if (id.startsWith('icon.skill')) return 'icon.skill';
  if (id.startsWith('icon.mat')) return 'icon.mat';
  if (id.startsWith('icon.')) return 'icon.item';
  if (id.startsWith('bg.')) return 'bg';
  if (id === 'ui.logo') return 'ui.logo';
  if (id === 'ui.title') return 'ui.title';
  return 'misc';
}

/** スキルが使う演出の部品 */
export function fxPartsOf(s) {
  const out = [...(FX_PARTS[s.behavior] || ['proj', 'hit', 'area', 'swing'])];
  for (const r of s.runes || []) {
    if (r.mod?.behavior) out.push(...(FX_PARTS[r.mod.behavior] || []));
    if (r.mod?.explode && !out.includes('area')) out.push('area');
  }
  if (s.explode && !out.includes('area')) out.push('area');
  if ((s.ult || s.ultimate || (s.tags || []).includes('ultimate')) && !out.includes('cut')) out.push('cut', 'area', 'hit');
  return out;
}

/** 指示文（必要になったときに作って覚えておく） */
const promptCache = new Map();
export function slotPrompt(spec) {
  if (!spec) return null;
  if (spec.prompt && spec.prompt.en) return spec.prompt;
  if (!promptCache.has(spec.id)) promptCache.set(spec.id, buildPrompt(spec));
  return promptCache.get(spec.id);
}

/** 枠の一覧に無い ID の説明（実行中に見つかった ID など） */
export function describeUnknown(id) {
  const p = String(id).split('.');
  if (p[0] === 'fx' && SKILL[p[1]]) return `「${SKILL[p[1]].name}」の演出（${p.slice(2).join('.') || '全体'}）`;
  if (p[0] === 'fx' && p[1] === 'enemy') return `敵の攻撃の演出（${p.slice(2).join('.')}）`;
  if (p[0] === 'monster' && MONSTER[p[1]]) return `敵「${MONSTER[p[1]].name}」（${p.slice(2).join('.') || '本体'}）`;
  if (p[0] === 'hero' && CLASS[p[1]]) return `${CLASS[p[1]].name}（${p.slice(2).join('.')}）`;
  if (p[0] === 'icon' && p[1] === 'gem') return `宝石のアイコン（${p.slice(2).join('.')}）`;
  if (p[0] === 'icon' && p[1] === 'rune') return `ルーンのアイコン（${p.slice(2).join('.')}）`;
  if (p[0] === 'minion') return `召喚物（${p.slice(1).join('.')}）`;
  if (p[0] === 'pet') return `ペット（${p.slice(1).join('.')}）`;
  return `${kindNameJa(guessKind({ id }))}（${id}）`;
}

/** 持ち物のマスに出すアイコンの枠 ID。ユニーク・セット・ミシックは専用の絵が入っていればそれを使う */
export function itemIconId(item) {
  const b = BASE[item?.base];
  const uid = item?.uniqueId || item?.pieceId || null;
  if (uid) {
    const id = `icon.u.${uid}`;
    if (assets.slots.has(id) && assets.isCustom(id)) return id;
  }
  return b?.icon || 'icon.item.sword';
}

export function installManifest() {
  assets.defineMany(buildManifest());
  installed = true;
  return loadOptionalSlots();
}

// ---------------------------------------------------------------- まだ無いかもしれないデータ（宝石・ルーン・刻印）
const OPTIONAL = [
  { path: '../data/gems.js', build: gemSlots },
  { path: '../data/supports.js', build: supportSlots },
];

/** 読み込まれているデータだけ使う（ブラウザでは、まだ誰も読み込んでいないファイルを取りに行かない＝404 を出さない） */
export async function loadOptionalSlots() {
  const found = [];
  for (const o of OPTIONAL) {
    try {
      const url = new URL(o.path, import.meta.url);
      if (!(await moduleExists(url))) continue;
      const mod = await import(url.href);
      found.push(...o.build(mod));
    } catch { /* 無ければ足さない */ }
  }
  optional = found;
  if (found.length) {
    const list = found.map(finalize);
    ensureGroups(list);
    assets.defineMany(list);
    assets.changed();
  }
  return found.length;
}

async function moduleExists(url) {
  if (typeof process !== 'undefined' && process.versions?.node && url.protocol === 'file:') {
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return fs.existsSync(fileURLToPath(url));
  }
  try {
    const list = globalThis.performance?.getEntriesByType?.('resource') || [];
    return list.some((e) => e.name.split('?')[0] === url.href);
  } catch { return false; }
}

/** テスト用: まだ無いデータから枠を作る関数 */
export const optionalSlotBuilders = { gems: (mod) => gemSlots(mod), supports: (mod) => supportSlots(mod) };

function arraysOf(mod) {
  return Object.entries(mod).filter(([, v]) => Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string'));
}

function gemSlots(mod) {
  const out = [];
  let gems = 0; let runes = 0;
  for (const [name, list] of arraysOf(mod)) {
    if (/RUNEWORD|WORD/i.test(name)) continue;
    const isRune = /RUNE/i.test(name);
    const isGem = /GEM|JEWEL/i.test(name);
    if (!isRune && !isGem) continue;
    const legendary = /LEGEND|ABYSS|DEEP/i.test(name);
    for (const g of list) {
      if (isRune) { runes++; out.push({ id: `icon.rune.${g.id}`, cat: 'icon', group: 'gem', kind: 'icon.rune', label: `ルーン「${g.name || g.id}」のアイコン`, w: 64, h: 64, ax: 0.5, ay: 0.5, params: { rune: g.id, name: g.name } }); } else { gems++; out.push({ id: `icon.gem.${g.id}`, cat: 'icon', group: 'gem', kind: 'icon.gem', label: `${legendary ? '深淵の宝石' : '宝石'}「${g.name || g.id}」のアイコン`, w: 64, h: 64, ax: 0.5, ay: 0.5, params: { gem: g.id, name: g.name, color: g.color } }); }
    }
  }
  if (gems) out.push({ id: 'icon.gem', cat: 'icon', group: 'gem', kind: 'icon.gem', label: '宝石のアイコン（全部まとめて）', w: 64, h: 64, ax: 0.5, ay: 0.5, params: { gem: 'gem' }, note: 'ここに入れると、専用の画像が無い宝石すべてに使われます' });
  if (runes) out.push({ id: 'icon.rune', cat: 'icon', group: 'gem', kind: 'icon.rune', label: 'ルーンのアイコン（全部まとめて）', w: 64, h: 64, ax: 0.5, ay: 0.5, params: { rune: 'rune' }, note: 'ここに入れると、専用の画像が無いルーンすべてに使われます' });
  return out;
}

function supportSlots(mod) {
  const out = [];
  for (const [name, list] of arraysOf(mod)) {
    if (!/SUPPORT|GLYPH/i.test(name)) continue;
    for (const g of list) out.push({ id: `icon.support.${g.id}`, cat: 'icon', group: 'support', kind: 'icon.support', label: `補助の刻印「${g.name || g.id}」のアイコン`, w: 64, h: 64, ax: 0.5, ay: 0.5, params: { support: g.id, name: g.name } });
  }
  if (out.length) out.push({ id: 'icon.support', cat: 'icon', group: 'support', kind: 'icon.support', label: '補助の刻印のアイコン（全部まとめて）', w: 64, h: 64, ax: 0.5, ay: 0.5, params: { support: 'support' }, note: 'ここに入れると、専用の画像が無い刻印すべてに使われます' });
  return out;
}

