// v4 クエスト担当（2回目）: 第2ワールド「ネオン・アーク」のクエストの単体テスト（tests/unit.mjs から読み込む）
//  - 数（100 以上・地域ごとの連作・派生・ネタ・記念・m2 の続き 12〜20 話）
//  - データの整合（第2ワールドの敵の出現場所・素材の入手先・NPC の配置と間隔・前提・報酬の経験値とお金）
//    ※ 全クエスト共通の整合（敵・アイテム・NPC・前提の循環など）は tests/quests_v4.mjs が q2_ も含めて見る
//  - qset（同じ帯の W2_GEAR より強い）・cosmetic（能力ほぼ 0・色がかぶらない）
//  - 実際に進めて終える（アーク・シティの連作をすべて → 記念、アビスの派生 A 編、ネタの連作、m2_09〜m2_28 の通し）
import assert from 'node:assert/strict';
import { ITEMS, COSMETIC_IDS, QSET_IDS } from '../src/data/items.js';
import { ENEMIES } from '../src/data/enemies.js';
import { MISSIONS, MISSION_NPCS, QUEST_SERIES_W2, QUEST_TITLES_W2, M2W2_IDS, turnInNpcOf } from '../src/data/missions.js';
import { QUEST_NPC_DEFS } from '../src/data/questNpcs.js';
import { ITEM_LORE } from '../src/data/lore.js';
import { MAPS, W2_TOWN_IDS, W2_REGION_IDS } from '../src/world/maps.js';
import { expToNext } from '../src/data/balance.js';
import { addItemToState, countItem } from '../src/systems/inventory.js';
import { titleList } from '../src/systems/achievements.js';
import { findNpc } from '../src/systems/guide.js';

const isW2 = (m) => m.id.startsWith('q2_') || M2W2_IDS.includes(m.id);
const W2Q = () => Object.values(MISSIONS).filter(isW2);
const W2_ITEMS = (pred) => Object.values(ITEMS).filter((it) => it.world === 2 && pred(it));

function satisfy(g, m) {
  const st = g.state;
  for (const o of m.objectives) {
    if (o.type === 'kill' || o.type === 'boss') for (let i = 0; i < o.count; i++) g.events.emit('enemyKilled', { enemy: { def: ENEMIES[o.target] } });
    if (o.type === 'collect') addItemToState(st, o.target, o.count);
    if (o.type === 'reach') g.changeMap(o.target);
    if (o.type === 'talk') g.events.emit('talkNpc', { npcId: o.target });
  }
  g.missions.update(1 / 60);
}
function play(g, id, choice) {
  const mm = g.missions, m = MISSIONS[id];
  g.state.inventory = [];
  if (g.state.level < m.reqLevel) g.state.level = m.reqLevel;
  g.changeMap(MISSION_NPCS[m.giver].mapId);
  assert.ok(mm.canAccept(id), 'canAccept ' + id);
  assert.ok(mm.accept(id), 'accept ' + id);
  satisfy(g, m);
  assert.ok(mm.isComplete(id), 'complete ' + id + ' ' + JSON.stringify(mm.objectiveValues(id)));
  if (choice) assert.ok(mm.choose(id, choice).ok, 'choose ' + id);
  const r = mm.turnIn(id);
  assert.ok(r, 'turnIn ' + id);
  return r;
}
/** 第2部の続きを始められる所まで（第1部・宇宙港・m2_01〜08 を完了済みにする） */
function toWorld2(g) {
  const st = g.state;
  st.level = 106;
  st.flags ||= {};
  st.flags.world2Unlocked = true;
  st.missions.completed.push(...Object.values(MISSIONS).filter((m) => m.category === 'main' && !M2W2_IDS.includes(m.id)).map((m) => m.id), 'sp05_overlord');
}

export default function register({ test, makeGame }) {
  test('w2 quests: 数（100 以上・4 地域 × 連作 4〜6・派生で合流・ネタ・記念・m2 の続き 12〜20 話）', () => {
    const all = W2Q();
    assert.ok(all.length >= 100, `第2ワールドのクエスト ${all.length}`);
    for (const r of W2_REGION_IDS) {
      const ss = Object.values(QUEST_SERIES_W2).filter((s) => s.region === r);
      assert.ok(ss.length >= 4 && ss.length <= 6, `${r}: 連作 ${ss.length}`);
      assert.ok(ss.some((s) => s.kind === 'joke'), `${r}: ネタの連作`);
      // 派生: 途中で A・B に分かれ（choices）、合流する話（prereqAny）がある。合流した話は選んだ側でセリフが変わる
      const br = ss.filter((s) => s.ids.some((id) => MISSIONS[id].choices?.length === 2));
      assert.ok(br.length >= 1, `${r}: 派生の連作`);
      for (const s of br) {
        const ch = s.ids.map((id) => MISSIONS[id]).find((m) => m.choices);
        assert.ok(s.ids.some((id) => MISSIONS[id].reqChoice?.choice === 'a') && s.ids.some((id) => MISSIONS[id].reqChoice?.choice === 'b'), s.key + ' A 編・B 編');
        const join = s.ids.map((id) => MISSIONS[id]).find((m) => m.prereqAny);
        assert.ok(join && join.seriesLast, s.key + ' 合流');
        for (const c of ch.choices) assert.ok(join.dialogByFlag?.[c.flag]?.offer && join.dialogByFlag[c.flag].done, `${s.key}: 合流の話のセリフが ${c.flag} で変わる`);
      }
      const mem = MISSIONS[`q2_memento_${r}`];
      assert.ok(mem && mem.reward.flags.includes(`title_memento_${r}`) && mem.reward.items.includes(`qset_memento_${r}`), r + ' 記念');
      // 記念は、その地域の連作の最後をすべて前提にする
      for (const s of ss) assert.ok(s.lastIds.every((id) => mem.prereq.includes(id) || (mem.prereqAny || []).some((gp) => gp.includes(id))), `${r}: 記念の前提に ${s.key}`);
    }
    // 連作は 1 本の道筋で 3〜7 話
    for (const s of Object.values(QUEST_SERIES_W2)) {
      const pathLen = (id) => { const m = MISSIONS[id]; const pre = [...(m.prereq || []).filter((p) => p.startsWith(`q2_${s.key}_`)), ...((m.prereqAny || [])[0] || [])]; return 1 + (pre.length ? Math.max(...pre.map(pathLen)) : 0); };
      for (const last of s.lastIds) { const n = pathLen(last); assert.ok(n >= 3 && n <= 7, `${s.key}: ${n} 話`); }
    }
    // m2 の続き: m2_08 の次から、4 地域のボスとラスボス第1・第2形態を倒し、最後に称号と qset
    assert.ok(M2W2_IDS.length >= 12 && M2W2_IDS.length <= 20, `m2 の続き ${M2W2_IDS.length} 話`);
    assert.deepEqual(MISSIONS[M2W2_IDS[0]].prereq, ['m2_08_gate']);
    for (let i = 1; i < M2W2_IDS.length; i++) assert.deepEqual(MISSIONS[M2W2_IDS[i]].prereq, [M2W2_IDS[i - 1]], M2W2_IDS[i] + ' は一本道');
    for (const id of M2W2_IDS) assert.ok(MISSIONS[id].category === 'main' && id.startsWith('m2_'), id);
    const bosses = M2W2_IDS.flatMap((id) => MISSIONS[id].objectives.filter((o) => o.type === 'boss').map((o) => o.target));
    for (const b of ['boss_ark_titan', 'boss_wild_kernel', 'boss_abyss_queen', 'boss_zenith', 'boss_zenith_true']) assert.ok(bosses.includes(b), 'm2 で ' + b);
    assert.ok(bosses.indexOf('boss_zenith') < bosses.indexOf('boss_zenith_true'), '第1形態 → 第2形態の順');
    const regionsInOrder = M2W2_IDS.map((id) => MISSIONS[id].region);
    assert.deepEqual([...new Set(regionsInOrder)], ['arkcity', 'cyberwild', 'abyss', 'zenith'], '地域の順');
    const tail = M2W2_IDS.slice(-2).flatMap((id) => [...MISSIONS[id].reward.items, ...(MISSIONS[id].reward.flags || [])]);
    assert.ok(tail.includes('title_zenith_savior') && tail.includes('title_two_worlds') && tail.includes('qset_origin_halo') && tail.includes('qset_twin_neon_coat'), 'ラスボス後の称号と qset');
    // 目的の種類を混ぜる
    const types = new Set(W2Q().flatMap((m) => m.objectives.map((o) => o.type)));
    for (const t of ['kill', 'collect', 'talk', 'reach', 'boss']) assert.ok(types.has(t), t);
  });

  test('w2 quests: データの整合（第2ワールドの敵・素材・NPC の配置と間隔・レベル帯・経験値とお金）', () => {
    const npcOnMap = {};
    for (const mp of Object.values(MAPS)) for (const n of mp.npcs || []) npcOnMap[n.id] = mp.id;
    for (const m of W2Q()) {
      assert.ok(m.reqLevel >= 100 && m.reqLevel <= 200, `${m.id} Lv ${m.reqLevel}`);
      assert.equal(npcOnMap[m.giver], MISSION_NPCS[m.giver].mapId, `${m.id}: giver`);
      assert.equal(npcOnMap[turnInNpcOf(m)], MISSION_NPCS[turnInNpcOf(m)].mapId, `${m.id}: 報告先`);
      if (m.id.startsWith('q2_')) assert.ok(MAPS[MISSION_NPCS[m.giver].mapId].worldId === 2, `${m.id}: サブの依頼は第2ワールドの町で`);
      for (const o of m.objectives) {
        if (o.type === 'kill' || o.type === 'boss') {
          const e = ENEMIES[o.target];
          assert.equal(e.world, 2, `${m.id}: ${o.target} は第2ワールドの敵`);
          // 目的の敵は、クエストの Lv からかけ離れていない（-25〜+12）
          assert.ok(e.level >= m.reqLevel - 25 && e.level <= m.reqLevel + 12, `${m.id}: ${o.target} Lv${e.level}（クエスト Lv${m.reqLevel}）`);
        }
        if (o.type === 'collect') {
          assert.ok(o.mapId && MAPS[o.mapId].worldId === 2, `${m.id}: collect ${o.target} の mapId`);
          assert.ok(ITEMS[o.target].type === 'etc', `${m.id}: ${o.target} は素材`);
        }
        if (o.mapId) assert.ok(MAPS[o.mapId], m.id);
      }
      // 経験値: 1 話で 1 レベルの 2〜7 割（有限）、お金はある
      const need = expToNext(Math.min(199, m.reqLevel + 2));
      assert.ok(Number.isFinite(m.reward.exp) && m.reward.expFixed, `${m.id} exp ${m.reward.exp}`);
      assert.ok(m.reward.exp >= need * 0.2 && m.reward.exp <= need * 0.7, `${m.id}: exp ${m.reward.exp} / 次のLv ${need}`);
      assert.ok(m.reward.money >= 10 * m.reqLevel * m.reqLevel * 0.9, `${m.id}: money ${m.reward.money}`);
    }
    const marked = W2Q().filter((m) => [...m.dialog.offer, ...m.dialog.done].some((l) => /#[dgbr]/.test(l))).length;
    assert.ok(marked >= W2Q().length * 0.9, `強調の印のあるクエスト ${marked}/${W2Q().length}`);
    assert.ok(MISSIONS.m2_10_blackout.dialog.offer.some((l) => l.includes('#rホロ巡回ドローン#k') && l.includes('#gホロ・ハイウェイ#k')));
    // 第2ワールドの町: NPC は 140px 以上、ポータルと 90px 以上離れている（5 次転職の教官との間も）
    for (const t of W2_TOWN_IDS) {
      const xs = MAPS[t].npcs.map((q) => q.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 140, `${t}: NPC 間隔 ${xs[i - 1]}→${xs[i]}`);
      for (const n of MAPS[t].npcs) for (const p of MAPS[t].portals) assert.ok(Math.abs(n.x - p.x) >= 90, `${t}: ${n.id} がポータル ${p.x} に近い`);
      for (const n of MAPS[t].npcs) assert.ok(n.x > 0 && n.x < MAPS[t].width, `${t}: ${n.id} x`);
    }
    for (const id of ['job_nyx', 'job_garo', 'job_akasha']) assert.equal(npcOnMap[id], 'w2_arkcity', id + ' はそのまま');
    // 新しい NPC は第2ワールドの町ごとに 4 人以上。クエストナビが場所を引ける
    for (const t of W2_TOWN_IDS) assert.ok(Object.values(QUEST_NPC_DEFS).filter((d) => d.town === t).length >= 4, t + ' の新しい NPC');
    for (const [id, d] of Object.entries(QUEST_NPC_DEFS)) if (W2_TOWN_IDS.includes(d.town)) {
      assert.equal(findNpc(id)?.mapId, d.town, 'findNpc ' + id);
      assert.ok(d.dialog.some((l) => /#[dgbre]/.test(l)), `${id}: セリフに強調の書き方`);
    }
    // 称号の一覧
    const titles = titleList({ flags: {} });
    for (const t of Object.keys(QUEST_TITLES_W2)) assert.ok(titles.some((x) => x.id === t), '称号 ' + t);
  });

  test('w2 quests: qset（同じ帯・同じ部位の W2_GEAR の最高値以上）と cosmetic（15 種以上・能力ほぼ 0・色がかぶらない）', () => {
    const qs = W2_ITEMS((it) => it.questSet);
    const cs = W2_ITEMS((it) => it.cosmetic);
    assert.ok(qs.length >= 20, `qset ${qs.length}`);
    assert.ok(cs.length >= 15, `cosmetic ${cs.length}`);
    for (const it of qs) assert.ok(QSET_IDS.includes(it.id) && it.id.startsWith('qset_') && it.reqLevel >= 100 && it.reqLevel <= 200 && ITEM_LORE[it.id] && it.lore, it.id);
    for (const it of cs) assert.ok(COSMETIC_IDS.includes(it.id) && ITEM_LORE[it.id] && it.lore, it.id);
    const rewardOf = new Set(W2Q().flatMap((m) => m.reward.items));
    for (const it of [...qs, ...cs]) assert.ok(rewardOf.has(it.id), `${it.id} は第2ワールドのクエストの報酬`);
    for (const it of qs) {
      const pool = Object.values(ITEMS).filter((x) => x.type === 'equip' && x.slot === it.slot && !x.questSet && !x.cosmetic && x.rarity !== 'mythic' && x.reqLevel <= it.reqLevel && (it.slot !== 'weapon' || x.weaponType === it.weaponType));
      assert.ok(pool.some((x) => x.world === 2), `${it.id}: 比べる W2_GEAR がある`);
      const keys = it.slot === 'weapon' ? ['atk'] : ['def', 'atk'];
      for (const k of keys) { const best = Math.max(0, ...pool.map((x) => x.stats[k])); assert.ok(it.stats[k] >= best, `${it.id}: ${k} ${it.stats[k]} < 同じ帯の ${best}`); }
    }
    for (const it of cs) {
      const s = it.stats;
      assert.ok(s.atk <= 1 && s.def + s.maxHp + s.maxMp + s.speed + s.crit + s.str + s.dex + s.int + s.luk <= 1, `${it.id}: 能力はほぼ 0`);
    }
    // ネタの連作は毎話ネタ装備、ふつうの連作の最後は qset
    for (const s of Object.values(QUEST_SERIES_W2)) {
      if (s.kind === 'joke') for (const id of s.ids) assert.ok(MISSIONS[id].reward.items.some((i) => ITEMS[i].cosmetic), id);
      else for (const id of s.lastIds) assert.ok(MISSIONS[id].reward.items.includes(s.qset) && ITEMS[s.qset].questSet, id);
    }
    // ネタ装備の絵のキー（部位/スタイル__色）は、どの装備ともかぶらない
    const key = (it) => it.slot + '/' + it.look.style + '__' + String(it.look.color).toLowerCase();
    const owners = {};
    for (const it of Object.values(ITEMS)) if (it.type === 'equip' && it.look?.style && it.look?.color) (owners[key(it)] ||= []).push(it.id);
    for (const it of cs) assert.deepEqual(owners[key(it)], [it.id], `${it.id}: ${owners[key(it)]}`);
  });

  test('w2 quests: 連作を進めて終える（アーク・シティの全連作 → 記念と称号・記憶屋 B 編・アビス A 編・ネタの連作）', () => {
    const g = makeGame('luna', 'w2_arkcity');
    const st = g.state, mm = g.missions;
    toWorld2(g);
    assert.equal(mm.canAccept('q2_courier_1'), false, 'アーク・シティに着く（m2_09）までは出ない');
    play(g, 'm2_09_arrival');
    assert.ok(mm.canAccept('q2_courier_1'));
    // 記憶屋ノア: B 編（保管庫）
    play(g, 'q2_memory_1'); play(g, 'q2_memory_2');
    play(g, 'q2_memory_3', 'b');
    assert.ok(st.flags.qc_memory_keep && !st.flags.qc_memory_free);
    assert.equal(mm.canAccept('q2_memory_4a'), false);
    play(g, 'q2_memory_4b');
    assert.ok(mm.dialog('q2_memory_5', 'offer').some((l) => l.includes('保管庫')), '合流の話のセリフが B 編のもの');
    const r5 = play(g, 'q2_memory_5');
    assert.ok(r5.items.includes('qset_memory_visor') && countItem(st, 'qset_memory_visor') >= 1);
    assert.ok(mm.dialog('q2_memory_5', 'done').some((l) => l.includes('保管庫')));
    assert.equal(mm.canAccept('q2_memory_4a'), false, '選ばなかった側はあとからも受けられない');
    // 残りの連作
    assert.equal(mm.canAccept('q2_memento_arkcity'), false);
    for (const key of ['courier', 'chrome', 'fine']) for (const id of QUEST_SERIES_W2[key].ids) play(g, id);
    assert.equal(mm.canAccept('q2_memento_arkcity'), false, 'ネタの連作も終えるまで記念は出ない');
    const cos = [];
    for (const id of QUEST_SERIES_W2.salaryman.ids) cos.push(...play(g, id).items.filter((i) => ITEMS[i].cosmetic));
    assert.equal(cos.length, QUEST_SERIES_W2.salaryman.ids.length, 'ネタの連作は毎話ネタ装備');
    assert.ok(mm.dialog('q2_memento_arkcity', 'offer').some((l) => l.includes('保管庫')), '記念のセリフが派生の結果で変わる');
    const rm = play(g, 'q2_memento_arkcity');
    assert.ok(rm.items.includes('qset_memento_arkcity'));
    assert.ok(titleList(st).some((t) => t.id === 't_memento_arkcity' && t.owned), '称号');
    // ネオン・アビス: 沈没船のオルゴール A 編（引き上げる）
    const g2 = makeGame('jin', 'w2_abyss');
    toWorld2(g2);
    g2.state.missions.completed.push(...M2W2_IDS.slice(0, M2W2_IDS.indexOf('m2_18_deep') + 1));
    play(g2, 'q2_musicbox_1'); play(g2, 'q2_musicbox_2');
    play(g2, 'q2_musicbox_3', 'a');
    g2.state.level = MISSIONS.q2_musicbox_4a.reqLevel;
    assert.ok(g2.missions.canAccept('q2_musicbox_4a') && !g2.missions.canAccept('q2_musicbox_4b'));
    play(g2, 'q2_musicbox_4a');
    assert.ok(g2.missions.dialog('q2_musicbox_5', 'done').some((l) => l.includes('空へ')));
    const ra = play(g2, 'q2_musicbox_5');
    assert.ok(ra.items.includes('qset_musicbox_coat'));
    assert.ok(g2.missions.dialog('q2_memento_abyss', 'offer').some((l) => l.includes('方舟号')));
  });

  test('w2 quests: 第2部の続き m2_09〜m2_28 を最後まで（4 地域のボス・ラスボス第2形態・選択でセリフが変わる・称号と qset）', () => {
    const g = makeGame('hacker', 'spaceport');
    const st = g.state, mm = g.missions;
    toWorld2(g);
    st.flags.world2Unlocked = false;
    st.missions.completed = st.missions.completed.filter((id) => id !== 'm2_08_gate');
    assert.equal(mm.canAccept('m2_09_arrival'), false, 'ゲートを開くまでは出ない');
    st.missions.completed.push('m2_08_gate');
    st.flags.world2Unlocked = true;
    const money0 = st.money;
    for (const id of M2W2_IDS) {
      const r = play(g, id, MISSIONS[id].choices ? 'b' : undefined);
      assert.ok(r.exp > 0, id + ' exp');
      if (id === 'm2_21_queen') {
        assert.ok(st.flags.qc_m2_queen_seal, '女王冠の選択のフラグ');
        assert.ok(mm.dialog('m2_22_ascend', 'offer')[0].includes('上を指して'), '選択で次の話のセリフが変わる');
      }
    }
    assert.ok(st.missions.completed.includes('m2_28_epilogue'));
    assert.ok(st.flags.title_zenith_savior && st.flags.title_two_worlds);
    assert.ok(countItem(st, 'qset_twin_neon_coat') >= 1, '終章の qset');
    assert.ok(st.money > money0);
    assert.ok(titleList(st).some((t) => t.id === 't_zenith_savior' && t.owned) && titleList(st).some((t) => t.id === 't_two_worlds' && t.owned));
    assert.ok(mm.dialog('m2_28_epilogue', 'done')[0].includes('女王冠'), '終章のセリフも女王冠の選択で変わる');
    // ラスボス第2形態のクエストは第2形態を倒して数える（第1形態では進まない）
    const g2 = makeGame('jin', 'w2_zenith');
    toWorld2(g2);
    g2.state.level = 200;
    g2.state.missions.completed.push(...M2W2_IDS.slice(0, M2W2_IDS.indexOf('m2_27_origin')));
    g2.changeMap('w2_zenith');
    assert.ok(g2.missions.accept('m2_27_origin'));
    g2.events.emit('enemyKilled', { enemy: { def: ENEMIES.boss_zenith } });
    g2.missions.update(1 / 60);
    assert.equal(g2.missions.objectiveValues('m2_27_origin')[0], 0);
    g2.events.emit('enemyKilled', { enemy: { def: ENEMIES.boss_zenith_true } });
    g2.missions.update(1 / 60);
    assert.equal(g2.missions.objectiveValues('m2_27_origin')[0], 1);
    // Lv200 でも報酬の経験値で落ちない
    addItemToState(g2.state, 'origin_core', 1);
    g2.missions.update(1 / 60);
    assert.ok(g2.missions.turnIn('m2_27_origin'));
    assert.ok(Number.isFinite(g2.state.exp) && g2.state.level === 200, `Lv ${g2.state.level} exp ${g2.state.exp}`);
  });
}
