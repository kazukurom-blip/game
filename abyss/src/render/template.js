// 型紙（テンプレート画像）: 枠ごとに「どこに何を描けばよいか」を示す PNG。
// コードの絵のシルエット・基準点（足元・握り）・アンカー（手・頭…）・安全な範囲・向き・推奨サイズを描く。
// 画像の窓の「型紙」ボタンと tools/export_templates.mjs が使う。下の帯（文字）は AI に渡す前に切ってよい。

import { assets, makeCanvas } from './assets.js';
import { slotPrompt, ANCHOR_NAMES } from './manifest.js';

const FACING_TEXT = { right: '→ 右向き', left: '← 左向き（主人公の方を向く）', up: '↑ 先が上・柄が下', front: '正面', none: '' };
const BG_TEXT = { transparent: '背景は透明（無理なら単色の緑 #00FF00）', magenta: '背景は透明（無理なら単色のマゼンタ #FF00FF）', black: '背景は真っ黒 #000000（加算で黒が消える）', icon: '正方形いっぱいの暗い背景（枠なし）', scene: '画面いっぱいの風景', portrait: '背景つきでよい（暗い雰囲気）', keyart: '画面いっぱいの絵（文字なし）', layer: '下だけ絵・上は透明（無理なら単色の緑）' };
const ANCHOR_COL = { hand: '#3ad06a', offhand: '#3a9cff', head: '#ffd23a', back: '#c06aff', chest: '#ff8a3a' };

/**
 * 型紙を描いた canvas を返す。opts: { maxSide = 1024（絵の部分の長い辺）, band = true（下に説明の帯） }
 */
export function renderTemplate(id, opts = {}) {
  const spec = assets.spec(id) || { id, w: 128, h: 128, ax: 0.5, ay: 0.5 };
  const pr = slotPrompt(spec) || { bg: 'transparent', sizes: {}, aspect: '' };
  const maxSide = opts.maxSide || 1024;
  const k = maxSide / Math.max(spec.w, spec.h);
  const W = Math.round(spec.w * k); const H = Math.round(spec.h * k);
  const bandH = opts.band === false ? 0 : Math.max(150, Math.round(Math.min(W, 1100) * 0.2));
  const c = makeCanvas(Math.max(W, 560), H + bandH);
  const ctx = c.getContext('2d');
  const ox = Math.round((c.width - W) / 2);
  ctx.fillStyle = '#16131b'; ctx.fillRect(0, 0, c.width, c.height);
  // 背景
  ctx.save(); ctx.translate(ox, 0);
  if (pr.bg === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); } else if (['scene', 'icon', 'portrait', 'keyart'].includes(pr.bg)) { ctx.fillStyle = '#2a2630'; ctx.fillRect(0, 0, W, H); } else checker(ctx, W, H, Math.max(12, Math.round(maxSide / 20)));
  if (pr.bg === 'layer') { ctx.fillStyle = 'rgba(60,200,90,0.12)'; ctx.fillRect(0, 0, W, H * 0.5); }
  // コードの絵のシルエット
  const art = makeCanvas(W, H);
  if (art) {
    const ac = art.getContext('2d');
    assets.paintInto(ac, id, spec, k);
    if (!['scene', 'layer', 'portrait', 'keyart'].includes(pr.bg)) {
      // くっきりしたシルエットにする（ぼかしの光も形として見えるように、透明度で 2 値に）
      try {
        const id2 = ac.getImageData(0, 0, W, H); const d = id2.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 40 ? 255 : 0;
        ac.putImageData(id2, 0, 0);
      } catch { /* 読めない canvas はそのまま */ }
      ac.globalCompositeOperation = 'source-in'; ac.fillStyle = pr.bg === 'black' ? '#5a5a6a' : '#3a3550'; ac.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = ['scene', 'layer', 'portrait', 'keyart'].includes(pr.bg) ? 0.55 : 0.42;
    ctx.drawImage(art, 0, 0);
    ctx.globalAlpha = 1;
  }
  // 安全な範囲
  const m = spec.cat === 'icon' ? 0.1 : spec.cat === 'bg' || spec.cat === 'ui' ? 0.04 : 0.06;
  ctx.setLineDash([Math.max(6, W / 60), Math.max(4, W / 90)]);
  ctx.strokeStyle = 'rgba(255,90,90,0.9)'; ctx.lineWidth = Math.max(2, W / 400);
  ctx.strokeRect(W * m, H * m, W * (1 - 2 * m), H * (1 - 2 * m));
  ctx.setLineDash([]);
  const fs = Math.max(13, Math.round(Math.min(W, H) / 26));
  ctx.font = `bold ${fs}px "M PLUS 1p", "IPAGothic", "Hiragino Sans", sans-serif`;
  label(ctx, '安全な範囲（この中に収める）', W * m + 6, H * m + fs + 4, '#ff8a8a', fs);
  // 地面（足元が基準のとき）
  if (spec.ay >= 0.8 && spec.cat !== 'bg' && spec.cat !== 'ui') {
    ctx.strokeStyle = 'rgba(255,210,90,0.95)'; ctx.lineWidth = Math.max(2, H / 300);
    ctx.beginPath(); ctx.moveTo(0, H * spec.ay); ctx.lineTo(W, H * spec.ay); ctx.stroke();
    label(ctx, spec.kind === 'gear.weapon' ? '握る所の高さ' : '地面（足の裏をこの線に）', 8, H * spec.ay - 6, '#ffd25a', fs);
  }
  // 基準点
  cross(ctx, W * spec.ax, H * spec.ay, Math.max(10, W / 30), '#ff4040');
  const below = spec.ay < 0.85;
  label(ctx, spec.kind === 'gear.weapon' || spec.kind === 'gear.offhand' ? '基準点（握り）' : '基準点', W * spec.ax + 12, below ? H * spec.ay + fs + 6 : H * spec.ay - fs * 1.4, '#ff7070', fs);
  // アンカー
  for (const [name, a] of Object.entries(spec.anchors || {})) {
    const x = W * a[0]; const y = H * a[1]; const r = Math.max(6, W / 50);
    ctx.fillStyle = ANCHOR_COL[name] || '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(ctx, ANCHOR_NAMES[name] || name, x + r + 4, y + fs * 0.35, ANCHOR_COL[name] || '#fff', fs * 0.9);
  }
  // 向き
  const ft = FACING_TEXT[spec.facing || 'none'];
  if (ft) {
    ctx.font = `bold ${Math.round(fs * 1.1)}px "M PLUS 1p", "IPAGothic", "Hiragino Sans", sans-serif`;
    const fw = ctx.measureText(ft).width;
    ctx.font = `bold ${fs}px "M PLUS 1p", "IPAGothic", "Hiragino Sans", sans-serif`;
    const sw = ctx.measureText('安全な範囲（この中に収める）').width;
    const second = sw + fw + 24 > W * (1 - 2 * m);
    label(ctx, ft, W - fw - W * m - 6, H * m + fs + 4 + (second ? fs * 1.6 : 0), '#9ad0ff', fs * 1.1);
  }
  ctx.restore();
  // 説明の帯
  if (bandH) {
    const y0 = H + 8; const lh = Math.round(bandH / 5.6);
    ctx.fillStyle = '#0c0a10'; ctx.fillRect(0, H, c.width, bandH);
    ctx.fillStyle = '#d9b45a'; ctx.fillRect(0, H, c.width, 3);
    ctx.textBaseline = 'top';
    const line = (t, i, col = '#e9e2d4', b = false) => { ctx.font = `${b ? 'bold ' : ''}${Math.round(lh * 0.62)}px "M PLUS 1p", "IPAGothic", sans-serif`; ctx.fillStyle = col; ctx.fillText(t, 14, y0 + i * lh, c.width - 28); };
    line(`${spec.label || id}`, 0, '#f5d98a', true);
    line(`枠 ID: ${id}（ファイル名 ${id}.png）`, 1, '#c8c0b0');
    line(`ゲーム内 ${spec.w}×${spec.h}・比 ${pr.aspect || ''}・AI で作る大きさ GPT ${pr.sizes?.gpt || ''} / SDXL ${pr.sizes?.sdxl || ''} / MJ ${pr.sizes?.mj || ''}`, 2);
    line(`${BG_TEXT[pr.bg] || ''}${ft ? `・${ft}` : ''}${spec.blend === 'lighter' ? '・加算で重ねる' : ''}`, 3);
    line('灰色の形はコードの絵（位置の目安）。AI に渡すときは、この帯を切り取ってください。', 4, '#9a907f');
  }
  return c;
}

function checker(ctx, w, h, s) {
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    ctx.fillStyle = ((x / s + y / s) & 1) ? '#e4e4e8' : '#f6f6f8';
    ctx.fillRect(x, y, s, s);
  }
}

function cross(ctx, x, y, r, col) {
  ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
}

function label(ctx, t, x, y, col, fs) {
  ctx.save();
  ctx.font = `bold ${Math.round(fs)}px "M PLUS 1p", "IPAGothic", "Hiragino Sans", sans-serif`;
  ctx.lineWidth = Math.max(3, fs / 4); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y);
  ctx.restore();
}
