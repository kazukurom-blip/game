#!/usr/bin/env node
// 画像の枠ごとの AI 用の指示文を docs/AI_PROMPTS.md と docs/AI_PROMPTS.csv に書き出す（manifest から自動）。
// 枠が増えたら（敵・スキル・ユニークなどを足したら）もう一度実行する。
//
// 使い方（abyss/ の中で）: node tools/gen_prompts.mjs [--out docs]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FACING = { right: '右向き', left: '左向き', up: '上向き（柄が下）', front: '正面', none: '—' };
const BG = { transparent: '透明（無理なら単色の緑 #00FF00）', magenta: '透明（無理なら単色のマゼンタ #FF00FF）', black: '真っ黒 #000000（加算）', icon: '暗いぼかし（正方形いっぱい）', scene: '画面いっぱいの風景', portrait: '暗い雰囲気の背景つき', keyart: '画面いっぱいの絵（文字なし）', layer: '下だけ絵・上は透明' };

export async function genPrompts({ outDir = path.join(ROOT, 'docs'), quiet = false } = {}) {
  const { buildManifest, loadOptionalSlots, slotPrompt, CATEGORIES, GROUPS } = await import('../src/render/manifest.js');
  const { STYLE_BIBLE, STYLE_FX, STYLE_BG, NEGATIVE } = await import('../src/render/prompts.js');
  const { assets } = await import('../src/render/assets.js');
  await loadOptionalSlots();
  const slots = buildManifest();
  assets.defineMany(slots);
  const md = [];
  const csv = [['id', 'category', 'group', 'label', 'w', 'h', 'ax', 'ay', 'facing', 'blend', 'background', 'aspect', 'gpt_size', 'sdxl_size', 'flux_size', 'midjourney_ar', 'prompt_en', 'prompt_ja', 'prompt_midjourney', 'negative', 'note']];
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, slots.filter((s) => s.cat === c.id).length]));
  md.push('# ABYSS DROP — AI で画像を作るための指示文（全部の枠）');
  md.push('');
  md.push('> このファイルは `node tools/gen_prompts.mjs` で自動で作っています（手で直さない）。表計算ソフトで扱うなら `docs/AI_PROMPTS.csv`。');
  md.push('> 使い方・差し替えの手順は [docs/ASSETS.md](ASSETS.md)。ゲームの「画像」の窓の「AI で作る」からも同じ文をコピーできます。');
  md.push('');
  md.push(`枠の数: **${slots.length}**（${CATEGORIES.map((c) => `${c.name} ${counts[c.id] || 0}`).join('・')}）`);
  md.push('');
  md.push('## 1. すべての指示文に入っている決まり');
  md.push('');
  md.push('画風をそろえるため、下の「画風の決まり文」を毎回そのまま入れています（途中で変えない）。');
  md.push('');
  md.push('| 種類 | 英語 | 日本語 |');
  md.push('|---|---|---|');
  md.push(`| キャラ・装備・アイコン | ${STYLE_BIBLE.en} | ${STYLE_BIBLE.ja} |`);
  md.push(`| 光の演出（fx.*） | ${STYLE_FX.en} | ${STYLE_FX.ja} |`);
  md.push(`| 背景（bg.*・タイトル） | ${STYLE_BG.en} | ${STYLE_BG.ja} |`);
  md.push('');
  md.push(`- 否定のプロンプト（Stable Diffusion・NovelAI）: \`${NEGATIVE}\``);
  md.push('- 向き: 主人公・召喚物・ペットは**右向き**、敵・ボスは**左向き**、武器は**先が上・柄が下**。逆に出たら画像の窓の「左右反転」で直せます。');
  md.push('- 背景: キャラ・装備・アイコンは**透明**（ChatGPT／GPT Image の透明背景）。透明にできない AI では**ムラのない単色の緑 #00FF00**（体が緑の敵はマゼンタ #FF00FF）にすると、画像の窓が自動で抜きます。光の演出は**真っ黒**（加算で黒が消える）。');
  md.push('- 既存のゲーム・アニメ・キャラ・作家の名前は入れないでください（似せた絵は権利の問題になります）。');
  md.push('');
  md.push('### AI ごとの使い方');
  md.push('');
  md.push('| AI | 使う文 | 大きさ | メモ |');
  md.push('|---|---|---|---|');
  md.push('| ChatGPT／GPT Image | 英語か日本語 | 各枠の「GPT」 | API なら `background: "transparent"`・`output_format: "png"`。透明背景が使える |');
  md.push('| Midjourney／Niji | Midjourney の文（CSV） | `--ar` が入っている | 背景は単色になるので、画像の窓で「背景を抜く」 |');
  md.push('| Stable Diffusion（SDXL 系） | 英語＋否定 | 各枠の「SDXL」 | シードを固定すると同じ画風で量産しやすい |');
  md.push('| FLUX | 英語 | 各枠の「FLUX」 | 否定の文は使えない。英語の文に背景の色が入っている |');
  md.push('| NovelAI | 英語（タグに直してもよい）＋否定 | SDXL と同じ | 画像の透明チャンネルに情報が入っているので、透明に見えても「背景を抜く」を試す |');
  md.push('');
  md.push('## 2. 枠ごとの指示文');
  md.push('');
  for (const c of CATEGORIES) {
    const list = slots.filter((s) => s.cat === c.id);
    if (!list.length) continue;
    md.push(`- [${c.name}（${list.length}）](#cat-${c.id})`);
  }
  md.push('');
  for (const c of CATEGORIES) {
    const list = slots.filter((s) => s.cat === c.id);
    if (!list.length) continue;
    md.push(`<a id="cat-${c.id}"></a>`);
    md.push(`### ${c.name}（${list.length} 枠）`);
    md.push('');
    if (c.desc) md.push(`${c.desc}。`);
    md.push('');
    const groups = (GROUPS[c.id] || []).filter((g) => list.some((s) => s.group === g.id));
    for (const g of groups.length ? groups : [{ id: null, name: '' }]) {
      const gl = g.id ? list.filter((s) => s.group === g.id) : list;
      if (!gl.length) continue;
      if (g.name) { md.push(`#### ${g.name}`); md.push(''); }
      for (const s of gl) {
        const p = slotPrompt(s);
        md.push(`##### \`${s.id}\` — ${s.label}`);
        md.push('');
        md.push(`- ゲーム内 ${s.w}×${s.h}（比 ${p.aspect}）・基準点 (${s.ax}, ${s.ay})・${FACING[s.facing] || '—'}・背景 ${BG[p.bg] || p.bg}${s.blend === 'lighter' ? '・加算' : ''}${s.fallback?.length ? `・無ければ ${s.fallback.join(' → ')}` : ''}`);
        md.push(`- 作る大きさ: GPT ${p.sizes.gpt}／SDXL ${p.sizes.sdxl}／FLUX ${p.sizes.flux}／Midjourney \`${p.sizes.mj}\`${p.sizeNote ? `（${p.sizeNote}）` : ''}`);
        if (s.note) md.push(`- メモ: ${s.note}`);
        md.push('');
        md.push('```text');
        md.push(p.en);
        md.push('```');
        md.push('');
        md.push('```text');
        md.push(p.ja);
        md.push('```');
        md.push('');
        csv.push([s.id, s.cat, s.group, s.label, s.w, s.h, s.ax, s.ay, s.facing, s.blend || 'source-over', p.bg, p.aspect, p.sizes.gpt, p.sizes.sdxl, p.sizes.flux, p.sizes.mj, p.en, p.ja, p.mj, p.neg, s.note || '']);
      }
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'AI_PROMPTS.md');
  const csvPath = path.join(outDir, 'AI_PROMPTS.csv');
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`);
  // Excel で文字化けしないように BOM をつける
  fs.writeFileSync(csvPath, `﻿${csv.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`);
  if (!quiet) console.log(`枠 ${slots.length} 個 → ${path.relative(process.cwd(), mdPath)}（${kb(mdPath)}）・${path.relative(process.cwd(), csvPath)}（${kb(csvPath)}）`);
  return { slots: slots.length, mdPath, csvPath, rows: csv.length - 1 };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function kb(p) { return `${Math.round(fs.statSync(p).size / 1024)} KB`; }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--out');
  genPrompts({ outDir: i > 0 ? path.resolve(process.argv[i + 1]) : undefined }).catch((e) => { console.error(e); process.exit(1); });
}
