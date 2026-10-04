// エンドコンテンツの毎フレーム更新とイベント購読をまとめる（ボス戦・スパイア・アリーナ）
//  updateContent(game, dt) は skills.updateSkills から毎フレーム呼ばれる（main は追加の呼び出し不要）
//  attachContent(game) は mapChanged（インスタンスを出たら終了）・playerDied（ボスのデスカウント）を購読
import { bossUpdate, bossOnDeath, bossOnMapChanged } from './bosses.js';
import { towerUpdate, towerOnMapChanged } from './tower.js';
import { arenaUpdate, arenaOnMapChanged } from './arena.js';

export function updateContent(game, dt) {
  if (!game?.state) return;
  if (!game._contentUnsub && game.events) attachContent(game);
  bossUpdate(game, dt);
  towerUpdate(game, dt);
  arenaUpdate(game, dt);
}

export function attachContent(game) {
  if (game._contentUnsub) return game._contentUnsub;
  const ev = game.events;
  const offs = [
    ev?.on('mapChanged', (d) => {
      const id = d?.mapId || game.map?.id;
      bossOnMapChanged(game, id); towerOnMapChanged(game, id); arenaOnMapChanged(game, id);
    }),
    ev?.on('playerDied', () => bossOnDeath(game)),
    ev?.on('returnedToTitle', () => { game.bossMode = null; game.bossRun = null; game.towerRun = null; game.arenaRun = null; game.arenaEnded = false; }),
  ];
  game._contentUnsub = () => { offs.forEach((f) => f?.()); game._contentUnsub = null; };
  return game._contentUnsub;
}
