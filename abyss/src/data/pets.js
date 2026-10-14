// ペット。担当: メタ担当が 20 種に増やす。見た目の差し替え枠は pet.<id>（manifest が自動で作る）。
// 形: { id, name, desc, rarity: 'common'|'rare'|'epic'|'legendary', body（monsters.js と同じ体の形）, palette: { main, sub, eye, accent? }, features?: [...],
//       size, bonus: [{ s, v }]（連れて歩くときの効果・Lv1）, perLevel: [{ s, v }]（1 レベルごとの上乗せ）, own: [{ s, v }]（持っているだけの効果）,
//       ability?: { kind: 'bite'|'bolt'|'heal'|'loot', cd, dmg }（戦闘での手助け） }
export const PETS = [
  { id: 'emberfox', name: '火狐のほむら', desc: '尾に火を灯す小さな狐。敵に火の粉を飛ばす。', rarity: 'common', body: 'quad', palette: { main: '#ff8a3a', sub: '#7a2a10', eye: '#ffe080' }, size: 0.55, bonus: [{ s: 'inc_fire', v: 5 }], perLevel: [{ s: 'inc_fire', v: 0.5 }], own: [{ s: 'gold_find', v: 1 }], ability: { kind: 'bolt', cd: 3, dmg: 40 } },
];
export const PET = Object.fromEntries(PETS.map((p) => [p.id, p]));
