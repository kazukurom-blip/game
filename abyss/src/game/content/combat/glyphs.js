// 補助の刻印のドロップの確率（1 体あたり）。普通の敵 約 300 体に 1 つ、エリート 約 40 体に 1 つ、ボス 4 体に 1 つ、章のボスは 2 体に 1 つ。
// 実際の抽選は game/systems/skillbook.js の rollGlyphDrop（gameHooks.rewardMods から呼ばれる）。
// ※ game.js を import すると読み込みの順番が循環するので、フックの登録は SkillSystem の constructor で行う。

export const GLYPH_DROP = { normal: 1 / 300, champion: 1 / 40, rare: 1 / 25, goblin: 1 / 5, boss: 1 / 4, guardian: 1 / 3, actboss: 0.5 };
