// UI の QA（第 3 弾）: 見た目・言葉・数字の出し方の不具合が戻っていないかの確かめ。
// 前半は Node だけ（表記・文章）、後半は Chromium（いろいろな画面の大きさ）。
// 実行: PORT=8304 node tests/qa_ui.mjs   （--only=node,title,mobile,desk,land のように一部だけ）
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtTime } from '../src/engine/format.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8304;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

const results = [];
function check(name, ok, info = '') { results.push({ name, ok: !!ok }); console.log(`${ok ? '✔' : '✘'} ${name}${info && !ok ? `  (${info})` : ''}`); }

// ---------------- Node だけ
/** src の中の文字列（コメントを除く）に出てくる言葉 */
function scanSrc(re) {
  const hits = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        const s = l.trim();
        if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
        const code = l.replace(/\/\/ .*$/, '');
        if (re.test(code)) hits.push(`${path.relative(ROOT, p)}:${i + 1}`);
      });
    }
  };
  walk(path.join(ROOT, 'src'));
  return hits;
}

if (want('node')) {
  check('表記: 短い時間は 0 分を出さない（6時間・1日）', fmtTime(6 * 3600, true) === '6時間' && fmtTime(86400, true) === '1日' && fmtTime(86400 + 6 * 3600, true) === '1日6時間' && fmtTime(6 * 3600 + 5 * 60, true) === '6時間5分',
    [fmtTime(6 * 3600, true), fmtTime(86400, true), fmtTime(86400 + 6 * 3600, true), fmtTime(6 * 3600 + 5 * 60, true)].join(' / '));
  check('表記: 長い時間の形は変わらない', fmtTime(3725) === '1時間2分05秒' && fmtTime(65) === '1分05秒', fmtTime(3725));
  const old = scanSrc(/['"`][^'"`]*(パラゴン|苦行|太古|原初)/);
  check('言葉: 画面の文字に古い言葉（パラゴン・苦行・太古・原初）が無い', !old.length, old.slice(0, 5).join(' '));
  const gob = scanSrc(/宝ゴブリン/);
  check('言葉: 「宝ゴブリン」（既存作の言葉）ではなく「ため込み屋」', !gob.length, gob.join(' '));
  const seiza = scanSrc(/星座盤の窓/);
  check('言葉: 窓の名前はタブの名前（「パッシブの窓」）', !seiza.length, seiza.join(' '));
  const job = scanSrc(/この職業/);
  check('言葉: 「クラス」にそろえる（この職業で始める → このクラスで始める）', !job.length, job.join(' '));
  const money = scanSrc(/お金が足りません/);
  check('言葉: 「ゴールドが足りません」にそろえる', !money.length, money.join(' '));
  const docs = ['docs/AI_PROMPTS.md', 'docs/AI_PROMPTS.csv', 'docs/ASSETS.md'].filter((f) => /パラゴン|苦行|太古|原初|宝ゴブリン/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('言葉: 手引き・指示文に古い言葉（パラゴン・苦行・太古・原初・宝ゴブリン）が無い', !docs.length, docs.join(' '));
}

// ---------------- Chromium
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* next */ }
  for (const r of ['/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

/** 終盤の状態（Lv100・アビスLv120・転生・装備・素材） */
async function lateGame(p, name = '終盤の試し') {
  return p.evaluate(async (nm) => {
    const g = window.__game;
    const { generateItem } = await import('./src/game/loot.js');
    const { RNG } = await import('./src/engine/rng.js');
    const { ZONES, STAGES_PER_ZONE } = await import('./src/data/world.js');
    g.newGame('necromancer', nm);
    const st = g.state; const h = st.hero;
    h.level = 100; h.paragon.level = 120; h.tree.points = 40;
    g.sys.skills.learnUnlocked(true);
    const rng = new RNG(7);
    for (const slot of ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring1', 'ring2']) {
      const it = generateItem(rng, { ilvl: 100, minRarity: 'legendary', slot: slot.replace(/\d$/, ''), cls: 'necromancer' });
      if (it) h.equip[slot] = it;
    }
    const rar = ['rare', 'legendary', 'set', 'unique', 'mythic'];
    for (let i = 0; i < 25; i++) { const it = generateItem(rng, { ilvl: 80, minRarity: rar[i % rar.length], cls: 'necromancer' }); if (it) st.inv.bag.push(it); }
    st.meta.gold = 1e10;
    const w = st.world;
    w.maxZone = ZONES.length - 1; w.maxTorment = 4;
    for (const z of ZONES) { w.cleared[z.id] = true; w.maxStage[z.id] = STAGES_PER_ZONE; }
    st.meta.prestige.unlocked = true; st.meta.rebirths = 3; st.meta.souls = 5000; st.meta.totalSouls = 5000;
    g.sys.prestige.applyUnlocks();
    g.onGearChanged();
    for (let i = 0; i < 20 * 10; i++) g.tick(0.05);
    window.__ui.unlockAll();
    window.__ui.updateTop();
    window.__ui.renderPanel();
    return true;
  }, name);
}

const main = async () => {
  const browser = (want('title') || want('mobile') || want('desk') || want('land')) ? await (await loadPlaywright()).chromium.launch() : null;
  const srv = browser ? await serve() : null;
  const errors = [];
  const open = async (w, hgt) => {
    const mobile = w <= 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${w}x${hgt} console: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${w}x${hgt} pageerror: ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForSelector('#title', { timeout: 15000 });
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.waitForSelector('#title');
    return { ctx, p };
  };
  const start = async (p) => { await p.click('.slot.empty .btn'); await p.waitForSelector('.classcards'); await p.click('.title-box .btn-primary'); await p.waitForSelector('#scene'); await p.waitForTimeout(200); };

  if (browser && want('title')) {
    const { ctx, p } = await open(1600, 900);
    await p.click('.slot.empty .btn');
    await p.waitForSelector('.classinfo');
    const t = await p.evaluate(() => ({ info: document.querySelector('.classinfo').textContent, btn: document.querySelector('.title-box .btn-primary').textContent }));
    check('タイトル: クラスの説明は「リソース: 怒り」', t.info.includes('リソース: 怒り') && !/\s力: /.test(t.info), t.info.slice(-30));
    check('タイトル: 始めるボタンは「このクラスで始める」', t.btn === 'このクラスで始める', t.btn);
    await p.click('.title-box .btn-primary');
    await p.waitForSelector('#scene');
    await p.waitForTimeout(300);
    // 次に開く機能の書き方（「…」で区切らない）
    await p.evaluate(() => { const ui = window.__ui; ui.dock.setTab('goal'); ui.dock.render(); });
    const un = await p.evaluate(() => document.querySelector('.dg-unlock')?.textContent || '');
    check('下の欄: 次に開く機能は「名前（条件: …）」', !!un && !un.includes('…') && un.includes('条件'), un);
    // ゴールドは小数を出さない（上の帯・記録・設定）
    await p.evaluate(() => { const g = window.__game; g.state.meta.gold = 18.5; g.state.meta.stats.goldEarned = 63.65; window.__ui.updateTop(); });
    const top = await p.evaluate(() => document.querySelector('.tb-res.gold').textContent);
    check('数字: 上の帯のゴールドは整数（18.5 → 18 G）', top === '18 G', top);
    await p.evaluate(() => window.__ui.openPanel('stats'));
    await p.waitForTimeout(150);
    const stx = await p.evaluate(() => document.querySelector('#panelbody').textContent);
    check('数字: 記録の「稼いだゴールド」に小数が無い', !/63\.6|18\.5/.test(stx), stx.match(/稼いだゴールド.{0,20}/)?.[0]);
    await p.evaluate(() => window.__ui.openPanel('settings'));
    await p.waitForTimeout(100);
    const set = await p.evaluate(() => document.querySelector('#panelbody').textContent);
    check('設定: 窓の最後に浮いた「所持金」の行が無い', !set.includes('所持金'));
    // 日課の進み具合（ゴールドを稼ぐ日課）も整数
    const bt = await p.evaluate(async () => {
      const g = window.__game; const ui = window.__ui;
      const sys = g.sys.bounties; sys.refresh();
      // 「稼ぎ」の日課にして、稼いだゴールドを小数にする（進み具合 = 稼いだゴールド − 始めの値）
      const b0 = sys.list()[0];
      Object.assign(b0, { type: 'gold', target: 2000, base: 0, done: false, claimed: false });
      g.state.meta.stats.goldEarned = 12.34;
      sys.update();
      ui.openPanel('bounties');
      await new Promise((r) => setTimeout(r, 150));
      return [...document.querySelectorAll('#panelbody .bt-row')].map((x) => x.textContent).join('|');
    });
    check('数字: 日課の進み具合に小数が無い', bt && !/12\.3/.test(bt), bt.slice(0, 80));
    // ペットが重なったときの知らせに経験値の数
    await p.evaluate(() => window.__game.events.emit('petHatched', { id: 'x', name: '火狐', dup: true, stars: 0 }));
    await p.waitForTimeout(100);
    const pt = await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((x) => x.textContent).find((x) => x.includes('重なった')) || '');
    check('知らせ: ペットが重なったときの経験値に数がある', /経験値 \+\d/.test(pt), pt);
    // おかえりの報告: パッシブの点は「パッシブの窓」
    await p.evaluate(() => { const g = window.__game; g.state.hero.tree.points = 3; for (let i = 0; i < 20 * 30; i++) g.tick(0.05); g.sys.offline.grant(6 * 3600, { reason: 'offline' }); });
    await p.waitForTimeout(300);
    const ofr = await p.evaluate(() => document.querySelector('.ofr')?.textContent || '');
    check('おかえり: 「パッシブの窓」と書く・6時間0分 ではなく 6時間', ofr.includes('パッシブの窓') && !ofr.includes('星座盤の窓') && ofr.includes('6時間') && !ofr.includes('6時間0分'), ofr.slice(0, 60));
    await ctx.close();
  }

  if (browser && want('mobile')) {
    const { ctx, p } = await open(390, 844);
    await start(p);
    await lateGame(p);
    await p.waitForTimeout(300);
    const nm = await p.evaluate(() => { const e = document.querySelector('.tb-name'); const l = document.querySelector('.tb-level'); return { sw: e.scrollWidth, cw: e.clientWidth, txt: e.textContent, lsw: l.scrollWidth, lcw: l.clientWidth }; });
    check('スマホ: 上の帯の名前が切れない（Lv100・アビスLv のとき）', nm.sw <= nm.cw + 1 && nm.cw >= 50, JSON.stringify(nm));
    check('スマホ: 上の帯のレベルの文字が切れない', nm.lsw <= nm.lcw + 1, JSON.stringify(nm));
    const res = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bar.res .txt')).fontSize));
    check('スマホ: リソースの文字が小さすぎない（10px 以上）', res >= 10, String(res));
    await ctx.close();
  }

  if (browser && want('desk')) {
    const { ctx, p } = await open(1280, 720);
    await start(p);
    await lateGame(p);
    await p.evaluate(() => window.__ui.openPanel('hero'));
    await p.waitForTimeout(200);
    // 着せ替えの下の名前: 「アビスLv 120」が途中で折れない
    const lines = await p.evaluate(() => {
      const box = document.querySelector('.dollname');
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; const i = n.nodeValue.indexOf('アビスLv');
        if (i < 0) continue;
        const m = n.nodeValue.slice(i).match(/^アビスLv \d+/);
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + m[0].length);
        return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
      }
      return -1;
    });
    check('装備の窓: 「アビスLv 120」が途中で折り返さない', lines === 1, String(lines));
    // 地図: 耐久の % が桁外れにならない
    await p.evaluate(() => window.__ui.openPanel('map'));
    await p.waitForTimeout(200);
    const mp = await p.evaluate(() => document.querySelector('.wm-power')?.textContent || '');
    check('地図: 耐久の割合が桁外れの数にならない', mp && !/耐久 \d{5,}%/.test(mp), mp.slice(-40));
    const tm = await p.evaluate(() => [...document.querySelectorAll('.tm-mult .tm-v, .tm-mult b')].map((x) => x.textContent).join(' '));
    check('地図: 魔境の倍率の小数のそろえ方（×1.00 と ×1 を混ぜない・0.0% と書かない）', !/×1\.00/.test(tm) && !/\b0\.0%/.test(tm), tm);
    // 窓のタブ（1280 幅・420px の窓）: タブが窓の外に隠れない
    const hid = await p.evaluate(async () => {
      const bad = [];
      for (const gid of ['chara', 'forge', 'adv', 'collect', 'other']) {
        document.querySelector(`.navgrp[data-g="${gid}"]`).click();
        await new Promise((r) => setTimeout(r, 30));
        const row = document.querySelector('.nav-subs').getBoundingClientRect();
        for (const b of document.querySelectorAll('.navbtn:not([hidden])')) { const r = b.getBoundingClientRect(); if (r.left < row.left - 1 || r.right > row.right + 1) bad.push(`${gid}:${b.dataset.id}`); }
      }
      return bad;
    });
    check('窓のタブ: 1280 幅でもタブが隠れない', !hid.length, hid.join(','));
    // まとまりのタブの数の印（99+ など）が名前の文字に重ならない
    const ov = await p.evaluate(() => [...document.querySelectorAll('.navgrp')].filter((b) => !b.hidden).map((b) => {
      const t = b.querySelector('.ng-tx').getBoundingClientRect(); const s = b.querySelector('.nav-badge'); const r = s.getBoundingClientRect();
      if (s.style.display === 'none' || !r.width) return null;
      const ox = Math.min(t.right, r.right) - Math.max(t.left, r.left); const oy = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top);
      return ox > 1 && oy > 1 ? `${b.dataset.g}:${Math.round(ox)}x${Math.round(oy)}` : null;
    }).filter(Boolean));
    check('窓のタブ: まとまりの数の印が名前に重ならない', !ov.length, ov.join(','));
    // 日課のログインの贈り物: 中身が切れない
    await p.evaluate(() => window.__ui.openPanel('bounties'));
    await p.waitForTimeout(200);
    const cut = await p.evaluate(() => [...document.querySelectorAll('.bt-dv, .bt-dd')].filter((e) => e.offsetParent && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)).map((e) => e.textContent));
    check('日課: ログインの贈り物の文字が切れない', !cut.length, cut.join(' / '));
    // HUD のスキルの枠: 祭壇「第六の構え」で枠が増えたらすぐ 6 つ
    const sk = await p.evaluate(async () => {
      const g = window.__game;
      g.state.meta.souls = 1e6;
      g.sys.prestige.buy('idle_slot', 1);
      await new Promise((r) => setTimeout(r, 400));
      return { n: document.querySelectorAll('#hud .hud-skills .skslot').length, size: g.sys.skills.barSize() };
    });
    check('HUD: スキルの枠が増えたら HUD の枠も増える', sk.size === 6 && sk.n === 6, JSON.stringify(sk));
    await ctx.close();
  }

  if (browser && want('land')) {
    const { ctx, p } = await open(844, 390);
    await start(p);
    await lateGame(p);
    await p.evaluate(() => window.__ui.openPanel('bag'));
    await p.waitForTimeout(200);
    const tips = await p.evaluate(async () => {
      const out = [];
      for (const r of ['set', 'unique', 'mythic', 'legendary']) {
        const cell = document.querySelector(`#panelbody .grid .cell.r-${r}`);
        if (!cell) continue;
        cell.dispatchEvent(new MouseEvent('mouseenter'));
        await new Promise((res) => setTimeout(res, 60));
        const t = document.getElementById('tooltip').getBoundingClientRect();
        out.push({ r, top: Math.round(t.top), bottom: Math.round(t.bottom), vh: innerHeight });
        cell.dispatchEvent(new MouseEvent('mouseleave'));
      }
      return out;
    });
    check('横向きのスマホ: アイテムの説明が画面からはみ出さない', tips.length && tips.every((x) => x.top >= 0 && x.bottom <= x.vh + 1), JSON.stringify(tips));
    await ctx.close();
  }

  if (browser) {
    check('console のエラー・ページのエラーが 0 件', !errors.length, errors.slice(0, 5).join('\n'));
    await browser.close();
    srv.close();
  }
  const fail = results.filter((r) => !r.ok);
  console.log(`\nUI の QA: ${results.length - fail.length} / ${results.length}`);
  process.exit(fail.length ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
