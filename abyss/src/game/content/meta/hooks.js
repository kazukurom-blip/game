// メタ担当の差し込み。仕組みの本体は game/systems/{prestige,achievements,bestiary,bounties,pets,offline}.js。
//
// ■ 主人公への効果（registry.addHeroSource）
//   'prestige'     魂の祭壇・星晶
//   'achievements' 実績ポイント・称号
//   'bestiary'     魔物図鑑（種族へのダメージ・見つけた割合）・宝物図鑑
//   'pets'         連れているペット・持っているペットすべて
// ■ 戦闘（unitHooks）
//   onHeroTick    連れているペットを動かし、手助けを使う（game.sys.pets.combatTick）
//   onMonsterHit  スキルごとのダメージを数える（game.sys.achievements.onHit。記録の窓の「スキル別」）
// ■ 倒したとき（game.events 'kill'。各システムの constructor で受ける） 卵・孵卵器・魔物図鑑の段
//   ※ game.js を import すると読み込みが循環するので gameHooks は使わない
// ■ 持ち物（invHooks） 宝物図鑑の登録・太古/原初の数・ミシックの分解

import { registry } from '../../registry.js';
import { unitHooks } from '../../combat.js';
import { invHooks } from '../../systems/inventory.js';
import { prestigeMods } from '../../systems/prestige.js';
import { achievementMods } from '../../systems/achievements.js';

registry.addHeroSource('prestige', (state, game) => (game?.sys?.prestige && game.state === state ? game.sys.prestige.heroMods() : prestigeMods(state)));
registry.addHeroSource('achievements', (state, game) => (game?.sys?.achievements && game.state === state ? game.sys.achievements.heroMods() : achievementMods(state, 0)));
registry.addHeroSource('bestiary', (state, game) => (game?.sys?.bestiary && game.state === state ? game.sys.bestiary.heroMods() : []));
registry.addHeroSource('pets', (state, game) => (game?.sys?.pets && game.state === state ? game.sys.pets.heroMods() : []));

unitHooks.onHeroTick.push((c, h, dt) => c.game.sys.pets?.combatTick(c, h, dt));
unitHooks.onMonsterHit.push((c, u, hit) => c.game.sys.achievements?.onHit(hit));


invHooks.onFound.push((game, item) => {
  game.sys.bestiary?.onFound(item);
  game.sys.achievements?.onFound(item);
});
invHooks.salvageExtra.push((game, item) => game.sys.achievements?.onSalvageItem(item));
