// リグ（パーツ式）の配置図・下絵・仮のAI画像をブラウザ内で描くモジュール（tools/export_rig_templates.mjs と tests/rig_browser.mjs が使う）
//  window.RIGTOOL = { layout(g), template(slot, style, g), weaponLayout(), weaponTemplate(style), fake(kind, ...), used(slot, style, g) }
//  どれも PNG の dataURL を返す（used は使う枠の名前の配列）。
import { renderRigCode, renderRigWeapon } from '../src/render/character.js';
import { RIG_PARTS, RIG_W, RIG_H, RIG_S, RIG_GROUP_PARTS, RIG_BASE, RIG_SKIN_BASE, RIG_ACC_PARTS, WPN_W, WPN_H, WPN_S, WPN_BOX, GRIP_MARK } from '../src/render/rigLayout.js';
import { DEFAULT_LOOKS } from '../src/data/classes.js';

const LOOK = { f: { ...DEFAULT_LOOKS.luna.f, skin: RIG_SKIN_BASE.f }, m: { ...DEFAULT_LOOKS.jin.m, skin: RIG_SKIN_BASE.m } };
const mk = (w, h, bg) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } return [c, g]; };
const NAMES = { top: '上着', bottom: '下（パンツ・スカート）', shoes: '靴', hat: '帽子', accessory: 'アクセサリ', weapon: '武器', body: '素体', tear: '服破れ' };

/** そのスロット・スタイルの装備（基準色） */
function itemOf(slot, style) {
  const b = (RIG_BASE[slot] && RIG_BASE[slot][style]) || ['#cccccc', '#ffffff'];
  return { style, color: b[0], accent: b[1] };
}
function groupCanvas(group, g, equip, opts = {}) {
  const [c, x] = mk(RIG_W, RIG_H, opts.bg);
  renderRigCode(x, g, LOOK[g], equip, group, { scale: RIG_S, dmg: opts.dmg || 0, parts: opts.parts, clip: opts.clip != null ? opts.clip : 10 });
  return c;
}
/** 使う枠（コード描画で中身がある枠） */
function usedParts(slot, style, g) {
  const group = slot;
  const eq = slot === 'body' ? {} : { [slot]: itemOf(slot, style) };
  const c = groupCanvas(slot === 'body' ? 'body' : group, g, eq);
  const d = c.getContext('2d').getImageData(0, 0, RIG_W, RIG_H).data;
  const names = slot === 'accessory' ? RIG_ACC_PARTS[style] || [] : RIG_GROUP_PARTS[slot === 'body' ? 'body' : group];
  return names.filter((n) => {
    const b = RIG_PARTS[n];
    for (let y = b.y; y < b.y + b.h; y += 2) for (let x = b.x; x < b.x + b.w; x += 2) if (d[(y * RIG_W + x) * 4 + 3] > 40) return true;
    return false;
  });
}
function grayOf(src, alpha) {
  const [c, x] = mk(src.width, src.height);
  x.globalAlpha = alpha; x.filter = 'grayscale(1) brightness(1.15)';
  x.drawImage(src, 0, 0);
  return c;
}
function boxes(x, hi, opts = {}) {
  x.save();
  x.font = 'bold 18px sans-serif'; x.textBaseline = 'bottom';
  for (const n of Object.keys(RIG_PARTS)) {
    const b = RIG_PARTS[n];
    const on = !hi || hi.includes(n);
    x.setLineDash([10, 6]); x.lineWidth = on ? 3 : 1.5;
    x.strokeStyle = on ? '#3d8bff' : '#d0d0d8';
    x.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    x.setLineDash([]);
    x.fillStyle = on ? '#2a5fbf' : '#b8b8c4';
    if (opts.labels !== false) x.fillText(b.short + (on && hi ? '' : ''), b.x + 4, b.y - 2 < 18 ? b.y + 22 : b.y - 2);
    if (opts.pivots !== false && on) {
      x.strokeStyle = '#ff3d8b'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(b.px - 14, b.py); x.lineTo(b.px + 14, b.py); x.moveTo(b.px, b.py - 14); x.lineTo(b.px, b.py + 14); x.stroke();
      x.beginPath(); x.arc(b.px, b.py, 5, 0, 7); x.stroke();
    }
  }
  x.restore();
}
function title(x, t1, t2, y = 952) {
  x.save();
  x.fillStyle = '#2a1430'; x.font = 'bold 26px sans-serif'; x.textBaseline = 'alphabetic';
  x.fillText(t1, 24, y);
  if (t2) { x.font = '20px sans-serif'; x.fillStyle = '#555'; x.fillText(t2, 24, y + 34); }
  x.restore();
}
/** 全体の参考シルエット（素体＋コードの頭） */
function bodyRef(g) {
  const c = groupCanvas('body', g, {});
  const x = c.getContext('2d');
  renderRigCode(x, g, LOOK[g], {}, 'head', { scale: RIG_S, clip: true });
  return c;
}

/** ♀♂の配置図: 枠・支点の十字・パーツ名・薄い参考シルエット */
function layout(g) {
  const [c, x] = mk(RIG_W, RIG_H, '#ffffff');
  x.drawImage(grayOf(bodyRef(g), 0.28), 0, 0);
  boxes(x, null);
  title(x, `配置図（${g === 'f' ? '♀' : '♂'}） 1024×1024`, '青い点線の枠の中に描く ／ 桃色の十字＝回転の支点（肩・股・足首・首・腰）／ 腕と脚はまっすぐ下ろした形');
  return c.toDataURL('image/png');
}
const TEAR_DMG = { 1: 0.3, 2: 0.6, 3: 0.8 };
const TEAR_EQ = { top: { style: 'tshirt', color: '#f4f4f4', accent: '#ff3d7f' }, bottom: { style: 'jeans', color: '#3a5a8c', accent: '#c9d6ea' } };
/** 服破れの下絵（Tシャツ＋ジーンズの上に、その段階の破れ） */
function tearTemplate(n, g) {
  const [c, x] = mk(RIG_W, RIG_H, '#ffffff');
  x.drawImage(grayOf(groupCanvas('body', g, {}), 0.14), 0, 0);
  x.drawImage(grayOf(groupCanvas('top', g, TEAR_EQ), 0.2), 0, 0);
  x.drawImage(grayOf(groupCanvas('bottom', g, TEAR_EQ), 0.2), 0, 0);
  x.save(); x.globalAlpha = 0.75; x.drawImage(groupCanvas('tear', g, TEAR_EQ, { dmg: TEAR_DMG[n] }), 0, 0); x.restore();
  boxes(x, RIG_GROUP_PARTS.tear);
  title(x, `服破れ ${n}（${g === 'f' ? '♀' : '♂'}） HP ${[75, 50, 25][n - 1]}% 以下で服の上に重ねる`, '破れ穴（中はインナーの色 #3A3346）・すり傷・すす だけ ／ 服は描かない ／ 灰色の服は目安');
  return c.toDataURL('image/png');
}
/** アイテムの下絵: その装備のコード描画を枠に分解して薄く＋素体のシルエット */
function template(slot, style, g, opts = {}) {
  if (slot === 'tear') return tearTemplate(+style, g);
  const [c, x] = mk(RIG_W, RIG_H, '#ffffff');
  const used = slot === 'body' ? RIG_GROUP_PARTS.body : usedParts(slot, style, g);
  if (slot === 'body') {
    x.drawImage(grayOf(bodyRef(g), 0.18), 0, 0);
    x.save(); x.globalAlpha = 0.5; x.drawImage(groupCanvas('body', g, {}), 0, 0); x.restore();
  } else {
    x.drawImage(grayOf(groupCanvas('body', g, {}), 0.14), 0, 0);
    if (slot === 'hat' || slot === 'accessory') x.drawImage(grayOf(groupCanvas('head', g, {}, { clip: true }), 0.14), 0, 0);
    x.save(); x.globalAlpha = 0.5;
    x.drawImage(groupCanvas(slot, g, { [slot]: itemOf(slot, style) }), 0, 0);
    x.restore();
  }
  boxes(x, used);
  const base = slot === 'body' ? `肌 ${RIG_SKIN_BASE[g]}` : `基準色 ${RIG_BASE[slot][style].join(' / ')}`;
  title(x, `${NAMES[slot]}${slot === 'body' ? '' : '：' + style}（${g === 'f' ? '♀' : '♂'}）  ${base}`, `描く枠: ${used.map((n) => RIG_PARTS[n].short).join('・')} ／ 他の枠は空のまま ／ 薄い絵は位置と大きさの目安`);
  return c.toDataURL('image/png');
}
function weaponCanvas(style, color, accent, bg) {
  const [c, x] = mk(WPN_W, WPN_H, bg);
  renderRigWeapon(x, style, color, accent, WPN_S);
  return c;
}
function wBoxes(x) {
  const b = WPN_BOX;
  x.save();
  x.setLineDash([10, 6]); x.lineWidth = 3; x.strokeStyle = '#3d8bff'; x.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h); x.setLineDash([]);
  x.strokeStyle = '#ff3d8b'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(b.px - 18, b.py); x.lineTo(b.px + 18, b.py); x.moveTo(b.px, b.py - 18); x.lineTo(b.px, b.py + 18); x.stroke();
  x.beginPath(); x.arc(b.px, b.py, 6, 0, 7); x.stroke();
  x.fillStyle = '#2a5fbf'; x.font = 'bold 18px sans-serif'; x.fillText('持ち手（握る所）', b.px - 60, b.py + 44);
  x.restore();
}
function weaponLayout() {
  const [c, x] = mk(WPN_W, WPN_H, '#ffffff');
  x.drawImage(grayOf(weaponCanvas('katana', '#dfe4ee', '#d8283c'), 0.3), 0, 0);
  wBoxes(x);
  x.fillStyle = '#2a1430'; x.font = 'bold 22px sans-serif'; x.fillText('武器の配置図 1024×512：右向きに水平、握る所を十字に', 24, 24);
  return c.toDataURL('image/png');
}
function weaponTemplate(style) {
  const [c, x] = mk(WPN_W, WPN_H, '#ffffff');
  const b = RIG_BASE.weapon[style];
  x.save(); x.globalAlpha = 0.5; x.drawImage(weaponCanvas(style, b[0], b[1]), 0, 0); x.restore();
  wBoxes(x);
  x.fillStyle = '#2a1430'; x.font = 'bold 22px sans-serif'; x.fillText(`武器：${style}  基準色 ${b.join(' / ')}  （右向きに水平、握る所を十字に）`, 24, 24);
  return c.toDataURL('image/png');
}

/**
 * 仮のAI画像（コード描画のパーツを不透明でそのまま。テスト用）
 *  kind: 'body'|'top'|'bottom'|'shoes'|'hat'|'accessory'|'tear'|'weapon'
 *  opts: { bg: '#ffffff'（単色背景）| null（透明）, shift: [dx,dy]（全体をずらす px）, scale（全体の拡大）, color/accent（基準色以外で描く）,
 *          dmg（tear）, mark: true（武器の持ち手にマゼンタの印）, tint: '#rrggbb'（区別用に乗算） }
 */
function fake(kind, style, g, opts = {}) {
  if (kind === 'weapon') {
    const b = RIG_BASE.weapon[style];
    const src = weaponCanvas(style, opts.color || b[0], opts.accent || b[1]);
    const [c, x] = mk(WPN_W, WPN_H, opts.bg === undefined ? '#ffffff' : opts.bg);
    const k = opts.scale || 1, sh = opts.shift || [0, 0];
    x.translate(WPN_W / 2 + sh[0], WPN_H / 2 + sh[1]); x.scale(k, k); x.drawImage(src, -WPN_W / 2, -WPN_H / 2);
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.mark) { x.fillStyle = GRIP_MARK; x.beginPath(); x.arc(WPN_W / 2 + (WPN_BOX.px - WPN_W / 2) * k + sh[0], WPN_H / 2 + (WPN_BOX.py - WPN_H / 2) * k + sh[1], 6, 0, 7); x.fill(); }
    return c.toDataURL('image/png');
  }
  let src;
  if (kind === 'body') src = groupCanvas('body', g, {});
  else if (kind === 'tear') src = groupCanvas('tear', g, TEAR_EQ, { dmg: opts.dmg || TEAR_DMG[style] || 0.6 });
  else {
    const it = itemOf(kind, style);
    if (opts.color) it.color = opts.color;
    if (opts.accent) it.accent = opts.accent;
    src = groupCanvas(kind, g, { [kind]: it });
  }
  if (opts.tint) {
    const x = src.getContext('2d');
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.35; x.fillStyle = opts.tint; x.fillRect(0, 0, RIG_W, RIG_H);
  }
  const [c, x] = mk(RIG_W, RIG_H, opts.bg === undefined ? '#ffffff' : opts.bg);
  const k = opts.scale || 1, sh = opts.shift || [0, 0];
  if (k === 1) x.drawImage(src, sh[0], sh[1]);
  else {
    // 枠ごとに中心を基準に拡大（AI が少し大きく描いた想定）
    for (const n of Object.keys(RIG_PARTS)) {
      const b = RIG_PARTS[n];
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      x.save(); x.beginPath(); x.rect(b.x - 10, b.y - 10, b.w + 20, b.h + 20); x.clip();
      x.translate(cx + sh[0], cy + sh[1]); x.scale(k, k);
      x.drawImage(src, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
      x.restore();
    }
  }
  return c.toDataURL('image/png');
}

window.RIGTOOL = { layout, template, weaponLayout, weaponTemplate, fake, used: usedParts, ready: true };
