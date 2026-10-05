// 外部イラスト担当向けの参考画像を、ゲームの描画関数（今のコード描画）から書き出す。
//   node tools/gen_art_refs.mjs            → docs/art_handoff/ref_*.png を全部作り直す
//   node tools/gen_art_refs.mjs heroes pets → 一部だけ（--template=<dir> でテンプレートの場所を指定。既定 assets/sprites_template）
// 必要: playwright（/opt/node22/lib/node_modules など）, chromium（PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers）, http-server（無ければ内蔵サーバー）
// 作る画像: ref_heroes, ref_faces, ref_hair, ref_equip_<slot>, ref_enemies_<region>, ref_bosses, ref_pets, ref_palette, ref_scale
// 各画像には ID（= 納品ファイル名）のラベルを入れる。データは tools/gen_asset_list.mjs と共通。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssetList, cellFor, drawnSize, isFlyer, loadTemplateManifest } from './gen_asset_list.mjs';
import { ENEMIES, ENEMY_REGIONS } from '../src/data/enemies.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'art_handoff');
const PORT = Number(process.env.PORT) || 8143;
const BASE = `http://127.0.0.1:${PORT}`;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fallthrough */ }
  for (const r of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean).flatMap((p) => p.split(':'))) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright が見つかりません');
}
function ping() { return new Promise((r) => { http.get(BASE + '/index.html', (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)); }); }
async function startServer() {
  for (const bin of ['/opt/node22/bin/http-server', path.join(ROOT, 'node_modules/.bin/http-server')]) {
    if (!fs.existsSync(bin)) continue;
    const proc = spawn(bin, [ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { await sleep(100); if (await ping()) return { close: () => proc.kill() }; }
    proc.kill();
  }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  return { close: () => srv.close() };
}

// ================================================================ ブラウザ側のコード（page に注入）
function pageCode() {
  const FONT = '"IPAGothic","IPAPGothic","WenQuanYi Zen Hei",sans-serif';
  const BG = '#1d1729', CELL = '#2c2440', CELL_E = '#4a3f66', GUIDE = '#ff4fa0', TXT = '#ffffff', SUB = '#c9bfe6';
  const RAR = { common: '#e8e8f0', rare: '#4da6ff', epic: '#b04dff', legendary: '#ffb800', mythic: '#ff3d7f', pet: '#ff6fd8' };
  const M = {};
  const ready = (async () => {
    M.ch = await import('/src/render/character.js');
    M.ea = await import('/src/render/enemyArt.js');
    M.pe = await import('/src/render/pets.js');
    M.items = await import('/src/data/items.js');
    M.cls = await import('/src/data/classes.js');
    M.en = await import('/src/data/enemies.js');
    M.jobs = await import('/src/data/jobs.js');
    M.loot = await import('/src/systems/loot.js');
    await document.fonts.load('16px IPAGothic').catch(() => {});
  })();

  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
    const x = c.getContext('2d'); x.fillStyle = BG; x.fillRect(0, 0, c.width, c.height);
    return [c, x];
  }
  function text(ctx, s, x, y, o = {}) {
    const size = o.size || 14;
    ctx.save();
    ctx.font = `${o.bold === false ? '' : 'bold '}${size}px ${FONT}`;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const w = ctx.measureText(s).width;
    let tx = x;
    if (o.align === 'center') tx = x - w / 2; else if (o.align === 'right') tx = x - w;
    if (o.bg !== null) { ctx.fillStyle = o.bg || 'rgba(10,6,20,0.78)'; ctx.beginPath(); ctx.roundRect(tx - 4, y - 2, w + 8, size + 6, 4); ctx.fill(); }
    ctx.fillStyle = o.color || TXT; ctx.fillText(s, tx, y + 1);
    ctx.restore();
    return w;
  }
  function header(ctx, title, sub) {
    text(ctx, title, 16, 12, { size: 26, bg: null });
    if (sub) text(ctx, sub, 18, 46, { size: 15, bg: null, color: SUB, bold: false });
  }
  /** 納品セルの見本: 枠＋基準点（足元中央）の十字と地面線 */
  function cell(ctx, x, y, w, h, ax, ay, o = {}) {
    ctx.save();
    ctx.fillStyle = o.fill || CELL; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CELL_E; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (ax != null) {
      ctx.strokeStyle = 'rgba(255,79,160,0.45)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x + 2, y + ay + 0.5); ctx.lineTo(x + w - 2, y + ay + 0.5); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = GUIDE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + ax - 6, y + ay); ctx.lineTo(x + ax + 6, y + ay); ctx.moveTo(x + ax, y + ay - 6); ctx.lineTo(x + ax, y + ay + 6); ctx.stroke();
    }
    ctx.restore();
  }
  function clipDo(ctx, x, y, w, h, fn) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); try { fn(); } finally { ctx.restore(); } }
  const lookOf = (id) => (id && M.items.ITEMS[id] ? M.items.ITEMS[id].look : null);
  function equipLooks(ids) { const o = {}; for (const [k, v] of Object.entries(ids || {})) if (k !== 'pet' && v) o[k] = lookOf(v); return o; }
  function drawChar(ctx, x, y, s, look, equip, anim) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    M.ch.drawCharacter(ctx, 0, 0, look, equip || {}, { facing: 1, t: 0.3, state: 'idle', ...anim, noCache: true });
    ctx.restore();
  }
  const HEROES = () => {
    const out = [];
    for (const cid of M.cls.CLASS_IDS) for (const g of ['f', 'm']) {
      out.push({ cid, g, cls: M.cls.CLASSES[cid], name: M.cls.defaultName(cid, g), look: M.cls.defaultLook(cid, g), eqIds: M.items.starterEquipFor(cid, g) });
    }
    return out;
  };
  const GJ = { f: '♀', m: '♂' };

  // ------------------------------------------------------------ 主人公
  function heroes() {
    const S = 2, CW = 160, CH = 200, AX = 80, AY = 192, LW = 300, top = 120;
    const cols = [
      ['idle', { state: 'idle', t: 0.3 }], ['walk ①', { state: 'walk', t: 0.08 }], ['walk ②', { state: 'walk', t: 0.38 }], ['jump', { state: 'jump', t: 0.2 }],
      ['climb（背面）', { state: 'climb', t: 0.2 }], ['attack', { state: 'attack', attackT: 0.32 }], ['shoot（銃のとき）', { state: 'shoot', attackT: 0.1, gun: true }],
      ['hurt', { state: 'hurt', t: 0.12 }], ['dead', { state: 'dead', deadT: 1, fallT: 1 }], ['drive', { state: 'drive' }], ['sit', { state: 'sit' }], ['HP25%（破れ）', { state: 'idle', damage: 0.8 }],
    ];
    const hs = HEROES();
    const RH = CH + 34;
    const [c, ctx] = canvas(LW + cols.length * (CW + 6) + 20, top + hs.length * RH + 20);
    header(ctx, 'ref_heroes — 主人公 3クラス × ♂♀（今のコード描画・初期装備）', '表示 2倍 ＝ 納品サイズ。1マス 160×200 / 桃色の十字 = 基準点（足元中央 80,192）。右向き。行名は SPEC_SPRITES の状態名');
    cols.forEach(([n], i) => text(ctx, n, LW + i * (CW + 6) + CW / 2, top - 26, { align: 'center', size: 14 }));
    hs.forEach((h, r) => {
      const y = top + r * RH;
      const lk = h.look;
      const lines = [
        [`${h.cid} ${GJ[h.g]}  ${h.name}`, 18, TXT], [`${h.cls.name}（${h.cls.role}）`, 13, SUB],
        [`髪型 ${lk.hair} / 体 body_${lk.body}`, 13, SUB], [`肌 ${lk.skin}  髪 ${lk.hairColor}`, 13, SUB], [`瞳 ${lk.eyeColor}  表情 ${lk.expr}`, 13, SUB],
        ['初期装備:', 12, SUB], ...Object.entries(h.eqIds).filter(([k, v]) => v && k !== 'pet').map(([k, v]) => [`  ${k}: ${lookOf(v).style}（${v}）`, 12, SUB]),
      ];
      let ly = y + 4;
      for (const [s, sz, col] of lines) { text(ctx, s, 12, ly, { size: sz, color: col, bg: null, bold: sz > 13 }); ly += sz + 5; }
      const eq = equipLooks(h.eqIds);
      cols.forEach(([, a], i) => {
        const x = LW + i * (CW + 6);
        cell(ctx, x, y, CW, CH, AX, AY);
        const e2 = a.gun ? { ...eq, weapon: lookOf('pistol_9mm') } : eq;
        clipDo(ctx, x, y, CW, CH, () => drawChar(ctx, x + AX, y + AY, S, lk, e2, a));
      });
    });
    return c;
  }

  // ------------------------------------------------------------ 表情
  function faces() {
    const S = 3.6, CW = 170, CH = 170, LW = 210, top = 120;
    const cols = [
      ['neutral', { state: 'idle', t: 0.3 }], ['smile ※', { state: 'idle', t: 0.3 }], ['shout', { state: 'idle', face: 'shout' }], ['hurt（> <）', { state: 'hurt', t: 0.12 }],
      ['happy（^ ^）', { state: 'idle', face: 'happy' }], ['jito（ジト目）', { state: 'idle', face: 'jito' }], ['angry', { state: 'idle', face: 'angry' }], ['sad', { state: 'idle', face: 'sad' }],
      ['wink', { state: 'idle', face: 'wink' }], ['blink', { state: 'idle', t: 3.9 }], ['参考: 疲れ(HP25%)', { state: 'idle', damage: 0.8 }],
    ];
    const hs = HEROES();
    const RH = CH + 10;
    const [c, ctx] = canvas(LW + cols.length * (CW + 6) + 20, top + hs.length * RH + 70);
    header(ctx, 'ref_faces — 表情（face_f.png / face_m.png の行）', '表示 3.6倍（顔だけ拡大）。列名 = face シートの行名。表情の雰囲気はクラス（expr: cute / cool）で変わる。※smile は今のコードに単独の表情が無い（neutral で代用）→ 新規に描いてほしい');
    cols.forEach(([n], i) => text(ctx, n, LW + i * (CW + 6) + CW / 2, top - 26, { align: 'center', size: 14 }));
    hs.forEach((h, r) => {
      const y = top + r * RH;
      text(ctx, `${h.cid} ${GJ[h.g]} ${h.name}`, 12, y + 50, { size: 17, bg: null });
      text(ctx, `face_${h.g}.png / expr ${h.look.expr}`, 12, y + 76, { size: 13, color: SUB, bg: null, bold: false });
      text(ctx, `瞳 ${h.look.eyeColor}`, 12, y + 96, { size: 13, color: SUB, bg: null, bold: false });
      const eq = { top: lookOf(h.eqIds.top) };
      cols.forEach(([, a], i) => {
        const x = LW + i * (CW + 6);
        cell(ctx, x, y, CW, CH);
        // 頭の中心（足元から約 62px 上）がセル中央に来るように
        clipDo(ctx, x, y, CW, CH, () => drawChar(ctx, x + CW / 2, y + CH / 2 + 52 * S, S, h.look, eq, a));
      });
    });
    text(ctx, '面の構成: 白目は省略可 → 虹彩（上が暗く下が明るい縦グラデ）→ 瞳孔 → ハイライト大（右上）＋小（左下）→ 太い上まつ毛。眉と口で感情を出す。頬の赤み rgba(255,110,150,0.45)', 16, top + hs.length * RH + 16, { size: 14, bg: null, color: SUB, bold: false });
    return c;
  }

  // ------------------------------------------------------------ 髪型 14 種
  function hair() {
    const S = 2, CW = 160, CH = 200, AX = 80, AY = 192, LW = 170, top = 120;
    const styles = M.ch.HAIR_STYLES;
    const views = [['♀ 正面', 'f', { state: 'idle' }, '#ff6fb5'], ['♂ 正面', 'm', { state: 'idle' }, '#dde3ee'], ['背面（climb）', 'f', { state: 'climb', t: 0.2 }, '#ff6fb5'], ['tint見本（グレー）', 'f', { state: 'walk', t: 0.1 }, '#a8a8b0']];
    const half = Math.ceil(styles.length / 2);
    const BW = LW + views.length * (CW + 6) + 30;
    const RH = CH + 12;
    const [c, ctx] = canvas(BW * 2 + 10, top + half * RH + 20);
    header(ctx, 'ref_hair — 髪型 14 種（chars/hair/<id>_back_<f|m>_gray.png ＋ <id>_front_<f|m>_gray.png）', '表示 2倍 ＝ 納品サイズ。1髪型 × 性別 × 後ろ髪/前髪 = 4ファイル。tint: hairColor（グレースケールで描くとゲームが髪色を付ける）');
    for (let k = 0; k < 2; k++) views.forEach(([n], i) => text(ctx, n, k * BW + LW + i * (CW + 6) + CW / 2, top - 26, { align: 'center', size: 14 }));
    const DEF = new Set(Object.values(M.cls.DEFAULT_LOOKS).flatMap((g) => Object.values(g).map((l) => l.hair)));
    styles.forEach((h, idx) => {
      const k = idx < half ? 0 : 1, r = idx % half;
      const bx = k * BW, y = top + r * RH;
      text(ctx, h.id, bx + 12, y + 50, { size: 20, bg: null });
      text(ctx, h.name, bx + 12, y + 80, { size: 14, color: SUB, bg: null });
      text(ctx, `${h.id}_back_f/m`, bx + 12, y + 102, { size: 12, color: SUB, bg: null, bold: false });
      text(ctx, `${h.id}_front_f/m`, bx + 12, y + 118, { size: 12, color: SUB, bg: null, bold: false });
      if (DEF.has(h.id)) text(ctx, '★主人公の初期髪型', bx + 12, y + 140, { size: 12, color: '#ffd23f', bg: null });
      views.forEach(([, g, a, col], i) => {
        const x = bx + LW + i * (CW + 6);
        cell(ctx, x, y, CW, CH, AX, AY);
        const look = g === 'f'
          ? { body: 'f', skin: '#ffe3d3', hair: h.id, hairColor: col, eyeColor: '#ff3d8b', expr: 'cute', tie: '#ffd23f' }
          : { body: 'm', skin: '#f2cfb6', hair: h.id, hairColor: col, eyeColor: '#2fb8e8', expr: 'cool' };
        clipDo(ctx, x, y, CW, CH, () => drawChar(ctx, x + AX, y + AY, S, look, {}, a));
      });
    });
    return c;
  }

  // ------------------------------------------------------------ 装備（スロット別・全スタイル）
  const MANNEQUIN = {
    f: { body: 'f', skin: '#ffe3d3', hair: 'short', hairColor: '#6a5a7a', eyeColor: '#8a7ab0', expr: 'cute' },
    m: { body: 'm', skin: '#f2cfb6', hair: 'short', hairColor: '#6a5a7a', eyeColor: '#8a7ab0', expr: 'cool' },
  };
  function equip(slot, pri) {
    const S = 2, CW = 160, CH = 200, AX = 80, AY = 192, LW = 250, top = 120;
    const groups = {};
    for (const it of Object.values(M.items.ITEMS)) if (it.type === 'equip' && it.slot === slot) (groups[it.look.style] ??= []).push(it);
    const gl = Object.entries(groups);
    const maxN = Math.max(...gl.map(([, v]) => v.length));
    const IW = CW * 2 + 4, GAP = 14;
    const RH = CH + 48;
    const [c, ctx] = canvas(Math.max(1560, LW + maxN * (IW + GAP) + 20), top + gl.length * RH + 10);
    const isW = slot === 'weapon';
    header(ctx, `ref_equip_${slot} — ${slot} の全スタイル（chars/equip/${slot}/<style>_<f|m>_gray.png）`, `表示 2倍 ＝ 納品サイズ。1スタイル × 性別 = 1ファイル${slot === 'top' ? '（＋手前の袖 _sleeve_*）' : slot === 'accessory' ? '（＋背面 _back_*）' : ''}。色違いは tint: color で付く（グレースケールで描く）。${isW ? '各アイテム: 左 idle / 右 attack' : '各アイテム: 左 ♀ / 右 ♂（マネキン。他の部位は既定）'}`);
    gl.forEach(([style, list], r) => {
      const y = top + r * RH;
      text(ctx, style, 12, y + 40, { size: 20, bg: null });
      text(ctx, `${style}_f / ${style}_m`, 12, y + 70, { size: 13, color: SUB, bg: null, bold: false });
      const p = pri[`${slot}:${style}`] || 'B';
      text(ctx, `優先度 ${p}`, 12, y + 92, { size: 14, color: p === 'S' ? '#ff4fa0' : p === 'A' ? '#ffd23f' : SUB, bg: null });
      text(ctx, `色違い ${list.length} 種`, 12, y + 114, { size: 13, color: SUB, bg: null, bold: false });
      list.forEach((it, i) => {
        const x = LW + i * (IW + GAP);
        for (let j = 0; j < 2; j++) {
          const cx = x + j * (CW + 4);
          cell(ctx, cx, y, CW, CH, AX, AY);
          const g = isW ? 'f' : j ? 'm' : 'f';
          const anim = isW && j ? { state: 'attack', attackT: 0.35 } : { state: 'idle', t: 0.3 };
          clipDo(ctx, cx, y, CW, CH, () => drawChar(ctx, cx + AX, y + AY, S, MANNEQUIN[g], { [slot]: it.look }, anim));
        }
        text(ctx, it.id, x, y + CH + 4, { size: 13, color: RAR[it.rarity] || TXT });
        const w2 = text(ctx, `${it.rarity} Lv${it.reqLevel}`, x, y + CH + 24, { size: 11, color: SUB, bold: false });
        // 主色 / 差し色
        [it.look.color, it.look.accent].forEach((col, k) => {
          const sx = x + w2 + 16 + k * 92;
          ctx.fillStyle = col; ctx.fillRect(sx, y + CH + 24, 14, 14); ctx.strokeStyle = '#000'; ctx.strokeRect(sx + 0.5, y + CH + 24.5, 13, 13);
          text(ctx, col, sx + 18, y + CH + 24, { size: 11, color: SUB, bold: false, bg: null });
        });
      });
    });
    return c;
  }

  // ------------------------------------------------------------ 敵（地域別）
  function fakeEnemy(def, o) {
    return { def, x: 0, y: 0, w: def.w, h: def.h, t: 0.3, state: 'idle', hp: 100, maxHp: 100, facing: 1, flying: def.ai === 'flyer', onGround: true, seed: 20261005, game: null, boss: !!def.boss, hurtT: 0, ...o };
  }
  const ESTATES = [
    ['idle', { state: 'idle', t: 0.3 }], ['walk', { state: 'walk', t: 0.45, vx: 40 }], ['windup（溜め）', { state: 'attack', phase: 'windup', t: 0.1 }],
    ['attack', { state: 'attack', phase: 'attack', hasActed: true, t: 0.2 }], ['hurt', { state: 'hurt', t: 0.1 }],
  ];
  function drawEnemyAt(ctx, x, y, s, def, o) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    try { M.ea.drawEnemy(ctx, fakeEnemy(def, o)); } catch (err) { ctx.fillStyle = '#f00'; ctx.fillText('ERR ' + err.message, 0, 0); }
    ctx.restore();
  }
  function enemies(region, list) {
    const S = 2, top = 120, MAXW = 2300, GAP = 22;
    // レイアウト（ブロック = ラベル＋5状態）
    const blocks = list.map((d) => { const [cw, ch] = d.cell; return { ...d, bw: ESTATES.length * (cw + 4), bh: ch + 74 }; });
    const pos = []; let x = 16, y = top, rowH = 0, W = 0;
    for (const b of blocks) {
      if (x + b.bw > MAXW && x > 16) { x = 16; y += rowH + GAP; rowH = 0; }
      pos.push([x, y]); x += b.bw + GAP; rowH = Math.max(rowH, b.bh); W = Math.max(W, x);
    }
    const [c, ctx] = canvas(Math.max(W, 1300), y + rowH + 20);
    const RJ = { beach: 'ビーチ', downtown: 'ダウンタウン', slums: 'スラム/港', swamp: 'スワンプ', casino: 'カジノ', rooftop: '摩天楼', spaceport: '宇宙港', town: '町の市民', police: '警察' };
    header(ctx, `ref_enemies_${region} — ${RJ[region] || region} の敵 ${list.length} 種（enemies/<id>.png）`, `表示 2倍 ＝ 納品サイズ。枠 = テンプレートのセル、桃色の十字 = 基準点（足元）。右向き。ボスは ref_bosses.png。黄色の枠 = 優先度A（その art の代表）${region === 'town' ? '。※市民は差し替え対象外（参考のみ）' : ''}`);
    blocks.forEach((b, i) => {
      const [bx, by] = pos[i];
      const def = M.en.ENEMIES[b.id];
      const pc = b.pri === 'A' ? '#ffd23f' : SUB;
      text(ctx, b.id, bx, by, { size: 17, color: b.pri === 'A' ? '#ffd23f' : TXT });
      text(ctx, `${b.name}  Lv${def.level}  art=${def.art}  ${b.flyer ? '飛行 ' : ''}画面上 約${b.drawn[0]}×${b.drawn[1]}px  セル ${b.cell[0]}×${b.cell[1]}  優先度 ${b.pri}${def.night ? '  夜' : ''}`, bx, by + 24, { size: 12, color: pc, bold: false });
      const [cw, ch] = b.cell;
      ESTATES.forEach(([n, o], k) => {
        const cx = bx + k * (cw + 4), cy = by + 48;
        const [ax, ay] = b.anchor || [cw / 2, ch - 8];
        cell(ctx, cx, cy, cw, ch, ax, ay, b.pri === 'A' ? { fill: '#3a2f48' } : {});
        clipDo(ctx, cx, cy, cw, ch, () => drawEnemyAt(ctx, cx + ax, cy + ay, S, def, o));
        text(ctx, n, cx + 4, cy + 4, { size: 11, bold: false, bg: 'rgba(10,6,20,0.6)' });
      });
      if (b.pri === 'A') { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.strokeRect(bx - 6, by - 6, b.bw + 8, b.bh + 4); }
    });
    return c;
  }

  // ------------------------------------------------------------ ボス
  function bosses(list) {
    const S = 1.5, top = 120, LW = 300;
    const cols = [['通常 idle', { state: 'idle', t: 0.3 }], ['通常 windup（溜め）', { state: 'attack', phase: 'windup', t: 0.15 }], ['第2形態 idle2（HP50%以下）', { state: 'idle', t: 0.3, hp: 30 }], ['第2形態 attack2', { state: 'attack', phase: 'attack', hasActed: true, t: 0.25, hp: 30 }]];
    const rows = list.map((b) => { const cw = Math.max(320, Math.ceil(b.drawn[0] * S * 1.35)); const ch = Math.ceil(b.drawn[1] * S * 1.3) + 90 + (b.flyer && b.drawn[1] < 150 ? 70 : 0); return { ...b, cw, ch }; });
    const W = LW + Math.max(...rows.map((r) => cols.length * (r.cw + 6))) + 20;
    const H = top + rows.reduce((a, r) => a + r.ch + 16, 0) + 10;
    const [c, ctx] = canvas(W, H);
    header(ctx, 'ref_bosses — ボス 7 体（bosses/<id>.png）通常 / 第2形態', '表示 1.5倍（納品は 2倍で描く。セルは ASSET_LIST 参照）。第2形態 = HP50%以下で使う行 idle2/walk2/windup2/attack2。上の名前札とHPバーはゲームが描く（描かなくてよい）');
    let y = top;
    for (const b of rows) {
      const def = M.en.ENEMIES[b.id];
      text(ctx, b.id, 12, y + 4, { size: 18, bg: null, color: '#ff4fa0' });
      text(ctx, `${b.name}`, 12, y + 30, { size: 17, bg: null });
      text(ctx, `${def.title || ''}  Lv${def.level}`, 12, y + 54, { size: 13, bg: null, color: SUB });
      text(ctx, `art=${def.art}  主色 ${def.color}`, 12, y + 74, { size: 13, bg: null, color: SUB, bold: false });
      text(ctx, `画面上 約${b.drawn[0]}×${b.drawn[1]}px`, 12, y + 94, { size: 13, bg: null, color: SUB, bold: false });
      text(ctx, `納品セル ${b.cell[0]}×${b.cell[1]}`, 12, y + 114, { size: 13, bg: null, color: SUB, bold: false });
      text(ctx, `手下: ${(def.summon || []).join(', ')}`, 12, y + 134, { size: 12, bg: null, color: SUB, bold: false });
      cols.forEach(([n, o], k) => {
        const cx = LW + k * (b.cw + 6);
        cell(ctx, cx, y, b.cw, b.ch, b.cw / 2, b.ch - 12, k >= 2 ? { fill: '#3a2238' } : {});
        const fy = b.flyer ? y + b.ch * 0.86 : y + b.ch - 12;
        clipDo(ctx, cx, y, b.cw, b.ch, () => drawEnemyAt(ctx, cx + b.cw / 2, fy, S, def, o));
        text(ctx, n, cx + 4, y + 4, { size: 12, bg: 'rgba(10,6,20,0.7)' });
      });
      y += b.ch + 16;
    }
    return c;
  }

  // ------------------------------------------------------------ PET
  function pets() {
    const S = 3, CW = 150, CH = 176, LW = 330, top = 120;
    const cols = [['idle', { state: 'idle', t: 0.3 }], ['walk', { state: 'walk', t: 0.2, moving: true }], ['fly', { state: 'fly', t: 0.4 }], ['pick（拾って喜ぶ）', { state: 'pick', t: 0.17 }], ['親密度Lv30（参考）', { state: 'idle', t: 0.3, affection: 30 }]];
    const pets = Object.values(M.items.ITEMS).filter((it) => it.slot === 'pet');
    const half = Math.ceil(pets.length / 2);
    const BW = LW + cols.length * (CW + 6) + 24, RH = CH + 14;
    const [c, ctx] = canvas(BW * 2, top + half * RH + 10);
    header(ctx, 'ref_pets — PET 10 種（pets/<style>.png）', '表示 3倍（納品は 2倍。セルと基準点はファイルごとに違う → ASSET_LIST.csv / テンプレート）。桃色の十字 = 足元。飛ぶPET は地面から浮いた位置に描く。親密度のオーラ・ハートはゲームが重ねる（リボン・王冠はスプライト版では今は出ない）');
    for (let k = 0; k < 2; k++) cols.forEach(([n], i) => text(ctx, n, k * BW + LW + i * (CW + 6) + CW / 2, top - 26, { align: 'center', size: 13 }));
    pets.forEach((p, idx) => {
      const k = idx < half ? 0 : 1, r = idx % half, bx = k * BW, y = top + r * RH;
      const st = p.look.style;
      text(ctx, st, bx + 12, y + 8, { size: 19, bg: null, color: '#ff4fa0' });
      text(ctx, `${p.name.replace(/^ペット:\s*/, '')}（${p.id}）`, bx + 12, y + 36, { size: 15, bg: null });
      const desc = p.desc || '';
      text(ctx, desc.slice(0, 20), bx + 12, y + 60, { size: 12, bg: null, color: SUB, bold: false });
      if (desc.length > 20) text(ctx, desc.slice(20, 40), bx + 12, y + 78, { size: 12, bg: null, color: SUB, bold: false });
      text(ctx, `主色 ${p.look.color} / 差し色 ${p.look.accent}${M.pe.PET_FLYING[st] ? ' / 飛行' : ''}`, bx + 12, y + 100, { size: 12, bg: null, color: SUB, bold: false });
      cols.forEach(([, a], i) => {
        const x = bx + LW + i * (CW + 6);
        cell(ctx, x, y, CW, CH, CW / 2, CH - 9);
        clipDo(ctx, x, y, CW, CH, () => { ctx.save(); ctx.translate(x + CW / 2, y + CH - 9); ctx.scale(S, S); M.pe.drawPet(ctx, 0, 0, p.look, { facing: 1, ...a }); ctx.restore(); });
      });
    });
    return c;
  }

  // ------------------------------------------------------------ 配色見本
  function palette(data) {
    const [c, ctx] = canvas(2100, 2240);
    header(ctx, 'ref_palette — 配色見本（HEX）', 'ゲームのデータから抽出。主人公の既定色 / 地域の空・地面・ネオン・敵の主色 / レア度 / 職のオーラ色 / 共通（輪郭線など）');
    const sw = (x, y, col, label, w = 120) => {
      ctx.fillStyle = col; ctx.fillRect(x, y, w, 40); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 39);
      text(ctx, col, x, y + 44, { size: 12, bg: null, bold: true });
      if (label) text(ctx, label, x, y + 60, { size: 11, bg: null, color: SUB, bold: false });
    };
    let y = 96;
    const sec = (s) => { text(ctx, s, 16, y, { size: 20, bg: null, color: '#ff4fa0' }); y += 32; };
    sec('主人公（DEFAULT_LOOKS と初期装備の色）');
    for (const h of HEROES()) {
      text(ctx, `${h.cid} ${GJ[h.g]} ${h.name}`, 16, y + 10, { size: 15, bg: null });
      let x = 190;
      for (const k of ['skin', 'hairColor', 'hairShadow', 'hairHi', 'hairTip', 'eyeColor', 'tie', 'mesh', 'rim']) if (h.look[k]) { sw(x, y, h.look[k], k, 96); x += 104; }
      x += 16;
      for (const [slot, id] of Object.entries(h.eqIds)) if (id && slot !== 'pet') { const l = lookOf(id); sw(x, y, l.color, `${slot} 主`, 70); sw(x + 74, y, l.accent, '差し', 50); x += 134; }
      y += 84;
    }
    y += 10; sec('地域（空のグラデ 上→下 / 地面 / 足場 / ネオン / 敵の主色）');
    for (const r of data.regions) {
      text(ctx, r.id, 16, y + 4, { size: 15, bg: null }); text(ctx, r.ja, 16, y + 26, { size: 12, bg: null, color: SUB, bold: false });
      let x = 190;
      r.sky.forEach((col, i) => { sw(x, y, col, i === 0 ? '空・上' : i === r.sky.length - 1 ? '空・下' : '', 84); x += 88; });
      x += 12;
      for (const [k, col] of Object.entries(r.tile)) { sw(x, y, col, k, 84); x += 88; }
      x += 12;
      for (const col of r.enemyCols.slice(0, 9)) { sw(x, y, col, '', 50); x += 54; }
      y += 84;
    }
    y += 10; sec('レア度（装備の名前・光・トリム）');
    let x = 16;
    for (const [k, v] of Object.entries(M.loot.RARITY)) { sw(x, y, v.color, `${k} ${v.name}`, 150); if (v.glow) sw(x, y + 80, v.glow, 'glow', 150); x += 170; }
    y += 170; sec('職のオーラ色（系統色 → 1次〜4次）');
    for (const b of Object.values(M.jobs.JOB_BRANCHES)) {
      text(ctx, `${b.name}（${b.hero}）`, 16, y + 10, { size: 14, bg: null });
      sw(240, y, b.color, '系統色', 110);
      let xx = 380;
      for (const j of Object.values(M.jobs.JOBS).filter((j) => j.branch === b.id).sort((a, c2) => a.tier - c2.tier)) { if (j.aura) sw(xx, y, j.aura, `${j.tier}次 ${j.name}`, 200); xx += 216; }
      y += 84;
    }
    y += 10; sec('共通');
    x = 16;
    for (const [col, l] of data.common) { sw(x, y, col, l, 150); x += 166; if (x > 1900) { x = 16; y += 84; } }
    return c;
  }

  // ------------------------------------------------------------ 実寸比較
  async function scale(data) {
    const W = 1560;
    const shot = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = data.shot; });
    const lineupH = 700;
    const [c, ctx] = canvas(W, 110 + lineupH + 40 + shot.height + 120);
    header(ctx, 'ref_scale — ゲーム画面上の実寸（等倍）', '上: 主人公・敵・ボス・PET を等倍で並べたもの（目盛り 10px）。下: 実プレイ画面（1280×720・等倍、枠と数字は見た目の大きさ）。納品はこの 2 倍で描く');
    // 目盛り
    const drawRow = (gy, items, label, maxH) => {
      ctx.fillStyle = '#3a3150'; ctx.fillRect(60, gy, W - 80, 2);
      for (let h = 0; h <= maxH; h += 10) {
        const yy = gy - h; ctx.fillStyle = h % 40 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(60, yy, W - 80, 1);
        if (h % 40 === 0 && h) text(ctx, `${h}px`, 54, yy - 8, { size: 11, align: 'right', bg: null, color: SUB, bold: false });
      }
      text(ctx, label, 64, gy + 8, { size: 13, bg: null, color: '#ffd23f' });
      let x = 90;
      for (const it of items) {
        ctx.font = `11px ${FONT}`;
        const w = Math.max(it.w, ctx.measureText(it.label).width + 10);
        const cx = x + w / 2;
        if (it.kind === 'hero') drawChar(ctx, cx, gy, 1, it.look, it.eq, { state: 'idle' });
        else if (it.kind === 'pet') { ctx.save(); M.pe.drawPet(ctx, cx, gy, it.look, { facing: 1, t: 0.3 }); ctx.restore(); }
        else drawEnemyAt(ctx, cx, it.flyer ? gy - 10 : gy, 1, M.en.ENEMIES[it.id], { state: 'idle', t: 0.3 });
        ctx.strokeStyle = 'rgba(255,79,160,0.5)'; ctx.strokeRect(cx - it.dw / 2 + 0.5, gy - it.dh + 0.5, it.dw, it.dh);
        text(ctx, it.label, cx, gy + 28, { size: 11, align: 'center', bold: false });
        text(ctx, `${it.dw}×${it.dh}`, cx, gy + 44, { size: 11, align: 'center', bold: false, color: SUB });
        x += w + 18;
      }
    };
    const heroesL = HEROES().map((h) => ({ kind: 'hero', look: h.look, eq: equipLooks(h.eqIds), w: 56, dw: 44, dh: 80, label: `${h.cid}${GJ[h.g]}` }));
    const petsL = Object.values(M.items.ITEMS).filter((it) => it.slot === 'pet').slice(0, 4).map((p) => ({ kind: 'pet', look: p.look, w: 44, dw: 30, dh: 36, label: p.look.style }));
    const enemyL = data.lineupEnemies.map((e) => ({ kind: 'enemy', id: e.id, flyer: e.flyer, w: Math.max(54, e.drawn[0] + 8), dw: e.drawn[0], dh: e.drawn[1], label: e.id }));
    drawRow(110 + 150, [...heroesL, ...petsL, ...enemyL.slice(0, 7)], '主人公 6・PET・敵（等倍）', 120);
    const bossL = data.lineupBosses.map((e) => ({ kind: 'enemy', id: e.id, flyer: e.flyer, w: e.drawn[0] + 10, dw: e.drawn[0], dh: e.drawn[1], label: e.id }));
    drawRow(110 + lineupH - 60, [heroesL[0], ...bossL], 'ボス 7（等倍）と主人公。上の名前札と HP バーはゲームが描く', 280);
    // 実プレイ画面
    const sy = 110 + lineupH + 40;
    ctx.drawImage(shot, 60, sy);
    ctx.strokeStyle = '#4a3f66'; ctx.strokeRect(60.5, sy + 0.5, shot.width - 1, shot.height - 1);
    for (const b of data.boxes) {
      const x = 60 + b.x - b.w / 2, y = sy + b.y - b.h;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.strokeRect(x, y, b.w, b.h); ctx.setLineDash([]);
      text(ctx, `${b.label} ${b.w}×${b.h}`, x, y - 20, { size: 12, color: '#ffd23f' });
    }
    text(ctx, `実プレイ画面（${data.shotInfo}）。`, 60, sy + shot.height + 12, { size: 14, bg: null, color: SUB, bold: false });
    text(ctx, '画面 1280×720 に対して主人公の高さ ≈ 80px（画面の約 1/9）。小さく表示されても形が読めるよう、太めの輪郭・はっきりした配色・大きな頭と目に。', 60, sy + shot.height + 34, { size: 14, bg: null, color: SUB, bold: false });
    return c;
  }

  window.__REF = { ready, heroes, faces, hair, equip, enemies, bosses, pets, palette, scale };
}

// ================================================================ Node 側
const REGION_JA = { beach: 'ビーチ', downtown: 'ダウンタウン', slums: 'スラム/港', swamp: 'スワンプ', casino: 'カジノ', rooftop: '摩天楼', spaceport: '宇宙港' };
const REGION_SKY = { // src/render/background.js REGION_SKY
  beach: ['#5b2a86', '#ff6f91', '#ffb86b', '#ffd98e'], downtown: ['#140a2e', '#3b1660', '#c2387a', '#ff6f91'], slums: ['#3a2340', '#8c4a4a', '#e08a4f', '#f2b06a'],
  swamp: ['#1e2b3a', '#3f5e5a', '#a8a86a', '#d8bd80'], casino: ['#0e0620', '#2a0b4a', '#6a1a6e', '#a02a7a'], rooftop: ['#07051a', '#1e1450', '#5a2d82', '#ff6f91'], spaceport: ['#0a1430', '#1c3a7a', '#4a7ab8', '#ffb07a'],
};
const REGION_TILE = { // src/render/background.js TILE（地面 / 足場 / ネオン）
  beach: { 地面: '#f4c98b', 足場: '#b9774a', 足場縁: '#7a4527', ネオン: '#ff4fa0' }, downtown: { 地面: '#2a2738', 足場: '#4a4560', 足場縁: '#8e86b0', ネオン: '#ff2e88' },
  slums: { 地面: '#5c5260', 足場: '#7a4e3a', 足場縁: '#4a2e22', ネオン: '#ff5e5e' }, swamp: { 地面: '#4b3b2a', 足場: '#6b4a2e', 足場縁: '#3a2616', ネオン: '#c8ff5a' },
  casino: { 地面: '#6e1238', 足場: '#e8dcc8', 足場縁: '#b89a5a', ネオン: '#ffd23f' }, rooftop: { 地面: '#2e2a40', 足場: '#3a3552', 足場縁: '#5d5880', ネオン: '#b45cff' },
  spaceport: { 地面: '#5a6488', 足場: '#6a7498', 足場縁: '#c8d0e8', ネオン: '#3ee6d2' },
};
const COMMON = [
  ['#2a1430', '輪郭線 OUTLINE'], ['#3a1c40', '内側の細線'], ['#3a3346', 'インナー上（タンク）'], ['#2a2633', 'インナー下（スパッツ）'], ['#2a0b3d', 'ダメージ数字の縁'],
  ['#ff4d6d', 'HP'], ['#4fa8ff', 'MP'], ['#ffd23f', 'EXP / クエスト'], ['#7cff9b', '所持金'], ['#ffc93c', '手配★ / ボスオーラ'], ['#ff4fa0', 'ネオン桃（基調）'], ['#3ee6d2', 'ネオン青緑（基調）'],
  ['#1f3a8a', '警官の紺'], ['#ff2e4d', 'パトランプ赤'], ['#2e7bff', 'パトランプ青'], ['#7fe9ff', 'ポータル'],
];

async function captureGameplay(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const press = async (key) => { await page.keyboard.down(key); await sleep(60); await page.keyboard.up(key); await frames(2); };
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await g(() => { try { localStorage.clear(); } catch { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.scene === 'title', null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.focus('#game');
  await press('Enter'); await frames(3);
  for (let i = 0; i < 4; i++) { await press('Enter'); await page.waitForTimeout(200); }
  await page.waitForFunction(() => window.game.scene === 'play' && window.game.player, null, { timeout: 8000 });
  await g(() => { const G = window.game; G.debug.god = true; G.debug.warp('beach_f1'); });
  await frames(5); await page.waitForTimeout(800);
  await g(() => { const G = window.game; G.debug.setClock(18.2); for (let i = 0; i < 3; i++) G.debug.givePet(); });
  await g(() => { const G = window.game; for (const e of G.enemies) e.remove = true; G.enemies.length = 0; });
  for (const id of ['slime_green', 'crab_sand', 'flamingo', 'mushroom_orange', 'boss_king_slime']) await g((id) => window.game.debug.spawnEnemy(id), id);
  await page.waitForTimeout(1200);
  // 並べ直して止める
  const info = await g(() => {
    const G = window.game, p = G.player;
    const offs = { slime_green: 150, crab_sand: 220, flamingo: 300, mushroom_orange: -170, boss_king_slime: 470 };
    for (const e of G.enemies) { const o = offs[e.defId || e.def?.id]; if (o != null) { e.x = p.x + o; e.y = p.y; e.vx = 0; e.vy = 0; e.facing = -1; } }
    if (G.pet) { G.pet.x = p.x - 60; G.pet.y = p.y; }
    p.facing = 1;
    return { mapId: G.map.id };
  });
  await frames(2);
  await g(() => { window.game.paused = true; });
  await frames(4); await page.waitForTimeout(300);
  const boxes = await g(() => {
    const G = window.game, cam = G.cam, out = [];
    const p = G.player;
    out.push({ label: 'player', x: p.x - cam.x, y: p.y - cam.y, w: 44, h: 80 });
    if (G.pet) out.push({ label: 'pet', x: G.pet.x - cam.x, y: G.pet.y - cam.y, w: 30, h: 36, pet: true });
    for (const e of G.enemies) if (!e.dead && !e.remove) out.push({ label: e.defId || e.def?.id, x: e.x - cam.x, y: e.y - cam.y, id: e.defId || e.def?.id });
    return out;
  });
  const buf = await page.locator('#game').screenshot();
  await page.close();
  return { shot: 'data:image/png;base64,' + buf.toString('base64'), boxes, shotInfo: `マップ ${info.mapId}・夕方、通常の敵とボス「キングゼリー」、PET` };
}

async function main() {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const on = (k) => !want.length || want.includes(k);
  fs.mkdirSync(OUT, { recursive: true });
  const assets = buildAssetList();
  const pri = {};
  const rank = { S: 0, A: 1, B: 2 };
  for (const a of assets) {
    if (!a.kind.startsWith('equip-')) continue;
    const m = a.id.match(/^(\w+):(\w+?)(?:_sleeve|_back)?_[fm](?:@\w+)?$/);
    const k = m ? `${m[1]}:${m[2]}` : a.kind.slice(6) + ':' + a.id;   // テンプレート形式 / SPEC 形式
    if (!pri[k] || rank[a.pri] < rank[pri[k]]) pri[k] = a.pri;
  }
  const enemyPri = Object.fromEntries(assets.filter((a) => a.kind === 'enemy' || a.kind === 'boss').map((a) => [a.id, a.pri]));
  const man = loadTemplateManifest();
  const einfo = (e) => {
    const t = man && (man.enemies?.[e.id] || man.bosses?.[e.id]);
    const cell = t ? t.cell : cellFor(e);
    return { id: e.id, name: e.name, cell, anchor: t ? t.anchor : null, drawn: drawnSize(e), flyer: isFlyer(e), pri: enemyPri[e.id] || 'B' };
  };

  const pw = await loadPlaywright();
  const server = await startServer();
  const browser = await pw.chromium.launch();
  const written = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE + '/package.json');
    await page.addScriptTag({ content: `(${pageCode.toString()})();` });
    await page.evaluate(() => window.__REF.ready);
    const save = async (name, call, arg) => {
      const url = await page.evaluate(async ([call, arg]) => { const c = await window.__REF[call](...arg); return c.toDataURL('image/png'); }, [call, arg]);
      const file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      written.push(file); console.log('  wrote', path.relative(ROOT, file));
    };
    if (on('heroes')) await save('ref_heroes', 'heroes', []);
    if (on('faces')) await save('ref_faces', 'faces', []);
    if (on('hair')) await save('ref_hair', 'hair', []);
    if (on('equip')) for (const slot of ['hat', 'top', 'bottom', 'shoes', 'accessory', 'weapon']) await save(`ref_equip_${slot}`, 'equip', [slot, pri]);
    if (on('enemies')) {
      const groups = {};
      for (const e of Object.values(ENEMIES)) if (!e.boss) (groups[e.region] ??= []).push(einfo(e));
      for (const r of [...ENEMY_REGIONS, 'town', 'police']) if (groups[r]) await save(`ref_enemies_${r}`, 'enemies', [r, groups[r]]);
    }
    if (on('bosses')) await save('ref_bosses', 'bosses', [Object.values(ENEMIES).filter((e) => e.boss).map(einfo)]);
    if (on('pets')) await save('ref_pets', 'pets', []);
    if (on('palette')) {
      const regions = ENEMY_REGIONS.map((r) => ({ id: r, ja: REGION_JA[r], sky: REGION_SKY[r], tile: REGION_TILE[r], enemyCols: [...new Set(Object.values(ENEMIES).filter((e) => e.region === r && e.color).map((e) => e.color))] }));
      await save('ref_palette', 'palette', [{ regions, common: COMMON }]);
    }
    if (on('scale')) {
      const gp = await captureGameplay(browser);
      for (const b of gp.boxes) {
        if (b.id && ENEMIES[b.id]) { const [w, h] = drawnSize(ENEMIES[b.id]); b.w = w; b.h = h; }
      }
      const reps = ['slime_green', 'crab_sand', 'mushroom_orange', 'flamingo', 'thug_punk', 'gator_swamp', 'golem_steel'].map((id) => einfo(ENEMIES[id]));
      const bossL = Object.values(ENEMIES).filter((e) => e.boss).map(einfo);
      await save('ref_scale', 'scale', [{ ...gp, lineupEnemies: reps, lineupBosses: bossL }]);
    }
    if (errs.length) { console.log('ページのエラー:'); for (const e of errs.slice(0, 20)) console.log('  ', e); }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${written.length} 枚を書き出しました → ${path.relative(ROOT, OUT)}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
