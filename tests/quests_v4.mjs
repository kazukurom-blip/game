// v4 クエスト担当の単体テスト（tests/unit.mjs から読み込む）
//  - 全クエストのデータの整合（敵・アイテム・NPC・マップ・前提・報酬の装備・派生の参照）
//  - 派生（A 編・B 編）の分かれ方 / reward.flags（world2Unlocked）/ cosmetic・qset の装備
//  - 新しいクエストを実際に進めて終える（連作・派生・地域の記念・第2部 m2 の通し）
import assert from 'node:assert/strict';
import { ITEMS, COSMETIC_IDS, QSET_IDS } from '../src/data/items.js';
import { ENEMIES } from '../src/data/enemies.js';
import { MISSIONS, MISSION_NPCS, QUEST_SERIES, QUEST_TITLES, M2_IDS, turnInNpcOf } from '../src/data/missions.js';
import { QUEST_NPC_DEFS } from '../src/data/questNpcs.js';
import { ITEM_LORE } from '../src/data/lore.js';
import { MAPS, TOWN_IDS } from '../src/world/maps.js';
import { addItemToState, countItem } from '../src/systems/inventory.js';
import { migrateState } from '../src/systems/progression.js';
import { MissionManager, branchOk } from '../src/systems/missions.js';
import { titleList } from '../src/systems/achievements.js';
import { findNpc } from '../src/systems/guide.js';

const OLD_IDS_COUNT = 61; // v4 以前のクエスト数（メイン15・サブ14・デイリー8・転職24）
const isNew = (m) => m.id.startsWith('q_') || m.id.startsWith('m2_');
const NEW = () => Object.values(MISSIONS).filter(isNew);

/** 目的をイベント・持ち物で満たす（unit.mjs の通しテストと同じやり方） */
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
/** id を受注 → 満たす → （選択）→ 報告。報酬を返す */
function play(g, id, choice) {
  const mm = g.missions, m = MISSIONS[id];
  g.state.inventory = [];
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

export default function register({ test, makeGame }) {
  test('v4 quests: 数（新しく150以上・地域7つすべてに連作・第2部 m2 は5〜8話）', () => {
    const all = Object.values(MISSIONS);
    const news = NEW();
    assert.equal(all.length - news.length, OLD_IDS_COUNT + (all.filter((m) => m.type === 'job').length - 24), '今のクエストは消えていない');
    assert.ok(news.length >= 150, `新しいクエスト ${news.length}`);
    for (const r of TOWN_IDS) {
      const ss = Object.values(QUEST_SERIES).filter((s) => s.region === r);
      assert.ok(ss.length >= 3, `${r}: 連作 ${ss.length}`);
      assert.ok(MISSIONS[`q_memento_${r}`], `${r}: 記念クエスト`);
    }
    assert.ok(Object.values(QUEST_SERIES).filter((s) => s.region === 'cross').length >= 3, '地域をまたぐ連作 3 つ以上');
    assert.ok(M2_IDS.length >= 5 && M2_IDS.length <= 8);
    for (const id of M2_IDS) assert.equal(MISSIONS[id].category, 'main', id);
    // 目的の種類を混ぜる
    const types = new Set(news.flatMap((m) => m.objectives.map((o) => o.type)));
    for (const t of ['kill', 'collect', 'talk', 'reach', 'boss']) assert.ok(types.has(t), t);
    // 連作は 1 本の道筋で 3〜7 話
    for (const s of Object.values(QUEST_SERIES)) {
      const pathLen = (id) => { const m = MISSIONS[id]; const pre = [...(m.prereq || []).filter((p) => p.startsWith(`q_${s.key}_`)), ...((m.prereqAny || [])[0] || [])]; return 1 + (pre.length ? Math.max(...pre.map(pathLen)) : 0); };
      for (const last of s.lastIds) { const n = pathLen(last); assert.ok(n >= 3 && n <= 7, `${s.key}: ${n} 話`); }
    }
  });

  test('v4 quests: 全クエストのデータの整合（敵・アイテム・NPC・マップ・前提・報酬・派生）', () => {
    const npcOnMap = {};
    for (const mp of Object.values(MAPS)) for (const n of mp.npcs || []) npcOnMap[n.id] = mp.id;
    for (const m of Object.values(MISSIONS)) {
      assert.ok(MISSION_NPCS[m.giver], `${m.id} giver ${m.giver}`);
      assert.ok(MISSION_NPCS[turnInNpcOf(m)], `${m.id} turnIn`);
      if (isNew(m)) {
        assert.equal(npcOnMap[m.giver], MISSION_NPCS[m.giver].mapId, `${m.id}: giver ${m.giver} が町に置かれている`);
        assert.equal(npcOnMap[turnInNpcOf(m)], MISSION_NPCS[turnInNpcOf(m)].mapId, `${m.id}: 報告先が町に置かれている`);
        assert.ok(m.name && m.desc && m.dialog?.offer?.length && m.dialog?.done?.length, m.id + ' 文言');
      }
      for (const p of m.prereq || []) assert.ok(MISSIONS[p], `${m.id} prereq ${p}`);
      for (const g of m.prereqAny || []) { assert.ok(Array.isArray(g) && g.length >= 1, m.id); for (const p of g) assert.ok(MISSIONS[p], `${m.id} prereqAny ${p}`); }
      if (m.reqChoice) {
        const src = MISSIONS[m.reqChoice.mission];
        assert.ok(src?.choices?.some((c) => c.id === m.reqChoice.choice), `${m.id} reqChoice ${JSON.stringify(m.reqChoice)}`);
      }
      for (const o of m.objectives) {
        if (o.mapId) assert.ok(MAPS[o.mapId], `${m.id} mapId ${o.mapId}`);
        if (o.type === 'kill' || o.type === 'boss') {
          const e = ENEMIES[o.target];
          assert.ok(e && !e.civilian && !e.isCop, `${m.id} 敵 ${o.target}`);
          if (o.mapId) assert.ok(e.habitats.includes(o.mapId), `${m.id}: ${o.target} は ${o.mapId} に出ない`);
          if (o.type === 'boss') assert.ok(e.boss, `${m.id} boss ${o.target}`);
          if (e.night && isNew(m)) assert.ok(/夜/.test(o.text), `${m.id}: 夜だけの敵 ${o.target} は目的の文に「夜」と書く`);
        }
        if (o.type === 'collect') {
          assert.ok(ITEMS[o.target], `${m.id} item ${o.target}`);
          if (o.mapId && isNew(m)) {
            const here = Object.values(ENEMIES).some((e) => e.habitats?.includes(o.mapId) && !e.night && e.drops.some((d) => d.id === o.target));
            assert.ok(here, `${m.id}: ${o.target} は ${o.mapId} の（夜以外の）敵が落とさない`);
          }
        }
        if (o.type === 'reach') assert.ok(MAPS[o.target], `${m.id} reach ${o.target}`);
        if (o.type === 'talk') {
          assert.ok(MISSION_NPCS[o.target], `${m.id} talk ${o.target}`);
          if (o.mapId) assert.equal(MISSION_NPCS[o.target].mapId, o.mapId, `${m.id} talk ${o.target} の mapId`);
          if (isNew(m)) assert.equal(npcOnMap[o.target], MISSION_NPCS[o.target].mapId, `${m.id}: talk ${o.target} が町にいる`);
        }
      }
      for (const it of m.reward?.items || []) assert.ok(ITEMS[it], `${m.id} reward ${it}`);
      for (const c of m.choices || []) for (const it of c.reward?.items || []) assert.ok(ITEMS[it], `${m.id} choice reward ${it}`);
      for (const f of m.reward?.flags || []) assert.equal(typeof f, 'string', m.id);
      if (isNew(m)) assert.ok(m.reward.exp > 0 && m.reward.money > 0, m.id + ' 報酬');
    }
    // 前提の循環なし（prereqAny 込み。派生はどちらの道でも最後まで行ける）
    const all = Object.values(MISSIONS);
    const done = new Set(); let progress = true;
    while (progress) {
      progress = false;
      for (const m of all) if (!done.has(m.id) && (m.prereq || []).every((p) => done.has(p)) && (m.prereqAny || []).every((g) => g.some((p) => done.has(p)))) { done.add(m.id); progress = true; }
    }
    assert.equal(done.size, all.length, '前提が循環/欠落: ' + all.filter((m) => !done.has(m.id)).map((m) => m.id));
    // 前提のレベルは後の話のレベル以下
    for (const m of NEW()) for (const p of m.prereq || []) if (isNew(MISSIONS[p])) assert.ok(MISSIONS[p].reqLevel <= m.reqLevel, `${m.id} Lv ${m.reqLevel} < 前提 ${p}`);
    // 新しい NPC: 町に置かれ、見た目とセリフがある。同じ町の NPC 同士は 140px 以上離れている
    for (const [id, d] of Object.entries(QUEST_NPC_DEFS)) {
      assert.equal(npcOnMap[id], d.town, `${id} は ${d.town} に置く`);
      assert.equal(MISSION_NPCS[id]?.mapId, d.town, `${id} MISSION_NPCS`);
      assert.ok(d.look?.body && d.look?.hair && d.equip?.top && d.dialog?.length >= 1, id);
    }
    for (const t of TOWN_IDS) {
      const xs = MAPS[t].npcs.map((q) => q.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 140, `${t}: NPC 間隔 ${xs[i - 1]}→${xs[i]}`);
      for (const n of MAPS[t].npcs) for (const p of MAPS[t].portals) assert.ok(Math.abs(n.x - p.x) >= 90, `${t}: ${n.id} がポータルに近い`);
    }
    // 転職クエストには触れていない（ID の形）
    for (const m of NEW()) assert.ok(m.type !== 'job' && !m.id.startsWith('job_'), m.id);
  });

  test('v4 quests: qset（連作の報酬装備）と cosmetic（見た目だけのネタ装備）', () => {
    assert.ok(COSMETIC_IDS.length >= 20, `cosmetic ${COSMETIC_IDS.length}`);
    const rewardOf = new Set(Object.values(MISSIONS).flatMap((m) => [...(m.reward?.items || []), ...(m.choices || []).flatMap((c) => c.reward?.items || [])]));
    for (const id of COSMETIC_IDS) {
      const it = ITEMS[id];
      assert.ok(it.cosmetic === true && it.type === 'equip' && it.look?.style, id);
      const s = it.stats;
      assert.ok(s.atk <= 1 && s.def + s.maxHp + s.maxMp + s.speed + s.crit + s.str + s.dex + s.int + s.luk <= 1, `${id}: 能力はほぼ 0`);
      assert.ok(rewardOf.has(id), `${id} はどこかのクエストの報酬`);
      assert.ok(ITEM_LORE[id], id + ' lore');
      // ネタのクエストの報酬
      assert.ok(Object.values(MISSIONS).some((m) => (m.reward?.items || []).includes(id) && (m.questKind === 'joke' || m.series)), id + ' ネタのクエスト');
    }
    assert.ok(QSET_IDS.length >= 30);
    for (const id of QSET_IDS) {
      assert.ok(id.startsWith('qset_'), id);
      const it = ITEMS[id];
      assert.ok(!it.cosmetic && it.questSet, id);
      assert.ok(rewardOf.has(id), `${id} はどこかのクエストの報酬`);
      assert.ok(ITEM_LORE[id], id + ' lore');
      // そのレベル帯の、ボスの極レア（mythic）以外の同じ部位の装備より強い（武器は同じ武器種）
      const k = it.slot === 'weapon' ? 'atk' : 'def';
      const pool = Object.values(ITEMS).filter((x) => x.type === 'equip' && x.slot === it.slot && !x.questSet && !x.cosmetic && x.rarity !== 'mythic' && x.reqLevel <= it.reqLevel && (it.slot !== 'weapon' || x.weaponType === it.weaponType));
      const best = Math.max(0, ...pool.map((x) => x.stats[k]));
      assert.ok(it.stats[k] >= best, `${id}: ${k} ${it.stats[k]} < 同じ帯の ${best}`);
    }
    // 連作の最後の話は qset をくれる（ネタの連作はネタ装備）
    for (const s of Object.values(QUEST_SERIES)) {
      for (const last of s.lastIds) {
        const items = MISSIONS[last].reward.items;
        if (s.kind === 'joke') assert.ok(items.some((i) => ITEMS[i]?.cosmetic), last);
        else assert.ok(items.includes(s.qset) && s.qset.startsWith('qset_'), last);
      }
    }
    for (const r of TOWN_IDS) assert.ok(MISSIONS[`q_memento_${r}`].reward.items.includes(`qset_memento_${r}`), r);
  });

  test('v4 quests: ネタ装備の色は専用の絵のキー（<スタイル>__<色>）として他の装備とかぶらない', () => {
    const key = (it) => it.slot + '/' + it.look.style + '__' + String(it.look.color).toLowerCase();
    const owners = {};
    for (const it of Object.values(ITEMS)) if (it.type === 'equip' && it.look && it.look.style && it.look.color) (owners[key(it)] ||= []).push(it.id);
    for (const id of COSMETIC_IDS) assert.deepEqual(owners[key(ITEMS[id])], [id], `${id} の専用の絵が他の装備にも出てしまう: ${owners[key(ITEMS[id])]}`);
  });

  test('v4 quests: 持ち物がいっぱいだと報告できない（N 枠空けて）・集めた物を渡して空く枠は数える', () => {
    const g = makeGame('luna', 'beach');
    const id = Object.keys(MISSIONS).find((k) => { const m = MISSIONS[k]; return !m.choices?.length && (m.reward?.items || []).some((i) => ITEMS[i]?.type === 'equip') && m.objectives.every((o) => o.type === 'kill'); });
    assert.ok(id, '装備を報酬に持つ kill のクエスト');
    const m = MISSIONS[id];
    g.missions.ms.active.push(id);
    const pr = g.missions._prog(id);
    m.objectives.forEach((o, i) => { pr[i] = o.count; });
    assert.ok(g.missions.isComplete(id), 'complete ' + id);
    const filler = Object.keys(ITEMS).find((k) => ITEMS[k].type === 'equip' && ITEMS[k].slot === 'hat');
    while ((g.state.inventory || []).filter(Boolean).length < 48) addItemToState(g.state, filler, 1);
    assert.equal(g.missions.turnIn(id), false);
    assert.equal(g.missions.lastFail?.reason, 'full');
    assert.ok(g.state.missions.active.includes(id), 'まだ進行中のまま');
    g.state.inventory.splice(0, g.missions.lastFail.short);
    assert.notEqual(g.missions.turnIn(id), false);
    assert.ok(g.state.missions.completed.includes(id));
  });

  test('v4 quests: 派生（A 編・B 編）の分かれ方と、前の結果で変わるセリフ', () => {
    const g = makeGame('luna', 'beach');
    const st = g.state, mm = g.missions;
    st.level = 20;
    play(g, 'q_sandcastle_1');
    play(g, 'q_sandcastle_2');
    assert.equal(mm.canAccept('q_sandcastle_4a'), false, '分かれ道の前は A 編も受けられない');
    // 選ばずに報告しようとすると needsChoice
    g.changeMap('beach');
    assert.ok(mm.accept('q_sandcastle_3'));
    satisfy(g, MISSIONS.q_sandcastle_3);
    assert.ok(mm.needsChoice('q_sandcastle_3'));
    assert.ok(mm.choose('q_sandcastle_3', 'b').ok);
    assert.ok(mm.turnIn('q_sandcastle_3'));
    assert.ok(st.flags.qc_sandcastle_war && !st.flags.qc_sandcastle_peace, '選んだ側のフラグ');
    assert.equal(mm.canAccept('q_sandcastle_4a'), false, 'A 編は受けられない');
    assert.equal(mm.canAccept('q_sandcastle_4b'), true, 'B 編を受けられる');
    const r = play(g, 'q_sandcastle_4b');
    assert.ok(r.items.includes('qset_sandcastle_cap'));
    assert.ok(countItem(st, 'qset_sandcastle_cap') >= 1, 'qset を受け取った');
    // 記念クエストのセリフ（dialogByFlag）が選んだ結果で変わる
    const offer = mm.dialog('q_memento_beach', 'offer');
    assert.ok(offer.some((l) => /隣の浜/.test(l)), 'war の結果のセリフ: ' + offer.join(' / '));
    // 選ばなかった方は、あとからも受けられない
    st.missions.completed.push('q_sandcastle_4b');
    assert.equal(mm.canAccept('q_sandcastle_4a'), false);
    // A を選んだ場合
    const g2 = makeGame('jin', 'beach');
    g2.state.level = 20;
    for (const id of ['q_sandcastle_1', 'q_sandcastle_2']) play(g2, id);
    play(g2, 'q_sandcastle_3', 'a');
    assert.ok(g2.missions.canAccept('q_sandcastle_4a') && !g2.missions.canAccept('q_sandcastle_4b'));
    assert.ok(g2.missions.dialog('q_memento_beach', 'offer').some((l) => /観光名所/.test(l)));
    // 灯台守: 第3話の選択で第4話・第5話のセリフが変わる（派生しないで、セリフだけ変わる連作）
    const g3 = makeGame('hacker', 'beach');
    g3.state.level = 20;
    for (const id of ['q_lighthouse_1', 'q_lighthouse_2']) play(g3, id);
    play(g3, 'q_lighthouse_3', 'a');
    assert.ok(g3.missions.dialog('q_lighthouse_4', 'offer')[0].includes('妻が守った灯り'));
    assert.ok(g3.missions.dialog('q_lighthouse_5', 'done')[0].includes('燃やし尽くした灯り'));
    assert.ok(g3.missions.canAccept('q_lighthouse_4'), '派生しない連作は、どちらを選んでも続く');
    // 合流する話（prereqAny）: どちらかを終えれば受けられる
    const rec = MISSIONS.q_record_6;
    assert.deepEqual(rec.prereqAny, [['q_record_5a', 'q_record_5b']]);
    assert.equal(branchOk({ flags: {}, storyChoices: {} }, { completed: [] }, rec), false);
    assert.equal(branchOk({ flags: {}, storyChoices: {} }, { completed: ['q_record_5b'] }, rec), true);
    // 古いセーブ（storyChoices も flags も無い）でも落ちない
    assert.equal(branchOk({}, { completed: [] }, MISSIONS.q_sandcastle_4a), false);
  });

  test('v4 quests: 連作を実際に進めて終える（ポチを探して・霧の幽霊船 B 編・ネタの連作・地域の記念・称号）', () => {
    const g = makeGame('luna', 'beach');
    const st = g.state;
    st.level = 60;
    const money0 = st.money;
    for (const id of QUEST_SERIES.lostdog.ids) play(g, id);
    assert.ok(st.missions.completed.includes('q_lostdog_3'));
    assert.ok(st.money > money0);
    // ビーチの残りの連作を全部終える → 記念クエスト
    for (const key of ['sandcastle', 'lighthouse']) for (const id of QUEST_SERIES[key].ids) if (!id.endsWith('b')) play(g, id);
    assert.equal(g.missions.canAccept('q_memento_beach'), false, '記念は地域の連作をすべて終えたあと');
    for (const id of QUEST_SERIES.popcorn.ids) play(g, id);
    assert.equal(g.missions.canAccept('q_memento_beach'), true, 'ビーチの連作を全部終えたら記念が出る');
    const r = play(g, 'q_memento_beach');
    assert.ok(r.items.includes('qset_memento_beach'));
    assert.ok(st.flags.title_memento_beach, '称号のフラグ');
    assert.ok(titleList(st).some((t) => t.id === 't_memento_beach' && t.owned), '称号を持っている');
    // ネタの連作はネタ装備を毎話くれる
    const jokes = QUEST_SERIES.popcorn.ids.flatMap((id) => MISSIONS[id].reward.items.filter((i) => ITEMS[i].cosmetic));
    assert.equal(jokes.length, QUEST_SERIES.popcorn.ids.length);
    // 霧の幽霊船: B 編（裁く）で最後まで
    const g2 = makeGame('jin', 'slums');
    g2.state.level = 60;
    play(g2, 'q_ghostship_1'); play(g2, 'q_ghostship_2');
    play(g2, 'q_ghostship_3', 'b');
    play(g2, 'q_ghostship_4b'); // 海図の collect とカイ巡査（ダウンタウン）への talk
    const r2 = play(g2, 'q_ghostship_5b');
    assert.ok(r2.items.includes('qset_captain_coat'));
    assert.equal(g2.missions.canAccept('q_ghostship_4a'), false);
    // クエストナビ（guide）が新しい NPC の場所を引ける
    for (const id of Object.keys(QUEST_NPC_DEFS)) assert.equal(findNpc(id)?.mapId, QUEST_NPC_DEFS[id].town, 'findNpc ' + id);
    // 地域をまたぐ連作: 怪盗団で選んだ側の称号フラグ
    const g3 = makeGame('hacker', 'casino');
    g3.state.level = 80;
    for (const id of ['q_phantom_1', 'q_phantom_2', 'q_phantom_3', 'q_phantom_4', 'q_phantom_5']) play(g3, id);
    play(g3, 'q_phantom_6', 'a');
    assert.ok(g3.state.flags.title_phantom_free && !g3.state.flags.title_phantom_arrest);
    play(g3, 'q_phantom_7a');
    assert.ok(countItem(g3.state, 'qset_phantom_boots') >= 1);
    assert.ok(titleList(g3.state).some((t) => t.id === 't_phantom' && t.owned));
    for (const t of Object.keys(QUEST_TITLES)) assert.ok(titleList(g3.state).some((x) => x.id === t), '称号の一覧に ' + t);
  });

  test('v4 quests: 第2部 m2 の連作 → reward.flags で world2Unlocked（古いセーブでも）', () => {
    const g = makeGame('jin', 'spaceport');
    const st = g.state;
    st.level = 99;
    assert.equal(g.missions.canAccept('m2_01_signal'), false, 'ドンと裏ボスを倒すまでは出ない');
    st.missions.completed.push('m15_don', 'sp05_overlord');
    assert.equal(g.missions.canAccept('m2_01_signal'), false, 'Lv100 から');
    st.level = 110;
    for (const id of M2_IDS.slice(0, -1)) play(g, id);
    assert.ok(!st.flags.world2Unlocked, '最後の話まではゲートは開かない');
    const r = play(g, M2_IDS[M2_IDS.length - 1]);
    assert.ok(r.flags.includes('world2Unlocked'));
    assert.equal(st.flags.world2Unlocked, true);
    assert.ok(countItem(st, 'qset_gate_key') >= 1);
    // m2 の第5話はドンの結末（endingHero / endingDon）でセリフが変わる
    st.flags.endingDon = true;
    assert.ok(g.missions.dialog('m2_06_legacy', 'offer')[0].includes('新しいボス'));
    // 古いセーブ（flags が無い）でも flags の報酬を受け取れる
    const g2 = makeGame('luna', 'spaceport');
    const old = { ...g2.state };
    delete old.flags;
    g2.state = migrateState(old);
    g2.missions = new MissionManager(g2);
    g2.state.level = 110;
    g2.state.missions.completed.push('m15_don', 'sp05_overlord', ...M2_IDS.slice(0, -1));
    delete g2.state.flags;
    play(g2, 'm2_08_gate');
    assert.equal(g2.state.flags.world2Unlocked, true);
  });
}
