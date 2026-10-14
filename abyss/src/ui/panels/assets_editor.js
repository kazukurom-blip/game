// 画像の窓の「調整」: 1 つの枠に画像を入れて、ゲームでの見え方を合わせる。
// 入れ方: ファイルを選ぶ・この窓に落とす・Ctrl+V で貼り付け。
// 加工: 背景を抜く（四隅の色を自動／スポイトで色を選ぶ・許容値・つながった所だけ・閉じた穴・縁のなじませ）／黒を透明に（光の演出）、
//       切り抜き・透明な外側を切る・左右をつなげる（背景）・左右反転・コマ送り（横並び）。
// 置き方: 大きさ・ずらし・回転・重ね方。基準点（足元・握り）と体のアンカー（手・副手・頭・背中）は画像を押して置く。
// 調整中は「下書き」としてゲームに出る（戦闘の画面・試し表示）。保存すると IndexedDB に入る。閉じれば元に戻る。

import { h, button, clear } from '../dom.js';
import { assets, blobToImage, inspectImage, autoProc, processImage, detectAnchors, canvasToBlob, parseAssetFileName, procFromOpts, makeCanvas, resizeCanvas, FEET_KINDS, BOX_KINDS } from '../../render/assets.js';
import { slotPrompt, ANCHOR_NAMES, describeUnknown } from '../../render/manifest.js';
import { renderTemplate } from '../../render/template.js';
import { drawPreview, previewKind, showInBattle, zoneForAct } from './assets_preview.js';
import { copyText, downloadBlob, ensureRightsNotice, checker, FACING_JA, BLEND_JA, SOURCE_JA, installStudioCss, warnUnsaved } from './assets_util.js';
import { ACTS } from '../../data/world.js';

const ANCHOR_COL = { base: '#ff4040', hand: '#3ad06a', offhand: '#3a9cff', head: '#ffd23a', back: '#c06aff', chest: '#ff8a3a' };
let openCount = 0;
/** 調整の窓が開いているか（パネルの貼り付けと取り合わないように） */
export const editorOpen = () => openCount > 0;

/**
 * 調整の窓を開く。o: { file（すぐ入れる画像）, onClose（閉じたあと） }
 */
export async function openEditor(ui, id, o = {}) {
  installStudioCss();
  const spec = assets.spec(id) ? { ...assets.spec(id), id } : { id, w: 128, h: 128, ax: 0.5, ay: 0.5, cat: 'other', facing: 'none', label: describeUnknown(id) };
  if (!assets.slots.has(id) && assets.spec(id)) spec.label = describeUnknown(id);
  const kind = previewKind(spec);
  const prompt = slotPrompt(spec);
  const noAnchor = spec.cat === 'bg' || spec.cat === 'ui' || spec.cat === 'icon' || spec.kind === 'hero.portrait';
  const ground = spec.params?.layer === 'ground'; // 地面の帯（上の端が歩く面）
  const st = {
    file: null, raw: null, proc: { bg: 'none', trim: false }, opts: {}, processed: null, info: null, ins: null, dirty: false,
    sel: 'base', view: 'out', zoom: 1, pick: false, mode: 'auto', marks: true, existing: null, layout: null, ptab: 'en', timer: 0,
  };
  // 今の差し替えを読み込む（元の画像があれば加工し直せる）
  const ex = assets.studio.get(id) || assets.folder.get(id) || null;
  if (ex?.source === 'studio') {
    st.existing = 'studio';
    st.file = ex.orig || ex.blob;
    st.proc = ex.orig ? { ...(ex.proc || { bg: 'none' }) } : { bg: 'none', trim: false };
    st.opts = { ...(ex.opts || {}) };
    try { st.raw = await blobToImage(st.file); } catch { st.raw = ex.img; st.proc = { bg: 'none', trim: false }; }
  } else if (ex?.source === 'folder') {
    st.existing = 'folder';
    st.raw = ex.raw ? resizeCanvas(ex.raw, ex.raw.naturalWidth || ex.raw.width, ex.raw.naturalHeight || ex.raw.height) : ex.img;
    const fo = assets.folderList.find((e) => e.id === id)?.opts || {};
    st.proc = ex.proc ? { ...ex.proc } : procFromOpts(fo); // 読み込んだときの加工（自動の加工＋設定）
    st.opts = { ...(ex.opts || {}) };
  }
  if (st.raw) { st.ins = inspectImage(st.raw); const r = processImage(st.raw, st.proc, spec, { frames: st.opts.frames || 1, scale: st.opts.scale }); st.processed = r.canvas; st.info = r.info; }

  // ---------------- 部品
  const prev = h('canvas.ed-prev', { width: 640, height: 360 });
  const adj = h('canvas.ed-adj', { width: 400, height: 400 });
  const adjScroll = h('div.ed-adj-scroll', adj);
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg,image/gif,image/avif', style: { display: 'none' } });
  const info = h('div.ed-info');
  const warn = h('div');
  const coords = h('div.ed-note');
  const ctl = {};

  const range = (key, label, min, max, step, get, set, fmt = (v) => v) => {
    const val = h('span.val');
    const inp = h('input', { type: 'range', min, max, step });
    const sync = () => { const v = get(); inp.value = v; val.textContent = fmt(Number(v)); };
    inp.addEventListener('input', () => { set(Number(inp.value)); val.textContent = fmt(Number(inp.value)); });
    ctl[key] = sync;
    sync();
    return h('div.ed-row', [h('span.lab', label), inp, val]);
  };
  const check = (key, label, get, set, title) => {
    const inp = h('input', { type: 'checkbox' });
    inp.addEventListener('change', () => set(inp.checked));
    ctl[key] = () => { inp.checked = !!get(); };
    ctl[key]();
    return h('label', { title }, [inp, ` ${label}`]);
  };
  const select = (key, opts, get, set) => {
    const sel = h('select', { onchange: (e) => set(e.target.value) }, opts.map(([v, l]) => h('option', { value: v }, l)));
    ctl[key] = () => { sel.value = get(); };
    ctl[key]();
    return sel;
  };
  const syncAll = () => { for (const f of Object.values(ctl)) f(); };

  // ---------------- 加工・下書き
  const reprocess = (immediate = false) => {
    clearTimeout(st.timer);
    const run = () => {
      if (!st.raw) return;
      const r = processImage(st.raw, st.proc, spec, { frames: st.opts.frames || 1, scale: st.opts.scale });
      st.processed = r.canvas; st.info = r.info; st.dirty = true;
      assets.setDraft(id, st.processed, st.opts);
      drawAdjust(); updateInfo();
    };
    if (immediate) run(); else st.timer = setTimeout(run, 110);
  };
  const updateOpts = () => {
    st.dirty = true;
    if (st.processed) assets.setDraft(id, st.processed, st.opts);
    drawAdjust(); updateInfo();
  };
  const autoFeet = () => {
    if (!st.processed || !FEET_KINDS.has(spec.kind) || spec.params?.mon && spec.ay < 0.8) return false;
    const det = detectAnchors(st.processed, st.opts.frames || 1);
    if (!det.feet) return false;
    st.opts.ax = round3(det.feet.ax); st.opts.ay = round3(det.feet.ay);
    return true;
  };
  // 左右反転: 置いた基準点・アンカーも一緒に左右を入れ替える（足元・手が同じ所を指したまま）
  const mirrorPoints = () => {
    if (st.opts.ax !== undefined) st.opts.ax = round3(1 - st.opts.ax);
    if (st.opts.anchors) st.opts.anchors = Object.fromEntries(Object.entries(st.opts.anchors).map(([k, a]) => [k, [round3(1 - a[0]), a[1]]]));
  };
  const guessAll = () => {
    if (!st.processed) return;
    const det = detectAnchors(st.processed, st.opts.frames || 1);
    if (det.feet && FEET_KINDS.has(spec.kind)) { st.opts.ax = round3(det.feet.ax); st.opts.ay = round3(det.feet.ay); }
    if (spec.anchors && det.anchors) { st.opts.anchors = {}; for (const k of Object.keys(spec.anchors)) if (det.anchors[k]) st.opts.anchors[k] = det.anchors[k]; }
    updateOpts();
    ui.toast('足元とアンカーを推定しました。ずれていたら画像を押して直してください');
  };

  const loadFile = async (file) => {
    if (!file || !/^image\//.test(file.type || 'image/')) { ui.toast('画像のファイルを選んでください（PNG・WebP・JPEG）', 'bad'); return; }
    if (!(await ensureRightsNotice(ui))) return;
    let raw;
    try { raw = await blobToImage(file); } catch { ui.toast('画像を読めませんでした', 'bad'); return; }
    st.file = file; st.raw = raw; st.ins = inspectImage(raw);
    const pf = parseAssetFileName(file.name || '');
    if (pf?.frames) st.opts.frames = pf.frames;
    if (pf?.fps) st.opts.fps = pf.fps;
    st.proc = autoProc(spec, st.ins.transparent, st.ins.bg);
    if (spec.cat === 'fx' && !st.opts.blend) st.opts.blend = spec.blend || 'lighter';
    delete st.opts.ax; delete st.opts.ay; delete st.opts.anchors;
    reprocess(true);
    if (autoFeet()) updateOpts();
    syncAll();
    ui.toast(st.proc.bg === 'auto' ? '背景を自動で抜きました。残りがあれば「許容値」を上げてください' : st.ins.transparent && st.proc.trim ? '透明な画像です。透明な外側を切りました' : '画像を入れました。「保存して使う」で使えます');
  };
  fileIn.addEventListener('change', () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) loadFile(f); });

  // ---------------- 調整の画像（基準点・アンカー・スポイト）
  function effAnchor(name) {
    if (name === 'base') return [st.opts.ax ?? spec.ax, st.opts.ay ?? spec.ay];
    return st.opts.anchors?.[name] || spec.anchors?.[name] || null;
  }
  function drawAdjust() {
    const img = st.view === 'orig' ? st.raw : st.processed;
    const frames = st.view === 'orig' ? 1 : (st.opts.frames || 1);
    const base = 400; const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.round(base * dpr * st.zoom);
    const fw = img ? img.width / frames : spec.w; const fh = img ? img.height : spec.h;
    const Hh = Math.round(Math.min(W * 1.4, Math.max(W * 0.5, (W * fh) / fw)));
    adj.width = W; adj.height = Hh;
    adj.style.width = `min(${100 * st.zoom}%, ${Math.round(((400 * W) / Hh) * st.zoom)}px)`;
    adj.style.margin = '0 auto';
    const ctx = adj.getContext('2d');
    const isFx = spec.cat === 'fx' && (st.opts.blend || spec.blend) === 'lighter';
    if (isFx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, Hh); } else checker(ctx, W, Hh, Math.round(12 * dpr), '#3a3640', '#2c2832');
    const m = 0.06;
    const k = Math.min((W * (1 - 2 * m)) / fw, (Hh * (1 - 2 * m)) / fh);
    const dw = fw * k; const dh = fh * k; const ox = (W - dw) / 2; const oy = (Hh - dh) / 2;
    st.layout = { ox, oy, dw, dh, fw, fh, W, H: Hh };
    if (img) {
      if (isFx) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, 0, 0, fw, fh, ox, oy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.strokeRect(ox + 0.5, oy + 0.5, dw - 1, dh - 1); ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = 0.45;
      ctx.save(); ctx.translate(ox, oy); assets.paintInto(ctx, id, spec, k); ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f5d98a'; ctx.font = `${Math.round(13 * dpr)}px "M PLUS 1p", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('いまはコードの絵です。画像を入れると、ここで基準点を合わせられます', W / 2, Hh - 12 * dpr);
      ctx.textAlign = 'left';
    }
    if (st.view === 'out' && !noAnchor) {
      const b = effAnchor('base');
      ctx.strokeStyle = 'rgba(255,210,90,0.7)'; ctx.lineWidth = 1.5 * dpr;
      if (b[1] > 0.75) { ctx.beginPath(); ctx.moveTo(0, oy + b[1] * dh); ctx.lineTo(W, oy + b[1] * dh); ctx.stroke(); }
      const pts = [['base', b], ...Object.keys(spec.anchors || {}).map((n) => [n, effAnchor(n)])];
      for (const [name, a] of pts) {
        if (!a) continue;
        const x = ox + a[0] * dw; const y = oy + a[1] * dh; const r = (name === st.sel ? 10 : 7) * dpr;
        ctx.lineWidth = 4 * dpr; ctx.strokeStyle = '#000';
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
        ctx.lineWidth = 2 * dpr; ctx.strokeStyle = ANCHOR_COL[name] || '#fff';
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
        if (name === st.sel) { ctx.beginPath(); ctx.arc(x, y, r + 3 * dpr, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    if (st.pick) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 26 * dpr); ctx.fillStyle = '#ffd25a'; ctx.font = `bold ${Math.round(13 * dpr)}px "M PLUS 1p", sans-serif`; ctx.fillText('スポイト: 消したい背景の色の所を押してください', 8 * dpr, 18 * dpr); }
    const a = effAnchor(st.sel);
    coords.textContent = a ? `${st.sel === 'base' ? '基準点' : ANCHOR_NAMES[st.sel]}: 横 ${(a[0] * 100).toFixed(1)}%・縦 ${(a[1] * 100).toFixed(1)}%` : '';
  }
  const toImg = (ev) => {
    const r = adj.getBoundingClientRect();
    const L = st.layout; if (!L) return null;
    const x = ((ev.clientX - r.left) / r.width) * L.W; const y = ((ev.clientY - r.top) / r.height) * L.H;
    return { fx: (x - L.ox) / L.dw, fy: (y - L.oy) / L.dh };
  };
  let dragging = false;
  const place = (ev) => {
    const p = toImg(ev);
    if (!p) return;
    if (st.pick) {
      if (!st.raw) return;
      const px = Math.max(0, Math.min(st.raw.width - 1, Math.floor(p.fx * st.raw.width))); const py = Math.max(0, Math.min(st.raw.height - 1, Math.floor(p.fy * st.raw.height)));
      const c1 = makeCanvas(1, 1); const cx = c1.getContext('2d', { willReadFrequently: true }); cx.drawImage(st.raw, px, py, 1, 1, 0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      st.proc.bg = 'color'; st.proc.color = [d[0], d[1], d[2]]; st.pick = false; st.view = 'out';
      dragging = false;
      syncAll(); reprocess(true);
      return;
    }
    if (st.view === 'orig') { st.view = 'out'; syncAll(); drawAdjust(); return; }
    const v = [round3(Math.max(-0.5, Math.min(1.5, p.fx))), round3(Math.max(-0.5, Math.min(1.5, p.fy)))];
    if (st.sel === 'base') { st.opts.ax = v[0]; st.opts.ay = v[1]; } else { st.opts.anchors = { ...(st.opts.anchors || {}), [st.sel]: v }; }
    updateOpts();
  };
  adj.addEventListener('pointerdown', (ev) => { if (!st.processed && !st.pick) return; dragging = true; adj.setPointerCapture?.(ev.pointerId); place(ev); });
  adj.addEventListener('pointermove', (ev) => { if (dragging && !st.pick) place(ev); });
  adj.addEventListener('pointerup', () => { dragging = false; });

  // ---------------- 説明・注意
  function updateInfo() {
    clear(info); clear(warn);
    const src = assets.sourceOf(id);
    const lines = [];
    if (st.raw) {
      const ins = st.ins || { w: st.raw.width, h: st.raw.height, ratio: 0 };
      lines.push(`元の画像 ${ins.w}×${ins.h}（透明な所 ${(ins.ratio * 100).toFixed(0)}%）→ ゲーム用 ${st.processed?.width || 0}×${st.processed?.height || 0}${(st.opts.frames || 1) > 1 ? `（${st.opts.frames} コマ）` : ''}`);
      if (st.info?.bg && (st.proc.bg === 'auto' || st.proc.bg === 'color')) lines.push(h('span', ['背景の色 ', h('span.ed-swatch', { style: { background: `rgb(${st.info.bg.join(',')})` } }), ` rgb(${st.info.bg.join(', ')})・消した所 ${((st.info.removed / Math.max(1, (st.info.procW || 1) * (st.info.procH || 1))) * 100).toFixed(0)}%`]));
      const w = [];
      if (Math.min(ins.w, ins.h) < 256 && spec.cat !== 'icon') w.push('小さい画像です（短い辺が 256 px 未満）。ぼやけるときは大きく作り直してください。');
      // 背景の中景・地面は下の 2 隅が絵（地面）なので、抜く空の上の 2 隅だけ比べる
      const topAgree = (b) => Math.hypot(...b.corners[0].map((v, i) => v - b.corners[1][i])) < 30;
      if (st.proc.bg === 'auto' && st.ins?.bg && !(spec.cat === 'bg' ? topAgree(st.ins.bg) : st.ins.bg.agree)) w.push('四隅の色がそろっていません。「スポイト」で背景の色を押すと確実です。');
      if (st.info?.procW && st.info.removed / (st.info.procW * st.info.procH) > 0.97) w.push('ほとんど消えてしまいました。「許容値」を下げてください。');
      const ar = (st.processed?.width || 1) / (st.opts.frames || 1) / (st.processed?.height || 1);
      const want = spec.w / spec.h;
      if (spec.cat !== 'bg' && spec.cat !== 'ui' && (st.opts.frames || 1) === 1 && ar > Math.max(1.6, want * 2.5)) w.push(`横に長い画像です（推奨は ${spec.w}:${spec.h}）。横に並んだコマ送りなら「コマ送り」にコマ数を入れてください。`);
      if (spec.cat === 'fx' && (st.opts.blend || spec.blend) === 'lighter' && st.ins && !st.ins.transparent && st.proc.bg === 'none' && st.ins.bg && Math.max(...st.ins.bg.color) > 40) w.push('加算で重ねる演出は、黒い背景で作ると黒が消えます。背景が黒でないときは「背景を抜く」を使ってください。');
      for (const t of w) warn.append(h('div.ed-warn', `⚠ ${t}`));
    } else lines.push('まだ画像が入っていません（コードで描いた絵が出ています）。');
    if (src.source) lines.push(`いま使っている画像: ${SOURCE_JA[src.source] || src.source}${src.from ? `（予備の枠 ${src.from} から）` : ''}`);
    for (const l of lines) info.append(h('div', l));
  }

  // ---------------- 試し表示（動く）
  let alive = true;
  const t0 = performance.now();
  const loop = () => {
    if (!alive || !prev.isConnected) return;
    const ctx = prev.getContext('2d');
    try { drawPreview(ctx, prev.width, prev.height, spec, { state: ui.game.state, t: (performance.now() - t0) / 1000, mode: st.mode, anchors: st.marks }); } catch (e) { console.error('[preview]', e); alive = false; }
    requestAnimationFrame(loop);
  };

  // ---------------- 窓の中身
  const modeSel = ['hero', 'gear', 'monster', 'ally'].includes(kind) ? select('mode', [['auto', '動きを順番に'], ['idle', '待機'], ['walk', '歩く'], ['attack', '攻撃'], ...(kind === 'monster' || kind === 'ally' ? [['hurt', '被弾'], ['die', '倒れる']] : [['cast', '詠唱'], ['hurt', '被弾']])], () => st.mode, (v) => { st.mode = v; }) : null;
  const left = h('div.ed-col', [
    h('div.ed-box', [
      h('h4', ['試し表示', h('small', kind === 'fx' ? '暗い背景で、弾・当たり・範囲を動かします' : kind === 'bg' ? '3 枚を重ねて横に流します（点線が選んだ層）' : '実際の動き・大きさで表示します')]),
      prev,
      h('div.ed-row', [modeSel, ['hero', 'gear', 'monster', 'ally'].includes(kind) ? check('marks', '基準点・アンカーの印', () => st.marks, (v) => { st.marks = v; }) : null, button('戦闘画面で見る', () => lookInBattle(), { kind: 'small', title: '窓を一時的に隠して、戦闘の画面で見ます（下書きのまま）' })]),
    ]),
    noAnchor ? h('div.ed-box', [
      h('h4', ['画像の確かめ', h('small', 'スポイトで背景の色を選ぶときもここ')]),
      h('div.ed-row', [
        select('zoom', [['1', '等倍'], ['2', '2 倍'], ['3', '3 倍']], () => String(st.zoom), (v) => { st.zoom = Number(v); drawAdjust(); }),
        select('view', [['out', '加工後'], ['orig', '元の画像']], () => st.view, (v) => { st.view = v; drawAdjust(); }),
      ]),
      adjScroll,
      h('div.ed-note', ground ? '地面は幅を 1280 にそろえて横に並べ、帯の上の端を戦闘の地面の少し上（足元の 40 px 上）に置きます。上の透明な所は自動で切るので、歩く面が上の端に来ます。下が長すぎるときは「下を切る」で。'
        : spec.cat === 'bg' || spec.kind === 'ui.title' ? '背景は画像の左上を画面の左上に合わせ、幅を 1280 にそろえて横に並べます。上下の位置は「形」の「上を切る・下を切る」で合わせます。' : 'この枠の画像は、枠の中心に縦横比を保って収めて表示されます（基準点の調整はいりません）。余白は「透明な外側を切る」で取れます。'),
    ]) : h('div.ed-box', [
      h('h4', ['基準点とアンカー', h('small', '選んでから画像を押す（ドラッグで動かせる）')]),
      h('div.ed-anch', [['base', spec.cat === 'gear' && (spec.kind === 'gear.weapon' || spec.kind === 'gear.offhand' || spec.params?.slot === 'weapon') ? '基準点（握る所）' : FEET_KINDS.has(spec.kind) ? '基準点（足元）' : '基準点（中心）'], ...Object.keys(spec.anchors || {}).map((n) => [n, ANCHOR_NAMES[n] || n])].map(([n, l]) => h(`button.st-chip${st.sel === n ? '.on' : ''}`, { onclick: (e) => { st.sel = n; for (const b of e.currentTarget.parentElement.children) b.classList.remove('on'); e.currentTarget.classList.add('on'); drawAdjust(); } }, [h('i', { style: { background: ANCHOR_COL[n] || '#fff' } }), l]))),
      h('div.ed-row', [
        FEET_KINDS.has(spec.kind) ? button('足元を自動で', () => { if (autoFeet()) { updateOpts(); ui.toast('足元を合わせました'); } else ui.toast('先に画像を入れてください', 'bad'); }, { kind: 'small' }) : null,
        spec.anchors ? button('アンカーを推定', () => guessAll(), { kind: 'small' }) : null,
        button('既定に戻す', () => { delete st.opts.ax; delete st.opts.ay; delete st.opts.anchors; updateOpts(); }, { kind: 'small' }),
        select('zoom', [['1', '等倍'], ['2', '2 倍'], ['3', '3 倍']], () => String(st.zoom), (v) => { st.zoom = Number(v); drawAdjust(); }),
        select('view', [['out', '加工後'], ['orig', '元の画像']], () => st.view, (v) => { st.view = v; drawAdjust(); }),
      ]),
      adjScroll,
      coords,
      spec.kind === 'gear.helm' ? h('div.ed-note', '兜は主人公の「頭」のアンカーに重なります。体の画像を差し替えているときは兜は描かれません（体の画像に兜も描くか、鎧の姿の画像で表してください）。') : null,
      h('div.ed-note', spec.anchors ? '手（緑）に武器の握り、副手（青）に盾、頭（黄）に兜、背中（紫）に矢筒が付きます。試し表示を見ながら合わせてください。' : FEET_KINDS.has(spec.kind) ? '基準点は足の裏（地面に着く所）。ここが戦闘の地面の線に乗ります。' : spec.kind === 'gear.weapon' ? '基準点は握る所。手のアンカーにこの点が重なり、ここを中心に振ります。' : '基準点がゲームで置く位置になります。'),
    ]),
  ]);

  const drop = h('div.ed-drop', { onclick: () => fileIn.click() }, [h('b', '画像を入れる'), h('div', 'ここに画像を落とす・押して選ぶ・Ctrl+V で貼り付け'), h('div.dim.small', `推奨 ${spec.w}×${spec.h}（比 ${prompt?.aspect || ''}）・${FACING_JA[spec.facing] || '向きの決まりなし'}${spec.cat === 'fx' ? '・黒い背景で作る' : ''}`)]);
  const bgSel = select('bg', [['none', 'しない'], ['auto', '四隅の色を自動で抜く'], ['color', '色を選んで抜く（スポイト）'], ['black', '黒を透明に（光の演出）']], () => st.proc.bg || 'none', (v) => { st.proc.bg = v; if (v === 'color' && !st.proc.color) { st.pick = true; st.view = 'orig'; drawAdjust(); ui.toast('画像の背景の所を押してください'); } reprocess(true); });
  const right = h('div.ed-col', [
    h('div.ed-box', [drop, info, warn, fileIn]),
    h('div.ed-box', [
      h('h4', ['背景を抜く', h('small', 'AI の白・緑・単色の背景を透明に')]),
      h('div.ed-row', [h('span.lab', 'やり方'), bgSel, button('スポイト', () => { if (!st.raw) { ui.toast('先に画像を入れてください', 'bad'); return; } st.pick = true; st.view = 'orig'; syncAll(); drawAdjust(); }, { kind: 'small', title: '画像の上で消したい色を押す' })]),
      range('tol', '許容値', 4, 140, 1, () => st.proc.tol ?? 48, (v) => { st.proc.tol = v; if (st.proc.bg === 'none') st.proc.bg = 'auto'; ctl.bg(); reprocess(); }),
      range('feather', '縁のなじませ', 0, 4, 1, () => st.proc.feather ?? 2, (v) => { st.proc.feather = v; reprocess(); }, (v) => `${v} px`),
      h('div.ed-row', [
        check('contig', 'つながった所だけ', () => st.proc.contiguous !== false, (v) => { st.proc.contiguous = v; reprocess(true); }, '外側からつながった背景だけ消す（中の白い歯や宝石は残る）'),
        check('holes', '閉じた穴も消す', () => !!st.proc.holes, (v) => { st.proc.holes = v; reprocess(true); }, '腕と体のすきまなど、囲まれた背景も消す'),
      ]),
    ]),
    h('div.ed-box', [
      h('h4', ['形']),
      h('div.ed-row', [
        ground
          ? check('trim', '上の透明な所を切る', () => !!st.proc.trim, (v) => { st.proc.trim = v ? 'top' : false; reprocess(true); }, '歩く面が帯の上の端に来るように、上の透明な所（抜いた空）を切る')
          : check('trim', '透明な外側を切る', () => !!st.proc.trim, (v) => { st.proc.trim = v; reprocess(true); }, BOX_KINDS.has(spec.kind) ? '外側を切って、元の絵（コードの絵）と同じ大きさ・位置に置き直す' : '透明な外側を切る'),
        check('flip', '左右反転', () => !!st.proc.flip, (v) => { st.proc.flip = v; mirrorPoints(); reprocess(true); }, spec.facing === 'left' ? '敵は左向き。右向きの絵なら反転' : '向きが逆のときに'),
        spec.cat === 'fx' ? check('crush', 'ほぼ黒を真っ黒に', () => st.proc.crush !== false && (st.proc.crush || (st.opts.blend || spec.blend) === 'lighter'), (v) => { st.proc.crush = v; reprocess(true); }, '加算で四角い箱が見えるのを防ぐ') : null,
      ]),
      range('cropT', '上を切る', 0, 60, 1, () => st.proc.crop?.t || 0, (v) => { st.proc.crop = { ...(st.proc.crop || {}), t: v }; reprocess(); }, (v) => `${v}%`),
      range('cropB', '下を切る', 0, 60, 1, () => st.proc.crop?.b || 0, (v) => { st.proc.crop = { ...(st.proc.crop || {}), b: v }; reprocess(); }, (v) => `${v}%`),
      range('cropL', '左を切る', 0, 45, 1, () => st.proc.crop?.l || 0, (v) => { st.proc.crop = { ...(st.proc.crop || {}), l: v }; reprocess(); }, (v) => `${v}%`),
      range('cropR', '右を切る', 0, 45, 1, () => st.proc.crop?.r || 0, (v) => { st.proc.crop = { ...(st.proc.crop || {}), r: v }; reprocess(); }, (v) => `${v}%`),
      spec.cat === 'bg' ? range('seam', '左右をつなげる', 0, 25, 1, () => st.proc.seam || 0, (v) => { st.proc.seam = v; reprocess(); }, (v) => (v ? `${v}%` : 'しない')) : null,
      h('div.ed-row', [
        h('span.lab', 'コマ送り'),
        numIn('frames', 1, 32, () => st.opts.frames || 1, (v) => { st.opts.frames = Math.max(1, v | 0); reprocess(true); }), h('span.dim', 'コマ（横に並んだ画像）'),
        numIn('fps', 1, 30, () => st.opts.fps || spec.fps || 10, (v) => { st.opts.fps = Math.max(1, v | 0); updateOpts(); }), h('span.dim', 'コマ/秒'),
      ]),
    ]),
    h('div.ed-box', [
      h('h4', ['置き方']),
      range('scale', '大きさ', 0.3, 3, 0.05, () => st.opts.scale ?? 1, (v) => { st.opts.scale = v; updateOpts(); }, (v) => `×${v.toFixed(2)}`),
      range('ox', '横にずらす', -120, 120, 1, () => st.opts.ox || 0, (v) => { st.opts.ox = v; updateOpts(); }, (v) => `${v}`),
      range('oy', '縦にずらす', -120, 120, 1, () => st.opts.oy || 0, (v) => { st.opts.oy = v; updateOpts(); }, (v) => `${v}`),
      range('rot', '回転', -180, 180, 1, () => st.opts.rot || 0, (v) => { st.opts.rot = v; updateOpts(); }, (v) => `${v}°`),
      h('div.ed-row', [h('span.lab', '重ね方'), select('blend', Object.entries(BLEND_JA), () => st.opts.blend || spec.blend || 'source-over', (v) => { st.opts.blend = v; updateOpts(); })]),
      spec.kind === 'gear.weapon' ? h('div.ed-note', 'AI の武器が斜め 45 度なら「回転」を −45° 前後に。先が真上を向くようにします。') : null,
    ]),
    promptBox(ui, spec, prompt, st),
  ]);
  function numIn(key, min, max, get, set) {
    const inp = h('input', { type: 'number', min, max, step: 1 });
    inp.addEventListener('change', () => set(Number(inp.value)));
    ctl[key] = () => { inp.value = get(); };
    ctl[key]();
    return inp;
  }

  const content = h('div.studio-ed', [left, right]);
  openCount++;
  const title = `${spec.label}　${id}`;
  const close = () => { alive = false; openCount = Math.max(0, openCount - 1); document.removeEventListener('paste', onPaste); assets.clearDraft(id); showInBattle(null, 0); backBtn?.remove(); o.onClose?.(); };
  const md = ui.modal(title, content, [
    { label: '保存して使う', kind: 'primary', onclick: () => { save(); return false; } },
    { label: st.existing === 'studio' ? '入れた画像を消す（元に戻す）' : '入れた画像を捨てる', onclick: () => { reset(); return false; } },
    { label: '型紙を保存', onclick: () => { saveTemplate(ui, id); return false; } },
    { label: '閉じる', onclick: () => { tryClose(); return false; } },
  ], { wide: true, sticky: true, onClose: close });
  md.box.classList.add('studio');
  const wrap = md.box.parentElement;
  // この窓に画像を落とす・貼り付ける
  md.box.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  md.box.addEventListener('dragleave', () => drop.classList.remove('over'));
  md.box.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type)); if (f) loadFile(f); });
  const onPaste = (e) => {
    if (wrap.style.display === 'none') return;
    const f = [...(e.clipboardData?.items || [])].find((it) => it.kind === 'file' && /^image\//.test(it.type))?.getAsFile();
    if (f) { e.preventDefault(); loadFile(new File([f], f.name || `${id}.png`, { type: f.type })); }
  };
  document.addEventListener('paste', onPaste);
  if (st.processed && st.existing) { /* 今の画像のまま（下書きにしない） */ }
  syncAll(); drawAdjust(); updateInfo();
  requestAnimationFrame(loop);
  if (o.file) loadFile(o.file);

  // ---------------- 操作
  async function save() {
    if (!st.raw) { ui.toast('先に画像を入れてください', 'bad'); return; }
    if (!st.dirty && st.existing === 'studio') { ui.toast('変更はありません'); md.close(); return; }
    const file = st.file || (await canvasToBlob(st.raw));
    try {
      const saved = await assets.setCustom(id, file, st.opts, st.proc, { processed: st.processed, name: st.file?.name || '' });
      st.dirty = false;
      ui.toast(`「${spec.label}」を差し替えました`, 'good');
      if (!saved && assets.persistent !== false) warnUnsaved(ui);
      md.close();
      o.onSaved?.(id);
    } catch (e) { console.error(e); ui.toast(`保存できませんでした: ${e.message}`, 'bad'); }
  }
  async function reset() {
    if (st.existing === 'studio') {
      if (!(await ui.confirm(`「${spec.label}」に入れた画像を消して、${assets.folder.has(id) ? 'assets/custom の画像' : 'コードで描いた絵'}に戻します。`, '消す'))) return;
      await assets.removeCustom(id);
      ui.toast('元に戻しました', 'good');
      md.close();
      o.onSaved?.(id);
      return;
    }
    st.raw = null; st.file = null; st.processed = null; st.info = null; st.ins = null; st.dirty = false; st.opts = {}; st.proc = { bg: 'none', trim: false };
    assets.clearDraft(id);
    syncAll(); drawAdjust(); updateInfo();
  }
  async function tryClose() {
    if (st.dirty && !(await ui.confirm('保存していない調整があります。閉じますか？', '閉じる'))) return;
    md.close();
  }
  let backBtn = null;
  function lookInBattle() {
    const actId = spec.params?.act;
    if (kind === 'bg' && actId) {
      const zid = zoneForAct(ui.game.state, actId);
      const cur = ui.game.sys.world?.zone?.()?.act;
      if (!zid) { ui.toast('まだ行けない章です。試し表示で確かめてください', 'bad'); return; }
      if (cur !== actId) { ui.game.sys.world.travel(zid); ui.toast(`${ACTS.find((a) => a.id === actId)?.name || ''}へ移動しました`); }
    } else if (kind === 'icon') {
      ui.openPanel(id.startsWith('icon.skill') ? 'skills' : 'bag');
    } else if (kind === 'title' || kind === 'portrait') {
      ui.toast('タイトル画面で使われます。試し表示で確かめてください');
      return;
    } else showInBattle(id, 3600);
    wrap.style.display = 'none';
    const battle = document.getElementById('battle');
    battle?.classList.add('st-look');
    try { battle?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { /* 古いブラウザ */ }
    backBtn = button('◀ 調整に戻る', () => {
      wrap.style.display = ''; backBtn.remove(); backBtn = null; showInBattle(null, 0); battle?.classList.remove('st-look');
      if (kind === 'icon') ui.openPanel('assets');
    }, { kind: 'primary', class: 'studio-back' });
    document.body.append(backBtn);
  }
  return md;
}

function promptBox(ui, spec, pr, st) {
  if (!pr) return null;
  const ta = h('textarea.ed-prompt', { readonly: true });
  const tabs = [['en', '英語'], ['ja', '日本語'], ['mj', 'Midjourney'], ['neg', 'SD の否定']];
  const tabEls = tabs.map(([k, l]) => h(`button.st-chip${st.ptab === k ? '.on' : ''}`, { onclick: (e) => { st.ptab = k; for (const b of tabEls) b.classList.remove('on'); e.currentTarget.classList.add('on'); ta.value = pr[k] || ''; } }, l));
  ta.value = pr[st.ptab] || pr.en;
  return h('div.ed-box', [
    h('h4', ['AI で作る', h('small', '同じ決まり文を使うと絵柄がそろいます')]),
    h('div.ed-anch', tabEls),
    ta,
    h('div.ed-row', [
      button('コピー', async () => { const ok = await copyText(ta.value, ta); ui.toast(ok ? '指示文をコピーしました' : '上の文を選んでコピーしてください', ok ? 'good' : ''); }, { kind: 'small' }),
      button('型紙を見る', () => showTemplate(ui, spec.id), { kind: 'small' }),
    ]),
    h('div.ed-note', `作る大きさ: ChatGPT/GPT Image ${pr.sizes.gpt}・SDXL ${pr.sizes.sdxl}・FLUX ${pr.sizes.flux}・Midjourney ${pr.sizes.mj}${pr.sizeNote ? `（${pr.sizeNote}）` : ''}`),
    spec.note ? h('div.ed-note', `メモ: ${spec.note}`) : null,
  ]);
}

/** 型紙を PNG で保存（だめなら画像を表示して長押し・右クリックで保存してもらう） */
export async function saveTemplate(ui, id) {
  const c = renderTemplate(id, { maxSide: 1024 });
  const blob = await canvasToBlob(c);
  if (blob && downloadBlob(blob, `${id}.template.png`)) ui.toast('型紙を保存しました（保存されないときは「型紙を見る」から）', 'good');
  else showTemplate(ui, id);
}

export function showTemplate(ui, id) {
  const c = renderTemplate(id, { maxSide: 900 });
  let url = '';
  try { url = c.toDataURL('image/png'); } catch { url = ''; }
  ui.modal(`型紙: ${id}`, h('div', [
    url ? h('img', { src: url, alt: id, style: { width: '100%', height: 'auto', display: 'block', borderRadius: '6px' } }) : c,
    h('p.dim.small', '画像を長押し（スマホ）・右クリック（パソコン）で保存できます。灰色の形はコードの絵で、位置と大きさの目安です。'),
  ]), [{ label: '保存する', kind: 'primary', onclick: () => { saveTemplate(ui, id); return false; } }, { label: '閉じる' }], { wide: true });
}

const round3 = (v) => Math.round(v * 1000) / 1000;
