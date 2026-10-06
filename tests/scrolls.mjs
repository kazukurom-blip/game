// 移動の書（帰還の書・町移動の書）のテスト
import assert from 'node:assert/strict';
import { addItemToState, countItem, useItem } from '../src/systems/inventory.js';
import { nearestTownOf, townScrollTargets, TOWN_SCROLL_LV } from '../src/systems/scrolls.js';
import { markVisited } from '../src/systems/travel.js';

export default function register({ test, makeGame }) {
  test('移動の書: 一番近い町（同じ地域の町・第2ワールドの町）', () => {
    assert.equal(nearestTownOf('beach_f2'), 'beach');
    assert.equal(nearestTownOf('down_f1'), 'downtown');
    assert.equal(nearestTownOf('w2_cyberwild_f2'), 'w2_cyberwild');
    assert.equal(nearestTownOf('casino'), 'casino');
  });

  test('帰還の書: フィールドから町へ戻り 1 枚へる・町では使えず減らない', () => {
    const g = makeGame('luna', 'beach_f2');
    addItemToState(g.state, 'scroll_return', 2);
    assert.equal(useItem(g, 'scroll_return'), true);
    assert.equal(g.map.id, 'beach');
    assert.equal(countItem(g.state, 'scroll_return'), 1);
    assert.equal(useItem(g, 'scroll_return'), false, '町では使えない');
    assert.equal(countItem(g.state, 'scroll_return'), 1);
  });

  test('町移動の書: Lv30 から・行ったことのある同じワールドの町だけ・選んだ町へ飛んで 1 枚へる', () => {
    const g = makeGame('luna', 'down_f1');
    addItemToState(g.state, 'scroll_town', 2);
    g.state.level = TOWN_SCROLL_LV - 1;
    assert.equal(useItem(g, 'scroll_town'), false, 'Lv が足りない');
    g.state.level = TOWN_SCROLL_LV;
    for (const t of ['beach', 'casino', 'w2_arkcity']) markVisited(g.state, t);
    const list = townScrollTargets(g);
    assert.ok(list.includes('casino') && list.includes('beach'));
    assert.ok(!list.includes('w2_arkcity'), '別のワールドの町は出ない');
    assert.ok(!list.includes('rooftop'), '行ったことの無い町は出ない');
    let asked = null;
    g.ui = { askChoice: (o) => { asked = o; } };
    assert.equal(useItem(g, 'scroll_town'), true);
    assert.ok(asked && asked.choices.some((c) => c.id === 'casino'));
    asked.onPick('casino');
    assert.equal(g.map.id, 'casino');
    assert.equal(countItem(g.state, 'scroll_town'), 1);
  });

  test('移動の書: 店で買える（第1・第2ワールド）', async () => {
    const { TOWN_SHOPS } = await import('../src/data/shops.js');
    const all = JSON.stringify(TOWN_SHOPS);
    assert.ok(all.includes('scroll_return') && all.includes('scroll_town'));
    const { MAPS } = await import('../src/world/maps.js');
    assert.ok(JSON.stringify(MAPS.w2_arkcity.npcs).includes('scroll_return'));
  });
}
