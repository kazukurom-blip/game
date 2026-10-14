// 画像の枠（差し替えできる絵）の一覧を、データから自動で作る。
// 枠の形: { id, cat, label, w, h, ax, ay, anchors?, frames?, fps?, blend?, fit?, prompt?, note? }
//   w, h  … ゲームの中で描く大きさ（px。画面は 1280×720 基準）。差し替え画像は高さを h に合わせて縮める
//   ax, ay … 基準点（0〜1）。キャラは足元（0.5, 0.97）、武器は握り（0.5, 0.82）、弾は中心
//   anchors … 体の中の点（hand: 武器を持つ手、offhand: 盾の手、head: 兜、back: 背中）
// 画像を作るときの決まり（向き・背景・大きさ）は docs/ASSETS.md と docs/AI_PROMPTS.md。

import { assets } from './assets.js';
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { MONSTERS } from '../data/monsters.js';
import { ACTS } from '../data/world.js';
import { WEAPON_KINDS, OFFHAND_KINDS, ARMOR_STYLES, KIND_NAMES, STYLE_NAMES } from '../data/items.js';
import { MATERIALS } from '../data/materials.js';
import { PETS } from '../data/pets.js';
import { UNIQUES, MYTHICS, SETS } from '../data/uniques.js';

export const CATEGORIES = [
  { id: 'hero', name: '主人公' },
  { id: 'gear', name: '装備（着た姿）' },
  { id: 'monster', name: '敵・ボス' },
  { id: 'minion', name: '召喚物・ペット' },
  { id: 'fx', name: 'スキルの演出' },
  { id: 'icon', name: 'アイコン' },
  { id: 'bg', name: '背景' },
  { id: 'ui', name: '画面の飾り' },
];

/** 主人公の体の基準点（差し替え画像でも同じ位置に手・頭が来るように描くと合う） */
export const HERO_ANCHORS = { hand: [0.66, 0.56], offhand: [0.34, 0.56], head: [0.5, 0.17], back: [0.44, 0.38], chest: [0.5, 0.42] };

const extra = []; // 担当が足す枠
export function addSlots(list) { extra.push(...list); }

export function buildManifest() {
  const S = [];
  for (const c of CLASSES) {
    S.push({ id: `hero.${c.id}.body`, cat: 'hero', label: `${c.name}（体・基本の服）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, facing: 'right', params: { cls: c.id } });
    for (const st of ARMOR_STYLES) S.push({ id: `hero.${c.id}.outfit.${st}`, cat: 'hero', label: `${c.name}（${STYLE_NAMES[st]}の鎧を着た姿）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, facing: 'right', fallback: [`hero.${c.id}.body`], noInherit: true, params: { cls: c.id, style: st } });
    S.push({ id: `hero.${c.id}.portrait`, cat: 'hero', label: `${c.name}（立ち絵・選択画面）`, w: 300, h: 420, ax: 0.5, ay: 1, params: { cls: c.id } });
  }
  for (const k of WEAPON_KINDS) S.push({ id: `gear.${k}`, cat: 'gear', label: `${KIND_NAMES[k]}（手に持った姿）`, w: 110, h: 150, ax: 0.5, ay: 0.82, facing: 'up', params: { kind: k } });
  for (const k of OFFHAND_KINDS) S.push({ id: `gear.${k}`, cat: 'gear', label: `${KIND_NAMES[k]}（副手）`, w: 90, h: 110, ax: 0.5, ay: 0.55, params: { kind: k } });
  for (const st of ARMOR_STYLES) S.push({ id: `gear.helm.${st}`, cat: 'gear', label: `${STYLE_NAMES[st]}の兜`, w: 80, h: 70, ax: 0.5, ay: 0.72, params: { style: st } });
  for (const slot of ['chest', 'gloves', 'belt', 'legs', 'boots']) for (const st of ARMOR_STYLES) S.push({ id: `gear.${slot}.${st}`, cat: 'gear', label: `${STYLE_NAMES[st]}の${KIND_NAMES[slot]}（重ね着の部品）`, w: 150, h: 200, ax: 0.5, ay: 0.97, anchors: HERO_ANCHORS, params: { slot, style: st }, note: '体の画像の上に重ねる部品（任意）。全身を差し替えるなら hero.<クラス>.outfit.<スタイル> を使う' });
  // 持ち物のアイコン
  for (const k of [...WEAPON_KINDS, ...OFFHAND_KINDS]) S.push({ id: `icon.item.${k}`, cat: 'icon', label: `${KIND_NAMES[k]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, fallback: [`gear.${k}`], params: { kind: k } });
  for (const slot of ['helm', 'chest', 'gloves', 'belt', 'legs', 'boots']) for (const st of ARMOR_STYLES) S.push({ id: `icon.item.${slot}.${st}`, cat: 'icon', label: `${STYLE_NAMES[st]}の${KIND_NAMES[slot]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, params: { kind: slot, style: st } });
  for (const k of ['amulet', 'ring']) S.push({ id: `icon.item.${k}`, cat: 'icon', label: `${KIND_NAMES[k]}のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, params: { kind: k } });
  for (const m of MATERIALS) S.push({ id: `icon.mat.${m.id}`, cat: 'icon', label: `${m.name}`, w: 64, h: 64, ax: 0.5, ay: 0.5, params: { color: m.color, mat: m.id } });
  for (const s of SKILLS) {
    S.push({ id: `icon.skill.${s.id}`, cat: 'icon', label: `スキル「${s.name}」のアイコン`, w: 96, h: 96, ax: 0.5, ay: 0.5, params: { skill: s.id, el: s.element } });
    S.push({ id: `fx.${s.id}.proj`, cat: 'fx', label: `「${s.name}」の弾`, w: 90, h: 46, ax: 0.6, ay: 0.5, blend: 'lighter', facing: 'right', params: { skill: s.id, el: s.element, part: 'proj' } });
    S.push({ id: `fx.${s.id}.hit`, cat: 'fx', label: `「${s.name}」の当たった瞬間`, w: 120, h: 120, ax: 0.5, ay: 0.5, blend: 'lighter', params: { skill: s.id, el: s.element, part: 'hit' } });
    S.push({ id: `fx.${s.id}.area`, cat: 'fx', label: `「${s.name}」の範囲（地面・爆発）`, w: 256, h: 256, ax: 0.5, ay: 0.5, blend: 'lighter', params: { skill: s.id, el: s.element, part: 'area' } });
    S.push({ id: `fx.${s.id}.swing`, cat: 'fx', label: `「${s.name}」の斬撃・振りの軌跡`, w: 200, h: 200, ax: 0.5, ay: 0.5, blend: 'lighter', params: { skill: s.id, el: s.element, part: 'swing' } });
  }
  for (const k of ['arrow', 'fireball', 'orb', 'bone', 'ice', 'spit']) S.push({ id: `fx.enemy.${k}`, cat: 'fx', label: `敵の弾（${k}）`, w: 70, h: 40, ax: 0.5, ay: 0.5, blend: 'lighter', params: { proj: k } });
  for (const m of MONSTERS) {
    const big = m.boss ? 1.6 : 1;
    S.push({ id: `monster.${m.id}`, cat: 'monster', label: `${m.boss ? 'ボス' : '敵'}「${m.name}」`, w: Math.round(150 * big), h: Math.round(150 * big), ax: 0.5, ay: m.flying ? 0.6 : 0.97, facing: 'left', params: { mon: m.id } });
  }
  for (const k of ['skeleton', 'skelmage']) S.push({ id: `minion.${k}`, cat: 'minion', label: `召喚物（${k}）`, w: 120, h: 140, ax: 0.5, ay: 0.97, facing: 'right', params: { minion: k } });
  for (const p of PETS) S.push({ id: `pet.${p.id}`, cat: 'minion', label: `ペット「${p.name}」`, w: 90, h: 90, ax: 0.5, ay: 0.97, facing: 'right', params: { pet: p.id } });
  for (const u of [...UNIQUES, ...MYTHICS]) S.push({ id: `gear.u.${u.id}`, cat: 'gear', label: `ユニーク「${u.name}」（着た姿）`, w: 110, h: 150, ax: 0.5, ay: 0.82, params: { unique: u.id }, note: '無ければベースの絵' });
  for (const st of SETS) for (const pc of st.pieces || []) S.push({ id: `gear.u.${pc.id}`, cat: 'gear', label: `セット「${pc.name}」（着た姿）`, w: 110, h: 150, ax: 0.5, ay: 0.82, params: { unique: pc.id } });
  for (const a of ACTS) {
    S.push({ id: `bg.${a.id}`, cat: 'bg', label: `${a.name}（背景・一番奥）`, w: 1280, h: 720, ax: 0, ay: 0, fit: 'width', params: { act: a.id, layer: 'far' } });
    S.push({ id: `bg.${a.id}.mid`, cat: 'bg', label: `${a.name}（背景・中景、横につながる絵）`, w: 1280, h: 720, ax: 0, ay: 0, fit: 'width', params: { act: a.id, layer: 'mid' }, noInherit: true });
    S.push({ id: `bg.${a.id}.ground`, cat: 'bg', label: `${a.name}（地面、横につながる絵）`, w: 1280, h: 220, ax: 0, ay: 0, fit: 'width', params: { act: a.id, layer: 'ground' }, noInherit: true });
  }
  S.push({ id: 'ui.logo', cat: 'ui', label: 'タイトルロゴ', w: 720, h: 240, ax: 0.5, ay: 0.5 });
  S.push({ id: 'ui.title', cat: 'ui', label: 'タイトル画面の背景', w: 1280, h: 720, ax: 0, ay: 0, fit: 'width' });
  S.push(...extra);
  return S;
}

export function installManifest() {
  assets.defineMany(buildManifest());
}
