// ユニーク・セット・ミシック。担当: アイテム担当が中身を作る。
// ユニークの形: { id, name, base（ベースの kind か id）, slot, req, flavor（短い言い伝え）, mods: [{ s, min, max }], power?: { id, r? },
//                art?: 'gear.u.<id>'（専用の絵の枠。manifest が自動で作る）, cls?（クラス専用） }
// セットの形:   { id, name, cls?, pieces: [{ id, name, base, slot }], bonus: { 2: [{ s, v }] | { power }, 4: ..., 6: ... } }
// ミシックの形: ユニークと同じ + greater: true（オプションがすべて大いなる）
export const UNIQUES = [];
export const SETS = [];
export const MYTHICS = [];
