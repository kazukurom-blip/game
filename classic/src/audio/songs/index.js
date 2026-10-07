// 曲の一覧（id → 楽譜のデータ）。曲を足したらここに書く。一覧と曲調は docs/SOUND.md。
// ジングル（くり返さない短い曲。jingle: true）も同じ一覧に入れる（書き出し先は manifest の jingle の欄）。
import title from './title.js';
import login from './login.js';
import ship from './ship.js';
import town_beginner from './town_beginner.js';
import town_port from './town_port.js';
import town_pom from './town_pom.js';
import town_silva from './town_silva.js';
import town_gard from './town_gard.js';
import town_crow from './town_crow.js';
import town_nemuri from './town_nemuri.js';
import market from './market.js';
import town_ceres from './town_ceres.js';
import town_hyoga from './town_hyoga.js';
import town_tinkle from './town_tinkle.js';
import town_marina from './town_marina.js';
import town_dragon from './town_dragon.js';
import camp from './camp.js';
import field_island from './field_island.js';
import field_port from './field_port.js';
import field_pom from './field_pom.js';
import field_silva from './field_silva.js';
import field_gard from './field_gard.js';
import field_crow from './field_crow.js';
import field_swamp from './field_swamp.js';
import field_sky from './field_sky.js';
import field_snow from './field_snow.js';
import field_toy from './field_toy.js';
import field_sea from './field_sea.js';
import field_dragon from './field_dragon.js';
import field_volcano from './field_volcano.js';
import field_star from './field_star.js';
import dungeon_deep from './dungeon_deep.js';
import dungeon_temple from './dungeon_temple.js';
import pq from './pq.js';
import boss_mid from './boss_mid.js';
import boss_big from './boss_big.js';
import boss_final from './boss_final.js';
import { JINGLES } from './jingles.js';

export const SONGS = {
  title, login, ship,
  town_beginner, town_port, town_pom, town_silva, town_gard, town_crow, town_nemuri, market,
  town_ceres, town_hyoga, town_tinkle, town_marina, town_dragon, camp,
  field_island, field_port, field_pom, field_silva, field_gard, field_crow, field_swamp,
  field_sky, field_snow, field_toy, field_sea, field_dragon, field_volcano, field_star,
  dungeon_deep, dungeon_temple, pq, boss_mid, boss_big, boss_final,
  ...JINGLES,
};
