// 試遊版を Chromium で開いて、キーを押して遊ぶ自動の確かめ（スクリーンショットは classic-unity/Web/shots/）。
//   node classic-unity/Web/tools/make_dist.mjs   # 先に dist/ を作る
//   node classic-unity/Web/tools/playtest.mjs    # 確かめる（PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers）
// 歩く・ジャンプ・NPC と V で話す（V だけで話を聞く→受ける→閉じる・セリフが変わる・頭の上の「？」と電球）・クエストを受ける・ポータル・縄・はしご・攻撃・敵を倒す・拾う・Lv アップ・AP/SP・
// クイックスロット・窓・セーブして読み直す、をして、コンソールのエラーとフレームの時間を確かめる。
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WEB, 'dist');
const SHOTS = path.join(WEB, 'shots');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const QUICK = process.argv.includes('--quick');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* */ }
  }
  throw new Error('playwright が見つからない');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.ogg': 'audio/ogg', '.dat': 'application/octet-stream', '.blat': 'application/octet-stream' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const p = path.join(DIST, u === '/' ? 'index.html' : u);
      if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('・', ...a);
const results = [];
let deaths = 0, lastPot = 0;
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(ok ? '  OK ' : '  NG ', name, extra); };

const { chromium } = await loadPlaywright();
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 820, height: 620 } }); // 等倍（800×600）で撮る
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const F = () => page.evaluate(() => window.game?.lastFrame);
const U = () => page.evaluate(() => { window.game?.ui.refresh(false); return window.game?.ui.state; });
const act = (cmd, a = '', b = '', n = 0) => page.evaluate(([c, a, b, n]) => window.game.act(c, a, b, n), [cmd, a, b, n]);
let shotN = 0;
const shot = async (name) => {
  const file = path.join(SHOTS, `${String(++shotN).padStart(2, '0')}_${name}.png`);
  await page.locator('#stage').screenshot({ path: file });
  log('写真', path.basename(file), Math.round(fs.statSync(file).size / 1024) + 'KB');
};
const tap = async (key, ms = 60) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };

async function walkTo(x, tol = 8, maxMs = 15000) {
  const t0 = Date.now(); let dir = null; let lastX = null, stuckT = Date.now();
  while (Date.now() - t0 < maxMs) {
    const f = await F(); const dx = x - f.p[0];
    if (Math.abs(dx) <= tol) break;
    // 段差で止まったら跳ぶ
    if (lastX !== null && Math.abs(f.p[0] - lastX) < 0.5) { if (Date.now() - stuckT > 250) { await tap('Alt', 80); stuckT = Date.now(); } } else stuckT = Date.now();
    lastX = f.p[0];
    const want = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (dir !== want) { if (dir) await page.keyboard.up(dir); await page.keyboard.down(want); dir = want; }
    await sleep(30);
  }
  if (dir) await page.keyboard.up(dir);
  await sleep(150);
  // すべった分を小さく戻す
  for (let i = 0; i < 12; i++) {
    const f = await F(); const dx = x - f.p[0];
    if (Math.abs(dx) <= Math.max(tol, 4)) break;
    await tap(dx > 0 ? 'ArrowRight' : 'ArrowLeft', 25); await sleep(120);
  }
  return (await F()).p[0];
}

// 近くの敵を倒す（同じ高さの敵へ歩いて Ctrl）。倒した数を返す
async function hunt(maxMs, wantKills, yTol = 24) {
  const t0 = Date.now(); let kills = 0, dir = null, atk = false;
  const seen = new Set();
  while (Date.now() - t0 < maxMs && kills < wantKills) {
    const f = await F();
    if (f.p[6]) { deaths++; log('倒れた → 町へ戻る'); await shot('dead'); await page.click('#modal button[data-act="revive"]'); await sleep(800); break; }
    if (f.h[0] < f.h[1] * 0.4 && Date.now() - lastPot > 1500) { lastPot = Date.now(); await act('use', 'use.red_potion'); }
    for (const e of f.ev) if (e[0] === 'MobDied' && !seen.has(e[2] + ':' + e[3])) { seen.add(e[2] + ':' + e[3]); kills++; }
    const [px, py] = f.p;
    const mobs = f.mo.filter((m) => m[8] === 0 && !(m[9] & 1) && Math.abs(m[3] - py) < yTol).sort((a, b) => Math.abs(a[2] - px) - Math.abs(b[2] - px));
    const m = mobs[0];
    if (!m) { if (dir) { await page.keyboard.up(dir); dir = null; } await sleep(100); continue; }
    const dx = m[2] - px;
    const want = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (Math.abs(dx) > 50 || (f.p[4] === 1) !== (dx > 0)) {
      if (atk) { await page.keyboard.up('Control'); atk = false; }
      if (dir !== want) { if (dir) await page.keyboard.up(dir); await page.keyboard.down(want); dir = want; }
      if (Math.abs(dx) <= 50) { await sleep(40); await page.keyboard.up(want); dir = null; }
    } else {
      if (dir) { await page.keyboard.up(dir); dir = null; }
      if (!atk) { await page.keyboard.down('Control'); atk = true; }
    }
    await sleep(40);
  }
  if (dir) await page.keyboard.up(dir);
  if (atk) await page.keyboard.up('Control');
  return kills;
}

async function pickupAll(maxMs = 8000) {
  const t0 = Date.now(); let got = 0;
  while (Date.now() - t0 < maxMs) {
    const f = await F();
    const d = f.dr.filter((x) => Math.abs(x[4] - f.p[1]) < 40).sort((a, b) => Math.abs(a[3] - f.p[0]) - Math.abs(b[3] - f.p[0]))[0];
    if (!d) break;
    await walkTo(d[3], 6, 4000);
    await page.keyboard.down('z'); await sleep(250); await page.keyboard.up('z');
    got++;
    if (got > 30) break;
  }
  return got;
}

try {
  // ---------------- タイトル → 新しく始める
  await page.goto(base + 'index.html');
  await page.waitForSelector('#start', { state: 'visible', timeout: 60000 });
  await page.evaluate(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('lumina.saves')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } });
  await page.reload();
  await page.waitForSelector('#start', { state: 'visible', timeout: 60000 });
  await shot('title');
  await page.fill('#name', 'テスター');
  await page.click('#btnNew');
  await page.waitForFunction(() => window.game?.lastFrame, null, { timeout: 30000 });
  await sleep(1500);
  let f = await F();
  check('始まりのマップ S000', f.m === 'S000', f.m);
  await shot('start_S000');

  // ---------------- 歩く・ジャンプ（岩の段差 620〜680, 高さ 40）
  const x0 = f.p[0];
  await page.keyboard.down('ArrowRight'); await sleep(700);
  f = await F(); check('右へ歩く', f.p[0] > x0 + 40 && f.p[2] === 'walk1', `x ${x0}→${f.p[0]} ${f.p[2]}`);
  await page.keyboard.up('ArrowRight');
  await walkTo(560);
  await page.keyboard.down('ArrowRight'); await sleep(80);
  await page.keyboard.down('Alt'); await sleep(200);
  f = await F(); check('ジャンプ（Alt）', f.p[2] === 'jump' && f.p[9] === 3, f.p[2]);
  await shot('jump');
  await page.keyboard.up('Alt'); await sleep(400); await page.keyboard.up('ArrowRight');
  await sleep(300);
  f = await F(); check('岩を越えた', f.p[0] > 600, 'x=' + f.p[0]);
  await page.keyboard.down('ArrowDown'); await sleep(250);
  f = await F(); check('伏せ（↓）', f.p[2] === 'prone', f.p[2]);
  await shot('prone');
  await page.keyboard.up('ArrowDown');

  // ---------------- NPC と話す（V だけで: 話しかける → 話を聞く → 受ける → さようなら）・頭の上のマーク
  await walkTo(300);
  // 頭の上のマーク（描いた物を数える）: 受けられる人に「？」(1)
  await page.evaluate(() => {
    const r = window.game.renderer; r.marks = {};
    const orig = r.drawMark.bind(r);
    r.drawMark = (g, kind, x, y, t) => { r.marks[kind] = (r.marks[kind] || 0) + 1; return orig(g, kind, x, y, t); };
  });
  await sleep(500);
  let marks = await page.evaluate(() => ({ bulbs: { ...window.game.renderer.bulbs }, marks: { ...window.game.renderer.marks } }));
  check('受けられる人の頭に「？」', marks.bulbs.luka === 1 && marks.marks[1] > 0, JSON.stringify(marks));
  await shot('mark_question');
  const sel = () => page.evaluate(() => { const b = document.querySelector('#w_dialog button.sel'); return b ? b.textContent.trim() : null; });
  await tap('v'); await sleep(400);
  let dlg = await page.evaluate(() => window.game.ui.dialog);
  const say1 = dlg?.say;
  check('V で話しかける（会話の窓・セリフ）', !!dlg && dlg.npc === 'luka' && !!say1, `${dlg?.name}「${say1}」`);
  const sel1 = await sel();
  check('V の決まりの順: まず「話を聞く」が光る', sel1 === '話を聞く', sel1);
  await shot('dialog_luka');
  await tap('v'); await sleep(300);
  const sel2 = await sel();
  check('V で話を聞く → 「受ける」が光る', sel2 === '受ける', sel2);
  await shot('dialog_quest');
  await tap('v'); await sleep(300);
  let ui = await U();
  const sel3 = await sel();
  check('V で受ける → 「さようなら」が光る', ui.quests.some((q) => q.id === 'S-01') && sel3 === 'さようなら', `${ui.quests.map((q) => q.id).join(',')} / ${sel3}`);
  await tap('v'); await sleep(300);
  check('V でさようなら（窓を閉じる）', !(await page.evaluate(() => window.game.ui.open.has('dialog'))));
  // もう一度話すとセリフが変わる・進めているクエストの残りを言う
  await tap('v'); await sleep(400);
  dlg = await page.evaluate(() => window.game.ui.dialog);
  check('同じ NPC に 2 回話すとセリフが変わる', !!dlg && !!dlg.say && dlg.say !== say1, `「${say1}」→「${dlg?.say}」`);
  check('進めているクエストの残りを言う', !!dlg?.hint, dlg?.hint);
  // 会話の窓が開いている間は動かない
  const xTalk = (await F()).p[0];
  await page.keyboard.down('ArrowRight'); await sleep(400); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('Control'); await sleep(200); await page.keyboard.up('Control');
  f = await F();
  check('会話の間は主人公が動かない', Math.abs(f.p[0] - xTalk) < 1 && f.p[2] !== 'walk1', `x ${xTalk}→${f.p[0]} ${f.p[2]}`);
  await shot('dialog_again');
  await page.keyboard.press('Escape'); await sleep(200);
  check('Esc で会話の窓を閉じる', !(await page.evaluate(() => window.game.ui.open.has('dialog'))));

  // ---------------- ポータルで S001 へ
  await walkTo(1350, 6);
  await tap('ArrowUp'); await sleep(900);
  f = await F(); check('ポータル（↑）で S001 へ', f.m === 'S001', f.m);
  await sleep(600);
  marks = await page.evaluate(() => { const r = window.game.renderer; r.marks = {}; return new Promise((res) => setTimeout(() => res({ bulbs: { ...r.bulbs }, marks: { ...r.marks } }), 300)); });
  check('報告できる人の頭に電球（S-01 の報告先ガンゾ）', marks.bulbs.ganzo === 2 && marks.marks[2] > 0, JSON.stringify(marks));
  await shot('portal_S001_bulb');

  // ---------------- 狩り（M001 コロ貝）・拾う・Lv アップ
  const lv0 = (await F()).h[6];
  const kills = await hunt(QUICK ? 30000 : 70000, 6);
  check('敵を倒す（Ctrl）', kills >= 3, kills + ' 体');
  await shot('battle');
  const before = (await U()).inv.reduce((a, t) => a + t.filter(Boolean).length, 0) + '/' + (await F()).h[9];
  const got = await pickupAll();
  const after = (await U()).inv.reduce((a, t) => a + t.filter(Boolean).length, 0) + '/' + (await F()).h[9];
  check('拾う（Z）', got > 0 && before !== after, `持ち物の数/お金 ${before} → ${after}`);
  let kills2 = 0;
  for (let i = 0; i < 4 && (await F()).h[6] === lv0; i++) kills2 += await hunt(25000, 4);
  f = await F();
  check('Lv が上がる', f.h[6] > lv0, `Lv ${lv0}→${f.h[6]}（追加で ${kills2} 体）`);
  await pickupAll(4000);

  // ---------------- 縄（S001 x=1340, 512〜616）
  await walkTo(1340, 3);
  await page.keyboard.down('ArrowUp'); await sleep(600);
  f = await F(); check('縄につかまって登る（↑）', f.p[9] === 4, 'state=' + f.p[9] + ' y=' + f.p[1]);
  await shot('rope');
  await sleep(900); await page.keyboard.up('ArrowUp'); await sleep(300);
  f = await F(); check('縄の上の足場へ', f.p[1] <= 513 && f.p[9] <= 1, 'y=' + f.p[1]);

  // ---------------- 窓: 能力値（AP）・スキル（SP）・クイックスロット・持ち物
  await page.keyboard.press('s'); await sleep(300);
  let st = await U();
  const ap0 = st.ap;
  if (ap0 > 0) await page.click('#w_stat button.plus[data-a="str"]');
  await sleep(200); st = await U();
  check('AP を振る（能力値の窓）', ap0 > 0 && st.ap === ap0 - 1, `AP ${ap0}→${st.ap}`);
  await shot('window_stat');
  await page.keyboard.press('s');
  await page.keyboard.press('k'); await sleep(300);
  const sp0 = st.sp[0];
  const learn = await page.$('#w_skill button.plus');
  if (learn) await learn.click();
  await sleep(200); st = await U();
  check('SP を振る（スキルの窓）', sp0 > 0 && st.sp[0] === sp0 - 1, `SP ${sp0}→${st.sp[0]}`);
  const qbtn = await page.$('#w_skill button[data-pick="skill"]');
  if (qbtn) { await qbtn.click(); await sleep(100); await page.click('#w_picker button[data-put="1"]'); }
  await sleep(200); st = await U();
  check('スキルをクイックスロットに置く', st.quick[1]?.kind === 'skill', JSON.stringify(st.quick[1]));
  await shot('window_skill');
  await page.keyboard.press('k');
  await page.keyboard.press('i'); await sleep(300);
  await page.click('#w_inv button[data-invtab="1"]'); await sleep(100);
  const cell = await page.$('#w_inv .cell:not(.empty)');
  if (cell) { await cell.click(); await sleep(100); const pb = await page.$('#w_inv button[data-pick="item"]'); if (pb) { await pb.click(); await sleep(100); await page.click('#w_picker button[data-put="8"]'); } }
  await sleep(200);
  await shot('window_inv');
  await page.keyboard.press('i');
  await page.keyboard.press('q'); await sleep(300);
  await shot('window_quest');
  await page.keyboard.press('q');
  // スキルを使う（A キー = クイックスロット 1）
  if ((await U()).quick[1]) {
    await tap('a', 80); await sleep(500);
    log('スキルを使った', (await F()).p[2]);
  }

  // ---------------- はしご（S002 x=700, 496〜624）
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 200 && (await F()).p[0] < 1500; i++) await sleep(30);
  await page.keyboard.up('ArrowRight');
  // 上の足場から降りて、右のポータルへ
  await walkTo(1580, 4);
  await page.keyboard.down('ArrowDown'); await tap('Alt', 80); await page.keyboard.up('ArrowDown'); await sleep(700);
  await walkTo(1740, 6);
  await tap('ArrowUp'); await sleep(900);
  f = await F(); check('ポータルで S002 へ', f.m === 'S002', f.m);
  await walkTo(700, 3);
  await page.keyboard.down('ArrowUp'); await sleep(700);
  f = await F(); check('はしごを登る', f.p[9] === 5, 'state=' + f.p[9]);
  await shot('ladder');
  for (let i = 0; i < 60 && (await F()).p[9] === 5; i++) await sleep(50);
  await page.keyboard.up('ArrowUp'); await sleep(300);
  f = await F(); check('はしごの上の丘へ', f.p[1] <= 497, 'y=' + f.p[1]);
  const kills3 = await hunt(QUICK ? 15000 : 30000, 3);
  log('丘で倒した', kills3);
  await shot('hill');

  // ---------------- 音（BGM がつながっている・効果音が表のとおりに鳴った）
  const snd = await page.evaluate(() => ({ played: [...window.game.audio.seen], bgm: window.game.audio.bgmId, nodes: window.game.audio.bgmNodes.length, ctx: window.game.audio.ctx?.state }));
  log('鳴った効果音', snd.played.join(' '));
  check('BGM が鳴っている（イントロ＋ループ）', snd.nodes >= 1 && !!snd.bgm, `${snd.bgm} nodes=${snd.nodes} ctx=${snd.ctx}`);
  check('効果音（ジャンプ・攻撃・当たる・ポータル・拾う・Lv アップ）', ['jump', 'atk_sword1', 'hit', 'portal', 'levelup'].every((x) => snd.played.includes(x)) && (snd.played.includes('pickup') || snd.played.includes('coin')), '');

  // ---------------- セーブして読み直す
  const beforeSave = await F();
  const ui0 = await U();
  await page.keyboard.press('o'); await sleep(200);
  await shot('window_opt');
  await page.click('#w_opt button[data-act="save"]'); await sleep(300);
  await page.keyboard.press('o');
  await page.reload();
  await page.waitForSelector('#btnCont', { state: 'visible', timeout: 60000 });
  await page.click('#btnCont');
  await page.waitForFunction(() => window.game?.lastFrame, null, { timeout: 30000 });
  await sleep(800);
  f = await F(); const ui1 = await U();
  check('セーブして読み直す（マップ・Lv・経験値・お金・持ち物）', f.m === beforeSave.m && ui1.lv === ui0.lv && ui1.exp === ui0.exp && ui1.meso === ui0.meso && JSON.stringify(ui1.inv) === JSON.stringify(ui0.inv) && ui1.quick[1]?.id === ui0.quick[1]?.id,
    `${beforeSave.m}→${f.m} Lv${ui0.lv}→${ui1.lv} exp ${ui0.exp}→${ui1.exp}`);
  await shot('reloaded');

  // ---------------- 村（S003）: 店・転職官の確かめ（話す・店の窓）
  await act('dbgWarp', 'S003', 'sp'); await sleep(600);
  f = await F();
  const nina = (await page.evaluate(() => window.game.map.npcs)).find((n) => n.id === 'nina');
  await walkTo(nina.x + 30, 8);
  await page.evaluate(() => { const g = window.game; const r = g.act('talk', 'nina'); g.ui.openDialog(r.dialog); });
  await sleep(300);
  const sb = await page.$('#w_dialog button[data-shop]');
  if (sb) { await sb.click(); await sleep(200); }
  await act('dbgMeso', '', '', 1000); await sleep(100);
  const meso0 = (await U()).meso;
  const buy = await page.$('#w_shop button[data-buy]');
  if (buy) { await buy.click(); await sleep(200); }
  check('店で買う', (await U()).meso < meso0, `お金 ${meso0}→${(await U()).meso}`);
  await shot('shop');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await shot('town');

  // ---------------- 転職官（Lv10・能力値を足して 1 次転職）
  await act('dbgExp', '', '', 2000000); await sleep(100);
  for (let i = 0; i < 9; i++) { await act('dbgExp', '', '', 2000000); await sleep(50); }
  st = await U();
  log('Lv', st.lv, 'AP', st.ap, 'STR', st.base.str);
  for (let i = 0; i < 40 && st.ap > 0; i++) { const r = await act('ap', 'str'); if (!r.ok) log('AP', r); st = await U(); }
  const instr = st.lines.find((l) => l.line === 'warrior');
  log('Lv', st.lv, 'STR', st.base.str, '戦士の転職官', instr.npc, instr.can);
  const md = await page.evaluate((npc) => { const g = window.game; for (const id of g.data['maps/index.json'] ? JSON.parse(g.data['maps/index.json']).maps.map((m) => m.id) : []) { const m = g.mapData(id); if (m && m.npcs.some((n) => n.id === npc)) return id; } return null; }, instr.npc);
  if (md) {
    await act('dbgWarp', md, ''); await sleep(600);
    const npcPos = (await page.evaluate(() => window.game.map.npcs)).find((n) => n.id === instr.npc);
    await act('dbgPos', String(npcPos.y), '', npcPos.x + 30); await sleep(300);
    await page.evaluate((npc) => { const g = window.game; const r = g.act('talk', npc); g.ui.openDialog(r.dialog); }, instr.npc);
    await sleep(300);
    await shot('job_instructor');
    const adv = await page.$('#w_dialog button[data-act="advance1"]:not([disabled])');
    if (adv) { await adv.click(); await sleep(400); }
    st = await U();
    check('1 次転職（戦士）', st.tier === 1 && st.line === 'warrior', st.job);
    await page.keyboard.press('Escape');
    await sleep(1200);
    await shot('job_advanced');
  } else check('転職官のマップが見つかる', false);

  // ---------------- 重さ・エラー
  const perf = await page.evaluate(() => { const P = window.game.perf; const a = (x) => x.reduce((s, v) => s + v, 0) / x.length; const p95 = (x) => [...x].sort((a, b) => a - b)[Math.floor(x.length * 0.95)]; return { core: a(P.frame), render: a(P.render), total: a(P.total), p95: p95(P.total), worst: P.worst, errors: window.game.errors }; });
  log('フレームの時間（ms）', JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]))));
  check('1 フレームの平均が 8ms 以下（60fps の半分）', perf.total < 8, perf.total.toFixed(2) + 'ms');
  check('ゲームの中のエラーが無い', perf.errors.length === 0, perf.errors.slice(0, 2).join(' / '));
  check('コンソールにエラーが無い', errors.length === 0, errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error(e);
  try { await shot('error'); } catch { /* */ }
  check('最後まで動いた', false, String(e));
} finally {
  await browser.close();
  srv.close();
}
const ng = results.filter((r) => !r.ok);
console.log(`\n${results.length - ng.length}/${results.length} OK`);
if (errors.length) console.log('コンソールのエラー:', errors.slice(0, 10));
process.exit(ng.length ? 1 : 0);
