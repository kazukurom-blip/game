// パッシブの星座盤（ドラッグで動かす・ホイールとつまみで拡大縮小・点を押すと最短の道で振る・もう一度押すと外す）とパラゴン。
// 点にマウスを乗せると、振ったときの火力・耐久・戦力の変化を出す。検索で点を光らせる。構成を 2 つ保存できる。

import { h, button, injectCss } from '../dom.js';
import { TREE_NODES, TREE_NODE, TREE_START, THEME_NAMES, THEME_COLORS, KEYSTONE, PARAGON_BOARDS, PARAGON_LINE, TREE_FREE_RESPEC_LEVEL, CLASS_ANGLE } from '../../data/tree.js';
import { describeMod, statDef, aggregate } from '../../data/stats.js';
import { CLASS } from '../../data/classes.js';
import { BAL } from '../../data/balance.js';
import { fmt, fmtPct } from '../../engine/format.js';
import { tooltip } from '../tooltip.js';
import { heroPower } from '../../game/character.js';

let tab = 'tree';
const view = { scale: 0, cx: 0, cy: 0, cls: null };
let search = '';
let hoverId = null;
let hoverCache = { id: null, ver: -1, data: null };

const TYPE_NAMES = { start: '出発点', small: '小さな星', attr: '主能力の星', notable: '要の星', keystone: '要石' };
const NODE_R = { start: 15, small: 6.5, attr: 7.5, notable: 12, keystone: 17 };

const CSS = `
.tr-head { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.tr-pts { font-size:14px; } .tr-pts b { color:var(--gold2); font-size:20px; margin:0 2px; }
.tr-sub { font-size:11.5px; color:var(--dim); }
.tr-wrap { position:relative; border:1px solid var(--line2); border-radius:10px; overflow:hidden; background:#07060a; }
.tr-canvas { display:block; width:100%; height:520px; touch-action:none; cursor:grab; }
.tr-canvas.drag { cursor:grabbing; }
.tr-zoom { position:absolute; right:8px; top:8px; display:flex; flex-direction:column; gap:4px; }
.tr-zoom button { width:30px; height:30px; border-radius:6px; background:rgba(20,16,24,.85); border:1px solid var(--line2); color:var(--gold2); font-size:16px; cursor:pointer; }
.tr-legend { position:absolute; left:8px; bottom:6px; font-size:10.5px; color:var(--dim); pointer-events:none; text-shadow:0 0 3px #000; }
.tr-search { position:absolute; left:8px; top:8px; display:flex; gap:4px; }
.tr-search input { width:150px; font-size:12px; padding:4px 7px; background:rgba(12,10,15,.9); }
.tr-count { font-size:11px; color:var(--gold2); align-self:center; text-shadow:0 0 3px #000; }
.tr-tools { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; align-items:center; }
.tr-build { display:flex; gap:4px; align-items:center; border:1px solid var(--line); border-radius:7px; padding:3px 6px; background:#120f16; font-size:12px; }
.tr-ks { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
.tr-ks span { font-size:11.5px; border:1px solid #7a3a4a; color:#ffb0c0; background:#2a1018; border-radius:10px; padding:1px 8px; }
.tr-tip { background:#141019; border:1px solid var(--line2); border-radius:8px; padding:8px 10px; max-width:300px; font-size:12.5px; }
.tr-tip .nm { font-family:var(--serif); font-size:15px; font-weight:800; }
.tr-tip .ty { font-size:11px; color:var(--dim); margin-bottom:4px; }
.tr-tip .md { color:#8ab8ff; }
.tr-tip .ksd { color:#ffc0c8; margin:3px 0; line-height:1.45; }
.tr-tip .st { margin-top:5px; font-size:11.5px; }
.tr-tip .dl { display:flex; gap:10px; font-weight:700; margin-top:3px; }
.tr-tip .up { color:var(--good); } .tr-tip .down { color:var(--bad); } .tr-tip .same { color:var(--dim); }
.tr-sum { columns:2; column-gap:14px; font-size:11.5px; color:#c8c0b0; }
.tr-sum div { break-inside:avoid; }
.pg-board { border:1px solid var(--line); border-left:3px solid var(--bc); border-radius:8px; padding:8px 10px; margin-bottom:8px; background:linear-gradient(90deg, color-mix(in srgb, var(--bc) 10%, #120f16), #120f16 60%); }
.pg-board h4 { margin:0 0 4px; font-family:var(--serif); color:var(--bc); display:flex; justify-content:space-between; }
.pg-line { display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; padding:3px 0; border-top:1px solid #221d28; font-size:12.5px; }
.pg-line .v { color:var(--gold2); font-weight:700; min-width:70px; text-align:right; }
.pg-line .cap { font-size:10.5px; color:var(--dim); }
.pg-line .bt { display:flex; gap:3px; }
.pg-line .bt button { padding:1px 7px; font-size:11px; }
.pg-bar { height:3px; background:#241d2a; border-radius:2px; overflow:hidden; margin-top:2px; } .pg-bar > div { height:100%; background:var(--bc); }
@media (max-width: 900px) { .tr-canvas { height:min(78vw, 460px); } .tr-sum { columns:1; } }
`;

export const treePanel = {
  id: 'tree', name: 'パッシブ', icon: '✺',
  refreshOn: ['level', 'stats', 'gear'],
  visible: () => true,
  badge: (g) => (g.state.hero.tree?.points || 0) + (g.sys.tree?.paragonFree?.() || 0),
  help: '星座盤: レベルが 1 上がるごとに 1 点（10 レベルごとに +1）。点を押すと、振ってある点から一番近い道で振ります（道の長さぶん点を使う）。振ってある点を押すと外します（つながらなくなる点も一緒に外れる）。<br>要の星（名前のある大きな点）は強い効果、要石（赤い大きな点）はルールを変える効果と代償があります。<br>Lv 30 までは振り直しが無料、それ以降はゴールドがかかります。構成は 2 つまで保存できます。<br>パラゴン: Lv 100 からは経験値でパラゴンのレベルが上がり、1 つごとに 1 点。4 つの盤に振ります（主の線は上限なし、それ以外は 50 点まで）。',
  render(ui, el) {
    injectCss('tree', CSS);
    const g = ui.game;
    const free = g.sys.tree.paragonFree();
    el.append(h('div.tabs', [
      h(`button.tab${tab === 'tree' ? '.on' : ''}`, { onclick: () => { tab = 'tree'; ui.renderPanel(); } }, `星座盤（${g.state.hero.tree.points}）`),
      h(`button.tab${tab === 'paragon' ? '.on' : ''}`, { onclick: () => { tab = 'paragon'; ui.renderPanel(); } }, `パラゴン${g.state.hero.paragon.level ? `（Lv ${g.state.hero.paragon.level}${free ? `・${free}` : ''}）` : ''}`),
    ]));
    if (tab === 'paragon') renderParagon(ui, el); else renderTree(ui, el);
  },
};

// ======================================================================= 星座盤
function nodeLabel(n) {
  if (n.name) return n.name;
  const m = n.mods[0];
  return m ? statDef(m.s).name : '星';
}

function renderTree(ui, el) {
  const g = ui.game;
  const st = g.state;
  const sys = g.sys.tree;
  const t = st.hero.tree;
  const cls = st.hero.cls;
  if (view.cls !== cls || !view.scale) { const s = TREE_NODE[TREE_START[cls]]; view.cls = cls; view.scale = 0.34; view.cx = s.x * 0.8; view.cy = s.y * 0.8; }
  const cost = sys.respecCost();
  el.append(h('div.tr-head', [
    h('div', [h('div.tr-pts', ['残り ', h('b', String(t.points)), ' 点']), h('div.tr-sub', `振った点 ${sys.spent()}　次の追加の点 Lv ${Math.floor(st.hero.level / 10) * 10 + 10}　戦力 ${fmt(heroPower(g.H, st))}`)]),
    h('div.toolbar', [
      button(cost ? `振り直し（${fmt(cost)} G）` : `振り直し（Lv ${TREE_FREE_RESPEC_LEVEL} まで無料）`, async () => {
        if (!sys.spent()) { ui.toast('振ってある点がありません'); return; }
        if (!(await ui.confirm(`星座盤の点 ${sys.spent()} をすべて外して返します。${cost ? `${fmt(cost)} G かかります。` : ''}`, '振り直す'))) return;
        const r = sys.respec(); ui.toast(r.ok ? `${r.n} 点を返しました` : r.msg, r.ok ? 'good' : 'bad');
      }, { kind: 'small' }),
    ]),
  ]));
  // キャンバス
  const wrap = h('div.tr-wrap');
  const cv = h('canvas.tr-canvas');
  const input = h('input', { type: 'text', placeholder: '検索（例: ライフ・火炎・召喚）', value: search });
  const count = h('span.tr-count');
  wrap.append(cv,
    h('div.tr-search', [input, count]),
    h('div.tr-zoom', [
      h('button', { title: '拡大', onclick: () => zoomBy(1.25) }, '＋'),
      h('button', { title: '縮小', onclick: () => zoomBy(0.8) }, '－'),
      h('button', { title: '出発点へ', onclick: () => { const s = TREE_NODE[TREE_START[cls]]; view.cx = s.x; view.cy = s.y; view.scale = 0.5; draw(); } }, '◎'),
      h('button', { title: '全体を見る', onclick: () => { fitAll(); draw(); } }, '⛶'),
    ]),
    h('div.tr-legend', '押す: 振る／外す　ドラッグ: 動かす　ホイール・つまむ: 拡大'));
  el.append(wrap);
  // 構成
  el.append(h('div.tr-tools', t.builds.map((b, i) => h('div.tr-build', [
    h('b', `構成 ${i + 1}`), h('span.dim', b ? `${b.alloc.length - 1} 点` : '空き'),
    button('保存', () => { sys.saveBuild(i); ui.toast(`構成 ${i + 1} に保存しました`, 'good'); ui.renderPanel(); }, { kind: 'small' }),
    b ? button('使う', async () => {
      const toRemove = t.alloc.filter((id) => id !== TREE_START[cls] && !b.alloc.includes(id)).length;
      const c = sys.deallocCost(toRemove);
      if (c > 0 && !(await ui.confirm(`構成 ${i + 1} に振り直します（${fmt(c)} G）。`, '振り直す'))) return;
      const r = sys.loadBuild(i); ui.toast(r.ok ? (r.missing ? `点が足りず ${r.missing} 点ぶん振れませんでした` : `構成 ${i + 1} にしました`) : r.msg, r.ok ? 'good' : 'bad');
    }, { kind: 'small' }) : null,
  ]))));
  // 要石と合計
  const ks = sys.keystones();
  if (ks.length) el.append(h('h3.sec-title', '要石'), h('div.tr-ks', ks.map((k) => h('span', { title: k.desc }, k.name))));
  const mods = [];
  for (const id of t.alloc) for (const m of TREE_NODE[id].mods) if (!m.s.startsWith('ks_')) mods.push(m);
  const S = aggregate(mods);
  const keys = Object.keys(S).sort();
  el.append(h('h3.sec-title', `星座盤の効果の合計（${keys.length}）`), keys.length ? h('div.tr-sum', keys.map((k) => h('div', describeMod({ s: k, v: S[k] }, (x) => fmt(x))))) : h('p.hint', 'まだ何も振っていません。出発点のとなりの点から振れます。'));

  // ---- 描画
  const ctx = cv.getContext('2d');
  let W = 0; let Hh = 0;
  const resize = () => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    W = Math.max(200, r.width); Hh = Math.max(200, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const toScreen = (x, y) => [(x - view.cx) * view.scale + W / 2, (y - view.cy) * view.scale + Hh / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / view.scale + view.cx, (sy - Hh / 2) / view.scale + view.cy];
  const fitAll = () => { view.cx = 0; view.cy = 0; view.scale = Math.min(W, Hh) / 3100; };
  const clampScale = () => { view.scale = Math.max(0.1, Math.min(1.6, view.scale)); };
  function zoomBy(k, sx = W / 2, sy = Hh / 2) {
    const [wx, wy] = toWorld(sx, sy);
    view.scale *= k; clampScale();
    const [nx, ny] = toWorld(sx, sy);
    view.cx += wx - nx; view.cy += wy - ny;
    draw();
  }
  const q = () => search.trim().toLowerCase();
  const matches = (n) => {
    const s = q();
    if (!s) return false;
    const txt = `${n.name} ${n.mods.map((m) => statDef(m.s).name).join(' ')} ${THEME_NAMES[n.theme] || ''} ${n.ks ? KEYSTONE[n.ks]?.desc : ''}`.toLowerCase();
    return txt.includes(s);
  };
  let pulse = 0;
  let raf = 0;
  function draw() {
    if (!cv.isConnected) return;
    const alloc = new Set(t.alloc);
    const path = hoverId && !alloc.has(hoverId) ? new Set(sys.pathTo(hoverId) || []) : new Set();
    const removal = hoverId && alloc.has(hoverId) ? new Set(sys.removalSet(hoverId)) : new Set();
    ctx.clearRect(0, 0, W, Hh);
    // 背景
    const bg = ctx.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, Math.max(W, Hh) * 0.8);
    bg.addColorStop(0, '#15101c'); bg.addColorStop(1, '#050407');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);
    const [ox, oy] = toScreen(0, 0);
    ctx.strokeStyle = 'rgba(120,100,150,0.08)'; ctx.lineWidth = 1;
    for (const r of [230, 470, 900, 1310]) { ctx.beginPath(); ctx.arc(ox, oy, r * view.scale, 0, Math.PI * 2); ctx.stroke(); }
    // クラスの名前
    if (view.scale < 0.6) {
      ctx.font = `bold ${Math.round(Math.max(11, 26 * view.scale * 1.6))}px "Shippori Mincho B1", serif`;
      ctx.textAlign = 'center';
      for (const [c, a] of Object.entries(CLASS_ANGLE)) {
        const rr = 640;
        const [sx, sy] = toScreen(Math.cos(a * Math.PI / 180) * rr, Math.sin(a * Math.PI / 180) * rr);
        ctx.fillStyle = c === cls ? 'rgba(245,217,138,0.22)' : 'rgba(200,180,220,0.08)';
        ctx.fillText(CLASS[c].name, sx, sy);
      }
    }
    // 線
    const drawn = new Set();
    for (const n of TREE_NODES) {
      for (const l of n.links) {
        const key = n.id < l ? `${n.id}|${l}` : `${l}|${n.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const m = TREE_NODE[l];
        const a = alloc.has(n.id); const b = alloc.has(l);
        const [x1, y1] = toScreen(n.x, n.y); const [x2, y2] = toScreen(m.x, m.y);
        if ((x1 < -20 && x2 < -20) || (x1 > W + 20 && x2 > W + 20) || (y1 < -20 && y2 < -20) || (y1 > Hh + 20 && y2 > Hh + 20)) continue;
        let col = 'rgba(110,95,130,0.35)'; let lw = 1.5;
        if (a && b) { col = removal.has(n.id) || removal.has(l) ? 'rgba(255,90,90,0.9)' : 'rgba(245,205,120,0.95)'; lw = 3; }
        else if ((path.has(n.id) || a) && (path.has(l) || b) && (path.has(n.id) || path.has(l))) { col = 'rgba(110,230,255,0.9)'; lw = 3; }
        else if (a || b) { col = 'rgba(200,170,110,0.45)'; lw = 2; }
        ctx.strokeStyle = col; ctx.lineWidth = lw * Math.max(0.6, Math.min(1.4, view.scale * 2.2));
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    // 点
    let found = 0;
    const s = q();
    const zs = Math.max(0.55, Math.min(1.6, view.scale * 2.4));
    for (const n of TREE_NODES) {
      const [x, y] = toScreen(n.x, n.y);
      if (x < -30 || x > W + 30 || y < -30 || y > Hh + 30) { if (s && matches(n)) found++; continue; }
      const r = NODE_R[n.type] * zs;
      const col = THEME_COLORS[n.theme] || '#bbb';
      const on = alloc.has(n.id);
      const near = !on && n.links.some((l) => alloc.has(l)) && n.type !== 'start';
      const inPath = path.has(n.id);
      const rm = removal.has(n.id);
      ctx.save();
      if (on || n.type === 'keystone' || n.type === 'notable') {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r * (on ? 2.6 : 1.9));
        gr.addColorStop(0, on ? `${col}aa` : `${col}33`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * (on ? 2.6 : 1.9), 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath();
      if (n.type === 'attr') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
      else if (n.type === 'keystone') { for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2; const rr = i % 2 ? r * 0.62 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? (rm ? '#ff6a6a' : col) : inPath ? '#7fe8ff' : near ? '#2a2432' : '#16121b';
      ctx.fill();
      ctx.lineWidth = n.type === 'notable' || n.type === 'keystone' || n.type === 'start' ? 2.5 : 1.5;
      ctx.strokeStyle = on ? '#fff3c8' : inPath ? '#d8fbff' : near ? col : `${col}77`;
      ctx.stroke();
      if (n.type === 'start') { ctx.fillStyle = n.cls === cls ? '#fff' : '#555'; ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', x, y + 1); }
      if (s && matches(n)) {
        found++;
        ctx.strokeStyle = `rgba(255,240,120,${0.55 + 0.45 * Math.sin(pulse * 5)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r + 6 + 2 * Math.sin(pulse * 5), 0, Math.PI * 2); ctx.stroke();
      }
      if (n.id === hoverId) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
      if ((n.type === 'notable' || n.type === 'keystone') && view.scale >= 0.3) {
        ctx.font = `bold ${Math.round(Math.max(10, 11 * zs))}px "M PLUS 1p", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(n.name, x, y + r + 4);
        ctx.fillStyle = n.type === 'keystone' ? '#ffb0c0' : on ? '#ffe9a8' : '#d8cfc0'; ctx.fillText(n.name, x, y + r + 4);
      }
      ctx.restore();
    }
    count.textContent = s ? `${found} 件` : '';
    if (s && !raf) raf = requestAnimationFrame(loop);
  }
  function loop() { raf = 0; if (!cv.isConnected || !q()) return; pulse += 1 / 60; draw(); }
  input.addEventListener('input', () => { search = input.value; draw(); });

  // ---- 操作
  const pts = new Map();
  let dragging = false; let moved = 0; let pinch0 = null; let last = null;
  const nodeAt = (sx, sy) => {
    const [wx, wy] = toWorld(sx, sy);
    let best = null; let bd = Infinity;
    const zs = Math.max(0.55, Math.min(1.6, view.scale * 2.4));
    for (const n of TREE_NODES) {
      const d = Math.hypot(n.x - wx, n.y - wy) * view.scale;
      const lim = NODE_R[n.type] * zs + 7;
      if (d < lim && d < bd) { bd = d; best = n; }
    }
    return best;
  };
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, local(e));
    dragging = true; moved = 0; last = local(e);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.scale }; }
    cv.classList.add('drag');
  });
  cv.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [wx, wy] = toWorld(mid[0], mid[1]);
      view.scale = pinch0.s * (d / Math.max(10, pinch0.d)); clampScale();
      const [nx, ny] = toWorld(mid[0], mid[1]); view.cx += wx - nx; view.cy += wy - ny;
      moved = 99; draw(); return;
    }
    if (dragging && pts.size === 1 && last) {
      const dx = p[0] - last[0]; const dy = p[1] - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { view.cx -= dx / view.scale; view.cy -= dy / view.scale; tooltip.hide(); hoverId = null; draw(); }
      last = p;
      return;
    }
    const n = nodeAt(p[0], p[1]);
    const id = n?.id || null;
    if (id !== hoverId) { hoverId = id; draw(); }
    if (n && e.pointerType !== 'touch') showTip(ui, n, e.clientX, e.clientY);
    else if (!n) tooltip.hide();
  });
  const up = (e) => {
    const wasDrag = moved > 6;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (pts.size === 0) { dragging = false; cv.classList.remove('drag'); }
    if (!wasDrag && e.type === 'pointerup') {
      const p = local(e);
      const n = nodeAt(p[0], p[1]);
      if (n) clickNode(ui, n, e);
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!dragging) { hoverId = null; tooltip.hide(); draw(); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]); }, { passive: false });
  // 最初の描画（大きさが決まってから）
  requestAnimationFrame(() => { resize(); draw(); });
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => { if (!cv.isConnected) { ro.disconnect(); return; } resize(); draw(); }); ro.observe(cv); }
}

function clickNode(ui, n, e) {
  const g = ui.game;
  const sys = g.sys.tree;
  tooltip.hide();
  if (n.type === 'start') { ui.toast(n.cls === g.state.hero.cls ? 'ここが出発点です' : 'ほかのクラスの出発点です（通れません）'); return; }
  if (sys.isAllocated(n.id)) {
    const rm = sys.removalSet(n.id);
    const cost = sys.deallocCost(rm.length);
    const go = () => { const r = sys.deallocate(n.id); ui.toast(r.ok ? `${r.n} 点を外しました${r.cost ? `（${fmt(r.cost)} G）` : ''}` : r.msg, r.ok ? 'good' : 'bad'); };
    if (rm.length > 1 || cost > 0) ui.confirm(`「${nodeLabel(n)}」を外します。つながらなくなる点を含めて ${rm.length} 点が外れます。${cost ? `${fmt(cost)} G かかります。` : ''}`, '外す').then((ok) => { if (ok) go(); });
    else go();
    return;
  }
  const path = sys.pathTo(n.id);
  if (!path) { ui.toast('ここには道がつながっていません', 'bad'); return; }
  const r = sys.allocate(n.id);
  if (!r.ok) ui.toast(r.msg, 'bad');
  else if (n.type === 'keystone') ui.toast(`要石「${n.name}」を振った`, 'level');
  else if (n.type === 'notable') ui.toast(`要の星「${n.name}」を振った`, 'good');
}

function showTip(ui, n, mx, my) {
  const g = ui.game;
  const sys = g.sys.tree;
  const on = sys.isAllocated(n.id);
  const ver = `${g.state.hero.tree.alloc.length}:${g.state.hero.tree.points}:${g.state.hero.level}`;
  if (hoverCache.id !== n.id || hoverCache.ver !== ver) {
    let d = null;
    try { d = n.type === 'start' ? null : sys.previewDelta(n.id, on ? 'remove' : 'add'); } catch (e) { console.error(e); }
    hoverCache = { id: n.id, ver, data: d };
  }
  const d = hoverCache.data;
  const path = on ? null : sys.pathTo(n.id);
  const tip = h('div.tr-tip', [
    h('div.nm', { style: { color: n.type === 'keystone' ? '#ff8aa0' : THEME_COLORS[n.theme] } }, nodeLabel(n)),
    h('div.ty', `${TYPE_NAMES[n.type]}${n.theme && THEME_NAMES[n.theme] ? `・${THEME_NAMES[n.theme]}` : ''}`),
    n.type === 'keystone' ? h('div.ksd', KEYSTONE[n.ks]?.desc) : null,
    ...n.mods.filter((m) => !m.s.startsWith('ks_')).map((m) => h('div.md', describeMod(m, (x) => fmt(x)))),
    h('div.st', on ? (n.type === 'start' ? '出発点' : '振ってある（押すと外す）') : !path ? '道がつながっていない' : `あと ${path.length} 点で振れる（残り ${g.state.hero.tree.points} 点）`),
    d ? h('div.dl', [deltaEl('火力', d.dpsPct), deltaEl('耐久', d.ehpPct), h('span', { class: d.power >= d.powerBefore ? 'up' : 'down' }, `戦力 ${fmt(d.power)}`)]) : null,
    d && on && d.cost ? h('div.st.bad', `外すのに ${fmt(d.cost)} G`) : null,
  ]);
  tooltip.show(tip, { left: mx, right: mx + 12, top: my + 12, bottom: my + 12 });
}

function deltaEl(label, pct) {
  const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'same';
  const s = pct > 0.05 ? '▲' : pct < -0.05 ? '▼' : '＝';
  return h('span', { class: cls }, `${label} ${s}${fmtPct(Math.abs(pct), 1)}`);
}

// ======================================================================= パラゴン
function renderParagon(ui, el) {
  const g = ui.game;
  const st = g.state;
  const sys = g.sys.tree;
  const par = st.hero.paragon;
  const free = sys.paragonFree();
  const unlocked = st.hero.level >= BAL.MAX_LEVEL;
  el.append(h('div.tr-head', [
    h('div', [h('div.tr-pts', ['パラゴン Lv ', h('b', String(par.level)), `　残り ${free} 点`]), h('div.tr-sub', unlocked ? `次のパラゴンまで 経験値 ${fmt(par.xp)} / ${fmt(BAL.paragonXpToNext(par.level))}` : `主人公 Lv ${BAL.MAX_LEVEL} から、経験値でパラゴンのレベルが上がります（上限なし）`)]),
    h('div.toolbar', [
      button('おまかせで振る', () => { const n = sys.autoParagon(); ui.toast(n ? `${n} 点を振りました` : '振る点がありません', n ? 'good' : ''); }, { kind: 'small', disabled: !free }),
      button('全部戻す', async () => { if (!sys.paragonSpent()) return; if (await ui.confirm('パラゴンの点をすべて戻します（無料）。', '戻す')) sys.resetParagon(); }, { kind: 'small' }),
    ]),
  ]));
  const cls = CLASS[st.hero.cls];
  for (const b of PARAGON_BOARDS) {
    const box = h('div.pg-board', { style: { '--bc': b.color } }, [h('h4', [h('span', `${b.name}の盤`), h('span.dim', { style: { fontSize: '11px' } }, b.desc)])]);
    for (const l of b.lines) {
      const key = `${b.id}.${l.id}`;
      const L = PARAGON_LINE[key];
      const n = par.alloc[key] || 0;
      const statName = l.stat === 'primary' ? { str: '筋力', dex: '敏捷', int: '知力' }[cls.primary] : l.name;
      const val = l.per * (L.cap ? Math.min(n, L.cap) : n);
      const isFlat = l.stat === 'primary' || l.stat === 'vit';
      const room = sys.paragonRoom(key);
      box.append(h('div.pg-line', [
        h('div', [h('div', [statName, h('span.cap', L.cap ? `（${n}/${L.cap} 点・1 点 +${l.per}${isFlat ? '' : '%'}）` : `（${n} 点・上限なし・1 点 +${l.per}${isFlat ? '' : '%'}）`)]), L.cap ? h('div.pg-bar', h('div', { style: { width: `${(n / L.cap) * 100}%` } })) : null]),
        h('span.v', `+${Math.round(val * 100) / 100}${isFlat ? '' : '%'}`),
        h('div.bt', [
          button('－', () => sys.removeParagon(key, 1), { kind: 'small', disabled: !n }),
          button('+1', () => sys.addParagon(key, 1), { kind: 'small', disabled: !free || !room }),
          button('+10', () => sys.addParagon(key, 10), { kind: 'small', disabled: !free || !room }),
          button('最大', () => sys.addParagon(key, free), { kind: 'small', disabled: !free || !room }),
        ]),
      ]));
    }
    el.append(box);
  }
  if (!unlocked) el.append(h('p.hint', 'いまは見るだけです。Lv 100 になると、レベルの代わりにパラゴンのレベルが上がり、1 つごとに 1 点もらえます。'));
}
